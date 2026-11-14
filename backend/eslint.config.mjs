// Configuración de ESLint (RNF-06). Se ejecuta desde la raíz del repositorio con `npm run lint`
// (dentro de backend/), de modo que cubre el backend en TypeScript y la PWA en JavaScript.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";

const sinUsar = ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }];

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "backend/dist/**",
    "backend/src/generated/**",
    "backend/.test-build/**",
    "backend/playwright-report/**",
    "backend/test-results/**",
    "lighthouse/**",
  ]),
  {
    files: ["backend/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-unused-vars": sinUsar,
      "@typescript-eslint/no-explicit-any": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
    },
  },
  {
    files: ["backend/**/*.test.ts", "backend/integracion/**/*.ts", "backend/e2e/**/*.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
  { files: ["backend/src/types/**/*.d.ts"], rules: { "@typescript-eslint/no-namespace": "off" } },
  {
    files: ["backend/**/*.mjs", "carga/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["carga/escenario.js"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "module", globals: { __ENV: "readonly" } },
  },
  {
    files: ["frontend/**/*.js"],
    ignores: ["frontend/sw.js", "frontend/js/theme-init.js"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.browser },
    rules: { "no-unused-vars": sinUsar, "no-empty": ["error", { allowEmptyCatch: true }], eqeqeq: ["error", "always", { null: "ignore" }] },
  },
  {
    files: ["frontend/sw.js"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "script", globals: globals.serviceworker },
    rules: { "no-unused-vars": sinUsar },
  },
  {
    files: ["frontend/js/theme-init.js"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  prettier,
]);
