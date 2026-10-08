# AI Help — Data-Protection Impact Assessment (draft)

| | |
|---|---|
| **Version** | 0.3 (draft for the privacy and legal reviewers) |
| **Status** | Drafted with task PM-44, from the owner's decisions of 2026-10-07 (PD-21 approved as designed; PD-25 photos in the development profile only); extended with the photo of the tongue and the face built in the development profile (PM-50, §3.2). **Not reviewed.** Nothing described here reaches a public build before a privacy reviewer and a legal reviewer have signed §10 |
| **Last updated** | 2026-10-08 |
| **Audience** | The owner (controller), a privacy reviewer, a legal reviewer, engineers |
| **Related** | [AI-assisted intake](../design/ai-assisted-intake.md) · [Privacy](../../privacy.md) §2, §3, §5, §8 · [Decisions PD-21 … PD-27](../decisions.md) · [Safety policy](../../safety-policy.md) |

> **Why this document exists.** Until Release F nothing a person entered left their device, so the project held no personal data and needed no impact assessment ([privacy §5](../../privacy.md)). AI help changes that for the people who turn it on: their conversation goes to the project's gateway and on to a model provider, for the time of the request. That is server-side processing of health data — the trigger the privacy design names for a full redesign. This is the assessment's draft; the decisions it records are the owner's, the judgements it asks for are the reviewers'.

---

## 1. The processing

