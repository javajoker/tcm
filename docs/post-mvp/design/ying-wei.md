# Design: 營衛 in the Model

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design for task PM-52 (requirement FR-43, decision PD-28), from the owner's direction of 2026-10-07: *supplement what concerns 營衛 from the classics into the model, keep the model self-consistent and complete; where the classics contradict each other, weight them by applicability.* |
| **Last updated** | 2026-10-07 |
| **Audience** | The clinical content owner, a TCM clinical reviewer, engineers |
| **Related** | [Prescription model §5 (the verification that found the gap)](prescription-model.md) · [Formula verification report](../../formula-verification.md) · [Knowledge base v2](knowledge-base-v2.md) · [SOP §10 (the panel)](../../diagnosis-sop.zh-TW.md) · [Decision PD-28](../decisions.md) |

> **Summary.** The panel had no 營衛, so the model could not see what 桂枝湯 is for: the verification of the formula library found that 桂枝湯 corrected nothing of the typical 太陽中風 and 營衛不和 patients. This design adds **three dimensions** — 衛氣 (`yingwei.衛`), 營氣 (`yingwei.營`) and the opening and closing of the pores that 衛 governs (`yingwei.開闔`) — **four natures** that the 營衛 patterns of the library are made of, the **sources** from which 營 and 衛 are made (so that a weak 肺 or 脾 also weakens them, a little), and the **營衛 actions of the herbs** as the classical commentaries state them. Every value is a verified quotation or a weighted set of them: where the classics disagree, each reading carries an **applicability weight** — how well it applies to what the panel measures — the value is their weighted mean, and a **confidence** says how far they agree. The diagnosis (pattern scores) does not change; the panel, the 八綱 deficiency–excess axis and the formula fit do.

---

## 1. What the classics say

Verified in the corpus (quotations to be added to `data/citations.json` with PM-52):

| Topic | Statement | Source |
|---|---|---|
| Origin | 「人受氣於穀，穀入於胃，以傳與肺，五臟六腑，皆以受氣，其清者為營，濁者為衛，營在脈中，衛在脈外」 | 《靈樞·營衛生會》 |
| Origin | 「營出於中焦，衛出於下焦」 | 《靈樞·營衛生會》 |
| Origin | 「榮者，水穀之精氣也，和調於五臟，灑陳於六腑，乃能入於脈也」 · 「衛者，水穀之悍氣也，其氣慓疾滑利，不能入於脈也」 | 《素問·痺論》 |
| Origin | 「上焦開發，宣五穀味，熏膚、充身、澤毛，若霧露之溉，是謂氣」 | 《靈樞·決氣》 |
| Organs | 「肺主氣屬衛；心主血屬營」 | 《溫熱論·溫病大綱》 |
| Function | 「衛氣者，所以溫分肉，充皮膚，肥腠理，司開闔者也」 | 《靈樞·本藏》 |
| Function | 「陽者，衛外而為固也」 | 《素問·生氣通天論》 |
| Function | 「營氣者，泌其津液，注之於脈，化以為血」 | 《靈樞·邪客》 |
| Course | 「衛氣行於陰二十五度，行於陽二十五度，分為晝夜」 · 「衛氣不得入於陰，常留於陽…故目不瞑矣」 | 《靈樞·營衛生會》《靈樞·大惑論》 |
| Disorder | 「太陽中風，陽浮而陰弱。陽浮者，熱自發；陰弱者，汗自出」 | 《傷寒論》12 |
| Disorder | 「病常自汗出者，此為營氣和。營氣和者，外不諧，以衛氣不共營氣和諧故爾。以營行脈中，衛行脈外，復發其汗，營衛和則愈，宜桂枝湯」 · 「此衛氣不和也」 | 《傷寒論》53、54 |
| Disorder | 「太陽病，發熱汗出者，此為榮弱衛強，故使汗出」 | 《傷寒論》95 |
| Commentary | 「陰脈弱者，荣氣弱也。風并於衛，則衛實而荣虛」 · 「以自汗出，則皮膚緩，腠理疏」 · 「寒并於荣者，為荣強衛弱」 · 「衛既客邪，則不能與荣氣和諧，亦不能衛護皮腠，是以常自汗出」 | 成無己《註解傷寒論》 |
| Commentary | 「衛陽為風邪所干，不能敷布」 · 「桂枝辛溫，辛能發散，溫通衛陽。芍藥酸寒，酸能收斂，寒走荣陰。桂枝君芍藥，是於發汗中寓斂汗之旨；芍藥臣桂枝，是於和荣中有調衛之功。生薑之辛，佐桂枝以解表；大棗之甘，佐芍藥以和中」 | 《醫宗金鑑·訂正仲景全書傷寒論註》 |
| Stages | 「衛之後方言氣，營之後方言血。在衛汗之可也」 | 《溫熱論》 |
| Stages | 「太陰之為病…頭痛，微惡風寒，身熱自汗，口渴…名曰溫病」 | 《溫病條辨·上焦篇》 |

