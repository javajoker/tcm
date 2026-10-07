"""Build data/sources.json — the sources registry (PM-35) — and docs/kb-sources.md, the coverage report generated from it.

The registry lists every work the knowledge base draws on or, by its design, should draw on (`curated/sources.py`). The build adds the
corpus edition's metadata (tcm-mkg's catalogue of TCM-Ancient-Books), checks that every corpus path exists, and counts how the data uses
each work: its quotations (citations.json) and the references from the other data files — a `book` field naming it, a path into its
corpus files, the id of one of its quotations, a marker of a standard. A `book` name or a corpus path that names no registered work is
listed in `_meta.unresolved`, which the validator rejects.

Run after every other data builder: the counts read their output.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .common import BOOKS, DATA, LIB, REF, ROOT, dump, tw
from .curated.sources import DOMAINS, SOURCES

REPORT = ROOT / "docs" / "kb-sources.md"
CATALOGUE = REF / "tcm-mkg" / "data" / "classical_books.json"
NO_BOOK = {"—", ""}
SKIP = ("schema/", "review/")


def corpus_catalogue() -> dict[str, dict]:
    """TCM-Ancient-Books file prefix → the edition's metadata, converted to Traditional."""
    out: dict[str, dict] = {}
    for row in json.loads(CATALOGUE.read_text(encoding="utf-8")):
        prefix = row["source_file"].split("-", 1)[0]
        # the title is not kept: the registry's own title is the reference (OpenCC turns 景岳 into 景嶽 and 集注 into 集註)
        out[prefix] = {k: tw(row[f]) if row.get(f) else None for k, f in (("author", "author"), ("dynasty", "dynasty"), ("year", "year_text"), ("category", "category"))}
    return out


def _book_file(prefix: str) -> Path | None:
    matches = sorted(BOOKS.glob(f"{prefix}-*.txt"))
    return matches[0] if matches else None


def _clean(name: str) -> str:
    return name.strip().replace("《", "").replace("》", "")


def _walk(node: Any, key: str | None, visit) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            _walk(v, k, visit)
    elif isinstance(node, list):
        for v in node:
            _walk(v, key, visit)
    elif isinstance(node, str):
        visit(key, node)


def load_data(data_dir: Path = DATA) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for p in sorted(data_dir.rglob("*.json")):
        rel = p.relative_to(data_dir).as_posix()
        if rel.startswith(SKIP) or rel == "sources.json":
            continue
        out[rel] = json.loads(p.read_text(encoding="utf-8"))
    return out


