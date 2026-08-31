// tests/e2e/portability/round-trip.spec.ts
// Plan 09-06 Task 1 — the SC#4 phase-exit e2e gate: a bundle exported on
// "machine A" imports on "machine B" with every highlight re-resolving to
// confident (or surfacing honestly as ambiguous/orphan), canonical-text
// offsets byte-equal across the round trip, per-article source URLs carried
// (SC#1), and NO page-number data anywhere in bundle.json.
//
// Phase 12 (Plan 12-07 Task 2) extends the gate at book granularity:
//   - the base flow's export now asserts schemaVersion 2 + books: [] (the
//     v2 write contract — writers always emit the field);
//   - the BOOK round trip: machine A uploads a real EPUB (generator
//     builder), highlights chapter 2, saves a reading position, exports →
//     machine B imports → the book groups with ALL chapters, the highlight
//     renders at the same offset, the traveled location surfaces as the
//     book-level Continue-Reading entry, and a re-export from B is
//     deterministic (identical manifest blocks);
//   - the v1-compat gate: a Phase 9 v1 bundle (no books key) imports
//     exactly as before with zero book writes — never break older bundles.
//
// Two browser contexts ARE the two machines: each context is an isolated
// profile, so its IndexedDB origin storage is a separate device. The flow is
// the real reader flow — no DEV hooks:
//   machine A: seed (raw IndexedDB puts) → Settings → Export library bundle
//              → download capture (proven A1 harness)
//   Node side: unzip the downloaded .zip, parse bundle.json, assert the
//              envelope, SC#1 source-URL carriage, fixture minimization, and
//              the SC#4 recursive no-"page"-key walk
//   machine B: clear stores → Settings → setInputFiles(path) (the A5 path
//              variant) → preview dialog counts → Import → status summary
//   truth:     readRow/countRows on machine B — rows physically present,
//              offsets byte-equal; the fixture-backed highlight renders a
//              visible mark in the reader (the ANNO rendering surface).
import { test, expect } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import {
  BLOCK_SEPARATOR,
  deriveQuoteSelector,
  graphemeLength,
  normalizeText,
  resolveQuoteSelector,
} from "../../../src/content/normalizeText";
import type {
  TextPositionSelector,
  TextQuoteSelector,
} from "../../../src/content/normalizeText";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest, sha256Hex } from "../../../src/portability/manifest";
import { validBookEpub3 } from "../../unit/server/epub-fixtures";
// Plan 16-03 — the shared dialog-opening helper (ADD-01: the intake
// forms live behind the header Add button's modal).
import { openAddDialog, pickSource } from "../library/add-dialog";
import {
  BASE,
  buildBundleZip,
  confidentHighlightOn,
  collectPageKeys,
  countRows,
  highlightRow,
  makeArticle,
  openSettings,
  prepareFreshPage,
  readBundleJson,
  readRow,
  readAllRows,
  seedRows,
  settingsStatus,
} from "./_portability";

/** SC#1: the md-style article's per-article source URL, asserted VERBATIM in
 * the exported bundle.json (markdown ingestion carries source URLs; paste
 * ingestion has none by nature). */
const MD_SOURCE_URL = "https://example.org/round-trip-markdown-source";

const PASTE_ARTICLE = makeArticle({
  id: "paste-rt11aa22bb33",
  title: "Round Trip Paste Article",
  paragraphs: [
    "The first paragraph of the paste-style round trip article. It carries enough distinctive plain prose that a passage lifted from its middle resolves confidently through the shipped TextQuoteSelector machinery on every engine.",
    "The second paragraph changes the subject toward storage. A reader on machine A selects a sentence here, attaches a note, and later carries the whole library to machine B inside one versioned zip bundle.",
    "The third paragraph closes the corpus with a thought about offsets. Grapheme positions into normalized text are the durable anchor; nothing about pages, viewports, or typography survives into the bundle by design.",
    "A fourth paragraph gives the resolver additional unique material so that no passage chosen by the harness can accidentally appear twice in the normalized stream.",
  ],
});

const MD_ARTICLE = makeArticle({
  id: "md-rt44cc55dd66",
  title: "Round Trip Markdown Article",
  sourceUrl: MD_SOURCE_URL,
  author: "Ada Roundtrip",
  paragraphs: [
    "The first paragraph of the markdown-style round trip article. Markdown ingestion stamps a canonical source URL into provenance, and that URL must ride along verbatim when the library is exported.",
    "The second paragraph hosts the highlighted sentence with its note. The note follows its highlight across machines through the highlightId foreign key, rewritten only when a keep-both conflict mints a new id.",
    "The third paragraph provides trailing uniqueness material for the resolver so the anchored passage is unambiguous across the whole normalized text.",
  ],
});

