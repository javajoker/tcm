# Accessibility protocol

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Automated checks implemented (Q-05); the manual pass is run per release candidate and recorded in [`a11y-records/`](a11y-records/) |
| **Owner** | Accessibility — the person who signs the release checklist §6 |
| **Related** | [UX spec §8](ux-spec.md) (accessibility rules) · [Test plan §5.2](test-plan.md) · [`CHECKLIST.md`](../CHECKLIST.md) §5.4 and §6 · [i18n guide](i18n-guide.md) (language attributes) |

**Target:** WCAG 2.1 level AA, in `zh-Hant` and `en`, on phone and desktop. **Exit criterion for a release:** zero automated violations, every manual task in the record completed with no *blocker* or *major* finding open.

---

## 1. What is automated, and what it cannot see

| Check | Where | Catches | Does not catch |
|---|---|---|---|
| ESLint `jsx-a11y` | `pnpm lint` (every commit) | Missing labels, bad roles, click handlers without keyboard support | Anything that depends on runtime state |
| axe on **every route** × both languages, plus the emergency-notice state | `apps/web/test/a11y-sweep.test.tsx` (every commit); a guard fails the build when a route is added without being listed | Names, roles, landmarks, one `h1`, heading order, table structure, ARIA validity, `lang` | Colour contrast (jsdom has no layout), focus order in practice, how a screen reader *sounds* |
| Per-screen axe and behaviour tests | `apps/web/test/*.test.tsx` | Focus moves to the new heading on route change, dialog focus trap and restore, keyboard operation of the tongue map and tabs | — |
| Contrast of every token pair in both colour schemes | `apps/web/test/tokens.test.ts` | Text, controls and focus ring contrast; the colour-blind-safe scale rules | Colours drawn in figures from tokens in a real page |
| Figures have a text twin | `apps/web/test/figures.test.tsx` | `<title>`/`<desc>`, a table twin, no colour-only encoding | Whether the description is *useful* |
| Real-browser axe with contrast, Lighthouse accessibility ≥ 95, touch targets ≥ 44 px, no horizontal scroll at 320 px | Playwright and Lighthouse CI (tasks Q-04, Q-06) | The rest of the automated surface | Judgement |

Automation finds roughly a third of accessibility problems. The manual pass below is what finds the rest; it is not optional for a release.

---

## 2. The manual pass

**When:** on every release candidate (CHECKLIST §5.4, §6), and whenever a screen with a new interaction pattern changes (a new dialog, figure, drag or custom control) before it merges.
**Who:** someone other than the author of the change, with at least one pass per row of the matrix by a person who uses the technology regularly or has been trained to. If no such person is available the pass is recorded as *incomplete* and the release decision says so.
**Record:** copy [`a11y-records/TEMPLATE.md`](a11y-records/TEMPLATE.md) to `a11y-records/<release>.md`, fill in the environment and the grid, link every failure to an issue, and link the file from the release checklist.

### 2.1 Environments (record versions)

| Row | Technology | Browser | Device |
|---|---|---|---|
| VO-iOS | VoiceOver | Safari | iPhone |
| VO-mac | VoiceOver | Safari | macOS |
| TB | TalkBack | Chrome | Android phone |
| NVDA | NVDA | Firefox (and Chrome once) | Windows |
| KB | Keyboard only, no screen reader | Chrome or Firefox | Desktop |

Plus the display checks of §2.3 on at least one phone and one desktop.

### 2.2 Tasks (each in both `zh-Hant` and `en`; the language switch is part of the task)

For every task: the person can complete it **without sight of the screen** (screen readers) or **without a pointer** (KB), nothing is announced twice or not at all, and the focus is never lost or trapped.

