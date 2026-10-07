# Design: Knowledge Base v2 — Sources, Theory and the Learning Book

| | |
|---|---|
| **Version** | 0.4 (draft) |
| **Status** | Design for Release E (FR-35, FR-39; tasks PM-35, PM-42, PM-43). **Built: the sources registry and its coverage report (PM-35, §4.1)** |
| **Last updated** | 2026-10-07 |
| **Audience** | The clinical content owner, reviewers, engineers |
| **Related** | [Prescription model](prescription-model.md) · [Library expansion](library-expansion.md) · [`reference/README.md`](../../../reference/README.md) · [Content review](../../content-review.md) · [KB schema](../../kb-schema.md) · [Requirements FR-35, FR-39](../requirements.md) |

> **Summary.** *Is anything famous missing?* Hardly anything is missing from the **corpus**: the project already holds 704 classical texts (TCM-Ancient-Books), the structured canon and the 2025 Pharmacopoeia (TCM-Library) and a herb-entity corpus (tcm-mkg). What is missing is **use**: the knowledge base quotes 11 of the 704 books, mostly 《素問》 and 《傷寒論》, and its herb and formula theory is a keyword rule set. This design names, domain by domain, which classics the knowledge base should draw on and for what; lists the few famous works the corpus lacks; adds the tables the prescription model needs (properties, pairings, processing, dose bands, 治法, 三因); keeps every new item traceable to a verified passage and marked a draft until reviewed; and plans a short **learning book in Traditional Chinese** that explains the app's model to a reader who already knows the culture.

---

## 1. What the knowledge base holds and uses today

| Area | Today | Drawn from |
|---|---|---|
| Quotations | 127, all verified against the corpus | 素問 79 · 傷寒論 18 · 靈樞 13 · 金匱要略 7 · 難經 3 · 醫學心悟 2 · 本草便讀 · 瀕湖脈學 · 丹溪心法 · 景岳全書 · 傷寒指掌 |
| Herbs | 703: Pharmacopoeia 637, a textbook's 63, 3 by hand | 2025 Pharmacopoeia (TCM-Library), 《中藥學》 |
| Formulas | 33 classical formulas, compositions verified against the classical text where it could be | 傷寒論, 金匱要略, 和劑局方, 溫病條辨 and others |
| Patterns | 23, with evidence tables and admission records | SOP, textbooks, verified quotations |
| Herb theory | 四氣 → warmth; 五味 → element; 歸經; functions → effects by keyword rules | Pharmacopoeia fields; 《素問》 for 五味 |
| Safety | 十八反、十九畏, pregnancy classes, interaction classes, dose references for minors and the elderly | 《本草便讀》 歌訣; textbooks (十九畏 marked unverified) |

## 2. Coverage by domain, and what to draw on

"In the corpus" means a file under `reference/sources/TCM-Ancient-Books/` (or TCM-Library). All of these are public-domain texts; the corpus has no upstream licence, so — as today — the knowledge base takes **facts and short verified passages** from it, never whole texts.

