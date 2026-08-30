// tests/e2e/library/metadata-edit.spec.ts
// Plan 17-02 Task 3 — the full reader-owned metadata edit lifecycle e2e
// gate (META-01, META-03, META-02 library half). Proves: the save flow
// writes readerTitle/readerAuthor while provenance/id/revision stay
// untouched (D17-01/D17-02, META-01); per-field Reset restores canonical
// values INCLUDING the absent-author case, with the override key DELETED
// from the stored row (META-03 — key deleted, never blank); the blank-title
// Save refusal with the calm inline explanation (D17-04/OQ4); Esc/focus
// hygiene (Pitfall 6); the fixture gate (OQ1 — bundled Sample rows have no
// edit affordance); reload persistence; and override-only search + strip
// consistency (D17-07/D17-09).
//
// Harness (cloned from remove-cascade.spec.ts, itself the happy-path +
// dexie-migration lineage):
//   - BASE URL:    http://localhost:5173
//   - beforeEach:  image-stub + IndexedDB clear-rows (deterministic first-run)
//   - readRow helper: cloned from remove-cascade.spec.ts (the cascade-proof
//     discipline) to assert Dexie row state DIRECTLY — override
//     presence/absence is row truth, not UI text
//   - Seeding: ONLY via the real /api/ingest middleware paste path (never
//     seed overrides on bundled fixtures — Pitfall 8 spec discipline;
//     fixture-pinned anchors elsewhere stay byte-stable by construction)
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ArticleSchema } from "../../../src/content/schema";
// Plan 17-05 — the shared portability helpers for the cross-surface cell's
// seeded highlight (confidentHighlightOn + highlightRow + seedRows: the
// Node-side anchor derivation over the SAVED row, the 12-07 chapter pattern).
import {
  confidentHighlightOn,
  highlightRow,
  seedRows,
} from "../portability/_portability";
// Plan 16-03 — the shared dialog-opening helper (ADD-01: the intake forms
// live behind the header Add button's modal).
import { openAddDialog, pickSource } from "./add-dialog";

const BASE = "http://localhost:5173";

/**
 * Build a paste-HTML payload with the given title (+ optional author).
 * Modeled on search-tag-filter.spec.ts pasteHtml — long enough to clear
 * ING-06 + the round-trip anchor gate; varied enough that the selectors
 * resolve confidently. The canonical author travels as
 * `<meta name="author">` (the htmlToBlocks extraction contract — `<address>`
 * body text is NOT an author source). Omitting `author` yields an article
 * whose canonical provenance has NO author (the META-03 absent-author cell).
 */
function pasteHtml(title: string, author?: string): string {
  const authorMeta = author
    ? `<meta name="author" content="${author}">\n`
    : "";
  return `<!DOCTYPE html>
<html><head><title>${title}</title>
${authorMeta}</head>
<body>
<article>
<h1>${title}</h1>
<p>The first paragraph of ${title}. Long enough to clear the
ING-06 confidence threshold (textLength >= 500) and varied enough that the
round-trip anchor gate samples five grapheme offsets that all resolve to
confident via the shipped TextQuoteSelector machinery. The library surfaces
this ingested article under the same Saved articles heading, the same
per-row structure, and the same open-article gesture as a bundled v1.0
fixture.</p>
<p>The second paragraph continues the long-form prose. The reading engine
cannot tell this ingested article from a fixture — that is the load-bearing
invariant of Phase 7 and Phase 8. Pagination, annotation, location restore,
and the accessible reading surface all behave identically because the
article IS a CanonicalArticle by the time it reaches ArticleView.</p>
<p>The third paragraph closes the corpus. The reader who reaches this
article via #/article/&lt;id&gt; sees the same h1 + paragraph structure, the
same reading-mode toggle, the same annotation toolbar, and the same scroll
or paginate behavior as a bundled fixture. The library surfaces the article
without distinguishing its origin except via the quiet source badge.</p>
</article>
</body></html>`;
}

