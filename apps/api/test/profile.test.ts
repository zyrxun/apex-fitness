import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kgToLb, lbToKg } from '@apex/shared';
import { bearer, createHarness, signup, type TestHarness } from './helpers.js';

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('profile', () => {
  it('patches fields and leaves the rest alone', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'PATCH',
      url: '/me/profile',
      headers: bearer(user.accessToken),
      payload: { bio: 'Runs and lifts.', sex: 'female', units: 'imperial', quietMode: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bio).toBe('Runs and lifts.');
    expect(body.sex).toBe('female');
    expect(body.units).toBe('imperial');
    expect(body.quietMode).toBe(true);
    expect(body.displayName).toBe('Test Athlete');

    const again = await h.app.inject({
      method: 'PATCH',
      url: '/me/profile',
      headers: bearer(user.accessToken),
      payload: { displayName: 'Hybrid Hank' },
    });
    expect(again.json().displayName).toBe('Hybrid Hank');
    expect(again.json().bio).toBe('Runs and lifts.');
  });

  it('rejects an empty patch and invalid values', async () => {
    const user = await signup(h.app);
    const empty = await h.app.inject({
      method: 'PATCH',
      url: '/me/profile',
      headers: bearer(user.accessToken),
      payload: {},
    });
    expect(empty.statusCode).toBe(400);

    const bad = await h.app.inject({
      method: 'PATCH',
      url: '/me/profile',
      headers: bearer(user.accessToken),
      payload: { sex: 'other' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('validation_failed');
  });

  it('accepts sex and date of birth at signup (rank cohorts + age multipliers)', async () => {
    const user = await signup(h.app, { sex: 'male', dateOfBirth: '1990-06-01' });
    const res = await h.app.inject({
      method: 'GET',
      url: '/me/profile',
      headers: bearer(user.accessToken),
    });
    expect(res.json().sex).toBe('male');
    expect(res.json().dateOfBirth).toBe('1990-06-01');
  });
});

describe('bodyweight history', () => {
  it('stores kg canonically and converts imperial input at the edge', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/me/bodyweight',
      headers: bearer(user.accessToken),
      payload: { weight: 180, unit: 'lb' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().weightKg).toBeCloseTo(lbToKg(180), 2);
    // The profile is still metric, so the display value comes back in kg.
    expect(res.json().unit).toBe('kg');

    await h.app.inject({
      method: 'PATCH',
      url: '/me/profile',
      headers: bearer(user.accessToken),
      payload: { units: 'imperial' },
    });

    const list = await h.app.inject({
      method: 'GET',
      url: '/me/bodyweight',
      headers: bearer(user.accessToken),
    });
    const entry = list.json().entries[0];
    expect(entry.unit).toBe('lb');
    expect(entry.weight).toBeCloseTo(180, 1);
    expect(entry.weightKg).toBeCloseTo(lbToKg(180), 2);
    expect(kgToLb(entry.weightKg)).toBeCloseTo(180, 1);
  });

  it('returns history newest-first and paginates', async () => {
    const user = await signup(h.app);
    const days = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'];
    for (const day of days) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/me/bodyweight',
        headers: bearer(user.accessToken),
        payload: { weight: 80, unit: 'kg', measuredAt: `${day}T09:00:00.000Z` },
      });
      expect(res.statusCode).toBe(201);
    }

    const page1 = await h.app.inject({
      method: 'GET',
      url: '/me/bodyweight?limit=2',
      headers: bearer(user.accessToken),
    });
    const body1 = page1.json();
    expect(body1.entries.map((e: { measuredAt: string }) => e.measuredAt.slice(0, 10))).toEqual([
      '2026-04-01',
      '2026-03-01',
    ]);
    expect(body1.nextCursor).toBeTruthy();

    const page2 = await h.app.inject({
      method: 'GET',
      url: `/me/bodyweight?limit=2&cursor=${encodeURIComponent(body1.nextCursor)}`,
      headers: bearer(user.accessToken),
    });
    const body2 = page2.json();
    expect(body2.entries.map((e: { measuredAt: string }) => e.measuredAt.slice(0, 10))).toEqual([
      '2026-02-01',
      '2026-01-01',
    ]);
    expect(body2.nextCursor).toBeNull();
  });

  it('deletes only the caller-owned entries', async () => {
    const owner = await signup(h.app);
    const stranger = await signup(h.app);
    const created = await h.app.inject({
      method: 'POST',
      url: '/me/bodyweight',
      headers: bearer(owner.accessToken),
      payload: { weight: 75 },
    });
    const id = created.json().id;

    const foreign = await h.app.inject({
      method: 'DELETE',
      url: `/me/bodyweight/${id}`,
      headers: bearer(stranger.accessToken),
    });
    expect(foreign.statusCode).toBe(404);

    const own = await h.app.inject({
      method: 'DELETE',
      url: `/me/bodyweight/${id}`,
      headers: bearer(owner.accessToken),
    });
    expect(own.statusCode).toBe(200);

    const list = await h.app.inject({
      method: 'GET',
      url: '/me/bodyweight',
      headers: bearer(owner.accessToken),
    });
    expect(list.json().entries).toHaveLength(0);
  });
});
