// tests/e2e/imagery/decode-matrix.spec.ts
// Phase 20 Plan 20-08 Task 1 — the D20-08 decode matrix: every supported
// raster format (jpeg/png/webp/gif/avif) decodes from LOCAL blobs in all
// three engines (chromium/firefox/webkit) — 5 formats × 3 engines = 15 green
// cells.
//
// SEEDING (the plan's "fixture-registry seeding" option): each cell seeds a
// plain article ROW (structured-clone-safe JSON — no IndexedDB Blob values)
// under the registry-backed id "figure-heavy", so the Dexie row shadows the
// bundled fixture (ingested wins on id collision) while the per-article
// AssetProvider resolves the figure's asset: ref through the bundled
// registry's IN-MEMORY blobs — createObjectURL never touches IndexedDB.
// This keeps the matrix engine-complete on Playwright WebKit, where Blob
// puts into IndexedDB are impossible (deferred-items.md boundary): the
// truth under test is the ENGINE'S CODEC (do these bytes decode?), and the
// registry bytes are byte-identical to what a real save persists (the
// Dexie-transport reopen is separately proven by the offline-reopen
// Dexie-asset cell + the ingestion happy-path cell).
import { test, expect } from "@playwright/test";
import {
  BASE,
  DECODE_FORMATS,
  registrySample,
  switchMode,
  seedImageryArticle,
  makeFigureArticle,
  visibleFigureImgs,
  waitForDecoded,
} from "./_helpers";

test.describe("20-08 decode-matrix (D20-08 — 5 formats × 3 engines, local blobs)", () => {
  for (const format of DECODE_FORMATS) {
    test(`${format} decodes from a local blob (naturalWidth > 0)`, async ({ page }) => {
      const sample = registrySample(format);
      const article = makeFigureArticle({
        id: "figure-heavy", // registry-backed id — resolution never touches Dexie
        title: `Decode Matrix: ${format}`,
        paragraphs: [
          `This registry-backed essay carries a single ${format} figure. Reopening it must decode the bundled bytes locally — no request ever leaves the origin.`,
        ],
        figures: [
          {
            alt: `A ${format} sample photograph`,
            src: `asset:${sample.assetId}`,
            width: sample.width,
            height: sample.height,
            caption: `The ${format} figure caption.`,
          },
        ],
      });
      await seedImageryArticle(page, article);

      // The seeded Dexie row shadows the bundled fixture (ingested wins);
      // the seeded title proves it is the row that rendered.
      await page.goto(`${BASE}/#/article/${article.id}`);
      await expect(
        page.getByRole("heading", { level: 1, name: article.provenance.title }),
      ).toBeVisible();
      await switchMode(page); // scrolling: the figure mounts in the visible body

      const imgs = visibleFigureImgs(page);
      await expect.poll(async () => await imgs.count(), { timeout: 10_000 }).toBe(1);
      const img = imgs.first();
      await expect(img).toHaveAttribute("src", /^blob:/); // local object URL
      await waitForDecoded(img); // naturalWidth > 0 — the engine decoded the bytes

      // The stored model dims ride the img attributes (D20-13
      // belt-and-suspenders) — the decode matrix strengthens the cell with
      // the attribute round-trip.
      await expect(img).toHaveAttribute("width", String(sample.width));
      await expect(img).toHaveAttribute("height", String(sample.height));
    });
  }
});
