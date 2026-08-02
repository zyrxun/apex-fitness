import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { sessions, users } from '../db/schema.js';
import { generateOpaqueToken, hashToken, newId } from '../lib/crypto.js';
import { signAccessToken } from '../lib/jwt.js';
import { secondsFromNow } from '../lib/time.js';
import { unauthorized } from '../lib/errors.js';

export interface DeviceInfo {
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  sessionId: string;
}

async function mintPair(
  ctx: AppContext,
  args: {
    userId: string;
    region: string;
    familyId: string;
    familyCreatedAt: Date;
    parentId: string | null;
    device: DeviceInfo;
  },
): Promise<IssuedTokens> {
  const refreshToken = generateOpaqueToken();
  const sessionId = newId();
  await ctx.db.insert(sessions).values({
    id: sessionId,
    userId: args.userId,
    familyId: args.familyId,
    familyCreatedAt: args.familyCreatedAt,
    refreshTokenHash: hashToken(refreshToken),
    parentId: args.parentId,
    expiresAt: secondsFromNow(ctx.config.refreshTokenTtlSeconds),
    userAgent: args.device.userAgent ?? null,
    ip: args.device.ip ?? null,
  });

  const accessToken = await signAccessToken(
    { sub: args.userId, region: args.region, sid: sessionId },
    ctx.config.JWT_SECRET,
    ctx.config.accessTokenTtlSeconds,
  );

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: ctx.config.accessTokenTtlSeconds,
    sessionId,
  };
}

export function startSession(
  ctx: AppContext,
  user: { id: string; region: string },
  device: DeviceInfo,
): Promise<IssuedTokens> {
  return mintPair(ctx, {
    userId: user.id,
    region: user.region,
    familyId: newId(),
    familyCreatedAt: new Date(),
    parentId: null,
    device,
  });
}

export async function revokeFamily(ctx: AppContext, familyId: string, reason: string) {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason, updatedAt: new Date() })
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
}

export async function revokeAllForUser(ctx: AppContext, userId: string, reason: string) {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason, updatedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Rotation with reuse detection: presenting an already-rotated (revoked) token
 * means the token leaked, so the entire family is burned rather than just the
 * replayed link.
 */
export async function rotateRefreshToken(
  ctx: AppContext,
  refreshToken: string,
  device: DeviceInfo,
): Promise<IssuedTokens> {
  const tokenHash = hashToken(refreshToken);
  const [row] = await ctx.db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, tokenHash))
    .limit(1);

  if (!row) throw unauthorized('invalid_refresh_token', 'Refresh token is not recognised');

  if (row.revokedAt) {
    await revokeFamily(ctx, row.familyId, 'refresh_token_reuse');
    throw unauthorized('refresh_token_reused', 'Refresh token replay detected; session revoked');
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('refresh_token_expired', 'Refresh token has expired');
  }

  const [owner] = await ctx.db
    .select({ region: users.region, status: users.status })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!owner || owner.status !== 'active') {
    await revokeFamily(ctx, row.familyId, 'account_inactive');
    throw unauthorized('account_inactive', 'Account is not active');
  }

  await ctx.db
    .update(sessions)
    .set({
      revokedAt: new Date(),
      revokedReason: 'rotated',
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, row.id));

  return mintPair(ctx, {
    userId: row.userId,
    region: owner.region,
    familyId: row.familyId,
    familyCreatedAt: row.familyCreatedAt,
    parentId: row.id,
    device,
  });
}

export async function revokeByRefreshToken(ctx: AppContext, refreshToken: string) {
  const [row] = await ctx.db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, hashToken(refreshToken)))
    .limit(1);
  if (!row) return false;
  await revokeFamily(ctx, row.familyId, 'logout');
  return true;
}

/** Active sessions only — one row per family, so this reads as a device list. */
export async function listActiveSessions(ctx: AppContext, userId: string) {
  return ctx.db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessions.familyCreatedAt));
}

export async function getSessionById(ctx: AppContext, userId: string, sessionId: string) {
  const [row] = await ctx.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return row ?? null;
}
