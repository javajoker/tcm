import { KbError } from "./errors.ts";
import { chineseStrings, digestInput, newDisplay } from "./hans.ts";
import { indexKnowledgeBase, SUPPORTED_SCHEMA_VERSION } from "./indexer.ts";
import { CHAPTER_ID } from "./book.ts";
import type { BookChunk, BookSource, ChunkRef, Cities, CitationsChunk, CoreChunk, CourseIndexChunk, CoursePageChunk, CourseSource, FormulasChunk, GuidanceChunk, HansRef, HerbBrowserSource, HerbIndexChunk, HerbShardChunk, HerbsChunk, KnowledgeBase, Manifest, RawKbChunks, ReferenceChunk, ReferenceSource } from "./types.ts";

export interface LoadOptions {
  /** URL (absolute or root-relative) of the directory that holds `manifest.json` and the chunk files, e.g. "/kb". */
  readonly baseUrl: string;
  /** Injected for tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  /** Injected for tests; defaults to WebCrypto. */
  readonly sha256?: (bytes: ArrayBuffer) => Promise<string>;
  /** `Hans` also fetches the Simplified display list (docs/post-mvp/design/simplified-chinese.md). The data is the same either way; only `kb.zh` differs. Default `Hant`. */
  readonly script?: "Hant" | "Hans";
  /** Called when a display list could not be used (missing, damaged, or not aligned with the chunks): the knowledge base then shows the data's own script and `kb.script` says `Hant`. */
  readonly onDisplayError?: (error: KbError) => void;
  /** Called with a Chinese string that the Simplified display list does not know (shown in Traditional). */
  readonly onFallback?: (text: string) => void;
}

async function webCryptoSha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const join = (base: string, file: string): string => `${base.replace(/\/+$/, "")}/${file}`;

function assertManifest(m: unknown): asserts m is Manifest {
  const ok = typeof m === "object" && m !== null && typeof (m as Manifest).version === "string" && typeof (m as Manifest).schema === "number" &&
    typeof (m as Manifest).chunks === "object" && (m as Manifest).chunks !== null && !!(m as Manifest).chunks.core && !!(m as Manifest).chunks.formulas && !!(m as Manifest).chunks.citations && !!(m as Manifest).chunks.guidance && !!(m as Manifest).chunks.cities;
  if (!ok) throw new KbError("manifest-invalid", "manifest.json is missing required fields");
  const hb = (m as Manifest).herbBrowser;
  if (hb !== undefined) {
    const ref = (r: unknown): boolean => typeof r === "object" && r !== null && typeof (r as ChunkRef).file === "string" && typeof (r as ChunkRef).sha256 === "string";
    const sound = typeof hb === "object" && hb !== null && Number.isInteger(hb.count) && ref(hb.index) && typeof hb.shards === "object" && hb.shards !== null &&
      Object.entries(hb.shards).every(([k, r]) => /^[0-9a-f]$/.test(k) && ref(r));
    if (!sound) throw new KbError("manifest-invalid", "manifest.json: the herb browser entry is not valid");
  }
  const book = (m as Manifest).book;
  if (book !== undefined) {
    const sound = typeof book === "object" && book !== null && typeof book.file === "string" && typeof book.sha256 === "string" && Array.isArray(book.chapters) && book.chapters.length > 0 &&
      book.chapters.every((c) => typeof c === "string" && CHAPTER_ID.test(c)) && new Set(book.chapters).size === book.chapters.length;
    if (!sound) throw new KbError("manifest-invalid", "manifest.json: the book entry is not valid");
  }
  const course = (m as Manifest).course;
  if (course !== undefined) {
    const ref = (r: unknown): boolean => typeof r === "object" && r !== null && typeof (r as ChunkRef).file === "string" && typeof (r as ChunkRef).sha256 === "string";
    const sound = typeof course === "object" && course !== null && ref(course.index) && Array.isArray(course.pages) && course.pages.length > 0 &&
      course.pages.every((p) => ref(p) && typeof p.id === "string" && CHAPTER_ID.test(p.id)) && new Set(course.pages.map((p) => p.id)).size === course.pages.length;
    if (!sound) throw new KbError("manifest-invalid", "manifest.json: the course entry is not valid");
  }
  const reference = (m as Manifest).reference;
  if (reference !== undefined) {
    const sound = typeof reference === "object" && reference !== null && typeof reference.file === "string" && typeof reference.sha256 === "string" && Array.isArray(reference.roles) && reference.roles.length > 0 &&
      reference.roles.every((r) => r === "learner" || r === "practitioner") && new Set(reference.roles).size === reference.roles.length;
    if (!sound) throw new KbError("manifest-invalid", "manifest.json: the reference entry is not valid");
  }
}

/**
 * Fetch the manifest, then every chunk it lists (in parallel), verify each chunk's SHA-256 and build the knowledge base.
 * A manifest from another schema version is refused before any chunk is fetched: it can only mean a stale cache of the app.
 */
