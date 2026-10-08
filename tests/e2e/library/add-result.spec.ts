// tests/e2e/library/add-result.spec.ts
// Issue #163 — the ARTICLE success landing's 3-engine browser truth. The
// component suite (AddDialog.test.tsx) owns the jsdom-level state machine;
// jsdom has no dialog top layer, no focus ordering, no real hashchange
// routing (the focused-add.spec.ts Pitfall-5 discipline). Everything here
// runs on the REAL chromium/firefox/webkit matrix against the integrated
// AddDialog + app shell. The #112 saved-result screen this suite used to
// pin is RETIRED — the remembered "Open after adding" preference decides
// the landing.
//
// Cases (issue #163's acceptance criteria, article arm):
//   1. CHECKED (the default): the save opens the article — the dialog
//      closes itself (the D16-12 close-first ordering's browser-level
//      consequence: no live modal over the reader) and the never-opened
//      article starts at the top (no restoration marker).
//   2. CHECKED + FLAGGED: a low-confidence admission opens the READER,
//      where the processing limits are visible (ADR-0003 — the fidelity
//      note + per-part warnings + degraded anchoring render in the
//      article view; the ONE copy home).
//   3. UNCHECKED: the save closes onto the library with the confirmation
//      announced through the library's notice status region; the article
//      appears in the Unread view.
//   4. PERSISTENCE: the unchecked choice survives a reload and a dialog
//      reopen (the remembered preference — never reset by a fresh
//      session).
//   5. REFUSAL: a duplicate refusal stays in the dialog (calm copy, input
//      preserved, no navigation) and never overwrites — the library keeps
//      exactly one row.
//
// Harness discipline (focused-add.spec.ts clone):
//   - openAddDialog/pickSource/setOpenAfterAdding/awaitAutoOpened/
//     awaitQuietClosed from ./add-dialog — the shared idempotent helpers
//     centralizing every accessible name.
//   - wipeDatabase beforeEach (deterministic first-run state — the mirror
//     clear included, so openAfterAdd always starts at its checked
//     default).
//   - page.route mocks /api/ingest with schema-valid CanonicalArticle
//     payloads (the client re-validates at the network boundary) — no
//     coupling to the live extractor.
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import { openAddDialog, setOpenAfterAdding, awaitAutoOpened, awaitQuietClosed } from "./add-dialog";
import type { CanonicalArticle } from "../../../src/content/types";

/** The route-mock payload union: a schema-valid article (ok variant) or a
 * typed refusal envelope (the IngestionResponse refusal shape). */
type IngestPayload = CanonicalArticle | { ok: false; reason: string };

function isRefusal(p: IngestPayload): p is { ok: false; reason: string } {
  return "ok" in p && p.ok === false;
}

/** A schema-valid CanonicalArticle payload for the route mock (the unit
 * suite's sampleArticle shape — ArticleSchema.parse-clean). */
function articlePayload(
  id: string,
  title: string,
  meta?: CanonicalArticle["ingestionMeta"],
): CanonicalArticle {
  return {
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: `https://example.com/${id}`,
      title,
      retrievedAt: "2026-09-29T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body text.", marks: [] }] }],
    footnotes: [],
    ...(meta ? { ingestionMeta: meta } : {}),
  } as CanonicalArticle;
}

/** Flagged admission (ADR-0003): low confidence + a per-part warning +
 * degraded anchoring — the "admitted with visible ingestion limits" arm. */
const FLAGGED_META: NonNullable<CanonicalArticle["ingestionMeta"]> = {
  source: "url",
  origin: "url",
  sourceUrl: "https://example.com/flagged-admission",
  originalHtmlHash: "sha256:" + "1".repeat(64),
  extractionConfidence: "low",
  extractionWarnings: ["1 image could not be fetched"],
  annotationsDegraded: true,
};

/** Route /api/ingest with the given payload (a mutable holder so a test
 * can swap the NEXT response mid-test). */
async function mockIngest(page: Page, payload: { current: IngestPayload }): Promise<void> {
  await page.route("**/api/ingest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        isRefusal(payload.current)
          ? payload.current
          : {
              ok: true,
              article: payload.current,
              confidence:
                payload.current.ingestionMeta?.extractionConfidence === "low"
                  ? { state: "low" }
                  : { state: "confident" },
            },
      ),
    }),
  );
}

/** Open the library surface (the saved-articles list on #/). */
async function openLibrary(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
}

/** Drive a URL add to its landing: `quiet` selects the UNCHECKED landing
 * (the remembered preference must be set BEFORE the submission); the
 * CHECKED default auto-opens the reader. */
