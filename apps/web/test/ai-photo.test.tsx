// The photo of the tongue and of the face (PM-50; docs/post-mvp/design/ai-assisted-intake.md §1, §3, §4). The gateway runs in the test with the mock provider or a rogue one; the browser's
// camera and canvas are replaced (jsdom has neither): what is tested is the flow — the way in, the guards, nothing sent before the person presses Send, what is sent and what is not,
// the reply checked again on the device, only confirmed features reaching the draft (as a guided observation), and the picture released whenever it is dropped.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configFrom } from "../../ai-gateway/src/config.ts";
import { createGateway } from "../../ai-gateway/src/gateway.ts";
import { mockProvider, type Provider } from "../../ai-gateway/src/provider.ts";
import { fakeJpeg } from "@tcm/ai/testing";
import type { ObserveBody } from "@tcm/ai";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import { AI_ENDPOINT } from "../src/ai/build.ts";
import { AI_STATEMENT_VERSION } from "../src/ai/consent.ts";
import type { Captured } from "../src/ai/photo/capture.ts";
import * as capture from "../src/ai/photo/capture.ts";
import { askedItems, pendingNotices, withAcknowledged, withAnswer } from "../src/screens/screening/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { kb, loaded, loadedHans } from "./sweep.tsx";

// the browser's side of a photo, which jsdom does not have: the file → a picture on a canvas → the JPEG that is sent
vi.mock("../src/ai/photo/capture.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof capture>()),
  readPhoto: vi.fn(),
  encodeJpeg: vi.fn(),
  releasePhoto: vi.fn(),
}));

const go = (path: string): void => { window.history.pushState({}, "", path); };
const MARK = "MARKER-5b1e";
type Lang = "en" | "zh-Hant" | "zh-Hans";
const GOOD_QUALITY = { ok: true, issues: [], measures: { mean: 130, sd: 30, dark: 0, bright: 0, sharp: 200, redGreen: 1.8, blueGreen: 1.0 } } as const;

const readPhoto = vi.mocked(capture.readPhoto);
const encodeJpeg = vi.mocked(capture.encodeJpeg);
const releasePhoto = vi.mocked(capture.releasePhoto);
let serial = 0;
/** A picture on a canvas; each one is told apart by its size, because the matchers compare objects by their contents. */
const picture = (quality: Captured["quality"] = GOOD_QUALITY): Captured => ({ canvas: document.createElement("canvas"), original: { width: 1200 + serial++, height: 900 }, quality });

beforeEach(() => {
  readPhoto.mockReset();
  encodeJpeg.mockReset();
  releasePhoto.mockReset();
  readPhoto.mockImplementation(() => Promise.resolve({ ok: true, photo: picture() }));
  encodeJpeg.mockImplementation(() => Promise.resolve(fakeJpeg({ size: 30_000 })));
});
afterEach(() => { vi.unstubAllGlobals(); go("/"); });

const screened = (subject: Draft["subject"] = { ageYears: 40, sex: "male" }): Draft => {
  let d: Draft = { ...newDraft("d", 1), subject, profile: { medications: "some", medicationText: [`${MARK}-med`], allergies: "none", conditions: "none" },
    birth: { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Taipei", longitude: 121.5 } };
  for (const f of [...askedItems(kb).A, ...askedItems(kb).B]) d = withAnswer(d, f.id, "no");
  return withAcknowledged(d, pendingNotices(kb, d), 1);
};

/** The gateway in the test; every request the app sends is kept. */
function gateway(provider: Provider = mockProvider, env: Record<string, string> = {}) {
  const handler = createGateway({ config: configFrom({ AI_SECRET: "s".repeat(40), AI_ALLOWED_ORIGINS: "http://localhost:5173", AI_MODULES: "conversation,tongue,face", ...env }), provider, now: () => Date.now(), log: () => undefined });
  const sent: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    sent.push({ url: String(url), body: typeof init.body === "string" ? JSON.parse(init.body) : null });
    return handler(new Request(String(url), { ...init, headers: { ...(init.headers as Record<string, string> | undefined), origin: "http://localhost:5173" } }));
  }));
  return { sent, photos: () => sent.filter((s) => s.url.includes("/v1/observe/")).map((s) => s.body as ObserveBody) };
}

