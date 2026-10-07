// The learning book on screen (PM-43): the hub's card, the contents and a chapter — in Traditional Chinese whatever the interface, with a line saying so in English — the way from chapter to
// chapter, every quotation a link to its page, the Simplified pages that hold no Traditional text and send the reader to the book, a fetch that fails and is tried again, a public build that
// has none, and the accessibility of each page.
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { alignedList, chineseStrings, indexKnowledgeBase, memoryBook, newDisplay, type BookSource, type RawKbChunks } from "@tcm/kb";
import { buildFromDisk, rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import type { Loaded } from "../src/app/knowledge.tsx";
import { dictionary, traditionalOnScreen } from "./hans.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const dev = buildFromDisk("dev");
const book = dev.bookFile!;
/** A knowledge base whose book comes from `source`; with `hans`, showing Simplified through the real display machinery. */
function withBook(source: BookSource | null, hans = false): Loaded {
  const raw = { ...dev.chunks, book: source } as RawKbChunks;
  if (!hans) return { kb: indexKnowledgeBase(raw), engine };
  const list = chineseStrings(raw.core, raw.formulas, raw.citations, raw.guidance, raw.herbs);
  const display = newDisplay();
  display.add(list, alignedList(list, dictionary));
  return { kb: indexKnowledgeBase(raw, display), engine };
}
const publicLoaded: Loaded = { kb: indexKnowledgeBase(rawChunksFromDisk("release", undefined, false)), engine };

/** A source that counts how often the file is asked for, and can be made to fail. */
function counting(): { source: BookSource; calls: { n: number }; failing: { on: boolean } } {
  const calls = { n: 0 };
  const failing = { on: false };
  const mem = memoryBook(book);
  return { calls, failing, source: { chapters: mem.chapters, load: () => { calls.n++; return failing.on ? Promise.reject(new Error("offline")) : mem.load(); } } };
}

async function open(path: string, which: Loaded = withBook(memoryBook(book))) {
  go(path);
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: "x", at: 1 } }));
  const t = testStore(env);
  const view = renderApp(t.store, () => Promise.resolve(which));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { ...view, user: userEvent.setup() };
}
const axeClean = async (root: Element): Promise<void> => { expect((await axe(root, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]); };
const article = (): HTMLElement => document.querySelector("article")!;

describe("the hub", () => {
  it("lists the book first, with its number of chapters from the manifest, in every language", async () => {
    const net = counting();
    await open("/en/learn", withBook(net.source));
    const first = within(screen.getByRole("region", { name: "Browse by kind" })).getAllByRole("link")[0]!;
    expect(first).toHaveAttribute("href", "/en/learn/book");
    expect(first).toHaveTextContent("Learning book: TCM through a model");
    expect(first).toHaveTextContent("In Traditional Chinese");
    expect(first).toHaveTextContent("12 chapters");
    expect(net.calls.n, "the card needs no fetch").toBe(0);
    go("/");
    document.body.innerHTML = "";
    await open("/zh-Hant/learn");
    expect(within(screen.getByRole("region", { name: "依類別瀏覽" })).getAllByRole("link")[0]).toHaveTextContent("學習手冊：以模型讀中醫");
  });
  it("has none in a public build, and the address is the section's own not-found page", async () => {
    await open("/en/learn", publicLoaded);
    expect(screen.queryByRole("link", { name: /Learning book/ })).toBeNull();
    go("/");
    document.body.innerHTML = "";
    await open("/en/learn/book", publicLoaded);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page is not in the Learn section");
  });
});

describe("the book in Traditional Chinese", () => {
  it("the contents: the title, the draft notice, the three conventions and a link to each chapter, in order", async () => {
    await open("/zh-Hant/learn/book");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("以模型讀中醫——這個 App 怎麼想");
    expect(screen.getByText("本手冊尚未經語文與中醫臨床審閱；它所描述的模型，規則與數據也都是草稿。")).toBeInTheDocument();
    expect(within(article()).getAllByRole("listitem").slice(0, 3).map((li) => li.querySelector("strong")?.textContent)).toEqual(["引文都經過核對。", "只講道理，不談用藥。", "模型不是醫師。"]);
    const links = within(screen.getByRole("region", { name: "以模型讀中醫——這個 App 怎麼想" })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(book.chapters.map((c) => `/zh-Hant/learn/book/${c.id}`));
    expect(links[0]).toHaveTextContent("一、以模型讀中醫");
    expect(article().querySelector("a[href$='.md']"), "no link to a file of the repository").toBeNull();
    expect(document.title).toBe("以模型讀中醫——這個 App 怎麼想 · 中醫自我評估");
  });
  it("a chapter: its sections, its tables, its quotations with a link to each one's page, and the way to the next and the previous chapter", async () => {
    const net = counting();
    const { user } = await open("/zh-Hant/learn/book/yinyang", withBook(net.source));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("二、陰陽：一把尺");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["三把尺", "先看地圖，再定八綱"]);
    const table = within(screen.getByRole("region", { name: "三把尺" })).getByRole("table");
    expect(within(table).getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["寒熱", "虛實", "表"]);
    const figures = article().querySelectorAll("figure");
    expect(figures.length).toBe(4);
    expect(figures[0]!.querySelector("blockquote")).toHaveTextContent("「病有總要，寒、熱、虛、實、表、裡、陰、陽，八字而已。」");
    const source = within(figures[0] as HTMLElement).getByRole("link");
    expect(source).toHaveTextContent("《醫學心悟·寒熱虛實表裡陰陽辨》");
    expect(source.getAttribute("href")).toMatch(/^\/zh-Hant\/learn\/quotations\/[a-z0-9-]+$/);
    const nav = screen.getByRole("navigation", { name: "章節" });
    expect(within(nav).getByRole("link", { name: /上一章/ })).toHaveAttribute("href", "/zh-Hant/learn/book/model");
    expect(within(nav).getByRole("link", { name: "回到手冊目錄" })).toHaveAttribute("href", "/zh-Hant/learn/book");
    await user.click(within(nav).getByRole("link", { name: /下一章/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "三、五行：五個抽屜與生剋" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/zh-Hant/learn/book/wuxing");
    expect(net.calls.n, "the file is asked for once").toBe(1);
  });
  it("the first chapter has no previous one and the last no next one; the fenced formula is shown as written", async () => {
    await open("/zh-Hant/learn/book/model");
    expect(within(screen.getByRole("navigation", { name: "章節" })).queryByRole("link", { name: /上一章/ })).toBeNull();
    go("/");
    document.body.innerHTML = "";
    await open("/zh-Hant/learn/book/safety");
    expect(within(screen.getByRole("navigation", { name: "章節" })).queryByRole("link", { name: /下一章/ })).toBeNull();
    go("/");
    document.body.innerHTML = "";
    await open("/zh-Hant/learn/book/patterns");
    expect(article().querySelector("pre")?.textContent).toMatch(/^得分 = Σ（支持的症狀 × 權重 × 輕重 × 可信度）/);
  });
  it("a chapter the book does not have is the section's own not-found page", async () => {
    await open("/zh-Hant/learn/book/no-such-chapter");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("學習內容中沒有這一頁");
  });
  it("says so, with a way to try again, when the file cannot be fetched — and shows the book once it can", async () => {
    const net = counting();
    net.failing.on = true;
    go("/zh-Hant/learn/book");
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: "x", at: 1 } }));
    renderApp(testStore(env).store, () => Promise.resolve(withBook(net.source)));
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("無法載入手冊。請檢查網路連線後再試一次。");
    net.failing.on = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "再試一次" }));
    expect(await screen.findByRole("heading", { level: 1, name: "以模型讀中醫——這個 App 怎麼想" })).toBeInTheDocument();
    expect(net.calls.n).toBe(2);
  });
});

