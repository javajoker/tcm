// The personalised prescription in words (PM-41): one model for the formula page's card and the practitioner summary's section, so they cannot disagree.
// Built from the stored prescription and the knowledge base; the texts come from the `rx` messages (catalog.ts) and the app's own (labels of panel dimensions,
// roles, interactions). Nothing here computes: the prescription is shown as it was made.
import type { AmountFactor, Prescription, PrescriptionChange } from "@tcm/engine/prescription";
import type { KnowledgeBase } from "@tcm/kb";
import type { T } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { dimLabel } from "../screens/result/FormulaDetail.tsx";
import { ROLE_SLUG } from "../screens/result/words.ts";
import type { Rx, RxKey } from "./catalog.ts";

const AGE_SLUG: Readonly<Record<string, string>> = { 新生兒: "newborn", 乳兒: "infant", 幼兒: "child", 學齡兒童: "school", elderly: "elderly" };
const SEASON_SLUG: Readonly<Record<string, string>> = { 木: "wood", 火: "fire", 金: "metal", 水: "water" };
const PAIR_CHAR: Readonly<Record<string, string>> = { xu: "須", shi: "使", wei: "畏", wu: "惡", fan: "反" };

export interface RxRow {
  readonly role: string;
  readonly herb: string;
  readonly added: boolean;
  readonly grams: string;
  readonly range: string;
  readonly why: string;
}

export interface RxView {
  readonly title: string;
  readonly intro: string;
  readonly draft: string;
  /** Set when the prescription was withheld (a rule touched the 君): the reason, and nothing else is listed. */
  readonly withheld: string | null;
  readonly base: string;
  readonly changes: readonly string[];
  readonly amounts: boolean;
  readonly rows: readonly RxRow[];
  readonly cautions: readonly string[];
  readonly why: readonly string[];
  readonly footer: string;
  readonly version: string;
}

