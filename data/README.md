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
| `sources.json` | 87 works | **Sources registry** (PM-35): every work the knowledge base draws on or should draw on, by domain — the classics in the corpus, 8 famous works the corpus lacks, the Pharmacopoeia, standards and modern references — with how the data uses each (33 drawn on). Report: [`docs/kb-sources.md`](../docs/kb-sources.md). Build-time only | `scripts/kb/curated/sources.py` + tcm-mkg's catalogue + the other data files |
| `herbs/herbs.json` | 703 | Herb model: 四氣 (signed warmth), 五味→五行, 歸經 organs, functions, **panel effects**, **burden weights (利弊)**, tags, pregnancy / interaction / toxicity flags; **the property model v2** (`props`, PM-36): 陰陽, 五行 shares, 升降浮沉, 毒性 grade, 補瀉, 潤燥, 氣血分, weighted 歸經 and the part used, each with the rules that made it (`props_rules`) | TCM-Library (Pharmacopoeia 2025 + textbook entries) → derived rules; 94 curated herbs override |
| `herbs/herb-index.json` | 714 | zh-Hant name / alias → herb id | same |
| `herbs/pairings.json` | 249 | **七情** between herbs (PM-37): 相使 70, 相惡 81, 相畏 87 read from 《本草綱目·序例下》「相須相使相畏相惡諸藥」 (each keeps its entry), 相須 11 textbook examples (unverified) | `scripts/kb/build_prescription.py` |
| `herbs/processing.json` | 14 methods | **炮製** and what each does to a herb, from 《本草蒙筌·製造資水火》 | `scripts/kb/curated/prescription.py` |
| `herbs/dose-bands.json` | 5 | **量效**: herbs whose action changes with the amount (葛根, 人參, 升麻, 蘇木, 紅花), each from a verified passage | `scripts/kb/curated/prescription.py` |
| `herbs/yinjing.json` | 12 channels | **引經報使**: the herbs that lead a formula to each channel, from 《本草綱目·序例上》 (after 《珍珠囊》), each channel keeping its entry | `scripts/kb/build_prescription.py` |
| `treatment/prescription.json` | — | Parameters of the prescription model (dose–response κ, γ; pairings σ, τ; dose bands; the 方解 threshold; the role readings) | `scripts/kb/curated/prescription.py` |
| `formulas/formulas.json` | 33 | Formulas: composition with 君臣佐使 roles and proportions, aggregate panel effect and burden, flavour profile, computed tier A/B/C, pregnancy and interaction flags, modifications (加減), verification record | curated + verified against the classics |
| `diagnosis/symptoms.json` | 184 | 12-dimension symptom registry + 32 tongue features + 28 pulses (zh-Hant / English) | curated |
| `diagnosis/questions.json` | 36 questions, 8 modules | **Question bank** for the adaptive inquiry: plain-language prompts (zh-Hant, en), options → symptom ids, severity grading, exclusivity, prerequisites, follow-up triggers; all 124 inquiry symptoms reachable | curated draft (`scripts/kb/curated/questions.py`) |
| `diagnosis/exclusions.json` | 23 groups, 10 splits | Mutually exclusive symptom groups (incl. pulse), soft conflicts, and look-alike symptom splits with their distinguishing hints | curated draft |
| `diagnosis/orientation.json` | 4 sign lists | 八綱 first-impression signs (cold/heat, deficiency/excess), external triggers, 表/半表半裡 rule — routing and consistency only | curated draft |
| `diagnosis/patterns.json` | 23 | MVP patterns with weighted evidence, required symptoms, panel projection, formulas, diet/acupoints/lifestyle, citations | curated |
| `diagnosis/pattern-elements.json` | 24 | 證素 decomposition (location × nature) with symptom weights derived from the patterns | derived from patterns |
| `diagnosis/tongue.json` | 6 zones, 32 features | Tongue zones (classical + textbook), zone-specific features, special signs (tooth marks, cracks, red dots, ecchymosis…) | curated; zone statement verified in 《傷寒指掌》 |
| `diagnosis/pulse.json` | 28 + 6 positions | Pulses with yin/yang class, features, indications; optional-input guidance and quality coefficient | 《瀕湖脈學》 (headings verified) + 《診家正眼》 |
| `diagnosis/constitutions.json` | 9 | Nine constitutions, features, nature priors, susceptibility (questionnaire items deliberately excluded) | curated |
| `diagnosis/red-flags.json` | 28 | Red-flag lists A / B / C | curated (needs physician review) |
| `diagnosis/scoring-params.json` | — | **Engine parameters** shared by the Python oracle and the TypeScript engine: severity and quality factors, pattern bands, panel and reconciliation thresholds, formula and 加減 limits, tier thresholds, questionnaire limits | `scripts/kb/curated/params.py` (draft, SOP D3) |
| `diagnosis/panel-schema.json` | — | The panel (五行臟腑・六邪・八綱) schema and the 證素 → panel projection | curated |
| `review/admission.json` | — | The admission records of the pattern library: the 23 original patterns, the waivers of their known gaps with reasons, declarations that are checked against the data (needs the tongue and pulse, no formula visible in a release, a margin exception), recorded textbook sources and red-flag boundaries. Build-time only; never in the bundle. | `scripts/kb/build_admission.py` (PM-21) |
| `review/records.json` | — | Review records compiled from `review/records/*.yaml`: who reviewed what (with content hashes), which units count as `reviewed`, which went stale after a change, and per-file coverage with the roles each file needs. **No record exists yet: nothing is reviewed.** | `scripts/kb/build_review.py` (K-16) |
| `wuxing/correspondences.json` | 5 | Five-phase correspondences **parsed from 《素問·陰陽應象大論》** (both orifice schools kept) | TCM-Library raw text |
| `wuxing/ganzhi.json` | — | Stems, branches, hidden stems, 人元司令, solar terms | exported from `packages/wuxing` |
| `wuxing/yunqi.json` | — | 五運六氣 tables + 10 民病 excerpts parsed from 《素問·氣交變大論》 | `packages/wuxing` + raw text |
| `wuxing/susceptibility.json` | 9 × 6 | Constitution × pathogenic-qi risk and the season map | curated |
| `wuxing/engine-params.json` | — | Default engine / profile / transmission parameters | exported from `packages/wuxing` |
| `config/scope-profiles.json` | 2 profiles | **Application configuration**: output levels L0–L3, `dev` (everything open) and `release` (restricted) profiles, notice policy | curated |
| `safety/rules.json` | 26 rules | Safety filter rules per population / condition / state / medication class, 十八反・十九畏, pregnancy acupoints, reference amounts | curated |
| `treatment/guidance.json` | 31 points, 47 foods, 23 lifestyle lines | Acupoint registry (WHO code, meridian, pregnancy flag) with a location text and cautions in both languages; diet entries (nature, flavour, rationale, cautions, pregnancy flag, citations — herb-backed ones take their properties from `herbs.json`); bilingual per-pattern lifestyle; general regimen text. All draft | curated + herb records |
| `schema/*.schema.json` | 22 | **JSON Schemas** (draft 2020-12) for every data file; the contract validated in the build and the source of the TypeScript types | `scripts/kb/schemas.py` |
| `diagnosis/constitution-items.json` | 37 items | own-written constitution questionnaire (K-08; draft) | curated |
| `geo/cities.json` | 484 cities | birth-place picker: English and Traditional-Chinese names, latitude, longitude, IANA time zone; **GeoNames `cities15000`, CC BY 4.0** (K-10), built from `reference/geonames/cities-extract.tsv` | derived |
| `safety/name-fold.json` | 182 characters | the characters of the herb and food names that have another Simplified form (`FROM:TO` code points in hex), so an allergy typed in either script is matched (PM-33) | derived from the names |
| `safety/emergency.json` | 12 regions | regional emergency / crisis numbers (safety policy §5; unverified) | curated |
| `glossary.json` | 163 | zh-Hant ⇄ English ⇄ pinyin with `source` (`who-istm-2007` = the WHO standard term, known with confidence; `textbook` = an established rendering not confirmed as the WHO term; `project` = a gloss coined for this app), accepted alternative English (`alt`) and a `note`; all needs-review until the linguistic review (V-06) checks them against the standard | curated |

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

