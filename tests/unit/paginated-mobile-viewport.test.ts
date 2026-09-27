import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = resolve(process.cwd(), "src/app.css");
const css = readFileSync(cssPath, "utf8");

describe("paginated mobile viewport geometry", () => {
  it("uses the dynamic viewport for both the page frame and matching header cap", () => {
    // The budget is declared ONCE with the dvh re-point feature-gated
    // (@supports — a custom-property value is never parse-invalid, so the
    // old source-order fallback trick would break var() consumers on legacy
    // engines), and the header cap spends the SAME property — the two
    // formulas cannot drift.
    expect(css).toContain(
      "--paginated-budget: calc(100vh - 48px - 2px - 2 * var(--space-2xl));",
    );
    expect(css).toContain(
      "--paginated-budget: calc(100dvh - 48px - 2px - 2 * var(--space-2xl));",
    );
    expect(css).toContain("height: var(--paginated-budget);");
    expect(css).toContain("max-height: calc(var(--paginated-budget) * 0.25);");
  });
});
