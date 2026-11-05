// tests/e2e/ingestion/publisher-structure.spec.ts
// Issue #237 — publisher-guided chapter destinations, end to end.
//
// The REAL ingestion-to-reader pipeline (no fixture seeding for the article
// itself): the Add dialog's paste arm drives the full middleware
// (extractAndNormalize → outline capture → ArticleSchema.parse →
// deriveWorkStructure → Dexie save → ArticleView). The fixture models the
// reference source's index/heading disagreement — a fourteen-entry
// publisher index whose in-document heading hierarchy conflicts (repeated
// bare headings disambiguated by the publisher's own "(2)"/"(3)" ordinals,
// index-typography punctuation the heading lacks, same-level h2 sessions
// the index treats as INTERNAL to the final chapter). The paste path
// carries no base URL, so the fixture drops the self-referential "All
// Pages" entry (its exclusion is URL-anchored and unit-covered).
//
//   - a reliable index lands as 14 publisher chapters; the reader's
//     orientation says "Chapter N of 14"; the conflicting sessions and
//     byline headings stay INSIDE their chapters;
//   - canonical text is intact (sentinels from the work's first and last
//     stretches) and identity unchanged (content-hash paste id, revision 1);
//   - a highlight anchored inside chapter 3 still resolves and restores —
//     division never moves annotation coordinates;
//   - an ordinary backup round trip keeps the publisher destinations;
//   - the ambiguous variant (bare repeated labels, no ordinals) degrades
//     honestly to heading-derived sections — no guessed chapters.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import { validateWorkStructure } from "../../../src/content/structure";
import { normalizeText } from "../../../src/content/normalizeText";
import {
  PUBLISHER_CHAPTER_TITLES,
  PUBLISHER_WORK_TITLE,
  publisherIndexWorkHtml,
} from "../../../tests/fixtures/publisherIndexWork";
import {
  confidentHighlightOn,
  highlightRow,
  openSettings,
  prepareFreshPage,
  settingsStatus,
} from "../portability/_portability";
import { openAddDialog, pickSource, awaitAutoOpened } from "../library/add-dialog";
import { waitForPaginationSettled } from "../pagination/_harness";
import { BASE } from "../_base";

/** Paste `html` through the Add dialog and wait for the reader to open. */
async function pasteAndOpen(page: Page, html: string): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  await openAddDialog(page);
  await pickSource(page, "paste");
  await page.getByRole("textbox", { name: /paste html/i }).fill(html);
  await page.getByRole("button", { name: /add pasted article/i }).click();
  await awaitAutoOpened(page);
}

/** The saved article row, read through raw IndexedDB (Node-parsable JSON). */
async function readArticleRow(page: Page, id: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (articleId) => {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("articles", "readonly");
        const get = tx.objectStore("articles").get(articleId);
        get.onsuccess = () => resolve((get.result ?? {}) as Record<string, unknown>);
        get.onerror = () => reject(get.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, id);
}

/** Raw IDB puts for the annotation/restore seeding (post-ingest rows). */
async function putRows(
  page: Page,
  rows: { highlights?: Record<string, unknown>[]; locations?: Record<string, unknown>[] },
): Promise<void> {
  await page.evaluate(async (payload) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["highlights", "location"], "readwrite");
        for (const row of payload.highlights ?? []) {
          tx.objectStore("highlights").put(row);
        }
        for (const row of payload.locations ?? []) {
          tx.objectStore("location").put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, rows);
}

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
});

