# The case file

One JSON object. Every id comes from `vocabulary.md`; the script checks each one and names the closest known ids when one is wrong. `assets/example-case.json` is a complete
case (a 45-year-old woman with 脾氣虛 findings) — start from it.

## Contents

1. [Fields](#fields)
2. [The person](#the-person)
3. [Findings and whole answers](#findings-and-whole-answers)
4. [Tongue and pulse](#tongue-and-pulse)
5. [Example: from the doctor's words to the case](#example-from-the-doctors-words-to-the-case)
6. [What the script answers](#what-the-script-answers)

## Fields

| Field | Required | Value |
|---|---|---|
| `lang` | no (default `zh-Hant`) | `zh-Hant` or `en`: the language of the report — the doctor's |
| `date` | no (default today) | `YYYY-MM-DD`, the day the patient is seen: the season the grams are adjusted for (因時) |
| `hemisphere` | no (default `north`) | `north` or `south`: which calendar of seasons |
| `person` | **yes** | below |
| `redFlags` | no | ids of level-A and level-B red flags the doctor found |
| `constitution` | no | `{ "primary": "C_…" }`, with `"secondary": "C_…"` for a second biased type |
| `course` | no | `acute`, `subacute` or `chronic` |
| `findings` | no | `{ "S_…": "present" \| "absent" \| "unsure" \| "light" \| "moderate" \| "severe" }` |
| `answers` | no | `{ "Q_…": ["option", …] \| "none" \| "skip" }` |
| `tongue` | no | `{ "body"?, "shape"?, "coat"?: ["T_…"] \| "normal", "signs"?: ["T_…"] }` |
| `pulse` | no | `{ "rate"?: 20–250, "rhythm"?: "regular" \| "skips" \| "irregular", "qualities"?: ["P_…"] }` |
| `unmapped` | no | the doctor's words the vocabulary has no item for (shown in the report, never used) |

## The person

```json
"person": {
  "age": 45,
  "sex": "female",
  "pregnancy": "no",
  "lactating": false,
  "medications": { "status": "some", "classes": ["antihypertensive"], "named": ["amlodipine"] },
  "allergies": { "status": "some", "items": ["杏仁"] },
  "conditions": { "status": "none" }
}
```

- `age` in whole years, `sex` `female` or `male`.
- `pregnancy` (`no` / `possible` / `yes`) and `lactating` are asked of a woman of 10 to 60 only — leave them out for anyone else.
- `medications.status`: `none`, `some` (give `classes` from the vocabulary and, if known, the `named` medicines; a named medicine of no listed class counts as `other`) or
  `unsure` (counted as `other`, conservatively).
- `allergies.status`: `none`, or `some` with the `items` by name (a herb or a food, in Chinese or English); a name that matches no herb is reported back.
- `conditions.status`: `none`, or `some` with `items` from the serious long-term conditions (`RF_C_KIDNEY`, `RF_C_LIVER` …).

Any of these missing makes the script answer with exit code 3 and the list of what to ask. Silence is never read as "no".

## Findings and whole answers

- `findings` records what the doctor said, finding by finding. A graded finding said without a grade is recorded `moderate`; `present` on it is fine.
- `answers` records a question answered as a whole: the chosen options are present and the question's other options absent; `"none"` makes them all absent; `"skip"`
  marks them unsure. Use it when the doctor addresses a whole domain ("二便調" → `"Q_STOOL": "none", "Q_URINE": "none"`).
- A question goes under one of the two, not both. Two findings of an exclusive group (`S_LOOSE_STOOL` and `S_CONSTIPATION`) cannot both be present.
- The more of the **core** questions the case covers, the more confident the result. Below about 60 % the knowledge base lists no formula and the report asks for more.

## Tongue and pulse

- `tongue.body`, `tongue.shape`, `tongue.coat`: the features seen in that category. The category's other features are then recorded absent; `"normal"` answers it as normal.
- `tongue.signs`: zone features and special signs that are present (`T_TOOTHMARK_EDGE` 舌邊齒痕 …).
- `pulse.qualities`: the pulses felt. `pulse.rate` gives 數 or 遲 from the number itself, so a rate and `P_RAPID`/`P_SLOW` are not both given. A clearly irregular rhythm is
  the level-B red flag `RF_B_IRREGULAR_PULSE`.
- The engine counts tongue and pulse at a lower weight than the inquiry, as it does in the app.

## Example: from the doctor's words to the case

> 女，45 歲，未孕，不哺乳，無服藥，無藥物過敏，無重大疾病。神疲乏力、少氣懶言三個月，食少，食後腹脹，大便溏，口淡不渴，喜熱食，面色萎黃。寒熱、汗出、頭身、胸腹、
> 耳目咽喉、唇甲、睡眠、情緒、月經、咳痰皆無特殊，小便調。舌淡，苔薄白，邊有齒痕；脈細弱。氣虛質。月經量少色淡。

- 三個月 → `"course": "chronic"`; the safety facts → `person`.
- 神疲乏力、少氣懶言、食少、食後腹脹、大便溏 → `findings` (graded ones `moderate`); 口淡、不渴、喜熱食、面色萎黃 → `findings` `present`.
- "皆無特殊" for the listed domains and 小便調 → `answers` `"none"` for those questions.
- 舌淡、苔薄白、齒痕 → `tongue`; 脈細弱 → `pulse.qualities` `["P_THIN", "P_WEAK"]`; 氣虛質 → `constitution`.
- 月經量少色淡 has no item in the vocabulary → `unmapped`.

The result is `assets/example-case.json`.

## What the script answers

| Exit | stdout |
|---|---|
| 0 | the report in Markdown (with `--json`: `{ status, level, patterns, formulas, plan, next, version, report }`) |
| 2 | `{ "status": "invalid", "errors": [{ "path": "findings/S_FATIGU", "message": "…", "suggest": ["S_FATIGUE"] }] }` |
| 3 | `{ "status": "incomplete", "missing": ["pregnancy", "medications"] }` — the items are `age`, `sex`, `pregnancy`, `lactating`, `medications`, `allergies`, `conditions` |
| 1 | an error on stderr |
