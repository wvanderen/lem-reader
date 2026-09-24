// tests/e2e/library/add-entry-highlights.spec.ts
// Issue #84 (decision #70) — the Add-to-Library placement build: the quiet
// header Add icon is Highlights' entry into the ONE AddDialog session.
//
// Cases (the #84 acceptance):
//   1. GATING — the icon renders ONLY on the Highlights destination:
//      visible on #/highlights (with aria-haspopup="dialog" + an
//      aria-expanded mirror), absent on #/ (the h1-row primary button
//      stays Library's ONE Add affordance, D16-03) and absent on the
//      Reader (quiet-chrome; the ≤420px staged-collapse arithmetic
//      untouched). The shell nav stays three text links (D15-08).
//   2. ONE SESSION — opening from Highlights mounts the SAME dialog:
//      focus lands on the Web address radio ([data-initial-focus]), the
//      trigger's aria-expanded mirrors open, Esc closes, and focus
//      restores to the header icon.
//   3. KEYBOARD END-TO-END — icon → segmented radios → a mocked
//      youtube-bot-check refusal swaps the content slot in place → the
//      quiet "Back to web address" affordance returns to the URL form
//      with the typed URL intact (D16-11) → the URL arm still submits.
//   4. SUCCESS SPLIT — an article ingest opened from Highlights closes
//      the dialog and opens the reader (D16-12, the same session Library
//      opens).
//
// Harness discipline mirrors focused-add.spec.ts: real-browser matrix
// (jsdom owns no dialog top layer), wipeDatabase beforeEach, route-mocked
// /api/ingest, and the shared ./add-dialog helpers for the accessible
// names.
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import { fixtures } from "../../../src/fixtures";

/** The header Add icon (the decision-#70 trigger — class hook). */
function addTrigger(page: Page) {
  return page.locator("button.add-trigger");
}

/** The Library h1-row primary Add button (D16-03 — unchanged). */
function libraryAddButton(page: Page) {
  return page.locator("button.library-add-button");
}

/** The dialog's live region (the top status card). */
function statusCard(page: Page) {
  return page.locator("dialog.add-dialog .status");
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("Add entry points (#84 — the Highlights header Add icon)", () => {
  test("the icon renders ONLY on Highlights; Library keeps the h1-row button; the Reader stays quiet", async ({
    page,
  }) => {
    // Library: no header icon — the h1-row primary button is the ONE Add.
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(addTrigger(page)).toHaveCount(0);
    await expect(libraryAddButton(page)).toBeVisible();

    // Highlights: the quiet icon, wired as a dialog control.
    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(libraryAddButton(page)).toHaveCount(0);
    const trigger = addTrigger(page);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-label", "Add to Library");
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // D15-08 unrevised: the shell nav stays exactly three text links
    // (Library / Highlights / Read) — the icon is a control, never a
    // destination link.
    const navLinks = page.locator("nav.shell-nav a");
    await expect(navLinks).toHaveCount(2); // empty library: Read is hidden

    // Reader: quiet chrome — no Add icon next to the reading controls.
    await page.goto(`${BASE}/#/article/${fixtures[0]!.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(addTrigger(page)).toHaveCount(0);
  });

  test("the icon opens the ONE AddDialog session: focus lands on Web address; Esc restores focus to the icon", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();

    // Keyboard-open from a predictable starting point.
    const trigger = addTrigger(page);
    await trigger.focus();
    await trigger.press("Enter");

    const dlg = page.locator("dialog.add-dialog");
    await expect(dlg).toBeVisible();
    // The aria-expanded mirror flipped while the session is live.
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // The [data-initial-focus] contract (the 02-01 WebKit lesson): the
    // Web address radio owns focus on open.
    await expect(page.getByRole("radio", { name: "Web address" })).toBeFocused();

    // Escape when idle closes and restores focus to the header icon.
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("keyboard end-to-end from the icon: segmented radios, bot-check swap, Back affordance, retry (D16-11)", async ({
    page,
  }) => {
    // First submission refuses with the bot-check reason; the retry (same
    // URL) succeeds so the walk ends in the reader.
    const fixtureArticle = fixtures[0]!;
    let calls = 0;
    await page.route("**/api/ingest", (route) => {
      calls += 1;
      if (calls === 1) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, reason: "youtube-bot-check" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          article: fixtureArticle,
          confidence: { state: "confident" as const },
        }),
      });
    });

    await page.goto(`${BASE}/#/highlights`);
    const trigger = addTrigger(page);
    await trigger.focus();
    await trigger.press("Enter");
    await expect(page.getByRole("radio", { name: "Web address" })).toBeFocused();

    // Type the YouTube URL and submit (Enter in the field fires the form).
    const urlField = page.getByRole("textbox", { name: /add by url/i });
    const YT_URL = "https://www.youtube.com/watch?v=swapTest123";
    await urlField.fill(YT_URL);
    await page.getByRole("button", { name: /^add$/i, exact: true }).click();

    // The refusal renders in the TOP status card and the content slot
    // swaps IN PLACE: picker + source forms hide, the transcript flow
    // shows, and only ONE actions row exists.
    const dlg = page.locator("dialog.add-dialog");
    await expect(statusCard(page)).toContainText(
      "YouTube is asking for extra verification",
    );
    await expect(dlg.locator("fieldset.add-source-picker")).toBeHidden();
    await expect(dlg.locator(".add-source-content")).toBeHidden();
    await expect(dlg.locator("#add-transcript-form")).toBeVisible();
    await expect(dlg.locator(".add-transcript-actions")).toHaveCount(0);
    // The shared bottom submit flipped to the transcript target.
    await expect(
      dlg.locator("button.add-dialog-submit"),
    ).toHaveAttribute("form", "add-transcript-form");
    await expect(dlg.locator("button.add-dialog-submit")).toHaveText(
      "Add transcript",
    );

    // The quiet Back control returns to the URL form with the typed URL
    // intact (D16-11) — the walk's swap round-trip.
    await dlg.getByRole("button", { name: "Back to web address" }).click();
    await expect(dlg.locator("fieldset.add-source-picker")).toBeVisible();
    await expect(dlg.locator("#add-transcript-form")).toHaveCount(0);
    await expect(urlField).toHaveValue(YT_URL);

    // The URL arm still submits from the same session — the retry
    // succeeds and D16-12's article arm opens the reader.
    await page.getByRole("button", { name: /^add$/i, exact: true }).click();
    await page.waitForURL(new RegExp(`#/article/${fixtureArticle.id}$`), {
      timeout: 15_000,
    });
    await expect(dlg).not.toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: fixtureArticle.provenance.title }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("an article ingest opened from Highlights closes the dialog, then opens the reader (D16-12)", async ({
    page,
  }) => {
    const fixtureArticle = fixtures[0]!;
    await page.route("**/api/ingest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          article: fixtureArticle,
          confidence: { state: "confident" as const },
        }),
      }),
    );

    await page.goto(`${BASE}/#/highlights`);
    await addTrigger(page).click();
    const dlg = page.locator("dialog.add-dialog");
    await expect(dlg).toBeVisible();

    await page
      .getByRole("textbox", { name: /add by url/i })
      .fill("https://example.com/from-highlights");
    await page.getByRole("button", { name: /^add$/i, exact: true }).click();

    // The reader opened the ingested article; the dialog is gone.
    await page.waitForURL(new RegExp(`#/article/${fixtureArticle.id}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: fixtureArticle.provenance.title }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(dlg).not.toBeVisible();
  });
});
