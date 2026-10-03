"""Diagnosis engine parameters — the SINGLE source for the Python oracle (scripts/kb/oracle.py) and the TypeScript engine.

Written to data/diagnosis/scoring-params.json by build_params.py. Every value is a draft placeholder awaiting practitioner
calibration (SOP D3); changing one is a data change that regenerates the parity fixtures (tech spec T10, §7.4).
Sources: SOP §4.7 (quality), §9.2 (pattern scoring), §10 (panel), §11 (reconciliation), §12 (formulas), §13 (safety).
"""

SCHEMA = 1

PARAMS = {
    # SOP §9.2: sev(s) — severity factor of a present finding. Findings that are not graded (tongue and pulse features, plain yes/no
    # items: no severity given) count as `ungraded` (SOP §9.5 uses 1.0 for them). The UI always sends an explicit severity for graded symptoms.
    "severity": {"light": 0.6, "moderate": 0.8, "severe": 1.0, "ungraded": 1.0},

    # SOP §4.7: q(s) — data-quality coefficient by the SOURCE of a finding. When a finding carries no explicit source the
    # symptom-id prefix decides (T_ tongue = guided observation, P_ pulse = self-reported pulse, otherwise inquiry).
    "quality": {
        "by_source": {"inquiry": 1.0, "measured": 0.9, "guided": 0.7, "pulse": 0.5},
        "by_prefix": {"T_": "guided", "P_": "pulse"},
        "default_source": "inquiry",
    },

    # SOP §9.2: Pct(p) = max(0, Σ w·sev·q − Σ v·q) ÷ Σ w × 100; no `required_any` symptom present → Pct × factor.
    # Bands: Pct ≥ high → typical; ≥ medium → tendency; ≥ weak → hint only; below → not established.
    "pattern": {"required_any_missing_factor": 0.5, "bands": {"high": 60, "medium": 40, "weak": 20}},

    # SOP §10: observed panel.
    "panel": {
        # A pattern with Pct below the floor does not project onto the panel; degree = degree_max · Pct / 100.
        "noisy_or_floor": 20.0,
        "degree_max": 3.0,
        # noisy-OR saturation per sign: O = degree_max · (1 − Π(1 − min(x, degree_max) / degree_max)).
        # Weights of the panel dimensions in the formula-fit cost ‖·‖²_w (SOP §12.4).
        "dimension_weights": {"organ": 1.0, "liuxie": 0.7, "product": 0.7, "bagang": 0.0},
        # W(e) = zang · mean(zang.qi, zang.yang) + fu · mean(fu.qi, fu.yang)
        "wuxing_function": {"zang": 0.7, "fu": 0.3},
        # 八綱 derived scalars (SOP §10.4)
        "bagang": {"heat_divisor": 3.0, "yang_deficit_weight": 0.5, "yin_deficit_weight": 0.5, "excess_divisor": 6.0, "exterior_divisor": 3.0,
                   # 陰陽 summary of the other axes (engine only): an axis counts as hot/cold/excess/deficient beyond this magnitude
                   "yin_yang_axis_threshold": 0.15},
    },

    # SOP §11: reconciliation and confidence.
    "reconcile": {
        "merge_threshold": 40.0,          # patterns with Pct ≥ this are presented
        "max_patterns": 3,
        "mixed_threshold": 40.0,          # two opposed element groups both ≥ this → 錯雜 (confidence one level lower)
        "tie_margin": 5.0,                # top-two gap below this → prefer the one `aligned` with the reference
        "confidence": {
            "high": {"pct1": 60.0, "margin": 15.0, "coverage": 0.8, "kappa": 0.85},
            "medium": {"pct1": 40.0, "margin": 8.0, "coverage": 0.6},
            "low": {"pct1": 40.0},        # otherwise (Pct1 ≥ this) → low; below → insufficient information
        },
    },

    # SOP §12.4–§12.5: formula selection and modification.
    "formula": {
        "symptom_fit_min": 0.6,           # share of the formula's core indications the user matches
        "k_max": 3.0,                     # relative strength k* ∈ [0, k_max]
        "strength_bands": {"light_below": 0.7, "strong_above": 1.5},
        "role_weights": {"君": 1.0, "臣": 0.6, "佐": 0.35, "使": 0.15},      # 《素問·至真要大論》
        "modification": {"max_add": 2, "max_remove": 1, "add_share": 0.12, "min_gain": 1e-6},
    },

    # SOP §12.3: tiers are COMPUTED from the herbs, never assigned.
    # C: a strong herb, or bitter-cold herbs ≥ c_bitter_cold_share of the effective weight, or a formula outside the MVP (`mvp: false`).
    # B: blood-activating herbs ≥ b_activating_share, or an herb carrying the aristolochic-acid flag. Else A.
    "tier": {"c_bitter_cold_share": 0.45, "b_activating_share": 0.10, "strong_herbs": ["herb-mahuang", "herb-fuzi"],
             "bitter_cold_tag": "苦寒", "activating_tag": "活血", "aristolochic_flag": "aristolochic-risk"},

    # SOP §13.2: R_FLAVOR_EXCESS
    "safety": {"flavor_excess_share": 0.55},

    # SOP §4.8: adaptive questionnaire.
    "questionnaire": {"core_coverage_stop": 0.8, "max_questions": 50, "candidate_pct_floor": 20.0},
}