| # | Flow | What to verify |
|---|---|---|
| A1 | Landing → read the disclaimer → acknowledge → start | The `h1` is announced on load; the disclaimer dialog is reachable, closable with Esc, and focus returns to its opener; the start button explains why it is disabled until the box is ticked |
| A2 | Profile: age, sex, pregnancy, medications, allergies | Every field has a spoken name and hint; "none" and "not sure" are real options; the tag input announces additions and removals; errors are announced and reachable |
| A3 | Birth card (optional) | The toggle states what it does; the echo ("true solar time …") is read; the repeated-hour choice is announced as a choice, not as an error |
| A4 | Red-flag screening, then a **blocking notice** | Focus lands on the notice heading; Esc does not dismiss it; "I understand — continue" is the only way on; focus returns sensibly afterwards; the emergency numbers are readable and dialable |
| A5 | Inquiry: a question, a severity, "why am I asked", skip, back | The question is the first thing read; single and multiple choice are distinguishable by sound; severity appears when needed and is announced; progress is not conveyed by colour only |
| A6 | Contradiction card | The conflict and each choice are read as a group; the choice made is announced |
| A7 | Tongue: zone buttons **and** the checklist twin | The two stay in sync in both directions; zone state (selected) is spoken; the illustration is not needed to finish |
| A8 | Pulse: rate, rhythm, positions, exclusive groups | Exclusive groups are announced as such; selecting one clears the other with an announcement; the educational note is reachable |
| A9 | Constitution questionnaire | A 1–5 scale is operable by arrow keys; page changes announce progress |
| A10 | Review → get my result | Edit links name the item they edit; the unsure list is read; the busy state is announced |
| A11 | Result: summary, panel (radar, bars, heat map), reasoning, advice | Every figure offers its description **and** its table; tables have headers; the order of sections matches the nav chips; citation chips open a sheet whose focus is managed; the confidence meter has a spoken value |
| A12 | Feedback marks and export | Each mark group is named with the item it refers to; the export dialog states what it contains |
| A13 | Formula detail | The composition table is readable cell by cell; role letters have spoken meanings |
| A14 | History → compare | The two results are comparable without sight; "computed with an older version" is stated in words |
| A15 | Settings → erase everything | The dialog names exactly what goes; Cancel is the first and default action |
| A16 | Language switch mid-flow | The route and answers survive; the new language is announced or at least visible to AT (`lang` on `<html>`); mixed runs (a Chinese term in English text) are pronounced in the right voice |
| A17 | Storage blocked ("Not saved" chip) | The chip is reachable and its explanation is read |

### 2.3 Display and preference checks (phone and desktop)

| Check | Pass criterion |
|---|---|
| 200 % browser zoom and 320 px width | No loss of content or function; no horizontal scroll of the page |
| Text-size presets (0.9 – 1.3×) | Layout holds; no clipped text; targets stay ≥ 44 px |
| Reduced motion | No essential motion; no animation that cannot be paused |
| Forced colours / high contrast | Everything is still visible and operable (focus ring, selection mark, borders) |
| Colour-blindness simulation (protanopia, deuteranopia, tritanopia) of the panel figures | The five-phase radar, bars and heat map read correctly without colour (labels, patterns, ✓ marks) |
| Dark and light schemes | Contrast holds in both; figures stay legible |
| Print preview | The result prints with the figures as tables, citations as footnotes and the disclaimer in the footer |

---

## 3. Findings

| Severity | Meaning | Release |
|---|---|---|
| **Blocker** | A task cannot be completed with that technology, or a safety notice cannot be perceived or acknowledged | Blocks |
| **Major** | The task can be completed, but only with a workaround or with significant confusion | Blocks unless the owner records a dated exception with a fix in the next release |
| **Minor** | Friction or an imprecise announcement | Does not block; filed and scheduled |

Each finding records: row, task, what was heard or seen, what was expected, a screenshot or recording if it contains no health data (use the synthetic sample person only), and the issue link. A regression test (axe rule, behaviour test or a note in the sweep) is added when the cause can be tested.

---

## 4. Changes to this protocol

Add a task whenever a new interaction pattern ships; remove one only when the screen is removed. Keep the task ids stable so records stay comparable between releases.
