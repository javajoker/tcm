# TCM App — Traditional Chinese Medicine Self-Assessment

A trilingual (Traditional Chinese default / Simplified Chinese / English), responsive web app that guides a user through a structured TCM assessment
(四診 → 辨證 → 論治), shows a **five-phase body panel** (五行臟腑・六邪・八綱・營衛) relative to a healthy norm, explains **why** it reached each
conclusion with citations to classical texts (《黃帝內經》《傷寒論》《金匱要略》 …), and suggests classical formulas — with their
君臣佐使 structure — and lifestyle guidance as **educational reference**, not a medical diagnosis.

> Status: **pre-release.** The MVP is technically complete, and the post-MVP Releases A–F are built wherever they can be built without people
> (Simplified Chinese, offline use and installation, backup, the local data lock and file sync, the Learn section with the herb browser and the learning book,
> the practitioner file, follow-up and trends, region packs, the five-phase extensions, the knowledge base v2 and the prescription model, learners and
> practitioners with the study reference; AI help — conversation and tongue/face photos — in development builds only). **All medical content is still
> `draft` and unreviewed, and nothing has been published.** What is done, how it was verified and what still needs people: [`docs/project-report.md`](docs/project-report.md).

## What is here

| Path | What | Status |
|---|---|---|
| [`docs/project-report.md`](docs/project-report.md) | The state of the project: what is built, the evidence, what still needs people | 2026-10-08 |
| [`docs/README.md`](docs/README.md) | The documentation index (every document with its version) | — |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements | v0.11 draft |
| [`docs/diagnosis-sop.zh-TW.md`](docs/diagnosis-sop.zh-TW.md) | 辨證論治作業流程 — the diagnosis logic (繁體中文) | v0.6 draft |
| [`docs/wuxing-algorithm.md`](docs/wuxing-algorithm.md) · [`.zh-TW`](docs/wuxing-algorithm.zh-TW.md) | Yin-yang / five-phase algorithm specification (English; 繁體中文版) | v0.5, implemented |
| [`docs/tech-spec.md`](docs/tech-spec.md) · [`docs/ux-spec.md`](docs/ux-spec.md) | Technical specification · UI/UX specification | v0.18 · v0.14 drafts |
| [`docs/kb-schema.md`](docs/kb-schema.md) · [`docs/i18n-guide.md`](docs/i18n-guide.md) | Data contracts · terminology, copy and translation rules | v0.10 · v0.3 drafts |
| [`docs/content-review.md`](docs/content-review.md) · [`docs/safety-policy.md`](docs/safety-policy.md) · [`docs/privacy.md`](docs/privacy.md) | Review process and release gates · notice wording and safety filter · data handling | v0.11 · v0.6 · v0.12 drafts |
| [`docs/test-plan.md`](docs/test-plan.md) · [`docs/release-process.md`](docs/release-process.md) | Quality strategy · versions, gates, deployment | v0.16 · v0.7 drafts |
| [`docs/post-mvp/`](docs/post-mvp/README.md) | After the MVP: roadmap (Releases A–F), requirements, decision register, design documents, spike protocols, the AI help impact assessment | v0.5 draft |
| [`docs/book/zh-Hant/`](docs/book/zh-Hant/README.md) | 《以模型讀中醫》 — the learning book and the course's companion: TCM from twelve perspectives, in the app (繁體中文) | draft, quotations verified |
| [`docs/course/zh-Hant/`](docs/course/zh-Hant/README.md) | 中醫學系統課程 — a self-contained course with its textbook: 22 chapters, 264 hours, an answer key and its sources; no original needs to be read; in the app (繁體中文) | draft, quotations verified |
| [`TASKS.md`](TASKS.md) · [`CHECKLIST.md`](CHECKLIST.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md) | Task list (one commit per task) · definition of done and release checklists · how to contribute | 175 of 194 tasks done |
| [`data/`](data/README.md) | Knowledge base: 183 verified quotations, 703 herbs, 33 formulas, 23 patterns, 184 symptoms, 36 questions, tongue/pulse, 營衛, scope profiles, safety rules, 484 cities | first pass, review pending |
| [`scripts/kb`](scripts/kb) · [`scripts/i18n`](scripts/i18n) | Deterministic KB build, validation, pattern self-test, reference diagnosis pipeline · the Simplified-Chinese derivation | done |
| [`reference/`](reference/README.md) | Source texts and datasets as git submodules | — |
| [`packages/wuxing`](packages/wuxing) | Zero-dependency TypeScript engine: birth chart, element weights, propagation, 大運/流年, 五運六氣, reference panel (103 tests) | done |
| [`packages/{kb,engine,i18n}`](packages) | Knowledge-base loader and indexer, diagnosis engine and prescription model (property, vignette, golden and parity tests), message formatter | done |
| [`packages/ai`](packages/ai) · [`apps/ai-gateway`](apps/ai-gateway/README.md) | AI help: the protocol and validators · the gateway between the app and a model provider (mock provider; Anthropic adapter; nothing deployed) | development only |
| [`apps/web`](apps/web) | The web app: React 19 + Vite, `zh-Hant` / `zh-Hans` / `en`, two build profiles, client-only, offline-capable | done; see [`TASKS.md`](TASKS.md) |
| [`SECURITY.md`](SECURITY.md) · [`CHANGELOG.md`](CHANGELOG.md) | How to report a vulnerability · what changed | — |

## Quick start

```bash
git clone --recurse-submodules <repo-url>          # or: git submodule update --init --depth 1

# knowledge base (needs Python 3 and Node >= 22.18)
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m scripts.kb.build_kb            # build data/ + validate + self-test (deterministic)
.venv/bin/python -m scripts.kb.example_pipeline    # worked example used in the SOP

# workspace: tests, type checks and lint for every package and the web app
pnpm install && pnpm check
pnpm dev                                           # the web app (dev profile) on http://localhost:5173
pnpm --filter @tcm/ai-gateway dev                  # AI help's gateway with the mock provider (development builds)
pnpm test:safety                                   # the safety vignette suite (blocks a release)
```

The end-to-end scenarios run from `apps/web`: `pnpm build:e2e`, then `npx playwright test` ([test plan](docs/test-plan.md)).

## Configuration in one paragraph

[`data/config/scope-profiles.json`](data/config/scope-profiles.json) defines output levels **L0–L3** and two profiles: **`dev`** opens everything for every
population, condition and state; **`release`** restricts by default. In both, risky populations and conditions (minors, pregnancy, breastfeeding, red
flags, serious chronic disease) first get a **"see a doctor" notice that the user acknowledges, and then the flow continues**; only the output level differs.
A release build also says who reads with the study reference (`dose_display`: all · roles · off, narrowed at build time by `APP_DOSE_DISPLAY`) and keeps
AI help off (`ai`); a build may restrict a profile, never widen it.

## Conventions

- All docs are English except the diagnosis SOP, the Traditional Chinese version of the algorithm spec, the learning book and the course (all Traditional Chinese).
- One commit per finished task ([`TASKS.md`](TASKS.md); `python3 scripts/tasks_summary.py --write` refreshes its summary).
- Docs links and anchors are checked with `python3 scripts/check_doc_links.py`.
- Medical content is `draft` until reviewed by a qualified practitioner; see [`data/README.md`](data/README.md#review-status).