/** The view of a stored prescription in the page language. `t` is the app's translator, `rx` the prescription's own. */
export function rxView(p: Prescription, kb: KnowledgeBase, t: T, rx: Rx): RxView {
  const sep = t.lang === "en" ? ", " : "、";
  const k = (key: RxKey, params?: Record<string, string | number>): string => rx.t(key, params);
  const app = (key: string, params?: Record<string, string | number>): string => t.t(key as MessageKey, params);
  const herb = (id: string): string => {
    const v = kb.herbs?.get(id)?.name ?? kb.herbName(id)?.name;
    return v ? t.localized(v).text : id;
  };
  const bySlug = (slug: string): string => herb(`herb-${slug}`);
  const pct = (x: number): string => t.number(x, { style: "percent", maximumFractionDigits: 0 });
  const dims = (ds: readonly string[]): string => ds.map((d) => dimLabel(t, d)).join(sep);
  const interaction = (flag: string): string => (t.has(`formula.interaction.${flag}`) ? app(`formula.interaction.${flag}`) : flag);
  const pair = (id: string): string => {
    const [a, type, b] = id.split(".") as [string, string, string];
    return `${bySlug(a)}${t.lang === "en" ? " " : ""}${PAIR_CHAR[type] ?? type}${t.lang === "en" ? " " : ""}${bySlug(b)}`;
  };

  const reason = (rule: string): string => {
    if (rule === "yinren.pregnancy") return k("rx.reason.pregnancy");
    if (rule === "yinren.allergy") return k("rx.reason.allergy");
    if (rule.startsWith("yinren.interaction:")) return k("rx.reason.interaction", { what: interaction(rule.slice("yinren.interaction:".length)) });
    return rule;
  };
  const change = (c: PrescriptionChange): string => {
    const h = herb(c.herb);
    let line: string;
    if (c.rule === "yinren.pregnancy") line = k("rx.change.remove.pregnancy", { herb: h });
    else if (c.rule === "yinren.allergy") line = k("rx.change.remove.allergy", { herb: h });
    else if (c.rule.startsWith("yinren.interaction:")) line = k("rx.change.remove.interaction", { herb: h, what: interaction(c.rule.slice("yinren.interaction:".length)) });
    else if (c.rule.startsWith("jiajian.classical:")) line = k(c.op === "add" ? "rx.change.classical.add" : "rx.change.classical.remove", { herb: h, book: t.zh(c.source ?? "") });
    else line = k("rx.change.residual", { herb: h, dims: dims(c.improves ?? []) });
    return c.via && c.via.length > 0 ? `${line} ${k("rx.change.via", { pairs: c.via.map(pair).join(sep) })}` : line;
  };
  const factor = (f: AmountFactor, strength: string): string => {
    const times = `×${t.number(f.factor, { maximumFractionDigits: 2 })}`;
    let label: string;
    if (f.rule === "severity") label = k(`rx.factor.severity.${strength}` as RxKey);
    else if (f.rule.startsWith("age:")) label = k(`rx.factor.age.${AGE_SLUG[f.rule.slice(4)] ?? "elderly"}` as RxKey);
    else if (f.rule.startsWith("constitution:")) {
      const c = kb.constitutions.find((x) => x.id === f.rule.slice("constitution:".length));
      label = k("rx.factor.constitution", { name: c ? t.localized(c.name).text : f.rule });
    } else if (f.rule.startsWith("season:")) label = k("rx.factor.season", { season: k(`rx.season.${SEASON_SLUG[f.rule.slice(7)] ?? "wood"}` as RxKey) });
    else if (f.rule === "toxic-cap") label = k("rx.factor.toxicCap");
    else if (f.rule === "range-top") label = k("rx.factor.rangeTop");
    else if (f.rule === "range-bottom") label = k("rx.factor.rangeBottom");
    else label = f.rule;
    return `${label} ${times}`;
  };

  const common = { title: k("rx.title"), intro: k("rx.intro"), draft: k("rx.draft"), footer: k("rx.footer"), version: k("rx.version", { params: p.version.params, kb: p.version.kb }) };
  if (p.withheld) {
    return { ...common, withheld: k("rx.withheld", { herb: herb(p.withheld.herb), reason: reason(p.withheld.rule) }), base: "", changes: [], amounts: p.amounts, rows: [], cautions: [], why: [] };
  }
  const formula = kb.formulas.get(p.base.formula);
  const rows = p.composition.map((r): RxRow => ({
    // 君臣佐使 in Chinese; with the English name beside it in English (in Chinese the label is the character itself)
    role: t.lang === "en" ? `${r.role} ${app(`report.role.${ROLE_SLUG[r.role]}`)}` : t.zh(r.role),
    herb: herb(r.herb),
    added: r.source !== "formula",
    grams: r.amountG === null ? "—" : k("rx.grams", { g: t.number(r.amountG, { maximumFractionDigits: 2 }) }),
    range: r.rangeG ? k("rx.range", { min: t.number(r.rangeG[0]), max: t.number(r.rangeG[1]) }) : k("rx.noRange"),
    why: r.factors.map((f) => factor(f, p.base.strength)).join(sep),
  }));
  const cautions = p.cautions.map((c) => {
    if (c.rule === "pregnancy:caution") return k("rx.caution.pregnancy", { herb: herb(c.herb) });
    if (c.rule === "identity:aristolochic") return k("rx.caution.identity", { herb: herb(c.herb) });
    return k("rx.caution.interaction", { herb: herb(c.herb), what: interaction(c.rule.replace(/^interaction:/, "")) });
  });
  const why: string[] = [];
  const m = p.mechanism;
  if (m) {
    if (m.bingji.length > 0) why.push(k("rx.why.bingji", { dims: dims(m.bingji.map((b) => b.dim)) }));
    why.push(k("rx.why.zhifa", { principle: t.zh(m.zhifa.principle), dims: m.zhifa.addresses.length > 0 ? dims(m.zhifa.addresses) : "—" }));
    for (const h of m.herbs) {
      const top = h.reduces.slice(0, 2);
      if (top.length === 0) continue;
      why.push(k("rx.why.herb", { herb: herb(h.herb), dims: top.map((x) => k("rx.why.share", { dim: dimLabel(t, x.dim), pct: pct(x.share) })).join(sep) }));
    }
    if (m.residual.length > 0) why.push(k("rx.why.residual", { dims: dims(m.residual.map((r) => r.dim)) }));
  }
  return {
    ...common, withheld: null,
    base: k("rx.base", { formula: formula ? t.localized(formula.name).text : p.base.formula, pct: pct(p.base.explained) }),
    changes: p.changes.length > 0 ? p.changes.map(change) : [k("rx.changes.none")],
    amounts: p.amounts, rows, cautions, why,
  };
}
