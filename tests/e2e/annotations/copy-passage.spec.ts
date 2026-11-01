// tests/e2e/annotations/copy-passage.spec.ts
// Issue #194 — the Copy action on the EXISTING highlight controls (the
// unified annotation panel). The copy is ONLY the highlighted passage as
// plain text: paragraph breaks for multi-block spans, with notes, tags,
// title, URL, and markup excluded; clipboard failure is announced honestly
// with a next step (never a false success); the action is keyboard-operable
// and works in BOTH reading modes; annotations survive the copy untouched.
//
// Seam discipline: the clipboard CONTRACT under test is what the app hands
// to navigator.clipboard.writeText. A recorder init-script wraps writeText
// (call-through, rejection propagated) and records the payload — engine
// clipboard POLICY never masks the app's behavior. The real OS-clipboard
// round trip is proven in the Chromium-only cell (grantPermissions);
// honesty is proven by a rejection sabotage driving the real failure path.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  wipeDatabase,
  openArticle,
  switchMode,
  selectRangeInBlock,
  findFirstBlockWithText,
  countHighlightsInDexie,
  announcementRegion,
  spanSelectionAcrossConsecutiveBlocks,
  noteRowCountFor,
  openHighlightControls,
  highlightControls,
  noteTextarea,
} from "./_fixtures";
import { bundledFixtures } from "../../../src/fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form
const NOTE_TEXT = "Compare with the 2019 field report.";
const TAG = "copy-probe";

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
  // Engine clipboard policy is NOT the contract here (the recorder owns the
  // payload assertions; the Chromium cell owns the real round trip). Grant
  // where the engine supports it, ignore where it refuses.
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"])
    .catch(() => {});
});

/** The article's highlight rows (Dexie truth: id + stored quote). */
async function highlightRows(
  page: Page,
  articleId: string,
): Promise<{ id: string; exact: string }[]> {
  return page.evaluate(async (aid) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return await new Promise<{ id: string; exact: string }[]>((resolve, reject) => {
      const tx = db.transaction("highlights", "readonly");
      const req = tx.objectStore("highlights").getAll();
      req.onsuccess = () => {
        db.close();
        resolve(
          (req.result as Array<{ articleId: string; id: string; quote: { exact: string } }>)
            .filter((r) => r.articleId === aid)
            .map((r) => ({ id: r.id, exact: r.quote.exact })),
        );
      };
      req.onerror = () => reject(req.error);
    });
  }, articleId);
}

/** Record every navigator.clipboard.writeText payload (call-through). */
async function installClipboardRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, "__lemClipboardWrites", { configurable: true, value: writes });
    const original = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          writes.push(text);
          if (!original) return Promise.reject(new DOMException("no clipboard", "NotAllowedError"));
          return original(text);
        },
      },
    });
  });
  // The wipe left the page at ${BASE}/ — the article goto below is then a
  // SAME-DOCUMENT (hash-only) navigation, which injects no init scripts
  // (the delete-confirm sabotage precedent). Navigate to a distinct QUERY
  // first: a query change forces the cross-document load a same-document
  // reload+hash sequence races on WebKit.
  await page.goto(`${BASE}/?clipboard-harness`);
}

/** The latest recorded writeText payload (null when nothing was written). */
async function lastWrite(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const writes = (window as unknown as { __lemClipboardWrites?: string[] }).__lemClipboardWrites;
    return writes && writes.length > 0 ? (writes[writes.length - 1] ?? null) : null;
  });
}

/** Reject every clipboard write (the honesty sabotage — the app must see
 *  the SAME rejection path a permission denial produces). */
async function installClipboardSabotage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
        readText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  // Same-document navigation injects no init scripts — force a
  // cross-document load via a distinct query (see installClipboardRecorder).
  await page.goto(`${BASE}/?clipboard-harness`);
}

/** Create one single-block highlight via the ordinary selection toolbar. */
async function createSingleBlockHighlight(page: Page): Promise<void> {
  const blockIndex = await findFirstBlockWithText(page, 24);
  expect(blockIndex, "a selectable block must exist").not.toBe(-1);
  const ok = await selectRangeInBlock(page, blockIndex, 0, 24);
  expect(ok, "selection must be set").toBeTruthy();
  await page.locator(".selection-toolbar").getByRole("button", { name: "Slot 1: Default" }).click();
  await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
}

/** Attach a note + a tag through the controls (the metadata the copy must
 *  NOT leak), without closing the dialog. Issue #207 — the tag field is
 *  always visible; no expansion step. */
async function addNoteAndTag(page: Page): Promise<void> {
  const controls = await openHighlightControls(page);
  await controls.getByRole("button", { name: "Add note" }).click();
  await noteTextarea(page).fill(NOTE_TEXT);
  const tagInput = page.locator("input#highlight-tags-input");
  await tagInput.fill(TAG);
  await tagInput.press("Enter");
}

