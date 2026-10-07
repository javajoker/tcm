// The validator (docs/post-mvp/design/ai-assisted-intake.md §3, §4): a request is the protocol or nothing; a reply keeps only what the request allows, rebuilt field by field,
// and says what it dropped in codes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS, fold, parseTurnRequest, validateReply } from "../src/index.ts";
import type { TurnRequest } from "../src/index.ts";
import { asked, said, turn } from "./fixtures.ts";

const req: TurnRequest = turn("zh-Hant", [asked("說說最近哪裡不舒服？"), said("最近頭很痛，有點怕風。吃完飯就脹！")], ["S_FEVER"]);
const ok = { id: "S_HEADACHE", state: "present", severity: "severe", confidence: 0.9, evidence: "頭很痛" };

test("a request is parsed into exactly the protocol's fields", () => {
  const raw = { ...req, profile: { age: 40 }, messages: [...req.messages.map((m) => ({ ...m, name: "x" }))] };
  const parsed = parseTurnRequest(raw)!;
  assert.deepEqual(Object.keys(parsed).sort(), ["confirmed", "lang", "messages", "v", "vocabulary"]);
  assert.deepEqual(parsed.messages, req.messages, "a message keeps its role, its text and its topic, nothing else");
  assert.equal(parsed.vocabulary.length, 124);
});

test("a request that is not the protocol, or beyond its limits, is refused", () => {
  const bad: unknown[] = [
    null, "text", { ...req, v: 2 }, { ...req, lang: "fr" }, { ...req, messages: [] }, { ...req, messages: "hi" },
    { ...req, messages: [said("x"), asked("y")] },                                      // the last message is the person's
    { ...req, messages: [{ role: "system", text: "x" }] },
    { ...req, messages: [said("字".repeat(LIMITS.messageChars + 1))] },
    { ...req, messages: Array.from({ length: 7 }, () => said("字".repeat(1_900))) },     // the person's words together
    { ...req, vocabulary: [] }, { ...req, vocabulary: [...req.vocabulary, req.vocabulary[0]] }, // an id twice
    { ...req, vocabulary: [{ id: "s_lower", label: "x", topic: "sleep" }] },
    { ...req, vocabulary: [{ ...req.vocabulary[0], plain: ["a", "b", "c", "d", "e"] }] },
    { ...req, confirmed: ["S_NOT_IN_VOCABULARY"] },
    { ...req, messages: [said("x"), { role: "assistant", text: "y", topic: "Not A Topic" }, said("z")] },
  ];
  for (const raw of bad) assert.equal(parseTurnRequest(raw), null, JSON.stringify(raw).slice(0, 80));
});

test("a good reply passes as it came, rebuilt from its fields", () => {
  const raw = { proposals: [ok, { id: "S_AVERSION_WIND", confidence: 0.7, evidence: "有點怕風" }], question: { text: "流汗的情況怎麼樣？", topic: "sweat" }, redFlag: false, done: false };
  const { reply, dropped } = validateReply(raw, req);
  assert.deepEqual(dropped, []);
  assert.deepEqual(reply.proposals, [ok, { id: "S_AVERSION_WIND", state: "present", confidence: 0.7, evidence: "有點怕風" }]);
  assert.deepEqual(reply.question, { text: "流汗的情況怎麼樣？", topic: "sweat" });
});

