"""Build the Simplified Chinese display dictionary and the zh-Hans UI catalogues (docs/post-mvp/design/simplified-chinese.md §5.1).

    .venv/bin/python -m scripts.i18n.build_hans            # write scripts/i18n/zh-Hans.dictionary.json, apps/web/src/i18n/zh-Hans/*.json and the assistant's wording rules
                                                           # (packages/ai/src/generated/wording.json, scripts/i18n/ai_wording.py)
    .venv/bin/python -m scripts.i18n.build_hans --check    # exit 1 if the committed files differ from what the build produces (CI)

Deterministic: no timestamps, sorted keys. Run it after any change to data/, to the zh-Hant catalogues or to hans-overrides.json.
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

from . import ai_wording, hans


def outputs() -> tuple[dict[Path, str], Counter]:
    conv = hans.Converter()
    entries, rules = hans.build_dictionary(conv, hans.collect(), hans.source_map())
    files: dict[Path, str] = {hans.DICTIONARY: hans.serialize_dictionary(entries, rules)}
    for name, text in hans.convert_catalogs(conv).items():
        files[hans.CATALOGS / "zh-Hans" / name] = text
    files[ai_wording.OUTPUT] = ai_wording.build(conv)
    files[ai_wording.RED_FLAGS_OUTPUT] = ai_wording.build_red_flags(conv)
    return files, Counter(rules.values())


def main(argv: list[str]) -> int:
    files, rules = outputs()
    if "--check" in argv:
        stale = [p for p, text in files.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            for p in stale:
                print(f"stale: {p.relative_to(hans.ROOT)}", file=sys.stderr)
            print("run: .venv/bin/python -m scripts.i18n.build_hans", file=sys.stderr)
            return 1
        print(f"zh-Hans: {len(files)} files up to date")
        return 0
    for p, text in files.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    print(f"zh-Hans: wrote {len(files)} files; dictionary rules " + ", ".join(f"{k} {v}" for k, v in sorted(rules.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
