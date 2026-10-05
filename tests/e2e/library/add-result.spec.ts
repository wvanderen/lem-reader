// tests/e2e/library/add-result.spec.ts
// Issue #112 — the saved-result screen's 3-engine browser truth. The
// component suite (AddDialog.test.tsx) owns the jsdom-level state machine;
// jsdom has no dialog top layer, no focus ordering, no real hashchange
// routing (the focused-add.spec.ts Pitfall-5 discipline). Everything here
// runs on the REAL chromium/firefox/webkit matrix against the integrated
// AddDialog + app shell.
//
// Cases (the issue's acceptance criteria):
//   1. SUCCESS: a confident URL save keeps the dialog OPEN on a clear
//      result — status announces "Saved to your library.", the result card
//      shows the saved title, and Close / Add another / Open article are
//      the explicit actions. No auto-navigation ever happens.
//   2. FLAGGED SUCCESS: a low-confidence admission (ADR-0003) discloses
//      the ingestion limits (fidelity note + per-part warnings + degraded
//      anchoring) with the "See the original." escape hatch.
//   3. CLOSE → UNREAD: Close (and Esc) returns to the prior destination —
//      no navigation — and the never-opened article appears in the Unread
//      view (the snapshot invalidation fired while the dialog was open).
//   4. ADD ANOTHER: resets source, content, file pick, and tags to a
//      fresh session (D16-08 shape) with the dialog still up, and the
//      NEXT save is independent.
//   5. REFUSAL: a duplicate refusal stays distinct from the saved result
//      (calm copy, no result card, no outcome actions) and never
//      overwrites — the library keeps exactly one row.
//   6. OPEN ARTICLE: navigates close-first to the reader, which follows
//      the existing reading-location rule (a never-opened article starts
//      at the top — no restoration marker).
//   7. FOCUS: the save landing focuses the result heading (keyboard + SR
//      land on the title); Tab reaches the actions; Esc restores the
//      Add to Library trigger.
//
// Harness discipline (focused-add.spec.ts clone):
//   - openAddDialog/pickSource/savedResult/openSavedArticle/addAnother/
//     closeSavedResult from ./add-dialog — the shared idempotent helpers
//     centralizing every accessible name.
//   - wipeDatabase beforeEach (deterministic first-run state).
//   - page.route mocks /api/ingest with schema-valid CanonicalArticle
//     payloads (the client re-validates at the network boundary) — no
//     coupling to the live extractor.
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import { openAddDialog, addAnother, closeSavedResult } from "./add-dialog";
import type { CanonicalArticle } from "../../../src/content/types";

/** The route-mock payload union: a schema-valid article (ok variant) or a
 * typed refusal envelope (the IngestionResponse refusal shape). */
type IngestPayload = CanonicalArticle | { ok: false; reason: string };

function isRefusal(p: IngestPayload): p is { ok: false; reason: string } {
  return "ok" in p && p.ok === false;
}

/** A schema-valid CanonicalArticle payload for the route mock (the unit
 * suite's sampleArticle shape — ArticleSchema.parse-clean). */
function articlePayload(
  id: string,
  title: string,
  meta?: CanonicalArticle["ingestionMeta"],
): CanonicalArticle {
  return {
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: `https://example.com/${id}`,
      title,
      retrievedAt: "2026-09-29T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body text.", marks: [] }] }],
    footnotes: [],
    ...(meta ? { ingestionMeta: meta } : {}),
  } as CanonicalArticle;
}

/** Flagged admission (ADR-0003): low confidence + a per-part warning +
 * degraded anchoring — the "admitted with visible ingestion limits" arm. */
const FLAGGED_META: NonNullable<CanonicalArticle["ingestionMeta"]> = {
  source: "url",
  origin: "url",
  sourceUrl: "https://example.com/flagged-admission",
  originalHtmlHash: "sha256:" + "1".repeat(64),
  extractionConfidence: "low",
  extractionWarnings: ["1 image could not be fetched"],
  annotationsDegraded: true,
};

/** Route /api/ingest with the given payload (a mutable holder so a test
 * can swap the NEXT response mid-test for the add-another arm). */
async function mockIngest(page: Page, payload: { current: IngestPayload }): Promise<void> {
  await page.route("**/api/ingest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        isRefusal(payload.current)
          ? payload.current
          : {
              ok: true,
              article: payload.current,
              confidence:
                payload.current.ingestionMeta?.extractionConfidence === "low"
                  ? { state: "low" }
                  : { state: "confident" },
            },
      ),
    }),
  );
}

