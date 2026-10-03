# Implementation Checklist

| | |
|---|---|
| **Version** | 0.1 |
| **Last updated** | 2026-10-04 |
| **Use** | Tick items as evidence appears (test name, command, review record, screenshot). A box ticked without evidence is a defect in the checklist. |
| **Companion** | [`TASKS.md`](TASKS.md) (what to build) · [Test plan](docs/test-plan.md) (how it is verified) · [Release process](docs/release-process.md) (gates) |

Sections: **1** Definition of done (every task) · **2** Per-PR · **3** Milestone exits · **4** Feature acceptance (PRD FR/NFR) · **5** Release go / no-go · **6** Manual accessibility pass · **7** Content sign-off · **8** Sign-off.

---

## 1. Definition of done — every task

- [ ] Meets the task's *Done when* in [`TASKS.md`](TASKS.md); the task row is ticked in the same commit
- [ ] **One commit** for the task; message `type(scope): summary` with the task id; regenerated `data/` included with its generator change
- [ ] Tests added or updated and passing (unit / property / parity / component as applicable); no skipped tests without a linked task
- [ ] Types: `tsc` strict is clean; no `any` introduced without a comment explaining why
- [ ] Layering respected (engine/wuxing import no DOM, fetch, storage, clock, randomness)
- [ ] No hard-coded user-visible strings; `en` added with `zh-Hant`; `pnpm check:i18n` clean *(once I-03 exists)*
- [ ] No forbidden wording in any user-visible text ([i18n guide §5](docs/i18n-guide.md))
- [ ] Docs updated where behaviour, data shape or a decision changed (spec version table / changelog row added)
- [ ] **Medical impact** stated (none / changed → reviewer role named; affected records fall back to `curated-draft`)
- [ ] **Privacy impact** stated (none / changed → inventory in [privacy §2](docs/privacy.md) updated)
- [ ] **Accessibility impact** checked for UI work (keyboard, labels, contrast, text equivalent)
- [ ] Nothing restricted by the `release` profile can reach a release build (pruning test or `check-release.ts` still green)
- [ ] Synthetic data only in fixtures, tests and screenshots

## 2. Per-PR checklist

- [ ] Branch is up to date with `main`; CI green (fast checks, build, integration as applicable)
- [ ] PR template completed (task id, medical / privacy / i18n / a11y / release-profile impact)
- [ ] Reviewer assigned according to `CODEOWNERS` (content areas → role) *(once R-06 exists)*
- [ ] For `data/` changes: `build_kb` reproducible, validation and self-test pass, parity fixtures regenerated
- [ ] For UI changes: screenshots in `zh-Hant` and `en`, mobile and desktop

---

## 3. Milestone exit checklists

### M0 — Documentation
- [x] PRD v0.3 · Diagnosis SOP v0.2 (Traditional Chinese) · algorithm spec
- [x] Technical specification · UI/UX specification
- [x] KB schema · i18n guide · content review · safety policy · privacy · test plan · release process
- [x] CONTRIBUTING · documentation index
- [x] Task list ([`TASKS.md`](TASKS.md))
- [x] This checklist
- [ ] README and PRD roadmap updated to link the new documents (A-17)
- [ ] Open decisions DEC-01…DEC-03 answered by the project owner (needed before M1 can finish)

### M1 — Knowledge base complete
- [x] First-pass `data/` builds deterministically; 127/127 citations verified; pattern self-test green
- [ ] `scoring-params.json` in data and used by the oracle (K-01)
- [ ] JSON Schemas for every file; validation in the build (K-02); extra integrity checks (K-03)
- [ ] Orthography normalised, no `溼` in non-quotation fields (K-04)
- [ ] Question bank covers all 12 dimensions and 8 modules; every non-tongue/pulse symptom is reachable (K-05); exclusions (K-06)
- [ ] Constitution items and scoring (K-08); emergency numbers (K-09); city list (K-10)
- [ ] Treatment guidance complete for every acupoint/diet item referenced (K-11)
- [ ] Glossary upgraded (K-12); English draft for L0–L1 content (K-13)
- [ ] Parity fixtures exported (K-15)
- [ ] Wording lint clean on all display strings

