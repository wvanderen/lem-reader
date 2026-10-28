// tests/e2e/annotations/overlap-creation-refusal.spec.ts
// Issue #190 — overlap creation refusal + preservation of existing
// annotations, verified through REAL creation routes and PERSISTED outcomes.
//
// Cells:
//   1. Rapid repeated creation (two synchronous H keydowns — the exact
//      bypass window that produced the reported stuck/blank highlight:
//      both attempts ran the overlap check before the first prepend
//      committed) persists exactly ONE highlight. Verified in Dexie, not
//      toolbar state, and re-verified after a reload (the persisted truth).
//   2. The overlap refusal matrix through the reader's own routes
//      (identical / partial / contained re-selections after a create): the
//      toolbar shows the accessible hint, H fires no record, Dexie count
//      unchanged. Color is NOT part of the refusal predicate — a same-color
//      overlap is refused exactly like any other (exercised by the default-
//      color create + identical re-selection cell; the unit matrix pins the
//      colored variant).
//   3. Adjacent ranges stay ALLOWED (end-touching selections create).
//   4. Single-attempt refusal on an overlapping selection announces the
//      explanation through the annotation status region (the accessible
//      explanation on the create route).
//   5. Legacy overlapping records (seeded — they can no longer be created)
//      remain LISTED with enabled explicit delete actions and intact note
//      data; deleting one leaves the other. Legacy ambiguous/orphan records
//      stay listed with their flag + enabled delete (no silent deletion,
//      merge, or reattachment).
//
// Stuck/blank investigation record (issue #190 AC): the demonstrated cause
// is the rapid repeated-creation bypass persisting an identical duplicate —
// the disjoint-range slicer then paints nothing for the second id (blank)
// while both entries answer over the same words (stuck). The mechanism is
// pinned unit-side (duplicate-range-render.test.ts) and the cause is
// regression-locked by cells 1–2 here. Symptom reports whose shape does NOT
// match this mechanism (none observed in-repo) remain open — nothing here
// claims them fixed.
//
// Both reading modes: the default paginated mode + an explicit switch to
// scrolling (the capture substrate and refusal funnel are mode-independent;
// the burst + adjacency cells run in both).
//
// Engine coverage: the suite projects this spec onto Chromium, Firefox, and
// WebKit (playwright.config.ts projects).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  FIXTURES,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  countHighlightsInDexie,
  announcementRegion,
  modeToggle,
  switchMode,
  seedHighlightRecord,
  seedNoteRecord,
  drawerTrigger,
  wipeDatabase,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** True when the reader is currently in `mode` (per the mode toggle). */
async function inMode(page: Page, mode: "paginated" | "scrolling"): Promise<boolean> {
  const label = await modeToggle(page).getAttribute("aria-label");
  return label?.endsWith(mode) ?? false;
}

/**
 * Fire TWO synchronous H keydowns on window — the rapid repeated creation
 * that used to slip both attempts through the overlap check inside one
 * render-commit window. Synthetic KeyboardEvents drive the real window
 * keydown listener (isFormField(window) is false — the shortcut path).
 */
async function doublePressH(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
  });
}

async function waitForPersistedCount(page: Page, expected: number): Promise<void> {
  await expect
    .poll(() => countHighlightsInDexie(page, FIXTURE), {
      timeout: 10_000,
      message: `persisted highlight count never reached ${expected}`,
    })
    .toBe(expected);
}

