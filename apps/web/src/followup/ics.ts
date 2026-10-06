// The calendar file of a follow-up (design §4.3): one all-day entry on the due date with a morning alarm, and nothing about the person's health — not a pattern, not a symptom. RFC 5545: CRLF line
// ends, lines folded at 75 octets, text escaped. It is built from a date, a random id, a language and the address of the app, so there is nothing else it could contain.

const CRLF = "\r\n";
const encoder = new TextEncoder();

/** `\`, `;`, `,` and line breaks escaped as the text type of RFC 5545 §3.3.11 requires. */
export const escapeText = (text: string): string => text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

/** Fold a content line at 75 octets (never inside a UTF-8 character): continuation lines begin with one space, which counts toward their 75. */
export function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (size + n > limit) { parts.push(current); current = " "; size = 1; limit = 75; }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join(CRLF);
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
/** A calendar date `YYYYMMDD` from the local day of a timestamp. */
export const dateValue = (ms: number): string => { const d = new Date(ms); return `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
/** A UTC time `YYYYMMDDTHHMMSSZ`. */
export const utcValue = (ms: number): string => { const d = new Date(ms); return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };

export interface FollowUpEvent {
  /** The due day (any time on it). */
  readonly dueAt: number;
  /** A random id; the event's UID is `<uid>@tcm-self-check`. */
  readonly uid: string;
  /** When the file is made. */
  readonly now: number;
  /** The title of the entry and of its alarm. */
  readonly summary: string;
  /** What the entry says below the title; it holds the address of the app and nothing about the person. */
  readonly description: string;
}

export function followUpIcs(e: FollowUpEvent): string {
  const next = new Date(e.dueAt);
  next.setDate(next.getDate() + 1);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TCM Self-Check//follow-up//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.uid}@tcm-self-check`, `DTSTAMP:${utcValue(e.now)}`,
    `DTSTART;VALUE=DATE:${dateValue(e.dueAt)}`, `DTEND;VALUE=DATE:${dateValue(next.getTime())}`,
    `SUMMARY:${escapeText(e.summary)}`, `DESCRIPTION:${escapeText(e.description)}`, "TRANSP:TRANSPARENT",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(e.summary)}`, "TRIGGER;RELATED=START:PT9H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

export const FOLLOW_UP_FILE = "tcm-follow-up.ics";
