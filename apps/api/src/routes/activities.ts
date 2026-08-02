import { and, asc, desc, eq, gte, inArray, isNull, lt, lte } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  PR_DISTANCES_M,
  STREAM_TYPES,
  activityDetailSchema,
  activityListQuerySchema,
  activityListResponseSchema,
  activitySchema,
  activityStreamsResponseSchema,
  createActivityBodySchema,
  createManualActivityBodySchema,
  errorResponseSchema,
  hrZonesSchema,
  idParamSchema,
  okResponseSchema,
  personalRecordsResponseSchema,
  sportsInCategory,
  streamsQuerySchema,
  updateActivityBodySchema,
  updateHrZonesBodySchema,
  type StreamType,
} from '@apex/shared';
import { activities, activitySplits, activityStreams, swimLengths, users } from '../db/schema.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { isoRequired } from '../lib/time.js';
import type { LatLng } from '../processing/geo.js';
import { redactPositions } from '../processing/privacy-zones.js';
import {
  createManualActivity,
  createRecordedActivity,
  enqueueProcessing,
  personalRecords,
  softDeleteActivity,
} from '../services/activities.js';
import {
  loadActivityForViewer,
  loadOwnerPrivacy,
  planStreamRedaction,
  serializeActivity,
  streamIsVisible,
  type ViewerContext,
} from '../services/activity-view.js';
import { blockExistsEitherWay } from '../services/social.js';
import { loadHrZones, saveHrZones } from '../services/hr-zones.js';

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
};

const PR_LABELS: Record<number, string> = {
  1000: '1k',
  5000: '5k',
  10000: '10k',
  21097.5: 'Half marathon',
  42195: 'Marathon',
};

const POSITIONAL_STREAMS = new Set<StreamType>(['latlng', 'latlng_clean']);

const activityRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  /**
   * Optional bearer: public activities are readable without a session, but a
   * token that is present and broken is an error rather than an anonymous read.
   */
  async function optionalViewer(request: { headers: { authorization?: string } }) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const claims = await verifyAccessToken(header.slice(7), ctx.config.JWT_SECRET);
    if (!claims) throw unauthorized('invalid_token', 'Access token is invalid or expired');
    return claims.sub;
  }

  async function loadDetail(view: ViewerContext) {
    const [splits, lengths] = await Promise.all([
      ctx.db
        .select()
        .from(activitySplits)
        .where(eq(activitySplits.activityId, view.activity.id))
        .orderBy(asc(activitySplits.unit), asc(activitySplits.index)),
      ctx.db
        .select()
        .from(swimLengths)
        .where(eq(swimLengths.activityId, view.activity.id))
        .orderBy(asc(swimLengths.index)),
    ]);

    const hideHr = !view.isOwner && view.hideHeartrate;
    const hidePace = !view.isOwner && view.hidePace;

    return {
      ...serializeActivity(view),
      isOwner: view.isOwner,
      splits: splits.map((split) => ({
        unit: split.unit,
        index: split.index,
        distanceM: split.distanceM,
        elapsedS: split.elapsedS,
        movingS: split.movingS,
        elevGainM: split.elevGainM,
        avgHr: hideHr ? null : split.avgHr,
        gapS: hidePace ? null : split.gapS,
      })),
      swimLengths: lengths.map((length) => ({
        index: length.index,
        stroke: length.stroke,
        durationS: length.durationS,
        strokeCount: length.strokeCount,
      })),
    };
  }

  app.post(
    '/activities',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Upload a recorded session (metadata + raw streams)',
        description:
          'Stores the raw streams verbatim and queues the derivation pipeline. The response ' +
          'is the created activity with processing_status=pending; poll GET /activities/:id ' +
          'until it reports ready or failed. Re-posting the same uploadId returns 200 with ' +
          'the original activity instead of creating a duplicate.',
        security: [{ bearerAuth: [] }],
        body: createActivityBodySchema,
        response: { 200: activitySchema, 201: activitySchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { userId, region } = request.auth!;
      const { activity, created } = await createRecordedActivity(ctx, userId, region, request.body);
      if (created) await enqueueProcessing(ctx, activity.id);

      const view: ViewerContext = {
        activity,
        isOwner: true,
        zones: [],
        hidePace: false,
        hideHeartrate: false,
      };
      return reply.status(created ? 201 : 200).send(serializeActivity(view));
    },
  );

  app.post(
    '/activities/manual',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Log an activity by hand (no GPS, no pipeline)',
        security: [{ bearerAuth: [] }],
        body: createManualActivityBodySchema,
        response: { 201: activitySchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { userId, region } = request.auth!;
      const activity = await createManualActivity(ctx, userId, region, request.body);
      return reply.status(201).send(
        serializeActivity({
          activity,
          isOwner: true,
          zones: [],
          hidePace: false,
          hideHeartrate: false,
        }),
      );
    },
  );

  app.get(
    '/activities',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Own activities, newest first, keyset-paginated',
        security: [{ bearerAuth: [] }],
        querystring: activityListQuerySchema,
        response: { 200: activityListResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.auth!.userId;
      const { limit, cursor, sportCategory, sportType, startedAfter, startedBefore } =
        request.query;

      const cursorDate = cursor ? new Date(cursor) : null;
      if (cursorDate && Number.isNaN(cursorDate.getTime())) {
        throw badRequest('invalid_cursor', 'Cursor must be an ISO-8601 timestamp');
      }

      const filters = [eq(activities.userId, userId), isNull(activities.deletedAt)];
      if (cursorDate) filters.push(lt(activities.startedAt, cursorDate));
      if (sportType) filters.push(eq(activities.sportType, sportType));
      else if (sportCategory)
        filters.push(inArray(activities.sportType, sportsInCategory(sportCategory)));
      if (startedAfter) filters.push(gte(activities.startedAt, new Date(startedAfter)));
      if (startedBefore) filters.push(lte(activities.startedAt, new Date(startedBefore)));

      const rows = await ctx.db
        .select()
        .from(activities)
        .where(and(...filters))
        .orderBy(desc(activities.startedAt), desc(activities.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      return {
        activities: page.map((activity) =>
          serializeActivity({
            activity,
            isOwner: true,
            zones: [],
            hidePace: false,
            hideHeartrate: false,
          }),
        ),
        nextCursor:
          rows.length > limit && page.length > 0
            ? isoRequired(page[page.length - 1]!.startedAt)
            : null,
      };
    },
  );

  app.get(
    '/activities/:id',
    {
      schema: {
        tags: ['activities'],
        summary: 'One activity with splits and swim lengths',
        description:
          'Hidden and blocked activities both return 404 so the endpoint never confirms one ' +
          'exists. Non-owners get the privacy-zone-redacted map summary.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: activityDetailSchema, ...errorResponses },
      },
    },
    async (request) => {
      const viewerId = await optionalViewer(request);
      const view = await loadActivityForViewer(ctx, request.params.id, viewerId);
      return loadDetail(view);
    },
  );

  app.patch(
    '/activities/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Edit an activity (owner only)',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: updateActivityBodySchema,
        response: { 200: activityDetailSchema, ...errorResponses },
      },
    },
    async (request) => {
      if (Object.keys(request.body).length === 0) {
        throw badRequest('empty_patch', 'Provide at least one field to update');
      }
      const [row] = await ctx.db
        .update(activities)
        .set({ ...request.body, updatedAt: new Date() })
        .where(
          and(
            eq(activities.id, request.params.id),
            eq(activities.userId, request.auth!.userId),
            isNull(activities.deletedAt),
          ),
        )
        .returning();
      if (!row) throw notFound('activity_not_found', 'Activity not found');

      return loadDetail({
        activity: row,
        isOwner: true,
        zones: [],
        hidePace: false,
        hideHeartrate: false,
      });
    },
  );

  app.delete(
    '/activities/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Soft-delete an activity',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const removed = await softDeleteActivity(ctx, request.auth!.userId, request.params.id);
      if (!removed) throw notFound('activity_not_found', 'Activity not found');
      return { ok: true as const };
    },
  );

  app.get(
    '/activities/:id/streams',
    {
      schema: {
        tags: ['activities'],
        summary: 'Selected streams for an activity',
        description:
          "Positional streams are nulled at every index inside one of the owner's privacy " +
          'zones (plus a stable random extension beyond the zone edge). Other streams keep ' +
          'their samples so everything stays index-aligned with `time`.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        querystring: streamsQuerySchema,
        response: { 200: activityStreamsResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const viewerId = await optionalViewer(request);
      const view = await loadActivityForViewer(ctx, request.params.id, viewerId);

      const requested = request.query.keys
        ?.split(',')
        .map((key) => key.trim())
        .filter(Boolean);
      if (requested?.some((key) => !STREAM_TYPES.includes(key as StreamType))) {
        throw badRequest('unknown_stream', `keys must be a subset of: ${STREAM_TYPES.join(', ')}`);
      }

      const rows = await ctx.db
        .select()
        .from(activityStreams)
        .where(eq(activityStreams.activityId, view.activity.id));

      // The plan comes from the cleaned track when we have one so a raw fix and
      // its smoothed counterpart are censored at exactly the same indices.
      const reference = (
        rows.find((r) => r.streamType === 'latlng_clean') ??
        rows.find((r) => r.streamType === 'latlng')
      )?.data as (LatLng | null)[] | undefined;
      const plan = reference ? planStreamRedaction(view, reference) : null;

      const streams: Record<string, { type: StreamType; sampleCount: number; data: unknown[] }> =
        {};
      for (const row of rows) {
        if (requested && !requested.includes(row.streamType)) continue;
        if (!streamIsVisible(view, row.streamType)) continue;
        const data =
          plan && POSITIONAL_STREAMS.has(row.streamType)
            ? redactPositions(row.data, plan)
            : row.data;
        streams[row.streamType] = {
          type: row.streamType,
          sampleCount: row.sampleCount,
          data,
        };
      }

      return {
        activityId: view.activity.id,
        privacyRedacted: plan?.anyRedacted ?? false,
        streams,
      };
    },
  );

  app.get(
    '/users/:id/activities',
    {
      schema: {
        tags: ['activities'],
        summary: "Another athlete's activities",
        description:
          'Public activities only. TODO(phase-5): once the follow graph exists, ' +
          "`followers`-visibility activities become visible to the owner's followers.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        querystring: activityListQuerySchema,
        response: { 200: activityListResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const gone = notFound('user_not_found', 'User not found');
      const viewerId = await optionalViewer(request);
      const targetId = request.params.id;

      if (viewerId === targetId) throw gone; // /activities is the own-activities route

      const [owner] = await ctx.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (!owner || owner.status !== 'active') throw gone;
      if (viewerId && (await blockExistsEitherWay(ctx, viewerId, targetId))) throw gone;

      const { limit, cursor, sportCategory, sportType, startedAfter, startedBefore } =
        request.query;
      const cursorDate = cursor ? new Date(cursor) : null;
      if (cursorDate && Number.isNaN(cursorDate.getTime())) {
        throw badRequest('invalid_cursor', 'Cursor must be an ISO-8601 timestamp');
      }

      const filters = [
        eq(activities.userId, targetId),
        isNull(activities.deletedAt),
        eq(activities.visibility, 'public'),
      ];
      if (cursorDate) filters.push(lt(activities.startedAt, cursorDate));
      if (sportType) filters.push(eq(activities.sportType, sportType));
      else if (sportCategory)
        filters.push(inArray(activities.sportType, sportsInCategory(sportCategory)));
      if (startedAfter) filters.push(gte(activities.startedAt, new Date(startedAfter)));
      if (startedBefore) filters.push(lte(activities.startedAt, new Date(startedBefore)));

      const [rows, privacy] = await Promise.all([
        ctx.db
          .select()
          .from(activities)
          .where(and(...filters))
          .orderBy(desc(activities.startedAt), desc(activities.id))
          .limit(limit + 1),
        loadOwnerPrivacy(ctx, targetId),
      ]);

      const page = rows.slice(0, limit);
      return {
        activities: page.map((activity) =>
          serializeActivity({ activity, isOwner: false, ...privacy }),
        ),
        nextCursor:
          rows.length > limit && page.length > 0
            ? isoRequired(page[page.length - 1]!.startedAt)
            : null,
      };
    },
  );

  app.get(
    '/me/prs',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Current best efforts by distance (run-category, Phase-2 subset)',
        security: [{ bearerAuth: [] }],
        response: { 200: personalRecordsResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const bests = await personalRecords(ctx, request.auth!.userId);
      const byDistance = new Map(bests.map((best) => [best.distanceM, best]));

      // Driven off PR_DISTANCES_M so the response order is the ladder order
      // rather than whatever the athlete happens to have run.
      const records = PR_DISTANCES_M.flatMap((distanceM) => {
        const best = byDistance.get(distanceM);
        if (!best) return [];
        return [
          {
            distanceM,
            label: PR_LABELS[distanceM] ?? `${Math.round(distanceM)} m`,
            elapsedS: best.elapsedS,
            paceSecPerKm: (best.elapsedS / distanceM) * 1000,
            activityId: best.activityId,
            activityName: best.activityName,
            achievedAt: isoRequired(best.achievedAt),
          },
        ];
      });

      return { records };
    },
  );

  app.get(
    '/me/hr-zones',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Heart-rate zones (falls back to 220−age from the profile DOB)',
        security: [{ bearerAuth: [] }],
        response: { 200: hrZonesSchema, ...errorResponses },
      },
    },
    async (request) => loadHrZones(ctx, request.auth!.userId),
  );

  app.put(
    '/me/hr-zones',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['activities'],
        summary: 'Set max HR and/or zone boundaries',
        security: [{ bearerAuth: [] }],
        body: updateHrZonesBodySchema,
        response: { 200: hrZonesSchema, ...errorResponses },
      },
    },
    async (request) => {
      if (Object.keys(request.body).length === 0) {
        throw badRequest('empty_patch', 'Provide at least one field to update');
      }
      return saveHrZones(ctx, request.auth!.userId, request.body);
    },
  );
};

export default activityRoutes;
