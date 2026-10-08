// AI help in Settings (PM-46; docs/post-mvp/design/ai-assisted-intake.md §5, privacy §2): the tests run with the development profile's build constants, which turn AI help on with the local
// gateway. Nothing is asked of the gateway before the person agrees; the consent is kept with the statement's version, never travels in a backup, and is withdrawn by one switch.
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Loaded } from "../src/app/knowledge.tsx";
import { AI_ENABLED, AI_ENDPOINT, AI_FACE, AI_TONGUE } from "../src/ai/build.ts";
import { AI_STATEMENT_VERSION, consentOf, withConsent, withoutConsent } from "../src/ai/consent.ts";
import { backupPrefs } from "../src/storage/backup/format.ts";
import { parsePrefs } from "../src/storage/prefs.ts";
import { DEFAULT_PREFS } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
const CONFIG = { v: 1, modules: { conversation: true, tongue: false, face: false }, limits: { proposals: 12 } };
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchSpy = vi.fn(() => Promise.resolve(json(CONFIG))); vi.stubGlobal("fetch", fetchSpy); });
afterEach(() => { vi.unstubAllGlobals(); go("/"); });
const gatewayCalls = (): string[] => fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith(AI_ENDPOINT!));

async function open(path: string, env = fakeEnvironment()) {
  go(path);
  const t = testStore(env);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 });
  return { ...view, ...t, env };
}
const card = async () => within(await screen.findByRole("region", { name: "AI help (in development)" }));
const box = async () => (await card()).getByRole("checkbox", { name: /Conversation: describe it in your own words/ });

