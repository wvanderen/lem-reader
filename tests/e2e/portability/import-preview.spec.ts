// tests/e2e/portability/import-preview.spec.ts
// Plan 09-06 Task 2b — the PORT-02 dialog-flow e2e gate. A valid hand-built
// bundle (shipped ExportBundleSchema + computeManifest + fflate — built
// Node-side for focus) meets ONE pre-seeded conflicting highlight id, then:
//   - the preview dialog shows the summary counts + the conflict line, with
//     [data-initial-focus] on Cancel import (Pitfall 8 — non-destructive
//     default focus),
//   - Escape closes with ZERO store mutation (and the state machine resets,
//     so re-running the flow re-opens the dialog),
//   - Proceed with all defaults (skip-by-default, D9-14) imports the new
//     records, SKIPS the conflicting highlight byte-unchanged, and reports
//     the honest skip count,
//   - flipping the highlight-id override to Keep both imports BOTH rows
//     (local untouched + a minted id carrying the bundle's text) — the
//     keep-both e2e proof.
import { test, expect } from "@playwright/test";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import {
  buildBundleZip,
  confidentHighlightOn,
  countRows,
  highlightRow,
  makeArticle,
  openSettings,
  prepareFreshPage,
  readAllRows,
  readRow,
  seedRows,
  settingsStatus,
} from "./_portability";

/** The demo article both bundle highlights anchor into. */
const DEMO_ARTICLE = makeArticle({
  id: "md-previewdemo01",
  title: "Import Preview Demo Article",
  sourceUrl: "https://example.org/import-preview-demo",
  author: "Ivy Preview",
  paragraphs: [
    "The first paragraph of the import preview demo article carries distinctive prose so both anchored passages resolve confidently through the shipped resolver during the dry run.",
    "The second paragraph hosts the conflicting highlight's bundle-side text, which differs from the local row under the same id so a keep-both import is observable at the row level.",
    "The third paragraph supplies fresh unique material for the non-conflicting highlight that must always import regardless of override choices.",
  ],
});

const ANCHOR_CONFLICT = confidentHighlightOn(DEMO_ARTICLE, { start: 8 });
const ANCHOR_FRESH = confidentHighlightOn(DEMO_ARTICLE, { start: 90 });

/** The bundle: 1 article + 2 highlights (one id-conflicting with the local
 * pre-seed, one fresh). Notes/locations empty so counts read cleanly. */
const BUNDLE_BUFFER = await buildBundleZip({
  schemaVersion: 1,
  exportedAt: "2026-08-15T00:00:00.000Z",
  appVersion: "0.1.0",
  articles: [DEMO_ARTICLE],
  locations: [],
  highlights: [
    highlightRow(DEMO_ARTICLE.id, ANCHOR_CONFLICT, "hl-preview-conflict"),
    highlightRow(DEMO_ARTICLE.id, ANCHOR_FRESH, "hl-preview-fresh"),
  ],
  notes: [],
  preferences: { ...DEFAULT_SETTINGS },
  fixtureIds: [],
});

/** The LOCAL row under the conflicting id — its exact text differs from the
 * bundle's, so skip vs overwrite vs keep-both are each observable. */
const LOCAL_EXACT = "LOCAL KEPT PASSAGE — must survive a skipped import.";

async function seedConflictingLocalHighlight(page: Parameters<typeof seedRows>[0]): Promise<void> {
  await seedRows(page, {
    highlights: [
      {
        schemaVersion: 1,
        id: "hl-preview-conflict",
        articleId: "local-only-article",
        revision: 1,
        position: { start: 3, end: 9 },
        quote: { prefix: "", exact: LOCAL_EXACT, suffix: "" },
        createdAt: "2026-08-15T00:00:00.000Z",
      },
    ],
  });
}

