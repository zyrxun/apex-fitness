import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export interface EmbeddedClusterOptions {
  dataDir: string;
  port: number;
  database?: string;
  /** Wipe the data directory first — used by the test harness for isolation. */
  fresh?: boolean;
  quiet?: boolean;
}

export interface EmbeddedCluster {
  databaseUrl: string;
  stop: () => Promise<void>;
}

const USER = 'postgres';
const PASSWORD = 'postgres';

/**
 * Docker is not available on the target dev machine, so local Postgres comes
 * from real server binaries shipped by `embedded-postgres` rather than a
 * container or a SQLite stand-in (prod is Postgres + PostGIS).
 */
export async function startEmbeddedPostgres(
  options: EmbeddedClusterOptions,
): Promise<EmbeddedCluster> {
  const databaseDir = resolve(options.dataDir);
  const database = options.database ?? 'apex';

  if (options.fresh && existsSync(databaseDir)) {
    rmSync(databaseDir, { recursive: true, force: true });
  }
  const needsInit = !existsSync(resolve(databaseDir, 'PG_VERSION'));
  if (needsInit) mkdirSync(databaseDir, { recursive: true });

  // Passing onLog/onError as undefined overrides the package's own defaults and
  // crashes it, so the silencers are spread in only when requested.
  const silencers = options.quiet ? { onLog: () => {}, onError: () => {} } : {};

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: USER,
    password: PASSWORD,
    port: options.port,
    persistent: true,
    ...silencers,
  });

  if (needsInit) await pg.initialise();
  await pg.start();

  try {
    await pg.createDatabase(database);
  } catch (error) {
    // Idempotent: a persistent data dir already has the database.
    if (!String(error).includes('already exists')) throw error;
  }

  return {
    databaseUrl: `postgres://${USER}:${PASSWORD}@localhost:${options.port}/${database}`,
    stop: async () => {
      await pg.stop();
    },
  };
}
