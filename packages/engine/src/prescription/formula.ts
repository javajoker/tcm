// The prescription model, part 2 (PM-38; design: docs/post-mvp/design/prescription-model.md §4): a formula's effect computed from its herbs at
// their amounts, each herb's exact share of it, the 君臣佐使 measured against the labels, and why the formula fits a deviation —
// 病機 → 治法 → 方 → 藥 → 未盡 — as structured data (ids and numbers; the sentences are written where they are shown).
//   contribution_i  = own action + half of every change a pairing made to it + half of every change it made to a partner   (Σ_i = T exactly)
//   reduction r_d   = w_d·(D_d² − (D_d + k·T_d)²),  herb i's part r_{i,d} = −w_d·k·c_{i,d}·(2·D_d + k·T_d)                 (Σ_i r_{i,d} = r_d exactly)
import type { Formula, Herb, KnowledgeBase, PrescriptionParams, YinjingChannel } from "@tcm/kb";
import { bestScale, cost, dimensionWeight, type PanelVector, type Role } from "../formulas.ts";
import { compositionAction, typicalDose, type CompositionAction, type CompositionRow, type HerbAction, type PrescriptionTables } from "./herbs.ts";

const sortKeys = (m: Map<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const k of [...m.keys()].sort()) out[k] = m.get(k)!;
  return out;
};
const plus = (into: Map<string, number>, v: Readonly<Record<string, number>>, scale = 1): void => {
  for (const [k, x] of Object.entries(v)) into.set(k, (into.get(k) ?? 0) + scale * x);
};
const totalOf = (a: HerbAction): Map<string, number> => {
  const m = new Map<string, number>();
  plus(m, a.benefit);
  plus(m, a.burden);
  return m;
};
const byNameThenValue = (a: [string, number], b: [string, number]): number => b[1] - a[1] || (a[0] < b[0] ? -1 : 1);

// ── the formula at its own amounts ──────────────────────────────────────────

export interface ClassicalRows {
  readonly rows: readonly CompositionRow[];
  /** Herbs the Pharmacopoeia gives no range for: taken at their typical dose (x = 1). */
  readonly atTypical: readonly string[];
}

/**
 * The formula at the amounts of its composition, each relative to the herb's typical dose, with the processing note of each row. Null when the
 * bundle carries no amounts (every profile below L3): the model then has nothing to compute from, and nothing is shown.
 */
export function classicalRows(f: Formula, herbs: ReadonlyMap<string, Herb>): ClassicalRows | null {
  const rows: CompositionRow[] = [];
  const atTypical: string[] = [];
  for (const c of f.composition) {
    if (c.typical_g === undefined) return null;
    const h = herbs.get(c.herb);
    if (!h) throw new Error(`formula ${f.id}: unknown herb ${c.herb}`);
    const t = typicalDose(h);
    if (t === null) atTypical.push(c.herb);
    const note = [c.note, c.classical_amount?.processing].filter((x): x is string => typeof x === "string" && x.length > 0).join("；");
    rows.push({ herb: c.herb, x: t === null ? 1 : c.typical_g / t, note: note || null });
  }
  return { rows, atTypical };
}

// ── each herb's share ───────────────────────────────────────────────────────

export interface HerbContribution {
  readonly herb: string;
  readonly role: Role | null;
  /** What the herb does on its own (benefit + burden before the pairings). */
  readonly own: Readonly<Record<string, number>>;
  /** Its share of the pairings: half of each change made to it, half of each change it made to a partner (split among the partners). */
  readonly paired: Readonly<Record<string, number>>;
  /** own + paired. Summed over the herbs it equals the composition's total exactly. */
  readonly total: Readonly<Record<string, number>>;
}

/** Each herb's exact share of the composition's action (§4.3). */
export function contributions(action: CompositionAction, roles: ReadonlyMap<string, Role> = new Map()): HerbContribution[] {
  const partners = new Map<string, Set<string>>();
  const link = (changed: string, partner: string): void => {
    const set = partners.get(changed) ?? new Set<string>();
    set.add(partner);
    partners.set(changed, set);
  };
  for (const p of action.applied) {
    link(p.herb, p.other);
    if (p.type === "相須") link(p.other, p.herb);
  }
  const paired = new Map(action.herbs.map((a) => [a.herb, new Map<string, number>()] as const));
  action.herbs.forEach((after, i) => {
    const before = action.before[i]!;
    const delta = totalOf(after);
    for (const [k, x] of totalOf(before)) delta.set(k, (delta.get(k) ?? 0) - x);
    const ps = [...(partners.get(after.herb) ?? [])].filter((p) => paired.has(p)).sort();
    const keep = ps.length ? 0.5 : 1;
    plus(paired.get(after.herb)!, Object.fromEntries(delta), keep);
    for (const p of ps) plus(paired.get(p)!, Object.fromEntries(delta), 0.5 / ps.length);
  });
  return action.herbs.map((after, i) => {
    const own = totalOf(action.before[i]!);
    const shared = paired.get(after.herb)!;
    const total = new Map(own);
    plus(total, Object.fromEntries(shared));
    return { herb: after.herb, role: roles.get(after.herb) ?? null, own: sortKeys(own), paired: sortKeys(shared), total: sortKeys(total) };
  });
}

