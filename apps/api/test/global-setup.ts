import { resolve } from 'node:path';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { startEmbeddedPostgres } from '../src/db/embedded.js';

const PORT = Number(process.env.TEST_PG_PORT ?? 55433);
const DATA_DIR = resolve(process.cwd(), '.pgdata-test');
export const TEMPLATE_DB = 'apex_template';

declare module 'vitest' {
  interface ProvidedContext {
    pgBaseUrl: string;
    templateDb: string;
  }
}

export default async function setup(project: TestProject) {
  const cluster = await startEmbeddedPostgres({
    dataDir: DATA_DIR,
    port: PORT,
    database: TEMPLATE_DB,
    fresh: true,
    quiet: true,
  });

  const baseUrl = `postgres://postgres:postgres@localhost:${PORT}`;

  // Migrate once into a template; every test file then clones it with
  // CREATE DATABASE ... TEMPLATE, which is far cheaper than re-migrating.
  const { db, sql } = createDb(`${baseUrl}/${TEMPLATE_DB}`, { max: 1 });
  await runMigrations(db);
  await sql.end();

  project.provide('pgBaseUrl', baseUrl);
  project.provide('templateDb', TEMPLATE_DB);
  process.env.TEST_PG_BASE_URL = baseUrl;

  return async () => {
    // Drop leftover per-file databases so a rerun starts from a clean cluster.
    const admin = postgres(`${baseUrl}/postgres`, { max: 1, onnotice: () => {} });
    try {
      const rows = await admin<{ datname: string }[]>`
        select datname from pg_database where datname like 'apex_test_%'
      `;
      for (const row of rows) {
        await admin.unsafe(`drop database if exists "${row.datname}" with (force)`);
      }
    } finally {
      await admin.end();
    }
    await cluster.stop();
  };
}
