// tests/e2e/readaloud/read-aloud-seek.spec.ts
// Issue #166 e2e leg — the article-position seek control and the previous/
// next passage steps, in a REAL browser. The speechSynthesis fake is the
// shared controllable harness (playback events are always test-driven) —
// deterministic across chromium/firefox/webkit.
//
// The issue's acceptance criteria, pinned here in BOTH reading modes:
//   1. The transport bar exposes an accessible seek control — a native range
//      slider over ARTICLE position (aria-label "Article position"; the
//      value feedback is "% through the article", never a duration) — and
//      seeking while PLAYING continues speech from the picked position,
//      backward and forward (the committed-change path; Home key =
//      keyboard operation).
//   2. Seeking while PAUSED remains paused — no speech starts, the transport
//      stays at "Play" — and the seek still updates the single canonical
//      saved reading position (the raw IndexedDB location row); resuming
//      speaks from the target, and leaving + reopening restores it.
//   3. Seeking to the end (100%) FINISHES playback through the ONE
//      completion seam — the finished announcement, the end-pin save, no
//      wrap to the beginning, no resurrected speech.
//   4. Previous/next passage steps jump one utterance-sized passage in each
//      direction, and a step at a session boundary announces ONCE through
//      the polite region while the session keeps playing.
import { test, expect, type Page } from "@playwright/test";
import { bundledFixtures } from "../../../src/fixtures";
import { chunkArticleForSpeech, type SpeechChunk } from "../../../src/readaloud/chunks";
import type { CanonicalArticle } from "../../../src/content/types";
import { graphemeLength } from "../../../src/content/normalizeText";
// REUSE-DO-NOT-FORK: the shared controllable-fake speechSynthesis harness.
import { installFakeSpeech, type SpeechMode } from "./_speech";
import { BASE, clearAllRows, playAndAwaitProbe } from "./_harness";

const ESSAY = bundledFixtures.find((f) => f.id === "essay-long-form")!;
const CHUNKS: SpeechChunk[] = chunkArticleForSpeech(ESSAY);
const TOTAL = graphemeLength(ESSAY);

/** The chunk containing the offset the ROUTE computes for a slider percent
 * (the exact mirror of ArticleView's percent→offset mapping + the engine's
 * chunk lookup). */
function chunkAtPercent(percent: number): SpeechChunk {
  const offset = Math.round((percent / 100) * TOTAL);
  const found = CHUNKS.find((c) => c.endGrapheme > offset);
  expect(found, `a chunk must contain percent ${percent}`).toBeDefined();
  return found!;
}

/** The highest slider percent (≤99) that lands INSIDE the last chunk — the
 * forward navigation-boundary launch point. */
const LAST_CHUNK_PERCENT = (() => {
  const last = CHUNKS[CHUNKS.length - 1]!;
  for (let p = 99; p >= 0; p--) {
    if (chunkAtPercent(p) === last) return p;
  }
  throw new Error("no percent below 100 lands in the last chunk");
})();

/** Open an article with the fake speech installed (ORDER IS LOAD-BEARING:
 * init script before the first goto — the article URL differs from the
 * library by hash only, so the stub-installed document survives). */
async function openArticle(page: Page, mode: SpeechMode = "word"): Promise<Page> {
  await installFakeSpeech(page, mode);
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await clearAllRows(page);
  await page.goto(`${BASE}/#/article/${ESSAY.id}`);
  return page;
}

/** Flip the reader to scrolling mode through the shared header toggle (the
 * mode-switch-anchor.spec.ts precedent). */
async function toggleToScrolling(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Reading mode:/ }).click();
  await expect(page.locator("#main")).not.toHaveClass(/paginated-main/);
}

/** The text of the CURRENT live playback utterance (null when none). */
async function liveUtteranceText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __speechSpoken: { text: string; volume: number; done: boolean; cancelled: boolean }[];
    };
    const live = [...w.__speechSpoken]
      .reverse()
      .find((r) => !r.done && !r.cancelled && r.volume === 1);
    return live ? live.text : null;
  });
}

/** The total number of utterances queued so far (playback + probe). */
async function spokenCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __speechSpoken: unknown[] }).__speechSpoken.length,
  );
}

