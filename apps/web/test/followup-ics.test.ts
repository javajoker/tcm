// The calendar file (design §4.3): RFC 5545 as a strict parser written for this test reads it — CRLF, folding at 75 octets, escaping, the structure — and no health information.
import { describe, expect, it } from "vitest";
import { dateValue, escapeText, FOLLOW_UP_FILE, fold, followUpIcs, utcValue } from "../src/followup/ics.ts";

interface Property { readonly name: string; readonly params: Readonly<Record<string, string>>; readonly value: string }
interface Component { readonly type: string; readonly properties: Property[]; readonly children: Component[] }

const unescapeText = (v: string): string => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** A strict reader of the subset of RFC 5545 the file uses: it refuses what the standard does not allow rather than coping with it. */
function parse(text: string): Component {
  if (!text.endsWith("\r\n")) throw new Error("the file must end with CRLF");
  if (/(^|[^\r])\n/.test(text)) throw new Error("a line ends with a bare LF");
  if (/\r(?!\n)/.test(text)) throw new Error("a bare CR");
  const physical = text.slice(0, -2).split("\r\n");
  for (const l of physical) if (new TextEncoder().encode(l).length > 75) throw new Error(`a line longer than 75 octets: ${l.slice(0, 30)}…`);
  const lines: string[] = [];
  for (const l of physical) { if (l.startsWith(" ") || l.startsWith("\t")) { if (lines.length === 0) throw new Error("a continuation with nothing to continue"); lines[lines.length - 1] += l.slice(1); } else lines.push(l); }
  const stack: Component[] = [];
  let root: Component | null = null;
  for (const line of lines) {
    const m = /^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=[^:;]*)*):(.*)$/.exec(line);
    if (m === null) throw new Error(`not a content line: ${line}`);
    const [, rawName, rawParams, value] = m as unknown as [string, string, string, string];
    const name = rawName.toUpperCase();
    if (name === "BEGIN") { const c: Component = { type: value, properties: [], children: [] }; if (stack.length === 0) { if (root !== null) throw new Error("two calendars"); root = c; } else stack[stack.length - 1]!.children.push(c); stack.push(c); continue; }
    if (name === "END") { const top = stack.pop(); if (top === undefined || top.type !== value) throw new Error(`END:${value} does not close ${top?.type}`); continue; }
    if (stack.length === 0) throw new Error("a property outside a component");
    const params = Object.fromEntries(rawParams.split(";").filter(Boolean).map((p) => p.split("=") as [string, string]));
    stack[stack.length - 1]!.properties.push({ name, params, value });
  }
  if (stack.length !== 0 || root === null) throw new Error("unclosed component");
  return root;
}
const one = (c: Component, name: string): Property => { const found = c.properties.filter((p) => p.name === name); if (found.length !== 1) throw new Error(`${name} must appear once in ${c.type}, found ${found.length}`); return found[0]!; };

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const DUE = new Date(2026, 10, 2).getTime();                // local 2 November 2026
const event = { dueAt: DUE, uid: "abc123", now: NOW, summary: "TCM Self-Check — time to look again", description: "Open the app: https://example.org/en/" };