## 2. The model

### 2.1 Three dimensions

| Dimension | Meaning | Scale (deviation from the average healthy person) | Basis |
|---|---|---|---|
| `yingwei.衛` 衛氣 | The defensive qi outside the vessels: warms, fills the skin, guards | −3 衛弱 (衛外不固) … +3 衛實 | 生氣通天論, 本藏 |
| `yingwei.營` 營氣 | The nourishing qi inside the vessels, from which blood is made | −3 營弱 (不能內守) … +3 營強 (營鬱) | 營衛生會, 痺論, 邪客 |
| `yingwei.開闔` 腠理開闔 | The opening and closing of the pores that 衛 governs | −3 開 (腠理疏，汗出) … +3 闔 (腠理閉，無汗) | 本藏 「司開闔」 |

They form a block of their own in the panel (`yingwei`, dimension weight 0.7 like the six evils and the products `[calibrate]`), shown on the result page beside the six evils. An evil that has entered the 衛 stays where the panel already holds it (`liuxie.風`, `liuxie.寒`); the 營衛 dimensions hold the state of the person's own 營 and 衛.

### 2.2 Applicability and confidence

Where readings of the classics disagree about a value, each reading *i* gives a value *vᵢ* and an **applicability** *wᵢ* (the weights of one question sum to 1): how well the reading applies to what the panel measures — the person's state, observable through symptoms and acted on by the treatment. Then

```
value       v = Σ wᵢ·vᵢ
confidence  c = 1 − Σ wᵢ·|vᵢ − v| / 2        (1 when every reading agrees; 0.5 when two equal readings cancel)
```

Each question, its readings, weights, reasons and result are data (`data/diagnosis/yingwei.json`), recomputed and checked by the build; the weights are judgements marked `[calibrate]` for the clinical reviewer.

### 2.3 Four natures

The 營衛 patterns of the library are made of these 證素 natures (per unit degree, like every nature of the panel):

| Nature | Pattern | 衛 | 營 | 開闔 | How the values are reached |
|---|---|---|---|---|---|
| **營弱衛強** | EX2 太陽中風 | **−0.3** (c 0.65) | −1.0 | −1.0 | 營 and 開闔: 傷寒論 12 「陰弱者，汗自出」, 成無己 「陰脈弱者，荣氣弱也」「腠理疏」 — all agree. 衛: question Q3 below |
| **衛閉** | EX1 太陽傷寒 | **−0.4** (c 0.76) | **+0.4** (c 0.76) | +1.0 | 開闔: 傷寒論 35 「惡風無汗而喘者」, 成無己 「當與麻黃湯發汗」. 營 and 衛: question Q4 |
| **衛氣不和** | EX4 營衛不和 | −1.0 | 0 | −1.0 | 傷寒論 53 「營氣和…以衛氣不共營氣和諧」、54 「此衛氣不和也」, 成無己 「不能衛護皮腠，是以常自汗出」 |
| **衛弱** (肺衛不固) | LG1 肺氣虛（衛表不固） | −1.0 | 0 | −1.0 | 生氣通天論 「陽者，衛外而為固也」, 本藏 「司開闔」 |

### 2.4 The questions on which the classics disagree

