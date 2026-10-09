"""Scope profiles (application configuration) and safety rules — curated draft, all rows await clinical review.

DESIGN (from the product decisions of 2026-10-03):
  · The app has configuration profiles that decide how much it OUTPUTS for which population / condition / state.
    `dev` opens everything; `release` restricts output by default.
  · Whatever the profile, risky populations and conditions ALWAYS get a "see a doctor" notice — a blocking
    acknowledgement — and then the flow CONTINUES (flow = "continue"); only the output level is restricted.
  · The safety filter is therefore part of the configuration: each rule says what to do per enforcement mode
    (`suppress` = remove the item and show why; `demote` = lower its tier; `annotate` = keep and warn).
Output levels:
  L0 education only · L1 standard · L2 extended · L3 full. Effective level = the most restrictive of all matched
  dimensions; effective notice = the most severe. Feature flags can only restrict further.
"""

LEVELS = {
    "L0": {"name": {"zh-Hant": "僅供學習", "en": "Education only"},
           "includes": ["constitution and pattern explanation", "panel visualisation (五行臟腑・六邪・八綱)", "gentle lifestyle and seasonal advice",
                        "when and how to see a practitioner"]},
    "L1": {"name": {"zh-Hant": "標準", "en": "Standard"},
           "includes": ["L0", "diet therapy (藥食同源, low-risk items)", "safe self-acupressure points", "tier A formulas: composition, rationale and citations (no dose)"]},
    "L2": {"name": {"zh-Hant": "進階", "en": "Extended"},
           "includes": ["L1", "tier B formulas (conditional on the safety filter)", "formula modification (加減) suggestions without dose", "herb-level weight view"]},
    "L3": {"name": {"zh-Hant": "完整", "en": "Full"},
           "includes": ["L2", "tier C formulas as learning display (never as a recommendation)", "relative proportions and reference amounts", "the whole knowledge base"]},
}

DIMENSIONS = {
    "population": ["adult", "elderly_65_plus", "minor_under_18", "pregnant", "lactating"],
    "condition": ["red_flag_A", "red_flag_B", "serious_chronic_disease", "on_anticoagulant", "on_other_interacting_medication", "allergy_match",
                  "acute_external_symptoms"],
    "state": ["low_confidence", "insufficient_information", "conflicting_data"],
}

NOTICE_KINDS = {
    "none": "No extra notice beyond the permanent disclaimer.",
    "inline": "A visible banner on the affected sections.",
    "blocking_ack": "A full-screen 'seek medical care' notice the user must acknowledge; afterwards the flow continues (never a dead end).",
}


def _entry(level: str, notice: str) -> dict:
    return {"level": level, "notice": notice}


