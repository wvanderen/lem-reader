// tests/e2e/epub-intake.spec.ts
// Plan 12-05 Task 3 — ING-05 SC#1 browser-level proof. The whole book
// journey through the REAL pipeline: picker → .epub client arm → chunked
// base64 → POST /api/ingest?format=epub (Vite Node dev middleware) →
// server/ingest.ts fifth Stage-1 branch → epubToBooks → per-chapter parse +
// anchor gate → book envelope → booksStore.saveBook (one transaction) →
// Dexie v5 → the book-aware library surface (BookRow grouping, strip
// entries, tag/search surfacing, cascade removal). No test bypasses the UI
// — every upload drives input#ingest-file via setInputFiles + the Add file
// button (the pdf-intake.spec.ts no-direct-API-POST discipline).
//
// Harness (cloned from tests/e2e/pdf-intake.spec.ts, which cloned
// markdown-upload.spec.ts):
//   - BASE URL:    http://localhost:5173 (Vite dev server; /api/ingest
//                  middleware serves the full /server pipeline)
//   - beforeEach:  image-stub route + IndexedDB wipe via the shared
//                  annotations/_fixtures.ts wipeDatabase
//   - fixtures:    the in-test synthetic EPUB corpus built from the imported
//                  generator builders (tests/unit/server/epub-fixtures.ts —
//                  the generator IS the fixture source; 12-01 discipline)
//   - refresh:     page.reload() after upload — the book success path STAYS
//                  on #/ and LibraryView loads once per mount, so the
//                  reload forces the remount that reveals the new book row
//                  (the 08-05 openLibrary remount precedent)
//
// Row-count discipline (the 08-05 direct-child lesson): top-level rows are
// counted with `.library-list > li` — chapter sub-rows live INSIDE the book
// li as nested children and never inflate the count.
//
// Threat register (12-05-PLAN <threat_model>):
//   - T-12-12 (accidental destructive cascade) → the remove case proves the
//     BookRemoveConfirm copy names the chapter count, data-initial-focus
//     lands on Keep book, and the cascade leaves ZERO rows across all six
//     Dexie stores for the book's ids.
//   - T-12-15 (disclosure state confusion) → the grouping case asserts the
//     real aria-expanded/aria-controls pairing + that row-click never
//     toggles (two gestures, two targets).
import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  wipeDatabase,
  selectRangeInBlock,
  findFirstBlockWithText,
  switchMode,
} from "./annotations/_fixtures";
import {
  validBookEpub3,
  mixedAdmissionBook,
  drmAdeptBook,
  corruptNotEpub,
  emptyBook,
} from "../unit/server/epub-fixtures";
// The client-side cap for the over-cap refusal gate (the 11-04 earliest-
// enforcement proof: the picker refuses on file.size BEFORE any read).
import { EPUB_MAX_BYTES } from "../../src/ingestion/types";
// The D-05 substrate — used to compute the FINISHED-location seed offset in
// Node with the SAME normalizeText + graphemeClusters the reading surface
// uses in-browser (the 08-05 "seed graphemeOffset = total for deterministic
// Finished state" precedent; a one-screen chapter's window scroll can never
// reach the 98% offset, so the finished state is seeded, not scrolled).
import {
  normalizeText,
  graphemeClusters,
} from "../../src/content/normalizeText";
import type { CanonicalArticle } from "../../src/content/types";

/** Baseline top-level rows after the wipe: the bundled fixture corpus. */
const BASELINE_ROWS = FIXTURES.length;

/** The calm status line inside the ingest control's live region. */
function ingestStatus(
  page: Page,
  text: string,
): import("@playwright/test").Locator {
  return page.locator(".ingest-control .status").filter({ hasText: text });
}

/** Attach an EPUB to the picker and submit via the Add file button. */
async function uploadEpub(
  page: Page,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  await page.locator("input#ingest-file").setInputFiles({
    name,
    mimeType: "application/epub+zip",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: /add file/i }).click();
}

/** Upload the canonical 4-chapter book and wait for the calm success copy. */
async function uploadValidBook(page: Page): Promise<void> {
  await uploadEpub(page, "the-synthetic-book.epub", validBookEpub3());
  await expect(
    ingestStatus(page, "Book added to your library."),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Remount LibraryView so the freshly-saved book renders (08-05 precedent:
 * the load effect runs ONCE per mount; the book success path never bumps
 * refreshKey — navigation is 12-06's concern).
 */
async function reloadLibrary(page: Page): Promise<void> {
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });
}

/** The single book row (scoped for strict-mode uniqueness). */
function bookRow(page: Page): import("@playwright/test").Locator {
  return page.locator("li.book-row");
}

/** Expand the book's chapter region via the real chevron button. */
async function expandBook(page: Page): Promise<void> {
  await bookRow(page).locator(".book-toggle").click();
  await expect(bookRow(page).locator(".book-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
}

/** Wait for an opened chapter's reading surface (pdf-intake waitForOpenedArticle). */
async function waitForOpenedArticle(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });
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
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !==
      undefined,
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(600);
}

/** readRow — single Dexie row by key (remove-cascade.spec.ts L71-103). */
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
            resolve((getReq.result ?? null) as Record<string, unknown> | null);
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    },
    { storeName, key: key as SerializableKey },
  );
}

