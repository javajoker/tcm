"""營衛 in the model (task PM-52; design docs/post-mvp/design/ying-wei.md; decision PD-28).

The panel gains three dimensions — 衛氣, 營氣 and the opening and closing of the pores that 衛 governs (開闔) — four natures (證素 病性) that the
library's 營衛 patterns are made of, the sources from which 營 and 衛 are made (a coupling: a deficient organ weakens them a little), and the
營衛 actions of the formula herbs (curated/herbs.py). Every value is a verified quotation or a weighted set of them.

Where readings of the classics disagree about a value, each reading carries an APPLICABILITY weight — how well it applies to what the panel
measures: the person's own state, seen through symptoms and acted on by the treatment (an evil that has entered the 衛 is already held by the
six evils). The value is the weighted mean of the readings and the CONFIDENCE, 1 − Σ w·|v − v̄| / 2, says how far they agree (1 when they all
agree, 0.5 when two equal readings cancel). The weights are judgements for the clinical reviewer ([calibrate]); `build_diagnosis` and
`validate_kb` recompute every value from them.
"""
from __future__ import annotations

DIMENSIONS = ["衛", "營", "開闔"]                     # panel keys yingwei.<name>

DIMENSION_INFO = {
    "衛": {"zh": "衛氣", "en": "Defensive qi (wei)", "scale": "−3 衛弱（衛外不固）… +3 衛實",
           "basis": ["suwen-003-10", "lingshu-047-1", "suwen-043-2"]},
    "營": {"zh": "營氣", "en": "Nutrient qi (ying)", "scale": "−3 營弱（不能內守）… +3 營強（營鬱）",
           "basis": ["lingshu-018-2", "suwen-043-1", "lingshu-071-2"]},
    "開闔": {"zh": "腠理開闔", "en": "Opening and closing of the pores", "scale": "−3 開（腠理疏，汗出）… +3 闔（腠理閉，無汗）",
             "basis": ["lingshu-047-1"]},
}


def reading(citations: list[str], says: str, applicability: float, value: float, why: str) -> dict:
    return {"citations": citations, "says": says, "applicability": applicability, "value": value, "why": why}


# ── the four natures ────────────────────────────────────────────────────────
# Per dimension, the readings that set its value per unit degree. A dimension the classics state with one voice has readings that agree.

