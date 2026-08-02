import { eq, and } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import type { DbTransaction } from '../db/client.js';
import { credentials, privacySettings, profiles, users } from '../db/schema.js';
import { hashPassword, newId } from '../lib/crypto.js';
import { conflict } from '../lib/errors.js';
import type { Sex, SignupBody, UnitSystem } from '@apex/shared';

export type UserRow = typeof users.$inferSelect;

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

export interface CreateUserInput {
  email: string;
  displayName: string;
  sex?: Sex;
  dateOfBirth?: string;
  units?: UnitSystem;
  /** Omitted for provider-only (passwordless) accounts — no credentials row. */
  passwordHash?: string;
  emailVerifiedAt?: Date;
}

/**
 * Account creation is transactional: a user without a profile + privacy row
 * would be a half-created account with no privacy defaults, which is the one
 * state we must never be in. `link` runs inside the same transaction so a
 * provider identity is written atomically with the account it belongs to.
 */
export async function createUserCore(
  ctx: AppContext,
  input: CreateUserInput,
  link?: (tx: DbTransaction, user: UserRow) => Promise<void>,
): Promise<UserRow> {
  const existing = await findUserByEmail(ctx, input.email);
  if (existing) throw conflict('email_taken', 'An account with that email already exists');

  const userId = newId();

  return ctx.db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        id: userId,
        email: input.email,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
        region: ctx.config.DEFAULT_REGION,
      })
      .returning();

    if (input.passwordHash)
      await tx.insert(credentials).values({ userId, passwordHash: input.passwordHash });
    await tx.insert(profiles).values({
      userId,
      displayName: input.displayName,
      sex: input.sex ?? 'unspecified',
      dateOfBirth: input.dateOfBirth ?? null,
      units: input.units ?? 'metric',
    });
    // Defaults live in the schema (followers-not-public); inserting bare keeps
    // one source of truth for the privacy posture.
    await tx.insert(privacySettings).values({ userId });

    await link?.(tx, user!);

    return user!;
  });
}

export async function createUserAccount(ctx: AppContext, body: SignupBody) {
  return createUserCore(ctx, { ...body, passwordHash: await hashPassword(body.password) });
}

export async function getPasswordHash(ctx: AppContext, userId: string) {
  const [row] = await ctx.db
    .select()
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  return row?.passwordHash ?? null;
}
