// tests/e2e/measurement/longtask-smoke.spec.ts
// 260820-beo long-task tripwire — a PROPORTIONATE regression guard for the
// time-sliced measurement pass. A PerformanceObserver watches "longtask"
// entries across a cold open + one deterministic typography warm re-trigger
// of essay-long-form (the text-worst-case fixture); every entry must stay
// ≤ 150ms and the page must collect zero uncaught errors (V7 — measurement
// must never throw to the reader; mirrors stale-drop.spec.ts L43-44, 115).
//
// Honest scope (Pitfall 5 project honesty, mirroring perf.harness.spec.ts):
//   - The 3k-char corpus fixtures CANNOT reproduce the ~100k-grapheme
//     article that motivated the fix — this spec is a tripwire against a
//     regression back to a SYNCHRONOUS full pass (which even on this small
//     fixture would surface as longtasks), not a substitute for the
//     blocking human smoke on the real long article (quick-260820-beo
//     Task 4).
//   - The 150ms bound is a low-flake tripwire, NOT the ~50ms aspirational
//     per-task bound from the task direction: incidental dev-server/Vite
//     first-compile tasks on a cold load can legitimately exceed 50ms. With
//     ~10ms slices the measurement pass itself contributes tasks well
//     under 50ms; a return to an unsliced pass would blow far past 150ms.
//   - `longtask` PerformanceObserver entries are chromium-observable only —
//     firefox/webkit silently never fire them, so a green run there would
//     be MISLEADING (the same Pitfall 5 rationale that confines the CDP
//     throttle + throttled-mobile project to chromium). The spec therefore
//     skips cleanly on non-chromium engines instead of vacuously passing.
//
// 260820 giant-article-freeze reconciliation: the original tripwire reported
// ZERO longtasks while the reader froze on a ~173k-grapheme article — the
// fixture/conditions gap is now understood and closed by the SECOND test
// below:
//   1. Fixture size: essay-long-form is ~3k chars; the freeze needed ~500+
//      blocks for the (now-fixed) quadratic render path to blow up.
//   2. Phases: the freeze lived in open → scroll → mode-switch → page-turn
//      flows the original never exercised.
//   3. Root cause class: the freeze was RENDER-side (per-scroll-event
//      full-article re-renders), not measurement-side — a measurement-only
//      tripwire could never see it.
// The giant-article test synthesizes a deterministic ~170k-char article
// (no network, no fixture bloat) and runs the full reader flow with a
// 250ms longtask budget (observed post-fix dev max: ~141ms; the regression
// class this guards against produces 6,000-12,000ms tasks — 25-50× budget).
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const LONGTASK_BUDGET_MS = 150;

/** Giant-flow budget: observed dev max ~141ms post-fix; regression class is 6-12s. */
const GIANT_LONGTASK_BUDGET_MS = 250;

