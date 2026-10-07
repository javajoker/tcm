// The device's red-flag check (design §4): every red flag of the screening is found by its own words in three languages; the app's own words for an ordinary complaint find none;
// negations are not read. The words are data (data/safety/red-flag-terms.json) and a draft for the physician and the second reviewer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { matchRedFlags } from "../src/index.ts";
import { RED_FLAG_TERMS } from "../src/generated/redflags.ts";
import { MOCK_QUESTIONS } from "../src/mock.ts";
import { TRADITIONAL_ONLY, vocabulary } from "./fixtures.ts";

const flags = (JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "data", "diagnosis", "red-flags.json"), "utf8")) as { items: { id: string; level: string }[] }).items;
const ids = (text: string): string[] => matchRedFlags(text).map((m) => m.id);

test("every red flag but the minor's has words, with its level; each of its words finds it, in every language", () => {
  assert.deepEqual(RED_FLAG_TERMS.items.map((i) => i.id), flags.filter((f) => f.id !== "RF_C_MINOR").map((f) => f.id));
  for (const item of RED_FLAG_TERMS.items) {
    assert.equal(item.level, flags.find((f) => f.id === item.id)!.level);
    for (const lang of ["zh-Hant", "zh-Hans", "en"] as const) {
      if (item.level !== "C") assert.ok(item.terms[lang].length > 0, `${item.id} ${lang}`);
      for (const t of item.terms[lang]) assert.ok(ids(typeof t === "string" ? t : t.join("，")).includes(item.id), `${item.id} ${lang} ${JSON.stringify(t)}`);
    }
  }
});

test("the Simplified words are Simplified", () => {
  for (const item of RED_FLAG_TERMS.items) for (const t of item.terms["zh-Hans"].flat()) assert.deepEqual([...t].filter((c) => TRADITIONAL_ONLY.includes(c)), [], `${item.id} ${t}`);
});

test("known messages", () => {
  const cases: [string, string[]][] = [
    ["最近胸口很緊，還冒冷汗", ["RF_A_CHEST_PAIN"]],
    ["我想死，活不下去了", ["RF_A_SELF_HARM"]],
    ["I passed out yesterday", ["RF_A_CONSCIOUSNESS"]],
    ["Can’t breathe at night", ["RF_A_DYSPNEA"]],
    ["呼吸困难", ["RF_A_DYSPNEA"]],
    ["發燒到 ３９ 度", ["RF_B_HIGH_FEVER"]],
    ["fever for 3 days", ["RF_B_HIGH_FEVER"]],
    ["大便是黑色的，像柏油，黑便", ["RF_A_BLEEDING"]],
    ["我懷孕了", ["RF_C_PREGNANT"]],
    ["我怀孕了，在哺乳", ["RF_C_PREGNANT", "RF_C_LACTATING"]],
    ["tight chest and a cold sweat", ["RF_A_CHEST_PAIN"]],
  ];
  for (const [text, want] of cases) assert.deepEqual(ids(text), want, text);
  assert.deepEqual(matchRedFlags("我懷孕了"), [{ id: "RF_C_PREGNANT", level: "C" }]);
});

test("the app's own words for ordinary complaints, and the mock's questions, find nothing: 胸悶 alone, a headache, heatstroke", () => {
  for (const lang of ["zh-Hant", "zh-Hans", "en"] as const) {
    for (const v of vocabulary(lang)) for (const t of [v.label, ...(v.plain ?? [])]) assert.deepEqual(ids(t), [], `${v.id} ${t}`);
    for (const q of Object.values(MOCK_QUESTIONS)) assert.deepEqual(ids(q[lang]), [], q[lang]);
  }
  for (const t of ["最近頭很痛，有點怕風，手腳冰冷", "胸悶，像有東西壓著", "I have a headache and feel tired", "heatstroke last summer", "chest tightness after climbing stairs"]) assert.deepEqual(ids(t), [], t);
});

test("a negation is not read: the screening asks again", () => {
  assert.deepEqual(ids("沒有胸痛"), ["RF_A_CHEST_PAIN"]);
  assert.deepEqual(ids("I don't have chest pain"), ["RF_A_CHEST_PAIN"]);
});
