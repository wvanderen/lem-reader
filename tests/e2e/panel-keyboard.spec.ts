// tests/e2e/panel-keyboard.spec.ts
// A11Y-01 + A11Y-02 — THE Pitfall 1 test. jsdom cannot replicate this
// (Pitfall 2): the native <dialog>/showModal focus trap, inert backdrop, and
// trigger focus-restore are real-browser behaviors. Asserted across Chromium,
// Firefox, and WebKit (the three projects declared in playwright.config.ts).
//
// What this proves that axe and jsdom cannot:
//   1. Opening the panel moves focus INTO the dialog (showModal behavior).
//   2. Tab cycles ONLY within the dialog (focus trap — never leaks to article).
//   3. Escape closes the dialog.
//   4. After close, focus returns to the gear trigger (Pitfall 1 — the load-
//      bearing focus-restore claim; showModal does NOT auto-restore).
import { test, expect } from "@playwright/test";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "./portability/_portability";
import { wipeDatabase } from "./annotations/_fixtures";

const BASE = "http://localhost:5173";

const FIRST_FIXTURE = "essay-long-form";

test.describe("Settings panel keyboard (A11Y-01/02 — Pitfall 1)", () => {
  test("focus moves into the dialog on open, traps on Tab, restores to gear on Escape", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);

    // Focus the gear trigger explicitly (predictable starting point).
    const gear = page.getByRole("button", { name: "Reading settings" });
    await gear.focus();
    await expect(gear).toBeFocused();

    // Open the panel via the keyboard (Enter on the focused gear).
    await page.keyboard.press("Enter");

    // The <dialog> is now open. Wait for it to be visible.
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // (1) Focus is now INSIDE the dialog (showModal behavior).
    const activeInDialog = await page.evaluate(() => {
      const dlg = document.querySelector("dialog.settings-panel");
      return dlg && document.activeElement
        ? dlg.contains(document.activeElement)
        : false;
    });
    expect(activeInDialog, "focus should move into the dialog after open").toBe(
      true,
    );

    // (2) Tab cycles ONLY within the dialog (focus trap — never escapes to an
    // interactive control outside). The browser-provided focus trap on
    // showModal() is the canonical implementation (Pitfall 1 / 02-RESEARCH.md
    // anti-pattern: never hand-roll). We sample enough Tab presses to wrap
    // past the last focusable element (Reset) and exercise wrap-around.
    //
    // Implementation note: real Chromium/Firefox/WebKit briefly land focus on
    // <body> during the wrap-around from the last focusable to the first. That
    // transient body touch is not an escape to an interactive control (the
    // gear, the article links, etc.) and is corrected on the next Tab. The
    // load-bearing contract is that focus NEVER lands on an interactive
    // element outside the dialog.
    const outsideInteractive = async () => {
      return await page.evaluate(() => {
        const dlg = document.querySelector("dialog.settings-panel");
        const ae = document.activeElement;
        if (!dlg || !ae) return false;
        if (dlg.contains(ae) || ae === dlg) return false; // inside
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

    // Shift+Tab also never escapes to an interactive control (wrap-around in
    // the reverse direction works the same way).
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+Tab");
      const escaped = await outsideInteractive();
      expect(
        escaped,
        `focus escaped to an interactive control outside the dialog on Shift+Tab iteration ${i}`,
      ).toBe(false);
    }

    // (3) Escape closes the dialog.
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();

    // (4) THE Pitfall 1 assertion: focus is restored to the gear trigger.
    // showModal() does NOT do this automatically; the SettingsPanel's close
    // listener calls triggerRef.current?.focus(). If that line is removed,
    // this assertion fails.
    await expect(gear).toBeFocused();
  });

  test("clicking the × close button restores focus to the gear trigger", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    const gear = page.getByRole("button", { name: "Reading settings" });
    await gear.focus();
    await page.keyboard.press("Enter");

    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Close via the × button (pointer activation path).
    await page.getByRole("button", { name: "Close reading settings" }).click();
    await expect(dlg).not.toBeVisible();

    // Focus is restored to the gear even on pointer-close.
    await expect(gear).toBeFocused();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Plan 10-06 (RECV-01.i): keyboard reachability of the #/review panel.
// There is no modal on this route, so the contract is REACHABILITY +
// OPERABILITY (not the dialog focus trap above): Tab order reaches the
// filter controls (article select → confidence select → sort select) →
// the row buttons, and the row jump button activates by keyboard (Enter)
// — then browser Back returns to the panel (the entry-button way out and
// back). Strengthen-only — the settings-panel trap assertions above stay
// authoritative for their substrate.
test.describe("Review panel keyboard reachability (RECV-01.i)", () => {
  test("Tab reaches filter controls → sort → rows; Enter on a row jumps; Back returns", async ({
    page,
  }, testInfo) => {
    const TITLE = "The Salvage Diver's Handbook";
    await wipeDatabase(page);
    // Re-mount so Dexie re-declares its schema before seeding (10-03 fix).
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible();
    await expect(
      page.getByText("The looting of science fiction").first(),
    ).toBeVisible();
    const article = makeArticle({
      id: "kb-review-corpus",
      title: TITLE,
      paragraphs: [
        "The salvage diver's handbook opens with a warning that the sea files everything under lost, and that the diver's trade is simply reading the filing system faster than the water can reshelve it.",
        "Chapter two advises counting the barnacles before the cargo: a hull sunk five years speaks one language, a hull sunk fifty speaks another, and a hull sunk last Tuesday says nothing at all yet, which is how you know to wait.",
      ],
    });
    const anchor = confidentHighlightOn(article);
    await seedRows(page, {
      articles: [article],
      highlights: [highlightRow("kb-review-corpus", anchor, "hl-kb-review-1")],
    });
    await page.goto(`${BASE}/#/review`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Go to highlight:/ }).first(),
    ).toBeVisible();

    // Walk Tab from the top of the document and require the expected
    // controls to appear IN ORDER. Unlisted pass-through focusables (the
    // skip link, header controls) are fine — order among the expected ones
    // is the contract.
    //
    // Engine divergence (the 09-06 stacked-modal precedent — engine-honest
    // subsets, never weakened universals): Playwright's bundled WebKit
    // keeps Safari's sequential-focus default where Tab reaches FORM
    // CONTROLS ONLY — buttons and links are not Tab-participants (verified
    // on this route AND the library route; chromium/firefox walk them
    // normally). So: webkit asserts the selects-only Tab subset, while
    // button/row Tab-reachability is asserted on chromium+firefox — and
    // the programmatic-focus contract below covers ALL engines.
    const engine = testInfo.project.name;
    const expected: { desc: string; id: string; labelPrefix?: string }[] =
      engine === "webkit"
        ? [
            { desc: "article filter combobox", id: "review-article-filter" },
            { desc: "confidence filter combobox", id: "review-confidence-filter" },
            { desc: "sort select", id: "review-sort" },
          ]
        : [
            { desc: "article filter combobox", id: "review-article-filter" },
            { desc: "confidence filter combobox", id: "review-confidence-filter" },
            { desc: "sort select", id: "review-sort" },
            { desc: "row jump button", id: "", labelPrefix: "Go to highlight:" },
          ];
    let reached = 0;
    for (let tab = 0; tab < 20 && reached < expected.length; tab++) {
      await page.keyboard.press("Tab");
      const hit = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return {
          id: el.id,
          label: el.getAttribute("aria-label") ?? "",
        };
      });
      if (hit === null) continue;
      const want = expected[reached]!;
      const matches =
        want.id !== ""
          ? hit.id === want.id
          : hit.label.startsWith(want.labelPrefix ?? "");
      if (matches) reached += 1;
    }
    expect(
      reached,
      `Tab order must reach all expected controls in order (stopped at "${expected[reached]?.desc ?? "done"}")`,
    ).toBe(expected.length);

    // The programmatic-focus contract on ALL engines (the WebKit
    // forced-colors precedent): every expected control — row jump button
    // included — accepts focus, in DOM order.
    const rowButton = page
      .getByRole("button", { name: /^Go to highlight:/ })
      .first();
    for (const target of [
      page.locator("#review-article-filter"),
      page.locator("#review-confidence-filter"),
      page.locator("#review-sort"),
      rowButton,
    ]) {
      await target.focus();
      await expect(target).toBeFocused();
    }
    // Keyboard operability: Enter on the focused row button jumps to the
    // article, then browser Back returns to the panel (the entry-button
    // way out and back).
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
  });
});
