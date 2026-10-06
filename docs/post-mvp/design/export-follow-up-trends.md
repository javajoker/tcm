# Design: Practitioner Export, Follow-up and Trends

| | |
|---|---|
| **Version** | 0.4 (draft) |
| **Status** | Design for Release B (FR-26 and FR-27; tasks PM-17 … PM-19). **PM-17 (the practitioner file), PM-18 (follow-up) and PM-19 (trends) are built** |
| **Last updated** | 2026-10-06 |
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

### 3.5 As built (PM-17)

`screens/result/summaryData.ts` is the id-based layer (`summaryData(saved, kb)`: ids, enumerations, numbers); `summaryModel.ts` renders it as the page's sections (`renderSummary`, and `buildSummary` as before); `summaryFile.ts` builds the file; `SummaryFileDialog.tsx` is the preview. The published schema is [`docs/schemas/tcm-summary-1.schema.json`](../../schemas/tcm-summary-1.schema.json) with four generated examples beside it.

Where the file differs from the sketch of §3.2, and why:

| Sketch | As built | Why |
|---|---|---|
| `complaints.modules`, `safety.level`, birth data | **Not in the file** | The printed page does not show them, and the rule is that the file holds nothing the person was not shown; the preview therefore has no birth-data switch |
| `recommendations` in the file but not on the page | The page gained a section **What the result showed the person** (formulas with their tier, foods, acupoints — never the formulas shown for study only) | The file's contents are the page's contents, so the page shows what the file carries; it tells the practitioner what the person was shown |
| *The person's own note* on the page | The saved note is **not** on the page and is offered in the preview, off, with its text visible | The page is the handout; the note is private. It is the one thing that is in the file and not on the page, and only when switched on |
| `element: "wood"` with a `value` | `{ element, label, band, value }` with an ASCII id and a two-language label | The data uses Chinese characters for the five phases; a file's ids are plain ASCII |
| A single `patterns` list | `patterns: { status, items, confidence, whatWouldChange }` | *What would change this* is a section of the page and travels with the patterns |
| `notice` | The disclaimer of the page footer plus "Prepared by the person using TCM Self-Check from what they entered", in both languages | The notice cannot be detached from the data |
| `exportedFrom` | The versions of the **result** (the record's stamps), not of the app that makes the file | A reader needs to know what produced the content |

Every fact in the file is on the page: a test builds the file and the page for all 23 typical patients in the development and the release knowledge base, in English and in Traditional Chinese, and checks each label, severity, quality tag, band, number, name, code and tier against the page text. The switches remove exactly their section (tested for each of the eight), the typed medicine names and the note are absent unless asked for, a release file holds only tier-A formulas and no amount, weight or dose, and the schema (checked by the Python `jsonschema`, with the mistakes a reader must refuse) accepts every generated file.

**Print refinements.** The versions line joins the notice in the footer that repeats on every printed page (the line at the end of the page is not printed a second time), a table's header repeats and no row or list item is split across pages, and the controls, including the new button, are not printed. *Share…* is offered only where `navigator.canShare({ files })` says yes and calls the system sheet from a click; *Save the file* is always offered.

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

### 4.4 As built (PM-18)

`followup/model.ts` (the date, the rule for when the card is due, the previous-profile draft's helper `draftFromProfile` in `app/assessment.ts`), `followup/ics.ts` (the calendar writer), `FollowUpCard.tsx` (the result's tail card) and `FollowUpNudge.tsx` (start page and History). The record gained `followUp?: { dueAt, dismissedAt? }` (additive, no storage-schema bump; the backup importer validates it as two plain numbers and drops anything else).

| Decision | As built |
|---|---|
| Where it is set | A card *Look again later* after *Your data* on the result: *In 2 weeks · In 4 weeks · In 8 weeks · Not now*, none pre-selected, written to the record at once; afterwards the card says from which date the nudge will appear, offers *Add to my calendar*, and *Choose another time* (which clears the date and brings the choices back). Hidden on paper |
| The date | The start of the **local day** that many weeks after the moment of choosing — a date, not a timer; a new choice replaces an earlier date and its dismissal |
| When the card is due | The date has passed, the person has not dismissed it, **no newer result has been saved**, **no assessment is in progress**, and the disclaimer of the current version has been acknowledged (a person who must re-acknowledge starts from the start page as usual). One card at most: with several due results, the most recent. Computed when the page opens; there is no timer and no background work |
| What it offers | *Start a new assessment*; *Start with my previous profile*; *Not now* (dismisses it for good — the date stays visible on the result) |
| The previous profile | A new draft at the profile step holding the subject (age, sex, pregnancy, lactating, medicine classes, allergies), the profile answers (medicines, allergies, conditions) and the serious conditions among the red flags; **never** the findings, the screening answers, the constitution answers, the observations or the acknowledgements; birth data only if it was saved. The symptoms are asked again, and so is the screening |
| The calendar file | `tcm-follow-up.ics`: one all-day event (with the next day as its end) on the due date, `TRANSP:TRANSPARENT`, a display alarm at 09:00, the title *TCM Self-Check — time to look again* in the person's language and the address of the app. The writer takes a date, a random id, the time, and two strings — nothing from the result — and the dialog says it will live in the person's calendar, may be copied by the services that calendar uses, and that nothing can be sent from this app |
| Verification | A strict RFC 5545 reader written for the test (CRLF only, folding at 75 octets never inside a character, escaped text, nesting, required properties) refuses a malformed file and accepts the writer's; a scan finds no health word in the file; E28 sets a follow-up, takes the file, moves the browser's clock 16 days on, and finds the card on the start page and in History, brings the profile back and finds no symptom in the stored draft |

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

### 5.5 As built (PM-19)

`screens/history/trend.ts` is the model (`trend(results)`, `trendAvailable`, `profileMarks`; ids, bands and numbers, no prose), `trendWords.ts` names the rows and bands from the result page's own catalogue, `TrendFigure.tsx` draws the dot-strips and `Trends.tsx` is the tab's content (loaded only when the tab is opened). History gains a **Results | Trends** tab list when the longest run of results of one version reaches three; below that it says how long the longest run is.

| Decision | As built |
|---|---|
| **Series** | The results in time order (ties by id), cut into **segments** wherever the parameter fingerprint or the engine's major version changes; a minor engine version is not a break; two results of one version with a result of another between them are two segments. A segment never spans two versions; nothing is compared across a break — each segment has its own figure columns, its own table and its own steps, and a labelled note says the marks before and after are not compared |
| **Rows and bands** | The five phases (the result's population-referenced offsets, thresholds ±0.5 and ±1.5 on the −3…+3 scale) and the cold–heat and deficiency–excess axes (the same thresholds on their −1…+1 scale) — exactly the bands the result page prints, so the two never disagree; the number to one decimal is in the table twin |
| **Changes** | A change is reported only when a row is in **another band** than at the previous result: *Between 3 Sept and 1 Oct, Earth moved from the somewhat high band to the normal band.* A movement inside a band is never reported (property test over 60 generated histories). A step across a boundary is a change however small — the table twin shows the numbers, and no hysteresis is applied |
| **Context** | The season under each mark is the commanding season at the result's date by the result's own season model (`seasonAt`); a change in pregnancy status, breastfeeding or a long-term condition between two results is noted in words *(Read the comparison with care)*; other profile answers (age, medicines, allergies) are not marks |
| **Symptoms and patterns** | Symptoms that appeared or are no longer reported between consecutive results, and the leading patterns (at most three) of each result as a table whose rows are patterns, so the same pattern is one row across the columns, its cells shaded |
| **Figure** | Band dot-strips: one row for each of the seven rows, one mark per result at its band, equally spaced in time order with the date and the season under it, a single neutral colour, **no line between marks**; a different version is a gap with a dashed rule; each mark is a link to its result with a 44-pixel target (the table twin has links too). The SVG is a `group`, not an `img`, because it holds links; the box scrolls and is focusable on a narrow screen |
| **Wording** | One fixed note (*answers are self-reported and vary with sleep, mood, food and the season; small movements mean little*). The words better, worse, improved, worsened, recovered, progress, score — and 變好, 變差, 好轉, 惡化, 改善, 進步, 康復, 分數 — are refused by a **scoped rule** of the wording lint for the `trends.` and `followup.` catalogues (the rest of the app says "if pain gets worse" where a caution needs it); a browser test scans what the app wrote on the page. The sentences are class L and go through the linguistic review with the rest |

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
| 0.2 | 2026-10-06 | PM-17 built: the data layer, the file, the schema and its examples, the preview, sharing and print refinements; the differences from the sketch are listed in §3.5 |
| 0.3 | 2026-10-06 | PM-18 built: the date, the card, the nudge, the previous-profile draft and the calendar file (§4.4) |
| 0.4 | 2026-10-06 | PM-19 built: the trend model, the dot-strip figure and its table twin, the changes, the profile marks, the scoped wording rule (§5.5) |
