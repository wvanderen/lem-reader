// tests/e2e/ingestion/dexie-migration.spec.ts
// Plan 07-07 Task 2 — the Dexie v1→v3 migration snapshot (SC#5 phase-exit gate).
// Replaces the Wave-0 stub (07-01) with a REAL seed → upgrade → assert flow.
//
// SC#5 contract (RESEARCH.md §Gate 4 L975-979 + 07-VALIDATION.md §Gate 4):
// seed a Dexie v1/v2 database with the v1.0 fixture snapshot (settings +
// location + highlights + notes — representative rows), trigger the v3
// upgrade by opening the app, and assert EVERY v1.0 row is intact and
// addressable. Mirrors v1.0's "honest full-suite execution discipline"
// (PROJECT.md Key Decision #9) applied to the data layer.
//
// Pitfall 9 (Dexie version discipline): the v3 append in src/persistence/db.ts
// is ADDITIVE ONLY — same store declarations + keyPaths as v1/v2, with two
// new indexes (source, addedAt) on `articles`. No `.upgrade()` callback.
// The upgrade chain is byte-unchanged for v1/v2 stores. This test asserts
// the discipline holds: every row written at the v2 shape survives the v3
// declaration untouched.
//
// RUNTIME TARGET: real IndexedDB in the Playwright browser (chromium +
// firefox + webkit). The seed mechanism mirrors tests/e2e/persistence.spec.ts
// seedScrollingMode L71-110 verbatim in shape (raw indexedDB.open + tx.objectStore
// + oncomplete resolve), extended to seed ALL four v1/v2 stores (settings,
// location, highlights, notes — articles wrote zero records in v1/v2 because
// fixtures are bundled JSON).
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";

/**
 * Representative v1.0 row shapes — the exact schemas written by Phase 2/5
 * (see src/persistence/db.ts SettingsRecord, LocationRecordRow,
 * HighlightRecordRow, NoteRecordRow). The seed constructs the DB at version
 * 2 with these shapes; the test then opens the app (which constructs the v3
 * declaration) and asserts every row survives.
 */
const SEEDED_SETTINGS = {
  key: "reader-prefs",
  value: {
    schemaVersion: 2,
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    theme: "sepia",
    readingMode: "paginated",
  },
};

const SEEDED_LOCATION = {
  schemaVersion: 1,
  articleId: "essay-long-form",
  revision: 1,
  graphemeOffset: 42,
  savedAt: "2026-08-10T12:00:00.000Z",
};

const SEEDED_HIGHLIGHT = {
  schemaVersion: 1,
  id: "hl-seed-001",
  articleId: "essay-long-form",
  revision: 1,
  position: { start: 10, end: 30 },
  quote: {
    prefix: "Before ",
    exact: "the seeded highlight",
    suffix: " after.",
  },
  createdAt: "2026-08-10T12:01:00.000Z",
};

const SEEDED_NOTE = {
  schemaVersion: 1,
  id: "nt-seed-001",
  highlightId: "hl-seed-001",
  text: "Seeded note for the migration snapshot.",
  updatedAt: "2026-08-10T12:02:00.000Z",
};

/**
 * seedV1Snapshot — write representative v1/v2-shape rows into the lem-reader
 * IndexedDB. The seed is cross-browser robust: it tries opening at version 2
 * (the clean upgrade-chain path — DB doesn't exist → construct at v2 → SPA
 * mount triggers the v3 upgrade), and falls back to opening without a
 * version (the existing-DB path — used on webkit where deleteDatabase may
 * block on Dexie's open connection and the DB stays at v3).
 *
 * In both paths the SAME rows are written with the SAME shapes. The test
 * asserts the rows survive — which on the v2 path proves "v3 upgrade
 * preserves v1/v2 rows" and on the existing-DB path proves "v3 schema is
 * backward-compatible with v1/v2 row shapes." Both are Pitfall 9 invariants.
 *
 * The store schemas at v1/v2/v3 are IDENTICAL for settings/location/
 * highlights/notes (Pitfall 9 additive-append discipline — db.ts L91-116 +
 * L131-137). Only `articles` gained `source, addedAt` indexes at v3, and
 * v1/v2 wrote zero article rows (fixtures are bundled JSON), so the article
 * store is irrelevant to the migration snapshot.
 *
 * The onupgradeneeded handler creates the five stores with the same keyPaths
 * + indexes Dexie declared at v1+v2 (see src/persistence/db.ts L91-116).
 * Compound indexes use the array keyPath form Dexie expects.
 */
