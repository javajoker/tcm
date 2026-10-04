// FR-16 feedback marks (UX spec §13): "Did this match your experience?" per result and per reasoning item, stored with the saved result, exported only on request.
import type { SavedAssessment } from "../../storage/types.ts";

export const MARKS = ["match", "partial", "no"] as const;
export type Mark = (typeof MARKS)[number];
export type Marks = Readonly<Record<string, Mark>>;

/** The keys of what can be marked: the result as a whole, one pattern's reasoning, one formula card. */
export const RESULT_KEY = "result";
export const patternKey = (id: string): string => `pattern:${id}`;
export const formulaKey = (id: string): string => `formula:${id}`;

/** The marks with one item set (or, for `null`, cleared). */
export function withMark(marks: Marks, key: string, mark: Mark | null): Marks {
  const { [key]: _old, ...rest } = marks;
  return mark === null ? rest : { ...rest, [key]: mark };
}

export const isMark = (v: unknown): v is Mark => typeof v === "string" && (MARKS as readonly string[]).includes(v);

/** What "Export feedback" writes: the marks, the version stamps and a summary of the result they refer to; the person's answers only when they ask for them. */
export interface FeedbackExport {
  readonly format: "tcm-feedback";
  readonly version: 1;
  readonly exportedFrom: Readonly<Record<string, string>>;
  readonly marks: readonly { readonly key: string; readonly mark: Mark }[];
  readonly result: { readonly status: string; readonly confidence: string; readonly patterns: readonly { readonly id: string; readonly pct: number }[]; readonly formulas: readonly string[] };
  readonly input?: SavedAssessment["input"];
}

export function feedbackExport(saved: SavedAssessment, marks: Marks, includeAnswers: boolean): FeedbackExport {
  const r = saved.result;
  return {
    format: "tcm-feedback", version: 1,
    exportedFrom: { appVersion: saved.appVersion, kbVersion: saved.kbVersion, engineVersion: saved.engineVersion, paramsFingerprint: saved.paramsFingerprint, profile: saved.profile },
    marks: Object.entries(marks).filter((e): e is [string, Mark] => isMark(e[1])).map(([key, mark]) => ({ key, mark })).sort((a, b) => a.key.localeCompare(b.key)),
    result: {
      status: r.verdict.status, confidence: r.verdict.confidence,
      patterns: r.verdict.patterns.map((p) => ({ id: p.id, pct: Math.round(p.pct * 10) / 10 })),
      formulas: [...r.recommendations.formulas, ...r.recommendations.studyOnly].map((f) => f.id),
    },
    ...(includeAnswers ? { input: saved.input } : {}),
  };
}

export const feedbackFileName = (saved: SavedAssessment): string => `tcm-feedback-${new Date(saved.createdAt).toISOString().slice(0, 10)}.json`;
