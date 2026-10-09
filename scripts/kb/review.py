"""Review records → what is reviewed (task K-16, docs/content-review.md §5).

A *review record* (`review/records/*.yaml`) states that one reviewer, in one role, accepted a set of *units* of the knowledge base: items of a data list (a pattern, a formula, a
safety rule …) or a whole file — or of a review target outside data/ (task PM-57): a page of the learning book or of the course, a namespace of the interface text. Each unit is
named with the **content hash** it had when it was reviewed. The build compares that hash with the unit's hash now:

  * equal  → the review still holds (`current`);
  * different → the content changed after the review: the review no longer counts (`stale`), and the unit's status stays `curated-draft` / `draft` — the data builders regenerate every
    status from the curated tables, so "reset on change" needs no extra step.

`status: reviewed` is set by `build_review` only, for a unit whose valid, current records satisfy the roles required for its file (a physician **and** a second reviewer for red flags and
safety rules; TCM clinical **and** pharmacy for formulas and herbs …) — never by hand; `validate_kb` fails if anything says `reviewed` that no record supports. A target outside data/
has no status field: it is covered in records.json, and whoever shows it reads its status from there (the learning book: packages/kb/node/book.ts).

This module is pure (it reads and returns data); `build_review` writes the files.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path
from typing import Any

import yaml

ROLES = ("tcm-clinical", "pharmacy", "physician", "linguistic", "legal")
OUTCOMES = ("accepted", "accepted-with-changes", "rejected", "deferred")
ACCEPTED = ("accepted", "accepted-with-changes")
WHOLE_FILE = "*"

# Which lists of a file are reviewable item by item, and which field names an item. Files not listed here can only be reviewed as a whole (unit "*"). A list given with None is a
# mapping (name → item): its units are named "<list>/<name>" (`acupoints/合谷`).
UNITS: dict[str, list[tuple[str, str | tuple[str, ...] | None]]] = {
    "citations.json": [("items", "id")],
    "diagnosis/constitution-items.json": [("types", "constitution")],
    "diagnosis/constitutions.json": [("items", "id")],
    "diagnosis/exclusions.json": [("groups", "id"), ("splits", "id")],
    "diagnosis/pattern-elements.json": [("items", "id")],
    "diagnosis/patterns.json": [("items", "id")],
    "diagnosis/pulse.json": [("pulses", "id"), ("positions", "id")],
    "diagnosis/questions.json": [("items", "id"), ("modules", "id")],
    "diagnosis/red-flags.json": [("items", "id")],
    "diagnosis/symptoms.json": [("items", "id")],
    "diagnosis/tongue.json": [("features", "id"), ("zones", "id")],
    "diagnosis/yingwei.json": [("dimensions", "id"), ("natures", None), ("questions", "id")],
    "formulas/formulas.json": [("items", "id")],
    "glossary.json": [("items", ("domain", "zh-Hant"))],        # the same term can occur in two domains (火)
    "herbs/dose-bands.json": [("items", "herb")],
    "herbs/herbs.json": [("items", "id")],
    "herbs/pairings.json": [("items", "id")],
    "herbs/processing.json": [("methods", "id")],
    "herbs/yinjing.json": [("channels", "channel")],
    "safety/emergency.json": [("regions", "id")],
    "safety/red-flag-terms.json": [("items", "id")],
    "safety/rules.json": [("rules", "id")],
    "treatment/guidance.json": [("acupoints", None), ("foods", None)],
    "treatment/mechanisms.json": [("items", "pattern")],
    "wuxing/correspondences.json": [("rows", "element")],
}

# Review targets outside data/ (content review §3), named by their directory: the learning book and the course, each Markdown page a unit (its text, UTF-8, line ends "\n"); and
# the interface text, each namespace of the message catalogs a unit (its Traditional Chinese and English messages — the Simplified catalog is generated from the Traditional one by
# `pnpm i18n:hans` and never edited; its word list has a review of its own, `pnpm i18n:review-hans`). "*" is the whole target, hashed over its units' hashes.
DOCUMENTS = ("docs/book/zh-Hant", "docs/course/zh-Hant")
CATALOGS = "apps/web/src/i18n"
CATALOG_LANGS = ("zh-Hant", "en")

# The roles a unit's file needs before it counts as reviewed: every group must be matched by at least one valid, current record of a role in the group (content review §2, §7).
PHYSICIAN_AND_SECOND = [{"physician"}, {"pharmacy", "tcm-clinical"}]
CLINICAL_AND_PHARMACY = [{"tcm-clinical"}, {"pharmacy"}]
REQUIRED_ROLES: dict[str, list[set[str]]] = {
    "diagnosis/red-flags.json": PHYSICIAN_AND_SECOND, "safety/red-flag-terms.json": PHYSICIAN_AND_SECOND, "safety/rules.json": PHYSICIAN_AND_SECOND, "config/scope-profiles.json": PHYSICIAN_AND_SECOND, "safety/emergency.json": [{"physician"}],
    "formulas/formulas.json": CLINICAL_AND_PHARMACY, "herbs/herbs.json": CLINICAL_AND_PHARMACY, "treatment/guidance.json": CLINICAL_AND_PHARMACY,
    # the prescription model's tables and the reference quantities (PM-57)
    "herbs/dose-bands.json": CLINICAL_AND_PHARMACY, "herbs/pairings.json": CLINICAL_AND_PHARMACY, "herbs/processing.json": CLINICAL_AND_PHARMACY, "herbs/yinjing.json": CLINICAL_AND_PHARMACY,
    "treatment/mechanisms.json": CLINICAL_AND_PHARMACY, "treatment/prescription.json": CLINICAL_AND_PHARMACY, "treatment/sanyin.json": CLINICAL_AND_PHARMACY,
    "diagnosis/symptoms.json": [{"tcm-clinical"}, {"linguistic"}], "diagnosis/questions.json": [{"tcm-clinical"}, {"linguistic"}],
    "wuxing/correspondences.json": [{"tcm-clinical"}, {"legal"}], "wuxing/engine-params.json": [{"tcm-clinical"}, {"legal"}], "wuxing/ganzhi.json": [{"tcm-clinical"}, {"legal"}],
    "wuxing/yunqi.json": [{"tcm-clinical"}, {"legal"}],
    "glossary.json": [{"linguistic"}], "safety/name-fold.json": [{"linguistic"}],
    "docs/book/zh-Hant": [{"linguistic"}, {"tcm-clinical"}], "docs/course/zh-Hant": [{"linguistic"}, {"tcm-clinical"}], CATALOGS: [{"linguistic"}, {"legal"}],
}
DEFAULT_REQUIRED: list[set[str]] = [{"tcm-clinical"}]
# Units that need more than their file: the notices (the `safety` namespace of the interface text) also need the physician (content review §2, §3) — and so does the whole
# interface text, which holds them.
UNIT_ROLES: dict[tuple[str, str], list[set[str]]] = {(CATALOGS, "safety"): [{"linguistic"}, {"legal"}, {"physician"}], (CATALOGS, WHOLE_FILE): [{"linguistic"}, {"legal"}, {"physician"}]}


def required_roles(rel: str, uid: str | None = None) -> list[set[str]]:
    return UNIT_ROLES.get((rel, uid or ""), REQUIRED_ROLES.get(rel, DEFAULT_REQUIRED))


# ── hashing ─────────────────────────────────────────────────────────────────

def _strip(node: Any, *, whole_file: bool) -> Any:
    """The content a review is about: the node without any status marker (a status is the *result* of review, not its subject)."""
    if isinstance(node, dict):
        out = {k: v for k, v in node.items() if k != "status"}
        if whole_file:
            out = {k: _strip_items(v) for k, v in out.items()}
            if isinstance(out.get("_meta"), dict):
                out["_meta"] = {k: v for k, v in out["_meta"].items() if k not in ("status", "status_counts")}
        return out
    return node


def _strip_items(v: Any) -> Any:
    if isinstance(v, list):
        return [({k: x for k, x in i.items() if k != "status"} if isinstance(i, dict) else i) for i in v]
    return v


def unit_hash(node: Any, *, whole_file: bool = False) -> str:
    """16 hex digits of the SHA-256 of the canonical JSON of the content (sorted keys, no whitespace, UTF-8) without status markers."""
    text = json.dumps(_strip(node, whole_file=whole_file), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def uid_of(item: dict[str, Any], id_field: str | tuple[str, ...]) -> str:
    """The unit id of a list item: its id field, or several fields joined with "/"."""
    return "/".join(str(item[f]) for f in id_field) if isinstance(id_field, tuple) else str(item[id_field])


def items_of(rel: str, data: Any) -> list[tuple[str, Any]]:
    """(unit id, item) for every item of a data file's reviewable lists, in file order."""
    out: list[tuple[str, Any]] = []
    for key, id_field in UNITS.get(rel, []):
        node = data.get(key, [])
        out += [(f"{key}/{name}", item) for name, item in node.items()] if id_field is None else [(uid_of(item, id_field), item) for item in node]
    return out


