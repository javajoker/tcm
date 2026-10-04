// S20 Developer inspector (docs/tech-spec.md §8.6): dev profile only — the module is imported behind a compile-time profile check, so a release build contains none of it.
// It shows how the engine reached a result: the matched policy cells, every pattern's evidence, the panel, the formula fits, every safety rule, and the parameters
// (editable: a live edit recomputes and is never persisted). Strings are developer-facing and deliberately not localised.
import { useMemo, useState, type ReactNode } from "react";
import * as engine from "@tcm/engine";
import type { Assessment } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import { ELEMENTS } from "@tcm/wuxing";
import { assessInputOf } from "../app/assessment.ts";
import { NeedsKnowledge, useLoaded } from "../app/knowledge.tsx";
import { useApp } from "../app/store.tsx";
import { usePageTitle } from "../app/usePageTitle.ts";
import { Button, Tabs } from "../ui/index.ts";

const f1 = (n: number): string => (Math.round(n * 100) / 100).toString();
const th = { textAlign: "start", padding: "0.25rem 0.5rem", borderBottom: "2px solid var(--border-strong)", whiteSpace: "nowrap" } as const;
const td = { padding: "0.25rem 0.5rem", borderBottom: "1px solid var(--border)", verticalAlign: "top" } as const;

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }): ReactNode {
  return (
    <div style={{ overflowX: "auto", marginBottom: "var(--space-4)" }}>
      <table style={{ width: "100%", fontSize: "0.85rem" }}>
        <caption style={{ textAlign: "start", fontWeight: 600 }}>{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col" style={th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function PolicyTab({ a }: { a: Assessment }): ReactNode {
  return (
    <>
      <p>Effective level <strong>{a.policy.level}</strong> · notice <strong>{a.policy.notice}</strong> · enforcement <code>{a.policy.safetyEnforcement}</code> · flow <code>{a.policy.flow}</code></p>
      <Table caption="Matched cells" head={["dimension", "key", "level", "notice"]} rows={a.policy.matched.map((m) => [m.dimension, m.key, m.level, m.notice])} />
      <Table caption="Notices" head={["id", "kind", "cell", "reasons"]} rows={a.policy.notices.map((n) => [n.id, n.kind, `${n.cell.dimension}.${n.cell.key}`, n.reasons.join(", ")])} />
      <p>Features: <code>{JSON.stringify(a.policy.features)}</code></p>
    </>
  );
}

function ScoresTab({ a, kb }: { a: Assessment; kb: KnowledgeBase }): ReactNode {
  return (
    <>
      <Table caption="Patterns (all, best first)" head={["id", "name", "Pct", "band", "Σ+", "Σ−", "max", "required"]}
        rows={a.patterns.map((p) => [p.id, kb.patternById.get(p.id)?.name.en ?? "", f1(p.pct), p.band, f1(p.positive), f1(p.negative), f1(p.maxScore), String(p.requiredPresent)])} />
      {a.patterns.filter((p) => p.pct > 0).slice(0, 5).map((p) => (
        <details key={p.id}>
          <summary>{p.id} — evidence ({p.evidence.length}) and against ({p.against.length})</summary>
          <Table caption={`${p.id} evidence`} head={["symptom", "w", "sev", "q", "contribution"]} rows={p.evidence.map((e) => [e.symptomId, f1(e.weight), f1(e.sev), f1(e.q), f1(e.contribution)])} />
          {p.against.length > 0 ? <Table caption={`${p.id} against`} head={["symptom", "penalty"]} rows={p.against.map((x) => [x.symptomId, f1(x.penalty)])} /> : null}
        </details>
      ))}
      <p>Verdict: <strong>{a.verdict.status}</strong> · confidence <strong>{a.verdict.confidence}</strong> <code>{JSON.stringify(a.verdict.confidenceInputs)}</code> · lowered {a.verdict.lowered.join(",") || "—"}</p>
    </>
  );
}

function PanelTab({ a }: { a: Assessment }): ReactNode {
  const p = a.panel;
  return (
    <>
      <Table caption="W and offsets" head={["element", "W", "primary", "personal", "alignment"]}
        rows={ELEMENTS.map((e) => [e, f1(p.wuxingFunction[e]), f1(p.offsetPopulation[e]), p.offsetPersonal ? f1(p.offsetPersonal[e]) : "—", p.alignment?.[e] ?? "—"])} />
      <Table caption="Observed panel" head={["dimension", "value", "from"]} rows={Object.entries(p.observed).map(([k, v]) => [k, f1(v), (p.projections[k] ?? []).map((x) => `${x.patternId}(${f1(x.value)})`).join(" ")])} />
      <p>八綱 <code>{JSON.stringify(p.bagang)}</code></p>
      <Table caption="Transmission rules" head={["rule", "from", "to", "amount", "citation"]} rows={p.transmission.rules.map((r) => [r.rule, r.from, r.to, f1(r.amount), r.citation])} />
    </>
  );
}

function FormulasTab({ a, kb, input }: { a: Assessment; kb: KnowledgeBase; input: engine.AssessInput }): ReactNode {
  const fits = useMemo(() => {
    const n = engine.normalize(kb, { findings: input.findings, sex: input.subject.sex, pregnancy: input.subject.pregnancy, ...(input.context ? { context: input.context } : {}) });
    return engine.fitFormulas(kb, a.panel.observed, n, new Set(kb.formulas.keys())).slice(0, 20);
  }, [a, kb, input]);
  const shown = new Set([...a.recommendations.formulas, ...a.recommendations.studyOnly].map((f) => f.id));
  return (
    <>
      <Table caption="Fits of every formula (top 20 by explained fraction)" head={["id", "name", "tier", "k*", "explained", "coreFit", "shown", "tier reasons"]}
        rows={fits.map((f) => [f.id, kb.formulas.get(f.id)?.name.en ?? "", f.tier, f1(f.k), f1(f.explained), f1(f.coreFit), shown.has(f.id) ? "yes" : "", (kb.formulas.get(f.id)?.tier_reasons ?? []).join("; ")])} />
      <Table caption="Suppressed" head={["kind", "id", "reason", "rule"]} rows={a.suppressed.map((s) => [s.kind, s.id, s.reason, s.ruleId ?? ""])} />
    </>
  );
}

function SafetyTab({ a, kb }: { a: Assessment; kb: KnowledgeBase }): ReactNode {
  const fired = new Map<string, string[]>();
  const note = (id: string, who: string): void => { fired.set(id, [...(fired.get(id) ?? []), who]); };
  for (const f of [...a.recommendations.formulas, ...a.recommendations.studyOnly]) for (const r of f.annotations) note(r.ruleId, f.id);
  for (const x of a.recommendations.foods) for (const r of x.annotations) note(r.ruleId, x.name);
  for (const x of a.recommendations.acupoints) for (const r of x.annotations) note(r.ruleId, x.name);
  for (const s of a.suppressed) if (s.ruleId) note(s.ruleId, `${s.kind}:${s.id} (removed)`);
  return (
    <Table caption={`All ${kb.safety.rules.length} safety rules`} head={["id", "severity", "applies to", "target", "fired for"]}
      rows={kb.safety.rules.map((r) => [r.id, r.severity, JSON.stringify(r.applies_to), JSON.stringify(r.target), (fired.get(r.id) ?? []).join(", ") || "—"])} />
  );
}

function ParamsTab({ kb, text, setText, error, apply, reset }: { kb: KnowledgeBase; text: string; setText: (s: string) => void; error: string | null; apply: () => void; reset: () => void }): ReactNode {
  return (
    <>
      <p>The loaded <code>scoring-params.json</code> ({kb.params._meta.status}). Edits recompute the result at once and are <strong>never persisted</strong>.</p>
      <textarea aria-label="scoring parameters (JSON)" value={text} onChange={(e) => setText(e.currentTarget.value)} spellCheck={false} style={{ width: "100%", minHeight: "20rem", fontFamily: "monospace", fontSize: "0.8rem" }} />
      {error ? <p role="alert" style={{ color: "var(--danger-text)" }}>{error}</p> : null}
      <p style={{ display: "flex", gap: "var(--space-3)" }}><Button variant="primary" onClick={apply}>Apply</Button><Button onClick={reset}>Reset to the loaded values</Button></p>
    </>
  );
}

function CaseTab({ input, a }: { input: engine.AssessInput; a: Assessment }): ReactNode {
  const skeleton = {
    name: "golden-case-skeleton",
    input: { subject: input.subject, redFlags: [...input.redFlags], findings: input.findings, context: input.context ?? {}, constitutionAnswers: input.constitutionAnswers ?? null },
    expect: { patterns: a.patterns.slice(0, 3).map((p) => ({ id: p.id, pct: Math.round(p.pct * 10) / 10 })), verdict: { status: a.verdict.status, confidence: a.verdict.confidence }, level: a.policy.level, formulas: a.recommendations.formulas.map((f) => f.id) },
  };
  const text = JSON.stringify(skeleton, null, 2);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <p>The current input and what the engine made of it, as the skeleton of a golden case. It contains health data: keep it out of public places.</p>
      <p><Button onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)); }}>Copy</Button> {copied ? <span role="status">Copied.</span> : null}</p>
      <pre style={{ overflow: "auto", maxHeight: "24rem", background: "var(--surface)", border: "1px solid var(--border)", padding: "var(--space-3)" }}>{text}</pre>
    </>
  );
}

