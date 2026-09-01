// tests/e2e/portability/v21-core-flow-spine.spec.ts
// Plan 21-05 Task 1 — the ACPT-07 phase gate (D21-13): ONE deterministic,
// network-free, UNBROKEN v2.1 core-flow journey driven entirely through the
// real UI, extending the ACPT-06 two-context machine A/B harness
// (core-flow-spine.spec.ts — the template, byte-stable and untouched).
//
// THE V2.1 CORE FLOW (one journey, every step the real reader flow):
//   machine A: seed standalone articles (one finished + tagged, one unread)
//              through seedRows → REAL ingestion #1: an EPUB-with-images
//              through the Add dialog (renderedFigureBook — the images arm;
//              its saveBook writes the D20-15 Blob asset rows, the only
//              network-free way real asset rows exist) → organize via
//              views + search + tag filter (reading-views + search-tag-
//              filter machinery) → REAL ingestion #2: the proven .md
//              payload through the Add dialog → edit metadata through the
//              EditMetadataDialog (metadata-edit precedent) → navigate by
//              TOC (toc-navigation machinery, paginated turn) → create a
//              CROSS-BLOCK highlight through the real selection UI
//              (selectRangeBetweenBlocks — the Phase 19 shipped driver) →
//              review it (route to #/highlights, row jump back to the
//              focused mark) → scroll deep (the location save) → export
//              the whole-library bundle with images through Settings
//   Node side: unzip the captured bundle; v4 envelope + asset-entry truth
//   machine B: prepareFreshPage (the wipe — the reader-facing wipe is
//              recovery-routed in App.tsx, not user-invocable, so the
//              09-06 two-context clear-rows IS the wipe step) → import
//              through the Settings UI including the ImportPreviewDialog
//              Proceed step
//   ACPT-07 no-loss bar (the D13-09 bar at v2.1 breadth):
//     (1) raw IndexedDB rows byte-equal between machine A and machine B
//         across the row kinds — articles, highlights, notes, locations,
//         settings, books, AND asset rows on chromium/firefox (asset
//         truth = every bundle-carried field + byte-equal Blob bytes; the
//         D20-15 createdAt is re-stamped by applyImport by design — it
//         never travels, so it is asserted present-but-fresh, not equal)
//     (2) the reimported CROSS-BLOCK highlight re-resolves CONFIDENT
//         through the shipped resolveQuoteSelector
//     (3) the reimported library reads: the article opens under its
//         traveled reader-title override, the traveled highlight renders
//         its mark, the reading position restores, pagination reproduces
//         machine A's page count on the same engine, and the reimported
//         chapter figure renders its LOCAL blob img (the images arm's
//         machine-B proof — the 20-05 SC#4 render bar)
//
// WebKit engine boundary (D21-11 — the sixth documented skip in the Phase
// 20 ledger's pattern): Playwright's WebKit cannot put ANY Blob value into
// IndexedDB, so the journey's EPUB ingestion (saveBook writes the chapter's
// Blob asset row; the add never completes) and the asset-row equality are
// impossible there. Because D21-13 demands ONE unbroken journey — not a
// silently-degraded per-engine variant — the whole journey is an image-save
// cell on webkit and skips in the documented shape, citing the same ledger
// the five existing sites cite. Chromium + firefox prove every affected
// flow; every non-image arm of this journey is separately webkit-proven by
// the existing spine (ACPT-06 core-flow-spine.spec.ts, .md→highlight→
// export→import) and the reading-views/search-tag-filter/metadata-edit/
// toc-navigation suites, all of which run engine-complete.
//
// Reuse discipline (REUSE-DO-NOT-FORK): machine isolation + raw-row truth
// + Node-side bundle reading from ./_portability; the cross-block selection
// driver + announce region + highlight counting from ../annotations/
// _fixtures; the Add-dialog drivers from ../library/add-dialog; the proven
// .md payload from ../library/markdown-payload; the EPUB-with-images bytes
// from the non-spec unit fixture module ../unit/server/epub-fixtures
// (never from a .spec module — the core-flow-spine L49-63 lesson). Every
// end condition is polled (expect.poll / auto-retrying locators /
// waitForFunction) — zero fixed sleeps in this file.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, LocationRecordSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import {
  graphemeClusters,
  normalizeText,
  resolveQuoteSelector,
} from "../../../src/content/normalizeText";
import type {
  TextPositionSelector,
  TextQuoteSelector,
} from "../../../src/content/normalizeText";
import { sha256Hex } from "../../../src/portability/manifest";
// The EPUB-with-images bytes + the exact PNG the chapter figure carries —
// a non-spec module (unit fixture library), safe to import.
import { FIGURE_PNG_B64, renderedFigureBook } from "../../unit/server/epub-fixtures";
import { MARKDOWN_WITH_FRONTMATTER } from "../library/markdown-payload";
import { openAddDialog, pickSource } from "../library/add-dialog";
import {
  announcementRegion,
  countHighlightsInDexie,
  findFirstBlockWithText,
  selectRangeBetweenBlocks,
} from "../annotations/_fixtures";
import {
  BASE,
  bundleInput,
  countRows,
  makeArticle,
  openSettings,
  prepareFreshPage,
  readAllRows,
  readBundleJson,
  readRow,
  seedRows,
  settingsStatus,
} from "./_portability";

