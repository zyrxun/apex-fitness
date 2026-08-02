import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type TestHarness } from './helpers.js';

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness({ rateLimit: true });
});
afterAll(async () => {
  await h.close();
});

describe('auth rate limiting', () => {
  it('429s a login-guessing burst but leaves other routes alone', async () => {
    const attempt = () =>
      h.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'victim@example.com', password: 'guess' },
      });

    const codes: number[] = [];
    for (let i = 0; i < 14; i += 1) codes.push((await attempt()).statusCode);

    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes).toContain(429);

    const limited = await attempt();
    expect(limited.json().error.code).toBe('rate_limited');

    const health = await h.app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
  });
});
