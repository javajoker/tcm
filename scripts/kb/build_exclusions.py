"""Build data/diagnosis/exclusions.json from curated/exclusions.py and the pulse exclusive groups of curated/exam.py."""
from __future__ import annotations

from .common import DATA, dump
from .curated import exam, exclusions

PULSE_LABELS = {
    ("P_FLOAT", "P_SINK"): ("X_PULSE_DEPTH", "脈的深淺：浮與沉不能同時成立。", "Pulse depth: floating and sinking are mutually exclusive."),
    ("P_SLOW", "P_RAPID", "P_HASTY"): ("X_PULSE_RATE", "脈率：遲、數、疾只能選一種。", "Pulse rate: choose one of slow, rapid, hasty."),
    ("P_DEFICIENT", "P_EXCESS"): ("X_PULSE_STRENGTH", "脈力：虛與實不能同時成立。", "Pulse strength: deficient and excess are mutually exclusive."),
    ("P_LONG", "P_SHORT"): ("X_PULSE_LENGTH", "脈長：長與短不能同時成立。", "Pulse length: long and short are mutually exclusive."),
    ("P_SLIPPERY", "P_CHOPPY"): ("X_PULSE_FLOW", "脈的流利度：滑與澀不能同時成立。", "Pulse flow: slippery and choppy are mutually exclusive."),
}


def build() -> dict:
    pulse_groups = []
    for group in exam.PULSE_EXCLUSIVE:
        gid, zh, en = PULSE_LABELS[tuple(group)]
        pulse_groups.append(exclusions.g(gid, "exclusive", list(group), zh, en))
    groups = exclusions.GROUPS + pulse_groups
    return {
        "_meta": {"description": "Mutually exclusive symptom groups, soft conflicts and look-alike splits (SOP §5.2–§5.3). 'exclusive' groups cannot all be true; "
                                 "'conflict' groups are unusual together and trigger a follow-up. The engine reports them and never resolves them silently.",
                  "count": len(groups), "status": "draft"},
        "groups": groups,
        "splits": exclusions.SPLITS,
    }


def main() -> None:
    data = build()
    dump(DATA / "diagnosis" / "exclusions.json", data)
    print(f"exclusions: {len(data['groups'])} groups ({sum(1 for g in data['groups'] if g['kind'] == 'exclusive')} exclusive), {len(data['splits'])} splits")


if __name__ == "__main__":
    main()
