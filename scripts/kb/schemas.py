"""JSON Schemas (draft 2020-12) for every data/**/*.json file, authored as code and written to data/schema/ by build_schemas.py.

The schemas are the machine-readable data contract (tech spec T8, KB schema doc): `validate_kb.py` validates every file against them and
the TypeScript types of @tcm/kb are generated from them. Records are STRICT (`additionalProperties: false`) so a typo or an undeclared
field fails the build; the exported/config-style files (wuxing tables, panel schema, engine params) are checked at shape level only.
When you add a field to a generator you must add it here in the same change.
"""
from __future__ import annotations

SCHEMA_VERSION = 1
DIALECT = "https://json-schema.org/draft/2020-12/schema"

# ── helpers ─────────────────────────────────────────────────────────────────

STR = {"type": "string"}
NSTR = {"type": ["string", "null"]}
NUM = {"type": "number"}
INT = {"type": "integer"}
BOOL = {"type": "boolean"}


def ref(name: str) -> dict:
    return {"$ref": f"#/$defs/{name}"}


def enum(*values) -> dict:
    return {"enum": list(values)}


def arr(items: dict, min_items: int | None = None, unique: bool = False) -> dict:
    out = {"type": "array", "items": items}
    if min_items is not None:
        out["minItems"] = min_items
    if unique:
        out["uniqueItems"] = True
    return out


def tup(item: dict, n: int) -> dict:
    """A fixed-length array of one item type (typed as a tuple by the TypeScript generator)."""
    return {"type": "array", "items": item, "minItems": n, "maxItems": n}


def obj(props: dict, required: list[str] | None = None, extra: bool = False) -> dict:
    return {"type": "object", "properties": props, "required": sorted(props if required is None else required), "additionalProperties": extra}


def optional(props: dict, required: list[str]) -> dict:
    return obj(props, required)


def dictionary(value: dict, keys: dict | None = None, min_props: int = 0) -> dict:
    out = {"type": "object", "additionalProperties": value}
    if keys:
        out["propertyNames"] = keys
    if min_props:
        out["minProperties"] = min_props
    return out


def loose(required: list[str] | None = None) -> dict:
    return {"type": "object", "required": sorted(required or []), "additionalProperties": True}


def meta(extra_props: dict | None = None, required: list[str] | None = None) -> dict:
    props = {"description": STR, "schema": INT, **(extra_props or {})}
    return {"type": "object", "properties": props, "required": sorted({"description", "schema", *(required or [])}), "additionalProperties": True}


def envelope(item: dict, meta_schema: dict | None = None, key: str = "items") -> dict:
    return {"type": "object", "properties": {"_meta": meta_schema or meta(), key: arr(item)}, "required": ["_meta", key], "additionalProperties": False}


def pattern(p: str) -> dict:
    return {"type": "string", "pattern": p}


# shared definitions, copied into every schema's $defs so each file is self-contained
ORGANS = "肝|心|脾|肺|腎|膽|小腸|胃|大腸|膀胱"
DEFS = {
    "bilingual": {"type": "object", "properties": {"zh-Hant": {"type": "string", "minLength": 1}, "en": NSTR}, "required": ["en", "zh-Hant"], "additionalProperties": False},
    "bilingualNamed": {"type": "object", "properties": {"zh-Hant": {"type": "string", "minLength": 1}, "en": {"type": "string", "minLength": 1}}, "required": ["en", "zh-Hant"], "additionalProperties": False},
    "symptomId": pattern(r"^[STP]_[A-Z0-9_]+$"),
    "patternId": pattern(r"^(EX|SP|LV|HT|LG|KD|QB)[0-9]$"),
    "elementId": pattern(r"^PE_.+$"),
    "formulaId": pattern(r"^F_[A-Z0-9_]+$"),
    "herbId": pattern(r"^herb-[a-z0-9_]+$"),
    "citationId": pattern(r"^[a-z0-9]+(-[a-z0-9]+)*$"),
    "constitutionId": pattern(r"^C_[A-Z]+$"),
    "redFlagId": pattern(r"^RF_[ABC]_[A-Z_]+$"),
    "ruleId": pattern(r"^R_[A-Z_]+$"),
    "questionId": pattern(r"^Q_[A-Z_]+$"),
    "moduleId": enum("sleep", "fatigue", "digestion", "cold-heat-sweat", "head-body-pain", "mood-stress", "womens-cycle", "early-external"),
    "evil": enum("風", "寒", "暑", "濕", "燥", "火"),
    "element": enum("木", "火", "土", "金", "水"),
    "panelDim": pattern(rf"^(({ORGANS})\.(qi|blood|yin|yang|stasis)|liuxie\.(風|寒|暑|濕|燥|火)|product\.(痰|飲|瘀|食積)|bagang\.exterior)$"),
    "panelMap": {"type": "object", "propertyNames": {"$ref": "#/$defs/panelDim"}, "additionalProperties": NUM},
    "reviewStatus": enum("derived", "curated-draft", "draft", "reviewed"),
    "level": enum("L0", "L1", "L2", "L3"),
    "notice": enum("none", "inline", "blocking_ack"),
}


