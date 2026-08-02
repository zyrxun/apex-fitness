import { describe, expect, it } from 'vitest';
import {
  feetToMeters,
  fromCanonicalKg,
  fromCanonicalMeters,
  kgToLb,
  lbToKg,
  metersToFeet,
  metersToMiles,
  milesToMeters,
  toCanonicalKg,
} from '@apex/shared';

describe('unit conversions', () => {
  it('round-trips mass', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 3);
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
    expect(kgToLb(lbToKg(185))).toBeCloseTo(185, 4);
  });

  it('round-trips distance', () => {
    expect(milesToMeters(1)).toBeCloseTo(1609.344, 3);
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 6);
    expect(feetToMeters(1)).toBeCloseTo(0.3048, 6);
    expect(metersToFeet(0.3048)).toBeCloseTo(1, 6);
  });

  it('canonicalises inbound values and formats outbound by preference', () => {
    expect(toCanonicalKg(180, 'lb')).toBeCloseTo(81.6466, 3);
    expect(toCanonicalKg(80, 'kg')).toBe(80);

    expect(fromCanonicalKg(81.6466, 'metric')).toEqual({ value: 81.65, unit: 'kg' });
    expect(fromCanonicalKg(81.6466, 'imperial').unit).toBe('lb');
    expect(fromCanonicalKg(81.6466, 'imperial').value).toBeCloseTo(180, 1);

    expect(fromCanonicalMeters(5000, 'metric')).toEqual({ value: 5, unit: 'km' });
    expect(fromCanonicalMeters(1609.344, 'imperial')).toEqual({ value: 1, unit: 'mi' });
  });
});
