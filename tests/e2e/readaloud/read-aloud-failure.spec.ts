// tests/e2e/readaloud/read-aloud-failure.spec.ts
// Issue #167 e2e leg — the RECOVERABLE failure experience in a REAL browser
// (the deterministic controllable fake provides the failing engines).
//
// What is pinned here:
//   1. Startup failure recovery: a dead voice fails honestly (~probe 2s +
//      stall 3s), the bar STAYS OPEN (Retry primary + visible explanation +
//      Voice picker), a Retry while still dead fails again honestly, and a
//      Retry after the voice recovers plays — the same press seam, no page
//      reload, no dead-end.
//   2. Playback failure distinction: a queue that dies partway reports the
//      PLAYBACK copy ("stopped partway… place is saved"), never the startup
//      copy — the two failure kinds stay distinguishable to the reader.
//   3. Position preservation: the failure never rewinds or skips — Retry
//      resumes from the preserved listened offset (the chunk that was being
//      spoken when the queue died is the chunk the retry speaks FIRST).
//   4. The state never keeps claiming playback after a detected failure
//      (the primary reads Retry, not Pause).
//
// Harness from the shared read-aloud plumbing (REUSE-DO-NOT-FORK): image
// stub + openArticle (goto BASE + "Saved articles" wait + raw IndexedDB
// clear-rows + the fake speech install).
import { test, expect, type Page } from "@playwright/test";
import { openArticle, playAndAwaitProbe } from "./_harness";
import type { SpeechMode } from "./_speech";
import { START_FAILURE_MESSAGE } from "../../../src/readaloud/engine";

type SpokenRecord = { text: string; volume: number; done: boolean; cancelled: boolean };

async function spokenRecords(page: Page): Promise<SpokenRecord[]> {
  return page.evaluate(() =>
    (window as unknown as { __speechSpoken: SpokenRecord[] }).__speechSpoken.map(
      ({ text, volume, done, cancelled }) => ({
        text,
        volume,
        done,
        cancelled,
      }),
    ),
  );
}

async function setMode(page: Page, mode: SpeechMode): Promise<void> {
  await page.evaluate((m) => {
    (window as unknown as { __speechSetMode: (mode: SpeechMode) => void }).__speechSetMode(m);
  }, mode);
}

/** The audible (volume 1) record texts, in order — the playback queue as the
 * fake saw it. */