def finish(body: dict, title: str) -> dict:
    return {"$schema": DIALECT, "title": title, "$defs": DEFS, **body}


# ── evidence and diagnosis ──────────────────────────────────────────────────

def citations() -> dict:
    item = obj({"book": STR, "chapter": STR, "clause_no": INT, "clause_no_verified": BOOL, "id": ref("citationId"), "quote_source_zh_hans": STR, "quote_zh_hant": STR,
                "source_path": STR, "source_repo": STR, "verified": BOOL}, ["book", "chapter", "id", "quote_zh_hant", "source_repo", "verified"])  # source script and path are pruned from release bundles
    return envelope(item, meta({"count": INT, "note": STR, "unverified": arr(STR), "verified": INT}, ["count", "unverified", "verified"]))


DIMENSIONS = ("cold-heat", "sweat", "head-body", "stool-urine", "diet-taste", "chest-abdomen", "ear-eye-throat", "thirst", "sleep", "emotion", "menses", "face-skin",
              "voice-breath", "qi-spirit-form", "tongue", "pulse")


def symptoms() -> dict:
    item = obj({
        "dimension": enum(*DIMENSIONS), "en": STR, "id": ref("symptomId"), "kind": enum("symptom", "tongue", "pulse"), "zh-Hant": STR,
        "pulse": obj({"optional": BOOL, "quality_coefficient": NUM}),
        "tongue": obj({"category": enum("body", "shape", "special", "zone-body", "coat", "zone-coat"), "meaning": STR, "zone": enum("all", "edge", "center", "tip", "root")}),
    }, ["dimension", "en", "id", "kind", "zh-Hant"])
    return envelope(item, meta({"by_dimension": dictionary(INT), "count": INT}, ["by_dimension", "count"]))


def questions() -> dict:
    requires = obj({"sex": enum("female", "male"), "pregnancy": enum("not_pregnant")}, [])
    option = obj({"context": obj({"course": enum("acute", "subacute", "chronic")}), "id": pattern(r"^[a-z0-9_-]+$"), "label": ref("bilingualNamed"), "none": BOOL,
                  "symptoms": arr(ref("symptomId"), unique=True)}, ["id", "label", "none", "symptoms"])
    item = obj({
        "core": BOOL, "dimension": enum(*DIMENSIONS, "course"), "exclusive_groups": arr(arr(ref("symptomId"), 2, True)), "follows": arr(ref("symptomId"), 1, True),
        "graded": arr(ref("symptomId"), unique=True), "hint": ref("bilingualNamed"), "id": ref("questionId"), "modules": arr(ref("moduleId"), unique=True), "options": arr(option, 2),
        "order": INT, "prompt": ref("bilingualNamed"), "requires": requires, "select": enum("one", "many"), "source": enum("inquiry", "guided"), "status": ref("reviewStatus"),
    }, ["core", "dimension", "exclusive_groups", "graded", "id", "modules", "options", "order", "prompt", "select", "source", "status"])
    module = obj({"description": ref("bilingualNamed"), "id": ref("moduleId"), "name": ref("bilingualNamed"), "requires": {"oneOf": [{"type": "null"}, requires]}})
    cover = obj({"covered": INT, "inquiry_symptoms": INT, "uncovered": arr(ref("symptomId"))})
    return {"type": "object", "properties": {
        "_meta": meta({"core_count": INT, "count": INT, "coverage": cover, "dimensions_core": arr(STR), "status": ref("reviewStatus")}, ["core_count", "count", "coverage", "dimensions_core", "status"]),
        "items": arr(item, 1), "modules": arr(module, 8)}, "required": ["_meta", "items", "modules"], "additionalProperties": False}


