// tests/e2e/pdf-intake.spec.ts
// Plan 11-05 — ING-04 browser-level proof. Task 1: SC#1 upload→read happy
// path + the SC#2/SC#3/corrupt refusals + the D7-07 dedupe flow. Task 2: the
// SC#1 "identically to other articles" second half — a highlight created
// through the real selection flow survives reload, and the reading position
// restores after reload. Every flow drives input#ingest-file via
// setInputFiles + the Add file button through the REAL pipeline: picker →
// extension-aware client cap → chunked base64 → POST /api/ingest (Vite Node
// dev middleware — the 07-06 RUNTIME_GUARDRAIL runtime) → server/ingest.ts
// fourth Stage-1 branch → pdfToBlocks (unpdf) → ArticleSchema.parse →
// assertRoundTripAnchor → deriveConfidence → stamp → Dexie save →
// ArticleView open. No test bypasses the UI — every flow drives
// input#ingest-file via setInputFiles + the Add file button (the plan's
// no-direct-API-POST acceptance criterion).
//
// Harness (cloned from tests/e2e/library/markdown-upload.spec.ts, which
// cloned happy-path.spec.ts — the 11-PATTERNS "clone again" instruction):
//   - BASE URL:    http://localhost:5173 (Vite dev server; the
//                  /api/ingest middleware serves the full /server pipeline)
//   - beforeEach:  image-stub route + IndexedDB wipe via
//                  indexedDB.deleteDatabase (first-run state) — reused from
//                  annotations/_fixtures.ts wipeDatabase (the identical
//                  pattern; reuse-don't-fork)
//   - fixtures:    the committed synthetic PDF corpus at tests/fixtures/pdf/
//                  (11-01) loaded with node:fs readFileSync — five shapes:
//                  single-column, two-column, scanned, outline, corrupt
//
// Plan 11-03/11-04 contracts exercised:
//   - id = pdf-<shortHash(b64)> — identical bytes → identical id → the
//     D7-07 dedupe-refuse mirrors D8-18's md-<hash> precedent.
//   - D11-07 title chain: the synthetic fixtures carry NO /Info /Title (the
//     generator's trailer has only /Size /Root), so the chain falls through
//     saneInfoTitle → stripPdfExtension(filename) → "calm-report" for
//     "calm-report.pdf". D11-09 consume does NOT fire (the page-1 heading
//     "A Study of Calm Reading" ≠ "calm-report"), so the heading stays in
//     the body — proving both channels in one flow.
//   - mapReasonToCopy calm strings (byte-pinned in pdf-copy.test.ts) are
//     asserted here at the live .status surface with their distinguishing
//     substrings: "looks like scanned images" / "multiple text columns" /
//     "couldn't be opened" / "Already in your library."
//
// Threat register (11-05-PLAN <threat_model>):
//   - T-11-03 (Tampering, silently reordered multi-column text) → the
//     two-column fixture must REFUSE (copy + zero PDF rows + no navigation).
//   - T-11-04 (Info disclosure, refusal copy leakage) → assertions match
//     the exact calm substrings; no enum/jargon appears.
//   - T-11-13 (Repudiation, refusal with silent side effects) → EVERY
//     refusal asserts BOTH the copy AND the no-side-effect state (URL stays
//     #/ and no PDF-badged library row appears). The library composites the
//     6 bundled fixtures with Dexie rows (LibrarySource.ts), so "nothing
//     entered" is asserted as: total rows === fixtures.length AND zero rows
//     carrying a "PDF" source badge — the markdown-upload dedupe shape
//     (fixtures.length + 1 after a successful save) generalized to refusals.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  wipeDatabase,
  selectRangeInBlock,
  findFirstBlockWithText,
  switchMode,
  announcementRegion,
} from "./annotations/_fixtures";

/** Load a committed synthetic PDF fixture's bytes (11-01 corpus). */
function pdfFixture(name: string): Buffer {
  return readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "pdf", name),
  );
}

const SINGLE_COLUMN_PDF = pdfFixture("synthetic-single-column.pdf");
const TWO_COLUMN_PDF = pdfFixture("synthetic-two-column.pdf");
const SCANNED_PDF = pdfFixture("synthetic-scanned.pdf");
const CORRUPT_PDF = pdfFixture("synthetic-corrupt.pdf");

/** Baseline library row count after the wipe: the bundled corpus only. */
const BASELINE_ROWS = FIXTURES.length;

/** Library rows whose source badge reads "PDF" (badgeLabel("pdf")). */
function pdfLibraryRows(page: Page): import("@playwright/test").Locator {
  return page.locator(".library-list > li").filter({
    has: page.locator(".source-badge", { hasText: "PDF" }),
  });
}

/** The calm-refusal status line inside the ingest control's live region. */
function ingestStatus(
  page: Page,
  text: string,
): import("@playwright/test").Locator {
  return page.locator(".ingest-control .status").filter({ hasText: text });
}

