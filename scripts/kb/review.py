"""Review records → what is reviewed (task K-16, docs/content-review.md §5).

A *review record* (`review/records/*.yaml`) states that one reviewer, in one role, accepted a set of *units* of the knowledge base: items of a data list (a pattern, a formula, a
safety rule …) or a whole file. Each unit is named with the **content hash** it had when it was reviewed. The build compares that hash with the unit's hash now:

  * equal  → the review still holds (`current`);
  * different → the content changed after the review: the review no longer counts (`stale`), and the unit's status stays `curated-draft` / `draft` — the data builders regenerate every
    status from the curated tables, so "reset on change" needs no extra step.

`status: reviewed` is set by `build_review` only, for a unit whose valid, current records satisfy the roles required for its file (a physician **and** a second reviewer for red flags and
safety rules; TCM clinical **and** pharmacy for formulas and herbs …) — never by hand; `validate_kb` fails if anything says `reviewed` that no record supports.

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

# Which lists of a file are reviewable item by item, and which field names an item. Files not listed here can only be reviewed as a whole (unit "*").
UNITS: dict[str, list[tuple[str, str | tuple[str, ...]]]] = {
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
    "formulas/formulas.json": [("items", "id")],
    "glossary.json": [("items", ("domain", "zh-Hant"))],        # the same term can occur in two domains (火)
    "herbs/herbs.json": [("items", "id")],
    "safety/emergency.json": [("regions", "id")],
    "safety/rules.json": [("rules", "id")],
}

# The roles a unit's file needs before it counts as reviewed: every group must be matched by at least one valid, current record of a role in the group (content review §2, §7).
PHYSICIAN_AND_SECOND = [{"physician"}, {"pharmacy", "tcm-clinical"}]
REQUIRED_ROLES: dict[str, list[set[str]]] = {
    "diagnosis/red-flags.json": PHYSICIAN_AND_SECOND, "safety/rules.json": PHYSICIAN_AND_SECOND, "config/scope-profiles.json": PHYSICIAN_AND_SECOND, "safety/emergency.json": [{"physician"}],
    "formulas/formulas.json": [{"tcm-clinical"}, {"pharmacy"}], "herbs/herbs.json": [{"tcm-clinical"}, {"pharmacy"}], "treatment/guidance.json": [{"tcm-clinical"}, {"pharmacy"}],
    "glossary.json": [{"linguistic"}],
}
DEFAULT_REQUIRED: list[set[str]] = [{"tcm-clinical"}]


def required_roles(rel: str) -> list[set[str]]:
    return REQUIRED_ROLES.get(rel, DEFAULT_REQUIRED)


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


def units_of(rel: str, data: Any) -> dict[str, str]:
    """unit id → content hash for one data file: every item of its reviewable lists, and the whole file as "*"."""
    out = {WHOLE_FILE: unit_hash(data, whole_file=True)}
    for key, id_field in UNITS.get(rel, []):
        for item in data.get(key, []):
            uid = uid_of(item, id_field)
            if uid in out:
                raise ValueError(f"{rel}: the unit id {uid!r} appears twice")
            out[uid] = unit_hash(item)
    return out


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
    """The problems of one record (empty = valid). `units` is `{file: {unit: hash}}` of the current data: scope must name files and units that exist."""
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
            out.append(f"{where}: scope names the file {f!r}, which is not in data/")
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

def compile_records(records: list[tuple[str, Any]], data: dict[str, Any]) -> dict[str, Any]:
    """The contents of data/review/records.json plus the units to mark reviewed (`reviewed_units`: `{file: set(unit ids)}`, not written)."""
    units = {rel: units_of(rel, d) for rel, d in data.items()}
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
        if all(roles & group for group in required_roles(rel)):
            reviewed_units.setdefault(rel, set()).add(uid)
            reviewed_list.append({"file": rel, "unit": uid, "hash": units[rel][uid], "records": sorted(r["id"] for r in recs)})
    coverage = {rel: {"units": len(u) - 1, "reviewed": len([x for x in reviewed_units.get(rel, set()) if x != WHOLE_FILE]), "whole_file_reviewed": WHOLE_FILE in reviewed_units.get(rel, set()),
                      "required_roles": [sorted(g) for g in required_roles(rel)]} for rel, u in sorted(units.items())}
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
        d = json.loads(json.dumps(data[rel]))
        touched = False
        if WHOLE_FILE in wanted and isinstance(d.get("_meta"), dict) and "status" in d["_meta"]:
            d["_meta"]["status"] = "reviewed"; touched = True
        for key, id_field in UNITS.get(rel, []):
            for item in d.get(key, []):
                if uid_of(item, id_field) in wanted and "status" in item:
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
        for key, id_field in UNITS.get(rel, []):
            for item in d.get(key, []):
                if item.get("status") == "reviewed":
                    out.setdefault(rel, set()).add(uid_of(item, id_field))
    return out
