import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createReportBodySchema,
  errorResponseSchema,
  okResponseSchema,
  relationshipListResponseSchema,
  reportSchema,
  userIdParamSchema,
} from '@apex/shared';
import { blocks, mutes, profiles, reports, users } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { isoRequired } from '../lib/time.js';
import { removeBlock, removeMute, setBlock, setMute } from '../services/social.js';

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
};

const socialRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  async function requireTarget(actorId: string, targetId: string) {
    if (actorId === targetId) throw badRequest('self_target', 'Cannot target your own account');
    const [row] = await ctx.db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);
    if (!row || row.status === 'deleted') throw notFound('user_not_found', 'User not found');
  }

  async function listRelationships(table: typeof blocks | typeof mutes, userId: string) {
    const rows = await ctx.db
      .select({
        userId: table.targetUserId,
        createdAt: table.createdAt,
        displayName: profiles.displayName,
      })
      .from(table)
      .leftJoin(profiles, eq(profiles.userId, table.targetUserId))
      .where(eq(table.userId, userId))
      .orderBy(desc(table.createdAt));
    return {
      entries: rows.map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        createdAt: isoRequired(row.createdAt),
      })),
    };
  }

  app.get(
    '/me/blocks',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['social'],
        summary: 'List blocked users',
        security: [{ bearerAuth: [] }],
        response: { 200: relationshipListResponseSchema, ...errorResponses },
      },
    },
    async (request) => listRelationships(blocks, request.auth!.userId),
  );

  app.put(
    '/me/blocks/:userId',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['social'],
        summary: 'Block a user (hides both directions)',
        security: [{ bearerAuth: [] }],
        params: userIdParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      await requireTarget(request.auth!.userId, request.params.userId);
      await setBlock(ctx, request.auth!.userId, request.params.userId);
      return { ok: true as const };
    },
  );

  app.delete(
    '/me/blocks/:userId',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['social'],
        summary: 'Unblock a user',
        security: [{ bearerAuth: [] }],
        params: userIdParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      await removeBlock(ctx, request.auth!.userId, request.params.userId);
      return { ok: true as const };
    },
  );

  app.get(
    '/me/mutes',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['social'],
        summary: 'List muted users',
        security: [{ bearerAuth: [] }],
        response: { 200: relationshipListResponseSchema, ...errorResponses },
      },
    },
    async (request) => listRelationships(mutes, request.auth!.userId),
  );

  app.put(
    '/me/mutes/:userId',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['social'],
        summary: 'Mute a user (feed-level only; they can still see you)',
        security: [{ bearerAuth: [] }],
        params: userIdParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      await requireTarget(request.auth!.userId, request.params.userId);
      await setMute(ctx, request.auth!.userId, request.params.userId);
      return { ok: true as const };
    },
  );

  app.delete(
    '/me/mutes/:userId',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['social'],
        summary: 'Unmute a user',
        security: [{ bearerAuth: [] }],
        params: userIdParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      await removeMute(ctx, request.auth!.userId, request.params.userId);
      return { ok: true as const };
    },
  );

  app.post(
    '/reports',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['social'],
        summary: 'Report a user to moderation',
        security: [{ bearerAuth: [] }],
        body: createReportBodySchema,
        response: { 201: reportSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      await requireTarget(request.auth!.userId, request.body.targetUserId);
      const [row] = await ctx.db
        .insert(reports)
        .values({
          id: newId(),
          reporterUserId: request.auth!.userId,
          targetUserId: request.body.targetUserId,
          reason: request.body.reason,
          details: request.body.details ?? null,
        })
        .returning();
      return reply.status(201).send({
        id: row!.id,
        reporterUserId: row!.reporterUserId,
        targetUserId: row!.targetUserId,
        reason: row!.reason,
        details: row!.details,
        status: row!.status,
        createdAt: isoRequired(row!.createdAt),
      });
    },
  );
};

export default socialRoutes;
