// The season model, declared, on screen (docs/post-mvp/design/five-phase-extensions.md §7; task PM-29): the result says in one line which school's reading of the year stands behind its season, with a plain
// explanation one click away, in the page's language and as it was made; the practitioner summary says it at its foot; and the development profile — and only it — has a switch to try the other model.
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import type { SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const JULY = Date.UTC(2026, 6, 10, 12);
const AUGUST = Date.UTC(2026, 7, 1, 12);
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { cleanup(); go("/"); vi.restoreAllMocks(); });

const made = (id: string, seasons?: "south" | "off", model?: "changxia" | "tuwang18", at = JULY): SavedAssessment => {
  const draft = interview(kb, "SP1");
  return toSaved(draft, engine.assess(kb, assessInputOf(draft, at, seasons, model)!), { id, lang: "en" });
};

async function open(path: string, opts: { items?: SavedAssessment[]; lang?: "en" | "zh-Hant"; prefs?: Record<string, unknown> } = {}) {
  const lang = opts.lang ?? "en";
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang, disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, ...opts.prefs }));
  const t = testStore(env);
  for (const s of opts.items ?? []) await t.persistence.putAssessment(s);
  go(`/${lang}${path}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { ...view, env, user: userEvent.setup() };
}
const stored = (env: ReturnType<typeof fakeEnvironment>): Record<string, unknown> => JSON.parse(env.localStorage.getItem("tcm.prefs") ?? "{}") as Record<string, unknown>;
const model = (): HTMLElement => document.getElementById("season-model")!;

describe("the model line of a result", () => {
  const first = made("r0123456789abcde1");
  const other = made("r0123456789abcde2", undefined, "tuwang18");

  it("declares the first model in one line, with the explanation behind a disclosure", async () => {
    await open(`/result/${first.id}`, { items: [first] });
    expect(model()).toHaveTextContent("Late summer (長夏) is counted as a season of its own, between summer and autumn.");
    const details = model().querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(model()).getByText("What does this mean?")).toBeInTheDocument();
    expect(details).toHaveTextContent("This app counts late summer as a season of its own, between summer and autumn, and says so on every result.");
    expect(details).toHaveTextContent("never how your symptoms are scored");
  });
  it("says the other model in its own words, and names the days of 土 in the page's language", async () => {
    await open(`/result/${other.id}`, { items: [other] });
    expect(model()).toHaveTextContent("Late summer is not a season of its own: the earth phase (土旺) commands the last 18 days before each change of season.");
    expect(model().querySelector("details")).toHaveTextContent("This result counts the earth phase as commanding the last 18 days before each change of season");
  });
  it("on the days that are 土 under the other model the season is called Earth days, not shown in Chinese on an English page", async () => {
    const aug = made("r0123456789abcde3", undefined, "tuwang18", AUGUST);
    await open(`/result/${aug.id}`, { items: [aug] });
    expect(document.getElementById("season-basis")).toHaveTextContent("Season: Earth days (northern calendar)");
    const section = screen.getByRole("heading", { name: /Coming seasons/ }).closest("section")!;
    expect(within(section).getAllByRole("listitem").every((li) => !/[㐀-鿿]/.test(li.textContent!))).toBe(true);
  });
  it("is what the result was made with, whatever this device would use", async () => {
    await open(`/result/${first.id}`, { items: [first], prefs: { seasonModel: "tuwang18" } });
    expect(model()).toHaveTextContent("is counted as a season of its own");
  });
  it("is absent from a result made without seasons: there is no season to read", async () => {
    const off = made("r0123456789abcde4", "off");
    await open(`/result/${off.id}`, { items: [off] });
    expect(document.getElementById("season-basis")).toHaveTextContent("Seasons were left out of this result.");
    expect(document.getElementById("season-model")).toBeNull();
  });
  it("is in Traditional Chinese", async () => {
    await open(`/result/${first.id}`, { items: [first], lang: "zh-Hant" });
    expect(model()).toHaveTextContent("長夏單獨算作一個季節，位於夏與秋之間。");
    expect(within(model()).getByText("這是什麼意思？")).toBeInTheDocument();
  });
  it("has no accessibility violations, with the explanation open", async () => {
    await open(`/result/${first.id}`, { items: [first] });
    model().querySelector("details")!.setAttribute("open", "");
    expect((await axe(model(), { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe("the practitioner summary", () => {
  it("says at its foot how the season was counted — the model and the basis — and the copy says it too", async () => {
    const s = made("r0123456789abcde5", "south", "tuwang18");
    await open(`/result/${s.id}/summary`, { items: [s] });
    const foot = document.querySelector("footer")!;
    expect(foot).toHaveTextContent("Seasons: the earth phase on the last 18 days before each change of season (southern hemisphere).");
    expect(foot).toHaveTextContent("parameters");
  });
  it("says that seasons were left out when they were", async () => {
    const s = made("r0123456789abcde6", "off");
    await open(`/result/${s.id}/summary`, { items: [s] });
    expect(document.querySelector("footer")).toHaveTextContent("Seasons were left out of this result.");
  });
});

describe("the switch of the development profile", () => {
  it("is in Settings → Seasons, labelled as a development control, and keeps the choice as a preference of this device", async () => {
    const { env, user } = await open("/settings");
    const card = within(screen.getByRole("region", { name: "Seasons" }));
    const group = card.getByRole("group", { name: "DEV · Season model" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.parentElement!.textContent)).toEqual(["changxia — late summer as a season of its own", "tuwang18 — earth phase on the last 18 days of each season"]);
    expect(radios[0]).toBeChecked();
    await user.click(radios[1]!);
    expect(stored(env)["seasonModel"]).toBe("tuwang18");
    expect(within(card.getByRole("group", { name: "DEV · Season model" })).getAllByRole("radio")[1]).toBeChecked();
    expect(card.getByText(/Results made from now on use this model and are stamped with it/)).toBeInTheDocument();
  });
  it("comes back as it was chosen", async () => {
    await open("/settings", { prefs: { seasonModel: "tuwang18" } });
    const group = within(screen.getByRole("region", { name: "Seasons" })).getByRole("group", { name: "DEV · Season model" });
    expect(within(group).getAllByRole("radio")[1]).toBeChecked();
  });
});