test.describe("issue #190 — overlap creation refusal + preservation", () => {
  test("rapid repeated H creation persists exactly ONE highlight, survives reload", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 30);
    expect(blockIdx).not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIdx, 0, 24)).toBeTruthy();
    await doublePressH(page);

    // Persisted outcome — the burst left exactly one row.
    await waitForPersistedCount(page, 1);

    // The persisted truth through the real read path: a fresh load renders
    // the single survivor (the refused duplicate never existed).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);
    await expect(page.locator("mark.highlight")).toHaveCount(1);
  });

  test("rapid repeated H creation refuses in scrolling mode too", async ({ page }) => {
    await openArticle(page, FIXTURE);
    if (!(await inMode(page, "scrolling"))) await switchMode(page);
    const blockIdx = await findFirstBlockWithText(page, 30);
    expect(blockIdx).not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIdx, 0, 24)).toBeTruthy();
    await doublePressH(page);
    await waitForPersistedCount(page, 1);
  });

  test("identical re-selection refuses with the accessible hint; H fires no record", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 30);
    expect(blockIdx).not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIdx, 0, 24)).toBeTruthy();
    await page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await waitForPersistedCount(page, 1);

    // IDENTICAL selection [0,24) again — refused with the hint, and the
    // shortcut route fires no second record.
    expect(await selectRangeInBlock(page, blockIdx, 0, 24)).toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText(/overlaps an existing highlight/i);
    await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toHaveCount(0);
    await page.keyboard.press("h");
    await waitForPersistedCount(page, 1);
  });

  test("partial and contained re-selections refuse; persisted set unchanged", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 60);
    expect(blockIdx).not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIdx, 0, 24)).toBeTruthy();
    await page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await waitForPersistedCount(page, 1);

    // PARTIAL [12,36) — intersects [0,24).
    expect(await selectRangeInBlock(page, blockIdx, 12, 36)).toBeTruthy();
    await expect(page.locator(".selection-toolbar")).toContainText(
      /overlaps an existing highlight/i,
    );
    await page.keyboard.press("h");
    await waitForPersistedCount(page, 1);

    // CONTAINED [4,10) — inside [0,24).
    expect(await selectRangeInBlock(page, blockIdx, 4, 10)).toBeTruthy();
    await expect(page.locator(".selection-toolbar")).toContainText(
      /overlaps an existing highlight/i,
    );
    await page.keyboard.press("h");
    await waitForPersistedCount(page, 1);
    // Same-color overlaps are the same refusal: the created highlight is
    // Default-colored and every attempt above intersected it — none was
    // licensed by color.
  });

  test("adjacent (end-touching) selection stays allowed in both modes", async ({ page }) => {
    await openArticle(page, FIXTURE);
    // A block long enough that [48,72) still lands inside it.
    const blockIdx = await findFirstBlockWithText(page, 90);
    expect(blockIdx).not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIdx, 0, 24)).toBeTruthy();
    await page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await waitForPersistedCount(page, 1);
    // Adjacent [24,48) — touches at 24, overlaps nothing.
    expect(await selectRangeInBlock(page, blockIdx, 24, 48)).toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toHaveCount(1);
    await page.keyboard.press("h");
    await waitForPersistedCount(page, 2);

    // The other mode: adjacency stays allowed there too (the persisted
    // annotations survive the swap untouched).
    if (await inMode(page, "paginated")) await switchMode(page);
    expect(await selectRangeInBlock(page, blockIdx, 48, 72)).toBeTruthy();
    await expect(
      page
        .locator(".selection-toolbar")
        .getByRole("button", { name: "Highlight", exact: true }),
    ).toHaveCount(1);
    await page.keyboard.press("h");
    await waitForPersistedCount(page, 3);
  });

  test("single refusal announces the explanation through the status region", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 30);
    expect(blockIdx).not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIdx, 0, 24)).toBeTruthy();
    await page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await waitForPersistedCount(page, 1);
    // An overlapping selection + the shortcut route: the refusal is
    // announced politely (the toolbar hint alone is not an announcement).
    expect(await selectRangeInBlock(page, blockIdx, 10, 30)).toBeTruthy();
    await page.keyboard.press("h");
    await expect(announcementRegion(page)).toContainText(/overlaps an existing highlight/i);
    await waitForPersistedCount(page, 1);
  });

  test("legacy overlapping records stay listed with explicit delete; notes survive the other's deletion", async ({
    page,
  }) => {
    // Two OVERLAPPING records can no longer be created — seed them (the
    // historical-data path) and verify the preservation guarantees: both
    // stay in the list with enabled Delete actions and their note data
    // intact, and removing one never touches the other (no silent deletion,
    // merge, or reattachment).
    await openArticle(page, FIXTURE);
    // The article's block 0 text is stable across modes, so the quotes
    // resolve confidently.
    const text = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('[data-block-index="0"]'));
      const visible = candidates.find((el) => el.closest(".article-body-measurement") === null);
      return visible?.textContent ?? "";
    });
    expect(text.length).toBeGreaterThanOrEqual(12);
    const mkQuote = (start: number, end: number) => ({
      prefix: text.slice(Math.max(0, start - 6), start),
      exact: text.slice(start, end),
      suffix: text.slice(end, Math.min(text.length, end + 6)),
    });
    await seedHighlightRecord(page, {
      id: "seed-overlap-a",
      articleId: FIXTURE,
      revision: 1,
      position: { start: 0, end: 5 },
      quote: mkQuote(0, 5),
    });
    await seedHighlightRecord(page, {
      id: "seed-overlap-b",
      articleId: FIXTURE,
      revision: 1,
      position: { start: 3, end: 9 },
      quote: mkQuote(3, 9),
    });
    // Note data rides its own record (1:1 via highlightId) — each overlapping
    // entry carries writing the preservation guarantee must keep.
    await seedNoteRecord(page, {
      id: "seed-overlap-note-a",
      highlightId: "seed-overlap-a",
      text: "Note on the first overlapping record.",
    });
    await seedNoteRecord(page, {
      id: "seed-overlap-note-b",
      highlightId: "seed-overlap-b",
      text: "Note on the second overlapping record.",
    });
    // A same-URL goto is a same-document hash navigation (no reload) — the
    // eager batch-resolve already ran, so force the reload the seeded rows
    // need.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);

    // Both entries are listed; both Delete actions are ENABLED (explicit
    // deletion, never silent cleanup); both notes render on their entries.
    await drawerTrigger(page).click();
    const drawer = page.locator("dialog.annotations-drawer");
    await expect(drawer).toBeVisible();
    const itemA = drawer.locator('li[data-highlight-id="seed-overlap-a"]');
    const itemB = drawer.locator('li[data-highlight-id="seed-overlap-b"]');
    await expect(itemA).toHaveCount(1);
    await expect(itemB).toHaveCount(1);
    await expect(itemA.locator(".drawer-entry-action-delete")).toBeEnabled();
    await expect(itemB.locator(".drawer-entry-action-delete")).toBeEnabled();
    await expect(itemA).toContainText("Note on the first overlapping record.");
    await expect(itemB).toContainText("Note on the second overlapping record.");

    // Delete A: the note routes the drawer's Delete through the shared
    // two-step confirm (issue #175) — the cascade-honest warning names the
    // note, and the destructive control is the only way the row goes. Only A
    // (and its own note, the D5-12 cascade) goes; B and B's note are
    // untouched.
    await itemA.locator(".drawer-entry-action-delete").click();
    const confirm = page.locator("#highlight-popover .highlight-popover-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("The note attached to it will also be removed.");
    await confirm.locator(".highlight-popover-destructive").click();
    await expect(itemA).toHaveCount(0);
    await expect(itemB).toHaveCount(1);
    await expect(itemB).toContainText("Note on the second overlapping record.");
    await waitForPersistedCount(page, 1);
  });

  test("legacy ambiguous and orphan records stay listed with explicit delete (no silent repair)", async ({
    page,
  }) => {
    // The unresolved historical shapes: an exact that recurs (ambiguous) and
    // an exact that is absent (orphan). Both must remain LISTED with their
    // explanation flag + enabled explicit delete — never silently deleted,
    // merged, or reattached. (Note-edit stays disabled on unresolved entries
    // by the shipped D5-04 policy — the anchor is unproven; delete is always
    // available. That policy predates this issue and is unchanged here.)
    await openArticle(page, FIXTURE);
    await seedHighlightRecord(page, {
      id: "seed-ambiguous-190",
      articleId: FIXTURE,
      revision: 1,
      position: { start: 0, end: 3 },
      quote: { prefix: "", exact: "the", suffix: "" },
    });
    await seedHighlightRecord(page, {
      id: "seed-orphan-190",
      articleId: FIXTURE,
      revision: 1,
      position: { start: 0, end: 5 },
      quote: { prefix: "zzq ", exact: "ZZQORPHANPASSAGENOTPRESENT", suffix: " qqz" },
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);

    await drawerTrigger(page).click();
    const drawer = page.locator("dialog.annotations-drawer");
    await expect(drawer).toBeVisible();
    const itemAmbiguous = drawer.locator('li[data-highlight-id="seed-ambiguous-190"]');
    const itemOrphan = drawer.locator('li[data-highlight-id="seed-orphan-190"]');
    await expect(itemAmbiguous).toHaveCount(1);
    await expect(itemOrphan).toHaveCount(1);
    // The explanation flags render; jump stays disabled (ANNO-07 — never a
    // speculative reattach), delete stays ENABLED.
    for (const item of [itemAmbiguous, itemOrphan]) {
      await expect(item).toContainText(/Couldn't/i);
      await expect(item.locator(".drawer-entry-action-delete")).toBeEnabled();
    }
    // Explicit delete of the orphan: only the orphan goes; the ambiguous
    // entry survives untouched.
    await itemOrphan.locator(".drawer-entry-action-delete").click();
    await expect(itemOrphan).toHaveCount(0);
    await expect(itemAmbiguous).toHaveCount(1);
    await waitForPersistedCount(page, 1);
  });
});
