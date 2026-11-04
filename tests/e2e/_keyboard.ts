// tests/e2e/_keyboard.ts
// Shared keyboard-walk plumbing (issue #254). ONE home for the walk-start
// precondition so no spec re-derives it (REUSE-DO-NOT-FORK — the a11y spec's
// tabWalkFrom used to focus its start silently, and the Plan 13-10 incident
// happened exactly that way: the header export button had moved into the
// annotations drawer, focus() on the hidden button no-op'd, and the walk
// started from wherever focus happened to rest — the order claim was then
// about the wrong origin entirely).
//
// Engine-specific keyboard behavior stays where it is documented (the
// webkit sequential-focus subsets in a11y.spec.ts, the toc-geometry
// per-engine Tab-out divergence) — this module only proves the START.
import { type Locator, type Page } from "@playwright/test";

/** Describe the current activeElement for actionable precondition messages. */
async function describeActiveElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return "null (no active element)";
    if (el === document.body) return "body";
    if (el === document.documentElement) return "html";
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : "";
    return `<${el.tagName.toLowerCase()}${id}${cls}>`;
  });
}

/**
 * Focus a keyboard walk's named start element and PROVE the focus landed
 * before any navigation key is sent.
 *
 * Fails AT THE PRECONDITION with an actionable message when:
 *   - the start element is not visible — focus() would silently no-op and
 *     the walk would start wherever focus happens to rest; open the surface
 *     that owns the element (a closed drawer/disclosure is the usual cause),
 *     or fix a stale selector;
 *   - focus() did not land — the element is unfocusable, covered by an
 *     overlay/inert subtree, or focus was immediately stolen.
 */
export async function focusWalkStart(page: Page, start: Locator, label?: string): Promise<void> {
  const name = label ?? start.toString();
  const target = start.first();
  if (!(await target.isVisible())) {
    throw new Error(
      `keyboard-walk precondition failed: walk start ${name} is not visible — focus() would silently no-op and the walk would begin wherever focus happens to rest. Open the surface that owns it (a closed drawer/disclosure?) or fix the stale selector.`,
    );
  }
  await target.focus();
  const landed = await target.evaluate((el) => el === document.activeElement);
  if (!landed) {
    const active = await describeActiveElement(page);
    throw new Error(
      `keyboard-walk precondition failed: focus() did not land on walk start ${name} (activeElement is ${active}). The element may be unfocusable, covered by an overlay/inert subtree, or focus was immediately stolen.`,
    );
  }
}

/**
 * Walk Tab from a PROVEN start (see {@link focusWalkStart}) toward
 * `targetSelector`, polling after each press for the focus to actually
 * move (quiet boxes land in one round-trip; starved runners get the full
 * press budget instead of a missed match). Returns whether the target was
 * reached — the CALLER's assertion owns the order verdict, so a bounded
 * miss stays a boolean, not a thrown mid-walk error.
 */
export async function tabWalkFrom(
  page: Page,
  startSelector: string,
  targetSelector: string,
  maxPresses = 8,
): Promise<boolean> {
  await focusWalkStart(page, page.locator(startSelector).first(), `"${startSelector}"`);
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    // Observable focus landing (issue #185 round 6 — was a fixed 60ms pace).
    let matched = false;
    try {
      await page.waitForFunction(
        (selector) => document.activeElement?.matches(selector) ?? false,
        targetSelector,
        { timeout: 250 },
      );
      matched = true;
    } catch {
      matched = false; // a bounded miss — the caller's assertion owns the verdict
    }
    if (matched) return true;
  }
  return false;
}