/** countRows — count a Dexie store's rows (remove-cascade.spec.ts L109-130). */
async function countRows(page: Page, storeName: string): Promise<number> {
  return page.evaluate(async (storeName) => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          resolve(-1);
          return;
        }
        const tx = db.transaction(storeName, "readonly");
        const countReq = tx.objectStore(storeName).count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(-1);
    });
  }, storeName);
}

/** Read one article row from Dexie by id (raw — extra index keys intact,
 * harmless to normalizeText which only reads blocks/footnotes/lang). */
async function readArticleRow(
  page: Page,
  articleId: string,
): Promise<CanonicalArticle> {
  const row = await readRow(page, "articles", articleId);
  expect(row, `article row ${articleId} must exist`).not.toBeNull();
  return row as unknown as CanonicalArticle;
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ING-05 — EPUB book intake (SC#1)", () => {
  test("book grouping: one expandable row, four nested chapters, open + collapse", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await uploadValidBook(page);
    await reloadLibrary(page);

    // ONE book row at top level; the chapter articles NEVER render as
    // top-level rows (D12-01) — the count stays fixtures + the one book.
    await expect(page.locator(".library-list > li")).toHaveCount(
      BASELINE_ROWS + 1,
    );
    await expect(bookRow(page)).toHaveCount(1);
    await expect(
      bookRow(page).getByRole("heading", { level: 2, name: "The Synthetic Book" }),
    ).toBeVisible();

    // T-12-15 — real disclosure semantics BEFORE expanding: collapsed
    // aria-expanded + a resolvable aria-controls region.
    const toggle = bookRow(page).locator(".book-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const regionId = await toggle.getAttribute("aria-controls");
    expect(regionId).toBeTruthy();
    await expect(page.locator(`#${regionId}`)).toBeHidden();

    // Expand → exactly 4 chapter sub-rows (nested — never top-level).
    await expandBook(page);
    await expect(
      bookRow(page).locator(".book-chapter-list > li"),
    ).toHaveCount(4);
    await expect(page.locator(".library-list > li")).toHaveCount(
      BASELINE_ROWS + 1,
    );

    // The sub-rows reuse the LibraryRow anatomy at h3 (heading order).
    await expect(
      bookRow(page).getByRole("heading", { level: 3, name: "Chapter 1. Loomings" }),
    ).toBeVisible();

    // No skip disclosure on the clean book (D12-11 — absent at 0).
    await expect(bookRow(page).locator(".book-skip-disclosure")).toHaveCount(0);

    // Open chapter 1 → it opens in the reader (h1 = chapter title).
    await bookRow(page)
      .locator(".book-chapter-list > li")
      .filter({ hasText: "Chapter 1. Loomings" })
      .locator('a[href^="#/article/"]')
      .click();
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c00$/, {
      timeout: 10_000,
    });
    await waitForOpenedArticle(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Chapter 1. Loomings" }),
    ).toBeVisible();

    // Back → collapse works (aria-expanded false again, region hidden).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expandBook(page);
    await bookRow(page).locator(".book-toggle").click();
    await expect(bookRow(page).locator(".book-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.locator(`#${regionId}`)).toBeHidden();
  });

  test("skip disclosure: mixed admission shows the calm note; admitted chapters open", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // mixedAdmissionBook: 2 readerable chapters + 1 pure-image plate →
    // skippedCount 1. The upload copy discloses it…
    await uploadEpub(page, "mixed-book.epub", mixedAdmissionBook());
    await expect(
      ingestStatus(page, "Book added to your library. 1 chapter could not be read."),
    ).toBeVisible({ timeout: 15_000 });

    // …and the LIBRARY grouping discloses it again (D12-11 — never silently
    // missing): 2 admitted chapter sub-rows + the calm note.
    await reloadLibrary(page);
    await expect(bookRow(page)).toHaveCount(1);
    await expandBook(page);
    await expect(
      bookRow(page).locator(".book-chapter-list > li"),
    ).toHaveCount(2);
    await expect(
      bookRow(page).locator(".book-skip-disclosure"),
    ).toHaveText("1 chapter could not be read.");

    // The admitted chapters open like any article.
    await bookRow(page)
      .locator(".book-chapter-list > li")
      .filter({ hasText: "Chapter 1. Loomings" })
      .locator('a[href^="#/article/"]')
      .click();
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c00$/, {
      timeout: 10_000,
    });
    await waitForOpenedArticle(page);
  });

  test("tag + search: book tags surface the BOOK row; chapter-title search finds the book", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // Tag the book via the expanded TagEntry (D12-04 — tags live on the Book).
    await expandBook(page);
    await bookRow(page).locator("input#tag-entry-new").fill("essays");
    await bookRow(page)
      .getByRole("button", { name: /add tag/i })
      .click();
    await expect(
      bookRow(page).locator(".tag-entry-list .tag-chip-readonly").filter({
        hasText: "essays",
      }),
    ).toBeVisible();
    // 12-06 (Rule 1 flake fix): the chip renders from TagEntry's LOCAL
    // mirror while the setBookTags write is still in flight; reloading
    // immediately can race the commit and lose the chip on the remount.
    // Settle before the reload (the persistence.spec debounced-write
    // discipline) — no assertion weakened.
    await page.waitForTimeout(600);

    // Reload so the chip strip derives essays (article tags ∪ book tags).
    await reloadLibrary(page);
    const essaysChip = page
      .locator(".tag-filter .tag-chip")
      .filter({ hasText: "essays" });
    await expect(essaysChip).toBeVisible();

    // The tag filter surfaces the BOOK row ONLY — never standalone chapter
    // rows (D12-04): exactly one top-level li (the book).
    await essaysChip.click();
    await expect(essaysChip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".library-list > li")).toHaveCount(1);
    await expect(bookRow(page)).toHaveCount(1);

    // Clear the filter — all rows return (fixtures + the book).
    await essaysChip.click();
    await expect(page.locator(".library-list > li")).toHaveCount(
      BASELINE_ROWS + 1,
    );

    // Search by a CHAPTER title surfaces the book row (D12-04 — "find the
    // essay collection containing the essay"): one top-level row, the book.
    await page.locator("input#library-search").fill("loomings");
    await expect(page.locator(".library-list > li")).toHaveCount(1);
    await expect(bookRow(page)).toHaveCount(1);
    await expect(bookRow(page)).toContainText("The Synthetic Book");
  });

  test("Continue-Reading: ONE book-level entry resuming the last-read chapter", async ({
    page,
  }) => {
    // The synthetic chapters fit ONE default-viewport screen (773px body /
    // 720px viewport → 53px of scroll, graphemeOffset stays 0). Shrink the
    // viewport so the chapter has real scroll depth and a mid-article
    // window-scroll saves a NONZERO offset (setViewportSize is the
    // sanctioned harness control — the 06 high-zoom precedent).
    await page.setViewportSize({ width: 360, height: 480 });
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // Open chapter 2, switch to scrolling, scroll partway, let the
    // location save settle (the persistence.spec timing discipline).
    await expandBook(page);
    await bookRow(page)
      .locator(".book-chapter-list > li")
      .filter({ hasText: "Chapter 2. The Carpet-Bag" })
      .locator('a[href^="#/article/"]')
      .click();
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c01$/, {
      timeout: 10_000,
    });
    await waitForOpenedArticle(page);
    await switchMode(page); // M-shortcut — persists readingMode "scrolling"
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(100);
    await page.waitForTimeout(1400);
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(scrollYBefore, "expected to have scrolled inside chapter 2").toBeGreaterThan(
      200,
    );

    // Back to the library → exactly ONE strip entry, the BOOK-level
    // "BookTitle — Chapter N of M" label (D12-02 — chapters never
    // double-list individually).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const stripRows = page.locator(".continue-reading-row");
    await expect(stripRows).toHaveCount(1);
    const bookEntry = stripRows.filter({
      hasText: "The Synthetic Book — Chapter 2 of 4",
    });
    await expect(bookEntry).toBeVisible();

    // Clicking it opens chapter 2 AT THE SAVED POSITION (D12-07 resume) —
    // block-level restore tolerance, never top-of-article for a mid-article
    // save (the persistence.spec tolerances mirrored verbatim).
    await bookEntry.locator("a").click();
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c01$/, {
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(1000);
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter).toBeGreaterThan(100);
    expect(Math.abs(scrollYAfter - scrollYBefore)).toBeLessThan(600);
  });

  test("book progress: finishing a chapter advances the book hairline to 1/4", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // Finish chapter 1 DETERMINISTICALLY (the 08-05 precedent): a synthetic
    // chapter fits one viewport screen, so window-scroll can never carry the
    // saved offset past the 98% threshold (max scroll 53px → offset 0) —
    // seed graphemeOffset = total via raw IndexedDB instead, with `total`
    // computed in Node by the SAME normalizeText + graphemeClusters the
    // in-browser derivation uses.
    await expandBook(page);
    const chapter1Href = await bookRow(page)
      .locator(".book-chapter-list > li")
      .filter({ hasText: "Chapter 1. Loomings" })
      .locator('a[href^="#/article/"]')
      .getAttribute("href");
    const chapterId = (chapter1Href ?? "").replace("#/article/", "");
    expect(chapterId).toMatch(/-c00$/);
    const articleRow = await readArticleRow(page, chapterId);
    const total = graphemeClusters(
      normalizeText(articleRow),
      articleRow.lang,
    ).length;
    expect(total).toBeGreaterThan(0);
    await page.evaluate(
      async ({ chapterId, total }) => {
        const location = {
          schemaVersion: 1,
          articleId: chapterId,
          revision: 1,
          graphemeOffset: total, // 100% — >= 0.98 x total by construction
          savedAt: new Date().toISOString(),
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
      { chapterId, total },
    );

    // Remount — D12-03: the book hairline = chapters-finished ratio, 1 of 4
    // → scaleX(0.25) on the card's ProgressHairline fill.
    await reloadLibrary(page);
    const fill = bookRow(page).locator(".book-card .progress-hairline-fill");
    await expect(fill).toBeVisible();
    await expect(fill).toHaveAttribute(
      "style",
      expect.stringContaining("scaleX(0.25)"),
    );
  });

  test("remove cascade: book + chapters + highlight + note + location all go (T-12-12)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // Open chapter 1 and create a highlight through the REAL selection flow
    // (chapters annotate identically to any article — SC#1's second half).
    await expandBook(page);
    await bookRow(page)
      .locator(".book-chapter-list > li")
      .filter({ hasText: "Chapter 1. Loomings" })
      .locator('a[href^="#/article/"]')
      .click();
    await page.waitForURL(/#\/article\/(epub-[a-z0-9-]+)$/, {
      timeout: 10_000,
    });
    const chapterUrl = page.url();
    const chapterId = chapterUrl.match(/#\/article\/(.+)$/)?.[1] ?? "";
    expect(chapterId).toMatch(/-c00$/);
    await waitForOpenedArticle(page);

    const blockIndex = await findFirstBlockWithText(page, 24);
    expect(blockIndex).not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIndex, 0, 24)).toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const highlightId = await mark.getAttribute("data-highlight-id");
    expect(highlightId).toBeTruthy();

    // Seed a note (on the real highlight) + a location for the chapter —
    // the remove-cascade.spec.ts raw-IndexedDB discipline.
    await page.evaluate(
      async ({ chapterId, highlightId }) => {
        const note = {
          schemaVersion: 1,
          id: "nt-book-cascade-001",
          highlightId,
          text: "Seeded note for the book cascade assertion.",
          updatedAt: "2026-08-18T00:00:00.000Z",
        };
        const location = {
          schemaVersion: 1,
          articleId: chapterId,
          revision: 1,
          graphemeOffset: 42,
          savedAt: "2026-08-18T00:00:00.000Z",
        };
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("lem-reader");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(["notes", "location"], "readwrite");
            tx.objectStore("notes").put(note);
            tx.objectStore("location").put(location);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      },
      { chapterId, highlightId },
    );
    const bookId = chapterId.replace(/-c\d+$/, "");

    // Back to the library → Remove book → BookRemoveConfirm.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expandBook(page);
    await bookRow(page).locator(".book-remove").click();

    const dialog = page.locator("dialog.book-remove-confirm");
    await expect(dialog).toBeVisible();
    // Copy names the consequence with the chapter count (T-12-12).
    await expect(dialog).toContainText(
      "Remove The Synthetic Book? Its 4 chapters and their highlights will be removed.",
    );
    // Pitfall 8 — non-destructive default focus.
    await expect(dialog.locator(".book-remove-cancel")).toHaveAttribute(
      "data-initial-focus",
      "true",
    );

    // Proceed → the ONE-transaction cascade (the sole removeBook call site).
    await dialog.locator(".book-remove-destructive").click();
    await expect(dialog).not.toBeVisible();

    // The book row disappears AND zero rows remain for its chapters (they
    // were never top-level; the library returns to the fixture baseline).
    await expect(bookRow(page)).toHaveCount(0);
    await expect(page.locator(".library-list > li")).toHaveCount(BASELINE_ROWS);

    // Physical Dexie proof (T-8-19 discipline): books/articles/highlights/
    // notes/location are ALL empty of the book's ids.
    expect(await readRow(page, "books", bookId)).toBeNull();
    expect(await countRows(page, "articles")).toBe(0);
    expect(await readRow(page, "highlights", highlightId ?? "")).toBeNull();
    expect(await readRow(page, "notes", "nt-book-cascade-001")).toBeNull();
    expect(await readRow(page, "location", [chapterId, 1])).toBeNull();
  });

  test("dedupe-refuse: re-uploading identical EPUB bytes stays ONE book", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // First upload — book-level dedupe key = content-hash book id.
    await uploadValidBook(page);
    await reloadLibrary(page);
    await expect(bookRow(page)).toHaveCount(1);

    // Second upload — IDENTICAL builder bytes → calm already-in-library
    // copy (D7-07 at book level), no overwrite, no orphans.
    await uploadEpub(page, "the-synthetic-book.epub", validBookEpub3());
    await expect(
      ingestStatus(page, "Already in your library."),
    ).toBeVisible({ timeout: 15_000 });

    // Still exactly one book row (stable row count).
    await reloadLibrary(page);
    await expect(bookRow(page)).toHaveCount(1);
    await expect(page.locator(".library-list > li")).toHaveCount(
      BASELINE_ROWS + 1,
    );
  });
});

