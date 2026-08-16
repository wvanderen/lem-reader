// tests/e2e/review-panel/jump-bidirectional.spec.ts
// Plan 10-03 Task 2 — the deep-link half of bidirectional jump.
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.c — jump bidirectional (both reading modes) + deep-link no re-jump
//   - RECV-01.i — regression rows (forced-colors / reduced-motion / keyboard /
//     a11y on #/review) extend this spec's route forms
//
// Strengthens the 10-01 Wave-0 sentinel in place (file + describe base name
// kept; content rewritten per the Phase-10-native strengthen-only rule).
// Proves RECV-01.c's ARRIVAL half + RECV-01.i in real browsers:
//   1. paginated arrival (default mode) — deep link focuses the <mark> and
//      replaceState-strips the /h/ suffix,
//   2. scrolling arrival — same, with a seeded readingMode "scrolling"
//      preference row (the Plan 04-06 Task 5 seed pattern),
//   3. refresh does NOT re-jump (the suffix is gone from the URL; only a
//      saved-location restore may run, never a jump),
//   4. calm no-op for an unresolvable id — normal article open, stripped
//      URL, no error surface (research Pitfall 4),
//   5. browser Back from the deep-linked article returns to #/review (the
//      SC#2 arrival half; the click-from-row loop closes in 10-06).
//
// Harness discipline (REUSE-DO-NOT-FORK):
//   - wipeDatabase from tests/e2e/annotations/_fixtures.ts (deleteDatabase
//     wipe per test), plus one app load so Dexie re-declares its schema —
//     seedRows silently no-ops against a store-less DB.
//   - makeArticle / confidentHighlightOn / highlightRow / seedRows from
//     tests/e2e/portability/_portability.ts — the article is built through
//     ArticleSchema and the anchor is derived-and-verified through the
//     SHIPPED deriveQuoteSelector/resolveQuoteSelector machinery, so the
//     seeded row re-resolves confident in the app.
//   - The focus assertion reuses the navigate-back.spec.ts L51–59
//     retry-assert shape (expect(async …).toPass) — never fixed sleeps for
//     arrival checks.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "../portability/_portability";
import { graphemeLength } from "../../../src/content/normalizeText";

const ARTICLE_ID = "deep-link-jump-corpus";
const HIGHLIGHT_ID = "hl-deep-link-jump-1";
const TITLE = "The Shifting Sandbanks Survey";

// Ten distinctive paragraphs (~430 chars each ≈ 4 paginated pages at the
// default viewport) so a ~60%-deep anchor provably requires a page turn
// (paginated) / a real scroll (scrolling) — arrival is never page-1-lucky.
const PARAGRAPHS = [
  "The cartographer arrived in the harbor town with nothing but a satchel of blank vellum and a brass astrolabe that had survived two shipwrecks. She had been commissioned to map the shifting sandbanks north of the mole, a task that had quietly defeated three surveyors before her, and she intended to succeed by patience rather than by instruments alone, walking the tidal flats at every low water for a full cycle of the moon.",
  "Her landlady at the anchorage inn insisted the banks were haunted by a choir of drowned bell-ringers, and that any chart drawn on a Tuesday would lie by the following spring tide. The cartographer thanked her for the warning, wrote the folklore down in the margins of her field book, and noted with some satisfaction that superstition, unlike sediment, keeps a perfectly stable position from one season to the next.",
  "On the fourth morning she met the eel fisherman who worked the channel at dawn. He showed her how a particular ripple over the middle bank meant firm sand beneath, while a certain slack brown water meant soft silt that would swallow a boot to the knee. This was exactly the kind of knowledge no instrument carried, and she traded him a hand-drawn sketch of the harbor mouth for three more afternoons of his memory.",
  "The survey method she settled on was deliberately slow. At each low water she drove a numbered willow stake into the flats, measured its distance from two fixed points on shore by triangulation, and recorded the time to the minute. On the following tide she would find the stake again, or not find it, and the difference between those two outcomes was itself data about how the bank had moved overnight.",
  "Winter storms erased a third of her stakes in a single October week, and a lesser surveyor might have abandoned the work. Instead she wrote to the harbormaster requesting the salvage logs of every vessel grounded on the banks in the previous forty years, reasoning that a ship that struck sand where none had been charted was a measuring instrument of a brutal but undeniable accuracy.",
  "The salvage logs arrived in March, tea-stained and incomplete, and she spent three weeks cross-referencing them against the tide tables. Slowly a pattern emerged that no single observation had suggested: the banks were not wandering randomly but rotating slowly around a submerged wreck, the way a compass needle swings back after a knock, and the rotation completed itself roughly every eleven years.",
  "She presented her finished chart to the harbor commission in June. It showed the banks as they stood, the banks as they would stand in five years, and the drowned wreck at the center of the rotation marked with a small careful cross. The commissioners argued for an hour about whether a chart of the future was science or prophecy, and then voted unanimously to pay for a hundred printed copies.",
  "The fisherman claimed his share of the credit for years afterward, telling anyone who would listen that the great rotating banks had been discovered by an eel, a boot, and a borrowed pencil. The cartographer never contradicted him. In her private notebook she wrote that the chart had three authors, and that the third one was the tide, which never once submitted its measurements on time.",
  "Decades later, when the harbor was dredged and the wreck pulled up and sold for scrap iron, the rotation stopped within a season, exactly as the chart had predicted it might. The sandbanks settled into a new and permanent shape, the channel became safe for the larger steamers, and the town grew rich enough to commission a statue of the cartographer holding a willow stake.",
  "The statue's plaque quotes her only surviving remark about the work: the sea keeps perfect records, she said, but files them under a language nobody reads twice the same way. Surveyors still leave a pencil stub at her pedestal before long commissions, and the eel fisherman's great-granddaughter still works the channel at dawn, reading ripples her grandmother taught her grandmother to read.",
];