/** Drain the queue until `text` is the live utterance (bounded loop — the
 * fake is test-driven, so draining IS the mechanism, not a wait). */
async function drainUntilLive(page: Page, text: string): Promise<void> {
  await expect
    .poll(async () => {
      const live = await liveUtteranceText(page);
      if (live === null) return "none";
      if (live === text) return "target";
      await page.evaluate(() => {
        const w = window as unknown as {
          __speechSpoken: { done: boolean; cancelled: boolean; volume: number }[];
          __speechFire: (event: string, charIndex?: number) => void;
        };
        const liveRec = [...w.__speechSpoken]
          .reverse()
          .find((r) => !r.done && !r.cancelled && r.volume === 1);
        if (liveRec) w.__speechFire("end");
      });
      return "draining";
    })
    .toBe("target");
}

/** Seek through the slider by dispatching the picked value the way a real
 * drag/keyboard change delivers it to React: the NATIVE value setter (bypass
 * the controlled-input tracker) + a bubbling input event. locator.fill()
 * races React's value tracker here — a skipped onChange silently no-ops the
 * seek while the queue drains on (the flake this helper exists for). */
async function seekViaSlider(page: Page, percent: number): Promise<void> {
  await page.locator(".readaloud-seek").evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, percent);
}

/** The saved location row's grapheme offset (the canonical save — raw
 * IndexedDB, not rendered UI; the read-aloud.spec.ts seam). */
async function readLocationOffset(page: Page): Promise<number | null> {
  return page.evaluate(async (articleId) => {
    return new Promise<number | null>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("location")) {
          resolve(null);
          return;
        }
        const tx = db.transaction("location", "readonly");
        const getAll = tx.objectStore("location").getAll();
        getAll.onsuccess = () => {
          const rows = (
            getAll.result as Array<{
              articleId: string;
              graphemeOffset: number;
              savedAt: string;
            }>
          ).filter((r) => r.articleId === articleId);
          const latest = rows.sort((a, b) => (a.savedAt > b.savedAt ? 1 : -1)).pop();
          resolve(latest ? latest.graphemeOffset : null);
        };
        getAll.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  }, ESSAY.id);
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

const MODES = ["paginated", "scrolling"] as const;

