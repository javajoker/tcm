// The herb pages on screen (PM-25): the hub's card, the list with its two filters, a page opened from the list and by its address (one shard, never the index), a fetch that fails and is tried again,
// the Chinese and Simplified pages, a public build that has none, and the accessibility of both pages.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { alignedList, chineseStrings, indexKnowledgeBase, memorySource, newDisplay, type HerbBrowserSource, type HerbDetail, type RawKbChunks } from "@tcm/kb";
import { buildFromDisk, rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import type { Loaded } from "../src/app/knowledge.tsx";
import { dictionary, traditionalOnScreen } from "./hans.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { kb, loaded } from "./sweep.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const dev = buildFromDisk("dev");
const files = dev.herbFiles!;
const withBrowser = (herbBrowser: HerbBrowserSource | null, display?: Parameters<typeof indexKnowledgeBase>[1]): Loaded => ({ kb: indexKnowledgeBase({ ...dev.chunks, herbBrowser } as RawKbChunks, display), engine: loaded.engine });
/** The knowledge base showing Simplified, with the display list also covering the herb files (the loader pairs those lists as each file arrives). */
const hansLoaded = ((): Loaded => {
  const list = chineseStrings(dev.chunks.core, dev.chunks.formulas, dev.chunks.citations, dev.chunks.guidance, dev.chunks.herbs, files.index, ...Object.values(files.shards));
  const display = newDisplay();
  display.add(list, alignedList(list, dictionary));
  return withBrowser(memorySource(files), display);
})();
const publicLoaded: Loaded = { kb: indexKnowledgeBase(rawChunksFromDisk("release", undefined, false)), engine: loaded.engine };

/** A source that counts what is asked of it, and can be made to fail. */
function counting(): { source: HerbBrowserSource; calls: string[]; failing: { on: boolean } } {
  const mem = memorySource(files);
  const calls: string[] = [];
  const failing = { on: false };
  return {
    calls, failing,
    source: {
      count: mem.count,
      index: () => { calls.push("index"); return failing.on ? Promise.reject(new Error("offline")) : mem.index(); },
      shard: (key) => { calls.push(`shard ${key}`); return failing.on ? Promise.reject(new Error("offline")) : mem.shard(key); },
    },
  };
}

async function open(path: string, which: Loaded = loaded, opts: { heading?: boolean } = {}) {
  go(path);
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: "x", at: 1 } }));
  const t = testStore(env);
  const view = renderApp(t.store, () => Promise.resolve(which));
  await act(async () => { await Promise.resolve(); });
  if (opts.heading !== false) await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { ...view, user: userEvent.setup() };
}
const detailOf = async (slug: string): Promise<HerbDetail> => (await kb.herbBrowser!.detail(slug))!;
const axeClean = async (root: Element): Promise<void> => { expect((await axe(root, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]); };

describe("the hub", () => {
  it("has a card for the herbs, with their number from the manifest, in a build that has a herb browser", async () => {
    await open("/en/learn");
    const cards = within(screen.getByRole("region", { name: "Browse by kind" })).getAllByRole("link");
    const card = cards.find((c) => c.getAttribute("href") === "/en/learn/herbs")!;
    expect(card).toHaveTextContent("Herbs");
    expect(card).toHaveTextContent("703 entries");
  });
  it("has none in a public build, and the address is the section's own not-found page", async () => {
    await open("/en/learn", publicLoaded);
    expect(within(screen.getByRole("region", { name: "Browse by kind" })).queryByRole("link", { name: /Herbs/ })).toBeNull();
    go("/");
    document.body.innerHTML = "";
    await open("/en/learn/herbs", publicLoaded);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page is not in the Learn section");
  });
});

describe("the list", () => {
  it("shows that it is loading, then the herbs by category with the draft notice, the filter and the count", async () => {
    await open("/en/learn/herbs");
    expect(await screen.findByRole("heading", { level: 1, name: "Herbs" })).toBeInTheDocument();
    expect(await screen.findByText("703 entries shown")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /Filter this list/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Nature" })).toBeInTheDocument();
    expect(screen.getAllByText("Draft content: not yet reviewed by a qualified practitioner.").length).toBeGreaterThan(0);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 3)).toEqual(["exterior-releasing herbs", "heat-clearing herbs", "purgative herbs"]);
    expect(document.title).toBe("Herbs · TCM Self-Check");
  });
  it("links each herb to its page, and says in words what its record flags", async () => {
    await open("/en/learn/herbs");
    await screen.findByText("703 entries shown");
    const link = screen.getByRole("link", { name: /White hyacinth bean/ });
    expect(link).toHaveAttribute("href", "/en/learn/herbs/baibiandou");
    expect(link).toHaveTextContent("健脾化濕、和中消暑");
    const toxic = (await kb.herbBrowser!.rows()).find((r) => r.toxic && r.pregnancy === "avoid")!;
    const row = document.querySelector(`a[href="/en/learn/herbs/${toxic.slug}"]`)!;
    expect(row).toHaveTextContent("Toxic · Avoid in pregnancy");
  });
  it("filters by what is typed — a Chinese or English name, the address — and announces how many are left", async () => {
    const { user } = await open("/en/learn/herbs");
    await screen.findByText("703 entries shown");
    const box = screen.getByRole("searchbox", { name: /Filter this list/ });
    await user.type(box, "dolichos");
    expect(await screen.findByText("1 entry shown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /White hyacinth bean/ })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "當歸");
    await waitFor(() => expect(screen.getByText(/entr(y|ies) shown/).textContent).toMatch(/^[1-9]\d* entr/));
    expect(screen.getByRole("link", { name: /當歸/ })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "qzxqzxqzx");
    expect(await screen.findByText("No entry matches the filter.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
  it("filters by nature with a native select, in the page's words, and together with the text", async () => {
    const { user } = await open("/en/learn/herbs");
    await screen.findByText("703 entries shown");
    const select = screen.getByRole("combobox", { name: "Nature" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent).slice(0, 4)).toEqual(["Every nature", "very cold", "cold", "slightly cold"]);
    await user.selectOptions(select, "warm");
    const warm = Number(screen.getByText(/entries shown/).textContent!.match(/^\d+/)![0]);
    expect(warm).toBeGreaterThan(40);
    expect(warm).toBeLessThan(703);
    await user.type(screen.getByRole("searchbox", { name: /Filter this list/ }), "健脾");
    await waitFor(() => expect(Number(screen.getByText(/entr(y|ies) shown/).textContent!.match(/^\d+/)![0])).toBeLessThan(warm));
  });
  it("pre-fills the filter from ?q=", async () => {
    await open("/en/learn/herbs?q=baibiandou");
    expect(await screen.findByText("1 entry shown")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /Filter this list/ })).toHaveValue("baibiandou");
    expect(screen.getByRole("link", { name: /White hyacinth bean/ })).toBeInTheDocument();
  });
  it("says so, with a way to try again, when the index cannot be fetched — and shows the list once it can", async () => {
    const net = counting();
    net.failing.on = true;
    const { user } = await open("/en/learn/herbs", withBrowser(net.source));
    expect(await screen.findByRole("alert")).toHaveTextContent("The herbs could not be loaded. Check the connection and try again.");
    net.failing.on = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("703 entries shown")).toBeInTheDocument();
    expect(net.calls.filter((c) => c === "index").length).toBe(2);
  });
  it("has no accessibility violations", async () => {
    await open("/en/learn/herbs");
    await screen.findByText("703 entries shown");
    await axeClean(document.body);
  });
});

describe("a herb page", () => {
  it("opened from the list: the cautions and the flags first, then what the herb is, where it comes from and how far it has been checked", async () => {
    const { user } = await open("/en/learn/herbs");
    await screen.findByText("703 entries shown");
    const toxic = (await kb.herbBrowser!.rows()).find((r) => r.toxic && r.pregnancy === "avoid" && r.name.en === null)!;
    const d = await detailOf(toxic.slug);
    await user.click(document.querySelector(`a[href="/en/learn/herbs/${toxic.slug}"]`)!);
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(d.name["zh-Hant"]) })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/en/learn/herbs/${toxic.slug}`);

    const cautions = screen.getByRole("region", { name: "Cautions" });
    expect(cautions).toHaveTextContent("The source marks this herb as toxic.");
    expect(cautions).toHaveTextContent("Not recommended in pregnancy: the herb is listed as contraindicated.");
    expect(cautions).toHaveTextContent("An allergy to this herb rules it out.");
    expect(cautions).toHaveTextContent("A herb is chosen by a licensed practitioner for the person it is meant for. This page only describes the herb.");
    if (d.caution !== null) { expect(cautions).toHaveTextContent(d.caution); expect(cautions).toHaveTextContent("(the source's words, in Chinese)"); }
    const overview = screen.getByRole("region", { name: "Overview" });
    expect(cautions.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();         // R1: before everything that describes the herb

    expect(within(overview).getByText("Category").nextElementSibling).toHaveTextContent(/herbs$/);
    expect(screen.getByRole("heading", { level: 2, name: "Traditional functions" })).toBeInTheDocument();
    const sources = screen.getByRole("region", { name: "Sources" });
    expect(sources).toHaveTextContent(`entry ${d.source.entry}`);
    expect(sources).toHaveTextContent("Derived from the data, not yet reviewed");
    expect(screen.getByText(/This herb page is a draft/)).toBeInTheDocument();
    expect(screen.getByText("General information about this subject, not advice for the reader.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Herbs" })).toHaveAttribute("href", "/en/learn/herbs");
    expect(screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/en/start")).toHaveLength(1);          // R5: the one neutral link to the assessment, at the foot
    expect(document.title).toBe(`${d.name["zh-Hant"]} · TCM Self-Check`);
  });
  it("opened by its address needs one shard and not the index; going back to the list then asks for the index", async () => {
    const net = counting();
    const { user } = await open("/en/learn/herbs/baibiandou", withBrowser(net.source));
    expect(await screen.findByRole("heading", { level: 1, name: /White hyacinth bean/ })).toBeInTheDocument();
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]).toMatch(/^shard [0-9a-f]$/);
    await user.click(screen.getByRole("link", { name: "Back to Herbs" }));
    expect(await screen.findByText("703 entries shown")).toBeInTheDocument();
    expect(net.calls.filter((c) => c === "index")).toHaveLength(1);
  });
  it("links a herb to the formulas of this app that use it, and names the other classical formulas the source lists", async () => {
    await open("/en/learn/herbs/baibiandou");
    const formulas = await screen.findByRole("region", { name: "In formulas" });
    expect(within(formulas).getByRole("link", { name: /Shen Ling|參苓白朮散/ })).toHaveAttribute("href", "/en/learn/formulas/F_SHENLING");
    expect(formulas).toHaveTextContent("香薷散");
    expect(within(formulas).queryByRole("link", { name: /香薷散/ })).toBeNull();
  });
  it("says how a herb added by hand has no source, and files its caution and its functions where they belong", async () => {
    await open("/en/learn/herbs/bingtang");
    const sources = await screen.findByRole("region", { name: "Sources" });
    expect(sources).toHaveTextContent("Added by hand to the app's data: no source entry is recorded for this herb.");
    expect(screen.getByRole("region", { name: "Cautions" })).toHaveTextContent("糖尿病者慎用");               // a caution, not the functions
    expect(screen.getByRole("region", { name: "Traditional functions" })).toHaveTextContent("潤肺和胃");
    expect(screen.getByRole("region", { name: "Cautions" })).not.toHaveTextContent("潤肺和胃");
  });
  it("shows a herb with no caution text without inventing one: only the stored flags, and no note about Chinese", async () => {
    await open("/en/learn/herbs/jingmi");
    const cautions = await screen.findByRole("region", { name: "Cautions" });
    expect(cautions).toHaveTextContent("No toxicity is recorded for this herb (not yet reviewed by a professional).");
    expect(cautions).toHaveTextContent("Recorded as having no pregnancy caution.");
    expect(cautions).not.toHaveTextContent("source's words");
    expect(within(cautions).getAllByRole("listitem").length).toBe(5);
  });
  it("is the section's own not-found page for a herb the build does not hold", async () => {
    await open("/en/learn/herbs/no-such-herb");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page is not in the Learn section");
  });
  it("says so, with a way to try again, when the shard cannot be fetched", async () => {
    const net = counting();
    net.failing.on = true;
    const { user } = await open("/en/learn/herbs/baibiandou", withBrowser(net.source), { heading: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("This herb page could not be loaded. Check the connection and try again.");
    net.failing.on = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: /White hyacinth bean/ })).toBeInTheDocument();
    expect(net.calls).toHaveLength(2);
  });
  it("has no accessibility violations", async () => {
    await open("/en/learn/herbs/baibiandou");
    await screen.findByRole("region", { name: "Cautions" });
    await axeClean(document.body);
  });
});

describe("in Chinese", () => {
  it("the list and a page in Traditional: the category in Chinese, the cautions region named, the Chinese caution as it is", async () => {
    await open("/zh-Hant/learn/herbs");
    expect(await screen.findByText("顯示 703 條")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("解表藥");
    go("/zh-Hant/learn/herbs/baibiandou");
    document.body.innerHTML = "";
    await open("/zh-Hant/learn/herbs/baibiandou");
    expect(await screen.findByRole("region", { name: "注意事項" })).toHaveTextContent("此藥材沒有記錄到毒性（尚未經專業審核）。");
    expect(screen.getByText(/此藥材頁為/)).toBeInTheDocument();
  });
  it("the list and a page in Simplified show no Traditional character: the names, the functions, the categories, the source — and the caution the data holds", async () => {
    await open("/zh-Hans/learn/herbs", hansLoaded);
    await screen.findByText(/^显示 703 条$/);
    expect(traditionalOnScreen()).toEqual([]);
    const withCaution = (await kb.herbBrowser!.rows()).find((r) => r.hasCaution && hansLoaded.kb.zh(r.name["zh-Hant"]) !== r.name["zh-Hant"])!;
    go(`/zh-Hans/learn/herbs/${withCaution.slug}`);
    document.body.innerHTML = "";
    await open(`/zh-Hans/learn/herbs/${withCaution.slug}`, hansLoaded);
    await screen.findByRole("region", { name: "注意事项" });
    expect(traditionalOnScreen()).toEqual([]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(hansLoaded.kb.zh(withCaution.name["zh-Hant"]));
  });
  it("filters by a Simplified name on a Simplified page", async () => {
    const { user } = await open("/zh-Hans/learn/herbs", hansLoaded);
    await screen.findByText(/^显示 703 条$/);
    const row = (await kb.herbBrowser!.rows()).find((r) => hansLoaded.kb.zh(r.name["zh-Hant"]) !== r.name["zh-Hant"])!;
    await user.type(screen.getByRole("searchbox"), hansLoaded.kb.zh(row.name["zh-Hant"]));
    await waitFor(() => expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === `/zh-Hans/learn/herbs/${row.slug}`)).toBe(true));
  });
});
