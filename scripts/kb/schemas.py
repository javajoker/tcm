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
    "panelDim": pattern(rf"^(({ORGANS})\.(qi|blood|yin|yang|stasis)|liuxie\.(風|寒|暑|濕|燥|火)|product\.(痰|飲|瘀|食積)|yingwei\.(衛|營|開闔)|bagang\.exterior)$"),
    "panelMap": {"type": "object", "propertyNames": {"$ref": "#/$defs/panelDim"}, "additionalProperties": NUM},
    "reviewStatus": enum("derived", "curated-draft", "draft", "reviewed"),
    "enStatus": enum("machine-draft", "reviewed"),
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
        "status": ref("reviewStatus"), "tongue_pulse_note": STR, "tongue_pulse_note_en": STR, "principle_en": STR, "en_status": ref("enStatus"),
        "treatment": obj({"acupoints": arr(STR), "foods": arr(STR), "lifestyle": STR}),
        "weights": dictionary({"type": "integer", "minimum": 1, "maximum": 3}, ref("symptomId"), 1),
    })
    return envelope(item, meta({"count": INT, "scoring": STR}, ["count", "scoring"]))


def pattern_elements() -> dict:
    item = obj({
        "against": dictionary(NUM, ref("symptomId")), "id": ref("elementId"), "location": enum("全身", "心", "肝", "肺", "胃", "脾", "腎", "表"), "name": ref("bilingual"),
        "nature": enum("寒", "氣滯", "氣虛", "濕", "火", "痰", "瘀", "血虛", "陰虛", "陽虛", "風", "營弱衛強", "衛閉", "衛氣不和", "衛弱"), "patterns": arr(ref("patternId"), 1),
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


def red_flag_terms() -> dict:
    term = {"oneOf": [{"type": "string", "minLength": 2}, {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 2}]}
    item = obj({"id": ref("redFlagId"), "zh-Hant": arr(term), "en": arr(term)})
    return envelope(item, meta({"status": ref("reviewStatus")}, ["status"]))


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
        "products": arr(STR, 4),
        "yingwei": obj({"dimensions": arr(STR, 3), "scale": dictionary(STR), "coupling": obj({"strength": NUM, "sources": dictionary(dictionary(NUM))})})},
        "required": ["_meta", "channels", "derived", "exterior_locations", "liuxie", "location_organs", "nature_projection", "offsets", "organs", "products", "yingwei"], "additionalProperties": False}


def yingwei() -> dict:
    """data/diagnosis/yingwei.json (PM-52): 營衛 in the panel — readings with applicability weights, the values and confidences computed from them."""
    citations = arr(ref("citationId"), 1)
    reading = obj({"citations": citations, "says": STR, "applicability": NUM, "value": NUM, "why": STR})
    dim_values = obj({"readings": arr(reading, 1), "value": NUM, "confidence": NUM})
    nature = obj({"name": STR, "pattern": STR, "location": STR, "says": STR, "dimensions": dictionary(dim_values, min_props=1),
                  "projection_per_degree": dictionary(NUM)})
    question = obj({"id": pattern(r"^Q[0-9]+$"), "question": STR, "en": STR, "result": STR, "readings": arr(reading, 1), "dimension": STR, "pattern": STR,
                    "value": NUM, "confidence": NUM}, ["id", "question", "en", "result"])
    source = obj({"citations": citations, "says": STR, "applicability": NUM, "dims": arr(STR, 1), "why": STR})
    coupling = obj({"strength": NUM, "targets": dictionary(obj({"readings": arr(source, 1), "sources": dictionary(NUM)}))})
    stage = obj({"stage": STR, "app": STR, "citation": ref("citationId"), "red_flags": arr(STR, 1)}, ["stage", "app"])
    dimension = obj({"id": pattern(r"^yingwei\.(衛|營|開闔)$"), "zh": STR, "en": STR, "scale": STR, "basis": citations})
    return {"type": "object", "properties": {
        "_meta": meta({"rule": STR, "status": ref("reviewStatus")}, ["rule", "status"]),
        "dimensions": arr(dimension, 3), "natures": dictionary(nature, min_props=1), "questions": arr(question, 1), "coupling": coupling,
        "stages": arr(stage, 1), "not_modelled": arr(obj({"what": STR, "citations": citations, "why": STR}))},
        "required": ["_meta", "coupling", "dimensions", "natures", "not_modelled", "questions", "stages"], "additionalProperties": False}


