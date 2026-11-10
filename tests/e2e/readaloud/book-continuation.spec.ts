// tests/e2e/readaloud/book-continuation.spec.ts
// Issue #239 — whole-book read-aloud across EXISTING EPUB chapter articles.
// The speechSynthesis fake is the shared controllable harness (REUSE-
// DO-NOT-FORK, tests/e2e/readaloud/_speech.ts): every playback utterance is
// test-driven, so the acceptance surface is deterministic across
// chromium/firefox/webkit. The EPUB corpus is seeded as raw Dexie rows
// through the SHIPPED schemas (the book-crossing.spec.ts discipline — no
// ingestion pipeline in the loop, layout truth deterministic).
//
// What is pinned here (the issue's acceptance criteria):
//   1. Natural handoff — finishing a chapter by ear hands off to the next
//      EXISTING chapter in book order and continues WITHOUT a manual
//      restart: the URL/heading swap, the arriving chapter's first chunk
//      spoken, the polite region's continuation line, the departing
//      end-pin flush, the arriving chapter's offset-0 save.
//   2. Follow behavior, voice, and rate carry across the handoff: NO new
//      silent probe utterance when the voice is unchanged (no dead air, no
//      floor flash), the carried records keep the selected voice + rate.
//   3. Final-book stop — the book's LAST chapter finishes through the ONE
//      completion seam ("Read aloud finished."), never a handoff; the
//      reload/resume truth is the saved end-pin.
//   4. Cancellation — Pause/Stop remain available before navigation AND
//      while the arriving article loads; a restart after Stop stays local.
//      A TOC jump in the same window supersedes the crossing; a paused
//      seek-to-end is a hold, never a handoff; a
//      background stop in the gap kills the continuation (the arrival
//      lands silently — the background-stop policy covers handoffs).
//   5. Spoken following through an internal layout window: the oversized
//      chapter's window crossings during playback never recreate speech
//      (ONE session, ONE probe) and never pagination-fall back.
//   6. Genuine failures stay honest — a mid-playback engine death lands
//      the existing failure state with the preserved position; no
//      simulated continuation, no silent advancement past unheard text.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle, Book } from "../../../src/content/schema";
import { normalizeText, graphemeClusters } from "../../../src/content/normalizeText";
import { chunkArticleForSpeech } from "../../../src/readaloud/chunks";
import { PLAYBACK_FAILURE_MESSAGE } from "../../../src/readaloud/engine";
import { BOOK_HANDOFF_MESSAGE } from "../../../src/reader/useReadAloud";
import { seedStoreRows } from "../library/seedStoreRows";
import { prepareFreshPage } from "../portability/_portability";
import { readPagination, waitForPaginationSettled } from "../pagination/_harness";
import { installFakeSpeech } from "./_speech";
import { BASE, playAndAwaitProbe, readLocationOffset } from "./_harness";

// ── Node-side corpus builders (shipped schemas only — never hand-built rows) ──

function totalOf(article: CanonicalArticle): number {
  return graphemeClusters(normalizeText(article), article.lang).length;
}

function makeChapter(
  id: string,
  title: string,
  chapterIndex: number,
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-08-20T00:00:00.000Z",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId: BOOK_ID,
      chapterIndex,
    },
  });
}

/** N distinct paragraphs of steady length — deterministic pagination and a
 * predictable number of speakable chunks per chapter. EVERY sentence carries
 * the paragraph index: chunk TEXT must be unique across the whole book, so
 * the by-text drain helpers can never match an earlier paragraph's chunk. */
function paragraphs(n: number, seed: string): string[] {
  return Array.from(
    { length: n },
    (_, i) =>
      `${seed} Passage ${i + 1} keeps a steady count of the harbor's small weather, and the ${i + 1}${["st", "nd", "rd", "th"][i % 4] ?? "th"} entry runs long enough to wrap across several composed lines at the narrow geometry, the way a patient ledger fills a page without hurrying. The tide table beneath entry ${i + 1} stays honest, and the keeper signs row ${i + 1} with the same unhurried flourish, so the chapter reads at an even cadence from beginning to end.`,
  );
}