PROFILES = {
    "release": {
        "description": "Default for released builds: restricted output; risky populations and conditions are told to see a doctor and then receive education-level output.",
        "population": {"adult": _entry("L1", "none"), "elderly_65_plus": _entry("L1", "inline"), "minor_under_18": _entry("L0", "blocking_ack"),
                       "pregnant": _entry("L0", "blocking_ack"), "lactating": _entry("L0", "blocking_ack")},
        "condition": {"red_flag_A": _entry("L0", "blocking_ack"), "red_flag_B": _entry("L0", "blocking_ack"),
                      "serious_chronic_disease": _entry("L0", "blocking_ack"), "on_anticoagulant": _entry("L1", "inline"),
                      "on_other_interacting_medication": _entry("L1", "inline"), "allergy_match": _entry("L1", "inline"),
                      "acute_external_symptoms": _entry("L1", "inline")},
        "state": {"low_confidence": _entry("L0", "inline"), "insufficient_information": _entry("L0", "inline"), "conflicting_data": _entry("L1", "inline")},
        "safety_enforcement": "suppress_hard",
        "features": {"show_dosage_reference": False, "show_formula_modification": False, "show_herb_weights": False, "show_tier_c": False,
                     "show_acupoints": True, "show_diet": True},
        "wuxing": {"enabled": True, "season": True, "yunqi": True, "bazi_innate": "opt_in", "bazi_annual": "opt_in", "season_model": "changxia"},
        "tongue_pulse": {"tongue_zones": True, "tongue_special_signs": True, "pulse_input": True, "pulse_quality_coefficient": 0.5},
        # AI help (Release F; docs/post-mvp/design/ai-assisted-intake.md §3): off in a release until its gates — no module, no gateway (check-release rule 17)
        "ai": {"enabled": False, "endpoint": None, "modules": {"conversation": False, "tongue": False, "face": False}},
        # Who reads with the study reference — reference quantities, the classical 加減 and the medication plan, for study and as an aid to a practitioner only (the owner's decision of
        # 2026-10-08, PD-30; docs/post-mvp/design/prescription-model.md §7.4): "all" every reader unless they choose to be a general reader, "roles" only those who declare a role with
        # the attestation, "off" nobody. A build may restrict it (APP_DOSE_DISPLAY / APP_OVERRIDES), never widen it.
        "dose_display": "all",
    },
    "dev": {
        "description": "Development default: everything open for every population, condition and state. The 'see a doctor' notices are still shown and acknowledged (flow continues); the safety filter annotates instead of removing.",
        "population": {"adult": _entry("L3", "none"), "elderly_65_plus": _entry("L3", "inline"), "minor_under_18": _entry("L3", "blocking_ack"),
                       "pregnant": _entry("L3", "blocking_ack"), "lactating": _entry("L3", "blocking_ack")},
        "condition": {"red_flag_A": _entry("L3", "blocking_ack"), "red_flag_B": _entry("L3", "blocking_ack"),
                      "serious_chronic_disease": _entry("L3", "blocking_ack"), "on_anticoagulant": _entry("L3", "inline"),
                      "on_other_interacting_medication": _entry("L3", "inline"), "allergy_match": _entry("L3", "inline"),
                      "acute_external_symptoms": _entry("L3", "inline")},
        "state": {"low_confidence": _entry("L3", "inline"), "insufficient_information": _entry("L3", "inline"), "conflicting_data": _entry("L3", "inline")},
        "safety_enforcement": "annotate_only",
        "features": {"show_dosage_reference": True, "show_formula_modification": True, "show_herb_weights": True, "show_tier_c": True,
                     "show_acupoints": True, "show_diet": True},
        "wuxing": {"enabled": True, "season": True, "yunqi": True, "bazi_innate": True, "bazi_annual": True, "season_model": "changxia"},
        "tongue_pulse": {"tongue_zones": True, "tongue_special_signs": True, "pulse_input": True, "pulse_quality_coefficient": 0.5},
        # the conversation and the observation of the tongue and the face by photo (PM-47, PM-50) with the local mock gateway (`pnpm --filter @tcm/ai-gateway dev`): the photos exist in
        # the development profile only, until the tongue-photo spike's gates are met (PD-25)
        "ai": {"enabled": True, "endpoint": "http://127.0.0.1:8787", "modules": {"conversation": True, "tongue": True, "face": True}},
        # the development profile reaches L3 for everyone, with no reference file (the study reference is a release build's way to L3)
        "dose_display": "all",
    },
}

# Roles (PD-13, PD-14; the owner's decision of 2026-10-07; docs/post-mvp/design/prescription-model.md §7.4): a reader who declares, with an attestation, that they study Chinese
# medicine or practise it reaches L3 in the release build — the composition with its roles, reference amounts, the classical 加減 and the personalised plan. An overlay over the
# release profile that may only raise the levels of an adult (and an adult over 65) and switch the study features on: every other cell — minors, pregnancy, breastfeeding, the
# red flags, serious chronic disease, the medicine and allergy conditions, the states — and the safety enforcement stay the release profile's, so the safety layer does not
# depend on who reads (validated here and by check-release rule 18).
ROLE_OVERLAY = {
    "population": {"adult": {"level": "L3"}, "elderly_65_plus": {"level": "L3"}},
    "features": {"show_dosage_reference": True, "show_formula_modification": True, "show_herb_weights": True, "show_tier_c": True},
}
ROLES = {"learner": ROLE_OVERLAY, "practitioner": ROLE_OVERLAY}

RESOLUTION = {
    "flow": "continue",
    "effective_level": "the most restrictive level among all matched dimensions, then limited by feature flags",
    "effective_notice": "the most severe notice among all matched dimensions (blocking_ack > inline > none)",
    "profile_selection": "build-time default: release for production builds, dev for development builds; may be overridden by environment configuration",
    "safety_enforcement_modes": {
        "suppress_hard": "rules marked severity=hard remove the item and show the reason; severity=soft rules annotate",
        "annotate_only": "never remove items; every triggered rule is shown as a warning on the item",
    },
}