test("SC#4 — export on machine A re-imports on machine B with offsets intact", async ({
  browser,
}) => {
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // ── Machine A: seed the library ────────────────────────────────────────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);

    // Node-side anchor derivation through the SHIPPED machinery (the same
    // resolver the importer runs) — genuine passages, confident by
    // construction, ASCII so grapheme segmentation is engine-identical.
    const anchorAlpha = confidentHighlightOn(PASTE_ARTICLE);
    const anchorBeta = confidentHighlightOn(MD_ARTICLE);
    const fixtureArticle = fixtures.find((f) => f.id === "essay-long-form");
    expect(fixtureArticle, "essay-long-form fixture must be bundled").toBeDefined();
    // A fixture passage: begin the scan ~150 graphemes in so the walk starts
    // inside genuine body prose (past the opening heading + first paragraph).
    const anchorFixture = confidentHighlightOn(fixtureArticle!, {
      start: 150,
      length: 30,
    });

    /** The seeded reader preferences — distinctive values so machine B's
     * applyPreferences write is observable (fresh device ⇒ default true). */
    const seededPrefs = {
      schemaVersion: 2,
      font: "sans",
      size: 22,
      measure: 64,
      spacing: "comfortable",
      theme: "dark",
      readingMode: "paginated",
    };

    await seedRows(pageA, {
      articles: [PASTE_ARTICLE, MD_ARTICLE],
      highlights: [
        highlightRow(PASTE_ARTICLE.id, anchorAlpha, "hl-rt-alpha"),
        highlightRow(MD_ARTICLE.id, anchorBeta, "hl-rt-beta"),
        highlightRow(fixtureArticle!.id, anchorFixture, "hl-rt-fixture"),
      ],
      notes: [
        {
          schemaVersion: 1,
          id: "nt-rt-beta",
          highlightId: "hl-rt-beta",
          text: "Note riding the round trip.",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      locations: [
        {
          schemaVersion: 1,
          articleId: PASTE_ARTICLE.id,
          revision: 1,
          graphemeOffset: 42,
          savedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      settings: [{ key: "reader-prefs", value: seededPrefs }],
    });

    // ── Machine A: export through the real UI ──────────────────────────────
    const panelA = await openSettings(pageA);
    await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lem-reader-bundle-v1.zip");
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node-side bundle inspection (the spec runs in Node) ────────────────
    const { bundle: bundleJson, entries } = readBundleJson(bundlePath!);
    // Both required entries exist.
    expect(entries["manifest.json"]).toBeDefined();

    // Versioned envelope (PORT-01) — writers emit v4 since Phase 20 (20-05,
    // the 12-07/17-04 version-bump assertion-update precedent), always
    // carrying the books + assets fields (empty arrays on book-free /
    // asset-free libraries).
    expect(bundleJson.schemaVersion).toBe(4);
    expect(bundleJson.books).toEqual([]);

    // Both articles ride; the fixture does NOT (fixtures are bundled code —
    // only their ids travel).
    const articles = bundleJson.articles as Array<{
      id: string;
      provenance?: { sourceUrl?: string };
    }>;
    expect(articles.map((a) => a.id).sort()).toEqual([MD_ARTICLE.id, PASTE_ARTICLE.id].sort());
    expect(
      articles.some((a) => a.id === fixtureArticle!.id),
      "fixture article must never serialize into the bundle",
    ).toBe(false);

    // SC#1 — the seeded provenance.sourceUrl rides VERBATIM (per-article
    // source URLs, not stripped).
    const mdExported = articles.find((a) => a.id === MD_ARTICLE.id);
    expect(mdExported?.provenance?.sourceUrl).toBe(MD_SOURCE_URL);

    // The fixture id travels in fixtureIds so machine B can re-anchor
    // fixture-backed highlights against its own bundled copy.
    expect(bundleJson.fixtureIds).toContain(fixtureArticle!.id);

    // Preferences always ride (D9-12).
    expect(bundleJson.preferences).toEqual(seededPrefs);

    // SC#4 data minimization — a recursive key walk over the whole parsed
    // bundle finds no key matching "page" (page numbers are ephemeral; the
    // grapheme substrate is the only durable anchor).
    expect(
      collectPageKeys(bundleJson),
      "no page-number/page-derived key may appear anywhere in bundle.json",
    ).toEqual([]);

    // ── Machine B: import through the real UI ──────────────────────────────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);

    // The A5 PATH variant: setInputFiles with a filesystem path.
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);

    // The preview dialog shows the incoming counts (D9-11 dry run).
    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 2 articles, 3 highlights, 1 note, and 1 reading position.",
    );

    // Proceed (the only path across the destructive-write boundary).
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 2 articles, 3 highlights, 1 note, and 1 reading position.",
      { timeout: 15_000 },
    );

    // ── Machine B: raw IndexedDB truth ─────────────────────────────────────
    // Both articles present.
    expect(await readRow(pageB, "articles", PASTE_ARTICLE.id)).not.toBeNull();
    expect(await readRow(pageB, "articles", MD_ARTICLE.id)).not.toBeNull();

    // SC#4 — offsets survive byte-equal: position.start/position.end equal
    // the seeded grapheme values on BOTH seeded highlights.
    const alphaRow = await readRow(pageB, "highlights", "hl-rt-alpha");
    expect(alphaRow).not.toBeNull();
    expect((alphaRow!.position as { start: number }).start).toBe(anchorAlpha.position.start);
    expect((alphaRow!.position as { end: number }).end).toBe(anchorAlpha.position.end);
    const betaRow = await readRow(pageB, "highlights", "hl-rt-beta");
    expect(betaRow).not.toBeNull();
    expect((betaRow!.position as { start: number }).start).toBe(anchorBeta.position.start);
    expect((betaRow!.position as { end: number }).end).toBe(anchorBeta.position.end);
    // The stored quotes survived verbatim too (the re-anchoring substrate).
    expect((alphaRow!.quote as { exact: string }).exact).toBe(anchorAlpha.quote.exact);

    // The note follows its highlight (matching highlightId).
    const noteRow = await readRow(pageB, "notes", "nt-rt-beta");
    expect(noteRow).not.toBeNull();
    expect(noteRow!.highlightId).toBe("hl-rt-beta");

    // The location row (compound [articleId+revision] array key).
    const locationRow = await readRow(pageB, "location", [PASTE_ARTICLE.id, 1]);
    expect(locationRow).not.toBeNull();
    expect(locationRow!.graphemeOffset).toBe(42);

    // Preferences applied on the fresh machine (applyPreferencesDefault true
    // because machine B had no reader-prefs row).
    const prefsRow = await readRow(pageB, "settings", "reader-prefs");
    expect(prefsRow).not.toBeNull();
    expect((prefsRow!.value as { theme: string }).theme).toBe("dark");

    // The fixture-backed highlight row is present on machine B.
    const fixtureHlRow = await readRow(pageB, "highlights", "hl-rt-fixture");
    expect(fixtureHlRow).not.toBeNull();

    // ── The ANNO rendering surface: the fixture-backed highlight renders a
    // visible mark in the reader on machine B. Switch to scrolling first so
    // the entire article body mounts (paginated mode renders only the
    // current fragment — the anchored passage may not be on page 1).
    await pageB.keyboard.press("Escape"); // close the settings panel
    await expect(panelB).not.toBeVisible();
    await pageB.goto(`${BASE}/#/article/${fixtureArticle!.id}`);
    await expect(pageB.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    const modeToggle = pageB.getByRole("button", { name: /^Reading mode:/ });
    await modeToggle.click(); // paginated → scrolling (imported prefs)
    await expect(modeToggle).toHaveAttribute("aria-label", "Reading mode: scrolling");
    await expect(
      pageB.locator('mark.highlight[data-highlight-id="hl-rt-fixture"]'),
      "the fixture-backed highlight must render a visible mark on machine B",
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await machineA.close();
    await machineB.close();
  }
});

// ── Phase 12 (12-07 Task 2): the BOOK round trip at book granularity ─────────
//
// Machine A uploads a real EPUB through the whole intake pipeline (the
// in-test generator builder — the 12-05 SC#1 discipline), highlights a
// passage of chapter 2 (Node-derived confident anchor over the SAVED
// chapter row — the byte-equality substrate), saves a mid-article reading
// position, and exports. Machine B imports: the book groups with ALL its
// chapters, the chapter-2 highlight re-resolves confident and renders at
// the same offset, the traveled location surfaces as the book-level
// Continue-Reading entry, and a re-export from B is deterministic
// (identical SHA-256 manifest blocks — only exportedAt moves).

test("SC#4 books — a book travels machines with its chapters + highlight intact", async ({
  browser,
}) => {
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // ── Machine A: upload the book through the REAL picker + pipeline ─────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);
    await openAddDialog(pageA);
    await pickSource(pageA, "file");
    await pageA.locator("input#ingest-file").setInputFiles({
      name: "the-synthetic-book.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from(validBookEpub3()),
    });
    await pageA.getByRole("button", { name: /add file/i }).click();
    // Plan 16-03 (D16-12): book success closes the dialog and the row
    // appears via refreshKey — the durable success signal.
    await expect(pageA.locator("li.book-row")).toBeVisible({ timeout: 15_000 });

    // ── Machine A: read the saved chapters, highlight chapter 2 ───────────
    // The chapter rows are raw Dexie rows; parse the chapter-2 row through
    // ArticleSchema in Node so the anchor derivation runs over EXACTLY the
    // text machine B will hold after import.
    const savedArticles = await readAllRows(pageA, "articles");
    const chapterRows = savedArticles.filter(
      (r) => (r as { ingestionMeta?: { chapterIndex?: number } }).ingestionMeta
        ?.chapterIndex !== undefined,
    );
    expect(chapterRows, "the uploaded book must have saved chapter articles").toHaveLength(4);
    const chapter2Row = chapterRows.find(
      (r) =>
        (r as { ingestionMeta?: { chapterIndex?: number } }).ingestionMeta
          ?.chapterIndex === 1,
    );
    expect(chapter2Row, "chapter 2 (chapterIndex 1) must exist").toBeDefined();
    const chapter2 = ArticleSchema.parse(chapter2Row!) as CanonicalArticle;
    const chapter2Id = chapter2.id;
    const anchorChapter2 = confidentHighlightOn(chapter2);

    // A mid-article reading position on chapter 2 — the traveled location
    // the book-level Continue-Reading entry resumes (D12-02/D12-07).
    const chapter2Location = {
      schemaVersion: 1,
      articleId: chapter2Id,
      revision: 1,
      graphemeOffset: 12,
      savedAt: "2026-08-16T00:00:00.000Z",
    };
    await seedRows(pageA, {
      highlights: [highlightRow(chapter2Id, anchorChapter2, "hl-rt-chapter")],
      locations: [chapter2Location],
    });

    // ── Machine A: export the whole library ───────────────────────────────
    const panelA = await openSettings(pageA);
    await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromiseA = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const downloadA = await downloadPromiseA;
    const bundlePathA = await downloadA.path();
    expect(bundlePathA, "download must be persisted to disk").toBeTruthy();

    // ── Node-side bundle inspection: books ride v4 ────────────────────────
    // (writers emit 4 since Phase 20 — 20-05; the same version-bump
    // assertion-update precedent as the base flow's envelope check above.)
    const { bundle: bundleA } = readBundleJson(bundlePathA!);
    expect(bundleA.schemaVersion).toBe(4);
    const booksA = bundleA.books as Array<Record<string, unknown>>;
    expect(booksA).toHaveLength(1);
    expect(booksA[0]?.title).toBe("The Synthetic Book");
    expect(booksA[0]?.source).toBe("epub-upload");
    const bookId = booksA[0]?.id as string;
    const chapterArticleIds = booksA[0]?.chapterArticleIds as string[];
    expect(chapterArticleIds).toHaveLength(4);

    // Chapters ride articles as ordinary articles — ingestionMeta.bookId
    // survives serialization (the grouping FK machine B re-groups on).
    const articlesA = bundleA.articles as Array<{
      id: string;
      ingestionMeta?: { bookId?: string; chapterIndex?: number };
    }>;
    expect(articlesA.map((a) => a.id).sort()).toEqual([...chapterArticleIds].sort());
    for (const a of articlesA) {
      expect(a.ingestionMeta?.bookId).toBe(bookId);
    }

    // ── Machine B: import through the real UI ─────────────────────────────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePathA!);

    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 4 articles, 1 highlight, 0 notes, and 1 reading position.",
    );

    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 4 articles, 1 highlight, 0 notes, and 1 reading position.",
      { timeout: 15_000 },
    );

    // ── Machine B: raw IndexedDB truth ────────────────────────────────────
    // The book row traveled with its identity intact (title, TOC, hash).
    const bookRowB = await readRow(pageB, "books", bookId);
    expect(bookRowB).not.toBeNull();
    expect(bookRowB!.title).toBe("The Synthetic Book");
    expect(bookRowB!.originalFileHash).toBe(booksA[0]?.originalFileHash);
    expect(bookRowB!.chapterArticleIds).toEqual(chapterArticleIds);

    // Every chapter landed carrying BOTH bookId forms: the canonical
    // ingestionMeta FK and the top-level v5 index stamp (index-uniform with
    // saveBook rows — the 12-03 contract holds on the receiving machine).
    for (const chapterId of chapterArticleIds) {
      const row = await readRow(pageB, "articles", chapterId);
      expect(row, `chapter ${chapterId} must exist on machine B`).not.toBeNull();
      expect((row as { bookId?: string }).bookId).toBe(bookId);
      expect(
        (row as { ingestionMeta?: { bookId?: string } }).ingestionMeta?.bookId,
      ).toBe(bookId);
    }

    // The chapter-2 highlight offsets are byte-equal (the byte-equality
    // assertion pattern — the re-resolution substrate traveled intact).
    const hlRowB = await readRow(pageB, "highlights", "hl-rt-chapter");
    expect(hlRowB).not.toBeNull();
    expect((hlRowB!.position as { start: number }).start).toBe(
      anchorChapter2.position.start,
    );
    expect((hlRowB!.position as { end: number }).end).toBe(
      anchorChapter2.position.end,
    );

    // The traveled location is byte-equal too.
    const locationRowB = await readRow(pageB, "location", [chapter2Id, 1]);
    expect(locationRowB).not.toBeNull();
    expect(locationRowB!.graphemeOffset).toBe(chapter2Location.graphemeOffset);

    // ── Machine B: the library groups the book with ALL its chapters ──────
    await pageB.keyboard.press("Escape"); // close the settings panel
    await expect(panelB).not.toBeVisible();
    await pageB.reload(); // LibraryView loads once per mount (08-05 precedent)
    await expect(
      pageB.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    const bookRow = pageB.locator("li.book-row");
    await expect(bookRow).toHaveCount(1);
    await expect(
      bookRow.getByRole("heading", { level: 2, name: "The Synthetic Book" }),
    ).toBeVisible();
    await bookRow.locator(".book-toggle").click();
    await expect(bookRow.locator(".book-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(bookRow.locator(".book-chapter-list > li")).toHaveCount(4);

    // The traveled location surfaces as the ONE book-level strip entry —
    // "BookTitle — Chapter N of M" resuming the last-read chapter (D12-02).
    await expect(
      pageB.locator(".continue-reading-strip").getByRole("link", {
        name: "The Synthetic Book — Chapter 2 of 4",
      }),
    ).toBeVisible({ timeout: 10_000 });

    // ── The chapter-2 highlight renders a visible mark on machine B ───────
    await pageB.goto(`${BASE}/#/article/${chapter2Id}`);
    await expect(pageB.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    const modeToggleB = pageB.getByRole("button", { name: /^Reading mode:/ });
    await modeToggleB.click(); // paginated → scrolling so the whole body mounts
    await expect(modeToggleB).toHaveAttribute("aria-label", "Reading mode: scrolling");
    await expect(
      pageB.locator('mark.highlight[data-highlight-id="hl-rt-chapter"]'),
      "the chapter-2 highlight must render a visible mark on machine B",
    ).toBeVisible({ timeout: 15_000 });

    // Return to the traveled reading mode before re-exporting — the mode
    // toggle PERSISTS readingMode, and B's re-export must reflect the
    // library that traveled (the imported preferences), not the viewing
    // detour the mark assertion took.
    await modeToggleB.click(); // scrolling → paginated (the imported default)
    await expect(modeToggleB).toHaveAttribute("aria-label", "Reading mode: paginated");

    // ── Deterministic re-export from machine B ────────────────────────────
    // B's library is exactly what traveled; a fresh export of it hashes
    // identically (manifest blocks equal; only exportedAt moves).
    const panelB2 = await openSettings(pageB);
    const downloadPromiseB = pageB.waitForEvent("download", { timeout: 20_000 });
    await panelB2.getByRole("button", { name: "Export library bundle" }).click();
    const downloadB = await downloadPromiseB;
    const bundlePathB = await downloadB.path();
    const { bundle: bundleB } = readBundleJson(bundlePathB!);

    const parsedA = ExportBundleSchema.parse(bundleA);
    const parsedB = ExportBundleSchema.parse(bundleB);
    const { exportedAt: _atA, ...restA } = parsedA;
    const { exportedAt: _atB, ...restB } = parsedB;
    expect(restB).toEqual(restA);
    expect(await computeManifest(parsedB)).toEqual(await computeManifest(parsedA));
  } finally {
    await machineA.close();
    await machineB.close();
  }
});

// ── Phase 12 (12-07 Task 2): the never-break-older-bundles gate ──────────────
//
// A Phase 9 v1 bundle (synthesized through the same schema self-check the
// real exporter runs — byte-indistinguishable at the validation boundary)
// imports EXACTLY as before: articles/highlights land, the books store
// gains nothing.

test("SC#4 v1-compat — a v1 bundle (no books) imports exactly as before with zero books", async ({
  browser,
}) => {
  const machine = await browser.newContext();
  try {
    const page = await machine.newPage();
    await prepareFreshPage(page);

    // The Phase 9 v1 envelope: schemaVersion 1, NO books key.
    const V1_ARTICLE = makeArticle({
      id: "paste-v1compat0001",
      title: "V1 Compat Article",
      paragraphs: [
        "A Phase 9 shaped bundle carries five record blocks and no books array. This article proves the union read keeps the older generation importable byte-for-byte.",
        "A second paragraph gives the resolver unique material so the anchored passage is unambiguous.",
      ],
    });
    const anchor = confidentHighlightOn(V1_ARTICLE);
    const v1Bundle = await buildBundleZip({
      schemaVersion: 1 as const,
      exportedAt: "2026-08-15T00:00:00.000Z",
      appVersion: "test",
      articles: [V1_ARTICLE],
      locations: [],
      highlights: [highlightRow(V1_ARTICLE.id, anchor, "hl-v1-compat")],
      notes: [],
      preferences: {
        schemaVersion: 2 as const,
        font: "serif" as const,
        size: 18 as const,
        measure: 58 as const,
        spacing: "comfortable" as const,
        theme: "sepia" as const,
        readingMode: "paginated" as const,
      },
      fixtureIds: [],
    });

    const panel = await openSettings(page);
    await panel
      .locator('input[type="file"][accept=".zip"]')
      .setInputFiles({
        name: "lem-reader-bundle-v1.zip",
        mimeType: "application/zip",
        buffer: v1Bundle,
      });

    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText("This bundle contains 1 article, 1 highlight");
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(page)).toContainText(
      "Imported 1 article, 1 highlight",
      { timeout: 15_000 },
    );

    // Exactly as before: the article + highlight landed…
    expect(await readRow(page, "articles", V1_ARTICLE.id)).not.toBeNull();
    expect(await readRow(page, "highlights", "hl-v1-compat")).not.toBeNull();
    // …and the books store gained NOTHING (the v1 shape has no books).
    expect(await countRows(page, "books")).toBe(0);
  } finally {
    await machine.close();
  }
});

// ── Phase 17 (17-05 Task 2): the OVERRIDE round trip inside a v3 bundle ───────
//
// Machine A edits an article's title + author through the REAL edit dialog
// (the single override write path), exports, and machine B imports: the
// bundle's bundle.json carries schemaVersion 3 with the article's
// readerTitle/readerAuthor riding the article record (D17-12), and B's raw
// IndexedDB row equals A's override values byte-for-byte with the library
// row showing the one effective name (META-04 round-trip). A second article
// WITHOUT overrides round-trips unchanged — neither override key ever
// appears on its exported record or its imported row (the regression cell).

/** The article machine A renames. Carries ingestionMeta so the library row
 * renders the edit affordance (the 17-02 ingestionMeta gate). */
const OVERRIDE_RT_ARTICLE = {
  ...makeArticle({
    id: "paste-rt17meta01",
    title: "Round Trip Override Article",
    author: "Original RT Author",
    paragraphs: [
      "The first paragraph of the override round trip article. Machine A renames this piece through the edit dialog and the reader-owned name must travel to machine B inside the versioned bundle without a single byte of drift.",
      "The second paragraph provides unique material so no anchored passage can ever collide with another article in the normalized stream during any future resolution pass.",
      "The third paragraph closes the corpus with the reminder that overrides ride the article record itself — there is no separate override block in the bundle.",
    ],
  }),
  ingestionMeta: {
    source: "paste",
    origin: "paste",
    originalHtmlHash: `sha256:${"2".repeat(64)}`,
    extractionConfidence: "high",
    extractionWarnings: [],
  },
};

/** The article NOBODY renames — the no-override regression companion. */
const PLAIN_RT_ARTICLE = makeArticle({
  id: "md-rt17plain02",
  title: "Round Trip Plain Article",
  sourceUrl: "https://example.org/rt-plain",
  author: "Plain RT Author",
  paragraphs: [
    "The first paragraph of the plain round trip companion. It is never renamed; its exported record must carry neither override key and its imported row must stay override-free.",
    "A second paragraph supplies the unique material every seeded article carries so resolution machinery never confuses passages across articles.",
  ],
});

const A_RENAMED_TITLE = "Machine A Renamed Title";
const A_RENAMED_AUTHOR = "Machine A Author";

test("SC#4 overrides — an edited title/author travels machines byte-equal inside a v4 bundle", async ({
  browser,
}) => {
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // ── Machine A: seed, then rename through the REAL edit dialog ──────────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);
    await seedRows(pageA, {
      articles: [OVERRIDE_RT_ARTICLE, PLAIN_RT_ARTICLE],
    });
    // LibraryView loads once per mount (08-05) — reload so the seeded rows
    // render before the dialog drive.
    await pageA.goto(`${BASE}/#/`);
    await pageA.reload();
    await expect(
      pageA.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      pageA.locator(`#title-${OVERRIDE_RT_ARTICLE.id}`),
    ).toHaveText("Round Trip Override Article");

    const editRow = pageA
      .locator(".library-list > li")
      .filter({ hasText: "Round Trip Override Article" });
    await editRow.locator(".library-row-edit").click();
    const editDialog = pageA.locator("dialog.edit-metadata");
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole("textbox", { name: /^Title$/ }).fill(A_RENAMED_TITLE);
    await editDialog.getByRole("textbox", { name: /^Author$/ }).fill(A_RENAMED_AUTHOR);
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).not.toBeVisible();
    // The row immediately re-derives on save (the 17-02 refreshKey).
    await expect(pageA.locator(`#title-${OVERRIDE_RT_ARTICLE.id}`)).toHaveText(
      A_RENAMED_TITLE,
    );

    // ── Machine A: export through the real UI ──────────────────────────────
    const panelA = await openSettings(pageA);
    await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node-side bundle inspection: the overrides ride the record (v4
    // envelope since 20-05 — the version-bump assertion-update precedent).
    const { bundle: bundleJson } = readBundleJson(bundlePath!);
    expect(bundleJson.schemaVersion).toBe(4);
    const exportedArticles = bundleJson.articles as Array<Record<string, unknown>>;
    expect(exportedArticles.map((a) => a.id).sort()).toEqual(
      [OVERRIDE_RT_ARTICLE.id, PLAIN_RT_ARTICLE.id].sort(),
    );
    const overrideExported = exportedArticles.find(
      (a) => a.id === OVERRIDE_RT_ARTICLE.id,
    );
    expect(overrideExported?.readerTitle).toBe(A_RENAMED_TITLE);
    expect(overrideExported?.readerAuthor).toBe(A_RENAMED_AUTHOR);
    // The no-override companion carries NEITHER key (regression cell).
    const plainExported = exportedArticles.find(
      (a) => a.id === PLAIN_RT_ARTICLE.id,
    );
    expect(
      Object.prototype.hasOwnProperty.call(plainExported, "readerTitle"),
      "plain article must export without a readerTitle key",
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(plainExported, "readerAuthor"),
      "plain article must export without a readerAuthor key",
    ).toBe(false);

    // ── Machine B: import through the real UI ──────────────────────────────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);

    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 2 articles, 0 highlights, 0 notes, and 0 reading positions.",
    );
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 2 articles, 0 highlights, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );

    // ── Machine B: raw IndexedDB truth — byte-equal override carriage ──────
    const bOverrideRow = await readRow(pageB, "articles", OVERRIDE_RT_ARTICLE.id);
    expect(bOverrideRow, "the renamed article must land on machine B").not.toBeNull();
    expect(bOverrideRow!.readerTitle).toBe(A_RENAMED_TITLE);
    expect(bOverrideRow!.readerAuthor).toBe(A_RENAMED_AUTHOR);
    // The canonical provenance stays canonical underneath (META-01 layering).
    const bProvenance = (bOverrideRow!.provenance ?? {}) as {
      title?: string;
      author?: string;
    };
    expect(bProvenance.title).toBe("Round Trip Override Article");
    expect(bProvenance.author).toBe("Original RT Author");
    // The plain companion imported with NO override keys.
    const bPlainRow = await readRow(pageB, "articles", PLAIN_RT_ARTICLE.id);
    expect(bPlainRow).not.toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(bPlainRow, "readerTitle"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(bPlainRow, "readerAuthor"),
    ).toBe(false);

    // ── Machine B: the library row shows the one effective name ────────────
    await pageB.keyboard.press("Escape"); // close the settings panel
    await expect(panelB).not.toBeVisible();
    await pageB.reload(); // LibraryView loads once per mount (08-05)
    await expect(
      pageB.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(pageB.locator(`#title-${OVERRIDE_RT_ARTICLE.id}`)).toHaveText(
      A_RENAMED_TITLE,
    );
    await expect(pageB.locator(`#title-${PLAIN_RT_ARTICLE.id}`)).toHaveText(
      "Round Trip Plain Article",
    );
  } finally {
    await machineA.close();
    await machineB.close();
  }
});

