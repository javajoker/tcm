"""Symptom / sign registry (curated). Format per line:  ID | 繁體中文 | English | dimension.

Dimensions follow the 12-dimension inquiry of the SOP (十問歌 extended) plus the four examinations:
cold-heat, sweat, head-body, stool-urine, diet-taste, chest-abdomen, ear-eye-throat, thirst, sleep,
emotion, menses, qi-spirit-form, face-skin, voice-breath, tongue, pulse.

English terms follow WHO International Standard Terminologies on Traditional Medicine where the
author knows them; all English is `needs-review` (see data/README.md).
"""

_TABLE = """
# ── 寒熱 cold-heat ──
S_AVERSION_COLD|惡寒（加衣被仍冷）|aversion to cold (not relieved by clothing)|cold-heat
S_FEAR_COLD|畏寒（得溫則減）|cold intolerance (relieved by warmth)|cold-heat
S_AVERSION_WIND|惡風|aversion to wind|cold-heat
S_FEVER|發熱|fever|cold-heat
S_FEVER_UNEVEN|身熱不揚|unsurfaced fever|cold-heat
S_COLD_LIMBS|手足冰冷|cold limbs|cold-heat
S_HEAT_PALMS_SOLES|五心煩熱／手足心熱|heat in the five centres (palms, soles, chest)|cold-heat
S_TIDAL_FEVER|午後潮熱|tidal fever (afternoon)|cold-heat
S_ALTERNATING_CHILLS_FEVER|往來寒熱|alternating chills and fever|cold-heat
S_FEAR_HEAT|怕熱喜涼|heat intolerance|cold-heat
# ── 汗 sweat ──
S_SPONTANEOUS_SWEAT|自汗（動則汗出）|spontaneous sweating|sweat
S_NIGHT_SWEAT|盜汗|night sweating|sweat
S_NO_SWEAT|無汗|absence of sweating|sweat
# ── 頭身 head-body ──
S_HEADACHE|頭痛|headache|head-body
S_HEAD_HEAVY|頭重如裹|heavy-headedness (as if wrapped)|head-body
S_HEAD_DIZZY|頭暈目眩|dizziness|head-body
S_HEAD_DISTENDING|頭脹痛|distending headache|head-body
S_BODY_ACHE|身體疼痛|body aches|head-body
S_BODY_HEAVY|身重困倦|heavy body and drowsiness|head-body
S_LIMB_NUMB|肢體麻木|numbness of the limbs|head-body
S_LOW_BACK_SORE|腰膝痠軟|aching and weakness of the lower back and knees|head-body
S_LOW_BACK_COLD|腰膝痠冷|cold aching of the lower back and knees|head-body
S_STABBING_PAIN_FIXED|刺痛固定不移|stabbing pain at a fixed location|head-body
S_PAIN_NIGHT_WORSE|疼痛夜間加重|pain worse at night|head-body
S_PAIN_DISTENDING|脹痛|distending pain|head-body
S_PAIN_WANDERING|竄痛|wandering pain|head-body
# ── 二便 stool-urine ──
S_LOOSE_STOOL|大便溏稀|loose stool|stool-urine
S_CONSTIPATION|大便乾結|dry stool / constipation|stool-urine
S_STICKY_STOOL|大便黏滯不爽|sticky, incomplete stool|stool-urine
S_UNDIGESTED_STOOL|完穀不化|undigested food in stool|stool-urine
S_FREQUENT_NOCTURIA|夜尿頻多|frequent nocturia|stool-urine
S_URINE_YELLOW_SCANTY|小便短黃|scanty, dark-yellow urine|stool-urine
S_URINE_CLEAR_LONG|小便清長|clear, copious urine|stool-urine
# ── 飲食口味 diet-taste ──
S_POOR_APPETITE|食少納呆|poor appetite|diet-taste
S_POSTPRANDIAL_BLOAT|食後腹脹|postprandial distension|diet-taste
S_HUNGER_NO_EAT|饑不欲食|hunger without desire to eat|diet-taste
S_BITTER_MOUTH|口苦|bitter taste in the mouth|diet-taste
S_STICKY_MOUTH|口黏膩|sticky, greasy taste in the mouth|diet-taste
S_BLAND_MOUTH|口淡無味|bland taste in the mouth|diet-taste
S_ACID_REFLUX|泛酸|acid regurgitation|diet-taste
S_PREFER_HOT_FOOD|喜熱食|preference for hot food|diet-taste
S_PREFER_COLD_FOOD|喜冷食|preference for cold food|diet-taste
S_BELCHING|噯氣|belching|diet-taste
S_NAUSEA|噁心|nausea|diet-taste
S_DRY_RETCH|乾嘔|dry retching|diet-taste
# ── 胸腹 chest-abdomen ──
S_PALPITATION|心悸|palpitations|chest-abdomen
S_CHEST_OPPRESSION|胸悶|chest oppression|chest-abdomen
S_HYPOCHONDRIAC_DISTENSION|脅肋脹痛|hypochondriac distension|chest-abdomen
S_EPIGASTRIC_PAIN|胃脘脹痛|epigastric distending pain|chest-abdomen
S_EPIGASTRIC_BURNING|胃脘隱隱灼痛|dull burning epigastric pain|chest-abdomen
S_EPIGASTRIC_FULLNESS|脘腹痞滿|epigastric and abdominal fullness|chest-abdomen
S_ABD_PAIN_PREFER_WARM_PRESS|腹痛喜溫喜按|abdominal pain relieved by warmth and pressure|chest-abdomen
S_ABD_PREFER_PRESS|腹部喜按|abdomen prefers pressure|chest-abdomen
S_ABD_REFUSE_PRESS|腹部拒按|abdomen refuses pressure|chest-abdomen
S_ABD_DISTENSION_INTERMITTENT|腹滿時減|abdominal fullness that comes and goes|chest-abdomen
S_PROLAPSE_SENSATION|脘腹墜脹／下墜感|bearing-down sensation|chest-abdomen
S_THROAT_FOREIGN|咽中異物感|plum-pit sensation in the throat|chest-abdomen
S_BREAST_DISTENSION|乳房脹痛|breast distension|chest-abdomen
S_SIGHING|善太息|frequent sighing|chest-abdomen
# ── 耳目口咽 ear-eye-throat ──
S_TINNITUS_HIGH_LOUD|耳鳴如潮|tinnitus, loud (like tides)|ear-eye-throat
S_TINNITUS_THIN|耳鳴如蟬|tinnitus, thin (like cicadas)|ear-eye-throat
S_BLURRED_VISION|視物模糊|blurred vision|ear-eye-throat
S_DRY_EYES|目乾澀|dry eyes|ear-eye-throat
S_RED_EYES|目赤|red eyes|ear-eye-throat
S_DRY_THROAT|咽乾|dry throat|ear-eye-throat
S_SORE_THROAT|咽痛|sore throat|ear-eye-throat
S_HOARSE|聲音嘶啞|hoarse voice|ear-eye-throat
S_MOUTH_ULCERS|口舌生瘡|mouth and tongue sores|ear-eye-throat
# ── 口渴 thirst ──
S_THIRST_COLD_DRINK|口渴喜冷飲|thirst with preference for cold drinks|thirst
S_THIRST_NO_DRINK|渴不欲飲|thirst without desire to drink|thirst
S_THIRST_LIGHT|口微渴|slight thirst|thirst
S_NO_THIRST|口不渴|absence of thirst|thirst
S_DRY_MOUTH_THROAT|口燥咽乾|dry mouth and throat|thirst
S_PREFER_HOT_DRINK|喜熱飲|preference for hot drinks|thirst
# ── 睡眠 sleep ──
S_INSOMNIA_ONSET|難入睡|difficulty falling asleep|sleep
S_INSOMNIA_MAINT|睡眠易醒|frequent waking|sleep
S_DREAM_MANY|多夢|profuse dreaming|sleep
S_RESTLESS_NO_SLEEP|心煩不得眠|vexation with inability to sleep|sleep
S_FORGETFUL|健忘|forgetfulness|sleep
S_STARTLE|易驚|susceptibility to fright|sleep
# ── 情志 emotion ──
S_DEPRESSED|情緒抑鬱|depressed mood|emotion
S_IRRITABLE|急躁易怒|irritability and easy anger|emotion
S_EMOTION_TRIGGERED|症狀因情緒誘發或加重|symptoms triggered or worsened by emotion|emotion
S_MENTAL_STRAIN|思慮過度|excessive pensiveness|emotion
# ── 經帶 menses ──
S_MENSES_SCANTY_PALE|經少色淡|scanty, pale menses|menses
S_MENSES_CLOTS_DARK|經色暗有血塊|dark menses with clots|menses
S_MENSES_IRREGULAR|月經週期不調|irregular menstrual cycle|menses
S_DYSMENORRHEA|痛經|dysmenorrhea|menses
S_LEUKORRHEA_YELLOW|帶下黃稠|thick yellow vaginal discharge|menses
S_SEMINAL_EMISSION|遺精|seminal emission|menses
# ── 氣神形 qi-spirit-form ──
S_FATIGUE|神疲乏力|fatigue and lack of strength|qi-spirit-form
S_SHORT_BREATH|氣短|shortness of breath|qi-spirit-form
S_LAZY_SPEAK|少氣懶言|disinclination to speak|qi-spirit-form
S_LOW_VOICE|聲低|low voice|voice-breath
S_EASY_COLD|容易感冒|susceptibility to common cold|qi-spirit-form
S_COUGH_DRY|乾咳少痰|dry cough with scanty phlegm|voice-breath
S_COUGH_WEAK|咳聲無力|weak cough|voice-breath
S_COUGH_PHLEGM_YELLOW|咳痰黃稠|cough with thick yellow phlegm|voice-breath
S_PHLEGM_COPIOUS|痰多|copious phlegm|voice-breath
S_RUNNY_NOSE_CLEAR|鼻塞流清涕|nasal congestion with clear discharge|voice-breath
S_NASAL_CONGESTION|鼻塞|nasal congestion|voice-breath
S_EDEMA|浮腫|oedema|qi-spirit-form
S_SPIRIT_WITHDRAWN|精神萎靡|listlessness|qi-spirit-form
# ── 面色皮膚 face-skin ──
S_FACE_SALLOW|面色萎黃|sallow complexion|face-skin
S_FACE_PALE|面色淡白|pale complexion|face-skin
S_FACE_RED|面紅目赤|flushed face|face-skin
S_FACE_DARK|面色晦暗|dusky complexion|face-skin
S_LIPS_NAILS_PALE|唇甲色淡|pale lips and nails|face-skin
S_LIPS_PURPLE|唇甲青紫|purple lips and nails|face-skin
S_NAIL_BRITTLE|爪甲不榮|brittle, lustreless nails|face-skin
S_SKIN_SQUAMOUS|肌膚甲錯|scaly, dry skin|face-skin
# ── 舌象 tongue (body / shape / marks / coat / zone) ──
T_BODY_PALE|舌淡|pale tongue|tongue
T_BODY_PALE_SWOLLEN|舌淡胖|pale, swollen tongue|tongue
T_BODY_RED|舌紅|red tongue|tongue
T_BODY_CRIMSON|舌絳|crimson tongue|tongue
T_BODY_PURPLE|舌紫暗|purple, dusky tongue|tongue
T_SWOLLEN|舌體胖大|swollen tongue|tongue
T_THIN|舌體瘦薄|thin tongue|tongue
T_TENDER|舌質嫩|tender tongue|tongue
T_TOOTHMARK_EDGE|舌邊齒痕|tooth marks on the tongue edges|tongue
T_CRACKS_CENTER|舌中裂紋|central crack on the tongue|tongue
T_CRACKS_ALL|滿舌裂紋|multiple cracks over the tongue|tongue
T_RED_DOTS_TIP|舌尖紅點／芒刺|red dots or prickles on the tongue tip|tongue
T_RED_DOTS_EDGE|舌邊紅點|red dots on the tongue edges|tongue
T_RED_DOTS_CENTER|舌中芒刺|prickles in the middle of the tongue|tongue
T_ECCHYMOSIS|舌有瘀斑瘀點|ecchymoses or petechiae on the tongue|tongue
T_SUBLINGUAL_VEINS|舌下絡脈怒張紫暗|engorged, dusky sublingual veins|tongue
T_TIP_RED|舌尖紅|red tongue tip|tongue
T_EDGE_RED|舌邊紅|red tongue edges|tongue
T_COAT_THIN_WHITE|薄白苔|thin white coating|tongue
T_COAT_WHITE_GREASY|白膩苔|white greasy coating|tongue
T_COAT_SLIPPERY|白滑苔|white slippery coating|tongue
T_COAT_YELLOW|黃苔|yellow coating|tongue
T_COAT_YELLOW_GREASY|黃膩苔|yellow greasy coating|tongue
T_COAT_THICK_ROT|厚腐苔|thick curdy coating|tongue
T_COAT_PEELED_ALL|少苔或剝苔|scanty or peeled coating|tongue
T_COAT_DRY|苔乾|dry coating|tongue
T_TIP_COAT_PEELED|舌尖少苔|peeled coating at the tongue tip|tongue
T_CENTER_COAT_THICK|舌中部苔厚|thick coating in the middle|tongue
T_CENTER_COAT_YELLOW_GREASY|舌中部黃膩苔|yellow greasy coating in the middle|tongue
T_CENTER_COAT_PEELED|舌中部少苔或剝落|peeled coating in the middle|tongue
T_ROOT_COAT_THICK_GREASY|舌根部厚膩苔|thick greasy coating at the root|tongue
T_ROOT_COAT_PEELED|舌根部少苔或剝落|peeled coating at the root|tongue
# ── 脈象 pulse (optional self-reported input; general quality) ──
P_FLOAT|浮脈|floating pulse|pulse
P_SINK|沉脈|deep pulse|pulse
P_SLOW|遲脈|slow pulse|pulse
P_RAPID|數脈|rapid pulse|pulse
P_SLIPPERY|滑脈|slippery pulse|pulse
P_CHOPPY|澀脈|choppy pulse|pulse
P_DEFICIENT|虛脈|deficient pulse|pulse
P_EXCESS|實脈|excess pulse|pulse
P_LONG|長脈|long pulse|pulse
P_SHORT|短脈|short pulse|pulse
P_SURGING|洪脈|surging pulse|pulse
P_FAINT|微脈|faint pulse|pulse
P_TIGHT|緊脈|tight pulse|pulse
P_MODERATE|緩脈|moderate (relaxed) pulse|pulse
P_HOLLOW|芤脈|hollow (scallion-stalk) pulse|pulse
P_WIRY|弦脈|wiry pulse|pulse
P_LEATHER|革脈|leather pulse|pulse
P_CONFINED|牢脈|firm (confined) pulse|pulse
P_SOFT|濡脈|soggy (soft) pulse|pulse
P_WEAK|弱脈|weak pulse|pulse
P_SCATTERED|散脈|scattered pulse|pulse
P_THIN|細脈|thin (fine) pulse|pulse
P_HIDDEN|伏脈|hidden pulse|pulse
P_MOVING|動脈|moving pulse|pulse
P_RAPID_IRREGULAR|促脈|rapid-irregular pulse|pulse
P_KNOTTED|結脈|knotted (slow-irregular) pulse|pulse
P_INTERMITTENT|代脈|regularly intermittent pulse|pulse
P_HASTY|疾脈|hasty pulse|pulse
"""


def parse() -> list[dict]:
    out = []
    for line in _TABLE.strip().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        sid, zh, en, dim = [x.strip() for x in line.split("|")]
        kind = "pulse" if sid.startswith("P_") else "tongue" if sid.startswith("T_") else "symptom"
        out.append({"id": sid, "zh-Hant": zh, "en": en, "dimension": dim, "kind": kind})
    ids = [s["id"] for s in out]
    assert len(ids) == len(set(ids)), "duplicate symptom ids"
    return out


SYMPTOMS = parse()
SYMPTOM_IDS = {s["id"] for s in SYMPTOMS}
