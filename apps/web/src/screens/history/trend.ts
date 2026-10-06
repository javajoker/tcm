// The trend of a history (docs/post-mvp/design/export-follow-up-trends.md §5.4): three or more saved results on one timeline, in bands and never as a score. A pure function over saved results that
// returns ids, bands and numbers, never prose. Results made with other parameters or another major version of the engine start a new segment; nothing is compared across the break.
import { ELEMENTS, millisToJulianDay, seasonAt, type Element, type SeasonModel } from "@tcm/wuxing";
import type { SavedAssessment } from "../../storage/types.ts";
import { level5, type Level5 } from "../result/words.ts";

/** The rows of the figure: the five phases and the cold–heat and deficiency–excess axes. */
export const ROWS = [...ELEMENTS, "coldHeat", "deficiencyExcess"] as const;
export type RowKey = Element | "coldHeat" | "deficiencyExcess";
/** The bands from low to high, as `level5` names them. */
export const BANDS: readonly Level5[] = ["low", "somewhatLow", "normal", "somewhatHigh", "high"];
/** A trend needs this many results in one segment. */
export const MIN_POINTS = 3;
const TOP = 3;

export interface TrendPoint {
  readonly id: string;
  readonly createdAt: number;
  /** The commanding season at the date of the result (春, 夏, 長夏, 秋, 冬), from the result's own season model and the basis it was counted on; `null` for a result that left seasons out. */
  readonly season: string | null;
  readonly bands: Readonly<Record<RowKey, Level5>>;
  /** The numbers the result page prints (one decimal), for the table. */
  readonly values: Readonly<Record<RowKey, number>>;
  /** The patterns the result leaned towards, leading first (none when it reached no verdict). */
  readonly patterns: readonly { readonly id: string; readonly band: string }[];
}

/** A row that is in another band than at the previous result. A movement inside a band is not one. */
export interface BandChange { readonly row: RowKey; readonly from: Level5; readonly to: Level5 }
export type ProfileMark = "pregnancy" | "lactating" | "conditions";
export interface Step {
  readonly fromId: string;
  readonly toId: string;
  readonly changes: readonly BandChange[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Answers about the person that differ between the two results (pregnancy, breastfeeding, a long-term condition). */
  readonly profile: readonly ProfileMark[];
}
export interface Segment {
  /** The parameter fingerprint and the engine's major version that every point of the segment shares. */
  readonly key: string;
  readonly fingerprint: string;
  readonly engineMajor: string;
  readonly points: readonly TrendPoint[];
  /** One step between each two consecutive points. */
  readonly steps: readonly Step[];
}
export interface Trend {
  readonly segments: readonly Segment[];
  /** The number of results in the longest segment: the trend is offered when it reaches `MIN_POINTS`. */
  readonly longest: number;
}

export const engineMajor = (version: string): string => version.split(".")[0] ?? version;
const keyOf = (s: SavedAssessment): string => `${s.paramsFingerprint}|${engineMajor(s.engineVersion)}`;
const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

function pointOf(s: SavedAssessment): TrendPoint {
  const p = s.result.panel;
  const raw: Record<RowKey, [number, number]> = { 木: [p.offsetPopulation["木"], 3], 火: [p.offsetPopulation["火"], 3], 土: [p.offsetPopulation["土"], 3], 金: [p.offsetPopulation["金"], 3], 水: [p.offsetPopulation["水"], 3], coldHeat: [p.bagang.coldHeat, 1], deficiencyExcess: [p.bagang.deficiencyExcess, 1] };
  const bands = {} as Record<RowKey, Level5>;
  const values = {} as Record<RowKey, number>;
  for (const row of ROWS) { bands[row] = level5(raw[row][0], raw[row][1]); values[row] = oneDecimal(raw[row][0]); }
  const v = s.result.verdict;
  return {
    id: s.id, createdAt: s.createdAt, season: s.result.meta.seasons === "off" ? null : seasonAt(millisToJulianDay(s.createdAt), s.seasonModel as SeasonModel, s.result.meta.seasons === "south" ? "south" : "north").name, bands, values,
    patterns: v.status === "established" ? v.patterns.slice(0, TOP).map((x) => ({ id: x.id, band: x.band })) : [],
  };
}

const present = (s: SavedAssessment): Set<string> => new Set(Object.entries(s.input.findings).filter(([, f]) => f.state === "present").map(([id]) => id));
const conditionsOf = (s: SavedAssessment): string => s.input.redFlags.filter((r) => r.startsWith("RF_C_")).sort().join(",");

/** What differs between two results in the answers about the person. */
export function profileMarks(a: SavedAssessment, b: SavedAssessment): ProfileMark[] {
  const out: ProfileMark[] = [];
  if ((a.input.subject.pregnancy ?? null) !== (b.input.subject.pregnancy ?? null)) out.push("pregnancy");
  if ((a.input.subject.lactating ?? null) !== (b.input.subject.lactating ?? null)) out.push("lactating");
  if (conditionsOf(a) !== conditionsOf(b)) out.push("conditions");
  return out;
}

function stepOf(a: SavedAssessment, pa: TrendPoint, b: SavedAssessment, pb: TrendPoint): Step {
  const before = present(a), after = present(b);
  return {
    fromId: a.id, toId: b.id,
    changes: ROWS.filter((row) => pa.bands[row] !== pb.bands[row]).map((row) => ({ row, from: pa.bands[row], to: pb.bands[row] })),
    added: [...after].filter((id) => !before.has(id)).sort(), removed: [...before].filter((id) => !after.has(id)).sort(),
    profile: profileMarks(a, b),
  };
}

/**
 * The trend of a list of results, in any order: they are put in time order (ties by id) and cut into segments wherever the parameter fingerprint or the engine's major version changes. Every point
 * of a segment shares both, so a segment never spans two of them and nothing is compared across a break; two results of the same version separated by a result of another one are two segments.
 */
export function trend(all: readonly SavedAssessment[]): Trend {
  const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const runs: SavedAssessment[][] = [];
  for (const s of sorted) {
    const last = runs.at(-1);
    if (last !== undefined && keyOf(last[0]!) === keyOf(s)) last.push(s); else runs.push([s]);
  }
  const segments = runs.map((run): Segment => {
    const points = run.map(pointOf);
    return { key: keyOf(run[0]!), fingerprint: run[0]!.paramsFingerprint, engineMajor: engineMajor(run[0]!.engineVersion), points, steps: run.slice(1).map((s, i) => stepOf(run[i]!, points[i]!, s, points[i + 1]!)) };
  });
  return { segments, longest: segments.reduce((m, s) => Math.max(m, s.points.length), 0) };
}

/** Whether the history has enough results of one version for a trend. */
export const trendAvailable = (t: Trend): boolean => t.longest >= MIN_POINTS;
