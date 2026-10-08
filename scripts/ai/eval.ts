// The evaluation of AI help's conversation (PM-48; docs/post-mvp/design/ai-assisted-intake.md §6). Scripted personas — the typical patient of each of the 23 patterns, in three
// languages — talk with a provider through the protocol the app uses: the device's red-flag check before each message, the reply validated as the device does, the persona
// confirming what is true of them. Scored against the persona's gold findings and against the engine's result on them; and every red-flag vignette must be found on the device.
//   node scripts/ai/eval.ts                       the mock provider, in process: the summary per language; exit 1 when a gate of the pipeline fails
//   node scripts/ai/eval.ts --write | --check     also write (or compare) docs/ai-evaluation-mock.md, the committed report of the mock run
//   node scripts/ai/eval.ts --gateway <url> --origin <origin> [--out <file>] [--pace <ms>]
//                                                 a deployed gateway (a real provider — the owner's key): the report per language, judged on the design's lines; exit 1 below a line
// The personas speak the app's own words (each symptom's plain phrasing from the questions): they measure the pipeline and a model's reading of plain statements, not of free
// paraphrase. Personas written by people in each language are the next step (design §6); they plug in through `Persona`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, matchRedFlags, PROTOCOL, validateReply, vocabularyFrom } from "../../packages/ai/src/index.ts";
import type { Lang, Message, Proposal, TurnReply, TurnRequest, VocabItem } from "../../packages/ai/src/index.ts";
import { mockTurn } from "../../packages/ai/src/mock.ts";
import { assessGolden, topPatterns, type GoldenCase } from "../../packages/engine/src/golden.ts";
import type { Finding, Findings } from "../../packages/engine/src/index.ts";
import { indexKnowledgeBase } from "../../packages/kb/src/indexer.ts";
import { rawChunksFromDisk } from "../../packages/kb/node/fromDisk.ts";
import { VIGNETTES } from "./vignettes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REPORT = join(root, "docs", "ai-evaluation-mock.md");
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), "utf8")) as T;

/** The design's lines (§6): what a real provider must reach in each language before any public use. */
export const LINES = { recall: 0.85, precision: 0.9, leading: 0.9, redFlags: 1 } as const;
const MAX_TURNS = 20;

const OPENING: Readonly<Record<Lang, string>> = { "zh-Hant": "說說最近哪裡不舒服？從什麼時候開始的？", "zh-Hans": "说说最近哪里不舒服？从什么时候开始的？", en: "What has been bothering you lately, and since when?" };
const NOTHING: Readonly<Record<Lang, string>> = { "zh-Hant": "沒有特別的", "zh-Hans": "没有特别的", en: "Nothing in particular" };
const JOIN: Readonly<Record<Lang, string>> = { "zh-Hant": "，", "zh-Hans": "，", en: "; " };

// ── the data ────────────────────────────────────────────────────────────────

interface Symptom { readonly id: string; readonly kind: string; readonly dimension: string; readonly "zh-Hant": string; readonly en: string }
interface QuestionData { readonly options: readonly { readonly label: { readonly "zh-Hant": string; readonly en: string }; readonly symptoms: readonly string[]; readonly none: boolean }[] }
interface PatternData { readonly id: string; readonly weights: Readonly<Record<string, number>> }

const symptoms = read<{ items: Symptom[] }>("data/diagnosis/symptoms.json").items;
const questions = read<{ items: QuestionData[] }>("data/diagnosis/questions.json").items;
const patterns = new Map(read<{ items: PatternData[] }>("data/diagnosis/patterns.json").items.map((p) => [p.id, p]));
const hans = read<{ entries: Record<string, string> }>("scripts/i18n/zh-Hans.dictionary.json").entries;
const text = (lang: Lang) => (t: { readonly "zh-Hant": string; readonly en: string | null }): string => (lang === "en" ? (t.en ?? t["zh-Hant"]) : lang === "zh-Hans" ? (hans[t["zh-Hant"]] ?? t["zh-Hant"]) : t["zh-Hant"]);
export const vocabularyIn = (lang: Lang): VocabItem[] => vocabularyFrom({ symptoms, questions }, text(lang));

