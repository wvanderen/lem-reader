// tests/e2e/chrome/shell-nav.spec.ts
// Plan 15-02 — the persistent application shell (D15-01/D15-02): a
// nav.shell-nav[aria-label="Primary"] with exactly two text links (Library →
// #/, Highlights → #/highlights — D15-08) inside the existing 48px
// app-header on ALL three destinations, the brand link home (D15-05), the
// ModeToggle joining the articleMounted gate (D15-15), and the ≤639px
// wordmark collapse + narrow tuning (D15-17).
//
// Requirements owned by this file:
//   - NAV-01 — direct Library ↔ Highlights navigation through the shell
//   - NAV-02 — brand as the predictable home (#/ All view)
//   - NAV-05 — reading-only controls gated, global prefs (gear) everywhere
//
// Wave 0 (this revision): harness-only sentinel proving the spec wires up —
// the 04-02 Wave-0 precedent: a REAL passing sentinel, NOT test.todo (a
// todo only proves compilation; a passing sentinel proves the harness).
// Task 3 extends this file with the six real test groups. Plain test()
// blocks inherit the 3-engine matrix (chromium/firefox/webkit) from
// playwright.config.ts; the 3-engine run lands at Plan 15-04's matrix task.
//
// Harness reuse (REUSE-DO-NOT-FORK): BASE + wipeDatabase from
// ../annotations/_fixtures (the shared e2e discipline — deterministic
// first-run state + image stub). Selector discipline: query by role/name
// (getByRole) — never by CSS class for identity assertions.
import { test, expect } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";

test.describe("shell nav (15-02 — NAV-01/NAV-02/NAV-05)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("sentinel: harness wires up (library h1 renders)", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });
});
