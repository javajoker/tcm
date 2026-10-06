"""Validation of data/*.json: JSON Schema contract, cross-references, vocabularies and numeric sanity.

`validate(load)` returns the list of problems (empty = valid) so tests can feed it mutated data; `main()` prints and returns the exit code.
Checks fall into: 1 schema · 2 parameters · 3 identity and uniqueness · 4 cross-references · 5 formulas (composition, tier recomputation) ·
6 patterns and elements · 7 examination data · 8 policy and safety · 9 provenance · 10 admission (the machine rows of the library-expansion checklist, PM-21).
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft202012Validator

from . import admission, build_name_fold
from .common import DATA, ROOT, submodule_commits
from .curated import panel as panel_cfg
from .schemas import SCHEMAS, SCHEMA_VERSION

ORGANS = set(panel_cfg.ZANG) | set(panel_cfg.FU)
CHANNELS = {"qi", "blood", "yin", "yang", "stasis"}
LIUXIE = set(panel_cfg.LIUXIE)
PRODUCTS = set(panel_cfg.PRODUCTS)
PREG_ORDER = {"ok": 0, "ok-unreviewed": 1, "caution": 2, "avoid": 3}

Loader = Callable[[str], dict]


def load(rel: str) -> dict:
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


def valid_target(t: str) -> bool:
    if t == "bagang.exterior":
        return True
    kind, _, rest = t.partition(".")
    if kind == "liuxie":
        return rest in LIUXIE
    if kind == "product":
        return rest in PRODUCTS
    return t.split(".")[0] in ORGANS and t.split(".")[1] in CHANNELS if "." in t else False


def valid_template_target(t: str) -> bool:
    """panel-schema nature_projection targets may use the `{organ}` placeholder."""
    return valid_target(t.replace("{organ}", "肝"))


# Orthography: terms use 濕, never 溼. Classical quotations keep the converted source text, so these fields are exempt.
QUOTATION_FIELDS = {("citations.json", "quote_zh_hant"), ("wuxing/yunqi.json", "excerpt")}


def variant_hits(rel: str, node, key: str = "") -> list[str]:
    """Paths of strings under `node` that contain 溼, excluding quotation fields."""
    if isinstance(node, str):
        return [f"{rel}:{key}"] if "溼" in node and (rel, key) not in QUOTATION_FIELDS else []
    if isinstance(node, dict):
        return [h for k, v in node.items() for h in variant_hits(rel, v, k if not isinstance(v, (dict, list)) else key or k)]
    if isinstance(node, list):
        return [h for v in node for h in variant_hits(rel, v, key)]
    return []


# Fields that hold the Simplified source on purpose (quotation sources, paths into the source repositories, page titles on a source site, the strings the parser matches against the source text).
SOURCE_KEYS = {"quote_source_zh_hans", "source_path", "repo_path", "book_path", "anchor", "path", "page"}
# Genuine Traditional characters that the Big5-HKSCS repertoire (the proxy for "an ordinary Traditional font has it") lacks: 次髎 (BL32) and three in the 五運六氣 quotations (瞤 腨 黅).
# They are the only places a font could lack a glyph (task PF-02); everything else is in Big5-HKSCS.
TRADITIONAL_BEYOND_BIG5 = {"髎", "瞤", "腨", "黅"}


def simplified_hits(rel: str, node, key: str = "") -> list[str]:
    """Paths of strings under `node` with a character that Big5-HKSCS cannot encode (in practice: a Simplified form), outside the fields that keep the Simplified source."""
    if isinstance(node, str):
        if key.endswith("_hans") or key in SOURCE_KEYS:
            return []
        for c in node:
            if "\u3400" <= c <= "\u9fff" and c not in TRADITIONAL_BEYOND_BIG5:
                try:
                    c.encode("big5hkscs")
                except UnicodeEncodeError:
                    return [f"{rel}:{key} {c}"]
        return []
    if isinstance(node, dict):
        return [h for k, v in node.items() for h in simplified_hits(rel, v, k if not isinstance(v, dict) else key or k)]
    if isinstance(node, list):
        return [h for v in node for h in simplified_hits(rel, v, key)]
    return []


def duplicates(values) -> list:
    return [v for v, n in Counter(values).items() if n > 1]


def validate(load: Loader = load, check_sources: bool = True) -> list[str]:
    errors: list[str] = []
    err = errors.append

    # ── 1. JSON Schema contract ────────────────────────────────────────────
    for rel, (stem, _b, _t) in SCHEMAS.items():
        schema = json.loads((DATA / "schema" / f"{stem}.schema.json").read_text(encoding="utf-8"))
        data = load(rel)
        if data.get("_meta", {}).get("schema") != SCHEMA_VERSION:
            err(f"{rel}: _meta.schema is {data.get('_meta', {}).get('schema')!r}, expected {SCHEMA_VERSION}")
        problems = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])
        for e in problems[:6]:
            err(f"{rel}: schema violation at /{'/'.join(str(p) for p in e.absolute_path)}: {e.message[:160]}")
        if len(problems) > 6:
            err(f"{rel}: … and {len(problems) - 6} more schema violations")
    if errors:       # later checks assume the shapes are right
        return errors

    for rel in SCHEMAS:
        hits = variant_hits(rel, load(rel))
        if hits:
            err(f"{rel}: 溼 found outside quotations (use 濕): {sorted(set(hits))[:4]}")

    for rel in SCHEMAS:
        hits = simplified_hits(rel, load(rel))
        if hits:
            err(f"{rel}: Simplified characters in text that is shown in Traditional ({len(hits)}): {sorted(set(hits))[:4]}")

    # ── review: `reviewed` is set by the build from valid records only, never by hand (content review §5)
    from . import review as rv
    records = load("review/records.json")
    if records["_meta"]["problems"]:
        err(f"review records: {records['_meta']['problems']} problem(s); run `python -m scripts.kb.build_review` to see them")
    supported = {(r["file"], r["unit"]) for r in records["reviewed"]}
    for rel, uids in sorted(rv.reviewed_by_status({r: load(r) for r in SCHEMAS if r != "review/records.json"}).items()):
        for uid in sorted(uids):
            if (rel, uid) not in supported:
                err(f"{rel}: {uid} is marked reviewed but no valid, current review record supports it (statuses are set by the build from review/records/*.yaml)")

    cit = load("citations.json")
    cit_ids = {c["id"] for c in cit["items"]}
    if cit["_meta"]["unverified"]:
        err(f"unverified citations: {cit['_meta']['unverified']}")
    if any(not c["verified"] for c in cit["items"]):
        err("citations: every item must have verified = true")

    # ── 2. parameters ──────────────────────────────────────────────────────
    params = load("diagnosis/scoring-params.json")
    sev, qual = params["severity"], params["quality"]
    if not (0 < sev["light"] <= sev["moderate"] <= sev["severe"] <= 1 and sev["ungraded"] == sev["severe"]):
        err("scoring-params: severity factors must satisfy 0 < light ≤ moderate ≤ severe ≤ 1 and ungraded = severe")
    if not all(0 < v <= 1 for v in qual["by_source"].values()):
        err("scoring-params: quality coefficients must be in (0, 1]")
    if not set(qual["by_prefix"].values()) <= set(qual["by_source"]) or qual["default_source"] not in qual["by_source"]:
        err("scoring-params: quality prefix or default source is not a known source")
    bands = params["pattern"]["bands"]
    if not (bands["high"] > bands["medium"] > bands["weak"] > 0):
        err("scoring-params: pattern bands must satisfy high > medium > weak > 0")
    conf = params["reconcile"]["confidence"]
    if not (conf["high"]["pct1"] >= conf["medium"]["pct1"] >= conf["low"]["pct1"] and conf["high"]["margin"] >= conf["medium"]["margin"]
            and conf["high"]["coverage"] >= conf["medium"]["coverage"]):
        err("scoring-params: confidence thresholds must be non-increasing from high to low")
    roles = params["formula"]["role_weights"]
    if not (roles["君"] > roles["臣"] > roles["佐"] > roles["使"] > 0):
        err("scoring-params: role weights must satisfy 君 > 臣 > 佐 > 使 > 0")
    if params["panel"]["noisy_or_floor"] < 0 or params["panel"]["degree_max"] <= 0:
        err("scoring-params: invalid panel floor or degree_max")
    pulse = load("diagnosis/pulse.json")
    if qual["by_source"]["pulse"] != pulse["_meta"]["guidance"]["quality_coefficient"]:
        err("pulse.json quality coefficient differs from scoring-params")
    scope = load("config/scope-profiles.json")
    for pname, prof in scope["profiles"].items():
        if prof["tongue_pulse"]["pulse_quality_coefficient"] != qual["by_source"]["pulse"]:
            err(f"profile {pname}: pulse_quality_coefficient differs from scoring-params")

    # ── 3. identity and uniqueness ─────────────────────────────────────────
    herbs = load("herbs/herbs.json")["items"]
    formulas = load("formulas/formulas.json")["items"]
    symptoms = load("diagnosis/symptoms.json")["items"]
    patterns = load("diagnosis/patterns.json")["items"]
    elements = load("diagnosis/pattern-elements.json")["items"]
    constitutions = load("diagnosis/constitutions.json")["items"]
    red_flags = load("diagnosis/red-flags.json")["items"]
    rules = load("safety/rules.json")
    glossary = load("glossary.json")["items"]
    emergency = load("safety/emergency.json")
    for label, items in (("citation", cit["items"]), ("herb", herbs), ("formula", formulas), ("symptom", symptoms), ("pattern", patterns), ("element", elements),
                         ("constitution", constitutions), ("red flag", red_flags), ("safety rule", rules["rules"])):
        for d in duplicates(i["id"] for i in items):
            err(f"duplicate {label} id {d}")
    for d in duplicates((g["zh-Hant"], g["domain"]) for g in glossary):
        err(f"duplicate glossary term {d}")
    # glossary quality (K-12, i18n guide §2.1 and §4.4): pinyin with tone marks, alternatives that differ from the main English, and agreement with the names the data files use
    tones = set("āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ")
    named = {}
    for label, items, getter in (("pattern", patterns, lambda i: i["name"]), ("formula", formulas, lambda i: i["name"]), ("constitution", constitutions, lambda i: i["name"]),
                                 ("symptom", symptoms, lambda i: {"zh-Hant": i["zh-Hant"], "en": i["en"]})):
        for i in items:
            n = getter(i)
            if n.get("en"):
                named.setdefault(n["zh-Hant"], []).append((label, n["en"]))
    for g in glossary:
        where = f"glossary {g['zh-Hant']} ({g['domain']})"
        if not g["en"].strip() or not g["pinyin"].strip():
            err(f"{where}: en and pinyin are required")
        elif not (set(g["pinyin"]) & tones) and g["pinyin"] not in ("tāi gān",):
            if any(ch for ch in g["pinyin"] if ch.isalpha()) and not any(ch in tones for ch in g["pinyin"]):
                err(f"{where}: pinyin {g['pinyin']!r} has no tone marks")
        main = re.sub(r"\s*\(.*?\)", "", g["en"]).strip().lower()
        if g["en"].lower() in [a.lower() for a in g["alt"]] or main in [a.lower() for a in g["alt"]]:
            err(f"{where}: alt repeats the main English")
        for label, en in named.get(g["zh-Hant"], []):
            ok = {main, g["en"].lower(), *(a.lower() for a in g["alt"])}
            if en.lower() not in ok and re.sub(r"\s*\(.*?\)", "", en).strip().lower() not in ok:
                err(f"{where}: the glossary says {g['en']!r} but the {label} named {g['zh-Hant']} is {en!r} in the data (use one English, or list the other in alt)")
    # constitution questionnaire (K-08): every constitution has its items, ids are unique, the scale is 1–5
    ci = load("diagnosis/constitution-items.json")
    ci_ids = [i["id"] for t in ci["types"] for i in t["items"]]
    for d in duplicates(ci_ids):
        err(f"duplicate constitution item id {d}")
    if sorted(t["constitution"] for t in ci["types"]) != sorted(c["id"] for c in constitutions):
        err("constitution-items.json must have exactly one entry per constitution of constitutions.json")
    if [s["value"] for s in ci["scale"]] != [1, 2, 3, 4, 5]:
        err("constitution scale must be 1..5")
    if ci["_meta"]["count"] != len(ci_ids):
        err("constitution-items.json _meta.count differs from the number of items")
    for t in ci["types"]:
        if sum(1 for i in t["items"] if not i["reverse"]) < 2:
            err(f"constitution {t['constitution']} needs at least two non-reversed items")
    # cities of the birth-place picker (K-10): a wrong time zone or longitude puts the hour pillar in the wrong place
    cities = load("geo/cities.json")
    if cities["_meta"]["count"] != len(cities["items"]) or len(cities["items"]) < 150:
        err(f"geo/cities.json: count {cities['_meta']['count']} / {len(cities['items'])} items (at least 150 expected)")
    if cities["_meta"]["source"]["licence"] != "CC BY 4.0" or "geonames.org" not in cities["_meta"]["source"]["attribution"]:
        err("geo/cities.json: the GeoNames attribution and licence are required (CC BY 4.0)")
    for d in duplicates(c["id"] for c in cities["items"]):
        err(f"duplicate city id {d}")
    for d in duplicates((c["en"], c["cc"], c["lat"], c["lon"]) for c in cities["items"]):
        err(f"duplicate city {d}")
    for c in cities["items"]:
        if not (-90 <= c["lat"] <= 90 and -180 <= c["lon"] <= 180):
            err(f"city {c['en']}: coordinates {c['lat']}, {c['lon']} out of range")
        try:
            ZoneInfo(c["tz"])
        except (ZoneInfoNotFoundError, ValueError):
            err(f"city {c['en']}: {c['tz']!r} is not an IANA time zone")
    present = Counter(c["cc"] for c in cities["items"])
    for cc in ("TW", "HK", "MO", "SG", "CN", "JP"):
        if present[cc] == 0:
            err(f"geo/cities.json: no city of {cc}")
    # emergency numbers: a wrong or missing one is a safety incident (safety policy §9)
    region_ids = [r["id"] for r in emergency["regions"]]
    for d in duplicates(region_ids):
        err(f"duplicate emergency region {d}")
    if "OTHER" not in region_ids:
        err("emergency regions must include OTHER (the fallback 'call your local emergency number')")
    for r in emergency["regions"]:
        if r["id"] != "OTHER" and not r["emergency"]:
            err(f"emergency region {r['id']} has no emergency number")
        if r["id"] == "OTHER" and (r["emergency"] or r["crisis"] or r["timezones"] or r.get("verification")):
            err("emergency region OTHER must not list numbers, zones or a verification: it is the generic \"call your local emergency number\"")
    # the time zones that preselect a region: real IANA zones, each in one region only (a device must not match two)
    zone_owner: dict[str, str] = {}
    for r in emergency["regions"]:
        for z in r["timezones"]:
            try:
                ZoneInfo(z)
            except (ZoneInfoNotFoundError, ValueError):
                err(f"emergency region {r['id']}: {z!r} is not an IANA time zone")
            if z in zone_owner and zone_owner[z] != r["id"]:
                err(f"emergency: time zone {z} selects both {zone_owner[z]} and {r['id']}")
            zone_owner.setdefault(z, r["id"])
        if r["id"] != "OTHER" and not r["timezones"]:
            err(f"emergency region {r['id']} has no time zone, so it can never be preselected")
        v = r.get("verification")
        if v is not None:
            # a verification is a dated record of a person checking an official source. How OLD it may be is decided where it matters — the build warns at 18 months and check-release refuses a public
            # build at 24 (docs/post-mvp/design/tap-tempo-and-regions.md §2.4) — so that the knowledge base itself keeps building while a renewal is awaited
            # `status` is the content-review status (set from review/records by the build); a verification is a different, narrower fact and does not change it
            if not v["by"].strip() or not v["source"].strip():
                err(f"emergency region {r['id']}: the verification names no verifier or no source")
            try:
                when = date.fromisoformat(v["at"])
            except ValueError:
                err(f"emergency region {r['id']}: verification date {v['at']!r} is not a date")
            else:
                if when > date.today():
                    err(f"emergency region {r['id']}: the verification is dated in the future")

    # the name fold (PM-33): the allergy rule folds both sides with it, so a name whose character is missing from it is a name an allergy typed in the other script cannot match
    fold = load("safety/name-fold.json")
    pairs = [p.split(":") for p in fold["fold"]]
    src = [chr(int(a, 16)) for a, _ in pairs]
    if fold["_meta"]["count"] != len(src):
        err(f"name fold: _meta.count {fold['_meta']['count']} is not {len(src)}")
    for d in duplicates(src):
        err(f"name fold: {d!r} is folded twice")
    for a, b in pairs:
        if a == b:
            err(f"name fold: U+{a} folds to itself")
    if fold["fold"] != build_name_fold.encode(build_name_fold.fold_table(build_name_fold.names(load))):
        err("name fold: not what the names of the herbs, formulas and foods need (run scripts.kb.build_name_fold)")

    for d in duplicates(h["name"]["zh-Hant"] for h in herbs):
        err(f"duplicate herb name {d}")

    # the addresses of the Learn pages (PM-13): every diet entry and every glossary term has a stable ASCII id, unique within its kind
    foods = load("treatment/guidance.json")["foods"]
    for d in duplicates(f["id"] for f in foods.values()):
        err(f"duplicate diet entry id {d}")
    for name, f in foods.items():
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", f["id"]):
            err(f"diet entry {name}: id {f['id']!r} is not a stable ASCII id")
    for d in duplicates(t["id"] for t in glossary):
        err(f"duplicate glossary id {d}")
    for t in glossary:
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", t["id"]):
            err(f"glossary term {t['zh-Hant']} ({t['domain']}): id {t['id']!r} is not a stable ASCII id")
    herb_ids = {h["id"] for h in herbs}
    formula_ids = {f["id"] for f in formulas}
    sym_ids = {s["id"] for s in symptoms}
    pattern_ids = {p["id"] for p in patterns}
    element_ids = {e["id"] for e in elements}
    constitution_ids = {c["id"] for c in constitutions}

    # ── 4. herbs ───────────────────────────────────────────────────────────
    index = load("herbs/herb-index.json")["index"]
    for name, hid in index.items():
        if hid not in herb_ids:
            err(f"herb-index {name} → missing {hid}")
    for h in herbs:
        if index.get(h["name"]["zh-Hant"]) != h["id"]:
            err(f"herb {h['id']}: its name {h['name']['zh-Hant']} is not in the herb index")
        for a in h.get("aliases", []):
            if index.get(a) != h["id"]:
                err(f"herb {h['id']}: alias {a} is not in the herb index")
        for k in list(h["effects"]) + list(h["harms"]):
            if not valid_target(k):
                err(f"herb {h['id']}: invalid panel target {k}")
        for o in h["organs"]:
            if o not in ORGANS and o not in ("心包", "三焦"):
                err(f"herb {h['id']}: unknown organ {o!r}")
    herbs_by_id = {h["id"]: h for h in herbs}
    interaction_vocab = {i for h in herbs for i in h["interactions"]}

    # ── 5. formulas ────────────────────────────────────────────────────────
    strong = set(params["tier"]["strong_herbs"])
    for sh in strong:
        if sh not in herb_ids:
            err(f"scoring-params: strong herb {sh} does not exist")
    for f in formulas:
        if abs(sum(c["proportion"] for c in f["composition"]) - 1) > 1e-3:
            err(f"{f['id']}: proportions do not sum to 1")
        if abs(sum(c["effective_weight"] for c in f["composition"]) - 1) > 1e-3:
            err(f"{f['id']}: effective weights do not sum to 1")
        for d in duplicates(c["herb"] for c in f["composition"]):
            err(f"{f['id']}: herb {d} appears twice")
        for c in f["composition"]:
            if c["herb"] not in herb_ids:
                err(f"{f['id']}: missing herb {c['herb']}")
            if abs(c["role_weight"] - roles[c["role"]]) > 1e-9:
                err(f"{f['id']}: role weight of {c['herb']} differs from scoring-params")
        if not any(c["role"] == "君" for c in f["composition"]):
            err(f"{f['id']}: no sovereign herb")
        for s in f["core_indications"]:
            if s not in sym_ids:
                err(f"{f['id']}: unknown core indication {s}")
        for pid in f["patterns"]:
            if pid not in pattern_ids:
                err(f"{f['id']}: unknown pattern {pid}")
            elif f["id"] not in next(p for p in patterns if p["id"] == pid)["formulas"]:
                err(f"{f['id']} lists pattern {pid} which does not list it back")
        for k in list(f["panel_effect"]) + list(f["panel_burden"]):
            if not valid_target(k):
                err(f"{f['id']}: invalid panel target {k}")
        for m in f["modifications"]:
            for s in m["when_symptoms"]:
                if s not in sym_ids:
                    err(f"{f['id']}/{m['id']}: unknown symptom {s}")
            for a in m["add"] + m["remove"]:
                if a["herb"] not in herb_ids:
                    err(f"{f['id']}/{m['id']}: missing herb {a['herb']}")
        for rc in f["rationale_citations"]:
            if rc not in cit_ids:
                err(f"{f['id']}: unknown citation {rc}")
        # tier recomputation from the herbs (independent of build_formulas): the engine does the same (tech spec §7.3 rule 5)
        comp = [(c["effective_weight"], herbs_by_id.get(c["herb"])) for c in f["composition"]]
        if all(h is not None for _, h in comp):
            bitter = sum(w for w, h in comp if params["tier"]["bitter_cold_tag"] in h["tags"])
            activating = sum(w for w, h in comp if params["tier"]["activating_tag"] in h["tags"])
            flagged = any(params["tier"]["aristolochic_flag"] in h["interactions"] for _, h in comp)
            if any(c["herb"] in strong for c in f["composition"]) or bitter >= params["tier"]["c_bitter_cold_share"] or f["mvp"] is False:
                expected = "C"
            elif activating >= params["tier"]["b_activating_share"] or flagged:
                expected = "B"
            else:
                expected = "A"
            if f["tier"] != expected:
                err(f"{f['id']}: stored tier {f['tier']} but the herbs give {expected}")
            worst = max((h["pregnancy"] for _, h in comp), key=lambda p: PREG_ORDER[p])
            if f["pregnancy"] != worst:
                err(f"{f['id']}: stored pregnancy {f['pregnancy']} but the herbs give {worst}")
            # the interaction list is the same kind of stored flag (PM-15, R7 of the knowledge browser): a Learn page shows it as it is stored, so it may never lag behind the herbs
            interactions = sorted({i for _, h in comp for i in h["interactions"]})
            if sorted(f["interactions"]) != interactions:
                err(f"{f['id']}: stored interactions {sorted(f['interactions'])} but the herbs give {interactions}")

    # ── 6. patterns and elements ───────────────────────────────────────────
    acu = load("treatment/guidance.json")["acupoints"]
    for p in patterns:
        for fid in p["formulas"]:
            if fid not in formula_ids:
                err(f"pattern {p['id']}: unknown formula {fid}")
            elif p["id"] not in next(f for f in formulas if f["id"] == fid)["patterns"]:
                err(f"pattern {p['id']} lists formula {fid} which does not list it back")
        for c in p["citations"]:
            if c not in cit_ids:
                err(f"pattern {p['id']}: unknown citation {c}")
        for k in p["panel_projection_per_degree"]:
            if not valid_target(k):
                err(f"pattern {p['id']}: invalid projection target {k}")
        for s in list(p["weights"]) + list(p["against"]) + p["required_any"]:
            if s not in sym_ids:
                err(f"pattern {p['id']}: unknown symptom {s}")
        for s in p["required_any"]:
            if s not in p["weights"]:
                err(f"pattern {p['id']}: required_any symptom {s} has no weight")
        if set(p["weights"]) & set(p["against"]):
            err(f"pattern {p['id']}: a symptom is both evidence for and against")
        if p["max_score"] != sum(p["weights"].values()):
            err(f"pattern {p['id']}: max_score {p['max_score']} ≠ Σ weights {sum(p['weights'].values())}")
        for e in p["elements"]:
            if e not in element_ids:
                err(f"pattern {p['id']}: unknown element {e}")
            elif p["id"] not in next(x for x in elements if x["id"] == e)["patterns"]:
                err(f"pattern {p['id']} lists element {e} which does not list it back")
        for a in p["treatment"]["acupoints"]:
            if a not in acu:
                err(f"pattern {p['id']}: unknown acupoint {a}")
    for e in elements:
        for pid in e["patterns"]:
            if pid not in pattern_ids:
                err(f"element {e['id']}: unknown pattern {pid}")
        for s in list(e["weights"]) + list(e["against"]):
            if s not in sym_ids:
                err(f"element {e['id']}: unknown symptom {s}")
        for k in e["projection_per_degree"]:
            if not valid_target(k):
                err(f"element {e['id']}: invalid projection target {k}")
    for c in constitutions:
        for s in c["features"]:
            if s not in sym_ids:
                err(f"constitution {c['id']}: unknown symptom {s}")

    # ── 7. examination data ────────────────────────────────────────────────
    tongue = load("diagnosis/tongue.json")
    zone_ids = {z["id"] for z in tongue["zones"]}
    sym_by_id = {s["id"]: s for s in symptoms}
    tongue_syms = {s["id"] for s in symptoms if s["kind"] == "tongue"}
    if {f["id"] for f in tongue["features"]} != tongue_syms:
        err("tongue.json features and the tongue symptoms of symptoms.json differ")
    for f in tongue["features"]:
        if f["zone"] != "all" and f["zone"] not in zone_ids:
            err(f"tongue feature {f['id']}: unknown zone {f['zone']}")
        s = sym_by_id.get(f["id"])
        if s and s.get("tongue", {}).get("zone") != f["zone"]:
            err(f"tongue feature {f['id']}: zone differs between tongue.json and symptoms.json")
    pulse_syms = {s["id"] for s in symptoms if s["kind"] == "pulse"}
    if {p["id"] for p in pulse["pulses"]} != pulse_syms:
        err("pulse.json pulses and the pulse symptoms of symptoms.json differ")
    for group in pulse["_meta"]["exclusive_groups"]:
        for pid in group:
            if pid not in pulse_syms:
                err(f"pulse exclusive group: unknown pulse {pid}")
    if tongue["_meta"]["zone_citation"] not in cit_ids:
        err("tongue.json: unknown zone citation")
    panel = load("diagnosis/panel-schema.json")
    for nature, targets in panel["nature_projection"].items():
        for t in targets:
            if not valid_template_target(t):
                err(f"panel-schema nature {nature}: invalid target {t}")
    for loc, organs in panel["location_organs"].items():
        for o in organs:
            if o not in ORGANS:
                err(f"panel-schema location {loc}: unknown organ {o}")

    # ── 7b. question bank ──────────────────────────────────────────────────
    bank = load("diagnosis/questions.json")
    q_items, q_modules = bank["items"], {m["id"] for m in bank["modules"]}
    if duplicates(m["id"] for m in bank["modules"]) or len(q_modules) != 8:
        err("questions: the eight complaint modules must be unique")
    for d in duplicates(q["id"] for q in q_items):
        err(f"duplicate question id {d}")
    inquiry_syms = {s["id"] for s in symptoms if s["kind"] == "symptom"}
    covered: set[str] = set()
    for q in q_items:
        opt_syms = [s for o in q["options"] for s in o["symptoms"]]
        for d in duplicates(opt_syms):
            err(f"question {q['id']}: symptom {d} appears in two options")
        for d in duplicates(o["id"] for o in q["options"]):
            err(f"question {q['id']}: duplicate option id {d}")
        for s in opt_syms + q["graded"] + [x for g in q["exclusive_groups"] for x in g] + q.get("follows", []):
            if s not in sym_ids:
                err(f"question {q['id']}: unknown symptom {s}")
            elif sym_by_id[s]["kind"] != "symptom":
                err(f"question {q['id']}: {s} is a tongue or pulse feature; the inquiry covers symptoms only")
        covered |= set(opt_syms)
        if not set(q["graded"]) <= set(opt_syms):
            err(f"question {q['id']}: graded symptoms must be options of the question")
        for g in q["exclusive_groups"]:
            if not set(g) <= set(opt_syms):
                err(f"question {q['id']}: exclusive group {g} is not made of its own options")
        nones = [o for o in q["options"] if o["none"]]
        if q["select"] == "many" and len(nones) != 1:
            err(f"question {q['id']}: a multi-select question needs exactly one 'none of these' option")
        if any(o["none"] and (o["symptoms"] or o.get("context")) for o in q["options"]):
            err(f"question {q['id']}: the 'none' option must not map to symptoms or context")
        if any(o.get("context") for o in q["options"]) != (q["dimension"] == "course"):
            err(f"question {q['id']}: context options belong to (and only to) the course dimension")
        if q["dimension"] != "course":
            for o in q["options"]:
                if not o["none"] and not o["symptoms"]:
                    err(f"question {q['id']}: option {o['id']} maps to nothing")
                for s in o["symptoms"]:
                    if s in sym_by_id and sym_by_id[s]["dimension"] != q["dimension"] and q["id"] not in ("Q_MENSES", "Q_PAIN_QUALITY", "Q_MIND"):
                        err(f"question {q['id']}: symptom {s} belongs to dimension {sym_by_id[s]['dimension']}")
        if q["source"] == "guided" and q["dimension"] != "face-skin":
            err(f"question {q['id']}: only face-skin questions are guided observations")
        for m in q["modules"]:
            if m not in q_modules:
                err(f"question {q['id']}: unknown module {m}")
    for s in sorted(inquiry_syms - covered):
        err(f"symptom {s} is not reachable from any question")
    if bank["_meta"]["coverage"]["uncovered"] != sorted(inquiry_syms - covered) or bank["_meta"]["count"] != len(q_items):
        err("questions: _meta (count/coverage) is stale")
    core = [q for q in q_items if q["core"]]
    if not 20 <= len(core) <= 30:
        err(f"questions: {len(core)} core questions; the SOP calls for about 25 (20–30)")
    for dim in ("cold-heat", "sweat", "head-body", "stool-urine", "diet-taste", "chest-abdomen", "ear-eye-throat", "thirst", "sleep", "emotion", "menses", "course"):
        if not any(q["dimension"] == dim for q in core):
            err(f"questions: no core question for the SOP dimension {dim}")
    for m in sorted(q_modules):
        if sum(1 for q in q_items if m in q["modules"]) < 4:
            err(f"questions: module {m} has fewer than four questions")
    for q in q_items:
        if not q["core"] and "follows" not in q and "requires" not in q:
            err(f"question {q['id']}: a non-core question needs `follows` or `requires`")

    # ── 7c. exclusions ─────────────────────────────────────────────────────
    excl = load("diagnosis/exclusions.json")
    for d in duplicates(g["id"] for g in excl["groups"] + excl["splits"]):
        err(f"duplicate exclusion id {d}")
    group_sets = [set(g["symptoms"]) for g in excl["groups"]]
    for g in excl["groups"]:
        for s in g["symptoms"]:
            if s not in sym_ids:
                err(f"exclusion {g['id']}: unknown symptom {s}")
        kinds = {sym_by_id[s]["kind"] for s in g["symptoms"] if s in sym_by_id}
        if len(kinds) > 1:
            err(f"exclusion {g['id']}: mixes symptom kinds {sorted(kinds)}")
    for sp in excl["splits"]:
        for s in sp["symptoms"]:
            if s not in sym_ids:
                err(f"split {sp['id']}: unknown symptom {s}")
    pulse_groups = sorted(sorted(g["symptoms"]) for g in excl["groups"] if g["symptoms"][0].startswith("P_"))
    if pulse_groups != sorted(sorted(x) for x in pulse["_meta"]["exclusive_groups"]):
        err("exclusions.json pulse groups differ from pulse.json exclusive_groups")
    for q in q_items:
        for qg in q["exclusive_groups"]:
            if not any(set(qg) <= gs for gs in group_sets):
                err(f"question {q['id']}: exclusive group {qg} is not covered by diagnosis/exclusions.json")

    # ── 7d. orientation ────────────────────────────────────────────────────
    ori = load("diagnosis/orientation.json")
    lists = {"external_triggers": ori["external_triggers"], "cold_signs": ori["cold_signs"], "heat_signs": ori["heat_signs"], "deficiency_signs": ori["deficiency_signs"],
             "excess_signs": ori["excess_signs"], "exterior.supporting": ori["exterior"]["supporting"], "exterior.half": [s for g in ori["exterior"]["half"] for s in g]}
    for name, ids in lists.items():
        for s in ids:
            if s not in sym_ids:
                err(f"orientation {name}: unknown symptom {s}")
    if ori["exterior"]["required"] not in sym_ids:
        err("orientation: unknown required exterior symptom")
    if set(ori["cold_signs"]) & set(ori["heat_signs"]):
        err("orientation: a sign cannot be both a cold and a heat sign")
    if set(ori["deficiency_signs"]) & set(ori["excess_signs"]):
        err("orientation: a sign cannot be both a deficiency and an excess sign")

    # ── 8. policy and safety ───────────────────────────────────────────────
    dims, levels = scope["dimensions"], scope["levels"]
    for pname, prof in scope["profiles"].items():
        for dim, keys in dims.items():
            for k in keys:
                e = prof[dim].get(k)
                if e is None:
                    err(f"profile {pname}: missing {dim}.{k}")
                elif e["level"] not in levels or e["notice"] not in scope["notice_kinds"]:
                    err(f"profile {pname}: bad entry {dim}.{k}: {e}")
    dev, rel = scope["profiles"]["dev"], scope["profiles"]["release"]
    for dim, keys in dims.items():
        for k in keys:
            if dev[dim][k]["level"] != "L3":
                err(f"dev profile must open everything: {dim}.{k} is {dev[dim][k]['level']}")
            if rel[dim][k]["notice"] == "blocking_ack" and dev[dim][k]["notice"] != "blocking_ack":
                err(f"dev profile must keep the blocking notice for {dim}.{k}")
    if scope["resolution"]["flow"] != "continue":
        err("flow must be 'continue'")
    if rel["safety_enforcement"] != "suppress_hard" or dev["safety_enforcement"] != "annotate_only":
        err("release must use suppress_hard and dev annotate_only")
    for flag, value in dev["features"].items():
        if value is not True:
            err(f"dev profile must enable feature {flag}")

    for r in rules["rules"]:
        if "citation" in r and r["citation"] not in cit_ids:
            err(f"rule {r['id']}: unknown citation {r['citation']}")
        a, t = r["applies_to"], r["target"]
        for dim, field in (("population", "population"), ("condition", "condition"), ("state", "state")):
            for k in a.get(field, []):
                if k not in dims[dim]:
                    err(f"rule {r['id']}: unknown {dim} {k}")
        for c in a.get("constitution", []):
            if c not in constitution_ids:
                err(f"rule {r['id']}: unknown constitution {c}")
        if "formula_tier" in t and not set(t["formula_tier"]) <= {"A", "B", "C"}:
            err(f"rule {r['id']}: bad formula tier {t['formula_tier']}")
        if "herb_pregnancy" in t and t["herb_pregnancy"] not in ("avoid", "caution"):
            err(f"rule {r['id']}: bad herb_pregnancy {t['herb_pregnancy']}")
        if "herb_interaction" in t and t["herb_interaction"] not in interaction_vocab:
            err(f"rule {r['id']}: herb_interaction {t['herb_interaction']} matches no herb")
        if "acupoints" in t:
            for pt in t["acupoints"]:
                if pt not in acu:
                    err(f"rule {r['id']}: unknown acupoint {pt}")
        if "conflict" in t and t["conflict"] not in ("heat_pattern_with_warming_formula", "cold_pattern_with_cooling_formula", "excess_pattern_with_tonic_formula",
                                                       "deficiency_pattern_with_attacking_formula"):
            err(f"rule {r['id']}: unknown conflict kind {t['conflict']}")
        if "food_pregnancy_caution" in t and not load("treatment/guidance.json")["food_pregnancy_caution"]:
            err(f"rule {r['id']}: the food pregnancy caution list is empty")
        if "flavor_share_over" in t and t["flavor_share_over"] != params["safety"]["flavor_excess_share"]:
            err(f"rule {r['id']}: flavor_share_over differs from scoring-params")
    for pt in rules["pregnancy_acupoints"]:
        if pt not in acu:
            err(f"pregnancy acupoint {pt} is not in the acupoint registry")
        elif not acu[pt]["pregnancy_avoid"]:
            err(f"acupoint {pt} is listed as a pregnancy acupoint but not flagged pregnancy_avoid")
    for name, pt in acu.items():
        if pt["pregnancy_avoid"] and name not in rules["pregnancy_acupoints"]:
            err(f"acupoint {name} is flagged pregnancy_avoid but missing from safety/rules.json pregnancy_acupoints")
    for c in load("treatment/guidance.json")["general"]["source"]:
        if c not in cit_ids:
            err(f"treatment guidance: unknown citation {c}")
    # English prose (K-13): every Chinese-only prose field has its English, a status, and renders the glossary terms of the Chinese in the English (K-12 rule, glossary_lint.py)
    from .glossary_lint import missing_terms
    gl = load("glossary.json")["items"]
    pairs: list[tuple[str, str, str]] = []
    for p in patterns:
        if p["en_status"] not in ("machine-draft", "reviewed"):
            err(f"pattern {p['id']}: en_status {p['en_status']!r}")
        pairs += [(f"pattern {p['id']} principle", p["principle"], p["principle_en"]), (f"pattern {p['id']} tongue_pulse_note", p["tongue_pulse_note"], p["tongue_pulse_note_en"])]
    for f in formulas:
        if len(f["cautions"]) != len(f["cautions_en"]):
            err(f"formula {f['id']}: {len(f['cautions'])} cautions in Chinese but {len(f['cautions_en'])} in English")
        pairs += [(f"formula {f['id']} principle", f["principle"], f["principle_en"]), (f"formula {f['id']} rationale", f["rationale_zh"], f["rationale_en"])]
        pairs += [(f"formula {f['id']} caution {i + 1}", z, e) for i, (z, e) in enumerate(zip(f["cautions"], f["cautions_en"]))]
    gen = load("treatment/guidance.json")["general"]
    pairs.append(("treatment general text", gen["text"], gen["text_en"]))
    for label, zh_text, en_text in pairs:
        if not en_text.strip():
            err(f"{label}: the English is empty")
        for t in missing_terms(zh_text, en_text, gl):
            err(f"{label}: the Chinese uses the glossary term {t['zh-Hant']} ({t['en']}) but the English does not")

    # the diet entries and per-pattern lifestyle of the guidance file (K-11): everything a pattern refers to has bilingual text and a pregnancy flag
    guide = load("treatment/guidance.json")
    herb_by_id = {h["id"]: h for h in load("herbs/herbs.json")["items"]}
    for p in patterns:
        for f in p["treatment"]["foods"]:
            if f not in guide["foods"]:
                err(f"pattern {p['id']}: the food {f} has no diet entry in treatment/guidance.json")
        lf = guide["lifestyle"].get(p["id"])
        if lf is None:
            err(f"pattern {p['id']}: no bilingual lifestyle entry")
        elif lf["zh-Hant"] != p["treatment"]["lifestyle"]:
            err(f"pattern {p['id']}: the lifestyle text of treatment/guidance.json differs from the pattern's")
    for name, food in guide["foods"].items():
        if food["pregnancy_caution"] != (name in guide["food_pregnancy_caution"]):
            err(f"food {name}: pregnancy_caution does not match food_pregnancy_caution")
        for c in food["citations"]:
            if c not in cit_ids:
                err(f"food {name}: unknown citation {c}")
        if food["herb"] is not None:
            herb = herb_by_id.get(food["herb"])
            if herb is None:
                err(f"food {name}: unknown herb {food['herb']}")
            else:
                if food["basis"] != "pharmacopoeia" or food["functions"] != herb["functions"]:
                    err(f"food {name}: a herb-backed entry must take its functions from the herb record")
                if herb["pregnancy"] in ("caution", "avoid") and not food["pregnancy_caution"]:
                    err(f"food {name}: its herb {food['herb']} is flagged {herb['pregnancy']} in pregnancy but the food is not")
        elif food["basis"] != "textbook":
            err(f"food {name}: an entry without a herb record must say basis textbook")
    for name in guide["food_pregnancy_caution"]:
        if name not in guide["foods"]:
            err(f"food_pregnancy_caution lists {name}, which has no diet entry")
    susc = load("wuxing/susceptibility.json")
    for c in susc["citations"]:
        if c not in cit_ids:
            err(f"susceptibility: unknown citation {c}")
    for c in susc["risk"]:
        if c not in constitution_ids:
            err(f"susceptibility: unknown constitution {c}")
    yunqi = load("wuxing/yunqi.json")
    if len(yunqi["min_bing_excerpts"]) != 10:
        err("yunqi: expected 10 民病 excerpts")
    for k, v in yunqi["min_bing_excerpts"].items():
        if v["citation"] not in cit_ids:
            err(f"yunqi {k}: unknown citation")

    # ── 9. provenance ──────────────────────────────────────────────────────
    if check_sources:
        pins = submodule_commits()
        lib = pins.get("TCM-Library")
        if lib:
            for f in formulas:
                if f["kb_commit"] != lib:
                    err(f"{f['id']}: kb_commit {f['kb_commit'][:8]} ≠ pinned TCM-Library {lib[:8]}")
            for h in herbs:
                if h["source"]["repo"] == "TCM-Library" and h["source"]["commit"] != lib:
                    err(f"herb {h['id']}: source commit ≠ pinned TCM-Library")
        for c in cit["items"]:
            if not (ROOT / c["source_path"]).exists():
                err(f"citation {c['id']}: source file {c['source_path']} not found (submodules checked out?)")
    # ── 10. admission (PM-21): every pattern meets each machine row of the checklist in library-expansion.md §4, or is waived by name as a known gap of the original library ──
    errors += admission.failures(admission.check(admission.library(load, check_sources=check_sources)))
    return errors


def main() -> int:
    errors = validate()
    herbs = load("herbs/herbs.json")["items"]
    herb_status = Counter(h["status"] for h in herbs)
    print(f"validate: {len(herbs)} herbs {dict(herb_status)}, {len(load('formulas/formulas.json')['items'])} formulas, "
          f"{len(load('diagnosis/patterns.json')['items'])} patterns, {len(load('diagnosis/symptoms.json')['items'])} symptoms, "
          f"{len(load('citations.json')['items'])} citations, {len(load('safety/rules.json')['rules'])} safety rules")
    if errors:
        print(f"VALIDATION FAILED ({len(errors)}):")
        for e in errors:
            print(" -", e)
        return 1
    print("validate: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
