"""Regional emergency and crisis numbers (safety policy §5; task K-09).

Shown on the blocking notices N-A / N-B and on the self-harm red flag, for the region the person chose or whose time zone matches the device's
(there is no silent default: docs/post-mvp/design/tap-tempo-and-regions.md). These are public facts but a WRONG number is a safety incident
(safety policy §9, S1): every row is a draft until a regional owner verifies it, which is recorded in `verification` ({by, at, source, scope}); a
public build (without the draft label) ships only verified rows. The list lives in data so it can be corrected without a release of the app.
"""
from __future__ import annotations


def _n(number: str, zh: str, en: str) -> dict:
    return {"number": number, "label": {"zh-Hant": zh, "en": en}}


def _r(rid: str, zh: str, en: str, emergency: list[dict], crisis: list[dict] | None = None, timezones: list[str] | None = None) -> dict:
    """`timezones`: the IANA zones whose devices are taken to be in this region (used only to PRESELECT the region; the person can always change it)."""
    return {"id": rid, "name": {"zh-Hant": zh, "en": en}, "emergency": emergency, "crisis": crisis or [], "status": "draft", "timezones": timezones or []}


_FIRE_AMB = ("消防與救護車", "Fire and ambulance")
_EMERGENCY = ("緊急電話", "Emergency services")
_AMBULANCE = ("救護車", "Ambulance")
_POLICE = ("警察", "Police")

_US = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "America/Detroit", "America/Boise", "America/Juneau",
       "America/Adak", "America/Indiana/Indianapolis", "America/Kentucky/Louisville", "Pacific/Honolulu"]
_CA = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns", "America/Regina", "America/Montreal"]
_EU = ["Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels", "Europe/Vienna", "Europe/Stockholm", "Europe/Copenhagen", "Europe/Warsaw",
       "Europe/Prague", "Europe/Budapest", "Europe/Athens", "Europe/Helsinki", "Europe/Dublin", "Europe/Lisbon", "Europe/Luxembourg", "Europe/Bucharest", "Europe/Sofia", "Europe/Zagreb",
       "Europe/Ljubljana", "Europe/Bratislava", "Europe/Vilnius", "Europe/Riga", "Europe/Tallinn", "Europe/Malta", "Asia/Nicosia"]
_AU = ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide", "Australia/Darwin", "Australia/Hobart", "Australia/Canberra"]

REGIONS = [
    _r("TW", "台灣", "Taiwan", [_n("119", *_FIRE_AMB)], [_n("1925", "安心專線（心理健康諮詢）", "Mental-health support line")], ["Asia/Taipei"]),
    _r("HK", "香港", "Hong Kong", [_n("999", *_EMERGENCY)], timezones=["Asia/Hong_Kong"]),
    _r("MO", "澳門", "Macau", [_n("999", *_EMERGENCY)], timezones=["Asia/Macau"]),
    _r("CN", "中國大陸", "Mainland China", [_n("120", *_AMBULANCE), _n("110", *_POLICE)], timezones=["Asia/Shanghai", "Asia/Urumqi", "Asia/Chongqing", "Asia/Harbin"]),
    _r("JP", "日本", "Japan", [_n("119", *_FIRE_AMB)], timezones=["Asia/Tokyo"]),
    _r("SG", "新加坡", "Singapore", [_n("995", *_AMBULANCE)], timezones=["Asia/Singapore"]),
    _r("US", "美國", "United States", [_n("911", *_EMERGENCY)], [_n("988", "988 自殺與危機生命線", "988 Suicide and Crisis Lifeline")], _US),
    _r("CA", "加拿大", "Canada", [_n("911", *_EMERGENCY)], timezones=_CA),
    _r("GB", "英國", "United Kingdom", [_n("999", *_EMERGENCY)], timezones=["Europe/London"]),
    _r("EU", "歐盟", "European Union", [_n("112", *_EMERGENCY)], timezones=_EU),
    _r("AU", "澳洲", "Australia", [_n("000", *_EMERGENCY)], timezones=_AU),
    # no number: the notice then says "call your local emergency number"
    _r("OTHER", "其他或不確定", "Other or not sure", []),
]
