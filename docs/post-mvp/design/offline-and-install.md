# Design: Offline Use and Installation

| | |
|---|---|
| **Version** | 0.3 |
| **Status** | Release A (FR-22; tasks PM-04 … PM-06). PM-04 and PM-05 are built: the worker, its build integration, the kill worker, the page's registration, the update flow, the offline screens, the boot guard and the rollback rehearsal; installability (PM-06) is not |
| **Last updated** | 2026-10-05 |
| **Audience** | Engineers, whoever deploys and rolls back |
| **Related** | [Requirements FR-22](../requirements.md#fr-22-offline-use-and-installation--release-a--class-n--refines-tq6-e15) · [Tech spec §5, §11, §12](../../tech-spec.md) · [Release process §6, §7](../../release-process.md) · [Privacy §2](../../privacy.md) · [Decisions TQ6, PD-03](../decisions.md) |

> **Summary.** The app is a static page with a knowledge base made of content-hashed files, and everything the person types stays on the device, so being offline-capable costs one small, hand-written service worker. It **precaches the build** (shell, scripts, styles, the knowledge chunks of the language in use) and answers navigations with the cached page; it caches nothing else and touches nothing that carries a body. A new version installs in the background and waits; it is applied only when the person clicks or on the next visit, so an answer is never interrupted. The worker is the riskiest new part of Release A, so it comes with a kill switch, a boot-failure guard and a rehearsed rollback.

---

## 1. Goal and non-goals

**Goal.** After one visit, the whole product works without a network and can be installed like an app; updates arrive without interrupting anyone.

**Non-goals.** Background sync, push notifications (they need a server), caching of anything the person produced, caching strategies for third-party resources (there are none), a worker in the development profile.

## 2. What exists today

| Fact | Consequence |
|---|---|
| A manifest and icons (including a maskable one) exist; `display` is `browser`; there is no worker | Installing needs a manifest change; offline use needs the worker |
| The build output is 61 files, **1.1 MB raw, 352 KB gzip**: scripts 226 KB, knowledge chunks about 100 KB, the rest styles and icons. A normal session fetches about 205 KB of it | Precaching everything costs about 150 KB more, once, in the background |
| Knowledge chunks are content-hashed and verified by the loader (SHA-256 against the manifest); `manifest.json` is fetched with `no-cache` | A poisoned or stale cache entry cannot be used as data; the manifest is the one file whose freshness matters |
| E15 shows that offline *after* the load fails for any screen whose chunk was not fetched yet ("Try again"), and that Safari's engine keeps a failed module fetch until the page reloads | Precaching removes the case; the offline half of E15 can then run in every browser |
| The host files are generated (`scripts/deploy-files.ts`): CSP `default-src 'self'`, `connect-src 'self'`, per-path cache rules that never overlap, language segments rewritten to `index.html` | The worker needs one new rule (`/sw.js` is never cached) and an explicit `worker-src`; it must use the same language-segment list |
| *Erase everything* already deletes IndexedDB, `localStorage` and Cache Storage and reloads | It must also unregister the worker, or an empty-cache worker stays |
| The draft is saved after every answer | A reload at any moment loses nothing |
| The dev profile (previews behind access control) serves a different build | A worker there would show reviewers stale previews |

## 3. Design

### 3.1 What is cached

One versioned cache per build, `tcm-app-<buildId>`, filled in two steps.

| Group | Files | When | Notes |
|---|---|---|---|
| **Shell** | `index.html`, every file under `assets/` (scripts including lazy chunks, styles), icons, `manifest.webmanifest`, `NOTICE.txt` | At install, atomically (`cache.addAll`; one failure fails the install and the browser retries on a later visit) | Names are content-hashed, so a name is its own integrity check |
| **Knowledge** | `kb/manifest.json`, the knowledge chunks and the city chunk (the same for every language), and — for a person who uses Simplified — the **display dictionary** and the Simplified catalogue ([Simplified design](simplified-chinese.md)) | When the page, once started, asks: `{ type: "CACHE_KB", script }`; again when the person switches language | English uses the Traditional script. A language whose dictionary or catalogue is not cached is *not available offline yet*, and the interface says so instead of failing |

Never cached: any non-`GET`, any request with a body, any cross-origin request (there is none), `sw.js` itself, `_headers`, `_redirects`, `404.html`, security and robots files. A fetch for a same-origin file that is **not** in the build's list goes to the network untouched.

### 3.2 Request handling

| Request | Answer |
|---|---|
| Navigation to `/` or to a path whose first segment is one of the language segments the host knows (`LANGUAGE_SEGMENTS`, including the aliases) | The cached `index.html` (the same rewrite the host does); the app routes. On a miss: network |
| Navigation to any other path | Network, so an unknown address stays a real 404 |
| `GET` for a file in the build's list | Cache first |
| `GET /kb/manifest.json` | **From the cache of this build.** The page and its knowledge base are one release unit; a newer manifest would point at chunks this build was not made for. (Without a worker the manifest stays `no-cache` as today) |
| Anything else | Not handled (`respondWith` is not called) |

The logic is written as small pure functions (`decide(request, url, build)`, `install(build, caches, fetch)`, `activate(…)`, `cacheKnowledge(…)`) with injected `caches` and `fetch`, so it is unit-tested with fakes; `sw.js` only wires the events.

### 3.3 Versions and updates

```mermaid
sequenceDiagram
  participant P as Page (build N)
  participant W1 as Worker N (active)
  participant H as Host
  participant W2 as Worker N+1
  P->>H: any navigation: the browser re-fetches /sw.js (never cached)
  H-->>W2: different bytes: install
  W2->>H: precache build N+1 into tcm-app-N+1
  W2-->>P: installed, waiting
  P->>P: show "A new version is ready" (a status, no focus change)
  alt the person chooses Reload
    P->>W2: SKIP_WAITING
    W2->>W2: activate; delete tcm-app-N
    W2-->>P: controllerchange: reload once
  else tabs close or the next visit
    W2->>W2: activates by itself; the new build loads
  end
```

Rules:
1. **No `skipWaiting` on its own and no automatic reload.** The new worker waits. The person chooses, or the next full visit uses it. An answer is never interrupted, and the knowledge base never changes under a draft in the middle of a session.
2. While the old worker is active it serves the old build **completely** — including lazy chunks the host may already have deleted — which also ends the classic "chunk failed to load after a deploy" error.
3. When the new worker installs it warms the knowledge scripts that the previous cache holds (it can read `caches.keys()`), so an offline user keeps both their language and offline readiness across updates.
4. Old caches are deleted on activation: every cache named `tcm-app-*` other than the current one.
5. A rollback is just another update: the previous deployment's `sw.js` differs in bytes and installs like any other version; version numbers are never compared.

### 3.4 Build integration

| Piece | Design |
|---|---|
| `sw.js` | Built from `apps/web/src/sw/` as a **separate, unhashed entry** at the site root; target at most 10 KB gzip; no dependency (no Workbox) |
| Injected constants | `BUILD_ID` (the knowledge-base version plus the app build hash), the shell list, the knowledge file lists per script, `LANGUAGE_SEGMENTS` — all generated by the build from the files it just wrote, never typed by hand |
| Host files | `_headers` gets `/sw.js` → `Cache-Control: no-cache`; the generated CSP gains `worker-src 'self'; manifest-src 'self'` (they fall back to `default-src` today; being explicit makes the policy readable and tested) |
| Dev profile | No registration; `sw.js` is a stub that unregisters itself and clears `tcm-app-*`, so a reviewer who once visited a release build never gets a stale preview |
| `check-release` | New rules: the shell list equals the files of the build (minus the exclusions above); `sw.js` names no external URL; it does not list itself; it is ≤ 10 KB gzip; `BUILD_ID` matches the page's; the manifest passes the checks of §3.6 |
| `serve-dist` / `smoke` | The emulator serves `/sw.js` with the new rule; the smoke test asserts it |

### 3.5 Page side

| Piece | Design |
|---|---|
| Registration | Release profile only, feature-detected, after the page has loaded and the browser is idle (`updateViaCache: "none"`), so the first visit is not slowed; then posts `CACHE_KB` for the script in use (the dictionary and catalogue only for Simplified) |
| Status | A small store: `unsupported` · `preparing` · `ready` · `update-ready` · `failed`. `ready` means the shell and the script's knowledge files are cached |
| Settings → *Offline use* | The status in words; *Remove offline copy* (deletes the cache and unregisters; the next visit installs again) |
| Update banner | `role="status"` strip: "A new version is ready" with *Reload*; dismissible; not shown while a modal notice is open; also a quiet line on the landing page if it is still pending |
| Language switch offline | If the other script's files are not cached, the toggle explains that language needs a connection the first time |
| Erase everything | Also unregisters the worker (then the existing reload installs a fresh one) |
| Boot guard | A counter in `localStorage` is incremented when the script starts and cleared after the first render. At two failed starts in a row the page unregisters the worker, clears the caches and reloads once from the network |
| External links | The sources screen marks links that leave the app as needing a connection |

### 3.6 Installation

- **Manifest:** `display: "standalone"`, `id` and `start_url` `"/"` (the app redirects to the saved or default language), `scope: "/"`, the existing icons, theme and background colours; no `shortcuts`, no `categories`.
- **Install affordance:** Chromium-family browsers fire `beforeinstallprompt`; the app keeps the event and shows an *Install* button in Settings — never a pop-up and never on the first visit. Every browser gets the same one-paragraph explanation of "Add to Home Screen" in words (no user-agent sniffing).
- **Standalone has no browser chrome:** every screen already offers a way back and the header links home; the design adds a test that no screen is a dead end, and an item to verify printing from an installed app on iOS (the fallback is the share sheet).
- **Why encourage installing:** a browser is likelier to keep an installed app's storage, which bears on [backup and storage health](backup-and-data-lock.md).

### 3.7 Privacy and security

- Cache Storage holds only files of the build. A test lists the cache after a full assessment and finds nothing else; a property test feeds the decision function random URLs, methods and bodies and checks that nothing outside the list is ever stored.
- The worker never sees a request that carries user data: there is no such request; `connect-src` stays `'self'`.
- [Privacy §2](../../privacy.md) gains a row: *offline copy (Cache Storage): the build's files; no personal data; removed by "Remove offline copy" and "Erase everything"*.
- Browsers may discard the cache (Safari after seven days without a visit for sites that are not installed). The effect is only that the next load needs the network; nothing personal lives there.

## 4. Failure modes

| Failure | What happens | Recovery |
|---|---|---|
| Install fails midway (connection lost) | The install is atomic: no half-built cache; the old worker keeps serving | The browser retries on a later visit |
| A faulty worker ships | `sw.js` is never cached by the host, so the next navigation fetches the fix; if the page cannot start, the boot guard unregisters after two failures | Deploy the corrected build, or the kill worker (§5) |
| Cache is erased by the browser or the person | The worker falls through to the network; a status of `preparing` returns | The next visit re-precaches |
| Simplified dictionary or catalogue not cached, offline | The language is "not available offline yet" | Go online once |
| Two tabs open during an update | The new worker waits until both are closed or the person reloads | None needed |
| A request the worker does not know | Not handled: the browser behaves as without a worker | — |
| The host cannot send the `/sw.js` header (the GitHub Pages fallback, TQ1) | A worker could be cached by the HTTP cache for a day | Not supported there: registration is skipped when the build says the host lacks the header rule |

## 5. Kill switch and rollback

1. **Kill worker:** `scripts/make-kill-sw.ts` writes a `sw.js` that deletes `tcm-app-*`, unregisters itself and reloads its clients. Deploying it removes the worker from every browser that visits; [release process §7](../../release-process.md) names it as the response to a faulty worker.
2. **Rollback** is a deployment of the previous artifact; its `sw.js` installs as an ordinary update (§3.3 rule 5). The first deployment rehearses it with two real versions (PM-05) and records the result in the release notes.
3. **Boot guard** (§3.5) is the last line when the new page cannot even start.

## 6. Tests

| Layer | Test |
|---|---|
| Unit | `decide`, install, activate and `cacheKnowledge` with fake `caches` and `fetch`: every row of §3.2, atomic failure, cleanup of old caches, warming of the previous scripts |
| Property | No URL outside the build's list is ever written to the cache, whatever the method, headers or body |
| Release | The `check-release` rules of §3.4, each with a seeded violation (a stale list, an external URL, an oversized worker) |
| End to end | Its own server process (the test stops it to be truly offline; request interception does not reach a worker's own fetches): first visit → status `ready` → server stopped → a whole assessment, result, history, print, settings, sources → server restarted. Then two builds served in turn: the banner appears, the draft survives, *Reload* applies, a closed tab picks it up next visit. Runs in Chromium, WebKit and Firefox; the offline half of E15 loses its Chromium-only condition |
| Boot guard | A build whose script throws at start unregisters after two loads |
| Manual (owner) | Install and print on a real iPhone and Android phone; offline airplane-mode pass; recorded in the accessibility and release records |

## 7. Rollout

Behind the draft label with the rest of Release A. The worker ships in the first deployment only after the rollback rehearsal is planned; the kill worker exists before the worker does.

## 8. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release A.**

| Question | Default |
|---|---|
| Precache everything at install, or only what a session uses? | Everything in the build except the Simplified dictionary and catalogue, which are fetched for a person who uses Simplified (saves about 43 KB for everyone else) |
| Apply updates automatically? | No: the person chooses, or the next visit |
| A library (Workbox)? | No (PD-03): about 150 lines are enough and the whole worker can be read |
| Install prompt on first visit? | Never; a button in Settings only |
| Worker in the dev profile? | No; a self-removing stub |
| A visible "you are offline" indicator? | No: nothing in the product needs a connection, so there is nothing to explain except external links and the first use of a second language |

## 9. Tasks

PM-04 (worker, build integration, headers, kill worker), PM-05 (update flow, status, Settings card, boot guard, rollback rehearsal), PM-06 (manifest, install affordance, rules) — [`TASKS.md`](../../../TASKS.md).

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design |
| 0.3 | 2026-10-05 | PM-05 built. The boot guard is a **classic script of its own** (`/boot.js`, about 0.6 KB gzip, `no-cache`, injected into the release page): found by the two-build rehearsal, Vite merges every module script of a page into one chunk, so a guard inside the application could not count a start in which the application's own script is missing or unparsable — the commonest failure of a faulty worker. A `removed` status joins the others (the person removed the copy; it is installed again next visit). The worker answers `CACHE_KB` with the scripts it holds, so the language switch can say that Simplified needs a connection the first time. A cache that was removed is never made again by a request (`open` creates an empty one): the worker checks `has` first. The quiet line on the landing page appears only after the strip is dismissed (one prompt at a time). A newer build that takes over on its own (another tab closed) does not reload the page: the page says a new version is ready. The recovery is rate-limited by a timestamp in `localStorage` (ten minutes), where the design said once per visit |
| 0.2 | 2026-10-05 | PM-04 built. Changes found while building: the worker's facts travel on its first line (`self.__TCM_BUILD__=…`) so that `check-release` can read them back and recompute them; the build id is a hash of the names **and contents** of every cached file (the page is not content-hashed, so its content must count); the page-side controller (`apps/web/src/offline/`) is written with the browser's container injected and tested with fakes; every end-to-end scenario but E22 runs with `serviceWorkers: "block"`, because a worker answers requests that Playwright's interception cannot reach; whether a request carries a body is read as `(request.body ?? null) !== null`, because Firefox has no `Request.body` (found by the Firefox run of E22) |
