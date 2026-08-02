import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  numeric,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  PROCESSING_STATUSES,
  SPLIT_UNITS,
  SPORT_TYPES,
  STREAM_TYPES,
  SWIM_STROKES,
} from '@apex/shared';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const userStatusEnum = pgEnum('user_status', ['active', 'deactivated', 'deleted']);
export const sexEnum = pgEnum('sex', ['male', 'female', 'unspecified']);
export const unitSystemEnum = pgEnum('unit_system', ['metric', 'imperial']);
export const visibilityEnum = pgEnum('visibility', ['public', 'followers', 'private']);
export const emailTokenPurposeEnum = pgEnum('email_token_purpose', [
  'verify_email',
  'reset_password',
]);
export const reportReasonEnum = pgEnum('report_reason', [
  'spam',
  'harassment',
  'impersonation',
  'cheating',
  'inappropriate_content',
  'other',
]);
export const reportStatusEnum = pgEnum('report_status', [
  'open',
  'reviewing',
  'actioned',
  'dismissed',
]);
export const identityProviderEnum = pgEnum('identity_provider', ['apple', 'google']);

// Sport taxonomy lives in @apex/shared so the mobile client, the API and the
// database can never disagree about the spelling of a sport (PLAN 4.3).
export const sportTypeEnum = pgEnum('sport_type', SPORT_TYPES);
export const processingStatusEnum = pgEnum('processing_status', PROCESSING_STATUSES);
export const streamTypeEnum = pgEnum('stream_type', STREAM_TYPES);
export const splitUnitEnum = pgEnum('split_unit', SPLIT_UNITS);
export const swimStrokeEnum = pgEnum('swim_stroke', SWIM_STROKES);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    // Lowercased at the edge by the shared email schema; citext avoided so the
    // China fork can run on a Postgres without contrib extensions.
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    // China-fork readiness: region tag on every user-owned row (PLAN 4.2).
    region: text('region').notNull().default('global'),
    status: userStatusEnum('status').notNull().default('active'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email), index('users_region_idx').on(t.region)],
);

export const credentials = pgTable('credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt,
  updatedAt,
});

// Provider-agnostic seam for Apple/Google sign-in. Apple is live; Google still
// returns 501 pending credentials.
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProviderEnum('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    // Address the provider asserted, which may differ from users.email and,
    // for Apple private relay, is an alias that only forwards for this app.
    email: text('email'),
    isPrivateEmail: boolean('is_private_email').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('identities_provider_subject_unique').on(t.provider, t.providerSubject),
    index('identities_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // All rotations of one login share a familyId; replaying a rotated token
    // revokes the whole family.
    familyId: uuid('family_id').notNull(),
    familyCreatedAt: timestamp('family_created_at', { withTimezone: true }).notNull().defaultNow(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    parentId: uuid('parent_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('sessions_refresh_hash_unique').on(t.refreshTokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_family_idx').on(t.familyId),
  ],
);

export const totpCredentials = pgTable('totp_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // AES-256-GCM envelope; key comes from TOTP_ENCRYPTION_KEY.
  secretCiphertext: text('secret_ciphertext').notNull(),
  secretIv: text('secret_iv').notNull(),
  secretTag: text('secret_tag').notNull(),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  createdAt,
  updatedAt,
});

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index('recovery_codes_user_idx').on(t.userId)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('email_tokens_hash_unique').on(t.tokenHash),
    index('email_tokens_user_purpose_idx').on(t.userId, t.purpose),
  ],
);

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  photoUrl: text('photo_url'),
  sex: sexEnum('sex').notNull().default('unspecified'),
  dateOfBirth: date('date_of_birth'),
  units: unitSystemEnum('units').notNull().default('metric'),
  quietMode: boolean('quiet_mode').notNull().default(false),
  createdAt,
  updatedAt,
});

// History, not a single value: strength ranks use bodyweight at time of lift
// (PLAN 4.4). Canonical unit is kg; imperial is converted at the edge.
export const bodyweightEntries = pgTable(
  'bodyweight_entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
    weightKg: numeric('weight_kg', { precision: 6, scale: 3 }).notNull(),
    note: text('note'),
    createdAt,
    updatedAt,
  },
  (t) => [index('bodyweight_user_measured_idx').on(t.userId, t.measuredAt)],
);