/** The golden seed cases of the typical patients (synthetic; read, never changed here). */
const seeds = (): GoldenCase[] => {
  const dir = join(root, "packages", "engine", "test", "golden");
  return readdirSync(dir).filter((f) => /^G-\d{4}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as GoldenCase)
    .filter((c) => c.authoredBy === "synthetic" && c.title.startsWith("typical patient of"));
};

// ── the personas ────────────────────────────────────────────────────────────

export interface Persona {
  readonly id: string;
  readonly lang: Lang;
  readonly pattern: string;
  readonly seed: GoldenCase;
  /** The inquiry findings the person has (present), most telling first. */
  readonly present: readonly string[];
  /** How the person says each of them. */
  readonly words: ReadonlyMap<string, string>;
}

/** The person's way of saying a finding: the questions' plain phrasing without the answer form ("有，" "Yes, "), else the label without its brackets. */
function phrase(item: VocabItem): string {
  const p = item.plain?.[0];
  if (p !== undefined) return p.replace(/^(有|是|對|对)[，,]\s*/u, "").replace(/^yes[,—–-]?\s*/iu, "");
  return item.label.replace(/[（(][^）)]*[）)]/gu, "").trim();
}

export function personas(lang: Lang): Persona[] {
  const vocabulary = new Map(vocabularyIn(lang).map((v) => [v.id, v]));
  return seeds().map((seed) => {
    const pattern = /typical patient of (\S+)/.exec(seed.title)![1]!;
    const weights = patterns.get(pattern)?.weights ?? {};
    const present = Object.entries(seed.input.findings).filter(([id, f]) => id.startsWith("S_") && f.state === "present" && vocabulary.has(id)).map(([id]) => id)
      .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || (a < b ? -1 : 1));
    return { id: `${pattern}·${lang}`, lang, pattern, seed, present, words: new Map(present.map((id) => [id, phrase(vocabulary.get(id)!)])) };
  });
}

// ── the providers ───────────────────────────────────────────────────────────

/** One turn: the provider's reply, already validated as the gateway does (the harness validates it again, as the device does). */
export type Turn = (request: TurnRequest) => Promise<TurnReply | { readonly error: string }>;

export const mockTurns: Turn = (request) => Promise.resolve(validateReply(mockTurn(request), request).reply);

