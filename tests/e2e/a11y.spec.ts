// tests/e2e/a11y.spec.ts
// axe-core harness across the fixture-list route and every article view,
// under the WCAG 2.2 AA ruleset, across the three browser engines declared in
// playwright.config.ts (Chromium, Firefox, WebKit). Asserts zero serious or
// critical violations, and explicitly guards Pitfall 10 (heading-order and
// list-semantics regressions) which are the high-risk a11y failures for a
// semantic renderer.
//
// axe reports only automatable issues — these tests do NOT replace the manual
// keyboard and screen-reader passes documented in VALIDATION.md Manual-Only
// Verifications (performed before /gsd-verify-work).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../src/fixtures";
import { wipeDatabase } from "./annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "./portability/_portability";

const BASE = "http://localhost:5173";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;
// Pure-string SVG stub (see open-every-fixture.spec.ts for rationale).
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

type AxeViolation = { id: string; impact?: string | null | undefined };
type AxeResultLike = { violations: AxeViolation[] };

function seriousViolations(results: AxeResultLike) {
  return results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
});

test("fixture list: zero serious/critical WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const serious = seriousViolations(results);
  const ids = serious.map((v) => v.id);
  expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
  expect(ids).not.toContain("list");
  expect(serious).toEqual([]);
});

for (const article of fixtures) {
  test.describe(`a11y ${article.id}`, () => {
    test("zero serious/critical violations; no heading-order or list violations (Pitfall 10)", async ({
      page,
    }) => {
      await page.goto(`${BASE}/#/article/${article.id}`);
      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_TAGS])
        .analyze();
      const serious = seriousViolations(results);
      const ids = serious.map((v) => v.id);
      // Pitfall 10 — explicit guards on the two high-risk semantic regressions.
      expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
      expect(ids).not.toContain("list");
      expect(serious).toEqual([]);
    });
  });
}

// ── A11Y-03 single-content-tree: settings panel open ─────────────────────────
// Phase 2 (02-01): with the settings panel open via showModal, the article
// must NOT be duplicated (single content tree). The browser auto-inerts the
// rest of the document under showModal, so screen-reader reading order stays
// equal to document order. Asserted on one fixture article (representative)
// because the panel mechanism is identical across fixtures.
test("a11y 02-01 single-content-tree: article is rendered exactly once while panel is open (A11Y-03)", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/article/essay-long-form`);

  // Open the settings panel via the gear.
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(page.locator("dialog.settings-panel")).toBeVisible();

  // Run axe on the panel-open state — zero serious/critical violations.
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const serious = seriousViolations(results);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

  // A11Y-03 invariant: exactly ONE .article-body in the DOM (not duplicated).
  const articleCount = await page.locator("article.article-body").count();
  expect(articleCount, "article-body must appear exactly once").toBe(1);

  // The dialog is open — the browser has made the rest of the document inert
  // (showModal's top-layer behavior). Confirm the dialog is in the open state
  // so the inert backdrop is in effect.
  const dlgOpen = await page.locator("dialog.settings-panel").evaluate(
    (el) => (el as HTMLDialogElement).open,
  );
  expect(dlgOpen, "dialog must be open (modal inert backdrop active)").toBe(true);
});

// ── ACPT-02 finding #2: note popover open (native <dialog> + showModal) ──────
// The Phase 5 note popover used <div popover="manual">, which VoiceOver browse
// could not enter (the field was unreachable — debug session
// `vo-note-popover-focus`). The fix promoted it to native <dialog> + showModal.
// This mirrors the A11Y-03 settings-panel check on the popover-open state:
// zero serious/critical axe violations, single-content-tree, and the dialog is
// genuinely modal (:modal — the focus scope + inert background VoiceOver needs
// to enter the editor and reach the textarea). axe catches only automatable
// issues; the final VO confirmation is the human ACPT-02 Flow D checkpoint.
test("a11y ACPT-02 #2: note popover open is a modal dialog + axe-clean + single-content-tree", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/article/essay-long-form`);
  // Wait for a selectable block to mount.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        ".page-fragment [data-block-index], .article-body:not(.article-body-measurement) [data-block-index]",
      ),
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(600);

  // Create a highlight + open the note editor via the N shortcut.
  await page.evaluate(() => {
    const block = document.querySelector<HTMLElement>(
      '[data-block-index]:not(.article-body-measurement [data-block-index])',
    );
    if (!block) return;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text | null;
    if (!first) return;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(first, Math.min(18, first.nodeValue?.length ?? 0));
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  await page.keyboard.press("n");
  const popover = page.locator("dialog#highlight-popover");
  await expect(popover).toBeVisible();

  // (a) Zero serious/critical axe violations with the editor open.
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const serious = seriousViolations(results);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

  // (b) A11Y-03 invariant: exactly ONE .article-body (not duplicated by the
  //     top-layer editor). Note: .article-body-measurement (the hidden
  //     measurement copy) is excluded — it is intentionally a second tree but
  //     aria-hidden + user-select:none.
  const visibleArticleCount = await page.locator(
    "article.article-body:not(.article-body-measurement)",
  ).count();
  expect(visibleArticleCount, "visible article-body appears exactly once").toBe(1);

  // (c) The popover is genuinely modal — the focus scope + inert background
  //     VoiceOver needs (the property popover="manual" lacked). :modal matches
  //     a <dialog> opened via showModal in the target browser baseline.
  const isModal = await popover.evaluate((el) => el.matches(":modal"));
  expect(isModal, "note popover is modal (:modal — showModal opened it)").toBe(true);
});

