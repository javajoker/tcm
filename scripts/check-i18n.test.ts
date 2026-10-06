import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { checkGlossary, checkHans, checkParity, checkStyle, checkUse, checkWording, englishForms, loadCatalogs, runChecks, usedKeys, usesEnglishForm, visualWidth, type GlossaryTerm } from "./check-i18n.ts";

const wording = JSON.parse(readFileSync(join(import.meta.dirname, "i18n-wording.json"), "utf8"));
const ns = (zh: string[], en: string[]): Record<string, { zh: string[]; en: string[] }> => ({ common: { zh, en } });
const rules = (xs: { rule: string }[]): string[] => [...new Set(xs.map((x) => x.rule))].sort();

describe("check-i18n: the real catalogs", () => {
  test("have no errors (the CI gate)", () => {
    const errors = runChecks().filter((i) => i.severity === "error");
    assert.deepEqual(errors.map((e) => e.message), []);
  });
  test("zh-Hant and en cover the same keys", () => {
    const { zh, en } = loadCatalogs();
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  });
});

describe("parity", () => {
  test("a key missing in either language", () => {
    const f = checkParity({ "a.b": "甲" }, {}, ns(["a.b"], []));
    assert.deepEqual(rules(f), ["parity"]);
    assert.match(f[0]!.message, /no English message/);
    assert.match(checkParity({}, { "a.b": "A" }, ns([], ["a.b"]))[0]!.message, /no zh-Hant message/);
  });
  test("placeholders and rich-text tags must match", () => {
    assert.deepEqual(rules(checkParity({ k: "共 {n} 題" }, { k: "{count} questions" }, ns(["k"], ["k"]))), ["placeholders"]);
    assert.deepEqual(rules(checkParity({ k: "見<link>這裡</link>" }, { k: "see here" }, ns(["k"], ["k"]))), ["placeholders"]);
    assert.deepEqual(checkParity({ k: "共 {n} 題" }, { k: "{n} questions" }, ns(["k"], ["k"])), []);
  });
  test("plural messages: both languages need `other`; a string against a multi-form plural is an error, zh other-only is fine", () => {
    assert.deepEqual(checkParity({ k: { other: "{n} 題" } }, { k: { one: "{n} question", other: "{n} questions" } }, ns(["k"], ["k"])), []);
    assert.deepEqual(rules(checkParity({ k: { other: "{n} 題" } }, { k: { one: "{n} question" } as never }, ns(["k"], ["k"]))), ["plural"]);
    assert.deepEqual(rules(checkParity({ k: "題" }, { k: { one: "a", other: "b" } }, ns(["k"], ["k"]))), ["plural"]);
  });
});