describe("the writer", () => {
  it("makes a calendar a strict parser accepts: one event, all day, on the due date, with a morning alarm", () => {
    const cal = parse(followUpIcs(event));
    expect(cal.type).toBe("VCALENDAR");
    expect(one(cal, "VERSION").value).toBe("2.0");
    expect(one(cal, "PRODID").value).toMatch(/^-\/\/.+\/\/.+\/\/EN$/);
    expect(cal.children).toHaveLength(1);
    const ev = cal.children[0]!;
    expect(ev.type).toBe("VEVENT");
    expect(one(ev, "UID").value).toBe("abc123@tcm-self-check");
    expect(one(ev, "DTSTAMP").value).toBe("20261005T120000Z");
    expect(one(ev, "DTSTART")).toMatchObject({ params: { VALUE: "DATE" }, value: "20261102" });
    expect(one(ev, "DTEND")).toMatchObject({ params: { VALUE: "DATE" }, value: "20261103" });
    expect(unescapeText(one(ev, "SUMMARY").value)).toBe(event.summary);
    expect(unescapeText(one(ev, "DESCRIPTION").value)).toBe(event.description);
    expect(ev.children).toHaveLength(1);
    const alarm = ev.children[0]!;
    expect(alarm.type).toBe("VALARM");
    expect(one(alarm, "ACTION").value).toBe("DISPLAY");
    expect(one(alarm, "TRIGGER")).toMatchObject({ params: { RELATED: "START" }, value: "PT9H" });
    expect(unescapeText(one(alarm, "DESCRIPTION").value)).toBe(event.summary);
  });

  it("ends the month and the year correctly: the entry is one day, whatever day it is", () => {
    for (const [y, m, d, next] of [[2026, 0, 31, "20260201"], [2026, 11, 31, "20270101"], [2028, 1, 28, "20280229"], [2026, 1, 28, "20260301"]] as const) {
      const ev = parse(followUpIcs({ ...event, dueAt: new Date(y, m, d, 17).getTime() })).children[0]!;
      expect(one(ev, "DTEND").value).toBe(next);
      expect(one(ev, "DTSTART").value).toBe(dateValue(new Date(y, m, d).getTime()));
    }
  });

  it("keeps every line within 75 octets by folding, never inside a character, and unfolding gives back the text", () => {
    const long = `Open the app: https://example.org/${"中醫自我評估".repeat(20)}/en/ and then, with commas; and semicolons`;
    const text = followUpIcs({ ...event, description: long });
    for (const l of text.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(text).not.toMatch(/�/);
    const ev = parse(text).children[0]!;
    expect(unescapeText(one(ev, "DESCRIPTION").value)).toBe(long);
  });

  it("escapes commas, semicolons, backslashes and line breaks in text", () => {
    expect(escapeText("a,b;c\\d\ne\r\nf")).toBe("a\\,b\;c\\\\d\\ne\\nf");
    const ev = parse(followUpIcs({ ...event, summary: "one, two; three\\four" })).children[0]!;
    expect(one(ev, "SUMMARY").value).toBe("one\\, two\; three\\\\four");
  });

  it("folds only what is longer than 75 octets, and a single wide character is never split", () => {
    expect(fold("X".repeat(75))).toBe("X".repeat(75));
    const folded = fold("X".repeat(76));
    expect(folded).toBe(`${"X".repeat(75)}\r\n X`);
    const wide = fold(`S:${"中".repeat(40)}`);
    for (const l of wide.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(wide.replace(/\r\n /g, "")).toBe(`S:${"中".repeat(40)}`);
  });

  it("formats dates and times as the standard wants", () => {
    expect(dateValue(new Date(2026, 0, 5).getTime())).toBe("20260105");
    expect(utcValue(Date.UTC(2026, 0, 5, 3, 4, 5))).toBe("20260105T030405Z");
    expect(FOLLOW_UP_FILE).toBe("tcm-follow-up.ics");
  });

  it("is refused by the strict parser when it is malformed — the parser is not lenient", () => {
    const good = followUpIcs(event);
    expect(() => parse(good.replace(/\r\n/g, "\n"))).toThrow(/CRLF|bare LF/);
    expect(() => parse(good.replace("END:VEVENT\r\n", ""))).toThrow();
    expect(() => one(parse(good.replace("UID:abc123@tcm-self-check\r\n", "")).children[0]!, "UID")).toThrow(/UID/);
    expect(() => parse(good.replace("SUMMARY:", `SUMMARY:${"x".repeat(80)}`))).toThrow(/75 octets/);
    expect(() => parse(`${good}EXTRA`)).toThrow();
  });
});

describe("what the file does not hold", () => {
  const text = followUpIcs({ ...event, summary: "中醫自我評估——該再看一次了", description: "開啟應用程式：https://example.org/zh-Hant/" });
  it("holds no health information: nothing about a pattern, a symptom, a result or the person", () => {
    const words = /pattern|symptom|result|diagnos|assessment of|tongue|pulse|fatigue|pain|cold|heat|證|症|脈|舌|虛|熱|寒|痛|結果/i;
    expect(text.match(words)?.[0]).toBeUndefined();
    expect(text).toContain("tcm-self-check");
    expect(text).not.toMatch(/@(?!tcm-self-check)\S/);           // no address of a person
  });
  it("takes nothing from a result: the writer's input is a date, an id, a time, two strings", () => {
    expect(Object.keys(event).sort()).toEqual(["description", "dueAt", "now", "summary", "uid"]);
    expect(followUpIcs.length).toBe(1);
  });
});
