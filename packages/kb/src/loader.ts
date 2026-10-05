import { KbError } from "./errors.ts";
import { chineseStrings, digestInput, newDisplay } from "./hans.ts";
import { indexKnowledgeBase, SUPPORTED_SCHEMA_VERSION } from "./indexer.ts";
import type { ChunkRef, Cities, CitationsChunk, CoreChunk, FormulasChunk, GuidanceChunk, HerbsChunk, KnowledgeBase, Manifest, RawKbChunks } from "./types.ts";

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
  async function addList(name: "main" | "cities", list: readonly string[]): Promise<void> {
    const ref = mf.variants?.["zh-Hans"]?.[name];
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
  if (display !== null) await addList("main", chineseStrings(core, formulas, herbs, citations, guidance));
  // the city list is for one screen only: fetched (and hash-checked) when it is first asked for, with its own display list
  const cities = async (): Promise<Cities> => {
    const list = await chunk<Cities>("cities", chunks.cities);
    if (display !== null && shown) await addList("cities", chineseStrings(list));
    return list;
  };
  const raw: RawKbChunks = { version: manifest.version, schemaVersion: manifest.schema, core, formulas, herbs, citations, guidance, cities };
  return indexKnowledgeBase(raw, display !== null && shown ? display : undefined);
}
