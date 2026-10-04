// The disclaimer version is derived from the wording itself, so changing the text (either language) re-prompts everyone without anyone remembering
// to bump a constant (UX spec §4.1: "changed disclaimer wording re-prompts").
import { catalogs } from "../i18n/catalogs.ts";

const KEYS = ["safety.disclaimer.full", "intake.landing.ack.label"] as const;

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function disclaimerVersionOf(texts: readonly string[]): string { return fnv1a(texts.join("\u0000")); }

const text = (lang: "zh-Hant" | "en", key: (typeof KEYS)[number]): string => {
  const m = (catalogs[lang] as Record<string, unknown>)[key];
  return typeof m === "string" ? m : "";
};

export const DISCLAIMER_VERSION: string = disclaimerVersionOf(KEYS.flatMap((k) => [text("zh-Hant", k), text("en", k)]));
