"""Review packs (tasks K-17, PM-57; docs/content-review.md §4): everything a reviewer needs to decide one area, with what the engine currently *does* with it written next to the data.

    .venv/bin/python -m scripts.review.pack <area> [--out DIR]      area: one of AREAS below, or all
    pnpm review:pack <area>

Areas — the knowledge base: red-flags · safety-rules · patterns (with the 證素) · formulas · symptoms (with the questions, exclusions and first-impression signs) · tongue-pulse ·
constitutions · panel (the panel model, the scoring parameters and 營衛) · herbs (the curated herbs in full, the derived ones by their rules and a stratified sample, §4.3) ·
guidance (foods, acupoints, lifestyle) · reference (the prescription model's tables and the reference quantities) · wuxing (the five-phase priors) · citations · glossary (with the
name folding); outside data/: ui (the interface text) · book (the learning book) · course (the course and its textbook) — the last two as chapter-by-chapter worksheets with
every quotation and its explanation. Every data file is in the scope of one pack or listed in NOT_IN_A_PACK with the reason (a test checks it).

Writes `<out>/<area>/PACK.md` (default out: review/packs, git-ignored — packs are derived and regenerated from the data) and `<out>/<area>/record-skeleton.yaml`, a review record
prefilled with the units of the pack and their **current content hashes** (copy it to review/records/ when the reviewer has decided; if changes were agreed, apply them, rebuild and
regenerate the pack first, because a record names the hashes of the final content). The engine annotations come from the Python oracle (the engine's reference implementation, checked for
parity on every build) and from the data tables — they show behaviour, they are not part of what is reviewed.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Callable

from scripts.kb.common import DATA, ROOT
from scripts.review import areas_kb, areas_text
from scripts.review.base import Context, Pack, both, cites, header, json_text, table, zh

OUT = ROOT / "review" / "packs"
__all__ = ["AREAS", "Context", "NOT_IN_A_PACK", "Pack", "both", "build", "main", "table"]


# ── red flags and scope ─────────────────────────────────────────────────────

C_CELL = {"RF_C_MINOR": ("population", "minor_under_18"), "RF_C_PREGNANT": ("population", "pregnant"), "RF_C_LACTATING": ("population", "lactating")}


def cell_of(rf: dict) -> tuple[str, str]:
    if rf["level"] == "A":
        return "condition", "red_flag_A"
    if rf["level"] == "B":
        return "condition", "red_flag_B"
    return C_CELL.get(rf["id"], ("condition", "serious_chronic_disease"))


NOTICE_OF = {("condition", "red_flag_A"): "N-A (emergency)", ("condition", "red_flag_B"): "N-B (within 24 h)", ("population", "minor_under_18"): "N-MINOR", ("population", "pregnant"): "N-PREG",
             ("population", "lactating"): "N-LACT", ("condition", "serious_chronic_disease"): "N-SERIOUS"}


def red_flags(ctx: Context) -> Pack:
    rel = "diagnosis/red-flags.json"
    prof = ctx.scope["profiles"]
    rows = []
    for rf in ctx.data[rel]["items"]:
        dim, key = cell_of(rf)
        r, d = prof["release"][dim][key], prof["dev"][dim][key]
        rows.append([f"`{rf['id']}`", rf["level"], zh(rf["text"]), rf["text"].get("en", ""), NOTICE_OF[(dim, key)], f"{r['level']} / {d['level']}", "yes" if rf["level"] in "AB" else "no"])
    md = header(ctx, "red flags and scope", "Physician **and** a second reviewer of another role (pharmacy or TCM clinical); the physician review blocks any release.",
                ["**Completeness:** is any condition that needs urgent care missing from A or B? Is any C item (outside the intended scope) missing?",
                 "**Plain language:** can a layperson answer each item without help? Is anything alarming where it need not be?",
                 "**The A / B boundary:** is each item in the right urgency class (emergency now vs. a doctor within 24 hours)?",
                 "**Behaviour:** \"not sure\" counts as *yes* for A and B; a positive A/B item can be cleared only by an explicit, recorded correction (safety policy §2.2, §3).",
                 "**Scope cells and emergency numbers** (below): is each population, condition and state at the right level and notice? Are the numbers right for the region?"])
    md += "\n## Red-flag items\n\n" + table(["Id", "Level", "zh-Hant", "English", "Notice shown", "Output level release / dev", "Emergency numbers"], rows)
    md += "\n**Engine behaviour:** every item is asked in the screening step; a *yes* or *unsure* answer raises the notice in the *Notice shown* column, and the flow always continues (the notice is acknowledged, then the result is shown at the level for that profile).\n"

    cells = []
    for dim in ("population", "condition", "state"):
        for key in sorted(prof["release"][dim]):
            r, d = prof["release"][dim][key], prof["dev"][dim][key]
            cells.append([dim, f"`{key}`", f"{r['level']} · {r['notice']}", f"{d['level']} · {d['notice']}"])
    md += "\n## Scope profiles (`config/scope-profiles.json`)\n\n" + table(["Dimension", "Cell", "release (level · notice)", "dev (level · notice)"], cells)
    md += f"\nSafety enforcement: release `{prof['release']['safety_enforcement']}`, dev `{prof['dev']['safety_enforcement']}`. Effective level = the most restrictive matched cell; effective notice = the most severe.\n"

    em = ctx.data["safety/emergency.json"]
    rows = [[f"`{r['id']}`", both(r["name"]), ", ".join(f"{n['number']} ({n['label']['en']})" for n in r["emergency"]) or "—", ", ".join(f"{n['number']} ({n['label']['en']})" for n in r["crisis"]) or "—", r["status"]] for r in em["regions"]]
    md += "\n## Emergency numbers (`safety/emergency.json`)\n\nThere is no default region: numbers are shown for a region the person chose or whose time zone matches, otherwise \"call your local emergency number\". A wrong number is a safety incident; a row is verified only when a regional owner has checked it against an official source (the `verification` record), and a public build ships only verified rows.\n\n" + table(["Region", "Name", "Emergency", "Crisis support", "Status"], rows)
    terms = ctx.data["safety/red-flag-terms.json"]["items"]
    level = {rf["id"]: rf["level"] for rf in ctx.data[rel]["items"]}
    words = lambda ts: " · ".join(t if isinstance(t, str) else " + ".join(t) for t in ts) or "—"
    md += ("\n## The words that re-open the screening (`safety/red-flag-terms.json`, AI help — Release F)\n\n"
           "During AI help's conversation (development builds only) the device checks what the person types, **before it is sent**: a level-A or -B item answered *no* is asked "
           "again, a level-C item asks the person to check the profile. A word joined with *+* needs every part in one message. Negations are not read, on purpose. Look at: an item "
           "a person would describe in words the list misses, in either language; and ordinary complaints the list would catch (the cost of a catch is one more question).\n\n"
           + table(["Id", "Level", "zh-Hant", "English"], [[f"`{t['id']}`", level[t["id"]], words(t["zh-Hant"]), words(t["en"])] for t in terms]))
    scope = [(rel, ctx.units(rel)), ("config/scope-profiles.json", ctx.units("config/scope-profiles.json", "*")), ("safety/emergency.json", ctx.units("safety/emergency.json")),
             ("safety/red-flag-terms.json", ctx.units("safety/red-flag-terms.json"))]
    return Pack("red-flags", "red flags and scope", "physician + a second reviewer", md, scope)


# ── safety rules ────────────────────────────────────────────────────────────

def affected(ctx: Context, target: dict) -> str:
    """What a rule's target selects today, in words (formulas by name; the rest described)."""
    fs = ctx.formulas
    name = lambda f: f"{f['id']} {zh(f['name'])}"          # noqa: E731
    if "herb_pregnancy" in target:
        want = {"avoid"} if target["herb_pregnancy"] == "avoid" else {"avoid", "caution"}
        hit = [name(f) for f in fs if f.get("pregnancy") in want]
        return f"{len(hit)} formulas flagged `{target['herb_pregnancy']}`" + (": " + ", ".join(hit[:12]) + (" …" if len(hit) > 12 else "") if hit else "")
    if "herb_interaction" in target:
        hit = [name(f) for f in fs if target["herb_interaction"] in f.get("interactions", [])]
        return f"{len(hit)} formulas carry the interaction tag `{target['herb_interaction']}`" + (": " + ", ".join(hit[:12]) + (" …" if len(hit) > 12 else "") if hit else "")
    if "formula_tier" in target:
        hit = [name(f) for f in fs if f["tier"] in target["formula_tier"]]
        return f"{len(hit)} formulas of tier {'/'.join(target['formula_tier'])}"
    if "acupoints" in target:
        return "the points " + "、".join(target["acupoints"])
    if "food_pregnancy_caution" in target:
        return "the foods " + "、".join(ctx.data["treatment/guidance.json"]["food_pregnancy_caution"])
    if "herb_in_user_allergy_list" in target:
        return "any formula or food containing a herb or food the person listed as an allergen (matched by name)"
    if "conflict" in target:
        return f"a formula whose nature opposes the person's panel direction (`{target['conflict']}`; thresholds in scoring-params `safety.conflict`)"
    if "flavor_share_over" in target:
        return f"a formula whose share of one flavour exceeds {target['flavor_share_over']}"
    if "herb_pairs" in target:
        return "a modification that adds a herb forming a 十八反 / 十九畏 pair with the formula (list below)"
    if "effect" in target:
        return f"formulas with the effect `{target['effect']}`"
    if "output_level_max" in target:
        return f"the whole output: capped at {target['output_level_max']}"
    return json_text(target)


