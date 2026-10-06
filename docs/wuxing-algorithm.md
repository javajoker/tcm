# Yin-Yang / Five-Phase Algorithm Specification

| | |
|---|---|
| **Version** | 0.2 |
| **Status** | Implemented and verified — [`packages/wuxing`](../packages/wuxing) (88 tests) |
| **Last updated** | 2026-10-06 |
| **Consumers** | [Diagnosis SOP](diagnosis-sop.zh-TW.md) §6 (先天・流年・時令) and §10 (盤面), [PRD](PRD.md) FR-18/19, knowledge base [`data/wuxing/`](../data/wuxing) |
| **Provenance** | Extracted from the author's earlier BaZi engine, *fate4* (private repository, commit `aba58ee`), and re-implemented independently. Nothing in this project depends on that repository. |
| **Translations** | [繁體中文版](wuxing-algorithm.zh-TW.md) (kept in sync; **this English version is authoritative** if they differ) |

---

## 1. Purpose, scope and epistemic status

### 1.1 What this document specifies

How the app turns **birth data + the current date** into numbers that describe the five phases (木火土金水)
and yin–yang balance of a person, and how those numbers become a *personal reference panel* for the TCM
diagnosis pipeline:

```
birth moment ──► four pillars ──► element weights ──► propagation ──► innate profile ┐
current year ─► 大運 / 流年 pillars ─► year evaluation ─► annual profile ────────────┤
current date ─► solar longitude ─► season · 五運六氣 ──────────────────────────────────┤
                                                                                     ▼
                                                              personal reference panel (≈ "normal for me, now")
                                                                                     │  with the observed panel from 四診
                                                                                     ▼
                                                  offsets · generation/restraint transmission · susceptibility
```

### 1.2 Epistemic status — read before relying on any number

| Block | Origin | Status in this app |
|---|---|---|
| Solar terms, true solar time, pillars, 大運 timing | Astronomy + calendar rules | **Objectively verifiable** against almanacs (see §12). |
| Element weights and propagation (§5–6) | A *model* of BaZi doctrine with chosen coefficients | **Cultural-tradition prior, not clinically validated.** Coefficients are choices, tagged `[calibrate]`/`[school]`. |
| 五運六氣 (§9.4) | Classical doctrine of 《素問》運氣七篇 | Classical TCM, **predictive power disputed.** |
| Seasonal commanding element (§9.3) | 《素問·四氣調神大論》, 《藏氣法時論》 | Classical, widely used in TCM health preservation. |

Consequently the engine is built so that **no prior can create or hide evidence**: every block is capped,
switchable, reported separately, and the diagnostic offset that drives pattern differentiation is computed against
the *average healthy person*, never against the prior (§9.5). Output wording must stay on the "tendency /
traditionally associated with" level (§15).

---

## 2. Extraction map: what is kept, what is dropped

The source engine has seven layers plus three divination engines. Only the yin-yang/five-phase computation that
combines **birth data with the year** was extracted.

| Source layer | Decision | Reason |
|---|---|---|
| L0 排盤 — solar terms (VSOP87D), true solar time, year/month/day/hour pillars, 人元司令, 起運/大運 | **Kept** | Needed to place the birth in the five-phase frame; verifiable. |
| L0 — 胎元, 命宮, 身宮, 胎息, 農曆 date | Dropped | The source itself excludes 胎元/命宮 from weights (they double-count the month pillar). |
| L1 配重 — carriers, 40:60, hidden stems, month command, 司令 boost, 大運 130, 流年 110 | **Kept** | Core of the element weights. |
| L1 — 空亡 | Dropped | Declared in parameters but never applied by the source's L1. |
| **L2 結構 — 合化刑沖害破** | **Dropped** | The source's latest commit removed it from the base chart ("直接五行平衡即可": the element balance already is the outcome of the interactions). Its instant chart still applied it — an inconsistency (§13). We drop it everywhere and regenerate the oracle without it. |
| L3 傳導 — generation/restraint propagation | **Kept** | Core of the five-phase interaction. |
| L4 斷論 — 十神, 旺衰, 從格, 用神, 格局, 六親 | Dropped | BaZi life-reading concepts; unrelated to TCM balance. We use the *shares* directly. |
| L4p 人格 — persona, 五行偏枯 body mapping | Partly re-derived | The idea (element absent/weak/excess) is re-done as bands (§8). Body/character mapping is replaced by the 《內經》 correspondences used in TCM. |
| L5 temporal — 大運/流年 re-evaluation, neutral-year share delta | **Kept** | The "year" part of birth + year. |
| L5 — 流月/流日, 應期, curves, nodes, 顺逆指数 | Dropped | Triggers/forecasts of events; not five-phase state. (Seasonal variation inside a year comes from §9.3 instead.) |
| 神煞 | Dropped | No role in the five-phase balance. |
| 六爻 / 六壬 / 奇門 / crossref / plain-language / report layers | Dropped | Divination and narrative generation. |

**New in this project** (not in the source): seasonal commanding element, 五運六氣, the personal reference panel, the
dual offset analysis and the 生克乘侮 transmission (all §9).

---

## 3. Static tables

### 3.1 Stems and branches

Stem element = ⌊index/2⌋ in the order 木 火 土 金 水; stem is 陽 when its index is even.

| # | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Stem | 甲 | 乙 | 丙 | 丁 | 戊 | 己 | 庚 | 辛 | 壬 | 癸 |
| Element / polarity | 木陽 | 木陰 | 火陽 | 火陰 | 土陽 | 土陰 | 金陽 | 金陰 | 水陽 | 水陰 |

Branches in order 子 丑 寅 卯 辰 巳 午 未 申 酉 戌 亥 (index 0–11). A branch is **not a carrier**; it is a container of hidden stems.

> **體陰用陽.** For 子 午 巳 亥 the polarity by position differs from the polarity of the principal hidden stem (子: position 陽, qi 陰
> (癸); 午: 陽 vs 陰 (丁); 巳: 陰 vs 陽 (丙); 亥: 陰 vs 陽 (壬)). **All interactions use the qi polarity**, because the carrier is the
> hidden stem. (Test: `ganzhi.test.ts`.)

