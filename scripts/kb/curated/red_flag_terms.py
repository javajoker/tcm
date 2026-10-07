"""Words that re-open the red-flag screening during the conversation of AI help (Release F; docs/post-mvp/design/ai-assisted-intake.md §4).

The screening itself is deterministic and first (S04): this list only decides when what a person writes in the conversation sends them back to it — a level-A or -B item
answered "no" is asked again — and when it tells them to check their profile (level C). It is matched on the device, before anything is sent, in the person's own words
(Traditional and English here; Simplified converted by the display pipeline). A term is a phrase, or a list of phrases that must all occur in the same message.

It errs on the side of asking again: a negation is not read ("沒有胸痛" asks again), and a phrase of an ordinary complaint that comes close to a red flag is kept when the red flag
names it (胸悶 with 冷汗). Draft — for the physician and the second reviewer, like the red flags themselves (content review §2).
"""
from __future__ import annotations

Term = str | list[str]

# id → (Traditional terms, English terms). Level C items name situations the profile records; RF_C_MINOR comes from the age and has no words.
TERMS: dict[str, tuple[list[Term], list[Term]]] = {
    "RF_A_CHEST_PAIN": (["胸痛", "胸口痛", "心口痛", "胸前痛", "胸口壓", "胸口被壓", "胸口好緊", "胸口很緊", ["胸悶", "冷汗"], ["胸口", "冷汗"]],
                        ["chest pain", "pain in my chest", "chest pressure", "pressure in my chest", ["chest", "cold sweat"]]),
    "RF_A_DYSPNEA": (["呼吸困難", "喘不過氣", "透不過氣", "吸不到氣", "上氣不接下氣", "不能呼吸", "無法呼吸", "快窒息"],
                     ["can't breathe", "cannot breathe", "can not breathe", "difficulty breathing", "trouble breathing", "struggling to breathe", "gasping", "suffocat"]),
    "RF_A_CONSCIOUSNESS": (["昏倒", "暈倒", "昏厥", "暈厥", "昏迷", "失去意識", "意識不清", "不省人事", "叫不醒"],
                           ["fainted", "fainting", "passed out", "pass out", "blacked out", "black out", "unconscious", "lost consciousness"]),
    "RF_A_STROKE": (["中風", "半邊無力", "一邊無力", "半身無力", "單側無力", "嘴歪", "口角歪斜", "臉歪", "說話不清", "口齒不清", "講話不清楚"],
                    ["stroke", "weakness on one side", "one side is weak", "face drooping", "facial droop", "slurred speech", "slurring"]),
    "RF_A_BLEEDING": (["大量出血", "流血不止", "血流不止", "吐血", "嘔血", "黑便", "大便黑", "便血", "血便", "大便有血"],
                      ["heavy bleeding", "bleeding heavily", "won't stop bleeding", "vomiting blood", "vomited blood", "throwing up blood", "black stool", "tarry stool", "blood in my stool", "bloody stool"]),
    "RF_A_THUNDERCLAP": (["頭痛欲裂", "劇烈頭痛", "最痛的頭痛", "從來沒有這麼痛", "爆炸般的頭痛"],
                         ["worst headache", "sudden severe headache", "thunderclap"]),
    "RF_A_SEIZURE": (["抽搐", "癲癇", "羊癲瘋", "口吐白沫", "全身抽動"],
                     ["seizure", "convulsion", "epileptic"]),
    "RF_A_ANAPHYLAXIS": (["過敏性休克", "喉嚨腫", "喉頭腫", "喉嚨緊縮", "喉頭緊", ["蕁麻疹", "呼吸"], ["過敏", "呼吸困難"], ["過敏", "喘不過氣"]],
                         ["anaphylaxis", "anaphylactic", "throat swelling", "throat is closing", "throat closing", ["hives", "breath"], ["allergic", "can't breathe"]]),
    "RF_A_SELF_HARM": (["自殺", "想死", "不想活", "活不下去", "結束生命", "了結自己", "自殘", "傷害自己", "割腕", "輕生", "傷害別人", "想殺"],
                       ["suicide", "suicidal", "kill myself", "end my life", "want to die", "don't want to live", "self-harm", "self harm", "hurt myself", "harm myself", "hurt someone", "kill someone"]),
    "RF_B_HIGH_FEVER": (["高燒", "高熱", ["燒", "39"], ["燒", "40"], ["發燒", "三天"], ["發燒", "3天"], ["燒了", "幾天"], "發燒超過"],
                        ["high fever", ["fever", "39"], ["fever", "40"], ["fever", "102"], ["fever", "103"], ["fever", "three days"], ["fever", "3 days"], ["fever", "for days"]]),
    "RF_B_VOMITING": (["一直吐", "吐個不停", "不停嘔吐", "持續嘔吐", "吃什麼吐什麼", "喝水也吐", "脫水"],
                      ["keep vomiting", "can't stop vomiting", "vomiting all day", "can't keep anything down", "can't keep water down", "dehydrated"]),
    "RF_B_SEVERE_ABD_PAIN": (["劇烈腹痛", "肚子劇痛", "腹部劇痛", "痛到打滾", "肚子痛得很厲害"],
                             ["severe abdominal pain", "severe stomach pain", "severe belly pain", "doubled over"]),
    "RF_B_WEIGHT_LOSS": (["體重一直掉", "體重下降很多", "瘦了很多", "莫名變瘦", "體重減輕", "暴瘦"],
                         ["losing weight", "lost a lot of weight", "weight loss"]),
    "RF_B_HEMATURIA": (["血尿", "尿血", "小便有血", "尿中帶血", "尿是紅色"],
                       ["blood in my urine", "blood in urine", "bloody urine", "red urine", "pink urine"]),
    "RF_B_NEW_MASS": (["腫塊", "硬塊", "摸到一顆", "長了一顆", "腫瘤"],
                      ["lump", "a mass", "tumour", "tumor"]),
    "RF_B_JAUNDICE": (["黃疸", "眼白發黃", "眼睛發黃", "眼睛變黃", "皮膚發黃", "皮膚變黃"],
                      ["jaundice", "yellow eyes", "eyes are yellow", "yellow skin"]),
    "RF_B_HEMOPTYSIS": (["咳血", "咯血", "痰中帶血", "痰裡有血", "咳出血"],
                        ["coughing blood", "coughing up blood", "coughed up blood", "blood in my phlegm", "blood in my sputum"]),
    "RF_B_VISION": (["突然看不見", "突然看不清", "視力突然", "失明", "視野缺", "看東西變兩個", "複視"],
                    ["sudden loss of vision", "suddenly can't see", "lost my vision", "double vision", "went blind"]),
    "RF_B_IRREGULAR_PULSE": (["心跳不規則", "心律不整", "心跳很亂", "心跳忽快忽慢", "漏跳", "脈搏不規則"],
                             ["irregular heartbeat", "irregular pulse", "heart skipping", "skipped beats", "skipping beats"]),
    "RF_C_PREGNANT": (["懷孕", "有孕", "孕期", "妊娠", "懷胎"], ["pregnant", "pregnancy", "expecting a baby"]),
    "RF_C_LACTATING": (["哺乳", "餵奶", "喂奶", "餵母乳", "母乳"], ["breastfeeding", "breast-feeding", "nursing my baby", "breast milk"]),
    "RF_C_CANCER_TREATMENT": (["化療", "放療", "標靶治療", "癌症治療", "免疫治療"], ["chemotherapy", "chemo", "radiotherapy", "radiation therapy", "cancer treatment", "immunotherapy"]),
    "RF_C_KIDNEY": (["洗腎", "透析", "腎衰竭", "腎功能衰竭", "尿毒"], ["dialysis", "kidney failure", "renal failure"]),
    "RF_C_LIVER": (["肝硬化", "肝衰竭", "肝癌", "嚴重肝病"], ["cirrhosis", "liver failure", "liver cancer", "severe liver disease"]),
    "RF_C_TRANSPLANT": (["器官移植", "換腎", "換肝", "移植手術", "抗排斥"], ["transplant", "anti-rejection"]),
    "RF_C_PSYCHIATRIC": (["思覺失調", "精神分裂", "躁鬱", "雙相", "重度憂鬱"], ["schizophrenia", "bipolar", "psychosis", "psychiatric"]),
    "RF_C_CARDIOPULMONARY": (["心臟衰竭", "心衰竭", "心臟病", "冠心病", "心肌梗塞", "慢性阻塞性肺病", "肺氣腫", "肺纖維化"],
                             ["heart failure", "heart disease", "heart attack", "copd", "emphysema", "pulmonary fibrosis"]),
}


def items() -> list[dict]:
    return [{"id": rid, "zh-Hant": zh, "en": en} for rid, (zh, en) in TERMS.items()]
