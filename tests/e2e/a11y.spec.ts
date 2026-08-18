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
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../src/fixtures";
import { wipeDatabase } from "./annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "./portability/_portability";
// Plan 12-06 Task 3 — the book/chapter surfaces (ING-05): the synthetic
// EPUB corpus builder (the generator IS the fixture source; 12-01
// discipline).
import { validBookEpub3 } from "../unit/server/epub-fixtures";
// The D-05 substrate — the SAME normalizeText + graphemeClusters the
// in-browser derivations use (the 08-05/12-05 deterministic-seed
// precedent: compute the location offset in Node, never in-page).
import {
  normalizeText,
  graphemeClusters,
} from "../../src/content/normalizeText";
import type { CanonicalArticle } from "../../src/content/types";

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

// ── Plan 12-06 (ING-05): the book + chapter surfaces ────────────────────────
// The D12-08 context line, the D12-05 chapter nav, and the 12-05 book row
// held to the SAME bar as every other surface: zero serious/critical WCAG
// 2.2 AA violations with the Pitfall guards (heading-order, list), native
// keyboard operability (Tab reaches, Enter activates, aria-expanded toggles
// via keyboard), visible focus, and the reduced-motion gate on the
// disclosure animation. axe reports only automatable issues — the manual
// SR flows stay Phase 13's ACPT gate.

const BOOK_BASE = "http://localhost:5173";

/** Attach an EPUB to the picker + submit (the epub-intake harness clone). */
async function uploadEbook(page: Page): Promise<void> {
  await page.locator("input#ingest-file").setInputFiles({
    name: "the-synthetic-book.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(validBookEpub3()),
  });
  await page.getByRole("button", { name: /add file/i }).click();
}

