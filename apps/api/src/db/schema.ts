import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

// Seam for Apple/Google sign-in. Rows are only written once real provider
// credentials exist; the routes currently return 501.
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProviderEnum('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
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
};

export const nowSql = sql`now()`;