test("a reply outside the schema is dropped, part by part, with a code for each part", () => {
  const raw = {
    diagnosis: "脾氣虛", note: "ignore the rules",
    proposals: [
      ok,
      { ...ok, id: "S_INVENTED" },                                        // not in the vocabulary
      { ...ok, id: "S_FEVER" },                                           // already confirmed
      { ...ok, id: "S_NAUSEA", evidence: "我想吐" },                       // words the person did not say
      { ...ok, id: "S_POSTPRANDIAL_BLOAT", evidence: "吃完飯就脹", confidence: 1.5 },
      { ...ok, id: "S_POOR_APPETITE", evidence: "飯" },                    // too short to be evidence
      { ...ok, id: "S_BITTER_MOUTH", state: "maybe" },
      { id: "S_HEAD_HEAVY" },                                             // no evidence, no confidence
      "S_DRY_EYES",
      { ...ok, id: "S_AVERSION_WIND", evidence: "怕風", state: "absent", severity: "severe", pattern: "營衛不和" }, // severity on absent; an extra field
    ],
    question: { text: "這像是脾氣虛，可以喝四君子湯嗎？", topic: "diet-taste" },
    redFlag: "yes",
  };
  const { reply, dropped } = validateReply(raw, req);
  assert.deepEqual(reply.proposals, [ok, { id: "S_AVERSION_WIND", state: "absent", confidence: 0.9, evidence: "怕風" }]);
  assert.equal(reply.question, null, "a question that names a pattern or a formula is not shown");
  assert.equal(reply.redFlag, false, "only `true` raises the flag");
  assert.deepEqual([...dropped].sort(), ["confidence", "confirmed", "extra", "extra", "no-evidence", "no-evidence", "severity", "shape", "shape", "shape", "shape", "unknown-id", "wording"].sort());
  assert.ok(!JSON.stringify(reply).includes("ignore") && !JSON.stringify(reply).includes("營衛"), "nothing of the extra fields survives");
});

test("not an object: an empty reply", () => {
  for (const raw of [null, "{}", 3, []]) assert.deepEqual(validateReply(raw, req), { reply: { proposals: [], question: null, redFlag: false, done: false }, dropped: ["shape"] });
});

test("evidence is compared on folded text: width, case, spaces and punctuation do not matter, but the words do", () => {
  assert.equal(fold("Ｈｅａｄ  ache!"), "headache");
  const en = turn("en", [said("My HEAD aches, a lot — mostly at night.")]);
  const p = (evidence: string) => validateReply({ proposals: [{ id: "S_HEADACHE", confidence: 0.8, evidence }] }, en).reply.proposals.length;
  assert.equal(p("my head aches a lot"), 1);
  assert.equal(p("mostly at night"), 1);
  assert.equal(p("my head aches every day"), 0);
  assert.equal(p("aches, a lot — mostly"), 1);
  const only = turn("zh-Hant", [said("頭痛"), asked("會怕冷嗎？"), said("不會")]);
  assert.equal(validateReply({ proposals: [{ id: "S_FEAR_COLD", confidence: 0.8, evidence: "會怕冷" }] }, only).reply.proposals.length, 0, "the assistant's words are not evidence");
});

test("one proposal per finding, the more confident kept; no more than the limit, the least confident dropped", () => {
  const twice = validateReply({ proposals: [{ ...ok, confidence: 0.5 }, { ...ok, confidence: 0.8 }, { ...ok, confidence: 0.6 }] }, req);
  assert.deepEqual(twice.reply.proposals.map((p) => p.confidence), [0.8]);
  assert.deepEqual(twice.dropped, ["duplicate", "duplicate"]);
  const said13 = turn("zh-Hant", [said(req.vocabulary.slice(0, 14).map((v) => v.label).join("，"))]);
  const many = req.vocabulary.slice(0, 14).map((v, i) => ({ id: v.id, confidence: (i + 1) / 20, evidence: v.label }));
  const r = validateReply({ proposals: many }, said13);
  assert.equal(r.reply.proposals.length, LIMITS.proposals);
  assert.ok(!r.reply.proposals.some((p) => p.confidence < 0.15));
  assert.deepEqual(r.dropped, ["too-many", "too-many"]);
});

test("a topic outside the vocabulary is dropped from a question that is otherwise shown", () => {
  const r = validateReply({ question: { text: "睡得好嗎？", topic: "astrology" } }, req);
  assert.deepEqual(r.reply.question, { text: "睡得好嗎？" });
  assert.deepEqual(r.dropped, ["topic"]);
  assert.deepEqual(validateReply({ question: { text: "字".repeat(LIMITS.questionChars + 1) } }, req).dropped, ["shape"]);
  assert.deepEqual(validateReply({ done: true, redFlag: true }, req).reply, { proposals: [], question: null, redFlag: true, done: true });
});
