// The practitioner reference (PM-65; apps/web/src/practitioner): a case through the app's own pipeline and its report — read with the app's own semantics, computed by
// the engine as the app computes a practitioner's result, held by the same safety policy, and written in the practitioner's voice from the app's own summary and plan.
import * as engine from "@tcm/engine";
import { createI18n, placeholdersOf, type Message } from "@tcm/i18n";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, withoutBirthMoment } from "../src/app/assessment.ts";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import pEn from "../src/i18n/en/practitioner.json";
import rxEn from "../src/i18n/en/rx.json";
import pZh from "../src/i18n/zh-Hant/practitioner.json";
import rxZh from "../src/i18n/zh-Hant/rx.json";
import { draftOf, readCase, type PractitionerCase } from "../src/practitioner/case.ts";
import { dataOf, reportOf } from "../src/practitioner/report.ts";
import { runCase } from "../src/practitioner/run.ts";
import { vocabularyOf } from "../src/practitioner/vocabulary.ts";
import { RX_VOICE, VOICE, wordsOf } from "../src/practitioner/words.ts";
import { prescriptionSection } from "../src/prescription/summary.ts";
import { applyAnswer } from "../src/screens/inquiry/model.ts";
import { MED_CLASSES, SERIOUS_CONDITIONS } from "../src/screens/profile/model.ts";
import { newDraft } from "../src/storage/draft.ts";

const kb = await indexKnowledgeBase(rawChunksFromDisk("release")).forRole("practitioner");
const NOW = Date.UTC(2026, 9, 16, 4);

/** A typical 脾氣虛 patient as a practitioner describes one: what is present, the core questions answered, the tongue, the pulse and the constitution. */
const CASE = {
  date: "2026-10-16",
  person: { age: 45, sex: "female", pregnancy: "no", lactating: false, medications: { status: "none" }, allergies: { status: "none" }, conditions: { status: "none" } },
  constitution: { primary: "C_QIXU" }, course: "chronic",
  findings: { S_FATIGUE: "moderate", S_LAZY_SPEAK: "moderate", S_POOR_APPETITE: "moderate", S_POSTPRANDIAL_BLOAT: "moderate", S_LOOSE_STOOL: "moderate", S_BLAND_MOUTH: "present", S_FACE_SALLOW: "present", S_NO_THIRST: "present", S_PREFER_HOT_FOOD: "present" },
  answers: Object.fromEntries(["Q_COLD", "Q_HEAT", "Q_SWEAT", "Q_HEAD", "Q_BODY", "Q_URINE", "Q_CHEST", "Q_ABDOMEN", "Q_EAR_EYE", "Q_THROAT", "Q_SLEEP", "Q_EMOTION", "Q_MENSES", "Q_VOICE_BREATH", "Q_LIPS_NAILS"].map((q) => [q, "none"])),
  tongue: { body: ["T_BODY_PALE"], coat: ["T_COAT_THIN_WHITE"], signs: ["T_TOOTHMARK_EDGE"] },
  pulse: { qualities: ["P_THIN", "P_WEAK"] },
} as const;
type Json = Record<string, unknown>;
const withPerson = (over: Json): Json => ({ ...CASE, person: { ...CASE.person, ...over } });
const run = (c: unknown) => runCase(kb, c, NOW);
const errorsOf = (c: unknown) => readCase(kb, c).errors;

