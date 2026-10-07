"""Curated tables of the prescription model (PM-37): the parameters, the 七情 pairings, processing (炮製) and dose bands (量效).

Every statement rests on a passage that the build finds in the corpus, or says that it is a textbook statement still to be verified.
Design: docs/post-mvp/design/prescription-model.md §3.3–§3.5, §4.1.
"""
from __future__ import annotations

# ── parameters ([calibrate]; stored with the data) ───────────────────────────
PARAMS = {
    "dose": {
        "kappa": 1.0,       # benefit s(x) = (1 + κ)·x / (κ + x): s(1) = 1, twice the typical dose gives a third more, never more than 1 + κ
        "gamma": 1.5,       # burden grows as x^γ: faster than the dose above the typical dose
        "reference": "the middle of the Pharmacopoeia range (dose_g_reference)",
    },
    "pairs": {
        "sigma": 0.2,       # 相須 · 相使: the benefit on the dimensions both herbs act on × (1 + σ)
        "tau": 0.5,         # 相畏 (the burden of the herb that fears) and 相惡 (the benefit of the herb that is opposed) × (1 − τ)
    },
    "bands": {
        "small_below": 0.75,    # 少用: below three quarters of the typical dose
        "large_above": 1.25,    # 多用: above a quarter more than the typical dose
    },
    "mechanism": {
        "theta": 0.2,           # 治法: a formula addresses a component of the deviation when it removes at least this share of it
        "top": 6,               # 病機 and 未盡: the largest components shown
    },
    "verification": {
        "cosine_min": 0.9,      # the effect computed from the herbs agrees with the stored one
        "rank_max": 3,          # the formula ranks among the first three of the library for each of its own patterns
        "burden_ratio_max": 0.5,    # its burden is at most half its benefit (weighted norms)
        "flat_below": 0.05,     # a formula direction weaker than this points nowhere
    },
    "roles": {
        "fanzuo_below": 0.75,   # 反佐: a herb of the opposite nature to the 君, given below this share of its typical dose
        "carrier_min": 0.5,     # 載藥: a herb whose own 升降浮沉 is at least this strong carries the formula up or down (桔梗 舟楫之劑, 牛膝 引血下行)
    },
}

# ── 七情 ───────────────────────────────────────────────────────────────────
# The table of 《本草綱目·序例下》「相須相使相畏相惡諸藥」 (after 徐之才《藥對》): each entry is 名（clauses。）. The build parses the section,
# keeps every relation whose two herbs are in the knowledge base, and records the entry it read (so each pairing is traceable to the text).
PAIRING_BOOK = "013"
PAIRING_SECTION = {"start": "（出徐之才《药对》，今益以诸家本草续增者。）", "end": "<目录>"}
PAIRING_CHAPTER = "序例下·相須相使相畏相惡諸藥"
# clause → type. 「X為之使」: X serves the herb (相使). 「得X良」: X betters it (相使). 「惡X」: X takes away from its effect (相惡).
# 「畏X」: X restrains it — its harm (相畏; the mirror of 相殺). 「反X」: the two must not be combined (相反). 忌、伏、制、柔 are not pairings.
CLAUSES = (
    (r"^(.+?)为之使$", "相使"),
    (r"^得(.+?)良$", "相使"),
    (r"^恶(.+)$", "相惡"),
    (r"^畏(.+)$", "相畏"),
    (r"^反(.+)$", "相反"),
)
# classical names → the knowledge base's names (the build tries the converted name first, then this table)
CLASSICAL_NAMES = {"干姜": "乾薑", "生姜": "生薑", "牡丹": "牡丹皮", "芍药": "白芍", "麦门冬": "麥冬", "天门冬": "天冬", "术": None, "黄": None, "浓朴": "厚朴",
                   "栝蒌": "瓜蔞", "白芨": "白及", "茱萸": None, "吴茱萸": "吳茱萸", "山茱萸": "山茱萸", "杏仁": "苦杏仁", "桂": None, "菖蒲": "石菖蒲"}