### 3.2 Hidden stems (藏干) and their split

| Branch | Hidden stems (principal → middle → residual) | Split of the branch's 60 points |
|---|---|---|
| 子 | 癸 | 1.00 |
| 丑 | 己 癸 辛 | 0.65 / 0.25 / 0.10 |
| 寅 | 甲 丙 戊 | 0.65 / 0.25 / 0.10 |
| 卯 | 乙 | 1.00 |
| 辰 | 戊 乙 癸 | 0.65 / 0.25 / 0.10 |
| 巳 | 丙 庚 戊 | 0.65 / 0.25 / 0.10 |
| 午 | 丁 己 | 0.70 / 0.30 |
| 未 | 己 丁 乙 | 0.65 / 0.25 / 0.10 |
| 申 | 庚 壬 戊 | 0.65 / 0.25 / 0.10 |
| 酉 | 辛 | 1.00 |
| 戌 | 戊 辛 丁 | 0.65 / 0.25 / 0.10 |
| 亥 | 壬 甲 | 0.70 / 0.30 |

Counts: 3 single (子卯酉), 2 double (午亥), 7 triple. **School variant:** some texts list 申 as 庚壬 only and 亥 as 壬甲戊; this
engine uses the table above. The 10 % residual share is deliberately small but non-zero (戌 中 丁 is the fire store and must not vanish, yet
must never reach the magnitude of the principal 戊).

### 3.3 Generation and restraint

```
生 (generates):  木 → 火 → 土 → 金 → 水 → 木
克 (restrains):  木 → 土 → 水 → 火 → 金 → 木
```

Directed acting relation of carrier *i* on carrier *j*: `生`, `克`, `同` (same element) or `無` (*i* does **not** act in this direction because *j* generates
or restrains *i*; that effect is counted when the pair is visited as (*j*, *i*)). **Every direction is counted exactly once** — counting both in one visit
is the classic double-counting bug.

> Reverse lookups ("what generates x", "what restrains x") are separate named functions (`generatedBy`, `controlledBy`): writing `CONTROLS[x]`
> for "what restrains x" is a silent, error-free bug that the source repository hit twice.

### 3.4 Month branches and 人元司令

The twelve 節 open the month branches in this order: 立春→寅, 驚蟄→卯, 清明→辰, 立夏→巳, 芒種→午, 小暑→未, 立秋→申, 白露→酉, 寒露→戌, 立冬→亥, 大雪→子, 小寒→丑.

人元司令 — the hidden stem that "commands" at each number of days after the 節:

| Branch | Segment 1 | Segment 2 | Segment 3 |
|---|---|---|---|
| 寅 | 戊 7 d | 丙 7 d | 甲 16 d |
| 卯 | 甲 10 d | 乙 20 d | — |
| 辰 | 乙 9 d | 癸 3 d | 戊 18 d |
| 巳 | 戊 5 d | 庚 9 d | 丙 16 d |
| 午 | 丙 10 d | 己 9 d | 丁 11 d |
| 未 | 丁 9 d | 乙 3 d | 己 18 d |
| 申 | 戊 7 d | 壬 3 d | 庚 20 d |
| 酉 | 庚 10 d | 辛 20 d | — |
| 戌 | 辛 9 d | 丁 3 d | 戊 18 d |
| 亥 | 戊 7 d | 甲 5 d | 壬 18 d |
| 子 | 壬 10 d | 癸 20 d | — |
| 丑 | 癸 9 d | 辛 3 d | 己 18 d |

Resolution of a commanding stem that is **not** hidden in the month branch (it is often the tail of the previous month's principal qi):
1. if hidden in the branch → that hidden stem;
2. else the hidden stem of the **same element** (子 壬→癸, 卯 甲→乙, 午 丙→丁, 酉 庚→辛);
3. else none: the boost has nowhere to land. This happens **only for 亥, days 0–7 (戊)**, which hides no earth. It is inherent to 亥, reported as a warning, not a defect.
(Test: exhaustive over all 12 branches × segments.)

---

## 4. L0 — natal chart construction

### 4.1 Input

The input is **validated** before any computation (`validateBirthInput`; `buildChart` throws a `RangeError` listing every problem): Gregorian date (year 1583–2200, real month and day), hour 0–23, minute/second 0–59, longitude −180…180, sex, IANA zone. Without this JavaScript's `Date` would silently roll month 13 or 30 February over into another day and the chart would be wrong without any warning.

```ts
interface BirthInput {
  year; month; day; hour; minute; second?;   // civil wall-clock time, Gregorian
  sex: "male" | "female";                    // only decides the 大運 direction
  timeZone: string;                          // IANA, e.g. "Asia/Taipei"
  longitude: number;                         // birthplace, east positive
  unknownHour?: boolean;                     // hour pillar omitted, never guessed
}
```

### 4.2 Time normalisation — two time scales, each with its own job

```
wall clock ──(IANA zone + historical DST)──► UTC  = birthJdUT           (absolute instant)
UTC ──(+ longitude·4 min)──► local mean solar time ──(+ equation of time)──► true solar time = trueSolarJd
```

| Decides | Uses | Why |
|---|---|---|
| **Year pillar, month pillar, 司令 days, 大運 timing** | the **absolute** instant `birthJdUT` | Solar terms are astronomical events that occur at one instant worldwide. Comparing them with a longitude-shifted clock double-counts the longitude and equation-of-time offsets (Ürümqi births would get a month pillar two hours off). |
| **Hour branch, day boundary** | **true solar time** `trueSolarJd` | The 時辰 is a local sun-shadow construct and should move with longitude. |

- Zone conversion uses the platform's `Intl` and IANA tzdata (no dependency; full history including China's 1940–41, 1945–48 and 1986–91 DST).
- **Overlap** (fall-back hour: one wall time = two instants) and **gap** (spring-forward: the time did not exist) are *reported*, never silently resolved. The earlier instant is used and the alternative is returned. Fixed-point iteration is not used: in an overlap hour both probes converge to the same candidate and would report "unique" exactly where ambiguity matters. Instead the offset is read from both sides of any transition (±24 h) and both candidates are round-tripped.
- Longitude correction uses the **birthplace's actual longitude**, 4 min per degree (Ürümqi 87.6°E vs 121.47°E ⇒ 135 min, over a whole 時辰).
- Equation of time: 3.6 min on 12 May 1990, range −14.2 (mid-Feb) to +16.4 min (early Nov). It matters because hour boundaries are on the hour.