export const privacySettings = pgTable('privacy_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  defaultActivityVisibility: visibilityEnum('default_activity_visibility')
    .notNull()
    .default('followers'),
  profileVisibility: visibilityEnum('profile_visibility').notNull().default('followers'),
  // Bodyweight is the most sensitive of the three stat flags, so it starts
  // hidden; pace/HR start visible. Ratchet, not a dark pattern.
  hideWeight: boolean('hide_weight').notNull().default(true),
  hidePace: boolean('hide_pace').notNull().default(false),
  hideHeartrate: boolean('hide_heartrate').notNull().default(false),
  privacyZonesEnabled: boolean('privacy_zones_enabled').notNull().default(true),
  aggregateOptIn: boolean('aggregate_opt_in').notNull().default(false),
  createdAt,
  updatedAt,
});

// Plain lat/lng/radius columns — no PostGIS needed until activity streams get
// geo-fuzzed against these zones in Phase 2.
export const privacyZones = pgTable(
  'privacy_zones',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    centerLat: doublePrecision('center_lat').notNull(),
    centerLng: doublePrecision('center_lng').notNull(),
    radiusM: integer('radius_m').notNull().default(500),
    createdAt,
    updatedAt,
  },
  (t) => [index('privacy_zones_user_idx').on(t.userId)],
);

export const blocks = pgTable(
  'blocks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt,
    updatedAt,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetUserId] }),
    index('blocks_target_idx').on(t.targetUserId),
  ],
);

export const mutes = pgTable(
  'mutes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt,
    updatedAt,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetUserId] }),
    index('mutes_target_idx').on(t.targetUserId),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: reportReasonEnum('reason').notNull(),
    details: text('details'),
    status: reportStatusEnum('status').notNull().default('open'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('reports_target_idx').on(t.targetUserId),
    index('reports_reporter_idx').on(t.reporterUserId),
  ],
);

// Zone boundaries are stored as percentages of max HR so a new max (measured or
// aged into) reshapes every zone without a migration. maxHr null => 220−age.
export const hrZoneSettings = pgTable('hr_zone_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  maxHr: smallint('max_hr'),
  z1Pct: smallint('z1_pct').notNull().default(50),
  z2Pct: smallint('z2_pct').notNull().default(60),
  z3Pct: smallint('z3_pct').notNull().default(70),
  z4Pct: smallint('z4_pct').notNull().default(80),
  z5Pct: smallint('z5_pct').notNull().default(90),
  createdAt,
  updatedAt,
});