def exclusions() -> dict:
    group = obj({"id": pattern(r"^[XC]_[A-Z_]+$"), "kind": enum("exclusive", "conflict"), "reason": ref("bilingualNamed"), "symptoms": arr(ref("symptomId"), 2, True)})
    split = obj({"id": pattern(r"^SPLIT_[A-Z_]+$"), "summary": ref("bilingualNamed"), "symptoms": arr(ref("symptomId"), 2, True)})
    return {"type": "object", "properties": {"_meta": meta({"count": INT, "status": ref("reviewStatus")}, ["count", "status"]), "groups": arr(group, 1), "splits": arr(split)},
            "required": ["_meta", "groups", "splits"], "additionalProperties": False}


def orientation() -> dict:
    ids = arr(ref("symptomId"), 1, True)
    return {"type": "object", "properties": {
        "_meta": meta({"status": ref("reviewStatus")}, ["status"]), "external_triggers": ids,
        "exterior": obj({"required": ref("symptomId"), "supporting": ids, "half": arr(ids, 1)}),
        "cold_signs": ids, "heat_signs": ids, "deficiency_signs": ids, "excess_signs": ids, "lean_margin": INT},
        "required": ["_meta", "cold_signs", "deficiency_signs", "excess_signs", "exterior", "external_triggers", "heat_signs", "lean_margin"], "additionalProperties": False}


def patterns() -> dict:
    item = obj({
        "against": dictionary(NUM, ref("symptomId")), "citations": arr(ref("citationId")), "elements": arr(ref("elementId")), "formulas": arr(ref("formulaId")),
        "group": enum("external", "spleen-stomach", "liver", "heart", "lung", "kidney", "qi-blood"), "id": ref("patternId"), "max_score": INT,
        "name": ref("bilingualNamed"), "panel_projection_per_degree": ref("panelMap"), "principle": STR, "required_any": arr(ref("symptomId"), 1),
        "status": ref("reviewStatus"), "tongue_pulse_note": STR,
        "treatment": obj({"acupoints": arr(STR), "foods": arr(STR), "lifestyle": STR}),
        "weights": dictionary({"type": "integer", "minimum": 1, "maximum": 3}, ref("symptomId"), 1),
    })
    return envelope(item, meta({"count": INT, "scoring": STR}, ["count", "scoring"]))


def pattern_elements() -> dict:
    item = obj({
        "against": dictionary(NUM, ref("symptomId")), "id": ref("elementId"), "location": enum("全身", "心", "肝", "肺", "胃", "脾", "腎", "表"), "name": ref("bilingual"),
        "nature": enum("寒", "氣滯", "氣虛", "濕", "火", "痰", "瘀", "血虛", "陰虛", "陽虛", "風"), "patterns": arr(ref("patternId"), 1),
        "projection_per_degree": ref("panelMap"), "weights": dictionary(NUM, ref("symptomId"), 1),
    })
    return envelope(item, meta({"count": INT}, ["count"]))


def constitutions() -> dict:
    item = obj({"caution": STR, "features": arr(ref("symptomId")), "id": ref("constitutionId"), "name": ref("bilingualNamed"), "prior_nature": arr(STR), "status": ref("reviewStatus"),
                "susceptibility": dictionary({"type": "integer", "minimum": 1, "maximum": 2}, ref("evil"))}, ["features", "id", "name", "prior_nature", "status", "susceptibility"])
    return envelope(item, meta({"standard": STR}))


