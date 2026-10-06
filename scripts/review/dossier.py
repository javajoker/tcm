"""Dossiers of candidate patterns (task PM-21, docs/post-mvp/design/library-expansion.md §5): what the clinical reviewer needs to accept, reject or change a candidate *before* anyone writes weights.

    .venv/bin/python -m scripts.review.dossier review/candidates/<id>.yaml [more files…] [--out DIR] [--session-kb 87.4]
    pnpm review:dossier review/candidates/<id>.yaml

A candidate is a short proposal file (`review/candidates/TEMPLATE.yaml.txt`): the id and group it would have, its names, the classical quotations and textbook sources proposed for it, the key symptoms
with *proposed* weights, formulas that could serve it and red flags that should stand in front of it. Nothing in it is data of the knowledge base. The dossier measures the proposal against the
library as it is — the engine's own scoring, the question bank, the registry of quotations and formulas — and writes `<out>/dossiers/<id>.md` (default out: review/packs, git-ignored: a dossier is
derived). The reviewer answers *accept / reject / change* on the page; only an accepted candidate is authored (scaffold: `scripts/kb/new_pattern.py`) and then goes through the admission checklist.
"""
from __future__ import annotations

import argparse
import dataclasses
import gzip
import json
import sys
from pathlib import Path
from typing import Any

import yaml

from scripts.kb import admission, oracle
from scripts.kb.common import DATA, ROOT
from scripts.kb.selftest_patterns import typical_patient
from scripts.review.pack import NOTICE_OF, both, cell_of, table

CANDIDATES = ROOT / "review" / "candidates"
OUT = ROOT / "review" / "packs"

#: The id prefix of each group (the patterns schema allows these and one digit).
GROUP_PREFIX = {"external": "EX", "spleen-stomach": "SP", "liver": "LV", "heart": "HT", "lung": "LG", "kidney": "KD", "qi-blood": "QB"}
#: The knowledge-base budget per session, gzip (tech spec §12).
SESSION_BUDGET_KB = 100.0


def load_candidate(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path}: a candidate is a mapping")
    return data


def default_library() -> admission.Library:
    return admission.library(lambda rel: json.loads((DATA / rel).read_text(encoding="utf-8")))


def problems(c: dict[str, Any], lib: admission.Library) -> list[str]:
    """What is wrong with the proposal itself (not with the pattern it proposes): unknown ids, a bad id, a missing name."""
    out: list[str] = []
    cid, group = c.get("id"), c.get("group")
    if group not in GROUP_PREFIX:
        out.append(f"group {group!r} is not one of {', '.join(GROUP_PREFIX)}")
    elif not (isinstance(cid, str) and cid[:2] == GROUP_PREFIX[group] and cid[2:].isdigit() and len(cid) == 3):
        out.append(f"the id {cid!r} must be the prefix of the group ({GROUP_PREFIX[group]}) and one digit")
    if isinstance(cid, str) and any(p["id"] == cid for p in lib.patterns):
        out.append(f"the id {cid} is already a pattern")
    names = c.get("name") or {}
    for lang in ("zh-Hant", "en"):
        if not str(names.get(lang) or "").strip():
            out.append(f"no {lang} name")
    new_symptoms = set(c.get("new_symptoms") or {})
    for field in ("key_symptoms", "against"):
        for s, w in (c.get(field) or {}).items():
            if s not in lib.symptoms and s not in new_symptoms:
                out.append(f"{field}: {s} is not in the symptom registry and not listed in new_symptoms")
            if w not in admission.WEIGHTS:
                out.append(f"{field}: the weight of {s} is {w!r}, not 1, 2 or 3")
    if not c.get("key_symptoms"):
        out.append("no key_symptoms")
    if set(c.get("key_symptoms") or {}) & set(c.get("against") or {}):
        out.append("a symptom is both key and against")
    src = c.get("sources") or {}
    for cit in src.get("citations") or []:
        if cit not in lib.citations:
            out.append(f"sources: the quotation {cit} is not in citations.json")
        elif lib.citations[cit].get("verified") is not True:
            out.append(f"sources: the quotation {cit} is not verified")
    for t in src.get("textbooks") or []:
        if not (ROOT / t.get("path", "")).exists():
            out.append(f"sources: {t.get('path')} is not in the repository")
    out += [f"formulas: {f} is not in the library (list it under new_formulas)" for f in c.get("formulas") or [] if f not in lib.formulas]
    out += [f"red_flags: {r} is not a red flag" for r in c.get("red_flags") or [] if r not in lib.red_flags]
    for s in new_symptoms:
        if s in lib.symptoms:
            out.append(f"new_symptoms: {s} is already in the registry")
        elif s not in (c.get("key_symptoms") or {}) and s not in (c.get("against") or {}):
            out.append(f"new_symptoms: {s} is not used in key_symptoms or against")
    return out