> **Licence statement.** The [`NOTICE`](../NOTICE) file at the root of the repository is the authoritative list of attributions and is shipped with the app (`/NOTICE.txt`, linked from the Sources screen). In short: **material written for this project** — the curated tables, the question bank and constitution questionnaire items, all English and Traditional Chinese wording, the generators — is under the **Apache License 2.0**, like the code. **Material derived from other sources keeps its licence and its attribution**: the MIT-licensed TCM-Library (the text of quoted passages, herb records, formula composition text) requires its copyright and permission notice to be kept, which `NOTICE` does. The classics themselves are in the public domain. Compilations without a licence (TCM-Ancient-Books) are used to verify quotations only and are never redistributed. Machine-derived herb records from the Pharmacopoeia are structured facts, marked `derived`. *Decided 2026-10-04 — MVP default (the project's own data under Apache-2.0); revisit after the MVP together with the legal review of the public statement (V-07).*

| Source | Licence | Used for | In the shipped data |
|---|---|---|---|
| TCM-Library (submodule, v1.0.0) | MIT, © 2026 TCM-Library contributors | quoted passages (source text, not the 白話提要 summaries), herb properties/functions, 經方 composition text | yes — attribution in `NOTICE` |
| TCM-Ancient-Books (submodule) | none declared — reference only | verification of later formulas and of quoted passages | **no files**; only short quotations of public-domain texts (7 citations name it) |
| tcm-mkg (submodule) | MIT | candidate for English/Latin herb names | **not used yet**; `NOTICE` is updated if it is |
| 《中華人民共和國藥典》 facts via TCM-Library | official publication | properties, functions, cautions as structured facts only | yes, as `derived` facts |
| Classical texts (素問, 傷寒論, …) | public domain | the 127 quotations | yes |
| `packages/wuxing`, `scripts/kb/curated`, `diagnosis/constitution-items.json`, UI and English text | Apache-2.0 (project) | everything original | yes |
| GeoNames `cities15000` (K-10) | CC BY 4.0 — attribution required | city → coordinates and time zone for the birth card | yes — `geo/cities.json` (484 places, a reduced extract); attribution in `NOTICE`, in the file's `_meta` and on the Sources screen |

Every herb carries `source.path` and the submodule commit; every formula carries its verification record.

## Verification summary (at generation time)

- Citations: **127 / 127 verified** against the source text.
- Formulas: composition verified for all 33 — 9 against the original classical text (amounts parsed), 18 against the named source book, **5 against a second
  source** and **1 partially**. Six had herbs not found near the heading in the reference copy (lost characters of the GB18030 compilation such as 芪 and 芎, or herbs
  added after the original). K-14 looked each one up in an independent edition on Wikisource (`curated/second_source.py`, recorded as `verification.second_source`;
  checked 2026-10-04 with a page-to-text tool, so the passages were not compared byte for byte): 參苓白朮散, 補中益氣湯 (the same author's 內外傷辨惑論), 逍遙散, 越鞠丸
  and 玉屏風散 have every herb in the entry. 歸脾湯 stays partial on purpose — the original 《濟生方》 formula has eight herbs and 當歸 and 遠志 were added later; the app
  lists the common ten-herb form. The record is for reviewers and is not shipped in the release bundle.
- Five-phase correspondences and the 民病 excerpts are parsed from the original, not transcribed.
- Pattern self-test: each of the 23 patterns ranks first for its own typical patient. Smallest margins (need discriminating questions):
  HT2 vs KD1 (20 points), LG1 vs EX4 (31), EX2 vs EX4 (29, both 桂枝湯 patterns). The three pairs were 11, 6 and 3 points apart before K-07
  (decided 2026-10-04): 13 new symptoms and 8 follow-up questions, each asked only when a symptom shared by the pair is present
  (`Q_WIND_ONSET`, `Q_NOSE_NECK`, `Q_SWEAT_SPELLS`, `Q_BREATH_EXERTION`, `Q_COLD_EACH_SEASON`, `Q_KIDNEY_ESSENCE`, `Q_HEARING`, `Q_HEART_AT_NIGHT`).
- Pharmacopoeia facts are used as structured data (`derived` herbs: 609) and **have not been reviewed**.

### Data-quality findings in the sources (kept visible)

- `TCM-Library` entry `shenqiwan_001`: its 原文 begins with an unrelated 血痹 passage; the 腎氣丸 composition is parsed from 《金匱要略》 (raw `jingui_22`) instead.
- Orthography: the Pharmacopoeia and classical sources use 溼; terms and descriptive fields are normalised to 濕 (`common.term()`), classical quotations keep the source form. `validate_kb` fails on 溼 outside quotations.
- Script: text shown in Traditional must not contain Simplified forms. `validate_kb` fails on any character that Big5-HKSCS cannot encode outside the fields that keep the Simplified source on purpose (`quote_source_zh_hans`, `*_hans`, source paths, parser anchors). Its first run (PF-02 / K-14) found a Simplified chapter title in `citations.json` and the units and processing notes of the classical amounts (`两`, `去节`…), now converted by the builders. Four genuine Traditional characters lie outside Big5-HKSCS — 髎 (次髎) and 瞤 腨 黅 (五運六氣 quotations) — all in the CJK Unified block and present in the system CJK fonts; they are listed in the validator so that a new one has to be looked at.
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

Nothing is `reviewed` or `approved` yet (`reviewed` is set only by the build from valid review records — [content review §5](../docs/content-review.md)). Items that **must** be reviewed before any release: pattern weights and thresholds, formula–pattern mapping and roles,
herb effect / burden weights, pregnancy / interaction / toxicity flags, red-flag lists, dose references and the conflict-rule thresholds
(`safety/rules.json → _meta.clinical_review_required`).

## Known gaps (tracked in the task list)

- English prose is a machine draft (`en_status: machine-draft`) for pattern principles and tongue/pulse notes, formula principles, rationales and cautions, the treatment guidance and the general regimen; it awaits the linguistic review (V-06). The English renderings of the classical quotations are still to do. English herb names are curated for the MVP formula herbs only.
- No Simplified-Chinese output (the UI language set is zh-Hant + en).
- Constitution questionnaire items are not included (licensing; SOP D6).
- Acupoint locations and illustrations, tongue/pulse illustrations: UI task.
- A second-source cross-check of 時方 compositions (Wikisource) and of the Simplified→Traditional conversion of citations.
