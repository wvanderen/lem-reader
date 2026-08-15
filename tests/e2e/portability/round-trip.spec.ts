// tests/e2e/portability/round-trip.spec.ts
// Plan 09-06 Task 1 — the SC#4 phase-exit e2e gate: a bundle exported on
// "machine A" imports on "machine B" with every highlight re-resolving to
// confident (or surfacing honestly as ambiguous/orphan), canonical-text
// offsets byte-equal across the round trip, per-article source URLs carried
// (SC#1), and NO page-number data anywhere in bundle.json.
//
// Two browser contexts ARE the two machines: each context is an isolated
// profile, so its IndexedDB origin storage is a separate device. The flow is
// the real reader flow — no DEV hooks:
//   machine A: seed (raw IndexedDB puts) → Settings → Export library bundle
//              → download capture (proven A1 harness)
//   Node side: unzip the downloaded .zip, parse bundle.json, assert the
//              envelope, SC#1 source-URL carriage, fixture minimization, and
//              the SC#4 recursive no-"page"-key walk
//   machine B: clear stores → Settings → setInputFiles(path) (the A5 path
//              variant) → preview dialog counts → Import → status summary
//   truth:     readRow/countRows on machine B — rows physically present,
//              offsets byte-equal; the fixture-backed highlight renders a
//              visible mark in the reader (the ANNO rendering surface).
import { test, expect } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import {
  BASE,
  confidentHighlightOn,
  collectPageKeys,
  highlightRow,
  makeArticle,
  openSettings,
  prepareFreshPage,
  readBundleJson,
  readRow,
  seedRows,
  settingsStatus,
} from "./_portability";

/** SC#1: the md-style article's per-article source URL, asserted VERBATIM in
 * the exported bundle.json (markdown ingestion carries source URLs; paste
 * ingestion has none by nature). */
const MD_SOURCE_URL = "https://example.org/round-trip-markdown-source";

const PASTE_ARTICLE = makeArticle({
  id: "paste-rt11aa22bb33",
  title: "Round Trip Paste Article",
  paragraphs: [
    "The first paragraph of the paste-style round trip article. It carries enough distinctive plain prose that a passage lifted from its middle resolves confidently through the shipped TextQuoteSelector machinery on every engine.",
    "The second paragraph changes the subject toward storage. A reader on machine A selects a sentence here, attaches a note, and later carries the whole library to machine B inside one versioned zip bundle.",
    "The third paragraph closes the corpus with a thought about offsets. Grapheme positions into normalized text are the durable anchor; nothing about pages, viewports, or typography survives into the bundle by design.",
    "A fourth paragraph gives the resolver additional unique material so that no passage chosen by the harness can accidentally appear twice in the normalized stream.",
  ],
});

const MD_ARTICLE = makeArticle({
  id: "md-rt44cc55dd66",
  title: "Round Trip Markdown Article",
  sourceUrl: MD_SOURCE_URL,
  author: "Ada Roundtrip",
  paragraphs: [
    "The first paragraph of the markdown-style round trip article. Markdown ingestion stamps a canonical source URL into provenance, and that URL must ride along verbatim when the library is exported.",
    "The second paragraph hosts the highlighted sentence with its note. The note follows its highlight across machines through the highlightId foreign key, rewritten only when a keep-both conflict mints a new id.",
    "The third paragraph provides trailing uniqueness material for the resolver so the anchored passage is unambiguous across the whole normalized text.",
  ],
});

