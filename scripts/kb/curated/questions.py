"""Question bank for the adaptive inquiry (SOP §4.2, §4.8) — curated draft, plain language, awaiting clinical and linguistic review.

Design:
  · 24 core questions across the twelve dimensions of the 十問歌 extension (SOP §4.2): about 25, each covering several related symptoms;
    5 follow-up questions that are asked only when a related symptom is present or the person's sex applies.
  · Every question has a plain-language prompt (the TCM term is shown by the app from the symptom registry), options that map to
    symptom ids, and an optional hint. Selecting an option records its symptoms as `present`; when the question is ANSWERED, the symptoms of
    the options that were not selected are recorded as `absent`; skipping ("not sure") records `unsure` for all of them (see docs/kb-schema.md).
  · `graded` lists the symptoms for which the app asks mild / moderate / strong after a "yes"; the others are plain yes/no (severity ungraded).
  · `exclusive_groups`: options of the same question that cannot both be chosen (the UI enforces it with an explanation).
  · `source` is the data-quality class of the answers: `inquiry` (default) or `guided` (self-observation in a mirror, q = 0.7).
  · `modules`: the eight complaint modules (SOP §4.8) in which the question is asked early; the engine still picks by information gain.
"""

DIMENSIONS_ORDER = ["cold-heat", "sweat", "head-body", "stool-urine", "diet-taste", "chest-abdomen", "ear-eye-throat", "thirst", "sleep", "emotion", "menses",
                    "face-skin", "voice-breath", "qi-spirit-form", "course"]


def opt(zh: str, en: str, *symptoms: str, none: bool = False, context: dict | None = None) -> dict:
    return {"label": {"zh-Hant": zh, "en": en}, "symptoms": list(symptoms), "none": none, "context": context}


def none_opt(zh: str = "以上都沒有", en: str = "None of these") -> dict:
    return opt(zh, en, none=True)


def q(qid: str, dim: str, zh: str, en: str, options: list[dict], *, order: int, core: bool = False, select: str = "many", modules: tuple = (), requires: dict | None = None,
      follows: list | None = None, source: str = "inquiry", graded: tuple | str = (), exclusive: tuple = (), hint: tuple | None = None) -> dict:
    graded_ids = [s for o in options for s in o["symptoms"]] if graded == "all" else list(graded)
    return {"id": qid, "dimension": dim, "core": core, "order": order, "select": select, "source": source, "modules": list(modules), "requires": requires,
            "follows": follows, "prompt": {"zh-Hant": zh, "en": en}, "hint": {"zh-Hant": hint[0], "en": hint[1]} if hint else None, "graded": graded_ids,
            "exclusive_groups": [list(g) for g in exclusive], "options": options}


MODULES = [
    {"id": "sleep", "name": {"zh-Hant": "睡眠", "en": "Sleep"}, "description": {"zh-Hant": "難入睡、易醒、多夢", "en": "Trouble falling asleep, waking often, vivid dreams"}, "requires": None},
    {"id": "fatigue", "name": {"zh-Hant": "疲倦乏力", "en": "Fatigue"}, "description": {"zh-Hant": "沒力氣、容易累、精神不振", "en": "Low energy, tiring easily"}, "requires": None},
    {"id": "digestion", "name": {"zh-Hant": "消化", "en": "Digestion"}, "description": {"zh-Hant": "脹氣、胃口、胃痛、大便", "en": "Bloating, appetite, stomach discomfort, bowel habits"}, "requires": None},
    {"id": "cold-heat-sweat", "name": {"zh-Hant": "寒熱汗出", "en": "Cold, heat and sweating"}, "description": {"zh-Hant": "怕冷、怕熱、手腳冰冷、盜汗自汗", "en": "Feeling cold or hot, cold hands and feet, sweating"}, "requires": None},
    {"id": "head-body-pain", "name": {"zh-Hant": "頭身疼痛", "en": "Head and body pain"}, "description": {"zh-Hant": "頭痛、頭暈、痠痛、麻木", "en": "Headache, dizziness, aches, numbness"}, "requires": None},
    {"id": "mood-stress", "name": {"zh-Hant": "情緒壓力", "en": "Mood and stress"}, "description": {"zh-Hant": "低落、煩躁、焦慮、思慮多", "en": "Low mood, irritability, worry, overthinking"}, "requires": None},
    {"id": "womens-cycle", "name": {"zh-Hant": "婦女經帶", "en": "Women's cycle"}, "description": {"zh-Hant": "月經週期、經量、痛經、白帶", "en": "Menstrual cycle, flow, period pain, discharge"},
     "requires": {"sex": "female", "pregnancy": "not_pregnant"}},
    {"id": "early-external", "name": {"zh-Hant": "外感初起", "en": "Early external illness"}, "description": {"zh-Hant": "剛開始的感冒樣不適（輕症）", "en": "A recent cold- or flu-like illness (mild only)"}, "requires": None},
]

