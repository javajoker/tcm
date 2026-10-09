# Golden cases: where the engine misses, and why

> **Generated** by `node scripts/golden-misses.ts --write` from the golden cases (`packages/engine/test/golden`) and the knowledge base as the development profile bundles it (engine 0.1.0, scoring parameters `c4504d83+4c3e3303`). For the clinical reviewers, before a calibration session ([content review §4.4](content-review.md)). **Nothing was tuned to write it:** no weight, no parameter and no case was changed. The held-out half is reported as numbers only ([test plan §3.5](test-plan.md)): its misses are counted by the step at which they happen, never shown case by case, so that a session cannot aim at them; `node scripts/golden-misses.ts --held-out-detail` prints them to the terminal after a session has closed.

## 1. Where the set stands

30 cases, 0 agreed by a practitioner — **every case is synthetic**: the 23 seeds are each pattern's typical patient as the adaptive inquiry would record them (their notes say so) and the rest test the scope policy. Concordance on them measures whether the engine reproduces its own construction, not whether it agrees with practitioners; the targets are for 100 or more agreed cases.

| Split | Cases | Pattern first | Pattern top 3 | Formula top 3 | Policy |
|---|---:|---:|---:|---:|---:|
| tuning | 16 | 93 % (13/14) | 93 % (13/14) | 92 % (11/12) | 100 % (3/3) |
| held-out | 14 | 77 % (10/13) | 77 % (10/13) | 50 % (6/12) | 100 % (2/2) |
| all | 30 | 85 % (23/27) | 85 % (23/27) | 71 % (17/24) | 100 % (5/5) |

Targets missed: 30 cases; the target is at least 100; held-out pattern top-3 concordance 77 % (10/13) < 80 %; held-out formula top-3 concordance 50 % (6/12) < 70 %; no case is agreed by a practitioner yet (all synthetic).

## 2. The tuning half, case by case

One case misses.

### G-0003 — typical patient of EX3 Wind-heat invading the exterior

*Infrastructure seed: the findings are the typical patient's answers in the adaptive inquiry; the expectation is the pattern by construction and its standard formulas from the pattern table. Not practitioner-agreed.* (synthetic)

- **The case:** 35 years, male; 0 red flags; course chronic; 97 findings, 4 present — 發熱 (`S_FEVER`) moderate、口微渴 (`S_THIRST_LIGHT`) moderate、咽痛 (`S_SORE_THROAT`) moderate、咳痰黃稠 (`S_COUGH_PHLEGM_YELLOW`) moderate; 0 of them from the tongue or the pulse.
- **Expected:** EX3 first; formulas F_YINQIAO or F_SANGJU in the top three.
- **The engine:** not enough information (confidence insufficient); formulas none. The strongest scores: EX3 32.0 %, EX2 3.8 %, EX1 1.4 %, EX4 0.0 %.
- **Pattern miss — no pattern reaches the threshold of presentation: the engine says there is not enough information.**
  - EX3 scores **32.0 %** (weak; 8.0 of 25 weight points); a pattern is presented from **40 %**. Its 25 weight points come 14 from the questions, 7 from the tongue and 4 from the pulse, so the questions alone can give it at most 56.0 % (every sign present and severe) and 44.8 % at moderate severity. The evidence present: S_FEVER 3×0.8×1 = 2.4, S_SORE_THROAT 3×0.8×1 = 2.4, S_COUGH_PHLEGM_YELLOW 2×0.8×1 = 1.6, S_THIRST_LIGHT 2×0.8×1 = 1.6.
  - What would have changed it (computed on copies of the case):
    - the same answers, each graded severe instead of moderate: EX3 40.0 % → presented: EX3; formulas F_SANGJU (the formula expectation met)
    - also the inquiry signs of EX3 the case answers as absent (moderate): EX3 44.8 % → presented: EX3; formulas F_SANGJU (the formula expectation met)
    - also the tongue of EX3 (its tongue signs of weight ≥ 2, moderate): EX3 45.4 % → presented: EX3; formulas F_YINQIAO, F_SANGJU (the formula expectation met)
    - also the tongue and the pulse of EX3 (weight ≥ 2, moderate): EX3 51.8 % → presented: EX3; formulas F_YINQIAO, F_SANGJU (the formula expectation met)
- **Formula miss — no pattern is presented, so no formula is.** Expected F_YINQIAO or F_SANGJU; the engine's first three: none.
- **Likely cause:** The case gives only answers to questions — no tongue and no pulse — while 44.0 % of EX3's evidence weight is in the tongue and the pulse; its answers reach 32.0 %, under the 40 % of presentation, so the engine reports not enough information rather than a weak pattern; the formula miss follows from it: without a presented pattern there is no formula.

## 3. The held-out half, in numbers

6 of 14 cases miss something: 3 a pattern expectation, 6 a formula expectation. Where they fail, by the step of the engine:

| Pattern misses | Cases |
|---|---:|
| no pattern reaches the threshold of presentation: the engine says there is not enough information | 3 |
| other patterns are presented, the expected one is not | 0 |
| the expected pattern is presented, but not first | 0 |

| Formula misses | Cases |
|---|---:|
| no pattern is presented, so no formula is | 3 |
| the expected formulas belong to none of the patterns presented | 0 |
| the expected formulas fail the symptom fit | 3 |
| the expected formulas are removed by a safety rule or the output level | 0 |
| the expected formulas are kept but ranked after the third | 0 |

Of the formula misses, 3 come with a pattern miss in the same case.

## 4. The steps where cases fail, as the engine takes them

What a reviewer needs to read the counts above — the engine's rules and the parameters in force, none of them derived from a case:

1. **A pattern's score** is Σ weight × severity × quality over its signs present, minus its *against* signs, over the sum of its weights (× 0.5 when none of its required-any signs is present). Severity: light 0.6, moderate 0.8, severe 1. Quality: an answer 1, the tongue (guided observation) 0.7, the pulse 0.5. The tongue and the pulse are optional in the app, so a pattern whose evidence lies largely in them scores low on answers alone — the case of §2.
2. **Presentation:** a pattern is presented from **40 %** (bands: weak 20, medium 40, high 60); at most 3. When the first is under 40 % the engine says there is not enough information and recommends nothing — a weak pattern is never shown as a result.
3. **Formulas:** the candidates are the formulas of the presented patterns; each is fitted to the panel and kept if at least 60 % of its core indications are present; the safety rules and the output level may remove it; at most 3 of tier A or B are recommended, best fit first, and tier C follows for study only. The golden check reads the first three of that list, so a tier-C formula counts only when fewer than three of tier A or B come before it, and a formula miss follows every pattern miss of the first kind. The symptom fit counts the core indications present among all of them: 29 of the 33 formulas name a tongue or pulse sign among their core indications, and for 2 of them answers alone can never reach the 60 %.

## 5. For the calibration session

Questions this raises — to be decided by the reviewers in a session (content review §4.4), with the held-out half read only as numbers until it closes:

1. **The seeds describe the inquiry only.** Should the typical patient of a pattern include its tongue and pulse, or should the expectation of an inquiry-only seed be *not enough information* when its pattern rests largely on observation?
2. **Presentation on answers alone.** Should the threshold of presentation, or a pattern's weights, take into account how much of its evidence can come from questions — or should the inquiry ask for the tongue when such a pattern leads?
3. **Formula expectations.** Should a case expect any formula of its pattern's table, and should a study-only (tier C) formula count among the first three?
4. **The set itself.** The targets are for practitioner-agreed cases: the synthetic seeds are to be replaced by cases agreed in sessions, written with the inspector's *Case* tab and split when written (test plan §3.5).
