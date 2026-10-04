"""Bilingual guidance text for the self-acupressure points, the diet entries and the per-pattern lifestyle (task K-11). All of it is draft and awaits review (TCM clinical + pharmacy).

*Points:* locations follow the standard descriptions (WHO Standard Acupuncture Point Locations in the Western Pacific Region) put into plain words with finger-widths and body landmarks;
the wording is the project's own. A point's pregnancy flag is in `treatment.ACUPOINTS`. *Foods:* a food that is also a herb in the herb records (`herb`) takes its nature, flavours and
traditional functions from that record (the 2025 Pharmacopoeia entry, via TCM-Library) when the guidance file is built, and only the English wording is written here; a food that is not a herb
(`herb: None`) has its nature and flavours stated here from the general textbook teaching and is marked `basis: textbook`. Citations are existing verified quotations: 素問·藏氣法時論 for the
grain / fruit / meat / vegetable scheme, 素問·宣明五氣 for flavour and organ.
"""

ACUPRESSURE = {
    "how": ("用拇指或指腹以輕到中等的力道按揉，每個穴位約 1 至 3 分鐘，以有痠脹感但不疼痛為度；每天 1 至 2 次。穴位位置以左右兩側對稱為主，可雙側都按。",
            "Press and knead with the thumb or a fingertip using light to moderate pressure, about 1 to 3 minutes per point, until you feel a dull ache but not pain; once or twice a day. Most points are paired, so you can press both sides."),
    "cautions": [
        ("皮膚破損、發炎、瘀青或腫脹處不要按壓。", "Do not press on skin that is broken, inflamed, bruised or swollen."),
        ("按壓時若出現疼痛加劇、頭暈、噁心、冒冷汗或麻木，請立即停止。", "Stop at once if pain gets worse or you feel dizzy, sick, cold-sweaty or numb."),
        ("穴位按壓不能取代就醫；不適持續或加重時請就診。", "Acupressure does not replace seeing a doctor; if the discomfort continues or gets worse, please see one."),
    ],
}

PREGNANCY_NOTE = ("懷孕或可能懷孕時不要按壓此穴。", "Do not press this point if you are pregnant or may be pregnant.")