describe("reading a case", () => {
  it("a well-formed case reads; every error names where it is, and an unknown id comes with the ids it may have meant", () => {
    expect(errorsOf(CASE)).toEqual([]);
    const bad = errorsOf({ ...CASE, findings: { ...CASE.findings, S_FATIGU: "present" }, answers: { Q_COLDD: "none" }, constitution: { primary: "C_QIXUU" }, extra: 1 });
    expect(bad.find((e) => e.path === "findings/S_FATIGU")?.suggest).toContain("S_FATIGUE");
    expect(bad.find((e) => e.path === "answers/Q_COLDD")?.suggest).toContain("Q_COLD");
    expect(bad.find((e) => e.path === "constitution/primary")?.suggest).toContain("C_QIXU");
    expect(bad.some((e) => e.path === "extra")).toBe(true);
  });

  it("checks the vocabulary's own rules, never clinical sense", () => {
    const paths = (c: unknown): string[] => errorsOf(c).map((e) => `${e.path}: ${e.message}`);
    expect(paths({ ...CASE, findings: { ...CASE.findings, S_BLAND_MOUTH: "severe" } }).join()).toMatch(/S_BLAND_MOUTH is not graded/);
    expect(paths({ ...CASE, findings: { T_BODY_PALE: "present" } }).join()).toMatch(/a tongue feature: put it under tongue/);
    expect(paths({ ...CASE, findings: { ...CASE.findings, S_CONSTIPATION: "present" } }).join()).toMatch(/S_LOOSE_STOOL and S_CONSTIPATION exclude each other/);
    expect(paths({ ...withPerson({ sex: "male", pregnancy: undefined, lactating: undefined }) }).join()).toMatch(/answers\/Q_MENSES: asked of the female sex only/);
    expect(paths({ ...CASE, pulse: { rate: 100, qualities: ["P_RAPID"] } }).join()).toMatch(/read from the rate/);
    expect(paths({ ...CASE, redFlags: ["RF_C_KIDNEY"] }).join()).toMatch(/record it on the person/);
    expect(paths({ ...CASE, findings: { ...CASE.findings, S_COLD_LIMBS: "present" }, answers: { ...CASE.answers } }).join()).toMatch(/S_COLD_LIMBS is also under findings/);
    expect(paths(withPerson({ medications: { status: "some" } })).join()).toMatch(/give the classes/);
    expect(paths({ ...CASE, tongue: { body: ["T_COAT_YELLOW"] } }).join()).toMatch(/not a body feature/);
  });

  it("silence is never no: a missing safety fact leaves the case incomplete, saying what to ask", () => {
    const { pregnancy: _p, lactating: _l, medications: _m, ...person } = CASE.person;
    const r = run({ ...CASE, person });
    expect(r.status).toBe("incomplete");
    expect(r.missing).toEqual(["pregnancy", "lactating", "medications"]);
    expect(r.saved).toBeNull();
    expect(run(withPerson({ age: 70, pregnancy: undefined, lactating: undefined })).status).toBe("ok");   // not asked of a woman over 60
  });

  it("the draft is the app's: a whole answer as the inquiry records it, a finding as said, the tongue and the pulse as the observation screens record them", () => {
    const q = kb.questionById.get("Q_COLD")!;
    const c = readCase(kb, { ...CASE, answers: { Q_COLD: ["fear_cold"] }, findings: { S_FATIGUE: "present", S_CONSTIPATION: "absent" } }).value as PractitionerCase;
    const d = draftOf(kb, c, NOW);
    const app = applyAnswer(newDraft("x", NOW), q, { kind: "answered", options: ["fear_cold"], severities: {} });
    for (const s of q.options.flatMap((o) => o.symptoms)) expect(d.findings[s], s).toEqual(app.findings[s]);
    expect(d.findings.S_FATIGUE).toEqual({ state: "present", severity: "moderate" });       // a graded finding said present: the app's default severity
    expect(d.findings.S_CONSTIPATION).toEqual({ state: "absent" });
    expect(d.findings.T_BODY_PALE).toEqual({ state: "present", source: "guided" });
    expect(d.findings.T_BODY_RED).toEqual({ state: "absent", source: "guided" });            // the other features of an answered category
    expect(d.findings.T_TOOTHMARK_EDGE).toEqual({ state: "present", source: "guided" });
    expect(d.findings.P_WEAK).toEqual({ state: "present", source: "pulse" });
    const rate = draftOf(kb, readCase(kb, { ...CASE, pulse: { rate: 96 } }).value!, NOW);
    expect(rate.findings.P_RAPID).toEqual({ state: "present", source: "measured" });
    expect(rate.observe.pulse).toEqual({ rate: 96, rhythm: null, method: "typed" });
  });
});

