"""Panel schema: the data structure that diagnosis fills and that herbs/formulas act on.

The panel (盤面) is expressed as DEVIATIONS from the average healthy person (all zeros):
  organs   10 nodes (5 zang + 5 fu) × channels qi / blood / yin / yang (signed, −3 deficient … +3 excess)
           + stasis (0 … 3, qi stagnation)
  wuxing   derived five-element function vigour W_e
  liuxie   six pathogenic qi 風寒暑濕燥火 (0 … 3)
  products pathological products 痰 飲 瘀 食積 (0 … 3)
  bagang   exterior / cold-heat / deficiency-excess / yin-yang (derived scalars)
Pattern elements (證素 = location × nature) project onto it; herbs act on the same dimensions with
opposite sign, which is what makes formula matching and modification (加減) computable.
"""

ZANG = ["肝", "心", "脾", "肺", "腎"]
FU = ["膽", "小腸", "胃", "大腸", "膀胱"]
ORGAN_ELEMENT = {"肝": "木", "膽": "木", "心": "火", "小腸": "火", "脾": "土", "胃": "土", "肺": "金", "大腸": "金", "腎": "水", "膀胱": "水"}
CHANNELS = ["qi", "blood", "yin", "yang"]
LIUXIE = ["風", "寒", "暑", "濕", "燥", "火"]
PRODUCTS = ["痰", "飲", "瘀", "食積"]

# 證素 location → organs it acts on ("表" acts on the exterior and, for qi/yang natures, on the lung/defensive qi)
LOCATION_ORGANS = {
    "表": ["肺"], "半表半裡": ["膽"], "心": ["心"], "肝": ["肝"], "脾": ["脾"], "肺": ["肺"], "腎": ["腎"],
    "胃": ["胃"], "膽": ["膽"], "全身": [],
}
EXTERIOR_LOCATIONS = ["表"]

# 證素 nature → projection per unit degree. "{organ}" is replaced by each organ of the location.
NATURE_PROJECTION = {
    "氣虛": {"{organ}.qi": -1.0},
    "血虛": {"{organ}.blood": -1.0},
    "陰虛": {"{organ}.yin": -1.0},
    "陽虛": {"{organ}.yang": -1.0, "liuxie.寒": 0.5},
    "寒": {"liuxie.寒": 1.0},
    "火": {"liuxie.火": 1.0, "{organ}.yang": 0.5},
    "暑": {"liuxie.暑": 1.0},
    "濕": {"liuxie.濕": 1.0},
    "燥": {"liuxie.燥": 1.0},
    "風": {"liuxie.風": 1.0},
    "痰": {"product.痰": 1.0},
    "飲": {"product.飲": 1.0},
    "瘀": {"product.瘀": 1.0},
    "食積": {"product.食積": 1.0},
    "氣滯": {"{organ}.stasis": 1.0},
}

# Derived quantities (documented as formulas; evaluated by the diagnosis engine, not stored).
DERIVED = {
    "wuxing_function": "W_e = 0.7·mean(zang_e.qi, zang_e.yang) + 0.3·mean(fu_e.qi, fu_e.yang)",
    "bagang.exterior": "clamp(0…1) = Pct(表 location elements) / 100",
    "bagang.cold_heat": "clamp(−1…1) = (liuxie.火 + liuxie.暑 − liuxie.寒 − 0.5·Σ yang deficit + 0.5·Σ yin deficit) / 3",
    "bagang.deficiency_excess": "clamp(−1…1) = (Σ positive channel excess + products + stasis − Σ negative channel deficit) / 6",
    "bagang.yin_yang": "derived summary: cold+deficient → yin (yang deficiency); hot+excess → yang; hot+deficient → yin (yin deficiency with heat)",
    "degree_from_pct": "degree = 3 · Pct / 100 for each pattern element",
}
