// tests/e2e/imagery/offline-reopen.spec.ts
// Phase 20 Plan 20-08 Task 1 — the IMG-03 offline proof (D20-12): reopening
// a saved figure article renders accepted images from LOCAL blobs and fires
// ZERO third-party requests.
//
// NON-VACUOUS GUARD (the prohibitions block + the 06-04 font-failure
// L16-26 pattern, per 20-PATTERNS L428): a page.route ABORT for every
// non-localhost http(s) URL is registered BEFORE any navigation, and a
// page.on("request") collector records every external URL. Any accidental
// remote fetch is therefore a DOUBLE test failure — the route aborts it
// (the img errors → the decode assertions fail) AND the collector sees it
// (the external array assertion fails). The first cell proves the
// instrument itself is live (an in-page probe fetch IS blocked and IS
// collected) so the empty-array assertions in the article cells can never
// pass vacuously — the Pitfall 1 guard discipline.
//
// Cells:
//   1. guard non-vacuity probe (all engines)
//   2. fixture-corpus figure article reopens → local decode + zero external
//      requests (all engines — registry resolution never touches IndexedDB)
//   3. ingested article + Dexie-persisted asset rows reopen → local decode +
//      zero external requests (chromium + firefox; webkit skip documented —
//      Playwright WebKit cannot put Blob values into IndexedDB, the
//      deferred-items.md engine boundary re-confirmed by 20-05/20-06)
//   4. legacy remote-src figure → the placeholder renders, the remote URL is
//      never fetched (all engines)
import { test, expect, type Page } from "@playwright/test";
import { BASE, openArticle, switchMode, visibleFigureImgs, waitForDecoded, seedImageryArticle, makeFigureArticle, registrySample, sampleBytes } from "./_helpers";

// Every non-localhost http(s) URL is aborted. Registered BEFORE navigation in
// every cell (the RESEARCH §Code Examples sketch's guard, made precise: the
// lookahead excludes ONLY localhost so blob:/data:/about: URLs are never
// routed — local object-URL decode must not be interceptable).
const EXTERNAL_GUARD = /^https?:\/\/(?!localhost)/i;
const GUARD_PROBE_URL = "https://img-guard-probe.example/pixel.png";

/** Register the abort guard + the external-request collector. MUST run
 * before any navigation so no early request can slip past (the font-failure
 * ordering discipline). */
function armGuard(page: Page): { external: () => string[] } {
  const external: string[] = [];
  void page.route(EXTERNAL_GUARD, (route) => route.abort());
  page.on("request", (req) => {
    const url = req.url();
    if (EXTERNAL_GUARD.test(url)) external.push(url);
  });
  return { external: () => external };
}

/** Deterministic first-run wipe WITHOUT any image stub route (wipeDatabase
 * registers a fulfill-stub for image extensions — here the abort guard must
 * be the ONLY image-route authority, or a regression would be silently
 * fulfilled with an SVG instead of loudly aborted). */
