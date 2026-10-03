# TCM App — Traditional Chinese Medicine Self-Assessment

A bilingual (Traditional Chinese default / English), responsive web app that guides a user through a structured TCM assessment
(四診 → 辨證 → 論治), shows a **five-phase body panel** (五行臟腑・六邪・八綱) relative to a healthy norm, explains **why** it reached each
conclusion with citations to classical texts (《黃帝內經》《傷寒論》《金匱要略》 …), and suggests classical formulas — with their
君臣佐使 structure — and lifestyle guidance as **educational reference**, not a medical diagnosis.

> Status: **documentation set (M0), first-pass knowledge base and the five-phase engine are done; the web app is not started.** Start with the [documentation index](docs/README.md); the work plan is [`TASKS.md`](TASKS.md).

## What is here

| Path | What | Status |
|---|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements | v0.4 draft |
| [`docs/diagnosis-sop.zh-TW.md`](docs/diagnosis-sop.zh-TW.md) | 辨證論治作業流程 — the diagnosis logic (繁體中文) | v0.2 draft |
| [`docs/wuxing-algorithm.md`](docs/wuxing-algorithm.md) · [`.zh-TW`](docs/wuxing-algorithm.zh-TW.md) | Yin-yang / five-phase algorithm specification (English; 繁體中文版) | v0.1, implemented |
| [`docs/tech-spec.md`](docs/tech-spec.md) · [`docs/ux-spec.md`](docs/ux-spec.md) | Technical specification · UI/UX specification | v0.1 drafts |
| [`docs/kb-schema.md`](docs/kb-schema.md) · [`docs/i18n-guide.md`](docs/i18n-guide.md) | Data contracts · terminology, copy and translation rules | v0.1 drafts |
| [`docs/content-review.md`](docs/content-review.md) · [`docs/safety-policy.md`](docs/safety-policy.md) · [`docs/privacy.md`](docs/privacy.md) | Review process and release gates · notice wording and safety filter · data handling | v0.1 drafts |
| [`docs/test-plan.md`](docs/test-plan.md) · [`docs/release-process.md`](docs/release-process.md) | Quality strategy · versions, gates, deployment | v0.1 drafts |
| [`TASKS.md`](TASKS.md) · [`CHECKLIST.md`](CHECKLIST.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md) | Task list (one commit per task) · definition of done and release checklists · how to contribute | v0.1 |
| [`packages/wuxing`](packages/wuxing) | Zero-dependency TypeScript engine: birth chart, element weights, propagation, 大運/流年, 五運六氣, reference panel (74 tests) | done |
| [`data/`](data/README.md) | Knowledge base: 127 verified quotations, 704 herbs, 33 formulas, 23 patterns, tongue/pulse, scope profiles, safety rules | first pass, review pending |
| [`scripts/kb`](scripts/kb) | Deterministic KB build, validation, pattern self-test, reference diagnosis pipeline | done |
| [`reference/`](reference/README.md) | Source texts and datasets as git submodules | — |
| `packages/{kb,engine,i18n}`, `apps/web` | Knowledge-base loader, diagnosis engine, i18n, the web app | planned ([tech spec §2.1](docs/tech-spec.md)) |

## Quick start

```bash
git clone --recurse-submodules <repo-url>          # or: git submodule update --init --depth 1

# knowledge base (needs Python 3 and Node >= 22.18)
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m scripts.kb.build_kb            # build data/ + validate + self-test (deterministic)
.venv/bin/python -m scripts.kb.example_pipeline    # worked example used in the SOP

# workspace: five-phase engine tests, type checks and lint
pnpm install && pnpm check
```

## Configuration in one paragraph

[`data/config/scope-profiles.json`](data/config/scope-profiles.json) defines output levels **L0–L3** and two profiles: **`dev`** opens everything for every
population, condition and state; **`release`** restricts by default. In both, risky populations and conditions (minors, pregnancy, breastfeeding, red
flags, serious chronic disease) first get a **"see a doctor" notice that the user acknowledges, and then the flow continues**; only the output level differs.

## Conventions

- All docs are English except the diagnosis SOP and the Traditional Chinese version of the algorithm spec (both Traditional Chinese).
- One commit per finished task ([`TASKS.md`](TASKS.md); `python3 scripts/tasks_summary.py --write` refreshes its summary).
- Docs links and anchors are checked with `python3 scripts/check_doc_links.py`.
- Medical content is `draft` until reviewed by a qualified practitioner; see [`data/README.md`](data/README.md#review-status).
