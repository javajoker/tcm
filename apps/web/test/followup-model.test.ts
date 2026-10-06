// Follow-up (docs/post-mvp/design/export-follow-up-trends.md §4): the date on a saved result, when the card is due, and the draft that carries the previous profile and nothing else.
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { dismissedAt, dueAtFor, dueNudge, INTERVAL_WEEKS, weeksSince, withFollowUp } from "../src/followup/model.ts";
import { draftFromProfile } from "../src/followup/profileDraft.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { interview, screenedDraft } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const DAY = 86_400_000;
const NOW = new Date(2026, 9, 5, 15, 30).getTime();            // local time: 5 October 2026, 15:30

function saved(id: string, createdAt: number, over: Partial<SavedAssessment> = {}): SavedAssessment {
  const d = interview(kb, "SP1");
  const s = toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id, lang: "en" });
  return { ...s, createdAt, ...over };
}

describe("the date", () => {
  it("is the start of the local day 2, 4 or 8 weeks on — a date, not a timer", () => {
    expect(INTERVAL_WEEKS).toEqual([2, 4, 8]);
    for (const w of INTERVAL_WEEKS) {
      const due = new Date(dueAtFor(NOW, w));
      expect([due.getHours(), due.getMinutes(), due.getSeconds(), due.getMilliseconds()]).toEqual([0, 0, 0, 0]);
      expect(due.getDate()).toBe(new Date(2026, 9, 5 + 7 * w).getDate());
      expect(due.getMonth()).toBe(new Date(2026, 9, 5 + 7 * w).getMonth());
    }
  });
  it("is set on the record, replaces an earlier one and its dismissal, and is taken away by null; the rest of the record is untouched", () => {
    const base = saved("r1", NOW - DAY);
    const set = withFollowUp(base, 4, NOW);
    expect(set.followUp).toEqual({ dueAt: dueAtFor(NOW, 4) });
    expect({ ...set, followUp: undefined }).toEqual({ ...base, followUp: undefined });
    const dismissed = dismissedAt(set, NOW + 30 * DAY);
    expect(dismissed.followUp).toEqual({ dueAt: dueAtFor(NOW, 4), dismissedAt: NOW + 30 * DAY });
    expect(withFollowUp(dismissed, 8, NOW + 31 * DAY).followUp).toEqual({ dueAt: dueAtFor(NOW + 31 * DAY, 8) });
    expect(withFollowUp(dismissed, null, NOW)).not.toHaveProperty("followUp");
    expect(dismissedAt(base, NOW)).toBe(base);                  // nothing to dismiss
  });
});

describe("when the card is due", () => {
  const due = (createdAt: number, dueAt: number, extra: Partial<NonNullable<SavedAssessment["followUp"]>> = {}): SavedAssessment => saved(`r${createdAt}`, createdAt, { followUp: { dueAt, ...extra } });
  it("only after the date, and not before", () => {
    const r = due(NOW - 30 * DAY, NOW + DAY);
    expect(dueNudge([r], NOW)).toBeNull();
    expect(dueNudge([r], NOW + DAY)?.id).toBe(r.id);
    expect(dueNudge([r], NOW + 400 * DAY)?.id).toBe(r.id);
  });
  it("never for a result without a date or with a dismissed one", () => {
    expect(dueNudge([saved("a", NOW - 40 * DAY)], NOW)).toBeNull();
    expect(dueNudge([due(NOW - 40 * DAY, NOW - DAY, { dismissedAt: NOW - 1000 })], NOW)).toBeNull();
    expect(dueNudge([], NOW)).toBeNull();
  });
  it("not once a newer result has been saved — the person has already looked again", () => {
    const older = due(NOW - 40 * DAY, NOW - 12 * DAY);
    const newer = saved("newer", NOW - 5 * DAY);
    expect(dueNudge([older, newer], NOW)).toBeNull();
    expect(dueNudge([older], NOW)?.id).toBe(older.id);
  });
  it("one card at most: with several due, the most recent result", () => {
    const a = due(NOW - 60 * DAY, NOW - 40 * DAY), b = due(NOW - 20 * DAY, NOW - DAY);
    expect(dueNudge([a, b], NOW)?.id).toBe(b.id);              // a has a newer result (b), so only b can be asked about
    expect(dueNudge([b, a], NOW)?.id).toBe(b.id);
  });
  it("says whole weeks since the result, at least one", () => {
    expect(weeksSince(NOW - 28 * DAY, NOW)).toBe(4);
    expect(weeksSince(NOW - 30 * DAY, NOW)).toBe(4);
    expect(weeksSince(NOW - 2 * DAY, NOW)).toBe(1);
    expect(weeksSince(NOW, NOW)).toBe(1);
  });
});

describe("start with my previous profile", () => {
  const birth = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
  const profileDraft = (over: Partial<Draft> = {}): Draft => interview(kb, "SP1", screenedDraft(kb, { ageYears: 52, sex: "female", pregnancy: "no", lactating: false, medications: ["anticoagulant"], allergies: ["花生"] }, { profile: { medications: "some", medicationText: ["Foo"], allergies: "some", conditions: "some" }, redFlags: ["RF_C_KIDNEY", "RF_A_CHEST_PAIN"], ...over }));
  it("carries the answers about the person and none of the findings, screening, constitution or observations", () => {
    const d = profileDraft({ constitutionAnswers: { CI_QIXU_1: 4 } });
    const s = toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id: "p1", lang: "en" });
    const fresh = draftFromProfile({ ...s, input: { ...s.input, observe: { pulse: { rate: 70, rhythm: "regular" } } } }, "new1", NOW);
    expect(fresh.id).toBe("new1");
    expect(fresh.position.route).toBe("/start");
    expect(fresh.subject).toEqual(s.input.subject);
    expect(fresh.subject).toMatchObject({ ageYears: 52, sex: "female", allergies: ["花生"] });
    expect(fresh.profile).toEqual(s.input.profile);
    expect(fresh.redFlags).toEqual(["RF_C_KIDNEY"]);              // the long-term condition, not the red flag that was answered then
    expect(fresh.findings).toEqual({});
    expect(fresh.screening).toEqual({ answers: {}, corrected: [], acknowledgedAt: {} });
    expect(fresh.inquiry).toEqual({ modules: null, history: [], resolved: [] });
    expect(fresh.constitutionAnswers).toEqual({});
    expect(fresh.observe).toEqual({});
    expect(fresh.context).toEqual({});
    expect(fresh.acknowledgements).toEqual([]);
    expect(fresh.birth).toBeUndefined();
    expect(fresh.rememberBirth).toBe(false);
  });
  it("carries the birth data only if it was saved", () => {
    const d = profileDraft({ birth, rememberBirth: true });
    const s = toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id: "p2", lang: "en" });
    expect(s.input.birth).toBeDefined();
    const withBirth = draftFromProfile(s, "new2", NOW);
    expect(withBirth.birth).toEqual(birth);
    expect(withBirth.rememberBirth).toBe(true);
    const d2 = profileDraft({ birth, rememberBirth: false });
    const s2 = toSaved(d2, engine.assess(kb, assessInputOf(d2, Date.UTC(2026, 9, 4, 12))!), { id: "p3", lang: "en" });
    expect(draftFromProfile(s2, "new3", NOW).birth).toBeUndefined();
  });
});
