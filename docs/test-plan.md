# Test Plan

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Plan — only `packages/wuxing` (74 tests) and the KB validation/self-test exist today |
| **Last updated** | 2026-10-04 |
| **Audience** | Developers, QA, content reviewers |
| **Related** | [PRD §11 metrics](PRD.md) · [SOP App. C](diagnosis-sop.zh-TW.md) · [Tech spec §7, §12](tech-spec.md) · [UX spec §8, §14](ux-spec.md) · [Safety policy §6.3, §9](safety-policy.md) · [Content review §4.4](content-review.md) · [`CHECKLIST.md`](../CHECKLIST.md) |

---

## 1. Goals and principles

1. **Correctness of the diagnostic core** is proven three ways: against the Python oracle (parity), against practitioner-agreed cases (golden), and against invariants that must hold for *every* input (properties).
2. **Safety behaviour is tested exhaustively**, not sampled: every population/condition/state × profile cell and every red-flag item.
3. **Determinism**: same input + same KB + same parameters ⇒ byte-identical output.
4. **Synthetic data only.** No real person's health or birth data appears in tests, fixtures, screenshots or bug reports ([privacy §6](privacy.md)).
5. **Tests are fast and local first**; heavy suites (E2E, Lighthouse) run in CI and on demand.
6. Every defect found after merge gets a **regression test** (golden case, property, or vignette) before the fix.

---

## 2. Test pyramid and tooling

| Layer | What | Tool | Where | Runs |
|---|---|---|---|---|
| **Unit — packages** | Pure functions of `@tcm/wuxing` ✔, `@tcm/kb`, `@tcm/engine`, `@tcm/i18n` | `node:test` (Node ≥ 22.18 type stripping, no build step) | `packages/*/test/*.test.ts` | every commit |
| **Property** | Invariants over seeded random inputs (§3.2) | `node:test` + an in-repo seeded generator (mulberry32; no dependency) | `packages/engine/test/props/` | every commit |
| **Parity** | TS engine vs Python oracle fixtures | `node:test` | `packages/engine/test/parity.test.ts` | every commit; fixtures freshness check in CI |
| **Golden cases** | Practitioner-agreed expectations | `node:test` data-driven | `test/golden/*.json` | every commit (non-blocking until M3, then blocking) |
| **KB** | Build determinism, schema validation, integrity rules, citation verification, pattern self-test, forbidden-wording lint | Python + `jsonschema`, `node:test` | `scripts/kb`, `packages/kb/test` | every commit touching `data/` or `scripts/kb` |
| **i18n** | Key parity, placeholders, glossary and wording lint | `scripts/check-i18n.ts` | CI | every commit |
| **Component** | Rendering, interaction, a11y roles | Vitest + Testing Library (+ `vitest-axe`) | `apps/web/src/**/*.test.tsx` | every commit |
| **E2E** | Full flows on desktop and mobile viewports, both languages | Playwright | `apps/web/e2e/` | CI; nightly full matrix |
| **Accessibility** | axe on every route × language × theme; manual AT runs | `@axe-core/playwright`, VoiceOver/TalkBack/NVDA | CI + release checklist | CI; per release |
| **Performance** | Bundle budgets, Lighthouse CI, engine micro-benchmarks | `scripts/check-budgets.ts`, Lighthouse CI, `node --test` bench | CI | CI; per release |
| **Visual regression** | Key screens in `zh-Hant`, `en`, `en-XA` at 320 px and 1280 px | Playwright screenshots | CI (diffs reviewed, not auto-approved) | CI |
| **Usability** | Moderated sessions | Protocol §7 | — | before beta; each major UX change |
| **Practitioner evaluation** | Concordance on blinded vignettes | Protocol §4.3 | — | M3, M4 |

---

## 3. Engine and knowledge-base tests

### 3.1 Unit tests (per module)

