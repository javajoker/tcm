---
name: tcm-practitioner-reference
description: Reference TCM formula for a licensed doctor's case, computed by a bundled, deterministic engine from what the doctor describes (age, sex, constitution, complaints, tongue, pulse, medicines, allergies, special needs) and returned with the herbs, their roles, reference grams within the Pharmacopoeia range, the reasons for every change and the safety findings, in Traditional Chinese or English. Use this skill whenever a doctor or TCM practitioner describes a patient and asks for a prescription, herbs and dosages, 開方, 方藥, 處方參考, 用藥參考, 加減, or wants an independent reference to check their own treatment plan against, even if they do not name the skill. Never invent herbs or doses yourself; this skill's script is the only source of the formula, the grams and the rationale.
license: Apache-2.0 (LICENSE, NOTICE); the skill is given out for study and the project's internal use under the terms of service (TERMS.md)
compatibility: Runs scripts/reference.mjs with Node.js 18 or later; no packages to install, no network access, nothing written or kept.
---

# TCM practitioner reference

A doctor describes a patient; you turn the description into a case file, run the bundled script, and give the doctor its report. The report is a **reference** the
doctor checks their own clinical judgement against — the formula a rule engine reaches from the same facts, with its herbs, grams and reasons. The doctor will usually not
tell you their own plan, and you should not ask for it: the value of the reference is that it is reached independently. The skill serves the project's internal doctors,
learners and candidate users, for study and use within the project, under the terms of service in `TERMS.md` (Traditional Chinese: `TERMS.zh-TW.md`).

## The one rule that matters

The formula, the herbs, the grams, the patterns and the reasons come **only** from `scripts/reference.mjs`. Never add a herb, change a gram, propose your own formula,
or fill a gap the report leaves — not even when asked, and not as "general knowledge". The engine's output is traceable (every gram has its factors, every change its rule)
and has passed a safety layer (pregnancy, interactions, 十八反/十九畏, toxicity, red flags); anything you add has neither, and a doctor checking their plan against it would be
checking against something unverified. When the report gives no formula, say why (the report states it) and stop there. You may explain what the report says, answer
questions about it, and point to its sources.

## Workflow

1. **Read `references/vocabulary.md`** (once per conversation). It lists every id a case may use — the findings of each question, tongue features, pulses, constitutions,
   red flags, medicine classes — with Chinese and English names. **Read `references/case-format.md`** for the fields of a case; `assets/example-case.json` is a complete one.
2. **Write the case** as JSON from what the doctor said (mapping rules below). Put it in a file (for example `/tmp/case.json`).
3. **Run** `node <this skill's folder>/scripts/reference.mjs /tmp/case.json` and act on the exit code:

   | Exit | Output | What to do |
   |---|---|---|
   | 0 | the report (Markdown) | present it (step 4) |
   | 2 | `{"status":"invalid","errors":[…]}` | the case does not read: fix each error at its `path` (an unknown id comes with `suggest`), rerun — this is your mistake, do not bother the doctor with it |
   | 3 | `{"status":"incomplete","missing":[…]}` | a safety fact is missing: ask the doctor for exactly those items, in one short message, then rerun |
   | 1 | an error on stderr | report it plainly; do not improvise a reference |

   `--json` adds the result as data around the report; `--vocabulary` prints the vocabulary; `--version` the build and the knowledge base.
4. **Present the report as the script wrote it**, in the doctor's language. You may put two to four lines on top — the leading pattern, the formula, the output level, and
   anything the doctor must not miss (a red flag, a removed herb, a withheld plan) — taken from the report. Do not reorder, shorten or reword its tables and numbers.
5. **If the report ends with "若要提高把握度，可再詢問 / To raise the confidence, ask about"**, the knowledge base found too little to be confident (often it then lists no
   formula). Ask the doctor those items compactly — they can answer "none/normal" — add the answers to the case and rerun. Keep the case between turns: later corrections
   and additions update it, and every change means a new run.

## Mapping what the doctor says

- **Language.** Set `"lang": "zh-Hant"` or `"en"` to the doctor's language. (The report has no Simplified Chinese; for a doctor writing in Simplified, use `zh-Hant` and say so.)
- **Privacy.** A case needs age and sex, never identity. Leave out names, ID or chart numbers, dates of birth, addresses and phone numbers even if the doctor gives them, and
  say that you left them out.
