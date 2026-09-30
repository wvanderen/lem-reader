// tests/e2e/discover/discover.spec.ts
// Issue #121 — the Discover destination end-to-end: the visible text nav
// link at narrow widths, the empty state, the accessible URL subscription
// flow (happy path, already-subscribed dedupe, refusal), the bounded
// preview rendering, the remove flow, and keyboard navigation.
//
// Network discipline: the /api/ingest POST is intercepted at the BROWSER
// level (page.route) with canned feed envelopes — the dev-server ingest
// middleware never runs, no real feed host is ever contacted, and the
// client-side save path (validate → dedupe → persist → render) is driven
// end-to-end. The pipeline's own refusal/safety behavior is pinned by the
// server unit suite (tests/unit/server/feed-ingest.spec.ts); this file
// pins the READER-facing surface.
import { test, expect, type Page, type Route } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";

/** The narrow-phone cell — the "visible text link even at narrow widths"
 * condition (the shell-nav NARROW discipline). */
const NARROW = { width: 320, height: 640 } as const;

/** A canned feed ok-envelope matching IngestionResponseSchema's feed
 * variant (the titles/dates the assertions below pin). */
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

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Intercept the browser-level POST /api/ingest with a canned envelope. */
async function stubIngest(
  page: Page,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.route("**/api/ingest", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return fulfillJson(route, body, status);
  });
}

function primaryNav(page: Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

test.describe("Discover (issue #121)", () => {
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

  test("subscribe: a valid feed URL saves the subscription and renders the bounded previews (title, date, excerpt, image)", async ({
    page,
  }) => {
    await stubIngest(page, FEED_OK);
    await page.goto(`${BASE}/#/discover`);
    await expect(
      page.getByRole("heading", { name: "No subscriptions yet." }),
    ).toBeVisible();

    await page
      .getByRole("textbox", { name: "Subscribe to a feed" })
      .fill("https://journal.example.com/feed.xml");
    await page.getByRole("button", { name: "Subscribe" }).click();

    // The save lands: the empty state is replaced by the subscription row.
    await expect(
      page.getByRole("heading", { level: 2, name: "The Calm Reader Journal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Subscribed to The Calm Reader Journal." }),
    ).toBeVisible();

    // The bounded recent previews: title (+ external link), date, excerpt,
    // image — and the feed's own normalized link line.
    const first = page.getByRole("link", {
      name: "On stable reading positions (opens in a new tab)",
    });
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute(
      "href",
      "https://journal.example.com/stable-positions",
    );
    await expect(
      page.getByText("Why the page should not move under the reader's eye."),
    ).toBeVisible();
    // The date renders localized (formatIsoDate) — assert presence, not the
    // engine-specific spelling.
    await expect(page.locator(".discover-item-date")).toHaveText(
      /./,
    );
    await expect(
      page.locator("img.discover-item-image"),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", {
        name: "Second entry, linkless (opens in a new tab)",
      }),
    ).toHaveCount(0); // no link → the title renders as plain text
    await expect(page.getByText("Second entry, linkless")).toBeVisible();

    // The input cleared for the next subscribe (the fresh-session shape).
    await expect(
      page.getByRole("textbox", { name: "Subscribe to a feed" }),
    ).toHaveValue("");

    // The subscription persists across a reload (local-first).
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 2, name: "The Calm Reader Journal" }),
    ).toBeVisible();
  });

  test("subscribe: an already-subscribed feed refuses calmly without a second row", async ({
    page,
  }) => {
    await stubIngest(page, FEED_OK);
    await page.goto(`${BASE}/#/discover`);
    const input = page.getByRole("textbox", { name: "Subscribe to a feed" });
    await input.fill("https://journal.example.com/feed.xml");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "The Calm Reader Journal" }),
    ).toBeVisible();

    // The same URL again: the dedupe-refuse fires AFTER the fetch (the
    // canned response is served again) — one calm line, still one row.
    await input.fill("https://journal.example.com/feed.xml");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Already subscribed." })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "The Calm Reader Journal" }),
    ).toHaveCount(1);
  });

  test("refusal: an invalid candidate is refused with calm copy, the input is preserved, and nothing saves", async ({
    page,
  }) => {
    await stubIngest(page, { ok: false, reason: "feed-unreadable" });
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
    await stubIngest(page, FEED_OK);
    await page.goto(`${BASE}/#/discover`);
    await page
      .getByRole("textbox", { name: "Subscribe to a feed" })
      .fill("https://journal.example.com/feed.xml");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "The Calm Reader Journal" }),
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
      page.getByRole("heading", { level: 2, name: "The Calm Reader Journal" }),
    ).toBeVisible();

    // Remove: the row goes, the empty state returns, the removal announces.
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
});
