// What crosses the gateway is checked here: a request against the protocol and its limits, a reply against the request it answers
// (docs/post-mvp/design/ai-assisted-intake.md §3, §4). A reply is data and nothing in it is trusted: a proposal must name a finding of the request's vocabulary that is not
// confirmed yet and quote the person's own words; the question must pass the wording lint; everything else is dropped, and only the reasons — codes — are reported.
import { LANGS, LIMITS, PROTOCOL, SEVERITIES } from "./protocol.ts";
import type { DropReason, Lang, Limits, Message, Proposal, Question, Severity, TurnReply, TurnRequest, VocabItem } from "./protocol.ts";
import { lintQuestion } from "./wording.ts";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isString = (x: unknown): x is string => typeof x === "string";

/** The text two quotations are compared on: compatibility forms folded, case ignored, spaces, punctuation and symbols removed. */
export const fold = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

const ID = /^[A-Z][A-Z0-9_]{1,63}$/;
const TOPIC = /^[a-z][a-z-]{1,31}$/;

/** A request as the app sent it, or null when it is not one: the wrong version or shape, or beyond the limits. */
export function parseTurnRequest(raw: unknown, limits: Limits = LIMITS): TurnRequest | null {
  if (!isRecord(raw) || raw["v"] !== PROTOCOL || !LANGS.includes(raw["lang"] as Lang)) return null;
  const { messages, vocabulary, confirmed } = raw;
  if (!Array.isArray(messages) || !Array.isArray(vocabulary) || !Array.isArray(confirmed)) return null;
  if (messages.length === 0 || messages.length > limits.messages || vocabulary.length === 0 || vocabulary.length > limits.vocabulary || confirmed.length > limits.vocabulary) return null;
  const outMessages: Message[] = [];
  let personChars = 0;
  for (const m of messages) {
    if (!isRecord(m) || (m["role"] !== "person" && m["role"] !== "assistant") || !isString(m["text"]) || m["text"].length > limits.messageChars) return null;
    if (m["topic"] !== undefined && (!isString(m["topic"]) || !TOPIC.test(m["topic"]))) return null;
    if (m["role"] === "person") personChars += m["text"].length;
    outMessages.push({ role: m["role"], text: m["text"], ...(isString(m["topic"]) ? { topic: m["topic"] } : {}) });
  }
  if (personChars > limits.personChars || outMessages.at(-1)!.role !== "person") return null;
  const outVocabulary: VocabItem[] = [];
  const ids = new Set<string>();
  for (const v of vocabulary) {
    if (!isRecord(v) || !isString(v["id"]) || !ID.test(v["id"]) || ids.has(v["id"]) || !isString(v["label"]) || v["label"].length === 0 || v["label"].length > limits.labelChars) return null;
    if (!isString(v["topic"]) || !TOPIC.test(v["topic"])) return null;
    const plain = v["plain"];
    if (plain !== undefined && (!Array.isArray(plain) || plain.length > limits.plainPerItem || !plain.every((p) => isString(p) && p.length > 0 && p.length <= limits.labelChars))) return null;
    ids.add(v["id"]);
    outVocabulary.push({ id: v["id"], label: v["label"], topic: v["topic"], ...(Array.isArray(plain) ? { plain: plain as string[] } : {}) });
  }
  if (!confirmed.every((c) => isString(c) && ids.has(c))) return null;
  return { v: PROTOCOL, lang: raw["lang"] as Lang, messages: outMessages, vocabulary: outVocabulary, confirmed: [...new Set(confirmed as string[])] };
}

const PROPOSAL_KEYS = new Set(["id", "state", "severity", "confidence", "evidence"]);
const QUESTION_KEYS = new Set(["text", "topic"]);
const REPLY_KEYS = new Set(["proposals", "question", "redFlag", "done"]);

export interface Validated {
  readonly reply: TurnReply;
  readonly dropped: readonly DropReason[];
}

/** The reply as the app may see it, built anew from what passes; `dropped` says what did not, in codes. */
export function validateReply(raw: unknown, request: TurnRequest, limits: Limits = LIMITS): Validated {
  const dropped: DropReason[] = [];
  const drop = (r: DropReason): void => void dropped.push(r);
  if (!isRecord(raw)) return { reply: { proposals: [], question: null, redFlag: false, done: false }, dropped: ["shape"] };
  if (Object.keys(raw).some((k) => !REPLY_KEYS.has(k))) drop("extra");

  const vocabulary = new Map(request.vocabulary.map((v) => [v.id, v]));
  const topics = new Set(request.vocabulary.map((v) => v.topic));
  const confirmed = new Set(request.confirmed);
  const said = request.messages.filter((m) => m.role === "person").map((m) => fold(m.text));

  const proposals: Proposal[] = [];
  const rawProposals = raw["proposals"] ?? [];
  if (!Array.isArray(rawProposals)) drop("shape");
  for (const p of Array.isArray(rawProposals) ? rawProposals : []) {
    if (!isRecord(p) || !isString(p["id"]) || !isString(p["evidence"]) || typeof p["confidence"] !== "number") { drop("shape"); continue; }
    if (Object.keys(p).some((k) => !PROPOSAL_KEYS.has(k))) drop("extra");
    const state = p["state"] ?? "present";
    if (state !== "present" && state !== "absent") { drop("shape"); continue; }
    if (!vocabulary.has(p["id"])) { drop("unknown-id"); continue; }
    if (confirmed.has(p["id"])) { drop("confirmed"); continue; }
    const confidence = p["confidence"];
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) { drop("confidence"); continue; }
    const evidence = p["evidence"].trim();
    const quoted = fold(evidence);
    if (evidence.length > limits.evidenceChars || quoted.length < 2 || !said.some((s) => s.includes(quoted))) { drop("no-evidence"); continue; }
    let severity: Severity | undefined;
    if (p["severity"] !== undefined) {
      if (state === "present" && SEVERITIES.includes(p["severity"] as Severity)) severity = p["severity"] as Severity;
      else drop("severity");
    }
    const prior = proposals.findIndex((x) => x.id === p["id"]);
    if (prior >= 0) {
      drop("duplicate");
      if (proposals[prior]!.confidence >= confidence) continue;
      proposals.splice(prior, 1);
    }
    proposals.push({ id: p["id"], state, ...(severity !== undefined ? { severity } : {}), confidence, evidence });
  }
  if (proposals.length > limits.proposals) {
    proposals.sort((a, b) => b.confidence - a.confidence);
    for (let i = limits.proposals; i < proposals.length; i++) drop("too-many");
    proposals.length = limits.proposals;
  }

  let question: Question | null = null;
  const q = raw["question"];
  if (q !== undefined && q !== null) {
    if (!isRecord(q) || !isString(q["text"]) || q["text"].trim() === "" || q["text"].length > limits.questionChars) drop("shape");
    else {
      if (Object.keys(q).some((k) => !QUESTION_KEYS.has(k))) drop("extra");
      const text = q["text"].trim();
      if (lintQuestion(text).length > 0) drop("wording");
      else {
        const topic = q["topic"];
        if (topic !== undefined && !(isString(topic) && topics.has(topic))) drop("topic");
        question = { text, ...(isString(topic) && topics.has(topic) ? { topic } : {}) };
      }
    }
  }

  for (const k of ["redFlag", "done"] as const) if (raw[k] !== undefined && typeof raw[k] !== "boolean") drop("shape");
  return { reply: { proposals, question, redFlag: raw["redFlag"] === true, done: raw["done"] === true }, dropped };
}
