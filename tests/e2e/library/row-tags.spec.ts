// tests/e2e/library/row-tags.spec.ts
// Issue #75 (decision #71) — the row-tags surface, end to end, on all three
// engines:
//   1. The quiet tag-glyph button in a standalone row's action cluster opens
//      the shared TagPicker in an anchored popover (aria-expanded reflection,
//      role=dialog named from the row's effective title); a typed tag commits
//      through the picker and, after the close invalidation, the row chips +
//      the tag-filter strip re-derive (ONE reload per editing session).
//   2. Q7A case-insensitive routing: re-typing a stored tag in another case
//      lands on the STORED casing (no twin chips), and re-picking a selected
//      tag toggles it off.
//   3. The Add dialog's optional "Tags (optional)" fieldset: a tag picked at
//      import rides the SAVED record (the service's atomic save) — the new
//      row renders the chip with no second write.
//
// Harness: the chrome-suite seeding convention (prepareFreshPage + seedRows —
// tags persist only on Dexie rows; see tag-popover.spec.ts for the discipline).
import { test, expect, type Page } from "@playwright/test";
import { makeArticle, prepareFreshPage, seedRows } from "../portability/_portability";
import { openAddDialog, pickSource } from "./add-dialog";

// LEM_E2E_BASE discipline — parallel-wayfinder-sessions hygiene.
const BASE = process.env.LEM_E2E_BASE ?? "http://localhost:5173";

const ROW_ARTICLE = {
  ...makeArticle({
    id: "md-rowtagsdemo01",
    title: "Row Tags Demo Article",
    sourceUrl: "https://example.org/row-tags-demo",
    author: "Row Author",
    paragraphs: [
      "The first paragraph of the row tags demo article carries distinctive prose so the seeded row renders identically to an ingested article.",
      "The second paragraph supplies additional unique material so the article body comfortably fills the opening view in either reading mode.",
      "The third paragraph closes the corpus with enough length for stable reading-surface mounting.",
    ],
  }),
  // The row-tags trigger rides the SAME persistence gate as the edit
  // affordance (D17-05 — a tag needs a Dexie row to land on), so the
  // seeded demo row carries ingested provenance like every real intake.
  ingestionMeta: {
    source: "url" as const,
    origin: "url" as const,
    sourceUrl: "https://example.org/row-tags-demo",
    originalHtmlHash: `sha256:${"0".repeat(64)}`,
    fetchedAt: "2026-08-15T00:00:00.000Z",
    extractionConfidence: "high" as const,
    extractionWarnings: [],
  },
};

/** Long-enough paste-HTML payload (clears the ING-06 confidence gate). */
function pasteHtml(title: string): string {
  return `<!DOCTYPE html>
<html><head><title>${title}</title></head>
<body>
<article>
<h1>${title}</h1>
<p>The first paragraph of ${title}. Long enough to clear the ING-06
confidence threshold (textLength >= 500) and varied enough that the round-
trip anchor gate samples five grapheme offsets that all resolve to confident
via the shipped TextQuoteSelector machinery. The library surfaces this
ingested article under the same Saved articles heading and the same per-row
structure as every other row.</p>
<p>The second paragraph continues the long-form prose so the ingestion
pipeline accepts the payload without warnings and the reading engine renders
it identically to a bundled fixture.</p>
</article>
</body></html>`;
}

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
});

async function openLibrary(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = "#/";
  });
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });
}

/** Cold-load the library AFTER a seed: the LibraryView load effect runs
 *  once per mount and a hash-assignment onto the already-mounted view does
 *  not remount it (the 08-05 lesson) — goto + reload re-runs the load. */
async function reloadLibrary(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });
}

function rowTagsTrigger(page: Page) {
  return page.getByRole("button", { name: "Tags for Row Tags Demo Article" });
}