def scoring_params() -> dict:
    sev = obj({"light": NUM, "moderate": NUM, "severe": NUM, "ungraded": NUM})
    quality = obj({"by_source": obj({"inquiry": NUM, "measured": NUM, "guided": NUM, "pulse": NUM}), "by_prefix": dictionary(enum("inquiry", "measured", "guided", "pulse")),
                   "default_source": enum("inquiry", "measured", "guided", "pulse")})
    pattern_ = obj({"required_any_missing_factor": NUM, "bands": obj({"high": NUM, "medium": NUM, "weak": NUM})})
    panel = obj({"noisy_or_floor": NUM, "degree_max": NUM, "dimension_weights": obj({"organ": NUM, "liuxie": NUM, "product": NUM, "yingwei": NUM, "bagang": NUM}),
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
        "questionnaire": obj({"core_coverage_stop": NUM, "max_questions": INT, "candidate_pct_floor": NUM, "core_bonus": NUM, "module_boost": NUM, "min_answers_for_gain": INT, "gain_candidates": INT})},
        "required": ["_meta", "formula", "pattern", "panel", "quality", "questionnaire", "reconcile", "safety", "severity", "tier"], "additionalProperties": False}


def sources() -> dict:
    from .curated.sources import DOMAINS, KINDS, STATUSES
    corpus = obj({"exists": BOOL, "path": STR, "repo": enum("TCM-Ancient-Books", "TCM-Library")})
    edition = obj({"author": NSTR, "category": NSTR, "dynasty": NSTR, "year": NSTR})
    item = obj({
        "author": NSTR, "corpus": arr(corpus), "domains": arr(enum(*DOMAINS), 1, True), "drawn_on": BOOL, "edition": {"oneOf": [{"type": "null"}, edition]}, "era": NSTR,
        "id": pattern(r"^[a-z0-9]+(-[a-z0-9]+)*$"), "kind": enum(*KINDS), "names": arr(STR), "quotations": INT, "references": dictionary(INT), "status": enum(*STATUSES),
        "title": STR, "use": NSTR,
    })
    return envelope(item, meta({
        "corpus_categories": dictionary(obj({"books": INT, "drawn_on": INT, "registered": INT})), "count": INT, "domains": dictionary(obj({"en": STR, "zh-Hant": STR})),
        "drawn_on": INT, "status_counts": dictionary(INT), "unresolved": arr(obj({"file": STR, "value": STR})),
    }, ["corpus_categories", "count", "domains", "drawn_on", "status_counts", "unresolved"]))


# ── herbs and formulas ──────────────────────────────────────────────────────

