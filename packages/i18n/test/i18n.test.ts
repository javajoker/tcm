import assert from "node:assert/strict";
import { test } from "node:test";
import { createI18n, LANGS, parseRich, placeholdersOf, scriptOf, zhLangOf, type Message } from "../src/index.ts";

const zh = {
  "common.app.name": "中醫自我評估",
  "intake.age.label": "年齡",
  "inquiry.progress": "第 {current} 題，約剩 {left} 題",
  "history.count": { other: "共 {n} 筆紀錄" },
  "report.items": { zero: "沒有項目", one: "1 個項目", other: "{n} 個項目" },
  "safety.link": "說明請見<link>安全政策</link>，並<b>先</b>諮詢醫師。",
  "only.zh": "只有中文",
} as const satisfies Record<string, Message>;
const en = {
  "common.app.name": "TCM Self-Check",
  "intake.age.label": "Age",
  "inquiry.progress": "Question {current}, about {left} left",
  "history.count": { one: "{n} record", other: "{n} records" },
  "report.items": { zero: "No items", one: "1 item", other: "{n} items" },
  "safety.link": "See the <link>safety policy</link> and ask a doctor <b>first</b>.",
} as const satisfies Partial<Record<keyof typeof zh, Message>>;
const catalogs = { "zh-Hant": zh, en } as const;

test("interpolation and the zh-Hant default", () => {
  const t = createI18n(catalogs, "zh-Hant");
  assert.equal(t.t("common.app.name"), "中醫自我評估");
  assert.equal(t.t("inquiry.progress", { current: 3, left: 12 }), "第 3 題，約剩 12 題");
  assert.equal(t.t("inquiry.progress", { current: 3 }), "第 3 題，約剩 {left} 題", "a missing parameter stays visible instead of vanishing");
  assert.equal(createI18n(catalogs, "en").t("inquiry.progress", { current: 3, left: 12 }), "Question 3, about 12 left");
});

test("plurals follow Intl.PluralRules: zh has only 'other', en distinguishes one and other", () => {
  const z = createI18n(catalogs, "zh-Hant"), e = createI18n(catalogs, "en");
  assert.equal(z.plural("history.count", 1), "共 1 筆紀錄");
  assert.equal(z.plural("history.count", 5), "共 5 筆紀錄");
  assert.equal(e.plural("history.count", 1), "1 record");
  assert.equal(e.plural("history.count", 2), "2 records");
  assert.equal(e.plural("report.items", 1), "1 item");
  assert.equal(e.plural("report.items", 0), "0 items", "English has no 'zero' category: Intl selects 'other'");
  assert.equal(e.plural("history.count", 1234), "1,234 records", "numbers are formatted for the language");
});

test("rich text: tags become parts, never HTML", () => {
  const parts = createI18n(catalogs, "en").rich("safety.link");
  assert.deepEqual(parts, [
    { type: "text", text: "See the " }, { type: "tag", tag: "link", text: "safety policy" }, { type: "text", text: " and ask a doctor " }, { type: "tag", tag: "b", text: "first" }, { type: "text", text: "." },
  ]);
  assert.deepEqual(parseRich("no tags"), [{ type: "text", text: "no tags" }]);
  assert.deepEqual(parseRich("a <b>b</i> c"), [{ type: "text", text: "a <b>b</i> c" }], "unmatched tags stay text");
  assert.deepEqual(parseRich(""), []);
});

test("English falls back to zh-Hant, never the reverse, and the fallback is reported", () => {
  const fell: string[] = [], missing: string[] = [];
  const e = createI18n(catalogs, "en", { onFallback: (k) => fell.push(k), onMissing: (k) => missing.push(k) });
  assert.equal(e.t("only.zh"), "只有中文");
  assert.deepEqual(fell, ["only.zh"]);
  assert.equal(e.t("nope" as never), "nope");
  assert.deepEqual(missing, ["nope"]);
  const z = createI18n({ "zh-Hant": zh, en: {} }, "zh-Hant");
  assert.equal(z.t("common.app.name"), "中醫自我評估", "zh-Hant never consults the English catalog");
});

