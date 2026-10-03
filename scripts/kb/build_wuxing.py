"""Build data/wuxing/*.json from the original text (parsed, not transcribed) plus verified tables."""
from __future__ import annotations

import re

from .common import DATA, dump, read_lib, tw

ELEMENT_OF_DIRECTION = {"东": "木", "南": "火", "中": "土", "西": "金", "北": "水"}
DIR_CITATION = {"木": "suwen-005-6", "火": "suwen-005-7", "土": "suwen-005-8", "金": "suwen-005-9", "水": "suwen-005-10"}
ELEMENTS = ["木", "火", "土", "金", "水"]
SEASON = {"木": "春", "火": "夏", "土": "長夏", "金": "秋", "水": "冬"}
FU = {"木": "膽", "火": "小腸", "土": "胃", "金": "大腸", "水": "膀胱"}
GENERATES = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"}
CONTROLS = {"木": "土", "土": "水", "水": "火", "火": "金", "金": "木"}


def parse_yinyang_yingxiang() -> dict[str, dict]:
    """Parse the five-direction passage of 《素問·陰陽應象大論》 into one record per element."""
    text = read_lib("raw/neijing/suwen/suwen_005.txt").replace("\n", "")
    out: dict[str, dict] = {}
    pattern = re.compile(r"(东|南|中|西|北)方生|中央生")
    starts = [(m.start(), m.group(0)) for m in re.finditer(r"东方生风|南方生热|中央生湿|西方生燥|北方生寒", text)]
    for i, (pos, head) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else text.index("故曰", pos)
        seg = text[pos:end]
        element = ELEMENT_OF_DIRECTION[head[0] if head[0] != "中" else "中"]
        def attr(label: str) -> str | None:
            m = re.search(rf"在{label}为([^，。；]+)", seg)
            return m.group(1) if m else None
        rec = {
            "element": element,
            "qi_in_heaven": attr("天"),        # 風 熱 濕 燥 寒
            "tissue": attr("体"),              # 筋 脈 肉 皮毛 骨
            "zang": attr("脏"),
            "color": attr("色"),
            "tone": attr("音"),
            "voice": attr("声"),
            "change": attr("变动"),
            "orifice_yinyang_yingxiang": attr("窍"),
            "flavor": attr("味"),
            "emotion": attr("志"),
        }
        # "X伤Y，Z胜X" relations (emotion / qi / flavour)
        rec["overcome_emotion"] = re.search(r"(.)胜" + re.escape(rec["emotion"] or "?"), seg).group(1) if rec["emotion"] and re.search(r"(.)胜" + re.escape(rec["emotion"]), seg) else None
        out[element] = rec
    return out


# 《素問·金匱真言論》 gives a different set of orifices for 心 and 腎 — recorded, not hidden.
ORIFICE_JINGUI = {"木": "目", "火": "耳", "土": "口", "金": "鼻", "水": "二陰"}
ORIFICE_JINGUI_CITATIONS = {"火": "suwen-004-3", "水": "suwen-004-4"}


def build_correspondences() -> dict:
    parsed = parse_yinyang_yingxiang()
    rows = []
    for e in ELEMENTS:
        p = parsed[e]
        zang = tw(p["zang"])
        rows.append({
            "element": e,
            "zang": zang,
            "fu": FU[e],
            "season": SEASON[e],
            "qi": tw(p["qi_in_heaven"]),
            "tissue": tw(p["tissue"]),
            "color": tw(p["color"]),
            "tone": tw(p["tone"]),
            "voice": tw(p["voice"]),
            "flavor": tw(p["flavor"]),
            "emotion": tw(p["emotion"]),
            "orifice": {"suwen-005-default": tw(p["orifice_yinyang_yingxiang"]), "suwen-004-alternative": ORIFICE_JINGUI[e]},
            "generates": GENERATES[e],
            "controls": CONTROLS[e],
            "source": DIR_CITATION[e],
            "status": "extracted-from-source",
        })
    return {
        "_meta": {
            "description": "Five-phase correspondences parsed from 《素問·陰陽應象大論》 (suwen_005). The orifices of 心 and 腎 differ in 《金匱真言論》 and both are kept.",
            "default_orifice_source": "suwen-005",
            "fu_and_season_note": "六腑 pairing and 長夏 are standard doctrine, not parsed from this passage.",
        },
        "rows": rows,
    }


def main() -> None:
    corr = build_correspondences()
    dump(DATA / "wuxing" / "correspondences.json", corr)
    print("wuxing/correspondences:", [(r["element"], r["zang"], r["flavor"], r["emotion"], r["orifice"]["suwen-005-default"]) for r in corr["rows"]])


if __name__ == "__main__":
    main()
