// tests/e2e/polish/cold-load-no-snap.spec.ts
// POLISH-01 SC#1 phase-exit gate (D13-01/D13-02/D13-03): a reader who
// cold-loads with persisted NON-default settings (theme dark, font sans,
// size 22, readingMode scrolling) sees those settings from the first paint.
// The whole first-paint mutation timeline of documentElement is recorded by
// a MutationObserver installed via page.addInitScript (the only reliable
// "from navigation start" observation point — it runs before the inline
// pre-React script in index.html and before the app bundle). Three clauses:
//
//   1. FIRST recorded mutation already carries the persisted data-theme and
//      --font-size (the inline paint-hint script worked — not React's
//      hydration).
//   2. NO record anywhere in the timeline shows a data-theme or --font-size
//      different from the persisted values (no default→persisted flip —
//      Pitfall 2: React's mount-time applyTheme must write byte-identical
//      values via the mirror lazy-init).
//   3. The scrolling surface is present from the FIRST article paint when
//      the persisted readingMode is scrolling (mode lazy-init worked — the
//      paginated-surface class never appears in any inserted node).
//
// Second test (wipe / Pitfall 1): a reader with valid persisted settings +
// mirror whose Dexie row goes corrupt drives the WipeConfirm destructive
// path; the wipe MUST clear BOTH truths — after reload defaults paint and
// the dead preferences never resurrect from localStorage (localStorage
// survives db.delete(); the zombie-mirror bug is exactly a dark/22 mirror
// outliving the wipe).
//
// Wipe discipline + seeding reuse the shipped harness (REUSE-DO-NOT-FORK):
// prepareFreshPage/seedRows from tests/e2e/portability/_portability.ts
// (clear-rows-not-deleteDatabase — the webkit race avoider; raw settings-row
// puts — the round-trip.spec.ts L111-127 non-default prefs precedent).
// Every end condition uses waitForFunction/expect.poll quiescence — zero
// fixed sleeps anywhere (Pitfall 8).
import { test, expect, type Page } from "@playwright/test";
import { BASE, prepareFreshPage, seedRows } from "../portability/_portability";

const FIXTURE = "essay-long-form";
const MIRROR_KEY = "lem-settings-mirror-v1";

/** The persisted non-default record BOTH truths carry (theme dark, font
 * sans, size 22, readingMode scrolling — the plan's SC#1 seed). */
const PERSISTED = {
  schemaVersion: 2,
  font: "sans",
  size: 22,
  measure: 72,
  spacing: "spacious",
  theme: "dark",
  readingMode: "scrolling",
};

/** The DEFAULT tokens a wiped reader must paint (D-07 warm-paper). */
const DEFAULT_THEME = "sepia";
const DEFAULT_FONT_SIZE = "18px";

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
});

/**
 * Install the navigation-start recorder via addInitScript: seeds the mirror
 * key into localStorage (BEFORE the inline script reads it) and mounts two
 * observers — (a) documentElement data-theme/style attribute mutations →
 * window.__paintRecords; (b) inserted subtrees → first-visible-block surface
 * + paginated-surface detection (window.__firstBlock / __sawPaginated).
 * `seedMirror` false omits the localStorage seeding (wipe test reloads).
 *
 * The script body is PLAIN JS (a serialized function must not carry TS-only
 * syntax — casts would SyntaxError at browser evaluation and silently kill
 * the whole recorder).
 */
