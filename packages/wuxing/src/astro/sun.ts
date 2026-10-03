/**
 * Apparent solar longitude, nutation, obliquity and the equation of time.
 *
 * Solar terms are DEFINED as the instants the Sun's apparent longitude reaches multiples of 15°, so
 * the apparent longitude is the foundation of the whole chart layer.
 *
 * Accuracy budget (tolerance 60 s ≙ 2.5″ of longitude, since the Sun moves 0.9856°/day):
 *   series truncation 0.03″ · simplified nutation 0.5″ · simplified aberration 0.01″
 *   ⇒ ≈ 0.55″ ≈ 13 s, plus 2–3 s for the ΔT extrapolation ⇒ ≈ 16 s total (3.7× margin).
 * The dominant term is the simplified nutation; the only worthwhile next step would be the full
 * IAU nutation series.
 */

import { EARTH_L, EARTH_R, type Vsop87Series } from "./vsop87-earth.ts";
import { arcsecToDeg, cosDeg, degToMinutes, norm360, normSigned, sinDeg } from "./math.ts";
import { julianCentury, julianMillennium, type JdTT } from "./julian.ts";

const RAD_TO_DEG = 180 / Math.PI;

/** Σ_k τ^k · Σ_i A_i·cos(B_i + C_i·τ), accumulated by Horner's rule from the highest power down. */
export function evaluateSeries(series: Vsop87Series, tau: number): number {
  let acc = 0;
  for (let k = series.length - 1; k >= 0; k--) {
    const terms = series[k] as Vsop87Series[number];
    let sum = 0;
    for (const t of terms) sum += t[0] * Math.cos(t[1] + t[2] * tau);
    acc = acc * tau + sum;
  }
  return acc;
}

/** VSOP87 dynamical ecliptic → FK5 correction; only the constant term survives (|β| < 1.2″). */
const FK5_LONGITUDE_CORRECTION_DEG = arcsecToDeg(-0.09033);

/** Aberration constant, arcsec·AU. */
const ABERRATION_CONSTANT = 20.4898;

/** Mean solar motion, degrees/day — the first-order slope for Newton iteration. */
export const MEAN_SOLAR_MOTION_DEG_PER_DAY = 360 / 365.2421897;

export interface Nutation {
  readonly deltaPsi: number;      // degrees
  readonly deltaEpsilon: number;  // degrees
}

/** Nutation (Meeus ch. 22, short form). Δψ amplitude 17.2″ ≈ 7 minutes of solar-term time: not optional. */
export function nutation(jd: JdTT): Nutation {
  const T = julianCentury(jd);
  const omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000;
  const L = 280.4665 + 36000.7698 * T;
  const Lp = 218.3165 + 481267.8813 * T;
  const dPsi = -17.2 * sinDeg(omega) - 1.32 * sinDeg(2 * L) - 0.23 * sinDeg(2 * Lp) + 0.21 * sinDeg(2 * omega);
  const dEps = 9.2 * cosDeg(omega) + 0.57 * cosDeg(2 * L) + 0.1 * cosDeg(2 * Lp) - 0.09 * cosDeg(2 * omega);
  return { deltaPsi: arcsecToDeg(dPsi), deltaEpsilon: arcsecToDeg(dEps) };
}

/** Mean obliquity of the ecliptic, degrees (Meeus 22.3). */
export function meanObliquity(jd: JdTT): number {
  const U = julianCentury(jd) / 100;
  const arcsec =
    21.448 - U * (4680.93 + U * (1.55 - U * (1999.25 - U * (51.38 + U * (249.67 + U * (39.05 - U * (7.12 + U * (27.87 + U * (5.79 + U * 2.45)))))))));
  return 23 + 26 / 60 + arcsec / 3600;
}

export const trueObliquity = (jd: JdTT): number => meanObliquity(jd) + nutation(jd).deltaEpsilon;

/** Geocentric geometric solar longitude (deg) and Earth–Sun distance (AU). */
export function solarPosition(jd: JdTT): { geometricLongitude: number; radiusVector: number } {
  const tau = julianMillennium(jd);
  const earthLongitudeRad = evaluateSeries(EARTH_L, tau);
  const radiusVector = evaluateSeries(EARTH_R, tau);
  return {
    geometricLongitude: norm360(earthLongitudeRad * RAD_TO_DEG + 180 + FK5_LONGITUDE_CORRECTION_DEG),
    radiusVector,
  };
}

/** Apparent solar longitude (deg) = geometric + nutation in longitude + annual aberration. */
export function apparentSolarLongitude(jd: JdTT): number {
  const { geometricLongitude, radiusVector } = solarPosition(jd);
  return norm360(geometricLongitude + nutation(jd).deltaPsi - arcsecToDeg(ABERRATION_CONSTANT / radiusVector));
}

/**
 * Equation of time E = mean solar time − apparent solar time, in minutes (Meeus ch. 28).
 * Range ≈ −14.2 min (mid-Feb) to +16.4 min (early Nov). Hour boundaries sit on the hour while E can
 * reach 16 min, so this changes the hour pillar of births near a boundary.
 */
export function equationOfTimeMinutes(jd: JdTT): number {
  const tau = julianCentury(jd) / 10;
  const L0 = norm360(
    280.4664567 + 360007.6982779 * tau + 0.03032028 * tau * tau + (tau * tau * tau) / 49931 - tau ** 4 / 15300 - tau ** 5 / 2000000,
  );
  const lambda = apparentSolarLongitude(jd);
  const epsilon = trueObliquity(jd);
  const { deltaPsi } = nutation(jd);
  const alpha = norm360((Math.atan2(cosDeg(epsilon) * sinDeg(lambda), cosDeg(lambda)) * 180) / Math.PI);
  const eDeg = normSigned(L0 - 0.0057183 - alpha + deltaPsi * cosDeg(epsilon));
  return degToMinutes(eDeg);
}
