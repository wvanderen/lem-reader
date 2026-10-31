// tests/e2e/portability/article-notes-roundtrip.spec.ts
// Issue #211 — the user-facing article-notes portability gate: a saved
// article note (identity, created/updated timestamps, plain text, annotation
// tags, article association) travels the REAL export/import workflow and
// lands editable on the receiving device.
//
//   machine A: seed (raw IndexedDB puts — the remove-cascade truth path)
//              → Settings → Export library bundle → download capture
//   Node side: unzip the captured .zip; the v8 envelope carries the note
//              WHOLE (id/timestamps/text/tags/articleId) and NOTHING
//              passage-shaped (no highlightId, no position, no quote)
//   machine B: prepareFreshPage (the wipe) → Settings → setInputFiles(path)
//              → preview counts the note → Import → status line
//   truth:     raw IndexedDB row byte-equal; the Annotations review
//              (#/annotations) renders the row with its badge, the editor
//              shows the traveled tag chips, an edit re-saves, and the
//              explicit Open article action navigates to the associated
//              article
//
// Two browser contexts ARE the two machines (round-trip.spec.ts harness —
// per-context IndexedDB origin isolation).
//
// Engine scope: this journey runs on EVERY supported engine — unlike the
// round-trip/v21 spines' WebKit Blob boundary (D21-11), every row here is a
// plain-object IndexedDB value (article notes carry no asset bytes), so
// nothing hits the documented skip. The download capture + file import +
// review-editing steps it proves are the browser-owned workflow the issue
// pins, engine-completely.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import {
  BASE,
  articleNoteRow,
  makeArticle,
  openSettings,
  prepareFreshPage,
  readBundleJson,
  readRow,
  seedRows,
  settingsStatus,
} from "./_portability";

const ARTICLE_ID = "article-note-rt-e2e";
const NOTE_ID = "article-note-rt-e2e-1";
// ≤ 60 chars — under the review row's ARIA_MAX_CHARS excerpt cap, so the
// accessible name in assertions is the full text verbatim.
const NOTE_TEXT = "An overarching reflection that travels with its article.";
const NOTE_TAGS = ["to-revisit", "essays"];
// articleNoteRow derives updatedAt = createdAt (the store's stamping shape).
const NOTE_CREATED = "2026-09-20T10:00:00.000Z";
const NOTE_UPDATED = NOTE_CREATED;

function sampleArticle(): CanonicalArticle {
  return makeArticle({
    id: ARTICLE_ID,
    title: "The Article Note Journey",
    paragraphs: [
      "First paragraph of the traveling article.",
      "Second paragraph with enough prose to paginate calmly.",
    ],
    sourceUrl: "https://example.org/article-note-journey",
  });
}

/** Assert ArticleSchema validity Node-side (the seed rides the shipped
 * schema — Dexie reads must never drop it). */
const SEEDED_ARTICLE = ArticleSchema.parse(sampleArticle());

async function newMachine(browser: {
  newContext: () => Promise<BrowserContext>;
}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await prepareFreshPage(page);
  return { context, page };
}

