# Safety Policy

| | |
|---|---|
| **Version** | 0.5 (draft) |
| **Status** | Draft — **all clinical content and wording require physician, pharmacy and legal review before any public release** ([content review](content-review.md)) |
| **Last updated** | 2026-10-04 |
| **Audience** | Developers, content reviewers, whoever answers user reports |
| **Owns** | Notice **wording and triggers**, the safety-filter semantics, emergency resources, claim limits, incident handling |
| **Related** | [SOP §0.2, §2, §13](diagnosis-sop.zh-TW.md) (logic) · [`data/config/scope-profiles.json`](../data/config/scope-profiles.json) · [`data/safety/rules.json`](../data/safety/rules.json) · [`data/diagnosis/red-flags.json`](../data/diagnosis/red-flags.json) · [Tech spec §6](tech-spec.md) · [UX spec §4.3, §10](ux-spec.md) · [Privacy](privacy.md) |

---

## 1. Principles

1. **Educational reference, not medical care.** The app never says it diagnoses, treats, cures or prescribes (wording rules in the [i18n guide §5](i18n-guide.md)).
2. **Notice, then continue.** A risky population or condition always produces a clear "see a doctor" notice that the user acknowledges. **The flow then continues**; only the output level differs. There are no dead ends and no silent stops.
3. **Restricted by default, open in development.** `release` limits output; `dev` opens everything — but `dev` **still shows and requires acknowledgement of every blocking notice** (PRD FR-4, FR-17).
4. **Nothing disappears silently.** Anything the safety filter removes or downgrades is listed with its reason (and, in dev, its rule id).
5. **Conservative on doubt.** Missing or uncheckable information (an unrecognised medication, an unknown allergen, low confidence) restricts rather than relaxes.
6. **Specific and calm.** Notices name the reason, say what to do next and what the app will still do. No alarm language outside emergencies.
7. **Defence in depth.** Policy at the producer (the engine omits what it may not show), data pruning at build (restricted content is not shipped), CI assertions on the built bundle ([tech spec §6.3](tech-spec.md)).

---

## 2. Who gets what

### 2.1 Populations, conditions, states

Source of truth: `data/config/scope-profiles.json`. Effective level = the **most restrictive** matched cell, then capped by feature flags; effective notice = the **most severe** matched.

| Dimension | Key | Trigger (input) | Notice | `release` level | `dev` level |
|---|---|---|---|---|---|
| Population | `adult` | 18–64 | none | L1 | L3 |
| | `elderly_65_plus` | age ≥ 65 | inline | L1 | L3 |
| | `minor_under_18` | age < 18 | **blocking** | L0 | L3 |
| | `pregnant` | pregnant **or possibly pregnant** | **blocking** | L0 | L3 |
| | `lactating` | breastfeeding | **blocking** | L0 | L3 |
| Condition | `red_flag_A` | any A item | **blocking (emergency)** | L0 | L3 |
| | `red_flag_B` | any B item | **blocking** | L0 | L3 |
| | `serious_chronic_disease` | listed conditions (kidney failure/dialysis, cirrhosis, cancer treatment, transplant, severe psychiatric illness, severe heart/lung disease) | **blocking** | L0 | L3 |
| | `on_anticoagulant` | anticoagulant/antiplatelet in medication list | inline | L1 (interacting items suppressed) | L3 (annotated) |
| | `on_other_interacting_medication` | any other listed class | inline | L1 | L3 |
| | `allergy_match` | candidate contains a listed allergen | inline | L1 (matching items suppressed) | L3 (annotated) |
| | `acute_external_symptoms` | acute fever/aversion-to-cold pattern in findings | inline | L1 | L3 |
| State | `low_confidence` / `insufficient_information` | engine, after step 9 | inline | **L0** | L3 |
| | `conflicting_data` | engine, contradictory answers | inline | L1 | L3 |

Output levels: **L0** education only · **L1** + diet, safe acupressure points, tier-A formulas without dose · **L2** + tier-B formulas, modification suggestions, herb weights · **L3** + tier-C (study only), proportions and reference amounts.

### 2.1b Learners and practitioners (PM-53; prescription model §7.4)