test("localized knowledge-base values: en: null falls back and says so", () => {
  const e = createI18n(catalogs, "en"), z = createI18n(catalogs, "zh-Hant");
  assert.deepEqual(e.localized({ "zh-Hant": "脾氣虛", en: "Spleen qi deficiency" }), { text: "Spleen qi deficiency", fellBack: false });
  assert.deepEqual(e.localized({ "zh-Hant": "脾氣虛", en: null }), { text: "脾氣虛", fellBack: true });
  assert.deepEqual(e.localized({ "zh-Hant": "脾氣虛" }), { text: "脾氣虛", fellBack: true });
  assert.deepEqual(z.localized({ "zh-Hant": "脾氣虛", en: "x" }), { text: "脾氣虛", fellBack: false });
});

test("Intl helpers", () => {
  const z = createI18n(catalogs, "zh-Hant"), e = createI18n(catalogs, "en");
  assert.equal(z.number(1.25, { maximumFractionDigits: 1 }), "1.3");
  assert.equal(e.number(-0.5, { minimumFractionDigits: 1 }).replace("−", "-"), "-0.5");
  const ms = Date.UTC(2026, 9, 4);
  assert.match(z.date(ms, { dateStyle: "long" }), /2026年10月4日/);
  assert.match(e.date(ms, { dateStyle: "medium" }), /Oct 4, 2026/);
});

test("placeholdersOf lists parameters, tags and plural forms (used by the catalog checks)", () => {
  assert.deepEqual(placeholdersOf("第 {current} 題，約剩 {left} 題"), { params: ["current", "left"], tags: [], forms: [] });
  assert.deepEqual(placeholdersOf(zh["safety.link"]), { params: [], tags: ["b", "link"], forms: [] });
  assert.deepEqual(placeholdersOf(en["history.count"]), { params: ["n"], tags: [], forms: ["one", "other"] });
  assert.deepEqual(placeholdersOf(zh["history.count"]).forms, ["other"]);
});

test("has() sees both catalogs", () => {
  const e = createI18n(catalogs, "en");
  assert.ok(e.has("only.zh") && e.has("common.app.name") && !e.has("x"));
});

// ── pseudo-localisation ─────────────────────────────────────────────────────

import { pseudoize, pseudoXA, pseudoXL } from "../src/index.ts";

test("en-XA accents the letters, doubles the vowels, brackets the string and leaves placeholders and tags alone", () => {
  assert.equal(pseudoXA("Save"), "⟦Šååṽéé⟧");
  assert.equal(pseudoXA("Hello {name}, <b>welcome</b>!"), "⟦Ĥééłłøø {name}, <b>ŵééłçøøɱéé</b>!⟧");
  assert.equal(pseudoXA(""), "");
  const text = "Please enter your date of birth so that the app can work out the chart.";
  const ratio = [...pseudoXA(text)].length / [...text].length;
  assert.ok(ratio > 1.25 && ratio < 1.6, `expansion ${ratio.toFixed(2)}`);
  assert.equal(pseudoXA("中文 {n}"), "⟦中文 {n}⟧", "characters without a mapping are kept");
});

test("zh-XL repeats the string, and the dispatcher picks the mode", () => {
  assert.equal(pseudoXL("請輸入出生日期"), "請輸入出生日期 · 請輸入出生日期");
  assert.equal(pseudoize("xl", "a"), "a · a");
  assert.equal(pseudoize("xa", "a"), "⟦åå⟧");
});

test("a transform is applied to the template before parameters, plurals and tags are handled", () => {
  const catalogs = { "zh-Hant": { greet: "你好 {name}", rich: "<b>粗</b>字", items: { other: "{n} 項" } }, en: { greet: "Hello {name}", rich: "<b>bold</b> text", items: { one: "{n} item", other: "{n} items" } } };
  const t = createI18n(catalogs, "en", { transform: pseudoXA });
  assert.equal(t.t("greet", { name: "Alice" }), "⟦Ĥééłłøø Alice⟧", "parameter values are not transformed");
  assert.deepEqual(t.rich("rich"), [{ type: "text", text: "⟦" }, { type: "tag", tag: "b", text: "ƀøøłđ" }, { type: "text", text: " ţééẋţ⟧" }]);
  assert.equal(t.plural("items", 1), "⟦1 îîţééɱ⟧");
  assert.equal(t.plural("items", 3), "⟦3 îîţééɱš⟧");
  assert.equal(createI18n(catalogs, "zh-Hant", { transform: (s) => pseudoize("xl", s) }).t("greet", { name: "A" }), "你好 A · 你好 A");
});