const ARTICLE = makeArticle({
  id: ARTICLE_ID,
  title: TITLE,
  sourceUrl: "https://example.org/shifting-sandbanks-survey",
  paragraphs: PARAGRAPHS,
});

// A derived-and-verified CONFIDENT anchor ~60% deep in the article — the
// seeded row re-resolves confident in the app (the tri-state is computed by
// the shipped resolver, never forked here).
const ANCHOR = confidentHighlightOn(ARTICLE, {
  start: Math.floor(graphemeLength(ARTICLE) * 0.6),
});
const HIGHLIGHT_ROW = highlightRow(ARTICLE_ID, ANCHOR, HIGHLIGHT_ID);

// The persisted scrolling preference (the Plan 04-06 Task 5 seed shape —
// ReaderSettingsSchema-valid, readingMode "scrolling"). Seeding this row
// makes the deep-linked article open in scrolling mode.
const SCROLLING_PREFS_ROW = {
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
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** Mount the app once so Dexie re-declares its schema after the
 * deleteDatabase wipe (seedRows silently no-ops against a store-less DB),
 * then seed the corpus article + confident highlight (+ optional rows). */
async function seedCorpus(
  page: Page,
  extra: { settings?: Record<string, unknown>[] } = {},
): Promise<void> {
  await page.goto(`${BASE}/#/`);
  // FULL reload, not a hash-only navigation: wipeDatabase leaves the page
  // live against a deleted database (its own goto happens BEFORE the
  // delete), and BASE/ → BASE/#/ is same-document — the app never re-boots,
  // Dexie never re-declares its schema, and a raw indexedDB.open("lem-reader")
  // from seedRows would RECREATE the database as a store-less v1 whose open
  // connection then blocks Dexie's v4 upgrade forever (article loads hang).
  // The reload re-boots the app so Dexie creates the full v4 schema before
  // any seeding happens.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible();
  // A fixture row renders only once the composite repository's listArticles()
  // read has completed — the deterministic "Dexie is open + schema declared"
  // signal (the library is a fixtures ∪ ingested union, so it is never empty
  // and the empty-state heading cannot serve as this signal).
  await expect(
    page.getByText("The looting of science fiction").first(),
  ).toBeVisible();
  await seedRows(page, {
    articles: [ARTICLE],
    highlights: [HIGHLIGHT_ROW],
    ...(extra.settings ? { settings: extra.settings } : {}),
  });
}

/** The navigate-back.spec.ts L51–59 retry-assert shape (never a fixed
 * sleep): poll document.activeElement's data-highlight-id until the
 * deep-linked highlight's <mark> owns focus, then confirm the /h/ suffix
 * was replaceState-stripped from the URL. */
async function expectFocusedArrival(page: Page): Promise<void> {
  const mark = page.locator(
    `mark.highlight[data-highlight-id="${HIGHLIGHT_ID}"]`,
  );
  // Visible = mounted on the CURRENT page fragment (paginated renders marks
  // only on the live fragment) / rendered in the scrolling body.
  await expect(mark.first()).toBeVisible({ timeout: 10_000 });
  await expect(async () => {
    const focusedId = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute?.("data-highlight-id") ?? null;
    });
    expect(focusedId, "deep-link arrival focuses the <mark>").toBe(
      HIGHLIGHT_ID,
    );
  }).toPass({ timeout: 5000 });
  // The suffix strip is synchronous with the jump commit — poll briefly
  // for calm.
  await expect(async () => {
    expect(page.url()).not.toContain("/h/");
  }).toPass({ timeout: 5000 });
}

