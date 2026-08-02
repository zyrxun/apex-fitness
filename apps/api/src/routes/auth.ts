import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { RateLimitOptions } from '@fastify/rate-limit';
import {
  errorResponseSchema,
  forgotPasswordBodySchema,
  idParamSchema,
  loginBodySchema,
  loginResponseSchema,
  logoutBodySchema,
  mfaVerifyBodySchema,
  oauthStartBodySchema,
  okResponseSchema,
  refreshBodySchema,
  resetPasswordBodySchema,
  sessionListResponseSchema,
  signupBodySchema,
  signupResponseSchema,
  tokenPairSchema,
  totpConfirmBodySchema,
  totpConfirmResponseSchema,
  totpDisableBodySchema,
  totpEnrollResponseSchema,
  verifyEmailBodySchema,
} from '@apex/shared';
import { credentials, users } from '../db/schema.js';
import { badRequest, notFound, notImplemented, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { iso, isoRequired } from '../lib/time.js';
import { consumeEmailToken, issueEmailToken } from '../services/email-tokens.js';
import {
  getSessionById,
  listActiveSessions,
  revokeAllForUser,
  revokeByRefreshToken,
  revokeFamily,
  rotateRefreshToken,
  startSession,
} from '../services/sessions.js';
import {
  confirmTotp,
  consumeRecoveryCode,
  disableTotp,
  enrollTotp,
  getTotp,
  isTotpEnabled,
  verifyTotpCode,
} from '../services/totp.js';
import { createUserAccount, findActiveUserById, findUserByEmail } from '../services/users.js';

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  429: errorResponseSchema,
};

