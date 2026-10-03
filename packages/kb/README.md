# @tcm/kb

Knowledge-base **types, loader and indices** for the TCM app. No medical logic; no dependencies. Specified in [tech spec §4.2, §5](../../docs/tech-spec.md).

```ts
import { loadKnowledgeBase, indexKnowledgeBase } from "@tcm/kb";
const kb = await loadKnowledgeBase({ baseUrl: "/kb" });        // browser: manifest + chunks, hashes verified
const kb2 = indexKnowledgeBase(rawChunks);                      // pure; Node tests build chunks with `@tcm/kb/node`
kb.patternById.get("SP1");  kb.formulas.get("F_SIJUNZI");  kb.citation("suwen-005-1");  kb.params.pattern.bands;
```

## Types are generated

`src/generated/*.ts` are produced from `data/schema/*.schema.json` by `pnpm generate:kb-types` (committed; `pnpm check:kb-types` fails on drift in CI).
Length and pattern constraints are checked by the Python build, not encoded in the types. `src/types.ts` gives the records readable names (`Pattern`, `Formula`, `Herb`, …) and defines `KnowledgeBase`.

## Chunks and manifest (written by `scripts/bundle-data.ts`)

`node scripts/bundle-data.ts --profile release|dev --out <dir> [--overrides file.json]` (env `APP_PROFILE`, `APP_OVERRIDES`). `buildChunks` (pure, in `src/bundle.ts`) resolves the profile, applies build-time overrides (**restrict only**), computes what the profile can reach (`reachOf`) and prunes the rest: release (max level L1) ships tier-A formulas without amounts, no herb records, no modifications, no internal provenance, no dev profile; dev ships everything. Chunks are content-hashed; budgets (gzip): core 60 KB, formulas 30 KB, herbs 25 KB, citations 15 KB — the build fails on overrun (release today ≈ 60 KB in total).

`manifest.json` (never cached): `{ schema, version, profile, chunks: { core, formulas, herbs?, citations } }` where each chunk is `{ file, sha256, bytes }`; `file` carries a content hash so chunks are immutable.

| Chunk | Content |
|---|---|
| `core` | `config` (the active profile only), symptoms, questions + modules, exclusions, patterns, elements, constitutions, red flags, tongue, pulse, panel schema, scoring params, safety, treatment, wuxing tables, glossary |
| `formulas` | the formulas the profile can reach, plus `herbNames` (display name of every herb they use) |
| `herbs` | the 94 curated herb records (absent when the profile can never reach L2) |
| `citations` | the quotation registry |

`loadKnowledgeBase` refuses a manifest of another **schema version** before fetching anything, verifies every chunk's SHA-256 (`KbError` codes: `schema-mismatch`, `manifest-invalid`, `chunk-missing`, `chunk-hash-mismatch`, `chunk-invalid`, `index-invalid`).

## Develop

```bash
pnpm --filter @tcm/kb test        # node:test; reads the real data/ through node/fromDisk.ts
pnpm --filter @tcm/kb typecheck
```