test.describe("publisher-guided chapter destinations (issue #237)", () => {
  test("a reliable fourteen-entry index lands as publisher chapters in the reader", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await pasteAndOpen(page, publisherIndexWorkHtml({ selfLink: false }));

    // The reader opened the ingested work; orientation names publisher
    // chapter 1 of the fourteen the index declared.
    await expect(page.getByRole("heading", { level: 1, name: PUBLISHER_WORK_TITLE })).toBeVisible();
    await expect(page.locator(".reading-orientation")).toHaveText("Chapter 1 of 14");

    // The SAVED row carries the validated publisher snapshot: verbatim
    // index titles (ordinals and the colon survive), no heading-derived
    // stand-ins, and the conflicting sessions INSIDE their chapters.
    const row = await readArticleRow(page, new URL(page.url()).hash.replace("#/article/", ""));
    expect(row.id).toMatch(/^paste-/);
    expect(row.revision).toBe(1);
    const article = ArticleSchema.parse(row);
    const structure = article.structure;
    expect(structure).toBeDefined();
    expect(validateWorkStructure(article, structure!)).not.toBeNull();
    const chapters = structure!.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.map((c) => c.title)).toEqual([...PUBLISHER_CHAPTER_TITLES]);
    expect(chapters.every((c) => c.titleSource === "publisher")).toBe(true);

    // Publisher evidence guided boundaries only — the extracted text is
    // intact across the whole work: the front matter, the first chapter's
    // sentinel, the appendix sentinel (the index's colon never rewrote the
    // heading), and the final session's sentinel all survive verbatim.
    const text = normalizeText(article);
    expect(text).toContain("Front matter introduces the collection");
    expect(text).toContain("The opening page of Introduction names itself in prose.");
    expect(text).toContain(
      "The opening page of APPENDIX The Final Repair Log names itself in prose.",
    );
    expect(text).toContain("The opening page of Session of March 30 names itself in prose.");
  });

  test("a highlight inside a publisher chapter restores there — coordinates intact", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await pasteAndOpen(page, publisherIndexWorkHtml({ selfLink: false }));
    const articleId = new URL(page.url()).hash.replace("#/article/", "");
    const article = ArticleSchema.parse(await readArticleRow(page, articleId));
    const structure = article.structure!;
    const chapter = structure.destinations.find(
      (d) => d.kind === "chapter" && d.title === "The Early Benches",
    )!;

    // Anchor a highlight inside the chapter's opening paragraph — a
    // canonical coordinate INSIDE the publisher chapter's range that still
    // resolves through the shipped quote machinery (division must not move
    // text).
    const anchor = confidentHighlightOn(article, { start: chapter.startOffset, length: 30 });
    expect(anchor.position.start).toBeGreaterThanOrEqual(chapter.startOffset);
    expect(anchor.position.start).toBeLessThan(chapter.endOffset);

    // Leave the article FIRST — the live reader's debounced location save
    // (offset 0 from the ingest open) flushes on departure and must not
    // overwrite the seeded row — then seed, then reopen.
    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await putRows(page, {
      highlights: [highlightRow(articleId, anchor, "hl-publisher-01")],
      locations: [
        {
          schemaVersion: 1,
          articleId,
          revision: 1,
          graphemeOffset: anchor.position.start,
          savedAt: "2026-10-01T12:00:00.000Z",
        },
      ],
    });

    // Restore into the chapter: the saved coordinate opens the work inside
    // the publisher chapter and the highlight renders on the page. The
    // restore jump settles ASYNCHRONOUSLY after the first pagination commit
    // (the orientation harness's documented contract) — poll, never sleep.
    await page.goto(`${BASE}/#/article/${articleId}`);
    await expect(page.getByRole("heading", { level: 1, name: PUBLISHER_WORK_TITLE })).toBeVisible();
    await expect
      .poll(async () => (await page.locator(".reading-orientation").textContent()) ?? "", {
        timeout: 15_000,
      })
      .toBe("Chapter 3 of 14");
    await expect(page.locator("mark.highlight").first()).toBeVisible();
  });

  test("an ordinary backup round trip keeps the publisher destinations", async ({ page }) => {
    test.setTimeout(90_000);
    await pasteAndOpen(page, publisherIndexWorkHtml({ selfLink: false }));
    const articleId = new URL(page.url()).hash.replace("#/article/", "");

    // Machine A: export through the real settings panel.
    const panel = await openSettings(page);
    await expect(panel.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await panel.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    const bundlePath = await download.path();
    expect(bundlePath).toBeTruthy();

    // Machine B: a fresh, wiped page imports the bundle through the
    // preview dialog (the destructive-write boundary's only path).
    await prepareFreshPage(page);
    const panelB = await openSettings(page);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);
    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(page)).toContainText("Imported 1 article", { timeout: 15_000 });

    // The imported row's publisher snapshot survives byte-identically and
    // the reader orients by it — no re-ingest, no re-derivation.
    const row = await readArticleRow(page, articleId);
    const article = ArticleSchema.parse(row);
    const chapters = article.structure!.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.map((c) => c.title)).toEqual([...PUBLISHER_CHAPTER_TITLES]);
    expect(chapters.every((c) => c.titleSource === "publisher")).toBe(true);
    await page.goto(`${BASE}/#/article/${articleId}`);
    await expect(page.getByRole("heading", { level: 1, name: PUBLISHER_WORK_TITLE })).toBeVisible();
    await waitForPaginationSettled(page);
    await expect(page.locator(".reading-orientation")).toHaveText("Chapter 1 of 14");
  });

  test("ambiguous bare-repeat evidence degrades honestly to heading-derived sections", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // The same disagreement, but the index lists the repeated title bare —
    // no publisher ordinals. The evidence set cannot reconcile, so NOTHING
    // claims to be a publisher chapter: the honest heading heuristic takes
    // over, over-splits and all.
    await pasteAndOpen(
      page,
      publisherIndexWorkHtml({ variant: "ambiguous-bare-repeats", selfLink: false }),
    );
    await expect(page.getByRole("heading", { level: 1, name: PUBLISHER_WORK_TITLE })).toBeVisible();
    const row = await readArticleRow(page, new URL(page.url()).hash.replace("#/article/", ""));
    expect(row.revision).toBe(1);
    const article = ArticleSchema.parse(row);
    const structure = article.structure!;
    expect(validateWorkStructure(article, structure!)).not.toBeNull();
    const chapters = structure.destinations.filter((d) => d.kind === "chapter");
    expect(chapters).not.toHaveLength(0);
    expect(chapters.every((c) => c.titleSource === "heading")).toBe(true);
    // The heading heuristic's over-split is VISIBLE, not hidden: the
    // same-level sessions the index keeps inside the last chapter became
    // their own (honest) heading-derived sections.
    const titles = chapters.map((c) => c.title);
    expect(titles).toContain("Session of March 29");
    expect(titles).toContain("Session of March 30");
    // The reader's orientation reports the derived count truthfully.
    await expect(page.locator(".reading-orientation")).toHaveText("Chapter 1 of 16");
    // Text integrity holds under the fallback too.
    const text = normalizeText(article);
    expect(text).toContain("The opening page of Session of March 30 names itself in prose.");
  });
});
