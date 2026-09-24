// tests/e2e/readaloud/spoken-follow.spec.ts
// Issue #42 e2e leg — the spoken-word marker + the follow behaviors in a
// REAL browser. The speechSynthesis fake is the read-aloud.spec.ts harness
// (controllable fake installed via addInitScript; playback events are always
// test-driven) pointed at essay-long-form so paginated mode yields multiple
// pages.
//
// What is pinned here:
//   1. O2 — the spoken word renders as <mark class="spoken-word"
//      aria-hidden="true">: no tabindex, no aria-label, no
//      data-highlight-id (never in the accessibility tree, never focusable,
//      never a popover target); focus never moves to it.
//   2. O4 — paginated: speech reaching a page boundary turns the page
//      automatically; under emulated prefers-reduced-motion the turn still
//      happens with ZERO running animations (instant, no fade).
//   3. The marker hops when playback pauses/resumes and skips forward — the
//      track the #43 skip controls will ride.
//   4. O5 — scrolling: follow-scroll keeps the spoken passage in view;
//      manual scrolling during playback does NOT get yanked back (the
//      follower suspends); "Jump to spoken position" restores orientation
//      WITHOUT moving focus and confirms through the ONE polite region.
//   5. Reduced motion + scrolling: the follow scroll is instant.
import { test, expect, type Page } from "@playwright/test";
import { bundledFixtures } from "../../../src/fixtures";
import { chunkArticleForSpeech } from "../../../src/readaloud/chunks";
import { pageStartGlobalOffset } from "../../../src/pagination/anchor";
import type { PageFragment } from "../../../src/pagination/types";
import { normalizeText, graphemeClusters } from "../../../src/content/normalizeText";
// REUSE-DO-NOT-FORK: the shared controllable-fake speechSynthesis harness
// (extracted verbatim from read-aloud.spec.ts).
import { installFakeSpeech, type SpeechMode } from "./_speech";

// LEM_E2E_BASE override — the parallel-wayfinder-sessions discipline
// (read-nav.spec.ts precedent: point this suite at a session-local server).
const BASE = process.env.LEM_E2E_BASE ?? "http://localhost:5173";
const ESSAY = bundledFixtures.find((f) => f.id === "essay-long-form")!;
const ESSAY_HREF = `#/article/${ESSAY.id}`;
const TOTAL = graphemeClusters(normalizeText(ESSAY), ESSAY.lang).length;
const CHUNKS = chunkArticleForSpeech(ESSAY);


async function clearAllRows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = ["articles", "settings", "location", "highlights", "notes", "books"];
        const existing = stores.filter((s) => db.objectStoreNames.contains(s));
        if (existing.length === 0) {
          resolve();
          return;
        }
        const tx = db.transaction(existing, "readwrite");
        for (const s of existing) tx.objectStore(s).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

/** Open essay-long-form with the fake speech installed (ORDER IS
 * LOAD-BEARING: init script before the first goto — the article URL differs
 * from the library by hash only, so the stub-installed document survives). */
async function openEssay(page: Page, mode: SpeechMode = "word"): Promise<Page> {
  await installFakeSpeech(page, mode);
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await clearAllRows(page);
  await page.goto(`${BASE}/${ESSAY_HREF}`);
  return page;
}

/** Node-side: which chunk speaks `offset`, and the UTF-16 charIndex inside
 * the chunk text whose mapped canonical ordinal is the offset (the exact
 * inverse of the engine's F5 mapping — the fake's boundary charIndex is
 * UTF-16 into the utterance's OWN text, spec §4.2.6). */
function chunkAndCharIndexForOffset(offset: number): { chunkIndex: number; charIndex: number } {
  const chunkIndex = CHUNKS.findIndex((c) => c.endGrapheme > offset);
  const chunk = CHUNKS[chunkIndex]!;
  const ordinal = offset - chunk.startGrapheme;
  let charIndex = chunk.utf16ToGrapheme.findIndex((v) => v >= ordinal);
  if (charIndex === -1) charIndex = chunk.text.length;
  return { chunkIndex, charIndex };
}

