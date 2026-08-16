// tests/e2e/reduced-motion.spec.ts
// A11Y-06 — under prefers-reduced-motion, NO required animation. The global
// @media (prefers-reduced-motion: reduce) gate in app.css (lines 43-52) sets
// transition/animation to none !important. Phase 2 ships NO transitions on the
// settings panel or its controls, so the gate is trivially satisfied. This
// test guards against a regression that adds a transition.
import { test, expect } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
import { FIXTURES, wipeDatabase, openArticle } from "./annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "./portability/_portability";

const BASE = "http://localhost:5173";
const FIRST_FIXTURE = "essay-long-form";

test.describe("Reduced motion (A11Y-06)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Deterministic first-run state + image stub (the shared e2e harness
    // discipline — annotations/_fixtures.ts wipeDatabase; 06-PATTERNS §Shared
    // Patterns). Plan 06-05 audit (D6-12): every edge spec uses the same
    // harness baseline. Benign to the existing transition/animation assertions.
    await wipeDatabase(page);
  });

  test("the settings panel has no entrance transition", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Computed transition-duration on the panel itself resolves to 0s under the
    // global gate (transition: none !important). The gate wins over any
    // per-element transition the panel might declare.
    const td = await dlg.evaluate(
      (el) => window.getComputedStyle(el).transitionDuration,
    );
    // Accept "0s" or "0ms" (engines vary slightly).
    expect(
      td === "0s" || td === "0ms",
      `panel transition-duration under reduced-motion should be 0s, got "${td}"`,
    ).toBe(true);
  });

  test("panel controls (radio, range, reset) declare no transition", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Sample a representative cross-section of controls.
    const samples = [
      "input[type='radio']",
      "input[type='range']",
      "button.settings-reset",
      "button.settings-close",
    ];
    for (const sel of samples) {
      const td = await page
        .locator(`dialog.settings-panel ${sel}`)
        .first()
        .evaluate((el) => window.getComputedStyle(el).transitionDuration)
        .catch(() => "missing-element");
      // Tolerate "missing-element" if a sample didn't match — the panel must
      // exist but we don't need every selector to be present.
      if (td !== "missing-element") {
        expect(
          td === "0s" || td === "0ms",
          `${sel} transition-duration under reduced-motion should be 0s, got "${td}"`,
        ).toBe(true);
      }
    }
  });

  test("opening the panel does not animate (the gate wins)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    // The animation-name on every element is "none" under the gate.
    const before = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("*"));
      return all.some(
        (el) => window.getComputedStyle(el).animationName !== "none",
      );
    });
    expect(before, "no element should declare an animation name under reduced-motion").toBe(
      false,
    );

    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(page.locator("dialog.settings-panel")).toBeVisible();

    const after = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("*"));
      return all.some(
        (el) => window.getComputedStyle(el).animationName !== "none",
      );
    });
    expect(
      after,
      "opening the panel should not introduce any animation under reduced-motion",
    ).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 10-06 (RECV-01.i): the #/review route under reduced motion. The
  // review block ships NO transition/animation properties (the 10-02/10-05
  // additive CSS is tokens-only), so the global gate is trivially
  // satisfied — assert it in this spec's own idiom (no element on the
  // route declares an animation name under the gate) plus operability
  // (the row jump button still opens the article). Strengthen-only — the
  // transition/animation A11Y-06 assertions above stay authoritative.
  test("review panel renders + operates under reduced-motion (RECV-01.i)", async ({
    page,
  }) => {
    // The beforeEach wipe left the page against a deleted DB — re-mount
    // so Dexie re-declares its schema before seeding (the 10-03 fix).
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible();
    await expect(
      page.getByText("The looting of science fiction").first(),
    ).toBeVisible();
    const article = makeArticle({
      id: "rm-review-corpus",
      title: "The Tide Clerk's Almanac",
      paragraphs: [
        "The tide clerk published the almanac twice a year for forty years, and every edition carried the same apology: that the sea had once again declined to submit its itinerary in advance.",
        "Readers wrote to ask how the predictions could be right so often anyway, and the clerk replied that the sea is not unpredictable, merely unpublished, and that patience is a kind of subscription.",
      ],
    });
    const anchor = confidentHighlightOn(article);
    await seedRows(page, {
      articles: [article],
      highlights: [highlightRow("rm-review-corpus", anchor, "hl-rm-review-1")],
    });
    await page.goto(`${BASE}/#/review`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Go to highlight:/ }).first(),
    ).toBeVisible();
    // The spec's own idiom (see "opening the panel does not animate"): NO
    // element on the route declares an animation name under the gate.
    const animated = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*")).some(
        (el) => window.getComputedStyle(el).animationName !== "none",
      ),
    );
    expect(
      animated,
      "no element on #/review should declare an animation under reduced-motion",
    ).toBe(false);
    // Operable: the confident row's jump button opens the article.
    const rowButton = page
      .getByRole("button", { name: /^Go to highlight:/ })
      .first();
    await expect(rowButton).toBeEnabled();
    await rowButton.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "The Tide Clerk's Almanac" }),
    ).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────
  // D6-09 shared edge-condition invariant (Plan 06-05 audit, D6-12). Under
  // reduced motion the SAME bar holds as every other edge condition:
  // (a) full content reachable via keyboard in BOTH reading modes (the mode
  // toggle is instant + motion-safe under the reduced-motion gate — A11Y-06
  // substrate), (b) required functions reachable, (c) no layout overflow
  // clips content (WCAG 1.4.10). Applied uniformly across the 6-fixture
  // corpus so acceptance means the same thing everywhere. The existing
  // transition/animation A11Y-06 assertions above stay authoritative for
  // the motion substrate; this adds the consolidated invariant.
  // Strengthen-only — no existing assertion removed (D6-12).
  for (const fixture of FIXTURES) {
    test(`shared invariant holds under reduced-motion @ ${fixture} (D6-09)`, async ({
      page,
    }) => {
      await openArticle(page, fixture);
      await assertEdgeInvariant(page, {
        fixture,
        condition: "reduced-motion",
      });
    });
  }
});
