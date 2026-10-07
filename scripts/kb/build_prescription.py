"""Build the tables of the prescription model (PM-37):

    data/herbs/pairings.json        七情: 相須 · 相使 · 相畏 · 相惡 · 相反 between herbs of the knowledge base
    data/herbs/processing.json      炮製: the methods and what each does to a herb
    data/herbs/dose-bands.json      量效: herbs whose action changes with the amount
    data/treatment/prescription.json  the parameters of the dose–response and the pairings

The pairings are read from 《本草綱目·序例下》「相須相使相畏相惡諸藥」 — every relation keeps the entry it came from — plus the textbook examples of
相須 (marked unverified). Processing and dose bands are curated, each resting on a verified quotation (citations.json). Run after the herbs.
"""
from __future__ import annotations

import json
import re
from collections import Counter

from .common import DATA, book_path, dump, norm_ws, read_book, term, tw
from .curated import prescription as cp

TYPE_ID = {"相須": "xu", "相使": "shi", "相畏": "wei", "相惡": "wu", "相反": "fan"}
TYPES = {
    "相須": "two herbs of like action strengthen each other",
    "相使": "`other` serves `herb`: it strengthens the herb's action (「X為之使」, 「得X良」)",
    "相畏": "`herb` fears `other`: the other restrains the herb's harm (半夏畏生薑; seen from the other side, 相殺)",
    "相惡": "`herb` dislikes `other`: the other takes away from the herb's effect (人參惡萊菔子)",
    "相反": "the two must not be combined; never computed — the safety rules exclude the pair",
}


def herb_index() -> dict[str, str]:
    return json.loads((DATA / "herbs" / "herb-index.json").read_text(encoding="utf-8"))["index"]


def resolver(index: dict[str, str]):
    def resolve(name_hans: str) -> str | None:
        name_hans = name_hans.strip()
        if name_hans in cp.CLASSICAL_NAMES:
            mapped = cp.CLASSICAL_NAMES[name_hans]
            return index.get(mapped) if mapped else None
        return index.get(term(name_hans))
    return resolve


def pairing_entries() -> list[tuple[str, list[str], str]]:
    """(names, clauses, entry text) of the table, in order."""
    text = norm_ws(read_book(cp.PAIRING_BOOK))
    start = text.index(cp.PAIRING_SECTION["start"]) + len(cp.PAIRING_SECTION["start"])
    section = text[start:text.index(cp.PAIRING_SECTION["end"], start)]
    section = re.sub(r"〔[^〕]*〕", "", section)                  # the dividers 〔上草部〕…
    return [(m.group(1), [c for c in m.group(2).split("。") if c], m.group(0)) for m in re.finditer(r"([^（）。]{1,10})（([^（）]*)）", section)]


def build_pairings(index: dict[str, str]) -> dict:
    resolve = resolver(index)
    items: dict[tuple[str, str, str], dict] = {}
    unmatched: Counter = Counter()
    entries = pairing_entries()
    for names, clauses, entry in entries:
        for name in names.split("、"):
            hid = resolve(name)
            if hid is None:
                unmatched[name] += 1
                continue
            for clause in clauses:
                for pat, typ in cp.CLAUSES:
                    m = re.match(pat, clause)
                    if not m:
                        continue
                    for other in re.split(r"[、及]", m.group(1)):
                        oid = resolve(other)
                        if oid is None or oid == hid:
                            unmatched[other] += 1
                            continue
                        key = (hid, oid, typ)
                        items.setdefault(key, {
                            "id": f"{hid.removeprefix('herb-')}.{TYPE_ID[typ]}.{oid.removeprefix('herb-')}", "herb": hid, "other": oid, "type": typ,
                            "says": tw(f"{name}{clause}"), "status": "derived",
                            "source": {"book": "本草綱目", "chapter": cp.PAIRING_CHAPTER, "entry_zh_hans": entry, "path": book_path(cp.PAIRING_BOOK)},
                        })
                    break
    for a, b, note in cp.XIANGXU:
        hid, oid = index[a], index[b]
        items.setdefault((hid, oid, "相須"), {
            "id": f"{hid.removeprefix('herb-')}.xu.{oid.removeprefix('herb-')}", "herb": hid, "other": oid, "type": "相須", "says": f"{a}、{b}：{note}",
            "status": "curated-draft", "source": {"book": "教材", "chapter": "七情配伍·相須", "note": "textbook example, unverified"},
        })
    out = sorted(items.values(), key=lambda i: (i["herb"], i["type"], i["other"]))
    return {
        "_meta": {
            "description": "七情 between herbs of the knowledge base: the table of 《本草綱目·序例下》「相須相使相畏相惡諸藥」 (after 徐之才《藥對》), each relation with "
                           "the entry it was read from, and the textbook examples of 相須 (unverified). Derived drafts until the pharmacy review.",
            "types": TYPES, "citations": cp.PAIRING_CITATIONS,
            "count": len(out), "type_counts": dict(sorted(Counter(i["type"] for i in out).items())),
            "entries_read": len(entries), "names_not_in_the_knowledge_base": sum(unmatched.values()),
        },
        "items": out,
    }