// ── Plan 12-06 Task 2 — SC#2 + SC#3 + the refusal no-side-effect gates ───────
//
// The reader-side half of the phase exit: chapters are INDISTINGUISHABLE
// from articles to the reading engine (proven, not assumed), cross-chapter
// navigation is calm + keyboard-reachable in both modes, reopen-resume and
// book progress derive from per-chapter locations, and every refusal class
// (DRM / corrupt / empty / over-cap) surfaces calmly with ZERO library side
// effects. All 12-05 cases above stay intact (strengthen-only).

/** The chapter article id from the current URL (epub-<hash>-cNN). */
function chapterIdFromUrl(url: string): string {
  return url.match(/#\/article\/(.+)$/)?.[1] ?? "";
}

/**
 * Wait for an opened chapter's reading surface WITHOUT the __lemPagination
 * gate — that hook publishes only in paginated mode (PaginatedSurface's
 * pagination effect), so a scrolling-mode reload would hang on the 12-05
 * waitForOpenedArticle helper. Paginated contexts wait for the hook
 * explicitly via waitForPaginationHook below.
 */
async function waitForOpenedChapter(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });
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
  await page.waitForTimeout(600);
}

/** Wait for the paginated surface's FRESH commit — the live page fragment
 * mounting (window.__lemPagination persists across article swaps in
 * scrolling mode, so the hook alone can resolve on stale values; the
 * fragment only renders once the CURRENT article's pages committed). */
