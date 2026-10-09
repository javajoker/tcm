"""The review packs of the knowledge base beyond the first four (task PM-57; content review §3, §4.2, §4.3): symptoms and questions, tongue and pulse, constitutions, the
panel model and 營衛, the herbs, the treatment guidance, the prescription model's tables and the reference quantities, the five-phase priors, the citations and the glossary.
Each renders the data for a reviewer who does not read JSON, and names the units its record covers."""
from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from typing import Any, Callable

from scripts.kb import herb_model, review
from scripts.kb.common import ROOT, front_matter, term
from scripts.kb.curated.herbs import OVERLAY
from scripts.review.base import Context, Pack, both, cite, cites, flat, header, json_text, table, zh


def text(v: Any) -> str:
    """A bilingual text as "zh-Hant / English"; a plain string as it is."""
    if isinstance(v, dict):
        z, e = v.get("zh-Hant") or "", v.get("en") or ""
        return f"{z} / {e}" if z and e else z or e
    return "—" if v in (None, "") else str(v)


def scope(ctx: Context, *rels: str) -> list[tuple[str, dict[str, str]]]:
    return [(rel, ctx.units(rel)) for rel in rels]


def uses_in_patterns(ctx: Context) -> dict[str, list[str]]:
    """symptom id → "pattern (weight)" for every pattern whose evidence holds it."""
    out: dict[str, list[str]] = defaultdict(list)
    for p in ctx.patterns:
        for s, w in sorted(p["weights"].items()):
            out[s].append(f"{p['id']} ({w})")
    return out


def askers(ctx: Context) -> dict[str, list[str]]:
    out: dict[str, list[str]] = defaultdict(list)
    for q in ctx.questions:
        for o in q["options"]:
            for s in o["symptoms"]:
                if q["id"] not in out[s]:
                    out[s].append(q["id"])
    return out


# ── symptoms and questions ──────────────────────────────────────────────────

def symptoms(ctx: Context) -> Pack:
    rels = ("diagnosis/symptoms.json", "diagnosis/questions.json", "diagnosis/exclusions.json", "diagnosis/orientation.json")
    md = header(ctx, "symptoms and questions (症狀與問診)", "TCM clinical reviewer **and** linguistic reviewer.",
                ["**Each symptom:** can a layperson recognise it from its wording, in both languages? Should two be split, or merged? Is its kind (symptom, sign, tongue, pulse) right?",
                 "**Each question:** the prompt, the hint and every option, in both languages; single or multiple choice; which symptoms are graded by severity; which symptoms each option records.",
                 "**Exclusive groups and splits** (`exclusions.json`): symptoms that cannot both be true, and the near-synonyms the inquiry asks the person to tell apart.",
                 "**The first-impression signs** (`orientation.json`): the signs that suggest cold or heat, deficiency or excess, and an exterior pattern (SOP §8)."])
    use, ask = uses_in_patterns(ctx), askers(ctx)
    items = ctx.data[rels[0]]["items"]
    md += "\n## Symptoms and signs (`symptoms.json`), by inquiry dimension\n"
    for dim in sorted({s["dimension"] for s in items}):
        rows = [[f"`{s['id']}`", s["zh-Hant"], s.get("en") or "—", s["kind"], ", ".join(use.get(s["id"], [])) or "— (no pattern)", ", ".join(ask.get(s["id"], [])) or "—"]
                for s in items if s["dimension"] == dim]
        md += f"\n### {dim} ({len(rows)})\n\n" + table(["Id", "zh-Hant", "English", "Kind", "Evidence for (weight)", "Asked by"], rows)
    q = ctx.data[rels[1]]
    cov = q["_meta"]["coverage"]
    md += (f"\n## Questions (`questions.json`)\n\n{len(q['items'])} questions, {q['_meta']['core_count']} of them core (asked of everyone); {cov['covered']} of the {cov['inquiry_symptoms']} "
           f"inquiry symptoms are asked by some question" + (f"; not asked: {', '.join(cov['uncovered'])}" if cov["uncovered"] else "") + ".\n\n**Modules** (a module adds its questions when "
           "the person chooses it, or when its condition holds):\n\n" + table(["Id", "Name", "Description", "Requires"], [[f"`{m['id']}`", both(m["name"]), text(m["description"]), json_text(m["requires"]) if m["requires"] else "—"] for m in q["modules"]]))
    for x in sorted(q["items"], key=lambda x: (x["order"], x["id"])):
        md += (f"\n### `{x['id']}` — {x['dimension']}{' · core' if x['core'] else ''} · order {x['order']} · {x['select']} choice · source {x['source']}\n\n"
               f"- **Prompt:** {text(x['prompt'])}\n- **Hint:** {text(x.get('hint'))}\n- **Modules:** {', '.join(x['modules']) or '—'}\n"
               f"- **Graded by severity:** {', '.join(ctx.symptom(s) for s in x.get('graded', [])) or '—'}\n"
               f"- **Exclusive within the question:** {'; '.join(' / '.join(g) for g in x.get('exclusive_groups', [])) or '—'}\n\n")
        md += table(["Option", "zh-Hant", "English", "Records"], [[f"`{o['id']}`", zh(o["label"]), o["label"].get("en", ""), "、".join(ctx.symptom(s) for s in o["symptoms"]) or ("(none of these)" if o.get("none") else "—")] for o in x["options"]])
    ex = ctx.data[rels[2]]
    md += "\n## Exclusive groups and soft conflicts (`exclusions.json`)\n\n" + table(["Id", "Kind", "Symptoms", "Why (shown to the person)"], [[f"`{g['id']}`", g["kind"], "、".join(ctx.symptom(s) for s in g["symptoms"]), text(g["reason"])] for g in ex["groups"]])
    md += "\n**Splits** — near-synonyms the inquiry asks the person to tell apart:\n\n" + table(["Id", "Symptoms", "How they differ"], [[f"`{s['id']}`", "、".join(ctx.symptom(x) for x in s["symptoms"]), text(s["summary"])] for s in ex["splits"]])
    o = ctx.data[rels[3]]
    rows = [[k, "、".join(ctx.symptom(s) for s in v)] for k, v in o.items() if isinstance(v, list)]
    e = o["exterior"]
    rows.append(["exterior", f"required {ctx.symptom(e['required'])}; supporting {'、'.join(ctx.symptom(s) for s in e['supporting'])}; half-exterior {'; '.join('、'.join(ctx.symptom(s) for s in h) for h in e['half'])}"])
    md += (f"\n## The first impression (`orientation.json`)\n\n{o['_meta']['description']}\n\n" + table(["List", "Signs"], rows)
           + f"\nA lean is shown when one side has at least {o['lean_margin']} more signs than the other.\n")
    md += "\n**Engine behaviour** — the inquiry's stopping rules (`scoring-params.json` → questionnaire):\n\n" + table(["Parameter", "Value"], flat(ctx.data["diagnosis/scoring-params.json"]["questionnaire"], "questionnaire"))
    return Pack("symptoms", "symptoms and questions (症狀與問診)", "TCM clinical + linguistic", md, scope(ctx, *rels))


