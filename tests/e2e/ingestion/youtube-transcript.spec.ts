// tests/e2e/ingestion/youtube-transcript.spec.ts
// Issue #41 — the YouTube ingest end-to-end flows (ACCEPTANCE-PROTOCOL
// flow N). The server pipeline (InnerTube client + transcriptToBlocks) is
// proven by the unit suite (tests/unit/server/youtube-*.spec.ts) against
// live-captured fixtures; these cells prove the READER-FACING half over the
// same happy-path page.route seam as ingestion/happy-path.spec.ts: the Add
// dialog's URL arm → /api/ingest envelope → Dexie save → ArticleView /
// LibraryRow. Each cell names its flow row:
//   N1  watch URL → transcript article opens (h1 title, channel byline,
//       caption-order paragraphs, timestamps never rendered)
//   N2  chaptered video → chapter h2 TOC entries with working jumps;
//       chapterless → only "Top of article"
//   N3  library row: accessible name = video title, "YouTube" badge,
//       duration as text, channel in the author field
//   N4  no-captions / unavailable-private / age-gated refusals — calm,
//       specific, dialog open, URL retained, retry enabled, no row added
//   N5  bot-check — announces immediately, no automatic retry (request
//       count stays at one)
//   N6  ASR-only video — ingest succeeds with the low-confidence disclosure
//   plus the flow-N1 tail: position restore + finished state behave exactly
//   as for any text article (flows A–L inherit; no special-casing).
import { test, expect, type Page } from "@playwright/test";
import { openAddDialog } from "../library/add-dialog";

const BASE = "http://localhost:5173";

// ── transcript-article builder (ArticleSchema-valid envelopes) ──────────────

interface ChapterSpec {
  title: string;
  paragraphs: string[];
}

function paragraph(text: string) {
  return { kind: "paragraph" as const, content: [{ text }] };
}
function heading(level: 2, text: string) {
  return { kind: "heading" as const, level, content: [{ text }] };
}

/**
 * Builds the `article` half of an ok ingest envelope exactly as the server's
 * YouTube branch emits it: provenance carries the video title + channel as
 * author + canonical watch URL; ingestionMeta carries source "youtube" and
 * the block-keyed transcript meta (timestamps live ONLY here — never in
 * blocks); ASR forces extractionConfidence "low" (the ingest-time floor).
 */
function transcriptArticle(options: {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  intro: string[];
  chapters: ChapterSpec[];
  asr?: boolean;
}) {
  const blocks = [
    ...options.intro.map(paragraph),
    ...options.chapters.flatMap((chapter) => [
      heading(2, chapter.title),
      ...chapter.paragraphs.map(paragraph),
    ]),
  ];
  const segments = blocks.map((_, blockIndex) => ({
    blockIndex,
    startMs: blockIndex * 30_000,
  }));
  return {
    id: options.id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: `https://www.youtube.com/watch?v=${options.videoId}`,
      title: options.title,
      author: options.channel,
      retrievedAt: "2026-09-16T12:00:00.000Z",
      originalHtmlHash: "sha256:" + "a".repeat(64),
    },
    blocks,
    footnotes: [],
    ingestionMeta: {
      source: "youtube",
      origin: "url",
      sourceUrl: `https://www.youtube.com/watch?v=${options.videoId}`,
      originalHtmlHash: "sha256:" + "a".repeat(64),
      fetchedAt: "2026-09-16T12:00:00.000Z",
      extractionConfidence: options.asr ? "low" : "high",
      extractionWarnings: [],
      transcript: {
        videoId: options.videoId,
        durationSeconds: options.durationSeconds,
        captionSource: options.asr ? "asr" : "manual",
        captionLanguage: "en",
        segments,
      },
    },
  };
}

