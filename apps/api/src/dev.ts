import { randomBytes } from 'node:crypto';
import { loadEnvFile } from './lib/env-file.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { startEmbeddedPostgres } from './db/embedded.js';
import { buildApp } from './app.js';

loadEnvFile();

process.env.NODE_ENV ??= 'development';

// Dev-only fallbacks so `npm run dev` works on a clean checkout with no .env.
process.env.JWT_SECRET ??= 'dev-only-insecure-jwt-secret-value-32chars';
process.env.TOTP_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

let stopCluster: (() => Promise<void>) | null = null;

if (!process.env.DATABASE_URL) {
  const cluster = await startEmbeddedPostgres({
    dataDir: process.env.EMBEDDED_PG_DATA_DIR ?? '.pgdata',
    port: Number(process.env.EMBEDDED_PG_PORT ?? 55432),
    database: 'apex',
  });
  process.env.DATABASE_URL = cluster.databaseUrl;
  stopCluster = cluster.stop;
  console.log(`[dev] embedded postgres ready: ${cluster.databaseUrl}`);
}

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);
await runMigrations(db);
console.log('[dev] migrations applied');

const app = await buildApp({ config, db });
await app.listen({ port: config.PORT, host: config.HOST });
console.log(`[dev] api on http://localhost:${config.PORT}  ·  docs /docs  ·  health /health`);

const shutdown = async () => {
  await app.close();
  await sql.end();
  await stopCluster?.();
  process.exit(0);
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdown);