### M2 — MVP app (dev builds)
- [ ] `@tcm/kb`, `@tcm/engine`, `@tcm/i18n` implemented with the tests of [test plan §3](docs/test-plan.md); properties P1–P12 green
- [ ] Parity with the Python oracle (1e-9) and fixture-freshness job in CI
- [ ] Safety vignette suite 100 % green (every red flag, every population/condition/state × both profiles)
- [ ] Screens S01–S19 implemented per [UX spec](docs/ux-spec.md); dev inspector (S20) in dev builds only
- [ ] E1–E20 green on desktop and mobile, `zh-Hant` and `en`
- [ ] axe: zero violations on every route × language × theme
- [ ] Budgets met: initial JS ≤ 200 KB gzip; KB chunks within budget; Lighthouse ≥ 90 / ≥ 95 (mobile)
- [ ] Dev and release builds produced; `check-release.ts` green on the release build
- [ ] Privacy tests green (no network after load, no sensitive data in URLs/logs, erase, birth data not persisted by default)
- [ ] **No public release** (clinical content is still unreviewed)

### M3 — Review and hardening
- [ ] Reviewers appointed (V-01); review records for round 1 (V-02), round 2 (V-03), round 3 (V-04), linguistic (V-06), legal (V-07)
- [ ] Reviewed content covers the gates of [content review §7](docs/content-review.md) for the intended release level
- [ ] ≥ 100 golden cases; held-out top-3 pattern concordance ≥ 80 %; formula top-3 ≥ 70 %; policy expectations 100 %
- [ ] Practitioner blinded evaluation reported (Q-10)
- [ ] Manual accessibility pass (§6) recorded for the candidate build
- [ ] Usability R2 issues (blocker/major) closed
- [ ] Parameters frozen: `scoring-params.json` fingerprint recorded in the release notes

### M4 — Closed beta
- [ ] Beta exception recorded in the release notes if any area is still draft; `APP_DRAFT_LABEL=on`
- [ ] Physician review of red flags, scope and notices **complete**
- [ ] Legal sign-off on disclaimers, claims, privacy statement
- [ ] Usability R3 done; participants informed (consent text)
- [ ] Release checklist (§5) complete; hosting and headers verified; rollback tested

---

## 4. Feature acceptance (PRD requirements)

Each row is accepted when **all** its checks hold and the verifying test or review exists.

### 4.1 Functional requirements

