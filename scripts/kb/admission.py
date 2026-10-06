"""The admission checklist of docs/post-mvp/design/library-expansion.md §4, as far as a machine can enforce it (task PM-21).

    .venv/bin/python -m scripts.kb.admission [--pairs]

A pattern enters the library only through this checklist. Each machine row of the design (A1 … A12; A13, the review records, belongs to the review gate) is a function of the library that returns what
is wrong with one pattern. `validate_kb.validate` runs all of them, so a pattern missing any machine-checkable item fails the build.

The 23 patterns written before the checklist existed do not all meet every row, and some rows need a decision no machine can make (a source per pattern, a physician's red-flag boundary). Those gaps
are **waived by name**, with a reason, in `data/review/admission.json` (curated/admission.py): a waiver can name only a pattern of the original library, and it fails the build as soon as it is no
longer needed — so the list of known gaps can only get shorter, and a new pattern cannot hide behind it. Declarations that are facts about a pattern (it needs the tongue and the pulse to reach
the 40-point band; no formula of it is visible in a release; why two patterns are closer than the margin) are checked against the data in the same way: a declaration that is not true fails.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from . import oracle
from .common import DATA, ROOT
from .selftest_patterns import typical_patient

#: Points (the pattern's score as a percent of its maximum) between a pattern's typical patient and the next pattern.
MARGIN = 20.0
EPSILON = 1e-9
#: Questions that must separate each pair of patterns closer than the margin (K-07).
MIN_DISCRIMINATING = 3
#: Symptoms of weight 2 or 3 that the inquiry can ask: fewer cannot describe a pattern.
MIN_STRONG = 4
#: A weight of the evidence table.
WEIGHTS = (1, 2, 3)

ID = re.compile(r"^[A-Z]{2}[0-9]{1,2}$")

ROW_TITLES = {
    "A1": "identity, names and status",
    "A2": "two independent sources",
    "A3": "the evidence table",
    "A4": "every weighted symptom can be asked",
    "A5": "the typical patient ranks first, with a margin",
    "A6": "three questions separate each close pair",
    "A7": "tongue and pulse",
    "A8": "a formula a release can show",
    "A9": "treatment guidance",
    "A10": "the red-flag boundary",
    "A11": "tests: a golden seed and vignettes",
    "A12": "wording in both languages",
}

Loader = Callable[[str], dict]


# ── the library ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Library:
    """What the checks read, loaded once. Everything is plain data, so a test can change any part of it."""

    patterns: list[dict]
    symptoms: dict[str, dict]
    questions: list[dict]
    citations: dict[str, dict]
    formulas: dict[str, dict]
    guidance: dict
    red_flags: frozenset[str]
    params: dict
    golden: list[dict]
    vignettes: list[dict]
    records: dict
    #: does a path of the repository (a source under reference/) exist?
    exists: Callable[[str], bool]

    def pattern(self, pid: str) -> dict:
        return next(p for p in self.patterns if p["id"] == pid)

    @property
    def original(self) -> frozenset[str]:
        return frozenset(self.records["original"])


def load_golden(root: Path = ROOT) -> list[dict]:
    return [json.loads(f.read_text(encoding="utf-8")) for f in sorted((root / "packages" / "engine" / "test" / "golden").glob("G-*.json"))]


def load_vignettes(root: Path = ROOT) -> list[dict]:
    out: list[dict] = []
    for f in sorted((root / "packages" / "engine" / "test" / "safety").glob("*.json")):
        out += json.loads(f.read_text(encoding="utf-8"))["vignettes"]
    return out


def library(load: Loader, *, golden: list[dict] | None = None, vignettes: list[dict] | None = None, check_sources: bool = True, root: Path = ROOT) -> Library:
    """The library as `load` (the validator's loader) gives it. Golden seeds and vignettes live with the engine's tests, so they are read from the repository unless given."""
    return Library(
        patterns=load("diagnosis/patterns.json")["items"],
        symptoms={s["id"]: s for s in load("diagnosis/symptoms.json")["items"]},
        questions=load("diagnosis/questions.json")["items"],
        citations={c["id"]: c for c in load("citations.json")["items"]},
        formulas={f["id"]: f for f in load("formulas/formulas.json")["items"]},
        guidance=load("treatment/guidance.json"),
        red_flags=frozenset(r["id"] for r in load("diagnosis/red-flags.json")["items"]),
        params=load("diagnosis/scoring-params.json"),
        golden=load_golden(root) if golden is None else golden,
        vignettes=load_vignettes(root) if vignettes is None else vignettes,
        records=load("review/admission.json"),
        exists=(lambda rel: (root / rel).exists()) if check_sources else (lambda rel: True),
    )


# ── measurements ────────────────────────────────────────────────────────────

def signed(p: dict, s: str) -> float:
    """What a symptom does to a pattern: its weight, minus what it counts against it."""
    return p["weights"].get(s, 0) - p["against"].get(s, 0)


def asked(findings: dict) -> dict:
    """The findings the inquiry collects: symptoms (S_…), not the tongue (T_…) or the pulse (P_…)."""
    return {s: f for s, f in findings.items() if s.startswith("S_")}


def reachable(bank: list[dict], present: set[str]) -> set[str]:
    """Symptoms a patient with `present` symptoms can report through the bank (core questions, and follow-ups whose trigger is present)."""
    sex = "female" if any(s.startswith("S_MENSES") or s in ("S_DYSMENORRHEA", "S_LEUKORRHEA_YELLOW", "S_BREAST_DISTENSION") for s in present) else \
        "male" if "S_SEMINAL_EMISSION" in present else "female"
    out: set[str] = set()
    for q in bank:
        req = q.get("requires") or {}
        if req.get("sex") and req["sex"] != sex:
            continue
        if "follows" in q and not (set(q["follows"]) & present):
            continue
        if not q["core"] and "follows" not in q and "requires" not in q:
            continue
        out |= {s for o in q["options"] for s in o["symptoms"]}
    return out


def margins(lib: Library) -> dict[tuple[str, str], float]:
    """For every ordered pair (a, b): how many points the typical patient of `a` scores for `a` above what the same patient scores for `b`."""
    out: dict[tuple[str, str], float] = {}
    for a in lib.patterns:
        scores = oracle.pattern_scores(lib.patterns, typical_patient(a), lib.params)
        for b in lib.patterns:
            if b["id"] != a["id"]:
                out[(a["id"], b["id"])] = scores[a["id"]] - scores[b["id"]]
    return out


def close_pairs(m: dict[tuple[str, str], float]) -> list[tuple[str, str]]:
    """The unordered pairs, sorted, where either typical patient is within the margin of the other pattern."""
    return sorted({tuple(sorted(k)) for k, v in m.items() if v < MARGIN - EPSILON})  # type: ignore[misc]


def discriminating(lib: Library, a: str, b: str) -> list[str]:
    """Questions that are asked when a symptom the two typical patients share is present (a core question or a follow-up trigger) and offer a symptom weighing at least two points differently."""
    pa, pb = lib.pattern(a), lib.pattern(b)
    shared = {s for s in set(asked(typical_patient(pa))) & set(asked(typical_patient(pb)))}
    return [q["id"] for q in lib.questions
            if (q["core"] or set(q.get("follows", [])) & shared) and any(abs(signed(pa, s) - signed(pb, s)) >= 2 for o in q["options"] for s in o["symptoms"])]


def needs_exam(lib: Library, p: dict) -> bool:
    """True when the typical patient, described by the inquiry alone, stays under the medium band (40): the pattern then cannot be reported without the tongue and the pulse."""
    return oracle.pattern_pct(p, asked(typical_patient(p)), lib.params) < lib.params["pattern"]["bands"]["medium"]


def seeds_of(lib: Library, pid: str) -> list[dict]:
    """Golden cases that are the typical patient of the pattern."""
    return [g for g in lib.golden if (g.get("expect", {}).get("patterns") or {}).get("first") == pid and g["title"].startswith(f"typical patient of {pid} ")]


def population_gated(subject: dict) -> bool:
    """A vignette whose person belongs to a population the policy gates: pregnant, lactating, under 18, or with a serious chronic disease."""
    return subject.get("pregnancy") == "yes" or subject.get("lactating") is True or isinstance(subject.get("ageYears"), int) and subject["ageYears"] < 18 or subject.get("seriousChronicDisease") is True


# ── the rows ────────────────────────────────────────────────────────────────

def a1(lib: Library, p: dict) -> list[str]:
    out = []
    if not ID.match(p["id"]):
        out.append(f"the id {p['id']!r} is not two capital letters and a number")
    for lang in ("zh-Hant", "en"):
        if not (p["name"].get(lang) or "").strip():
            out.append(f"no {lang} name")
    if p["status"] not in ("draft", "reviewed"):
        out.append(f"status {p['status']!r}")
    return out


def a2(lib: Library, p: dict) -> list[str]:
    out = []
    if not [c for c in p["citations"] if lib.citations.get(c, {}).get("verified") is True]:
        out.append("no verified classical quotation among its citations")
    sources = [s for s in lib.records["textbook_sources"] if s["pattern"] == p["id"]]
    if not sources:
        out.append("no textbook or modern source recorded (a path under reference/ in data/review/admission.json)")
    out += [f"the source {s['path']} is not in the repository" for s in sources if not lib.exists(s["path"])]
    return out


def a3(lib: Library, p: dict) -> list[str]:
    out = []
    if any(v not in WEIGHTS for v in p["weights"].values()) or any(v not in WEIGHTS for v in p["against"].values()):
        out.append("a weight outside 1–3")
    strong = [s for s, v in p["weights"].items() if v >= 2 and s.startswith("S_")]
    if len(strong) < MIN_STRONG:
        out.append(f"only {len(strong)} symptoms of weight 2 or 3 that the inquiry asks (at least {MIN_STRONG})")
    for field, what in (("required_any", "required-any symptoms"), ("against", "against symptoms"), ("panel_projection_per_degree", "panel projection"), ("elements", "element decomposition (證素)")):
        if not p[field]:
            out.append(f"no {what}")
    return out


def a4(lib: Library, p: dict) -> list[str]:
    typical = set(asked(typical_patient(p)))
    weighted = {s for s in list(p["weights"]) + list(p["against"]) if s.startswith("S_")}
    missing = sorted(weighted - reachable(lib.questions, typical | weighted))
    return [f"no question can reach {', '.join(missing)}"] if missing else []


def a5(lib: Library, p: dict, m: dict[tuple[str, str], float] | None = None) -> list[str]:
    m = margins(lib) if m is None else m
    excepted = {frozenset(e["patterns"]) for e in lib.records["margin_exceptions"]}
    out = []
    for b in sorted(x["id"] for x in lib.patterns if x["id"] != p["id"]):
        v = m[(p["id"], b)]
        if v <= 0:
            out.append(f"its typical patient does not rank above {b} ({v:+.1f} points)")
        elif v < MARGIN - EPSILON and frozenset((p["id"], b)) not in excepted:
            out.append(f"its typical patient is {v:.1f} points above {b}, under the {MARGIN:.0f}, and no exception is recorded")
    return out


def a6(lib: Library, p: dict, m: dict[tuple[str, str], float] | None = None) -> list[str]:
    m = margins(lib) if m is None else m
    out = []
    for b in sorted(x["id"] for x in lib.patterns if x["id"] != p["id"]):
        if m[(p["id"], b)] < MARGIN - EPSILON:
            found = discriminating(lib, p["id"], b)
            if len(found) < MIN_DISCRIMINATING:
                out.append(f"close to {b} ({m[(p['id'], b)]:.1f} points) but only {len(found)} questions separate them (at least {MIN_DISCRIMINATING}): {', '.join(found) or 'none'}")
    return out


def a7(lib: Library, p: dict) -> list[str]:
    out = []
    for prefix, what in (("T_", "tongue"), ("P_", "pulse")):
        if not any(s.startswith(prefix) for s in p["weights"]):
            out.append(f"no {what} feature in the evidence table")
    needs, declared = needs_exam(lib, p), p["id"] in lib.records["needs_exam"]
    if needs and not declared:
        out.append("the inquiry alone leaves its typical patient under the 40-point band, and the pattern does not declare that it needs the tongue and the pulse")
    if declared and not needs:
        out.append("declared as needing the tongue and the pulse, but the inquiry alone reaches the 40-point band")
    if needs:
        seeds = seeds_of(lib, p["id"])
        shown = {s for g in seeds for s, f in g["input"]["findings"].items() if f.get("state") == "present"}
        if not any(s.startswith("T_") for s in shown) or not any(s.startswith("P_") for s in shown):
            out.append("the pattern needs the tongue and the pulse, and its golden seed does not include them")
    return out


def a8(lib: Library, p: dict) -> list[str]:
    tier_a = [f for f in p["formulas"] if lib.formulas[f]["tier"] == "A"]
    declared = [d for d in lib.records["no_release_formula"] if d["pattern"] == p["id"]]
    out = []
    if tier_a:
        if declared:
            out.append(f"declares that no formula is visible in a release, but lists the tier-A formula {tier_a[0]}")
        if all(lib.formulas[f]["verification"]["composition_status"] == "partially-verified" for f in tier_a):
            out.append(f"its only tier-A formulas ({', '.join(tier_a)}) are partially verified")
    elif not declared:
        out.append("no tier-A formula, so a release shows none, and no declaration saying so with its reason")
    return out


def a9(lib: Library, p: dict) -> list[str]:
    t, g = p["treatment"], lib.guidance
    out = []
    for field in ("foods", "acupoints"):
        if not t[field]:
            out.append(f"no {field} in the treatment text")
    for f in t["foods"]:
        e = g["foods"].get(f)
        if e is None:
            out.append(f"the food {f} has no diet entry")
        elif not e.get("basis") or "pregnancy_caution" not in e:
            out.append(f"the food {f} has no basis or no pregnancy flag")
    for a in t["acupoints"]:
        e = g["acupoints"].get(a)
        if e is None:
            out.append(f"the point {a} has no entry")
        elif not e.get("basis") or "pregnancy_avoid" not in e:
            out.append(f"the point {a} has no basis or no pregnancy flag")
    life = g["lifestyle"].get(p["id"])
    if not life or not (life.get("zh-Hant") or "").strip() or not (life.get("en") or "").strip():
        out.append("no lifestyle line in both languages")
    return out


def a10(lib: Library, p: dict) -> list[str]:
    rec = next((r for r in lib.records["red_flag_boundary"] if r["pattern"] == p["id"]), None)
    if rec is None:
        return ["no red-flag boundary recorded (the red flags that must stand in front of the pattern, or why there are none)"]
    out = []
    if not rec["flags"] and not rec["reason"].strip():
        out.append("an empty boundary needs its reason")
    out += [f"unknown red flag {f}" for f in rec["flags"] if f not in lib.red_flags]
    return out


def a11(lib: Library, p: dict) -> list[str]:
    out = []
    seeds = seeds_of(lib, p["id"])
    if not seeds:
        out.append("no golden seed (the typical patient of the pattern)")
    elif not any(g["input"].get("findings") for g in seeds):
        out.append("the golden seed holds no findings")
    mine = [v for v in lib.vignettes if v["input"].get("interview") == p["id"]]
    flagged = [v["id"] for v in mine if v["input"].get("redFlags")]
    gated = [v["id"] for v in mine if v["id"] not in flagged and population_gated(v["input"].get("subject") or {})]
    if not flagged or not gated:
        out.append(f"{len(mine)} safety vignettes replay it; it needs one with a red flag and another gated by a population")
    return out


def a12(lib: Library, p: dict) -> list[str]:
    out = []
    if p["en_status"] not in ("machine-draft", "reviewed"):
        out.append(f"en_status {p['en_status']!r}")
    for s in sorted({*p["weights"], *p["against"]}):
        names = lib.symptoms.get(s) or {}
        if not (names.get("zh-Hant") or "").strip() or not (names.get("en") or "").strip():
            out.append(f"the symptom {s} has no name in both languages")
    return out


ROWS: dict[str, Callable[..., list[str]]] = {"A1": a1, "A2": a2, "A3": a3, "A4": a4, "A5": a5, "A6": a6, "A7": a7, "A8": a8, "A9": a9, "A10": a10, "A11": a11, "A12": a12}


# ── the checklist ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Finding:
    row: str
    pattern: str
    message: str
    #: "fail" fails the build; "waived" is a known gap of the original library, named with its reason in the records.
    status: str


def check(lib: Library) -> list[Finding]:
    """Every row for every pattern, and the records themselves: a waiver or declaration that is not true fails like any other problem."""
    m = margins(lib)
    waived = {(w["row"], pid): w["reason"] for w in lib.records["waivers"] for pid in w["patterns"]}
    ids = {p["id"] for p in lib.patterns}
    found: dict[tuple[str, str], list[str]] = {}
    for p in lib.patterns:
        for row, fn in ROWS.items():
            msgs = fn(lib, p, m) if row in ("A5", "A6") else fn(lib, p)
            if msgs:
                found[(row, p["id"])] = msgs
    out = [Finding(row, pid, msg, "waived" if (row, pid) in waived else "fail") for (row, pid), msgs in found.items() for msg in msgs]
    for (row, pid) in sorted(waived):
        if row not in ROWS:
            out.append(Finding(row, pid, "a waiver for a row that does not exist", "fail"))
        elif pid not in ids:
            out.append(Finding(row, pid, "a waiver for a pattern that does not exist", "fail"))
        elif pid not in lib.original:
            out.append(Finding(row, pid, "only a pattern of the original library can be waived; a new pattern meets the row", "fail"))
        elif (row, pid) not in found:
            out.append(Finding(row, pid, "this waiver is no longer needed — the row holds for the pattern; remove it from the records", "fail"))
    close = set(close_pairs(m))
    for e in lib.records["margin_exceptions"]:
        a, b = sorted(e["patterns"])
        if a not in ids or b not in ids:
            out.append(Finding("A5", f"{a}~{b}", "a margin exception for a pattern that does not exist", "fail"))
        elif (a, b) not in close:
            out.append(Finding("A5", f"{a}~{b}", f"the exception is no longer needed: neither typical patient is under {MARGIN:.0f} points from the other pattern", "fail"))
    for key, row in (("no_release_formula", "A8"), ("needs_exam", "A7"), ("textbook_sources", "A2"), ("red_flag_boundary", "A10")):
        for r in lib.records[key]:
            pid = r if isinstance(r, str) else r["pattern"]
            if pid not in ids:
                out.append(Finding(row, pid, f"a record in {key} for a pattern that does not exist", "fail"))
    return sorted(out, key=lambda f: (f.status != "fail", ROW_ORDER.get(f.row, 99), f.pattern, f.message))


ROW_ORDER = {row: i for i, row in enumerate(ROWS)}


def failures(findings: Iterable[Finding]) -> list[str]:
    return [f"admission {f.row} {f.pattern}: {f.message}" for f in findings if f.status == "fail"]


# ── report ──────────────────────────────────────────────────────────────────

def report(lib: Library, findings: list[Finding]) -> str:
    """Rows by patterns: `.` the row holds, `w` waived with a reason, `X` fails."""
    by = {(f.row, f.pattern): f.status for f in findings}
    ids = [p["id"] for p in lib.patterns]
    lines = ["row  " + " ".join(f"{i:>3}" for i in ids), *(f"{row:<4} " + " ".join(f"{({'fail': 'X', 'waived': 'w'}.get(by.get((row, i), ''), '.')):>3}" for i in ids) + f"  {ROW_TITLES[row]}" for row in ROWS)]
    waived = [f for f in findings if f.status == "waived"]
    bad = [f for f in findings if f.status == "fail"]
    lines.append(f"\n{len(ids)} patterns · {len(bad)} failures · {len(waived)} known gaps of the original library, waived with a reason")
    for w in lib.records["waivers"]:
        lines.append(f"  {w['row']} ({len(w['patterns'])} patterns): {w['reason']}")
    for f in bad:
        lines.append(f"  FAIL {f.row} {f.pattern}: {f.message}")
    return "\n".join(lines)


def pair_report(lib: Library) -> str:
    """The pairs under the margin, with the questions that separate them: where an author stands before writing weights."""
    m = margins(lib)
    lines = [f"pairs where a typical patient is under {MARGIN:.0f} points from another pattern ({len(close_pairs(m))}):"]
    for a, b in close_pairs(m):
        qs = discriminating(lib, a, b)
        lines.append(f"  {a} / {b}: {a}→{b} {m[(a, b)]:+.1f}, {b}→{a} {m[(b, a)]:+.1f} · {len(qs)} separating questions ({', '.join(qs) or '—'})")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="The admission checklist over the whole library")
    ap.add_argument("--pairs", action="store_true", help="also list the close pairs and the questions that separate them")
    args = ap.parse_args(argv)
    lib = library(lambda rel: json.loads((DATA / rel).read_text(encoding="utf-8")))
    findings = check(lib)
    print(report(lib, findings))
    if args.pairs:
        print("\n" + pair_report(lib))
    return 1 if any(f.status == "fail" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
