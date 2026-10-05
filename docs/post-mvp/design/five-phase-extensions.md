# Design: Five-Phase Extensions

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design for Release C (FR-31; tasks PM-26 … PM-29). Nothing is built |
| **Last updated** | 2026-10-05 |
| **Audience** | Engineers, the clinical content owner (school choices) |
| **Related** | [Requirements FR-31](../requirements.md#fr-31-five-phase-extensions--release-c--class-n-or-c-by-item--refines-algorithm-spec-14) · [Algorithm spec §9, §14](../../wuxing-algorithm.md) · [PRD FR-18](../../PRD.md#fr-18-birth-based-five-phase-module--p1-new) · [Decisions W-1 … W-7, Q11](../decisions.md) |

> **Summary.** The five-phase module (`@tcm/wuxing`) computes a birth chart, an annual block, the classical five periods and six qi, and the season, and the engine uses them as a bounded, opt-in prior. Four things in its open-items list are worth doing: the **season for people in the southern hemisphere** (today the season is the northern one for everyone), **both hour pillars when a birth time is close to a boundary**, **regenerating the astronomy tables in the repository** instead of inheriting them, and **showing which 長夏 model a result used**. None changes what the app claims; each makes a stated assumption either correct for more people or visible. One rule protects the history people have already saved: a new parameter with its default value must leave the parameter fingerprint unchanged.

---

## 1. Goal and non-goals

**Goal.** Close the four open items of [algorithm spec §14](../../wuxing-algorithm.md) that affect correctness or honesty, without changing any current result.

**Non-goals.** Julian-calendar dates (still rejected, W-6); the guest-and-host qi modifier (客主加臨) and interaction of annual and natal branches (W-7); flipping the *birth chart* or the annual yunqi, which are calendar constructs; changing which model is the default; claims about climate.

## 2. What exists today

| Fact | Consequence |
|---|---|
| The season is chosen from the apparent solar longitude: spring from 立春, summer from 立夏, **長夏** from 小暑, autumn from 立秋, winter from 立冬 (model `changxia`, default); the alternative `tuwang18` gives 土 the 18 days before each season change | The mapping is northern; nothing in the engine or the app mentions a hemisphere |
| The source engine had a hard "no flip" rule; the algorithm spec lists the hemisphere as an open decision | A flip is a new behaviour, not a parity item |
| The hour pillar comes from **true solar time** (longitude × 4 min, plus the equation of time); the engine reports corrections, a fold/gap resolution for daylight-saving ambiguity, and the late-子 school rule; the birth card already shows a *which of the two times* choice for a clock fold | A second kind of ambiguity can reuse the same component |
| Births are usually recorded to 5 or 15 minutes, so a time within about 15 minutes of an odd hour is genuinely uncertain, and a quarter of all births fall in such a window | The hour pillar, and under the 子 rules the day pillar, can be wrong for them |
| `vsop87-earth.ts` was taken over from the author's earlier engine; its header names the official archive (`VSOP87D.ear`, CDS/VizieR VI/81 and IMCCE) and a pinned SHA-256, and says regenerating it here is open | The data cannot be reproduced from this repository |
| `seasonModel` is already recorded in every saved result; the parameter fingerprint covers the profile parameters | A change to parameters can split a person's history into segments (the [trends design](export-follow-up-trends.md) breaks series at a fingerprint change) |

## 3. The additive-parameter rule

New parameters in this design (a hemisphere basis, an hour margin) have defaults that reproduce today's behaviour. **A parameter at its default value is left out of the canonical form from which `paramsFingerprint()` is computed**, so the fingerprint of every existing saved result stays equal to the current one. A golden-string test pins the fingerprint of the current default parameters; it must pass unchanged after each task. Only a person who *chooses* a non-default value gets a different fingerprint, which is true: their results were produced by different parameters.

## 4. Southern-hemisphere seasons (FR-31a, PM-26)

### 4.1 What flips and what does not

| Part | Behaviour |
|---|---|
| **Season block** (the commanding element now and the four coming seasons, and the season used for susceptibility and advice) | For the southern basis the solar longitude is shifted by 180° before the lookup, so the season commanded is the one the person *experiences*. For the northern basis nothing changes |
| **Birth chart** (pillars, innate weights) | Unchanged: the Chinese calendar and the solar terms are astronomical events, the same for everyone |
| **Annual block and 五運六氣** | Unchanged: they are defined by the calendar year and the year's stem and branch; the classical climate claims they carry belong to the tradition's own latitude, so they stay *calendar* references (declared as such) |

This choice — flip the experienced season, keep the calendar constructs — is the **clinical content owner's** to confirm; engineering's default follows it and records it.

### 4.2 The person's choice

A `seasons` preference with three values: **northern calendar** (default), **southern hemisphere**, **don't use seasons** (for the equatorial tropics, where the four seasons are not the climate; the engine's season block can already be switched off).

| Piece | Design |
|---|---|
| Default | `south` when the device time zone is on a short list of southern zones (`Australia/*`, `Pacific/Auckland` and similar, `Africa/Johannesburg`, `America/Sao_Paulo`, `America/Argentina/*`, `America/Santiago`, …), else `north`; the list is data, tested |
| Where it is shown | Always labelled on the result: *Season: spring (northern calendar)*, with a link *Seasons differ where I live*; and in Settings → *Seasons* |
| Where it is stored | The `seasons` preference (low sensitivity) and a stamp on every saved result, so a result is explained as it was made |
| Engine | `ReferenceInput.hemisphere?: "north" \| "south"` and a pure `seasonOf(longitude, model, hemisphere)`; with `"off"` the existing `enable.season = false` is used |

### 4.3 Honest limits

The model does not know the climate where the person is; it knows the calendar and a choice. The interface says so in one sentence beside the choice, and the equatorial option exists because the other two would be wrong there.

