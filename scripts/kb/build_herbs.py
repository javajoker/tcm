"""Build data/herbs/herbs.json and data/herbs/herb-index.json.

Pipeline: TCM-Library zhongyao entries (structured 四氣/五味/歸經/功效) → Traditional script → derived
numeric model (herb_model.py) → curated overlay (curated/herbs.py) for the MVP formula herbs.
"""
from __future__ import annotations

import re

from .common import DATA, LIB, dump, front_matter, submodule_commits, term
from .curated.herbs import EFFECT_OVERRIDES, EXTRA, NAME_TO_LIB, OVERLAY, SIQI_CORRECTIONS
from .herb_props import conventions as props_conventions, derive as derive_props
from .herb_model import (
    FLAVOR_ELEMENT, FLAVOR_EXCESS_HARM, derive_effects, derive_harms, is_toxic, parse_flavors, parse_organs,
    parse_temps, pregnancy_level,
)

NAME_FIX = {"黃芪": "黃耆", "硃砂": "朱砂"}


def canonical(name: str) -> str:
    n = term(name)
    return NAME_FIX.get(n, n)


def parse_entries() -> list[dict]:
    files = sorted(p for p in (LIB / "library" / "zhongyao").rglob("*.md")
                   if p.name not in ("INDEX.md", "README.md") and not p.name.startswith("_"))
    out = []
    for p in files:
        fm, body = front_matter(p.read_text(encoding="utf-8"))
        c = fm["conditions"]
        prop = ""
        m = re.search(r"性味(.*?)功能与主治", body, re.S)
        if m:
            prop = m.group(1)
        note = ""
        m = re.search(r"注意：([^。]+)。", body)
        if m:
            note = m.group(1)
        dose = None
        m = re.search(r"用法与用量：\s*([\d\.]+)\s*[～~\-]\s*([\d\.]+)\s*g", body)
        if m:
            dose = [float(m.group(1)), float(m.group(2))]
        part = None
        m = re.search(r"药用部位：([^）)]+)[）)]", body)
        if m:
            part = m.group(1)
        latin = None
        m = re.search(r"\b([A-Z][a-z]+ [a-z\-]+)\b", body)
        if m:
            latin = m.group(1)
        out.append({
            "lib": p.parent.name,
            "entry_id": fm["id"],
            "title_zh_hans": fm["section_title"],
            "category_zh_hans": fm["chapter"],
            "book": fm["book"],
            "siqi": c.get("siqi", []),
            "wuwei": c.get("wuwei", []),
            "guijing": c.get("guijing", []),
            "zhifa": c.get("zhifa", []),
            "fangming": c.get("fangming", []),
            "property_sentence": prop,
            "part_zh_hans": part,
            "note_zh_hans": note,
            "dose_g": dose,
            "latin": latin,
            "path": str(p.relative_to(LIB.parent.parent.parent)),
        })
    return out


def corrected_siqi(lib: str, stated: list[str]) -> tuple[list[str], list[str]]:
    """The entry's 四氣 and data-quality notes: the front matter's value, unless curated/herbs.py corrects it to the 性味 sentence."""
    if lib not in SIQI_CORRECTIONS:
        return stated, []
    expected, corrected = SIQI_CORRECTIONS[lib]
    if stated != expected:
        raise ValueError(f"SIQI_CORRECTIONS[{lib}]: the front matter now says {stated}, not {expected}; compare it with the 性味 sentence and update or drop the row")
    return corrected, [f"siqi {'、'.join(stated)} in the source's front matter corrected to {'、'.join(corrected)}, the nature its 性味 sentence states"]


def dedupe_by_name(herbs: list[dict]) -> list[dict]:
    """One record per canonical name. Where the source lists the same herb twice (e.g. 穿山甲 in the Pharmacopoeia and again among the
    non-Pharmacopoeia textbook herbs) keep the curated one, else the Pharmacopoeia entry, and note the dropped source on the survivor."""
    def rank(h: dict) -> tuple:
        return (h["status"] != "curated-draft", "藥典外" in h["source"]["book"], h["source"]["entry_id"])

    groups: dict[str, list[dict]] = {}
    for h in herbs:
        groups.setdefault(h["name"]["zh-Hant"], []).append(h)
    out = []
    for name, group in groups.items():
        group.sort(key=rank)
        keep, dropped = group[0], group[1:]
        for d in dropped:
            keep["data_quality"].append(f"duplicate source entry {d['source']['entry_id']} ({d['source']['book']}) dropped in favour of this one")
        out.append(keep)
    return out


