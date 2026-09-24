// tests/e2e/library/stats-strip.spec.ts
// Issue #38 — the ambient reading-stats strip ("on the shelf"). Proves the
// acceptance criteria at the real-library level:
//   1. Fresh profile: NO reading-time text anywhere on #/ (strip absent,
//      no "read here" lines — silence IS the empty state);
//   2. After reading: the strip reads "You've read {duration} across
//      {N} visits." in document order INSIDE THE HEADER BLOCK (issue #67
//      — header → strip → continue rail → list), and each read article's
//      card carries the quiet "{duration} read here" meta line;
//   3. "{N} finished." appears ONLY when the finished count is nonzero;
//   4. the per-card line is SUPPRESSED under one minute of accrued time;
//   5. removing the read article shrinks the totals (cascade) — with no
//      history left the strip disappears entirely;
//   6. no streaks/goals/daily-targets/words-read vocabulary anywhere.
//
// Harness (cloned from progress-recent.spec.ts):
//   - BASE URL:    http://localhost:5173
//   - beforeEach:  image-stub + IndexedDB clear-rows (now INCLUDING the
//     v7 readingSessions store — deterministic no-history state)
//   - Seeding:     schema-valid article rows + raw IndexedDB session rows
//     (the stats strip reads recorded sessions; the recorder's own
//     accrual behavior is issue #34's proven contract, tested separately)
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import {
  normalizeText,
  graphemeClusters,
} from "../../../src/content/normalizeText";

const BASE = process.env.LEM_E2E_BASE ?? "http://localhost:5173";

/** Build an ArticleSchema-valid standalone article from plain paragraphs
 * (library-restore.spec.ts makeStandalone discipline — schema-built in
 * Node so the store-seam Zod read never drops a seeded row). */
