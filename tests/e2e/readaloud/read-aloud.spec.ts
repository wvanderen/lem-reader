// tests/e2e/readaloud/read-aloud.spec.ts
// Issue #40 e2e leg — the minimal speakable read-aloud path in a REAL
// browser. speechSynthesis is engine-owned and voice-dependent (spike 0009
// F3: never trust the platform), so the spec installs a CONTROLLABLE fake
// via addInitScript and drives its events programmatically — deterministic
// across chromium/firefox/webkit and CI machines with no voices at all.
//
// What is pinned here:
//   1. Anatomy + honesty: the fixed transport bar mounts with real
//      Play/Pause/Stop buttons; the primary button's NAME flips with state
//      (never color); Stop is inert while stopped; exactly one polite
//      transport status region carries each announcement; play never moves
//      focus.
//   2. Word-capable voice: the silent probe resolves "Follows: word";
//      boundary charIndexes surface as canonical location saves (raw
//      IndexedDB location row — the flush discipline, not rendered UI);
//      leaving and reopening RESTORES the listened position (the
//      restoration marker's announce copy).
//   3. Sentence-only voice: probe resolves "Follows: sentence" without
//      stalling (the acceptance criterion's non-word voice path).
//   4. Dead voice: nothing fires — the bounded probe degrades to
//      "Follows: progress only" and a silently-dropped queue fails HONESTLY
//      ("Speech didn't start.") instead of faking playback.
//   5. Finishing by ear: playing from a near-end saved position through the
//      final chunk persists the ONE end-pin (offset = total) — the same
//      location truth the Finished check reads.
//
// Harness cloned from mark-read-and-close.spec.ts (REUSE-DO-NOT-FORK):
// image stub + goto BASE + "Saved articles" wait + raw IndexedDB clear-rows.
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import {
  normalizeText,
  graphemeClusters,
} from "../../../src/content/normalizeText";

const BASE = "http://localhost:5173";

const ARTICLE = fixtures[0]!;
const ARTICLE_HREF = `#/article/${ARTICLE.id}`;
const TOTAL = graphemeClusters(normalizeText(ARTICLE), ARTICLE.lang).length;

type SpeechMode = "word" | "sentence" | "dead";

/** Install the controllable fake speechSynthesis BEFORE app code loads.
 * The fake records every spoken utterance (text/rate/volume + live event
 * wiring) and exposes window.__speechFire(event, charIndex) for the tests.
 * `mode` seeds the PROBE's outcome (the first, volume-0 utterance):
 *   - "word": a word boundary fires (word-capable voice)
 *   - "sentence": a sentence boundary fires, then the probe ends
 *   - "dead": nothing ever fires (silently-dropped speech)
 * Playback utterances are ALWAYS test-driven — no automatic events. */
