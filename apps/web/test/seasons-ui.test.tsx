// How seasons are counted, on screen (docs/post-mvp/design/five-phase-extensions.md §4.2; task PM-26): the Settings card and what the device's time zone suggests, the choice kept, the season line of a result in
// the basis the result was made on, the coming seasons in the page's language, and the link from a result to the choice.
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
const MARCH = Date.UTC(2026, 2, 20, 12);
const CJK = /[㐀-鿿]/;
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { cleanup(); go("/"); vi.restoreAllMocks(); });

/** The device says it is in this time zone. */
function inZone(timeZone: string): void {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) { return { ...real.call(this), timeZone }; });
}

const made = (seasons: "south" | "off" | undefined, id: string): SavedAssessment => {
  const draft = interview(kb, "SP1");
  return toSaved(draft, engine.assess(kb, assessInputOf(draft, MARCH, seasons)!), { id, lang: "en" });
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
const card = (): HTMLElement => screen.getByRole("region", { name: "Seasons" });

describe("Settings → Seasons", () => {
  it("offers three ways to count the seasons, says what the app knows and does not, and on a northern zone suggests the northern calendar", async () => {
    inZone("Asia/Taipei");
    await open("/settings");
    const c = within(card());
    expect(c.getByText(/it does not know the climate where you are/)).toBeInTheDocument();
    expect(c.getAllByRole("radio").map((r) => r.parentElement!.textContent)).toEqual(["Northern calendar", "Southern hemisphere", "Don't use seasons"]);
    expect(c.getByRole("radio", { name: "Northern calendar" })).toBeChecked();
    expect(c.getByText("Not chosen yet: this device's time zone suggests the northern calendar.")).toBeInTheDocument();
    expect(c.getByText(/Spring begins in early February/)).toBeInTheDocument();
    expect(c.getByText(/Only the season changes\./)).toBeInTheDocument();
  });
  it("on a southern zone the suggestion is the southern calendar, and it is only a suggestion", async () => {
    inZone("Australia/Sydney");
    const { env } = await open("/settings");
    expect(within(card()).getByRole("radio", { name: "Southern hemisphere" })).toBeChecked();
    expect(within(card()).getByText("Not chosen yet: this device's time zone suggests the southern hemisphere.")).toBeInTheDocument();
    expect(stored(env)["seasons"]).toBeUndefined();          // nothing is stored until the person chooses
  });
  it("keeps what the person chooses, and then stops suggesting", async () => {
    inZone("Australia/Sydney");
    const { env, user } = await open("/settings");
    await user.click(within(card()).getByRole("radio", { name: "Don't use seasons" }));
    expect(stored(env)["seasons"]).toBe("off");
    expect(within(card()).getByRole("radio", { name: "Don't use seasons" })).toBeChecked();
    expect(within(card()).queryByText(/Not chosen yet/)).toBeNull();
    expect(within(card()).getByText(/For the tropics, where four seasons are not the climate/)).toBeInTheDocument();
    await user.click(within(card()).getByRole("radio", { name: "Northern calendar" }));          // against the zone's suggestion
    expect(stored(env)["seasons"]).toBe("north");
  });
  it("comes back as it was chosen", async () => {
    inZone("Asia/Taipei");
    await open("/settings", { prefs: { seasons: "south" } });
    expect(within(card()).getByRole("radio", { name: "Southern hemisphere" })).toBeChecked();
    expect(within(card()).queryByText(/Not chosen yet/)).toBeNull();
  });
  it("is in Chinese too", async () => {
    inZone("Australia/Sydney");
    await open("/settings", { lang: "zh-Hant" });
    const c = within(screen.getByRole("region", { name: "季節" }));
    expect(c.getByRole("radio", { name: "南半球" })).toBeChecked();
    expect(c.getByText("尚未選擇：依這個裝置的時區，建議使用南半球。")).toBeInTheDocument();
  });
  it("has no accessibility violations", async () => {
    inZone("Australia/Sydney");
    await open("/settings");
    expect((await axe(card(), { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe("the season line of a result", () => {
  const north = made(undefined, "r0123456789abcde1");
  const south = made("south", "r0123456789abcde2");
  const off = made("off", "r0123456789abcde3");

  it("says the season and the basis it was counted on, with a link to the choice", async () => {
    await open(`/result/${north.id}`, { items: [north] });
    const line = document.getElementById("season-basis")!;
    expect(line).toHaveTextContent("Season: Spring (northern calendar)");
    expect(within(line).getByRole("link", { name: "Seasons differ where I live" })).toHaveAttribute("href", "/en/settings#settings-seasons");
    expect(screen.getByText("Commanding season", { exact: false })).toBeInTheDocument();
  });
  it("on the southern basis the season is the one the person lives: autumn in March", async () => {
    await open(`/result/${south.id}`, { items: [south] });
    expect(document.getElementById("season-basis")).toHaveTextContent("Season: Autumn (southern hemisphere)");
  });
  it("a result made without seasons says so, and has no season block and no coming seasons", async () => {
    await open(`/result/${off.id}`, { items: [off] });
    expect(document.getElementById("season-basis")).toHaveTextContent("Seasons were left out of this result.");
    expect(screen.queryByText(/Commanding season/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /Coming seasons/ })).toBeNull();
  });
  it("is what the result was made on, whatever this device suggests today", async () => {
    inZone("Australia/Sydney");
    await open(`/result/${north.id}`, { items: [north] });
    expect(document.getElementById("season-basis")).toHaveTextContent("Season: Spring (northern calendar)");
  });
  it("names the coming seasons in the page's language, in the order they are lived", async () => {
    await open(`/result/${south.id}`, { items: [south] });
    const section = screen.getByRole("heading", { name: /Coming seasons/ }).closest("section")!;
    const items = within(section).getAllByRole("listitem").map((li) => li.textContent!);
    expect(items.some((x) => CJK.test(x)), "no unconverted Chinese on the English page").toBe(false);
    expect(items.map((x) => x.split(":")[0]!.trim())).toEqual(["Autumn", "Winter", "Spring", "Summer"]);
  });
  it("in Traditional Chinese", async () => {
    await open(`/result/${south.id}`, { items: [south], lang: "zh-Hant" });
    expect(document.getElementById("season-basis")).toHaveTextContent("季節：秋（南半球）");
    expect(within(document.getElementById("season-basis")!).getByRole("link", { name: "我所在地的季節不同" })).toBeInTheDocument();
  });
  it("the link leads to the Seasons card, and focus goes there", async () => {
    const { user } = await open(`/result/${north.id}`, { items: [north] });
    await user.click(within(document.getElementById("season-basis")!).getByRole("link"));
    expect(await screen.findByRole("heading", { level: 2, name: "Seasons" })).toBeInTheDocument();
    expect(window.location.pathname + window.location.hash).toBe("/en/settings#settings-seasons");
    expect(document.getElementById("settings-seasons")).toHaveFocus();
  });
});