# 相須: two herbs of like action that strengthen each other. The classical tables do not list them; these are the textbook examples, unverified.
XIANGXU = [
    ("石膏", "知母", "清熱瀉火 — 白虎湯"),
    ("大黃", "芒硝", "瀉下攻積 — 大承氣湯"),
    ("麻黃", "桂枝", "發汗解表 — 麻黃湯"),
    ("附子", "乾薑", "回陽 — 四逆湯"),
    ("人參", "黃耆", "補氣"),
    ("黨參", "黃耆", "補氣"),
    ("全蠍", "蜈蚣", "息風止痙"),
    ("乳香", "沒藥", "活血止痛"),
    ("三稜", "莪術", "破血行氣"),
    ("桃仁", "紅花", "活血祛瘀 — 桃紅四物湯"),
    ("龍骨", "牡蠣", "重鎮安神、斂陰潛陽"),
]
PAIRING_CITATIONS = ["shennong-xulu-qiqing-1", "shennong-xulu-qiqing-2", "bencao-jizhu-banxia"]

# ── 引經報使 ────────────────────────────────────────────────────────────────
# 《本草綱目·序例上》「引經報使（潔古《珍珠囊》）」: the herbs that lead a formula to each channel. The names are written without separators
# (黄连细辛); the build splits them by the longest knowledge-base name, and skips what it cannot read (本 for 藁本, 桂, the 上中下 of 三焦).
YINJING_SECTION = {"start": "<篇名>引经报使（洁古《珍珠囊》）内容：", "end": "<目录>"}
YINJING_CHAPTER = "序例上·引經報使"
CHANNEL_ORGAN = {"手少阴心": "心", "手太阳小肠": "小腸", "足少阴肾": "腎", "足太阳膀胱": "膀胱", "手太阴肺": "肺", "手阳明大肠": "大腸", "足太阴脾": "脾",
                 "足阳明胃": "胃", "手厥阴心包络": "心包", "手少阳三焦": "三焦", "足厥阴肝": "肝", "足少阳胆": "膽"}

# ── the direction a pattern's treatment asks for (§3.4) ──────────────────────
# Only where the classics state it. 宣 and 升 point up and out (+), 降 and 收 down and in (−).
MECHANISMS = [
    dict(pattern="EX1", direction="宣", says="其在皮者，汗而發之 — 辛溫解表", citation="suwen-005-13"),
    dict(pattern="EX2", direction="宣", says="其在皮者，汗而發之 — 解肌發表", citation="suwen-005-13"),
    dict(pattern="EX3", direction="宣", says="其在皮者，汗而發之 — 辛涼解表", citation="suwen-005-13"),
    dict(pattern="SP3", direction="升", says="下者舉之 — 升陽舉陷", citation="suwen-074-15"),
    dict(pattern="LV2", direction="降", says="高者抑之 — 肝火上炎，清而降之", citation="suwen-074-15"),
    dict(pattern="HT2", direction="降", says="高者抑之 — 滋陰降火", citation="suwen-074-15"),
    dict(pattern="LG1", direction="收", says="散者收之 — 衛表不固，益氣固表", citation="suwen-074-16"),
]
DIRECTION_SIGN = {"宣": 1, "升": 1, "降": -1, "收": -1}