def units_of(rel: str, data: Any) -> dict[str, str]:
    """unit id → content hash for one data file: every item of its reviewable lists, and the whole file as "*"."""
    out = {WHOLE_FILE: unit_hash(data, whole_file=True)}
    for uid, item in items_of(rel, data):
        if uid in out:
            raise ValueError(f"{rel}: the unit id {uid!r} appears twice")
        out[uid] = unit_hash(item)
    return out


def text_hash(text: str) -> str:
    """16 hex digits of the SHA-256 of a page's text (UTF-8, line ends "\n")."""
    return hashlib.sha256(text.replace("\r\n", "\n").encode("utf-8")).hexdigest()[:16]


def target_hash(units: dict[str, str]) -> str:
    """The hash of a whole review target outside data/: over its units' hashes, `name:hash` lines in name order."""
    return hashlib.sha256("\n".join(f"{u}:{h}" for u, h in sorted(units.items())).encode("utf-8")).hexdigest()[:16]


def units_of_target(content: dict[str, Any]) -> dict[str, str]:
    """unit id → content hash for a review target outside data/ (a page's text; a namespace's messages), and the whole target as "*"."""
    units = {name: text_hash(c) if isinstance(c, str) else unit_hash(c) for name, c in sorted(content.items())}
    return {WHOLE_FILE: target_hash(units), **units}


