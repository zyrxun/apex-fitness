import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import type { CreateActivityBody, CreateManualActivityBody, StreamType } from '@apex/shared';
import { sportCategory } from '@apex/shared';
import type { AppContext } from '../context.js';
import {
  activities,
  activityEfforts,
  activitySplits,
  activityStreams,
  bodyweightEntries,
  privacySettings,
  profiles,
  swimLengths,
} from '../db/schema.js';
import { newId } from '../lib/crypto.js';
import { runPipeline, type PipelineStreams } from '../processing/pipeline.js';
import type { LatLng } from '../processing/geo.js';
import { loadHrZones } from './hr-zones.js';

export type ActivityRow = typeof activities.$inferSelect;

const yearsSince = (dateOfBirth: string | null): number | null => {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  return (Date.now() - born.getTime()) / (365.2425 * 24 * 3600 * 1000);
};

async function defaultVisibility(ctx: AppContext, userId: string) {
  const [row] = await ctx.db
    .select({ v: privacySettings.defaultActivityVisibility })
    .from(privacySettings)
    .where(eq(privacySettings.userId, userId))
    .limit(1);
  return row?.v ?? 'followers';
}

async function findByUploadId(ctx: AppContext, userId: string, uploadId: string) {
  const [row] = await ctx.db
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.uploadId, uploadId)))
    .limit(1);
  return row ?? null;
}

export interface CreateResult {
  activity: ActivityRow;
  /** False when an existing upload_id resolved to an already-stored activity. */
  created: boolean;
}

/**
 * Idempotent by (user_id, upload_id): a recorder that crashes mid-upload and
 * retries gets the same activity back rather than a duplicate. That is the
 * whole point of the client generating the id — PLAN Phase 2 "crash/kill
 * recovery — never lose a recording".
 */
export async function createRecordedActivity(
  ctx: AppContext,
  userId: string,
  region: string,
  body: CreateActivityBody,
): Promise<CreateResult> {
  const existing = await findByUploadId(ctx, userId, body.uploadId);
  if (existing) return { activity: existing, created: false };

  const visibility = body.visibility ?? (await defaultVisibility(ctx, userId));
  const id = newId();
  const streams = body.streams;

  const inserted = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(activities)
      .values({
        id,
        userId,
        uploadId: body.uploadId,
        sportType: body.sportType,
        name: body.name,
        description: body.description ?? null,
        visibility,
        startedAt: new Date(body.startedAt),
        timezone: body.timezone,
        elapsedS: body.elapsedS,
        // Client aggregates are stored up front so a failed pipeline still
        // leaves a viewable activity rather than an empty shell.
        movingS: body.movingS ?? body.elapsedS,
        distanceM: body.distanceM ?? 0,
        calories: body.calories ?? null,
        poolLengthM: body.poolLengthM ?? null,
        isTrainer: body.isTrainer,
        isIndoor: body.isIndoor,
        deviceName: body.deviceName ?? null,
        sourceApp: body.sourceApp ?? null,
        processingStatus: 'pending',
        privacyFuzzSeed: randomInt(1, 2 ** 31 - 1),
        region,
      })
      .onConflictDoNothing({ target: [activities.userId, activities.uploadId] })
      .returning();

    if (!row) return null;

    if (streams) {
      const rows = Object.entries(streams)
        .filter(([, value]) => Array.isArray(value))
        .map(([type, value]) => ({
          id: newId(),
          activityId: id,
          streamType: type as StreamType,
          sampleCount: (value as unknown[]).length,
          data: value as unknown[],
        }));
      if (rows.length > 0) await tx.insert(activityStreams).values(rows);
    }

    if (body.swimLengths?.length) {
      await tx.insert(swimLengths).values(
        body.swimLengths.map((length, index) => ({
          id: newId(),
          activityId: id,
          index,
          stroke: length.stroke,
          durationS: length.durationS,
          strokeCount: length.strokeCount ?? null,
        })),
      );
    }

    return row;
  });

  // Lost a concurrent race on the same upload_id — the winner's row is canon.
  if (!inserted) {
    const row = await findByUploadId(ctx, userId, body.uploadId);
    if (row) return { activity: row, created: false };
    throw new Error('upload conflict could not be resolved');
  }

  return { activity: inserted, created: true };
}

