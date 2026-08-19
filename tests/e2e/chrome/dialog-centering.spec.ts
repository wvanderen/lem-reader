// tests/e2e/chrome/dialog-centering.spec.ts
// POLISH-04 / D13-14 — the four CENTERED modal dialogs open centered in the
// viewport on every engine. Root cause (externally verified, WHATWG HTML
// Rendering §15.3.3): the UA stylesheet centers a modal <dialog> via
// `margin: auto` under dialog:modal's fixed + inset:0 positioning; the author
// `margin: 0` on those four blocks overrode the auto margins, resolving the
// over-constrained box to the start edges — top-left in LTR. The 13-03 fix
// restores `margin: auto`; this spec proves the geometry through each
// dialog's REAL UI opening path (no JS positioning anywhere — the platform
// does the centering, we only measure it).
//
// The four surfaces under test (app.css):
//   - dialog.highlight-popover   — the note editor (the reported bug)
//   - dialog.wipe-confirm        — STATE-05 destructive-reset consent
//   - dialog.library-remove-confirm — cascade-remove consent
//   - dialog.import-preview      — bundle import consent
// The intentional side sheets (dialog.settings-panel, dialog.annotations-
// drawer) are OUT OF SCOPE: they anchor to the inline end by design and a
// blanket centering fix would break them (13-RESEARCH anti-pattern #1).
//
// Harness reuse (REUSE-DO-NOT-FORK):
//   - annotations/_fixtures.ts — wipeDatabase/openArticle/selectRangeInBlock/
//     findFirstBlockWithText (the proven note-editor path; press "n" with a
//     selection creates the highlight AND opens the editor).
//   - portability/_portability.ts — prepareFreshPage/seedRows/openSettings/
//     buildBundleZip/makeArticle (the corrupt-settings-row WipeConfirm
//     trigger from cold-load-no-snap.spec.ts; the bundle-driven import
//     preview from import-preview.spec.ts; the row-trash RemoveConfirm from
//     remove-cascade.spec.ts).
//
// Measurement: locator.boundingBox() vs page.viewportSize() with a 24px
// tolerance per axis (absorbs subpixel rounding + classic-scrollbar
// viewport-width variance on firefox/webkit). window.scrollTo(0, 0) before
// measuring makes the coordinates unambiguous — a fixed-position dialog's
// box does not move, so top-of-page scroll converges every interpretation.
// No fixed sleeps (Pitfall 8): toBeVisible/expect.poll end conditions only.
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import {
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
} from "../annotations/_fixtures";
import {
  BASE,
  prepareFreshPage,
  seedRows,
  openSettings,
  buildBundleZip,
  makeArticle,
} from "../portability/_portability";

/** Centering tolerance per axis in px (plan-suggested 24 — subpixel +
 * classic-scrollbar variance). */
const TOLERANCE_PX = 24;

/** The demo article inside the import bundle (must clear ING-06 thresholds —
 * the makeArticle portability shape is the proven seed). */
const BUNDLE_ARTICLE = makeArticle({
  id: "md-centerdemo01",
  title: "Dialog Centering Demo Article",
  paragraphs: [
    "The first paragraph of the dialog centering demo article carries distinctive prose so the bundle clears the intake thresholds and the import preview opens through the real settings flow.",
    "The second paragraph supplies additional unique material so the article remains comfortably above the minimum block and character counts required for admission.",
    "The third paragraph keeps the count honest — three blocks, well past every threshold, no anchors needed for this geometry-focused spec.",
  ],
});

/** A minimal schema-valid bundle .zip (the import-preview.spec.ts shape,
 * article-only — no conflicts needed to open the preview dialog). */
const BUNDLE_BUFFER = await buildBundleZip({
  schemaVersion: 1,
  exportedAt: "2026-08-19T00:00:00.000Z",
  appVersion: "0.1.0",
  articles: [BUNDLE_ARTICLE],
  locations: [],
  highlights: [],
  notes: [],
  preferences: { ...DEFAULT_SETTINGS },
  fixtureIds: [],
});

// ── Real-UI opening paths, one per modal ─────────────────────────────────────

/** Note editor: open the essay fixture, select a passage, press "n" — the
 * highlight is created and the editor popover opens (the exact activation
 * path note-create-edit.spec.ts proves). */