def red_flags() -> dict:
    item = obj({"id": ref("redFlagId"), "level": enum("A", "B", "C"), "text": ref("bilingualNamed")})
    return envelope(item, meta({"flow": STR}, ["flow"]))


def tongue() -> dict:
    zone = obj({"classical": arr(STR), "en": STR, "id": enum("tip", "center", "root", "edge", "border", "all"), "textbook": arr(STR), "zh": STR})
    feature = obj({"category": enum("body", "shape", "special", "zone-body", "coat", "zone-coat"), "id": ref("symptomId"), "meaning": STR, "name": ref("bilingualNamed"),
                   "zone": enum("all", "edge", "center", "tip", "root")})
    return {"type": "object", "properties": {"_meta": meta({"guidance": loose(), "note": STR, "zone_citation": ref("citationId")}, ["guidance", "zone_citation"]),
                                             "zones": arr(zone, 1), "features": arr(feature, 1)}, "required": ["_meta", "features", "zones"], "additionalProperties": False}


def pulse() -> dict:
    pulse_item = obj({"feature": STR, "group": enum("depth", "rate", "rhythm", "strength", "tension", "flow", "length", "width"), "id": ref("symptomId"), "indications": STR,
                      "name": ref("bilingualNamed"), "source": obj({"book": STR, "chapter": STR, "verified_heading": BOOL}), "yin_yang": enum("陽", "陰", "陽中陰", "陰中陽")})
    position = obj({"id": pattern(r"^[LR]-(cun|guan|chi)$"), "organs": arr(STR), "zh": STR})
    guidance = obj({"education": STR, "note": STR, "optional": BOOL, "positions_source": STR, "quality_coefficient": NUM,
                    "rate_bands": obj({"normal_range_modern": tup(NUM, 2), "rapid_gt": NUM, "slow_lt": NUM})})
    return {"type": "object", "properties": {"_meta": meta({"exclusive_groups": arr(arr(ref("symptomId"), 2)), "guidance": guidance}, ["exclusive_groups", "guidance"]),
                                             "positions": arr(position, 6), "pulses": arr(pulse_item, 1)}, "required": ["_meta", "positions", "pulses"], "additionalProperties": False}


def panel_schema() -> dict:
    return {"type": "object", "properties": {
        "_meta": meta(), "channels": dictionary(STR, min_props=5), "derived": dictionary(STR), "exterior_locations": arr(STR),
        "liuxie": arr(ref("evil"), 6), "location_organs": dictionary(arr(STR)),
        "nature_projection": dictionary(dictionary(NUM)),
        "offsets": obj({"primary": STR, "secondary": STR}),
        "organs": obj({"element_of": dictionary(ref("element")), "fu": arr(STR, 5), "zang": arr(STR, 5)}),
        "products": arr(STR, 4)},
        "required": ["_meta", "channels", "derived", "exterior_locations", "liuxie", "location_organs", "nature_projection", "offsets", "organs", "products"], "additionalProperties": False}