// Distinctive titles so search assertions are deterministic.
const EDIT_FLOW_TITLE = "Metadata Edit Flow Article";
const EDIT_FLOW_AUTHOR = "Original Byline";
const RESET_TITLE_CANONICAL = "Reset Keeps Canonical Article";
const ABSENT_AUTHOR_TITLE = "No Canonical Author Article";
const BLANK_TITLE_CANONICAL = "Blank Title Refusal Article";
const ESC_TITLE = "Esc Focus Hygiene Article";
const FIXTURE_GATE_TITLE = "Fixture Gate Ingested Article";
const SEARCH_OLD_TITLE = "Search Old Canonical Name";
const SEARCH_NEW_TITLE = "Search Unique Renamed Zebra";
const STRIP_OLD_TITLE = "Strip Canonical Title";
const STRIP_NEW_TITLE = "Strip Effective Renamed Title";

/**
 * readRow — read a single row from the named store by key. Mirrors
 * remove-cascade.spec.ts (the dexie-migration lineage) verbatim — the
 * row-truth assertion helper.
 */
async function readRow(
  page: Page,
  storeName: string,
  key: IDBValidKey,
): Promise<Record<string, unknown> | null> {
  type SerializableKey = string | number | (string | number)[];
  return page.evaluate<
    Record<string, unknown> | null,
    { storeName: string; key: SerializableKey }
  >(
    async ({ storeName, key }): Promise<Record<string, unknown> | null> => {
      return new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            resolve(null);
            return;
          }
          const tx = db.transaction(storeName, "readonly");
          const getReq = tx.objectStore(storeName).get(key as IDBValidKey);
          getReq.onsuccess = () =>
            resolve(
              (getReq.result ?? null) as Record<string, unknown> | null,
            );
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    },
    { storeName, key: key as SerializableKey },
  );
}

/**
 * discoverIngestedArticleId — after a paste-HTML ingest, read the articles
 * store and return the single non-fixture id (mirrors remove-cascade.spec.ts;
 * fixtures are bundled JSON, not Dexie rows).
 */
async function discoverIngestedArticleId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const all = await new Promise<string[]>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve([]);
          return;
        }
        const tx = db.transaction("articles", "readonly");
        const getAllReq = tx.objectStore("articles").getAllKeys();
        getAllReq.onsuccess = () =>
          resolve((getAllReq.result ?? []).map((k) => String(k)));
        getAllReq.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
    return all[0] ?? "";
  });
}

/**
 * seedLocation — raw-put one LocationRecord (the search-tag-filter /
 * progress-recent discipline). A small offset flips the article to
 * in-progress (D14-18) deterministically, without driving the reader UI —
 * the strip-consistency cell's membership precondition.
 */
