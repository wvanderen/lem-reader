// tests/e2e/library/markdown-upload.spec.ts
// Plan 08-05 Task 1 — SC#4 + ING-03 phase-exit e2e gate. Proves the .md
// file-upload intake path (D8-15, D8-17, D8-18) end-to-end through the real
// Vite Node middleware: YAML front-matter → markdownToBlocks → ArticleSchema
// → md-<shortHash> id → Dexie save → ArticleView open. Also covers the
// dedupe-refuse path (re-upload identical content) and the .html upload
// variant.
//
// Harness (cloned from happy-path.spec.ts):
//   - BASE URL:    http://localhost:5173 (Vite Node dev server with the
//                  /api/ingest middleware serving the full /server pipeline)
//   - beforeEach:  image-stub route + IndexedDB wipe (first-run state)
//   - file upload: setInputFiles with a Buffer (the only Playwright-native
//                  way to attach in-memory file content)
//
// Plan 08-01 + 08-04 contract:
//   - The .md dispatch forwards file.name through ingestMarkdown(text, file.name)
//     so the server can run the D8-17 title fallback chain:
//       front-matter.title ?? stripMarkdownExtension(filename) ?? "Markdown document"
//   - The id is md-<shortHash(canonical content)> (D8-18) — content-hash, NOT
//     filename. Two uploads of identical .md produce the same id → dedupe-
//     refuse mirrors D7-07.
//   - SourceBadge.tsx badgeLabel("markdown") returns "Markdown"; badgeLabel
//     ("html-upload") returns "HTML file".
//   - The client-side 5MB cap refuses oversized files via the EXISTING
//     "This page is too large." copy (T-8-14).
//
// Threat register:
//   - T-8-15 (Tampering, file-extension spoofing) → dispatch-by-extension
//     only chooses the adapter; both adapters run ArticleSchema.parse +
//     assertRoundTripAnchor identically. A `.html` mis-dispatched to markdown
//     produces escaped HTML blocks which the round-trip gate catches.
//   - T-8-19 (Repudiation, false-positive verification) → the dedupe-refuse
//     test asserts BOTH the .status copy ("Already in your library.") AND
//     the row count (no new row appeared).
import { test, expect } from "@playwright/test";
// Plan 13-06 (Option A): the representative .md payload now lives in the
// non-spec helper ./markdown-payload.ts so the ACPT-06 core-flow spine
// reuses the PROVEN bytes without re-registering this spec's cells
// (REUSE-DO-NOT-FORK — both import-from-spec forms were empirically
// rejected; see the spine's header for the probes).
import { MARKDOWN_WITH_FRONTMATTER } from "./markdown-payload";

const BASE = "http://localhost:5173";

// A .md payload WITHOUT YAML front-matter. The D8-17 title-fallback chain
// falls through to stripMarkdownExtension(filename) → neutral title. The
// article still ingests (front-matter is optional).
const MARKDOWN_NO_FRONTMATTER = `# A Plain Markdown Document

This markdown file has no YAML front-matter. The D8-17 title fallback chain
runs in server/ingest.ts: provenancePartial.title is undefined (no
front-matter), so the server falls through to stripMarkdownExtension(filename)
and then to the neutral default "Markdown document". The article still
ingests and reads identically to a fixture in ArticleView.

The second paragraph continues the long-form prose. The reading engine
cannot tell this markdown-derived article from a fixture or an ingested URL.
The library surfaces it under the same Saved articles heading, the same
per-row structure, and the same open-article gesture as any other article.

The third paragraph closes the corpus. The reader who reaches this article
via #/article/<id> sees the same h1 + paragraph structure, the same reading-
mode toggle, the same annotation toolbar, and the same scroll or paginate
behavior as a bundled v1.0 fixture. The markdown adapter produces the same
CanonicalArticle shape as the html adapter and the URL fetch pipeline.
`;