test.describe("PORT-02 — import preview dialog flow", () => {
  test("Esc closes with no change; defaults skip the conflict byte-unchanged and report it", async ({
    page,
  }) => {
    await prepareFreshPage(page);
    await seedConflictingLocalHighlight(page);

    const panel = await openSettings(page);
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "demo-bundle.zip",
      mimeType: "application/zip",
      buffer: BUNDLE_BUFFER,
    });

    // Preview: summary counts (the conflicting highlight is incoming but not
    // "new" — honest "(1 new)" qualifier) + the conflict line + Pitfall 8
    // initial focus.
    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 1 article, 2 highlights (1 new), 0 notes, and 0 reading positions.",
    );
    await expect(preview).toContainText("1 conflicting highlight");
    await expect(preview.getByRole("button", { name: "Cancel import" })).toHaveAttribute(
      "data-initial-focus",
      "true",
    );

    // Esc: the dialog closes and NOTHING changes in any store.
    const stores = ["articles", "settings", "location", "highlights", "notes"];
    const beforeEsc = new Map<string, number>(
      await Promise.all(stores.map(async (s) => [s, await countRows(page, s)] as const)),
    );
    await page.keyboard.press("Escape");
    await expect(preview).not.toBeVisible();
    for (const store of stores) {
      expect(await countRows(page, store), `${store} unchanged after Esc`).toBe(
        beforeEsc.get(store),
      );
    }

    // Re-run the import flow (the state machine reset on Esc — the same
    // bundle re-opens the preview with fresh defaults).
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "demo-bundle.zip",
      mimeType: "application/zip",
      buffer: BUNDLE_BUFFER,
    });
    await expect(preview).toBeVisible({ timeout: 15_000 });

    // Proceed with ALL defaults (skip-by-default, D9-14).
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(page)).toContainText(
      "Imported 1 article, 1 highlight, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );
    await expect(settingsStatus(page)).toContainText("1 item was skipped.");

    // The conflicting highlight was NOT overwritten: byte-unchanged local row.
    const conflictRow = await readRow(page, "highlights", "hl-preview-conflict");
    expect(conflictRow).not.toBeNull();
    expect((conflictRow!.quote as { exact: string }).exact).toBe(LOCAL_EXACT);
    expect((conflictRow!.position as { start: number }).start).toBe(3);
    expect((conflictRow!.position as { end: number }).end).toBe(9);
    // The fresh highlight + the article DID import (partial, honest).
    expect(await readRow(page, "highlights", "hl-preview-fresh")).not.toBeNull();
    expect(await readRow(page, "articles", DEMO_ARTICLE.id)).not.toBeNull();
    expect(await countRows(page, "highlights")).toBe(2);
  });

  test("Keep both imports the bundle row under a minted id; the local row stays untouched", async ({
    page,
  }) => {
    await prepareFreshPage(page);
    await seedConflictingLocalHighlight(page);

    const panel = await openSettings(page);
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "demo-bundle.zip",
      mimeType: "application/zip",
      buffer: BUNDLE_BUFFER,
    });

    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });

    // Flip the highlight-id bulk override to Keep both (D9-11/D9-14).
    await preview
      .getByRole("combobox", { name: "Import choice for highlights" })
      .selectOption("keep-both");
    await preview.getByRole("button", { name: "Import", exact: true }).click();

    // 1 article + BOTH highlights import (conflict minted + fresh); no skips.
    await expect(settingsStatus(page)).toContainText(
      "Imported 1 article, 2 highlights, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );

    // Row-level keep-both proof: local row untouched + a MINTED id row
    // carrying the bundle's exact text.
    const conflictRow = await readRow(page, "highlights", "hl-preview-conflict");
    expect(conflictRow).not.toBeNull();
    expect((conflictRow!.quote as { exact: string }).exact).toBe(LOCAL_EXACT);

    const highlightRows = await readAllRows(page, "highlights");
    expect(highlightRows.length).toBe(3); // local + minted + fresh
    const minted = highlightRows.find(
      (r) =>
        (r.quote as { exact: string }).exact === ANCHOR_CONFLICT.quote.exact &&
        r.id !== "hl-preview-conflict",
    );
    expect(minted, "keep-both must mint a new id for the bundle's highlight").toBeDefined();
    expect((minted!.position as { start: number }).start).toBe(ANCHOR_CONFLICT.position.start);
  });
});