### 4.3 Solar terms from astronomy

A term is the instant the Sun's **apparent** ecliptic longitude λ reaches a multiple of 15° (立春 315°, 驚蟄 345°, 清明 15°, … 大寒 300°).
There is no lookup table; λ(t) is root-found.

```
λ(t) = L_geometric(VSOP87D Earth) + 180°  + FK5 correction (−0.09033″)
       + Δψ (nutation in longitude, 4-term short form)  − 20.4898″ / R   (aberration)

solveSolarTerm(target, t0):                      # Newton, slope = mean solar motion 0.9856°/day
    repeat:  δ ← normSigned(target − λ(t));  if |δ| < 1e-8° stop;  t ← t + δ / 0.9856
    jdUT = jdTT − ΔT(year, month)
```

- **VSOP87D** truncated series (|A| < 1e-9 for L, 1e-8 for R; 818 + 213 terms). The data file's provenance (CDS/IMCCE archives, SHA-256 `8b160c85…ca91`) is recorded in its header.
- **Nutation cannot be dropped**: Δψ has an amplitude of 17.2″ ≈ **7 minutes** of term time.
- **ΔT** (TT − UT): Espenak & Meeus 2006 piecewise polynomials. It ranges −3 s … +200 s over 1900–2100 — larger than the 60 s tolerance. After 2005 it is an extrapolation; **after 2050 the 60-second promise is withdrawn** (a warning is emitted for births after 2050).
- **Error budget** (tolerance 60 s ≙ 2.5″ of longitude): truncation 0.03″ + nutation 0.5″ + aberration 0.01″ ≈ 0.55″ ≈ 13 s, + ΔT 2–3 s ≈ **16 s**; margin 3.7×. Measured against the Hong Kong Observatory's 240 terms (2019–2028): see §12.
- `enclosingTerms(jdUT, kind)` does not enumerate the year: λ of the instant locates its 30° bin and only the two bounding terms are solved.
- Month pillars always use the 節 (12 of 24 terms); the 氣 do not bound months.

### 4.4 The four pillars

| Pillar | Rule |
|---|---|
| **Year** | Bounded by **立春**, not 1 Jan and not lunar New Year. `stem = (Y − 4) mod 10, branch = (Y − 4) mod 12` for the 立春-year Y; 4 CE is 甲子. |
| **Month** | Branch from the enclosing 節. Stem by **五虎遁**: 寅-month stem = 丙 戊 庚 壬 甲 for year stems (甲己, 乙庚, 丙辛, 丁壬, 戊癸); then step forward from 寅. |
| **Day** | Index = `(JDN + 49) mod 60`, 0 = 甲子, with JDN the Julian day number of the **true-solar** civil date. Anchors: 1949-10-01 = 甲子, 2000-01-01 = 戊午 (18 354 days apart, 18 354 mod 60 = 54 = 戊午). |
| **Hour** | Branch from true-solar hour: 23–01 子, 01–03 丑 … Stem by **五鼠遁**: 子-hour stem = 甲 丙 戊 庚 壬 for day stems (甲己, 乙庚, 丙辛, 丁壬, 戊癸); then step forward. |

**Late-子 rule** (`ziHourRule`, a school choice, always reported with the chart):

| Rule | 23:00–24:00 day pillar | Hour stem derived from |
|---|---|---|
| `lateZiNextDay` (default) | next day's | next day's stem |
| `earlyZiSameDay` | same day's | same day's stem |
| `split` | same day's | next day's stem |

**Unknown hour:** the hour pillar is omitted and nothing that depends on it is inferred. The natal total drops from 468 to 368 **without compensation** (a missing pillar is missing information).

### 4.5 大運 (decade luck) timing

```
direction:  (陽 year stem, male) or (陰 year stem, female) → forward (toward the next 節)
            otherwise                                      → reverse (toward the previous 節)
daysToTerm   = |term instant − birthJdUT|
startAge     = daysToTerm / 3                       # the ONE conversion rate: 3 days = 1 year
startJd      = birthJdUT + startAge × 365.2421897
step n (n = 1…12):  [startJd + (n−1)·10 y,  startJd + n·10 y),
                    pillar = month pillar stepped ±n in the 60-cycle
```

The polarity is that of the year **stem**, not the branch. Only the 3:1 rate is stored; everything else is derived (the source's earlier docs contradicted
themselves on "1 時辰 = ? days" by keeping several constants).

---

## 5. L1 — carriers and initial weights

### 5.1 Everything reduces to stems

A **carrier** is a heavenly stem with a weight. The pillar's own stem is a carrier; the branch contributes its hidden stems as carriers. The chart state is a vector over
carriers; element totals, polarity totals and every later quantity are projections of the same vector, and the interaction needs a single kernel ("stem × stem").

Carrier fields: `id` (`month.branch.0`), `stem`, `element`, `polarity` (of the stem), `pillar`, `layer` (stem/branch), `hiddenIndex`, `hostBranch`, `role`
(本氣/中氣/餘氣), `isDayMaster`, `weight`, `activity` (= 1).

### 5.2 Natal weights

```
per pillar:  base = 100    stem = 40 (×0.40)    branch = 60 (×0.60), split among hidden stems by §3.2

month pillar:   branch total = 60 × 2.0 = 120      stem = 40 × 1.2 = 48      (month command; total 168)
司令 boost:     boosted = [w_i × 1.5 if stem_i == resolvedTo else w_i]
                w_i ← boosted_i × 120 / Σ boosted                (month branch re-normalised to exactly 120)

natal total = 100 (year) + 168 (month) + 100 (day) + 100 (hour) = 468       (368 with unknown hour)
```

