import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

/** apps/api/drizzle — resolved from this file so cwd never matters. */
export const MIGRATIONS_FOLDER = resolve(here, '../../drizzle');

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
