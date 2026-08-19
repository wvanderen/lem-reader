// tests/e2e/portability/core-flow-spine.spec.ts
// Plan 13-06 Task 1 — the ACPT-06 phase gate: ONE deterministic, network-free
// core flow driven entirely through the real UI on chromium/firefox/webkit,
// extending the 09-06 two-context machine A/B harness (D13-08: .md anchoring
// — the payload is proven to clear the ING-06 thresholds + the 5-offset
// anchor gate by construction).
//
// THE V2.0 CORE FLOW (every step is the real reader flow — no DEV hooks, no
// direct storage writes for flow steps):
//   machine A: upload the proven .md payload through IngestControl → the
//              article opens (md-<contentHash> id) → pagination settles →
//              create one highlight via the real selection UI (toolbar →
//              "Highlight saved.") → switch to scrolling through the mode
//              toggle (persists readingMode — the prefs row that travels) →
//              scroll (the ONE shipped location-save path: useScrollSave's
//              window-scroll listener) → export the whole-library bundle
//              through the Settings UI (download capture)
//   Node side: unzip the captured bundle; sanity-check the v2 envelope
//   machine B: prepareFreshPage → import through the Settings UI including
//              the ImportPreviewDialog Proceed step → status summary
//   D13-09 no-content-loss bar:
//     (1) raw IndexedDB rows byte-equal between machine A and machine B
//         across the five row kinds (articles, highlights, notes, locations,
//         settings — readRow/readAllRows comparisons; books excluded per
//         D13-08, they have their own SC#4 spec)
//     (2) every reimported highlight re-resolves CONFIDENT through the
//         shipped resolveQuoteSelector (tri-state surfacing intact — nothing
//         silently dropped)
//     (3) the reimported article opens FROM THE LIBRARY, the traveled
//         highlight renders a visible mark, pagination reproduces machine
//         A's page count on the same engine, a NEW highlight can be created
//         (annotates), and the reading position restores after reload
//
// Reuse discipline (REUSE-DO-NOT-FORK): machine isolation + raw-row truth
// from ./_portability; the proven .md payload IMPORTED from
// ../library/markdown-upload.spec (never copied); the real-UI selection →
// toolbar → mark helpers from ../annotations/_fixtures; the restore bar
// mirrors persistence.spec.ts (scroll-driven save → mid-article restore).
// Every end condition is polled (expect.poll / auto-retrying locators /
// waitForFunction) — zero fixed sleeps (Pitfall 8).
import { test, expect } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import { resolveQuoteSelector } from "../../../src/content/normalizeText";
import type {
  TextPositionSelector,
  TextQuoteSelector,
} from "../../../src/content/normalizeText";
// Plan 13-06 (Option A — human decision 2026-08-18): the payload lives in
// the non-spec helper ../library/markdown-payload.ts (extracted from
// markdown-upload.spec.ts, same convention as _portability.ts/_fixtures.ts)
// so this spine reuses the PROVEN threshold-clearing bytes without touching
// a spec module. Both import-from-spec forms were empirically rejected:
//   - STATIC import of the .spec: Playwright re-executes the module inside
//     the importing file's isolated registry, re-registering markdown-
//     upload's 4 tests × 3 engines as cells of THIS file (measured: --list
//     = 15 cells), permanently duplicating 12 cells in every npm run test
//     and corrupting the honest D13-10 counts;
//   - DYNAMIC import: Playwright hard-errors at runtime ("did not expect
//     test.beforeEach() to be called here") because registration APIs are
//     load-phase only.
// The helper extraction exceeds the plan's original one-line export-keyword
// fence — sanctioned by the user as a Rule 4 architectural decision.
import { MARKDOWN_WITH_FRONTMATTER } from "../library/markdown-payload";
import {
  announcementRegion,
  countHighlightsInDexie,
  findFirstBlockWithText,
  selectRangeInBlock,
} from "../annotations/_fixtures";
import {
  openSettings,
  prepareFreshPage,
  readAllRows,
  readRow,
  readBundleJson,
  settingsStatus,
} from "./_portability";

/** The DEV pagination hook's committed shape (corpus-spec precedent). */
interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
}

/** Read the current __lemPagination snapshot (null until the engine commits). */
function paginationDev(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination as
        | PaginationDev
        | undefined
        | null,
  );
}

