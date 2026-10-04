# Release-candidate dry run — 2026-10-04

A pass over the [go / no-go checklist](../CHECKLIST.md) §5 on commit `2ba117b` (the end-to-end scenarios of Q-04 were added afterwards: 87 runs green locally on Chrome), run on a developer machine (task R-07). It records what the automated gates say today and what is still
open, so that the first real release candidate starts from facts. **It is not the signed checklist:** nothing here was run on CI (no push has happened yet) or on a deployment, and the
human items are untouched. The verdict is **no-go for a public release; the closed-beta path (draft label on) is technically ready** once an owner has set up hosting.

Legend: ✔ done and evidenced · ◐ automated part done, rest open · ○ not started · ⛔ blocked (by what).

## 5.1 Technical

| Item | | Evidence / what is left |
|---|---|---|
| Tag build from `main`; CI fully green | ○ | The workflows (`ci.yml` with its `e2e` job, `nightly.yml`, `visual.yml`, `deploy.yml`, `rollback.yml`) are written and SHA-pinned but have never run: nothing is pushed. First push will show whether they pass; the owner must set the Cloudflare secrets, variables and environments ([release process §6](release-process.md)). |
| `check-release` passes; profile = `release` | ◐ | With the closed-beta exception (`APP_DRAFT_LABEL=on`, `--draft-label`): passes (rules 0–11, incl. `noindex`, `NOTICE.txt`, host files). Without it: **fails rule 8** — the content is `draft`, which is the honest state until the review records exist. |
| Budgets; Lighthouse mobile Performance ≥ 90, Accessibility ≥ 95 | ◐ | `check-budgets`: initial JS 120.4 / 200 KB gz · all JS 223.1 / 260 · CSS 5.5 / 20 · knowledge base per session 84.3 / 100. Lighthouse CI is configured (`lighthouserc.json`) but needs Chrome and a runner: not run. |
| No open S1/S2 defects | ◐ | None known; there is no tracker yet, and no usability round (Q-09) or beta has produced defects. |
| SBOM, licence report, `pnpm audit`, pinned actions | ◐ | `pnpm check:licenses`: 9 shipped and 358 build-time packages within the allow-list; the CycloneDX SBOM is generated; actions are pinned (a test checks it). `pnpm audit` needs the registry and is run by the CI `deps` job: not run. |

## 5.2 Safety

| Item | | Evidence / what is left |
|---|---|---|
| Vignette suite green; P3, P4, P7, P8, P10 green | ✔ | 210 test cases from 102 vignettes (most run in both profiles) pass; all twelve properties pass (P10 now runs 250 people so its non-vacuity check holds across seeds; the nightly job runs ×10 with a fresh seed). |
| Every red-flag and blocking population shows the right notice in both profiles, and in the release build by hand | ◐ | Both profiles are covered by the vignettes and the screening tests. The manual run on the release build is open. |
| Emergency numbers for the target region verified | ⛔ | Every row awaits verification by the regional owner ([safety policy](safety-policy.md)); no region is confirmed. |
| Suppressed items listed with reasons in a manual run | ◐ | Covered by tests (pregnancy, anticoagulant, allergy); the manual run is open. |

## 5.3 Content

| Item | | Evidence / what is left |
|---|---|---|
| Review records valid for every enabled area, or a beta exception with the draft label | ⛔ | No review record exists (V-01…V-04 need the reviewers). The beta exception needs recording by the owner; the build then ships `noindex` with the draft label. |
| KB coverage report; known gaps | ◐ | Counts are in [`data/README.md`](../data/README.md): 703 herbs (609 derived, 94 curated), 33 formulas (9 + 18 + 5 verified against a source, 1 partly), 23 patterns, 184 symptoms, 36 questions, 127 citations (all verified), 26 safety rules. A per-status table in the release notes is still to write. |
| Golden-case concordance reported | ◐ | `pnpm golden`: 30 cases, all synthetic, **0 agreed by a practitioner**; held-out pattern top-3 77 % (target 80 %), formula top-3 50 % (target 70 %), 30 of 100 cases. Targets are not met and not blocking until M3 (V-05). |
| Wording lint clean | ✔ | `check-i18n`: 0 errors, 5 length warnings; glossary conformance and the English-prose lint pass (`pnpm test:kb`). The linguistic review itself (I-06, V-06) is open. |

## 5.4 Accessibility

| Item | | Evidence / what is left |
|---|---|---|
| axe clean across the route × language × theme matrix | ✔ | The jsdom accessibility sweep passes (491 web tests), and so does axe in a real browser, colour contrast included, on every screen of the flow in light and dark (`e2e/e21-axe.spec.ts`, Chrome, 2026-10-05). |
| Manual pass (§6) on this build | ○ | Needs people with VoiceOver, TalkBack and NVDA ([accessibility protocol](accessibility-protocol.md), template in `docs/a11y-records/`). |
| Reduced motion, 200 % zoom, text-size presets | ◐ | Covered by tests and CSS; not verified on a device. |

## 5.5 Privacy and legal

| Item | | Evidence / what is left |
|---|---|---|
| Privacy tests green; hosting log behaviour; privacy statement matches the build | ◐ | The privacy tests pass (they found and fixed a birth-moment leak in saved results). The hosting log behaviour can only be confirmed on the real host. |
| Legal sign-off | ⛔ | V-07. |
| Attribution and licence screen; `NOTICE` current | ◐ | Sources screen and `NOTICE.txt` ship (checked by rule 10); the city list (K-10, CC BY 4.0) is not added, so no attribution for it is needed yet. |

## 5.6 Operations

| Item | | Evidence / what is left |
|---|---|---|
| Headers verified on staging; smoke tests on staging and after promotion | ◐ | `scripts/smoke.ts` passes against the Cloudflare-Pages emulator serving this build (`--noindex`). Real staging does not exist yet. |
| Previous artifact retained; rollback rehearsed | ○ | The *Rollback* workflow is written; it needs a first deployment to rehearse. |
| Changelog and release notes | ◐ | `CHANGELOG.md` is current under *Unreleased*; version numbers and the release notes are written at tagging. |
| Issue templates and the safety-report channel live | ◐ | Templates and `SECURITY.md` exist; the repository and the channel are not live. |

## What stands between this and a closed beta

1. An owner: repository, Cloudflare project and secrets, the recorded beta exception, the privacy and legal wording (V-07), the emergency numbers of the first region.
2. A first push, to see the CI and Lighthouse jobs run and to fix what they find.
3. People: a TCM clinical reviewer and a pharmacy reviewer (V-02…V-04), a bilingual reviewer (V-06), and assistive-technology testers for the manual pass.

None of this can be done from the repository alone.
