"""Build data/safety/emergency.json from curated/emergency.py."""
from __future__ import annotations

from datetime import date

from .common import DATA, dump
from .curated import emergency
from .schemas import SCHEMA_VERSION


def main() -> None:
    dump(DATA / "safety" / "emergency.json", {
        "_meta": {"description": "Emergency and crisis numbers by region (safety policy §5). Every row awaits verification by the regional owner before release; "
                                 "a wrong number is a safety incident, so correct this file rather than the app.",
                  "schema": SCHEMA_VERSION, "status": "draft"},
        "regions": emergency.REGIONS,
    })
    verified = [r for r in emergency.REGIONS if r.get("verification")]
    print(f"emergency: {len(emergency.REGIONS)} regions, {len(verified)} verified")
    for r in verified:      # numbers change: a verification older than 18 months is renewed before a public build refuses it at 24
        months = (date.today() - date.fromisoformat(r["verification"]["at"])).days // 30
        if months >= 18:
            print(f"  WARNING: the verification of {r['id']} is {months} months old; a public build refuses one older than 24")


if __name__ == "__main__":
    main()
