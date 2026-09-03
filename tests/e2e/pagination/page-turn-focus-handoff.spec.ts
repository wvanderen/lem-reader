// tests/e2e/pagination/page-turn-focus-handoff.spec.ts
// Plan 21-07 — UAT Test 2 (major) regression lock: the paginated page-turn
// focus handoff must be reachable for BUTTON-originated turns in
// WebKit/Safari, so VoiceOver resets to the top of the new page when a turn
// is activated from the chevron (the natural path off an image-only page)
// and never silently skips the first text line after a page-leading image.
//
// Root cause (diagnosed 2026-09-02, .planning/debug/vo-safari-image-page-focus.md):
// (1) chevron onClick called commitTurn directly — never focusNewPageTop;
// (2) WebKit does NOT focus an activated button (activeElement === body
//     after the click), so the D4-07 "focus stays on the control" premise
//     was false in Safari; (3) once focus was body, isFocusInContent(body)
//     returned false, so every SUBSEQUENT keyboard turn also skipped the
//     "Page N begins" boundary handoff — a persistent failure cascade.
//
// Fix under test (Task 1): isFocusInContent treats body/documentElement as
// content-origin (the cascade self-heals) and PaginatedSurface's chevron
// path (handleChevronTurn) falls back to the same boundary handoff whenever
// the engine did not keep focus on a control.
//
// SEEDING (the 20-08 decode-matrix discipline): a plain article row
// (structured-clone-safe JSON — no IndexedDB Blob values) under the
// registry-backed id "figure-heavy" shadows the bundled fixture, and the
// figure's asset: ref resolves through the bundled fixture registry's
// in-memory blobs — createObjectURL never touches IndexedDB, so this is
// engine-complete on Playwright WebKit (the documented Blob-put boundary).
//
// ARTICLE SHAPE NOTE: the plan mandates makeFigureArticle + seedImageryArticle
// reuse, but makeFigureArticle places ALL figures after ALL paragraphs — it
// cannot express "intro → figure → long paragraphs", and Test 4 requires
// TEXT PAGES AFTER the figure page (Next must turn from the figure page).
// The article below mirrors makeFigureArticle's provenance + block shapes
// exactly (ArticleSchema.parse in Node — the same discipline); only the
// block ORDER differs. All other harness pieces (seedImageryArticle,
// registrySample, openArticle, turnToPage, waitForDecoded,
// visibleFigureImgs) are reused, never forked.
//
// FIGURE-RUN GEOMETRY (probe-verified 420x470, webkit): page-viewport P ≈
// 320px → atomic-oversize ceiling 0.75×P ≈ 240px; a jpeg figure renders ≈
// 193–208px (163px capped img + 1–2 caption lines). A SINGLE figure
// followed by text can only be figure-only inside the ~2-line window
// (P − 48 − 24 − 57.6, 0.75P] ≈ (190, 240] — one caption-line of engine
// drift on either end breaks it (4 caption lines → oversize fallback that
// fails the ALL-ENGINE cells; 2 lines → widow slice joins the page). The
// debug session's own figure-only page came from a FIGURE RUN: a second
// atomic figure (~200px) can NEVER fit the ~82px remainder after the
// first, so figure A's page is deterministically figure-only on every
// engine with large safety margins both ways. The article therefore ships
// TWO registry jpegs back-to-back (figure A = block 1, the page under
// test), then the long paragraphs.
//
// GEOMETRY: 420x470 — the debug session's probe-verified viewport — pinned
// BEFORE navigation. The long paragraphs (600+ chars each) and the
// multi-line caption keep the atomic figure from sharing a page with a
// following long block, yielding a deterministically FIGURE-ONLY page (the
// VO image-page shape: the next AX stop after the figure group is the
// fixed Next-page button). The page map is discovered at runtime via the
// __lemPagination DEV hook and the shape is recorded in assertion messages.
//
// RED→GREEN evidence (Task 2 action): run once against the pre-fix tree
// (src/ reverted one commit) — the webkit button-click + cascade cells fail
// with activeElement === body (the exact UAT signature) — then green with
// the fix restored. Both runs are recorded in 21-07-SUMMARY.md.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import {
  openArticle,
  registrySample,
  seedImageryArticle,
  turnToPage,
  visibleFigureImgs,
  waitForDecoded,
} from "../imagery/_helpers";
import { currentPageIdx } from "../annotations/_fixtures";

/** The pinned probe viewport (debug session 2026-09-02). */
const VIEWPORT = { width: 420, height: 470 } as const;

/** The figure is block 1 (intro paragraph is block 0). */
const FIGURE_BLOCK_INDEX = 1;

const JPEG = registrySample("jpeg");

const INTRO =
  "A short introduction settles the article's first page before the figures arrive; the paragraphs that follow are deliberately much longer.";

const CAPTION_A = "A bee hummingbird perches on a thin twig in Cuba.";
const CAPTION_B = "The same hummingbird, wings caught mid-beat.";

/** Deterministic 600+ char filler — long enough that its measured line
 * boxes can never share a page with the atomic figures above it. */