NATURES: dict[str, dict] = {
    "營弱衛強": {
        "name": "營弱衛強", "pattern": "EX2", "location": "表",
        "says": "太陽中風: the 營 is weak and cannot keep the sweat in; the wind sits in the 衛",
        "dims": {
            "衛": [
                reading(["shanghan-095"], "此為榮弱衛強，故使汗出", 0.2, +1.0,
                        "Literally the 衛 is strong: it describes 陽浮 and the fever (「陽浮者，熱自發」), the fight at the surface"),
                reading(["zhujie-shanghan-012-1", "yizong-jinjian-taiyang-1"], "風并於衛，則衛實 · 衛為風客，則衛邪強", 0.3, 0.0,
                        "The strength is the evil's; the panel already holds that evil as 風 (liuxie.風), so the 衛's own state is neither strong nor weak"),
                reading(["yizong-jinjian-taiyang-2", "yizong-jinjian-guizhi"], "衛陽為風邪所干，不能敷布 · 桂枝…溫通衛陽", 0.5, -1.0,
                        "The 衛陽 is hindered and cannot spread: what the treatment acts on, 「溫通衛陽」"),
            ],
            "營": [
                reading(["shanghan-012"], "陰弱者，汗自出", 0.5, -1.0, "The 陰 that is weak is the 營"),
                reading(["zhujie-shanghan-012-1"], "陰脈弱者，荣氣弱也", 0.5, -1.0, "成無己 names it"),
            ],
            "開闔": [
                reading(["shanghan-012"], "陰弱者，汗自出", 0.5, -1.0, "Sweating: the pores are open"),
                reading(["zhujie-shanghan-012-2"], "以自汗出，則皮膚緩，腠理疏", 0.5, -1.0, "The pores are loose"),
            ],
        },
    },
    "衛閉": {
        "name": "衛閉", "pattern": "EX1", "location": "表",
        "says": "太陽傷寒: cold closes the pores; whether it also harms the 營 is disputed",
        "dims": {
            "開闔": [
                reading(["shanghan-035"], "無汗而喘者，麻黃湯主之", 0.6, +1.0, "No sweat: the pores are closed"),
                reading(["zhujie-shanghan-055"], "傷寒脈浮緊，邪在表也，當與麻黃湯發汗", 0.4, +1.0, "The treatment opens them"),
            ],
            "營": [
                reading(["zhujie-shanghan-038"], "寒并於荣者，為荣強衛弱", 0.4, +1.0,
                        "A commentator's scheme (風傷衛、寒傷營) that later commentators disputed"),
                reading(["shanghan-035"], "the clause names no 營衛", 0.6, 0.0,
                        "The classic itself: its pains are the cold's, which the panel holds as 寒"),
            ],
            "衛": [
                reading(["zhujie-shanghan-038"], "寒并於荣者，為荣強衛弱", 0.4, -1.0, "The same scheme: the 衛 is the weaker"),
                reading(["shanghan-035"], "the clause names no 營衛", 0.6, 0.0, "The classic itself"),
            ],
        },
    },
    "衛氣不和": {
        "name": "衛氣不和", "pattern": "EX4", "location": "表",
        "says": "營衛不和 without another disease: the 營 is in order, the 衛 does not keep pace with it, and the person sweats",
        "dims": {
            "衛": [
                reading(["shanghan-053-2", "shanghan-054"], "以衛氣不共營氣和諧故爾 · 此衛氣不和也", 0.5, -1.0, "The 衛 is out of step"),
                reading(["zhujie-shanghan-053"], "不能與荣氣和諧，亦不能衛護皮腠", 0.5, -1.0, "and cannot guard the skin"),
            ],
            "營": [
                reading(["shanghan-053-2"], "此為營氣和", 1.0, 0.0, "The 營 is in order"),
            ],
            "開闔": [
                reading(["shanghan-053-2", "shanghan-054"], "病常自汗出 · 自汗出", 0.5, -1.0, "Sweating"),
                reading(["zhujie-shanghan-053"], "是以常自汗出", 0.5, -1.0, "because the skin is not guarded"),
            ],
            # whether a wind is lodged in the 衛 (a dimension of the six evils, so named in full)
            "liuxie.風": [
                reading(["zhujie-shanghan-053"], "衛受風邪而荣不病者，為荣氣和也。衛既客邪", 0.4, +1.0,
                        "成無己: a wind lodged in the 衛 is what keeps it from the 營 — the reason 桂枝湯 「解散風邪、調和荣衛」"),
                reading(["shanghan-054"], "病人藏無他病，時發熱，自汗出，而不愈者，此衛氣不和也", 0.6, 0.0,
                        "The clause names no evil, and the pattern's own evidence counts a recent wind or cold against it"),
            ],
        },
    },
    "衛弱": {
        "name": "肺衛不固", "pattern": "LG1", "location": "肺",
        "says": "衛表不固: the 衛 is weak and cannot secure the surface",
        "dims": {
            "衛": [
                reading(["suwen-003-10"], "陽者，衛外而為固也", 0.5, -1.0, "What 衛 is for: securing the outside"),
                reading(["lingshu-047-1"], "衛氣者，所以溫分肉，充皮膚，肥腠理，司開闔者也", 0.5, -1.0, "and filling the skin"),
            ],
            "開闔": [
                reading(["lingshu-047-1"], "司開闔", 1.0, -1.0, "A weak 衛 does not keep the pores closed"),
            ],
        },
    },
}

# ── the questions on which the classics disagree (design §2.4) ─────────────────
# Q3 and Q4 are the contested dimensions of the natures above; Q1 and Q2 are the couplings below; Q5 and Q6 are recorded here.