/** The seeded finished article's discriminating tag (search + chip filter). */
const SEED_TAG = "harbor-voyage";

const FINISHED_ID = "v21-spine-finished";
const FINISHED_TITLE = "The Spine Harbor Register";
const UNREAD_ID = "v21-spine-unread";
const UNREAD_TITLE = "The Unread Spine Almanac";

/** The grapheme total of an article — the SAME substrate the app's
 * readingState ratio uses (reading-views.spec.ts totalOf parity). */
function totalOf(article: CanonicalArticle): number {
  return graphemeClusters(normalizeText(article), article.lang).length;
}

/** The seeded corpus: one FINISHED + tagged standalone article (location at
 * the FULL grapheme total — never a floored threshold multiple, the 14-04
 * trap) and one UNREAD standalone article. Both built through the shipped
 * makeArticle + ArticleSchema (schema-valid by construction; tags ride the
 * v4 articles field). */
const FINISHED_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  ...makeArticle({
    id: FINISHED_ID,
    title: FINISHED_TITLE,
    paragraphs: [
      "The harbor register records every arrival the port has known, and its keeper notes with pride that no two entries agree entirely on the weather, the tide, or the temperament of the crew.",
      "The final page closes the season: a vessel that arrived twice under different names, a cargo of nothing but correspondence, and a margin note suggesting the whole log be read slowly, ideally by lamplight.",
    ],
  }),
  tags: [SEED_TAG],
});
const UNREAD_ARTICLE: CanonicalArticle = makeArticle({
  id: UNREAD_ID,
  title: UNREAD_TITLE,
  paragraphs: [
    "The almanac was printed in a winter when the harbor froze so hard that the pilots walked to their boats across the ice, and its tables still record the tide heights they measured through the cracks.",
    "Nobody has opened this copy since it was shelved, which the librarian considers a kind of purity: an almanac of a season that arrived, passed, and was never once consulted.",
  ],
});
const FINISHED_LOCATION = LocationRecordSchema.parse({
  schemaVersion: 1,
  articleId: FINISHED_ID,
  revision: 1,
  graphemeOffset: totalOf(FINISHED_ARTICLE),
  savedAt: "2026-09-01T00:00:00.000Z",
});

/** The exact bytes the chapter figure carries (the images-arm truth). */
const FIGURE_PNG_BYTES = new Uint8Array(Buffer.from(FIGURE_PNG_B64, "base64"));

/** The DEV pagination hook's committed shape (corpus-spec precedent — the
 * core-flow-spine template's own module-local reader). */
interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
}

/** Read the current __lemPagination snapshot (null until the engine commits). */
function paginationDev(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination as
        | PaginationDev
        | undefined
        | null,
  );
}

