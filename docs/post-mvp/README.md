# Post-MVP Documentation Set

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Complete as a plan: product documents (A-19) and nine design documents (A-20 … A-28). No feature is built; the implementation tasks are section PM of `TASKS.md` |
| **Last updated** | 2026-10-05 |
| **Audience** | Maintainers, reviewers, whoever plans the next releases |
| **Related** | [PRD](../PRD.md) · [Release process](../release-process.md) · [Content review](../content-review.md) · [`TASKS.md`](../../TASKS.md) §PM · [`CHECKLIST.md`](../../CHECKLIST.md) §3 |

> **Summary.** The MVP is the app as built by [`TASKS.md`](../../TASKS.md) through milestone M2: the whole flow from intake to result in two languages, the knowledge base, the engine and the
> checks around them. What remains of the MVP is work only people can do — clinical, linguistic, legal and usability review, practitioner evaluation, the signed release checklist.
> **That track is separate and unchanged** (tasks V-01…V-07, I-06, Q-09, Q-10, R-07). This set describes what is built *after* the MVP, in parallel with that track and never in place of it.

---

## 1. What is in this set

| Document | What it answers |
|---|---|
| [Roadmap](roadmap.md) | Where the product goes after the MVP: principles, four releases (A–D), sequencing, risks, success measures, quality debt carried over |
| [Requirements](requirements.md) | The product requirements of the new features (FR-21 …), each with acceptance criteria, review class and the PRD requirement it refines |
| [Decision register](decisions.md) | Every decision the MVP recorded as "revisit after the MVP", with the recommended post-MVP answer and what would change it |
| Design documents (below) | How each feature is built: data, storage, privacy, safety, tests, budgets, rollout |

Design documents (one per feature area, tasks A-20 … A-28 in [`TASKS.md`](../../TASKS.md)):

| Design | Release | Task |
|---|---|---|
| [Simplified Chinese interface and display dictionary](design/simplified-chinese.md) | A | A-20 |
| [Offline use and installation (service worker)](design/offline-and-install.md) | A | A-21 |
| [Backup, restore, storage health and the local data lock](design/backup-and-data-lock.md) | A, B | A-22 |
| [Tap-tempo pulse and region packs](design/tap-tempo-and-regions.md) | A | A-23 |
| [Knowledge browser and pattern comparison](design/knowledge-browser.md) | B | A-24 |
| [Practitioner export, follow-up and trends](design/export-follow-up-trends.md) | B | A-25 |
| [Library expansion (patterns and complaint modules)](design/library-expansion.md) | C | A-26 |
| [Five-phase extensions (hemisphere, hour boundary, astronomy data, season model)](design/five-phase-extensions.md) | C | A-27 |
| [Research tracks (tongue photo, camera pulse, file-based sync, and what is not planned)](design/research-tracks.md) | D | A-28 |

Spike protocols and reports (Release D; [how a spike works](design/research-tracks.md#1-how-a-spike-works)):

| Spike | Task | State |
|---|---|---|
| [Camera pulse and heart-rate-strap prefill](spikes/camera-pulse.md) | PM-31 | Protocol fixed; **not run** — needs a reference device, volunteers with consent, phones and an ethics approval |

## 2. Standing constraints

Every post-MVP feature keeps these; a design that needs to break one says so in its first section and needs a recorded decision.

1. **Gates do not move.** Output levels, notices, the draft label and the review-gated release ([content review §7](../content-review.md)) apply to new features exactly as to old ones. A feature never lowers a gate to ship earlier.
2. **Local-first.** No accounts, no server that receives answers, no third-party scripts, no analytics. A feature that seems to need a server is redesigned as a file the person holds. Any new network request, `connect-src` entry or stored field is a privacy change: [privacy §2](../privacy.md) and [tech spec §11](../tech-spec.md) are edited in the same commit.
3. **Deterministic, explainable core.** The engine stays pure and the same input gives the same output; nothing generated at run time decides a diagnosis or a recommendation.
4. **Budgets.** Initial JavaScript ≤ 200 KB gzip and the knowledge base per session ≤ 100 KB stay. New languages, features and data load lazily and only for the people who use them.
5. **Review class.** Each feature is classified by the review it needs before it can reach people (see §3). The class decides what blocks the release, not how interesting the feature is.
6. **Fold-in.** When a feature ships, its requirements move into the PRD, its design into the tech and UX specs, and its stored data into the privacy inventory. This set then keeps only the history ([`CHECKLIST.md`](../../CHECKLIST.md) §1).
7. **One commit per task**, decisions logged as *Decided <date> — post-MVP default, revisit at the start of the release that depends on it*.

## 3. Review classes

| Class | What the feature adds | What blocks release | Examples |
|---|---|---|---|
| **N** — no new clinical statement | Mechanics, presentation, or showing content that is already reviewed | Accessibility pass, privacy and security check, the technical gates | Offline use, backup, tap-tempo, knowledge browser for reviewed items |
| **L** — new wording | New text or a new language for existing statements | Linguistic review of the new text; legal review where notices or claims change | Simplified Chinese, follow-up wording, region notices |
| **C** — new clinical content | Patterns, formulas, questions, rules, herbs shown for the first time | Clinical and pharmacy review rounds as for the original content; golden and vignette cases | Library expansion, herb browser |
| **R** — research | An input or method whose accuracy is unknown | A separate evaluation protocol, privacy and legal review, an explicit go decision | Tongue-photo assistance, camera pulse |

A feature of class N can still contain a class-C part (a knowledge page that shows an herb nobody has reviewed); the design document then splits it.

## 4. Where things live afterwards

| Concern | Authoritative document after the feature ships |
|---|---|
| What the product does | [PRD](../PRD.md) (FR list) |
| How it is built | [Tech spec](../tech-spec.md) (and [UX spec](../ux-spec.md) for screens) |
| What is stored | [Privacy §2](../privacy.md) |
| Terminology and wording | [i18n guide](../i18n-guide.md) |
| How it is checked | [Test plan](../test-plan.md), [`CHECKLIST.md`](../../CHECKLIST.md) |

## 5. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Roadmap, requirements and decision register; nine design documents |