QUESTIONS = [
    {"id": "Q1", "question": "衛出何焦", "en": "From which 焦 does 衛 come?", "result": "coupling yingwei.衛 (below)"},
    {"id": "Q2", "question": "營從何來", "en": "From what does 營 come?", "result": "coupling yingwei.營 (below)"},
    {"id": "Q3", "question": "太陽中風之「衛強」", "en": "In 太陽中風, what is 「衛強」?", "result": "natures.營弱衛強.衛"},
    {"id": "Q4", "question": "風傷衛、寒傷營", "en": "Does cold harm the 營 in 太陽傷寒?", "result": "natures.衛閉.營, natures.衛閉.衛"},
    {"id": "Q5", "question": "溫病衛分之汗", "en": "Does the 衛 stage of a warm disease sweat?",
     "readings": [
         reading(["wenre-lun-6"], "在衛汗之可也", 0.5, +1.0, "It must be opened: the pores are not open enough"),
         reading(["wenbing-tiaobian-shangjiao-3"], "頭痛，微惡風寒，身熱自汗", 0.5, -1.0, "It sweats"),
     ],
     "dimension": "開闔", "pattern": "EX3",
     "result": "the readings cancel: no 營衛 nature for 風熱犯表 (EX3); the panel says nothing it cannot support"},
    {"id": "Q6", "question": "營衛：氣，或層次", "en": "Are 營 and 衛 qi of the body or stages of a warm disease?",
     "readings": [
         reading(["lingshu-018-2"], "營在脈中，衛在脈外", 1.0, 0.0, "The qi: what the panel holds"),
         reading(["wenre-lun-6"], "衛之後方言氣，營之後方言血", 1.0, 0.0, "The stages: where a warm disease is"),
     ],
     "result": "not a conflict once the uses are separated: the panel holds the qi; the stages name where a warm disease is (see STAGES)"},
    {"id": "Q7", "question": "雜病營衛不和有無風邪", "en": "Is a wind lodged in the 衛 of 營衛不和 without another disease?", "result": "natures.衛氣不和.liuxie.風"},
]

# ── where 營 and 衛 come from (Q1, Q2): a deficient organ weakens them, deficits only ─────────

COUPLING_STRENGTH = 0.3                                   # [calibrate]

def source(citations: list[str], says: str, applicability: float, dims: list[str], why: str) -> dict:
    """A reading of where 營 or 衛 comes from: its weight is split equally over the panel dimensions that stand for that source."""
    return {"citations": citations, "says": says, "applicability": applicability, "dims": dims, "why": why}


COUPLING: dict[str, list[dict]] = {
    "衛": [
        source(["lingshu-030-1", "wenre-lun-1"], "上焦開發…是謂氣 · 肺主氣屬衛", 0.5, ["肺.qi"],
               "上焦, 肺: the source the library can observe — 肺 signs go with a weak 衛 in its own 衛表不固 pattern"),
        source(["lingshu-018-2", "suwen-043-2"], "濁者為衛 · 衛者，水穀之悍氣也", 0.3, ["脾.qi", "脾.yang"], "中焦, 脾胃: what 衛 is made of"),
        source(["lingshu-018-3"], "營出於中焦，衛出於下焦", 0.2, ["腎.yang"],
               "下焦, 腎: the received text of the chapter itself, which sits uneasily with 決氣's 上焦; kept as the root (腎陽), at a low weight"),
    ],
    "營": [
        source(["lingshu-018-3", "suwen-043-1"], "營出於中焦 · 榮者，水穀之精氣也", 0.6, ["脾.qi"], "中焦, 脾: where 營 is made"),
        source(["wenre-lun-1", "lingshu-071-2"], "心主血屬營 · 營氣者…化以為血", 0.4, ["心.blood"], "心 and its blood: what 營 belongs with"),
    ],
}


def sources(dim: str) -> dict[str, float]:
    """The coupling weights of one 營衛 dimension by panel dimension."""
    out: dict[str, float] = {}
    for r in COUPLING[dim]:
        for d in r["dims"]:
            out[d] = round(out.get(d, 0.0) + r["applicability"] / len(r["dims"]), 6)
    return out

# ── the stages of a warm disease (Q6) ─────────────────────────────────────────

STAGES = [
    {"stage": "衛分", "app": "EX3 風熱犯表", "citation": "wenre-lun-6"},
    {"stage": "氣分", "app": "not a library pattern: a high fever goes to the red-flag screening", "red_flags": ["RF_B_HIGH_FEVER"]},
    {"stage": "營分", "app": "red flags: a doctor, never the app's treatment", "red_flags": ["RF_B_HIGH_FEVER", "RF_A_CONSCIOUSNESS"]},
    {"stage": "血分", "app": "red flags: a doctor, never the app's treatment", "red_flags": ["RF_A_BLEEDING", "RF_A_SEIZURE", "RF_A_CONSCIOUSNESS"]},
]

