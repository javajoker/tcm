// The wording lint of the assistant's questions (docs/i18n-guide.md §5.1): known answers in the three languages, and the generated rules compile as JavaScript.
import assert from "node:assert/strict";
import { test } from "node:test";
import { WORDING_DATA } from "../src/generated/wording.ts";
import { lintQuestion } from "../src/index.ts";
import { MOCK_QUESTIONS } from "../src/mock.ts";

test("every generated rule compiles as a JavaScript regular expression, in each language", () => {
  for (const r of WORDING_DATA.rules) assert.doesNotThrow(() => new RegExp(r.pattern, "iu"), `${r.id} ${r.lang}`);
  assert.deepEqual(new Set(WORDING_DATA.rules.map((r) => r.lang)), new Set(["zh-Hant", "zh-Hans", "en"]));
  assert.ok(WORDING_DATA.names["zh-Hant"].length > 700 && WORDING_DATA.names.en.length > 100);
});

const PASS = [
  "最近會特別怕冷或怕熱嗎？", "你是不是常常覺得累？", "最近一兩天有發燒嗎？", "皮膚有沒有一片一片的紅疹？", "流汗的量多嗎？", "什麼情況下會痛得更厲害？",
  "最近会特别怕冷或怕热吗？", "你是不是常常觉得累？", "饭后会胀得更厉害吗？",
  "Does it get worse after meals?", "How much do you sweat?", "Are you often tired?", "Is the amount of your period flow larger than usual?",
];
const FAIL: readonly (readonly [string, readonly string[]])[] = [
  ["這像是脾氣虛。", ["name"]],
  ["可以試試桂枝湯嗎？", ["name"]],
  ["可以试试桂枝汤吗？", ["name"]],
  ["每次 3 克，好嗎？", ["amount"]],
  ["建議服用一點人參。", ["dose", "name"]],
  ["你是陽虛體質嗎？", ["label"]],
  ["这是诊断吗？", ["diagnosis"]],
  ["需要處方嗎？", ["prescription"]],
  ["保證會好起來嗎？", ["certainty"]],
  ["要不要喝點中藥？", ["medicine"]],
  ["你的證型是什麼？", ["pattern"]],
  ["Take 5 g of ginseng daily?", ["amount", "name"]],
  ["You have a qi deficiency pattern, right?", ["label", "name"]],            // "Qi deficiency" is a constitution's English name
  ["Would a herbal tea help?", ["medicine"]],
  ["Shall we try Guizhi Tang?", ["name"]],
  ["Would Cinnamon Twig Decoction cure it?", ["cure", "medicine", "name"]],
  ["Has a doctor diagnosed this?", ["diagnosis"]],
];

test("ordinary questions pass: \"are you often …?\", a day or two, the amount of sweat, whether it gets worse", () => {
  for (const q of PASS) assert.deepEqual(lintQuestion(q), [], q);
});

test("a question that names a pattern, a formula or a herb, gives an amount, labels the person or uses the app's forbidden wording fails, with the rule's id", () => {
  for (const [q, ids] of FAIL) assert.deepEqual(lintQuestion(q), [...ids].sort(), q);
});

test("full-width forms are folded first: ３克 is an amount", () => {
  assert.deepEqual(lintQuestion("每次３克嗎？"), ["amount"]);
});

test("the mock's own questions pass, in every language", () => {
  for (const [topic, byLang] of Object.entries(MOCK_QUESTIONS)) for (const [lang, q] of Object.entries(byLang)) assert.deepEqual(lintQuestion(q), [], `${topic} ${lang}`);
});
