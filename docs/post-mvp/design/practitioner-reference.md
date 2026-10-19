# Design: The Practitioner Reference Skill

| | |
|---|---|
| **Version** | 0.2 (draft) |
| **Status** | **Built (PM-65; PM-66 applies the owner's decisions of 2026-10-19, §6; PM-67 is next)** — the Agent Skill `tcm-practitioner-reference`, its script and its tests. A draft like the knowledge base it carries, for the project's internal doctors, learners and candidate users (PD-35) |
| **Last updated** | 2026-10-19 |
| **Audience** | The owner, engineers, the clinical and pharmacy reviewers, a legal adviser (§6) |
| **Related** | [Prescription model §6, §7](prescription-model.md) · [Decision register §2.11](../decisions.md#211-the-owners-request-of-2026-10-16) · [Safety policy](../../safety-policy.md) · [Content review](../../content-review.md) · [`skills/`](../../../skills/README.md) |

> **Summary.** The owner asked (2026-10-16) for an agent that helps doctors in their practice: the doctor gives a patient's constitution, health concerns and needs — not
> their own plan — and gets back recommended herbs with their quantities and the reasons, in Traditional Chinese or English, to check their own approach against. It is built
> as an **Agent Skill** whose script is **the app's own practitioner pipeline**: Claude maps the doctor's words onto the knowledge base's closed vocabulary, the engine
> computes the result and the medication plan exactly as it does for a practitioner in the app, and the app's own renderers write the report in the practitioner's voice.
> Claude never supplies a herb or a gram; where the engine gives none, the report says why.

## 1. Decisions (recommended defaults, applied)

| | Decision | Why |
|---|---|---|
| D1 | **The engine is the only source** of patterns, formulas, herbs, grams and reasons; the language model maps and presents | The engine's output is traceable (every gram has its factors, every change its rule) and passes the safety layer; a model's own prescription has neither, and adding medical content without reviewers is what the project does not do (PM-22, PM-23) |
| D2 | **The practitioner role of the closed beta**: the release profile with its draft label and the study reference, read as a declared practitioner — the app's own policy for that role | Gates do not move for a feature ([post-MVP README](../README.md) rule 1); the owner then moved one for the role (PD-32): an adult reaches L3, also when the patient takes a medicine, a herb matches an allergy or the presentation is acute and external (the herbs concerned removed); pregnancy, breastfeeding, a minor, a red flag, a serious condition or too little information at L0 |
| D3 | **An independent reference**: the skill never asks for the doctor's plan | The doctor checks their judgement against something reached from the same facts without it |
| D4 | **The doctor's language**, Traditional Chinese or English; in English every name keeps its Chinese ("Ginseng (人參)") | The owner's request; practitioners name herbs, patterns and formulas by their Chinese |
| D5 | **De-identified**: age and sex, never identity; the script reads a case and the knowledge base beside it, fetches nothing, writes nothing, keeps nothing | Health data is the doctor's to hold ([privacy](../../privacy.md)) |
| D6 | **The app's semantics for what the doctor says**: a finding mentioned is present (graded where the question grades it), a finding denied absent, a finding not mentioned unknown; a domain addressed as a whole is answered as the app answers a question; a missing safety fact is asked for, never assumed | The engine is calibrated on the app's answers; silence is never "no" |
| D7 | **A stated constitution** enters the engine in place of the questionnaire (`statedConstitution`) | A doctor states 陽虛質, not sixty answers; it reaches what a scored one reaches — the safety rule of 特稟質, the susceptibility, the plan's 三因 rules — and never a pattern score |

## 2. How it works

```
the doctor's words ──(Claude, with references/vocabulary.md)──▶ case.json
case.json ──▶ scripts/reference.mjs ──▶ readCase ─▶ draftOf ─▶ assessInputOf + statedConstitution ─▶ assess ─▶ toSaved (practitioner) ─▶ withPrescription
                                      └─▶ report: safety and scope · the app's practitioner summary · the formula · the medication plan · herb notes · other formulas · questions
```

| Piece | What it is |
|---|---|
| **The skill** | `skills/tcm-practitioner-reference/`: `SKILL.md` (the workflow, the mapping rules, the one rule — never invent a herb or a gram), `references/case-format.md`, `assets/example-case.json`, `evals/evals.json`. `pnpm skill:build` writes the installable folder and `dist/skills/tcm-practitioner-reference.skill` (git-ignored, derived) |
| **The script** | `apps/web/src/practitioner/node/cli.ts` and the pure modules beside it, bundled for Node 18+ into one file with the bundler of the app's own Vite (rolldown, resolved through Vite: nothing downloaded). `node reference.mjs case.json [--lang] [--json]`, `--vocabulary`, `--version`. Exit 0 the report; 2 the case does not read (errors with their path and the closest ids); 3 a safety fact is missing (what to ask); 1 anything else |
| **The knowledge base** | `scripts/kb.json` beside the script: the closed beta's chunks and its study reference, named `skill-<hash>`; read with `forRole("practitioner")` |
| **The case** | `apps/web/src/practitioner/case.ts`: the person, red flags, the constitution, the course, findings, whole answers, the tongue, the pulse, and what does not map (`unmapped`: shown, never used). Checked against the vocabulary (unknown ids with suggestions, a grade on an ungraded finding, an exclusive group, a question of the other sex, a rate with a rate pulse); turned into the app's draft with the app's own functions (`applyAnswer`, `answerCategory`, `setSign`, `applyPulse`, `withAnswer`) |
| **The vocabulary** | `references/vocabulary.md`, generated by the script from its knowledge base: medicine classes, serious conditions, red flags, constitutions, course, every question's findings (core or follow-up, graded, exclusive groups), tongue and pulse — with Chinese and English names |
| **The report** | `report.ts`: what the policy allowed and why (the limiting cells, the medicines named), red flags, what a safety rule removed, allergies that matched no herb, what was not used; the app's **practitioner summary** (the person, medicines and allergies, findings, tongue and pulse, the panel, the patterns with confidence, the stated constitution, what would change the result); the formula (治法, fit, school and tier with reasons, 方解, the classic or the source; its composition by role where there is no plan); the app's **medication plan** section (N-AMOUNTS first, the changes, the table of grams, ranges and factors, cautions, the 方解 lines); notes on each herb (toxicity grade, pregnancy, recorded interactions, the source's caution); other formulas; the inquiry's next questions while it would not stop; the provenance (date, engine, knowledge base, parameters, season basis) |
| **The voice** | `words.ts`: the app's catalogs with the lines that speak to the app's user given in the practitioner's voice (13 `report` and `rx` keys, same placeholders — a test checks it), and the reference's own words: the `practitioner` namespace, loaded by no build of the app, checked by `check-i18n`, converted by `build_hans`, reviewed with the interface text |

## 3. Changes outside the skill

- **Engine:** `assess` takes `statedConstitution` (D7); `statedConstitution(kb, primary, secondary)` in `constitution.ts` (`stated: true` on the result). Existing outputs are unchanged.
- **A fault found and fixed on the way (148e277):** the medication plan ignored the result's level — a learner's or a practitioner's result a medicine held at L1 showed the plan
  with grams beside a formula page that hid them. `personalise` now reads the policy's features ([prescription model §7](prescription-model.md)).
- **App, no change in behaviour:** `dimLabel` moved from `FormulaDetail.tsx` to `words.ts` and `emergencyNumberText` from `EmergencyNumbers.tsx` to `noticeText.ts`, so the
  summary and the plan can be bundled without React; `prescriptionSection` takes the plan's words as an optional argument.

## 4. What the doctor sees, by case

| Case | Output |
|---|---|
| An adult with enough information | L3: the formula, the plan with grams within the Pharmacopoeia range and the factor of each, the 加減 with their reasons, the 方解, herb notes |
| The same patient on a medicine (or an allergy match, or acute and external) | L3 as well (PD-32), with a line naming the medicines: a herb that interacts is removed (the plan withheld if it is the 君), a formula a hard rule names is left out — and when every formula that fits is, the report says so — and the notice stands. A build whose overrides hold the condition back gives L1: the formula by name and its composition by role |
| Pregnancy, breastfeeding, under 18, a serious long-term condition | L0: no formula, with the reason |
| A red flag | L0: the referral first (level A: emergency care at once; level B: a physician soon) |
| Too little information (below about 60 % of the core questions) | L0 for low confidence, and the inquiry's questions that would raise it — the skill asks the doctor and runs again |
| Outside the knowledge base (23 patterns, 33 formulas) | No formula fits; the report says the case may lie outside the knowledge base |

## 5. Tests

`apps/web/test/practitioner.test.ts` (17): reading a case (paths and suggestions, the vocabulary's rules, the missing safety facts, the draft equal to the app's own semantics);
the engine's own result for a typical 脾氣虛 case, deterministically; the stated constitution reaching the plan; the policy for every case (L1 for a medicine, L0 for
pregnancy, a minor, a red flag, a serious condition); the report in both languages — the app's plan section rendered in it, no line addressing the reader, names with their
Chinese in English; L1, formulas a safety rule removed (named with the rule's words, never "nothing fits"), a red flag and a short case; `unmapped` shown and never used; the voice keeping the placeholders; the data form; the vocabulary naming every id.
`scripts/build-skill.test.ts` (5): the shipped skill — valid frontmatter with the counts filled in, every named file present, the package's layout, the script's role and build,
the example case in both languages, exit codes 2 and 3. Engine: `constitution.test.ts` (the stated constitution), `prescription-personalise.test.ts` (the level gate).

## 6. The owner's decisions (2026-10-19)

The three questions the build left were decided as recommended ([decision register §2.12](../decisions.md#212-the-owners-decisions-of-2026-10-19)):

| | Question | Decision |
|---|---|---|
| PD-32 ✓ | The condition cells for a **declared practitioner**: a medicine, an allergy match or an acute external presentation held every reader's case at L1 — no gram for most real patients | **Raised to L3 for the practitioner role only (PM-66).** The safety rules still act: the interacting herb and the allergen are removed (never the 君: the plan is then withheld), a formula a hard rule names is left out, the notice is shown; the report names the condition and says the quantities are still listed. A role never raises a blocking cell; the learner keeps L1. `roleProfile`, `validate_kb` and `check-release` rule 18 enforce it; the physician and pharmacy reviewers check it with the scope profiles |
| PD-33 ✓ | The **weight of a practitioner's tongue and pulse**: 0.7 and 0.5 are set for a layperson's self-observation | **A finding source of its own, *practitioner*, at 0.9 (to be built as PM-67)**: the skill will record the tongue and the pulse the practitioner reports with it. The value awaits calibration on practitioner-observed cases, which do not exist yet, and the reviewers |
| PD-34 ✓ | **Giving the skill to doctors** outside the project | **Internal only (PD-35):** the project serves its internal doctors, learners and candidate users, and the skill goes to them. Outside the project it waits for a legal view per market — software that proposes herbs and quantities to a clinician may be a regulated medical device (Taiwan's Medical Devices Act, the EU MDR rule 11; in the US a clinician-facing tool that shows its basis may fall outside the device definition) |

## 7. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-19 | PM-65 built: the skill, its script and knowledge base, the case format, the vocabulary, the report, the stated constitution; the plan's level gate fixed on the way |
| 0.2 | 2026-10-19 | §6: the owner's decisions — the practitioner's inline conditions at L3 (PD-32, PM-66), the practitioner's tongue and pulse as a source of their own (PD-33, next: PM-67), internal use (PD-34, PD-35); §1, §4 to match |
