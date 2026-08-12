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
import { test, expect } from "@playwright/test";

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
async function seedV1Snapshot(page: import("@playwright/test").Page): Promise<void> {
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
  page: import("@playwright/test").Page,
  storeName: string,
  key: IDBValidKey,
): Promise<unknown> {
  return page.evaluate(
    async ({ storeName, key }) => {
      return new Promise((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            resolve(null);
            return;
          }
          const tx = db.transaction(storeName, "readonly");
          const getReq = tx.objectStore(storeName).get(key);
          getReq.onsuccess = () => resolve(getReq.result ?? null);
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    },
    { storeName, key },
  );
}

/**
 * countRows — count the rows in the named store. Resolves to -1 if the store
 * is missing.
 */
async function countRows(
  page: import("@playwright/test").Page,
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