- **Safety facts are required, and silence is never "no".** Age, sex; for a woman of 10–60, pregnancy (`no` / `possible` / `yes`) and breastfeeding; medicines (`none` /
  `some` with classes and names / `unsure`); allergies (`none` / `some` with names); serious long-term conditions (`none` / `some` with ids). If the doctor did not say,
  run anyway — exit 3 tells you exactly what to ask.
- **Findings as said.** A finding the doctor mentions → `"present"`, or its grade where the vocabulary marks it graded (輕/中/重 → `light` / `moderate` / `severe`). A finding
  the doctor denies → `"absent"`. A finding not mentioned is left out: it stays unknown, which is not the same as absent.
- **Whole questions.** When the doctor speaks to a whole domain — "二便調", "無寒熱", "納眠可", "no sweating problems" — answer that question as `"none"` under `answers`.
  When they say everything else is unremarkable ("餘無特殊", "otherwise unremarkable"), you may answer the remaining **core** questions `"none"`; say in your reply that you
  did. Never assume it otherwise. Give each question either under `answers` or symptom by symptom under `findings`, not both.
- **Tongue and pulse.** Tongue body colour, shape and coat go under `tongue.body` / `tongue.shape` / `tongue.coat` (the other features of an answered category count as
  absent; `"normal"` answers it as normal); zone features and special signs (齒痕, 瘀點, 裂紋 …) under `tongue.signs`. Pulses under `pulse.qualities`; a counted rate as
  `pulse.rate` (it gives 數/遲 itself — do not also give P_RAPID or P_SLOW).
- **Constitution.** The 九種體質 the doctor states → `constitution.primary` (with `secondary` for a 兼夾 type).
- **Red flags.** Emergency signs (chest pain with cold sweat, stroke signs, haematemesis …) → `redFlags`. The report then leads with a referral and lists no herbs — say
  that clearly; it is the most important line of the reply.
- **What does not map** — a Western diagnosis, a lab value, a preference the engine cannot apply ("不想吃苦藥", "wants pills", "avoid animal products"), a symptom with no
  item — goes under `unmapped`. The report lists it as not used; tell the doctor these were not part of the computation.

## Reading the report (so you can answer questions about it)

- **Safety and scope** says what the output level allows and why. L3: formula, 加減 and grams — also when the patient takes a medicine, a formula herb matches an allergy
  or the presentation is acute and external: a line names the condition, the safety rules remove the interacting herb or the allergen (the plan is withheld if it is the 君)
  and leave out a formula a hard rule names, and when every formula that fits is left out the report says so. L1 (the formula by name and composition only) appears only in a
  build whose overrides hold those conditions back. L0: no formula — pregnancy or breastfeeding, under 18, a red flag, a serious long-term condition, or too little
  information. This is the knowledge base's safety policy for a declared practitioner; the doctor decides, the reference does not.
- **The case and its reading** are the engine's own summary: findings by dimension, the tongue and the pulse as the practitioner's observations (weighted 0.9 — a
  layperson's self-observation counts 0.7 and 0.5), the five-phase panel,
  the leading patterns with their band and the confidence, the stated constitution, and what would change the result.
- **Reference formula** — 治法, how much of the deviation it can adjust, school and tier (with the tier's reasons), 方解, and the classic's words or the source.
- **Medication plan** — the formula personalised by 三因制宜: herbs removed for the person (pregnancy, allergy, an interacting medicine — never the 君; when the 君 itself is
  touched the plan is withheld), the classical 加減 for symptoms present, at most two further herbs for what the formula leaves, and the grams: the 君 at the middle of its
  Pharmacopoeia range, the others in the formula's proportions, adjusted for severity, age, constitution and season, never above the range, a toxic herb never raised.
  Each gram's "adjusted for" column names its factors. The note on quantities comes first: they are for study and as an aid to a practitioner, not instructions.
- **Notes on the herbs** — toxicity grade, pregnancy level, recorded interactions and the source's own caution (in Chinese).
- **Other formulas**, **questions to ask**, and the provenance line (date of the visit, engine, knowledge base, parameters, season basis).

## Limits to state when they matter

- The knowledge base holds **{{PATTERNS}} patterns and {{FORMULAS}} formulas**. A case outside them gets no formula; say so rather than reaching for one.
- It is a **draft**: its patterns, formulas, herb records and rules have not yet been reviewed by qualified practitioners and pharmacists. The report says so; repeat it if
  the doctor treats the reference as authoritative.
- Grams are **reference quantities** derived by rules from textbook proportions and the Pharmacopoeia range; processing, decoction method and the actual quantity are the
  doctor's decision.