def load_targets(root: Path) -> dict[str, dict[str, Any]]:
    """The review targets outside data/: the documents (page name → text) and the interface text (namespace → {language: messages})."""
    out: dict[str, dict[str, Any]] = {t: {p.name: p.read_text(encoding="utf-8") for p in sorted((root / t).glob("*.md"))} for t in DOCUMENTS}
    cat = root / CATALOGS
    out[CATALOGS] = {p.stem: {lang: json.loads((cat / lang / p.name).read_text(encoding="utf-8")) for lang in CATALOG_LANGS} for p in sorted((cat / CATALOG_LANGS[0]).glob("*.json"))}
    return out


def all_units(data: dict[str, Any], targets: dict[str, dict[str, Any]] | None = None) -> dict[str, dict[str, str]]:
    """`{file or target: {unit: hash}}` — what a record's scope may name."""
    return {rel: units_of(rel, d) for rel, d in data.items()} | {t: units_of_target(c) for t, c in (targets or {}).items()}


def kb_fingerprint(data: dict[str, Any]) -> str:
    """A version string for "the content that was reviewed": 12 hex digits over the whole-file hashes of every data file, in path order. A record's `kb_version` may carry it."""
    text = "\n".join(f"{rel}:{unit_hash(d, whole_file=True)}" for rel, d in sorted(data.items()))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def load_data(data_dir: Path) -> dict[str, Any]:
    """Every data file (relative path → parsed JSON), without the schemas and the review output itself."""
    out: dict[str, Any] = {}
    for p in sorted(data_dir.rglob("*.json")):
        rel = p.relative_to(data_dir).as_posix()
        if rel.startswith("schema/") or rel.startswith("review/"):
            continue
        out[rel] = json.loads(p.read_text(encoding="utf-8"))
    return out


# ── records ─────────────────────────────────────────────────────────────────

REQUIRED_FIELDS = ("id", "area", "scope", "reviewer", "date", "kb_version", "outcome")


