// The practitioner reference (PM-65): the report of a computed case, in Markdown, in the practitioner's language. Its body is the app's own practitioner summary and
// medication plan (summaryModel.ts, prescription/summary.ts) — the same model the app prints, in the practitioner's voice — framed by what only the reference says:
// what the safety policy allowed and why, the recommended formula with its reasoning and source, what to note about each herb, the other formulas, and the questions
// that would raise the confidence. Nothing here computes: the result and the plan are shown as the engine made them.
import type { KnowledgeBase } from "@tcm/kb";
import type { MessageKey } from "../i18n/catalogs.ts";
import type { RxKey } from "../prescription/catalog.ts";
import { prescriptionFile, prescriptionSection } from "../prescription/summary.ts";
import { buildSummary, seasonsSentence, type SummarySection } from "../screens/result/summaryModel.ts";
import { ROLE_SLUG, SCHOOL_SLUG, tierReason } from "../screens/result/words.ts";
import type { PractitionerRun } from "./run.ts";
import { wordsOf, type PKey } from "./words.ts";

/** The sections of the app's summary the reference keeps: the case and the reading of it (not what the app showed its user, nor the notices it acknowledged). */
const KEPT = ["person", "meds", "symptoms", "observations", "panel", "hypotheses", "change"] as const;
const LEVEL_RANK = { L0: 0, L1: 1, L2: 2, L3: 3 } as const;
const GRADE: Readonly<Record<string, string>> = { 小毒: "small", 有毒: "toxic", 大毒: "great" };

/** A Markdown table cell: one line, no pipe. */
const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

function sectionMd(s: SummarySection, level = 2): string {
  const out = [`${"#".repeat(level)} ${s.title}`, ""];
  for (const [a, b] of s.facts ?? []) out.push(`- **${a}**: ${b}`);
  for (const x of s.items ?? []) out.push(`- ${x}`);
  if (s.table) {
    if ((s.facts ?? []).length > 0 || (s.items ?? []).length > 0) out.push("");
    out.push(`*${s.table.caption}*`, "", `| ${s.table.head.map(cell).join(" | ")} |`, `|${s.table.head.map(() => "---").join("|")}|`, ...s.table.rows.map((r) => `| ${r.map(cell).join(" | ")} |`));
  }
  return out.join("\n");
}