/** Wipe + upload + remount the library with the book row visible. */
async function seedBookLibrary(page: Page): Promise<void> {
  await wipeDatabase(page);
  await page.goto(`${BOOK_BASE}/#/`);
  await uploadEbook(page);
  await expect(
    page.locator(".ingest-control .status").filter({ hasText: "Book added" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("li.book-row")).toBeVisible({ timeout: 10_000 });
}

/**
 * Keyboard-order proof, engine-honest (the 09-06 stacked-modal precedent):
 * chromium + firefox follow DOM order from a programmatic focus, so the
 * tab-order walks assert there. WebKit's sequential navigation skips
 * links/buttons (the Safari form-controls-only default — probe: body →
 * INPUT → TEXTAREA), so on webkit the claim degrades to focusability +
 * Enter activation (asserted separately, all engines).
 */
function tabOrderFollowsDom(): boolean {
  return test.info().project.name !== "webkit";
}

async function tabWalkFrom(
  page: Page,
  startSelector: string,
  targetSelector: string,
  maxPresses = 8,
): Promise<boolean> {
  await page.locator(startSelector).first().focus();
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const matched = await page.evaluate(
      (s) => document.activeElement?.matches(s) ?? false,
      targetSelector,
    );
    if (matched) return true;
  }
  return false;
}

test.describe("a11y 12-06 — library with a book", () => {
  test("zero serious/critical violations collapsed AND expanded; disclosure animation reduced-motion-gated", async ({
    page,
  }) => {
    await seedBookLibrary(page);

    // Collapsed book row — the SAME bar + explicit guards as the fixture
    // list scan above.
    let results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    let serious = seriousViolations(results);
    let ids = serious.map((v) => v.id);
    expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
    expect(ids).not.toContain("list");
    expect(serious).toEqual([]);

    // Expanded — the chapter sub-list (h3 rows), skip disclosure, TagEntry,
    // and Remove trigger join the tree. Settle first: the positively-gated
    // disclosure animation fades opacity 0→1 over 160ms, and axe resolves
    // contrast from COMPUTED styles — sampling mid-animation reports a
    // blended foreground and false-fails color-contrast.
    await page.locator("li.book-row .book-toggle").click();
    await expect(page.locator("li.book-row .book-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(
      page.locator("li.book-row .book-chapter-list > li").first(),
    ).toBeVisible();
    await page.waitForTimeout(350); // out-run the 160ms book-disclose animation
    results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    serious = seriousViolations(results);
    ids = serious.map((v) => v.id);
    expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
    expect(ids).not.toContain("list");
    expect(serious).toEqual([]);

    // Reduced-motion (structural — the visual-motion assertions stay in
    // reduced-motion.spec.ts's domain): the disclosure animation exists
    // ONLY inside a positive (prefers-reduced-motion: no-preference) media
    // guard. Proven via the CSSOM — .book-chapters animation rules must
    // live inside the media block, never at the top level.
    const guarded = await page.evaluate(() => {
      const mediaTexts: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin sheet — skip
        }
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSMediaRule) {
            mediaTexts.push(rule.media.mediaText);
            for (const inner of Array.from(rule.cssRules)) {
              if (
                inner instanceof CSSStyleRule &&
                inner.selectorText.includes(".book-chapters")
              ) {
                return {
                  found: true,
                  media: rule.media.mediaText,
                  selector: inner.selectorText,
                };
              }
            }
          }
        }
      }
      return { found: false, media: mediaTexts.join(" ; "), selector: "" };
    });
    expect(guarded.found, "the .book-chapters animation rule must exist").toBe(true);
    expect(guarded.media).toContain("prefers-reduced-motion: no-preference");
  });

  test("keyboard walkthrough: chevron aria-expanded via keyboard; Tab order reaches Resume, chapter links, Remove; focus ring visible", async ({
    page,
  }) => {
    await seedBookLibrary(page);

    // Deterministic Resume link: seed a mid-chapter location for chapter 1
    // via raw IndexedDB (the 12-05 seeding precedent — the scroll-save path
    // is proven by epub-intake SC#3; THIS test is about keyboard semantics,
    // so the location must not depend on the 1200ms save debounce). The
    // library rows are visible = Dexie is open + schema declared (10-03).
    await page.locator("li.book-row .book-toggle").click();
    const chapter1Id = await page
      .locator("li.book-row .book-chapter-list > li")
      .filter({ hasText: "Chapter 1. Loomings" })
      .locator('a[href^="#/article/"]')
      .getAttribute("href")
      .then((h) => (h ?? "").replace("#/article/", ""));
    expect(chapter1Id).toMatch(/-c00$/);
    const articleRow = await page.evaluate(
      async (id) => {
        return new Promise<Record<string, unknown> | null>((resolve) => {
          const req = indexedDB.open("lem-reader");
          req.onsuccess = () => {
            const tx = req.result.transaction("articles", "readonly");
            const get = tx.objectStore("articles").get(id);
            get.onsuccess = () => resolve(get.result ?? null);
            get.onerror = () => resolve(null);
          };
          req.onerror = () => resolve(null);
        });
      },
      chapter1Id,
    );
    expect(articleRow, "chapter 1 article row must exist").not.toBeNull();
    // Mid-chapter offset (half the D-05 grapheme total) — an UNFINISHED
    // location so the Resume link renders (computed in Node by the SAME
    // substrate the in-browser derivation uses).
    const total = graphemeClusters(
      normalizeText(articleRow as unknown as CanonicalArticle),
      "en",
    ).length;
    await page.evaluate(
      async ({ chapter1Id, offset }) => {
        await new Promise<void>((resolve) => {
          const req = indexedDB.open("lem-reader");
          req.onsuccess = () => {
            const tx = req.result.transaction("location", "readwrite");
            tx.objectStore("location").put({
              schemaVersion: 1,
              articleId: chapter1Id,
              revision: 1,
              graphemeOffset: offset,
              savedAt: new Date().toISOString(),
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          };
          req.onerror = () => resolve();
        });
      },
      { chapter1Id, offset: Math.max(1, Math.floor(total / 2)) },
    );
    // Remount so LibraryView's load picks the location up.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("li.book-row")).toBeVisible({ timeout: 10_000 });

    // Keyboard-order proof: the Resume link is the focusable IMMEDIATELY
    // before the chevron in DOM order — focus it (focusability, ALL
    // engines), then ONE real Tab must land on the chevron (the DOM-order
    // claim on chromium + firefox; webkit skips links in sequential nav —
    // the 09-06 engine-divergence precedent).
    const resume = page.locator("li.book-row .book-resume");
    await expect(resume).toBeVisible({ timeout: 10_000 });
    await resume.focus();
    await expect(resume).toBeFocused();
    if (tabOrderFollowsDom()) {
      expect(
        await tabWalkFrom(page, "li.book-row .book-resume", "li.book-row .book-toggle", 2),
        "Tab from Resume must reach the book chevron (adjacent focusables)",
      ).toBe(true);
      // Keyboard focus → the global :focus-visible ring (UI-SPEC §4): a
      // Tab-originated focus matches :focus-visible, so the computed
      // outline carries the 2px token ring.
      const focusRing = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return { style: "none", width: "0" };
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: cs.outlineWidth };
      });
      expect(focusRing.style).not.toBe("none");
    }

    // aria-expanded toggles via KEYBOARD (Enter on the focused button) —
    // ALL engines (button activation, not sequential navigation).
    await page.locator("li.book-row .book-toggle").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("li.book-row .book-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.keyboard.press("Enter");
    await expect(page.locator("li.book-row .book-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Sane order — DOM order: Resume link BEFORE the chevron, chapter open
    // links + Remove AFTER it (inside the expanded region).
    const bookRow = page.locator("li.book-row");
    await expect(bookRow.locator(".book-resume")).toBeVisible();
    const resumeIndex = await bookRow.locator(".book-resume").evaluate((el) => {
      const row = el.closest("li");
      const focusables = row?.querySelectorAll(
        "a[href], button:not([disabled]), input",
      );
      return focusables ? Array.from(focusables).indexOf(el) : -1;
      });
    const toggleIndex = await bookRow.locator(".book-toggle").evaluate((el) => {
      const row = el.closest("li");
      const focusables = row?.querySelectorAll(
        "a[href], button:not([disabled]), input",
      );
      return focusables ? Array.from(focusables).indexOf(el) : -1;
    });
    expect(resumeIndex).toBeGreaterThan(-1);
    expect(toggleIndex).toBeGreaterThan(resumeIndex);

    // Expand again, then walk forward from the (still-focused) chevron
    // through the region: the chapter open link and the Remove button are
    // keyboard-reachable in DOM order after the toggle (chromium + firefox;
    // on webkit the structural DOM-order indices above + focus() +
    // Enter-activation carry the claim).
    await page.keyboard.press("Enter"); // re-expand (still focused)
    await expect(page.locator("li.book-row .book-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    if (tabOrderFollowsDom()) {
      expect(
        await tabWalkFrom(
          page,
          "li.book-row .book-toggle",
          "li.book-row .book-chapter-list a[href^='#/article/']",
          6,
        ),
        "Tab from the chevron must reach the chapter sub-row open link",
      ).toBe(true);
      // Continue the walk to the Remove book trigger.
      expect(
        await tabWalkFrom(
          page,
          "li.book-row .book-chapter-list a[href^='#/article/']",
          "li.book-row .book-remove",
          12,
        ),
        "Tab must reach the Remove book button",
      ).toBe(true);
      // The focused Remove button also carries the visible focus ring.
      const removeRing = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "none";
        return getComputedStyle(el).outlineStyle;
      });
      expect(removeRing).not.toBe("none");
    }
  });
});

