import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createHarness, signup, type TestHarness } from './helpers.js';
import { buildTrack, uploadBody } from './fixtures/track.js';

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** Upload and wait for the queue worker to finish deriving it. */
async function upload(token: string, payload: Record<string, unknown>) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/activities',
    headers: bearer(token),
    payload,
  });
  if (res.statusCode === 201) await h.awaitProcessed(res.json().id);
  return res;
}

const get = (url: string, token?: string) =>
  h.app.inject({ method: 'GET', url, ...(token ? { headers: bearer(token) } : {}) });

describe('sport taxonomy', () => {
  it('publishes every sport with its category metadata', async () => {
    const res = await get('/sports');
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.categories).toEqual(['run', 'ride', 'swim', 'strength', 'other']);
    expect(body.sports.length).toBeGreaterThan(60);

    const run = body.sports.find((s: { sportType: string }) => s.sportType === 'Run');
    expect(run).toEqual({
      sportType: 'Run',
      category: 'run',
      hasGps: true,
      hasPool: false,
      distanceRelevant: true,
    });

    const swim = body.sports.find((s: { sportType: string }) => s.sportType === 'Swim');
    expect(swim.hasPool).toBe(true);
    expect(swim.hasGps).toBe(false);

    const weights = body.sports.find(
      (s: { sportType: string }) => s.sportType === 'WeightTraining',
    );
    expect(weights.category).toBe('strength');
    expect(weights.distanceRelevant).toBe(false);
  });
});