def validate_record(rec: Any, units: dict[str, dict[str, str]], filename: str = "") -> list[str]:
    """The problems of one record (empty = valid). `units` is `{file: {unit: hash}}` of the current data and targets (`all_units`): scope must name files and units that exist."""
    where = f"{filename or rec.get('id', '?') if isinstance(rec, dict) else filename}"
    if not isinstance(rec, dict):
        return [f"{where}: a record must be a mapping"]
    out: list[str] = []
    for f in REQUIRED_FIELDS:
        if f not in rec:
            out.append(f"{where}: missing `{f}`")
    if out:
        return out
    if not re.fullmatch(r"REV-\d{4}-\d{4}", str(rec["id"])):
        out.append(f"{where}: id {rec['id']!r} must look like REV-2026-0001")
    rv = rec["reviewer"]
    if not isinstance(rv, dict) or rv.get("role") not in ROLES:
        out.append(f"{where}: reviewer.role must be one of {', '.join(ROLES)}")
    elif not str(rv.get("credential", "")).strip() or not str(rv.get("name", "")).strip():
        out.append(f"{where}: reviewer.name and reviewer.credential are required (a name may be \"(withheld)\" when consent was not given, never empty)")
    try:
        date.fromisoformat(str(rec["date"]))
    except ValueError:
        out.append(f"{where}: date {rec['date']!r} is not an ISO date (YYYY-MM-DD)")
    if rec["outcome"] not in OUTCOMES:
        out.append(f"{where}: outcome must be one of {', '.join(OUTCOMES)}")
    if not str(rec["kb_version"]).strip():
        out.append(f"{where}: kb_version (the version reviewed) is required")
    if rec["outcome"] == "accepted-with-changes" and not rec.get("changes"):
        out.append(f"{where}: accepted-with-changes must list the changes")
    for k in ("changes", "dissent"):
        if k in rec and not isinstance(rec[k], list):
            out.append(f"{where}: {k} must be a list")
    scope = rec["scope"]
    if not isinstance(scope, list) or not scope:
        out.append(f"{where}: scope must be a non-empty list of {{file, units}}")
        return out
    for entry in scope:
        f, claimed = (entry.get("file"), entry.get("units")) if isinstance(entry, dict) else (None, None)
        if f not in units:
            out.append(f"{where}: scope names the file {f!r}, which is not in data/ and not a review target ({', '.join((*DOCUMENTS, CATALOGS))})")
            continue
        if not isinstance(claimed, dict) or not claimed:
            out.append(f"{where}: {f}: units must map each unit id (or \"*\" for the whole file) to its content hash")
            continue
        for uid, h in claimed.items():
            if uid not in units[f]:
                out.append(f"{where}: {f}: there is no unit {uid!r}")
            elif not re.fullmatch(r"[0-9a-f]{16}", str(h)):
                out.append(f"{where}: {f}: the hash of {uid} must be 16 hex digits")
    return out


def load_records(records_dir: Path) -> list[tuple[str, Any]]:
    """(file name, parsed YAML) for every `*.yaml` record, in file-name order. A file that does not parse is returned as the error string."""
    out: list[tuple[str, Any]] = []
    for p in sorted(records_dir.glob("*.yaml")):
        try:
            out.append((p.name, yaml.safe_load(p.read_text(encoding="utf-8"))))
        except yaml.YAMLError as e:
            out.append((p.name, f"not valid YAML: {e}"))
    return out


# ── coverage ────────────────────────────────────────────────────────────────

