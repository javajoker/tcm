// The herb handbook (task PM-62): every herb once, in the herb list's order, each entry with the record's flags first; nothing about amounts; each edition in its own language and
// script; indexes that reach every herb and links that stay inside the edition; the appendices from the data (safety lists, 十八反 and 十九畏 with what each name covers, 七情, 引經,
// 炮製, 量效, the model's rules, the glossary, the works); a draft that says so, and a reviewed status only when everything printed is reviewed. Printing to PDF needs the installed
// Chrome and is checked only with PRINT_PDF=1 (`pnpm print:herbs` prints all three).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { printHtml } from "./print-editions.ts";
import {
  anchorOf, appendicesOf, CATEGORIES, entryHtml, footerOf, handbook, handbookHtml, HANDBOOK_LANGS, marksOf, namespaceHash, pinyinOf, statusOf, strokesOf, wordsFor, wordsReviewed, type HandbookLang,
} from "./print-herbs.ts";

const hb = handbook();
const words = Object.fromEntries(HANDBOOK_LANGS.map((l) => [l, wordsFor(l)])) as Record<HandbookLang, ReturnType<typeof wordsFor>>;
const html = Object.fromEntries(HANDBOOK_LANGS.map((l) => [l, handbookHtml(hb, words[l])])) as Record<HandbookLang, string>;
/** The text a reader sees: no tags, no style sheet. */
const visible = (h: string): string => h.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<title>[\s\S]*?<\/title>/g, "").replace(/<[^>]+>/g, " ");
const section = (h: string, id: string): string => {
  const from = h.indexOf(`<section class="part" id="${id}">`);
  assert.ok(from >= 0, `no section ${id}`);
  const to = h.indexOf("</section>", from);
  return h.slice(from, to);
};
const herb = (slug: string) => hb.herbs.find((h) => h.detail.slug === slug)!;
const data = JSON.parse(readFileSync(new URL("../data/herbs/herbs.json", import.meta.url), "utf8")) as { items: { slug: string }[] };