describe('upload and processing', () => {
  it('derives aggregates from a synthetic GPS run', async () => {
    const user = await signup(h.app);
    const track = buildTrack({
      samples: 1201,
      speedMs: 3,
      altitudeAt: (i) => i / 12,
      heartrateAt: () => 150,
    });

    const created = await upload(user.accessToken, uploadBody(track));
    expect(created.statusCode).toBe(201);
    expect(created.json().processingStatus).toBe('pending');

    const res = await get(`/activities/${created.json().id}`, user.accessToken);
    const activity = res.json();

    expect(activity.processingStatus).toBe('ready');
    expect(activity.distanceM).toBeCloseTo(3600, 0);
    expect(activity.movingS).toBe(1200);
    expect(activity.elevGainM).toBeCloseTo(100, 0);
    expect(activity.elevLossM).toBe(0);
    expect(activity.avgHr).toBe(150);
    expect(activity.avgSpeedMs).toBeCloseTo(3, 2);
    expect(activity.calories).toBeGreaterThan(0);
    expect(activity.mapPolyline).toBeTruthy();
    expect(activity.startLatLng).not.toBeNull();
    expect(activity.isOwner).toBe(true);

    const km = activity.splits.filter((s: { unit: string }) => s.unit === 'km');
    const mile = activity.splits.filter((s: { unit: string }) => s.unit === 'mile');
    expect(km).toHaveLength(4);
    expect(mile).toHaveLength(3);
    expect(km.reduce((sum: number, s: { distanceM: number }) => sum + s.distanceM, 0)).toBeCloseTo(
      activity.distanceM,
      3,
    );
    expect(km[0].gapS).not.toBeNull();
  });

  it('detects a stationary gap as paused rather than slow', async () => {
    const user = await signup(h.app);
    const track = buildTrack({ samples: 601, speedMs: 3, pause: { from: 200, to: 400 } });

    const created = await upload(user.accessToken, uploadBody(track));
    const activity = (await get(`/activities/${created.json().id}`, user.accessToken)).json();

    expect(activity.elapsedS).toBe(600);
    expect(activity.movingS).toBe(400);
    expect(activity.distanceM).toBeCloseTo(1200, 0);
  });

  it('kills barometric noise on a flat road', async () => {
    const user = await signup(h.app);
    const track = buildTrack({ samples: 601, altitudeAt: () => 42, altitudeNoiseM: 3 });

    const created = await upload(user.accessToken, uploadBody(track));
    const activity = (await get(`/activities/${created.json().id}`, user.accessToken)).json();

    expect(activity.elevGainM).toBe(0);
    expect(activity.elevLossM).toBe(0);
  });

  it('returns the original activity when the same uploadId is retried', async () => {
    const user = await signup(h.app);
    const track = buildTrack({ samples: 120 });
    const body = uploadBody(track);

    const first = await upload(user.accessToken, body);
    expect(first.statusCode).toBe(201);

    const retry = await h.app.inject({
      method: 'POST',
      url: '/activities',
      headers: bearer(user.accessToken),
      payload: body,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);

    const list = await get('/activities', user.accessToken);
    expect(list.json().activities).toHaveLength(1);
  });

  it('lets two athletes reuse the same uploadId independently', async () => {
    const a = await signup(h.app);
    const b = await signup(h.app);
    const body = uploadBody(buildTrack({ samples: 60 }));

    expect((await upload(a.accessToken, body)).statusCode).toBe(201);
    expect((await upload(b.accessToken, body)).statusCode).toBe(201);
  });

  it('stores raw and cleaned position streams side by side', async () => {
    const user = await signup(h.app);
    const track = buildTrack({ samples: 300, heartrateAt: () => 140 });

    const created = await upload(user.accessToken, uploadBody(track));
    const res = await get(`/activities/${created.json().id}/streams`, user.accessToken);
    const streams = res.json().streams;

    expect(Object.keys(streams).sort()).toEqual(['heartrate', 'latlng', 'latlng_clean', 'time']);
    expect(streams.latlng.data).toEqual(track.latlng);
    expect(streams.latlng_clean.sampleCount).toBe(track.latlng.length);

    const selected = await get(
      `/activities/${created.json().id}/streams?keys=time,heartrate`,
      user.accessToken,
    );
    expect(Object.keys(selected.json().streams).sort()).toEqual(['heartrate', 'time']);

    const bogus = await get(`/activities/${created.json().id}/streams?keys=nope`, user.accessToken);
    expect(bogus.statusCode).toBe(400);
  });
});

describe('upload validation', () => {
  const user = () => signup(h.app);

  it('rejects streams that are not index-aligned with time', async () => {
    const u = await user();
    const track = buildTrack({ samples: 100 });
    const res = await h.app.inject({
      method: 'POST',
      url: '/activities',
      headers: bearer(u.accessToken),
      payload: uploadBody(track, {
        streams: { time: track.time, latlng: track.latlng.slice(0, 50) },
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a time stream that goes backwards', async () => {
    const u = await user();
    const res = await h.app.inject({
      method: 'POST',
      url: '/activities',
      headers: bearer(u.accessToken),
      payload: uploadBody(buildTrack({ samples: 3 }), {
        streams: { time: [0, 5, 2] },
        elapsedS: 5,
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects out-of-range coordinates and moving time above elapsed', async () => {
    const u = await user();
    const outOfRange = await h.app.inject({
      method: 'POST',
      url: '/activities',
      headers: bearer(u.accessToken),
      payload: uploadBody(buildTrack({ samples: 2 }), {
        streams: {
          time: [0, 1],
          latlng: [
            [0, 0],
            [95, 0],
          ],
        },
        elapsedS: 1,
      }),
    });
    expect(outOfRange.statusCode).toBe(400);

    const impossibleMoving = await h.app.inject({
      method: 'POST',
      url: '/activities',
      headers: bearer(u.accessToken),
      payload: uploadBody(buildTrack({ samples: 10 }), { elapsedS: 9, movingS: 100 }),
    });
    expect(impossibleMoving.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/activities',
      payload: uploadBody(buildTrack({ samples: 10 })),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('manual entry', () => {
  it('skips the pipeline and is ready immediately', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/activities/manual',
      headers: bearer(user.accessToken),
      payload: {
        sportType: 'WeightTraining',
        name: 'Deadlifts',
        startedAt: '2026-02-14T18:00:00.000Z',
        elapsedS: 3600,
        description: 'Felt heavy',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.isManual).toBe(true);
    expect(body.processingStatus).toBe('ready');
    expect(body.uploadId).toBeNull();
    expect(body.sportCategory).toBe('strength');
    expect(body.mapPolyline).toBeNull();
  });

  it('computes average speed from a supplied distance', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/activities/manual',
      headers: bearer(user.accessToken),
      payload: {
        sportType: 'Run',
        name: 'Treadmill',
        startedAt: '2026-02-15T18:00:00.000Z',
        elapsedS: 1800,
        distanceM: 6000,
      },
    });
    expect(res.json().avgSpeedMs).toBeCloseTo(3.333, 3);
  });
});

describe('swim uploads', () => {
  it('derives SWOLF from the supplied lengths', async () => {
    const user = await signup(h.app);
    const created = await upload(user.accessToken, {
      uploadId: randomUUID(),
      sportType: 'Swim',
      name: 'Lunchtime 1k',
      startedAt: '2026-02-20T12:00:00.000Z',
      elapsedS: 1200,
      poolLengthM: 25,
      swimLengths: Array.from({ length: 40 }, () => ({
        stroke: 'freestyle',
        durationS: 28,
        strokeCount: 18,
      })),
    });
    expect(created.statusCode).toBe(201);

    const activity = (await get(`/activities/${created.json().id}`, user.accessToken)).json();
    expect(activity.distanceM).toBe(1000);
    expect(activity.avgSwolf).toBeCloseTo(46, 5);
    expect(activity.totalStrokes).toBe(720);
    expect(activity.swimLengths).toHaveLength(40);
    expect(activity.swimLengths[0].stroke).toBe('freestyle');
  });

  it('rejects swim lengths without a pool length', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/activities',
      headers: bearer(user.accessToken),
      payload: {
        uploadId: randomUUID(),
        sportType: 'Swim',
        name: 'No pool length',
        startedAt: '2026-02-20T12:00:00.000Z',
        elapsedS: 600,
        swimLengths: [{ stroke: 'freestyle', durationS: 30 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('listing and CRUD', () => {
  it('paginates own activities newest first and filters by sport and date', async () => {
    const user = await signup(h.app);
    const days = ['2026-01-01', '2026-01-02', '2026-01-03'];
    for (const [i, day] of days.entries()) {
      await h.app.inject({
        method: 'POST',
        url: '/activities/manual',
        headers: bearer(user.accessToken),
        payload: {
          sportType: i === 1 ? 'Ride' : 'Run',
          name: `Session ${i}`,
          startedAt: `${day}T06:00:00.000Z`,
          elapsedS: 1800,
        },
      });
    }

    const page1 = await get('/activities?limit=2', user.accessToken);
    expect(page1.json().activities.map((a: { name: string }) => a.name)).toEqual([
      'Session 2',
      'Session 1',
    ]);
    expect(page1.json().nextCursor).toBeTruthy();

    const page2 = await get(
      `/activities?limit=2&cursor=${encodeURIComponent(page1.json().nextCursor)}`,
      user.accessToken,
    );
    expect(page2.json().activities.map((a: { name: string }) => a.name)).toEqual(['Session 0']);
    expect(page2.json().nextCursor).toBeNull();

    const rides = await get('/activities?sportCategory=ride', user.accessToken);
    expect(rides.json().activities).toHaveLength(1);
    expect(rides.json().activities[0].sportType).toBe('Ride');

    const window = await get(
      '/activities?startedAfter=2026-01-02T00:00:00.000Z&startedBefore=2026-01-02T23:59:59.000Z',
      user.accessToken,
    );
    expect(window.json().activities).toHaveLength(1);
  });

  it('patches editable fields and soft-deletes', async () => {
    const user = await signup(h.app);
    const created = await h.app.inject({
      method: 'POST',
      url: '/activities/manual',
      headers: bearer(user.accessToken),
      payload: {
        sportType: 'Run',
        name: 'Morning shuffle',
        startedAt: '2026-01-10T06:00:00.000Z',
        elapsedS: 1800,
      },
    });
    const id = created.json().id;

    const patched = await h.app.inject({
      method: 'PATCH',
      url: `/activities/${id}`,
      headers: bearer(user.accessToken),
      payload: { name: 'Actually a hike', sportType: 'Hike', visibility: 'public' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe('Actually a hike');
    expect(patched.json().sportCategory).toBe('other');
    expect(patched.json().visibility).toBe('public');

    const empty = await h.app.inject({
      method: 'PATCH',
      url: `/activities/${id}`,
      headers: bearer(user.accessToken),
      payload: {},
    });
    expect(empty.statusCode).toBe(400);

    const stranger = await signup(h.app);
    const notYours = await h.app.inject({
      method: 'PATCH',
      url: `/activities/${id}`,
      headers: bearer(stranger.accessToken),
      payload: { name: 'Mine now' },
    });
    expect(notYours.statusCode).toBe(404);

    const deleted = await h.app.inject({
      method: 'DELETE',
      url: `/activities/${id}`,
      headers: bearer(user.accessToken),
    });
    expect(deleted.statusCode).toBe(200);

    expect((await get(`/activities/${id}`, user.accessToken)).statusCode).toBe(404);
    expect((await get('/activities', user.accessToken)).json().activities).toHaveLength(0);

    const twice = await h.app.inject({
      method: 'DELETE',
      url: `/activities/${id}`,
      headers: bearer(user.accessToken),
    });
    expect(twice.statusCode).toBe(404);
  });
});

describe('visibility', () => {
  async function manual(token: string, visibility: string, name = 'Session') {
    const res = await h.app.inject({
      method: 'POST',
      url: '/activities/manual',
      headers: bearer(token),
      payload: {
        sportType: 'Run',
        name,
        startedAt: '2026-01-20T06:00:00.000Z',
        elapsedS: 1800,
        visibility,
      },
    });
    return res.json().id as string;
  }

  it('inherits the default visibility from privacy settings at creation', async () => {
    const user = await signup(h.app);
    const first = await h.app.inject({
      method: 'POST',
      url: '/activities/manual',
      headers: bearer(user.accessToken),
      payload: {
        sportType: 'Run',
        name: 'Default visibility',
        startedAt: '2026-01-21T06:00:00.000Z',
        elapsedS: 600,
      },
    });
    expect(first.json().visibility).toBe('followers');

    await h.app.inject({
      method: 'PATCH',
      url: '/me/privacy',
      headers: bearer(user.accessToken),
      payload: { defaultActivityVisibility: 'public' },
    });

    const second = await h.app.inject({
      method: 'POST',
      url: '/activities/manual',
      headers: bearer(user.accessToken),
      payload: {
        sportType: 'Run',
        name: 'After the change',
        startedAt: '2026-01-22T06:00:00.000Z',
        elapsedS: 600,
      },
    });
    expect(second.json().visibility).toBe('public');
    // The earlier activity keeps the visibility it was created with.
    expect((await get(`/activities/${first.json().id}`, user.accessToken)).json().visibility).toBe(
      'followers',
    );
  });

  it('hides private and followers-only activities from a stranger with a 404', async () => {
    const owner = await signup(h.app);
    const stranger = await signup(h.app);

    const priv = await manual(owner.accessToken, 'private', 'Secret');
    const followers = await manual(owner.accessToken, 'followers', 'Friends only');
    const open = await manual(owner.accessToken, 'public', 'Open');

    expect((await get(`/activities/${priv}`, stranger.accessToken)).statusCode).toBe(404);
    // TODO(phase-5): becomes 200 for actual followers once the graph exists.
    expect((await get(`/activities/${followers}`, stranger.accessToken)).statusCode).toBe(404);
    expect((await get(`/activities/${open}`, stranger.accessToken)).statusCode).toBe(200);
    expect((await get(`/activities/${priv}`)).statusCode).toBe(404);
    expect((await get(`/activities/${open}`)).statusCode).toBe(200);

    expect((await get(`/activities/${priv}`, owner.accessToken)).statusCode).toBe(200);
  });

  it("lists only another athlete's public activities", async () => {
    const owner = await signup(h.app);
    const viewer = await signup(h.app);

    await manual(owner.accessToken, 'public', 'Public run');
    await manual(owner.accessToken, 'private', 'Private run');

    const res = await get(`/users/${owner.id}/activities`, viewer.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().activities.map((a: { name: string }) => a.name)).toEqual(['Public run']);
  });

  it('hides a blocked athlete entirely', async () => {
    const owner = await signup(h.app);
    const blocked = await signup(h.app);
    const id = await manual(owner.accessToken, 'public', 'Public run');

    await h.app.inject({
      method: 'PUT',
      url: `/me/blocks/${blocked.id}`,
      headers: bearer(owner.accessToken),
    });

    expect((await get(`/activities/${id}`, blocked.accessToken)).statusCode).toBe(404);
    expect((await get(`/users/${owner.id}/activities`, blocked.accessToken)).statusCode).toBe(404);
  });

  it('masks pace and heart rate when the owner hid those stats', async () => {
    const owner = await signup(h.app);
    const viewer = await signup(h.app);
    await h.app.inject({
      method: 'PATCH',
      url: '/me/privacy',
      headers: bearer(owner.accessToken),
      payload: { hidePace: true, hideHeartrate: true, defaultActivityVisibility: 'public' },
    });

    const track = buildTrack({ samples: 600, heartrateAt: () => 150 });
    const created = await upload(owner.accessToken, uploadBody(track));
    const id = created.json().id;

    const mine = (await get(`/activities/${id}`, owner.accessToken)).json();
    expect(mine.avgHr).toBe(150);
    expect(mine.avgSpeedMs).toBeGreaterThan(0);

    const theirs = (await get(`/activities/${id}`, viewer.accessToken)).json();
    expect(theirs.avgHr).toBeNull();
    expect(theirs.avgSpeedMs).toBeNull();
    expect(theirs.hrZoneTimes).toBeNull();
    expect(theirs.isOwner).toBe(false);

    const streams = (await get(`/activities/${id}/streams`, viewer.accessToken)).json().streams;
    expect(streams.heartrate).toBeUndefined();
    expect(streams.time).toBeDefined();
  });
});

describe('privacy zone redaction', () => {
  it('removes points inside the zone for strangers but never for the owner', async () => {
    const owner = await signup(h.app);
    const stranger = await signup(h.app);

    // Zone sits on the start of the track, so the run leaves the zone partway.
    const startLat = -36.9;
    const startLng = 174.8;
    await h.app.inject({
      method: 'POST',
      url: '/me/privacy-zones',
      headers: bearer(owner.accessToken),
      payload: { label: 'Home', centerLat: startLat, centerLng: startLng, radiusM: 500 },
    });

    const track = buildTrack({ samples: 900, speedMs: 3, startLat, startLng });
    const created = await upload(owner.accessToken, uploadBody(track, { visibility: 'public' }));
    const id = created.json().id;

    const mine = (await get(`/activities/${id}`, owner.accessToken)).json();
    expect(mine.privacyRedacted).toBe(false);
    expect(mine.startLatLng).not.toBeNull();

    const theirs = (await get(`/activities/${id}`, stranger.accessToken)).json();
    expect(theirs.privacyRedacted).toBe(true);
    expect(theirs.startLatLng).toBeNull();
    expect(theirs.endLatLng).not.toBeNull(); // 2.7 km away, well outside
    expect(theirs.mapPolyline).not.toBe(mine.mapPolyline);
    // Aggregates survive: privacy zones hide where, not what.
    expect(theirs.distanceM).toBeCloseTo(mine.distanceM, 6);

    const ownerStreams = (await get(`/activities/${id}/streams`, owner.accessToken)).json();
    expect(ownerStreams.privacyRedacted).toBe(false);
    expect(ownerStreams.streams.latlng.data[0]).toEqual(track.latlng[0]);

    const strangerStreams = (await get(`/activities/${id}/streams`, stranger.accessToken)).json();
    expect(strangerStreams.privacyRedacted).toBe(true);

    const raw = strangerStreams.streams.latlng.data;
    const clean = strangerStreams.streams.latlng_clean.data;
    expect(raw).toHaveLength(track.latlng.length);
    expect(raw[0]).toBeNull();
    expect(raw[899]).toEqual(track.latlng[899]);
    // Raw and cleaned are censored at exactly the same indices, so anything
    // index-aligned with them stays aligned.
    expect(raw.map((p: unknown) => p === null)).toEqual(clean.map((p: unknown) => p === null));

    // More than the zone radius is removed — the fuzz extends past the edge.
    const removed = raw.filter((p: unknown) => p === null).length;
    expect(removed).toBeGreaterThan(500 / 3);
    expect(removed).toBeLessThan((500 + 200) / 3 + 2);
  });

  it('applies the same fuzz on every request', async () => {
    const owner = await signup(h.app);
    const stranger = await signup(h.app);
    const startLat = -37.1;
    const startLng = 175.2;

    await h.app.inject({
      method: 'POST',
      url: '/me/privacy-zones',
      headers: bearer(owner.accessToken),
      payload: { label: 'Home', centerLat: startLat, centerLng: startLng, radiusM: 400 },
    });

    const track = buildTrack({ samples: 600, speedMs: 3, startLat, startLng });
    const created = await upload(owner.accessToken, uploadBody(track, { visibility: 'public' }));
    const url = `/activities/${created.json().id}/streams?keys=latlng`;

    const first = (await get(url, stranger.accessToken)).json();
    const second = (await get(url, stranger.accessToken)).json();
    expect(first.streams.latlng.data).toEqual(second.streams.latlng.data);
    expect(
      (await get(`/activities/${created.json().id}`, stranger.accessToken)).json().mapPolyline,
    ).toBe(
      (await get(`/activities/${created.json().id}`, stranger.accessToken)).json().mapPolyline,
    );
  });

  it('leaves activities alone when the owner disabled privacy zones', async () => {
    const owner = await signup(h.app);
    const stranger = await signup(h.app);
    const startLat = -37.3;
    const startLng = 175.5;

    await h.app.inject({
      method: 'POST',
      url: '/me/privacy-zones',
      headers: bearer(owner.accessToken),
      payload: { label: 'Home', centerLat: startLat, centerLng: startLng, radiusM: 500 },
    });
    await h.app.inject({
      method: 'PATCH',
      url: '/me/privacy',
      headers: bearer(owner.accessToken),
      payload: { privacyZonesEnabled: false },
    });

    const track = buildTrack({ samples: 300, startLat, startLng });
    const created = await upload(owner.accessToken, uploadBody(track, { visibility: 'public' }));
    const theirs = (await get(`/activities/${created.json().id}`, stranger.accessToken)).json();
    expect(theirs.privacyRedacted).toBe(false);
    expect(theirs.startLatLng).not.toBeNull();
  });
});

describe('personal records', () => {
  it('reports the fastest rolling effort per distance', async () => {
    const user = await signup(h.app);

    const slow = buildTrack({ samples: 1201, speedMs: 3 }); // 5:33/km
    await upload(user.accessToken, uploadBody(slow, { name: 'Easy run' }));

    const fast = buildTrack({ samples: 1201, speedMs: 4 }); // 4:10/km
    await upload(user.accessToken, uploadBody(fast, { name: 'Tempo run' }));

    const res = await get('/me/prs', user.accessToken);
    expect(res.statusCode).toBe(200);
    const records = res.json().records;

    const km = records.find((r: { distanceM: number }) => r.distanceM === 1000);
    expect(km.label).toBe('1k');
    expect(km.elapsedS).toBeCloseTo(250, 0);
    expect(km.paceSecPerKm).toBeCloseTo(250, 0);
    expect(km.activityName).toBe('Tempo run');

    // 4.8 km is the longest run, so nothing beyond 1 km qualifies.
    expect(records.map((r: { distanceM: number }) => r.distanceM)).toEqual([1000]);
  });

  it('is empty for an athlete who has only logged manual sessions', async () => {
    const user = await signup(h.app);
    await h.app.inject({
      method: 'POST',
      url: '/activities/manual',
      headers: bearer(user.accessToken),
      payload: {
        sportType: 'Run',
        name: 'Manual',
        startedAt: '2026-01-01T06:00:00.000Z',
        elapsedS: 1800,
        distanceM: 6000,
      },
    });
    expect((await get('/me/prs', user.accessToken)).json().records).toEqual([]);
  });
});

describe('heart-rate zones', () => {
  it('estimates max HR from the profile date of birth until one is set', async () => {
    const user = await signup(h.app, { dateOfBirth: '1990-06-01' });

    const estimated = (await get('/me/hr-zones', user.accessToken)).json();
    expect(estimated.maxHrSource).toBe('age_estimate');
    expect(estimated.maxHr).toBeGreaterThan(180);
    expect(estimated.boundariesPct).toEqual([50, 60, 70, 80, 90]);
    expect(estimated.zones).toHaveLength(5);
    expect(estimated.zones[4].maxBpm).toBeNull();

    const saved = await h.app.inject({
      method: 'PUT',
      url: '/me/hr-zones',
      headers: bearer(user.accessToken),
      payload: { maxHr: 200, boundariesPct: [55, 65, 75, 85, 92] },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().maxHr).toBe(200);
    expect(saved.json().maxHrSource).toBe('configured');
    expect(saved.json().zones[0].minBpm).toBe(110);

    const persisted = (await get('/me/hr-zones', user.accessToken)).json();
    expect(persisted.maxHr).toBe(200);

    const bad = await h.app.inject({
      method: 'PUT',
      url: '/me/hr-zones',
      headers: bearer(user.accessToken),
      payload: { boundariesPct: [80, 70, 60, 50, 40] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('uses the configured zones when bucketing an upload', async () => {
    const user = await signup(h.app);
    await h.app.inject({
      method: 'PUT',
      url: '/me/hr-zones',
      headers: bearer(user.accessToken),
      payload: { maxHr: 200 },
    });

    const track = buildTrack({ samples: 600, heartrateAt: () => 190 }); // 95% => z5
    const created = await upload(user.accessToken, uploadBody(track));
    const activity = (await get(`/activities/${created.json().id}`, user.accessToken)).json();

    const z5 = activity.hrZoneTimes.find((b: { zone: number }) => b.zone === 5);
    expect(z5.seconds).toBe(599);
    expect(z5.minBpm).toBe(180);
  });
});

describe('data export', () => {
  it('includes activities and their streams', async () => {
    const user = await signup(h.app);
    const track = buildTrack({ samples: 200 });
    await upload(user.accessToken, uploadBody(track));

    const res = await get('/me/export', user.accessToken);
    expect(res.statusCode).toBe(200);
    const tables = res.json().tables;

    expect(tables.activities).toHaveLength(1);
    expect(tables.activity_streams.length).toBeGreaterThanOrEqual(2);
    expect(tables.activity_splits.length).toBeGreaterThan(0);
    expect(tables.hr_zone_settings).toEqual([]);
  });
});