/** Advance the test-driven queue (firing "end" on each live playback
 * utterance) until the utterance speaking `chunkIndex` is live. */
async function advanceToChunk(page: Page, chunkIndex: number): Promise<void> {
  const target = CHUNKS[chunkIndex]!.text;
  await expect
    .poll(async () => {
      return page.evaluate((want) => {
        const w = window as unknown as {
          __speechSpoken: { text: string; volume: number; done: boolean; cancelled: boolean }[];
          __speechFire: (event: string, charIndex?: number) => void;
        };
        const live = [...w.__speechSpoken]
          .reverse()
          .find((r) => !r.done && !r.cancelled && r.volume === 1);
        if (!live) return "none";
        if (live.text === want) return "live";
        w.__speechFire("end");
        return "advanced";
      }, target);
    }, { timeout: 20_000 })
    .toBe("live");
}

/** Fire a word boundary whose F5-mapped canonical start is exactly
 * `offset` — the marker + the follower react to the REAL mapped value. */
async function fireBoundaryAt(page: Page, offset: number): Promise<void> {
  const { chunkIndex, charIndex } = chunkAndCharIndexForOffset(offset);
  await advanceToChunk(page, chunkIndex);
  await page.evaluate((ci) => {
    (window as unknown as { __speechFire: (event: string, ci?: number) => void }).__speechFire(
      "boundary",
      ci,
    );
  }, charIndex);
}

async function playAndAwaitProbe(page: Page): Promise<void> {
  const bar = page.locator(".readaloud-bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Read aloud" }).click();
  await expect(bar.getByText("Highlights each word")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(150); // the post-cancel settle before chunk 1
}

/** The spoken marker's rendered text (trimmed — boundary whitespace rides
 * with the piece, the splitParagraphRuns philosophy). */
async function spokenMarkerText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const m = document.querySelector("mark.spoken-word");
    return m ? (m.textContent ?? "").trim() : null;
  });
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

