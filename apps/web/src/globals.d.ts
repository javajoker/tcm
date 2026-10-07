/** Compile-time constants injected by vite.config.ts (tech spec §6.1). */
declare const __APP_PROFILE__: "release" | "dev";
declare const __APP_BUILD__: string;
/** AI help in this build (Release F): the profile's `ai` section; false and null in a release. */
declare const __APP_AI_ENABLED__: boolean;
declare const __APP_AI_ENDPOINT__: string | null;
declare const __APP_AI_CONVERSATION__: boolean;
