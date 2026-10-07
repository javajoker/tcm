"""Herb property model v2 (PM-36): a herb's coordinates in the tradition's own terms.

    陰陽 (yinyang, −1 … +1) · 五行 (five_phase, five shares summing to 1) · 升降浮沉 (direction, −1 沉降 … +1 升浮) · 毒性 (toxicity grade) ·
    補瀉 (bu_xie) · 潤燥 (run_zao) · 氣血分 (qi_xue) · 歸經 weights (tropism) · 藥用部位 (part)

Every value is DERIVED by a named rule from the source fields (四氣, 五味, 歸經, category, 功效, part used, the property sentence) or set by a
small curated overlay, and keeps the ids of the rules that produced it (`props_rules`), so a reviewer corrects a rule, not a number. The rules
and their classical grounds are listed in RULES and in the design (docs/post-mvp/design/prescription-model.md §3); the weights are PARAMS and
are stored with the data, so changing one is a knowledge-base change.

Nothing here changes `effects`, `harms` or anything the diagnosis or the formula ranking reads: the properties feed the prescription model
(direction of qi, the person's constitution, the explanation) and the learning pages.
"""
from __future__ import annotations

from .herb_model import FLAVOR_ELEMENT

PHASES = ("木", "火", "土", "金", "水")
ORGAN_PHASE = {"肝": "木", "膽": "木", "心": "火", "小腸": "火", "心包": "火", "三焦": "火", "脾": "土", "胃": "土", "肺": "金", "大腸": "金", "腎": "水", "膀胱": "水"}

PARAMS = {
    "yinyang": {"qi": 0.5, "flavour": 0.3, "direction": 0.2},
    "five_phase": {"flavour": 0.6, "tropism": 0.4},
    "direction": {"category_function": 0.5, "qiwei": 0.3, "part": 0.2, "function_cap": 0.6},
    "tropism_order": [1.0, 0.8, 0.65, 0.5, 0.4, 0.35],
    "direction_label": {"up": 0.2, "down": -0.2},
}

# rule id → (what it says, the verified quotation it rests on, or None for a modern convention)
RULES: dict[str, tuple[str, str | None]] = {
    "yy.qi": ("溫熱為陽，寒涼為陰: the signed warmth / 3", "suwen-005-12"),
    "yy.flavour": ("辛甘淡為陽，酸苦鹹為陰 (澀 with 酸): the weighted mean of the flavours", "suwen-074-13"),
    "yy.direction": ("升浮為陽，沉降為陰: the direction", None),
    "wx.flavour": ("五味所入: 酸木 苦火 甘土 辛金 鹹水 (淡 with 甘, 澀 with 酸)", "suwen-023-1"),
    "wx.tropism": ("歸經: each organ's phase, weighted by its place in the list", "suwen-005-6"),
    "dir.category": ("The category's usual direction (解表、湧吐 升浮; 瀉下、平肝、安神、利水、收澀、清熱 沉降)", None),
    "dir.function": ("功效 words that name a direction (升陽、舉陷、發散、透疹、宣肺 ↑; 降氣、降逆、平喘、潛陽、重鎮、瀉下、利尿、引血下行 ↓)", "suwen-074-15"),
    "dir.qiwei": ("酸鹹無升，甘辛無降，寒無浮，熱無沉", "bencao-gangmu-shengjiang"),
    "dir.part": ("輕虛者浮而升，重實者沉而降: flowers and leaves light, seeds and fruits heavier, minerals and shells heavy", "bencao-beiyao-xingzhi-1"),
    "dir.overlay": ("A direction the tradition states for this herb (textbook statement, to be verified)", None),
    "tox.text": ("The Pharmacopoeia's grade: 有大毒 · 有毒 · 有小毒 · none (the classical 大毒 常毒 小毒 無毒)", "suwen-070-4"),
    "tox.curated": ("The curated toxicity flag of the herb", None),
    "bx.category": ("The category: 補虛 補; the categories that remove a pathogen or a product 瀉", "suwen-020-1"),
    "bx.function": ("For the other categories: 功效 words of 補 only (補、益、養、滋、填、生津、助陽) → 補; of 瀉 only (清、瀉、破、攻、逐、化瘀、消、利、祛、除、鎮) → 瀉", "suwen-020-1"),
    "bx.warming": ("溫裡: 補 when it tonifies the fire of the kidney (補火、補陽、壯陽、溫腎), otherwise 平 — warming is a method of its own", None),
    "bx.even": ("Both or neither", None),
    "rz.function": ("功效 words of 潤 (滋陰、養陰、生津、潤燥、養血、填精…) against those of 燥 (燥濕、化濕、祛風濕、溫燥…)", "suwen-074-14"),
    "rz.category": ("化濕 and 祛風濕 herbs are drying", "suwen-074-14"),
    "rz.tag": ("The curated tags 滋膩 (潤) and 燥烈 (燥)", None),
    "rz.taste": ("辛苦而溫 dries; 甘而寒涼 moistens (only when the functions say nothing)", "suwen-074-14"),
    "rz.even": ("Neither prevails", None),
    "qx.function": ("功效 words of 氣分 (補氣、理氣、行氣、降氣、疏肝…) and of 血分 (補血、活血、化瘀、止血、涼血…); with both, the first-listed function decides, and 兼 when it names both (川芎 活血行氣: 血中氣藥)", None),
    "qx.category": ("理氣 氣分; 活血化瘀 and 止血 血分", None),
    "qx.texture": ("枯燥者入氣分，潤澤者入血分 (only when the functions and the category say nothing)", "bencao-beiyao-xingzhi-2"),
    "gj.order": ("歸經 in the order listed, the first weighted most", None),
    "part.text": ("藥用部位 as the Pharmacopoeia states it", None),
}