# ── tongue and pulse ────────────────────────────────────────────────────────

def tongue_pulse(ctx: Context) -> Pack:
    rels = ("diagnosis/tongue.json", "diagnosis/pulse.json")
    t, p = ctx.data[rels[0]], ctx.data[rels[1]]
    md = header(ctx, "tongue and pulse (舌診與脈診)", "TCM clinical reviewer.",
                ["**The tongue zones:** the classical assignment the app uses (《傷寒指掌》) against the textbook one, which is only noted.",
                 "**Each tongue feature:** its name in both languages, its zone and its meaning; the guidance for observing one's own tongue (when, what to avoid, the confidence).",
                 "**Each pulse:** the feature, the indications, its group and yin-yang, the heading in 《瀕湖脈學》; the three positions and their organs; the pulses that exclude each other.",
                 "**The educational note:** self-reported tongue and pulse count for less than an answer, and the app never \"reads\" a pulse."])
    use = uses_in_patterns(ctx)
    g = t["_meta"]["guidance"]
    md += (f"\n## Tongue (`tongue.json`)\n\n{t['_meta']['description']}\n\n> {t['_meta']['note']}\n\nZone citation: {cite(ctx, t['_meta'].get('zone_citation'))}\n\n"
           + table(["Zone", "部位", "English", "Classical (used)", "Textbook (noted)"], [[f"`{z['id']}`", z["zh"], z["en"], "、".join(z["classical"]), "、".join(z["textbook"])] for z in t["zones"]])
           + f"\n**Self-observation:** when — {g['when']}; avoid — {'、'.join(g['avoid'])}; under the tongue — {g['sublingual']}; confidence — {g['confidence']}.\n\n")
    md += table(["Id", "Name", "Category", "Zone", "Meaning", "Evidence for (weight)"], [[f"`{f['id']}`", both(f["name"]), f["category"], f["zone"], f["meaning"], ", ".join(use.get(f["id"], [])) or "—"] for f in t["features"]])
    pg = p["_meta"]["guidance"]
    md += (f"\n## Pulse (`pulse.json`)\n\n{p['_meta']['description']}\n\n- **Education:** {pg['education']}\n- **Note shown:** {pg['note']}\n- **Optional:** {pg['optional']} · **quality coefficient:** {pg['quality_coefficient']} · "
           f"**rate bands:** {json_text(pg['rate_bands'])} · **positions from:** {cite(ctx, pg.get('positions_source'))}\n- **Exclusive groups:** {'; '.join(' / '.join(x) for x in p['_meta']['exclusive_groups'])}\n\n"
           + table(["Position", "部位", "Organs"], [[f"`{x['id']}`", x["zh"], "、".join(x["organs"])] for x in p["positions"]]) + "\n")
    md += table(["Id", "Name", "Group", "陰陽", "Feature", "Indications", "Source", "Evidence for (weight)"],
                [[f"`{x['id']}`", both(x["name"]), x["group"], x["yin_yang"], x["feature"], x["indications"], f"《{x['source']['book']}》{x['source']['chapter']}" + (" (heading verified)" if x["source"].get("verified_heading") else ""),
                  ", ".join(use.get(x["id"], [])) or "—"] for x in p["pulses"]])
    q = ctx.data["diagnosis/scoring-params.json"]["quality"]
    md += f"\n**Engine behaviour** — what a finding counts for, by its source and prefix (`scoring-params.json` → quality): by source {json_text(q['by_source'])}; by prefix {json_text(q['by_prefix'])}.\n"
    return Pack("tongue-pulse", "tongue and pulse (舌診與脈診)", "TCM clinical", md, scope(ctx, *rels))


# ── constitutions ───────────────────────────────────────────────────────────

