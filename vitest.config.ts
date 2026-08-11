import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Phase 7 extends Vitest into a workspace (Vitest 4 `test.projects` form) so
// the new `/server` pipeline code (jsdom + isomorphic-dompurify +
// @mozilla/readability + node:dns) runs under the same Vitest runner as the
// v1.0 unit suite, in a dedicated `server` project. Both projects share the
// jsdom env + globals + setupFiles; they differ only in their `include` globs
// (RESEARCH.md §Validation Architecture L996; 07-PATTERNS.md §vitest.config.ts
// L427-444).
//
// jsdom is NOT authoritative for layout (STACK.md "What NOT to Use"). Layout /
// reading-order / focus assertions still run in Playwright, not here. The
// `/server` project uses jsdom only as the DOM substrate for the extraction +
// sanitize unit tests (mirroring how jsdom is used in production via
// isomorphic-dompurify).
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      // Project 1 — the v1.0 unit + component suite. Excludes the new
      // tests/unit/server/** specs (owned by the `server` project below) and
      // the Playwright e2e tree.
      {
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: [
            "tests/unit/**/*.test.ts",
            "tests/unit/**/*.test.tsx",
            "tests/component/**/*.test.tsx",
          ],
          exclude: ["tests/unit/server/**", "tests/e2e", "node_modules"],
        },
      },
      // Project 2 — the Phase 7 `/server` pipeline specs (mXSS, extraction,
      // normalization, confidence, slugify, spike). Same jsdom env + globals +
      // setupFiles; includes only tests/unit/server/**.
      {
        test: {
          name: "server",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/unit/server/**/*.spec.ts"],
          exclude: ["tests/e2e", "node_modules"],
        },
      },
    ],
  },
});
