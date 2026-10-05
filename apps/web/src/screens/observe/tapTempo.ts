// The tap-tempo pulse estimator (docs/post-mvp/design/tap-tempo-and-regions.md §1.2). PURE: no DOM, no clock — the screen gives it the times of the taps in
// milliseconds (`event.timeStamp`: a device's constant input latency cancels in the differences) and the rate bands of the pulse data. It says "not enough to
// tell" instead of guessing: too few taps, or taps too uneven for a number to be trusted.
//
// The thresholds are provisional constants of the interface (the same standing as the engine's [calibrate] values): they are tested against simulated taps and are
// revisited with usability evidence.

export const TAP = {
  /** Fewest taps that can end a run, and the most it accepts (the run ends by itself there). */
  minTaps: 12, maxTaps: 30,
  /** Fewest usable intervals for a rate to be given. */
  minIntervals: 8,
  /** The plausible range of one beat: 30 to 240 beats per minute. */
  minMs: 250, maxMs: 2000,
  /** A tap closer than this share of the typical interval to the one before is a bounce (a double tap) and is ignored. */
  bounce: 0.4,
  /** An interval within this share of the typical one is a beat; one within `missTolerance` of two or three times it is two or three beats with the tap(s) between missed. */
  beatTolerance: 0.4, missTolerance: 0.2, maxMissed: 2,
  /** More than this share of the intervals neither a beat nor a missed beat: the taps are too uneven to trust. */
  maxDiscarded: 0.3,
  /** Spread = standard deviation ÷ mean of the beat intervals: above `maxSpread` no number is given; above `hintSpread` the screen hints. */
  maxSpread: 0.25, hintSpread: 0.12,
  /** A rate this close (beats per minute) to a band edge is "near the line". */
  edgeBpm: 3,
} as const;

export type TapStatus = "ok" | "near-edge" | "too-few" | "too-uneven";
export interface TapResult {
  readonly status: TapStatus;
  /** Beats per minute, whole; `null` when the status is `too-few` or `too-uneven`. */
  readonly rate: number | null;
  /** Intervals that were usable (a beat, or a run of beats with a missed tap). */
  readonly valid: number;
  /** Standard deviation ÷ mean of the beat intervals (`null` when there were too few to tell). */
  readonly spread: number | null;
  /** A number was given but the taps were uneven enough that the person may want to say so ("skips" in the rhythm choice). Never a decision. */
  readonly unevenHint: boolean;
}
export interface RateBands { readonly rapid_gt: number; readonly slow_lt: number }

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const none = (valid: number, spread: number | null, status: "too-few" | "too-uneven"): TapResult => ({ status, rate: null, valid, spread, unevenHint: false });

/**
 * The resting rate from the times of the taps.
 *
 *  1. The typical interval is the median of the plausible ones (250–2000 ms).
 *  2. A tap that follows the last kept one by less than 0.4 times that is a bounce and is ignored: the beat is timed from the first tap of the pair.
 *  3. Each interval is then a beat (within 40 % of the typical one), two or three beats with a tap missed (within 20 % of twice or three times it), or none of
 *     these and discarded. Too many discarded, or beat intervals that vary by more than 0.25 of their mean, and no number is given.
 *  4. The rate is the beats over the time they took: with nothing discarded that is the span between the first and the last tap over the number of beats, which is far
 *     less sensitive to the jitter of the taps in between than the median of the intervals is (a person's taps err by 20–40 ms each; the median of eleven intervals at
 *     140 beats per minute then misses by more than 3 about one run in eleven, this by almost none).
 */
export function estimateTap(taps: readonly number[], bands: RateBands): TapResult {
  const times = taps.filter((t) => Number.isFinite(t));
  if (times.length < TAP.minTaps) return none(0, null, "too-few");
  const plausible = times.slice(1).map((t, i) => t - times[i]!).filter((d) => d >= TAP.minMs && d <= TAP.maxMs);
  if (plausible.length === 0) return none(0, null, "too-few");
  const typical = median(plausible);

  const kept = [times[0]!];
  for (const t of times.slice(1)) if (t - kept[kept.length - 1]! >= TAP.bounce * typical) kept.push(t);
  const gaps = kept.slice(1).map((t, i) => t - kept[i]!);

  let beats = 0, time = 0;
  const units: number[] = [];                                           // the interval of each beat that was timed
  for (const d of gaps) {
    const k = Math.round(d / typical);
    if (k < 1 || k > TAP.maxMissed + 1) continue;
    const unit = d / k;
    if (Math.abs(unit / typical - 1) > (k === 1 ? TAP.beatTolerance : TAP.missTolerance) || unit < TAP.minMs || unit > TAP.maxMs) continue;
    beats += k; time += d; units.push(unit);
  }
  const discarded = gaps.length === 0 ? 1 : 1 - units.length / gaps.length;
  if (units.length < TAP.minIntervals) return none(units.length, null, discarded > TAP.maxDiscarded ? "too-uneven" : "too-few");

  const m = mean(units);
  const spread = Math.sqrt(mean(units.map((u) => (u - m) ** 2))) / m;
  if (spread > TAP.maxSpread || discarded > TAP.maxDiscarded) return none(units.length, spread, "too-uneven");
  const rate = Math.round((60000 * beats) / time);
  const nearEdge = Math.abs(rate - bands.rapid_gt) <= TAP.edgeBpm || Math.abs(rate - bands.slow_lt) <= TAP.edgeBpm;
  return { status: nearEdge ? "near-edge" : "ok", rate, valid: units.length, spread, unevenHint: spread > TAP.hintSpread };
}