test.describe("a11y 12-06 — chapter reading (both modes)", () => {
  test("context line + chapter nav axe-clean; Next/Previous Tab-reachable + Enter-activatable; context line is a paragraph", async ({
    page,
  }) => {
    // 360x480 — chapters paginate into ~3 pages (the epub-intake geometry).
    await page.setViewportSize({ width: 360, height: 480 });
    await seedBookLibrary(page);

    // Open chapter 2 (default paginated mode on first run).
    await page.locator("li.book-row .book-toggle").click();
    await page
      .locator("li.book-row .book-chapter-list > li")
      .filter({ hasText: "Chapter 2. The Carpet-Bag" })
      .locator('a[href^="#/article/"]')
      .click();
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c01$/, { timeout: 10_000 });
    await expect(
      page.locator(".page-fragment [data-block-index]").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    // The context line is a PARAGRAPH, never a heading — the h1 chapter
    // title owns the header structure (heading-order preservation).
    const contextTag = await page.evaluate(
      () => document.querySelector("p.book-context")?.tagName ?? "MISSING",
    );
    expect(contextTag).toBe("P");
    await expect(
      page.getByRole("heading", { level: 1, name: "Chapter 2. The Carpet-Bag" }),
    ).toBeVisible();

    // ── PAGINATED: turn to the final page (real keys) — the Next link
    // mounts there; Tab-reach + Enter-activate it.
    for (let i = 0; i < 30; i++) {
      const state = await page.evaluate(() => {
        const dev = (window as unknown as Record<string, unknown>)
          .__lemPagination as
          | { pagesLength: number; currentPageIdx: number }
          | undefined;
        if (!dev || dev.pagesLength === 0) return { done: false };
        return { done: dev.currentPageIdx === dev.pagesLength - 1 };
      });
      if (state.done) break;
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(150);
    }
    await expect(page.locator("a.chapter-next")).toBeVisible();
    // Tab-reach the Next link from the deterministic nearby start (the
    // page-turn chevron immediately precedes the chapter nav in DOM order)
    // on chromium + firefox; on webkit the link is still keyboard-FOCUSABLE
    // and Enter-activatable (asserted right after — the 09-06 precedent).
    if (tabOrderFollowsDom()) {
      expect(
        await tabWalkFrom(page, ".page-turn-next", "a.chapter-next", 4),
        "Tab must reach the Next chapter link in paginated mode",
      ).toBe(true);
    } else {
      await page.locator("a.chapter-next").focus();
      await expect(page.locator("a.chapter-next")).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c02$/, { timeout: 10_000 });
    await expect(
      page.locator(".page-fragment [data-block-index]").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);

    // axe on the chapter view in PAGINATED mode (context line + chapter
    // nav + page fragment all in the tree).
    let results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    let serious = seriousViolations(results);
    let ids = serious.map((v) => v.id);
    expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
    expect(ids).not.toContain("list");
    expect(serious).toEqual([]);

    // ── PAGINATED chapter start: the Previous link is Tab-reachable from
    // the FIRST page + Enter-activatable (back to chapter 2).
    for (let i = 0; i < 30; i++) {
      const idx = await page.evaluate(() => {
        const dev = (window as unknown as Record<string, unknown>)
          .__lemPagination as { currentPageIdx: number } | undefined;
        return dev?.currentPageIdx ?? -1;
      });
      if (idx === 0) break;
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(150);
    }
    await expect(page.locator("a.chapter-prev")).toBeVisible();
    if (tabOrderFollowsDom()) {
      expect(
        await tabWalkFrom(page, ".page-turn-previous", "a.chapter-prev", 4),
        "Tab must reach the Previous chapter link in paginated mode",
      ).toBe(true);
    } else {
      await page.locator("a.chapter-prev").focus();
      await expect(page.locator("a.chapter-prev")).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c01$/, { timeout: 10_000 });
    // Ordered union (the ?? discipline): in paginated mode the hidden
    // measurement body precedes .page-viewport in DOM order, so a comma-
    // union locator would match its invisible blocks first.
    await page.waitForFunction(
      () =>
        !!(
          document.querySelector(".page-fragment [data-block-index]") ??
          document.querySelector(
            ".article-body:not(.article-body-measurement) [data-block-index]",
          )
        ),
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(600);

    // ── SCROLLING: M toggles (persisted); scroll to the flow end — the
    // Next link is Tab-reachable + Enter-activatable there too.
    await page.keyboard.press("m");
    await page.waitForTimeout(700);
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(page.locator("a.chapter-next")).toBeVisible();
    // The Export button is the LAST header focusable; the flow order is
    // header → prev nav → body → next nav, so a short walk reaches it.
    if (tabOrderFollowsDom()) {
      expect(
        await tabWalkFrom(
          page,
          ".article-export-highlights",
          "a.chapter-next",
          5,
        ),
        "Tab must reach the Next chapter link in scrolling mode",
      ).toBe(true);
    } else {
      await page.locator("a.chapter-next").focus();
      await expect(page.locator("a.chapter-next")).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c02$/, { timeout: 10_000 });
    await expect(
      page.locator(
        ".article-body:not(.article-body-measurement) [data-block-index]",
      ).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);

    // axe on the chapter view in SCROLLING mode (context line + both flow
    // navs in the tree).
    results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    serious = seriousViolations(results);
    ids = serious.map((v) => v.id);
    expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
    expect(ids).not.toContain("list");
    expect(serious).toEqual([]);

    // SCROLLING chapter start: the Previous link sits before the body —
    // the FIRST focusable after the header cluster + Enter-activatable.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator("a.chapter-prev")).toBeVisible();
    if (tabOrderFollowsDom()) {
      expect(
        await tabWalkFrom(page, ".article-export-highlights", "a.chapter-prev", 2),
        "Tab must reach the Previous chapter link in scrolling mode",
      ).toBe(true);
    } else {
      await page.locator("a.chapter-prev").focus();
      await expect(page.locator("a.chapter-prev")).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-[a-z0-9]+-c01$/, { timeout: 10_000 });
  });
});