async function addUrl(page: Page, url: string, quiet: boolean): Promise<void> {
  await openAddDialog(page);
  if (quiet) await setOpenAfterAdding(page, false);
  await page.getByRole("textbox", { name: /add by url/i }).fill(url);
  await page.getByRole("button", { name: /^add$/i }).click();
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("Article add landings (issue #163)", () => {
  test("CHECKED: the save opens the article close-first, starting at the top", async ({ page }) => {
    const payload = { current: articlePayload("auto-open", "An Auto Open") };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/auto-open", false);

    // The dialog closed itself and the article route took over — no
    // result screen, no explicit Open article step, no live modal over
    // the reader.
    await awaitAutoOpened(page, /#\/article\/auto-open$/);
    await expect(page.getByRole("heading", { level: 1, name: "An Auto Open" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
    // The reading-location rule for a never-opened article: the reader
    // starts at the beginning — no restoration marker, no resume banner.
    await expect(page.locator(".restoration-marker")).toHaveCount(0);
  });

  test("CHECKED + flagged: the reader shows the processing limits (the ONE copy home)", async ({
    page,
  }) => {
    const payload = {
      current: articlePayload("flagged-admission", "A Flagged Admission", FLAGGED_META),
    };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/flagged-admission", false);

    // The flagged article OPENS (the checked landing does not fork on
    // confidence) — the limits render IN THE READER: the fidelity note +
    // escape hatch, the per-part heading + warning line, and the
    // degraded-anchoring note (the ArticleView sentences).
    await awaitAutoOpened(page, /#\/article\/flagged-admission$/);
    await expect(page.getByRole("heading", { level: 1, name: "A Flagged Admission" })).toBeVisible({
      timeout: 10_000,
    });
    const note = page.locator(".extraction-note");
    await expect(note).toContainText("This article may be incomplete or inaccurate");
    const link = note.locator("a");
    await expect(link).toHaveAttribute("href", "https://example.com/flagged-admission");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toContainText("See the original");
    await expect(page.locator(".partial-content-heading")).toContainText(
      "Some content could not be processed.",
    );
    await expect(page.locator(".partial-content-note li")).toHaveText(
      "1 image could not be fetched",
    );
    await expect(page.locator(".annotations-note")).toContainText(
      "Highlights may be unreliable on this article.",
    );
  });

  test("UNCHECKED: the quiet confirmation announces through the library's status region; the article stays Unread", async ({
    page,
  }) => {
    const payload = { current: articlePayload("quiet-add", "A Quiet Add") };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/quiet-add", true);

    // The quiet landing: dialog closed, back on the library, the notice
    // region carries the confirmation.
    await awaitQuietClosed(page);
    expect(page.url(), "no navigation on the quiet landing").not.toContain("#/article");
    await expect(page.locator(".library-add-notice")).toHaveText("Saved to your library.");

    // THE Unread transition: the never-opened article is in the Unread
    // view (the snapshot invalidated before the close).
    await page.goto(`${BASE}/#/unread`);
    await expect(page.getByRole("link", { name: /^Unread \(\d+\)$/ })).toBeVisible();
    await expect(
      page.locator(".library-list > li").filter({ hasText: "A Quiet Add" }),
    ).toBeVisible();
  });

  test("the unchecked choice is REMEMBERED across a reload and a dialog reopen", async ({
    page,
  }) => {
    const payload = { current: articlePayload("memory-add", "The Memory Add") };
    await mockIngest(page, payload);
    await openLibrary(page);

    // Session 1: uncheck, save quietly.
    await addUrl(page, "https://example.com/memory-add", true);
    await awaitQuietClosed(page);
    // The preference write is DEBOUNCED (the SettingsContext ~400ms save);
    // wait for the localStorage mirror to carry it before reloading — the
    // mirror is what the next cold load paints from first (no fixed
    // sleeps — an auto-retrying poll on the persisted truth).
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lem-settings-mirror-v1") ?? ""))
      .toContain('"openAfterAdd":false');

    // Session 2: a reload is a fresh app — the preference hydrates from
    // storage, so the reopened dialog comes back UNCHECKED.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
    await openAddDialog(page);
    const box = page.getByRole("checkbox", { name: "Open after adding" });
    await expect(box).not.toBeChecked();

    // Cancel + reopen: the fresh-session reset (D16-08) never touches the
    // remembered preference.
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
    await openAddDialog(page);
    await expect(page.getByRole("checkbox", { name: "Open after adding" })).not.toBeChecked();

    // And the next save lands quietly again.
    payload.current = articlePayload("memory-add-2", "The Memory Add II");
    await page.getByRole("textbox", { name: /add by url/i }).fill("https://example.com/memory-2");
    await page.getByRole("button", { name: /^add$/i }).click();
    await awaitQuietClosed(page);
    await expect(
      page.locator(".library-list > li").filter({ hasText: "The Memory Add II" }),
    ).toBeVisible();
  });

  test("a duplicate refusal stays in the dialog with the input preserved and never overwrites", async ({
    page,
  }) => {
    const payload = { current: articlePayload("dup-check", "The Dup Check") };
    await mockIngest(page, payload);
    await openLibrary(page);
    await addUrl(page, "https://example.com/dup-check", true);
    await awaitQuietClosed(page);

    // Re-submit the SAME input: the service's has() now finds the saved
    // row → dedupe-refuse (D7-07/D16-09). The dialog REOPENS for the
    // drive and STAYS OPEN on the calm copy — no navigation, no landing.
    await addUrl(page, "https://example.com/dup-check", false);
    const dialog = page.locator("dialog.add-dialog");
    await expect(dialog.locator(".status")).toContainText("Already in your library.");
    await expect(dialog).toBeVisible();
    expect(page.url()).not.toContain("#/article");
    // Retry stays available (D16-11 — the URL was never cleared).
    await expect(page.locator("input#ingest-url")).toHaveValue("https://example.com/dup-check");
    await expect(dialog.locator("button.add-dialog-submit")).toBeEnabled();

    // Never overwritten: Esc closes; the library holds EXACTLY ONE row.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.goto(`${BASE}/#/`);
    await expect(
      page.locator(".library-list > li").filter({ hasText: "The Dup Check" }),
    ).toHaveCount(1);
  });
});
