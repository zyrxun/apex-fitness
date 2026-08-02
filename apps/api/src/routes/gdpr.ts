import { and, eq, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  dataExportSchema,
  deleteAccountBodySchema,
  errorResponseSchema,
  okResponseSchema,
  type ExportTable,
} from '@apex/shared';
import {
  activities,
  activityEfforts,
  activitySplits,
  activityStreams,
  blocks,
  bodyweightEntries,
  credentials,
  emailTokens,
  hrZoneSettings,
  identities,
  mutes,
  privacySettings,
  privacyZones,
  profiles,
  recoveryCodes,
  reports,
  sessions,
  swimLengths,
  totpCredentials,
  users,
} from '../db/schema.js';
import { unauthorized } from '../lib/errors.js';
import { verifyPassword } from '../lib/crypto.js';
import { revokeAllForUser } from '../services/sessions.js';
import { verifyAppleIdentityToken } from '../services/apple.js';

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  501: errorResponseSchema,
};

const REDACTED = '[redacted]';

/** Secret material is listed but never exported — the value is useless to the
 * data subject and dangerous in a downloaded file. */
const REDACTED_COLUMNS = new Set([
  'passwordHash',
  'refreshTokenHash',
  'tokenHash',
  'codeHash',
  'secretCiphertext',
  'secretIv',
  'secretTag',
]);

type Row = Record<string, unknown>;

const serializeRows = (rows: Row[]): Row[] =>
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (REDACTED_COLUMNS.has(key)) return [key, value == null ? null : REDACTED];
        if (value instanceof Date) return [key, value.toISOString()];
        return [key, value];
      }),
    ),
  );

const gdprRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  app.get(
    '/export',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['gdpr'],
        summary: 'One-click full data export (every table this user owns)',
        security: [{ bearerAuth: [] }],
        response: { 200: dataExportSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const userId = request.auth!.userId;

      const [
        userRows,
        identityRows,
        profileRows,
        privacyRows,
        zoneRows,
        bodyweightRows,
        sessionRows,
        totpRows,
        recoveryRows,
        emailTokenRows,
        blockRows,
        muteRows,
        reportRows,
        hrZoneRows,
        activityRows,
        streamRows,
        splitRows,
        swimRows,
        effortRows,
      ] = await Promise.all([
        ctx.db.select().from(users).where(eq(users.id, userId)),
        ctx.db.select().from(identities).where(eq(identities.userId, userId)),
        ctx.db.select().from(profiles).where(eq(profiles.userId, userId)),
        ctx.db.select().from(privacySettings).where(eq(privacySettings.userId, userId)),
        ctx.db.select().from(privacyZones).where(eq(privacyZones.userId, userId)),
        ctx.db.select().from(bodyweightEntries).where(eq(bodyweightEntries.userId, userId)),
        ctx.db.select().from(sessions).where(eq(sessions.userId, userId)),
        ctx.db.select().from(totpCredentials).where(eq(totpCredentials.userId, userId)),
        ctx.db.select().from(recoveryCodes).where(eq(recoveryCodes.userId, userId)),
        ctx.db.select().from(emailTokens).where(eq(emailTokens.userId, userId)),
        ctx.db.select().from(blocks).where(eq(blocks.userId, userId)),
        ctx.db.select().from(mutes).where(eq(mutes.userId, userId)),
        ctx.db
          .select()
          .from(reports)
          .where(or(eq(reports.reporterUserId, userId), eq(reports.targetUserId, userId))),
        ctx.db.select().from(hrZoneSettings).where(eq(hrZoneSettings.userId, userId)),
        ctx.db.select().from(activities).where(eq(activities.userId, userId)),
        // Child rows are reached through the owning activity, which is the only
        // place the user id lives.
        ctx.db
          .select({
            activityId: activityStreams.activityId,
            streamType: activityStreams.streamType,
            sampleCount: activityStreams.sampleCount,
            data: activityStreams.data,
          })
          .from(activityStreams)
          .innerJoin(activities, eq(activities.id, activityStreams.activityId))
          .where(eq(activities.userId, userId)),
        ctx.db
          .select({ split: activitySplits })
          .from(activitySplits)
          .innerJoin(activities, eq(activities.id, activitySplits.activityId))
          .where(eq(activities.userId, userId)),
        ctx.db
          .select({ length: swimLengths })
          .from(swimLengths)
          .innerJoin(activities, eq(activities.id, swimLengths.activityId))
          .where(eq(activities.userId, userId)),
        ctx.db.select().from(activityEfforts).where(eq(activityEfforts.userId, userId)),
      ]);

      const tables: Record<ExportTable, Row[]> = {
        users: serializeRows(userRows as Row[]),
        identities: serializeRows(identityRows as Row[]),
        profiles: serializeRows(profileRows as Row[]),
        privacy_settings: serializeRows(privacyRows as Row[]),
        privacy_zones: serializeRows(zoneRows as Row[]),
        bodyweight_entries: serializeRows(bodyweightRows as Row[]),
        sessions: serializeRows(sessionRows as Row[]),
        totp_credentials: serializeRows(totpRows as Row[]),
        recovery_codes: serializeRows(recoveryRows as Row[]),
        email_tokens: serializeRows(emailTokenRows as Row[]),
        blocks: serializeRows(blockRows as Row[]),
        mutes: serializeRows(muteRows as Row[]),
        reports: serializeRows(reportRows as Row[]),
        hr_zone_settings: serializeRows(hrZoneRows as Row[]),
        activities: serializeRows(activityRows as Row[]),
        activity_streams: serializeRows(streamRows as Row[]),
        activity_splits: serializeRows(splitRows.map((r) => r.split) as Row[]),
        swim_lengths: serializeRows(swimRows.map((r) => r.length) as Row[]),
        activity_efforts: serializeRows(effortRows as Row[]),
      };

      return reply
        .header('content-disposition', `attachment; filename="apex-export-${userId}.json"`)
        .send({
          exportedAt: new Date().toISOString(),
          format: 'apex.export.v1' as const,
          userId,
          tables,
        });
    },
  );

  app.delete(
    '/account',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['gdpr'],
        summary: 'Soft-delete the account: anonymise PII now, revoke all sessions',
        security: [{ bearerAuth: [] }],
        body: deleteAccountBodySchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.auth!.userId;

      const [credential] = await ctx.db
        .select()
        .from(credentials)
        .where(eq(credentials.userId, userId))
        .limit(1);

      if (credential) {
        if (
          !request.body.password ||
          !(await verifyPassword(credential.passwordHash, request.body.password))
        ) {
          throw unauthorized('invalid_credentials', 'Password is incorrect');
        }
      } else {
        // Passwordless (Apple) accounts re-authenticate with a fresh identity
        // token, so deletion is never a dead end for them.
        if (!request.body.appleIdentityToken) {
          throw unauthorized(
            'reauth_required',
            'This account has no password; re-authenticate with a fresh Apple identity token',
          );
        }
        const identity = await verifyAppleIdentityToken(ctx, request.body.appleIdentityToken);
        const [row] = await ctx.db
          .select({ userId: identities.userId })
          .from(identities)
          .where(
            and(eq(identities.provider, 'apple'), eq(identities.providerSubject, identity.subject)),
          )
          .limit(1);
        if (row?.userId !== userId) {
          throw unauthorized('invalid_credentials', 'Identity token does not match this account');
        }
      }

      const now = new Date();
      await ctx.db.transaction(async (tx) => {
        // Tombstone the row (referential integrity for reports filed against
        // this user) while removing every identifying column immediately.
        await tx
          .update(users)
          .set({
            status: 'deleted',
            deletedAt: now,
            email: `deleted+${userId}@deleted.invalid`,
            emailVerifiedAt: null,
            updatedAt: now,
          })
          .where(eq(users.id, userId));

        await tx
          .update(profiles)
          .set({
            displayName: 'Deleted user',
            bio: null,
            photoUrl: null,
            sex: 'unspecified',
            dateOfBirth: null,
            quietMode: true,
            updatedAt: now,
          })
          .where(eq(profiles.userId, userId));

        await tx.delete(credentials).where(eq(credentials.userId, userId));
        await tx.delete(identities).where(eq(identities.userId, userId));
        await tx.delete(totpCredentials).where(eq(totpCredentials.userId, userId));
        await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
        await tx.delete(emailTokens).where(eq(emailTokens.userId, userId));
        await tx.delete(privacyZones).where(eq(privacyZones.userId, userId));
        await tx.delete(bodyweightEntries).where(eq(bodyweightEntries.userId, userId));

        // Activities are soft-deleted and forced private rather than dropped:
        // the hard purge happens with the tombstone (TODO below), but nothing
        // of a deleted account stays readable in the meantime.
        await tx
          .update(activities)
          .set({ visibility: 'private', deletedAt: now, updatedAt: now })
          .where(eq(activities.userId, userId));

        await tx
          .update(privacySettings)
          .set({
            defaultActivityVisibility: 'private',
            profileVisibility: 'private',
            hideWeight: true,
            hidePace: true,
            hideHeartrate: true,
            aggregateOptIn: false,
            updatedAt: now,
          })
          .where(eq(privacySettings.userId, userId));
      });

      await revokeAllForUser(ctx, userId, 'account_deleted');

      // TODO(phase-12): scheduled purge job that hard-deletes tombstoned users
      // (and any activity/media rows added in later phases) after the statutory
      // retention window, then drops the tombstone itself.
      return { ok: true as const };
    },
  );
};

export default gdprRoutes;