export interface HrZoneBucket {
  zone: number;
  minBpm: number;
  maxBpm: number | null;
  seconds: number;
}

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Client-generated and unique per user: the idempotency key that makes a
    // retried upload after a crash resolve to the same activity.
    uploadId: uuid('upload_id'),
    sportType: sportTypeEnum('sport_type').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // Snapshotted from privacy_settings at creation, not resolved at read time:
    // changing the default later must not retroactively expose old activities.
    visibility: visibilityEnum('visibility').notNull().default('followers'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    elapsedS: integer('elapsed_s').notNull().default(0),
    movingS: integer('moving_s').notNull().default(0),
    distanceM: doublePrecision('distance_m').notNull().default(0),
    elevGainM: doublePrecision('elev_gain_m').notNull().default(0),
    elevLossM: doublePrecision('elev_loss_m').notNull().default(0),
    avgSpeedMs: doublePrecision('avg_speed_ms'),
    maxSpeedMs: doublePrecision('max_speed_ms'),
    avgHr: real('avg_hr'),
    maxHr: smallint('max_hr'),
    avgCadence: real('avg_cadence'),
    maxCadence: real('max_cadence'),
    avgPowerW: real('avg_power_w'),
    maxPowerW: real('max_power_w'),
    avgGapSecPerKm: doublePrecision('avg_gap_sec_per_km'),
    calories: integer('calories'),
    hrZoneTimes: jsonb('hr_zone_times').$type<HrZoneBucket[]>(),
    avgSwolf: real('avg_swolf'),
    totalStrokes: integer('total_strokes'),
    poolLengthM: doublePrecision('pool_length_m'),
    isManual: boolean('is_manual').notNull().default(false),
    isTrainer: boolean('is_trainer').notNull().default(false),
    isIndoor: boolean('is_indoor').notNull().default(false),
    deviceName: text('device_name'),
    sourceApp: text('source_app'),
    processingStatus: processingStatusEnum('processing_status').notNull().default('pending'),
    processingError: text('processing_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    startLat: doublePrecision('start_lat'),
    startLng: doublePrecision('start_lng'),
    endLat: doublePrecision('end_lat'),
    endLng: doublePrecision('end_lng'),
    // Downsampled [lat,lng] track for map previews. Kept separate from the full
    // stream so privacy-zone redaction of a summary never loads 50k points.
    mapSummary: jsonb('map_summary').$type<[number, number][]>(),
    // Persisted so the random trim beyond a zone edge is identical on every
    // request — a fuzz that changed per response would average out to the
    // true boundary across a handful of fetches.
    privacyFuzzSeed: integer('privacy_fuzz_seed').notNull(),
    region: text('region').notNull().default('global'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('activities_user_upload_unique').on(t.userId, t.uploadId),
    index('activities_user_started_idx').on(t.userId, t.startedAt),
    index('activities_status_idx').on(t.processingStatus),
    index('activities_region_idx').on(t.region),
  ],
);

// One row per (activity, stream type) rather than a column per metric: new
// stream types are an enum value, not a table rewrite.
export const activityStreams = pgTable(
  'activity_streams',
  {
    id: uuid('id').primaryKey(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    streamType: streamTypeEnum('stream_type').notNull(),
    sampleCount: integer('sample_count').notNull(),
    data: jsonb('data').$type<unknown[]>().notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('activity_streams_unique').on(t.activityId, t.streamType)],
);

export const activitySplits = pgTable(
  'activity_splits',
  {
    id: uuid('id').primaryKey(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    unit: splitUnitEnum('unit').notNull(),
    index: integer('index').notNull(),
    distanceM: doublePrecision('distance_m').notNull(),
    elapsedS: doublePrecision('elapsed_s').notNull(),
    movingS: doublePrecision('moving_s').notNull(),
    elevGainM: doublePrecision('elev_gain_m').notNull().default(0),
    avgHr: real('avg_hr'),
    // Grade-adjusted equivalent of elapsedS; run-category sports only.
    gapS: doublePrecision('gap_s'),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('activity_splits_unique').on(t.activityId, t.unit, t.index)],
);

export const swimLengths = pgTable(
  'swim_lengths',
  {
    id: uuid('id').primaryKey(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    stroke: swimStrokeEnum('stroke').notNull().default('unknown'),
    durationS: doublePrecision('duration_s').notNull(),
    strokeCount: integer('stroke_count'),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('swim_lengths_unique').on(t.activityId, t.index)],
);

// Minimal best-effort table; the full PR system (all sports, power curves,
// segment-free bests) matures in Phase 7.
export const activityEfforts = pgTable(
  'activity_efforts',
  {
    id: uuid('id').primaryKey(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    distanceM: doublePrecision('distance_m').notNull(),
    elapsedS: doublePrecision('elapsed_s').notNull(),
    startIndex: integer('start_index').notNull(),
    endIndex: integer('end_index').notNull(),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('activity_efforts_unique').on(t.activityId, t.distanceM),
    index('activity_efforts_user_distance_idx').on(t.userId, t.distanceM, t.elapsedS),
  ],
);

export const schemaTables = {
  users,
  credentials,
  identities,
  sessions,
  totpCredentials,
  recoveryCodes,
  emailTokens,
  profiles,
  bodyweightEntries,
  privacySettings,
  privacyZones,
  blocks,
  mutes,
  reports,
  hrZoneSettings,
  activities,
  activityStreams,
  activitySplits,
  swimLengths,
  activityEfforts,
};

export const nowSql = sql`now()`;