export async function loadKnowledgeBase(opts: LoadOptions): Promise<KnowledgeBase> {
  const doFetch = opts.fetch ?? fetch;
  const sha256 = opts.sha256 ?? webCryptoSha256;

  const mres = await doFetch(join(opts.baseUrl, "manifest.json"), { headers: { "Cache-Control": "no-cache" } });
  if (!mres.ok) throw new KbError("chunk-missing", `manifest.json: HTTP ${mres.status}`);
  const manifest: unknown = await mres.json();
  assertManifest(manifest);
  const mf: Manifest = manifest;       // narrowing does not reach the closures below
  if (manifest.schema !== SUPPORTED_SCHEMA_VERSION) {
    throw new KbError("schema-mismatch", `knowledge base schema ${manifest.schema} is not supported (expected ${SUPPORTED_SCHEMA_VERSION})`);
  }

  async function bytesOf(name: string, ref: ChunkRef): Promise<ArrayBuffer> {
    const res = await doFetch(join(opts.baseUrl, ref.file));
    if (!res.ok) throw new KbError("chunk-missing", `${name}: HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    const actual = await sha256(bytes);
    if (actual !== ref.sha256) throw new KbError("chunk-hash-mismatch", `${name}: hash ${actual.slice(0, 12)}… does not match the manifest`);
    return bytes;
  }
  async function chunk<T>(name: string, ref: ChunkRef): Promise<T> {
    const bytes = await bytesOf(name, ref);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
      throw new KbError("chunk-invalid", `${name}: not valid JSON`);
    }
  }

  // Simplified display: the data stays what it is; a verified list of Simplified forms is paired with the Chinese strings the chunks hold. Any failure leaves the
  // knowledge base in its own script and is reported, never thrown: a reader sees Traditional text rather than a broken page.
  const display = opts.script === "Hans" ? newDisplay(opts.onFallback) : null;
  let shown = display !== null;
  const fail = (e: unknown): void => { shown = false; opts.onDisplayError?.(e instanceof KbError ? e : new KbError("display-missing", String(e))); };
  async function addList(name: string, ref: HansRef | undefined, list: readonly string[]): Promise<void> {
    if (display === null || ref === undefined) { if (display !== null) fail(new KbError("display-missing", `the manifest has no Simplified display list for ${name}`)); return; }
    try {
      if (list.length !== ref.strings || (await sha256(new TextEncoder().encode(digestInput(list)).buffer as ArrayBuffer)) !== ref.digest) {
        throw new KbError("display-mismatch", `the Simplified display list for ${name} is not aligned with the chunks`);
      }
      display.add(list, new TextDecoder().decode(await bytesOf(`hans-${name}`, ref)));
    } catch (e) { fail(e); }
  }

  const { chunks } = manifest;
  const [core, formulas, herbs, citations, guidance] = await Promise.all([
    chunk<CoreChunk>("core", chunks.core),
    chunk<FormulasChunk>("formulas", chunks.formulas),
    chunks.herbs ? chunk<HerbsChunk>("herbs", chunks.herbs) : Promise.resolve(null),
    chunk<CitationsChunk>("citations", chunks.citations),
    chunk<GuidanceChunk>("guidance", chunks.guidance),
  ]);
  const lists = mf.variants?.["zh-Hans"];
  if (display !== null) await addList("main", lists?.main, chineseStrings(core, formulas, herbs, citations, guidance));
  // the city list is for one screen only: fetched (and hash-checked) when it is first asked for, with its own display list
  const cities = async (): Promise<Cities> => {
    const list = await chunk<Cities>("cities", chunks.cities);
    if (display !== null && shown) await addList("cities", lists?.cities, chineseStrings(list));
    return list;
  };
  // the herb browser (PM-24): the index and each shard are fetched, hash-checked and paired with their Simplified list when a herb page first asks for them — never with the knowledge base
  const hb = mf.herbBrowser;
  const herbBrowser: HerbBrowserSource | null = hb === undefined ? null : {
    count: hb.count,
    async index() {
      const list = await chunk<HerbIndexChunk>("herbs-index", hb.index);
      if (display !== null && shown) await addList("herbs-index", lists?.herbs?.index, chineseStrings(list));
      return list;
    },
    async shard(key) {
      const ref = hb.shards[key];
      if (ref === undefined) return { shard: key, items: {} };
      const list = await chunk<HerbShardChunk>(`herbs-${key}`, ref);
      if (display !== null && shown) await addList(`herbs-${key}`, lists?.herbs?.shards[key], chineseStrings(list));
      return list;
    },
  };
  // the learning book (PM-43): one file in Traditional Chinese, fetched and hash-checked when a reader first opens it — never with the knowledge base, and with no display list
  const bk = mf.book;
  const book: BookSource | null = bk === undefined ? null : { chapters: bk.chapters, load: () => chunk<BookChunk>("book", bk) };
  // the course (PM-60): an index and one file per page, each fetched and hash-checked when a reader first opens it — like the book, never with the knowledge base
  const cr = mf.course;
  const course: CourseSource | null = cr === undefined ? null : {
    pages: cr.pages.map((p) => p.id),
    index: () => chunk<CourseIndexChunk>("course-index", cr.index),
    page(id) {
      const ref = cr.pages.find((p) => p.id === id);
      return ref === undefined ? Promise.reject(new KbError("chunk-invalid", `course: no page ${id}`)) : chunk<CoursePageChunk>(`course-${id}`, ref);
    },
  };
  // the reference for learners and practitioners (PM-53): fetched, hash-checked and paired with its own display list when a learner or a practitioner first needs it — never
  // with the general knowledge base, so a general reader's session holds no amount and no formula beyond the release profile
  const rf = mf.reference;
  const reference: ReferenceSource | null = rf === undefined ? null : {
    roles: rf.roles,
    async load() {
      const ref = await chunk<ReferenceChunk>("reference", rf);
      if (display !== null && shown) await addList("reference", lists?.reference, chineseStrings(ref));
      return ref;
    },
  };
  const raw: RawKbChunks = { version: manifest.version, schemaVersion: manifest.schema, core, formulas, herbs, citations, guidance, cities, herbBrowser, book, course, reference };
  return indexKnowledgeBase(raw, display !== null && shown ? display : undefined);
}
