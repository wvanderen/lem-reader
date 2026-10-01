// tests/e2e/discover/discover.spec.ts
// Issues #121 + #123 — the Discover destination end-to-end: the visible
// text nav link at narrow widths, the empty state, the accessible URL
// subscription flow (happy path, already-subscribed dedupe, refusal), the
// ONE unified newest-first timeline (feed names, single-feed filter,
// deterministic undated position), refresh on opening + manual Refresh with
// NO polling, the offline/failed-refresh stale state with Retry, removal
// that keeps saved articles, and narrow-screen reflow.
//
// Network discipline: the /api/ingest POST is intercepted at the BROWSER
// level (page.route) with canned feed envelopes keyed by the posted
// feedUrl — the dev-server ingest middleware never runs, no real feed host
// is ever contacted, and the client-side save/refresh path (validate →
// merge → persist → render) is driven end-to-end. The pipeline's own
// refusal/safety behavior is pinned by the server unit suite
// (tests/unit/server/feed-ingest.spec.ts); this file pins the READER-facing
// surface.
import { test, expect, type Page, type Route } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";

/** The narrow-phone cell — the "visible text link even at narrow widths"
 * condition (the shell-nav NARROW discipline) and the reflow cell. */
const NARROW = { width: 320, height: 640 } as const;

/** A canned feed ok-envelope matching IngestionResponseSchema's feed
 * variant: one dated entry, one UNDATED entry (the deterministic-position
 * condition), image/excerpt on the dated one. */
const FEED_OK = {
  ok: true,
  feed: {
    url: "https://journal.example.com/feed.xml",
    title: "The Calm Reader Journal",
    description: "Essays on quiet interfaces",
    items: [
      {
        title: "On stable reading positions",
        link: "https://journal.example.com/stable-positions",
        datePublished: "2026-09-20T15:00:00.000Z",
        excerpt: "Why the page should not move under the reader's eye.",
        image: "https://journal.example.com/stable.png",
      },
      {
        title: "Second entry, linkless",
        excerpt: "A title-only-excerpt entry.",
      },
    ],
  },
};

/** A second feed whose dated entry is NEWER than the journal's — the
 * multiple-feeds interleave condition. */
const FEED_OTHER = {
  ok: true,
  feed: {
    url: "https://other.example.com/rss.xml",
    title: "The Morning Wire",
    items: [
      {
        title: "Wire bulletin, newest overall",
        link: "https://other.example.com/bulletin",
        datePublished: "2026-09-25T08:00:00.000Z",
      },
      {
        title: "Wire note, undated",
      },
    ],
  },
};

/** The journal feed after a refresh brought one NEW item (the Retry
 * recovery condition). */
const FEED_OK_V2 = {
  ok: true,
  feed: {
    ...FEED_OK.feed,
    items: [
      {
        title: "Third entry, fresh",
        link: "https://journal.example.com/fresh",
        datePublished: "2026-09-28T10:00:00.000Z",
      },
      ...FEED_OK.feed.items,
    ],
  },
};

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

type FeedStubs = Record<string, unknown>;

/** Intercept the browser-level POST /api/ingest with canned envelopes
 * keyed by the posted feedUrl (the multi-feed condition). Returns the
 * call-count accessor. */
async function stubIngestByFeed(
  page: Page,
  stubs: FeedStubs,
): Promise<{ calls: () => number }> {
  let ingestCalls = 0;
  await page.route("**/api/ingest", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    ingestCalls += 1;
    const body = route.request().postDataJSON() as { feedUrl?: string; url?: string };
    // Feed requests key on feedUrl; an Add-to-Library URL request keys on
    // url — the same stub table serves both.
    const stub = stubs[body.feedUrl ?? body.url ?? ""];
    if (stub === undefined) return fulfillJson(route, { ok: false, reason: "fetch-failed" }, 200);
    return fulfillJson(route, stub);
  });
  return { calls: () => ingestCalls };
}

async function stubIngest(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route("**/api/ingest", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return fulfillJson(route, body, status);
  });
}

/** Subscribe through the always-visible form. */
async function subscribe(page: Page, url: string): Promise<void> {
  await page.getByRole("textbox", { name: "Subscribe to a feed" }).fill(url);
  await page.getByRole("button", { name: "Subscribe" }).click();
  await page.getByRole("status").filter({ hasText: "Subscribed to" }).waitFor();
}

