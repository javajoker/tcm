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
- **Simplified Chinese interface** (draft, closed beta only): `/zh-Hans/…` with its aliases, a three-way language switch (繁體 · 简体 · EN, each in its own script), a one-time offer to `zh-CN`/`zh-SG`/`zh-Hans` browsers, Simplified catalogues (a lazy 19 KB chunk) and Simplified display of every knowledge-base text, quotations from the Simplified source text. The engine and the safety rules still run on the Traditional data; an allergy typed in Simplified is turned back into the data's string before it is stored. A purity sweep fails when any screen shows a Traditional-only character in Simplified.

### Fixed
- A citation chapter read 五執行大論 instead of 五運行大論 (an OpenCC phrase rewrite of 运行); the converter now post-fixes 運行 and 循環.

### Security and privacy
- A saved result no longer keeps the birth moment (the four pillars and the true solar time) unless the person chose to remember their birth data.

### Known limitations
- All medical content is unreviewed; the closed-beta draft label is required for any build.
- Only tier-A formulas are in the release data; the release profile reaches level L1 at most.
- English prose for the knowledge base is partial; the English UI shows Chinese text marked "中" where it is missing.
