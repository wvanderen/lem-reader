// tests/e2e/library/focused-add.spec.ts
// Plan 16-04 Task 1 — the ADD-04 end-to-end proof. The component suite
// (16-02) deliberately cannot claim these behaviors: jsdom has no dialog
// top layer, no focus trap, no engine focus quirks (Pitfall 5). Everything
// here runs on the REAL 3-engine matrix (chromium/firefox/webkit —
// playwright.config.ts projects) against the integrated AddDialog.
//
// Cases (16-04-PLAN.md Task 1 — decision refs from 16-CONTEXT.md):
//   1. FOCUS IN: opening moves focus to the Web address radio (the
//      [data-initial-focus] target — the 02-01 WebKit no-auto-focus lesson).
//   2. TRAP + RESTORE: Tab/Shift+Tab never escape to an interactive control
//      outside the open dialog; Escape when IDLE closes AND restores focus
//      to the Add to Library trigger (the panel-keyboard precedent cloned
//      for the add surface — dialog.add-dialog, not settings-panel).
//   3. REOPEN DEFAULT (D16-08): a dirtied session (typed URL + Upload file
//      source) cancels; reopening always shows Web address checked with a
//      fresh session (URL field empty) — no last-used-source memory.
//   4. SWITCH PRESERVATION (D16-07): a picked File survives source switches
//      (the always-mounted hidden input — Pattern 3a); typed URL text
//      survives alongside it (lifted state).
//   5. ESC BLOCKED WHILE SUBMITTING (D16-10): a delayed-fulfill
//      page.route holds /api/ingest; Escape mid-flight leaves the dialog
//      open AND still submitting; settling the route with a typed refusal
//      recovers to the error state with retry available (text retained).
//   6. CLOSE-THEN-NAVIGATE (Pitfall 6): an article success closes the
//      dialog before the reader route takes over — the router's
//      hashchange transition finds the dialog already torn down (the
//      reader route never mounts around a live modal). The code-level
//      onCancel-before-hash-write ordering is the 16-02 component proof
//      (navEvents recorder); this is its browser-level consequence.
//   7. RADIO ARROWS: ArrowDown/ArrowUp move the checked source through
//      Web address → Paste text → Upload file (with wrap) and only the
//      selected source's input is visible after each move (D16-05).
//
// Harness discipline (suite-wide):
//   - openAddDialog/pickSource from ./add-dialog — the shared idempotent
//     helper centralizing every accessible name (the 16-03 contract).
//   - wipeDatabase beforeEach (deterministic first-run state).
//   - Hidden-form reads (the file group while another source is selected)
//     use CSS locators + locator.evaluate — a closed/hidden dialog subtree
//     is excluded from the accessibility tree (the 16-03 lesson).
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import { fixtures } from "../../../src/fixtures";
import { openAddDialog, pickSource } from "./add-dialog";

/** A small .md pick for the switch-preservation case. Never submitted. */
const SMALL_MARKDOWN = `# A Surviving Pick

This small markdown buffer exercises D16-07: the picked File must survive
source switches inside one dialog session.
`;

/** The calm status line inside the Add dialog's live region (the
 * upload-queue ingestStatus shape). */
function ingestStatus(
  page: Page,
  text: string,
): import("@playwright/test").Locator {
  return page.locator("dialog.add-dialog .status").filter({ hasText: text });
}

/** The header-row trigger (the single way into the dialog — D16-02/D16-03). */
function addButton(page: Page) {
  return page.getByRole("button", { name: "Add to Library" });
}

