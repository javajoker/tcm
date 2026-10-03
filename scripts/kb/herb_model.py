"""Herb model: derive the numeric yin-yang / five-phase / organ attributes of an herb.

Everything here is a TRANSPARENT RULE SET applied to structured source fields (四氣, 五味, 歸經, 功效 keywords),
so every derived number can be traced and corrected. Derived values are machine drafts (`status: derived`);
the curated overlay (curated/herbs.py) overrides them for the herbs used in the MVP formulas.

Panel convention (see curated/panel.py): an herb's EFFECT is the change it makes to the panel of the person
taking it. Taking a qi tonic raises "脾.qi" (+); a heat-clearing herb lowers "liuxie.火" (−). Matching a formula to a
patient is then "choose herbs whose effect offsets the deviation".
"""
from __future__ import annotations

import re

# 四氣 → signed warmth. 微 halves, 大 raises to ±3.
TEMP = {"大寒": -3.0, "寒": -2.0, "微寒": -1.0, "涼": -1.0, "平": 0.0, "微溫": 0.5, "溫": 1.0, "熱": 2.0, "大熱": 3.0}

# 五味 → 五行 (《素問·宣明五氣》/《至真要大論》; 淡 渗 belongs with 土 (spleen-dampness), 澀 with 酸's astringent action)
FLAVOR_ELEMENT = {"酸": "木", "苦": "火", "甘": "土", "辛": "金", "鹹": "水", "淡": "土", "澀": "木"}

# 《素問·生氣通天論》: 味過於… — what an EXCESS of each flavour damages (verified quotes suwen-003-1…5)
FLAVOR_EXCESS_HARM = {
    "酸": {"organ": "脾", "channel": "qi", "citation": "suwen-003-1"},
    "鹹": {"organ": "心", "channel": "qi", "citation": "suwen-003-2"},
    "甘": {"organ": "腎", "channel": "qi", "citation": "suwen-003-3"},
    "苦": {"organ": "脾", "channel": "qi", "citation": "suwen-003-4"},
    "辛": {"organ": "肝", "channel": "blood", "citation": "suwen-003-5"},
}

ORGAN_OF_CHANNEL = {"肝": "肝", "膽": "膽", "心": "心", "小腸": "小腸", "脾": "脾", "胃": "胃", "肺": "肺", "大腸": "大腸", "腎": "腎", "膀胱": "膀胱"}
ZANG = {"肝", "心", "脾", "肺", "腎"}

# (simplified keywords in 功效, target template, delta, organ selector)
#   selector: gui_zang = zang among 歸經; gui_any = any organ among 歸經; fixed:<organ>; none
EFFECT_RULES = [
    (["补气", "益气", "大补元气", "补中益气", "健脾益气", "升阳举陷"], "{o}.qi", +0.5, "gui_zang"),
    (["健脾", "补脾", "益脾"], "脾.qi", +0.4, "none"),
    (["补血", "养血", "益精血", "生血", "补血活血"], "{o}.blood", +0.5, "gui_zang"),
    (["滋阴", "养阴", "益阴", "生津", "润肺", "养胃", "补阴", "滋肾", "清热养阴", "益胃生津"], "{o}.yin", +0.5, "gui_any"),
    (["补阳", "壮阳", "温肾", "助阳", "补火助阳", "温补肾阳", "补肾阳", "回阳", "回阳救逆"], "{o}.yang", +0.5, "gui_zang"),
    (["温中", "温里", "温经", "散寒", "祛寒"], "liuxie.寒", -0.5, "none"),
    (["温中", "温脾"], "脾.yang", +0.3, "none"),
    (["清热", "泻火", "清热泻火", "清热解毒", "凉血", "清心", "清肝", "清肺", "清胃", "退热", "清热凉血", "清虚热", "退虚热"], "liuxie.火", -0.5, "none"),
    (["清热", "泻火", "清热泻火", "清心", "清肝", "清肺", "清胃"], "{o}.yang", -0.2, "gui_any"),
    (["燥湿", "祛湿", "利湿", "利水", "渗湿", "化湿", "除湿", "祛风湿", "利尿", "利水消肿", "利湿退黄", "清热燥湿", "清热利湿", "利尿通淋"], "liuxie.濕", -0.5, "none"),
    (["化痰", "祛痰", "燥湿化痰", "清热化痰", "化痰止咳", "化痰散结"], "product.痰", -0.5, "none"),
    (["活血", "化瘀", "散瘀", "破血", "祛瘀", "活血化瘀", "活血止痛", "活血调经", "活血通经"], "product.瘀", -0.5, "none"),
    (["行气", "理气", "疏肝", "解郁", "疏肝解郁", "破气", "理气宽中", "行气止痛", "理气止痛", "疏肝理气"], "{o}.stasis", -0.5, "gui_any"),
    (["祛风", "疏风", "息风", "祛风止痛", "祛风通络", "疏散风热", "疏散风寒", "祛风解表"], "liuxie.風", -0.5, "none"),
    (["润燥", "润肺", "润肠", "润肠通便"], "liuxie.燥", -0.3, "none"),
    (["消食", "消积", "健胃消食", "化食", "消食化积"], "product.食積", -0.5, "none"),
    (["利水", "逐饮", "利水渗湿", "温化水饮"], "product.飲", -0.3, "none"),
    (["解表", "发表", "发汗", "疏散风热", "疏散风寒", "发散风寒", "发散"], "bagang.exterior", -0.5, "none"),
]