/** Remount LibraryView so freshly written rows render (the 08-05 one-load-
 * per-mount discipline; the 16-03 reloadLibrary precedent). */
async function reloadLibrary(page: Page): Promise<void> {
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });
}

/** Browser-side asset-row truth: the serializable fields via readRow plus
 * the Blob's bytes read browser-side via arrayBuffer — Blobs never cross
 * the evaluate channel (the 20-05 SC#4 raw-row byte-equality precedent,
 * extended to both machines). */
async function readAssetTruth(
  page: Page,
  articleId: string,
  assetId: string,
): Promise<{ fields: Record<string, unknown> | null; bytes: number[] | null }> {
  const fields = await readRow(page, "assets", [articleId, assetId]);
  const bytes = await page.evaluate(
    async ({ articleId, assetId }) => {
      return new Promise<number[] | null>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("assets")) {
            resolve(null);
            return;
          }
          const tx = db.transaction("assets", "readonly");
          const getReq = tx.objectStore("assets").get([articleId, assetId]);
          getReq.onsuccess = async () => {
            const row = getReq.result as { data?: Blob } | undefined;
            if (!row?.data) {
              resolve(null);
              return;
            }
            const buf = await row.data.arrayBuffer();
            resolve(Array.from(new Uint8Array(buf)));
          };
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    },
    { articleId, assetId },
  );
  return { fields, bytes };
}

/** Deterministic row-order comparator by id (the core-flow-spine byId). */
const byId = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  String(a.id).localeCompare(String(b.id));