# point → (location zh, location en, extra cautions)
ACUPOINT_TEXT = {
    "足三里": ("小腿外側，膝蓋外側凹陷（外膝眼）往下約四橫指（3 寸），脛骨（小腿前面的骨頭）外緣再向外約一橫指處。", "On the outer side of the lower leg, about four finger-widths below the outer hollow under the kneecap and one finger-width outside the shin bone.", []),
    "中脘": ("上腹部正中線上，胸骨下端與肚臍連線的中點（約肚臍上四橫指）。", "On the midline of the upper abdomen, halfway between the lower end of the breastbone and the navel (about four finger-widths above the navel).", [("飯後半小時內及腹部有手術傷口或疼痛時不要重按。", "Do not press hard within half an hour after a meal, or where the abdomen is sore or has a surgical wound.")]),
    "關元": ("下腹部正中線上，肚臍下約四橫指（3 寸）。", "On the midline of the lower abdomen, about four finger-widths below the navel.", [("下腹部按壓宜輕；月經量多時不要按。", "Press gently on the lower abdomen, and not during heavy menstrual bleeding.")]),
    "氣海": ("下腹部正中線上，肚臍下約兩橫指（1.5 寸）。", "On the midline of the lower abdomen, about two finger-widths below the navel.", [("下腹部按壓宜輕。", "Press gently on the lower abdomen.")]),
    "百會": ("頭頂正中線上，兩耳尖連線與頭頂正中線的交會處。", "On top of the head, on the midline, where a line joining the tips of the two ears crosses it.", [("頭皮有傷口或發炎時不要按。", "Do not press if the scalp is wounded or inflamed.")]),
    "豐隆": ("小腿外側，外踝尖與膝蓋後方橫紋外側端連線的中點，脛骨外緣再向外約兩橫指處。", "On the outer side of the lower leg, halfway between the outer ankle bone and the outer end of the crease behind the knee, about two finger-widths outside the shin bone.", []),
    "陰陵泉": ("小腿內側，脛骨內側緣向上推至膝下，骨頭轉彎突起處下方的凹陷中。", "On the inner side of the lower leg, in the hollow just below the bony bulge at the top of the inner edge of the shin bone, below the knee.", []),
    "曲池": ("手肘外側，屈肘 90 度時，肘橫紋外側端與肱骨外側突起（外上髁）連線的中點。", "On the outer elbow, with the elbow bent at a right angle, halfway between the outer end of the elbow crease and the bony bump on the outside of the elbow.", []),
    "合谷": ("手背，第一、二掌骨之間，約在第二掌骨（食指延伸到手背的骨頭）靠拇指側的中點；拇指與食指併攏時，肌肉隆起的最高點。", "On the back of the hand, between the thumb and index finger bones, at the middle of the index finger's long bone on the thumb side; the highest point of the muscle when the thumb is pressed against the index finger.", [("按壓力道宜輕到中等，不可重壓。", "Press with light to moderate force, never hard.")]),
    "太衝": ("腳背，第一、二蹠骨（大腳趾與第二趾延伸到腳背的骨頭）之間，由趾縫往腳踝方向推到骨頭交會前的凹陷處，約兩橫指。", "On top of the foot, in the hollow between the long bones of the big toe and the second toe, about two finger-widths up from the web between them.", []),
    "內關": ("前臂內側，手腕橫紋上約兩橫指（2 寸），兩條肌腱（掌長肌腱與橈側腕屈肌腱）之間。", "On the inner forearm, about two finger-widths above the wrist crease, between the two tendons in the middle.", [("手腕或前臂有傷時不要按。", "Do not press if the wrist or forearm is injured.")]),
    "膻中": ("胸部正中線上，兩乳頭連線的中點（平第四肋間）。", "On the midline of the chest, halfway between the nipples.", [("胸骨處以輕柔按揉為主；若有胸痛、胸悶，不要自行按壓，請依畫面提示就醫。", "Press the breastbone only gently; if you have chest pain or tightness, do not press it yourself — follow the advice to see a doctor.")]),
    "行間": ("腳背，大腳趾與第二趾之間的趾蹼邊緣後方，皮膚顏色交界處。", "On top of the foot, in the web between the big toe and the second toe, just behind the edge of the web.", []),
    "三陰交": ("小腿內側，內踝尖上約四橫指（3 寸），脛骨內側緣後方。", "On the inner side of the lower leg, about four finger-widths above the inner ankle bone, just behind the edge of the shin bone.", []),
    "神門": ("手腕掌側橫紋上，靠小指側，肌腱（尺側腕屈肌腱）外緣的凹陷中。", "On the inner wrist crease on the little-finger side, in the hollow beside the tendon.", []),
    "太淵": ("手腕掌側橫紋上，靠拇指側，可摸到脈搏跳動處。", "On the inner wrist crease on the thumb side, where the pulse can be felt.", []),
    "魚際": ("手掌拇指根部隆起（大魚際）的外緣，第一掌骨中點，掌面與手背交界處。", "On the thumb side of the palm, at the middle of the thumb's long bone, on the border between the palm and the back of the hand.", []),
    "太溪": ("腳踝內側，內踝尖與腳後跟的大筋（跟腱）之間的凹陷中。", "On the inner ankle, in the hollow halfway between the inner ankle bone and the Achilles tendon.", []),
    "湧泉": ("腳底，捲起腳趾時足心最凹陷處，約在腳掌前三分之一與後三分之二交界。", "On the sole, in the hollow that forms when the toes curl, about a third of the way from the toes to the heel.", [("腳底有傷口、感覺遲鈍（例如糖尿病）時不要用力按。", "Do not press hard if the sole is wounded or has reduced feeling (for example in diabetes).")]),
    "腎俞": ("腰部，與肚臍同高的脊椎棘突（第二腰椎）下方，脊椎左右各旁開約兩橫指。", "On the lower back at the level of the navel, about two finger-widths to each side of the spine.", []),
    "命門": ("腰部正中線上，與肚臍同高（第二腰椎棘突下方）的凹陷中。", "On the midline of the lower back, at the level of the navel, in the hollow below the spine bump there.", []),
    "血海": ("大腿內側，屈膝時，髕骨（膝蓋骨）內側上緣往上約兩橫指的肌肉隆起處。", "On the inner thigh, with the knee bent, about two finger-widths above the inner upper corner of the kneecap, on the muscle bulge.", []),
    "膈俞": ("背部，與肩胛骨下角同高的脊椎棘突（第七胸椎）下方，脊椎左右各旁開約兩橫指。", "On the upper back at the level of the lower tip of the shoulder blade, about two finger-widths to each side of the spine.", []),
    "風池": ("後頸部，枕骨（後腦勺下緣）之下，頸後兩條大筋外側的凹陷中。", "At the back of the neck below the base of the skull, in the hollow on the outer side of the two large cords in the middle of the neck.", [("頸部按壓宜輕柔，不可用力捶打或扳動頸部。", "Press the neck gently; never pound or force it.")]),
    "列缺": ("前臂外側（拇指側），手腕橫紋上約兩橫指（1.5 寸），橈骨（前臂拇指側的骨頭）邊緣的凹溝中。", "On the thumb side of the forearm, about two finger-widths above the wrist crease, in the groove at the edge of the bone.", []),
    "大椎": ("後頸部正中線上，最突出的頸椎（第七頸椎）棘突下方的凹陷中，低頭時最明顯的骨突下緣。", "On the midline at the base of the neck, in the hollow just below the most prominent bone bump when the head is bent forward.", [("輕揉即可；有發燒或頸部不適時不要重壓。", "Rub lightly only; do not press hard with a fever or a sore neck.")]),
    "至陰": ("腳小趾外側，趾甲外側角旁約 0.1 寸（一小段指甲寬）。", "On the outer side of the little toe, right beside the outer corner of the toenail.", []),
    "崑崙": ("腳踝外側，外踝尖與腳後跟的大筋（跟腱）之間的凹陷中。", "On the outer ankle, in the hollow halfway between the outer ankle bone and the Achilles tendon.", []),
    "肩井": ("肩膀上方，頸後最突出的骨突（大椎）與肩膀外緣（肩峰）連線的中點。", "On top of the shoulder, halfway between the bone bump at the base of the neck and the tip of the shoulder.", []),
    "次髎": ("骶骨（脊椎下端的三角形平骨）上，左右各一，位於第二個骶後孔的凹陷中；位置不易自找，宜請專業人員示範。", "On the sacrum (the flat triangular bone at the base of the spine), one on each side, in the second small hollow from the top; it is hard to find by yourself, so ask a practitioner to show you.", []),
    "石門": ("下腹部正中線上，肚臍下約三橫指（2 寸）。", "On the midline of the lower abdomen, about three finger-widths below the navel.", []),
}