/** The report of a computed case (`run.status` is "ok"). */
export function reportOf(kb: KnowledgeBase, run: PractitionerRun): string {
  const saved = run.saved;
  if (run.status !== "ok" || saved === null) throw new Error("only a computed case has a report");
  const { t, rx, p } = wordsOf(run.lang);
  const k = (key: PKey, params?: Record<string, string | number>): string => p.t(key, params);
  const app = (key: string, params?: Record<string, string | number>): string => t.t(key as MessageKey, params);
  const sep = t.lang === "en" ? ", " : "、";
  const pct = (x: number): string => t.number(x, { style: "percent", maximumFractionDigits: 0 });
  const result = saved.result;
  const policy = result.policy;
  const out: string[] = [`# ${k("practitioner.title")}`, "", `> ${k("practitioner.intro")}`, ">", `> ${k("practitioner.draft")}`];

  // ── what the safety policy allowed, and why ───────────────────────────────
  const safety: string[] = [];
  const limiting = policy.matched.filter((c) => c.level === policy.level && LEVEL_RANK[c.level] < 3);
  // the limiting cells in words; the two cells of medicines are one reason, with the classes and the names the practitioner gave
  const meds = run.case?.person.medications;
  const medicines = [...(meds?.status === "some" ? (meds.classes ?? []).map((m) => app(`intake.profile.meds.${m}`)) : []), ...(meds?.status === "some" ? meds.named ?? [] : [])];
  const isMedicine = (c: (typeof policy.matched)[number]): boolean => c.key === "on_other_interacting_medication" || c.key === "on_anticoagulant";
  const reasons = (): string => {
    const words = limiting.filter((c) => !isMedicine(c)).map((c) => k(`practitioner.cell.${c.dimension}.${c.key}` as PKey));
    if (limiting.some(isMedicine)) words.push(medicines.length > 0 ? k("practitioner.cell.medicines", { list: medicines.join(sep) }) : k(`practitioner.cell.condition.${limiting.find(isMedicine)!.key}` as PKey));
    return words.join(sep) || "—";
  };
  /** A message of the knowledge base in the report's language (names keep their Chinese in English; messages do not need it). */
  const said = (m: { readonly "zh-Hant": string; readonly en: string | null }): string => (t.lang === "en" && m.en ? m.en : t.zh(m["zh-Hant"]));
  safety.push(policy.level === "L3" ? k("practitioner.level.L3") : k(`practitioner.level.${policy.level}` as PKey, { reasons: reasons() }));
  const flags = (level: "A" | "B"): string[] => kb.redFlags.filter((f) => f.level === level && saved.input.redFlags.includes(f.id)).map((f) => said(f.text));
  for (const level of ["A", "B"] as const) { const f = flags(level); if (f.length > 0) safety.push(k(`practitioner.redFlag.${level}` as PKey, { items: f.join(sep) })); }
  // what a safety rule removed (what the level leaves out is said by the line above)
  for (const s of result.suppressed) {
    if ((s.kind !== "formula" && s.kind !== "herb") || s.reason !== "rule") continue;
    const name = s.kind === "formula" ? t.localized(kb.formulas.get(s.id)?.name ?? { "zh-Hant": s.id, en: null }).text : t.localized(kb.herbs?.get(s.id)?.name ?? kb.herbName(s.id)?.name ?? { "zh-Hant": s.id, en: null }).text;
    safety.push(s.message ? k("practitioner.suppressed.rule", { name, why: said(s.message) }) : k("practitioner.suppressed.ruleBare", { name }));
  }
  if (result.quality.unmatchedAllergies.length > 0) safety.push(k("practitioner.allergy.unmatched", { names: result.quality.unmatchedAllergies.join(sep) }));
  if ((run.case?.unmapped ?? []).length > 0) safety.push(k("practitioner.unmapped", { items: run.case!.unmapped!.join(sep) }));
  out.push("", `## ${k("practitioner.safety.title")}`, "", ...safety.map((x) => `- ${x}`));

  // ── the case and its reading: the app's practitioner summary ──────────────
  for (const s of buildSummary(saved, kb, t)) if ((KEPT as readonly string[]).includes(s.id)) out.push("", sectionMd(s));

  // ── the recommended formula, its plan, and its herbs ──────────────────────
  const rec = result.recommendations.formulas.find((r) => !r.studyOnly) ?? null;
  const formula = rec ? kb.formulas.get(rec.id) ?? null : null;
  if (rec === null || formula === null) {
    // why there is none: the level, a safety rule that removed the formulas that fit, or no fit at all
    const removed = result.suppressed.some((s) => s.kind === "formula" && s.reason === "rule");
    out.push("", `## ${k("practitioner.formula.none.title")}`, "", k(policy.level === "L0" ? "practitioner.formula.none.level" : removed ? "practitioner.formula.none.removed" : "practitioner.formula.none.fit"));
  } else {
    const name = t.localized(formula.name).text;
    const facts = [
      k("practitioner.formula.principle", { text: t.lang === "en" ? formula.principle_en : t.zh(formula.principle) }),
      k("practitioner.formula.fit", { pct: pct(rec.fit.explained), strength: rx.t(`rx.factor.severity.${rec.strength}` as RxKey) }),
      k("practitioner.formula.tier", { school: app(`formula.school.${SCHOOL_SLUG[formula.school as keyof typeof SCHOOL_SLUG]}`), tier: app(`formula.tier.${rec.tier}`) }),
      ...formula.tier_reasons.map((r) => k("practitioner.formula.tierReason", { reason: tierReason(t, r) })),
      k("practitioner.formula.rationale", { text: t.lang === "en" ? formula.rationale_en : t.zh(formula.rationale_zh) }),
    ];
    const clause = kb.citation(formula.source.ref);
    facts.push(clause ? k("practitioner.formula.classic", { quote: t.zh(clause.quote_zh_hant), source: `《${t.zh(clause.book)}·${t.zh(clause.chapter)}》` }) : k("practitioner.formula.source", { source: t.zh(formula.source.book) }));
    out.push("", `## ${k("practitioner.formula.title", { name })}`, "", ...facts.map((x) => `- ${x}`));
    const plan = prescriptionSection(saved, kb, t, rx);
    if (plan !== null) out.push("", sectionMd(plan, 3));
    else {
      // no plan at this level: the formula's composition by role, as its page in Learn gives it to every reader
      const herbName = (id: string): string => t.localized(kb.herbs?.get(id)?.name ?? kb.herbName(id)?.name ?? { "zh-Hant": id, en: null }).text;
      const herbs = (["君", "臣", "佐", "使"] as const).map((r) => [r, formula.composition.filter((c) => c.role === r).map((c) => herbName(c.herb))] as const).filter(([, hs]) => hs.length > 0)
        .map(([r, hs]) => (t.lang === "en" ? `${r} ${app(`report.role.${ROLE_SLUG[r]}`)}: ${hs.join(sep)}` : `${r}：${hs.join(sep)}`)).join(t.lang === "en" ? "; " : "；");
      out.push(`- ${k("practitioner.formula.composition", { herbs })}`, "", `### ${rx.t("rx.title.study")}`, "", k(policy.features.modification ? "practitioner.plan.none" : "practitioner.plan.level", { reasons: reasons() }));
    }

    // what to note about each herb of the plan (or of the formula, when there is no plan): grade, pregnancy, interactions, the source's caution as written
    const ids = saved.prescription && saved.prescription.withheld === null ? saved.prescription.composition.map((r) => r.herb) : formula.composition.map((c) => c.herb);
    const notes = ids.flatMap((id) => {
      const h = kb.herbs?.get(id);
      if (h === undefined) return [];
      const marks = [
        ...(h.toxic ? [k(`practitioner.herb.grade.${GRADE[h.props.toxicity] ?? "toxic"}` as PKey)] : []),
        ...(h.pregnancy === "avoid" ? [app("learn.herb.mark.avoid")] : h.pregnancy === "caution" ? [app("learn.herb.mark.caution")] : []),
        ...(h.interactions.length > 0 ? [k("practitioner.herb.interactions", { list: h.interactions.map((i) => (t.has(`formula.interaction.${i}`) ? app(`formula.interaction.${i}`) : i)).join(sep) })] : []),
      ];
      const caution = h.caution && h.caution.trim().length > 0 ? k("practitioner.herb.caution", { text: h.caution }) : "";
      if (marks.length === 0 && caution === "") return [];
      return [`**${t.localized(h.name).text}**${t.lang === "en" ? ": " : "："}${[marks.join(sep), caution].filter((x) => x !== "").join(t.lang === "en" ? "; " : "；")}`];
    });
    if (notes.length > 0) out.push("", `### ${k("practitioner.herbs.title")}`, "", ...notes.map((x) => `- ${x}`));
  }

  // ── the other formulas the result recommends, and those it lists for study ─
  const others = [...result.recommendations.formulas.filter((r) => r !== rec), ...result.recommendations.studyOnly].map((r) => {
    const f = kb.formulas.get(r.id);
    const nm = f ? t.localized(f.name).text : r.id;
    return r.studyOnly ? k("practitioner.others.study", { name: nm, pct: pct(r.fit.explained) }) : k("practitioner.others.item", { name: nm, tier: app(`formula.tier.${r.tier}`), pct: pct(r.fit.explained) });
  });
  if (others.length > 0) out.push("", `## ${k("practitioner.others.title")}`, "", ...others.map((x) => `- ${x}`));

  // ── the questions that would raise the confidence ─────────────────────────
  // (not when a red flag, a population or a serious condition holds the case: more answers would not change that)
  const next = run.next;
  const blocked = policy.matched.some((c) => c.level === "L0" && c.dimension !== "state");
  if (next !== null && next.done === null && next.suggestions.length > 0 && !blocked) {
    const pattern = (id: string): string => t.localized(kb.patternById.get(id)?.name ?? { "zh-Hant": id, en: null }).text;
    const sym = (id: string): string => { const s = kb.symptoms.get(id); return s ? (t.lang === "en" ? s.en : t.zh(s["zh-Hant"])) : id; };
    // the inquiry's ranked questions: three when only the leading patterns are to be told apart, more while core questions are unanswered
    const items = next.suggestions.slice(0, next.remainingCore > 3 ? 8 : 3).map((s) => {
      const q = kb.questionById.get(s.questionId)!;
      const options = q.options.filter((o) => !o.none && o.symptoms.length > 0).map((o) => o.symptoms.map(sym).join("+")).join(t.lang === "en" ? " / " : "／");
      const why = s.reason.kind === "separates" ? k("practitioner.ask.separates", { a: pattern(s.reason.between[0]), b: pattern(s.reason.between[1]) }) : k("practitioner.ask.core");
      return k("practitioner.ask.item", { dimension: app(`intake.inquiry.dimension.${q.dimension}`), options, why });
    });
    out.push("", `## ${k("practitioner.ask.title")}`, "", k("practitioner.ask.intro", { coverage: pct(next.coverage), confidence: app(`report.confidence.${next.confidence}`) }), "", ...items.map((x) => `- ${x}`));
  }

  // ── provenance ────────────────────────────────────────────────────────────
  const date = t.date(run.at, { year: "numeric", month: "long", day: "numeric" });
  out.push("", "---", "", k("practitioner.footer", { date, engine: saved.engineVersion, kb: saved.kbVersion, params: saved.paramsFingerprint }));
  const seasons = seasonsSentence(saved, t);
  if (seasons !== "") out.push("", seasons);
  return `${out.join("\n")}\n`;
}