describe("the book in an English interface", () => {
  it("is the same book in Traditional Chinese, marked as such, with a line saying so; the page around it is English", async () => {
    await open("/en/learn/book/yinyang");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("二、陰陽：一把尺");
    expect(h1).toHaveAttribute("lang", "zh-Hant");
    expect(screen.getByText("This book is in Traditional Chinese only.")).toBeInTheDocument();
    expect(article().querySelector("div[lang='zh-Hant'] h2")).toHaveTextContent("三把尺");
    expect(screen.getAllByRole("link", { name: "Back to the book's contents" }).map((a) => a.getAttribute("href"))).toEqual(["/en/learn/book", "/en/learn/book"]);
    expect(within(screen.getByRole("navigation", { name: "Chapters" })).getByRole("link", { name: /Next chapter/ })).toHaveAttribute("href", "/en/learn/book/wuxing");
    expect(article().querySelector("figure a")?.getAttribute("href")).toMatch(/^\/en\/learn\/quotations\//);
  });
});

describe("the book in a Simplified interface", () => {
  it("shows no Traditional text: it says where the book is and links to the same page in Traditional Chinese, without fetching the file", async () => {
    const net = counting();
    const which = withBook(net.source, true);
    const { user } = await open("/zh-Hans/learn/book/yinyang", which);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("学习手册：以模型读中医");
    expect(screen.getByText("本手册只有繁体中文版。")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "改用繁体中文阅读" });
    expect(link).toHaveAttribute("href", "/zh-Hant/learn/book/yinyang");
    expect(traditionalOnScreen()).toEqual([]);
    expect(net.calls.n).toBe(0);
    await user.click(link);
    expect(await screen.findByRole("heading", { level: 1, name: "二、陰陽：一把尺" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/zh-Hant/learn/book/yinyang");
  });
  it("the contents page and the hub's card hold no Traditional text either, and a chapter the book does not have is not found", async () => {
    await open("/zh-Hans/learn/book", withBook(memoryBook(book), true));
    expect(screen.getByRole("link", { name: "改用繁体中文阅读" })).toHaveAttribute("href", "/zh-Hant/learn/book");
    expect(traditionalOnScreen()).toEqual([]);
    go("/");
    document.body.innerHTML = "";
    await open("/zh-Hans/learn", withBook(memoryBook(book), true));
    expect(screen.getByRole("link", { name: /学习手册/ })).toHaveTextContent("12 章");
    expect(traditionalOnScreen()).toEqual([]);
    go("/");
    document.body.innerHTML = "";
    await open("/zh-Hans/learn/book/no-such-chapter", withBook(memoryBook(book), true));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("学习内容中没有这一页");
  });
});

describe("accessibility", () => {
  it("the contents, a chapter in English and the Simplified page pass axe; no page addresses the reader", async () => {
    for (const [path, hans] of [["/zh-Hant/learn/book", false], ["/en/learn/book/sanyin", false], ["/zh-Hans/learn/book/sanyin", true]] as const) {
      const { container } = await open(path, withBook(memoryBook(book), hans));
      await axeClean(container);
      expect(container.textContent ?? "", path).not.toMatch(/[你妳您]|\byou\b/i);
      go("/");
      document.body.innerHTML = "";
    }
  });
});
