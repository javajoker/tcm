import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { buildChart, type BirthInput } from "@tcm/wuxing";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { echoOf, EMPTY_FORM, formOf, isTimeZone, parseBirth, type BirthForm } from "../src/screens/birth/model.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const shanghai: BirthForm = { ...EMPTY_FORM, date: "1990-05-12", time: "14:30", longitude: "121.47", timeZone: "Asia/Shanghai" };

describe("birth model", () => {
  it("builds the BirthInput, west longitudes negative, and says what is missing", () => {
    expect(parseBirth(shanghai, "male")).toEqual({ birth: { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 }, missing: [] });
    expect(parseBirth({ ...shanghai, longitude: "74", hemisphere: "west", timeZone: "America/New_York" }, "female").birth?.longitude).toBe(-74);
    expect(parseBirth(EMPTY_FORM, "male").missing).toEqual(["date", "time", "longitude", "timeZone"]);
    expect(parseBirth(shanghai, undefined).missing).toEqual(["sex"]);
  });

  it("an unknown hour needs no time and is flagged, never guessed; a fold choice is carried", () => {
    const b = parseBirth({ ...shanghai, time: "", unknownHour: true }, "male").birth!;
    expect(b.unknownHour).toBe(true);
    expect(buildChart(b).hour).toBeNull();
    expect(parseBirth({ ...shanghai, fold: "second" }, "male").birth?.fold).toBe("second");
    expect(parseBirth({ ...shanghai, fold: "first" }, "male").birth).not.toHaveProperty("fold");
  });

  it("refuses what is not a date, a longitude or a time zone", () => {
    for (const [patch, field] of [[{ date: "1990-13-01" }, "date"], [{ date: "1990-04-31" }, "date"], [{ date: "90-5-12" }, "date"], [{ time: "9:30" }, "time"], [{ longitude: "181" }, "longitude"], [{ longitude: "abc" }, "longitude"], [{ timeZone: "Mars/Base" }, "timeZone"], [{ timeZone: "" }, "timeZone"]] as const) {
      expect(parseBirth({ ...shanghai, ...patch }, "male").missing, JSON.stringify(patch)).toContain(field);
    }
    expect(isTimeZone("Asia/Taipei")).toBe(true);
    expect(isTimeZone("not/azone")).toBe(false);
  });

  it("formOf is the inverse of parseBirth", () => {
    const b: BirthInput = { year: 1985, month: 2, day: 3, hour: 4, minute: 5, sex: "female", timeZone: "America/New_York", longitude: -74.5 };
    expect(parseBirth(formOf(b), "female").birth).toEqual(b);
    const u: BirthInput = { year: 1985, month: 2, day: 3, hour: 12, minute: 0, sex: "male", timeZone: "Asia/Taipei", longitude: 121.5, unknownHour: true };
    expect(parseBirth(formOf(u), "male").birth).toEqual(u);
  });

  it("the echo says how far true solar time is from the clock time (the worked example: 14:30 on the clock → 13:39 true solar, daylight saving removed)", () => {
    const b = parseBirth(shanghai, "male").birth!;
    const e = echoOf(buildChart(b), b);
    expect(e).toMatchObject({ lon: "121.47", hemisphere: "east", zone: "Asia/Shanghai", dst: true });
    expect(e.deltaMinutes).toBe(-50);                                                          // 13:39 true solar (seconds included) vs 14:30 on the clock
  });
});

