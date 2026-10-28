// tests/e2e/typography/heading-layout.spec.ts
// Issue #191 — article heading hierarchy is recognizable without unintended
// indentation, in both reading modes, across all three engines.
//
// Demonstrated causes (the #189 inspection leads, reproduced live here):
//   1. `.article-body h2/h3/h4` carried explicit `0.5em` horizontal margins —
//      every body heading sat half an em inside the paragraph measure. The
//      margins are engine-independent author CSS, so the same indentation
//      rendered in Chromium, Firefox, and WebKit (the Firefox report's
//      demonstrated cause — see the evidence ledger at the bottom for the
//      honest Firefox accounting).
//   2. The global heading register stopped at h4: h5/h6 rendered at the UA
//      defaults (~0.83em/0.67em — BELOW even the default 18px body) with no
//      rhythm — the "insufficiently styled" symptom. The register is
//      completed at the DESIGN.md-pinned H2 register (22px/600/1.3);
//      semantic levels h2–h6 stay verbatim (flattening the structure is NOT
//      the fix). Heading sizes are pinned px by contract (DESIGN.md);
//      the reader's 16–24px body knob scales prose, not headings — that
//      contract is unchanged here; what changed is that NO level starts
//      below the DEFAULT body size.
//
// Cells:
//   (a) flush — every body heading h1–h6 sits at the paragraph's inline
//       edges (margin-inline 0, same rect.left) in BOTH reading modes
//       (paginated walks every page so the fragment renderer is covered)
//   (b) register — h1 32px, h2–h6 22px/600: hierarchy is recognizable and
//       no heading level renders below body size
//   (c) semantics — the elements remain h1–h6 with working
//       getByRole("heading", { level }) queries (no flattening); run in
//       scrolling mode where the whole article is mounted at once
//   (d) quote/list insets survive — a heading inside a blockquote or a
//       list item keeps its container's inline inset while its own margin
//       stays 0 (zeroing the defect must not flatten container geometry)
//
// Harness: the toc-navigation.spec.ts conventions — prepareFreshPage +
// Node-side ArticleSchema.parse seeding + the visible-block readiness
// sentinel + zero fixed sleeps.
import { test, expect, type Page } from "@playwright/test";
import { BASE } from "../_base";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";

const para = (text: string) => ({ kind: "paragraph", content: [{ text, marks: [] }] });

const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, text: string) => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

/** The flush cells compare viewport x-coordinates across elements; sub-
 *  pixel layout noise (fractional font metrics rounding) must never fail
 *  them. Half a pixel is far under any real indentation (the defect was
 *  11px) but above rounding noise. */
const FLUSH_TOLERANCE_PX = 0.5;

/** Real long-form filler: enough prose that paginated mode derives several
 *  pages, so the page-walk cells exercise the fragment renderer's heading
 *  rendering, not just page 1. */
const filler = (n: number) =>
  para(
    `Heading layout filler ${n} gives the surrounding headings neighboring ` +
      `paragraph edges to align against. The prose continues for a few ` +
      `sentences so the paginated engine derives several pages from this ` +
      `article and every heading level is rendered by the page fragment ` +
      `path at least once during the walk.`,
  );

const HIERARCHY_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  id: "heading-layout-demo",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.org/heading-layout-demo",
    title: "Heading Layout Demo",
    author: "Demo Author",
    retrievedAt: "2026-08-30T00:00:00.000Z",
    originalHtmlHash: `sha256:${"0".repeat(64)}`,
  },
  blocks: [
    heading(1, "Part one"),
    filler(1),
    heading(2, "Section"),
    filler(2),
    heading(3, "Subsection"),
    filler(3),
    heading(4, "Sub-subsection"),
    filler(4),
    heading(5, "Deep section"),
    filler(5),
    heading(6, "Deepest section"),
    filler(6),
    {
      kind: "bulleted-list",
      items: [
        {
          content: [
            heading(3, "Listed heading"),
            para("A listed paragraph so the item box has body content too."),
          ],
        },
      ],
    },
    {
      kind: "blockquote",
      children: [
        heading(3, "Quoted heading"),
        para("A quoted paragraph so the quote box has body content too."),
      ],
    },
    filler(7),
  ],
});

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, {
    articles: [HIERARCHY_ARTICLE as unknown as Record<string, unknown>],
  });
});

/** Open the seeded article and wait for a VISIBLE reading-surface block in
 *  either mode (the hidden .article-body-measurement clone never satisfies
 *  the sentinel). */
