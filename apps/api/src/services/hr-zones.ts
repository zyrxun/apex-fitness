import { eq } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { hrZoneSettings, profiles } from '../db/schema.js';
import {
  DEFAULT_BOUNDARIES_PCT,
  resolveMaxHr,
  zoneBounds,
  type ResolvedHrZones,
} from '../processing/hr-zones.js';

export interface HrZoneView extends ResolvedHrZones {
  zones: ReturnType<typeof zoneBounds>;
}

/**
 * Rows are created lazily: a user who never touches zone config still gets a
 * usable set from their date of birth, and there is no backfill to run against
 * accounts created before this table existed.
 */
export async function loadHrZones(ctx: AppContext, userId: string): Promise<HrZoneView> {
  const [[settings], [profile]] = await Promise.all([
    ctx.db.select().from(hrZoneSettings).where(eq(hrZoneSettings.userId, userId)).limit(1),
    ctx.db
      .select({ dateOfBirth: profiles.dateOfBirth })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
  ]);

  const { maxHr, source } = resolveMaxHr(settings?.maxHr ?? null, profile?.dateOfBirth ?? null);
  const boundariesPct = settings
    ? [settings.z1Pct, settings.z2Pct, settings.z3Pct, settings.z4Pct, settings.z5Pct]
    : DEFAULT_BOUNDARIES_PCT;

  const resolved: ResolvedHrZones = { maxHr, maxHrSource: source, boundariesPct };
  return { ...resolved, zones: zoneBounds(resolved) };
}

export async function saveHrZones(
  ctx: AppContext,
  userId: string,
  patch: { maxHr?: number | null; boundariesPct?: number[] },
): Promise<HrZoneView> {
  const values: Record<string, unknown> = { userId };
  if (patch.maxHr !== undefined) values.maxHr = patch.maxHr;
  if (patch.boundariesPct) {
    const [z1, z2, z3, z4, z5] = patch.boundariesPct;
    Object.assign(values, { z1Pct: z1, z2Pct: z2, z3Pct: z3, z4Pct: z4, z5Pct: z5 });
  }

  const { userId: _ignored, ...updates } = values;
  await ctx.db
    .insert(hrZoneSettings)
    .values(values as typeof hrZoneSettings.$inferInsert)
    .onConflictDoUpdate({
      target: hrZoneSettings.userId,
      set: { ...updates, updatedAt: new Date() },
    });

  return loadHrZones(ctx, userId);
}
