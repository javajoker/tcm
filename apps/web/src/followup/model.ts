// Follow-up (docs/post-mvp/design/export-follow-up-trends.md §4): a note the person sets for themselves. A date on the saved result, a card when the date has passed, nothing else: no timer, no background
// work, no message from anywhere. Pure, computed from stored data when a page opens.
import type { SavedAssessment } from "../storage/types.ts";

/** The intervals offered, in weeks; none is pre-selected. */
export const INTERVAL_WEEKS = [2, 4, 8] as const;
export type Interval = (typeof INTERVAL_WEEKS)[number];
const WEEK = 7 * 86_400_000;

/** The start of the local day `weeks` weeks after `now` — a date, not a timer. */
export function dueAtFor(now: number, weeks: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + weeks * 7);
  return d.getTime();
}

/** The record with a follow-up date (`null` takes it away). Choosing a date again clears an earlier dismissal. */
export function withFollowUp(saved: SavedAssessment, weeks: number | null, now: number): SavedAssessment {
  const { followUp: _gone, ...rest } = saved;
  return weeks === null ? rest : { ...rest, followUp: { dueAt: dueAtFor(now, weeks) } };
}

/** The record with its reminder dismissed (kept, so the card does not come back; the date stays visible on the result). */
export const dismissedAt = (saved: SavedAssessment, now: number): SavedAssessment => (saved.followUp === undefined ? saved : { ...saved, followUp: { ...saved.followUp, dismissedAt: now } });

/**
 * The result whose reminder is due: its date has passed, it was not dismissed, and no newer result has been saved since (the person has already looked again). With several, the most recent.
 */
export function dueNudge(all: readonly SavedAssessment[], now: number): SavedAssessment | null {
  const latest = all.reduce((m, s) => Math.max(m, s.createdAt), 0);
  const due = all.filter((s) => s.followUp !== undefined && s.followUp.dismissedAt === undefined && s.followUp.dueAt <= now && s.createdAt >= latest);
  return due.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

/** Whole weeks since the result was made, at least one: the card says "about 4 weeks". */
export const weeksSince = (createdAt: number, now: number): number => Math.max(1, Math.round((now - createdAt) / WEEK));