function makeStandalone(
  id: string,
  title: string,
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-09-15T00:00:00.000Z",
      originalHtmlHash: `sha256:${"7".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
  });
}

// Two standalones with distinct ids/titles so row/card filters are
// deterministic and each article's accrued time is independent.
const STATS_ARTICLE_A = makeStandalone(
  "stats-strip-a",
  "Tide Charts for Landlocked Readers",
  [
    "The first chart maps tides onto kitchen clocks, because the reader we imagine owns no coast and measures everything in meal times.",
    "The second chart drops the metaphor and admits that landlocked tide reading is mostly a hobby about patience.",
    "The closing note suggests keeping the charts near a window anyway, since imaginary water still deserves good light.",
  ],
);
const STATS_ARTICLE_B = makeStandalone(
  "stats-strip-b",
  "A Small Almanac of Weather Sayings",
  [
    "Every almanac of sayings begins by admitting half of them contradict the other half, then prints them anyway.",
    "This one is no different: red skies at night share a page with sailors taking care, and nobody reconciles them.",
  ],
);

/**
 * seedArticleRows — write ArticleSchema-valid article rows (built in Node)
 * into the articles store via a raw put (progress-recent.spec.ts
 * discipline). MUST run BEFORE openLibrary.
 */
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

/**
 * seedReadingSession — write one ReadingSessionRecord row (the #34 shape)
 * directly into the v7 readingSessions store via raw IndexedDB. One row =
 * one recorded visit.
 */
async function seedReadingSession(
  page: Page,
  id: string,
  articleId: string,
  activeSeconds: number,
): Promise<void> {
  await page.evaluate(
    async ({ id, articleId, activeSeconds }) => {
      const row = {
        schemaVersion: 1 as const,
        id,
        articleId,
        startedAt: "2026-09-15T10:00:00.000Z",
        endedAt: "2026-09-15T10:30:00.000Z",
        startOffset: 0,
        endOffset: 100,
        activeSeconds,
      };
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("readingSessions")) {
            resolve();
            return;
          }
          const tx = db.transaction("readingSessions", "readwrite");
          tx.objectStore("readingSessions").put(row);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { id, articleId, activeSeconds },
  );
}

/**
 * countReadingSessions — count the rows in the readingSessions store
 * (the remove-cascade proof: removal must shrink recorded history too).
 */
async function countReadingSessions(page: Page): Promise<number> {
  return page.evaluate(async () => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("readingSessions")) {
          resolve(0);
          return;
        }
        const tx = db.transaction("readingSessions", "readonly");
        const countReq = tx.objectStore("readingSessions").count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(-1);
    });
  });
}

/**
 * seedLocation — write a LocationRecord row (progress-recent.spec.ts
 * discipline) — used to flip an article to Finished for the finished-
 * count sentence.
 */
async function seedLocation(
  page: Page,
  articleId: string,
  graphemeOffset: number,
): Promise<void> {
  await page.evaluate(
    async ({ articleId, graphemeOffset }) => {
      const location = {
        schemaVersion: 1 as const,
        articleId,
        revision: 1,
        graphemeOffset,
        savedAt: "2026-09-15T11:00:00.000Z",
      };
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("location")) {
            resolve();
            return;
          }
          const tx = db.transaction("location", "readwrite");
          tx.objectStore("location").put(location);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { articleId, graphemeOffset },
  );
}

/**
 * Navigate to #/ and wait for the library list to be ready (the
 * progress-recent.spec.ts discipline — seed BEFORE calling, the load
 * effect runs once per mount).
 */
async function openLibrary(page: Page) {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema (v7 —
  // includes readingSessions), then CLEAR every store's rows for a
  // deterministic no-history state (clear-rows, NOT deleteDatabase —
  // the webkit deleteDatabase race).
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
          "readingSessions",
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

test.describe("issue #38 — the ambient reading-stats strip", () => {
  test("fresh profile: no reading-time text anywhere on #/ (silence is the empty state)", async ({
    page,
  }) => {
    await openLibrary(page);

    // No strip, no "read here" lines, no stats vocabulary anywhere.
    await expect(page.locator(".library-stats-strip")).toHaveCount(0);
    await expect(page.locator(".library-row-time-read")).toHaveCount(0);
    const body = await page.locator("main#main").textContent();
    expect(body).not.toContain("You've read");
    expect(body).not.toContain("read here");
    expect(body).not.toMatch(/streak|goal|daily target|words read/i);
  });

  test("after reading: strip in the header block + per-card meta lines", async ({
    page,
  }) => {
    await seedArticleRows(page, [STATS_ARTICLE_A, STATS_ARTICLE_B]);
    // A: two visits totalling 240s → "4 min read here"; B: one visit of 60s
    // → "1 min read here". Whole history: 300s across 3 visits → "5 min".
    await seedReadingSession(page, "visit-a1", STATS_ARTICLE_A.id, 150);
    await seedReadingSession(page, "visit-a2", STATS_ARTICLE_A.id, 90);
    await seedReadingSession(page, "visit-b1", STATS_ARTICLE_B.id, 60);
    await openLibrary(page);

    const strip = page.locator(".library-stats-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("You've read 5 min across 3 visits.");
    // No finished locations — the second sentence is absent (criterion 3).
    await expect(strip).not.toContainText("finished");

    // Document order (issue #67 IA): the strip sits in the HEADER BLOCK —
    // header → strip → continue-reading section → list section.
    const order = await page.evaluate(() => {
      const header = document.querySelector(".library-header");
      const strip = document.querySelector(".library-stats-strip");
      const continueSection = document.querySelector(
        ".library-section-continue",
      );
      const list = document.querySelector(".library-section-list");
      if (!header || !strip || !continueSection || !list) return false;
      return (
        Boolean(
          header.compareDocumentPosition(strip) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ) &&
        Boolean(
          strip.compareDocumentPosition(continueSection) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ) &&
        Boolean(
          continueSection.compareDocumentPosition(list) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        )
      );
    });
    expect(order).toBe(true);

    // Plain text, no interactive elements (no new keyboard stops).
    expect(await strip.locator("a, button, input, [tabindex]").count()).toBe(0);

    // The just-read articles' cards carry the quiet meta line.
    const rowA = page
      .locator(".library-list > li")
      .filter({ hasText: STATS_ARTICLE_A.provenance.title });
    await expect(rowA.locator(".library-row-time-read")).toHaveText(
      "4 min read here",
    );
    const rowB = page
      .locator(".library-list > li")
      .filter({ hasText: STATS_ARTICLE_B.provenance.title });
    await expect(rowB.locator(".library-row-time-read")).toHaveText(
      "1 min read here",
    );
  });

  test("'N finished.' appears only when the finished count is nonzero", async ({
    page,
  }) => {
    await seedArticleRows(page, [STATS_ARTICLE_A]);
    await seedReadingSession(page, "visit-a1", STATS_ARTICLE_A.id, 300);
    // No location → 0 finished → sentence absent (covered above); now make
    // A finished: a location at the full grapheme offset (>= 0.98 ratio).
    const total = graphemeClusters(
      normalizeText(STATS_ARTICLE_A),
      STATS_ARTICLE_A.lang,
    ).length;
    await seedLocation(page, STATS_ARTICLE_A.id, total);
    await openLibrary(page);

    const strip = page.locator(".library-stats-strip");
    await expect(strip).toContainText("You've read 5 min across 1 visit.");
    await expect(strip).toContainText("1 finished.");

    // The finished article's card still carries its time-read line.
    const rowA = page
      .locator(".library-list > li")
      .filter({ hasText: STATS_ARTICLE_A.provenance.title });
    await expect(rowA.locator(".finished-mark")).toBeVisible();
    await expect(rowA.locator(".library-row-time-read")).toHaveText(
      "5 min read here",
    );
  });

  test("under one minute: the strip still reads, but the card line is suppressed", async ({
    page,
  }) => {
    await seedArticleRows(page, [STATS_ARTICLE_A]);
    await seedReadingSession(page, "visit-a1", STATS_ARTICLE_A.id, 45);
    await openLibrary(page);

    // The visit is real — the strip reads (in words, never "0 min").
    const strip = page.locator(".library-stats-strip");
    await expect(strip).toContainText(
      "You've read under a minute across 1 visit.",
    );
    // …but under a minute of accrued time silences the card line.
    const rowA = page
      .locator(".library-list > li")
      .filter({ hasText: STATS_ARTICLE_A.provenance.title });
    await expect(rowA.locator(".library-row-time-read")).toHaveCount(0);
  });

  test("removing the read article shrinks the totals; no history left — the strip disappears", async ({
    page,
  }) => {
    await seedArticleRows(page, [STATS_ARTICLE_A]);
    // ALL recorded history belongs to A (two visits, 300s total).
    await seedReadingSession(page, "visit-a1", STATS_ARTICLE_A.id, 180);
    await seedReadingSession(page, "visit-a2", STATS_ARTICLE_A.id, 120);
    await openLibrary(page);

    const strip = page.locator(".library-stats-strip");
    await expect(strip).toContainText("You've read 5 min across 2 visits.");

    // Remove A: row trash button → RemoveConfirm → "Remove article".
    const rowA = page
      .locator(".library-list > li")
      .filter({ hasText: STATS_ARTICLE_A.provenance.title });
    await rowA.getByRole("button", {
      name: `Remove ${STATS_ARTICLE_A.provenance.title} from library`,
    }).click();
    await page.getByRole("button", { name: "Remove article" }).click();
    await expect(rowA).toHaveCount(0);

    // The cascade removed A's session rows (the #34 v7 articleId index) —
    // and with no history left, the strip disappears ENTIRELY (no zeros).
    await expect(strip).toHaveCount(0);
    expect(await countReadingSessions(page)).toBe(0);
  });
});
