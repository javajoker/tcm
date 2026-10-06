// How seasons are counted (docs/post-mvp/design/five-phase-extensions.md §4.2). The model knows the calendar and a choice, not the climate where a person is: there are three bases — the northern
// calendar (the default), the southern one, and none (the tropics, where four seasons are not the climate). Until the person chooses, the device's time zone decides between the first two.
import type { SeasonBasis } from "@tcm/engine";
import type { Prefs } from "../storage/types.ts";

/**
 * IANA zones whose people live the southern seasons, by name: a short, conservative list — temperate and subtropical places south of the equator. Zones near the equator (Jakarta, Nairobi, Quito,
 * Port Moresby, …) are left out: their seasons are not four, and the person may choose *no seasons*. The list is data: add a zone when someone who lives there says the default is wrong.
 */
export const SOUTHERN_ZONES: readonly string[] = [
  "Pacific/Auckland", "Pacific/Chatham", "Pacific/Fiji", "Pacific/Tongatapu", "Pacific/Apia", "Pacific/Norfolk", "Pacific/Noumea", "Pacific/Efate", "Pacific/Tahiti", "Pacific/Rarotonga", "Pacific/Pago_Pago",
  "Africa/Johannesburg", "Africa/Maseru", "Africa/Mbabane", "Africa/Windhoek", "Africa/Gaborone", "Africa/Harare", "Africa/Maputo", "Africa/Lusaka", "Africa/Blantyre",
  "Indian/Antananarivo", "Indian/Mauritius", "Indian/Reunion",
  "America/Sao_Paulo", "America/Montevideo", "America/Santiago", "America/Punta_Arenas", "America/Asuncion", "America/La_Paz", "America/Lima", "America/Cuiaba", "America/Campo_Grande",
  "Atlantic/Stanley", "Atlantic/South_Georgia",
];
/** Zones named by a prefix: every zone of Australia and of Argentina is southern. */
export const SOUTHERN_PREFIXES: readonly string[] = ["Australia/", "America/Argentina/", "Antarctica/"];

export const isSouthernZone = (timeZone: string): boolean => SOUTHERN_ZONES.includes(timeZone) || SOUTHERN_PREFIXES.some((p) => timeZone.startsWith(p));

/** The device's IANA time zone, or `null` where the browser will not say. */
export function deviceTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

/** What the time zone suggests: the southern calendar on a listed zone, the northern one everywhere else (and where the zone is unknown). Never `off`: that is the person's to choose. */
export const defaultSeasons = (timeZone: string | null): "north" | "south" => (timeZone !== null && isSouthernZone(timeZone) ? "south" : "north");

/** The basis in force: the person's choice, or the zone's default. */
export const effectiveSeasons = (prefs: Pick<Prefs, "seasons">, timeZone: string | null = deviceTimeZone()): SeasonBasis => prefs.seasons ?? defaultSeasons(timeZone);

/** The words' slug of a basis (`report.seasons.basis.<slug>`). */
export const BASIS_SLUG: Readonly<Record<SeasonBasis, "north" | "south" | "off">> = { north: "north", south: "south", off: "off" };
