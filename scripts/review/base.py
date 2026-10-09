"""What every review pack is made of (tasks K-17, PM-57): the data and the review targets loaded once, Markdown helpers, the pack and its header."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.kb import oracle, review
from scripts.kb.common import DATA, ROOT
from scripts.kb.export_parity_cases import expected as oracle_expected
from scripts.kb.selftest_patterns import typical_patient


def zh(v: dict[str, Any] | None) -> str:
    return (v or {}).get("zh-Hant") or ""


def both(v: dict[str, Any] | None) -> str:
    """"zh-Hant · English" for a bilingual name; whichever exists otherwise."""
    if not v:
        return ""
    z, e = v.get("zh-Hant") or "", v.get("en") or ""
    return f"{z} · {e}" if z and e else z or e


def cell(x: Any) -> str:
    return str(x).replace("|", "\\|").replace("\n", " ")


def table(head: list[str], rows: list[list[Any]]) -> str:
    return "\n".join(["| " + " | ".join(head) + " |", "|" + "---|" * len(head), *("| " + " | ".join(cell(c) for c in r) + " |" for r in rows)]) + "\n"


def json_text(x: Any) -> str:
    return json.dumps(x, ensure_ascii=False)


def flat(node: Any, prefix: str = "") -> list[list[str]]:
    """A parameter tree as rows of (dotted path, value): numbers and short lists are read in a table, not as JSON."""
    if isinstance(node, dict) and node:
        return [r for k, v in node.items() if k != "_meta" for r in flat(v, f"{prefix}.{k}" if prefix else str(k))]
    return [[f"`{prefix}`", json_text(node) if isinstance(node, (dict, list)) else str(node)]]


class Context:
    """The data, the review targets outside data/ and the oracle's view of the data, loaded once per run."""

    def __init__(self, data_dir: Path = DATA, root: Path = ROOT) -> None:
        self.data = review.load_data(data_dir)
        self.targets = review.load_targets(root)
        self.fingerprint = review.kb_fingerprint(self.data)
        d = self.data
        self.patterns = d["diagnosis/patterns.json"]["items"]
        self.formulas = d["formulas/formulas.json"]["items"]
        self.herbs = {h["id"]: h for h in d["herbs/herbs.json"]["items"]}
        self.citations = {c["id"]: c for c in d["citations.json"]["items"]}
        self.symptoms = {s["id"]: s for s in d["diagnosis/symptoms.json"]["items"]}
        self.questions = d["diagnosis/questions.json"]["items"]
        self.rules = d["safety/rules.json"]
        self.scope = d["config/scope-profiles.json"]
        self.oracle_ctx = {"params": oracle.params(), "patterns": self.patterns, "elements": d["diagnosis/pattern-elements.json"]["items"],
                           "formulas": [f for f in self.formulas if f.get("mvp", True)], "herbs": self.herbs, "pool": oracle.modification_pool(self.herbs)}

    def typical(self, pattern_id: str) -> dict[str, Any]:
        p = next(x for x in self.patterns if x["id"] == pattern_id)
        findings = typical_patient(p)
        return {"findings": findings, "expect": oracle_expected(findings, self.oracle_ctx)}

    def units(self, rel: str, *ids: str) -> dict[str, str]:
        """unit → current hash of a data file or of a review target outside data/; only `ids` when given."""
        u = review.units_of(rel, self.data[rel]) if rel in self.data else review.units_of_target(self.targets[rel])
        return {i: u[i] for i in (ids or u.keys())}

    def symptom(self, sid: str) -> str:
        """A symptom id with its Traditional Chinese name, for a table cell."""
        s = self.symptoms.get(sid)
        return f"`{sid}` {s['zh-Hant']}" if s else f"`{sid}`"


class Pack:
    def __init__(self, area: str, title: str, reviewers: str, markdown: str, scope: list[tuple[str, dict[str, str]]], version: str | None = None) -> None:
        """`version`: what the record's `kb_version` names — the knowledge-base fingerprint unless the pack is about a target outside data/ (its whole-target hash)."""
        self.area, self.title, self.reviewers, self.markdown, self.scope, self.version = area, title, reviewers, markdown, scope, version


def header(ctx: Context, title: str, reviewers: str, what: list[str], version: str | None = None) -> str:
    stamp = (f"- **Version reviewed:** `{version}` (the hash of the whole text; put it in `kb_version` of the record)" if version
             else f"- **Knowledge-base fingerprint:** `{ctx.fingerprint}` (put it in `kb_version` of the record)")
    return "\n".join([
        f"# Review pack — {title}", "",
        stamp,
        f"- **Reviewers:** {reviewers}",
        "- **Process:** [content review](../../../docs/content-review.md) §4–§5. Decide each item; changes are applied to the curated tables, the knowledge base is rebuilt, and then the record names the hashes of the final content.",
        "- **What to look at:**", *[f"  - {w}" for w in what], "",
        "The *Engine behaviour* sections show what the app does with the data today; they are context for the decision, not part of what is reviewed.", "",
    ])


def cites(ctx: Context, ids: list[str]) -> str:
    out = []
    for cid in ids:
        c = ctx.citations.get(cid)
        out.append(f"- `{cid}` 《{c['book']}》 {c.get('chapter', '')} — {c['quote_zh_hant'][:160]}" if c else f"- `{cid}` (unknown)")
    return "\n".join(out) + ("\n" if out else "")


def cite(ctx: Context, cid: str | None) -> str:
    """One citation in a table cell: its id and where it is from."""
    if not cid:
        return "—"
    c = ctx.citations.get(cid)
    return f"`{cid}` 《{c['book']}》{c.get('chapter', '')}" if c else f"`{cid}` (unknown)"
