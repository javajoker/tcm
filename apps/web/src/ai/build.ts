// AI help in this build (Release F; docs/post-mvp/design/ai-assisted-intake.md §3): build-time constants from the profile's `ai` section (vite.config.ts). A release build has every one
// false or null, so everything behind `AI_ENABLED` is left out of it — no card, no indicator, no client, no gateway in its CSP (check-release rule 17).
export const AI_ENABLED: boolean = __APP_AI_ENABLED__;
/** The gateway's origin. */
export const AI_ENDPOINT: string | null = __APP_AI_ENDPOINT__;
/** The conversation module (PM-47) is in this build. */
export const AI_CONVERSATION: boolean = __APP_AI_CONVERSATION__;