async function waitForPaginatedSurface(page: Page): Promise<void> {
  await expect(
    page.locator(".page-fragment [data-block-index]").first(),
  ).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(400);
}

/** Read the DEV pagination hook's committed state (T-04-16). */
async function devPagination(
  page: Page,
): Promise<{ pagesLength: number; currentPageIdx: number }> {
  return page.evaluate(() => {
    const dev = (window as unknown as Record<string, unknown>)
      .__lemPagination as
      | { pagesLength: number; currentPageIdx: number }
      | undefined;
    return {
      pagesLength: dev?.pagesLength ?? 0,
      currentPageIdx: dev?.currentPageIdx ?? -1,
    };
  });
}

/** Turn pages via the REAL keyboard (ArrowLeft) until the first page is
 * current. Bounded; fails loudly if never reached. */
async function turnToFirstPage(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const state = await devPagination(page);
    if (state.pagesLength > 0 && state.currentPageIdx === 0) return;
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(150);
  }
  const state = await devPagination(page);
  expect(
    state.currentPageIdx,
    `expected to reach the first page (got ${state.currentPageIdx} of ${state.pagesLength})`,
  ).toBe(0);
}

/** Turn pages via the REAL keyboard (ArrowRight — PageTurnControls) until
 * the final page is current. Bounded; fails loudly if never reached. */
