"""Check relative links and heading anchors in the repository's Markdown files.

    python3 scripts/check_doc_links.py            # exit 1 if any link is broken

Skips external links and anything under reference/sources, node_modules and .venv.
Anchor slugs follow GitHub's rule (lower-case, punctuation removed, spaces -> hyphens; CJK kept).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = ("reference/sources", "node_modules", ".venv", "/dist/")
LINK = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
FENCE = re.compile(r"^\s*```")


def slug(heading: str) -> str:
    text = re.sub(r"`([^`]*)`", r"\1", heading)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = text.strip().lower()
    text = re.sub(r"[^\w\- ]", "", text, flags=re.UNICODE)
    return text.replace(" ", "-")


def anchors(path: Path) -> set[str]:
    seen: dict[str, int] = {}
    out: set[str] = set()
    in_fence = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = HEADING.match(line)
        if m:
            s = slug(m.group(2))
            n = seen.get(s, 0)
            seen[s] = n + 1
            out.add(s if n == 0 else f"{s}-{n}")
    return out


def main() -> int:
    files = [p for p in ROOT.rglob("*.md") if not any(s in p.as_posix() for s in SKIP)]
    cache: dict[Path, set[str]] = {}
    problems: list[str] = []
    for f in sorted(files):
        in_fence = False
        for no, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if FENCE.match(line):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            for target in LINK.findall(line):
                if re.match(r"^(https?:|mailto:|#$)", target):
                    continue
                path_part, _, frag = target.partition("#")
                dest = f if path_part == "" else (f.parent / path_part).resolve()
                rel = f.relative_to(ROOT)
                if not dest.exists():
                    problems.append(f"{rel}:{no}: missing file {target}")
                    continue
                if frag and dest.suffix == ".md":
                    cache.setdefault(dest, anchors(dest))
                    if frag.lower() not in cache[dest]:
                        problems.append(f"{rel}:{no}: missing anchor #{frag} in {dest.relative_to(ROOT)}")
    for p in problems:
        print(p)
    print(f"{len(files)} files checked, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
