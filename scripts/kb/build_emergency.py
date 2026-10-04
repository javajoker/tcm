"""Build data/safety/emergency.json from curated/emergency.py."""
from __future__ import annotations

from .common import DATA, dump
from .curated import emergency
from .schemas import SCHEMA_VERSION


def main() -> None:
    dump(DATA / "safety" / "emergency.json", {
        "_meta": {"description": "Emergency and crisis numbers by region (safety policy §5). Every row awaits verification by the regional owner before release; "
                                 "a wrong number is a safety incident, so correct this file rather than the app.",
                  "schema": SCHEMA_VERSION, "status": "draft", "default_region": emergency.DEFAULT_REGION},
        "regions": emergency.REGIONS,
    })
    print(f"emergency: {len(emergency.REGIONS)} regions (default {emergency.DEFAULT_REGION})")


if __name__ == "__main__":
    main()
