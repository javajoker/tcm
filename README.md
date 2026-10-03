# TCM App — Traditional Chinese Medicine Self-Assessment

A bilingual (Traditional Chinese default / English), responsive web app that guides a user
through a structured TCM assessment (四診 → 辨證 → 論治), explains **why** it reached
each conclusion with citations to classical texts (《黃帝內經》《傷寒論》《金匱要略》 …), and
suggests classical formulas and lifestyle guidance as **educational reference** — not a
medical diagnosis.

> Status: **documentation phase.** PRD and diagnosis SOP are drafts under review; the web app
> is not started.

## Documents

| Doc | Language | Status |
|---|---|---|
| [docs/PRD.md](docs/PRD.md) — Product requirements | English | Draft v0.1 |
| [docs/diagnosis-sop.zh-TW.md](docs/diagnosis-sop.zh-TW.md) — 辨證論治作業流程 (diagnosis SOP) | 繁體中文 | Draft v0.1 |
| Tech spec, UI/UX spec, other docs, task list, checklist | English | Not started |

## Reference material

Source texts and datasets live in [`reference/`](reference/README.md) as git submodules.

```bash
git clone --recurse-submodules <repo-url>
# or, in an existing clone:
git submodule update --init --depth 1
```

## Conventions

- All docs are English except the diagnosis SOP (Traditional Chinese).
- One commit per finished task; see the task list once it exists.