def scoring_params() -> dict:
    sev = obj({"light": NUM, "moderate": NUM, "severe": NUM, "ungraded": NUM})
    quality = obj({"by_source": obj({"inquiry": NUM, "measured": NUM, "guided": NUM, "pulse": NUM}), "by_prefix": dictionary(enum("inquiry", "measured", "guided", "pulse")),
                   "default_source": enum("inquiry", "measured", "guided", "pulse")})
    pattern_ = obj({"required_any_missing_factor": NUM, "bands": obj({"high": NUM, "medium": NUM, "weak": NUM})})
    panel = obj({"noisy_or_floor": NUM, "degree_max": NUM, "dimension_weights": obj({"organ": NUM, "liuxie": NUM, "product": NUM, "bagang": NUM}),
                 "wuxing_function": obj({"zang": NUM, "fu": NUM}),
                 "bagang": obj({"heat_divisor": NUM, "yang_deficit_weight": NUM, "yin_deficit_weight": NUM, "excess_divisor": NUM, "exterior_divisor": NUM,
                                "yin_yang_axis_threshold": NUM})})
    reconcile = obj({"merge_threshold": NUM, "max_patterns": INT, "mixed_threshold": NUM, "tie_margin": NUM, "differential_symptoms": INT,
                     "nature_groups": obj({"cold": arr(STR), "heat": arr(STR), "deficiency": arr(STR), "excess": arr(STR)}),
                     "confidence": obj({"high": obj({"pct1": NUM, "margin": NUM, "coverage": NUM, "kappa": NUM}), "medium": obj({"pct1": NUM, "margin": NUM, "coverage": NUM}),
                                        "low": obj({"pct1": NUM})})})
    formula = obj({"symptom_fit_min": NUM, "k_max": NUM, "strength_bands": obj({"light_below": NUM, "strong_above": NUM}),
                   "role_weights": obj({"君": NUM, "臣": NUM, "佐": NUM, "使": NUM}),
                   "modification": obj({"max_add": INT, "max_remove": INT, "add_share": NUM, "min_gain": NUM})})
    return {"type": "object", "properties": {
        "_meta": meta({"sources": dictionary(STR), "status": ref("reviewStatus")}, ["sources", "status"]), "severity": sev, "quality": quality, "pattern": pattern_, "panel": panel,
        "reconcile": reconcile, "formula": formula, "tier": obj({"c_bitter_cold_share": NUM, "b_activating_share": NUM, "strong_herbs": arr(ref("herbId"), 1), "bitter_cold_tag": STR, "activating_tag": STR, "aristolochic_flag": STR}), "safety": obj({"flavor_excess_share": NUM, "conflict": obj({"axis": NUM, "warming_min": NUM, "cooling_min": NUM, "tonic_min": NUM, "attacking_min": NUM})}),
        "questionnaire": obj({"core_coverage_stop": NUM, "max_questions": INT, "candidate_pct_floor": NUM})},
        "required": ["_meta", "formula", "pattern", "panel", "quality", "questionnaire", "reconcile", "safety", "severity", "tier"], "additionalProperties": False}


# ── herbs and formulas ──────────────────────────────────────────────────────

def herbs() -> dict:
    flavor = obj({"element": ref("element"), "flavor": enum("辛", "苦", "甘", "酸", "澀", "鹹", "淡"), "weight": NUM})
    source = obj({"book": STR, "commit": NSTR, "entry_id": STR, "path": STR, "repo": STR})
    item = obj({
        "aliases": arr(STR), "category": STR, "caution": NSTR, "classical_formulas": arr(STR), "data_quality": arr(STR), "dose_g_reference": {"oneOf": [{"type": "null"}, tup(NUM, 2)]},
        "effects": ref("panelMap"), "flavors": arr(flavor), "functions": arr(STR), "harms": ref("panelMap"), "id": ref("herbId"), "interactions": arr(STR), "latin": NSTR,
        "name": ref("bilingual"), "organs": arr(STR), "pregnancy": enum("ok", "ok-unreviewed", "caution", "avoid"), "siqi": arr(STR), "slug": STR, "source": source,
        "status": enum("derived", "curated-draft", "reviewed"), "tags": arr(STR), "temperature": NUM, "toxic": BOOL,
    }, ["category", "caution", "classical_formulas", "data_quality", "dose_g_reference", "effects", "flavors", "functions", "harms", "id", "interactions", "latin", "name",
        "organs", "pregnancy", "siqi", "slug", "source", "status", "tags", "temperature", "toxic"])
    return envelope(item, meta({"conventions": loose(), "count": INT, "licence_note": STR, "status_counts": dictionary(INT)}, ["conventions", "count", "licence_note", "status_counts"]))


def herb_index() -> dict:
    return {"type": "object", "properties": {"_meta": meta(), "index": dictionary(ref("herbId"), min_props=1)}, "required": ["_meta", "index"], "additionalProperties": False}


