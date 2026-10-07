# Design: Herb, Formula and Personalised Prescription Model

| | |
|---|---|
| **Version** | 0.3 (draft) |
| **Status** | Design for Release E (FR-36 … FR-38; tasks PM-36 … PM-41). **Built: the herb property model (PM-36, §3.6); dose–response, pairings and processing (PM-37, §3.7)** |
| **Last updated** | 2026-10-07 |
| **Audience** | Engineers, the clinical content owner, the pharmacy reviewer, a legal adviser (for §7) |
| **Related** | [Knowledge base v2](knowledge-base-v2.md) · [AI-assisted intake](ai-assisted-intake.md) · [Requirements FR-36 … FR-38](../requirements.md) · [Decisions PD-13 … PD-18](../decisions.md) · [Diagnosis SOP §12](../../diagnosis-sop.zh-TW.md) · [Safety policy §2](../../safety-policy.md) · [PRD G10](../../PRD.md) |

> **Summary.** The owner's direction (2026-10-07): *the app diagnoses first, then makes the medicament for each person.* The engine already ranks the 33 formulas against the diagnosis and proposes 加減, but its herbs are coarse — every herb is a fixed vector derived from keywords of its functions, a formula's effect is a precomputed sum, roles carry fixed weights, and nothing depends on the dose. This design gives the herb a **property model** in the tradition's own terms (四氣、五味、升降浮沉、歸經、毒性、補瀉、潤燥、量效、炮製、七情配伍), computes a formula's effect **from its herbs at their doses**, explains **why** a formula corrects a diagnosis (病機 → 治法 → 方 → 藥, the 方解 as numbers), **verifies** the existing formulas against their own indications, and **personalises** the formula for a person by the classical rule of 三因制宜 (因人、因時、因地) — herbs added and removed, and amounts. Everything is deterministic, traceable to a rule and a source, and computed on the device. **What a person sees stays gated by the existing output levels**: amounts are computed for everyone but shown only where a profile allows it (§7) — that choice is the owner's, after a legal view.

---

## 1. Goal and non-goals

**Goal.** For any diagnosis the engine reaches, produce a **personalised prescription**: the best-fitting classical formula, its 加減 for this person, the role of every herb, the reason for every change, and reference amounts — with an explanation a reader can follow from the diagnosis to each herb.

**Non-goals.** Inventing formulas from nothing (the base is always a classical formula of the library; 加減 changes at most a few herbs); doses outside the Pharmacopoeia's ranges; any herb a safety rule excludes; any change to how the diagnosis is scored (a prescription never feeds back into the diagnosis); claims of efficacy.

## 2. What exists today

| Piece | Today | Limit |
|---|---|---|
| Herb record | 703 herbs: 四氣 (→ a signed `temperature`), 五味 with an element, 歸經, functions, category, `effects` and `harms` derived by keyword rules ([`scripts/kb/herb_model.py`](../../../scripts/kb/herb_model.py)), `dose_g_reference` from the Pharmacopoeia, `toxic`, `pregnancy`, interaction flags | No 升降浮沉, no 毒性 grade, no 補瀉/潤燥/氣血分, no dose dependence, no processing, no pairings; effects are fixed numbers whatever the dose |
| Formula record | 33 formulas: composition with roles, classical amounts, proportions, `effective_weight` = role weight × proportion, a precomputed `panel_effect`/`panel_burden`, principle, 方解 text (`rationale_zh`), cautions, tier | Role weights are fixed (君 1.0, 臣 0.6, 佐 0.35, 使 0.15); the effect is not recomputed from the herbs; the 方解 is prose with no link to numbers |
| Fit | cost ‖D + k·T‖²_w over the panel, the best scale k*, strength bands ([`formulas.ts`](../../../packages/engine/src/formulas.ts)) | One linear map; no direction of qi (升降), no notion of what the formula leaves untreated beyond the residual |
| 加減 | classical modifications by trigger symptoms; a greedy add/remove from a pool, on relative weights ([`modify.ts`](../../../packages/engine/src/modify.ts)) | Never produces amounts; the pool is not narrowed by constitution, season or age |
| Safety | hard and soft rules on herbs and populations, 十八反 and 十九畏, pregnancy, drug interactions, allergy match, dose references for minors and the elderly ([`data/safety/rules.json`](../../../data/safety/rules.json)) | Applied to formulas as listed, not to a modified composition with amounts |
| Output | Levels L0–L3; release: tier A without dose (L1), tier B and modification suggestions (L2); proportions and reference amounts only at L3 (the development profile) | — this stays the gate (§7) |

