import { and, eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AppleSignInBody } from '@apex/shared';
import type { AppContext } from '../context.js';
import type { DbTransaction } from '../db/client.js';
import { identities, users } from '../db/schema.js';
import { newId } from '../lib/crypto.js';
import { badRequest, forbidden, notImplemented, unauthorized } from '../lib/errors.js';
import { createUserCore, findUserByEmail, type UserRow } from './users.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
const PRIVATE_RELAY_DOMAIN = '@privaterelay.appleid.com';

export interface AppleIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

// createRemoteJWKSet already caches keys and refetches when a token carries an
// unknown kid (Apple rotates), but only per instance — so one instance per URL,
// held for the process lifetime. Keyed by URL because tests point the config at
// a local server.
const jwkSets = new Map<string, JWTVerifyGetKey>();

function appleJwks(url: string): JWTVerifyGetKey {
  let set = jwkSets.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
    jwkSets.set(url, set);
  }
  return set;
}

/** Apple sends booleans as JSON strings on some flows and as booleans on others. */
const claimIsTrue = (value: unknown): boolean => value === true || value === 'true';

export async function verifyAppleIdentityToken(
  ctx: AppContext,
  identityToken: string,
): Promise<AppleIdentity> {
  if (ctx.config.appleAudiences.length === 0) {
    throw notImplemented(
      'oauth_not_configured',
      'Sign in with Apple requires APPLE_BUNDLE_ID to be configured',
    );
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, appleJwks(ctx.config.APPLE_JWKS_URL), {
      issuer: APPLE_ISSUER,
      audience: [...ctx.config.appleAudiences],
      algorithms: ['RS256'],
      // Apple's tokens live ~10 minutes; capping the age also pins `iat`, which
      // exp alone would not.
      maxTokenAge: '15 minutes',
      clockTolerance: '60s',
    }));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') {
      throw unauthorized('identity_token_expired', 'Apple identity token has expired');
    }
    // The jose reason (bad signature, wrong audience, wrong issuer…) is safe to
    // surface and saves a support round-trip.
    throw unauthorized(
      'invalid_identity_token',
      `Apple identity token could not be verified${code ? ` (${code})` : ''}`,
    );
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw unauthorized('invalid_identity_token', 'Apple identity token carries no subject');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  return {
    subject: payload.sub,
    email,
    emailVerified: claimIsTrue(payload.email_verified),
    isPrivateEmail:
      claimIsTrue(payload.is_private_email) || (email?.endsWith(PRIVATE_RELAY_DOMAIN) ?? false),
  };
}

function displayNameFor(identity: AppleIdentity, fullName: AppleSignInBody['fullName']): string {
  const given = fullName?.givenName?.trim() ?? '';
  const family = fullName?.familyName?.trim() ?? '';
  const fromApple = [given, family].filter(Boolean).join(' ');
  if (fromApple.length >= 2) return fromApple.slice(0, 50);

  const localPart = identity.email
    ?.split('@')[0]
    ?.replace(/[._-]+/g, ' ')
    .trim();
  if (localPart && localPart.length >= 2 && !identity.isPrivateEmail) return localPart.slice(0, 50);
  return 'Apex Athlete';
}

const identityValues = (userId: string, identity: AppleIdentity) => ({
  id: newId(),
  userId,
  provider: 'apple' as const,
  providerSubject: identity.subject,
  email: identity.email,
  isPrivateEmail: identity.isPrivateEmail,
});

export interface AppleAccount {
  user: UserRow;
  created: boolean;
}

/**
 * Three cases, in order: known identity, verified email matching a local
 * account (Apple vouches for the address, so linking is safe), or a brand new
 * passwordless account.
 */
export async function resolveAppleAccount(
  ctx: AppContext,
  identity: AppleIdentity,
  fullName?: AppleSignInBody['fullName'],
): Promise<AppleAccount> {
  const [existing] = await ctx.db
    .select()
    .from(identities)
    .where(and(eq(identities.provider, 'apple'), eq(identities.providerSubject, identity.subject)))
    .limit(1);

  if (existing) {
    const [user] = await ctx.db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
    if (!user || user.status !== 'active') {
      throw forbidden('account_inactive', 'This account is deactivated or deleted');
    }

    // Relay aliases change when the user turns forwarding off and on again, so
    // the identity row tracks the latest address. The profile name is never
    // touched: Apple only ever sends it once and we already stored it.
    if (identity.email && identity.email !== existing.email) {
      await ctx.db
        .update(identities)
        .set({
          email: identity.email,
          isPrivateEmail: identity.isPrivateEmail,
          updatedAt: new Date(),
        })
        .where(eq(identities.id, existing.id));
    }

    return { user, created: false };
  }

  if (identity.email && identity.emailVerified) {
    const byEmail = await findUserByEmail(ctx, identity.email);
    if (byEmail) {
      if (byEmail.status !== 'active') {
        throw forbidden('account_inactive', 'This account is deactivated or deleted');
      }
      await ctx.db.insert(identities).values(identityValues(byEmail.id, identity));
      if (!byEmail.emailVerifiedAt) {
        // Apple asserted the address, which is at least as strong as our own
        // click-the-link verification.
        const emailVerifiedAt = new Date();
        await ctx.db
          .update(users)
          .set({ emailVerifiedAt, updatedAt: emailVerifiedAt })
          .where(eq(users.id, byEmail.id));
        return { user: { ...byEmail, emailVerifiedAt }, created: false };
      }
      return { user: byEmail, created: false };
    }
  }

  if (!identity.email) {
    throw badRequest(
      'apple_email_missing',
      'Apple did not release an email address for this account; sign in again and allow email sharing',
    );
  }

  const user = await createUserCore(
    ctx,
    {
      email: identity.email,
      displayName: displayNameFor(identity, fullName),
      emailVerifiedAt: identity.emailVerified ? new Date() : undefined,
    },
    async (tx: DbTransaction, created) => {
      await tx.insert(identities).values(identityValues(created.id, identity));
    },
  );

  return { user, created: true };
}
