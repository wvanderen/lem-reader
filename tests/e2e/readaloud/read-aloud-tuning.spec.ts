// tests/e2e/readaloud/read-aloud-tuning.spec.ts
// Issue #165 e2e leg — read-aloud settings live on the transport bar. The
// speechSynthesis fake is the shared controllable harness (REUSE-DO-NOT-
// FORK; playback events are always test-driven) — deterministic across
// chromium/firefox/webkit.
//
// What is pinned here (the issue's acceptance criteria):
//   1. Active playback: a speed pick on the bar's select applies AT THE
//      CURRENT PASSAGE (the same chunk re-queues at the new rate — never
//      the article top), with no re-probe; a voice pick in the Voice
//      popover (one action away) re-probes the new voice and applies it.
//      The bar's displayed speed is the rate the voice actually speaks.
//   2. Paused: a speed/voice change preserves the paused state — nothing is
//      queued, the primary still reads "Play", the pause announcement
//      stands — and applies on resume at the held passage.
//   3. Persistence: speed + voice choices survive a reload as defaults (the
//      settings store; the pagehide flush carries the debounced write).
//   4. Narrow 375×667: the speed select and the Voice trigger are usable
//      and the anchored popover stays inside the viewport (flip fallbacks).
import { test, expect, type Page } from "@playwright/test";
import { bundledFixtures } from "../../../src/fixtures";
import { chunkArticleForSpeech } from "../../../src/readaloud/chunks";
// REUSE-DO-NOT-FORK: the shared controllable-fake speechSynthesis harness.
import { installFakeSpeech } from "./_speech";
import { BASE, clearAllRows, playAndAwaitProbe, tabWalkFrom } from "./_harness";

const ESSAY = bundledFixtures.find((f) => f.id === "essay-long-form")!;
const ESSAY_CHUNKS = chunkArticleForSpeech(ESSAY);
const FIRST_CHUNK = ESSAY_CHUNKS[0]!.text;

interface SpokenRecord {
  text: string;
  rate: number;
  volume: number;
  voice: string | null;
  done: boolean;
  cancelled: boolean;
}

/** Open an article with the fake speech installed (ORDER IS LOAD-BEARING:
 * init script before the first goto). */
async function openArticle(page: Page, articleId: string): Promise<Page> {
  await installFakeSpeech(page, "word");
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await clearAllRows(page);
  await page.goto(`${BASE}/#/article/${articleId}`);
  return page;
}

/** The CURRENT live playback utterance (null when none). */
async function livePlayback(page: Page): Promise<{
  text: string;
  rate: number;
  voice: string | null;
} | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __speechSpoken: SpokenRecord[] };
    const live = [...w.__speechSpoken]
      .reverse()
      .find((r) => !r.done && !r.cancelled && r.volume === 1);
    return live ? { text: live.text, rate: live.rate, voice: live.voice } : null;
  });
}

async function spokenCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __speechSpoken: SpokenRecord[] }).__speechSpoken.length,
  );
}

