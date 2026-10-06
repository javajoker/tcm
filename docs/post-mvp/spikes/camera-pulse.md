# Spike: Camera Pulse and Heart-Rate-Strap Prefill (FR-33, PM-31)

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | **Protocol written and fixed; the spike has not been run.** It cannot be run from this repository: it needs a reference device, volunteers who have consented, several phones and an ethics approval — see [§7](#7-what-is-needed-before-it-can-run) |
| **Last updated** | 2026-10-06 |
| **Audience** | The owner (approvals, devices, volunteers), whoever runs the measurements, reviewers |
| **Related** | [Research tracks §1, §3](../design/research-tracks.md) · [Tap-tempo design](../design/tap-tempo-and-regions.md) · [Requirements FR-33](../requirements.md) · [Decisions Q4, PD-10, PD-11](../decisions.md) · [Privacy](../../privacy.md) · [Tech spec §11](../../tech-spec.md) |

> **Summary.** The question is narrow: *can a fingertip over a phone's camera give a resting heart rate within ±3 beats per minute of a reference, in a browser, on common phones — and say "not enough to tell" whenever it cannot?* The answer is unknown. This document fixes, **before any measurement exists**, what will be measured, on what, how a trial counts, what passes and what stops the track. It is not edited after a result exists: a change of a criterion is a new version with its reason, and results are reported against the version they were fixed under. Nothing here changes what the app does today.

---

## 1. Objective and what the spike is not

**Objective.** Estimate the **resting pulse rate** from the camera signal of a fingertip held over the rear camera (with the torch where the browser can switch it on), and from a Bluetooth heart-rate strap, to **prefill the same rate field** that the 30-second timer and the tap-tempo already fill ([design](../design/tap-tempo-and-regions.md)). The person confirms or corrects the number; only the number reaches the engine, with the quality class the typed rate has today.

**Not part of the spike, and never of the feature:**

- the classical pulse *qualities* (浮沉遲數虛實…): a camera cannot see them, and nothing here claims to;
- rhythm diagnosis, atrial-fibrillation detection, heart-rate variability or any "heart health" statement: at most a **regularity hint** (a coarse flag that the beat-to-beat intervals vary a lot) is in scope, worded as a reason to count again, never as a finding;
- storing or sending a frame, a waveform or a device identifier: **nothing is stored and nothing is sent**; the signal lives in memory for the length of the trial;
- any change to the diagnostic engine, the findings model or the quality coefficients.

## 2. The measurement

### 2.1 Reference

One of: a **chest strap** that reports beat-to-beat intervals (R–R) from the electrical signal, or a **fingertip pulse oximeter** with a beat-to-beat output. Each trial's reference rate is the mean rate over **the same 30-second window** as the camera estimate, from the R–R intervals (rate = 60 000 / mean R–R in ms). The reference is recorded by the person running the trial, not by the app. A trial is discarded, and reported as discarded, when the reference itself is unreliable (more than 5 % of its intervals flagged as artefacts by the device, or the reference rate changes by more than 8 bpm within the window).

### 2.2 Devices

| Class | Needed | Why |
|---|---|---|
| Android phones in Chrome, torch available | at least **three models**, spanning low, middle and high price | The only class where the browser can switch the torch on; the likeliest to work |
| iPhones in Safari | at least **two models** | No torch control in the browser: the fingertip is lit by ambient light only. The expected outcome is a poor signal; the finding "not available there" is a result |
| Other (Firefox on Android, a desktop webcam) | one each, to record that the feature is hidden or declines | A feature that works on one platform family is acceptable only if it is **labelled as such** and absent elsewhere |
| Heart-rate strap over Web Bluetooth | one or two straps with the standard Heart Rate service, on Chrome (Android and desktop) | Chromium-only; needs its own permission |

### 2.3 Participants and conditions

**At least 20 volunteers at rest**, who have given informed consent under an approval for research on people (a gate: [§7](#7-what-is-needed-before-it-can-run)); or, as the owner decides, recordings that volunteers make themselves under this protocol with the same consent. Each volunteer does **at least three trials of 30 seconds** per device and condition, seated, after five minutes of rest. Conditions that are varied and **reported as strata**:

| Stratum | Levels |
|---|---|
| Device | each model separately, and the class |
| Light | dark room · ordinary indoor light · bright (window or lamp) |
| Skin tone | Fitzpatrick types I–II · III–IV · V–VI (self-assessed on the scale, never photographed) |
| Finger pressure | light · as instructed · hard (deliberately) |
| Motion | still · slight movement (deliberately) |
| Resting rate | below 60 · 60–80 · 80–100 · above 100 |

No stratum may be dropped from the report because it looks bad.

### 2.3.1 Safety of the trial

The torch warms the finger and the phone. A trial is at most 30 seconds, and the instructions say to **stop if it feels warm** and not to press hard. The volunteer can stop at any time. Phone temperature is noted at the start and the end of the longest trials; a rise that a volunteer reports as uncomfortable is a finding and counts against the instructions' safety ([§4](#4-pass-criteria-and-stop-conditions)).

## 3. The estimator, and the rule that decides whether to answer

The spike's baseline, in plain TypeScript, with no dependency and no model file:

1. take the mean of the red channel (and of the green channel, reported separately) over a central region of each frame, with the frame timestamps (the frame rate is not assumed to be constant);
2. resample evenly, remove the slow trend, band-pass 0.7–3.5 Hz (42–210 beats per minute);
3. estimate the rate in two ways — the **spectral peak** over the window, and the **median inter-beat interval** from peaks with a refractory period — and compare them;
4. compute a **signal-quality index** from: the prominence of the spectral peak, the agreement of the two estimates, the stability of the beat amplitude, the share of saturated or clipped frames, and the stability of the frame rate;
5. **answer only if the index is above a threshold; otherwise say "not enough to tell"** and offer the timer or the tap — never a guess.

The threshold and any other tuned constant are chosen on a **development split** of the volunteers (about a third, by volunteer, fixed before the first trial is analysed) and then **frozen**; the report's numbers are on the held-out volunteers only.

## 4. Pass criteria and stop conditions

**Fixed before any result exists.**

| | Criterion |
|---|---|
| **Accuracy** | Among trials where a rate was given, at least **90 % are within ±3 beats per minute** of the reference (the tolerance the tap-tempo estimator is held to), **on every device tested**, and the 95th percentile of the absolute error is at most **6 beats per minute** |
| **Coverage** | A rate is given in at least **60 %** of trials on every device (a feature that says "not enough to tell" more often than that is not useful) |
| **No hidden stratum** | In every stratum of [§2.3](#23-participants-and-conditions) with at least 15 trials, accuracy is at least **80 %** within ±3 and coverage at least 40 % — and the report says which strata are below the pass line |
| **Honest refusal** | Among trials where the estimate was off by more than 6 beats per minute, the share where the app **gave a number anyway** is at most 5 % of all given numbers: a wrong answer that is not flagged is worse than no answer |
| **Instructions** | At least 90 % of volunteers place the finger correctly, without help, after reading the instructions once; no volunteer reports discomfort from heat or pressure that the instructions could have avoided |
| **Strap** | Over Web Bluetooth the rate shown equals the strap's own display (to the integer) in at least 95 % of connections that succeed; the connection succeeds on first try in at least 80 % of attempts on the supported browsers; a lost connection is reported, never silently replaced by an old value |

**The spike stops** — and ends in a report whether or not anything succeeded — when:

- accuracy or coverage is below the line on a **common** device class (a class that a large share of the app's phones belong to);
- the instructions are unsafe or confusing as measured above;
- anything in the design reads **more into the signal than a rate and a regularity hint**;
- a **permission or content-security-policy change** is needed that cannot be justified in the tech spec for the whole app (the camera is denied by the current Permissions-Policy; Web Bluetooth would need its own entry);
- any approach needs to **store or send** frames, waveforms or a device identifier;
- an approval a step depends on is refused or lapses.

## 5. What a "go" and a "no-go" mean

A **go** is not a feature. It is a decision to write a requirement with a review class, a privacy and legal review and its own design, **before any production code**; the spike's code is not the product. A **no-go** is closed with this report kept; the track is reopened only by new evidence.

Whatever the result, the report states **which platforms** would get the feature: where the browser cannot (no torch control, no Web Bluetooth) it is hidden, and the timer and the tap remain.

## 6. The report that ends the spike

`docs/post-mvp/spikes/camera-pulse-report.md`, against this version of the protocol: method as run (including every deviation), the devices and volunteers (counts, strata, discarded trials and why), per-device and per-stratum tables of accuracy, coverage and error (Bland–Altman data, not only the summary), the behaviour of the quality index on the held-out volunteers, the strap results, every failure case, and a recommendation: go, no-go, or go for a named platform class only. The decision is recorded in the [decision register](../decisions.md).

## 7. What is needed before it can run

None of this is in the repository, and none of it can be made there.

| Need | From |
|---|---|
| A reference device with beat-to-beat output (a chest strap with R–R, or a pulse oximeter), and the Bluetooth heart-rate straps for the second part | The owner |
| Android phones (three models) and iPhones (two), with the browsers named above | The owner, or volunteers' own phones |
| Volunteers, a consent form, an information sheet, and **an approval for research on people** | The owner, and an ethics board or equivalent |
| A legal view on whether a heart-rate display by a health-related web app changes its positioning | A legal adviser |
| A reviewer for the wording of the instructions (class L) | The linguistic reviewers |
| The decision whether recordings by volunteers themselves, under this protocol, are acceptable | The owner |

No file needs to be downloaded: the estimator is written in the repository, and the protocol needs no dataset or model.

## 8. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-06 | Protocol fixed before any measurement; status: not run, needs the items of §7 |
