/** Canonical time is UTC everywhere; ISO-8601 strings cross the API boundary. */
export const iso = (value: Date | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

export const isoRequired = (value: Date): string => new Date(value).toISOString();

export const secondsFromNow = (seconds: number): Date => new Date(Date.now() + seconds * 1000);
