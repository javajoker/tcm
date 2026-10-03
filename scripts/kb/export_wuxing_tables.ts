// Exports the static tables of @tcm/wuxing as JSON on stdout, so data/wuxing/*.json has a single source of
// truth (the TypeScript engine). Run with Node >= 22.18 (type stripping): node scripts/kb/export_wuxing_tables.ts
import {
  STEMS, BRANCHES, HIDDEN_STEMS, HIDDEN_ROLES, GENERATES, CONTROLS, SILING, MONTH_BRANCH_ORDER, elementOf, polarityOf, branchElement,
  branchQiPolarity, SOLAR_TERMS, SIX_QI_ORDER, HOST_QI, QI_ELEMENT, QI_EVIL, SITIAN_OF_BRANCH, suiYunOf, zaiQuanOf, guestQiOf, DEFAULT_PARAMS,
  DEFAULT_PROFILE_PARAMS, DEFAULT_TRANSMISSION_PARAMS, ZANG_OF, FU_OF, SEASON_NAME_OF, yunqiOfYear,
} from "../../packages/wuxing/src/index.ts";

const out = {
  ganzhi: {
    stems: STEMS.map((s, i) => ({ id: s, index: i, element: elementOf(s), polarity: polarityOf(s) })),
    branches: BRANCHES.map((b, i) => ({
      id: b, index: i, element: branchElement(b), qi_polarity: branchQiPolarity(b), positional_polarity: i % 2 === 0 ? "陽" : "陰",
      hidden: HIDDEN_STEMS[b].map((stem, k) => ({ stem, role: HIDDEN_ROLES[k] })), siling: SILING[b],
    })),
    month_branch_order: MONTH_BRANCH_ORDER,
    generates: GENERATES, controls: CONTROLS,
    solar_terms: SOLAR_TERMS,
    zang: ZANG_OF, fu: FU_OF, season_of_element: SEASON_NAME_OF,
  },
  yunqi: {
    six_qi_order: SIX_QI_ORDER, host_qi_steps: HOST_QI, qi_element: QI_ELEMENT, qi_evil: QI_EVIL,
    sitian_of_branch: SITIAN_OF_BRANCH,
    zaiquan_of_sitian: Object.fromEntries(SIX_QI_ORDER.map((q) => [q, zaiQuanOf(q)])),
    suiyun_of_stem: Object.fromEntries(STEMS.map((s) => [s, suiYunOf(s)])),
    guest_qi_by_sitian: Object.fromEntries(SIX_QI_ORDER.map((q) => [q, [1, 2, 3, 4, 5, 6].map((k) => guestQiOf(q, k))])),
    steps_by_longitude: [
      { step: 1, name: "初之氣", from: 300, to: 0 }, { step: 2, name: "二之氣", from: 0, to: 60 }, { step: 3, name: "三之氣", from: 60, to: 120 },
      { step: 4, name: "四之氣", from: 120, to: 180 }, { step: 5, name: "五之氣", from: 180, to: 240 }, { step: 6, name: "終之氣", from: 240, to: 300 },
    ],
    year_starts_at: "大寒 (apparent solar longitude 300°)",
    examples: [2024, 2025, 2026, 2027].map((y) => { const q = yunqiOfYear(y); return { year: y, ganzhi: q.stem + q.branch, suiyun: q.suiYun, sitian: q.siTian, zaiquan: q.zaiQuan, guest_qi: q.guestQi }; }),
  },
  params: { engine: DEFAULT_PARAMS, profile: DEFAULT_PROFILE_PARAMS, transmission: DEFAULT_TRANSMISSION_PARAMS },
};
process.stdout.write(JSON.stringify(out));
