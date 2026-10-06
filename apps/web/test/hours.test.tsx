// The choice of hour when the birth time is near a change of hour (docs/post-mvp/design/five-phase-extensions.md §5; task PM-27), in the app: the form and what it makes of the answer, the three outcomes on
// the birth card, what is kept with the draft and with a saved result (the choice, never the time), the sentence on the result, and the proof that a result made with the choice — or with the second of two
// clock times — is still genuine when it comes back from a backup.
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { buildChart, hourAlternatives, type BirthInput } from "@tcm/wuxing";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, draftFromSaved, toSaved } from "../src/app/assessment.ts";
import { makeReplay } from "../src/app/backupReplay.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { EMPTY_FORM, formOf, HOUR_CHOICE_OF, parseBirth, type BirthForm } from "../src/screens/birth/model.ts";
import { validateAssessment, validateDraft } from "../src/storage/backup/index.ts";
import { parseDraft, toStored } from "../src/storage/draft.ts";
import { HOUR_CHOICES, type Draft, type HourChoice, type SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const dev = indexKnowledgeBase(rawChunksFromDisk("dev"));
const release = indexKnowledgeBase(rawChunksFromDisk("release"));
const loaded: Loaded = { kb: dev, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { cleanup(); go("/"); });

const NOW = Date.UTC(2026, 9, 3, 12);
const shanghai = { sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
/** Clock times on 12 May 1990 in Shanghai (daylight saving removed: the true solar time is about 50 minutes earlier) whose true solar time is within the margin of the start of 子 — and one that is not near any hour boundary. */
const clock = (m: number): { time: string; birth: BirthInput } => ({ time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, birth: { year: 1990, month: 5, day: 12, hour: Math.floor(m / 60), minute: m % 60, ...shanghai } });
const all = Array.from({ length: 1440 }, (_, m) => clock(m));
const NEAR = all.find((c) => { const a = hourAlternatives(c.birth); return a.ambiguous && a.boundaryHour === 23 && a.side === "after"; })!;
const FAR = all.find((c) => !hourAlternatives(c.birth).ambiguous && Math.floor(Number(c.time.slice(0, 2)) / 2) === 7)!;

const form: BirthForm = { ...EMPTY_FORM, date: "1990-05-12", time: NEAR.time, longitude: "121.47", timeZone: "Asia/Shanghai" };

describe("the form and what it makes of the answer", () => {
  it("the computed hour is the default and puts nothing in the birth input", () => {
    expect(EMPTY_FORM.hourPick).toBe("computed");
    expect(parseBirth(form, "male").birth).toEqual(NEAR.birth);
    expect(parseBirth(form, "male").birth).not.toHaveProperty("hourPick");
  });
  it("the other hour is the person's pick, carried in the birth input", () => {
    expect(parseBirth({ ...form, hourPick: "other" }, "male").birth).toEqual({ ...NEAR.birth, hourPick: "alternative" });
  });
  it("not being sure takes the existing path of an unknown hour: no hour, noon in its place, and the pick is not carried", () => {
    const b = parseBirth({ ...form, hourPick: "unsure" }, "male").birth!;
    expect(b).toEqual({ ...NEAR.birth, hour: 12, minute: 0, unknownHour: true });
    expect(buildChart(b).hour).toBeNull();
    expect(parseBirth({ ...form, time: "", unknownHour: true, hourPick: "other" }, "male").birth).not.toHaveProperty("hourPick");
  });
  it("an answer is read back: the form of a stored birth input gives the same input again", () => {
    for (const hourPick of ["computed", "other"] as const) {
      const b = parseBirth({ ...form, hourPick }, "male").birth!;
      expect(formOf(b).hourPick).toBe(hourPick);
      expect(parseBirth(formOf(b), "male").birth).toEqual(b);
    }
    const second = parseBirth({ ...form, fold: "second", hourPick: "other" }, "male").birth!;
    expect(parseBirth(formOf(second), "male").birth).toEqual(second);
  });
  it("the draft says what was chosen in its own words", () => {
    expect(HOUR_CHOICE_OF).toEqual({ computed: "primary", other: "alternative", unsure: "unknown" });
    expect([...HOUR_CHOICES].sort()).toEqual(Object.values(HOUR_CHOICE_OF).sort());
  });
});

async function open(draft: Draft = screenedDraft(dev, { ageYears: 36, sex: "male" }), lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  t.store.getState().startDraft();
  t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/start" } }));
  go(`/${lang}/start`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("region", { name: lang === "en" ? "Birth data (optional)" : "生辰（選填）" });
  return { ...view, ...t, env };
}
const card = (): ReturnType<typeof within> => within(screen.getByRole("region", { name: "Birth data (optional)" }));
const draftOf = (s: { getState: () => { draft: Draft | null } }): Draft => s.getState().draft!;
const GROUP = "Your birth time is close to a change of hour";

const LABELS = { en: { date: "Date of birth", time: "Time of birth", lon: "Longitude (degrees)", zone: "Time zone" }, "zh-Hant": { date: "出生日期", time: "出生時間", lon: "經度（度）", zone: "時區" } } as const;
async function fill(c: ReturnType<typeof within>, f: { date?: string; time?: string; lon?: string; zone?: string }, lang: "en" | "zh-Hant" = "en"): Promise<void> {
  const l = LABELS[lang];
  if (f.date !== undefined) await userEvent.type(c.getByLabelText(l.date), f.date);
  if (f.time !== undefined) await userEvent.type(c.getByLabelText(l.time), f.time);
  if (f.lon !== undefined) await userEvent.type(c.getByLabelText(l.lon), f.lon);
  if (f.zone !== undefined) await userEvent.type(c.getByLabelText(l.zone), f.zone);
}
const fillNear = (c: ReturnType<typeof within>, time = NEAR.time) => fill(c, { date: "1990-05-12", time, lon: "121.47", zone: "Asia/Shanghai" });

describe("the birth card", () => {
  it("asks which hour is nearer the truth when the time is within 15 minutes of a change, names both hours and says the day moves too at the start of 子", async () => {
    const { store } = await open();
    const c = card();
    await fillNear(c);
    const group = await c.findByRole("group", { name: GROUP });
    expect(group).toHaveTextContent("within about 15 minutes of the change between the 亥 and 子 hours, so the hour pillar could be either — and at this change the day pillar changes too. Which is nearer the truth?");
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual([expect.stringContaining("The computed hour"), expect.stringContaining("The other hour"), expect.stringContaining("I am not sure — leave the hour out")]);
    expect(within(group).getByRole("radio", { name: /The computed hour/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /The computed hour/ }).closest("label")).toHaveTextContent("子 hour");
    expect(within(group).getByRole("radio", { name: /The other hour/ }).closest("label")).toHaveTextContent("亥 hour");
    await waitFor(() => expect(draftOf(store).hourChoice).toBe("primary"));
    expect(draftOf(store).birth).toEqual(NEAR.birth);                                               // the default adds nothing to the birth input
  });

  it("the other hour is kept in the birth input and in the draft", async () => {
    const { store } = await open();
    const c = card();
    await fillNear(c);
    await userEvent.click(within(await c.findByRole("group", { name: GROUP })).getByRole("radio", { name: /The other hour/ }));
    await waitFor(() => expect(draftOf(store).hourChoice).toBe("alternative"));
    expect(draftOf(store).birth).toEqual({ ...NEAR.birth, hourPick: "alternative" });
    expect(assessInputOf(draftOf(store), NOW)!.subject.birth?.hourPick).toBe("alternative");
  });

  it("not being sure leaves the hour out, keeps the question and the time typed, and can be taken back", async () => {
    const { store } = await open();
    const c = card();
    await fillNear(c);
    const group = await c.findByRole("group", { name: GROUP });
    await userEvent.click(within(group).getByRole("radio", { name: /I am not sure/ }));
    await waitFor(() => expect(draftOf(store).hourChoice).toBe("unknown"));
    expect(draftOf(store).birth).toMatchObject({ unknownHour: true, hour: 12, minute: 0 });
    expect(c.getByLabelText("Time of birth")).toHaveValue(NEAR.time);
    expect(c.getByRole("group", { name: GROUP })).toBeInTheDocument();
    await userEvent.click(within(c.getByRole("group", { name: GROUP })).getByRole("radio", { name: /The computed hour/ }));
    await waitFor(() => expect(draftOf(store).hourChoice).toBe("primary"));
    expect(draftOf(store).birth).toEqual(NEAR.birth);
  });

  it("is asked again when anything that decides where the time falls changes, and not at all when the time is not near a change", async () => {
    const { store } = await open();
    const c = card();
    await fillNear(c);
    await userEvent.click(within(await c.findByRole("group", { name: GROUP })).getByRole("radio", { name: /The other hour/ }));
    await waitFor(() => expect(draftOf(store).hourChoice).toBe("alternative"));
    // a change to the time puts the answer back to the computed hour
    await userEvent.clear(c.getByLabelText("Longitude (degrees)"));
    await userEvent.type(c.getByLabelText("Longitude (degrees)"), "121.4");
    await waitFor(() => expect(within(c.getByRole("group", { name: GROUP })).getByRole("radio", { name: /The computed hour/ })).toBeChecked());
    await waitFor(() => expect(draftOf(store).hourChoice).toBe("primary"));
    expect(draftOf(store).birth).not.toHaveProperty("hourPick");
    // a time that is not near any change: no question, nothing kept
    await userEvent.clear(c.getByLabelText("Time of birth"));
    await userEvent.type(c.getByLabelText("Time of birth"), FAR.time);
    await waitFor(() => expect(c.queryByRole("group", { name: GROUP })).toBeNull());
    await waitFor(() => expect(draftOf(store).hourChoice).toBeUndefined());
    expect(draftOf(store).birth).toBeDefined();
  });

  it("is not asked for an hour that is unknown", async () => {
    const { store } = await open();
    const c = card();
    await userEvent.click(c.getByRole("checkbox", { name: "I don't know the hour of my birth" }));
    await fill(c, { date: "1990-05-12", lon: "121.47", zone: "Asia/Shanghai" });
    await waitFor(() => expect(draftOf(store).birth?.unknownHour).toBe(true));
    expect(c.queryByRole("group", { name: GROUP })).toBeNull();
    expect(draftOf(store).hourChoice).toBeUndefined();
  });

  it("goes away with the birth data, in step with it", async () => {
    const { store } = await open();
    const c = card();
    await fillNear(c);
    await c.findByRole("group", { name: GROUP });
    await waitFor(() => expect(draftOf(store).hourChoice).toBe("primary"));
    await userEvent.click(c.getByRole("button", { name: "Don't use birth data" }));
    await waitFor(() => expect(draftOf(store).birth).toBeUndefined());
    expect(draftOf(store).hourChoice).toBeUndefined();
  });

  it("a stored choice is shown again when the profile is reopened", async () => {
    const d = { ...screenedDraft(dev, { ageYears: 36, sex: "male" }), birth: { ...NEAR.birth, hourPick: "alternative" as const }, hourChoice: "alternative" as const, rememberBirth: true };
    await open(d);
    const group = await card().findByRole("group", { name: GROUP });
    expect(within(group).getByRole("radio", { name: /The other hour/ })).toBeChecked();
  });

  it("is in Traditional Chinese, and has no accessibility violation with the question open (both languages)", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { container, unmount } = await open(screenedDraft(dev, { ageYears: 36, sex: "male" }), lang);
      const c = within(screen.getByRole("region", { name: lang === "en" ? "Birth data (optional)" : "生辰（選填）" }));
      await fill(c, { date: "1990-05-12", time: NEAR.time, lon: "121.47", zone: "Asia/Shanghai" }, lang);
      const group = await c.findByRole("group", { name: lang === "en" ? GROUP : "您的出生時間接近時辰的交界" });
      if (lang === "zh-Hant") {
        expect(group).toHaveTextContent("您的出生時間在亥時與子時交界前後約 15 分鐘內，所以時柱可能是兩者之一，而且在這個交界，日柱也會跟著改變。哪一個比較接近實際情況？");
        expect(within(group).getByRole("radio", { name: /計算所得的時辰/ })).toBeChecked();
        expect(within(group).getByRole("radio", { name: /我不確定——省略時辰/ })).toBeInTheDocument();
      }
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      unmount();
    }
  });
});

// ── what is kept ─────────────────────────────────────────────────────────

const base = (kb: KnowledgeBase, over: Partial<Draft> = {}): Draft => interview(kb, "SP1", screenedDraft(kb, { ageYears: 36, sex: "male" }, over));
const savedOf = (kb: KnowledgeBase, d: Draft, id: string): SavedAssessment => toSaved(d, engine.assess(kb, assessInputOf(d, NOW)!), { id, lang: "en" });

describe("what is kept with the draft and with a saved result", () => {
  const chosen = (hourChoice: HourChoice): Draft => ({ ...base(dev, { rememberBirth: true }), birth: hourChoice === "alternative" ? { ...NEAR.birth, hourPick: "alternative" } : hourChoice === "unknown" ? { ...NEAR.birth, hour: 12, minute: 0, unknownHour: true } : NEAR.birth, hourChoice });

  it("a saved result records the choice and not the time, whatever was chosen", () => {
    for (const choice of HOUR_CHOICES) expect(savedOf(dev, chosen(choice), "r1").hour).toBe(choice);
    const none = base(dev);
    expect(savedOf(dev, none, "r2")).not.toHaveProperty("hour");
    expect(savedOf(dev, { ...chosen("primary"), birth: undefined } as unknown as Draft, "r3")).not.toHaveProperty("hour");          // no birth data, no hour to speak of
  });

  it("with the birth data not remembered the result keeps the choice but neither the time nor the pillars", () => {
    const s = savedOf(dev, { ...chosen("alternative"), rememberBirth: false }, "r4");
    expect(s.hour).toBe("alternative");
    expect(s.input.birth).toBeUndefined();
    expect(s.result.reference!.birth.pillars).toBeNull();
    expect(s.result.reference!.birth.trueSolarTime).toBeNull();
  });

  it("the draft keeps the choice only with the birth data it is about", () => {
    const d = chosen("alternative");
    expect(toStored(d).hourChoice).toBe("alternative");
    expect(toStored({ ...d, rememberBirth: false })).not.toHaveProperty("hourChoice");
    expect(toStored({ ...d, rememberBirth: false })).not.toHaveProperty("birth");
    expect(parseDraft(JSON.parse(JSON.stringify(toStored(d))))?.hourChoice).toBe("alternative");
    const hand = { ...JSON.parse(JSON.stringify(toStored({ ...d, rememberBirth: false }))), hourChoice: "alternative" };
    expect(parseDraft(hand)).not.toHaveProperty("hourChoice");                                             // a choice with no birth data to belong to is not read
    expect(parseDraft({ ...JSON.parse(JSON.stringify(toStored(d))), hourChoice: "other" })).not.toHaveProperty("hourChoice");
  });

  it("edit and re-run brings the choice back with the birth data", () => {
    const s = savedOf(dev, chosen("alternative"), "r5");
    const again = draftFromSaved(dev, s, "d2", NOW);
    expect(again.hourChoice).toBe("alternative");
    expect(again.birth?.hourPick).toBe("alternative");
    expect(draftFromSaved(dev, savedOf(dev, base(dev), "r6"), "d3", NOW)).not.toHaveProperty("hourChoice");
  });
});

describe("the importer", () => {
  const round = (x: unknown): unknown => JSON.parse(JSON.stringify(x));

  it("keeps the choice of a result and of a draft, and refuses what is not one of the three", () => {
    const s = savedOf(dev, { ...base(dev, { rememberBirth: true }), birth: NEAR.birth, hourChoice: "primary" }, "r7");
    for (const hour of HOUR_CHOICES) {
      const v = validateAssessment({ ...(round(s) as object), hour });
      expect(v.ok && v.value.hour, hour).toBe(hour);
    }
    expect(validateAssessment({ ...(round(s) as object), hour: "other" }).ok).toBe(false);
    expect(validateAssessment(round(savedOf(dev, base(dev), "r8"))).ok).toBe(true);
    const d: Draft = { ...base(dev, { rememberBirth: true }), birth: NEAR.birth, hourChoice: "unknown" };
    const kept = validateDraft(round(toStored(d)));
    expect(kept.ok && kept.value.hourChoice).toBe("unknown");
    const dropped = validateDraft(round({ ...toStored(d), rememberBirth: false }));
    expect(dropped.ok && dropped.value).not.toHaveProperty("hourChoice");
    expect(validateDraft(round({ ...toStored(d), hourChoice: "other" })).ok).toBe(false);
  });

  it("keeps the second of two clock times and the other hour in the birth data, which it used to drop", () => {
    const s = savedOf(dev, { ...base(dev, { rememberBirth: true }), birth: { ...NEAR.birth, fold: "second", hourPick: "alternative" }, hourChoice: "alternative" }, "r9");
    const v = validateAssessment(round(s));
    expect(v.ok && v.value.input.birth).toMatchObject({ fold: "second", hourPick: "alternative" });
    const bad = (birth: object): boolean => validateAssessment({ ...(round(s) as object), input: { ...(round(s) as { input: object }).input, birth } }).ok;
    expect(bad({ ...NEAR.birth, fold: "third" })).toBe(false);
    expect(bad({ ...NEAR.birth, hourPick: "primary" })).toBe(false);
  });
});

describe("a result made with the choice is proved genuine by making it again", () => {
  const replay = (kb: KnowledgeBase) => makeReplay(kb, engine);
  const variants: [string, BirthInput, HourChoice][] = [
    ["the computed hour", NEAR.birth, "primary"],
    ["the other hour", { ...NEAR.birth, hourPick: "alternative" }, "alternative"],
    ["no hour", { ...NEAR.birth, hour: 12, minute: 0, unknownHour: true }, "unknown"],
  ];
  it("the three outcomes, in both profiles", () => {
    for (const kb of [dev, release]) for (const [label, birth, hourChoice] of variants) {
      expect(replay(kb)(savedOf(kb, { ...base(kb, { rememberBirth: true }), birth, hourChoice }, "r10")), `${kb.profile}: ${label}`).toBe("same");
    }
  });
  it("the second of two clock times, which a backup used to turn into the first", () => {
    const second: BirthInput = { year: 2026, month: 11, day: 1, hour: 1, minute: 30, sex: "male", timeZone: "America/New_York", longitude: -74, fold: "second" };
    const s = savedOf(dev, { ...base(dev, { rememberBirth: true }), birth: second }, "r11");
    expect(replay(dev)(s)).toBe("same");
    const back = validateAssessment(JSON.parse(JSON.stringify(s)));
    expect(back.ok && replay(dev)(back.value)).toBe("same");
  });
  it("a result whose choice was changed afterwards is no longer genuine: the answer cannot be edited away", () => {
    const s = savedOf(dev, { ...base(dev, { rememberBirth: true }), birth: { ...NEAR.birth, hourPick: "alternative" }, hourChoice: "alternative" }, "r12");
    const { hourPick: _p, ...plain } = s.input.birth!;
    expect(replay(dev)({ ...s, input: { ...s.input, birth: plain } })).not.toBe("same");
  });
});

describe("the sentence on the result", () => {
  async function result(s: SavedAssessment, lang: "en" | "zh-Hant" = "en") {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang, disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 } }));
    const t = testStore(env);
    await t.persistence.putAssessment(s);
    go(`/${lang}/result/${s.id}`);
    const view = renderApp(t.store, () => Promise.resolve(loaded));
    await act(async () => { await Promise.resolve(); });
    await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    return view;
  }
  const withBirth = (hourChoice: HourChoice, remember: boolean): SavedAssessment => {
    const birth = hourChoice === "alternative" ? { ...NEAR.birth, hourPick: "alternative" as const } : hourChoice === "unknown" ? { ...NEAR.birth, hour: 12, minute: 0, unknownHour: true } : NEAR.birth;
    return savedOf(dev, { ...base(dev, { rememberBirth: remember }), birth, hourChoice }, `r2000000000000${hourChoice === "primary" ? 1 : hourChoice === "alternative" ? 2 : 3}`);
  };

  it("says which hour the birth chart was made from, in each of the three cases and whether or not the birth data was remembered", async () => {
    const want: Record<HourChoice, string> = {
      primary: "The birth chart was made with the computed hour, so it could instead be the other one.",
      alternative: "The birth chart was made with the other hour, as you chose.",
      unknown: "You were not sure of it, so the hour pillar was left out of the birth chart.",
    };
    for (const remember of [true, false]) for (const choice of HOUR_CHOICES) {
      await result(withBirth(choice, remember));
      const note = document.getElementById("hour-note")!;
      expect(note, `${choice} ${remember}`).toHaveTextContent("Your birth time was close to a change of hour.");
      expect(note).toHaveTextContent(want[choice]);
      cleanup();
      go("/");
    }
  });
  it("says nothing when the time was not near a change", async () => {
    await result(savedOf(dev, { ...base(dev, { rememberBirth: true }), birth: FAR.birth }, "r2000000000009"));
    expect(document.getElementById("hour-note")).toBeNull();
  });
  it("is in Traditional Chinese", async () => {
    await result(withBirth("alternative", true), "zh-Hant");
    expect(document.getElementById("hour-note")).toHaveTextContent("您的出生時間接近時辰的交界。依您的選擇，生辰是用另一個時辰推算的。");
  });
});
