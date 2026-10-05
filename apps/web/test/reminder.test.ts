// When the reminder to make a backup is due (docs/post-mvp/design/backup-and-data-lock.md §3.6).
import { describe, expect, it } from "vitest";
import { REMIND_AFTER_DAYS, REMIND_AFTER_RESULTS, resultsToBackUp, SNOOZE_DAYS, snoozeUntil } from "../src/backup/reminder.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 5);
const at = (days: number): number => NOW - days * DAY;
const due = (over: Partial<Parameters<typeof resultsToBackUp>[0]>): number => resultsToBackUp({ createdAt: [], lastBackupAt: undefined, snoozeUntil: undefined, enabled: true, now: NOW, ...over });

describe("the reminder", () => {
  it("has the defaults of the design: five results, or thirty days; snoozed for fourteen", () => {
    expect([REMIND_AFTER_RESULTS, REMIND_AFTER_DAYS, SNOOZE_DAYS]).toEqual([5, 30, 14]);
    expect(snoozeUntil(NOW)).toBe(NOW + 14 * DAY);
  });

  it("is not due with no results, or with results that are all in a backup", () => {
    expect(due({})).toBe(0);
    expect(due({ createdAt: [at(40), at(35)], lastBackupAt: at(1) })).toBe(0);
    expect(due({ createdAt: [at(40)], lastBackupAt: at(40) })).toBe(0);              // a result made at the moment of the backup is in it
  });

  it("is due when five results are newer than the last backup", () => {
    expect(due({ createdAt: [at(5), at(4), at(3), at(2), at(1)], lastBackupAt: at(6) })).toBe(5);
    expect(due({ createdAt: [at(5), at(4), at(3), at(2)], lastBackupAt: at(6) })).toBe(0);
    expect(due({ createdAt: [at(50), at(5), at(4), at(3), at(2), at(1)], lastBackupAt: at(6) })).toBe(5);          // only the newer ones count
  });

  it("is due when thirty days have passed since the last backup and there is something newer", () => {
    expect(due({ createdAt: [at(10)], lastBackupAt: at(30) })).toBe(1);
    expect(due({ createdAt: [at(10)], lastBackupAt: at(29) })).toBe(0);
    expect(due({ createdAt: [at(20), at(10)], lastBackupAt: at(45) })).toBe(2);
  });

  it("without a backup it counts from the first result", () => {
    expect(due({ createdAt: [at(31), at(2)] })).toBe(2);
    expect(due({ createdAt: [at(29), at(2)] })).toBe(0);
    expect(due({ createdAt: [at(4), at(3), at(2), at(1), at(0)] })).toBe(5);
  });

  it("is quiet while snoozed and when switched off", () => {
    const base = { createdAt: [at(40), at(2)] };
    expect(due({ ...base })).toBe(2);
    expect(due({ ...base, snoozeUntil: NOW + 1 })).toBe(0);
    expect(due({ ...base, snoozeUntil: NOW })).toBe(2);                              // the snooze is over
    expect(due({ ...base, snoozeUntil: NOW - DAY })).toBe(2);
    expect(due({ ...base, enabled: false })).toBe(0);
  });
});