async function turnToFinalPage(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const state = await devPagination(page);
    if (state.pagesLength > 0 && state.currentPageIdx === state.pagesLength - 1) {
      return;
    }
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }
  const state = await devPagination(page);
  expect(
    state.currentPageIdx,
    `expected to reach the final page (got ${state.currentPageIdx} of ${state.pagesLength})`,
  ).toBe(state.pagesLength - 1);
}

/**
 * First visible-surface block whose bounding rect is inside the viewport
 * with >= minChars of text — the scrolled-position highlight picker (the
 * toolbar renders position:fixed from the selection rect, so the selection
 * must be on-screen).
 */
async function firstVisibleBlockInViewport(
  page: Page,
  minChars = 24,
): Promise<number> {
  return page.evaluate(
    ({ min }) => {
      const blocks = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-block-index]:not(.article-body-measurement [data-block-index])',
        ),
      );
      for (const el of blocks) {
        const rect = el.getBoundingClientRect();
        const text = (el.textContent ?? "").length;
        if (text >= min && rect.top >= 0 && rect.bottom <= window.innerHeight) {
          return Number(el.dataset.blockIndex);
        }
      }
      return -1;
    },
    { min: minChars },
  );
}

/**
 * Expand the book (fresh-mount only — the row starts collapsed after every
 * LibraryView remount) and open a chapter by sub-row title. Returns the
 * chapter id. Uses the scrolling-safe surface wait.
 */
async function openChapterByTitle(page: Page, title: string): Promise<string> {
  await expandBook(page);
  await bookRow(page)
    .locator(".book-chapter-list > li")
    .filter({ hasText: title })
    .locator('a[href^="#/article/"]')
    .click();
  await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c\d+$/, {
    timeout: 10_000,
  });
  await waitForOpenedChapter(page);
  return chapterIdFromUrl(page.url());
}

/** Seed a FINISHED location row (graphemeOffset = total) via raw IndexedDB —
 * the 08-05/12-05 deterministic precedent (a one-screen chapter's window
 * scroll can never carry the saved offset past the 98% threshold). */
