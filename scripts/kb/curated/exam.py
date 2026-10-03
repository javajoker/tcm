"""Examination data: tongue zones and features, the 28 pulses, constitutions, red flags (curated draft)."""

from .params import PARAMS

# ── tongue ────────────────────────────────────────────────────────────────

# Zone → organs. `classical` follows 《傷寒指掌》 (citation shanghan-zhizhang-tongue-zones): 滿舌屬胃，
# 中心亦屬胃，舌尖屬心，舌根屬腎，兩旁屬肝膽，四畔屬脾. `textbook` is the modern 中醫診斷學 convention
# (舌尖 心肺, 舌中 脾胃, 舌根 腎, 舌邊 肝膽), kept alongside and not yet verified against the classics.
TONGUE_ZONES = [
    dict(id="tip", zh="舌尖", en="tongue tip", classical=["心"], textbook=["心", "肺"]),
    dict(id="center", zh="舌中", en="tongue centre", classical=["胃"], textbook=["脾", "胃"]),
    dict(id="root", zh="舌根", en="tongue root", classical=["腎"], textbook=["腎", "膀胱", "大腸"]),
    dict(id="edge", zh="舌邊（左肝右膽）", en="tongue edges (left liver, right gallbladder)", classical=["肝", "膽"], textbook=["肝", "膽"]),
    dict(id="border", zh="舌四畔", en="tongue periphery", classical=["脾"], textbook=[]),
    dict(id="all", zh="全舌", en="whole tongue", classical=["胃"], textbook=[]),
]

# feature id → (category, zone, meaning in one line [zh-Hant])
TONGUE_FEATURES = {
    "T_BODY_PALE": ("body", "all", "舌淡：陽虛、氣血不足"),
    "T_BODY_PALE_SWOLLEN": ("body", "all", "舌淡胖：陽虛、脾虛水濕內停"),
    "T_BODY_RED": ("body", "all", "舌紅：熱證；少苔者陰虛"),
    "T_BODY_CRIMSON": ("body", "all", "舌絳：熱入營血或陰虛火旺之甚"),
    "T_BODY_PURPLE": ("body", "all", "舌紫暗：血瘀；寒凝亦可見"),
    "T_SWOLLEN": ("shape", "all", "胖大：脾虛、水濕痰飲"),
    "T_THIN": ("shape", "all", "瘦薄：氣血陰液不足"),
    "T_TENDER": ("shape", "all", "質嫩：虛證"),
    "T_TOOTHMARK_EDGE": ("special", "edge", "舌邊齒痕：脾虛濕盛（舌體胖大受齒擠壓）"),
    "T_CRACKS_CENTER": ("special", "center", "舌中裂紋：胃陰不足、胃熱傷津"),
    "T_CRACKS_ALL": ("special", "all", "滿舌裂紋：陰液耗損、精血虧虛"),
    "T_RED_DOTS_TIP": ("special", "tip", "舌尖紅點／芒刺：心火上炎；外感風熱初起亦可見"),
    "T_RED_DOTS_EDGE": ("special", "edge", "舌邊紅點：肝膽火熱"),
    "T_RED_DOTS_CENTER": ("special", "center", "舌中芒刺：胃腸熱盛"),
    "T_ECCHYMOSIS": ("special", "all", "瘀斑瘀點：血瘀"),
    "T_SUBLINGUAL_VEINS": ("special", "all", "舌下絡脈怒張紫暗：血瘀"),
    "T_TIP_RED": ("zone-body", "tip", "舌尖紅：心火"),
    "T_EDGE_RED": ("zone-body", "edge", "舌邊紅：肝膽有熱"),
    "T_COAT_THIN_WHITE": ("coat", "all", "薄白苔：正常，或表證初起"),
    "T_COAT_WHITE_GREASY": ("coat", "all", "白膩苔：痰濕、寒濕"),
    "T_COAT_SLIPPERY": ("coat", "all", "白滑苔：寒濕、陽虛水停"),
    "T_COAT_YELLOW": ("coat", "all", "黃苔：熱證"),
    "T_COAT_YELLOW_GREASY": ("coat", "all", "黃膩苔：濕熱、痰熱"),
    "T_COAT_THICK_ROT": ("coat", "all", "厚腐苔：食積、痰濁"),
    "T_COAT_PEELED_ALL": ("coat", "all", "少苔或剝苔：陰虛、胃氣陰兩傷"),
    "T_COAT_DRY": ("coat", "all", "苔乾：津傷"),
    "T_TIP_COAT_PEELED": ("zone-coat", "tip", "舌尖少苔：心肺陰虛"),
    "T_CENTER_COAT_THICK": ("zone-coat", "center", "舌中苔厚：脾胃濕滯、食積"),
    "T_CENTER_COAT_YELLOW_GREASY": ("zone-coat", "center", "舌中黃膩：脾胃濕熱"),
    "T_CENTER_COAT_PEELED": ("zone-coat", "center", "舌中少苔或剝落：胃陰不足"),
    "T_ROOT_COAT_THICK_GREASY": ("zone-coat", "root", "舌根厚膩：下焦濕濁、腎與膀胱濕熱"),
    "T_ROOT_COAT_PEELED": ("zone-coat", "root", "舌根少苔或剝落：腎陰虧虛"),
}