function audibleTexts(records: SpokenRecord[]): string[] {
  return records.filter((r) => r.volume === 1).map((r) => r.text);
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

test.describe("Issue #167 — the recoverable read-aloud failure", () => {
  test.setTimeout(120_000);

  test("startup failure: Retry while dead fails honestly again; Retry after recovery plays", async ({
    page,
  }) => {
    await openArticle(page, "dead");
    const bar = page.locator(".readaloud-bar");
    await bar.getByRole("button", { name: "Read aloud" }).click();

    // First attempt: the honest startup refusal, bar kept open. The ladder
    // is real-timer (probe 2s + settle + stall 3s) — the window carries the
    // documented 2–3x load inflation on the shared machine.
    await expect(page.getByRole("status").filter({ hasText: "Speech didn't start." })).toBeVisible({
      timeout: 45_000,
    });
    await expect(bar.getByRole("button", { name: "Retry" })).toBeVisible();

    // Retry while the voice is STILL dead: fails honestly again — the
    // recovery affordance never fakes success.
    await bar.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("status").filter({ hasText: START_FAILURE_MESSAGE })).toBeVisible({
      timeout: 45_000,
    });
    await expect(bar.getByRole("button", { name: "Retry" })).toBeVisible();

    // The voice recovers (the platform got fixed / the reader switched
    // voices — modeled by flipping the fake's mode). The SAME retry press
    // now plays: the probe resolves, playback starts — no reload anywhere.
    await setMode(page, "word");
    await bar.getByRole("button", { name: "Retry" }).click();
    await expect(bar.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("status").filter({ hasText: "Reading aloud." })).toBeVisible();
    // The failure line is gone the moment playback is live again.
    await expect(bar.locator(".readaloud-failure")).toHaveCount(0);
  });

  test("playback failure is distinguished from startup failure; Retry resumes from the preserved position", async ({
    page,
  }) => {
    await openArticle(page, "dies-after-first");
    const bar = page.locator(".readaloud-bar");
    await bar.getByRole("button", { name: "Read aloud" }).click();

    // The probe resolves "word"; drive chunk 1 to its end (it IS heard).
    // Poll for the live chunk BEFORE firing — a fire that lands inside the
    // post-cancel settle (before the app queues chunk 1) would no-op and
    // desynchronize the whole scenario (the full-suite-load lesson).
    await expect(bar.getByText("Highlights each word")).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => {
        const records = await spokenRecords(page);
        return records.some((r) => r.volume === 1 && !r.done && !r.cancelled);
      })
      .toBe(true);
    await page.evaluate(() => {
      const w = window as unknown as {
        __speechFire: (event: string, charIndex?: number) => void;
      };
      w.__speechFire("boundary", 0);
      w.__speechFire("end");
    });

    // Chunk 2 auto-errors (the dying engine); the first error ends
    // the session as a PLAYBACK failure with the saved-place
    // copy — the startup copy would be dishonest here.
    await expect(bar.locator(".readaloud-failure")).toHaveText(
      "Read aloud stopped partway. Your place is saved — press Retry to continue from there.",
      { timeout: 30_000 },
    );
    await expect(bar.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Pause" })).toHaveCount(0);

    // The queue that died: chunk 1 heard, chunk 2 refused.
    const before = audibleTexts(await spokenRecords(page));
    expect(before).toHaveLength(2);

    // The voice recovers; Retry resumes. The first retried chunk MUST be
    // the first UNHEARD one (chunk 2's text) — never a restart from the
    // top, never a skip past unread passages.
    await setMode(page, "word");
    await bar.getByRole("button", { name: "Retry" }).click();
    await expect(bar.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => {
        const records = await spokenRecords(page);
        return records.filter((r) => r.volume === 1).length;
      })
      .toBeGreaterThan(before.length);
    const after = audibleTexts(await spokenRecords(page));
    const resumed = after.slice(before.length);
    expect(resumed.length).toBeGreaterThanOrEqual(1);
    expect(resumed[0]).toBe(before[1]); // chunk 2: the first failed-then-unheard chunk
  });
});

for (const state of ["playing", "paused"] as const) {
  test(`final-page completion chrome follows manual turns while speech is ${state}`, async ({
    page,
  }) => {
    await openArticle(page, "word");
    await playAndAwaitProbe(page);
    await page.evaluate(() => {
      (window as unknown as { __speechFire: (event: string) => void }).__speechFire("start");
    });
    const bar = page.locator(".readaloud-bar");
    if (state === "paused") await bar.getByRole("button", { name: "Pause" }).click();
    const next = page.getByRole("button", { name: "Next page", exact: true });
    const complete = page.getByRole("button", { name: "Mark read and close" });
    await expect(next).toHaveAttribute("aria-disabled", "false");
    await expect(complete).toHaveCount(0);
    for (let turn = 0; turn < 100; turn += 1) {
      if ((await next.getAttribute("aria-disabled")) === "true") break;
      const previous = await page.locator(".page-indicator").textContent();
      await next.click();
      await expect(page.locator(".page-indicator")).not.toHaveText(previous!);
    }
    await expect(next).toHaveAttribute("aria-disabled", "true");
    await expect(complete).toBeVisible();
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(complete).toHaveCount(0);
    await expect(
      bar.getByRole("button", { name: state === "playing" ? "Pause" : "Play", exact: true }),
    ).toBeVisible();
  });
}