A reader may declare that they study Chinese medicine or practise it. The role is a **declaration with an attestation** (N-ROLE, §4.1), never a verification: the app has no accounts. For such a reader the release profile is raised for an **adult** (and an adult over 65) to **L3** — amounts, the classical 加減, the medication plan and its reasons — and **nothing else changes**: minors, pregnancy, breastfeeding, the red flags, serious chronic disease, the medicine and allergy conditions, the states and the safety enforcement stay as the release profile has them, so their notices and levels are every role's (`check-release` rule 18). A public build serves the roles only once the L2 and L3 content is reviewed (content review §7).

### 2.2 Inputs the app must collect to apply this

| Input | Required | Notes |
|---|---|---|
| Age | ★ | Drives minor/elderly |
| Sex at birth, pregnancy status (female of child-bearing age), breastfeeding | ★ | "Possibly pregnant" is treated as pregnant |
| Medications | ★ (may answer "none") | Picked by **class** with examples (below); free text is allowed but only classes are checked |
| Allergies | ★ (may answer "none") | Picker over the herbs/foods the KB can output + free text; free text is matched against names and aliases (Traditional, English, Latin) **whichever Chinese script it was typed in**: the rule folds both the entry and the name to one script with a character table generated from the names themselves (`safety/name-fold.json`, [kb-schema](kb-schema.md)), so 人参 and 人參 are the same name in every session. The names an allergy can match are the herb records' names and aliases, the names a formula itself uses for its herbs (芍藥 where the record says 白芍) and the food names. Folding can only make two names look alike, never tell two apart, so it can only add matches. In a Simplified-Chinese session what is picked or typed is also turned back into the data's string before it is stored when it names exactly one thing the data knows (so 人参 is stored as 人參): a second line that keeps the stored text, the practitioner summary and an exported copy in the data's own script. Text that names nothing the data knows is kept as typed and reported as unmatched (N-ALLERGY-UNKNOWN) |
| Chronic conditions | ★ (may answer "none") | The "serious" group maps to `serious_chronic_disease` |
| Red-flag answers | ★ | Yes / No for every item; "not sure" is treated as **yes** for A and B (shown as "unsure" in the notice) |

**Medication classes** offered (examples are drug classes, not endorsements): anticoagulant/antiplatelet (e.g. warfarin, DOACs, aspirin, clopidogrel) · antidiabetic (insulin, metformin, sulfonylureas…) · antihypertensive · diuretic · cardiac glycoside (digoxin) · immunosuppressant · sedative/hypnotic/anxiolytic · MAOI or stimulant · other. Anything entered as "other"/free text raises `on_other_interacting_medication` with the message *"We can only check the classes listed; please ask your doctor or pharmacist about this medicine."* — it is never silently treated as safe.

---

## 3. Red-flag lists (draft — physician review required)

Source: `data/diagnosis/red-flags.json` (28 items). Reproduced for review; the data file is authoritative.

**A — Emergency (blocking, emergency style)** — chest pain/pressure with cold sweat · severe difficulty breathing · altered consciousness or fainting · sudden one-sided weakness, facial droop or slurred speech · heavy bleeding, vomiting blood, black or bloody stools · sudden worst-ever headache · seizure · severe allergic reaction (throat tightness, generalised hives with breathing difficulty) · thoughts of harming self or others.

**B — See a doctor within 24 hours (blocking)** — fever ≥ 39 °C or lasting > 3 days · persistent vomiting or dehydration · severe abdominal pain · unexplained rapid weight loss · blood in urine · new lump · jaundice · coughing blood · sudden change in vision · new palpitations with an irregular pulse.

**C — Outside the intended scope (blocking; level per profile)** — under 18 · pregnant · breastfeeding · under cancer treatment · dialysis or kidney failure · cirrhosis or severe liver disease · organ transplant recipient · severe psychiatric illness · diagnosed severe heart or lung disease.

Rules: C items are mostly pre-filled from the profile and shown for confirmation. A positive A or B item **cannot be un-set later in the same assessment without an explicit "I made a mistake" action** (it is recorded). The *self-harm* item additionally shows the region's crisis line (§5). Review focuses on completeness, wording in plain language, and the A/B boundary ([content review](content-review.md) §3).