def herbs() -> dict:
    flavor = obj({"element": ref("element"), "flavor": enum("辛", "苦", "甘", "酸", "澀", "鹹", "淡"), "weight": NUM})
    source = obj({"book": STR, "commit": NSTR, "entry_id": STR, "path": STR, "repo": STR})
    item = obj({
        "aliases": arr(STR), "category": STR, "caution": NSTR, "classical_formulas": arr(STR), "data_quality": arr(STR), "dose_g_reference": {"oneOf": [{"type": "null"}, tup(NUM, 2)]},
        "effects": ref("panelMap"), "flavors": arr(flavor), "functions": arr(STR), "harms": ref("panelMap"), "id": ref("herbId"), "interactions": arr(STR), "latin": NSTR,
        "name": ref("bilingual"), "organs": arr(STR), "pregnancy": enum("ok", "ok-unreviewed", "caution", "avoid"), "siqi": arr(STR), "slug": STR, "source": source,
        "status": enum("derived", "curated-draft", "reviewed"), "tags": arr(STR), "temperature": NUM, "toxic": BOOL,
        # the property model v2 (PM-36): derived by named rules (scripts/kb/herb_props.py); `props_rules` names them and stays out of a release bundle
        "props": obj({
            "bu_xie": enum("補", "瀉", "平"), "direction": NUM, "five_phase": {"oneOf": [{"type": "null"}, tup(NUM, 5)]}, "part": NSTR, "qi_xue": enum("氣", "血", "兼", None),
            "run_zao": enum("潤", "燥", "平"), "toxicity": enum("無毒", "小毒", "有毒", "大毒"), "tropism": dictionary(NUM), "yinyang": NUM,
        }),
        "props_rules": dictionary(arr(STR, 1)),
    }, ["category", "caution", "classical_formulas", "data_quality", "dose_g_reference", "effects", "flavors", "functions", "harms", "id", "interactions", "latin", "name",
        "organs", "pregnancy", "props", "siqi", "slug", "source", "status", "tags", "temperature", "toxic"])
    return envelope(item, meta({"conventions": loose(), "count": INT, "licence_note": STR, "status_counts": dictionary(INT)}, ["conventions", "count", "licence_note", "status_counts"]))


def pairings() -> dict:
    source = obj({"book": STR, "chapter": STR, "entry_zh_hans": STR, "note": STR, "path": STR}, ["book", "chapter"])
    item = obj({"herb": ref("herbId"), "id": pattern(r"^[a-z0-9]+\.(xu|shi|wei|wu|fan)\.[a-z0-9]+$"), "other": ref("herbId"), "says": STR, "source": source,
                "status": enum("derived", "curated-draft", "reviewed"), "type": enum("相須", "相使", "相畏", "相惡", "相反")})
    return envelope(item, meta({"citations": arr(ref("citationId")), "count": INT, "entries_read": INT, "names_not_in_the_knowledge_base": INT, "type_counts": dictionary(INT),
                                "types": dictionary(STR)}, ["citations", "count", "entries_read", "type_counts", "types"]))


def yinjing() -> dict:
    channel = obj({"channel": STR, "entry_zh_hans": STR, "herbs": arr(ref("herbId"), None, True), "organ": pattern(r"^(肝|心|脾|肺|腎|膽|小腸|胃|大腸|膀胱|心包|三焦)$"), "unread": STR})
    return {"type": "object", "properties": {"_meta": meta({"book": STR, "chapter": STR, "path": STR}, ["book", "chapter"]), "channels": arr(channel, 12)},
            "required": ["_meta", "channels"], "additionalProperties": False}


def processing() -> dict:
    modifiers = obj({"bu_xie": enum("補", "瀉", "平"), "direction": NUM, "harms_scale": NUM, "run_zao": enum("潤", "燥", "平"), "temperature": NUM, "tropism": dictionary(NUM)}, [])
    method = obj({"citation": {"oneOf": [{"type": "null"}, ref("citationId")]}, "id": pattern(r"^[a-z]+$"), "modifiers": modifiers, "name": STR, "says": STR,
                  "status": enum("curated-draft", "reviewed"), "words": arr(STR, 1)})
    return {"type": "object", "properties": {"_meta": meta({"modifiers": dictionary(STR)}, ["modifiers"]), "cleaning": arr(STR), "methods": arr(method, 1)},
            "required": ["_meta", "cleaning", "methods"], "additionalProperties": False}


def dose_bands() -> dict:
    band = obj({"direction": NUM, "effects_add": ref("panelMap"), "effects_scale": ref("panelMap"), "harms_add": ref("panelMap"), "tropism": dictionary(NUM)}, [])
    item = obj({"citation": ref("citationId"), "herb": ref("herbId"), "large": band, "name": STR, "says": STR, "small": band, "status": enum("curated-draft", "reviewed")})
    return envelope(item, meta({"fields": dictionary(STR)}, ["fields"]))


