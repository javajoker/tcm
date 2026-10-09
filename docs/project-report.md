# Project Report

| | |
|---|---|
| **Date** | 2026-10-08 |
| **Scope** | The whole repository after the last feature commit `1957e71` (PM-50), with the fixes of this audit (§8) |
| **Method** | Every task row of [`TASKS.md`](../TASKS.md) checked against what it cites (files, commits, tests); every gate of the CI and nightly workflows run locally; the full end-to-end matrix run in a real browser; the documents cross-checked for stale figures |
| **Audience** | The owner, the reviewers (clinical, pharmacy, linguistic, privacy, legal), contributors |
| **Related** | [`TASKS.md`](../TASKS.md) · [`CHECKLIST.md`](../CHECKLIST.md) · [Release dry run of 2026-10-04](release-dry-run.md) (its figures are superseded here) · [Post-MVP roadmap](post-mvp/roadmap.md) · [`CHANGELOG.md`](../CHANGELOG.md) |

> **In one paragraph.** The app — an educational TCM self-assessment that explains every conclusion with verified classical quotations — is **technically complete
> for everything that can be built without people**: the MVP and the post-MVP Releases A–F, **169 of 188 tasks**. The 19 open tasks all need someone outside the
> repository — reviewers, a legal or privacy sign-off, datasets and approvals for the two research spikes, usability participants — and none of them can be closed by
> engineering. On 2026-10-08 every CI gate passed locally (after one fix, §8), as did **2,205 unit and component tests, 333 Python tests, the 220-case safety suite,
> 125 script tests, the full end-to-end matrix (471 of 475 runs passed, 4 skipped by design, none failed), the property suite ×10 and the cross-browser set**.
> **The product cannot be released to the public yet:** no medical content has been reviewed (0 review records), the golden-case concordance is below its targets, no
> emergency number is verified, and the legal and privacy sign-offs do not exist. A **closed beta** (draft label on) is technically ready once the owner has set up the
> hosting. The main engineering constraint is size: **all JavaScript is at 369.2 of 370 KB** (345.0 after the size pass of 2026-10-09, PM-58) and the knowledge base's `core` chunk at 57.5 of 60 KB.

---

## 1. The product in one page

A trilingual web app (Traditional Chinese by default, Simplified Chinese, English) that walks a person through a structured TCM assessment — profile, red-flag
screening, adaptive inquiry, optional tongue, pulse and constitution — and returns a pattern differentiation, a five-phase body panel (organs, six evils, 八綱, 營衛)
against a healthy norm, the reasoning with citations, and classical formulas with their 君臣佐使 and lifestyle guidance, **as educational reference, not a diagnosis**.

| Principle | How it is kept |
|---|---|
| **Local-first** | Everything a person enters stays in their browser (IndexedDB, `localStorage`); no accounts, no analytics, no third-party scripts; CSP `connect-src 'self'`. The one exception — AI help — exists in development builds only (§6) |
| **Deterministic and traceable** | A pure TypeScript engine; the same input gives the same output; every conclusion has a trace and a verified citation; parity with a Python oracle |
| **Safety first** | The red-flag screening comes first and is deterministic; risky populations and conditions get a "see a doctor" notice that is acknowledged, and the flow continues at a lower output level; the release profile reaches L1 for a general reader |
| **Data, not prose** | The knowledge base is built from real sources by a deterministic pipeline; every record keeps its provenance and a review status; numbers in `data/` beat numbers in prose |
| **Gates before release** | Each feature belongs to a review class; a public build ships only what has passed its class's review, enforced by `check-release` (rules 0–18) |