function Inspector(): ReactNode {
  const { kb: loadedKb } = useLoaded();
  const draft = useApp((s) => s.draft);
  const [tab, setTab] = useState("policy");
  const [paramsText, setParamsText] = useState(() => JSON.stringify(loadedKb.params, null, 2));
  const [edited, setEdited] = useState<KnowledgeBase["params"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kb: KnowledgeBase = useMemo(() => (edited === null ? loadedKb : { ...loadedKb, params: edited }), [loadedKb, edited]);

  const [now] = useState(() => Date.now());
  const input = useMemo(() => (draft === null ? null : assessInputOf(draft, now)), [draft, now]);
  const a = useMemo(() => (input === null ? null : engine.assess(kb, input)), [kb, input]);

  if (draft === null || input === null || a === null) {
    return <><h1>Developer inspector</h1><p>There is no complete draft to inspect. Fill in the profile (and the inquiry) first; the inspector reads the current draft and recomputes live.</p></>;
  }
  return (
    <>
      <h1>Developer inspector</h1>
      <p>Draft <code>{draft.id}</code> · KB <code>{loadedKb.version.slice(0, 12)}</code> · profile <code>{kb.profile}</code>{edited ? <strong> · parameters edited (not saved)</strong> : null}</p>
      <Tabs label="Inspector sections" value={tab} onChange={setTab} tabs={[
        { id: "policy", label: "Policy", panel: <PolicyTab a={a} /> },
        { id: "scores", label: "Scores", panel: <ScoresTab a={a} kb={kb} /> },
        { id: "panel", label: "Panel", panel: <PanelTab a={a} /> },
        { id: "formulas", label: "Formulas", panel: <FormulasTab a={a} kb={kb} input={input} /> },
        { id: "safety", label: "Safety", panel: <SafetyTab a={a} kb={kb} /> },
        { id: "params", label: "Params", panel: <ParamsTab kb={kb} text={paramsText} setText={setParamsText} error={error}
          apply={() => { try { setEdited(paramsText === JSON.stringify(loadedKb.params, null, 2) ? null : JSON.parse(paramsText) as KnowledgeBase["params"]); setError(null); } catch (e) { setError(`Not valid JSON: ${(e as Error).message}`); } }}
          reset={() => { setEdited(null); setParamsText(JSON.stringify(loadedKb.params, null, 2)); setError(null); }} /> },
        { id: "case", label: "Case", panel: <CaseTab input={input} a={a} /> },
      ]} />
    </>
  );
}

export default function InspectorPage(): ReactNode {
  usePageTitle(null);
  return <NeedsKnowledge><Inspector /></NeedsKnowledge>;
}
