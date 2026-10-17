// tests/e2e/annotations/note-save-reliability.spec.ts
// Issue #177 — saving notes safely on dismissal and navigation. jsdom cannot
// replicate the behaviors under test (Pitfall 2): native Escape→cancel
// dispatch, ::backdrop click targeting, modal inertness over the article,
// and the real Dexie write path. Asserted across Chromium, Firefox, and
// WebKit.
//
// What each cell proves:
//   1. Every dismissal path (Done, Escape, outside click) FLUSHES the
//      pending write before closing, restores focus to the highlight, and
//      returns the reader to the highlight controls.
//   2. An injected save failure keeps the editor + draft on screen with the
//      calm failure line + Retry — never a close that implies a landed save.
//      Retry re-attempts THE SAME draft and completes the interrupted
//      dismissal.
//   3. Failed saving prevents in-app navigation: while the unresolved
//      editor is open the modal makes the article (and its Back-to-library
//      control) inert; after Retry lands, the reader can leave — and the
//      note is persisted.
//   4. Outside click saves and dismisses WITHOUT activating the article
//      beneath (the modal swallows the gesture); a subsequent interaction
//      operates the article.
//   5. Rapid or repeated actions are single-shot; dismiss → reopen →
//      dismiss again saves each session's own draft.
//   6. Whitespace-only commentary is no note (deleteNote, no row, no
//      has-note modifier — the shared hasNoteContent semantics).
//
// Interrupted browser/tab closure is the recovery ticket's scope (the
// dual-event flush covers what it can); this spec owns the in-app surface.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  openNoteEditorViaControls,
  selectRangeInBlock,
  findFirstBlockWithText,
  installNoteSaveSabotage,
  failNextNoteSave,
  noteRowCountFor,
  noteTextarea,
  announcementRegion,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

// Per-describe beforeEach (NOT file-level): the sabotage describe must
// install its init script BEFORE ANY navigation. A fresh test page has not
// navigated yet, so the wipe's first goto injects the wrapper — no reload
// needed (a post-wipe reload + hash-only goto proved WebKit-flaky; this
// ordering removes the reload entirely).

/** Create a highlight (N shortcut) with the note editor open. */
async function createHighlightAndOpenEditor(
  page: import("@playwright/test").Page,
): Promise<string> {
  await openArticle(page, FIXTURE);
  const blockIdx = await findFirstBlockWithText(page, 24);
  expect(blockIdx).not.toBe(-1);
  await selectRangeInBlock(page, blockIdx, 0, 18);
  await page.keyboard.press("n");
  const mark = page.locator("mark.highlight").first();
  await expect(mark).toBeVisible();
  await expect(page.locator("dialog#highlight-popover")).toBeVisible();
  return (await mark.getAttribute("data-highlight-id"))!;
}

/**
 * Compute a viewport point ON THE ::backdrop — outside the editor dialog's
 * card — so a mouse click there targets the dialog element with coordinates
 * outside its box (the guarded backdrop-dismissal seam). Prefers a point
 * over the article body when one is available outside the card.
 */
async function backdropPointOutsideDialog(page: import("@playwright/test").Page): Promise<{
  x: number;
  y: number;
}> {
  return page.evaluate(() => {
    const dlg = document.querySelector("dialog#highlight-popover");
    if (!dlg) return { x: 4, y: 4 };
    const r = dlg.getBoundingClientRect();
    const vh = window.innerHeight;
    // Below the card when there is room, else above, else the far corner.
    if (r.bottom + 24 < vh - 4) return { x: r.left + r.width / 2, y: r.bottom + 24 };
    if (r.top > 28) return { x: r.left + r.width / 2, y: r.top - 24 };
    return { x: 4, y: vh - 4 };
  });
}

test.describe("note save reliability — successful dismissal paths (issue #177)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  for (const path of ["Done", "Escape", "outside click"] as const) {
    test(`${path} flushes the pending write and returns to the highlight controls`, async ({
      page,
    }) => {
      const hlId = await createHighlightAndOpenEditor(page);
      await noteTextarea(page).fill("Persisted through " + path.toLowerCase() + ".");
      const dlg = page.locator("dialog#highlight-popover");

      if (path === "Done") {
        await page.locator("#highlight-popover .highlight-popover-done").click();
      } else if (path === "Escape") {
        await page.keyboard.press("Escape");
      } else {
        const point = await backdropPointOutsideDialog(page);
        await page.mouse.click(point.x, point.y);
      }

      // The editor closed only AFTER the write landed, focus restored to
      // the highlight, and the lightweight controls are back (issue #175
      // handoff — successful dismissal returns to the controls).
      await expect(dlg).not.toBeVisible();
      await expect(page.locator("mark.highlight").first()).toBeFocused();
      await expect(page.locator("dialog.annotation-panel[open]")).not.toBeVisible();

      // Persistence truth: exactly ONE note row with the exact draft.
      expect(await noteRowCountFor(page, hlId)).toBe(1);
      await expect(announcementRegion(page)).toContainText(/Note saved/i);
    });
  }
});