test.describe("RECV-01.c review-panel jump bidirectional (10-03 deep-link arrival)", () => {
  test("paginated arrival (default mode): deep link focuses the <mark> + strips /h/", async ({
    page,
  }) => {
    await seedCorpus(page);
    await page.goto(`${BASE}/#/article/${ARTICLE_ID}/h/${HIGHLIGHT_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    await expectFocusedArrival(page);
  });

  test("scrolling arrival: seeded scrolling preference, same focus + strip", async ({
    page,
  }) => {
    await seedCorpus(page, { settings: [SCROLLING_PREFS_ROW] });
    // Reload so SettingsProvider hydrates the seeded preference — the
    // persistence.spec.ts seed-then-reload discipline (the provider reads
    // the reader-prefs row once at boot, before the seed above wrote it).
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible();
    await page.goto(`${BASE}/#/article/${ARTICLE_ID}/h/${HIGHLIGHT_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    // The seeded preference actually hydrated (the arrival below would be
    // geometrically different otherwise, but pin the mode explicitly).
    await expect(
      page.getByRole("button", { name: /^Reading mode:/ }),
    ).toHaveAttribute("aria-label", "Reading mode: scrolling");
    await expectFocusedArrival(page);
  });

  test("refresh does not re-jump: article reopens calmly, the mark is not auto-focused", async ({
    page,
  }) => {
    await seedCorpus(page);
    await page.goto(`${BASE}/#/article/${ARTICLE_ID}/h/${HIGHLIGHT_ID}`);
    await expectFocusedArrival(page);
    // Reload. The URL no longer carries /h/, so parseHash yields a plain
    // article open — no jump prop, no jump effect. A saved-location restore
    // is acceptable (it scrolls but never focuses the mark).
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    expect(page.url()).not.toContain("/h/");
    // Grace window covering a hypothetical jump's full schedule (readiness
    // retries + the 120ms Firefox settle guard) — then it never fired.
    await page.waitForTimeout(800);
    const focusedId = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute?.("data-highlight-id") ?? null;
    });
    expect(focusedId, "reload must not re-jump to the mark").not.toBe(
      HIGHLIGHT_ID,
    );
  });

  test("calm no-op: an unresolvable highlight id opens the article normally", async ({
    page,
  }) => {
    await seedCorpus(page);
    await page.goto(`${BASE}/#/article/${ARTICLE_ID}/h/nonexistent-id`);
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    // No error surface (Pitfall 4 — the article error heading never
    // appears; the loaded corpus keeps the confident mark rendered, only
    // the JUMP is a no-op).
    await expect(
      page.getByRole("heading", { name: /Couldn't open this article/i }),
    ).toHaveCount(0);
    // The suffix is stripped once the highlights settle (loaded + absent →
    // terminal calm no-op).
    await expect(async () => {
      expect(page.url()).not.toContain("/h/");
    }).toPass({ timeout: 10_000 });
  });

  test("browser Back from the deep-linked article returns to #/review", async ({
    page,
  }) => {
    await seedCorpus(page);
    // Start at the panel (what a reader who followed a review row would
    // have behind them), then push the deep link exactly the way the
    // panel row will in 10-06: a plain location.hash assignment (a
    // history PUSH, not a replace).
    await page.goto(`${BASE}/#/review`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await page.evaluate(
      (hash) => {
        window.location.hash = hash;
      },
      `#/article/${ARTICLE_ID}/h/${HIGHLIGHT_ID}`,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    await expectFocusedArrival(page);
    // Back lands on #/review — the deep link was a history push.
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#\/review$/);
  });
});
