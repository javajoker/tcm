// The prescription model, part 1 (PM-37; design: docs/post-mvp/design/prescription-model.md §3.3–§3.5, §4.1): what a herb does at an amount,
// after processing, and beside the other herbs of a composition (七情).
//   x        = amount / typical dose (the middle of the Pharmacopoeia range)
//   benefit  = effects · s(x),  s(x) = (1 + κ)·x / (κ + x)          saturating: s(0) = 0, s(1) = 1, never above 1 + κ
//   burden   = harms · x^γ,      γ ≥ 1                                at least as fast as the amount
// A dose band (量效) switches part of the herb's action below or above the typical dose; a processing method (炮製) shifts its direction, channels,
// moisture or burden. Pure and deterministic. Amounts exist only where the knowledge base carries the Pharmacopoeia range (the development profile).
import type { DoseBand, Herb, HerbProps, Pairing, PrescriptionParams, ProcessingMethod, YinjingChannel } from "@tcm/kb";

export type AmountBand = "small" | "large";

const clamp = (x: number, lo = -1, hi = 1): number => Math.max(lo, Math.min(hi, x));

function sortedRecord(entries: Iterable<[string, number]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) out[k] = v;
  return out;
}

function scaled(v: Readonly<Record<string, number>>, factor: number): Record<string, number> {
  return sortedRecord(Object.entries(v).map(([k, x]): [string, number] => [k, x * factor]));
}

/** Shares plus additions, renormalised to sum to 1 (a channel may be added). */
function addShares(shares: Readonly<Record<string, number>>, add: Readonly<Record<string, number>>): Record<string, number> {
  const next = new Map(Object.entries(shares));
  for (const [k, x] of Object.entries(add)) next.set(k, (next.get(k) ?? 0) + x);
  const total = [...next.values()].reduce((a, b) => a + b, 0);
  return total > 0 ? sortedRecord([...next].map(([k, x]): [string, number] => [k, x / total])) : sortedRecord(next);
}

/** s(x) = (1 + κ)·x / (κ + x): s(0) = 0, s(1) = 1, increasing, concave, below 1 + κ. */
export function saturation(x: number, kappa: number): number {
  return x <= 0 ? 0 : ((1 + kappa) * x) / (kappa + x);
}

/** x^γ (γ ≥ 1): equals 1 at the typical dose, grows at least as fast as the amount above it. */
export function burdenGrowth(x: number, gamma: number): number {
  return x <= 0 ? 0 : x ** gamma;
}

/** The typical dose in grams — the middle of the Pharmacopoeia range — or null where the knowledge base carries none. */
export function typicalDose(h: Pick<Herb, "dose_g_reference">): number | null {
  const r = h.dose_g_reference;
  return r ? (r[0] + r[1]) / 2 : null;
}

/** 少用 below `small_below`, 多用 above `large_above` of the typical dose (both relative), otherwise none. */
export function doseBandOf(x: number, params: PrescriptionParams): AmountBand | null {
  return x < params.bands.small_below ? "small" : x > params.bands.large_above ? "large" : null;
}

/** What one herb does at an amount: the panel changes it makes and the properties it carries there. */
export interface HerbAction {
  readonly herb: string;
  /** The amount relative to the typical dose. */
  readonly x: number;
  readonly benefit: Readonly<Record<string, number>>;
  readonly burden: Readonly<Record<string, number>>;
  readonly direction: number;
  readonly tropism: Readonly<Record<string, number>>;
  readonly runZao: HerbProps["run_zao"];
  readonly buXie: HerbProps["bu_xie"];
  readonly temperature: number;
  readonly band: AmountBand | null;
  /** What changed the herb, in order: `band:small`, `processing:jiu` … */
  readonly changes: readonly string[];
}

export interface HerbAtDoseOptions {
  readonly params: PrescriptionParams;
  /** The herb's dose-band entry, if the knowledge base has one. */
  readonly band?: DoseBand | undefined;
  /** The processing methods applied to the herb (its formula's note). */
  readonly processing?: readonly ProcessingMethod[];
}