// ── Phase 10 (RECV-01.i): the #/review axe gate on a seeded non-empty panel ──
// Plan 10-06 Task 2 — the review panel route held to the SAME bar as the
// fixture list + article views: zero serious/critical WCAG 2.2 AA
// violations plus the Pitfall-8 guards (the one-h1 "Review highlights" +
// h2 section structure must pass heading-order; the grouped
// ul.review-section-list rows must pass the list rule). Seeded NON-EMPTY
// (article + confident highlight + note) so axe samples the real row
// structure — quote, note preview, date, curation cluster. The two
// manual-only SR rows in 10-VALIDATION.md stay queued for
// /gsd-verify-work (axe reports only automatable issues).
test("review panel #/review: zero serious/critical WCAG 2.2 AA violations (seeded non-empty panel)", async ({
  page,
}) => {
  // Deterministic first-run state (the shared e2e harness discipline).
  await wipeDatabase(page);
  // Re-mount so Dexie re-declares its schema BEFORE seeding — the 10-03
  // harness fix (a hash-only goto is same-document; without the reload,
  // seedRows' raw indexedDB.open recreates a store-less v1 DB whose open
  // connection blocks Dexie's v4 upgrade).
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible();
  // A fixture row renders only once the repository read completed — the
  // deterministic "Dexie is open + schema declared" signal.
  await expect(
    page.getByText("The looting of science fiction").first(),
  ).toBeVisible();
  const article = makeArticle({
    id: "a11y-review-corpus",
    title: "A Field Guide to Harbor Bells",
    paragraphs: [
      "The harbor bells were cast in four different centuries, and the oldest of them still carries an inscription asking to be rung only in fog, a request the pilots have honored so faithfully that nobody alive has heard its voice.",
      "The bell-ringer's ledger records every fog since 1803, in a hand that grows more confident with each decade, and the margins carry tide notes that the modern meteorological office quietly consults when its models disagree with the water.",
    ],
  });
  const anchor = confidentHighlightOn(article);
  await seedRows(page, {
    articles: [article],
    highlights: [highlightRow("a11y-review-corpus", anchor, "hl-a11y-review-1")],
    notes: [
      {
        schemaVersion: 1,
        id: "note-a11y-review-1",
        highlightId: "hl-a11y-review-1",
        text: "Cross-check the ledger margins against the tide tables.",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
    ],
  });
  await page.goto(`${BASE}/#/review`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Review highlights" }),
  ).toBeVisible();
  // The seeded row rendered (the panel's load effect settled) before axe
  // samples the tree — an empty panel would silently weaken the gate.
  await expect(
    page.getByRole("button", { name: /^Go to highlight:/ }).first(),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();
  const serious = seriousViolations(results);
  const ids = serious.map((v) => v.id);
  // Pitfall 8 — the one-h1 + h2-section and grouped-ul structures must
  // pass their explicit guards, not just the zero-violation total.
  expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
  expect(ids).not.toContain("list");
  expect(serious).toEqual([]);
});
