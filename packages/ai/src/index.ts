// @tcm/ai — AI help (Release F; docs/post-mvp/design/ai-assisted-intake.md): the protocol, the validator, the wording lint, the device's red-flag check. The mock provider is
// `@tcm/ai/mock`.
export * from "./protocol.ts";
export { fold, parseTurnRequest, validateReply } from "./validate.ts";
export type { Validated } from "./validate.ts";
export { lintQuestion } from "./wording.ts";
export { matchRedFlags } from "./redflags.ts";
export { OBSERVE_FLOOR, parseObserveRequest, validateObservation } from "./observe.ts";
export type { ObserveParse, ValidatedObservation } from "./observe.ts";
export { base64FromBytes, bytesFromBase64, inspectJpeg, stripJpeg } from "./image.ts";
export type { JpegInfo, JpegProblem } from "./image.ts";
export { vocabularyFrom } from "./vocabulary.ts";
export type { Bilingual, VocabSource } from "./vocabulary.ts";
export type { RedFlagLevel, RedFlagMatch } from "./redflags.ts";
