import { z } from 'zod';
import { uuidSchema } from './common.js';
import {
  PROCESSING_STATUSES,
  SPLIT_UNITS,
  STREAM_TYPES,
  SWIM_STROKES,
  VISIBILITIES,
} from '../enums.js';
import { SPORT_CATEGORIES, SPORT_TYPES } from '../sports.js';

/** Hard ceiling on one upload. ~14h at 1 Hz — beyond that the client decimates. */
export const MAX_STREAM_SAMPLES = 50_000;
export const MAX_SWIM_LENGTHS = 5_000;

export const sportTypeSchema = z.enum(SPORT_TYPES);
export const sportCategorySchema = z.enum(SPORT_CATEGORIES);

const latLngPair = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);

// Uploadable streams only — `latlng_clean`/`altitude_clean` are pipeline output
// and are rejected here rather than silently overwritten.
export const streamsInputSchema = z.object({
  time: z.array(z.number().int().min(0).max(1_000_000)).max(MAX_STREAM_SAMPLES),
  latlng: z.array(latLngPair).max(MAX_STREAM_SAMPLES).optional(),
  altitude: z.array(z.number().min(-500).max(9_000)).max(MAX_STREAM_SAMPLES).optional(),
  heartrate: z.array(z.number().int().min(0).max(300)).max(MAX_STREAM_SAMPLES).optional(),
  cadence: z.array(z.number().min(0).max(300)).max(MAX_STREAM_SAMPLES).optional(),
  power: z.array(z.number().min(0).max(3_000)).max(MAX_STREAM_SAMPLES).optional(),
  velocity: z.array(z.number().min(0).max(200)).max(MAX_STREAM_SAMPLES).optional(),
  temperature: z.array(z.number().min(-80).max(80)).max(MAX_STREAM_SAMPLES).optional(),
  moving: z.array(z.boolean()).max(MAX_STREAM_SAMPLES).optional(),
});
export type StreamsInput = z.infer<typeof streamsInputSchema>;

export const swimLengthInputSchema = z.object({
  stroke: z.enum(SWIM_STROKES).default('unknown'),
  durationS: z.number().min(0.1).max(3_600),
  strokeCount: z.number().int().min(0).max(500).optional(),
});

const activityCoreFields = {
  sportType: sportTypeSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4_000).nullish(),
  startedAt: z.iso.datetime({ offset: true }).describe('ISO-8601; stored UTC'),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .default('UTC')
    .describe('IANA zone name from the recorder, e.g. Pacific/Auckland'),
  visibility: z
    .enum(VISIBILITIES)
    .optional()
    .describe("Defaults to the user's privacy_settings.default_activity_visibility at creation"),
  isTrainer: z.boolean().default(false),
  isIndoor: z.boolean().default(false),
  deviceName: z.string().max(120).nullish(),
  sourceApp: z.string().max(120).nullish(),
};

export const createActivityBodySchema = z
  .object({
    ...activityCoreFields,
    uploadId: uuidSchema.describe(
      'Client-generated; unique per user. Retrying an interrupted upload with the ' +
        'same id returns the original activity instead of creating a duplicate.',
    ),
    elapsedS: z.number().int().min(1).max(604_800),
    movingS: z.number().int().min(0).max(604_800).optional(),
    distanceM: z.number().min(0).max(2_000_000).optional(),
    calories: z.number().int().min(0).max(50_000).optional(),
    poolLengthM: z.number().min(5).max(100).optional(),
    streams: streamsInputSchema.optional(),
    swimLengths: z.array(swimLengthInputSchema).max(MAX_SWIM_LENGTHS).optional(),
  })
  .superRefine((body, ctx) => {
    const at = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    const streams = body.streams;
    if (streams) {
      const n = streams.time.length;
      if (n === 0) at(['streams', 'time'], 'The time stream must not be empty');

      let total = n;
      for (const [key, value] of Object.entries(streams)) {
        if (key === 'time' || value === undefined) continue;
        const arr = value as unknown[];
        total += arr.length;
        if (arr.length !== n) {
          at(
            ['streams', key],
            `Stream "${key}" has ${arr.length} samples but the time stream has ${n}; ` +
              'every stream must be index-aligned with time',
          );
        }
      }
      if (total > MAX_STREAM_SAMPLES * 2) {
        at(['streams'], `Upload exceeds the ${MAX_STREAM_SAMPLES * 2}-sample total ceiling`);
      }

      for (let i = 1; i < n; i += 1) {
        if (streams.time[i]! < streams.time[i - 1]!) {
          at(['streams', 'time', i], 'The time stream must be monotonically non-decreasing');
          break;
        }
      }
    }

    if (body.movingS !== undefined && body.movingS > body.elapsedS) {
      at(['movingS'], 'Moving time cannot exceed elapsed time');
    }
    if (body.swimLengths?.length && body.poolLengthM === undefined) {
      at(['poolLengthM'], 'poolLengthM is required when swimLengths are supplied');
    }
  });
export type CreateActivityBody = z.infer<typeof createActivityBodySchema>;

export const createManualActivityBodySchema = z.object({
  ...activityCoreFields,
  elapsedS: z.number().int().min(1).max(604_800),
  distanceM: z.number().min(0).max(2_000_000).optional(),
  elevGainM: z.number().min(0).max(30_000).optional(),
  calories: z.number().int().min(0).max(50_000).optional(),
  avgHr: z.number().int().min(20).max(250).optional(),
});
export type CreateManualActivityBody = z.infer<typeof createManualActivityBodySchema>;

export const updateActivityBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(4_000).nullable(),
    sportType: sportTypeSchema,
    visibility: z.enum(VISIBILITIES),
    isTrainer: z.boolean(),
  })
  .partial();
