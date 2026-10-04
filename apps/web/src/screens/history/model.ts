// The pure part of S16 compare (UX spec §4.13): what changed between two saved results.
import { ELEMENTS, type Element } from "@tcm/wuxing";
import type { Severity } from "@tcm/engine";
import type { SavedAssessment } from "../../storage/types.ts";

export interface RankRow { readonly rank: number; readonly earlier: string | null; readonly later: string | null }
export interface PanelRow { readonly element: Element; readonly earlier: number; readonly later: number; readonly change: number }
export interface Comparison {
  readonly earlier: SavedAssessment;
  readonly later: SavedAssessment;
  /** Top patterns of each result, by rank (ids). */
  readonly ranking: readonly RankRow[];
  readonly panel: readonly PanelRow[];
  readonly axes: { readonly coldHeat: readonly [number, number]; readonly deficiencyExcess: readonly [number, number] };
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly severity: readonly { readonly symptom: string; readonly from: Severity | null; readonly to: Severity | null }[];
  readonly profileChanged: boolean;
}

const present = (s: SavedAssessment): Map<string, Severity | null> => new Map(Object.entries(s.input.findings).filter(([, f]) => f.state === "present").map(([id, f]) => [id, f.severity ?? null]));
const TOP = 3;

/** Orders the two results by time (the older is "earlier") and lists the changes in patterns, panel, symptoms and profile. */
export function compare(a: SavedAssessment, b: SavedAssessment): Comparison {
  const [earlier, later] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
  const ids = (s: SavedAssessment): string[] => s.result.verdict.status === "established" ? s.result.verdict.patterns.slice(0, TOP).map((p) => p.id) : [];
  const ea = ids(earlier), la = ids(later);
  const ranking = Array.from({ length: Math.max(ea.length, la.length) }, (_, i): RankRow => ({ rank: i + 1, earlier: ea[i] ?? null, later: la[i] ?? null }));
  const panel = ELEMENTS.map((e): PanelRow => ({ element: e, earlier: earlier.result.panel.offsetPopulation[e], later: later.result.panel.offsetPopulation[e], change: later.result.panel.offsetPopulation[e] - earlier.result.panel.offsetPopulation[e] }));
  const pe = present(earlier), pl = present(later);
  const added = [...pl.keys()].filter((id) => !pe.has(id)).sort();
  const removed = [...pe.keys()].filter((id) => !pl.has(id)).sort();
  const severity = [...pl.keys()].filter((id) => pe.has(id) && pe.get(id) !== pl.get(id)).sort().map((id) => ({ symptom: id, from: pe.get(id) ?? null, to: pl.get(id) ?? null }));
  const profile = (s: SavedAssessment): string => JSON.stringify({ ...s.input.subject, redFlags: s.input.redFlags.filter((r) => r.startsWith("RF_C_")).sort() });
  return {
    earlier, later, ranking, panel,
    axes: { coldHeat: [earlier.result.panel.bagang.coldHeat, later.result.panel.bagang.coldHeat], deficiencyExcess: [earlier.result.panel.bagang.deficiencyExcess, later.result.panel.bagang.deficiencyExcess] },
    added, removed, severity, profileChanged: profile(earlier) !== profile(later),
  };
}