const CHAPTERED_SPEC = {
  id: "yt-e2e-chaptered",
  videoId: "dQw4w9WgXcQ",
  title: "A Field Guide to Quiet Mornings",
  channel: "Calm Signal",
  // 12:00 exactly — the row duration cell pins the round "12 min" voice.
  durationSeconds: 720,
  // Long enough to paginate into several pages at the default viewport, so
  // page 2 lands mid-article (a restore cell, not an instant finished state).
  intro: [
    "Welcome to the show. Today we walk through the small rituals of a quiet morning, one cue at a time, and why the first hour sets the tone for everything that follows. This is a long conversation, so settle in.",
    "Before we begin, a quick note on method. Every step below is deliberately small, because small steps survive busy days and loud rooms far better than grand plans ever do. We will repeat that idea often.",
    "The first hour is not about productivity. It is about orientation: knowing where you are, what the day asks of you, and what it does not. Most hurry is borrowed from an unclear picture of the day.",
    "Consider the kettle. It heats while you stand still. Those four minutes are not wasted; they are the day's first appointment with doing one thing at a time, and they cost nothing to keep.",
    "Listeners often write that mornings feel like a downhill race. The fix is rarely earlier alarms. It is fewer decisions made before the light is up: one cup, one page, one small walk if the weather allows.",
    "We will hold two ideas for the whole episode. First, rituals beat routines because they carry meaning. Second, the quietest option is usually the correct one, and it is usually the one that scales.",
  ],
  chapters: [
    {
      title: "Chapter One — Waking Slowly",
      paragraphs: [
        "The first cue is light. Open the curtain before you reach for the phone, and let the room decide the pace of the day. Ten unhurried minutes of daylight do more than an hour of willpower ever has.",
        "Light is information before it is illumination. It tells the body what time it is without a single word, and the body believes it long before the mind finishes its first worry of the day.",
        "If the morning is dark where you live, a lamp on a timer is not cheating. The point was never the sun specifically; the point was a signal that arrives whether or not you are ready for it.",
      ],
    },
    {
      title: "Chapter Two — The First Cup",
      paragraphs: [
        "The second cue is water and warmth. Brew the first cup with attention: the kettle, the pour, the steam. The drink matters less than the deliberate minute it takes to make it properly.",
        "A cup made slowly tastes the same as a cup made quickly, and yet it is never the same cup. The difference is not in the water. It is in what the making did to the person holding it.",
        "Write nothing down during this minute. The day will make its demands soon enough, and it will be loud about them. This minute is yours, and it is quiet, and it is training for all the others.",
      ],
    },
  ],
};
const CHAPTERED = transcriptArticle(CHAPTERED_SPEC);

const CHAPTERLESS = transcriptArticle({
  id: "yt-e2e-plain",
  videoId: "e2ePlainClp",
  title: "Three Notes on Listening",
  channel: "Calm Signal",
  durationSeconds: 48,
  intro: [
    "No chapters today — just three short notes on listening, recorded in one take by a rainy window.",
    "The first note: listening begins with silence, and silence is not the absence of sound but the absence of hurry.",
    "The second note: repeat back what you heard before you answer it. The repetition is the respect.",
    "The third note: when in doubt, ask one more question. Curiosity is the patient form of care.",
  ],
  chapters: [],
});

const ASR_ONLY = transcriptArticle({
  id: "yt-e2e-asr",
  videoId: "e2eAsrOnly1",
  title: "Notes from a Noisy Kitchen",
  channel: "Calm Signal",
  durationSeconds: 620,
  intro: [
    "This episode was recorded mid-preparation, so the auto-generated captions had a hard time with the sizzling. The transcript below carries their best effort.",
    "We talk about the honest mess of cooking at home and why recipes are letters, not laws.",
  ],
  chapters: [],
  asr: true,
});

