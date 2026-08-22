# Debug Session — Mobile page bottom line cutoff

---
status: resolved
created: 2026-08-22
updated: 2026-08-22
trigger: "I noticed on my phone the bottom detection for pages on mobile is off. Bottom line appears to get cut off a bit"
---

## Symptoms

**Expected behavior:** In paginated mode on a phone, the final rendered line on each page remains fully visible above the browser/system bottom chrome.

**Actual behavior:** The page accepts content whose bottom line extends into the obscured lower edge; the supplied Android/Brave screenshot shows the final line clipped behind the browser toolbar.

**Errors:** No runtime error is visible or reported.

**Timeline:** Unknown; reported 2026-08-22.

**Reproduction:** Open a saved article in paginated mode on a mobile viewport with browser bottom chrome visible and navigate to a content-dense page (screenshot: page 3 of 5).

## Evidence

- timestamp: 2026-08-22
  checked: src/app.css paginated geometry and src/routes/ArticleView.tsx viewport measurement
  found: The paginated surface has a definite `height: calc(100vh - 48px - 2px - 2 * var(--space-2xl))`; ArticleView then measures `.page-viewport` from that CSS-sized frame and passes the resulting height to pagination.
  implication: The engine and overflow guard agree with the CSS box, so they cannot detect pixels hidden by mobile browser chrome when legacy `vh` is taller than the currently visible viewport.

- timestamp: 2026-08-22
  checked: src/app.css paginated header cap
  found: The header's 25% max-height repeats the same legacy `100vh` formula.
  implication: Both grid rows must use the same dynamic-viewport basis or the header/page capacity algebra can diverge.

- timestamp: 2026-08-22
  checked: tests/e2e/pagination/no-overflow-invariant.spec.ts
  found: Existing tests compare rendered line boxes to `.page-viewport`, but Playwright's emulated viewport has no dynamic mobile browser toolbar and therefore makes `100vh` and `100dvh` equivalent.
  implication: The existing invariant proves internal pagination correctness but does not falsify the reported browser-chrome occlusion case.

- timestamp: 2026-08-22
  checked: Initial focused unit regression run
  found: The test harness transforms `import.meta.url` to a non-file URL, so `fileURLToPath` failed before collecting tests.
  implication: This is a test-path construction issue, not product behavior; use the Vitest working directory to resolve `src/app.css` and rerun.

## Eliminated

## Current Focus

reasoning_checkpoint:
  hypothesis: "Legacy `100vh` sizes the paginated frame to Android's large/layout viewport, causing ArticleView to paginate into the portion hidden by dynamic bottom browser chrome."
  confirming_evidence:
    - "The live page budget originates from `.paginated-surface`'s explicit `100vh` height and is measured from `.page-viewport`; the paginator has no independent visual-viewport input."
    - "The screenshot's clipping boundary coincides with mobile browser bottom chrome, while the existing DOM overflow guard only compares content against the taller CSS viewport box."
  falsification_test: "The hypothesis would be false if the paginated frame already used the dynamic viewport, or if page capacity were independently clamped to `window.visualViewport.height`; neither is present."
  fix_rationale: "A progressive `100dvh` override makes the source CSS box itself track the visible viewport, so all downstream measurement, pagination, and overflow checks inherit the correct capacity without adding a second geometry source."
  blind_spots: "Headless Playwright cannot render Brave's dynamic toolbar; final confirmation still requires the reporter's physical Android browser."
next_action: "run the focused unit regression, build/typecheck, and Chromium narrow-phone no-overflow matrix"

## Resolution

**root_cause:** The paginated surface and synchronized header cap were sized with legacy `100vh`; on Android browsers with expanded bottom chrome, that layout viewport remains taller than the visible dynamic viewport, so pagination accepted a final line that the toolbar then obscured.

**fix:**

Added progressive `100dvh` overrides to the paginated surface height and its synchronized 25% header cap, retaining `100vh` as the legacy fallback. Added a regression test pinning both dynamic-viewport formulas.

**verification:**

- `npm run test:unit -- --run tests/unit/paginated-mobile-viewport.test.ts` — 1 passed.
- `npm run build` — TypeScript and Vite production build passed (existing bundle-size warning only).
- `npx playwright test tests/e2e/pagination/no-overflow-invariant.spec.ts --project=chromium` — 18 passed, including all six corpus fixtures at the narrow 360x640 viewport.
- Physical Android/Brave confirmation remains recommended because headless Chromium does not render dynamic browser toolbar chrome.

**files_changed:**
- src/app.css
- tests/unit/paginated-mobile-viewport.test.ts
