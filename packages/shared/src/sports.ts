// Sport taxonomy: a superset of Strava's ~50-value SportType enum plus the
// types their taxonomy punts to the generic "Workout" bucket. Renaming enum
// members after activities exist is expensive (PLAN 4.3), so the full set is
// declared up front and the ordering here is the canonical ordering everywhere.

export const SPORT_CATEGORIES = ['run', 'ride', 'swim', 'strength', 'other'] as const;
export type SportCategory = (typeof SPORT_CATEGORIES)[number];

export interface SportMeta {
  category: SportCategory;
  /** Recorded outdoors against GNSS; drives the GPS cleanup + distance stages. */
  hasGps: boolean;
  /** Pool discipline: lengths and SWOLF apply, GPS does not. */
  hasPool: boolean;
  /** Distance is a headline metric rather than incidental. */
  distanceRelevant: boolean;
}

const meta = (
  category: SportCategory,
  hasGps: boolean,
  distanceRelevant: boolean,
  hasPool = false,
): SportMeta => ({ category, hasGps, hasPool, distanceRelevant });

/**
 * The single source of truth. `SPORT_TYPES` is derived from the keys so the
 * enum and the metadata can never drift apart.
 */
export const SPORT_META = {
  // --- run ---------------------------------------------------------------
  Run: meta('run', true, true),
  TrailRun: meta('run', true, true),
  VirtualRun: meta('run', false, true),

  // --- ride --------------------------------------------------------------
  Ride: meta('ride', true, true),
  MountainBikeRide: meta('ride', true, true),
  GravelRide: meta('ride', true, true),
  EBikeRide: meta('ride', true, true),
  EMountainBikeRide: meta('ride', true, true),
  VirtualRide: meta('ride', false, true),
  Handcycle: meta('ride', true, true),
  Velomobile: meta('ride', true, true),

  // --- swim --------------------------------------------------------------
  Swim: meta('swim', false, true, true),
  OpenWaterSwim: meta('swim', true, true),

  // --- strength ----------------------------------------------------------
  // The strength engine (PLAN 4.4) consumes these three; everything else that
  // happens in a gym stays in `other` so it never feeds a strength rank.
  WeightTraining: meta('strength', false, false),
  Crossfit: meta('strength', false, false),
  HighIntensityIntervalTraining: meta('strength', false, false),

  // --- other: foot -------------------------------------------------------
  Hike: meta('other', true, true),
  Walk: meta('other', true, true),
  Rucking: meta('other', true, true),
  Wheelchair: meta('other', true, true),

  // --- other: snow -------------------------------------------------------
  AlpineSki: meta('other', true, true),
  BackcountrySki: meta('other', true, true),
  NordicSki: meta('other', true, true),
  Snowboard: meta('other', true, true),
  Snowshoe: meta('other', true, true),

  // --- other: water ------------------------------------------------------
  Rowing: meta('other', true, true),
  VirtualRow: meta('other', false, true),
  Kayaking: meta('other', true, true),
  Canoeing: meta('other', true, true),
  StandUpPaddling: meta('other', true, true),
  Surfing: meta('other', true, false),
  Kitesurf: meta('other', true, false),
  Windsurf: meta('other', true, false),
  Sail: meta('other', true, true),

  // --- other: wheels & blades -------------------------------------------
  IceSkate: meta('other', true, true),
  InlineSkate: meta('other', true, true),
  RollerSki: meta('other', true, true),
  Skateboard: meta('other', true, true),

  // --- other: gym / studio ----------------------------------------------
  Elliptical: meta('other', false, false),
  StairStepper: meta('other', false, false),
  Pilates: meta('other', false, false),
  Yoga: meta('other', false, false),
  Stretching: meta('other', false, false),
  PhysicalTherapy: meta('other', false, false),
  Workout: meta('other', false, false),

  // --- other: climbing ---------------------------------------------------
  RockClimbing: meta('other', true, false),
  IndoorClimbing: meta('other', false, false),

  // --- other: racquet ----------------------------------------------------
  Tennis: meta('other', false, false),
  Padel: meta('other', false, false),
  Squash: meta('other', false, false),
  Racquetball: meta('other', false, false),
  Badminton: meta('other', false, false),
  TableTennis: meta('other', false, false),
  Pickleball: meta('other', false, false),

  // --- other: team & field ----------------------------------------------
  Soccer: meta('other', true, false),
  Basketball: meta('other', false, false),
  Volleyball: meta('other', false, false),
  Rugby: meta('other', true, false),
  AmericanFootball: meta('other', true, false),
  Baseball: meta('other', false, false),
  Cricket: meta('other', false, false),
  IceHockey: meta('other', false, false),
  FieldHockey: meta('other', true, false),
  Handball: meta('other', false, false),

  // --- other: combat -----------------------------------------------------
  Boxing: meta('other', false, false),
  MartialArts: meta('other', false, false),

  // --- other: misc -------------------------------------------------------
  Golf: meta('other', true, true),
  Dance: meta('other', false, false),
  Triathlon: meta('other', true, true),
  Hyrox: meta('other', true, true),
} as const satisfies Record<string, SportMeta>;

export type SportType = keyof typeof SPORT_META;

export const SPORT_TYPES = Object.keys(SPORT_META) as [SportType, ...SportType[]];

export const sportMeta = (sport: SportType): SportMeta => SPORT_META[sport];
export const sportCategory = (sport: SportType): SportCategory => SPORT_META[sport].category;
export const sportHasGps = (sport: SportType): boolean => SPORT_META[sport].hasGps;
export const sportHasPool = (sport: SportType): boolean => SPORT_META[sport].hasPool;

export const sportsInCategory = (category: SportCategory): SportType[] =>
  SPORT_TYPES.filter((s) => SPORT_META[s].category === category);
