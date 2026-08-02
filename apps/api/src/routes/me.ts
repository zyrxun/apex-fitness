import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  bodyweightListResponseSchema,
  bodyweightEntrySchema,
  createBodyweightBodySchema,
  errorResponseSchema,
  fromCanonicalKg,
  idParamSchema,
  okResponseSchema,
  paginationQuerySchema,
  profileSchema,
  toCanonicalKg,
  updateProfileBodySchema,
} from '@apex/shared';
import { bodyweightEntries, profiles } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { isoRequired } from '../lib/time.js';

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
};

const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  async function loadProfile(userId: string) {
    const [row] = await ctx.db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (!row) throw notFound('profile_not_found', 'Profile not found');
    return row;
  }

  const serializeProfile = (row: Awaited<ReturnType<typeof loadProfile>>) => ({
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio,
    photoUrl: row.photoUrl,
    sex: row.sex,
    dateOfBirth: row.dateOfBirth,
    units: row.units,
    quietMode: row.quietMode,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  });

  app.get(
    '/profile',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['me'],
        summary: 'Own profile',
        security: [{ bearerAuth: [] }],
        response: { 200: profileSchema, ...errorResponses },
      },
    },
    async (request) => serializeProfile(await loadProfile(request.auth!.userId)),
  );

  app.patch(
    '/profile',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['me'],
        summary: 'Partially update the own profile',
        security: [{ bearerAuth: [] }],
        body: updateProfileBodySchema,
        response: { 200: profileSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.auth!.userId;
      const patch = request.body;
      if (Object.keys(patch).length === 0) {
        throw badRequest('empty_patch', 'Provide at least one field to update');
      }
      const [row] = await ctx.db
        .update(profiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(profiles.userId, userId))
        .returning();
      if (!row) throw notFound('profile_not_found', 'Profile not found');
      return serializeProfile(row);
    },
  );

  app.get(
    '/bodyweight',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['me'],
        summary: 'Bodyweight history, newest first, keyset-paginated',
        security: [{ bearerAuth: [] }],
        querystring: paginationQuerySchema,
        response: { 200: bodyweightListResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.auth!.userId;
      const profile = await loadProfile(userId);
      const { limit, cursor } = request.query;

      const cursorDate = cursor ? new Date(cursor) : null;
      if (cursor && Number.isNaN(cursorDate!.getTime())) {
        throw badRequest('invalid_cursor', 'Cursor must be an ISO-8601 timestamp');
      }

      const where = cursorDate
        ? and(eq(bodyweightEntries.userId, userId), lt(bodyweightEntries.measuredAt, cursorDate))
        : eq(bodyweightEntries.userId, userId);

      const rows = await ctx.db
        .select()
        .from(bodyweightEntries)
        .where(where)
        .orderBy(desc(bodyweightEntries.measuredAt), desc(bodyweightEntries.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const nextCursor =
        rows.length > limit && page.length > 0
          ? isoRequired(page[page.length - 1]!.measuredAt)
          : null;

      return {
        entries: page.map((row) => {
          const weightKg = Number(row.weightKg);
          const display = fromCanonicalKg(weightKg, profile.units);
          return {
            id: row.id,
            measuredAt: isoRequired(row.measuredAt),
            weightKg,
            weight: display.value,
            unit: display.unit,
            note: row.note,
            createdAt: isoRequired(row.createdAt),
          };
        }),
        nextCursor,
      };
    },
  );

  app.post(
    '/bodyweight',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['me'],
        summary: 'Record a bodyweight measurement (stored canonically in kg)',
        security: [{ bearerAuth: [] }],
        body: createBodyweightBodySchema,
        response: { 201: bodyweightEntrySchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const userId = request.auth!.userId;
      const profile = await loadProfile(userId);
      const weightKg = toCanonicalKg(request.body.weight, request.body.unit);

      const [row] = await ctx.db
        .insert(bodyweightEntries)
        .values({
          id: newId(),
          userId,
          weightKg: weightKg.toFixed(3),
          measuredAt: request.body.measuredAt ? new Date(request.body.measuredAt) : new Date(),
          note: request.body.note ?? null,
        })
        .returning();

      const stored = Number(row!.weightKg);
      const display = fromCanonicalKg(stored, profile.units);
      return reply.status(201).send({
        id: row!.id,
        measuredAt: isoRequired(row!.measuredAt),
        weightKg: stored,
        weight: display.value,
        unit: display.unit,
        note: row!.note,
        createdAt: isoRequired(row!.createdAt),
      });
    },
  );

  app.delete(
    '/bodyweight/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['me'],
        summary: 'Delete a bodyweight measurement',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const deleted = await ctx.db
        .delete(bodyweightEntries)
        .where(
          and(
            eq(bodyweightEntries.id, request.params.id),
            eq(bodyweightEntries.userId, request.auth!.userId),
          ),
        )
        .returning({ id: bodyweightEntries.id });
      if (deleted.length === 0) throw notFound('entry_not_found', 'Bodyweight entry not found');
      return { ok: true as const };
    },
  );

  app.get(
    '/',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['me'],
        summary: 'Own account summary',
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            id: z.string(),
            region: z.string(),
            sessionId: z.string(),
            profile: profileSchema,
          }),
          ...errorResponses,
        },
      },
    },
    async (request) => ({
      id: request.auth!.userId,
      region: request.auth!.region,
      sessionId: request.auth!.sessionId,
      profile: serializeProfile(await loadProfile(request.auth!.userId)),
    }),
  );
};

export default meRoutes;