export async function createManualActivity(
  ctx: AppContext,
  userId: string,
  region: string,
  body: CreateManualActivityBody,
): Promise<ActivityRow> {
  const visibility = body.visibility ?? (await defaultVisibility(ctx, userId));
  const [row] = await ctx.db
    .insert(activities)
    .values({
      id: newId(),
      userId,
      uploadId: null,
      sportType: body.sportType,
      name: body.name,
      description: body.description ?? null,
      visibility,
      startedAt: new Date(body.startedAt),
      timezone: body.timezone,
      elapsedS: body.elapsedS,
      movingS: body.elapsedS,
      distanceM: body.distanceM ?? 0,
      elevGainM: body.elevGainM ?? 0,
      avgSpeedMs:
        body.distanceM && body.elapsedS > 0 ? body.distanceM / body.elapsedS : null,
      avgHr: body.avgHr ?? null,
      calories: body.calories ?? null,
      isManual: true,
      isTrainer: body.isTrainer,
      isIndoor: body.isIndoor,
      deviceName: body.deviceName ?? null,
      sourceApp: body.sourceApp ?? null,
      // No streams to derive anything from, so there is nothing to process.
      processingStatus: 'ready',
      processedAt: new Date(),
      privacyFuzzSeed: randomInt(1, 2 ** 31 - 1),
      region,
    })
    .returning();
  return row!;
}

async function loadStreams(ctx: AppContext, activityId: string) {
  const rows = await ctx.db
    .select()
    .from(activityStreams)
    .where(eq(activityStreams.activityId, activityId));
  return new Map(rows.map((row) => [row.streamType, row.data]));
}

/**
 * The pipeline job. Always resolves: a processing failure is recorded on the
 * activity (status=failed + the message) and the client-supplied aggregates
 * stay visible, because losing a recording to a maths bug is unacceptable.
 */
