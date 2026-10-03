"""Build data/formulas/formulas.json.

For every formula:
  · resolve herbs to herb ids; relative proportions from the textbook-typical amounts;
  · role weights 君 1.0 / 臣 0.6 / 佐 0.35 / 使 0.15 → effective weights (《素問·至真要大論》 主病之謂君，佐君之謂臣，應臣之謂使);
  · aggregate panel effect and burden (Σ effective weight × herb effect / harm) — the vector the engine matches
    against a patient's deviation and edits when adding/removing herbs (加減);
  · tier A/B/C computed from the herbs (not hand-assigned), pregnancy and interaction flags;
  · verification: classical amounts PARSED from the original text for 經方; for 時方 every herb must be found near
    the formula heading in the named source book (reported as composition_check).
"""
from __future__ import annotations

import re
from collections import Counter

from opencc import OpenCC

from .common import DATA, LIB, ROOT, book_path, dump, norm_ws, read_book, submodule_commits, tw
from .curated.formulas import FORMULAS
from .curated.herbs import NAME_TO_LIB

ROLE_WEIGHT = {"君": 1.0, "臣": 0.6, "佐": 0.35, "使": 0.15}
ROLE_CITATIONS = ["suwen-074-10", "suwen-074-11"]
STRONG_HERB_SLUGS = {"mahuang", "fuzi"}
BITTER_COLD_SHARE_LIMIT = 0.45
PREG_ORDER = {"ok": 0, "ok-unreviewed": 1, "caution": 2, "avoid": 3}

_t2s = OpenCC("t2s")

# where the classical composition is found: (path relative to TCM-Library, anchor in Simplified text)
CLASSICAL = {
    "F_MAHUANG": ("library/fangji/jingfang/mahuangtang/mahuangtang_001.md", "麻黄三两"),
    "F_GUIZHI": ("library/fangji/jingfang/guizhitang/guizhitang_001.md", "桂枝三两"),
    "F_LIZHONG": ("library/fangji/jingfang/lizhongwan/lizhongwan_001.md", "人参（甘温）"),
    "F_HUANGLIANEJIAO": ("library/fangji/jingfang/huanglianejiaotang/huanglianejiaotang_001.md", "黄连四两"),
    "F_LINGGUIZHUGAN": ("library/fangji/jingfang/lingguizhugantang/lingguizhugantang_001.md", "茯苓四两"),
    "F_XIAOCHAIHU": ("library/fangji/jingfang/xiaochaihutang/xiaochaihutang_001.md", "柴胡半斤"),
    "F_SUANZAOREN": ("raw/jingui/jingui_06.txt", "酸枣仁二升"),
    "F_MAIMENDONG": ("raw/jingui/jingui_07.txt", "麦门冬七升"),
    "F_SHENQI": ("raw/jingui/jingui_22.txt", "干地黄八两"),
}
CLASSICAL_NOTE = {
    "F_SHENQI": "Parsed from 金匱要略 婦人雜病 (raw/jingui/jingui_22). TCM-Library entry shenqiwan_001's 原文 field starts with an unrelated 血痹 passage and is not used.",
}