test("ACPT-06 — ingest .md, read, highlight, export, re-import: nothing lost across machines", async ({
  browser,
}) => {
  test.setTimeout(90_000); // two machines + two 1.2s debounces per engine
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // ── Machine A: ingest the proven .md payload through the real UI ───────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);

    await pageA.locator("input#ingest-file").setInputFiles({
      name: "calm-reading.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(MARKDOWN_WITH_FRONTMATTER, "utf-8"),
    });
    await pageA.getByRole("button", { name: /add file/i }).click();
    await pageA.waitForURL(/#\/article\/md-/, { timeout: 15_000 });

    const idMatch = /#\/article\/(md-[a-z0-9]+)/.exec(pageA.url());
    expect(idMatch, "the article route must carry the md- content-hash id").not.toBeNull();
    const articleId = idMatch![1]!;

    // ── Machine A: read it — pagination settles (engine commits, ok) ──────
    await expect(
      pageA.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(
        async () => {
          const dev = await paginationDev(pageA);
          return dev ? `${dev.status}:${dev.pagesLength}` : "pending";
        },
        { timeout: 15_000 },
      )
      .toMatch(/^ok:[2-9]\d*$/); // multi-page: the restore bar needs depth
    const pagesOnA = (await paginationDev(pageA))!.pagesLength;

    // ── Machine A: create one highlight through the real selection UI ─────
    const blockOne = await findFirstBlockWithText(pageA, 24);
    expect(blockOne, "the md article must have a selectable block").not.toBe(-1);
    expect(
      await selectRangeInBlock(pageA, blockOne, 0, 24),
      "selection must be set on the first block",
    ).toBeTruthy();
    const toolbar = pageA.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(
      pageA.locator("mark.highlight").first(),
      "the captured highlight must render an inline mark",
    ).toBeVisible();
    await expect(announcementRegion(pageA)).toContainText(/Highlight saved/i);

    // The highlight row persists (STATE-03) — poll the raw store.
    await expect
      .poll(
        async () =>
          (await readAllRows(pageA, "highlights")).filter((r) => r.articleId === articleId)
            .length,
        { timeout: 10_000 },
      )
      .toBe(1);

    // ── Machine A: mode toggle → scrolling (persists the prefs row) ───────
    // useScrollSave is scroll-driven — the ONE shipped location-save path —
    // so the reading position is produced by a real reader action: switch to
    // scrolling through the header toggle, then scroll (persistence.spec
    // precedent). The toggle also persists readingMode into reader-prefs,
    // giving the settings row that must travel byte-equal.
    const toggleA = pageA.getByRole("button", { name: /^Reading mode:/ });
    await toggleA.click();
    await expect(toggleA).toHaveAttribute("aria-label", "Reading mode: scrolling");
    await expect
      .poll(
        async () =>
          ((await readRow(pageA, "settings", "reader-prefs"))?.value as
            | { readingMode?: string }
            | undefined)?.readingMode ?? "missing",
        { timeout: 10_000 },
      )
      .toBe("scrolling");

    // ── Machine A: scroll — the debounced location save fires (~1200ms) ───
    const articleRowA = await readRow(pageA, "articles", articleId);
    expect(articleRowA, "the md article row must exist on machine A").not.toBeNull();
    const revision = articleRowA!.revision as number;
    // Scroll DEEP (60% of the article) — a shallow fixed offset stays inside
    // paginated page 1's content range (the 13-04 first-page budget reserve)
    // and the final reload-restore check would honestly land on page 1
    // (ok:0) instead of proving mid-article restore.
    await pageA.evaluate(() =>
      window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.6)),
    );
    await expect
      .poll(
        async () =>
          (await readRow(pageA, "location", [articleId, revision]))?.graphemeOffset ?? -1,
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    // Freeze machine A's exported set (read AFTER all writes settled).
    const highlightsOnA = (await readAllRows(pageA, "highlights")).filter(
      (r) => r.articleId === articleId,
    );
    expect(highlightsOnA).toHaveLength(1);
    const locationOnA = await readRow(pageA, "location", [articleId, revision]);
    expect(locationOnA).not.toBeNull();
    const prefsOnA = await readRow(pageA, "settings", "reader-prefs");
    expect(prefsOnA).not.toBeNull();
    const notesOnA = await readAllRows(pageA, "notes");

    // ── Machine A: export the whole-library bundle through the Settings UI ─
    const panelA = await openSettings(pageA);
    await expect(
      panelA.getByRole("button", { name: "Export library bundle" }),
    ).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lem-reader-bundle-v1.zip");
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node side: the transferred archive unzips; v2 envelope sanity ─────
    const { bundle: bundleJson, entries } = readBundleJson(bundlePath!);
    expect(entries["manifest.json"]).toBeDefined();
    expect(bundleJson.schemaVersion).toBe(2);
    expect(bundleJson.books).toEqual([]);
    expect(
      (bundleJson.articles as Array<{ id: string }>).map((a) => a.id),
    ).toEqual([articleId]);

    // ── Machine B: import through the Settings UI (preview → Proceed) ─────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);

    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 1 article, 1 highlight, 0 notes, and 1 reading position.",
    );
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 1 article, 1 highlight, 0 notes, and 1 reading position.",
      { timeout: 15_000 },
    );

    // ── D13-09 (1): raw IndexedDB rows byte-equal across the five kinds ────
    // Read BEFORE any machine-B reader action can schedule its own writes.
    const articleRowB = await readRow(pageB, "articles", articleId);
    expect(articleRowB, "the reimported article row must exist").not.toBeNull();
    expect(articleRowB).toEqual(articleRowA);

    const highlightsOnB = (await readAllRows(pageB, "highlights")).filter(
      (r) => r.articleId === articleId,
    );
    expect(highlightsOnB).toHaveLength(1);
    const byId = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a.id).localeCompare(String(b.id));
    expect([...highlightsOnB].sort(byId)).toEqual([...highlightsOnA].sort(byId));

    expect(await readAllRows(pageB, "notes")).toEqual(notesOnA);

    const locationOnB = await readRow(pageB, "location", [articleId, revision]);
    expect(locationOnB).not.toBeNull();
    expect(locationOnB).toEqual(locationOnA);

    const prefsOnB = await readRow(pageB, "settings", "reader-prefs");
    expect(prefsOnB).not.toBeNull();
    expect(prefsOnB).toEqual(prefsOnA);

    // ── D13-09 (2): every reimported highlight re-resolves CONFIDENT ──────
    // Through the SHIPPED resolver (the same machinery the importer + reader
    // run) — the honest tri-state: a confident resolve returns the
    // TextPositionSelector object; ambiguous/orphan return strings and fail.
    const reimportedArticle = ArticleSchema.parse(articleRowB!) as CanonicalArticle;
    for (const hl of highlightsOnB) {
      const resolved = resolveQuoteSelector(
        reimportedArticle,
        hl.quote as TextQuoteSelector,
        hl.position as TextPositionSelector,
      );
      expect(resolved, `highlight ${hl.id} must re-resolve confident (not ${resolved})`).toEqual(
        expect.objectContaining({
          start: expect.any(Number),
          end: expect.any(Number),
        }),
      );
    }

    // ── D13-09 (3): the reimported article reads identically ───────────────
    // Close the panel, reload (LibraryView loads once per mount — 08-05
    // precedent), and open the article FROM THE LIBRARY row link.
    await pageB.keyboard.press("Escape");
    await expect(panelB).not.toBeVisible();
    await pageB.reload();
    await expect(
      pageB.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await pageB.locator(`a[aria-labelledby="title-${articleId}"]`).click();

    // It opens in the traveled reading mode (scrolling prefs came along) and
    // the whole semantic body mounts.
    await expect(
      pageB.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await pageB.waitForFunction(
      () =>
        !!document.querySelector(
          ".article-body:not(.article-body-measurement) [data-block-index]",
        ),
      undefined,
      { timeout: 10_000 },
    );

    // The traveled highlight renders a visible mark (09-06 rendering bar).
    const traveledId = String(highlightsOnB[0]!.id);
    await expect(
      pageB.locator(`mark.highlight[data-highlight-id="${traveledId}"]`),
      "the traveled highlight must render a visible mark on machine B",
    ).toBeVisible({ timeout: 15_000 });

    // Annotates: a NEW highlight can be created on the reimported article —
    // a DISJOINT block (D5-13: overlapping selections surface the overlap
    // hint instead of the actions), via the same real selection UI.
    //
    // Machine B restored a MID-ARTICLE scroll position, so the shipped
    // document-order block walk (findFirstBlockWithTextAsync) would select
    // a block scrolled offscreen — the position:fixed toolbar renders at
    // the selection's viewport rect and its Highlight button lands outside
    // the viewport, where the click retries forever (first full run). Pick
    // the first block that is BOTH disjoint AND currently intersecting the
    // viewport; do NOT scrollIntoView — a synthetic scroll would fire the
    // debounced location save and overwrite the imported mid-article row
    // the final reload-restore check depends on.
    const blockTwo = await pageB.evaluate(
      ({ exclude, min }) => {
        const blocks = Array.from(
          document.querySelectorAll(
            '[data-block-index]:not(.article-body-measurement [data-block-index])',
          ),
        );
        for (const el of blocks) {
          const idx = Number(el.getAttribute("data-block-index"));
          const rect = el.getBoundingClientRect();
          const inViewport = rect.bottom > 0 && rect.top < window.innerHeight;
          if (
            !exclude.includes(idx) &&
            !Number.isNaN(idx) &&
            (el.textContent?.length ?? 0) >= min &&
            inViewport
          ) {
            return idx;
          }
        }
        return -1;
      },
      { exclude: [blockOne], min: 24 },
    );
    expect(blockTwo, "an in-viewport disjoint selectable block must exist").not.toBe(-1);
    expect(
      await selectRangeInBlock(pageB, blockTwo, 0, 24),
      "selection must be set on the disjoint block",
    ).toBeTruthy();
    const toolbarB = pageB.locator(".selection-toolbar");
    await expect(toolbarB).toBeVisible();
    await toolbarB.getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(announcementRegion(pageB)).toContainText(/Highlight saved/i);
    await expect
      .poll(async () => countHighlightsInDexie(pageB, articleId), { timeout: 10_000 })
      .toBe(2);

    // Restores (D13-09 3): reload while still in the traveled scrolling
    // mode — the shipped STATE-01 contract (persistence.spec.ts precedent:
    // loadLocation → findScrollTarget → scrollIntoView). The saved deep
    // mid-article position must restore past the article top.
    await pageB.reload();
    await expect(
      pageB.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () => pageB.evaluate(() => window.scrollY),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(100);

    // Paginates identically (D13-09 3): switch to paginated through the real
    // toggle; the engine commits ok with machine A's exact page count (same
    // engine, same content, same viewport — the "engine cannot tell an
    // ingested article from a fixture" bar), and the D4-10 mode-switch
    // anchor carries the RESTORED passage across the swap. The passage
    // assertion is the mode-switch-anchor.spec.ts (04-05) pattern: the
    // current page fragment must show the passage (adjacent-page tolerance
    // for overflow-guard split drift) — an absolute page-index assertion
    // would be wrong for a short article whose deepest restoreable passage
    // still begins on page 1.
    const toggleB = pageB.getByRole("button", { name: /^Reading mode:/ });
    const restoredPassage = await pageB.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll(
          '[data-block-index]:not(.article-body-measurement [data-block-index])',
        ),
      );
      for (const el of blocks) {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) {
          return (el.textContent ?? "").trim().slice(0, 40);
        }
      }
      return null;
    });
    expect(restoredPassage, "a restored in-viewport passage must exist").not.toBeNull();
    await toggleB.click();
    await expect(toggleB).toHaveAttribute("aria-label", "Reading mode: paginated");
    await expect
      .poll(
        async () => {
          const dev = await paginationDev(pageB);
          return dev ? `${dev.status}:${dev.pagesLength}` : "pending";
        },
        { timeout: 15_000 },
      )
      .toBe(`ok:${pagesOnA}`);
    // D4-10 passage round-trip (04-05 pattern): the page the toggle landed
    // on shows the restored passage (current fragment first; the article
    // body as the adjacent-page tolerance — the anchor is correct even if
    // the overflow guard's split point moved the passage by one page).
    await pageB.waitForFunction(
      (needle) => {
        const fragment = document.querySelector(".page-fragment");
        if (fragment && fragment.textContent?.includes(needle)) return true;
        const article = document.querySelector(".article-body");
        return !!article && article.textContent?.includes(needle);
      },
      restoredPassage!,
      { timeout: 10_000 },
    );
  } finally {
    await machineA.close();
    await machineB.close();
  }
});