| Domain | Classics in the corpus (selection) | What the knowledge base should take from them |
|---|---|---|
| **Theory** (陰陽五行、臟腑、氣血津液、病因) | 黃帝內經 (素問, 靈樞), 難經, 類經, 中藏經, 三因極一病證方論, 醫學源流論 | The correspondences already used; 君臣佐使 (《素問·至真要大論》); 因地制宜 (《五常政大論》《異法方宜論》); 三因 (病因三分); 五方異治 (《醫學源流論》) |
| **Diagnosis** (四診) | 脈經, 瀕湖脈學, 診家正眼, 望診遵經, 察舌辨症新法, 傷寒指掌 | Tongue and pulse descriptions for the observation screens and the AI observation lists (FR-41); the reliability notes |
| **Pattern systems** (辨證) | 傷寒論 (六經), 溫熱論/溫熱經緯 (衛氣營血), 溫病條辨 (三焦), 中藏經/小兒藥證直訣/景岳全書 (臟腑), 醫林改錯 & 血證論 (氣血) | Definitions and mapping between systems for the learning book and for later library waves (PM-22, which stays gated by reviewers) |
| **Herb theory** (本草) | 神農本草經, 本草經集注, 新修本草, 證類本草, 本草綱目, 珍珠囊, 醫學啟源, 湯液本草, 本草備要, 本草從新, 得配本草, 本草求真, 本草崇原, 本草害利, 雷公炮炙論, 炮炙大法, 本草綱目拾遺 | 升降浮沉 and 氣味厚薄 (醫學啟源, 湯液本草); 引經 (珍珠囊, 湯液本草); 七情 (神農本草經 序例); pairings (得配本草); harms (本草害利); processing (雷公炮炙論, 炮炙大法) |
| **Formula theory** (方劑) | 傷寒論, 金匱要略, 千金方, 外臺秘要, 太平惠民和劑局方, 醫方集解, 湯頭歌訣, 刪補名醫方論, 成方切用, 溫病條辨, 景岳全書 (新方八陣), 醫學心悟 (八法), 脾胃論, 醫學衷中參西錄 | 方解 for the 33 formulas (verification of the roles, PM-39), 加減 rules with their sources, 治法 (八法: 汗吐下和溫清消補) and the formula classes |
| **Treatment principles** | 素問, 醫學心悟, 景岳全書, 醫學源流論 | 治則 (扶正祛邪、標本緩急、三因制宜) as data for the prescription model |
| **Constitution and prevention** | 素問 (上古天真論, 四氣調神大論), 飲膳正要, 食療本草 | Season and food guidance (already partly used) |

## 3. Famous works the corpus lacks

| Work | Why it matters | Status |
|---|---|---|
| 辨舌指南 (曹炳章, 1920) | The modern classic of tongue diagnosis | Public domain; not in the corpus |
| 舌鑑辨正 (梁玉瑜, 1894) | Tongue atlas with corrections | Public domain; not in the corpus |
| 四診抉微 (林之翰, 1723) | Four examinations, systematic | Public domain; not in the corpus |
| 藥品化義 (賈所學, 明) | The eight-aspect herb analysis (體色氣味形性能力) | Public domain; not in the corpus |
| 傷寒來蘇集 (柯琴) | Major 傷寒論 commentary | Public domain; not in the corpus |
| 雜病源流犀燭 / 沈氏尊生書 | Internal medicine | Public domain; not in the corpus |
| 本經疏證 (鄒澍) | 神農本草經 commentary | Public domain; not in the corpus |
| Modern textbooks (中醫基礎理論, 中醫診斷學, 中藥學, 方劑學, 中醫內科學) | The standard teaching statements (dose bands, 三因制宜 wording) | **Copyrighted**: cited as bibliography for facts a reviewer checks; no text copied |
| 中華本草, 中藥大辭典 | Comprehensive modern herb references | Copyrighted; same as above |

Each public-domain addition is a **download that needs the owner's approval** (filename, source and size stated when asked; Wikisource is the preferred source for Traditional-script originals). None is needed to start: the corpus already covers every domain.

## 4. What the knowledge base gains

| Data | File (proposed) | Content | Status of the content |
|---|---|---|---|
| **Sources registry** | `data/sources.json` | Every book the knowledge base draws on: id, title, author, dynasty, year, domain, corpus path, public-domain status, which records use it | Generated + curated |
| **Herb properties v2** ✔ | `data/herbs/herbs.json` (`props`, `props_rules`) | 陰陽、五行、升降浮沉、毒性 grade、補瀉、潤燥、氣血分, with the rule id of each derivation — built (PM-36; [prescription model §3.6](prescription-model.md)) | `derived` |
| **Pairings (七情)** ✔ | `data/herbs/pairings.json` (PM-37) | 相須 · 相使 · 相畏 · 相殺 · 相惡 · 相反 pairs, each with a verified source passage | `curated-draft` |
| **Processing** ✔ | `data/herbs/processing.json` (PM-37) | 炮製 methods and their modifiers | `curated-draft` |
| **Dose bands (量效)** ✔ | `data/herbs/dose-bands.json` (PM-37) | Herbs whose action changes with the dose, with the source | `curated-draft`, few entries |
| **治法 taxonomy** | `data/formulas/methods.json` | 八法 and the formula classes; each formula tagged | `curated-draft` |
| **Pattern mechanisms** ✔ | `data/treatment/mechanisms.json` (PM-39; a file of its own so that the diagnosis data stays as it is) | 病機 direction (升降宣收) where the classics state it | `curated-draft` |
| **三因制宜 rules** ✔ | `data/treatment/sanyin.json` (PM-40) | The factors of the prescription model (age, constitution, season, region) with sources | `curated-draft` |
| **Quotations** | `data/citations.json` | New verified passages for the above (target: about 60) | `verified` once matched in the corpus |

