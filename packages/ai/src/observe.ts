// The observation of the tongue and the face by photo (task PM-50; docs/post-mvp/design/ai-assisted-intake.md §1, §3, §4): what crosses the gateway is checked here, as for the
// conversation (validate.ts). A request is a JPEG without metadata and the module's features; a reply is DATA — whether the photo can be read and the features the model thinks it
// sees, from the request's own vocabulary and no other, at most one of each exclusive group, each with a confidence. Nothing else gets through; the person looks at their own photo
// and confirms each one, and a confirmed one enters at the quality of a guided self-observation (0.7), never higher.
import { bytesFromBase64, inspectJpeg } from "./image.ts";
import { LANGS, LIMITS, PROTOCOL } from "./protocol.ts";
import type { DropReason, Lang, Limits, ObserveItem, ObserveModule, ObserveReply, ObserveRequest, Suggestion } from "./protocol.ts";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isString = (x: unknown): x is string => typeof x === "string";

const ID = /^[A-Z][A-Z0-9_]{1,63}$/;
const GROUP = /^[a-z][a-z-]{1,31}$/;

/** Below this a suggestion is dropped: a feature the model is hardly sure of is not worth the person's attention. The model's confidences are not calibrated (the spike's protocol asks for that before any public use). */
export const OBSERVE_FLOOR = 0.3;

export type ObserveParse = { readonly ok: true; readonly request: ObserveRequest } | { readonly ok: false; readonly error: "bad-request" | "image" };
const bad = (error: "bad-request" | "image"): ObserveParse => ({ ok: false, error });

/** The request for `module`, rebuilt from what passes: a shape and a vocabulary that fit the limits, and a photo that is a metadata-free JPEG of a plausible size. */
export function parseObserveRequest(raw: unknown, module: ObserveModule, limits: Limits = LIMITS): ObserveParse {
  if (!isRecord(raw) || raw["v"] !== PROTOCOL || !LANGS.includes(raw["lang"] as Lang)) return bad("bad-request");
  const { image, vocabulary, exclusive } = raw;
  if (!isRecord(image) || image["type"] !== "image/jpeg" || !isString(image["data"])) return bad("bad-request");
  if (!Array.isArray(vocabulary) || vocabulary.length === 0 || vocabulary.length > limits.vocabulary) return bad("bad-request");
  if (exclusive !== undefined && (!Array.isArray(exclusive) || exclusive.length > limits.exclusiveGroups)) return bad("bad-request");

  const items: ObserveItem[] = [];
  const ids = new Set<string>();
  for (const v of vocabulary) {
    if (!isRecord(v) || !isString(v["id"]) || !ID.test(v["id"]) || ids.has(v["id"]) || !isString(v["label"]) || v["label"].length === 0 || v["label"].length > limits.labelChars) return bad("bad-request");
    if (!isString(v["group"]) || !GROUP.test(v["group"])) return bad("bad-request");
    ids.add(v["id"]);
    items.push({ id: v["id"], label: v["label"], group: v["group"] });
  }
  const groups: string[][] = [];
  for (const g of exclusive ?? []) {
    if (!Array.isArray(g) || g.length < 2 || g.length > limits.vocabulary || !g.every((id) => isString(id) && ids.has(id)) || new Set(g).size !== g.length) return bad("bad-request");
    groups.push([...(g as string[])]);
  }

  const data = image["data"];
  if (data.length > Math.ceil(limits.imageBytes / 3) * 4) return bad("image");
  const bytes = bytesFromBase64(data);
  if (bytes === null || bytes.length > limits.imageBytes) return bad("image");
  if (!inspectJpeg(bytes, limits.imageMinSide, limits.imageMaxSide).ok) return bad("image");
  return { ok: true, request: { v: PROTOCOL, lang: raw["lang"] as Lang, module, image: { type: "image/jpeg", data }, vocabulary: items, exclusive: groups } };
}

const REPLY_KEYS = new Set(["readable", "suggestions"]);
const SUGGESTION_KEYS = new Set(["id", "confidence"]);

export interface ValidatedObservation {
  readonly reply: ObserveReply;
  readonly dropped: readonly DropReason[];
}

/** The reply as the app may see it, built anew from what passes; `dropped` says what did not, in codes. Suggestions come most confident first. */
export function validateObservation(raw: unknown, request: ObserveRequest, limits: Limits = LIMITS): ValidatedObservation {
  const dropped: DropReason[] = [];
  const drop = (r: DropReason): void => void dropped.push(r);
  if (!isRecord(raw)) return { reply: { readable: false, suggestions: [] }, dropped: ["shape"] };
  if (Object.keys(raw).some((k) => !REPLY_KEYS.has(k))) drop("extra");
  if (typeof raw["readable"] !== "boolean") drop("shape");
  const readable = raw["readable"] === true;

  const vocabulary = new Set(request.vocabulary.map((v) => v.id));
  const clash = (a: string, b: string): boolean => request.exclusive.some((g) => g.includes(a) && g.includes(b));
  const rawSuggestions = raw["suggestions"] ?? [];
  if (!Array.isArray(rawSuggestions)) drop("shape");

  const seen: Suggestion[] = [];
  for (const s of Array.isArray(rawSuggestions) ? rawSuggestions : []) {
    if (!isRecord(s) || !isString(s["id"]) || typeof s["confidence"] !== "number") { drop("shape"); continue; }
    if (Object.keys(s).some((k) => !SUGGESTION_KEYS.has(k))) drop("extra");
    if (!readable) { drop("unreadable"); continue; }
    if (!vocabulary.has(s["id"])) { drop("unknown-id"); continue; }
    const confidence = s["confidence"];
    if (!Number.isFinite(confidence) || confidence < OBSERVE_FLOOR || confidence > 1) { drop("confidence"); continue; }
    const prior = seen.findIndex((x) => x.id === s["id"]);
    if (prior >= 0) {
      drop("duplicate");
      if (seen[prior]!.confidence >= confidence) continue;
      seen.splice(prior, 1);
    }
    seen.push({ id: s["id"], confidence });
  }

  // the most confident first; of two that cannot both be true, the more confident stays
  seen.sort((a, b) => b.confidence - a.confidence);
  const suggestions: Suggestion[] = [];
  for (const s of seen) {
    if (suggestions.some((x) => clash(x.id, s.id))) { drop("exclusive"); continue; }
    if (suggestions.length >= limits.proposals) { drop("too-many"); continue; }
    suggestions.push(s);
  }
  return { reply: { readable, suggestions: readable ? suggestions : [] }, dropped };
}