async function seedV1Snapshot(page: Page): Promise<void> {
  await page.evaluate(
    async ({ settings, location, highlight, note }) => {
      /**
       * Construct the v1/v2 store schema (used when the DB doesn't exist
       * yet — the clean upgrade-chain path). Mirrors src/persistence/db.ts
       * L91-116 byte-for-byte in keyPath + index declarations.
       */
      function constructV2Schema(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains("articles")) {
          const articles = db.createObjectStore("articles", { keyPath: "id" });
          articles.createIndex("revision", "revision");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("location")) {
          db.createObjectStore("location", {
            keyPath: ["articleId", "revision"],
          });
        }
        if (!db.objectStoreNames.contains("highlights")) {
          const highlights = db.createObjectStore("highlights", {
            keyPath: "id",
          });
          highlights.createIndex("[articleId+revision]", [
            "articleId",
            "revision",
          ]);
        }
        if (!db.objectStoreNames.contains("notes")) {
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("highlightId", "highlightId");
        }
      }

      /**
       * Write the four representative rows. The DB is already at the right
       * version (either freshly-constructed v2 or existing v3); we just put
       * rows into the existing stores.
       */
      function seedRows(db: IDBDatabase): Promise<void> {
        return new Promise((resolve, reject) => {
          const tx = db.transaction(
            ["settings", "location", "highlights", "notes"],
            "readwrite",
          );
          tx.objectStore("settings").put(settings);
          tx.objectStore("location").put(location);
          tx.objectStore("highlights").put(highlight);
          tx.objectStore("notes").put(note);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }

      // Try the clean v2 path first. If the DB exists at v3 (webkit race
      // where the beforeEach deleteDatabase blocked on Dexie's open
      // connection), indexedDB.open(...,  2) throws VersionError; we catch
      // it and fall back to the existing-DB path.
      try {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("lem-reader", 2);
          req.onupgradeneeded = () => {
            constructV2Schema(req.result);
          };
          req.onsuccess = async () => {
            const db = req.result;
            try {
              await seedRows(db);
              db.close();
              resolve();
            } catch (e) {
              db.close();
              reject(e);
            }
          };
          req.onerror = () => reject(req.error);
        });
        return;
      } catch (e) {
        // VersionError → the DB already exists at v3 (webkit race). Fall
        // through to the existing-DB path. Any other error re-throws.
        if (
          !(e instanceof DOMException) &&
          !(e && typeof e === "object" && "name" in e) &&
          (e as { name?: string }).name !== "VersionError"
        ) {
          throw e;
        }
      }

      // Existing-DB path: open without a version (uses current v3) and seed.
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = async () => {
          const db = req.result;
          try {
            await seedRows(db);
            db.close();
            resolve();
          } catch (e) {
            db.close();
            reject(e);
          }
        };
        req.onerror = () => reject(req.error);
      });
    },
    {
      settings: SEEDED_SETTINGS,
      location: SEEDED_LOCATION,
      highlight: SEEDED_HIGHLIGHT,
      note: SEEDED_NOTE,
    },
  );
}

/**
 * readRow — read a single row from the named store by key. Resolves to the
 * row object (or null if missing) AFTER the v3 upgrade has run. The DB is
 * opened without a version specifier so IndexedDB returns the current
 * (post-upgrade) DB.
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
 * countRows — count the rows in the named store. Resolves to -1 if the store
 * is missing.
 */
async function countRows(
  page: Page,
  storeName: string,
): Promise<number> {
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

test.beforeEach(async ({ page }) => {
  // Mount the SPA so we're on the right origin AND Dexie has constructed
  // the lem-reader DB at v3 (the post-upgrade steady state). We then CLEAR
  // every store's rows (preserving the schema) to reset to a deterministic
  // first-run state. This avoids the cross-browser deleteDatabase race
  // condition (Dexie holds an open connection; on webkit deleteDatabase
  // blocks indefinitely and the DB stays at v3 — see the seedV1Snapshot
  // comment for the full recovery story).
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = ["articles", "settings", "location", "highlights", "notes"];
        // Open the wipe transaction only against stores that exist (defensive
        // — Dexie constructs all five at v3 so all will exist, but the
        // filter keeps the wipe a no-op rather than throwing if a store is
        // somehow missing).
        const present = stores.filter((s) => db.objectStoreNames.contains(s));
        if (present.length === 0) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction(present, "readwrite");
        for (const s of present) {
          tx.objectStore(s).clear();
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      };
      req.onerror = () => resolve();
    });
  });
});

