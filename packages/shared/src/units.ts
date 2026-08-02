import type { UnitSystem } from './enums.js';

// Canonical storage is metric (kg, m, m/s) + WGS-84 + UTC. Conversions happen at
// the API edge only — nothing downstream of a route handler should see imperial.

export const KG_PER_LB = 0.45359237;
export const M_PER_MILE = 1609.344;
export const M_PER_FOOT = 0.3048;

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const lbToKg = (lb: number): number => round(lb * KG_PER_LB, 6);
export const kgToLb = (kg: number): number => round(kg / KG_PER_LB, 6);

export const milesToMeters = (mi: number): number => round(mi * M_PER_MILE, 6);
export const metersToMiles = (m: number): number => round(m / M_PER_MILE, 6);

export const feetToMeters = (ft: number): number => round(ft * M_PER_FOOT, 6);
export const metersToFeet = (m: number): number => round(m / M_PER_FOOT, 6);

export type MassUnit = 'kg' | 'lb';

export const massUnitFor = (units: UnitSystem): MassUnit => (units === 'imperial' ? 'lb' : 'kg');

/** Inbound: a client-supplied mass in the caller's unit -> canonical kg. */
export const toCanonicalKg = (value: number, unit: MassUnit): number =>
  unit === 'lb' ? lbToKg(value) : round(value, 6);

/** Outbound: canonical kg -> the display unit implied by the user's preference. */
export const fromCanonicalKg = (
  kg: number,
  units: UnitSystem,
): { value: number; unit: MassUnit } => {
  const unit = massUnitFor(units);
  return { value: unit === 'lb' ? round(kgToLb(kg), 2) : round(kg, 2), unit };
};

export const distanceUnitFor = (units: UnitSystem): 'km' | 'mi' =>
  units === 'imperial' ? 'mi' : 'km';

export const fromCanonicalMeters = (
  meters: number,
  units: UnitSystem,
): { value: number; unit: 'km' | 'mi' } => {
  const unit = distanceUnitFor(units);
  return {
    value: unit === 'mi' ? round(metersToMiles(meters), 3) : round(meters / 1000, 3),
    unit,
  };
};
