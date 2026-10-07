// The conversation of AI help (PM-47; docs/post-mvp/design/ai-assisted-intake.md §1, §4). The gateway runs in the test, with the mock provider or a rogue one: what a turn sends,
// that only confirmed findings reach the draft, the red flags checked on the device before anything is sent, the model's flag, the profile notice, the errors, Simplified.
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom } from "../../ai-gateway/src/config.ts";
import { createGateway } from "../../ai-gateway/src/gateway.ts";
import { mockProvider, type Provider } from "../../ai-gateway/src/provider.ts";
import type { TurnRequest } from "@tcm/ai";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import { AI_ENDPOINT } from "../src/ai/build.ts";
import { AI_STATEMENT_VERSION } from "../src/ai/consent.ts";
import { useConversation } from "../src/ai/conversation.ts";
import { buildTurnRequest, confirmedIds, vocabularyOf } from "../src/ai/request.ts";
import { askedItems, pendingNotices, withAcknowledged, withAnswer } from "../src/screens/screening/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { kb, loaded, loadedHans } from "./sweep.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
const MARK = "MARKER-5b1e";
type Lang = "en" | "zh-Hant" | "zh-Hans";

afterEach(() => { vi.unstubAllGlobals(); useConversation.getState().reset(null); go("/"); });

const screened = (over: Partial<Draft> = {}, subject: Draft["subject"] = { ageYears: 40, sex: "male" }): Draft => {
  let d: Draft = { ...newDraft("d", 1), subject, profile: { medications: "some", medicationText: [`${MARK}-med`], allergies: "none", conditions: "none" },
    birth: { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Taipei", longitude: 121.5 }, ...over };
  for (const f of [...askedItems(kb).A, ...askedItems(kb).B]) d = withAnswer(d, f.id, "no");
  return withAcknowledged(d, pendingNotices(kb, d), 1);            // a minor's notice, acknowledged: the flow goes on
};

/** The gateway in the test; every request the app sends is kept. */
function gateway(env: Record<string, string> = {}, provider: Provider = mockProvider) {
  const handler = createGateway({ config: configFrom({ AI_SECRET: "s".repeat(40), AI_ALLOWED_ORIGINS: "http://localhost:5173", ...env }), provider, now: () => Date.now(), log: () => undefined });
  const sent: { url: string; body: unknown }[] = [];
  const fetchStub = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    sent.push({ url: String(url), body: typeof init.body === "string" ? JSON.parse(init.body) : null });
    return handler(new Request(String(url), { ...init, headers: { ...(init.headers as Record<string, string> | undefined), origin: "http://localhost:5173" } }));
  });
  vi.stubGlobal("fetch", fetchStub);
  return { sent, turns: () => sent.filter((s) => s.url.endsWith("/v1/intake/turn")).map((s) => s.body as TurnRequest) };
}

async function open(path: string, draft: Draft, lang: Lang = "zh-Hant", consent = true) {
  const env = fakeEnvironment();
  go(`/${lang}${path}`);
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang, ...(consent ? { ai: { conversation: { at: 1, version: AI_STATEMENT_VERSION } } } : {}) }));
  const { store } = testStore(env);
  store.getState().startDraft();
  store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/inquiry" } }));
  const view = renderApp(store, (script) => Promise.resolve(script === "Hans" ? loadedHans : loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, store, draft: () => store.getState().draft! };
}
const say = async (words: string): Promise<void> => {
  await userEvent.type(await screen.findByRole("textbox"), words);
  await userEvent.click(screen.getByRole("button", { name: /^(傳送|发送|Send)$/ }));
};

