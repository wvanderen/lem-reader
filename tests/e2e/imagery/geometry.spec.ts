// tests/e2e/imagery/geometry.spec.ts
// Phase 20 Plan 20-08 Task 1 — the IMG-05/06 geometry proofs over 20-04's
// renderer (D20-13 reserved geometry; Pitfall 3 media cap; Pitfall 5
// decode-is-paint):
//
//   1. reserved-vs-rendered aspect: each visible figure img's
//      clientWidth/clientHeight ratio equals its STORED w/h ratio — including
//      the EXIF-rotated fixture (stored 200×320), whose DECODED natural
//      ratio must match too (orientation-corrected decode inside the
//      orientation-corrected reserved box).
//   2. page-count identity across image load events: opening figure-heavy in
//      paginated mode, walking every page so every visible img genuinely
//      loads, leaves the page count IDENTICAL with no fallback banner —
//      decode is paint, never layout (IMG-06 / T-20-15).
//   3. the placeholder renders in BOTH reading modes with the caption
//      visible (D20-14; mode-independent surface).
//   4. a stored TALL aspect letterboxes under the media cap instead of
//      tripping the atomic-oversize fallback (Pitfall 3 — no figure box can
//      exceed a page).
//
// Engine coverage: every cell is engine-complete. Cells 1-2 run on the
// figure-heavy fixture (registry-backed local blobs — no IndexedDB writes);
// cells 3-4 seed plain article rows (cell 4 under the registry-backed id so
// its figure resolves without a Blob put — the plan's fixture-registry
// seeding option).
import { test, expect } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import {
  openArticle,
  switchMode,
  totalPages,
  turnToPage,
  findPageWith,
  makeFigureArticle,
  registrySample,
  seedImageryArticle,
  visibleFigureImgs,
  waitForDecoded,
} from "./_helpers";

const figureHeavy = fixtures.find((a) => a.id === "figure-heavy")!;