# ── 升降浮沉 ────────────────────────────────────────────────────────────────

CATEGORY_DIRECTION = {
    "解表藥": 0.6, "湧吐藥": 0.6, "開竅藥": 0.3, "化濕藥": 0.1, "祛風濕藥": 0.1, "溫裡藥": 0.1,
    "瀉下藥": -0.7, "平肝息風藥": -0.5, "安神藥": -0.4, "利水滲濕藥": -0.4, "收澀藥": -0.3, "清熱藥": -0.3,
    "消食藥": -0.2, "驅蟲藥": -0.2, "化痰止咳平喘藥": -0.2, "止血藥": -0.1,
}
FUNCTION_DIRECTION = [
    (("升陽", "舉陷", "升舉", "升提", "載藥上行"), 0.5),
    (("湧吐", "催吐"), 0.5),
    (("發散", "發汗", "發表", "解表", "解肌", "透疹", "宣肺", "通鼻竅", "清利頭目"), 0.3),
    (("引血下行", "引火歸元", "潛陽", "重鎮", "鎮驚", "鎮心", "瀉下", "攻下", "逐水", "瀉水"), -0.5),
    (("降氣", "降逆", "納氣", "下氣"), -0.4),
    (("止嘔", "平喘", "通便", "潤腸", "滑腸", "利尿", "利水", "滲濕", "通淋", "破氣"), -0.3),
    (("收斂", "固澀", "斂汗", "止瀉", "縮尿", "固精", "平肝"), -0.2),
]
# 藥用部位 → class. The class is the one whose word comes FIRST in the text (the head of "根莖和葉柄殘基" is 根莖), the longest word winning a tie
# (果皮 over 果). 本草備要: 輕虛者浮而升，重實者沉而降; 質之輕者上入心肺，重者下入肝腎.
PART_CLASSES = {
    "重": (-0.5, ("礦石", "礦物", "化石", "貝殼", "鐵屑", "珍珠", "背甲", "腹甲", "鱗甲", "角", "結石", "黃土")),
    "子實": (-0.2, ("種子", "種仁", "果實", "幼果", "果核", "果序", "果穗", "孢子")),
    "花葉": (0.3, ("花", "葉", "嫩枝", "枝梢", "地上部分", "全草", "全株")),
    "根莖": (0.0, ("根", "莖", "皮", "心材", "木材", "髓", "菌核", "子實體", "樹脂", "加工品", "炮製品", "體", "殼", "膠", "蜜", "糞", "柱頭", "冬芽")),
}


def part_class(part: str | None) -> str | None:
    best: tuple[int, int, str] | None = None
    for cls, (_delta, words) in PART_CLASSES.items():
        for w in words:
            i = part.find(w) if part else -1
            if i >= 0 and (best is None or (i, -len(w)) < (best[0], best[1])):
                best = (i, -len(w), cls)
    return best[2] if best else None