TONGUE_GUIDANCE = dict(
    when="晨起、未進食飲、未刷舌、自然光下",
    avoid=["染苔食物（咖啡、茶、染色糖果、藥物）", "剛喝熱飲或冷飲", "刮舌後", "強烈色光"],
    sublingual="舌尖上翹抵上顎，觀察舌下兩條絡脈的粗細與顏色",
    confidence="引導式自我觀察，品質係數 0.7（見 SOP §4.6）",
)

# ── pulse ─────────────────────────────────────────────────────────────────
# (id, zh, yin/yang class as printed in 《瀕湖脈學》 chapter titles, group, feature, main indications)
# The yin/yang tags are verified (they are part of each chapter heading); 疾 is from 《診家正眼》.
PULSES = [
    ("P_FLOAT", "浮", "陽", "depth", "輕取即得，重按稍減而不空", "主表；有力表實、無力表虛；浮緊風寒、浮數風熱、浮緩風濕或中風"),
    ("P_SINK", "沉", "陰", "depth", "輕取不應，重按始得", "主裡；有力裡實、無力裡虛"),
    ("P_SLOW", "遲", "陰", "rate", "一息不足四至（約 <60 次/分）", "主寒；有力冷積、無力虛寒"),
    ("P_RAPID", "數", "陽", "rate", "一息五至以上（約 >90 次/分）", "主熱；有力實熱、無力虛熱"),
    ("P_SLIPPERY", "滑", "陽中陰", "flow", "往來流利，如盤走珠", "主痰飲、食積、實熱；亦見於孕婦"),
    ("P_CHOPPY", "澀", "陰", "flow", "往來艱澀，如輕刀刮竹", "主血少、精傷、血瘀、氣滯"),
    ("P_DEFICIENT", "虛", "陰", "strength", "舉按無力，隱隱空豁", "主虛，氣血兩虛"),
    ("P_EXCESS", "實", "陽", "strength", "舉按皆有力", "主實證"),
    ("P_LONG", "長", "陽", "length", "首尾端直，超過本位", "主肝陽有餘、熱；平人亦可見"),
    ("P_SHORT", "短", "陰", "length", "首尾俱短，不及本位", "主氣病：氣虛或氣鬱"),
    ("P_SURGING", "洪", "陽", "strength", "脈來如波濤，來盛去衰", "主熱盛"),
    ("P_FAINT", "微", "陰", "strength", "極細極軟，按之欲絕，若有若無", "主氣血大虛、陽氣衰微"),
    ("P_TIGHT", "緊", "陽", "tension", "繃急彈指，如轉繩索", "主寒、痛、宿食"),
    ("P_MODERATE", "緩", "陰", "rate", "一息四至，來去怠緩", "主濕、脾虛；亦為平和脈"),
    ("P_HOLLOW", "芤", "陽中陰", "depth", "浮大而軟，中空如按蔥管", "主失血、傷陰"),
    ("P_WIRY", "弦", "陽中陰", "tension", "端直以長，如按琴弦", "主肝膽病、痛證、痰飲"),
    ("P_LEATHER", "革", "陰", "tension", "弦而芤，外急中空如按鼓皮", "主亡血、失精、半產漏下"),
    ("P_CONFINED", "牢", "陰中陽", "depth", "沉而實大弦長，堅牢不移", "主陰寒內積、疝瘕"),
    ("P_SOFT", "濡", "陰", "strength", "浮而細軟，如帛在水中", "主虛、濕"),
    ("P_WEAK", "弱", "陰", "strength", "沉而細軟無力", "主陽虛、氣血俱虛"),
    ("P_SCATTERED", "散", "陰", "rhythm", "浮散無根，至數不齊", "主元氣離散（重症）"),
    ("P_THIN", "細", "陰", "width", "脈細如線，但應指明顯", "主氣血兩虛、諸虛勞損、濕"),
    ("P_HIDDEN", "伏", "陰", "depth", "重按推筋著骨始得", "主邪閉、厥證、痛極"),
    ("P_MOVING", "動", "陽", "rhythm", "滑數有力，短如豆，厥厥動搖", "主痛、驚"),
    ("P_RAPID_IRREGULAR", "促", "陽", "rhythm", "數而時一止，止無定數", "主陽盛熱結，或氣血痰食停滯"),
    ("P_KNOTTED", "結", "陰", "rhythm", "緩而時一止，止無定數", "主陰盛氣結、寒痰血瘀"),
    ("P_INTERMITTENT", "代", "陰", "rhythm", "動而中止，良久方還，止有定數", "主臟氣衰微"),
    ("P_HASTY", "疾", "陽", "rate", "一息七八至", "主陽極陰竭、熱極；外感高熱"),
]

