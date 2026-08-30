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
  BASE,
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

// ── Phase 17 (17-05 Task 2) — the article-metadata-override conflict flow ────
//
// Proves D17-11 end-to-end through the real ImportPreviewDialog: a same-id
// article with differing overrides surfaces the article-metadata-override
// conflict row (both-sides-differ AND one-side-only), the per-article
// disclosure shows both names with Keep mine / Use imported selects, the
// keep-LOCAL default preserves the local name on Proceed, and the per-item
// take-incoming choice applies the incoming row whole (a key-less incoming
// row REMOVES the local override — explicit reader choice). Then D17-10's
// merge-on-win (a revision+1 refresh never renames the library) and D17-13's
// cascade (removing an overridden article removes its override with it).
//
// All bundles are hand-built v3 envelopes (buildBundleZip — the shipped
// ExportBundleSchema self-check), mirroring what real Phase 17 exports carry.

/** Base article both sides of a metadata conflict share: same id, revision,
 * and originalHtmlHash (so classification reaches the metadata branch, not
 * revision/divergence). */
function metadataConflictBase(id: string, title: string, paragraphs: string[]) {
  return makeArticle({ id, title, author: "Canonical Conflict Author", paragraphs });
}

const CONFLICT_PARAGRAPHS = [
  "The first paragraph of the metadata conflict corpus. Both machines hold this article at the same revision and content hash, so the only difference the importer may report is the reader-owned name.",
  "A second paragraph supplies the unique material every seeded article carries so no anchored passage can ever collide across articles in the normalized stream.",
  "A third paragraph keeps the corpus comfortably past every confidence threshold without coupling to any threshold value.",
];

