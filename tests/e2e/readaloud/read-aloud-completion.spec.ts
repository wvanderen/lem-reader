// tests/e2e/readaloud/read-aloud-completion.spec.ts
// Issue #43 e2e leg — read-aloud completion: the skip controls, the
// spoken-channel content rules, the settings voice/rate controls, and the
// backgrounding stop. The speechSynthesis fake is the shared controllable
// harness (controllable fake installed via addInitScript; playback events
// are always test-driven) — deterministic across chromium/firefox/webkit.
//
// What is pinned here (the issue's acceptance criteria):
//   1. O1 — the bar shows the rate as text whenever mounted, and the skip
//      controls render as real buttons while a session exists.
//   2. O3 — Skip sentence backward/forward and Skip paragraph forward make
//      the voice audibly jump (the live utterance changes to the expected
//      sentence/paragraph chunk) and the marker hops; a successful skip
//      stays SILENT (no per-hop chatter through the polite region).
//   3. O7 — the spoken channel follows the document honestly on
//      technical-post: code-block sources are never spoken (the marker hops
//      the gap), document order is preserved.
//   4. O8 — Reading settings offers the probed filtered local-voice list
//      (system default + Stub Voice; the remote cloud voice is filtered)
//      and a 0.5–3 rate control; both apply to SUBSEQUENT playback.
//   5. O9 — backgrounding during playback stops it (announcement + no
//      marker), and returning does NOT resume silently — the visible
//      resume affordance is the bar's Play button.
import { test, expect, type Page } from "@playwright/test";
import { bundledFixtures } from "../../../src/fixtures";
import { chunkArticleForSpeech } from "../../../src/readaloud/chunks";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
// REUSE-DO-NOT-FORK: the shared controllable-fake speechSynthesis harness.
import { installFakeSpeech, type SpeechMode } from "./_speech";

const BASE = "http://localhost:5173";
const ESSAY = bundledFixtures.find((f) => f.id === "essay-long-form")!;
const TECH = bundledFixtures.find((f) => f.id === "technical-post")!;
const ESSAY_CHUNKS = chunkArticleForSpeech(ESSAY);
const TECH_CHUNKS = chunkArticleForSpeech(TECH);

function firstChunkOfSentence(chunks: typeof ESSAY_CHUNKS, sentenceIndex: number) {
  const i = chunks.findIndex((c) => c.units.sentenceIndex === sentenceIndex);
  return chunks[i]!;
}

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

/** Open an article with the fake speech installed (ORDER IS LOAD-BEARING:
 * init script before the first goto — the article URL differs from the
 * library by hash only, so the stub-installed document survives). */
async function openArticle(
  page: Page,
  articleId: string,
  mode: SpeechMode = "word",
): Promise<Page> {
  await installFakeSpeech(page, mode);
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await clearAllRows(page);
  await page.goto(`${BASE}/#/article/${articleId}`);
  return page;
}

async function playAndAwaitProbe(page: Page): Promise<void> {
  const bar = page.locator(".readaloud-bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Play" }).click();
  await expect(bar.getByText("Follows: word")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(150); // the post-cancel settle before chunk 1
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

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
});

