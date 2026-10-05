// Vite configuration. The application PROFILE is a build-time constant (tech spec §6.1): `vite build` defaults to release, the dev server to dev;
// APP_PROFILE overrides both. The knowledge-base chunks are built by the same code as scripts/bundle-data.ts, served in dev and emitted into dist/kb.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";
import { writeBundle } from "../../scripts/bundle-data.ts";
import { cspMeta, headersFile, notFoundPage, redirectsFile, securityTxt } from "../../scripts/deploy-files.ts";

const here = dirname(fileURLToPath(import.meta.url));

function kbPlugin(profile: "release" | "dev"): Plugin {
  const dir = resolve(here, ".kb", profile);
  const run = (): void => {
    const r = writeBundle({ profile, out: dir, overridesPath: process.env.APP_OVERRIDES });
    if (r.overBudget.length) throw new Error(`knowledge-base budget exceeded:\n - ${r.overBudget.join("\n - ")}`);
  };
  return {
    name: "tcm-kb",
    buildStart: run,
    configureServer(server) {
      run();
      server.middlewares.use("/kb", (req, res, next) => {
        const file = join(dir, (req.url ?? "/").split("?")[0]!.replace(/^\/+/, ""));
        try {
          if (!file.startsWith(dir) || !statSync(file).isFile()) return next();
          res.setHeader("Content-Type", file.endsWith(".txt") ? "text/plain; charset=utf-8" : "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.end(readFileSync(file));
        } catch { next(); }
      });
    },
    generateBundle() {
      for (const name of readdirSync(dir)) this.emitFile({ type: "asset", fileName: `kb/${name}`, source: readFileSync(join(dir, name)) });
    },
  };
}

/** Strict Content-Security-Policy for production builds (tech spec §11). Not applied to the dev server (Vite injects inline scripts for HMR). The header version adds `frame-ancestors` (deploy-files.ts). */
function cspPlugin(): Plugin {
  const csp = cspMeta();
  return { name: "tcm-csp", apply: "build", transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`) };
}

/** Ships the attribution notice with the app (`/NOTICE.txt`, linked from the Sources screen): the MIT-licensed sources require their notice to travel with what is derived from them. */
function noticePlugin(): Plugin {
  const text = (): string => readFileSync(resolve(here, "../../NOTICE"), "utf8");
  return {
    name: "tcm-notice",
    configureServer(server) { server.middlewares.use("/NOTICE.txt", (_req, res) => { res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end(text()); }); },
    generateBundle() { this.emitFile({ type: "asset", fileName: "NOTICE.txt", source: text() }); },
  };
}

/**
 * Keeps a build that is not the public release out of search results (release process §6, "Robots"): the dev profile and the closed beta with the draft
 * label on get `<meta name="robots" content="noindex, nofollow">` and a robots.txt that disallows everything. A public release has neither.
 */
function robotsPlugin(noindex: boolean): Plugin {
  return {
    name: "tcm-robots",
    transformIndexHtml: (html) => (noindex ? html.replace("<head>", `<head>\n    <meta name="robots" content="noindex, nofollow" />`) : html),
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: noindex ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\nDisallow: /kb/\n" });
    },
  };
}

/** The files a static host needs (`_headers`, `_redirects`, `404.html`, security.txt): see scripts/deploy-files.ts. */
function deployPlugin(profile: "release" | "dev", noindex: boolean): Plugin {
  const kbDir = resolve(here, ".kb", profile);
  return {
    name: "tcm-deploy",
    apply: "build",
    generateBundle() {
      const kbChunks = readdirSync(kbDir).filter((f) => f !== "manifest.json" && (f.endsWith(".json") || f.endsWith(".txt")));
      const advisory = /https:\/\/github\.com\/[^\s)>]+\/security\/advisories\/new/.exec(readFileSync(resolve(here, "../../SECURITY.md"), "utf8"))?.[0];
      if (advisory === undefined) throw new Error("SECURITY.md does not give the private vulnerability-reporting address");
      this.emitFile({ type: "asset", fileName: "_headers", source: headersFile({ noindex, kbChunks }) });
      this.emitFile({ type: "asset", fileName: "_redirects", source: redirectsFile({ pseudo: profile === "dev" }) });
      this.emitFile({ type: "asset", fileName: "404.html", source: notFoundPage() });
      this.emitFile({ type: "asset", fileName: ".well-known/security.txt", source: securityTxt(advisory, new Date(), advisory.replace(/\/security\/advisories\/new$/, "/blob/main/SECURITY.md")) });
    },
  };
}

export default defineConfig(({ command }) => {
  const profile = (process.env.APP_PROFILE ?? (command === "serve" ? "dev" : "release")) as "release" | "dev";
  if (profile !== "release" && profile !== "dev") throw new Error(`unknown APP_PROFILE ${profile}`);
  return {
    plugins: [react(), kbPlugin(profile), cspPlugin(), noticePlugin(), robotsPlugin(profile === "dev" || process.env.APP_DRAFT_LABEL === "on"), deployPlugin(profile, profile === "dev" || process.env.APP_DRAFT_LABEL === "on")],
    define: { __APP_PROFILE__: JSON.stringify(profile), __APP_BUILD__: JSON.stringify(process.env.APP_BUILD_ID ?? "local") },
    build: { target: "es2022", modulePreload: { polyfill: false }, sourcemap: false },
    css: { modules: { localsConvention: "camelCaseOnly" } },
    test: { environment: "jsdom", setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"], css: false },
  };
});