def constitutions(ctx: Context) -> Pack:
    rels = ("diagnosis/constitutions.json", "diagnosis/constitution-items.json", "wuxing/susceptibility.json")
    c, ci, su = (ctx.data[r] for r in rels)
    md = header(ctx, "constitutions (體質)", "TCM clinical reviewer.",
                ["**Each constitution:** the features that characterise it, the nature it leans to, and its susceptibility to the six pathogenic qi.",
                 "**The questionnaire** (own-written after ZYYXH/T 157-2009): each item in both languages, the reverse-scored items, the scale and the scoring rule.",
                 "**The susceptibility table** (`wuxing/susceptibility.json`): the risk of each constitution for each pathogenic qi, the qi of each season, and the citations."])
    md += (f"\n## The nine constitutions (`constitutions.json`)\n\n{c['_meta']['description']} Standard: {c['_meta']['standard']}.\n\n"
           + table(["Id", "Name", "Features", "Leans to", "Susceptibility", "Status"], [[f"`{x['id']}`", both(x["name"]), "、".join(ctx.symptom(s) for s in x["features"]), "、".join(x["prior_nature"]) or "—",
                                                                                   json_text(x["susceptibility"]), x["status"]] for x in c["items"]]))
    scale = " · ".join(f"{s['value']} {text(s['label'])}" for s in ci["scale"])
    md += f"\n## The questionnaire (`constitution-items.json`)\n\n- **Prompt:** {text(ci['prompt'])}\n- **Scale:** {scale}\n- **Scoring:** {ci['_meta']['scoring']}\n"
    for ty in ci["types"]:
        md += f"\n### `{ty['constitution']}` — {text(ty['description'])}\n\n" + table(["Item", "zh-Hant", "English", "Reverse"], [[f"`{i['id']}`", zh(i["text"]), i["text"].get("en", ""), "yes" if i["reverse"] else ""] for i in ty["items"]])
    qis = sorted({q for r in su["risk"].values() for q in r} | {q for qs in su["season_evil"].values() for q in qs})
    md += (f"\n## Susceptibility (`wuxing/susceptibility.json`)\n\n{su['_meta']['description']}\n\n- **Rule:** `{su['formula']}`\n- **Note:** {su['note']}\n\n"
           + table(["Constitution", *qis], [[f"`{k}`", *(v.get(q, "") for q in qis)] for k, v in su["risk"].items()])
           + "\n" + table(["Season", "Its qi"], [[k, "、".join(v)] for k, v in su["season_evil"].items()]) + "\n**Citations**\n\n" + cites(ctx, su["citations"]))
    return Pack("constitutions", "constitutions (體質)", "TCM clinical", md, scope(ctx, *rels))


# ── the panel model and 營衛 ─────────────────────────────────────────────────

def panel(ctx: Context) -> Pack:
    rels = ("diagnosis/panel-schema.json", "diagnosis/scoring-params.json", "diagnosis/yingwei.json")
    ps, sp, yw = (ctx.data[r] for r in rels)
    md = header(ctx, "the panel model, the scoring parameters and 營衛", "TCM clinical reviewer, with a developer present (content review §3, §4.4).",
                ["**The panel** (`panel-schema.json`): its dimensions and scales, how each nature projects onto it, and the derived readings (八綱, the five-phase function, the 營衛 coupling).",
                 "**The scoring parameters** (`scoring-params.json`): the pattern bands, the noisy-OR floor and the dimension weights, the confidence cut-offs, the inquiry's stopping rules, formula "
                 "matching and tiers, the safety thresholds. A change here moves every result: it is made in a calibration session (§4.4) and re-checked with the golden cases.",
                 "**營衛** (`yingwei.json`, PM-52): the three readings, the four natures and the patterns they stand for, the questions that read them, the stages the app follows, what it "
                 "leaves out and why, and the coupling to the panel."])
    md += f"\n## The panel (`panel-schema.json`)\n\n{ps['_meta']['description']}\n\n" + table(["Path", "Value"], flat(ps))
    md += f"\n## The scoring parameters (`scoring-params.json`)\n\n{sp['_meta']['description']}\n\n" + table(["Section", "Where it is explained"], [[k, v] for k, v in sp["_meta"]["sources"].items()])
    for k, v in sp.items():
        if k != "_meta":
            md += f"\n### {k}\n\n" + table(["Path", "Value"], flat(v, k))
    md += (f"\n## 營衛 (`yingwei.json`)\n\n{yw['_meta']['description']}\n\n- **Reading rule:** {yw['_meta']['rule']}\n- **Coupling:** strength {yw['coupling']['strength']}, targets {json_text(yw['coupling']['targets'])}\n\n"
           + table(["Dimension", "中文", "English", "Scale", "Basis"], [[f"`{d['id']}`", d["zh"], d["en"], d["scale"], ", ".join(d["basis"])] for d in yw["dimensions"]]))
    for name, n in yw["natures"].items():
        md += f"\n### {name} — {text(n['name'])} · pattern {n['pattern']} · location {n['location']}\n\n{text(n['says'])}\n\nProjection per degree: {json_text(n['projection_per_degree'])}\n\n"
        md += table(["Dimension", "Value", "Confidence", "Readings (applicability · value · says · why · citations)"],
                    [[dim, d["value"], d["confidence"], " ‖ ".join(f"{r['applicability']} · {r['value']} · {r['says']} · {r['why']} · {', '.join(r['citations'])}" for r in d["readings"])] for dim, d in n["dimensions"].items()])
    md += "\n**Questions that read 營衛**\n\n" + table(["Id", "Question", "English", "Result"], [[f"`{q['id']}`", q["question"], q["en"], q["result"]] for q in yw["questions"]])
    md += "\n**The stages the app follows**\n\n" + table(["Stage", "In the app", "Citation"], [[s["stage"], s["app"], cite(ctx, s.get("citation"))] for s in yw["stages"]])
    md += "\n**Not modelled, on purpose**\n\n" + table(["What", "Why", "Citations"], [[n["what"], n["why"], ", ".join(n["citations"])] for n in yw["not_modelled"]])
    return Pack("panel", "the panel model, the scoring parameters and 營衛", "TCM clinical (developer present)", md, scope(ctx, *rels))