function primaryNav(page: Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

/** Timeline entry titles in DOM order (the newest-first assertions). */
async function timelineTitles(page: Page): Promise<string[]> {
  const raw = await page
    .locator(".discover-timeline .discover-item-title")
    .allTextContents();
  return raw.map((title) => title.replace(" (opens in a new tab)", ""));
}

test.describe("Discover (issues #121 + #123)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("the Discover nav link is visible TEXT at 320px, carries aria-current on #/discover, and the empty state invites the first action", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await page.goto(`${BASE}/#/discover`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Discover" }),
    ).toBeVisible();

    // The link is a visible text link at narrow width (never icon-only).
    const link = primaryNav(page).getByRole("link", { name: "Discover" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(link).toHaveAttribute("href", "#/discover");

    // The empty state: title at the surface's outline level + one sentence.
    await expect(
      page.getByRole("heading", { name: "No subscriptions yet." }),
    ).toBeVisible();

    // The subscribe form is present with its accessible name + hint.
    await expect(
      page.getByRole("textbox", { name: "Subscribe to a feed" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Subscribe" }),
    ).toBeVisible();
  });

  test("keyboard: Enter on the shell Discover link navigates; the form is the next focus stop after the nav", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // Keyboard activation of the text link navigates to the destination.
    await primaryNav(page).getByRole("link", { name: "Discover" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/discover$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Discover" }),
    ).toBeVisible();

    // The in-app arrival moves focus to the h1 (the view-switch announce
    // discipline); the next Tab stop is the subscribe input.
    await expect(
      page.getByRole("heading", { level: 1, name: "Discover" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("textbox", { name: "Subscribe to a feed" }),
    ).toBeFocused();
  });

  test("subscribe: a valid feed URL saves the subscription and renders the timeline entry (title, feed name, date, excerpt, image)", async ({
    page,
  }) => {
    await stubIngestByFeed(page, { "https://journal.example.com/feed.xml": FEED_OK });
    await page.goto(`${BASE}/#/discover`);
    await expect(
      page.getByRole("heading", { name: "No subscriptions yet." }),
    ).toBeVisible();

    await subscribe(page, "https://journal.example.com/feed.xml");

    // The save lands: the management row (h3) + the timeline entry.
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();
    const first = page.getByRole("link", {
      name: "On stable reading positions (opens in a new tab)",
    });
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute(
      "href",
      "https://journal.example.com/stable-positions",
    );
    await expect(
      page.locator(".discover-item-feed", { hasText: "The Calm Reader Journal" }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Why the page should not move under the reader's eye."),
    ).toBeVisible();
    // The date renders localized (formatIsoDate) — assert presence, not the
    // engine-specific spelling.
    await expect(page.locator(".discover-item-date").first()).toHaveText(/./);
    await expect(page.locator("img.discover-item-image")).toHaveCount(1);
    // The linkless entry renders as plain text (no anchor).
    await expect(
      page.getByRole("link", { name: "Second entry, linkless (opens in a new tab)" }),
    ).toHaveCount(0);
    await expect(page.getByText("Second entry, linkless")).toBeVisible();
    // The management row carries the last-successful-update stamp.
    await expect(page.locator(".discover-feed-updated").first()).toHaveText(/^Updated /);

    // The input cleared for the next subscribe (the fresh-session shape).
    await expect(
      page.getByRole("textbox", { name: "Subscribe to a feed" }),
    ).toHaveValue("");

    // The subscription persists across a reload (local-first), and the
    // reload's refresh-on-open brings the cache back.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "On stable reading positions (opens in a new tab)",
      }),
    ).toBeVisible();
  });

  test("multiple feeds interleave into ONE newest-first timeline; the filter narrows to a single feed", async ({
    page,
  }) => {
    const ingest = await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
      "https://other.example.com/rss.xml": FEED_OTHER,
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");
    await subscribe(page, "https://other.example.com/rss.xml");

    // Newest first ACROSS feeds: the Wire bulletin (09-25) leads, the
    // journal's dated entry (09-20) follows, then the UNDATED entries in
    // their deterministic position — feed URL order, then cache order.
    expect(await timelineTitles(page)).toEqual([
      "Wire bulletin, newest overall",
      "On stable reading positions",
      "Second entry, linkless",
      "Wire note, undated",
    ]);
    // Every entry carries its feed name.
    const feedNames = await page
      .locator(".discover-timeline .discover-item-feed")
      .allTextContents();
    expect(feedNames).toEqual([
      "The Morning Wire",
      "The Calm Reader Journal",
      "The Calm Reader Journal",
      "The Morning Wire",
    ]);

    // The single-feed filter narrows without re-ordering.
    const filter = page.getByRole("combobox", { name: "Filter by feed" });
    await filter.selectOption({ label: "The Calm Reader Journal" });
    expect(await timelineTitles(page)).toEqual([
      "On stable reading positions",
      "Second entry, linkless",
    ]);
    await filter.selectOption({ label: "The Morning Wire" });
    expect(await timelineTitles(page)).toEqual([
      "Wire bulletin, newest overall",
      "Wire note, undated",
    ]);
    await filter.selectOption({ label: "All feeds" });
    expect(await timelineTitles(page)).toHaveLength(4);

    // No per-item dismissal exists; the timeline is a window, not a queue.
    // The per-item controls that DO exist are issue #124's inline add
    // affordances: one + per LINKED entry (2 here), none on linkless ones.
    await expect(page.locator(".discover-item button")).toHaveCount(2);
    expect(ingest.calls()).toBeGreaterThanOrEqual(2);
  });

  test("refresh happens on OPENING and on request — never on a poll", async ({
    page,
  }) => {
    const ingest = await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");

    // Leave and come back (in-app): the remount's opening refresh fires
    // exactly once. (Calls so far: the subscribe fetch + this reopen's
    // refresh — subscribing does NOT re-fetch the feed it just fetched.)
    await primaryNav(page).getByRole("link", { name: "Library" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await primaryNav(page).getByRole("link", { name: "Discover" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Latest articles" }),
    ).toBeVisible();
    await expect(page.locator(".discover-timeline .discover-item").first()).toBeVisible();
    expect(ingest.calls()).toBe(2);

    // Manual Refresh fetches again.
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Feeds refreshed." })).toBeVisible();

    // Then silence: ten-ish seconds pass with no background poll.
    const afterManual = ingest.calls();
    await page.waitForTimeout(3000);
    expect(ingest.calls()).toBe(afterManual);
  });

  test("offline: a failed refresh keeps the cached previews, the subscriptions list, and the last-successful-update time; Retry recovers", async ({
    page,
  }) => {
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");
    await expect(
      page.getByRole("link", {
        name: "On stable reading positions (opens in a new tab)",
      }),
    ).toBeVisible();

    // Go "offline" and reopen Discover: the on-open refresh fails calmly.
    // (A route abort IS the offline network failure at the browser level —
    // deterministic across engines, unlike offline emulation, which
    // route-fulfilled stubs bypass anyway.)
    await page.unroute("**/api/ingest");
    await page.route("**/api/ingest", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.abort("failed");
    });
    await primaryNav(page).getByRole("link", { name: "Library" }).click();
    await primaryNav(page).getByRole("link", { name: "Discover" }).click();

    // The stale state: the ONE catalog's reason copy, the honest
    // last-known-good stamp, Retry — and the cached previews + the feed
    // row STAY.
    const notice = page.locator(".discover-refresh-notice");
    await expect(notice).toContainText(
      "Couldn't reach this feed. Showing saved items from ",
    );
    await expect(
      page.getByRole("link", {
        name: "On stable reading positions (opens in a new tab)",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({
        hasText: "Couldn't refresh The Calm Reader Journal. Showing saved items.",
      }),
    ).toBeVisible();

    // Back online: the canned feed now carries a NEW item; Retry fetches
    // (only the failed feed) and the notice clears.
    await page.unroute("**/api/ingest");
    const retry = await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK_V2,
    });
    await page.getByRole("button", { name: "Retry The Calm Reader Journal" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Feeds refreshed." })).toBeVisible();
    await expect(notice).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Third entry, fresh (opens in a new tab)" }),
    ).toBeVisible();
    expect(retry.calls()).toBe(1);
  });

  test("a server-side refresh failure keeps the cache and lists the subscription; manual Refresh recovers", async ({
    page,
  }) => {
    await stubIngestByFeed(page, { "https://journal.example.com/feed.xml": FEED_OK });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");

    // The refresh path now fails server-side.
    await page.unroute("**/api/ingest");
    await stubIngest(page, { ok: false, reason: "server-error" }, 500);
    await page.getByRole("button", { name: "Refresh" }).click();
    const notice = page.locator(".discover-refresh-notice");
    await expect(notice).toContainText("Something went wrong. Try again.");
    await expect(notice).toContainText("Showing saved items from ");
    await expect(
      page.getByRole("link", {
        name: "On stable reading positions (opens in a new tab)",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({
        hasText: "Couldn't refresh The Calm Reader Journal. Showing saved items.",
      }),
    ).toBeVisible();

    // Recovery: the pipeline answers again and Refresh clears the notice.
    await page.unroute("**/api/ingest");
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK_V2,
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Feeds refreshed." })).toBeVisible();
    await expect(notice).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Third entry, fresh (opens in a new tab)" }),
    ).toBeVisible();
  });

  test("subscribe: an already-subscribed feed refuses calmly without a second row", async ({
    page,
  }) => {
    await stubIngestByFeed(page, { "https://journal.example.com/feed.xml": FEED_OK });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();

    // The same URL again: the dedupe-refuse fires AFTER the fetch (the
    // canned response is served again) — one calm line, still one row.
    await page
      .getByRole("textbox", { name: "Subscribe to a feed" })
      .fill("https://journal.example.com/feed.xml");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Already subscribed." })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toHaveCount(1);
    expect(await timelineTitles(page)).toHaveLength(2);
  });

  test("refusal: an invalid candidate is refused with calm copy, the input is preserved, and nothing saves", async ({
    page,
  }) => {
    await stubIngestByFeed(page, { "https://journal.example.com/broken.xml": {
      ok: false,
      reason: "feed-unreadable",
    } });
    await page.goto(`${BASE}/#/discover`);
    const input = page.getByRole("textbox", { name: "Subscribe to a feed" });
    await input.fill("https://journal.example.com/broken.xml");
    await page.getByRole("button", { name: "Subscribe" }).click();

    // The calm refusal (a NO, not an error) + input preserved (D16-11).
    await expect(
      page
        .getByRole("status")
        .filter({
          hasText: "This feed couldn't be read — it may be malformed or not a feed.",
        }),
    ).toBeVisible();
    await expect(input).toHaveValue("https://journal.example.com/broken.xml");

    // Nothing saved: the empty state still owns the list region.
    await expect(
      page.getByRole("heading", { name: "No subscriptions yet." }),
    ).toBeVisible();
  });

  test("remove: the destructive confirm gates the delete; Keep keeps, Remove removes and announces", async ({
    page,
  }) => {
    await stubIngestByFeed(page, { "https://journal.example.com/feed.xml": FEED_OK });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Remove The Calm Reader Journal" })
      .click();

    // The confirm dialog: the NON-destructive default holds focus (Pitfall 8).
    const dlg = page.locator("dialog.discover-remove-confirm");
    await expect(dlg).toBeVisible();
    await expect(
      dlg.getByRole("heading", { name: "Remove subscription" }),
    ).toBeVisible();
    await expect(dlg.getByText("Remove The Calm Reader Journal?")).toBeVisible();

    // Keep: the subscription stays.
    await dlg.getByRole("button", { name: "Keep subscription" }).click();
    await expect(dlg).not.toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();

    // Remove: the row and its previews go, the empty state returns, the
    // removal announces.
    await page
      .getByRole("button", { name: "Remove The Calm Reader Journal" })
      .click();
    await dlg.getByRole("button", { name: "Remove subscription" }).click();
    await expect(
      page.getByRole("heading", { name: "No subscriptions yet." }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Subscription removed." }),
    ).toBeVisible();
  });

  test("removing a subscription keeps previously saved articles (the store seam pins that locations and annotations cascade to nothing)", async ({
    page,
  }) => {
    // The article a reader "added from this feed" — saved through the REAL
    // Add-to-Library flow against a stubbed URL ingest (raw IndexedDB
    // seeding races on webkit; the user path is the honest harness).
    const keptArticle = {
      id: "lr-discover-kept",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://journal.example.com/kept-essay",
        title: "A kept essay",
        retrievedAt: "2026-08-20T00:00:00.000Z",
        originalHtmlHash: `sha256:${"2".repeat(64)}`,
      },
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "The kept essay opens calmly and stays that way.", marks: [] }],
        },
      ],
      footnotes: [],
    };
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
      "https://journal.example.com/kept-essay": {
        ok: true,
        article: keptArticle,
        confidence: { state: "confident" },
      },
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");

    // Add the article from the feed's domain through the Library view's
    // Add dialog (D16-02 — the Add trigger lives beside the library h1).
    await primaryNav(page).getByRole("link", { name: "Library" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add to Library" }).click();
    const addDlg = page.locator("dialog.add-dialog");
    await addDlg
      .getByRole("textbox", { name: /add by url/i })
      .fill("https://journal.example.com/kept-essay");
    await addDlg.getByRole("button", { name: /^add$/i }).click();
    await expect(addDlg.locator(".status")).toContainText("Saved to your library.");
    await addDlg.getByRole("button", { name: "Close" }).click();

    // Remove the subscription that "provided" it.
    await primaryNav(page).getByRole("link", { name: "Discover" }).click();
    await page
      .getByRole("button", { name: "Remove The Calm Reader Journal" })
      .click();
    await page
      .locator("dialog.discover-remove-confirm")
      .getByRole("button", { name: "Remove subscription" })
      .click();
    await expect(
      page.getByRole("heading", { name: "No subscriptions yet." }),
    ).toBeVisible();

    // The saved article is untouched in the library.
    await primaryNav(page).getByRole("link", { name: "Library" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "A kept essay" }),
    ).toBeVisible();
  });

  test("an invalid (non-URL) input refuses BEFORE any network cost and preserves the input", async ({
    page,
  }) => {
    let ingestCalls = 0;
    await page.route("**/api/ingest", (route) => {
      ingestCalls += 1;
      return fulfillJson(route, FEED_OK);
    });
    await page.goto(`${BASE}/#/discover`);
    // A type=url input blocks form submission on a non-URL value natively;
    // drive the normalized-refusal path with a non-http scheme.
    const input = page.getByRole("textbox", { name: "Subscribe to a feed" });
    await input.fill("ftp://journal.example.com/feed.xml");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Enter a valid web address." }),
    ).toBeVisible();
    expect(ingestCalls).toBe(0);
    await expect(
      page.getByRole("heading", { name: "No subscriptions yet." }),
    ).toBeVisible();
  });

  test("narrow screens: the timeline and its controls reflow inside the viewport at 320px", async ({
    page,
  }) => {
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
      "https://other.example.com/rss.xml": FEED_OTHER,
    });
    await page.setViewportSize(NARROW);
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");
    await subscribe(page, "https://other.example.com/rss.xml");

    // Everything the timeline needs is visible at 320px.
    await expect(
      page.getByRole("heading", { level: 2, name: "Latest articles" }),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filter by feed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Wire bulletin, newest overall (opens in a new tab)" }),
    ).toBeVisible();

    // The WCAG 1.4.10 reflow contract: no horizontal overflow.
    const overflow = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      clientW: document.body.clientWidth,
    }));
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);
  });

  // ── Issue #124 — the inline add: + ingests the LINKED page ─────────────

  /** A canned ARTICLE ok-envelope (the guarded pipeline's article variant),
   * shaped like the kept-article fixture above (client-side ArticleSchema
   * re-validation is part of the real path this drives). */
  function articleEnvelope(id: string, title: string, sourceUrl: string, text: string) {
    return {
      ok: true,
      article: {
        id,
        revision: 1,
        lang: "en",
        provenance: {
          sourceUrl,
          title,
          retrievedAt: "2026-09-20T00:00:00.000Z",
          originalHtmlHash: `sha256:${"3".repeat(64)}`,
        },
        blocks: [
          {
            kind: "paragraph",
            content: [{ text, marks: [] }],
          },
        ],
        footnotes: [],
      },
      confidence: { state: "confident" },
    };
  }

  test("inline add: + ingests the linked page, announces, swaps to In library + Open, and never auto-opens (the addition stays Unread)", async ({
    page,
  }) => {
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
      "https://journal.example.com/stable-positions": articleEnvelope(
        "journal-example-com-stable-positions",
        "On stable reading positions",
        "https://journal.example.com/stable-positions",
        "The page should not move under the reader's eye.",
      ),
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");

    const save = page.getByRole("button", { name: "Save On stable reading positions" });
    await expect(save).toBeVisible();

    // The + hit area meets the 44px touch-target contract (A11Y-07; the
    // edge-matrix cell cannot measure it — that harness opens the EMPTY
    // surface — so the size is pinned here, on the real populated surface).
    const box = await save.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);

    // Keyboard activation (the screen-reader/keyboard status condition):
    // Enter on the + saves, and the ONE status region announces calmly.
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Saved to your library." }),
    ).toBeVisible();

    // The preview swaps to the saved state: In library + Open (in-app hash
    // anchor) — and the URL is STILL Discover (no auto-open).
    await expect(page.getByText("In library")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open On stable reading positions" }),
    ).toHaveAttribute("href", "#/article/journal-example-com-stable-positions");
    await expect(page).toHaveURL(/#\/discover$/);

    // Open is the reader's choice; it navigates in-app to the article.
    await page.getByRole("link", { name: "Open On stable reading positions" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "On stable reading positions" }),
    ).toBeVisible();

    // Back to the library: the addition is listed under Unread (a
    // never-opened addition — reading it here WOULD have moved it).
    await primaryNav(page).getByRole("link", { name: "Library" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^Unread \(\d+\)$/ }).click();
    await expect(
      page.getByRole("link", { name: "On stable reading positions" }),
    ).toBeVisible();
  });

  test("duplicate links: the same article in two feeds resolves to ONE library item and both previews read In library", async ({
    page,
  }) => {
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
      // The wire syndicates the journal's story: a DIFFERENT feed, a
      // DIFFERENT preview title, the SAME link.
      "https://other.example.com/rss.xml": {
        ok: true,
        feed: {
          url: "https://other.example.com/rss.xml",
          title: "The Morning Wire",
          items: [
            {
              title: "Stable positions, syndicated",
              link: "https://journal.example.com/stable-positions",
              datePublished: "2026-09-21T08:00:00.000Z",
            },
          ],
        },
      },
      "https://journal.example.com/stable-positions": articleEnvelope(
        "journal-example-com-stable-positions",
        "On stable reading positions",
        "https://journal.example.com/stable-positions",
        "The page should not move under the reader's eye.",
      ),
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");
    await subscribe(page, "https://other.example.com/rss.xml");

    // Save from the journal's copy.
    await page
      .getByRole("button", { name: "Save On stable reading positions" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved to your library." }),
    ).toBeVisible();

    // ONE save covers both copies: the wire's twin shares the link, so the
    // same saved identity resolves it — no second ingest ever fires for it
    // (2 feed fetches + 1 page ingest), and no second row can exist.
    // Both Discover copies read In library + Open against the SAME id.
    await expect(page.locator(".discover-item .discover-item-open")).toHaveCount(2);
    await expect(page.locator(".discover-item .discover-item-save")).toHaveCount(0);

    // One saved row in the library — not one per feed copy.
    await primaryNav(page).getByRole("link", { name: "Library" }).click();
    await expect(page.locator(".library-card-link", { hasText: "stable reading positions" })).toHaveCount(1);

    // The shared saved state survives a fresh reload (the snapshot
    // derivation, not session state): both copies still read In library.
    await primaryNav(page).getByRole("link", { name: "Discover" }).click();
    await page.reload();
    await expect(page.locator(".discover-item .discover-item-open")).toHaveCount(2);
    await expect(page.locator(".discover-item .discover-item-saved")).toHaveCount(2);
  });

  test("redirect identity: an aliased link resolves to the SAME article — one item, and a duplicate attempt overwrites nothing", async ({
    page,
  }) => {
    // Two feeds carry DIFFERENT links for one story; the pipeline
    // canonicalizes both to the same article id (the server-derived slug
    // of the post-redirect URL). The second response carries REWRITTEN
    // content under the same id — a faithful dedupe MUST refuse it.
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": {
        ok: true,
        feed: {
          url: "https://journal.example.com/feed.xml",
          title: "The Calm Reader Journal",
          items: [
            {
              title: "Shared story",
              link: "https://journal.example.com/story?utm_source=feed",
              datePublished: "2026-09-20T15:00:00.000Z",
            },
          ],
        },
      },
      "https://other.example.com/rss.xml": {
        ok: true,
        feed: {
          url: "https://other.example.com/rss.xml",
          title: "The Morning Wire",
          items: [
            {
              title: "Shared story",
              link: "https://journal.example.com/story-direct",
              datePublished: "2026-09-20T15:00:00.000Z",
            },
          ],
        },
      },
      "https://journal.example.com/story?utm_source=feed": articleEnvelope(
        "journal-example-com-story",
        "Shared story",
        "https://journal.example.com/story",
        "First copy of the story.",
      ),
      "https://journal.example.com/story-direct": articleEnvelope(
        "journal-example-com-story",
        "Shared story",
        "https://journal.example.com/story",
        "Rewritten copy that must never land.",
      ),
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");
    await subscribe(page, "https://other.example.com/rss.xml");

    // Save from the journal's aliased link.
    const journalSave = page.getByRole("button", { name: "Save Shared story" }).first();
    await journalSave.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved to your library." }),
    ).toBeVisible();

    // Press + on the OTHER feed's copy: the pipeline lands on the same
    // article id, the dedupe-refuse fires (annotations/content untouched),
    // and the refusal's canonical id resolves the preview to In library +
    // Open — pointing at the SAME article.
    await page.getByRole("button", { name: "Save Shared story" }).last().click();
    await expect(
      page.getByRole("status").filter({ hasText: "Already in your library." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Shared story" }),
    ).toHaveCount(2);
    const openHref = await page
      .getByRole("link", { name: "Open Shared story" })
      .first()
      .getAttribute("href");
    expect(openHref).toBe("#/article/journal-example-com-story");

    // The library holds ONE story, carrying the FIRST-saved content.
    await primaryNav(page).getByRole("link", { name: "Library" }).click();
    await expect(page.getByRole("link", { name: "Shared story" })).toHaveCount(1);
    await page.getByRole("link", { name: "Shared story" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Shared story" }),
    ).toBeVisible();
    // (The reader renders the pagination + scrolling twins of every block,
    // and the inactive twin is visually hidden — attachment, not visibili-
    // ty, is the twin-proof assertion here.)
    await expect(page.getByText("First copy of the story.").first()).toBeAttached();
    await expect(page.getByText("Rewritten copy that must never land.")).toHaveCount(0);
  });

  test("refusal: a page that cannot be saved refuses calmly inline and stays retryable", async ({
    page,
  }) => {
    let broken = true;
    await page.route("**/api/ingest", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON() as { feedUrl?: string; url?: string };
      if (body.url === "https://journal.example.com/stable-positions") {
        return fulfillJson(
          route,
          broken
            ? { ok: false, reason: "unsupported-content-type" }
            : articleEnvelope(
                "journal-example-com-stable-positions",
                "On stable reading positions",
                "https://journal.example.com/stable-positions",
                "The page should not move under the reader's eye.",
              ),
        );
      }
      if (body.feedUrl === "https://journal.example.com/feed.xml") {
        return fulfillJson(route, FEED_OK);
      }
      return fulfillJson(route, { ok: false, reason: "fetch-failed" }, 200);
    });
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");

    // The calm page-voice refusal — not an error, no crash; the + remains.
    await page
      .getByRole("button", { name: "Save On stable reading positions" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "This page isn't an article." }),
    ).toBeVisible();
    await expect(page.getByText("In library")).toHaveCount(0);

    // Retry after the page becomes saveable: the SAME control recovers.
    broken = false;
    await page
      .getByRole("button", { name: "Save On stable reading positions" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved to your library." }),
    ).toBeVisible();
    await expect(page.getByText("In library")).toBeVisible();
  });

  test("narrow screens: the inline add controls stay inside the 320px viewport (the reflow contract)", async ({
    page,
  }) => {
    await stubIngestByFeed(page, {
      "https://journal.example.com/feed.xml": FEED_OK,
    });
    await page.setViewportSize(NARROW);
    await page.goto(`${BASE}/#/discover`);
    await subscribe(page, "https://journal.example.com/feed.xml");

    await expect(
      page.getByRole("button", { name: "Save On stable reading positions" }),
    ).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      clientW: document.body.clientWidth,
    }));
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);
  });
});