async function installFakeSpeech(page: Page, mode: SpeechMode): Promise<void> {
  // AWAITED: registration is asynchronous — an un-awaited call races the
  // first goto and the stub silently never installs.
  await page.addInitScript((probeMode: SpeechMode) => {
    interface Record {
      text: string;
      rate: number;
      volume: number;
      done: boolean;
      cancelled: boolean;
      utterance: {
        onstart: ((...a: unknown[]) => void) | null;
        onboundary: ((...a: unknown[]) => void) | null;
        onend: ((...a: unknown[]) => void) | null;
        onerror: ((...a: unknown[]) => void) | null;
      };
    }
    const spoken: Record[] = [];

    class FakeUtterance {
      text: string;
      rate = 1;
      volume = 1;
      voice = null;
      lang = "en";
      onstart: Record["utterance"]["onstart"] = null;
      onboundary: Record["utterance"]["onboundary"] = null;
      onend: Record["utterance"]["onend"] = null;
      onerror: Record["utterance"]["onerror"] = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const synth = {
      pending: [] as FakeUtterance[],
      speak(u: FakeUtterance): void {
        const record: Record = {
          text: u.text,
          rate: u.rate,
          volume: u.volume,
          done: false,
          cancelled: false,
          utterance: u,
        };
        spoken.push(record);
        // The PROBE (the first volume-0 utterance) auto-fires per mode so
        // the follow level resolves without test timing coupling. Playback
        // utterances are always test-driven.
        if (u.volume === 0 && probeMode !== "dead") {
          window.setTimeout(() => {
            if (record.cancelled) return;
            if (probeMode === "word") {
              u.onboundary?.({ name: "word", charIndex: 0 });
            } else {
              u.onboundary?.({ name: "sentence", charIndex: 7 });
            }
          }, 30);
          if (probeMode === "sentence") {
            window.setTimeout(() => {
              if (record.cancelled) return;
              record.done = true;
              u.onend?.();
            }, 60);
          }
        }
      },
      cancel(): void {
        for (const r of spoken) {
          if (!r.done) r.cancelled = true;
        }
        this.pending = [];
      },
      pause(): void {},
      resume(): void {},
      getVoices(): unknown[] {
        return [
          {
            voiceURI: "stub-voice",
            name: "Stub Voice",
            lang: "en",
            localService: true,
            default: true,
          },
        ];
      },
      onvoiceschanged: null,
    };
    // speechSynthesis is a getter-only WebIDL attribute on window — a plain
    // assignment fails silently in every engine; defineProperty shadows it.
    Object.defineProperty(window, "speechSynthesis", {
      value: synth,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: FakeUtterance,
      configurable: true,
      writable: true,
    });
    (window as unknown as { __speechSpoken: Record[] }).__speechSpoken = spoken;
    (window as unknown as {
      __speechFire: (event: string, charIndex?: number) => void;
    }).__speechFire = (event: string, charIndex = 0) => {
      const record = [...spoken].reverse().find((r) => !r.done && !r.cancelled);
      if (!record) return;
      const u = record.utterance;
      if (event === "boundary") {
        u.onboundary?.({ name: "word", charIndex });
      } else if (event === "end") {
        record.done = true;
        u.onend?.();
      } else if (event === "start") {
        u.onstart?.();
      }
    };
  }, mode);
}

async function readLocationRow(
  page: Page,
): Promise<{ graphemeOffset: number } | null> {
  return page.evaluate(async (articleId) => {
    return new Promise((resolve) => {
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
            getAll.result as Array<{ articleId: string; graphemeOffset: number }>
          ).filter((r) => r.articleId === articleId);
          resolve(rows[rows.length - 1] ?? null);
        };
        getAll.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  }, ARTICLE.id);
}

async function seedLocationRow(
  page: Page,
  graphemeOffset: number,
): Promise<void> {
  await page.evaluate(
    ({ articleId, revision, offset }) => {
      return new Promise<void>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("location", "readwrite");
          tx.objectStore("location").put({
            schemaVersion: 1,
            articleId,
            revision,
            graphemeOffset: offset,
            savedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      });
    },
    { articleId: ARTICLE.id, revision: ARTICLE.revision, offset: graphemeOffset },
  );
}

/** Programmatic primary-button activation — a click() that does NOT focus
 * the button, so the test can observe that the APP never moves focus on
 * play (a real pointer click focuses the pressed button by default). */
async function pressPrimaryWithoutFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = document.querySelector(
      ".readaloud-cluster .readaloud-btn",
    ) as HTMLButtonElement | null;
    btn?.click();
  });
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

/**
 * Open the article with the fake speech installed. ORDER IS LOAD-BEARING:
 * addInitScript must register BEFORE the first goto, and the article URL
 * differs from the library URL by the hash only — a same-document
 * navigation that keeps the stub-installed document alive (a second init
 * script registered later would never run).
 */