def sanyin() -> dict:
    said = {"says": STR, "citation": ref("citationId")}
    return {"type": "object", "properties": {
        "_meta": meta({"design": STR, "status": STR}, ["design", "status"]),
        "severity": obj({"light": NUM, "standard": NUM, "strong": NUM, **said}),
        "age": obj({"minors": arr(obj({"below_years": NUM, "fraction": pattern(r"^[0-9]+/[0-9]+$"), "label": STR}), 1), "elderly_from_years": NUM,
                    "elderly_fraction": pattern(r"^[0-9]+/[0-9]+$"), **said}),
        "constitution": arr(obj({"avoid": enum("寒涼", "溫熱", "溫", "溫燥", "滋膩", "補"), "constitution": pattern(r"^C_[A-Z]+$"), "factor": NUM, **said})),
        "heat_demand": NUM,
        "season": arr(obj({"element": enum("木", "火", "土", "金", "水"), "factor": NUM, "says": STR, "temperature_at_least": NUM, "temperature_at_most": NUM}, ["element", "factor", "says"])),
        "season_citation": ref("citationId"), "season_spares_jun": BOOL, "season_exception": obj(said),
        "region": obj({"rules": arr(loose()), **said}), "general": obj(said), "round_g": NUM,
    }, "required": ["_meta", "age", "constitution", "general", "heat_demand", "region", "round_g", "season", "season_citation", "season_exception", "season_spares_jun", "severity"], "additionalProperties": False}


def mechanisms() -> dict:
    item = obj({"citation": ref("citationId"), "direction": enum("升", "降", "宣", "收"), "pattern": ref("patternId"), "says": STR, "sign": enum(1, -1),
                "status": enum("curated-draft", "reviewed")})
    return envelope(item, meta({"design": STR}, ["design"]))


def prescription() -> dict:
    params = obj({
        "bands": obj({"large_above": NUM, "small_below": NUM}), "dose": obj({"gamma": NUM, "kappa": NUM, "reference": STR}), "mechanism": obj({"theta": NUM, "top": INT}),
        "pairs": obj({"sigma": NUM, "tau": NUM}), "roles": obj({"carrier_min": NUM, "fanzuo_below": NUM}),
        "verification": obj({"burden_ratio_max": NUM, "cosine_min": NUM, "flat_below": NUM, "rank_max": INT}),
    })
    return {"type": "object", "properties": {"_meta": meta({"design": STR}, ["design"]), "params": params}, "required": ["_meta", "params"], "additionalProperties": False}


def herb_index() -> dict:
    return {"type": "object", "properties": {"_meta": meta(), "index": dictionary(ref("herbId"), min_props=1)}, "required": ["_meta", "index"], "additionalProperties": False}


