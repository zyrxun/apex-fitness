import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env reader — process.env always wins, so a shell value is never
 * clobbered by a stale file. Avoids a dotenv dependency for six lines of work.
 */
export function loadEnvFile(file = '.env'): void {
  const candidates = [resolve(process.cwd(), file), resolve(process.cwd(), '../..', file)];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) return;

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