describe("AI help in Settings (development build)", () => {
  it("is in this build, with the local gateway", () => {
    expect(AI_ENABLED).toBe(true);
    expect(AI_ENDPOINT).toBe("http://127.0.0.1:8787");
  });

  it("is off by default, says what it would store and send, and asks nothing of the gateway", async () => {
    await open("/en/settings");
    expect(await box()).not.toBeChecked();
    const c = await card();
    expect(c.getByRole("table", { name: "What AI help stores and sends" })).toBeInTheDocument();
    expect(c.getByText("Memory only; sent to this service and the AI provider with each question")).toBeInTheDocument();
    expect(c.getByText(/Photos are for adults only and are not saved anywhere/)).toBeInTheDocument();
    expect(c.getByRole("checkbox", { name: /Tongue: look at a photo/ })).not.toBeChecked();
    expect(c.getByRole("checkbox", { name: /Face: look at a photo/ })).not.toBeChecked();
    expect(c.getByText("A photo of the tongue or face")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-on")).toBeNull();
    expect(gatewayCalls()).toEqual([]);
  });

  it("turning it on asks first: not turning it on leaves it off and sends nothing", async () => {
    const { store } = await open("/en/settings");
    await userEvent.click(await box());
    const dialog = within(screen.getByRole("dialog", { name: "Turn on AI help?" }));
    expect(dialog.getByText(/no longer holds for the conversation's text/)).toBeInTheDocument();
    expect(dialog.getByText(/Please do not type your name or contact details/)).toBeInTheDocument();
    expect(dialog.getByText("For adults (18 and over) only.")).toBeInTheDocument();
    expect(dialog.getByText(`Statement version: ${AI_STATEMENT_VERSION}`)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Do not turn on" }));
    expect(await box()).not.toBeChecked();
    expect(store.getState().prefs.ai).toBeUndefined();
    expect(gatewayCalls()).toEqual([]);
  });

  it("agreeing records the consent with the statement's version, shows the indicator, and only then asks the service whether it is on — without cookies or referrer", async () => {
    const env = fakeEnvironment();
    const { store, unmount } = await open("/en/settings", env);
    await userEvent.click(await box());
    await userEvent.click(screen.getByRole("button", { name: "Agree and turn on" }));
    expect(store.getState().prefs.ai?.conversation?.version).toBe(AI_STATEMENT_VERSION);
    expect(await (await card()).findByText("The service is available.")).toBeInTheDocument();
    expect(gatewayCalls()).toEqual([`${AI_ENDPOINT}/v1/config`]);
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", mode: "cors" });
    const indicator = await screen.findByTestId("ai-on");
    expect(indicator).toHaveAccessibleName("AI help is on — open Settings");
    expect(indicator).toHaveAttribute("href", "/en/settings#settings-ai");
    unmount();
    const again = await open("/en/", env);
    expect(again.store.getState().prefs.ai?.conversation).toBeDefined();
    expect(await screen.findByTestId("ai-on")).toBeInTheDocument();
  });

  it("the service switched off, or out of reach, is said plainly", async () => {
    fetchSpy.mockImplementationOnce(() => Promise.resolve(json({ ...CONFIG, modules: { conversation: false, tongue: false, face: false } })));
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en", ai: { conversation: { at: 5, version: AI_STATEMENT_VERSION } } }));
    const first = await open("/en/settings", env);
    expect(await (await card()).findByText("The service is switched off for now; the questions work as usual.")).toBeInTheDocument();
    first.unmount();
    fetchSpy.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    await open("/en/settings", env);
    expect(await (await card()).findByText("The service cannot be reached right now; the questions work as usual.")).toBeInTheDocument();
  });

  it("withdrawing is one switch: the consent is gone, the indicator too, and nothing more is sent", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en", ai: { conversation: { at: 5, version: AI_STATEMENT_VERSION } } }));
    const { store } = await open("/en/settings", env);
    expect(await screen.findByTestId("ai-on")).toBeInTheDocument();
    await (await card()).findByText("The service is available.");
    const calls = gatewayCalls().length;
    await userEvent.click(await box());
    expect(store.getState().prefs.ai?.conversation).toBeUndefined();
    expect((await card()).getByText("AI help is off; nothing more is sent.")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-on")).toBeNull();
    expect(gatewayCalls().length).toBe(calls);
  });

  it("a consent to an earlier statement asks again", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en", ai: { conversation: { at: 5, version: "2026-01-01" } } }));
    await open("/en/settings", env);
    expect(await box()).not.toBeChecked();
    expect(screen.queryByTestId("ai-on")).toBeNull();
    expect(gatewayCalls()).toEqual([]);
  });
});

const PHOTO_CONFIG = { ...CONFIG, modules: { conversation: true, tongue: true, face: true } };
const photoBox = async (what: "Tongue" | "Face") => (await card()).getByRole("checkbox", { name: new RegExp(`${what}: look at a photo`) });

describe("the photo of the tongue and of the face in Settings (development build, PM-50)", () => {
  it("is in this build", () => {
    expect(AI_TONGUE).toBe(true);
    expect(AI_FACE).toBe(true);
  });

  it("each photo module has its own switch and its own statement, and not agreeing changes nothing", async () => {
    const { store } = await open("/en/settings");
    await userEvent.click(await photoBox("Tongue"));
    const dialog = within(screen.getByRole("dialog", { name: "Turn on photo help for your tongue?" }));
    expect(dialog.getByText(/no longer holds for the photos you choose to send/)).toBeInTheDocument();
    expect(dialog.getByText(/shrunk on your device, stripped of place, time and camera details, and sent once — when you press Send/)).toBeInTheDocument();
    expect(dialog.getByText(/Neither this service nor the AI provider keeps the photo, and the app never saves it/)).toBeInTheDocument();
    expect(dialog.getByText(/No name, birth data, earlier results or notes are sent with it/)).toBeInTheDocument();
    expect(dialog.getByText("For adults (18 and over) only.")).toBeInTheDocument();
    expect(dialog.getByText(/have not been checked against practitioners' readings/)).toBeInTheDocument();
    expect(dialog.getByText(`Statement version: ${AI_STATEMENT_VERSION}`)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Do not turn on" }));
    expect(await photoBox("Tongue")).not.toBeChecked();
    expect(store.getState().prefs.ai).toBeUndefined();
    await userEvent.click(await photoBox("Face"));
    expect(screen.getByRole("dialog", { name: "Turn on photo help for your face?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Do not turn on" }));
    expect(gatewayCalls()).toEqual([]);
  });

  it("agreeing to the tongue records that module only, shows the indicator, and asks the service about the tongue — not about anything else", async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(json(PHOTO_CONFIG)));
    const { store } = await open("/en/settings");
    await userEvent.click(await photoBox("Tongue"));
    await userEvent.click(screen.getByRole("button", { name: "Agree and turn on" }));
    expect(store.getState().prefs.ai).toEqual({ tongue: { at: expect.any(Number), version: AI_STATEMENT_VERSION } });
    expect(await screen.findByTestId("ai-service-tongue")).toHaveTextContent("Tongue photo: The service is available.");
    expect(screen.queryByTestId("ai-service")).toBeNull();
    expect(screen.queryByTestId("ai-service-face")).toBeNull();
    expect(gatewayCalls()).toEqual([`${AI_ENDPOINT}/v1/config`]);
    expect(await photoBox("Tongue")).toBeChecked();
    expect(await photoBox("Face")).not.toBeChecked();
    expect(await box()).not.toBeChecked();
    expect(await screen.findByTestId("ai-on")).toBeInTheDocument();
  });

  it("a photo module the service has switched off is said plainly, with its name", async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(json({ ...PHOTO_CONFIG, modules: { conversation: true, tongue: true, face: false } })));
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en", ai: { face: { at: 5, version: AI_STATEMENT_VERSION } } }));
    await open("/en/settings", env);
    expect(await screen.findByTestId("ai-service-face")).toHaveTextContent("Face photo: The service is switched off for now; the questions work as usual.");
  });

  it("withdrawing a photo module is one switch and leaves the other modules as they were", async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(json(PHOTO_CONFIG)));
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en", ai: { conversation: { at: 5, version: AI_STATEMENT_VERSION }, tongue: { at: 6, version: AI_STATEMENT_VERSION } } }));
    const { store } = await open("/en/settings", env);
    await screen.findByTestId("ai-service-tongue");
    await userEvent.click(await photoBox("Tongue"));
    expect(store.getState().prefs.ai).toEqual({ conversation: { at: 5, version: AI_STATEMENT_VERSION } });
    expect(screen.queryByTestId("ai-service-tongue")).toBeNull();
    expect(await screen.findByTestId("ai-on"), "the conversation is still on").toBeInTheDocument();
    await userEvent.click(await box());
    expect((await card()).getByText("AI help is off; nothing more is sent.")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-on")).toBeNull();
  });

  it("a consent to an earlier statement asks again, per module", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en", ai: { tongue: { at: 5, version: "2026-01-01" } } }));
    await open("/en/settings", env);
    expect(await photoBox("Tongue")).not.toBeChecked();
    expect(screen.queryByTestId("ai-on")).toBeNull();
    expect(gatewayCalls()).toEqual([]);
  });

  it("is never in a backup, and the photo is never in a preference", () => {
    const prefs = { ...DEFAULT_PREFS, lang: "en" as const, ...withConsent(DEFAULT_PREFS, "tongue", 7) };
    expect(consentOf(prefs, "tongue")).toEqual({ at: 7, version: AI_STATEMENT_VERSION });
    expect(consentOf(prefs, "face")).toBeNull();
    expect(backupPrefs(prefs)).not.toHaveProperty("ai");
    expect(Object.keys(prefs.ai ?? {})).toEqual(["tongue"]);
  });
});