/** Attach a PDF to the picker and submit via the Add file button. */
async function uploadPdf(page: Page, name: string, bytes: Buffer): Promise<void> {
  await page.locator("input#ingest-file").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await page.getByRole("button", { name: /add file/i }).click();
}

/** Upload the single-column fixture and wait for the article to settle. */
async function uploadAndOpen(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
  await uploadPdf(page, "calm-report.pdf", SINGLE_COLUMN_PDF);
  await page.waitForURL(/#\/article\/pdf-/, { timeout: 15_000 });
  await waitForOpenedArticle(page);
}

/**
 * Wait for the uploaded article's reading surface to be interaction-ready —
 * the openArticle() waits from annotations/_fixtures.ts minus the goto
 * (upload navigation already landed on #/article/pdf-<id>): a visible
 * selectable block mounted, the pagination engine committed (the DEV
 * __lemPagination hook), then the shared 600ms font/commit settle.
 */
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

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ING-04 — PDF upload intake (SC#1–SC#3 + D7-07)", () => {
  test("SC#1 happy path: text-heavy PDF → pdf-<id> article that opens + paginates like any other", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await uploadPdf(page, "calm-report.pdf", SINGLE_COLUMN_PDF);

    // The submitting state announces "Reading file…" while the binary read +
    // base64 + POST + server-side parse run (markdown-upload L168-171 shape).
    await expect(
      page.locator(".ingest-control .status").filter({ hasText: "Reading file…" }),
    ).toBeVisible();

    // Navigation lands at #/article/pdf-<shortHash> (content-hash id).
    await page.waitForURL(/#\/article\/pdf-/, { timeout: 15_000 });

    // D11-07 filename channel: no /Info title in the fixture, so the
    // provenance h1 renders stripPdfExtension("calm-report.pdf"). PDF body
    // headings start at h2 (one-h1-per-page), so the level-1 heading is the
    // provenance title alone.
    await expect(
      page.getByRole("heading", { level: 1, name: "calm-report" }),
    ).toBeVisible({ timeout: 10_000 });

    // The page-1 large text ("A Study of Calm Reading") did NOT match the
    // filename title, so D11-09 consume left it as the body's first heading
    // (font-size fallback → h2). Structure survived extraction.
    await expect(
      page.getByRole("heading", { name: "A Study of Calm Reading" }),
    ).toBeVisible();

    // Fixture body text is visibly rendered on the standard reading surface
    // (page-1 first paragraph, verbatim from the generator's constants).
    await expect(
      page.getByText("Long-form reading asks for steady attention"),
    ).toBeVisible();

    // The article paginates through the standard machinery: [data-block-
    // index] elements exist on the VISIBLE surface (excluding the always-
    // mounted hidden measurement body — the _fixtures.ts selector shape).
    const visibleBlocks = page.locator(
      '[data-block-index]:not(.article-body-measurement [data-block-index])',
    );
    expect(await visibleBlocks.count()).toBeGreaterThan(0);

    // Navigate back to #/ — the library row carries the quiet "PDF" badge
    // (SourceBadge badgeLabel("pdf") — markdown-upload L205-208 shape).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(pdfLibraryRows(page)).toHaveCount(1);
  });

  test("SC#2 scanned refusal: zero-text PDF refuses calmly; nothing enters the library", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await uploadPdf(page, "scanned-document.pdf", SCANNED_PDF);

    // The typed pdf-scanned reason surfaces its calm copy in the live
    // region (exact substring — the pdf-copy.test.ts byte-pinned string).
    await expect(ingestStatus(page, "looks like scanned images")).toBeVisible({
      timeout: 15_000,
    });

    // No side effects (T-11-13): no navigation away from #/, and no PDF
    // row entered the library (total stays at the bundled baseline).
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.locator(".library-list > li")).toHaveCount(BASELINE_ROWS);
    await expect(pdfLibraryRows(page)).toHaveCount(0);
  });

  test("SC#3 multi-column refusal: columnar PDF refuses — never silently reorders", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await uploadPdf(page, "journal-spread.pdf", TWO_COLUMN_PDF);

    // The typed pdf-multi-column reason surfaces its calm copy.
    await expect(ingestStatus(page, "multiple text columns")).toBeVisible({
      timeout: 15_000,
    });

    // The hard line (T-11-03): the reader never sees interleaved column
    // text. No navigation, no library entry, zero PDF rows.
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.locator(".library-list > li")).toHaveCount(BASELINE_ROWS);
    await expect(pdfLibraryRows(page)).toHaveCount(0);
  });

  test("corrupt refusal: non-PDF bytes refuse with the unreadable copy", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await uploadPdf(page, "broken.pdf", CORRUPT_PDF);

    // The typed pdf-unreadable reason (unpdf throws on the marker bytes).
    await expect(ingestStatus(page, "couldn't be opened")).toBeVisible({
      timeout: 15_000,
    });

    // Same no-side-effect contract as the honest refusals above.
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.locator(".library-list > li")).toHaveCount(BASELINE_ROWS);
    await expect(pdfLibraryRows(page)).toHaveCount(0);
  });

  test("D7-07 dedupe: re-uploading identical PDF bytes refuses with Already in your library", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // First upload — succeeds, navigates to #/article/pdf-<id>.
    await uploadPdf(page, "calm-report.pdf", SINGLE_COLUMN_PDF);
    await page.waitForURL(/#\/article\/pdf-/, { timeout: 15_000 });

    // Navigate back to #/ and capture the row count (auto-retrying count —
    // the LibraryView load effect resolves async after mount; markdown-
    // upload L239-243 shape). Baseline + the one saved PDF article.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(page.locator(".library-list > li")).toHaveCount(
      BASELINE_ROWS + 1,
    );

    // Second upload — IDENTICAL buffer (content-hash id collides; the
    // dedupe-refuse check runs BEFORE save — no overwrite, no orphans).
    await uploadPdf(page, "calm-report.pdf", SINGLE_COLUMN_PDF);

    // The .status region announces the dedupe-refuse copy (D7-04 calm
    // voice; the exact markdown-upload dedupe assertion shape).
    await expect(ingestStatus(page, "Already in your library.")).toBeVisible({
      timeout: 15_000,
    });

    // No navigation away from #/ and the row count is unchanged.
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.locator(".library-list > li")).toHaveCount(
      BASELINE_ROWS + 1,
    );
  });
});