# ── herbs ───────────────────────────────────────────────────────────────────

# Content review §4.3: at least PER_CATEGORY derived herbs of every category, always every derived herb flagged toxic, avoid or caution in pregnancy. The draw is fixed by the seed:
# when more than 5 % of a sample needs a change, the rule is revised and the sample redrawn with a new seed.
SAMPLE_SEED = "PM-57"
PER_CATEGORY = 10


def curated(h: dict[str, Any]) -> bool:
    """The herbs of the curated overlay (and the hand-curated ones outside the library) — decided by the curated tables, not by the status a review changes."""
    return h["slug"] in OVERLAY or h["source"].get("repo") != "TCM-Library"


def flagged(h: dict[str, Any]) -> bool:
    return bool(h["toxic"]) or h["pregnancy"] in ("avoid", "caution")


def sample(herbs: list[dict[str, Any]], seed: str = SAMPLE_SEED) -> list[dict[str, Any]]:
    """The stratified sample of the derived herbs, in file order."""
    derived = [h for h in herbs if not curated(h)]
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for h in derived:
        by_category[h["category"]].append(h)
    draw = lambda h: hashlib.sha256(f"{seed}:{h['id']}".encode("utf-8")).hexdigest()       # noqa: E731
    picked = {h["id"] for hs in by_category.values() for h in sorted(hs, key=draw)[:PER_CATEGORY]} | {h["id"] for h in derived if flagged(h)}
    return [h for h in derived if h["id"] in picked]


def source_says(h: dict[str, Any]) -> str:
    """The 性味 sentence of the source file the record cites (the Pharmacopoeia's, in 【原文】), in Traditional characters."""
    src = h.get("source") or {}
    path = ROOT / src.get("path", "")
    if src.get("repo") != "TCM-Library" or not path.is_file():
        return "— (no library entry)"
    m = re.search(r"性味[^。]*", term(front_matter(path.read_text(encoding="utf-8"))[1]))
    return m.group(0) if m else "—"


def signed(d: dict[str, float]) -> str:
    return ", ".join(f"{k} {v:+g}" for k, v in sorted(d.items())) or "—"


def flags(h: dict[str, Any]) -> str:
    out = [f"pregnancy {h['pregnancy']}"] + (["**toxic**"] if h["toxic"] else []) + [f"interaction {i}" for i in h["interactions"]] + [f"tag {t}" for t in h["tags"]]
    return "; ".join(out) + (f"; caution: {h['caution']}" if h.get("caution") else "")


def xingwei(h: dict[str, Any]) -> str:
    fl = "、".join(("微" if f["weight"] == 0.5 else "") + f["flavor"] for f in h["flavors"])
    return f"{'、'.join(h['siqi'])}；{fl}；歸 {'、'.join(h['organs'])}"


def herb_rows(hs: list[dict[str, Any]], full: bool) -> list[list[Any]]:
    rows = []
    for h in hs:
        name = f"`{h['id']}` {both(h['name'])}" + (f" *{h['latin']}*" if h.get("latin") else "")
        row = [name, xingwei(h), source_says(h), "、".join(h["functions"]), signed(h["effects"]), signed(h["harms"]), flags(h)]
        if full:
            dose = h.get("dose_g_reference")
            row += [f"{dose[0]:g}–{dose[1]:g} g" if dose else "—", "、".join(h["classical_formulas"]) or "—"]
        rows.append(row)
    return rows


SELECTOR = {"gui_zang": "each 臟 among its channels (or the first channel)", "gui_any": "each organ among its channels (or the first)", "none": "—"}
# The burden rules of herb_model.derive_harms, each shown by what it computes for a herb that has only that property.
HARM_PROBES: list[tuple[str, dict[str, Any]]] = [
    ("寒涼傷陽 — a 寒 herb", {"temp": -2.0}), ("— a 大寒 herb", {"temp": -3.0}), ("苦寒敗胃 — 苦 and at least 微寒", {"temp": -1.0, "flavors": [{"flavor": "苦", "weight": 1.0}]}),
    ("辛熱傷陰 — a 熱 herb", {"temp": 2.0}), ("— a 大熱 herb", {"temp": 3.0}), ("滋膩礙脾 — tag 滋膩", {"tags": ["滋膩"]}), ("辛散耗氣 — tag 辛散", {"tags": ["辛散"]}),
    ("甘壅助濕 — tag 甘壅", {"tags": ["甘壅"]}), ("活血動血 — tag 活血", {"tags": ["活血"]}), ("燥烈傷陰 — tag 燥烈", {"tags": ["燥烈"]}),
]


