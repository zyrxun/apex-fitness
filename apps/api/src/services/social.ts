import { and, eq, or } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { blocks, mutes } from '../db/schema.js';

/**
 * Blocking is symmetric for visibility purposes: neither side can see the
 * other, regardless of who pressed the button.
 */
export async function blockExistsEitherWay(
  ctx: AppContext,
  a: string,
  b: string,
): Promise<boolean> {
  const rows = await ctx.db
    .select({ userId: blocks.userId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.userId, a), eq(blocks.targetUserId, b)),
        and(eq(blocks.userId, b), eq(blocks.targetUserId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function setBlock(ctx: AppContext, userId: string, targetUserId: string) {
  await ctx.db
    .insert(blocks)
    .values({ userId, targetUserId })
    .onConflictDoNothing({ target: [blocks.userId, blocks.targetUserId] });
}

export async function removeBlock(ctx: AppContext, userId: string, targetUserId: string) {
  await ctx.db
    .delete(blocks)
    .where(and(eq(blocks.userId, userId), eq(blocks.targetUserId, targetUserId)));
}

export async function setMute(ctx: AppContext, userId: string, targetUserId: string) {
  await ctx.db
    .insert(mutes)
    .values({ userId, targetUserId })
    .onConflictDoNothing({ target: [mutes.userId, mutes.targetUserId] });
}

export async function removeMute(ctx: AppContext, userId: string, targetUserId: string) {
  await ctx.db
    .delete(mutes)
    .where(and(eq(mutes.userId, userId), eq(mutes.targetUserId, targetUserId)));
}
