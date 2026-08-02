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
