/** Angle helpers. Everything is in DEGREES; radians exist only inside the trig call. */

export const DEG = Math.PI / 180;

export const sinDeg = (d: number): number => Math.sin(d * DEG);
export const cosDeg = (d: number): number => Math.cos(d * DEG);

/** Normalise into [0, 360). */
export function norm360(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalise into (−180, 180] — for the signed difference of two angles. */
export function normSigned(d: number): number {
  const r = norm360(d);
  return r > 180 ? r - 360 : r;
}

export const arcsecToDeg = (a: number): number => a / 3600;

/** Degrees of hour angle → minutes of time (the Sun moves 1° in ≈ 4 minutes). */
export const degToMinutes = (d: number): number => d * 4;
