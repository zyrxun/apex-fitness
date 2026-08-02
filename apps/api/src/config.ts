import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOTP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  TOTP_ISSUER: z.string().default('Apex Fitness'),

  MAIL_TRANSPORT: z.enum(['console', 'noop', 'memory']).default('console'),
  MAIL_FROM: z.string().default('no-reply@apexfitness.example'),

  DEFAULT_REGION: z.string().default('global'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),

  // How uploaded activities reach the processing pipeline. `serial` is the
  // in-process worker; `inline` runs the pipeline inside the request. Swapping
  // in Redis/BullMQ (Phase 3) adds a value here and nothing else.
  ACTIVITY_QUEUE_MODE: z.enum(['serial', 'inline']).default('serial'),

  // Sign in with Apple. Without APPLE_BUNDLE_ID the route keeps returning
  // 501 oauth_not_configured, so the feature is opt-in per deployment.
  APPLE_BUNDLE_ID: z.string().min(1).optional(),
  APPLE_AUDIENCES: z.string().optional(),
  // Overridable so tests can point at a local JWKS instead of the internet.
  APPLE_JWKS_URL: z.string().default('https://appleid.apple.com/auth/keys'),

  RATE_LIMIT_DISABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),

  // Dev/test only: surfaces email tokens in API responses so flows are
  // exercisable without an inbox. Force-disabled in production below.
  EXPOSE_DEV_TOKENS: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppConfig = Readonly<
  z.infer<typeof envSchema> & {
    isProduction: boolean;
    isTest: boolean;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    appleAudiences: readonly string[];
  }
>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = parsed.data;
  const isProduction = value.NODE_ENV === 'production';

  // The bundle id is the native app's audience and the on/off switch for the
  // whole feature; APPLE_AUDIENCES adds the web Services ID (and any second
  // bundle id) once those flows exist.
  const appleAudiences = value.APPLE_BUNDLE_ID
    ? [
        ...new Set(
          [value.APPLE_BUNDLE_ID, ...(value.APPLE_AUDIENCES?.split(',') ?? [])]
            .map((a) => a.trim())
            .filter(Boolean),
        ),
      ]
    : [];

  return Object.freeze({
    ...value,
    EXPOSE_DEV_TOKENS: isProduction ? false : value.EXPOSE_DEV_TOKENS,
    isProduction,
    isTest: value.NODE_ENV === 'test',
    accessTokenTtlSeconds: value.ACCESS_TOKEN_TTL_MINUTES * 60,
    refreshTokenTtlSeconds: value.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    appleAudiences: Object.freeze(appleAudiences),
  });
}
