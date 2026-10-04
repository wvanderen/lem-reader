import { expandSettingsGroup } from "../settings";
// tests/e2e/chrome/pride-themes.spec.ts
// ADR 0006 — the two specialty pride presets, proven in the real browser
// (jsdom owns no layout/color truth — the Pitfall 2 discipline):
//
//   PT-01 — selection + live apply: each radio writes its theme literal;
//           the computed chrome follows the palette (band fill, accent)
//           AND the ribbon hook — the reader's viewport progress hairline
//           paints the --flag-ribbon gradient (a background-image; every
//           other theme resolves --progress-fill to the solid accent,
//           which computes NO image), opening on the flag's first color.
//   PT-02 — persistence: a specialty theme survives a reload (Dexie truth +
//           mirror hint; the pre-React THEMES map paints the [data-theme]
//           block from the first frame — no default-to-persisted flip).
//   PT-03 — the flat-enamel default holds: switching back to a preset
//           removes the gradient (the hooks re-route to the solid
//           materials) — the exception never leaks.
//
// The ribbon assertions run in the READER: the viewport hairline mounts
// only there (ArticleView/PaginatedSurface), not on the shell.
//
// Harness reuse (REUSE-DO-NOT-FORK): BASE + wipeDatabase from
// ../annotations/_fixtures; the openSettings entry from custom-theme.spec.
import { test, expect, type Page } from "@playwright/test";
import { wipeDatabase, BASE } from "../annotations/_fixtures";

/** Open the settings panel on the shell (the custom-theme.spec entry). */
async function openSettings(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expandSettingsGroup(page, "Appearance");
  await expect(page.locator("dialog.settings-panel")).toBeVisible();
}

/** The reader's viewport hairline fill (the flag ribbon host). */
function viewportFill(page: Page) {
  return page.locator(".progress-hairline-viewport .progress-hairline-fill");
}

const ROOMS = [
  {
    name: "Trans pride",
    literal: "trans-light",
    band: "rgb(20, 55, 78)", // #14374e — the deep trans-blue enamel
    accentHex: "#166093", // the deepened trans blue (raw-token form)
    accentRgb: "rgb(22, 96, 147)", // the same token (computed form)
    ribbonLead: "rgb(91, 206, 250)", // #5bcefa — the flag's leading stripe
  },
  {
    name: "Bi pride",
    literal: "bi-dark",
    band: "rgb(18, 12, 32)", // #120c20 — the deep violet enamel
    accentHex: "#e589c2", // the lightened flag pink (raw-token form)
    accentRgb: "rgb(229, 137, 194)", // the same token (computed form)
    ribbonLead: "rgb(214, 2, 112)", // #d60270 — the flag's leading stripe
  },
] as const;

for (const room of ROOMS) {
  test(`PT-01/02 ${room.name}: ribbon hooks apply and survive a reload (${room.literal})`, async ({
    page,
  }) => {
    await wipeDatabase(page);
    await openSettings(page);

    await page.getByRole("radio", { name: room.name, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", room.literal);

    // The palette follows the room (computed styles — the real-browser truth).
    await expect(page.locator(".app-header")).toHaveCSS("background-color", room.band);
    // Custom properties serialize differently per engine (Chromium computes
    // to rgb(), Firefox/WebKit return the raw token) — accept either form.
    const accent = await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--accent").trim());
    expect([room.accentHex, room.accentRgb]).toContain(accent);

    // The reader's viewport hairline paints the flag WASH — the soft blend.
    // The band's bottom edge stays BASIC (the solid lit metal, no
    // border-image): a hard-stripe ribbon there sat 1px above the moving
    // wash and read as a clashing double-flag. The flag's crisp ribbon lives
    // on the lit current-location underline instead — ON the navigator,
    // far from the progress line (ADR 0006).
    await page.keyboard.press("Escape"); // close the panel; the dialog never carries state
    await page.goto(`${BASE}/#/article/getting-started`);
    // Attached, never "visible": at progress 0 the fill is scaleX(0) — a
    // zero-width box — so assert on its computed style, not visibility.
    const image = await viewportFill(page).evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(image).toContain("linear-gradient");
    expect(image).toContain(room.ribbonLead);
    const bandEdge = await page
      .locator(".app-header")
      .evaluate((el) => getComputedStyle(el).borderImageSource);
    expect(bandEdge).toBe("none");
    const litMark = await page
      .locator(".shell-nav a[aria-current='page']")
      .evaluate((el) => getComputedStyle(el).borderImageSource);
    expect(litMark).toContain(room.ribbonLead);

    // The upstream border-box fix (the band is EXACTLY 48px including its
    // 1px rule) is load-bearing for these themes: the wash must render its
    // FULL 2px directly below the band — never halved under it.
    const header = await page.locator(".app-header").boundingBox();
    const track = await page.locator(".progress-hairline-viewport").boundingBox();
    expect(header!.height).toBe(48);
    expect(track!.height).toBe(2);
    expect(track!.y).toBe(header!.y + header!.height);

    // Persistence: reload — Dexie + the pre-paint mirror restore the room
    // (data-theme on <html> from the first painted frame).
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", room.literal);
    await expect(page.locator(".app-header")).toHaveCSS("background-color", room.band);
    expect(await viewportFill(page).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
      room.ribbonLead,
    );
  });
}

test("PT-03 leaving a flag room restores the flat enamel (no gradient leak)", async ({
  page,
}) => {
  await wipeDatabase(page);
  await openSettings(page);

  await page.getByRole("radio", { name: "Bi pride", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "bi-dark");

  await page.getByRole("radio", { name: "Daylight", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // The reader again: the hairline fill resolves to the plain accent color —
  // no background image, the solid Daylight accent painted.
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/#/article/getting-started`);
  // Same zero-width-at-progress-0 discipline: computed style, not visibility.
  expect(await viewportFill(page).evaluate((el) => getComputedStyle(el).backgroundImage)).toBe(
    "none",
  );
  expect(await viewportFill(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    "rgb(34, 96, 74)", // #22604a — the Daylight bottle green
  );
});