def safety_rules(ctx: Context) -> Pack:
    rel = "safety/rules.json"
    rows = []
    for r in ctx.rules["rules"]:
        rows.append([f"`{r['id']}`", r["severity"], json_text(r["applies_to"]), affected(ctx, r["target"]), zh(r["message"]), r["message"].get("en", ""), r.get("citation", "—")])
    md = header(ctx, "safety rules", "Physician **and** a second reviewer of another role (pharmacy or TCM clinical).",
                ["**Each rule:** is the trigger right (who it applies to), is the target right (what it removes or marks), is the severity right (*hard* = removed in release, only marked in dev; *soft* = always only marked)?",
                 "**The message** shown to the person (both languages): calm, specific, no claim beyond the source.",
                 "**Missing rules:** interactions, populations or herb hazards the list does not cover.",
                 "**十八反 / 十九畏 pairs, dose references and the pregnancy points** (below) are reviewed with the rules."])
    md += "\n## Rules\n\n" + table(["Id", "Severity", "Applies to", "Engine behaviour: affects", "zh-Hant message", "English message", "Citation"], rows)
    inc = ctx.rules["incompatibilities"]
    md += "\n## 十八反 / 十九畏 (`incompatibilities`)\n\n" + str(inc.get("note", "")) + f"  (citation `{inc.get('citation', '—')}`)\n\n**十八反**\n\n"
    md += ("The safety rules match the herbs of a composition **by id**, against what each name of a row covers in that row: the herb itself, its processed forms and parts, "
           "standard synonyms, and the herbs whose own Pharmacopoeia caution names the other side. `validate_kb` fails when a caution states a pair no row makes. "
           "**Check each coverage** — a herb missing here is never stopped; a herb listed wrongly is stopped for nothing.\n\n")

    def covered(row: dict[str, Any], name: str) -> str:
        ids = row["herbs"].get(name, [])
        return "、".join(f"{ctx.herbs[i]['name']['zh-Hant']} `{i}`" for i in ids) if ids else "— (no herb of the knowledge base)"
    md += table(["Herb", "Covers", "Opposes", "Covers"], [[h["herb"], covered(h, h["herb"]), o, covered(h, o)] for h in inc.get("shibafan", []) for o in h["opposes"]]) + "\n**十九畏**\n\n"
    md += table(["A", "Covers", "B", "Covers"], [[h["a"], covered(h, h["a"]), h["b"], covered(h, h["b"])] for h in inc.get("shijiuwei", [])])
    md += "\n## Pregnancy acupoints\n\n" + "、".join(ctx.rules["pregnancy_acupoints"]) + "\n"
    md += "\n## Dose references\n\n```json\n" + json_text(ctx.rules["dose_references"]) + "\n```\n"
    return Pack("safety-rules", "safety rules", "physician + a second reviewer", md, [(rel, ctx.units(rel))])


