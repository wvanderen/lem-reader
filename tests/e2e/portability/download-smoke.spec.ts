// tests/e2e/portability/download-smoke.spec.ts
// Plan 09-01 Task 1 — Wave 0 / RESEARCH A1 + Pitfall 9 verification. Proves
// Playwright download events are capturable under this repo's current
// playwright.config.ts BEFORE any portability plan depends on
// page.waitForEvent("download") for the SC#4 round-trip harness (Plan 09-03)
// and the highlights-export specs (Plan 09-06).
//
// The test synthesizes the SAME download gesture src/portability/download.ts
// (Plan 09-01 Task 3) will use: URL.createObjectURL over a Blob, a
// synthesized <a download> element, appended → clicked → removed. If this
// spec times out waiting for the download event, the fallback is to add
// `acceptDownloads: true` to the playwright.config.ts use block (per the
// 09-01-PLAN Task 1 action step 4).
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

test.describe("Wave 0 — download capture (A1 / Pitfall 9)", () => {
  test("a synthesized Blob + <a download> click fires a capturable download event", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });

    // Arm the listener BEFORE the click, then synthesize the download inside
    // the page — the exact shape downloadBlob() uses.
    const downloadPromise = page.waitForEvent("download");
    await page.evaluate(() => {
      const blob = new Blob(["lem-reader download smoke\n"], {
        type: "text/plain",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "smoke.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("smoke.txt");
  });
});
