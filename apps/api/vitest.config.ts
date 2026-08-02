import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    // argon2 hashing plus a real Postgres per file — generous but bounded.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    teardownTimeout: 60_000,
    pool: 'forks',
    maxWorkers: 4,
  },
});
