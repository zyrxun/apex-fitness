import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  hasZodFastifySchemaValidationErrors,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from './config.js';
import type { AppContext } from './context.js';
import type { Database } from './db/client.js';
import { ApiError } from './lib/errors.js';
import { createMailSender, type MailSender } from './lib/mailer.js';
import { createQueue } from './lib/queue.js';
import { MfaTicketStore } from './services/mfa-tickets.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import privacyRoutes from './routes/privacy.js';
import socialRoutes from './routes/social.js';
import gdprRoutes from './routes/gdpr.js';
import userRoutes from './routes/users.js';
import activityRoutes from './routes/activities.js';
import sportRoutes from './routes/sports.js';

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
  mail?: MailSender;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    logger: config.isTest ? false : { level: config.LOG_LEVEL },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const ctx: AppContext = {
    config,
    db,
    mail: options.mail ?? createMailSender(config.MAIL_TRANSPORT, config.MAIL_FROM),
    mfaTickets: new MfaTicketStore(),
    queue: createQueue(config.ACTIVITY_QUEUE_MODE, (error, key) =>
      app.log.error({ err: error, activityId: key }, 'activity processing job crashed'),
    ),
  };
  app.decorate('ctx', ctx);
  app.addHook('onClose', async () => {
    await ctx.queue.close();
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: 'validation_failed',
          message: 'Request payload failed validation',
          details: error.validation,
        },
      });
    }
    if (error instanceof ApiError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }

    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 429) {
      return reply
        .status(429)
        .send({ error: { code: 'rate_limited', message: 'Too many requests' } });
    }
    request.log.error({ err: error }, 'unhandled error');
    const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    return reply.status(statusCode).send({
      error: {
        code: statusCode === 500 ? 'internal_error' : 'request_failed',
        message: statusCode === 500 ? 'Internal server error' : (err.message ?? 'Request failed'),
      },
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } }),
  );

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Apex Fitness API',
        description:
          'Phases 1-2 — Identity, Profiles & Privacy Core plus Activity Recording. ' +
          'Canonical storage is metric + WGS-84 + UTC.',
        version: '0.1.0',
      },
      servers: [{ url: config.PUBLIC_BASE_URL }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      tags: [
        { name: 'health', description: 'Liveness' },
        { name: 'auth', description: 'Signup, login, sessions, 2FA' },
        { name: 'me', description: 'Own profile and bodyweight history' },
        { name: 'privacy', description: 'Privacy settings and privacy zones' },
        { name: 'social', description: 'Blocks, mutes, reports' },
        { name: 'gdpr', description: 'Data export and account deletion' },
        { name: 'users', description: 'Public user lookup' },
        { name: 'activities', description: 'Activity upload, processing, CRUD and streams' },
        { name: 'sports', description: 'Sport taxonomy' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  if (!config.RATE_LIMIT_DISABLED) {
    await app.register(rateLimit, {
      global: false,
      max: 100,
      timeWindow: '1 minute',
    });
  }

  await app.register(authPlugin);

  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness and database connectivity probe',
        response: {
          200: z.object({ status: z.literal('ok'), uptime: z.number() }),
        },
      },
    },
    async () => ({ status: 'ok' as const, uptime: Math.round(process.uptime()) }),
  );

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(privacyRoutes, { prefix: '/me' });
  await app.register(socialRoutes);
  await app.register(gdprRoutes, { prefix: '/me' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(activityRoutes);
  await app.register(sportRoutes);

  return app;
}
