# Design: Knowledge Browser and Pattern Comparison

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design for Release B (FR-14, FR-25; tasks PM-13 … PM-16) and Release C (herb browser; PM-24, PM-25). Nothing is built |
| **Last updated** | 2026-10-05 |
| **Audience** | Engineers, designers, the clinical reviewer |
| **Related** | [Requirements FR-14, FR-25](../requirements.md#fr-14-knowledge-browser--release-b--class-n-herbs-c-release-c--refines-fr-14) · [PRD §3](../../PRD.md#3-target-users) · [Tech spec §5.3, §8.1](../../tech-spec.md) · [UX spec](../../ux-spec.md) · [Safety policy](../../safety-policy.md) · [i18n guide §5](../../i18n-guide.md) |

> **Summary.** The app already holds a reviewed-in-principle body of knowledge and shows pieces of it inside a result. The browser lets the learner and the curious reader walk that knowledge without taking an assessment: patterns, constitutions, formulas, acupoints, foods, quotations and terms, each with its sources, review state and cautions, and a side-by-side comparison of patterns that uses the question bank to show what tells them apart. It adds **no new clinical content and almost no new data** for Release B — only routes, a search index and pages built from records the session already loads. The one design rule that matters is the *anonymous-context rule*: a page that describes something a person might use carries its cautions at the top and never speaks to "you".

---

## 1. Goal and non-goals

**Goal.** Serve the *TCM Learner* and *English-speaking User* personas ([PRD §3](../../PRD.md#3-target-users)): see how a pattern, a formula or a point is described, where the description comes from, and how similar patterns differ.

**Non-goals.** Personalised advice outside an assessment; ranking or recommending for a visitor; new clinical statements; search-engine visibility (the build stays `noindex` while any content is draft); user-contributed content; herbs before Release C.

## 2. What exists today

| Fact | Consequence |
|---|---|
| Routes live under `/:lang/…` in a nested wouter router; each screen is a lazy chunk behind one `Suspense` | Learn routes are another lazy group: no cost for people who never open them |
| A result already shows formulas (`/result/:id/formula/:fid`), points, foods, quotations and terms, with cautions and citations — but always for a person | The page templates exist as components; the browser reuses them with an anonymous context |
| Every session loads `core` (patterns, questions, symptoms, constitutions, glossary), `formulas`, `guidance` and `citations` | Release B needs **no new data chunk** except a search index |
| The release bundle has tier-A formulas without amounts, 94 curated herbs as display names only, no herb weights; the 609 derived herbs are kept for the browser ([tech spec §5.3](../../tech-spec.md)) | Release B shows what a release result can show; herbs wait for Release C and a delivery that respects the budget |
| Foods and acupoints are dictionaries **keyed by their Chinese name**; acupoints also have a WHO `code`; foods name their `herb` id | URLs need stable ASCII ids; the data gains them |
| `Term` shows glossary popovers keyed by the Traditional term | The popover keys follow the script of the loaded data ([Simplified design](simplified-chinese.md)) |
| Patterns carry weighted `weights`, `against` symptoms, `required_any`, formulas, treatment and tongue/pulse notes; K-07 made three confusable pairs separable by at least three questions | Comparison can be computed from data already in the session |
| Prose is `draft`; English is a machine draft; the draft label exists | Every page carries the same draft label as a result does |

## 3. Information architecture

| Route (under `/:lang`) | Page | Source records |
|---|---|---|
| `/learn` | Hub: seven cards, a search field, a plain line on what this section is | — |
| `/learn/patterns` · `/learn/patterns/:id` | List by group (external, spleen-stomach, liver, heart, lung, kidney, qi-blood) · detail | `patterns` (+ elements, formulas, treatment, citations) |
| `/learn/constitutions` · `/:id` | List of nine · detail (features, prior nature, susceptibility) | `constitutions` |
| `/learn/formulas` · `/:id` | List by school and tier · detail: composition with roles, principle, rationale, cautions, interactions, pregnancy, verification | `formulas` (+ herb display names) |
| `/learn/points` · `/:code` | List by meridian · detail: location in words, basis, cautions, pregnancy flag | `guidance.acupoints` |
| `/learn/foods` · `/:id` | List by nature and flavour · detail: nature, flavours, functions, rationale, cautions | `guidance.foods` (+ herb link) |
| `/learn/quotations` · `/:id` | List by book · the quotation, its source, translation label, verification | `citations` |
| `/learn/terms` · `/:id` | Glossary: *Chinese · pinyin · English*, note, source | `glossary` |
| `/learn/compare?ids=SP1,SP4` | Pattern comparison (§6) | `patterns`, `questions`, `symptoms` |

Release C adds `/learn/herbs` and `/learn/herbs/:id`. A result links into the same pages (a term, a quotation, a pattern name); a learn page links back to the assessment with one neutral line at its foot.

**Stable ids.** Patterns, constitutions, formulas and quotations already have ASCII ids; acupoints use the WHO code; foods are addressed by the id of the herb they name, or by a new stable `id` the builder gives a food without a herb. Terms get an id derived from the glossary entry. No route contains Chinese characters, so links do not depend on the script of the data.

## 4. The anonymous-context rule

A learn page is not an assessment. There is no subject, no pregnancy status, no medication list, and the person-based safety filter cannot run. The page must therefore **show every caution instead of applying none**.

| Rule | How |
|---|---|
| **R1 Cautions first** | On any page that describes something a person might use (formula, food, point, and later herb), the cautions, pregnancy flag, interaction notes and allergen notes sit in the first section, not behind a toggle or below the fold. The same text and components as the result page |
| **R2 No "you"** | Page text is descriptive and third-person. A lint over the learn catalogue and the page templates rejects second-person wording ([i18n guide §5](../../i18n-guide.md) forbidden-wording mechanism, one more list) |
| **R3 Standing line** | Every such page says, under its title, that it is general information and not advice for the reader, and links to the safety page |
| **R4 The profile bounds the content** | A release bundle contains only tier-A formulas without amounts and no herb weights, so the pages cannot show more; a dev build shows everything with the dev banner. Tier, verification state, review state and the draft label appear as in a result |
| **R5 No nudging** | A pattern page lists *typical features*, never a checklist phrased as a question, and never says which pattern a visitor "might have"; the only link to an assessment is the neutral one at the foot |
| **R6 Every statement has a source** | A page lists at least one citation or states "no source"; a clinical statement with neither fails the build |
| **R7 The record can be trusted** | A page shows the flags stored on the record. The builder derives them from the herbs and `validate_kb` already fails when a formula's stored pregnancy flag differs from the worst flag among its herbs; the task checks that the same holds for the interaction list and extends the rule if it does not, so a page never has to second-guess a record |

R7 is a guard rather than new work: the stored fields are the source of truth in a result as well, and the build-time consistency rule keeps a stale field from silently hiding a caution.

## 5. Search

| Aspect | Design |
|---|---|
| Index | One lazy chunk `search.<hash>.json` (about 400 entries in a release build: patterns, constitutions, formulas, points, foods, quotation titles, terms), written by the bundler from the pruned data: `{ type, id, names[], aliases[] }`. Entries carry names in **both scripts** (the Simplified design's builder supplies them), English, the pinyin the data has (glossary terms and the pinyin names of formulas), WHO codes and ids. Estimated 8 KB gzip; loaded when the hub or a list opens |
| Normalisation | Case, full- and half-width, spaces, and tone marks for pinyin are ignored (so `yin` finds `yīn`) |
| Matching | Exact, then prefix, then substring, on every name form; results grouped by type, at most eight per type, then *Show all* |
| Pinyin limit | Names without pinyin in the data (patterns, points, foods) are found by their Chinese and English forms; pinyin for everything needs a pinyin library and an approval to download, and is a later data task |
| Interaction | An ARIA combobox with the keyboard pattern users know (arrows, Enter, Escape); results are links; no search history is kept |
| Where | The hub and each list page; a global search is not planned |

## 6. Pattern comparison

`comparePatterns(kb, ids)` is a pure function in `@tcm/engine` (`learn.ts`; no prose, tested like the rest) for two or three patterns.

| Output | How it is computed |
|---|---|
| **Principle, group, tongue and pulse notes, formulas** | Copied from the records |
| **Shared features** | Symptoms with weight in every compared pattern, shown with a band per pattern |
| **Distinguishing features** | Symptoms whose weight differs most (and symptoms that are `against` one but not the other), each with a band per pattern |
| **Bands, not weights** | The weight relative to the pattern's largest weight: *key* (≥ 2/3), *common* (≥ 1/3), *supporting* (below), *speaks against* (an `against` symptom). Raw numbers stay in the dev view |
| **Questions that tell them apart** | For each question of the bank, the sum over its option symptoms of the absolute difference in weights between the patterns; the top three are listed with their plain-language prompt. This is the K-07 analysis, now available to the reader |

The page is a real table (row headers for features, column headers for patterns) so that it reads on a phone and with a screen reader; at phone width the table scrolls horizontally *inside* its container or collapses to one card per pattern with the same rows. Entry points: a pattern page (*Compare with…*), the hub, and a result's *also considered* list. From a result the page may mark which distinguishing features the person answered, which is the content of *What would change this* and adds no new score; that variant lives under the result route, not under `/learn`.

The name **Compare patterns** (比較證型) is deliberately different from the history screen's *Compare results*.

## 7. Delivery and budget

| Item | Plan |
|---|---|
| JavaScript | The learn shell, page templates and comparison are one lazy route group, at most **40 KB gzip**; shared components come from the existing chunks |
| Data | Release B: one new chunk, the search index (≈ 8 KB gzip), cached with the others for [offline use](offline-and-install.md) |
| Release C herbs | A compact **browse index** (id, names, nature, flavours, channels, short functions, flags; about 70 KB raw) plus detail **shards** fetched on demand (16 shards by id hash, each about 4–5 KB gzip), listed in the manifest with their hashes like every chunk, and never part of the per-session figure. The release shows herb pages only for herbs covered by the sample review (V-04); the others keep the draft label |
| Print | The existing print stylesheet; navigation is hidden |
| Indexing | `noindex` as long as any shown content is draft ([check-release rule 8](../../release-process.md)); the pages are client-rendered and indexing is not a goal |

## 8. Experience and accessibility

- A page has one `h1`, a *Sources* section, a *Related* section and a short on-page index; focus moves to the heading on navigation (the existing `RouteFocus`).
- Lists are real lists with headings per group; filters are native controls; a filter change announces the count.
- Terms in running text open the existing popover; the popover is also reachable by keyboard.
- Language switch keeps the route (ids are language-neutral); Simplified pages use the Simplified variant of the data.
- Lists use the data's own group order; English lists sort alphabetically with `Intl.Collator`. Chinese alphabetical sorting is not offered: its conventions (pinyin, strokes, zhuyin) differ by reader.

## 9. Safety, review and rollout

- **Class N** ([README §3](../README.md#3-review-classes)): the content shown is what a result can already show, under the same draft labels. The new exposure is *context*, which the anonymous-context rule addresses; the clinical reviewer is asked to read R1–R7 and the page templates once (not the content again).
- A release build ships the learn routes only if `check-release` finds each page type's template tests green; the closed beta ships them under the draft label with the rest.
- **Herbs are class C** and wait for V-04's sample review; the Release C task names which herbs lose the draft label.

## 10. Tests

| Layer | Test |
|---|---|
| Unit | `comparePatterns` (bands, shared and distinguishing features, top questions) on the three confusable pairs of K-07 and on random pairs (symmetry; a pair of one pattern is empty of distinguishing features); search normalisation and ranking |
| Property | For every record of every type: the page model has a title, at least one source or "no source", and — for advice-like types — a non-empty cautions block placed before the description; no page text contains second-person wording |
| Component | Page templates for each type in both languages and both profiles; the release bundle never produces a page for an item it does not contain |
| Release | The consistency rule covers both the pregnancy flag and the interaction list: the build fails when a stored flag disagrees with the formula's herbs |
| End to end | Hub → search → page → compare → back; deep link opens a page in a fresh context; offline after the first visit |
| Accessibility | Every page type in the jsdom and real-browser axe sweeps (light and dark); keyboard-only run through search and comparison |

## 11. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release B.**

| Question | Default |
|---|---|
| Section name | *Learn* (學習) |
| Herbs in Release B | No: Release C |
| Global search in the header | No: hub and list pages |
| Alphabetical Chinese sorting | No |
| Pinyin for every name | Not now: needs a pinyin library and an approval to download |
| Indexable by search engines | No, while any shown content is draft |
| Cautions behind a toggle | Never |

## 12. Tasks

PM-13 (shell, ids, anonymous-context components, search index, print), PM-14 (pattern and constitution pages), PM-15 (formula, point, food, quotation and term pages; R7 check), PM-16 (comparison), PM-24 and PM-25 (herbs) — [`TASKS.md`](../../../TASKS.md).

## 13. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design |
