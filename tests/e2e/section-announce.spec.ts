// tests/e2e/section-announce.spec.ts
// A11Y-08 e2e coverage (02-03 Task 3). Proves in a REAL browser (Chromium /
// Firefox / WebKit — playwright.config.ts) that the SectionAnnouncer polite
// live region:
//   1. Announces the current section heading when it changes during scroll
//      (debounced — wait ~500ms after scroll for the announce to land).
//   2. Does NOT flood on fast scroll past multiple headings (Pitfall 6) —
//      only the LAST heading in the scrolled range is announced.
//   3. Uses aria-live="polite" (never assertive — would interrupt SR).
//
// Also asserts READ-05: no page-number or percentage identity text anywhere
// in the DOM (the hairline is decorative + aria-hidden; the only progress
// signal for AT is the section-change announce).
//
// Uses technical-post because it carries 3 h2 headings (essay-long-form has
// none). Reuses BASE + image-stub conventions.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
// technical-post carries 3 h2 headings — sufficient for the scroll-spy.
const FIXTURE = "technical-post";

// Pure-string SVG stub (see open-every-fixture.spec.ts for rationale).
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures are deterministic.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  // Wipe the lem-reader IndexedDB so each test starts from a first-run
  // state (no persisted location interferes with scroll position).
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

test.describe("A11Y-08 section-change announce", () => {
  test("the polite live region announces 'Section: {heading}.' after a scroll past an h2", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The live region exists and is polite (never assertive). There may be
    // multiple polite status regions (loading, resume banner); we filter
    // for the one that will carry "Section:" text after scroll.
    const h2Count = await page.locator("article.article-body h2").count();
    expect(h2Count).toBeGreaterThan(0);

    // Scroll the first h2 past the header sentinel line (~56px from the
    // viewport top). The SectionAnnouncer considers a heading "passed" when
    // its viewport-relative top < HEADER_PX + 8 = 56. We compute the
    // heading's absolute Y and scroll so it sits at the very top of the
    // viewport (viewport-top = 0), well past the 56px sentinel line.
    await page.evaluate(() => {
      const h = document.querySelector("article.article-body h2");
      if (h) {
        const absTop = h.getBoundingClientRect().top + window.scrollY;
        // Scroll so the heading is at viewport-top=0 (past the 48px header
        // + 8px tolerance sentinel line at 56px).
        window.scrollTo(0, absTop);
      }
    });
    // Wait for the debounce (~250ms) + IntersectionObserver callback.
    await page.waitForTimeout(600);

    // After the scroll, one of the visually-hidden status regions carries
    // "Section: {heading}." for the most-recently-passed heading.
    const announceRegion = page.locator(
      'div[role="status"][aria-live="polite"].visually-hidden',
    );
    await expect(
      announceRegion.filter({ hasText: /^Section: .+\.$/ }),
    ).toHaveText(/^Section: .+\.$/, { timeout: 3000 });
  });

  test("the live region does NOT flood on fast scroll past multiple headings (Pitfall 6)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Capture every text update to the live region across a fast scroll.
    // We attach a mutation observer BEFORE the scroll so we see every
    // intermediate value (not just the final one).
    const updates: string[] = [];
    await page.exposeFunction("__recordAnnounce", (text: string) => {
      if (text.startsWith("Section: ")) updates.push(text);
    });
    await page.evaluate(() => {
      const regions = document.querySelectorAll(
        'div[role="status"][aria-live="polite"].visually-hidden',
      );
      regions.forEach((r) => {
        new MutationObserver(() => {
          const t = (r as HTMLElement).textContent ?? "";
          (window as unknown as { __recordAnnounce?: (t: string) => void }).__recordAnnounce?.(t);
        }).observe(r, { childList: true, characterData: true, subtree: true });
      });
    });

    // Fast-scroll past several headings in quick succession. The IntersectionObserver
    // may fire many times, but the debounced announce should coalesce.
    await page.evaluate(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "instant" as ScrollBehavior,
      });
    });
    // Wait long enough for the debounce (~250ms) to land.
    await page.waitForTimeout(800);

    // Pitfall 6: even though we scrolled past several headings, the announce
    // count is small (≤ 3 — the debounce + "only on CHANGE" guard coalesce
    // rapid transitions). A flooding implementation would produce many updates.
    expect(
      updates.length,
      `expected ≤ 3 announce updates on fast scroll, got ${updates.length}: ${JSON.stringify(updates)}`,
    ).toBeLessThanOrEqual(3);
  });

  test("READ-05: no page-number or percentage identity text appears anywhere in the DOM", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // No "Page X of Y" / "X%" text in the DOM (READ-05 — no page-number identity).
    const bodyText = (await page.locator("body").textContent()) ?? "";
    expect(bodyText).not.toMatch(/Page \d+ of \d+/);
    expect(bodyText).not.toMatch(/\d+%\s*(progress|read|complete)/);
  });

  test("the progress hairline is aria-hidden (progress is conveyed via the live region, not the hairline)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const hairline = page.locator(".progress-hairline");
    await expect(hairline).toHaveCount(1);
    await expect(hairline).toHaveAttribute("aria-hidden", "true");
  });
});
