// @tcm/ai — AI help (Release F; docs/post-mvp/design/ai-assisted-intake.md): the protocol, the validator, the wording lint. The mock provider is `@tcm/ai/mock`.
export * from "./protocol.ts";
export { fold, parseTurnRequest, validateReply } from "./validate.ts";
export type { Validated } from "./validate.ts";
export { lintQuestion } from "./wording.ts";