| | Question | Readings (applicability) | Result |
|---|---|---|---|
| **Q1** | From which 焦 does 衛 come? | 上焦 — 決氣 「上焦開發…是謂氣」 and 溫熱論 「肺主氣屬衛」 (**0.5**: the source the library can observe; 肺 signs go with a weak 衛) · 中焦 — 營衛生會 「濁者為衛」, 痺論 「水穀之悍氣」 (**0.3**: what 衛 is made of) · 下焦 — 營衛生會 「衛出於下焦」 (**0.2**: the received text of the chapter itself, which sits uneasily with 決氣's 上焦; kept as the root, 腎陽, at a low weight) | The coupling of §2.5: 衛 ← 肺 0.5, 脾 0.3, 腎 0.2 |
| **Q2** | From what does 營 come? | 中焦 — 營衛生會 「營出於中焦」, 痺論 「水穀之精氣」 (**0.6**) · 心 and blood — 溫熱論 「心主血屬營」, 邪客 「化以為血」 (**0.4**) | 營 ← 脾 0.6, 心 blood 0.4 |
| **Q3** | In 太陽中風, what is 「衛強」? | Literally 衛 strong — 傷寒論 95 (**0.2**: it describes 陽浮 and the fever, the fight at the surface) → +1 · The evil is strong in the 衛 — 成無己 「風并於衛，則衛實」 (**0.3**: the panel already holds that evil as 風) → 0 · The 衛陽 is hindered by the wind — 醫宗金鑑 「衛陽為風邪所干，不能敷布」 (**0.5**: what the treatment acts on, 「溫通衛陽」) → −1 | **衛 −0.3**, confidence 0.65 |
| **Q4** | Does cold harm the 營 in 太陽傷寒 (風傷衛、寒傷營)? | Yes — 成無己 「寒并於荣者，為荣強衛弱」 (**0.4**: a commentator's scheme, disputed by later ones) → 營 +1, 衛 −1 · The clause names no 營衛 — 傷寒論 35 (**0.6**: the classic itself; its pains are the cold's) → 0 | **營 +0.4, 衛 −0.4**, confidence 0.76 |
| **Q5** | Does the 衛 stage of a warm disease sweat? | It must be opened — 溫熱論 「在衛汗之可也」 (**0.5**) → 開闔 +1 · It sweats — 溫病條辨 「身熱自汗」 (**0.5**) → 開闔 −1 | **0**, confidence 0.5: no 營衛 nature for EX3 風熱犯表; the readings cancel and the panel says nothing it cannot support |
| **Q6** | Are 營 and 衛 qi of the body or stages of a warm disease? | Qi — 營衛生會 「營在脈中，衛在脈外」 · Stages — 溫熱論 「衛之後方言氣，營之後方言血」 | Not a conflict once the uses are separated (each 1.0 for its use): the panel holds the qi; the stages name where a warm disease is — 衛分 is EX3, and the 氣、營、血 stages are fevers the red-flag screening sends to a doctor (RF_B_HIGH_FEVER, RF_A_CONSCIOUSNESS, RF_A_BLEEDING, RF_A_SEIZURE) |

### 2.5 Where 營 and 衛 come from

A pattern whose organs are deficient weakens the qi made from them, by the weights of Q1 and Q2 and a coupling strength **c = 0.3** `[calibrate]`, computed into each pattern's projection when the knowledge base is built (the engine is unchanged):

```
衛 += c · (0.5·肺.qi + 0.15·脾.qi + 0.15·脾.yang + 0.2·腎.yang)      (deficits only)
營 += c · (0.6·脾.qi + 0.4·心.blood)                                 (deficits only)
```

So a 脾氣虛 person's 營 is a little weak (−0.18 per degree), a 肺氣虛 person's 衛 too (−0.15), and the 心脾兩虛 and 氣血兩虛 patients' 營 (−0.3). An excess of an organ does not make 衛 or 營 strong.

### 2.6 The deficiency–excess axis

The 八綱 虛實 axis now counts the 營衛 block: a negative value (衛弱, 營弱, pores open) as deficiency, a positive one (pores closed, 營強) as excess. 太陽中風 becomes 表虛 and 太陽傷寒 表實 — what the tradition calls them — where the axis could not tell them apart before.

### 2.7 The herbs

The commentaries state the 營衛 actions of the formula herbs (hand-set, like every effect of a formula herb):

| Herb | 營衛 effect | Basis |
|---|---|---|
| 桂枝 | 衛 +0.4, 開闔 −0.2; and 風 −0.3, which it lacked | 「溫通衛陽」「於發汗中寓斂汗」 (醫宗金鑑); 「和荣衛而散風邪」 (成無己) |
| 芍藥 (白芍) | 營 +0.4, 開闔 +0.3 | 「酸能收斂，寒走荣陰」 (醫宗金鑑) |
| 生薑 | 衛 +0.2, 風 −0.2 | 「佐桂枝以解表」 |
| 大棗 | 營 +0.3 | 「佐芍藥以和中」 |
| 麻黃 | 開闔 −1.0 | 發汗散寒: it opens the pores (傷寒論 35, 「當與麻黃湯發汗」) |
| 黃耆 | 衛 +0.6, 開闔 +0.5 | 固表止汗 (the Pharmacopoeia's 功效; the 君 of 玉屏風散) |
| 白朮 | 衛 +0.2, 開闔 +0.2 | 健脾 (衛 from the 中焦), 止汗 |
| 五味子 | 開闔 +0.3 | 斂汗 |

The keyword rules of the other herbs gain the same words (固表、止汗、斂汗、發汗、調和營衛、和營、斂陰), so a derived herb's record says the same thing.

### 2.8 What changes, and what does not

| | Before | After |
|---|---|---|
| EX1 太陽傷寒 | 風, 寒, exterior | + 衛閉 (開闔 +1, 營 +0.4, 衛 −0.4) |
| EX2 太陽中風 | 風, exterior | + 營弱衛強 (衛 −0.3, 營 −1, 開闔 −1) |
| EX4 營衛不和 | 肺 qi −1 (表 × 氣虛), exterior | **衛氣不和** instead (衛 −1, 開闔 −1), exterior: 「臟無他病」 (傷寒論 54) — no organ is deficient |
| LG1 肺氣虛（衛表不固） | 肺 qi −1 | + 衛弱 (衛 −1, 開闔 −1) and its source (衛 −0.15) |
| SP1, SP2, SP3, HT1, QB1, KD2 | — | small 衛 and 營 deficits from their organs (§2.5) |
| EX3 風熱犯表 | — | unchanged (Q5) |
| Pattern scores, the pattern self-test, the inquiry | — | **unchanged**: they come from the symptoms, not the panel |

Expected: 桂枝湯 corrects the 營 and 開闔 of 太陽中風 and the 衛 of 營衛不和; 麻黃湯 opens the pores of 太陽傷寒; 玉屏風散 secures the 衛 of 衛表不固. The verification report says whether they do; nothing is tuned to make it pass.

### 2.9 Not modelled, and why

| | Why not |
|---|---|
| The 衛氣's day and night course, and sleep (「衛氣不得入於陰」) | It would need a pattern of its own (不寐 from 衛 that cannot enter the 陰); no pattern enters the library outside admission (PM-21, PM-22). The reasoning text may cite it; the panel does not |
| 營分、血分 heat and 清營 | A stage of a warm disease that the red-flag screening sends to a doctor (Q6), never a state the app treats |
| 營衛 and 痺 (痺論 「逆其氣則病…不與風寒濕氣合，故不為痺」) | No 痺 pattern in the library |
| 營 from blood, the other way (血虛 → 營虛) | 「化以為血」 says that 營 makes blood; only the 心-blood link of 溫熱論 is used (Q2) |

## 3. Data, code and documents (PM-52)

- `scripts/kb/curated/yingwei.py` → `data/diagnosis/yingwei.json` (dimensions, natures with their readings, questions, couplings, stages, what is not modelled; schema, validator: every citation verified, weights summing to 1, values and confidences recomputed, the natures' projections equal to those of the panel schema).
- `scripts/kb/curated/panel.py`: the 營衛 block, the four natures (their projections computed from the readings), the coupling; `build_diagnosis.py` applies it; `patterns.py`: EX1, EX2, EX4, LG1 elements.
- Herb effects (`curated/herbs.py`, `herb_model.py`), the dimension weight (`params.py`), the 八綱 axis (engine `panel.ts` and the Python oracle, kept in parity).
- The result page shows the block (three rows, with their words and numbers); the labels in three languages; `dimLabel` for the 方解.
- The SOP §10 (the logic owner) and the algorithm document's §9 panel; the book (chapters 4, 10); the verification report regenerated; the parity cases, the result pins and the golden results re-recorded as a knowledge-base change, each change explained.

## 4. Review

Class C — a TCM clinical reviewer checks the readings, the applicability weights and the herb effects (all `[calibrate]`); until then everything is a draft, like the rest of the panel.

## 5. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-07 | Initial design, from the owner's direction of 2026-10-07 |