test.describe("longtask smoke — time-sliced measurement pass (260820-beo)", () => {
  // longtask entries are chromium-observable only (see header). Skipping on
  // firefox/webkit is the honest alternative to a vacuous green run.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "longtask PerformanceObserver entries are chromium-observable only",
  );

  test.beforeEach(async ({ page }) => {
    // Image-stub + IndexedDB-wipe harness — mirrors perf.harness.spec.ts
    // L204-219 exactly (stubbed figures never race the measurement pass;
    // a wiped DB gives deterministic first-run state).
    await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
    );
    await page.goto(`${BASE}/`);
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("lem-reader");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
  });

  test("cold open + one warm typography re-measure produce no longtask over 150ms and zero pageerrors", async ({
    page,
  }) => {
    // Generous cap: the cold phase includes Vite dev-server transforms.
    test.setTimeout(60_000);

    // V7 — measurement must NEVER throw to the reader.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    // Install the longtask observer BEFORE navigation so it captures the
    // full cold-load window (guarded typeof check + try/catch: an engine
    // without longtask support leaves the accumulator empty rather than
    // throwing inside every page).
    await page.addInitScript(() => {
      const w = window as unknown as {
        __lemLongtasks?: Array<{ startTime: number; duration: number }>;
      };
      w.__lemLongtasks = [];
      if (typeof PerformanceObserver === "undefined") return;
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            w.__lemLongtasks!.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        // entryType "longtask" unsupported — accumulator stays empty.
      }
    });

    // Cold phase: open the article and wait for the first trusted commit
    // via the DEV-only __lemLastTrustedConstraints seam (the same hook
    // stale-drop.spec.ts + perf.harness.spec.ts observe).
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints !==
        undefined,
      undefined,
      { timeout: 15_000 },
    );
    // Settle so the cold pass (+ any follow-up image-load triggers inside
    // the 400ms debounce) completes inside the measured window.
    await page.waitForTimeout(500);

    // Warm phase: ONE deterministic typography re-measure. Adaptive like
    // the perf harness's measureWarmSamples — Up when below the SIZE_STEPS
    // midpoint (22), Down otherwise — so the size always changes from any
    // starting value in [18, 24].
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Reading settings", level: 2 }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    const pre = await readTrustedConstraints(page);
    const preSize = pre?.size ?? 18;
    const dir: "ArrowUp" | "ArrowDown" = preSize < 22 ? "ArrowUp" : "ArrowDown";
    await slider.press(dir);
    await page.waitForFunction(
      (preS: number) => {
        const c = (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints as
          | { size: number }
          | undefined;
        return c !== undefined && c.size !== preS;
      },
      preSize,
      { timeout: 15_000 },
    );
    // Settle past the 400ms debounce so a full post-fix sliced pass (plus
    // its commit) lands inside the measured window, then close the panel.
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");

    // Tripwire: every collected longtask entry is within budget.
    const longtasks = await page.evaluate(
      () =>
        (window as unknown as { __lemLongtasks?: Array<{ startTime: number; duration: number }> })
          .__lemLongtasks ?? [],
    );
    const violations = longtasks.filter((t) => t.duration > LONGTASK_BUDGET_MS);
    const maxDuration = longtasks.reduce(
      (max, t) => Math.max(max, t.duration),
      0,
    );
    // Visible in the run output for the task summary (count + worst entry).
    console.log(
      `[longtask-smoke] ${longtasks.length} entries, max ${maxDuration.toFixed(1)}ms (budget ${LONGTASK_BUDGET_MS}ms)`,
    );
    expect(
      violations,
      `longtasks over ${LONGTASK_BUDGET_MS}ms: ${JSON.stringify(violations)}`,
    ).toEqual([]);

    // V7 — no measurement failure surfaced as a reader-visible pageerror.
    expect(pageErrors, "no uncaught errors during cold + warm passes").toEqual([]);
  });

  test("giant-article open/scroll/mode-switch/turn flow produces no longtask over 250ms (260820 freeze class)", async ({
    page,
  }) => {
    // The full reader flow on a ~170k-char / ~570-block article needs more
    // wall time than the small-fixture tripwire (measured dev: ~35-45s).
    test.setTimeout(180_000);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.addInitScript(() => {
      const w = window as unknown as {
        __lemLongtasks?: Array<{ startTime: number; duration: number }>;
        __lemPhase?: string;
      };
      w.__lemLongtasks = [];
      w.__lemPhase = "open";
      if (typeof PerformanceObserver === "undefined") return;
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            w.__lemLongtasks!.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        // entryType "longtask" unsupported — accumulator stays empty.
      }
    });

    // Deterministic synthetic article ~170k chars / ~570 blocks — the shape
    // of the real u-b67e49ade862 (562 blocks, ~173k chars) without network
    // or fixture bloat. Upserted into the (wiped) IndexedDB before route
    // navigation; ArticleSchema-valid by construction.
    //
    // The beforeEach wipe fires versionchange at the LIVE app's Dexie
    // connection — the app reacts with a reload that can destroy an
    // evaluation context mid-put. Re-navigate first (a fresh document on
    // the wiped DB is stable — same flow the 260820 profiler used), and
    // retry the upsert once if a late reload still races it.
    const article = buildGiantSyntheticArticle();
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("load");
    for (let attempt = 0; ; attempt++) {
      try {
        await page.evaluate(async (a: unknown) => {
          await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open("lem-reader");
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction("articles", "readwrite");
              tx.objectStore("articles").put(a);
              tx.oncomplete = () => { db.close(); resolve(); };
              tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
          });
        }, article);
        break;
      } catch (e) {
        if (attempt >= 1) throw e;
        await page.waitForTimeout(1_000);
      }
    }

    // Open (default mode: paginated). Wait for the trusted commit + the
    // first pagination publication, then settle past the 400ms debounce.
    await page.goto(`${BASE}/#/article/${article.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !==
          undefined &&
        ((window as unknown as { __lemPagination?: { pagesLength: number } })
          .__lemPagination?.pagesLength ?? 0) > 0,
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(1_000);

    // Mode-switch to scrolling: the body becomes the tall scroller.
    await page.evaluate(() => {
      (window as unknown as { __lemPhase?: string }).__lemPhase = "scroll";
    });
    await page.keyboard.press("m");
    await page.waitForFunction(
      () =>
        !document.querySelector("main.paginated-main") &&
        document.documentElement.scrollHeight > window.innerHeight * 1.5,
      undefined,
      { timeout: 60_000 },
    );
    // Scroll burst near the bottom (native wheel; the reader's flow).
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1_000);

    // Mode-switch back to paginated (fresh pagination pass + anchor).
    await page.evaluate(() => {
      delete (window as unknown as Record<string, unknown>).__lemPagination;
      (window as unknown as { __lemPhase?: string }).__lemPhase = "turns";
    });
    await page.keyboard.press("m");
    await page.waitForFunction(
      () =>
        ((window as unknown as { __lemPagination?: { pagesLength: number } })
          .__lemPagination?.pagesLength ?? 0) > 0,
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(1_000);

    // Walk back 10 pages, then 5 forward turns — each must advance the
    // current page (functional turn check on the giant article).
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(250);
    }
    const startIdx = (await readPagination(page))?.currentPageIdx ?? 0;
    for (let i = 1; i <= 5; i++) {
      await page.keyboard.press("ArrowRight");
      const advanced = await page
        .waitForFunction(
          (target: number) =>
            (window as unknown as { __lemPagination?: { currentPageIdx: number } })
              .__lemPagination?.currentPageIdx === target,
          startIdx + i,
          { timeout: 15_000 },
        )
        .then(() => true)
        .catch(() => false);
      expect(advanced, `forward turn ${i} advanced to page ${startIdx + i}`).toBe(true);
    }
    await page.waitForTimeout(1_000);

    // Tripwire: the whole flow stayed within the giant-article budget.
    const longtasks = await page.evaluate(
      () =>
        (window as unknown as { __lemLongtasks?: Array<{ startTime: number; duration: number }> })
          .__lemLongtasks ?? [],
    );
    const violations = longtasks.filter((t) => t.duration > GIANT_LONGTASK_BUDGET_MS);
    const maxDuration = longtasks.reduce((max, t) => Math.max(max, t.duration), 0);
    console.log(
      `[longtask-smoke:giant] ${longtasks.length} entries, max ${maxDuration.toFixed(1)}ms (budget ${GIANT_LONGTASK_BUDGET_MS}ms)`,
    );
    expect(
      violations,
      `giant-flow longtasks over ${GIANT_LONGTASK_BUDGET_MS}ms: ${JSON.stringify(violations)}`,
    ).toEqual([]);

    // V7 — no reader-visible pageerror across the whole flow.
    expect(pageErrors, "no uncaught errors during giant-article flow").toEqual([]);
  });
});

/** Read the DEV-only trusted-constraints hook (mirrors perf.harness.spec.ts). */
async function readTrustedConstraints(
  page: Page,
): Promise<{ size: number; viewportWidthPx: number } | null> {
  return await page.evaluate(() => {
    const c = (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints as
      | { size: number; viewportWidthPx: number }
      | undefined;
    return c ?? null;
  });
}

/** Read the DEV-only pagination hook (currentPageIdx + pagesLength). */
async function readPagination(
  page: Page,
): Promise<{ currentPageIdx: number; pagesLength: number } | null> {
  return await page.evaluate(() => {
    const p = (window as unknown as Record<string, unknown>).__lemPagination as
      | { currentPageIdx: number; pagesLength: number }
      | undefined;
    return p ?? null;
  });
}

/**
 * Deterministic synthetic giant article — ~570 blocks / ~170k chars,
 * mirroring the real marxist.com article (u-b67e49ade862: 562 blocks, 509
 * paragraphs + 23 headings + 30 blockquotes, ~173k chars) that motivated
 * the 260820 fix. ArticleSchema-valid by construction (id slug, revision,
 * lang, provenance with required retrievedAt + originalHtmlHash, ≥1 block,
 * footnotes default, tags default).
 */
function buildGiantSyntheticArticle() {
  const blocks: Array<
    | { kind: "heading"; level: 2; content: Array<{ text: string; marks: never[] }> }
    | { kind: "paragraph"; content: Array<{ text: string; marks: never[] }> }
  > = [];
  for (let p = 0; p < 570; p++) {
    if (p % 25 === 0) {
      blocks.push({
        kind: "heading",
        level: 2,
        content: [{ text: `Section ${p}`, marks: [] }],
      });
    }
    let text = `Paragraph ${p}. `;
    while (text.length < 300) {
      text +=
        "The working class took power and held it through months of debate, " +
        "shortages and war, while the institutions of the old state were " +
        "dismantled one by one. ";
    }
    blocks.push({ kind: "paragraph", content: [{ text, marks: [] }] });
  }
  return {
    id: "synthetic-giant-article",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Synthetic giant article (longtask tripwire)",
      retrievedAt: new Date().toISOString(),
      originalHtmlHash: "0".repeat(64),
    },
    blocks,
    footnotes: [],
    tags: [],
  };
}
