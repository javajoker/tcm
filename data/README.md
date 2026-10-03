# data/ — project knowledge base

Generated, reviewed-in-progress knowledge for the diagnosis engine and the UI. **Everything here is built by
`scripts/kb/` from the sources in [`reference/`](../reference/README.md) plus clearly separated curated tables; nothing
is typed in by hand into the JSON.** All records are `status: draft` or `derived` until a qualified TCM practitioner
reviews them (see [Review status](#review-status)).

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
git submodule update --init --depth 1
.venv/bin/python -m scripts.kb.build_kb     # build all + schema validation + integrity checks + pattern self-test (deterministic: same inputs → same bytes)
.venv/bin/python -m unittest discover -s scripts/kb/tests -t .   # KB pipeline tests
```

Needs Node ≥ 22.18 for the one TypeScript export step (`scripts/kb/export_wuxing_tables.ts`).

## Contents

| File | Records | What it holds | Built from |
|---|---:|---|---|
| `citations.json` | 127 | Quotation registry (id, book, chapter, zh-Hant and source-script text, source path). **Every quote is machine-checked against the source text** (`verified: true`). Ids: `suwen-005-1`, `shanghan-035` … | TCM-Library raw text, TCM-Ancient-Books |
| `herbs/herbs.json` | 703 | Herb model: 四氣 (signed warmth), 五味→五行, 歸經 organs, functions, **panel effects**, **burden weights (利弊)**, tags, pregnancy / interaction / toxicity flags | TCM-Library (Pharmacopoeia 2025 + textbook entries) → derived rules; 94 curated herbs override |
| `herbs/herb-index.json` | 714 | zh-Hant name / alias → herb id | same |
| `formulas/formulas.json` | 33 | Formulas: composition with 君臣佐使 roles and proportions, aggregate panel effect and burden, flavour profile, computed tier A/B/C, pregnancy and interaction flags, modifications (加減), verification record | curated + verified against the classics |
| `diagnosis/symptoms.json` | 171 | 12-dimension symptom registry + 32 tongue features + 28 pulses (zh-Hant / English) | curated |
| `diagnosis/questions.json` | 28 questions, 8 modules | **Question bank** for the adaptive inquiry: plain-language prompts (zh-Hant, en), options → symptom ids, severity grading, exclusivity, prerequisites, follow-up triggers; all 111 inquiry symptoms reachable | curated draft (`scripts/kb/curated/questions.py`) |
| `diagnosis/patterns.json` | 23 | MVP patterns with weighted evidence, required symptoms, panel projection, formulas, diet/acupoints/lifestyle, citations | curated |
| `diagnosis/pattern-elements.json` | 24 | 證素 decomposition (location × nature) with symptom weights derived from the patterns | derived from patterns |
| `diagnosis/tongue.json` | 6 zones, 32 features | Tongue zones (classical + textbook), zone-specific features, special signs (tooth marks, cracks, red dots, ecchymosis…) | curated; zone statement verified in 《傷寒指掌》 |
| `diagnosis/pulse.json` | 28 + 6 positions | Pulses with yin/yang class, features, indications; optional-input guidance and quality coefficient | 《瀕湖脈學》 (headings verified) + 《診家正眼》 |
| `diagnosis/constitutions.json` | 9 | Nine constitutions, features, nature priors, susceptibility (questionnaire items deliberately excluded) | curated |
| `diagnosis/red-flags.json` | 28 | Red-flag lists A / B / C | curated (needs physician review) |
| `diagnosis/scoring-params.json` | — | **Engine parameters** shared by the Python oracle and the TypeScript engine: severity and quality factors, pattern bands, panel and reconciliation thresholds, formula and 加減 limits, tier thresholds, questionnaire limits | `scripts/kb/curated/params.py` (draft, SOP D3) |
| `diagnosis/panel-schema.json` | — | The panel (五行臟腑・六邪・八綱) schema and the 證素 → panel projection | curated |
| `wuxing/correspondences.json` | 5 | Five-phase correspondences **parsed from 《素問·陰陽應象大論》** (both orifice schools kept) | TCM-Library raw text |
| `wuxing/ganzhi.json` | — | Stems, branches, hidden stems, 人元司令, solar terms | exported from `packages/wuxing` |
| `wuxing/yunqi.json` | — | 五運六氣 tables + 10 民病 excerpts parsed from 《素問·氣交變大論》 | `packages/wuxing` + raw text |
| `wuxing/susceptibility.json` | 9 × 6 | Constitution × pathogenic-qi risk and the season map | curated |
| `wuxing/engine-params.json` | — | Default engine / profile / transmission parameters | exported from `packages/wuxing` |
| `config/scope-profiles.json` | 2 profiles | **Application configuration**: output levels L0–L3, `dev` (everything open) and `release` (restricted) profiles, notice policy | curated |
| `safety/rules.json` | 25 rules | Safety filter rules per population / condition / state / medication class, 十八反・十九畏, pregnancy acupoints, reference amounts | curated |
| `treatment/guidance.json` | 31 points | Acupoint registry (WHO code, meridian, pregnancy flag) and general lifestyle text | curated |
| `schema/*.schema.json` | 22 | **JSON Schemas** (draft 2020-12) for every data file; the contract validated in the build and the source of the TypeScript types | `scripts/kb/schemas.py` |
| `glossary.json` | 139 | zh-Hant ⇄ English ⇄ pinyin (needs review) | curated |

## Core modelling conventions

**Panel (盤面).** Every quantity is a *deviation from the average healthy person* (all zeros): ten organ nodes × channels
`qi / blood / yin / yang` (signed, −3 … +3) + `stasis` (0 … 3), the six pathogenic qi `liuxie.風寒暑濕燥火`, the pathological products
`product.痰飲瘀食積`, and derived 八綱 scalars. A pattern element (證素 = location × nature) *projects* onto the panel
(`diagnosis/panel-schema.json`), degree = 3 · Pct / 100.

**Herbs act on the same dimensions.** `effects` = the change an herb makes to the panel of the person taking it
(`脾.qi +0.9`, `liuxie.寒 −0.8`); `harms` = its burden (苦寒 → `脾.yang −0.25`, 滋膩 → `脾.qi −0.25`, 辛熱 → `腎.yin −0.25` …). A formula's
`panel_effect` = Σ effective weight × herb effect, where **effective weight = proportion × role weight** (君 1.0 / 臣 0.6 / 佐 0.35 / 使 0.15,
《素問·至真要大論》 主病之謂君，佐君之謂臣，應臣之謂使), normalised. Matching a formula to a patient is then choosing the vector that offsets the deviation;
**adding or removing an herb (加減) edits the vector** (see `formulas[].modifications` and `herbs[].effects`).
Flavour excess harm follows 《素問·生氣通天論》 (酸→脾, 鹹→心, 甘→腎, 苦→脾, 辛→肝; citations `suwen-003-1…5`).

**Tiers are computed, not assigned.** C: a strong herb (麻黃, 附子), bitter-cold herbs ≥ 45 % of effective weight, or outside the MVP.
B: blood-activating herbs carry ≥ 10 % of the effective weight, or it contains an aristolochic-acid-risk herb (木通). Else A (20 of the 33 formulas). Medication interactions are *not* part of the tier;
they are applied per patient by `safety/rules.json`.

**Scope profiles.** `release` restricts output (adult L1 …); `dev` opens L3 for everyone. In *both*, risky populations/conditions
get a blocking “see a doctor” notice that the user acknowledges and **then the flow continues**; only the output level differs. Effective level =
most restrictive of all matched dimensions. `safety_enforcement`: `suppress_hard` (release) or `annotate_only` (dev).

## Provenance and licences

| Source | Licence | Used for |
|---|---|---|
| TCM-Library (submodule) | MIT | classics text, herb properties/functions, 經方 text |
| TCM-Ancient-Books (submodule) | none declared — reference only | verification of later formulas and of quoted passages; **no text redistributed beyond short quotations** |
| tcm-mkg (submodule) | MIT | not yet used (candidate for English/Latin herb names) |
| 《中華人民共和國藥典》 facts via TCM-Library | official publication | properties, functions, cautions as structured facts only |
| `packages/wuxing` | project code | stems/branches/yunqi tables, parameters |

Every herb carries `source.path` and the submodule commit; every formula carries its verification record.

## Verification summary (at generation time)

- Citations: **127 / 127 verified** against the source text.
- Formulas: composition verified for all 33 — 9 against the original classical text (amounts parsed), 18 against the named source book, **6 partially**
  (a few herbs not found near the heading: usually lost characters in the GB18030 compilation such as 芪 and 芎, or herbs added after the
  original — e.g. 當歸 and 遠志 in 歸脾湯). Partial rows list the missing herbs; confirm with a second source (Wikisource) before marking `verified`.
- Five-phase correspondences and the 民病 excerpts are parsed from the original, not transcribed.
- Pattern self-test: each of the 23 patterns ranks first for its own typical patient. Smallest margins (need discriminating questions):
  EX2 vs EX4 (both 桂枝湯 patterns; 3 points), HT2 vs KD1 (11), LG1 vs EX4 (5).
- Pharmacopoeia facts are used as structured data (`derived` herbs: 609) and **have not been reviewed**.

### Data-quality findings in the sources (kept visible)

- `TCM-Library` entry `shenqiwan_001`: its 原文 begins with an unrelated 血痹 passage; the 腎氣丸 composition is parsed from 《金匱要略》 (raw `jingui_22`) instead.
- Orthography: the Pharmacopoeia and classical sources use 溼; terms and descriptive fields are normalised to 濕 (`common.term()`), classical quotations keep the source form. `validate_kb` fails on 溼 outside quotations.
- 穿山甲 appears twice in TCM-Library (the Pharmacopoeia 2025 entry and the textbook's non-Pharmacopoeia list); the build keeps the Pharmacopoeia entry and notes the dropped one in `data_quality` (found by the duplicate-name check, task K-03).
- A few Pharmacopoeia rows list a temperature word inside 五味 (`wuwei`); these are ignored and recorded in `herbs[].data_quality`.
- `TCM-Ancient-Books` is GB18030 Simplified Chinese with occasional dropped characters (e.g. 芪 in “黃芪”), which is why composition checks can report partial matches.

## Review status

| Status | Meaning |
|---|---|
| `derived` | machine-derived from structured sources by transparent rules (herbs) |
| `curated-draft` | hand-curated overlay, not reviewed |
| `draft` | hand-curated table, not reviewed |
| `verified` (citations only) | the quote was found in the source text |

Nothing is `reviewed` or `approved` yet. Items that **must** be reviewed before any release: pattern weights and thresholds, formula–pattern mapping and roles,
herb effect / burden weights, pregnancy / interaction / toxicity flags, red-flag lists, dose references and the conflict-rule thresholds
(`safety/rules.json → _meta.clinical_review_required`).

## Known gaps (tracked in the task list)

- English text is mostly names only; prose translation is pending. English herb names are curated for the MVP formula herbs only.
- No Simplified-Chinese output (the UI language set is zh-Hant + en).
- Constitution questionnaire items are not included (licensing; SOP D6).
- Acupoint locations and illustrations, tongue/pulse illustrations: UI task.
- A second-source cross-check of 時方 compositions (Wikisource) and of the Simplified→Traditional conversion of citations.
