# Contributing

Thank you for helping. This project is an **educational** TCM self-assessment app. It contains medical-adjacent content, so a few rules are stricter than in a typical
web project. Read [`docs/README.md`](docs/README.md) for the document map and [`TASKS.md`](TASKS.md) for what to work on.

## 1. Set up

Requirements: Git, **Node ≥ 22.18**, **pnpm**, **Python ≥ 3.11** (knowledge-base build only).

```bash
git clone --recurse-submodules <repo-url>        # or: git submodule update --init --depth 1

# knowledge base
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m scripts.kb.build_kb          # build data/ + validate + pattern self-test (deterministic)

# workspace (packages/*, apps/*)
pnpm install
pnpm check            # lint + typecheck + tests for every package
```

Root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check`, `pnpm build:kb`, `pnpm dev` (web app, dev profile), `pnpm build` (release profile), `pnpm build:dev`. Per package: `pnpm --filter @tcm/wuxing test`. `pnpm check:i18n` arrives with task I-03.

## 2. Layout

| Path | What |
|---|---|
| `docs/` | PRD, diagnosis SOP (繁體中文), algorithm spec, tech spec, UX spec, KB schema, i18n guide, content review, safety policy, privacy, test plan, release process |
| `data/` | **Generated** knowledge base (JSON). Never edit by hand |
| `scripts/kb/` | The Python pipeline that generates `data/` from `reference/` plus `curated/` tables; also the reference diagnosis pipeline (the engine's oracle) |
| `packages/wuxing/` | Yin-yang / five-phase engine (zero dependencies) |
| `packages/{kb,engine,i18n}/`, `apps/web/` | Planned — see the tech spec |
| `reference/` | Source texts as git submodules (read-only) |

## 3. Workflow

1. Pick a task from [`TASKS.md`](TASKS.md) (or open an issue first for anything not listed).
2. Work on a short-lived branch from `main`.
3. Implement **with tests** and update the docs the change affects.
4. Run the checks relevant to your change (§6).
5. **One commit per finished task**, message `type(scope): summary` with the task id in the body (types: `feat fix docs kb data test refactor perf build ci chore`). Regenerated `data/` goes in the **same** commit as the generator change.
6. Open a PR using the template; complete the checklist.

## 4. Conventions

**Code**
- TypeScript, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` (runnable by Node type stripping: no enums, no namespaces, no parameter properties; imports end in `.ts`).
- Packages are **pure and deterministic**: no `Date.now()`, no `Math.random()`, no DOM/`fetch`/storage in `@tcm/engine` or `@tcm/wuxing`; time and profile are passed in. Sort with explicit tie-breaks by id.
- Engines return **structured data and message keys**, never prose.
- Match the surrounding style and comment density; comment the *why* (a source, a school choice, a threshold's provenance), not the *what*.
- No new runtime dependency without a bundle-size and privacy review ([privacy §6](docs/privacy.md)).

**Data**
- Change the generator or the table in `scripts/kb/curated/`, then rebuild. A change to a medical value needs a **citation or an explicit "expert judgement" note** and goes through [content review](docs/content-review.md).
- Ids are append-only. Every user-visible string is bilingual (`zh-Hant` always; `en` may be `null` while untranslated).
- Do **not** copy published translations of classical texts; write your own and label it unreviewed ([i18n guide §4.3](docs/i18n-guide.md)).

**Language**
- All docs and code comments are **English**, except the diagnosis SOP (`docs/diagnosis-sop.zh-TW.md`, Traditional Chinese), the Traditional Chinese translation of the algorithm spec (`docs/wuxing-algorithm.zh-TW.md` — change the English version first, then sync the translation and note both changelogs) and Chinese UI/data strings.
- UI copy follows the [i18n guide](docs/i18n-guide.md): no hard-coded strings, zh-Hant is the source catalog, `en` in the same change, no forbidden wording ("diagnose", "prescribe", "cure", "you have …" …).

**Privacy**
- Tests, fixtures and screenshots use **synthetic data only**. Never log inputs. Never put health or birth data in URLs ([privacy §6](docs/privacy.md)).

## 5. Medical content: extra rules

- The app must not claim to diagnose, treat, cure or prescribe. See the [safety policy](docs/safety-policy.md).
- If you change a pattern, formula, herb effect/burden, red flag, safety rule or notice, say so in the PR; it will be routed to the matching reviewer role and the affected records fall back to `curated-draft` until re-reviewed.
- If you are a qualified practitioner, pharmacist or physician and want to review, see [content review §9](docs/content-review.md).

## 6. Checks to run

| Change | Run |
|---|---|
| `scripts/kb/**` or `data/**` | `.venv/bin/python -m scripts.kb.build_kb` (must be a no-op diff if you changed nothing; schema validation, integrity checks and the self-test must pass) and `pnpm test:kb` (Python tests) |
| `packages/wuxing/**` | `pnpm --filter @tcm/wuxing test && pnpm --filter @tcm/wuxing typecheck` |
| `packages/engine/**` (planned) | `pnpm --filter @tcm/engine test`, parity fixtures regenerated if parameters/KB changed |
| `data/schema` or `scripts/kb/schemas.py` | `pnpm generate:kb-types` (commit the result; CI runs `pnpm check:kb-types`) |
| UI strings | `pnpm check:i18n` |
| `apps/web/**` (planned) | `pnpm --filter web test`, `pnpm --filter web e2e` for flows you touched, axe |
| Docs | `python3 scripts/check_doc_links.py`; docs index and version tables updated |

## 7. PR checklist

- [ ] Task id referenced; one task per commit
- [ ] Tests added or updated; all relevant checks pass
- [ ] Docs updated (spec versions and changelog tables where behaviour changed)
- [ ] **Medical impact:** none / changed (reviewer role: …)
- [ ] **Privacy impact:** none / changed (inventory updated)
- [ ] **i18n impact:** none / strings added (both languages) / terms added (glossary)
- [ ] **Accessibility impact:** none / checked (keyboard, screen reader, contrast)
- [ ] Release-profile impact: nothing restricted can reach a release build

## 8. Reporting problems

- **Bugs and ideas:** open an issue.
- **Safety or content concerns** (a wrong contraindication, a missing notice, misleading wording): use the *Safety report* template; include the item id and the KB/engine versions shown in Settings. **Do not include personal health information.**
- **Security issues:** see `SECURITY.md` (to be added) — do not open a public issue.

## 9. Licence

Code is under the Apache License 2.0 ([`LICENSE`](LICENSE)). The knowledge base in `data/` is derived from sources with their own licences; see [`reference/README.md`](reference/README.md) and [`data/README.md`](data/README.md#provenance-and-licences). By contributing you agree your contribution is licensed under the project licence.