CATEGORY_PREGNANCY_FLOOR = {"活血化瘀药": "caution", "泻下药": "caution", "开窍药": "caution", "涌吐药": "caution", "攻毒杀虫止痒药": "caution"}


def parse_temps(siqi: list[str]) -> float:
    vals = [TEMP[s] for s in siqi if s in TEMP]
    return sum(vals) / len(vals) if vals else 0.0


def parse_flavors(wuwei: list[str]) -> tuple[list[dict], list[str]]:
    """→ ([{flavor, weight}], data-quality notes). Entries that are really temperatures are dropped."""
    flavors, notes = [], []
    for w in wuwei:
        if w in TEMP:
            notes.append(f"wuwei contains the temperature word {w}; ignored")
            continue
        base = w[1:] if w.startswith("微") else w
        if base not in FLAVOR_ELEMENT:
            notes.append(f"unknown flavour {w}")
            continue
        flavors.append({"flavor": base, "weight": 0.5 if w.startswith("微") else 1.0})
    return flavors, notes


def parse_organs(guijing: list[str]) -> list[str]:
    """歸經 entries (Simplified, sometimes without the 經 suffix) → Traditional organ names."""
    from .common import tw
    out = []
    for g in guijing:
        name = tw(g.removesuffix("经").removesuffix("經"))
        if name not in out:
            out.append(name)
    return out


def derive_effects(zhifa: list[str], organs: list[str]) -> dict[str, float]:
    text = "｜".join(zhifa)
    zang = [o for o in organs if o in ZANG]
    anyorg = [o for o in organs if o in ORGAN_OF_CHANNEL]
    eff: dict[str, float] = {}
    for kws, target, delta, selector in EFFECT_RULES:
        if not any(k in text for k in kws):
            continue
        if "{o}" in target:
            chosen = zang if selector == "gui_zang" else anyorg
            if not chosen:
                chosen = anyorg[:1]
            for o in chosen:
                key = target.replace("{o}", o)
                eff[key] = eff.get(key, 0.0) + delta
        else:
            eff[target] = eff.get(target, 0.0) + delta
    return {k: round(max(-1.5, min(1.5, v)), 2) for k, v in eff.items() if abs(v) > 1e-9}


def derive_harms(temp: float, flavors: list[dict], tags: list[str], organs: list[str]) -> dict[str, float]:
    """Rule-derived 弊 (burden) weights, same units as effects but with sign meaning 'lowers the channel'."""
    h: dict[str, float] = {}

    def add(key: str, v: float) -> None:
        h[key] = round(h.get(key, 0.0) + v, 2)

    fl = {f["flavor"]: f["weight"] for f in flavors}
    if temp <= -2:                       # 寒涼傷陽
        mag = 0.25 if temp > -3 else 0.4
        add("脾.yang", -mag)
        add("腎.yang", -mag)
    if "苦" in fl and temp <= -1:        # 苦寒敗胃
        add("脾.qi", -0.25)
    if temp >= 2:                        # 辛熱傷陰
        mag = 0.25 if temp < 3 else 0.4
        add("腎.yin", -mag)
        add("肝.yin", -mag)
    if "滋膩" in tags:                    # 滋膩礙脾
        add("脾.qi", -0.25)
    if "辛散" in tags:                    # 辛散耗氣
        add("肺.qi", -0.15)
    if "甘壅" in tags:                    # 甘壅助濕
        add("liuxie.濕", +0.15)
    if "活血" in tags:                    # 活血動血，耗血
        add("肝.blood", -0.15)
    if "燥烈" in tags:                    # 燥烈傷陰
        add("肺.yin", -0.15)
        add("胃.yin", -0.15)
    return h


def pregnancy_level(note_text: str, category: str, curated: str | None) -> str:
    if curated:
        return curated
    if re.search(r"孕妇(禁用|忌用)", note_text):
        return "avoid"
    if re.search(r"孕妇慎用", note_text):
        return "caution"
    return CATEGORY_PREGNANCY_FLOOR.get(category, "ok-unreviewed")


def is_toxic(property_sentence: str, curated: bool | None) -> bool:
    if curated is not None:
        return curated
    return bool(re.search(r"(大毒|小毒|有毒)", property_sentence))