Every derived item keeps a pointer to its source and is shown as a draft, exactly as the 609 derived herbs are today; nothing reaches a public build until the review track covers it ([content review](../../content-review.md)). The admission rules for **new patterns** (PM-21) are unchanged: this design adds no pattern.

### 4.1 As built: the sources registry (PM-35)

`data/sources.json` registers 87 works — 72 in the corpus (the classics of §2 by domain), the 8 famous works the corpus lacks (§3 and 《醫級》, which a modification of the library names), and 7 standards, references and websites — and counts how the data uses each. The generated report is [`docs/kb-sources.md`](../../kb-sources.md). First reading:

- **33 of the 87 works are drawn on**; the 127 quotations come from 11 of them (《素問》 79).
- **Herb theory is the gap**: of the 47 本草 books of the corpus, the registry names 19 and the data draws on one (《本草便讀》, for the 十八反 and 十九畏 rhymes); the herb records come from the Pharmacopoeia and a textbook through TCM-Library. PM-36 and PM-37 draw on 《醫學啟源》《湯液本草》 (升降浮沉, 氣味厚薄), 《得配本草》 (pairings), 《雷公炮炙論》《炮炙大法》 (processing) and 《本草害利》 (harms).
- **Diagnosis** draws on 《瀕湖脈學》《診家正眼》 and the tongue-zone passage of 《傷寒指掌》; 《望診遵經》《察舌辨症新法》《傷寒舌鑑》《臨症驗舌法》 are in the corpus and unused — the observation lists of FR-41 should start there.
- **Formulas** are the best covered (21 of 33 registered works drawn on); the 方解 works (《刪補名醫方論》《醫方集解》) are what PM-39 checks the roles against.
- A book title in the data was misspelt (《醫宗已任編》 for 《醫宗己任編》); the registry's rule that every `book` name resolves found it, and it is corrected.

## 5. The extraction pipeline

As for the existing quotations: a curated table names the record and an **anchor** (a short passage); the build finds the anchor in the corpus file (Simplified, GB18030, converted with OpenCC `s2twp`) and records `verified: true` with the path, or fails. Values derived by rule (properties) keep the rule id and are re-derived on every build, so correcting a rule corrects every herb. Nothing is taken from the corpus by a model: every value comes from a rule, a table a person wrote, or a passage that was matched.

## 6. The learning book (FR-39)

**For whom.** A clever reader with a strong grounding in Chinese culture — who knows what 陰陽 and 五行 are as words, reads classical quotations without help, and wants to understand, quickly, **how this app thinks**.

