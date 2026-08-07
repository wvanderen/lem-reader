// tests/e2e/annotations/ambiguous-orphan-surface.spec.ts
// ANNO-07 — Ambiguous/orphan highlights surface EXPLICITLY (dashed marker +
// flagged drawer entry + non-navigating + open-announce), NEVER silent
// reattachment. The reader sees WHAT couldn't be relocated + can delete.
import { test, expect } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  PIXEL_SVG,
  openArticle,
  drawerTrigger,
  announcementRegion,
} from "./_fixtures";
import type { Page } from "@playwright/test";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  // Wipe + open the article once so the app's Dexie instance initializes the
  // object stores. Seed records are then written to the EXISTING stores +
  // a reload picks them up via the eager batch-resolve.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await openArticle(page, FIXTURE);
});

/** Seed + reload so the eager batch-resolve picks up the seeded record. */
async function seedAndReload(
  page: Page,
  rec: { id: string; quote: { prefix: string; exact: string; suffix: string } },
): Promise<void> {
  await seedRecord(page, { ...rec, articleId: FIXTURE, position: { start: 5, end: 15 } });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
}

async function seedRecord(
  page: Page,
  rec: {
    id: string;
    articleId: string;
    position: { start: number; end: number };
    quote: { prefix: string; exact: string; suffix: string };
  },
): Promise<void> {
  await page.evaluate(async (r) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("highlights", "readwrite");
    tx.objectStore("highlights").put({
      schemaVersion: 1,
      id: r.id,
      articleId: r.articleId,
      revision: 1,
      position: r.position,
      quote: r.quote,
      createdAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, rec);
}

test.describe("ANNO-07 ambiguous/orphan surfacing (05-05)", () => {
  test("orphan: inline renders mark.highlight.unresolved (dashed) — never a silent fill", async ({
    page,
  }) => {
    // Seed an orphan: quote.exact not in the article.
    await seedAndReload(page, {
      id: "seed-orphan-inline",
      quote: { prefix: "zzq ", exact: "ZZQORPHANPASSAGENOTPRESENT", suffix: " qqz" },
    });
    // The orphan renders with the .unresolved modifier (dashed outline, NOT
    // a filled mark). ANNO-07: never silent re-attach to a confident fill.
    const unresolved = page.locator("mark.highlight.unresolved");
    await expect(unresolved.first()).toBeVisible();
    // A confident (filled) mark may also exist for other highlights, but the
    // orphan MUST carry .unresolved (not a bare .highlight fill).
    const orphanMark = page.locator('mark.highlight.unresolved[data-highlight-id="seed-orphan-inline"]');
    await expect(orphanMark).toBeVisible();
  });

  test("orphan: drawer entry shows the flag + disabled jump + enabled delete", async ({ page }) => {
    await seedAndReload(page, {
      id: "seed-orphan-drawer",
      quote: { prefix: "zzq ", exact: "ZZQORPHANPASSAGENOTPRESENT", suffix: " qqz" },
    });
    await drawerTrigger(page).click();
    const entry = page.locator("dialog.annotations-drawer .drawer-list li").first();
    await expect(entry).toBeVisible();
    // The flag copy surfaces the unresolved state.
    await expect(entry).toContainText(/Couldn't/i);
    // The jump button is disabled (never navigate to an uncertain spot).
    await expect(entry.locator(".drawer-entry")).toBeDisabled();
    // The body explanation is present (D5-04).
    await expect(entry.locator(".drawer-entry-body")).toBeVisible();
  });

  test("open-announce: '{N} highlight(s) couldn't be relocated.' fires once on open", async ({
    page,
  }) => {
    await seedAndReload(page, {
      id: "seed-orphan-announce",
      quote: { prefix: "zzq ", exact: "ZZQORPHANPASSAGENOTPRESENT", suffix: " qqz" },
    });
    // The one-time open-announce fires via the .status region (D5-04).
    await expect(announcementRegion(page)).toContainText(/couldn't be relocated/i);
  });

  test("ambiguous: inline renders mark.highlight.unresolved + drawer flag (not silent re-attach)", async ({
    page,
  }) => {
    // Seed an AMBIGUOUS highlight: a quote.exact that appears MULTIPLE times
    // in the article so resolveQuoteSelector returns "ambiguous". We use a
    // common English word likely to recur ("the").
    await seedAndReload(page, {
      id: "seed-ambiguous",
      quote: { prefix: "", exact: "the", suffix: "" },
    });
    const unresolved = page.locator(
      'mark.highlight.unresolved[data-highlight-id="seed-ambiguous"]',
    );
    await expect(unresolved.first()).toBeVisible();
    await drawerTrigger(page).click();
    const entry = page.locator("dialog.annotations-drawer .drawer-list li").first();
    await expect(entry).toContainText(/Couldn't/i);
    await expect(entry.locator(".drawer-entry")).toBeDisabled();
  });

  test("delete is always available on an unresolved entry (D5-04)", async ({ page }) => {
    await seedAndReload(page, {
      id: "seed-orphan-delete",
      quote: { prefix: "zzq ", exact: "ZZQORPHANPASSAGENOTPRESENT", suffix: " qqz" },
    });
    await drawerTrigger(page).click();
    const entry = page.locator("dialog.annotations-drawer .drawer-list li").first();
    // The Delete action is present + enabled (D5-04 — delete always available).
    const deleteBtn = entry.locator(".drawer-entry-actions .drawer-entry-action", { hasText: /^Delete$/ });
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toBeEnabled();
  });
});