def formulas() -> dict:
    classical = obj({"processing": STR, "unit": enum("兩", "個", "枚", "升", "合", "斤"), "value": NUM})
    comp = obj({"classical_amount": classical, "effective_weight": NUM, "herb": ref("herbId"), "name": STR, "note": NSTR, "proportion": NUM, "role": enum("君", "臣", "佐", "使"),
                "role_weight": NUM, "typical_g": NUM}, ["effective_weight", "herb", "name", "note", "proportion", "role", "role_weight"])  # amounts are pruned from release bundles
    mod_herb = obj({"herb": ref("herbId"), "name": STR, "role": enum("君", "臣", "佐", "使"), "typical_g": NUM}, ["herb", "name", "role"])
    mod = obj({"add": arr(mod_herb), "id": pattern(r"^M_[A-Z0-9_]+$"), "remove": arr(mod_herb), "result_name": STR,
               "source": obj({"book": STR, "verification": STR}), "status": STR, "when_symptoms": arr(ref("symptomId"))})
    verification = obj({
        "classical": obj({"anchor": STR, "matched_in_formula": arr(STR), "not_in_formula": arr(STR), "note": NSTR, "parsed": INT, "path": STR},
                         ["anchor", "matched_in_formula", "not_in_formula", "note", "parsed"]),
        "composition_check": obj({"book_path": STR, "found": INT, "missing": arr(STR), "note": STR, "occurrences": INT, "total": INT}, ["found", "missing", "occurrences", "total"]),
        "composition_status": enum("verified-against-classical-text", "verified-against-source-book", "verified-against-second-source", "partially-verified"),
        "proportion_basis": STR, "role_status": STR, "source_note": STR,
        "second_source": obj({"checked": STR, "entry": STR, "herbs_found": arr(STR), "herbs_not_found": arr(STR), "method": STR, "note": STR, "page": STR, "site": STR, "url": STR},
                             ["checked", "entry", "herbs_found", "herbs_not_found", "method", "note", "page", "site", "url"]),
    }, ["composition_status", "proportion_basis", "role_status"])
    item = obj({
        "cautions": arr(STR), "classical_amounts": {"oneOf": [{"type": "null"}, arr(obj({"amount": NUM, "name": STR, "processing": STR, "unit": enum("兩", "個", "枚", "升", "合", "斤")}))]},
        "composition": arr(comp, 1), "core_indications": arr(ref("symptomId"), 1), "flavor_profile": dictionary(NUM), "id": ref("formulaId"), "interactions": arr(STR),
        "kb_commit": STR, "modifications": arr(mod), "mvp": BOOL, "name": ref("bilingualNamed"), "panel_burden": ref("panelMap"), "panel_effect": ref("panelMap"),
        "patterns": arr(ref("patternId")), "pregnancy": enum("ok", "ok-unreviewed", "caution", "avoid"), "principle": STR, "rationale_citations": arr(ref("citationId")),
        "rationale_zh": STR, "rationale_en": STR, "cautions_en": arr(STR), "principle_en": STR, "en_status": ref("enStatus"), "school": enum("經方", "時方"), "source": obj({"book": STR, "ref": STR, "repo_path": STR}, ["book", "ref"]), "status": ref("reviewStatus"),
        "tier": enum("A", "B", "C"), "tier_reasons": arr(STR), "verification": verification,
    }, ["cautions", "cautions_en", "classical_amounts", "composition", "core_indications", "en_status", "flavor_profile", "id", "interactions", "modifications", "mvp", "name", "panel_burden", "panel_effect", "patterns",
        "pregnancy", "principle", "principle_en", "rationale_citations", "rationale_en", "rationale_zh", "school", "source", "status", "tier", "tier_reasons", "verification"])  # kb_commit is internal: pruned from release bundles
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
        "ai": obj({"enabled": BOOL, "endpoint": {"type": ["string", "null"], "pattern": "^https?://[^/?#]+$"}, "modules": obj({"conversation": BOOL, "tongue": BOOL, "face": BOOL})}),
        "dose_display": enum("off", "roles", "all"),
    })
    level_def = obj({"includes": arr(STR, 1), "name": ref("bilingualNamed")})
    raise_to = obj({"level": ref("level")})
    overlay = obj({"population": obj({"adult": raise_to, "elderly_65_plus": raise_to}),
                   "features": obj({"show_dosage_reference": BOOL, "show_formula_modification": BOOL, "show_herb_weights": BOOL, "show_tier_c": BOOL})})
    return {"type": "object", "properties": {
        "_meta": meta({"version": INT}, ["version"]),
        "dimensions": obj({"condition": arr(STR, 7), "population": arr(STR, 5), "state": arr(STR, 3)}),
        "levels": obj({"L0": level_def, "L1": level_def, "L2": level_def, "L3": level_def}),
        "notice_kinds": obj({"blocking_ack": STR, "inline": STR, "none": STR}),
        "profiles": obj({"dev": profile, "release": profile}),
        "roles": obj({"learner": overlay, "practitioner": overlay}),
        "resolution": loose(["effective_level", "effective_notice", "flow"])},
        "required": ["_meta", "dimensions", "levels", "notice_kinds", "profiles", "resolution", "roles"], "additionalProperties": False}


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
    cautions = arr(ref("bilingualNamed"))
    acupoint = obj({"basis": STR, "code": STR, "cautions": cautions, "location": ref("bilingualNamed"), "meridian": STR, "pregnancy_avoid": BOOL, "status": ref("reviewStatus")})
    # `id`: the stable ASCII address of the diet entry on the Learn pages (the entry is keyed by its Chinese name, which patterns list)
    food = obj({"basis": enum("pharmacopoeia", "textbook"), "cautions": cautions, "citations": arr(ref("citationId"), 1), "flavors": arr(STR, 1), "functions": arr(STR), "herb": {"oneOf": [{"type": "null"}, ref("herbId")]},
                "id": pattern(r"^[a-z][a-z0-9-]{0,63}$"), "nature": STR, "pregnancy_caution": BOOL, "rationale": ref("bilingualNamed"), "status": ref("reviewStatus")})
    return {"type": "object", "properties": {
        "_meta": meta({"status": ref("reviewStatus")}, ["status"]),
        "acupoints": dictionary(acupoint, min_props=1),
        "acupressure": obj({"cautions": cautions, "how": ref("bilingualNamed")}),
        "foods": dictionary(food, min_props=1),
        "lifestyle": dictionary(ref("bilingualNamed"), min_props=1),
        "food_pregnancy_caution": arr(STR),
        "general": obj({"en_status": ref("enStatus"), "source": arr(ref("citationId")), "text": STR, "text_en": STR})},
        "required": ["_meta", "acupoints", "acupressure", "food_pregnancy_caution", "foods", "general", "lifestyle"], "additionalProperties": False}


