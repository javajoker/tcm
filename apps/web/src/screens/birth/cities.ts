// The pure part of the birth-place picker (K-10): searching the city list and what a chosen city fills into the form. The list itself comes from the knowledge base (`kb.cities()`).
import type { City } from "@tcm/kb";
import type { BirthForm } from "./model.ts";

/** What two spellings must share to count as the same: no accents, no case, no punctuation, 台 = 臺. */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`.\-]/g, "").replace(/\s+/g, " ").replace(/台/g, "臺").trim();

/** 臺北市 → 臺北, 广州市 → 广州: the list holds the names without the suffix, people type them with it. */
const withoutSuffix = (q: string): string => (/[㐀-鿿]{2,}[市縣县區区]$/.test(q) ? q.slice(0, -1) : q);

const keysOf = (c: City): string[] => [c.en, ...(c.zh ? [c.zh] : []), ...(c.alt_hans ?? [])].map(fold);

/**
 * The cities that match what was typed, best first: a whole name, then the start of a name, then the start of a word of it, then anywhere in it; within a kind, the order of the list
 * (by country, then size). Chinese names match in either script because the list keeps the simplified forms too.
 */
export function searchCities(cities: readonly City[], query: string, limit = 8): City[] {
  const q = withoutSuffix(fold(query));
  if (q === "") return [];
  const hits: { city: City; rank: number; at: number }[] = [];
  cities.forEach((city, at) => {
    let rank = 4;
    for (const k of keysOf(city)) {
      if (k === q) { rank = 0; break; }
      if (k.startsWith(q)) rank = Math.min(rank, 1);
      else if (k.split(" ").some((w) => w.startsWith(q))) rank = Math.min(rank, 2);
      else if (k.includes(q)) rank = Math.min(rank, 3);
    }
    if (rank < 4) hits.push({ city, rank, at });
  });
  return hits.sort((a, b) => a.rank - b.rank || a.at - b.at).slice(0, limit).map((h) => h.city);
}

/** The form values a city fills in: its longitude (absolute, with its hemisphere) and its time zone. */
export function formPatchOf(c: City): Pick<BirthForm, "longitude" | "hemisphere" | "timeZone"> {
  return { longitude: String(Math.abs(c.lon)), hemisphere: c.lon < 0 ? "west" : "east", timeZone: c.tz };
}

/** Is the form still exactly what this city filled in (so it can still be named)? */
export const stillCity = (f: BirthForm, c: City): boolean => { const p = formPatchOf(c); return f.longitude === p.longitude && f.hemisphere === p.hemisphere && f.timeZone === p.timeZone; };

/** A city's names for a page language: the one to show first and the other one. */
export function namesOf(c: City, lang: "zh-Hant" | "en"): { readonly primary: string; readonly primaryLang: "zh-Hant" | "en"; readonly secondary: string | null; readonly secondaryLang: "zh-Hant" | "en" } {
  if (lang === "zh-Hant" && c.zh) return { primary: c.zh, primaryLang: "zh-Hant", secondary: c.en, secondaryLang: "en" };
  return { primary: c.en, primaryLang: "en", secondary: c.zh ?? null, secondaryLang: "zh-Hant" };
}
