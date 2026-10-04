"""Build data/geo/cities.json — the birth-place picker's city list (K-10, tech spec TQ2) — from the committed GeoNames extract.

The extract (`reference/geonames/cities-extract.tsv`, made by `geonames_extract.py` from GeoNames `cities15000`) is data of GeoNames, licence CC BY 4.0: the attribution is
carried in `_meta` and shown on the Sources screen and in NOTICE. Each city has its English name, a Traditional-Chinese name where GeoNames or `curated/geo.py` gives one,
up to three other Chinese forms (simplified, variant; `alt_hans`) for the search, rounded latitude and longitude, and the IANA time zone.
"""
from __future__ import annotations

import csv
import re

from .common import DATA, ROOT, dump, tw
from .curated.geo import ZH_ADD, ZH_OVERRIDE
from .schemas import SCHEMA_VERSION

EXTRACT = ROOT / "reference" / "geonames" / "cities-extract.tsv"
SUFFIXES = ("市", "縣", "县", "鎮", "镇", "鄉", "乡", "廣域", "都會")
IDEOGRAPHS = re.compile(r"[㐀-鿿]{2,}")


def strip_suffix(name: str, en: str) -> str:
    """Drop 市 and its kind from a Chinese name (台北市 → 台北), unless the English name says "City" (Chiayi City → 嘉義市) or too little would be left."""
    if en.endswith("City"):
        return name
    for s in SUFFIXES:
        if name.endswith(s) and len(name) - len(s) >= 2:
            return name[: -len(s)]
    return name


def best_zh(names: list[str], en: str) -> str | None:
    """The Chinese name most of GeoNames' alternates agree on, in Traditional: the one that most alternates reduce to once a suffix is dropped, then the shorter, then the first."""
    candidates: list[str] = []
    for n in names:
        if IDEOGRAPHS.fullmatch(n):
            t = tw(n)
            if t not in candidates:
                candidates.append(t)
    if not candidates:
        return None
    votes: dict[str, list[int]] = {}
    for i, c in enumerate(candidates):
        e = votes.setdefault(strip_suffix(c, en), [0, i])
        e[0] += 1
    return min(votes.items(), key=lambda kv: (-kv[1][0], len(kv[0]), kv[1][1]))[0]


def build() -> list[dict]:
    with EXTRACT.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh, delimiter="\t"))
    items = []
    for r in rows:
        en, cc = r["name"], r["country"]
        names = [n for n in r["alternatenames_cjk"].split(",") if n]
        zh = ZH_OVERRIDE.get((cc, en)) or best_zh(names, en) or ZH_ADD.get((cc, en))
        alt: list[str] = []
        for n in names:
            if IDEOGRAPHS.fullmatch(n) and n != zh and n not in alt and strip_suffix(n, en) != zh:
                alt.append(n)
        item: dict = {"id": int(r["geonameid"]), "en": en}
        if zh:
            item["zh"] = zh
        if alt:
            item["alt_hans"] = alt[:3]
        item.update({"cc": cc, "lat": round(float(r["latitude"]), 2), "lon": round(float(r["longitude"]), 2), "tz": r["timezone"]})
        items.append(item)
    return items


def main() -> None:
    items = build()
    dump(DATA / "geo" / "cities.json", {
        "_meta": {
            "description": "Cities for the birth-place picker: name (English, Traditional Chinese where known), latitude, longitude and IANA time zone. Always paired with manual longitude and time zone entry.",
            "schema": SCHEMA_VERSION, "count": len(items), "status": "derived",
            "source": {"name": "GeoNames", "url": "https://www.geonames.org/", "dataset": "cities15000", "licence": "CC BY 4.0", "licence_url": "https://creativecommons.org/licenses/by/4.0/",
                       "attribution": "City names, coordinates and time zones: GeoNames (geonames.org), licensed under CC BY 4.0; reduced to a selection and, for some places, a Chinese name added or corrected by hand.",
                       "extract": "reference/geonames/cities-extract.tsv"},
        },
        "items": items,
    })
    zh = sum(1 for i in items if "zh" in i)
    print(f"geo: {len(items)} cities, {zh} with a Chinese name")


if __name__ == "__main__":
    main()