# A direction the tradition states for a named herb: 諸花皆升，旋覆獨降；諸子皆降，蔓荊獨升; 桔梗載藥上行; 牛膝引血下行; the heavy settling
# minerals; the qi-lowering herbs; the yang-raising herbs. Textbook statements, unverified like the other curated drafts.
DIRECTION_OVERLAY = {
    "升麻": 0.8, "柴胡": 0.6, "葛根": 0.5, "桔梗": 0.6, "蔓荊子": 0.5, "川芎": 0.4, "麻黃": 0.6,
    "旋覆花": -0.6, "牛膝": -0.6, "川牛膝": -0.5, "赭石": -0.9, "代赭石": -0.9, "磁石": -0.8, "石決明": -0.7, "龍骨": -0.6, "牡蠣": -0.6,
    "枳實": -0.6, "厚朴": -0.5, "沉香": -0.6, "大黃": -0.8, "芒硝": -0.8, "紫蘇子": -0.5, "苦杏仁": -0.4, "半夏": -0.4,
}

# ── 補瀉 · 潤燥 · 氣血分 ─────────────────────────────────────────────────────

BU_CATEGORIES = {"補虛藥"}
XIE_CATEGORIES = {"清熱藥", "瀉下藥", "活血化瘀藥", "理氣藥", "化濕藥", "利水滲濕藥", "祛風濕藥", "消食藥", "驅蟲藥", "化痰止咳平喘藥", "解表藥", "湧吐藥",
                  "攻毒殺蟲止癢藥", "拔毒化腐生肌藥", "開竅藥", "平肝息風藥"}
BU_WORDS = ("補", "益", "養", "滋", "填", "生津", "助陽", "壯陽")
XIE_WORDS = ("清", "瀉", "破", "攻", "逐", "化瘀", "散瘀", "消", "利", "祛", "除", "鎮")
# warming herbs: 溫 is its own method (八法), neither 補 nor 瀉, unless the herb tonifies the fire of the kidney
WARMING_BU_WORDS = ("補火", "補陽", "壯陽", "溫腎", "補腎")

RUN_WORDS = ("滋陰", "養陰", "補陰", "益陰", "生津", "潤燥", "潤肺", "潤腸", "滑腸", "養血", "補血", "益精", "填精", "填髓", "益胃", "滋腎", "滋補")
ZAO_WORDS = ("燥濕", "化濕", "祛濕", "除濕", "勝濕", "祛風濕", "溫燥")       # not 收濕 (斂瘡): an external use
RUN_CATEGORIES: set[str] = set()
ZAO_CATEGORIES = {"化濕藥", "祛風濕藥"}

QI_WORDS = ("補氣", "益氣", "理氣", "行氣", "降氣", "破氣", "下氣", "疏肝", "解鬱", "升陽", "寬中", "納氣", "調氣", "大補元氣", "瀉火")   # 瀉火: 清氣分熱 (石膏、知母)
XUE_WORDS = ("補血", "養血", "活血", "化瘀", "祛瘀", "散瘀", "破血", "止血", "涼血", "調經", "和血", "生血", "逐瘀")
QI_CATEGORIES = {"理氣藥"}
XUE_CATEGORIES = {"活血化瘀藥", "止血藥"}

YANG_FLAVOURS = {"辛": 1.0, "甘": 1.0, "淡": 1.0, "酸": -1.0, "苦": -1.0, "鹹": -1.0, "澀": -1.0}
# 李時珍: 酸鹹無升，甘辛無降. 苦 mostly descends (泄); 淡 drains downward (滲泄); 澀 holds.
DIRECTION_FLAVOURS = {"辛": 1.0, "甘": 1.0, "酸": -1.0, "鹹": -1.0, "苦": -0.5, "淡": -0.3, "澀": -0.5}


def _norm(text: str) -> str:
    return text.replace("昇", "升")        # OpenCC writes 補氣昇陽; the rules use 升


def _clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _weighted_mean(flavors: list[dict], table: dict[str, float]) -> float | None:
    total = sum(f["weight"] for f in flavors if f["flavor"] in table)
    if total == 0:
        return None
    return sum(f["weight"] * table[f["flavor"]] for f in flavors if f["flavor"] in table) / total


def _normalise(v: dict[str, float]) -> dict[str, float]:
    s = sum(v.values())
    return {k: v[k] / s for k in v} if s > 0 else v


def _round_shares(shares: dict[str, float], keys: tuple[str, ...] | list[str]) -> dict[str, float]:
    """Round to three decimals so that the shares still sum to exactly 1 (the largest share takes the remainder)."""
    out = {k: round(shares.get(k, 0.0), 3) for k in keys}
    if out:
        big = max(out, key=lambda k: (out[k], -list(keys).index(k)))
        out[big] = round(out[big] + 1.0 - sum(out.values()), 3)
    return out


