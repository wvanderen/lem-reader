// tests/e2e/imagery/refusal-matrix.spec.ts
// Phase 20 Plan 20-08 Task 1 — the calm-refusal proofs (D20-14 one surface;
// D20-06 visible alt; D19-01 captions stay highlightable inside refused
// figures) plus the IMG-05 axe row: an automated AxeBuilder scan (WCAG tags,
// the a11y.spec.ts precedent) against the SEEDED placeholder state.
//
// Why the axe scan lives HERE (per the plan + 20-VALIDATION R2 note): after
// the 20-04 regeneration NO swept fixture renders a placeholder —
// figure-heavy's two figures both converted to accepted assets — so the
// seeded refused/legacy article is the only reader-facing placeholder
// surface an automated scan can sample.
//
// Seeding: plain article rows only (no asset rows, no Blob values) — every
// cell is engine-complete across chromium/firefox/webkit.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  openArticle,
  switchMode,
  totalPages,
  turnToPage,
  makeFigureArticle,
  seedImageryArticle,
  visibleFigureImgs,
} from "./_helpers";

// The a11y.spec.ts axe precedent's exact tag set + import shape (WCAG 2.x
// A/AA rulesets; zero serious/critical violations bar).
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

type AxeViolation = { id: string; impact?: string | null | undefined };
type AxeResultLike = { violations: AxeViolation[] };

function seriousViolations(results: AxeResultLike) {
  return results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
}

const REFUSED_ALT = "A refused skyline photograph that was too large to include";
const REFUSED_CAPTION = "The refused figure caption survives for highlighting.";
const LEGACY_ALT = "A legacy remote portrait from a pre-local-assets save";
const LEGACY_CAPTION = "The legacy figure caption survives too.";

function refusalArticle() {
  return makeFigureArticle({
    id: "figure-refused-e2e",
    title: "Refused Figure Matrix Essay",
    paragraphs: [
      "This essay carries one figure refused at ingest (no src at all) and one legacy figure whose row still carries a remote http address. Both must render the identical calm placeholder with their alt text visible and their captions intact.",
      "Neither figure ever produces an img element, and neither caption loses its highlightability — the reader loses nothing but the pixels.",
    ],
    figures: [
      { alt: REFUSED_ALT, caption: REFUSED_CAPTION },
      { alt: LEGACY_ALT, src: "https://legacy-publisher.example/img/portrait.jpg", caption: LEGACY_CAPTION },
    ],
  });
}