/** Installs the POST /api/ingest mock; the posted {url} picks the response. */
function mockIngest(
  page: Page,
  byUrl: Record<string, unknown>,
): { requests: () => number } {
  let count = 0;
  void page.route("**/api/ingest", async (route) => {
    count += 1;
    const body = route.request().postDataJSON() as { url?: string };
    const response = byUrl[body.url ?? ""];
    if (response === undefined) {
      await route.fulfill({ status: 500, body: "unexpected url" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return { requests: () => count };
}

async function libraryRowCount(page: Page): Promise<number> {
  await page.goto(`${BASE}/#/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  return page.locator(".library-row").count();
}

async function addByUrl(page: Page, url: string): Promise<void> {
  await openAddDialog(page);
  await page.getByRole("textbox", { name: /add by url/i }).fill(url);
  await page.getByRole("button", { name: /^add$/i }).click();
}

/** The article-side block with the given text on the VISIBLE surface (the
 *  hidden measurement clone carries the same [data-block-index] set and must
 *  never match — the _edge-invariant.ts visible-block selector discipline). */
function visibleBlock(page: Page, text: string) {
  return page
    .locator(
      "[data-block-index]:not(.article-body-measurement [data-block-index])",
    )
    .filter({ hasText: text })
    .first();
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});

test.describe("YouTube ingest end-to-end (issue #41, flow N)", () => {
  test("N1: watch URL → transcript article opens; timestamps never rendered; position restores", async ({
    page,
  }) => {
    const WATCH_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    mockIngest(page, {
      [WATCH_URL]: {
        ok: true,
        article: CHAPTERED,
        confidence: { state: "confident" },
      },
    });

    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await addByUrl(page, WATCH_URL);

    // The dialog closes and the reader opens on the transcript article.
    await page.waitForURL(/#\/article\/yt-e2e-chaptered$/, { timeout: 15_000 });
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(CHAPTERED.provenance.title, { timeout: 10_000 });

    // The channel is the byline (the article-top-meta provenance block).
    await expect(page.locator(".article-top-meta")).toContainText(
      CHAPTERED.provenance.author,
    );

    // Transcript paragraphs read in caption order (DOM order = document
    // order), and timestamps are NEVER rendered — not in the transcript
    // paragraphs, not anywhere in the article chrome.
    await expect(visibleBlock(page, CHAPTERED_SPEC.intro[0]!)).toBeVisible();
    await expect(visibleBlock(page, CHAPTERED_SPEC.intro[1]!)).toBeVisible();
    const firstTop = await visibleBlock(page, CHAPTERED_SPEC.intro[0]!).evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    const secondTop = await visibleBlock(page, CHAPTERED_SPEC.intro[1]!).evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    expect(firstTop, "caption order = reading order").toBeLessThanOrEqual(secondTop);
    await expect(page.getByText(/\b\d{1,2}:\d{2}\b/)).toHaveCount(0);

    // Read forward (a page turn persists the location through the back-nav
    // flush), return, and reopen — position restore behaves exactly as for
    // any text article (flow N1 tail).
    await expect(page.locator(".page-fragment").first()).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Page 2")).toBeVisible({ timeout: 10_000 });
    // The per-turn location save is debounced (SAVE_DEBOUNCE_MS 1200) — let
    // it fire before leaving, exactly as a human-paced page turn would.
    await page.waitForTimeout(1_400);
    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    const row = page.locator(".library-row", { hasText: CHAPTERED.provenance.title });
    await expect(row.locator(".library-progress-label")).toContainText(/% read$/);
    await row.locator("a.library-card-link").click();
    await page.waitForURL(/#\/article\/yt-e2e-chaptered$/, { timeout: 15_000 });
    await expect(page.locator(".restoration-marker").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("N3+N1 finished state: the row exposes YouTube badge, duration, channel, and the Finished mark", async ({
    page,
  }) => {
    const WATCH_URL = "https://youtu.be/dQw4w9WgXcQ"; // the youtu.be form drives too
    mockIngest(page, {
      [WATCH_URL]: {
        ok: true,
        article: CHAPTERED,
        confidence: { state: "confident" },
      },
    });

    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await addByUrl(page, WATCH_URL);
    await page.waitForURL(/#\/article\/yt-e2e-chaptered$/, { timeout: 15_000 });

    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();

    const row = page.locator(".library-row", { hasText: CHAPTERED.provenance.title });
    // Accessible name = the video title (the row link).
    await expect(row.getByRole("link", { name: CHAPTERED.provenance.title })).toBeVisible();
    // "YouTube" badge (linking the canonical watch URL) + duration as text.
    const badge = row.locator(".source-badge");
    await expect(badge).toHaveText("YouTube");
    await expect(badge.getByRole("link")).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    await expect(row.locator(".library-row-duration")).toHaveText("12 min");
    // The channel in the author field.
    await expect(row.locator(".library-card-meta .meta").first()).toHaveText(
      "Calm Signal",
    );

    // The finished state rides the ordinary row control (no special-casing).
    await row.getByRole("button", { name: `Mark as read: ${CHAPTERED.provenance.title}` }).click();
    await expect(row.locator(".finished-mark")).toHaveText("Finished");
  });

  test("N2: chaptered video → chapter TOC entries with working jumps; chapterless → only Top of article", async ({
    page,
  }) => {
    const CHAPTERED_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const PLAIN_URL = "https://www.youtube.com/watch?v=e2ePlainClp";
    mockIngest(page, {
      [CHAPTERED_URL]: {
        ok: true,
        article: CHAPTERED,
        confidence: { state: "confident" },
      },
      [PLAIN_URL]: {
        ok: true,
        article: CHAPTERLESS,
        confidence: { state: "confident" },
      },
    });

    // Chaptered: the creator chapters are h2 heading entries in the TOC.
    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await addByUrl(page, CHAPTERED_URL);
    await page.waitForURL(/#\/article\/yt-e2e-chaptered$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
    // Default mode is paginated — wait for the first page commit before
    // driving the TOC (the toc-navigation.spec discipline).
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    await page.getByRole("button", { name: "Table of contents" }).click();
    const nav = page.getByRole("navigation", { name: "Table of contents" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Top of article" })).toBeVisible();
    for (const chapter of CHAPTERED_SPEC.chapters) {
      await expect(nav.getByRole("link", { name: chapter.title })).toBeVisible();
    }

    // A chapter jump lands at the chapter heading (no special-casing — the
    // ordinary jump machinery over the persisted h2 offsets); the panel
    // closes through the same seam as any article.
    await nav
      .getByRole("link", { name: CHAPTERED_SPEC.chapters[1]!.title })
      .click();
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect(
      visibleBlock(page, CHAPTERED_SPEC.chapters[1]!.title),
    ).toBeVisible();

    // Chapterless: the panel honestly offers only "Top of article".
    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await addByUrl(page, PLAIN_URL);
    await page.waitForURL(/#\/article\/yt-e2e-plain$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Table of contents" }).click();
    const plainNav = page.getByRole("navigation", { name: "Table of contents" });
    await expect(plainNav).toBeVisible();
    await expect(
      plainNav.getByRole("link", { name: "Top of article" }),
    ).toBeVisible();
    await expect(plainNav.getByRole("link")).toHaveCount(1);
  });

  test("N4: no-captions / unavailable-private / age-gated refuse calmly with no library side effects", async ({
    page,
  }) => {
    const refusals = [
      {
        url: "https://www.youtube.com/watch?v=noCaption01",
        reason: "youtube-no-captions",
        copy: "This video has no captions, so there is no transcript to read.",
      },
      {
        url: "https://www.youtube.com/watch?v=privateVid1",
        reason: "youtube-unavailable-private",
        copy: "This video is unavailable — it may be private or removed.",
      },
      {
        url: "https://www.youtube.com/watch?v=ageGateVid1",
        reason: "youtube-age-gated",
        copy: "This video is age-restricted, so its transcript can't be fetched.",
      },
    ] as const;
    mockIngest(
      page,
      Object.fromEntries(
        refusals.map((r) => [r.url, { ok: false, reason: r.reason }]),
      ),
    );

    const rowsBefore = await libraryRowCount(page);

    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();

    const dialog = page.locator("dialog.add-dialog");
    for (const refusal of refusals) {
      await addByUrl(page, refusal.url);
      // Calm, specific copy through the dialog's status region.
      await expect(dialog.locator(".status")).toContainText(refusal.copy);
      // The dialog stays open; the typed URL is retained; retry is enabled.
      await expect(dialog).toBeVisible();
      const input = page.getByRole("textbox", { name: /add by url/i });
      await expect(input).toHaveValue(refusal.url);
      await expect(page.getByRole("button", { name: /^add$/i })).toBeEnabled();
      // Close for the next arm (Esc fires the native cancel → close).
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }

    // No library side effects: the row count is unchanged.
    expect(await libraryRowCount(page)).toBe(rowsBefore);
  });

  test("N5: bot-check announces immediately with no automatic retry", async ({
    page,
  }) => {
    const BOT_URL = "https://www.youtube.com/watch?v=botCheckVid1";
    const ingest = mockIngest(page, {
      [BOT_URL]: { ok: false, reason: "youtube-bot-check" },
    });

    const rowsBefore = await libraryRowCount(page);

    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await addByUrl(page, BOT_URL);

    const dialog = page.locator("dialog.add-dialog");
    await expect(dialog.locator(".status")).toContainText(
      "YouTube is asking for extra verification, so this video can't be added right now.",
    );
    await expect(dialog).toBeVisible();

    // No automatic retry: exactly ONE ingest request, still one after a beat.
    expect(ingest.requests()).toBe(1);
    await page.waitForTimeout(1_500);
    expect(ingest.requests()).toBe(1);

    expect(await libraryRowCount(page)).toBe(rowsBefore);
  });

  test("N6: ASR-only video ingests successfully and carries the low-confidence disclosure", async ({
    page,
  }) => {
    const ASR_URL = "https://www.youtube.com/watch?v=e2eAsrOnly1";
    mockIngest(page, {
      [ASR_URL]: {
        ok: true,
        article: ASR_ONLY,
        confidence: { state: "low" },
      },
    });

    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await addByUrl(page, ASR_URL);

    // Ingest succeeds — the reader opens like any transcript article.
    await page.waitForURL(/#\/article\/yt-e2e-asr$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      ASR_ONLY.provenance.title,
      { timeout: 10_000 },
    );

    // The low-confidence disclosure rides the provenance block — honest
    // fidelity, never a silent upgrade to trusted.
    await expect(page.locator(".article-top-meta .extraction-note")).toHaveText(
      "Transcribed from auto-generated captions, so the wording may not be exact.",
    );

    // The row still presents like any YouTube row (badge + duration).
    await page.getByRole("button", { name: "Back to library" }).click();
    const row = page.locator(".library-row", { hasText: ASR_ONLY.provenance.title });
    await expect(row.locator(".source-badge")).toHaveText("YouTube");
    await expect(row.locator(".library-row-duration")).toHaveText("10 min");
  });
});