test.describe("note save reliability — injected failures + navigation (issue #177)", () => {
  test.beforeEach(async ({ page }) => {
    // Fresh page: register the init script FIRST, then wipe (whose goto is
    // the first navigation and injects the wrapper).
    await installNoteSaveSabotage(page);
    await wipeDatabase(page);
  });

  test("a failed Escape keeps the editor + draft with the failure line + Retry; Retry completes the dismissal", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    const draft = "A draft that must survive the failure.";
    await noteTextarea(page).fill(draft);
    await failNextNoteSave(page);

    await page.keyboard.press("Escape");

    // The browser-default close was refused: the editor stays, the draft is
    // intact, the calm line + Retry render.
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText("Couldn't save the note. Try again.")).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue(draft);
    // Focus moved to Retry — the reader asked to leave and was refused.
    await expect(dlg.getByRole("button", { name: "Retry" })).toBeFocused();
    // Nothing persisted (the honest failure — no row lies on disk).
    expect(await noteRowCountFor(page, hlId)).toBe(0);

    // Retry (sabotage consumed) lands the SAME draft and completes the
    // interrupted dismissal — focus back to the highlight, controls back.
    await dlg.getByRole("button", { name: "Retry" }).click();
    await expect(dlg).not.toBeVisible();
    await expect(page.locator("mark.highlight").first()).toBeFocused();
    await expect(page.locator("dialog.annotation-panel[open]")).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);
  });

  test("a failed Done keeps the editor open with Retry; Retry saves once", async ({ page }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    const draft = "Failed on Done, retried once.";
    await noteTextarea(page).fill(draft);
    await failNextNoteSave(page);

    await page.locator("#highlight-popover .highlight-popover-done").click();

    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText("Couldn't save the note. Try again.")).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue(draft);
    expect(await noteRowCountFor(page, hlId)).toBe(0);

    await dlg.getByRole("button", { name: "Retry" }).click();
    await expect(dlg).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);
  });

  test("a failed outside click keeps the editor open with Retry; Retry saves and closes", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    const draft = "Failed on the backdrop dismissal.";
    await noteTextarea(page).fill(draft);
    await failNextNoteSave(page);

    const point = await backdropPointOutsideDialog(page);
    await page.mouse.click(point.x, point.y);

    // The guarded dismissal was refused: the editor stays with the draft +
    // failure line + Retry (never a close that implies a landed save).
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText("Couldn't save the note. Try again.")).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue(draft);
    expect(await noteRowCountFor(page, hlId)).toBe(0);

    // Retry (sabotage consumed) lands the SAME draft and completes the
    // interrupted dismissal.
    await dlg.getByRole("button", { name: "Retry" }).click();
    await expect(dlg).not.toBeVisible();
    await expect(page.locator("mark.highlight").first()).toBeFocused();
    await expect(page.locator("dialog.annotation-panel[open]")).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);
  });

  test("a successful Retry of a mid-typing failure shows the saved state and keeps the editor open", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    const draft = "Still writing after the retry.";
    await noteTextarea(page).fill(draft);
    await failNextNoteSave(page);
    // The debounce-fire path fails mid-typing (no dismissal involved): wait
    // out the 800ms window, then expect the honest error state.
    await expect(
      page.locator("dialog#highlight-popover").getByText("Couldn't save the note. Try again."),
    ).toBeVisible({ timeout: 5000 });

    // Retry lands the draft; the reader is STILL WRITING, so the editor
    // stays open with the quiet visible "Saved." line (the saved half of
    // the state pair) and the error line gone.
    await page.locator("dialog#highlight-popover").getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("dialog#highlight-popover")).toBeVisible();
    const savedStatus = page
      .locator("dialog#highlight-popover")
      .getByRole("status")
      .filter({ hasText: "Saved." });
    await expect(savedStatus).toContainText("Saved.");
    await expect(savedStatus.getByText("Saved.")).toBeVisible();
    await expect(savedStatus.getByText("Saved.")).not.toHaveAttribute("aria-hidden", "true");
    await expect(
      page.locator("dialog#highlight-popover").getByText("Couldn't save the note. Try again."),
    ).toHaveCount(0);
    expect(await noteRowCountFor(page, hlId)).toBe(1);
  });

  test("failed saving keeps in-app navigation inert; after Retry the reader can leave with the note persisted", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    await noteTextarea(page).fill("Blocked navigation until saved.");
    await failNextNoteSave(page);
    await page.keyboard.press("Escape");
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg.getByText("Couldn't save the note. Try again.")).toBeVisible();

    // The modal editor keeps every in-app control inert: the article's
    // Back-to-library button is visible in the header but the top-layer
    // dialog covers it — a pointer at its center hits the dialog/backdrop,
    // never the button (failed saving prevents navigation).
    const backBlocked = await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>("button.back-to-library");
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && !(hit === btn || btn.contains(hit));
    });
    expect(backBlocked, "Back-to-library is inert behind the unresolved editor").toBe(true);

    // Retry lands the write; the editor closes; NOW the reader can leave.
    await dlg.getByRole("button", { name: "Retry" }).click();
    await expect(dlg).not.toBeVisible();
    await page.locator("button.back-to-library").click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The note survived the navigation (persistence truth).
    expect(await noteRowCountFor(page, hlId)).toBe(1);
  });
});

