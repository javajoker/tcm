"""Select the cities of the birth-place picker from GeoNames `cities15000.txt` (K-10, tech spec TQ2).

    .venv/bin/python -m scripts.kb.geonames_extract [path/to/cities15000.txt]

The default input is `reference/derived/geonames/cities15000.txt` (git-ignored: download `cities15000.zip` from https://download.geonames.org/export/dump/ and unzip it).
The output, `reference/geonames/cities-extract.tsv`, is committed: it holds only the selected rows and only the columns the build needs, so the knowledge base can be
rebuilt without the 8 MB original. Source: GeoNames (https://www.geonames.org), licence CC BY 4.0 — see `reference/geonames/README.md`.

Selection, all deterministic:
  · Taiwan, Hong Kong and Macau: every populated place of the file except sections of a place (feature code PPLX);
  · a place listed twice under two spellings of its name is kept once (the older entry);
  · other countries (below): the most populous places first, skipping a place that lies within `radius` degrees of one already chosen in the same country (districts of one city),
    up to the number given.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from .common import ROOT

SOURCE = ROOT / "reference" / "derived" / "geonames" / "cities15000.txt"
OUT = ROOT / "reference" / "geonames" / "cities-extract.tsv"

ALL = ("TW", "HK", "MO")
# country → (how many, radius in degrees within which a second place counts as the same city); the capital is always added
TOP: dict[str, tuple[int, float]] = {
    "CN": (100, 0.3), "SG": (3, 0.2), "MY": (14, 0.2), "JP": (15, 0.2), "KR": (10, 0.2), "TH": (8, 0.2), "VN": (6, 0.2), "PH": (8, 0.1), "ID": (6, 0.2),
    "US": (40, 0.2), "CA": (12, 0.2), "GB": (12, 0.2), "DE": (8, 0.2), "FR": (8, 0.2), "NL": (3, 0.2), "IT": (5, 0.2), "ES": (5, 0.2), "AU": (10, 0.2), "NZ": (4, 0.2),
}
# places the most-populous rule would pick but that are not what a person means by their birthplace: administrative seats listed under a name that is not the city's own (Aihara is Sagamihara,
# Budta and Malingao lie in the Cotabato area), sections of a metropolis (Khlong Sam Wa, Marne La Vallée), a village (Chengtangcun) or a district (Kota Kuala Muda, Kabin Buri)
EXCLUDE = {"1865689", "1723510", "1978681", "6847550", "1793036", "13494069", "1610538", "12278193"}
COLUMNS = ["geonameid", "name", "asciiname", "alternatenames_cjk", "latitude", "longitude", "feature_code", "country", "admin1", "population", "timezone", "modified"]
CJK = re.compile(r"[㐀-鿿]")


def cjk_names(alternates: str) -> list[str]:
    return [n for n in alternates.split(",") if n and CJK.search(n) and re.fullmatch(r"[㐀-鿿・·・（）() 0-9A-Za-z-]+", n)]


def select(rows: list[list[str]]) -> list[list[str]]:
    by_cc: dict[str, list[list[str]]] = {}
    for f in rows:
        by_cc.setdefault(f[8], []).append(f)
    chosen: list[list[str]] = []
    for cc in ALL:
        chosen += [f for f in by_cc.get(cc, []) if f[7] != "PPLX"]
    for cc, (n, radius) in TOP.items():
        picked: list[list[str]] = []
        capital = [f for f in by_cc.get(cc, []) if f[7] == "PPLC" and f[0] not in EXCLUDE]
        for f in sorted(by_cc.get(cc, []), key=lambda r: (-int(r[14] or 0), int(r[0]))):
            if f[7] == "PPLX" or f[0] in EXCLUDE:
                continue
            if any(abs(float(f[4]) - float(p[4])) < radius and abs(float(f[5]) - float(p[5])) < radius for p in picked):
                continue
            picked.append(f)
            if len(picked) == n:
                break
        chosen += picked + [c for c in capital if c not in picked]
    # the same place entered twice under two spellings (Chang-hua / Changhua): keep the older entry (two places of one name, such as the two Suzhou, are far apart and both stay)
    kept: list[list[str]] = []
    for f in sorted(chosen, key=lambda r: int(r[0])):
        key = re.sub(r"[^a-z]", "", f[2].lower())
        if any(k[8] == f[8] and re.sub(r"[^a-z]", "", k[2].lower()) == key and abs(float(k[4]) - float(f[4])) < 0.05 and abs(float(k[5]) - float(f[5])) < 0.05 for k in kept):
            continue
        kept.append(f)
    chosen = kept
    return sorted(chosen, key=lambda r: (r[8], -int(r[14] or 0), int(r[0])))


def extract(source: Path = SOURCE) -> str:
    rows = [line.rstrip("\n").split("\t") for line in source.read_text(encoding="utf-8").splitlines() if line]
    out = ["\t".join(COLUMNS)]
    for f in select(rows):
        out.append("\t".join([f[0], f[1], f[2], ",".join(cjk_names(f[3])), f[4], f[5], f[7], f[8], f[10], f[14], f[17], f[18]]))
    return "\n".join(out) + "\n"


def main(argv: list[str]) -> int:
    source = Path(argv[1]) if len(argv) > 1 else SOURCE
    if not source.exists():
        print(f"missing {source}: download https://download.geonames.org/export/dump/cities15000.zip and unzip it there", file=sys.stderr)
        return 1
    text = extract(source)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(text.splitlines()) - 1} places, {len(text):,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
