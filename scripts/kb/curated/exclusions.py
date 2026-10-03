"""Mutually exclusive symptom groups, soft conflicts and look-alike splits (SOP §5.2–§5.3) — curated draft.

  · `exclusive`: the symptoms cannot all be true at once (a pulse cannot be both floating and sinking). The UI prevents choosing two; if both
    still arrive, the engine reports a conflict, never picks one silently, and the assessment's confidence drops.
  · `conflict`: unusual together but possible (cold limbs with heat in the palms: a mixed cold-heat pattern). The engine reports it so the app can
    ask a follow-up; scoring is unchanged.
  · `splits`: look-alike symptoms that must never be merged (SOP §5.2); `summary` is the one-line difference the UI shows as a hint.
The pulse groups are generated from curated/exam.py (single source with pulse.json).
"""
from __future__ import annotations


def g(gid: str, kind: str, symptoms: list[str], zh: str, en: str) -> dict:
    return {"id": gid, "kind": kind, "symptoms": symptoms, "reason": {"zh-Hant": zh, "en": en}}


def split(sid: str, symptoms: list[str], zh: str, en: str) -> dict:
    return {"id": sid, "symptoms": symptoms, "summary": {"zh-Hant": zh, "en": en}}


GROUPS = [
    g("X_COLD_KIND", "exclusive", ["S_AVERSION_COLD", "S_FEAR_COLD"], "惡寒（加衣仍冷）與畏寒（得溫則減）是兩種不同的怕冷，請選較符合的一種。", "Aversion to cold (not relieved by clothing) and cold intolerance (relieved by warmth) are different; choose the one that fits."),
    g("X_STOOL_CONSISTENCY", "exclusive", ["S_LOOSE_STOOL", "S_CONSTIPATION"], "大便不會同時是稀的又是乾結的；若時稀時乾，請以最近最明顯的為準。", "Stools are not loose and dry at once; if they alternate, choose the more recent or prominent one."),
    g("X_URINE_AMOUNT", "exclusive", ["S_URINE_YELLOW_SCANTY", "S_URINE_CLEAR_LONG"], "小便不會同時量少色黃又量多色清。", "Urine is not scanty and dark and also copious and clear."),
    g("X_FOOD_TEMPERATURE", "exclusive", ["S_PREFER_HOT_FOOD", "S_PREFER_COLD_FOOD"], "飲食偏好熱與偏好冷不能同時成立。", "A preference for hot food and for cold food cannot both hold."),
    g("X_THIRST", "exclusive", ["S_THIRST_COLD_DRINK", "S_THIRST_NO_DRINK", "S_THIRST_LIGHT", "S_NO_THIRST"], "口渴的程度與喝水意願只能選一種描述。", "Choose one description of thirst and willingness to drink."),
    g("X_TINNITUS", "exclusive", ["S_TINNITUS_HIGH_LOUD", "S_TINNITUS_THIN"], "耳鳴的聲音是大如潮或細如蟬，請選一種。", "Tinnitus is either loud like surf or thin like cicadas; choose one."),
    g("X_NOSE", "exclusive", ["S_RUNNY_NOSE_CLEAR", "S_NASAL_CONGESTION"], "「鼻塞流清涕」與「鼻塞（無明顯鼻涕）」請選一種。", "'Blocked nose with clear discharge' and 'blocked nose without much discharge' are alternatives."),
    g("X_FACE_COLOUR", "exclusive", ["S_FACE_SALLOW", "S_FACE_PALE", "S_FACE_RED", "S_FACE_DARK"], "面色只能選一種主要的顏色。", "Choose one main complexion colour."),
    g("X_LIPS_NAILS", "exclusive", ["S_LIPS_NAILS_PALE", "S_LIPS_PURPLE"], "唇甲不會同時淡白又青紫。", "Lips and nails are not both pale and purple."),
    g("X_ABD_PRESS", "exclusive", ["S_ABD_PREFER_PRESS", "S_ABD_REFUSE_PRESS"], "腹部喜按與拒按相反，請選一種。", "Preferring and refusing pressure are opposites; choose one."),
    g("X_TONGUE_BODY", "exclusive", ["T_BODY_PALE", "T_BODY_PALE_SWOLLEN", "T_BODY_RED", "T_BODY_CRIMSON", "T_BODY_PURPLE"], "舌質顏色只能選一種。", "Choose one tongue body colour."),
    g("X_TONGUE_SHAPE", "exclusive", ["T_SWOLLEN", "T_THIN"], "舌體不會同時胖大又瘦薄。", "The tongue is not both swollen and thin."),
    g("X_TONGUE_COAT", "exclusive", ["T_COAT_THIN_WHITE", "T_COAT_WHITE_GREASY", "T_COAT_SLIPPERY", "T_COAT_YELLOW", "T_COAT_YELLOW_GREASY", "T_COAT_THICK_ROT", "T_COAT_PEELED_ALL"],
      "整體舌苔只能選一種（苔乾可與其中之一並存）。", "Choose one overall coating (a dry coating can accompany one of them)."),
    g("X_TONGUE_CRACKS", "exclusive", ["T_CRACKS_CENTER", "T_CRACKS_ALL"], "裂紋在舌中或滿舌，請選一種。", "Cracks are either central or all over; choose one."),
    # soft conflicts
    g("C_SWEAT", "conflict", ["S_NO_SWEAT", "S_SPONTANEOUS_SWEAT"], "「無汗」與「自汗」並見不尋常，請確認各自發生的情境。", "No sweating together with spontaneous sweating is unusual; please say in which situation each occurs."),
    g("C_THIRST_DRINK", "conflict", ["S_THIRST_COLD_DRINK", "S_PREFER_HOT_DRINK"], "渴喜冷飲與偏愛熱飲並見不尋常，請確認。", "Thirst for cold drinks with a preference for hot drinks is unusual; please confirm."),
    g("C_COLD_HEAT_LIMBS", "conflict", ["S_COLD_LIMBS", "S_HEAT_PALMS_SOLES"], "手足冰冷與手心腳心發熱並見，可能是寒熱錯雜，請確認。", "Cold limbs with hot palms and soles may be a mixed cold-heat pattern; please confirm."),
    g("C_FOOD_THIRST", "conflict", ["S_PREFER_HOT_FOOD", "S_THIRST_COLD_DRINK"], "喜熱食卻渴喜冷飲並見，請確認。", "Preferring hot food but thirsty for cold drinks is unusual; please confirm."),
]