test("ACPT-07 — the v2.1 core flow as one unbroken journey: nothing lost across machines", async ({
  browser,
  browserName,
}) => {
  // WebKit engine boundary (surfaced 20-05, probe-verified 2026-08-31 —
  // .planning/phases/20-safe-local-image-fidelity/deferred-items.md):
  // Playwright's WebKit refuses ALL Blob values at the IndexedDB put
  // (UnknownError), so this journey's images arm cannot run there — the
  // EPUB ingestion's saveBook writes the chapter's D20-15 Blob asset row
  // (the add never completes) and the asset-row equality reads those rows
  // back. Per D21-11 the image-save cells engine-skip in this documented
  // pattern; because D21-13 demands one UNBROKEN journey, the whole cell
  // is an image-save cell on webkit. Chromium + firefox prove every
  // affected flow; the non-image arms stay webkit-proven by the existing
  // engine-complete suites (ACPT-06 spine, reading-views, search-tag-
  // filter, metadata-edit, toc-navigation).
  test.skip(
    browserName === "webkit",
    "WebKit engine boundary: Playwright's WebKit cannot put Blob values into IndexedDB (UnknownError — Phase 20 deferred-items.md) — the journey's EPUB-with-images ingestion and asset-row equality are image-save cells; chromium/firefox carry the proof",
  );
  test.setTimeout(120_000); // one unbroken journey per engine (D21-13)

  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);

    // ── Seed: standalone articles (one finished + tagged, one unread) ────
    await seedRows(pageA, {
      articles: [
        FINISHED_ARTICLE as unknown as Record<string, unknown>,
        UNREAD_ARTICLE as unknown as Record<string, unknown>,
      ],
      locations: [FINISHED_LOCATION as unknown as Record<string, unknown>],
    });

    // ── Seed: REAL ingestion #1 — the EPUB with images (the images arm) ──
    // renderFigureBook: one readerable chapter with exactly ONE admissible
    // PNG figure — the fittest shipped payload whose saveBook writes real
    // Blob asset rows network-free (fixture-registry images do not travel
    // through export — 21-RESEARCH A4).
    await openAddDialog(pageA);
    await pickSource(pageA, "file");
    await pageA.locator("input#ingest-file").setInputFiles({
      name: "figure-book.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from(renderedFigureBook()),
    });
    await pageA.getByRole("button", { name: /add file/i }).click();
    await expect(
      pageA.locator("li.book-row"),
      "the EPUB book success signal is its library row (D16-12)",
    ).toBeVisible({ timeout: 15_000 });
    await reloadLibrary(pageA);

    // The chapter id (from the expanded book row's chapter link) + the raw
    // asset-row truth: exactly ONE Blob row attributed to the chapter.
    await pageA.locator("li.book-row .book-toggle").click();
    await expect(pageA.locator("li.book-row .book-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const chapterHref = await pageA
      .locator("li.book-row .book-chapter-list > li")
      .filter({ hasText: "Chapter 1. Rendered" })
      .locator('a[href^="#/article/"]')
      .getAttribute("href");
    expect(chapterHref, "the expanded book must expose the chapter link").not.toBeNull();
    const chapterId = (chapterHref ?? "").replace("#/article/", "");
    expect(chapterId).toMatch(/-c00$/);
    await expect
      .poll(
        async () => countRows(pageA, "assets"),
        { timeout: 10_000 },
      )
      .toBe(1);
    const assetRowsOnA = await readAllRows(pageA, "assets");
    expect(assetRowsOnA).toHaveLength(1);
    const assetId = String(assetRowsOnA[0]!.assetId);

    // ── Organize (views): the finished/unsigned membership split ─────────
    // The switcher links carry live counts in their accessible names
    // ("Unread (9)" — D14-02), so match the label + count shape by regex.
    const viewsNav = pageA.getByRole("navigation", { name: "Library views" });
    await viewsNav.getByRole("link", { name: /^Unread \(\d+\)$/ }).click();
    await expect(pageA).toHaveURL(/#\/unread$/);
    await expect(
      pageA.locator(`#title-${UNREAD_ID}`),
      "the unread seed belongs to Unread",
    ).toBeVisible();
    await expect(
      pageA.locator(`#title-${FINISHED_ID}`),
      "the finished seed must not appear in Unread",
    ).toHaveCount(0);
    await viewsNav.getByRole("link", { name: /^Finished \(\d+\)$/ }).click();
    await expect(pageA).toHaveURL(/#\/finished$/);
    await expect(
      pageA.locator(`#title-${FINISHED_ID}`),
      "the finished seed belongs to Finished",
    ).toBeVisible();

    // ── Organize (filters): search narrows; the tag chip filters ─────────
    await viewsNav.getByRole("link", { name: /^All \(\d+\)$/ }).click();
    await expect(pageA).toHaveURL(/#\/$/);
    const searchInput = pageA.locator("input#library-search");
    await searchInput.fill("Almanac");
    await expect(
      pageA.locator(".library-list > li"),
      "title search narrows to the unread seed alone (D8-06)",
    ).toHaveCount(1);
    await expect(pageA.locator(`#title-${UNREAD_ID}`)).toBeVisible();
    await searchInput.fill("");
    const chip = pageA
      .locator(".tag-filter .tag-chip")
      .filter({ hasText: SEED_TAG });
    await expect(chip, "the seeded tag renders a filter chip (D8-07)").toBeVisible();
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(
      pageA.locator(".library-list > li"),
      "the active chip filters to the tagged article alone",
    ).toHaveCount(1);
    await expect(pageA.locator(`#title-${FINISHED_ID}`)).toBeVisible();
    await chip.click(); // single-select toggle clears the filter
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    // ── Add content: REAL ingestion #2 — the proven .md payload ──────────
    await openAddDialog(pageA);
    await pickSource(pageA, "file");
    await pageA.locator("input#ingest-file").setInputFiles({
      name: "calm-reading.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(MARKDOWN_WITH_FRONTMATTER, "utf-8"),
    });
    await pageA.getByRole("button", { name: /add file/i }).click();
    await pageA.waitForURL(/#\/article\/md-/, { timeout: 15_000 });
    const idMatch = /#\/article\/(md-[a-z0-9]+)/.exec(pageA.url());
    expect(idMatch, "the article route must carry the md- content-hash id").not.toBeNull();
    const articleId = idMatch![1]!;

    // The engine commits multi-page (the page-count identity baseline).
    await expect(
      pageA.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(
        async () => {
          const dev = await paginationDev(pageA);
          return dev ? `${dev.status}:${dev.pagesLength}` : "pending";
        },
        { timeout: 15_000 },
      )
      .toMatch(/^ok:[2-9]\d*$/);
    const pagesOnA = (await paginationDev(pageA))!.pagesLength;

    // ── Edit metadata: the reader-title override through the real dialog ─
    await pageA.getByRole("button", { name: "Back to library" }).click();
    await expect(
      pageA.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    const mdRow = pageA
      .locator(".library-list > li")
      .filter({ hasText: "The Discipline of Calm Reading" });
    await expect(mdRow).toBeVisible();
    await mdRow.locator(".library-row-edit").click();
    const editDialog = pageA.locator("dialog.edit-metadata");
    await expect(editDialog).toBeVisible();
    const overriddenTitle = "The Calm Spine Discipline";
    await editDialog.getByRole("textbox", { name: /^Title$/ }).fill(overriddenTitle);
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).not.toBeVisible();
    await expect(pageA.locator(`#title-${articleId}`)).toHaveText(overriddenTitle);

    // ── Navigate by TOC: the panel turns the page to the section ────────
    await pageA.locator(`a[aria-labelledby="title-${articleId}"]`).click();
    await pageA.waitForURL(new RegExp(`#/article/${articleId}$`), { timeout: 10_000 });
    await expect(
      pageA.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(pageA.locator(".page-fragment").first()).toBeVisible({ timeout: 10_000 });
    await pageA.getByRole("button", { name: "Table of contents" }).click();
    const tocNav = pageA.getByRole("navigation", { name: "Table of contents" });
    await expect(
      tocNav.getByRole("link", { name: "Top of article" }),
    ).toBeVisible();
    await tocNav.getByRole("link", { name: "A Section on Lists" }).click();
    await expect(pageA.locator(".toc-panel")).toBeHidden();
    const destination = pageA
      .locator(
        "[data-block-index]:not(.article-body-measurement [data-block-index])",
      )
      .filter({ hasText: "A Section on Lists" })
      .first();
    await expect(destination).toBeVisible();
    await expect
      .poll(() =>
        pageA.evaluate(() => {
          const el = document.activeElement;
          return !!el && el.getAttribute("data-block-index") !== null
            ? (el as HTMLElement).textContent
            : null;
        }),
      )
      .toContain("A Section on Lists");

    // ── Cross-block highlight: two paragraphs, one selection (D19) ───────
    // Scrolling mode mounts the WHOLE body, so both endpoint blocks live in
    // the DOM (the survive-relayout precedent). The toggle also persists
    // readingMode into reader-prefs — the settings row that must travel.
    const toggleA = pageA.getByRole("button", { name: /^Reading mode:/ });
    await toggleA.click();
    await expect(toggleA).toHaveAttribute("aria-label", "Reading mode: scrolling");
    await expect
      .poll(
        async () =>
          ((await readRow(pageA, "settings", "reader-prefs"))?.value as
            | { readingMode?: string }
            | undefined)?.readingMode ?? "missing",
        { timeout: 10_000 },
      )
      .toBe("scrolling");

    const blockOne = await findFirstBlockWithText(pageA, 24);
    expect(blockOne, "the md article must have a selectable first block").not.toBe(-1);
    const blockTwo = await pageA.evaluate(
      ({ after, min }) => {
        const blocks = Array.from(
          document.querySelectorAll(
            '[data-block-index]:not(.article-body-measurement [data-block-index])',
          ),
        );
        for (const el of blocks) {
          const idx = Number(el.getAttribute("data-block-index"));
          if (
            idx > after &&
            !Number.isNaN(idx) &&
            (el.textContent?.length ?? 0) >= min
          ) {
            return idx;
          }
        }
        return -1;
      },
      { after: blockOne, min: 24 },
    );
    expect(blockTwo, "a second text block must follow the first").not.toBe(-1);
    expect(
      await selectRangeBetweenBlocks(pageA, { blockIndex: blockOne, offset: 0 }, { blockIndex: blockTwo, offset: 24 }),
      "the cross-block selection must be set",
    ).toBeTruthy();
    const toolbar = pageA.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(
      pageA.locator("mark.highlight").first(),
      "the captured cross-block highlight must render its mark",
    ).toBeVisible();
    await expect(announcementRegion(pageA)).toContainText(/Highlight saved/i);
    await expect
      .poll(async () => countHighlightsInDexie(pageA, articleId), { timeout: 10_000 })
      .toBe(1);
    const highlightsOnA = (await readAllRows(pageA, "highlights")).filter(
      (r) => r.articleId === articleId,
    );
    expect(highlightsOnA).toHaveLength(1);
    const traveledHighlightId = String(highlightsOnA[0]!.id);

    // ── Review: the Highlights row jumps back to the focused mark ────────
    await pageA.goto(`${BASE}/#/highlights`);
    await expect(
      pageA.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible({ timeout: 10_000 });
    const rowButton = pageA
      .getByRole("button", { name: /^Go to highlight:/ })
      .first();
    await expect(rowButton, "the cross-block highlight is a confident, jumpable row").toBeEnabled();
    await rowButton.click();
    await expect(
      pageA.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 10_000 });
    // A CROSS-BLOCK highlight renders one mark per containing block — both
    // slices share data-highlight-id (the D5-16/Phase 19 span contract), so
    // the jump landing shows BOTH slices (heading block → paragraph block).
    const jumpedMarks = pageA.locator(
      `mark.highlight[data-highlight-id="${traveledHighlightId}"]`,
    );
    await expect
      .poll(async () => await jumpedMarks.count(), { timeout: 15_000 })
      .toBe(2);
    await expect(jumpedMarks.first()).toBeVisible();
    await expect
      .poll(() =>
        pageA.evaluate(() => {
          const el = document.activeElement;
          return el ? el.closest("mark.highlight")?.getAttribute("data-highlight-id") : null;
        }),
      )
      .toBe(traveledHighlightId);

    // ── Scroll deep — the LAST machine-A write (the location that travels)
    const articleRowA = await readRow(pageA, "articles", articleId);
    expect(articleRowA, "the md article row must exist on machine A").not.toBeNull();
    const revision = articleRowA!.revision as number;
    await pageA.evaluate(() =>
      window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.6)),
    );
    await expect
      .poll(
        async () =>
          (await readRow(pageA, "location", [articleId, revision]))?.graphemeOffset ?? -1,
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    // ── Freeze machine A's exported set (read AFTER all writes settled) ──
    const articlesOnA = await readAllRows(pageA, "articles");
    const notesOnA = await readAllRows(pageA, "notes");
    const locationsOnA = await readAllRows(pageA, "location");
    const settingsOnA = await readAllRows(pageA, "settings");
    const booksOnA = await readAllRows(pageA, "books");
    const assetOnA = await readAssetTruth(pageA, chapterId, assetId);
    expect(assetOnA.fields, "the chapter's asset row must exist on machine A").not.toBeNull();
    expect(assetOnA.bytes).toEqual(Array.from(FIGURE_PNG_BYTES));

    // ── Export the whole-library bundle WITH images through Settings ─────
    const panelA = await openSettings(pageA);
    await expect(
      panelA.getByRole("button", { name: "Export library bundle" }),
    ).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lem-reader-bundle-v1.zip");
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node side: v4 envelope + the asset entry's byte truth ────────────
    const { bundle: bundleJson, entries } = readBundleJson(bundlePath!);
    expect(bundleJson.schemaVersion).toBe(4);
    expect((bundleJson.articles as Array<{ id: string }>).map((a) => a.id).sort()).toEqual(
      [articleId, chapterId, FINISHED_ID, UNREAD_ID].sort(),
    );
    expect((bundleJson.books as Array<{ id: string }>).length).toBe(1);
    const assetMeta = bundleJson.assets as Array<Record<string, unknown>>;
    expect(assetMeta).toHaveLength(1);
    expect(assetMeta[0]).toMatchObject({
      articleId: chapterId,
      assetId,
      contentType: "image/png",
      byteLength: FIGURE_PNG_BYTES.byteLength,
      entry: `assets/${chapterId}/${assetId}`,
    });
    expect(assetMeta[0]!.sha256).toBe(await sha256Hex(FIGURE_PNG_BYTES));
    const entryBytes = entries[`assets/${chapterId}/${assetId}`];
    expect(entryBytes, "the asset zip entry must exist").toBeDefined();
    expect(Array.from(entryBytes!)).toEqual(Array.from(FIGURE_PNG_BYTES));

    // ── Machine B: wipe (the two-context clear), then import via the UI ──
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);
    await bundleInput(pageB).setInputFiles(bundlePath!);

    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    // The summary sentence computed from the bundle itself (honest
    // pluralization — the ImportPreviewDialog countWithLabel contract).
    const counted = (n: number, one: string, other: string) =>
      `${n} ${n === 1 ? one : other}`;
    const nArticles = (bundleJson.articles as unknown[]).length;
    const nHighlights = (bundleJson.highlights as unknown[]).length;
    const nNotes = (bundleJson.notes as unknown[]).length;
    const nLocations = (bundleJson.locations as unknown[]).length;
    const containsSentence = `This bundle contains ${counted(nArticles, "article", "articles")}, ${counted(nHighlights, "highlight", "highlights")}, ${counted(nNotes, "note", "notes")}, and ${counted(nLocations, "reading position", "reading positions")}.`;
    await expect(preview).toContainText(containsSentence);
    await expect(preview).not.toContainText("will be skipped because");
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      `Imported ${counted(nArticles, "article", "articles")}, ${counted(nHighlights, "highlight", "highlights")}, ${counted(nNotes, "note", "notes")}, and ${counted(nLocations, "reading position", "reading positions")}.`,
      { timeout: 15_000 },
    );

    // ── (1) Raw IndexedDB rows byte-equal across every row kind ──────────
    // Read BEFORE any machine-B reader action can schedule its own writes.
    const articlesOnB = await readAllRows(pageB, "articles");
    expect(articlesOnB).toHaveLength(articlesOnA.length);
    expect([...articlesOnB].sort(byId)).toEqual([...articlesOnA].sort(byId));

    const highlightsOnB = (await readAllRows(pageB, "highlights")).filter(
      (r) => r.articleId === articleId,
    );
    expect(highlightsOnB).toHaveLength(1);
    expect([...highlightsOnB].sort(byId)).toEqual([...highlightsOnA].sort(byId));

    expect(await readAllRows(pageB, "notes")).toEqual(notesOnA);
    expect(await readAllRows(pageB, "location")).toEqual(locationsOnA);
    expect(await readAllRows(pageB, "settings")).toEqual(settingsOnA);
    expect(await readAllRows(pageB, "books")).toEqual(booksOnA);

    // Asset rows (chromium/firefox — the engines this journey runs on):
    // every bundle-carried field + the Blob bytes are byte-equal. The
    // D20-15 createdAt never travels (applyImport re-stamps it — shipped
    // behavior), so it is asserted fresh, never compared.
    const assetOnB = await readAssetTruth(pageB, chapterId, assetId);
    expect(assetOnB.fields, "the reimported asset row must exist").not.toBeNull();
    expect(assetOnB.fields!.articleId).toBe(chapterId);
    expect(assetOnB.fields!.assetId).toBe(assetId);
    expect(assetOnB.fields!.contentType).toBe(assetOnA.fields!.contentType);
    expect(assetOnB.fields!.byteLength).toBe(assetOnA.fields!.byteLength);
    expect(assetOnB.bytes, "the reimported Blob bytes are byte-equal").toEqual(
      assetOnA.bytes,
    );
    expect(assetOnB.bytes).toEqual(Array.from(FIGURE_PNG_BYTES));
    expect(typeof assetOnB.fields!.createdAt).toBe("string");

    // ── (2) The reimported CROSS-BLOCK highlight re-resolves confident ───
    const reimportedArticle = ArticleSchema.parse(
      (await readRow(pageB, "articles", articleId))!,
    ) as CanonicalArticle;
    const traveled = highlightsOnB[0]!;
    const resolved = resolveQuoteSelector(
      reimportedArticle,
      traveled.quote as TextQuoteSelector,
      traveled.position as TextPositionSelector,
    );
    expect(
      resolved,
      `the traveled cross-block highlight must re-resolve confident (not ${resolved})`,
    ).toEqual(
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      }),
    );

    // ── (3) The reimported library reads identically ─────────────────────
    await pageB.keyboard.press("Escape");
    await expect(panelB).not.toBeVisible();
    await pageB.reload();
    await expect(
      pageB.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    // The traveled reader-title override is the row's effective name.
    await pageB.locator(`a[aria-labelledby="title-${articleId}"]`).click();
    await expect(
      pageB.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      pageB.getByRole("heading", { level: 1, name: overriddenTitle }),
    ).toBeVisible();

    // The traveled highlight renders its mark (scrolling mode traveled too).
    // The traveled highlight renders its mark on BOTH cross-block slices
    // (scrolling mode traveled too — the D5-16 two-slice shape again).
    const traveledMarks = pageB.locator(
      `mark.highlight[data-highlight-id="${traveledHighlightId}"]`,
    );
    await expect
      .poll(async () => await traveledMarks.count(), { timeout: 15_000 })
      .toBe(2);
    await expect(traveledMarks.first()).toBeVisible();

    // The deep reading position restores past the article top (STATE-01).
    await expect
      .poll(
        async () => pageB.evaluate(() => window.scrollY),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(100);

    // Paginates identically: switch through the real toggle; the engine
    // commits ok with machine A's exact page count, and the D4-10 anchor
    // carries the restored passage across the swap (the ACPT-06 bar).
    const restoredPassage = await pageB.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll(
          '[data-block-index]:not(.article-body-measurement [data-block-index])',
        ),
      );
      for (const el of blocks) {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) {
          return (el.textContent ?? "").trim().slice(0, 40);
        }
      }
      return null;
    });
    expect(restoredPassage, "a restored in-viewport passage must exist").not.toBeNull();
    const toggleB = pageB.getByRole("button", { name: /^Reading mode:/ });
    await toggleB.click();
    await expect(toggleB).toHaveAttribute("aria-label", "Reading mode: paginated");
    await expect
      .poll(
        async () => {
          const dev = await paginationDev(pageB);
          return dev ? `${dev.status}:${dev.pagesLength}` : "pending";
        },
        { timeout: 15_000 },
      )
      .toBe(`ok:${pagesOnA}`);
    await pageB.waitForFunction(
      (needle) => {
        const fragment = document.querySelector(".page-fragment");
        if (fragment && fragment.textContent?.includes(needle)) return true;
        const article = document.querySelector(".article-body");
        return !!article && article.textContent?.includes(needle);
      },
      restoredPassage!,
      { timeout: 10_000 },
    );

    // The images arm's machine-B proof: the reimported chapter figure
    // renders its LOCAL blob img (decode + blob: src — the 20-05 SC#4 bar).
    await pageB.getByRole("button", { name: "Back to library" }).click();
    await expect(
      pageB.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await pageB.locator("li.book-row .book-toggle").click();
    await pageB
      .locator("li.book-row .book-chapter-list > li")
      .filter({ hasText: "Chapter 1. Rendered" })
      .locator('a[href^="#/article/"]')
      .click();
    await pageB.waitForURL(new RegExp(`#/article/${chapterId}$`), { timeout: 10_000 });
    await expect(
      pageB.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 15_000 });
    const img = pageB.locator("figure img");
    await expect
      .poll(async () => await img.count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(img.first()).toHaveAttribute("src", /^blob:/);
    await expect
      .poll(
        async () =>
          await img.first().evaluate((el) => (el as HTMLImageElement).naturalWidth),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  } finally {
    await machineA.close();
    await machineB.close();
  }
});
