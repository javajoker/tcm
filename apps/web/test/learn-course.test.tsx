// The course on screen (PM-60): the hub's card, the contents and a page — in Traditional Chinese whatever the interface, with a line saying so in English — its sub-headings, its bullets
// inside an item and its quotations linked to their pages, the way from page to page, the index and each page fetched once, the link to the book, the Simplified pages that hold no
// Traditional text and send the reader to the course, a fetch that fails and is tried again, a public build that has none, and the accessibility of each page.
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { alignedList, chineseStrings, indexKnowledgeBase, memoryCourse, newDisplay, type CourseSource, type RawKbChunks } from "@tcm/kb";
import { buildFromDisk, rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import type { Loaded } from "../src/app/knowledge.tsx";
import { dictionary, traditionalOnScreen } from "./hans.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const dev = buildFromDisk("dev");
const course = dev.courseFiles!;
/** A knowledge base whose course comes from `source`; with `hans`, showing Simplified through the real display machinery. */
function withCourse(source: CourseSource | null, hans = false): Loaded {
  const raw = { ...dev.chunks, course: source } as RawKbChunks;
  if (!hans) return { kb: indexKnowledgeBase(raw), engine };
  const list = chineseStrings(raw.core, raw.formulas, raw.citations, raw.guidance, raw.herbs);
  const display = newDisplay();
  display.add(list, alignedList(list, dictionary));
  return { kb: indexKnowledgeBase(raw, display), engine };
}
const publicLoaded: Loaded = { kb: indexKnowledgeBase(rawChunksFromDisk("release", undefined, false)), engine };

/** A source that counts what is asked for, and can be made to fail. */
function counting(): { source: CourseSource; asked: string[]; failing: { on: boolean } } {
  const asked: string[] = [];
  const failing = { on: false };
  const mem = memoryCourse(course);
  const fail = (): Promise<never> => Promise.reject(new Error("offline"));
  return {
    asked, failing,
    source: { pages: mem.pages, index: () => { asked.push("index"); return failing.on ? fail() : mem.index(); }, page: (id) => { asked.push(id); return failing.on ? fail() : mem.page(id); } },
  };
}

async function open(path: string, which: Loaded = withCourse(memoryCourse(course))) {
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
const reset = (): void => { go("/"); document.body.innerHTML = ""; };

describe("the hub", () => {
  it("lists the course after the book, with its 22 chapters counted from the manifest, without a fetch", async () => {
    const net = counting();
    await open("/en/learn", withCourse(net.source));
    const links = within(screen.getByRole("region", { name: "Browse by kind" })).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/en/learn/book");
    expect(links[1]).toHaveAttribute("href", "/en/learn/course");
    expect(links[1]).toHaveTextContent("Course and textbook: a systematic course in Chinese medicine");
    expect(links[1]).toHaveTextContent("22 chapters");
    expect(net.asked, "the card needs no fetch").toEqual([]);
    reset();
    await open("/zh-Hant/learn");
    expect(within(screen.getByRole("region", { name: "依類別瀏覽" })).getAllByRole("link")[1]).toHaveTextContent("課程與教科書：中醫學系統課程");
  });
  it("has none in a public build, and the address is the section's own not-found page", async () => {
    await open("/en/learn", publicLoaded);
    expect(screen.queryByRole("link", { name: /Course and textbook/ })).toBeNull();
    reset();
    await open("/en/learn/course/yinyang", publicLoaded);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page is not in the Learn section");
  });
});

describe("the course in Traditional Chinese", () => {
  it("the contents: the title, the draft notice, a link to every chapter and to the two appendices, and the book it goes with", async () => {
    const net = counting();
    await open("/zh-Hant/learn/course", withCourse(net.source));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("中醫學系統課程——教科書");
    expect(screen.getByText("本課程尚未經語文與中醫臨床審閱；它只供學習，不是醫療建議。")).toBeInTheDocument();
    const hrefs = within(article()).getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const p of course.index.pages) expect(hrefs, p.id).toContain(`/zh-Hant/learn/course/${p.id}`);
    expect(hrefs).toContain("/zh-Hant/learn/book");
    expect(article().querySelector("a[href$='.md']"), "no link to a file of the repository").toBeNull();
    expect(net.asked).toEqual(["index"]);
  });
  it("a chapter: its sections and sub-sections, its bullets inside an item, its quotations with a link to each one's page, and the way on", async () => {
    const net = counting();
    const { user } = await open("/zh-Hant/learn/course/zangxiang", withCourse(net.source));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("第五章　藏象學說");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toContain("學習目標");
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(5);
    const nested = article().querySelector("li > ul > li");
    expect(nested?.textContent).toMatch(/^調暢情志/);
    const figure = article().querySelector("figure")!;
    const source = within(figure as HTMLElement).getByRole("link");
    expect(source.getAttribute("href")).toMatch(/^\/zh-Hant\/learn\/quotations\/[a-z0-9-]+$/);
    const nav = screen.getByRole("navigation", { name: "課程頁面" });
    expect(within(nav).getByRole("link", { name: /上一頁/ })).toHaveAttribute("href", "/zh-Hant/learn/course/wuxing");
    expect(within(nav).getByRole("link", { name: "回到課程目錄" })).toHaveAttribute("href", "/zh-Hant/learn/course");
    await user.click(within(nav).getByRole("link", { name: /下一頁/ }));
    expect(await screen.findByRole("heading", { level: 1, name: /^第六章.精氣血津液與營衛$/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/zh-Hant/learn/course/qi-blood-fluids");
    expect(net.asked.filter((x) => x === "index").length, "the index is asked for once").toBe(1);
    expect(net.asked.filter((x) => x !== "index")).toEqual(["zangxiang", "qi-blood-fluids"]);
  });
  it("a list that goes on after a table keeps its numbers; the first page has no previous one and the last no next one", async () => {
    await open("/zh-Hant/learn/course/wuxing");
    expect(article().querySelector("ol[start='4']")).not.toBeNull();
    reset();
    await open("/zh-Hant/learn/course/introduction");
    expect(within(screen.getByRole("navigation", { name: "課程頁面" })).queryByRole("link", { name: /上一頁/ })).toBeNull();
    reset();
    await open("/zh-Hant/learn/course/sources");
    expect(within(screen.getByRole("navigation", { name: "課程頁面" })).queryByRole("link", { name: /下一頁/ })).toBeNull();
    expect(article().querySelector("code")).not.toBeNull();
  });
  it("a page the course does not have is the section's own not-found page", async () => {
    await open("/zh-Hant/learn/course/no-such-page");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("學習內容中沒有這一頁");
  });
  it("says so, with a way to try again, when a page cannot be fetched — the course is not in the offline copy — and shows it once it can", async () => {
    const net = counting();
    net.failing.on = true;
    go("/zh-Hant/learn/course/yinyang");
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: "x", at: 1 } }));
    renderApp(testStore(env).store, () => Promise.resolve(withCourse(net.source)));
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("無法載入這一頁。課程不在離線副本中：請連上網路後再試一次。");
    net.failing.on = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "再試一次" }));
    expect(await screen.findByRole("heading", { level: 1, name: /^第三章.陰陽學說$/ })).toBeInTheDocument();
  });
});

