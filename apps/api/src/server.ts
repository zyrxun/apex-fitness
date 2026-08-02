import { loadEnvFile } from './lib/env-file.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { buildApp } from './app.js';

loadEnvFile();

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);
const app = await buildApp({ config, db });

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(`Swagger UI on ${config.PUBLIC_BASE_URL}/docs`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await sql.end();
    process.exit(0);
  });
}
