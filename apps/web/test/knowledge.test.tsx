import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase, KbError } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/app/ErrorBoundary.tsx";
import { KnowledgeProvider, NeedsKnowledge, useLoaded, type Loaded, type Loader } from "../src/app/knowledge.tsx";
import { StoreProvider } from "../src/app/store.tsx";
import { Term } from "../src/app/Term.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("release"));
const loaded: Loaded = { kb, engine };

function Shell({ children, load, lang = "en", store = testStore().store }: { children: ReactNode; load: Loader; lang?: "en" | "zh-Hant"; store?: ReturnType<typeof testStore>["store"] }): ReactNode {
  return <StoreProvider store={store}><I18nProvider lang={lang} setLang={() => undefined}><KnowledgeProvider load={load}>{children}</KnowledgeProvider></I18nProvider></StoreProvider>;
}
const Result = (): ReactNode => { const { kb: k } = useLoaded(); return <p>result for {k.profile}</p>; };
const deferred = <T,>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } => {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

describe("NeedsKnowledge", () => {
  it("shows a loading skeleton, then the screen once the knowledge base and engine are ready", async () => {
    const d = deferred<Loaded>();
    render(<Shell load={() => d.promise}><NeedsKnowledge><Result /></NeedsKnowledge></Shell>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText(/result for/)).toBeNull();
    await act(async () => { d.resolve(loaded); await d.promise; });
    expect(await screen.findByText("result for release")).toBeInTheDocument();
  });

  it("a load failure is an error state with a retry; the draft is intact and nothing medical is shown (E15)", async () => {
    const { store } = testStore();
    store.getState().startDraft();
    store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 52 }, redFlags: ["RF3"] }));
    const load = vi.fn<Loader>().mockRejectedValueOnce(new KbError("chunk-missing", "core: HTTP 503")).mockResolvedValue(loaded);
    render(<Shell load={load} store={store}><NeedsKnowledge><Result /></NeedsKnowledge></Shell>);

    expect(await screen.findByText("We couldn't load the knowledge base")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Caution");
    expect(screen.queryByText(/result for/)).toBeNull();
    expect(store.getState().draft?.subject.ageYears).toBe(52);
    expect(store.getState().draft?.redFlags).toEqual(["RF3"]);
    expect(screen.getByText("chunk-missing")).toBeInTheDocument();                // developer code: dev profile only

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("result for release")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getState().draft?.subject.ageYears).toBe(52);
  });

  it("says so when the device is offline, and retries by itself when it comes back online", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const load = vi.fn<Loader>().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(loaded);
    render(<Shell load={load}><NeedsKnowledge><Result /></NeedsKnowledge></Shell>);
    expect(await screen.findByText(/You appear to be offline\./)).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(await screen.findByText("result for release")).toBeInTheDocument();
  });

  it("a rejection that is not a KbError is still a handled failure", async () => {
    render(<Shell load={() => Promise.reject(new Error("boom"))}><NeedsKnowledge><Result /></NeedsKnowledge></Shell>);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("is in the page language", async () => {
    render(<Shell lang="zh-Hant" load={() => Promise.reject(new Error("x"))}><NeedsKnowledge><Result /></NeedsKnowledge></Shell>);
    expect(await screen.findByText("無法載入知識庫")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  const Bomb = ({ fuse }: { fuse: boolean }): ReactNode => { if (fuse) throw new Error("engine exploded"); return <p>fine</p>; };

  it("replaces a crashed screen by the safe fallback: no output, emergency guidance, copy inputs, start over", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = testStore();
    store.getState().startDraft();
    store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 61 } }));
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Shell load={() => new Promise(() => undefined)} store={store}><ErrorBoundary><Bomb fuse /></ErrorBoundary></Shell>);

    expect(screen.getAllByRole("alert")).toHaveLength(1);                         // the emergency guidance only: no nested duplicate alerts
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something went wrong");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    expect(screen.queryByText("fine")).toBeNull();
    expect(screen.getByText(/chest pain, trouble breathing/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy what I entered" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0]![0]).subject.ageYears).toBe(61);
    expect(await screen.findByText("Copied.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument();
  });

  it("reports a failed copy instead of pretending", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = testStore();
    store.getState().startDraft();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    render(<Shell load={() => new Promise(() => undefined)} store={store}><ErrorBoundary><Bomb fuse /></ErrorBoundary></Shell>);
    await userEvent.click(screen.getByRole("button", { name: "Copy what I entered" }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
  });

  it("recovers when the route changes (resetKey)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ui = (fuse: boolean, key: string): ReactNode => <Shell load={() => new Promise(() => undefined)}><ErrorBoundary resetKey={key}><Bomb fuse={fuse} /></ErrorBoundary></Shell>;
    const { rerender } = render(ui(true, "/a"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something went wrong");
    rerender(ui(false, "/b"));
    expect(screen.getByText("fine")).toBeInTheDocument();
  });
});

describe("Term", () => {
  const entry = kb.glossary[0]!;

  it("is plain text until the glossary is loaded, then opens 中文 · pinyin · English", async () => {
    const d = deferred<Loaded>();
    render(<Shell load={() => d.promise}><p><Term zh={entry["zh-Hant"]} /></p></Shell>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(entry["zh-Hant"])).toHaveAttribute("lang", "zh-Hant");
    await act(async () => { d.resolve(loaded); await d.promise; });
    const trigger = await screen.findByRole("button", { name: entry["zh-Hant"] });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(entry["zh-Hant"]);
    expect(note).toHaveTextContent(entry.pinyin);
    expect(note).toHaveTextContent(entry.en);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows the supplied rendering (the English page) and still explains the term", async () => {
    render(<Shell load={() => Promise.resolve(loaded)}><p><Term zh={entry["zh-Hant"]}>the English wording</Term></p></Shell>);
    const trigger = await screen.findByRole("button", { name: "the English wording" });
    await userEvent.click(trigger);
    expect(screen.getByRole("note")).toHaveTextContent(entry.pinyin);
  });

  it("an unknown term is plain text, never an error", async () => {
    render(<Shell load={() => Promise.resolve(loaded)}><p><Term zh="不存在的詞" /></p></Shell>);
    await waitFor(() => expect(screen.getByText("不存在的詞")).toBeInTheDocument());
    expect(screen.queryByRole("button")).toBeNull();
  });
});