/** The action of herb `h` at `x` times its typical dose (§3.3), after its dose band (§3.3) and processing (§3.5). */
export function herbAtDose(h: Herb, x: number, opts: HerbAtDoseOptions): HerbAction {
  if (!(x >= 0) || !Number.isFinite(x)) throw new Error(`herb ${h.id}: the relative amount must be a finite number ≥ 0`);
  const effects: Record<string, number> = { ...h.effects };
  let harms: Record<string, number> = { ...h.harms };
  let direction = h.props.direction;
  let tropism: Record<string, number> = { ...h.props.tropism };
  let runZao = h.props.run_zao;
  let buXie = h.props.bu_xie;
  let temperature = h.temperature;
  const changes: string[] = [];

  const band = doseBandOf(x, opts.params);
  const mod = band && opts.band ? opts.band[band] : undefined;
  if (band && mod && Object.keys(mod).length > 0) {
    if (mod.direction !== undefined) direction = mod.direction;
    for (const [k, v] of Object.entries(mod.effects_scale ?? {})) if (k in effects) effects[k] = effects[k]! * v;
    for (const [k, v] of Object.entries(mod.effects_add ?? {})) effects[k] = (effects[k] ?? 0) + v;
    for (const [k, v] of Object.entries(mod.harms_add ?? {})) harms[k] = (harms[k] ?? 0) + v;
    if (mod.tropism) tropism = addShares(tropism, mod.tropism);
    changes.push(`band:${band}`);
  }
  for (const p of opts.processing ?? []) {
    const m = p.modifiers;
    if (m.direction !== undefined) direction = clamp(direction + m.direction);
    if (m.tropism) tropism = addShares(tropism, m.tropism);
    if (m.run_zao !== undefined) runZao = m.run_zao;
    if (m.bu_xie !== undefined) buXie = m.bu_xie;
    if (m.harms_scale !== undefined) harms = scaled(harms, m.harms_scale);
    if (m.temperature !== undefined) temperature += m.temperature;
    changes.push(`processing:${p.id}`);
  }
  return {
    herb: h.id, x, benefit: scaled(effects, saturation(x, opts.params.dose.kappa)), burden: scaled(harms, burdenGrowth(x, opts.params.dose.gamma)),
    direction, tropism: sortedRecord(Object.entries(tropism)), runZao, buXie, temperature, band: mod && Object.keys(mod).length > 0 ? band : null, changes,
  };
}

/** The processing methods a formula's note names (`炙`, `酒洗` …); words of cleaning and cutting have none. */
export function processingOf(note: string | null | undefined, methods: readonly ProcessingMethod[]): ProcessingMethod[] {
  if (!note) return [];
  return methods.filter((m) => m.words.some((w) => note.includes(w)));
}

// ── 七情 ──────────────────────────────────────────────────────────────────

export interface AppliedPairing {
  readonly id: string;
  readonly type: Pairing["type"];
  readonly herb: string;
  readonly other: string;
  /** The dimensions whose benefit the pairing strengthened (相須, 相使) — empty for 相畏 and 相惡, which act on the whole burden or benefit. */
  readonly dimensions: readonly string[];
}

export interface PairingOutcome {
  readonly actions: readonly HerbAction[];
  readonly applied: readonly AppliedPairing[];
  /** 相反 pairs among the herbs: never computed — the safety layer excludes them. */
  readonly conflicts: readonly Pairing[];
}

const sharedDimensions = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): string[] =>
  Object.keys(a).filter((d) => (a[d] ?? 0) * (b[d] ?? 0) > 0).sort();

/**
 * The 七情 among the herbs of one composition (§4.1), applied to the actions as they were before any pairing, so that the order of the pairings never
 * matters and no factor compounds: 相須 · 相使 — the benefit of `herb` on the dimensions both herbs act on in the same sense × (1 + σ) (相須 both ways);
 * 相畏 — the burden of `herb` × (1 − τ); 相惡 — the benefit of `herb` × (1 − τ); 相反 — listed as a conflict, never computed.
 */