describe("the way in", () => {
  it("for an adult who agreed, a card that starts the conversation; for one who has not, a line pointing to Settings; for a minor, nothing", async () => {
    const a = await open("/inquiry", screened(), "en");
    const card = within(await screen.findByRole("region", { name: "Describe it in your own words (AI help)" }));
    expect(card.getByRole("link", { name: "Start the conversation" })).toHaveAttribute("href", "/en/talk");
    a.unmount();
    const b = await open("/inquiry", screened(), "en", false);
    expect(await screen.findByText(/Would you rather describe it in your own words/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/en/settings#settings-ai");
    b.unmount();
    await open("/inquiry", screened({}, { ageYears: 16, sex: "male" }), "en");
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Describe it in your own words (AI help)" })).toBeNull();
    expect(screen.queryByText(/Would you rather describe it in your own words/)).toBeNull();
  });

  it("the conversation needs the consent, and an adult", async () => {
    gateway();
    const a = await open("/talk", screened(), "en", false);
    await vi.waitFor(() => expect(window.location.pathname).toBe("/en/settings"));
    a.unmount();
    await open("/talk", screened({}, { ageYears: 16, sex: "male" }), "en");
    await vi.waitFor(() => expect(window.location.pathname).toBe("/en/inquiry"));
  });
});

describe("a conversation", () => {
  it("sends the conversation, the vocabulary and the confirmed ids — nothing of the profile or the birth; proposes with the person's words; only what is confirmed reaches the draft", async () => {
    const g = gateway();
    const { draft } = await open("/talk", screened({ findings: { S_FEVER: { state: "absent" } } }));
    expect(await screen.findByText("說說最近哪裡不舒服？從什麼時候開始的？")).toBeInTheDocument();
    expect(g.sent).toEqual([]);
    await say("最近頭很痛，有點怕風，手腳常常冰冷");
    const proposals = await screen.findByRole("region", { name: "我理解到的" });
    const items = within(proposals).getAllByTestId("ai-proposal");
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["頭痛", "惡風", "手足冰冷"]);
    expect(within(items[0]!).getByText("您寫的：「最近頭很痛」")).toBeInTheDocument();

    const [turn] = g.turns();
    expect(Object.keys(turn!).sort()).toEqual(["confirmed", "lang", "messages", "v", "vocabulary"]);
    expect(turn!.messages).toEqual([{ role: "assistant", text: "說說最近哪裡不舒服？從什麼時候開始的？" }, { role: "person", text: "最近頭很痛，有點怕風，手腳常常冰冷" }]);
    expect(turn!.confirmed).toEqual(["S_FEVER"]);
    expect(turn!.vocabulary.length).toBe(124);
    const all = JSON.stringify(g.sent);
    for (const m of [MARK, "1990", "Asia/Taipei", "121.5", '"male"', "ageYears"]) expect(all).not.toContain(m);
    expect(g.sent.map((s) => new URL(s.url).pathname)).toEqual(["/v1/session", "/v1/intake/turn"]);
    expect(g.sent.every((s) => s.url.startsWith(AI_ENDPOINT!))).toBe(true);

    // nothing counts before it is confirmed
    expect(draft().findings["S_HEADACHE"]).toBeUndefined();
    await userEvent.click(within(items[0]!).getByRole("button", { name: "對，是這樣" }));
    await userEvent.click(within(screen.getAllByTestId("ai-proposal")[0]!).getByRole("button", { name: "不對" }));
    expect(draft().findings["S_HEADACHE"]).toEqual({ state: "present", severity: "severe" });
    expect(draft().findings["S_AVERSION_WIND"]).toBeUndefined();
    expect(draft().findings["S_COLD_LIMBS"]).toBeUndefined();
    // the next question, about what has not been covered
    expect(screen.getByText("流汗的情況怎麼樣？例如沒怎麼動就出汗，或睡著時出汗？")).toBeInTheDocument();
    // a confirmed finding can be removed again
    const confirmed = within(screen.getByRole("region", { name: "已確認" }));
    await userEvent.click(confirmed.getByRole("button", { name: "移除" }));
    expect(draft().findings["S_HEADACHE"]).toBeUndefined();
    await userEvent.click(screen.getByRole("link", { name: "繼續回答問題" }));
    await vi.waitFor(() => expect(window.location.pathname).toBe("/zh-Hant/inquiry"));
  });

  it("the next turn carries what was confirmed, and the question the assistant asked with its topic", async () => {
    const g = gateway();
    await open("/talk", screened());
    await say("頭很痛");
    await userEvent.click(within((await screen.findAllByTestId("ai-proposal"))[0]!).getByRole("button", { name: "對，是這樣" }));
    await say("睡著後出汗");
    const second = g.turns()[1]!;
    expect(second.confirmed).toEqual(["S_HEADACHE"]);
    expect(second.messages.at(-2)).toEqual({ role: "assistant", text: expect.any(String), topic: "cold-heat" });
    expect(second.messages.at(-1)).toEqual({ role: "person", text: "睡著後出汗" });
  });
});

describe("red flags", () => {
  it("in the person's words: nothing is sent; the screening asks that item again and says why; the words wait", async () => {
    const g = gateway();
    const { draft } = await open("/talk", screened());
    await say("我胸口很痛，還冒冷汗");
    await vi.waitFor(() => expect(window.location.pathname).toBe("/zh-Hant/screen"));
    expect(window.location.search).toBe("?reopened=talk");
    expect(g.sent).toEqual([]);
    expect(draft().screening.answers["RF_A_CHEST_PAIN"]).toBeUndefined();
    expect(draft().screening.answers["RF_A_DYSPNEA"]).toBe("no");
    expect(await screen.findByTestId("ai-reopened")).toHaveTextContent("請再回答一次這些問題");
    expect(useConversation.getState().unsent).toBe("我胸口很痛，還冒冷汗");
  });

  it("the model may raise a flag, never lower one: every item answered no is asked again", async () => {
    gateway({}, { name: "flag", turn: () => Promise.resolve({ proposals: [], question: null, redFlag: true }) });
    const { draft } = await open("/talk", screened());
    await say("最近頭有點痛");
    await vi.waitFor(() => expect(window.location.pathname).toBe("/zh-Hant/screen"));
    expect(Object.keys(draft().screening.answers)).toEqual([]);
  });

  it("a level-C statement is sent, and asks the person to check the profile", async () => {
    const g = gateway();
    await open("/talk", screened({}, { ageYears: 30, sex: "female", pregnancy: "no", lactating: false }));
    await say("我懷孕了，最近頭痛");
    expect(await screen.findByText("請檢查您的基本資料", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "檢查基本資料" })).toHaveAttribute("href", "/zh-Hant/start");
    expect(g.turns()).toHaveLength(1);
  });
});