def formulas() -> dict:
    classical = obj({"processing": STR, "unit": enum("两", "个", "枚", "升", "合", "斤"), "value": NUM})
    comp = obj({"classical_amount": classical, "effective_weight": NUM, "herb": ref("herbId"), "name": STR, "note": NSTR, "proportion": NUM, "role": enum("君", "臣", "佐", "使"),
                "role_weight": NUM, "typical_g": NUM}, ["effective_weight", "herb", "name", "note", "proportion", "role", "role_weight"])  # amounts are pruned from release bundles
    mod_herb = obj({"herb": ref("herbId"), "name": STR, "role": enum("君", "臣", "佐", "使"), "typical_g": NUM}, ["herb", "name", "role"])
    mod = obj({"add": arr(mod_herb), "id": pattern(r"^M_[A-Z0-9_]+$"), "remove": arr(mod_herb), "result_name": STR,
               "source": obj({"book": STR, "verification": STR}), "status": STR, "when_symptoms": arr(ref("symptomId"))})
    verification = obj({
        "classical": obj({"anchor": STR, "matched_in_formula": arr(STR), "not_in_formula": arr(STR), "note": NSTR, "parsed": INT, "path": STR},
                         ["anchor", "matched_in_formula", "not_in_formula", "note", "parsed"]),
        "composition_check": obj({"book_path": STR, "found": INT, "missing": arr(STR), "note": STR, "occurrences": INT, "total": INT}, ["found", "missing", "occurrences", "total"]),
        "composition_status": enum("verified-against-classical-text", "verified-against-source-book", "partially-verified"),
        "proportion_basis": STR, "role_status": STR, "source_note": STR,
    }, ["composition_status", "proportion_basis", "role_status"])
    item = obj({
        "cautions": arr(STR), "classical_amounts": {"oneOf": [{"type": "null"}, arr(obj({"amount": NUM, "name": STR, "processing": STR, "unit": enum("两", "个", "枚", "升", "合", "斤")}))]},
        "composition": arr(comp, 1), "core_indications": arr(ref("symptomId"), 1), "flavor_profile": dictionary(NUM), "id": ref("formulaId"), "interactions": arr(STR),
        "kb_commit": STR, "modifications": arr(mod), "mvp": BOOL, "name": ref("bilingualNamed"), "panel_burden": ref("panelMap"), "panel_effect": ref("panelMap"),
        "patterns": arr(ref("patternId")), "pregnancy": enum("ok", "ok-unreviewed", "caution", "avoid"), "principle": STR, "rationale_citations": arr(ref("citationId")),
        "rationale_zh": STR, "school": enum("經方", "時方"), "source": obj({"book": STR, "ref": STR, "repo_path": STR}, ["book", "ref"]), "status": ref("reviewStatus"),
        "tier": enum("A", "B", "C"), "tier_reasons": arr(STR), "verification": verification,
    }, ["cautions", "classical_amounts", "composition", "core_indications", "flavor_profile", "id", "interactions", "modifications", "mvp", "name", "panel_burden", "panel_effect", "patterns",
        "pregnancy", "principle", "rationale_citations", "rationale_zh", "school", "source", "status", "tier", "tier_reasons", "verification"])  # kb_commit is internal: pruned from release bundles
    return envelope(item, meta({"composition_status_counts": dictionary(INT), "count": INT, "proportion_note": STR, "role_weight_basis": arr(ref("citationId")), "role_weights": dictionary(NUM),
                                "tier_counts": dictionary(INT), "tier_rule": STR},
                               ["composition_status_counts", "count", "proportion_note", "role_weight_basis", "role_weights", "tier_counts", "tier_rule"]))


# ── five phases ─────────────────────────────────────────────────────────────

def correspondences() -> dict:
    row = {"type": "object", "required": ["controls", "element", "fu", "generates", "orifice", "season", "source", "status", "zang"], "additionalProperties": True}
    return {"type": "object", "properties": {"_meta": meta({"default_orifice_source": STR, "fu_and_season_note": STR}), "rows": arr(row, 5)}, "required": ["_meta", "rows"], "additionalProperties": False}


def ganzhi() -> dict:
    return loose(["_meta", "branches", "controls", "fu", "generates", "month_branch_order", "season_of_element", "solar_terms", "stems", "zang"])