export function applyPairings(actions: readonly HerbAction[], pairings: readonly Pairing[], params: PrescriptionParams): PairingOutcome {
  const byHerb = new Map(actions.map((a) => [a.herb, a] as const));
  const boost = new Map<string, Set<string>>();          // herb → dimensions × (1 + σ)
  const fears = new Set<string>();                       // herbs whose burden × (1 − τ)
  const opposed = new Set<string>();                     // herbs whose benefit × (1 − τ)
  const applied: AppliedPairing[] = [];
  const conflicts: Pairing[] = [];
  for (const p of [...pairings].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const a = byHerb.get(p.herb), b = byHerb.get(p.other);
    if (!a || !b) continue;
    if (p.type === "相反") { conflicts.push(p); continue; }
    if (p.type === "相須" || p.type === "相使") {
      const dims = sharedDimensions(a.benefit, b.benefit);
      if (dims.length === 0) continue;
      const targets = p.type === "相須" ? [p.herb, p.other] : [p.herb];
      for (const t of targets) {
        const set = boost.get(t) ?? new Set<string>();
        for (const d of dims) set.add(d);
        boost.set(t, set);
      }
      applied.push({ id: p.id, type: p.type, herb: p.herb, other: p.other, dimensions: dims });
    } else if (p.type === "相畏") {
      if (Object.keys(a.burden).length === 0) continue;
      fears.add(p.herb);
      applied.push({ id: p.id, type: p.type, herb: p.herb, other: p.other, dimensions: [] });
    } else {
      opposed.add(p.herb);
      applied.push({ id: p.id, type: p.type, herb: p.herb, other: p.other, dimensions: [] });
    }
  }
  const { sigma, tau } = params.pairs;
  const next = actions.map((act): HerbAction => {
    const dims = boost.get(act.herb);
    let benefit = act.benefit;
    if (dims) benefit = sortedRecord(Object.entries(benefit).map(([d, x]): [string, number] => [d, dims.has(d) ? x * (1 + sigma) : x]));
    if (opposed.has(act.herb)) benefit = scaled(benefit, 1 - tau);
    const burden = fears.has(act.herb) ? scaled(act.burden, 1 - tau) : act.burden;
    return benefit === act.benefit && burden === act.burden ? act : { ...act, benefit, burden };
  });
  return { actions: next, applied, conflicts };
}

// ── a composition ───────────────────────────────────────────────────────────

export interface CompositionRow {
  readonly herb: string;
  /** The amount relative to the herb's typical dose. */
  readonly x: number;
  /** The formula's processing note for this herb, if any. */
  readonly note?: string | null;
}

export interface PrescriptionTables {
  readonly params: PrescriptionParams;
  readonly pairings: readonly Pairing[];
  readonly processing: readonly ProcessingMethod[];
  readonly doseBands: readonly DoseBand[];
  /** 引經報使: the herbs that lead to each channel (used to read the role 使). */
  readonly yinjing?: readonly YinjingChannel[];
}

export interface CompositionAction {
  /** Each herb's action after the pairings, in the order of the rows. */
  readonly herbs: readonly HerbAction[];
  /** The same before the pairings (what each herb does on its own). */
  readonly before: readonly HerbAction[];
  readonly benefit: Readonly<Record<string, number>>;
  readonly burden: Readonly<Record<string, number>>;
  /** benefit + burden: what the composition does to the panel. */
  readonly total: Readonly<Record<string, number>>;
  /** The direction of qi of the whole: each herb's direction weighted by the size of its benefit (Σ|benefit|). */
  readonly direction: number;
  readonly applied: readonly AppliedPairing[];
  readonly conflicts: readonly Pairing[];
}

function sum(into: Map<string, number>, v: Readonly<Record<string, number>>): void {
  for (const [k, x] of Object.entries(v)) into.set(k, (into.get(k) ?? 0) + x);
}

const l1 = (v: Readonly<Record<string, number>>): number => Object.values(v).reduce((a, x) => a + Math.abs(x), 0);

/** T(composition) = Σ e(h_i, x_i) with the pairings (§4.1). */
export function compositionAction(herbs: ReadonlyMap<string, Herb>, rows: readonly CompositionRow[], tables: PrescriptionTables): CompositionAction {
  const bands = new Map(tables.doseBands.map((b) => [b.herb, b] as const));
  const single = rows.map((r) => {
    const h = herbs.get(r.herb);
    if (!h) throw new Error(`unknown herb ${r.herb}`);
    return herbAtDose(h, r.x, { params: tables.params, band: bands.get(r.herb), processing: processingOf(r.note, tables.processing) });
  });
  const { actions, applied, conflicts } = applyPairings(single, tables.pairings, tables.params);
  const benefit = new Map<string, number>(), burden = new Map<string, number>(), total = new Map<string, number>();
  let weighted = 0, weight = 0;
  for (const a of actions) {
    sum(benefit, a.benefit);
    sum(burden, a.burden);
    sum(total, a.benefit);
    sum(total, a.burden);
    const w = l1(a.benefit);
    weighted += w * a.direction;
    weight += w;
  }
  return { herbs: actions, before: single, benefit: sortedRecord(benefit), burden: sortedRecord(burden), total: sortedRecord(total), direction: weight > 0 ? weighted / weight : 0, applied, conflicts };
}
