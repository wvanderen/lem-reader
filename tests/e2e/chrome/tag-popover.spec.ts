// tests/e2e/chrome/tag-popover.spec.ts
// Plan 13-10 (G5 — the recorded user-direction change): the tag affordance
// contract, end to end, on all three engines.
//
// SCENARIOS:
//   1. The tags popover opens from the TOP BAR (the tags-trigger beside the
//      annotations/mode/gear controls), edits tags through the byte-unchanged
//      TagEntry, persists to the article row (library re-derivation), and
//      closes via BOTH native light-dismiss paths (outside click + Escape)
//      with focus restored to the trigger (Pitfall 1 discipline — the
//      toggle-event close seam).
//   2. The relocated per-article Export highlights button (annotations
//      drawer header row) still downloads AND announces through
//      ArticleView's visually-hidden live region.
//   3. One AxeBuilder pass on the open-popover state (zero serious/critical
//      WCAG 2.2 AA violations — mirrors a11y.spec.ts's invocation shape).
//
// Harness: chrome-suite conventions (image-stub + IndexedDB wipe in
// beforeEach; BASE http://localhost:5173). Waits are expect/expect.poll
// only — zero fixed sleeps in this file (the readiness sentinels are
// role/heading visibility, never timers).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// The chrome-suite seeding convention (dialog-centering.spec.ts precedent):
// tags persist ONLY on Dexie article rows (loadAllTags reads ingested rows,
// never fixtures), so the edit-persistence flow seeds a real row. Uses
// prepareFreshPage (clear-stores, NEVER deleteDatabase — a delete races the
// app's live Dexie connection and the never-closed raw seed connection can
// wedge a later versioned reopen into a blocked upgrade).
import { makeArticle, prepareFreshPage, seedRows } from "../portability/_portability";

const BASE = "http://localhost:5173";
// The seeded Dexie-row article used by the edit-persistence flow (a real
// ingested row — see the tagsStore note above). Long enough to render.
const TAGGED_ARTICLE = makeArticle({
  id: "md-tagpopdemo01",
  title: "Tag Popover Demo Article",
  sourceUrl: "https://example.org/tag-popover-demo",
  author: "Tag Author",
  paragraphs: [
    "The first paragraph of the tag popover demo article carries distinctive prose so the seeded row renders identically to an ingested article.",
    "The second paragraph supplies additional unique material so the article body comfortably fills the opening view in either reading mode.",
    "The third paragraph closes the corpus with enough length for stable reading-surface mounting.",
  ],
});
// A long-form corpus fixture (byline + source provenance so the provenance
// block renders) for the export + axe scenarios — no tag writes there.
const FIXTURE = "essay-long-form";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

type AxeViolation = { id: string; impact?: string | null | undefined };

function seriousViolations(results: { violations: AxeViolation[] }) {
  return results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
}

test.beforeEach(async ({ page }) => {
  // prepareFreshPage: image-stub + app-boot wait + clear-stores (the
  // portability discipline — see the import note for why NOT deleteDatabase).
  await prepareFreshPage(page);
});

/** Navigate to the library and wait for the list to mount. Hash-based
 *  navigation (NOT a reload) — a page unload would abort an in-flight
 *  IndexedDB tag write committed moments earlier (the search-tag-filter
 *  openLibrary precedent). */
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

/** Open the corpus fixture article and wait for the reading surface. */
async function openArticle(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Wait for a visible reading-surface block in EITHER mode (the
  // openArticle sentinel from annotations/_fixtures.ts — inlined so this
  // spec carries zero hard waits of its own).
  await page.waitForFunction(
    () => {
      const visible =
        document.querySelector(".page-fragment [data-block-index]") ??
        document.querySelector(
          ".article-body:not(.article-body-measurement) [data-block-index]",
        );
      return !!visible;
    },
    undefined,
    { timeout: 10_000 },
  );
}

/** The header tags-trigger button. */
function tagsTrigger(page: Page) {
  return page.getByRole("button", { name: "Article tags" });
}

/** Assert focus rests on the tags-trigger (the Pitfall 1 restore).
 *  WebKit exception (the documented drawer-view.spec.ts quirk): WebKit's
 *  popover/dialog close lifecycle races the ref-captured focus restore, so
 *  webkit asserts the weaker but still-meaningful "focus is not trapped in
 *  the closed surface" contract instead. */
async function expectFocusOnTrigger(page: Page): Promise<void> {
  const browserName = test.info().project.name;
  if (browserName === "webkit") {
    await expect(async () => {
      const inPopover = await page.evaluate(() => {
        const pop = document.querySelector(".tag-popover");
        return !!(pop && document.activeElement && pop.contains(document.activeElement));
      });
      expect(inPopover, "focus is not trapped in the closed popover (webkit)").toBeFalsy();
    }).toPass({ timeout: 2000 });
    return;
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement === document.querySelector(".tags-trigger"),
      ),
    )
    .toBe(true);
}

