import { and, eq, isNull } from 'drizzle-orm';
import { sportCategory } from '@apex/shared';
import type { AppContext } from '../context.js';
import { activities, privacySettings, privacyZones, users } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { iso, isoRequired } from '../lib/time.js';
import { encodePolyline, type LatLng } from '../processing/geo.js';
import {
  planZoneRedaction,
  survivingPoints,
  type PrivacyZoneCircle,
  type RedactionPlan,
} from '../processing/privacy-zones.js';
import type { ActivityRow } from './activities.js';

export interface ViewerContext {
  activity: ActivityRow;
  isOwner: boolean;
  /** Empty for the owner — owners always see their own full track. */
  zones: PrivacyZoneCircle[];
  /** Phase-1 granular stat hiding, enforced here for the first time. */
  hidePace: boolean;
  hideHeartrate: boolean;
}

export interface OwnerPrivacy {
  zones: PrivacyZoneCircle[];
  hidePace: boolean;
  hideHeartrate: boolean;
}

const OWNER_PRIVACY_OFF: OwnerPrivacy = { zones: [], hidePace: false, hideHeartrate: false };

/**
 * Visibility denials and blocks both 404 rather than 403: a 403 would confirm
 * that the activity exists, which is exactly what a private activity must not
 * do. Same convention as GET /users/:id.
 */
export async function loadActivityForViewer(
  ctx: AppContext,
  activityId: string,
  viewerId: string | null,
): Promise<ViewerContext> {
  const gone = notFound('activity_not_found', 'Activity not found');

  const [row] = await ctx.db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
    .limit(1);
  if (!row) throw gone;

  const isOwner = viewerId === row.userId;
  if (!isOwner) {
    const [owner] = await ctx.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (!owner || owner.status !== 'active') throw gone;

    if (row.visibility === 'private') throw gone;
    // TODO(phase-5): resolve 'followers' against the asymmetric follow graph.
    // Until it exists nobody follows anybody, so only 'public' is viewable.
    if (row.visibility === 'followers') throw gone;

    const { blockExistsEitherWay } = await import('./social.js');
    if (viewerId && (await blockExistsEitherWay(ctx, viewerId, row.userId))) throw gone;
  }

  const privacy = isOwner ? OWNER_PRIVACY_OFF : await loadOwnerPrivacy(ctx, row.userId);
  return { activity: row, isOwner, ...privacy };
}

/** Zones only apply when the owner has the feature switched on (default: yes). */
export async function loadOwnerPrivacy(ctx: AppContext, ownerId: string): Promise<OwnerPrivacy> {
  const [settings] = await ctx.db
    .select({
      enabled: privacySettings.privacyZonesEnabled,
      hidePace: privacySettings.hidePace,
      hideHeartrate: privacySettings.hideHeartrate,
    })
    .from(privacySettings)
    .where(eq(privacySettings.userId, ownerId))
    .limit(1);
  if (!settings) return OWNER_PRIVACY_OFF;

  const zones = settings.enabled
    ? await ctx.db
        .select({
          id: privacyZones.id,
          centerLat: privacyZones.centerLat,
          centerLng: privacyZones.centerLng,
          radiusM: privacyZones.radiusM,
        })
        .from(privacyZones)
        .where(eq(privacyZones.userId, ownerId))
    : [];

  return { zones, hidePace: settings.hidePace, hideHeartrate: settings.hideHeartrate };
}

export interface RedactedSummary {
  mapPolyline: string | null;
  startLatLng: LatLng | null;
  endLatLng: LatLng | null;
  privacyRedacted: boolean;
}

/**
 * Suppresses the map summary and the start/end pins for a non-owner. The
 * polyline is re-encoded from the surviving points, so a track that enters a
 * zone comes back with a visible gap rather than a straight line drawn through
 * the athlete's front door.
 */
