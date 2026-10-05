# Design: Tap-Tempo Pulse and Region Packs

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design for Release A (FR-28 and FR-29; tasks PM-11 and PM-12). Nothing is built |
| **Last updated** | 2026-10-05 |
| **Audience** | Engineers, the safety content owner, regional verifiers |
| **Related** | [Requirements FR-28, FR-29](../requirements.md#fr-28-tap-tempo-pulse--release-a--class-n--refines-fr-6-uq3) · [Safety policy §5](../../safety-policy.md) · [UX spec §4.7](../../ux-spec.md) · [Decisions Q1, SQ1, UQ3](../decisions.md) |

> **Summary.** Two small features that share a release. *Tap-tempo* adds a second way to enter the resting pulse rate: tap in time with the beat, and a pure estimator turns the taps into a rate with outlier rejection, saying "not enough to tell" instead of guessing. *Region packs* turn the emergency numbers from a Taiwan default into data with a verification record: numbers are shown only for a region the person chose or whose time zone matches, a public build lists only verified regions, and everyone else sees "call your local emergency number". The second is a safety change and is written as one.

---

## Part 1 — Tap-tempo pulse (FR-28)

### 1.1 Today

The pulse screen takes a typed rate or a 30-second timer after which the person types the number of beats counted and the screen doubles it. The rate becomes `P_RAPID` or `P_SLOW` (or both absent) by the bands in the pulse data (`rate_bands.rapid_gt`, `slow_lt`) with the quality class *measured*; the rhythm is chosen by the person. Counting a pulse for half a minute is hard for some people; tapping along with a felt beat is easier.

### 1.2 Estimator

A pure module (`apps/web/src/screens/observe/tapTempo.ts`, no DOM) takes the tap times in milliseconds (`event.timeStamp`; the constant input latency of a device cancels in the intervals) and returns a result. Constants are exported and tested.

| Step | Rule |
|---|---|
| Intervals | Differences between consecutive taps |
| Plausible range | Keep 250–2 000 ms (240 down to 30 beats per minute); drop the rest |
| Outliers | Drop an interval below 0.4 or above 2.5 times the median of the plausible ones (a double tap, a missed beat) |
| Enough? | At least **12 taps** and at least **8 valid intervals**, else `too-few` |
| Rate | `60 000 / median(valid intervals)`, rounded to a whole number |
| Steady? | Spread = standard deviation ÷ mean of the valid intervals. Above **0.25**: `too-uneven`, no number is produced |
| Near an edge | Within **3 beats per minute** of a band edge (`rapid_gt`, `slow_lt`): `near-edge` — the screen says the result is close to the line and suggests another try or the 30-second count; the person decides |
| Uneven hint | Spread above **0.12** (and a number was produced): a hint, never a decision — "your taps were uneven; if you also feel beats skip, choose that below" |

Result: `{ status, rate | null, valid, spread, unevenHint }`. The thresholds are provisional constants of the interface, with the same standing as other `[calibrate]` values: they are tested against simulated taps and revisited with usability evidence (round R2).

**Why the tolerance is ±3, not ±2:** a person tapping to a felt beat jitters by roughly 20–40 ms per tap; the median of eleven intervals at 75 beats per minute then errs by about 2–3 beats per minute. Claiming better would be false precision next to a band edge, which is why `near-edge` exists.

### 1.3 Screen

- A large *Tap with each beat* button (at least 44 px, in practice most of the width), a visible tap count, *Start over*, and *Done* enabled from 12 taps; the run ends by itself at 30 taps. The rate is shown only after *Done*, so the running number cannot bias the taps.
- Instructions in words: find the pulse at the wrist, tap each time a beat is felt, keep going for 15–20 beats. The existing educational note and the *stop if you feel unwell* line stay.
- **Keyboard and assistive technology:** the button works with Space and Enter (key repeat is ignored); the count is visible and *not* announced beat by beat (that would drown the person); the result and any message are announced once (`role="status"`). The typed rate and the 30-second count stay for anyone who cannot tap.
- **Reduced motion:** no animation on tap; a brief change of the button's colour only, off under `prefers-reduced-motion`.
- The result fills the same rate field as the timer does and the person can still edit it. The method is recorded beside the rate (`observe.pulse.method`: `typed`, `timer` or `tap`, additive and optional) and shown in the review screen and the practitioner summary; the quality class stays *measured*, as for the timer, because both are clock-based.

### 1.4 Tests

| Layer | Test |
|---|---|
| Unit | Known sequences (steady, with a double tap, with a missed beat, too short, too uneven, near an edge) give the expected status and rate |
| Property | Simulated steady taps at 40–140 beats per minute with jitter up to 30 ms give a rate within ±3 in at least 95 % of 1 000 runs; random intervals never produce a number above spread 0.25 |
| Component | Keyboard operation, no repeat on a held key, no per-tap announcement, result announced once, edit after use, reduced motion |
| End to end | Tapping through the pulse screen fills the field; the review screen shows the method |

## Part 2 — Region packs (FR-29)

### 2.1 Today

`data/safety/emergency.json` has 12 regions (TW, HK, MO, CN, JP, SG, US, CA, GB, EU, AU, OTHER), **all `draft`**, and a `default_region` of `TW`. The screens that show the numbers (`NoticeScreen`, the result banner) pass `EmergencyNumbers` the person's region preference or, when there is none, the data's `default_region`, so **a person with no preference is shown Taiwan's numbers wherever they are**. The component adds a note that the numbers are unverified. The safety policy says a wrong number is a safety incident and that every row awaits a regional verifier.

### 2.2 The change in behaviour (a safety change)

**Rule.** Numbers are shown for a region only if the person chose it, or the device's time zone matches one of the region's declared time zones. Otherwise the generic line is shown — *call your local emergency number* — with the region selector. There is no silent default.

Why: Taiwan-first stays true in effect (a device in `Asia/Taipei` gets Taiwan's numbers with no click), a person elsewhere is never shown a foreign number as if it were theirs, and the Simplified-Chinese interface needs no special case ([design](simplified-chinese.md)): the language implies nothing (PD-02). The time zone is read locally and used only to preselect; the region name is always shown above the numbers with a *Change* control, because a traveller's device can lag.

`resolveRegion(pref, timeZone, rows)` is a pure function with a table test: preference wins; else the first row whose `timezones` list contains the zone; else the generic row. The `default_region` field is removed from the data, its schema and its checks.

### 2.3 A region pack is a row

No new file. A row of `emergency.json` gains:

| Field | Meaning |
|---|---|
| `status` | `draft` or `verified` (as today, now enforced) |
| `verification` | `{ by, at, source, scope }`: the role of the verifier (a name is optional in a public repository), the date, where the numbers were checked, and whether it covers emergency numbers, crisis lines or both |
| `timezones` | IANA zones that select the region (`Asia/Taipei` for TW; several for CN, US, AU …) |

The notice wording stays in the [safety policy](../../safety-policy.md) tables and the `safety` catalogue; a pack carries numbers and labels only.

### 2.4 Rules the build enforces

| Rule | Where |
|---|---|
| A row with a `verification` has a verifier, a source and a real date that is not in the future; the build warns when the date is 18 months old; `status` stays the content-review status that only review records can set | `validate_kb`, `build_emergency` |
| Every zone is a real IANA zone and selects one region only; every region but `OTHER` has a zone; `OTHER` lists no number, zone or verification | `validate_kb` |
| In a build **with the draft label**, draft rows may ship, with the existing *unverified* note | `bundle-data` |
| In a build **without** the draft label, only verified rows ship (plus `OTHER`, which has no numbers); a draft row in the bundle, or a verification older than 24 months, fails the build (rule 12) | `bundle-data` prunes; `check-release` fails |
| The region list in the interface is built from the bundle | web app |
| The numbers' age is visible: under a verified region's numbers the screen says *These numbers were last verified <date>*; an unverified row says it awaits verification | web app |

### 2.5 Verification workflow

A verifier who lives in the region checks each number against an official source and records it in a pull request that changes only that row; CODEOWNERS routes `data/safety/emergency.json` to the safety content owner. Hong Kong is the first candidate, because it shares the Traditional-Chinese interface and the existing draft row; **no row is marked verified without a verifier**, and engineering cannot supply one. Until a row is verified, a public build shows the generic line for that region — safe and honest.

### 2.6 Implementation impact on the MVP

The Taiwan default is relied on in places that change with this task: the screening and notice unit tests and vignette views that expect numbers with no preference, the end-to-end scenarios E2 to E6 (which will set the browser time zone to `Asia/Taipei`), and the safety policy §5 sentence *Default Taiwan*, which is rewritten in the same commit. The vignette suite gains cases: matching zone, other zone, no zone, preference over zone, unverified region in a non-draft build.

### 2.7 Tests

| Layer | Test |
|---|---|
| Unit | `resolveRegion` table; pruning of draft rows with and without the draft label; staleness rules |
| Component | The generic line and selector with no match; the region name and *Change* above numbers; crisis lines follow the same region |
| Release | `check-release` fails on a draft row in a non-draft bundle (seeded violation) |
| End to end | Time zone `Asia/Taipei` shows Taiwan's numbers on a blocking notice with no preference; `America/New_York` shows the generic line; choosing a region persists it |

## 3. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release A.**

| Question | Default |
|---|---|
| Show a region's numbers by time zone? | Yes, to preselect only, with the region named and a *Change* control |
| Keep a default region? | No: the Taiwan default becomes a time-zone match |
| Unverified rows in a public build | Never shipped |
| Verification age limit | Warn at 18 months, fail a public build at 24 |
| Tap-tempo: minimum taps, spread limit, edge margin | 12, 0.25, 3 beats per minute; provisional until usability round R2 |
| Mark the rate as less accurate when tapped? | No: same class as the timer; the method is recorded and shown |

## 4. Tasks

PM-11 (estimator, screen, method field, tests), PM-12 (row fields, `resolveRegion`, pruning and rules, safety-policy amendment, test updates) — [`TASKS.md`](../../../TASKS.md).

## 5. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design |
