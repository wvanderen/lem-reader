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
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest } from "../../../src/portability/manifest";
import { validBookEpub3 } from "../../unit/server/epub-fixtures";
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

    // Versioned envelope (PORT-01) — writers emit v2 since Phase 12 (12-07),
    // always carrying the books field (empty on a book-free library).
    expect(bundleJson.schemaVersion).toBe(2);
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
    await pageA.locator("input#ingest-file").setInputFiles({
      name: "the-synthetic-book.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from(validBookEpub3()),
    });
    await pageA.getByRole("button", { name: /add file/i }).click();
    await expect(
      pageA.locator(".ingest-control .status").filter({
        hasText: "Book added to your library.",
      }),
    ).toBeVisible({ timeout: 15_000 });

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

    // ── Node-side bundle inspection: books ride v2 ────────────────────────
    const { bundle: bundleA } = readBundleJson(bundlePathA!);
    expect(bundleA.schemaVersion).toBe(2);
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
