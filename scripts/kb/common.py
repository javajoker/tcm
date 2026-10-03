"""Shared helpers for the knowledge-base build.

Everything here is deterministic: the same reference submodule commits and the same curated
tables always produce byte-identical data/*.json (keys sorted, no timestamps).
"""
from __future__ import annotations

import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

import yaml
from opencc import OpenCC

from .schemas import SCHEMA_VERSION

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "reference" / "sources"
DATA = ROOT / "data"
LIB = REF / "TCM-Library"
BOOKS = REF / "TCM-Ancient-Books"

_cc = OpenCC("s2twp")

# Post-conversion fixes. OpenCC's Taiwan profile is a general-purpose one; these are TCM-specific.
_POST = [
    ("裏", "裡"),   # 表裡 (Taiwan orthography)
    ("于", "於"),   # classical 於 (no surnames occur in the quoted passages)
]


def tw(text: str) -> str:
    """Simplified -> Traditional (Taiwan), with TCM post-fixes."""
    out = _cc.convert(text)
    for a, b in _POST:
        out = out.replace(a, b)
    return out


@lru_cache(maxsize=None)
def read_lib(rel: str) -> str:
    """Read a UTF-8 file under reference/sources/TCM-Library."""
    return (LIB / rel).read_text(encoding="utf-8")


@lru_cache(maxsize=None)
def read_book(filename_prefix: str) -> str:
    """Read a GB18030-encoded book from TCM-Ancient-Books by its numeric prefix (e.g. '494')."""
    matches = sorted(BOOKS.glob(f"{filename_prefix}-*.txt"))
    matches = [m for m in matches if m.suffix == ".txt" and "baiduyun" not in m.name]
    if not matches:
        raise FileNotFoundError(f"No book with prefix {filename_prefix}")
    return matches[0].read_bytes().decode("gb18030")


def book_path(filename_prefix: str) -> str:
    matches = sorted(BOOKS.glob(f"{filename_prefix}-*.txt"))
    return str(matches[0].relative_to(ROOT))


def norm_ws(s: str) -> str:
    """Remove whitespace that line-wrapping may have inserted inside a quotation."""
    return re.sub(r"\s+", "", s)


def submodule_commits() -> dict[str, str]:
    """Pinned commits of the reference submodules (for provenance records)."""
    out: dict[str, str] = {}
    res = subprocess.run(["git", "submodule", "status"], cwd=ROOT, capture_output=True, text=True, check=True)
    for line in res.stdout.splitlines():
        parts = line.strip().split()
        if len(parts) >= 2:
            out[Path(parts[1]).name] = parts[0].lstrip("+-U")
    return out


def front_matter(md: str) -> tuple[dict, str]:
    """Split a TCM-Library entry into (YAML front matter, body)."""
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", md, re.S)
    if not m:
        raise ValueError("no front matter")
    return yaml.safe_load(m.group(1)), m.group(2)


def dump(path: Path, obj) -> None:
    """Write deterministic UTF-8 JSON (sorted keys, 2-space indent, trailing newline). Stamps `_meta.schema` (the data schema version)."""
    if isinstance(obj, dict) and isinstance(obj.get("_meta"), dict):
        obj = {**obj, "_meta": {**obj["_meta"], "schema": SCHEMA_VERSION}}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def i18n(zh: str, en: str, **extra) -> dict:
    return {"zh-Hant": zh, "en": en, **extra}
