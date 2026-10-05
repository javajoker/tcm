// When to remind the person to make a backup (docs/post-mvp/design/backup-and-data-lock.md §3.6). Pure, computed from stored data when a page opens: no timer, no message from anywhere.

export const REMIND_AFTER_RESULTS = 5;
export const REMIND_AFTER_DAYS = 30;
export const SNOOZE_DAYS = 14;
const DAY = 86_400_000;

export interface ReminderInput {
  /** `createdAt` of every saved result. */
  readonly createdAt: readonly number[];
  readonly lastBackupAt: number | undefined;
  readonly snoozeUntil: number | undefined;
  /** Off in Settings. */
  readonly enabled: boolean;
  readonly now: number;
}

/** How many saved results are newer than the last backup, if the reminder is due now; otherwise 0. */
export function resultsToBackUp(input: ReminderInput): number {
  if (!input.enabled || (input.snoozeUntil !== undefined && input.snoozeUntil > input.now)) return 0;
  const since = input.lastBackupAt;
  const newer = input.createdAt.filter((t) => since === undefined || t > since);
  if (newer.length === 0) return 0;
  // five such results, or thirty days since the last backup (or since the first result, if there has been none)
  const from = since ?? Math.min(...input.createdAt);
  return newer.length >= REMIND_AFTER_RESULTS || input.now - from >= REMIND_AFTER_DAYS * DAY ? newer.length : 0;
}

export const snoozeUntil = (now: number): number => now + SNOOZE_DAYS * DAY;