def naive_pattern(c: dict[str, Any]) -> dict[str, Any]:
    """The pattern as proposed, weighted exactly as the proposal says: required-any is the weight-3 symptoms unless given, the maximum is the sum."""
    weights = dict(c["key_symptoms"])
    return {"id": c["id"], "weights": weights, "against": dict(c.get("against") or {}),
            "required_any": list(c.get("required_any") or [s for s, w in weights.items() if w == 3]), "max_score": sum(weights.values())}


def gzip_kb(x: Any) -> float:
    return len(gzip.compress(json.dumps(x, ensure_ascii=False, sort_keys=True).encode("utf-8"))) / 1024


def build(c: dict[str, Any], lib: admission.Library, *, session_kb: float | None = None) -> str:
    n = naive_pattern(c)
    with_n = dataclasses.replace(lib, patterns=[*lib.patterns, n])
    name = both(c["name"])
    md = [f"# Dossier — `{c['id']}` {name}", "",
          f"- **Group:** {c['group']} · **module:** {c.get('module', '—')} · **principle:** {c.get('principle', '—')}",
          "- **Reviewers:** TCM clinical reviewer (all sections), pharmacy reviewer (Formulas), physician (Red-flag boundary). **Answer:** accept / reject / change, per section.",
          "- **Process:** [library expansion](../../../docs/post-mvp/design/library-expansion.md) §5. This page is derived from the proposal and the library as it is; nothing here is data of the knowledge base, and no weights exist yet.",
          "- **Weights below are the proposal's, used as written** (required-any: " + (", ".join(n["required_any"]) or "none") + "). They show how the library would receive the pattern; they are not a decision.", ""]
    if c.get("notes"):
        md += ["**Proposer's notes:** " + str(c["notes"]).strip(), ""]

    # ── sources ──
    md += ["## 1. Sources", ""]
    src = c.get("sources") or {}
    rows = []
    for cid in src.get("citations") or []:
        q = lib.citations[cid]
        rows.append([f"`{cid}`", f"《{q['book']}》 {q.get('chapter', '')}", q["quote_zh_hant"][:200], "verified" if q.get("verified") else "NOT verified", q["source_path"]])
    md += [table(["Quotation", "Book", "Text", "Status", "Source file"], rows) if rows else "No classical quotation proposed. **A2 needs at least one verified quotation.**", ""]
    texts = src.get("textbooks") or []
    md += [table(["Textbook or modern source", "Note"], [[f"`{t['path']}`", t.get("note", "")] for t in texts]) if texts else "No textbook or modern source proposed. **A2 needs one, as a path under `reference/`.**", ""]

    # ── overlap ──
    md += ["## 2. Overlap with the patterns that exist", "",
           f"If the proposal were weighted as written, the typical patient of each pattern (every symptom of weight 2 or 3) scores as below for the other. Under **{admission.MARGIN:.0f} points** is flagged (A5): "
           "the pair then needs three separating questions (A6) or the proposal must change.", ""]
    mine = oracle.pattern_scores(with_n.patterns, typical_patient(n), lib.params)
    rows, flagged = [], []
    for b in lib.patterns:
        shared = sorted(set(n["weights"]) & set(b["weights"]))
        over = mine[n["id"]] - mine[b["id"]]
        back = oracle.pattern_scores(with_n.patterns, typical_patient(b), lib.params)
        under = back[b["id"]] - back[n["id"]]
        low = min(over, under)
        if shared or low < admission.MARGIN:
            rows.append((low, [f"`{b['id']}` {both(b['name'])}", f"{len(shared)}: {', '.join(shared)}" if shared else "—", f"{over:+.1f}", f"{under:+.1f}", "**under**" if low < admission.MARGIN - admission.EPSILON else ""]))
        if low < admission.MARGIN - admission.EPSILON:
            flagged.append(b["id"])
    md += [table(["Existing pattern", "Shared proposed symptoms", "Proposal's typical patient above it", "Its typical patient above the proposal", "Margin"], [r for _, r in sorted(rows, key=lambda t: t[0])]) if rows else "No symptom is shared with any pattern.",
           "", f"**{len(flagged)} pattern(s) under the margin:** {', '.join(f'`{b}`' for b in flagged) or 'none'}.", ""]

    # ── questions ──
    md += ["## 3. Questions", ""]
    rows, unasked = [], []
    for s, w in sorted(n["weights"].items(), key=lambda kv: (-kv[1], kv[0])):
        qs = [q["id"] for q in lib.questions if any(s in o["symptoms"] for o in q["options"])]
        label = (lib.symptoms.get(s) or (c.get("new_symptoms") or {}).get(s) or {}).get("zh-Hant", "")
        if s.startswith("S_") and not qs:
            unasked.append(s)
        rows.append([f"`{s}` {label}", w, ", ".join(qs) if qs else ("— (not asked: a question or an option is needed)" if s.startswith("S_") else "— (tongue or pulse)")])
    md += [table(["Proposed symptom", "Weight", "Asked by"], rows), ""]
    missing_most = 0
    if flagged:
        rows = []
        for b in flagged:
            found = admission.discriminating(with_n, n["id"], b)
            need = max(0, admission.MIN_DISCRIMINATING - len(found))
            missing_most = max(missing_most, need)
            rows.append([f"`{n['id']}` / `{b}`", len(found), ", ".join(found) or "—", need])
        md += ["Questions that separate each flagged pair (asked when a shared symptom is present, and offering a symptom that weighs at least two points differently):", "",
               table(["Pair", "Separating questions now", "Which", "Still needed (of 3)"], rows), ""]
    else:
        md += ["No pair is under the margin, so no separating questions are needed for the proposal as written.", ""]

    # ── red-flag boundary ──
    md += ["## 4. Red-flag boundary", "",
           "The assessment already shows the notice for every red flag, whatever the pattern. The physician decides which flags must also stand in front of this pattern (its page then says *see a doctor first* for them) — "
           "the ones ticked were proposed.", ""]
    proposed = set(c.get("red_flags") or [])
    rf = json.loads((DATA / "diagnosis" / "red-flags.json").read_text(encoding="utf-8"))["items"]
    md += [table(["", "Red flag", "Level", "Notice it triggers"], [["✔" if r["id"] in proposed else "", f"`{r['id']}` {both(r['text'])}", r["level"], NOTICE_OF[cell_of(r)]] for r in rf]), ""]
    if not proposed:
        md += ["**No red flag proposed. A10 needs a list, or the reason there is none.**", ""]

    # ── formulas ──
    md += ["## 5. Formulas", ""]
    rows = []
    for fid in c.get("formulas") or []:
        f = lib.formulas[fid]
        users = [p["id"] for p in lib.patterns if fid in p["formulas"]]
        rows.append([f"`{fid}` {both(f['name'])}", f["tier"], f["verification"]["composition_status"], ", ".join(users) or "—", "yes" if f["tier"] == "A" else "no"])
    md += [table(["Proposed formula", "Tier", "Verification", "Used by", "Visible in a release"], rows) if rows else "No formula in the library proposed.", ""]
    if c.get("new_formulas"):
        md += ["To be added to the library (herbs, source, K-14 verification, pharmacy review): " + "; ".join(f"{f.get('name')} ({f.get('source', 'source not given')})" for f in c["new_formulas"]), ""]
    if not any(lib.formulas[f]["tier"] == "A" for f in c.get("formulas") or []):
        md += ["**No tier-A formula is proposed, so a release would show diet, points and lifestyle only.** A8 accepts that with an explicit declaration and its reason; the tier is computed from the herbs and is never edited.", ""]
    neighbours = []
    for b in sorted(lib.patterns, key=lambda b: -len(set(n["weights"]) & set(b["weights"])))[:3]:
        if set(n["weights"]) & set(b["weights"]):
            neighbours += [f"`{f}` ({lib.formulas[f]['tier']}) of `{b['id']}`" for f in b["formulas"] if f not in (c.get("formulas") or [])]
    if neighbours:
        md += ["Formulas of the three patterns that share most with the proposal: " + ", ".join(neighbours) + ".", ""]

    # ── cost ──
    md += ["## 6. Cost", ""]
    new_syms = list((c.get("new_symptoms") or {}))
    new_questions = max(1 if unasked else 0, missing_most)
    avg_p = gzip_kb(lib.patterns) / len(lib.patterns)
    avg_q = gzip_kb(lib.questions) / len(lib.questions)
    avg_s = gzip_kb(list(lib.symptoms.values())) / len(lib.symptoms)
    estimate = avg_p + new_questions * avg_q + len(new_syms) * avg_s
    rows = [["Pattern entries", 1, f"{avg_p:.2f} KB", f"{avg_p:.2f} KB"],
            ["Questions (at least — the larger of one for the unasked symptoms and the most any flagged pair still needs)", new_questions, f"{avg_q:.2f} KB", f"{new_questions * avg_q:.2f} KB"],
            ["New symptoms", len(new_syms), f"{avg_s:.3f} KB", f"{len(new_syms) * avg_s:.2f} KB"]]
    md += [table(["Item", "Count", "Average gzip size of one now", "Added"], rows), "",
           f"**Estimated addition: {estimate:.1f} KB gzip** (the data of the entries only: guidance, formulas and quotations come on top). The budget is {SESSION_BUDGET_KB:.0f} KB per session"
           + (f"; the build measures {session_kb:.1f} KB today, so about {SESSION_BUDGET_KB - session_kb - estimate:.1f} KB would remain." if session_kb is not None else " (`node scripts/check-budgets.ts` prints the figure today; pass it as `--session-kb`).")
           + f" {len(unasked)} proposed symptom(s) are not asked by any question yet.", ""]
    md += ["## Decision", "", "- [ ] accept   - [ ] reject   - [ ] change — (what):", "", f"Reviewer: …   Date: …   (A record of this decision goes in `review/records/` as for any other area, [content review](../../../docs/content-review.md) §5.)", ""]
    return "\n".join(md)


def write(path: Path, out: Path = OUT, session_kb: float | None = None, lib: admission.Library | None = None) -> Path:
    lib = lib or default_library()
    c = load_candidate(path)
    bad = problems(c, lib)
    if bad:
        raise ValueError(f"{path}: " + "; ".join(bad))
    target = out / "dossiers" / f"{c['id']}.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(build(c, lib, session_kb=session_kb), encoding="utf-8")
    return target


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--session-kb", type=float, default=None, help="the per-session knowledge-base size the build measures today (node scripts/check-budgets.ts)")
    args = ap.parse_args(argv)
    lib = default_library()
    status = 0
    for f in args.files:
        try:
            p = write(f, args.out, args.session_kb, lib)
            print(f"dossier: {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}")
        except ValueError as e:
            print(f"dossier: {e}")
            status = 1
    return status


if __name__ == "__main__":
    sys.exit(main())