test.describe("note save reliability — outside click swallowing (issue #177)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("outside click dismisses without activating the article beneath; the next interaction operates it", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    await noteTextarea(page).fill("Swallowed by the backdrop.");

    // Click ON THE BACKDROP at a point over the article body (outside the
    // card): the modal swallows the gesture — the editor dismisses with the
    // save, and the article beneath does NOT receive the click.
    const point = await page.evaluate(() => {
      const dlg = document.querySelector("dialog#highlight-popover");
      if (!dlg) return { x: 4, y: 4 };
      const r = dlg.getBoundingClientRect();
      const block = document.querySelector<HTMLElement>(
        ".article-body:not(.article-body-measurement) [data-block-index], .page-fragment [data-block-index]",
      );
      const candidates: Array<{ x: number; y: number }> = [];
      if (block) {
        const b = block.getBoundingClientRect();
        candidates.push({ x: b.left + 12, y: b.top + 12 });
        candidates.push({ x: b.right - 12, y: b.bottom - 12 });
      }
      candidates.push({ x: r.left + r.width / 2, y: r.bottom + 24 });
      const outside = candidates.filter(
        (c) =>
          c.x >= 2 &&
          c.y >= 2 &&
          c.x < window.innerWidth - 2 &&
          c.y < window.innerHeight - 2 &&
          !(c.x >= r.left && c.x <= r.right && c.y >= r.top && c.y <= r.bottom),
      );
      return outside[0] ?? { x: 4, y: window.innerHeight - 4 };
    });
    await page.mouse.click(point.x, point.y);

    // The editor dismissed (with the save) and the swallowed click did not
    // open a selection toolbar or re-point the controls elsewhere.
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).not.toBeVisible();
    await expect(page.locator(".selection-toolbar")).toHaveCount(0);
    await expect(page.locator("mark.highlight").first()).toBeFocused();
    await expect(page.locator("dialog.annotation-panel[open]")).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);

    // A SUBSEQUENT interaction operates the article: selecting text raises
    // the selection toolbar.
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 2, 12);
    await expect(page.locator(".selection-toolbar")).toBeVisible();
  });
});

test.describe("note save reliability — rapid or repeated actions (issue #177)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("a rapid Done + Escape flurry is one write and one close (the working latch)", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    await noteTextarea(page).fill("Single-shot dismissal.");
    // The flurry: a second dismissal attempt the instant the first is in
    // flight. The working latch makes it a no-op while the awaited write
    // runs — and inert once the dialog has closed.
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await page.keyboard.press("Escape");

    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).not.toBeVisible();
    await expect
      .poll(async () => noteRowCountFor(page, hlId), {
        message: "exactly one note row after the rapid dismissal",
      })
      .toBe(1);
  });

  test("dismiss, reopen, and dismiss again — each session saves its own draft", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    await noteTextarea(page).fill("First session draft.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();

    // Reopen through the controls (the issue #175 path) — the fresh editor
    // carries the persisted text; dismiss again with an edit.
    await page.locator("mark.highlight").first().click();
    await openNoteEditorViaControls(page);
    await expect(page.locator("dialog#highlight-popover")).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue("First session draft.");
    await noteTextarea(page).fill("Second session draft.");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();

    expect(await noteRowCountFor(page, hlId)).toBe(1);
    const rowText = await page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("lem-reader");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return await new Promise<string>((resolve, reject) => {
        const tx = db.transaction("notes", "readonly");
        const req = tx.objectStore("notes").index("highlightId").get(IDBKeyRange.only(id));
        req.onsuccess = () => resolve((req.result as { text: string } | null)?.text ?? "");
        req.onerror = () => reject(req.error);
      });
    }, hlId);
    expect(rowText).toBe("Second session draft.");
  });
});

test.describe("note save reliability — shared note semantics (issue #177)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("whitespace-only commentary is no note: no row, no has-note modifier", async ({ page }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    await noteTextarea(page).fill("   ");
    // The optimistic draft collapses (no written content = no note).
    await expect(page.locator("mark.highlight").first()).not.toHaveClass(/has-note/);

    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(0);
    await expect(page.locator("mark.highlight").first()).not.toHaveClass(/has-note/);
    await page.locator("mark.highlight").first().click();
    // The controls label the note-less highlight "Add note" again.
    await expect(
      page.locator("dialog.annotation-panel[open]").getByRole("button", { name: "Add note" }),
    ).toBeVisible();
  });
});
