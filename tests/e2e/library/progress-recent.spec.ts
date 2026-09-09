// tests/e2e/library/progress-recent.spec.ts
// Plan 08-05 Task 2 — SC#5 + LIB-06 phase-exit e2e gate. Proves the per-row
// progress hairline (D8-11), the Finished mark (D8-12), the continue-reading
// strip derivation (D8-09 + D8-10), and the empty-strip spare-chrome contract.
//
// Harness (cloned from happy-path.spec.ts + dexie-migration.spec.ts):
//   - BASE URL:    http://localhost:5173
//   - beforeEach:  image-stub + IndexedDB clear-rows (deterministic state)
//   - Location seeding: page.evaluate raw IndexedDB write (mirrors the
//     dexie-migration.spec.ts seedRows pattern)
//
// Substrate (D-05 grapheme offset):
//   - For each fixture, compute `total = graphemeClusters(normalizeText(
//     article), article.lang).length` (the SAME helpers LibraryRow uses).
//   - Seed a location row at the desired ratio: graphemeOffset = floor(total
//     * ratio). LibraryRow + ContinueReadingStrip read this row + derive the
//     hairline fill (transform: scaleX(ratio)) + the Finished mark (ratio >=
//     FINISHED_THRESHOLD = 0.98).
//
// Threat register:
//   - T-8-19 (Repudiation, false-positive verification) → the hairline fill
//     assertion reads the live transform: scaleX(<value>) inline style; the
//     continue-reading strip count + ordering assertions read the live DOM.
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import {
  normalizeText,
  graphemeClusters,
} from "../../../src/content/normalizeText";

const BASE = "http://localhost:5173";