test("every herb once, numbered in the herb list's order: by category as a textbook lists them, then in the data's order", () => {
  assert.equal(hb.herbs.length, data.items.length);
  assert.deepEqual(hb.herbs.map((h) => h.no), hb.herbs.map((_, i) => i + 1));
  const rank = (c: string): number => CATEGORIES.findIndex(([zh]) => zh === c);
  for (let i = 1; i < hb.herbs.length; i++) assert.ok(rank(hb.herbs[i - 1]!.detail.category) <= rank(hb.herbs[i]!.detail.category), `${hb.herbs[i]!.detail.slug} out of order`);
  assert.ok(hb.herbs.every((h) => rank(h.detail.category) >= 0), "every category is one of the textbook's");
  for (const l of HANDBOOK_LANGS) {
    assert.equal((html[l].match(/<article class="entry" id="herb-/g) ?? []).length, hb.herbs.length, l);
    for (const h of hb.herbs) assert.equal(html[l].split(`id="${anchorOf(h.detail.slug)}"`).length, 2, `${l}: ${h.detail.slug} once`);
  }
});

test("an entry begins with what the record flags — toxicity and its grade, pregnancy, interactions, the source's caution, the herbs not to combine — and says so when nothing is recorded", () => {
  const w = words["zh-Hant"];
  const fuzi = entryHtml(w, hb, herb("fuzi"));
  assert.match(fuzi, /<p class="marks">毒性：有毒 · 孕婦禁用<\/p>/);
  assert.ok(fuzi.includes("【注意】</b>有毒；孕婦禁用；不宜與半夏、瓜蔞、貝母、白蘞、白及同用"));
  const avoid = /【不宜同用】<\/b>十八反：(.*)<\/p>/.exec(fuzi)?.[1] ?? "";
  for (const partner of ["banxia", "fanbanxia", "tianhuafen", "zhebeimu", "bailian", "baiji"]) assert.ok(avoid.includes(`href="#herb-${partner}"`), `附子 with ${partner}`);
  assert.equal((avoid.match(/<a /g) ?? []).length, 16, "the 半夏, 瓜蔞 and 貝母 of the knowledge base, 白蘞 and 白及");
  const order = ["class=\"marks\"", "【注意】", "【不宜同用】", "【類別】", "【傳統功效】", "【藥性模型】", "【所在方劑】", "【出處】"].map((s) => fuzi.indexOf(s));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "the cautions come first");
  assert.match(entryHtml(w, hb, herb("baishao")), /十八反：<a href="#herb-lilu">藜蘆/, "芍藥 covers 白芍");
  assert.match(entryHtml(w, hb, herb("gancao")), /可能與下列情況有交互作用：(服用降血糖藥、)?低血鉀或服用利尿劑、血壓偏高或服用降壓藥|可能與下列情況有交互作用：血壓偏高/);
  assert.match(entryHtml(w, hb, herb("aidicha")), /<p class="marks none">未記錄毒性、懷孕注意或交互作用（尚未經專業審核）<\/p>/);
  for (const h of hb.herbs) {
    const marks = marksOf(w, h).join(" ");
    assert.equal(marks.includes("毒性："), h.detail.toxic, `${h.detail.slug}: toxicity shown exactly when the record flags it`);
    assert.equal(/孕婦(禁|慎)用/.test(marks), h.detail.pregnancy === "avoid" || h.detail.pregnancy === "caution", `${h.detail.slug}: pregnancy`);
    assert.equal(marks.includes("交互作用"), h.detail.interactions.length > 0, `${h.detail.slug}: interactions`);
  }
});

test("nothing about amounts and nothing of the repository: no dose, no weight, no path, no commit", () => {
  for (const l of HANDBOOK_LANGS) {
    const text = visible(html[l]);
    assert.doesNotMatch(text, /\d+(\.\d+)? ?(mg|g|ml)\b|\d+(\.\d+)? ?(克|毫克|毫升)|[\d一二三四五六七八九十半]+ ?(錢|兩)(?![\u3400-\u9fff])/, `${l}: an amount`);
    assert.doesNotMatch(html[l], /reference\/sources|TCM-Library|\.md\b|[0-9a-f]{40}|dose_g_reference|typical_g/, `${l}: the repository or a weight`);
  }
});

test("each edition is in its own language and script: the Simplified edition holds no Traditional-only character, the English edition marks its Chinese, and no page addresses the reader", () => {
  const dict = JSON.parse(readFileSync(new URL("i18n/zh-Hans.dictionary.json", import.meta.url), "utf8")) as { _meta: { traditionalOnly: string }; entries: Record<string, string> };
  const traditionalOnly = new Set([...dict._meta.traditionalOnly]);
  for (const v of Object.values(dict.entries)) for (const c of v) traditionalOnly.delete(c);
  const hans = visible(html["zh-Hans"]);
  assert.deepEqual([...new Set([...hans].filter((c) => traditionalOnly.has(c)))], [], "Traditional characters on a Simplified page");
  assert.match(html["zh-Hans"], /^<!doctype html>\n<html lang="zh-Hans">/);
  assert.match(html.en, /^<!doctype html>\n<html lang="en">/);
  assert.ok((html.en.match(/<span lang="zh-Hant">/g) ?? []).length > hb.herbs.length * 5, "the English edition marks the Chinese of the data");
  assert.ok(visible(html.en).includes("The functions are shown in Chinese, as the source words them"));
  for (const l of HANDBOOK_LANGS) {
    assert.doesNotMatch(visible(html[l]), /[你妳您]|\byou\b/i, `${l}: second person`);
    assert.doesNotMatch(visible(html[l]), /handbook\.[a-z]|learn\.herb\.|formula\.interaction\./, `${l}: a message key instead of its words`);
  }
});

test("the indexes reach every herb — by pinyin, in the Traditional edition by stroke count, by Latin and English name — and every link stays inside the edition", () => {
  assert.deepEqual([strokesOf("一"), strokesOf("丁"), strokesOf("矮"), strokesOf("黃"), strokesOf("鬱")], [1, 2, 13, 12, 29], "the stroke counts of the system's ICU");
  assert.deepEqual(appendicesOf("zh-Hant").slice(0, 3), ["pinyin", "strokes", "names"]);
  assert.ok(!appendicesOf("en").includes("strokes") && !appendicesOf("zh-Hans").includes("strokes"), "the counts are the Traditional forms'");
  for (const l of HANDBOOK_LANGS) {
    const pinyin = section(html[l], "app-pinyin");
    for (const h of hb.herbs) assert.ok(pinyin.includes(`href="#${anchorOf(h.detail.slug)}"`), `${l}: ${h.detail.slug} in the pinyin index`);
    const ids = new Set([...html[l].matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!));
    for (const m of html[l].matchAll(/href="([^"]*)"/g)) assert.ok(m[1]!.startsWith("#") && ids.has(m[1]!.slice(1)), `${l}: ${m[1]} stays inside the edition`);
  }
  const strokes = section(html["zh-Hant"], "app-strokes");
  for (const h of hb.herbs) assert.ok(strokes.includes(`href="#${anchorOf(h.detail.slug)}"`), `${h.detail.slug} in the stroke index`);
  assert.ok(strokes.indexOf("<h3>13 畫</h3>") < strokes.indexOf('href="#herb-aidicha"'), "矮 has 13 strokes");
  const names = section(html.en, "app-names");
  assert.equal((names.match(/<li>/g) ?? []).length, hb.herbs.filter((h) => h.detail.latin !== null).length + hb.herbs.filter((h) => h.detail.name.en !== null).length);
  assert.ok(pinyinOf(herb("chuan_shanjia")) === "chuanshanjia", "an address's underscore is not part of the pinyin");
});

test("the appendices come from the data: the safety lists, 十八反 and 十九畏 with what each name covers, the 七情, 引經, 炮製, 量效, the model's rules, the glossary and the works", () => {
  const f = hb.files;
  const safety = section(html["zh-Hant"], "app-safety");
  for (const h of hb.herbs.filter((x) => x.detail.toxic || x.detail.pregnancy === "avoid" || x.detail.pregnancy === "caution" || x.detail.interactions.length > 0)) {
    assert.ok(safety.includes(`href="#${anchorOf(h.detail.slug)}"`), `${h.detail.slug} in the safety lists`);
  }
  const rows = f.safety.incompatibilities.shibafan.reduce((n, r) => n + r.opposes.length, 0) + f.safety.incompatibilities.shijiuwei.length;
  assert.equal((safety.match(/<tr><th scope="row">/g) ?? []).length, rows, "a row for every pair of names");
  const shaoyao = /<th scope="row">芍藥<\/th><td>(.*?)<\/td>/.exec(safety)?.[1] ?? "";
  assert.deepEqual([...shaoyao.matchAll(/href="#herb-([a-z_]+)"/g)].map((m) => m[1]).sort(), ["baishao", "chishao"], "芍藥 covers 白芍 and 赤芍");
  assert.ok(safety.includes("本手冊未收"), "a name with no herb of the handbook says so (犀角)");
  const verse = hb.citations.get(f.safety.incompatibilities.citation)!.quote_zh_hant;
  assert.equal(verse.split("。").length, 4, "the 十八反 verse is quoted whole: its four lines");
  assert.ok(safety.includes(`「${verse}」`), "and the safety appendix prints it");
  assert.equal((section(html["zh-Hant"], "app-pairings").match(/<tr><td>/g) ?? []).length, f.pairings.items.filter((p) => p.type !== "相反").length);
  assert.equal((section(html["zh-Hant"], "app-yinjing").match(/<tr><th scope="row">/g) ?? []).length, f.yinjing.channels.length);
  const processing = section(html["zh-Hant"], "app-processing");
  assert.equal((processing.match(/<tr><th scope="row">/g) ?? []).length, f.processing.methods.length);
  assert.doesNotMatch(processing, /textbook statement/, "the source library's note for its developers is said in the handbook's own words");
  assert.ok(processing.includes("（教材說法，未核對）"));
  assert.equal((section(html["zh-Hant"], "app-bands").match(/<tr><td>/g) ?? []).length, f.doseBands.items.length);
  const model = section(html["zh-Hant"], "app-model");
  for (const title of ["陰陽", "升降浮沉", "五行", "歸經", "補瀉", "潤燥", "氣血", "毒性", "藥用部位"]) assert.ok(model.includes(`<h2>${title}</h2>`), title);
  for (const m of model.matchAll(/<p class="counts">([^<]*)<\/p>/g)) {
    assert.equal([...m[1]!.matchAll(/(\d+) 味/g)].reduce((n, x) => n + Number(x[1]), 0), hb.herbs.length, `the counts cover every herb: ${m[1]}`);
  }
  assert.equal((section(html["zh-Hant"], "app-glossary").match(/<tr><th scope="row">/g) ?? []).length, f.glossary.items.length);
  const works = section(html["zh-Hant"], "app-sources");
  for (const w of ["中華人民共和國藥典（2025年版）一部", "本草綱目", "神農本草經", "本草蒙筌", "本草便讀"]) assert.ok(works.includes(w), w);
});

test("the part on formulas: how a formula is read — 君臣佐使 with the 素問's words, the reasoning, 加減 with 隨證 and 三因制宜 — then every formula the default reader sees, roles first to last, its classical 加減, and never a quantity", () => {
  const f = hb.files;
  assert.ok(hb.formulas.length === hb.kb.formulas.size && hb.formulas.length === f.formulas.items.length, "the closed beta's default reader (a learner) sees every formula of the library");
  assert.ok(hb.modifications, "and the classical 加減");
  const part = (l: HandbookLang): string => html[l].slice(html[l].indexOf('<section class="part" id="formulas">'), html[l].indexOf('<section class="part" id="app-'));
  for (const l of HANDBOOK_LANGS) {
    const p = part(l);
    for (const x of f.formulas.items) assert.equal(p.split(`id="formula-${x.id}"`).length, 2, `${l}: ${x.id} once`);
    for (const id of ["suwen-074-10", "suwen-074-11", "shanghan-016", "suwen-012-2", "suwen-070-5", "suwen-071-3", "suwen-070-6"]) {
      const c = hb.citations.get(id)!;
      assert.ok(visible(p).includes(l === "zh-Hans" ? c.quote_source_zh_hans! : c.quote_zh_hant), `${l}: the passage ${id}`);
    }
    // nothing quantitative: a composition holds no digit but its herbs' entry numbers (no amount, no proportion), and the part no amount in any unit
    const tables = p.match(/<table class="roles">[\s\S]*?<\/table>/g) ?? [];
    assert.equal(tables.length, f.formulas.items.length, `${l}: a composition for every formula`);
    for (const t of tables) assert.doesNotMatch(visible(t.replace(/<span class="no">\d+<\/span>/g, "")), /\d/, `${l}: a quantity in a composition`);
    assert.doesNotMatch(visible(p), /\d+(\.\d+)? ?(mg|g|ml|克|毫克|錢|兩|斤|升|合|枚)(?![a-z\u3400-\u9fff])/, `${l}: an amount in the part on formulas`);
  }
  const zh = part("zh-Hant");
  const sijunzi = zh.slice(zh.indexOf('id="formula-F_SIJUNZI"'), zh.indexOf("</article>", zh.indexOf('id="formula-F_SIJUNZI"')));
  assert.match(sijunzi, /<tr><th scope="row">君<\/th><td><a href="#herb-renshen">人參/, "the sovereign first, linked to its entry");
  assert.ok(["臣", "佐", "使"].every((r) => sijunzi.includes(`<th scope="row">${r}</th>`)));
  assert.ok(visible(sijunzi).includes("人參大補元氣、健脾養胃為君"), "the reasoning as the record gives it");
  assert.match(sijunzi, /見脘腹痞滿、食後腹脹：加<a href="#herb-chenpi">陳皮.*（佐），即異功散/, "a classical 加減: its signs, the herb added with its role, the formula it makes");
  assert.equal((zh.match(/<li>見/g) ?? []).length, f.formulas.items.reduce((n, x) => n + x.modifications.length, 0), "every classical 加減");
  const mahuang = zh.slice(zh.indexOf('id="formula-F_MAHUANG"'), zh.indexOf("</article>", zh.indexOf('id="formula-F_MAHUANG"')));
  assert.match(mahuang, /<p class="marks">.*含強藥或峻烈藥，僅供學習：含有強藥：麻黃/, "a tier C formula says so first, with its reason");
  assert.ok(visible(mahuang).includes("「無汗而喘者，麻黃湯主之」"), "the classic's own words where the source is a verified clause");
  assert.ok(visible(zh).includes("加減須由執業中醫師在診察之後決定"));
  assert.ok(zh.indexOf("君臣佐使") < zh.indexOf('id="formula-'), "the explanation comes before the formulas");
  const bohe = entryHtml(words["zh-Hant"], hb, herb("bohe"));
  assert.match(bohe, /本應用：<a href="#formula-F_YINQIAO">銀翹散<\/a>/, "a herb's formulas link to their entries");
});

test("a draft says so on its cover and on every page; the handbook is reviewed only when everything it prints is", () => {
  assert.equal(hb.status, "draft", "no herb is reviewed yet");
  assert.match(hb.version, /^[0-9a-f]{16}$/);
  for (const l of HANDBOOK_LANGS) assert.ok(html[l].includes(hb.version), `${l}: the data's version on the cover`);
  assert.ok(html["zh-Hant"].includes("草稿：本手冊的藥材資料由出處條目依本應用的規則整理，尚未經合格中醫師與藥師審核。只供學習，不是醫療建議"));
  assert.match(footerOf(hb, words["zh-Hant"]), /中藥速查手冊 · 草稿・未經審核・不是醫療建議.*class="pageNumber".*class="totalPages"/);
  assert.match(footerOf(hb, words.en), /Draft · not reviewed · not medical advice/);
  const reviewed = <T extends { status: string }>(items: readonly T[]): T[] => items.map((x) => ({ ...x, status: "reviewed" }));
  const f = hb.files;
  const all = { ...f, herbs: { ...f.herbs, items: reviewed(f.herbs.items) }, formulas: { ...f.formulas, items: reviewed(f.formulas.items) }, pairings: { ...f.pairings, items: reviewed(f.pairings.items) }, processing: { ...f.processing, methods: reviewed(f.processing.methods) },
    doseBands: { ...f.doseBands, items: reviewed(f.doseBands.items) }, glossary: { ...f.glossary, items: reviewed(f.glossary.items) }, safety: { ...f.safety, _meta: { ...f.safety._meta, status: "reviewed" as const } } } as typeof f;
  assert.equal(statusOf(all, true), "reviewed");
  assert.equal(statusOf(all, false), "draft", "its words are reviewed too");
  assert.equal(statusOf({ ...all, glossary: f.glossary }, true), "draft", "and its glossary");
  assert.equal(statusOf({ ...all, formulas: f.formulas }, true), "draft", "and its formulas");
  // the words: a valid record of the interface text, or of each namespace the handbook prints with, at its current hash (scripts/kb/review.py unit_hash)
  assert.equal(namespaceHash({ "zh-Hant": { a: "一「二」", b: { other: "{n} 味" } }, en: { a: 'one "two"', b: { one: "{n} herb", other: "{n} herbs" } } }), "080c24d6f7d9aa8a");
  assert.equal(wordsReviewed([]), false);
  const ns = (n: string) => ({ file: "apps/web/src/i18n", unit: n, hash: namespaceHash({ "zh-Hant": JSON.parse(readFileSync(new URL(`../apps/web/src/i18n/zh-Hant/${n}.json`, import.meta.url), "utf8")), en: JSON.parse(readFileSync(new URL(`../apps/web/src/i18n/en/${n}.json`, import.meta.url), "utf8")) }) });
  assert.equal(wordsReviewed([ns("handbook"), ns("learn"), ns("formula"), ns("report")]), true);
  assert.equal(wordsReviewed([ns("handbook"), ns("learn"), ns("formula")]), false, "the report namespace's words for the roles are printed too");
});

test("printing to PDF with the installed Chrome", { skip: process.env.PRINT_PDF !== "1" && "set PRINT_PDF=1: it needs the installed Chrome and a Traditional Chinese font" }, async () => {
  const pdf = await printHtml(html["zh-Hant"], footerOf(hb, words["zh-Hant"]));
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-"));
  assert.ok((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length > 100, "the cover, the notes, the contents, 703 entries and the appendices");
  assert.match(text, /\/Outlines/, "an outline of the headings");
});