def herbs(ctx: Context) -> Pack:
    rel = "herbs/herbs.json"
    items = ctx.data[rel]["items"]
    cur, smp = [h for h in items if curated(h)], sample(items)
    derived = [h for h in items if not curated(h)]
    md = header(ctx, "herbs (本草)", "Pharmacy reviewer **and** TCM clinical reviewer.",
                [f"**The {len(cur)} curated herbs, in full:** 性味 and 歸經 against the source, the functions, the effects on the panel and the burdens, the pregnancy level, toxicity, interactions, the tags and the reference amount.",
                 f"**The {len(derived)} derived herbs, by their rules and a sample** (§4.3): the rules below make every derived value; the sample is {PER_CATEGORY} herbs of each category (all of a smaller one) "
                 "and every herb flagged toxic, avoid or caution in pregnancy. If more than 5 % of the sample needs a change, the rule is revised and the sample redrawn (a new seed); single corrections become curated overrides.",
                 "**The record of this pack** names the curated and the sampled herbs. The decision on the rules (code in `scripts/kb/herb_model.py` and the conventions in the file's `_meta`) goes in its `notes` and `changes`."])
    md += "\nThe *source* column quotes the 性味 sentence of the library entry the record cites (a test checks that the record's 四氣 and 五味 agree with it).\n"
    md += "\n## The curated herbs\n"
    for cat in sorted({h["category"] for h in cur}):
        hs = [h for h in cur if h["category"] == cat]
        md += f"\n### {cat} ({len(hs)})\n\n" + table(["Herb", "性味 · 歸經 (record)", "Source", "功效", "Effects on the panel", "Burdens", "Flags", "Reference amount", "In classical formulas"], herb_rows(hs, True))
    md += "\n## The rules that make the derived values\n\n**Effects** (`EFFECT_RULES`): a keyword in the source's 功效 (Simplified, as matched) adds the change; changes add up and are capped at ±1.5.\n\n"
    md += table(["Keywords in 功效", "Changes", "By", "For the organs"], [["、".join(k), t, f"{d:+g}", SELECTOR[s]] for k, t, d, s in herb_model.EFFECT_RULES])
    md += "\n**Burdens** (`derive_harms`), each shown by what it computes for a herb with only that property:\n\n"
    md += table(["Rule", "Computes"], [[name, signed(herb_model.derive_harms(a.get("temp", 0.0), a.get("flavors", []), a.get("tags", []), []))] for name, a in HARM_PROBES])
    md += ("\n**Pregnancy:** 孕妇禁用 or 孕妇忌用 in the source's notes → `avoid`; 孕妇慎用 → `caution`; otherwise the category's floor — "
           + "; ".join(f"{term(k)} {v}" for k, v in herb_model.CATEGORY_PREGNANCY_FLOOR.items()) + " — else `ok-unreviewed`. A curated value wins.\n\n"
           "**Toxicity:** 大毒, 小毒 or 有毒 in the property sentence → toxic. A curated value wins.\n\n")
    conv = ctx.data[rel]["_meta"]["conventions"]
    md += ("**The excess of a flavour** (《素問·生氣通天論》) — " + "; ".join(f"{k}: {v['organ']}.{v['channel']} ({v['citation']})" for k, v in conv["flavor_excess_harm"].items()) + ".\n\n"
           "**The properties of the prescription model** (`props`; [design](../../../docs/post-mvp/design/prescription-model.md) §3), each value naming the rules it came from:\n\n"
           + table(["Rule", "Says", "Citation"], [[f"`{k}`", r["says"], cite(ctx, r.get("citation"))] for k, r in sorted(conv["props"]["rules"].items())])
           + "\n" + table(["Parameter", "Value"], flat(conv["props"]["params"], "props.params")))
    counts = {c: (len([h for h in derived if h["category"] == c]), len([h for h in smp if h["category"] == c])) for c in sorted({h["category"] for h in derived})}
    md += (f"\n## The sample of the derived herbs (seed `{SAMPLE_SEED}`: {len(smp)} of {len(derived)}, of which {len([h for h in smp if flagged(h)])} flagged)\n\n"
           + table(["Category", "Derived", "In the sample"], [[c, n, k] for c, (n, k) in counts.items()]))
    for cat in counts:
        hs = [h for h in smp if h["category"] == cat]
        md += f"\n### {cat} ({len(hs)} of {counts[cat][0]})\n\n" + table(["Herb", "性味 · 歸經 (record)", "Source", "功效", "Effects on the panel", "Burdens", "Flags"], herb_rows(hs, False))
    return Pack("herbs", "herbs (本草)", "pharmacy + TCM clinical", md, [(rel, ctx.units(rel, *(h["id"] for h in cur + smp)))])


# ── treatment guidance ──────────────────────────────────────────────────────