test.describe("PORT-02 metadata overrides (17-05 — D17-10/D17-11/D17-13)", () => {
  test("conflict row + both names + one-side-only; keep-local default preserves the local name (D17-11)", async ({
    page,
  }) => {
    await prepareFreshPage(page);

    // LOCAL: both-sides-differ article (override on both machines, different
    // values) + one-side-only article (LOCAL has none, bundle carries one).
    const bothBase = metadataConflictBase(
      "md-metaconf001",
      "Both Sides Conflict Article",
      CONFLICT_PARAGRAPHS,
    );
    const oneSideBase = metadataConflictBase(
      "md-metaconf002",
      "One Side Conflict Article",
      CONFLICT_PARAGRAPHS,
    );
    await seedRows(page, {
      articles: [
        { ...bothBase, readerTitle: "Local Kept Name" },
        oneSideBase, // NO local override
      ],
    });

    // BUNDLE (v3): differing title on the first; an author override the
    // local side lacks on the second (one-side-only — D17-11 verbatim).
    const bundleBuffer = await buildBundleZip({
      schemaVersion: 3,
      exportedAt: "2026-08-20T00:00:00.000Z",
      appVersion: "test",
      articles: [
        { ...bothBase, readerTitle: "Incoming Machine Name" },
        { ...oneSideBase, readerAuthor: "Incoming Only Author" },
      ],
      locations: [],
      highlights: [],
      notes: [],
      preferences: { ...DEFAULT_SETTINGS },
      fixtureIds: [],
    });

    const panel = await openSettings(page);
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "metadata-conflict-bundle.zip",
      mimeType: "application/zip",
      buffer: bundleBuffer,
    });

    // The preview surfaces the article-metadata-override conflict row with
    // the plain-word label, and the disclosure lists BOTH conflicted
    // articles with their local → incoming names.
    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "2 conflicting articles with a different title or author",
    );
    await preview.getByRole("button", { name: "Show articles" }).click();
    const metadataList = preview.locator("#import-preview-metadata-list");
    await expect(metadataList).toBeVisible();
    await expect(metadataList).toContainText("Local Kept Name");
    await expect(metadataList).toContainText("Incoming Machine Name");
    await expect(metadataList).toContainText("One Side Conflict Article");
    // Every per-item select defaults to Keep mine (keep-LOCAL, D17-11).
    await expect(
      metadataList.getByRole("combobox", { name: "Import choice for Local Kept Name" }),
    ).toHaveValue("keep-mine");

    // KEEP-LOCAL DEFAULT: Proceed without touching any choice.
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(page)).toContainText(
      "Imported 0 articles, 0 highlights, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );
    await expect(settingsStatus(page)).toContainText("2 items were skipped.");

    // Row truth: the local overrides stand; the incoming names did NOT
    // silently replace them, and the one-side-only incoming author never
    // landed.
    const bothRow = await readRow(page, "articles", "md-metaconf001");
    expect(bothRow?.readerTitle).toBe("Local Kept Name");
    const oneSideRow = await readRow(page, "articles", "md-metaconf002");
    expect(
      Object.prototype.hasOwnProperty.call(oneSideRow, "readerAuthor"),
      "one-side-only incoming override must NOT land under the keep-local default",
    ).toBe(false);
  });

  test("per-item Use imported applies the incoming name AND removes the local override the bundle lacked (D17-11)", async ({
    page,
  }) => {
    await prepareFreshPage(page);

    const base = metadataConflictBase(
      "md-metatake01",
      "Take Incoming Article",
      CONFLICT_PARAGRAPHS,
    );
    await seedRows(page, {
      articles: [
        { ...base, readerTitle: "Local Kept Name", readerAuthor: "Local Author" },
      ],
    });

    // Incoming: a DIFFERENT title and NO author override — taking it whole
    // must remove the local readerAuthor (a key-less incoming row deletes
    // the override: the explicit reader choice).
    const bundleBuffer = await buildBundleZip({
      schemaVersion: 3,
      exportedAt: "2026-08-20T00:00:00.000Z",
      appVersion: "test",
      articles: [{ ...base, readerTitle: "Incoming Machine Name" }],
      locations: [],
      highlights: [],
      notes: [],
      preferences: { ...DEFAULT_SETTINGS },
      fixtureIds: [],
    });

    const panel = await openSettings(page);
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "take-incoming-bundle.zip",
      mimeType: "application/zip",
      buffer: bundleBuffer,
    });

    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "1 conflicting article with a different title or author",
    );

    // Toggle THIS article to Use imported (the per-item choice).
    await preview.getByRole("button", { name: "Show articles" }).click();
    await preview
      .getByRole("combobox", { name: "Import choice for Local Kept Name" })
      .selectOption("use-imported");
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(page)).toContainText(
      "Imported 1 article, 0 highlights, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );

    // Row truth: the incoming row won WHOLE — new title, and the local
    // author override is gone because the incoming record had none.
    const row = await readRow(page, "articles", "md-metatake01");
    expect(row?.readerTitle).toBe("Incoming Machine Name");
    expect(
      Object.prototype.hasOwnProperty.call(row, "readerAuthor"),
      "a key-less incoming row must REMOVE the local override on take-incoming",
    ).toBe(false);
    const provenance = (row?.provenance ?? {}) as { title?: string };
    expect(provenance.title).toBe("Take Incoming Article");

    // The library row shows the incoming name (the one effective name).
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#title-md-metatake01")).toHaveText(
      "Incoming Machine Name",
    );
  });

  test("merge-on-win: a revision+1 refresh overwrites content but keeps the LOCAL title override (D17-10)", async ({
    page,
  }) => {
    await prepareFreshPage(page);

    const base = metadataConflictBase(
      "md-metamerge01",
      "Merge On Win Article",
      CONFLICT_PARAGRAPHS,
    );
    await seedRows(page, {
      articles: [{ ...base, readerTitle: "Local Kept Title" }],
    });

    // Incoming: SAME id at revision 2 with refreshed content — the article-
    // revision conflict, NOT a metadata conflict (else-if exclusivity), so
    // the override protection must come from merge-on-win.
    const refreshed = {
      ...base,
      revision: 2,
      provenance: {
        ...base.provenance,
        originalHtmlHash: `sha256:${"3".repeat(64)}`,
      },
    };
    const bundleBuffer = await buildBundleZip({
      schemaVersion: 3,
      exportedAt: "2026-08-20T00:00:00.000Z",
      appVersion: "test",
      articles: [refreshed],
      locations: [],
      highlights: [],
      notes: [],
      preferences: { ...DEFAULT_SETTINGS },
      fixtureIds: [],
    });

    const panel = await openSettings(page);
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "revision-refresh-bundle.zip",
      mimeType: "application/zip",
      buffer: bundleBuffer,
    });

    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "1 conflicting article with a different version",
    );

    // Overwrite the version conflict; metadata stays keep-mine (no
    // take-incoming choice — the reader keeps their name).
    await preview
      .getByRole("combobox", { name: "Import choice for articles with a different version" })
      .selectOption("overwrite");
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(page)).toContainText(
      "Imported 1 article, 0 highlights, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );

    // Row truth: the NEW revision + NEW content hash landed, and the LOCAL
    // title override survived the refresh — a refresh never renames the
    // library back (D17-10).
    const row = await readRow(page, "articles", "md-metamerge01");
    expect(row?.revision).toBe(2);
    const provenance = (row?.provenance ?? {}) as { originalHtmlHash?: string };
    expect(provenance.originalHtmlHash).toBe(`sha256:${"3".repeat(64)}`);
    expect(row?.readerTitle).toBe("Local Kept Title");
  });

  test("cascade: removing an overridden article removes its override with it — no residue (D17-13)", async ({
    page,
  }) => {
    await prepareFreshPage(page);

    const base = metadataConflictBase(
      "md-metacascade1",
      "Cascade Removal Article",
      CONFLICT_PARAGRAPHS,
    );
    await seedRows(page, {
      articles: [{ ...base, readerTitle: "Doomed Renamed Title" }],
    });

    // The row renders under the effective name; remove it through the real
    // library Remove flow (row trash → RemoveConfirm → Remove article).
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    const row = page
      .locator(".library-list > li")
      .filter({ hasText: "Doomed Renamed Title" });
    await expect(row).toBeVisible();
    await row.locator(".library-row-remove").click();
    const confirm = page.locator("dialog.library-remove-confirm");
    await expect(confirm).toBeVisible();
    await confirm.locator(".library-remove-destructive").click();
    await expect(confirm).not.toBeVisible();

    // Row truth: the articles row is GONE — the override lived ON the row,
    // so the atomic row deletion IS the cascade (no residue, no orphan
    // window, nothing left to sweep).
    expect(await readRow(page, "articles", "md-metacascade1")).toBeNull();
    expect(await countRows(page, "articles")).toBe(0);
  });
});