export async function processActivity(ctx: AppContext, activityId: string): Promise<void> {
  const [activity] = await ctx.db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);
  if (!activity) return;

  try {
    await ctx.db
      .update(activities)
      .set({ processingStatus: 'processing', updatedAt: new Date() })
      .where(eq(activities.id, activityId));

    const [stored, lengths, hrZones, weight, profile] = await Promise.all([
      loadStreams(ctx, activityId),
      ctx.db
        .select()
        .from(swimLengths)
        .where(eq(swimLengths.activityId, activityId))
        .orderBy(swimLengths.index),
      loadHrZones(ctx, activity.userId),
      ctx.db
        .select({ weightKg: bodyweightEntries.weightKg })
        .from(bodyweightEntries)
        .where(eq(bodyweightEntries.userId, activity.userId))
        .orderBy(desc(bodyweightEntries.measuredAt))
        .limit(1),
      ctx.db
        .select({ sex: profiles.sex, dateOfBirth: profiles.dateOfBirth })
        .from(profiles)
        .where(eq(profiles.userId, activity.userId))
        .limit(1),
    ]);

    const time = (stored.get('time') as number[] | undefined) ?? [];
    const pipelineStreams: PipelineStreams | null = time.length
      ? {
          time,
          latlng: stored.get('latlng') as LatLng[] | undefined,
          altitude: stored.get('altitude') as number[] | undefined,
          heartrate: stored.get('heartrate') as number[] | undefined,
          cadence: stored.get('cadence') as number[] | undefined,
          power: stored.get('power') as number[] | undefined,
          velocity: stored.get('velocity') as number[] | undefined,
          temperature: stored.get('temperature') as number[] | undefined,
          moving: stored.get('moving') as boolean[] | undefined,
        }
      : null;

    const result = runPipeline({
      sportType: activity.sportType,
      elapsedS: activity.elapsedS,
      clientDistanceM: activity.distanceM,
      clientMovingS: activity.movingS,
      clientCalories: null,
      poolLengthM: activity.poolLengthM,
      streams: pipelineStreams,
      swimLengths: lengths.map((l) => ({
        stroke: l.stroke,
        durationS: l.durationS,
        strokeCount: l.strokeCount,
      })),
      hrZones,
      athlete: {
        bodyweightKg: weight[0] ? Number(weight[0].weightKg) : null,
        sex: profile[0]?.sex ?? 'unspecified',
        ageYears: yearsSince(profile[0]?.dateOfBirth ?? null),
      },
    });

    await ctx.db.transaction(async (tx) => {
      await tx.delete(activitySplits).where(eq(activitySplits.activityId, activityId));
      await tx.delete(activityEfforts).where(eq(activityEfforts.activityId, activityId));

      const derived: { type: StreamType; data: unknown[] }[] = [];
      if (result.cleanedLatLng) derived.push({ type: 'latlng_clean', data: result.cleanedLatLng });
      if (result.cleanedAltitude)
        derived.push({ type: 'altitude_clean', data: result.cleanedAltitude });

      for (const stream of derived) {
        await tx
          .insert(activityStreams)
          .values({
            id: newId(),
            activityId,
            streamType: stream.type,
            sampleCount: stream.data.length,
            data: stream.data,
          })
          .onConflictDoUpdate({
            target: [activityStreams.activityId, activityStreams.streamType],
            set: { data: stream.data, sampleCount: stream.data.length, updatedAt: new Date() },
          });
      }

      if (result.splits.length > 0) {
        await tx.insert(activitySplits).values(
          result.splits.map((split) => ({
            id: newId(),
            activityId,
            unit: split.unit,
            index: split.index,
            distanceM: split.distanceM,
            elapsedS: split.elapsedS,
            movingS: split.movingS,
            elevGainM: split.elevGainM,
            avgHr: split.avgHr,
            gapS: split.gapS,
          })),
        );
      }

      if (result.efforts.length > 0) {
        await tx.insert(activityEfforts).values(
          result.efforts.map((effort) => ({
            id: newId(),
            activityId,
            userId: activity.userId,
            distanceM: effort.distanceM,
            elapsedS: effort.elapsedS,
            startIndex: effort.startIndex,
            endIndex: effort.endIndex,
            achievedAt: activity.startedAt,
          })),
        );
      }

      await tx
        .update(activities)
        .set({
          distanceM: result.distanceM,
          movingS: result.movingS,
          elevGainM: result.elevGainM,
          elevLossM: result.elevLossM,
          avgSpeedMs: result.avgSpeedMs,
          maxSpeedMs: result.maxSpeedMs,
          avgHr: result.avgHr,
          maxHr: result.maxHr === null ? null : Math.round(result.maxHr),
          avgCadence: result.avgCadence,
          maxCadence: result.maxCadence,
          avgPowerW: result.avgPowerW,
          maxPowerW: result.maxPowerW,
          avgGapSecPerKm: result.avgGapSecPerKm,
          calories: result.calories,
          hrZoneTimes: result.hrZoneTimes,
          avgSwolf: result.avgSwolf,
          totalStrokes: result.totalStrokes,
          startLat: result.startLatLng?.[0] ?? null,
          startLng: result.startLatLng?.[1] ?? null,
          endLat: result.endLatLng?.[0] ?? null,
          endLng: result.endLatLng?.[1] ?? null,
          mapSummary: result.mapSummary,
          processingStatus: 'ready',
          processingError: null,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(activities.id, activityId));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.db
      .update(activities)
      .set({
        processingStatus: 'failed',
        processingError: message.slice(0, 500),
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(activities.id, activityId));
  }
}

export function enqueueProcessing(ctx: AppContext, activityId: string): Promise<void> {
  return ctx.queue.enqueue(activityId, () => processActivity(ctx, activityId));
}

export async function softDeleteActivity(ctx: AppContext, userId: string, activityId: string) {
  const now = new Date();
  const rows = await ctx.db
    .update(activities)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(activities.id, activityId),
        eq(activities.userId, userId),
        isNull(activities.deletedAt),
      ),
    )
    .returning({ id: activities.id });
  return rows.length > 0;
}

export interface PersonalRecord {
  distanceM: number;
  elapsedS: number;
  achievedAt: Date;
  activityId: string;
  activityName: string;
}

/**
 * Current best per distance across every activity the user still owns. Ties go
 * to the earliest attempt — a record you cannot beat, only match, stays yours.
 */
export async function personalRecords(
  ctx: AppContext,
  userId: string,
): Promise<PersonalRecord[]> {
  const rows = await ctx.db
    .select({
      distanceM: activityEfforts.distanceM,
      elapsedS: activityEfforts.elapsedS,
      achievedAt: activityEfforts.achievedAt,
      activityId: activities.id,
      activityName: activities.name,
    })
    .from(activityEfforts)
    .innerJoin(activities, eq(activities.id, activityEfforts.activityId))
    .where(and(eq(activityEfforts.userId, userId), isNull(activities.deletedAt)))
    .orderBy(
      asc(activityEfforts.distanceM),
      asc(activityEfforts.elapsedS),
      asc(activityEfforts.achievedAt),
    );

  const best = new Map<number, PersonalRecord>();
  for (const row of rows) if (!best.has(row.distanceM)) best.set(row.distanceM, row);
  return [...best.values()];
}

export const activityCategory = (row: ActivityRow) => sportCategory(row.sportType);
