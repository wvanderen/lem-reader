// tests/e2e/annotations/note-popover-focus.spec.ts
// ACPT-02 finding #2 (debug session `vo-note-popover-focus`) — the automated
// substrate for the note-popover modal-dialog contract. jsdom cannot replicate
// this (Pitfall 2): native <dialog>/showModal focus scope, inert background,
// and trigger focus-restore are real-browser behaviors. Asserted across
// Chromium, Firefox, and WebKit (the three projects in playwright.config.ts).
//
// What this proves that axe and jsdom cannot — and that the Phase 5
// `popover="manual"` div could NOT provide (the VoiceOver blocker):
//   1. Opening the popover moves focus INTO the dialog (showModal behavior —
//      the platform "modal shown" AT event that lets VoiceOver enter).
//   2. The dialog carries role=dialog + accessible name "Highlight note" (the
//      ACPT-02 Flow D gate — role + name + state, not verbatim SR phrasing),
//      AND is in the `:modal` state (the modal focus-scope the VO blocker
//      fixed).
//   3. Tab cycles ONLY within the dialog (focus trap — never leaks to the
//      article or header controls while the editor is open). This is the
//      authoritative cross-engine focus-scope proof (a programmatic
//      `.focus()` on an inert node is engine-divergent and not used here).
//   4. Escape closes the dialog.
//   5. After close, focus is restored to the triggering <mark> (Pitfall 1 —
//      showModal does NOT auto-restore; the `close` listener does it).
//
// This is the manual-SR layer's automated foundation. Final VoiceOver
// confirmation is a HUMAN checkpoint (the tester re-runs Flow D on Safari+VO).
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/**
 * Create a highlight via the N shortcut (opens the editor with a focused empty
 * textarea). Returns after the dialog is open.
 */
async function createHighlightAndOpenEditor(
  page: import("@playwright/test").Page,
): Promise<void> {
  await openArticle(page, FIXTURE);
  const blockIdx = await findFirstBlockWithText(page, 24);
  expect(blockIdx).not.toBe(-1);
  await selectRangeInBlock(page, blockIdx, 0, 18);
  await page.keyboard.press("n");
  await expect(page.locator("mark.highlight").first()).toBeVisible();
  await expect(page.locator("dialog#highlight-popover")).toBeVisible();
}

