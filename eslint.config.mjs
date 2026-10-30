import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    // Any throwaway dist directory the documented `NEXT_DIST_DIR=.next-<name>`
    // build flow produces; without this, linting a built tree reports tens of
    // thousands of errors from the copied standalone `node_modules`.
    ".next-*/**",
    ".next-playwright/**",
    ".next-home-preview/**",
    ".next-validation/**",
    ".next-review/**",
    ".next-ui-preview/**",
    ".next-image-quality/**",
    "node_modules/**",
    ".artifacts/**",
    ".cache/**",
    ".tools/**",
    "public/pdf.worker.min.mjs",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