// ── Phase 19 (Plan 19-05 Task 2 item 7): the SPAN round trip (ANNO-10 import
// leg + D19-12 multi-line carriage). A cross-block highlight — whose
// quote.exact genuinely contains BLOCK_SEPARATOR newlines — exports inside
// the library bundle and imports into a clean profile as ONE record with
// the embedded separators preserved byte-for-byte, re-anchoring confident
// (marks at the same text in BOTH blocks, no .unresolved modifier).

/** The article machine A's span crosses (short paragraphs so the anchored
 * window provably spans a block boundary). */
const SPAN_RT_ARTICLE = makeArticle({
  id: "paste-rt19span01",
  title: "Round Trip Span Article",
  paragraphs: [
    "The first paragraph opens the span article with prose that no other paragraph repeats anywhere in the corpus stream.",
    "The second paragraph receives the crossing end of the anchored span so the stored quote genuinely carries a block break.",
    "A third paragraph supplies trailing uniqueness material so the resolver never confuses the anchored passage with another.",
  ],
});

/**
 * A derived-and-verified confident CROSS-BLOCK anchor: the window spans a
 * BLOCK_SEPARATOR, so quote.exact is genuinely multi-line. Derives through
 * the SHIPPED deriveQuoteSelector + resolveQuoteSelector machinery (the
 * confidentHighlightOn discipline — never a forked offset computation).
 */
