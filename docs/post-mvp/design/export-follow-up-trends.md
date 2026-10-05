# Design: Practitioner Export, Follow-up and Trends

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design for Release B (FR-26 and FR-27; tasks PM-17 … PM-19). Nothing is built |
| **Last updated** | 2026-10-05 |
| **Audience** | Engineers, the wording reviewer, practitioners who will read the file |
| **Related** | [Requirements FR-26, FR-27](../requirements.md#fr-26-structured-practitioner-export--release-b--class-n--refines-fr-13) · [PRD FR-12, FR-13](../../PRD.md#fr-12-history-and-follow-up--p1) · [UX spec §4.13, §12](../../ux-spec.md) · [Privacy §2, §3](../../privacy.md) · [Decisions PD-04, PD-06](../decisions.md) |

> **Summary.** Three small features around the saved result. A **structured summary file** carries what the printed practitioner summary shows — and nothing more — as identifiers with labels in both languages, built from the same model as the page so they cannot disagree. A **follow-up** is a note the person sets for themselves: an in-app card when the time comes and a calendar entry that contains no health information; there are no push messages because they would need a server. **Trends** put three or more results on one timeline in *bands*, never scores, in neutral words, and refuse to compare silently across versions of the engine.

---

## 1. Goal and non-goals

**Goal.** Let a person bring a clear, faithful record to a practitioner, look again later, and see how their own picture has moved.

**Non-goals.** An import format for other people's files (the backup is the round-trip format); a clinical record standard such as FHIR (a mapping can be written by those who need one); reminders pushed from a server; judgement of progress ("better", "worse", a score); sending anything anywhere.

## 2. What exists today

| Fact | Consequence |
|---|---|
| `buildSummary(saved, kb, t)` produces `SummarySection[]` — titles, facts and tables as **translated text** — that feeds both the printable page and a plain-text copy, "so they cannot disagree" | A machine-readable file cannot be made by parsing that text; the model must be split into an id-based data layer and a text layer |
| "Export my inputs" (`tcm-inputs`) and "Export feedback" download JSON without upload | The summary file follows the same download idiom |
| `compare(a, b)` compares two saved results: ranking of the top patterns, panel offsets, bagang axes, symptoms added and removed, severity changes, and `profileChanged` | Trends reuse these primitives over a series |
| Panel values become words with `level5` (*low, somewhat low, normal, somewhat high, high*); the number stays in a table and tooltip | Trends speak in these bands, with the table twin |
| A saved result stamps app, knowledge-base, engine, parameter fingerprint, profile and season model | Comparability can be decided from the stamps |
| "Edit and re-run" turns a saved result into a draft | A follow-up can start from a previous *profile* without the previous answers |
| No calendar or reminder code exists; no worker pushes anything | Follow-up is a nudge plus a file |

## 3. Practitioner export (FR-26)

### 3.1 One model, three renderings

```
saved result + knowledge base ──▶ summaryData()  (ids, enumerations, numbers; no prose)
                                     ├─▶ renderSummary(data, kb, t) ──▶ SummarySection[] ──▶ printable page, plain-text copy
                                     └─▶ summaryFile(data, kb, options) ──▶ tcm-summary JSON
```

`summaryData` is pure and shared; `renderSummary` is today's `buildSummary` moved onto it. A test builds all three for every typical patient and checks that **every fact in the file appears in the page**: the file contains nothing the person was not shown.

### 3.2 The file

`tcm-summary-YYYY-MM-DD.json`, validated by a published JSON Schema (`docs/schemas/tcm-summary-1.schema.json`).

```json
{
  "format": "tcm-summary", "version": 1, "createdAt": "2026-10-05T12:00:00Z",
  "exportedFrom": { "appVersion": "…", "kbVersion": "…", "engineVersion": "…", "paramsFingerprint": "…", "profile": "release" },
  "language": "zh-Hant",
  "notice": { "zh-Hant": "…", "en": "Prepared by the person using TCM Self-Check from what they entered. Educational reference; not a diagnosis." },
  "person": { "ageYears": 41, "sex": "female", "pregnancy": "no", "lactating": false, "seriousConditions": ["RF_C_…"] },
  "safety": {
    "medications": { "status": "some", "classes": ["anticoagulant"], "otherNamed": [] },
    "allergies": { "status": "none", "items": [] },
    "redFlags": [], "level": "L1", "notices": [{ "id": "N-MED", "reasons": ["…"] }]
  },
  "complaints": { "modules": ["sleep", "fatigue"] },
  "findings": [ { "id": "S_FATIGUE", "label": { "zh-Hant": "…", "en": "…" }, "severity": "moderate", "quality": "inquiry" } ],
  "observations": { "tongue": [ { "id": "T_…", "label": { "…": "…" } } ], "pulse": { "rate": 72, "method": "timer", "rhythm": "regular", "qualities": [ { "id": "P_…", "label": { "…": "…" } } ] } },
  "constitution": { "primary": { "id": "…", "label": { "…": "…" } }, "secondary": [] },
  "panel": { "elements": [ { "element": "wood", "band": "somewhatHigh", "value": 1.2 } ], "bagang": { "coldHeat": { "band": "normal" }, "deficiencyExcess": { "band": "somewhatLow" } } },
  "patterns": [ { "id": "SP1", "label": { "…": "…" }, "confidence": "medium" } ],
  "recommendations": { "formulas": [ { "id": "F_…", "tier": "A" } ], "foods": [], "points": [] }
}
```

Rules:
- **Identifiers plus labels in both languages** for every coded item, so a person and a program can read it; free text is limited to `otherNamed` (medicine names the person typed) and the optional note.
- **Numbers follow the page.** `value` appears only where the printed summary shows a number; bands always appear ([UX spec §4.10](../../ux-spec.md)).
- **Bounded by the profile.** A release build's file contains only what a release result can show (tier-A formulas, no amounts, no herb weights); a dev build's file says `profile: "dev"` and may contain more.
- **Additive evolution.** New optional fields do not change `version`; a removed or retyped field does. Unknown fields are ignored by readers.
- The disclaimer travels in the file (`notice`) so that it cannot be detached from the data.

### 3.3 Preview and consent

Before the file is made, a preview lists its sections with a switch each. Defaults:

| Section | Default |
|---|---|
| Person, medicines and allergies (classes), safety, complaints, findings, observations, constitution, panel, patterns, recommendations shown | On |
| Medicine names the person typed (`otherNamed`) | Off, with the reason ("free text can contain more than you intend") |
| Birth data (only if it was stored on the device) | Off |
| The person's own note | Off |

A short warning states that the file contains health data and that sending it is the person's decision.

### 3.4 Sharing

*Download* is always offered. *Share…* appears where `navigator.canShare({ files })` says it can and calls `navigator.share` on a click, so the person picks the recipient in their own system sheet. The app never uploads, never builds a link and never stores who received it. Print gets small refinements (page breaks that keep a table together, the versions in the footer, the notice at the foot of each page); the printed page remains the primary format for most practitioners.

## 4. Follow-up (FR-27 part 1)

### 4.1 Setting it

After a result is saved, the result's tail card *Look again later* offers **in 2 weeks · 4 weeks · 8 weeks · not now**, with nothing pre-selected. The choice is stored on the record (`followUp: { dueAt, dismissedAt? }`, additive; it is deleted with the result). Choosing sets a date, not a timer.

### 4.2 The nudge

When `dueAt` has passed and the person has not started a newer assessment or dismissed it, a card appears on the landing page and on History: *It has been about 4 weeks since your last assessment. Look again?* with **Start a new assessment** and **Not now**. The card is computed from stored data when the page opens; there is no timer, no background work and no message from anywhere. A second button, **Start with my previous profile**, opens a new draft that carries the previous *profile answers* (age, sex, medicines, allergies, conditions — never the previous findings, and birth data only if it was stored) so that the person re-checks them rather than retyping.

### 4.3 The calendar file

*Add to my calendar* downloads `tcm-follow-up.ics`: an all-day event on the due date with a morning alarm, in the person's language.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TCM Self-Check//follow-up//EN
BEGIN:VEVENT
UID:<random>@tcm-self-check
DTSTAMP:20261005T120000Z
DTSTART;VALUE=DATE:20261102
SUMMARY:TCM Self-Check — time to look again
DESCRIPTION:Open the app: https://<host>/en/
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:TCM Self-Check — time to look again
TRIGGER;RELATED=START:PT9H
END:VALARM
END:VEVENT
END:VCALENDAR
```

The entry contains **no health information**: not the pattern, not a symptom, not the word "assessment of …". The dialog says plainly that it will live in the person's calendar and may sync to the services that calendar uses, and that nothing can be sent from this app (nothing leaves the device), so the file is a note to themselves. The writer follows RFC 5545 (CRLF line endings, folding at 75 octets, escaped commas and semicolons) and is tested against a strict parser written for the test, not against a dependency.

## 5. Trends (FR-27 part 2)

### 5.1 When it is shown

History gains a **Trends** tab when there are at least three results in one *series*. Results are in the same series when they share the **parameter fingerprint and the engine's major version**; an assessment made under other parameters starts a new segment, drawn after a visible gap and labelled *measured with a different version*. Nothing is compared silently across a segment break. A change of the person's own situation between points (`profileChanged`: pregnancy status, a long-term condition) is marked on the timeline and noted in words.

### 5.2 What it shows

| Rows | Content |
|---|---|
| Five phases (5 rows) and the two eight-principle axes (2 rows) | One mark per assessment at its band (five levels), equally spaced in order with the date and the season under each |
| Patterns | The top patterns per assessment as a small grid (ids named in words), with *the same pattern* highlighted across columns |
| Symptoms | For the series: symptoms that appeared or disappeared between consecutive points (from `compare`) |

It is drawn as small multiples in plain SVG (the app's own figure components, no chart library), a single neutral colour with position and shape carrying the meaning — never red and green (P8) — and has a **table twin** with the bands in words and the numbers in the table, as every other figure does. Tapping a point opens that result.

### 5.3 Wording

Trend text states *what changed*, never whether it is good: **"Between 3 Sept and 1 Oct, Dampness moved from the *somewhat high* band to the *normal* band."** A movement inside a band is not reported as a change. A fixed note says self-reported answers vary with sleep, mood, food and season, and that small movements mean little. The words *better, worse, improved, worsened, recovered, progress, score* and their Chinese counterparts are added to the forbidden-wording lists for these messages; the wording is class L and goes through the linguistic review with the rest ([README §3](../README.md#3-review-classes)).

### 5.4 Model

`trend(series)` is a pure function over `SavedAssessment[]`: segments by fingerprint and engine major, per-row band per point, the changes between consecutive points, the profile-change marks. It lives beside `compare` and reuses its helpers; it returns ids, bands and numbers, never prose.

## 6. Data and privacy changes

| Item | Change |
|---|---|
| `SavedAssessment` | optional `followUp?: { dueAt, dismissedAt? }` (additive; no storage-schema bump) |
| Summary file | Held by the person; leaves the device only by their action; contents ⊆ the printed summary; added to [privacy §2](../../privacy.md) as an export |
| Calendar file | Contains no health data; the dialog says where it will live |
| [Privacy §3](../../privacy.md) | *Export* row extended with the summary file; *Print* row unchanged |
| Network | None added |

## 7. Tests

| Layer | Test |
|---|---|
| Unit | `summaryData` for every typical patient; schema validity of the file (generated into a fixture and checked by the Python `jsonschema` the project already uses, so no new JavaScript dependency); every fact in the file appears in the page; toggles remove exactly their section; `trend` segmenting, bands, band-boundary rule, profile-change mark; the `.ics` writer against a strict parser |
| Property | Over generated histories: a series never spans two fingerprints; reordering the input does not change the output; a movement inside a band is never reported |
| Wording | The forbidden words are absent from the trend, follow-up and export catalogues in all three languages |
| Component | Preview toggles and defaults; the follow-up card (due, dismissed, started newer); *Start with my previous profile* carries profile answers and nothing else; share availability; the trend table twin |
| End to end | Result → make the file → open it; set a follow-up → advance the browser clock → the card appears → start with the previous profile; three results → Trends, then a result under other parameters shows the gap |
| Accessibility | Preview, follow-up card and trends (figure and table) in the axe sweeps and the keyboard run |

## 8. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release B.**

| Question | Default |
|---|---|
| File name and format | `tcm-summary-YYYY-MM-DD.json`; the printed page stays primary |
| Typed medicine names, birth data, note in the file | Off |
| Intervals offered | 2, 4, 8 weeks; none pre-selected |
| Calendar content | Title and a link to the app only |
| Reminder channel | In-app card and a calendar file; never push (PD-06) |
| Minimum points for a trend | Three in one series |
| Chart type | Band dot-strips, with a table twin; no lines between points (a line implies a continuous measurement) |
| Standard such as FHIR | Not planned |

## 9. Tasks

PM-17 (data layer split, file, preview, share, schema), PM-18 (follow-up card, previous-profile start, calendar file), PM-19 (trend model, figure, table, wording) — [`TASKS.md`](../../../TASKS.md).

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design |
