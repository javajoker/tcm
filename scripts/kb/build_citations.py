"""Build data/citations.json: verified quotation registry."""
from __future__ import annotations

import re
from pathlib import Path

from .common import DATA, ROOT, book_path, dump, norm_ws, read_book, read_lib, tw
from .curated.citations import CITATIONS


def _lib_header(text: str) -> str:
    first = text.splitlines()[0]
    m = re.match(r"#\s*\w+\s+(.+?)（第\s*(\d+)\s*篇", first)
    return m.group(1) if m else first.lstrip("# ")


BOOK_NAMES = {"suwen": "素問", "lingshu": "靈樞", "nanjing": "難經", "shanghan": "傷寒論", "jingui": "金匱要略"}


def build() -> list[dict]:
    out: list[dict] = []
    for cid, source, quote in CITATIONS:
        entry: dict = {"id": cid, "quote_zh_hant": tw(quote), "quote_source_zh_hans": quote}
        if source.startswith("lib:"):
            rel = "raw/" + source[4:]
            text = read_lib(rel)
            code = cid.split("-")[0]
            entry.update({
                "book": BOOK_NAMES[code],
                "chapter": tw(_lib_header(text)),
                "source_path": f"reference/sources/TCM-Library/{rel}",
                "source_repo": "TCM-Library (MIT)",
            })
            if code == "shanghan":
                entry["clause_no"] = int(cid.split("-")[1])
                entry["clause_no_verified"] = False
        else:
            prefix, book, chapter = source[5:].split("|")
            text = read_book(prefix)
            entry.update({
                "book": book, "chapter": chapter,
                "source_path": book_path(prefix),
                "source_repo": "TCM-Ancient-Books (no upstream licence: reference only)",
            })
        entry["verified"] = norm_ws(quote) in norm_ws(text)
        out.append(entry)
    out.sort(key=lambda e: e["id"])
    return out


def main() -> list[dict]:
    items = build()
    bad = [e["id"] for e in items if not e["verified"]]
    dump(DATA / "citations.json", {
        "_meta": {
            "description": "Registry of quotations cited by the SOP and knowledge base. Every quote is checked against the source text.",
            "count": len(items), "verified": len(items) - len(bad), "unverified": bad,
            "note": "shanghan-NNN ids carry the standard Song-edition clause number; the number is not verified against the data.",
        },
        "items": items,
    })
    print(f"citations: {len(items)} entries, {len(items) - len(bad)} verified" + (f", UNVERIFIED: {bad}" if bad else ""))
    return items


if __name__ == "__main__":
    main()
