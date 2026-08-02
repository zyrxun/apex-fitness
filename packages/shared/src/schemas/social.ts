import { z } from 'zod';
import { uuidSchema } from './common.js';
import { REPORT_REASONS, REPORT_STATUSES } from '../enums.js';

export const relationshipEntrySchema = z.object({
  userId: uuidSchema,
  displayName: z.string().nullable(),
  createdAt: z.string(),
});

export const relationshipListResponseSchema = z.object({
  entries: z.array(relationshipEntrySchema),
});

export const createReportBodySchema = z.object({
  targetUserId: uuidSchema,
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(2000).optional(),
});
export type CreateReportBody = z.infer<typeof createReportBodySchema>;

export const reportSchema = z.object({
  id: uuidSchema,
  reporterUserId: uuidSchema,
  targetUserId: uuidSchema,
  reason: z.enum(REPORT_REASONS),
  details: z.string().nullable(),
  status: z.enum(REPORT_STATUSES),
  createdAt: z.string(),
});