The boost is re-normalised **inside** the month branch: the total is unchanged and only the internal structure shifts. That is why the start and the end of the
same calendar month give different charts. The month pillar holds 35.9 % of the total, inside the traditional range ("月令定五分" to one third).

No extra weight is given for "revealed stems" or the day branch: rooting and proximity are expressed by the distance model of L3 (a stem's root is a same-element carrier at distance 1.00 in its own pillar). Adding a coefficient in L1 would count the same effect twice.

### 5.3 External pillars

```
大運:  total 130;  stemShare(t) = 0.70 + (0.30 − 0.70) · (elapsed / 10)      # linear; crosses 0.50 at year 5
       stem = 130 · stemShare,  branch = 130 · (1 − stemShare)  → hidden split as usual
流年:  total 110, fixed  stem 40 : branch 70   (NOT the natal 40:60 — the Grand Duke acts mainly through the branch)
```

The 大運 total is constant while its stem/branch balance drifts continuously (heavier on the stem first, on the branch later) — a hard step at year 5 would put an artificial jump into any
curve. Both external pillars are laid **separately** from the natal pillars so that "the four pillars do not change with the moment" is structural.

### 5.4 L1 invariants (all tested)

natal total 468/368 · each non-month pillar: stem 40 + hidden 60 · month: stem 48, hidden exactly 120 after boost · 大運 = 130 for every elapsed time · 流年 = 110 = 40 + 70 ·
all weights ≥ 0 · exactly one day-master carrier.

---

## 6. L3 — generation/restraint propagation

Answers "once these forces interact, what is left of each?". Multi-round **synchronous** iteration: each round computes all increments from the previous round's
complete state and applies them at once, so the result is independent of carrier order.

### 6.1 Three modelling decisions

1. **生 is a flow, not an addition.** 木 gives part of its weight to 火: `W木 −= F`, `W火 += η·F`, η = 0.85. The (1−η) is transfer loss. Generation is (nearly) mass-conserving and cannot explode.
2. **克 is destruction, not transfer.** 金克木 removes weight from 木 (`D`) and costs 金 (`D · keCost`, keCost = 0.30). Both shrink ⇒ total mass is strictly non-increasing.
3. **Same-element support is resistance, not addition.** Adding points between same-element carriers is positive feedback (≈ ×4.7 after 20 rounds) and lets "how many of one kind" dominate. Support instead damps incoming 克:
   ```
   resistance_j = 1 / (1 + β · S_j / M),    S_j = Σ_{a≠j, same element} W_a · Dist(a, j),    β = 0.60,  M = total mass
   ```
   A stem's root is a same-element carrier at distance 1.00 in its own pillar, so rooting needs no separate mechanism.

### 6.2 Coefficients

| Name | Value | Meaning |
|---|---|---|
| Kernel 生 / 克 | 0.30 / 0.40 | 克 is heavier by design: restraint decides more than support. |
| Polarity — 生 | opposite 1.00 · same 0.70 | Generation is stronger between opposite polarities. |
| Polarity — 克 | same 1.00 · opposite 0.70 | Restraint is stronger between the **same** polarity. (The two rules run in opposite directions — a core asymmetry of the doctrine; tested.) |
| Distance, natal | same pillar (stem ↔ own hidden) 1.00 · within one branch's hidden stems 0.60 · adjacent pillars 0.80 · one apart 0.40 · two apart (年↔時) 0.20 · **×0.70** if the layers differ (stem ↔ another pillar's branch) | Pillar order 年0 月1 日2 時3. |
| Distance, external | 大運→natal 0.80 · 流年→natal 0.70 · 大運↔流年 1.00 · **natal→大運 0.60 · natal→流年 0.50** · 流年→day master ×1.15 | Deliberately asymmetric: the environment acts on the person more than the person on the environment. |
| Outflow cap | 0.35 of the giver's weight per round | |
| Inflow-damage cap | 0.40 of the target's weight per round | |
| Rounds · damping · ε | 3 · 0.50 · 0.002 | See §6.4 — rounds are an *interaction depth*. |

### 6.3 One round (pseudocode)

```
M ← Σ W;   resistance[j] ← 1 / (1 + β · S_j / M)
for each carrier i with W_i > 0:
    for rel in {生, 克}:
        targets ← { j ≠ i : actingRelation(elem i, elem j) = rel };   w_j ← Y(pol_i, pol_j, rel) · Dist(i → j)
        rate    ← K(rel) · max_j w_j                         # set by the strongest coupling, NOT by the number of targets
        total   ← W_i · activity_i · rate
        for j in targets:  B ← total · w_j / Σ w                       # shared by coupling strength
            生: cost_i += B,            gain_j += η · B
            克: damage ← B · resistance[j];   cost_i += damage · keCost,   gain_j −= damage
cap outflow:  if Σ cost_i > 0.35 · W_i  → scale all of i's cost AND gain together
cap inflow:   if Σ damage into j > 0.40 · W_j → scale all damage into j, cost AND gain together
Δ ← accumulate;   W ← max(0, W + damping · Δ)
residual ← max_i | W_i/ΣW_after − W_i,before/M |         # on the normalised distribution
```

Scaling a cap must hit **cost and gain together**; scaling only one creates or destroys mass out of nothing.

**Why normalise by the target set.** The outflow *rate* belongs to the giver; several receivers share it, they do not multiply it. Summing per target makes outflow
proportional to the *number* of targets, an artefact of hidden-stem bookkeeping (火 has four 土 carriers to feed, 木 has one). Measured on the source engine before the fix: median outflow
63 %, max 102 %, every carrier hitting the cap, total mass collapsing 434 → 18.

### 6.4 Why 3 rounds and not "until convergence"