| ✔ | FR | Acceptance checks | Verified by |
|---|---|---|---|
| [ ] | FR-1 Onboarding, disclaimer | First screen states purpose, limits, privacy · acknowledgement stored with a version; a new version re-prompts · permanent short disclaimer on every screen and the full text on result and print | E1; component test |
| [ ] | FR-2 Language | Default `zh-Hant` · switch at any time without losing answers · language in the URL and remembered · fallback marked · no hard-coded strings · term tooltips (zh · pinyin · en) · citations in original script with a labelled English rendering | E11; `check-i18n` |
| [ ] | FR-3 Intake | Required ★ fields enforced with visible reasons · birth data optional and separate · main complaint chooser · free text never interpreted | E1, E8 |
| [ ] | FR-4 Red flags and notices | All 28 items asked · A/B/minor/pregnant/lactating/serious-disease → blocking notice, acknowledged, flow continues · merged notice, most severe first · emergency numbers by region · level from profile | Q-01; E2–E4 |
| [ ] | FR-5 Inquiry | 12 dimensions, ≈ 25 core questions · adaptive next question with a reason · plain language with term line · back/forward/edit/"not sure" · skipped data lowers coverage only · stop rule honoured | E1; engine tests |
| [ ] | FR-6 Observation | Tongue body/shape/coating/**zones**/**special signs** (map + checklist twin) · face/voice · **pulse optional**: rate, rhythm, qualities with exclusive groups, optional positions, education note · quality coefficients 0.7 / 0.5 · missing pulse never lowers a score | E9, E10; P2 |
| [ ] | FR-7 Constitution | 9-type quiz (own items) · primary + secondary · seasonal susceptibility · never added to pattern scores | engine tests; P1 |
| [ ] | FR-8 Engine | Deterministic · trace for every conclusion · 錯雜 flag · "insufficient information" state with what is missing · parity with oracle · self-test in CI · golden set | properties; parity; Q-02 |
| [ ] | FR-9 Result report | Sections in the order of [UX §4.10](docs/ux-spec.md) · evidence **against** shown · confidence shown · data summary editable → re-run · what would change | E1, E7 |
| [ ] | FR-10 Recommendations | Formula candidates by symptom fit and panel fit (`k*`, explained fraction) · composition table with 君臣佐使 · matches/doesn't match · cautions and contraindications · tiers computed · classical 加減 then residual 加減 (L2) · no amounts in release · diet, points, lifestyle with rationale | engine tests; E1; `check-release` |
| [ ] | FR-11 Citations | Chip opens passage, source, verification, translation label · 100 % of recommendations and reasoning items cited · ids stable | E1; engine test (every recommendation cited) |
| [ ] | FR-12 History | Save, reopen, compare two (panel changes), delete one/all · old-version label | E13, E14 |
| [ ] | FR-13 Export | Print view with table and figure, footnoted citations, disclaimer in footer · practitioner summary · input JSON export with warning | E16 |
| [ ] | FR-14 Knowledge browser (P2) | Browse patterns, formulas, herbs, points, passages with provenance | — |
| [x] | FR-15 Content pipeline | Deterministic build, validation, citation verification, self-test, provenance in `data/README.md` | `build_kb` (done, `da2fc30`) |
| [ ] | FR-16 Feedback | "Did this match?" per result and per item · stored locally · explicit export | component test |
| [ ] | FR-17 Scope configuration | `dev` opens L3 everywhere and keeps blocking notices · `release` restricts · effective level = most restrictive, notice = most severe · flow always continues · suppressed items listed · feature flags only lower · profile badge in dev · profile recorded in reports | E17, E18; P3, P4; Q-01 |
| [ ] | FR-18 Birth module | Opt-in in release · local-only, "remember" off by default · echo of longitude/time zone · ambiguity handled · three capped blocks reported separately with trace · diagnosis unchanged with module on/off · wording is tendency-only with N-BIRTH | E8; P1 |
| [x] | FR-18 (engine part) | Chart, weights, propagation, temporal, reference panel verified | `packages/wuxing` 74 tests (done, `58dd36b`) |
| [ ] | FR-19 Panel and offsets | Five-phase radar (+ dashed reference), organ heat-map, six-qi bars, 八綱 axes · table twins and descriptions · primary offset vs population, secondary vs personal reference with alignment · transmission hints · no red/green | U-16 tests; axe; P1 |
| [ ] | FR-20 Herb and formula knowledge | Roles, proportions, effective weights, panel effect/burden, tiers computed, verification status shown · derived herbs labelled | engine tests; KB tests |

### 4.2 Non-functional requirements

| ✔ | NFR | Acceptance checks | Verified by |
|---|---|---|---|
| [ ] | Responsive | 320 → 1920 px · no horizontal scroll · touch targets ≥ 44 px · two-pane result ≥ 900/1200 px | E-suite viewports; Playwright measurements |
| [ ] | Performance | Initial JS ≤ 200 KB gz · LCP ≤ 2.5 s · INP ≤ 200 ms (mobile 4G) · `assess` ≤ 50 ms p95 · KB per session ≈ 55–65 KB gz (release) | Q-06; E-19 |
| [ ] | Accessibility | WCAG 2.1 AA · keyboard operable · screen-reader labels in both languages · colour never the only signal · figures with table twins | Q-05; §6 |
| [ ] | i18n | zh-Hant default · key coverage 100 % · fonts with fallbacks · `lang` attributes | `check-i18n`; Q-07 |
| [ ] | Privacy | No PII to any server · local storage only · erase everything · no birth data in URLs/logs · no analytics | Q-08; E14, E19, E20 |
| [ ] | Security | Strict CSP · no third-party scripts · dependency audit · no HTML injection | `check-release`; R-05 |
| [ ] | Configuration | Release build fails CI if it ships the dev profile; dev profile test (all L3, blocking notices kept) | R-03; P4 |
| [ ] | Content integrity | 100 % of recommendations cited · KB versioned · reports record KB version, params fingerprint, profile | engine tests |
| [ ] | Testability | Golden cases · parity · self-test · i18n · a11y; wuxing keeps its 74 tests | CI |
| [ ] | Browser support | Last 2 versions of Chrome, Safari (iOS), Firefox, Edge on E1/E2/E9/E10 | Q-04 |
| [ ] | Maintainability | Content, engine, UI separated; a data change needs no engine/UI change | review of layering lint |

---

## 5. Release go / no-go checklist

