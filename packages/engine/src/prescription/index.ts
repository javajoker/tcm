// The prescription model (Release E, PM-37 … PM-40; docs/post-mvp/design/prescription-model.md), a subpath of its own: `@tcm/engine/prescription`.
// The app loads the engine's main entry as a whole, so anything exported there ships in every build; this model is loaded only by a build that can show a
// prescription (the development profile today), and a release build carries none of it.
export { saturation, burdenGrowth, typicalDose, doseBandOf, herbAtDose, processingOf, applyPairings, compositionAction, type AmountBand, type HerbAction, type HerbAtDoseOptions, type AppliedPairing, type PairingOutcome, type CompositionRow as RxRow, type PrescriptionTables, type CompositionAction } from "./herbs.ts";
export { classicalRows, contributions, measureRoles, formulaMechanism, analyseFormula, type ClassicalRows, type HerbContribution, type RoleReading, type RoleCheck, type RoleReport, type RoleOptions, type MechanismComponent, type HerbMechanism, type Mechanism } from "./formula.ts";
export { personalise, isOfNature, interactionFlags, type Nature, type Prescription, type PrescriptionChange, type PrescriptionRow, type AmountFactor, type PersonaliseInput } from "./personalise.ts";
export { verifyLibrary, passing, type FormulaVerification, type IndicationCheck, type DirectionCheck, type VerificationInput } from "./verify.ts";