# Herb-name synonyms between classical text, the formula table and the Pharmacopoeia (Simplified for matching).
SYN = {
    "黃耆": ["黄耆", "黄芪"], "芍藥": ["芍药", "白芍"], "橘紅": ["橘红", "陈皮", "橘皮"], "陳皮": ["陈皮", "橘皮", "橘红"],
    "生地黃": ["生地黄", "生地", "干地黄", "地黄"], "乾地黃": ["干地黄", "地黄"], "熟地黃": ["熟地黄", "熟地", "地黄"], "白朮": ["白术"],
    "蒼朮": ["苍术"], "白豆蔻": ["白蔻仁", "白豆蔻", "蔻仁", "白蔻", "豆蔻"], "沙參": ["沙参", "北沙参"], "麥冬": ["麦冬", "麦门冬", "麦门冬"],
    "川貝母": ["川贝母", "贝母"], "桔梗": ["桔梗", "苦梗", "苦桔梗"], "厚朴": ["厚朴", "浓朴", "川朴"], "山茱萸": ["山茱萸", "山萸肉", "萸肉"], "桑葉": ["桑叶", "冬桑叶"], "龍膽草": ["龙胆草", "龙胆", "胆草"], "茯神": ["茯神", "茯苓"], "乾薑": ["干姜", "炮姜"],
    "杏仁": ["杏仁", "苦杏仁"], "炙甘草": ["炙甘草", "甘草"], "荊芥穗": ["荆芥穗", "荆芥", "芥穗"], "淡豆豉": ["淡豆豉", "豆豉"],
    "蘆根": ["芦根", "苇根", "鲜苇根"], "枳殼": ["枳壳", "枳实"], "神曲": ["神曲", "神麴", "六神曲"], "大棗": ["大枣", "红枣", "枣"],
    "山藥": ["山药", "薯蓣", "薯蕷"], "川芎": ["川芎", "芎䓖", "穹穷", "芎穷", "芎藭"], "藿香": ["藿香", "广藿香"], "枸杞子": ["枸杞子", "枸杞"],
    "牡丹皮": ["牡丹皮", "丹皮"], "龍眼肉": ["龙眼肉", "桂圆肉", "龙眼"], "蓮子": ["莲子", "莲肉"], "白扁豆": ["白扁豆", "扁豆"],
    "玉竹": ["玉竹", "萎蕤", "葳蕤"], "天花粉": ["天花粉", "栝楼根", "瓜蒌根", "花粉"], "桂枝": ["桂枝"], "肉桂": ["肉桂", "桂心"],
    "黃柏": ["黄柏", "黄檗"], "遠志": ["远志"], "酸棗仁": ["酸枣仁", "枣仁"], "車前子": ["车前子"], "澤瀉": ["泽泻"], "柏子仁": ["柏子仁", "柏仁"],
    "半夏": ["半夏", "法半夏", "制半夏", "姜半夏"], "鹿角膠": ["鹿角胶"], "菟絲子": ["菟丝子"], "玄參": ["玄参"], "丹參": ["丹参"],
    "雞子黃": ["鸡子黄", "鸡子"], "粳米": ["粳米", "梗米"], "冰糖": ["冰糖", "白糖", "砂糖"], "生薑": ["生姜", "姜"], "金銀花": ["金银花", "银花"],
    "連翹": ["连翘"], "薏苡仁": ["薏苡仁", "苡仁", "薏仁"], "石菖蒲": ["石菖蒲", "菖蒲"], "牛蒡子": ["牛蒡子", "牛子", "大力子"],
}


def variants(name: str) -> list[str]:
    return list(dict.fromkeys([_t2s.convert(name), *[_t2s.convert(v) for v in SYN.get(name, [])], *SYN.get(name, [])]))


_CN = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn_number(s: str) -> float:
    if s == "半":
        return 0.5
    total, cur = 0, 0
    for ch in s:
        if ch == "十":
            total += (cur or 1) * 10
            cur = 0
        elif ch == "百":
            total += (cur or 1) * 100
            cur = 0
        else:
            cur = _CN[ch]
    return float(total + cur)