def yunqi() -> dict:
    return loose(["_meta", "examples", "guest_qi_by_sitian", "host_qi_steps", "min_bing_excerpts", "qi_element", "qi_evil", "sitian_of_branch", "six_qi_order",
                  "steps_by_longitude", "suiyun_of_stem", "year_starts_at", "zaiquan_of_sitian"])


def susceptibility() -> dict:
    return {"type": "object", "properties": {
        "_meta": meta(), "citations": arr(ref("citationId")), "formula": STR, "note": STR,
        "risk": dictionary(dictionary({"type": "integer", "minimum": 1, "maximum": 2}, ref("evil")), ref("constitutionId")),
        "season_evil": dictionary(arr(ref("evil")), enum("春", "夏", "長夏", "秋", "冬"))},
        "required": ["_meta", "citations", "formula", "note", "risk", "season_evil"], "additionalProperties": False}


def engine_params() -> dict:
    return loose(["_meta", "engine", "profile", "transmission"])


# ── policy ──────────────────────────────────────────────────────────────────

def scope_profiles() -> dict:
    cell = obj({"level": ref("level"), "notice": ref("notice")})
    features = obj({"show_acupoints": BOOL, "show_diet": BOOL, "show_dosage_reference": BOOL, "show_formula_modification": BOOL, "show_herb_weights": BOOL, "show_tier_c": BOOL})
    profile = obj({
        "condition": obj({k: cell for k in ("red_flag_A", "red_flag_B", "serious_chronic_disease", "on_anticoagulant", "on_other_interacting_medication", "allergy_match",
                                            "acute_external_symptoms")}),
        "description": STR, "features": features,
        "population": obj({k: cell for k in ("adult", "elderly_65_plus", "minor_under_18", "pregnant", "lactating")}),
        "safety_enforcement": enum("suppress_hard", "annotate_only"),
        "state": obj({k: cell for k in ("low_confidence", "insufficient_information", "conflicting_data")}),
        "tongue_pulse": obj({"pulse_input": BOOL, "pulse_quality_coefficient": NUM, "tongue_special_signs": BOOL, "tongue_zones": BOOL}),
        "wuxing": obj({"bazi_annual": {"enum": [True, False, "opt_in"]}, "bazi_innate": {"enum": [True, False, "opt_in"]}, "enabled": BOOL, "season": BOOL,
                       "season_model": enum("changxia", "tuwang18"), "yunqi": BOOL}),
    })
    level_def = obj({"includes": arr(STR, 1), "name": ref("bilingualNamed")})
    return {"type": "object", "properties": {
        "_meta": meta({"version": INT}, ["version"]),
        "dimensions": obj({"condition": arr(STR, 7), "population": arr(STR, 5), "state": arr(STR, 3)}),
        "levels": obj({"L0": level_def, "L1": level_def, "L2": level_def, "L3": level_def}),
        "notice_kinds": obj({"blocking_ack": STR, "inline": STR, "none": STR}),
        "profiles": obj({"dev": profile, "release": profile}),
        "resolution": loose(["effective_level", "effective_notice", "flow"])},
        "required": ["_meta", "dimensions", "levels", "notice_kinds", "profiles", "resolution"], "additionalProperties": False}


def safety_rules() -> dict:
    applies = obj({"always": BOOL, "population": arr(STR), "condition": arr(STR), "medication_class": arr(STR), "state": arr(STR), "constitution": arr(ref("constitutionId"))}, [])
    target = {"type": "object", "minProperties": 1, "maxProperties": 1, "properties": {
        k: {} for k in ("herb_pregnancy", "herb_interaction", "formula_tier", "acupoints", "conflict", "herb_in_user_allergy_list", "flavor_share_over", "herb_pairs", "effect", "food_pregnancy_caution",
                        "output_level_max")}, "additionalProperties": False}
    rule = obj({"applies_to": applies, "citation": ref("citationId"), "condition": STR, "id": ref("ruleId"), "message": ref("bilingualNamed"), "note": STR, "reference": {"oneOf": [STR, arr(obj({"age": STR, "fraction_of_adult": STR}))]},
                "severity": enum("hard", "soft"), "target": target}, ["applies_to", "id", "message", "severity", "target"])
    return {"type": "object", "properties": {
        "_meta": meta({"clinical_review_required": arr(STR), "count": INT, "status": ref("reviewStatus")}, ["clinical_review_required", "count", "status"]),
        "rules": arr(rule, 1),
        "incompatibilities": obj({"citation": ref("citationId"), "note": STR, "shibafan": arr(obj({"herb": STR, "opposes": arr(STR)})),
                                  "shijiuwei": arr(obj({"a": STR, "b": STR}))}),
        "dose_references": obj({"elderly": STR, "minor_fractions": arr(obj({"age": STR, "fraction_of_adult": STR})), "note": STR}),
        "pregnancy_acupoints": arr(STR, 1)},
        "required": ["_meta", "incompatibilities", "pregnancy_acupoints", "rules"], "additionalProperties": False}  # dose_references is pruned from bundles that cannot show doses


