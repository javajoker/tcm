export * from "./types.ts";
export { resolvePolicy, baselineFacts, matchedKeys, summariseRedFlags, SERIOUS_RED_FLAGS } from "./policy.ts";
export { normalize, applies, qualityOf, sourceOf, type Normalized, type NormalizedFinding, type Conflict, type NormalizeInput } from "./normalize.ts";
export { scorePatterns, scorePattern, scoreElements, scoreElement, bandOf, type ScoredPattern, type ScoredElement, type EvidenceFor, type EvidenceAgainst, type Band } from "./patterns.ts";
export { buildReference, profileParamsFor, type ReferenceBlock, type ReferenceInput } from "./reference.ts";
