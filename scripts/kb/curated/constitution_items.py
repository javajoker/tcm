"""Constitution questionnaire (task K-08, SOP D6): our own wording — the items of the national standard (ZYYXH/T157-2009) are not reproduced.

Nine types, four items each, a 1–5 frequency scale. The scoring RULE follows the standard (SOP §7.2): converted score = (raw − n) ÷ (4n) × 100, with `reverse` items scored
6 − answer. Wording is plain, second person, about tendencies over the past year; it is a draft awaiting practitioner review (content review pack).
"""
from __future__ import annotations

SCALE = [
    {"value": 1, "label": {"zh-Hant": "從不", "en": "Never"}},
    {"value": 2, "label": {"zh-Hant": "很少", "en": "Rarely"}},
    {"value": 3, "label": {"zh-Hant": "有時", "en": "Sometimes"}},
    {"value": 4, "label": {"zh-Hant": "經常", "en": "Often"}},
    {"value": 5, "label": {"zh-Hant": "總是", "en": "Always"}},
]

PROMPT = {"zh-Hant": "回想最近一年，下面的情形出現得有多頻繁？", "en": "Thinking of the past year, how often does each of these happen?"}


def _i(zh: str, en: str, reverse: bool = False) -> dict:
    return {"text": {"zh-Hant": zh, "en": en}, "reverse": reverse}


def _d(zh: str, en: str) -> dict:
    return {"zh-Hant": zh, "en": en}