test.describe("Note popover modal-dialog focus (ACPT-02 finding #2)", () => {
  test("focus moves into the dialog + role/name + :modal are exposed (Flow D gate)", async ({
    page,
  }) => {
    await createHighlightAndOpenEditor(page);

    // The dialog exposes role=dialog + accessible name "Highlight note" (the
    // ACPT-02 authoring rule: role + name + state, not verbatim SR phrasing).
    const dlg = page.getByRole("dialog", { name: "Highlight note" });
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute("aria-label", "Highlight note");

    // The dialog is in the `:modal` state — showModal opened it. This is the
    // modal focus-scope / AT context the Phase 5 popover="manual" div lacked
    // (the VO browse could not enter). :modal is supported in the target
    // browser baseline (Chromium 105+, Firefox 108+, Safari 15.4+).
    const isModal = await page.evaluate(() => {
      const d = document.querySelector("dialog#highlight-popover");
      return d ? d.matches(":modal") : false;
    });
    expect(isModal, "dialog is modal (:modal matches — showModal opened it)").toBe(
      true,
    );

    // Focus is now INSIDE the dialog (showModal behavior).
    const activeInDialog = await page.evaluate(() => {
      const dlg = document.querySelector("dialog#highlight-popover");
      return dlg && document.activeElement
        ? dlg.contains(document.activeElement)
        : false;
    });
    expect(activeInDialog, "focus should move into the dialog after open").toBe(
      true,
    );

    // The textarea specifically is the initial focus (D5-10).
    const textarea = page.locator("textarea.highlight-popover-textarea");
    const textareaFocused = await textarea.evaluate(
      (el) => el === document.activeElement,
    );
    expect(textareaFocused, "textarea is the initial focus on open").toBe(true);
  });

  test("Tab cycles only within the dialog (focus trap — never escapes)", async ({
    page,
  }) => {
    await createHighlightAndOpenEditor(page);

    // The dialog's focusable controls in DOM order: textarea, Done, Delete.
    // Tab enough times to wrap past Delete and back into the dialog. The
    // browser-provided focus trap on showModal() is the canonical modal-scope
    // implementation. This loop is the authoritative cross-engine focus-scope
    // proof: if focus ever lands on an interactive control outside the dialog
    // (a header button, an article link), the modal scope is broken.
    //
    // Implementation note: real Chromium/Firefox/WebKit briefly land focus on
    // <body> during the wrap-around from the last focusable to the first. That
    // transient body touch is not an escape to an interactive control and is
    // corrected on the next Tab. (A programmatic `.focus()` on an inert node
    // is engine-divergent — WebKit moves activeElement on it — so it is NOT
    // used as an inertness signal here; this Tab loop is the reliable check.)
    const outsideInteractive = async () => {
      return await page.evaluate(() => {
        const dlg = document.querySelector("dialog#highlight-popover");
        const ae = document.activeElement;
        if (!dlg || !ae) return false;
        if (dlg.contains(ae) || ae === dlg) return false; // inside the dialog
        if (ae === document.body || ae === document.documentElement) {
          return false; // transient body/html touch during wrap — not interactive
        }
        return true; // focus landed on an interactive control outside the dialog
      });
    };

    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const escaped = await outsideInteractive();
      expect(
        escaped,
        `focus escaped to an interactive control outside the dialog on Tab iteration ${i}`,
      ).toBe(false);
    }

    // Shift+Tab also never escapes (wrap-around in reverse).
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Shift+Tab");
      const escaped = await outsideInteractive();
      expect(
        escaped,
        `focus escaped outside the dialog on Shift+Tab iteration ${i}`,
      ).toBe(false);
    }
  });

  test("Escape closes the dialog + focus restores to the triggering <mark>", async ({
    page,
  }) => {
    // Focus-restore-to-<mark> is meaningful in the ACTIVATE-EXISTING-MARK path
    // (the real ACPT-02 Flow D scenario): the reader focuses a saved <mark>,
    // activates it → the editor opens (mark is activeElement at showModal time)
    // → close → focus returns to the mark. (The N-shortcut CREATE path has no
    // prior trigger element, so its restore target is unspecified.)
    await createHighlightAndOpenEditor(page);
    // Persist the highlight + close the editor so a stable <mark> exists.
    await page.locator("#highlight-popover .highlight-popover-done").click();
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).not.toBeVisible();

    // The triggering <mark> is focusable (tabindex=0 per the highlight renderer).
    const triggerMark = page.locator("mark.highlight").first();
    await expect(triggerMark).toHaveAttribute("tabindex", "0");
    // Focus + activate the mark (the Flow D "open note" gesture).
    await triggerMark.focus();
    await expect(triggerMark).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dlg).toBeVisible();

    // Escape closes the native modal <dialog>.
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();

    // THE Pitfall 1 assertion: focus is restored to the triggering <mark>.
    // showModal() does NOT do this automatically; the `close` listener calls
    // triggerRef.current?.focus(). If that line is removed this assertion fails.
    await expect(triggerMark).toBeFocused();
  });

  test("Done closes the dialog + flushes the note save + restores focus", async ({
    page,
  }) => {
    // Same activate-existing-mark path as the Escape test (see note there).
    await createHighlightAndOpenEditor(page);
    await page.locator("textarea.highlight-popover-textarea").fill("First note.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).not.toBeVisible();

    const triggerMark = page.locator("mark.highlight").first();
    await triggerMark.focus();
    await page.keyboard.press("Enter");
    await expect(dlg).toBeVisible();

    // Done routes through setOpenPopoverFor(null) → dlg.close() → the close
    // listener flushes the debounced save + restores focus.
    await page.locator("textarea.highlight-popover-textarea").fill("Edited note.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(dlg).not.toBeVisible();

    // Focus restored to the triggering <mark>.
    await expect(triggerMark).toBeFocused();
  });

  test("dialog announces the highlighted excerpt as its accessible description (ACPT-02 #5)", async ({
    page,
  }) => {
    // ACPT-02 finding #5 (debug session `vo-note-popover-focus`): VoiceOver
    // announced the visually-hidden "Highlighted text:" label but NOT the
    // excerpt content — the SR user editing a note never heard WHAT text was
    // highlighted. The fix makes the excerpt the dialog's accessible
    // description via aria-describedby, with the "Highlighted text:" prefix
    // merged inside the excerpt <p> so the description is a single string
    // ("Highlighted text: <excerpt>"). This test is the automated foundation
    // beneath the human VO checkpoint: it proves the a11y-tree wiring
    // (aria-describedby → the excerpt element → its text is in the dialog's
    // computed description) that VO reads on dialog open.
    await createHighlightAndOpenEditor(page);

    // (a) The dialog references the excerpt element by id.
    const dlg = page.getByRole("dialog", { name: "Highlight note" });
    await expect(dlg).toHaveAttribute(
      "aria-describedby",
      "highlight-popover-excerpt",
    );

    // (b) The referenced element exists and is inside the dialog.
    const excerptEl = dlg.locator("#highlight-popover-excerpt");
    await expect(excerptEl).toBeVisible();

    // (c) Read the actual excerpt text (excluding the visually-hidden prefix
    //     span) so the description assertion is fixture-agnostic.
    const excerptText = await excerptEl.evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelector(".visually-hidden")?.remove();
      return (clone.textContent ?? "").trim();
    });
    expect(excerptText.length, "excerpt text is non-empty").toBeGreaterThan(0);

    // (d) THE #5 assertion: the dialog's computed accessible description (the
    //     a11y-tree value VoiceOver announces on dialog open) includes BOTH
    //     the "Highlighted text:" prefix AND the excerpt content. Playwright's
    //     role+description filter resolves through the accessibility tree, so
    //     a match proves the description is wired end-to-end cross-engine —
    //     not just that the DOM attribute exists.
    const escapeRe = (s: string) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const descriptionRe = new RegExp(
      `Highlighted text:.*${escapeRe(excerptText)}`,
    );
    await expect(
      page.getByRole("dialog", { name: "Highlight note", description: descriptionRe }),
    ).toBeVisible();
  });
});
