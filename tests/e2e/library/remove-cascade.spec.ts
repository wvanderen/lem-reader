// tests/e2e/library/remove-cascade.spec.ts
// Plan 08-05 Task 1 — SC#2 + LIB-02 phase-exit e2e gate. Proves the
// cascade-remove: when a reader removes an article via the row-level trash
// → RemoveConfirm → "Remove article" button, the article + EVERY highlight
// + EVERY note + EVERY location row keyed to it are removed atomically
// (D8-13). The cancel path ("Keep article") leaves everything intact.
//
// Harness (cloned from happy-path.spec.ts + dexie-migration.spec.ts):
//   - BASE URL:    http://localhost:5173
//   - beforeEach:  image-stub + IndexedDB clear (deterministic first-run)
//   - readRow / countRows helpers: cloned from dexie-migration.spec.ts
//     L226-288 to assert Dexie state directly (cascade proof)
//
// Seeding strategy:
//   1. Ingest a paste-HTML article through the real Vite Node middleware
//      (the article lands in Dexie via DexieLibrarySource.save).
//   2. Seed one highlight + one note + one location directly into Dexie via
//      page.evaluate() (mirrors dexie-migration.spec.ts seeding). These are
//      the rows that should disappear on cascade-remove.
//   3. Navigate to #/, click the row's trash button → RemoveConfirm opens.
//   4. Assert body copy + data-initial-focus on cancel (Pitfall 8).
//   5. Click "Remove article" → cascade fires; assert article row is gone
//      AND highlight + note + location rows are ALL gone (D8-13).
//   6. Cancel path: re-seed, open the dialog, click "Keep article", assert
//      everything intact.
//
// Threat register:
//   - T-8-17 (Repudiation/Tampering, accidental cascade-remove) → RemoveConfirm
//     gates the destructive dexieLibrarySource.remove(id) behind a native
//     <dialog>/alertdialog with data-initial-focus on the cancel button
//     (Pitfall 8 — non-destructive default). Body copy names the cascade
//     consequence per UI-SPEC §Copywriting L262.
//   - T-8-19 (Repudiation, false-positive verification) → the cascade proof
//     uses readRow/countRows against the live IndexedDB to assert the rows
//     are physically gone, not just absent from the rendered list.
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";

// A representative paste-HTML article rich enough to clear the ING-06
// confidence thresholds + the round-trip anchor gate. The ingested article's
// id is deterministic (paste-<shortHash(content)>) so we can read it back
// from Dexie and seed related rows against it.
const PASTE_HTML = `<!DOCTYPE html>
<html><head><title>Cascade-Remove Test Article</title></head>
<body>
<article>
<h1>Cascade-Remove Test Article</h1>
<p>The first paragraph of the cascade-remove test fixture. Long enough to
clear the ING-06 confidence threshold (textLength >= 500) and varied enough
that the round-trip anchor gate samples five grapheme offsets that all
resolve to confident via the shipped TextQuoteSelector machinery.</p>
<p>The second paragraph continues the long-form prose. The reading engine
cannot tell this ingested article from a fixture — that is the load-bearing
invariant of Phase 7 and Phase 8. The library surfaces it under the same
Saved articles heading, the same per-row structure, and the same
open-article gesture as a bundled v1.0 fixture.</p>
<p>The third paragraph closes the corpus. The reader who reaches this
article via #/article/&lt;id&gt; sees the same h1 + paragraph structure, the
same reading-mode toggle, the same annotation toolbar, and the same scroll
or paginate behavior as a bundled fixture. Phase 8's library surfaces the
article without distinguishing its origin except via the quiet source badge
underneath the title.</p>
</article>
</body></html>`;

/**
 * readRow — read a single row from the named store by key. Mirrors
 * dexie-migration.spec.ts L226-258 verbatim (the cascade-proof helper).
 */
async function readRow(
  page: Page,
  storeName: string,
  key: IDBValidKey,
): Promise<Record<string, unknown> | null> {
  type SerializableKey = string | number | (string | number)[];
  return page.evaluate<
    Record<string, unknown> | null,
    { storeName: string; key: SerializableKey }
  >(
    async ({ storeName, key }): Promise<Record<string, unknown> | null> => {
      return new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            resolve(null);
            return;
          }
          const tx = db.transaction(storeName, "readonly");
          const getReq = tx.objectStore(storeName).get(key as IDBValidKey);
          getReq.onsuccess = () =>
            resolve(
              (getReq.result ?? null) as Record<string, unknown> | null,
            );
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    },
    { storeName, key: key as SerializableKey },
  );
}

/**
 * countRows — count the rows in the named store. Mirrors
 * dexie-migration.spec.ts L264-288 verbatim.
 */