# ── patterns ────────────────────────────────────────────────────────────────

def asked_by(ctx: Context, symptom_id: str) -> str:
    qs = [q["id"] for q in ctx.questions if any(symptom_id in o["symptoms"] for o in q["options"])]
    return ", ".join(qs) if qs else "— (self-observed or not asked)"


# A pattern whose typical patient scores less than this many points above the next pattern is flagged for the clinical reviewer. It was 10 until K-07 (decided 2026-10-04)
# raised the closest pairs above that; 20 keeps the few closest pairs in view.
CONFUSABLE_MARGIN = 20.0


def patterns(ctx: Context) -> Pack:
    rel = "diagnosis/patterns.json"
    md = header(ctx, "patterns (證型)", "TCM clinical reviewer.",
                ["**Evidence table:** each symptom's weight (1–3) for the pattern — are the strong ones really characteristic, are important ones missing, are any wrongly positive?",
                 "**Required-any** symptoms and the **against** list (what argues against the pattern).",
                 "**Panel projection** (which body dimensions the pattern moves, per degree) and the 證素 decomposition.",
                 "**Treatment principle, formulas, diet, acupoints, lifestyle** and the **citations** that support the pattern.",
                 "**Confusable pairs** flagged under *Engine behaviour*: do the symptoms that should separate them carry enough weight?"])
    for p in ctx.patterns:
        t = ctx.typical(p["id"])
        scores = t["expect"]["scores"]
        ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
        own, rival = scores[p["id"]], next((kv for kv in ranked if kv[0] != p["id"]), ("—", 0.0))
        margin = own - rival[1]
        md += f"\n---\n\n## `{p['id']}` {both(p['name'])}\n\n- **Group:** {p['group']} · **status:** {p['status']} · **max score:** {p['max_score']}\n- **Principle (治則):** {p['principle']}\n- **Tongue / pulse:** {p.get('tongue_pulse_note', '—')}\n"
        tr = p["treatment"]
        md += f"- **Treatment text:** foods {'、'.join(tr['foods'])} · acupoints {'、'.join(tr['acupoints'])} · lifestyle: {tr['lifestyle']}\n"
        md += f"- **Formulas:** {', '.join(p['formulas'])} · **elements (證素):** {', '.join(p['elements'])}\n"
        md += f"- **Panel projection per degree:** {json_text(p['panel_projection_per_degree'])}\n\n"
        w = sorted(p["weights"].items(), key=lambda kv: (-kv[1], kv[0]))
        md += "**Evidence (symptom → weight)**\n\n" + table(["Symptom", "zh-Hant", "Weight", "Required-any", "Asked by question"], [[f"`{s}`", ctx.symptoms[s]["zh-Hant"] if s in ctx.symptoms else "", wt, "yes" if s in p["required_any"] else "", asked_by(ctx, s)] for s, wt in w])
        if p["against"]:
            md += "\n**Against (penalty)**\n\n" + table(["Symptom", "zh-Hant", "Penalty"], [[f"`{s}`", ctx.symptoms[s]["zh-Hant"] if s in ctx.symptoms else "", v] for s, v in sorted(p["against"].items())])
        md += "\n**Citations**\n\n" + cites(ctx, p["citations"])
        flag = " ⚠ **confusable — check the separating symptoms**" if margin < CONFUSABLE_MARGIN else ""
        md += f"\n**Engine behaviour** — the typical patient (every symptom of weight ≥ 2, moderate): this pattern scores **{own:.1f}** (rank {1 + [k for k, _ in ranked].index(p['id'])}); the next is `{rival[0]}` at {rival[1]:.1f}, margin **{margin:.1f}**{flag}. Top three: " + ", ".join(f"`{k}` {v:.1f}" for k, v in ranked[:3]) + ".\n"
    els = "diagnosis/pattern-elements.json"
    md += ("\n---\n\n## The pattern elements (證素, `pattern-elements.json`)\n\nA pattern is also read as location × nature: each element has evidence of its own, and its degree "
           "(3 · score / 100) moves the panel by its projection. Look at: the location and nature each element stands for, its strongest evidence, and the patterns it is part of.\n\n")
    md += table(["Id", "Name", "Location × nature", "Strongest evidence (weight)", "Against", "Projection per degree", "Patterns"],
                [[f"`{e['id']}`", both(e["name"]) if isinstance(e["name"], dict) else e["name"], f"{e['location']} × {e['nature']}",
                  "、".join(f"{ctx.symptom(s)} ({w})" for s, w in sorted(e["weights"].items(), key=lambda kv: (-kv[1], kv[0]))[:6]),
                  "、".join(ctx.symptom(s) for s in sorted(e.get("against", {}))) or "—", json_text(e["projection_per_degree"]), ", ".join(e["patterns"])]
                 for e in ctx.data[els]["items"]])
    return Pack("patterns", "patterns (證型)", "TCM clinical", md, [(rel, ctx.units(rel)), (els, ctx.units(els))])


