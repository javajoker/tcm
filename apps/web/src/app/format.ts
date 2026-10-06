import type { Lang } from "@tcm/i18n";

const LOCALE: Record<Lang, string> = { "zh-Hant": "zh-Hant-TW", "zh-Hans": "zh-Hans-CN", en: "en" };

/** "8 minutes ago" / "8 分鐘前": coarse, for the Resume card. */
export function relativeTime(lang: Lang, then: number, now: number): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: "auto" });
  const seconds = Math.round((then - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86_400), "day");
}

/** A date and time in the viewer's own time zone (history cards, the report footer): "4 Oct 2026, 12:30". */
/** A date alone, in the language's own form (a follow-up date is a day, not a moment). */
export function formatDate(lang: Lang, ms: number): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "medium" }).format(ms);
}

export function formatLocal(lang: Lang, ms: number): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "medium", timeStyle: "short" }).format(ms);
}