async function openNoteEditor(page: Page): Promise<Locator> {
  await wipeDatabase(page);
  await openArticle(page, "essay-long-form");
  const blockIdx = await findFirstBlockWithText(page, 24);
  expect(blockIdx).not.toBe(-1);
  const selected = await selectRangeInBlock(page, blockIdx, 0, 18);
  expect(selected, "selection must be set before pressing n").toBe(true);
  await page.keyboard.press("n");
  const popover = page.locator("dialog.highlight-popover");
  await expect(popover).toBeVisible({ timeout: 10_000 });
  return popover;
}

/** Wipe confirmation: a corrupt settings row makes the cold load surface the
 * STATE-05 consent dialog (the cold-load-no-snap.spec.ts trigger). The
 * about:blank hop forces a TRUE navigation — a bare hash change from the
 * already-mounted library view is a same-document navigation, the app never
 * reloads, and the corrupt row is never read. */
async function openWipeConfirm(page: Page): Promise<Locator> {
  await prepareFreshPage(page);
  await seedRows(page, {
    settings: [{ key: "reader-prefs", value: { broken: "not a ReaderSettings record" } }],
  });
  await page.goto("about:blank");
  await page.goto(`${BASE}/#/article/essay-long-form`);
  const dlg = page.locator("dialog.wipe-confirm");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  return dlg;
}

/** Library remove confirmation: the first library row's trash button opens
 * the cascade-remove consent dialog (the remove-cascade.spec.ts path). */
async function openRemoveConfirm(page: Page): Promise<Locator> {
  await prepareFreshPage(page);
  const firstRow = page.locator(".library-list > li").first();
  await expect(firstRow, "library must list at least one row").toBeVisible({
    timeout: 10_000,
  });
  await firstRow.locator(".library-row-remove").click();
  const dlg = page.locator("dialog.library-remove-confirm");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  return dlg;
}

/** Import preview: a valid bundle picked through the settings panel's import
 * input opens the dry-run preview dialog (the import-preview.spec.ts path). */
async function openImportPreview(page: Page): Promise<Locator> {
  await prepareFreshPage(page);
  const panel = await openSettings(page);
  await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
    name: "centering-bundle.zip",
    mimeType: "application/zip",
    buffer: BUNDLE_BUFFER,
  });
  const dlg = page.locator("dialog.import-preview");
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  return dlg;
}

// ── The parameterized centering matrix (plain test() → 3-engine inherit) ─────

const MODAL_CASES: ReadonlyArray<{
  name: string;
  open: (page: Page) => Promise<Locator>;
}> = [
  { name: "highlight-popover (note editor)", open: openNoteEditor },
  { name: "wipe-confirm", open: openWipeConfirm },
  { name: "library-remove-confirm", open: openRemoveConfirm },
  { name: "import-preview", open: openImportPreview },
];

for (const modal of MODAL_CASES) {
  test(`dialog ${modal.name} opens centered in the viewport (both axes, ±${TOLERANCE_PX}px)`, async ({
    page,
  }) => {
    const dialog = await modal.open(page);
    await expect(dialog).toBeVisible();

    // Fixed-position dialogs do not move with scroll; settling at top makes
    // the boundingBox coordinates unambiguously viewport-relative.
    await page.evaluate(() => window.scrollTo(0, 0));

    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "dialog must report a bounding box").not.toBeNull();
    expect(viewport, "Playwright projects always carry a viewport").not.toBeNull();

    const centerDelta = {
      x: Math.abs(box!.x + box!.width / 2 - viewport!.width / 2),
      y: Math.abs(box!.y + box!.height / 2 - viewport!.height / 2),
    };
    // Horizontal center within tolerance (margin:auto restored — was pinned
    // to inline-start, i.e. left edge, before the fix).
    expect(
      centerDelta.x,
      `${modal.name}: horizontal center off by ${centerDelta.x.toFixed(1)}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    // Vertical center within tolerance (was pinned to block-start, i.e. top
    // edge, before the fix).
    expect(
      centerDelta.y,
      `${modal.name}: vertical center off by ${centerDelta.y.toFixed(1)}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
  });
}
