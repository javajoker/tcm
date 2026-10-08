# Privacy and Data Handling

| | |
|---|---|
| **Version** | 0.12 (draft) |
| **Status** | Design document; the user-facing statement (§8) needs legal review before release |
| **Last updated** | 2026-10-08 |
| **Audience** | Developers, reviewers, whoever writes the public privacy statement |
| **Related** | [PRD G7, NFR Privacy](PRD.md) · [Tech spec §8.3, §11](tech-spec.md) · [UX spec §4.2, §4.14](ux-spec.md) · [Safety policy](safety-policy.md) · [Algorithm spec §15](wuxing-algorithm.md) |

> **Summary.** The app is **local-first**: everything the user enters stays in their browser on their device. There are no accounts, no server that receives answers,
> no third-party scripts and no analytics in the MVP. The user can see what is stored and erase all of it in one action.

---

## 1. Principles

1. **Data minimisation** — ask only for what the logic needs; everything optional is skippable; free-text notes are stored but never interpreted.
2. **Local by design** — computation happens in the browser; nothing is transmitted.
3. **User control** — see, export, delete; birth data is opt-in in release and "remember" is off by default.
4. **No secondary use** — answers are never used for anything except producing and storing the user's own result.
5. **Honest storage statements** — the app says exactly what is stored, where, and how to remove it, including the limits (device backups, shared devices).
6. **Health data is sensitive** — treated as such in storage, logging, errors, exports and tests.

---

## 2. Data inventory