Every increment is proportional to `W`, so one round is the linear map `W ← (I + λA)W`. Iterating to convergence is power iteration: it forgets the initial weights and keeps only the
dominant eigenvector — washing out the month command that L1 built. In the source's own example 火 fell from 52.7 % to 8.8 % and 金 rose to 63 % after 30 rounds: the result of the matrix, not of the chart. The round
count is therefore a **calibration parameter** (default 3: two rounds catch a second-order chain such as 金生水→水生木; more starts to degrade toward the eigenvector).
The vitality (below) is the per-round retention, so it does not change with the count.

### 6.5 Outputs and normalisation

- **Normalised back** to the incoming total: the shape is kept; the scale loss is reported as `vitality`.
- `vitality = (ΣW_final / ΣW_in)^(1/rounds)` — **per-round** retention (a cumulative figure would vary arbitrarily with the round count). High → generating/flowing, low →
  mutual restraint consuming force. It measures internal friction, not "good or bad".
- `byElement`, `byPolarity`, `flows` (who generated/restrained whom, with cumulative amounts, for a Sankey view), `convergence {converged, rounds, finalResidual}`.

### 6.6 L3 invariants (all tested)

order independence (shuffle ×40, < 1e-9) · non-negativity · mass non-increasing · both caps · normalised total preserved · `0 < vitality ≤ 1` · input not mutated · same-element carriers never act on each other.

---

## 7. Temporal evaluation

### 7.1 Base chart vs instant chart

```
base    :  natal L1 → L3.                                             computed once, frozen
instant :  copy of natal L1 + 大運 carriers + 流年 carriers → L3.      from scratch every time
```

The natal L1 weights are reused, never recomputed. Propagation is re-run in full for every instant because relative weights change inside a 大運 (the stem share slides 0.70 → 0.30).
There is no incremental update: the cost is tiny (~24 carriers, ~550 ordered pairs, 3 rounds).

**流月 and 流日 are not modelled**, by design: a month or day is a *trigger*, not a source of force. Adding a 30-day factor into the weight iteration would make it compete numerically with the lifelong month command and bury
the yearly signal in high-frequency noise. Within-year variation comes from the seasonal module (§9.3).

### 7.2 Year evaluation

`evaluateYear(base, Y)` for the 立春-year Y:
1. annual pillar = 60-cycle position `(Y − 4)`;
2. **sampling instant = 4 Feb 00:00 of year Y** (a convention) → picks the active 大運 step and `elapsed = (sample − step.start) / 365.2421897`;
3. solve the instant chart; years before the first 大運 (childhood) have no 大運 carriers;
4. a year in which the 大運 changes is **not time-averaged** — the atmosphere of two consecutive 大運 cannot be mixed linearly.

### 7.3 Neutral-year correction (essential)

Shares always sum to 1, so adding any carriers pulls every share toward even: a chart's weakest element "rises" and its strongest "falls" merely because pillars were added, whatever they are.
Plain subtraction measures that dilution (in the source: median bias +0.054, 61.7 % of years positive). The null hypothesis is that the added force is spread evenly over the five elements:

```
expected(e) = ( W_natal(e) + added / 5 ) / mass_now          added = mass_now − mass_natal
delta(e)    =   W_now(e) / mass_now − expected(e)            Σ_e delta(e) = 0   (and = 0 when nothing is added)
```

---

## 8. Element profile outputs

For a solved chart: `shares[e]` (Σ = 1), `polarityShares`, and `evenness = H / ln 5 ∈ [0, 1]` (normalised entropy; 1 = perfectly even).

**Relative deviation** `r_e = (share_e − 0.20) / 0.20` — 0 = even, −1 = absent, +1 = double the even share. **Bands** (placeholders `[calibrate]`):

| Band | Condition |
|---|---|
| 缺 (absent) | share < 5 % |
| 偏弱 | r < −0.35 |
| 平 | −0.35 ≤ r ≤ +0.35 |
| 偏旺 | +0.35 < r ≤ +0.75 |
| 過旺 | r > +0.75 |

**Degree** (the ±3 scale of the diagnostic panel; 1 mild · 2 moderate · 3 marked): `degree = clamp(r · gain, ±cap)` with innate gain 1.0 / cap 1.0; annual `clamp(delta/0.20 · 1.0, ±0.75)`.

---

## 9. TCM adaptation

### 9.1 Correspondences used by the engine

| Element | 臟 | 腑 | Season (四氣調神) | Qi of the year (六氣) | Pathogenic qi |
|---|---|---|---|---|---|
| 木 | 肝 | 膽 | 春 | 厥陰風木 | 風 |
| 火 | 心 | 小腸 | 夏 | 少陰君火 · 少陽相火 | 火 (君火) · 暑 (相火) |
| 土 | 脾 | 胃 | 長夏 | 太陰濕土 | 濕 |
| 金 | 肺 | 大腸 | 秋 | 陽明燥金 | 燥 |
| 水 | 腎 | 膀胱 | 冬 | 太陽寒水 | 寒 |

The full correspondence table (五體、五華、五液、五志、五味、五色、官竅) lives in `data/wuxing/`. Note the **one real textual disagreement** inside the 《內經》: the 竅 of 心 and 腎
(《陰陽應象大論》: 心 舌, 腎 耳; 《金匱真言論》: 心 耳, 腎 二陰). The default follows 《陰陽應象大論》 and the choice is stored with the data.

### 9.2 Reference panel — three blocks, one cap each

```
N(e) = clamp( I(e) + A(e) + Y(e) + S(e),  ±1.5 )
  I  innate         degree from natal shares                                   cap ±1.00
  A  annual (BaZi)  degree from the neutral-year delta                         cap ±0.75
  Y  yunqi          歲運 + 司天/在泉 (§9.4)                                    cap ±0.50
  S  season         commanding element +0.50, the element it restrains −0.125   (§9.3)
```

- Every block can be switched off independently (`enable.innate | annualBazi | yunqi | season`); the panel reports each component and a one-line `trace` per contribution.
- **No birth data:** pass `null`; I and A are omitted and the panel says so. The app works without birth data.
- The reference is mapped onto the five 臟: it shifts **氣 and 陽** (function) by `N(e)`, not 血 and 陰 (substance).