# ── formulas ────────────────────────────────────────────────────────────────

def formulas(ctx: Context) -> Pack:
    rel = "formulas/formulas.json"
    md = header(ctx, "formulas (方劑)", "TCM clinical reviewer **and** pharmacy reviewer.",
                ["**Composition and roles (君臣佐使)** against the classical source; the proportions and the classical amounts.",
                 "**Indications** (the rationale and the core symptoms) and the **patterns** that recommend the formula.",
                 "**Tier (A / B / C)** and why; **pregnancy** and **interaction** flags; **cautions** (pharmacy).",
                 "**Modifications (加減)** listed with the formula.",
                 "**Verification record:** how the composition was checked against the source text (a *partially verified* row needs a second source)."])
    patterns_of = {f["id"]: [p["id"] for p in ctx.patterns if f["id"] in p["formulas"]] for f in ctx.formulas}
    typical = {p["id"]: ctx.typical(p["id"])["expect"]["formulas"] for p in ctx.patterns}
    for f in ctx.formulas:
        v = f["verification"]
        md += f"\n---\n\n## `{f['id']}` {both(f['name'])}\n\n- **School:** {f['school']} · **source:** 《{f['source']['book']}》 {f['source']['ref']} · **tier:** {f['tier']} ({'; '.join(f['tier_reasons']) or '—'}) · **status:** {f['status']}\n"
        md += f"- **Principle:** {f['principle']} · **pregnancy:** {f['pregnancy']} · **interactions:** {', '.join(f['interactions']) or '—'}\n- **Rationale:** {f['rationale_zh']}\n"
        ss = v.get("second_source")
        second = f"- **Second source ({ss['checked']}):** {ss['site']} — {ss['page']}, entry {ss['entry']}; found {len(ss['herbs_found'])}, not found {', '.join(ss['herbs_not_found']) or 'none'}. {ss['note']} <{ss['url']}> ({ss['method']})\n" if ss else ""
        md += f"- **Verification:** {v['composition_status']}; {v.get('source_note', '')}\n{second}- **Core indications:** {', '.join(f['core_indications'])}\n- **Cautions:** {'；'.join(f['cautions']) or '—'}\n\n"
        md += "**Composition**\n\n" + table(["Herb", "Role", "Proportion", "Classical amount", "Note"], [[c["name"], c["role"], c["proportion"], f"{c['classical_amount']['value']} {c['classical_amount']['unit']} {c['classical_amount'].get('processing') or ''}".strip() if c.get("classical_amount") else "—", c.get("note") or ""] for c in f["composition"]])
        if f.get("modifications"):
            md += "\n**Modifications (加減)**\n\n" + table(["Condition", "Add", "Remove"], [[json_text(m.get("when") or m.get("when_symptoms") or ""), json_text(m.get("add", "")), json_text(m.get("remove", ""))] for m in f["modifications"]])
        md += "\n**Rationale citations**\n\n" + cites(ctx, f["rationale_citations"])
        rows = []
        for pid in patterns_of[f["id"]]:
            rank = typical[pid]
            hit = next((i for i, r in enumerate(rank, 1) if r["id"] == f["id"]), None)
            r = next((x for x in rank if x["id"] == f["id"]), None)
            rows.append([f"`{pid}`", f"{r['explained']:.0%}" if r else "—", f"{r['k']:.2f}" if r else "—", hit if hit is not None else "—"])
        md += "\n**Engine behaviour** — recommended for " + (", ".join(f"`{p}`" for p in patterns_of[f["id"]]) or "no pattern (not recommended by the engine)") + ". For each such pattern's typical patient (share of the panel deviation the formula corrects, scale *k*, rank among all formulas):\n\n"
        md += (table(["Pattern", "Explained", "k", "Rank"], rows) if rows else "")
    return Pack("formulas", "formulas (方劑)", "TCM clinical + pharmacy", md, [(rel, ctx.units(rel))])


