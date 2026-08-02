import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { identities, privacySettings, profiles, users } from '../src/db/schema.js';
import { bearer, createHarness, signup, type TestHarness } from './helpers.js';

const BUNDLE_ID = 'com.apexfitness.app';
const KID = 'apex-test-key';

let h: TestHarness;
let unconfigured: TestHarness;
let jwksServer: Server;
let signingKey: CryptoKey;
let otherKey: CryptoKey;

interface TokenOptions {
  sub?: string;
  email?: string | null;
  emailVerified?: unknown;
  isPrivateEmail?: unknown;
  audience?: string;
  issuer?: string;
  expiresInSeconds?: number;
  issuedAtOffsetSeconds?: number;
  key?: CryptoKey;
}

async function appleToken(options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = now + (options.issuedAtOffsetSeconds ?? 0);
  const claims: Record<string, unknown> = {
    // Apple sends these as strings, which is the whole point of testing them.
    email_verified: options.emailVerified ?? 'true',
  };
  if (options.email !== null) claims.email = options.email ?? 'athlete@example.com';
  if (options.isPrivateEmail !== undefined) claims.is_private_email = options.isPrivateEmail;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(options.sub ?? '001234.abcdef.0001')
    .setIssuer(options.issuer ?? 'https://appleid.apple.com')
    .setAudience(options.audience ?? BUNDLE_ID)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (options.expiresInSeconds ?? 600))
    .sign(options.key ?? signingKey);
}

const signIn = (payload: Record<string, unknown>) =>
  h.app.inject({ method: 'POST', url: '/auth/apple', payload });

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256', { extractable: true })).privateKey;

  // Same kid as the real key, so an unknown-kid refetch cannot rescue a token
  // signed by `otherKey` — the signature check has to be what rejects it.
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  jwksServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  const { port } = jwksServer.address() as AddressInfo;

  h = await createHarness({
    env: {
      APPLE_BUNDLE_ID: BUNDLE_ID,
      APPLE_JWKS_URL: `http://127.0.0.1:${port}/auth/keys`,
    },
  });
  unconfigured = await createHarness();
});

afterAll(async () => {
  await h.close();
  await unconfigured.close();
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
});

