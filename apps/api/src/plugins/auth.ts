import fp from 'fastify-plugin';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { sessions, users } from '../db/schema.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { unauthorized } from '../lib/errors.js';

const plugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('auth', undefined);

  app.decorate('requireAuth', async (request: import('fastify').FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized('missing_token', 'Missing Bearer access token');
    }
    const claims = await verifyAccessToken(header.slice(7), app.ctx.config.JWT_SECRET);
    if (!claims) throw unauthorized('invalid_token', 'Access token is invalid or expired');

    // An access token outlives a revoked session by up to its TTL, so device
    // revocation and account deletion are re-checked on every request.
    const [session] = await app.ctx.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, claims.sid), isNull(sessions.revokedAt)))
      .limit(1);
    if (!session) throw unauthorized('session_revoked', 'Session is no longer active');

    const [user] = await app.ctx.db
      .select({ id: users.id, status: users.status, region: users.region })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    if (!user || user.status !== 'active') {
      throw unauthorized('account_inactive', 'Account is not active');
    }

    request.auth = { userId: user.id, sessionId: claims.sid, region: user.region };
  });
};

export default fp(plugin, { name: 'apex-auth' });