**During AI help's conversation** (Release F, development builds only; [design §4](post-mvp/design/ai-assisted-intake.md#4-safety), PM-47). The screening stays deterministic and first. What a person types is checked **on the device, before it is sent**, against a list of words per item (`data/safety/red-flag-terms.json`, draft — reviewed like this list, by a physician and a second reviewer): a level-A or -B item they answered *no* is asked again — the message is not sent, the screening says why and the words wait; an item answered *yes* or *not sure* has raised its notice already and stays; a level-C match (pregnancy, breastfeeding, chemotherapy, dialysis …) is sent and the person is asked to check the profile, on which the safety filter depends. Negations are not read ("no chest pain" asks again): the list errs on the side of asking. The model's own flag can only raise: every A or B item answered *no* is asked again. Each item is re-opened once per conversation. A test keeps every item findable by its own words in three languages, and the app's own words for ordinary complaints finding none.

---

## 4. Notice catalogue (draft wording)

Notices use **您**; copy is calm and specific; `{reason}` is the user's own matched item(s). All strings live in the `safety` catalog namespace in both languages; texts below are drafts for physician, linguistic and legal review. Negated forms of otherwise forbidden words ("cannot diagnose") are intentional and allow-listed for these string ids.

**Structure of a blocking notice:** title (what to do) → what you told us → what to do now → what the app will still do → *acknowledge* + secondary action.

### 4.1 Blocking notices

| Id | Trigger | zh-Hant | English |
|---|---|---|---|
| **N-A** (emergency) | any A red flag | **請立即尋求緊急協助**<br>您勾選了「{reason}」。這可能是需要馬上處理的情況。請立刻撥打 {emergency_number}，或請身邊的人陪您前往最近的急診。本應用程式無法判斷緊急狀況，也不能代替緊急醫療。您可以繼續閱讀一般的教育內容，但顯示的內容會受到限制。 | **Please get emergency help now**<br>You selected "{reason}". This can be a situation that needs urgent attention. Please call {emergency_number} now, or ask someone to take you to the nearest emergency department. This app cannot judge emergencies and does not replace emergency care. You can continue to read general educational content, but what is shown will be limited. |
| **N-B** (24 h) | any B red flag (not A) | **請盡快就醫（24 小時內）**<br>您提到「{reason}」。這類情況建議在 24 小時內由醫師評估，請不要等待或自行用藥。您可以繼續使用本應用程式了解一般資訊，部分內容不會顯示。 | **Please see a doctor soon (within 24 hours)**<br>You mentioned "{reason}". Situations like this should be assessed by a doctor within 24 hours; please do not wait or self-medicate. You can keep using the app for general information, but some content will not be shown. |
| **N-MINOR** | age < 18 | **建議由兒科或中醫師評估**<br>兒童與青少年的體質和用藥與成人不同，本應用程式的內容以成人為對象。請由兒科醫師或合格中醫師評估。您仍可繼續閱讀教育內容，部分建議不會顯示。 | **Please have a pediatrician or licensed practitioner assess this**<br>Children and teenagers differ from adults in constitution and in how medicines act, and this app is designed for adults. Please have a pediatrician or a licensed practitioner assess this. You can continue to read educational content; some suggestions will not be shown. |
| **N-PREG** | pregnant / possibly pregnant | **懷孕期間請先諮詢醫師**<br>懷孕期間許多中藥與穴位按壓需要避開，請先諮詢您的產科醫師和合格中醫師。您可以繼續閱讀溫和的生活與飲食資訊，其餘內容不會顯示。 | **Please talk to your doctor first during pregnancy**<br>Many herbs and acupressure points should be avoided in pregnancy; please consult your obstetric doctor and a licensed practitioner first. You can continue with gentle lifestyle and diet information; other content will not be shown. |
| **N-LACT** | breastfeeding | **哺乳期請先諮詢醫師**<br>部分中藥成分可能經乳汁影響嬰兒。請先諮詢醫師或合格中醫師；您可以繼續閱讀溫和的生活與飲食資訊。 | **Please talk to your doctor first while breastfeeding**<br>Some herbal ingredients may pass to the baby through milk. Please consult a doctor or licensed practitioner first; you can continue with gentle lifestyle and diet information. |
| **N-SERIOUS** | serious chronic disease | **您的疾病需要由醫療團隊主導**<br>您提到「{reason}」。這類疾病的處理應由您的醫療團隊決定，本應用程式不能代替，也不會提供方劑。您可以繼續閱讀教育內容。 | **Your medical team should lead on this**<br>You mentioned "{reason}". Care for conditions like this should be decided by your medical team; this app cannot replace it and will not offer formulas. You can continue to read educational content. |
| **N-ROLE** (attestation) | choosing the learner or practitioner role (PM-53) | **供學習與臨床參考**<br>方劑的份量、加減與用藥方案，是依古籍與規則整理的學習和臨床參考，尚未經醫師審閱。用於任何人之前，須由合格的醫師親自診察後決定；請勿據此自行用藥或給他人用藥。懷孕、哺乳、兒童、紅旗症狀與重大疾病的提醒與限制，對每一種身分都一樣適用。 | **For study and clinical reference**<br>The formulas' quantities, modifications and medication plans are study and clinical references put together from the classics and by rules, not yet reviewed by a practitioner. Before any of it is used for anyone, a licensed practitioner examines the person and decides; do not take or give medicine on its strength. The notices and limits for pregnancy, breastfeeding, children, red flags and serious illness apply to every role alike. |