**Language.** Traditional Chinese only (the owner's choice). It is not translated; the English and Simplified interfaces point to it and say so.

**Form.** About a dozen short chapters, each one idea, in plain modern Chinese with classical quotations where they carry the idea (taken from the verified quotations). Each chapter maps a piece of the tradition to the piece of the model that implements it, and says where the model simplifies. It explains, never prescribes: no doses, no "take this".

| Chapter | The idea | The model's counterpart |
|---|---|---|
| 一、以模型讀中醫 | Why a model, what it can and cannot do | The whole pipeline; levels and gates |
| 二、陰陽：一把尺 | 陰陽 as a signed axis | The 八綱 axes (寒熱、虛實、表裡) |
| 三、五行：五個抽屜與生剋 | 五行 as categories and relations | The five-phase panel, 生剋乘侮, transmission |
| 四、臟腑與氣血津液：人體的帳本 | State variables | The panel: organ × qi/blood/yin/yang/stasis |
| 五、病因：六淫、七情、飲食勞倦 | Forces acting on the state | 六邪 and products (痰飲瘀食積) |
| 六、四診：量測與可信度 | Observation as measurement | Findings, quality classes, red flags |
| 七、辨證：由證據推病機 | Inference | Pattern scores, evidence for and against, confidence |
| 八、天時與先天：先驗不等於診斷 | 時令、運氣、先天 | The reference panel as a prior |
| 九、本草：一味藥的座標 | 四氣五味、升降浮沉、歸經、毒 | The herb property model and its effect at a dose |
| 十、方劑：君臣佐使是一種分工 | Formula structure | Formula effect, roles measured, the 方解 in numbers |
| 十一、因人因時因地：同病異治 | 三因制宜 | Personalisation of 加減 and amounts |
| 十二、安全與邊界 | 十八反十九畏、妊娠、毒、就醫 | The safety layer and the levels |

**Where it lives.** `docs/book/zh-Hant/` as Markdown first; then in the app's Learn section as a book kind, shown in Traditional Chinese whatever the interface language (the Simplified interface links to it with a note, because a Simplified page must hold no Traditional text).

### 6.1 As built (PM-42)

[`docs/book/zh-Hant/`](../../book/zh-Hant/README.md): an index with three conventions (every quotation checked against the corpus; it explains, it does not prescribe; the model is not a physician) and the twelve chapters of the table above, 600 to 1,150 characters each — a few minutes apiece. Each chapter maps the tradition to the model with the model's own numbers (the 八綱 axes, the 臟 0.7 / 腑 0.3 shares of the five-phase function, the quality classes, the score bands, the prior caps, the herb coordinates and their weights, the 三因 factors) and ends with **模型的簡化**, where the model simplifies. **53 quotations from 16 works**, each a one-line blockquote naming its book and chapter.

`scripts/kb/tests/test_book.py` (in `pnpm test:kb`) keeps it so: the index lists the twelve chapters in order; every blockquote is a quotation with its source, and every quotation is part of a **verified** citation of the book and chapter it names; Traditional characters only (Big5-HKSCS, four rare medical characters allowed); no amount in grams, 錢 or 兩 and no instruction to take anything; each chapter 400 to 3,200 characters and with its 模型的簡化.

Writing it against the model found three things, fixed with it: the reason the 君 keeps its amount in every season now has its classical source — 「發表不遠熱，攻裡不遠寒」 (《素問·六元正紀大論》, a new verified quotation, `suwen-071-4`, recorded as `season_exception` in the 三因 table) — in place of a loose reading of 有假者反常; the Traditional text of the 《本草蒙筌》 processing rhyme read 姜制 and 酒制 for 薑製 and 酒製 (OpenCC; corrected in the conversion's fixes); and the prescription design and PD-16 said three herbs could be added, where the model and the SOP add at most two.

### 6.2 In the app (PM-43)

Learn → the book, from the hub, in every interface: [knowledge browser §7.3](knowledge-browser.md#73-as-built-pm-43-the-learning-book). One file fetched when a reader opens it, Traditional Chinese whatever the interface, a Simplified page that says where the book is; a public build carries the book once it is reviewed. To be shown in Learn, the book now addresses no reader (R2): twenty-two lines with 你 were reworded.

## 7. Decided defaults

**Decided 2026-10-07 — default of this design, revisit with the owner (decision register PD-19, PD-20).**

| Question | Default |
|---|---|
| New downloads | None needed to start; the seven public-domain works of §3 are asked for one by one when a task needs them (PD-19) |
| Modern textbooks | Bibliography for facts a reviewer checks; never copied (PD-19) |
| New content status | `derived` / `curated-draft` until reviewed; no new pattern |
| Book language | Traditional Chinese only; in-app in every interface, with a note where the interface is not Traditional Chinese (PD-20) |

## 8. Tasks

PM-35 (sources registry and coverage report), PM-36 … PM-40 (the tables above, with the prescription model), PM-42 (the learning book), PM-43 (the book in the app) — [`TASKS.md`](../../../TASKS.md).

## 9. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-07 | Initial design, from the owner's direction of 2026-10-07 |
| 0.2 | 2026-10-07 | §4.1: the sources registry as built (PM-35) and its first reading |
| 0.3 | 2026-10-07 | §6.1: the learning book as built (PM-42) |
| 0.4 | 2026-10-07 | §6.2: the book in the app (PM-43) |