async function openArticle(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/article/heading-layout-demo`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Heading Layout Demo", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        "[data-block-index]:not(.article-body-measurement [data-block-index])",
      ),
    undefined,
    { timeout: 10_000 },
  );
}

/** Toggle the reading mode via the header ModeToggle (the one toggle path,
 *  toc-navigation.spec.ts L219) and WAIT for the swap to commit — the
 *  toc-navigation convention's settle, simplified to the observable that
 *  matters for sampling: the surface element carries (or drops) the
 *  .paginated-surface frame class only after React mounts the other mode's
 *  renderer. Sampling immediately after the click could read the OLD
 *  surface mid-swap. */
async function toggleMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Reading mode:/ }).click();
  await expect(page.locator(".article-body.paginated-surface")).toHaveCount(0);
}

/** Serializable per-heading geometry snapshot over the VISIBLE article body
 *  only. Excludes three non-body surfaces: the nested `.article-body-
 *  measurement` clone (paginated mode keeps it INSIDE the visible element —
 *  ArticleView Plan 04-08), the pinned header's article-title h1, and the
 *  visually-hidden `.page-start-heading` page furniture. `paragraphLeft` is
 *  the visible body's first paragraph edge — the flush baseline (blockquote
 *  headings sit inside the quotation's own inset and are compared against it
 *  in the quote cell). */
interface HeadingSample {
  tag: string;
  text: string;
  marginLeft: string;
  marginRight: string;
  rectLeft: number;
  fontSize: string;
  fontWeight: string;
  inBlockquote: boolean;
  inListItem: boolean;
}

async function sampleVisibleHeadings(page: Page): Promise<{
  samples: HeadingSample[];
  paragraphLeft: number | null;
}> {
  return page.evaluate(() => {
    const body = document.querySelector(".article-body:not(.article-body-measurement)");
    if (!body) throw new Error("visible article body not mounted");
    const paragraphLeft =
      body.querySelector<HTMLElement>(":scope > p")?.getBoundingClientRect().left ??
      body.querySelector<HTMLElement>("p")?.getBoundingClientRect().left ??
      null;
    const samples: HeadingSample[] = [];
    for (const el of body.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
      // Paginated mode nests the full-body measurement clone INSIDE the
      // visible surface (ArticleView Plan 04-08) — its headings are the
      // hidden duplicate, never the reading surface. The article-title h1
      // in the pinned header is chrome, not body typography.
      if (el.closest(".article-body-measurement")) continue;
      if (el.closest("header")) continue;
      if (el.classList.contains("page-start-heading")) continue;
      const cs = getComputedStyle(el);
      samples.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim() ?? "",
        marginLeft: cs.marginLeft,
        marginRight: cs.marginRight,
        rectLeft: el.getBoundingClientRect().left,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        inBlockquote: el.closest("blockquote") !== null,
        inListItem: el.closest("li") !== null,
      });
    }
    return { samples, paragraphLeft };
  });
}

/** Collect EVERY body heading across the article in the ACTIVE mode:
 *  scrolling reads the whole mounted body once; paginated walks from the
 *  first page to the last via the page-turn buttons (the fragment renderer's
 *  per-page heading rendering is part of the contract). */
async function collectAllHeadings(page: Page): Promise<ReturnType<typeof sampleVisibleHeadings>> {
  const next = page.locator('.page-turn-next[aria-label="Next page"]');
  if (!(await next.isVisible().catch(() => false))) {
    return sampleVisibleHeadings(page); // scrolling mode — one mounted body
  }
  // Paginated: walk to the first page, then sample page by page.
  const prev = page.locator('.page-turn-previous[aria-label="Previous page"]');
  for (let guard = 0; (await prev.getAttribute("aria-disabled")) !== "true"; guard++) {
    expect(guard, "walk-to-first-page guard").toBeLessThan(50);
    await prev.click();
  }
  const all: HeadingSample[] = [];
  let paragraphLeft: number | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const { samples, paragraphLeft: pl } = await sampleVisibleHeadings(page);
    all.push(...samples);
    paragraphLeft ??= pl;
    if ((await next.getAttribute("aria-disabled")) === "true") break;
    const startText = await page.locator(".page-start-heading").textContent();
    await next.click();
    // The turn commits when the fragment's page-start sentinel advances —
    // no fixed sleeps, no racing the fragment render.
    await page.waitForFunction(
      (prev) => document.querySelector(".page-start-heading")?.textContent !== prev,
      startText,
      { timeout: 10_000 },
    );
  }
  return { samples: all, paragraphLeft };
}

for (const mode of ["paginated", "scrolling"] as const) {
  test(`(${mode}) h1–h6 body headings sit flush with the paragraph measure — no unintended indentation`, async ({
    page,
  }) => {
    await openArticle(page);
    if (mode === "scrolling") await toggleMode(page);
    const { samples, paragraphLeft } = await collectAllHeadings(page);
    expect(paragraphLeft).not.toBeNull();
    expect(samples.length).toBe(8); // h1–h6 + the listed h3 + the quoted h3
    const seen = new Set(samples.map((s) => `${s.tag}:${s.text}`));
    expect(seen.size).toBe(8); // no duplicate double-sampling across the walk
    for (const s of samples) {
      expect(s.marginLeft, `${s.tag} "${s.text}" margin-left`).toBe("0px");
      expect(s.marginRight, `${s.tag} "${s.text}" margin-right`).toBe("0px");
      if (!s.inBlockquote && !s.inListItem) {
        expect(
          Math.abs(s.rectLeft - (paragraphLeft as number)),
          `${s.tag} "${s.text}" flush with paragraph`,
        ).toBeLessThan(FLUSH_TOLERANCE_PX);
      }
    }
  });

  test(`(${mode}) the completed register styles every level — h1 32px, h2–h6 22px/600`, async ({
    page,
  }) => {
    await openArticle(page);
    if (mode === "scrolling") await toggleMode(page);
    const { samples } = await collectAllHeadings(page);
    const byText = new Map(samples.map((s) => [s.text, s]));
    expect(byText.get("Part one")?.fontSize).toBe("32px");
    for (const text of [
      "Section",
      "Subsection",
      "Sub-subsection",
      "Deep section",
      "Deepest section",
    ]) {
      expect(byText.get(text)?.fontSize, `${text} font-size`).toBe("22px");
      expect(byText.get(text)?.fontWeight, `${text} font-weight`).toBe("600");
    }
  });
}

test("(semantic) heading levels h1–h6 stay queryable by role — structure is not flattened", async ({
  page,
}) => {
  await openArticle(page);
  await toggleMode(page); // scrolling mounts the whole body at once
  // The article title h1 + the body "Part one" h1; one heading per level
  // 2–6 (level 3 is 2 — Subsection + the quoted heading). Native semantics
  // carry the level; a flattened <p class="h2"> render fails every lookup.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 2, name: "Section" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Subsection" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 4, name: "Sub-subsection" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 5, name: "Deep section" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 6, name: "Deepest section" })).toBeVisible();
});

test("(quote) a heading inside a blockquote keeps the quotation's inline inset", async ({
  page,
}) => {
  await openArticle(page);
  await toggleMode(page);
  const { samples, paragraphLeft } = await sampleVisibleHeadings(page);
  const quoted = samples.find((s) => s.inBlockquote);
  expect(quoted?.text).toBe("Quoted heading");
  expect(quoted!.marginLeft).toBe("0px");
  // The blockquote's own margin-inline (1em) + rule padding insets the quote
  // box; the heading rides WITH the quote, never outside it.
  expect(quoted!.rectLeft).toBeGreaterThan(paragraphLeft as number);
});

test("(list) a heading inside a list item keeps the item's inline inset", async ({ page }) => {
  await openArticle(page);
  await toggleMode(page);
  const { samples, paragraphLeft } = await sampleVisibleHeadings(page);
  const listed = samples.find((s) => s.inListItem);
  expect(listed?.text).toBe("Listed heading");
  expect(listed!.marginLeft).toBe("0px");
  // The ul/li marker padding insets the item; the heading rides WITH the
  // item, never outside it — zeroing the heading's OWN margin must not
  // flatten the list's geometry.
  expect(listed!.rectLeft).toBeGreaterThan(paragraphLeft as number);
});

// ── Firefox evidence ledger (issue #191 AC 3 — honest bug status) ───────────
// The reported Firefox heading failure arrived through the #189 interview
// without a recording: "headings appear indented or insufficiently styled,
// including a Firefox report". What this spec establishes:
//   - A demonstrated, engine-independent cause of heading indentation:
//     author CSS (`0.5em` horizontal margins). It rendered the identical
//     indentation in the firefox project (before-values captured in the RED
//     run), which makes it the demonstrated cause OF THE INDENTATION the
//     report describes — without claiming the report described nothing
//     else. The flush cells above run on firefox as regression evidence.
//   - A demonstrated cause of "insufficiently styled": the register stopped
//     at h4; h5/h6 fell to UA defaults in every engine, Firefox included
//     (firefox h5 before-value: 14.94px). The register cells above pin the
//     completed register on firefox too.
//   - UNVERIFIED: whether the original report described exactly these two
//     causes, or ALSO a Firefox-only divergence on already-styled headings.
//     No such engine branch exists in the stylesheet (no @supports/-moz-
//     heading rules) and the h1–h6 samples above match across projects,
//     but the report's environment and screenshots are not on file, so a
//     distinct Firefox rendering fault cannot be ruled out from the record
//     alone. If a reader reproduces one, file it with engine version +
//     article + screenshot.
