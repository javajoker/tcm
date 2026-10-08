# Post-MVP Decision Register

| | |
|---|---|
| **Version** | 0.14 (draft) |
| **Status** | Every item the MVP documents recorded as "to be revisited after the MVP" is answered here with the recommended default; new decisions that came out of the post-MVP design are PD-01 … PD-12 |
| **Last updated** | 2026-10-07 |
| **Audience** | Project owner, maintainers, reviewers |
| **Related** | [Roadmap](roadmap.md) · [Requirements](requirements.md) · [PRD §14](../PRD.md#14-decisions-and-open-questions) · [Tech spec §13](../tech-spec.md#13-open-technical-questions) · [UX spec §15](../ux-spec.md#15-open-design-questions) · [Safety policy §10](../safety-policy.md#10-open-questions) · [Privacy §9](../privacy.md#9-open-questions) · [Release process §13](../release-process.md#13-open-questions) |

---

## 1. How to read this register

**Decided 2026-10-05 — post-MVP default, revisit at the start of the release that depends on it.** The owner's standing instruction is to apply the recommended default to open decisions and not to re-ask settled ones; this register does that for the post-MVP period. A row marked **⚑** also needs something engineering cannot supply (a legal view, a regional verifier, a reviewer, a download approval): the default stands as the working assumption and the row says what is missing.

An *unchanged* decision means the MVP answer still holds and the reason is stated, so that nobody has to rediscover it. Decisions about the **review track** (reviewers, calibration, sign-off) are listed only to say that they are unchanged and owned elsewhere.

## 2. The decisions

### 2.1 Product and scope (PRD §14)

| ID | Topic | MVP default | Post-MVP decision | Revisit when / needs |
|---|---|---|---|---|
| Q1 | Region and regulatory framing | Taiwan-first | Unchanged for the first public release. Regions are added one at a time as region packs (FR-29): Hong Kong first, then Singapore and Malaysia, Mainland last. Language does not imply region | ⚑ legal view and a verified emergency list per region |
| Q2 | Modules and patterns | 23 patterns, 8 modules | Grow in waves through one admission process (FR-30); Wave A fills everyday gaps | Reviewer capacity (⚑); first-wave feedback |
| Q3 | LLM involvement | None in the core; optional rewording later | **Not planned.** If ever revisited: on-device only, after the fact, opt-in, passed through the same wording lint, never touching a recommendation | Small accurate on-device models, reviewer capacity, and usability evidence that templated text fails comprehension |
| Q4 | Tongue photo, pulse devices | Not in MVP | Research spikes in Release D (FR-32, FR-33) with protocols and stop conditions. **Camera pulse (PM-31): protocol fixed, spike not run** ([spikes/camera-pulse.md](spikes/camera-pulse.md)). **Tongue photo (PM-30): protocol fixed, desk research on datasets done, stopped at step 1** by the licence and consent gap and the open gates ([spikes/tongue-photo.md](spikes/tongue-photo.md)) | ⚑ datasets, advisor, approval to download |
| Q5 | Accounts and cloud sync | Purely local | **No accounts.** Portability by backup (FR-23) and file-based sync (FR-34, **built — PM-32**, Chromium only: an encrypted backup kept in a file the person chooses, never overwriting a file another device changed). Server-side sync only with demand, a security and privacy review and a legal view | A study showing multi-device need that files do not meet |
| Q6 | Simplified Chinese | Post-MVP | **Release A** (FR-21), derived from Traditional and the Simplified sources (PD-01) | ⚑ Mainland linguistic reviewer; legal view on notices |
| Q7 | Commercial or not | Assume commercial; exclude NC data | Unchanged. Monetisation is the owner's choice and needs no data change | Only if non-commercial material would add real value and the project is firmly non-commercial |
| Q8 | Who reviews content | Not appointed | Unchanged; owned by the review track | — |
| Q9 | Age, pregnancy, elderly beyond profiles | Per release profile | Unchanged | After review round 1 |
| Q10 | Birth-based blocks default | Opt-in | Unchanged; the default changes only on calibration evidence that the reference blocks add value | V-05 results |
| Q11 | 長夏 model, tier thresholds, automatic modification scope | SOP D14–D16 | 長夏 becomes a declared parameter (FR-31d); thresholds and modification scope are for calibration | Calibration sessions |
| P1 | Client-only SPA; no UI library; tiny i18n | Confirmed | Unchanged. The service worker is hand-written (PD-03); Simplified Chinese uses the same tiny formatter | A feature that cannot be built without a library |
| P2 | Oracle versus golden cases | Goldens win once they exist | Unchanged | — |
| P3 | Profile pruning | Release lacks doses, tier C, herb weights | Unchanged; learn mode and import respect it (FR-14.4, FR-23.4) | — |
| P4 | Review-gated release | Confirmed | Unchanged; classes N, L, C, R are how it applies to new features | — |
| P5 | "Not sure" counts as yes | Confirmed | Unchanged | — |
| P6 | Birth data opt-in; no analytics | Confirmed | Unchanged; no new request carries user data | — |
| P7 | Default `zh-Hant` for everyone | Confirmed | Default unchanged; a one-time Simplified offer by browser language, as for English | Usage evidence from studies |
| P8 | Panel as words and bands | Confirmed | Unchanged; trends use bands and neutral wording (FR-27.4) | — |
| P9, P10 | Own-written items; data additions | Confirmed | Unchanged | — |
| DEC-04 | App name, logo | Working name TCM Self-Check / 中醫自我評估; text wordmark | Choose the final name and domain before the public release; the name stays one i18n key plus the manifest and page title | ⚑ owner; trademark and domain search |

### 2.2 Technical (tech spec §13, performance, algorithm)

| ID | Topic | MVP default | Post-MVP decision | Revisit when / needs |
|---|---|---|---|---|
| TQ1 | Hosting | Cloudflare Pages | Unchanged. Offline use adds a `sw.js` rule (never cached) and path-specific headers; GitHub Pages stays the fallback but cannot set the headers the worker design relies on | — |
| TQ2 | City list | 484 places from GeoNames `cities15000` | Unchanged. If people miss places: a larger lazy list (GeoNames `cities5000`) or the manual entry that exists | ⚑ approval to download a dataset |
| TQ3 | Freezing `scoring-params.json` | After first calibration | Unchanged | Calibration |
| TQ4 | Oracle after goldens | Goldens win | Unchanged | — |
| TQ5 | Engine in a Web Worker | Not needed | Unchanged. Trigger: `assess` p95 above 25 ms (half the budget) after the library waves | `pnpm bench:check` |
| TQ6 | Service worker, offline | Post-MVP | **Release A** (FR-22) | — |
| TQ7 | Telemetry | None | Unchanged. Evidence comes from tests, studies and voluntary feedback exports | — |
| TQ8 | Fonts | System fonts | Unchanged; the glyph audit (PF-02) is re-run for the Simplified text | Missing-glyph rate above zero for common characters |
| PF-01 | Lightweight season entry | Considered, not done | Unchanged. Trigger: initial JavaScript above 180 KB (90 % of budget); today 121.7 KB | `pnpm check:budgets` |
| PF-03 | Engine in a worker | Not triggered | See TQ5 | — |
| W-1 | VSOP87 data regenerated from the archive | Open | PM-28 (FR-31c) | ⚑ approval to download the archive |
| W-2 | Calibration of `[calibrate]` parameters | Open | Review track | Calibration |
| W-3 | 長夏 versus 土旺十八日 | Default model | **Built (PM-29):** the model is declared in a line on every result with a plain explanation, at the foot of the practitioner summary and in the summary file; a release declares `changxia` and offers no switch, the development profile can try both, and the other model ends the stamp of the parameters | School decision (⚑) — the choice itself waits for calibration |
| W-4 | Southern hemisphere | Northern mapping | **Built (PM-26, FR-31a):** a `seasons` choice — the northern calendar (default), the southern basis (the season lookup at longitude + 180°) or none (the tropics) — suggested by the device's time zone, shown on every result and stamped on a result made on another basis; a northern result is byte-for-byte unchanged | The clinical content owner confirms *what* flips (the experienced season only; the birth chart, the annual block and yunqi stay calendar references) |
| W-5 | Hour-boundary alternatives | Corrections exposed by the engine | **Built (PM-27, FR-31b):** `hourAlternatives` names the other side's pillars for a birth time within 15 minutes of an hour boundary in true solar time; the birth card asks which hour is nearer the truth (the computed hour is kept unless the person says otherwise, the other hour or *I am not sure*); a saved result records the choice and not the time | Usability round: the margin and the default |
| W-6 | Julian-calendar dates | Rejected | Unchanged | A real need |
| W-7 | 客主加臨; 大運/流年 interaction with natal branches | Not built | Not planned; revisit if calibration shows the structure adds value | Calibration |

### 2.3 UX (UX spec §15)

| ID | Topic | MVP default | Post-MVP decision | Revisit when / needs |
|---|---|---|---|---|
| UQ1 | Name and logo | Text wordmark | See DEC-04 | ⚑ owner |
| UQ2 | Pct outside details | No | Unchanged | — |
| UQ3 | Tap-tempo pulse | Post-MVP | **Release A** (FR-28) | — |
| UQ4 | Tongue illustration style | Line art | Unchanged; photos only with a free licence and consent | FR-32 datasets |
| UQ5 | History compare | P1, shipped | Extended by trends (FR-27) | — |
| UQ6 | Auto-advance | Setting, default on | Unchanged | Usability round R2 |
| UQ7 | Acupoint diagrams | Original schematics, done | Unchanged; placement review is V-04 | Review |

### 2.4 Safety (safety policy §10)

| ID | Topic | MVP default | Post-MVP decision | Revisit when / needs |
|---|---|---|---|---|
| SQ1 | Regions and emergency lists | Taiwan first | See Q1; region packs (FR-29) | ⚑ |
| SQ2 | "Not sure" is yes | Yes | Unchanged | — |
| SQ3 | Clearing a positive A/B flag | Explicit recorded correction | Unchanged | — |
| SQ4 | Minimum age | L0 with blocking notice | Unchanged | Review round 1 |
| SQ5 | Practitioner directory | No | Unchanged: a directory implies endorsement and needs a server | — |
| SQ6 | Legal review of notices | Before any public release | Also before each new language and region | ⚑ legal |
| SQ7 | Reporting channel | Issue template and email alias, TBD | Unchanged | ⚑ owner |

### 2.5 Privacy (privacy §9)

| ID | Topic | MVP default | Post-MVP decision | Revisit when / needs |
|---|---|---|---|---|
| PQ1 | Hosting and logs | Cloudflare Pages, analytics off | Unchanged; offline use does not change what the host sees | Confirm on the real host |
| PQ2 | PIN lock | Post-MVP | **No screen-only PIN**; one mechanism, real encryption (PD-05, FR-24) | — |
| PQ3 | Encryption at rest | Post-MVP | **Release B** (FR-24) | Security review |
| PQ4 | Aggregate counters | Not in MVP | Not planned; research by voluntary files only | — |
| PQ5 | Retention | Unlimited, visible count, delete-all | Unchanged; storage health and an optional backup reminder are added (FR-23); optional auto-delete if people ask | Study feedback |

### 2.6 Release (release process §13)

| ID | Topic | MVP default | Post-MVP decision | Revisit when / needs |
|---|---|---|---|---|
| RQ1 | Hosting and preview access | Cloudflare Pages; previews behind access | Unchanged; the worker rollback is rehearsed with the first deployment (PM-05) | — |
| RQ2 | Repository visibility | Private until closed beta | Unchanged | ⚑ owner |
| RQ3 | Signing | Signed tags, SHA-256 | Unchanged | — |
| RQ4 | Hotfix approval | Content owner plus one reviewer | Unchanged | — |

### 2.7 Decisions that came out of the post-MVP design

| ID | Decision | Why |
|---|---|---|
| PD-01 | Simplified Chinese is a **build-time derivative** of the Traditional source and of the Simplified source texts, through a committed dictionary and a reviewed override table; **applied only when a string is displayed — the engine and the safety rules always run on the canonical Traditional data**; no runtime conversion by algorithm, no separately hand-translated catalogue | One source of truth; conversion errors are reviewed once, in a file; language cannot change an output because Chinese identifiers (organs, roles, herb lists of the safety rules) are matched by value and are never converted |
| PD-02 | `zh` stays an alias of `zh-Hant`; `zh-cn`, `zh-hans`, `zh-sg` map to `zh-Hans` | Existing links keep their meaning |
| PD-03 | The service worker is hand-written: it precaches the build and serves the app shell for navigations; it caches nothing else and handles no request with a body; no Workbox | Small, auditable, nothing personal can be cached |
| PD-04 | The backup is a versioned JSON file with an optional AES-GCM envelope; the practitioner export reuses the envelope code but has its own schema and is not an import format | One restore path to secure; summaries stay readable by other tools |
| PD-05 | No screen-only PIN; the lock is encryption with a passphrase and no recovery | A PIN that does not encrypt gives false security |
| PD-06 | Follow-up is an in-app nudge plus a calendar file with no health content; no push and no notifications | Push needs a server and would carry health timing |
| PD-07 | Knowledge pages use an anonymous, conservative context and never speak to "you" | They are not an assessment and must not read as advice |
| PD-08 | Acute febrile stages beyond the early exterior (營分, 血分) are red flags, not patterns | A self-assessment must not stage a serious acute illness |
| PD-09 | Releases are named by theme (A–D; E and F added 2026-10-07); version numbers are assigned when tagged; a feature ships when its class gates are met | The review track sets the pace, not this plan |
| PD-10 | Research items begin as spikes with a written protocol and stop conditions; shipping is a separate decision | Unknown accuracy must be measured before it is offered |
| PD-11 | Any new download — dataset, model, archive, tool, browser — is approved by the owner first, with filename, source and size | Standing safety rule |
| PD-12 | The all-JavaScript budget rises with each release by the lazy budgets that release declares (260 KB for the MVP → 300 KB for Release A: Simplified catalogue ≈ 20, service worker ≤ 10, backup ≈ 10 → **350 KB for Release B, decided 2026-10-06**: Learn ≈ 12 (measured 9.2 with all seven kinds and the comparison), practitioner export ≈ 10, trends ≈ 13, data lock ≈ 15 → **370 KB for Release E, approved by the owner 2026-10-07** (§2.9): the learning book's pages and the 營衛 block ≈ 3, the learners' and practitioners' prescription in the release build ≈ 15); the initial 200 KB and the 50 KB per lazy chunk do not change | The figure bounds growth, not a visit: nobody downloads every lazy feature. Release A already uses 21 of the 37 KB the MVP left, so keeping 260 would have meant refusing the language |

### 2.8 Decisions for Releases E and F (the owner's direction of 2026-10-07)

**Decided 2026-10-07 — defaults of the designs; ⚑ marks the decisions that need the owner, and nothing marked ⚑ reaches a public build before it is confirmed.**

| ID | Question | Default | Design | Revisit when |
|---|---|---|---|---|
| PD-13 ⚑ | Reference amounts in a personalised prescription | Computed for everyone; **shown only at L3 (development) and in a practitioner profile**; the public build shows the personalised herbs and the reasons, not grams | [Prescription model §7](design/prescription-model.md) | A legal view on amounts for laypeople in each region |
| PD-14 ⚑ | A practitioner profile | Proposed: L3 without the developer tools, for licensed practitioners; how a practitioner is recognised is open | [Prescription model §7.1](design/prescription-model.md) | The owner decides the audience and the recognition |
| PD-15 | Where a prescription is computed | A pure function after `assess`, stored with the saved result; the diagnosis and its replay are unchanged | [Prescription model §6.5](design/prescription-model.md) | — |
| PD-16 | Base of a prescription | Always a classical formula of the library; at most 2 herbs added in all (today's `max_add`, the SOP's 最多加 2 味); a listed herb removed only by a safety rule or the classical 加減, never the 君 | [Prescription model §6.2](design/prescription-model.md) | Reviewers ask for wider 加減 |
| PD-17 | Dose model | Saturating benefit, super-linear burden, the Pharmacopoeia range as a hard bound; toxic herbs never raised | [Prescription model §3.3, §6.3](design/prescription-model.md) | Calibration with practitioners |
| PD-18 | Formula verification failures | Listed for review, never auto-fixed | [Prescription model §5](design/prescription-model.md) | — |
| PD-19 | New sources | The corpus first; each public-domain addition is a download asked for separately; modern textbooks are bibliography only | [Knowledge base v2 §3](design/knowledge-base-v2.md) | — |
| PD-20 | The learning book | Traditional Chinese only, in `docs/book/zh-Hant/` and in Learn for every interface language with a note | [Knowledge base v2 §6](design/knowledge-base-v2.md) | The owner wants other languages |
| PD-21 ⚑ | AI help and the local-first promise | Off by default in the public build; opt-in per person and per module, with consent; for those who opt in, conversation and photos go to the project's gateway and the provider for the request only | [AI-assisted intake §2, §5](design/ai-assisted-intake.md) | The owner's decision, a privacy redesign and a legal view |
| PD-22 | Provider | Anthropic's API through the project's own gateway, model configurable; another provider or an on-device model plugs into the same interface | [AI-assisted intake §3](design/ai-assisted-intake.md) | Cost, terms or a better option |
| PD-23 | What the AI may do | Ask questions and propose findings with the person's own words as evidence; never a pattern, a herb or an amount; the deterministic engine decides on confirmed findings | [AI-assisted intake §4](design/ai-assisted-intake.md) | — (this keeps Q3's substance) |
| PD-24 | Storage of AI data | None: no content logged by the gateway, the provider's zero-retention terms, no photo on disk | [AI-assisted intake §5](design/ai-assisted-intake.md) | — |
| PD-25 ⚑ | Photos of tongue and face | Development profile only until the tongue-photo spike's gates (legal view, evaluation) are met | [AI-assisted intake §6](design/ai-assisted-intake.md) | The gates are met |
| PD-26 | Who may use AI help | Adults (18 and over) | [AI-assisted intake §4](design/ai-assisted-intake.md) | A reviewed design for minors |
| PD-27 | Order | Release E (local, deterministic) before Release F; within F, conversation before observation | [Roadmap §3.4a, §3.4b](roadmap.md) | — |

These revisit three earlier answers: **Q3** (LLM involvement) keeps its substance — no model decides a diagnosis — but an input aid is now planned; **Q4** (tongue photo) is joined by a general-purpose vision model under the same gates; **Q5** and standing constraint 2 (local-first) gain an exception for the people who opt in to AI help (PD-21, ⚑).

The ⚑ items PD-13, PD-14, PD-21 and PD-25 were decided by the owner on 2026-10-07 (§2.9).

### 2.9 The owner's decisions of 2026-10-07 (second)

**Decided by the owner, 2026-10-07:** *approve everything that needs approval (VSOP87D.ear, for example); the app may serve those who study Chinese medicine and practitioners as a reference, giving the medication plan and the reasons for its modifications; supplement what concerns 營衛 from the classics into the model, self-consistent and complete, weighting contradictory classics by applicability; agreed with the design of AI help — first its mock-provider parts.*

| ID | Question | Decision | Design | Revisit when |
|---|---|---|---|---|
| PD-13 ✓ | Reference amounts | Shown to those who **declare themselves learners or practitioners**, with an attestation; a general reader keeps today's levels | [Prescription model §7.4](design/prescription-model.md) | A legal view per market before a public launch (advisable, kept as a risk) |
| PD-14 ✓ | A practitioner profile | Not a third build: a **role** in the release build (general, learner, practitioner), declared with an attestation; no licence check — the app has no accounts | [Prescription model §7.4](design/prescription-model.md) | An institution wants verified practitioners |
| PD-19 ✓ | New sources | The owner approves the downloads the plan names: `VSOP87D.ear` (PM-28) and the eight public-domain works of knowledge base v2 §3 when a task needs one — each from a source whose licence fits, with its filename, source and size recorded in the registry | [Knowledge base v2 §3](design/knowledge-base-v2.md) | — |
| PD-21 ✓ | AI help and the local-first promise | **Approved as designed**: off by default in public builds; opt-in per person and per module with consent; adults; nothing identifying sent; nothing stored. The privacy redesign and a legal view still come before any public use | [AI-assisted intake §2, §5](design/ai-assisted-intake.md) | — |
| PD-25 ✓ | Photos of tongue and face | As designed: development profile only until the tongue-photo spike's gates | [AI-assisted intake §6](design/ai-assisted-intake.md) | The gates are met |
| PD-12 (extended) | All-JavaScript budget | Raises stay declared per feature; the owner approved those the next features need — the release build's prescription chunk (PM-53). Release F adds nothing to a release build until it ships publicly | [Roadmap §2](roadmap.md) | — |
| PD-28 | 營衛 in the model | Three dimensions (衛, 營, 開闔), four natures, the sources of 營 and 衛 as a coupling, the 八綱 虛實 axis counting them; where readings disagree, the applicability-weighted mean with a confidence; no pattern added | [營衛 in the model](design/ying-wei.md) | The clinical reviewer moves a weight |
| PD-29 | Order | Plan (PM-51) → 營衛 (PM-52) → the VSOP87 tables (PM-28) → Release F's mock-provider parts (PM-44 … PM-48) → learners and practitioners in the app (PM-53). PM-49 (the real provider) waits for the owner's key and deployment; PM-50 (photos) for the spike's gates | [Roadmap §4](roadmap.md) | — |

### 2.10 The owner's decision of 2026-10-08

**Decided by the owner, 2026-10-08:** *finish all the coding first; the doses are shown to users for the sake of learning, with a note that they are for study and as an aid to a practitioner only, and the display is configurable.*

| ID | Question | Decision | Design | Revisit when |
|---|---|---|---|---|
| PD-30 ✓ | Reference quantities (doses) for study | The **study reference** — reference quantities, the classical 加減 and the medication plan with the reasons — is shown to **every reader by default**, unless they choose *General reader*; it always carries the note **N-AMOUNTS** ("for study and as an aid to a practitioner only, not instructions for taking medicine; a licensed practitioner examines the person and decides") beside every table of quantities, on the formula page, in the plan, in the practitioner summary and its file and on the Learn formula page. **Configurable** three ways: the profile's `dose_display` (`all` · `roles` · `off`, data default `all`), narrowed — never widened — at build time by `APP_DOSE_DISPLAY` or `APP_OVERRIDES`; each reader's own choice in *Settings → Who is reading*; and the existing feature flags. **Unchanged:** the safety layer for every reader (pregnancy, breastfeeding, minors, red flags, serious illness keep their blocking cells), the draft label, and the review gate (`check-release` rule 18: a public build serves no study reference before its formulas and herb records are reviewed). PD-13 and PD-14 stand for the `roles` mode | [Prescription model §7.4](design/prescription-model.md) | A legal view per market before a public launch (advisable, kept as a risk); a clinical or pharmacy reviewer asks for a narrower default |

## 3. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial register: all "revisit after the MVP" items answered; PD-01 … PD-12 |
| 0.2 | 2026-10-06 | PD-12 extended for Release B: all JavaScript ≤ 350 KB |
| 0.3 | 2026-10-06 | W-4 built (PM-26): the southern hemisphere as a person's choice, additive to every saved result |
| 0.4 | 2026-10-06 | W-5 built (PM-27): the hour near a boundary as a person's choice, kept with the draft and the saved result and never in the engine's result |
| 0.5 | 2026-10-06 | W-3 built (PM-29): the season model declared on every result; Q11's 長夏 item is a declared parameter, the school decision stays open |
| 0.6 | 2026-10-06 | Q5: file-based sync built (PM-32) — the spike's stop conditions were not met |
| 0.7 | 2026-10-06 | Q4: the camera-pulse spike's protocol fixed before any measurement (PM-31); not run |
| 0.8 | 2026-10-06 | Q4: the tongue-photo spike's protocol fixed and its desk research on datasets done (PM-30); stopped at step 1 |
| 0.9 | 2026-10-07 | §2.8: decisions PD-13 … PD-27 for Releases E and F (tasks PM-34 … PM-50), from the owner's direction of 2026-10-07; Q3, Q4, Q5 revisited |
| 0.10 | 2026-10-07 | PD-16 corrected to the limits built and stated by the SOP: two herbs added in all (the text said three added and two removed) |
| 0.11 | 2026-10-07 | §2.9: the owner's decisions of 2026-10-07 (second) — PD-13, PD-14, PD-19, PD-21, PD-25 decided; PD-12 extended; PD-28 (營衛 in the model) and PD-29 (order) |
| 0.12 | 2026-10-07 | PD-12: 370 KB for Release E (the 營衛 block took all JS to 350.1 KB) |
| 0.13 | 2026-10-08 | PD-12 measured for PM-53: the release build's prescription chunk about 17 KB; all JavaScript 367.6 of 370 KB |
| 0.14 | 2026-10-08 | §2.10: PD-30 — reference quantities for study, shown by default with their note, configurable (PM-54) |
