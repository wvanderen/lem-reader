// tests/e2e/chrome/read-nav.spec.ts
// Issue #82 (decision #68) — the shell header's third nav destination:
// Read. One link, one derivation: the header consumes the FIRST entry of
// the SAME shared resume-target derivation the Continue-Reading rail
// renders (deriveResumeTargets — rail and nav cannot disagree).
//
// Requirements owned by this file:
//   - READNAV-01 — appears only with an unfinished target (hidden
//     entirely otherwise — never disabled, no library fallback); the
//     fresh-library baseline lives in shell-nav.spec.ts (1).
//   - READNAV-02 — visible label "Read", accessible name "Continue
//     reading" (the rail's vocabulary), plain native href pushing
//     history.
//   - READNAV-03 — using Read from the Library resumes the SAME article
//     at the SAME offset (the mode-agnostic offset restore).
//   - READNAV-04 — aria-current="page" ONLY while the open article IS
//     the target; reading any other article drops it.
//   - READNAV-05 — marking the target read rolls the pointer to the
//     next unfinished target; finishing the last hides the link.
//   - READNAV-06 — the pointer survives reload (Dexie-backed, no session
//     state).
//   - READNAV-07 — row budget: the 48px header stays one row (no wrap,
//     no overflow, no group overlap) at 320–810px on Library AND Reader
//     with the third link in flow (the wordmark collapse + the ≤420px
//     Reader staged collapse absorb the tight bands).
//   - READNAV-08 — keyboard reachability + visible focus (the global
//     :focus-visible ring) on the new link.
//
// Harness reuse (REUSE-DO-NOT-FORK): BASE + wipeDatabase + FIXTURES from
// ../annotations/_fixtures; the raw-IDB location seed + the seeded
// scrolling-mode settings put clone progress-recent.spec.ts /
// persistence.spec.ts (the established deterministic-seed disciplines).
// essay-long-form is the restore fixture (long-form prose supports
// meaningful scroll deltas).
import { test, expect, type Page } from "@playwright/test";
import { wipeDatabase } from "../annotations/_fixtures";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import { normalizeText, graphemeClusters } from "../../../src/content/normalizeText";
import { BASE } from "../_base";

/**
 * Node-built schema-valid standalones seeded as ARTICLE ROWS (the
 * progress-recent.spec.ts makeStandalone discipline): a wiped DB lists
 * only the starter fixture, and the resume-target derivation reads the
 * snapshot's standalone partition — so the rail/nav fixtures must be real
 * listed rows, not merely addressable regression fixtures.
 */
function makeStandalone(
  id: string,
  title: string,
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"3".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
  });
}

const sentence =
  "The morning inventory listed rope, lantern oil, and one borrowed chronometer whose owner everyone had politely forgotten about until the ferry arrived. ";

/** The resume workhorse — twelve long paragraphs so a 30% grapheme offset
 * maps to a deep, unambiguous scroll position in scrolling mode. */
const ARTICLE_A = makeStandalone("read-nav-essay", "The Long Resume Essay", [
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
  sentence.repeat(4),
]);
/** The "next unfinished" roll target — a second standalone row. */
const ARTICLE_B = makeStandalone("read-nav-second", "A Shorter Second Piece", [
  sentence.repeat(3),
  sentence.repeat(3),
  sentence.repeat(3),
]);

/** Grapheme totals feed the seed offsets (the progress-recent discipline:
 * the SAME normalizeText/graphemeClusters helpers the app derives with). */
const TOTAL_A = graphemeClusters(normalizeText(ARTICLE_A), ARTICLE_A.lang).length;
const TOTAL_B = graphemeClusters(normalizeText(ARTICLE_B), ARTICLE_B.lang).length;
const A_ID = ARTICLE_A.id;
const B_ID = ARTICLE_B.id;