const BOOK_ID = "bca-book";
const GIANT = makeChapter(
  "bca-giant",
  "Chapter 1. The Cataract",
  0,
  // Exceed whole-publication text admission so speech crosses internal tiles.
  paragraphs(220, "Chapter one."),
);
const C0 = makeChapter(
  "bca-c0",
  "Chapter 2. The Ledger of Tides",
  1,
  paragraphs(4, "Chapter two."),
);
const C1 = makeChapter(
  "bca-c1",
  "Chapter 3. The Bell Founders",
  2,
  paragraphs(4, "Chapter three."),
);
const LAST = makeChapter(
  "bca-last",
  "Chapter 4. The Quiet Hour",
  3,
  paragraphs(4, "Chapter four."),
);
const BOOK: Book = BookSchema.parse({
  id: BOOK_ID,
  title: "The Listening Almanac",
  authors: ["Ada Author"],
  language: "en",
  chapterArticleIds: [GIANT.id, C0.id, C1.id, LAST.id],
  skippedChapterCount: 0,
  source: "epub-upload",
  originalFileHash: `sha256:${"1".repeat(64)}`,
  tags: [],
  addedAt: "2026-08-20T00:00:00.000Z",
});
const WITH_CODE = ArticleSchema.parse({
  ...C0,
  blocks: [
    { kind: "paragraph", content: [{ text: "A short opening passage.", marks: [] }] },
    { kind: "paragraph", content: [{ text: "A short final spoken passage.", marks: [] }] },
    { kind: "code-block", source: "const a = 1;\n".repeat(5) },
  ],
});
const CHAPTERS = [GIANT, C0, C1, LAST];
const END_PIN: Record<string, number> = Object.fromEntries(CHAPTERS.map((c) => [c.id, totalOf(c)]));
const C0_CHUNKS = chunkArticleForSpeech(C0);
const C1_CHUNKS = chunkArticleForSpeech(C1);
const C1_FIRST = C1_CHUNKS[0]!.text;

// ── Browser helpers ──────────────────────────────────────────────────────────

async function seedCorpus(page: Page): Promise<void> {
  await seedStoreRows(page, "books", [BOOK]);
  await seedStoreRows(
    page,
    "articles",
    CHAPTERS.map((article) => ({
      ...article,
      ...(article.ingestionMeta?.bookId ? { bookId: article.ingestionMeta.bookId } : {}),
    })),
  );
}

async function openChapter(page: Page, id: string): Promise<void> {
  await page.goto(`${BASE}/#/article/${id}`);
  const chapter = CHAPTERS.find((c) => c.id === id)!;
  await expect(page.getByRole("heading", { level: 1, name: chapter.provenance.title })).toBeVisible(
    {
      timeout: 10_000,
    },
  );
  await waitForPaginationSettled(page);
}

/** The drain drives live through the FAKE's own page globals
 * (__speechAdvance/__speechLiveText — see _speech.ts): one evaluate per
 * poll batch, no Node closures across the boundary. */
type SpeechWindow = {
  __speechAdvance: () => string | null;
  __speechLiveText: () => string | null;
};

/** The text of the CURRENT live playback utterance (null when none). */
async function liveUtteranceText(page: Page): Promise<string | null> {
  return page.evaluate((): string | null => (window as unknown as SpeechWindow).__speechLiveText());
}

/** How many silent probe utterances the fake has seen — one per SESSION
 * start (a whole-book handoff with an unchanged voice adds none). */
async function probeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __speechSpoken: { volume: number }[] };
    return w.__speechSpoken.filter((r) => r.volume === 0).length;
  });
}

/** Fire utterances until the live utterance IS the target text (the drain
 * loop runs IN the browser — one round-trip per poll, not per utterance;
 * each advance fires start→end like a real engine). */
async function drainToUtterance(page: Page, target: string, timeout = 60_000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((goal) => {
          const w = window as unknown as SpeechWindow;
          for (let i = 0; i < 8; i++) {
            const text = w.__speechLiveText();
            if (text === null) return "idle";
            if (text === goal) return "target";
            w.__speechAdvance();
          }
          return "draining";
        }, target),
      { timeout, intervals: [50] },
    )
    .toBe("target");
}

