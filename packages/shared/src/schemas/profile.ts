import { z } from 'zod';
import { uuidSchema } from './common.js';
import { SEXES, UNIT_SYSTEMS } from '../enums.js';

export const profileSchema = z.object({
  userId: uuidSchema,
  displayName: z.string(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  sex: z.enum(SEXES),
  dateOfBirth: z.string().nullable(),
  units: z.enum(UNIT_SYSTEMS),
  quietMode: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileBodySchema = z
  .object({
    displayName: z.string().trim().min(2).max(50),
    bio: z.string().max(500).nullable(),
    photoUrl: z.url().max(2000).nullable(),
    sex: z.enum(SEXES),
    dateOfBirth: z.iso.date().nullable(),
    units: z.enum(UNIT_SYSTEMS),
    quietMode: z.boolean(),
  })
  .partial();
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

export const massUnitSchema = z.enum(['kg', 'lb']);

export const createBodyweightBodySchema = z.object({
  weight: z.number().positive().max(1000),
  unit: massUnitSchema.default('kg'),
  measuredAt: z.iso.datetime().optional().describe('UTC ISO-8601; defaults to now'),
  note: z.string().max(280).optional(),
});
export type CreateBodyweightBody = z.infer<typeof createBodyweightBodySchema>;

export const bodyweightEntrySchema = z.object({
  id: uuidSchema,
  measuredAt: z.string(),
  weightKg: z.number(),
  weight: z.number().describe("Same measurement in the profile's preferred unit"),
  unit: massUnitSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const bodyweightListResponseSchema = z.object({
  entries: z.array(bodyweightEntrySchema),
  nextCursor: z.string().nullable(),
});

export const publicUserSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  sex: z.enum(SEXES).nullable(),
  quietMode: z.boolean(),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;