test.describe("article notes ride the export/import workflow (issue #211)", () => {
  test("export → import preserves the note whole; review renders it editable with tags and its article link", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const machineA = await newMachine(browser);
    const pageA = machineA.page;

    await seedRows(pageA, {
      articles: [SEEDED_ARTICLE],
      articleNotes: [
        articleNoteRow(ARTICLE_ID, NOTE_ID, {
          text: NOTE_TEXT,
          tags: NOTE_TAGS,
          createdAt: NOTE_CREATED,
        }),
      ],
    });

    // ── Machine A: export through the real UI ────────────────────────────
    const panelA = await openSettings(pageA);
    await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lem-reader-bundle-v1.zip");
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node-side envelope inspection ─────────────────────────────────────
    const { bundle: bundleJson } = readBundleJson(bundlePath!);
    expect(bundleJson.schemaVersion).toBe(8); // writers emit v8 (issue #211)
    const exportedNotes = bundleJson.articleNotes as Array<Record<string, unknown>>;
    expect(exportedNotes).toHaveLength(1);
    // Identity, timestamps, plain text, tags, and the article association —
    // every field the acceptance criteria names, byte-for-byte.
    expect(exportedNotes[0]).toEqual({
      schemaVersion: 1,
      id: NOTE_ID,
      articleId: ARTICLE_ID,
      text: NOTE_TEXT,
      tags: NOTE_TAGS,
      createdAt: NOTE_CREATED,
      updatedAt: NOTE_UPDATED,
    });
    // NEVER a synthesized highlight or passage selector — none of the
    // passage-attachment vocabulary may appear on the record.
    for (const key of ["highlightId", "position", "quote", "color", "customColor"]) {
      expect(exportedNotes[0]).not.toHaveProperty(key);
    }

    // ── Machine B: import through the real UI ────────────────────────────
    const machineB = await newMachine(browser);
    const pageB = machineB.page;
    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);

    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 1 article, 0 highlights, 0 notes, 1 article note, and 0 reading positions.",
    );
    // No detached-note warning: the note's article rides the bundle.
    await expect(preview).not.toContainText("article note will be skipped");

    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 1 article, 0 highlights, 0 notes, 1 article note, and 0 reading positions.",
      { timeout: 15_000 },
    );
    // Close the modal settings panel — everything behind a showModal()
    // dialog is inert, so the review interactions below need it closed.
    await panelB.getByRole("button", { name: "Close reading settings" }).click();
    await expect(panelB).not.toBeVisible();

    // ── Raw IndexedDB truth: the landed row is byte-equal ────────────────
    const landed = await readRow(pageB, "articleNotes", NOTE_ID);
    expect(landed).toEqual({
      schemaVersion: 1,
      id: NOTE_ID,
      articleId: ARTICLE_ID,
      text: NOTE_TEXT,
      tags: NOTE_TAGS,
      createdAt: NOTE_CREATED,
      updatedAt: NOTE_UPDATED,
    });

    // ── The review surface renders the imported note ─────────────────────
    await pageB.goto(`${BASE}/#/annotations`);
    const row = pageB.locator(`li[data-article-note-id="${NOTE_ID}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(NOTE_TEXT);
    await expect(row).toContainText("Article note");

    // ── It remains editable, with the traveled tags committed ────────────
    await row.getByRole("button", { name: `Edit article note: ${NOTE_TEXT}` }).click();
    const editor = pageB.locator("textarea#article-note-text");
    await expect(editor).toHaveValue(NOTE_TEXT);
    const tagsSection = pageB.getByRole("region", { name: "Article note tags" });
    for (const tag of NOTE_TAGS) {
      await expect(tagsSection.getByRole("button", { name: `Remove tag ${tag}` })).toBeVisible();
    }

    // An edit re-saves (the write-through editor; Done closes the session).
    const revised = `${NOTE_TEXT} Revised on machine B.`;
    await editor.fill(revised);
    await pageB.getByRole("button", { name: "Done", exact: true }).click();
    await expect(row).toContainText(revised);
    const revisedRow = await readRow(pageB, "articleNotes", NOTE_ID);
    expect(revisedRow?.["text"]).toBe(revised);
    // The revision never moved the created stamp or the association.
    expect(revisedRow?.["createdAt"]).toBe(NOTE_CREATED);
    expect(revisedRow?.["articleId"]).toBe(ARTICLE_ID);

    // ── The explicit Open article action reaches the associated article ──
    await row.locator("a.review-open").click();
    await expect(pageB).toHaveURL(new RegExp(`#/article/${ARTICLE_ID}`));
    await expect(pageB.getByRole("heading", { name: "The Article Note Journey" })).toBeVisible();

    await machineA.context.close();
    await machineB.context.close();
  });

  test("a bundle note whose article is missing imports NOTHING detached and says so in the preview", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    // Build the bundle Node-side with the REAL shipped schema + manifest —
    // the note's articleId resolves nowhere on the receiving device.
    const { buildBundleZip } = await import("./_portability");
    const envelope = {
      schemaVersion: 8 as const,
      exportedAt: "2026-09-29T12:00:00.000Z",
      appVersion: "test",
      articles: [],
      locations: [],
      highlights: [],
      notes: [],
      articleNotes: [articleNoteRow("art-nowhere-e2e", "an-nowhere-1", { text: "Detached." })],
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
      books: [],
      assets: [],
      readingSessions: [],
      subscriptions: [],
      starterRemoved: false,
    };
    const zip = await buildBundleZip(envelope);

    const machineB = await newMachine(browser);
    const pageB = machineB.page;
    const panelB = await openSettings(pageB);
    await panelB
      .locator('input[type="file"][accept=".zip"]')
      .setInputFiles({ name: "detached.zip", mimeType: "application/zip", buffer: zip });

    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "1 article note will be skipped because its article isn't available.",
    );

    // The reader proceeds anyway — the gate holds: nothing detached lands.
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText("0 article notes", { timeout: 15_000 });
    expect(await readRow(pageB, "articleNotes", "an-nowhere-1")).toBeNull();
    await machineB.context.close();
  });
});
