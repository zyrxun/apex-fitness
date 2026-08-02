import { z } from 'zod';

export const EXPORT_TABLES = [
  'users',
  'identities',
  'profiles',
  'privacy_settings',
  'privacy_zones',
  'bodyweight_entries',
  'sessions',
  'totp_credentials',
  'recovery_codes',
  'email_tokens',
  'blocks',
  'mutes',
  'reports',
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

export const dataExportSchema = z.object({
  exportedAt: z.string(),
  format: z.literal('apex.export.v1'),
  userId: z.string(),
  tables: z.record(z.enum(EXPORT_TABLES), z.array(z.record(z.string(), z.unknown()))),
});
export type DataExport = z.infer<typeof dataExportSchema>;

// Deletion always re-authenticates. Passwordless (Apple) accounts have no
// password to re-enter, so they present a fresh identity token instead —
// otherwise they could never delete themselves.
export const deleteAccountBodySchema = z
  .object({
    password: z.string().min(1).optional(),
    appleIdentityToken: z
      .string()
      .min(1)
      .optional()
      .describe('Fresh Sign in with Apple identity token; used when the account has no password'),
    confirm: z.literal('DELETE').describe('Typed confirmation guard'),
  })
  .refine((body) => Boolean(body.password ?? body.appleIdentityToken), {
    message: 'Either password or appleIdentityToken is required',
    path: ['password'],
  });