describe("what comes back", () => {
  it("is checked again on the device: a question that names a herb, words the person did not say, a topic that does not apply are not shown", async () => {
    gateway({}, { name: "rogue", turn: () => Promise.resolve({
      proposals: [{ id: "S_HEADACHE", confidence: 0.9, evidence: "頭痛" }, { id: "S_NAUSEA", confidence: 0.9, evidence: "想吐" }, { id: "S_DYSMENORRHEA", confidence: 0.9, evidence: "頭痛" }],
      question: { text: "要不要喝點桂枝湯？" },
    }) });
    await open("/talk", screened());
    await say("頭痛");
    const items = await screen.findAllByTestId("ai-proposal");
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["頭痛"]);       // 想吐 was not said; 痛經 does not apply to a man
    expect(screen.queryByText(/桂枝湯/)).toBeNull();
  });

  it("the service switched off, and the end of the conversation's budget, are said in words", async () => {
    gateway({ AI_KILL: "1" });
    const a = await open("/talk", screened());
    await say("頭痛");
    expect(await screen.findByText("AI 協助目前已關閉；問答照常可用。")).toBeInTheDocument();
    a.unmount();
    useConversation.getState().reset(null);
    gateway({ AI_TURNS_PER_SESSION: "1" });
    await open("/talk", screened());
    await say("頭痛");
    await screen.findAllByTestId("ai-proposal");
    await say("怕冷");
    expect(await screen.findByText("這次對話已達上限；請繼續回答問題。")).toBeInTheDocument();
  });
});

describe("Simplified", () => {
  it("the vocabulary, the proposals and the mock's question are in Simplified", async () => {
    const g = gateway();
    await open("/talk", screened(), "zh-Hans");
    expect(await screen.findByText("说说最近哪里不舒服？从什么时候开始的？")).toBeInTheDocument();
    await say("最近头很痛，有点怕风");
    const items = await screen.findAllByTestId("ai-proposal");
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(["头痛", "恶风"]);
    expect(g.turns()[0]!.vocabulary.find((v) => v.id === "S_AVERSION_COLD")!.label).toBe("恶寒（加衣被仍冷）");
    expect(screen.getByText("流汗的情况怎么样？例如没怎么动就出汗，或睡着时出汗？")).toBeInTheDocument();
  });
});

describe("the request as data", () => {
  it("vocabularyOf: the inquiry symptoms only — no tongue, no pulse — labelled in the language, with the questions' plain words", () => {
    const en = vocabularyOf(kb, "en");
    expect(en.length).toBe(124);
    expect(en.every((v) => v.id.startsWith("S_"))).toBe(true);
    expect(en.find((v) => v.id === "S_COLD_LIMBS")).toEqual({ id: "S_COLD_LIMBS", label: kb.symptoms.get("S_COLD_LIMBS")!.en, topic: "cold-heat", plain: ["My hands and feet are often icy cold"] });
  });

  it("confirmedIds: answered findings of the vocabulary — present or absent, not unsure — and buildTurnRequest copies only what it is given", () => {
    const vocabulary = vocabularyOf(kb, "en");
    const ids = confirmedIds({ S_HEADACHE: { state: "present" }, S_FEVER: { state: "absent" }, S_NAUSEA: { state: "unsure" }, T_BODY_PALE: { state: "present" } }, vocabulary);
    expect(ids.sort()).toEqual(["S_FEVER", "S_HEADACHE"]);
    const r = buildTurnRequest({ lang: "en", messages: [{ role: "person", text: "x", extra: MARK } as never], vocabulary, confirmed: ids });
    expect(JSON.stringify(r)).not.toContain(MARK);
  });
});
