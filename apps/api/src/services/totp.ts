import { and, eq, isNull } from 'drizzle-orm';
import { generate, generateSecret, generateURI, verify } from 'otplib';
import type { AppContext } from '../context.js';
import { recoveryCodes, totpCredentials } from '../db/schema.js';
import {
  generateRecoveryCode,
  hashToken,
  newId,
  normalizeRecoveryCode,
  openSecret,
  sealSecret,
} from '../lib/crypto.js';

const RECOVERY_CODE_COUNT = 10;
// One 30s step of clock skew in either direction.
const EPOCH_TOLERANCE_SECONDS = 30;

export async function getTotp(ctx: AppContext, userId: string) {
  const [row] = await ctx.db
    .select()
    .from(totpCredentials)
    .where(eq(totpCredentials.userId, userId))
    .limit(1);
  return row ?? null;
}

export const isTotpEnabled = (row: { enabledAt: Date | null } | null): boolean =>
  Boolean(row?.enabledAt);

export async function enrollTotp(ctx: AppContext, userId: string, email: string) {
  const secret = generateSecret();
  const sealed = sealSecret(secret, ctx.config.TOTP_ENCRYPTION_KEY);
  const values = {
    userId,
    secretCiphertext: sealed.ciphertext,
    secretIv: sealed.iv,
    secretTag: sealed.tag,
    enabledAt: null,
    updatedAt: new Date(),
  };

  await ctx.db
    .insert(totpCredentials)
    .values(values)
    .onConflictDoUpdate({ target: totpCredentials.userId, set: values });

  const otpauthUrl = generateURI({
    issuer: ctx.config.TOTP_ISSUER,
    label: email,
    secret,
  });

  return { secret, otpauthUrl };
}

function unsealSecret(
  ctx: AppContext,
  row: { secretCiphertext: string; secretIv: string; secretTag: string },
): string {
  return openSecret(
    { ciphertext: row.secretCiphertext, iv: row.secretIv, tag: row.secretTag },
    ctx.config.TOTP_ENCRYPTION_KEY,
  );
}

export async function verifyTotpCode(
  ctx: AppContext,
  userId: string,
  code: string,
): Promise<boolean> {
  const row = await getTotp(ctx, userId);
  if (!row) return false;
  try {
    // The same field carries recovery codes at the MFA step, so a
    // non-numeric token here is an expected input, not an error.
    const result = await verify({
      secret: unsealSecret(ctx, row),
      token: code.trim(),
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

/** Test/dev helper: derive the current code for a user's enrolled secret. */
export async function currentTotpCode(ctx: AppContext, userId: string): Promise<string | null> {
  const row = await getTotp(ctx, userId);
  if (!row) return null;
  return generate({ secret: unsealSecret(ctx, row) });
}

export async function confirmTotp(ctx: AppContext, userId: string): Promise<string[]> {
  await ctx.db
    .update(totpCredentials)
    .set({ enabledAt: new Date(), updatedAt: new Date() })
    .where(eq(totpCredentials.userId, userId));

  await ctx.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await ctx.db.insert(recoveryCodes).values(
    codes.map((code) => ({
      id: newId(),
      userId,
      codeHash: hashToken(normalizeRecoveryCode(code)),
    })),
  );
  return codes;
}

export async function consumeRecoveryCode(
  ctx: AppContext,
  userId: string,
  code: string,
): Promise<boolean> {
  const codeHash = hashToken(normalizeRecoveryCode(code));
  const updated = await ctx.db
    .update(recoveryCodes)
    .set({ usedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, codeHash),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });
  return updated.length > 0;
}

export async function disableTotp(ctx: AppContext, userId: string) {
  await ctx.db.delete(totpCredentials).where(eq(totpCredentials.userId, userId));
  await ctx.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
}
