import { z } from 'zod';
import { emailSchema, passwordSchema, uuidSchema } from './common.js';
import { IDENTITY_PROVIDERS, SEXES, UNIT_SYSTEMS } from '../enums.js';

export const signupBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(50),
  sex: z.enum(SEXES).optional(),
  dateOfBirth: z.iso.date().optional().describe('YYYY-MM-DD; drives age multipliers'),
  units: z.enum(UNIT_SYSTEMS).optional(),
});
export type SignupBody = z.infer<typeof signupBodySchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().describe('Access token lifetime in seconds'),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const authUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  emailVerified: z.boolean(),
  region: z.string(),
});

export const signupResponseSchema = z.object({
  user: authUserSchema,
  tokens: tokenPairSchema,
  // Dev-only convenience so the flow is testable without an inbox.
  verificationToken: z.string().optional(),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const loginResponseSchema = z.union([
  z.object({
    status: z.literal('authenticated'),
    user: authUserSchema,
    tokens: tokenPairSchema,
  }),
  z.object({
    status: z.literal('mfa_required'),
    mfaTicket: z.string(),
    expiresIn: z.number().int(),
  }),
]);

export const mfaVerifyBodySchema = z.object({
  mfaTicket: z.string().min(1),
  code: z.string().min(6).max(20).describe('6-digit TOTP code or a recovery code'),
});

export const refreshBodySchema = z.object({ refreshToken: z.string().min(1) });
export const logoutBodySchema = z.object({ refreshToken: z.string().min(1) });

export const verifyEmailBodySchema = z.object({ token: z.string().min(1) });
export const forgotPasswordBodySchema = z.object({ email: emailSchema });
export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const totpEnrollResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string().describe('otpauth:// URI — render as a QR code client-side'),
});
export const totpConfirmBodySchema = z.object({ code: z.string().min(6).max(10) });
export const totpConfirmResponseSchema = z.object({
  enabled: z.literal(true),
  recoveryCodes: z.array(z.string()).describe('Shown once; stored hashed'),
});
export const totpDisableBodySchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(20).optional(),
});

export const sessionSchema = z.object({
  id: uuidSchema,
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  current: z.boolean(),
});
export const sessionListResponseSchema = z.object({ sessions: z.array(sessionSchema) });

export const oauthStartBodySchema = z.object({
  provider: z.enum(IDENTITY_PROVIDERS),
  idToken: z.string().min(1).optional(),
});