# Age bands for paediatric reference amounts (textbook rule of thumb, 《中藥學》; unverified)
MINOR_DOSE_FRACTIONS = [
    {"age": "新生兒", "fraction_of_adult": "1/6"}, {"age": "乳兒", "fraction_of_adult": "1/3"},
    {"age": "幼兒", "fraction_of_adult": "1/2"}, {"age": "學齡兒童", "fraction_of_adult": "2/3"},
]
ELDERLY_DOSE_FRACTION = "約 2/3（並注意肝腎功能；教材通則，未核對）"

# Acupoints that are contraindicated in pregnancy (standard acupuncture teaching; unverified here)
PREGNANCY_ACUPOINTS = ["合谷", "三陰交", "血海", "關元", "至陰", "崑崙", "肩井", "次髎", "石門"]

# 十八反 / 十九畏 (cited verse: 《本草便讀》 藻戟遂芫俱戰草，諸參辛芍叛藜蘆)
# `herbs`: the herbs of the knowledge base each name of a row stands for IN THAT ROW, by id — the safety rules match a composition's herbs by these ids, never by
# the characters of a name (a name test missed 白芍 and 赤芍 for 芍藥 and caught 燈盞細辛 for 細辛). A herb is listed under a name when it is that herb, a processed form
# or a part of it (炙甘草 「同甘草」, 制草烏, 法半夏, 巴豆霜, 人參葉, 天花粉 the root of 瓜蔞), a synonym of standard teaching (朴硝 and 牙硝 are 芒硝, 官桂 is 肉桂,
# 三棱 is written 三稜, 砒霜 is refined from 砒石), or when its own Pharmacopoeia caution names the other side of the row (關白附 「不宜與半夏、瓜蔞、貝母、白蘞、
# 白及同用」; 黨參 and 西洋參 「不宜與藜蘆同用」, the 諸參 of the verse — but not 五靈脂, so not in that row). validate_kb checks the table against every herb's
# caution: each pair a caution states is a pair of a row, or one of the stated exceptions there. A draft for the pharmacy and physician review, like the lists.
SHIBAFAN = [
    {"herb": "烏頭類（附子、川烏、草烏）", "opposes": ["半夏", "瓜蔞", "貝母", "白蘞", "白及"], "herbs": {
        "烏頭類（附子、川烏、草烏）": ["herb-fuzi", "herb-chuanwu", "herb-caowu", "herb-zhicaowu", "herb-guanbaifu"],
        "半夏": ["herb-banxia", "herb-fanbanxia", "herb-jiangbanxia", "herb-qingbanxia"],
        "瓜蔞": ["herb-gualou", "herb-gualouzi", "herb-chaogualouzi", "herb-gualoupi", "herb-tianhuafen"],
        "貝母": ["herb-chuanbeimu", "herb-zhebeimu", "herb-pingbeimu", "herb-yibeimu", "herb-hubeibeimu"],
        "白蘞": ["herb-bailian"], "白及": ["herb-baiji"]}},
    {"herb": "甘草", "opposes": ["海藻", "大戟", "甘遂", "芫花"], "herbs": {
        "甘草": ["herb-gancao", "herb-zhigancao"], "海藻": ["herb-haizao"], "大戟": ["herb-jingdaji", "herb-hongdaji"], "甘遂": ["herb-gansui"], "芫花": ["herb-yuanhua"]}},
    {"herb": "藜蘆", "opposes": ["人參", "沙參", "丹參", "玄參", "苦參", "細辛", "芍藥"], "herbs": {
        "藜蘆": ["herb-lilu"], "人參": ["herb-renshen", "herb-hongshen", "herb-renshenye", "herb-xiyangshen", "herb-dangshen"],
        "沙參": ["herb-beishashen", "herb-nanshashen"], "丹參": ["herb-danshen"], "玄參": ["herb-xuanshen"], "苦參": ["herb-kushen"], "細辛": ["herb-xixin"],
        "芍藥": ["herb-baishao", "herb-chishao"]}},
]
SHIJIUWEI = [
    {"a": "硫黃", "b": "朴硝", "herbs": {"硫黃": ["herb-liuhuang"], "朴硝": ["herb-mangxiao"]}},
    {"a": "水銀", "b": "砒霜", "herbs": {"水銀": [], "砒霜": ["herb-pishi"]}},
    {"a": "狼毒", "b": "密陀僧", "herbs": {"狼毒": ["herb-langdu"], "密陀僧": []}},
    {"a": "巴豆", "b": "牽牛", "herbs": {"巴豆": ["herb-badou", "herb-badoushuang"], "牽牛": ["herb-qianniuzi"]}},
    {"a": "丁香", "b": "鬱金", "herbs": {"丁香": ["herb-dingxiang", "herb-mudingxiang"], "鬱金": ["herb-yujin"]}},
    {"a": "川烏、草烏", "b": "犀角", "herbs": {"川烏、草烏": ["herb-chuanwu", "herb-caowu", "herb-zhicaowu"], "犀角": []}},
    {"a": "牙硝", "b": "三棱", "herbs": {"牙硝": ["herb-mangxiao"], "三棱": ["herb-sanleng"]}},
    {"a": "官桂", "b": "赤石脂", "herbs": {"官桂": ["herb-rougui"], "赤石脂": ["herb-chishizhi"]}},
    {"a": "人參", "b": "五靈脂", "herbs": {"人參": ["herb-renshen", "herb-hongshen", "herb-renshenye"], "五靈脂": ["herb-wulingzhi"]}},
]
# Pairs a Pharmacopoeia caution states that belong to neither list (validate_kb), with the reason
INCOMPATIBILITY_EXCEPTIONS = {
    ("herb-laifuzi", "herb-renshen"): "相惡 (人參惡萊菔子): 萊菔子 takes away from 人參's effect; not a pair of 十八反 or 十九畏",
}

