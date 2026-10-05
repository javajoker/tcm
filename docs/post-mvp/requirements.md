# Post-MVP Requirements

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Proposed requirements for Releases A–D; they enter the [PRD](../PRD.md) FR list as each feature ships (fold-in, [README §2](README.md#2-standing-constraints)) |
| **Last updated** | 2026-10-05 |
| **Audience** | Product, engineering, reviewers |
| **Related** | [Roadmap](roadmap.md) · [Decision register](decisions.md) · [PRD §6, §7](../PRD.md#6-functional-requirements) · [Privacy](../privacy.md) · [Safety policy](../safety-policy.md) |

> **How to read an entry.** *Class* is the review class ([README §3](README.md#3-review-classes)). *Refines* names the PRD requirement or decision it extends. Acceptance criteria are written so that a test or a review record can show them; "the build fails" means a CI check, not a convention.
> Priority is **P2** (post-MVP) throughout; the order is the release.

---

## 1. Release A — Reach and resilience

### FR-21 Simplified Chinese interface — Release A · Class L · refines FR-2, G4, Q6

The whole flow, the in-app text, the knowledge-base content and the printed and exported summaries are available in Simplified Chinese (Mainland usage), selectable like the other languages. Traditional Chinese stays the default and the source of truth; Simplified is derived from it and from the Simplified source texts, never written separately.

Acceptance:
1. `/zh-Hans/…` serves every route. The aliases `zh-cn`, `zh-hans` and `zh-sg` redirect to it; `zh` keeps meaning `zh-Hant` so that existing links do not change. The host files and `check-release` know the new segment.
2. Every message key and every knowledge-base string has a Simplified form; **no fallback to Traditional or English occurs**, and any fallback fails the build.
3. No Traditional-only character appears in Simplified text, outside text that is explicitly quoted in its source script. The glossary has a Simplified column and the glossary-conformance check covers it.
4. The engine's output is identical whatever the language (a test over the typical patients and the vignettes); language changes presentation only.
5. A one-time, dismissible offer appears for browsers whose first language is `zh-CN`, `zh-Hans` or `zh-SG`, as for English today; the language is never switched silently.
6. Layout holds at 320 px and 200 % zoom; Simplified glyphs use a Simplified font stack (`lang` attribute set); visual baselines exist.
7. Lazy cost only: initial JavaScript changes by at most 1 KB; a Simplified session downloads the Simplified catalogue and the Simplified variants of the knowledge chunks *instead of* the Traditional knowledge chunks, so it costs no more than a Traditional one plus the catalogue (≈ 19 KB gzip); other sessions add nothing.
8. The emergency numbers do not depend on the language: they follow the region rules of FR-29 (a chosen region or a time-zone match, never the language), so a Simplified-Chinese reader sees the generic "use your local emergency number" text until a region applies.
9. The build carries the draft label until the linguistic review (Mainland usage) and the legal review of the notices are recorded.

### FR-22 Offline use and installation — Release A · Class N · refines TQ6, [E15](../test-plan.md#5-application-tests)

After the first visit the app works without a network and can be installed like an app.

Acceptance:
1. After one successful load of a build, with the network disabled: the landing page, a complete assessment (every screen, every lazy chunk of the build including the knowledge-base chunks of the profile), the result, history, compare, print, settings and sources all work. Tested in Chromium, WebKit and Firefox.
2. A new version is detected in the background and **applied only when no assessment is in progress or when the person chooses**; it never reloads the page during an answer; the draft survives (it is already saved after every answer). The person sees "A new version is ready" with a reload action.
3. Nothing personal ever enters the Cache Storage: a test lists the cache and finds only files of the build. The worker handles same-origin `GET` requests only and never touches a request carrying a body.
4. Settings shows whether the offline copy is ready and offers **Remove offline copy**; *Erase everything* already clears Cache Storage and still does.
5. The page is installable: standalone display, start URL, icons (the maskable icon exists), theme colours. The install button appears only where the browser offers one; on iOS Settings explains "Add to Home Screen" in words. No pop-ups, no repeated prompts.
6. A broken worker can be removed: `sw.js` is never cached by the host, a version header is checked on start, and an app that fails to start twice in a row unregisters its worker and reloads from the network.
7. `check-release` fails when the precache list differs from the files of the build, when the worker names an external URL, or when the worker exceeds 10 KB gzip.

### FR-23 Backup, restore and data portability — Release A · Class N · refines FR-12, FR-13, PQ5

The person can keep their own copy of their data and move it to another device, with an optional passphrase.

Acceptance:
1. **Export** writes one file with the assessments and the preferences the person selects (a list of what is included is shown first). Birth data is included only if the person stored it on the device ("Remember"), never from session memory. The file records the format, the storage schema, the app, knowledge-base and engine versions, the profile, the time, the record count and a checksum of the content.
2. **Passphrase option:** the file is encrypted with a key derived from the passphrase (WebCrypto only); a wrong passphrase gives a plain error and changes nothing; a forgotten passphrase cannot be recovered and the dialog says so before it is set.
3. **Import** validates the format, version, size and every record before anything is written; shows what would be added or replaced; lets the person choose *skip existing*, *keep both* or *replace if newer*; migrates older storage schemas forward and refuses newer ones with a clear message; is transactional (all or nothing); never overwrites the current draft unless asked.
4. **Profile rule:** a release build refuses records saved under the dev profile (they may contain content the release bundle does not have); a dev build accepts both.
5. **Safety of parsing:** files over 20 MB, truncated or tampered files, and records with unexpected or prototype-polluting keys are rejected without an unhandled error; nothing imported is rendered as markup.
6. **Storage health** (Settings): usage estimate, whether storage is persistent, a plain explanation of how browsers discard data, a request for persistent storage after the first saved assessment (on a click), and an optional backup reminder (after five new assessments or 30 days, dismissible, never a network message).
7. Property test: for generated histories export → import into an empty store gives equal records; the encrypted round trip too; a fuzz run over damaged files never leaves partial data.

### FR-28 Tap-tempo pulse — Release A · Class N · refines FR-6, UQ3

An alternative to the 30-second timer: tap in time with the felt pulse; the app derives the rate and an irregularity hint.

Acceptance: the estimate comes from the median of the intervals with outlier rejection and needs at least 12 taps; simulated steady taps with up to 30 ms of jitter are estimated within ±3 beats per minute in at least 95 % of runs; fewer taps or a spread above a stated limit gives "not enough to tell" and nothing is entered; a result within 3 beats per minute of a rapid or slow band edge says so and leaves the choice to the person; irregular timing suggests, never decides, the *irregular* rhythm; the same fields are filled as by the timer and the method (tap) is recorded beside the rate and shown in the review and the practitioner summary; the control works with the keyboard (Space), a screen reader and reduced motion; the educational note and the "stop if you feel unwell" line are unchanged.

### FR-29 Region packs — Release A · Class L (and legal) · refines Q1, SQ1

A region is data: emergency and crisis numbers, region-specific notices, the suggested language and, optionally, city extras. Adding one needs no code.

Acceptance: numbers are shown only for a region the person chose or whose declared time zone matches the device's — there is no silent default, and the Taiwan default of the MVP becomes a time-zone match; `emergency.json` rows carry a verification record (who, when, source) no older than 24 months; in a build **without the draft label** only verified rows reach the bundle and a draft row fails `check-release`; everyone else sees the generic "use your local emergency number" text with the region selector; the notice wording comes from the safety-policy tables, not from region code. Hong Kong is the first candidate; no row is added without a regional verifier.

---

## 2. Release B — Learn and follow up

### FR-14 Knowledge browser — Release B · Class N (herbs: C, Release C) · refines FR-14

Browse what the app knows, with provenance, without taking an assessment.

Acceptance:
1. Pages exist for patterns, constitutions, formulas, acupoints, foods, quotations and glossary terms (herbs follow in Release C). Each page shows names as *Chinese · pinyin · English*, the content the result report would show, its sources and verification state, its review state (draft label while draft), and links to related pages.
2. Search covers Traditional, Simplified, English and aliases, and the pinyin the data already carries (glossary terms and the pinyin names of formulas), offline; a name without pinyin in the data is found by its Chinese and English forms (adding pinyin for every name is a data task that needs a pinyin library and an approval to download).
3. **Anonymous context rule:** pages are never personalised. Anything that reads like advice (a formula, a food, a point) is shown with its cautions beside it — pregnancy, interactions, allergies, the tier — and a line saying it is general information and not advice for the reader. No second-person wording.
4. A release build shows only what its bundle contains (tier-A formulas, no amounts, no herb weights); the dev build shows everything with the dev banner.
5. Every page lists at least one citation or says "no source"; a clinical statement with neither fails the build.
6. Pages are deep-linkable and contain no personal data; the build stays `noindex` while any shown content is draft; a page prints cleanly.
7. Lazy cost: the learn routes add at most 40 KB gzip of JavaScript and reuse the existing data chunks; axe-clean in light and dark; keyboard and screen-reader operable.

### FR-25 Pattern comparison — Release B · Class N · refines FR-9, K-07

Two or three patterns side by side.

Acceptance: shows the principle, the symptoms they share, the symptoms that tell them apart (as bands, not raw weights), the question or questions of the bank that separate them, the tongue and pulse notes and the formulas; reachable from a pattern page and from the "also considered" list of a result; the comparison of a result's patterns marks which distinguishing symptoms the person answered (the same content as *What would change this*), without a new score.

### FR-26 Structured practitioner export — Release B · Class N · refines FR-13

A file and a print that a practitioner can read or process.

Acceptance: a versioned JSON summary with a published schema (complaints, findings with state and severity, observations, constitution tendency, panel bands, pattern hypotheses with confidence, safety context and the notices shown, versions) plus the existing print view; limited to the output level of the profile; a preview with toggles for the sensitive parts (birth data off by default; free-text medicine names only if ticked); shared by download or the system share sheet where the browser offers it (always a click, never an upload); every field is in the privacy inventory; strings pass the wording lint; the file is not an import format — the backup file is.

### FR-27 Follow-up and trends — Release B · Class L · refines FR-12

Looking again later, and seeing change over time.

Acceptance:
1. **Nudge:** after saving, the person may choose *look again in 2, 4 or 8 weeks* (default none); a dismissible card appears on later visits. No push message: it would need a server.
2. **Calendar file:** an `.ics` entry with the date and a link to the app root and **no health content** (title "TCM Self-Check — time to look again"); the dialog says the entry will live in their calendar.
3. **Trends** appear with three or more assessments in one *series* (same parameter fingerprint and engine major version): a timeline of bands per five-phase element and the two eight-principle axes, and of the pattern hypotheses, with the season at each point and a table twin. A change of version starts a new segment, drawn after a gap and labelled "measured with a different version"; nothing is compared silently across it. A change in the person's own situation between points (pregnancy status, a long-term condition) is marked.
4. Wording never says *better*, *worse*, *improved* or gives a score; it says what changed ("Dampness is now in the *mild* band"); the wording is reviewed (class L).

### FR-24 Local data lock — Release B · Class N (security review) · refines PQ2, PQ3

Optional passphrase protection of the stored history.

Acceptance:
1. With the lock on, IndexedDB holds no plaintext of the sensitive records (assessments, the draft, saved birth data); a test scans the raw stored bytes for known strings. Preferences and the disclaimer record stay readable so that the lock screen can use the chosen language and theme.
2. The key is derived with PBKDF2-SHA-256 (at least 600 000 iterations) and records use AES-256-GCM, both from WebCrypto; the derived key is non-extractable and held only in memory.
3. The app asks for the passphrase on open, locks after idle (default 10 minutes, adjustable) and on *Lock now*; autosave never writes plaintext while locked; five wrong tries slow the next one down (honest note: this does not stop an offline attack, the passphrase strength does).
4. Minimum length 10 characters with a strength hint; there is **no recovery**; enabling requires a fresh backup first (FR-23) and the dialog says plainly that a lost passphrase loses the data.
5. Turning the lock off or changing the passphrase re-encrypts in one transaction and survives an interruption (the old data stays valid until the new is complete).
6. Stated scope: it protects against someone who gets the device or its browser profile; it does not protect against malware, a malicious extension, or a session that is already unlocked.

---

## 3. Release C — Breadth

### FR-30 Library expansion — Release C · Class C · refines Q2, K-19

More patterns and complaint modules, added by one repeatable process.

Acceptance: a pattern or module is admitted only if it passes the admission checklist (library-expansion design, A-26): at least two independent sources cited and verified; at least three discriminating questions against each confusable neighbour (or a recorded reason there are none); tongue and pulse features; a verified tier-A formula or an explicit "no formula"; safety rules and the red-flag mapping; golden seed and vignettes; review records for its area. The checks a machine can make run in `validate_kb`. The pattern self-test, the margin rule (≥ 20 points to the nearest neighbour), the property suite, the vignettes and parity all stay green. Acute febrile stages beyond the early exterior (營分, 血分) are mapped to red flags, not to patterns.

### Herb browser — Release C · Class C · refines FR-14

The 609 derived herbs become browsable. Acceptance: a delivery that keeps the per-session knowledge budget (a compact browse index plus detail shards fetched on demand); only herbs covered by the sample review of derived herbs (V-04) are shown without the draft label; each page carries the toxicity, pregnancy and interaction flags and the sources.

### FR-31 Five-phase extensions — Release C · Class N or C by item · refines [algorithm spec §14](../wuxing-algorithm.md#14-open-items)

Acceptance, per item: (a) **Southern hemisphere** — the season shown follows a hemisphere choice (asked once, with a default from the region), the birth chart is unaffected, and the change is a parameter-version change with parity cases; (b) **Ambiguous hour** — births within the stated margin of an hour boundary show both hour pillars as alternatives and let the person choose, the engine already exposes the corrections; (c) **Astronomy data** — the VSOP87 tables are regenerated in the repository from the official archive with a pinned SHA-256 and the oracle vectors still match within tolerance (needs permission to download the archive); (d) **Season model** — the 長夏 model is a declared parameter shown with every result that depends on it.

---

## 4. Release D — Research (each is a spike first)

| ID | Feature | Entry criteria | Stop conditions |
|---|---|---|---|
| FR-32 | **Tongue-photo assistance**, on the device only | A written evaluation protocol; datasets with a clear licence and consent; a clinical advisor to label; a privacy and legal review; no upload and no stored image by default | Accuracy below the protocol threshold on any lighting, camera or skin-tone stratum; a licence or consent gap; assistance that would be read as diagnosis |
| FR-33 | **Camera pulse** (fingertip) and heart-rate-strap prefill | A protocol against a reference device; the output limited to rate and rhythm hints | Error above the stated bound; unsafe or confusing instructions; any new diagnostic claim |
| FR-34 | **File-based sync**: automatic saving of an encrypted backup to a file or folder the person chooses | Release A backup and installed app; browser support for choosing a file | Any need for a server; data loss in the interruption tests |

The designs, protocols and stop conditions are in the research-tracks design (A-28). Shipping any of them is a separate decision with its own review class and gates.

## 5. Not planned

Accounts and server-side sync · e-commerce, herb sales, practitioner marketplaces, telemedicine · LLM-generated diagnosis or advice · automatic telemetry or analytics · native app wrappers. Reasons and what would change them: [decision register](decisions.md).

## 6. Non-functional changes

| Area | Change |
|---|---|
| Performance | Unchanged targets. New: service worker ≤ 10 KB gzip; Simplified session ≤ +25 KB gzip over a Traditional one; learn routes ≤ +40 KB gzip of JavaScript; herb shards fetched on demand |
| Privacy | New stored data (backup files the person holds, lock metadata, follow-up date, region choice) enters [privacy §2](../privacy.md) in the commit that adds it; the list of "never collected" is unchanged; no new network request carries user data; `connect-src` stays `'self'` |
| Security | WebCrypto only for cryptography; no new runtime dependency without the licence allow-list and an approval to download; `worker-src 'self'` and `manifest-src 'self'` added to the policy; imported files are untrusted input |
| Accessibility | WCAG 2.1 AA as before; every new screen is in the axe sweep (jsdom and real browser) and the keyboard end-to-end tests |
| Browser support | As before; offline, install, share and file-picker features degrade to "not available here" with an explanation, never to an error |
| i18n | Three UI languages: `zh-Hant` (source), `zh-Hans`, `en`; key coverage and purity checks for each |
| Content integrity | Unchanged; every new clinical statement carries a citation and passes the review gate of its class |

## 7. Traceability

| Requirement | Release | Class | Design (task) | Implementation tasks |
|---|---|---|---|---|
| FR-21 | A | L | Simplified Chinese (A-20) | PM-01 … PM-03 |
| FR-22 | A | N | Offline use (A-21) | PM-04 … PM-06 |
| FR-23 | A | N | Backup (A-22) | PM-07 … PM-10 |
| FR-28 | A | N | Tap-tempo and regions (A-23) | PM-11 |
| FR-29 | A | L | Tap-tempo and regions (A-23) | PM-12 |
| FR-14, FR-25 | B | N | Knowledge browser (A-24) | PM-13 … PM-16 |
| FR-26, FR-27 | B | N, L | Export, follow-up, trends (A-25) | PM-17 … PM-19 |
| FR-24 | B | N | Backup and lock (A-22) | PM-20 |
| FR-30 | C | C | Library expansion (A-26) | PM-21 … PM-23 |
| Herb browser | C | C | Knowledge browser (A-24) | PM-24, PM-25 |
| FR-31 | C | N, C | Five-phase extensions (A-27) | PM-26 … PM-29 |
| FR-32 … FR-34 | D | R | Research tracks (A-28) | PM-30 … PM-32 |

## 8. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial post-MVP requirements (FR-21 … FR-34) |