**Architecture.** A pnpm monorepo: `packages/wuxing` (five-phase engine), `packages/kb` (knowledge-base loader, indexer, bundler), `packages/engine` (diagnosis engine and
prescription model), `packages/i18n`, `packages/ai` (AI help's protocol and validators); `apps/web` (React 19 + Vite, two build profiles, offline-capable, client-only) and
`apps/ai-gateway` (Node or a Worker; development only); `scripts/` (the Python knowledge-base build and every Node checker); `data/`; `docs/`.

| Code base (lines, tracked files) | Source | Tests |
|---|---:|---:|
| Web app (`apps/web`) | 15,500 | 19,400 |
| Engine, five-phase, knowledge base, i18n, AI packages | 14,500 | 6,600 |
| AI gateway | 850 | 1,000 |
| Node scripts (checkers, bundler, build tools) | 2,400 | 1,700 |
| Python (knowledge-base build, Simplified derivation) | 10,500 | 2,900 |
| Knowledge base (`data/`, JSON) | 133,600 | — |
| Documentation (72 Markdown files) | 12,400 | — |

187 commits from 2026-10-03 to 2026-10-08, one per task.

## 2. What is built

### 2.1 The MVP (milestones M0–M2)

| Workstream | Done | What |
|---|---:|---|
| **A** Documentation | 28 / 28 | PRD, the diagnosis SOP (繁體中文), the five-phase algorithm (English and 繁體中文), tech and UX specs, KB schema, i18n guide, content review, safety policy, privacy, test plan, release process; the post-MVP set |
| **DEC** Decisions | 6 / 6 | Every open MVP decision answered with a default (hosting, name, city data, UX items) |
| **K** Knowledge base | 19 / 20 | The deterministic build, validation, self-test, question bank, exclusions, constitutions, emergency rows, cities, treatment guidance, glossary, English drafts, parity fixtures. Open: K-19 (library expansion — PM-22, PM-23) |
| **E** Engine and packages | 21 / 21 | `@tcm/wuxing`, `@tcm/kb`, `@tcm/engine` (policy, normalisation, patterns, panel, formulas, safety filter, recommendations, questionnaire, constitution, explanation), the benchmark |
| **I** Internationalisation | 5 / 6 | Catalogues, formatter, checks, glossary conformance, the English draft. Open: I-06 (the linguistic review) |
| **U** Web application | 26 / 26 | Every screen S01–S20, history and comparison, print, practitioner summary, birth-place picker, figures, the dev inspector |
| **Q** Quality assurance | 8 / 10 | Safety vignettes, golden cases, properties, E2E E1–E20, axe, performance budgets, visual regression, privacy tests. Open: Q-09 (usability rounds), Q-10 (practitioners' blinded evaluation) |
| **R** Release and operations | 6 / 7 | CI, nightly, visual, deploy and rollback workflows; `check-release`; host files and smoke test; licences and SBOM. Open: R-07 (the signed release checklist) |
| **V** Review | 0 / 7 | All human: §7 |
| **PF** Performance | 1 / 3 | PF-02 done; PF-01 and PF-03 not needed (§7) |

### 2.2 The post-MVP releases (section PM: 49 of 54)

| Release | Tasks | What is built | Where it is available | Open |
|---|---|---|---|---|
| **A** Reach and resilience | 13 / 13 | Simplified Chinese derived from the Traditional source (UI, knowledge base, checks); offline use (service worker, update flow, boot guard) and installation; backup (format, screen, encrypted envelope, storage health); tap-tempo pulse; region packs for the emergency numbers; allergy names in either script | Release build | Mainland linguistic review of `zh-Hans`; real-device install and backup passes; the region rows' verification |
| **B** Learn and follow up | 8 / 8 | The Learn section (patterns, constitutions, formulas, acupoints, foods, quotations, glossary), pattern comparison, the practitioner file (published schema), follow-up with a calendar file, trends, the local data lock | Release build | Linguistic review of the trend wording; the lock's security review |
| **C** Breadth | 7 / 9 | Admission tooling for new patterns; the herb browser (703 herbs, on demand) and herb pages; southern-hemisphere seasons; the hour near a boundary; VSOP87 tables regenerated from the pinned archive; the declared 長夏 model | Release build (herbs listed only once sampled and reviewed — none yet) | PM-22, PM-23: content waves wait for named reviewers |
| **D** Research | 1 / 3 | File-based sync of the encrypted backup (Chromium) | Release build, behind the draft label | PM-30, PM-31: spikes stopped at step 1 / not run (datasets, legal view, ethics, devices) |
| **E** Knowledge and prescription | 14 / 14 | Sources registry (91 works); herb property model v2; dose–response, 七情 pairings, processing; formula effect, measured roles and 方解; library verification; personalisation by 三因制宜; the prescription card and practitioner file v2; the learning book 《以模型讀中醫》 in Learn; 營衛 in the model; learners and practitioners; the study reference (quantities, classical 加減, medication plan) shown by default with its note, configurable (PD-30) | General reader: release build at L1. Study reference: closed beta; a public build only once its content is reviewed | Clinical and pharmacy reviews; the legal view on amounts per market |
| **F** AI-assisted intake | 6 / 7 | The gateway (mock provider, signed session tokens, budgets, kill switch, validated replies, no content logged); consent per module and Settings; the conversation with the device's red-flag check; the evaluation harness; the Anthropic adapter and deployment notes; the photo of the tongue and the face | **Development builds only**; a release build holds none of it (`check-release` rule 17) | PM-44: privacy and legal sign-offs, the provider agreement; the owner's key and deployment; the real evaluation run; the tongue-photo spike's gates |

*After this audit, the same day:* PM-55 added the TCM course and its textbook ([`docs/course/zh-Hant/`](course/zh-Hant/README.md), Traditional Chinese, 22 chapters, 264 hours, an answer key and its sources) and nine works to the sources registry (100); it does not touch the app or its budgets. The task list then stood at **170 of 189**; the course waits for the linguistic and TCM clinical reviews like the learning book. On 2026-10-09 PM-56 made the two one set: the book was rewritten as the course's companion, TCM read from twelve perspectives, and the course's chapters point to it for the model (**171 of 190**). PM-57 completed the review packs — every data file, the interface text, and the book and the course as worksheets — and lets a review record name the book, the course and the interface text; PM-58 freed 24.2 KB of JavaScript without raising a limit (§4). PM-59 reported the golden-case misses for the reviewers ([`golden-misses.md`](golden-misses.md)): the one tuning miss is an inquiry-only seed of a pattern whose evidence lies largely in the tongue and the pulse; the held-out half is given in numbers only; nothing was tuned. PM-60 put the course in Learn beside the book: page by page, on demand and outside the offline copy, under a review gate of its own (`check-release` rule 19).

## 3. How it was verified (2026-10-08)

On a macOS laptop with Node 25, Python 3.12, the installed Google Chrome and Playwright's WebKit and Firefox.

### 3.1 The CI gates (`.github/workflows/ci.yml`), run in order

| Gate | Result | Figures |
|---|---|---|
| Lint · type check (every package and the scripts) | ✔ | — |
| Generated KB types · notices synced from the safety policy · i18n · icons · hygiene | ✔ | 41 type files current; 1,867 messages, 0 errors, 5 length warnings |
| Unit and component tests (`pnpm test`) | ✔ | 2,205: web 1,438 (75 files), engine 450, five-phase 103, KB 101, AI 42, gateway 55 (1 skipped: no real-provider recording exists), i18n 16 |
| Safety vignette suite | ✔ | 220 cases, both profiles |
| Engine benchmark | ✔ after the fix of §8 | `assess` p50 2.4 ms, p95 5.9 ms (budget 50 ms); `nextQuestions` p95 0.11 ms |
| ESLint rule tests | ✔ | 7 |
| Licences · licence report · SBOM | ✔ | 9 shipped and 362 build-time packages within the allow-list; CycloneDX SBOM written |
| Knowledge base: the build is deterministic, parity fixtures current, Simplified current, Python tests | ✔ | `data/` and the parity fixtures byte-identical after a rebuild; 19 Simplified files current; 333 Python tests (310 KB, 23 i18n) |
| Release build (closed-beta label) · `check-release` · budgets · smoke behind a Pages emulator | ✔ | Rules 0–18 pass with the closed-beta exception; budgets in §4 |
| Script tests (`pnpm test:scripts`) | ✔ | 125 (1 skipped) — every checker rejects its seeded violations |
| Development build | ✔ | — |

### 3.2 End to end, and the nightly checks

| Run | Result |
|---|---|
| The full matrix (`release-*` desktop and phone in three languages, `dev-*`, `roles-*`, `offline-*`; Chrome) | **471 passed, 4 skipped, 0 failed** of 475 runs (11.6 min). The 4 skips are by design: a Simplified page shows none of the Traditional-only book (E37) |
| Cross-browser (Safari's engine on desktop and an iPhone, Firefox; offline in both) | **22 of 22 passed** |
| Properties ×10 with a fresh seed (1791449238) | **450 of 450 engine tests passed** |
| Golden cases (a report, blocking only after M3) | 30 synthetic cases, 0 agreed by a practitioner: held-out pattern top-3 **77 %** (target 80 %), formula top-3 **50 %** (target 70 %); tuning pattern-first 93 %. One tuning case, G-0003 (EX3), now gives no pattern — a finding for the review track (V-05), not tuned here by project rule |

### 3.3 Not run here, and why

| Check | Why not | Who / where |
|---|---|---|
| The CI workflows themselves | The repository is pushed to `origin` up to PM-49, but the GitHub account logged in on this machine cannot read the repository, so the runs could not be checked. If CI ran on a push after 2026-10-04, its *fast* job failed at the benchmark guard fixed in §8 | The owner: check the Actions tab after the next push |
| Lighthouse CI | Needs its runner (`@lhci/cli`), not installed here; installing it is a download | CI's `lighthouse` job |
| `pnpm audit` | Sends the dependency list to the npm registry | CI's `deps` job |
| Visual-regression baselines | Platform-specific; made by the *Visual baselines* workflow on Linux and committed by a person — none is committed yet | CI + the owner |
| Manual assistive-technology pass; real phones (install, backup, print); staging smoke; rollback rehearsal | Need people, devices and a deployment | The owner and testers ([accessibility protocol](accessibility-protocol.md), [release process](release-process.md)) |

## 4. Budgets

| Budget | Now | Limit | Use |
|---|---:|---:|---:|
| Initial JavaScript (gzip) | 166.0 KB | 200 KB | 83 % |
| **All JavaScript (gzip)** | **369.2 KB** | **370 KB** | **99.8 %** |
| CSS | 7.8 KB | 20 KB | 39 % |
| Knowledge base per general session | 91.4 KB | 100 KB | 91 % |
| … with the study reference | 142.5 KB | 150 KB | 95 % |
| **`core` chunk** | **57.5 KB** | **60 KB** | **96 %** |
| Study reference (on demand) | 51.1 KB | 60 KB | 85 % |
| Simplified display list | 24.4 KB | 30 KB | 81 % |
| Herb browser (on demand) | 118.6 KB | 140 KB | 85 % |
| Learning book (on demand) | 13.8 KB | 20 KB | 69 % |
| Service worker · boot guard | 2.9 KB · 0.5 KB | 10 KB | — |

*After PM-58 (2026-10-09):* initial JavaScript **155.5 KB** (78 %), all JavaScript **345.0 KB** (93 %) — the catalogs' keys are written once instead of in every language, and the knowledge base's loader no longer brings the build-time code of `@tcm/kb` with it.

On 2026-10-08 all were within budget, two of them nearly full: **the next feature of a release build needed room made or a declared raise (PD-12)** — PM-58 made 24.2 KB of room —, and **the next content wave
needs the per-module chunking of the question bank** ([library expansion](post-mvp/design/library-expansion.md)) before it lands.

## 5. Knowledge base and content

| Area | State |
|---|---|
| Quotations | **183 of 183 verified** against the source text; a registry of 91 source works, 45 drawn on |
| Herbs | 703 (94 curated drafts, 609 derived by named rules); 249 七情 pairings, 14 processing methods, 5 dose bands |
| Formulas | 33 — tiers A 20, B 7, C 6; each with a verification record (9 against a classical text, 18 against a source book, 5 against a second source, 1 partly). The library's own verification ([report](formula-verification.md)): **6 of 33 pass every check**; the findings (role 23, balance 10, indication 8, effect 4, direction 2, opposed 2) are for the reviewers and are never fixed by hand (PD-18) |
| Diagnosis | 23 patterns (each ranks first for its typical patient; the smallest margin is KD1 over HT2, **15.8 points** — under the 20-point line, so the review pack lists the pair — then HT2 over KD1 20.0 and QB1 over HT1 27.2), 27 pattern elements, 184 symptoms (124 inquiry, 32 tongue, 28 pulse), 36 questions (23 core, 8 modules, every symptom reachable), 9 constitutions (37 items), 28 red flags, 營衛 readings with applicability weights |
| Policy | 2 profiles and the learner/practitioner overlay; 26 safety rules; 168 glossary terms |
| Emergency numbers | 12 regions, **0 verified** — a region is shown only once a regional verifier confirms it; until then the generic text |
| Learning book | 12 chapters in Traditional Chinese, every quotation verified, no doses |
| **Review** | **0 review records — every medical record is `draft` or `derived`**; English prose for part of the content is a machine draft; Simplified Chinese is derived and awaits a Mainland-usage reviewer |

## 6. Safety, privacy and compliance posture

- **Release profile:** a general reader reaches L1 at most (no amounts, no herb records, tier-A formulas only), enforced by `check-release` rules 2 and 18. The study
  reference (L3) is a separate file, shown by default in the closed beta with the note N-AMOUNTS, and served by a public build only once its content is reviewed.
- **Safety layer:** 28 red flags asked first; blocking notices for red flags, minors, pregnancy, breastfeeding and serious disease, acknowledged, with the flow
  continuing at a lower level; emergency numbers by region (none verified yet); the 220-case safety vignette suite blocks a release.
- **Privacy:** nothing leaves the device in a release build; no analytics; erase-everything; backups encrypted on request; the optional passphrase lock; birth data not
  kept unless chosen. Privacy tests and E19/E20 run in CI.
- **AI help (Release F):** development builds only. The conversation and the photo of the tongue and the face go to the project's gateway and a model provider only
  for an adult who agreed per module, nothing identifying is sent, nothing is stored, the device checks for red flags before anything is sent, and the model only
  proposes findings the person confirms. The [impact assessment](post-mvp/privacy/ai-help-dpia.md) is a **draft, unsigned**; the provider agreement, the key and the
  deployment are the owner's.
- **Regulatory:** the product is positioned as education, not diagnosis; the legal view on that positioning, on reference amounts per market and on image analysis has
  not been given (V-07, PM-44, PM-30).

## 7. The open tasks (19 of 188)

| Task | What it needs |
|---|---|
| V-01 | Reviewers appointed per role, with scope and cadence |
| V-02 · V-03 · V-04 | Physician and pharmacy review of red flags, profiles, safety rules and notices; TCM clinical review of symptoms, questions, patterns, panel and parameters; review of formulas, curated herbs, guidance and a sample of derived herbs |
| V-05 · Q-10 | Calibration sessions (≥ 100 golden cases agreed by practitioners) and the practitioners' blinded evaluation |
| V-06 · I-06 | Linguistic review of the glossary, UI strings, notices and quotation translations |
| V-07 | Legal and regulatory review of disclaimers, claims, the privacy statement and marketing copy |
| Q-09 | Usability rounds R1–R3 with participants |
| R-07 | The signed release-candidate checklist (the dry run is done; this report refreshes its evidence) |
| K-19 · PM-22 · PM-23 | Library expansion in waves — the admission tooling is built (PM-21); the waves wait for named clinical and pharmacy reviewers |
| PM-30 · PM-31 | The tongue-photo and camera-pulse spikes: a legal view, datasets with licence and consent, a clinical advisor, reference devices, volunteers, ethics approval, download approvals |
| PM-44 | The privacy and legal reviewers' sign-off of AI help and the data-processing agreement with the provider |
| PF-01 · PF-03 | Not needed today: a split of the engine chunk would not lower the tight total, and `assess` (p95 5.9 ms) is far below the budget that would move it to a worker |

The review track is left exactly as it is: nothing in it was ticked, edited or tuned.

## 8. What this audit found and fixed

| Finding | Fix |
|---|---|
| **A CI gate failed:** the engine benchmark flagged `nextQuestions` as 25–32 % slower than its baseline. The baseline was recorded on 2026-10-04 with 28 questions; the bank has 36 since K-07 (+29 %), and one call (≈ 0.1 ms) is within the timer's noise, so the guard alternated between pass and fail | `nextQuestions` is timed in batches of ten calls and reported per call; the baseline re-recorded for the current bank; the guard now passes run after run ([test plan §5.5](test-plan.md)) |
| `pnpm build:dev` wrote into `apps/web/dist`, replacing a release build that the end-to-end tests serve (the audit's first matrix run tested a dev build in the release projects and was discarded) | `build:dev` writes `apps/web/dist-dev`; CI is unaffected |
| Stale figures in current-state documents: the README (document versions, Releases A–D only, no AI packages or book), the PRD (127 quotations, 24 elements, 161 terms; the post-MVP releases "planned"), the SOP's validation appendix (127/127; the closest pairs "to be added"), the tech spec's chunk sizes (MVP-era), the roadmap ("nothing in it is built yet") and the post-MVP index | Re-measured and rewritten; versions bumped with changelog rows |
| 16 documents' *Last updated* older than their own changelogs; the documentation index one version behind for the post-MVP set | Aligned |
| Stale notes in `TASKS.md` and `CHECKLIST.md` (budgets of PF-01 and Release E, the privacy versions of PM-44 and Release F, K-19 without its post-MVP plan) | Updated; the review-track rows untouched |
| The changelog's *Known limitations* said the release profile reaches L1 at most — no longer true for the study reference | Reworded; the photo's wording now matches the file chooser it uses |

Everything else checked out: all 188 task rows cite files and commits that exist; the status summary matches the rows; the knowledge base rebuilds byte for byte.

## 9. Risks

| Risk | Likelihood · impact | Mitigation · next step |
|---|---|---|
| Unreviewed medical content reaches people | Low (gated) · very high | `check-release` refuses unreviewed content in a public build; only a closed beta with the draft label is possible — keep it that way until V-02…V-04 |
| The size budgets block the next feature | High · medium | Make room (a lighter dependency, code that only the dev build needs moved behind its flag) or declare a raise (PD-12) before the next release feature; chunk the question bank by module before any content wave |
| Concordance stays below target | Medium · high | Needs practitioners (V-05, Q-10), not tuning; G-0003 is reported to the review track |
| The first real CI run fails on something a laptop does not show (Linux fonts, timing) | Medium · low | Push, read the Actions results, fix; generate the visual baselines on CI |
| AI help: regulatory and privacy exposure (health data, face images) | Medium · high | Development only; draft DPIA; zero retention for images in the agreement before any real person's photo; legal view per market |
| Emergency numbers wrong in a region | Low (none shown unverified) · very high | Regional verifiers before a region is listed |
| Machine-drafted English and derived Simplified mislead | Medium · medium | Marked as drafts; linguistic reviews (V-06, I-06) |

## 10. Next steps

**For the owner, in order:**

1. Push `main` and check the CI, nightly and visual workflows on GitHub; commit the visual baselines the *Visual baselines* workflow produces.
2. Appoint the reviewers (V-01) — a physician, a pharmacist, a TCM clinician, a bilingual linguist, a privacy and a legal reviewer — and start round 1 (V-02).
3. Set up the Cloudflare Pages projects, secrets and environments ([release process §6](release-process.md)), record the closed-beta exception, and run the staging
   smoke test and the rollback rehearsal.
4. Name regional verifiers for the emergency numbers of the first region.
5. For AI help: the privacy and legal review of the impact assessment, the data-processing agreement (zero retention, images included), the key, the gateway's
   deployment ([`DEPLOY.md`](../apps/ai-gateway/DEPLOY.md)), then the real evaluation run.

**For engineering, while the reviews run:**

1. Make room in the JavaScript budget before the next release-build feature, and plan the per-module chunking of the question bank before PM-22.
2. Act on the review findings as they arrive, each through the review records — never by tuning the golden set.
3. Keep this report current at each release candidate (it is the evidence behind R-07).