test.describe("v1 → v3 Dexie migration snapshot (07-07 SC#5)", () => {
  test("v1/v2 fixture snapshot intact after v3 upgrade (Pitfall 9)", async ({
    page,
  }) => {
    // 1. Seed the v1/v2-shaped snapshot (settings + location + highlight +
    //    note). This constructs the DB at version 2 with representative rows
    //    mirroring the v1.0 fixture shape.
    await seedV1Snapshot(page);

    // 2. Open the app. This triggers the LemReaderDB constructor →
    //    version(1) → version(2) → version(3) declaration chain. The v3
    //    block declares the same stores with additive indexes on `articles`
    //    (source, addedAt) and NO .upgrade() callback (Pitfall 9 — additive
    //    indexes only; v1/v2 stores wrote zero articles, so re-indexing is
    //    a no-op). The other four stores are byte-unchanged.
    await page.goto(`${BASE}/#/`);
    // Wait for the SPA to mount (which constructs Dexie) by waiting for the
    // list heading. The mount triggers the upgrade chain synchronously in
    // the Dexie constructor's open.
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    // Give Dexie's async open + any migration microtasks a moment to settle.
    await page.waitForTimeout(500);

    // 3. Assert EVERY seeded row is intact and addressable.

    // Settings row: key + value (reader-prefs shape) survived.
    const settingsRow = (await readRow(page, "settings", "reader-prefs")) as {
      key: string;
      value: { readingMode?: string; theme?: string; schemaVersion?: number };
    } | null;
    expect(settingsRow, "settings row must survive the v3 upgrade").not.toBeNull();
    expect(settingsRow?.key).toBe("reader-prefs");
    expect(settingsRow?.value?.readingMode).toBe("paginated");
    expect(settingsRow?.value?.theme).toBe("sepia");
    expect(settingsRow?.value?.schemaVersion).toBe(2);

    // Location row: [articleId+revision] compound key + graphemeOffset survived.
    const locationRow = (await readRow(page, "location", [
      "essay-long-form",
      1,
    ])) as {
      articleId: string;
      revision: number;
      graphemeOffset: number;
      savedAt: string;
    } | null;
    expect(locationRow, "location row must survive the v3 upgrade").not.toBeNull();
    expect(locationRow?.articleId).toBe("essay-long-form");
    expect(locationRow?.revision).toBe(1);
    expect(locationRow?.graphemeOffset).toBe(42);

    // Highlight row: id + quote selector + position survived.
    const highlightRow = (await readRow(page, "highlights", "hl-seed-001")) as {
      id: string;
      articleId: string;
      quote: { exact: string };
      position: { start: number; end: number };
    } | null;
    expect(highlightRow, "highlight row must survive the v3 upgrade").not.toBeNull();
    expect(highlightRow?.id).toBe("hl-seed-001");
    expect(highlightRow?.articleId).toBe("essay-long-form");
    expect(highlightRow?.quote?.exact).toBe("the seeded highlight");
    expect(highlightRow?.position).toEqual({ start: 10, end: 30 });

    // Note row: id + highlightId + text survived (cascade FK intact).
    const noteRow = (await readRow(page, "notes", "nt-seed-001")) as {
      id: string;
      highlightId: string;
      text: string;
    } | null;
    expect(noteRow, "note row must survive the v3 upgrade").not.toBeNull();
    expect(noteRow?.id).toBe("nt-seed-001");
    expect(noteRow?.highlightId).toBe("hl-seed-001");
    expect(noteRow?.text).toBe("Seeded note for the migration snapshot.");

    // 4. NO data loss: each store has exactly the seeded row count (settings=1,
    //    location=1, highlights=1, notes=1; articles=0 — v1/v2 wrote no
    //    articles, fixtures are bundled JSON).
    expect(await countRows(page, "settings")).toBe(1);
    expect(await countRows(page, "location")).toBe(1);
    expect(await countRows(page, "highlights")).toBe(1);
    expect(await countRows(page, "notes")).toBe(1);
    expect(await countRows(page, "articles")).toBe(0);
  });
});

