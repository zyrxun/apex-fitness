import type { Sex } from '@apex/shared';

export interface CalorieInput {
  durationS: number;
  baseMet: number;
  bodyweightKg: number | null;
  avgHr: number | null;
  ageYears: number | null;
  sex: Sex;
}

export interface CalorieEstimate {
  kcal: number;
  method: 'heart_rate' | 'met';
}

/** Falls back to a mid-cohort mass when the user has never logged a weight. */
const ASSUMED_BODYWEIGHT_KG = 72;
const ASSUMED_AGE_YEARS = 35;
const KJ_PER_KCAL = 4.184;

/**
 * Stage (j). Two estimators, both deliberately simple:
 *
 * 1. **Heart rate (preferred when present)** — Keytel et al. (2005), J Sports
 *    Sci 23(3):289-97. Sex-specific regressions of energy expenditure on HR,
 *    mass and age, validated against indirect calorimetry. It is the formula
 *    behind most consumer HR-based calorie readouts.
 * 2. **MET fallback** — kcal = MET × kg × hours, using the Compendium of
 *    Physical Activities value for the sport category.
 *
 * Neither is accurate to better than ~15%, and no calorie model is. We prefer a
 * published, checkable formula over a tuned-but-opaque one; the number is a
 * training-log annotation, never an input to a rank.
 */
export function estimateCalories(input: CalorieInput): CalorieEstimate {
  const minutes = input.durationS / 60;
  const weight = input.bodyweightKg ?? ASSUMED_BODYWEIGHT_KG;
  if (minutes <= 0) return { kcal: 0, method: 'met' };

  if (input.avgHr && input.avgHr >= 60 && input.sex !== 'unspecified') {
    const age = input.ageYears ?? ASSUMED_AGE_YEARS;
    const kjPerMin =
      input.sex === 'male'
        ? -55.0969 + 0.6309 * input.avgHr + 0.1988 * weight + 0.2017 * age
        : -20.4022 + 0.4472 * input.avgHr - 0.1263 * weight + 0.074 * age;
    const kcal = (kjPerMin / KJ_PER_KCAL) * minutes;
    if (kcal > 0) return { kcal: Math.round(kcal), method: 'heart_rate' };
  }

  return { kcal: Math.round(input.baseMet * weight * (minutes / 60)), method: 'met' };
}
