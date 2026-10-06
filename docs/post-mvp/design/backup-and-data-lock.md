# Design: Backup, Restore, Storage Health and the Local Data Lock

| | |
|---|---|
| **Version** | 0.6 |
| **Status** | Release A (FR-23; tasks PM-07 … PM-10) and Release B (FR-24; PM-20). PM-07 to PM-10 are built (Release A's backup work is complete): the file format, the validating importer with the replay check, the plan and the one-transaction write, the lint rule against raw markup, and the screens (Your data, the two dialogs, the reminder, the Imported mark). The encrypted envelope (PM-09) and storage health (PM-10) too. The lock (PM-20, Release B) is built ([§5.6](#56-as-built-pm-20)); its security review is a human task that is still to be done |
| **Last updated** | 2026-10-06 |
| **Audience** | Engineers, whoever reviews security and privacy |
| **Related** | [Requirements FR-23, FR-24](../requirements.md#fr-23-backup-restore-and-data-portability--release-a--class-n--refines-fr-12-fr-13-pq5) · [Privacy §2, §3, §6](../../privacy.md) · [Tech spec §8.3, §11](../../tech-spec.md) · [Decisions PQ2, PQ3, PQ5, PD-04, PD-05](../decisions.md) |

> **Summary.** The person's history lives only in one browser, which can discard it. Release A gives them a file they hold: a versioned JSON backup, optionally encrypted with a passphrase, that restores on any device — with a validating importer that treats the file as untrusted and can *prove* a record genuine when it was made by the same version, because the engine is deterministic. A storage-health view explains the risk in plain words. Release B adds an optional lock: the stored records are encrypted with a random data key that a passphrase unlocks, so a stolen browser profile reveals nothing. There is no recovery by design, and a fresh backup is required before the lock can be turned on.

---

## 1. Goal and non-goals

**Goal.** The person can keep, move and protect their own data without any server.

**Non-goals.** Accounts, sync through a service we run, recovery of a forgotten passphrase, protection against malware or a malicious browser extension, a screen-only PIN (PD-05), backups made automatically behind the person's back.

## 2. What exists today

| Fact | Consequence |
|---|---|
| All storage goes through one module (`storage/persistence.ts`); IndexedDB `tcm-app` has stores `drafts`, `assessments` and a **reserved, unused `meta`**; `localStorage` has `tcm.prefs` | Backup, import and the lock live in this module; `meta` is the natural home of lock metadata |
| Every record is an envelope `{ v, data }`; reading migrates forward, refuses newer versions, returns "absent" for anything else | The backup reuses the envelopes and the migration table; a file from a newer app is refused with a clear message |
| A `SavedAssessment` holds the **inputs** (subject, profile answers, screening, findings, context, birth only if remembered), the **engine result**, version stamps (app, knowledge base, engine, parameters, **profile**, language), an optional note and feedback | Restore must not recompute silently ("shown as saved"), yet an untrusted file must not be able to show a result the app never produced |
| A release build lacks doses, tier-C formulas and herb weights; a dev-profile result may reference them | A release build must refuse dev-profile records |
| "Export my inputs" (`format: "tcm-inputs"`) and "Export feedback" exist and download without upload | The backup follows the same idiom (`format`, `version`, `exportedFrom`) |
| `eraseAll` deletes IndexedDB, `localStorage` and Cache Storage | It also removes `meta`, so lock data goes with it |
| Storage can be missing or blocked: the app then runs in memory with a "Not saved" chip | Import and the lock must be disabled with a reason in that state |

## 3. Backup and restore (FR-23)

### 3.1 What a backup contains

| Part | Default | Notes |
|---|---|---|
| Saved assessments | All (a list lets the person untick) | Birth data is inside a record only if the person stored it |
| Preferences | Language, theme, text size, region, auto-advance | **Not** the disclaimer acknowledgement (it must be given again on the new device and version) and not the one-time offer flags |
| Unfinished assessment (draft) | Off | A draft is volatile and tied to a position in the flow; offered with a plain note |
| Lock data | Never | The lock stays on the device it was made on |

### 3.2 File format

Plain (`tcm-backup-YYYY-MM-DD.json`):

```json
{
  "format": "tcm-backup", "version": 1, "createdAt": "2026-10-05T12:00:00Z",
  "exportedFrom": { "appVersion": "…", "kbVersion": "…", "engineVersion": "…", "profile": "release" },
  "storage": { "assessment": 1, "draft": 1 },
  "contents": { "assessments": 12, "draft": false, "prefs": true, "birth": false },
  "checksum": { "alg": "SHA-256", "of": "payload", "value": "<hex>" },
  "payload": { "assessments": [ { "v": 1, "data": { "…": "…" } } ], "draft": null, "prefs": { "…": "…" } }
}
```

The checksum covers the canonical (key-sorted) JSON of `payload`. It detects truncation and damage; it is **not** authentication — nothing client-side can be.

Encrypted (`tcm-backup-YYYY-MM-DD.encrypted.json`): the whole plain document is the plaintext.

```json
{
  "format": "tcm-backup-encrypted", "version": 1, "createdAt": "2026-10-05T12:00:00Z",
  "compression": "gzip",
  "kdf": { "name": "PBKDF2-SHA-256", "iterations": 600000, "salt": "<base64, 16 bytes>" },
  "cipher": { "name": "AES-256-GCM", "iv": "<base64, 12 bytes>" },
  "ciphertext": "<base64, tag included>"
}
```

The unencrypted header is authenticated as additional data, so changing the iteration count or the format name makes decryption fail. Compression uses the browser's `CompressionStream` where it exists and is recorded in the header (`none` otherwise). The header reveals nothing about contents: not even the record count.

### 3.3 Export

1. Settings → **Your data** → *Make a backup*: a list of what will be included, a warning that the file contains health data and that where it is saved (a cloud folder, a USB stick, an email) is the person's responsibility, and the choice *Protect with a passphrase* (default **on** when the lock is on).
2. The file is built in memory, handed to the browser as a download (as "Export my inputs" does) or to the system share sheet where the browser offers it. Nothing is uploaded; there is no link.
3. The time of the export is stored as `lastBackupAt` (a low-sensitivity preference).

### 3.4 Import: the file is untrusted

The person picks a file; the importer works in stages and writes nothing until the end.

| Stage | What it does | On failure |
|---|---|---|
| 1. Read | Size ≤ 20 MB, at most 1,000 records, UTF-8, `JSON.parse` inside a guard | "This is not a backup file" or "too large"; nothing changes |
| 2. Identify | `format` and `version` known; a newer `version` or newer storage schema is refused ("made by a newer version of the app: update first"); an older schema is migrated forward with the same table as stored records | Plain message naming the cause |
| 3. Decrypt | For the encrypted format: derive the key, decrypt, verify the tag; the iteration count must be within sane bounds (a hostile file cannot ask for 10⁹ iterations) | "Wrong passphrase or damaged file"; nothing changes, no hint which |
| 4. Check integrity | The checksum of the payload matches | "The file is damaged" |
| 5. Validate | An **allow-list** validator builds fresh plain objects from known keys only (no prototype keys, no unknown fields passed through), bounds every list and string, checks enumerations, and checks that every symptom, pattern and formula id exists in the current knowledge base **or** marks the record *recorded under a different knowledge base* as older results already are | Invalid records are listed with a reason and skipped; the rest can proceed |
| 6. Profile rule | A release build refuses records whose `profile` is not `release` (they may contain content the release bundle does not have); a dev build accepts both | Listed as "made by a development build" |
| 7. Replay check | For a record whose engine version, parameter fingerprint, knowledge-base version, profile and season model equal the **current** ones, the importer re-runs the engine on the record's inputs at the recorded time (`createdAt` is the engine's own `computedAt`) and compares the result with the file's. A difference means the record was not produced by this version from those answers: **rejected as altered**. The engine is deterministic, so this is an integrity proof that needs no secret. It cannot cover a result that used birth data the person did not remember (the moment is removed from saved results on purpose); such a record is treated like one made by another version (stage 8) | Listed as "does not match its answers" |
| 8. Label | Records that cannot be replayed (made by another version) are kept *as saved* and marked **Imported** with the producing versions; History shows the mark and the result banner says so | — |
| 9. Plan | Each record is *new*, *identical to one already here* (same id and content: skipped silently) or *differs* (same id, other content) | — |
| 10. Preview | Counts and date range, what will be added or replaced, the conflict choice for the *differs* group: **skip**, **keep both** (new id) or **replace if the imported one is newer**; prefs to restore (ticked) | The person can cancel here with no change |
| 11. Apply | One IndexedDB transaction over `assessments` (and `drafts` if chosen): all or nothing; the current draft is never overwritten unless chosen | The transaction aborts as a whole |

Safety properties: nothing imported is rendered as markup (the code base has no raw-HTML rendering today; the task adds a lint rule — core `no-restricted-syntax` on the `dangerouslySetInnerHTML` attribute and on `innerHTML` assignment, so no plugin is needed — to keep it so); free text exists only in `userNote` and the medicine names the person typed, and is shown as text; no field of a file selects code or a URL; storage in memory-only state disables import with a reason.

### 3.5 Screens

Settings gains a card **Your data**: *Make a backup*, *Restore from a file*, the storage-health lines (§4), the last backup date, and (Release B) the lock. The result page's tail and the History header carry one quiet line — "Keep a copy of your results" — that opens the same dialog. All text in the three languages, in plain words, no jargon ("a file you keep", not "serialisation").

### 3.6 Reminder

A dismissible card on History and the landing page appears when at least one assessment is newer than `lastBackupAt` and either five such assessments exist or 30 days have passed since the last backup (or since the first assessment if there has been none). *Not now* snoozes it for 14 days (`backupSnoozeUntil`); a switch in Settings turns it off. It is computed from stored data when the page opens; there is no timer and no message from anywhere.

## 4. Storage health (PM-10)

A Settings block, also shown inside the backup dialog:

| Line | Source | Words |
|---|---|---|
| Used space | `navigator.storage.estimate()` | "This app is using about 3 MB on this device" (omitted when the browser gives no estimate) |
| Kept safely? | `navigator.storage.persisted()` | "The browser has agreed to keep this data" or "The browser may discard this data if the device runs low on space" |
| Ask to keep | `navigator.storage.persist()` on a click, offered after the first saved assessment | A button, never automatic; the answer is reported either way |
| Why data can disappear | Fixed text | Private windows are cleared on close; some browsers (Safari) clear data of sites not visited for about a week unless installed to the home screen; clearing browsing data removes it; a different browser or device has none of it |
| Installed? | `display-mode: standalone` | "Installed apps are likelier to keep their data" with a pointer to [installation](offline-and-install.md) |

Every call is feature-detected and wrapped; a browser without the API shows the fixed text only.

## 5. The local data lock (FR-24, Release B)

### 5.1 Threat model

| Threat | Protected? |
|---|---|
| Someone gets the **disk or the browser profile** (theft, repair, a shared computer's profile folder, a forensic copy) | **Yes**, if the passphrase is strong |
| Someone uses the unlocked device for a moment | Only when the app is locked: *Lock now*, idle auto-lock |
| Malware, a malicious extension, a compromised OS | **No** |
| Script injection in the page | Not by the lock; the strict CSP is the defence |
| A forgotten passphrase | The data is **unrecoverable** — by design |
| An attacker who can guess the passphrase offline | Slowed by the key derivation (§5.3), not stopped: the passphrase's strength is what matters, and the dialog says so |

Not protected and said plainly in the interface: the lock is not a defence against malware, and it is not a substitute for the device's own screen lock and disk encryption.

### 5.2 What is encrypted

| Data | Encrypted? |
|---|---|
| Records in `assessments` and `drafts` (inputs, results, saved birth data, notes) | **Yes** |
| `localStorage` preferences and the disclaimer record | No: no health data; the lock screen needs the language and theme |
| `meta/lock` (salt, parameters, the wrapped key) | No: it holds no plaintext secret |

A locked record keeps its version: `{ v, enc: { iv, ct } }` instead of `{ v, data }`, so migration still works after unlocking. The additional authenticated data of each record is `tcm|<store>|<key>|<v>`, so a ciphertext copied to another id, store or version fails to decrypt.

### 5.3 Keys

```
passphrase ──PBKDF2-SHA-256, salt, ≥ 600 000 iterations──▶ key-encryption key (KEK, in memory, short-lived)
random 256-bit data key (DEK) ──AES-256-GCM wrap by KEK──▶ meta/lock.wrappedKey
records ──AES-256-GCM by DEK (fresh 12-byte IV per write)──▶ { v, enc }
```

- **A random data key** encrypts the records and the passphrase only wraps it. Changing the passphrase is therefore one small write (re-wrap) rather than a re-encryption of everything, and cannot be interrupted into an inconsistent state.
- The unwrapped data key is imported as **non-extractable** and lives only in memory; a reload locks the app.
- PBKDF2 with SHA-256 at 600 000 iterations is the current OWASP minimum for that function and is in WebCrypto, so no dependency is added. A memory-hard function (Argon2) would be stronger but is not in WebCrypto and would need a WebAssembly dependency; recorded as a possible later change, not done now.
- Nothing in this design stores, hints at or derives anything recoverable from the passphrase except by guessing it.

### 5.4 Flows

| Flow | Steps | Interruption safety |
|---|---|---|
| **Turn on** | 1. Explain what it does and does not do, and that a lost passphrase loses the data. 2. Require a **fresh backup** in the last few minutes, or an explicit "I understand" after the backup was declined. 3. Passphrase twice, at least 10 characters, a strength hint (length, variety, a short list of common choices). 4. Generate the key, wrap it, re-encrypt every record **and** write `meta/lock` in **one transaction** | The transaction commits as a whole or not at all: after any interruption the store is plain and unlocked, or encrypted with its key present |
| **Open (locked)** | A lock screen replaces the app: passphrase field, *Unlock*, language and theme choices, and *Forgot it? Erase everything on this device*. Nothing of the health data is rendered or fetched. A wrong passphrase gives a plain error; after five consecutive failures each next attempt waits longer (2, 4, 8 … up to 5 minutes) — an honest note says this slows a person at the keyboard, not an attacker with a copy of the data | — |
| **While unlocked** | Reads decrypt, writes encrypt; autosave works as now. Idle auto-lock after 10 minutes by default (5, 10, 30 or 60, chosen in Settings); *Lock now* in the header menu | A write while locking is awaited before the key is dropped |
| **Change passphrase** | Unlock → new passphrase → re-wrap the data key → one `meta` write | Atomic |
| **Turn off** | Unlock → decrypt every record and delete `meta/lock` in one transaction | Atomic |
| **Backup while locked** | Allowed after unlocking; the dialog defaults to a passphrase-protected file | — |
| **Restore into a locked store** | Records are encrypted with the data key on write | As restore |
| **Erase everything** | Removes everything including `meta/lock`; always reachable, also from the lock screen | — |

The lock lives **entirely inside the storage module** as a codec the persistence functions call (`seal` on write, `open` on read), so nothing else in the app knows about it, and the one-module rule for storage stays true.

### 5.5 What the lock does not change

Prefs, language and theme stay readable. The offline worker has no data to protect. Routes and the URL contain only random ids as before. The privacy statement is updated: *"You can lock the history on this device with a passphrase. We cannot recover it."*

### 5.6 As built (PM-20)

The lock is one codec inside the storage module, as designed: `storage/lock.ts` (the record, the key wrap, the throttle, the sealing of a record — nothing in it touches storage), `storage/persistence.ts` (`Persistence.lock`: `status`, `unlock`, `lockNow`, `enable`, `disable`, `change`, `onChanged`, and the `seal` / `open` that every read and write passes through), `storage/db.ts` (`Db.batch(writes, { lock, expect })`, `Db.entries`, `ConflictError`) and `apps/web/src/lock/` (the lock screen, the idle lock, the three dialogs, the Settings card). The store exposes `lock` (`unknown` | `none` | `locked` | `unlocked`) and the actions; no other module sees a key or a ciphertext.

Choices made while building:

| Question | What was done, and why |
|---|---|
| How is a write kept from going around the lock? | `meta/lock` carries a random **key id**. A batch names the key id its writer holds (`lock`, or `null` for "there is no lock") and, for turning the lock on or off, the entries it read (`expect`). Both are checked **inside the same IndexedDB transaction** as the writes, so there is no gap between the check and the write, and a refusal writes nothing. No promise other than IndexedDB's is awaited inside a transaction (it would commit early) |
| Turning on and off | Read every record, seal (or open) them, then write all of them and `meta/lock` in one batch that expects the entries to be as read. A record saved by another tab meanwhile makes the batch refuse; the step is read again and retried (four times at most), so nothing saved in between is lost or left in the clear. A record that does not open when turning off is **not** thrown away: nothing is changed and the dialog says so. Tested with a database that fails at each write in turn |
| Another tab | A `BroadcastChannel` ("tcm-lock") says that the lock was turned on, off or changed, or that everything was erased; the other tab forgets what it knew and loads the page again. If a message was missed, the tab's next write is refused by the key-id guard, retried once under the lock as it now is — which writes in the clear only when there is no lock, and never while the key is missing — and the page then loads again. Changing the passphrase does not stop other tabs: the data key is the same |
| Where is the key? | In memory only, imported **non-extractable**. *Lock now* and the idle lock save what is pending, drop the key and load the page again, so no decrypted state stays in the page; a reload locks. The unwrapped key bytes are wiped as soon as the key object exists. A JavaScript string cannot be wiped, so a typed passphrase may stay in memory until the garbage collector takes it; the fields are cleared when the dialog goes |
| What does the first render of a locked device show? | The app must never flash. A marker in `localStorage` (`tcm.lockHint`, the value `1`, kept in step with the real record by `status()`) tells the first render, synchronously, that there is a lock, and the app waits (`unknown`) for the lock record instead of showing the history. The marker holds nothing but its own existence: it says that a lock exists, which the lock screen says anyway |
| Idle time | Pointer, key, touch, wheel and focus start the wait again. The check is against the clock, not a count of ticks, so a laptop that slept, or a hidden tab whose timers were slowed, locks as soon as it is looked at. The choices are 5, 10 (default), 30 and 60 minutes (`lockIdleMinutes`, in the preferences: it is not sensitive and the lock screen need not read it) |
| Wrong passphrases | The counters live in `meta/lock`, so they survive a reload. The failure is written **before** the answer is shown, so closing the tab at the right moment does not skip the count. After five in a row the next attempt waits 2, 4, 8 … seconds, up to five minutes, and an attempt during the wait is not looked at (no key derivation). The same throttle guards *Change the passphrase* and *Turn the lock off*. The lock screen says that the wait slows a person at the keyboard and does not stop someone with a copy of the data |
| A lock record that cannot be read | It is a lock nothing can open: the lock screen says so and offers only *Erase everything on this device*. Every field of the record is checked and the iteration count is bounded to 100 000–5 000 000 on reading; unknown fields are ignored |
| A damaged stored record that is not an envelope | Sealed whole and returned whole (`raw`), so nothing stays in the clear |
| Passphrase | The same rules and normalisation (NFKC) as the encrypted backup: ten characters typed twice, a strength hint, no maximum below 256 |
| Turning on | The dialog says what the lock does, what it does not do (malware, a malicious extension, the device's own screen lock and disk encryption) and that a lost passphrase loses the history. A backup made in the last 15 minutes counts as fresh; otherwise the person makes one from the dialog or ticks *I understand that without a backup a forgotten passphrase loses my history*. Where storage is blocked or only in memory, the card says why the lock cannot be turned on |
| Backup and restore with the lock on | *Make a backup* offers the passphrase-protected file by default; a restore is sealed with the data key while unlocked and refused while locked |
| Iterations | A new lock uses 600 000 (`KDF_ITERATIONS`). The tests use 100 000, the smallest a reader accepts |

**For the security review** (a human task: the review is recorded in [`CHECKLIST.md`](../../../CHECKLIST.md), not by this document). What to look at, and where:

1. **The raw store.** After *Turn the lock on*, every value in `assessments` and `drafts` is `{ v, enc: { iv, ct } }`, `meta/lock` holds no secret, and `localStorage` holds no health data. E30 saves a result with an allergy of its own, first proves that its scan can see the allergy, the names of the saved fields and a symptom id in the plain store, then turns the lock on and searches the raw `drafts`, `assessments` and `meta` stores — read through the page — for all of them, searches `localStorage` for the allergy, and checks that the passphrase appears nowhere.
2. **Binding and nonces.** The additional data of a record is `tcm|<store>|<key>|<v>` and that of the wrapped key `tcm|lock|<keyId>|<v>`; a ciphertext moved to another id, store or version, or under another key, does not open (unit tests). Every write draws a fresh 12-byte IV from `getRandomValues`; the salt is fresh for every wrap.
3. **Atomicity.** The fault-injection tests fail the database at every step of turning on, turning off and changing the passphrase, and then check that the store is exactly as it was and still opens with the old passphrase.
4. **The throttle** is for the person at the keyboard. It is client-side, so someone with a copy of the data does not meet it; their cost is the key derivation, which is why the strength hint and the note matter. Check the claim in the words, not only the code.
5. **Other tabs.** Read `underLock` and `commit` in `storage/persistence.ts` and `runBatch` in `storage/db.ts` together: a stale writer must be refused or retried under the current lock, never write in the clear around one.
6. **What is not in the lock.** The preferences, the language, the theme and the disclaimer record (no health data), the lock marker, and the existence of `meta/lock`. The wrapped key's iteration count and salt are public by design.
7. **Known limits**, all stated in the interface or here: malware and a malicious extension; strings in memory; no memory-hard key derivation (§5.3); a changed system clock shortens a throttle wait; a very large history takes longer to turn on (the dialog says it is working).
8. **By hand**, on a real phone and a real laptop: turn on with a history of a dozen results, close the window in the middle of the progress, reopen, check that the history is either all plain or all locked; lock, wait, reload, unlock; forget the passphrase on purpose and take the erase-and-restore way out.

## 6. Cryptography choices

| Choice | Reason |
|---|---|
| WebCrypto only (PBKDF2, AES-GCM, SHA-256, `getRandomValues`) | No dependency, constant-time native code, a small audited surface |
| Fresh random salt (16 bytes) per backup and per lock; fresh random IV (12 bytes) per encryption | Never reused; a counter is unnecessary at this volume |
| Authenticated encryption with the header and record coordinates as additional data | Prevents swapping or editing headers and records |
| No custom key derivation, no "security question", no recovery key by e-mail | Each is a recovery path an attacker can use too |
| Iteration count in the file, bounded on read | Allows raising it later without breaking old files, and stops hostile values |
| Known-answer tests from published vectors for PBKDF2 and AES-GCM | Catches an engine or platform deviation |

## 7. Tests

| Layer | Test |
|---|---|
| Unit | Format builder and parser; checksum; canonical JSON; each import stage with its failure; conflict policies; the profile rule |
| Property | Round trip: generated histories → export → import into an empty store gives deep-equal records (same for the encrypted file); the replay check accepts every replayable record the engine produced and rejects a record with any changed result field |
| Fuzz | Random bytes, truncated JSON, deep nesting, huge arrays, `__proto__` and `constructor` keys, wrong types, absurd iteration counts: never an unhandled error, never a partial write, never a polluted prototype |
| Crypto | Known-answer vectors; wrong passphrase; tampered header, tag and ciphertext each fail; a record moved to another id fails |
| Storage | Transaction atomicity with a fake database that fails at each step of *turn on*, *turn off* and *import*; memory-fallback disables import and the lock with a reason |
| End to end | Export in one browser context, import in another gives an equal History; lock on → the raw IndexedDB contents (read through the page) contain no symptom id, note or birth value; unlock, lock now, idle lock, five wrong tries, turn off |
| Accessibility | The dialogs and the lock screen are in the axe sweep and the keyboard tests; announcements for errors and for the lock state |

## 8. Data model and privacy inventory changes

| Item | Change |
|---|---|
| `Prefs` | `lastBackupAt?`, `backupSnoozeUntil?`, `backupReminder?` (low sensitivity) |
| `SavedAssessment` | optional `imported?: { at, from }` (additive: no storage-schema bump) |
| `meta/lock` | New, Release B (built): version, key id, KDF name, iterations, salt, wrapped key (`{ iv, ct }`), consecutive failures and the time of the last |
| `Prefs` | `lockIdleMinutes?` (5, 10, 30 or 60; low sensitivity) |
| `localStorage` | `tcm.lockHint`: the value `1` while a lock exists, so that the first render can wait for the lock record |
| [Privacy §2](../../privacy.md) | Rows: backup files (held by the person; leave the device only by their action), lock metadata, the new preferences |
| [Privacy §3](../../privacy.md) | *Export* row extended; *Device and backups* row points to the lock; *Erase* row notes that it removes lock data |
| [Privacy §6](../../privacy.md) | Developer rule: nothing is encrypted or decrypted outside the storage module |

## 9. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of the release that builds it.**

| Question | Default |
|---|---|
| Passphrase-protected backup | Offered, default on when the lock is on, off otherwise |
| Include the unfinished assessment | Off |
| Replay check versus recompute | Check where the versions match; otherwise keep as saved with an **Imported** mark; never recompute silently |
| Reminder thresholds | Five assessments or 30 days; snooze 14 days |
| Lock idle time | 10 minutes |
| Minimum passphrase | 10 characters with a strength hint; no maximum below 256 |
| PIN | None (PD-05) |
| Sign-in with a passkey or security key instead of a passphrase | Not now; revisit when the browser support is uniform |
| File names and extension | `.json`; the encrypted one says `.encrypted.json` |

## 10. Tasks

PM-07 (format, importer, replay check), PM-08 (screens, reminder), PM-09 (encrypted envelope and the shared crypto module), PM-10 (storage health), PM-20 (the lock; built, the security review is open) — [`TASKS.md`](../../../TASKS.md).

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design |
| 0.6 | 2026-10-06 | PM-20 built ([§5.6](#56-as-built-pm-20)): `storage/lock.ts`, the lock in `storage/persistence.ts`, conditional batches in `storage/db.ts`, the screens in `apps/web/src/lock/`. The record carries a random key id, and a batch is refused **inside its own transaction** when the stored lock is not the one the writer holds or when the entries it read have changed — which is what lets turning the lock on or off, and a write from a tab that missed a change, be correct without a gap between checking and writing. The first render of a locked device waits for the lock record (a marker in `localStorage` says there is one) instead of showing the app. Lock now and the idle lock save what is pending, drop the key and load the page again. The throttle is counted before the answer is shown. A record that does not open is never thrown away when the lock is turned off. Idle time 5, 10, 30 or 60 minutes. Reviewer checklist added; the review itself is not done |
| 0.5 | 2026-10-05 | PM-10 built (`storage/health.ts`, `screens/settings/StorageHealth.tsx`). The block is in Settings → Your data and, in its short form (the lines and the button, without the explanation), inside the backup dialog. The storage manager is passed in, so every answer a browser can give — and a manager that throws, answers nonsense or does not exist — is tested; where there is no API the fixed explanation stands alone. The request to keep the data is made only by a click on a button that is offered only when the browser has not agreed and at least one result is saved; the end-to-end scenario counts the calls. When storage is blocked the block says the data is not being saved (the "Not saved" chip says the same elsewhere) and offers nothing else. Sizes use `Intl.NumberFormat` unit style, with a plain fallback |
| 0.4 | 2026-10-05 | PM-09 built (`storage/crypto.ts`, `storage/backup/encrypted.ts`, `storage/passphrase.ts`). The crypto module is the storage layer's, shared with the lock (PM-20): `deriveKey` returns a **non-extractable** AES-GCM key, the passphrase is normalised (NFKC) so the same characters typed another way open the file, and compression uses a plain `ReadableStream` (not `Blob.stream()`, which jsdom lacks). The header is authenticated as the canonical JSON of every field but the ciphertext, so a change to the time, the compression, the iteration count, the salt or the iv fails the same way as a wrong passphrase — one answer, on purpose. The reader bounds the iteration count to 100 000–5 000 000, the salt to 16 bytes and the iv to 12 **before** any key derivation, and bounds the decompressed size (a bomb is refused, not inflated). The export is always at the current minimum (600 000); the tests that make many files use the smallest count a reader accepts. The passphrase must be ten characters typed twice, with a strength hint that says what it cannot know; it lives only in component state and is cleared after use. Known-answer tests use published vectors and are cross-checked against Node's own PBKDF2 and AES-GCM |
| 0.3 | 2026-10-05 | PM-08 built (`apps/web/src/backup/`, `screens/settings/DataCard.tsx`). Choices made while building: the dialogs live once at the app (a provider inside the router, so a link in a dialog keeps the language), and any screen opens them; the preferences of a file are offered only when they would change something here (otherwise a second restore of the same file would always seem to have something to do); the share sheet is offered only where the browser can share a file, and the download happens either way; the restore dialog loads the knowledge base on demand (the replay needs it); an encrypted file says it cannot be restored yet until PM-09; the reminder is a `role="status"` card computed when the page opens, and *Not now* snoozes it for fourteen days; the Settings "what is stored" table gains a row for backup files |
| 0.2 | 2026-10-05 | PM-07 built (`apps/web/src/storage/backup/`, `app/backupReplay.ts`). Found while building: a result has no non-finite numbers, so a JSON file loses nothing; "the answers do not suffice to replay" is exactly *the result requested birth data and the record did not keep it* (the reference block is always present, so its presence says nothing); the parameter fingerprint and the season model are not known before a run (the fingerprint depends on whether the birth module was used), so the importer replays every record stamped with the current engine, knowledge base and profile and tells *altered* from *made with other parameters* by comparing the run's own stamps with the record's; the importer lists a record as *duplicate* when a file holds an id twice; a record's result must carry the stamps of its record; the importer drops unknown keys and refuses a known key with a wrong value; `Persistence.applyWrites` is the one place that writes an import (one transaction across stores; `false` and nothing changed when storage cannot take it); a record imported before and the same record in a file are *identical* (the mark is ignored when comparing) |