function confidentSpanOn(
  article: CanonicalArticle,
): { position: TextPositionSelector; quote: TextQuoteSelector } {
  const normalized = normalizeText(article);
  const total = graphemeLength(article);
  let sep = normalized.indexOf(BLOCK_SEPARATOR);
  while (sep !== -1) {
    const start = Math.max(0, sep - 24);
    const end = Math.min(total, sep + 24);
    if (end > start + 8) {
      const position = { start, end };
      const quote = deriveQuoteSelector(article, position);
      const resolved = resolveQuoteSelector(article, quote, position);
      if (
        typeof resolved === "object" &&
        quote.exact.includes(BLOCK_SEPARATOR)
      ) {
        return { position, quote };
      }
    }
    sep = normalized.indexOf(BLOCK_SEPARATOR, sep + 1);
  }
  throw new Error(`no confident cross-block passage found for ${article.id}`);
}

test("SC#4 spans — a cross-block highlight travels machines as ONE record with multi-line quote.exact intact", async ({
  browser,
}) => {
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // ── Machine A: seed the article + the cross-block span ──────────────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);
    const anchorSpan = confidentSpanOn(SPAN_RT_ARTICLE);
    // The anchor is honest about being multi-line before it ever travels.
    expect(anchorSpan.quote.exact.includes(BLOCK_SEPARATOR)).toBe(true);
    await seedRows(pageA, {
      articles: [SPAN_RT_ARTICLE],
      highlights: [highlightRow(SPAN_RT_ARTICLE.id, anchorSpan, "hl-rt-span")],
    });

    // ── Machine A: export through the real UI ──────────────────────────
    const panelA = await openSettings(pageA);
    await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node-side bundle inspection: the multi-line exact rides verbatim ─
    const { bundle: bundleJson } = readBundleJson(bundlePath!);
    const highlightsOut = bundleJson.highlights as Array<{
      id: string;
      quote: { exact: string };
    }>;
    expect(highlightsOut).toHaveLength(1);
    expect(highlightsOut[0]?.id).toBe("hl-rt-span");
    expect(
      highlightsOut[0]?.quote.exact.includes(BLOCK_SEPARATOR),
      "the exported quote.exact preserves the embedded block separator (D19-12 carriage)",
    ).toBe(true);
    expect(highlightsOut[0]?.quote.exact).toBe(anchorSpan.quote.exact);

    // ── Machine B: import through the real UI (clean profile) ───────────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);
    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 1 article, 1 highlight",
    );
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 1 article, 1 highlight",
      { timeout: 15_000 },
    );

    // ── Machine B: raw IndexedDB truth — ONE record, separators intact ──
    expect(await countRows(pageB, "highlights")).toBe(1);
    const spanRow = await readRow(pageB, "highlights", "hl-rt-span");
    expect(spanRow).not.toBeNull();
    expect((spanRow!.quote as { exact: string }).exact).toBe(
      anchorSpan.quote.exact,
    );
    expect(
      (spanRow!.quote as { exact: string }).exact.includes(BLOCK_SEPARATOR),
      "the imported quote.exact still carries the block separators",
    ).toBe(true);
    expect((spanRow!.position as { start: number }).start).toBe(
      anchorSpan.position.start,
    );
    expect((spanRow!.position as { end: number }).end).toBe(
      anchorSpan.position.end,
    );

    // ── Machine B: the span re-anchors CONFIDENT and renders in BOTH ────
    // blocks. Marks render only for resolvedPosition !== null; the ABSENCE
    // of the .unresolved modifier is the confident proof (ambiguous/orphan
    // render the dashed outline — ANNO-07, never silent).
    await pageB.keyboard.press("Escape"); // close the settings panel
    await expect(panelB).not.toBeVisible();
    await pageB.goto(`${BASE}/#/article/${SPAN_RT_ARTICLE.id}`);
    await expect(pageB.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    const modeToggle = pageB.getByRole("button", { name: /^Reading mode:/ });
    await modeToggle.click(); // paginated → scrolling (whole body mounts)
    await expect(modeToggle).toHaveAttribute("aria-label", "Reading mode: scrolling");
    const spanMarks = pageB.locator('mark.highlight[data-highlight-id="hl-rt-span"]');
    await expect(spanMarks.first()).toBeVisible({ timeout: 15_000 });
    expect(
      await spanMarks.count(),
      "the cross-block span renders marks in BOTH blocks",
    ).toBeGreaterThanOrEqual(2);
    expect(
      await spanMarks.first().getAttribute("class"),
      "re-anchored confident — no unresolved modifier",
    ).not.toContain("unresolved");
  } finally {
    await machineA.close();
    await machineB.close();
  }
});

