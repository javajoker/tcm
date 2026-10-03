"""Build data/diagnosis/orientation.json from curated/orientation.py."""
from __future__ import annotations

from .common import DATA, dump
from .curated import orientation as o


def main() -> None:
    dump(DATA / "diagnosis" / "orientation.json", {
        "_meta": {"description": "Sign lists for the 八綱/六邪 first impression (SOP §8.2): routing, consistency check and explanation only; the final 八綱 scalars come from the panel.",
                  "status": "draft"},
        "external_triggers": o.EXTERNAL_TRIGGERS, "exterior": o.EXTERIOR,
        "cold_signs": o.COLD_SIGNS, "heat_signs": o.HEAT_SIGNS, "deficiency_signs": o.DEFICIENCY_SIGNS, "excess_signs": o.EXCESS_SIGNS,
        "lean_margin": o.LEAN_MARGIN,
    })
    print("orientation: 4 sign lists, external triggers and exterior rule")


if __name__ == "__main__":
    main()