/** The header-row trigger (the single way into the dialog). */
function addButton(page: Page) {
  return page.getByRole("button", { name: "Add to Library" });
}

/** Open the library surface (the saved-articles list on #/). */
async function openLibrary(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
}

/** Drive a URL add to the result screen (the shared happy path). */
async function addUrl(page: Page, url: string): Promise<void> {
  await openAddDialog(page);
  await page.getByRole("textbox", { name: /add by url/i }).fill(url);
  await page.getByRole("button", { name: /^add$/i }).click();
  const dialog = page.locator("dialog.add-dialog");
  await expect(dialog.locator(".status")).toContainText("Saved to your library.");
  await expect(dialog.locator(".add-result")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("Add result preserves Unread (issue #112)", () => {
  test("a confident save stays open on the result; Close returns to the library with the article Unread", async ({
    page,
  }) => {
    const payload = { current: articlePayload("result-calm", "A Calm Result") };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/result-calm");

    const dialog = page.locator("dialog.add-dialog");
    // The saved title is the result card's heading; the outcome actions
    // are explicit; NO navigation happened (the reader chose later).
    await expect(dialog.getByRole("heading", { name: "A Calm Result", level: 3 })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Open article" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add another" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    expect(page.url(), "no auto-navigation on save").not.toContain("#/article");
    // A confident save is silent about LIMITS — no disclosure sentences —
    // but the AC's original link shows when the provenance URL exists.
    await expect(dialog.locator(".add-result .extraction-note")).toHaveCount(0);
    await expect(dialog.locator(".add-result .partial-content-note")).toHaveCount(0);
    const sourceLine = dialog.locator(".add-result .add-result-source");
    await expect(sourceLine).toContainText("See the original");
    await expect(sourceLine.locator("a")).toHaveAttribute(
      "href",
      "https://example.com/result-calm",
    );
    await expect(sourceLine.locator("a")).toHaveAttribute("target", "_blank");

    // Close: back on the library destination, dialog gone.
    await closeSavedResult(page);
    expect(page.url()).not.toContain("#/article");
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    // THE Unread transition: the never-opened article is in the Unread
    // view (the snapshot invalidation fired while the dialog was open).
    // The h1 is the byte-stable "Saved articles" on every view (D14-25);
    // the Unread switcher link carries the live count.
    await page.goto(`${BASE}/#/unread`);
    await expect(page.getByRole("link", { name: /^Unread \(\d+\)$/ })).toBeVisible();
    await expect(
      page.locator(".library-list > li").filter({ hasText: "A Calm Result" }),
    ).toBeVisible();
  });

  test("a flagged save discloses the ingestion limits with the original link", async ({ page }) => {
    const payload = {
      current: articlePayload("flagged-admission", "A Flagged Admission", FLAGGED_META),
    };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/flagged-admission");

    const result = page.locator("dialog.add-dialog .add-result");
    // The fidelity note + escape hatch (the reader view's exact sentences).
    const note = result.locator(".extraction-note");
    await expect(note).toContainText("This article may be incomplete or inaccurate");
    const link = note.locator("a");
    await expect(link).toHaveAttribute("href", "https://example.com/flagged-admission");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toContainText("See the original");
    // The per-part heading + warning line + the degraded-anchoring note.
    await expect(result.locator(".partial-content-heading")).toContainText(
      "Some content could not be processed.",
    );
    await expect(result.locator(".partial-content-note li")).toHaveText(
      "1 image could not be fetched",
    );
    await expect(result.locator(".annotations-note")).toContainText(
      "Highlights may be unreliable on this article.",
    );
  });

  test("Add another resets to a fresh session and the next save is independent", async ({
    page,
  }) => {
    const payload = { current: articlePayload("first-add", "The First Add") };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/first-add");

    const dialog = page.locator("dialog.add-dialog");
    await addAnother(page);

    // Fresh session (D16-08 shape, dialog still up): Web address checked,
    // the URL field empty, the result gone, the submit gate reset.
    await expect(dialog.locator(".add-result")).toHaveCount(0);
    await expect(dialog.locator(".status")).toHaveText("");
    await expect(page.getByRole("radio", { name: "Web address" })).toBeChecked();
    await expect(page.locator("input#ingest-url")).toHaveValue("");
    await expect(dialog.locator(".add-dialog-submit")).toBeDisabled();
    // The reset focus rail: the reader's next decision is the URL field.
    await expect(page.locator("input#ingest-url")).toBeFocused();

    // The NEXT save is independent: swap the payload, add a second
    // article, and the result shows the SECOND title.
    payload.current = articlePayload("second-add", "The Second Add");
    await page.getByRole("textbox", { name: /add by url/i }).fill("https://example.com/second-add");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(dialog.locator(".status")).toContainText("Saved to your library.");
    await expect(dialog.getByRole("heading", { name: "The Second Add", level: 3 })).toBeVisible();
  });

  test("a duplicate refusal stays distinct from the saved result and never overwrites", async ({
    page,
  }) => {
    const payload = { current: articlePayload("dup-check", "The Dup Check") };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/dup-check");

    // Add another → submit the SAME input: the service's has() now finds
    // the saved row → dedupe-refuse (D7-07/D16-09).
    await addAnother(page);
    await page.getByRole("textbox", { name: /add by url/i }).fill("https://example.com/dup-check");
    await page.getByRole("button", { name: /^add$/i }).click();

    const dialog = page.locator("dialog.add-dialog");
    // Distinct surfaces: the calm refusal copy, NOT a saved result.
    await expect(dialog.locator(".status")).toContainText("Already in your library.");
    await expect(dialog.locator(".add-result")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Open article" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Add another" })).toHaveCount(0);
    // Retry stays available (D16-11 — the URL was never cleared).
    await expect(dialog.locator("button.add-dialog-submit")).toBeEnabled();

    // Never overwritten: Esc closes; the library holds EXACTLY ONE row.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.goto(`${BASE}/#/`);
    await expect(
      page.locator(".library-list > li").filter({ hasText: "The Dup Check" }),
    ).toHaveCount(1);
  });

  test("Open article navigates close-first and the never-opened article starts at the top (the reading-location rule)", async ({
    page,
  }) => {
    const payload = { current: articlePayload("open-rule", "The Open Rule") };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/open-rule");

    await page.locator("dialog.add-dialog").getByRole("button", { name: "Open article" }).click();
    await page.waitForURL(/#\/article\/open-rule$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "The Open Rule" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
    // The reading-location rule for a never-opened article: the reader
    // starts at the beginning — no restoration marker, no resume banner.
    await expect(page.locator(".restoration-marker")).toHaveCount(0);
  });

  test("focus: the save landing focuses the result heading; Esc restores the trigger", async ({
    page,
  }) => {
    const payload = { current: articlePayload("focus-flow", "The Focus Flow") };
    await mockIngest(page, payload);
    await openLibrary(page);

    // Keyboard-open from the trigger (the panel-keyboard discipline) so
    // the close path's restore target is known.
    const trigger = addButton(page);
    await trigger.focus();
    await trigger.press("Enter");
    await expect(page.locator("dialog.add-dialog")).toBeVisible();

    await page.getByRole("textbox", { name: /add by url/i }).fill("https://example.com/focus-flow");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.locator("dialog.add-dialog .add-result")).toBeVisible();

    // THE landing: focus sits on the saved title (the keyboard + SR entry
    // point into the result — the transcript-swap focus-rail discipline).
    const focusedClass = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(focusedClass).toBe("add-result-title");

    // Tab moves into the outcome content then the action row (the dialog
    // trap holds) — first the card's original link, then the row's leading
    // quiet control. Engine-honest (the focused-add wrap precedent —
    // engine-specific subsets, never weakened universals): WebKit's
    // sequential focus navigation from a tabindex="-1" heading parks on
    // <body> (the Safari quirk — verified), so the intermediate Tab walk
    // is asserted on chromium + firefox only. The dialog trap itself is
    // universal and owned by focused-add.spec.ts (from a radio origin).
    if (test.info().project.name !== "webkit") {
      await page.keyboard.press("Tab");
      await expect(
        page.locator("dialog.add-dialog").getByRole("link", { name: /See the original/ }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        page.locator("dialog.add-dialog").getByRole("button", { name: "Close" }),
      ).toBeFocused();
    }

    // Esc in result mode closes; focus restores to the Add to Library
    // trigger (the Pitfall-1 close-listener restore).
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
    await expect(trigger).toBeFocused();
    // Closing (not opening) preserved Unread: the article is in Unread.
    await page.goto(`${BASE}/#/unread`);
    await expect(
      page.locator(".library-list > li").filter({ hasText: "The Focus Flow" }),
    ).toBeVisible();
  });
});
