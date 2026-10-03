// Vite configuration. The application PROFILE is a build-time constant (tech spec §6.1): `vite build` defaults to release, the dev server to dev;
// APP_PROFILE overrides both. The knowledge-base chunks are built by the same code as scripts/bundle-data.ts, served in dev and emitted into dist/kb.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";
import { writeBundle } from "../../scripts/bundle-data.ts";

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
          res.setHeader("Content-Type", "application/json; charset=utf-8");
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

/** Strict Content-Security-Policy for production builds (tech spec §11). Not applied to the dev server (Vite injects inline scripts for HMR). */
function cspPlugin(): Plugin {
  const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
  return { name: "tcm-csp", apply: "build", transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`) };
}

export default defineConfig(({ command }) => {
  const profile = (process.env.APP_PROFILE ?? (command === "serve" ? "dev" : "release")) as "release" | "dev";
  if (profile !== "release" && profile !== "dev") throw new Error(`unknown APP_PROFILE ${profile}`);
  return {
    plugins: [react(), kbPlugin(profile), cspPlugin()],
    define: { __APP_PROFILE__: JSON.stringify(profile), __APP_BUILD__: JSON.stringify(process.env.APP_BUILD_ID ?? "local") },
    build: { target: "es2022", modulePreload: { polyfill: false }, sourcemap: false },
    css: { modules: { localsConvention: "camelCaseOnly" } },
    test: { environment: "jsdom", setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"], css: false },
  };
});
