import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, type Database } from '../src/db/client.js';
import { createMemoryMailSender } from '../src/lib/mailer.js';
import type { OutboundMail } from '../src/lib/mailer.js';
import { currentTotpCode } from '../src/services/totp.js';
import type { AppContext } from '../src/context.js';

export interface TestHarness {
  app: FastifyInstance;
  db: Database;
  ctx: AppContext;
  mail: OutboundMail[];
  close: () => Promise<void>;
}

export async function createHarness(options: { rateLimit?: boolean } = {}): Promise<TestHarness> {
  const baseUrl = inject('pgBaseUrl');
  const templateDb = inject('templateDb');
  const dbName = `apex_test_${randomUUID().replace(/-/g, '')}`;

  const admin = postgres(`${baseUrl}/postgres`, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${dbName}" template "${templateDb}"`);
  await admin.end();

  const databaseUrl = `${baseUrl}/${dbName}`;
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(24).toString('hex'),
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    MAIL_TRANSPORT: 'memory',
    RATE_LIMIT_DISABLED: options.rateLimit ? 'false' : 'true',
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv);

  const { db, sql } = createDb(databaseUrl, { max: 4 });
  const mailer = createMemoryMailSender();
  const app = await buildApp({ config, db, mail: mailer });
  await app.ready();

  return {
    app,
    db,
    ctx: app.ctx,
    mail: mailer.sent,
    close: async () => {
      await app.close();
      await sql.end();
    },
  };
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  verificationToken: string;
}

let counter = 0;

export async function signup(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const email = `user${Date.now()}-${counter++}@example.com`;
  const password = 'correct-horse-battery';
  const response = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email, password, displayName: 'Test Athlete', ...overrides },
  });
  if (response.statusCode !== 201) {
    throw new Error(`signup failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  return {
    id: body.user.id,
    email: body.user.email,
    password: (overrides.password as string) ?? password,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    verificationToken: body.verificationToken,
  };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export const totpCode = (ctx: AppContext, userId: string) => currentTotpCode(ctx, userId);