def build(data: dict[str, Any] | None = None) -> dict:
    data = load_data() if data is None else data
    catalogue = corpus_catalogue()
    by_name: dict[str, str] = {}
    for s in SOURCES:
        for name in [s["title"], *s["names"]]:
            assert by_name.setdefault(_clean(name), s["id"]) == s["id"], f"sources: the name {name} is given to two works"
    lib_paths = sorted(((f"reference/sources/TCM-Library/{p}", s["id"]) for s in SOURCES for p in s["lib"]), key=lambda t: -len(t[0]))
    book_ids = {s["book"]: s["id"] for s in SOURCES if s["book"]}

    def by_path(path: str) -> str | None:
        m = re.match(r"reference/sources/TCM-Ancient-Books/(\d{3})-", path)
        if m:
            return book_ids.get(m.group(1))
        for prefix, sid in lib_paths:
            if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix + "_"):
                return sid
        return None

    citations = data["citations.json"]["items"]
    quotation_of: dict[str, str] = {}
    quotations: Counter = Counter()
    unresolved: list[dict] = []
    for c in citations:
        sid = by_name.get(_clean(c["book"]))
        if sid is None:
            unresolved.append({"file": "citations.json", "value": c["book"]})
            continue
        quotation_of[c["id"]] = sid
        quotations[sid] += 1

    markers = [(m, s["id"]) for s in SOURCES for m in s["markers"]]
    refs: dict[str, Counter] = defaultdict(Counter)
    for rel, doc in sorted(data.items()):
        if rel == "citations.json":
            continue

        def visit(key: str | None, value: str, rel: str = rel) -> None:
            if key == "book" and value not in NO_BOOK:
                sid = by_name.get(_clean(value))
                if sid is None:
                    unresolved.append({"file": rel, "value": value})
                else:
                    refs[sid][rel] += 1
            if value.startswith("reference/sources/"):
                sid = by_path(value)
                if sid is None:
                    unresolved.append({"file": rel, "value": value})
                else:
                    refs[sid][rel] += 1
            sid = quotation_of.get(value)
            if sid is not None:
                refs[sid][rel] += 1
            for marker, msid in markers:
                if marker in value:
                    refs[msid][rel] += 1

        _walk(doc, None, visit)

    items: list[dict] = []
    for s in SOURCES:
        corpus: list[dict] = []
        edition = None
        if s["book"]:
            f = _book_file(s["book"])
            corpus.append({"repo": "TCM-Ancient-Books", "path": f.relative_to(ROOT).as_posix() if f else f"reference/sources/TCM-Ancient-Books/{s['book']}-?", "exists": f is not None})
            meta = catalogue.get(s["book"])
            if meta:
                edition = dict(meta)
        for p in s["lib"]:
            corpus.append({"repo": "TCM-Library", "path": f"reference/sources/TCM-Library/{p}", "exists": (LIB / p).exists()})
        item = {
            "id": s["id"], "title": s["title"], "names": s["names"], "domains": s["domains"], "kind": s["kind"], "status": s["status"],
            "corpus": corpus, "edition": edition, "author": s["author"], "era": s["era"], "use": s["use"],
            "quotations": quotations.get(s["id"], 0), "references": dict(sorted(refs.get(s["id"], Counter()).items())),
        }
        item["drawn_on"] = bool(item["quotations"] or item["references"])
        items.append(item)

    in_corpus_categories = Counter(m["category"] for m in catalogue.values())
    drawn_categories = Counter(i["edition"]["category"] for i in items if i["edition"] and i["drawn_on"])
    registered_categories = Counter(i["edition"]["category"] for i in items if i["edition"])
    unresolved = sorted({(u["file"], u["value"]) for u in unresolved})
    return {
        "_meta": {
            "description": "Sources registry: every work the knowledge base draws on or, by its design, should draw on (docs/post-mvp/design/knowledge-base-v2.md), with "
                           "how the data uses it. Build-time only; never in the bundle.",
            "count": len(items),
            "drawn_on": sum(i["drawn_on"] for i in items),
            "status_counts": dict(sorted(Counter(i["status"] for i in items).items())),
            "domains": {k: {"zh-Hant": zh, "en": en} for k, (zh, en) in DOMAINS.items()},
            "corpus_categories": {c: {"books": n, "registered": registered_categories.get(c, 0), "drawn_on": drawn_categories.get(c, 0)}
                                  for c, n in sorted(in_corpus_categories.items(), key=lambda t: (-t[1], t[0]))},
            "unresolved": [{"file": f, "value": v} for f, v in unresolved],
        },
        "items": items,
    }


# ── the report ──────────────────────────────────────────────────────────────

def _edition(i: dict) -> str:
    e = i["edition"]
    if e and e["author"]:
        return f"{e['author']}（{e['dynasty']}）" if e["dynasty"] else e["author"]
    if i["author"]:
        return f"{i['author']}（{i['era']}）" if i["era"] else i["author"]
    return ""


def _uses(i: dict) -> str:
    parts = []
    if i["quotations"]:
        parts.append(f"{i['quotations']} quotation{'s' if i['quotations'] != 1 else ''}")
    for rel, n in i["references"].items():
        parts.append(f"`{rel}` {n}")
    return " · ".join(parts) or "—"