def constitution_items() -> dict:
    item = obj({"id": pattern(r"^CI_[A-Z]+_[0-9]+$"), "reverse": BOOL, "text": ref("bilingualNamed")})
    type_ = obj({"constitution": ref("constitutionId"), "description": ref("bilingualNamed"), "items": arr(item, 3)})
    scale = obj({"label": ref("bilingualNamed"), "value": INT})
    return {"type": "object", "properties": {
        "_meta": meta({"count": INT, "scoring": STR, "status": ref("reviewStatus")}, ["count", "scoring", "status"]),
        "prompt": ref("bilingualNamed"), "scale": tup(scale, 5), "types": arr(type_, 9)},
        "required": ["_meta", "prompt", "scale", "types"], "additionalProperties": False}


def emergency() -> dict:
    number = obj({"label": ref("bilingualNamed"), "number": pattern(r"^[0-9]{2,4}$")})
    # `verification`: who checked the numbers against an official source, when and for what (docs/post-mvp/design/tap-tempo-and-regions.md §2.3). Absent = a draft row.
    verification = obj({"at": pattern(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"), "by": STR, "scope": enum("emergency", "crisis", "both"), "source": STR})
    region = obj({"crisis": arr(number), "emergency": arr(number), "id": pattern(r"^[A-Z]{2,5}$"), "name": ref("bilingualNamed"), "status": ref("reviewStatus"),
                  "timezones": arr(STR, unique=True), "verification": verification}, ["crisis", "emergency", "id", "name", "status", "timezones"])
    return {"type": "object", "properties": {
        "_meta": meta({"status": ref("reviewStatus")}, ["status"]),
        "regions": arr(region, 1)},
        "required": ["_meta", "regions"], "additionalProperties": False}


def name_fold() -> dict:
    # `FROM:TO` code points in hex (no Chinese text in the file: the Simplified display dictionary has nothing to do with the safety rules' table)
    return {"type": "object", "properties": {
        "_meta": meta({"count": INT, "format": STR, "status": ref("reviewStatus")}, ["count", "format", "status"]),
        "fold": arr(pattern(r"^[0-9A-F]{4,6}:[0-9A-F]{4,6}$"), None, True)},
        "required": ["_meta", "fold"], "additionalProperties": False}


def glossary() -> dict:
    item = obj({"alt": arr(STR, None, True), "domain": STR, "en": STR, "id": pattern(r"^[a-z][a-z0-9-]{0,63}$"), "note": {"oneOf": [{"type": "null"}, STR]}, "pinyin": STR, "source": enum("who-istm-2007", "textbook", "project"),
                "status": enum("needs-review", "reviewed"), "zh-Hant": STR})
    return envelope(item, meta({"count": INT}, ["count"]))


def cities() -> dict:
    item = obj({"alt_hans": arr(STR, 1, True), "cc": pattern(r"^[A-Z]{2}$"), "en": STR, "id": INT, "lat": NUM, "lon": NUM, "tz": STR, "zh": STR}, ["cc", "en", "id", "lat", "lon", "tz"])
    source = obj({"attribution": STR, "dataset": STR, "extract": STR, "licence": STR, "licence_url": STR, "name": STR, "url": STR})
    return envelope(item, meta({"count": INT, "source": source, "status": ref("reviewStatus")}, ["count", "source", "status"]))


def review_records() -> dict:
    role = enum("tcm-clinical", "pharmacy", "physician", "linguistic", "legal")
    hash16 = pattern(r"^[0-9a-f]{16}$")
    scope = obj({"file": STR, "units": dictionary(hash16, None, 1)})
    record = obj({"area": STR, "changes": arr(STR), "date": pattern(r"^\d{4}-\d{2}-\d{2}$"), "dissent": arr(STR), "id": pattern(r"^REV-\d{4}-\d{4}$"), "kb_version": STR,
                  "notes": STR, "outcome": enum("accepted", "accepted-with-changes", "rejected", "deferred"), "reviewer": obj({"credential": STR, "name": STR, "role": role}),
                  "scope": arr(scope, 1)})
    reviewed = obj({"file": STR, "hash": hash16, "records": arr(pattern(r"^REV-\d{4}-\d{4}$"), 1), "unit": STR})
    stale = obj({"current_hash": hash16, "file": STR, "record": pattern(r"^REV-\d{4}-\d{4}$"), "reviewed_hash": hash16, "unit": STR})
    coverage = obj({"required_roles": arr(arr(role, 1), 1), "reviewed": INT, "units": INT, "whole_file_reviewed": BOOL})
    return {"type": "object", "properties": {
        "_meta": meta({"count": INT, "problems": INT, "status": ref("reviewStatus")}, ["count", "problems", "status"]),
        "coverage": dictionary(coverage), "records": arr(record), "reviewed": arr(reviewed), "stale": arr(stale)},
        "required": ["_meta", "coverage", "records", "reviewed", "stale"], "additionalProperties": False}


def admission() -> dict:
    pid = pattern(r"^[A-Z]{2}[0-9]{1,2}$")
    reason = {"type": "string", "minLength": 1}
    return {"type": "object", "properties": {
        "_meta": meta({"waivers": INT}, ["waivers"]),
        "margin_exceptions": arr(obj({"patterns": {"type": "array", "items": pid, "minItems": 2, "maxItems": 2, "uniqueItems": True}, "reason": reason})),
        "needs_exam": arr(pid, None, True),
        "no_release_formula": arr(obj({"pattern": pid, "reason": reason})),
        "original": arr(pid, 1, True),
        "red_flag_boundary": arr(obj({"flags": arr(pattern(r"^RF_[A-Z0-9_]+$"), None, True), "pattern": pid, "reason": STR})),
        "textbook_sources": arr(obj({"note": STR, "path": pattern(r"^reference/.+"), "pattern": pid})),
        "waivers": arr(obj({"patterns": arr(pid, 1, True), "reason": reason, "row": pattern(r"^A[0-9]{1,2}$")}))},
        "required": ["_meta", "margin_exceptions", "needs_exam", "no_release_formula", "original", "red_flag_boundary", "textbook_sources", "waivers"], "additionalProperties": False}


# file (relative to data/) → (schema file stem, builder, title)
SCHEMAS = {
    "citations.json": ("citations", citations, "Quotation registry"),
    "sources.json": ("sources", sources, "Sources registry"),
    "glossary.json": ("glossary", glossary, "Glossary"),
    "geo/cities.json": ("cities", cities, "Cities for the birth-place picker"),
    "herbs/herbs.json": ("herbs", herbs, "Herbs"),
    "herbs/herb-index.json": ("herb-index", herb_index, "Herb name index"),
    "herbs/pairings.json": ("pairings", pairings, "七情 pairings between herbs"),
    "herbs/processing.json": ("processing", processing, "Processing (炮製) methods"),
    "herbs/dose-bands.json": ("dose-bands", dose_bands, "Dose bands (量效)"),
    "herbs/yinjing.json": ("yinjing", yinjing, "引經報使: the herbs that lead to each channel"),
    "treatment/prescription.json": ("prescription", prescription, "Parameters of the prescription model"),
    "treatment/mechanisms.json": ("mechanisms", mechanisms, "The direction a pattern's treatment asks for"),
    "treatment/sanyin.json": ("sanyin", sanyin, "三因制宜: the factors of a personalised prescription"),
    "formulas/formulas.json": ("formulas", formulas, "Formulas"),
    "diagnosis/symptoms.json": ("symptoms", symptoms, "Symptom registry"),
    "diagnosis/questions.json": ("questions", questions, "Question bank"),
    "diagnosis/exclusions.json": ("exclusions", exclusions, "Exclusive groups, conflicts and splits"),
    "diagnosis/orientation.json": ("orientation", orientation, "Eight-principle first-impression signs"),
    "diagnosis/patterns.json": ("patterns", patterns, "Patterns"),
    "diagnosis/pattern-elements.json": ("pattern-elements", pattern_elements, "Pattern elements (證素)"),
    "diagnosis/constitutions.json": ("constitutions", constitutions, "Constitutions"),
    "diagnosis/constitution-items.json": ("constitution-items", constitution_items, "Constitution questionnaire"),
    "diagnosis/red-flags.json": ("red-flags", red_flags, "Red flags"),
    "diagnosis/tongue.json": ("tongue", tongue, "Tongue zones and features"),
    "diagnosis/pulse.json": ("pulse", pulse, "Pulses and positions"),
    "diagnosis/panel-schema.json": ("panel-schema", panel_schema, "Panel schema"),
    "diagnosis/yingwei.json": ("yingwei", yingwei, "營衛 in the panel"),
    "diagnosis/scoring-params.json": ("scoring-params", scoring_params, "Diagnosis engine parameters"),
    "wuxing/correspondences.json": ("correspondences", correspondences, "Five-phase correspondences"),
    "wuxing/ganzhi.json": ("ganzhi", ganzhi, "Stems, branches, solar terms"),
    "wuxing/yunqi.json": ("yunqi", yunqi, "Wuyun liuqi tables"),
    "wuxing/susceptibility.json": ("susceptibility", susceptibility, "Constitution × pathogenic-qi susceptibility"),
    "wuxing/engine-params.json": ("engine-params", engine_params, "Five-phase engine defaults"),
    "config/scope-profiles.json": ("scope-profiles", scope_profiles, "Application configuration (profiles)"),
    "safety/rules.json": ("safety-rules", safety_rules, "Safety rules"),
    "safety/emergency.json": ("emergency", emergency, "Emergency and crisis numbers"),
    "safety/red-flag-terms.json": ("red-flag-terms", red_flag_terms, "Words that re-open the red-flag screening (AI help)"),
    "safety/name-fold.json": ("name-fold", name_fold, "Character fold of the names an allergy can match"),
    "treatment/guidance.json": ("treatment-guidance", treatment_guidance, "Treatment guidance"),
    "review/records.json": ("review-records", review_records, "Review records and what they cover"),
    "review/admission.json": ("admission", admission, "Admission records of the pattern library"),
}


def build(rel: str) -> dict:
    stem, builder, title = SCHEMAS[rel]
    return finish(builder(), title)