describe("forbidden wording", () => {
  const hit = (en: string, zh = "好"): string[] => rules(checkWording({ "x.y": zh }, { "x.y": en }, wording));
  test("English: each family fires", () => {
    for (const [text, rule] of [["Your diagnosis is ready", "diagnosis"], ["The recommended prescription", "prescription"], ["It will cure you", "cure"], ["a miracle remedy", "cure"], ["You have a qi deficiency", "label"],
      ["Guaranteed results", "certainty"], ["Your fortune this year", "fate"], ["The dose is 9 g", "dose"], ["No side effects", "natural"], ["A dangerous herb", "fear"]] as const) assert.ok(hit(text).includes(`wording:${rule}`), text);
  });
  test("Chinese: each family fires", () => {
    for (const [text, rule] of [["您的診斷結果", "diagnosis"], ["開立處方", "prescription"], ["可以根治", "cure"], ["您是氣虛體質", "label"], ["保證有效", "certainty"], ["您的運勢", "fate"], ["建議劑量", "dose"], ["天然無副作用", "natural"], ["這很危險", "fear"]] as const) assert.ok(hit("fine", text).includes(`wording:${rule}`), text);
  });
  test("a trend or follow-up text never judges: better, worse, improved, recovered, progress, score (and their Chinese) — and only there", () => {
    const at = (key: string, en: string, zh = "好"): string[] => rules(checkWording({ [key]: zh }, { [key]: en }, wording));
    for (const text of ["Your sleep is better", "It got worse", "A clear improvement", "Dampness improved", "You have recovered", "Good progress", "Your score went up", "Healthier than before"]) assert.ok(at("trends.change.x", text).includes("wording:judgement"), text);
    for (const zh of ["變好了", "惡化", "有改善", "進步很多", "康復", "分數上升", "好轉"]) assert.ok(at("trends.change.x", "fine", zh).includes("wording:judgement"), zh);
    assert.ok(at("followup.nudge.x", "Things are better").includes("wording:judgement"));
    // the rule is scoped to the trend and follow-up catalogues: the rest of the app says "if pain gets worse" and "improve" where a caution needs it
    assert.deepEqual(at("report.points.cautions", "Stop if pain gets worse"), []);
    assert.deepEqual(at("trends.change.item", "Between 3 Sept and 1 Oct, Dampness moved from the somewhat high band to the normal band.", "從 9 月 3 日到 10 月 1 日，濕從稍高移到正常。"), []);
  });
  test("acceptable wording passes", () => {
    assert.deepEqual(hit("This pattern is the closest match; it leans towards spleen qi deficiency."), []);
    assert.deepEqual(hit("fine", "傾向於脾氣虛，請與中醫師討論。"), []);
  });
  test("the allow-list lets the legal disclaimer negate the claim — and only for the keys it names", () => {
    const text = "This is not a medical diagnosis or prescription.";
    assert.deepEqual(checkWording({ "common.footer.disclaimer": "不是醫療診斷或處方" }, { "common.footer.disclaimer": text }, wording), []);
    assert.deepEqual(checkWording({ "safety.notice.a.body": "不是診斷" }, { "safety.notice.a.body": text }, wording), []);      // a prefix entry
    assert.ok(checkWording({ "report.summary.lean": "診斷" }, { "report.summary.lean": text }, wording).length === 0, "report.summary. is allowed for negated forms");
    assert.ok(checkWording({ "intake.stage.start": "不是診斷" }, { "intake.stage.start": text }, wording).length > 0, "an unlisted key is not");
  });
  test("plural messages are scanned in every form", () => {
    assert.ok(rules(checkWording({ "x.y": "好" }, { "x.y": { one: "fine", other: "a cure for {n}" } }, wording)).includes("wording:cure"));
  });
});

describe("style warnings", () => {
  test("Han–Latin spacing and full-width punctuation", () => {
    const f = checkStyle({ a: "共12題", b: "共 12 題", c: "好,的", d: "好，的" }, { a: "x", b: "x", c: "x", d: "x" });
    assert.deepEqual(f.filter((x) => x.rule === "spacing").map((x) => x.key), ["a"]);
    assert.deepEqual(f.filter((x) => x.rule === "punctuation").map((x) => x.key), ["c"]);
    assert.ok(f.every((x) => x.severity === "warning"));
  });
  test("placeholders do not count as Latin text; the length ratio is judged on long strings only", () => {
    assert.deepEqual(checkStyle({ a: "{n}題" }, { a: "{n} questions" }), []);
    assert.deepEqual(checkStyle({ a: "性別" }, { a: "Sex at birth and many more words than the label needs" }), []);          // a short label: no verdict
    const long = "這是一段足夠長的中文說明文字用來檢查長度比例的規則";
    assert.deepEqual(checkStyle({ a: long }, { a: "x".repeat(visualWidth(long) * 3) }).map((x) => x.rule), ["length"]);
    assert.deepEqual(checkStyle({ a: long }, { a: "x".repeat(visualWidth(long) * 2) }), []);
  });
  test("visual width: full-width characters count twice, placeholders and tags not at all", () => {
    assert.equal(visualWidth("中文"), 4);
    assert.equal(visualWidth("ab"), 2);
    assert.equal(visualWidth("共 {n} 題"), 2 + 1 + 1 + 2 - 0);
    assert.equal(visualWidth("<b>好</b>"), 2);
  });
});

