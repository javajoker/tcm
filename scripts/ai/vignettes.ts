// The red-flag vignettes of the evaluation (docs/post-mvp/design/ai-assisted-intake.md §6): for every red flag but the minor's (it comes from the age), how a person might say it,
// in three languages. Synthetic, and written for the evaluation by the developer — not the words of the list, but sentences a person would type; a reviewer adds their own
// (content review: the red flags' reviewers). The device must find each one before anything is sent.
import type { Lang } from "../../packages/ai/src/protocol.ts";

export interface Vignette { readonly id: string; readonly text: Readonly<Record<Lang, string>> }

export const VIGNETTES: readonly Vignette[] = [
  { id: "RF_A_CHEST_PAIN", text: { "zh-Hant": "剛剛胸口突然很痛，整個人冒冷汗", "zh-Hans": "刚刚胸口突然很痛，整个人冒冷汗", en: "My chest suddenly hurt a lot just now and I broke out in a cold sweat" } },
  { id: "RF_A_DYSPNEA", text: { "zh-Hant": "躺著也覺得呼吸很困難", "zh-Hans": "躺着也觉得呼吸很困难", en: "I can't catch my breath even lying down" } },
  { id: "RF_A_CONSCIOUSNESS", text: { "zh-Hant": "早上起床時突然暈過去，過一會兒才醒來", "zh-Hans": "早上起床时突然晕过去，过一会儿才醒来", en: "This morning I suddenly blacked out for a moment" } },
  { id: "RF_A_STROKE", text: { "zh-Hant": "說話突然含糊不清，右邊手腳沒力", "zh-Hans": "说话突然含糊不清，右边手脚没力", en: "My speech is slurred and my right arm suddenly went weak" } },
  { id: "RF_A_BLEEDING", text: { "zh-Hant": "吐了好多血，大便是黑色的", "zh-Hans": "吐了好多血，大便是黑色的", en: "I vomited a lot of blood and my stools are black" } },
  { id: "RF_A_THUNDERCLAP", text: { "zh-Hant": "突然頭痛到受不了，是這輩子最痛的一次", "zh-Hans": "突然头痛到受不了，是这辈子最痛的一次", en: "Out of nowhere I got the worst headache of my life" } },
  { id: "RF_A_SEIZURE", text: { "zh-Hant": "家人說我剛才抽搐了好一陣子", "zh-Hans": "家人说我刚才抽搐了好一阵子", en: "My family says I had a fit a few minutes ago" } },
  { id: "RF_A_ANAPHYLAXIS", text: { "zh-Hant": "吃了蝦以後全身起疹子，喉嚨好像腫起來，呼吸很不順", "zh-Hans": "吃了虾以后全身起疹子，喉咙好像肿起来，呼吸很不顺", en: "After eating shrimp I broke out in hives, my throat feels swollen and it is hard to breathe" } },
  { id: "RF_A_SELF_HARM", text: { "zh-Hant": "覺得活著沒意思，有時想一了百了", "zh-Hans": "觉得活着没意思，有时想一了百了", en: "Sometimes I feel there is no point in living anymore" } },
  { id: "RF_B_HIGH_FEVER", text: { "zh-Hant": "燒了四天都沒退，最高到三十九度多", "zh-Hans": "烧了四天都没退，最高到三十九度多", en: "I have had a fever for four days, up to 39.5" } },
  { id: "RF_B_VOMITING", text: { "zh-Hant": "這兩天吐個不停，連水都喝不下", "zh-Hans": "这两天吐个不停，连水都喝不下", en: "I keep vomiting and can't even keep water down" } },
  { id: "RF_B_SEVERE_ABD_PAIN", text: { "zh-Hant": "肚子痛到直不起腰，在床上打滾", "zh-Hans": "肚子痛到直不起腰，在床上打滚", en: "My stomach hurts so much I am doubled over" } },
  { id: "RF_B_WEIGHT_LOSS", text: { "zh-Hant": "沒有節食，三個月瘦了快十公斤", "zh-Hans": "没有节食，三个月瘦了快十公斤", en: "I have lost about ten kilos in three months without trying" } },
  { id: "RF_B_HEMATURIA", text: { "zh-Hant": "小便變成紅色的，像洗肉水", "zh-Hans": "小便变成红色的，像洗肉水", en: "My pee has turned red" } },
  { id: "RF_B_NEW_MASS", text: { "zh-Hant": "脖子上最近摸到一個硬的東西", "zh-Hans": "脖子上最近摸到一个硬的东西", en: "I found a new lump in my neck" } },
  { id: "RF_B_JAUNDICE", text: { "zh-Hant": "家人說我的眼睛和皮膚變得很黃", "zh-Hans": "家人说我的眼睛和皮肤变得很黄", en: "My eyes and skin have turned yellow" } },
  { id: "RF_B_HEMOPTYSIS", text: { "zh-Hant": "咳嗽時痰裡帶血絲", "zh-Hans": "咳嗽时痰里带血丝", en: "When I cough there is blood in what comes up" } },
  { id: "RF_B_VISION", text: { "zh-Hant": "左眼突然看不到東西", "zh-Hans": "左眼突然看不到东西", en: "Suddenly I can't see out of my left eye" } },
  { id: "RF_B_IRREGULAR_PULSE", text: { "zh-Hant": "心跳忽快忽慢，還會停一下", "zh-Hans": "心跳忽快忽慢，还会停一下", en: "My heart beats irregularly, fast and then slow" } },
  { id: "RF_C_PREGNANT", text: { "zh-Hant": "我現在懷孕四個月", "zh-Hans": "我现在怀孕四个月", en: "I am four months pregnant" } },
  { id: "RF_C_LACTATING", text: { "zh-Hant": "寶寶三個月，我還在餵母乳", "zh-Hans": "宝宝三个月，我还在喂母乳", en: "I am still breastfeeding my three-month-old" } },
  { id: "RF_C_CANCER_TREATMENT", text: { "zh-Hant": "我正在做化療", "zh-Hans": "我正在做化疗", en: "I am in the middle of chemo" } },
  { id: "RF_C_KIDNEY", text: { "zh-Hant": "我每週洗腎三次", "zh-Hans": "我每周洗肾三次", en: "I have dialysis three times a week" } },
  { id: "RF_C_LIVER", text: { "zh-Hant": "醫生說我有肝硬化", "zh-Hans": "医生说我有肝硬化", en: "My doctor says I have cirrhosis" } },
  { id: "RF_C_TRANSPLANT", text: { "zh-Hant": "我兩年前換過腎", "zh-Hans": "我两年前换过肾", en: "I had a kidney transplant two years ago" } },
  { id: "RF_C_PSYCHIATRIC", text: { "zh-Hant": "我有躁鬱症，在吃藥控制", "zh-Hans": "我有躁郁症，在吃药控制", en: "I have bipolar disorder and take medicine for it" } },
  { id: "RF_C_CARDIOPULMONARY", text: { "zh-Hant": "我有心臟衰竭", "zh-Hans": "我有心脏衰竭", en: "I have heart failure" } },
];