const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  // Auth routes get their own buckets; `false` disables per-route limiting when
  // the plugin is not registered at all (tests).
  const limit = (max: number): { rateLimit: RateLimitOptions | false } => ({
    rateLimit: ctx.config.RATE_LIMIT_DISABLED ? false : { max, timeWindow: '1 minute' },
  });
  const rateLimitConfig = limit(20);
  const strictRateLimitConfig = limit(10);

  const device = (request: { headers: Record<string, unknown>; ip: string }) => ({
    userAgent:
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
    ip: request.ip,
  });

  const publicUser = (user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    region: string;
  }) => ({
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    region: user.region,
  });

  app.post(
    '/signup',
    {
      config: strictRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Create an account with a profile and privacy defaults',
        body: signupBodySchema,
        response: { 201: signupResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await createUserAccount(ctx, request.body);
      const verificationToken = await issueEmailToken(ctx, user.id, 'verify_email');
      await ctx.mail.send({
        to: user.email,
        subject: 'Verify your Apex Fitness email',
        text: `Confirm your email: ${ctx.config.PUBLIC_BASE_URL}/auth/verify-email?token=${verificationToken}`,
        meta: { purpose: 'verify_email', userId: user.id },
      });

      const tokens = await startSession(ctx, user, device(request));
      return reply.status(201).send({
        user: publicUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: 'Bearer' as const,
          expiresIn: tokens.expiresIn,
        },
        ...(ctx.config.EXPOSE_DEV_TOKENS ? { verificationToken } : {}),
      });
    },
  );

  app.post(
    '/login',
    {
      config: strictRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Password login; returns an MFA ticket when TOTP is enabled',
        body: loginBodySchema,
        response: { 200: loginResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const invalid = unauthorized('invalid_credentials', 'Email or password is incorrect');
      const user = await findUserByEmail(ctx, request.body.email);
      if (!user || user.status !== 'active') throw invalid;

      const [credential] = await ctx.db
        .select()
        .from(credentials)
        .where(eq(credentials.userId, user.id))
        .limit(1);
      if (!credential) throw invalid;
      if (!(await verifyPassword(credential.passwordHash, request.body.password))) throw invalid;

      const totp = await getTotp(ctx, user.id);
      if (isTotpEnabled(totp)) {
        const { ticket, expiresIn } = ctx.mfaTickets.issue(user.id);
        return { status: 'mfa_required' as const, mfaTicket: ticket, expiresIn };
      }

      const tokens = await startSession(ctx, user, device(request));
      return {
        status: 'authenticated' as const,
        user: publicUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: 'Bearer' as const,
          expiresIn: tokens.expiresIn,
        },
      };
    },
  );

  app.post(
    '/mfa/verify',
    {
      config: strictRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Second login step: TOTP code or single-use recovery code',
        body: mfaVerifyBodySchema,
        response: { 200: loginResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = ctx.mfaTickets.consume(request.body.mfaTicket);
      if (!userId) throw unauthorized('invalid_mfa_ticket', 'MFA ticket is invalid or expired');

      const user = await findActiveUserById(ctx, userId);
      if (!user) throw unauthorized('account_inactive', 'Account is not active');

      const ok =
        (await verifyTotpCode(ctx, userId, request.body.code)) ||
        (await consumeRecoveryCode(ctx, userId, request.body.code));
      if (!ok) throw unauthorized('invalid_mfa_code', 'Code is not valid');

      const tokens = await startSession(ctx, user, device(request));
      return {
        status: 'authenticated' as const,
        user: publicUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: 'Bearer' as const,
          expiresIn: tokens.expiresIn,
        },
      };
    },
  );

  app.post(
    '/refresh',
    {
      config: rateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Rotate a refresh token; replay revokes the whole session family',
        body: refreshBodySchema,
        response: { 200: tokenPairSchema, ...errorResponses },
      },
    },
    async (request) => {
      const tokens = await rotateRefreshToken(ctx, request.body.refreshToken, device(request));
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer' as const,
        expiresIn: tokens.expiresIn,
      };
    },
  );

  app.post(
    '/logout',
    {
      config: rateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Revoke the session family behind a refresh token',
        body: logoutBodySchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      await revokeByRefreshToken(ctx, request.body.refreshToken);
      return { ok: true as const };
    },
  );

  app.post(
    '/verify-email',
    {
      config: rateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Consume an email verification token',
        body: verifyEmailBodySchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = await consumeEmailToken(ctx, request.body.token, 'verify_email');
      if (!userId) throw badRequest('invalid_token', 'Verification token is invalid or expired');
      await ctx.db
        .update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { ok: true as const };
    },
  );

  app.post(
    '/forgot-password',
    {
      config: strictRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Request a password reset link (always 200 — no account enumeration)',
        body: forgotPasswordBodySchema,
        response: {
          200: z.object({ ok: z.literal(true), resetToken: z.string().optional() }),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const user = await findUserByEmail(ctx, request.body.email);
      if (!user || user.status !== 'active') return { ok: true as const };

      const resetToken = await issueEmailToken(ctx, user.id, 'reset_password');
      await ctx.mail.send({
        to: user.email,
        subject: 'Reset your Apex Fitness password',
        text: `Reset your password: ${ctx.config.PUBLIC_BASE_URL}/auth/reset-password?token=${resetToken}`,
        meta: { purpose: 'reset_password', userId: user.id },
      });
      return { ok: true as const, ...(ctx.config.EXPOSE_DEV_TOKENS ? { resetToken } : {}) };
    },
  );

  app.post(
    '/reset-password',
    {
      config: strictRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Set a new password and revoke every existing session',
        body: resetPasswordBodySchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = await consumeEmailToken(ctx, request.body.token, 'reset_password');
      if (!userId) throw badRequest('invalid_token', 'Reset token is invalid or expired');

      await ctx.db
        .update(credentials)
        .set({
          passwordHash: await hashPassword(request.body.password),
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(credentials.userId, userId));

      await revokeAllForUser(ctx, userId, 'password_reset');
      return { ok: true as const };
    },
  );

  app.post(
    '/totp/enroll',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Begin TOTP enrolment; returns the secret and otpauth URI',
        security: [{ bearerAuth: [] }],
        response: { 200: totpEnrollResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const user = await findActiveUserById(ctx, request.auth!.userId);
      if (!user) throw unauthorized();
      const existing = await getTotp(ctx, user.id);
      if (isTotpEnabled(existing)) {
        throw badRequest('totp_already_enabled', 'Disable TOTP before enrolling again');
      }
      return enrollTotp(ctx, user.id, user.email);
    },
  );

  app.post(
    '/totp/confirm',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Confirm TOTP enrolment and issue recovery codes',
        security: [{ bearerAuth: [] }],
        body: totpConfirmBodySchema,
        response: { 200: totpConfirmResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.auth!.userId;
      const existing = await getTotp(ctx, userId);
      if (!existing) throw badRequest('totp_not_enrolled', 'Start enrolment first');
      if (!(await verifyTotpCode(ctx, userId, request.body.code))) {
        throw badRequest('invalid_totp_code', 'Code is not valid');
      }
      const recoveryCodesList = await confirmTotp(ctx, userId);
      return { enabled: true as const, recoveryCodes: recoveryCodesList };
    },
  );

  app.post(
    '/totp/disable',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Disable TOTP (password re-auth required)',
        security: [{ bearerAuth: [] }],
        body: totpDisableBodySchema,
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
      if (!credential || !(await verifyPassword(credential.passwordHash, request.body.password))) {
        throw unauthorized('invalid_credentials', 'Password is incorrect');
      }
      await disableTotp(ctx, userId);
      return { ok: true as const };
    },
  );

  app.get(
    '/sessions',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'List active devices/sessions',
        security: [{ bearerAuth: [] }],
        response: { 200: sessionListResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const rows = await listActiveSessions(ctx, request.auth!.userId);
      return {
        sessions: rows.map((row) => ({
          id: row.id,
          createdAt: isoRequired(row.familyCreatedAt),
          lastUsedAt: iso(row.lastUsedAt),
          expiresAt: isoRequired(row.expiresAt),
          revokedAt: iso(row.revokedAt),
          userAgent: row.userAgent,
          ip: row.ip,
          current: row.id === request.auth!.sessionId,
        })),
      };
    },
  );

  app.delete(
    '/sessions/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Revoke a session and every rotation descended from it',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: okResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const session = await getSessionById(ctx, request.auth!.userId, request.params.id);
      if (!session) throw notFound('session_not_found', 'Session not found');
      await revokeFamily(ctx, session.familyId, 'revoked_by_user');
      return { ok: true as const };
    },
  );

  // TODO(phase-1+): implement once Apple/Google developer credentials exist.
  // The identities table is already the provider-agnostic seam; this route only
  // needs an id-token verification step per provider.
  for (const path of ['/apple', '/google'] as const) {
    app.post(
      path,
      {
        schema: {
          tags: ['auth'],
          summary: `Sign in with ${path === '/apple' ? 'Apple' : 'Google'} (not implemented)`,
          body: oauthStartBodySchema,
          response: { 501: errorResponseSchema, ...errorResponses },
        },
      },
      async () => {
        throw notImplemented(
          'oauth_not_configured',
          'Third-party sign-in requires provider credentials that are not configured yet',
        );
      },
    );
  }
};

export default authRoutes;