| Data | Examples | Sensitivity | Purpose | Stored where | Default retention | User control |
|---|---|---|---|---|---|---|
| Disclaimer acknowledgement | version, time | Low | Re-prompt when wording changes | `localStorage` | Until erased | Settings → Erase |
| Backup passphrase | typed in the backup dialog (or the restore dialog) and used once to derive the key (PBKDF2-SHA-256, 600 000 iterations) that encrypts (AES-256-GCM) or opens the file | **Secret** | Protects a backup file the person chooses to protect; **never stored, never sent, no hint, no recovery** — a forgotten passphrase means the file cannot be opened by anyone | Memory only, cleared as soon as it is used | The moment the dialog finishes | — |
| The kept backup file (PM-32; Chromium only) | the same as a protected backup — every saved result and the settings, **always encrypted** with a passphrase the person chose — written after each change to a file the person chose, in a folder their own cloud client may synchronise | **Sensitive (health)**, encrypted | A copy kept current, and the way two of the person's devices share it ([research tracks §4](post-mvp/design/research-tracks.md)) | The file: where the person chose it. Nothing goes to a server of this app; a cloud service sees only an encrypted file, its name, its size and its times | Until the person deletes the file; the app keeps no copy | The person, by deleting the file; the app is stopped from writing it by *Stop keeping it up to date* |
| The kept file's record (`meta/sync`) | the browser's handle to the chosen file, its name, a SHA-256 of the file's text as this device last wrote or merged it, and when | Low (it holds no readable secret; the handle opens only the one file the person chose, and only with the person's permission in each session) | Lets the next visit find the file and tell whether someone else changed it | IndexedDB `tcm-app`, store `meta` | Until the person stops, or erases everything (the file itself is not deleted) | *Stop keeping it up to date*, or Erase |
| The kept file's passphrase | the passphrase of the encrypted file | **Secret** | Lets the app write the file | **Memory only**, in the session; never stored, never in a preference or a URL; dropped by *Stop*, by the lock and by closing the page | The session | Close the page |
| Backup files | the person's saved results (with the answers they hold), optionally the settings and the unfinished assessment; a checksum and the versions of the app that made it | **Sensitive (health)** | A copy the person keeps and can move to another device ([backup design](post-mvp/design/backup-and-data-lock.md)) | Wherever the person saves the file; the app keeps no copy | Until the person deletes the file | The person, by deleting the file |
| Backup reminder | when the last backup was made (`lastBackupAt`), a snooze time (`backupSnoozeUntil`) and a switch (`backupReminder`), in the preferences | Low | The reminder card appears when results are not in a backup | `localStorage` key `tcm.prefs` | Until erased | Settings → Erase |
| Lock passphrase | typed on the lock screen and in the three lock dialogs (turn on, change, turn off); it makes the key that unwraps the data key (PBKDF2-SHA-256, 600 000 iterations) | **Secret** | Opens the locked history; **never stored, never sent, no hint, no recovery** — a forgotten passphrase loses the history on this device, and the only way forward is *Erase everything* (then a backup made earlier can be restored) | Memory only (the fields are cleared when the dialog goes; a JavaScript string cannot be wiped, so it may stay until the garbage collector takes it) | The moment the dialog or the try finishes | — |
| Data key | a random 256-bit key (AES-256-GCM) that encrypts the saved results and the unfinished assessment while the lock is on | **Secret** | Lets the page read and write the history while it is unlocked | In memory only, imported as non-extractable, dropped by *Lock now*, the idle time and any reload; on disk only **wrapped** by the passphrase's key, inside the lock record | Until the lock is turned off or everything is erased | Settings → Lock the history |
| Lock record | a key id, the key-derivation settings and salt, the wrapped data key, the number of wrong passphrases in a row and the time of the last one — stored as `meta/lock` | Low (it holds no readable secret) | Opens the lock, and counts wrong tries so that each next one waits longer after five | IndexedDB `tcm-app`, store `meta` | Until the lock is turned off or everything is erased | Settings → Lock the history; Erase |
| Lock marker | the value `1` under the key `tcm.lockHint`, present while a lock exists | None | Lets the first page of a locked device wait for the lock record instead of showing the history for a moment | `localStorage` | Removed when the lock is turned off; removed by Erase | Same |
| Lock idle time | 5, 10, 30 or 60 minutes (`lockIdleMinutes`), in the preferences | Low | The history locks itself after this long without use | `localStorage` key `tcm.prefs` | Until erased | Settings → Lock the history |
| Boot counter | a number (`tcm.boot`) raised when the page starts and cleared after its first render, and the time of the last recovery (`tcm.boot.recovered`) | None | The boot guard: two starts in a row that never rendered drop the offline copy ([offline design](post-mvp/design/offline-and-install.md) §3.5) | `localStorage` | Cleared by the next successful start | Settings → Erase |
| Preferences | language (only once the user has chosen one), theme, text size, emergency-number region, how seasons are counted (`seasons`: northern calendar, southern hemisphere or none — only once the user has chosen), the season model (`seasonModel`, **development builds only**: a release does not read it; never in a backup), "move on automatically" switch, "English offer dismissed" flag | Low | Personalisation; the one-time English offer is shown only while no language has been chosen; until the season choice is made, the device's time zone — read in the page, never stored and never sent — suggests the northern or the southern calendar | `localStorage` key `tcm.prefs` | Until erased | Settings |
| Basic profile | age, sex at birth, pregnancy/lactation, region, lifestyle | **Sensitive (health)** | Safety scope and context | IndexedDB (draft, history) | Until the user deletes the assessment | Edit, delete |
| Medications, allergies, chronic conditions | classes, allergens, listed conditions, free-text medicine names the user types (never interpreted) | **Sensitive (health)** | Safety filter | IndexedDB | Same | Same |
| Red-flag answers and acknowledgements | which items (yes / no / not sure), corrections ("I made a mistake"), time each notice was acknowledged | **Sensitive (health)** | Notices, record of acknowledgement | IndexedDB | Same | Same |
| Findings | symptoms, tongue, pulse, constitution answers | **Sensitive (health)** | Pattern differentiation | IndexedDB | Same | Same |
| **Birth data** | date, time/unknown, place (longitude, time zone), which of two clock times (daylight-saving overlap) and, for a time near a change of hour, which hour the person said is nearer the truth | **Sensitive (personal)** | Optional innate/annual reference | **Session memory only unless "Remember on this device" is ticked** (default off; Settings has a "Remember birth data" default, off, that the person can turn on to start each assessment with the box ticked) → then IndexedDB | Session, or until deleted | Opt-in toggle; erase |
| Results | assessments, reasoning, recommendations (with KB/engine versions, when the season was counted on another basis than the northern calendar that basis, and, when the birth time was within 15 minutes of a change of hour, which hour the birth chart was made from — the choice, not the time) | **Sensitive (health, derived)** | History and compare | IndexedDB | Until the user deletes | Delete one/all |
| Personalised prescription (PM-41; **development builds only**) | the recommended formula adapted to the person by rules — herbs removed or added with their reasons, quantities in grams with what adjusted each, cautions, the explanation — computed from the result and the inputs it already holds, stored inside the saved result | **Sensitive (health, derived)** | Shown on the formula page and, if kept in, in the practitioner summary and its file (version 2) | Inside the saved result in IndexedDB; in a backup with its result | Same as the result | Deleted with the result |
| Free-text notes | anything typed | Sensitive | Memo for the user | IndexedDB | Same | Same |
| Feedback marks | match / partly / no, per result, pattern and formula (stored inside the saved result) | Low | Optional calibration export (marks + result summary; the answers only if the user ticks "include my answers") | IndexedDB | Same | Export or delete |
| Follow-up date | A day the person chose (in 2, 4 or 8 weeks) and, if they said "not now", when — stored inside the saved result | Low | Shows the card on the start page and in History when the day has passed; nothing is sent and no timer runs. A calendar file for that day, if the person asks, holds only a date and the title "time to look again" | IndexedDB | Same | Deleted with the result; included in a backup |
| Technical | app/KB/engine versions, profile | Low | Reproducibility | Inside saved results | Same | — |
| Reading role (PM-53, PM-54) | learner, practitioner or *general* (the choice to hide the study reference); when, and the version of the attestation agreed to; whether the landing page's offer was answered. Absent: the build's default (the study reference, where it is every reader's) | Low | Which content a result shows (L3 for a declared learner or practitioner) | `localStorage` key `tcm.prefs` (`role`, `roleOffered`); a result made for a role is stamped with it | Until changed or erased; travels in a backup with the settings | Settings → Who is reading |
| **AI help consent** (Release F; development builds until its gates) | which module (conversation; the photo of the tongue; the photo of the face), when, which version of the statement | Low | Records the person's choice; nothing is sent before it | `localStorage` key `tcm.prefs` (`ai`) | Until withdrawn or erased | Settings → AI help: one switch per module |
| **The conversation** (AI help) | the words the person types and the assistant's questions | **Sensitive (health)** | Proposes findings the person confirms ([AI-assisted intake](post-mvp/design/ai-assisted-intake.md)) | **Memory only** on the device, for the session — never in storage, a backup or a result (words that named a red flag wait there, unsent, while the screening is answered again); **sent**, for the time of each request, to the project's gateway and on to the model provider | None on the gateway (counts only in its log); the provider's zero-retention terms | Do not turn it on; withdraw in Settings; close the page |
| What travels with each turn (AI help) | the app's own vocabulary of findings in the session's language (public) and the ids already confirmed | Sensitive (health) together with the conversation | Lets the reply name findings from the app's list | Sent with each request; nothing stored | None | As above |
| **A photo of the tongue or the face** (AI help, PM-50; **development builds only** until the tongue-photo spike's gates, PD-25) | a picture the person chose, shrunk on the device, with none of a camera's metadata | **Sensitive (health; a face may also be biometric)** | Suggests which of the app's own tongue or face features it shows; the person confirms each ([AI-assisted intake §1](post-mvp/design/ai-assisted-intake.md)) | **Memory only** on the device, as pixels on a canvas, while its screen is open — never in storage, a cache, a backup, a draft or a result; **sent once**, when the person presses Send, to the gateway and on to the model provider's vision model, with the module's list of features | None on the gateway (its log has the module, the size in bytes and counts — never a pixel); the provider's zero-retention terms **for images** (the agreement, [DPIA §7](post-mvp/privacy/ai-help-dpia.md)) | Do not turn the module on; withdraw it in Settings; leave the screen (the canvas is emptied) |
| What travels with a photo (AI help) | the module's own features in the session's language (public) and the knowledge base's exclusive groups among them; a session token | Sensitive (health) together with the photo | Lets the reply name features from the app's list | Sent with the request; nothing stored | None | As above |
| Confirmed features from a photo | tongue or face feature ids, recorded as a guided self-observation (quality 0.7) | **Sensitive (health)** | Pattern differentiation | IndexedDB (draft, history), like every finding | Same as findings | Same |
| AI session token | a random token the gateway issues for the session (no account) | Low | Budgets and rate limits per session | Memory only | The session; expires | Close the page |
| Confirmed findings from the conversation | symptom ids and a severity, the same as an answered question | **Sensitive (health)** | Pattern differentiation | IndexedDB (draft, history), like every finding | Same as findings | Same |

**With the lock on** ([design](post-mvp/design/backup-and-data-lock.md#5-the-local-data-lock-fr-24-release-b)) every row above that is stored in IndexedDB — the profile, medicines and allergies, red-flag answers, findings, birth data if remembered, results, notes, feedback marks, the follow-up date, and the unfinished assessment — is stored **encrypted** (AES-256-GCM, a fresh random IV for every write, the store, key and version of the record bound in as additional data). What is not encrypted: the preferences and the disclaimer record (no health data, and the lock screen needs the language and theme), the lock record and the lock marker. The lock does not protect against malware or a malicious browser extension, and it does not replace the device's own screen lock and disk encryption.

**Never collected:** name, email, phone, account identifiers, device identifiers, precise location, IP addresses by the app, contacts, and photos — **in a public build there is no photo code at all** (the tongue and face module of Release F, task PM-50, is built in the development profile only and stays there until the tongue-photo spike's gates, PD-25; `check-release` rule 17). Where it exists, no photo is ever stored by the app, by the gateway or (by agreement) by the provider, and the page never asks for the camera.

**AI help (Release F, decision PD-21, approved by the owner on 2026-10-07):** the only exception to *nothing is sent*. For a person who turns it on, the conversation, the vocabulary and the confirmed ids go to the project's gateway and on to the model provider, for the time of each request; nothing identifying is in a request (the request builder cannot reach the profile or birth data — tested); nothing is stored on either side. The photo of the tongue or the face (development builds only) is the second kind of thing that can be sent: the picture, once, on the person's press of Send, shrunk, upright and without metadata — see the rows above and [DPIA §3.2](post-mvp/privacy/ai-help-dpia.md#32-the-photo-of-the-tongue-and-the-face-pm-50-development-profile-only). The impact assessment's draft is [`post-mvp/privacy/ai-help-dpia.md`](post-mvp/privacy/ai-help-dpia.md); it must be signed before any public use.

---

## 3. Storage, transmission and erasure

| Topic | Design |
|---|---|
| **Network** | After the page and knowledge-base chunks load, the app makes no requests; CSP `connect-src 'self'` prevents anything else ([tech spec §11](tech-spec.md)). *Exception:* a build with AI help adds the gateway's origin to `connect-src`, and the app calls it only for a person who consented — during the conversation, or, for a photo, when the person presses Send; a public build has AI help off and no gateway origin (`check-release`). `Permissions-Policy` denies the camera, the microphone and the place in **every** build: a photo comes through the device's own file chooser and camera app, which the page does not control. The KB chunks are static files that contain no user data and are fetched with no user-specific parameters |
| **Third parties** | None: no analytics, fonts, CDNs, tag managers, error-reporting services or embedded media in MVP |
| **Cookies** | None |
| **URLs and logs** | Routes contain only a random local assessment id; birth data, answers and notes never appear in URLs, titles, history state or console output in release |
| **Hosting logs** | The static host may log request metadata (IP, user agent, URL) as web servers do. Choose a host that allows disabling or truncating logs, and state this in the public statement; none of this log data can include answers because answers are never sent |
| **Storage mechanisms** | `localStorage` (preferences, acknowledgement) · IndexedDB `tcm-app` (drafts, assessments, and `meta` for the lock record). All access goes through one module that catches errors and falls back to memory with a visible "Not saved" indicator |
| **Persistence of birth data** | Off by default. When off, the raw birth moment lives only in memory for the session; a saved result keeps the derived panel and a flag *birth data used*, not the birth moment — the four pillars and the true solar time that the engine computes are removed from the result before it is stored (`withoutBirthMoment`; checked by `apps/web/test/privacy.test.tsx`) — and "re-run" asks again |
| **Offline copy (Cache Storage)** | The service worker ([offline design](post-mvp/design/offline-and-install.md)) keeps the files of the app build — scripts, styles, icons, the knowledge base — so the product works without a connection. Nothing the person produced is stored there (a test lists the cache after a whole assessment), and the worker never sees a request that carries data: it answers only `GET`s for files of its own build. Removed by "Remove offline copy" and by "Erase everything" |
| **Erase everything** | Settings → one named dialog ("Erase everything on this device"): deletes IndexedDB (and with it the lock record), `localStorage` (and with it the lock marker), Cache Storage and the service worker, then reloads. Also reachable from the Landing page and from the lock screen — which is how a forgotten passphrase is dealt with |
| **Delete one assessment** | History → Delete, with a short undo window |
| **Export** | *Export my inputs*, *Export feedback*, *Save as a file…* on the practitioner summary (a structured summary of what that page shows, in sections the person switches on or off — the typed medicine names and the saved note start off — described by a [published schema](schemas/README.md)) and *Make a backup* (Settings → Your data, optionally protected with a passphrase) are explicit user actions with a warning that the file contains health data; there is no automatic upload; there is no "share link". A backup or a summary file is built in memory and handed to the browser as a download (or the system share sheet where the browser offers it); the app keeps no record of where either went. A file chosen for *Restore* is read in the page, checked and shown before anything is written, and is never uploaded |
| **Print / PDF** | The user's own browser handles it; the print view includes the data the user chose to show |
| **Device and backups** | Browser storage may be included in device backups or be visible to other people using the same browser profile — the privacy page says so and recommends erasing on shared devices, or turning on the lock (Settings → Lock the history): *You can lock the history on this device with a passphrase. We cannot recover it.* A backup file is not under the lock; it can be protected with its own passphrase |
| **Private browsing / blocked storage** | The app works in memory; the "Not saved" chip is shown; nothing is persisted |

---

## 4. Special categories

### 4.1 Health data
Sensitive in every context. It is (a) never transmitted — the one exception is the conversation, and in a development build a photo, of a person who turned on AI help, sent per request and kept nowhere (§2, [impact assessment](post-mvp/privacy/ai-help-dpia.md)) — (b) never written to logs or error messages, (c) never used in tests (tests use **synthetic vignettes only**, [test plan §3](test-plan.md)), (d) never put in screenshots or bug reports without the user explicitly exporting it.

### 4.2 Birth data
Optional; not medically necessary; not clinically validated for health use. The release build keeps the module **off until the user turns it on**, with the N-BIRTH statement. Consent is a visible, specific toggle on the Birth card (not buried in general terms) and may be withdrawn at any time (turning it off clears the in-memory birth data and any remembered copy).

### 4.3 Children
Under-18 users get a blocking notice and restricted output; the app does not target minors and does not collect anything beyond what an adult would enter. No age is verified (no identity data is collected).

### 4.4 Pregnancy and medications
Collected only for the safety filter; subject to the same local-only handling.

---

## 5. Compliance posture (design intent — legal review required)

| Regime (examples) | Relevance | Design response |
|---|---|---|
| GDPR (EU/UK) | Health data is a special category; but with no controller-side processing there is no data held by the project | Local-only, no accounts; hosting logs minimised; a short statement explaining that the user holds the data; revisit if any server component or sync is added |
| Taiwan PDPA (個人資料保護法), Hong Kong PDPO, mainland PIPL | Same | Same; the statement is provided in zh-Hant first |
| US state health-privacy laws | Wellness app positioning | Same; no sale, no sharing, no tracking |
| Consent | Needed only where data would leave the device | Not applicable in MVP; birth-data opt-in is a UX consent for local processing. **AI help (Release F):** explicit consent per module — the conversation, the tongue's photo, the face's photo, each with its own statement — before anything is sent, with the statement's version recorded; withdrawal is one switch in Settings ([impact assessment §8](post-mvp/privacy/ai-help-dpia.md#8-rights-of-the-person)) |

**Triggers for a full privacy and consent redesign (DPIA-style review):** accounts or cloud sync, any analytics beyond aggregate opt-in counters, server-side processing, error reporting that might include inputs, tongue-photo analysis (image data), or sharing features. **AI help is such a trigger**: server-side processing of health data, with consent, for those who opt in — the owner is the controller, the gateway's host and the model provider are processors; the draft assessment and the data-processing agreement's checklist are in [`post-mvp/privacy/ai-help-dpia.md`](post-mvp/privacy/ai-help-dpia.md) (task PM-44, to be reviewed).

---

## 6. Developer rules

1. No `console.log` of inputs, findings, results, birth data or notes outside the dev profile; the release build strips `console.*` in app code and the error boundary logs only error class and component name.
2. No health data in URLs, `document.title`, `history.state`, `postMessage` or `BroadcastChannel`.
3. No new third-party script, font or network call without a privacy review and an update to CSP and this document.
4. Storage access only through `storage.ts`; keys and schema are documented there; every new stored field is added to the inventory in §2 in the same change.
5. Tests, fixtures, screenshots and golden cases contain **synthetic** data only; the dev "export case" tool strips free text and birth data by default.
6. Crash and bug reports use ids and versions only; the "Report a problem" link pre-fills KB/engine versions and item ids, never inputs.
7. AI help: one request builder is the only code that sends health data, and it is given the conversation, the vocabulary and the confirmed ids — never the profile, birth data, notes or the history (tested); the gateway logs counts and status codes, never content (tested); the conversation text is held in memory, never in storage. A photo (PM-50) is sent only by the photo screen's Send button, after the person has seen it; the request builder is given the picture and the module's features, nothing of the profile; the picture is re-encoded on the device without metadata, checked again at the gateway, held on a canvas only, and emptied when it is dropped.

---

## 7. Verification

| Check | How |
|---|---|
| No network after load | Playwright test that fails on any request not to the same origin after the KB is loaded; CSP header asserted in the built output |
| Nothing sensitive in URLs/logs | E2E scans `location`, history entries and console output over a full assessment with a marker value in each field |
| Erase works | E2E fills data, erases, asserts IndexedDB, `localStorage` and Cache Storage are empty and the draft is gone |
| Birth data not persisted by default | E2E with "remember" off (also with the Settings default off): reload → birth data absent, saved result holds no birth moment |
| Storage failure | Unit tests for `storage.ts` with throwing storage; E2E in a context with blocked storage shows "Not saved" and still produces a result |
| Dependency review | Lockfile, `pnpm audit`, license check in CI |
| AI help sends only what it should | A unit test of the request builder (a profile, birth data and a note with marker values never appear in a request); the gateway's contract tests (no content in its log, the kill switch, the limits); `check-release` rule 17: a release has AI help off, no gateway origin in its CSP and none of AI help's code; E38: no request reaches the gateway before consent, and none after withdrawal; the photos (PM-50): a unit test that the request holds only the picture and the module's features, the gateway's tests that a picture with metadata is refused and that no log line holds a pixel, E42 that nothing is sent by choosing a picture, that a picture made to carry a place, a time and a comment arrives without them, that no store of the page holds the picture, that the camera is never asked for, and `check-release` rules 11 (`camera=()`) and 17 (no photo code in a release) |

---

## 8. User-facing privacy statement (draft outline)

The public text (zh-Hant first, then English) will cover: what the app is; **what stays on your device** (everything you enter, including birth data if you choose to enter it); that **nothing is sent** to us or anyone else; what is stored and for how long; how to delete it; shared-device and backup caveats; hosting logs; birth data is optional and not clinically validated; children; how to report a problem (no health data needed); contact; change history. Draft headline: *「您輸入的資料只會留在您自己的裝置上，不會傳送給我們或任何第三方。」* / *"What you enter stays on your own device and is not sent to us or to any third party."*

**AI help (draft wording, for the reviewers):** *If you turn on AI help, what you type in the conversation is sent — only while you use it — to our service and to the AI provider we name, to suggest findings you then confirm. Nothing is kept by us or by them, and nothing that identifies you is sent: please do not type your name or contact details. You can turn it off at any time in Settings; the questions without AI give the same result.* · 「開啟 AI 協助後，您在對話中輸入的文字會在使用當下傳送到本服務與我們指明的 AI 服務商，用來提出由您確認的症狀；我們與服務商都不保存，也不傳送可辨識您身分的資料——請勿輸入姓名或聯絡方式。您可隨時在設定中關閉；不用 AI 的問答會得到相同的結果。」

**AI help, photos (draft wording, development builds, for the reviewers):** *If you turn on photo help, a photo you choose is shrunk on your device, stripped of place, time and camera details, and sent once — when you press Send — to our service and to the AI provider we name, to suggest which of the app's own tongue or face features it shows. You confirm each suggestion yourself. Neither we nor they keep the photo, and the app never saves it. Please keep other people, documents and screens out of the picture. You can turn it off at any time in Settings; the questions without AI give the same result.* · 「開啟照片協助後，您選的照片會先在裝置上縮小，並去掉地點、時間與相機資料，只在您按下「傳送」時，一次傳送到本服務與我們指明的 AI 服務商，用來提出它看起來符合應用程式自己清單中的哪些舌象或面色項目，再由您逐項確認。我們與服務商都不保存照片，應用程式也不會儲存。請讓畫面中不要有其他人、文件或螢幕。您可隨時在設定中關閉；不用 AI 的問答會得到相同的結果。」

---

## 9. Open questions

**Decided 2026-10-04** (MVP; to be revisited after the MVP is finished):

| # | Question | Decision (MVP) |
|---|---|---|
| PQ1 | Hosting provider and its log/retention behaviour | Cloudflare Pages ([tech spec TQ1](tech-spec.md#13-open-technical-questions)); host analytics stay off; the public statement says the host processes request metadata (IP address, user agent, URL) under its own policy and that answers never reach it |
| PQ2 | Whether a PIN/passcode lock for the local history is wanted | Post-MVP; "Erase" is the MVP control |
| PQ3 | Encrypting IndexedDB content at rest with a user passphrase | Post-MVP (protects against shared-profile access, adds recovery burden) |
| PQ4 | Whether opt-in aggregate counters (no answers) are ever added | Not in MVP |
| PQ5 | Retention default for history (unlimited vs auto-expire) | Unlimited, with a visible count and delete-all |

Since then (post-MVP, [decisions register](post-mvp/decisions.md)): PQ2 and PQ3 are answered together by one mechanism, the optional passphrase lock, built in PM-20; there is no screen-only PIN.

---

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-04 | Initial privacy design |
| 0.2 | 2026-10-06 | The local data lock (PM-20): rows for the passphrase, the data key, the lock record, the lock marker and the idle time; the paragraph on what is encrypted; the storage, erase and device rows |
| 0.3 | 2026-10-06 | How seasons are counted (PM-26): the `seasons` preference (low sensitivity; travels in a backup when chosen), the basis stamped on a result made on another basis, and the device's time zone read only to suggest a default |
| 0.4 | 2026-10-06 | The hour near a change (PM-27): the answer *which hour is nearer the truth* is kept with the unfinished assessment only together with the birth data, and a saved result keeps the choice — `primary`, `alternative` or `unknown` — and never the time; the pillars and the true solar time are still removed unless the birth data is remembered |
| 0.5 | 2026-10-06 | The season model (PM-29): the development profile's `seasonModel` preference (low sensitivity, never in a backup, not read by a release); the summary file's optional `exportedFrom.seasonModel` and `seasons` say how the season was counted and hold nothing about the person |
| 0.6 | 2026-10-06 | The kept backup file (PM-32): the encrypted file in a folder the person chose, its record in IndexedDB (the handle and a hash — never the passphrase) and the passphrase held in memory only |
| 0.7 | 2026-10-07 | The personalised prescription (PM-41): a derived field inside a saved result, made only by a development build (a release build has no herb records and refuses a record that holds one on import); nothing new is collected — it is computed from the result and the inputs the result already holds |
| 0.8 | 2026-10-08 | AI help (PM-44; PD-21 approved by the owner): inventory rows for the consent, the conversation (memory only on the device; sent per request, kept nowhere), what travels with a turn, the session token and the confirmed findings; the network exception and the one exception to *health data is never transmitted*; consent per module; developer rule 7 and the verification row; the redesign trigger and the impact assessment's draft ([`post-mvp/privacy/ai-help-dpia.md`](post-mvp/privacy/ai-help-dpia.md)); the statement's draft paragraph. To be reviewed with the assessment |
| 0.9 | 2026-10-08 | The conversation built (PM-47): a message that names a red flag is not sent, and waits in memory; the request carries the whole vocabulary so that it says nothing of the profile |
| 0.10 | 2026-10-08 | The reading role (PM-53): a low-sensitivity preference, carried in a backup; results stamped with their role |
| 0.11 | 2026-10-08 | The reading role gains the value *general* (PM-54) |
| 0.12 | 2026-10-08 | The photo of the tongue and the face (PM-50; development builds only, PD-25): inventory rows for the photo (memory only, sent once on Send, shrunk and without metadata), what travels with it and the confirmed features; the consent per module; no camera permission in any build; no photo code in a public build; the draft wording of the photo statement; the verification rows |
