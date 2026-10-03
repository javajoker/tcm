"""Write the JSON Schemas of schemas.py to data/schema/*.schema.json."""
from __future__ import annotations

from .common import DATA, dump
from .schemas import SCHEMAS, build


def main() -> None:
    for rel, (stem, _builder, _title) in SCHEMAS.items():
        dump(DATA / "schema" / f"{stem}.schema.json", build(rel))
    print(f"schemas: {len(SCHEMAS)} files in data/schema/")


if __name__ == "__main__":
    main()
