// tests/e2e/portability/a11y.spec.ts
// Plan 09-01 Task 1 — Wave 0 sentinel scaffold (mirrors the Phase 04-02
// Wave-0 precedent: a visible sentinel, NOT test.todo). REPLACED by the real
// portability accessibility tests (preview dialog keyboard/axe checks) in
// Plan 09-06.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network
  // (mirrors remove-cascade.spec.ts beforeEach).
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

test.describe("Wave 0 sentinel — portability a11y (replaced in 09-06)", () => {
  test("harness wires up: the library view renders", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
