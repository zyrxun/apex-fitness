import { z } from 'zod';

export const uuidSchema = z.uuid();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .describe('Email address; stored lowercased and unique');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .describe('Plaintext password; hashed with argon2id server-side, never stored');

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional().describe('Opaque cursor from a previous page'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });

export const idParamSchema = z.object({ id: uuidSchema });
export const userIdParamSchema = z.object({ userId: uuidSchema });
