// Flat ESLint config. Besides general hygiene it enforces the layering rules of docs/tech-spec.md §2:
//   @tcm/wuxing imports nothing; @tcm/engine imports only @tcm/kb (types) and @tcm/wuxing;
//   the pure packages never touch the DOM, clock, randomness, network or storage.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

const PURE_GLOBALS = ["window", "document", "localStorage", "sessionStorage", "indexedDB", "fetch", "navigator", "XMLHttpRequest", "Worker"];
const FRAMEWORK_IMPORTS = ["react", "react/*", "react-dom", "react-dom/*", "wouter", "zustand", "zustand/*", "node:*"];

const purity = (extraImportPatterns) => ({
  "no-restricted-properties": [
    "error",
    { object: "Date", property: "now", message: "Time is injected (tech spec T14): pass `now` in." },
    { object: "Math", property: "random", message: "No randomness in the pure packages (tech spec T14)." },
  ],
  "no-restricted-globals": [
    "error",
    ...PURE_GLOBALS.map((name) => ({ name, message: "The pure packages must not touch browser or network APIs (tech spec §2)." })),
  ],
  "no-restricted-imports": ["error", { patterns: [...FRAMEWORK_IMPORTS, "**/apps/**", ...extraImportPatterns] }],
});

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "reference/**", "data/**", ".venv/**", "**/*.generated.ts", "packages/kb/src/generated/**", "packages/wuxing/src/astro/vsop87-earth.ts"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "error",
    },
  },
  // @tcm/wuxing: zero dependencies, imports nothing from the workspace.
  {
    files: ["packages/wuxing/src/**/*.ts"],
    rules: purity(["@tcm/*"]),
  },
  // @tcm/engine: only @tcm/kb and @tcm/wuxing.
  {
    files: ["packages/engine/src/**/*.ts"],
    rules: purity(["@tcm/i18n", "@tcm/engine", "@tcm/web", "../../*"]),
  },
  // @tcm/i18n: pure, no workspace imports.
  {
    files: ["packages/i18n/src/**/*.ts"],
    rules: purity(["@tcm/*"]),
  },
  // @tcm/kb: loader may use fetch (injected) but never the DOM or the clock; types only from itself.
  {
    files: ["packages/kb/src/**/*.ts"],
    rules: {
      ...purity(["@tcm/engine", "@tcm/web", "@tcm/i18n"]),
      "no-restricted-globals": ["error", ...PURE_GLOBALS.filter((n) => n !== "fetch").map((name) => ({ name, message: "@tcm/kb must not touch the DOM or storage." }))],
    },
  },
  // The web app: React hooks rules and accessibility rules; it may use the DOM and the engine packages, never the other way round.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
    plugins: { ...jsxA11y.flatConfigs.recommended.plugins, "react-hooks": reactHooks },
    rules: { ...jsxA11y.flatConfigs.recommended.rules, ...reactHooks.configs.recommended.rules, "react-hooks/exhaustive-deps": "error" },
  },
  // Tests and scripts may use Node and the console.
  {
    files: ["**/test/**/*.ts", "**/node/**/*.ts", "scripts/**/*.ts", "**/*.config.*"],
    rules: { "no-console": "off", "no-restricted-properties": "off", "no-restricted-globals": "off", "no-restricted-imports": "off" },
  },
);