Buttons: **我已了解，繼續** / *I understand — continue* (primary, one deliberate action) · **顯示緊急聯絡電話** / *Show emergency numbers* (secondary, N-A/N-B). Multiple matches are merged: the most severe first, then the others as a list ([UX spec §4.3](ux-spec.md)).

### 4.2 Inline notices

| Id | Trigger | zh-Hant | English |
|---|---|---|---|
| **N-ELDERLY** | age ≥ 65 | 65 歲以上通常建議使用較低用量並留意肝腎功能；任何中藥的使用請由醫師決定。 | At 65 and over, lower amounts and attention to liver and kidney function are usually advised; any herbal use should be decided by a doctor. |
| **N-MED** | anticoagulant / other interacting medication | 您登錄的藥物（{class}）可能與某些中藥產生交互作用，相關項目已{removed_or_marked}。使用任何中藥前請先詢問醫師或藥師。 | The medicine you listed ({class}) may interact with some herbs; affected items have been {removed_or_marked}. Please ask your doctor or pharmacist before using any herb. |
| **N-MED-UNKNOWN** | free-text medication | 我們只能檢查已列出的藥物類別；關於「{text}」，請詢問您的醫師或藥師。 | We can only check the medicine classes listed; for "{text}", please ask your doctor or pharmacist. |
| **N-ALLERGY** | allergy match | 有項目與您登錄的過敏原相符（{allergen}），已{removed_or_marked}。 | Some items match an allergen you listed ({allergen}) and have been {removed_or_marked}. |
| **N-ALLERGY-UNKNOWN** | free-text allergen we cannot match | 我們無法確認「{text}」是否出現在建議的成分中，請自行核對成分。 | We cannot confirm whether "{text}" appears in the suggested ingredients; please check the ingredients yourself. |
| **N-ACUTE** | acute external-type presentation | 您目前的症狀像是剛起的外感。若發燒超過 3 天、體溫 ≥ 39 °C 或症狀加重，請就醫。 | Your symptoms look like a recent external illness. If fever lasts more than 3 days, reaches 39 °C or worsens, please see a doctor. |
| **N-LOWCONF** | low confidence / insufficient information | 目前的資訊還不足以給出可靠的傾向，因此只提供生活建議與補問。 | There is not enough information yet for a reliable leaning, so only lifestyle suggestions and follow-up questions are shown. |
| **N-CONFLICT** | contradictory answers (state `conflicting_data`) | 您的部分回答互相矛盾，結果的把握度因此降低；請在「您輸入的資料」中確認這些項目。 | Some of your answers contradict each other, so the result is less certain; please check them under "Your data". |
| **N-SUPPRESSED** | any suppressed item | 部分內容因您的情況而未顯示。 | Some content is not shown because of your situation. |
| **N-SELFOBS** | tongue / pulse used | 舌象與脈象屬自我觀察，在計算中的權重較低。 | Tongue and pulse are self-observed and count for less in the calculation. |
| **N-PULSE-EDU** | pulse chosen | 脈象需要受過訓練的手指與大量練習才能穩定分辨。您填寫的脈象以較低權重參與計算，結果頁會標示；請勿僅憑自測脈象下結論，也不要因為摸不到而擔心。 | Feeling the pulse reliably takes trained fingers and a lot of practice. What you enter counts for less in the calculation and is marked in the result; please do not draw conclusions from a self-assessed pulse alone, and do not worry if you cannot feel it. |