async function countRows(page: Page, storeName: string): Promise<number> {
  return page.evaluate(
    async (storeName) => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            resolve(-1);
            return;
          }
          const tx = db.transaction(storeName, "readonly");
          const countReq = tx.objectStore(storeName).count();
          countReq.onsuccess = () => resolve(countReq.result);
          countReq.onerror = () => resolve(-1);
        };
        req.onerror = () => resolve(-1);
      });
    },
    storeName,
  );
}

/**
 * seedCascadeRows — write one highlight + one note + one location row
 * directly into Dexie via raw IndexedDB. Mirrors the seedRows discipline
 * from dexie-migration.spec.ts L143-156. The articleId is the freshly-
 * ingested paste-HTML article's id (caller discovers it by reading the
 * articles store after the IngestControl save).
 */
async function seedCascadeRows(
  page: Page,
  articleId: string,
): Promise<void> {
  await page.evaluate(
    async ({ articleId }) => {
      const highlight = {
        schemaVersion: 1,
        id: "hl-cascade-001",
        articleId,
        revision: 1,
        position: { start: 10, end: 30 },
        quote: {
          prefix: "Before ",
          exact: "the highlight",
          suffix: " after.",
        },
        createdAt: "2026-08-13T00:00:00.000Z",
      };
      const note = {
        schemaVersion: 1,
        id: "nt-cascade-001",
        highlightId: "hl-cascade-001",
        text: "Seeded note for the cascade-remove assertion.",
        updatedAt: "2026-08-13T00:00:00.000Z",
      };
      const location = {
        schemaVersion: 1,
        articleId,
        revision: 1,
        graphemeOffset: 42,
        savedAt: "2026-08-13T00:00:00.000Z",
      };
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(
            ["highlights", "notes", "location"],
            "readwrite",
          );
          tx.objectStore("highlights").put(highlight);
          tx.objectStore("notes").put(note);
          tx.objectStore("location").put(location);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { articleId },
  );
}

/**
 * discoverIngestedArticleId — after a paste-HTML ingest, read the articles
 * store and return the single non-fixture id (the freshly-ingested paste
 * article). Fixtures are bundled JSON (not in Dexie); the only row in
 * db.articles is the ingested paste article.
 */
async function discoverIngestedArticleId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const all = await new Promise<string[]>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve([]);
          return;
        }
        const tx = db.transaction("articles", "readonly");
        const getAllReq = tx.objectStore("articles").getAllKeys();
        getAllReq.onsuccess = () =>
          resolve((getAllReq.result ?? []).map((k) => String(k)));
        getAllReq.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
    return all[0] ?? "";
  });
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (mirrors
  // dexie-migration.spec.ts beforeEach L290-330 — clear-rows, NOT
  // deleteDatabase, to avoid the webkit deleteDatabase race).
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = [
          "articles",
          "settings",
          "location",
          "highlights",
          "notes",
        ];
        const existing = stores.filter((s) =>
          db.objectStoreNames.contains(s),
        );
        if (existing.length === 0) {
          resolve();
          return;
        }
        const tx = db.transaction(existing, "readwrite");
        for (const s of existing) {
          tx.objectStore(s).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
});