## 3. The herb: a property model

### 3.1 Properties, and where each comes from

Every property is either **read** from a source field or **derived** by a stated rule; every derived value keeps the rule's id, so a reviewer can correct the rule rather than the number.

| Property | Values | Source or rule |
|---|---|---|
| **四氣** | signed warmth −3 … +3 (大寒 −3, 寒 −2, 微寒/涼 −1, 平 0, 微溫 +0.5, 溫 +1, 熱 +2, 大熱 +3) | Pharmacopoeia 性味 (as today) |
| **五味** | 酸 苦 甘 辛 鹹 淡 澀, each 0.5 (微) or 1 | Pharmacopoeia (as today) |
| **陰陽** | −1 … +1 | Derived (§3.2): 氣 (溫熱為陽，寒涼為陰), 味 (辛甘淡為陽，酸苦鹹為陰 — 《素問·陰陽應象大論》、《至真要大論》), 升浮為陽、沉降為陰 |
| **五行** | a five-component vector summing to 1 | Derived: 五味所入 (酸肝木、苦心火、甘脾土、辛肺金、鹹腎水 — 《素問·宣明五氣》) blended with 歸經 (zang only); a source-stated 色 may be added later |
| **升降浮沉** | direction −1 (沉降) … +1 (升浮) | Derived by rules from category (解表 升浮; 瀉下、重鎮安神、平肝潛陽、收澀 沉降), 氣味厚薄 (《醫學啟源》《湯液本草》: 氣厚者浮、味厚者沉), part used and texture (花葉輕清多升浮，子實金石多沉降), and processing (§3.5); a curated overlay for the herbs of the library |
| **歸經** | organs, with weights | Pharmacopoeia (as today), first-listed weighted higher; 引經藥 flagged from a curated table |
| **毒性** | 無毒 · 小毒 · 有毒 · 大毒 | Pharmacopoeia text (「有小毒」「有毒」「有大毒」), replacing the boolean |
| **補瀉** | 補 · 瀉 · 平 | Derived from category (補虛藥 補; 瀉下、清熱、活血、理氣、祛濕 瀉) and functions |
| **潤燥** | 潤 · 燥 · 平 | Derived: 滋陰、養血、潤腸、甘寒 → 潤; 燥濕、溫燥、辛苦溫 → 燥 |
| **氣血分** | 氣 · 血 · 兼 | Derived: 理氣、補氣 → 氣; 活血、補血、止血、涼血 → 血 |
| **用量** | reference range in grams | Pharmacopoeia 用法用量 (`dose_g_reference`, as today) |
| **量效** | dose bands with different actions | Curated, few herbs, each with its source (e.g. 柴胡、黃耆、大黃、甘草, textbook statements to be verified) |
| **炮製** | processing variants and their modifiers | Curated table (§3.5) |
| **七情配伍** | pairs: 相須 · 相使 · 相畏 · 相殺 · 相惡 · 相反 | Curated table with sources (《神農本草經》序例; 《得配本草》; 十八反、十九畏 as today) |

"Any more?" — three further properties are named by the classics and are worth recording but not computing yet: **走守** (附子走而不守、乾薑守而不走), **剛柔**, and the eight-aspect analysis of 《藥品化義》 (體、色、氣、味、形、性、能、力). They enter as notes on herb pages, not as numbers, until a reviewer sees a use for them.

### 3.2 From properties to numbers (derivations)