test("SC#4 — export on machine A re-imports on machine B with offsets intact", async ({
  browser,
}) => {
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    // ── Machine A: seed the library ────────────────────────────────────────
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);

    // Node-side anchor derivation through the SHIPPED machinery (the same
    // resolver the importer runs) — genuine passages, confident by
    // construction, ASCII so grapheme segmentation is engine-identical.
    const anchorAlpha = confidentHighlightOn(PASTE_ARTICLE);
    const anchorBeta = confidentHighlightOn(MD_ARTICLE);
    const fixtureArticle = fixtures.find((f) => f.id === "essay-long-form");
    expect(fixtureArticle, "essay-long-form fixture must be bundled").toBeDefined();
    // A fixture passage: begin the scan ~150 graphemes in so the walk starts
    // inside genuine body prose (past the opening heading + first paragraph).
    const anchorFixture = confidentHighlightOn(fixtureArticle!, {
      start: 150,
      length: 30,
    });

    /** The seeded reader preferences — distinctive values so machine B's
     * applyPreferences write is observable (fresh device ⇒ default true). */
    const seededPrefs = {
      schemaVersion: 2,
      font: "sans",
      size: 22,
      measure: 64,
      spacing: "comfortable",
      theme: "dark",
      readingMode: "paginated",
    };

    await seedRows(pageA, {
      articles: [PASTE_ARTICLE, MD_ARTICLE],
      highlights: [
        highlightRow(PASTE_ARTICLE.id, anchorAlpha, "hl-rt-alpha"),
        highlightRow(MD_ARTICLE.id, anchorBeta, "hl-rt-beta"),
        highlightRow(fixtureArticle!.id, anchorFixture, "hl-rt-fixture"),
      ],
      notes: [
        {
          schemaVersion: 1,
          id: "nt-rt-beta",
          highlightId: "hl-rt-beta",
          text: "Note riding the round trip.",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      locations: [
        {
          schemaVersion: 1,
          articleId: PASTE_ARTICLE.id,
          revision: 1,
          graphemeOffset: 42,
          savedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      settings: [{ key: "reader-prefs", value: seededPrefs }],
    });

    // ── Machine A: export through the real UI ──────────────────────────────
    const panelA = await openSettings(pageA);
    await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
    const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
    await panelA.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lem-reader-bundle-v1.zip");
    const bundlePath = await download.path();
    expect(bundlePath, "download must be persisted to disk").toBeTruthy();

    // ── Node-side bundle inspection (the spec runs in Node) ────────────────
    const { bundle: bundleJson, entries } = readBundleJson(bundlePath!);
    // Both required entries exist.
    expect(entries["manifest.json"]).toBeDefined();

    // Versioned envelope (PORT-01).
    expect(bundleJson.schemaVersion).toBe(1);

    // Both articles ride; the fixture does NOT (fixtures are bundled code —
    // only their ids travel).
    const articles = bundleJson.articles as Array<{
      id: string;
      provenance?: { sourceUrl?: string };
    }>;
    expect(articles.map((a) => a.id).sort()).toEqual([MD_ARTICLE.id, PASTE_ARTICLE.id].sort());
    expect(
      articles.some((a) => a.id === fixtureArticle!.id),
      "fixture article must never serialize into the bundle",
    ).toBe(false);

    // SC#1 — the seeded provenance.sourceUrl rides VERBATIM (per-article
    // source URLs, not stripped).
    const mdExported = articles.find((a) => a.id === MD_ARTICLE.id);
    expect(mdExported?.provenance?.sourceUrl).toBe(MD_SOURCE_URL);

    // The fixture id travels in fixtureIds so machine B can re-anchor
    // fixture-backed highlights against its own bundled copy.
    expect(bundleJson.fixtureIds).toContain(fixtureArticle!.id);

    // Preferences always ride (D9-12).
    expect(bundleJson.preferences).toEqual(seededPrefs);

    // SC#4 data minimization — a recursive key walk over the whole parsed
    // bundle finds no key matching "page" (page numbers are ephemeral; the
    // grapheme substrate is the only durable anchor).
    expect(
      collectPageKeys(bundleJson),
      "no page-number/page-derived key may appear anywhere in bundle.json",
    ).toEqual([]);

    // ── Machine B: import through the real UI ──────────────────────────────
    const pageB = await machineB.newPage();
    await prepareFreshPage(pageB);
    const panelB = await openSettings(pageB);

    // The A5 PATH variant: setInputFiles with a filesystem path.
    await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);

    // The preview dialog shows the incoming counts (D9-11 dry run).
    const preview = pageB.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText(
      "This bundle contains 2 articles, 3 highlights, 1 note, and 1 reading position.",
    );

    // Proceed (the only path across the destructive-write boundary).
    await preview.getByRole("button", { name: "Import", exact: true }).click();
    await expect(settingsStatus(pageB)).toContainText(
      "Imported 2 articles, 3 highlights, 1 note, and 1 reading position.",
      { timeout: 15_000 },
    );

    // ── Machine B: raw IndexedDB truth ─────────────────────────────────────
    // Both articles present.
    expect(await readRow(pageB, "articles", PASTE_ARTICLE.id)).not.toBeNull();
    expect(await readRow(pageB, "articles", MD_ARTICLE.id)).not.toBeNull();

    // SC#4 — offsets survive byte-equal: position.start/position.end equal
    // the seeded grapheme values on BOTH seeded highlights.
    const alphaRow = await readRow(pageB, "highlights", "hl-rt-alpha");
    expect(alphaRow).not.toBeNull();
    expect((alphaRow!.position as { start: number }).start).toBe(anchorAlpha.position.start);
    expect((alphaRow!.position as { end: number }).end).toBe(anchorAlpha.position.end);
    const betaRow = await readRow(pageB, "highlights", "hl-rt-beta");
    expect(betaRow).not.toBeNull();
    expect((betaRow!.position as { start: number }).start).toBe(anchorBeta.position.start);
    expect((betaRow!.position as { end: number }).end).toBe(anchorBeta.position.end);
    // The stored quotes survived verbatim too (the re-anchoring substrate).
    expect((alphaRow!.quote as { exact: string }).exact).toBe(anchorAlpha.quote.exact);

    // The note follows its highlight (matching highlightId).
    const noteRow = await readRow(pageB, "notes", "nt-rt-beta");
    expect(noteRow).not.toBeNull();
    expect(noteRow!.highlightId).toBe("hl-rt-beta");

    // The location row (compound [articleId+revision] array key).
    const locationRow = await readRow(pageB, "location", [PASTE_ARTICLE.id, 1]);
    expect(locationRow).not.toBeNull();
    expect(locationRow!.graphemeOffset).toBe(42);

    // Preferences applied on the fresh machine (applyPreferencesDefault true
    // because machine B had no reader-prefs row).
    const prefsRow = await readRow(pageB, "settings", "reader-prefs");
    expect(prefsRow).not.toBeNull();
    expect((prefsRow!.value as { theme: string }).theme).toBe("dark");

    // The fixture-backed highlight row is present on machine B.
    const fixtureHlRow = await readRow(pageB, "highlights", "hl-rt-fixture");
    expect(fixtureHlRow).not.toBeNull();

    // ── The ANNO rendering surface: the fixture-backed highlight renders a
    // visible mark in the reader on machine B. Switch to scrolling first so
    // the entire article body mounts (paginated mode renders only the
    // current fragment — the anchored passage may not be on page 1).
    await pageB.keyboard.press("Escape"); // close the settings panel
    await expect(panelB).not.toBeVisible();
    await pageB.goto(`${BASE}/#/article/${fixtureArticle!.id}`);
    await expect(pageB.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    const modeToggle = pageB.getByRole("button", { name: /^Reading mode:/ });
    await modeToggle.click(); // paginated → scrolling (imported prefs)
    await expect(modeToggle).toHaveAttribute("aria-label", "Reading mode: scrolling");
    await expect(
      pageB.locator('mark.highlight[data-highlight-id="hl-rt-fixture"]'),
      "the fixture-backed highlight must render a visible mark on machine B",
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await machineA.close();
    await machineB.close();
  }
});
