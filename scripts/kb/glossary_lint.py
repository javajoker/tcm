"""Glossary conformance for paired Chinese / English texts (the Python twin of checkGlossary in scripts/check-i18n.ts; K-12, K-13).

A glossary term of two or more characters in the Chinese text must be rendered with the glossary English, one of its accepted alternatives, or the parenthetical of the main English in the
English text; longer terms win over the terms inside them; an inflected ending (-s, -es, -ed, -ing, -al) is tolerated; hyphens, dashes and spaces are the same.
"""
from __future__ import annotations

import re
from typing import Any


def _norm(x: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[–—-]", " ", x.lower())).strip()


def english_forms(term: dict[str, Any]) -> list[str]:
    paren = re.search(r"\(([^)]*)\)", term["en"])
    forms = [term["en"], re.sub(r"\s*\(.*?\)", "", term["en"]), *( [paren.group(1)] if paren else []), *term.get("alt", [])]
    return list(dict.fromkeys(f for f in (_norm(x) for x in forms) if f))


def uses_form(text: str, forms: list[str]) -> bool:
    t = _norm(text)
    return any(re.search(rf"(^|[^a-z]){re.escape(f)}(s|es|ed|ing|al)?([^a-z]|$)", t) for f in forms)


def missing_terms(zh: str, en: str, glossary: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The glossary terms used in `zh` that `en` does not render."""
    out = []
    rest = zh
    for t in sorted((g for g in glossary if len(g["zh-Hant"]) >= 2), key=lambda g: -len(g["zh-Hant"])):
        if t["zh-Hant"] not in rest:
            continue
        rest = rest.replace(t["zh-Hant"], " ")
        if not uses_form(en, english_forms(t)):
            out.append(t)
    return out
