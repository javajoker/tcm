// What a confirmed suggestion becomes (PM-50; docs/post-mvp/design/ai-assisted-intake.md §4): a finding of the draft with the quality of a guided self-observation (`source: "guided"`,
// 0.7) — never higher, whatever the model's confidence — recorded exactly as the manual steps record it, so that the same finding is the same finding by whichever way it came:
// the tongue's colour, shape and coating answer their whole category (the others of it become "absent"), a sign or a zone feature is present; the face's colour and lips are present, and
// what cannot go with it (the knowledge base's exclusive groups) is no longer present. Only what the person confirmed is passed in.
import type { Finding } from "@tcm/engine";
import type { ObserveModule } from "@tcm/ai";
import type { KnowledgeBase } from "@tcm/kb";
import type { Draft } from "../../storage/types.ts";
import { answerCategory, categoryState, setSign, type TongueCategory } from "../../screens/observe/model.ts";
import { toggleExclusive } from "../../screens/observe/exclusive.ts";

const WHOLE: readonly TongueCategory[] = ["body", "shape", "coat"];

/** The knowledge base's exclusive groups as lists of ids. */
const groupsOf = (kb: KnowledgeBase): (readonly string[])[] => kb.exclusions.groups.filter((g) => g.kind === "exclusive").map((g) => g.symptoms);

function withTongue(d: Draft, kb: KnowledgeBase, ids: readonly string[]): Draft {
  const groups = groupsOf(kb);
  let next = d;
  for (const category of WHOLE) {
    const mine = ids.filter((id) => kb.tongue.features.find((f) => f.id === id)?.category === category);
    if (mine.length === 0) continue;
    let chosen = categoryState(next, kb, category).chosen;
    for (const id of mine) chosen = toggleExclusive(chosen, id, true, groups).next;
    next = answerCategory(next, kb, category, { kind: "chosen", ids: chosen });
  }
  for (const id of ids) {
    const f = kb.tongue.features.find((x) => x.id === id);
    if (f === undefined || (WHOLE as readonly string[]).includes(f.category)) continue;
    // a sign that cannot go with one already noted (the central crack and the cracks over the whole tongue) replaces it
    const clash = groups.find((g) => g.includes(id));
    if (clash !== undefined) for (const other of clash) if (other !== id && next.findings[other]?.state === "present") next = setSign(next, other, false);
    next = setSign(next, id, true);
  }
  return next;
}

function withFace(d: Draft, kb: KnowledgeBase, ids: readonly string[]): Draft {
  const groups = groupsOf(kb);
  const findings: Record<string, Finding> = { ...d.findings };
  for (const id of ids) {
    for (const g of groups) if (g.includes(id)) for (const other of g) if (other !== id && findings[other]?.state === "present") findings[other] = { state: "absent", source: "guided" };
    findings[id] = { state: "present", source: "guided" };
  }
  return { ...d, findings };
}

/** The draft with these confirmed features recorded. */
export function withObserved(d: Draft, kb: KnowledgeBase, module: ObserveModule, ids: readonly string[]): Draft {
  return module === "tongue" ? withTongue(d, kb, ids) : withFace(d, kb, ids);
}

/** Takes back one confirmed feature: a tongue's colour, shape or coating returns to unanswered (the whole category, as it was answered); a sign, a zone feature or a face feature is no longer recorded. */
export function withoutObserved(d: Draft, kb: KnowledgeBase, module: ObserveModule, id: string): Draft {
  if (module === "tongue") {
    const category = kb.tongue.features.find((f) => f.id === id)?.category;
    if (category !== undefined && (WHOLE as readonly string[]).includes(category)) return answerCategory(d, kb, category as TongueCategory, { kind: "clear" });
    return setSign(d, id, false);
  }
  return { ...d, findings: Object.fromEntries(Object.entries(d.findings).filter(([k]) => k !== id)) };
}