def parse_classical(text: str, anchor: str) -> list[dict]:
    """Parse "<herb><amount><unit>（processing）" tokens from the original text, incl. "各" and "以上各" groups."""
    i = text.index(anchor)
    seg = text[i:i + 320]
    end = re.search(r"(右|上)[一二三四五六七八九十]+味", seg)
    body = seg[:end.start()] if end else seg
    glosses: list[str] = []

    def stash(m: re.Match) -> str:
        glosses.append(m.group(1))
        return f"〔{len(glosses) - 1}〕"

    body = re.sub(r"[（(]([^）)]*)[）)]", stash, body)
    body = re.sub(r"〕(?=[^\s〔])", "〕 ", body)   # a gloss may be followed directly by the next herb
    each_tail = re.search(r"以上各([一二三四五六七八九十半]+)(两|斤|升|合|枚|个|斗)", body)
    if each_tail:
        body = body[:each_tail.start()]
    tok_re = re.compile(r"^(?P<name>[^\d〔各]+?)(?:〔(?P<g1>\d+)〕)?(?P<each>各)?(?:(?P<amt>[一二三四五六七八九十百半]+)(?P<unit>两|斤|升|合|枚|个|斗))?(?:〔(?P<g2>\d+)〕)?$")

    def gloss(*idx: str | None) -> str:
        for g in idx:
            if g is not None:
                return re.sub(r"[，,]?味[^，,]*$", "", glosses[int(g)]).strip("，, ")
        return ""

    out: list[dict] = []
    pending: list[tuple[str, str]] = []
    for tok in re.split(r"\s+", body.strip()):
        m = tok_re.match(tok) if tok else None
        if not m:
            continue
        if m["amt"] is None:
            pending.append((m["name"], gloss(m["g1"], m["g2"])))
            continue
        amt, unit = cn_number(m["amt"]), m["unit"]
        if m["each"]:
            for pname, pproc in pending:
                out.append({"name_hans": pname, "amount": amt, "unit": unit, "processing": pproc})
        pending = []
        out.append({"name_hans": m["name"], "amount": amt, "unit": unit, "processing": gloss(m["g1"], m["g2"])})
    if each_tail:
        amt, unit = cn_number(each_tail.group(1)), each_tail.group(2)
        for pname, pproc in pending:
            out.append({"name_hans": pname, "amount": amt, "unit": unit, "processing": pproc})
    for o in out:
        o["name"] = tw(o["name_hans"])
    return out


def classical_for(fid: str) -> tuple[list[dict], str, str] | None:
    if fid not in CLASSICAL:
        return None
    rel, anchor = CLASSICAL[fid]
    text = (LIB / rel).read_text(encoding="utf-8")
    return parse_classical(text, anchor), f"reference/sources/TCM-Library/{rel}", anchor


def composition_check(herb_names: list[str], book_prefix: str, heading: str) -> dict:
    """Find the heading in the source book; the best occurrence's following text must contain the herbs."""
    text = norm_ws(read_book(book_prefix))
    h = norm_ws(heading)
    best = {"found": 0, "missing": herb_names, "occurrences": 0}
    pos = -1
    n = 0
    while True:
        pos = text.find(h, pos + 1)
        if pos < 0:
            break
        n += 1
        window = text[pos: pos + 900]
        found = [nm for nm in herb_names if any(v in window for v in variants(nm))]
        if len(found) > best["found"]:
            best = {"found": len(found), "missing": [nm for nm in herb_names if nm not in found], "occurrences": 0}
    best["occurrences"] = n
    best["total"] = len(herb_names)
    return best