### 4.3 Labels and permanent text

| Id | Where | zh-Hant | English |
|---|---|---|---|
| **N-DISCLAIMER-SHORT** | Footer on every screen | 僅供教育參考，不是醫療診斷或處方。 | Educational reference — not a medical diagnosis or prescription. |
| **N-DISCLAIMER-FULL** | Landing, result, print (SOP §14.3) | 本結果依傳統中醫理論與您提供的資訊整理而成，**僅供教育與自我了解之用，不是醫療診斷或處方**。其中「生辰八字」「流年」「運氣」屬傳統文化的傾向參考，未經臨床驗證，不應作為任何醫療決定的依據。若有不適請就醫；若有胸痛、呼吸困難、意識改變、嚴重出血等緊急狀況，請立即撥打當地緊急電話。懷孕、哺乳、兒童、重大疾病或正在服藥者，使用任何中藥前請先諮詢合格中醫師與藥師。 | This result is compiled from traditional Chinese medicine theory and the information you provided. **It is for education and self-understanding only and is not a medical diagnosis or prescription.** "Birth chart", "annual cycle" and "five periods and six qi" are traditional-culture tendency references that have not been clinically validated and must not be the basis of any medical decision. If you feel unwell, please see a doctor; in an emergency such as chest pain, difficulty breathing, altered consciousness or heavy bleeding, call your local emergency number immediately. If you are pregnant, breastfeeding, a child, living with a serious illness or taking medication, consult a licensed practitioner and a pharmacist before using any herb. |
| **N-BIRTH** | Birth card, panel, forecast | 生辰、流年與運氣屬傳統文化的傾向參考，未經臨床驗證；只作為背景，不會改變您的症狀評分，也不應作為任何醫療決定的依據。 | Birth data, the annual cycle and the five periods and six qi are traditional-culture tendency references and are not clinically validated. They are background only: they do not change how your symptoms are scored and must not be the basis of any medical decision. |
| **N-DRAFT** | Dev profile and approved closed betas | 內容草稿：尚未經合格中醫師審核。 | Draft content: not yet reviewed by a qualified practitioner. |
| **N-TIERC** | Tier-C formulas (dev) | 僅供學習：此方含強藥或苦寒峻烈，須由合格中醫師處方，不作推薦。 | For study only: this formula contains a strong herb or is strongly bitter-cold; it requires a licensed practitioner and is not a recommendation. |
| **N-FORMULA** | Every formula card | 方劑須由合格中醫師依個人情況開立；以下僅說明傳統上的組成與用意。 | Formulas must be set by a licensed practitioner for the individual; what follows only explains the traditional composition and intent. |

---

## 5. Emergency resources (draft — regional owner and physician to verify)

Shown on N-A / N-B and the self-harm item; chosen by the user's region (Q1): the region the person chose, else the one whose IANA time zone the device is in (it only *preselects*: the region is named on the screen and can be changed), else the generic "call your local emergency number" with a request to choose. **There is no default region** — the MVP showed Taiwan's numbers to anyone who had not chosen, wherever they were; a device in Taiwan now gets them by its time zone, as it should, and nobody else gets them unasked. Numbers must be verified for the target region before release (a dated `verification` record in the data: who, when, where; a public build ships only verified rows no older than 24 months, the closed beta may carry the draft rows with their own note on screen), and the list is stored as data (`data/safety/emergency.json`, built from `scripts/kb/curated/emergency.py`; every row is `draft` until the regional owner verifies it) so it can be corrected without a release of the app.

| Region | Emergency / ambulance | Crisis support |
|---|---|---|
| Taiwan | 119 | 1925 (mental-health line) |
| Hong Kong, Macau | 999 | — (to verify) |
| Mainland China | 120 (ambulance), 110 (police) | — (to verify) |
| Japan | 119 | — (to verify) |
| Singapore | 995 | — (to verify) |
| United States, Canada | 911 | 988 (US) |
| United Kingdom | 999 (111 for non-emergency advice) | — (to verify) |
| European Union | 112 | — (to verify) |
| Australia | 000 | — (to verify) |
| Other / unknown | "Call your local emergency number" | — |