test.describe("20-08 refusal-matrix (D20-14 / D20-06 / D19-01)", () => {
  test("refused + legacy figures render the placeholder with alt visible; captions visible; zero img elements", async ({
    page,
  }) => {
    await seedImageryArticle(page, refusalArticle());
    await openArticle(page, "figure-refused-e2e");
    await switchMode(page); // scrolling: both figures mount in the visible body

    const placeholders = page.locator(
      ".article-body:not(.article-body-measurement) figure .figure-placeholder",
    );
    await expect(placeholders).toHaveCount(2);

    // Refused (no src): the placeholder with the VISIBLE alt (D20-06 — alt
    // is the recoverable content) + the surviving caption (D19-01).
    await expect(placeholders.nth(0)).toContainText(REFUSED_ALT);
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure figcaption").nth(0),
    ).toContainText(REFUSED_CAPTION);

    // Legacy (remote httpUrl src — IMG-03: never fetched, never an img):
    // the IDENTICAL one-surface placeholder (D20-14) + its caption.
    await expect(placeholders.nth(1)).toContainText(LEGACY_ALT);
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure figcaption").nth(1),
    ).toContainText(LEGACY_CAPTION);

    // No code path from a refused/legacy figure to an <img> element.
    await expect(visibleFigureImgs(page)).toHaveCount(0);
  });

  test("caption is highlightable inside a refused figure (D19-01 — capture + render)", async ({
    page,
  }) => {
    await seedImageryArticle(page, refusalArticle());
    await openArticle(page, "figure-refused-e2e"); // paginated default

    // Walk pages until the visible fragment carries the REFUSED figure's
    // figcaption (the capture-highlight.spec.ts walk-pages precedent —
    // figures legitimately live on later pages under the Option A page-1
    // budget), then select its first characters via a native Range.
    const total = await totalPages(page);
    let selected = false;
    for (let target = 0; target < total && !selected; target += 1) {
      await turnToPage(page, target);
      selected = await page.evaluate((captionText) => {
        const figures = Array.from(
          document.querySelectorAll(".page-fragment figure"),
        );
        const refused = figures.find(
          (f) =>
            f.querySelector(".figure-placeholder") !== null &&
            (f.querySelector("figcaption")?.textContent ?? "").includes(captionText),
        );
        if (!refused) return false;
        const cap = refused.querySelector("figcaption");
        if (!cap) return false;
        const walker = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT);
        const first = walker.nextNode() as Text | null;
        if (!first || (first.nodeValue?.length ?? 0) < 4) return false;
        const range = document.createRange();
        range.setStart(first, 0);
        range.setEnd(first, Math.min(10, first.nodeValue?.length ?? 10));
        const sel = window.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }, REFUSED_CAPTION);
    }
    expect(selected, "the refused figure's caption must be selectable on some page").toBe(true);

    // Capture through the real toolbar (the D5-07 eligible-set path).
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(
      page.locator("main [role='status'].visually-hidden").first(),
    ).toContainText(/Highlight saved/i);

    // The mark renders INSIDE the refused figure's figcaption — the caption
    // kept its highlightability though the media refused (D19-01), and the
    // media surface itself still carries no marks (D19-02).
    await expect(
      page.locator(".page-fragment figcaption mark.highlight").first(),
    ).toBeVisible();
    await expect(
      page.locator(".page-fragment figure .figure-placeholder mark.highlight"),
    ).toHaveCount(0);
  });

  test("the refused-figure article opens normally in BOTH modes (paginated + scrolling)", async ({
    page,
  }) => {
    await seedImageryArticle(page, refusalArticle());

    // PAGINATED (first-run default): h1 + placeholder + caption after the
    // walk to the figure's page.
    await openArticle(page, "figure-refused-e2e");
    await expect(
      page.getByRole("heading", { level: 1, name: "Refused Figure Matrix Essay" }),
    ).toBeVisible();
    const total = await totalPages(page);
    let placeholderPage = -1;
    for (let target = 0; target < total && placeholderPage === -1; target += 1) {
      await turnToPage(page, target);
      if (await page.locator(".page-fragment figure .figure-placeholder").count()) {
        placeholderPage = target;
      }
    }
    expect(placeholderPage, "a placeholder must live on some paginated page").toBeGreaterThanOrEqual(0);
    await expect(
      page.locator(".page-fragment figure .figure-placeholder").first(),
    ).toBeVisible();
    await expect(page.locator(".page-fragment figure figcaption").first()).toBeVisible();

    // SCROLLING: same article, same calm surface.
    await switchMode(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Refused Figure Matrix Essay" }),
    ).toBeVisible();
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure .figure-placeholder"),
    ).toHaveCount(2);
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure figcaption").first(),
    ).toBeVisible();
  });

  test("IMG-05 axe row: the seeded placeholder state passes an automated WCAG scan (zero serious/critical)", async ({
    page,
  }) => {
    await seedImageryArticle(page, refusalArticle());
    await openArticle(page, "figure-refused-e2e");
    await switchMode(page); // scrolling: both placeholders in one visible tree

    // The placeholder state must be present BEFORE axe samples it (an empty
    // or pre-mount tree would silently weaken the scan).
    await expect(
      page.locator(".article-body:not(.article-body-measurement) figure .figure-placeholder"),
    ).toHaveCount(2);

    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    const serious = seriousViolations(results);
    const ids = serious.map((v) => v.id);
    // The a11y.spec.ts explicit guards (Pitfall 10 semantics) plus the
    // zero-violation bar.
    expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
    expect(ids).not.toContain("list");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