AREAS: dict[str, Callable[[Context], Pack]] = {"red-flags": red_flags, "safety-rules": safety_rules, "patterns": patterns, "formulas": formulas, **areas_kb.AREAS, **areas_text.AREAS}

# The data files no pack covers, and why: they are generated from the others or are not medical content (content review §3).
NOT_IN_A_PACK = {
    "geo/cities.json": "place names, coordinates and time zones for the birth-place picker, from GeoNames (CC BY 4.0) — not medical content; always paired with manual entry",
    "herbs/herb-index.json": "the herb browser's index, generated from herbs/herbs.json (reviewed there)",
    "sources.json": "the registry of the works the knowledge base draws on, generated from the other files (docs/kb-sources.md)",
}


def skeleton(ctx: Context, pack: Pack) -> str:
    lines = [f"# Record skeleton for the {pack.title} pack — fill in, then copy to review/records/REV-<year>-<nnnn>.yaml.",
             "# The hashes are the CURRENT content. If changes were agreed, apply them, rebuild the knowledge base, regenerate this pack and use its hashes.",
             "id: REV-YYYY-NNNN", f"area: {pack.area}", "reviewer:", "  role: <tcm-clinical | pharmacy | physician | linguistic | legal>", "  name: \"<name, or (withheld)>\"", "  credential: \"<licence number / issuing body>\"",
             "date: <yyyy-mm-dd>", f"kb_version: \"{pack.version or ctx.fingerprint}\"", "outcome: <accepted | accepted-with-changes | rejected | deferred>", "scope:"]
    for rel, units in pack.scope:
        lines += [f"  - file: {rel}", "    units:"] + [f"      {_yaml_key(u)}: {h}" for u, h in units.items()]
    lines += ["changes: []", "dissent: []", "notes: \"\"", ""]
    return "\n".join(lines)


def _yaml_key(k: str) -> str:
    return f"\"{k}\"" if not k.replace("_", "").replace("-", "").isalnum() else k


def build(area: str, out: Path = OUT, data_dir: Path = DATA) -> list[Path]:
    ctx = Context(data_dir)
    written = []
    for name in (AREAS if area == "all" else [area]):
        pack = AREAS[name](ctx)
        d = out / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "PACK.md").write_text(pack.markdown, encoding="utf-8")
        (d / "record-skeleton.yaml").write_text(skeleton(ctx, pack), encoding="utf-8")
        written += [d / "PACK.md", d / "record-skeleton.yaml"]
    return written


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("area", choices=[*AREAS, "all"])
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)
    for p in build(args.area, args.out):
        print(f"review pack: {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
