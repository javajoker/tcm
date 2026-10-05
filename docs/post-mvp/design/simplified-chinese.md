# Design: Simplified Chinese Interface and Display Dictionary

| | |
|---|---|
| **Version** | 0.2 (draft) |
| **Status** | Design for Release A (FR-21; tasks PM-01 … PM-03). Revised during PM-01: the first version converted the data; that was unsafe (§3) |
| **Last updated** | 2026-10-05 |
| **Audience** | Engineers, the Mainland-usage reviewer, whoever checks wording |
| **Related** | [Requirements FR-21](../requirements.md#fr-21-simplified-chinese-interface--release-a--class-l--refines-fr-2-g4-q6) · [i18n guide](../../i18n-guide.md) · [Tech spec §5, §9](../../tech-spec.md) · [Safety policy](../../safety-policy.md) · [Decisions Q6, P7, PD-01, PD-02](../decisions.md) |

> **Summary.** Simplified Chinese is not translated; it is **derived**, and it is derived **only for display**. The Traditional data stays the single source of truth and is what the engine and every safety rule always run on. A build step converts every Chinese string of the knowledge base — using the Simplified source text where the data was built from one — through a reviewed table of overrides, and the web app converts a string **at the moment it is shown**. The converted strings travel as one small lazy file, and the interface catalogues are generated the same way. An identifier is never converted, so the output of the engine cannot depend on the language. Everything a reviewer has to read is a short sheet of the places where the converter's choice is not mechanical.

---

## 1. Goal and non-goals

**Goal.** A reader in Simplified-Chinese usage sees the whole product — interface, questions, results, quotations, printouts — in their script and vocabulary, with exactly the same medical content, the same notices and the same engine output.

**Non-goals.** A second source of truth for Chinese text; runtime conversion by algorithm in the browser; converting the data the engine runs on; Mainland-specific *content*; region-specific regulatory wording (that is a region pack, [FR-29](../requirements.md#fr-29-region-packs--release-a--class-l-and-legal--refines-q1-sq1)); other Chinese varieties.

## 2. What exists today

| Fact | Consequence |
|---|---|
| `Lang = "zh-Hant" \| "en"` in `@tcm/i18n`; 101 files mention `zh-Hant` | Adding a member makes the compiler list every place that must decide |
| UI text is one catalogue per namespace and language (10 namespaces), merged **statically** in `catalogs.ts`: both languages are in the initial bundle (about 19 KB gzip each) | A third static catalogue would cost +19 KB initial JavaScript. Simplified must load lazily |
| **Chinese strings in the data are not all prose.** Of 290 distinct data paths that hold Chinese, most of the wuxing tables, the panel schema, the herb records' organs, flavours and natures, the formula roles 君臣佐使, the stems and branches, and the safety rules' herb lists are **identifiers the engine matches by value** (`腎`, `濕`, `君`, the 十八反 and 十九畏 pairs …); code also keys tables by Traditional characters (`ELEMENT_SLUG`, `ORGAN_SLUG`) | A converted copy of the data would change what the engine and the safety rules match. It must never be the input of the engine |
| Display strings are read in about 100 places of the web app: 46 `localized(…)` calls, about 21 direct `["zh-Hant"]` reads and about 25 reads of Chinese-only prose fields (`principle`, `rationale_zh`, `book`, `chapter`, `quote_zh_hant` …) | The display boundary is a bounded, auditable set of call sites |
| Citations keep the **Simplified source quotation** (`quote_source_zh_hans`); the release bundle prunes it. Herbs and formula compositions were also built from Simplified sources | The exact Simplified text exists for these and is used rather than re-converted; it is needed at build time only |
| The pipeline already depends on OpenCC (`opencc-python-reimplemented`: `s2twp` to make Traditional, `t2s` in the formula builder) | No new dependency: `tw2sp` is in the same package |
| `en` falls back to `zh-Hant`, marked; never the reverse | Simplified falls back to `zh-Hant`, marked; the target is zero fallbacks |
| The knowledge provider loads one knowledge base for the whole app, above the language routes | It must learn the script and load the display dictionary with it |
| Emergency numbers come from the region preference; absent a choice, Taiwan's are used | A Mainland reader must not be shown Taiwan's numbers by default: handled by the [region design](tap-tempo-and-regions.md) for every language |

## 3. Options considered

| Option | For | Against | Verdict |
|---|---|---|---|
| **A. Convert in the browser** with a library or a character table | One build | Large, or too crude (§4), unreviewed, new runtime dependency | Rejected |
| **B. Hand-translate a parallel catalogue and knowledge base** | Idiomatic text | A second authored copy that drifts; review cost multiplies | Rejected |
| **C1. Convert the data at build time and ship variant chunks that the engine reads** | Zero extra bytes (the Simplified chunks replace the Traditional ones) | **Unsafe.** The engine and the safety rules match Chinese identifiers by value; the variant would have to leave the identifiers alone while converting prose, so correctness would rest on a hand-made classification of 290 data paths — and a mistake could silently disable a safety rule in one language. (The first version of this design chose C1; building it showed the data, §2) | **Rejected** |
| **C2. Derive at build time, convert at display** | The engine and the safety rules always see the canonical data; language cannot change an output; the only risk is a Traditional string left on screen, which is visible and testable | The converted strings are an extra download; about 100 display sites call a function | **Chosen** (PD-01) |

Within C2, two encodings of the converted strings were measured on the release bundle of 2026-10-05 (2,660 unique Chinese strings, 1,744 of which change):

| Encoding | Size, gzip | Remarks |
|---|---|---|
| Key-value map (`{ traditional: simplified }`) | 40.5 KB | Simple; stores each string twice |
| **Aligned list** (the Simplified strings, in the sorted order of the unique Traditional strings that the client already holds; unchanged strings as empty lines) | **23.6 KB** | The client rebuilds the same sorted list from the chunks it loaded; a digest in the manifest makes a mismatch fail safe (no conversion, flagged) instead of misaligning |

The aligned list is chosen. A Simplified session therefore costs the Traditional session plus about **24 KB** (the list) plus about **19 KB** (the catalogue), lazily and only for those who choose Simplified; the library waves grow the list in proportion.

## 4. Conversion: what a converter gets right and wrong

Measured with the OpenCC profile `tw2sp` (Taiwan Traditional to Simplified with Mainland phrases):

| Traditional | `tw2sp` | Mainland interface or TCM usage | Verdict |
|---|---|---|---|
| 設定 · 儲存 · 資料 · 列印 · 匯出 · 匯入 · 搜尋 · 訊息 | 设置 · 保存 · 数据 · 打印 · 导出 · 导入 · 搜索 · 消息 | the same | Correct |
| 乾薑 · 炮製 · 五臟 · 痠痛 · 表裡 · 鬱結 · 瀉下 · 濕熱 · 附著 | 干姜 · 炮制 · 五脏 · 酸痛 · 表里 · 郁结 · 泻下 · 湿热 · 附着 | the same | Correct |
| 乾坤 | 乾坤 | 乾坤 (the hexagram name keeps 乾) | Correct (context-aware) |
| **介面** | 接口 | **界面** (接口 means an API) | **Wrong** |
| **預設** | 缺省 | **默认** | Unusual in an app |
| **離線** | 脱机 | **离线** | Dated |
| 螢幕 · 軟體 · 程式 | 屏幕 · 软件 · 程序 | the same | Correct |

The converter is a very good first draft and **not** a finished translation: the override table (§5.2) is part of the design and a human reads the exceptions.

## 5. Design

### 5.1 Pipeline

```
data/ (Traditional, canonical) ──┐
source Simplified text           ─┤
hans-overrides.json (reviewed)   ─┼─▶ scripts/i18n/build_hans.py ─▶ scripts/i18n/zh-Hans.dictionary.json (committed, deterministic)
UI catalogues zh-Hant            ─┘                                  apps/web/src/i18n/zh-Hans/*.json    (committed, generated)
                                                                      review sheet                       (generated, not committed)

bundle-data.ts: for the pruned chunks of a profile, the sorted unique Chinese strings ─▶ kb/hans.<hash>.json  (aligned list)
                + manifest.variants["zh-Hans"] = { file, sha256, strings, digest }
```

1. **Precedence for a string:** exact override → phrase override → source Simplified text (when the round trip holds, step 2) → `tw2sp`. The review sheet shows which rule produced each non-mechanical result.
2. **Source text:** where a record carries Simplified source text (the citations; herbs and formula compositions from the Pharmacopoeia and the source library), the builder uses it if converting it back with `s2twp` reproduces the committed Traditional string. If not, the Traditional string wins, it is converted, and the case is logged for the reviewer.
3. **Phrase overrides** are applied by splitting the string on the override keys (longest first), converting the remaining segments and inserting the override values as written.
4. **The dictionary** `scripts/i18n/zh-Hans.dictionary.json` maps every Traditional string that contains Chinese anywhere in `data/` — values and keys, prose and identifiers alike (an identifier is only converted if something *displays* it) — to its Simplified form; strings that do not change are left out. It is keyed by the string itself, so profile pruning, chunking and re-ordering cannot misalign it. It lives next to its builder, not under `data/` (which is the schema-governed knowledge base the engine reads), is committed so a reviewer can diff it, and CI regenerates it and fails on a difference, exactly as for `data/`. Every Chinese string of `data/` has an entry, with the identity as the value where nothing changes or the field keeps a source script, so the bundler can require complete coverage.
5. **The aligned list** is built by the bundler from the chunks of the profile it is bundling: it collects the unique Chinese strings (values and keys), sorts them with one shared function (UTF-16 code-unit order, implemented once in `@tcm/kb` and used by both sides), writes the Simplified form of each (empty when unchanged) one per line, and records the string count and a SHA-256 of the sorted Traditional list in the manifest. A string absent from the dictionary and not unchanged-by-design is a **build error**: a Chinese string with a Simplified form that the dictionary lacks cannot ship.
6. **UI catalogues:** the builder writes `apps/web/src/i18n/zh-Hans/<namespace>.json` from the Traditional catalogues with the same precedence. Parameters (`{name}`), tags (`<b>…</b>`) and plural objects are carried over unchanged and checked.

### 5.2 Override table

`scripts/i18n/hans-overrides.json`, each entry with a reason:

| Section | Holds | Example |
|---|---|---|
| `phrases` | Replacements applied before conversion, longest first | 介面 → 界面; 預設 → 默认; 離線 → 离线; 資料 → 资料 |
| `exact` | The exact result for a whole string | A title where Mainland usage prefers another word |
| `keys` | The exact value of one interface message, by key | `common.lang.name.zh-Hant` stays 繁體中文 in every language |
| `keep` | Strings that must stay as written | The name of the Traditional option |

**The review sheet** (`pnpm i18n:review-hans`, generated, not committed) lists, for the Mainland-usage reviewer: every string whose `tw2sp` result differs from plain character conversion (the vocabulary-level changes — a few hundred, not thousands), every override with its reason, every source-text mismatch, and every glossary term with its Simplified form. That sheet, not the whole text, is what is reviewed ([content review](../../content-review.md) class L). The glossary conformance check of `check-i18n` is extended: a glossary term appears in Simplified text only in the form the dictionary gives it.

### 5.3 Language model and routes

| Piece | Change |
|---|---|
| `@tcm/i18n` | `Lang` gains `"zh-Hans"`; `scriptOf(lang)` (`Hant` for `zh-Hant` and `en`, `Hans` for `zh-Hans`); fallback chain `zh-Hans → zh-Hant`, never to `en`, always reported; `Intl` locale `zh-Hans`. The instance gets **`t.zh(text)`**: the identity for `zh-Hant` and `en` (the English interface shows Chinese terms in Traditional), the dictionary lookup for `zh-Hans`; `localized(v)` applies it |
| Routes | `/zh-Hans/…`; aliases `zh-cn`, `zh-hans`, `zh-sg` redirect to it; **`zh` stays `zh-Hant`** (PD-02) |
| Host files | `LANGUAGE_SEGMENTS` and the redirects gain the segments; the 404 page gets a third link; `check-release` knows them |
| `<html lang>` | `zh-Hans` |
| Offer | The English offer becomes one **language offer**: first browser language `en…` offers English; `zh-CN`, `zh-SG`, `zh-Hans…` offers Simplified; bare `zh`, `zh-TW`, `zh-HK`, `zh-MO` offer nothing. Once, dismissible, never switches silently |
| Language toggle | Three choices, each labelled in its own script: 繁體中文 · 简体中文 · English |

### 5.4 Loading

| Resource | Behaviour |
|---|---|
| Catalogue | `zh-Hant` and `en` stay in the initial bundle. `zh-Hans` is a dynamic import (≈ 19 KB gzip) fetched only when needed, behind the loading state that exists for the knowledge base. Initial JavaScript changes by at most 1 KB |
| Knowledge | **Unchanged for every language**: the same chunks, the same engine input. For `zh-Hans` the loader additionally fetches the aligned list named in the manifest, verifies its hash, rebuilds the sorted Traditional list from the loaded chunks, checks its digest and builds the lookup. A failure of any step leaves `t.zh` as the identity and **reports the fallback**; the person sees Traditional text, never a broken page |
| Switching language | Fetches what the new language needs on demand; the draft is untouched (it stores ids) |
| Saved results | Store ids and the language they were made in; a result opens in every language, because text is rendered from the knowledge base at view time |
| Offline | The worker precaches the list with the other knowledge files when the person uses Simplified ([offline design](offline-and-install.md)) |

### 5.5 Display sites

Every place that shows a Chinese string from the data calls `t.zh` (or `localized`, which does): the result sections, the inquiry and observation screens, the citations and sources, the formula, point and food pages, the history and compare screens, the practitioner summary, the print view. Strings built from several data strings convert **each piece**, never the joined text. Identifiers that are also shown (a food name that keys the guidance table) are converted for display only; the identifier stays what it was. The set of sites is audited once, and the checks of §6 keep it honest.

### 5.6 Search and term linking

The glossary lookup, the herb index and the city list keep their Traditional keys (they are identifiers); the city list's `alt_hans` already carries Simplified spellings for search. Names are searched in both scripts without a converter: where a Simplified form is needed as a key it comes from the dictionary the session already holds, and the [knowledge-browser design](knowledge-browser.md) builds its index with both forms.

### 5.7 Typography

`:lang(zh-Hans)` selects a Simplified system font stack (PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, then `sans-serif`); no web fonts (TQ8). The `lang` attribute also makes the browser choose regional glyph forms (骨, 直, 刃). Elements that show converted text carry `lang="zh-Hans"`. The glyph audit of PF-02 is re-run on the Simplified text.

## 6. Checks

| Check | Fails the build or the test when |
|---|---|
| Key coverage and parameters | A key, placeholder, tag or plural form of `zh-Hant` is missing or different in the `zh-Hans` catalogue |
| Dictionary coverage | A Chinese string of a profile's chunks contains a character with a Simplified form and has no dictionary entry |
| **Purity of the catalogue and of the dictionary** | A character that has a Simplified form (`t2s(c) ≠ c`) appears in a Simplified value outside the `keep` list — the mirror of the existing rule that Simplified forms must not appear in Traditional fields |
| **Purity on screen** | The text rendered by any screen in `zh-Hans` (the jsdom sweep over the routes, and the real-browser scenarios) contains a Traditional-only character outside `keep` and outside the quoted source script: this is the check that finds a display site that forgot `t.zh` |
| No fallback | A message or a knowledge string falls back in a scenario that completes |
| Glossary | A glossary term appears in Simplified text in a form other than the dictionary's |
| Forbidden wording | The forbidden-wording list is converted by the same pipeline and applied to the Simplified catalogue |
| Freshness | The committed dictionary or catalogues differ from what the builder produces |
| Equality | The engine output differs between languages for the typical patients and the vignettes — **true by construction** (the engine's input is the same), and kept as a test so that it stays true |
| Known answers | A table of conversions with their expected results (§4, 乾薑 and 乾坤) changes; the alignment round trip (every Chinese string of the chunks maps to the converter's result) breaks |

End to end: scenarios E1 and E5 and the cross-browser set run in `zh-Hans`; visual baselines for the 14 key screens are made on CI like the others; axe runs in `zh-Hans` in light and dark.

## 7. Safety, review and rollout

- **The engine never sees Simplified.** This is the central safety property: language cannot change a notice, a level, a pattern, a formula or a suppressed item, because none of them is computed from converted text.
- **The language never selects emergency numbers.** The [region-pack design](tap-tempo-and-regions.md) removes the silent default for every language.
- **The notices are the highest-risk text.** Their Simplified form goes through the legal review that the Traditional form needs (SQ6) and the linguistic review (class L). Until both are recorded, a build offering `zh-Hans` carries the draft label.
- **Mainland regulation differs.** Nothing in the interface or the knowledge base changes by language, and the product claims no clinical function; whether offering it to the Mainland is acceptable is a legal question (roadmap §9).
- **Rollout:** build and test behind the draft label; add the language to the toggle when the checks are green; the public offer waits for the reviews.

## 8. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release A.**

| Question | Default |
|---|---|
| Name of the app in Simplified | 中医自我评估 (the converted name), from the same i18n key |
| Quotations in the Simplified interface | Shown in Simplified, taken from the Simplified source text; the citation sheet still says which source text it is |
| Register | 您, as in Traditional |
| Does the language imply a region? | No (PD-02, FR-29) |
| English interface and Chinese terms | Traditional, as today |
| Where the converter and a Mainland reviewer disagree | The reviewer's form goes into `hans-overrides.json` with a reason |

## 9. Tasks

PM-01 (converter, overrides, dictionary, generated catalogues, aligned list in the bundler and loader, review sheet), PM-02 (language model, `t.zh` at the display sites, routes, host files, offer, toggle, fonts), PM-03 (checks, purity sweep, equality test, end-to-end, visual and axe) — [`TASKS.md`](../../../TASKS.md).

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design; delivery by Simplified variants of the knowledge chunks |
| 0.2 | 2026-10-05 | Revised while building PM-01: variants of the data rejected because the engine and the safety rules match Chinese identifiers by value (290 data paths hold Chinese; most tables are identifiers); the strings are now converted at display, delivered as an aligned list (23.6 KB gzip, measured) with a digest check |