/** The bar's speed select and, when open, the popover's voice select. */
function speedSelect(page: Page) {
  return page.locator(".readaloud-bar").getByRole("combobox", { name: "Read-aloud speed" });
}
function voiceSelect(page: Page) {
  return page.getByRole("combobox", { name: "Read-aloud voice" });
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

test.describe("Issue #165 — read-aloud settings from the transport bar", () => {
  test.setTimeout(120_000);

  test("active playback: a speed pick re-queues the CURRENT passage at the new rate", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);
    await expect.poll(() => livePlayback(page), { timeout: 10_000 }).not.toBeNull();
    expect((await livePlayback(page))!.text).toBe(FIRST_CHUNK);

    // Edit the speed directly on the bar (1× → 1.5×).
    await expect(speedSelect(page)).toHaveValue("1");
    await speedSelect(page).selectOption("1.5");

    // The SAME passage re-queues (cancel + settle + speak) — never the top.
    await expect
      .poll(async () => {
        const live = await livePlayback(page);
        return live ? { text: live.text, rate: live.rate } : null;
      }, { timeout: 10_000 })
      .toEqual({ text: FIRST_CHUNK, rate: 1.5 });

    // A rate-only retune never re-probes: still exactly ONE silent record.
    await page.waitForTimeout(200);
    const probes = await page.evaluate(() => {
      const w = window as unknown as { __speechSpoken: SpokenRecord[] };
      return w.__speechSpoken.filter((r) => r.volume === 0).length;
    });
    expect(probes).toBe(1);

    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("active playback: the Voice popover (one action away) re-probes and applies the voice", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);
    await expect.poll(() => livePlayback(page), { timeout: 10_000 }).not.toBeNull();

    // One action away: the Voice button opens the anchored panel with the
    // probed FILTERED local list (the remote cloud voice is filtered out).
    await bar.getByRole("button", { name: "Voice" }).click();
    await expect(voiceSelect(page)).toBeVisible();
    await expect(voiceSelect(page).getByRole("option", { name: "System default voice" })).toHaveCount(1);
    await expect(voiceSelect(page).getByRole("option", { name: "Stub Voice (en)" })).toHaveCount(1);
    await expect(voiceSelect(page).getByRole("option", { name: "Cloud Voice (en)" })).toHaveCount(0);

    // Pick the local voice: a fresh silent probe carries it, then the
    // CURRENT passage continues under the new voice.
    await voiceSelect(page).selectOption("stub-voice");
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const w = window as unknown as { __speechSpoken: SpokenRecord[] };
            return w.__speechSpoken.filter((r) => r.volume === 0).length;
          }),
        { timeout: 10_000 },
      )
      .toBe(2);
    await expect
      .poll(async () => (await livePlayback(page))?.voice, { timeout: 10_000 })
      .toBe("stub-voice");
    const live = await livePlayback(page);
    expect(live!.text).toBe(FIRST_CHUNK);

    // Done closes the panel; focus returns to the trigger (no focus lost).
    await page.getByRole("button", { name: "Done" }).click();
    await expect(bar.getByRole("button", { name: "Voice" })).toBeFocused();

    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("paused: changes preserve the paused state + position, then apply on resume", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);
    await expect.poll(() => livePlayback(page), { timeout: 10_000 }).not.toBeNull();
    await bar.getByRole("button", { name: "Pause" }).click();
    const frozen = await spokenCount(page);

    // Speed while paused: nothing is queued, the state stays paused.
    await speedSelect(page).selectOption("1.5");
    await page.waitForTimeout(300);
    expect(await spokenCount(page)).toBe(frozen);
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Read aloud paused." })).toHaveCount(1);

    // Voice while paused: likewise — no playback starts from a settings
    // change.
    await bar.getByRole("button", { name: "Voice" }).click();
    await voiceSelect(page).selectOption("stub-voice");
    await page.waitForTimeout(300);
    expect(await spokenCount(page)).toBe(frozen);
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // Resume (the reader's explicit Play): the held passage re-queues under
    // BOTH new values — a fresh silent probe rides the voice change.
    await bar.getByRole("button", { name: "Play" }).click();
    await expect
      .poll(async () => {
        const live = await livePlayback(page);
        return live ? { text: live.text, rate: live.rate, voice: live.voice } : null;
      }, { timeout: 10_000 })
      .toEqual({ text: FIRST_CHUNK, rate: 1.5, voice: "stub-voice" });

    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("speed + voice persist as defaults across a reload", async ({ page }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);
    await speedSelect(page).selectOption("1.25");
    await bar.getByRole("button", { name: "Voice" }).click();
    await voiceSelect(page).selectOption("stub-voice");
    await page.getByRole("button", { name: "Done" }).click();

    // Speed + voice persist as defaults across a reload. The debounced
    // settings save (400ms) lands while the reader keeps listening — the
    // realistic timeline; the pagehide flush covers the abrupt-exit edge.
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole("heading", { name: ESSAY.provenance.title })).toBeVisible({
      timeout: 15_000,
    });
    await expect(speedSelect(page)).toHaveCount(0); // idle: quiet entry only
    await playAndAwaitProbe(page);
    await expect(speedSelect(page)).toHaveValue("1.25");
    await expect
      .poll(async () => {
        const live = await livePlayback(page);
        return live ? { rate: live.rate, voice: live.voice } : null;
      }, { timeout: 10_000 })
      .toEqual({ rate: 1.25, voice: "stub-voice" });

    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("keyboard: real Tab presses reach the speed select and the Voice trigger", async ({
    page,
  }, testInfo) => {
    await openArticle(page, ESSAY.id);
    await playAndAwaitProbe(page);
    // WebKit's sequential navigation skips buttons (the a11y.spec.ts engine
    // divergence) — the walk runs on chromium + firefox.
    if (testInfo.project.name !== "webkit") {
      expect(
        await tabWalkFrom(page, ".readaloud-cluster .readaloud-btn", ".readaloud-speed", 10),
        "Tab must reach the speed select from the transport",
      ).toBe(true);
      expect(
        await tabWalkFrom(page, ".readaloud-speed", ".readaloud-voice-trigger", 4),
        "Tab must reach the Voice trigger from the speed select",
      ).toBe(true);
    } else {
      await page.locator(".readaloud-speed").focus();
      await expect(page.locator(".readaloud-speed")).toBeFocused();
      await page.locator(".readaloud-voice-trigger").focus();
      await expect(page.locator(".readaloud-voice-trigger")).toBeFocused();
    }
    await page.locator(".readaloud-bar").getByRole("button", { name: "Stop" }).click();
  });
});

test.describe("Issue #165 — narrow viewport (375×667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test.setTimeout(120_000);

  test("the speed select and Voice trigger are usable; the popover stays in-viewport", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);

    const speed = speedSelect(page);
    await expect(speed).toBeVisible();
    await bar.getByRole("button", { name: "Voice" }).click();
    await expect(voiceSelect(page)).toBeVisible();

    // The anchored panel flipped/kept itself inside the viewport (zero JS
    // repositioning — the position-try fallbacks own this).
    const box = await page.locator(".readaloud-voice-popover").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375.5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(667.5);

    await page.getByRole("button", { name: "Done" }).click();
    await bar.getByRole("button", { name: "Stop" }).click();
  });
});
