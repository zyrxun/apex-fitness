export const USER_STATUSES = ['active', 'deactivated', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SEXES = ['male', 'female', 'unspecified'] as const;
export type Sex = (typeof SEXES)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const VISIBILITIES = ['public', 'followers', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const EMAIL_TOKEN_PURPOSES = ['verify_email', 'reset_password'] as const;
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number];

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'impersonation',
  'cheating',
  'inappropriate_content',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const IDENTITY_PROVIDERS = ['apple', 'google'] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export const PROCESSING_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/**
 * `latlng_clean` and `altitude_clean` are pipeline output; every other type is
 * stored exactly as the recorder sent it. All arrays are index-aligned with
 * the `time` stream.
 */
export const STREAM_TYPES = [
  'time',
  'latlng',
  'latlng_clean',
  'altitude',
  'altitude_clean',
  'heartrate',
  'cadence',
  'power',
  'velocity',
  'temperature',
  'moving',
] as const;
export type StreamType = (typeof STREAM_TYPES)[number];

/** Types a client may upload; the `_clean` variants are derived, never posted. */
export const UPLOADABLE_STREAM_TYPES = STREAM_TYPES.filter(
  (t) => !t.endsWith('_clean'),
) as unknown as readonly Exclude<StreamType, 'latlng_clean' | 'altitude_clean'>[];

export const SPLIT_UNITS = ['km', 'mile'] as const;
export type SplitUnit = (typeof SPLIT_UNITS)[number];

export const SWIM_STROKES = [
  'freestyle',
  'backstroke',
  'breaststroke',
  'butterfly',
  'mixed',
  'unknown',
] as const;
export type SwimStroke = (typeof SWIM_STROKES)[number];

/** Best-effort distances tracked for run-category activities (metres). */
export const PR_DISTANCES_M = [1000, 5000, 10000, 21097.5, 42195] as const;
export type PrDistanceM = (typeof PR_DISTANCES_M)[number];
