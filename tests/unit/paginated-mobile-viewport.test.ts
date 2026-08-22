import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = resolve(process.cwd(), "src/app.css");
const css = readFileSync(cssPath, "utf8");

describe("paginated mobile viewport geometry", () => {
  it("uses the dynamic viewport for both the page frame and matching header cap", () => {
    expect(css).toContain(
      "height: calc(100dvh - 48px - 2px - 2 * var(--space-2xl));",
    );
    expect(css).toContain(
      "max-height: calc((100dvh - 48px - 2px - 2 * var(--space-2xl)) * 0.25);",
    );
  });
});
