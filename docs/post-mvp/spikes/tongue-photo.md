# Spike: Tongue-Photo Assistance (FR-32, PM-30)

| | |
|---|---|
| **Version** | 0.2 |
| **Status** | **Protocol written and fixed; desk research on datasets done; the spike stops at its first step.** No model has been built, no image has been downloaded, no image of a person has been taken. The hard gates of [§3](#3-hard-gates-and-where-they-stand) are open |
| **Last updated** | 2026-10-08 |
| **Audience** | The owner (approvals, advisors), a legal adviser, a clinical advisor, reviewers |
| **Related** | [Research tracks §1, §2](../design/research-tracks.md) · [Requirements FR-32](../requirements.md) · [PRD §1.3 Positioning](../../PRD.md#13-positioning) · [Decisions Q4, PD-10, PD-11](../decisions.md) · [Privacy](../../privacy.md) · [Tech spec §11](../../tech-spec.md) |

> **Summary.** The idea: a person photographs their tongue; the app **suggests** which of the existing tongue features it sees; the person confirms or edits each; only confirmed selections reach the engine, at a quality class no higher than today's self-observation. The design's decided default is that the spike does not start before **the legal view and the dataset-licence finding exist, and that its first step is the desk research**. The desk research is done and is in [§4](#4-desk-research-datasets). Its finding is that candidate datasets exist, but **none can be called usable yet**: the consent and ethics statements are missing or unread, the label provenance is thin, and the licence statements have not been checked at their sources. The spike therefore **stops at step 1** — which is a stop condition the design names — until the gates are met.

---

## 1. Objective and what the feature would not be

**Objective.** Find out whether an on-device classifier can suggest the tongue features of the app's own list (`T_*` in `data/diagnosis/tongue.json` — body colour, coat colour, coat thickness, teeth marks, cracks, swelling) from an ordinary phone photo at least as well as **a layperson choosing from the app's swatches** does today, on every lighting, camera and skin-tone stratum.

**Would not be:** a diagnosis; a new claim; a change to the engine, the findings model or the quality coefficients; anything that **stores or sends an image** (the photo is analysed in memory and discarded; never stored, never uploaded — a design that needs either is a stop condition).

## 2. Protocol

**Fixed before any result exists and not edited after.** A change of a criterion is a new version with its reason; results are reported against the version they were fixed under.

| Item | Protocol |
|---|---|
| **Features** | The six features above, as the existing list names them; each is a separate task with its own metric |
| **Labels** | At least **two practitioners per image**, labelling independently from the same instructions; **inter-rater agreement (Cohen's kappa, weighted for ordinal features) is reported per feature**. The model is never held to a standard its labellers do not meet: where kappa is below 0.4 the feature is dropped from the evaluation and reported as *not reliably labelable* |
| **Baseline** | The accuracy of **a layperson choosing from the app's current swatches**, measured on the same images (at least ten laypeople, none a practitioner; the images shown on a calibrated screen, so that the baseline is not penalised by the display) |
| **Splits** | By **person**, never by image: no person appears in more than one of development, tuning and test. The test split is touched once |
| **Strata** | Lighting (daylight · warm indoor · cool LED) · device camera (at least five phones across price classes) · **skin tone on an established scale** (Fitzpatrick I–II · III–IV · V–VI, assigned by a practitioner from a standard reference, not inferred by a model) · age group (18–39 · 40–64 · 65 and over) |
| **Pass** | On **every stratum**, per feature, agreement with the practitioners' consensus is **at least the layperson baseline's**, **and** no stratum falls below **90 % of the best stratum's** agreement on that feature, **and** the model's stated confidence is **calibrated** (expected calibration error at most 0.1; reported with a reliability table) |
| **Output class** | A confirmed suggestion enters at a quality class no higher than self-observation today (coefficient 0.7) until a later evaluation shows more; it is never auto-accepted |
| **Capture side** | A quality gate for light, distance, blur, exposure and colour cast, and **what fraction of casual phone photos pass it** (the share that fails is reported, and a feature that most casual photos cannot use is a stop) |
| **Budgets** | Model weights at most **5 MB**, lazy and content-hashed like a knowledge chunk, cached for offline use; inference in a few seconds on a mid-range phone (measured on the slowest device of the strata; over the budget is a stop) |
| **Platform** | `Permissions-Policy` changes from `camera=()` to `camera=(self)` for the whole app, and `'wasm-unsafe-eval'` is added to the content-security policy only if the model needs WebAssembly — **both only when the track has a "go"**, with the justification written in the tech spec |

**The spike stops** — and ends in a report whether or not anything succeeded — on: any stratum below the pass line; a dataset **licence or consent gap**; a regulatory view that the feature is a medical device **outside the product's positioning**; inference over the time or size budget; any design that needs to store or send an image; a labelling agreement too low to evaluate against; an approval refused or lapsed.

## 3. Hard gates, and where they stand

| Gate | Why | Status |
|---|---|---|
| **Legal view on regulation** | Software that analyses images to support a health judgement is regulated as a medical device in many places; this could change the product's regulatory class, not only its feature list. A legal adviser decides whether the *suggestion of features* stays within [PRD §1.3](../../PRD.md#13-positioning) | **Open.** No adviser has looked at it |
| **Privacy and security review** | Camera permission, in-memory handling, no storage, no network | **Open** (nothing to review yet) |
| **Datasets with a clear licence and consent** | Models need labelled images; none is assumed usable | **Open** — see [§4](#4-desk-research-datasets) |
| **Ethics approval for any new images** | Photographing volunteers is research on people | **Open**; no new images are planned until the datasets are known to fall short |
| **A clinical advisor to label** | Labels from two practitioners, with their agreement measured | **Open** |
| **Approval to download** (PD-11) | Anything downloaded is approved by the owner first with filename, source and size | **Nothing has been downloaded and nothing is requested here**: a dataset needs this approval, stated as filename, source and size at the time |

## 4. Desk research: datasets

Done on 2026-10-06 from search results and the pages named below, **read as web pages (summaries), not downloaded, and not verified at their sources**: a licence line below is *what a page said*, and the first act of the spike, when the gates open, is for a person to read each licence and consent statement at the source. "Not stated" means not stated **in what could be read**, not that it does not exist. Nothing here is a recommendation of a dataset.

| Candidate | What the pages say | What is missing or unread |
|---|---|---|
| **TCM-Tongue** — [arXiv 2507.18288](https://arxiv.org/abs/2507.18288) | 6 719 images "captured under standardized conditions"; 20 pathological symptom categories, 2.54 labels per image on average; labels "verified by licensed TCM practitioners"; annotation formats COCO, TXT, XML; the paper is under CC BY 4.0, and the search result says the dataset is CC BY 4.0 and hosted through a cloud-drive link on GitHub | **Consent and ethics: not stated** in what was read. Number of practitioners and agreement: not stated. Devices: not stated. The licence of the **dataset** (as against the paper) is to be read at its repository. Its labels are *symptom categories*, which are not the app's six features: a mapping would be needed |
| **An annotated dataset of tongue images** — [IEEE DataPort](https://ieee-dataport.org/open-access/annotated-dataset-tongue-images), also on Harvard Dataverse (doi 10.7910/DVN/COJZMQ), described in a [PMC article](https://pmc.ncbi.nlm.nih.gov/articles/PMC7452583) | 668 images (one face image, one tongue image and two narrative documents per patient) from hospitalised geriatric patients in a tertiary hospital in Shanghai from 2019; a light-field camera; JPG; annotations by physicians and medical students; open access with a free login | **Licence: not stated on the page.** Ethics and consent: not stated on the page (the article was not readable: the fetch met a robot check). The comments say only some 102 subjects' data are available and that labelling was still being completed. A population of hospitalised older adults, one site and one camera: strata would be missing |
| **Tongue image dataset for Tri-Dhat classification in traditional Thai medicine** — [Zenodo 12525502](https://zenodo.org/records/12525502) | CC BY 4.0; 3.7 GB archive; three classes (Vata, Pitta, Kapha); collected at a university traditional-Thai-medicine hospital | The labels are **Thai-medicine constitution classes**, not tongue features. Number of images, consent and ethics: not stated. Probably not usable for this spike except as a source of unlabelled variety — and then the consent question stays |
| **Tongue Image Dataset with Inquiry Data** — [SciDB](https://www.scidb.cn/en/detail?dataSetId=8417299de5ef4f3db5ec62e01a969d54) | Described in search results as the first TCM dataset with tongue images and clinical inquiry data | **The page could not be read** (only a title came back): size, labels, licence, access and consent are all unknown |
| **A tongue-image quality-control study** — [BMC Medical Informatics and Decision Making, 2021](https://bmcmedinformdecismak.biomedcentral.com/articles/10.1186/s12911-021-01508-8) | Search results describe an effort to build an open tongue-image database with quality control, published under CC BY 4.0 | **Not read** (the publisher redirects to an authentication step, which was not followed). Whether the *images* are released, and on what terms, is unknown. Its quality-gate work is relevant to the capture side of the protocol |
| **Roboflow tongue datasets, ZhongJing-OMNI** (found in search results) | Roboflow: three datasets of 4 815 images in all, with coating, body, shape and edge labels; ZhongJing-OMNI: a multimodal TCM dataset with tongue images and question-and-answer pairs | **Not read.** Platform-hosted datasets of unknown provenance, and a multimodal corpus: licence, consent and the origin of the images are the questions |

**What the finding is.** Candidates exist and some state a Creative Commons licence for the *paper* or the *data*. **For none could consent, ethics approval, the number and agreement of the labellers, the devices and the skin-tone and lighting spread be established from what could be read.** The protocol's strata (skin tone on a scale, lighting, several phone cameras) cannot be assessed on a dataset that does not say what it holds; and an open licence is not consent. The design names this outcome: *"a dataset licence or consent gap"* stops the spike. It stops here.

**What would reopen it.** A named legal adviser's view that the suggestion of features stays within the positioning; a named clinical advisor and a second labeller; and a person's reading, at the sources, of the licence and consent statements of the datasets above (or of others), recorded in this document with the date; then the owner's approval to download one — filename, source and size stated when asked. If no existing dataset passes, new images need an ethics approval and consent, which is a project of its own and is not planned.

## 4a. The AI observation module and this spike (PM-50)

The AI help design (FR-41, [AI-assisted intake](../design/ai-assisted-intake.md)) built **the same idea with a general-purpose vision model behind the project's gateway instead of a trained on-device model**, in the **development profile only** (PD-25). It does not open this spike's gates and nothing here is a result of the spike: no dataset has been downloaded, no practitioner has labelled an image, no accuracy has been measured, and the module's suggestions are confirmed by the person at the quality of a guided self-observation (0.7). What it adds to the spike's ground is **the capture side**: a first quality gate (size, light, contrast, focus, colour; `apps/web/src/ai/photo/quality.ts`) whose thresholds are guesses until this protocol measures **what share of casual phone photos pass it** and tunes it without looking at the model's answers; and the way a photo is handled (no camera permission — the device's own camera app; memory only; metadata removed; sent once on the person's press). Two lines of §2 differ for that module and are the reason it stays in development: *Platform* — the module needs **no** `camera=(self)`, so `Permissions-Policy` keeps `camera=()`; and *an image is sent* — which §1 names as a stop condition for **an on-device classifier** and which the AI help design accepts only for people who opt in, only in development, and only with the legal view, the evaluation and a provider agreement with zero retention for images (DPIA §3.2, §6, §9) before any public use.

## 5. What a "go" and a "no-go" mean

As for every spike ([research tracks §1](../design/research-tracks.md)): a **go** becomes a requirement with its review class, a privacy and legal review and its own design **before any production code**; the spike's code is not the product. A **no-go** is closed with this report kept, and reopened only by new evidence.

## 6. Decision

**Open — stopped at step 1 by the licence and consent gap and the open gates.** Recorded in the decision register as Q4's tongue-photo item.

## 7. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-06 | Protocol fixed before any result; desk research on datasets done from web pages, not downloaded, not verified at the sources; stopped at step 1 |
| 0.2 | 2026-10-08 | §4a: the AI observation module built in the development profile (PM-50) — what it adds (the capture side) and does not (no gate is opened) |