def build(herbs_by_id: dict[str, dict], index: dict[str, str]) -> list[dict]:
    commits = submodule_commits()
    out: list[dict] = []
    for f in FORMULAS:
        comp, total_g = [], sum(h[2] for h in f["herbs"])
        for h in f["herbs"]:
            name, role, g = h[0], h[1], h[2]
            note = h[3] if len(h) > 3 else None
            hid = index[name]
            comp.append({"herb": hid, "name": name, "role": role, "typical_g": g, "proportion": round(g / total_g, 4),
                         "role_weight": ROLE_WEIGHT[role], "note": note})
        wsum = sum(c["proportion"] * c["role_weight"] for c in comp)
        for c in comp:
            c["effective_weight"] = round(c["proportion"] * c["role_weight"] / wsum, 4)

        # aggregate panel effect / burden
        eff: Counter = Counter()
        harm: Counter = Counter()
        for c in comp:
            herb = herbs_by_id[c["herb"]]
            for k, v in herb["effects"].items():
                eff[k] += c["effective_weight"] * v
            for k, v in herb["harms"].items():
                harm[k] += c["effective_weight"] * v
        # flavour-excess burden (《素問·生氣通天論》): a flavour dominating the formula damages the organ it overcomes
        flavor_share: Counter = Counter()
        for c in comp:
            for fl in herbs_by_id[c["herb"]]["flavors"]:
                flavor_share[fl["flavor"]] += c["effective_weight"] * fl["weight"]
        total_flavor = sum(flavor_share.values()) or 1.0

        slugs = {herbs_by_id[c["herb"]]["slug"] for c in comp}
        bitter_cold_share = sum(c["effective_weight"] for c in comp if "苦寒" in herbs_by_id[c["herb"]]["tags"])
        interactions = sorted({i for c in comp for i in herbs_by_id[c["herb"]]["interactions"]})
        preg = max((herbs_by_id[c["herb"]]["pregnancy"] for c in comp), key=lambda p: PREG_ORDER.get(p, 1))
        # Medication interactions are handled per patient by safety rules; the tier only encodes the formula's own risk.
        has_activating = any("活血" in herbs_by_id[c["herb"]]["tags"] for c in comp)
        if slugs & STRONG_HERB_SLUGS or bitter_cold_share >= BITTER_COLD_SHARE_LIMIT or f.get("mvp") is False:
            tier = "C"
        elif has_activating or "aristolochic-risk" in interactions:
            tier = "B"
        else:
            tier = "A"
        tier_reasons = []
        if slugs & STRONG_HERB_SLUGS:
            tier_reasons.append("contains a strong herb: " + ", ".join(sorted(herbs_by_id[f'herb-{s}']['name']['zh-Hant'] for s in slugs & STRONG_HERB_SLUGS)))
        if bitter_cold_share >= BITTER_COLD_SHARE_LIMIT:
            tier_reasons.append(f"bitter-cold herbs carry {bitter_cold_share:.0%} of the effective weight")
        if f.get("mvp") is False:
            tier_reasons.append("outside the MVP: learning only")
        if tier == "B":
            tier_reasons.append("contains blood-activating herbs or an aristolochic-acid risk herb")

        # verification
        verification: dict = {"role_status": "textbook-unreviewed", "proportion_basis": "textbook-typical (unverified)"}
        if f.get("source_note"):
            verification["source_note"] = f["source_note"]
        classical = classical_for(f["id"])
        classical_amounts = None
        if classical:
            parsed, path, anchor = classical
            classical_amounts = [{"name": p["name"], "amount": p["amount"], "unit": p["unit"], "processing": p["processing"]} for p in parsed]
            comp_names = [c["name"] for c in comp]
            matched, unmatched = [], []
            for p in parsed:
                ok = any(_t2s.convert(p["name"]) in variants(n) or p["name"] in SYN.get(n, []) or p["name"] == n or _t2s.convert(n) in variants(p["name"]) for n in comp_names)
                (matched if ok else unmatched).append(p["name"])
            verification["classical"] = {"path": path, "anchor": anchor, "parsed": len(parsed), "matched_in_formula": matched, "not_in_formula": unmatched,
                                         "note": CLASSICAL_NOTE.get(f["id"])}
            verification["composition_status"] = "verified-against-classical-text" if not unmatched and len(parsed) >= len(comp_names) - 1 else "classical-text-differs"
            for c in comp:
                for p in parsed:
                    if _t2s.convert(p["name"]) in variants(c["name"]) or p["name"] == c["name"] or p["name"] in SYN.get(c["name"], []):
                        c["classical_amount"] = {"value": p["amount"], "unit": p["unit"], "processing": p["processing"]}
                        break
        else:
            src = f["source"]
            if src.get("prefix") and src.get("heading"):
                chk = composition_check([c["name"] for c in comp if c["name"] not in ("冰糖",)], src["prefix"], src["heading"])
                chk["book_path"] = book_path(src["prefix"])
                if chk["missing"]:
                    chk["note"] = ("Missing herbs are usually lost characters in the GB18030 compilation (e.g. 芪, 芎 are dropped) or later additions "
                                   "to the original formula; confirm against a second source (Wikisource) before marking verified.")
                verification["composition_check"] = chk
                verification["composition_status"] = ("verified-against-source-book" if chk["found"] == chk["total"]
                                                      else "partially-verified" if chk["found"] >= max(1, chk["total"] // 2) else "unverified")
            else:
                verification["composition_status"] = "source-book-not-in-reference"

        mods = []
        for m in f.get("modifications", []):
            msrc = m["source"]
            mverify = "source-book-not-in-reference"
            if msrc.get("prefix") and msrc.get("heading"):
                present = norm_ws(msrc["heading"]) in norm_ws(read_book(msrc["prefix"]))
                mverify = "variant-name-found-in-source-book" if present else "variant-name-not-found-in-source-book"
            mods.append({
                "id": m["id"], "result_name": m["result"], "when_symptoms": m["when"],
                "add": [{"herb": index[h[0]], "name": h[0], "role": h[1], "typical_g": h[2]} for h in m["add"]],
                "remove": [{"herb": index[n], "name": n} for n in m["remove"]],
                "source": {"book": msrc["book"], "verification": mverify}, "status": "textbook-unreviewed",
            })

        out.append({
            "id": f["id"], "name": {"zh-Hant": f["zh"], "en": f["en"]}, "school": f["school"],
            "source": {"book": f["source"]["book"], "ref": f["source"]["ref"], **({"repo_path": book_path(f["source"]["prefix"])} if f["source"].get("prefix") else {})},
            "patterns": f["patterns"], "principle": f["principle"], "mvp": f.get("mvp", True),
            "composition": comp, "classical_amounts": classical_amounts,
            "core_indications": f["core"], "rationale_zh": f["fangyi"], "rationale_citations": ROLE_CITATIONS,
            "cautions": f["cautions"],
            "panel_effect": {k: round(v, 3) for k, v in sorted(eff.items())},
            "panel_burden": {k: round(v, 3) for k, v in sorted(harm.items())},
            "flavor_profile": {k: round(v / total_flavor, 3) for k, v in sorted(flavor_share.items())},
            "tier": tier, "tier_reasons": tier_reasons, "pregnancy": preg, "interactions": interactions,
            "modifications": mods, "verification": verification, "status": "draft",
            "kb_commit": commits.get("TCM-Library"),
        })
    return out


def main() -> list[dict]:
    import json
    herbs = json.loads((DATA / "herbs" / "herbs.json").read_text(encoding="utf-8"))["items"]
    index = json.loads((DATA / "herbs" / "herb-index.json").read_text(encoding="utf-8"))["index"]
    by_id = {h["id"]: h for h in herbs}
    formulas = build(by_id, index)
    status = Counter(f["verification"]["composition_status"] for f in formulas)
    dump(DATA / "formulas" / "formulas.json", {
        "_meta": {
            "description": "Formula knowledge base: composition with 君臣佐使 roles and proportions, aggregate panel effect, computed safety tier, verification against the sources.",
            "count": len(formulas), "composition_status_counts": dict(status), "tier_counts": dict(Counter(f["tier"] for f in formulas)),
            "role_weights": ROLE_WEIGHT, "role_weight_basis": ROLE_CITATIONS,
            "tier_rule": "C if a strong herb (麻黃, 附子) or bitter-cold herbs ≥ 45 % of effective weight or outside MVP; else B if it contains a blood-activating herb or an aristolochic-risk herb; else A. Medication interactions are not part of the tier (see safety/rules.json).",
            "proportion_note": "typical_g is a textbook-typical amount used only to derive relative proportions; classical_amount is parsed from the original text where available. Neither is a dosing recommendation.",
        },
        "items": formulas,
    })
    print("formulas:", len(formulas), dict(status), "tiers", dict(Counter(f["tier"] for f in formulas)))
    return formulas


if __name__ == "__main__":
    main()