# food → (herb record id or None, nature, flavours, rationale zh, rationale en, cautions, basis, citations)   [nature/flavours None for a herb-backed food: taken from the record]
GRAIN, FRUIT, MEAT, VEG, FLAVOUR = ["suwen-022-1"], ["suwen-022-1"], ["suwen-022-1"], ["suwen-022-1"], ["suwen-023-1"]
FOOD_TEXT = {
    "山藥": ("herb-shangyao", None, None, None, "Sweet and neutral; traditionally used to support the spleen and stomach, nourish body fluids and the lung, and support the kidney.", [], "pharmacopoeia", GRAIN),
    "小米": (None, "涼", ["甘", "鹹"], "味甘鹹、性涼，傳統上用於養胃、和中；常作病後或脾胃虛弱時的粥食。", "Sweet, salty and cool; traditionally used to nourish the stomach and harmonise the middle; a common porridge grain when the digestion is weak.", [], "textbook", GRAIN),
    "蓮子": ("herb-lianzi", None, None, None, "Sweet, astringent and neutral; traditionally used to support the spleen, steady loose stools, support the kidney and calm the heart.", [("大便乾結者不宜多食。", "Not suited to people with hard, dry stools.")], "pharmacopoeia", GRAIN),
    "南瓜": (None, "溫", ["甘"], "味甘、性溫，傳統上用於補中益氣、健脾養胃；常蒸煮食用。", "Sweet and warm; traditionally used to tonify the middle and qi and support the spleen and stomach; usually steamed or boiled.", [], "textbook", VEG),
    "生薑": ("herb-shengjiang", None, None, None, "Pungent and warm; traditionally used to release the exterior and disperse cold, warm the middle and ease nausea, and resolve phlegm.", [("內熱明顯、口乾咽痛或陰虛者少用。", "Use little if there is marked internal heat, a dry or sore throat, or yin deficiency.")], "pharmacopoeia", FLAVOUR),
    "熱稀粥": (None, "溫", ["甘"], "熱的稀粥，傳統上用於養胃氣、助藥力；《傷寒論》桂枝湯方後即有「啜熱稀粥」的服法。", "Thin hot rice porridge; traditionally used to nourish the stomach qi and support a formula's action — the classical instructions for Guizhi Tang say to sip hot thin porridge after it.", [], "textbook", GRAIN),
    "溫熱粥": (None, "溫", ["甘"], "溫熱的粥，傳統上用於養胃氣、暖中；質地軟、易消化。", "Warm porridge; traditionally used to nourish the stomach qi and warm the middle; soft and easy to digest.", [], "textbook", GRAIN),
    "蔥白": ("herb-congbai", None, None, None, "Pungent and warm; traditionally used to induce sweating and release the exterior, and to disperse cold and free the yang.", [("多汗、表虛者不宜。", "Not suited to people who already sweat a lot.")], "pharmacopoeia", FLAVOUR),
    "薄荷": ("herb-bohe", None, None, None, "Pungent and cool; traditionally used to disperse wind-heat, clear the head and eyes and soothe the throat.", [("體虛多汗者少用。", "Use little if you are weak and sweat easily.")], "pharmacopoeia", FLAVOUR),
    "菊花": ("herb-juhua", None, None, None, "Sweet, bitter and slightly cold; traditionally used to disperse wind-heat, calm the liver and clear the eyes.", [("脾胃虛寒、腹瀉者少用。", "Use little if the spleen and stomach are weak and cold, or with loose stools.")], "pharmacopoeia", FLAVOUR),
    "菊花茶": ("herb-juhua", None, None, None, "Chrysanthemum tea: sweet, bitter and slightly cold; traditionally used to disperse wind-heat, calm the liver and clear the eyes.", [("脾胃虛寒、腹瀉者少用。", "Use little if the spleen and stomach are weak and cold, or with loose stools.")], "pharmacopoeia", FLAVOUR),
    "蘆根": ("herb-lugen", None, None, None, "Sweet and cold; traditionally used to clear heat, generate fluids, ease restlessness and nausea.", [("脾胃虛寒者不宜。", "Not suited to a weak, cold spleen and stomach.")], "pharmacopoeia", FLAVOUR),
    "梨": (None, "涼", ["甘", "酸"], "味甘微酸、性涼，傳統上用於清熱生津、潤燥化痰；可生食或燉煮。", "Sweet, slightly sour and cool; traditionally used to clear heat, generate fluids, moisten dryness and resolve phlegm; eaten raw or stewed.", [("脾胃虛寒、腹瀉者宜煮熟並少量。", "If the spleen and stomach are weak and cold, or with loose stools, cook it and eat only a little.")], "textbook", FRUIT),
    "少量肉桂": ("herb-rougui", None, None, None, "A small amount of cinnamon bark: pungent, sweet and very hot; traditionally used to warm the yang and disperse cold, and to free the channels.", [("內熱明顯或陰虛火旺者不宜；孕婦慎用。", "Not suited to marked internal heat or yin deficiency with fire; use with caution in pregnancy.")], "pharmacopoeia", FLAVOUR),
    "黃耆燉雞（少量）": ("herb-huangqi", None, None, None, "A little astragalus stewed with chicken; astragalus is sweet and slightly warm and traditionally used to tonify qi and raise the yang, to firm the exterior and stop sweating.", [("感冒發熱、腹脹或內熱明顯時不宜；與藥物併用請先詢問醫師或藥師。", "Not suited during a fever, with a bloated belly or marked internal heat; if you take medicines, ask a doctor or pharmacist first.")], "pharmacopoeia", MEAT),
    "薏仁": ("herb-yiyiren", None, None, None, "Sweet, bland and cool; traditionally used to drain dampness and support the spleen, to steady loose stools and to ease stiffness of the joints.", [("孕婦慎用；津液不足、便秘者少用。", "Use with caution in pregnancy; use little if fluids are low or you are constipated.")], "pharmacopoeia", GRAIN),
    "赤小豆": ("herb-chixiaodou", None, None, None, "Sweet, sour and neutral; traditionally used to promote urination and reduce swelling, and to clear toxin.", [("津液不足、尿多者少用。", "Use little if fluids are low or you pass a lot of urine.")], "pharmacopoeia", GRAIN),
    "茯苓": ("herb-fuling", None, None, None, "Sweet, bland and neutral; traditionally used to drain dampness, support the spleen and calm the heart.", [], "pharmacopoeia", FLAVOUR),
    "陳皮": ("herb-chenpi", None, None, None, "Bitter, pungent and warm; traditionally used to regulate qi and support the spleen, to dry dampness and resolve phlegm.", [("舌紅少津、內熱明顯者少用。", "Use little with a red, dry tongue or marked internal heat.")], "pharmacopoeia", FLAVOUR),
    "冬瓜": (None, "微寒", ["甘", "淡"], "味甘淡、性微寒，傳統上用於利水消腫、清熱解暑；常煮湯食用。", "Sweet, bland and slightly cold; traditionally used to promote urination and reduce swelling and to clear summer heat; usually made into soup.", [("脾胃虛寒、腹瀉者少用。", "Use little if the spleen and stomach are weak and cold, or with loose stools.")], "textbook", VEG),
    "綠豆": ("herb-lvdou", None, None, None, "Sweet and cold; traditionally used to clear heat and toxin, relieve summer heat and promote urination.", [("脾胃虛寒、腹瀉者不宜多食。", "Not suited in quantity to a weak, cold spleen and stomach, or with loose stools.")], "pharmacopoeia", GRAIN),
    "苦瓜": (None, "寒", ["苦"], "味苦、性寒，傳統上用於清熱解暑、明目；常炒食或煮湯。", "Bitter and cold; traditionally used to clear heat and relieve summer heat and to brighten the eyes; stir-fried or made into soup.", [("脾胃虛寒、腹瀉者少用。", "Use little if the spleen and stomach are weak and cold, or with loose stools.")], "textbook", VEG),
    "百合": ("herb-baihe", None, None, None, "Sweet and slightly cold; traditionally used to nourish yin and moisten the lung, and to clear the heart and calm the spirit.", [("脾胃虛寒、腹瀉者少用。", "Use little if the spleen and stomach are weak and cold, or with loose stools.")], "pharmacopoeia", VEG),
    "銀耳": (None, "平", ["甘", "淡"], "味甘淡、性平，傳統上用於滋陰潤肺、養胃生津；常燉煮食用。", "Sweet, bland and neutral; traditionally used to nourish yin and moisten the lung and to nourish the stomach and generate fluids; usually simmered.", [], "textbook", VEG),
    "麥冬茶": ("herb-maidong", None, None, None, "Ophiopogon tea: sweet, bitter and slightly cold; traditionally used to nourish yin and generate fluids, moisten the lung and clear the heart.", [("脾胃虛寒、腹瀉者不宜。", "Not suited to a weak, cold spleen and stomach, or with loose stools.")], "pharmacopoeia", FLAVOUR),
    "玫瑰花": ("herb-meiguihua", None, None, None, "Sweet, bitter and warm; traditionally used to move qi and relieve constraint, to harmonise the blood and ease pain.", [("陰虛火旺者少用。", "Use little with yin deficiency and fire.")], "pharmacopoeia", FLAVOUR),
    "玫瑰花茶": ("herb-meiguihua", None, None, None, "Rose tea: sweet, bitter and warm; traditionally used to move qi and relieve constraint, to harmonise the blood and ease pain.", [("陰虛火旺者少用。", "Use little with yin deficiency and fire.")], "pharmacopoeia", FLAVOUR),
    "佛手": ("herb-foshou", None, None, None, "Pungent, bitter and warm; traditionally used to soothe the liver and regulate qi, to harmonise the stomach and ease pain, and to dry dampness and resolve phlegm.", [("陰虛內熱者少用。", "Use little with yin deficiency and internal heat.")], "pharmacopoeia", FLAVOUR),
    "綠茶": (None, "涼", ["苦", "甘"], "味苦甘、性涼，傳統上用於清熱、提神、利尿；含咖啡因，不宜過量或睡前飲用。", "Bitter, sweet and cool; traditionally used to clear heat, refresh the mind and promote urination; it contains caffeine, so do not overdo it or drink it before bed.", [("失眠、心悸、胃酸過多者少用；與藥物併用請先詢問。", "Use little with insomnia, palpitations or excess stomach acid; ask a doctor or pharmacist if you take medicines.")], "textbook", FRUIT),
    "紅棗": ("herb-dazao", None, None, None, "Sweet and warm; traditionally used to tonify the middle and qi, and to nourish blood and calm the spirit.", [("濕盛脹滿、痰熱者少用；血糖偏高者留意用量。", "Use little with damp fullness or phlegm-heat; people watching their blood sugar should mind the amount.")], "pharmacopoeia", FRUIT),
    "枸杞": ("herb-gouqizi", None, None, None, "Wolfberry: sweet and neutral; traditionally used to nourish the liver and kidney and to benefit the essence and the eyes.", [("脾虛濕盛、腹瀉者少用。", "Use little with a weak spleen, dampness or loose stools.")], "pharmacopoeia", FRUIT),
    "黑芝麻": ("herb-heizhima", None, None, None, "Sweet and neutral; traditionally used to nourish the liver and kidney, to benefit essence and blood and to moisten the bowels.", [("大便溏瀉者少用。", "Use little with loose stools.")], "pharmacopoeia", GRAIN),
    "桑葚": ("herb-sangshen", None, None, None, "Mulberry: sweet, sour and cold; traditionally used to nourish yin and blood, and to generate fluids and moisten dryness.", [("脾胃虛寒、腹瀉者少用。", "Use little if the spleen and stomach are weak and cold, or with loose stools.")], "pharmacopoeia", FRUIT),
    "酸棗仁茶": ("herb-suanzaoren", None, None, None, "Jujube-seed tea: sweet, sour and neutral; traditionally used to nourish the heart and liver, calm the spirit and restrain sweating.", [("與鎮靜安眠藥併用請先詢問醫師或藥師。", "If you take sedatives or sleeping medicines, ask a doctor or pharmacist first.")], "pharmacopoeia", FRUIT),
    "龍眼肉": ("herb-longyanrou", None, None, None, "Sweet and warm; traditionally used to tonify the heart and spleen, nourish blood and calm the spirit.", [("內有痰火、濕滯者少用；孕婦宜先諮詢。", "Use little with phlegm-fire or damp stagnation; ask first in pregnancy.")], "pharmacopoeia", FRUIT),
    "桂圓": ("herb-longyanrou", None, None, None, "Longan flesh: sweet and warm; traditionally used to tonify the heart and spleen, nourish blood and calm the spirit.", [("內有痰火、濕滯者少用；孕婦宜先諮詢。", "Use little with phlegm-fire or damp stagnation; ask first in pregnancy.")], "pharmacopoeia", FRUIT),
    "小麥": ("herb-xiaomai", None, None, None, "Sweet and cool; traditionally used to nourish the heart and ease restlessness, and to support the kidney.", [], "pharmacopoeia", GRAIN),
    "竹茹茶": ("herb-zhuru", None, None, None, "Bamboo-shaving tea: sweet and slightly cold; traditionally used to clear heat and resolve phlegm, ease restlessness and nausea.", [("脾胃虛寒、腹瀉者少用。", "Use little if the spleen and stomach are weak and cold, or with loose stools.")], "pharmacopoeia", FLAVOUR),
    "蜂蜜": ("herb-fengmi", None, None, None, "Sweet and neutral; traditionally used to tonify the middle, moisten dryness and ease pain.", [("糖尿病或血糖偏高者留意用量；一歲以下嬰兒不可食用。", "People watching their blood sugar should mind the amount; never give honey to a baby under one year.")], "pharmacopoeia", FLAVOUR),
    "山楂": ("herb-shanzha", None, None, None, "Sour, sweet and slightly warm; traditionally used to aid digestion of meat and fat, and to move qi and disperse stasis.", [("孕婦慎用；胃酸過多、胃潰瘍者少用。", "Use with caution in pregnancy; use little with excess stomach acid or a stomach ulcer.")], "pharmacopoeia", FRUIT),
    "黑木耳（少量）": (None, "平", ["甘"], "味甘、性平，傳統上用於益氣養血、潤肺；少量並煮熟食用。", "Sweet and neutral; traditionally used to tonify qi and blood and moisten the lung; eat a small amount, well cooked.", [("孕婦慎用，且不宜多食。", "Use with caution in pregnancy, and not in quantity.")], "textbook", VEG),
    "黑豆": ("herb-heidou", None, None, None, "Sweet and neutral; traditionally used to benefit essence and the eyes, to nourish blood and expel wind, and to promote urination.", [("脾胃虛弱、腹脹者不宜多食。", "Not suited in quantity to a weak digestion or a bloated belly.")], "pharmacopoeia", GRAIN),
    "核桃": ("herb-hetaoren", None, None, None, "Walnut kernel: sweet and warm; traditionally used to support the kidney and warm the lung, and to moisten the bowels.", [("大便溏瀉、痰熱者少用。", "Use little with loose stools or phlegm-heat.")], "pharmacopoeia", FRUIT),
    "韭菜": (None, "溫", ["辛"], "味辛、性溫，傳統上用於溫中行氣、助腎陽；內熱明顯者少用。", "Pungent and warm; traditionally used to warm the middle and move qi and to support the kidney yang; use little with marked internal heat.", [("陰虛內熱、瘡瘍者少用。", "Use little with yin deficiency and internal heat, or with sores.")], "textbook", VEG),
    "羊肉（冬）": (None, "溫", ["甘"], "味甘、性溫（偏熱），傳統上於冬季用於溫中暖下、益氣補虛；內熱明顯者不宜。", "Sweet and warm (leaning hot); traditionally eaten in winter to warm the middle and the lower body and to tonify qi and deficiency; not suited to marked internal heat.", [("內熱明顯、口乾便秘、高血脂者少用。", "Not suited to marked internal heat, dry mouth with constipation, or high blood fats.")], "textbook", MEAT),
    "栗子": (None, "溫", ["甘"], "味甘、性溫，傳統上用於養胃健脾、補腎強筋；不易消化，宜少量。", "Sweet and warm; traditionally used to nourish the stomach, support the spleen and strengthen the kidney and sinews; hard to digest, so eat a little.", [("消化不良、腹脹者少用。", "Use little with poor digestion or a bloated belly.")], "textbook", FRUIT),
    "雞肉": (None, "溫", ["甘"], "味甘、性溫，傳統上用於溫中益氣、補精填髓；感冒發熱或內熱明顯時不宜。", "Sweet and warm; traditionally used to warm the middle, tonify qi and fill the essence; not suited during a cold with fever or with marked internal heat.", [("感冒發熱、內熱明顯時少用。", "Use little during a cold with fever or with marked internal heat.")], "textbook", MEAT),
}

