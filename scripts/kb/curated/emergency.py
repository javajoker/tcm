"""Regional emergency and crisis numbers (safety policy §5; task K-09).

Shown on the blocking notices N-A / N-B and on the self-harm red flag, chosen by the user's region. Taiwan is the default (PRD Q1, decided).
These are public facts but a WRONG number is a safety incident (safety policy §9, S1): every row is `needs-review` until the regional owner
verifies it, and the list lives in data so it can be corrected without a release of the app.
"""
from __future__ import annotations

DEFAULT_REGION = "TW"


def _n(number: str, zh: str, en: str) -> dict:
    return {"number": number, "label": {"zh-Hant": zh, "en": en}}


def _r(rid: str, zh: str, en: str, emergency: list[dict], crisis: list[dict] | None = None) -> dict:
    return {"id": rid, "name": {"zh-Hant": zh, "en": en}, "emergency": emergency, "crisis": crisis or [], "status": "draft"}


_FIRE_AMB = ("消防與救護車", "Fire and ambulance")
_EMERGENCY = ("緊急電話", "Emergency services")
_AMBULANCE = ("救護車", "Ambulance")
_POLICE = ("警察", "Police")

REGIONS = [
    _r("TW", "台灣", "Taiwan", [_n("119", *_FIRE_AMB)], [_n("1925", "安心專線（心理健康諮詢）", "Mental-health support line")]),
    _r("HK", "香港", "Hong Kong", [_n("999", *_EMERGENCY)]),
    _r("MO", "澳門", "Macau", [_n("999", *_EMERGENCY)]),
    _r("CN", "中國大陸", "Mainland China", [_n("120", *_AMBULANCE), _n("110", *_POLICE)]),
    _r("JP", "日本", "Japan", [_n("119", *_FIRE_AMB)]),
    _r("SG", "新加坡", "Singapore", [_n("995", *_AMBULANCE)]),
    _r("US", "美國", "United States", [_n("911", *_EMERGENCY)], [_n("988", "988 自殺與危機生命線", "988 Suicide and Crisis Lifeline")]),
    _r("CA", "加拿大", "Canada", [_n("911", *_EMERGENCY)]),
    _r("GB", "英國", "United Kingdom", [_n("999", *_EMERGENCY)]),
    _r("EU", "歐盟", "European Union", [_n("112", *_EMERGENCY)]),
    _r("AU", "澳洲", "Australia", [_n("000", *_EMERGENCY)]),
    # no number: the notice then says "call your local emergency number"
    _r("OTHER", "其他或不確定", "Other or not sure", []),
]