describe("orphan and missing keys", () => {
  test("a key nobody uses is an error; a template prefix counts as use; an undefined key is an error", () => {
    const used = { literal: new Set(["a.used", "a.undefined"]), prefixes: ["a.dyn."] };
    const f = checkUse({ "a.used": "x", "a.dyn.one": "y", "a.orphan": "z" }, used);
    assert.deepEqual(f.map((x) => `${x.rule}:${x.key}`).sort(), ["missing:a.undefined", "orphan:a.orphan"]);
  });
  test("the scanner reads literal keys and template prefixes from the web sources, not comments", () => {
    const u = usedKeys();
    assert.ok(u.literal.has("common.app.name"));
    assert.ok(u.prefixes.includes("report.role."));
    assert.ok(!u.literal.has("safety.notice.<slug>.*"));
  });
});

describe("check-i18n: glossary conformance (i18n guide §2.1 rule 5, §8.2)", () => {
  const term = (zh: string, en: string, alt: string[] = [], domain = "diagnosis"): GlossaryTerm => ({ "zh-Hant": zh, en, alt, domain });
  const glossary = [term("氣虛", "qi deficiency", [], "nature"), term("氣虛質", "qi-deficiency constitution", ["Qi deficiency"], "constitution"), term("五行", "five phases (five elements)", [], "theory"), term("木", "wood", [], "wuxing"), term("脈象", "pulse quality", ["pulse"])];
  const run = (zh: string, en: string, allow = {}): string[] => checkGlossary({ "k.a": zh }, { "k.a": en }, glossary, { ...wording, ...allow }).map((i) => i.message);

  test("the English forms of a term: the main term, the parenthetical, the alternatives; hyphens and dashes are spaces", () => {
    assert.deepEqual(englishForms(term("五行", "five phases (five elements)")), ["five phases (five elements)", "five phases", "five elements"]);
    assert.deepEqual(englishForms(term("寒熱", "cold and heat", ["cold–heat"])), ["cold and heat", "cold heat"]);
    assert.ok(usesEnglishForm("This is Qi-deficiency pattern", ["qi deficiency"]));
  });

  test("inflection is tolerated, other words are not", () => {
    assert.ok(usesEnglishForm("Many phlegms", ["phlegm"]));
    assert.ok(usesEnglishForm("a constitutional tendency", ["constitution"]));
    assert.ok(usesEnglishForm("it is warming", ["warm"]));
    assert.equal(usesEnglishForm("qi deficiencyish", ["qi deficiency"]), false);
    assert.equal(usesEnglishForm("the spleen", ["pleen"]), false, "a form must start at a word boundary");
  });

  test("a zh term must be rendered with the glossary English (or an alternative) in the paired English", () => {
    assert.deepEqual(run("氣虛的表現", "Signs of qi deficiency"), []);
    assert.deepEqual(run("五行", "The five elements"), []);
    assert.deepEqual(run("脈象", "Pulse"), [], "an accepted alternative");
    assert.match(run("氣虛的表現", "Signs of weak energy")[0]!, /uses the glossary term 氣虛 \(qi deficiency\) but the English text does not/);
  });

  test("the longer term wins over the term inside it; terms of one character are not checked", () => {
    assert.deepEqual(run("氣虛質", "Qi deficiency type"), [], "氣虛質 consumes 氣虛");
    assert.match(run("氣虛質", "A weak type")[0]!, /氣虛質/);
    assert.deepEqual(run("木頭", "A log"), [], "木 is one character");
  });

  test("plural messages are compared form by form", () => {
    const zh = { "k.p": { other: "氣虛 {n} 項" } }, en = { "k.p": { one: "{n} qi deficiency item", other: "{n} qi deficiency items" } };
    assert.deepEqual(checkGlossary(zh as never, en as never, glossary, wording), []);
    assert.equal(checkGlossary(zh as never, { "k.p": { other: "{n} items" } } as never, glossary, wording).length, 1);
  });

  test("a reasoned exception silences one term for a key prefix; the severity is an error", () => {
    const allow = { glossaryAllow: [{ keys: ["k."], terms: ["氣虛"], reason: "context" }] };
    assert.deepEqual(run("氣虛", "weak", allow), []);
    assert.equal(run("五行", "weak", allow).length, 1, "another term is still checked");
    assert.equal(checkGlossary({ "k.a": "氣虛" }, { "k.a": "weak" }, glossary, wording)[0]!.severity, "error");
  });

  test("every allow-list entry has a reason and names real keys and terms", () => {
    const { zh } = loadCatalogs();
    for (const a of wording.glossaryAllow ?? []) {
      assert.ok(a.reason.length > 20, a.terms.join());
      for (const k of a.keys) assert.ok(k in zh || Object.keys(zh).some((z) => z.startsWith(k)), `${k} matches no key`);
    }
  });
});