/** The shell Primary nav (the a11y landmark contract — shell-nav precedent). */
function primaryNav(page: Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

/** The Read destination link — its accessible name is the aria-label
 * "Continue reading" (decision #68), never the visible text alone. */
function readLink(page: Page) {
  return primaryNav(page).getByRole("link", { name: "Continue reading" });
}

/** Seed one LocationRecord row via raw IndexedDB (the progress-recent
 * clone: the compound [articleId+revision] key is constructed by Dexie
 * from the row's fields). MUST run after the app has booted once so the
 * store exists, and BEFORE the reload that re-runs the snapshot load. */
async function seedLocation(
  page: Page,
  articleId: string,
  graphemeOffset: number,
  savedAt: string,
): Promise<void> {
  await page.evaluate(
    async ({ articleId, graphemeOffset, savedAt }) => {
      const location = {
        schemaVersion: 1 as const,
        articleId,
        revision: 1,
        graphemeOffset,
        savedAt,
      };
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("location")) {
            resolve();
            return;
          }
          const tx = db.transaction("location", "readwrite");
          tx.objectStore("location").put(location);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { articleId, graphemeOffset, savedAt },
  );
}

/** Seed readingMode "scrolling" (the persistence.spec.ts clone — after
 * the settings store exists; a reload hydrates it). */
async function seedScrollingMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("settings")) {
          resolve();
          return;
        }
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put({
          key: "reader-prefs",
          value: {
            schemaVersion: 2,
            font: "serif",
            size: 18,
            measure: 64,
            spacing: "comfortable",
            theme: "sepia",
            readingMode: "scrolling",
          },
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

/** Seed article rows via raw IndexedDB (the progress-recent clone). MUST
 * run before the reload so the composite library lists the rows. */
async function seedArticleRows(
  page: Page,
  articles: CanonicalArticle[],
): Promise<void> {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve();
          return;
        }
        const tx = db.transaction("articles", "readwrite");
        for (const row of rows) tx.objectStore("articles").put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, articles);
}

/** Boot the app once AFTER the wipe (a REAL reload — the post-wipe goto
 * alone is a same-document hash navigation, so Dexie would never reopen
 * and the stores would not exist for the raw seeds), seed the standalone
 * rows + their locations, then land on the Library with another FULL
 * reload so both AppInner's and LibraryView's snapshot loads re-run
 * against the seeds (the openLibrary discipline — the load effect runs
 * once per mount). */
async function openLibraryWith(
  page: Page,
  seeds: Array<{ article: CanonicalArticle; total: number; ratio: number; savedAt: string }>,
): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
  await seedArticleRows(
    page,
    seeds.map((seed) => seed.article),
  );
  for (const seed of seeds) {
    await seedLocation(
      page,
      seed.article.id,
      Math.floor(seed.total * seed.ratio),
      seed.savedAt,
    );
  }
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
}

/** The library row for a fixture id, found by its launch link (title text
 * can drift; the href is the byte-stable anchor). */
function libraryRowFor(page: Page, articleId: string) {
  return page
    .locator(".library-list > li")
    .filter({ has: page.locator(`a[href="#/article/${articleId}"]`) });
}

/** Header single-row geometry probe (the shell-nav (5) evaluate style —
 * layout truth is not role-queryable). */
function rowGeometry(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".app-header");
    const start = document.querySelector<HTMLElement>(".header-start");
    const controls = document.querySelector<HTMLElement>(".header-controls");
    if (!header || !start || !controls) return null;
    return {
      scrollHeight: header.scrollHeight,
      clientHeight: header.clientHeight,
      scrollWidth: header.scrollWidth,
      clientWidth: header.clientWidth,
      startRight: start.getBoundingClientRect().right,
      controlsLeft: controls.getBoundingClientRect().left,
    };
  });
}

/** The widths of the 320–810 acceptance sweep (#82): the tightest bands
 * on both sides of the two sanctioned collapses (≤420px Reader staged
 * clip; ≤639px wordmark collapse). */
const SWEEP_WIDTHS = [320, 375, 420, 421, 450, 480, 639, 640, 810] as const;