// ── 君臣佐使, measured ───────────────────────────────────────────────────────

/** A reading of what the herb does in the formula: 主 (the largest share of the principal action) and the classical readings of 臣佐使. */
export type RoleReading = "主" | "助主" | "主次" | "佐助" | "佐制" | "反佐" | "引經" | "載藥" | "調和" | "為之使";

export interface RoleCheck {
  readonly herb: string;
  readonly labelled: Role;
  readonly readings: readonly RoleReading[];
  /** The labelled role is supported by at least one of its readings (§4.2). */
  readonly agrees: boolean;
  /** The herb's share of the principal action (signed; the shares of all herbs sum to 1). */
  readonly principalShare: number;
  /** How much of the other herbs' burden it offsets (weighted, ≥ 0). */
  readonly offsets: number;
}

export interface RoleReport {
  /** The panel dimension the formula acts on most (weighted), and the next. */
  readonly principal: string | null;
  readonly second: string | null;
  readonly checks: readonly RoleCheck[];
  /** The 君 herbs together take the largest share of the principal action of any role. */
  readonly junAsGroup: boolean;
}

const ROLE_READINGS: Record<Role, readonly RoleReading[]> = {
  君: ["主"],
  臣: ["助主", "主次"],
  佐: ["佐助", "佐制", "反佐"],
  使: ["引經", "載藥", "調和", "為之使"],
};

const organOf = (dim: string): string | null => {
  const head = dim.split(".")[0]!;
  return ["liuxie", "product", "bagang"].includes(head) ? null : head;
};

export interface RoleOptions {
  /** The deviation the formula's 治法 addresses (its own pattern's typical patient). Without it, the formula's own largest action is the target. */
  readonly target?: PanelVector | undefined;
  /** 引經報使 (§4.2: a 使 that leads to the channel of the target). */
  readonly yinjing?: readonly YinjingChannel[] | undefined;
}

/**
 * Measure the 君臣佐使 of `f` from its action (§4.2). The principal target is the component of the formula's own pattern that it brings back the most
 * (or, without a pattern, its largest action); a herb is read as 主 when it does the most for it. A disagreement is a finding for review, never a
 * relabelling.
 */