describe('POST /auth/apple — first sign-in', () => {
  it('creates the user, profile and privacy defaults and captures the one-shot fullName', async () => {
    const sub = '001234.first.0001';
    const email = 'first-timer@example.com';

    const res = await signIn({
      identityToken: await appleToken({ sub, email }),
      authorizationCode: 'c-abc123',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('authenticated');
    expect(body.created).toBe(true);
    expect(body.user.email).toBe(email);
    expect(body.user.emailVerified).toBe(true);
    expect(body.tokens.accessToken).toBeTruthy();

    const userId = body.user.id;
    const [profile] = await h.db.select().from(profiles).where(eq(profiles.userId, userId));
    expect(profile!.displayName).toBe('Ada Lovelace');

    const [privacy] = await h.db
      .select()
      .from(privacySettings)
      .where(eq(privacySettings.userId, userId));
    expect(privacy!.profileVisibility).toBe('followers');
    expect(privacy!.hideWeight).toBe(true);
    expect(privacy!.privacyZonesEnabled).toBe(true);

    const [identity] = await h.db.select().from(identities).where(eq(identities.userId, userId));
    expect(identity!.provider).toBe('apple');
    expect(identity!.providerSubject).toBe(sub);
    expect(identity!.email).toBe(email);
    expect(identity!.isPrivateEmail).toBe(false);

    const [row] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(row!.emailVerifiedAt).not.toBeNull();
  });

  it('issues a session that works against a protected route', async () => {
    const res = await signIn({
      identityToken: await appleToken({ sub: '001234.session.0001', email: 'session@example.com' }),
      fullName: { givenName: 'Grace', familyName: 'Hopper' },
    });
    const tokens = res.json().tokens;

    const profile = await h.app.inject({
      method: 'GET',
      url: '/me/profile',
      headers: bearer(tokens.accessToken),
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().displayName).toBe('Grace Hopper');

    const refreshed = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().refreshToken).not.toBe(tokens.refreshToken);
  });

  it('stores a private-relay address as a normal email and flags it', async () => {
    const res = await signIn({
      identityToken: await appleToken({
        sub: '001234.relay.0001',
        email: 'xyz123@privaterelay.appleid.com',
        isPrivateEmail: 'true',
      }),
      fullName: { givenName: 'Relay', familyName: 'User' },
    });
    expect(res.statusCode).toBe(200);

    const [identity] = await h.db
      .select()
      .from(identities)
      .where(eq(identities.providerSubject, '001234.relay.0001'));
    expect(identity!.isPrivateEmail).toBe(true);
    expect(identity!.email).toBe('xyz123@privaterelay.appleid.com');

    const [row] = await h.db.select().from(users).where(eq(users.id, identity!.userId));
    expect(row!.email).toBe('xyz123@privaterelay.appleid.com');
  });
});

describe('POST /auth/apple — returning sign-in', () => {
  it('reuses the account and never overwrites the stored name', async () => {
    const sub = '001234.returning.0001';
    const email = 'returning@example.com';

    const first = await signIn({
      identityToken: await appleToken({ sub, email }),
      fullName: { givenName: 'Katherine', familyName: 'Johnson' },
    });
    expect(first.json().created).toBe(true);
    const userId = first.json().user.id;

    // Apple omits fullName on every authorization after the first; a client that
    // sends a wrong one anyway must not be able to rename the account.
    const second = await signIn({
      identityToken: await appleToken({ sub, email }),
      fullName: { givenName: 'Someone', familyName: 'Else' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().created).toBe(false);
    expect(second.json().user.id).toBe(userId);

    const [profile] = await h.db.select().from(profiles).where(eq(profiles.userId, userId));
    expect(profile!.displayName).toBe('Katherine Johnson');

    const rows = await h.db.select().from(identities).where(eq(identities.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it('links to an existing password account with the same verified email', async () => {
    const local = await signup(h.app);

    const res = await signIn({
      identityToken: await appleToken({ sub: '001234.link.0001', email: local.email }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(false);
    expect(res.json().user.id).toBe(local.id);
    expect(res.json().user.emailVerified).toBe(true);

    const [identity] = await h.db.select().from(identities).where(eq(identities.userId, local.id));
    expect(identity!.providerSubject).toBe('001234.link.0001');

    // The password still works — linking adds a way in, it does not replace one.
    const login = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: local.email, password: local.password },
    });
    expect(login.statusCode).toBe(200);
  });

  it('does not link on an unverified email; it creates a separate account', async () => {
    const local = await signup(h.app);
    const res = await signIn({
      identityToken: await appleToken({
        sub: '001234.unverified.0001',
        email: local.email,
        emailVerified: 'false',
      }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
  });

  it('returns 403 for an identity whose user was deleted', async () => {
    const sub = '001234.deleted.0001';
    const first = await signIn({
      identityToken: await appleToken({ sub, email: 'gone@example.com' }),
      fullName: { givenName: 'Gone', familyName: 'Away' },
    });
    const userId = first.json().user.id;

    await h.db
      .update(users)
      .set({ status: 'deleted', deletedAt: new Date() })
      .where(eq(users.id, userId));

    const again = await signIn({
      identityToken: await appleToken({ sub, email: 'gone@example.com' }),
    });
    expect(again.statusCode).toBe(403);
    expect(again.json().error.code).toBe('account_inactive');
  });
});

describe('POST /auth/apple — token verification', () => {
  it('rejects a token minted for another audience', async () => {
    const res = await signIn({
      identityToken: await appleToken({ sub: '001234.aud.0001', audience: 'com.someone.else' }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_identity_token');
  });

  it('rejects a token from another issuer', async () => {
    const res = await signIn({
      identityToken: await appleToken({ sub: '001234.iss.0001', issuer: 'https://evil.example' }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_identity_token');
  });

  it('rejects an expired token', async () => {
    const res = await signIn({
      identityToken: await appleToken({
        sub: '001234.exp.0001',
        issuedAtOffsetSeconds: -3600,
        expiresInSeconds: 600,
      }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('identity_token_expired');
  });

  it('rejects a token signed by a key Apple does not publish', async () => {
    const res = await signIn({
      identityToken: await appleToken({ sub: '001234.sig.0001', key: otherKey }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_identity_token');
  });

  it('rejects a token with no email when there is nothing to link to', async () => {
    const res = await signIn({
      identityToken: await appleToken({ sub: '001234.noemail.0001', email: null }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('apple_email_missing');
  });

  it('returns 501 when APPLE_BUNDLE_ID is unset', async () => {
    const res = await unconfigured.app.inject({
      method: 'POST',
      url: '/auth/apple',
      payload: { identityToken: await appleToken({ sub: '001234.off.0001' }) },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('oauth_not_configured');
  });
});

describe('passwordless account ergonomics', () => {
  it('tells a passwordless account to use social login instead of "wrong password"', async () => {
    const email = 'passwordless@example.com';
    await signIn({
      identityToken: await appleToken({ sub: '001234.pwless.0001', email }),
      fullName: { givenName: 'Pass', familyName: 'Wordless' },
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'anything-at-all-here' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('use_social_login');
  });

  it('deletes a passwordless account with a fresh identity token instead of a password', async () => {
    const sub = '001234.delete.0001';
    const email = 'delete-me@example.com';
    const created = await signIn({
      identityToken: await appleToken({ sub, email }),
      fullName: { givenName: 'Delete', familyName: 'Me' },
    });
    const { user, tokens } = created.json();

    const noReauth = await h.app.inject({
      method: 'DELETE',
      url: '/me/account',
      headers: bearer(tokens.accessToken),
      payload: { confirm: 'DELETE' },
    });
    expect(noReauth.statusCode).toBe(400);

    const wrongIdentity = await h.app.inject({
      method: 'DELETE',
      url: '/me/account',
      headers: bearer(tokens.accessToken),
      payload: {
        confirm: 'DELETE',
        appleIdentityToken: await appleToken({ sub: '001234.someone.else', email }),
      },
    });
    expect(wrongIdentity.statusCode).toBe(401);
    expect(wrongIdentity.json().error.code).toBe('invalid_credentials');

    const deleted = await h.app.inject({
      method: 'DELETE',
      url: '/me/account',
      headers: bearer(tokens.accessToken),
      payload: { confirm: 'DELETE', appleIdentityToken: await appleToken({ sub, email }) },
    });
    expect(deleted.statusCode).toBe(200);

    const [row] = await h.db.select().from(users).where(eq(users.id, user.id));
    expect(row!.status).toBe('deleted');
    const remaining = await h.db
      .select()
      .from(identities)
      .where(and(eq(identities.provider, 'apple'), eq(identities.providerSubject, sub)));
    expect(remaining).toHaveLength(0);
  });
});

describe('OpenAPI', () => {
  it('documents the real Apple request body', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/docs/json' });
    const schema =
      res.json().paths['/auth/apple'].post.requestBody.content['application/json'].schema;
    expect(Object.keys(schema.properties).sort()).toEqual([
      'authorizationCode',
      'fullName',
      'identityToken',
    ]);
    expect(schema.required).toContain('identityToken');
  });
});
