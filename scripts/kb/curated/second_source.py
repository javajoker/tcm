"""Second-source checks of the formulas whose source book in the reference copy is incomplete (K-14).

The reference copies of the classical books (GB18030 compilations) lose a few characters (芪, 芎, …), so for six formulas the composition could only be partly matched
against the source book. Each entry here records what a second, independent edition on Wikisource (維基文庫) says about the same formula, checked on 2026-10-04.

Method, and its limit: the pages were read with a page-to-text tool that returns the passage it finds; the quotations below were not compared byte for byte with the
page source. Every herb of our composition was looked for in the entry. An entry whose `herbs_not_found` is empty lets the builder raise the formula to
`verified-against-second-source`; one that is not empty keeps `partially-verified` and the reason in `note`.
"""
from __future__ import annotations

CHECKED = "2026-10-04"
SITE = "維基文庫 (zh.wikisource.org)"
METHOD = "page read with a page-to-text tool; the herbs were looked for in the entry, the passage was not compared byte for byte with the page source"

_ju = "%E5%A4%AA%E5%B9%B3%E6%83%A0%E6%B0%91%E5%92%8C%E5%8A%91%E5%B1%80%E6%96%B9_(%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC)"
_danxi = "https://zh.wikisource.org/zh-hant/%E4%B8%B9%E6%BA%AA%E5%BF%83%E6%B3%95"

SECOND_SOURCE: dict[str, dict] = {
    "F_SHENLING": {
        "page": "太平惠民和剂局方 (四库全书本)/卷3", "url": f"https://zh.wikisource.org/zh-hans/{_ju}/%E5%8D%B73", "entry": "參苓白朮散",
        "herbs_found": ["人參", "白朮", "茯苓", "山藥", "蓮子", "白扁豆", "薏苡仁", "砂仁", "桔梗", "甘草"], "herbs_not_found": [],
        "note": "All ten herbs are in the entry (the source lists 蓮子肉, 縮砂仁 and 白茯苓 under their full names).",
    },
    "F_BUZHONG": {
        "page": "內外傷辨惑論/卷中", "url": "https://zh.wikisource.org/wiki/%E5%85%A7%E5%A4%96%E5%82%B7%E8%BE%A8%E6%83%91%E8%AB%96/%E5%8D%B7%E4%B8%AD", "entry": "補中益氣湯",
        "herbs_found": ["黃耆", "人參", "白朮", "炙甘草", "當歸", "陳皮", "升麻", "柴胡"], "herbs_not_found": [],
        "note": "The same author's earlier text of the formula (it is repeated in the 脾胃論 the record cites, where the reference copy has lost 耆); 橘皮 is 陳皮, 當歸身 is 當歸.",
    },
    "F_XIAOYAO": {
        "page": "太平惠民和剂局方 (四库全书本)/卷9", "url": f"https://zh.wikisource.org/zh-hans/{_ju}/%E5%8D%B79", "entry": "逍遙散",
        "herbs_found": ["柴胡", "當歸", "芍藥", "白朮", "茯苓", "炙甘草", "薄荷", "生薑"], "herbs_not_found": [],
        "note": "Six herbs in the powder and 燒生薑 and 薄荷 added when it is decocted.",
    },
    "F_YUEJU": {
        "page": "丹溪心法 (六鬱)", "url": _danxi, "entry": "越鞠丸",
        "herbs_found": ["香附", "川芎", "蒼朮", "神曲", "梔子"], "herbs_not_found": [],
        "note": "All five herbs; the text writes the 川芎 as 撫芎 (a form of 川芎), which is what the reference copy lost.",
    },
    "F_YUPINGFENG": {
        "page": "丹溪心法 (自汗)", "url": _danxi, "entry": "玉屏風散",
        "herbs_found": ["黃耆", "白朮", "防風"], "herbs_not_found": [],
        "note": "防風 and 黃耆 one 兩 each, 白朮 two 兩 (the reference copy has lost 耆).",
    },
    "F_GUIPI": {
        "page": "濟生方 (驚悸怔忡健忘門)", "url": "https://zh.wikisource.org/wiki/%E6%BF%9F%E7%94%9F%E6%96%B9", "entry": "歸脾湯",
        "herbs_found": ["黃耆", "龍眼肉", "人參", "白朮", "酸棗仁", "茯神", "木香", "炙甘草"], "herbs_not_found": ["當歸", "遠志"],
        "note": "The original 濟生方 formula has eight herbs; 當歸 and 遠志 were added later (薛己), as the source note says. The app lists the common ten-herb form, so the composition stays partly verified.",
    },
}