// ── Phase 20 (20-05): the ASSET round trip (IMG-04) ──────────────────────────
//
// Machine A seeds an article whose figure carries a local asset ref PLUS the
// matching Dexie asset row (raw IndexedDB put of a real browser Blob — the
// 09-06 raw-row seeding precedent, extended to the v6 assets store), then
// exports through the real UI. Node-side inspection proves the v4 envelope:
// honest per-asset sha256/byteLength metadata + the RAW zip entry
// byte-equal. Machine B imports through the real UI; the raw-row truth
// asserts B's Dexie holds the asset with byte-equal blob bytes (read
// browser-side — Blobs never cross the evaluate channel), and the reader
// renders the figure from the LOCAL object URL (naturalWidth > 0 — decode,
// not layout; the 20-04 happy-path precedent).

/** A 1x1 transparent PNG — real decoder-valid bytes shared with the unit
 * corpus (bundle-v4.spec.ts pins the same base64). */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const ASSET_RT_ARTICLE_ID = "paste-rt20asset1";
const ASSET_RT_ASSET_ID = "img-0123456789ab";
const ASSET_RT_ENTRY = `assets/${ASSET_RT_ARTICLE_ID}/${ASSET_RT_ASSET_ID}`;

const ASSET_RT_ARTICLE = ArticleSchema.parse({
  id: ASSET_RT_ARTICLE_ID,
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.org/asset-round-trip",
    title: "Asset Round Trip Article",
    author: "Ada Asset",
    retrievedAt: "2026-08-31T00:00:00.000Z",
    originalHtmlHash: `sha256:${"7".repeat(64)}`,
  },
  blocks: [
    {
      kind: "paragraph",
      content: [
        {
          text: "A paragraph precedes the figure so the article reads as prose before its image.",
          marks: [],
        },
      ],
    },
    {
      kind: "figure",
      alt: "A tiny transparent square riding the bundle",
      src: `asset:${ASSET_RT_ASSET_ID}`,
      originalSrc: "https://example.org/tiny.png",
      width: 1,
      height: 1,
    },
  ],
  footnotes: [],
});