// ── Simplified Chinese (post-MVP, docs/post-mvp/design/simplified-chinese.md) ──

const hans = { "common.app.name": "中医自我评估", "intake.age.label": "年龄" } as const satisfies Partial<Record<keyof typeof zh, Message>>;
const catalogs3 = { "zh-Hant": zh, "zh-Hans": hans, en } as const;
const dictionary: Record<string, string> = { 脾氣虛: "脾气虚", 腎: "肾" };

test("three languages, two scripts: Simplified for zh-Hans, Traditional for zh-Hant and for English", () => {
  assert.deepEqual([...LANGS], ["zh-Hant", "zh-Hans", "en"]);
  assert.deepEqual(LANGS.map(scriptOf), ["Hant", "Hans", "Hant"]);
  assert.deepEqual(LANGS.map(zhLangOf), ["zh-Hant", "zh-Hans", "zh-Hant"]);
  const t = createI18n(catalogs3, "zh-Hans");
  assert.equal(t.script, "Hans");
  assert.equal(t.zhLang, "zh-Hans");
});

test("zh-Hans reads its own catalogue and falls back to zh-Hant — never to English — and says so", () => {
  const fell: string[] = [];
  const t = createI18n(catalogs3, "zh-Hans", { onFallback: (k) => fell.push(k) });
  assert.equal(t.t("common.app.name"), "中医自我评估");
  assert.equal(t.t("only.zh"), "只有中文");
  assert.deepEqual(fell, ["only.zh"]);
  assert.equal(createI18n({ "zh-Hant": zh, en }, "zh-Hans").t("common.app.name"), "中醫自我評估", "no Simplified catalogue yet: the source language, reported");
});

test("zh() and localized() convert for display in zh-Hans only", () => {
  const options = { zh: (s: string) => dictionary[s] ?? s };
  assert.equal(createI18n(catalogs3, "zh-Hans", options).zh("腎"), "肾");
  assert.equal(createI18n(catalogs3, "zh-Hans", options).zh("心"), "心", "unknown strings pass through");
  assert.equal(createI18n(catalogs3, "zh-Hant", options).zh("腎"), "腎");
  assert.equal(createI18n(catalogs3, "en", options).zh("腎"), "腎", "English shows Chinese terms as the data has them");
  assert.deepEqual(createI18n(catalogs3, "zh-Hans", options).localized({ "zh-Hant": "脾氣虛", en: "Spleen qi deficiency" }), { text: "脾气虚", fellBack: false });
  assert.deepEqual(createI18n(catalogs3, "en", options).localized({ "zh-Hant": "脾氣虛", en: null }), { text: "脾氣虛", fellBack: true });
  assert.equal(createI18n(catalogs3, "zh-Hans").zh("腎"), "腎", "without a display function: the identity");
});

test("the display function is read at use, so it can arrive after the formatter is made", () => {
  let fn: (s: string) => string = (s) => s;
  const t = createI18n(catalogs3, "zh-Hans", { zh: (s) => fn(s) });
  assert.equal(t.zh("腎"), "腎");
  fn = (s) => dictionary[s] ?? s;
  assert.equal(t.zh("腎"), "肾");
});

test("numbers and dates follow the mainland locale in zh-Hans", () => {
  const t = createI18n(catalogs3, "zh-Hans");
  assert.equal(t.number(1234.5), "1,234.5");
  assert.match(t.date(Date.UTC(2026, 9, 4, 12), { year: "numeric", month: "long", day: "numeric" }), /2026年10月4日/);
});
