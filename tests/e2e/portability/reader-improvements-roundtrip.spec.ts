// tests/e2e/portability/reader-improvements-roundtrip.spec.ts
// Issue #125 AC2 — the reader-improvements release's fields ride the REAL
// Settings export → import journey with zero silent loss and zero
// unexpected network access:
//   - a feed subscription (issue #121/#122: RSS + Atom rows, previews in
//     tow) survives export → wipe-fresh device → import, WITHOUT any
//     request leaving the dev origin (the import's "no network" contract,
//     e2e-proven — the unit suite pins the fetch-throw twin);
//   - the library sort choice (issue #115) travels and re-applies (the
//     toolbar select shows Title on machine B);
//   - BOTH custom slots (issue #120 — custom light AND custom dark
//     records) travel verbatim and re-apply (data-theme + the traveled
//     --surface token);
//   - highlight metadata (issue #116 tags + issue #118 named color) rides
//     the highlight rows; default rows hydrate honestly (color "default",
//     tags []);
//   - addedAt (issue #114) rides a dated article; an undated one stays
//     undated (never fabricated);
//   - an OLDER bundle (schemaVersion 5, subscriptions key absent — the
//     pre-#121 writer shape) imports on a device that HAS a subscription
//     and leaves that subscription untouched (the honest union read —
//     never a silent wipe).
// Two browser contexts ARE the two machines (the round-trip.spec.ts
// discipline); the network guard aborts and RECORDS every request that
// leaves the dev origin, so "no unexpected network access" is asserted,
// not assumed.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import {
  BASE,
  buildBundleZip,
  confidentHighlightOn,
  countRows,
  highlightRow,
  makeArticle,
  openSettings,
  prepareFreshPage,
  readBundleJson,
  readRow,
  seedRows,
  settingsStatus,
} from "./_portability";

const DATED_ARTICLE = ArticleSchema.parse({
  ...makeArticle({
    id: "ri-rt-dated01",
    title: "Dated Round Trip Article",
    paragraphs: [
      "The dated round trip article opens with a sentence distinctive enough for confident anchoring on every engine that runs this suite, because grapheme segmentation over plain ASCII prose is engine identical.",
      "Its second paragraph exists so the resolver walk has unique trailing material and the passage lifted for the highlight can never collide with any other seeded row.",
    ],
  }),
  addedAt: "2026-03-01T09:30:00.000Z",
});

const UNDATED_ARTICLE = makeArticle({
  id: "ri-rt-undated",
  title: "Undated Round Trip Article",
  paragraphs: [
    "The undated round trip article carries no addedAt stamp at all, and the import must leave it that way rather than fabricating a date the reader never chose.",
    "A second paragraph keeps the normalized stream long enough for the highlight anchor to resolve with confidence.",
  ],
});

const COLORED_ARTICLE = DATED_ARTICLE; // the colored highlight anchors here

/** Distinctive custom-slot tokens (strict 6-digit hex) — machine B's
 * re-application is asserted down to the applied --surface value. */
const CUSTOM_LIGHT = {
  baseTheme: "light",
  tokens: {
    surface: "#eef6fc",
    surfaceRaised: "#dcebf7",
    ink: "#0b2545",
    accent: "#1d4e89",
    hairline: "#bcd6ea",
  },
} as const;
const CUSTOM_DARK = {
  baseTheme: "dark",
  tokens: {
    surface: "#12161c",
    surfaceRaised: "#1c232d",
    ink: "#e9e7e4",
    accent: "#e0a80d",
    hairline: "#303b49",
  },
} as const;

const SEEDED_PREFS = {
  schemaVersion: 5,
  font: "serif",
  size: 20,
  measure: 70,
  spacing: "spacious",
  theme: "custom-light",
  customLightTheme: CUSTOM_LIGHT,
  customDarkTheme: CUSTOM_DARK,
  readingMode: "scrolling",
  rate: 1.5,
  librarySort: "title",
} as const;

const RSS_SUB = {
  schemaVersion: 1,
  id: "sub-rt-rss01",
  feedUrl: "https://journal.example.com/feed.xml",
  title: "The Calm Reader Journal",
  items: [
    {
      title: "On stable reading positions",
      link: "https://journal.example.com/stable-positions",
      datePublished: "2026-09-20T15:00:00.000Z",
      excerpt: "Why the page should not move under the reader's eye.",
    },
  ],
  subscribedAt: "2026-09-21T08:00:00.000Z",
  lastFetchedAt: "2026-09-25T08:00:00.000Z",
};

const ATOM_SUB = {
  schemaVersion: 1,
  id: "sub-rt-atom01",
  feedUrl: "https://other.example.org/atom.xml",
  title: "The Morning Wire",
  items: [
    {
      title: "Wire bulletin, newest overall",
      link: "https://other.example.org/bulletin",
      datePublished: "2026-09-25T08:00:00.000Z",
    },
  ],
  subscribedAt: "2026-09-22T10:00:00.000Z",
};

