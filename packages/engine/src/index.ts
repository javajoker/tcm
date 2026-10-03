export * from "./types.ts";
export { resolvePolicy, baselineFacts, matchedKeys, summariseRedFlags, SERIOUS_RED_FLAGS } from "./policy.ts";
export { normalize, applies, qualityOf, sourceOf, type Normalized, type NormalizedFinding, type Conflict, type NormalizeInput } from "./normalize.ts";
export { scorePatterns, scorePattern, scoreElements, scoreElement, bandOf, type ScoredPattern, type ScoredElement, type EvidenceFor, type EvidenceAgainst, type Band } from "./patterns.ts";
export { buildReference, profileParamsFor, type ReferenceBlock, type ReferenceInput } from "./reference.ts";
export { synthesizePanel, observedPanel, wuxingFunction, bagang, yinYangOf, type PanelResult, type BagangScalars, type Alignment, type YinYang, type Projection } from "./panel.ts";
export { fitFormula, fitFormulas, formulaVector, cost, bestScale, strengthOf, candidateFormulaIds, passesSymptomFit, recomputeTier, compositionOf, coreFitOf, dimensionWeight, type FormulaFit, type CompositionRow, type PanelVector, type Tier, type Strength, type Role } from "./formulas.ts";
export { herbVector, compositionVector, modificationPool, classicalModifications, greedyModify, modifyFormula, type ClassicalModification, type ResidualStep, type ResidualModification } from "./modify.ts";
export { reconcile, kappaOf, mixedKinds, patternElements, type Verdict, type Confidence, type MixedKind, type PresentedPattern, type TieBreak, type Differential, type DifferentialSymptom, type ReconcileInput } from "./reconcile.ts";
