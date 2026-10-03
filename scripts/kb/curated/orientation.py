"""Sign lists for the 八綱 / 六邪 first impression (SOP §8.2) — curated draft, awaiting clinical review.

The first impression is ONLY used for routing (external vs internal channel), for the consistency check against the final panel (真寒假熱 …) and for
the explanation; the final 八綱 scalars are derived from the panel (SOP §10.4). Each list holds symptom ids (tongue/pulse features included).
"""

EXTERNAL_TRIGGERS = ["S_AVERSION_COLD", "S_FEVER", "S_SORE_THROAT", "S_NASAL_CONGESTION", "S_RUNNY_NOSE_CLEAR", "S_COUGH_DRY", "S_COUGH_WEAK", "S_COUGH_PHLEGM_YELLOW"]

# 表: acute onset + 惡寒 (necessary) + at least one supporting sign; 半表半裡: alternating chills and fever, or bitter mouth with hypochondriac fullness
EXTERIOR = {"required": "S_AVERSION_COLD", "supporting": ["S_FEVER", "S_BODY_ACHE", "S_HEADACHE", "S_NASAL_CONGESTION", "S_RUNNY_NOSE_CLEAR", "P_FLOAT"],
            "half": [["S_ALTERNATING_CHILLS_FEVER"], ["S_BITTER_MOUTH", "S_HYPOCHONDRIAC_DISTENSION"]]}

COLD_SIGNS = ["S_FEAR_COLD", "S_COLD_LIMBS", "S_BLAND_MOUTH", "S_LOOSE_STOOL", "S_URINE_CLEAR_LONG", "S_PREFER_HOT_FOOD", "S_PREFER_HOT_DRINK", "S_NO_THIRST",
              "S_UNDIGESTED_STOOL", "S_LOW_BACK_COLD", "T_BODY_PALE", "T_BODY_PALE_SWOLLEN", "T_COAT_WHITE_GREASY", "T_COAT_SLIPPERY"]
HEAT_SIGNS = ["S_FEAR_HEAT", "S_THIRST_COLD_DRINK", "S_CONSTIPATION", "S_URINE_YELLOW_SCANTY", "S_PREFER_COLD_FOOD", "S_BITTER_MOUTH", "S_FACE_RED", "S_RED_EYES",
              "S_MOUTH_ULCERS", "S_HEAT_PALMS_SOLES", "S_TIDAL_FEVER", "T_BODY_RED", "T_BODY_CRIMSON", "T_COAT_YELLOW", "T_COAT_YELLOW_GREASY"]
DEFICIENCY_SIGNS = ["S_FATIGUE", "S_LAZY_SPEAK", "S_SHORT_BREATH", "S_ABD_PREFER_PRESS", "S_SPONTANEOUS_SWEAT", "S_NIGHT_SWEAT", "S_SPIRIT_WITHDRAWN", "S_LOW_VOICE",
                    "S_COUGH_WEAK", "S_ABD_PAIN_PREFER_WARM_PRESS", "S_ABD_DISTENSION_INTERMITTENT", "T_TENDER", "T_THIN", "P_DEFICIENT"]
EXCESS_SIGNS = ["S_PAIN_DISTENDING", "S_ABD_REFUSE_PRESS", "S_CONSTIPATION", "S_HEAD_DISTENDING", "S_IRRITABLE", "S_STABBING_PAIN_FIXED", "S_PAIN_NIGHT_WORSE",
                "S_EPIGASTRIC_FULLNESS", "T_COAT_THICK_ROT", "T_ECCHYMOSIS", "P_EXCESS"]

# a lean needs this many more signs on one side than on the other
LEAN_MARGIN = 2