/** Fire utterance ends until the ROUTE reaches the target chapter — the
 * whole-book handoff crosses while the drain keeps firing (the arriving
 * session's utterances are immediately live; the carried follow level
 * means no probe gap). The URL is checked BEFORE any fire, so the poll
 * never retires the arriving chapter's first utterance. */
async function drainToChapter(page: Page, id: string, timeout = 60_000): Promise<void> {
  const pattern = new RegExp(`#/article/${id}$`);
  await expect
    .poll(
      async () => {
        const arrived = await page.evaluate(() => window.location.hash);
        if (pattern.test(arrived)) return "arrived";
        await page.evaluate((): void => {
          (window as unknown as SpeechWindow).__speechAdvance();
        });
        return "reading";
      },
      { timeout, intervals: [50] },
    )
    .toBe("arrived");
}

/** Hold the handoff's deferred route-assignment frame (the ONE rAF callback
 * that calls navigateToChapter) so a cancellation can be observed BEFORE
 * the crossing commits; releaseArrival() lets it fire. */
async function holdHandoffFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const original = window.requestAnimationFrame.bind(window);
    const control = window as unknown as {
      heldHandoffFrame: FrameRequestCallback | null;
      releaseHandoffFrame: () => void;
    };
    control.heldHandoffFrame = null;
    window.requestAnimationFrame = (callback) => {
      if (callback.toString().includes("navigateToChapter")) {
        control.heldHandoffFrame = callback;
        return -1;
      }
      return original(callback);
    };
    control.releaseHandoffFrame = () => {
      window.requestAnimationFrame = original;
      const held = control.heldHandoffFrame;
      control.heldHandoffFrame = null;
      if (held) original(held);
    };
  });
}

async function releaseHandoffFrame(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { releaseHandoffFrame: () => void }).releaseHandoffFrame(),
  );
}

/** Delay just the target article's IndexedDB result, after route assignment.
 * Other reads and transaction completion remain real; releasing replays the
 * held success event to Dexie, exercising the route's actual loading seam. */
async function holdChapterLoad(page: Page, targetId: string): Promise<void> {
  await page.evaluate((id) => {
    const original = IDBObjectStore.prototype.get;
    const control = window as unknown as { releaseChapterLoad: () => void };
    IDBObjectStore.prototype.get = function (key) {
      const request = original.call(this, key);
      if (this.name === "articles" && key === id) {
        request.addEventListener(
          "success",
          (event) => {
            event.stopImmediatePropagation();
            control.releaseChapterLoad = () => {
              IDBObjectStore.prototype.get = original;
              request.dispatchEvent(new Event("success"));
            };
          },
          { once: true },
        );
      }
      return request;
    };
  }, targetId);
}

async function releaseChapterLoad(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { releaseChapterLoad: () => void }).releaseChapterLoad(),
  );
}

test.beforeEach(async ({ page }) => {
  // ORDER IS LOAD-BEARING: the fake registers before the FIRST goto (the
  // init script installs into every subsequent document).
  await installFakeSpeech(page, "word");
  await prepareFreshPage(page);
  await seedCorpus(page);
  await page.setViewportSize({ width: 360, height: 700 });
});