def build() -> tuple[list[dict], dict[str, str]]:
    commits = submodule_commits()
    herbs: list[dict] = []
    seen_lib: set[str] = set()
    for e in parse_entries():
        lib = e["lib"]
        if lib in seen_lib:
            raise ValueError(f"duplicate herb directory {lib}")
        seen_lib.add(lib)
        ov = OVERLAY.get(lib)
        organs = parse_organs(e["guijing"])
        siqi, siqi_dq = corrected_siqi(lib, [term(s) for s in e["siqi"]])
        temp = parse_temps(siqi)
        flavors, dq = parse_flavors([term(w) for w in e["wuwei"]])
        for f in flavors:
            f["element"] = FLAVOR_ELEMENT[f["flavor"]]
        zhifa = e["zhifa"]
        tags = (ov or {}).get("tags", [])
        effects = dict(EFFECT_OVERRIDES[lib]) if lib in EFFECT_OVERRIDES else derive_effects(zhifa, organs)
        harms = derive_harms(temp, flavors, tags, organs)
        category = term(e["category_zh_hans"])
        note_text = e["note_zh_hans"]
        preg = pregnancy_level(note_text, e["category_zh_hans"], (ov or {}).get("pregnancy"))
        toxic = is_toxic(e["property_sentence"], (ov or {}).get("toxic"))
        name = canonical(e["title_zh_hans"])
        props, props_rules = derive_props(name=name, category=category, functions=[term(z) for z in zhifa], flavors=flavors, temperature=temp, organs=organs, tags=tags,
                                          part=term(e["part_zh_hans"]) if e["part_zh_hans"] else None, property_sentence=e["property_sentence"],
                                          curated_toxic=(ov or {}).get("toxic"))
        herb = {
            "id": f"herb-{lib}",
            "slug": lib,
            "name": {"zh-Hant": name, "en": (ov or {}).get("en")},
            "category": category,
            "latin": e["latin"],
            "siqi": siqi,
            "temperature": round(temp, 2),
            "flavors": flavors,
            "organs": organs,
            "functions": [term(z) for z in zhifa],
            "effects": effects,
            "harms": harms,
            "tags": tags,
            "pregnancy": preg,
            "interactions": (ov or {}).get("interactions", []),
            "toxic": toxic,
            "dose_g_reference": e["dose_g"],
            "caution": (ov or {}).get("note") or (term(note_text) if note_text else None),
            "classical_formulas": [term(f) for f in e["fangming"]],
            "status": "curated-draft" if ov else "derived",
            "props": props,
            "props_rules": props_rules,
            "data_quality": dq + siqi_dq,
            "source": {"repo": "TCM-Library", "commit": commits.get("TCM-Library"), "path": e["path"], "entry_id": e["entry_id"],
                       "book": term(e["book"])},
        }
        if herb["name"]["zh-Hant"] == "地黃":
            herb["aliases"] = ["生地黃", "乾地黃", "鮮地黃"]
        if herb["name"]["zh-Hant"] == "黃耆":
            herb["aliases"] = ["黃芪"]
        herbs.append(herb)

    herbs = dedupe_by_name(herbs)

    for x in EXTRA:
        x_flavors = [{"flavor": f, "weight": 1.0, "element": FLAVOR_ELEMENT[f]} for f in x["flavors"]]
        props, props_rules = derive_props(name=x["zh"], category="藥食同源（人工補充）", functions=x["functions"], flavors=x_flavors, temperature=x["temp"], organs=x["organs"],
                                          tags=x["tags"], part=None, property_sentence="", curated_toxic=False)
        herb = {
            "id": f"herb-{x['id']}", "slug": x["id"], "name": {"zh-Hant": x["zh"], "en": x["en"]}, "category": "藥食同源（人工補充）",
            "latin": None, "siqi": [], "temperature": x["temp"],
            "flavors": [{"flavor": f, "weight": 1.0, "element": FLAVOR_ELEMENT[f]} for f in x["flavors"]],
            "organs": x["organs"], "functions": x["functions"], "effects": x["effects"], "harms": derive_harms(x["temp"], [{"flavor": f, "weight": 1.0} for f in x["flavors"]], x["tags"], x["organs"]),
            "tags": x["tags"], "pregnancy": x["pregnancy"], "interactions": [], "toxic": False, "dose_g_reference": None,
            "caution": x["caution"], "classical_formulas": [], "status": "curated-draft", "props": props, "props_rules": props_rules, "data_quality": ["not in TCM-Library; hand-curated"],
            "source": {"repo": "curated", "commit": None, "path": "scripts/kb/curated/herbs.py", "entry_id": x["id"], "book": "—"},
        }
        herbs.append(herb)

    index: dict[str, str] = {}
    by_lib = {h["slug"]: h for h in herbs}
    for name, lib in NAME_TO_LIB.items():
        if lib not in by_lib:
            raise KeyError(f"formula herb {name} → missing herb {lib}")
        index[name] = by_lib[lib]["id"]
    for h in herbs:
        index.setdefault(h["name"]["zh-Hant"], h["id"])
        for a in h.get("aliases", []):
            index.setdefault(a, h["id"])
    herbs.sort(key=lambda h: h["id"])
    return herbs, dict(sorted(index.items()))


def main() -> list[dict]:
    herbs, index = build()
    dump(DATA / "herbs" / "herbs.json", {
        "_meta": {
            "description": "Herb knowledge base: structured source properties plus the derived yin-yang / five-phase / organ model.",
            "count": len(herbs),
            "status_counts": {s: sum(1 for h in herbs if h["status"] == s) for s in sorted({h["status"] for h in herbs})},
            "conventions": {
                "temperature": "signed warmth: 大寒 −3, 寒 −2, 微寒 −1, 涼 −1, 平 0, 微溫 +0.5, 溫 +1, 熱 +2, 大熱 +3",
                "effects": "change the herb makes to the panel of the person taking it (e.g. 脾.qi +0.5, liuxie.火 −0.5)",
                "harms": "burden weights, same units; negative lowers the named channel (e.g. 脾.yang −0.25)",
                "flavor_excess_harm": FLAVOR_EXCESS_HARM,
                "props": props_conventions(),
            },
            "licence_note": "Pharmacopoeia-derived facts (properties, functions, cautions) are used as structured data; whole source text is not redistributed.",
        },
        "items": herbs,
    })
    dump(DATA / "herbs" / "herb-index.json", {"_meta": {"description": "Canonical/alias name (zh-Hant) → herb id"}, "index": index})
    print(f"herbs: {len(herbs)} ({sum(1 for h in herbs if h['status'] == 'curated-draft')} curated, "
          f"{sum(1 for h in herbs if h['status'] == 'derived')} derived), index {len(index)}")
    return herbs


if __name__ == "__main__":
    main()