| Module | Must cover |
|---|---|
| `policy` | Table-driven for every cell of both profiles; merged notices; two-phase resolution (state after step 9 only tightens); feature flags only lower |
| `normalize` | present/absent/unsure handling; severity factors; quality coefficients by prefix; exclusion conflicts; coverage and κ; position discount |
| `reference` | Delegation to `@tcm/wuxing`; capped blocks; birth missing/invalid (nonexistent local time) → `null` with notes; season model switch; trace lines |
| `constitution` | Scoring and primary/secondary; susceptibility × season |
| `patterns` | Formula `Pct`; `required_any` ×0.5; `against`; the 23 "typical patient" cases rank first (mirrors `selftest_patterns.py`) |
| `panel` | noisy-OR per sign with cap and floor; `W`; derived 八綱; offsets; alignment thresholds; transmission rules |
| `reconcile` | Top-3 rule, 錯雜 flag, tie-break by alignment, confidence grid boundaries (Pct 40/60, margins 8/15, c 0.6/0.8, κ 0.85) |
| `formulas` | `k*` closed form against brute-force minimisation; explained fraction; ≥ 60 % symptom fit filter; tier recomputation equals KB `tier` for all 33 formulas |
| `modify` | Classical modifications trigger by symptoms; greedy add ≤ 2 / remove ≤ 1; never removes 君; pool filtering (pregnancy, toxic); each step lowers cost |
| `safety` | Every rule family with positive and negative examples; `suppress_hard` vs `annotate_only`; suppressed listing |
| `explain` | Every trace kind produced; every recommendation has ≥ 1 citation; "what would change" is consistent with scoring |
| `questionnaire` | Deterministic ranking; module prerequisites; stop rule; cap at 50 |
| `@tcm/kb` | `indexKnowledgeBase` on the real `data/`; manifest/hash verification; schema-version mismatch refused; pruning removes exactly what §5.3 of the tech spec lists |
| `@tcm/i18n` | Interpolation, plural, fallback marking, missing key behaviour |
| `storage` (web) | Throwing storage, quota, migrations with fixtures |

### 3.2 Property tests (invariants for *all* inputs)

| # | Property |
|---|---|
| P1 | **Priors never change evidence:** `offsetPopulation === observed` for any reference panel; pattern scores are identical with the birth module on or off, and across any `now`, for the same findings |
| P2 | **Missing optional data never lowers a score:** adding `unsure` or removing tongue/pulse/birth never decreases any pattern `Pct` |
| P3 | **Monotone policy:** adding a risk factor never raises the level and never lowers the notice severity; `flow` is always `continue` |
| P4 | **dev opens, release restricts:** `dev` ≥ `release` in level for every input; `release` ≤ L1 (current config); blocking notices equal in both |
| P5 | **Determinism:** two runs give deep-equal results; shuffling the order of input keys changes nothing |
| P6 | **Bounded values:** `Pct ∈ [0,100]`, panel channels ∈ [−3,3], `k ∈ [0,3]`, explained fraction ≤ 1 |
| P7 | **Suppression is visible:** every item present in the candidate set is either in the output or in `suppressed[]` |
| P8 | **Policy at the producer:** no output field exists above the policy (e.g. no amounts when `dosage` is off) |
| P9 | **Exclusion handling:** mutually exclusive findings produce a conflict item, never a silent choice |
| P10 | **Formula safety:** in `release`, pregnant (or possibly pregnant) subjects never receive a formula with an `avoid`/`caution` herb; anticoagulant users never receive formulas with activating herbs |
| P11 | **Tier consistency:** recomputed tier equals the KB `tier` for every formula after any herb-data change |
| P12 | **Idempotent save/load:** `assess(load(save(assess(x))).input) = assess(x)` for the same versions |

Generators produce subjects, red flags, findings, medications and allergies with seeded randomness; each failure prints its seed and a minimised case.