def tropism(organs: list[str]) -> dict[str, float]:
    order = PARAMS["tropism_order"]
    raw = {o: order[min(i, len(order) - 1)] for i, o in enumerate(organs)}
    return _round_shares(_normalise(raw), organs)


def five_phase(flavors: list[dict], organs: list[str]) -> tuple[list[float] | None, list[str]]:
    """The shares of 木火土金水, in that order."""
    rules: list[str] = []
    fp = {p: 0.0 for p in PHASES}
    for f in flavors:
        fp[FLAVOR_ELEMENT[f["flavor"]]] += f["weight"]
    tp = {p: 0.0 for p in PHASES}
    for o, w in tropism([o for o in organs if o in ORGAN_PHASE]).items():
        tp[ORGAN_PHASE[o]] += w
    parts = []
    if sum(fp.values()) > 0:
        parts.append((PARAMS["five_phase"]["flavour"], _normalise(fp)))
        rules.append("wx.flavour")
    if sum(tp.values()) > 0:
        parts.append((PARAMS["five_phase"]["tropism"], _normalise(tp)))
        rules.append("wx.tropism")
    if not parts:
        return None, rules
    total = sum(w for w, _ in parts)
    mix = {p: sum(w * v[p] for w, v in parts) / total for p in PHASES}
    shares = _round_shares(mix, PHASES)
    return [shares[p] for p in PHASES], rules


def direction(name: str, category: str, functions: list[str], flavors: list[dict], temperature: float, part: str | None) -> tuple[float, list[str]]:
    if name in DIRECTION_OVERLAY:
        return DIRECTION_OVERLAY[name], ["dir.overlay"]
    rules: list[str] = []
    p = PARAMS["direction"]
    cat = CATEGORY_DIRECTION.get(category, 0.0)
    if cat:
        rules.append("dir.category")
    text = _norm("｜".join(functions))
    fn = 0.0
    for words, delta in FUNCTION_DIRECTION:
        if any(w in text for w in words):
            fn += delta
    if fn:
        rules.append("dir.function")
    cat_fn = _clamp(cat + _clamp(fn, -p["function_cap"], p["function_cap"]))
    fl = _weighted_mean(flavors, DIRECTION_FLAVOURS)
    qiwei = _clamp(0.5 * (fl or 0.0) + 0.5 * _clamp(temperature / 3))
    if fl is not None or temperature:
        rules.append("dir.qiwei")
    cls = part_class(part)
    pt = PART_CLASSES[cls][0] if cls else 0.0
    if pt:
        rules.append("dir.part")
    value = _clamp(p["category_function"] * cat_fn + p["qiwei"] * qiwei + p["part"] * pt)
    return round(value, 2), rules


def yinyang(flavors: list[dict], temperature: float, dir_value: float) -> tuple[float, list[str]]:
    w = PARAMS["yinyang"]
    rules = ["yy.qi"]
    fl = _weighted_mean(flavors, YANG_FLAVOURS)
    if fl is not None:
        rules.append("yy.flavour")
    rules.append("yy.direction")
    value = _clamp(w["qi"] * _clamp(temperature / 3) + w["flavour"] * (fl or 0.0) + w["direction"] * dir_value)
    return round(value, 2), rules


def toxicity(property_sentence: str, curated_toxic: bool | None) -> tuple[str, list[str]]:
    s = property_sentence
    grade = "大毒" if "大毒" in s else "小毒" if "小毒" in s else "有毒" if "有毒" in s else "無毒"
    rules = ["tox.text"]
    if curated_toxic is True and grade == "無毒":
        grade, rules = "有毒", ["tox.curated"]
    elif curated_toxic is False and grade != "無毒":
        grade, rules = "無毒", ["tox.curated"]
    return grade, rules


def _count(text: str, words: tuple[str, ...]) -> int:
    return sum(1 for w in words if w in text)


def bu_xie(category: str, functions: list[str]) -> tuple[str, list[str]]:
    if category in BU_CATEGORIES:
        return "補", ["bx.category"]
    if category in XIE_CATEGORIES:
        return "瀉", ["bx.category"]
    text = _norm("｜".join(functions))
    if category == "溫裡藥":
        return ("補" if _count(text, WARMING_BU_WORDS) else "平"), ["bx.warming"]
    bu, xie = _count(text, BU_WORDS), _count(text, XIE_WORDS)
    if bu and not xie:
        return "補", ["bx.function"]
    if xie and not bu:
        return "瀉", ["bx.function"]
    return "平", ["bx.even"]


