import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createHarness, signup, type TestHarness } from './helpers.js';

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const makePublic = (token: string) =>
  h.app.inject({
    method: 'PATCH',
    url: '/me/privacy',
    headers: bearer(token),
    payload: { profileVisibility: 'public' },
  });

describe('public user lookup', () => {
  it('honours the followers-by-default profile visibility', async () => {
    const target = await signup(h.app);
    const viewer = await signup(h.app);

    const denied = await h.app.inject({
      method: 'GET',
      url: `/users/${target.id}`,
      headers: bearer(viewer.accessToken),
    });
    expect(denied.statusCode).toBe(404);

    await makePublic(target.accessToken);
    const allowed = await h.app.inject({
      method: 'GET',
      url: `/users/${target.id}`,
      headers: bearer(viewer.accessToken),
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().displayName).toBe('Test Athlete');
    expect(allowed.json()).not.toHaveProperty('email');
  });

  it('lets a user see their own profile regardless of visibility', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: bearer(user.accessToken),
    });
    expect(res.statusCode).toBe(200);
  });

  it('is reachable anonymously for public profiles', async () => {
    const target = await signup(h.app);
    await makePublic(target.accessToken);
    const res = await h.app.inject({ method: 'GET', url: `/users/${target.id}` });
    expect(res.statusCode).toBe(200);
  });

  it('hides a public profile from a blocked user in both directions', async () => {
    const blocker = await signup(h.app);
    const blocked = await signup(h.app);
    await makePublic(blocker.accessToken);
    await makePublic(blocked.accessToken);

    const before = await h.app.inject({
      method: 'GET',
      url: `/users/${blocker.id}`,
      headers: bearer(blocked.accessToken),
    });
    expect(before.statusCode).toBe(200);

    const block = await h.app.inject({
      method: 'PUT',
      url: `/me/blocks/${blocked.id}`,
      headers: bearer(blocker.accessToken),
    });
    expect(block.statusCode).toBe(200);

    const blockedView = await h.app.inject({
      method: 'GET',
      url: `/users/${blocker.id}`,
      headers: bearer(blocked.accessToken),
    });
    expect(blockedView.statusCode).toBe(404);

    const blockerView = await h.app.inject({
      method: 'GET',
      url: `/users/${blocked.id}`,
      headers: bearer(blocker.accessToken),
    });
    expect(blockerView.statusCode).toBe(404);

    await h.app.inject({
      method: 'DELETE',
      url: `/me/blocks/${blocked.id}`,
      headers: bearer(blocker.accessToken),
    });
    const after = await h.app.inject({
      method: 'GET',
      url: `/users/${blocker.id}`,
      headers: bearer(blocked.accessToken),
    });
    expect(after.statusCode).toBe(200);
  });
});

describe('blocks and mutes', () => {
  it('lists blocks and mutes and is idempotent', async () => {
    const user = await signup(h.app);
    const other = await signup(h.app);

    await h.app.inject({
      method: 'PUT',
      url: `/me/blocks/${other.id}`,
      headers: bearer(user.accessToken),
    });
    const repeat = await h.app.inject({
      method: 'PUT',
      url: `/me/blocks/${other.id}`,
      headers: bearer(user.accessToken),
    });
    expect(repeat.statusCode).toBe(200);

    const blocks = await h.app.inject({
      method: 'GET',
      url: '/me/blocks',
      headers: bearer(user.accessToken),
    });
    expect(blocks.json().entries).toHaveLength(1);
    expect(blocks.json().entries[0].userId).toBe(other.id);
    expect(blocks.json().entries[0].displayName).toBe('Test Athlete');

    await h.app.inject({
      method: 'PUT',
      url: `/me/mutes/${other.id}`,
      headers: bearer(user.accessToken),
    });
    const mutes = await h.app.inject({
      method: 'GET',
      url: '/me/mutes',
      headers: bearer(user.accessToken),
    });
    expect(mutes.json().entries).toHaveLength(1);

    await h.app.inject({
      method: 'DELETE',
      url: `/me/mutes/${other.id}`,
      headers: bearer(user.accessToken),
    });
    const afterUnmute = await h.app.inject({
      method: 'GET',
      url: '/me/mutes',
      headers: bearer(user.accessToken),
    });
    expect(afterUnmute.json().entries).toHaveLength(0);
  });

  it('refuses self-targeting and unknown users', async () => {
    const user = await signup(h.app);
    const self = await h.app.inject({
      method: 'PUT',
      url: `/me/blocks/${user.id}`,
      headers: bearer(user.accessToken),
    });
    expect(self.statusCode).toBe(400);

    const ghost = await h.app.inject({
      method: 'PUT',
      url: '/me/blocks/00000000-0000-4000-8000-000000000000',
      headers: bearer(user.accessToken),
    });
    expect(ghost.statusCode).toBe(404);
  });
});

describe('reports', () => {
  it('files a report in the open state', async () => {
    const reporter = await signup(h.app);
    const target = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/reports',
      headers: bearer(reporter.accessToken),
      payload: { targetUserId: target.id, reason: 'harassment', details: 'Abusive comments.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('open');
    expect(res.json().reason).toBe('harassment');
  });

  it('rejects an unknown reason', async () => {
    const reporter = await signup(h.app);
    const target = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/reports',
      headers: bearer(reporter.accessToken),
      payload: { targetUserId: target.id, reason: 'vibes' },
    });
    expect(res.statusCode).toBe(400);
  });
});