async function seedLocation(
  page: Page,
  articleId: string,
  graphemeOffset: number,
  savedAt: string,
): Promise<void> {
  await page.evaluate(
    async ({ articleId, graphemeOffset, savedAt }) => {
      const location = {
        schemaVersion: 1 as const,
        articleId,
        revision: 1,
        graphemeOffset,
        savedAt,
      };
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("location", "readwrite");
          tx.objectStore("location").put(location);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { articleId, graphemeOffset, savedAt },
  );
}

/**
 * ingestPaste — ingest a paste-HTML article via the Add dialog (the real
 * Vite Node middleware) and return after navigation to #/article/<id>.
 */
async function ingestPaste(page: Page, html: string) {
  await openAddDialog(page);
  await pickSource(page, "paste");
  await page
    .getByRole("textbox", { name: /paste html/i })
    .fill(html);
  await page.getByRole("button", { name: /add pasted article/i }).click();
  await page.waitForURL(/#\/article\//, { timeout: 15_000 });
}

/**
 * openLibrary — navigate to #/ and wait for the list to mount (the
 * search-tag-filter openLibrary pattern).
 */
async function openLibrary(page: Page) {
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

/**
 * openEditDialog — from the library row showing `rowTitle`, click the edit
 * affordance and wait for the EditMetadataDialog modal. Returns the dialog
 * locator.
 */
async function openEditDialog(page: Page, rowTitle: string) {
  const row = page.locator(".library-list > li").filter({ hasText: rowTitle });
  await expect(row).toBeVisible();
  await row.locator(".library-row-edit").click();
  const dialog = page.locator("dialog.edit-metadata");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (the
  // remove-cascade clear-rows discipline — NOT deleteDatabase, to avoid the
  // webkit deleteDatabase race).
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = [
          "articles",
          "settings",
          "location",
          "highlights",
          "notes",
        ];
        const existing = stores.filter((s) =>
          db.objectStoreNames.contains(s),
        );
        if (existing.length === 0) {
          resolve();
          return;
        }
        const tx = db.transaction(existing, "readwrite");
        for (const s of existing) {
          tx.objectStore(s).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
});

test.describe("D17-01/D17-02 + META-01 — save flow + persistence", () => {
  test("save writes readerTitle/readerAuthor; row shows effective values; provenance/id/revision untouched (META-01)", async ({
    page,
  }) => {
    // 1. Ingest a paste-HTML article (canonical title + author present).
    await page.goto(`${BASE}/#/`);
    await ingestPaste(page, pasteHtml(EDIT_FLOW_TITLE, EDIT_FLOW_AUTHOR));
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    // 2. Open the edit dialog from the ingested row (D17-01).
    await openLibrary(page);
    const dialog = await openEditDialog(page, EDIT_FLOW_TITLE);

    // 3. The dialog opens on a no-override article: the title field is
    //    empty (canonical visible ONLY as the placeholder, D17-03/D17-08)
    //    and Save is disabled with the calm explanation (OQ4 pinned rule).
    const titleInput = dialog.getByRole("textbox", { name: /^Title$/ });
    await expect(titleInput).toHaveValue("");
    await expect(titleInput).toHaveAttribute("placeholder", EDIT_FLOW_TITLE);
    const saveBtn = dialog.getByRole("button", { name: "Save" });
    await expect(saveBtn).toBeDisabled();
    await expect(dialog).toContainText(
      "Type a title, or choose Reset to keep the original.",
    );

    // 4. Type a new title + author, Save (D17-02).
    await titleInput.fill("My Renamed Title");
    await dialog.getByRole("textbox", { name: /^Author$/ }).fill("Renamed Author");
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // 5. The dialog closes; the row shows the EFFECTIVE values.
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(`#title-${articleId}`)).toHaveText(
      "My Renamed Title",
    );
    const editedRow = page
      .locator(".library-list > li")
      .filter({ hasText: "My Renamed Title" });
    await expect(editedRow.locator("p.meta:not(.source-badge)")).toHaveText(
      "Renamed Author",
    );

    // 6. ROW TRUTH (META-01): the stored row carries the overrides while
    //    provenance.title, id, and revision are untouched.
    const row = await readRow(page, "articles", articleId);
    expect(row?.readerTitle).toBe("My Renamed Title");
    expect(row?.readerAuthor).toBe("Renamed Author");
    const provenance = row?.provenance as Record<string, unknown>;
    expect(provenance?.title).toBe(EDIT_FLOW_TITLE);
    expect(provenance?.author).toBe(EDIT_FLOW_AUTHOR);
    expect(row?.id).toBe(articleId);
    expect(row?.revision).toBe(1);
  });

  test("persistence: after page.reload the row still shows the override (Dexie round-trip)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await ingestPaste(page, pasteHtml(EDIT_FLOW_TITLE, EDIT_FLOW_AUTHOR));
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    await openLibrary(page);
    const dialog = await openEditDialog(page, EDIT_FLOW_TITLE);
    await dialog.getByRole("textbox", { name: /^Title$/ }).fill("Reloaded Name");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    // Reload: the override must survive the full Dexie round-trip and
    // re-derive on the fresh LibraryView mount.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(page.locator(`#title-${articleId}`)).toHaveText(
      "Reloaded Name",
    );
    const row = await readRow(page, "articles", articleId);
    expect(row?.readerTitle).toBe("Reloaded Name");
  });
});

test.describe("META-03 + D17-04 — reset + blank refusal", () => {
  test("Reset title restores the canonical title; the readerTitle key is DELETED from the stored row (META-03)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await ingestPaste(
      page,
      pasteHtml(RESET_TITLE_CANONICAL, "Reset Byline"),
    );
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    // Save an override first.
    await openLibrary(page);
    let dialog = await openEditDialog(page, RESET_TITLE_CANONICAL);
    await dialog.getByRole("textbox", { name: /^Title$/ }).fill("Renamed Once");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(`#title-${articleId}`)).toHaveText(
      "Renamed Once",
    );

    // Reopen, Reset title, Save → the canonical title returns.
    dialog = await openEditDialog(page, "Renamed Once");
    await dialog.getByRole("button", { name: "Reset title" }).click();
    await expect(dialog.getByRole("textbox", { name: /^Title$/ })).toHaveValue(
      "",
    );
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(`#title-${articleId}`)).toHaveText(
      RESET_TITLE_CANONICAL,
    );

    // ROW TRUTH (META-03): the override key is ABSENT on the raw row —
    // deleted by the whole-row put, never written as a blank string.
    const row = await readRow(page, "articles", articleId);
    expect(
      Object.prototype.hasOwnProperty.call(row, "readerTitle"),
      "readerTitle key must be deleted after Reset, not blank",
    ).toBe(false);
    const provenance = row?.provenance as Record<string, unknown>;
    expect(provenance?.title).toBe(RESET_TITLE_CANONICAL);
  });

  test("absent canonical author: author override shows; Reset author restores no-author-shown and deletes the key (META-03)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    // No <address> in the paste HTML → canonical provenance has NO author.
    await ingestPaste(page, pasteHtml(ABSENT_AUTHOR_TITLE));
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    await openLibrary(page);
    // Baseline: no author line on the row (only the source badge's .meta).
    const bareRow = page
      .locator(".library-list > li")
      .filter({ hasText: ABSENT_AUTHOR_TITLE });
    await expect(
      bareRow.locator("p.meta:not(.source-badge):not(.finished-mark)"),
    ).toHaveCount(0);

    // The author placeholder carries the No author fallback (D17-03).
    let dialog = await openEditDialog(page, ABSENT_AUTHOR_TITLE);
    const authorInput = dialog.getByRole("textbox", { name: /^Author$/ });
    await expect(authorInput).toHaveAttribute("placeholder", "No author");

    // Set an author override. The title stays canonical via Reset title
    // (OQ4 — the explicit keep-original affordance), so the stored row
    // carries ONLY readerAuthor.
    await authorInput.fill("Anonymous Reader");
    await dialog.getByRole("button", { name: "Reset title" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    // The author line now renders (effectiveAuthor truthy).
    const authoredRow = page
      .locator(".library-list > li")
      .filter({ hasText: ABSENT_AUTHOR_TITLE });
    await expect(
      authoredRow.locator("p.meta:not(.source-badge):not(.finished-mark)"),
    ).toHaveText("Anonymous Reader");
    let row = await readRow(page, "articles", articleId);
    expect(row?.readerAuthor).toBe("Anonymous Reader");
    expect(Object.prototype.hasOwnProperty.call(row, "readerTitle")).toBe(
      false,
    );

    // Reset author → no author line rendered; the readerAuthor key is gone.
    dialog = await openEditDialog(page, ABSENT_AUTHOR_TITLE);
    await dialog.getByRole("button", { name: "Reset author" }).click();
    await dialog.getByRole("button", { name: "Reset title" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
    const restoredRow = page
      .locator(".library-list > li")
      .filter({ hasText: ABSENT_AUTHOR_TITLE });
    await expect(
      restoredRow.locator("p.meta:not(.source-badge):not(.finished-mark)"),
    ).toHaveCount(0);
    row = await readRow(page, "articles", articleId);
    expect(
      Object.prototype.hasOwnProperty.call(row, "readerAuthor"),
      "readerAuthor key must be deleted after Reset author",
    ).toBe(false);
  });

  test("blank title refusal: clearing without Reset disables Save + shows the explanation; typing re-enables (D17-04)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await ingestPaste(
      page,
      pasteHtml(BLANK_TITLE_CANONICAL, "Refusal Byline"),
    );
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    // Save an override first so the title field opens PREFILLED.
    await openLibrary(page);
    const dialog = await openEditDialog(page, BLANK_TITLE_CANONICAL);
    const titleInput = dialog.getByRole("textbox", { name: /^Title$/ });
    await titleInput.fill("Prefilled Override");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    // Reopen and CLEAR the title without pressing Reset.
    const reopened = await openEditDialog(page, "Prefilled Override");
    const saveBtn = reopened.getByRole("button", { name: "Save" });
    await expect(saveBtn).toBeEnabled();
    await reopened.getByRole("textbox", { name: /^Title$/ }).fill("");
    await expect(saveBtn).toBeDisabled();
    await expect(reopened).toContainText(
      "Type a title, or choose Reset to keep the original.",
    );

    // Typing re-enables.
    await reopened.getByRole("textbox", { name: /^Title$/ }).fill("Typed Again");
    await expect(saveBtn).toBeEnabled();
    await expect(reopened).not.toContainText(
      "Type a title, or choose Reset to keep the original.",
    );

    // Cancel — the refusal state leaves the stored row untouched.
    await reopened.getByRole("button", { name: "Cancel" }).click();
    await expect(reopened).not.toBeVisible();
    const row = await readRow(page, "articles", articleId);
    expect(row?.readerTitle).toBe("Prefilled Override");
  });
});

