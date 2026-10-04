"""Hand corrections to the Chinese names of the birth-place picker (K-10).

The builder picks, for each city, the Chinese name that GeoNames lists most consistently (converted to Traditional, a suffix such as 市 dropped); a few of its alternate names
are old, regional or Japanese forms, and some places have none. The corrections are keyed by (country, GeoNames English name) so a changed GeoNames id cannot silently attach
one to the wrong place. A place that has no Chinese name keeps its English one.
"""
from __future__ import annotations

# the name GeoNames lists first is wrong, archaic or not Traditional
ZH_OVERRIDE: dict[tuple[str, str], str] = {
    ("CN", "Huizhou"): "惠州", ("CN", "Changde"): "常德", ("CN", "Puyang"): "濮陽", ("CN", "Guankou"): "瀏陽", ("CN", "Tai’an"): "泰安",
    ("JP", "Hiroshima"): "廣島", ("JP", "Hamamatsu"): "濱松", ("JP", "Niigata"): "新潟",
    ("ID", "Jakarta"): "雅加達", ("KR", "Daegu"): "大邱", ("KR", "Daejeon"): "大田", ("NZ", "Auckland"): "奧克蘭",
    ("US", "San Francisco"): "舊金山", ("US", "Washington"): "華盛頓", ("US", "New York City"): "紐約",
    ("AU", "Adelaide"): "阿德萊德", ("AU", "Brisbane"): "布里斯本", ("DE", "Köln"): "科隆", ("GB", "Leeds"): "利茲",
    ("HK", "Tin Shui Wai"): "天水圍", ("HK", "Sham Shui Po"): "深水埗", ("CN", "Wanzhou"): "萬州", ("KR", "Incheon"): "仁川", ("JP", "Yokohama"): "橫濱", ("TW", "Jincheng"): "金城", ("TW", "Jinhu"): "金湖", ("TW", "Chaozhou"): "潮州", ("TW", "Chang-hua"): "彰化",
}

# a place for which GeoNames lists no Chinese name at all
ZH_ADD: dict[tuple[str, str], str] = {
    ("JP", "Saitama"): "埼玉", ("CA", "Halifax"): "哈利法克斯", ("AU", "Sunshine Coast"): "陽光海岸", ("PH", "Cebu City"): "宿霧", ("PH", "Manila"): "馬尼拉", ("TH", "Chiang Mai"): "清邁",
    ("TH", "Chon Buri"): "春武里", ("TH", "Udon Thani"): "烏隆", ("TH", "Surat Thani"): "素叻他尼", ("TH", "Lampang"): "南邦",
    ("HK", "Tseung Kwan O"): "將軍澳", ("HK", "Fanling"): "粉嶺", ("HK", "Pok Fu Lam"): "薄扶林", ("HK", "Cheung Chau"): "長洲", ("HK", "Tai Koo"): "太古",
    ("HK", "Taikoo Shing"): "太古城", ("HK", "South Horizons"): "海怡半島", ("HK", "Laguna City"): "麗港城", ("HK", "Fairview Park"): "錦繡花園", ("HK", "Heng Fa Chuen"): "杏花邨",
    ("HK", "Aldrich Bay"): "愛秩序灣", ("HK", "Choi Hung Estate"): "彩虹邨", ("HK", "Wong Chuk Hang"): "黃竹坑", ("HK", "Prince Edward"): "太子", ("HK", "Mid Levels"): "半山",
    ("HK", "Whampoa"): "黃埔", ("HK", "Whampoa Garden"): "黃埔花園", ("HK", "Mei Foo Sun Chuen"): "美孚新邨", ("HK", "Discovery Park"): "愉景新城", ("HK", "Laguna Verde"): "海逸豪園",
    ("HK", "LOHAS Park"): "日出康城", ("HK", "Nam Cheong"): "南昌", ("HK", "Choi Wan"): "彩雲", ("HK", "Wu Kai Sha"): "烏溪沙", ("HK", "Braemar Hill"): "寶馬山",
    ("HK", "Mount Davis"): "摩星嶺", ("HK", "Shap Pat Heung"): "十八鄉", ("HK", "Pat Heung"): "八鄉", ("HK", "Sam Shing"): "三聖", ("HK", "Sun Tin Wai"): "新田圍",
    ("HK", "Keng Hau"): "坑口", ("HK", "Shui Chuen O"): "水泉澳", ("HK", "Hok Yuen"): "學園", ("HK", "Pok Hong"): "博康", ("HK", "Lee On"): "利安", ("HK", "Butterfly"): "蝴蝶",
    ("HK", "Olympic"): "奧運", ("HK", "Kam Ying"): "錦英", ("HK", "Yeung Uk Tsuen"): "楊屋村",
}
