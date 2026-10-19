// The disclaimer version is derived from the wording itself, so changing the text (either language) re-prompts everyone without anyone remembering
// to bump a constant (UX spec §4.1: "changed disclaimer wording re-prompts"). The statement accepts the terms of service (PD-36), so every message of
// the `terms` namespace is part of the wording too: a change of the terms asks everyone again.
import { catalogs } from "../i18n/catalogs.ts";


export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function disclaimerVersionOf(texts: readonly string[]): string { return fnv1a(texts.join("\u0000")); }

/** The version of the statement in these catalogs: the full statement, the acknowledgement's label and every message of the terms of service, in both languages. */
export function disclaimerVersionFor(cat: { readonly "zh-Hant": Readonly<Record<string, unknown>>; readonly en: Readonly<Record<string, unknown>> }): string {
  const keys = ["safety.disclaimer.full", "intake.landing.ack.label", ...Object.keys(cat["zh-Hant"]).filter((k) => k.startsWith("terms.")).sort()];
  const text = (lang: "zh-Hant" | "en", key: string): string => { const m = cat[lang][key]; return typeof m === "string" ? m : ""; };
  return disclaimerVersionOf(keys.flatMap((k) => [text("zh-Hant", k), text("en", k)]));
}

export const DISCLAIMER_VERSION: string = disclaimerVersionFor(catalogs);
