// The herb browser's data (task PM-24, docs/post-mvp/design/knowledge-browser.md §7): a compact browse index and detail shards, written by the bundler, fetched on demand and checked against the manifest
// like every chunk. Pure: this module decides what is in them and how they are read; it fetches nothing.
import { KbError } from "./errors.ts";
import type { Herb, HerbBrowser, HerbBrowserSource, HerbDetail, HerbIndexChunk, HerbPregnancy, HerbRow, HerbRowTuple, HerbShardChunk, HerbStatus } from "./types.ts";

/** How many shards the detail is split into. Fixed: the bundler and the loader must agree on where a herb is. */
export const HERB_SHARDS = 16;
/** The order of the codes the index stores. */
export const HERB_STATUS: readonly HerbStatus[] = ["derived", "curated-draft", "reviewed"];
export const HERB_PREGNANCY: readonly HerbPregnancy[] = ["ok", "ok-unreviewed", "caution", "avoid"];
/** The flags of an index row, as bits. */
export const HERB_FLAG = { toxic: 1, caution: 2, interactions: 4 } as const;

/**
 * The shard a herb's detail is in: FNV-1a of its slug, folded to one hex digit. Synchronous and with no crypto, so a page knows what to fetch before it fetches anything, and the bundler and the
 * browser get the same answer.
 */
export function shardOf(slug: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 15;
  return ((h >>> 0) % HERB_SHARDS).toString(16);
}

export interface HerbBrowserPolicy {
  /** Every herb (the dev profile, and the closed beta under its draft label), or only those a sample review has covered: `status: "reviewed"` (a public release). */
  readonly all: boolean;
}
export interface HerbBrowserChunks { readonly index: HerbIndexChunk; readonly shards: Readonly<Record<string, HerbShardChunk>> }

const slugOf = (h: Herb): string => {
  if (h.id !== `herb-${h.slug}`) throw new Error(`herb ${h.id}: the id is not herb-${h.slug}`);
  return h.slug;
};

/** The browser's chunks for a set of herbs, or `null` when the policy leaves none (no file is written then and the build shows no herb page). */
export function buildHerbBrowser(herbs: readonly Herb[], policy: HerbBrowserPolicy): HerbBrowserChunks | null {
  const chosen = policy.all ? herbs : herbs.filter((h) => h.status === "reviewed");
  if (chosen.length === 0) return null;
  const categories: string[] = [];
  const rows: HerbRowTuple[] = [];
  const shards: Record<string, Record<string, HerbDetail>> = {};
  const seen = new Set<string>();
  for (const h of chosen) {
    const slug = slugOf(h);
    if (seen.has(slug)) throw new Error(`two herbs have the slug ${slug}`);
    seen.add(slug);
    let category = categories.indexOf(h.category);
    if (category < 0) { category = categories.length; categories.push(h.category); }
    const status = HERB_STATUS.indexOf(h.status);
    const pregnancy = HERB_PREGNANCY.indexOf(h.pregnancy);
    if (status < 0 || pregnancy < 0) throw new Error(`herb ${h.id}: unknown status ${h.status} or pregnancy ${h.pregnancy}`);
    const flavors = h.flavors.map((f) => f.flavor);
    const flags = (h.toxic ? HERB_FLAG.toxic : 0) | (h.caution !== null ? HERB_FLAG.caution : 0) | (h.interactions.length > 0 ? HERB_FLAG.interactions : 0);
    rows.push([slug, h.name["zh-Hant"], h.name.en, h.latin, category, h.siqi, flavors, h.organs, h.functions.slice(0, 3), flags, pregnancy, status]);
    const detail: HerbDetail = {
      slug, name: h.name, latin: h.latin, category: h.category, nature: h.siqi, flavors, channels: h.organs, functions: h.functions, toxic: h.toxic, pregnancy: h.pregnancy, status: h.status,
      caution: h.caution, interactions: h.interactions, classicalFormulas: h.classical_formulas, ...(h.aliases && h.aliases.length > 0 ? { aliases: h.aliases } : {}),
      source: { book: h.source.book, entry: h.source.entry_id },
    };
    (shards[shardOf(slug)] ??= {})[slug] = detail;
  }
  return {
    index: { count: rows.length, categories, rows },
    shards: Object.fromEntries(Object.entries(shards).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, items]) => [key, { shard: key, items }])),
  };
}

/** A browser whose chunks are all in memory (tests, the dev server and the bundler's own checks). */
export function memorySource(chunks: HerbBrowserChunks): HerbBrowserSource {
  return {
    count: chunks.index.count,
    index: () => Promise.resolve(chunks.index),
    shard: (key) => Promise.resolve(chunks.shards[key] ?? { shard: key, items: {} }),
  };
}

/** An index row as a list shows it. Throws on a row that is not one: an index that does not match what the app expects is a damaged chunk, never a wrong list. */
export function decodeRow(index: HerbIndexChunk, row: HerbRowTuple): HerbRow {
  const [slug, zh, en, latin, category, nature, flavors, channels, functions, flags, pregnancy, status] = row;
  const cat = index.categories[category];
  const preg = HERB_PREGNANCY[pregnancy];
  const stat = HERB_STATUS[status];
  if (typeof slug !== "string" || cat === undefined || preg === undefined || stat === undefined) throw new KbError("chunk-invalid", `herbs index: the row of ${String(slug)} is not valid`);
  return { slug, name: { "zh-Hant": zh, en }, latin, category: cat, nature, flavors, channels, functions, toxic: (flags & HERB_FLAG.toxic) !== 0, hasCaution: (flags & HERB_FLAG.caution) !== 0, hasInteractions: (flags & HERB_FLAG.interactions) !== 0, pregnancy: preg, status: stat };
}

/** The browser the app uses over a source: each file is asked for once (a failed one again on the next use), then kept. */
export function herbBrowser(source: HerbBrowserSource): HerbBrowser {
  let index: Promise<HerbIndexChunk> | null = null;
  let rows: Promise<readonly HerbRow[]> | null = null;
  const shards = new Map<string, Promise<HerbShardChunk>>();
  const getIndex = (): Promise<HerbIndexChunk> => {
    if (index === null) {
      const made = source.index();
      index = made;
      made.catch(() => { if (index === made) index = null; });
    }
    return index;
  };
  return {
    count: source.count,
    rows() {
      if (rows === null) {
        const made = getIndex().then((c) => c.rows.map((r) => decodeRow(c, r)));
        rows = made;
        made.catch(() => { if (rows === made) rows = null; });
      }
      return rows;
    },
    async categories() { return (await getIndex()).categories; },
    async detail(slug) {
      const key = shardOf(slug);
      let shard = shards.get(key);
      if (shard === undefined) {
        const made = source.shard(key);
        shard = made;
        shards.set(key, made);
        made.catch(() => { if (shards.get(key) === made) shards.delete(key); });
      }
      return (await shard).items[slug];
    },
  };
}