### 9.3 Season

Commanding element from the apparent solar longitude (四氣調神: 春肝 夏心 長夏脾 秋肺 冬腎). Models (a school choice, stored in the parameters):

| Model | 木 | 火 | 土 | 金 | 水 |
|---|---|---|---|---|---|
| `changxia` (default) | [立春, 立夏) | [立夏, 小暑) | **長夏** [小暑, 立秋) | [立秋, 立冬) | [立冬, 立春) |
| `tuwang18` | the four seasons as above without 長夏, but 土 commands the **18 days before each of 立春 立夏 立秋 立冬** | | | | |

**Basis (hemisphere).** The season a person lives is not the same everywhere, so the lookup has a *basis* that the person chooses (the app suggests one from the device's time zone and says that it is only a suggestion). Three values:

| Basis | What the season is |
|---|---|
| **north** (default) | The table above, unchanged. A parameter at its default value is left out of the parameters and out of the result, so a northern result is byte-for-byte what it was before the basis existed (pinned by a recorded-hash test over whole results) |
| **south** | The lookup is made at the apparent solar longitude **+ 180°**: `seasonAt(λ, model, "south") = seasonAt(λ + 180°, model, "north")` for every λ and both models. In practice spring begins in early August, summer in early November, 長夏 runs from early January to early February, autumn from early February, winter from early May. The coming-seasons forecast lists the seasons in the order the person lives them, and its boundaries are shifted the same way |
| **off** | For the equatorial tropics, where four seasons are not the climate: no season block, no coming seasons, and no susceptibility to a season in the result. Nothing else changes |

What does **not** move on the southern basis: the birth chart and its solar terms (an astronomical event, the same for everyone), the annual block, the 五運六氣 of §9.4 (defined by the year's stem and branch; the classical claims they carry belong to the tradition's own latitude, so they stay *calendar* references and are declared as such), and — under `tuwang18` — the days of 土, which are the 18 days before each of the four 立 terms in both hemispheres (the four terms are 90° apart, so a shift of 180° maps the set of them to itself). The choice of *what* flips (the experienced season, and only that) is the clinical content owner's to confirm. The model knows the calendar and this choice, not the climate where the person is; the interface says so beside the choice.

A basis other than the default is a parameter of the result: it is stamped (`meta.seasons` = `south` | `off`) and ends the stamp of the parameters (`+south`, `+noseason`), so a history keeps results made on different bases in separate series, and a saved result is replayed on the basis it was made on.

### 9.4 五運六氣 (classical, person-independent)

Source: 《素問》天元紀大論, 五運行大論, 六微旨大論, 氣交變大論, 五常政大論, 六元正紀大論, 至真要大論 (verified against the local text).

| Item | Rule |
|---|---|
| **歲運** (from the year stem) | 甲己 土 · 乙庚 金 · 丙辛 水 · 丁壬 木 · 戊癸 火. 陽 stem → **太過**, 陰 stem → **不及**. |
| **司天** (from the year branch) | 子午 少陰君火 · 丑未 太陰濕土 · 寅申 少陽相火 · 卯酉 陽明燥金 · 辰戌 太陽寒水 · 巳亥 厥陰風木. |
| **在泉** | The qi three places on in the cycle 厥陰→少陰→太陰→少陽→陽明→太陽 (少陰↔陽明, 太陰↔太陽, 少陽↔厥陰). |
| **主氣** (steps 1–6) | 厥陰風木 · 少陰君火 · 少陽相火 · 太陰濕土 · 陽明燥金 · 太陽寒水, by solar longitude: 初 300°–0°, 二 0°–60°, 三 60°–120°, 四 120°–180°, 五 180°–240°, 終 240°–300°. |
| **客氣** | The rotation above, placed so that **司天 is step 3 and 在泉 step 6** (e.g. 子午 years: 太陽寒水, 厥陰風木, 少陰君火, 太陰濕土, 少陽相火, 陽明燥金). |
| **Year boundary** | A yunqi year starts at **大寒**, ~2 weeks before the BaZi year (立春). The two are kept apart. |

Effect on the element vector (《素問·五運行大論》: 氣有餘則制己所勝而侮所不勝；其不及則己所不勝侮而乘之，己所勝輕而侮之):

```
歲運 element E, 太過:  E +0.50;  the element E restrains −0.25 (over-restraint);  the element that restrains E −0.25 (insulted)
歲運 element E, 不及:  E −0.50;  the element that restrains E +0.25 (乘);          the element E restrains +0.25 (侮)
司天 +0.30 and 在泉 +0.20 on the elements of those qi;   each element's yunqi total capped at ±0.50
```

The year's **pathogenic-qi tendency** (風寒暑濕燥火, 0–1) = 0.4·司天 + 0.2·在泉 + 0.3·current guest qi + 0.1·current host qi. Example: 2026 丙午 is 水運太過 (丙 is 陽),
少陰君火 above, 陽明燥金 below; in early October the step is 五 with host 陽明燥金 and guest 少陽相火, and the guest restrains the host (客勝: 火克金).

### 9.5 Offsets — and why a prior must not explain symptoms away

The diagnostic pipeline (SOP §8) builds an **observed panel** `O` from symptoms and signs only, then `analyzeOffset(O, reference)` returns:

| Output | Formula | Role |
|---|---|---|
| `offsetPopulation` | `O − 0` | **PRIMARY.** Deviation from the average healthy person. Drives pattern differentiation, treatment direction and formula choice. |
| `offsetPersonal` | `O − N` | SECONDARY. Deviation from the person's *own* expected state now: "is this expected for me?" |
| `alignment[e]` | `aligned` if `sign(O) = sign(N)` and `|N| ≥ 0.25`; `opposed` if the signs differ; else `neutral` | Context: aligned → likely constitutional/seasonal, favour gentle long-term regulation (調體); opposed → against the tendency, worth a second look. |

Using `O − N` alone as the headline would let a birth chart that "predicts" weak 木 absorb genuine 肝 symptoms. That would make the prior *hide* evidence, which is as unacceptable as letting it create evidence.
(Test: the population offset equals the observation exactly whatever the reference says.)

### 9.6 Transmission (生克乘侮, 母子)

Where an offset tends to spread — the logic of 「見肝之病，知肝傳脾，當先實脾」 (《金匱要略》; 《難經·七十七難》), 《素問·玉機真藏論》 (五藏受氣於其所生，傳之於其所勝), 《素問·五運行大論》 and the mother–child rule of 《難經·六十九難》 (虛者補其母，實者瀉其子).

For an element with signed offset `w`:

| If | Rule | Effect on pressure | Coefficient |
|---|---|---|---|
| `w > 0` | 制己所勝 | the element it restrains: `−0.30·w` | `excessRestrains` |
| `w > 0` | 侮所不勝 | the element that restrains it: `−0.15·w` | `excessInsults` |
| `w > 0` | 子盜母氣 | its mother: `−0.15·w` | `childDrainsMother` |
| `w < 0` | 乘侮自深 | itself: `−0.20·|w|` | `deficientDeepens` |
| `w < 0` | 母病及子 | its child: `−0.25·|w|` | `motherToChild` |

Output: per-element `pressure` (negative = tends to weaken) and the ranked rule list with citation ids. It is a **tendency list for explanation and for choosing which organ to protect**, never added to the observed panel.
All coefficients are `[calibrate]`.

---

## 10. Parameters

All numbers are in `src/params.ts` (engine) and `DEFAULT_PROFILE_PARAMS` / `DEFAULT_TRANSMISSION_PARAMS` (`src/profile.ts`). `[calibrate]` = a chosen/fitted value awaiting calibration; `[school]` = a school-of-practice
decision that must be reported with every result.

| Group | Parameter | Default | Tag |
|---|---|---|---|
| chart | `ziHourRule` | `lateZiNextDay` | school |
| chart | `trueSolarTime`, `equationOfTime` | true, true | — |
| weights | `pillarBase`, `stemShare`, `branchShare` | 100, 0.40, 0.60 | — |
| weights | `hiddenSplit` | [1] · [0.7, 0.3] · [0.65, 0.25, 0.10] | — |
| weights | `monthCommand.branchMultiplier` / `stemMultiplier` / `silingBoost` | 2.0 / 1.2 / 1.5 | calibrate |
| weights | `luck.total`, stem share start → end | 130, 0.70 → 0.30 | calibrate |
| weights | `annual.total` = stem + branch | 110 = 40 + 70 | calibrate |
| propagation | `damping`, `maxRounds`, `epsilon` | 0.50, 3, 0.002 | calibrate |
| propagation | `outflowCap`, `inflowDamageCap` | 0.35, 0.40 | — |
| propagation | `kernel.sheng/ke`, `shengEfficiency`, `keCost` | 0.30/0.40, 0.85, 0.30 | — |
| propagation | `polarity` 生 cross/same, 克 same/cross | 1.0/0.7, 1.0/0.7 | — |
| propagation | `tongdangBeta` | 0.60 | — |
| propagation | `distance`, `external` | §6.2 | — |
| profile | innate gain/cap · annual gain/cap · yunqi caps · season · `totalCap` | 1.0/1.0 · 1.0/0.75 · see §9.4 · 0.5/−0.125 · 1.5 | calibrate |
| profile | `seasonModel` | `changxia` | school |
| profile | `hemisphere` | absent (= north); `south` shifts the season lookup by 180° (§9.3). `off` is not a parameter: it switches `enable.season` off | school |
| profile | `enable.*` | all true | — |

`validateParams` enforces the structural invariants and reports **all** violations at once: stem + branch shares = 1; each hidden split has the right length, sums to 1 and is non-increasing;
annual stem + branch = annual total; luck shares in [0, 1]; ranges. `paramsFingerprint` (FNV-1a over canonical JSON) lets a stored result say which parameters produced it.

---

## 11. API and integration

```ts
buildChart(input, {params?, luckPillarCount?}) → NatalChart        // pillars, 司令, 大運, corrections, rulesUsed, warnings
buildBase(chart, params?)                      → BaseChart         // L1 + L3, frozen
evaluateAt(base, {luck?, annual?})             → SolvedChart       // instant chart
evaluateYear(base, year)                       → YearEvaluation    // pillar, 大運 step, shares, delta (neutral-year)
innateProfile(base, p?)                        → shares, relative, bands, degrees, evenness, missing
buildReferencePanel(base | null, jdUT, p?)     → components, total, zangfu, climate, trace, notes
forecastReferencePanels(base | null, jdUT, n)  → panel now + start of each of the next n seasons
analyzeOffset(observed, reference)             → offsetPopulation, offsetPersonal, alignment
transmission(deviation, p?)                    → pressure, ranked rules
yunqiOfYear / yunqiAt / seasonAt               → classical tables for a year / instant
```

**App configuration** (see PRD FR-17 and `data/config/scope-profiles.json`): `wuxing.enabled` (module on/off), `wuxing.bazi_innate` and `wuxing.bazi_annual` (need birth data), `wuxing.yunqi`, `wuxing.season`,
`wuxing.season_model` (`changxia` | `tuwang18`). Development profile: all on. Release profile: season and yunqi on; the birth-data (BaZi) blocks are **opt-in** by the user (`"opt_in"`).

**Execution:** everything runs client-side; birth data never leaves the device (§15). Measured on a laptop (Node 25): chart + base ≈ 0.8 ms, a year evaluation ≈ 0.4 ms, a reference panel ≈ 0.5 ms.

---

## 12. Verification

| Check | Result |
|---|---|
| Parity with the source engine | 10 births × (4 pillars, 司令, 大運 direction/start/pillars, base weights, vitality, rounds, 5 annual evaluations incl. deltas) + 168 solar-term instants + equation of time + ΔT. **All pillars identical; element weights differ < 1e-4** (the source's fixture is rounded to 6 decimals; actual max 4e-6); **solar-term instants differ < 0.01 s**. The fixture was produced by running the source engine itself with L2 disabled for instants. |
| External reference | 240 Hong Kong Observatory solar terms 2019–2028 within 60 s (HKO publishes whole minutes). |
| Calendar anchors | 1949-10-01 甲子; 2000-01-01 戊午; the day pillar advances exactly one 60-cycle step per day over 1900–2099 (~73 000 days). |
| Worked example | 1990-05-12 14:30 Shanghai ⇒ 庚午 辛巳 丁丑 丁未; DST removed; true solar 13:39; 立夏 + 6.45 d ⇒ 庚 commands (segment 2, exact); forward 大運, start 8.24, first 壬午. |
| Engine invariants | L1 totals, order independence, non-negativity, mass non-increase, normalisation, vitality range, input immutability. |
| Classical tables | 歲運, 司天/在泉, 客氣 rotation, 大寒 year boundary, season boundaries, transmission directions. |
| Static typing | `tsc --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --erasableSyntaxOnly`: 0 errors. |

### 12.1 Worked example (1990-05-12 14:30 Shanghai, male; reference at 2026-10-03)

| Step | Result |
|---|---|
| L1 element weights (468 total) | 木 6.0 · 火 206.3 · 土 106.7 · 金 134.0 · 水 15.0 |
| After L3 (3 rounds) — shares | 木 1.2 % · 火 35.6 % · 土 32.5 % · 金 25.3 % · 水 5.3 %; vitality 0.905; evenness 0.802; 陽 32.0 % / 陰 68.0 % |
| Innate bands / degrees | 木 缺 −0.94 · 火 過旺 +0.78 · 土 偏旺 +0.63 · 金 平 +0.27 · 水 偏弱 −0.73 |
| 2026 丙午 (大運 甲申, 7.49 years in) — neutral-year delta | 木 −0.030 · 火 +0.083 · 土 +0.014 · 金 −0.034 · 水 −0.032 |
| Annual (BaZi) degrees | 木 −0.15 · 火 +0.41 · 土 +0.07 · 金 −0.17 · 水 −0.16 |
| Yunqi 2026 (水運太過, 司天 少陰君火, 在泉 陽明燥金) degrees | 木 0 · 火 +0.05 · 土 −0.25 · 金 +0.20 · 水 +0.50 |
| Season (秋, λ = 190.3°) degrees | 木 −0.13 · 金 +0.50 |
| **Reference total** (cap ±1.5) | 木 −1.21 · 火 +1.24 · 土 +0.45 · 金 +0.80 · 水 −0.39 |
| Climate tendency | 暑 0.30 · 燥 0.30 · 火 0.40 |
| Forecast (start of next seasons) | 冬 2026, 春 2027, 夏 2027, 長夏 2027 — each a full panel |

Reading it: this person's chart is nearly empty of 木 and rich in 火 and 土; the year 2026 adds fire and water-excess weather; the season (秋) supports 金. A *tendency* to watch 肝 (木) and the 火–土 axis follows — it does
not say anything about disease by itself.

---

## 13. Divergences found in the source documentation (resolved here)

| # | Source documents say | Source code does | This project |
|---|---|---|---|
| 1 | `docs/05` §9 lists `maxRounds: 30`; §5.2 says 3 | `defaults.ts`: 3 | **3** (code is the declared source of truth). |
| 2 | L2 structure is part of the pipeline | Base chart: L2 commented out ("直接五行平衡即可"); instant chart (`evaluateAt`): L2 still applied | **No L2 anywhere**; oracle regenerated accordingly. |
| 3 | 流年 sampling "at 立春" | Samples **4 Feb 00:00** (JD), not the exact 立春 instant | Same convention, documented in §7.2. |
| 4 | `kongwang` parameters and a "KONGWANG" flag | Never applied in L1 | Dropped. |
| 5 | Earlier docs held several contradictory 起運 constants | Single 3 d = 1 y rate | Single rate (§4.5). |

---

## 14. Open items

1. **Regenerate the VSOP87 data** from the official archive with an in-repo script that pins the SHA-256 (currently taken over from the source engine's generated file).
2. **Calibration** of every `[calibrate]` parameter, especially the profile caps, with practitioner input; the diagnostic panel needs real cases to show whether the reference blocks add anything.
3. **Season model** (`changxia` vs `tuwang18`) and the 長夏 extent — school decision pending.
4. ~~**Southern hemisphere.**~~ **Decided (PM-26):** the season is counted on a basis the person chooses — the northern calendar (default), the southern basis (the lookup at longitude + 180°) or none (§9.3). The source's hard "no flip" rule applied to the birth chart and to calendar constructs, which still do not flip. Open: the clinical content owner confirms *what* flips (the experienced season only).
5. **Hour precision:** births within ~15 min of an hour boundary should show both hour pillars as alternatives (the engine already exposes the corrections to do so).
6. **Julian-calendar dates** (before 1582) are rejected, as in the source.
7. Optional later: 客主加臨 as a modifier of the climate vector; BaZi 大運/流年 *interaction* with natal branches (the L2 structure the source retired).

---

## 15. Privacy, wording and product rules

- **Birth data is sensitive and optional.** It is entered voluntarily, processed **only on the device**, stored (if at all) locally and erased with "delete all data". It is never sent to a server and never placed in URLs or logs.
- The BaZi blocks are presented as **"a traditional-culture reference for tendencies"**, never as a prediction, never as a diagnosis, and never as a reason to withhold medical care. They are **off by default in the release profile** and need an explicit opt-in.
- Wording stays at the level of *tendency / traditionally associated with*. The app must not state or imply a disease, a prognosis, a time window or a fate from these numbers (the source engine enforces the same with a phrasing guard; the app needs an equivalent rule set in the UI copy review).
- Charts must not use red/green "good/bad" colouring for the reference values: they measure fit to a model, not quality of life.
- Every result records `paramsFingerprint`, `rulesUsed` and the knowledge-base version, so it can be explained later.