def guidance(ctx: Context) -> Pack:
    rel = "treatment/guidance.json"
    g = ctx.data[rel]
    md = header(ctx, "treatment guidance: foods, acupoints, lifestyle (食療・穴位・起居)", "TCM clinical reviewer **and** pharmacy reviewer.",
                ["**Each acupoint:** the location text in both languages (could a layperson find it?), the cautions, the pregnancy flag, the basis; **and where the schematic drawings mark it** — "
                 "the development build's inspector shows every drawing (*Figures* tab); the placements are in `apps/web/src/screens/result/figures/acupointSpots.ts`, outside this record's hash.",
                 "**Each food:** its nature and flavours, its traditional functions, the rationale shown, the cautions and the pregnancy caution.",
                 "**Self-acupressure:** how it is done and its cautions; **lifestyle** advice per pattern; the general text and its sources.",
                 "**Which patterns recommend each point and food** (from the patterns' treatment): is any recommendation wrong for the pattern?"])
    point_for, food_for = defaultdict(list), defaultdict(list)
    for p in ctx.patterns:
        for a in p["treatment"]["acupoints"]:
            point_for[a].append(p["id"])
        for f in p["treatment"]["foods"]:
            food_for[f].append(p["id"])
    md += "\n## Acupoints\n\n" + table(["Point", "Code · channel", "Location", "English", "Cautions", "Avoid in pregnancy", "Basis", "Recommended for"],
                                       [[name, f"{a['code']} · {a['meridian']}", zh(a["location"]), a["location"].get("en", ""), " ".join(text(c) for c in a["cautions"]) or "—",
                                         "**yes**" if a["pregnancy_avoid"] else "", a["basis"], ", ".join(point_for.get(name, [])) or "—"] for name, a in g["acupoints"].items()])
    ap = g["acupressure"]
    md += f"\n**Self-acupressure:** {text(ap['how'])}\n\n" + "\n".join(f"- {text(c)}" for c in ap["cautions"]) + "\n"
    md += ("\n## Foods\n\n" + table(["Food", "性味", "功效", "Shown as", "Cautions", "Pregnancy caution", "Herb record", "Citations", "Recommended for"],
                                    [[f"{name} (`{f['id']}`)", f"{f.get('nature', '—')}；{'、'.join(f.get('flavors', []))}", "、".join(f.get("functions", [])), text(f.get("rationale")),
                                      " ".join(text(c) for c in f.get("cautions", [])) or "—", "**yes**" if f.get("pregnancy_caution") else "", f"`{f['herb']}`" if f.get("herb") else "—",
                                      ", ".join(f.get("citations", [])) or "—", ", ".join(food_for.get(name, [])) or "—"] for name, f in g["foods"].items()])
           + f"\n**Foods marked in pregnancy** (`food_pregnancy_caution`): {'、'.join(g['food_pregnancy_caution'])}\n")
    md += ("\n## Lifestyle, by pattern\n\n" + table(["Pattern", "zh-Hant", "English"], [[f"`{k}`", zh(v), v.get("en", "")] for k, v in g["lifestyle"].items()])
           + f"\n**General text** ({g['general'].get('en_status', '')}): {g['general']['text']}\n\n{g['general'].get('text_en', '')}\n\nSources: {', '.join(g['general']['source'])}\n")
    rules = ctx.rules
    md += (f"\n**Engine behaviour** — in pregnancy the points {'、'.join(rules['pregnancy_acupoints'])} are removed (`R_PREG_ACUPOINTS`) and the marked foods are flagged; a food the person "
           "listed as an allergen is removed (matched by name in either script, see the glossary pack's name folding).\n")
    return Pack("guidance", "treatment guidance (食療・穴位・起居)", "TCM clinical + pharmacy", md, [(rel, ctx.units(rel))])


# ── the prescription model's tables and the reference quantities ────────────

def bound(season: dict[str, Any]) -> str:
    """The herbs a season's factor applies to, by their warmth."""
    return f"warmth ≥ {season['temperature_at_least']}" if "temperature_at_least" in season else f"warmth ≤ {season['temperature_at_most']}"


REFERENCE = ("herbs/dose-bands.json", "herbs/pairings.json", "herbs/processing.json", "herbs/yinjing.json", "treatment/mechanisms.json", "treatment/prescription.json", "treatment/sanyin.json")


def reference(ctx: Context) -> Pack:
    db, pr, pc, yj, mc, pp, sy = (ctx.data[r] for r in REFERENCE)
    name = lambda hid: f"{zh(ctx.herbs[hid]['name'])}" if hid in ctx.herbs else f"`{hid}`"      # noqa: E731
    md = header(ctx, "the prescription model and the reference quantities (處方模型・參考劑量)", "TCM clinical reviewer **and** pharmacy reviewer.",
                ["**The reference quantities** a learner or practitioner sees in the study reference: they start from each herb's reference amount (herbs pack) and the formula's proportions "
                 "(formulas pack) and are changed by the tables here — the amount-dependent actions (量效), the 三因 factors (age, constitution, season, severity) and the rounding.",
                 "**The pairings (七情)** read from 《本草綱目》, **processing (炮製)**, **the guide herbs (引經)** and **the direction of qi each treatment asks for**: each against its source.",
                 "**The model's parameters** (`prescription.json`): marked [calibrate] in the design; a change is made with the developer present."])
    md += ("\n## Amount-dependent actions (量效, `dose-bands.json`)\n\n" + db["_meta"]["description"] + "\n\n"
           + table(["Herb", "Says", "A small amount", "A large amount", "Citation"], [[name(b["herb"]), b["says"], json_text(b["small"]), json_text(b["large"]), cite(ctx, b["citation"])] for b in db["items"]]))
    md += "\n## 三因制宜 (`sanyin.json`)\n\n" + sy["_meta"]["description"] + "\n\n"
    age = sy["age"]
    md += (f"- **Age** ({cite(ctx, age['citation'])}): from {age['elderly_from_years']} years × {age['elderly_fraction']}; minors — " + "; ".join(f"below {m['below_years']} × {m['fraction']} ({m['label']})" for m in age["minors"]) + f". {age['says']}\n"
           f"- **Severity** ({cite(ctx, sy['severity']['citation'])}): light × {sy['severity']['light']}, standard × {sy['severity']['standard']}, strong × {sy['severity']['strong']}. {sy['severity']['says']}\n"
           f"- **Season** ({cite(ctx, sy['season_citation'])}): " + "; ".join(f"{s['element']} × {s['factor']} for {bound(s)} ({s['says']})" for s in sy["season"])
           + f"; the 君 spared: {sy['season_spares_jun']}. Exception ({cite(ctx, sy['season_exception']['citation'])}): {sy['season_exception']['says']}\n"
           f"- **Region** ({cite(ctx, sy['region']['citation'])}): {sy['region']['says']} — rules: {json_text(sy['region']['rules'])}\n"
           f"- **General** ({cite(ctx, sy['general']['citation'])}): {sy['general']['says']}\n- **Heat demand:** {sy['heat_demand']} · **rounding:** to {sy['round_g']} g\n\n"
           + table(["Constitution", "Factor", "Avoid", "Says", "Citation"], [[f"`{c['constitution']}`", c["factor"], json_text(c["avoid"]), c["says"], cite(ctx, c["citation"])] for c in sy["constitution"]]))
    md += "\n## The direction of qi (`mechanisms.json`)\n\n" + mc["_meta"]["description"] + "\n\n" + table(["Pattern", "Direction", "Sign", "Says", "Citation"], [[f"`{m['pattern']}`", m["direction"], m["sign"], m["says"], cite(ctx, m["citation"])] for m in mc["items"]])
    md += "\n## Processing (炮製, `processing.json`)\n\n" + pc["_meta"]["description"] + "\n\n" + table(["Method", "Name", "Words in the source", "Changes", "Says", "Citation"], [[f"`{m['id']}`", m["name"], "、".join(m["words"]), json_text(m["modifiers"]), m["says"], cite(ctx, m["citation"])] for m in pc["methods"]])
    md += f"\nCleaning steps that change nothing: {'、'.join(pc['cleaning'])}\n"
    md += ("\n## The guide herbs (引經報使, `yinjing.json`)\n\n" + f"{yj['_meta']['description']} 《{yj['_meta']['book']}》{yj['_meta']['chapter']}.\n\n"
           + table(["Channel", "Organ", "Herbs", "Not read"], [[c["channel"], c["organ"], "、".join(name(h) for h in c["herbs"]), c["unread"] or "—"] for c in yj["channels"]]))
    md += "\n## The parameters (`prescription.json`)\n\n" + pp["_meta"]["description"] + "\n\n" + table(["Parameter", "Value"], flat(pp["params"], "params"))
    md += f"\n## The pairings (七情, `pairings.json`)\n\n{pr['_meta']['description']} Counts: {json_text(pr['_meta']['type_counts'])}.\n"
    for ty in sorted({p["type"] for p in pr["items"]}):
        ps = [p for p in pr["items"] if p["type"] == ty]
        md += f"\n### {ty} ({len(ps)})\n\n" + table(["Id", "Herb", "With", "Says", "Status"], [[f"`{p['id']}`", name(p["herb"]), name(p["other"]), p["says"], p["status"]] for p in ps])
    md += ("\n**Engine behaviour** — how these tables make a reference quantity, step by step: [prescription model](../../../docs/post-mvp/design/prescription-model.md) §3 and §6. "
           "The study reference of a development build shows the result for any formula and person.\n")
    return Pack("reference", "the prescription model and the reference quantities", "TCM clinical + pharmacy", md, scope(ctx, *REFERENCE))