type Consent = readonly ("conversation" | "tongue" | "face")[];
async function open(path: string, draft: Draft, lang: Lang = "en", consent: Consent = ["tongue", "face"]) {
  const env = fakeEnvironment();
  go(`/${lang}${path}`);
  const ai = Object.fromEntries(consent.map((m) => [m, { at: 1, version: AI_STATEMENT_VERSION }]));
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang, ...(consent.length > 0 ? { ai } : {}) }));
  const { store } = testStore(env);
  store.getState().startDraft();
  store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/observe" } }));
  const view = renderApp(store, (script) => Promise.resolve(script === "Hans" ? loadedHans : loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, store, draft: () => store.getState().draft! };
}
const jpeg = (name = "tongue.jpg"): File => new File([fakeJpeg({ size: 100 })], name, { type: "image/jpeg" });
async function choose(file = jpeg()): Promise<void> {
  const input = await screen.findByTestId("photo-input");
  await userEvent.upload(input, file);
}
const SEND = { en: "Send this photo", "zh-Hant": "傳送這張照片", "zh-Hans": "发送这张照片" } as const;
const send = async (lang: Lang = "en"): Promise<void> => userEvent.click(await screen.findByRole("button", { name: SEND[lang] }));

describe("the way in", () => {
  it("on the observation stage: for an adult who agreed, a link to the tongue's photo and a card for the face; for one who has not, a line pointing to Settings; for a minor, nothing", async () => {
    gateway();
    const a = await open("/observe", screened());
    expect(await screen.findByRole("link", { name: "Use a photo of your tongue instead (AI help)" })).toHaveAttribute("href", "/en/observe/photo/tongue");
    const face = within(await screen.findByRole("region", { name: "Face (photo, AI help)" }));
    expect(face.getByRole("link", { name: "Take a photo" })).toHaveAttribute("href", "/en/observe/photo/face");
    expect(face.getByText("Nothing noted from a photo yet.")).toBeInTheDocument();
    a.unmount();
    const b = await open("/observe", screened(), "en", []);
    expect(await screen.findByText(/Photo help for the tongue and face can be turned on in Settings/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/en/settings#settings-ai");
    expect(screen.queryByRole("region", { name: "Face (photo, AI help)" })).toBeNull();
    b.unmount();
    await open("/observe", screened({ ageYears: 16, sex: "male" }));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Use a photo of your tongue instead (AI help)" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Face (photo, AI help)" })).toBeNull();
    expect(screen.queryByText(/Photo help for the tongue and face/)).toBeNull();
  });

  it("the photo needs the consent to that module, and an adult; an unknown module goes back to the observation stage", async () => {
    gateway();
    const a = await open("/observe/photo/tongue", screened(), "en", ["face"]);
    await waitFor(() => expect(window.location.pathname + window.location.hash).toBe("/en/settings#settings-ai"));
    a.unmount();
    const b = await open("/observe/photo/face", screened({ ageYears: 16, sex: "male" }));
    await waitFor(() => expect(window.location.pathname).toBe("/en/observe"));
    b.unmount();
    await open("/observe/photo/pulse", screened());
    await waitFor(() => expect(window.location.pathname).toBe("/en/observe"));
  });
});

