# Design: Library Expansion (Patterns and Complaint Modules)

| | |
|---|---|
| **Version** | 0.2 (draft) |
| **Status** | Design for Release C (FR-30; tasks PM-21 … PM-23). The tooling (PM-21: the checks, the dossier, the scaffold) is built ([§9.1](#91-as-built-pm-21)); the waves (PM-22, PM-23) wait for named reviewers and are not started. The candidate list is **a proposal for the clinical reviewer**, not a decision |
| **Last updated** | 2026-10-06 |
| **Audience** | Engineers, the clinical and pharmacy reviewers, the content owner |
| **Related** | [Requirements FR-30](../requirements.md#fr-30-library-expansion--release-c--class-c--refines-q2-k-19) · [Diagnosis SOP §9](../../diagnosis-sop.zh-TW.md) · [Content review](../../content-review.md) · [KB schema](../../kb-schema.md) · [Test plan §3](../../test-plan.md) · [Decisions Q2, PD-08](../decisions.md) |

> **Summary.** Breadth is the most expensive thing the product can add, because every pattern multiplies what a reviewer must read, what the tests must prove and how long an assessment takes. This design makes expansion **repeatable and cheap to judge**: one admission checklist that the build enforces wherever a machine can, a generated *dossier* that lets the clinical reviewer accept or reject a candidate before any weights are written, and a first wave chosen for being common, low in acuity and already supported by the sources in the repository. It also finds two things to fix first: seven of the 23 patterns show **no formula in a release build** (their formulas are tier B or C), and the per-session knowledge budget has room for about one wave, not two.

---

## 1. Goal and non-goals

**Goal.** Grow the pattern and module library in waves, each addition passing the same checks and the same review as the original 23 patterns, without letting the question flow, the budgets or the reviewers' load get out of hand.

**Non-goals.** Engine changes (new patterns are data); patterns for serious or acute illness (a self-assessment must not stage them, PD-08); hand-assigned formula tiers (tiers are computed from the herbs); content written without sources; shipping any wave before its review records exist.

## 2. What exists today

| Fact | Consequence |
|---|---|
| 23 patterns in seven groups (external 4, spleen-stomach 6, liver 4, heart 3, lung 2, kidney 2, qi-blood 2), eight complaint modules, 36 questions, 184 symptoms | Each new pattern adds weights, questions and symptoms to a bank whose questions are shared |
| The SOP covers external disease by *six-channel* differentiation and says warm febrile disease uses *wei-qi-ying-xue / sanjiao*; **the MVP covers only the mild early exterior** | Wei (衛) stage is already EX3; the deeper stages are acute illness |
| 33 formulas: **20 tier A, 7 tier B, 6 tier C**. A release at level L1 shows tier A only | A pattern whose formulas are all B or C shows only diet, points and lifestyle in a release |
| **Seven patterns have no tier-A formula**: EX1 (C), LV1 (B), LV2 (C), LV4 (B), KD2 (C), QB1 (B), QB2 (B). 小柴胡湯 (C) is linked to no pattern at all | Formula coverage in a release is 16 of 23 patterns; some expansion value is in formulas, not patterns |
| The build already enforces: verified citations, known symptoms and formulas, reachability of every weighted symptom, each pattern ranking first for its own typical patient with its margin, and (K-07) at least three discriminating questions for the closest confusable pairs | These are the machine half of the admission checklist; they need generalising from "the closest pairs" to "every pair under the margin" |
| The review pack (K-17) annotates confusable pairs below a margin of 20 points | The dossier extends it |
| `assess` p95 is 5.6 ms with 23 patterns against a 50 ms budget; the per-session knowledge base is 84.3 of 100 KB gzip | Roughly linear cost; **about 15 KB of headroom** |
| Content is `draft` until reviewed; a closed beta may ship it under the draft label | A wave can be built and shown in dev and closed beta before review finishes, never in a public release |

## 3. Principles

1. **Review capacity sets the pace.** A wave starts when a clinical reviewer and a pharmacy reviewer are named; the tooling and candidates are ready beforehand.
2. **Decide on a dossier, then build.** The reviewer accepts or rejects a *candidate* from a generated page of facts before anyone authors weights.
3. **One process.** No pattern or module enters except through the checklist in §4.
4. **A self-assessment does not stage serious illness.** Pictures that sit beside a red flag are either excluded or placed behind it (PD-08).
5. **Fix thin output before widening.** A pattern with no formula a release can show is a gap as real as a missing pattern.
6. **Budgets are a gate.** A wave is sized against the knowledge budget and the ten-minute target before it is written.

## 4. The admission checklist

A candidate becomes a pattern only when every row holds. *Machine* rows are checks in `validate_kb`, the build self-test or the test suite (PM-21); *human* rows are review records.

| # | Criterion | How |
|---|---|---|
| A1 | Stable id and group; names in `zh-Hant` and English; `status: draft` | Machine (schema) |
| A2 | **At least two independent sources**: classical quotations verified in `citations.json`, and a textbook or modern source present in `reference/`; each quotation supports the sentence where it is used | Machine: citations exist and are verified. **Human:** that they support the claim |
| A3 | Weighted evidence: `weights`, `required_any`, `against`, panel projection and element decomposition (證素) consistent with the pattern's name | Machine: references and ranges. **Human:** the weights |
| A4 | Every weighted symptom is reachable by a question | Machine (existing test) |
| A5 | The typical patient ranks first, and the **margin to every other pattern is at least 20 points**, or an exception is recorded with its reason | Machine (self-test, generalised) |
| A6 | For each pair under the margin, **at least three discriminating questions** exist in the bank | Machine (K-07 test, generalised to every such pair) |
| A7 | Tongue and pulse features exist; whether the pattern needs them to pass the 40 % threshold is declared, and the typical patient's seed includes them | Machine + human |
| A8 | A **tier-A formula**, verified against its source and a second source, or an explicit "no formula visible in release"; the tier is computed, never edited | Machine (existing verification fields and tier computation) |
| A9 | Treatment guidance: diet, points and lifestyle lines, each with a basis or citation and its pregnancy flag | Machine (presence, references). **Human:** content |
| A10 | **Red-flag boundary:** the red flags that must preclude the pattern are listed (for example jaundice, haemoptysis, high fever); the assessment already shows the notice for them, and the pattern's page says "see a doctor first" for those | Machine (ids exist) + **human** (completeness; physician) |
| A11 | Tests: a golden seed (the typical patient from the inquiry), at least two vignettes (one with a red flag, one population-gated), parity fixtures regenerated, the property suite green | Machine |
| A12 | Plain-language symptom and question wording in both languages; glossary terms; forbidden-wording lint clean; English marked `machine-draft` | Machine + linguistic review |
| A13 | Review records cover every area touched (patterns, symptoms and questions, tongue and pulse if changed, formulas, guidance, citations) | Review gate ([content review §7](../../content-review.md)) |

## 5. The dossier

For each candidate the review-pack generator (an extension of `scripts/review/pack.py`) writes a page **before weights exist**, from a short proposal file (`review/candidates/<id>.yaml`: names, group, classical sources, proposed key symptoms):

| Section | Content |
|---|---|
| Sources | The proposed quotations with their verification status and source text |
| Overlap | For each existing pattern, the shared proposed symptoms and the projected margin if the proposal were weighted naively; those under 20 points are flagged |
| Questions | Existing questions that already touch the proposed symptoms, and what new questions would be needed to reach three separating ones |
| Red-flag boundary | The red-flag items and notices nearby, and the proposed exclusions |
| Formulas | Formulas in the library that could serve it, with tier and verification; formulas that would have to be added |
| Cost | Added weights, questions and symptoms, and the estimated gzip cost against the budget (§7) |

The clinical reviewer answers *accept / reject / change* on the dossier. Only accepted candidates are authored. This turns the scarcest resource, reviewer attention, to the cheapest decision.

## 6. Wave A: candidates for the clinical reviewer

Chosen by five tests: common in the complaints the app already collects, low acuity, sources already in the repository, formula coverage in the library, and an overlap that questions can resolve. **None is decided.**

| Candidate | New or existing module | Why | Overlaps (to resolve by questions) | Red-flag boundary | Formulas in the library |
|---|---|---|---|---|---|
| Respiratory and throat module with four patterns: wind-cold, wind-heat, dryness, phlegm-damp lung | **New** module | Cough and throat complaints are common and the current library has only the early-exterior patterns and lung deficiency | EX1, EX3, LG2, SP4 | Breathlessness, haemoptysis, high fever, a cough lasting beyond a reviewer-set duration | 二陳湯, 沙參麥冬湯, 麥門冬湯, 銀翹散, 桑菊飲 exist (tier A); others to be chosen by the reviewer |
| Qi-and-yin deficiency | Fatigue | Tiredness with dryness is a common mixed picture | QB1, KD1, LG2, SP6 | Unexplained weight loss | 沙參麥冬湯, 益胃湯 (A) |
| Food stagnation in the stomach | Digestion | Common, benign, quickly recognisable | SP1, SP4, LV4 | Persistent vomiting, severe abdominal pain | 平胃散 (A) |
| Wind-cold-damp obstruction (aching joints) | Head and body pain | Common aching in cold or damp weather | SP4, SP2 | A hot, red, swollen joint with fever; the physician decides whether a joint red flag is needed | None yet in the library |
| Cold congealing in the womb (period pain) | Women's cycle | Common and well described in the classics | QB2, SP2 | Severe pain, heavy or irregular bleeding, possible pregnancy | None visible in release today (blood-activating formulas are tier B) |

**Held back, with reasons.**

| Candidate | Reason |
|---|---|
| Damp-heat of the bladder or of the liver and gallbladder (lower burner) | Their pictures sit next to urinary infection and jaundice (`RF_B_JAUNDICE`); they wait for physician guidance on the boundary (Wave B) |
| Qi-level (氣分) heat with high fever, nutrient (營分) and blood (血分) stages | Acute febrile illness: **red flags, not patterns** (PD-08); `RF_B_HIGH_FEVER`, `RF_A_CONSCIOUSNESS` and `RF_A_BLEEDING` already stand in front of them |
| Sanjiao as a location axis | A model question, not a pattern: it would add upper, middle and lower burner as **location elements** of the 證素 decomposition. Evaluated in Wave B with calibration evidence; 三仁湯 (tier A) already serves damp-heat in the library |
| Composite patterns (spleen-and-kidney yang deficiency and the like) | The engine already reports mixed patterns; composites would only shrink margins |
| Lesser-yang (少陽) pattern for 小柴胡湯 | Its picture (alternating chills and fever) is acute febrile illness; the formula is tier C and stays a learning display in dev |
| Skin, eye, ear conditions | Acuity and misdiagnosis risk exceed what a questionnaire can responsibly separate |

Wave A as proposed touches five modules (one of them new) and adds **eight patterns** — the respiratory four plus one each in four existing modules — with fifteen to twenty questions and about thirty symptoms.

## 7. Budgets

| Resource | Today | Wave A estimate | Note |
|---|---|---|---|
| Per-session knowledge base | 84.3 of 100 KB gzip | **+10 to 12 KB** (patterns ≈ 0.3 KB each, questions ≈ 0.35 KB each, symptoms ≈ 0.04 KB each — about 10 KB — plus guidance, formulas and citations for the new items) | Leaves 4 to 6 KB; **Wave B does not fit** without a change |
| `assess` p95 | 5.6 ms with 23 patterns | about 8 ms with 31 | Linear; the worker trigger (TQ5) is 25 ms |
| Assessment length | Adaptive, ten-minute target | Unchanged: the stop rule ends the inquiry when confidence and coverage suffice; a new module is chosen only if the person picks it | Re-measured in usability round R2 |

**Trigger and remedy.** When the per-session figure passes 90 KB, split the question and symptom data **by module**: the module is chosen before the inquiry begins, so each module's questions can load on demand and the figure for a session falls to the shared core plus the chosen modules. This is a prerequisite for Wave B and is part of its task, not a surprise.

## 8. Formulas

Seven patterns show no formula in a release. Tier is computed from the herbs (bitter-cold share, blood-activating share, strong herbs), so the way to give them a visible formula is a **different formula** whose herbs satisfy tier A, verified against its source and a second source — never an edited tier. Which patterns deserve it, and which formula, is the pharmacy and clinical reviewers' decision, recorded in the dossier; engineering supplies the verification pipeline (K-14) and the computed result. Until then the result page already says no formula is shown at this level and points to diet and points.

## 9. Tooling (PM-21)

| Piece | Content |
|---|---|
| `validate_kb` | A1–A10 as far as a machine can: id and schema, citation existence and verification, references, red-flag ids, formula verification status, pairwise margins and discriminating questions for **every** pair under the margin |
| Scaffold | `scripts/kb/new_pattern.py <id>` writes the curated entry skeleton, a golden seed stub and vignette stubs from the proposal, so authors start from a valid shape |
| Dossier | The review-pack extension of §5 |
| Docs | `docs/kb-schema.md` gets the checklist; `data/README.md` counts are regenerated; the SOP (owner of the logic) is updated by the clinical content owner in the same change |

### 9.1 As built (PM-21)

| Piece | Where | Notes |
|---|---|---|
| The checks | `scripts/kb/admission.py`, run by `validate_kb` (check 10) and by `python -m scripts.kb.admission [--pairs]` | Rows A1 – A12 as functions of the library; each seeded violation of §12 has a test (`test_admission.py`). A5 and A6 are the K-07 rule generalised to **every** pair under the margin (the three pairs K-07 named stay as a watch list in `test_question_bank`) |
| The records | `scripts/kb/curated/admission.py` → `data/review/admission.json` (+ schema, TypeScript type) | Build-time only: not in the bundle, not in the knowledge-base fingerprint. The original 23 patterns, the **waivers** of their known gaps with reasons, and declarations that are checked against the data |
| The dossier | `scripts/review/dossier.py`; proposals in `review/candidates/<id>.yaml` (template and README there); output `review/packs/dossiers/<id>.md` | The six sections of §5, measured with the engine's own scoring and the question bank; deterministic; refuses a proposal whose ids do not exist |
| The scaffold | `scripts/kb/new_pattern.py` → `review/candidates/<id>/` (git-ignored) | The entry for `curated/patterns.py` weighted as proposed, the symptom lines, the prose and treatment places, the records, a golden stub (next free id, the title the checklist follows), two vignette stubs (red flag; pregnancy), and a checklist with where to do each row. Writes nothing into the knowledge base |

**Decisions made while building** (the first two refine §13):

- **Waived by name, never silently.** The 23 original patterns do not meet every row, and no machine can supply a physician's red-flag boundary. Each gap is a named waiver with its reason; a waiver can name only an original pattern and fails as soon as it is not needed, so the list only shrinks and a new pattern cannot hide behind it. A declaration (needs the tongue and the pulse; no formula visible in a release; a margin exception) must be true: it is checked against the scores and the computed tiers.
- **A2 is read as the design's default says:** one verified classical quotation **and** one textbook or modern source recorded as a path that exists under `reference/`. Two quotations from two books are not a textbook.
- **The proposal is YAML** (as the design says, and as the review records already are); the admission records are JSON built from a curated Python table, like every other data file.
- **A naive candidate's required-any is its weight-3 symptoms** unless the proposal names its own: the engine halves a pattern whose required-any is absent, which would flatter every candidate's margins.

**What the checks found in the original library** — findings for the clinical and pharmacy reviewers, recorded as the waivers:

| Row | Finding |
|---|---|
| A5 / A6 | One pair is under 20 points: kidney yin deficiency (KD1) and heart–kidney disharmony (HT2) — 15.7 and 20.0 (19.97) points. Four questions separate them. Recorded as a margin exception |
| A2 | No pattern has a recorded textbook or modern source. Six patterns (SP3, SP6, HT1, LG1, KD1, QB1) have no quotation of their own; only three (SP2, LV3, HT3) cite two books |
| A7 | Four patterns (EX3, SP6, KD1, HT2) cannot reach the 40-point band from the inquiry alone (32.0, 33.8, 36.1 and 38.8): they need the tongue and the pulse. The golden seeds are the inquiry's answers only, so none holds a tongue or pulse finding |
| A8 | Seven patterns have no tier-A formula (confirmed: EX1, LV1, LV2, LV4, KD2, QB1, QB2; recorded as declarations). The only tier-A formula of HT1, 歸脾湯, is partially verified |
| A10 | The red-flag boundary of no pattern exists as data |
| A11 | Of the safety vignettes that replay a pattern, 74 replay SP1; only SP1 has both a red-flag and a population vignette |

Row A3's structural rules, A4, A9 and A12 hold for all 23. What a wave must still do first is in the §6 table; the tooling does not choose it.

## 10. Review gating and rollout

- New content is `draft`. A wave may appear in dev builds and in a closed beta under the draft label; a **public** release includes a wave only when its areas have valid review records (A13).
- A wave is merged pattern by pattern, each through the checklist, so a rejected pattern does not hold the others.
- The review track's rounds ([content review §6](../../content-review.md)) schedule the wave like any other content; this design adds the dossier as the first, cheapest round.

## 11. Risks

| Risk | Mitigation |
|---|---|
| A new pattern shrinks the margins of existing ones | A5 re-runs the self-test for **every** pattern; any margin that falls under 20 fails the build until questions or weights are fixed |
| The inquiry grows longer | Adaptive stop rule; modules chosen by the person; the length is re-measured in usability |
| Reviewer fatigue | Dossiers before authoring; pattern-by-pattern merges |
| A candidate drifts toward serious illness | A10 and PD-08; the physician reviews the boundary |
| Terminology differs by region | Glossary and the Simplified pipeline ([design](simplified-chinese.md)) carry the terms |
| Budget overrun | §7 estimate before writing; module chunking as the remedy |

## 12. Tests

| Layer | Test |
|---|---|
| Unit | Each machine row of §4 with a seeded violation (a pattern with one source, with a pair under the margin and two questions, with a missing red-flag id, with an edited tier) |
| Integration | The self-test over the whole library; the K-07 question test for every pair under the margin; parity regenerated; `golden:reseed` clean |
| Properties and vignettes | The property suite and the safety vignettes pass with the new patterns; new vignettes for each red-flag boundary |
| Budgets | `check-budgets` with the new data; the benchmark guard |
| Review | The dossier generator produces a complete page for every candidate file |

## 13. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release C.**

| Question | Default |
|---|---|
| First wave | The five candidates of §6 as a proposal; the reviewer decides |
| Margin rule | 20 points to the nearest pattern, as in K-07 |
| Minimum sources | Two independent, one classical and one textbook |
| Acute febrile stages and lower-burner damp-heat | Not patterns (the first) / held for the physician (the second) |
| Hand-set tiers | Never |
| When to chunk by module | At 90 KB per session |

## 14. Tasks

PM-21 (checks, scaffold, dossier, docs — built), PM-22 (Wave A, gated on the reviewers and the dossier decisions), PM-23 (Wave B, with module chunking if the trigger has fired) — [`TASKS.md`](../../../TASKS.md).

## 15. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design; Wave A proposed as candidates; seven patterns without a release-visible formula and the budget headroom recorded |
| 0.2 | 2026-10-06 | PM-21 built ([§9.1](#91-as-built-pm-21)): the admission checks in `validate_kb`, the records and waivers, the dossier generator, the scaffold. What the checks found in the original 23 patterns is recorded; PM-22 and PM-23 are not started — they need named reviewers |