/** The case's result as data, for a caller that wants more than the text: the leading patterns, the level, the formula and the plan (the app's summary-file shape for the plan). */
export function dataOf(kb: KnowledgeBase, run: PractitionerRun): Record<string, unknown> {
  const saved = run.saved;
  if (run.status !== "ok" || saved === null) return { status: run.status, errors: run.errors, missing: run.missing };
  const r = saved.result;
  return {
    status: run.status, lang: run.lang, level: r.policy.level, notices: r.policy.notices.map((n) => n.id),
    patterns: r.patterns.slice(0, 3).map((x) => ({ id: x.id, name: kb.patternById.get(x.id)?.name ?? null, pct: Math.round(x.pct * 10) / 10, band: x.band })),
    confidence: r.verdict.confidence,
    formulas: r.recommendations.formulas.map((f) => ({ id: f.id, tier: f.tier, explained: Math.round(f.fit.explained * 1000) / 1000, studyOnly: f.studyOnly })),
    studyOnly: r.recommendations.studyOnly.map((f) => f.id),
    plan: saved.prescription ? prescriptionFile(saved.prescription, kb) : null,
    next: run.next === null ? null : { done: run.next.done, coverage: run.next.coverage, questions: run.next.suggestions.map((s) => s.questionId) },
    version: { engine: saved.engineVersion, kb: saved.kbVersion, params: saved.paramsFingerprint },
  };
}