SPLITS = [
    split("SPLIT_COLD", ["S_AVERSION_COLD", "S_FEAR_COLD", "S_AVERSION_WIND"], "惡寒：加衣被仍冷，多見剛受涼；畏寒：得溫則減，多見陽氣不足；惡風：遇風才不適。", "Aversion to cold: still cold under clothing, often a recent chill; cold intolerance: eases with warmth, often weak yang; aversion to wind: bothered only by drafts."),
    split("SPLIT_FEVER", ["S_FEVER", "S_FEVER_UNEVEN", "S_TIDAL_FEVER", "S_ALTERNATING_CHILLS_FEVER", "S_HEAT_PALMS_SOLES"], "發熱、身熱不揚、午後潮熱、寒熱往來與手足心熱是不同的熱型，意義各異。", "Fever, unsurfaced fever, afternoon tidal fever, alternating chills and fever, and heat in the palms and soles are different heat types with different meanings."),
    split("SPLIT_SWEAT", ["S_SPONTANEOUS_SWEAT", "S_NIGHT_SWEAT"], "自汗：白天動則汗出；盜汗：睡中汗出、醒則止。", "Spontaneous sweating: by day on slight effort; night sweating: during sleep, stopping on waking."),
    split("SPLIT_THIRST", ["S_THIRST_COLD_DRINK", "S_THIRST_NO_DRINK"], "渴喜冷飲偏熱；渴不欲飲偏濕或有瘀。", "Thirst for cold drinks leans towards heat; thirst without wanting to drink leans towards dampness or stasis."),
    split("SPLIT_ABDOMEN_PRESS", ["S_ABD_PREFER_PRESS", "S_ABD_REFUSE_PRESS", "S_ABD_PAIN_PREFER_WARM_PRESS"], "喜按多屬虛，拒按多屬實；喜溫喜按多屬虛寒。", "Liking pressure usually means deficiency, refusing it excess; liking warmth and pressure suggests cold deficiency."),
    split("SPLIT_EPIGASTRIC", ["S_EPIGASTRIC_PAIN", "S_EPIGASTRIC_BURNING", "S_EPIGASTRIC_FULLNESS"], "脹痛偏氣滯；隱隱灼痛偏胃陰虛或有熱；痞滿偏脾胃氣機不暢。", "Distending pain leans towards qi stagnation; dull burning towards stomach yin deficiency or heat; fullness towards a sluggish spleen-stomach qi flow."),
    split("SPLIT_TINNITUS", ["S_TINNITUS_HIGH_LOUD", "S_TINNITUS_THIN"], "耳鳴如潮多屬實，如蟬多屬虛。", "Tinnitus like surf is usually excess; like cicadas usually deficiency."),
    split("SPLIT_BACK", ["S_LOW_BACK_SORE", "S_LOW_BACK_COLD"], "腰膝痠軟偏腎虛；痠冷偏腎陽虛。", "Aching and weak points to kidney deficiency; aching with cold to kidney yang deficiency."),
    split("SPLIT_TONGUE_RED", ["T_BODY_RED", "T_TIP_RED", "T_EDGE_RED"], "全舌紅、舌尖紅、舌邊紅的分區不同，意義也不同（心火、肝膽有熱…）。", "A red tongue overall, at the tip, or at the edges are different zones with different meanings (heart fire, liver-gallbladder heat…)."),
    split("SPLIT_TONGUE_DOTS", ["T_RED_DOTS_TIP", "T_RED_DOTS_EDGE", "T_RED_DOTS_CENTER"], "紅點在舌尖、舌邊或舌中，分別提示心火、肝膽火熱、胃腸熱盛。", "Red dots at the tip, edges or centre suggest heart fire, liver-gallbladder heat, or stomach-intestine heat respectively."),
]