def run_zao(category: str, functions: list[str], tags: list[str], flavors: list[dict], temperature: float) -> tuple[str, list[str]]:
    text = _norm("｜".join(functions))
    run, zao = _count(text, RUN_WORDS), _count(text, ZAO_WORDS)
    rules = ["rz.function"] if run or zao else []
    if category in ZAO_CATEGORIES:
        zao += 1
        rules.append("rz.category")
    if "滋膩" in tags:
        run += 1
        rules.append("rz.tag")
    if "燥烈" in tags:
        zao += 1
        rules.append("rz.tag")
    if not run and not zao:
        names = {f["flavor"] for f in flavors}
        if {"辛", "苦"} <= names and temperature >= 1:
            return "燥", ["rz.taste"]
        if "甘" in names and temperature <= -1 and category == "補虛藥":
            return "潤", ["rz.taste"]
        return "平", ["rz.even"]
    if run > zao:
        return "潤", rules
    if zao > run:
        return "燥", rules
    return "平", rules + ["rz.even"]


def qi_xue(category: str, functions: list[str], rz: str) -> tuple[str | None, list[str]]:
    text = _norm("｜".join(functions))
    qi, xue = _count(text, QI_WORDS) > 0, _count(text, XUE_WORDS) > 0
    rules = ["qx.function"] if qi or xue else []
    if category in QI_CATEGORIES and not qi:
        qi = True
        rules.append("qx.category")
    if category in XUE_CATEGORIES and not xue:
        xue = True
        rules.append("qx.category")
    if qi and xue:
        first = _norm(functions[0]) if functions else ""
        q1, x1 = _count(first, QI_WORDS) > 0, _count(first, XUE_WORDS) > 0
        if q1 and not x1:
            return "氣", rules
        if x1 and not q1:
            return "血", rules
        return "兼", rules
    if qi:
        return "氣", rules
    if xue:
        return "血", rules
    if rz == "燥":
        return "氣", ["qx.texture"]
    if rz == "潤":
        return "血", ["qx.texture"]
    return None, []


def derive(*, name: str, category: str, functions: list[str], flavors: list[dict], temperature: float, organs: list[str], tags: list[str],
           part: str | None, property_sentence: str, curated_toxic: bool | None) -> tuple[dict, dict[str, list[str]]]:
    """→ (props, props_rules) of one herb."""
    rules: dict[str, list[str]] = {}
    d, rules["direction"] = direction(name, category, functions, flavors, temperature, part)
    yy, rules["yinyang"] = yinyang(flavors, temperature, d)
    wx, rules["five_phase"] = five_phase(flavors, organs)
    tox, rules["toxicity"] = toxicity(property_sentence, curated_toxic)
    bx, rules["bu_xie"] = bu_xie(category, functions)
    rz, rules["run_zao"] = run_zao(category, functions, tags, flavors, temperature)
    qx, rules["qi_xue"] = qi_xue(category, functions, rz)
    rules["tropism"] = ["gj.order"] if organs else []
    rules["part"] = ["part.text"] if part else []
    props = {"yinyang": yy, "five_phase": wx, "direction": d, "toxicity": tox, "bu_xie": bx, "run_zao": rz, "qi_xue": qx,
             "tropism": tropism(organs) if organs else {}, "part": part}
    return props, {k: v for k, v in rules.items() if v}


def conventions() -> dict:
    """What the build writes into herbs.json `_meta.conventions.props`: the scales, the weights and the rules with their grounds."""
    return {
        "scales": {
            "yinyang": "−1 (陰) … +1 (陽)", "direction": "−1 (沉降) … +1 (升浮); |value| < 0.2 reads as 平 (可升可降)", "five_phase": "[木, 火, 土, 金, 水] shares summing to 1",
            "toxicity": "無毒 · 小毒 · 有毒 · 大毒", "bu_xie": "補 · 瀉 · 平", "run_zao": "潤 · 燥 · 平", "qi_xue": "氣 · 血 · 兼 · null", "tropism": "歸經 shares summing to 1",
        },
        "params": PARAMS,
        "rules": {rid: {"says": says, "citation": cit} for rid, (says, cit) in RULES.items()},
        "design": "docs/post-mvp/design/prescription-model.md §3",
    }