test.describe("20-08 geometry (IMG-05/IMG-06 — D20-13 reserved geometry)", () => {
  test("reserved-vs-rendered aspect: client box ratio equals the stored w/h ratio, incl. the EXIF-rotated fixture", async ({
    page,
  }) => {
    // Viewport tall enough that BOTH fixture boxes sit UNDER the media cap
    // (cap = (1000 − 144) × 0.5 = 428 > 320): uncapped, the img's
    // width/height attributes size the box EXACTLY to the stored dims — the
    // pure reserved-vs-rendered identity. (Under the cap the box clamps
    // height while the attributes pin width — the tall-figure cell below
    // owns the capped geometry.)
    await page.setViewportSize({ width: 1280, height: 1000 });
    await openArticle(page, "figure-heavy");
    await switchMode(page); // scrolling: every figure mounts in the visible body

    const imgs = visibleFigureImgs(page);
    await expect.poll(async () => await imgs.count(), { timeout: 10_000 }).toBe(2);
    // Decode BOTH first so the natural-ratio assertion samples settled state.
    for (const i of [0, 1]) await waitForDecoded(imgs.nth(i));

    const boxes = await page.evaluate(() => {
      const imgs = Array.from(
        document.querySelectorAll(
          ".article-body:not(.article-body-measurement) figure img",
        ),
      );
      return imgs.map((el) => {
        const img = el as HTMLImageElement;
        const idx = Number(img.closest("figure")?.getAttribute("data-block-index"));
        return {
          idx,
          clientWidth: img.clientWidth,
          clientHeight: img.clientHeight,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        };
      });
    });
    expect(boxes.length, "both fixture figures must be measured").toBe(2);

    for (const box of boxes) {
      const block = figureHeavy.blocks[box.idx];
      expect(block?.kind, `block ${box.idx} must be the figure block`).toBe("figure");
      if (block?.kind !== "figure") continue;
      const { width, height } = block;
      expect(width, "the regenerated fixture carries stored dims").toBeDefined();
      expect(height, "the regenerated fixture carries stored dims").toBeDefined();
      // Reserved-vs-rendered: the LAID-OUT box honors the stored ratio —
      // through the max-height cap the box re-proportions (aspect-ratio +
      // object-fit: contain letterboxing), it never distorts (D20-13).
      const rendered = box.clientWidth / box.clientHeight;
      const stored = width! / height!;
      expect(
        Math.abs(rendered - stored),
        `block ${box.idx}: client ratio ${rendered.toFixed(3)} must equal stored ratio ${stored.toFixed(3)}`,
      ).toBeLessThanOrEqual(0.03);

      // The EXIF-rotated fixture (stored 200×320 — orientation-corrected at
      // ingest, D20-13): the DECODED natural ratio must match the stored box
      // (browsers apply orientation 6 → naturalWidth 200 / naturalHeight 320)
      // so the letterbox never shows slivers inside the reserved box.
      if (width === 200 && height === 320) {
        const natural = box.naturalWidth / box.naturalHeight;
        expect(
          Math.abs(natural - 200 / 320),
          `EXIF figure: decoded ratio ${natural.toFixed(3)} must equal the orientation-corrected stored ratio 0.625`,
        ).toBeLessThanOrEqual(0.05);
      }
    }
  });

  test("page-count identity across image load events — no fallback banner (decode is paint, not layout)", async ({
    page,
  }) => {
    // Paginated default. Wait for the engine's first commit, capture the
    // page count, then WALK EVERY PAGE so each page's visible imgs
    // genuinely load (loading="lazy" decodes on approach). If image load
    // could move layout, the overflow guard / re-measure loop would
    // repaginate mid-walk and the count would drift (IMG-06 / T-20-15).
    await openArticle(page, "figure-heavy");
    const pagesBefore = await totalPages(page);
    expect(pagesBefore, "figure-heavy must paginate").toBeGreaterThan(0);

    let decodedImgs = 0;
    for (let target = 0; target < pagesBefore; target += 1) {
      await turnToPage(page, target);
      const onThisPage = page.locator(".page-fragment figure img");
      const count = await onThisPage.count();
      for (let i = 0; i < count; i += 1) {
        await waitForDecoded(onThisPage.nth(i));
        decodedImgs += 1;
      }
    }
    // figure-heavy's two figures both live on SOME page — the walk must have
    // decoded them (non-vacuous: an empty walk would prove nothing).
    expect(decodedImgs, "the walk must decode both fixture figures").toBe(2);

    // Page-count identity: the count after all load events equals the count
    // before them, and the honest fallback banner NEVER mounted.
    const pagesAfter = await totalPages(page);
    expect(pagesAfter, "image load events must not change the page count").toBe(pagesBefore);
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  });

  test("refused-figure placeholder renders in BOTH modes with the caption visible", async ({
    page,
  }) => {
    const article = makeFigureArticle({
      id: "figure-refused-geometry-e2e",
      title: "Refused Figure Geometry Essay",
      paragraphs: [
        "A refused figure omits its src entirely; the placeholder owns the media box and the caption renders beneath it identically in both reading modes.",
      ],
      figures: [
        {
          alt: "A refused skyline photograph",
          caption: "The refused figure caption.",
        },
      ],
    });
    await seedImageryArticle(page, article);

    // PAGINATED (first-run default): walk to the page carrying the
    // placeholder (the D13-09 walk-pages discipline).
    await openArticle(page, article.id);
    const pageIdx = await findPageWith(page, "figure .figure-placeholder");
    expect(pageIdx, "the placeholder must live on some paginated page").toBeGreaterThanOrEqual(0);
    await expect(
      page.locator(".page-fragment figure .figure-placeholder").first(),
    ).toBeVisible();
    await expect(page.locator(".page-fragment figure figcaption").first()).toContainText(
      "The refused figure caption.",
    );

    // SCROLLING: the same surface, the same caption.
    await switchMode(page);
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure .figure-placeholder"),
    ).toHaveCount(1);
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure figcaption"),
    ).toContainText("The refused figure caption.");
  });

  test("tall stored aspect letterboxes under the media cap — no oversize fallback banner (Pitfall 3)", async ({
    page,
  }) => {
    // Seeded under the registry-backed id so the figure RESOLVES without an
    // IndexedDB Blob put (engine-complete; the plan's fixture-registry
    // seeding option). Stored 120×900 is far taller than any page content
    // box — the media cap must letterbox it, never trip dom-fallback.
    const jpeg = registrySample("jpeg");
    const article = makeFigureArticle({
      id: "figure-heavy",
      title: "Tall Infographic Essay (Registry)",
      paragraphs: [
        "This registry-backed essay carries one deliberately tall figure: its stored aspect exceeds a page, so the media cap is the only thing keeping pagination stable.",
        "The reader still gets every page; the figure letterboxes calmly inside its reserved box.",
      ],
      figures: [
        {
          alt: "A tall infographic",
          src: `asset:${jpeg.assetId}`,
          width: 120,
          height: 900,
          caption: "The tall figure caption.",
        },
      ],
    });
    await seedImageryArticle(page, article);

    // The seeded Dexie row shadows the bundled fixture (ingested wins on id
    // collision) — the h1 proves the seeded article is what rendered.
    // openArticle also waits for the pagination engine's first commit (a
    // bare goto would race "Preparing pages…" and find no pages to walk).
    await openArticle(page, article.id);
    await expect(
      page.getByRole("heading", { level: 1, name: article.provenance.title }),
    ).toBeVisible();

    const pageIdx = await findPageWith(page, "figure img");
    expect(pageIdx, "the tall figure must live on some paginated page").toBeGreaterThanOrEqual(0);
    const img = page.locator(".page-fragment figure img").first();
    await waitForDecoded(img); // the letterboxed paint, not just the box

    const box = await img.evaluate((el) => {
      const img = el as HTMLImageElement;
      const cs = getComputedStyle(img);
      return {
        clientHeight: img.clientHeight,
        clientWidth: img.clientWidth,
        attrWidth: Number(img.getAttribute("width")),
        maxHeight: cs.maxHeight,
      };
    });
    // The cap resolves to a px used value (calc over 100dvh); fall back to
    // the derived viewport arithmetic when an engine reports the raw calc.
    const parsed = parseFloat(box.maxHeight);
    const cap = Number.isFinite(parsed) && box.maxHeight.endsWith("px")
      ? parsed
      : (await page.evaluate(() => window.innerHeight) - 48 - 2 * 48) * 0.5;
    // The stored height (900) far exceeds the cap — the box must CLAMP to
    // the cap (Pitfall 3: no figure box can exceed a page) while the
    // attribute pins the width at the stored 120px (the box never widens;
    // object-fit: contain letterboxes the PAINT inside, distortion-free).
    expect(
      box.clientHeight,
      `the tall figure's box (${box.clientHeight}px) must clamp to the media cap (${cap}px)`,
    ).toBeLessThanOrEqual(cap + 1);
    expect(Math.abs(box.clientHeight - cap)).toBeLessThanOrEqual(1);
    expect(box.clientWidth).toBe(box.attrWidth);
    // And the article PAGINATED — no honest dom-fallback for the whole page.
    expect(await totalPages(page)).toBeGreaterThan(0);
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  });
});
