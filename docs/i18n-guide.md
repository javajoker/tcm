# Internationalisation, Terminology and Copy Guide

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Status** | Draft — the lint (`scripts/check-i18n.ts`) and the catalogs are specified here, not yet implemented |
| **Last updated** | 2026-10-04 |
| **Audience** | Developers writing UI strings, translators, content reviewers |
| **Related** | [PRD FR-2](PRD.md) · [Tech spec §4.4, §9](tech-spec.md) · [UX spec §9](ux-spec.md) · [KB schema](kb-schema.md) · [`data/glossary.json`](../data/glossary.json) (139 terms, `needs-review`) |

---

## 1. Scope

| Item | Decision |
|---|---|
| UI languages | **Traditional Chinese (`zh-Hant`, Taiwan wording) — default**; **English (`en`)** |
| Not in MVP | Simplified Chinese UI (data is converted *from* Simplified sources; no Simplified output), other languages |
| Fallback | `en` → `zh-Hant` (never the reverse); a fall-back is **marked** in the UI (UX spec §9 rule 7) |
| Default language | `zh-Hant` for everyone, regardless of browser settings. If the browser language is English and the user has not chosen, show a one-time, dismissible "View in English" offer |
| What is localised | UI strings · knowledge-base display text (names, rationale, cautions, messages) · notices (safety policy) · numbers, dates, units |
| What is *not* translated | Classical quotations (shown in original Traditional script; an English rendering is attached and labelled as a translation) · herb Latin names · acupoint WHO codes · Pinyin |
| URL | Language is the first path segment (`/zh-Hant/…`, `/en/…`); `<html lang>` follows it |

---

## 2. Terminology policy

### 2.1 Rules

1. **Glossary first.** Every TCM term used in UI copy or KB prose must exist in `data/glossary.json` (zh-Hant ⇄ en ⇄ pinyin, `domain`, `status`). New copy that needs a new term adds it to the glossary in the same change.
2. **English follows the WHO International Standard Terminologies on Traditional Medicine** (Western Pacific Region, 2007) wherever the term exists there; otherwise the established textbook term (WHO-style, lower-case); otherwise a literal gloss in quotation marks on first use plus pinyin. The chosen source is recorded per glossary row (`source`, to be added).
3. **Every term in the app can be shown as three layers:** Chinese · pinyin (tone marks, syllables separated: *pí qì xū*) · English. The UI shows the layer the user's language needs first and the others on demand (`<Term>` popover, UX spec §5).
4. **Plain language before term.** Questions and explanations are written in everyday words; the TCM term is secondary (UX spec §9 rule 1).
5. **One term, one translation, everywhere.** If two concepts would collide (e.g. 惡寒 *aversion to cold* vs 畏寒 *fear of cold*), the glossary keeps both and the UI uses the precise one.
6. **Do not translate away the concept.** Where English has no equivalent (氣 *qi*, 證 *pattern*), keep the established loan/gloss. Never "energy" for 氣, never "syndrome" alone for 證 (use *pattern*; *syndrome* is allowed only in the WHO phrase "pattern/syndrome" in the glossary).
7. **Neutral on schools.** Where schools differ (e.g. tongue zone assignments, orifice correspondences, 長夏 extent) the data keeps both; copy states which is used and does not present one as the only truth.

### 2.2 English conventions

