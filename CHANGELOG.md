# Changelog

All notable changes are recorded here, newest first, in the spirit of [Keep a Changelog](https://keepachangelog.com/). Versions are of the **app**; the release notes of each version also state
the **knowledge-base**, **engine** and **parameters** versions and list safety-relevant changes separately ([release process §3](docs/release-process.md)). Until the first release, entries
are grouped under *Unreleased*.

## Unreleased

Pre-release. The web app, the diagnosis engine and the knowledge base exist; nothing has been published and all medical content is `curated-draft` until the reviews of
[content review](docs/content-review.md) are done.

### Added
- **Web app** (`apps/web`, React 19 + Vite): landing and disclaimer, profile and optional birth data, red-flag screening with blocking notices, adaptive inquiry, tongue / pulse / constitution
  observation, review, result report (summary, five-phase panel, reasoning with citations, transmission and season susceptibility, advice by policy level, formula detail), practitioner summary,
  history and compare, settings and privacy, sources, feedback marks with explicit export, print view; `zh-Hant` (default) and `en`; responsive, keyboard and screen-reader operable.
- **Engine** (`@tcm/engine`): the SOP pipeline from findings to patterns, body panel, formula fit and safety-filtered recommendations; scope policy per profile; constitution scoring.
- **Five-phase module** (`@tcm/wuxing`): birth chart, element weights, 大運 / 流年, 五運六氣, reference panel.
- **Knowledge base** (`data/`): citations, formulas, herbs, patterns, symptoms, questions, tongue / pulse, constitutions, scope profiles, safety rules, emergency numbers.
- **Quality gates**: parity with the Python oracle, property tests P1–P12 (nightly ×10), a safety vignette suite (100+ vignettes, blocks the release), golden-case infrastructure, privacy tests,
  accessibility sweep, release-output assertions (`check-release`), i18n checks, the twenty end-to-end scenarios and a real-browser axe sweep (Chromium, Safari's engine, Firefox), and a visual-regression workflow.
- **Birth place picker**: a built-in list of 484 cities (GeoNames, CC BY 4.0, attribution in the app and `NOTICE`) with a search in English and Chinese, and a "Remember birth data" default in Settings (off).
- **Original schematics** of the pulse positions and of the body parts the recommended acupressure points lie on.
- **Developer inspector** (dev profile only).

### Documentation
- **Post-MVP plan** (`docs/post-mvp/`): roadmap with releases A–D, requirements FR-21 … FR-34, a register that answers every "revisit after the MVP" decision, nine design documents (Simplified Chinese, offline use, backup and lock, tap-tempo and regions, knowledge browser, export and trends, library expansion, five-phase extensions, research tracks), post-MVP tasks (section PM) and release checklists. The CI `kb` job now also checks that the committed parity fixtures equal what the Python oracle exports. The task summary no longer drops rows whose notes follow the last pipe.

### Simplified Chinese (in progress, Release A)
- The pipeline that derives Simplified Chinese from the Traditional text exists: a reviewed override table, a committed display dictionary for every Chinese string of the knowledge base (the exact Simplified source text for the 127 quotations), generated interface catalogues, a review sheet for a Mainland-usage reviewer (`pnpm i18n:review-hans`), and display lists written by the bundler and verified by the loader. The engine and the safety rules still read only the Traditional data. 
- **Simplified Chinese interface** (draft, closed beta only): `/zh-Hans/…` with its aliases, a three-way language switch (繁體 · 简体 · EN, each in its own script), a one-time offer to `zh-CN`/`zh-SG`/`zh-Hans` browsers, Simplified catalogues (a lazy 19 KB chunk) and Simplified display of every knowledge-base text, quotations from the Simplified source text. The engine and the safety rules still run on the Traditional data; an allergy typed in Simplified is turned back into the data's string before it is stored. A purity sweep fails when any screen shows a Traditional-only character in Simplified; the same scan runs in the real browser after every screen of the end-to-end scenarios E1, E2, E5, E9, E10, E11 and the axe sweep, which now also run in Simplified (103 runs, up from 87).
- **Checks for the derivation**: `check-i18n` covers the generated catalogue (keys, parameters, no Traditional-only character, glossary form) and now also the `feedback` namespace it had skipped; the converter's forbidden-wording results equal the Traditional ones; the engine gives identical assessments and vignette views whichever script is shown, and fails if it reads display text.

### Offline use (in progress, Release A)
- **A service worker** (PM-04): after one visit the whole product works without a connection, in Chromium, Safari's engine and Firefox (end-to-end scenario E22 stops the server and runs a whole assessment). Hand-written, about 2 KB gzip, no library: it precaches the files of the build (the knowledge files of the script in use when the page asks), answers navigations to the app with the cached page, and answers nothing else — no request with a body, nothing from another origin, no file outside the build. The build writes it last from the files it has just written, and `check-release` (rule 13) recomputes its lists; the host never caches `/sw.js`; the CSP names `worker-src` and `manifest-src`; a kill worker (`scripts/make-kill-sw.ts`) removes it from every browser that visits, and the development build serves it as its `sw.js`. 
- **Updates, the offline copy in Settings, and a boot guard** (PM-05): a newer build installs beside the running one and waits — "A new version is ready" with *Reload* and *Later*, never applied by itself and never in the middle of an answer; Settings → *Offline use* says the state of the copy in words and removes it (*Erase everything* removes the worker too); without a connection, a switch to the script whose files are not saved yet says it needs a connection once. A tiny script of its own (`/boot.js`) counts starts that never render: after two in a row it drops the offline copy and loads once from the network, so a faulty release cannot trap a person. The rollback is rehearsed with two real builds (scenarios E22b–E22d, in Chromium, Safari's engine and Firefox): deploy B over A, A over B, the draft kept each time, and a build that cannot start removed after two tries. 
- **Installable** (PM-06): the manifest is standalone; the browser's install offer is held back and shown only as an *Install* button in Settings (nothing on a first visit, nothing by itself), and Settings always says in words how to "Add to Home Screen", iPhone and iPad included. `check-release` (rule 14) reads the manifest back: its fields, nothing beyond the icon and the window, each icon present and of the size it says, an Apple touch icon.

### Pulse
- **Tap along with the beat** (PM-11): a second way to give the resting pulse rate. A large button, a visible count, *Done* from 12 taps, the rate shown only after *Done* (so it cannot bias the taps) and announced once; "not enough to tell" for too few or too uneven taps, a note when the result is within 3 beats per minute of the rapid or slow line, a hint when the taps were uneven, and the person always decides. How the rate was obtained (typed, 30-second count, tapped) is kept beside it and shown in the review and the practitioner summary, which now also carries the rate itself.

### Safety
- **No silent default region for the emergency numbers.** The MVP showed Taiwan's numbers to anyone who had not chosen a region, wherever they were. Numbers now appear for the region the person chose or whose time zone the device is in (named on screen, changeable); anyone else sees "call your local emergency number" and a request to choose. Each region row carries the time zones that preselect it and an optional dated verification record; a public build (no draft label) ships only verified rows no older than 24 months (`check-release` rule 12).

- **An allergy is matched whichever script it was typed in** (PM-33). The rule used to compare characters as they are, so in a Traditional session 人参 matched nothing and was reported as unconfirmed; it now folds the entry and the names to one script with a table generated from the names (`data/safety/name-fold.json`, 182 characters) and a vignette suite entry for each script. Found on the way: a formula's own name for a herb (芍藥, 龍膽草, 白豆蔻) was not among the names an allergy could match when the herb record says 白芍, 龍膽, 豆蔻; it is now.

### Fixed
- A citation chapter read 五執行大論 instead of 五運行大論 (an OpenCC phrase rewrite of 运行); the converter now post-fixes 運行 and 循環.

### Security and privacy
- A saved result no longer keeps the birth moment (the four pillars and the true solar time) unless the person chose to remember their birth data.

### Known limitations
- All medical content is unreviewed; the closed-beta draft label is required for any build.
- Only tier-A formulas are in the release data; the release profile reaches level L1 at most.
- English prose for the knowledge base is partial; the English UI shows Chinese text marked "中" where it is missing.