describe("a photo of the tongue", () => {
  it("nothing is sent until Send; then the picture, the tongue's features and their groups — and nothing of the profile; suggestions are proposals, and only what is confirmed reaches the draft as a guided observation", async () => {
    const g = gateway();
    const { draft } = await open("/observe/photo/tongue", screened());
    expect(await screen.findByRole("heading", { level: 1, name: "Tongue photo (AI help)" })).toBeInTheDocument();
    expect(screen.getByText(/Take it in daylight by a window/)).toBeInTheDocument();
    await choose();
    expect(await screen.findByTestId("photo-view")).toBeInTheDocument();
    expect(readPhoto).toHaveBeenCalledTimes(1);
    expect(readPhoto.mock.calls[0]![1]).toBe("tongue");
    expect(screen.getByText(/Nothing has left your device yet/)).toBeInTheDocument();
    expect(g.sent, "looking at the picture sends nothing").toEqual([]);

    await send();
    const items = await screen.findAllByTestId("photo-suggestion");
    expect(g.sent.map((s) => new URL(s.url).pathname)).toEqual(["/v1/session", "/v1/observe/tongue"]);
    expect(g.sent.every((s) => s.url.startsWith(AI_ENDPOINT!))).toBe(true);
    const [request] = g.photos();
    expect(Object.keys(request!).sort(), "the module is the route's, not the body's").toEqual(["exclusive", "image", "lang", "v", "vocabulary"]);
    expect(request!.lang).toBe("en");
    expect(request!.image.type).toBe("image/jpeg");
    expect(request!.vocabulary.map((v) => v.id)).toContain("T_BODY_PALE_SWOLLEN");
    expect(request!.vocabulary.map((v) => v.id), "the sublingual veins need another view").not.toContain("T_SUBLINGUAL_VEINS");
    expect(request!.vocabulary.find((v) => v.id === "T_TOOTHMARK_EDGE")).toEqual({ id: "T_TOOTHMARK_EDGE", label: "tooth marks on the tongue edges", group: "special" });
    expect(request!.exclusive.some((x) => x.includes("T_BODY_PALE") && x.includes("T_BODY_RED"))).toBe(true);
    const all = JSON.stringify(g.sent);
    for (const m of [MARK, "1990", "Asia/Taipei", "121.5", '"male"', "ageYears", "medication"]) expect(all).not.toContain(m);

    // the suggestions, in the app's own words; nothing counts before it is confirmed
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["pale, swollen tongue", "tooth marks on the tongue edges", "white greasy coating"]);
    expect(draft().findings["T_BODY_PALE_SWOLLEN"]).toBeUndefined();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    await userEvent.click(within(items[0]!).getByRole("button", { name: "Yes, I see this" }));
    await userEvent.click(within(screen.getAllByTestId("photo-suggestion")[0]!).getByRole("button", { name: "No" }));
    await userEvent.click(within(screen.getAllByTestId("photo-suggestion")[0]!).getByRole("button", { name: "Yes, I see this" }));
    expect(screen.queryAllByTestId("photo-suggestion")).toHaveLength(0);
    // the colour answers its whole category, as the manual step does; the quality is that of a guided observation
    expect(draft().findings["T_BODY_PALE_SWOLLEN"]).toEqual({ state: "present", source: "guided" });
    expect(draft().findings["T_BODY_RED"]).toEqual({ state: "absent", source: "guided" });
    expect(draft().findings["T_TOOTHMARK_EDGE"]).toBeUndefined();                     // rejected
    expect(draft().findings["T_COAT_WHITE_GREASY"]).toEqual({ state: "present", source: "guided" });
    expect(draft().findings["T_COAT_THIN_WHITE"]).toEqual({ state: "absent", source: "guided" });
    const recorded = within(screen.getByRole("region", { name: "Recorded" }));
    expect(recorded.getAllByTestId("photo-confirmed").map((x) => x.textContent)).toEqual(["pale, swollen tongueRemove", "white greasy coatingRemove"]);

    // taking one back
    await userEvent.click(recorded.getAllByRole("button", { name: "Remove" })[1]!);
    expect(draft().findings["T_COAT_WHITE_GREASY"]).toBeUndefined();
    expect(draft().findings["T_COAT_THIN_WHITE"]).toBeUndefined();
    expect(draft().findings["T_BODY_PALE_SWOLLEN"]).toBeDefined();

    // done: back on the observation stage, the picture emptied
    expect(releasePhoto).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(window.location.pathname).toBe("/en/observe"));
    expect(releasePhoto).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("a picture the gate refuses is not kept and not sent, and says why in plain words; so is a file that is not a picture", async () => {
    const g = gateway();
    await open("/observe/photo/tongue", screened());
    readPhoto.mockImplementationOnce(() => Promise.resolve({ ok: true, photo: picture({ ok: false, issues: ["dark", "blurry"], measures: GOOD_QUALITY.measures }) }));
    await choose();
    const refused = await screen.findByTestId("photo-refused");
    expect(within(refused).getByText("This photo will not do yet")).toBeInTheDocument();
    expect(within(refused).getByText(/It is too dark: turn towards a window or a lamp/)).toBeInTheDocument();
    expect(within(refused).getByText(/It is out of focus: hold the phone steady/)).toBeInTheDocument();
    expect(releasePhoto).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("photo-view")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send this photo" })).toBeNull();
    expect(screen.getByText(/Take it in daylight by a window/), "the guidance stays").toBeInTheDocument();
    for (const [error, text] of [["type", /not a photo this app can read/], ["huge", /too large \(over 30 MB\)/], ["unreadable", /could not be opened/]] as const) {
      readPhoto.mockImplementationOnce(() => Promise.resolve({ ok: false, error }));
      await choose();
      expect(await within(await screen.findByTestId("photo-refused")).findByText(text)).toBeInTheDocument();
    }
    expect(g.sent).toEqual([]);
  });

  it("choosing another picture replaces the first and empties it", async () => {
    gateway();
    await open("/observe/photo/tongue", screened());
    const first = picture();
    readPhoto.mockImplementationOnce(() => Promise.resolve({ ok: true, photo: first }));
    await choose();
    await screen.findByTestId("photo-view");
    const second = picture();
    readPhoto.mockImplementationOnce(() => Promise.resolve({ ok: true, photo: second }));
    await choose(jpeg("again.jpg"));
    await waitFor(() => expect(releasePhoto).toHaveBeenCalledWith(first));
    expect(releasePhoto).not.toHaveBeenCalledWith(second);
    expect(screen.getAllByTestId("photo-view")).toHaveLength(1);
  });

  it("leaving the screen empties the picture", async () => {
    gateway();
    const { unmount } = await open("/observe/photo/tongue", screened());
    const photo = picture();
    readPhoto.mockImplementationOnce(() => Promise.resolve({ ok: true, photo }));
    await choose();
    await screen.findByTestId("photo-view");
    unmount();
    expect(releasePhoto).toHaveBeenCalledWith(photo);
  });

  it("a photo the assistant cannot read: said plainly, nothing proposed, the picture emptied", async () => {
    gateway({ ...mockProvider, observe: () => Promise.resolve({ readable: false, suggestions: [{ id: "T_BODY_PALE", confidence: 0.9 }] }) });
    const { draft } = await open("/observe/photo/tongue", screened());
    await choose();
    await send();
    expect(await screen.findByTestId("photo-unreadable")).toHaveTextContent("The assistant could not read this photo");
    expect(screen.queryByTestId("photo-suggestion")).toBeNull();
    expect(releasePhoto).toHaveBeenCalled();
    expect(draft().findings["T_BODY_PALE"]).toBeUndefined();
  });

  it("a reply that says more than it may is checked again on the device: an invented feature, a contradiction, a diagnosis never reach the screen", async () => {
    gateway({ ...mockProvider, observe: () => Promise.resolve({ readable: true, diagnosis: "脾氣虛", suggestions: [{ id: "T_BODY_PALE", confidence: 0.9 }, { id: "T_BODY_RED", confidence: 0.8 }, { id: "T_SPLEEN_QI", confidence: 0.9 }] }) });
    await open("/observe/photo/tongue", screened());
    await choose();
    await send();
    const items = await screen.findAllByTestId("photo-suggestion");
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["pale tongue"]);
    expect(document.body.textContent).not.toContain("脾氣虛");
  });

  it("a reply with nothing in the list says so", async () => {
    gateway({ ...mockProvider, observe: () => Promise.resolve({ readable: true, suggestions: [] }) });
    await open("/observe/photo/tongue", screened());
    await choose();
    await send();
    expect(await screen.findByTestId("photo-none")).toHaveTextContent("Nothing from the app's list stood out clearly in this photo.");
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("the service off, over its limit or failing is said plainly; the picture stays to try again, and nothing is recorded", async () => {
    for (const [env, provider, text] of [
      [{ AI_MODULES: "conversation" }, mockProvider, /Photo help is switched off for now/],
      [{ AI_PHOTOS_PER_SESSION: "1", AI_PHOTOS_PER_MINUTE: "1" }, mockProvider, null],
      [{}, { ...mockProvider, observe: () => Promise.reject(new TypeError("upstream")) }, /The service did not answer, or is not available/],
    ] as const) {
      const g = gateway(provider, env);
      const { draft, unmount } = await open("/observe/photo/tongue", screened());
      await choose();
      await send();
      if (text !== null) {
        expect(await screen.findByText(text)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send this photo" }), "the picture stays: it can be sent again").toBeEnabled();
        expect(screen.getByTestId("photo-view")).toBeInTheDocument();
      } else {
        await screen.findAllByTestId("photo-suggestion");
        await userEvent.click(screen.getByRole("button", { name: "Another photo" }));
        await choose();
        await send();
        expect(await screen.findByText(/You have sent the most photos one session allows|That was quick/)).toBeInTheDocument();
      }
      expect(Object.keys(draft().findings).filter((id) => id.startsWith("T_"))).toEqual([]);
      expect(g.photos().length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("a picture that cannot be prepared for sending is said plainly, and nothing is sent", async () => {
    const g = gateway();
    await open("/observe/photo/tongue", screened());
    encodeJpeg.mockImplementationOnce(() => Promise.resolve(null));
    await choose();
    await send();
    expect(await screen.findByText(/could not be prepared for sending/)).toBeInTheDocument();
    expect(g.sent).toEqual([]);
  });

  it("a second photo reuses the session; features already recorded by hand are replaced, not duplicated", async () => {
    const g = gateway();
    const d = screened();
    const { draft } = await open("/observe/photo/tongue", { ...d, findings: { T_BODY_RED: { state: "present", source: "guided" }, T_BODY_PALE: { state: "absent", source: "guided" } } });
    await choose();
    await send();
    await userEvent.click(within((await screen.findAllByTestId("photo-suggestion"))[0]!).getByRole("button", { name: "Yes, I see this" }));
    expect(draft().findings["T_BODY_PALE_SWOLLEN"]).toEqual({ state: "present", source: "guided" });
    expect(draft().findings["T_BODY_RED"]).toEqual({ state: "absent", source: "guided" });
    await userEvent.click(screen.getAllByRole("button", { name: "No" })[0]!);
    await userEvent.click(screen.getAllByRole("button", { name: "No" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Another photo" }));
    await choose();
    await send();
    await screen.findAllByTestId("photo-suggestion");
    expect(g.sent.map((s) => new URL(s.url).pathname)).toEqual(["/v1/session", "/v1/observe/tongue", "/v1/observe/tongue"]);
  });
});

describe("a photo of the face", () => {
  it("the face's own features; a confirmed one is a guided finding and the colours that cannot go with it are no longer present", async () => {
    const g = gateway();
    const { draft } = await open("/observe/photo/face", { ...screened(), findings: { S_FACE_PALE: { state: "present" } } });
    expect(await screen.findByRole("heading", { level: 1, name: "Face photo (AI help)" })).toBeInTheDocument();
    expect(screen.getByText(/Face the camera, relaxed, eyes open/)).toBeInTheDocument();
    await choose(jpeg("face.jpg"));
    expect(readPhoto.mock.calls[0]![1]).toBe("face");
    await send();
    const items = await screen.findAllByTestId("photo-suggestion");
    const [request] = g.photos();
    expect(g.sent.at(-1)!.url).toBe(`${AI_ENDPOINT}/v1/observe/face`);
    expect(request!.vocabulary.map((v) => [v.id, v.group])).toEqual([
      ["S_FACE_SALLOW", "complexion"], ["S_FACE_PALE", "complexion"], ["S_FACE_RED", "complexion"], ["S_FACE_DARK", "complexion"], ["S_LIPS_NAILS_PALE", "lips"], ["S_LIPS_PURPLE", "lips"],
    ]);
    expect(request!.exclusive).toEqual([["S_FACE_SALLOW", "S_FACE_PALE", "S_FACE_RED", "S_FACE_DARK"], ["S_LIPS_NAILS_PALE", "S_LIPS_PURPLE"]]);
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["sallow complexion"]);
    await userEvent.click(within(items[0]!).getByRole("button", { name: "Yes, I see this" }));
    expect(draft().findings["S_FACE_SALLOW"]).toEqual({ state: "present", source: "guided" });
    expect(draft().findings["S_FACE_PALE"]).toEqual({ state: "absent", source: "guided" });
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(draft().findings["S_FACE_SALLOW"]).toBeUndefined();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(window.location.pathname).toBe("/en/observe"));
  });
});

describe("in Chinese", () => {
  it("Traditional: the features go in Traditional, the words are the app's; Simplified: the features go in Simplified", async () => {
    const g = gateway();
    await open("/observe/photo/tongue", screened(), "zh-Hant");
    await choose();
    await send("zh-Hant");
    const items = await screen.findAllByTestId("photo-suggestion");
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["舌淡胖", "舌邊齒痕", "白膩苔"]);
    expect(g.photos()[0]!.lang).toBe("zh-Hant");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("舌頭照片（AI 協助）");
  });

  it("Simplified", async () => {
    const g = gateway();
    await open("/observe/photo/tongue", screened(), "zh-Hans");
    await choose();
    await send("zh-Hans");
    const items = await screen.findAllByTestId("photo-suggestion");
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["舌淡胖", "舌边齿痕", "白腻苔"]);
    expect(g.photos()[0]!.lang).toBe("zh-Hans");
    expect(g.photos()[0]!.vocabulary.find((v) => v.id === "T_COAT_THICK_ROT")!.label).toBe("厚腐苔");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("舌头照片（AI 协助）");
  });
});