function longParagraph(topic: string): string {
  return (
    `The ${topic} paragraph is deliberately long so its measured line boxes cannot share ` +
    `a page with the atomic figures that precede it at the pinned viewport; every sentence ` +
    `adds more measured lines so the pagination engine must place this block on its own ` +
    `pages and the figure pages keep exactly one block each. `
  ).repeat(5);
}

const LONG_TOPICS = [
  "first trailing",
  "second trailing",
  "third trailing",
  "fourth trailing",
];

const FIGURE_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  id: "figure-heavy", // registry-backed id — asset resolution never touches Dexie
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/imagery",
    title: "Focus Handoff: Figure Pages",
    retrievedAt: "2026-08-31T00:00:00.000Z",
    originalHtmlHash: `sha256:${"0".repeat(64)}`,
  },
  blocks: [
    { kind: "paragraph", content: [{ text: INTRO, marks: [] }] },
    {
      kind: "figure",
      alt: "A bee hummingbird perched on a thin twig, photographed against a soft green background.",
      src: `asset:${JPEG.assetId}`,
      width: JPEG.width,
      height: JPEG.height,
      caption: [{ text: CAPTION_A, marks: [] }],
    },
    {
      kind: "figure",
      alt: "The same bee hummingbird in flight, wings caught mid-beat.",
      src: `asset:${JPEG.assetId}`,
      width: JPEG.width,
      height: JPEG.height,
      caption: [{ text: CAPTION_B, marks: [] }],
    },
    ...LONG_TOPICS.map((topic) => ({
      kind: "paragraph" as const,
      content: [{ text: longParagraph(topic), marks: [] }],
    })),
  ],
});

/**
 * Classify where DOM focus rests, in one page.evaluate — the plan's single
 * classification helper: "body" | "button" (.page-turn) | "boundary"
 * (.page-start-heading) | "null" | else the tagName.
 */
function classifyFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return "null";
    if (active === document.body) return "body";
    if (active instanceof Element && active.matches(".page-turn")) return "button";
    if (active instanceof Element && active.matches(".page-start-heading")) {
      return "boundary";
    }
    return active.tagName.toLowerCase();
  });
}

/** Seeded + opened + settled: ≥3 committed pages at the pinned viewport. */
async function openFigureArticle(page: Page): Promise<void> {
  await seedImageryArticle(page, FIGURE_ARTICLE);
  await openArticle(page, FIGURE_ARTICLE.id);
  await page.waitForFunction(
    () => {
      const dev = (
        window as unknown as {
          __lemPagination?: { status?: string; pagesLength?: number };
        }
      ).__lemPagination;
      return dev !== undefined && dev.status === "ok" && (dev.pagesLength ?? 0) >= 3;
    },
    undefined,
    { timeout: 10_000 },
  );
}

/**
 * Discover the figure's page (and its block shape) from the __lemPagination
 * DEV hook — the plan's probe discipline, kept live at runtime so small
 * engine measurement drift cannot silently invalidate a hardcoded index.
 */
async function figurePageShape(
  page: Page,
): Promise<{ pageIndex: number; blockIndexes: number[]; total: number }> {
  const shape = await page.evaluate((figureIdx: number) => {
    const dev = (
      window as unknown as {
        __lemPagination?: {
          pages?: Array<{ pageIndex: number; blocks: Array<{ blockIndex: number }> }>;
        };
      }
    ).__lemPagination;
    const pages = dev?.pages;
    if (!pages) return null;
    const hit = pages.find((p) => p.blocks.some((b) => b.blockIndex === figureIdx));
    if (!hit) return null;
    return {
      pageIndex: hit.pageIndex,
      blockIndexes: hit.blocks.map((b) => b.blockIndex),
      total: pages.length,
    };
  }, FIGURE_BLOCK_INDEX);
  expect(shape, "the figure must appear in the committed page map").not.toBeNull();
  return shape!;
}

test.beforeEach(async ({ page }) => {
  // Geometry pinned BEFORE navigation (before the seeding helper navigates)
  // so the first pagination pass already commits against 420x470.
  await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
});