test.describe("Pitfall 6 — Esc/focus hygiene", () => {
  test("Esc closes the dialog, editTarget resets (the edit button reopens cleanly), focus returns to the row's edit button", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await ingestPaste(page, pasteHtml(ESC_TITLE, "Esc Byline"));
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    await openLibrary(page);
    // Open via the KEYBOARD path (focus + Enter — the focused-add.spec.ts
    // precedent): WebKit does not focus buttons on mouse click, so a
    // click-opened dialog captures <body> as the trigger. The focus-restore
    // contract is about the keyboard/AT path.
    const row = page.locator(".library-list > li").filter({ hasText: ESC_TITLE });
    const editBtn = row.locator(".library-row-edit");
    await editBtn.focus();
    await editBtn.press("Enter");
    const dialog = page.locator("dialog.edit-metadata");
    await expect(dialog).toBeVisible();

    // Press Esc → the cancel event routes through onCancel; the open-prop
    // mirror closes the dialog.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Focus returns to the row's edit button (the captured trigger — the
    // close-listener restore; showModal does NOT auto-restore).
    await expect(editBtn).toBeFocused();

    // editTarget reset: the edit button reopens the dialog cleanly.
    await editBtn.click();
    await expect(dialog).toBeVisible();
    // Fresh field state on reopen (no stale typed text — the D16-08 reset).
    await expect(dialog.getByRole("textbox", { name: /^Title$/ })).toHaveValue(
      "",
    );

    // No write happened: the stored row carries no override keys.
    const stored = await readRow(page, "articles", articleId);
    expect(Object.prototype.hasOwnProperty.call(stored, "readerTitle")).toBe(
      false,
    );
  });
});