PULSE_POSITIONS = [
    dict(id="L-cun", zh="左寸", organs=["心", "膻中"]),
    dict(id="L-guan", zh="左關", organs=["肝", "膽"]),
    dict(id="L-chi", zh="左尺", organs=["腎陰", "小腸", "膀胱"]),
    dict(id="R-cun", zh="右寸", organs=["肺", "胸中"]),
    dict(id="R-guan", zh="右關", organs=["脾", "胃"]),
    dict(id="R-chi", zh="右尺", organs=["命門", "大腸"]),
]
# mutually exclusive pairs/groups for input validation (a pulse cannot be both)
PULSE_EXCLUSIVE = [["P_FLOAT", "P_SINK"], ["P_SLOW", "P_RAPID", "P_HASTY"], ["P_DEFICIENT", "P_EXCESS"], ["P_LONG", "P_SHORT"], ["P_SLIPPERY", "P_CHOPPY"]]

PULSE_GUIDANCE = dict(
    optional=True,
    note="脈象為可選輸入：只有能自行分辨時才填；不確定請留空。App 不會替您「辨脈」。",
    quality_coefficient=PARAMS["quality"]["by_source"]["pulse"],
    education=f"脈象需要受過訓練的手指與大量練習才能穩定分辨；自述的脈象可信度低，因此以較低的資料品質係數（{PARAMS['quality']['by_source']['pulse']}）進入計算，並在結果頁標示。",
    rate_bands={"slow_lt": 60, "rapid_gt": 90, "normal_range_modern": [60, 100]},
    positions_source="binhu-maixue-sanbu",
)

# ── constitutions (王琦 nine types; questionnaire items are NOT included — licensing, SOP D6) ──
CONSTITUTIONS = [
    dict(id="C_PINGHE", zh="平和質", en="Balanced", features=[], prior_nature=[], susceptibility={}),
    dict(id="C_QIXU", zh="氣虛質", en="Qi deficiency", features=["S_FATIGUE", "S_SHORT_BREATH", "S_SPONTANEOUS_SWEAT", "S_EASY_COLD"],
         prior_nature=["氣虛"], susceptibility={"風": 1, "寒": 1}),
    dict(id="C_YANGXU", zh="陽虛質", en="Yang deficiency", features=["S_FEAR_COLD", "S_COLD_LIMBS", "S_PREFER_HOT_FOOD"],
         prior_nature=["陽虛", "寒"], susceptibility={"寒": 2, "濕": 1}),
    dict(id="C_YINXU", zh="陰虛質", en="Yin deficiency", features=["S_HEAT_PALMS_SOLES", "S_DRY_MOUTH_THROAT", "S_CONSTIPATION", "S_NIGHT_SWEAT"],
         prior_nature=["陰虛"], susceptibility={"燥": 2, "暑": 2, "火": 1}),
    dict(id="C_TANSHI", zh="痰濕質", en="Phlegm-dampness", features=["S_BODY_HEAVY", "S_STICKY_MOUTH", "T_COAT_WHITE_GREASY"],
         prior_nature=["痰", "濕"], susceptibility={"濕": 2}),
    dict(id="C_SHIRE", zh="濕熱質", en="Damp-heat", features=["S_BITTER_MOUTH", "S_STICKY_STOOL", "T_COAT_YELLOW_GREASY"],
         prior_nature=["濕", "火"], susceptibility={"濕": 2, "暑": 2, "火": 1}),
    dict(id="C_XUEYU", zh="血瘀質", en="Blood stasis", features=["S_FACE_DARK", "S_LIPS_PURPLE", "T_ECCHYMOSIS"],
         prior_nature=["瘀"], susceptibility={"寒": 1}),
    dict(id="C_QIYU", zh="氣鬱質", en="Qi stagnation", features=["S_DEPRESSED", "S_SIGHING", "S_THROAT_FOREIGN"],
         prior_nature=["氣滯"], susceptibility={"風": 1}),
    dict(id="C_TEBING", zh="特稟質", en="Special diathesis (allergic)", features=["S_RUNNY_NOSE_CLEAR"],
         prior_nature=[], susceptibility={"風": 2}, caution="過敏體質：不予補益類推薦，加強警示；風險規則見 safety/rules.json"),
]