async function seedFinishedLocation(
  page: Page,
  chapterId: string,
): Promise<void> {
  const articleRow = await readArticleRow(page, chapterId);
  const total = graphemeClusters(
    normalizeText(articleRow),
    articleRow.lang,
  ).length;
  expect(total).toBeGreaterThan(0);
  await page.evaluate(
    async ({ chapterId, total }) => {
      const location = {
        schemaVersion: 1,
        articleId: chapterId,
        revision: 1,
        graphemeOffset: total, // 100% — >= 0.98 x total by construction
        savedAt: new Date().toISOString(),
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
    { chapterId, total },
  );
}

test.describe("ING-05 — chapter reading identity (SC#2)", () => {
  test("a chapter annotates + restores location in BOTH modes exactly like an article", async ({
    page,
  }) => {
    // Real scroll depth for a one-screen synthetic chapter (12-05 precedent).
    await page.setViewportSize({ width: 360, height: 480 });
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // Open chapter 2 (default paginated mode on first run).
    const chapter2Id = await openChapterByTitle(page, "Chapter 2. The Carpet-Bag");
    expect(chapter2Id).toMatch(/-c01$/);

    // Physical substrate identity: the persisted row carries ingestionMeta
    // source "epub-chapter" + the book FK (SC#2's "a chapter IS an article"
    // starts from the row the reader engine actually reads).
    const chapter2Row = await readArticleRow(page, chapter2Id);
    expect(chapter2Row.ingestionMeta?.source).toBe("epub-chapter");
    expect(chapter2Row.ingestionMeta?.bookId).toBeTruthy();

    // D12-08 — the context line pins the exact literal shape (U+00B7).
    await expect(page.locator("p.book-context")).toHaveText(
      "The Synthetic Book · Chapter 2 of 4",
    );
    // Heading order: the h1 is the chapter title; the context line is a p.
    await expect(
      page.getByRole("heading", { level: 1, name: "Chapter 2. The Carpet-Bag" }),
    ).toBeVisible();

    // SCROLLING identity: M (persisted), scroll to a mid-chapter offset,
    // highlight at the scrolled position through the REAL selection flow.
    await switchMode(page); // → scrolling
    await page.waitForTimeout(700); // settings debounce
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(100);
    await page.waitForTimeout(1400); // location-save debounce
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(scrollYBefore, "expected to have scrolled inside chapter 2").toBeGreaterThan(
      200,
    );

    const blockIndex = await firstVisibleBlockInViewport(page, 24);
    expect(blockIndex, "expected a visible selectable block at the scroll").not.toBe(-1);
    expect(await selectRangeInBlock(page, blockIndex, 0, 24)).toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const highlightId = await mark.getAttribute("data-highlight-id");
    expect(highlightId).toBeTruthy();

    // Reload #1 — location restores within the persistence.spec tolerances
    // AND the highlight re-renders from Dexie at its offset.
    await page.reload();
    await waitForOpenedChapter(page);
    await page.waitForTimeout(1000);
    const scrollYRestored = await page.evaluate(() => window.scrollY);
    expect(scrollYRestored, "expected restored scrollY > 100").toBeGreaterThan(100);
    expect(Math.abs(scrollYRestored - scrollYBefore)).toBeLessThan(600);
    await expect(
      page.locator(`mark.highlight[data-highlight-id="${highlightId}"]`),
    ).toHaveCount(1);

    // PAGINATED identity: M back — the chapter paginates (page count > 1)
    // and the highlight still renders. The D4-10 scrolling→paginated anchor
    // has BLOCK-level granularity, so the surface may land on the page
    // BEFORE a mid-block split (webkit fragments differently than chromium)
    // — start from page 1 and walk FORWARD through every page so the mark's
    // page is guaranteed current (real ArrowRight keys).
    await switchMode(page); // → paginated
    await waitForPaginatedSurface(page);
    const pagination = await devPagination(page);
    expect(pagination.pagesLength, "expected the chapter to paginate").toBeGreaterThan(
      1,
    );
    await turnToFirstPage(page);
    const markLocator = page.locator(
      `mark.highlight[data-highlight-id="${highlightId}"]`,
    );
    for (let i = 0; i < pagination.pagesLength + 3; i++) {
      if ((await markLocator.count()) > 0) break;
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(150);
    }
    await expect(markLocator).toBeVisible();
    // The context line persists across the mode swap.
    await expect(page.locator("p.book-context")).toHaveText(
      "The Synthetic Book · Chapter 2 of 4",
    );

    // Two-mode reading at chapter granularity: M back to scrolling, then
    // location restore works after ANOTHER reload (same tolerances).
    await switchMode(page); // → scrolling
    await page.waitForTimeout(700);
    await page.waitForTimeout(1400); // post-swap save settles
    await page.reload();
    await waitForOpenedChapter(page);
    await page.waitForTimeout(1000);
    const scrollYRestoredAgain = await page.evaluate(() => window.scrollY);
    expect(scrollYRestoredAgain).toBeGreaterThan(100);
    expect(Math.abs(scrollYRestoredAgain - scrollYBefore)).toBeLessThan(600);
    await expect(
      page.locator(`mark.highlight[data-highlight-id="${highlightId}"]`),
    ).toHaveCount(1);
  });
});

test.describe("ING-05 — cross-chapter navigation, resume, progress (SC#3)", () => {
  test("Next/Previous chapter links navigate calmly in both modes", async ({
    page,
  }) => {
    // Shrunk viewport (the 12-05 precedent): at the default 1280x720 a
    // synthetic chapter fits ONE page (page 1 IS the final page, so the
    // absent-on-non-final assertion would be geometrically impossible);
    // 360x480 paginates each chapter into ~3 pages.
    await page.setViewportSize({ width: 360, height: 480 });
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // ── Scrolling mode: the Next link sits at the flow end of chapter 1. ──
    const chapter1Id = await openChapterByTitle(page, "Chapter 1. Loomings");
    expect(chapter1Id).toMatch(/-c00$/);
    await expect(page.locator("p.book-context")).toHaveText(
      "The Synthetic Book · Chapter 1 of 4",
    );
    await switchMode(page); // → scrolling (persisted)
    await page.waitForTimeout(700);
    // Scroll to the very end of the chapter flow.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const nextLink = page.locator("a.chapter-next");
    await expect(nextLink).toBeVisible();
    // The lighter title span carries the next chapter's title.
    await expect(nextLink).toContainText("Chapter 2. The Carpet-Bag");
    // Keyboard-focusable + Enter-activatable (native anchor, no shortcut).
    await nextLink.focus();
    const focusedIsNext = await page.evaluate(
      () => document.activeElement?.classList.contains("chapter-next") ?? false,
    );
    expect(focusedIsNext).toBe(true);
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c01$/, { timeout: 10_000 });
    await waitForOpenedChapter(page);
    await expect(page.locator("p.book-context")).toHaveText(
      "The Synthetic Book · Chapter 2 of 4",
    );

    // ── Paginated mode: the Next link appears ONLY on the final page. ────
    await switchMode(page); // → paginated (persisted)
    await waitForPaginatedSurface(page);
    // Turn back to the FIRST page regardless of where the D4-10 anchor
    // landed: there the Next link is ABSENT (non-final page) and the
    // Previous link is PRESENT (chapter start reachability) — never
    // permanent chrome.
    await turnToFirstPage(page);
    await expect(page.locator("a.chapter-next")).toHaveCount(0);
    await expect(page.locator("a.chapter-prev")).toHaveCount(1);
    // Turn to the final page via the REAL page-turn key — the Next link
    // mounts on that page only.
    await turnToFinalPage(page);
    const paginatedNext = page.locator("a.chapter-next");
    await expect(paginatedNext).toBeVisible();
    await expect(paginatedNext).toHaveAttribute(
      "href",
      /#\/article\/epub-[a-z0-9]+-c02$/,
    );
    await paginatedNext.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c02$/, { timeout: 10_000 });
    await waitForOpenedChapter(page);
    await waitForPaginatedSurface(page);
    await expect(page.locator("p.book-context")).toHaveText(
      "The Synthetic Book · Chapter 3 of 4",
    );

    // Previous link reachable from chapter start (first page) + returns.
    const paginatedPrev = page.locator("a.chapter-prev");
    await expect(paginatedPrev).toBeVisible();
    await expect(paginatedPrev).toHaveAttribute(
      "href",
      /#\/article\/epub-[a-z0-9]+-c01$/,
    );
    await paginatedPrev.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c01$/, { timeout: 10_000 });
    await waitForOpenedChapter(page);
    await expect(page.locator("p.book-context")).toHaveText(
      "The Synthetic Book · Chapter 2 of 4",
    );
  });

  test("reopen-resume: the strip resumes the LAST-read chapter (D12-07 re-skim wins)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 480 });
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // Read chapter 3 partway in scrolling mode.
    const chapter3Id = await openChapterByTitle(page, "Chapter 3. The Sermon");
    expect(chapter3Id).toMatch(/-c02$/);
    await switchMode(page); // → scrolling
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 260));
    await page.waitForTimeout(100);
    await page.waitForTimeout(1400);
    const scrollYCh3 = await page.evaluate(() => window.scrollY);
    expect(scrollYCh3).toBeGreaterThan(150);

    // The strip entry reads "BookTitle — Chapter 3 of 4" and Resume opens
    // chapter 3 AT the saved offset (the 12-05 resume tolerances).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const stripRows = page.locator(".continue-reading-row");
    await expect(stripRows).toHaveCount(1);
    const ch3Entry = stripRows.filter({
      hasText: "The Synthetic Book — Chapter 3 of 4",
    });
    await expect(ch3Entry).toBeVisible();
    await ch3Entry.locator("a").click();
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c02$/, { timeout: 10_000 });
    await waitForOpenedChapter(page);
    await page.waitForTimeout(1000);
    const scrollYResumed = await page.evaluate(() => window.scrollY);
    expect(scrollYResumed).toBeGreaterThan(100);
    expect(Math.abs(scrollYResumed - scrollYCh3)).toBeLessThan(600);

    // Re-skim chapter 1 briefly → the strip now resumes chapter 1 (the
    // LAST savedAt wins, NOT the first-unfinished chapter).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const chapter1Id = await openChapterByTitle(page, "Chapter 1. Loomings");
    expect(chapter1Id).toMatch(/-c00$/);
    await page.evaluate(() => window.scrollTo(0, 140));
    await page.waitForTimeout(100);
    await page.waitForTimeout(1400);

    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(page.locator(".continue-reading-row")).toHaveCount(1);
    const ch1Entry = page
      .locator(".continue-reading-row")
      .filter({ hasText: "The Synthetic Book — Chapter 1 of 4" });
    await expect(ch1Entry).toBeVisible();
    // The first-unfinished reading (Chapter 3) is NOT what resumes.
    await expect(
      page.locator(".continue-reading-row").filter({
        hasText: "The Synthetic Book — Chapter 3 of 4",
      }),
    ).toHaveCount(0);
    await ch1Entry.locator("a").click();
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c00$/, { timeout: 10_000 });
  });

  test("book progress advances with finished chapters; a finished book leaves the strip", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await uploadValidBook(page);
    await reloadLibrary(page);

    // Finish chapter 1 deterministically (graphemeOffset = total — the
    // 08-05/12-05 seeding precedent; window scroll can't reach 98% on a
    // one-screen chapter).
    await expandBook(page);
    const chapterIds = await bookRow(page)
      .locator(".book-chapter-list > li a[href^='#/article/']")
      .evaluateAll((links) =>
        links.map((a) =>
          (a as HTMLAnchorElement).getAttribute("href")?.replace(
            "#/article/",
            "",
          ) ?? "",
        ),
      );
    expect(chapterIds).toHaveLength(4);
    await seedFinishedLocation(page, chapterIds[0]!);

    // D12-03 — 1 of 4 finished → the book hairline reads scaleX(0.25).
    await reloadLibrary(page);
    const fill = bookRow(page).locator(".book-card .progress-hairline-fill");
    await expect(fill).toBeVisible();
    await expect(fill).toHaveAttribute(
      "style",
      expect.stringContaining("scaleX(0.25)"),
    );
    // In-progress → still on the continue strip (resume = chapter 1).
    await expect(
      page
        .locator(".continue-reading-row")
        .filter({ hasText: "The Synthetic Book — Chapter 1 of 4" }),
    ).toBeVisible();

    // Finish ALL FOUR → the book leaves the continue strip (FINISHED state,
    // the FINISHED_THRESHOLD convention) but stays in the library.
    for (const id of chapterIds.slice(1)) {
      await seedFinishedLocation(page, id);
    }
    await reloadLibrary(page);
    // Finished book: leaves the continue strip (FINISHED_THRESHOLD
    // convention) but stays in the library — the D8-12/D12 algebra swaps
    // the hairline for the "● Finished" mark at progress >= 1. Scoped to
    // the book CARD (the finished chapter sub-rows carry their own marks).
    await expect(page.locator(".continue-reading-row")).toHaveCount(0);
    await expect(bookRow(page)).toHaveCount(1);
    await expect(
      // Direct-child scope — the finished chapter sub-rows (nested inside
      // .book-chapter-list) carry their own finished marks.
      bookRow(page).locator(".book-card > .finished-mark"),
    ).toHaveText("● Finished");
  });
});