test.describe("Issue #43 — read-aloud completion", () => {
  test.setTimeout(120_000);

  test("O1: the bar shows the rate as text and the skip controls while a session exists", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await expect(bar).toBeVisible();

    // Stopped: no skip controls, but the rate is already visible as text.
    await expect(bar.getByText("Rate: 1×")).toBeVisible();
    await expect(bar.getByRole("button", { name: "Skip sentence backward" })).toHaveCount(0);

    await playAndAwaitProbe(page);

    // Session active: the three skip controls are real buttons; the rate
    // text and the follow level are both on the bar.
    await expect(bar.getByRole("button", { name: "Skip sentence backward" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Skip sentence forward" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Skip paragraph forward" })).toBeVisible();
    await expect(bar.getByText("Rate: 1×")).toBeVisible();
    await expect(bar.getByText("Follows: word")).toBeVisible();

    await bar.getByRole("button", { name: "Stop" }).click();
    await expect(bar.getByRole("button", { name: "Skip sentence backward" })).toHaveCount(0);
    await expect(bar.getByText("Rate: 1×")).toBeVisible();
  });

  test("O3: skip sentence forward/backward audibly jumps and the marker hops — silently", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);

    // The first live utterance is the chunk at the reader's position.
    const first = ESSAY_CHUNKS[0]!;
    await expect.poll(() => liveUtteranceText(page), { timeout: 10_000 }).toBe(first.text);

    // Skip sentence forward: the voice jumps to the FIRST chunk of sentence 1.
    const second = firstChunkOfSentence(ESSAY_CHUNKS, 1);
    await bar.getByRole("button", { name: "Skip sentence forward" }).click();
    await expect.poll(() => liveUtteranceText(page), { timeout: 10_000 }).toBe(second.text);

    // The marker hopped with it: fire the word boundary the new utterance
    // produces — the mark covers text in the new chunk…
    await page.evaluate(() => {
      (window as unknown as { __speechFire: (event: string, charIndex?: number) => void })
        .__speechFire("boundary", 0);
    });
    await expect(page.locator("mark.spoken-word")).toBeVisible({ timeout: 10_000 });
    // …and the ONE polite region did NOT chatter: it still carries the
    // transport's own "Reading aloud." copy from Play.
    await expect(
      page.getByRole("status").filter({ hasText: "Reading aloud." }),
    ).toHaveCount(1);

    // Skip sentence backward: back to the first sentence's first chunk.
    await bar.getByRole("button", { name: "Skip sentence backward" }).click();
    await expect.poll(() => liveUtteranceText(page), { timeout: 10_000 }).toBe(first.text);

    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("O3: skip paragraph forward crosses sentences; a boundary skip announces once", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);

    // Paragraph forward: from paragraph 0 to the first chunk of paragraph 1.
    const paragraph1 = ESSAY_CHUNKS.find((c) => c.units.paragraphIndex === 1)!;
    await bar.getByRole("button", { name: "Skip paragraph forward" }).click();
    await expect.poll(() => liveUtteranceText(page), { timeout: 10_000 }).toBe(paragraph1.text);

    // Drain to the LAST chunk, then skip forward past the final sentence —
    // the ONE honest boundary line, once, through the polite region.
    const last = ESSAY_CHUNKS[ESSAY_CHUNKS.length - 1]!;
    const lastText = last.text;
    await expect
      .poll(() =>
        page.evaluate((target) => {
          const w = window as unknown as {
            __speechSpoken: { text: string; volume: number; done: boolean; cancelled: boolean }[];
            __speechFire: (event: string, charIndex?: number) => void;
          };
          for (let i = 0; i < 5; i++) {
            const live = [...w.__speechSpoken]
              .reverse()
              .find((r) => !r.done && !r.cancelled && r.volume === 1);
            if (!live) return "none";
            if (live.text === target) return "last";
            w.__speechFire("end");
          }
          return "draining";
        }, lastText),
        { timeout: 60_000 },
      )
      .toBe("last");
    await bar.getByRole("button", { name: "Skip sentence forward" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "No next sentence." }),
    ).toHaveCount(1);
    // The session keeps playing at the last sentence.
    expect(await liveUtteranceText(page)).toBe(last.text);

    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("O7: technical-post — code is never spoken and the marker hops the gap in order", async ({
    page,
  }) => {
    await openArticle(page, TECH.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);

    // Drain the whole queue: every playback utterance is test-driven. Each
    // poll drains up to 8 utterances IN the browser and returns what was
    // spoken + whether anything is still live (Node accumulates).
    const spokenTexts: string[] = [];
    await expect
      .poll(async () => {
        const drained = await page.evaluate(() => {
          const w = window as unknown as {
            __speechSpoken: { text: string; volume: number; done: boolean; cancelled: boolean }[];
            __speechFire: (event: string, charIndex?: number) => void;
          };
          const out: string[] = [];
          for (let i = 0; i < 8; i++) {
            const live = [...w.__speechSpoken]
              .reverse()
              .find((r) => !r.done && !r.cancelled && r.volume === 1);
            if (!live) break;
            out.push(live.text);
            w.__speechFire("end");
          }
          const stillLive = [...w.__speechSpoken]
            .reverse()
            .find((r) => !r.done && !r.cancelled && r.volume === 1);
          return { out, stillLive: stillLive ? stillLive.text : null };
        });
        spokenTexts.push(...drained.out);
        return drained.stillLive;
      }, { timeout: 60_000 })
      .toBeNull();

    // O7 — the spoken channel: no code-block source text was ever uttered.
    // The fixture's code sources are HTML ("Instructions for life…", table
    // markup). (The article's PROSE quotes markup like "<p>" — it is a
    // technical post about HTML — so only unique code-source strings count.)
    expect(spokenTexts.length).toBeGreaterThan(3);
    for (const text of spokenTexts) {
      expect(text).not.toContain("Instructions for life");
      expect(text).not.toContain("<li>Eat</li>");
      expect(text).not.toContain("Hi, I'm your first cell");
    }
    // Spoken order matches the speakable-chunk order (document order over
    // the spoken channel).
    expect(spokenTexts).toEqual(TECH_CHUNKS.map((c) => c.text));

    // The marker hops the code gap: play a fresh session, advance the queue
    // to the first chunk AFTER the first code block, fire a word boundary —
    // the visible mark lands on prose, never code.
    const index = articleGraphemeIndex(TECH);
    const codeBlock = TECH.blocks.findIndex((b) => b.kind === "code-block");
    expect(codeBlock).toBeGreaterThan(0);
    const codeStart = index.blockStartOffsets[codeBlock]!;
    const codeEnd = codeStart + index.perBlockLengths[codeBlock]!;
    const afterGap = TECH_CHUNKS.find((c) => c.startGrapheme >= codeEnd)!;
    expect(afterGap.startGrapheme).toBeGreaterThan(codeEnd);

    await bar.getByRole("button", { name: "Play" }).click();
    await page.waitForTimeout(300); // the probe + settle
    const charIndex = afterGap.utf16ToGrapheme.findIndex((v) => v >= 1);
    await expect
      .poll(async () => {
        const live = await liveUtteranceText(page);
        if (live !== afterGap.text) {
          await page.evaluate(() => {
            const w = window as unknown as {
              __speechSpoken: { volume: number; done: boolean; cancelled: boolean }[];
              __speechFire: (event: string, charIndex?: number) => void;
            };
            const liveRec = [...w.__speechSpoken]
              .reverse()
              .find((r) => !r.done && !r.cancelled && r.volume === 1);
            if (liveRec) w.__speechFire("end");
          });
        }
        return live;
      }, { timeout: 30_000 })
      .toBe(afterGap.text);
    await page.evaluate((ci) => {
      (window as unknown as { __speechFire: (event: string, ci?: number) => void })
        .__speechFire("boundary", ci);
    }, charIndex);
    await expect(page.locator("mark.spoken-word")).toBeVisible({ timeout: 10_000 });
    const markText = await page.evaluate(() =>
      (document.querySelector("mark.spoken-word")?.textContent ?? "").trim(),
    );
    // The mark landed on PROSE past the gap — never code source.
    expect(markText).not.toContain("Instructions for life");
    expect(markText.length).toBeGreaterThan(0);

    await bar.getByRole("button", { name: "Stop" }).click();
  });

  test("O8: settings voice list is the probed filtered local list; voice + rate apply to subsequent playback", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);

    // Open Reading settings: the voice picker offers the system default and
    // the LOCAL stub voice; the remote cloud voice is filtered out.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const voiceSelect = page.getByRole("combobox", { name: "Read-aloud voice" });
    await expect(voiceSelect).toBeVisible();
    await expect(voiceSelect.getByRole("option", { name: "System default voice" })).toHaveCount(1);
    await expect(voiceSelect.getByRole("option", { name: "Stub Voice (en)" })).toHaveCount(1);
    await expect(voiceSelect.getByRole("option", { name: "Cloud Voice (en)" })).toHaveCount(0);

    // Pick the local voice and raise the rate one 0.25 step (1 → 1.25).
    await voiceSelect.selectOption("stub-voice");
    const rate = page.getByRole("slider", { name: "Read-aloud rate" });
    await expect(rate).toBeVisible();
    await expect(rate).toHaveAttribute("min", "0.5");
    await expect(rate).toHaveAttribute("max", "3");
    await rate.focus();
    await page.keyboard.press("ArrowUp");
    await expect(
      page.locator(".settings-value").filter({ hasText: "1.25×" }),
    ).toBeVisible();
    // The bar mirrors the configured rate as text (O1).
    await page.keyboard.press("Escape");
    await expect(page.locator(".readaloud-bar").getByText("Rate: 1.25×")).toBeVisible({
      timeout: 10_000,
    });

    // Subsequent playback carries BOTH applied values.
    await playAndAwaitProbe(page);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const w = window as unknown as {
            __speechSpoken: { rate: number; voice: string | null; volume: number }[];
          };
          const playback = w.__speechSpoken.filter((r) => r.volume === 1);
          return playback.length > 0 ? { rate: playback[0]!.rate, voice: playback[0]!.voice } : null;
        }),
        { timeout: 10_000 },
      )
      .toEqual({ rate: 1.25, voice: "stub-voice" });

    await page.locator(".readaloud-bar").getByRole("button", { name: "Stop" }).click();
  });

  test("O9: backgrounding stops playback; returning shows the resume affordance and never resumes silently", async ({
    page,
  }) => {
    await openArticle(page, ESSAY.id);
    const bar = page.locator(".readaloud-bar");
    await playAndAwaitProbe(page);
    // The marker appears with the utterance's word-boundary event.
    await page.evaluate(() => {
      (window as unknown as { __speechFire: (event: string, charIndex?: number) => void })
        .__speechFire("boundary", 0);
    });
    await expect(page.locator("mark.spoken-word")).toBeVisible({ timeout: 10_000 });

    // Background the reader mid-playback (visibilitychange-hidden).
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // The session stopped honestly: the ONE polite region explains it, the
    // marker cleared, and the transport is back at Play.
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Read aloud stopped while the reader was in the background." }),
    ).toHaveCount(1);
    await expect(page.locator("mark.spoken-word")).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();

    // Return: nothing resumes silently — no new utterances, still stopped.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
    expect(await liveUtteranceText(page)).toBeNull();
    await expect(bar.getByRole("button", { name: "Play" })).toBeVisible();
  });
});