QUESTIONS = [
    # ── 1 寒熱 ─────────────────────────────────────────────────────────────
    q("Q_COLD", "cold-heat", "最近您是否特別怕冷？符合的請全選。", "Do you feel the cold more than usual lately? Select all that apply.", [
        opt("即使穿得暖、蓋了被子，還是覺得冷", "I still feel cold even when dressed warmly or under blankets", "S_AVERSION_COLD"),
        opt("怕冷，但保暖或吃熱的東西就會好一點", "I feel the cold, but warmth or hot food makes it better", "S_FEAR_COLD"),
        opt("怕風，吹到風就不舒服", "I dislike wind or drafts", "S_AVERSION_WIND"),
        opt("手腳常常冰冷", "My hands and feet are often icy cold", "S_COLD_LIMBS"),
        none_opt(),
    ], order=10, core=True, modules=("cold-heat-sweat", "fatigue", "early-external", "womens-cycle"), graded="all", exclusive=(("S_AVERSION_COLD", "S_FEAR_COLD"),),
      hint=("「即使穿暖還是冷」多見於剛受涼；「怕冷但保暖會好」多見於體質偏虛寒。", "Feeling cold despite warm clothing often goes with a recent chill; cold that eases with warmth often goes with a constitutionally cold, weak pattern.")),
    q("Q_HEAT", "cold-heat", "最近有沒有發熱或覺得悶熱的感覺？符合的請全選。", "Have you had any fever or feelings of heat lately? Select all that apply.", [
        opt("有發熱（量體溫偏高，或自覺在發燒）", "I have a fever (a high temperature or feeling feverish)", "S_FEVER"),
        opt("摸起來不太燙，但裡面悶熱、黏膩不爽快", "I feel hot and clammy inside, though my skin does not feel very hot", "S_FEVER_UNEVEN"),
        opt("下午或傍晚特別容易發熱", "I tend to feel feverish in the afternoon or evening", "S_TIDAL_FEVER"),
        opt("手心、腳心和胸口常常發熱", "My palms, soles and chest often feel hot", "S_HEAT_PALMS_SOLES"),
        opt("怕熱，喜歡涼的環境", "I dislike heat and prefer cool surroundings", "S_FEAR_HEAT"),
        opt("一陣冷、一陣熱，輪流出現", "I alternate between chills and fever", "S_ALTERNATING_CHILLS_FEVER"),
        none_opt(),
    ], order=11, core=True, modules=("cold-heat-sweat", "sleep", "early-external"), graded="all"),
    # ── 2 汗 ───────────────────────────────────────────────────────────────
    q("Q_SWEAT", "sweat", "您平常出汗的情況如何？符合的請全選。", "How is your sweating? Select all that apply.", [
        opt("稍微活動，或白天坐著不動也容易出汗", "I sweat easily with little effort, or even sitting still in the daytime", "S_SPONTANEOUS_SWEAT"),
        opt("睡著後出汗，醒來就停了", "I sweat while asleep and it stops when I wake", "S_NIGHT_SWEAT"),
        opt("該出汗的時候（運動後、悶熱時或發燒怕冷時）卻沒有汗", "I do not sweat when I would expect to (after exercise, in heat, or with fever and chills)", "S_NO_SWEAT"),
        none_opt("出汗大致正常", "My sweating seems normal"),
    ], order=20, core=True, modules=("cold-heat-sweat", "sleep", "fatigue", "early-external"), graded=("S_SPONTANEOUS_SWEAT", "S_NIGHT_SWEAT")),
    # ── 3 頭身 ─────────────────────────────────────────────────────────────
    q("Q_HEAD", "head-body", "頭部有沒有以下不舒服？符合的請全選。", "Do you have any of these head symptoms? Select all that apply.", [
        opt("頭痛", "Headache", "S_HEADACHE"),
        opt("頭很重，像被東西包住", "My head feels heavy, as if wrapped", "S_HEAD_HEAVY"),
        opt("頭暈、眼前發黑或天旋地轉", "Dizziness, blackouts of vision or a spinning feeling", "S_HEAD_DIZZY"),
        opt("頭脹痛，脹得像要裂開", "A distending headache, as if my head would burst", "S_HEAD_DISTENDING"),
        none_opt(),
    ], order=30, core=True, modules=("head-body-pain", "early-external"), graded="all"),
    q("Q_BODY", "head-body", "身體和四肢呢？符合的請全選。", "And your body and limbs? Select all that apply.", [
        opt("全身痠痛", "Aching all over", "S_BODY_ACHE"),
        opt("身體沉重、睏倦想睡", "A heavy body and drowsiness", "S_BODY_HEAVY"),
        opt("手腳麻木", "Numbness in the hands or feet", "S_LIMB_NUMB"),
        opt("腰和膝蓋痠軟無力", "An aching, weak lower back and knees", "S_LOW_BACK_SORE"),
        opt("腰和膝蓋痠痛又發冷", "An aching, cold lower back and knees", "S_LOW_BACK_COLD"),
        none_opt(),
    ], order=31, core=True, modules=("head-body-pain", "fatigue", "early-external"), graded="all"),
    # ── 4 二便 ─────────────────────────────────────────────────────────────
    q("Q_STOOL", "stool-urine", "最近大便的情況如何？符合的請全選。", "How have your bowel movements been? Select all that apply.", [
        opt("偏稀、不成形", "Loose, unformed stools", "S_LOOSE_STOOL"),
        opt("偏乾硬，排便困難", "Dry, hard stools that are difficult to pass", "S_CONSTIPATION"),
        opt("黏黏的，解不乾淨", "Sticky stools and a feeling of incomplete emptying", "S_STICKY_STOOL"),
        opt("吃進去的東西幾乎沒消化就排出來", "Food comes out almost undigested", "S_UNDIGESTED_STOOL"),
        none_opt("大致正常", "About normal"),
    ], order=40, core=True, modules=("digestion", "fatigue"), graded=("S_LOOSE_STOOL", "S_CONSTIPATION", "S_STICKY_STOOL"), exclusive=(("S_LOOSE_STOOL", "S_CONSTIPATION"),)),
    q("Q_URINE", "stool-urine", "小便的情況呢？符合的請全選。", "And your urination? Select all that apply.", [
        opt("夜裡要起來上好幾次廁所", "I get up several times at night to urinate", "S_FREQUENT_NOCTURIA"),
        opt("量少，顏色深黃", "Small amounts of dark yellow urine", "S_URINE_YELLOW_SCANTY"),
        opt("量多，顏色清淡", "Large amounts of pale, clear urine", "S_URINE_CLEAR_LONG"),
        none_opt("大致正常", "About normal"),
    ], order=41, core=True, modules=("cold-heat-sweat",), graded=("S_FREQUENT_NOCTURIA",), exclusive=(("S_URINE_YELLOW_SCANTY", "S_URINE_CLEAR_LONG"),)),
    # ── 5 飲食口味 ─────────────────────────────────────────────────────────
    q("Q_APPETITE", "diet-taste", "食慾和飯後的感覺如何？符合的請全選。", "How are your appetite and how you feel after eating? Select all that apply.", [
        opt("食慾差，不太想吃", "Poor appetite; I do not feel like eating", "S_POOR_APPETITE"),
        opt("吃完後肚子脹", "My abdomen feels bloated after eating", "S_POSTPRANDIAL_BLOAT"),
        opt("會餓，但又不想吃或吃不下", "I feel hungry but do not want to eat or cannot eat", "S_HUNGER_NO_EAT"),
        none_opt("大致正常", "About normal"),
    ], order=50, core=True, modules=("digestion", "fatigue"), graded="all"),
    q("Q_TASTE", "diet-taste", "嘴巴裡的味道或胃的感覺呢？符合的請全選。", "What about tastes in your mouth, or your stomach? Select all that apply.", [
        opt("嘴巴苦", "A bitter taste in the mouth", "S_BITTER_MOUTH"),
        opt("嘴裡黏膩、不清爽", "A sticky, greasy feeling in the mouth", "S_STICKY_MOUTH"),
        opt("嘴裡淡淡的，沒有味道", "A bland mouth; food tastes of little", "S_BLAND_MOUTH"),
        opt("泛酸水，胃酸往上冒", "Sour fluid or acid coming up", "S_ACID_REFLUX"),
        none_opt(),
    ], order=51, core=True, modules=("digestion",), graded=("S_ACID_REFLUX",)),
    q("Q_FOOD_TEMP", "diet-taste", "您比較喜歡吃熱的還是冷的食物？", "Do you prefer hot or cold food?", [
        opt("喜歡熱食，吃冷的會不舒服", "I prefer hot food; cold food upsets me", "S_PREFER_HOT_FOOD"),
        opt("喜歡冷食或涼的", "I prefer cold or cool food", "S_PREFER_COLD_FOOD"),
        none_opt("沒有特別偏好", "No particular preference"),
    ], order=52, core=True, select="one", modules=("digestion", "cold-heat-sweat")),
    # ── 6 胸腹 ─────────────────────────────────────────────────────────────
    q("Q_CHEST", "chest-abdomen", "胸口和兩側肋骨附近有沒有不舒服？符合的請全選。", "Any discomfort in the chest or along the ribs? Select all that apply.", [
        opt("心悸（感覺心跳很快或心在亂跳）", "Palpitations (a racing or pounding heartbeat)", "S_PALPITATION"),
        opt("胸悶，像有東西壓著", "Chest tightness, as if something is pressing", "S_CHEST_OPPRESSION"),
        opt("兩側肋骨附近脹痛", "Distending pain at the sides of the ribs", "S_HYPOCHONDRIAC_DISTENSION"),
        opt("常常嘆氣", "I often sigh", "S_SIGHING"),
        opt("喉嚨像有東西卡住，吞不下也吐不出", "A feeling of something stuck in the throat that I can neither swallow nor cough up", "S_THROAT_FOREIGN"),
        none_opt(),
    ], order=60, core=True, modules=("sleep", "mood-stress"), graded=("S_PALPITATION", "S_CHEST_OPPRESSION", "S_HYPOCHONDRIAC_DISTENSION"),
      hint=("心悸若伴隨胸痛、冒冷汗或呼吸困難，請立即就醫。", "Palpitations with chest pain, cold sweat or difficulty breathing need urgent medical care.")),
    q("Q_ABDOMEN", "chest-abdomen", "胃部和肚子的感覺呢？符合的請全選。", "How do your stomach and abdomen feel? Select all that apply.", [
        opt("胃脘部（上腹）脹痛", "Distending pain in the upper abdomen", "S_EPIGASTRIC_PAIN"),
        opt("胃隱隱作痛，有灼熱感", "A dull, burning ache in the stomach", "S_EPIGASTRIC_BURNING"),
        opt("上腹或整個肚子悶脹、痞滿", "Fullness and stuffiness in the upper or whole abdomen", "S_EPIGASTRIC_FULLNESS"),
        opt("肚子痛，喜歡熱敷或按壓", "Abdominal pain that likes warmth or pressure", "S_ABD_PAIN_PREFER_WARM_PRESS"),
        opt("肚子脹，時好時壞", "Abdominal fullness that comes and goes", "S_ABD_DISTENSION_INTERMITTENT"),
        opt("肚子或下腹有往下墜的感覺", "A bearing-down feeling in the abdomen", "S_PROLAPSE_SENSATION"),
        none_opt(),
    ], order=61, core=True, modules=("digestion", "mood-stress"), graded=("S_EPIGASTRIC_PAIN", "S_EPIGASTRIC_BURNING", "S_EPIGASTRIC_FULLNESS", "S_ABD_PAIN_PREFER_WARM_PRESS", "S_PROLAPSE_SENSATION"),
      hint=("劇烈腹痛請就醫，不要自行處理。", "Severe abdominal pain needs medical care; do not self-manage.")),
    # ── 7 耳目口咽 ─────────────────────────────────────────────────────────
    q("Q_EAR_EYE", "ear-eye-throat", "耳朵和眼睛有沒有不舒服？符合的請全選。", "Any problems with your ears or eyes? Select all that apply.", [
        opt("耳鳴，聲音大、像潮水", "Loud ringing in the ears, like surf", "S_TINNITUS_HIGH_LOUD"),
        opt("耳鳴，聲音細、像蟬鳴", "Thin, high ringing in the ears, like cicadas", "S_TINNITUS_THIN"),
        opt("視物模糊", "Blurred vision", "S_BLURRED_VISION"),
        opt("眼睛乾澀", "Dry, gritty eyes", "S_DRY_EYES"),
        opt("眼睛紅", "Red eyes", "S_RED_EYES"),
        none_opt(),
    ], order=70, core=True, modules=("head-body-pain",), graded=("S_BLURRED_VISION", "S_DRY_EYES"), exclusive=(("S_TINNITUS_HIGH_LOUD", "S_TINNITUS_THIN"),),
      hint=("視力突然改變請盡快就醫。", "A sudden change in vision needs prompt medical care.")),
    q("Q_THROAT", "ear-eye-throat", "喉嚨和口腔呢？符合的請全選。", "And your throat and mouth? Select all that apply.", [
        opt("喉嚨乾", "A dry throat", "S_DRY_THROAT"),
        opt("喉嚨痛", "A sore throat", "S_SORE_THROAT"),
        opt("聲音沙啞", "A hoarse voice", "S_HOARSE"),
        opt("口腔或舌頭長瘡", "Sores in the mouth or on the tongue", "S_MOUTH_ULCERS"),
        none_opt(),
    ], order=71, core=True, modules=("early-external",), graded=("S_DRY_THROAT", "S_SORE_THROAT")),
    # ── 8 口渴 ─────────────────────────────────────────────────────────────
    q("Q_THIRST", "thirst", "口渴的情形如何？符合的請全選。", "How is your thirst? Select all that apply.", [
        opt("口渴，想喝冷飲", "I am thirsty and want cold drinks", "S_THIRST_COLD_DRINK"),
        opt("口渴，但不太想喝水", "I feel thirsty but do not want to drink", "S_THIRST_NO_DRINK"),
        opt("只有一點點渴", "Only slightly thirsty", "S_THIRST_LIGHT"),
        opt("完全不覺得渴", "Not thirsty at all", "S_NO_THIRST"),
        opt("口乾舌燥、喉嚨乾", "A dry mouth and throat", "S_DRY_MOUTH_THROAT"),
        opt("偏愛喝熱的飲料", "I prefer hot drinks", "S_PREFER_HOT_DRINK"),
        none_opt("沒有特別的狀況", "Nothing in particular"),
    ], order=80, core=True, modules=("cold-heat-sweat", "digestion", "early-external"),
      exclusive=(("S_THIRST_COLD_DRINK", "S_THIRST_NO_DRINK", "S_THIRST_LIGHT", "S_NO_THIRST"),)),
    # ── 9 睡眠 ─────────────────────────────────────────────────────────────
    q("Q_SLEEP", "sleep", "最近睡眠怎麼樣？符合的請全選。", "How has your sleep been? Select all that apply.", [
        opt("很難入睡", "I find it hard to fall asleep", "S_INSOMNIA_ONSET"),
        opt("睡著後容易醒", "I wake up easily or often", "S_INSOMNIA_MAINT"),
        opt("多夢", "Many or vivid dreams", "S_DREAM_MANY"),
        opt("心裡煩躁，煩到睡不著", "Vexation that keeps me from sleeping", "S_RESTLESS_NO_SLEEP"),
        none_opt("睡得還好", "I sleep fairly well"),
    ], order=90, core=True, modules=("sleep", "mood-stress"), graded="all"),
    # ── 10 情志 ────────────────────────────────────────────────────────────
    q("Q_EMOTION", "emotion", "最近的情緒狀態如何？符合的請全選。", "How has your mood been? Select all that apply.", [
        opt("情緒低落，悶悶不樂", "Low mood; feeling down", "S_DEPRESSED"),
        opt("急躁，容易生氣", "Irritable and quick to anger", "S_IRRITABLE"),
        opt("身體的不舒服常因為情緒而發作或加重", "My physical symptoms start or worsen with emotion", "S_EMOTION_TRIGGERED"),
        opt("想太多，思慮過度", "I think too much and worry excessively", "S_MENTAL_STRAIN"),
        none_opt(),
    ], order=100, core=True, modules=("mood-stress", "sleep", "womens-cycle"), graded=("S_DEPRESSED", "S_IRRITABLE", "S_MENTAL_STRAIN"),
      hint=("若出現傷害自己或他人的念頭，請立即尋求協助。", "If you have thoughts of harming yourself or others, seek help immediately.")),
    # ── 11 經帶（女性、非孕）──────────────────────────────────────────────
    q("Q_MENSES", "menses", "月經和白帶的情況如何？符合的請全選。", "How are your periods and vaginal discharge? Select all that apply.", [
        opt("經量少、顏色淡", "Scanty, pale periods", "S_MENSES_SCANTY_PALE"),
        opt("經血顏色暗，有血塊", "Dark menstrual blood with clots", "S_MENSES_CLOTS_DARK"),
        opt("週期不規律", "An irregular cycle", "S_MENSES_IRREGULAR"),
        opt("經痛", "Period pain", "S_DYSMENORRHEA"),
        opt("白帶黃稠", "Thick yellow discharge", "S_LEUKORRHEA_YELLOW"),
        opt("經前乳房脹痛", "Breast distension before periods", "S_BREAST_DISTENSION"),
        none_opt(),
    ], order=110, core=True, modules=("womens-cycle", "mood-stress"), requires={"sex": "female", "pregnancy": "not_pregnant"}, graded=("S_DYSMENORRHEA", "S_BREAST_DISTENSION")),
    q("Q_MALE", "menses", "有沒有以下男性方面的情況？", "Do you have any of the following?", [
        opt("遺精（非性行為時精液自行排出）", "Seminal emission without intercourse", "S_SEMINAL_EMISSION"),
        none_opt(),
    ], order=111, requires={"sex": "male"}),
    # ── 12 面色（引導式自我觀察）──────────────────────────────────────────
    q("Q_FACE", "face-skin", "請對著鏡子看看，您的氣色比較接近哪一種？", "Look in a mirror: which best describes your complexion?", [
        opt("萎黃：偏黃、沒有光澤", "Sallow: yellowish and lustreless", "S_FACE_SALLOW"),
        opt("淡白：偏白、沒有血色", "Pale: whitish, lacking colour", "S_FACE_PALE"),
        opt("紅：整張臉或兩頰發紅", "Flushed: the whole face or both cheeks are red", "S_FACE_RED"),
        opt("晦暗：發暗、發黑、沒有光彩", "Dusky: dark and dull", "S_FACE_DARK"),
        none_opt("看起來正常", "Looks normal"),
    ], order=150, core=True, select="one", source="guided", modules=("fatigue",),
      hint=("請在自然光下觀察；自行判斷的準確度有限，因此在計算中的權重較低。", "Look in natural light. Self-judgement is limited in accuracy, so this counts for less in the calculation.")),
    q("Q_LIPS_NAILS", "face-skin", "嘴唇、指甲和皮膚的樣子呢？符合的請全選。", "What about your lips, nails and skin? Select all that apply.", [
        opt("嘴唇和指甲顏色淡", "Pale lips and nails", "S_LIPS_NAILS_PALE"),
        opt("嘴唇和指甲偏青紫", "Bluish-purple lips and nails", "S_LIPS_PURPLE"),
        opt("指甲容易斷、沒有光澤", "Brittle, lustreless nails", "S_NAIL_BRITTLE"),
        opt("皮膚乾燥、粗糙脫屑", "Dry, rough, scaly skin", "S_SKIN_SQUAMOUS"),
        none_opt(),
    ], order=151, core=True, source="guided", modules=("fatigue",), exclusive=(("S_LIPS_NAILS_PALE", "S_LIPS_PURPLE"),)),
    # ── 咳嗽・鼻・聲音 ─────────────────────────────────────────────────────
    q("Q_VOICE_BREATH", "voice-breath", "咳嗽、痰、鼻子和說話的聲音呢？符合的請全選。", "What about cough, phlegm, nose and voice? Select all that apply.", [
        opt("乾咳，沒什麼痰", "A dry cough with little phlegm", "S_COUGH_DRY"),
        opt("咳嗽沒有力氣", "A weak cough", "S_COUGH_WEAK"),
        opt("咳出黃色、黏稠的痰", "Coughing up thick yellow phlegm", "S_COUGH_PHLEGM_YELLOW"),
        opt("痰很多", "Copious phlegm", "S_PHLEGM_COPIOUS"),
        opt("鼻塞，流清鼻涕", "A blocked nose with clear discharge", "S_RUNNY_NOSE_CLEAR"),
        opt("鼻塞（沒有明顯鼻涕）", "A blocked nose without much discharge", "S_NASAL_CONGESTION"),
        opt("說話聲音低", "A low speaking voice", "S_LOW_VOICE"),
        none_opt(),
    ], order=120, core=True, modules=("early-external",), graded=("S_COUGH_DRY", "S_COUGH_WEAK", "S_COUGH_PHLEGM_YELLOW", "S_PHLEGM_COPIOUS", "S_NASAL_CONGESTION"),
      exclusive=(("S_RUNNY_NOSE_CLEAR", "S_NASAL_CONGESTION"),)),
    # ── 精神體力 ───────────────────────────────────────────────────────────
    q("Q_ENERGY", "qi-spirit-form", "精神和體力方面，符合的有哪些？", "Which of these describe your energy and stamina? Select all that apply.", [
        opt("疲倦，沒力氣", "Tired, lacking strength", "S_FATIGUE"),
        opt("稍微動一下就喘、氣短", "Short of breath on slight effort", "S_SHORT_BREATH"),
        opt("不想說話，說話沒力氣", "I do not feel like talking; speaking is an effort", "S_LAZY_SPEAK"),
        opt("容易感冒", "I catch colds easily", "S_EASY_COLD"),
        opt("容易水腫", "I swell up easily", "S_EDEMA"),
        opt("精神萎靡，提不起勁", "Listless, with no drive", "S_SPIRIT_WITHDRAWN"),
        none_opt(),
    ], order=105, core=True, modules=("fatigue", "womens-cycle"), graded=("S_FATIGUE", "S_SHORT_BREATH", "S_LAZY_SPEAK", "S_SPIRIT_WITHDRAWN")),
    # ── 病程 ───────────────────────────────────────────────────────────────
    q("Q_COURSE", "course", "這些不舒服大約持續多久了？", "About how long have these problems lasted?", [
        opt("剛開始，兩週以內", "They started recently, within the past two weeks", context={"course": "acute"}),
        opt("兩週到三個月", "Between two weeks and three months", context={"course": "subacute"}),
        opt("超過三個月", "More than three months", context={"course": "chronic"}),
    ], order=130, core=True, select="one", modules=("early-external",),
      hint=("新起的不適與長期的不適，在中醫裡的辨證方向不同。", "Recent and long-standing problems point in different directions in TCM pattern differentiation.")),
    # ── follow-ups ─────────────────────────────────────────────────────────
    q("Q_PAIN_QUALITY", "head-body", "關於疼痛的性質，符合的有哪些？", "How would you describe the pain? Select all that apply.", [
        opt("刺痛，位置固定不動", "Stabbing pain in a fixed spot", "S_STABBING_PAIN_FIXED"),
        opt("夜裡痛得更厲害", "Pain that is worse at night", "S_PAIN_NIGHT_WORSE"),
        opt("脹痛", "Distending pain", "S_PAIN_DISTENDING"),
        opt("竄痛，位置會到處跑", "Wandering pain that moves around", "S_PAIN_WANDERING"),
        none_opt(),
    ], order=32, modules=("head-body-pain", "womens-cycle"),
      follows=["S_HEADACHE", "S_BODY_ACHE", "S_HEAD_DISTENDING", "S_EPIGASTRIC_PAIN", "S_ABD_PAIN_PREFER_WARM_PRESS", "S_HYPOCHONDRIAC_DISTENSION", "S_DYSMENORRHEA", "S_BREAST_DISTENSION"]),
    q("Q_ABD_PRESS", "chest-abdomen", "用手按壓肚子時，感覺如何？", "How does it feel when you press on your abdomen?", [
        opt("按著比較舒服", "Pressing feels better", "S_ABD_PREFER_PRESS"),
        opt("按下去更痛，不想被碰", "Pressing makes it worse; I do not want it touched", "S_ABD_REFUSE_PRESS"),
        none_opt("差不多，沒有特別的感覺", "About the same"),
    ], order=62, select="one", modules=("digestion",),
      follows=["S_EPIGASTRIC_PAIN", "S_EPIGASTRIC_BURNING", "S_EPIGASTRIC_FULLNESS", "S_ABD_PAIN_PREFER_WARM_PRESS", "S_ABD_DISTENSION_INTERMITTENT", "S_POSTPRANDIAL_BLOAT",
               "S_PROLAPSE_SENSATION", "S_HYPOCHONDRIAC_DISTENSION", "S_DYSMENORRHEA", "S_STABBING_PAIN_FIXED", "S_PAIN_NIGHT_WORSE"]),
    q("Q_NAUSEA", "diet-taste", "吃東西前後或平常，有沒有以下情況？", "Do you have any of these around meals or in general?", [
        opt("噯氣（打嗝）", "Belching", "S_BELCHING"),
        opt("噁心想吐", "Nausea", "S_NAUSEA"),
        opt("乾嘔（想吐但吐不出來）", "Dry retching", "S_DRY_RETCH"),
        none_opt(),
    ], order=53, modules=("digestion",), graded=("S_NAUSEA",),
      follows=["S_POOR_APPETITE", "S_POSTPRANDIAL_BLOAT", "S_EPIGASTRIC_PAIN", "S_EPIGASTRIC_BURNING", "S_EPIGASTRIC_FULLNESS", "S_ACID_REFLUX", "S_HUNGER_NO_EAT",
               "S_HYPOCHONDRIAC_DISTENSION", "S_SIGHING", "S_EMOTION_TRIGGERED", "S_STICKY_MOUTH", "S_BITTER_MOUTH", "S_PHLEGM_COPIOUS", "S_RESTLESS_NO_SLEEP"],
      hint=("持續嘔吐、無法進食或喝水，請盡快就醫。", "Persistent vomiting or being unable to keep food or drink down needs prompt medical care.")),
    q("Q_MIND", "sleep", "心神方面，有沒有以下情況？", "Do you notice any of these?", [
        opt("健忘，容易忘東忘西", "Forgetfulness", "S_FORGETFUL"),
        opt("容易受驚、心慌", "Easily startled or frightened", "S_STARTLE"),
        none_opt(),
    ], order=91, modules=("sleep", "mood-stress"), graded=("S_FORGETFUL",),
      follows=["S_INSOMNIA_ONSET", "S_INSOMNIA_MAINT", "S_DREAM_MANY", "S_RESTLESS_NO_SLEEP", "S_PALPITATION", "S_FATIGUE", "S_MENTAL_STRAIN"]),
]