test.describe("row tags popover (issue #75 — decision #71)", () => {
  test("row trigger opens the picker; commits land on the row + filter strip after close", async ({
    page,
  }) => {
    await seedRows(page, { articles: [ROW_ARTICLE] });
    await reloadLibrary(page);

    // The trigger reflects the closed state before any interaction.
    await expect(rowTagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await rowTagsTrigger(page).click();

    const popover = page.getByRole("dialog", { name: "Tags for Row Tags Demo Article" });
    await expect(popover).toBeVisible();
    await expect(rowTagsTrigger(page)).toHaveAttribute("aria-expanded", "true");

    // Type a fresh tag; the create option commits it; the pill chip confirms.
    const tagInput = page.getByRole("combobox", { name: "Add or search a tag" });
    await tagInput.fill("stoic");
    await expect(
      popover.getByRole("option", { name: 'Add “stoic”' }),
    ).toBeVisible();
    await tagInput.press("Enter");
    await expect(
      popover.locator(".tag-picker-chips .tag-picker-pill").filter({ hasText: "stoic" }),
    ).toBeVisible();

    // Escape dismisses (native popover); the close invalidation re-derives
    // the library — the row chip + the filter chip surface the tag.
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(rowTagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
    const row = page.locator(".library-list > li").filter({ hasText: "Row Tags Demo Article" });
    await expect(
      row.locator(".library-row-tags .tag-chip-readonly").filter({ hasText: "stoic" }),
    ).toBeVisible();
    await expect(
      page.locator(".tag-filter .tag-chip").filter({ hasText: "stoic" }),
    ).toBeVisible();

    // Reopen: the picker re-seeds from the row's stored tags.
    await rowTagsTrigger(page).click();
    await expect(popover).toBeVisible();
    await expect(
      popover.locator(".tag-picker-chips .tag-picker-pill").filter({ hasText: "stoic" }),
    ).toBeVisible();
  });

  test("Q7A — another case routes to the stored casing; re-picking toggles off", async ({
    page,
  }) => {
    await seedRows(page, { articles: [ROW_ARTICLE] });
    await reloadLibrary(page);
    await rowTagsTrigger(page).click();
    const popover = page.getByRole("dialog", { name: "Tags for Row Tags Demo Article" });
    await expect(popover).toBeVisible();
    const tagInput = page.getByRole("combobox", { name: "Add or search a tag" });

    // Create "stoic", remove it, then type "STOIC": the routing resolves to
    // the STORED casing (the stats fold carries "stoic"), so the chip reads
    // lowercase — no twin chip.
    await tagInput.fill("stoic");
    await tagInput.press("Enter");
    const pills = popover.locator(".tag-picker-chips .tag-picker-pill");
    await expect(pills.filter({ hasText: "stoic" })).toBeVisible();
    await pills.filter({ hasText: "stoic" }).getByRole("button").click();
    await expect(pills).toHaveCount(0);
    await tagInput.fill("STOIC");
    await tagInput.press("Enter");
    await expect(pills.filter({ hasText: "stoic" })).toBeVisible();
    await expect(pills).toHaveCount(1);

    // Re-picking the selected tag (any case) toggles it OFF.
    await tagInput.fill("stoic");
    await tagInput.press("Enter");
    await expect(pills).toHaveCount(0);
  });

  test("Add dialog tags fieldset applies to the saved article (the atomic save)", async ({
    page,
  }) => {
    await openLibrary(page);
    await openAddDialog(page);
    await pickSource(page, "paste");
    await page
      .getByRole("textbox", { name: /paste html/i })
      .fill(pasteHtml("Tagged At Import"));
    // Pick a tag in the Tags (optional) fieldset BEFORE submitting.
    const tagInput = page.getByRole("combobox", { name: "Add or search a tag" });
    await tagInput.fill("fresh");
    await tagInput.press("Enter");
    await page.getByRole("button", { name: /add pasted article/i }).click();
    await page.waitForURL(/#\/article\//, { timeout: 15_000 });

    await openLibrary(page);
    const row = page.locator(".library-list > li").filter({ hasText: "Tagged At Import" });
    await expect(row).toBeVisible();
    await expect(
      row.locator(".library-row-tags .tag-chip-readonly").filter({ hasText: "fresh" }),
    ).toBeVisible();
    await expect(
      page.locator(".tag-filter .tag-chip").filter({ hasText: "fresh" }),
    ).toBeVisible();
  });
});