def render(registry: dict) -> str:
    meta, items = registry["_meta"], registry["items"]
    out: list[str] = []
    w = out.append
    w("# Knowledge-Base Sources and Coverage")
    w("")
    w("_Generated by `python3 -m scripts.kb.build_sources` from [`data/sources.json`](../data/sources.json) (the build runs it); do not edit by hand._")
    w("")
    w("Which works the knowledge base draws on, by domain, and which it does not draw on yet — the gap that [knowledge base v2](post-mvp/design/knowledge-base-v2.md) "
      "closes. A work is **drawn on** when the data quotes it or a record names it, points into its corpus files or cites one of its quotations. "
      "Works outside the corpus are listed so that a download can be asked for when a task needs one (decision PD-19); copyrighted modern references are a bibliography for "
      "reviewers and are never copied.")
    w("")
    sc = meta["status_counts"]
    w(f"**{meta['count']} works registered** — {sc.get('in-corpus', 0)} in the corpus, {sc.get('not-in-corpus', 0)} famous works the corpus lacks, "
      f"{sc.get('bibliography', 0)} standards and references outside it. **{meta['drawn_on']} are drawn on.** "
      f"Quotations: {sum(i['quotations'] for i in items)} from {sum(1 for i in items if i['quotations'])} works.")
    w("")
    w("## 1. By domain")
    w("")
    w("| Domain | Registered | Drawn on | Drawn on: works | In the corpus, not drawn on yet | Not in the corpus |")
    w("|---|---:|---:|---|---|---|")
    for key in DOMAINS:       # the curated order (the JSON's keys are sorted)
        label = meta["domains"][key]
        rows = [i for i in items if key in i["domains"]]
        drawn = [i for i in rows if i["drawn_on"]]
        idle = [i for i in rows if not i["drawn_on"] and i["status"] == "in-corpus"]
        absent = [i for i in rows if i["status"] == "not-in-corpus"]
        names = lambda xs: "、".join(i["title"] for i in xs) or "—"
        w(f"| {label['zh-Hant']} · {label['en'].split(':')[0]} | {len(rows)} | {len(drawn)} | {names(drawn)} | {names(idle)} | {names(absent)} |")
    w("")
    w("## 2. The corpus by its own category")
    w("")
    w("TCM-Ancient-Books, by the category of tcm-mkg's catalogue: how many books it holds, how many this registry names, how many the data draws on.")
    w("")
    w("| Category | Books in the corpus | Registered | Drawn on |")
    w("|---|---:|---:|---:|")
    for cat, c in sorted(meta["corpus_categories"].items(), key=lambda t: (-t[1]["books"], t[0])):
        w(f"| {cat} | {c['books']} | {c['registered']} | {c['drawn_on']} |")
    w("")
    w("## 3. Every registered work")
    w("")
    w("| Work | Domains | Kind | Corpus edition / author | How the data uses it | What it is for |")
    w("|---|---|---|---|---|---|")
    for i in items:
        if i["status"] != "in-corpus":
            continue
        doms = "、".join(meta["domains"][d]["zh-Hant"] for d in i["domains"])
        w(f"| {i['title']} | {doms} | {i['kind']} | {_edition(i)} | {_uses(i)} | {i['use'] or ''} |")
    w("")
    w("## 4. Famous works the corpus lacks")
    w("")
    w("Public domain; each is a download the owner approves first (filename, source and size stated when asked), and none is needed to start.")
    w("")
    w("| Work | Author | Domains | Why it matters |")
    w("|---|---|---|---|")
    for i in items:
        if i["status"] == "not-in-corpus":
            doms = "、".join(meta["domains"][d]["zh-Hant"] for d in i["domains"])
            note = i["use"] or ""
            if i["drawn_on"]:
                note += f" — named by the data: {_uses(i)}"
            w(f"| {i['title']} | {_edition(i)} | {doms} | {note} |")
    w("")
    w("## 5. Standards and modern references")
    w("")
    w("| Work | By | Kind | How the data uses it | Note |")
    w("|---|---|---|---|---|")
    for i in items:
        if i["status"] == "bibliography":
            w(f"| {i['title']} | {_edition(i)} | {i['kind']} | {_uses(i)} | {i['use'] or ''} |")
    w("")
    if meta["unresolved"]:
        w("## Unresolved")
        w("")
        for u in meta["unresolved"]:
            w(f"- `{u['file']}`: {u['value']}")
        w("")
    return "\n".join(out)


def main() -> dict:
    registry = build()
    dump(DATA / "sources.json", registry)
    REPORT.write_text(render(registry), encoding="utf-8")
    m = registry["_meta"]
    print(f"sources: {m['count']} works, {m['drawn_on']} drawn on" + (f", UNRESOLVED: {len(m['unresolved'])}" if m["unresolved"] else ""))
    return registry


if __name__ == "__main__":
    main()
