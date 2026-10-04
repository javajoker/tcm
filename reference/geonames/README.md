# GeoNames — cities for the birth-place picker

| | |
|---|---|
| **Source** | GeoNames, <https://www.geonames.org/>, dataset `cities15000` (places with more than 15,000 inhabitants) |
| **File** | `https://download.geonames.org/export/dump/cities15000.zip` (3,360,048 bytes; last modified 2026-10-04 03:33 GMT on the server) |
| **Retrieved** | 2026-10-04 |
| **SHA-256 of the zip** | `4d91d34a56966f1b6c7ae192e171bd721b47f7b86848955679ed20bd032d4aba` |
| **Licence** | Creative Commons Attribution 4.0 (<https://creativecommons.org/licenses/by/4.0/>): the data may be used, changed and redistributed with attribution |
| **Attribution (as shown)** | City names, coordinates and time zones: GeoNames (geonames.org), licensed under CC BY 4.0; reduced to a selection and, for some places, a Chinese name added or corrected by hand. |

The original (34,152 places, 8.5 MB) is **not** kept in the repository. Download and unzip it into `reference/derived/geonames/` (git-ignored) only to regenerate the extract.

## What is committed

`cities-extract.tsv` — the selected rows, with only the columns the build needs (id, name, ASCII name, the Chinese alternate names, latitude, longitude, feature code, country, admin1 code,
population, time zone, modification date). It is data of GeoNames, so it carries the same licence and attribution. `data/geo/cities.json` is built from it by `scripts/kb/build_geo.py`
(`pnpm build:kb`), so the knowledge base builds without the original.

## Selection (`scripts/kb/geonames_extract.py`)

- **Taiwan, Hong Kong, Macau:** every populated place except sections of a place (feature code `PPLX`) — as the tech spec's decision TQ2 asks.
- **Elsewhere** (China 100; Singapore, Malaysia, Japan, Korea, Thailand, Vietnam, the Philippines, Indonesia; the US, Canada, the UK, Germany, France, the Netherlands, Italy, Spain; Australia, New Zealand):
  the most populous places first, skipping a place within 0.1–0.3° of one already chosen (its districts), up to the number given in the script; the capital is always added.
- A place listed twice under two spellings is kept once; a few places that are not what a person means by their birthplace are left out (`EXCLUDE` in the script, with the reason).

## Chinese names (`scripts/kb/build_geo.py`, `scripts/kb/curated/geo.py`)

GeoNames gives Chinese names as untagged alternates. The builder keeps the pure-ideograph ones, converts them to Traditional (OpenCC `s2twp`), drops 市 and its kind (unless the English name says
"City"), and takes the form most alternates reduce to. Corrections by hand (`ZH_OVERRIDE`: the listed name is archaic, Japanese or wrong) and additions by hand (`ZH_ADD`: GeoNames has none —
mostly Hong Kong localities) are keyed by country and English name. **The hand-made names are ours, not GeoNames', and have not been reviewed.** Up to three other forms (simplified, variant)
are kept as `alt_hans` so that a search in either script finds the place.

The picker never replaces manual entry: the longitude and the time zone can always be typed.
