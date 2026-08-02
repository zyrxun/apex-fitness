import { loadEnvFile } from '../lib/env-file.js';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';

loadEnvFile();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set. Start the dev cluster with `npm run dev`, or point it at a running Postgres.',
  );
  process.exit(1);
}

const { db, sql } = createDb(url, { max: 1 });
await runMigrations(db);
await sql.end();
console.log('Migrations applied.');