async function open(draft: Draft = screenedDraft(kb, { ageYears: 36, sex: "male" }), lang: "en" | "zh-Hant" = "en") {
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

async function fill(c: ReturnType<typeof within>, f: { date?: string; time?: string; lon?: string; zone?: string; west?: boolean }): Promise<void> {
  if (f.date !== undefined) await userEvent.type(c.getByLabelText("Date of birth"), f.date);
  if (f.time !== undefined) await userEvent.type(c.getByLabelText("Time of birth"), f.time);
  if (f.lon !== undefined) await userEvent.type(c.getByLabelText("Longitude (degrees)"), f.lon);
  if (f.west) await userEvent.selectOptions(c.getByLabelText("East or west"), "west");
  if (f.zone !== undefined) await userEvent.type(c.getByLabelText("Time zone"), f.zone);
}

describe("Birth card (S03)", () => {
  it("is optional: it explains itself, says it never changes the score, and uses nothing until it is complete (dev opens it)", async () => {
    const { store } = await open();
    const c = card();
    expect(c.getByText(/stays on your device, is not clinically validated, and never changes how your symptoms are scored/)).toBeInTheDocument();
    expect(c.getByRole("checkbox", { name: "Add my birth data as a traditional background reference" })).toBeChecked();      // the dev profile opens it
    expect(c.getByText(/Birth data is not used until the date, the place/)).toBeInTheDocument();
    await fill(c, { date: "1990-05-12" });
    expect(draftOf(store).birth).toBeUndefined();
  });

  it("a complete entry is stored in the draft, echoed back, and the birth module turns on for the assessment (E8)", async () => {
    const { store } = await open();
    const c = card();
    await fill(c, { date: "1990-05-12", time: "14:30", lon: "121.47", zone: "Asia/Shanghai" });
    const echo = await c.findByRole("status");
    expect(echo).toHaveTextContent("Longitude 121.47° East · Asia/Shanghai · true solar time is about −50 min from clock time");
    expect(echo).toHaveTextContent("Daylight saving time was in force at birth and has been removed.");
    await waitFor(() => expect(draftOf(store).birth).toEqual({ year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 }));
    expect(assessInputOf(draftOf(store), 1)!.options.birthModule).toBe(true);
    expect(assessInputOf(draftOf(store), 1)!.subject.birth?.timeZone).toBe("Asia/Shanghai");
  });

  it("the diagnosis is unchanged by the birth data: the same findings give the same patterns with and without it", async () => {
    const d = interview(kb, "SP1", screenedDraft(kb, { ageYears: 36, sex: "male" }));
    const a = engine.assess(kb, assessInputOf(d, 5)!);
    const b = engine.assess(kb, assessInputOf({ ...d, birth: parseBirth(shanghai, "male").birth! }, 5)!);
    expect(b.patterns).toEqual(a.patterns);
    expect(b.verdict).toEqual(a.verdict);
    expect(b.panel.offsetPopulation).toEqual(a.panel.offsetPopulation);
    expect(b.reference!.birth.used).toBe(true);
  });

  it("an unknown hour needs no time and is stated plainly", async () => {
    const { store } = await open();
    const c = card();
    await userEvent.click(c.getByRole("checkbox", { name: "I don't know the hour of my birth" }));
    expect(c.queryByLabelText("Time of birth")).toBeNull();
    expect(c.getByText(/the hour pillar is left out and the reading is less detailed/)).toBeInTheDocument();
    await fill(c, { date: "1990-05-12", lon: "121.47", zone: "Asia/Shanghai" });
    await waitFor(() => expect(draftOf(store).birth?.unknownHour).toBe(true));
  });

  it("a west longitude is stored as a negative number", async () => {
    const { store } = await open();
    await fill(card(), { date: "1985-07-04", time: "09:15", lon: "74", west: true, zone: "America/New_York" });
    await waitFor(() => expect(draftOf(store).birth?.longitude).toBe(-74));
  });

  it("a time that happened twice when daylight saving ended shows both, lets the person pick, and stores the choice", async () => {
    const { store } = await open();
    const c = card();
    await fill(c, { date: "2026-11-01", time: "01:30", lon: "74", west: true, zone: "America/New_York" });
    const group = await c.findByRole("group", { name: "This time happened twice when daylight saving time ended" });
    const first = within(group).getByRole("radio", { name: /First time \(daylight saving time\)/ });
    const second = within(group).getByRole("radio", { name: /Second time \(standard time\)/ });
    expect(first).toBeChecked();
    expect(first.closest("label")).toHaveTextContent("00:50");                                            // the two true-solar clocks differ by an hour
    expect(second.closest("label")).toHaveTextContent("01:50");
    await waitFor(() => expect(draftOf(store).birth?.fold).toBeUndefined());
    await userEvent.click(second);
    await waitFor(() => expect(draftOf(store).birth?.fold).toBe("second"));
  });

  it("a clock time that never existed is refused, with a way to continue without birth data", async () => {
    const { store } = await open();
    const c = card();
    await fill(c, { date: "2026-03-08", time: "02:30", lon: "74", west: true, zone: "America/New_York" });
    expect(await c.findByText("This clock time did not exist locally")).toBeInTheDocument();
    expect(draftOf(store).birth).toBeUndefined();
    await userEvent.click(c.getAllByRole("button", { name: "Don't use birth data" })[0]!);
    expect(c.queryByLabelText("Date of birth")).toBeNull();
  });

  it("an unknown time zone is reported", async () => {
    await open();
    const c = card();
    await fill(c, { zone: "Mars/Base" });
    expect(c.getByText("This time zone is not known.")).toBeInTheDocument();
  });

  it("'remember on this device' is off by default; the birth moment reaches storage only when it is ticked (privacy §3)", async () => {
    const { store, env } = await open();
    const c = card();
    await fill(c, { date: "1990-05-12", time: "14:30", lon: "121.47", zone: "Asia/Shanghai" });
    await waitFor(() => expect(draftOf(store).birth).toBeDefined());
    const remember = c.getByRole("checkbox", { name: /^Remember my birth data on this device/ });
    expect(remember).not.toBeChecked();
    expect(c.getByText(/Off by default/)).toBeInTheDocument();
    await store.flush();
    expect([...Array(env.localStorage.length)].map((_, i) => env.localStorage.key(i))).not.toContain("birth");
    const fresh = testStore(env);
    await fresh.store.getState().init();
    expect(fresh.store.getState().draft?.birth).toBeUndefined();                                         // not stored
    await userEvent.click(remember);
    await store.flush();
    const again = testStore(env);
    await again.store.getState().init();
    expect(again.store.getState().draft?.birth?.year).toBe(1990);                                        // stored once the person agreed
    expect(again.store.getState().draft?.rememberBirth).toBe(true);
  });

  it("'Don't use birth data' removes it again", async () => {
    const { store } = await open();
    const c = card();
    await fill(c, { date: "1990-05-12", time: "14:30", lon: "121.47", zone: "Asia/Shanghai" });
    await waitFor(() => expect(draftOf(store).birth).toBeDefined());
    await userEvent.click(c.getByRole("button", { name: "Don't use birth data" }));
    await waitFor(() => expect(draftOf(store).birth).toBeUndefined());
    expect(c.getByRole("checkbox", { name: "Add my birth data as a traditional background reference" })).not.toBeChecked();
  });

  it("reopening the profile shows the stored birth data again", async () => {
    const d = { ...screenedDraft(kb, { ageYears: 36, sex: "male" }), birth: parseBirth(shanghai, "male").birth!, rememberBirth: true };
    await open(d);
    const c = card();
    expect(c.getByLabelText("Date of birth")).toHaveValue("1990-05-12");
    expect(c.getByLabelText("Time of birth")).toHaveValue("14:30");
    expect(c.getByLabelText("Longitude (degrees)")).toHaveValue("121.47");
    expect(c.getByLabelText("Time zone")).toHaveValue("Asia/Shanghai");
    expect(c.getByRole("checkbox", { name: /^Remember my birth data on this device/ })).toBeChecked();
  });

  it("is in Traditional Chinese and has no axe violations with the fields open (both languages)", async () => {
    for (const l of ["en", "zh-Hant"] as const) {
      const { container, unmount } = await open(screenedDraft(kb, { ageYears: 36, sex: "male" }), l);
      if (l === "zh-Hant") expect(screen.getByRole("heading", { name: "生辰（選填）" })).toBeInTheDocument();
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      unmount();
    }
  });
});