describe("the reference", () => {
  it("a typical 脾氣虛 case: the engine's own result, as the app makes a practitioner's, with the medication plan at L3", () => {
    const r = run(CASE);
    expect(r.status).toBe("ok");
    const saved = r.saved!;
    expect(saved.role).toBe("practitioner");
    expect(saved.result.policy.level).toBe("L3");
    expect(saved.result.patterns[0]!.id).toBe("SP1");
    const at = Date.parse(`${CASE.date}T12:00:00Z`);                                            // a dated case is computed for noon (UTC) of its date
    const again = engine.assess(kb, { ...assessInputOf(draftOf(kb, readCase(kb, CASE).value!, at), at)!, statedConstitution: CASE.constitution });
    expect(saved.result).toEqual(withoutBirthMoment(again));                                                        // the engine's result, deterministically
    const p = saved.prescription!;
    expect(p.base.formula).toBe(saved.result.recommendations.formulas.find((f) => !f.studyOnly)!.id);
    expect(p.amounts).toBe(true);
    for (const row of p.composition) if (row.rangeG) expect(row.amountG! >= row.rangeG[0] && row.amountG! <= row.rangeG[1], row.herb).toBe(true);
  });

  it("the constitution the practitioner states reaches the plan's 三因 rules", () => {
    const factors = (c: string): string[] => run({ ...CASE, constitution: { primary: c } }).saved!.prescription!.composition.flatMap((row) => row.factors.map((f) => f.rule));
    expect(factors("C_YANGXU")).toContain("constitution:C_YANGXU");
    expect(factors("C_PINGHE").some((f) => f.startsWith("constitution:"))).toBe(false);
    expect(run({ ...CASE, constitution: { primary: "C_YANGXU" } }).saved!.result.constitution!.result.stated).toBe(true);
  });

  it("the safety policy holds for every case: a medicine or an allergy match gives L1 and no plan; pregnancy, a minor, a red flag or a serious condition give L0 and no formula", () => {
    const meds = run(withPerson({ medications: { status: "some", classes: ["antihypertensive"] } })).saved!;
    expect(meds.result.policy.level).toBe("L1");
    expect(meds.prescription).toBeUndefined();
    for (const c of [withPerson({ pregnancy: "yes" }), withPerson({ age: 8, pregnancy: undefined, lactating: undefined }), { ...CASE, redFlags: ["RF_A_CHEST_PAIN"] }, withPerson({ conditions: { status: "some", items: ["RF_C_KIDNEY"] } })]) {
      const s = run(c).saved!;
      expect(s.result.policy.level, JSON.stringify(c).slice(0, 80)).toBe("L0");
      expect(s.result.recommendations.formulas).toEqual([]);
      expect(s.prescription).toBeUndefined();
    }
  });

  for (const lang of ["zh-Hant", "en"] as const) {
    it(`the report, in ${lang}: the app's summary and plan in the practitioner's voice — no line addresses the reader — with the formula, its reasoning, the herbs to note and the provenance`, () => {
      const r = run({ ...CASE, lang });
      const md = reportOf(kb, r);
      const { t, rx, p } = wordsOf(lang);
      expect(md).toContain(`# ${p.t("practitioner.title")}`);
      expect(md).toContain(p.t("practitioner.draft"));
      expect(md).toContain(p.t("practitioner.level.L3"));
      expect(md).toContain(t.t("safety.notice.amounts.text"));                                  // N-AMOUNTS beside the quantities
      const formula = kb.formulas.get(r.saved!.prescription!.base.formula)!;
      expect(md).toContain(lang === "en" ? formula.rationale_en : formula.rationale_zh);
      // the plan is the app's own section, rendered with the practitioner's words
      const plan = prescriptionSection(r.saved!, kb, t, rx)!;
      for (const row of plan.table!.rows) expect(md).toContain(`| ${row.join(" | ")} |`);
      expect(md).toMatch(lang === "en" ? /\| 君 Sovereign \| Ginseng \(人參\) \| 9 g \|/ : /\| 君 \| 人參 \| 9 克 \|/);
      expect(md).toContain(lang === "en" ? "Spleen qi deficiency (脾氣虛)" : "脾氣虛");
      expect(md).toContain(lang === "en" ? "may interact with:" : "可能與下列情況交互作用：");
      expect(md).not.toMatch(lang === "en" ? /\b(you|your|yours|yourself)\b/i : /[您你]/);
      expect(md).not.toContain("practitioner.");                                                // no key left as a key
    });
  }

  it("held at L1 by a medicine: the formula by name and composition, and why there is no plan", () => {
    const md = reportOf(kb, run(withPerson({ medications: { status: "some", classes: ["antihypertensive"], named: ["amlodipine"] } })));
    expect(md).toContain("本例只列方劑的名稱與組成，不列加減與參考份量：服用藥物（降血壓藥、amlodipine）。");
    expect(md).toMatch(/組成：君：人參、白朮、茯苓；臣：/);
    expect(md).toContain("此等級不列加減與參考份量");
    expect(md).not.toMatch(/\d+(\.\d+)? 克/);
  });

  it("on an anticoagulant: the formulas a safety rule removed are named with the rule's words, and the report says they were removed — not that nothing fits", () => {
    const { Q_MENSES: _menses, ...answers } = CASE.answers;                                     // a man is not asked about menses
    const r = run({ ...withPerson({ age: 62, sex: "male", pregnancy: undefined, lactating: undefined, medications: { status: "some", classes: ["anticoagulant", "antidiabetic"], named: ["warfarin"] } }), answers });
    const removed = r.saved!.result.suppressed.filter((s) => s.kind === "formula" && s.reason === "rule");
    expect(removed.length).toBeGreaterThan(0);
    const en = reportOf(kb, { ...r, lang: "en" });
    expect(en).toContain("takes medicines (Anticoagulant / antiplatelet, Blood-sugar medicine, warfarin)");
    expect(en.match(/takes medicines/g)).toHaveLength(1);                                      // the two cells of medicines are one reason
    expect(en).toContain("removed by a safety rule (On anticoagulants/antiplatelets: blood-activating or interacting herbs not recommended.)");
    expect(en).toContain("The formulas that fit this case were removed by safety rules");
    expect(en).not.toContain("may lie outside");
  });

  it("a red flag of level A: referral first, no formula", () => {
    const md = reportOf(kb, run({ ...CASE, redFlags: ["RF_A_CHEST_PAIN"] }));
    expect(md).toContain("A 級警訊：胸痛或胸悶壓迫，伴冷汗。應立即轉介急診；本參考不列方藥。");
    expect(md).not.toContain("### 用藥方案");
  });

  it("a short case: no formula yet, and the inquiry's questions that would raise the confidence", () => {
    const r = run({ ...CASE, answers: {}, findings: { S_FATIGUE: "moderate", S_POOR_APPETITE: "moderate" } });
    expect(r.saved!.result.policy.level).toBe("L0");
    expect(r.next!.done).toBeNull();
    const md = reportOf(kb, r);
    expect(md).toContain("## 若要提高把握度，可再詢問");
    expect((md.match(/^- .+：.+（(核心問題|區分「.+」與「.+」)）$/gm) ?? []).length).toBeGreaterThan(3);
  });

  it("what the practitioner said that the vocabulary does not hold is shown, never used", () => {
    const r = run({ ...CASE, unmapped: ["月經量少色淡"] });
    expect(reportOf(kb, r)).toContain("未參與推算的內容：月經量少色淡");
    expect(r.saved!.result).toEqual(run(CASE).saved!.result);
  });

  it("the practitioner's voice keeps the placeholders of the app's lines it replaces", () => {
    const zh = pZh as Record<string, Message>, en = pEn as Record<string, Message>;
    const same = (a: Message, b: Message): void => expect(placeholdersOf(a).params.sort()).toEqual(placeholdersOf(b).params.sort());
    for (const [key, voice] of Object.entries(VOICE)) { same(catalogs["zh-Hant"][key as MessageKey], zh[voice!]!); same(catalogs.en[key as MessageKey]!, en[voice!]!); }
    for (const [key, voice] of Object.entries(RX_VOICE)) { same((rxZh as Record<string, Message>)[key]!, zh[voice!]!); same((rxEn as Record<string, Message>)[key]!, en[voice!]!); }
    const plain = createI18n<MessageKey>(catalogs, "zh-Hant");
    expect(plain.t("report.pract.symptoms")).toBe("自述的症狀");                                  // the app's own words are untouched
    expect(wordsOf("zh-Hant").t.t("report.pract.symptoms")).toBe("問診所得");
  });

  it("the case as data: the level, the leading patterns, the formulas and the plan in the summary file's shape", () => {
    const d = dataOf(kb, run(CASE));
    expect(d.level).toBe("L3");
    expect((d.patterns as { id: string }[])[0]!.id).toBe("SP1");
    expect((d.plan as { composition: unknown[] }).composition.length).toBeGreaterThan(3);
    expect(dataOf(kb, run({ ...CASE, person: {} }))).toMatchObject({ status: "incomplete" });
    expect(dataOf(kb, run({ nonsense: true }))).toMatchObject({ status: "invalid" });
  });
});

describe("the vocabulary", () => {
  it("names every id a case may use", () => {
    const md = vocabularyOf(kb);
    const ids = [
      ...kb.questions.map((q) => q.id), ...kb.questions.flatMap((q) => q.options.filter((o) => !o.context).map((o) => o.id)), ...kb.symptoms.keys(),
      ...kb.tongue.features.map((f) => f.id), ...kb.pulse.pulses.map((p) => p.id), ...kb.constitutions.map((c) => c.id),
      ...kb.redFlags.filter((f) => f.level !== "C").map((f) => f.id), ...MED_CLASSES, ...SERIOUS_CONDITIONS,
    ];
    for (const id of ids) expect(md, id).toContain(`\`${id}\``);
    expect(md).not.toContain("`RF_C_PREGNANT`");                                                // pregnancy is the person's, not a red flag
  });
});