## 5. Both hour pillars near a boundary (FR-31b, PM-27)

`hourAlternatives(input, marginMinutes)` is a pure function in `@tcm/wuxing`.

| Step | Rule |
|---|---|
| Distance | The distance, in minutes of true solar time, from the birth time to the nearest hour boundary (23, 1, 3 … o'clock) |
| Ambiguous? | When the distance is under the margin (default **15**, a `[calibrate]` parameter) |
| Alternative | The chart at the other side of that boundary gives the **alternative hour pillar** and, when the boundary is the 子 start and the school rule moves the day (`lateZiNextDay`, `split`), the alternative **day pillar** too |
| Output | `{ ambiguous, minutesFromBoundary, side, primary: { day, hour }, alternative: { day, hour } \| null }`, with the rule used |

Screen: the birth card's echo adds, when ambiguous, the same kind of choice the clock-fold case has — *Your time is within about 15 minutes of the change between the 子 and 丑 hours. Which is nearer the truth?* — with **the computed hour** (kept by default), **the other hour**, and **I am not sure — leave the hour out** (the existing unknown-hour path, which drops the hour pillar without compensation). The choice is part of the birth input held in memory; a saved result records which was used (`primary`, `alternative`, `unknown`) and that it was ambiguous.

Why keep the computed hour by default: a quarter of birth times fall in a window, and leaving the hour out for all of them would discard information to avoid a risk the note already makes visible; the person can change it in one click. Revisit with the usability round.

## 6. Regenerating the astronomy tables (FR-31c, PM-28)

| Aspect | Design |
|---|---|
| Script | `scripts/astro/gen-vsop87.ts` (Node, no dependency). It takes the archive path as an argument, **verifies its SHA-256 against the value pinned in the file header, and refuses on any difference**; it parses the archive's term blocks, applies the same truncation thresholds as today (|A| < 1e-9 for L, 1e-8 for R), and writes `vsop87-earth.ts` with the header recording the archive names, URLs and hash |
| Download | **Needs the owner's approval first** (PD-11): filename `VSOP87D.ear`, source `https://cdsarc.cds.unistra.fr/ftp/cats/VI/81/VSOP87D.ear` (or the IMCCE mirror named in the header), and the exact size read from the server when the request is made. Nothing is downloaded by the script itself |
| First run | The generated terms are compared with the committed ones **numerically** (same counts, 818 for L and 213 for R; every coefficient within 1e-12 relative), because the original generator's number formatting is unknown. If they agree, the generated file replaces the committed one, so from then on regeneration is byte-identical and a test checks it |
| Verification | The existing checks stand: oracle parity (10 births and 168 solar-term instants), HKO's 240 solar terms within 60 seconds, calendar anchors, invariants |
| Result | The data is reproducible from the official source in this repository; the open item in the spec is closed and the note in the file header is removed |

## 7. The 長夏 model, declared (FR-31d, PM-29)

`seasonModel` (`changxia` default, `tuwang18`) is a school choice recorded in every saved result. The design makes it **visible**: the season section of a result states the model in a line ("長夏 counted as its own season") with a plain explanation reachable from it, and the practitioner summary and the summary file carry it. The **development profile** can switch the model (to test both); the **release profile shows the declared one and offers no switch** (Q11 stays decided until calibration). Switching in dev is a parameter change and so a different fingerprint.

## 8. Review class and rollout

| Item | Class | Note |
|---|---|---|
| Southern hemisphere | **C (light)** | The clinical content owner confirms what flips and what does not; the engine and wording follow. A new `[calibrate]` entry records it |
| Hour alternatives | N | Presentation and an engine function; no new clinical statement. The wording of the choice is class L |
| Astronomy data | N | Verified numerically against the official source; no behaviour change |
| Declared season model | N / L | Wording |

All four stay behind the draft label with the rest and respect the additive-parameter rule: results made before and after are in the same history series unless a person chose a non-default value.

## 9. Tests

| Layer | Test |
|---|---|
| Fingerprint | The fingerprint of the current default parameters is pinned as a string; it is unchanged by each task |
| Property | `seasonOf(λ, model, "south") = seasonOf(λ + 180°, model, "north")` for every longitude and both models; the northern basis returns today's value for every instant of a century; flipping never changes a chart |
| Boundary | `hourAlternatives` at distances of 14, 16 minutes before and after each odd hour, and at 23:00 under each of the three late-子 rules (the day pillar changes only where the rule says); unknown hour is unaffected |
| Data | Generated and committed VSOP terms agree to 1e-12; regeneration is byte-identical after the first replacement; oracle parity, HKO and anchor tests pass unchanged |
| Component | Seasons setting and the label on a result in both languages; the birth-card choice and its three outcomes; the declared model line; the dev switch exists only in dev |
| End to end | A southern time zone sees the flipped label by default; choosing *don't use seasons* removes the season block; E8 with a near-boundary birth time |

## 10. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release C.**

| Question | Default |
|---|---|
| What flips for the southern hemisphere | The experienced season only; birth chart, annual block and yunqi stay calendar references (clinical owner to confirm) |
| Default basis | Northern calendar, except on a listed southern time zone |
| Equatorial tropics | An explicit *don't use seasons* option |
| Hour margin | 15 minutes |
| Default for an ambiguous hour | Keep the computed hour, with a note and a one-click alternative |
| 長夏 switch in release | None; declared only |
| Regeneration | Numerical comparison first, then replace and pin; needs a download approval |

## 11. Tasks

PM-26 (hemisphere, preference, labels), PM-27 (hour alternatives and the choice), PM-28 (the generator; needs the approval), PM-29 (declared model) — [`TASKS.md`](../../../TASKS.md).

## 12. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design |