test.describe("Copy highlighted passage (#194)", () => {
  test("scrolling: Copy writes only the passage — note, tag, title, and URL excluded; annotations preserved", async ({
    page,
  }) => {
    await installClipboardRecorder(page);
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await createSingleBlockHighlight(page);
    await addNoteAndTag(page);

    const copyButton = highlightControls(page).getByRole("button", { name: "Copy", exact: true });
    await copyButton.click();

    // Success announced in the dialog's live region; the editor stays open.
    await expect(highlightControls(page)).toContainText("Copied.");
    await expect(highlightControls(page)).toBeVisible();

    // The clipboard payload IS the stored passage — byte-equal, no metadata.
    const rows = await highlightRows(page, FIXTURE);
    expect(rows).toHaveLength(1);
    const written = await lastWrite(page);
    expect(written).toBe(rows[0]!.exact);
    expect(written).not.toContain("\n");
    expect(written).not.toContain(NOTE_TEXT);
    expect(written).not.toContain(TAG);
    const provenance = bundledFixtures.find((a) => a.id === FIXTURE)?.provenance;
    expect(written).not.toContain(provenance?.title ?? "\u0000no-title\u0000");
    expect(written).not.toContain(provenance?.sourceUrl ?? "\u0000no-url\u0000");
    // Markup exclusion: no mark/tag artifacts in a plain-text payload.
    expect(written).not.toMatch(/<|>/);

    // Focus stays inside the dialog (pointer clicks may not focus buttons —
    // Safari discipline — so assert containment, not the exact button).
    const focusInside = await page.evaluate(
      () => document.activeElement?.closest("dialog#highlight-popover") !== null,
    );
    expect(focusInside, "focus remains within the annotation dialog").toBeTruthy();

    // Annotations survived: one highlight, the note landed, the tag stuck.
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);
    await expect.poll(() => noteRowCountFor(page, rows[0]!.id)).toBe(1);
    await expect(page.locator("mark.highlight").first()).toBeVisible();
  });

  test("scrolling: a multi-block span copies paragraph breaks between fragments", async ({
    page,
  }) => {
    await installClipboardRecorder(page);
    await openArticle(page, FIXTURE);
    await switchMode(page);
    const spanned = await spanSelectionAcrossConsecutiveBlocks(page);
    expect(spanned, "two consecutive text blocks in scrolling mode").not.toBeNull();
    await page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Slot 1: Default" })
      .click();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);

    const controls = await openHighlightControls(page);
    await controls.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(highlightControls(page)).toContainText("Copied.");

    // The stored span joins fragments with the structural single newline;
    // the copied passage renders it as a paragraph break (blank line).
    const rows = await highlightRows(page, FIXTURE);
    expect(rows).toHaveLength(1);
    const exact = rows[0]!.exact;
    expect(exact, "the fixture span must be multi-block").toContain("\n");
    const written = await lastWrite(page);
    expect(written).toBe(exact.split("\n").join("\n\n"));
    expect(written).toContain("\n\n");
  });

  test("paginated: a rejected clipboard write announces honest failure with a next step — never success", async ({
    page,
  }) => {
    await installClipboardSabotage(page);
    await openArticle(page, FIXTURE);
    await createSingleBlockHighlight(page);
    const controls = await openHighlightControls(page);
    await controls.getByRole("button", { name: "Copy", exact: true }).click();

    // The failure line names the refusal AND gives the next step; the
    // success copy appears nowhere; the editor stays open with focus inside.
    await expect(highlightControls(page)).toContainText(
      "Couldn't copy. Select the highlighted text and copy it manually.",
    );
    await expect(highlightControls(page)).not.toContainText("Copied.");
    await expect(highlightControls(page)).toBeVisible();
    const focusInside = await page.evaluate(
      () => document.activeElement?.closest("dialog#highlight-popover") !== null,
    );
    expect(focusInside, "focus remains within the annotation dialog").toBeTruthy();

    // A retry fails just as honestly (no transient success ever flashes).
    await highlightControls(page).getByRole("button", { name: "Copy", exact: true }).click();
    await expect(highlightControls(page)).toContainText(
      "Couldn't copy. Select the highlighted text and copy it manually.",
    );
    await expect(highlightControls(page)).not.toContainText("Copied.");
    // The failed action wrote nothing and deleted nothing.
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);
  });

  test("keyboard: Copy is reachable and operable from the keyboard in paginated mode", async ({
    page,
  }) => {
    await installClipboardRecorder(page);
    await openArticle(page, FIXTURE); // default mode is paginated
    await createSingleBlockHighlight(page);

    // Keyboard activation path: focus the mark, Enter opens the controls.
    const mark = page.locator("mark.highlight").first();
    await mark.focus();
    await page.keyboard.press("Enter");
    const controls = highlightControls(page);
    await expect(controls).toBeVisible();

    const copyButton = controls.getByRole("button", { name: "Copy", exact: true });
    await copyButton.focus();
    await page.keyboard.press("Enter");
    await expect(controls).toContainText("Copied.");

    const rows = await highlightRows(page, FIXTURE);
    expect(await lastWrite(page)).toBe(rows[0]!.exact);
    // Keyboard activation keeps focus on the button — the reader can Tab on.
    expect(
      await copyButton.evaluate((el) => el === document.activeElement),
      "focus stays on Copy after keyboard activation",
    ).toBeTruthy();
  });

  test("keyboard: Copy works identically in scrolling mode", async ({ page }) => {
    await installClipboardRecorder(page);
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await createSingleBlockHighlight(page);

    const mark = page.locator("mark.highlight").first();
    await mark.focus();
    await page.keyboard.press("Enter");
    const controls = highlightControls(page);
    await expect(controls).toBeVisible();
    const copyButton = controls.getByRole("button", { name: "Copy", exact: true });
    await copyButton.focus();
    await page.keyboard.press("Enter");
    await expect(controls).toContainText("Copied.");
    const rows = await highlightRows(page, FIXTURE);
    expect(await lastWrite(page)).toBe(rows[0]!.exact);
  });

  for (const outcome of ["resolve", "reject"] as const) {
    for (const reopenSame of [true, false]) {
      test(`delayed clipboard ${outcome} cannot enter a ${reopenSame ? "reopened" : "different"} panel session`, async ({
        page,
      }) => {
        await page.addInitScript((outcome) => {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: () =>
                new Promise<void>((resolve, reject) => {
                  Object.defineProperty(window, "__finishCopy", {
                    configurable: true,
                    value: () =>
                      outcome === "resolve"
                        ? resolve()
                        : reject(new DOMException("Denied", "NotAllowedError")),
                  });
                }),
            },
          });
        }, outcome);
        await page.goto(`${BASE}/?clipboard-harness`);
        await openArticle(page, FIXTURE);
        await switchMode(page);
        await createSingleBlockHighlight(page);
        if (!reopenSame) {
          const block = await findFirstBlockWithText(page, 60);
          expect(await selectRangeInBlock(page, block, 30, 54)).toBeTruthy();
          await page
            .locator(".selection-toolbar")
            .getByRole("button", { name: "Slot 1: Default" })
            .click();
          await expect.poll(() => countHighlightsInDexie(page, FIXTURE)).toBe(2);
        }
        await openHighlightControls(page);
        await highlightControls(page).getByRole("button", { name: "Copy", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(highlightControls(page)).not.toBeVisible();
        const mark = page.locator("mark.highlight").nth(reopenSame ? 0 : 1);
        await mark.focus();
        await page.keyboard.press("Enter");
        await expect(highlightControls(page)).toBeVisible();
        await page.evaluate(async () => {
          (window as unknown as { __finishCopy: () => void }).__finishCopy();
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        await expect(highlightControls(page)).not.toContainText("Copied.");
        await expect(highlightControls(page)).not.toContainText("Couldn't copy.");
      });
    }
  }

  test("each denied retry updates the status region", async ({ page }) => {
    await installClipboardSabotage(page);
    await openArticle(page, FIXTURE);
    await createSingleBlockHighlight(page);
    await openHighlightControls(page);
    const copy = highlightControls(page).getByRole("button", { name: "Copy", exact: true });
    await copy.click();
    const status = highlightControls(page).locator(".annotation-panel-footer > [role=status]");
    await expect(status).toContainText("Couldn't copy.");
    // Observe the live-region seam: the same words need a fresh DOM change
    // for assistive technology to receive the second operation's outcome.
    await status.evaluate((el) => {
      const state = { changes: 0 };
      Object.defineProperty(window, "__copyStatusChanges", { configurable: true, value: state });
      new MutationObserver(() => {
        state.changes++;
      }).observe(el, { childList: true, subtree: true, characterData: true });
    });
    await copy.click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __copyStatusChanges: { changes: number } }).__copyStatusChanges
              .changes,
        ),
      )
      .toBeGreaterThan(0);
    await expect(status).toContainText("Couldn't copy.");
    await expect(status).not.toContainText("Copied.");
  });

  test("chromium: the real OS clipboard receives exactly the passage", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "cross-engine clipboard read is Chromium-proven");
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await createSingleBlockHighlight(page);
    const controls = await openHighlightControls(page);
    await controls.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(controls).toContainText("Copied.");

    const rows = await highlightRows(page, FIXTURE);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(rows[0]!.exact);
  });
});