# severity: hard = removed in release (suppress_hard); soft = annotated. action_release: what release does with a hard rule.
RULES = [
    dict(id="R_PREG_HERB_AVOID", applies_to=dict(population=["pregnant"]), target=dict(herb_pregnancy="avoid"), severity="hard",
         message={"zh-Hant": "含孕婦禁用藥物，不予推薦。", "en": "Contains herbs contraindicated in pregnancy; not recommended."}),
    dict(id="R_PREG_HERB_CAUTION", applies_to=dict(population=["pregnant"]), target=dict(herb_pregnancy="caution"), severity="hard",
         message={"zh-Hant": "含孕婦慎用藥物（活血、峻下、辛熱、滑利等），不予推薦。", "en": "Contains herbs to be used with caution in pregnancy; not recommended."},
         citation="suwen-071-1", note="《素問·六元正紀大論》「有故無殞，亦無殞也」是醫師在必要時的專業判斷，App 不採用。"),
    dict(id="R_PREG_ACUPOINTS", applies_to=dict(population=["pregnant"]), target=dict(acupoints=PREGNANCY_ACUPOINTS), severity="hard",
         message={"zh-Hant": "孕期禁按的穴位，不予推薦。", "en": "Acupoints contraindicated in pregnancy; not recommended."}),
    dict(id="R_LACTATING_HERB", applies_to=dict(population=["lactating"]), target=dict(formula_tier=["B", "C"]), severity="hard",
         message={"zh-Hant": "哺乳期僅提供溫和建議；活血或強藥類方劑不予推薦。", "en": "While breastfeeding only gentle advice is given."}),
    dict(id="R_MINOR_FORMULA", applies_to=dict(population=["minor_under_18"]), target=dict(formula_tier=["B", "C"]), severity="hard",
         message={"zh-Hant": "未成年人不予推薦 B、C 級方劑；用量須依年齡折算並由醫師決定。", "en": "No tier B/C formulas for minors; amounts must be set by a practitioner."},
         reference=MINOR_DOSE_FRACTIONS),
    dict(id="R_ELDERLY", applies_to=dict(population=["elderly_65_plus"]), target=dict(formula_tier=["C"]), severity="soft",
         message={"zh-Hant": "65 歲以上建議降低用量並留意肝腎功能；請由醫師決定。", "en": "Over 65: reduced amounts and attention to liver/kidney function; practitioner decides."},
         reference=ELDERLY_DOSE_FRACTION),
    dict(id="R_SERIOUS_CHRONIC", applies_to=dict(condition=["serious_chronic_disease"]), target=dict(formula_tier=["A", "B", "C"]), severity="hard",
         message={"zh-Hant": "重大疾病（腎衰竭、肝硬化、癌症治療中、器官移植等）不予推薦任何方劑。", "en": "No formulas for serious chronic disease."}),
    dict(id="R_ANTICOAGULANT", applies_to=dict(condition=["on_anticoagulant"]), target=dict(herb_interaction="anticoagulant"), severity="hard",
         message={"zh-Hant": "正在使用抗凝血／抗血小板藥物：含活血類或可能影響凝血藥效的藥物不予推薦。", "en": "On anticoagulants/antiplatelets: blood-activating or interacting herbs not recommended."}),
    dict(id="R_HYPOGLYCEMIC", applies_to=dict(condition=["on_other_interacting_medication"], medication_class=["antidiabetic"]),
         target=dict(herb_interaction="hypoglycemic"), severity="soft",
         message={"zh-Hant": "與降血糖藥併用可能加強降糖作用，須監測血糖。", "en": "May potentiate antidiabetic drugs; monitor glucose."}),
    dict(id="R_BP_RAISING", applies_to=dict(condition=["on_other_interacting_medication"], medication_class=["antihypertensive"]),
         target=dict(herb_interaction="bp-raising"), severity="soft",
         message={"zh-Hant": "可能升高血壓或水鈉瀦留，與降壓藥併用須留意。", "en": "May raise blood pressure; caution with antihypertensives."}),
    dict(id="R_HYPOKALEMIA", applies_to=dict(condition=["on_other_interacting_medication"], medication_class=["diuretic", "cardiac-glycoside"]),
         target=dict(herb_interaction="hypokalemia"), severity="hard",
         message={"zh-Hant": "甘草長期或大量使用可致低血鉀；與利尿劑、強心苷併用不予推薦。", "en": "Licorice can cause hypokalaemia; not with diuretics or cardiac glycosides."}),
    dict(id="R_IMMUNOSUPPRESSANT", applies_to=dict(condition=["on_other_interacting_medication"], medication_class=["immunosuppressant"]),
         target=dict(herb_interaction="immune-modulating"), severity="hard",
         message={"zh-Hant": "免疫調節類藥物（如黃耆、人參）與免疫抑制劑併用不予推薦。", "en": "Immune-modulating herbs not recommended with immunosuppressants."}),
    dict(id="R_SEDATIVE", applies_to=dict(condition=["on_other_interacting_medication"], medication_class=["sedative"]),
         target=dict(herb_interaction="sedative-additive"), severity="soft",
         message={"zh-Hant": "安神類藥物可能與鎮靜藥疊加，駕駛或操作機械前請留意。", "en": "May add to sedatives."}),
    dict(id="R_SYMPATHOMIMETIC", applies_to=dict(condition=["on_other_interacting_medication"], medication_class=["MAOI", "stimulant", "antihypertensive"]),
         target=dict(herb_interaction="sympathomimetic"), severity="hard",
         message={"zh-Hant": "麻黃類含擬交感成分，與 MAOI、興奮劑、降壓藥併用不予推薦。", "en": "Ephedra is sympathomimetic; not with MAOIs, stimulants or antihypertensives."}),
    dict(id="R_STRONG_HERB", applies_to=dict(always=True), target=dict(formula_tier=["C"]), severity="hard",
         message={"zh-Hant": "含強藥或苦寒峻烈：僅供學習顯示，須由合格中醫師處方，不作推薦。", "en": "Strong herbs: learning display only; requires a licensed practitioner."}),
    dict(id="R_ARISTOLOCHIC", applies_to=dict(always=True), target=dict(herb_interaction="aristolochic-risk"), severity="hard",
         message={"zh-Hant": "含「木通」：歷史上關木通含馬兜鈴酸（腎毒性、致癌）已禁用；須確認為川木通或通草，否則不予推薦。", "en": "Contains 木通: aristolochic-acid risk with the banned variety; identity must be confirmed."}),
    dict(id="R_ALLERGY", applies_to=dict(condition=["allergy_match"]), target=dict(herb_in_user_allergy_list=True), severity="hard",
         message={"zh-Hant": "與您登錄的過敏項目相符，不予推薦。", "en": "Matches a recorded allergy."}),
    dict(id="R_TEBING_CONSTITUTION", applies_to=dict(constitution=["C_TEBING"]), target=dict(effect="tonic"), severity="soft",
         message={"zh-Hant": "過敏體質（特稟質）不予補益類推薦，並加強警示。", "en": "Allergic constitution: no tonic recommendations."}),
    dict(id="R_PATTERN_HEAT_VS_WARM", applies_to=dict(always=True), target=dict(conflict="heat_pattern_with_warming_formula"), severity="hard",
         message={"zh-Hant": "熱證不宜溫補（寒者熱之，熱者寒之）。", "en": "Heat patterns should not be warmed."}, citation="suwen-074-2",
         condition="panel.bagang.cold_heat > +0.3 and formula warming index (−Σ liuxie.寒 effect + Σ yang gain) > +0.3"),
    dict(id="R_PATTERN_COLD_VS_COLD", applies_to=dict(always=True), target=dict(conflict="cold_pattern_with_cooling_formula"), severity="hard",
         message={"zh-Hant": "寒證不宜寒涼清熱（寒者熱之，熱者寒之）。", "en": "Cold patterns should not be cooled."}, citation="suwen-074-2",
         condition="panel.bagang.cold_heat < −0.3 and formula cooling index (−Σ liuxie.火 effect) > +0.3"),
    dict(id="R_EXCESS_VS_TONIC", applies_to=dict(always=True), target=dict(conflict="excess_pattern_with_tonic_formula"), severity="hard",
         message={"zh-Hant": "實證不宜峻補（無盛盛，無虛虛）。", "en": "Do not reinforce an excess."}, citation="suwen-070-3",
         condition="panel.bagang.deficiency_excess > +0.3 and formula tonic index (Σ qi/blood/yin/yang gains) > +0.5"),
    dict(id="R_DEFICIENCY_VS_ATTACK", applies_to=dict(always=True), target=dict(conflict="deficiency_pattern_with_attacking_formula"), severity="hard",
         message={"zh-Hant": "虛證不宜攻伐（無盛盛，無虛虛）。", "en": "Do not attack a deficiency."}, citation="suwen-070-3",
         condition="panel.bagang.deficiency_excess < −0.3 and formula attacking index (−Σ product/liuxie effects) > +0.8"),
    dict(id="R_PREG_FOOD_CAUTION", applies_to=dict(population=["pregnant"]), target=dict(food_pregnancy_caution=True), severity="soft",
         message={"zh-Hant": "孕期請謹慎食用此食材（傳統上認為可能影響胎氣），並先諮詢醫師。", "en": "Use this food with caution in pregnancy (traditionally thought to affect the pregnancy); ask your doctor first."}),
    dict(id="R_FLAVOR_EXCESS", applies_to=dict(always=True), target=dict(flavor_share_over=0.55), severity="soft",
         message={"zh-Hant": "單一味道占比過高：久用易傷其所克之臟（味過於酸，肝氣以津，脾氣乃絕…）。", "en": "A single flavour dominates; prolonged use can damage the organ it overcomes."},
         citation="suwen-003-1"),
    dict(id="R_SHIBAFAN", applies_to=dict(always=True), target=dict(herb_pairs="shibafan_shijiuwei"), severity="hard",
         message={"zh-Hant": "違反十八反或十九畏配伍禁忌。", "en": "Violates the incompatibility lists (十八反/十九畏)."}, citation="bencao-bianxue-18fan-1"),
    dict(id="R_LOW_CONFIDENCE", applies_to=dict(state=["low_confidence", "insufficient_information"]), target=dict(output_level_max="L0"), severity="hard",
         message={"zh-Hant": "資訊不足或信心偏低：僅提供生活建議、補問與就醫提示。", "en": "Insufficient information: lifestyle advice, follow-up questions and referral only."}),
]

CLINICAL_REVIEW_REQUIRED = [
    "all herb pregnancy / interaction flags", "age-band and elderly amount rules", "red-flag lists (physicians)", "the conflict-rule thresholds",
    "the contraindicated acupoint list",
]