export function measureRoles(kb: KnowledgeBase, f: Formula, herbs: ReadonlyMap<string, Herb>, action: CompositionAction, contribs: readonly HerbContribution[],
  params: PrescriptionParams, options: RoleOptions = {}): RoleReport {
  // the targets and the sense in which a herb helps each
  const need = new Map<string, number>();
  let ranked: [string, number][] = [];
  if (options.target) {
    const k = bestScale(kb, options.target, action.total);
    ranked = Object.entries(options.target).filter(([, x]) => x !== 0).map(([d, D]): [string, number] => {
      const after = D + k * (action.total[d] ?? 0);
      need.set(d, -Math.sign(D));
      return [d, dimensionWeight(kb, d) * (D * D - after * after)];
    }).filter(([, r]) => r > 0).sort(byNameThenValue);
  }
  if (ranked.length === 0) {
    need.clear();
    ranked = Object.entries(action.benefit).map(([d, x]): [string, number] => [d, dimensionWeight(kb, d) * Math.abs(x)]).filter(([, x]) => x > 0).sort(byNameThenValue);
    for (const [d] of ranked) need.set(d, Math.sign(action.benefit[d] ?? 0));
  }
  const principal = ranked[0]?.[0] ?? null, second = ranked[1]?.[0] ?? null;
  const roles = new Map<string, Role>(f.composition.map((c) => [c.herb, c.role]));
  const along = (c: HerbContribution, d: string | null): number => (d === null ? 0 : (c.total[d] ?? 0) * (need.get(d) ?? Math.sign(action.benefit[d] ?? 0)));
  const principalTotal = contribs.reduce((a, c) => a + along(c, principal), 0);
  const top = (d: string | null): string | null => (d === null ? null : [...contribs].sort((a, b) => along(b, d) - along(a, d) || (a.herb < b.herb ? -1 : 1))[0]?.herb ?? null);
  const topPrincipal = top(principal), topSecond = top(second);

  const byRole = new Map<Role, number>();
  for (const c of contribs) if (c.role) byRole.set(c.role, (byRole.get(c.role) ?? 0) + along(c, principal));
  const junAsGroup = (byRole.get("君") ?? -Infinity) >= Math.max(...[...byRole].filter(([r]) => r !== "君").map(([, v]) => v), -Infinity);

  const burdenOf = new Map(action.herbs.map((a) => [a.herb, a.burden] as const));
  const jun = action.herbs.filter((a) => roles.get(a.herb) === "君");
  const junWarmth = jun.length ? jun.reduce((s, a) => s + a.temperature, 0) / jun.length : 0;
  // the channel to lead to: the principal target's organ, else the second's
  const organ = (principal && organOf(principal)) ?? (second && organOf(second)) ?? null;
  const guides = new Set(organ ? (options.yinjing ?? []).filter((c) => c.organ === organ).flatMap((c) => c.herbs) : []);
  const focus = organ ? Math.max(...action.herbs.map((a) => a.tropism[organ] ?? 0)) : 0;
  const restrains = new Set(action.applied.filter((p) => p.type === "相畏").map((p) => p.other));
  const serves = new Set(action.applied.filter((p) => p.type === "相使").map((p) => p.other));

  const checks = contribs.map((c): RoleCheck => {
    const a = action.herbs.find((h) => h.herb === c.herb)!;
    const others = new Map<string, number>();
    for (const [h, b] of burdenOf) if (h !== c.herb) plus(others, b);
    let offsets = 0;
    for (const [d, b] of others) {
      if (b === 0) continue;
      offsets += dimensionWeight(kb, d) * Math.min(Math.abs(b), Math.max(0, -Math.sign(b) * (c.total[d] ?? 0)));
    }
    // 佐助: it helps a target other than the principal, or the formula's own action anywhere else (a 兼證)
    const secondary = [...new Set([...need.keys(), ...Object.keys(action.benefit)])].filter((d) => d !== principal)
      .reduce((s, d) => s + dimensionWeight(kb, d) * Math.max(0, need.has(d) ? along(c, d) : (c.total[d] ?? 0) * Math.sign(action.benefit[d] ?? 0)), 0);
    const harmonises = (herbs.get(c.herb)?.functions ?? []).some((fn) => fn.includes("調和"));
    const readings: RoleReading[] = [];
    if (c.herb === topPrincipal) readings.push("主");
    if (along(c, principal) > 0 && c.herb !== topPrincipal) readings.push("助主");
    if (c.herb === topSecond && c.herb !== topPrincipal) readings.push("主次");
    if (secondary > 0) readings.push("佐助");
    if (offsets > 0 || restrains.has(c.herb)) readings.push("佐制");
    if (junWarmth !== 0 && Math.sign(a.temperature) === -Math.sign(junWarmth) && a.x < params.roles.fanzuo_below) readings.push("反佐");
    if (organ && (guides.has(c.herb) || (focus > 0 && (a.tropism[organ] ?? 0) === focus))) readings.push("引經");
    if (Math.abs(a.direction) >= params.roles.carrier_min) readings.push("載藥");
    if (offsets > 0 || harmonises) readings.push("調和");
    if (serves.has(c.herb)) readings.push("為之使");
    const labelled = roles.get(c.herb)!;
    const agrees = labelled === "君" ? readings.includes("主") || junAsGroup : ROLE_READINGS[labelled].some((r) => readings.includes(r));
    return { herb: c.herb, labelled, readings, agrees, principalShare: principalTotal ? along(c, principal) / principalTotal : 0, offsets };
  });
  return { principal, second, checks, junAsGroup };
}

// ── why it fits: 病機 → 治法 → 方 → 藥 → 未盡 ────────────────────────────────

export interface MechanismComponent {
  readonly dim: string;
  /** D_d */
  readonly deviation: number;
  /** D_d + k·T_d */
  readonly after: number;
  /** w_d·(D_d² − after²): positive when the formula brings the component back. */
  readonly reduction: number;
  /** The share of the component the formula removes (reduction ÷ w_d·D_d²), when there is a deviation. */
  readonly share: number | null;
  /** Each herb's part of the reduction (they sum to it exactly), largest first. */
  readonly herbs: readonly { readonly herb: string; readonly part: number }[];
}

export interface HerbMechanism {
  readonly herb: string;
  readonly role: Role | null;
  /** Components the herb brings back, with its share of each formula reduction it takes part in, largest first. */
  readonly reduces: readonly { readonly dim: string; readonly share: number }[];
  /** Components it pushes the wrong way (its part is negative), with the herbs that bring them back. */
  readonly worsens: readonly { readonly dim: string; readonly part: number; readonly offsetBy: readonly string[] }[];
}

