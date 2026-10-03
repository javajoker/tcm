# Documentation Index

Reading order for a new contributor: **PRD → Diagnosis SOP → Tech spec → UX spec**, then the supporting documents as needed.

| Document | Language | What it answers | Owner of … | Version |
|---|---|---|---|---|
| [PRD](PRD.md) | English | Why the product exists, who it is for, requirements (FR/NFR), scope, risks, decisions | Product requirements and priorities | 0.4 |
| [Diagnosis SOP](diagnosis-sop.zh-TW.md) | **繁體中文** | What is asked, how answers become a pattern, a body panel and a formula suggestion, with classical sources | **The diagnosis logic** (source of truth) | 0.2 |
| [Yin-yang / five-phase algorithm](wuxing-algorithm.md) · [繁體中文版](wuxing-algorithm.zh-TW.md) | English · **繁體中文** | The birth + annual + seasonal five-phase mathematics; extraction from the source engine; parameters; verification | The five-phase mathematics | 0.1 |
| [Technical specification](tech-spec.md) | English | Architecture, packages, data delivery, profiles, engine contract, state, storage, security, performance | Technical decisions and contracts | 0.1 |
| [UI/UX specification](ux-spec.md) | English | Screens, flows, components, design tokens, responsive and accessibility rules, copy rules | Interface behaviour and look | 0.1 |
| [Knowledge-base schema](kb-schema.md) | English | Shape and integrity rules of every `data/` file; planned additions | Data contracts | 0.1 |
| [i18n, terminology and copy guide](i18n-guide.md) | English | Languages, glossary rules, message catalogs, forbidden wording, translation workflow | Terminology and wording | 0.1 |
| [Content review process](content-review.md) | English | Who reviews which medical content, records, release gates | Review status and gates | 0.1 |
| [Safety policy](safety-policy.md) | English | Who gets what output, notice wording, filter semantics, emergency resources, incidents | **Notice wording** and safety behaviour | 0.1 |
| [Privacy and data handling](privacy.md) | English | Data inventory, storage, erase, compliance posture, developer rules | Privacy decisions | 0.1 |
| [Test plan](test-plan.md) | English | Test layers, properties, safety vignettes, golden cases, E2E, usability | Quality strategy | 0.1 |
| [Release process](release-process.md) | English | Versions, environments, gates, deployment, rollback | Release rules | 0.1 |
| [`TASKS.md`](../TASKS.md) | English | The implementation task list (one commit per task) | Work breakdown | 0.1 |
| [`CHECKLIST.md`](../CHECKLIST.md) | English | Definition of done and milestone/release checklists | Acceptance | 0.1 |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | English | How to work on the project | Contribution rules | 0.1 |
| [`data/README.md`](../data/README.md) | English | What the knowledge base contains, provenance, verification, gaps | Data provenance | — |
| [`reference/README.md`](../reference/README.md) | English | Source repositories, licences, data-quality findings | Sources | — |

## Precedence when documents disagree

1. **Numbers in `data/`** beat numbers in prose.
2. **Diagnosis SOP** (logic) → **algorithm spec** (five-phase maths) → **PRD** (requirements) → **tech spec / UX spec** (how it is built and shown).
3. **Safety policy** owns notice wording and safety behaviour; **i18n guide** owns terminology and forbidden wording; both override copy in the UX spec.
4. A conflict is a documentation bug: fix the lower-precedence document and note it in its changelog.

## Language rule

All documents are English **except** the diagnosis SOP, which is Traditional Chinese (Taiwan wording), and the Traditional Chinese translation of the algorithm spec (`wuxing-algorithm.zh-TW.md`, kept in sync with the authoritative English version). User-visible app text is `zh-Hant` by default with an English translation.