export type UpdateActivityBody = z.infer<typeof updateActivityBodySchema>;

export const hrZoneBucketSchema = z.object({
  zone: z.number().int().min(1).max(5),
  minBpm: z.number().int(),
  maxBpm: z.number().int().nullable(),
  seconds: z.number().int(),
});

export const activitySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  uploadId: uuidSchema.nullable(),
  sportType: sportTypeSchema,
  sportCategory: sportCategorySchema,
  name: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(VISIBILITIES),
  startedAt: z.string(),
  timezone: z.string(),
  elapsedS: z.number().int(),
  movingS: z.number().int(),
  distanceM: z.number(),
  elevGainM: z.number(),
  elevLossM: z.number(),
  avgSpeedMs: z.number().nullable(),
  maxSpeedMs: z.number().nullable(),
  avgHr: z.number().nullable(),
  maxHr: z.number().nullable(),
  avgCadence: z.number().nullable(),
  maxCadence: z.number().nullable(),
  avgPowerW: z.number().nullable(),
  maxPowerW: z.number().nullable(),
  avgGapSecPerKm: z.number().nullable().describe('Grade-adjusted pace; run-category only'),
  calories: z.number().int().nullable(),
  hrZoneTimes: z.array(hrZoneBucketSchema).nullable(),
  avgSwolf: z.number().nullable(),
  totalStrokes: z.number().int().nullable(),
  poolLengthM: z.number().nullable(),
  isManual: z.boolean(),
  isTrainer: z.boolean(),
  isIndoor: z.boolean(),
  deviceName: z.string().nullable(),
  sourceApp: z.string().nullable(),
  processingStatus: z.enum(PROCESSING_STATUSES),
  processingError: z.string().nullable(),
  processedAt: z.string().nullable(),
  startLatLng: z.tuple([z.number(), z.number()]).nullable(),
  endLatLng: z.tuple([z.number(), z.number()]).nullable(),
  mapPolyline: z.string().nullable().describe('Encoded polyline, redacted for non-owners'),
  region: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

export const activitySplitSchema = z.object({
  unit: z.enum(SPLIT_UNITS),
  index: z.number().int(),
  distanceM: z.number(),
  elapsedS: z.number(),
  movingS: z.number(),
  elevGainM: z.number(),
  avgHr: z.number().nullable(),
  gapS: z.number().nullable(),
});

export const swimLengthSchema = z.object({
  index: z.number().int(),
  stroke: z.enum(SWIM_STROKES),
  durationS: z.number(),
  strokeCount: z.number().int().nullable(),
});

export const activityDetailSchema = activitySchema.extend({
  splits: z.array(activitySplitSchema),
  swimLengths: z.array(swimLengthSchema),
  isOwner: z.boolean(),
  privacyRedacted: z.boolean().describe('True when privacy zones removed part of the track'),
});

export const activityListResponseSchema = z.object({
  activities: z.array(activitySchema),
  nextCursor: z.string().nullable(),
});

export const activityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional().describe('startedAt of the last row from the previous page'),
  sportCategory: sportCategorySchema.optional(),
  sportType: sportTypeSchema.optional(),
  startedAfter: z.iso.datetime({ offset: true }).optional(),
  startedBefore: z.iso.datetime({ offset: true }).optional(),
});

export const streamsQuerySchema = z.object({
  keys: z
    .string()
    .optional()
    .describe(
      `Comma-separated subset of: ${STREAM_TYPES.join(', ')}. Omit for all stored streams.`,
    ),
});

export const activityStreamsResponseSchema = z.object({
  activityId: uuidSchema,
  privacyRedacted: z.boolean(),
  // Keyed by stream type. Deliberately a loose record rather than an enum-keyed
  // one: only the streams that exist (and that the viewer may see) are present,
  // and an exhaustive key schema would demand all of them.
  streams: z.record(
    z.string(),
    z.object({
      type: z.enum(STREAM_TYPES),
      sampleCount: z.number().int(),
      data: z.array(z.unknown()),
    }),
  ),
});

export const personalRecordSchema = z.object({
  distanceM: z.number(),
  label: z.string(),
  elapsedS: z.number(),
  paceSecPerKm: z.number(),
  activityId: uuidSchema,
  activityName: z.string(),
  achievedAt: z.string(),
});

export const personalRecordsResponseSchema = z.object({ records: z.array(personalRecordSchema) });

export const sportTypeInfoSchema = z.object({
  sportType: sportTypeSchema,
  category: sportCategorySchema,
  hasGps: z.boolean(),
  hasPool: z.boolean(),
  distanceRelevant: z.boolean(),
});

export const sportsResponseSchema = z.object({
  categories: z.array(sportCategorySchema),
  sports: z.array(sportTypeInfoSchema),
});

export const hrZonesSchema = z.object({
  maxHr: z.number().int().describe('Explicit max HR, or the 220−age fallback'),
  maxHrSource: z.enum(['configured', 'age_estimate', 'default']),
  boundariesPct: z.array(z.number().int()).length(5).describe('Lower bound of z1..z5 as % of max'),
  zones: z.array(
    z.object({
      zone: z.number().int(),
      minBpm: z.number().int(),
      maxBpm: z.number().int().nullable(),
    }),
  ),
});

export const updateHrZonesBodySchema = z
  .object({
    maxHr: z.number().int().min(100).max(240).nullable(),
    boundariesPct: z
      .array(z.number().int().min(20).max(100))
      .length(5)
      .refine((b) => b.every((v, i) => i === 0 || v > b[i - 1]!), {
        message: 'Zone boundaries must strictly increase',
      }),
  })
  .partial();
