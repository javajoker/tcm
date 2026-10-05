// The Simplified Chinese display dictionary as the bundler writes it and the loader reads it (docs/post-mvp/design/simplified-chinese.md §5.1, §5.4).
//
// The knowledge base is always loaded in its canonical Traditional form: the engine and the safety rules match Chinese identifiers by value. Simplified text exists
// only for display. The bundler lists the unique Chinese strings of a profile's chunks in a fixed order (this file's `chineseStrings`) and writes, line by line, the
// Simplified form of each (an empty line where nothing changes). The loader rebuilds the same list from the chunks it fetched, checks it against a digest in the
// manifest, and pairs the two. Nothing here converts anything.

const CJK = /[㐀-鿿豈-﫿\u{20000}-\u{2FA1F}]/u;

export const hasChinese = (s: string): boolean => CJK.test(s);

/** The unique Chinese strings — values and dictionary keys — under the given JSON values, in UTF-16 code-unit order (the order of `Array.prototype.sort`). */
export function chineseStrings(...roots: readonly unknown[]): string[] {
  const out = new Set<string>();
  const walk = (n: unknown): void => {
    if (typeof n === "string") { if (CJK.test(n)) out.add(n); }
    else if (Array.isArray(n)) { for (const v of n) walk(v); }
    else if (n !== null && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) { if (CJK.test(k)) out.add(k); walk(v); }
    }
  };
  for (const r of roots) walk(r);
  return [...out].sort();
}

/** What the digest in the manifest is the SHA-256 of (UTF-8). */
export const digestInput = (list: readonly string[]): string => list.join("\n");

/** The text of the aligned list: line i is the Simplified form of `list[i]`, empty when it does not change. Throws on a string without an entry or with a line break. */
export function alignedList(list: readonly string[], dictionary: Readonly<Record<string, string>>): string {
  return list.map((s) => {
    if (s.includes("\n")) throw new Error(`a Chinese string contains a line break: ${JSON.stringify(s)}`);
    if (!Object.hasOwn(dictionary, s)) throw new Error(`no entry in the Simplified dictionary for ${JSON.stringify(s)}`);
    const t = dictionary[s]!;
    if (t.includes("\n")) throw new Error(`the Simplified form of ${JSON.stringify(s)} contains a line break`);
    return t === s ? "" : t;
  }).join("\n");
}

/** Pairs a list with its aligned text: Traditional → Simplified (an empty line is the string itself). Throws when the line counts differ. */
export function parseAligned(list: readonly string[], text: string): Map<string, string> {
  const lines = text.split("\n");
  if (lines.length !== list.length) throw new Error(`the Simplified list has ${lines.length} lines for ${list.length} strings`);
  return new Map(list.map((s, i) => [s, lines[i] === "" ? s : lines[i]!]));
}

export interface Display {
  add(list: readonly string[], text: string): void;
  /** Traditional → Simplified, for display. */
  zh(text: string): string;
  /**
   * The strings of the data whose Simplified form is `text`, for turning what a person typed or picked back into the data's own script (an allergy, which the safety rules match by name). `text` itself
   * is returned when nothing matches, and always comes last when it also names something: a string the person typed in Traditional stays what it is.
   */
  traditional(text: string): readonly string[];
}

/** The display function of a session: Traditional → Simplified through the verified lists added so far; anything else is returned as it is (and reported when it is Chinese). */
export function newDisplay(report?: (text: string) => void): Display {
  const map = new Map<string, string>();
  const back = new Map<string, string[]>();
  return {
    add(list, text) {
      for (const [k, v] of parseAligned(list, text)) {
        map.set(k, v);
        if (v !== k) { const forms = back.get(v); if (forms === undefined) back.set(v, [k]); else if (!forms.includes(k)) forms.push(k); }
      }
    },
    zh(text) {
      const t = map.get(text);
      if (t !== undefined) return t;
      if (report !== undefined && CJK.test(text)) report(text);
      return text;
    },
    traditional(text) {
      const forms = back.get(text);
      return forms === undefined ? [text] : map.has(text) && !forms.includes(text) ? [...forms, text] : forms;
    },
  };
}