# ── red flags (draft — must be reviewed by physicians; SOP D7) ──────────────
RED_FLAGS = [
    # level A — immediate emergency care
    ("RF_A_CHEST_PAIN", "A", "胸痛或胸悶壓迫，伴冷汗", "Chest pain or pressure with cold sweat"),
    ("RF_A_DYSPNEA", "A", "呼吸困難、喘不過氣", "Severe difficulty breathing"),
    ("RF_A_CONSCIOUSNESS", "A", "意識不清、昏厥", "Altered consciousness or fainting"),
    ("RF_A_STROKE", "A", "突發單側肢體無力、口角歪斜或言語不清", "Sudden one-sided weakness, facial droop or slurred speech"),
    ("RF_A_BLEEDING", "A", "大量出血、吐血、黑便或血便", "Heavy bleeding, vomiting blood, black or bloody stools"),
    ("RF_A_THUNDERCLAP", "A", "突發劇烈頭痛（有生以來最痛）", "Sudden worst-ever headache"),
    ("RF_A_SEIZURE", "A", "抽搐", "Seizure"),
    ("RF_A_ANAPHYLAXIS", "A", "嚴重過敏：喉頭緊縮、全身蕁麻疹伴呼吸困難", "Severe allergic reaction"),
    ("RF_A_SELF_HARM", "A", "自傷或傷人的念頭", "Thoughts of harming self or others"),
    # level B — see a doctor within 24 h
    ("RF_B_HIGH_FEVER", "B", "發燒 ≥ 39°C 或發燒超過 3 天", "Fever ≥ 39 °C or lasting more than 3 days"),
    ("RF_B_VOMITING", "B", "持續嘔吐、無法進食水或明顯脫水", "Persistent vomiting or dehydration"),
    ("RF_B_SEVERE_ABD_PAIN", "B", "劇烈腹痛", "Severe abdominal pain"),
    ("RF_B_WEIGHT_LOSS", "B", "不明原因的體重快速下降", "Unexplained rapid weight loss"),
    ("RF_B_HEMATURIA", "B", "血尿", "Blood in urine"),
    ("RF_B_NEW_MASS", "B", "新出現的腫塊", "New lump"),
    ("RF_B_JAUNDICE", "B", "黃疸", "Jaundice"),
    ("RF_B_HEMOPTYSIS", "B", "咳血", "Coughing blood"),
    ("RF_B_VISION", "B", "視力突然改變", "Sudden change in vision"),
    ("RF_B_IRREGULAR_PULSE", "B", "新發心悸並脈搏不規則", "New palpitations with an irregular pulse"),
    # level C — outside the intended scope (population/condition), handled by the scope policy
    ("RF_C_MINOR", "C", "未滿 18 歲", "Under 18"),
    ("RF_C_PREGNANT", "C", "懷孕", "Pregnant"),
    ("RF_C_LACTATING", "C", "哺乳", "Breastfeeding"),
    ("RF_C_CANCER_TREATMENT", "C", "癌症治療中", "Under cancer treatment"),
    ("RF_C_KIDNEY", "C", "洗腎或腎衰竭", "Dialysis or kidney failure"),
    ("RF_C_LIVER", "C", "肝硬化或嚴重肝病", "Cirrhosis or severe liver disease"),
    ("RF_C_TRANSPLANT", "C", "器官移植後", "Organ transplant recipient"),
    ("RF_C_PSYCHIATRIC", "C", "重度精神疾病", "Severe psychiatric illness"),
    ("RF_C_CARDIOPULMONARY", "C", "已確診的嚴重心肺疾病", "Diagnosed severe heart or lung disease"),
]