describe("the course in an English interface", () => {
  it("is the same course in Traditional Chinese, marked as such, with a line saying so; the page around it is English", async () => {
    await open("/en/learn/course/yinyang");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("第三章　陰陽學說");
    expect(h1).toHaveAttribute("lang", "zh-Hant");
    expect(screen.getByText("This course is in Traditional Chinese only.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Back to the course's contents" }).map((a) => a.getAttribute("href"))).toEqual(["/en/learn/course", "/en/learn/course"]);
    expect(within(screen.getByRole("navigation", { name: "Pages of the course" })).getByRole("link", { name: /Next page/ })).toHaveAttribute("href", "/en/learn/course/wuxing");
  });
});

describe("the course in a Simplified interface", () => {
  it("shows no Traditional text: it says where the course is and links to the same page in Traditional Chinese, without fetching anything", async () => {
    const net = counting();
    const { user } = await open("/zh-Hans/learn/course/yinyang", withCourse(net.source, true));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("课程与教科书：中医学系统课程");
    const link = screen.getByRole("link", { name: "改用繁体中文阅读" });
    expect(link).toHaveAttribute("href", "/zh-Hant/learn/course/yinyang");
    expect(traditionalOnScreen()).toEqual([]);
    expect(net.asked).toEqual([]);
    await user.click(link);
    expect(await screen.findByRole("heading", { level: 1, name: /^第三章.陰陽學說$/ })).toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("the contents, a chapter in English and the Simplified page pass axe; no page addresses the reader", async () => {
    for (const [path, hans] of [["/zh-Hant/learn/course", false], ["/en/learn/course/zangxiang", false], ["/zh-Hans/learn/course/zangxiang", true]] as const) {
      const { container } = await open(path, withCourse(memoryCourse(course), hans));
      await axeClean(container);
      expect(container.textContent ?? "", path).not.toMatch(/[你妳您]|\byou\b/i);
      reset();
    }
  });
});
