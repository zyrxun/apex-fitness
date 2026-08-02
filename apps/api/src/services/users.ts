import { eq, and } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { credentials, privacySettings, profiles, users } from '../db/schema.js';
import { hashPassword, newId } from '../lib/crypto.js';
import { conflict } from '../lib/errors.js';
import type { SignupBody } from '@apex/shared';

export async function findUserByEmail(ctx: AppContext, email: string) {
  const [row] = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function findActiveUserById(ctx: AppContext, id: string) {
  const [row] = await ctx.db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.status, 'active')))
    .limit(1);
  return row ?? null;
}

/**
 * Signup is transactional: a user without a profile + privacy row would be a
 * half-created account with no privacy defaults, which is the one state we must
 * never be in.
 */
export async function createUserAccount(ctx: AppContext, body: SignupBody) {
  const existing = await findUserByEmail(ctx, body.email);
  if (existing) throw conflict('email_taken', 'An account with that email already exists');

  const userId = newId();
  const passwordHash = await hashPassword(body.password);

  return ctx.db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ id: userId, email: body.email, region: ctx.config.DEFAULT_REGION })
      .returning();

    await tx.insert(credentials).values({ userId, passwordHash });
    await tx.insert(profiles).values({
      userId,
      displayName: body.displayName,
      sex: body.sex ?? 'unspecified',
      dateOfBirth: body.dateOfBirth ?? null,
      units: body.units ?? 'metric',
    });
    // Defaults live in the schema (followers-not-public); inserting bare keeps
    // one source of truth for the privacy posture.
    await tx.insert(privacySettings).values({ userId });

    return user!;
  });
}

export async function getPasswordHash(ctx: AppContext, userId: string) {
  const [row] = await ctx.db
    .select()
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  return row?.passwordHash ?? null;
}
