// What one photo sends (docs/privacy.md §6 rule 7; impact assessment §3): the picture, the module's own features in the session's language and the knowledge base's exclusive groups
// among them. This module builds the one request and is given nothing else — never the profile, birth data, notes or the history, and not what the person has already answered (a
// test sends a draft full of marked values and finds none of them).
import { PROTOCOL } from "@tcm/ai";
import type { Lang, ObserveBody, ObserveItem, ObserveModule } from "@tcm/ai";
import type { KnowledgeBase } from "@tcm/kb";
import { toBase64 } from "./capture.ts";

/** The face features a photo can show: the complexion's and the lips' (the nails and the skin's dryness are not in a face photo). */
export const FACE_FEATURES: readonly { readonly id: string; readonly group: "complexion" | "lips" }[] = [
  { id: "S_FACE_SALLOW", group: "complexion" }, { id: "S_FACE_PALE", group: "complexion" }, { id: "S_FACE_RED", group: "complexion" }, { id: "S_FACE_DARK", group: "complexion" },
  { id: "S_LIPS_NAILS_PALE", group: "lips" }, { id: "S_LIPS_PURPLE", group: "lips" },
];

/** The sublingual veins need another view (the tongue lifted), not the top of the tongue. */
const NEEDS_ANOTHER_VIEW = new Set(["T_SUBLINGUAL_VEINS"]);

/** The features of a module in the session's language, from the loaded knowledge base. The tongue's zones and signs follow the profile's flags, as in the manual steps. */
export function observeVocabulary(kb: KnowledgeBase, module: ObserveModule, lang: Lang): ObserveItem[] {
  const say = (t: { readonly "zh-Hant": string; readonly en?: string | null }): string => (lang === "en" ? (t.en ?? t["zh-Hant"]) : kb.zh(t["zh-Hant"]));
  if (module === "face") {
    return FACE_FEATURES.flatMap((f) => {
      const s = kb.symptoms.get(f.id);
      return s === undefined ? [] : [{ id: f.id, label: say(s), group: f.group }];
    });
  }
  const flags = kb.config.profile.tongue_pulse;
  return kb.tongue.features
    .filter((f) => !NEEDS_ANOTHER_VIEW.has(f.id) && (f.category === "body" || f.category === "shape" || f.category === "coat" || (f.category === "special" ? flags.tongue_special_signs : flags.tongue_zones)))
    .map((f) => ({ id: f.id, label: say(f.name), group: f.category }));
}

/** The knowledge base's exclusive groups, within a vocabulary (two or more of its ids). */
export function exclusiveWithin(kb: KnowledgeBase, vocabulary: readonly ObserveItem[]): string[][] {
  const ids = new Set(vocabulary.map((v) => v.id));
  return kb.exclusions.groups.filter((g) => g.kind === "exclusive").map((g) => g.symptoms.filter((id) => ids.has(id))).filter((g) => g.length >= 2);
}

/** The body of the request; the module is the route's (`/v1/observe/<module>`), not the body's. */
export function buildObserveRequest(input: { readonly lang: Lang; readonly jpeg: Uint8Array; readonly vocabulary: readonly ObserveItem[]; readonly exclusive: readonly (readonly string[])[] }): ObserveBody {
  return {
    v: PROTOCOL,
    lang: input.lang,
    image: { type: "image/jpeg", data: toBase64(input.jpeg) },
    vocabulary: input.vocabulary.map((v) => ({ id: v.id, label: v.label, group: v.group })),
    exclusive: input.exclusive.map((g) => [...g]),
  };
}