---

## 6. The safety filter

### 6.1 Evaluation

After formulas are matched (SOP step 10) and before explanation (step 12), `safety.ts` evaluates `data/safety/rules.json` against every **candidate item** (formula, herb in a modification, diet item, acupoint):

1. A rule **fires** for an item when its `applies_to` matches the subject/state (`always`; `population`; `condition` — with `medication_class` intersecting the user's classes; `state`; `constitution`) **and** its `target` matches the item (herb pregnancy flag, herb interaction flag, formula tier, listed acupoints, conflict type, allergen list, flavour share, herb pairs, effect, output-level cap).
2. **Severity** `hard` → under `suppress_hard` (release) the item is **removed** and a `SuppressedItem {kind, id, ruleId, messageKey}` is recorded; under `annotate_only` (dev) it is **kept and annotated**. `soft` → always annotated.
3. `R_LOW_CONFIDENCE` is not an item rule but a **state rule**: it re-resolves the policy to L0 (the second resolution of [tech spec §6.2](tech-spec.md)).
4. After filtering, if **no formula** remains, the report says why (listing the suppressions) and still shows the L0 content. The filter never removes the safety notices themselves.
5. The rule set and `scoring-params` are part of the KB version; a rule change is a content change ([content review](content-review.md)).

### 6.2 Rule families (reference: SOP §13.2)

| Family | Rules | Intent |
|---|---|---|
| Pregnancy / lactation / minor / elderly | `R_PREG_HERB_AVOID`, `R_PREG_HERB_CAUTION`, `R_PREG_ACUPOINTS`, `R_PREG_FOOD_CAUTION`, `R_LACTATING_HERB`, `R_MINOR_FORMULA`, `R_ELDERLY` | Avoid contraindicated herbs and points; caution on certain foods; restrict stronger formulas |
| Serious illness | `R_SERIOUS_CHRONIC` | No formulas |
| Medication classes | `R_ANTICOAGULANT`, `R_HYPOGLYCEMIC`, `R_BP_RAISING`, `R_HYPOKALEMIA`, `R_IMMUNOSUPPRESSANT`, `R_SEDATIVE`, `R_SYMPATHOMIMETIC` | Interactions by class |
| Herb hazards | `R_STRONG_HERB`, `R_ARISTOLOCHIC`, `R_SHIBAFAN` | Strong herbs; aristolochic-acid risk; 十八反/十九畏 |
| Individual | `R_ALLERGY`, `R_TEBING_CONSTITUTION` | Allergen match; no tonics for 特稟質 |
| Pattern direction | `R_PATTERN_HEAT_VS_WARM`, `R_PATTERN_COLD_VS_COLD`, `R_EXCESS_VS_TONIC`, `R_DEFICIENCY_VS_ATTACK` | 「寒者熱之，熱者寒之」「無盛盛，無虛虛」 |
| Balance | `R_FLAVOR_EXCESS` | A single flavour > 55 % of effective weight |
| State | `R_LOW_CONFIDENCE` | L0 under low confidence or insufficient information |

Known limits to state to reviewers: the 十九畏 list is textbook (unverified); interaction flags on 609 derived herbs are rule-derived; classes are coarse; the filter cannot judge doses; free-text medications are not checked.

### 6.3 Properties that must always hold (property-tested)

- A matched `blocking_ack` notice is produced in **both** profiles for every population/condition the configuration marks blocking.
- `release` never outputs above L1; with any blocking population/condition it never outputs above L0.
- `dev` is never below L3 (features aside) and never **removes** an item (it annotates).
- Every suppressed or downgraded item appears in `suppressed[]` with a rule id.
- `flow` is always `continue`.
- Pregnant (or possibly pregnant) users never see a formula containing an `avoid` or `caution` herb in `release`, nor a pregnancy-contraindicated acupoint at any level without annotation.
- Anticoagulant users never see formulas with activating herbs in `release`.

---

## 7. Claims, wording and presentation

- The wording rules (forbidden/preferred) are in the [i18n guide §5](i18n-guide.md) and enforced by lint; this policy adds: **no efficacy numbers, no "success" claims, no testimonials, no comparisons with medicines, no dose advice in release**.
- Output states **tendencies** ("leans towards", "is consistent with") and always shows confidence and what would change the conclusion.
- Birth/annual/五運六氣 content carries **N-BIRTH** wherever it appears; it is **opt-in** in release (SOP D13) and never presented as predicting illness, events or time windows.
- Formulas are presented as *traditional composition and intent*, with **N-FORMULA**; tier C only as study (N-TIERC); no purchasing links or product names.
- Foods and acupressure points are labelled as general, low-risk suggestions with their cautions; pregnancy points are never recommended in pregnancy.
- Classical quotations are shown as text with source, not as proof of efficacy.

### 7.1 Regulatory positioning (not legal advice)

The product is positioned as **educational / wellness information without claims to diagnose, treat, cure or prevent disease**. Whether a region would classify the software as a medical device depends on intended-use statements and marketing, not only on features; therefore marketing copy, store listings and the app's wording are reviewed by the legal reviewer for the target region (candidates: Taiwan, Hong Kong, mainland China, EU/UK, US) before launch. Any feature that moves towards individual diagnosis, dose recommendation or monitoring requires a fresh regulatory assessment (PRD §10, Q1).

---

## 8. Incident handling

| Severity | Examples | Target response |
|---|---|---|
| **S1 — harmful content shipped** | A contraindication missing for a population; a blocking notice not shown; dev profile in a release; a wrong emergency number | Within **24 h**: restrict the item (data hotfix through a rule or by lowering the release level), rebuild and redeploy; notice in the changelog; review of the area |
| **S2 — safety-relevant defect** | Suppression not listed; wrong tier; an interaction class not matched | Within **3 working days**: fix, regression test, targeted re-review |
| **S3 — wording or claim problem** | A forbidden term; a tendency stated as a fact | Next release; lint rule added |
| **S4 — other** | Cosmetic | Normal backlog |

Process: (1) report arrives (issue template "Safety report": item id, KB version, steps; **no health data**; the in-app "Report a problem" link pre-fills ids and versions only) → (2) owner triages and classifies within 1 working day → (3) containment (hotfix/lower level/feature flag via data) → (4) root cause and **regression test** (golden case or property) → (5) reviewer sign-off for S1/S2 → (6) public changelog note → (7) post-incident review within 10 working days. Rollback is a redeploy of the previous hashed build (tech spec §11, [release process](release-process.md)).

---

## 9. Testing the policy

Vignette suites in the [test plan §3.3](test-plan.md): every red-flag item, every population/condition/state combination in both profiles, medication-class and allergy matrices, pregnancy contraindications, tier-C handling, low-confidence downgrade, and the invariants of §6.3 as property tests. A release build is blocked if any of them fails.

---

## 10. Open questions

**Decided 2026-10-04:** every default below is confirmed for the MVP and will be revisited after the MVP is finished (legal review of the wording, SQ6, still happens before any public release).

| # | Question | Decision (MVP) |
|---|---|---|
| SQ1 | Target region(s) and the emergency list per region | Taiwan first; list in data |
| SQ2 | Is "not sure" for A/B red flags treated as "yes"? | Yes (conservative) |
| SQ3 | May a user clear a positive A/B red flag? | Only through an explicit, recorded correction |
| SQ4 | Minimum age and whether minors may use L0 at all | L0 with blocking notice (as configured) |
| SQ5 | Whether to offer a "talk to a practitioner" directory | No (non-goal) |
| SQ6 | Legal review of the notice wording | Required before any public release |
| SQ7 | Reporting channel (email vs issue tracker) | Issue template + email alias, TBD |

---

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-04 | Initial policy, notice catalogue (draft wording), filter semantics, incident process |
| 0.2 | 2026-10-04 | Open-question defaults confirmed for the MVP (SQ1–SQ7) |
| 0.3 | 2026-10-04 | Notice N-CONFLICT added (contradictory answers); notices of one id are merged (e.g. anticoagulant + other medication → one N-MED) |
| 0.4 | 2026-10-08 | §3: the red flags during AI help's conversation — checked on the device before sending, A/B answered no asked again, C asks for the profile, the model's flag raises only (PM-47) |
| 0.5 | 2026-10-08 | §2.1b the roles (learners and practitioners) and N-ROLE, the attestation, in §4.1 (PM-53) |