describe("the consent as data", () => {
  it("is read back only when well formed", () => {
    expect(parsePrefs(JSON.stringify({ ai: { conversation: { at: 5, version: "v" } } })).ai).toEqual({ conversation: { at: 5, version: "v" } });
    expect(parsePrefs(JSON.stringify({ ai: { tongue: { at: 5, version: "v" }, face: { at: 6, version: "v" } } })).ai).toEqual({ tongue: { at: 5, version: "v" }, face: { at: 6, version: "v" } });
    for (const ai of [{ conversation: { at: "5", version: "v" } }, { conversation: { at: 5 } }, { tongue: { at: 5 } }, { pulse: { at: 5, version: "v" } }, "on", { conversation: true }]) expect(parsePrefs(JSON.stringify({ ai })).ai).toBeUndefined();
  });

  it("is set and withdrawn per module, and only the current statement's consent counts", () => {
    const on = { ...DEFAULT_PREFS, ...withConsent(DEFAULT_PREFS, "conversation", 7) };
    expect(consentOf(on, "conversation")).toEqual({ at: 7, version: AI_STATEMENT_VERSION });
    expect(consentOf({ ...DEFAULT_PREFS, ai: { conversation: { at: 7, version: "old" } } }, "conversation")).toBeNull();
    expect(consentOf({ ...on, ...withoutConsent(on, "conversation") }, "conversation")).toBeNull();
  });

  it("never travels in a backup", () => {
    const prefs = { ...DEFAULT_PREFS, lang: "en" as const, ...withConsent(DEFAULT_PREFS, "conversation", 7) };
    expect(backupPrefs(prefs)).not.toHaveProperty("ai");
  });
});
