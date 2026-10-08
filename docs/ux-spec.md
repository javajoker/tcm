# UI / UX Specification — TCM Self-Assessment App

| | |
|---|---|
| **Version** | 0.12 (draft) |
| **Status** | Draft — no UI implemented yet |
| **Last updated** | 2026-10-06 |
| **Derives from** | [PRD v0.3](PRD.md) (FR-1…FR-20, NFRs) · [Diagnosis SOP v0.2](diagnosis-sop.zh-TW.md) (what is asked and shown) · [Tech spec](tech-spec.md) (routes, state, components' data) |
| **Sibling docs** | [Safety policy](safety-policy.md) owns the **notice wording** · [i18n guide](i18n-guide.md) owns **terminology and copy rules** · [Test plan](test-plan.md) owns usability and accessibility testing |

> Wireframes are low-fidelity ASCII sketches of **structure and priority**, not visual design. Mobile (≈ 375 px) is drawn first; the desktop
> adaptations are listed per screen. Screen ids (`S01…`) are referenced by [`TASKS.md`](../TASKS.md) and [`CHECKLIST.md`](../CHECKLIST.md).

---

## 1. Design principles

| # | Principle | In practice |
|---|---|---|
| P1 | **Show the reasoning.** The product's difference is *why*, not a verdict | Every conclusion has an expandable "why" with the symptoms, the theory and the citation; evidence *against* is shown too |
| P2 | **Honest about uncertainty.** Self-observation is noisy; the model is a draft | Bands and words before numbers; confidence is always visible; "not sure" is a first-class answer; never false precision |
| P3 | **Safety up front, never a dead end.** Risk → a clear notice → the user continues | Notices are calm, specific and actionable; a blocking notice is acknowledged, then the flow proceeds with a restricted output |
| P4 | **Calm, not clinical, not mystical.** Learning tone, no fear, no fate, no hype | Plain language first, TCM term second (with pinyin and English on demand); tendencies, not verdicts |
| P5 | **Mobile-first, one thing at a time.** ≤ 10 minutes | One question per screen on phones; autosave; resume; optional parts never block |
| P6 | **Bilingual-native.** zh-Hant is not a translation of English, and vice versa | Layouts tolerate both; terms carry zh · pinyin · en; classical quotations stay in original script |
| P7 | **Nothing disappears silently.** | Suppressed content is listed with the reason; fall-back-to-Chinese is marked |
| P8 | **Accessible by construction.** | WCAG 2.1 AA; every visual has a text/table equivalent; colour is never the only signal |

---

## 2. Information architecture and navigation

```
Landing ─► Start (profile, birth*) ─► Safety screening ─► Inquiry ─► Observe* ─► Constitution* ─► Review ─► Result ─► (Formula detail · Sources)
   │                                                                                                         │
   └── History · Settings · Sources · (Dev inspector)                                                         └── Save · Export · Re-assess
                                                                             * optional, skippable as a whole
```

- **Top bar** (all screens): app name / home · progress label (during the flow) · **language toggle** (繁體 / 简体 / EN, each in its own script) · menu (Learn, History, Sources, Settings).
- **Progress**: phones show a compact label "3 / 6 · Inquiry" with a thin bar; tablet/desktop show a stepper with the six stages. Inquiry progress is **coverage-based** (the number of questions is adaptive): "about N questions left", never a fixed percentage that moves backwards.
- **Footer** (all screens): a permanent one-line disclaimer ("Educational reference — not a medical diagnosis") and links (Privacy, Sources, Version).
- **Back** always works and never loses an answer; **Save & exit** is available in the flow and returns to the Landing with a "Resume" card.
- **Language switch** keeps the route and every answer; the page title and `lang` attributes update.

---

## 3. Screen inventory

| ID | Screen | Route | Purpose | Key data |
|---|---|---|---|---|
| S01 | Landing and disclaimer | `/:lang/` | Explain purpose, limits, privacy; acknowledge; resume | Disclaimer version |
| S02 | Basic profile | `/:lang/start` | Safety and context inputs ★ | Age, sex, pregnancy/lactation, medications, allergies, chronic disease, region, lifestyle |
| S03 | Birth card (optional) | within S02 | Opt-in innate/annual blocks | Date, time or "unknown", place → longitude + time zone |
| S04 | Red-flag screening | `/:lang/screen` | Yes/no emergency and scope questions | `red-flags.json` |
| S05 | "See a doctor" notice | modal route | Blocking notice → acknowledge → continue | Notice kind, emergency resources |
| S06 | Main complaint chooser | `/:lang/inquiry` | Choose modules (8) | Modules |
| S07 | Inquiry question | `/:lang/inquiry` | Adaptive questions | Question bank |
| S08 | Tongue observation | `/:lang/observe` | Guided body/coating/zones/signs | `tongue.json` |
| S09 | Face, spirit, voice, odour | `/:lang/observe` | Selection-based | Symptom codes |
| S10 | Pulse (optional) | `/:lang/observe` | Rate, rhythm, qualities, position | `pulse.json` |
| S11 | Constitution quiz | `/:lang/constitution` | 9-type tendencies | Constitution items |
| S12 | Review and confirm | `/:lang/review` | Check/edit answers; run | All input |
| S13 | Result report | `/:lang/result/:id` | The assessment | `Assessment` |
| S14 | Formula detail | `/:lang/result/:id/formula/:fid` | 君臣佐使 table, rationale, modification | Formula, herbs |
| S15 | Citation viewer | drawer / bottom sheet | Original passage, source, translation | `citations.json` |
| S16 | History and compare | `/:lang/history` | Saved assessments; side-by-side | `SavedAssessment[]` |
| S17 | Settings and privacy | `/:lang/settings` | Language, theme, text size, erase, versions | Prefs |
| S18 | Sources / knowledge viewer | `/:lang/sources` | Provenance and review status; P2: browser | KB |
| S19 | Loading, offline, error, 404 | — | Fallback states | — |
| S25 | In your own words (AI help; a build with AI help only) | `/:lang/talk` | The conversation: the person's words, proposed findings with their words to confirm, the next question; on to the questions | the vocabulary, the gateway |
| S21 | Learn: hub, list, page | `/:lang/learn`, `/:lang/learn/:kind`, `/:lang/learn/:kind/:id` | Browse and search the knowledge the app holds without taking an assessment; cautions first on anything a person might use, never "you" ([design](post-mvp/design/knowledge-browser.md)) | `glossary`, `citations`, `patterns`, `constitutions`, `formulas`, `treatment` (points, foods), and the herb browser (herbs: a list by category with two filters and a page whose stored flags and the source's caution come first; the data comes on demand, with a way to try again) |
| S22 | Compare patterns | `/:lang/learn/compare?ids=…` | Two or three patterns side by side: what they share, what tells them apart, and which topics of the assessment bring out the difference; a chooser when fewer than two are named | `patterns`, `symptoms`, `questions` |
| S23 | Lock screen | any route, while a lock is on and the key is not in memory | Replaces the whole app: a passphrase field, the language and the theme, and the way out (erase) — nothing of the history is rendered or fetched ([design](post-mvp/design/backup-and-data-lock.md#56-as-built-pm-20)) | `meta/lock` |
| S24 | The learning book | `/:lang/learn/book`, `/:lang/learn/book/:chapter` | The contents and twelve chapters of 以模型讀中醫, read in order: the text on a card, its quotations linked to their pages, the previous and the next chapter. **Traditional Chinese in every interface**: English says so in a line above the text; a Simplified page shows no Traditional text and links to the same page in Traditional Chinese ([design](post-mvp/design/knowledge-browser.md#73-as-built-pm-43-the-learning-book)) | `book` (fetched when opened), `citations` |
| S20 | Developer inspector | `/:lang/_dev` | Dev profile only (see tech spec §8.6) | Everything |

---

## 4. Screen specifications

### 4.1 S01 Landing and disclaimer

```
┌─────────────────────────────┐
│ ☰  TCM Self-Check     中文|EN│
├─────────────────────────────┤
│  Understand your body the   │
│  way classical TCM does.    │
│  [ Start assessment ]       │  ← primary, disabled until acknowledged
│  ☐ I understand this is     │
│    educational, not medical │
│    advice  (Read in full ›) │
│                             │
│  ┌ Resume ───────────────┐  │  ← only when a draft exists
│  │ Inquiry · 8 min ago   │  │
│  └ [Continue] [Discard] ─┘  │
│                             │
│  What you get · How it works│  3 short cards (panel, reasoning, formulas)
│  Privacy: stays on device   │
├─────────────────────────────┤
│ Not a diagnosis · Privacy · v1│
└─────────────────────────────┘
```

- The acknowledgement stores `{version, time}`; changed disclaimer wording (version bump) re-prompts.
- "What you get" shows one **sample panel** (static, clearly labelled *example*) so users know what the output looks like.
- Desktop: two columns (message + start card | sample result preview).

### 4.2 S02 Basic profile (+ S03 birth card)

Sections as collapsible cards; ★ items required; everything else optional with "prefer not to say".

| Card | Fields | Notes |
|---|---|---|
| About you ★ | Age (number), sex at birth (female / male) | Sex at birth is needed for 大運 direction and menstrual questions; explain in one line |
| Pregnancy ★ (shown when relevant) | Pregnant / possibly pregnant / not pregnant; breastfeeding | "Possibly" is treated as pregnant by policy |
| Health background ★ | Medications (category picker + free text), allergies (herb/food list + free text), chronic conditions (checklist incl. "serious" group) | Categories map to the safety classes (anticoagulant, antidiabetic, antihypertensive, diuretic/cardiac glycoside, immunosuppressant, sedative, MAOI/stimulant, other) |
| Lifestyle | Sleep hours, activity, diet pattern, smoking/alcohol, stress, height/weight | All optional; weak priors only |
| Where you live | Region/climate (dry / humid / cold / temperate / hot) | |
| **Birth (optional)** | Date, time or "I don't know the hour", place | Collapsed by default; see below |

> **Decided 2026-10-04 — MVP default, revisit after the MVP:** the **Lifestyle** card is not built (nothing in the engine consumes it — the SOP uses it only as a weak prior — and asking for answers that change nothing would mislead); **Where you live** is not a profile card either: the region is asked on S04/S05, where the emergency numbers need it (task U-09). Pregnancy and breastfeeding are asked of females aged 10–60 only; everyone else is recorded as "not applicable". "Not sure" about medicines is treated as the class "other" (conservative on doubt). Every required question must be answered explicitly — silence is never read as "no".

**Birth card (S03)**

- A short, honest explainer: *"Some traditions describe a person's innate tendencies from their birth moment. This is optional, stays on your device, is not clinically validated, and never changes how your symptoms are scored."* In release the toggle is **off by default** (opt-in); in dev it is on.
- Place: type-ahead over the built-in city list **or** manual longitude (°E/W) and IANA time zone. After entry the card **echoes** the values used ("Longitude 121.47° E · Asia/Shanghai · true solar time is about +5 min from clock time") for the user to verify.
- "Unknown hour" → hour pillar left empty; the card says the reading will be less detailed.
- Nonexistent or ambiguous local times (daylight-saving transitions): show both possibilities and let the user pick or continue without birth data.
- A time within about 15 minutes of a change of hour in *true solar time* (a quarter of all birth times; [five-phase design §5.1](post-mvp/design/five-phase-extensions.md#51-as-built-pm-27)): a group of three radio tiles after the daylight-saving choice, titled *Your birth time is close to a change of hour*, whose sentence names the two hours (*within about 15 minutes of the change between the 亥 and 子 hours, so the hour pillar could be either [— and at this change the day pillar changes too]. Which is nearer the truth?*) and whose tiles are *The computed hour* (selected; its hour named under it), *The other hour* and *I am not sure — leave the hour out* (the hour pillar is left out and the reading is less detailed). It is not shown for an hour that is unknown or a time that is not near a change, and changing the date, the time, the place or the daylight-saving choice puts the answer back to the computed hour. While *not sure* is chosen the typed time stays and the group stays, so the choice can be taken back.
- A checkbox *"Remember this on this device"* (default off) controls persistence ([tech spec §8.3](tech-spec.md)).

> **Implementation note (U-08, K-10).** The place is picked from the built-in city list (484 places, loaded when the card opens; an ARIA combobox that searches English and Chinese names in either script, with the arrow keys and Enter) **or** typed as a longitude (with East / West) and an IANA time zone, which always works — also when the list cannot be loaded. A chosen city only fills those two fields, which stay editable, and is named under them until a number is changed; the GeoNames attribution (CC BY 4.0) sits under the fields and on the Sources screen. The echo line ("Longitude 121.47° East · Asia/Shanghai · true solar time is about −50 min from clock time") lets the person check it; the echo line ("Longitude 121.47° East · Asia/Shanghai · true solar time is about −50 min from clock time") lets the person check it. A wall time that occurred twice when daylight saving ended shows both readings with their true-solar clocks (`BirthInput.fold`, default the first); a time in the spring-forward gap is refused with a way to continue without birth data.

Validation is inline, never blocks scrolling; the primary action "Continue" is disabled with a visible reason ("Age is required") rather than silently.

### 4.3 S04 Red-flag screening and S05 notice

Screening is a short list of yes/no questions grouped A (emergency) / B (within 24 h) / C (scope: minor, pregnancy, breastfeeding, serious illness — mostly pre-filled from S02, shown for confirmation).

```
┌─────────────────────────────┐   S05 blocking notice (full screen, focus trapped inside)
│  ⚠  Please seek care now    │
│  You told us: chest pain    │   ← specific to what was answered
│  with cold sweat.           │
│  • Call 119 (Taiwan)        │   ← by region; tap-to-call
│  • Don't wait for an app    │
│                             │
│  This app can still show    │
│  general education, but it  │
│  cannot judge emergencies.  │
│  [ I understand — continue ]│   ← checkbox-free single deliberate action
│  [ Show emergency numbers ] │
└─────────────────────────────┘
```

- The notice is **specific** (names the matched reason), **actionable** (what to do, who to call) and **honest about what the app will do next** ("you can continue; some content is limited").
- Acknowledge = one explicit button (not a hidden checkbox); stored with a timestamp in the assessment.
- Emergency-level (A) uses the danger style plus an icon and the word "Emergency"; B uses the notice style; C uses the info style. Colour is never the only carrier.
- Multiple matches are **merged into one screen** with the most severe on top (no chain of modals).
- After acknowledgement the user continues with the profile's output level; an inline banner remains on the affected result sections (P3, P7).
- Notice wording per case lives in the [safety policy](safety-policy.md).

### 4.4 S06 / S07 Inquiry

**S06 Main complaints.** Eight module cards (sleep, fatigue, digestion, cold-heat & sweating, head/body pain, mood & stress, women's cycle*, early external illness) + "none in particular — general check". Multi-select, ≥ 1 or general. *Shown only when applicable (not pregnant).*

**S07 Question card** (one per screen on phones; on desktop the card sits in a centred column with a "what we know so far" side rail).

```
┌─────────────────────────────┐
│ 3 / 6 · Inquiry   ▓▓▓░░░░   │
│ ~12 questions left          │
│                             │
│ Do you feel cold even when  │
│ you are dressed warmly?     │   ← plain language
│ 惡寒（加衣仍冷）  è hán      │   ← the TCM term, secondary
│                             │
│ ( ) Yes   ( ) No   ( ) Not sure│  ← 3 large radio tiles
│ ┌ How strong? ────────────┐ │  ← appears after "Yes"
│ │ [Mild] [Moderate] [Strong]│ │
│ └─────────────────────────┘ │
│ ▸ Why am I asked this?      │  ← disclosure: "separates A from B"
│                             │
│ [‹ Back]        [Next ›]    │
└─────────────────────────────┘
```

- Answer states map to the engine: **Yes** (+ severity) / **No** (negative evidence) / **Not sure or skip** (neutral; lowers coverage). Skip is available on every question, labelled neutrally ("Not sure / skip").
- Multi-choice questions (e.g. pain quality: 脹 / 刺 / 冷 / 灼 / 重 / 隱 / 絞) use checkable tiles with short descriptions; mutually exclusive choices are enforced in the UI with a one-line explanation.
- Next/Back keep state; answering auto-advances only for single-choice questions without a severity step; this is the Settings option "Move on automatically after I answer" (default on; screen-reader and keyboard users are told about it in the first question's hint).
- Contradictions (SOP §5.3) show an inline follow-up on the next screen ("Earlier you said X; is Y also true?") — never a silent pick.
- The **end condition** is shown honestly: "We have enough for a first result. [See result] or [Answer a few more to sharpen it]".
- **Desktop:** the right rail summarises what has been recorded (collapsed list per dimension) with edit links; it never shows pattern names while the inquiry is running (avoid anchoring the user).

> **Implementation notes (U-10).** A skipped question is never asked again in the same assessment (the app keeps the order shown, since the engine cannot see a skipped *onset* question). Contradictions found after an answer are followed up on the next screen before any new question: the user keeps one of the clashing symptoms (the others become "no") or, for the "possible together" groups, says both are true. A graded symptom starts at "moderate" once chosen and can be changed; the desktop rail lists recorded symptoms by dimension and never names a pattern.

### 4.5 S08 Tongue observation

A five-step mini-flow, each step skippable, with a persistent "Can't check right now" exit that records nothing.

1. **How to look:** morning, before eating/drinking/brushing, natural light; avoid dyed foods; a small illustration. A line states the **quality** ("self-observation counts for less").
2. **Body colour:** pale · pale-swollen · red · crimson · dusky purple · normal — each tile has a **swatch illustration and a text label**.
3. **Shape:** swollen · thin · tender · normal.
4. **Coating (overall):** thin white · white greasy · white slippery · yellow · yellow greasy · thick/curdy · scant/peeled · dry.
5. **Zones and special signs:** an illustrated tongue with **six selectable zones** (tip, centre, root, left-right edge, whole, sublingual) and a checklist of signs: tooth marks (edge), cracks (centre / whole), red dots or prickles (tip / edge / centre), ecchymosis, sublingual veins distended or dusky.

```
        ┌───────────────┐
        │   ( tip )     │   tap a zone → a sheet opens with only the findings
        │ (edge)(centre)(edge)│   that make sense there (tip: red, red dots, scant coat …)
        │    ( root )   │   selected zones show a ✓ badge and a text list below
        └───────────────┘
   [ ] Tooth marks   [ ] Cracks   [ ] Red dots   [ ] Ecchymosis   [ ] Sublingual veins …
```

- The map is an **original stylised SVG**, not a photograph (licence-free, culturally neutral). Zone names follow the classical statement; a "textbook alternative" toggle (SOP §4.4) swaps the zone labels but not the data model.
- Every zone is a keyboard-focusable button (`aria-pressed`); the same selections are available as the checklist below the figure (the **text equivalent**).

### 4.6 S09 Face, spirit, voice, odour

Short selection cards: complexion (pale · sallow · red · bluish · dark; lustrous vs dull), spirit (bright · tired · restless), voice (low/weak · loud · hoarse), breath and odour, optional: lips and nails. Same Yes / No / Not sure pattern; quality class "guided".

> **Decided 2026-10-04 — MVP default, revisit after the MVP:** S09 is not a separate screen. Its content is already in the question bank — complexion and lips/nails as *guided* core questions (`Q_FACE`, `Q_LIPS_NAILS`, quality 0.7), energy, voice and breath as inquiry questions (`Q_ENERGY`, `Q_VOICE_BREATH`) — and the adaptive inquiry asks them. Odour has no symptom in the engine and is not asked. The observation stage (`/observe`) is therefore the tongue (S08) and the pulse (S10), each optional, reachable from a hub; "Can't check right now" leaves a step without recording anything beyond what was already chosen.

### 4.7 S10 Pulse (optional)

```
 Pulse (optional)                       ← collapsed card; "Skip — I can't feel it"
 ┌ Measure ────────────────────────┐
 │ Resting rate  [ 72 ] beats/min   │   plus a 30-second helper timer (count × 2)
 │ [Tap with each beat instead]     │   opens a large tap button, a tap count, Done (from 12 taps), Start over
 │ Rhythm  (•) regular ( ) occasional skips ( ) clearly irregular │
 └──────────────────────────────────┘
 ┌ If you can tell (advanced) ─────┐
 │ Depth/force: [Floating][Sinking][Weak]…   exclusive groups enforced
 │ Where felt:  L-cun L-guan L-chi  R-cun R-guan R-chi   (optional)
 └──────────────────────────────────┘
 ⓘ Education note (fixed text): self-assessed pulse needs trained fingers…
```

- Irregular rhythm triggers a **B-level notice** (S05) before the user moves on.
- The educational note is fixed text from the SOP (§4.6), always visible when any pulse quality is chosen.
- Pulse chips are grouped with their exclusivity ("pick one of: floating / sinking"); a tooltip gives the one-line classical description; each chip is a proper radio/checkbox control.

### 4.8 S11 Constitution quiz

Nine tendencies, ≈ 3–5 items each on a 5-point scale ("never … always"), four to five items per screen with a progress label. Skippable as a whole ("skip — result will be less personalised"). Result is a **tendency**, not a label: primary + secondary with plain-language descriptions, shown first in the result summary, never as "you are type X".

### 4.9 S12 Review and confirm

Grouped by dimension; each group has an **Edit** link that returns to the exact question and comes back on completion. Items marked *unsure* are listed under "You were not sure about" with a "Answer now" shortcut; a line shows **data quality** (e.g. "3 self-observed items count for less"). One primary button: **Get my result**. The screen states in one sentence what will happen with birth data if enabled.

### 4.10 S13 Result report

> **Follow-up (PM-18).** After *Your data* a card *Look again later* offers *In 2 weeks · In 4 weeks · In 8 weeks · Not now* (none pre-selected; written at once as a date on the result), then says from which date a card will appear on the start page and in History and offers *Add to my calendar* (an `.ics` with no health content). The card on those pages — *Time to look again?* — offers *Start a new assessment*, *Start with my previous profile* and *Not now*; see the [follow-up design](post-mvp/design/export-follow-up-trends.md#44-as-built-pm-18).

Order follows SOP §14.1 / PRD FR-9. Mobile = single column with a **sticky section chip bar**; the panel is a collapsible card near the top. Desktop = two panes.

```
MOBILE                                    DESKTOP (≥ 1200 px)
┌──────────────────────────┐              ┌────────────────────────────┬───────────────┐
│ Result · saved ✓  [⋯]    │              │ Result                     │ sticky panel  │
│ [Summary][Panel][Why]    │ ← chips      │ ① Safety/scope banner      │ ┌ radar ────┐ │
│  [Advice][Data]          │              │ ② Summary                  │ │ 木 火 土… │ │
│ ① ⚠ inline notices       │              │ ③ Why (reasoning)          │ └───────────┘ │
│ ② Summary card           │              │ ④ Transmission             │ organ list    │
│   Leaning: Spleen qi     │              │ ⑤ Recommendations          │ selected-item │
│   deficiency · confidence │              │ ⑥ When to see a practitioner│ citation card │
│   medium                 │              │ ⑦ Your data (editable)     │               │
│ ③ Panel (radar + table)  │              │ ⑧ What would change this   │               │
│ ④ Why — numbered items   │              └────────────────────────────┴───────────────┘
│ ⑤ Transmission           │
│ ⑥ Advice (formulas, diet, points, lifestyle)
│ ⑦ See a practitioner when…
│ ⑧ Your data → Edit & re-run
│ ⑨ What would change this │
│ footer: disclaimer · provenance
└──────────────────────────┘
```

**① Safety and scope banner.** The acknowledged notices (collapsed to one line each, expandable) plus, when relevant, "Some content is not shown for your situation — why?" (the suppressed list with reasons). Dev builds show the profile badge and level chip (L0–L3).

**② Summary.** Constitution tendency (primary + secondary), the **leading pattern in plain language** with its TCM name and a one-sentence meaning, up to two alternatives, **confidence** (text + meter). Language: "leans towards", "most consistent with". If the status is *insufficient information*, the card says what is missing and offers the top discriminating questions instead of a pattern.

**③ Panel (盤面).** *Figure:* five-phase radar of `W` (main) with the personal-reference outline dashed; beneath it three bars for the **六邪**, three axes for **八綱**, and an organ heat-map (10 nodes × qi/blood/yin/yang/stasis). Every figure has a **"View as table"** toggle and a generated one-sentence summary. Values are shown as **words** ("low", "somewhat low", "normal", "somewhat high", "high") with the number (1 decimal) in the table and tooltip — never a percentage-of-health score. Two offsets are presented as **"Compared with a typical healthy person" (primary)** and, when birth/season data exist, **"Compared with your own usual tendency this season" (context)** with the alignment glyph and one sentence ("this matches your usual leaning"/"this goes against it"). The three-block contribution (innate · annual/season · observed) is a small stacked list with a "how this is calculated" link. If the birth module is off, the card says season and 五運六氣 only.

**④ Why (reasoning trace).** A numbered list in plain language, each item expandable: *what you reported* → *how it supports this pattern* → *classical basis* (citation chips). A separate **"What points the other way"** list shows the evidence against. Tongue and pulse items carry a small "self-observed — counts for less" tag.

**⑤ Transmission and susceptibility.** Short, tendency-worded notes from 生克乘侮 and 母子 ("a weak earth phase can burden the lung — traditionally 'support earth to nourish metal'"), plus a **next-seasons** strip (this season + next 3) built from the forecast panels, each with at most one line, all marked as traditional-tendency reference.

**⑥ Advice.** Presented **by level** (what the policy allows), each item with *rationale · cautions · citation*:

1. **Direction of care** (治則) in one line.
2. **Formulas** (L1+: tier A; L2: tier B with conditions; L3: tier C as *learning display*, visually separated and labelled "for study, not a recommendation"): a card per formula with name, source book, match strength ("good / moderate / partial" words; explained fraction as a bar and a number in details), a one-line rationale, the **君臣佐使 mini-table** (role chips + herb names), "matches your symptoms / doesn't match", cautions, "needs a practitioner prescription" statement. *No amounts in release.* **Open → S14.**
3. **Diet** (藥食同源) · **Acupressure** (points with a simple diagram and pregnancy cautions) · **Lifestyle and season**.

**⑦ When to see a practitioner.** Concrete triggers plus how to describe the problem to a practitioner (the practitioner summary export).

**⑧ Your data.** Editable summary; "Edit and re-run" returns to S12.

**⑨ What would change this.** The "if you also had …, this would lean towards …" list from the engine.

**Result actions (menu ⋯):** Save (auto-saved), Print / PDF, Practitioner summary, Export my inputs (JSON, with a warning), Compare with earlier, Start a new assessment, Delete.

> **Implementation notes (K-11).** *Diet:* each food shows its nature and flavour as a chip (with a hidden label for screen readers), a pregnancy chip when the list says so, and — folded under "Why this food" — the rationale in the page language, the basis (herb record or textbook, draft), cautions and the citation chip. *Points:* name, code and meridian, a "Where" line in the page language, a "Not in pregnancy" chip and the point's own cautions folded; one folded "How to press" note under the list says how hard, how long and when to stop. *Lifestyle:* the line comes from the guidance file in the page language (no longer Chinese-only). All of it is looked up in the loaded knowledge base at render time, so a saved result shows the current wording of the items it names.

> **Implementation notes (U-17).** *Words:* panel values map to five words on the −3…+3 channel scale (≤ −1.5 low · ≤ −0.5 somewhat low · < 0.5 normal · < 1.5 somewhat high · else high; scalars of another range are rescaled first); a formula's match is *good* when it corrects ≥ 60 % of the deviation, *moderate* from 40 %, else *partial*. *Insufficient information:* the panel, the reasoning, the spread and "what would change this" are not shown (they would suggest a precision the data do not have); the summary lists what is missing and offers to answer it, and only general lifestyle principles are given. *Tables:* the five-phase and eight-principle tables are always complete; the six-qi / phlegm table lists only non-zero rows and says the rest is normal. Chinese-only prose from the knowledge base (治則, rationale, lifestyle) is shown as is and marked "中" in the English UI until K-13 lands. Citation chips open the S15 sheet; the English rendering slot says "none yet".

> **Implementation notes (PM-26, [design §4.4](post-mvp/design/five-phase-extensions.md#44-as-built-pm-26)).** *The season line:* the first line under the panel's *blocks* heading says the season and the basis it was counted on — *Season: Autumn (southern hemisphere)* — with the link *Seasons differ where I live*, which goes to Settings → Seasons and puts focus on the card; a result made with seasons left out says *Seasons were left out of this result.* and has no season block and no *Coming seasons* list. The basis is the one stamped on the result, whatever the device suggests today, so a saved result always says how it was made. *Coming seasons* are named in the page's language and listed in the order the person lives them. In print the sentence stays and its link, which leads nowhere on paper, is left out.
>
> *The season model line (PM-29):* under the season line, when the result has a season, one sentence says which school's reading of the year stands behind it — *Late summer (長夏) is counted as a season of its own, between summer and autumn.* (or, for the other model, *Late summer is not a season of its own: the earth phase (土旺) commands the last 18 days before each change of season.*) — with a disclosure *What does this mean?* that says schools divide the year in different ways, which reading this result uses, and that the choice changes only the season block of the reference, never how symptoms are scored. A result made without seasons has no such line. The practitioner summary ends with *Seasons: late summer counted as a season of its own (northern calendar).* beside the versions, and the file carries the same as data.
>
> *The hour sentence (PM-27):* when the birth time was near a change of hour, the paragraph after the list of blocks says which hour the birth chart was made from — *the computed hour, so it could instead be the other one* · *the other hour, as you chose* · *you were not sure, so the hour pillar was left out*. It is the record's own sentence (the choice, never the time), so it is there after a reload and in a restored backup, whether or not the birth data was remembered.

### 4.11 S14 Formula detail

- Header: name (zh-Hant · pinyin · English), source and **verification badge** ("composition verified against the classical text / source book / partially") with a plain explanation; tier chip with reason ("contains a strong herb" …).
- **Composition table**: role (君/臣/佐/使 chips with the one-line definition from 《素問·至真要大論》), herb (links to a herb sheet at L2+), proportion bar. Amounts column **only** when `policy.features.dosage` (dev).
- **How it fits you**: match strength, which of your symptoms it addresses (✓), which it does not (○), and what the formula would **burden** (the benefit–burden view in words: "warming; may be drying for dry-heat types").
- **Rationale** with citations; **cautions** and **contraindications** (pregnancy, medications, flavour excess).
- **Modification (加減)** (L2+): classical modifications first (condition → change → name), then suggestions from the residual with reasons ("adds X because it corrects residual dampness; removes Y because its cold burden outweighs its benefit for you"), shown as a before/after composition diff. Each has a "this is for discussion with a practitioner" line.
- Desktop: composition and rationale side by side.

### 4.12 S15 Citation viewer

Bottom sheet (phone) / right drawer (desktop). Shows: **original text in Traditional script** (serif), book · chapter · clause, verification status ("matched in the source text"), the **English rendering labelled "translation"** (when available), the source edition and licence note, "Where this is used in your result". Chips elsewhere read like `《素問·至真要大論》`; keyboard: Enter opens, Esc closes, focus returns to the chip.

### 4.13 S16 History and compare

With three or more results of one version the page has a **Results | Trends** tab list; *Trends* shows the five phases and the two axes as band dot-strips with a table twin, what moved between bands in neutral words, the symptoms that appeared or are no longer reported, and the patterns at each result ([design](post-mvp/design/export-follow-up-trends.md#55-as-built-pm-19)). Cards: date, leading pattern, confidence, level (dev: profile), "computed with an older version" label when applicable. Select two → **Compare**: side-by-side radars (overlay with different dash patterns, plus a table of changes), pattern ranking changes, and what the user changed in the inputs. Delete one / delete all. Empty state explains where results are stored.

### 4.14 S17 Settings and privacy

Language · theme (system/light/dark) · text size (4 presets) · *Offline use* (the state of the offline copy in words, *Reload to update* when a newer build waits, *Remove offline copy*) and *Install this app* (the browser's offer as a button once it has made one, and the same few words about "Add to Home Screen" for everyone) — release builds only; and *Your data* (*Make a backup…*, *Restore from a file…*, the date of the last backup, the reminder switch) · *Seasons* (below) · *Lock the history* (below) · "Move on automatically after I answer" · "Erase everything on this device" (one explicit dialog stating exactly what will be deleted) · "Remember birth data" default · a plain-language **what is stored** table · version stamps (app, knowledge base, engine, parameters) · links to Sources and the project licence.

**Seasons** (Release C, [design §4.4](post-mvp/design/five-phase-extensions.md#44-as-built-pm-26)). A card, placed after the privacy choices, with the heading *Seasons* and the address `/settings#settings-seasons`. One sentence says that a result can take the season into account, that the app counts seasons by the calendar and by this choice, and that it does not know the climate where the person is. A three-way choice of native radio buttons — *Northern calendar*, *Southern hemisphere*, *Don't use seasons* — with one sentence under the chosen one (spring begins in early February, as in the classical texts · the season you live in: spring begins in early August and summer in early November · for the tropics, where four seasons are not the climate, a result then leaves the season out). While nothing has been chosen the device's time zone decides which of the first two is selected and the card says so (*Not chosen yet: this device's time zone suggests the southern hemisphere.*); choosing another value ends the suggestion and keeps the choice, and until then a result follows the suggestion. A last sentence says that only the season changes — the birth chart, the solar terms and the year's five periods and six qi are the same everywhere — and that results already saved keep the choice they were made with.

**Keep a backup file up to date** (Release D, [research tracks §4.1](post-mvp/design/research-tracks.md#41-as-built-pm-32)). A card after *Your data* — **only in a browser that can choose a file to write** (Chromium); elsewhere there is no card, no row in the *what is stored* table and no sentence about it in *Erase everything*, and the backup above remains. It says what it does (an encrypted backup is written after each change to a file in a folder the person's own cloud service keeps in step; the service sees only an encrypted file; nothing goes to any server of this app) and its limit (written only while the app is open; the file's passphrase is asked for each time and not kept). *Set it up…* opens a dialog: the passphrase typed twice (the strength note and the warning of a protected backup), then *Choose the file…*, which opens the browser's own picker. Afterwards the card is one state in words and the one thing that moves it on: *Kept up to date in “name”. Last written …* (*Write now*, *Stop keeping it up to date*); *“name” needs your permission again in this visit* (*Allow*); *Type the passphrase of “name” to carry on* (a field and *Continue*; a wrong passphrase is said and changes nothing); *“name” holds changes that this device does not have. They are merged before anything is written, so nothing is overwritten* (*Merge…*, which opens the restore dialog on that file with *Merge and keep it up to date*; *Not now* leaves it waiting); *“name” could not be written* with the reason — no room, another program is using it, moved or deleted — and *Try again*. Whatever happens the file is as it was, and the card says so. *Stop keeping it up to date* forgets the file and does not delete it.

**S25 In your own words** (Release F, PM-47; a build with AI help, an adult who agreed). On the module chooser (S06) a card *Describe it in your own words (AI help)* starts or continues the conversation; without the consent one line says where to turn AI help on; a minor sees neither. The page: a heading, a line that says what is sent (with a link to the card in Settings), the conversation as a live log (the assistant's opening question first), a text box *Your answer* with *Send*, and — after each turn — *What I understood*: each proposed finding with *You wrote: “…”*, a strength where the questions grade it, *Yes, that's right* and *Not right*. Confirmed findings are listed with *Remove*. *Continue with the questions* is always there. A red flag in the words sends the person to the screening (S04), which says in a notice why its open questions are open again; the words wait in the box. A level-C statement shows a notice *Please check your profile*. Errors are said in words (switched off, the conversation's limit, too fast, too long, no answer).

**The study reference — note and default** (PM-54, PD-30). Beside every table of reference quantities — the formula page's composition, the head of the medication plan, the first line of the plan in the practitioner summary and in its text copy, the Learn formula page — stands the note *Quantities are for study and as an aid to a practitioner only, not instructions for taking medicine…* (N-AMOUNTS), a caution banner on the formula page and the plan. Where the build shows the study reference to every reader (the default), the Settings card below opens with that, its radio *Studying Chinese medicine* is checked with *You have not chosen: the default applies*, *General reader (no quantities)* stops it for the results made from then on, and neither the header nor the landing page shows anything about roles; a reader whose reference could not come is told on the review, before the result is made, and on the card, with *Try again*. A result says *This result was made with the study reference…* only when quantities are in it.

**Who is reading** (Release E, PM-53; [prescription model §7.4](post-mvp/design/prescription-model.md); only where the build serves roles). A card `/settings#settings-role` with three choices — *General reader*, *Studying Chinese medicine*, *Practitioner* — a sentence on what the two roles see (reference quantities, the classical modifications, the medication plan with the reasons, for study and clinical reference) and one that it is not a check of qualifications. Choosing a role shows the attestation (N-ROLE) with *I understand — read in this role* and *Cancel*; choosing *General reader* withdraws it at once. While a role is on, the header shows *Learner mode* / *Practitioner mode*, linking to the card, with *(reference not loaded)* when the reference cannot come. The landing page offers the choice once (*Choose a reading role* · *No, thanks*). A result made for a role says so under its actions; its formula page has the amounts column and the card *Medication plan (for study and clinical reference)*.

**AI help** (Release F, [design §5](post-mvp/design/ai-assisted-intake.md#5-privacy); **only in a build whose profile turns AI help on** — no release yet). A card after *Seasons*, `/settings#settings-ai`, titled *AI help (in development)*: one sentence on what it does and that it is off unless turned on; a switch per built module (today *Conversation: describe it in your own words*); turning it on opens a statement first — it says in words that the promise *everything stays on this device* no longer holds for the conversation's text, what is sent, to whom, that nothing is kept, what is never sent (with *please do not type your name*), adults only, how to withdraw, and the statement's version — with *Agree and turn on* and *Do not turn on*. Once agreed, the card says whether the service is on, off or out of reach (the questions work in every case), and the header shows *AI help: on*, a link back to the card, on every page. Turning the switch off withdraws the consent at once (*AI help is off; nothing more is sent*). A table says what AI help stores and sends. A consent to an earlier statement asks again.

In the **development profile** the Seasons card has a last control labelled *DEV · Season model* (changxia · tuwang18) to try the other model; it is not in a release, which declares one model and offers no switch.

**Lock the history** (Release B, [design §5.6](post-mvp/design/backup-and-data-lock.md#56-as-built-pm-20)). A card that says what the lock does — the saved results and the unfinished assessment are stored encrypted under a passphrase — and what it does not: malware, a malicious browser extension, the device's own screen lock and disk encryption; and that a forgotten passphrase cannot be recovered by anyone. *Turn the lock on…* opens a dialog with the same words, a step **A backup first** (a backup made in the last quarter of an hour counts; otherwise *Make a backup…*, or a box — *I understand that without a backup a forgotten passphrase loses my history*), the passphrase twice with a strength hint, and a button that waits for all of it; while it works the dialog says so and cannot be dismissed. When the lock is on the card says so and offers the idle time (5, 10 — the default — 30 or 60 minutes), *Lock now*, *Change the passphrase…* and *Turn the lock off…*, each of which asks for the passphrase; the header menu has a *Lock* button. Where storage is blocked or only in memory the card says why the lock cannot be turned on.

**S23 Lock screen.** In place of the whole app — header menu and all — while the lock is on and the key is not in memory: after *Lock now*, after the idle time, after any reload, and when the app is opened again. A heading (*The history on this device is locked*), one passphrase field (focused), *Unlock*, the language and theme choices (which stay readable for this reason), and a card *Forgot it?* that says nobody can recover a forgotten passphrase and offers *Erase everything on this device* (the usual one confirm dialog; a backup file made earlier can be restored afterwards). A wrong passphrase says *That passphrase did not open it.* and the field is cleared. After five in a row the button waits: the screen shows the seconds counting down and says that waiting slows down a person at the keyboard and does not stop someone with a copy of the data. A screen reader hears the wait **once**, with its length, and *You can try again now.* when it is over — the countdown is not read out every second. A damaged lock record says that nothing can open it and offers only the erase. A successful unlock returns to the address that was open. The first paint of a locked device is never the app.

### 4.15 S18 Sources

List of books used with licence and review status; per-record provenance for patterns, formulas and herbs ("reviewed by …" when available, otherwise "draft — not yet reviewed by a practitioner" in plain words). P2: browse patterns, formulas, herbs (with benefit/burden), acupoints and passages.

### 4.16 S19 States

| State | Treatment |
|---|---|
| Loading KB / engine | Skeletons for the current screen; the first inquiry screen can render while the engine chunk loads |
| Offline / fetch failed | "We couldn't load the knowledge base. Check your connection and retry." + retry; drafts remain |
| Engine error | Safe fallback: disclaimer, red-flag guidance, "copy my inputs", "start over"; **no partial medical output** |
| Storage unavailable | A visible "Not saved on this device" chip; flow continues in memory |
| 404 | Friendly page with links to Landing and, when an assessment is in progress, to where the person left off (the link carries the language even when the address had none). The page and every personal route are `noindex`; only the start page and the sources are indexable (U-26) |
| Empty history | Explanation + start button |

---

## 5. Components

| Component | Responsibility | Key states / a11y |
|---|---|---|
| `AppShell` | Top bar, progress, footer, landmarks, skip link | `header/main/footer`, skip to content, focus to `h1` on route change |
| `LanguageToggle` | zh-Hant ⇄ zh-Hans ⇄ en, keeps route/state | `lang` update, `aria-pressed`, 44 px target |
| `Stepper` / `ProgressLabel` | Stage and coverage progress | `aria-current="step"`; text label always |
| `NoticeScreen` | Blocking notice, focus trap, one acknowledge action | `role="alertdialog"`; initial focus on the heading; Esc does **not** dismiss |
| `InlineNotice` | Banner kinds: emergency / caution / info | Icon + text + colour; dismissible only for info |
| `QuestionCard` | Prompt, term line, answer control, severity, "why asked" | `fieldset/legend`; radio group; live region announces severity step |
| `AnswerTiles` | Yes/No/Not sure; multi-select tiles | Roving tabindex; ≥ 44 px; selected state not colour-only (check glyph) |
| `SeveritySegment` | Mild / moderate / strong | `radiogroup`; value in label |
| `TermTooltip` (`<Term>`) | zh · pinyin · en popover | Hover, focus, tap; `aria-describedby`; dismiss with Esc |
| `TongueMap` | SVG zones, signs, checklist twin | Each zone a `button`; `aria-pressed`; text list mirrors state |
| `SwatchTile` | Colour/coating tile with label | Label is mandatory; swatch is decoration |
| `PulseInput` | Rate, rhythm, qualities, position | Exclusive groups enforced; helper timer with `aria-live` |
| `BirthCard` | Date/time/place, echo of derived values, remember toggle | Inline validation; ambiguity UI |
| `FivePhaseRadar` | `W` + reference outline | `role="img"` + description + table toggle |
| `OrganHeat` | 10 × 5 matrix | Real `<table>` semantics; glyphs ▲▼ for sign; magnitude in text |
| `SixQiBars`, `BagangAxes` | Bars / three axes | Value labels; table toggle |
| `OffsetCompare` | Observed vs reference with alignment | Primary vs context styling; sentence summary |
| `TraceList` | Numbered reasoning with expand | `details/summary`; citation chips inside |
| `CitationChip` / `CitationSheet` | Open the passage | Returns focus; shows verification state |
| `FormulaCard` / `FormulaTable` | Candidate and composition views | Role chips with text; proportions as bars with numbers |
| `ModificationDiff` | Before/after composition and reasons | Added/removed marked by text + glyph |
| `ConfidenceMeter` | High / medium / low / insufficient | Text first |
| `SuppressedList` | "Not shown because…" | Expandable; rule id in dev |
| `ProfileBadge` | Dev only: profile + level | Absent from release bundle |
| `Disclaimer` | Permanent footer line + full text sheet | Versioned |
| `EmptyState`, `ErrorState`, `Skeleton` | Fallbacks | |

Components receive **plain data slices** (never the whole KB), carry no medical logic, and are documented with usage and a11y notes in a Storybook-style catalogue (task T-UI-CAT; a plain `/:lang/_dev/components` route is acceptable).

---

## 6. Visual design

### 6.1 Character

Warm paper background, deep ink text, one jade-teal accent. Quiet, generous spacing, no ornament. Classical text uses a serif face to set it apart from the UI. No stock imagery; illustrations are original line-style SVG.

### 6.2 Colour tokens (CSS custom properties; contrast measured)

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--bg` | `#FAF7F2` | `#121A1C` | page |
| `--surface` | `#FFFFFF` | `#1A2427` | cards |
| `--ink` | `#1F2A2E` | `#E8ECEA` | text — 13.8 : 1 on bg (light), 14.8 : 1 (dark) |
| `--ink-muted` | `#4A5A60` | `#A9B6B8` | secondary — 6.7 : 1 / 8.5 : 1 |
| `--primary` | `#1D6B74` | `#6FC1C9` | actions — 5.8 : 1 on bg (light) / 8.5 : 1 (dark) |
| `--on-primary` | `#FFFFFF` | `#0A2327` | 6.2 : 1 / 7.9 : 1 |
| `--link` | `#16565E` | `#8ED0D6` | 8.3 : 1 / 9.2 : 1 |
| `--border` / `--border-strong` | `#D9D2C5` / `#7C8A8F` | `#2C393D` / `#6B7B80` | strong ≥ 3 : 1 (UI components) |
| `--focus` | `#0B57D0` | `#8AB4F8` | 2 px ring + 2 px offset; ≥ 6 : 1 |
| `--notice-bg` / `--notice-text` | `#FFF4D6` / `#6B4500` | `#3A2E10` / `#F4D58A` | caution — 7.7 : 1 / 9.3 : 1 |
| `--danger-bg` / `--danger-text` | `#FDECEC` / `#8E1B1B` | `#431818` / `#FFB4B4` | emergency — 7.9 : 1 / 9.0 : 1 |
| `--info-bg` / `--info-text` | `#E6F2F8` / `#1B4D6B` | `#14313F` / `#A6D4EA` | 7.9 : 1 / 8.6 : 1 |

**Sequential scale for ordered quantities (magnitude)** — one hue, nine steps, `--scale-0 … --scale-8`:
`#F1F7F7 #E3F0F1 #C5E0E2 #A1CED2 #7DB8BD #58A0A8 #1D6B74 #15595F #0F4E56` (dark theme reverses lightness so that "more" is always "stronger against the background").
Cell/label text colour is chosen per step (`--scale-N-text` ink or white) so every label meets 4.5 : 1; this is a unit-tested token table.

**Rules**

1. **No red/green good-versus-bad colouring** anywhere in the panel. Magnitude = the sequential scale; **sign = glyph and word** (▲ above / ▼ below the healthy norm; "high" / "low").
2. **Five-phase identity colours** (木 青, 火 赤, 土 黃, 金 白, 水 黑 in muted tones) may be used **only as identity chips** next to the element character and name; never for magnitude, sign, or the radar fill; the character and name are always present.
3. Red is reserved for the **emergency notice**; it always comes with an icon and the word "Emergency".
4. The reference outline is dashed in a neutral ink; the main plot is a solid primary line with a light fill.
5. Dark mode follows the system by default; tokens swap, never filters.

### 6.3 Typography

| Role | zh-Hant | English / Latin | Size / line-height |
|---|---|---|---|
| UI and body | `"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | 16 px base (rem) / 1.75 (CJK), 1.5 (Latin) |
| Classical quotations | `"Noto Serif TC", "Songti TC", "PMingLiU", serif` | — | 1.05 × / 1.9 |
| Pinyin | — | same as Latin, 0.85 × | line under or beside the term |
| Numerals | tabular figures in tables | | |

Scale: 12 · 14 · 16 · 18 · 22 · 28 · 36 (rem-based). **Text size** presets 0.9 / 1 / 1.15 / 1.3 scale the root size; layouts must hold at 200 % browser zoom. CJK text: no letter-spacing, no italics, no forced uppercase; column width ≈ 34–40 full-width characters for reading text. Mixed-language runs carry `lang` so the right glyph variants and line breaking apply; classical quotations always `lang="zh-Hant"`.

### 6.4 Spacing, shape, motion, icons

- 4 px grid; page gutter **16 px** on phones, 24 px tablet, 32 px desktop; card padding 16/20; radius 12 px (cards), 8 px (controls), pill for chips.
- Elevation: border first, shadow only for overlays (sheet, drawer, tooltip).
- Motion: 150–250 ms ease-out for disclosure and sheets; **none** under `prefers-reduced-motion`; no auto-playing or parallax.
- Icons: inline SVG, 24 px, 1.5 px stroke, `aria-hidden` unless they carry meaning alone (then labelled).

---

## 7. Responsive behaviour

| Range | Layout |
|---|---|
| **< 600 px** (phone) | Single column; bottom-anchored primary action (safe-area aware); one question per screen; panel as a collapsible card; tooltips become bottom sheets; tables scroll within their card only |
| **600–899 px** | Single column with wider cards (max 640 px); two-up choice tiles; stepper replaces the compact label |
| **900–1199 px** | Result becomes two-pane with a narrower right pane; side rail on the inquiry screen |
| **≥ 1200 px** | Two-pane result (main ≤ 720 px; sticky panel + citation pane 360–420 px); centred inquiry column with summary rail |

Always: no horizontal page scroll from 320 px up; touch targets ≥ 44 × 44 px with ≥ 8 px spacing; the sticky panel un-sticks when its content exceeds the viewport; landscape phones keep the single-column layout with the primary action in the flow, not fixed.

---

## 8. Accessibility (WCAG 2.1 AA — design requirements)

| Area | Requirement |
|---|---|
| Structure | One `h1` per screen; ordered headings; landmarks; skip link; page `<title>` per route and language |
| Keyboard | Every interaction operable without a mouse; visible focus; logical order; no keyboard traps except the notice dialog (which traps, restores focus on exit); shortcuts none that conflict with assistive technology |
| Focus management | On route change focus moves to the `h1`; after Next on a question, focus moves to the new question's legend; the citation sheet returns focus to its chip |
| Screen readers | Real form controls (`fieldset`/`legend`, radio, checkbox, `details`); labels in the active language; live region for validation, progress and timer; figures expose a description and a data table |
| Colour and contrast | Text ≥ 4.5 : 1; UI components and focus ≥ 3 : 1; colour never the only signal (glyph + text) — checked with protanopia/deuteranopia/tritanopia simulation |
| Touch and motion | Targets ≥ 44 px; reduced-motion honoured; no time limits (autosave and resume); no content that flashes |
| Text | Resizable to 200 % without loss; user text-size presets; `lang` on every language change; no text in images (the tongue illustration has labels as live text) |
| Errors | Inline, specific, programmatically associated (`aria-describedby`), never colour-only; summary at the top for multi-error forms |
| Cognitive | One task per screen on phones; "Not sure" always available; consistent placement of Back/Next; jargon explained on demand; no countdowns |
| Testing | Automated: axe on every route in both languages and both themes; manual: VoiceOver (iOS/macOS), TalkBack, NVDA; keyboard-only run; 200 % zoom; reduced motion (see [test plan](test-plan.md)) |

---

## 9. Content and microcopy rules

Detailed terminology and glossary rules are in the [i18n guide](i18n-guide.md); the notice texts are in the [safety policy](safety-policy.md). UX rules:

1. **Plain language first, TCM term second.** "Do you feel cold even when dressed warmly?" then 惡寒. Terms open a tooltip (zh · pinyin · en).
2. **Tendency wording.** "leans towards", "is consistent with", "traditionally associated with". **Never** "you have", "diagnosed", "cure", "treats", "prescribe", "will", or time-bound predictions. A linter (`check-i18n.ts`) enforces the forbidden list in both languages.
3. **Birth, 流年 and 五運六氣 wording** always carries the "traditional-culture tendency reference, not clinically validated" label near the content; no fate, disease or time-window statements.
4. **Numbers.** Prefer words/bands; show at most one decimal; Pct appears in details only, as a rounded integer; never present the panel as a "health score".
5. **Uncertainty is visible.** Confidence label on the summary; "self-observed — counts for less" tags; "not enough information" state with what is missing.
6. **Citations read as evidence, not decoration.** A chip appears only where the passage actually supports the sentence (reviewed in content review).
7. **Fall-back marker.** Chinese text shown in the English UI gets a small "中" marker and pinyin so users know it is untranslated.
8. **Tone:** warm, concise, second person; no exclamation marks; no urgency language except in emergency notices.
9. **Buttons are verbs** ("Get my result", "Edit and re-run"); destructive actions name the object ("Erase everything on this device").

**Permanent disclaimer line (footer):** *Educational reference — not a medical diagnosis or prescription.* / 僅供教育參考，不是醫療診斷或處方。 The full text (SOP §14.3) opens in a sheet.

---

## 10. Safety UX patterns

| Situation | Pattern |
|---|---|
| Red flag A / B, minor, pregnant, breastfeeding, serious illness | **S05 blocking notice** (merged, specific, actionable) → acknowledge → continue; a collapsed copy of each acknowledged notice stays at the top of the result |
| Elderly, medications that interact, allergy match, acute external symptoms | **Inline banner** on the affected sections |
| Output limited by level | A line "Some content is not shown for your situation — why?" → `SuppressedList` with reasons (rule ids in dev) |
| Tier C (dev) | Separate "For study only" group; muted, labelled; never in the recommendation order |
| Low confidence / insufficient information | Replace formula advice with "what we still need" and the top questions; show gentle lifestyle content (L0). When every core question is answered and no tongue or pulse was entered, say that instead and offer *Add tongue and pulse* (for four patterns — 風熱, 胃陰虛, 心腎不交, 腎陰虛 — the questions alone stay near the 40 % line and the observations decide) |
| Dev profile | Persistent badge "DEV · everything shown"; every suppressed item is shown **annotated** instead of removed |
| Practitioner pointer | Every result ends with "When to see a practitioner" and a prepared summary |

---

## 11. Interaction details

- **Autosave:** after every answer (debounced); a subtle "Saved on this device" indicator; if storage fails, a visible "Not saved" chip.
- **Resume:** the Landing shows a Resume card with the stage and time; "Discard" asks once.
- **Back/forward:** browser history mirrors the flow; the browser Back button never exits mid-question without keeping the draft.
- **Validation:** only what blocks the safety logic is required (★); everything else may be skipped. The disabled primary button always shows a reason.
- **Why am I asked this?** One sentence from `nextQuestions` ("this helps separate cold-type from heat-type").
- **Keyboard shortcuts:** none beyond standard behaviour in MVP (avoids conflicts); `?` opens a help sheet in dev.
- **Undo:** destructive actions (delete assessment, erase all) require a named confirmation; "Delete assessment" offers a 6-second undo toast.
- **Performance feel:** answering is instantaneous; result computation is < 50 ms, so no spinner — a skeleton only while chunks load.

---

## 12. Print and export

- **Print view:** black on white, single column; the panel as figure **and** table; citations as footnotes; the disclaimer repeated in the page footer; "profile · KB · engine" stamp at the end; page breaks before Advice and Data.
- **Practitioner summary** (separate layout): demographics (age, sex), complaints, 四診 findings with quality classes, medications and allergies (prominent), the panel table, pattern hypotheses with confidence, "what would change this", and what the result showed the person (PM-17). **Save as a file…** opens a preview with a switch for each of eight sections (the typed medicine names and the saved note are offered, off) and a plain warning, then *Save the file* or, where the browser has a share sheet, *Share…*. The footer of every printed page carries the notice and the versions.
- **Share** of a link is not offered (no links that carry data); a file can go to the system share sheet where the browser offers one.

---

## 13. Feedback

"Did this match your experience?" per result and per reasoning item (match / partly / no), stored locally; **Export feedback** produces a JSON the user may send to the maintainers (PRD FR-16). No automatic sending.

> **Implementation notes (U-24).** *What can be marked:* the result as a whole (a card at the end of the report), each pattern's reasoning (S13 ④) and each formula card (S13 ⑥) — keys `result`, `pattern:<id>`, `formula:<id>`. *Storage:* the marks are part of the saved assessment (`SavedAssessment.feedback`), written at once on every change and deleted with it; a mark can be changed or cleared. They are hidden on paper. *Export:* disabled until something is marked; a dialog says the file stays on the device; the file (`tcm-feedback` v1) holds the marks, the version stamps and a summary of the result (status, confidence, pattern ids with percentages, formula ids). **The person's answers are included only if they tick "Also include my answers" (off by default)** — they are health data and not needed to read a mark. No network request is made.

---

## 14. Usability goals and testing hooks

| Goal | Target |
|---|---|
| First assessment completed on a phone | median ≤ 10 min; ≥ 60 % of starters reach a result |
| Users can state *why* they got the result | ≥ 4.0 / 5 on "I understand why" |
| Users find the notice and know what to do next | 100 % in moderated tests of red-flag and pregnancy scenarios |
| Users locate the evidence *against* the leading pattern | ≥ 80 % in moderated tests |
| Tongue step completes without help | ≥ 80 % (zones and signs understood) |
| Accessibility | zero axe violations on all routes; screen-reader task success on the full flow |

Testing method and scenarios are in the [test plan](test-plan.md).

---

## 15. Open design questions

**Decided 2026-10-04:** every default below is confirmed for the MVP and will be revisited after the MVP is finished.

| # | Question | Decision (MVP) |
|---|---|---|
| UQ1 | App name and logo | Working name **TCM Self-Check** / **中醫自我評估**; a neutral text wordmark (no logo artwork) until a final name is chosen after the MVP. The name lives in one i18n key (`common.app.name`) so it can change without touching components |
| UQ2 | Show Pct anywhere outside details? | No (bands only) |
| UQ3 | Tap-tempo pulse measurement in addition to the 30 s timer | Post-MVP |
| UQ4 | Tongue illustration style: line art vs. soft fills; need for a second, photo-based reference set | Line art; photos only if a free licence is found |
| UQ5 | Whether history compare is MVP (P1) or later | P1 |
| UQ6 | Voice/screen-reader auto-advance default | A setting, **"Move on automatically after I answer"** (default **on**, only for single-choice questions without a severity step). No screen-reader detection (it is not reliably detectable); the first question's hint mentions the setting |
| UQ7 | Acupoint diagrams: licence-safe source or original drawings | Original simple diagrams; WHO codes as text — done (U-25): a schematic per body part with only the recommended points marked, labels as live text, a line saying it is a schematic and the written location counts |

---

## 16. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-04 | Initial UI/UX specification |
| 0.2 | 2026-10-04 | Open design questions UQ1–UQ7 resolved with MVP defaults (working name, bands only, line-art illustrations, history compare in MVP); auto-advance is a Settings option instead of screen-reader detection |
| 0.3 | 2026-10-06 | The lock (PM-20): the Lock card of Settings (S17) and the lock screen (S23). Other post-MVP screens (S21, S22, the Trends tab, the Offline and Your data cards) are specified in their own design documents |
| 0.4 | 2026-10-06 | Seasons (PM-26): the Seasons card of Settings (S17) and the season line of the result (S13) |
| 0.5 | 2026-10-06 | The hour near a change (PM-27): the question on the birth card (S03) and its sentence on the result (S13) |
| 0.6 | 2026-10-06 | The season model declared (PM-29): the line and its disclosure on the result (S13), the foot of the practitioner summary, the development-only switch in S17 |
| 0.7 | 2026-10-06 | The kept backup file (PM-32): the card in Settings (S17) and the merge through the restore dialog |
| 0.8 | 2026-10-07 | S24, the learning book (PM-43); the hub (S21) lists it first |
| 0.9 | 2026-10-08 | The AI help card of Settings (S17) and the header's indicator (PM-46) |
| 0.10 | 2026-10-08 | S25, the conversation of AI help; its card on S06 and the notice on S04 (PM-47) |
| 0.11 | 2026-10-08 | The reading role: the Settings card, the landing offer, the header's chip, the result's line and the plan's title (PM-53) |
| 0.12 | 2026-10-08 | The note N-AMOUNTS beside every table of quantities; the card, the review and the result's line for the default reading (PM-54) |