// A representative fixture for hairline + finished assertions. Picked for
// stable content (won't drift between releases) + a non-trivial grapheme
// length so a 50% offset is comfortably mid-article. Since the 260907-pw1
// single-article starter library, `fixtures` carries ONE bundled article —
// the two continue-reading strip articles are Node-built schema-valid
// standalones (the library-restore.spec.ts makeStandalone discipline) and
// are SEEDED as article rows so the library actually lists them.
const HAIRLINE_FIXTURE = fixtures[0]!;
const HAIRLINE_TOTAL = graphemeClusters(
  normalizeText(HAIRLINE_FIXTURE),
  HAIRLINE_FIXTURE.lang,
).length;

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
      retrievedAt: "2026-08-13T00:00:00.000Z",
      originalHtmlHash: `sha256:${"3".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
  });
}

// Two standalones used for the continue-reading strip derivation (distinct
// ids + titles so row/card filters are deterministic; multi-paragraph bodies
// so mid-article ratios are meaningful).
const STRIP_FIXTURE_A = makeStandalone(
  "progress-recent-strip-a",
  "Quiet Harbor Logbook",
  [
    "The morning inventory listed rope, lantern oil, and one borrowed chronometer whose owner everyone had politely forgotten.",
    "Midday brought the ferry, two letters, and a dispute about whether the west pier counts as part of the harbor at all.",
    "By evening the log was closed with a short note that the tide had been reasonable, which is the highest praise the harbor allows.",
  ],
);
const STRIP_FIXTURE_B = makeStandalone(
  "progress-recent-strip-b",
  "Lantern Field Guide",
  [
    "A field guide begins with the admission that most lanterns are older than the people describing them.",
    "The middle chapters organize flames by patience instead of brightness, which the old keepers insisted was the honest axis.",
    "The final entry is blank on purpose: a place for the reader's own lantern, wherever it happens to be burning.",
  ],
);
const STRIP_TOTAL_A = graphemeClusters(
  normalizeText(STRIP_FIXTURE_A),
  STRIP_FIXTURE_A.lang,
).length;
const STRIP_TOTAL_B = graphemeClusters(
  normalizeText(STRIP_FIXTURE_B),
  STRIP_FIXTURE_B.lang,
).length;

/**
 * seedArticleRows — write ArticleSchema-valid article rows (built in Node)
 * into the articles store via a raw put (the library-restore.spec.ts
 * discipline). MUST run BEFORE openLibrary (seed-before-open).
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
 * seedLocation — write a single LocationRecord row directly into Dexie via
 * raw IndexedDB. Mirrors the seedRows discipline from dexie-migration.spec.ts
 * L143-156. The compound primary key [articleId+revision] is queried as the
 * array [articleId, revision] — the row's articleId + revision fields supply
 * the key (NOT a literal "[articleId+revision]" field).
 */
async function seedLocation(
  page: Page,
  articleId: string,
  graphemeOffset: number,
  savedAt: string,
): Promise<void> {
  await page.evaluate(
    async ({ articleId, graphemeOffset, savedAt }) => {
      const location = {
        schemaVersion: 1 as const,
        articleId,
        revision: 1,
        graphemeOffset,
        savedAt,
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
    { articleId, graphemeOffset, savedAt },
  );
}

/**
 * clearLocations — wipe all rows from the location store. Used by the
 * empty-strip assertion to guarantee no locations remain from prior seeds.
 */
async function clearLocations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("location")) {
          resolve();
          return;
        }
        const tx = db.transaction("location", "readwrite");
        tx.objectStore("location").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

/**
 * Navigate to #/ and wait for the library list to be ready. The LibraryView
 * load effect resolves async after mount; returning before the list renders
 * races the row-count assertions.
 *
 * IMPORTANT: callers MUST seed locations BEFORE invoking openLibrary, OR
 * call page.reload() if they re-seed after openLibrary. The load effect
 * runs ONCE on mount; subsequent hashchanges (e.g. from #/article/<id> back
 * to #/) do NOT remount LibraryView (App.tsx setView state change only —
 * React keeps the same LibraryView instance). Forcing a full reload is the
 * simplest way to re-run the load effect against freshly seeded data.
 */
async function openLibrary(page: Page) {
  // Force a full page reload so the LibraryView load effect re-runs against
  // whatever rows are now in Dexie (location seeds, ingested articles).
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

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (mirrors
  // dexie-migration.spec.ts beforeEach — clear-rows, NOT deleteDatabase, to
  // avoid the webkit deleteDatabase race).
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

test.describe("SC#5 + LIB-06 — progress hairline + continue-reading strip + finished mark", () => {
  test("per-row hairline fill ratio matches seeded graphemeOffset (D8-11)", async ({
    page,
  }) => {
    // Seed a location at 50% — the per-row ProgressHairline should render
    // transform: scaleX(0.5).
    const halfOffset = Math.floor(HAIRLINE_TOTAL * 0.5);
    await seedLocation(page, HAIRLINE_FIXTURE.id, halfOffset, "2026-08-13T00:00:00.000Z");
    // Seed the strip standalones so the "fresh article with no location"
    // row below exists in the library list.
    await seedArticleRows(page, [STRIP_FIXTURE_A]);
    await openLibrary(page);

    // The fixture row carries a .progress-hairline-fill element with
    // transform: scaleX(~0.5). The fill is the inline-style transform
    // written by ProgressHairline.tsx (D8-11).
    const row = page
      .locator(".library-list > li")
      .filter({ hasText: HAIRLINE_FIXTURE.provenance.title });
    await expect(row).toBeVisible();

    const fill = row.locator(".progress-hairline-fill");
    await expect(fill).toBeVisible();

    // A Library progress track is card-local, never reader chrome. Reusing
    // ProgressHairline must not pull the track into the fixed 48px header
    // register that ArticleView owns.
    const track = row.locator(".progress-hairline");
    await expect(track).toHaveCSS("position", "static");
    const [rowBox, trackBox] = await Promise.all([
      row.boundingBox(),
      track.boundingBox(),
    ]);
    expect(rowBox).not.toBeNull();
    expect(trackBox).not.toBeNull();
    expect(trackBox!.x).toBeGreaterThanOrEqual(rowBox!.x);
    expect(trackBox!.x + trackBox!.width).toBeLessThanOrEqual(
      rowBox!.x + rowBox!.width,
    );
    expect(trackBox!.y).toBeGreaterThanOrEqual(rowBox!.y);
    expect(trackBox!.y + trackBox!.height).toBeLessThanOrEqual(
      rowBox!.y + rowBox!.height,
    );

    // The transform is `scaleX(<ratio>)` — extract the ratio with a regex
    // and assert it's close to 0.5 (precision 1 = within 0.05).
    const transform = await fill.evaluate(
      (el) => (el as HTMLElement).style.transform,
    );
    const match = /scaleX\(([\d.]+)\)/.exec(transform);
    expect(match, `transform must match scaleX(<number>): got "${transform}"`).not.toBeNull();
    const ratio = parseFloat(match![1]!);
    expect(ratio).toBeCloseTo(0.5, 1);

    // A fresh article with no location (ratio 0) renders NO hairline. Pick
    // a different fixture (no seeded location) and verify the absence.
    const freshRow = page
      .locator(".library-list > li")
      .filter({ hasText: STRIP_FIXTURE_A.provenance.title });
    await expect(freshRow).toBeVisible();
    await expect(freshRow.locator(".progress-hairline-fill")).toHaveCount(0);
  });

  test("Finished mark at >= 0.98 ratio + hairline at scaleX(1) (D8-12)", async ({
    page,
  }) => {
    // Seed a location at the END of the article (graphemeOffset = total).
    // ratio = total / total = 1.0 >= FINISHED_THRESHOLD (0.98), so the row
    // flips to Finished: hairline hidden, finished-mark visible with text
    // "Finished", filled-circle glyph for forced-colors.
    //
    // (Math.floor(total * 0.98) is NOT enough — for every fixture, the
    // floored offset yields ratio ≈ 0.9798 < 0.98 due to integer truncation.
    // Using `total` itself makes the test deterministic.)
    await seedLocation(page, HAIRLINE_FIXTURE.id, HAIRLINE_TOTAL, "2026-08-13T00:00:00.000Z");
    await openLibrary(page);

    const row = page
      .locator(".library-list > li")
      .filter({ hasText: HAIRLINE_FIXTURE.provenance.title });
    await expect(row).toBeVisible();

    // The Finished mark renders (filled-circle glyph + text). The hairline
    // is HIDDEN when finished (LibraryRow: showHairline = ratio > 0 && !
    // isFinished → ratio=1 → !isFinished=false → hairline hidden).
    const finishedMark = row.locator(".finished-mark");
    await expect(finishedMark).toBeVisible();
    await expect(finishedMark).toContainText("Finished");

    // The hairline is NOT rendered on a Finished row (D8-12 — the mark
    // replaces the hairline).
    await expect(row.locator(".progress-hairline-fill")).toHaveCount(0);
  });

  test("continue-reading strip renders 2 cards sorted most-recently-opened first (D8-09 + D8-10)", async ({
    page,
  }) => {
    // Seed two UNFINISHED locations. The one with the later savedAt appears
    // first in the strip (D8-10 — savedAt descending).
    const halfOffsetA = Math.floor(STRIP_TOTAL_A * 0.5);
    const halfOffsetB = Math.floor(STRIP_TOTAL_B * 0.3);
    await seedArticleRows(page, [STRIP_FIXTURE_A, STRIP_FIXTURE_B]);
    await seedLocation(page, STRIP_FIXTURE_A.id, halfOffsetA, "2026-08-12T00:00:00.000Z");
    await seedLocation(page, STRIP_FIXTURE_B.id, halfOffsetB, "2026-08-13T12:00:00.000Z");
    await openLibrary(page);

    // The ContinueReadingStrip section renders with the byte-stable heading.
    const strip = page.locator(".continue-reading-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Continue reading");

    // 2 cards rendered.
    const cards = strip.locator(".continue-reading-row");
    await expect(cards).toHaveCount(2);

    // The card ordering is savedAt DESC (D8-10 — most-recently-opened first).
    // STRIP_FIXTURE_B has the later savedAt (2026-08-13) so it appears first.
    await expect(cards.first()).toContainText(
      STRIP_FIXTURE_B.provenance.title,
    );
    await expect(cards.nth(1)).toContainText(
      STRIP_FIXTURE_A.provenance.title,
    );
  });

  test("Finished articles leave the continue-reading strip but stay in the main list (D8-12)", async ({
    page,
  }) => {
    // Seed one UNFINISHED + one FINISHED location. The Finished article must
    // NOT appear in the strip (filtered out by FINISHED_THRESHOLD = 0.98)
    // but MUST appear in the main library list with the finished mark.
    //
    // FINISHED offset = total (ratio 1.0, definitely >= 0.98 — Math.floor
    // produces ratio ≈ 0.9798 < 0.98 due to integer truncation, which would
    // NOT mark the article Finished).
    const halfOffsetA = Math.floor(STRIP_TOTAL_A * 0.5);
    await seedArticleRows(page, [STRIP_FIXTURE_A, STRIP_FIXTURE_B]);
    await seedLocation(page, STRIP_FIXTURE_A.id, halfOffsetA, "2026-08-13T12:00:00.000Z");
    await seedLocation(page, STRIP_FIXTURE_B.id, STRIP_TOTAL_B, "2026-08-13T13:00:00.000Z");
    await openLibrary(page);

    // The strip shows only the UNFINISHED article (STRIP_FIXTURE_A).
    const strip = page.locator(".continue-reading-strip");
    await expect(strip).toBeVisible();
    const cards = strip.locator(".continue-reading-row");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(
      STRIP_FIXTURE_A.provenance.title,
    );

    // The Finished article is in the main library list with the mark.
    const finishedRow = page
      .locator(".library-list > li")
      .filter({ hasText: STRIP_FIXTURE_B.provenance.title });
    await expect(finishedRow).toBeVisible();
    await expect(finishedRow.locator(".finished-mark")).toBeVisible();
  });

  test("empty strip: with zero unfinished locations the strip is NOT rendered (spare chrome)", async ({
    page,
  }) => {
    // No locations seeded → strip returns null (spare chrome per UI-SPEC
    // §ContinueReadingStrip). The library list still renders fixtures.
    await clearLocations(page);
    await openLibrary(page);

    await expect(page.locator(".continue-reading-strip")).toHaveCount(0);

    // The library list still renders fixtures (one row per fixture).
    await expect(page.locator(".library-list > li")).toHaveCount(
      fixtures.length,
    );
  });
});
