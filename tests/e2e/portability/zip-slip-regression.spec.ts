// tests/e2e/portability/zip-slip-regression.spec.ts
// Plan 09-01 Task 1 — Wave 0 sentinel scaffold (mirrors the Phase 04-02
// Wave-0 precedent: a visible sentinel, NOT test.todo). REPLACED by the real
// SC#2 malicious-zip regression tests in Plan 09-06 (the unit-level mandated
// evil-entry corpus already lands in tests/unit/portability/zip-slip.test.ts
// in this plan's Task 2).
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network
  // (mirrors remove-cascade.spec.ts beforeEach).
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

test.describe("Wave 0 sentinel — portability zip-slip regression (replaced in 09-06)", () => {
  test("harness wires up: the library view renders", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
