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
from fractions import Fraction
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft202012Validator

from . import admission, build_name_fold, herb_props
from .common import DATA, ROOT, submodule_commits
from .curated import panel as panel_cfg
from .schemas import SCHEMAS, SCHEMA_VERSION

ORGANS = set(panel_cfg.ZANG) | set(panel_cfg.FU)
CHANNELS = {"qi", "blood", "yin", "yang", "stasis"}
LIUXIE = set(panel_cfg.LIUXIE)
PRODUCTS = set(panel_cfg.PRODUCTS)
YINGWEI = set(panel_cfg.YINGWEI)
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
    if kind == "yingwei":
        return rest in YINGWEI
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
        # AI help (Release F): a module needs the help on and a gateway; the observation of tongue and face by photo (PM-50) exists in the development profile only, until the tongue-photo
        # spike's gates are met (PD-25); a release has none of it
        ai = prof["ai"]
        if any(ai["modules"].values()) and not (ai["enabled"] and ai["endpoint"]):
            err(f"profile {pname}: an AI module is on without AI help enabled and a gateway endpoint")
        if pname != "dev" and (ai["modules"]["tongue"] or ai["modules"]["face"]):
            err(f"profile {pname}: the observation of tongue and face by photo is for the development profile only (decision PD-25)")
    # who reads with the study reference (PD-30): a mode other than "off" needs the roles' overlays to switch the study features on (they do, by the checks below); the development profile reaches L3 for everyone
    if scope["profiles"]["dev"]["dose_display"] != "all":
        err("profile dev: dose_display must be all (the development profile opens everything)")
    if scope["profiles"]["release"]["ai"] != {"enabled": False, "endpoint": None, "modules": {"conversation": False, "tongue": False, "face": False}}:
        err("profile release: AI help must be off, with no gateway, until its gates (docs/post-mvp/design/ai-assisted-intake.md §6)")
    # the roles (PM-53): an overlay over the release profile that may only raise an adult's level and switch study features on (the schema admits nothing else)
    rank = {"L0": 0, "L1": 1, "L2": 2, "L3": 3}
    release = scope["profiles"]["release"]
    for rname, overlay in scope["roles"].items():
        for key, cell in overlay["population"].items():
            if rank[cell["level"]] < rank[release["population"][key]["level"]]:
                err(f"role {rname}: population.{key} would lower the release level (an overlay only raises an adult's level)")
        for key, on in overlay["features"].items():
            if not on:
                err(f"role {rname}: features.{key} is false (an overlay only switches study features on)")

    # the words that re-open the screening during AI help's conversation: one entry per red flag (the minor's comes from the age), words in both languages for every A and B item
    terms = load("safety/red-flag-terms.json")["items"]
    flags = {f["id"]: f["level"] for f in load("diagnosis/red-flags.json")["items"]}
    for t in terms:
        if t["id"] not in flags:
            err(f"red-flag-terms: {t['id']} is not a red flag")
        elif flags[t["id"]] in ("A", "B") and (not t["zh-Hant"] or not t["en"]):
            err(f"red-flag-terms: {t['id']} needs words in Traditional Chinese and in English")
    missing = sorted(set(flags) - {t["id"] for t in terms} - {"RF_C_MINOR"})
    if missing:
        err(f"red-flag-terms: no words for {', '.join(missing)}")

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
        # the property model v2 (PM-36)
        pr = h["props"]
        if not (-1 <= pr["yinyang"] <= 1 and -1 <= pr["direction"] <= 1):
            err(f"herb {h['id']}: yinyang or direction outside −1 … 1")
        if pr["five_phase"] is not None and (min(pr["five_phase"]) < 0 or abs(sum(pr["five_phase"]) - 1) > 1e-6):
            err(f"herb {h['id']}: five_phase shares must be ≥ 0 and sum to 1")
        if (pr["five_phase"] is None) != (not h["flavors"] and not h["organs"]):
            err(f"herb {h['id']}: five_phase is null exactly when the herb has no flavour and no channel")
        if set(pr["tropism"]) != set(h["organs"]) or (pr["tropism"] and abs(sum(pr["tropism"].values()) - 1) > 1e-6):
            err(f"herb {h['id']}: tropism must weigh exactly the herb's channels and sum to 1")
        if h["toxic"] != (pr["toxicity"] != "無毒"):
            err(f"herb {h['id']}: toxic is {h['toxic']} but the toxicity grade is {pr['toxicity']}")
        for key, ids in h["props_rules"].items():
            if key not in pr:
                err(f"herb {h['id']}: props_rules names an unknown property {key}")
            for rid in ids:
                if rid not in herb_props.RULES:
                    err(f"herb {h['id']}: unknown property rule {rid}")
    for rid, rule in load("herbs/herbs.json")["_meta"]["conventions"]["props"]["rules"].items():
        if rule["citation"] is not None and rule["citation"] not in cit_ids:
            err(f"herb property rule {rid}: unknown citation {rule['citation']}")
    herbs_by_id = {h["id"]: h for h in herbs}

    # ── 4b. the prescription model's tables (PM-37) ─────────────────────────
    pairs = load("herbs/pairings.json")
    for c in pairs["_meta"]["citations"]:
        if c not in cit_ids:
            err(f"pairings: unknown citation {c}")
    seen_pairs: set[tuple[str, str, str]] = set()
    pairing_text = None
    for pr in pairs["items"]:
        if pr["herb"] not in herb_ids or pr["other"] not in herb_ids or pr["herb"] == pr["other"]:
            err(f"pairing {pr['id']}: its herbs must be two different herbs of the knowledge base")
        if (pr["herb"], pr["other"], pr["type"]) in seen_pairs:
            err(f"pairing {pr['id']}: listed twice")
        seen_pairs.add((pr["herb"], pr["other"], pr["type"]))
        if check_sources and "entry_zh_hans" in pr["source"]:
            if pairing_text is None:
                from .common import norm_ws, read_book
                from .curated.prescription import PAIRING_BOOK
                pairing_text = norm_ws(read_book(PAIRING_BOOK))
            if pr["source"]["entry_zh_hans"] not in pairing_text:
                err(f"pairing {pr['id']}: its entry is not in 本草綱目")
        if pr["status"] == "derived" and "entry_zh_hans" not in pr["source"]:
            err(f"pairing {pr['id']}: a derived pairing must keep the entry it was read from")
    proc = load("herbs/processing.json")
    words = [w for m in proc["methods"] for w in m["words"]] + proc["cleaning"]
    for dup in duplicates(words):
        err(f"processing: the word {dup} belongs to two methods")
    for m in proc["methods"]:
        if m["citation"] is not None and m["citation"] not in cit_ids:
            err(f"processing {m['id']}: unknown citation {m['citation']}")
        if m["citation"] is None and "unverified" not in m["says"]:
            err(f"processing {m['id']}: a method without a quotation must say it is unverified")
        mod = m["modifiers"]
        if not 0 < mod.get("harms_scale", 1) <= 1 or not -1 <= mod.get("direction", 0) <= 1 or any(o not in ORGANS for o in mod.get("tropism", {})):
            err(f"processing {m['id']}: a modifier is out of range or names an unknown organ")
    guides = load("herbs/yinjing.json")
    if sorted(c["organ"] for c in guides["channels"]) != sorted(set(c["organ"] for c in guides["channels"])) or len(guides["channels"]) != 12:
        err("yinjing: one row for each of the twelve channels")
    for c in guides["channels"]:
        if any(h not in herb_ids for h in c["herbs"]):
            err(f"yinjing {c['channel']}: unknown herb")
        if check_sources:
            if pairing_text is None:
                from .common import norm_ws, read_book
                from .curated.prescription import PAIRING_BOOK
                pairing_text = norm_ws(read_book(PAIRING_BOOK))
            if c["entry_zh_hans"] not in pairing_text:
                err(f"yinjing {c['channel']}: its entry is not in 本草綱目")
    pattern_ids = {p["id"] for p in load("diagnosis/patterns.json")["items"]}
    mech = load("treatment/mechanisms.json")["items"]
    for dup in duplicates([m["pattern"] for m in mech]):
        err(f"mechanisms: pattern {dup} listed twice")
    for m in mech:
        if m["pattern"] not in pattern_ids or m["citation"] not in cit_ids:
            err(f"mechanism {m['pattern']}: unknown pattern or citation")
        if m["sign"] != (1 if m["direction"] in ("升", "宣") else -1):
            err(f"mechanism {m['pattern']}: {m['direction']} has the sign {m['sign']}")
    sy = load("treatment/sanyin.json")
    constitution_ids = {c["id"] for c in load("diagnosis/constitutions.json")["items"]}
    said = [sy["severity"], sy["age"], sy["region"], sy["general"], sy["season_exception"], *sy["constitution"]]
    if any(x["citation"] not in cit_ids for x in said) or sy["season_citation"] not in cit_ids:
        err("sanyin: unknown citation")
    for c in sy["constitution"]:
        if c["constitution"] not in constitution_ids or not 0 < c["factor"] <= 1:
            err(f"sanyin constitution {c['constitution']}: unknown constitution, or a factor that raises")
    bounds = [m["below_years"] for m in sy["age"]["minors"]]
    if bounds != sorted(bounds) or bounds[-1] > 18 or any(not 0 < Fraction(m["fraction"]) < 1 for m in sy["age"]["minors"]):
        err("sanyin age: minors' bands must rise to 18 at most, each with a fraction below 1")
    for s in sy["season"]:
        if not 0 < s["factor"] <= 1 or ("temperature_at_least" in s) == ("temperature_at_most" in s):
            err(f"sanyin season {s['element']}: a factor that raises, or not exactly one temperature bound")
    if not (0 < sy["severity"]["light"] <= sy["severity"]["standard"] <= sy["severity"]["strong"] <= 1.5):
        err("sanyin severity: light ≤ standard ≤ strong, within (0, 1.5]")
    rx_params = load("treatment/prescription.json")["params"]
    if not 0 < rx_params["bands"]["small_below"] < 1 < rx_params["bands"]["large_above"]:
        err("prescription params: dose bands must lie on each side of the typical dose")
    if not (rx_params["dose"]["kappa"] > 0 and rx_params["dose"]["gamma"] >= 1 and 0 <= rx_params["pairs"]["sigma"] < 1 and 0 <= rx_params["pairs"]["tau"] < 1):
        err("prescription params: κ > 0, γ ≥ 1, 0 ≤ σ, τ < 1")
    for b in load("herbs/dose-bands.json")["items"]:
        if b["herb"] not in herb_ids or b["citation"] not in cit_ids:
            err(f"dose band {b['name']}: unknown herb or citation")
        for side in (b["small"], b["large"]):
            for key in ("effects_add", "effects_scale", "harms_add"):
                for t in side.get(key, {}):
                    if not valid_target(t):
                        err(f"dose band {b['name']}: invalid panel target {t}")
            if not -1 <= side.get("direction", 0) <= 1 or any(o not in ORGANS for o in side.get("tropism", {})):
                err(f"dose band {b['name']}: direction out of range or unknown organ")
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

    # ── 6b. 營衛 (PM-52): every reading cites a verified quotation; each set of weights sums to 1; the values, confidences and projections are what the
    #        weights give; the panel schema holds the same natures and sources; and every pattern's projection is its elements' plus the coupling ──
    yw = load("diagnosis/yingwei.json")
    panel_doc = load("diagnosis/panel-schema.json")

    def weighted(rs: list[dict]) -> tuple[float, float]:
        v = sum(r["applicability"] * r["value"] for r in rs)
        return round(v, 3), round(1 - sum(r["applicability"] * abs(r["value"] - v) for r in rs) / 2, 3)

    def cites(where: str, ids: list[str]) -> None:
        for c in ids:
            if c not in cit_ids:
                err(f"yingwei {where}: unknown citation {c}")

    for d in yw["dimensions"]:
        cites(d["id"], d["basis"])
    for key, n in yw["natures"].items():
        proj = {}
        for dim, dv in n["dimensions"].items():
            if dim not in YINGWEI and not ("." in dim and valid_target(dim)):
                err(f"yingwei nature {key}: unknown dimension {dim}")
            if abs(sum(r["applicability"] for r in dv["readings"]) - 1) > 1e-9:
                err(f"yingwei nature {key}.{dim}: the applicability weights do not sum to 1")
            for r in dv["readings"]:
                cites(f"nature {key}.{dim}", r["citations"])
            if (dv["value"], dv["confidence"]) != weighted(dv["readings"]):
                err(f"yingwei nature {key}.{dim}: value and confidence are not what the readings give")
            if dv["value"] != 0:
                proj[dim if "." in dim else f"yingwei.{dim}"] = dv["value"]
        if proj != n["projection_per_degree"] or proj != panel_doc["nature_projection"].get(key):
            err(f"yingwei nature {key}: the projection is not the weighted values, or differs from the panel schema")
        if n["pattern"] not in pattern_ids:
            err(f"yingwei nature {key}: unknown pattern {n['pattern']}")
        elif f"PE_{n['location']}_{key}" not in next(p for p in patterns if p["id"] == n["pattern"])["elements"]:
            err(f"yingwei nature {key}: pattern {n['pattern']} does not hold the element PE_{n['location']}_{key}")
    for q in yw["questions"]:
        for r in q.get("readings", []):
            cites(q["id"], r["citations"])
        if "dimension" in q and (q.get("value"), q.get("confidence")) != weighted(q["readings"]):
            err(f"yingwei {q['id']}: value and confidence are not what the readings give")
    strength = yw["coupling"]["strength"]
    couplings = {}
    for target, c in yw["coupling"]["targets"].items():
        if abs(sum(r["applicability"] for r in c["readings"]) - 1) > 1e-9:
            err(f"yingwei coupling {target}: the applicability weights do not sum to 1")
        expected: dict[str, float] = {}
        for r in c["readings"]:
            cites(f"coupling {target}", r["citations"])
            for dim in r["dims"]:
                if not valid_target(dim):
                    err(f"yingwei coupling {target}: invalid source {dim}")
                expected[dim] = round(expected.get(dim, 0) + r["applicability"] / len(r["dims"]), 6)
        if expected != c["sources"] or c["sources"] != panel_doc["yingwei"]["coupling"]["sources"].get(target):
            err(f"yingwei coupling {target}: the sources are not the readings' weights, or differ from the panel schema")
        couplings[target] = c["sources"]
    if panel_doc["yingwei"]["coupling"]["strength"] != strength:
        err("yingwei: the coupling strength differs between yingwei.json and the panel schema")
    element_proj = {e["id"]: e["projection_per_degree"] for e in elements}
    for p in patterns:
        unit: dict[str, float] = {}
        for e in p["elements"]:
            for k, v in element_proj.get(e, {}).items():
                unit[k] = unit.get(k, 0) + v
        for target, srcs in couplings.items():
            x = sum(w * min(unit.get(src, 0), 0) for src, w in srcs.items())
            if x < 0:
                unit[target] = unit.get(target, 0) + round(strength * x, 3)
        if "bagang.exterior" in unit:
            unit["bagang.exterior"] = 1.0
        if any(abs(round(v, 3) - p["panel_projection_per_degree"].get(k, 0)) > 1e-9 for k, v in unit.items()) or set(k for k, v in unit.items() if round(v, 3) != 0) != set(p["panel_projection_per_degree"]):
            err(f"pattern {p['id']}: the panel projection is not its elements' plus the 營衛 coupling")
    for st in yw["stages"]:
        if "citation" in st and st["citation"] not in cit_ids:
            err(f"yingwei stage {st['stage']}: unknown citation")
        for rf in st.get("red_flags", []):
            if rf not in {r["id"] for r in load("diagnosis/red-flags.json")["items"]}:
                err(f"yingwei stage {st['stage']}: unknown red flag {rf}")
    for nm in yw["not_modelled"]:
        cites("not_modelled", nm["citations"])

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
    # the sources registry (PM-35): every book named, every corpus path pointed at and every quotation's book is a registered work
    registry = load("sources.json")
    for u in registry["_meta"]["unresolved"]:
        err(f"sources: {u['file']} names a work that is not in the sources registry: {u['value']!r} (scripts/kb/curated/sources.py)")
    for dup in duplicates([s["id"] for s in registry["items"]]):
        err(f"sources: duplicate id {dup}")
    for s in registry["items"]:
        if (s["status"] == "in-corpus") != bool(s["corpus"]):
            err(f"sources {s['id']}: status {s['status']} but {len(s['corpus'])} corpus paths")
        if s["status"] == "not-in-corpus" and not (s["author"] and s["era"]):
            err(f"sources {s['id']}: a work the corpus lacks needs its author and era")
        if check_sources:
            for c in s["corpus"]:
                if not c["exists"]:
                    err(f"sources {s['id']}: corpus path {c['path']} not found")
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
