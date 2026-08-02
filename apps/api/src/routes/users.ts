import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponseSchema, idParamSchema, publicUserSchema } from '@apex/shared';
import { privacySettings, profiles, users } from '../db/schema.js';
import { notFound, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { isoRequired } from '../lib/time.js';
import { blockExistsEitherWay } from '../services/social.js';

const userRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  app.get(
    '/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Public user lookup honouring profile visibility and blocks',
        description:
          'Blocked relationships and visibility denials both return 404 so the endpoint never ' +
          'confirms that an account exists.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: publicUserSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const gone = notFound('user_not_found', 'User not found');

      let viewerId: string | null = null;
      const header = request.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        const claims = await verifyAccessToken(header.slice(7), ctx.config.JWT_SECRET);
        if (!claims) throw unauthorized('invalid_token', 'Access token is invalid or expired');
        viewerId = claims.sub;
      }

      const targetId = request.params.id;
      const [row] = await ctx.db
        .select({
          id: users.id,
          status: users.status,
          createdAt: users.createdAt,
          displayName: profiles.displayName,
          bio: profiles.bio,
          photoUrl: profiles.photoUrl,
          sex: profiles.sex,
          quietMode: profiles.quietMode,
          profileVisibility: privacySettings.profileVisibility,
        })
        .from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .innerJoin(privacySettings, eq(privacySettings.userId, users.id))
        .where(eq(users.id, targetId))
        .limit(1);

      if (!row || row.status !== 'active') throw gone;

      const isSelf = viewerId === targetId;
      if (!isSelf && viewerId && (await blockExistsEitherWay(ctx, viewerId, targetId))) throw gone;

      if (!isSelf) {
        if (row.profileVisibility === 'private') throw gone;
        // 'followers' resolves against the asymmetric follow graph in Phase 5;
        // until then nobody follows anybody, so only 'public' is viewable.
        if (row.profileVisibility === 'followers') throw gone;
      }

      return {
        id: row.id,
        displayName: row.displayName,
        bio: row.bio,
        photoUrl: row.photoUrl,
        sex: row.sex,
        quietMode: row.quietMode,
        createdAt: isoRequired(row.createdAt),
      };
    },
  );
};

export default userRoutes;
