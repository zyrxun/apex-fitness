import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createPrivacyZoneBodySchema,
  errorResponseSchema,
  idParamSchema,
  okResponseSchema,
  privacySettingsSchema,
  privacyZoneListResponseSchema,
  privacyZoneSchema,
  updatePrivacyBodySchema,
  updatePrivacyZoneBodySchema,
} from '@apex/shared';
import { privacySettings, privacyZones } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { isoRequired } from '../lib/time.js';

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
};

const privacyRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  const serializeSettings = (row: typeof privacySettings.$inferSelect) => ({
    userId: row.userId,
    defaultActivityVisibility: row.defaultActivityVisibility,
    profileVisibility: row.profileVisibility,
    hideWeight: row.hideWeight,
    hidePace: row.hidePace,
    hideHeartrate: row.hideHeartrate,
    aggregateOptIn: row.aggregateOptIn,
    updatedAt: isoRequired(row.updatedAt),
  });

  const serializeZone = (row: typeof privacyZones.$inferSelect) => ({
    id: row.id,
    label: row.label,
    centerLat: row.centerLat,
    centerLng: row.centerLng,
    radiusM: row.radiusM,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  });

  app.get(
    '/privacy',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['privacy'],
        summary: 'Own privacy settings',
        security: [{ bearerAuth: [] }],
        response: { 200: privacySettingsSchema, ...errorResponses },
      },
    },
    async (request) => {
      const [row] = await ctx.db
        .select()
        .from(privacySettings)
        .where(eq(privacySettings.userId, request.auth!.userId))
        .limit(1);
      if (!row) throw notFound('privacy_not_found', 'Privacy settings not found');
      return serializeSettings(row);
    },
  );

  app.patch(
    '/privacy',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['privacy'],
        summary: 'Partially update privacy settings',
        security: [{ bearerAuth: [] }],
        body: updatePrivacyBodySchema,
        response: { 200: privacySettingsSchema, ...errorResponses },
      },
    },
    async (request) => {
      if (Object.keys(request.body).length === 0) {
        throw badRequest('empty_patch', 'Provide at least one field to update');
      }
      const [row] = await ctx.db
        .update(privacySettings)
        .set({ ...request.body, updatedAt: new Date() })
        .where(eq(privacySettings.userId, request.auth!.userId))
        .returning();
      if (!row) throw notFound('privacy_not_found', 'Privacy settings not found');
      return serializeSettings(row);
    },
  );

  app.get(
    '/privacy-zones',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['privacy'],
        summary: 'List privacy zones (WGS-84 centres)',
        security: [{ bearerAuth: [] }],
        response: { 200: privacyZoneListResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const rows = await ctx.db
        .select()
        .from(privacyZones)
        .where(eq(privacyZones.userId, request.auth!.userId))
        .orderBy(asc(privacyZones.createdAt));
      return { zones: rows.map(serializeZone) };
    },
  );

  app.post(
    '/privacy-zones',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['privacy'],
        summary: 'Create a privacy zone',
        security: [{ bearerAuth: [] }],
        body: createPrivacyZoneBodySchema,
        response: { 201: privacyZoneSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const [row] = await ctx.db
        .insert(privacyZones)
        .values({ id: newId(), userId: request.auth!.userId, ...request.body })
        .returning();
      return reply.status(201).send(serializeZone(row!));
    },
  );

  app.patch(
    '/privacy-zones/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['privacy'],
        summary: 'Update a privacy zone',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: updatePrivacyZoneBodySchema,
        response: { 200: privacyZoneSchema, ...errorResponses },
      },
    },
    async (request) => {
      if (Object.keys(request.body).length === 0) {
        throw badRequest('empty_patch', 'Provide at least one field to update');
      }
      const [row] = await ctx.db
        .update(privacyZones)
        .set({ ...request.body, updatedAt: new Date() })
        .where(
          and(
            eq(privacyZones.id, request.params.id),
            eq(privacyZones.userId, request.auth!.userId),
          ),
        )
        .returning();
      if (!row) throw notFound('zone_not_found', 'Privacy zone not found');
      return serializeZone(row);
    },
  );

  app.delete(
    '/privacy-zones/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['privacy'],
        summary: 'Delete a privacy zone',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const deleted = await ctx.db
        .delete(privacyZones)
        .where(
          and(
            eq(privacyZones.id, request.params.id),
            eq(privacyZones.userId, request.auth!.userId),
          ),
        )
        .returning({ id: privacyZones.id });
      if (deleted.length === 0) throw notFound('zone_not_found', 'Privacy zone not found');
      return { ok: true as const };
    },
  );
};

export default privacyRoutes;