test.describe("ING-05 — refusal no-side-effect gates", () => {
  test("DRM/corrupt/empty/over-cap uploads refuse calmly with zero library side effects", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    // The 11-05 fixtures-baseline pattern: row count BEFORE any refusal.
    await expect(page.locator(".library-list > li")).toHaveCount(BASELINE_ROWS);
    // The 11-04 earliest-enforcement proof: zero /api/ingest requests for
    // the over-cap pick (the picker refuses BEFORE any read/POST).
    const ingestRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/ingest")) ingestRequests.push(req.url());
    });

    // 1. DRM (ADEPT marker) → the calm protected copy.
    await uploadEpub(page, "drm-book.epub", drmAdeptBook());
    await expect(
      ingestStatus(page, "This book is protected by DRM and cannot be added."),
    ).toBeVisible({ timeout: 15_000 });

    // 2. Corrupt (not a zip) → the unreadable copy.
    await uploadEpub(page, "broken.epub", corruptNotEpub());
    await expect(
      ingestStatus(page, "This file could not be read as an EPUB book."),
    ).toBeVisible({ timeout: 15_000 });

    // 3. Empty (no readable chapters) → the no-readable-chapters copy.
    await uploadEpub(page, "empty-book.epub", emptyBook());
    await expect(
      ingestStatus(page, "No readable chapters were found in this book."),
    ).toBeVisible({ timeout: 15_000 });

    // Every refusal: calm AND side-effect-free at the SURFACE — the URL
    // stays #/ and the row count is unchanged (no book row, no epub-badged
    // top-level rows).
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.locator(".library-list > li")).toHaveCount(BASELINE_ROWS);
    await expect(bookRow(page)).toHaveCount(0);

    // 4. Over-cap .epub — a File whose size exceeds EPUB_MAX_BYTES built
    //    from padded bytes. The picker refuses on file.size BEFORE any
    //    ArrayBuffer read, so the too-large copy appears AND zero NEW
    //    ingest requests were issued (the three server-side refusals above
    //    each legitimately POSTed; the over-cap pick must add none).
    const requestsBeforeOverCap = ingestRequests.length;
    const overCap = new Uint8Array(EPUB_MAX_BYTES + 1024);
    overCap.set([0x50, 0x4b, 0x03, 0x04]); // zip magic prefix — irrelevant, refused on size
    await uploadEpub(page, "huge-book.epub", overCap);
    await expect(
      ingestStatus(page, "This book is too large to add."),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500); // settle any in-flight request accounting
    expect(
      ingestRequests.length,
      "over-cap pick must never reach /api/ingest",
    ).toBe(requestsBeforeOverCap);

    // Physical Dexie proof after ALL four refusals. reloadLibrary first —
    // the 10-03 discipline: the wipe can complete AFTER the app's initial
    // Dexie read (deleteDatabase unblocks once that connection closes),
    // leaving Dexie closed until the remounted LibraryView re-queries; a
    // raw indexedDB.open before that recreates a store-less v1 DB and
    // blocks Dexie's v5 upgrade. The visible rows ARE the "Dexie is open +
    // schema declared" signal.
    await reloadLibrary(page);
    await expect(page.locator(".library-list > li")).toHaveCount(BASELINE_ROWS);
    await expect(bookRow(page)).toHaveCount(0);
    expect(await countRows(page, "articles")).toBe(0);
    expect(await countRows(page, "books")).toBe(0);
  });
});
