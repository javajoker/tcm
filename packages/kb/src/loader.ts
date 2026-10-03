import { KbError } from "./errors.ts";
import { indexKnowledgeBase, SUPPORTED_SCHEMA_VERSION } from "./indexer.ts";
import type { ChunkRef, CitationsChunk, CoreChunk, FormulasChunk, HerbsChunk, KnowledgeBase, Manifest, RawKbChunks } from "./types.ts";

export interface LoadOptions {
  /** URL (absolute or root-relative) of the directory that holds `manifest.json` and the chunk files, e.g. "/kb". */
  readonly baseUrl: string;
  /** Injected for tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  /** Injected for tests; defaults to WebCrypto. */
  readonly sha256?: (bytes: ArrayBuffer) => Promise<string>;
}

async function webCryptoSha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const join = (base: string, file: string): string => `${base.replace(/\/+$/, "")}/${file}`;

function assertManifest(m: unknown): asserts m is Manifest {
  const ok = typeof m === "object" && m !== null && typeof (m as Manifest).version === "string" && typeof (m as Manifest).schema === "number" &&
    typeof (m as Manifest).chunks === "object" && (m as Manifest).chunks !== null && !!(m as Manifest).chunks.core && !!(m as Manifest).chunks.formulas && !!(m as Manifest).chunks.citations;
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
  if (manifest.schema !== SUPPORTED_SCHEMA_VERSION) {
    throw new KbError("schema-mismatch", `knowledge base schema ${manifest.schema} is not supported (expected ${SUPPORTED_SCHEMA_VERSION})`);
  }

  async function chunk<T>(name: string, ref: ChunkRef): Promise<T> {
    const res = await doFetch(join(opts.baseUrl, ref.file));
    if (!res.ok) throw new KbError("chunk-missing", `${name}: HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    const actual = await sha256(bytes);
    if (actual !== ref.sha256) throw new KbError("chunk-hash-mismatch", `${name}: hash ${actual.slice(0, 12)}… does not match the manifest`);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
      throw new KbError("chunk-invalid", `${name}: not valid JSON`);
    }
  }

  const { chunks } = manifest;
  const [core, formulas, herbs, citations] = await Promise.all([
    chunk<CoreChunk>("core", chunks.core),
    chunk<FormulasChunk>("formulas", chunks.formulas),
    chunks.herbs ? chunk<HerbsChunk>("herbs", chunks.herbs) : Promise.resolve(null),
    chunk<CitationsChunk>("citations", chunks.citations),
  ]);
  const raw: RawKbChunks = { version: manifest.version, schemaVersion: manifest.schema, core, formulas, herbs, citations };
  return indexKnowledgeBase(raw);
}
