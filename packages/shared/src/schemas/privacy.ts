import { z } from 'zod';
import { uuidSchema } from './common.js';
import { VISIBILITIES } from '../enums.js';

export const privacySettingsSchema = z.object({
  userId: uuidSchema,
  defaultActivityVisibility: z.enum(VISIBILITIES),
  profileVisibility: z.enum(VISIBILITIES),
  hideWeight: z.boolean(),
  hidePace: z.boolean(),
  hideHeartrate: z.boolean(),
  aggregateOptIn: z.boolean().describe('Opt-in (not opt-out) to aggregate/heatmap-style data'),
  privacyZonesEnabled: z
    .boolean()
    .describe('Master switch: when false, zones are kept but stop redacting activities'),
  updatedAt: z.string(),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const updatePrivacyBodySchema = z
  .object({
    defaultActivityVisibility: z.enum(VISIBILITIES),
    profileVisibility: z.enum(VISIBILITIES),
    hideWeight: z.boolean(),
    hidePace: z.boolean(),
    hideHeartrate: z.boolean(),
    aggregateOptIn: z.boolean(),
    privacyZonesEnabled: z.boolean(),
  })
  .partial();

// WGS-84 is canonical everywhere; a display-layer transform hook (GCJ-02) lands
// with the China fork — see PLAN 4.2.
export const privacyZoneSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  centerLat: z.number(),
  centerLng: z.number(),
  radiusM: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PrivacyZone = z.infer<typeof privacyZoneSchema>;

export const createPrivacyZoneBodySchema = z.object({
  label: z.string().trim().min(1).max(60),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(100).max(5000).default(500),
});

export const updatePrivacyZoneBodySchema = createPrivacyZoneBodySchema.partial();

export const privacyZoneListResponseSchema = z.object({ zones: z.array(privacyZoneSchema) });