test.describe("OQ1 — fixture gate", () => {
  test("fresh install: bundled Sample rows render NO edit button while an ingested row does", async ({
    page,
  }) => {
    // Before any ingest: fixtures only — zero edit affordances anywhere.
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(page.locator(".library-list > li").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator(".library-list > li .library-row-edit"),
      "bundled Sample rows must have NO edit affordance",
    ).toHaveCount(0);

    // Ingest one real Dexie row.
    await ingestPaste(page, pasteHtml(FIXTURE_GATE_TITLE, "Gate Byline"));
    await openLibrary(page);

    // Exactly ONE edit affordance — on the ingested row (the composite
    // list renders fixtures + Dexie rows; only the Dexie row is editable).
    await expect(page.locator(".library-list > li .library-row-edit")).toHaveCount(
      1,
    );
    const ingestedRow = page
      .locator(".library-list > li")
      .filter({ hasText: FIXTURE_GATE_TITLE });
    await expect(ingestedRow.locator(".library-row-edit")).toHaveCount(1);
    // And every Sample-badged fixture row still has none.
    const fixtureRows = page
      .locator(".library-list > li")
      .filter({ hasText: "Sample" });
    await expect(fixtureRows.first()).toBeVisible();
    await expect(fixtureRows.locator(".library-row-edit")).toHaveCount(0);
  });
});