for (const MODE of MODES) {
  test.describe(`Issue #166 — seek through read-aloud (${MODE} mode)`, () => {
    test.setTimeout(120_000);

    test("the slider is accessible and seeks backward/forward while playing", async ({ page }) => {
      await openArticle(page);
      if (MODE === "scrolling") await toggleToScrolling(page);
      const bar = page.locator(".readaloud-bar");
      await playAndAwaitProbe(page);

      // Anatomy: a slider named "Article position" whose value feedback is
      // article-percent currency — never a duration (no reliable audio time
      // exists, so none is implied).
      const slider = bar.getByRole("slider", { name: "Article position" });
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("aria-valuetext", /% through the article$/);
      await expect(slider).toHaveAttribute("min", "0");
      await expect(slider).toHaveAttribute("max", "100");

      // Forward seek to 80% while PLAYING: speech continues from the chunk
      // containing the picked position.
      const chunk80 = chunkAtPercent(80);
      await seekViaSlider(page, 80);
      await drainUntilLive(page, chunk80.text);
      expect(await liveUtteranceText(page)).toBe(chunk80.text);
      // The seeked utterance's onstart (natural in real browsers) surfaces
      // the new position in the slider's controlled value.
      const seekedPercent = Math.round((chunk80.startGrapheme / TOTAL) * 100);
      await page.evaluate(() => {
        (window as unknown as { __speechFire: (event: string) => void }).__speechFire("start");
      });
      await expect(slider).toHaveValue(String(seekedPercent));

      // Keyboard operation: Home jumps the voice back to the article start.
      const chunk0 = CHUNKS[0]!;
      await slider.focus();
      await page.keyboard.press("Home");
      await drainUntilLive(page, chunk0.text);
      expect(await liveUtteranceText(page)).toBe(chunk0.text);

      await bar.getByRole("button", { name: "Stop" }).click();
    });

    test("repeated native arrow keys advance through passages while paused", async ({ page }) => {
      await openArticle(page);
      if (MODE === "scrolling") await toggleToScrolling(page);
      const bar = page.locator(".readaloud-bar");
      await playAndAwaitProbe(page);
      await drainUntilLive(page, CHUNKS[0]!.text);
      await bar.getByRole("button", { name: "Pause" }).click();
      const slider = bar.getByRole("slider", { name: "Article position" });
      await slider.focus();
      await page.keyboard.press("Home");
      const count = await spokenCount(page);
      for (let percent = 1; percent <= 15; percent++) {
        await page.keyboard.press("ArrowRight");
        await expect(slider).toHaveValue(String(percent));
      }
      await expect.poll(() => readLocationOffset(page)).toBe(chunkAtPercent(15).startGrapheme);
      expect(await spokenCount(page)).toBe(count);
      await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
      // Blur restores the actual passage position, then resume speaks it.
      await page.keyboard.press("Tab");
      await expect(slider).toHaveValue(
        String(Math.round((chunkAtPercent(15).startGrapheme / TOTAL) * 100)),
      );
      await bar.getByRole("button", { name: "Play" }).click();
      await drainUntilLive(page, chunkAtPercent(15).text);
    });

    test("seeking while paused stays paused, saves the position, and resumes at the target", async ({
      page,
    }) => {
      await openArticle(page);
      if (MODE === "scrolling") await toggleToScrolling(page);
      const bar = page.locator(".readaloud-bar");
      await playAndAwaitProbe(page);

      // Land on chunk 1, then pause — the synthesizer now holds an utterance.
      await drainUntilLive(page, CHUNKS[1]!.text);
      await bar.getByRole("button", { name: "Pause" }).click();
      await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();

      // Seek to 80% while PAUSED: no speech starts (queue count frozen), the
      // transport stays paused — and the canonical save still moved.
      const chunk80 = chunkAtPercent(80);
      const countBeforeSeek = await spokenCount(page);
      await seekViaSlider(page, 80);
      await page.waitForTimeout(300);
      expect(await spokenCount(page)).toBe(countBeforeSeek); // nothing queued
      await expect(bar.getByRole("button", { name: "Play" })).toBeVisible(); // still paused
      await expect
        .poll(async () => readLocationOffset(page), { timeout: 15_000 })
        .toBe(chunk80.startGrapheme);

      // BACKWARD while paused (still paused, queue still frozen): the save
      // follows the backward seek — the latest seek owns the position.
      const chunk20 = chunkAtPercent(20);
      await seekViaSlider(page, 20);
      await page.waitForTimeout(300);
      expect(await spokenCount(page)).toBe(countBeforeSeek); // still nothing
      await expect(bar.getByRole("button", { name: "Play" })).toBeVisible(); // still paused
      await expect
        .poll(async () => readLocationOffset(page), { timeout: 15_000 })
        .toBe(chunk20.startGrapheme);

      // Resume: speech comes from the SEEK TARGET (the held utterance was
      // replaced, not finished) — the LAST seek, not the first.
      await bar.getByRole("button", { name: "Play" }).click();
      await drainUntilLive(page, chunk20.text);
      expect(await liveUtteranceText(page)).toBe(chunk20.text);

      // The seek IS the saved resume position: leave and reopen restores it.
      await page.goto(`${BASE}/`);
      await page.goto(`${BASE}/#/article/${ESSAY.id}`);
      await page.reload();
      await expect(page.getByText("Returned to where you left off.")).toBeVisible({
        timeout: 15_000,
      });
    });

    for (const paused of [false, true]) {
      test(`seeking into trailing code finishes from ${paused ? "paused" : "playing"}`, async ({
        page,
      }) => {
        await openArticle(page);
        const article: CanonicalArticle = {
          ...ESSAY,
          blocks: [
            { kind: "paragraph", content: [{ text: "A short spoken passage.", marks: [] }] },
            { kind: "code-block", source: "unspoken source text ".repeat(50) },
          ],
          footnotes: [],
        };
        const total = graphemeLength(article);
        await page.evaluate(async (row) => {
          await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open("lem-reader");
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction("articles", "readwrite");
              tx.objectStore("articles").put(row);
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
          });
        }, article);
        await page.reload();
        if (MODE === "scrolling") await toggleToScrolling(page);
        await playAndAwaitProbe(page);
        const bar = page.locator(".readaloud-bar");
        if (paused) await bar.getByRole("button", { name: "Pause" }).click();
        const count = await spokenCount(page);
        await seekViaSlider(page, 95); // beyond speech, short of the canonical end
        await expect(bar.getByRole("button", { name: "Read aloud" })).toBeVisible();
        await expect(
          page.getByRole("status").filter({ hasText: "Read aloud finished." }),
        ).toHaveCount(1);
        await expect.poll(() => readLocationOffset(page)).toBe(total);
        expect(await spokenCount(page)).toBe(count);
        expect(await liveUtteranceText(page)).toBeNull();
      });
    }

    test("seeking to the end finishes playback without wrapping to the beginning", async ({
      page,
    }) => {
      await openArticle(page);
      if (MODE === "scrolling") await toggleToScrolling(page);
      const bar = page.locator(".readaloud-bar");
      await playAndAwaitProbe(page);

      // Drain the first chunk so a live session is unambiguous, then seek
      // all the way: the session FINISHES (the ONE completion seam) instead
      // of wrapping to the top.
      await drainUntilLive(page, CHUNKS[0]!.text);
      await seekViaSlider(page, 100);

      // The finished announcement through the ONE polite region; the
      // transport rests at the idle entry.
      await expect(
        page.getByRole("status").filter({ hasText: "Read aloud finished." }),
      ).toHaveCount(1);
      await expect(bar.getByRole("button", { name: "Read aloud" })).toBeVisible();

      // The end-pin persisted (the same truth the Finished check reads).
      await expect.poll(async () => readLocationOffset(page), { timeout: 15_000 }).toBe(TOTAL);

      // No wrap: nothing speaks again, and stale queue events resurrect
      // nothing.
      const countAfterFinish = await spokenCount(page);
      await page.evaluate(() => {
        const w = window as unknown as {
          __speechFire: (event: string, charIndex?: number) => void;
        };
        w.__speechFire("end");
        w.__speechFire("start");
      });
      await page.waitForTimeout(300);
      expect(await spokenCount(page)).toBe(countAfterFinish);
      expect(await liveUtteranceText(page)).toBeNull();
    });

    test("previous/next passage steps navigate one passage at a time, with honest boundaries", async ({
      page,
    }) => {
      await openArticle(page);
      if (MODE === "scrolling") await toggleToScrolling(page);
      const bar = page.locator(".readaloud-bar");
      await playAndAwaitProbe(page);

      // Next passage: one utterance-sized step forward…
      await drainUntilLive(page, CHUNKS[0]!.text);
      await bar.getByRole("button", { name: "Next passage" }).click();
      await drainUntilLive(page, CHUNKS[1]!.text);
      expect(await liveUtteranceText(page)).toBe(CHUNKS[1]!.text);

      // …and previous passage steps back.
      await bar.getByRole("button", { name: "Previous passage" }).click();
      await drainUntilLive(page, CHUNKS[0]!.text);
      expect(await liveUtteranceText(page)).toBe(CHUNKS[0]!.text);

      // Backward boundary: from the first passage, the step announces ONCE
      // through the polite region and the session keeps playing.
      await bar.getByRole("button", { name: "Previous passage" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "No previous passage." }),
      ).toHaveCount(1);
      expect(await liveUtteranceText(page)).toBe(CHUNKS[0]!.text);

      // Forward boundary: from the LAST passage, same discipline.
      const last = CHUNKS[CHUNKS.length - 1]!;
      await seekViaSlider(page, LAST_CHUNK_PERCENT);
      await drainUntilLive(page, last.text);
      await bar.getByRole("button", { name: "Next passage" }).click();
      await expect(page.getByRole("status").filter({ hasText: "No next passage." })).toHaveCount(1);
      expect(await liveUtteranceText(page)).toBe(last.text);

      await bar.getByRole("button", { name: "Stop" }).click();
    });
  });
}