# ── 三因制宜 (§6) ─────────────────────────────────────────────────────────────
# The factors of a personalised prescription: each names what it says and the passage it rests on. Natures: 寒涼 (signed warmth ≤ −1),
# 溫熱 (≥ 1), 溫 (≥ 0.5), 溫燥 (warm and drying), 滋膩 (滋膩 tag, or moistening and tonifying), 補 (tonifying).
SANYIN = {
    "severity": {"light": 0.8, "standard": 1.0, "strong": 1.2, "says": "能毒者以厚藥，不勝毒者以薄藥 — a lighter deviation, a lighter prescription", "citation": "suwen-070-5"},
    "age": {
        "minors": [
            {"label": "新生兒", "below_years": 0.0833, "fraction": "1/6"},
            {"label": "乳兒", "below_years": 1, "fraction": "1/3"},
            {"label": "幼兒", "below_years": 7, "fraction": "1/2"},
            {"label": "學齡兒童", "below_years": 14, "fraction": "2/3"},
        ],
        "elderly_from_years": 65, "elderly_fraction": "2/3",
        "says": "人之勝毒 differs by body; the fractions are the textbook rules of thumb of the safety rules' dose references (unverified)", "citation": "lingshu-053-1",
    },
    "constitution": [
        {"constitution": "C_YANGXU", "avoid": "寒涼", "factor": 0.8, "says": "陽虛質：寒涼之品減量，不另加", "citation": "suwen-074-2"},
        {"constitution": "C_QIXU", "avoid": "寒涼", "factor": 0.8, "says": "氣虛質：寒涼之品減量，不另加", "citation": "suwen-074-2"},
        {"constitution": "C_YINXU", "avoid": "溫燥", "factor": 0.8, "says": "陰虛質：溫燥之品減量，不另加", "citation": "suwen-074-2"},
        {"constitution": "C_SHIRE", "avoid": "溫燥", "factor": 0.8, "says": "濕熱質：溫燥之品減量，不另加", "citation": "suwen-074-2"},
        {"constitution": "C_TANSHI", "avoid": "滋膩", "factor": 0.8, "says": "痰濕質：滋膩之品減量，不另加", "citation": "suwen-074-14"},
        {"constitution": "C_TEBING", "avoid": "補", "factor": 1.0, "says": "特稟質：不另加補益之品", "citation": "suwen-070-5"},
    ],
    "heat_demand": 0.5,       # a 寒涼 herb may still be added for 陽虛質 or 氣虛質 when the remaining heat (liuxie.火) is above this — and it is said
    "season": [
        {"element": "木", "says": "用溫遠溫 (春)", "temperature_at_least": 0.5, "factor": 0.9},
        {"element": "火", "says": "用熱遠熱 (夏)", "temperature_at_least": 1.0, "factor": 0.85},
        {"element": "金", "says": "用涼遠涼 (秋)", "temperature_at_most": -1.0, "factor": 0.9},
        {"element": "水", "says": "用寒遠寒 (冬)", "temperature_at_most": -1.0, "factor": 0.85},
    ],
    "season_citation": "suwen-071-3",
    "season_spares_jun": True,    # 發表不遠熱，攻裡不遠寒: the 君 keeps its amount whatever the season — when the treatment needs it, the season does not hold it back
    "season_exception": {"says": "發表不遠熱，攻裡不遠寒 — when the treatment needs it, the season does not hold it back: the 君 keeps its amount", "citation": "suwen-071-4"},
    "region": {"rules": [], "says": "西北之氣散而寒之，東南之氣收而溫之 — off until a region pack states a rule", "citation": "suwen-070-6"},
    "general": {"says": "治所以異而病皆愈者，得病之情，知治之大體也", "citation": "suwen-012-2"},
    "round_g": 0.5,
}

