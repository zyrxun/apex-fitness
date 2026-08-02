/**
 * Deterministic synthetic recordings. Every track runs due north from the start
 * point, which makes the expected distance exact rather than approximate: with
 * no change in longitude the haversine reduces to R * dLat, so a fixture that
 * advances `speedMs` metres per second has travelled precisely that far.
 */

export const M_PER_DEG_LAT = (Math.PI * 6_371_008.8) / 180;

/** Mulberry32 — tiny, seedable, and identical on every machine and run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface TrackOptions {
  /** Sample count at 1 Hz. */
  samples: number;
  speedMs?: number;
  startLat?: number;
  startLng?: number;
  /** Metres of altitude at sample i, before noise. */
  altitudeAt?: (i: number) => number;
  /** Peak-to-peak barometric noise added to altitude, in metres. */
  altitudeNoiseM?: number;
  heartrateAt?: (i: number) => number;
  /** Half-open [from, to): samples where the athlete stands still. */
  pause?: { from: number; to: number };
  seed?: number;
}

export interface SyntheticTrack {
  time: number[];
  latlng: [number, number][];
  altitude?: number[];
  heartrate?: number[];
  /** Ground truth: metres actually travelled. */
  distanceM: number;
  /** Ground truth: seconds spent moving. */
  movingS: number;
  elapsedS: number;
}

export function buildTrack(options: TrackOptions): SyntheticTrack {
  const {
    samples,
    speedMs = 3,
    startLat = -36.85,
    startLng = 174.76,
    altitudeAt,
    altitudeNoiseM = 0,
    heartrateAt,
    pause,
    seed = 42,
  } = options;

  const random = rng(seed);
  const time: number[] = [];
  const latlng: [number, number][] = [];
  const altitude: number[] = [];
  const heartrate: number[] = [];

  let lat = startLat;
  let distanceM = 0;
  let movingS = 0;

  for (let i = 0; i < samples; i += 1) {
    if (i > 0) {
      const paused = pause !== undefined && i >= pause.from && i < pause.to;
      if (!paused) {
        lat += speedMs / M_PER_DEG_LAT;
        distanceM += speedMs;
        movingS += 1;
      }
    }
    time.push(i);
    latlng.push([lat, startLng]);
    if (altitudeAt) {
      altitude.push(altitudeAt(i) + (altitudeNoiseM ? (random() - 0.5) * altitudeNoiseM : 0));
    }
    if (heartrateAt) heartrate.push(heartrateAt(i));
  }

  return {
    time,
    latlng,
    ...(altitudeAt ? { altitude } : {}),
    ...(heartrateAt ? { heartrate } : {}),
    distanceM,
    movingS,
    elapsedS: samples - 1,
  };
}

/** Body for POST /activities built from a synthetic track. */
export function uploadBody(
  track: SyntheticTrack,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    uploadId: crypto.randomUUID(),
    sportType: 'Run',
    name: 'Synthetic run',
    startedAt: '2026-03-01T06:00:00.000Z',
    timezone: 'Pacific/Auckland',
    elapsedS: track.elapsedS,
    distanceM: track.distanceM,
    streams: {
      time: track.time,
      latlng: track.latlng,
      ...(track.altitude ? { altitude: track.altitude } : {}),
      ...(track.heartrate ? { heartrate: track.heartrate } : {}),
    },
    ...overrides,
  };
}
