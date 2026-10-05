# Design: Simplified Chinese Interface and Knowledge Variants

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Design for Release A (FR-21; tasks PM-01 … PM-03). Nothing is built |
| **Last updated** | 2026-10-05 |
| **Audience** | Engineers, the Mainland-usage reviewer, whoever checks wording |
| **Related** | [Requirements FR-21](../requirements.md#fr-21-simplified-chinese-interface--release-a--class-l--refines-fr-2-g4-q6) · [i18n guide](../../i18n-guide.md) · [Tech spec §5, §9](../../tech-spec.md) · [Safety policy](../../safety-policy.md) · [Decisions Q6, P7, PD-01, PD-02](../decisions.md) |

> **Summary.** Simplified Chinese is not translated; it is **derived**. The Traditional text stays the only authored Chinese. A build step converts it — using the Simplified source text where the knowledge base was built from one — through a small, reviewed table of overrides, and the build emits a complete Simplified copy of the interface catalogues and of the knowledge chunks. A person who chooses Simplified downloads *that copy instead of* the Traditional one, so the cost of a session does not grow. Everything a reviewer has to read is a short sheet of the places where the converter's choice is not mechanical.

---

## 1. Goal and non-goals

**Goal.** A reader in Simplified-Chinese usage sees the whole product — interface, questions, results, quotations, printouts — in their script and vocabulary, with exactly the same medical content, the same notices and the same engine output.

**Non-goals.** A second source of truth for Chinese text; runtime conversion in the browser; Mainland-specific *content* (other formulas, other patterns); region-specific regulatory wording (that is a region pack, [FR-29](../requirements.md#fr-29-region-packs--release-a--class-l-and-legal--refines-q1-sq1)); Cantonese or other Chinese varieties.

## 2. What exists today

| Fact | Consequence |
|---|---|
| `Lang = "zh-Hant" \| "en"` in `@tcm/i18n`; 101 files mention `zh-Hant` | Adding a member makes the compiler list every place that must decide; nothing is found by grep alone |
| UI text is one catalogue per namespace and language (10 namespaces, `apps/web/src/i18n/*`), merged **statically** in `catalogs.ts`: both languages are in the initial bundle (about 19 KB gzip each) | A third static catalogue would cost +19 KB initial JavaScript. Simplified must load lazily, which makes catalogue loading asynchronous for that language |
| Knowledge-base text appears in several shapes: `{ "zh-Hant", en }` objects, Chinese-only fields with an `_en` twin (`principle`, `principle_en`), `quote_zh_hant`, names in indexes | Any approach that edits fields one by one must know all shapes; the validator already walks every string and knows which keys keep a source script on purpose |
| Citations keep the **Simplified source quotation** (`quote_source_zh_hans`); the release bundle prunes it. Herbs and formula compositions were also built from Simplified sources | For these records the exact Simplified text exists and should be used rather than re-converted |
| The pipeline already depends on OpenCC (`opencc-python-reimplemented`: `s2twp` to make Traditional, `t2s` in the formula builder) | No new dependency: the reverse profile `tw2sp` is in the same package |
| Falls back `en → zh-Hant`, marked in the UI; never the reverse | Simplified falls back to `zh-Hant`, marked; the target is zero fallbacks |
| `/:lang/…`, host `_redirects` and 404 page, `check-release`, the one-time English offer, a two-way language toggle | Each needs a third language |
| Emergency numbers come from the region preference; absent a choice, the data's default (Taiwan) is used | A Mainland reader must not be shown Taiwan numbers by default — a safety change (§7) |

## 3. Options considered

| Option | For | Against | Verdict |
|---|---|---|---|
| **A. Convert in the browser** (a converter library, or a character table) | One build, one set of strings | A library is large and a character table is not enough (see §4); conversions are invisible and unreviewed; runs on every start; a new runtime dependency | Rejected |
| **B. Hand-translate a parallel catalogue and knowledge base** | Idiomatic text | A second authored copy of ≈ 1,000 UI strings and ≈ 5,000 knowledge strings that drifts from the first; review cost multiplies | Rejected |
| **C. Derive at build time, review the exceptions** | One authored source; deterministic; reviewers read only exceptions; no runtime cost | Needs the override table and the review sheet | **Chosen** (PD-01) |

Within C, two ways to ship the derived knowledge text were measured on the release bundle of 2026-10-05:

| Delivery | Size for a Simplified session | Remarks |
|---|---|---|
| Overlay: the converted strings as a map that the loader applies over the Traditional chunks | ≈ **+38 KB gzip** on top of the Traditional chunks (core 21, guidance 5, formulas 4, citations 4, cities 3), plus a merge step in the loader | Needs addressing of every string and a merge that must know every field shape |
| **Variant chunks:** the same chunks with the Chinese strings replaced, selected by language | **≈ 0 extra**: the person downloads the Simplified chunks *instead of* the Traditional ones | No merge logic; the loader only picks a manifest. Costs build output (a second set of hashed files) |

Variant chunks are chosen: the budget cost is nil and the loader stays trivial.

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

So the converter is a very good first draft and **not** a finished translation: the override table (§5) is part of the design, and a human reads the exceptions. A bare character table, as a runtime converter would be, cannot get the phrase-level rows right at all.

## 5. Design

### 5.1 Pipeline

```
data/ (Traditional, canonical)  ─┐
glossary zh-Hans column         ─┤
source Simplified text          ─┼─▶ scripts/i18n/build_hans.py ─▶ data/i18n/zh-Hans.dictionary.json  (committed, deterministic)
hans-overrides.json (reviewed)  ─┤                                  apps/web/src/i18n/zh-Hans/*.json   (committed, generated)
UI catalogues zh-Hant           ─┘                                  review sheet (generated, not committed)

bundle-data.ts: replaces each Chinese string of the pruned chunks by its dictionary entry ─▶ kb/<chunk>.hans.<hash>.json  (+ manifest variant entry)
```

1. **Precedence for a string:** record-specific override → glossary term → phrase override → source Simplified text (when the round trip holds, §5.1.2) → `tw2sp`. The first match wins; the review sheet shows which rule produced each non-mechanical result.
2. **Source text:** where a record carries Simplified source text (citations; herbs and formula compositions from the Pharmacopoeia and the source library), the builder uses it if converting it back with `s2twp` reproduces the committed Traditional string. If it does not, the Traditional string wins, the builder converts it, and the case is logged for the reviewer (the sources differ from what we show).
3. **The dictionary** `data/i18n/zh-Hans.dictionary.json` maps each Traditional string that contains Chinese and sits outside the keys that keep a source script (the same walker and exemptions `validate_kb` uses) to its Simplified form; strings that do not change are left out. It is **keyed by the string itself, not by its position**, so profile pruning, chunking and re-ordering cannot misalign it, and one string is rendered the same wherever it occurs. It is committed, so a reviewer can diff it, and CI regenerates it and fails on a difference, exactly as for `data/`.
4. **Variants:** `bundle-data.ts` replaces every Chinese string of the *pruned* data of the profile by its dictionary entry (so a release variant never contains what a release chunk does not) and fails when a remaining Chinese string still contains a character that has a Simplified form — a missing entry cannot ship. It writes `kb/<chunk>.hans.<hash>.json` with the same shape. The manifest lists the variants; the loader receives the script with the language. `_meta.script` (`"Hant"` or `"Hans"`) is written into every chunk. **Field names do not change** (`"zh-Hant"`, `quote_zh_hant`): they name the schema slot, and `_meta.script` says which script the slot holds; code that depends on the script (term linking, search) reads it.
5. **UI catalogues:** the builder writes `apps/web/src/i18n/zh-Hans/<namespace>.json` from the Traditional catalogues with the same precedence. Parameters (`{name}`), tags (`<b>…</b>`) and plural objects are carried over unchanged and checked.

### 5.2 Override table and glossary

`scripts/i18n/hans-overrides.json` has three sections, each entry with a reason:

| Section | Holds | Example |
|---|---|---|
| `phrases` | Replacements applied before conversion, longest first | 介面 → 界面; 預設 → 默认; 離線 → 离线 |
| `keys` | Exact results for a catalogue key or a knowledge pointer | a title where Mainland usage prefers another word |
| `keep` | Strings or characters that must stay as written | 乾 in a hexagram quotation |

The glossary (`data/glossary.json`) gets a `zh-Hans` column, generated by the same pipeline and then governed like the other columns (`status`, `source`, `note`); the glossary-conformance check of `check-i18n` is extended to it, so a term is rendered the same way everywhere.

**The review sheet** (`pnpm i18n:review-hans`, generated, not committed) lists, for the Mainland-usage reviewer: every string whose `tw2sp` result differs from plain character conversion (the vocabulary-level changes — a few hundred, not thousands), every override with its reason, every source-text mismatch, and every glossary term with its Simplified form. That sheet, not the whole text, is what is reviewed ([content review](../../content-review.md) class L).

### 5.3 Language model and routing

| Piece | Change |
|---|---|
| `@tcm/i18n` | `Lang` gains `"zh-Hans"`; a helper `scriptOf(lang)` (`Hant` for `zh-Hant`, `Hans` for `zh-Hans`, `en` has none); fallback chain `zh-Hans → zh-Hant`, never to `en`, always reported; `Intl` locale `zh-Hans` |
| Routes | `/zh-Hans/…`; aliases `zh-cn`, `zh-hans`, `zh-sg` redirect to it; **`zh` stays `zh-Hant`** (PD-02) so existing links keep their meaning |
| Host files | `LANGUAGE_SEGMENTS` and the redirects gain the segments; the 404 page gets a third link; `check-release` knows them; the pseudo-locales are unaffected |
| `<html lang>` | `zh-Hans`; the document title and the manifest name come from the catalogue |
| Offer | The English offer becomes one **language offer**: first browser language `en…` offers English; `zh-CN`, `zh-SG`, `zh-Hans…` offers Simplified; bare `zh`, `zh-TW`, `zh-HK`, `zh-MO` offer nothing (the default is already right). Shown once, dismissible, never switches silently |
| Language toggle | Three choices in one segmented control, labelled in their own language and script: 繁體中文 · 简体中文 · English; `aria-label`s likewise |

### 5.4 Loading

| Resource | Behaviour |
|---|---|
| Catalogue | `zh-Hant` and `en` stay in the initial bundle as today. `zh-Hans` is a dynamic import of one chunk per language (≈ 19 KB gzip) fetched only when needed; the provider shows the loading state that already exists for the knowledge base until it arrives. Initial JavaScript changes by at most 1 KB (the loader and the tag) |
| Knowledge | The manifest has a `variants["zh-Hans"]` set; `loadKnowledgeBase({ script })` chooses it. Hash verification, caching headers and the lazy chunks are unchanged. Cities and acupoint labels follow the same rule |
| Switching language | Fetches the other variant on demand; the page shows the existing loading state; the draft is untouched (a draft stores ids, not text) |
| Saved results | Store ids and the language they were made in; a result saved in one language opens in each other language (a test), because text is rendered from the knowledge base at view time |
| Offline | The worker precaches the variant of the language in use and fetches the other one when the person switches (offline design, A-21) |

### 5.5 Search and term linking

Names are indexed in **both scripts**: the builder writes each record's Traditional and Simplified names (and aliases) into the search index, so a query in either script finds the record without a converter in the browser. Term linking in running text (`Term.tsx`) uses the script of the loaded data. Pinyin and English are unchanged.

### 5.6 Typography

`:lang(zh-Hans)` selects a Simplified system font stack (PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, then `sans-serif`); no web fonts, as decided in TQ8. The `lang` attribute also makes the browser choose the regional glyph forms of characters that differ (for example 骨, 直, 刃). The glyph audit of PF-02 is re-run on the Simplified text.

## 6. Checks

| Check | Fails the build when |
|---|---|
| Key coverage and parameters | A key, placeholder, tag or plural form of `zh-Hant` is missing or different in `zh-Hans` |
| No fallback | Any message or knowledge string would fall back |
| **Purity** | A character that has a Simplified form (`t2s(c) ≠ c`) appears in Simplified text outside the `keep` list — the mirror of the existing rule that Simplified forms must not appear in Traditional fields |
| Glossary | A glossary term appears in Simplified text in a form other than the glossary's `zh-Hans` |
| Forbidden wording | The forbidden-wording list is converted by the same pipeline and applied to the Simplified text |
| Freshness | The committed dictionary or catalogues differ from what the builder produces |
| Equality | The engine output (patterns, formulas, notices, levels) differs between languages for the typical patients and the vignettes |
| Known answers | A table of conversions with their expected results (§4, the 乾薑/乾坤 cases) changes |

End-to-end: scenarios E1 and E5 and the cross-browser set run in `zh-Hans`; visual baselines for the 14 key screens are made on CI like the others; axe runs in `zh-Hans` in light and dark.

## 7. Safety, review and rollout

- **No silent Taiwan numbers.** With the interface in Simplified Chinese and no region chosen, the emergency component shows the generic line ("call your local emergency number") and a region choice, not the data's default. The safety policy (§ emergency resources) is amended in the same commit (region packs, design A-23).
- **The notices are the highest-risk text.** Their Simplified form goes through the legal review that the Traditional form needs (SQ6) and the linguistic review (class L). Until both are recorded, a build offering `zh-Hans` carries the draft label, like every other draft content.
- **Mainland regulation differs.** Nothing in the interface or the knowledge base changes by language, and the product claims no clinical function; whether offering it to the Mainland is acceptable is a legal question, not an engineering one (roadmap §9).
- **Rollout:** build and test behind the existing draft label; add the language to the toggle only when the checks are green; the public offer waits for the reviews.

## 8. Decided defaults

**Decided 2026-10-05 — post-MVP default, revisit at the start of Release A.**

| Question | Default |
|---|---|
| Name of the app in Simplified | 中医自我评估 (the converted name), from the same i18n key |
| Quotations in the Simplified interface | Shown in Simplified, taken from the Simplified source text; the citation sheet still says which source text it is |
| Register | 您, as in Traditional |
| Does the language imply a region? | No (PD-02, FR-29) |
| Where the converter and a Mainland reviewer disagree | The reviewer's form goes into `hans-overrides.json` with a reason; the sheet shows it from then on |

## 9. Tasks

PM-01 (pipeline, dictionary, variants, glossary column, review sheet), PM-02 (language model, routes, host files, offer, toggle, fonts, region behaviour), PM-03 (checks, equality test, visual and axe) — [`TASKS.md`](../../../TASKS.md).

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-05 | Initial design; delivery by variant chunks chosen over an overlay on measured sizes |