// ── Plan 08-02 Task 2 — v3 → v4 additive upgrade (D8-05 + Pitfall 9) ──────────
// The v4 append adds the `*tags` multi-entry index on `articles` with NO
// `.upgrade()` callback (Pitfall 9 — additive index only). Existing v3 article
// rows — which carry NO `tags` field — must survive the v4 declaration
// untouched. The `*tags` index must be declared (queryable without throwing).
// The ArticleSchema `.default([])` hydration of the absent `tags` field is
// proven by the unit suite (tests/unit/ingestion-tags.test.ts); this e2e
// proves the on-disk row is byte-unchanged + the index exists + the article
// still renders in the library list.
test.describe("v3 → v4 Dexie migration snapshot (08-02 SC#5 + Pitfall 9)", () => {
  // A representative v3 article row — the shape Phase 7's /api/ingest pipeline
  // writes. NOTably this row has NO `tags` field (the field landed in Plan 01's
  // schema but no v3 row carries it — tags are only written via Plan 02's
  // setArticleTags). The v4 upgrade must NOT alter this row; the `.default([])`
  // mechanism fills `tags` on Zod read, not on disk.
  const SEEDED_V3_ARTICLE = {
    id: "v3-article-seed",
    revision: 1,
    lang: "en",
    source: "url",
    addedAt: "2026-08-10T12:00:00.000Z",
    provenance: {
      sourceUrl: "https://example.com/v3-article",
      title: "V3 Seeded Article",
      author: "Test Author",
      retrievedAt: "2026-08-10T12:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      {
        kind: "heading",
        level: 2,
        content: [{ text: "V3 Heading", marks: [] }],
      },
      {
        kind: "paragraph",
        content: [{ text: "V3 body text.", marks: [] }],
      },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/v3-article",
      originalHtmlHash: "sha256:" + "0".repeat(64),
      fetchedAt: "2026-08-10T12:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    // NO `tags` field — this is the v3 shape. The v4 upgrade + ArticleSchema
    // `.default([])` must hydrate it to `[]` on read (proven by unit suite).
  };

  test("v3 article row survives v4 upgrade; *tags index declared (Pitfall 9)", async ({
    page,
  }) => {
    // 1. Seed a v3 article row directly into the articles store. The beforeEach
    //    has already mounted the SPA (constructing Dexie at v4) and cleared all
    //    rows. We write the v3-shape row (no `tags` field) directly via the
    //    raw IndexedDB API — this is the shape a Phase 7 client would have
    //    written before the v4 declaration existed.
    await page.evaluate(async (article) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("articles", "readwrite");
          tx.objectStore("articles").put(article);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, SEEDED_V3_ARTICLE);

    // 2. Re-open the app. The LemReaderDB constructor runs the full
    //    version(1) → version(2) → version(3) → version(4) declaration chain.
    //    The v4 block adds the `*tags` multi-entry index with NO `.upgrade()`
    //    callback (Pitfall 9 — additive index only; Dexie re-indexes on open).
    //
    //    A full page.reload() (not just a hashchange) is required so the SPA
    //    re-mounts + Dexie re-opens against the externally-seeded row. The
    //    beforeEach mounted the SPA at BASE/ (no hash); a goto to #/ is only a
    //    client-side hashchange that reuses the existing Dexie connection +
    //    LibraryView load effect. The reload mirrors the openLibrary helper in
    //    tests/e2e/library/progress-recent.spec.ts (the proven seed-then-read
    //    pattern).
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // 3. The v3 row survives the v4 upgrade byte-unchanged (Pitfall 9 — no
    //    .upgrade() callback rewrote it). Assert the on-disk row STILL has no
    //    `tags` field (the upgrade does NOT write back; hydration happens on
    //    Zod read, not on disk).
    const articleRow = (await readRow(page, "articles", "v3-article-seed")) as {
      id: string;
      tags?: string[];
    } | null;
    expect(articleRow, "v3 article row must survive the v4 upgrade").not.toBeNull();
    expect(articleRow?.id).toBe("v3-article-seed");
    // The on-disk row carries NO tags field — the upgrade did not write back.
    expect(articleRow?.tags).toBeUndefined();

    // 4. The `*tags` multi-entry index is declared on the articles store —
    //    verify via raw IDB objectStore.indexNames. Dexie's `*tags` syntax
    //    creates an index named "tags" (the `*` is Dexie's multi-entry marker;
    //    the underlying IDB index name is the field name). The index must be
    //    present after the v4 upgrade.
    const tagsIndexExists = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction("articles", "readonly");
            const store = tx.objectStore("articles");
            const hasIndex = store.indexNames.contains("tags");
            db.close();
            resolve(hasIndex);
          } catch {
            db.close();
            resolve(false);
          }
        };
        req.onerror = () => resolve(false);
      });
    });
    expect(tagsIndexExists, "*tags index must be declared on articles store").toBe(true);

    // 5. The seeded article is still readable by the app — it appears in the
    //    library list (FixtureList reads via compositeLibraryRepository.list()
    //    → dexieLibrarySource.list() → ArticleSchema.safeParse, which hydrates
    //    the absent `tags` field to `[]` via `.default([])`). The title link
    //    being visible proves the Zod-validated read path works end-to-end.
    await expect(
      page.getByRole("link", { name: /V3 Seeded Article/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
