// tests/e2e/readaloud/read-aloud-band.spec.ts
// Issue #90 review follow-up — the expanded-band reservation in a REAL
// browser (jsdom is not authoritative for layout). While a session exists
// ReadAloudBar publishes the pill's live rendered height as --readaloud-h
// on <body> and app.css spends it so article text never hides behind the
// playing bar:
//   - scrolling mode: the flow pads; the last prose scrolls clear ABOVE
//     the band (window.scrollTo — the a11y.spec.ts scrolling precedent).
//   - paginated mode: the pinned surface shrinks by the band's intrusion
//     past the calm inset so the engine repaginates the band away — the
//     surface's bottom edge lands at the band's top edge.
// Idle publishes nothing (the 48px calm inset already covers the quiet
// entry) and the property is un-published at session end.
//
// Narrow 375×667 on purpose: the full transport wraps there, so the band
// is at its tallest — the worst case the PR's own manual check calls for.
// Harness cloned from read-aloud.spec.ts (REUSE-DO-NOT-FORK): controllable
// fake speech + image stub + raw IndexedDB reset.
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import { installFakeSpeech, type SpeechMode } from "./_speech";
import { BASE, clearAllRows, playAndAwaitProbe } from "./_harness";
// The published property name is asserted LIVE from the component (one
// rename site — same discipline as FOLLOW_LABELS).
import { READALOUD_HEIGHT_VAR } from "../../../src/reader/ReadAloudBar";

const ARTICLE = fixtures[0]!;
const ARTICLE_HREF = `#/article/${ARTICLE.id}`;

test.use({ viewport: { width: 375, height: 667 } });

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

async function openArticle(page: Page, mode: SpeechMode): Promise<Page> {
  await installFakeSpeech(page, mode);
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await clearAllRows(page);
  await page.goto(`${BASE}/${ARTICLE_HREF}`);
  return page;
}

async function publishedHeight(page: Page): Promise<string> {
  return page.evaluate(
    (name) => document.body.style.getPropertyValue(name),
    READALOUD_HEIGHT_VAR,
  );
}

/** The band's top edge, the reading flow's last prose bottom (scrolling
 * mode — no measurement clone exists there), and in paginated mode the
 * lowest leaf text box inside the pinned surface, in one snapshot. */
async function bandGeometry(page: Page): Promise<{
  bandTop: number | null;
  lastProseBottom: number | null;
  surfaceBottom: number | null;
  paginatedLeafBottom: number | null;
}> {
  return page.evaluate(() => {
    const rect = (el: Element | null | undefined) =>
      el ? el.getBoundingClientRect() : null;
    const paragraphs = document.querySelectorAll(".article-body p");
    // The current page's lowest leaf box: content order is reading order in
    // the fragment tree, but the leaf max survives any nesting the block
    // renderer emits. No leaves yet = pagination still pending.
    let paginatedLeafBottom: number | null = null;
    for (const el of document.querySelectorAll(".page-viewport *")) {
      if (el.children.length > 0) continue;
      const bottom = el.getBoundingClientRect().bottom;
      paginatedLeafBottom =
        paginatedLeafBottom === null
          ? bottom
          : Math.max(paginatedLeafBottom, bottom);
    }
    return {
      bandTop: rect(document.querySelector(".readaloud-cluster"))?.top ?? null,
      lastProseBottom: rect(paragraphs[paragraphs.length - 1])?.bottom ?? null,
      surfaceBottom: rect(
        document.querySelector("article.paginated-surface"),
      )?.bottom ?? null,
      paginatedLeafBottom,
    };
  });
}

test.describe("Issue #90 — the expanded-band reservation", () => {
  test.setTimeout(90_000);

  test("scrolling mode: the flow pads and the last prose scrolls clear of the band", async ({
    page,
  }) => {
    await openArticle(page, "word");
    // The default is paginated; flip to scrolling via the shared header
    // toggle (the mode-switch-anchor.spec.ts precedent).
    await page.getByRole("button", { name: /Reading mode:/ }).click();
    await expect(page.locator("#main")).not.toHaveClass(/paginated-main/);

    // Idle publishes nothing — the quiet entry fits the calm inset.
    expect(await publishedHeight(page)).toBe("");

    await playAndAwaitProbe(page);
    const cluster = page.locator(".readaloud-cluster");
    const measured = await cluster.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    expect(await publishedHeight(page)).toBe(`${measured}px`);

    // Scroll to the very bottom: the last prose must sit at or above the
    // band's top edge — nothing hides behind the playing bar (1px tolerance
    // for hairline rounding).
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect
      .poll(async () => {
        const { lastProseBottom, bandTop } = await bandGeometry(page);
        return lastProseBottom !== null && bandTop !== null
          ? lastProseBottom - bandTop
          : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(1);

    // Session end un-publishes — idle reserves nothing again.
    await page
      .locator(".readaloud-bar")
      .getByRole("button", { name: "Stop" })
      .click();
    await expect(
      page.locator(".readaloud-bar").getByRole("button", { name: "Read aloud" }),
    ).toBeVisible();
    expect(await publishedHeight(page)).toBe("");
  });

  test("paginated mode: the pinned surface repaginates to the band's top edge", async ({
    page,
  }) => {
    // Paginated is the default — no toggle.
    await openArticle(page, "word");
    await expect(page.locator("article.paginated-surface")).toBeVisible();

    // Idle: the surface spans the full budget (calm inset, no band).
    const idleSurfaceBottom = (await bandGeometry(page)).surfaceBottom;
    expect(idleSurfaceBottom).not.toBeNull();

    await playAndAwaitProbe(page);
    expect(await publishedHeight(page)).not.toBe("");

    // The engine repaginates to the shrunk budget: the CSS surface lands at
    // the band's top edge, AND the current page's lowest text box scrolls
    // with it — the guard's correction commit (poll waits it out; no leaves
    // yet = still pending, never a false pass).
    await expect
      .poll(async () => {
        const { surfaceBottom, bandTop, paginatedLeafBottom } =
          await bandGeometry(page);
        if (
          surfaceBottom === null ||
          bandTop === null ||
          paginatedLeafBottom === null
        ) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(surfaceBottom, paginatedLeafBottom) - bandTop;
      })
      .toBeLessThanOrEqual(1);
    // ...and the reservation actually gave something up versus idle (the
    // wrapped band at 375px intrudes past the calm inset).
    const playing = await bandGeometry(page);
    expect(playing.surfaceBottom!).toBeLessThan(idleSurfaceBottom!);

    await page
      .locator(".readaloud-bar")
      .getByRole("button", { name: "Stop" })
      .click();
    await expect(
      page.locator(".readaloud-bar").getByRole("button", { name: "Read aloud" }),
    ).toBeVisible();
    expect(await publishedHeight(page)).toBe("");
  });
});
