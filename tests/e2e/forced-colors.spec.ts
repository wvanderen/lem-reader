// tests/e2e/forced-colors.spec.ts
// A11Y-05 — under forced-colors (Windows High Contrast mode), state and meaning
// must survive without relying on color alone (UI-SPEC §Color contrast contract
// line 290). The settings panel, gear, and links must remain legible and
// operable. Asserted via emulateMedia({ forcedColors: "active" }) across
// Chromium/Firefox/WebKit (forced-colors emulation is supported in all three).
import { test, expect } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
import { FIXTURES, wipeDatabase, openArticle } from "./annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "./portability/_portability";

const BASE = "http://localhost:5173";
const FIRST_FIXTURE = "essay-long-form";

test.describe("Forced colors (A11Y-05)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    // Deterministic first-run state + image stub (the shared e2e harness
    // discipline — annotations/_fixtures.ts wipeDatabase; 06-PATTERNS §Shared
    // Patterns). Plan 06-05 audit (D6-12): every edge spec uses the same
    // harness baseline. Benign to the existing CSS/aria assertions below.
    await wipeDatabase(page);
  });

  test("article links keep their underlines (UI-SPEC §Interaction 2 / global gate)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    // The global @media (forced-colors: active) { a { text-decoration: underline } }
    // gate in app.css keeps link underlines visible under forced-colors. Find
    // any link inside the article body and assert underline.
    // 13-10 gate-run repair (the 13-09 pending-window class): the always-
    // mounted hidden measurement clone (Plan 04-08) precedes .page-viewport
    // in DOM order, so an unscoped `.article-body a` resolves FIRST to the
    // clone's hidden inline link once pagination commits — deterministically
    // invisible. Scope the clone subtree out (the _fixtures.ts visible-
    // surface selector discipline). During the paginated pending window no
    // anchor matches yet; the poll settles once the surface mounts.
    const link = page
      .locator(".article-body a:not(.article-body-measurement a)")
      .first();
    await expect(link).toBeVisible();
    const td = await link.evaluate(
      (el) => window.getComputedStyle(el).textDecoration,
    );
    // `text-decoration` shorthand includes line, style, color. We just assert
    // that the line is present (underline or "line-through underline" etc.).
    expect(td.toLowerCase(), `link underline lost under forced-colors`).toContain(
      "underline",
    );
  });

  test("gear open/closed distinction is conveyed by aria-expanded (beyond color)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    // exact: true because the close button's accessible name ("Close reading
    // settings") would otherwise match "Reading settings" via substring.
    const gear = page.getByRole("button", { name: "Reading settings", exact: true });
    await expect(gear).toHaveAttribute("aria-expanded", "false");
    await gear.click();
    await expect(gear).toHaveAttribute("aria-expanded", "true");
    // The dialog is open — the open-state IS conveyed by aria-expanded, which
    // survives forced-colors (color alone would be lost).
  });

  test("every panel control has a visible focus outline when focused (UI-SPEC §Interaction 4)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Focus each control programmatically and assert a visible outline.
    // (Programmatic focus is more reliable than Tab for this contract: WebKit's
    // Tab handling inside <dialog> is independently buggy — see
    // panel-keyboard.spec.ts for the trap-coverage test.)
    //
    // Cross-engine note: under forced-colors, the browser activates its own
    // default focus indicator (typically 3px solid CanvasText) regardless of
    // whether `:focus-visible` matches the programmatic focus. We assert on
    // outline-WIDTH > 0 (the load-bearing visibility signal) rather than on
    // outline-style/match-state, which varies by engine.
    const targets = [
      { sel: "button.settings-close", label: "close ×" },
      { sel: "input[name='font']", label: "first radio" },
      { sel: "input[name='size']", label: "size range" },
      { sel: "input[name='measure']", label: "measure range" },
      { sel: "button.settings-reset", label: "Reset button" },
    ];
    for (const { sel, label } of targets) {
      await dlg.locator(sel).first().focus();
      const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
        };
      });
      expect(outline, `${label}: should have a focused element`).not.toBeNull();
      // outline-width must resolve to a non-zero pixel value (the global
      // :focus-visible rule OR the browser's forced-colors default).
      const widthPx = parseFloat((outline?.outlineWidth ?? "0px").replace(/px$/, ""));
      expect(
        widthPx,
        `${label}: focused control lost its outline under forced-colors (outline-width=${outline?.outlineWidth}, style=${outline?.outlineStyle})`,
      ).toBeGreaterThan(0);
    }
  });

  test("selected radio state is conveyed by native checked (not just the marker)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    // The default-selected theme radio is "Sepia" — its checked state conveys
    // selection independent of the marker color.
    const sepia = page.getByRole("radio", { name: "Sepia" });
    await expect(sepia).toBeChecked();

    // Selecting "Dark" updates the checked state.
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expect(sepia).not.toBeChecked();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 10-06 (RECV-01.i): the #/review route under forced-colors. Rows
  // (quote, note preview) + tri-state badges must stay legible and the
  // panel operable without color alone: the seeded confident row's jump
  // button still works, row text keeps a non-transparent forced color,
  // and the orphan badge conveys its state as TEXT ("Article missing"),
  // never color-only. Strengthen-only — the A11Y-05 assertions above stay
  // authoritative for their substrates.
  test("review panel rows + badges stay legible and operable under forced-colors (RECV-01.i)", async ({
    page,
  }) => {
    // The beforeEach wipe left the page against a deleted DB — re-mount
    // so Dexie re-declares its schema before seeding (the 10-03 fix).
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible();
    await expect(
      page.getByText("The looting of science fiction").first(),
    ).toBeVisible();
    const article = makeArticle({
      id: "fc-review-corpus",
      title: "Notes on the Lighthouse Ledger",
      paragraphs: [
        "The lighthouse keeper kept a double ledger: one column for the ships that passed, one for the birds, and the trustees never quite worked out which column the weather belonged to.",
        "Her marginalia explain that gulls count only when they land, that cormorants count double in rain, and that a fog lasting more than three days must be entered in both columns at once, which is why the annual totals never reconcile.",
      ],
    });
    const anchor = confidentHighlightOn(article);
    await seedRows(page, {
      articles: [article],
      highlights: [
        highlightRow("fc-review-corpus", anchor, "hl-fc-review-1"),
        // An orphan row (articleId with no matching article) so the
        // orphan tail + its "Article missing" badge render under emulation.
        {
          schemaVersion: 1,
          id: "hl-fc-review-orphan",
          articleId: "no-such-article",
          revision: 1,
          position: { start: 5, end: 15 },
          quote: {
            prefix: "zzqxx ",
            exact: "ZZQXX GHOST PASSAGE QQZZX",
            suffix: " qqzzx",
          },
          createdAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      notes: [
        {
          schemaVersion: 1,
          id: "note-fc-review-1",
          highlightId: "hl-fc-review-1",
          text: "The cormorant rule needs a source.",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
    });
    await page.goto(`${BASE}/#/review`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    // The emulation is genuinely active on this page (not just configured).
    const forced = await page.evaluate(() =>
      window.matchMedia("(forced-colors: active)").matches,
    );
    expect(forced, "forced-colors emulation must be active on #/review").toBe(
      true,
    );
    // Row + badge text keeps a non-transparent forced color — the text
    // survives the palette override (legibility signal, not a specific
    // engine color value).
    for (const sel of [".review-quote", ".review-note-preview", ".review-badge"]) {
      const color = await page
        .locator(sel)
        .first()
        .evaluate((el) => window.getComputedStyle(el).color);
      expect(
        color,
        `${sel} must keep a non-transparent forced color under forced-colors`,
      ).not.toBe("rgba(0, 0, 0, 0)");
      expect(color).not.toBe("transparent");
    }
    // The badge conveys its state as TEXT (beyond-color, the A11Y-05 bar).
    await expect(page.locator(".review-badge").first()).toContainText(
      "Article missing",
    );
    // Operable under emulation: the confident row's jump button opens the
    // article (a real reader click path).
    const rowButton = page
      .getByRole("button", { name: /^Go to highlight:/ })
      .first();
    await expect(rowButton).toBeEnabled();
    await rowButton.click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Notes on the Lighthouse Ledger",
      }),
    ).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────
  // D6-09 shared edge-condition invariant (Plan 06-05 audit, D6-12). Under
  // forced colors the SAME bar holds as every other edge condition:
  // (a) full content reachable via keyboard in BOTH reading modes,
  // (b) required functions reachable (settings + mode-toggle),
  // (c) no layout overflow clips content (WCAG 1.4.10). Applied uniformly
  // across the 6-fixture corpus so acceptance means the same thing
  // everywhere. The existing per-control A11Y-05 assertions above stay
  // authoritative for their substrates (underlines, aria-expanded, focus
  // outlines, checked state); this adds the consolidated invariant.
  // Strengthen-only — no existing assertion removed (D6-12).
  for (const fixture of FIXTURES) {
    test(`shared invariant holds under forced-colors @ ${fixture} (D6-09)`, async ({
      page,
    }) => {
      await openArticle(page, fixture);
      await assertEdgeInvariant(page, {
        fixture,
        condition: "forced-colors",
      });
    });
  }
});