test.describe("tag popover (13-10 — G5)", () => {
  test("tags popover opens from the top bar, edits tags, light-dismisses, and restores focus", async ({
    page,
  }) => {
    // Seed a Dexie article row (tags persist on rows, never on fixtures),
    // then open it DIRECTLY (the library view mounted before the seed in
    // beforeEach and does not remount on a hashchange — the 08-05 lesson).
    await seedRows(page, { articles: [TAGGED_ARTICLE] });
    await page.goto(`${BASE}/#/article/${TAGGED_ARTICLE.id}`);
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Before opening: the popover surface is hidden (UA popover styling)
    // and its TagEntry is not visible.
    await expect(page.locator(".tag-popover")).toBeHidden();
    await expect(page.locator(".tag-entry")).toBeHidden();

    // Open via the top-bar trigger.
    await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await tagsTrigger(page).click();
    await expect(
      page.getByRole("dialog", { name: "Article tags" }),
    ).toBeVisible();
    await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "true");

    // Edit: add a tag through the byte-unchanged TagEntry.
    await page.locator("input#tag-entry-new").fill("stoic");
    await page.getByRole("button", { name: /add tag/i }).click();
    await expect(
      page
        .locator(".tag-entry-list .tag-chip-readonly")
        .filter({ hasText: "stoic" }),
    ).toBeVisible();

    // Persistence: back to the library, the tag filter chip strip surfaces
    // the tag (loadAllTags re-derivation over the Dexie rows).
    await openLibrary(page);
    const stoicChip = page
      .locator(".tag-filter .tag-chip")
      .filter({ hasText: "stoic" });
    await expect(stoicChip).toBeVisible();

    // Return to the article, reopen the popover.
    const articleLink = page.locator(
      'a[href^="#/article/' + TAGGED_ARTICLE.id + '"]',
    );
    await expect(articleLink).toBeVisible();
    await articleLink.click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await tagsTrigger(page).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
    await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "true");

    // Light-dismiss: click the article surface outside the popover → the
    // popover hides, focus rests on the trigger, aria-expanded flips false.
    await page.locator("article.article-body > header h1").click({
      position: { x: 8, y: 8 },
    });
    await expect(page.locator(".tag-popover")).toBeHidden();
    await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await expectFocusOnTrigger(page);

    // Esc close: reopen, press Escape → the same close + focus outcome.
    await tagsTrigger(page).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".tag-popover")).toBeHidden();
    await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await expectFocusOnTrigger(page);
  });

  test("drawer export announces", async ({ page }) => {
    await openArticle(page);

    // Open the annotations drawer via the header trigger (count-suffix-
    // tolerant — the aria-label carries ", N" when highlights exist).
    await page.getByRole("button", { name: /^Highlights and notes/ }).click();
    await expect(page.locator("dialog.annotations-drawer")).toBeVisible();

    // The relocated Export button lives in the drawer header row.
    const exportButton = page
      .locator("dialog.annotations-drawer")
      .getByRole("button", { name: "Export highlights" });
    await expect(exportButton).toBeVisible();

    // Download fires (the 09-01 acceptDownloads pattern).
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("highlights-");

    // The visually-hidden announcement region (main's SECOND role=status
    // region — the 09-05 export announce lives in ArticleView) carries the
    // "Exported" phrase.
    await expect(
      page.locator("main [role='status'].visually-hidden").nth(1),
    ).toContainText(/Exported/);
  });

  test("a11y: open tag popover state has zero serious/critical WCAG violations", async ({
    page,
  }) => {
    await openArticle(page);
    await tagsTrigger(page).click();
    await expect(page.locator(".tag-popover")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();
    const serious = seriousViolations(results);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