def treatment_guidance() -> dict:
    return {"type": "object", "properties": {
        "_meta": meta(),
        "acupoints": dictionary(obj({"code": STR, "meridian": STR, "pregnancy_avoid": BOOL}), min_props=1),
        "food_pregnancy_caution": arr(STR),
        "general": obj({"source": arr(ref("citationId")), "text": STR})},
        "required": ["_meta", "acupoints", "food_pregnancy_caution", "general"], "additionalProperties": False}


def glossary() -> dict:
    item = obj({"domain": STR, "en": STR, "pinyin": STR, "status": enum("needs-review", "reviewed"), "zh-Hant": STR})
    return envelope(item, meta({"count": INT}, ["count"]))


# file (relative to data/) → (schema file stem, builder, title)
SCHEMAS = {
    "citations.json": ("citations", citations, "Quotation registry"),
    "glossary.json": ("glossary", glossary, "Glossary"),
    "herbs/herbs.json": ("herbs", herbs, "Herbs"),
    "herbs/herb-index.json": ("herb-index", herb_index, "Herb name index"),
    "formulas/formulas.json": ("formulas", formulas, "Formulas"),
    "diagnosis/symptoms.json": ("symptoms", symptoms, "Symptom registry"),
    "diagnosis/questions.json": ("questions", questions, "Question bank"),
    "diagnosis/exclusions.json": ("exclusions", exclusions, "Exclusive groups, conflicts and splits"),
    "diagnosis/orientation.json": ("orientation", orientation, "Eight-principle first-impression signs"),
    "diagnosis/patterns.json": ("patterns", patterns, "Patterns"),
    "diagnosis/pattern-elements.json": ("pattern-elements", pattern_elements, "Pattern elements (證素)"),
    "diagnosis/constitutions.json": ("constitutions", constitutions, "Constitutions"),
    "diagnosis/red-flags.json": ("red-flags", red_flags, "Red flags"),
    "diagnosis/tongue.json": ("tongue", tongue, "Tongue zones and features"),
    "diagnosis/pulse.json": ("pulse", pulse, "Pulses and positions"),
    "diagnosis/panel-schema.json": ("panel-schema", panel_schema, "Panel schema"),
    "diagnosis/scoring-params.json": ("scoring-params", scoring_params, "Diagnosis engine parameters"),
    "wuxing/correspondences.json": ("correspondences", correspondences, "Five-phase correspondences"),
    "wuxing/ganzhi.json": ("ganzhi", ganzhi, "Stems, branches, solar terms"),
    "wuxing/yunqi.json": ("yunqi", yunqi, "Wuyun liuqi tables"),
    "wuxing/susceptibility.json": ("susceptibility", susceptibility, "Constitution × pathogenic-qi susceptibility"),
    "wuxing/engine-params.json": ("engine-params", engine_params, "Five-phase engine defaults"),
    "config/scope-profiles.json": ("scope-profiles", scope_profiles, "Application configuration (profiles)"),
    "safety/rules.json": ("safety-rules", safety_rules, "Safety rules"),
    "treatment/guidance.json": ("treatment-guidance", treatment_guidance, "Treatment guidance"),
}


def build(rel: str) -> dict:
    stem, builder, title = SCHEMAS[rel]
    return finish(builder(), title)