```
yinyang(h)    = clamp( 0.5·sign-scaled(warmth/3) + 0.3·(yang flavours − yin flavours)/Σ flavours + 0.2·direction , −1, 1 )
fivephase(h)  = normalise( 0.6·Σ_f weight_f · onehot(element_of(f))  +  0.4·Σ_zang tropism weight · onehot(element_of(zang)) )
direction(h)  = clamp( category prior + flavour/qi thickness term + part-used term + processing shift , −1, 1 )       (overlay wins)
```

Weights are parameters (`kb.params.herb_model`, `[calibrate]`), stored with the data, so a change is a knowledge-base version change.

### 3.3 The effect of an herb at a dose

The effect of herb *h* at dose *d* on panel dimension *j*:

```
x        = d / d_ref(h)                          # how many "typical doses" (d_ref = the middle of the Pharmacopoeia range)
benefit  = E_j(h) · s(x),     s(x) = (1 + κ)·x / (κ + x)          # saturating: s(1) = 1, s(0) = 0, s(∞) = 1 + κ
burden   = H_j(h) · x^γ,      γ ≥ 1                               # harms grow at least linearly, faster above the range
```

`E` and `H` are today's `effects` and `harms`, re-derived with the properties above (the rules gain terms for 升降, 潤燥, 補瀉). Defaults: κ = 1 (twice the typical dose gives a third more effect, not double), γ = 1.5. A dose above the Pharmacopoeia's upper bound is never produced (§6.4); a dose band with a different action (量效) switches the herb's `E` to the band's.

### 3.4 Direction of qi (升降出入)

Some diagnoses are about **where qi goes**, which the panel's quantities cannot say: 中氣下陷 needs 升, 肝陽上亢 and 胃氣上逆 need 降, 肺氣不宣 needs 宣. A pattern may carry a **mechanism direction** (`mechanism.direction`: 升 · 降 · 宣 · 收, curated for the patterns where the classics state it — e.g. SP3 補中益氣 升陽舉陷), and the fit gains a term:

```
cost_v2 = ‖D + k·T‖²_w  +  λ_dir · (need_dir − formula_dir)²         (only when the pattern states a direction)
formula_dir = Σ_i weight_i · direction(h_i)                             (weights as in §4.1)
```

The panel is not changed: nothing about how the diagnosis is scored moves.

### 3.5 Processing (炮製)

When a formula names a processing (the classical amounts carry it: 炙、去節、湯去皮尖、酒洗、炒…), the herb's record is the processed variant where the library has one (炙甘草), otherwise a modifier is applied: 酒製 (升、行血 ↑), 醋製 (入肝 ↑、止痛), 鹽製 (入腎、下行), 蜜炙 (潤肺、緩和、燥性 ↓), 薑製 (溫中止嘔 ↑), 炒炭 (止血 ↑、活血 ↓), 炒 (寒性 ↓). The table is curated from 《雷公炮炙論》《炮炙大法》 and the Pharmacopoeia's 炮製 notes, with sources, and is small.

### 3.6 As built: the property model (PM-36)

Every herb of the knowledge base now carries `props` — 陰陽, 五行 shares, 升降浮沉, 毒性 grade, 補瀉, 潤燥, 氣血分, weighted 歸經 and the part used — and `props_rules`, the ids of the rules that made each value ([`scripts/kb/herb_props.py`](../../../scripts/kb/herb_props.py); the rules, their quotations and the weights are written into `herbs.json` `_meta.conventions.props`). What differs from the sketch above, and why:

- **`effects` and `harms` are not re-derived.** They stay what the diagnosis's formula ranking reads, so the ranking, the result-stability pins and the parity cases are unchanged; the properties are new fields that the prescription model reads (direction, the constitution rule, the explanation) beside them.
- **五行 counts every channel, not only the zang:** a fu belongs to its phase (膽 木, 胃 土, 大腸 金, 膀胱 水; 心包 and 三焦 火), weighted by its place in the list; 0.6 flavours + 0.4 channels.
- **升降浮沉** = 0.5 × (category prior + direction words of the functions, capped at ±0.6) + 0.3 × 氣味 (李時珍: 酸鹹無升，甘辛無降，寒無浮，熱無沉) + 0.2 × the part used (本草備要: 輕虛者浮而升，重實者沉而降 — the head of the 藥用部位 text decides: 花葉 +0.3, 子實 −0.2, minerals and shells −0.5); a **curated overlay of 24 herbs** the tradition singles out (旋覆花 the falling flower, 蔓荊子 the rising seed, 桔梗 載藥上行, 牛膝 引血下行, the settling minerals, the qi-lowering and the yang-raising herbs) — textbook statements, unverified like every curated draft.
- **補瀉**: the category decides where it is clear (補虛 補; the categories that remove a pathogen or a product 瀉); 溫裡 herbs are 補 only when they tonify the fire (附子, 肉桂), otherwise 平 (warming is a method of its own); the other categories by the words of their functions.
- **氣血分**: with both, the first-listed function decides, and 兼 when it names both — so 川芎 (活血行氣) comes out 兼, the 「血中氣藥」 of the textbooks; 瀉火 counts as 氣分 (石膏、知母 清氣分熱); only when nothing else decides, 本草備要's 枯燥者入氣分，潤澤者入血分.
- **毒性** follows the Pharmacopoeia's sentence (有大毒 17, 有毒 44, 有小毒 34 herbs) — the classical four grades of 《五常政大論》 — and agrees with the old `toxic` flag by construction.
- **Twelve new verified quotations** ground the rules: 《素問》 on 氣味厚薄, on 陰陽 and 寒熱, on the flavours' yin and yang, on 燥潤, on 高者抑之，下者舉之, on 燥者濡之, on 實則瀉之，虛則補之 and on the four grades of 毒; 《神農本草經·序錄》 (四氣五味 and 有毒無毒); 《本草綱目》 (升降浮沉); 《本草備要》 (輕重, 燥潤 and 氣血分). The knowledge base now quotes 139 passages from 14 works.

First reading over the 703 herbs: 80 rise (> 0.2), 373 are even, 250 descend (< −0.2); 106 are 補, 555 瀉, 42 平; 156 dry, 104 moisten. Each is a derived draft until the pharmacy review (class C).

### 3.7 As built: dose–response, 量效, 炮製 and 七情 (PM-37)

The engine's [`prescription/herbs.ts`](../../../packages/engine/src/prescription/herbs.ts) computes what a herb does at an amount (`herbAtDose`), after its dose band and its processing, and what a composition does with its pairings (`applyPairings`, `compositionAction`); the tables are in `data/herbs/{pairings,processing,dose-bands}.json` and the parameters in `data/treatment/prescription.json` ([KB schema §4.3](../../kb-schema.md)).

- **Dose–response as designed** (κ = 1, γ = 1.5; x = amount ÷ the middle of the Pharmacopoeia range). At the typical dose a herb does exactly what its record says — a test over all 703.
- **量效 from the classics, not from guesses:** five herbs whose action the books say changes with the amount — 葛根 「少用則浮而外散，多用則沉而內降」 and 人參 「少用則泛上，多用則沉下」 (《本草新編》), 升麻 「多用則散，少用則升」 (《得配本草》), 蘇木 「少用則和血，多用則破血」 (《本經逢原》), 紅花 「少用通經活血，多用破血」 (《外科全生集》). 少用 is below 0.75 of the typical dose, 多用 above 1.25 (`[calibrate]`).
- **炮製** follows 《本草蒙筌》's rhyme (酒製升提，薑製發散，入鹽走腎…蜜製甘緩…去瓤免脹，去心除煩): 13 methods quoted, 煨 marked unverified. The library's own formulas mostly carry cleaning words (去皮, 去節, 湯去皮尖), which change nothing; 炙甘草 is its own herb record.
- **七情 read from the classical table:** 238 relations parsed from 《本草綱目·序例下》「相須相使相畏相惡諸藥」 (after 徐之才《藥對》), every one keeping the entry it came from; names the knowledge base lacks or that are ambiguous are skipped, never guessed; and the 11 textbook 相須 pairs, unverified. **23 relations fall inside the library's own formulas**, among them 半夏畏生薑 (小柴胡湯, 溫膽湯 — the classical reason for the ginger), 茯苓為人參之使 (四君子湯, 八珍湯, 天王補心丹) — and a classical 相惡 inside a classic: 生薑惡黃芩 in 小柴胡湯, which the verification (PM-39) will list for a reviewer rather than silently weaken the formula.
- **The pairings never compound and their order never matters:** each is applied to the actions as they were before any pairing; a herb's benefit on a shared dimension grows by (1 + σ) at most once, its burden or benefit falls by (1 − τ) at most once. 相反 is listed as a conflict and never computed.

