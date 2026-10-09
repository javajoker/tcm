"""Build data/config/scope-profiles.json, data/safety/rules.json and data/glossary.json."""
from __future__ import annotations

from .common import DATA, dump
from .curated import glossary, policy, red_flag_terms


def main() -> None:
    dump(DATA / "config" / "scope-profiles.json", {
        "_meta": {"description": "Application configuration: output levels and the dev/release profiles. dev opens everything; release restricts by default. "
                                 "Risky populations/conditions always get a 'see a doctor' notice and the flow continues.",
                  "version": 1},
        "levels": policy.LEVELS, "dimensions": policy.DIMENSIONS, "notice_kinds": policy.NOTICE_KINDS,
        "profiles": policy.PROFILES, "roles": policy.ROLES, "resolution": policy.RESOLUTION,
    })
    dump(DATA / "safety" / "rules.json", {
        "_meta": {"description": "Safety filter rules. severity=hard rules remove the item when the profile suppresses (suppress_hard); a development profile annotates instead of removing. "
                                 "The filter never hides an item silently: a suppressed item is listed with its reason.",
                  "status": "draft", "clinical_review_required": policy.CLINICAL_REVIEW_REQUIRED, "count": len(policy.RULES)},
        "rules": policy.RULES,
        "incompatibilities": {"shibafan": policy.SHIBAFAN, "shijiuwei": policy.SHIJIUWEI, "citation": "bencao-bianxue-18fan-1",
                              "note": "十九畏 pairs are standard teaching, not verified against the local sources. `herbs`: the herbs each name stands for in its row, matched by id."},
        "dose_references": {"minor_fractions": policy.MINOR_DOSE_FRACTIONS, "elderly": policy.ELDERLY_DOSE_FRACTION,
                            "note": "Textbook rules of thumb; never shown as a recommendation (practitioner decides)."},
        "pregnancy_acupoints": policy.PREGNANCY_ACUPOINTS,
    })
    dump(DATA / "safety" / "red-flag-terms.json", {
        "_meta": {"description": "Words that re-open the red-flag screening during AI help's conversation (Release F; docs/post-mvp/design/ai-assisted-intake.md §4): matched on the device "
                                 "before anything is sent; a level-A or -B match asks that item again, a level-C match asks the person to check their profile. A term is a phrase, or a list of "
                                 "phrases that must all occur in one message. Negations are not read: it errs on the side of asking again. Simplified is converted from the Traditional.",
                  "status": "draft", "schema": 1},
        "items": red_flag_terms.items(),
    })
    dump(DATA / "glossary.json", {"_meta": {"description": "zh-Hant ⇄ English glossary (English follows WHO ISTM where known; needs review).", "count": len(glossary.GLOSSARY)},
                                  "items": glossary.GLOSSARY})
    print(f"policy: {len(policy.RULES)} safety rules, {len(policy.PROFILES)} profiles, {len(glossary.GLOSSARY)} glossary terms")


if __name__ == "__main__":
    main()