async function wipeNoStubs(page: Page): Promise<void> {
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

test.describe("20-08 offline-reopen (IMG-03 / D20-12)", () => {
  test("guard non-vacuity: an external request IS aborted and IS collected (Pitfall 1 guard)", async ({
    page,
  }) => {
    const guard = armGuard(page);
    await wipeNoStubs(page);

    // The in-page probe fetch targets a non-localhost URL: the guard must
    // abort it (fetch rejects) and the collector must record it. This proves
    // both instrument halves fire BEFORE any cell asserts an empty array.
    const outcome = await page.evaluate(
      (url) =>
        fetch(url)
          .then(() => "loaded")
          .catch(() => "blocked"),
      GUARD_PROBE_URL,
    );
    expect(outcome, "the route guard must abort external http(s) requests").toBe("blocked");
    expect(guard.external(), "the collector must see the aborted probe request").toContain(
      GUARD_PROBE_URL,
    );
  });

  test("fixture-corpus figure article reopens with local decode and zero third-party requests", async ({
    page,
  }) => {
    const guard = armGuard(page);
    await wipeNoStubs(page);

    // figure-heavy is the figure corpus article: post-regen (20-04 T1) its
    // two figures carry local asset: refs backed by the bundled registry —
    // the renderer's only inputs are the model + local blobs.
    await openArticle(page, "figure-heavy");
    await switchMode(page); // scrolling: every figure mounts in the visible body

    const imgs = visibleFigureImgs(page);
    await expect.poll(async () => await imgs.count(), { timeout: 10_000 }).toBe(2);
    for (const i of [0, 1]) {
      const img = imgs.nth(i);
      await expect(img).toHaveAttribute("src", /^blob:/);
      await waitForDecoded(img); // naturalWidth > 0 — local decode, not layout
    }

    // IMG-03, literally: the external-request array is empty.
    expect(guard.external(), guard.external().join("\n")).toEqual([]);
  });

  test("ingested article + Dexie asset rows reopen from persisted blobs (zero third-party requests)", async ({
    page,
    browserName,
  }) => {
    // Engine boundary (deferred-items.md, probe-verified 20-05 + re-confirmed
    // 20-06): Playwright WebKit refuses ALL Blob puts into IndexedDB, so the
    // persisted-row seeding cannot run there. Chromium + Firefox carry the
    // Dexie-transport proof; the offline guarantee itself is engine-complete
    // via the fixture-corpus cell above.
    test.skip(
      browserName === "webkit",
      "WebKit cannot store Blob values in IndexedDB (deferred-items.md) — persisted-asset seeding is engine-skipped",
    );

    const jpeg = registrySample("jpeg");
    const webp = registrySample("webp");
    const article = makeFigureArticle({
      id: "figure-heavy-dexie-e2e",
      title: "Dexie-Persisted Figure Essay",
      paragraphs: [
        "This ingested article carries two figures whose bytes live in the Dexie assets store, seeded through the same validated row shape a real save writes.",
        "Reopening it must resolve every figure through the per-article AssetProvider's Dexie path — bulkGetAssets rows become object URLs, and no request ever leaves the origin.",
      ],
      figures: [
        { alt: "A plain JPEG photograph", src: `asset:${jpeg.assetId}`, width: jpeg.width, height: jpeg.height, caption: "The JPEG figure caption." },
        { alt: "A lossless WebP illustration", src: `asset:${webp.assetId}`, width: webp.width, height: webp.height, caption: "The WebP figure caption." },
      ],
    });
    const assets = [
      { assetId: jpeg.assetId, contentType: jpeg.contentType, byteLength: 0, dataBytes: await sampleBytes(jpeg) },
      { assetId: webp.assetId, contentType: webp.contentType, byteLength: 0, dataBytes: await sampleBytes(webp) },
    ];
    for (const a of assets) a.byteLength = a.dataBytes.length;

    const guard = armGuard(page);
    await seedImageryArticle(page, article, assets);
    await openArticle(page, article.id);
    await switchMode(page);

    const imgs = visibleFigureImgs(page);
    await expect.poll(async () => await imgs.count(), { timeout: 10_000 }).toBe(2);
    for (const i of [0, 1]) {
      const img = imgs.nth(i);
      await expect(img).toHaveAttribute("src", /^blob:/);
      await waitForDecoded(img);
    }

    expect(guard.external(), guard.external().join("\n")).toEqual([]);
  });

  test("legacy remote-src figure renders the placeholder; the remote URL is never fetched", async ({
    page,
  }) => {
    const REMOTE_SRC = "https://legacy-publisher.example/wikimedia/tracking.png";
    const article = makeFigureArticle({
      id: "figure-legacy-e2e",
      title: "Legacy Remote Figure Essay",
      paragraphs: [
        "This pre-v2.1 article row still carries a remote http(s) figure src. The renderer must never fetch it — the placeholder surface renders instead (D20-14 / UI-SPEC §Regression Targets deliberate change #1).",
      ],
      figures: [
        {
          alt: "A vintage field photograph that predates local assets",
          src: REMOTE_SRC,
          caption: "The caption outlives the image.",
        },
      ],
    });

    const guard = armGuard(page);
    await seedImageryArticle(page, article);
    await openArticle(page, article.id);
    await switchMode(page);

    // The placeholder renders with the alt visible (D20-06: alt is the
    // recoverable content) and the caption survives (D19-01).
    const placeholders = page.locator(
      ".article-body:not(.article-body-measurement) figure .figure-placeholder",
    );
    await expect(placeholders).toHaveCount(1);
    await expect(placeholders.first()).toContainText("A vintage field photograph that predates local assets");
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure figcaption"),
    ).toContainText("The caption outlives the image.");

    // NO img element exists for the legacy figure (IMG-03 by construction)
    // and the remote URL was never requested (the guard + collector pair).
    await expect(visibleFigureImgs(page)).toHaveCount(0);
    expect(guard.external(), guard.external().join("\n")).toEqual([]);
  });
});