function installRecorder(page: Page, seedMirror: boolean): void {
  const script = `(function () {
  var KEY = ${JSON.stringify(MIRROR_KEY)};
  var VALUE = ${JSON.stringify(JSON.stringify(PERSISTED))};
  var SEED = ${JSON.stringify(seedMirror)};
  var W = window;
  if (SEED) {
    try { localStorage.setItem(KEY, VALUE); } catch (e) { /* best-effort seed */ }
  }
  // (a) token timeline — records ONLY actual mutations (no baseline
  // snapshot), so records[0] IS the first write: the inline script's.
  W.__paintRecords = [];
  function snap() {
    var de = document.documentElement;
    var cs = getComputedStyle(de);
    W.__paintRecords.push({
      t: performance.now(),
      theme: de.dataset.theme != null ? de.dataset.theme : null,
      fontSize: cs.getPropertyValue("--font-size").trim() || null,
    });
  }
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].target === document.documentElement) { snap(); return; }
    }
  }).observe(document, {
    attributes: true,
    subtree: true,
    attributeFilter: ["data-theme", "style"],
  });
  // (b) inserted-subtree watcher: paginated-surface never appears + the
  // FIRST visible (non-measurement) article block already sits in the
  // scrolling body. React inserts mounted trees as subtree roots, so
  // querySelector over each added node catches blocks inside them.
  W.__sawPaginatedSurface = false;
  W.__firstBlock = null;
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (!(n instanceof Element)) continue;
        if (n.classList.contains("paginated-surface") || n.querySelector(".paginated-surface") !== null) {
          W.__sawPaginatedSurface = true;
        }
        if (W.__firstBlock === null) {
          var blk = n.matches("[data-block-index]") ? n : n.querySelector("[data-block-index]");
          if (blk && blk.closest(".article-body-measurement") === null) {
            W.__firstBlock = {
              t: performance.now(),
              inScrollingBody: blk.closest(".article-body:not(.article-body-measurement)") !== null,
            };
          }
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
})();`;
  void page.addInitScript({ content: script });
}

/** Force a FULL navigation (a bare hash change from the library view is a
 * same-document navigation — the app never reloads and init scripts never
 * run). Hopping to about:blank first makes the article goto a true cold
 * load. */
