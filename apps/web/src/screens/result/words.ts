// Values as words (UX spec §4.10): a number on its own invites reading it as a health score. Thresholds on a −3…+3 scale (the panel's channel range);
// scalars of other ranges are rescaled first. The number stays available in the table and the tooltip.
export type Level5 = "low" | "somewhatLow" | "normal" | "somewhatHigh" | "high";

export const level5 = (v: number, range = 3): Level5 => {
  const s = (v * 3) / range;
  return s <= -1.5 ? "low" : s <= -0.5 ? "somewhatLow" : s < 0.5 ? "normal" : s < 1.5 ? "somewhatHigh" : "high";
};

/** The signed number with a real minus sign and one decimal. */
export const signed = (v: number, format: (n: number) => string): string => `${v < 0 ? "−" : v > 0 ? "+" : ""}${format(Math.abs(v))}`;

export const ELEMENT_SLUG = { 木: "wood", 火: "fire", 土: "earth", 金: "metal", 水: "water" } as const;
export const ORGAN_SLUG = { 肝: "gan", 心: "xin", 脾: "pi", 肺: "fei", 腎: "shen", 膽: "dan", 小腸: "xiaochang", 胃: "wei", 大腸: "dachang", 膀胱: "pangguang" } as const;
export const LIUXIE_SLUG = { 風: "wind", 寒: "cold", 暑: "summerheat", 濕: "damp", 燥: "dry", 火: "fire" } as const;
export const PRODUCT_SLUG = { 痰: "phlegm", 飲: "fluid", 瘀: "stasis", 食積: "food" } as const;
export const RULE_SLUG = { 制己所勝: "restrain", 侮所不勝: "insult", 子盜母氣: "drain", 乘侮自深: "deepen", 母病及子: "fail" } as const;
export const CHANNELS = ["qi", "blood", "yin", "yang", "stasis"] as const;

export const SEASON_SLUG = { 春: "spring", 夏: "summer", 長夏: "latesummer", 秋: "autumn", 冬: "winter" } as const;
