// tests/e2e/portability/highlights-export.spec.ts
// Plan 09-06 Task 3a — the PORT-03 phase-exit e2e gate: both highlights
// exports download through the real UI and their .md content matches the
// locked fixed template (D9-07/D9-08): blockquote quote lines, citation line
// with the article title in italics, the Note line, honest footers — and the
// D9-09 never-drop proof: a highlight whose article exists NOWHERE renders in
// the combined file's "Highlights without an article" section with its note,
// counted in the totals footer (never silently dropped).
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  confidentHighlightOn,
  makeArticle,
  openSettings,
  prepareFreshPage,
  seedRows,
} from "./_portability";

const EXPORT_ARTICLE = makeArticle({
  id: "md-exportdemo01",
  title: "Highlights Export Article",
  sourceUrl: "https://example.org/highlights-export",
  author: "Export Author",
  paragraphs: [
    "The first paragraph of the highlights export article carries the first anchored passage, distinctive enough to resolve confidently through the shipped resolver at export time.",
    "The second paragraph carries the second anchored passage, this one without a note so the Note line's presence and absence are both exercised by the template.",
    "The third paragraph supplies additional unique material so neither anchored passage can accidentally appear twice in the normalized stream.",
  ],
});

const ANCHOR_H1 = confidentHighlightOn(EXPORT_ARTICLE, { start: 8 });
const ANCHOR_H2 = confidentHighlightOn(EXPORT_ARTICLE, { start: 90 });

/** A highlight keyed to an article id that exists nowhere (the D9-09
 * vanished-article case) — must reach the combined file, never be dropped. */
const GHOST_EXACT = "This passage belongs to an article that no longer exists in the library.";

async function seedExportLibrary(page: Page): Promise<void> {
  await seedRows(page, {
    articles: [EXPORT_ARTICLE],
    highlights: [
      {
        schemaVersion: 1,
        id: "hl-export-1",
        articleId: EXPORT_ARTICLE.id,
        revision: 1,
        position: ANCHOR_H1.position,
        quote: ANCHOR_H1.quote,
        createdAt: "2026-08-15T00:00:00.000Z",
      },
      {
        schemaVersion: 1,
        id: "hl-export-2",
        articleId: EXPORT_ARTICLE.id,
        revision: 1,
        position: ANCHOR_H2.position,
        quote: ANCHOR_H2.quote,
        createdAt: "2026-08-15T00:00:00.000Z",
      },
      {
        schemaVersion: 1,
        id: "hl-export-ghost",
        articleId: "ghost-article-404",
        revision: 1,
        position: { start: 0, end: 20 },
        quote: { prefix: "", exact: GHOST_EXACT, suffix: "" },
        createdAt: "2026-08-15T00:00:00.000Z",
      },
    ],
    notes: [
      {
        schemaVersion: 1,
        id: "nt-export-1",
        highlightId: "hl-export-1",
        text: "Export note riding the highlight.",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
      {
        schemaVersion: 1,
        id: "nt-export-ghost",
        highlightId: "hl-export-ghost",
        text: "Orphan note that must survive export.",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
    ],
  });
}

test.describe("PORT-03 — highlights Markdown export content", () => {
  // 13-10 gate-run repair (the 09-07 section-announce precedent): under
  // full-suite parallel load a webkit context's prepareFreshPage page.goto
  // starved on the single Vite dev server and blew the default 30s budget.
  // Assertions unchanged — the budget doubles so load contention cannot
  // flake the content gate.
  test.setTimeout(60_000);
  test("per-article export: blockquotes, italic-title citation, Note line, footer, sanitized filename", async ({
    page,
  }) => {
    await prepareFreshPage(page);
    await seedExportLibrary(page);

    await page.goto(`${BASE}/#/article/${EXPORT_ARTICLE.id}`);
    // Plan 13-10 (G5): the per-article Export button now lives INSIDE the
    // annotations drawer (a showModal dialog). A closed dialog's subtree is
    // display:none — excluded from role/visibility queries — so open the
    // drawer via the header trigger BEFORE locating the button (the
    // count-suffix-tolerant /^Highlights and notes/ regex shape from
    // annotations/_fixtures.ts drawerTrigger, inlined — this suite does not
    // import that helper).
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
    // Filename derives from sanitizeFilename(article.provenance.title, id).
    expect(download.suggestedFilename()).toBe("highlights-Highlights Export Article.md");
    const path = await download.path();
    expect(path).toBeTruthy();
    const md = readFileSync(path!, "utf8");

    // Level-1 heading names the article.
    expect(md).toContain("# Highlights — Highlights Export Article");
    // Blockquote quote lines carry the anchored passages verbatim.
    expect(md).toContain(`> ${ANCHOR_H1.quote.exact}`);
    expect(md).toContain(`> ${ANCHOR_H2.quote.exact}`);
    // Citation line: author + ITALIC title + source link (D9-08).
    expect(md).toContain(
      "> — Export Author, *Highlights Export Article* ([source](https://example.org/highlights-export))",
    );
    // The Note line rides its highlight (D9-08/D9-09).
    expect(md).toContain("> Note: Export note riding the highlight.");
    // Honest per-article footer (the ghost highlight keys to ANOTHER article
    // id, so the per-article file carries exactly this article's two).
    expect(md).toContain("_2 highlights · 0 ambiguous · 0 orphan_");
    // The calm announcement names the count. ArticleView mounts TWO
    // visually-hidden role=status regions (annotation announce, then the
    // 09-05 export announce) — the export region is the second.
    await expect(page.locator("main [role='status'].visually-hidden").nth(1)).toContainText(
      "Exported 2 highlights for this article.",
    );
  });

  test("library-wide export: combined file with per-article sections, never-dropped orphans, and totals", async ({
    page,
  }) => {
    await prepareFreshPage(page);
    await seedExportLibrary(page);

    const panel = await openSettings(page);
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await panel.getByRole("button", { name: "Export all highlights" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lem-reader-highlights.md");
    const path = await download.path();
    expect(path).toBeTruthy();
    const md = readFileSync(path!, "utf8");

    // Level-1 heading + per-article level-2 section + per-section footer.
    expect(md).toContain("# Highlights");
    expect(md).toContain("## Highlights Export Article");
    expect(md).toContain("_2 highlights · 0 ambiguous · 0 orphan_");
    expect(md).toContain("> Note: Export note riding the highlight.");

    // D9-09 never-drop: the vanished-article highlight AND its note reach the
    // combined file in the unmatched section, marked honestly, counted.
    expect(md).toContain("## Highlights without an article");
    expect(md).toContain(`> *[orphan]* ${GHOST_EXACT}`);
    expect(md).toContain("> Note: Orphan note that must survive export.");
    expect(md).toContain("_Totals: 3 highlights · 0 ambiguous · 1 orphan_");
  });
});