test.describe("D17-07 + D17-09 — search + strip consistency", () => {
  test("search matches the override only: the renamed article is found by its new name and NOT by the old canonical name (D17-07)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await ingestPaste(page, pasteHtml(SEARCH_OLD_TITLE, "Search Byline"));
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    await openLibrary(page);
    const dialog = await openEditDialog(page, SEARCH_OLD_TITLE);
    await dialog.getByRole("textbox", { name: /^Title$/ }).fill(SEARCH_NEW_TITLE);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(`#title-${articleId}`)).toHaveText(
      SEARCH_NEW_TITLE,
    );

    // Found by the new name.
    const searchInput = page.locator("input#library-search");
    await searchInput.fill("Search Unique Renamed Zebra");
    await expect(page.locator(`#title-${articleId}`)).toBeVisible();

    // NOT found by the old canonical name — the override is the ONE name
    // (the library box reads the effective haystack).
    await searchInput.fill("Search Old Canonical Name");
    await expect(page.locator(`#title-${articleId}`)).toHaveCount(0);
  });

  test("strip consistency: with a saved reading location, the Continue Reading strip shows the effective title (D17-09)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await ingestPaste(page, pasteHtml(STRIP_OLD_TITLE, "Strip Byline"));
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    // Seed an in-progress reading location (small offset — D14-18).
    await seedLocation(page, articleId, 20, "2026-08-29T00:00:00.000Z");

    // Baseline: the strip shows the canonical title.
    await openLibrary(page);
    const strip = page.locator(".continue-reading-strip");
    await expect(strip).toBeVisible();
    await expect(
      strip.locator("a", { hasText: STRIP_OLD_TITLE }),
    ).toBeVisible();

    // Rename via the edit dialog.
    const dialog = await openEditDialog(page, STRIP_OLD_TITLE);
    await dialog.getByRole("textbox", { name: /^Title$/ }).fill(STRIP_NEW_TITLE);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    // The strip derives on LibraryView mount (the D8-03 contract — the
    // remove flow refreshes the list, not the live strip). Reload and
    // assert the strip carries the ONE effective name.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(strip.locator("a", { hasText: STRIP_NEW_TITLE })).toBeVisible();
    await expect(
      strip.locator("a", { hasText: STRIP_OLD_TITLE }),
    ).toHaveCount(0);
  });
});

// ── Plan 17-05 Task 3 — the META-02 cross-surface consistency proof ───────────
//
// One describe drives the REAL UI through every remaining META-02 surface
// after a single library edit (D17-09's one-name-everywhere inventory):
// the Reader (document.title, article h1, byline), the Highlights review
// (article select option + section h2), the per-article highlights export
// (downloaded filename + markdown citation/heading — the CANONICAL title
// asserted ABSENT: one name, D17-08/D17-09), and the Continue Reading
// strip. The 17-02 cells above stay byte-unchanged (strengthen-only).
const CROSS_CANONICAL_TITLE = "Cross Surface Canonical Title";
const CROSS_CANONICAL_AUTHOR = "Canonical Byline";
const CROSS_EFFECTIVE_TITLE = "Cross Surface Renamed Title";
const CROSS_EFFECTIVE_AUTHOR = "Cross Surface Renamed Author";