NOT_MODELLED = [
    {"what": "衛氣's day and night course, and sleep", "citations": ["lingshu-018-4", "lingshu-080-1"],
     "why": "It would need a pattern of its own (不寐 from a 衛 that cannot enter the 陰); no pattern enters the library outside admission (PM-21, PM-22). The reasoning text may cite it; the panel does not hold it"},
    {"what": "營分、血分 heat and 清營", "citations": ["wenre-lun-6"],
     "why": "A stage of a warm disease that the red-flag screening sends to a doctor (Q6), never a state the app treats"},
    {"what": "營 from blood, the other way (血虛 → 營虛)", "citations": ["lingshu-071-2"],
     "why": "「化以為血」 says that 營 makes blood; only the 心-blood link of 溫熱論 is used (Q2)"},
]


# ── computation ──────────────────────────────────────────────────────────────

def weighted(readings: list[dict]) -> tuple[float, float]:
    """(value, confidence) of a set of readings: the applicability-weighted mean and 1 − Σ w·|v − v̄| / 2."""
    total = sum(r["applicability"] for r in readings)
    if abs(total - 1.0) > 1e-9:
        raise ValueError(f"applicability weights sum to {total}, not 1")
    v = sum(r["applicability"] * r["value"] for r in readings)
    c = 1.0 - sum(r["applicability"] * abs(r["value"] - v) for r in readings) / 2.0
    return round(v, 3), round(c, 3)


def panel_key(dim: str) -> str:
    """A 營衛 dimension by its short name (衛, 營, 開闔); another panel dimension (liuxie.風) by its full key."""
    return dim if "." in dim else f"yingwei.{dim}"


def nature_projection(nature: str) -> dict[str, float]:
    """The per-degree panel projection of a 營衛 nature: each dimension's weighted value (zeros left out)."""
    out = {}
    for dim, readings in NATURES[nature]["dims"].items():
        v, _ = weighted(readings)
        if v != 0:
            out[panel_key(dim)] = v
    return dict(sorted(out.items()))


def coupled(unit: dict[str, float]) -> dict[str, float]:
    """What a pattern's organ deficits add to its 營衛 (deficits only, scaled by the coupling strength)."""
    out = {}
    for dim in COUPLING:
        x = sum(w * min(unit.get(src, 0.0), 0.0) for src, w in sources(dim).items())
        if x < 0:
            out[f"yingwei.{dim}"] = round(COUPLING_STRENGTH * x, 3)
    return out


def data() -> dict:
    """data/diagnosis/yingwei.json: the dimensions, the natures with their readings and computed values, the questions, the couplings, the stages."""
    natures = {}
    for key, n in NATURES.items():
        dims = {}
        for dim, readings in n["dims"].items():
            v, c = weighted(readings)
            dims[dim] = {"readings": readings, "value": v, "confidence": c}
        natures[key] = {"name": n["name"], "pattern": n["pattern"], "location": n["location"], "says": n["says"], "dimensions": dims,
                        "projection_per_degree": nature_projection(key)}
    questions = []
    for q in QUESTIONS:
        row = dict(q)
        if "readings" in q and q.get("dimension"):
            v, c = weighted(q["readings"])
            row.update({"value": v, "confidence": c})
        questions.append(row)
    coupling = {"strength": COUPLING_STRENGTH,
                "targets": {f"yingwei.{dim}": {"readings": rs, "sources": sources(dim)} for dim, rs in COUPLING.items()}}
    return {"_meta": {"description": "營衛 in the panel (PM-52; docs/post-mvp/design/ying-wei.md): the dimensions, the natures with the readings that set their values, "
                                     "the questions on which the classics disagree (applicability-weighted, with a confidence), where 營 and 衛 come from, the stages of a warm disease, "
                                     "and what is not modelled. Weights are [calibrate]; every value is recomputed by the build.",
                      "rule": "value = Σ w·v; confidence = 1 − Σ w·|v − value| / 2; the weights of one reading set sum to 1",
                      "status": "draft"},
            "dimensions": [{"id": f"yingwei.{d}", **DIMENSION_INFO[d]} for d in DIMENSIONS],
            "natures": natures, "questions": questions, "coupling": coupling, "stages": STAGES, "not_modelled": NOT_MODELLED}