test("SC#4 assets — an article's images travel machines byte-equal and render locally (IMG-04)", async ({
  browser,
  browserName,
}) => {
  // Phase 20 (20-05): engine-boundary skip, honestly documented (the
  // ssrf-matrix residual-skip precedent). The Playwright WebKit build
  // cannot store ANY Blob VALUE in IndexedDB — every construction variant
  // (view/ArrayBuffer/string/fetch-body) fails the put with UnknownError
  // "Error preparing Blob/File data to be stored in object store", while
  // raw Uint8Array/ArrayBuffer values put fine (probe-verified
  // 2026-08-31). Both this cell's seed AND its import require the D20-15
  // `data: Blob` row shape, so webkit cannot exercise the flow. Chromium
  // + firefox prove the full asset round-trip; real Safari supports IDB
  // Blob storage (Safari 10+) — deferred-items.md records the open
  // option for the 20-07 gate owner.
  test.skip(
    browserName === "webkit",
    "WebKit engine boundary: Playwright's WebKit cannot put Blob values into IndexedDB (UnknownError) — chromium/firefox carry the proof",
  );
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    const pngBytes = new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64"));

    // ── Machine A: seed the article + its asset row, then export ─────────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);
    await seedRows(pageA, {
      articles: [ASSET_RT_ARTICLE as unknown as Record<string, unknown>],
      assets: [
        {
          articleId: ASSET_RT_ARTICLE_ID,
          assetId: ASSET_RT_ASSET_ID,
          contentType: "image/png",
          byteLength: pngBytes.byteLength,
          dataBytes: Array.from(pngBytes),
          createdAt: "2026-08-31T00:00:00.000Z",
        },
      ],
    });

    const panelA = await openSettings(pageA);
    await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lem-reader-bundle-v1.zip");
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node-side bundle inspection: the v4 asset envelope ───────────────
    const { bundle: bundleJson, entries } = readBundleJson(bundlePath!);
    expect(bundleJson.schemaVersion).toBe(4);
    const meta = bundleJson.assets as Array<Record<string, unknown>>;
    expect(meta).toHaveLength(1);
    expect(meta[0]).toMatchObject({
      articleId: ASSET_RT_ARTICLE_ID,
      assetId: ASSET_RT_ASSET_ID,
      contentType: "image/png",
      byteLength: pngBytes.byteLength,
      entry: ASSET_RT_ENTRY,
    });
    expect(meta[0]!.sha256).toBe(await sha256Hex(pngBytes));
    // The raw entry rode the SAME zipSync call, byte-equal.
    const entryBytes = entries[ASSET_RT_ENTRY];
    expect(entryBytes, "the asset zip entry must exist").toBeDefined();
    expect(Array.from(entryBytes!)).toEqual(Array.from(pngBytes));

    // ── Machine B: import through the real UI ────────────────────────────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);

    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 1 article, 0 highlights, 0 notes, and 0 reading positions.",
    );
    // The asset rode — no dangling warning on this bundle.
    await expect(preview).not.toContainText("will be skipped because");
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 1 article, 0 highlights, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );

    // ── Machine B: raw IndexedDB truth — byte-equal blob bytes ───────────
    const rowField = await readRow(pageB, "assets", [ASSET_RT_ARTICLE_ID, ASSET_RT_ASSET_ID]);
    expect(rowField, "the asset row must exist on machine B").not.toBeNull();
    expect(rowField!.byteLength).toBe(pngBytes.byteLength);
    expect(rowField!.contentType).toBe("image/png");
    // Blobs never cross the evaluate channel — read the bytes browser-side
    // and compare as number arrays (the 09-06 raw-row byte-equality
    // precedent, extended to assets).
    const storedBytes = await pageB.evaluate(
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
      { articleId: ASSET_RT_ARTICLE_ID, assetId: ASSET_RT_ASSET_ID },
    );
    expect(storedBytes).toEqual(Array.from(pngBytes));

    // ── Machine B: the figure renders the LOCAL img ──────────────────────
    await pageB.keyboard.press("Escape"); // close the settings panel
    await expect(panelB).not.toBeVisible();
    await pageB.goto(`${BASE}/#/article/${ASSET_RT_ARTICLE_ID}`);
    await expect(pageB.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    const modeToggle = pageB.getByRole("button", { name: /^Reading mode:/ });
    await modeToggle.click(); // paginated → scrolling so the whole body mounts
    await expect(modeToggle).toHaveAttribute("aria-label", "Reading mode: scrolling");
    const img = pageB.locator("figure img");
    await expect(img).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () =>
          await img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    expect(await img.getAttribute("src")).toMatch(/^blob:/);
  } finally {
    await machineA.close();
    await machineB.close();
  }
});
