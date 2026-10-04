import { test as base, expect } from "@playwright/test";
import { App } from "./app.ts";
import type { Lang } from "./i18n.ts";

export interface Options { lang: Lang }
export const test = base.extend<Options & { app: App }>({
  lang: ["en", { option: true }],
  app: async ({ page, lang }, use) => { await use(new App(page, lang)); },
});
export { expect };