export function redactSummary(view: ViewerContext): RedactedSummary {
  const { activity, zones } = view;
  const summary = activity.mapSummary ?? [];
  const start: LatLng | null =
    activity.startLat !== null && activity.startLng !== null
      ? [activity.startLat, activity.startLng]
      : null;
  const end: LatLng | null =
    activity.endLat !== null && activity.endLng !== null
      ? [activity.endLat, activity.endLng]
      : null;

  if (view.isOwner || zones.length === 0) {
    return {
      mapPolyline: summary.length > 0 ? encodePolyline(summary) : null,
      startLatLng: start,
      endLatLng: end,
      privacyRedacted: false,
    };
  }

  const seed = activity.privacyFuzzSeed;
  const summaryPlan = planZoneRedaction(summary, zones, seed);
  const pinPlan = planZoneRedaction([start, end], zones, seed);
  const kept = survivingPoints(summary, summaryPlan);

  return {
    mapPolyline: kept.length > 0 ? encodePolyline(kept) : null,
    startLatLng: pinPlan.redacted[0] ? null : start,
    endLatLng: pinPlan.redacted[1] ? null : end,
    privacyRedacted: summaryPlan.anyRedacted || pinPlan.anyRedacted,
  };
}

/** Redaction plan for the full-resolution positional streams. */
export function planStreamRedaction(
  view: ViewerContext,
  track: (LatLng | null)[],
): RedactionPlan | null {
  if (view.isOwner || view.zones.length === 0) return null;
  return planZoneRedaction(track, view.zones, view.activity.privacyFuzzSeed);
}

/** Streams a viewer is allowed to receive, after the Phase-1 stat flags. */
export function streamIsVisible(view: ViewerContext, streamType: string): boolean {
  if (view.isOwner) return true;
  if (view.hideHeartrate && streamType === 'heartrate') return false;
  // `time` stays: every other stream is index-aligned to it, so withholding it
  // would break the response rather than hide anything the track does not.
  if (view.hidePace && streamType === 'velocity') return false;
  return true;
}

export function serializeActivity(view: ViewerContext) {
  const row = view.activity;
  const summary = redactSummary(view);
  const hideHr = !view.isOwner && view.hideHeartrate;
  const hidePace = !view.isOwner && view.hidePace;
  return {
    id: row.id,
    userId: row.userId,
    uploadId: row.uploadId,
    sportType: row.sportType,
    sportCategory: sportCategory(row.sportType),
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    startedAt: isoRequired(row.startedAt),
    timezone: row.timezone,
    elapsedS: row.elapsedS,
    movingS: row.movingS,
    distanceM: row.distanceM,
    elevGainM: row.elevGainM,
    elevLossM: row.elevLossM,
    avgSpeedMs: hidePace ? null : row.avgSpeedMs,
    maxSpeedMs: hidePace ? null : row.maxSpeedMs,
    avgHr: hideHr ? null : row.avgHr,
    maxHr: hideHr ? null : row.maxHr,
    avgCadence: row.avgCadence,
    maxCadence: row.maxCadence,
    avgPowerW: row.avgPowerW,
    maxPowerW: row.maxPowerW,
    avgGapSecPerKm: hidePace ? null : row.avgGapSecPerKm,
    calories: row.calories,
    hrZoneTimes: hideHr ? null : row.hrZoneTimes,
    avgSwolf: row.avgSwolf,
    totalStrokes: row.totalStrokes,
    poolLengthM: row.poolLengthM,
    isManual: row.isManual,
    isTrainer: row.isTrainer,
    isIndoor: row.isIndoor,
    deviceName: row.deviceName,
    sourceApp: row.sourceApp,
    processingStatus: row.processingStatus,
    processingError: row.processingError,
    startLatLng: summary.startLatLng,
    endLatLng: summary.endLatLng,
    mapPolyline: summary.mapPolyline,
    region: row.region,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
    privacyRedacted: summary.privacyRedacted,
    processedAt: iso(row.processedAt),
  };
}