LIFESTYLE_EN = {
    "EX1": "Keep warm, rest, and avoid wind.",
    "EX2": "Keep warm, rest and avoid wind; after Guizhi Tang-type formulas the original instructions have you sip hot thin porridge.",
    "EX3": "Drink plenty of water and eat light food.",
    "EX4": "Avoid catching the wind after sweating.",
    "SP1": "Eat at regular times, chew slowly, and take a walk after meals.",
    "SP2": "Avoid raw and cold foods and keep the abdomen warm.",
    "SP3": "Avoid long standing and overwork.",
    "SP4": "Eat less sweet, greasy and fried food, and exercise regularly to a light sweat.",
    "SP5": "Avoid tobacco, alcohol and spicy food; eat light food.",
    "SP6": "Eat less spicy food, and eat small meals more often.",
    "LV1": "Ease stress, exercise regularly, and find ways to express feelings.",
    "LV2": "Cut down on late nights and spicy food, and practise relaxing.",
    "LV3": "Sleep enough, avoid late nights, and rest the eyes from long screen time.",
    "LV4": "Eat when you are calm, and eat small meals more often.",
    "HT1": "Keep a regular daily rhythm and reduce brooding.",
    "HT2": "Wind down before bed and avoid stimulation in the evening.",
    "HT3": "Eat less greasy food and have a light evening meal.",
    "LG1": "Keep warm and out of the wind, and exercise moderately.",
    "LG2": "Keep the air moist and avoid smoke and dust.",
    "KD1": "Avoid late nights and cut down on spicy, drying food.",
    "KD2": "Keep the waist and abdomen warm and avoid sitting for long in the cold.",
    "QB1": "Keep a regular daily rhythm and avoid overwork.",
    "QB2": "Stay active regularly and avoid sitting still for long.",
}