export function gatewayTurns(endpoint: string, origin: string, paceMs: number): Turn {
  let token: string | null = null;
  const post = async (path: string, body?: unknown): Promise<Response> => fetch(`${endpoint}${path}`, {
    method: "POST", headers: { origin, "content-type": "application/json", ...(token !== null ? { authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return async (request) => {
    if (request.messages.filter((m) => m.role === "person").length === 1 || token === null) {
      const r = await post("/v1/session");
      if (!r.ok) return { error: `session ${r.status}` };
      token = ((await r.json()) as { token: string }).token;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((ok) => setTimeout(ok, paceMs));
      const r = await post("/v1/intake/turn", request);
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 10_000)); continue; }
      if (!r.ok) return { error: `turn ${r.status}` };
      return ((await r.json()) as { reply: TurnReply }).reply;
    }
    return { error: "rate" };
  };
}

// ── one conversation ────────────────────────────────────────────────────────

export interface PersonaResult {
  readonly persona: Persona;
  readonly turns: number;
  /** Findings proposed as present, over the whole conversation. */
  readonly proposed: readonly string[];
  /** Proposals the persona confirmed (true of them). */
  readonly confirmed: readonly string[];
  readonly recall: number;
  readonly precision: number;
  readonly goldLeading: string | null;
  readonly leading: string | null;
  /** The persona's own words re-opened the screening (a false alarm of the device's check). */
  readonly falseAlarms: readonly string[];
  readonly error: string | null;
}

const ratio = (a: number, b: number): number => (b === 0 ? 1 : a / b);

export async function converse(p: Persona, turn: Turn, maxTurns: number = MAX_TURNS): Promise<PersonaResult> {
  const vocabulary = vocabularyIn(p.lang);
  const topicOf = new Map(vocabulary.map((v) => [v.id, v.topic]));
  const sex = p.seed.input.subject.sex;
  const unsaid = [...p.present];
  const say = (ids: readonly string[]): string => { for (const id of ids) unsaid.splice(unsaid.indexOf(id), 1); return ids.map((id) => p.words.get(id)!).join(JOIN[p.lang]) || NOTHING[p.lang]; };
  const messages: Message[] = [{ role: "assistant", text: OPENING[p.lang] }];
  const proposed = new Set<string>(), confirmed = new Map<string, Proposal>(), falseAlarms: string[] = [];
  let next = say(unsaid.slice(0, 3));
  let turns = 0, error: string | null = null;
  while (turns < maxTurns) {
    for (const m of matchRedFlags(next)) if (!falseAlarms.includes(m.id)) falseAlarms.push(m.id);
    messages.push({ role: "person", text: next });
    const request: TurnRequest = { v: PROTOCOL, lang: p.lang, messages: [...messages], vocabulary, confirmed: [...confirmed.keys()] };
    const got = await turn(request);
    turns++;
    if ("error" in got) { error = got.error; break; }
    const reply = validateReply(got, request).reply;                                              // checked again, as the device does
    for (const prop of reply.proposals) {
      if (prop.state !== "present" || (topicOf.get(prop.id) === "menses" && sex !== "female")) continue;
      proposed.add(prop.id);
      if (p.present.includes(prop.id)) confirmed.set(prop.id, prop);
    }
    const q = reply.question;
    if (q === null || reply.done || (q.topic === "menses" && sex !== "female")) break;
    messages.push({ role: "assistant", text: q.text, ...(q.topic !== undefined ? { topic: q.topic } : {}) });
    next = say(q.topic !== undefined ? unsaid.filter((id) => topicOf.get(id) === q.topic) : unsaid.slice(0, 2));
  }
  const findings: Record<string, Finding> = Object.fromEntries(Object.entries(p.seed.input.findings).filter(([id]) => !id.startsWith("S_")));
  for (const [id, prop] of confirmed) findings[id] = prop.severity !== undefined ? { state: "present", severity: prop.severity } : { state: "present" };
  const kb = devKb();
  const leading = topPatterns(assessGolden(kb, { ...p.seed.input, findings: findings as Findings }))[0] ?? null;
  const goldLeading = topPatterns(assessGolden(kb, p.seed.input))[0] ?? null;
  const tp = [...proposed].filter((id) => p.present.includes(id)).length;
  return { persona: p, turns, proposed: [...proposed].sort(), confirmed: [...confirmed.keys()].sort(), recall: ratio(confirmed.size, p.present.length), precision: ratio(tp, proposed.size), goldLeading, leading, falseAlarms, error };
}

let kbCache: ReturnType<typeof indexKnowledgeBase> | undefined;
const devKb = (): ReturnType<typeof indexKnowledgeBase> => (kbCache ??= indexKnowledgeBase(rawChunksFromDisk("dev")));

// ── the run ─────────────────────────────────────────────────────────────────

export interface LangSummary { readonly lang: Lang; readonly personas: number; readonly recall: number; readonly precision: number; readonly leading: number; readonly redFlags: number; readonly vignettes: number; readonly turns: number; readonly falseAlarms: number; readonly errors: number }
export interface Run { readonly provider: string; readonly results: readonly PersonaResult[]; readonly caught: ReadonlyMap<string, readonly Lang[]>; readonly summaries: readonly LangSummary[] }

export async function evaluate(turn: Turn, provider: string): Promise<Run> {
  const results: PersonaResult[] = [];
  for (const lang of LANGS) for (const p of personas(lang)) results.push(await converse(p, turn));
  const caught = new Map(VIGNETTES.map((v) => [v.id, LANGS.filter((l) => matchRedFlags(v.text[l]).some((m) => m.id === v.id))]));
  const summaries = LANGS.map((lang): LangSummary => {
    const rs = results.filter((r) => r.persona.lang === lang);
    const gold = rs.reduce((n, r) => n + r.persona.present.length, 0), conf = rs.reduce((n, r) => n + r.confirmed.length, 0);
    const prop = rs.reduce((n, r) => n + r.proposed.length, 0), tp = rs.reduce((n, r) => n + r.proposed.filter((id) => r.persona.present.includes(id)).length, 0);
    return {
      lang, personas: rs.length, recall: ratio(conf, gold), precision: ratio(tp, prop), leading: ratio(rs.filter((r) => r.leading !== null && r.leading === r.goldLeading).length, rs.length),
      redFlags: ratio(VIGNETTES.filter((v) => caught.get(v.id)!.includes(lang)).length, VIGNETTES.length), vignettes: VIGNETTES.length,
      turns: rs.reduce((n, r) => n + r.turns, 0) / Math.max(1, rs.length), falseAlarms: rs.reduce((n, r) => n + r.falseAlarms.length, 0), errors: rs.filter((r) => r.error !== null).length,
    };
  });
  return { provider, results, caught, summaries };
}

/** What a run must reach. The pipeline's gates hold for every provider; the design's lines of accuracy are judged for a real one. */
export function failures(run: Run, judgeAccuracy: boolean): string[] {
  const out: string[] = [];
  for (const s of run.summaries) {
    if (s.redFlags < LINES.redFlags) out.push(`${s.lang}: ${Math.round((1 - s.redFlags) * s.vignettes)} red-flag vignette(s) not found on the device`);
    if (s.falseAlarms > 0) out.push(`${s.lang}: a persona's ordinary words re-opened the screening ${s.falseAlarms} time(s)`);
    if (s.errors > 0) out.push(`${s.lang}: ${s.errors} conversation(s) ended in an error`);
    if (judgeAccuracy) {
      if (s.recall < LINES.recall) out.push(`${s.lang}: recall ${pct(s.recall)} is below ${pct(LINES.recall)}`);
      if (s.precision < LINES.precision) out.push(`${s.lang}: precision ${pct(s.precision)} is below ${pct(LINES.precision)}`);
      if (s.leading < LINES.leading) out.push(`${s.lang}: the leading pattern matches in ${pct(s.leading)}, below ${pct(LINES.leading)}`);
    }
  }
  return out;
}

// ── the report ──────────────────────────────────────────────────────────────

const pct = (x: number): string => `${Math.round(x * 1000) / 10} %`;
const LANG_NAME: Readonly<Record<Lang, string>> = { "zh-Hant": "Traditional Chinese", "zh-Hans": "Simplified Chinese", en: "English" };

export function render(run: Run): string {
  const mock = run.provider === "mock";
  const head = [
    `# AI help — evaluation of the conversation (${mock ? "mock provider" : run.provider})`, "",
    "| | |", "|---|---|",
    `| **Generated by** | \`scripts/ai/eval.ts\`${mock ? " (`node scripts/ai/eval.ts --write`; `--check` in `pnpm test:scripts`) — do not edit" : ""} |`,
    `| **Provider** | ${mock ? "the deterministic mock (`@tcm/ai/mock`), in process: **a check of the harness and the pipeline, not a measure of a model** — the mock matches the app's own words, which the personas speak" : run.provider} |`,
    `| **Personas** | the typical patient of each of the ${run.results.length / LANGS.length} patterns (the golden seed cases), in each language, speaking each finding in the questions' plain words; they confirm what is true of them |`,
    `| **Red-flag vignettes** | ${VIGNETTES.length} statements in each language (\`scripts/ai/vignettes.ts\`, synthetic) — each must be found on the device, before anything is sent |`,
    `| **Lines** (design §6) | recall ≥ ${pct(LINES.recall)} · precision of the proposals ≥ ${pct(LINES.precision)} · the engine's leading pattern on the extracted findings equals the one on the gold findings in ≥ ${pct(LINES.leading)} of personas · every red-flag vignette found${mock ? " — judged for a real provider; the mock run must keep the pipeline's gates (red flags, no false alarm, no error)" : ""} |`,
    "",
    "Recall: the persona's present inquiry findings that were proposed and confirmed. Precision: the proposals (as present) that are true of the persona. The leading pattern: the engine (development profile) on the extracted findings with the gold tongue and pulse, against the engine on the whole gold input.",
    "",
    "## Summary", "",
    "| Language | Personas | Recall | Precision | Leading pattern | Red flags found | Turns (mean) | False alarms | Errors |",
    "|---|---|---|---|---|---|---|---|---|",
    ...run.summaries.map((s) => `| ${LANG_NAME[s.lang]} | ${s.personas} | ${pct(s.recall)} | ${pct(s.precision)} | ${pct(s.leading)} | ${Math.round(s.redFlags * s.vignettes)} / ${s.vignettes} | ${s.turns.toFixed(1)} | ${s.falseAlarms} | ${s.errors} |`),
    "",
  ];
  const per = LANGS.flatMap((lang) => [
    `## Personas — ${LANG_NAME[lang]}`, "",
    "| Pattern | Gold findings | Proposed | Confirmed | Recall | Precision | Gold leading | Extracted leading | Turns |",
    "|---|---|---|---|---|---|---|---|---|",
    ...run.results.filter((r) => r.persona.lang === lang).map((r) => `| ${r.persona.pattern} | ${r.persona.present.length} | ${r.proposed.length} | ${r.confirmed.length} | ${pct(r.recall)} | ${pct(r.precision)} | ${r.goldLeading ?? "—"} | ${r.leading ?? "—"}${r.leading === r.goldLeading ? "" : " ✗"} | ${r.turns}${r.error !== null ? ` (${r.error})` : ""} |`),
    "",
  ]);
  const flags = [
    "## Red-flag vignettes", "",
    "| Red flag | Traditional Chinese | Simplified Chinese | English |", "|---|---|---|---|",
    ...VIGNETTES.map((v) => `| \`${v.id}\` | ${LANGS.map((l) => `${run.caught.get(v.id)!.includes(l) ? "✓" : "✗"} ${v.text[l]}`).join(" | ")} |`),
    "",
  ];
  return [...head, ...per, ...flags].join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const gateway = opt("--gateway");
  const run = gateway === undefined
    ? await evaluate(mockTurns, "mock")
    : await evaluate(gatewayTurns(gateway, opt("--origin") ?? "http://localhost:5173", Number(opt("--pace") ?? "6500")), `the gateway at ${gateway}`);
  for (const s of run.summaries) process.stdout.write(`${s.lang}: recall ${pct(s.recall)} · precision ${pct(s.precision)} · leading ${pct(s.leading)} · red flags ${Math.round(s.redFlags * s.vignettes)}/${s.vignettes} · turns ${s.turns.toFixed(1)}\n`);
  const text = render(run);
  if (gateway === undefined && args.includes("--write")) writeFileSync(REPORT, text);
  if (gateway === undefined && args.includes("--check") && readFileSync(REPORT, "utf8") !== text) { process.stderr.write(`${REPORT} is stale: run node scripts/ai/eval.ts --write\n`); process.exit(1); }
  if (gateway !== undefined && opt("--out") !== undefined) writeFileSync(opt("--out")!, text);
  const bad = failures(run, gateway !== undefined);
  for (const b of bad) process.stderr.write(`✗ ${b}\n`);
  process.exit(bad.length > 0 ? 1 : 0);
}