### 5.1 Technical
- [ ] Tag build from `main`; CI fully green (fast, build, integration)
- [ ] `check-release.ts` passes on the release output; profile embedded = `release`
- [ ] Bundle budgets met; Lighthouse (mobile) Performance ≥ 90, Accessibility ≥ 95
- [ ] No open S1/S2 defects
- [ ] SBOM and dependency licence report attached; `pnpm audit` has no unaddressed high/critical issues

### 5.2 Safety
- [ ] Safety vignette suite green; properties P3, P4, P7, P8, P10 green
- [ ] Every red-flag item and every blocking population/condition shows the right notice in **both** profiles' tests and in the release build manually (A, B, minor, pregnant, lactating, serious disease)
- [ ] Emergency numbers for the target region verified against the data file
- [ ] Suppressed items are listed with reasons in a manual run (pregnancy, anticoagulant, allergy)

### 5.3 Content
- [ ] Review records valid for every area enabled at the release level ([content review §7](docs/content-review.md)), **or** a beta exception recorded with the draft label on
- [ ] KB coverage report attached (counts by status per area); known gaps listed in the release notes
- [ ] Golden-case concordance reported
- [ ] Wording lint clean on catalogs and KB prose; no forbidden wording

### 5.4 Accessibility
- [ ] axe clean across the route × language × theme matrix
- [ ] Manual pass (§6) done on this build
- [ ] Reduced motion, 200 % zoom, text-size presets verified

### 5.5 Privacy and legal
- [ ] Privacy tests green; hosting log behaviour confirmed; public privacy statement matches this build
- [ ] Legal sign-off on disclaimers, claims and store/marketing copy
- [ ] Attribution and licence screen complete (sources, CC-BY data if any); `NOTICE` current

### 5.6 Operations
- [ ] Headers verified on staging (CSP, caching, `nosniff`, referrer, permissions)
- [ ] Smoke tests pass on staging and again after promotion
- [ ] Previous artifact retained; rollback rehearsed
- [ ] Changelog and release notes complete (versions: app / KB / engine / parameters; KB changes; safety changes; known issues)
- [ ] Issue templates and the safety-report channel live

---

## 6. Manual accessibility pass (per release)

Record device, OS, browser and AT versions with the result.

| Flow | VoiceOver iOS | TalkBack | NVDA + Firefox/Chrome | Keyboard only |
|---|---|---|---|---|
| Landing → acknowledge → start | [ ] | [ ] | [ ] | [ ] |
| Profile (medications, allergies) | [ ] | [ ] | [ ] | [ ] |
| Blocking notice: focus lands on the heading, acknowledge works, focus restored | [ ] | [ ] | [ ] | [ ] |
| Inquiry: question, severity, "why am I asked", skip | [ ] | [ ] | [ ] | [ ] |
| Tongue: zone buttons and checklist twin stay in sync | [ ] | [ ] | [ ] | [ ] |
| Pulse: exclusive groups announced | [ ] | [ ] | [ ] | [ ] |
| Result: radar description and table toggle; heat-map table; trace list; citation sheet | [ ] | [ ] | [ ] | [ ] |
| Formula detail table | [ ] | [ ] | [ ] | [ ] |
| History compare | [ ] | [ ] | [ ] | [ ] |
| Settings → erase everything dialog | [ ] | [ ] | [ ] | [ ] |

Also: colour-blindness simulation of panel visuals · 200 % zoom without loss · text-size presets · high-contrast mode · reduced motion · language attribute announced correctly for mixed `zh-Hant`/`en` runs.

---

## 7. Content sign-off (per review record)

- [ ] Reviewer role, credential (with consent), date, KB version, scope recorded ([content review §5](docs/content-review.md))
- [ ] Every changed medical value has a citation or an "expert judgement" note
- [ ] Disagreements and dissent recorded; the more restrictive position ships
- [ ] Affected golden cases re-run; differences explained
- [ ] Statuses in `data/` set by the build from the record (not by hand); content hash matches the shipped content
- [ ] For safety rules/red flags: physician **and** a second reviewer (pharmacy or TCM clinical)

---

## 8. Sign-off

| Gate | Name / role | Date | Notes |
|---|---|---|---|
| Content owner | | | |
| Physician reviewer | | | |
| TCM clinical reviewer | | | |
| Pharmacy reviewer | | | |
| Linguistic reviewer | | | |
| Legal / regulatory | | | |
| Release manager | | | |
