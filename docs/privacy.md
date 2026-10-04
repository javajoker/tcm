# Privacy and Data Handling

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design document; the user-facing statement (§8) needs legal review before release |
| **Last updated** | 2026-10-04 |
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
| Preferences | language (only once the user has chosen one), theme, text size, emergency-number region, "English offer dismissed" flag | Low | Personalisation; the one-time English offer is shown only while no language has been chosen | `localStorage` key `tcm.prefs` | Until erased | Settings |
| Basic profile | age, sex at birth, pregnancy/lactation, region, lifestyle | **Sensitive (health)** | Safety scope and context | IndexedDB (draft, history) | Until the user deletes the assessment | Edit, delete |
| Medications, allergies, chronic conditions | classes, allergens, listed conditions, free-text medicine names the user types (never interpreted) | **Sensitive (health)** | Safety filter | IndexedDB | Same | Same |
| Red-flag answers and acknowledgements | which items (yes / no / not sure), corrections ("I made a mistake"), time each notice was acknowledged | **Sensitive (health)** | Notices, record of acknowledgement | IndexedDB | Same | Same |
| Findings | symptoms, tongue, pulse, constitution answers | **Sensitive (health)** | Pattern differentiation | IndexedDB | Same | Same |
| **Birth data** | date, time/unknown, place (longitude, time zone) | **Sensitive (personal)** | Optional innate/annual reference | **Session memory only unless "Remember on this device" is ticked** (default off) → then IndexedDB | Session, or until deleted | Opt-in toggle; erase |
| Results | assessments, reasoning, recommendations (with KB/engine versions) | **Sensitive (health, derived)** | History and compare | IndexedDB | Until the user deletes | Delete one/all |
| Free-text notes | anything typed | Sensitive | Memo for the user | IndexedDB | Same | Same |
| Feedback marks | match / partly / no | Low | Optional calibration export | IndexedDB | Same | Export or delete |
| Technical | app/KB/engine versions, profile | Low | Reproducibility | Inside saved results | Same | — |

**Never collected:** name, email, phone, account identifiers, device identifiers, precise location, IP addresses by the app, contacts, photos (no photo upload in MVP).

---

## 3. Storage, transmission and erasure

| Topic | Design |
|---|---|
| **Network** | After the page and knowledge-base chunks load, the app makes no requests; CSP `connect-src 'self'` prevents anything else ([tech spec §11](tech-spec.md)). The KB chunks are static files that contain no user data and are fetched with no user-specific parameters |
| **Third parties** | None: no analytics, fonts, CDNs, tag managers, error-reporting services or embedded media in MVP |
| **Cookies** | None |
| **URLs and logs** | Routes contain only a random local assessment id; birth data, answers and notes never appear in URLs, titles, history state or console output in release |
| **Hosting logs** | The static host may log request metadata (IP, user agent, URL) as web servers do. Choose a host that allows disabling or truncating logs, and state this in the public statement; none of this log data can include answers because answers are never sent |
| **Storage mechanisms** | `localStorage` (preferences, acknowledgement) · IndexedDB `tcm-app` (drafts, assessments). All access goes through one module that catches errors and falls back to memory with a visible "Not saved" indicator |
| **Persistence of birth data** | Off by default. When off, the raw birth moment lives only in memory for the session; a saved result keeps the derived panel and a flag *birth data used*, not the birth moment, and "re-run" asks again |
| **Erase everything** | Settings → one named dialog ("Erase everything on this device"): deletes IndexedDB, `localStorage`, Cache Storage (if a service worker is added), then reloads. Also reachable from the Landing page |
| **Delete one assessment** | History → Delete, with a short undo window |
| **Export** | *Export my inputs* (JSON) and *Export feedback* are explicit user actions with a warning that the file contains health data; there is no automatic upload; there is no "share link" |
| **Print / PDF** | The user's own browser handles it; the print view includes the data the user chose to show |
| **Device and backups** | Browser storage may be included in device backups or be visible to other people using the same browser profile — the privacy page says so and recommends erasing on shared devices |
| **Private browsing / blocked storage** | The app works in memory; the "Not saved" chip is shown; nothing is persisted |

---

## 4. Special categories

### 4.1 Health data
Sensitive in every context. It is (a) never transmitted, (b) never written to logs or error messages, (c) never used in tests (tests use **synthetic vignettes only**, [test plan §3](test-plan.md)), (d) never put in screenshots or bug reports without the user explicitly exporting it.

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
| Consent | Needed only where data would leave the device | Not applicable in MVP; birth-data opt-in is a UX consent for local processing |

**Triggers for a full privacy and consent redesign (DPIA-style review):** accounts or cloud sync, any analytics beyond aggregate opt-in counters, server-side processing, error reporting that might include inputs, tongue-photo analysis (image data), or sharing features.

---

## 6. Developer rules

1. No `console.log` of inputs, findings, results, birth data or notes outside the dev profile; the release build strips `console.*` in app code and the error boundary logs only error class and component name.
2. No health data in URLs, `document.title`, `history.state`, `postMessage` or `BroadcastChannel`.
3. No new third-party script, font or network call without a privacy review and an update to CSP and this document.
4. Storage access only through `storage.ts`; keys and schema are documented there; every new stored field is added to the inventory in §2 in the same change.
5. Tests, fixtures, screenshots and golden cases contain **synthetic** data only; the dev "export case" tool strips free text and birth data by default.
6. Crash and bug reports use ids and versions only; the "Report a problem" link pre-fills KB/engine versions and item ids, never inputs.

---

## 7. Verification

| Check | How |
|---|---|
| No network after load | Playwright test that fails on any request not to the same origin after the KB is loaded; CSP header asserted in the built output |
| Nothing sensitive in URLs/logs | E2E scans `location`, history entries and console output over a full assessment with a marker value in each field |
| Erase works | E2E fills data, erases, asserts IndexedDB, `localStorage` and Cache Storage are empty and the draft is gone |
| Birth data not persisted by default | E2E with "remember" off: reload → birth data absent, saved result holds no birth moment |
| Storage failure | Unit tests for `storage.ts` with throwing storage; E2E in a context with blocked storage shows "Not saved" and still produces a result |
| Dependency review | Lockfile, `pnpm audit`, license check in CI |

---

## 8. User-facing privacy statement (draft outline)

The public text (zh-Hant first, then English) will cover: what the app is; **what stays on your device** (everything you enter, including birth data if you choose to enter it); that **nothing is sent** to us or anyone else; what is stored and for how long; how to delete it; shared-device and backup caveats; hosting logs; birth data is optional and not clinically validated; children; how to report a problem (no health data needed); contact; change history. Draft headline: *「您輸入的資料只會留在您自己的裝置上，不會傳送給我們或任何第三方。」* / *"What you enter stays on your own device and is not sent to us or to any third party."*

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

---

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-04 | Initial privacy design |