test.describe("Issue #42 — spoken word + follow behaviors", () => {
  test.setTimeout(120_000);

  test("O2: the spoken word renders aria-hidden and focus never moves to it", async ({
    page,
  }) => {
    await openEssay(page);
    await playAndAwaitProbe(page);

    await fireBoundaryAt(page, 10);
    const mark = page.locator("mark.spoken-word");
    await expect(mark).toBeVisible({ timeout: 10_000 });
    expect(await mark.getAttribute("aria-hidden")).toBe("true");
    expect(await mark.getAttribute("tabindex")).toBeNull();
    expect(await mark.getAttribute("aria-label")).toBeNull();
    expect(await mark.getAttribute("data-highlight-id")).toBeNull();
    expect(await mark.getAttribute("id")).toBeNull();

    // Focus NEVER moves — not to the marker, not into the article (WebKit
    // keeps focus on <body> after a programmatic click; the engines that do
    // focus the pressed button keep it on Pause — either way the app itself
    // moves focus nowhere while the marker appears and hops).
    const focusBefore = await page.evaluate(() => document.activeElement?.tagName ?? null);
    const textAt10 = await spokenMarkerText(page);
    await fireBoundaryAt(page, 60);
    await expect
      .poll(async () => spokenMarkerText(page), { timeout: 10_000 })
      .not.toBe(textAt10);
    expect(await page.evaluate(() => document.activeElement?.tagName ?? null)).toBe(
      focusBefore,
    );
    expect(await page.evaluate(() => document.activeElement?.tagName ?? null)).not.toBe(
      "MARK",
    );
  });

  test("O4: speech crossing a page boundary turns the page automatically; instant under reduced motion", async ({
    page,
  }) => {
    // Instrument the page-turn fade BEFORE app code loads so the
    // reduced-motion assertion is load-bearing: with "Animate page turns"
    // opted IN, a normal-motion auto-turn DOES run the fade (counter
    // increments) and a reduced-motion auto-turn must NOT.
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      (window as unknown as { turnFades: number }).turnFades = 0;
      Element.prototype.animate = function (...args: Parameters<typeof animate>) {
        if (this instanceof Element && this.matches(".page-fragment")) {
          (window as unknown as { turnFades: number }).turnFades += 1;
        }
        return animate.apply(this, args);
      };
    });
    await openEssay(page);
    // The first pagination commit must settle before the pages can be read.
    await expect(page.getByText(/1 of \d+/).first()).toBeVisible({ timeout: 20_000 });
    const pages = (await page.evaluate(
      () =>
        (window as unknown as { __lemPagination: { pages: PageFragment[] } })
          .__lemPagination.pages,
    )) as PageFragment[];
    expect(pages.length).toBeGreaterThanOrEqual(3);

    // Opt IN to the fade — the project default is off, and this test exists
    // to prove the reduced-motion gate (not the setting) kills the fade.
    await page.getByRole("button", { name: "Reading settings" }).click();
    await page.getByRole("checkbox", { name: "Animate page turns" }).check();
    await page.keyboard.press("Escape");

    await playAndAwaitProbe(page);

    const fades = () =>
      page.evaluate(() => (window as unknown as { turnFades: number }).turnFades);

    // Speak the first word of page 2 — the follower auto-turns (with the
    // opted-in fade, under no-preference motion).
    const page2Start = pageStartGlobalOffset(ESSAY, pages[1]!);
    await fireBoundaryAt(page, page2Start);
    await expect(page.getByText(/2 of \d+/).first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(fades, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const fadesAfterPage2 = await fades();

    // Reduced motion: the auto page-turn STILL happens — instantly. The
    // fade counter must not move again (the matchMedia gate inside the
    // surface, not the setting, owns instant-under-reduce).
    await page.emulateMedia({ reducedMotion: "reduce" });
    const page3Start = pageStartGlobalOffset(ESSAY, pages[2]!);
    await fireBoundaryAt(page, page3Start);
    await expect(page.getByText(/3 of \d+/).first()).toBeVisible({ timeout: 15_000 });
    expect(await fades()).toBe(fadesAfterPage2);
    expect(
      await page.evaluate(() => {
        const fragment = document.querySelector(".page-fragment");
        return fragment ? fragment.getAnimations().length : -1;
      }),
    ).toBe(0);
  });

  test("the marker persists across pause and hops on resume + skip", async ({
    page,
  }) => {
    await openEssay(page);
    await playAndAwaitProbe(page);

    await fireBoundaryAt(page, 10);
    const bar = page.locator(".readaloud-bar");
    await expect(page.locator("mark.spoken-word")).toBeVisible({ timeout: 10_000 });
    const textAt10 = await spokenMarkerText(page);
    expect(textAt10).not.toBeNull();

    // Pause: the marker FREEZES at the last spoken word (stays visible).
    await bar.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator("mark.spoken-word")).toBeVisible();
    expect(await spokenMarkerText(page)).toBe(textAt10);

    // Resume: the marker hops to the next spoken word.
    await bar.getByRole("button", { name: "Play" }).click();
    await fireBoundaryAt(page, 60);
    await expect
      .poll(async () => spokenMarkerText(page), { timeout: 10_000 })
      .not.toBe(textAt10);
    const textAt60 = await spokenMarkerText(page);

    // Skip forward mid-chunk (the track the #43 skip controls ride): the
    // marker hops again, never drifting backward.
    await fireBoundaryAt(page, 110);
    await expect
      .poll(async () => spokenMarkerText(page), { timeout: 10_000 })
      .not.toBe(textAt60);

    await bar.getByRole("button", { name: "Stop" }).click();
    // Stopped: the marker is gone — a dead session leaves no stale cue.
    await expect(page.locator("mark.spoken-word")).toHaveCount(0);
  });

  test("O5: follow-scroll keeps the spoken passage in view; manual scroll is not fought; jump restores focus-free", async ({
    page,
  }) => {
    await openEssay(page);
    await page.getByRole("button", { name: "Reading mode: paginated" }).click();
    await expect(
      page.getByRole("button", { name: "Reading mode: scrolling" }),
    ).toBeVisible({ timeout: 10_000 });

    await playAndAwaitProbe(page);

    // Speak deep into the article — the follower brings the marker into view.
    const deepOffset = Math.floor(TOTAL * 0.7);
    await fireBoundaryAt(page, deepOffset);
    const markerInView = () =>
      page.evaluate(() => {
        const m = document.querySelector("mark.spoken-word");
        if (!m) return false;
        const r = m.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight && window.scrollY > 0;
      });
    await expect.poll(markerInView, { timeout: 15_000 }).toBe(true);

    // Manual scroll away: the follower must NOT yank the reader back (the
    // suspension window from the follower's own smooth scroll has expired).
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await page.waitForTimeout(200);
    await fireBoundaryAt(page, deepOffset + 40);
    await fireBoundaryAt(page, deepOffset + 80);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);

    // "Jump to spoken position": restores orientation, keeps focus put (the
    // APP never moves it — WebKit leaves body after a click; engines that
    // focus the button keep it there), and confirms through the ONE polite
    // transport region.
    const focusBeforeJump = await page.evaluate(
      () => document.activeElement?.tagName ?? null,
    );
    await page.getByRole("button", { name: "Jump to spoken position" }).click();
    await expect.poll(markerInView, { timeout: 15_000 }).toBe(true);
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? null),
    ).toBe(focusBeforeJump);
    await expect(
      page.getByRole("status").filter({ hasText: "Jumped to spoken position." }),
    ).toHaveCount(1);
  });

  test("a scrollbar-drag-style scroll INSIDE the programmatic window suspends too", async ({
    page,
  }) => {
    await openEssay(page);
    await page.getByRole("button", { name: "Reading mode: paginated" }).click();
    await expect(
      page.getByRole("button", { name: "Reading mode: scrolling" }),
    ).toBeVisible({ timeout: 10_000 });

    await playAndAwaitProbe(page);

    const deepOffset = Math.floor(TOTAL * 0.7);
    const inView = () =>
      page.evaluate(() => {
        const m = document.querySelector("mark.spoken-word");
        if (!m) return false;
        const r = m.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight && window.scrollY > 0;
      });

    // Glide #1 settles at the O5 position (and its disambiguation window
    // fully expires).
    await fireBoundaryAt(page, deepOffset);
    await expect.poll(inView, { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(900);

    // Glide #2 arms a short hop deeper — drag away to the top MID-GLIDE,
    // inside the 800 ms window. The drag lands off the glide's
    // [from, target] span, so it is reader input: the follower suspends
    // and never yanks back.
    await fireBoundaryAt(page, deepOffset + 400);
    await page.waitForTimeout(150); // the glide is definitively in flight
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await page.waitForTimeout(900); // the window expires

    await fireBoundaryAt(page, deepOffset + 440);
    await fireBoundaryAt(page, deepOffset + 480);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);

    // The explicit re-acquire path still works: jump restores orientation.
    await page.getByRole("button", { name: "Jump to spoken position" }).click();
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 })
      .toBeGreaterThan(50);
  });

  test("reduced motion: the follow scroll is instant (auto behavior, no smooth glide)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openEssay(page);
    await page.getByRole("button", { name: "Reading mode: paginated" }).click();
    await expect(
      page.getByRole("button", { name: "Reading mode: scrolling" }),
    ).toBeVisible({ timeout: 10_000 });

    await playAndAwaitProbe(page);

    const deepOffset = Math.floor(TOTAL * 0.7);
    await fireBoundaryAt(page, deepOffset);
    // Instant: the marker is in view on the FIRST poll after the boundary
    // (a smooth glide would still be mid-flight at this point).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const m = document.querySelector("mark.spoken-word");
            if (!m) return false;
            const r = m.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight && window.scrollY > 0;
          }),
        { timeout: 5_000 },
      )
      .toBe(true);
  });
});