// ── Task 2 — the "identically to other articles" proof (SC#1 second half) ──
//
// The PDF article must annotate and restore location through the IDENTICAL
// ArticleView / PaginatedSurface / Dexie machinery as every other article —
// the load-bearing Phase 7/8 invariant ("ingested = fixture to the reading
// engine"). Both tests reuse the annotations/_fixtures.ts helpers wholesale
// (the capture spec's selection→toolbar→highlight flow + the persistence
// spec's restore assertion shape) at ONE representative typography/viewport
// (default settings, default Playwright viewport — the core-reading-flow
// OQ2 economy precedent); the cross-engine matrix is the engine axis.
test.describe("ING-04 — annotate + location-restore identity (SC#1)", () => {
  test("highlight created via the real selection flow survives a full reload", async ({
    page,
  }) => {
    await uploadAndOpen(page);

    // Select a known range in the first text-rich block on the visible page
    // fragment (the capture-highlight.spec.ts flow — a synthetic DOM Range
    // through the 1:1 [data-block-index] mapping; NEVER Selection.toString()).
    const blockIndex = await findFirstBlockWithText(page, 24);
    expect(blockIndex, "pdf article must have a selectable block").not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIndex, 0, 24);
    expect(ok, `selection must be set on block ${blockIndex}`).toBeTruthy();

    // The floating toolbar appears; the bare Highlight action creates the
    // record through the same Dexie path every other article uses.
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar
      .getByRole("button", { name: "Highlight", exact: true })
      .click();

    // The inline mark renders + the announce fires (STATE-03 via the shared
    // persistence path — not a PDF-specific branch).
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute("data-highlight-id", /.+/);
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    const highlightId = await mark.getAttribute("data-highlight-id");
    expect(highlightId).toBeTruthy();

    // Full reload — the mark MUST re-render from Dexie at the same passage
    // (the persist-reload.spec.ts assertion shape).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(
      page.locator(`mark.highlight[data-highlight-id="${highlightId}"]`),
    ).toHaveCount(1);
  });

  test("reading position restores after reload (scrolling-mode save/restore)", async ({
    page,
  }) => {
    await uploadAndOpen(page);

    // Switch to scrolling mode via the real M-shortcut toggle (the
    // annotations switchMode helper). The toggle PERSISTS readingMode
    // (STATE-02), so the reload below hydrates scrolling mode and the
    // window-level save/restore path is the one persistence.spec.ts proves
    // for every other article (its L62-65 comment documents paginated
    // page-index restore as the deferred option (b) — the plan's sanctioned
    // "or scroll substantially in scrolling mode" alternative).
    await switchMode(page);
    // Wait out the ~400ms settings debounce so readingMode lands in Dexie.
    await page.waitForTimeout(700);

    // Scroll substantially into the article, then wait out the ~1200ms
    // location-save debounce (persistence.spec.ts STATE-01 shape).
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);
    await page.waitForTimeout(1400);
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(
      scrollYBefore,
      "expected to have scrolled down inside the pdf article",
    ).toBeGreaterThan(200);

    // Reload — the saved location MUST restore near the same passage
    // (block-level restore tolerance, never top-of-article for a mid-
    // article save; persistence.spec.ts tolerances mirrored verbatim).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(1000);

    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(
      scrollYAfter,
      `expected restored scrollY > 100, got ${scrollYAfter}`,
    ).toBeGreaterThan(100);
    expect(
      Math.abs(scrollYAfter - scrollYBefore),
      `expected |delta| within 600px, got ${Math.abs(scrollYAfter - scrollYBefore)}`,
    ).toBeLessThan(600);
  });
});
