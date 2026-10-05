# Design: Research Tracks and What Is Not Planned

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design for Release D (FR-32 … FR-34; tasks PM-30 … PM-32). Every track begins as a spike; nothing here is promised to ship |
| **Last updated** | 2026-10-05 |
| **Audience** | Maintainers, the owner (approvals), reviewers, a legal adviser |
| **Related** | [Requirements §4, §5](../requirements.md#4-release-d--research-each-is-a-spike-first) · [Roadmap §3.4, §3.5](../roadmap.md) · [Privacy](../../privacy.md) · [Safety policy §9](../../safety-policy.md) · [Decisions Q3, Q4, Q5, PD-10, PD-11](../decisions.md) |

> **Summary.** Three ideas could make the app more useful and are *unproven*: help with reading the tongue from a photo, help with measuring the pulse rate with a camera, and keeping a synced backup in a folder the person chooses. Each is run as a **time-boxed spike with a written protocol, fixed pass criteria and stop conditions**, and each ends in a report and a go or no-go decision; a "go" becomes a requirement with its own review class and gates, a "no-go" is closed, not extended. Photo analysis is the one that changes what the product *is*, so it carries hard gates (a legal view on regulation, a privacy review, ethics approval for any new images). This document also records what is **not planned**, with reasons and what would change them.

---

## 1. How a spike works

| Part | Rule |
|---|---|
| **Objective** | One question the spike answers, written first |
| **Protocol** | Datasets or reference devices, metrics, strata, the **pass criteria and stop conditions written before any result exists** and never edited after |
| **Time box** | The size in `TASKS.md` (a large task is about four days); the spike ends then with a report whether or not it succeeded |
| **Approvals** | Anything downloaded (datasets, models, tools, browsers) is approved by the owner first with filename, source and size (PD-11); any collection of data from people needs ethics approval and informed consent |
| **Output** | A report in `docs/post-mvp/spikes/<name>.md` (method, data, numbers, strata, failures, recommendation) and a decision recorded in the decision register |
| **A "go"** | Becomes a requirement (FR-xx) with a review class (R), the privacy and legal reviews, and its own design before any production code; the spike's code is not the product |
| **A "no-go"** | Is closed with the report kept; the track is reopened only by new evidence, not by repetition |

## 2. Tongue-photo assistance (FR-32, PM-30)

### 2.1 What it would be — and would not be

A person photographs their tongue; the app **suggests** which tongue features from the existing list (`T_*` in `tongue.json`) it sees; the person **confirms or edits each one**; only confirmed selections reach the engine. The engine, the findings model and the quality coefficients stay as they are: this is an *input aid*, never a diagnosis, and it adds no new claim. The photo is analysed on the device, held in memory, and **never stored and never sent** (a stored photo is among the most sensitive data the app could hold; "save my photo" is not offered).

### 2.2 Hard gates (before the spike makes images or models part of anything)

| Gate | Why |
|---|---|
| **Legal view on regulation** | Software that analyses images to support a health judgement is regulated as a medical device in many places; this feature could change the product's regulatory class, not just its feature list. A legal adviser decides whether the *suggestion of features* stays within the positioning of [PRD §1.3](../../PRD.md#13-positioning) |
| **Privacy and security review** | Camera permission, in-memory handling, no storage, no network |
| **Datasets with a clear licence and consent** | Models need labelled images; none is assumed to exist or to be usable |
| **Ethics approval for any new images** | Photographing volunteers is research on people |
| **A clinical advisor to label** | Labels from two practitioners, with their agreement measured |

### 2.3 Platform constraints the production design would need

| Constraint | Consequence |
|---|---|
| The `Permissions-Policy` header denies the camera (`camera=()`) | It becomes `camera=(self)`. A single-page app cannot change a document's headers by in-app navigation, so a route-specific header does not work; the policy would be set for the whole app in builds that include the feature, which is low risk because only the app's own code can ask and the browser prompts the person each time |
| The strict CSP blocks WebAssembly compilation unless `'wasm-unsafe-eval'` is allowed | If a model needs it, that directive is added (it permits WebAssembly only, not JavaScript `eval`) and the change is reviewed ([tech spec §11](../../tech-spec.md)) |
| Model weights are a static asset | Lazy, content-hashed and verified like a knowledge chunk, **at most 5 MB**, cached for [offline use](offline-and-install.md); size and licence are part of the protocol |
| Inference must finish in a few seconds on a mid-range phone | Measured, not assumed; a failed budget is a stop condition |
| The camera needs a secure context and a user gesture | Satisfied; a person who declines the prompt loses nothing |

### 2.4 Method of the spike

1. Choose a labelled, openly licensed tongue dataset (if one with usable licence and labels exists); if none does, the spike **stops here** with that finding.
2. Fix the evaluation protocol: features to detect (body colour, coat colour, coat thickness, teeth marks, cracks, swelling), the metric per feature, the strata, the pass criteria.
3. Build the smallest classifier that could plausibly pass (a colour-statistics baseline first, a small network second) and measure.
4. Measure the capture side: guidance for light and distance, a quality gate (exposure, blur, colour cast), and what fraction of casual phone photos pass it.
5. Report.

### 2.5 Proposed protocol (to be fixed before the spike starts)

| Item | Proposal |
|---|---|
| Labels | At least two practitioners per image; report inter-rater agreement (Cohen's kappa) per feature — **the model is never held to a standard its labellers do not meet** |
| Baseline | The accuracy of a layperson choosing from the existing swatches (the app's current method), measured on the same images |
| Strata | Lighting (daylight, warm indoor, cool LED), device camera, skin tone (an established scale), age group |
| Pass | On every stratum, per feature, agreement with the practitioners at least equals the layperson baseline **and** no stratum falls below a fixed fraction (to be set in the protocol) of the best stratum; calibration of the model's stated confidence is reported |
| Output class | Confirmed suggestions enter as a quality class no higher than today's self-observation (coefficient 0.7) until a later evaluation shows more |
| Stop | Any stratum below the pass line; a dataset licence or consent gap; a regulatory view that the feature is a medical device within the product's positioning; inference over its time or size budget; any design that needs to store or send an image |

## 3. Camera pulse (FR-33, PM-31)

**What it would be.** A rate, and at most a hint about regularity, from the camera: a fingertip over the rear camera (with the torch where the browser can switch it on), or a prefill from a Bluetooth heart-rate strap. It would fill the same rate field as the timer and the tap ([tap-tempo design](tap-tempo-and-regions.md)). It would **not** estimate the classical pulse qualities (浮沉遲數虛實…), which the camera cannot see.

**Constraints.** Torch control is not available in every browser (it is, broadly, Chromium on Android), and strap access through Web Bluetooth is Chromium-only and needs its own permission policy entry; a feature that works on one platform family only is acceptable only if it is labelled as such. Motion and pressure artefacts are large.

**Method.** Record the camera signal alongside a reference (a chest-strap or a pulse oximeter) for a defined set of volunteers at rest (ethics and consent as above, or use signals the volunteers record themselves under a protocol), on several devices; compute the rate; compare.

**Protocol (fixed before the spike).** Report the error against the reference per device and condition. Proposal: a rate within ±3 beats per minute (the same tolerance as the tap-tempo estimator) in at least 90 % of resting trials on every device tested, and **"not enough to tell"** whenever the signal quality is low, never a guess.

**Stop.** Error above the bound on a common device class; instructions that are unsafe or confusing (pressing hard, covering a hot torch for long); any attempt to read more into the signal than a rate and a regularity hint; a permission or CSP change that cannot be justified.

## 4. File-based sync (FR-34, PM-32)

**What it would be.** After a person has a backup ([design](backup-and-data-lock.md)), they may choose a file in a folder that their own cloud client synchronises (iCloud Drive, OneDrive, Dropbox, Google Drive). The app then keeps that file current — an encrypted backup written after each saved assessment — and, on opening, offers to merge a newer file written by another device, using the same importer and conflict choices. **No server is involved; the cloud service sees only an encrypted file the person chose to put there.**

| Aspect | Design |
|---|---|
| API | The File System Access API (`showSaveFilePicker`, a stored file handle); Chromium desktop and Chromium on Android. Safari and Firefox do not offer it for this purpose, so there the feature is hidden and the manual backup and the share sheet remain |
| Permission | A stored handle needs the person's permission again in each browser session (a click); the app asks once, on the screen that explains the feature, never in the background |
| Writes | Write the whole file, then close (the browser swaps the file in on close); the file is written only while the app is open, which is the honest limit — closing the tab ends the syncing |
| Encryption | Always the passphrase-protected format; the passphrase is asked for in the session and not stored |
| Conflict | Same rules as import: *skip*, *keep both*, *replace if newer*; the app never overwrites a newer file silently |
| Failure | A write that fails leaves the previous file intact and tells the person; the backup reminder remains the fallback |

**Protocol and stop.** Interruption tests (closing the tab mid-write, a full disk, a permission revoked, a file locked by the cloud client) must show no data loss in either the file or the store; any scenario that needs a server, that loses data, or that works only in a browser family too small to justify the interface stops the track.

## 5. Not planned — and what would change that

| Idea | Why not | What would reopen it |
|---|---|---|
| **Accounts and server-side sync** | The product's value is that health data stays on the device; a server makes the project a processor of health data with the security, compliance and cost that brings | Demand that files do not meet, **and** a security and privacy review, a data-protection impact assessment, and a legal view |
| **LLM-generated diagnosis or advice** | The diagnostic core must be deterministic and explainable, every statement traceable to a source and reviewable; generated text can be fluent and wrong | Nothing foreseeable for diagnosis or advice |
| **LLM rewording of the explanations** | A paraphrase can drift from a reviewed statement; the forbidden-wording rules must hold for every sentence | The conditions of decision Q3: on device only, after the fact, opt-in, passed through the same lint, never touching a recommendation, and usability evidence that the templated text fails comprehension |
| **E-commerce, herb sales, telemedicine, practitioner directory** | Outside the positioning; regulated; a directory implies endorsement and needs a server | A different product |
| **Automatic telemetry or analytics** | Contrary to the privacy promise | Voluntary, user-reviewed export files for research, as now |
| **Native app wrappers** | The installable web app covers the need; app stores add review policies on health claims and a second code path | Install friction or storage loss on a platform that the web app cannot solve |
| **Push notifications from a server** | Needs a server and would carry health timing | See accounts |
| **EMR / FHIR integration** | A mapping can be written by those who need one from the summary file | A partner and a defined use |
| **HRV and wearable analytics beyond a rate prefill** | No validated link to the app's model | A research result, then a requirement |

## 6. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release D.**

| Question | Default |
|---|---|
| Order of the spikes | File sync first (smallest, builds on Release A), then camera pulse, then tongue photo (largest, with the hard gates) |
| Start of the tongue-photo spike | Not before the legal view and the dataset-licence finding exist; the first step is the desk research |
| Store a photo | Never |
| Quality class of an assisted tongue finding | No higher than self-observation until evidence |
| CSP / Permissions-Policy | Changed only when a track has a "go", for the whole app, with the justification written in the tech spec |
| New images from volunteers | Only with ethics approval and consent |

## 7. Tasks

PM-30 (tongue-photo spike), PM-31 (camera-pulse spike), PM-32 (file-based sync, a spike with a shippable result if the stop conditions are not met) — [`TASKS.md`](../../../TASKS.md).

## 8. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design |
