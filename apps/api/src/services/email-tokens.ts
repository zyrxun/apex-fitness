import { and, eq, isNull } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { emailTokens } from '../db/schema.js';
import { generateOpaqueToken, hashToken, newId } from '../lib/crypto.js';
import { secondsFromNow } from '../lib/time.js';
import type { EmailTokenPurpose } from '@apex/shared';

const TTL_SECONDS: Record<EmailTokenPurpose, number> = {
  verify_email: 24 * 60 * 60,
  reset_password: 60 * 60,
};

export async function issueEmailToken(
  ctx: AppContext,
  userId: string,
  purpose: EmailTokenPurpose,
): Promise<string> {
  // Supersede outstanding tokens of the same purpose so a password-reset link
  // can never be resurrected after a newer one is requested.
  await ctx.db
    .update(emailTokens)
    .set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(emailTokens.userId, userId),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.consumedAt),
      ),
    );

  const token = generateOpaqueToken();
  await ctx.db.insert(emailTokens).values({
    id: newId(),
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: secondsFromNow(TTL_SECONDS[purpose]),
  });
  return token;
}

export async function consumeEmailToken(
  ctx: AppContext,
  token: string,
  purpose: EmailTokenPurpose,
): Promise<string | null> {
  const [row] = await ctx.db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, hashToken(token)), eq(emailTokens.purpose, purpose)))
    .limit(1);

  if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) return null;

  await ctx.db
    .update(emailTokens)
    .set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(eq(emailTokens.id, row.id));

  return row.userId;
}