# ── the five-phase priors ───────────────────────────────────────────────────

WUXING = ("wuxing/correspondences.json", "wuxing/ganzhi.json", "wuxing/yunqi.json", "wuxing/engine-params.json")


def wuxing(ctx: Context) -> Pack:
    co, gz, yq, ep = (ctx.data[r] for r in WUXING)
    md = header(ctx, "the five-phase priors (五行・干支・運氣)", "TCM clinical reviewer **and** regulatory reviewer.",
                ["**The correspondences** read from 《素問·陰陽應象大論》: each element's organ, season, colour, flavour, emotion and orifice.",
                 "**The stem and branch tables** and **the 五運六氣 tables**, with the excerpts on the illness of each year's qi.",
                 "**The engine's caps and gains** (`engine-params.json`): the birth chart, the year and the season can tilt the panel only a little. Regulatory: that all of this is framed as a "
                 "cultural tendency reference and never as a diagnosis (the wording is in the `report` namespace of the interface text)."])
    md += (f"\n## Correspondences (`correspondences.json`)\n\n{co['_meta']['description']}. {co['_meta']['fu_and_season_note']}\n\n"
           + table(["Element", "臟", "腑", "Season", "Colour", "Flavour", "Emotion", "Tissue", "Orifice", "Generates", "Controls", "Source", "Status"],
                   [[r["element"], r["zang"], r["fu"], r["season"], r["color"], r["flavor"], r["emotion"], r.get("tissue", ""), " / ".join(f"{v} ({k})" for k, v in r["orifice"].items()),
                     r["generates"], r["controls"], cite(ctx, r["source"]), r["status"]] for r in co["rows"]]))
    md += (f"\n## Stems and branches (`ganzhi.json`)\n\n{gz['_meta']['description']}\n\n" + table(["Stem", "Element", "Polarity"], [[s["id"], s["element"], s["polarity"]] for s in gz["stems"]])
           + "\n" + table(["Branch", "Element", "Hidden stems", "人元司令 (days)", "Polarity (position · qi)"], [[b["id"], b["element"], "、".join(f"{h['stem']} {h['role']}" for h in b["hidden"]), "、".join(f"{s['stem']} {s['days']}" for s in b["siling"]), f"{b['positional_polarity']} · {b['qi_polarity']}"] for b in gz["branches"]])
           + "\n" + table(["Solar term", "Kind", "Longitude", "Opens the month"], [[t["name"], t["kind"], t["longitude"], t.get("opensMonthBranch") or ""] for t in gz["solar_terms"]]))
    md += f"\n## 五運六氣 (`yunqi.json`)\n\n{yq['_meta']['description']}\n\n" + table(["Table", "Value"], [[f"`{k}`", json_text(v)] for k, v in yq.items() if k not in ("_meta", "min_bing_excerpts", "examples")])
    md += "\n**The illness of each year's qi**\n\n" + table(["Year", "Excerpt", "Citation"], [[k, v["excerpt"], cite(ctx, v["citation"])] for k, v in yq["min_bing_excerpts"].items()])
    md += "\n**Worked years**\n\n" + table(["Year", "干支", "歲運", "司天", "在泉", "客氣"], [[e["year"], e["ganzhi"], f"{e['suiyun']['element']}{e['suiyun']['kind']}", e["sitian"], e["zaiquan"], "、".join(e["guest_qi"])] for e in yq["examples"]])
    md += f"\n## The engine's parameters (`engine-params.json`)\n\n{ep['_meta']['description']}\n\n" + table(["Path", "Value"], flat(ep))
    return Pack("wuxing", "the five-phase priors (五行・干支・運氣)", "TCM clinical + regulatory", md, scope(ctx, *WUXING))