test.describe("META-02 cross-surface — one effective name everywhere (17-05, D17-08/D17-09)", () => {
  test("after a library edit, reader/review/export/strip all show the one effective name", async ({
    page,
  }) => {
    // 1. Ingest a paste article (canonical title + author), then seed one
    //    confident highlight over the SAVED row (the 12-07 chapter pattern:
    //    parse the raw Dexie row through ArticleSchema in Node so the
    //    anchor derives over EXACTLY the text the surfaces hold) and an
    //    in-progress reading location for the strip.
    await page.goto(`${BASE}/#/`);
    await ingestPaste(
      page,
      pasteHtml(CROSS_CANONICAL_TITLE, CROSS_CANONICAL_AUTHOR),
    );
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");

    const rawRow = await readRow(page, "articles", articleId);
    expect(rawRow).not.toBeNull();
    const savedArticle = ArticleSchema.parse(rawRow);
    const anchor = confidentHighlightOn(savedArticle);
    await seedRows(page, {
      highlights: [highlightRow(articleId, anchor, "hl-cross-surface")],
    });
    await seedLocation(page, articleId, 20, "2026-08-29T00:00:00.000Z");

    // 2. Edit title + author through the real dialog (the single write).
    await openLibrary(page);
    const dialog = await openEditDialog(page, CROSS_CANONICAL_TITLE);
    await dialog.getByRole("textbox", { name: /^Title$/ }).fill(CROSS_EFFECTIVE_TITLE);
    await dialog.getByRole("textbox", { name: /^Author$/ }).fill(CROSS_EFFECTIVE_AUTHOR);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    // 3. STRIP: reload (the strip derives on LibraryView mount — the D8-03
    //    contract) and the saved-location entry carries the effective name.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const strip = page.locator(".continue-reading-strip");
    await expect(strip.locator("a", { hasText: CROSS_EFFECTIVE_TITLE })).toBeVisible();
    await expect(strip.locator("a", { hasText: CROSS_CANONICAL_TITLE })).toHaveCount(0);

    // 4. READER: document.title, the article h1, and the byline all read
    //    the effective values (D14-02's per-destination title contract fed
    //    by the one derivation).
    await page.goto(`${BASE}/#/article/${articleId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: CROSS_EFFECTIVE_TITLE }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveTitle(`${CROSS_EFFECTIVE_TITLE} — Lem Reader`);
    await expect(
      page.locator(".article-top-meta p.meta"),
    ).toHaveText(CROSS_EFFECTIVE_AUTHOR);

    // 5. REVIEW: the Highlights view's article select option AND the
    //    section h2 carry the effective title (the 17-03 surface swaps).
    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("#review-article-filter option", {
        hasText: CROSS_EFFECTIVE_TITLE,
      }),
    ).toHaveCount(1);
    await expect(
      page.locator("#review-article-filter option", {
        hasText: CROSS_CANONICAL_TITLE,
      }),
    ).toHaveCount(0);
    await expect(
      page.locator(".review-section h2", { hasText: CROSS_EFFECTIVE_TITLE }),
    ).toBeVisible();
    await expect(
      page.locator(".review-section h2", { hasText: CROSS_CANONICAL_TITLE }),
    ).toHaveCount(0);

    // 6. EXPORT: the per-article highlights export (annotations drawer —
    //    the 13-10 G5 surface) names the FILE with the effective title and
    //    cites/heads the markdown with it; the CANONICAL title is asserted
    //    ABSENT from the content (one name — D17-08/D17-09).
    await page.goto(`${BASE}/#/article/${articleId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: CROSS_EFFECTIVE_TITLE }),
    ).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole("button", { name: /^Highlights and notes/ })
      .click();
    await expect(page.locator("dialog.annotations-drawer")).toBeVisible({
      timeout: 15_000,
    });
    const exportButton = page.getByRole("button", { name: "Export highlights" });
    await expect(exportButton).toBeVisible({ timeout: 15_000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      `highlights-${CROSS_EFFECTIVE_TITLE}.md`,
    );
    const path = await download.path();
    expect(path).toBeTruthy();
    const md = readFileSync(path!, "utf8");
    // Heading + citation carry the effective values (17-03's markdown swaps).
    expect(md).toContain(`# Highlights — ${CROSS_EFFECTIVE_TITLE}`);
    expect(md).toContain(
      `> — ${CROSS_EFFECTIVE_AUTHOR}, *${CROSS_EFFECTIVE_TITLE}*`,
    );
    // ONE NAME: the canonical title/author never surface in the export.
    expect(md).not.toContain(CROSS_CANONICAL_TITLE);
    expect(md).not.toContain(CROSS_CANONICAL_AUTHOR);
    // The anchored passage rode the file (the export is real, not empty).
    expect(md).toContain(`> ${anchor.quote.exact}`);
  });
});