def build_yinjing(index: dict[str, str]) -> dict:
    """The 引經報使 table: channel → the herbs that lead to it, the names split by the longest knowledge-base name (in the source script)."""
    from opencc import OpenCC
    t2s = OpenCC("t2s")
    text = norm_ws(read_book(cp.PAIRING_BOOK))
    start = text.index(cp.YINJING_SECTION["start"]) + len(cp.YINJING_SECTION["start"])
    section = text[start:text.index(cp.YINJING_SECTION["end"], start)]
    names = sorted({t2s.convert(n): n for n in index}.items(), key=lambda t: -len(t[0]))
    channels = []
    for m in re.finditer(r"([^（）]+?)（([^（）]*)）", section):
        channel, run = m.group(1), m.group(2)
        found, skipped, i = [], [], 0
        while i < len(run):
            hit = next((n for n in names if run.startswith(n[0], i)), None)
            if hit:
                hid = index[hit[1]]
                if hid not in found:
                    found.append(hid)
                i += len(hit[0])
            else:
                skipped.append(run[i])
                i += 1
        channels.append({"channel": tw(channel), "organ": cp.CHANNEL_ORGAN[channel], "herbs": found, "unread": "".join(skipped), "entry_zh_hans": m.group(0)})
    return {
        "_meta": {"description": "引經報使: the herbs that lead a formula to each channel, from 《本草綱目·序例上》 (after 潔古《珍珠囊》); `unread` keeps what the build could "
                                 "not match to a herb of the knowledge base.", "book": "本草綱目", "chapter": cp.YINJING_CHAPTER, "path": book_path(cp.PAIRING_BOOK)},
        "channels": channels,
    }


def build_processing() -> dict:
    methods = [{**{k: m[k] for k in ("id", "name", "words", "says", "modifiers", "citation")}, "status": "curated-draft"} for m in cp.PROCESSING]
    return {
        "_meta": {
            "description": "炮製: what each method does to a herb, read from 《本草蒙筌·總論·製造資水火》 (one method is a textbook statement, unverified). `words` are the forms "
                           "a formula's processing note may take; `cleaning` are words with no effect on the action.",
            "modifiers": {"direction": "added to the herb's 升降浮沉", "tropism": "added to the named channels' shares, then renormalised", "run_zao": "replaces 潤燥",
                          "bu_xie": "replaces 補瀉", "harms_scale": "multiplies the burden", "temperature": "added to the signed warmth"},
        },
        "methods": methods,
        "cleaning": cp.CLEANING,
    }


def build_dose_bands(index: dict[str, str]) -> dict:
    items = [{"herb": index[b["herb"]], "name": b["herb"], "says": b["says"], "citation": b["citation"], "small": b["small"], "large": b["large"], "status": "curated-draft"}
             for b in cp.DOSE_BANDS]
    return {
        "_meta": {
            "description": "量效: herbs whose action changes with the amount, each from a verified passage. `small` applies below bands.small_below of the typical dose "
                           "and `large` above bands.large_above (data/treatment/prescription.json).",
            "fields": {"direction": "replaces the herb's 升降浮沉", "effects_add": "added to the effects", "effects_scale": "multiplies the named effects",
                       "harms_add": "added to the harms", "tropism": "added to the channels' shares, then renormalised"},
        },
        "items": sorted(items, key=lambda i: i["herb"]),
    }


def main() -> None:
    index = herb_index()
    pairings = build_pairings(index)
    dump(DATA / "herbs" / "pairings.json", pairings)
    dump(DATA / "herbs" / "processing.json", build_processing())
    dump(DATA / "herbs" / "dose-bands.json", build_dose_bands(index))
    dump(DATA / "herbs" / "yinjing.json", build_yinjing(index))
    dump(DATA / "treatment" / "mechanisms.json", {
        "_meta": {"description": "The direction of qi a pattern's treatment asks for (升 · 降 · 宣 · 收), only where the classics state it; `sign` +1 up and out, −1 down and in. "
                                 "Read by the prescription model (design §3.4), never by the diagnosis.", "design": "docs/post-mvp/design/prescription-model.md §3.4"},
        "items": [{**m, "sign": cp.DIRECTION_SIGN[m["direction"]], "status": "curated-draft"} for m in cp.MECHANISMS],
    })
    dump(DATA / "treatment" / "prescription.json", {
        "_meta": {"description": "Parameters of the prescription model ([calibrate]): the dose–response of a herb, the pairings and the dose bands.",
                  "design": "docs/post-mvp/design/prescription-model.md §3.3, §4.1"},
        "params": cp.PARAMS,
    })
    m = pairings["_meta"]
    print(f"prescription tables: {m['count']} pairings {m['type_counts']} from {m['entries_read']} entries, {len(cp.PROCESSING)} processing methods, {len(cp.DOSE_BANDS)} dose bands")


if __name__ == "__main__":
    main()
