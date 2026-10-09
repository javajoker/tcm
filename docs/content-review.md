# Content Review Process

| | |
|---|---|
| **Version** | 0.10 (draft) |
| **Status** | Proposed process — **no reviewer has been appointed yet** (PRD Q8 blocks milestone M3) |
| **Last updated** | 2026-10-09 |
| **Audience** | Maintainers, clinical and linguistic reviewers |
| **Related** | [KB schema §8](kb-schema.md) (status model) · [Safety policy](safety-policy.md) · [i18n guide](i18n-guide.md) · [Test plan §4](test-plan.md) (golden cases) · [Release process](release-process.md) (gates) |

> **Why this document exists.** Every weight, threshold, formula role, herb effect and safety rule in `data/` is currently `draft`, `curated-draft` or
> `derived` ([`data/README.md`](../data/README.md#review-status)). The app's outputs are only as sound as that content. This process defines *who* reviews *what*,
> *how* the result is recorded, and *which reviews must be complete* before each output level can ship.

---

## 1. Principles

1. **Nothing medical ships unreviewed in `release`.** The release profile's output level for each content area is capped until the owning review is complete (§7).
2. **Reviewers decide content; engineers decide mechanics.** A reviewer never needs to read code; a developer never changes a medical value without a recorded decision.
3. **Every decision is recorded** with reviewer, date, KB version, scope and outcome ([§5](#5-review-records)).
4. **Conservative on disagreement.** If reviewers disagree, the more restrictive position ships and the dissent is recorded.
5. **Sources before opinions.** A claim is supported by a classical passage or a named textbook/guideline; otherwise it is labelled "teaching-level" or removed.
6. **Reviewers are credited only with their consent**, and "reviewed by" never implies endorsement of the app as a whole.

---

## 2. Roles

| Role | Qualification (proposed) | Reviews | Needed for |
|---|---|---|---|
| **Content owner** | Project maintainer | Prepares review packs, merges decisions, keeps records, owns releases | Always |
| **Clinical reviewer (TCM)** | Licensed TCM practitioner with clinical experience; familiar with the classics and with the region's practice (Q1) | Patterns, constitutions, tongue/pulse content, formulas (indications, roles, 加減), treatment guidance, copy that makes clinical statements | L1 and above |
| **Pharmacy / pharmacology reviewer** | Pharmacist or clinical pharmacologist with Chinese-herb knowledge | Herb effects/burdens flags, pregnancy and interaction flags, toxicity, 十八反/十九畏, dose references, tier outcomes | L1 and above |
| **Physician reviewer** | Licensed physician (family or emergency medicine) | Red-flag lists A/B/C, scope rules (minors, pregnancy, serious chronic disease), emergency resource text, notice wording | Always (blocks any release) |
| **Linguistic reviewer** | Bilingual (zh-Hant / en) with TCM terminology skills | Glossary, UI strings, notices, English renderings, translations of quotations | Always |
| **Regulatory / legal reviewer** | Counsel familiar with health-information rules of the target region | Disclaimers, claim wording, privacy statement, birth-module wording | Before any public release |

One person may hold several roles if qualified; the physician and the TCM clinical reviewer must be **different people** for the red-flag and safety-rule areas (second pair of eyes).

---

## 3. What is reviewed

| Area | Files | What the reviewer decides | Primary reviewer |
|---|---|---|---|
| **Red flags and scope** | `diagnosis/red-flags.json`, `config/scope-profiles.json`, `safety/red-flag-terms.json` (the words that re-open the screening during AI help's conversation, PM-47) | Completeness and levels of A/B/C items; which populations/conditions block; wording; for the words: that each item is found by what a person would write, in both languages, and that ordinary complaints are not | Physician |
| **Safety rules** | `safety/rules.json` | Each rule's condition, target, severity (hard/soft) and message; interaction classes; 十九畏 list; dose references; pregnancy acupoints | Pharmacy + physician |
| **Patterns** | `diagnosis/patterns.json`, `pattern-elements.json` | Symptom weights, `against`, `required_any`, panel projection, linked formulas; closest confusable pairs and discriminating questions | TCM clinical |
| **Symptoms and questions** | `symptoms.json`, `questions.json`, `exclusions.json`, `orientation.json` (the first-impression signs) | Wording in plain language, synonym splits, exclusivity, severity options | TCM clinical + linguistic |
| **Tongue and pulse** | `tongue.json`, `pulse.json` | Zone assignments (classical vs textbook), feature meanings, quality coefficients, the educational note | TCM clinical |
| **Constitutions** | `constitutions.json`, `constitution-items.json`, `wuxing/susceptibility.json` | Feature lists, susceptibility values, items and scoring | TCM clinical |
| **Panel model** | `panel-schema.json`, nature projection, `scoring-params.json`, `yingwei.json` (營衛, PM-52) | Projection per nature, dimension weights, thresholds, noisy-OR floor, confidence cut-offs; the 營衛 readings, their applicability weights and the coupling | TCM clinical (with developer present) |
| **Herbs** | `herbs/herbs.json` | `effects`, `harms`, `tags`, `pregnancy`, `toxic`, `interactions`, `dose_g_reference` — for the 94 curated herbs in full; the 609 derived herbs by **sampling** (§4.3) and by rule review | Pharmacy + TCM clinical |
| **Formulas** | `formulas/formulas.json` | Composition, roles, proportions, `core_indications`, pattern links, classical modifications, computed tier outcome (does the tier match practice?) | TCM clinical + pharmacy |
| **Reference quantities and the prescription model** | `herbs/dose-bands.json`, `treatment/sanyin.json`, `treatment/prescription.json`, `treatment/mechanisms.json`, `herbs/pairings.json`, `herbs/processing.json`, `herbs/yinjing.json` (PM-37) | The amount-dependent actions (量效), the 三因 factors and the rounding behind every reference quantity of the study reference; the 七情 pairings, processing (炮製) and guide herbs (引經) against their sources; the direction of qi each treatment asks for; the model's parameters | TCM clinical + pharmacy |
| **Treatment guidance** | `treatment/guidance.json`, pattern `treatment` | Foods, acupoints (location text, cautions, **and where the schematic drawings mark them** — the dev inspector's *Figures* tab shows all of them; the placements are in `apps/web/src/screens/result/figures/acupointSpots.ts`, a web-app file outside the content hash), lifestyle advice, pregnancy cautions | TCM clinical + pharmacy |
| **Five-phase priors** | `wuxing/*`, `engine-params.json`, wording of birth/yunqi/season copy | Reasonableness of caps and wording; that the content is framed as tendency reference | TCM clinical + regulatory |
| **Citations** | `citations.json` | That each quotation actually supports the sentence where it is used (machine verification only proves the text exists) | TCM clinical |
| **Copy** | UI catalogs (`apps/web/src/i18n`, Traditional Chinese and English; the Simplified catalog is generated from the Traditional one), notices, disclaimers | Tone, forbidden wording, clinical accuracy | Linguistic + regulatory (+ physician for the notices, the `safety` namespace) |
| **Glossary / translations** | `glossary.json`, `en` fields, `safety/name-fold.json` (each character of a herb or food name with its Simplified form, so that an allergy typed in either script is matched) | Term choices, WHO conformity, readability; that every folding pair is right | Linguistic |
| **The learning book** | `docs/book/zh-Hant/` (shown in Learn, PM-43; the course's companion, PM-56) | That each chapter's perspective is fair to the tradition and says what the model does, in plain Traditional Chinese a cultured reader accepts; that each quotation supports its sentence (the build proves only that it exists); no advice, no amount, no second person | Linguistic + TCM clinical |
| **The course and its textbook** | `docs/course/zh-Hant/` (a document, not in the app; PM-55) | That each chapter teaches correctly at textbook level, in plain Traditional Chinese; that each 白話 explanation renders its excerpt faithfully and each excerpt supports its place (the tests prove only that it exists); that the tables of common patterns, herbs and formulas match the textbooks and the Pharmacopoeia; that the danger signs of chapters 18 and 22 are right and sufficient; the answer key; no advice, no amount, no second person | Linguistic + TCM clinical |

---

## 4. Evidence standard and method

### 4.1 Source hierarchy

1. **Classical text** (《黃帝內經》《難經》《傷寒論》《金匱要略》 …) — primary support; quoted with the verified citation id.
2. **Standard textbooks and standards** (e.g. 中醫診斷學, 方劑學, 中藥學; 《中醫體質分類與判定》ZYYXH/T 157-2009; the Pharmacopoeia in use) — "teaching-level" support. The reviewer records which textbook edition is the reference.
3. **Clinical guidance / modern pharmacology** for safety facts (interactions, pregnancy, toxicity).
4. **Reviewer experience** — acceptable for calibration of weights, recorded as such ("expert judgement").

A content item supported only by 3–4 is shown as *expert-calibrated*; one supported only by an unverified textbook claim stays `draft`.

### 4.2 Review pack

For each area the content owner generates a **review pack** (`scripts/review/pack.py`): a read-only document (Markdown) with each record rendered in Chinese and English, its sources, the engine's behaviour on it (e.g. for a pattern: the "typical patient" score, rank, closest confusable pair; for a formula: its panel effect/burden in words, computed tier and reasons, matched patterns), and an empty decision column (*accept · change · remove · escalate*) with a comment field. Packs never require the reviewer to read JSON.

> **Implementation (K-17).** `pnpm review:pack <area>` (an area of the list below, or `all`) writes `review/packs/<area>/PACK.md` (git-ignored; derived, regenerate whenever the data changes) and `record-skeleton.yaml`. Each pack states who reviews, what to look at and the knowledge-base fingerprint, then renders every item in both languages with its sources and an **Engine behaviour** note taken from the Python oracle (the engine's reference implementation, checked for parity on every build) and the data tables: *red flags* — the notice each item raises and the output level per profile, the scope-profile cells, the emergency numbers; *safety rules* — what each rule currently selects (the formulas carrying the interaction tag, the pregnancy-flagged formulas, the points and foods …), the 十八反 / 十九畏 pairs, the dose references; *patterns* — the evidence and against tables with the question that asks each symptom, the citations with their quotations, and for the typical patient the pattern's score, rank, closest rival and margin (a margin under 20 is flagged *confusable*), and the 證素 (pattern elements) with their evidence and projection; *formulas* — composition and roles, source and verification record, tier and reasons, flags, cautions, modifications, and for each recommending pattern's typical patient the share of the panel deviation the formula corrects, its scale and its rank. The skeleton is a review record prefilled with the pack's units and their **current content hashes** and with placeholders (an invalid id, role and outcome) that the reviewer must fill in; apply any agreed changes first, rebuild, regenerate the pack, and copy the skeleton to `review/records/` ([§5](#5-review-records)). A test turns a filled skeleton into valid records and checks the build accepts them.

> **Implementation (PM-57): every area.** Thirteen more areas complete the list, so that every data file is in the scope of exactly one pack, or listed with the reason it is in none (`NOT_IN_A_PACK`: the cities of the birth-place picker, the herb browser's index and the sources registry, which are not medical content or are generated from reviewed files) — a test checks it. *symptoms* — every symptom by inquiry dimension with the patterns it is evidence for and the questions that ask it, every question with its prompt, hint, options and graded symptoms, the modules, the exclusive groups and splits, the first-impression signs and the inquiry's stopping rules; *tongue-pulse* — the zones (classical and textbook), the features, the self-observation guidance, the 28 pulses with their 《瀕湖脈學》 headings, the positions and the quality coefficients; *constitutions* — the nine types, the questionnaire item by item with its scale and scoring, the susceptibility table; *panel* — the panel schema and every scoring parameter as a table, and the 營衛 readings, natures, questions, stages and what is not modelled; *herbs* — the 94 curated herbs in full (the record's 性味 next to the source's sentence, functions, effects, burdens, flags, the reference amount) and the derived ones by their **rules** (each effect rule, each burden rule shown by what it computes, the pregnancy and toxicity rules, the property rules of the prescription model) and by the **stratified sample of §4.3**, drawn by a fixed seed (`SAMPLE_SEED`; change it to redraw); *guidance* — the acupoints with their locations, cautions, pregnancy flag and the patterns that recommend them, the foods, self-acupressure, lifestyle by pattern; *reference* — the amount-dependent actions, the 三因 factors as numbers, the direction of qi, processing, the guide herbs, the model's parameters and the 七情 pairings; *wuxing* — the correspondences, the stem and branch tables, the 五運六氣 tables with their excerpts, the engine's caps; *citations* — every quotation in full with where the knowledge base and the learning book use it; *glossary* — the terms by domain and the name folding as characters. Three areas are texts outside `data/` ([§5](#5-review-records)): *ui* — every message of every namespace in both languages (the `safety` namespace marked for the physician); *book* and *course* — **chapter-by-chapter worksheets**: for the book, each quotation with the verified citation it resolves to (in full) and the explanation that follows it, the chapter's own statement of the model's simplification and the chapter checks; for the course, each chapter's hours, goals and sections, each excerpt with its 白話, each term with its glossary entry, the references to the app, each exercise with its answer from the answer key, and the chapter checks — every row with an empty *Decision* and *Comment* cell. A text pack's record names its pages (or namespaces) and, as `kb_version`, the hash of the whole text.

> **Implementation (PM-21): the dossier of a candidate.** A *candidate* pattern is judged **before any weights are written**, on a generated page: `pnpm review:dossier review/candidates/<id>.yaml` writes `review/packs/dossiers/<id>.md` (git-ignored) from a short proposal and the library as it is — its sources and their verification, the overlap with every existing pattern measured with the engine's own scoring, the questions that already touch the proposed symptoms and how many separating ones are missing, the red flags nearby, the formulas that could serve it and the estimated cost against the budget. The reviewer answers *accept · reject · change*; a decision is recorded like any other ([§5](#5-review-records)). Only an accepted candidate is authored, and then it meets the admission checklist ([KB schema §8.4](kb-schema.md)). See [library expansion](post-mvp/design/library-expansion.md) §5 and §9.1.

### 4.3 Sampling the derived herbs

The 609 derived herbs are produced by transparent rules (`herb_model.py`). They are reviewed by **(a) reviewing the rules** (organ, flavour, tag and burden rules) and **(b) a stratified sample**: ≥ 10 herbs per category (補虛, 清熱, 解表, 化痰, 活血, 利水 …), always including every herb flagged `toxic`, `avoid`, or `caution` in pregnancy. If more than 5 % of the sample needs a change, the rule is revised and the sample redrawn; individual corrections become `EFFECT_OVERRIDES` (curated).

### 4.4 Calibration sessions (patterns, weights, thresholds)

Held with the clinical reviewer using the **dev profile's inspector** ([tech spec §8.6](tech-spec.md)):

1. Present vignettes (the "typical patient" for each pattern and the confusable pairs).
2. The reviewer adjusts presented findings; the inspector shows pattern scores and contributions; disagreements about ranking become **golden cases** (input + expected top patterns + expected suppressed items): the inspector's **Case** tab exports the skeleton, the reviewer corrects `expect`, and the case is saved as `packages/engine/test/golden/G-xxxx.json` with the reviewer's record id in `authoredBy` and a `split` of `tuning` or `held-out` (alternating, decided when the case is written — see [test plan §3.5](test-plan.md)).
3. Weight changes are made in the curated tables (never in `data/`), the KB is rebuilt, the self-test and the golden cases re-run (`pnpm golden`; the held-out half is only ever read as numbers while tuning).
4. Each session ends with a recorded list of changes and the new **scoring-params fingerprint**.

Before a session, the reviewers read [the golden misses](golden-misses.md) (PM-59, generated): where each case of the tuning half fails and what would change it, the held-out half in numbers only, and the questions it raises.

Target: ≥ 100 golden cases, ≥ 80 % top-3 concordance on the held-out half ([PRD §11](PRD.md)).

---

## 5. Review records

Records live in `data/review/records.json` (planned; schema in [KB schema §9](kb-schema.md)), generated from `review/records/*.yaml` that reviewers' decisions are committed to:

```json
{
  "id": "REV-2026-0001",
  "area": "patterns",
  "scope": { "files": ["diagnosis/patterns.json"], "ids": ["SP1", "SP2", "SP3"] },
  "reviewer": { "role": "tcm-clinical", "name": "(recorded with consent)", "credential": "licence no. / body" },
  "date": "2026-11-02",
  "kb_version": "<hash>",
  "outcome": "accepted-with-changes",
  "changes": ["SP1: S_LOOSE_STOOL weight 3 → 2", "SP3: added required_any S_PROLAPSE_SENSATION"],
  "dissent": [],
  "notes": "Expert judgement; textbook 中醫診斷學 (edition …)"
}
```

Rules: the record's `kb_version` is the version **reviewed**; if the covered records later change, their status falls back to `curated-draft` until re-reviewed (a build step compares the content hash of each reviewed record with the hash at review time). `status: reviewed` is set **only by the build** from a valid record — never by hand.

> **Implementation (K-16).** Records are YAML files in [`review/records/`](../review/records/README.md) (template: `TEMPLATE.yaml.txt`), one reviewer decision each; `scripts/kb/build_review.py` (logic in `scripts/kb/review.py`) compiles them into `data/review/records.json` as the last data step of `build_kb`. The `scope` of a record is a list of `{ file, units }`, where `units` maps each unit id — an item of a data list (a pattern, a formula, a safety rule, a red flag, a herb, a glossary term as `domain/term` …) or `"*"` for the whole file — to its **content hash**: 16 hex digits of the SHA-256 of the canonical JSON of the unit without any status marker. The hash is of the *final* content the reviewer accepted, after the agreed changes were applied and the knowledge base rebuilt (the review pack of K-17 prints the hashes). **Reset on change:** the data builders regenerate every status from the curated tables, so a unit whose content changed after its review is back to draft by construction, and the record is listed under `stale` in `records.json` (old and new hash) until the unit is reviewed again. **Roles:** a unit counts as `reviewed` only when valid, current, accepted records (`accepted` or `accepted-with-changes`; `rejected` and `deferred` mark nothing) cover it from the roles its file needs — red flags, safety rules and scope profiles: a **physician and** a second reviewer of another role (pharmacy or TCM clinical); emergency numbers: a physician; formulas, herbs and treatment guidance: **TCM clinical and pharmacy**; the glossary: linguistic; everything else: TCM clinical (`REQUIRED_ROLES`). The build then sets `status: "reviewed"` on covered units that carry a status field (and on `_meta.status` for a whole-file review; the herbs' status counts follow); units without a status field are covered in `records.json` only (`reviewed`, `coverage`). **Guard:** `validate_kb` fails when anything is marked `reviewed` that no valid, current record supports, and the build fails on an invalid record (bad id, role, date or outcome, unknown file or unit, malformed hash, `accepted-with-changes` without the changes listed, a missing name or credential — a name may be "(withheld)", never empty). With no records the output says so and nothing changes.

> **Implementation (PM-57): the texts outside `data/`, and the remaining roles.** A record may also name a **review target outside `data/`**: the learning book (`docs/book/zh-Hant`) and the course (`docs/course/zh-Hant`), whose units are their Markdown pages (`01-model.md` …, the README, the course's answer key and sources), and the interface text (`apps/web/src/i18n`), whose units are its namespaces (the Traditional Chinese and English messages of each; the Simplified catalog is generated and its word list reviewed with `pnpm i18n:review-hans`). A page is hashed as its text (SHA-256 of the UTF-8, line ends `\n`, 16 hex digits), a namespace as its messages, and the whole target `"*"` over its units' hashes; `records.json` covers them like a file (`coverage`, `reviewed`, `stale`), but they carry no status field — **whoever shows a text reads its status from the records**: the book reader (`packages/kb/node/book.ts`) makes the book `reviewed` only when the records name the whole text, or every page, with the hash it has *now* (so an edit after the review makes it a draft again even before the records are rebuilt), and a public build carries the book only then (`check-release` rule 16). Roles: the book and the course need a **linguistic and** a TCM-clinical reviewer; the interface text a **linguistic and** a regulatory reviewer, and its `safety` namespace (the notices) and the whole text also the **physician** (`UNIT_ROLES`); and among the data files, the reference quantities and the prescription model's tables need TCM clinical **and** pharmacy, the symptoms and questions TCM clinical **and** linguistic, the five-phase tables TCM clinical **and** regulatory, the name folding linguistic. Mapping lists (the acupoints and foods of `treatment/guidance.json`, the 營衛 natures) are reviewed by name (`acupoints/合谷`).

---

## 6. Workflow

```mermaid
flowchart LR
  A[Change proposed\n(code, curated table, translation)] --> B[Build KB + validate + self-test]
  B --> C{Medical content changed?}
  C -- no --> M[Merge]
  C -- yes --> D[Content owner builds review pack]
  D --> E[Reviewer decides per record]
  E -->|changes| A
  E -->|accepted| F[Record committed; build sets status = reviewed]
  F --> M
```

1. **Authoring** — all medical content changes are made in `scripts/kb/curated/*` with a citation or an *expert-judgement* note.
2. **Automated gates** — `build_kb` (validation, citation verification, pattern self-test), engine parity fixtures regenerated, lint for wording.
3. **Review** — for changed or new records the owner opens a review request containing the pack. Turnaround target ≤ 10 working days.
4. **Decision** — accept / change / remove / escalate; changes loop back to authoring.
5. **Record and merge** — the record is committed with the content change; the build marks the covered records `reviewed`.
6. **Release gate** — [§7](#7-release-gates).

**Small safe edits** (typo fixes, formatting, adding a citation that already exists) are classed *editorial* and do not need review, but the build still resets the status if the record's content hash changes — so editorial edits to a reviewed record require a lightweight reviewer re-confirmation (one-line record).

---

## 7. Release gates

What must be `reviewed` before each output level is enabled in a **release** build:

| Level / feature | Required reviewed areas |
|---|---|
| **Any release** | Red flags and scope · scope-profile configuration · all notices and disclaimers · UI strings (both languages) · glossary rows used · birth/yunqi/season copy (or the birth module stays off) |
| **L0** (education) | Patterns and elements in use · symptoms/questions · tongue and pulse content · constitutions and susceptibility · panel model and scoring params · lifestyle/seasonal text · citations used · the learning book, if the build carries it (a public build carries it only once reviewed: `check-release` rule 16) |
| **L1** (+ diet, acupoints, tier-A formulas without dose) | + treatment guidance (diet, acupoints, pregnancy cautions) · the tier-A formulas (composition, roles, indications) · **the herbs in those formulas** (effects, burdens, flags) · the safety rules those formulas can trigger |
| **L2** (+ tier B, modification, herb weights) | + tier-B formulas and their herbs · classical modifications · the residual-modification candidate pool · herb weight display text |
| **L3** (dev only) | None required, but items remain labelled *draft* in the UI |
| **L3 for learners and practitioners** (PM-53) | + everything of L2 · the tier-C formulas · the amounts and dose bands · the herb records and the prescription tables — a public build carries the reference only once every formula and herb record in it is `reviewed` (`check-release` rule 18) — whatever the configured `dose_display` (PD-30: configurable, every reader by default; the gate is not); the closed beta carries it with the draft label |

A release build **must fail** (`check-release.ts`) if a required area has no valid review record for the shipped KB version, or if the record's covered content hash differs from the shipped content (§5). Until the reviews exist, the release configuration is lowered to the highest level whose gates are satisfied — in the current state, **no clinical output is releasable**; only the dev profile runs.

**Closed-beta exception (milestone M4 only).** A limited beta may ship draft content if **all** hold: (a) the content owner records an explicit, dated exception in the release notes naming the unreviewed areas; (b) every result screen carries a visible "draft content — not yet reviewed by a practitioner" label (a build flag that `check-release.ts` verifies); (c) the beta is invitation-only and participants are told so in the consent text; (d) the physician review of red flags, scope and notices is **complete** (never waived). Public releases have no exception.

---

## 8. Disagreement, errors and re-review

| Situation | Action |
|---|---|
| Reviewers disagree | Ship the more restrictive version; record both positions in `dissent`; the owner may escalate to a third reviewer |
| Classical schools differ (e.g. tongue zone assignments, 長夏 extent, orifice correspondences, formula variants) | Keep both in the data when feasible; state which one the app uses in the copy; record the choice |
| Error found after release | Follow the incident process in the [safety policy §8](safety-policy.md): triage, hotfix (usually restricting the item through a rule), re-review of the area, public note in the changelog |
| Source updated (new Pharmacopoeia edition, guideline change, new upstream commit) | The KB build detects the changed source commit/hash of affected records and resets them to `curated-draft` for re-review |
| Annual re-review | At least yearly for safety rules, red flags, interaction/pregnancy flags; every two years for the rest |
| Reported by a user | Logged in the issue tracker with the KB version and the item id; triaged by the owner; routed to the matching reviewer |

---

## 9. Reviewer guide (one page)

1. You review **content**, not code. The pack shows each record in plain language with its sources.
2. For each record choose **accept / change / remove / escalate**; for *change* write the new value or text.
3. Where a value is your judgement rather than a textbook fact, say so ("expert judgement") — it is recorded as such.
4. If you are unsure, choose *escalate*: it is better to restrict than to guess.
5. You may decline to review an area outside your competence; say which.
6. Your name and credential are published only with your written consent.

---

## 10. Tooling (to build; see `TASKS.md`)

| Tool | Purpose |
|---|---|
| `scripts/review/pack.py` | Generate review packs per area (Markdown) with engine behaviour annotated — seventeen areas covering every data file, the interface text, and the book and the course as worksheets (PM-57) |
| `scripts/review/dossier.py` | Generate the dossier of a candidate pattern from its proposal (PM-21), before any weights are written |
| `review/records/*.yaml` → `data/review/records.json` | Record format and compilation, with content hashes |
| Build step "apply review status" | Sets `reviewed` only from valid records; resets on content change |
| `check-release.ts` | Release gate (§7) |
| Dashboard (Markdown report from the build) | Coverage by status per area; list of unreviewed items; golden-case concordance |

---

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-04 | Initial proposal |
| 0.2 | 2026-10-07 | §3, §7: the learning book (PM-42, PM-43) — reviewed by a linguist and a TCM clinician; a public build carries it only once reviewed |
| 0.3 | 2026-10-07 | §3: the 營衛 readings and weights join the panel model's review (PM-52) |
| 0.4 | 2026-10-08 | §3: the words that re-open the red-flag screening (`safety/red-flag-terms.json`, PM-47) join the red flags' review |
| 0.5 | 2026-10-08 | §7: L3 for learners and practitioners, and what a public build needs before it serves them (PM-53) |
| 0.6 | 2026-10-08 | §7: the review gate holds whatever `dose_display` is configured (PM-54) |
| 0.7 | 2026-10-08 | §3: the course and its textbook (PM-55) — reviewed by a linguist and a TCM clinician |
| 0.8 | 2026-10-09 | §3: the learning book as the course's companion — each perspective fair to the tradition (PM-56) |
| 0.9 | 2026-10-09 | §3: the reference quantities and the prescription model's tables, the name folding, the interface text's files; §4.2: every area has a pack, the book and the course as worksheets; §5: records of the texts outside `data/` (the book, the course, the interface text), the book's status read from them, the remaining roles (PM-57) |
| 0.10 | 2026-10-09 | §4.4: the report of the golden misses read before a session (PM-59) |
