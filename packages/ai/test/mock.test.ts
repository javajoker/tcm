// The mock provider: deterministic, within the protocol (the validator drops nothing), the person's own words as evidence, and the topics asked in the order of the ten questions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateReply } from "../src/index.ts";
import type { Lang } from "../src/index.ts";
import { MOCK_QUESTIONS, TOPIC_ORDER, mockTurn } from "../src/mock.ts";
import { TRADITIONAL_ONLY, asked, said, turn, vocabulary } from "./fixtures.ts";

const ids = (r: ReturnType<typeof mockTurn>) => r.proposals.map((p) => `${p.id}:${p.state}${p.severity !== undefined ? `:${p.severity}` : ""}`).sort();

test("Traditional: labels and plain phrasings, with 很 and 常常 left out, a negation and two grades", () => {
  const r = mockTurn(turn("zh-Hant", [said("最近頭很痛，有點怕風，手腳常常冰冷，睡著後出汗，不口苦")]));
  assert.deepEqual(ids(r), ["S_AVERSION_WIND:present:light", "S_BITTER_MOUTH:absent", "S_COLD_LIMBS:present", "S_HEADACHE:present:severe", "S_NIGHT_SWEAT:present"]);
  assert.deepEqual(r.proposals.find((p) => p.id === "S_HEADACHE")!.evidence, "最近頭很痛");
  assert.deepEqual(r.question, { text: MOCK_QUESTIONS["stool-urine"]!["zh-Hant"], topic: "stool-urine" }, "cold-heat, sweat and head-body are covered by the proposals");
});

test("Simplified and English", () => {
  assert.deepEqual(ids(mockTurn(turn("zh-Hans", [said("最近头很痛，有点怕风，睡着后出汗")]))), ["S_AVERSION_WIND:present:light", "S_HEADACHE:present:severe", "S_NIGHT_SWEAT:present"]);
  const en = mockTurn(turn("en", [said("I have a very bad headache and I do not have a sore throat. My hands and feet are often icy cold.")]));
  assert.deepEqual(ids(en), ["S_COLD_LIMBS:present", "S_HEADACHE:present:severe", "S_SORE_THROAT:absent"]);
});

test("a phrase two findings share proposes neither: 口渴 alone is left to the questions", () => {
  assert.deepEqual(mockTurn(turn("zh-Hant", [said("常常口渴")])).proposals, []);
});

test("only the last message of the person is read, and confirmed findings are not proposed again", () => {
  const r = mockTurn(turn("zh-Hant", [said("頭痛"), asked("會怕冷嗎？", "cold-heat"), said("手腳常常冰冷，頭痛")], ["S_HEADACHE"]));
  assert.deepEqual(ids(r), ["S_COLD_LIMBS:present"]);
});

test("the topics: asked once, in order; done when none is left", () => {
  const all = TOPIC_ORDER.filter((t) => vocabulary("zh-Hant").some((v) => v.topic === t));
  const messages = [said("你好")];
  const seen: string[] = [];
  for (let i = 0; i < all.length + 2; i++) {
    const r = mockTurn(turn("zh-Hant", messages));
    if (r.question === null) { assert.equal(r.done, true); break; }
    seen.push(r.question.topic!);
    messages.push(asked(r.question.text, r.question.topic), said("沒有特別的"));
  }
  assert.deepEqual(seen, all);
});

test("deterministic, and always within the protocol: the validator drops nothing, in every language", () => {
  const texts: Readonly<Record<Lang, string>> = { "zh-Hant": "頭很痛，有點怕風，吃完後肚子脹，不口苦，睡著後出汗", "zh-Hans": "头很痛，有点怕风，吃完后肚子胀，睡着后出汗", en: "I have a headache, I dislike wind or drafts, I do not feel bloated after eating." };
  for (const lang of ["zh-Hant", "zh-Hans", "en"] as const) {
    const req = turn(lang, [said(texts[lang])]);
    const a = mockTurn(req);
    assert.deepEqual(mockTurn(req), a);
    assert.ok(a.proposals.length >= 2, lang);
    assert.deepEqual(validateReply(a, req), { reply: a, dropped: [] }, lang);
  }
});

test("the Simplified questions are Simplified", () => {
  for (const [topic, q] of Object.entries(MOCK_QUESTIONS)) assert.deepEqual([...q["zh-Hans"]].filter((c) => TRADITIONAL_ONLY.includes(c)), [], topic);
  assert.ok(TRADITIONAL_ONLY.length > 500);
});