export interface Mechanism {
  readonly formula: string;
  /** The scale of the composition that fits the deviation best (relative; not an amount). */
  readonly k: number;
  readonly costBefore: number;
  readonly costAfter: number;
  /** 病機: the deviation's largest components. */
  readonly bingji: readonly { readonly dim: string; readonly deviation: number }[];
  /** 治法: the formula's principle and the components it addresses (removes at least θ of). */
  readonly zhifa: { readonly principle: string; readonly addresses: readonly string[] };
  /** 方: every component the deviation or the formula touches. */
  readonly components: readonly MechanismComponent[];
  /** 藥: what each herb does for this deviation. */
  readonly herbs: readonly HerbMechanism[];
  /** 未盡: what remains, largest first — the reason for 加減. */
  readonly residual: readonly { readonly dim: string; readonly value: number }[];
}

/** Why `f` fits deviation `dev` (§4.3), computed from the composition's action and the herbs' contributions. */
export function formulaMechanism(kb: KnowledgeBase, dev: PanelVector, f: Formula, action: CompositionAction, contribs: readonly HerbContribution[], params: PrescriptionParams): Mechanism {
  const t = action.total;
  const k = bestScale(kb, dev, t);
  const scaled: Record<string, number> = {};
  for (const [d, x] of Object.entries(t)) scaled[d] = k * x;
  const dims = [...new Set([...Object.keys(dev), ...Object.keys(t)])].sort();
  const components = dims.map((d): MechanismComponent => {
    const w = dimensionWeight(kb, d), D = dev[d] ?? 0, T = t[d] ?? 0, after = D + k * T;
    const reduction = w * (D * D - after * after);
    const herbs = contribs.map((c) => ({ herb: c.herb, part: -w * k * (c.total[d] ?? 0) * (2 * D + k * T) })).filter((h) => h.part !== 0)
      .sort((a, b) => b.part - a.part || (a.herb < b.herb ? -1 : 1));
    return { dim: d, deviation: D, after, reduction, share: D !== 0 && w > 0 ? reduction / (w * D * D) : null, herbs };
  });
  const top = params.mechanism.top;
  const bingji = Object.entries(dev).filter(([, x]) => x !== 0).map(([d, x]): [string, number] => [d, dimensionWeight(kb, d) * x * x]).sort(byNameThenValue).slice(0, top)
    .map(([d]) => ({ dim: d, deviation: dev[d]! }));
  const addresses = components.filter((c) => c.share !== null && c.share >= params.mechanism.theta).sort((a, b) => b.reduction - a.reduction || (a.dim < b.dim ? -1 : 1)).map((c) => c.dim);
  const herbs = contribs.map((c): HerbMechanism => {
    const reduces: { dim: string; share: number }[] = [];
    const worsens: { dim: string; part: number; offsetBy: string[] }[] = [];
    for (const comp of components) {
      const mine = comp.herbs.find((h) => h.herb === c.herb)?.part ?? 0;
      if (mine > 0 && comp.reduction > 0) reduces.push({ dim: comp.dim, share: mine / comp.reduction });
      if (mine < 0) worsens.push({ dim: comp.dim, part: mine, offsetBy: comp.herbs.filter((h) => h.part > 0).map((h) => h.herb) });
    }
    reduces.sort((a, b) => b.share - a.share || (a.dim < b.dim ? -1 : 1));
    worsens.sort((a, b) => a.part - b.part || (a.dim < b.dim ? -1 : 1));
    return { herb: c.herb, role: c.role, reduces, worsens };
  });
  const residual = components.filter((c) => Math.abs(c.after) > 1e-9).map((c): [string, number] => [c.dim, dimensionWeight(kb, c.dim) * c.after * c.after]).sort(byNameThenValue)
    .slice(0, top).map(([d]) => ({ dim: d, value: components.find((c) => c.dim === d)!.after }));
  return { formula: f.id, k, costBefore: cost(kb, dev, {}), costAfter: cost(kb, dev, scaled), bingji, zhifa: { principle: f.principle, addresses }, components, herbs, residual };
}

/** The whole analysis of a formula at its own amounts: its action, the herbs' shares and the measured roles. Null without amounts in the bundle. */
export function analyseFormula(kb: KnowledgeBase, f: Formula, herbs: ReadonlyMap<string, Herb>, tables: PrescriptionTables, target?: PanelVector):
  { rows: ClassicalRows; action: CompositionAction; contributions: HerbContribution[]; roles: RoleReport } | null {
  const rows = classicalRows(f, herbs);
  if (!rows) return null;
  const action = compositionAction(herbs, rows.rows, tables);
  const contribs = contributions(action, new Map(f.composition.map((c) => [c.herb, c.role])));
  return { rows, action, contributions: contribs, roles: measureRoles(kb, f, herbs, action, contribs, tables.params, { target, yinjing: tables.yinjing }) };
}
