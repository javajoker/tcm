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
  accessibility sweep, release-output assertions (`check-release`), i18n checks.
- **Developer inspector** (dev profile only).

### Security and privacy
- A saved result no longer keeps the birth moment (the four pillars and the true solar time) unless the person chose to remember their birth data.

### Known limitations
- All medical content is unreviewed; the closed-beta draft label is required for any build.
- Only tier-A formulas are in the release data; the release profile reaches level L1 at most.
- English prose for the knowledge base is partial; the English UI shows Chinese text marked "中" where it is missing.
