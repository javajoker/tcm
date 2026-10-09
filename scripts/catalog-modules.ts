// The message catalogs as the bundler writes them (task PM-58): each namespace's keys once, in a module of their own, and each language's messages as a list in the order of those
// keys — instead of every language repeating every key (1,665 keys of 25 characters on average, three times over). The JSON files stay the source of truth, reviewed and checked by
// scripts/check-i18n.ts, and what a module exports is the same object as before; only the JavaScript the build writes changes. The plugin that serves these modules is in
// apps/web/vite.config.ts (build, dev server and tests).
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A catalog file: apps/web/src/i18n/<language>/<namespace>.json. */
export const CATALOG_FILE = /[\\/]src[\\/]i18n[\\/](zh-Hant|zh-Hans|en)[\\/]([a-z]+)\.json$/;
/** The ids of the modules (virtual: `\0`), which do not end in .json, so that the bundler's JSON plugin leaves them alone. */
export const KEYS_ID = "\0tcm-catalog-keys:";
export const LIST_ID = "\0tcm-catalog:";
export const keysId = (keysFile: string): string => `${KEYS_ID}${keysFile}.js`;
export const listId = (file: string): string => `${LIST_ID}${file}.js`;
/** The file a module id names. */
export const fileOfId = (id: string): string => id.slice(id.startsWith(KEYS_ID) ? KEYS_ID.length : LIST_ID.length, -".js".length);

const read = (file: string): Record<string, unknown> => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

/** The Traditional Chinese file of a catalog file's namespace, whose keys every language has in the same order. */
export function keysFileOf(file: string): string {
  const m = CATALOG_FILE.exec(file);
  if (m === null) throw new Error(`${file} is not a catalog file`);
  return join(file.slice(0, m.index), "src", "i18n", "zh-Hant", `${m[2]!}.json`);
}

/**
 * A catalog file as a list in the order of its namespace's keys, or null when its keys are not exactly those keys in that order (check-i18n reports a catalog whose keys differ;
 * such a file is then written as it is, so the app still gets the same object).
 */
export function messageList(file: string): unknown[] | null {
  const own = read(file);
  const keys = Object.keys(read(keysFileOf(file)));
  const ownKeys = Object.keys(own);
  return ownKeys.length === keys.length && ownKeys.every((k, i) => k === keys[i]) ? keys.map((k) => own[k]) : null;
}

/** The object a list module rebuilds: what the JSON import gave. */
export function zip(keys: readonly string[], list: readonly unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) out[keys[i]!] = list[i];
  return out;
}

/** The module of a namespace's keys. */
export const keysModule = (keysFile: string): string => `export default ${JSON.stringify(Object.keys(read(keysFile)))};\n`;

/** The module of one catalog file: its messages as a list, joined to the shared keys at load. */
export function listModule(file: string): string {
  const list = messageList(file);
  if (list === null) return `export default ${JSON.stringify(read(file))};\n`;
  return `import keys from ${JSON.stringify(keysId(keysFileOf(file)))};\nconst list = ${JSON.stringify(list)};\nconst out = {};\nfor (let i = 0; i < keys.length; i++) out[keys[i]] = list[i];\nexport default out;\n`;
}
