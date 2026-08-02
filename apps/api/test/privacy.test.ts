import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createHarness, signup, type TestHarness } from './helpers.js';

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('privacy defaults', () => {
  it('defaults to followers-not-public with aggregation opt-in off', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'GET',
      url: '/me/privacy',
      headers: bearer(user.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.defaultActivityVisibility).toBe('followers');
    expect(body.profileVisibility).toBe('followers');
    expect(body.aggregateOptIn).toBe(false);
    expect(body.hideWeight).toBe(true);
    expect(body.hidePace).toBe(false);
    expect(body.hideHeartrate).toBe(false);
  });

  it('updates the three stat flags independently', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'PATCH',
      url: '/me/privacy',
      headers: bearer(user.accessToken),
      payload: { hidePace: true, hideWeight: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hidePace).toBe(true);
    expect(body.hideWeight).toBe(false);
    expect(body.hideHeartrate).toBe(false);
  });

  it('rejects an unknown visibility value', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'PATCH',
      url: '/me/privacy',
      headers: bearer(user.accessToken),
      payload: { profileVisibility: 'friends-of-friends' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('privacy zones', () => {
  it('supports full CRUD scoped to the owner', async () => {
    const user = await signup(h.app);
    const stranger = await signup(h.app);

    const created = await h.app.inject({
      method: 'POST',
      url: '/me/privacy-zones',
      headers: bearer(user.accessToken),
      payload: { label: 'Home', centerLat: -36.8485, centerLng: 174.7633 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().radiusM).toBe(500);
    const id = created.json().id;

    const listed = await h.app.inject({
      method: 'GET',
      url: '/me/privacy-zones',
      headers: bearer(user.accessToken),
    });
    expect(listed.json().zones).toHaveLength(1);

    const patched = await h.app.inject({
      method: 'PATCH',
      url: `/me/privacy-zones/${id}`,
      headers: bearer(user.accessToken),
      payload: { label: 'Work', radiusM: 1200 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().label).toBe('Work');
    expect(patched.json().radiusM).toBe(1200);

    const foreign = await h.app.inject({
      method: 'DELETE',
      url: `/me/privacy-zones/${id}`,
      headers: bearer(stranger.accessToken),
    });
    expect(foreign.statusCode).toBe(404);

    const removed = await h.app.inject({
      method: 'DELETE',
      url: `/me/privacy-zones/${id}`,
      headers: bearer(user.accessToken),
    });
    expect(removed.statusCode).toBe(200);

    const empty = await h.app.inject({
      method: 'GET',
      url: '/me/privacy-zones',
      headers: bearer(user.accessToken),
    });
    expect(empty.json().zones).toHaveLength(0);
  });

  it('rejects out-of-range coordinates and radii', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/me/privacy-zones',
      headers: bearer(user.accessToken),
      payload: { label: 'Bad', centerLat: 95, centerLng: 0, radiusM: 10 },
    });
    expect(res.statusCode).toBe(400);
  });
});
