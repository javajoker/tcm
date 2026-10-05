// Which region's emergency numbers to show (docs/post-mvp/design/tap-tempo-and-regions.md §2): the one the person chose, else the one whose time zone the device is in, else the generic "call your
// local emergency number". There is no silent default: the MVP showed Taiwan's numbers to anyone who had not chosen, wherever they were.
import type { KnowledgeBase } from "@tcm/kb";

type Regions = KnowledgeBase["emergency"]["regions"];
/** Where the region came from: a choice, the device's time zone, or nowhere (the generic row). */
export type RegionSource = "choice" | "time-zone" | "none";
export interface ResolvedRegion { readonly id: string; readonly source: RegionSource }

/** The region to show. A saved choice that this build no longer carries (a public build lists only verified rows) is not a choice. */
export function resolveRegion(regions: Regions, pref: string | undefined, timeZone: string | undefined): ResolvedRegion {
  if (pref !== undefined && regions.some((r) => r.id === pref)) return { id: pref, source: "choice" };
  if (timeZone !== undefined) {
    const hit = regions.find((r) => r.timezones.includes(timeZone));
    if (hit !== undefined) return { id: hit.id, source: "time-zone" };
  }
  return { id: "OTHER", source: "none" };
}

/** The device's IANA time zone, read locally and used only to preselect a region. */
export function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}