/** Seed local subscriptions through one strict transaction boundary. */
async function seedSubscriptions(page: Page, rows: Array<typeof RSS_SUB | typeof ATOM_SUB>) {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("lem-reader");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("subscriptions")) {
          db.close();
          reject(new Error("Subscriptions store is missing"));
          return;
        }
        const transaction = db.transaction("subscriptions", "readwrite");
        for (const row of rows) transaction.objectStore("subscriptions").put(row);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, rows);
}

test("RI-RT — reader-improvements fields survive the real export → import journey", async ({
  browser,
}) => {
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // ── Machine A: seed every reader-improvements field ───────────────────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);

    const anchorColored = confidentHighlightOn(COLORED_ARTICLE);
    const anchorPlain = confidentHighlightOn(UNDATED_ARTICLE);

    await seedRows(pageA, {
      articles: [DATED_ARTICLE, UNDATED_ARTICLE],
      highlights: [
        {
          ...highlightRow(DATED_ARTICLE.id, anchorColored, "hl-ri-colored"),
          tags: ["harbor", "keeper"],
          color: "green",
        },
        highlightRow(UNDATED_ARTICLE.id, anchorPlain, "hl-ri-plain"),
      ],
      settings: [{ key: "reader-prefs", value: SEEDED_PREFS }],
    });
    await seedSubscriptions(pageA, [RSS_SUB, ATOM_SUB]);

    // ── Machine A: export through the real UI ─────────────────────────────
    const panelA = await openSettings(pageA);
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    const bundlePath = await download.path();
    expect(bundlePath).toBeTruthy();

    // ── Node-side: the v6 writer carries every new field verbatim ─────────
    const { bundle } = readBundleJson(bundlePath!);
    expect(bundle.schemaVersion).toBe(6);
    // The export orders subscriptions by feedUrl — compare as an id-keyed
    // map so the assertion is order-independent.
    expect(
      Object.fromEntries(
        (bundle.subscriptions as Array<Record<string, unknown>>).map((s) => [s.id, s]),
      ),
    ).toEqual(Object.fromEntries([RSS_SUB, ATOM_SUB].map((s) => [s.id, s])));
    expect(bundle.preferences).toEqual(SEEDED_PREFS);
    const articles = bundle.articles as Array<{
      id: string;
      addedAt?: string;
    }>;
    expect(articles.find((a) => a.id === DATED_ARTICLE.id)?.addedAt).toBe(
      "2026-03-01T09:30:00.000Z",
    );
    expect(
      articles.find((a) => a.id === UNDATED_ARTICLE.id)?.addedAt,
      "an undated article must not fabricate an addedAt",
    ).toBeUndefined();
    const highlights = bundle.highlights as Array<{
      id: string;
      color?: string;
      tags?: string[];
    }>;
    expect(highlights.find((h) => h.id === "hl-ri-colored")).toMatchObject({
      color: "green",
      tags: ["harbor", "keeper"],
    });

    // ── Machine B: guarded import through the real UI ─────────────────────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);

    // The network guard: record + abort EVERY request that leaves the dev
    // origin. Registered per-page, after prepareFreshPage's image stubs, so
    // the whole import + verification window is covered. (The unit suite's
    // fetch-throw twin pins the same contract at the service boundary.)
    const offOrigin: string[] = [];
    let ingestCalls = 0;
    await pageB.route("**/api/ingest", (route) => {
      ingestCalls += 1;
      return route.abort();
    });
    await pageB.route("**/*", (route) => {
      const url = route.request().url();
      if (new URL(url).origin !== new URL(BASE).origin) {
        offOrigin.push(url);
        return route.abort();
      }
      return route.fallback();
    });

    // Prove the catch-all delegates to the ingest guard before relying on
    // its zero-call assertion. This deliberate probe must never hit the server.
    await pageB.evaluate(() => fetch("/api/ingest", { method: "POST" }).catch(() => null));
    expect(ingestCalls).toBe(1);
    ingestCalls = 0;

    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);
    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 2 articles, 2 highlights, 0 notes, and 0 reading positions.",
    );
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 2 articles, 2 highlights, 0 notes, and 0 reading positions.",
      { timeout: 15_000 },
    );

    // THE no-network claim: the import itself touched nothing — no feed
    // host, no ingest endpoint, nothing off the dev origin.
    expect(offOrigin, `off-origin requests during import: ${offOrigin.join(", ")}`).toEqual([]);
    expect(ingestCalls).toBe(0);

    // ── Machine B: raw IndexedDB truth ─────────────────────────────────────
    // Subscriptions restored with their preview caches.
    expect(await countRows(pageB, "subscriptions")).toBe(2);
    const rssRow = await readRow(pageB, "subscriptions", RSS_SUB.id);
    expect(rssRow).toMatchObject({
      feedUrl: RSS_SUB.feedUrl,
      title: RSS_SUB.title,
      subscribedAt: RSS_SUB.subscribedAt,
      lastFetchedAt: RSS_SUB.lastFetchedAt,
    });
    expect(rssRow?.items).toEqual(RSS_SUB.items);
    const atomRow = await readRow(pageB, "subscriptions", ATOM_SUB.id);
    expect(atomRow?.feedUrl).toBe(ATOM_SUB.feedUrl);

    // Preferences re-applied: sort choice + BOTH custom slots verbatim.
    const prefsRow = await readRow(pageB, "settings", "reader-prefs");
    expect(prefsRow?.value).toMatchObject({
      librarySort: "title",
      theme: "custom-light",
      customLightTheme: CUSTOM_LIGHT,
      customDarkTheme: CUSTOM_DARK,
    });

    // Highlight metadata traveled; the plain row hydrated honestly.
    const coloredRow = await readRow(pageB, "highlights", "hl-ri-colored");
    expect(coloredRow).toMatchObject({ color: "green", tags: ["harbor", "keeper"] });
    const plainRow = await readRow(pageB, "highlights", "hl-ri-plain");
    expect(plainRow).toMatchObject({ color: "default", tags: [] });
    expect((plainRow!.position as { start: number }).start).toBe(anchorPlain.position.start);

    // addedAt: the dated stamp re-lands; the undated article stays undated.
    const datedRow = await readRow(pageB, "articles", DATED_ARTICLE.id);
    expect(datedRow?.addedAt).toBe("2026-03-01T09:30:00.000Z");
    const undatedRow = await readRow(pageB, "articles", UNDATED_ARTICLE.id);
    expect(undatedRow?.addedAt).toBeUndefined();

    // ── Machine B: the traveled state is FUNCTIONAL ────────────────────────
    // A fresh load is the settings hydration point (the running app booted
    // before the import) — reload, then the sort control shows the traveled
    // choice (issue #115).
    await pageB.reload();
    await expect(pageB.getByRole("heading", { name: "Saved articles" })).toBeVisible();
    await expect(pageB.locator("#library-sort")).toHaveValue("title");
    // The active custom-light slot re-applied (issue #120): the document
    // theme attribute and the traveled --surface token agree.
    const appliedTheme = await pageB.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      surface: document.documentElement.style.getPropertyValue("--surface").trim(),
    }));
    expect(appliedTheme.theme).toBe("custom-light");
    expect(appliedTheme.surface).toBe(CUSTOM_LIGHT.tokens.surface);

    // Discover lists BOTH subscriptions from the LOCAL rows (the preview
    // caches rode the bundle) — still zero off-origin requests, and the
    // ingest endpoint was never called by an import (only an explicit
    // surface refresh may call it, and even that stays on-origin).
    await pageB.goto(`${BASE}/#/discover`);
    await expect(
      pageB.getByRole("heading", { level: 3, name: "The Calm Reader Journal" }),
    ).toBeVisible();
    await expect(pageB.getByRole("heading", { level: 3, name: "The Morning Wire" })).toBeVisible();
    await expect(pageB.getByRole("heading", { level: 2, name: "Latest articles" })).toBeVisible();
    expect(offOrigin, `off-origin requests overall: ${offOrigin.join(", ")}`).toEqual([]);
  } finally {
    await machineA.close();
    await machineB.close();
  }
});