| Topic | Convention |
|---|---|
| Organs as functional systems | Capitalised to distinguish them from anatomical organs: **Liver, Heart, Spleen, Lung, Kidney, Gallbladder, Small Intestine, Stomach, Large Intestine, Bladder** — used in headings and on first mention in a paragraph; the glossary stores the lower-case WHO form |
| qi, yin, yang, blood, essence | lower-case, no italics (*qi* is not italicised in this app) |
| Pathogenic factors | lower-case: wind, cold, summer-heat, dampness, dryness, fire (heat) |
| Five phases | **Wood, Fire, Earth, Metal, Water** when they denote the phases; lower-case in ordinary use |
| Patterns | Sentence case, WHO wording: *Spleen qi deficiency*, *Liver qi stagnation*; the classical name in parentheses only when helpful |
| Formulas | `Pinyin (English gloss)` — *Sijunzi Tang (Four Gentlemen Decoction)*; pinyin without tone marks inside formula names; Chinese name always available on hover |
| Herbs | Pinyin + Chinese + Latin (pharmaceutical Latin: *Ginseng Radix*) where known; English common name only when unambiguous |
| Books | *Huangdi Neijing (Yellow Emperor's Inner Classic): Suwen / Lingshu*, *Shanghan Lun (Treatise on Cold Damage)*, *Jinkui Yaolue (Essentials of the Golden Cabinet)*, *Nanjing (Classic of Difficulties)*, *Binhu Maixue (Pulse Studies of Binhu)* — Chinese title always shown in citations |
| Numbers/units | `bpm` for heart rate in English; 次/分 in Chinese; metric units; °C |
| Dates | `4 Oct 2026` (en) · `2026年10月4日` (zh-Hant); 24-hour times |

### 2.3 Traditional Chinese (Taiwan) conventions

| Topic | Convention |
|---|---|
| Wording | Taiwan usage: 資料, 使用者, 登入/登出, 軟體, 網路, 預設, 儲存, 設定, 清除, 匯出, 品質; 藥典 refers to the pharmacopoeia in use (Q1) |
| Script of TCM terms | Traditional forms from the data build (OpenCC `s2twp` + 裏→裡, 于→於). **濕 is the form for terms** (濕熱, 痰濕, 濕邪), as in Taiwanese TCM usage. The build normalises 溼 → 濕 in every **non-quotation** field (`common.term()`; fixed in task K-04, enforced by `validate_kb`), so search, matching and the glossary agree. **Classical quotations keep the converted form of the source text** (e.g. 《素問》 「秋傷於溼」), which is why `citations.json` and the 民病 excerpts still contain 溼; a display option may normalise them later |
| Punctuation | Full-width: ，。、；：？！ with corner brackets 「」『』 for quotes and 《》 for book titles; ellipsis ……; no half-width commas in Chinese sentences |
| Mixed script spacing | A space between Han characters and Latin letters or digits in UI copy (「共 12 題」「Spleen」→「脾 (Spleen)」 uses brackets without extra space inside); **not** applied inside classical quotations |
| Numerals | Half-width Arabic digits in UI and data; Chinese numerals only in classical text and fixed expressions (十問歌, 二十四節氣) |
| Tone | Polite and plain; address the reader as **您** consistently (notices, consent text, medical content); no colloquial particles; no emoji |
| Hanzi in the app title and navigation | Short noun phrases (「開始評估」), verbs for actions (「取得結果」) |

### 2.4 Pinyin

Tone marks (*pí*, *wèi*), syllables separated by spaces for terms (*pí qì xū*), proper names capitalised (*Huángdì Nèijīng*). Pinyin is **data** (glossary `pinyin`), not generated at runtime, so tone sandhi and polyphonic characters (e.g. 數 *shuò* in 數脈, 行 *xíng*) are correct. Pinyin shown for a polyphonic character in a term must be reviewed.

---

## 3. Message catalogs (UI strings)

### 3.1 Layout

```
apps/web/src/i18n/
  zh-Hant/{common,intake,inquiry,observe,constitution,report,formula,safety,errors}.json
  en/{… same files …}.json
  keys.generated.ts          # union type of keys (generated from zh-Hant)
```

`zh-Hant` is the **source** catalog (authoring language); `en` mirrors it. Both are flat JSON per namespace: `{ "intake.age.label": "年齡", … }`.

### 3.2 Keys

`namespace.screen.element[.state]`, lower-case, dot-separated, nouns not sentences: `inquiry.card.skip`, `report.panel.offset.primary.title`, `safety.notice.pregnancy.title`. Never derive a key from the English text. Keys are append-only once released; rename = add + migrate + remove after one release.

### 3.3 Messages

- **Parameters:** `{name}` placeholders; the catalogs must use **identical placeholder sets** in both languages.
- **Plurals:** `{ "one": "…", "other": "…" }` objects resolved with `Intl.PluralRules` (zh-Hant needs only `other`; the lint accepts `other`-only for zh).
- **No concatenation:** never assemble sentences from fragments — word order differs between zh and en. Use a parameterised message or a rich-text message.
- **Rich text:** inline emphasis and links use tag placeholders resolved by components: `"說明請見<link>安全政策</link>。"`; tags are matched in both languages. **No HTML** in messages; no `dangerouslySetInnerHTML` anywhere.
- **Context:** the same English word with different meanings gets different keys (e.g. *heat* as a pathogen vs. temperature).
- **Comments for translators:** an optional parallel `*.notes.json` (key → note) holds context, character limits and screenshots; notes are not shipped.
- **Length:** English strings are typically 1.5–2.2× the visual width of the Chinese; components must not truncate. The lint warns above 2.5× or below 0.4×.

### 3.4 Where strings must **not** live

Engine output (message **keys and parameters** only — tech spec §7.2), KB display text (lives in `data/`, already bilingual), classical quotations (in `citations.json`), hard-coded text in components (lint error).

---

## 4. Knowledge-base content

### 4.1 Bilingual fields

Every user-visible KB string is `{ "zh-Hant": …, "en": … }`; `en` may be `null` while untranslated. The UI uses `localized()` (tech spec §4.4), shows the Chinese text with its pinyin where a term is involved, and adds the "中" marker to indicate an untranslated passage.

### 4.2 Translation priority

1. UI strings, notices and disclaimers (blocking for release)
2. Symptom, tongue and pulse names; question prompts
3. Pattern names and short meanings; constitution names
4. Formula names, rationale, cautions; herb display names
5. Acupoint and diet text; safety messages
6. Remaining prose and citations' English renderings

Current state: names are bilingual; formula and pattern prose, treatment text and messages are mostly zh-Hant only ([`data/README.md`](../data/README.md#known-gaps-tracked-in-the-task-list)).

### 4.3 Translation workflow

| Step | Who | Output |
|---|---|---|
| Draft | Machine translation **with the glossary enforced** (terms substituted before/after) or a translator | `en` text, record `en_status: "machine-draft"` |
| Review | A bilingual reviewer (TCM-literate) | `en_status: "reviewed"`, reviewer and date |
| Lint | `check-i18n.ts` | Glossary conformance, forbidden words, placeholder parity |
| Release gate | — | UI strings and notices must be `reviewed`; KB prose may ship as `machine-draft` only if the UI labels it (dev) or the item is hidden (release) |

Classical quotations: the English rendering is the **project's own translation**, labelled "Translation" and "unreviewed" until reviewed; published translations (e.g. Unschuld, Veith) are copyrighted and **must not** be copied.

### 4.4 Glossary file

`data/glossary.json` item: `{ zh-Hant, en, pinyin, domain, status }` plus (to add) `source` (e.g. `WHO-ISTM-2007`, `textbook`, `project`), `alt` (accepted alternative English), `note`. Change control: glossary edits are reviewed like content ([content review](content-review.md)); changing an `en` term triggers the i18n lint over all strings and KB prose that use it.

---

## 5. Forbidden and preferred wording

Enforced for **all user-visible strings in both languages** (UI catalogs, KB display text, notices, citations' commentary — not the classical quotations themselves). The lint maintains the lists in `scripts/i18n-wording.json`.

| Avoid | Why | Prefer (en) | Prefer (zh-Hant) |
|---|---|---|---|
| diagnose, diagnosis (of the app's output), "your diagnosis" | The app is not a diagnostic service | *assessment*, *pattern differentiation (辨證)*, *this pattern is the closest match* | 「評估」「辨證」「最相符的證型」 (not 「診斷結果」) |
| prescribe, prescription, "recommended prescription" | Prescribing is a practitioner's act | *formula traditionally used for…*, *for discussion with a practitioner* | 「傳統上用於…的方劑」「請與中醫師討論」 (not 「處方」「開藥」) |
| cure, treat (as a claim), heal, remedy, "treatment plan" | No treatment/cure claims | *support*, *traditionally used to*, *regulation (調理)* | 「調理」「傳統上用於」 (not 「治癒」「根治」「治療」 as a promise) |
| you have X / you are X | Labels the person | *leans towards*, *is consistent with*, *tendency* | 「傾向於」「與…相符」 (not 「你是…體質」「您患有…」) |
| will, guaranteed, certain, proven | False certainty | *may*, *can*, *traditionally* | 「可能」「傳統上」 (not 「一定」「保證」「必然」「已證實」) |
| destiny, fate, fortune, lucky/unlucky, "your chart says you will" | No fate claims | *birth-based tendency (traditional)* | 「出生資訊的傾向參考」 (not 「命中註定」「運勢」「命格」) |
| dose, amount (outside dev/L3) | Release shows no amounts | *composition*, *proportions* | 「組成」「比例」 |
| natural = safe, "no side effects" | Misleading | state cautions plainly | 「天然無副作用」 is forbidden |
| fear language ("dangerous", "deadly") outside emergency notices | Tone | calm, specific | 「很危險」「致命」 only in emergency notices |

Allowed in **developer-facing** strings and in this documentation. The lint has an `allow` annotation for the rare legitimate use (e.g. quoting a classical sentence or the legal disclaimer) that must be justified in review.

---

## 6. Numbers, dates, formatting

- Use `Intl.NumberFormat` / `Intl.DateTimeFormat` with the active language; never format by hand.
- Panel values: one decimal, with a real minus sign (−) and word bands in prose (UX spec §9 rule 4).
- Percentages: integers; never above 100; never labelled "probability".
- Time zones: IANA names displayed as given (`Asia/Taipei`) plus the offset; birth date/time are shown back to the user as typed.
- Sorting for display uses stable ids, not `localeCompare`; lists of Chinese names keep the data order.

---

## 7. Layout and typography checks

See [UX spec §6.3](ux-spec.md) for fonts. i18n-specific requirements:

- `lang` on `<html>` and on every element whose language differs (classical quotations `lang="zh-Hant"`, pinyin `lang="zh-Latn-pinyin"`, Latin names `lang="la"`).
- No `text-transform: uppercase` on Chinese, no letter-spacing on CJK, no italics for CJK.
- Wrapping: `line-break: strict` and `word-break: normal`; avoid orphaned punctuation at line starts; no manual line breaks inside sentences.
- **Pseudo-localisation:** a dev-only third locale (`en-XA`) expands strings ≈ 40 % with accents and brackets to expose truncation; a `zh-XL` mode repeats long strings. Playwright screenshot checks run in `zh-Hant`, `en` and `en-XA` at 320 px and 1280 px.
- No text inside images; the tongue illustration labels are live text.

---

## 8. Workflow and checks

### 8.1 Adding or changing a string

1. Write the `zh-Hant` message (source) and its key; add the `en` message in the same change (a PR may not leave `en` empty).
2. Run `pnpm check:i18n` — fails on: missing/extra keys, placeholder or tag mismatch, plural-form mismatch, forbidden wording, glossary violations (a term whose zh form appears with a non-glossary English form and vice versa), hard-coded strings in components (via the ESLint rule `no-literal-strings`), unused keys.
3. Medical wording changes (anything in `report`, `formula`, `safety`) need a content reviewer ([content review](content-review.md)).

### 8.2 `check-i18n.ts` rules (specification)

| Rule | Severity |
|---|---|
| Key parity zh-Hant ⇄ en per namespace | error |
| Placeholder, tag and plural-key parity | error |
| Forbidden wording (§5) in either language | error |
| Glossary: a glossary `zh-Hant` term inside a zh string must be rendered with the glossary `en` in the paired en string (checked by term lookup, tolerant of inflection) | warning → error before release |
| Length ratio outside 0.4–2.5 | warning |
| Han–Latin spacing and full-width punctuation in zh strings | warning |
| `en_status` of `machine-draft` for UI/notice strings at release time | error |
| Orphan keys (defined, unused) / missing keys (used, undefined) | error |

### 8.3 Release gate

UI strings, disclaimers and all notices exist in both languages with `reviewed` status; the glossary rows used by them are `reviewed`; the forbidden-wording lint is clean on the release bundle's catalogs and KB prose.

---

## 9. Reference names (current)

| Concept | zh-Hant | English |
|---|---|---|
| Output levels | 僅供學習 · 標準 · 進階 · 完整 | Education only · Standard · Extended · Full |
| Confidence | 高 · 中 · 低 · 資訊不足 | High · Medium · Low · Insufficient information |
| Tiers | A 一般 · B 條件顯示 · C 僅學習 | A general · B conditional · C study only |
| Constitutions (王琦) | 平和質 · 氣虛質 · 陽虛質 · 陰虛質 · 痰濕質 · 濕熱質 · 血瘀質 · 氣鬱質 · 特稟質 | Balanced · Qi deficiency · Yang deficiency · Yin deficiency · Phlegm-dampness · Damp-heat · Blood stasis · Qi stagnation · Special diathesis |
| Roles in a formula | 君 · 臣 · 佐 · 使 | Chief (sovereign) · Deputy (minister) · Assistant · Envoy |
| Complaint modules | 睡眠 · 疲倦乏力 · 消化 · 寒熱汗出 · 頭身疼痛 · 情緒壓力 · 婦女經帶 · 外感初起 | Sleep · Fatigue · Digestion · Cold, heat and sweating · Head and body pain · Mood and stress · Women's cycle · Early external illness |
| Panel | 盤面 | Panel (body panel) |
| Reference panel | 常模 | Reference (personal reference) |
| Primary / secondary offset | 相對平人的偏移 · 相對自身常模的偏移 | Compared with a typical healthy person · Compared with your own usual tendency |

---

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-04 | Initial guide |