TYPES = [
    {"constitution": "C_PINGHE", "order": 1,
     "description": _d("整體平衡、精力與睡眠、消化都不錯，適應環境與季節變化的能力好。", "Generally balanced: good energy, sleep and digestion, and a good ability to adapt to the environment and the seasons."),
     "items": [_i("精力充沛，不容易覺得疲倦", "I have plenty of energy and rarely feel tired"),
               _i("睡得好，醒來精神不錯", "I sleep well and wake up refreshed"),
               _i("胃口正常，吃了不容易脹或不舒服", "My appetite is normal and I rarely feel bloated after eating"),
               _i("身體常有這裡那裡不舒服的感覺", "I often feel unwell somewhere in my body", reverse=True),
               _i("天氣或環境改變時，我很快就能適應", "I adapt quickly when the weather or surroundings change")]},
    {"constitution": "C_QIXU", "order": 2,
     "description": _d("容易疲倦、氣短、不耐勞累，說話聲音偏低，較容易感冒或出虛汗。", "Tires easily, short of breath, low tolerance for exertion, a quiet voice, and more prone to colds and sweating without effort."),
     "items": [_i("稍微活動就覺得喘或心悸", "I get short of breath or palpitations with slight exertion"),
               _i("整天沒什麼精神，不太想說話", "I feel low in energy all day and do not feel like talking"),
               _i("比別人容易感冒", "I catch colds more easily than other people"),
               _i("沒有特別熱也會出汗，活動後更明顯", "I sweat without being hot, and more so after activity")]},
    {"constitution": "C_YANGXU", "order": 3,
     "description": _d("怕冷、手腳冰涼，喜歡熱的飲食，吃涼的容易不舒服或腹瀉。", "Feels the cold, has cold hands and feet, prefers warm food and drink, and is upset or loose-stooled after cold food."),
     "items": [_i("我的手腳比別人冰冷", "My hands and feet are colder than other people's"),
               _i("吃或喝冰冷的東西容易不舒服", "Cold food or drink easily upsets me"),
               _i("冬天特別怕冷，穿很多還是不暖", "I feel the cold badly in winter and stay cold even in many layers"),
               _i("容易腹瀉或大便偏稀，尤其吃了涼的之後", "I tend to have loose stools, especially after cold food")]},
    {"constitution": "C_YINXU", "order": 4,
     "description": _d("偏燥偏熱：手心腳心發熱、口乾咽燥、皮膚或眼睛乾澀，睡眠較淺，大便偏乾。", "Dry and warm: hot palms and soles, dry mouth and throat, dry skin or eyes, light sleep and dry stools."),
     "items": [_i("手心或腳心常覺得發熱", "My palms or soles often feel hot"),
               _i("嘴巴和喉嚨乾，喜歡喝水", "My mouth and throat are dry and I like to drink water"),
               _i("皮膚或眼睛偏乾澀", "My skin or eyes tend to be dry"),
               _i("容易便秘，或大便偏乾硬", "I tend to be constipated or have dry, hard stools")]},
    {"constitution": "C_TANSHI", "order": 5,
     "description": _d("身體偏沉重、黏膩，腹部鬆軟肥滿，容易出油，痰多，舌苔偏厚。", "Heavy and sticky: a soft, full abdomen, oily skin, plenty of phlegm and a thicker tongue coating."),
     "items": [_i("覺得身體沉重、不清爽", "My body feels heavy and not clear"),
               _i("腹部肥滿鬆軟", "My abdomen is full and soft"),
               _i("臉或頭皮容易出油", "My face or scalp gets oily easily"),
               _i("痰多，常覺得喉嚨有痰", "I have a lot of phlegm and often feel it in my throat")]},
    {"constitution": "C_SHIRE", "order": 6,
     "description": _d("偏濕又偏熱：臉部油膩易長痘，口苦或口臭，大便黏滯不爽，小便偏黃，身體悶熱。", "Damp and hot: an oily face prone to spots, a bitter taste or bad breath, sticky stools, darker urine and a feeling of stuffy heat."),
     "items": [_i("臉上容易油膩或長痘痘", "My face is oily or breaks out in spots easily"),
               _i("口苦，或嘴裡有異味", "I have a bitter taste or bad breath"),
               _i("大便黏滯不爽，或小便偏黃", "My stools are sticky and incomplete, or my urine is dark"),
               _i("身體常有悶熱感", "My body often feels stuffy and hot")]},
    {"constitution": "C_XUEYU", "order": 7,
     "description": _d("血行偏不暢：膚色偏暗、容易有瘀青或色斑，固定位置的刺痛，嘴唇偏暗。", "Blood moves less freely: a duller complexion, easy bruising or spots, fixed stabbing pains and darker lips."),
     "items": [_i("皮膚容易出現瘀青", "I bruise easily"),
               _i("臉色偏暗，或臉上有色斑", "My complexion is dull, or I have dark spots on my face"),
               _i("身上有固定位置的刺痛", "I have stabbing pain in a fixed place"),
               _i("嘴唇顏色偏暗", "My lips are a darker colour")]},
    {"constitution": "C_QIYU", "order": 8,
     "description": _d("情緒偏悶、容易緊張或憂慮，常嘆氣，胸脅脹悶，睡眠容易受情緒影響。", "Mood tends to be low or tense, with frequent sighing, a tight chest or flanks, and sleep easily disturbed by worry."),
     "items": [_i("常覺得悶悶不樂、情緒低落", "I often feel down or low in mood"),
               _i("容易緊張、焦慮或多愁善感", "I get tense, anxious or sensitive easily"),
               _i("常嘆氣，胸口或兩脅脹悶", "I sigh often, with a tight chest or flanks"),
               _i("遇到事情就睡不安穩", "My sleep is unsettled when something is on my mind")]},
    {"constitution": "C_TEBING", "order": 9,
     "description": _d("容易過敏（花粉、塵蟎、食物、藥物），換季時容易發作，鼻、皮膚較敏感。", "Allergy-prone (pollen, dust mites, foods, medicines), flaring with the seasons, with a sensitive nose and skin."),
     "items": [_i("容易對花粉、塵蟎、食物或藥物過敏", "I am allergic to pollen, dust mites, foods or medicines"),
               _i("沒有感冒也常打噴嚏、流鼻水或鼻塞", "I often sneeze, have a runny or blocked nose without a cold"),
               _i("皮膚容易起疹子，或抓過後出現紅痕", "My skin gets rashes easily, or shows red marks after scratching"),
               _i("換季或接觸某些東西時容易發作", "Symptoms flare with a change of season or contact with certain things")]},
]