def compile_records(records: list[tuple[str, Any]], data: dict[str, Any], targets: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    """The contents of data/review/records.json plus the units to mark reviewed (`reviewed_units`: `{file: set(unit ids)}`, not written). `targets`: the review targets outside
    data/ (`load_targets`); their units are covered in records.json only."""
    units = all_units(data, targets)
    compiled: list[dict[str, Any]] = []
    problems: list[str] = []
    ids: set[str] = set()
    by_unit: dict[tuple[str, str], list[dict[str, Any]]] = {}     # (file, unit) → current accepted records
    stale: list[dict[str, str]] = []
    for filename, rec in records:
        errs = [rec] if isinstance(rec, str) else validate_record(rec, units, filename)
        if isinstance(rec, dict) and rec.get("id") in ids:
            errs.append(f"{filename}: the id {rec['id']} is used twice")
        problems += [e if isinstance(rec, dict) else f"{filename}: {e}" for e in errs]
        if errs or not isinstance(rec, dict):
            continue
        ids.add(rec["id"])
        entry = {k: rec[k] for k in ("id", "area", "date", "kb_version", "outcome")} | {"reviewer": {"role": rec["reviewer"]["role"], "name": rec["reviewer"]["name"], "credential": rec["reviewer"]["credential"]},
                 "scope": [{"file": s["file"], "units": dict(sorted(s["units"].items()))} for s in rec["scope"]],
                 "changes": rec.get("changes", []), "dissent": rec.get("dissent", []), "notes": rec.get("notes", "")}
        compiled.append(entry)
        for s in rec["scope"]:
            for uid, h in s["units"].items():
                if rec["outcome"] not in ACCEPTED:
                    continue
                if units[s["file"]][uid] == h:
                    by_unit.setdefault((s["file"], uid), []).append(entry)
                else:
                    stale.append({"file": s["file"], "unit": uid, "record": rec["id"], "reviewed_hash": h, "current_hash": units[s["file"]][uid]})
    reviewed_units: dict[str, set[str]] = {}
    reviewed_list: list[dict[str, Any]] = []
    for (rel, uid), recs in sorted(by_unit.items()):
        roles = {r["reviewer"]["role"] for r in recs}
        if all(roles & group for group in required_roles(rel, uid)):
            reviewed_units.setdefault(rel, set()).add(uid)
            reviewed_list.append({"file": rel, "unit": uid, "hash": units[rel][uid], "records": sorted(r["id"] for r in recs)})
    coverage = {rel: {"units": len(u) - 1, "reviewed": len([x for x in reviewed_units.get(rel, set()) if x != WHOLE_FILE]), "whole_file_reviewed": WHOLE_FILE in reviewed_units.get(rel, set()),
                      "required_roles": [sorted(g) for g in required_roles(rel)]}
                | ({"unit_roles": {uid: [sorted(g) for g in roles] for (t, uid), roles in sorted(UNIT_ROLES.items()) if t == rel}} if any(t == rel for t, _ in UNIT_ROLES) else {})
                for rel, u in sorted(units.items())}
    return {
        "output": {"_meta": {"description": "Review records compiled from review/records/*.yaml (docs/content-review.md §5). `reviewed` lists the units whose valid, current records satisfy the roles their file needs; "
                                            "`stale` lists accepted units whose content changed after the review (they count for nothing until reviewed again). Written by the build; never edit.",
                             "count": len(compiled), "problems": len(problems), "status": "draft"},
                   "records": compiled, "reviewed": reviewed_list, "stale": sorted(stale, key=lambda s: (s["file"], s["unit"], s["record"])), "coverage": coverage},
        "reviewed_units": reviewed_units, "problems": problems,
    }


def apply_reviewed(data: dict[str, Any], reviewed_units: dict[str, set[str]]) -> dict[str, Any]:
    """The data with `status: "reviewed"` set on the covered units that carry a status field. Returns the files that changed (relative path → new content)."""
    changed: dict[str, Any] = {}
    for rel, wanted in reviewed_units.items():
        if rel not in data:                     # a review target outside data/: covered in records.json only
            continue
        d = json.loads(json.dumps(data[rel]))
        touched = False
        if WHOLE_FILE in wanted and isinstance(d.get("_meta"), dict) and "status" in d["_meta"]:
            d["_meta"]["status"] = "reviewed"; touched = True
        for uid, item in items_of(rel, d):
            if uid in wanted and isinstance(item, dict) and "status" in item:
                item["status"] = "reviewed"; touched = True
        if touched:
            if isinstance(d.get("_meta"), dict) and "status_counts" in d["_meta"]:       # the herbs file counts its statuses
                counts: dict[str, int] = {}
                for item in d.get("items", []):
                    counts[item["status"]] = counts.get(item["status"], 0) + 1
                d["_meta"]["status_counts"] = dict(sorted(counts.items()))
            changed[rel] = d
    return changed


def reviewed_by_status(data: dict[str, Any]) -> dict[str, set[str]]:
    """Every unit whose own status says `reviewed` (what a hand edit would look like), for validate_kb to compare with the records."""
    out: dict[str, set[str]] = {}
    for rel, d in data.items():
        if isinstance(d, dict) and isinstance(d.get("_meta"), dict) and d["_meta"].get("status") == "reviewed":
            out.setdefault(rel, set()).add(WHOLE_FILE)
        for uid, item in items_of(rel, d):
            if isinstance(item, dict) and item.get("status") == "reviewed":
                out.setdefault(rel, set()).add(uid)
    return out