test.describe("Read nav (#82 — the shell Read destination over the shared resume-target derivation)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  // READNAV-01/02 — a partial read creates the target; the link labels
  // itself "Continue reading" for AT while showing "Read", and carries a
  // plain native href (pushes history; no interception).
  test("appears after a partial read; labels + native href (READNAV-01/02)", async ({
    page,
  }) => {
    await openLibraryWith(page, [
      { article: ARTICLE_A, total: TOTAL_A, ratio: 0.3, savedAt: "2026-01-03T00:00:00.000Z" },
    ]);
    const read = readLink(page);
    await expect(read).toBeVisible();
    await expect(read).toHaveAttribute(
      "href",
      `#/article/${A_ID}`,
    );
    await expect(read).toHaveAttribute("aria-label", "Continue reading");
    await expect(read).toHaveText("Read");
    // Off the Reader the link never claims aria-current (D15-09 family).
    expect(await read.getAttribute("aria-current")).toBeNull();
  });

  // READNAV-03 — activation from the Library opens the target article and
  // the offset restore lands deep in the prose (scrolling mode; the
  // persistence.spec restore assertion shape). The destination navigation
  // pushes history: Back returns to the Library (native href semantics).
  test("using Read from the Library resumes the same article, mid-prose (READNAV-03)", async ({
    page,
  }) => {
    // Boot once AFTER the wipe (real reload — Dexie recreates the
    // schema), seed scrolling mode + the article row + a 30% location,
    // then reload into the Library.
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await seedScrollingMode(page);
    await seedArticleRows(page, [ARTICLE_A]);
    await seedLocation(
      page,
      A_ID,
      Math.floor(TOTAL_A * 0.3),
      "2026-01-03T00:00:00.000Z",
    );
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await readLink(page).click();
    await expect(page).toHaveURL(new RegExp(`#/article/${A_ID}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Restore is block-level (rAF + async loadLocation + scrollIntoView);
    // a 30% offset on a long-form essay must land WELL below the fold —
    // landing at top would mean the resume pointer is decorative.
    await page.waitForTimeout(1500);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY, "expected the offset restore to land mid-prose").toBeGreaterThan(
      300,
    );
  });

  // READNAV-04 — aria-current="page" ONLY while the open article IS the
  // target. Reading the non-target leaves the pointer on the most recent
  // unfinished article (parking does not save a location).
  test("aria-current rides the target only (READNAV-04)", async ({ page }) => {
    await openLibraryWith(page, [
      // B read earlier; A most recent — A is the target.
      { article: ARTICLE_B, total: TOTAL_B, ratio: 0.2, savedAt: "2026-01-02T00:00:00.000Z" },
      { article: ARTICLE_A, total: TOTAL_A, ratio: 0.3, savedAt: "2026-01-03T00:00:00.000Z" },
    ]);
    const read = readLink(page);
    await expect(read).toBeVisible();
    await expect(read).toHaveAttribute("href", `#/article/${A_ID}`);

    // Reading the NON-target article: Read stays visible, points at A,
    // and does NOT claim aria-current.
    await page.goto(`${BASE}/#/article/${B_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(read).toBeVisible();
    await expect(read).toHaveAttribute("href", `#/article/${A_ID}`);
    expect(await read.getAttribute("aria-current")).toBeNull();

    // Reading the TARGET article: aria-current="page" (and only Read —
    // the Reader destination carries no Library/Highlights current).
    await page.goto(`${BASE}/#/article/${A_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(read).toHaveAttribute("aria-current", "page");
    expect(
      await primaryNav(page)
        .getByRole("link", { name: "Library" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  // READNAV-05 — finishing the target rolls the pointer to the next
  // unfinished target (same derivation, next entry); finishing the last
  // one hides the link entirely (spare chrome).
  test("mark read rolls the target to the next unfinished; the last finish hides Read (READNAV-05)", async ({
    page,
  }) => {
    await openLibraryWith(page, [
      { article: ARTICLE_B, total: TOTAL_B, ratio: 0.2, savedAt: "2026-01-02T00:00:00.000Z" },
      { article: ARTICLE_A, total: TOTAL_A, ratio: 0.3, savedAt: "2026-01-03T00:00:00.000Z" },
    ]);
    const read = readLink(page);
    await expect(read).toHaveAttribute("href", `#/article/${A_ID}`);

    // Mark the target (A) read via its library row action; the finished
    // mark proves the invalidation reload has landed (the ordering gate
    // for the pointer assertion below).
    const rowA = libraryRowFor(page, A_ID);
    await rowA.getByRole("button", { name: /^Mark as read:/ }).click();
    await expect(rowA.locator(".finished-mark")).toBeVisible();

    // The SAME derivation now yields B — no reload needed (the snapshot
    // broadcast re-runs AppInner's derivation).
    await expect(read).toHaveAttribute("href", `#/article/${B_ID}`);

    // Finishing the last unfinished article leaves no target: Read is
    // hidden ENTIRELY (count 0 — never a disabled shell).
    const rowB = libraryRowFor(page, B_ID);
    await rowB.getByRole("button", { name: /^Mark as read:/ }).click();
    await expect(rowB.locator(".finished-mark")).toBeVisible();
    await expect(readLink(page)).toHaveCount(0);
  });

  // READNAV-06 — the pointer is Dexie-backed state, not session state:
  // reloads and destination hops keep it correct.
  test("the target survives reload and destination hops (READNAV-06)", async ({
    page,
  }) => {
    await openLibraryWith(page, [
      { article: ARTICLE_A, total: TOTAL_A, ratio: 0.3, savedAt: "2026-01-03T00:00:00.000Z" },
    ]);
    const read = readLink(page);
    await expect(read).toHaveAttribute("href", `#/article/${A_ID}`);

    await page.reload();
    await expect(read).toHaveAttribute("href", `#/article/${A_ID}`);

    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(read).toHaveAttribute("href", `#/article/${A_ID}`);
  });

  // READNAV-07 — the 320–810 row budget with the third link live (the
  // #82 acceptance: "check 320–810px"). Both surfaces, every sweep width:
  // the 48px row neither wraps nor overflows and the two flex groups
  // never overlap (the strengthened 15-04 assertions, swept).
  test("row budget holds 320–810px on Library and Reader with Read live (READNAV-07)", async ({
    page,
  }) => {
    await openLibraryWith(page, [
      { article: ARTICLE_A, total: TOTAL_A, ratio: 0.3, savedAt: "2026-01-03T00:00:00.000Z" },
    ]);

    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: 640 });
      const libGeom = await rowGeometry(page);
      expect(libGeom, `library header mounted at ${width}px`).not.toBeNull();
      expect(
        libGeom!.scrollHeight,
        `library: no wrap at ${width}px`,
      ).toBeLessThanOrEqual(libGeom!.clientHeight + 1);
      expect(
        libGeom!.scrollWidth,
        `library: no horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(libGeom!.clientWidth + 1);
      expect(
        libGeom!.startRight,
        `library: groups never overlap at ${width}px`,
      ).toBeLessThanOrEqual(libGeom!.controlsLeft + 0.5);
    }

    // The Reader is the worst case (five 44px article-scoped controls);
    // reading the TARGET also puts the link at weight 600 (aria-current)
    // — the widest cell of the sweep.
    await page.goto(`${BASE}/#/article/${A_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(readLink(page)).toHaveAttribute("aria-current", "page");

    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: 640 });
      const geom = await rowGeometry(page);
      expect(geom, `reader header mounted at ${width}px`).not.toBeNull();
      expect(geom!.scrollHeight, `reader: no wrap at ${width}px`).toBeLessThanOrEqual(
        geom!.clientHeight + 1,
      );
      expect(
        geom!.scrollWidth,
        `reader: no horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(geom!.clientWidth + 1);
      expect(
        geom!.startRight,
        `reader: groups never overlap at ${width}px`,
      ).toBeLessThanOrEqual(geom!.controlsLeft + 0.5);
    }
  });

  // READNAV-08 — keyboard reachability + the visible global focus ring.
  // chromium + firefox follow DOM order in sequential navigation (the
  // shell-nav Tab-walk precedent); webkit degrades to programmatic
  // focusability + Enter activation (the 09-06 engine-honest gate).
  test("Read is keyboard reachable with a visible focus ring (READNAV-08)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openLibraryWith(page, [
      { article: ARTICLE_A, total: TOTAL_A, ratio: 0.3, savedAt: "2026-01-03T00:00:00.000Z" },
    ]);
    await page.setViewportSize({ width: 640, height: 640 });

    const isWebKit = test.info().project.name === "webkit";
    if (!isWebKit) {
      // Bounded walk: skip link → brand → Library → Highlights → Read.
      let landed = false;
      for (let i = 0; i < 8 && !landed; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(60);
        landed = await page.evaluate(() => {
          const el = document.activeElement;
          return (
            el instanceof HTMLAnchorElement &&
            el.getAttribute("aria-label") === "Continue reading"
          );
        });
      }
      expect(landed, "Tab must reach the Read destination").toBe(true);
      // The visible focus cue: the global 2px :focus-visible ring.
      const outline = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return null;
        const style = getComputedStyle(el);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
      expect(outline).not.toBeNull();
      expect(outline!.style).not.toBe("none");
      expect(parseInt(outline!.width, 10)).toBeGreaterThanOrEqual(2);
      // Activation resumes the target (native href — pushes history).
      await page.keyboard.press("Enter");
    } else {
      const read = readLink(page);
      await read.focus();
      await expect(read).toBeFocused();
      await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(new RegExp(`#/article/${A_ID}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