> **Implementation (Q-03).** `packages/engine/test/properties.test.ts` runs P1–P12 end to end through `assess` over generated people (random answers, or a typical patient's full inquiry with a few answers changed, so that release can reach L1 and there are formulas to filter; the table is typed to need all twelve). Per-module versions stay next to the code (patterns, panel, formulas, policy, safety). `pnpm test:properties` runs the suite on every commit (it is part of `pnpm test`). **Seeds:** `PROPERTY_SEED` replaces the base seed and `PROPERTY_RUNS` multiplies every case count (`forAll` in `test/gen.ts`); both are printed whenever set, and a failure prints the seed of the failing case and the case itself — replay with `PROPERTY_SEED=<seed> pnpm test:properties`. **Nightly:** `.github/workflows/nightly.yml` runs every engine test ×10 with a fresh seed (the run id) and prints the golden-case report. Three properties carry a non-vacuity assertion (P7, P8, P10 fail when the generator did not produce enough people with formulas to filter). Two exceptions the properties encode on purpose: P1 allows the *order* of two patterns within the tie margin to be decided by the birth alignment (SOP §11 "平手裁決") and requires the verdict to say so (`tieBreak.by = "alignment"`); P7 accounts for tier A only in release, because tier B and C formulas are not in the release data at all.

### 3.3 Safety vignette suite (exhaustive)

| Group | Cases |
|---|---|
| Red flags | All **28** items individually × both profiles → expected notice kind (A emergency, B 24 h, C scope) and level; "not sure" treated as yes for A/B; multiple matches merge by severity |
| Populations | adult · 65+ · minor · pregnant · possibly pregnant · lactating × both profiles → level, notice, suppressed set |
| Conditions | each of the 7 × both profiles; combinations (pregnant + anticoagulant; minor + red flag B; elderly + antihypertensive + MAOI/stimulant) |
| Medication classes | each class × the formulas that can trigger it; free-text → N-MED-UNKNOWN |
| Allergies | herb/food match; unmatched free text → N-ALLERGY-UNKNOWN |
| States | low confidence, insufficient information, conflicting data × both profiles |
| Hazard rules | tier C; aristolochic-risk; 十八反/十九畏 pairs; flavour excess; pattern-direction conflicts |
| Pregnancy acupoints | each of the 8 points |
| Notice content | Both languages render every notice id with all parameters; the wording lint passes on them |

A vignette is `{ input, expect: { level, notice, suppressed[], mustShow[], mustNotShow[] } }` stored in `test/safety/*.json`. **A release is blocked if any vignette fails** ([safety policy §9](safety-policy.md)).

> **Implementation (Q-01).** `packages/engine/test/safety/*.json` (red-flags, populations, conditions, medications, allergies, states, hazards, pregnancy — 100+ vignettes) are run by `packages/engine/test/vignettes.test.ts` against the **real** knowledge base in **both** profiles (`pnpm test:safety`; part of `pnpm test` and of CI). `expect` is `{ both?, release?, dev? }`; a profile's entry overrides `both`. Fields: `level`, `notice`, `notices` (exact ids in order), `reasons`, `emergencyResources`, `status`, `show` / `hide` (formula ids, food names, acupoint names), `noFormulas` / `noFoods` / `noAcupoints`, `onlyTiers`, `annotated` / `notAnnotated` (rule ids on a shown item), `suppressed` (kind, id, reason, rule), `unmatchedAllergies`. Every vignette also gets the invariants of every output: the flow is `continue`, the acknowledgements are exactly the blocking notices, an item is never both shown and suppressed, and a suppressed item says why. Inputs are synthetic: an `interview` input replays the adaptive inquiry for a pattern's typical patient (so release can reach L1), `subject` / `redFlags` / `findings` / `context` override it; `kind: "candidates"` hands acupoints and foods straight to the safety filter (the pregnancy points, which no inquiry reaches). **Expectations are written from the policy documents and the rule/herb data, never copied from an engine run.** Meta-tests fail when a red-flag item, a medication class, a notice id or a safety rule has no vignette (a rule may instead be listed with the unit test that covers it: the pattern-direction rules, 十八反/十九畏, the constitution rule).

### 3.4 Parity with the Python oracle

`scripts/kb/export_parity_cases.py` ([tech spec §7.4](tech-spec.md)) writes `packages/engine/test/fixtures/parity.json` with: the SOP worked example (SP1 55.8 %, formula matches 64.7 % / 62.6 %), the 23 typical-patient cases, ≥ 200 seeded random finding sets, and edge cases. Tolerance 1e-9 on all numbers; identical rankings; identical greedy 加減 steps. CI regenerates the fixture and fails on `git diff`.

### 3.5 Golden cases (practitioner-agreed)

| Item | Specification |
|---|---|
| Format | `test/golden/G-xxxx.json`: `{ id, title, authoredBy (reviewer record id), input, expect }` with `expect` = `{ patterns: { first?, top3[], mustNotInclude[] }, confidence?, policy: { level, notice }, suppressed[], formulas: { top3[], mustNotInclude[] }, panelSigns: { "脾.qi": "-" } }` |
| Source | Authored in calibration sessions with the dev inspector's **Export case** ([content review §4.4](content-review.md)); synthetic only |
| Size and mix | ≥ **100**: typical and atypical for each of the 23 patterns; the confusable pairs (EX2/EX4, LG1/EX4, HT2/KD1); 寒熱錯雜 / 虛實夾雜; insufficient information; red flags and each population; medication interactions; tongue-zone and special-sign cases; optional pulse (with and without positions); birth-module on/off (the diagnosis must not change); season variants |
| Split | 50 % **tuning** (visible when calibrating) / 50 % **held-out** (never inspected while tuning) |
| Metrics | Top-3 pattern concordance ≥ 80 % and formula top-3 concordance ≥ 70 % on the held-out half (PRD §11); 100 % on policy and suppressed expectations |
| Status | Non-blocking in CI until M3; thereafter blocking for the policy fields and tracked for concordance |
| Maintenance | A change to weights re-runs the whole set; the diff of outcomes is part of the review request |

> **Implementation (Q-02).** Format and checker: `packages/engine/src/golden.ts` (import as `@tcm/engine/golden`; pure, no file access). Cases: `packages/engine/test/golden/G-xxxx.json` plus `config.json`. Each case adds `split` (`tuning` / `held-out`) and `notes` to the fields above; `input` is JSON (red flags as an array, an optional `birth` switches the birth module on, the clock is fixed); `expect.policy` and `expect.suppressed` are per profile (`{ release?, dev? }`); patterns, formulas, panel signs and confidence are judged on the **dev** profile (the full engine). *Concordance:* the practitioner's `patterns.first` (or, given only `top3`, any of them) must be among the verdict's top three patterns; `formulas.top3` must share a formula with the engine's first three (recommended, then study-only); a panel sign is `+` / `-` / `0` with ±0.5 as the threshold; `mustNotInclude` violations are counted separately. *Running:* `pnpm golden` prints concordance by split (`--held-out-detail` shows per-case detail for the held-out half — use it after tuning, never while tuning; `--strict` exits 1 on a missed target); the engine test always checks structure (ids, known patterns/formulas/symptoms) and enforces the targets only when `config.json` says `"blocking": true` — flip it at M3. *Seed set:* 30 synthetic cases (the typical patient of each of the 23 patterns, plus policy, birth-on and exclusion cases) with `authoredBy: "synthetic"`; the typical-patient seeds are derived mechanically from the question bank, so after any change to the bank or the pattern weights `pnpm golden:reseed --write` re-derives their findings (the engine test fails while they are out of date; expectations, splits and practitioner-agreed cases are never touched; K-07 re-seeded 11); the report states how many are practitioner-agreed (0 until calibration sessions) and the targets are not "met" while that is 0. *Authoring:* the dev inspector's **Case** tab exports the skeleton of a case (without birth data); the practitioner edits `expect`, gives an id and signs it with their review record.

### 3.6 Knowledge-base tests

Build determinism (build twice → identical bytes) · JSON Schema validation · the integrity rules of [KB schema §8](kb-schema.md) · 127/127 citations verified · pattern self-test (each pattern first for its typical patient; the closest-pair margins reported) · tier recomputation · orthography check (no `溼` in non-quotation fields) · bilingual completeness report · forbidden-wording lint on all display strings · bundle pruning tests (release bundle contains no amounts, no tier-C, no dev profile) · size budgets per chunk.

---

## 4. Product-level validation

### 4.1 Five-phase module (`packages/wuxing` ✔ and the adapter)

Existing: oracle parity with the source engine (10 births / 168 terms), HKO 240 solar terms ≤ 60 s, calendar anchors, invariants (74 tests). Add: adapter tests for `reference.ts` (block capping, trace, notes), snapshots of the SOP §6.4 worked example, and the "priors do not change the diagnosis" property (P1).

### 4.2 Reasoning quality checks

For every pattern: the `against` list and the "what would change this" suggestion are non-empty; every `TraceItem` of kind *theory* resolves to a verified citation; no sentence-level citation is attached to a claim it does not support (reviewed by the clinical reviewer in content review, not automatable).

### 4.3 Practitioner evaluation (M3, M4)

Blinded vignettes (written, synthetic) are given to ≥ 3 practitioners **and** to the engine; practitioners choose pattern(s) and formula(s); concordance and inter-practitioner agreement are reported (disagreement among practitioners is expected and informs which cases are "contested"); results feed calibration, never silent tuning to the test half.

---

## 5. Application tests

### 5.1 End-to-end scenarios (Playwright; mobile 375 × 812 and desktop 1280 × 800; `zh-Hant` and `en`)

| # | Scenario | Asserts |
|---|---|---|
| E1 | First-time user, healthy adult, no birth data, full flow to result | Disclaimer ack stored; result sections in order; confidence shown; evidence-against list present; no amounts (release); level L1 content only |
| E2 | Red flag A | Blocking emergency notice, acknowledge, flow continues, result limited to L0, emergency numbers shown, notice recorded and collapsed on result |
| E3 | Red flag B + minor | One merged notice (most severe first); L0 |
| E4 | Pregnant | Notice; L0; no formulas or pregnancy points; gentle lifestyle content |
| E5 | On anticoagulant | Inline notice; activating-herb formulas suppressed with reason listed |
| E6 | Allergy match | Matching items suppressed with reason; unknown allergen shows the "cannot confirm" notice |
| E7 | Insufficient information | Result shows what is missing and top questions; no formula |
| E8 | Birth module on (dev) / opt-in (release) | Echo of longitude/time zone; panel shows three blocks; the **diagnosis is unchanged** vs module off |
| E9 | Tongue zones and signs | Zone selection and checklist twin stay in sync (keyboard and touch); selections reach the trace as *self-observed* |
| E10 | Optional pulse | Rate, rhythm, exclusive groups enforced; irregular rhythm → B notice; educational note present. E10b: tapping along with the beat fills the rate (shown only after Done), and the review says how it was obtained |
| E11 | Language switch mid-flow | Route and all answers preserved; `lang` attributes update |
| E12 | Resume | Reload mid-inquiry → Resume card; answers intact |
| E13 | Save, history, compare | Two assessments compare; "computed with an older version" label after a simulated KB bump |
| E14 | Erase everything | IndexedDB, `localStorage`, Cache Storage empty |
| E15 | Offline after load / KB fetch failure | Error state with retry; draft intact; no partial medical output |
| E16 | Print view | Panel as table and figure; citations footnoted; disclaimer in footer |
| E17 | Dev profile | Badge visible; everything open; blocking notices still acknowledged; suppressed items annotated |
| E18 | Release bundle | `check-release.ts` passes; no dev profile, amounts, tier C or inspector route |
| E19 | Privacy | No cross-origin request after load; no marker value in URL/history/console |
| E20 | Storage blocked | "Not saved" chip; flow and result still work |
| E24 | Backup and restore ([design](post-mvp/design/backup-and-data-lock.md) §7) | Two results, a backup downloaded in one browser context and restored in another: the same ids, the same summary on each result, a second restore finds everything already here, and a file that is not a backup is refused in plain words (in Traditional, Simplified and English). Component tests cover each import stage on screen, the conflict choices, the Imported mark, the reminder and the quiet lines |
| E23 | Installation ([design](post-mvp/design/offline-and-install.md) §3.6) | The browser's install offer is held back (the page prevents its own bar), nothing is offered on a first visit, and the offer appears only as an *Install* button in Settings, used only when pressed; without an offer Settings still explains "Add to Home Screen" in words, with no button. Component tests: no screen is a dead end without browser buttons (every route keeps the way home and the three menu places); the manifest is the one of an installable app |
| E22 | Offline use ([design](post-mvp/design/offline-and-install.md) §6) | After one visit and with the server stopped: reload, a whole assessment, result, history, settings and sources work, in Chromium, Safari's engine and Firefox (and in Simplified); the offline copy holds exactly the build's files and nothing the person produced; an unknown address is left to the network. Its own projects and server (`serviceWorkers: "allow"`); every other scenario runs with workers blocked. **E22b** serves two real builds in turn: a newer build waits (the page is not reloaded under the person), *Reload* applies it, the draft survives, A's copy is deleted, a rollback is just another update, and a build nobody clicked for takes over after the page closes. **E22c** *Remove offline copy* leaves no copy and no worker, and the next visit installs it again. **E22d** a build whose application script is gone, or throws, is dropped after two failed starts (the worker and its copy removed, the next load from the network), both ways |

> **Implementation (Q-04).** `apps/web/e2e/` (Playwright; `pnpm test:e2e` builds both profiles first): `e01`…`e15-e20` hold the twenty scenarios, `e21-axe` the real-browser accessibility sweep, `dev.e17` the dev-profile one. The two builds are served the way the host serves them (`scripts/serve-dist.ts`): the release build with the draft label (`dist`, :4173) and the dev build (`dist-dev`, :4174); projects are desktop 1280 × 800 and mobile 375 × 812, each in `zh-Hant` and `en`, the dev scenarios on desktop in both languages and on mobile in Chinese. A scenario finds everything by the words on the screen in the page language (the app's own catalogues, `e2e/support/i18n.ts`) and answers the adaptive inquiry like the typical patient of a pattern (`support/app.ts`, `support/knowledge.ts`), so a changed question bank or wording does not break it. Locally `E2E_CHANNEL=chrome` uses the installed Chrome instead of the downloaded Chromium; CI runs the job `e2e` of `ci.yml`. Notes: E13's "older version" is simulated by editing the stored record's `kbVersion`; E15 blocks `/kb/**` and then goes offline (a screen that has to be fetched fails into the safe fallback, which now has "Try again"); E16 emulates print media and fires `beforeprint`; E18 also runs `check-release`; E19 records every request, navigation and console line. **Cross-browser (§5.3):** with `E2E_CROSS=1` the projects `cross-webkit-desktop`, `cross-webkit-iphone` (iPhone 13) and `cross-firefox-desktop` run E1, E2, E9 and E10 (`E2E_CROSS_ALL=1` runs every release scenario in them); the nightly workflow runs them. All pass locally — and so does the whole release set in WebKit and in Firefox; the offline half of E15 is checked in Chromium only, because Playwright's WebKit keeps a failed module fetch across the reload that follows. Edge is Chromium and Safari on iOS is WebKit; a real device is still part of the manual pass of §6.

> **Implementation of E14, E19, E20 at the component level (Q-08).** `apps/web/test/privacy.test.tsx` types marker values (an allergy, a medicine, a birth moment) into a full flow and checks, from outside: no request of any kind (fetch, XHR, beacon, WebSocket) and the knowledge loader's own requests are same-origin; no marker in the URL, history state, title, cookies or console on result, summary, history, settings and sources; what is written to the device — birth data is absent from localStorage and IndexedDB unless remembered (including the birth moment *derived* in a saved result), never in localStorage, and the draft in progress follows the same rule; erase empties localStorage, IndexedDB and Cache Storage; blocked storage reaches the result with the "Not saved" chip. From inside: a source scan (browser storage only in `storage/`, network access only in the knowledge loader, no raw-HTML injection, eval or absolute web addresses in code, no off-origin scripts in `index.html`). The real-browser versions run in the Playwright suite (Q-04).

### 5.2 Accessibility

Automated: axe (WCAG 2.1 A/AA) on every route × `zh-Hant`/`en` × light/dark, in default and 200 % zoom. Manual before each release: VoiceOver (iOS and macOS), TalkBack, NVDA — full flow including the tongue map (zone buttons and the checklist twin), the notice dialog (focus trap/restore), the radar's table equivalent and the citation sheet; keyboard-only run; reduced-motion; text-size presets; colour-blindness simulation of the panel visuals; contrast of the token table (unit-tested). Exit criterion: zero axe violations and all manual tasks completed.

> **Implementation (Q-05, and Q-04 for the real browser).** `apps/web/e2e/e21-axe.spec.ts` runs `@axe-core/playwright` (WCAG 2.0/2.1 A and AA, including colour contrast) on every screen of the flow in light and dark. The jsdom sweep below stays as the fast check.

> **Implementation (Q-05).** `apps/web/test/a11y-sweep.test.tsx` runs axe on every route of `App.tsx` in both languages (each in a state where it has content, plus the emergency-notice state) and fails when a route is added without being listed; contrast is verified from the token pairs of both schemes (`tokens.test.ts`) and, for real rendering, in the Playwright/Lighthouse runs. The manual assistive-technology pass, its severity rules and the record template are in the [accessibility protocol](accessibility-protocol.md); results are stored per release in `docs/a11y-records/`.

### 5.3 Responsive and cross-browser

Viewports 320, 375, 600, 900, 1200, 1920; landscape phone; touch targets ≥ 44 px (measured in Playwright); no horizontal scroll; Chrome, Safari (iOS), Firefox, Edge (last 2 versions) on the E1/E2/E9/E10 scenarios.

### 5.4 Internationalisation

`check-i18n.ts` (key/placeholder parity, glossary, wording); pseudo-locale (`en-XA`) screenshots for truncation; `zh-Hant` long-text mode; `lang` attribute audit; font fallback check for rare characters in classical quotations (reports glyphs rendered from fallback).

**Simplified Chinese** ([design](post-mvp/design/simplified-chinese.md) §6; Simplified is derived, so the checks are about the derivation): `check-i18n.ts` — key coverage, parameters, tags and plural forms of the generated `zh-Hans` catalogue against `zh-Hant`, no character that has another Simplified form, a glossary term rendered as the dictionary renders it; the Python tests of `scripts/i18n` — known answers (the table of the design and the exceptions the review sheet found), freshness and determinism of the dictionary and catalogues, a dictionary entry for every Chinese string of `data/`, quotations equal to their Simplified source text, forbidden-wording rules converted by the same pipeline finding exactly the same messages in both scripts; the bundler and `check-release` — every Chinese string of a profile's chunks aligned with its display list; `packages/kb` — loader behaviour for a missing, damaged or misaligned list; `packages/engine/test/language.test.ts` — the same assessments and vignette views whichever script is shown, and a knowledge base whose display function throws proves that the engine and the safety rules never read display text; the **purity sweep** (`hans-sweep.test.tsx`) — every route, every typical patient's result and every formula page rendered in Simplified shows no Traditional-only character, and `lang="zh-Hant"` does not excuse one; the real-browser scenarios E1, E2, E5, E9, E10, E11 and the axe sweep run in `zh-Hans` (desktop and mobile) and scan the page after each screen; visual baselines for the 14 key screens in `zh-Hans` are made on CI with the others.

### 5.5 Performance

| Test | Budget |
|---|---|
| `scripts/check-budgets.ts` | Initial JS ≤ 200 KB gzip; any lazy chunk ≤ 50 KB; all JS ≤ 300 KB (260 for the MVP plus what each post-MVP release declares for its lazy features); all CSS ≤ 20 KB; knowledge base per session ≤ 100 KB (the per-chunk KB budgets are in `bundle-data.ts`) |
| Lighthouse CI (mobile, throttled) | Performance ≥ 90, Accessibility ≥ 95, LCP ≤ 2.5 s, INP ≤ 200 ms on landing and result routes |
| Engine bench | `assess` ≤ 50 ms p95 (reference mid-range device profile, CPU throttled); regression > 20 % fails |

> **Implementation (E-19).** `pnpm bench` / `pnpm bench:check` (`packages/engine/bench/`): `assess` for the typical patient of every pattern in both profiles (600 timed runs, each figure the median of three rounds after a warm-up) and `nextQuestions`; p50, p95, max. A fixed reference workload measures the machine, and the baseline (`bench/baseline.json`) stores each p95 as a **ratio to it**, so the 20 % regression guard travels between machines; the absolute 50 ms budget is checked on the raw time. CI runs `bench:check` on every push. Today `assess` is ≈ 2 ms median and ≈ 6 ms p95 on a laptop, about a tenth of the budget, which is why the engine stays on the main thread (tech spec TQ5). Re-baseline with `node packages/engine/bench/assess.bench.ts --write-baseline` only after an intended change, in the same commit.
| Memory | No growth after 50 consecutive assessments in one session |

> **Implementation (Q-06).** Every screen except the landing page is a lazy route (`React.lazy`, with a busy-region fallback), so the initial JavaScript is the shell and the landing page: **≈ 120 KB gzip** (it was ≈ 156 KB before the split; budget 200 KB). `scripts/check-budgets.ts` measures the build output in gzip — the initial load (the entry and what it imports statically), each lazy chunk, all JS, all CSS and the knowledge base per session — and fails over the budgets above; it replaces a `size-limit` dependency because everything it needs is in the output directory, and has seeded-damage tests (`pnpm check:budgets`; a CI step after the release build). `lighthouserc.json` configures Lighthouse CI (mobile, throttled; the landing, start and sources pages in both languages, served by the Pages emulator): performance ≥ 0.9, accessibility ≥ 0.95, best practices ≥ 0.9, LCP ≤ 2.5 s, TBT ≤ 200 ms (the lab proxy for INP), CLS ≤ 0.1; the *Lighthouse* CI job has not run on a real runner yet, so its first run may need the thresholds or the page list adjusted. The result route needs a saved result in the browser and joins with the Playwright suite (Q-04). The crawlability audit is off because closed-beta builds are deliberately `noindex`.

### 5.6 Security

CSP present and strict in the built output; no inline scripts; dependency audit; license check; no way to render a string as markup or to run one — `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, `eval`, `new Function` are refused by the lint configuration (`tools/eslint/raw-html.test.js` runs the real configuration over samples); `console.*` stripped in release; static scan for `localStorage`/`indexedDB` use outside `storage.ts`.

---

## 6. CI mapping

| Stage | Jobs |
|---|---|
| **Fast (every push)** | typecheck all packages · unit + property + parity + golden (non-blocking) · KB build determinism and validation · i18n lint · component tests · ESLint |
| **Build** | `bundle-data` per profile with budgets · web build `release` and `dev` · `check-release.ts` on the release output · `check-budgets.ts` |
| **Integration** | Playwright E1–E20 (desktop + mobile, both languages) · axe sweep · Lighthouse CI · visual regression · privacy network test |
| **Nightly** | Full browser matrix · property tests with 10× iterations · long-running oracle comparison with fresh seeds |
| **Release** | All of the above on the release candidate + the manual checklist ([`CHECKLIST.md`](../CHECKLIST.md)) |

Blocking: everything except golden concordance (until M3), nightly, and visual-regression approvals (which need human review).

---

## 7. Usability testing

| Item | Plan |
|---|---|
| **Participants per round** | 8–12: 4–5 `zh-Hant` phone users (curious health-seekers), 2–3 English users, 1–2 TCM learners, 1–2 licensed practitioners, 1–2 screen-reader users, at least 2 aged 55+ |
| **Materials** | Persona scenario cards with synthetic symptoms (default); participants may use their own situation **only** with written consent and local-only processing, no screen recording of health content |
| **Tasks** | (1) start and complete an assessment; (2) explain in their own words *why* they got the result; (3) find the evidence against the leading pattern; (4) find and understand the formula's 君臣佐使 and cautions; (5) respond to a blocking notice and continue; (6) enter tongue findings by zone; (7) skip pulse; (8) switch language; (9) erase data |
| **Measures** | Completion and time (median ≤ 10 min); errors; "I understand why" (1–5, target ≥ 4); SUS; notice comprehension (100 % know what to do); can-find evidence-against (≥ 80 %); tongue step unaided (≥ 80 %) |
| **Rounds** | R1 clickable prototype of S01–S07 and S13 (before building the full UI); R2 MVP build; R3 beta |
| **Output** | Issue list with severity (blocker / major / minor), mapped to UX spec sections; changes recorded in the UX spec changelog |

---

## 8. Test data policy

- All inputs are **synthetic**; no real health or birth data. Birth fixtures are public historical dates or invented.
- Fixtures regenerated by script are committed with their generator and seed.
- The dev inspector's *Export case* strips free text and birth data unless explicitly kept.
- Screenshots and videos use synthetic profiles only.

---

## 9. Exit criteria per milestone

| Milestone | Exit criteria |
|---|---|
| **M1 KB complete** | All tasks in the KB workstream done; schema validation, determinism and wording lint green; question bank covers all 12 dimensions and 8 modules |
| **M2 MVP app** | Unit + property + parity green; safety vignettes 100 %; E1–E20 green; axe clean; budgets met; dev and release builds produced; `check-release.ts` green |
| **M3 Review and hardening** | Review records for the gates in [content review §7](content-review.md); golden set ≥ 100 with concordance targets met; manual accessibility passes; usability R2 issues closed |
| **M4 Beta** | Beta exception recorded (if draft content remains); usability R3; privacy verification (§7 of the privacy doc); legal review of wording; release checklist complete |

---

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-04 | Initial test plan |