test("RI-RT — a pre-#121 (schemaVersion 5) bundle imports without touching local subscriptions", async ({
  browser,
}) => {
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // Node-side: hand-build a v5-era bundle — the subscriptions key ABSENT,
    // exactly what the pre-#121 writer emitted.
    const v5Bundle = await buildBundleZip({
      schemaVersion: 5,
      exportedAt: "2026-08-15T00:00:00.000Z",
      appVersion: "0.1.0",
      articles: [DATED_ARTICLE, UNDATED_ARTICLE],
      books: [],
      highlights: [
        {
          ...highlightRow(DATED_ARTICLE.id, confidentHighlightOn(COLORED_ARTICLE), "hl-v5-a"),
        },
      ],
      notes: [],
      locations: [],
      preferences: { ...SEEDED_PREFS },
      readingSessions: [],
      fixtureIds: [],
    });

    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);

    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    // Machine B already has a LOCAL subscription (subscribed after export
    // was generated elsewhere — the merge scenario's local-wins side).
    await seedSubscriptions(pageB, [RSS_SUB]);

    const panelB = await openSettings(pageB);
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "v5-era.zip",
      mimeType: "application/zip",
      buffer: v5Bundle,
    });
    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText("Imported", { timeout: 15_000 });

    // The articles imported; the LOCAL subscription was left byte-untouched
    // (the honest union read — an older bundle never wipes newer fields).
    expect(await readRow(pageB, "articles", DATED_ARTICLE.id)).not.toBeNull();
    expect(await countRows(pageB, "subscriptions")).toBe(1);
    expect(await readRow(pageB, "subscriptions", RSS_SUB.id)).toMatchObject({
      feedUrl: RSS_SUB.feedUrl,
      subscribedAt: RSS_SUB.subscribedAt,
    });
  } finally {
    await machineA.close();
    await machineB.close();
  }
});