# ── 炮製 ───────────────────────────────────────────────────────────────────
# 《本草蒙筌·總論·製造資水火》: 酒製升提，薑製發散。入鹽走腎臟，仍使軟堅；用醋注肝經，且資住痛。童便製，除劣性降下；米泔製，去燥性和中。
# 乳製滋潤回枯，助生陰血；蜜製甘緩難化，增益元陽。陳壁土製，竊真氣驟補中焦；麥麩皮製，抑酷性勿傷上膈。烏豆湯，甘草湯漬曝，並解毒致令平和。
# 有剜去瓤免脹，有抽去心除煩。 Each modifier is the model's reading of a phrase; the sizes are [calibrate].
#   direction: added to the herb's 升降浮沉 · tropism: added to the named channels' shares, then renormalised · run_zao: replaces it ·
#   bu_xie: replaces it · harms_scale: multiplies the burden · temperature: added to the signed warmth
PROCESSING = [
    dict(id="jiu", name="酒製", words=["酒製", "酒炙", "酒洗", "酒浸", "酒炒", "酒蒸", "酒洒"], says="酒製升提", modifiers={"direction": 0.3}, citation="bencao-mengquan-zhizao-1"),
    dict(id="jiang", name="薑製", words=["薑製", "薑汁炙", "薑汁炒", "薑炙"], says="薑製發散", modifiers={"direction": 0.2}, citation="bencao-mengquan-zhizao-1"),
    dict(id="yan", name="鹽製", words=["鹽製", "鹽炙", "鹽水炒", "鹽炒"], says="入鹽走腎臟，仍使軟堅", modifiers={"tropism": {"腎": 0.3}, "direction": -0.2}, citation="bencao-mengquan-zhizao-1"),
    dict(id="cu", name="醋製", words=["醋製", "醋炙", "醋炒", "醋煮"], says="用醋注肝經，且資住痛", modifiers={"tropism": {"肝": 0.3}}, citation="bencao-mengquan-zhizao-1"),
    dict(id="tongbian", name="童便製", words=["童便製", "童便浸"], says="童便製，除劣性降下", modifiers={"direction": -0.3, "harms_scale": 0.8}, citation="bencao-mengquan-zhizao-1"),
    dict(id="migan", name="米泔製", words=["米泔製", "米泔浸"], says="米泔製，去燥性和中", modifiers={"run_zao": "平", "tropism": {"脾": 0.1}}, citation="bencao-mengquan-zhizao-1"),
    dict(id="ru", name="乳製", words=["乳製", "乳拌"], says="乳製滋潤回枯，助生陰血", modifiers={"run_zao": "潤"}, citation="bencao-mengquan-zhizao-1"),
    dict(id="mi", name="蜜製", words=["蜜製", "蜜炙"], says="蜜製甘緩難化，增益元陽", modifiers={"run_zao": "潤", "bu_xie": "補", "harms_scale": 0.8}, citation="bencao-mengquan-zhizao-1"),
    dict(id="tu", name="土製", words=["土製", "土炒", "陳壁土炒"], says="陳壁土製，竊真氣驟補中焦", modifiers={"tropism": {"脾": 0.3}, "bu_xie": "補"}, citation="bencao-mengquan-zhizao-1"),
    dict(id="fu", name="麩製", words=["麩製", "麩炒"], says="麥麩皮製，抑酷性勿傷上膈", modifiers={"harms_scale": 0.8}, citation="bencao-mengquan-zhizao-1"),
    dict(id="jiedu", name="甘草湯、烏豆湯漬", words=["甘草湯漬", "甘草湯浸", "烏豆湯漬", "黑豆汁製"], says="烏豆湯，甘草湯漬曝，並解毒致令平和", modifiers={"harms_scale": 0.6},
         citation="bencao-mengquan-zhizao-1"),
    dict(id="quran", name="去瓤", words=["去瓤"], says="剜去瓤免脹", modifiers={"harms_scale": 0.9}, citation="bencao-mengquan-zhizao-2"),
    dict(id="quxin", name="去心", words=["去心"], says="抽去心除煩", modifiers={"harms_scale": 0.9}, citation="bencao-mengquan-zhizao-2"),
    dict(id="wei", name="煨", words=["煨"], says="煨後辛散減而溫中和胃增 (textbook statement, unverified)", modifiers={"direction": -0.2}, citation=None),
]
# words of the formula data that are cleaning or cutting, with no effect on the herb's action
CLEANING = ["去皮", "去節", "湯去皮尖", "去皮尖", "洗", "湯洗", "切", "擘", "掰", "碎", "綿裹"]

# ── 量效 ───────────────────────────────────────────────────────────────────
# Herbs whose action changes with the amount, each from a verified passage. `small` applies below PARAMS.bands.small_below of the typical dose,
# `large` above large_above. direction: replaces the herb's 升降浮沉 · effects_add / harms_add: added to the effects / harms ·
# effects_scale: multiplies the named effects · tropism: added to the channels' shares
DOSE_BANDS = [
    dict(herb="葛根", citation="bencao-xinbian-gegen-1", says="少用則浮而外散，多用則沉而內降",
         small={"direction": 0.6, "effects_add": {"bagang.exterior": -0.2}}, large={"direction": -0.3, "effects_add": {"liuxie.火": -0.2}}),
    dict(herb="人參", citation="bencao-xinbian-renshen-1", says="少用則泛上，多用則沉下",
         small={"direction": 0.3}, large={"direction": -0.2, "tropism": {"腎": 0.15, "肝": 0.1}}),
    dict(herb="升麻", citation="depei-bencao-shengma-1", says="多用則散，少用則升",
         small={"direction": 0.9}, large={"direction": 0.4, "effects_add": {"bagang.exterior": -0.2}}),
    dict(herb="蘇木", citation="benjing-fengyuan-sumu-1", says="少用則和血，多用則破血",
         small={"effects_add": {"肝.blood": 0.1}}, large={"effects_scale": {"product.瘀": 1.5}, "harms_add": {"肝.blood": -0.2}}),
    dict(herb="紅花", citation="waike-quansheng-honghua-1", says="少用通經活血，多用破血",
         small={}, large={"effects_scale": {"product.瘀": 1.5}, "harms_add": {"肝.blood": -0.2}}),
]
