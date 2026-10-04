// End-to-end scenarios E1–E20 (docs/test-plan.md §5.1) and the visual-regression screenshots (§1, Q-07).
// Two builds are served the way the host serves them (scripts/serve-dist.ts, a Cloudflare-Pages emulator): the RELEASE build with the closed-beta draft label on (`dist`, :4173) and the DEV build (`dist-dev`, :4174).
// `pnpm test:e2e` builds both first. Projects: desktop 1280×800 and mobile 375×812, each in zh-Hant and en; scenarios that need the dev profile are in `dev.*.spec.ts`.
// Locally `E2E_CHANNEL=chrome` uses the installed Google Chrome instead of the downloaded Chromium.
import { defineConfig, devices } from "@playwright/test";
import type { Options } from "./e2e/support/fixtures.ts";
import type { Lang } from "./e2e/support/i18n.ts";

const RELEASE = "http://localhost:4173";
const DEV = "http://localhost:4174";
const channel = process.env.E2E_CHANNEL;
const browser = (extra: object = {}) => ({ ...devices["Desktop Chrome"], ...(channel ? { channel } : {}), ...extra });

const sizes = {
  desktop: browser({ viewport: { width: 1280, height: 800 } }),
  mobile: browser({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }),
} as const;
const langs: readonly [string, Lang][] = [["en", "en"], ["zh", "zh-Hant"]];

const projects = (["release", "dev"] as const).flatMap((profile) =>
  (["desktop", "mobile"] as const).flatMap((size) =>
    langs
      // the dev profile is exercised on desktop in both languages and on mobile in Chinese only: the same code, a smaller matrix
      .filter(([short]) => profile === "release" || size === "desktop" || short === "zh")
      .map(([short, lang]) => ({
        name: `${profile}-${size}-${short}`,
        testMatch: profile === "dev" ? /dev\..*\.spec\.ts$/ : /^(?!.*\/(dev\.|visual\.)).*\.spec\.ts$/,
        use: { ...sizes[size], baseURL: profile === "dev" ? DEV : RELEASE, lang, locale: lang === "en" ? "en-US" : "zh-TW", timezoneId: "Asia/Taipei" },
      }))));

// Visual regression (Q-07): the key screens in zh-Hant, en and the pseudo-locale en-XA (dev build only) at 320 and 1280 px. The baselines are platform-specific (fonts), so they are made by the
// "Visual baselines" workflow, uploaded for review and committed by a person; the ordinary E2E run does not include these projects.
const visual = ([320, 1280] as const).map((width) => ({
  name: `visual-${width}`,
  testMatch: /visual\.spec\.ts$/,
  use: { ...browser({ viewport: { width, height: width === 320 ? 640 : 800 } }), baseURL: DEV, lang: "en" as Lang, locale: "en-US", timezoneId: "Asia/Taipei", colorScheme: "light" as const, reducedMotion: "reduce" as const },
}));

export default defineConfig<Options>({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  timeout: 90_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : [["list"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node ../../scripts/serve-dist.ts dist 4173", url: `${RELEASE}/en/`, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: "node ../../scripts/serve-dist.ts dist-dev 4174", url: `${DEV}/en/`, reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
  projects: [...projects, ...visual],
});