describe("the generated Simplified catalogue", () => {
  const dictionary = { _meta: { traditionalOnly: "腎陰陽" }, entries: { 陰陽: "阴阳" } };
  const term: GlossaryTerm = { "zh-Hant": "陰陽", en: "yin and yang", alt: [], domain: "theory" };
  const run = (zh: Record<string, unknown>, hans: Record<string, unknown>, overrides = {}): ReturnType<typeof checkHans> => checkHans(zh as never, hans as never, dictionary, overrides, [term]);

  test("a message missing or extra in either catalogue", () => {
    assert.deepEqual(rules(run({ a: "甲" }, {})), ["hans-coverage"]);
    assert.deepEqual(rules(run({}, { a: "甲" })), ["hans-coverage"]);
    assert.deepEqual(run({ a: "甲" }, { a: "甲" }), []);
  });

  test("parameters, tags and plural forms must be those of the source", () => {
    assert.deepEqual(rules(run({ a: "共 {n} 題" }, { a: "共 {m} 题" })), ["hans-placeholders"]);
    assert.deepEqual(rules(run({ a: "<b>好</b>" }, { a: "好" })), ["hans-placeholders"]);
    assert.deepEqual(rules(run({ a: { other: "{n} 個" } }, { a: "个" })), ["hans-placeholders"]);
    assert.deepEqual(run({ a: "共 {n} 題" }, { a: "共 {n} 题" }), []);
  });

  test("a Traditional-only character is an error — unless the key is pinned or the text is on the keep list", () => {
    assert.deepEqual(rules(run({ a: "腎" }, { a: "腎" })), ["hans-purity"]);
    assert.match(run({ a: "腎" }, { a: "腎" })[0]!.message, /腎/);
    assert.deepEqual(run({ a: "腎" }, { a: "腎" }, { keys: { a: {} } }), []);
    assert.deepEqual(run({ a: "腎" }, { a: "腎" }, { keep: { 腎: {} } }), []);
    assert.deepEqual(run({ a: "肾" }, { a: "肾" }), []);
  });

  test("a glossary term must be rendered the way the dictionary renders it", () => {
    assert.deepEqual(rules(run({ a: "調和陰陽" }, { a: "调和阴阳" }).concat(run({ a: "調和陰陽" }, { a: "调和阴陽" }))), ["hans-glossary", "hans-purity"].sort());
    assert.deepEqual(rules(run({ a: "調和陰陽" }, { a: "调和阴阳" })), []);
    assert.deepEqual(rules(run({ a: "調和陰陽" }, { a: "调和阴阳" }, { keys: { a: {} } })), []);
  });
});