async function coldLoad(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

/** Wait until the record tail is stable (no new documentElement mutations
 * for 400ms — covers the ~400ms settings debounce + hydration settle) AND
 * the live scrolling surface's first block is mounted. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".article-body:not(.article-body-measurement) [data-block-index]",
      ) !== null,
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const before = (
          window as unknown as { __paintRecords: unknown[] }
        ).__paintRecords.length;
        setTimeout(() => {
          resolve(
            (
              window as unknown as { __paintRecords: unknown[] }
            ).__paintRecords.length === before,
          );
        }, 400);
      }),
    undefined,
    { timeout: 10_000 },
  );
}

test("SC#1 — cold load with persisted non-default settings paints them first with zero flip", async ({
  page,
}) => {
  // Seed the Dexie truth like a real reader (raw reader-prefs put — the
  // round-trip.spec.ts precedent), then arm the recorder + mirror for the
  // NEXT navigation: the cold load under test.
  await seedRows(page, { settings: [{ key: "reader-prefs", value: PERSISTED }] });
  installRecorder(page, true);
  await coldLoad(page, `${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await settle(page);

  const state = await page.evaluate(() => {
    const W = window as unknown as {
      __paintRecords: Array<{ t: number; theme: string | null; fontSize: string | null }>;
      __firstBlock: { t: number; inScrollingBody: boolean } | null;
      __sawPaginatedSurface: boolean;
    };
    return {
      records: W.__paintRecords,
      firstBlock: W.__firstBlock,
      sawPaginated: W.__sawPaginatedSurface,
      paginatedCount: document.querySelectorAll(".paginated-surface").length,
      liveTheme: document.documentElement.dataset.theme ?? null,
      liveFontSize:
        getComputedStyle(document.documentElement).getPropertyValue("--font-size").trim() || null,
    };
  });

  // Clause 0 (mechanism sanity): the timeline is non-empty and the article
  // actually painted.
  expect(
    state.records.length,
    "documentElement token mutations must have been recorded",
  ).toBeGreaterThan(0);
  expect(state.firstBlock, "a visible article block must have mounted").not.toBeNull();

  // Clause 1 — the FIRST recorded mutation already carries the persisted
  // tokens: the inline pre-React script worked (not React hydration).
  expect(
    state.records[0]?.theme,
    `first record must carry persisted theme "dark", got ${JSON.stringify(state.records[0])}`,
  ).toBe("dark");
  expect(state.records[0]?.fontSize).toBe("22px");

  // Clause 2 — NO record anywhere in the timeline shows a different
  // data-theme or --font-size (no default→persisted flip — Pitfall 2).
  for (const [i, rec] of state.records.entries()) {
    expect(
      rec.theme,
      `record ${i} must carry theme "dark" (no flip anywhere in the timeline)`,
    ).toBe("dark");
    expect(rec.fontSize, `record ${i} must carry --font-size 22px`).toBe("22px");
  }

  // Clause 3 — scrolling surface from the FIRST article paint; the
  // paginated surface never appears (mode lazy-init worked).
  expect(
    state.firstBlock?.inScrollingBody,
    "the first visible article block must already sit in the scrolling .article-body",
  ).toBe(true);
  expect(state.sawPaginated, "the paginated-surface class must never appear").toBe(false);
  expect(state.paginatedCount).toBe(0);

  // Live settled state agrees (hydration matched, nothing drifted).
  expect(state.liveTheme).toBe("dark");
  expect(state.liveFontSize).toBe("22px");
});

test("SC#1 wipe — the destructive reset clears BOTH truths; a wiped reader cold-loads to defaults with no zombie mirror (Pitfall 1)", async ({
  page,
}) => {
  // A real reader with valid persisted settings: Dexie row + mirror carry
  // the same non-default record. Then the Dexie row goes corrupt (the
  // STATE-05 WipeConfirm trigger).
  await seedRows(page, { settings: [{ key: "reader-prefs", value: PERSISTED }] });
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: MIRROR_KEY, value: JSON.stringify(PERSISTED) },
  );
  await seedRows(page, {
    settings: [{ key: "reader-prefs", value: { broken: "not a ReaderSettings record" } }],
  });

  // Cold-load with the recorder armed (no mirror seeding — the real mirror
  // set above must survive to prove the wipe clears it). The corrupt Dexie
  // row opens WipeConfirm.
  installRecorder(page, false);
  await coldLoad(page, `${BASE}/#/article/${FIXTURE}`);
  const wipeDlg = page.locator("dialog.wipe-confirm");
  await expect(wipeDlg).toBeVisible({ timeout: 10_000 });

  // Drive the destructive path (the ONLY db.delete() call site — Pitfall 8).
  await wipeDlg.locator("button.wipe-confirm-destructive").click();
  await expect(wipeDlg).not.toBeVisible({ timeout: 10_000 });

  // Pitfall 1 catch, in the LIVE page: localStorage survived db.delete() —
  // only resetLocalData's clearSettingsMirror can null it.
  await expect
    .poll(
      () => page.evaluate((key) => localStorage.getItem(key), MIRROR_KEY),
      { timeout: 5_000, message: "mirror key must read back null after the wipe" },
    )
    .toBeNull();

  // Reload the wiped reader: defaults paint (records show the default
  // theme — the dead dark/22 prefs never resurrect), and the mirror stays
  // free of the dead record.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await settle(page);

  const state = await page.evaluate((key) => {
    const W = window as unknown as {
      __paintRecords: Array<{ t: number; theme: string | null; fontSize: string | null }>;
    };
    return {
      records: W.__paintRecords,
      mirrorRaw: localStorage.getItem(key),
      mirrorParsed: (() => {
        try {
          return JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
        } catch {
          return null;
        }
      })(),
      liveTheme: document.documentElement.dataset.theme ?? null,
    };
  }, MIRROR_KEY);

  expect(
    state.records.length,
    "the mount-time applyTheme(DEFAULT_SETTINGS) must have written tokens",
  ).toBeGreaterThan(0);
  for (const [i, rec] of state.records.entries()) {
    expect(
      rec.theme,
      `post-wipe record ${i} must show the DEFAULT theme (no zombie prefs)`,
    ).toBe(DEFAULT_THEME);
    expect(rec.fontSize, `post-wipe record ${i} must show the DEFAULT size`).toBe(
      DEFAULT_FONT_SIZE,
    );
  }
  expect(state.liveTheme).toBe(DEFAULT_THEME);

  // The mirror carries no trace of the dead record. (After hydration it may
  // be re-seeded with the CURRENT truth — the defaults — by the hydrate
  // self-correct; the zombie check is that the dead prefs never return.)
  const mirrorTheme = (state.mirrorParsed as { theme?: string } | null)?.theme ?? null;
  expect(
    mirrorTheme !== "dark",
    `mirror must be null or defaults after wipe (dead theme "dark" never resurrects), got ${state.mirrorRaw}`,
  ).toBe(true);
});