async function openArticle(
  page: Page,
  mode: SpeechMode,
  opts: { seedOffset?: number } = {},
): Promise<Page> {
  await installFakeSpeech(page, mode);
  // New document: the stub installs, the app boots at the library, and the
  // first load constructs the Dexie schema for the raw-IndexedDB seam below.
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await clearAllRows(page);
  if (opts.seedOffset !== undefined) {
    await seedLocationRow(page, opts.seedOffset);
  }
  await page.goto(`${BASE}/${ARTICLE_HREF}`);
  return page;
}

async function clearAllRows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = [
          "articles",
          "settings",
          "location",
          "highlights",
          "notes",
          "books",
        ];
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

test.describe("Issue #40 — the read-aloud minimal speakable path", () => {
  test.setTimeout(90_000);

  test("transport bar anatomy: real buttons, name flip, one polite region, no focus movement", async ({
    page,
  }) => {
    await openArticle(page, "word");
    const bar = page.locator(".readaloud-bar");
    await expect(bar).toBeVisible();

    // Stopped: Play enabled, Stop disabled (nothing to stop).
    const play = bar.getByRole("button", { name: "Play" });
    const stop = bar.getByRole("button", { name: "Stop" });
    await expect(play).toBeEnabled();
    await expect(stop).toBeDisabled();

    // Focus stays put on play (the app never moves focus; the click is
    // delivered programmatically so button-focus cannot mask a steal).
    await page.getByRole("heading", { name: ARTICLE.provenance.title }).click();
    const focusedBefore = await page.evaluate(
      () => document.activeElement?.tagName ?? null,
    );
    await pressPrimaryWithoutFocus(page);
    await expect(bar.getByRole("button", { name: "Pause" })).toBeVisible();
    const focusedAfter = await page.evaluate(
      () => document.activeElement?.tagName ?? null,
    );
    expect(focusedBefore).toBe("H1");
    expect(focusedAfter).toBe("H1");

    // The ONE transport status region announced the start (exactly one
    // polite region carries the transport copy).
    await expect(
      page.getByRole("status").filter({ hasText: "Reading aloud." }),
    ).toHaveCount(1);

    // Pause flips the NAME back; the pause announcement lands; Stop (now
    // meaningful) stops and announces through the same region.
    await bar.getByRole("button", { name: "Pause" }).click();
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Read aloud paused." }),
    ).toHaveCount(1);
    await stop.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Read aloud stopped." }),
    ).toHaveCount(1);
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("word-capable voice: probe resolves 'word', listening persists and restores", async ({
    page,
  }) => {
    await openArticle(page, "word");
    const bar = page.locator(".readaloud-bar");
    await expect(bar).toBeVisible();

    // Let the first pagination commit settle BEFORE pressing Play: the
    // commit persists offset 0 through the same latest-wins save the
    // listened position uses — a real reader presses Play after the page
    // renders, and the listened offset must land after that write.
    await expect(page.getByText(/1 of \d+/).first()).toBeVisible({
      timeout: 15_000,
    });
    await pressPrimaryWithoutFocus(page);

    // Probe: silent (volume 0); the word boundary resolves the follow level.
    await expect(bar.getByText("Follows: word")).toBeVisible({
      timeout: 10_000,
    });

    // The probe settled; playback chunk 1 is live. Drive word boundaries —
    // the listened position persists through the SHARED location-save
    // discipline (the raw IndexedDB row — not rendered UI).
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const w = window as unknown as {
        __speechFire: (event: string, charIndex?: number) => void;
      };
      w.__speechFire("boundary", 0);
      w.__speechFire("boundary", 8);
    });
    await expect
      .poll(
        async () => (await readLocationRow(page))?.graphemeOffset,
        {
          timeout: 15_000,
          message:
            "expected the listened position to persist as a location row",
        },
      )
      .toBeGreaterThan(0);

    // Leave and reopen (goto + reload — the openView remount discipline:
    // same-document hash goto alone does not route under webkit). The stub
    // re-installs on the reloaded document; the app boots straight onto the
    // article and restores the listened position (the restoration marker's
    // announce copy — the same restore pipeline every reader gets).
    await page.goto(`${BASE}/`);
    await page.goto(`${BASE}/${ARTICLE_HREF}`);
    await page.reload();
    await expect(page.getByText("Returned to where you left off.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("sentence-only voice: probe resolves 'sentence' without stalling", async ({
    page,
  }) => {
    await openArticle(page, "sentence");
    const bar = page.locator(".readaloud-bar");
    await bar.getByRole("button", { name: "Play" }).click();

    // The probe's sentence boundary (then its end) resolves the level well
    // inside the bounded probe budget; playback utterances follow.
    await expect(bar.getByText("Follows: sentence")).toBeVisible({
      timeout: 10_000,
    });

    // Wait out the post-cancel settle, then drive the first playback chunk
    // to its end — the queue advances (no stall).
    await page.waitForTimeout(200);
    const spokenAfterFirst = await page.evaluate(
      () =>
        (window as unknown as { __speechSpoken: unknown[] }).__speechSpoken
          .length,
    );
    expect(spokenAfterFirst).toBeGreaterThanOrEqual(2); // probe + chunk 1
    await page.evaluate(() => {
      const w = window as unknown as {
        __speechFire: (event: string, charIndex?: number) => void;
      };
      w.__speechFire("end");
    });
    await page.waitForTimeout(100);
    const spokenAfterAdvance = await page.evaluate(
      () =>
        (window as unknown as { __speechSpoken: unknown[] }).__speechSpoken
          .length,
    );
    expect(spokenAfterAdvance).toBe(spokenAfterFirst + 1); // chunk 2 queued
    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("dead voice: bounded probe degrades to 'progress only', then fails honestly", async ({
    page,
  }) => {
    await openArticle(page, "dead");
    const bar = page.locator(".readaloud-bar");
    await bar.getByRole("button", { name: "Play" }).click();

    // The probe times out (2s) → progress-only; the dropped playback queue
    // trips the first-event stall watchdog → the honest refusal, never a
    // fake "playing" state.
    await expect(bar.getByText("Follows: progress only")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Speech didn't start." }),
    ).toBeVisible({ timeout: 30_000 });
    // The transport returned to its honest rest state.
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("finishing by ear marks the article finished (the end-pin persists)", async ({
    page,
  }) => {
    // A saved position near the end: Play starts from the chunk containing
    // it; speaking the remaining chunks to the last end persists the ONE
    // end-pin (offset = total) — the Finished check's own truth.
    await openArticle(page, "word", { seedOffset: Math.floor(TOTAL * 0.995) });
    const bar = page.locator(".readaloud-bar");
    await expect(bar).toBeVisible();

    await pressPrimaryWithoutFocus(page);
    await expect(bar.getByText(/Follows: (word|sentence|passage)/)).toBeVisible({
      timeout: 10_000,
    });

    // Drive every playback utterance to its end until the queue exhausts.
    await expect
      .poll(
        async () => {
          await drainPlayback(page);
          return (await readLocationRow(page))?.graphemeOffset;
        },
        {
          timeout: 30_000,
          message:
            "expected the end-pin offset (total) after finishing by ear",
        },
      )
      .toBe(TOTAL);

    // The transport returned to rest with the finished announcement.
    await expect(
      page.getByRole("status").filter({ hasText: "Read aloud finished." }),
    ).toBeVisible();
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

/** Fire end on the CURRENT playback utterance until the queue exhausts or
 * nothing live remains (bounded — a safety loop, never the mechanism). */
async function drainPlayback(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const advanced = await page.evaluate(() => {
      const w = window as unknown as {
        __speechSpoken: { volume: number; done: boolean; cancelled: boolean }[];
        __speechFire: (event: string, charIndex?: number) => void;
      };
      const live = [...w.__speechSpoken]
        .reverse()
        .find((u) => !u.done && !u.cancelled && u.volume === 1);
      if (!live) return false;
      w.__speechFire("end");
      return true;
    });
    if (!advanced) break;
    await page.waitForTimeout(40);
  }
}