test.describe("SC#2 + LIB-02 — cascade-remove + confirmation", () => {
  test("removing an article cascades to highlights + notes + location", async ({
    page,
  }) => {
    // 1. Ingest a paste-HTML article via the real Vite Node middleware.
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /paste html/i })
      .fill(PASTE_HTML);
    await page.getByRole("button", { name: /add pasted article/i }).click();
    await page.waitForURL(/#\/article\//, { timeout: 15_000 });

    // 2. Discover the ingested article id + seed cascade rows.
    const articleId = await discoverIngestedArticleId(page);
    expect(articleId, "ingested article id must be non-empty").not.toBe("");
    await seedCascadeRows(page, articleId);

    // Sanity: confirm the seeded rows are present before the cascade.
    expect(
      await readRow(page, "highlights", "hl-cascade-001"),
      "seeded highlight must be present before remove",
    ).not.toBeNull();
    expect(
      await readRow(page, "notes", "nt-cascade-001"),
      "seeded note must be present before remove",
    ).not.toBeNull();
    expect(
      await readRow(page, "location", [articleId, 1]),
      "seeded location must be present before remove",
    ).not.toBeNull();

    // 3. Navigate back to #/. The ingested row appears in the library list.
    //    Use the auto-retrying toHaveCount (the LibraryView load effect
    //    resolves async after mount; .count() snapshots can race the load
    //    on slower engines like webkit).
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const expectedBaselineRows =
      (await import("../../../src/fixtures")).fixtures.length + 1;
    await expect(
      page.locator(".library-list li"),
      "library list includes fixtures + 1 ingested",
    ).toHaveCount(expectedBaselineRows);

    // 4. Click the ingested row's trash button → RemoveConfirm opens.
    //    The ingested row is the one WITHOUT a "Sample" source badge (it
    //    carries a "Pasted" badge instead). We scope by the row's heading
    //    text — the paste article title is deterministic.
    const ingestRow = page
      .locator(".library-list li")
      .filter({ hasText: "Cascade-Remove Test Article" });
    await expect(ingestRow).toBeVisible();
    await ingestRow.locator(".library-row-remove").click();

    // 5. RemoveConfirm dialog opens (byte-stable class + role=alertdialog).
    const dialog = page.locator("dialog.library-remove-confirm");
    await expect(dialog).toBeVisible();

    // 6. Body copy matches UI-SPEC §Copywriting L262 verbatim — Pitfall 8
    //    requires the consequence be named.
    await expect(dialog).toContainText(
      "Remove this article? Your highlights and notes for it will also be removed.",
    );

    // 7. The cancel button ("Keep article") carries data-initial-focus
    //    (Pitfall 8 — non-destructive default; an accidental Enter cannot
    //    remove the article). React renders the no-value JSX attribute as
    //    data-initial-focus="true" in the DOM (boolean attribute behavior).
    const cancelBtn = dialog.locator(".library-remove-cancel");
    await expect(cancelBtn).toHaveAttribute("data-initial-focus", "true");

    // 8. Click "Remove article" (the destructive button). The cascade fires
    //    in one Dexie transaction (D8-13 — article + highlights + notes +
    //    location atomic). LibraryView bumps refreshKey and the row leaves
    //    the list.
    await dialog.locator(".library-remove-destructive").click();

    // 9. The dialog closes; navigation returns to #/ (the reader was on #/
    //    when remove fired). The ingested row is gone.
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".library-list li")).toHaveCount(
      (await import("../../../src/fixtures")).fixtures.length,
    );
    // The removed article's title no longer appears anywhere on #/.
    await expect(
      page.locator(".library-list li").filter({
        hasText: "Cascade-Remove Test Article",
      }),
    ).toHaveCount(0);

    // 10. CASCADE PROOF (D8-13 + T-8-19): every related row is physically
    //     gone from Dexie — not just absent from the rendered list. The
    //     article row, the highlight, the note, and the location are all
    //     removed in one transaction.
    expect(
      await readRow(page, "articles", articleId),
      "article row must be gone after cascade-remove",
    ).toBeNull();
    expect(
      await readRow(page, "highlights", "hl-cascade-001"),
      "highlight must cascade-remove with the article",
    ).toBeNull();
    expect(
      await readRow(page, "notes", "nt-cascade-001"),
      "note must cascade-remove with the article (via highlightId FK)",
    ).toBeNull();
    expect(
      await readRow(page, "location", [articleId, 1]),
      "location must cascade-remove with the article",
    ).toBeNull();
  });

  test("cancel path: Keep article leaves everything intact (Pitfall 8)", async ({
    page,
  }) => {
    // 1. Ingest + seed (same setup as the cascade test above).
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /paste html/i })
      .fill(PASTE_HTML);
    await page.getByRole("button", { name: /add pasted article/i }).click();
    await page.waitForURL(/#\/article\//, { timeout: 15_000 });

    const articleId = await discoverIngestedArticleId(page);
    expect(articleId).not.toBe("");
    await seedCascadeRows(page, articleId);

    const highlightsBefore = await countRows(page, "highlights");
    const notesBefore = await countRows(page, "notes");
    const locationBefore = await countRows(page, "location");
    expect(highlightsBefore, "1 seeded highlight").toBe(1);
    expect(notesBefore, "1 seeded note").toBe(1);
    expect(locationBefore, "1 seeded location").toBe(1);

    // 2. Open the RemoveConfirm dialog.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    const ingestRow = page
      .locator(".library-list li")
      .filter({ hasText: "Cascade-Remove Test Article" });
    await ingestRow.locator(".library-row-remove").click();
    const dialog = page.locator("dialog.library-remove-confirm");
    await expect(dialog).toBeVisible();

    // 3. Click "Keep article" (cancel). Pitfall 8 — the non-destructive
    //    default. No cascade fires.
    await dialog.locator(".library-remove-cancel").click();
    await expect(dialog).not.toBeVisible();

    // 4. The article row is STILL present.
    await expect(
      page.locator(".library-list li").filter({
        hasText: "Cascade-Remove Test Article",
      }),
    ).toHaveCount(1);

    // 5. NO Dexie rows were deleted (T-8-19 — physical proof via countRows).
    expect(await countRows(page, "highlights"), "highlight intact").toBe(
      highlightsBefore,
    );
    expect(await countRows(page, "notes"), "note intact").toBe(notesBefore);
    expect(await countRows(page, "location"), "location intact").toBe(
      locationBefore,
    );
    expect(
      await readRow(page, "articles", articleId),
      "article row intact",
    ).not.toBeNull();
  });
});
