"""Simplified Chinese for display (docs/post-mvp/design/simplified-chinese.md).

The Traditional data is the only authored Chinese and is what the engine and the safety rules always run on. This module derives the Simplified
forms of its strings, for display only:

  · `Converter`  — one string: exact override → source Simplified text (when it round-trips) → phrase overrides + OpenCC `tw2sp`;
  · `collect`    — every Chinese string (values and dictionary keys) of the data files, with a flag for the fields that keep a source script;
  · `build_dictionary` — Traditional string → Simplified string for all of them (identity where nothing changes), deterministic;
  · `convert_catalogs` — the zh-Hans UI catalogues, generated from the zh-Hant ones.

Everything is deterministic: the same inputs give byte-identical outputs.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from opencc import OpenCC

from scripts.kb.common import tw

ROOT = Path(__file__).resolve().parents[2]
I18N = ROOT / "scripts" / "i18n"
OVERRIDES = I18N / "hans-overrides.json"
DICTIONARY = I18N / "zh-Hans.dictionary.json"
DATA = ROOT / "data"
CATALOGS = ROOT / "apps" / "web" / "src" / "i18n"
SCHEMA = 1

CJK = re.compile(r"[㐀-鿿豈-﫿\U00020000-\U0002FA1F]")

# Fields that keep a source script or a path on purpose (the same set `validate_kb` exempts, plus the Simplified search aliases of the city list): their strings are
# never displayed through the dictionary and map to themselves.
SOURCE_KEYS = {"quote_source_zh_hans", "source_path", "repo_path", "book_path", "anchor", "path", "page", "alt_hans"}

_tw2sp = OpenCC("tw2sp")
_t2s = OpenCC("t2s")


def is_traditional_only(ch: str) -> bool:
    """A character that has a different Simplified form: it must not appear in Simplified text (the purity rule)."""
    return _t2s.convert(ch) != ch


def purity_hits(text: str, keep: frozenset[str] = frozenset()) -> list[str]:
    """The Traditional-only characters of a Simplified string (empty when the whole string is on the keep list)."""
    if text in keep:
        return []
    return sorted({c for c in text if CJK.match(c) and is_traditional_only(c)})


@dataclass(frozen=True)
class Result:
    text: str
    rule: str  # keep · exact · key · source · phrase · opencc · unchanged


class Converter:
    """Traditional → Simplified for display, with the reviewed overrides applied."""

    def __init__(self, overrides: dict | None = None) -> None:
        o = overrides if overrides is not None else json.loads(OVERRIDES.read_text(encoding="utf-8"))
        self.phrases: dict[str, str] = {k: v["to"] for k, v in o.get("phrases", {}).items()}
        self.exact: dict[str, str] = {k: v["to"] for k, v in o.get("exact", {}).items()}
        self.keys: dict[str, str] = {k: v["to"] for k, v in o.get("keys", {}).items()}
        self.keep: frozenset[str] = frozenset(o.get("keep", {}))
        names = sorted(self.phrases, key=lambda p: (-len(p), p))
        self._split = re.compile("(" + "|".join(re.escape(n) for n in names) + ")") if names else None

    def convert(self, text: str, source: str | None = None, key: str | None = None) -> Result:
        if key is not None and key in self.keys:
            return Result(self.keys[key], "key")
        if text in self.keep:
            return Result(text, "keep")
        if text in self.exact:
            return Result(self.exact[text], "exact")
        if source is not None and tw(source) == text:
            return Result(source, "source")
        if self._split is None:
            out = _tw2sp.convert(text)
            return Result(out, "unchanged" if out == text else "opencc")
        parts = self._split.split(text)
        used = len(parts) > 1
        out = "".join(self.phrases[p] if i % 2 else _tw2sp.convert(p) for i, p in enumerate(parts))
        return Result(out, "phrase" if used else ("unchanged" if out == text else "opencc"))


def overrides_digest() -> str:
    return hashlib.sha256(OVERRIDES.read_bytes()).hexdigest()


# ── the data ────────────────────────────────────────────────────────────────

def data_files() -> list[Path]:
    return sorted(p for p in DATA.rglob("*.json") if "schema" not in p.relative_to(DATA).parts)


def _walk(node, key: str = "") -> Iterator[tuple[str, bool]]:
    """(string, exempt) for every Chinese-bearing value and dictionary key under `node`. `exempt` marks a source-script or path field."""
    if isinstance(node, str):
        if CJK.search(node):
            yield node, key in SOURCE_KEYS or key.endswith("_hans")
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v, key)
    elif isinstance(node, dict):
        for k, v in node.items():
            if CJK.search(k):
                yield k, False
            yield from _walk(v, k)


def collect(files: list[Path] | None = None) -> dict[str, bool]:
    """Every Chinese string of the data → exempt?  A string that appears anywhere as ordinary text is not exempt."""
    out: dict[str, bool] = {}
    for f in files if files is not None else data_files():
        for s, exempt in _walk(json.loads(f.read_text(encoding="utf-8"))):
            out[s] = out.get(s, True) and exempt
    return out


def source_map() -> dict[str, str]:
    """Traditional quotation → the Simplified source text it was converted from (the exact text exists for the citations)."""
    cites = json.loads((DATA / "citations.json").read_text(encoding="utf-8"))["items"]
    return {c["quote_zh_hant"]: c["quote_source_zh_hans"] for c in cites if "quote_source_zh_hans" in c}


def build_dictionary(conv: Converter, strings: dict[str, bool], sources: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    """(dictionary, rule per string). Exempt strings map to themselves."""
    entries: dict[str, str] = {}
    rules: dict[str, str] = {}
    for s in sorted(strings):
        if strings[s]:
            entries[s], rules[s] = s, "exempt"
        else:
            r = conv.convert(s, source=sources.get(s))
            entries[s], rules[s] = r.text, r.rule
    return entries, rules


def serialize_dictionary(entries: dict[str, str], rules: dict[str, str]) -> str:
    """One entry per line, sorted by the Traditional string: a diff reads as the list of changed words."""
    changed = sum(1 for k, v in entries.items() if k != v)
    meta = {"schema": SCHEMA, "converter": "OpenCC tw2sp", "overrides": overrides_digest(), "strings": len(entries), "changed": changed}
    lines = [f"    {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}" for k, v in entries.items()]
    return "{\n  \"_meta\": " + json.dumps(meta, ensure_ascii=False) + ",\n  \"entries\": {\n" + ",\n".join(lines) + "\n  }\n}\n"


def load_dictionary(path: Path = DICTIONARY) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8"))["entries"]


# ── the UI catalogues ───────────────────────────────────────────────────────

def convert_catalogs(conv: Converter) -> dict[str, str]:
    """namespace file name → serialized zh-Hans catalogue, from the zh-Hant ones (same keys, same order, parameters and tags untouched)."""
    out: dict[str, str] = {}
    for f in sorted((CATALOGS / "zh-Hant").glob("*.json")):
        src = json.loads(f.read_text(encoding="utf-8"))
        dst = {}
        for key, msg in src.items():
            if isinstance(msg, str):
                dst[key] = conv.convert(msg, key=key).text
            else:
                dst[key] = {form: conv.convert(text, key=key).text for form, text in msg.items()}
        out[f.name] = json.dumps(dst, ensure_ascii=False, indent=2) + "\n"
    return out