## 4. The formula: effect, structure and the 方解 in numbers

### 4.1 The effect of a formula

```
T(formula, doses) = Σ_i e(h_i, d_i)  +  Σ_(i,j) pair(h_i, h_j)
```

| Pairing | Effect on T |
|---|---|
| 相須、相使 | the shared target dimensions of the pair × (1 + σ), σ = 0.2 (`[calibrate]`) |
| 相畏、相殺 | the burden of the herb that is "feared" or "killed" × (1 − τ), τ = 0.5 |
| 相惡 | the benefit of the herb whose action is reduced × (1 − τ) |
| 相反 (十八反)、十九畏 | **never computed**: a hard safety rule excludes the pair (as today) |

The precomputed `panel_effect` of a formula becomes a **check** (the recomputed T at the classical proportions must agree with it within a tolerance), not an input.

### 4.2 Roles (君臣佐使), measured

For the formula's principal target — the deviation its 治法 addresses — each herb's **contribution** is its share of the reduction of that deviation. The labelled roles are then checked:

- **君**: the largest contributor to the principal target;
- **臣**: a contributor to the principal target, or the main contributor to the second;
- **佐**: 佐助 (helps a secondary target), **佐制** (its main contribution is cancelling another herb's burden — measurable: it reduces Σ burden more than it adds benefit), 反佐 (opposite 氣 to the 君, small dose);
- **使**: 引經 (raises the tropism of the formula toward the target organ) or 調和 (甘草: lowers the formula's total burden).

A disagreement is a **finding for review** (§5), never a silent re-labelling.

### 4.3 Why this formula corrects this diagnosis (病機 → 治法 → 方 → 藥)

For a diagnosis with deviation D and a formula at scale k:

1. **病機**: the deviation's components, largest first (e.g. 脾.qi −1.4, liuxie.濕 +0.8, product.痰 +0.5) and, where stated, the direction.
2. **治法**: the formula's principle, and the components it addresses (those it reduces by at least a share θ).
3. **方**: the reduction it achieves overall (cost before / after, as today) and per component.
4. **藥**: for every herb, the components it reduces and its share of each (the attribution sums to the formula's reduction of that component); the burdens it adds; which herb cancels them.
5. **未盡**: what the formula leaves (the residual) — the reason for 加減.

The attribution is exact for the additive part (linear contributions at the chosen doses) and assigns the pair terms in equal halves to the two herbs. The output is **structured data** (ids, numbers, rule ids); the sentences are written from message keys, in all three languages, and pass the wording lint — no efficacy claim, no "cures".

## 5. Verifying the existing formulas

A **self-test over the library** (like the pattern self-test), run in the build and reported:

| Check | Pass |
|---|---|
| Recomputed effect | T at the classical proportions agrees with the stored `panel_effect` (cosine ≥ 0.9) |
| Own indication | For each pattern the formula is listed under, the formula's cost reduction on that pattern's typical deviation is positive, and the formula ranks in the top 3 of the library for it |
| Direction | Where the pattern states a direction, the formula's direction agrees in sign |
| Roles | The labelled 君 is the largest contributor to the principal target (§4.2); 佐制 herbs reduce burden |
| Balance | No formula's total burden exceeds a share of its benefit on its own pattern (`[calibrate]`) |
| Safety | No pair of the formula is 十八反/十九畏 unless a classical source states the pairing and a reviewer recorded it |

A failure is **listed, never auto-fixed**: it means a herb's property, a role, a proportion or a pattern's deviation is wrong, and a reviewer decides which. The first run's report goes into the knowledge-base v2 design as a finding.

## 6. Personalisation: 三因制宜

The classics' own rule for "different medicine for different people": **因人、因時、因地制宜**. The engine applies it in four steps to the base formula the existing ranking chooses.

### 6.1 Inputs

The diagnosis (patterns, the panel deviation D, the strength k*), the person's profile (age band, sex, pregnancy, lactation, the listed long-term conditions, medicine classes, allergies), the constitution result (九種體質), the season (the basis and model of PM-26 and PM-29), and the region (FR-29). Nothing new is asked of the person.

### 6.2 Herbs: 加減

1. **Classical 加減** of the formula whose trigger symptoms the person has (as today).
2. **Residual 加減**: the greedy step (as today) on the v2 vectors, with a pool narrowed **by the person**: nothing pregnancy-flagged for a pregnancy, nothing an allergy matches, nothing a listed medicine interacts with, nothing toxic unless the level allows it, and — **因人** — no herb whose 氣 deepens the constitution's imbalance (no 寒涼 additions for 陽虛質/氣虛質 unless the residual demands heat-clearing and it is said; no 溫燥 for 陰虛質/濕熱質; no 滋膩 for 痰濕質).
3. **Removal** of a listed herb only when it is excluded by safety or the constitution rule, never the 君.

### 6.3 Amounts

```
d_i = clamp( d_base,i · f_severity · f_person,i · f_season,i · f_region,i ,  range_i )
d_base,i   = the classical proportion of herb i, scaled so that the 君 sits at the middle of its Pharmacopoeia range
f_severity = 0.8 … 1.2 from k* (a mild deviation, a lighter prescription)
f_person,i = age (the minors' fractions and the elderly's reduction of the dose references, as today) × constitution (e.g. 寒涼 herbs × 0.8 for 陽虛質)
f_season,i = 因時: 夏 (and 長夏 for 化濕-opposing herbs) 辛溫發散 × 0.85; 冬 寒涼 × 0.85 (from the season of PM-26 on its basis)
f_region,i = 因地: off unless a region pack states a rule
```

Every factor is a named rule with its source (《素問·五常政大論》、《醫學源流論·五方異治論》 and the textbook statement of 三因制宜, to be verified) and a `[calibrate]` value; every factor that changed an amount is listed in the output. **Toxic herbs** (有毒、大毒) are never raised by any factor, and at levels below the development profile they are not in the pool at all. Amounts are rounded to 0.5 g and never leave the Pharmacopoeia range.

### 6.4 Safety, again

The personalised composition goes through the same safety layer as a listed formula — hard rules exclude, soft rules annotate — and a composition that a hard rule touches is not shown (the reason is, as today). The interaction flags of every added herb are checked against the person's medicines. A prescription for a pregnancy, a minor under the threshold, or a serious condition is reduced by the existing levels (L0 shows none).

### 6.5 The output

```
Prescription = {
  base: formula id, fit, strength;
  changes: [ { op: add | remove | amount, herb, role, reason: rule id + data, citation? } ];
  composition: [ { herb, role, proportion, amount_g?, range_g, factors: [rule ids] } ];   // amount_g only where §7 allows
  mechanism: the §4.3 structure for the personalised composition;
  safety: what was excluded or annotated, and why;
  version: { engine, kb, model params fingerprint }
}
```

It is computed by a pure function from the stored result, the person's profile and the knowledge base, and **stored with the saved result** (a record-level field, like `hour`), so it is explained as it was made and the engine's own result — and its replay — is unchanged.

## 7. What a person sees: the gate

The output levels of the safety policy decide, as today:

| Level | Base formula | 加減 (herbs, reasons) | Roles, proportions | Reference amounts |
|---|---|---|---|---|
| L0 | — | — | — | — |
| L1 | tier A, by name | — | — | — |
| L2 | tier A and B | ✓ | roles ✓ | — |
| L3 (development) | all, tier C as study | ✓ | ✓ | ✓ |
| **Practitioner** (proposed profile, §7.1) | all | ✓ | ✓ | ✓, as "for the practitioner's judgement" |

**Recommended default (PD-13): amounts are computed for everyone and shown only at L3 and in a practitioner profile.** The public release shows the personalised formula — which herbs, which changed and why — but no grams, and every prescription says that a licensed practitioner decides after seeing the person. The owner asked for "medicament for different users"; this gives every user their own composition and reasons, and keeps the grams with a professional, which is the line most jurisdictions draw (prescribing herbal medicine is a regulated act in Taiwan, Hong Kong and the Mainland). **A legal view decides whether amounts may ever reach a layperson**; until then the switch exists only in the profile configuration.

### 7.1 A practitioner profile (proposed)

A third profile beside `dev` and `release`: everything of L3 except the developer tools, for licensed practitioners using the app with their patients. Whether and how a practitioner is recognised (an attestation, a separate build, an institution's deployment) is a decision for the owner (PD-14).

### 7.2 The practitioner summary and its file

The personalised prescription goes into the practitioner summary (a new section) at the level the profile allows; the summary file gains an optional `prescription` section in a new schema version (2) — version 1 readers are unaffected.

## 8. Tests

| Layer | Tests |
|---|---|
| Derivations | Every property rule on hand-picked herbs with known textbook values (人參 甘微苦微溫 歸脾肺心 補氣 → 陽, 土/金, 升浮 slight; 大黃 苦寒 沉降 瀉; 麻黃 辛微苦溫 升浮 …); the five-phase vector sums to 1; yin-yang within bounds |
| Dose–response | s(1) = 1, monotone, saturating; burden ≥ linear; amounts never leave the range (property over all herbs × random factors) |
| Pairings | Each pairing type changes only what it should; 十八反/十九畏 never computed |
| Attribution | Herb shares sum to the formula's reduction per component (exactness test); a 佐制 herb is identified in formulas where the classics name one (e.g. 甘草 in 調和 role) |
| Verification | The self-test's report is stable (snapshot) and its failures are listed in the review records |
| Personalisation | Each factor alone and in combination; toxic herbs never raised; the pool excludes what the person's profile excludes (property: over generated profiles, no hard-rule herb ever appears); determinism |
| Gate | No amount in any release build (the release check's rule 3 extended to the new output); the practitioner profile shows amounts |
| Stability | The existing diagnosis (patterns, panel, verdict) is byte-identical (the result-stability pins); the golden cases are not touched |

## 9. Review class and rollout

Class **C** for the property tables, the pairings, the dose bands and the 三因 factors (content), class **R** for showing amounts beyond L3 (legal). All new data is `derived` or `curated-draft` until reviewed; the verification report is input for the reviewers. The algorithms and their display at L3 can ship behind the draft label like the rest.

## 10. Decided defaults

**Decided 2026-10-07 — default of this design, revisit with the owner (decision register PD-13 … PD-18).**

| Question | Default |
|---|---|
| ⚑ Amounts for laypeople | Computed for all; shown only at L3 and in a practitioner profile; legal view first (PD-13) |
| Base of a prescription | Always a classical formula of the library; at most 3 herbs added and 2 removed (today's limits) (PD-16) |
| Dose model | Saturating benefit (κ = 1), super-linear burden (γ = 1.5), Pharmacopoeia range as a hard clamp (PD-17) |
| Pairings | 相須/相使 × 1.2 on shared targets; 相畏/相殺/相惡 × 0.5; 相反 never |
| Direction of qi | A pattern-level mechanism tag and a fit term, not a new panel dimension |
| Where the prescription lives | A pure function after `assess`, stored with the saved result; the diagnosis and its replay are unchanged (PD-15) |
| Verification failures | Listed for review, never auto-fixed (PD-18) |

## 11. Tasks

PM-36 (herb property model v2), PM-37 (dose–response, pairings, processing in the engine), PM-38 (formula effect, roles and the 方解 in numbers), PM-39 (verification of the library), PM-40 (personalisation by 三因制宜), PM-41 (the prescription on the result page, the practitioner summary and the gate) — [`TASKS.md`](../../../TASKS.md).

## 12. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-07 | Initial design, from the owner's direction of 2026-10-07 |
| 0.2 | 2026-10-07 | §3.6: the property model as built (PM-36) |
| 0.3 | 2026-10-07 | §3.7: dose–response, dose bands, processing and pairings as built (PM-37) |