| | |
|---|---|
| **What** | A person who turned on *AI help → conversation* describes their complaints in their own words. Each turn, the app sends the conversation so far, the app's own vocabulary of findings in the session's language and the ids of the findings the person has already confirmed to the project's gateway; the gateway passes them to a model provider and returns proposed findings, each with the person's own words as evidence, and the next question. The person confirms or removes each proposal; only confirmed findings enter the assessment, which the deterministic engine makes on the device as before |
| **What (photos, development profile only)** | A person who turned on *AI help → tongue* or *→ face* takes or chooses a photo through the device's own file chooser (its camera or its photo library). The app shrinks it, turns it upright and checks its quality **on the device**, shows it to the person, and **only when the person presses Send** encodes it as a JPEG with none of a camera's metadata and sends it, with the module's own list of features in the session's language, to the gateway; the gateway checks it again and passes it to a model provider's vision model, which returns the features of that list it thinks it sees, with a confidence each. The person confirms or dismisses each; only a confirmed one enters the assessment, as a guided self-observation (quality 0.7). §3.2 |
| **Who** | Adults (18 and over) who opt in, per module, after a consent screen. Off by default; off entirely in a public build until the gates of [AI-assisted intake §6](../design/ai-assisted-intake.md) are passed — the photos until the tongue-photo spike's gates too (PD-25) |
| **Why** | Fewer option lists and more natural description (the owner's direction of 2026-10-07). The app works fully without it |
| **Not processed** | In a public build: photos (the tongue and face module is development-only until the tongue-photo spike's gates, PD-25, task PM-50 — a release build holds none of its code, check-release rule 17). In every build: name, contact or account data (there are none); birth data; the profile's age, sex, pregnancy, medicines, allergies and conditions; the history of earlier results; free-text notes; a photo's metadata |

## 2. Necessity and proportionality

- **Optional and narrow.** One module at a time; the classic questions remain and give the same result for the same findings.
- **Minimised request.** The request builder in the app has no access to the profile's identifiers or birth data; it holds only the conversation text, the vocabulary (the app's own list — public information) and confirmed ids. A test asserts what a request contains.
- **No storage.** The gateway logs counts and status codes only, never content (a test captures its log); the provider is used under zero-data-retention terms where offered; the app keeps the conversation text in memory for the session only — it is not written to the device's storage, a backup or a result. What is kept is what the person confirmed, as findings, exactly like an answer to a question.
- **Confirmation.** No proposed finding counts until the person confirms it, with their own words shown beside it.

## 3. Data flows

| Step | Data | Where | Retention |
|---|---|---|---|
| Consent | module, time, version of the statement | the device (`localStorage`, preferences) | until withdrawn or erased |
| Session | a random session token issued by the gateway (no account) | the device's memory; the gateway checks its signature | the session; expires |
| Each turn | the conversation text (the person's words and the assistant's questions); the vocabulary; confirmed ids | device → gateway (TLS) → provider (TLS) | **none** at the gateway (counts only in its log); provider: zero-retention terms, no training on the data |
| Reply | proposed finding ids, a severity, a confidence, the person's own words as evidence; the next question | provider → gateway (validated against the vocabulary and the wording rules; anything else dropped) → device | none |
| Confirmed findings | symptom ids and a severity | the device, inside the unfinished assessment and the saved result, like every answer | as every answer: until the person deletes it |

### 3.2 The photo of the tongue and the face (PM-50; development profile only)

| Step | Data | Where | Retention |
|---|---|---|---|
| Consent | module (tongue, face), time, version of the statement | the device (preferences) | until withdrawn or erased; never in a backup |
| Taking the photo | a picture file | the device's own file chooser (`<input type="file" accept="image/*">`; on a phone it offers the camera app and the photo library): the page asks for no camera permission and `Permissions-Policy` keeps `camera=()` in every build | the person's own photo library, outside the app |
| Reading it | pixels of a picture decoded, turned upright, scaled to at most 1024 px on its long side, drawn on a canvas | the page's memory; a small copy goes through the quality gate (size, light, contrast, focus, colour) and a picture that fails is dropped at once | a canvas in memory, **emptied** when the person chooses another picture, leaves the screen or presses Done |
| Showing it | the same canvas, on the screen it is taken for | the page | as above. Nothing has left the device yet; no session is even started |
| Send (the person's press) | a JPEG encoded from the canvas — no EXIF, no place, no time, no make, no thumbnail, no comment (`stripJpeg` takes out anything an encoder adds); the module's features (ids, labels in the session's language, groups) and the exclusive groups among them; a session token | device → gateway (TLS) → provider (TLS) | **none** at the gateway: it checks the picture again (a JPEG, no metadata, 200–2048 px, at most 512 KiB) and holds it for the request only; its log has the route, the status, the module, the picture's size in bytes and counts — never a pixel. Provider: **zero data retention for images** must be in the agreement (§7) |
| Reply | whether the photo can be read; the ids of the features it thinks it sees, with a confidence each — from the request's list, at most one of an exclusive group | provider → gateway (validated; anything else dropped) → device (validated again) | none |
| Confirmed features | symptom or tongue-feature ids with the quality of a guided self-observation | the device, in the unfinished assessment and the saved result, like every answer | as every answer; **no photo is ever in a draft, a result, a backup or a preference** (a test of the end-to-end scenario E42 searches every store of the page for the picture) |

The picture is sent **once, for one request**, after the person has seen it and pressed Send; there is no automatic or background sending, no thumbnail, no gallery, no history of photos. A new photo needs a new press. Each module has its own consent and its own budget at the gateway (photos per session, per minute, per day).

A **red-flag statement** in the conversation (chest pain, fainting, self-harm …) is matched on the device by a deterministic list and re-opens the red-flag screening; the model's own flag can raise it, never lower it. No emergency depends on the network.

## 4. Roles

| Party | Role | Note |
|---|---|---|
| The owner (who deploys the gateway) | **Controller** | Decides the purposes and the means; publishes the statement; answers requests |
| The gateway's host (e.g. Cloudflare Workers) | **Processor** | Runs the gateway; its request logs must be configured to keep no body content |
| The model provider (Anthropic's API, PD-22) | **Processor** (sub-processor of the owner) | Under a data-processing agreement; region of processing named |

### 3.1 What the adapter does and does not do (PM-49)

The gateway's adapter ([`apps/ai-gateway/src/anthropic.ts`](../../../apps/ai-gateway/src/anthropic.ts)) sends the provider exactly what the request builder gave it — the conversation, the vocabulary, the confirmed ids — as JSON data in delimited blocks, with the rules in the system prompt; nothing of the profile, birth data, notes or history exists in the gateway to be sent. It follows no redirect (the key goes to one host), sends no sampling parameter and no beta header, **never logs**, and reports a failure as a class name only. **Prompt caching** — a provider-side copy of the unchanging prefix (the rules and the vocabulary; no word of a person) for a few minutes — is **off** by default and is a point for the agreement (§7, §9 item 7).

## 5. Retention

Nothing is retained on the server side by design: the gateway is stateless (a session's turn count lives in memory and is dropped with it); its log lines hold the route, the status, the duration and counts. The provider's retention is set by the agreement (§7). On the device the conversation text is memory-only.

## 6. Risks and mitigations

| Risk | Likelihood · impact | Mitigation | Residual |
|---|---|---|---|
| The free text identifies the person (a name, a place, a workplace in a description) | Medium · high | The consent screen says not to type names or contact details; the gateway passes nothing else; nothing is stored; the provider retains nothing | Low–medium: what a person types cannot be filtered reliably — **reviewer to judge** whether a client-side scrub of obvious identifiers (numbers, e-mail addresses) is required |
| Sensitive inference (health) at the provider | Certain · high | Zero-retention terms; no training; DPA; region | Depends on the agreement — **legal reviewer** |
| Prompt injection or a manipulated reply | Medium · medium | The reply is data, validated against the vocabulary; evidence must be the person's own words; a question that fails the wording rules is replaced; the engine decides | Low |
| A wrong finding (the model invents or misreads) | Medium · medium (safety) | Every proposal is shown with its evidence and must be confirmed; the evaluation (task PM-48) per language before any public use | Low after the evaluation |
| A missed emergency | Low · very high | The red-flag screening comes first and is deterministic; the device re-opens it on a matching statement | Low |
| Minors | Medium · high | Offered only to people who gave an age of 18 or more; the statement says so | Medium (no age is verified) |
| Content in logs (gateway, host, provider) | Medium · high | No content logged by the gateway (tested); host log settings; provider terms | Depends on configuration — **checklist item at deployment** |
| Cross-border transfer | Certain where the provider processes abroad | Named region; standard contractual clauses or equivalent; the statement names it | **Legal reviewer** |
| Breach at the gateway | Low · medium | Stateless; no stored content; secrets in the host's secret store; key rotation | Low |
| Cost abuse (a script calling the gateway) | Medium · low (financial) | Per-session turn budget, rate limit, size limit, origin check, kill switch; a photo costs more than a turn, so photos have budgets of their own (per session, per minute, per day) and the photo routes can be switched off alone (`AI_MODULES`) | Low |
| **Photo:** the picture identifies the person (a face, and to a lesser degree a tongue, is personal data and may be biometric data) | Certain for a face · high | Development profile only (PD-25); adults only; a separate consent per module that says what is sent, to whom, and that nothing is kept; **the person sees the picture and presses Send** (nothing is sent by choosing it); metadata removed on the device and checked at the gateway; nothing stored on the device, at the gateway or (by agreement) at the provider; no identifier travels with it | High until the provider's zero retention covers images and the legal view is given — **legal and privacy reviewers**; **whether a face photo should be offered at all in a public build is theirs to judge** |
| **Photo:** metadata discloses a place, a time or a device | Medium · high | The canvas re-encode drops all of it; `stripJpeg` removes anything an encoder adds; the gateway refuses a JPEG with an APP1–APP15 or comment segment or a thumbnail (tested, and end to end with a picture that carries a place and a comment) | Low |
| **Photo:** other people, documents or screens in the frame | Medium · medium | The consent statement and the guidance say to keep them out; the picture is shown before sending; the model is told to report "not readable" for more than one person, a screen or a document | Low–medium |
| **Photo:** a wrong or misleading suggestion; unequal accuracy across skin tones, light and cameras | Medium · medium (safety) | The quality gate refuses a picture that cannot be read (first thresholds, to be tuned by the spike's capture-side protocol); every suggestion is confirmed by the person, who is told to confirm only what they can see; it enters at quality 0.7, never higher, whatever the model's confidence; a feature the model is hardly sure of is not shown; the evaluation against practitioners' labels, per stratum, is the spike's protocol and **has not been run** | Medium until the spike's gates (PD-25) — which is why the module exists in the development profile only |
| **Photo:** the provider retains images | Medium · high | The agreement must give zero retention for **images** and no use for training or evaluation (§7); until it does, the module is used with the developers' own photos only | Depends on the agreement — **legal reviewer** |
| **Photo:** the picture lingers in the browser (memory, cache, a service worker) | Low · medium | A canvas, not a Blob URL or a data URL; emptied when dropped; no storage API is used; the gateway's replies are `no-store`; E42 searches local and session storage, IndexedDB and the cache storage for the picture and for its metadata | Low |
| **Photo:** the page gains a camera permission | Low · medium | None is asked: the camera is the device's own app; `Permissions-Policy` denies `camera`, `microphone` and `geolocation` in every build (check-release rule 11); nothing calls `getUserMedia` (E42 spies on it) | Low |

## 7. The data-processing agreement — what it must say

- [ ] The provider processes on the owner's instructions only, for the request, and **does not train** on the data.
- [ ] **Zero data retention** (or the shortest offered), stated per endpoint — **and for image inputs**, which some terms treat differently from text (PM-50).
- [ ] The region of processing and storage; the transfer mechanism.
- [ ] Sub-processors listed; notice of changes.
- [ ] Security measures; breach notification within a stated time.
- [ ] Deletion and return at the end of the contract; audit or certification evidence.

## 8. Rights of the person

The project holds no conversation and no photo, so access, rectification and erasure requests concern only what is on the person's device, which the app's existing controls cover (see, export, delete, erase everything). Withdrawal of consent: one switch per module in Settings; it stops the module at once, and leaving a photo's screen empties the picture.

## 9. Open items for the reviewers

1. Whether a client-side scrub of obvious identifiers in the free text is required before sending.
2. The provider agreement (§7), the region and the transfer mechanism.
3. The wording of the consent screen and of the public statement in three languages (privacy §8, the draft paragraph).
4. Whether the gateway's host can be configured so that no request body appears in any log, and how this is verified at deployment.
5. Age: whether a self-declared age is sufficient for this processing.
6. The regimes of [privacy §5](../../privacy.md) — GDPR, Taiwan PDPA, Hong Kong PDPO, PIPL, US state health-privacy laws — for server-side processing of health data with consent.
7. Whether the provider's **prompt caching** (a provider-side copy of the unchanging prefix, no word of a person, for a few minutes) is acceptable under the zero-retention terms; until then it stays off (`AI_PROMPT_CACHE`).
8. **Photos (PM-50):** whether a photo of the tongue, and above all of the face, may be offered in a public build at all — the legal view the tongue-photo spike names (software that analyses images for a health judgement may be a medical device; a face may be biometric data) — and under which conditions.
9. **Photos:** whether the provider's zero retention covers image inputs under the agreement; until it is confirmed in writing, no real person's photo is sent (the developers' own only).
10. **Photos:** the first thresholds of the quality gate and the share of casual phone photos that pass it (the spike's capture-side measure); whether a refused photo may be reported to the person with the reason, as built, or must say less.

## 10. Sign-off

| Role | Name | Date | Outcome |
|---|---|---|---|
| Owner (controller) | | | |
| Privacy reviewer | | | |
| Legal reviewer | | | |

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-08 | Draft from the owner's decisions of 2026-10-07 (PM-44) |
| 0.2 | 2026-10-08 | §3.1 what the provider adapter does and does not do (PM-49); open item 7 |
| 0.3 | 2026-10-08 | The photo of the tongue and the face, built in the development profile (PM-50): §1 what and not processed, §3.2 the data flow, six risks, §7 images, §8, open items 8–10 |