// A small .html payload for the .html upload variant (D8-15). The file
// extension triggers the html-upload dispatch; htmlToBlocks derives the
// title from the <title> tag.
const SMALL_HTML_UPLOAD = `<!DOCTYPE html>
<html><head><title>An HTML Upload Variant</title></head>
<body>
<article>
<h1>An HTML Upload Variant</h1>
<p>A small HTML upload exercising the .html dispatch branch (D8-15). The
extension triggers htmlToBlocks directly; title derives from the title tag.
Long enough to clear the ING-06 confidence threshold for the round-trip
anchor gate to sample five confident offsets.</p>
<p>The second paragraph is here so the block count comfortably exceeds the
floor. The reading engine treats this article identically to a paste-HTML
ingestion; only the source-badge variant differs ("HTML file" vs "Pasted").</p>
<p>The third paragraph closes out the small HTML payload. Phase 8's library
surfaces the article without distinguishing its origin except via the quiet
source badge underneath the title.</p>
</article>
</body></html>`;

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Wipe the lem-reader IndexedDB before each test so each test starts from
  // a first-run state (happy-path.spec.ts L73-83 wipe pattern).
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});

test.describe("SC#4 + ING-03 — markdown + html upload intake", () => {
  test(".md upload with front-matter → md-<id> → ArticleView renders title + body", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // Attach the .md file via setInputFiles (the only Playwright-native way
    // to attach in-memory file content).
    const fileInput = page.locator("input#ingest-file");
    await fileInput.setInputFiles({
      name: "calm-reading.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(MARKDOWN_WITH_FRONTMATTER, "utf-8"),
    });

    // Click "Add file" — the submitting state announces "Reading file…"
    // (UI-SPEC §Copywriting — verb + object, mirrors "Fetching article…").
    await page.getByRole("button", { name: /add file/i }).click();
    await expect(
      page.locator(".ingest-control .status").filter({ hasText: "Reading file…" }),
    ).toBeVisible();

    // Navigation lands at #/article/<id> where <id> starts with "md-"
    // (D8-18 — content-hash slug).
    await page.waitForURL(/#\/article\/md-/, { timeout: 15_000 });

    // The ArticleView heading matches the front-matter `title:` field
    // (D8-17 — YAML recognized as metadata). The ArticleView header renders
    // provenance.title as <h1>, and the markdown body's `# heading` also
    // renders as an <h1> block — use .first() to scope to the header title
    // (it precedes the body in document order).
    await expect(
      page
        .getByRole("heading", {
          level: 1,
          name: "The Discipline of Calm Reading",
        })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // The article body renders the expected block structure: at least one
    // paragraph, at least one list, at least one blockquote, at least one
    // code block.
    expect(await page.locator("article p").count()).toBeGreaterThan(0);
    expect(await page.locator("article ul").count()).toBeGreaterThan(0);
    expect(await page.locator("article blockquote").count()).toBeGreaterThan(0);
    expect(await page.locator("article pre").count()).toBeGreaterThan(0);

    // Navigate back to #/ — the library row shows a "Markdown" source badge.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const markdownBadge = page
      .locator(".source-badge")
      .filter({ hasText: "Markdown" });
    await expect(markdownBadge.first()).toBeVisible();
  });

  test("dedupe-refuse: re-uploading identical .md content surfaces Already in your library", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    const fileInput = page.locator("input#ingest-file");

    // First upload — succeeds, navigates to #/article/md-<id>.
    await fileInput.setInputFiles({
      name: "calm-reading.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(MARKDOWN_WITH_FRONTMATTER, "utf-8"),
    });
    await page.getByRole("button", { name: /add file/i }).click();
    await page.waitForURL(/#\/article\/md-/, { timeout: 15_000 });

    // Navigate back to #/ and capture the row count using the auto-retrying
    // toHaveCount (the LibraryView load effect resolves async after mount;
    // .count() snapshots can race the load on slower engines like webkit).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const expectedRowsAfterFirst =
      (await import("../../../src/fixtures")).fixtures.length + 1;
    await expect(page.locator(".library-list > li")).toHaveCount(
      expectedRowsAfterFirst,
    );

    // Second upload — same content (D8-18 produces the same id; D7-07
    // dedupe-refuse kicks in via DexieLibrarySource.has(id) BEFORE save).
    await fileInput.setInputFiles({
      name: "different-filename.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(MARKDOWN_WITH_FRONTMATTER, "utf-8"),
    });
    await page.getByRole("button", { name: /add file/i }).click();

    // The .status region announces the dedupe-refuse copy (D7-04 — calm
    // voice; mirrors the paste-path dedupe-refuse).
    await expect(
      page.locator(".ingest-control .status").filter({
        hasText: "Already in your library.",
      }),
    ).toBeVisible({ timeout: 15_000 });

    // No navigation away from #/ (the dedupe-refuse never calls save →
    // no hash change). The library list count is unchanged (auto-retrying).
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.locator(".library-list > li")).toHaveCount(
      expectedRowsAfterFirst,
    );
  });

  test("front-matter absent fallback: .md without YAML still ingests", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // Upload a .md WITHOUT front-matter. The D8-17 fallback chain runs
    // server-side: provenancePartial.title is undefined → stripMarkdown-
    // Extension(filename) → "A Plain Markdown Document" (the H1 in the
    // body is NOT used as title; the fallback chain is filename-only).
    const fileInput = page.locator("input#ingest-file");
    await fileInput.setInputFiles({
      name: "plain-doc.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(MARKDOWN_NO_FRONTMATTER, "utf-8"),
    });
    await page.getByRole("button", { name: /add file/i }).click();
    await page.waitForURL(/#\/article\/md-/, { timeout: 15_000 });

    // The article still ingests and renders in ArticleView. The title is
    // derived from the filename via stripMarkdownExtension (D8-17 fallback):
    // "plain-doc.md" → "plain-doc". The body's `#` heading also renders as
    // an h1 block, so use .first() to scope to the ArticleView header title
    // (it precedes the body in document order).
    await expect(
      page.getByRole("heading", { level: 1, name: "plain-doc" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    expect(await page.locator("article p").count()).toBeGreaterThan(0);

    // The "Markdown" source badge is present on the library row.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const markdownBadge = page
      .locator(".source-badge")
      .filter({ hasText: "Markdown" });
    await expect(markdownBadge.first()).toBeVisible();
  });

  test(".html upload variant: ingest succeeds via shared {html} paste path (D8-15)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // Upload a small .html file. The IngestControl dispatch detects the
    // .html extension and calls ingestHtml(text) — the SAME {html} path
    // the paste textarea uses. Per the Plan 08-04 design ("There is no
    // filename channel on the {html} variant by design"), the server stamps
    // source="paste" for both; the html-upload source variant in
    // ArticleSourceSchema is reserved for a future filename-channel widening.
    // The badge therefore reads "Pasted" — this is the shipped behavior.
    const fileInput = page.locator("input#ingest-file");
    await fileInput.setInputFiles({
      name: "small.html",
      mimeType: "text/html",
      buffer: Buffer.from(SMALL_HTML_UPLOAD, "utf-8"),
    });
    await page.getByRole("button", { name: /add file/i }).click();

    // The html-upload id is paste-<shortHash(content)> (it reuses the paste
    // dispatch internally — only the input filename differs).
    await page.waitForURL(/#\/article\/paste-/, { timeout: 15_000 });
    await expect(
      page
        .getByRole("heading", { level: 1, name: "An HTML Upload Variant" })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    expect(await page.locator("article p").count()).toBeGreaterThan(0);

    // Navigate back to #/ — the library row shows "Pasted" (the server-
    // stamped source variant for the {html} path; html-upload is reserved
    // for a future filename-channel widening per Plan 08-04 design).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const pastedBadge = page
      .locator(".source-badge")
      .filter({ hasText: "Pasted" });
    await expect(pastedBadge.first()).toBeVisible();
  });
});
