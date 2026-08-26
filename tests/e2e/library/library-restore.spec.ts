// tests/e2e/library/library-restore.spec.ts
// Plan 15-03 Task 1 — the NAV-03 return-context restore matrix harness
// (D15-11..14 browser truth; plain test() blocks inherit the chromium/
// firefox/webkit matrix by default — the 3-engine run lands at Plan 15-04).
//
// Harness (cloned from reading-views.spec.ts — REUSE-DO-NOT-FORK):
//   - BASE URL:       http://localhost:5173
//   - beforeEach:     image stub + goto BASE + "Saved articles" h1 wait +
//                     raw IndexedDB clear-rows over ["articles","settings",
//                     "location","highlights","notes","books"]. Clear-rows,
//                     NEVER deleteDatabase (the webkit deleteDatabase race).
//   - seedArticleRows: ArticleSchema.parse in Node; raw put into "articles".
//                     Schema-building in Node guarantees the store-seam Zod
//                     read never drops a seeded row.
//   - openView:       goto hash + reload + h1 "Saved articles" + /^All (\d+)/
//                     readiness wait (counts render only at status ready —
//                     present even on empty views).
//
// Seeding discipline: seed BEFORE openView (the LibraryView load effect
// runs once per mount; openView's goto+reload remounts it against the
// freshly seeded rows).
//
// Corpus: 12 standalone articles (≥10 per the plan — enough rows for
// meaningful scroll offsets) with alternating titles/tags so query and tag
// filters have deterministic subsets, plus the six bundled fixture
// articles which are always present (unread) on a cleared location store.
//
// Threat register (15-03 PLAN): T-15-07/T-15-08 (Tampering — snapshot/
// selector) → row lookups use the constant-template selector over ids
// from schema-validated seeded records only; T-15-09 (DoS — restore on
// unready DOM) → every restore assertion waits for the ready signal
// (parenthetical All count) before touching scroll/focus.
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";

const BASE = "http://localhost:5173";

// ── Node-side corpus builders (shipped schemas only — never hand-built rows) ──

/** Build an ArticleSchema-valid standalone article from plain paragraphs.
 * Tagged alternately (salt/ember) so the tag filter has a deterministic
 * half-corpus; titles alternate Lantern/Harbor so the query filter does
 * too (the restore asserts the reader's OWN filter text returns). */
function makeStandalone(
  id: string,
  title: string,
  tag: string,
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-08-20T00:00:00.000Z",
      originalHtmlHash: `sha256:${"2".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
    tags: [tag],
  });
}

/** Prose shared by the corpus builders — varied long-form sentences (no
 * lorem) so the ING round-trip substrate stays honest even though these
 * rows bypass ingestion (raw schema puts). */
function prose(i: number, mood: string): string[] {
  return [
    `Volume ${i} of the ${mood} series opens on a morning the harbor chroniclers all described differently, which the archivists now consider the most honest thing about it.`,
    `The middle chapters follow the keepers through a season of small repairs, careful logs, and one incident involving a lantern, a rowboat, and a sentence no one has finished agreeing on since.`,
    `The closing page simply lists what was saved, and the reader who reaches it tends to sit quietly for a moment before starting the next volume.`,
  ];
}

/** The 12-article restore corpus — ids are ORDER-STABLE (composite-library
 * order is insertion order for raw puts; a00 first, a11 last). */
const CORPUS: CanonicalArticle[] = Array.from({ length: 12 }, (_, i) => {
  const n = String(i).padStart(2, "0");
  const even = i % 2 === 0;
  return makeStandalone(
    `lr-restore-a${n}`,
    even ? `Lantern Ledger Volume ${i}` : `Harbor Notebook Volume ${i}`,
    even ? "salt" : "ember",
    prose(i, even ? "lantern ledger" : "harbor notebook"),
  );
});

/** The full row count after seeding: corpus + the six bundled fixtures. */
const SEEDED_ROW_COUNT = CORPUS.length + fixtures.length;

// ── Seeding helpers (raw IndexedDB puts — the seedArticleRows discipline) ──

/** seedArticleRows — write ArticleSchema-valid article rows (built in Node)
 * into the articles store via a raw put. */
async function seedArticleRows(
  page: Page,
  articles: CanonicalArticle[],
): Promise<void> {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve();
          return;
        }
        const tx = db.transaction("articles", "readwrite");
        for (const row of rows) tx.objectStore("articles").put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, articles);
}

/** Seed the full corpus. MUST run BEFORE openView (seed-before-open
 * discipline — the load effect runs once per mount). */
async function seedCorpus(page: Page): Promise<void> {
  await seedArticleRows(page, CORPUS);
}

/** Delete raw article rows by id while the app is elsewhere (the matrix's
 * row-gone / clamp degradations mutate the corpus from inside Reader). */
async function deleteArticleRows(
  page: Page,
  ids: string[],
): Promise<void> {
  await page.evaluate(async (rowIds) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve();
          return;
        }
        const tx = db.transaction("articles", "readwrite");
        for (const id of rowIds) tx.objectStore("articles").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, ids);
}

/**
 * Navigate to a view URL and wait for the library to settle. goto + reload
 * forces a full remount so the LibraryView load effect re-runs against the
 * seeded rows (the openLibrary discipline). The readiness signal is the
 * parenthetical All count — counts render ONLY at status ready, and unlike
 * `.library-list > li` it is present even on empty views.
 */
async function openView(page: Page, hash: string): Promise<void> {
  await page.goto(`${BASE}/${hash}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
    timeout: 10_000,
  });
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (clear-rows, NOT
  // deleteDatabase — the webkit race). Cloned verbatim from
  // reading-views.spec.ts.
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
          "books",
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

test.describe("NAV-03 — library return-context restore matrix", () => {
  test("harness sentinel: seeded corpus renders 12 + 6 fixture rows and the list overflows the viewport", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // The corpus is present and counted (ready signal already waited for
    // in openView; the row count re-proves it against the rendered list —
    // direct-child selector so nested tag-chip lis never over-count).
    await expect(page.locator(".library-list > li")).toHaveCount(
      SEEDED_ROW_COUNT,
    );

    // Scroll-meaningful: the document overflows the default viewport, so
    // the matrix's scroll captures/restores assert against a real offset.
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollHeight > window.innerHeight + 200,
    );
    expect(overflows).toBe(true);
  });
});