/** Open the library surface (the saved-articles list on #/). */
async function openLibrary(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("focused Add dialog (ADD-04 — 16-04 Task 1)", () => {
  test("opening moves focus to the Web address radio (the data-initial-focus target)", async ({
    page,
  }) => {
    await openLibrary(page);

    // Keyboard-open from a predictable starting point (panel-keyboard
    // precedent): focus the trigger, activate with Enter.
    const trigger = addButton(page);
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");

    const dlg = page.locator("dialog.add-dialog");
    await expect(dlg).toBeVisible();

    // THE WebKit 02-01 proof: showModal does NOT auto-focus controls in
    // WebKit — the explicit [data-initial-focus].focus() call is what puts
    // focus on the Web address radio. Assert the active element IS the
    // radio (name=source value=url) and carries the marker attribute.
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || !(el instanceof HTMLInputElement)) {
        return { type: el?.tagName ?? "none", name: "", value: "", marked: false };
      }
      return {
        type: `${el.tagName}[${el.type}]`,
        name: el.name,
        value: el.value,
        marked: el.hasAttribute("data-initial-focus"),
      };
    });
    expect(active.type).toBe("INPUT[radio]");
    expect(active.name, "the active radio belongs to the source group").toBe(
      "source",
    );
    expect(active.value, "the Web address radio is the initial focus").toBe(
      "url",
    );
    expect(active.marked, "the focused radio is the data-initial-focus target").toBe(
      true,
    );
  });

  test("Tab cycles within the dialog; Escape when idle closes and restores focus to the trigger", async ({
    page,
  }) => {
    await openLibrary(page);

    const trigger = addButton(page);
    await trigger.focus();
    await trigger.press("Enter");

    const dlg = page.locator("dialog.add-dialog");
    await expect(dlg).toBeVisible();

    // (1) Trap: Tab/Shift+Tab NEVER land on an interactive control outside
    // the dialog (the panel-keyboard outsideInteractive clone, scoped to
    // dialog.add-dialog). Transient <body>/<html> touches during the
    // wrap-around are not escapes; the library's controls behind the modal
    // ARE (they sit inert behind the backdrop).
    const outsideInteractive = async () => {
      return await page.evaluate(() => {
        const dlg = document.querySelector("dialog.add-dialog");
        const ae = document.activeElement;
        if (!dlg || !ae) return false;
        if (dlg.contains(ae) || ae === dlg) return false; // inside
        if (ae === document.body || ae === document.documentElement) {
          return false; // transient body/html touch during wrap — not interactive
        }
        return true; // focus landed on an interactive control outside the dialog
      });
    };
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const escaped = await outsideInteractive();
      expect(
        escaped,
        `focus escaped to an interactive control outside the dialog on Tab iteration ${i}`,
      ).toBe(false);
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+Tab");
      const escaped = await outsideInteractive();
      expect(
        escaped,
        `focus escaped to an interactive control outside the dialog on Shift+Tab iteration ${i}`,
      ).toBe(false);
    }

    // (2) Escape when idle closes the dialog.
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();

    // (3) Focus restores to the Add to Library trigger (the close-listener
    // triggerRef.current?.focus() — showModal does NOT auto-restore).
    await expect(trigger).toBeFocused();
  });

  test("cancel and reopen always shows Web address selected with a fresh session (D16-08)", async ({
    page,
  }) => {
    await openLibrary(page);
    await openAddDialog(page);

    // Dirty the session: type a URL, then leave it on the Upload file
    // source — a memory-keeping dialog would reopen on file with the URL
    // retained; D16-08 forbids exactly that.
    await page
      .getByRole("textbox", { name: /add by url/i })
      .fill("https://example.com/should-not-survive");
    await pickSource(page, "file");
    await expect(page.locator("input#ingest-file")).toBeVisible();
    await page.locator("button.add-dialog-cancel").click();
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();

    // Reopen (the helper clicks the trigger — the dialog is closed).
    await openAddDialog(page);

    // Web address is checked; the URL field is empty — fresh session.
    await expect(
      page.getByRole("radio", { name: "Web address" }),
    ).toBeChecked();
    const urlValue = await page
      .locator("input#ingest-url")
      .evaluate((el) => (el as HTMLInputElement).value);
    expect(urlValue, "the reopened dialog starts with an empty URL field").toBe(
      "",
    );
    // The upload group is hidden again (only the selected source renders).
    await expect(page.locator("input#ingest-file")).toBeHidden();
  });

  test("a picked file survives source switches until the dialog closes (D16-07)", async ({
    page,
  }) => {
    await openLibrary(page);
    await openAddDialog(page);

    // Typed URL text first (lifted state), then switch to Upload file and
    // pick — both payloads must survive the switches below.
    const urlField = page.getByRole("textbox", { name: /add by url/i });
    await urlField.fill("https://example.com/kept");

    await pickSource(page, "file");
    const fileInput = page.locator("input#ingest-file");
    await fileInput.setInputFiles({
      name: "kept-pick.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(SMALL_MARKDOWN, "utf-8"),
    });
    // The pick registered (the hasFile mirror re-evaluated).
    const addFile = page.locator(".add-file-form button[type='submit']");
    await expect(addFile).toBeEnabled();

    // Switch away to Web address and back — the pick is retained.
    await pickSource(page, "url");
    // The file form is hidden but the pick is intact: the always-mounted
    // input still holds the File (CSS locator — the hidden subtree is
    // excluded from the accessibility tree; toBeEnabled works on hidden
    // elements, the 16-03 closed-dialog lesson).
    await expect(urlField).toHaveValue("https://example.com/kept");
    expect(await fileInput.evaluate((el) => (el as HTMLInputElement).value)).toContain(
      "kept-pick.md",
    );
    await expect(addFile).toBeEnabled();

    // Back to Upload file: the retained pick is visible again — the
    // Remove file affordance (rendered only when hasFile) is showing and
    // Add file stays enabled.
    await pickSource(page, "file");
    await expect(page.locator("button.add-remove-file")).toBeVisible();
    await expect(addFile).toBeEnabled();
  });

  test("Escape is blocked while a submission is in flight; recovery after the request settles (D16-10)", async ({
    page,
  }) => {
    // Hold EVERY request open with a delayed-fulfill route (the happy-path
    // response-shape fixture pattern): each handler invocation awaits its
    // own gate before fulfilling, so the dialog enters — and STAYS in —
    // the submitting state until the test settles that gate with a typed
    // refusal. Per-request gates keep the RETRY cycle's transient
    // submitting copy observable too (an ungated retry resolves within a
    // tick and the copy can legitimately vanish between poll intervals —
    // a race on a transient, not a behavior).
    const makeGate = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    const gate1 = makeGate();
    const gate2 = makeGate();
    let hits = 0;
    await page.route("**/api/ingest", async (route) => {
      const gate = hits === 0 ? gate1 : gate2;
      hits += 1;
      await gate.promise;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          reason: "extraction-unsupported",
        }),
      });
    });

    await openLibrary(page);
    await openAddDialog(page);

    const urlField = page.getByRole("textbox", { name: /add by url/i });
    await urlField.fill("https://example.com/slow");
    await page.getByRole("button", { name: /^add$/i }).click();

    // The submission is in flight (the submitting copy is live — the
    // request is held on gate1).
    await expect(ingestStatus(page, "Fetching article…")).toBeVisible();

    // Escape mid-flight: the cancel gate (live submittingRef mirror)
    // blocks dismissal — the dialog stays open AND still submitting. Both
    // assertions run AFTER the Escape press (the acceptance contract).
    const dlg = page.locator("dialog.add-dialog");
    await page.keyboard.press("Escape");
    await expect(dlg, "dialog must stay open after mid-flight Escape").toBeVisible();
    expect(
      await dlg.evaluate((el) => (el as HTMLDialogElement).open),
      "the underlying dialog is genuinely open (not just painted)",
    ).toBe(true);
    await expect(
      ingestStatus(page, "Fetching article…"),
      "the submission is still in flight after mid-flight Escape",
    ).toBeVisible();

    // Settle the route with the typed refusal: the dialog recovers to the
    // error state with the calm copy — never a zombie, never a wedge.
    gate1.resolve();
    await expect(
      ingestStatus(page, "Couldn't reliably read this page."),
    ).toBeVisible();

    // Retry is available (D16-11 — the error never cleared the text):
    // the URL is retained and the submit control is enabled again.
    await expect(urlField).toHaveValue("https://example.com/slow");
    await expect(page.getByRole("button", { name: /^add$/i })).toBeEnabled();

    // And the retry genuinely re-fires end to end: the second request is
    // held on gate2, so the SECOND submitting cycle is observably live
    // (not the lingering first copy), then the refusal settles again.
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(ingestStatus(page, "Fetching article…")).toBeVisible();
    gate2.resolve();
    await expect(
      ingestStatus(page, "Couldn't reliably read this page."),
    ).toBeVisible();
  });

  test("article success closes the dialog first, then opens the article in the reader (Pitfall 6)", async ({
    page,
  }) => {
    // Success payload: a real fixture CanonicalArticle (the happy-path
    // route-fixture pattern — the fixture re-uses the v1.0 canonical shape
    // so the reader treats it identically to a bundled article).
    const fixtureArticle = fixtures[0];
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

    await openLibrary(page);
    await openAddDialog(page);

    // Transition instrumentation. The code-level ordering (onCancel called
    // BEFORE the hash write) is proven at the component layer by the 16-02
    // navEvents recorder — jsdom can stub the hash write and record the
    // call order directly. In a real browser that ordering is not
    // externally observable (the open-prop commit never lands before the
    // route swap tears the subtree down), so the honest browser-level
    // contract asserted here is the one the reader actually experiences:
    // by the time the router's hashchange transition dispatches, the Add
    // dialog is ALREADY out of the document — the article route never
    // mounts around a live modal (no lingering-dialog-over-the-reader
    // state, no wedge on return-to-library). This listener runs AFTER
    // App's own hashchange handler (registered later), i.e. after the
    // route-swap commit's microtask checkpoint — deterministic across
    // engines because microtask checkpoints run between listener
    // invocations during event dispatch.
    await page.evaluate(() => {
      const w = window as unknown as {
        __focusedAddNav?: { dialogGoneAtHashChange: boolean };
      };
      w.__focusedAddNav = { dialogGoneAtHashChange: false };
      window.addEventListener(
        "hashchange",
        () => {
          const dlg = document.querySelector("dialog.add-dialog");
          w.__focusedAddNav!.dialogGoneAtHashChange =
            dlg === null || !document.contains(dlg);
        },
        { once: true },
      );
    });

    await page
      .getByRole("textbox", { name: /add by url/i })
      .fill("https://example.com/ordering");
    await page.getByRole("button", { name: /^add$/i }).click();

    // The reader opened the ingested article.
    await page.waitForURL(
      new RegExp(`#/article/${fixtureArticle.id}$`),
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "The looting of science fiction" }),
    ).toBeVisible({ timeout: 10_000 });

    // THE Pitfall 6 assertion: at the router's transition moment, the
    // dialog is already gone from the document — close/teardown before
    // the reader route, never a live modal over the article view.
    const nav = await page.evaluate(
      () =>
        (window as unknown as {
          __focusedAddNav?: { dialogGoneAtHashChange: boolean };
        }).__focusedAddNav,
    );
    expect(
      nav?.dialogGoneAtHashChange,
      "the Add dialog must be torn down by the router's hashchange transition",
    ).toBe(true);
    // And the settled state: dialog closed, reader open at the exact id.
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
  });

  test("arrow keys move the checked source; only the selected source's input is visible (D16-05)", async ({
    page,
  }) => {
    await openLibrary(page);
    await openAddDialog(page);

    const urlRadio = page.getByRole("radio", { name: "Web address" });
    const pasteRadio = page.getByRole("radio", { name: "Paste text" });
    const fileRadio = page.getByRole("radio", { name: "Upload file" });

    // The picker is focused on open (the initial-focus case above); arrow
    // keys drive the native radio-group semantics: check + focus move
    // together.
    //
    // Engine-honest wrap assertion (the 09-06 stacked-modal precedent —
    // engine-specific subsets, never weakened universals): chromium +
    // firefox WRAP arrow navigation past the last/first radio; WebKit
    // keeps Safari's sequential-radio semantics where ArrowDown at the
    // LAST radio is a calm no-op (verified: no focus move, no change
    // event). The progressive moves + per-move visibility are universal.
    const wraps = test.info().project.name !== "webkit";

    await expect(urlRadio).toBeFocused();

    // ArrowDown: Web address → Paste text. Only the paste input renders.
    await page.keyboard.press("ArrowDown");
    await expect(pasteRadio).toBeChecked();
    await expect(pasteRadio).toBeFocused();
    await expect(page.locator("textarea#ingest-paste")).toBeVisible();
    await expect(page.locator("input#ingest-url")).toHaveCount(0);

    // ArrowDown: Paste text → Upload file. Only the file input is visible.
    await page.keyboard.press("ArrowDown");
    await expect(fileRadio).toBeChecked();
    await expect(fileRadio).toBeFocused();
    await expect(page.locator("input#ingest-file")).toBeVisible();
    await expect(page.locator("textarea#ingest-paste")).toHaveCount(0);

    if (wraps) {
      // ArrowDown wraps: Upload file → Web address.
      await page.keyboard.press("ArrowDown");
      await expect(urlRadio).toBeChecked();
      await expect(page.locator("input#ingest-url")).toBeVisible();
      await expect(page.locator("input#ingest-file")).toBeHidden();
      // ArrowUp wraps back: Web address → Upload file.
      await page.keyboard.press("ArrowUp");
      await expect(fileRadio).toBeChecked();
      await expect(page.locator("input#ingest-file")).toBeVisible();
      await expect(page.locator("input#ingest-url")).toHaveCount(0);
    } else {
      // WebKit: ArrowDown at the last radio stays there (no wrap, no
      // state churn — Safari's native end-of-group semantics).
      await page.keyboard.press("ArrowDown");
      await expect(fileRadio).toBeChecked();
      await expect(page.locator("input#ingest-file")).toBeVisible();
    }

    // Universal return move: ArrowUp from Upload file → Paste text, and
    // the visibility follows the checked state.
    await page.keyboard.press("ArrowUp");
    await expect(pasteRadio).toBeChecked();
    await expect(pasteRadio).toBeFocused();
    await expect(page.locator("textarea#ingest-paste")).toBeVisible();
    await expect(page.locator("input#ingest-file")).toBeHidden();
  });
});