test.describe("21-07 page-turn focus handoff (button-originated turns)", () => {
  test("clicking .page-turn-next never strands focus on body (boundary or control)", async ({
    page,
    browserName,
  }) => {
    await openFigureArticle(page);

    await page.getByRole("button", { name: "Next page" }).click();
    await expect
      .poll(() => currentPageIdx(page), { message: "chevron click advances to page 2" })
      .toBe(1);

    // WebKit never focuses the activated button, so the fallback boundary
    // handoff MUST fire — the exact cell that was body pre-fix (UAT Test 2).
    // Chromium/Firefox legitimately rest focus on the clicked control.
    if (browserName === "webkit") {
      await expect
        .poll(() => classifyFocus(page), {
          message:
            "webkit: focus must land on the new page's boundary heading (WebKit loses focus to body on button activation) — never body, never null",
        })
        .toBe("boundary");
    } else {
      await expect
        .poll(() => classifyFocus(page), {
          message:
            "focus must settle on the clicked control or the new boundary heading — never body, never null",
        })
        .toMatch(/^(button|boundary)$/);
    }
  });

  test("keyboard turn taken while focus was lost to body still resets to the boundary (cascade self-heal)", async ({
    page,
  }) => {
    await openFigureArticle(page);

    // Deterministic cascade lock: force the pre-fix failure state — focus
    // lost to body (what a WebKit button activation leaves behind).
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => currentPageIdx(page), { message: "PageDown advances to page 2" })
      .toBe(1);

    const pageBoundary = page.getByRole("heading", {
      name: "Page 2 begins",
      level: 2,
    });
    await expect(
      pageBoundary,
      "body-origin keyboard turn must hand focus to the fresh 'Page 2 begins' boundary heading",
    ).toBeFocused();
  });

  test("turn activated from a focused chevron keeps focus on the control (D4-07 where the engine holds it)", async ({
    page,
    browserName,
  }) => {
    await openFigureArticle(page);

    const next = page.getByRole("button", { name: "Next page" });
    await next.focus();
    await next.click();
    await expect
      .poll(() => currentPageIdx(page), { message: "focused-button click advances to page 2" })
      .toBe(1);

    // D4-07 holds WHERE THE ENGINE HOLDS FOCUS: chromium/firefox keep DOM
    // focus on the activated control (no handoff — classification "button").
    // Empirically (this spec's probe, 2026-09-02), Playwright WebKit drops
    // even a pre-focused button's focus on activation — so the 21-07
    // fallback fires and the reader lands on the fresh boundary heading.
    // Never body either way.
    if (browserName === "webkit") {
      await expect
        .poll(() => classifyFocus(page), {
          message:
            "webkit drops button focus on activation even when it was focused — the fallback boundary handoff must catch it (never body)",
        })
        .toBe("boundary");
    } else {
      await expect(
        next,
        "focus was on the control before + after activation — it stays there (no handoff)",
      ).toBeFocused();
      expect(await classifyFocus(page)).toBe("button");
    }
  });

  test("webkit figure page: chevron turn lands focus on the NEXT page's boundary (the VO image-page path)", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "webkit",
      "webkit-strict cell — Safari/WebKit is the engine that loses focus on button activation",
    );
    expect(browserName).toBe("webkit");

    await openFigureArticle(page);
    const shape = await figurePageShape(page);
    // Shape recorded in the assertion message (the plan's probe discipline):
    // the atomic figure must be the SOLE block on its page — the VO
    // image-page shape where the next AX stop after the figure group is the
    // fixed Next-page button.
    expect(
      shape.blockIndexes,
      `figure page shape (page ${shape.pageIndex + 1} of ${shape.total}): the figure must be the sole [data-block-index] on its page so the figure page is image-only`,
    ).toEqual([FIGURE_BLOCK_INDEX]);
    expect(
      shape.pageIndex + 1,
      "figure page must not be terminal — Next must still turn",
    ).toBeLessThan(shape.total);

    // Walk to the figure page with the KEYBOARD bundle (each turn's handoff
    // is fine — the assertion below starts at the click), then prove the
    // figure actually renders (decoded, not a placeholder).
    await turnToPage(page, shape.pageIndex);
    const img = visibleFigureImgs(page).first();
    await waitForDecoded(img);

    await page.getByRole("button", { name: "Next page" }).click();
    const nextIdx = shape.pageIndex + 1;
    await expect
      .poll(() => currentPageIdx(page), { message: "chevron click leaves the figure page" })
      .toBe(nextIdx);

    const nextBoundary = page.getByRole("heading", {
      name: `Page ${nextIdx + 1} begins`,
      level: 2,
    });
    await expect(
      nextBoundary,
      "the turn off a figure-only page must reset VoiceOver to the TOP of the new page — the boundary heading, not a stale below-image cursor",
    ).toBeFocused();
    expect(await classifyFocus(page)).toBe("boundary");
  });

  test("webkit cascade stays healed: keyboard turn AFTER a button turn still resets to the fresh boundary", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "webkit",
      "webkit-strict cell — the focus-loss cascade is the WebKit signature",
    );
    expect(browserName).toBe("webkit");

    await openFigureArticle(page);

    // Button turn first (focus lost to body → fallback handoff fires).
    await page.getByRole("button", { name: "Next page" }).click();
    await expect
      .poll(() => currentPageIdx(page), { message: "chevron click advances to page 2" })
      .toBe(1);
    await expect(
      page.getByRole("heading", { name: "Page 2 begins", level: 2 }),
      "button turn (focus lost) hands off to the boundary heading",
    ).toBeFocused();

    // Then a KEYBOARD turn — the old cascade bug skipped this reset.
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => currentPageIdx(page), { message: "PageDown advances to page 3" })
      .toBe(2);
    await expect(
      page.getByRole("heading", { name: "Page 3 begins", level: 2 }),
      "keyboard turn after button turns must still land on the fresh boundary heading — the cascade stays healed",
    ).toBeFocused();
  });
});