# ── citations ───────────────────────────────────────────────────────────────

def strings(node: Any):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)


def citation_uses(ctx: Context) -> dict[str, list[str]]:
    """citation id → where the knowledge base and the learning book use it."""
    ids = set(ctx.citations)
    out: dict[str, list[str]] = defaultdict(list)

    def add(cid: str, where: str) -> None:
        if where not in out[cid]:
            out[cid].append(where)
    for rel, d in ctx.data.items():
        if rel in ("citations.json", "sources.json"):
            continue
        listed = {key for key, _ in review.UNITS.get(rel, [])}
        for uid, item in review.items_of(rel, d):
            for s in strings(item):
                if s in ids:
                    add(s, f"{rel} {uid}")
        for k, v in d.items():
            if k not in listed:
                for s in strings(v):
                    if s in ids:
                        add(s, f"{rel} {k}")
    for page, cid in book_quotes(ctx):
        add(cid, f"the book {page}")
    return out


QUOTE = re.compile(r"^> 「(.+?)」——《(.+?)》\s*$", re.M)


def citation_of(quote: str, source: str, ctx: Context) -> str | None:
    """The rule of packages/kb/node/book.ts `citationOf`: a verified citation of the book named, whose chapter holds the chapter named and whose text holds the quotation."""
    body = re.sub(r"[。！？]+$", "", quote)
    book, _, chapter = source.partition("·")
    return next((c["id"] for c in ctx.citations.values() if c["verified"] and c["book"] == book and chapter in c["chapter"] and body in c["quote_zh_hant"]), None)


def book_quotes(ctx: Context) -> list[tuple[str, str]]:
    out = []
    for page, t in ctx.targets["docs/book/zh-Hant"].items():
        for m in QUOTE.finditer(t):
            cid = citation_of(m.group(1), m.group(2), ctx)
            if cid:
                out.append((page, cid))
    return out


def citations(ctx: Context) -> Pack:
    rel = "citations.json"
    uses = citation_uses(ctx)
    md = header(ctx, "citations (引文)", "TCM clinical reviewer.",
                ["**That each quotation supports what it is used for** — the build proves only that the text exists in the source, verbatim; the column *Used by* says where each one is used.",
                 "**The chapter and the edition** each quotation is attributed to.", "**Unused citations** — kept for the SOP or the reasoning text, or to be removed."])
    md += f"\n{ctx.data[rel]['_meta']['description']} {ctx.data[rel]['_meta']['note']}\n"
    for book in sorted({c["book"] for c in ctx.citations.values()}):
        cs = [c for c in ctx.citations.values() if c["book"] == book]
        md += f"\n## 《{book}》 ({len(cs)})\n\n" + table(["Id", "Chapter", "Quotation", "Verified", "Used by"], [[f"`{c['id']}`", c.get("chapter", ""), c["quote_zh_hant"], "yes" if c["verified"] else "**no**", "; ".join(uses.get(c["id"], [])) or "—"] for c in cs])
    return Pack("citations", "citations (引文)", "TCM clinical", md, [(rel, ctx.units(rel))])


# ── the glossary and the name folding ───────────────────────────────────────

def glossary(ctx: Context) -> Pack:
    rels = ("glossary.json", "safety/name-fold.json")
    g, nf = ctx.data[rels[0]], ctx.data[rels[1]]
    md = header(ctx, "the glossary and the name folding (術語)", "Linguistic reviewer.",
                ["**Each term:** the English rendering (after WHO IST 2007, the `source`), the pinyin, the alternatives, the note; that the interface and the knowledge base use it consistently (`pnpm check:i18n` rejects a catalog that does not).",
                 "**The name folding** (`safety/name-fold.json`, generated): each Traditional character of a herb or food name with its one Simplified form, so that an allergy typed in either script "
                 "is matched. A wrong pair means a missed allergy: check the pairs, not the generator."])
    for dom in sorted({i["domain"] for i in g["items"]}):
        rows = [[i["zh-Hant"], i.get("pinyin") or "", i["en"], "、".join(i.get("alt") or []) or "—", i.get("note") or "—", i.get("source") or "—", i["status"]] for i in g["items"] if i["domain"] == dom]
        md += f"\n## {dom} ({len(rows)})\n\n" + table(["Term", "Pinyin", "English", "Also", "Note", "Source", "Status"], rows)
    pairs = [tuple(chr(int(x, 16)) for x in e.split(":")) for e in nf["fold"]]
    md += f"\n## The name folding ({len(pairs)} characters)\n\n{nf['_meta']['description']}\n\n" + " · ".join(f"{a}→{b}" for a, b in pairs) + "\n"
    return Pack("glossary", "the glossary and the name folding", "linguistic", md, scope(ctx, *rels))


AREAS: dict[str, Callable[[Context], Pack]] = {
    "symptoms": symptoms, "tongue-pulse": tongue_pulse, "constitutions": constitutions, "panel": panel, "herbs": herbs, "guidance": guidance, "reference": reference,
    "wuxing": wuxing, "citations": citations, "glossary": glossary,
}