test.describe("whole-book read-aloud continuation (issue #239)", () => {
  test.setTimeout(120_000);

  test("finishing a chapter by ear hands off to the next chapter without a manual restart", async ({
    page,
  }) => {
    const bar = page.locator(".readaloud-bar");
    await openChapter(page, C0.id);
    await playAndAwaitProbe(page);

    // Drain the whole chapter by ear — the reader presses NOTHING else.
    await drainToChapter(page, C1.id);

    // The arriving chapter is oriented and playing: heading focused (the
    // #238 arrival discipline), the book ordinal advanced, the transport
    // still in its playing shape.
    await expect(page.getByRole("heading", { level: 1, name: C1.provenance.title })).toBeFocused();
    await expect(page.locator("p.book-context")).toContainText("Chapter 3 of 4");
    await expect(bar.getByRole("button", { name: "Pause" })).toBeVisible();
    // The arriving session speaks C1's FIRST chunk — continuation, not a
    // restart from the book top.
    await expect.poll(() => liveUtteranceText(page), { timeout: 10_000 }).toBe(C1_FIRST);
    // ONE calm continuation line in the ONE polite region.
    await expect(page.getByRole("status").filter({ hasText: BOOK_HANDOFF_MESSAGE })).toHaveCount(1);
    // Follow behavior carried: no new silent probe was spoken (the level
    // carried across — exactly one session probe so far).
    expect(await probeCount(page)).toBe(1);
    // The spoken marker follows into the new chapter: a word boundary on
    // the live C1 utterance paints the mark on the arrived page.
    await page.evaluate(() => {
      (window as unknown as { __speechFire: (event: string) => void }).__speechFire("boundary");
    });
    await expect(page.locator("mark.spoken-word")).toBeVisible({ timeout: 10_000 });

    // Saved positions: the departing chapter flushed its REAL listened
    // position (the end-pin) BEFORE the article changed, and the arriving
    // chapter's boundary position persists.
    await expect
      .poll(() => readLocationOffset(page, C0.id), { timeout: 10_000 })
      .toBe(END_PIN[C0.id]);
    await expect.poll(() => readLocationOffset(page, C1.id), { timeout: 15_000 }).toBe(0);
  });

  test("voice, rate, and follow level carry across the handoff (no re-probe, no new session chrome)", async ({
    page,
  }) => {
    const bar = page.locator(".readaloud-bar");
    await openChapter(page, C0.id);
    await playAndAwaitProbe(page);

    // Pick the local voice (the popover's select) and raise the rate — the
    // live retunes re-queue the current passage under the new values.
    await bar.getByRole("button", { name: "Voice" }).click();
    const voiceSelect = page.getByRole("combobox", { name: "Read-aloud voice" });
    await expect(voiceSelect).toBeVisible();
    await voiceSelect.selectOption("stub-voice");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(bar.getByRole("button", { name: "Voice" })).toBeFocused();
    await bar.getByRole("combobox", { name: "Read-aloud speed" }).selectOption("1.25");
    // The voice retune re-probes (the level must match the voice actually
    // speaking) — wait for that probe to land BEFORE capturing the count
    // the handoff must not add to.
    await expect.poll(() => probeCount(page)).toBe(2);

    const probesBefore = await probeCount(page);
    await drainToChapter(page, C1.id);

    // The carried session speaks immediately at the carried level: the
    // handoff added NO probe utterance, and the carried level is the
    // probed one (no floor flash on the bar's follow text).
    await expect.poll(() => liveUtteranceText(page), { timeout: 10_000 }).toBe(C1_FIRST);
    expect(await probeCount(page)).toBe(probesBefore);
    await expect(bar.getByText("Highlights each word")).toBeVisible();
    // Every utterance of the arriving chapter carries the SELECTED voice
    // and rate (acceptance: preserve the reader's playback choices).
    await drainToUtterance(page, C1_CHUNKS[1]!.text);
    const c1Records = await page.evaluate(() => {
      const w = window as unknown as {
        __speechSpoken: { text: string; rate: number; voice: string | null; volume: number }[];
      };
      return w.__speechSpoken.filter((r) => r.volume === 1 && r.text.startsWith("Chapter three"));
    });
    expect(c1Records.length).toBeGreaterThan(0);
    for (const record of c1Records) {
      expect(record.rate).toBe(1.25);
      expect(record.voice).toBe("stub-voice");
    }
  });

  test("the book's last chapter is the final stop: the finish stands, no handoff", async ({
    page,
  }) => {
    const bar = page.locator(".readaloud-bar");
    await openChapter(page, LAST.id);
    await playAndAwaitProbe(page);
    await drainToUtterance(page, chunkArticleForSpeech(LAST).at(-1)!.text);

    // The last chunk completes → the ONE completion seam: the finished
    // announcement, rest state, no navigation, no continuation line.
    await page.evaluate(() => {
      (window as unknown as { __speechFire: (event: string) => void }).__speechFire("end");
    });
    await expect(page.getByRole("status").filter({ hasText: "Read aloud finished." })).toHaveCount(
      1,
    );
    await expect(page).toHaveURL(new RegExp(`#/article/${LAST.id}$`));
    await expect(bar.getByRole("button", { name: "Read aloud" })).toBeVisible();
    await expect
      .poll(() => readLocationOffset(page, LAST.id), { timeout: 10_000 })
      .toBe(END_PIN[LAST.id]);

    // Reload: the saved end-pin is the resume truth (the chapter-by-ear
    // completion marked it read — the ordinary #238 resume behavior).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: LAST.provenance.title })).toBeVisible({
      timeout: 10_000,
    });
    await waitForPaginationSettled(page);
    const dev = await readPagination(page);
    expect(dev?.anchorOffset).toBe(END_PIN[LAST.id]);
  });

  for (const delayed of [false, true]) {
    test(`trailing code cannot rewind a completed chapter (${delayed ? "delayed" : "ordinary"} handoff)`, async ({
      page,
    }) => {
      await seedStoreRows(page, "articles", [{ ...WITH_CODE, bookId: BOOK_ID }]);
      await openChapter(page, C0.id);
      await playAndAwaitProbe(page);
      if (delayed) await holdHandoffFrame(page);
      await drainToUtterance(page, chunkArticleForSpeech(WITH_CODE).at(-1)!.text);
      await page.evaluate(() => (window as unknown as SpeechWindow).__speechAdvance());
      if (delayed) {
        await expect.poll(() => readLocationOffset(page, C0.id)).toBe(totalOf(WITH_CODE));
        // Deliberately outlive the 1200ms save debounce: layout must not
        // replace the flushed end-pin while a crossing is still pending.
        await page.waitForTimeout(1500);
        expect(await readLocationOffset(page, C0.id)).toBe(totalOf(WITH_CODE));
        await releaseHandoffFrame(page);
      }
      await page.waitForURL(new RegExp(`#/article/${C1.id}$`));
      await waitForPaginationSettled(page);
      await expect.poll(() => liveUtteranceText(page)).toBe(C1_FIRST);
      await page.evaluate(() => {
        (window as unknown as { __speechFire: (event: string) => void }).__speechFire("start");
      });
      await expect.poll(() => readLocationOffset(page, C1.id)).toBe(0);
      expect(await readLocationOffset(page, C0.id)).toBe(totalOf(WITH_CODE));
    });
  }

  for (const phase of ["before navigation", "while loading"] as const) {
    for (const action of ["Pause", "Stop"] as const) {
      test(`${action} cancels pending continuation ${phase}`, async ({ page }) => {
        await openChapter(page, C0.id);
        await playAndAwaitProbe(page);
        await drainToUtterance(page, C0_CHUNKS.at(-1)!.text);
        if (phase === "before navigation") await holdHandoffFrame(page);
        else await holdChapterLoad(page, C1.id);
        await page.evaluate(() => (window as unknown as SpeechWindow).__speechAdvance());
        if (phase === "while loading") {
          await page.waitForURL(new RegExp(`#/article/${C1.id}$`));
          await expect(page.getByText("Opening article…")).toBeVisible();
        }
        const bar = page.locator(".readaloud-bar");
        await expect(bar.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
        await expect(bar.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
        await expect(bar.getByRole("slider")).toHaveCount(0);
        await bar.getByRole("button", { name: action, exact: true }).click();
        if (phase === "before navigation") await releaseHandoffFrame(page);
        else await releaseChapterLoad(page);
        await waitForPaginationSettled(page);
        // The release has crossed its scheduled frame before inspecting
        // the route: a cancelled callback must not merely be not-yet-run.
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await expect(page).toHaveURL(
          new RegExp(`#/article/${phase === "before navigation" ? C0.id : C1.id}$`),
        );
        await expect(bar.getByRole("button", { name: "Read aloud", exact: true })).toBeVisible();
        expect(await liveUtteranceText(page)).toBeNull();
        expect(await probeCount(page)).toBe(1);
        await expect(
          page.getByRole("status").filter({ hasText: BOOK_HANDOFF_MESSAGE }),
        ).toHaveCount(0);
      });
    }
  }

  test("a manual restart after stopping the handoff stays local (fresh session)", async ({
    page,
  }) => {
    const bar = page.locator(".readaloud-bar");
    await openChapter(page, C0.id);
    await playAndAwaitProbe(page);
    // Drain to the LAST chunk, hold the deferred crossing frame, then
    // finish by ear — the gap now has no clock pressure.
    await drainToUtterance(page, C0_CHUNKS.at(-1)!.text);
    await holdHandoffFrame(page);
    await page.evaluate(() => {
      (window as unknown as { __speechFire: (event: string) => void }).__speechFire("end");
    });
    // Stop the still-controllable continuation, then deliberately start a
    // FRESH LOCAL session (an at-end offset restarts this chapter).
    await bar.getByRole("button", { name: "Stop", exact: true }).click();
    await bar.getByRole("button", { name: "Read aloud", exact: true }).click();
    await releaseHandoffFrame(page);
    await expect(page).toHaveURL(new RegExp(`#/article/${C0.id}$`), { timeout: 5_000 });
    await expect(bar.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect.poll(() => liveUtteranceText(page), { timeout: 10_000 }).toBe(C0_CHUNKS[0]!.text);
    // A second SESSION ran (its own probe); the held frame never navigated.
    expect(await probeCount(page)).toBe(2);
    await expect(page.getByRole("status").filter({ hasText: BOOK_HANDOFF_MESSAGE })).toHaveCount(0);
  });

  test("a TOC jump during the handoff gap supersedes the handoff", async ({ page }) => {
    await openChapter(page, C0.id);
    await playAndAwaitProbe(page);
    await drainToUtterance(page, C0_CHUNKS.at(-1)!.text);
    // The TOC panel is open BEFORE the finish; the jump link click runs in
    // the SAME task as the final utterance's end — the newest intent wins
    // deterministically (the #238 same-task discipline).
    await page.getByRole("button", { name: "Table of contents" }).click();
    await expect(page.getByRole("link", { name: "Top of article" })).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { __speechFire: (event: string) => void };
      w.__speechFire("end");
      document.querySelector<HTMLAnchorElement>('a[href="#toc--1"]')!.click();
    });
    await page.waitForTimeout(500);
    // No crossing, no continuation session: the reader jumped within C0.
    await expect(page).toHaveURL(new RegExp(`#/article/${C0.id}$`));
    await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toBeVisible();
    expect(await probeCount(page)).toBe(1);
    expect(await liveUtteranceText(page)).toBeNull();
    await expect(page.getByRole("status").filter({ hasText: BOOK_HANDOFF_MESSAGE })).toHaveCount(0);
  });

  test("a paused seek-to-end finishes the chapter and never hands off", async ({ page }) => {
    const bar = page.locator(".readaloud-bar");
    await openChapter(page, C0.id);
    await playAndAwaitProbe(page);
    await bar.getByRole("button", { name: "Pause" }).click();
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();

    // Paused at 100%: a HOLD, not a book continuation — the finish stands.
    const seek = bar.getByRole("slider", { name: "Article position" });
    await seek.fill("100");
    await expect(page.getByRole("status").filter({ hasText: "Read aloud finished." })).toHaveCount(
      1,
    );
    await expect(page).toHaveURL(new RegExp(`#/article/${C0.id}$`));
    expect(await probeCount(page)).toBe(1);
    expect(await liveUtteranceText(page)).toBeNull();
    // The flush still happened (the handler runs for EVERY finish — the
    // end-pin is saved even though the session was paused).
    await expect
      .poll(() => readLocationOffset(page, C0.id), { timeout: 10_000 })
      .toBe(END_PIN[C0.id]);
  });

  test("a background stop during the gap kills the continuation: the arrival lands silently", async ({
    page,
  }) => {
    const bar = page.locator(".readaloud-bar");
    await openChapter(page, C0.id);
    await playAndAwaitProbe(page);
    await drainToUtterance(page, C0_CHUNKS.at(-1)!.text);
    await holdHandoffFrame(page);
    // Finish + background the reader in ONE task: the background-stop
    // policy invalidates the continuation token before any arrival.
    await page.evaluate(() => {
      const w = window as unknown as { __speechFire: (event: string) => void };
      w.__speechFire("end");
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await releaseHandoffFrame(page);
    // The authorized route completes (the handoff itself is navigation),
    // but NOTHING speaks: the delayed arrival cannot restart playback.
    await page.waitForURL(new RegExp(`#/article/${C1.id}$`), { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1, name: C1.provenance.title })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await liveUtteranceText(page)).toBeNull();
    expect(await probeCount(page)).toBe(1);
    await expect(bar.getByRole("button", { name: "Read aloud" })).toBeVisible();
    // The departing chapter's flush survived the backgrounding.
    await expect
      .poll(() => readLocationOffset(page, C0.id), { timeout: 10_000 })
      .toBe(END_PIN[C0.id]);
  });

  test("spoken following crosses an internal layout window without recreating speech", async ({
    page,
  }) => {
    await openChapter(page, GIANT.id);
    await playAndAwaitProbe(page);
    const firstScope = (await readPagination(page))?.scope;

    // Drain by ear until the FOLLOWER has crossed into the next layout
    // window (the programmatic page/window movement, never a chapter turn).
    // Each advance fires start→end; the start range is what the follower
    // turns with, and the settle gives the window swap time to commit.
    await expect
      .poll(
        async () => {
          await page.evaluate((): void => {
            (window as unknown as SpeechWindow).__speechAdvance();
          });
          await page.waitForTimeout(60);
          return (await readPagination(page))?.scope?.startBlock;
        },
        { timeout: 90_000, intervals: [50] },
      )
      .not.toBe(firstScope?.startBlock);

    // The crossing was internal: same URL, same session (ONE probe — no
    // speech was recreated), still playing, no pagination fallback.
    await expect(page).toHaveURL(new RegExp(`#/article/${GIANT.id}$`));
    expect(await probeCount(page)).toBe(1);
    expect(await liveUtteranceText(page)).not.toBeNull();
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
    await expect(page.locator("mark.spoken-word")).toBeVisible({ timeout: 10_000 });
  });

  test("a mid-playback engine death stays honest: failure state, preserved position, no advancement", async ({
    page,
  }) => {
    // The shared fake flips to "dies-after-first" at runtime: the probe has
    // already resolved (the mode only gates utterances queued AFTER it), the
    // first playback utterance stays test-driven, and every LATER one
    // auto-errors — a dying engine, deterministically.
    const bar = page.locator(".readaloud-bar");
    await openChapter(page, C0.id);
    await page.evaluate(() => {
      (window as unknown as { __speechSetMode: (mode: string) => void }).__speechSetMode(
        "dies-after-first",
      );
    });
    await playAndAwaitProbe(page);

    // The first utterance completes; the engine queues the next one, which
    // the dying engine refuses — the DETECTED failure lands.
    await page.evaluate(() => {
      (window as unknown as { __speechFire: (event: string) => void }).__speechFire("end");
    });
    const failureCopy = page.locator(".readaloud-failure");
    await expect(failureCopy).toBeVisible({ timeout: 10_000 });
    await expect(failureCopy).toHaveText(PLAYBACK_FAILURE_MESSAGE);
    // Honest limits: no simulated continuation — the reader stays in the
    // departing chapter, the bar keeps the honest failure shape (Retry +
    // explanation + voice picker), and the ONE polite region never claims a
    // chapter handoff. (Retry-from-preserved-position is the issue #167
    // seam — read-aloud-failure.spec.ts owns it; this leg owns the NO
    // HANDOFF half.)
    await expect(page).toHaveURL(new RegExp(`#/article/${C0.id}$`));
    expect(await probeCount(page)).toBe(1);
    await expect(bar.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: BOOK_HANDOFF_MESSAGE })).toHaveCount(0);
  });
});
