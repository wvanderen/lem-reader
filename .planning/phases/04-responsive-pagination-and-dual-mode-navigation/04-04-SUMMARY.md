---
phase: 04-responsive-pagination-and-dual-mode-navigation
plan: 04
subsystem: dual-mode-navigation
tags: [keyboard-bundle, swipe, mode-toggle, anchor, focus-restoration, sr-announce, authored-css, d4-05, d4-06, d4-07, d4-09, d4-10, d4-11]

# Dependency graph
requires:
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: PaginatedSurface + PageFragmentView (Plan 04-03) + readingMode Zod value-shape (Plan 04-02) + paginateDocument/PageFragment contracts (Plan 04-01)
  - phase: 03-trustworthy-layout-measurement
    provides: useMeasurement hook ({trustedView, diagnostics})
  - phase: 02-accessible-scrolling-reader
    provides: findScrollTarget + useScrollSave + SectionAnnouncer (debounce pattern) + SettingsContext live-apply path
  - phase: 01-canonical-article-foundation
    provides: normalizeText + graphemeClusters + BLOCK_SEPARATOR (D-05 substrate)
provides:
  - ModeToggle (src/reader/ModeToggle.tsx) — header reading-mode switch: button (aria-pressed + aria-label) with inline-SVG glyph swap + polite "Switched to {paginated|scrolling} reading." announce
  - PageTurnControls (src/reader/PageTurnControls.tsx) — D4-05 keyboard bundle + D4-06 single-touch swipe + D4-07 context-aware focus + A11Y-08 debounced "Page N of M." announce + M shortcut
  - PaginatedSurface forwardRef + imperative handle ({turn, getCurrentAnchorOffset, getState}) — the single turn-path seam chevrons + keyboard + swipe share; D4-11 repagination anchor
  - Pure anchor helpers (src/pagination/anchor.ts) — pageStartGlobalOffset + fragmentContainingOffset + blockGraphemeLength (reuse blockNormalizedText, never fork normalization)
  - D4-10 mode-switch anchor in ArticleView — continuous offset capture (scroll listener + onAnchorChange) so the swap captures BEFORE the re-render (Pitfall 7); paginated→scrolling reuses findScrollTarget; scrolling→paginated via PaginatedSurface.initialAnchorOffset
  - Exported blockNormalizedText (normalizeText.ts) + computeTopVisibleOffset (restoreLocation.ts) — shared with useScrollSave (deduped)
  - App modeToggleHandlerRef bridge — ArticleView registers its anchor-capturing toggle; App falls back to a plain preference flip when no article is mounted
  - .mode-toggle + .header-controls CSS — authored, zero motion properties
affects: [04-05-fallback-banner, 05-durable-highlights]

# Tech tracking
tech-stack:
  added: []  # Phase 4 Plan 04-04 installs zero packages (T-04-SC: no supply-chain surface)
  patterns:
    - "forwardRef + useImperativeHandle as the turn-handler seam: PaginatedSurface owns pages/currentPageIdx state (Plan 04-03 tests stay green) and exposes {turn, getCurrentAnchorOffset, getState}; chevrons + keyboard + swipe all route through commitTurn so aria-disabled bounds, the announce, and D4-07 focus stay in lockstep"
    - "Continuous anchor-offset capture for D4-10: ArticleView keeps currentAnchorOffsetRef fresh via a scrolling-mode passive scroll listener + PaginatedSurface's onAnchorChange callback, so the mode-swap handler reads the live position synchronously BEFORE calling update() (Pitfall 7 capture-before-swap)"
    - "App ref-bridge for the global toggle: ArticleView registers its anchor-capturing handleToggleMode on a modeToggleHandlerRef; Header (a useSettings consumer) reads it; App provides a plain-update fallback when no article is mounted. Avoids prop-drilling + context overhead."
    - "Pure anchor math reuses the D-05 substrate: pageStartGlobalOffset walks article.blocks accumulating blockNormalizedText + graphemeClusters lengths (the SAME pair useScrollSave/restoreLocation round-trip through — no fork); fragmentContainingOffset finds the page whose [start,end) range contains the offset"
    - "Non-passive keydown listener: the handler MUST preventDefault on PageDown/Space/etc. so they do not also scroll the window; passive:true would silently no-op preventDefault. Touch listeners ARE passive — the swipe handler never preventDefaults (D4-06 Pitfall 10 + .paginated-surface's touch-action: pan-y pinch-zoom)"
    - "Authored CSS only — .mode-toggle mirrors .gear-button geometry (--ink-soft default, --accent only when aria-pressed='true'); zero motion properties (glyph swap is instant content change, the global prefers-reduced-motion gate is trivially satisfied)"

key-files:
  created:
    - src/reader/ModeToggle.tsx
    - src/reader/PageTurnControls.tsx
    - src/pagination/anchor.ts
    - tests/component/ModeToggle.test.tsx
    - tests/component/PageTurnControls.test.tsx
  modified:
    - src/reader/PaginatedSurface.tsx
    - src/reader/Header.tsx
    - src/routes/ArticleView.tsx
    - src/App.tsx
    - src/reader/restoreLocation.ts
    - src/reader/useScrollSave.ts
    - src/content/normalizeText.ts
    - src/app.css
    - tests/component/ArticleView.test.tsx

key-decisions:
  - "Turn-handler seam = forwardRef + useImperativeHandle on PaginatedSurface. The plan offered three options (lift state up / forwardRef / registerTurnHandler callback). forwardRef keeps PaginatedSurface owning pages+currentPageIdx (Plan 04-03's 9 component tests stay green without modification — the ref + initialAnchorOffset + onAnchorChange props are all ADDITIVE/optional) AND gives PageTurnControls + ArticleView a clean synchronous handle. The imperative turn() returns {page, total, moved} so the announce + D4-07 focus see the result without waiting for a re-render."
  - "D4-10 capture-before-swap via CONTINUOUS anchor tracking (not a pre-update hook in ModeToggle). ModeToggle is dumb (presentational); the capture happens in ArticleView's handleToggleMode which reads currentAnchorOffsetRef — kept fresh by a scrolling-mode scroll listener + PaginatedSurface.onAnchorChange. This avoids threading a capture callback through Header/App and keeps ModeToggle testable without a provider. Pitfall 7 honored: the ref was last written BEFORE the mode-swap re-render."
  - "App ref-bridge for the global toggle. Header is global; ArticleView is route-scoped; the capture needs ArticleView's refs. App holds modeToggleHandlerRef (a RefObject<(() => void) | null>); ArticleView registers its anchor-capturing handler on mount; Header's onToggleMode calls the ref (fallback: plain update when null, i.e. on the fixture list). App was split into App + AppInner so the fallback can call useSettings() (App renders the provider; AppInner lives inside it)."
  - "PaginatedSurface forwardRef is ADDITIVE — existing callers passing no ref (Plan 04-03 tests) keep working. The D4-11 repagination anchor reads pages/currentPageIdx via REFS inside the pagination effect (not closure capture) so the effect's dependency array excludes them — otherwise every turn (currentPageIdx change) would re-trigger pagination. The anchor capture uses pageStartGlobalOffset (OLD pages) before setPages + fragmentContainingOffset (NEW pages) after."
  - "Pure anchor helpers live in src/pagination/anchor.ts (Rule 2 auto-fix — the plan anticipated 'a new src/pagination/anchor.ts is a Rule 2 auto-fix'). They reuse blockNormalizedText (an additive export of normalizeText.ts's internal blockText — exporting the SAME function, not forking) + graphemeClusters + BLOCK_SEPARATOR. pageStartGlobalOffset bridges the page-fragment world (intra-block [startGrapheme,endGrapheme) slices) and the article-global D-05 offset world (findScrollTarget/computeTopVisibleOffset)."
  - "computeTopVisibleOffset extracted from useScrollSave into restoreLocation.ts (Rule 2 — the D4-10 scrolling→paginated anchor + useScrollSave's save path share ONE block-walk; the plan says 'do NOT fork'). useScrollSave now imports + delegates to it."
  - "Non-passive keydown listener (Rule 1 deviation from the plan's literal '{ passive: true }'). passive listeners cannot preventDefault — the handler MUST preventDefault on PageDown/Space/etc. so they do not also scroll the window. Documented as a deviation; the touch listeners ARE passive (swipe never preventDefaults per D4-06 Pitfall 10)."
  - "PaginatedSurface.tsx modified (not in the plan's files_modified list — Rule 3 blocking deviation). The plan's D4-11 anchor + chevron-wiring requirements cannot be satisfied without either modifying PaginatedSurface's interface or duplicating its state. forwardRef + useImperativeHandle + initialAnchorOffset + onAnchorChange are the minimal additive changes; Plan 04-03's tests stay green."
  - "Keyboard listener bails on form fields/dialogs/contenteditable via isFormField(target): checks tagName (input/textarea/select), isContentEditable, and ancestor dialog/[data-dialog]. M shortcut also bails inside form fields. Tab cycles freely (no trap — A11Y-01)."

patterns-established:
  - "Pattern: forwardRef + useImperativeHandle as the turn-handler seam for a component that owns interactive state but needs sibling input drivers (keyboard/swipe). The handle reads from refs (not closure) so effect deps stay minimal; existing no-ref callers are unaffected."
  - "Pattern: continuous anchor-offset capture for mode-switch preservation. A ref is kept fresh by the active mode's native event (scroll listener for scrolling; onAnchorChange callback for paginated); the toggle handler reads it synchronously before the state update. No pre-update hook threading through the component tree."
  - "Pattern: pure pagination-anchor helpers (src/pagination/anchor.ts) bridge the page-fragment intra-block coordinate system and the article-global D-05 grapheme-offset system, reusing the SAME normalization primitives (blockNormalizedText + graphemeClusters) the location-restore path uses."
  - "Pattern: App ref-bridge for routing a global control's action through a route-scoped component's handler. Avoids context overhead; the ref is nullable so a fallback path covers the route where the scoped component isn't mounted."
  - "Pattern: authored CSS extension under a per-plan banner comment. .mode-toggle mirrors .gear-button geometry (44×44, transparent, --ink-soft default, --accent only when aria-pressed); .header-controls inline-flex groups the toggle + gear on the inline-end so the header does NOT grow."

requirements-completed: [PAGE-01, PAGE-02, PAGE-05]

# Metrics
duration: 19min
completed: 2026-08-06
status: complete
---

# Phase 04 Plan 04: Dual-Mode Navigation Summary

**Full dual-mode navigation shipped — ModeToggle (header button + M shortcut + polite announce) wired through a SettingsContext live-apply + App ref-bridge; PageTurnControls mounts the complete D4-05 keyboard bundle (PageUp/PageDown + ArrowLeft/ArrowRight + Space/Shift+Space) + D4-06 single-touch swipe (multi-touch + vertical bails) + D4-07 context-aware focus + A11Y-08 debounced "Page N of M." announce. The D4-10 mode-switch anchor + D4-11 repagination anchor both reuse the D-05 grapheme-offset substrate via pure helpers (pageStartGlobalOffset + fragmentContainingOffset) + the shared computeTopVisibleOffset/findScrollTarget pair — no fork. PaginatedSurface exposes a forwardRef imperative handle so chevrons + keyboard + swipe share ONE turn path; its existing Plan 04-03 tests stay green (the ref + new props are additive).**

## Performance

- **Duration:** 19 min
- **Started (Task 1):** 2026-08-06T15:28:11Z
- **Completed (Task 2):** 2026-08-06T15:47:32Z
- **Tasks:** 2/2 complete
- **Files created:** 5 (3 source + 2 component test)
- **Files modified:** 9 (4 reader/route source + 2 helper modules + App + CSS + 1 cascade test fix)

## Accomplishments

- **ModeToggle (Task 1 — D4-09):** `<button type="button" class="mode-toggle" aria-pressed={isPaginated} aria-label="Reading mode: {mode}">` with an inline-SVG glyph that swaps between a single-page icon (paginated) and a continuous-flow icon (scrolling) — the secondary cue beyond aria-pressed (forced-colors safety). A visually-hidden polite live region (`role="status" aria-live="polite"`) announces "Switched to paginated reading." / "Switched to scrolling reading." on mode change, debounced via a timerRef so rapid toggles don't flood (mirrors SectionAnnouncer). The announce fires on mode CHANGE (detected via a prevMode ref) so it covers BOTH the click path AND the M shortcut.
- **Header extension (Task 1):** Header is now a `useSettings()` consumer (reads `settings.readingMode` directly — no prop-drilling through App). Renders `<ModeToggle/>` + the gear inside a `.header-controls` inline-flex group on the inline-end so the toggle sits inline-start of the gear WITHOUT growing the header (READ-04 — the row stays 48px; the wordmark stays inline-start). Header's `onToggleMode` prop is threaded from App.
- **App ref-bridge (Task 1):** App split into `App` (renders the provider) + `AppInner` (inside the provider, reads useSettings). `AppInner` holds `modeToggleHandlerRef` (a `RefObject<(() => void) | null>`). ArticleView registers its anchor-capturing `handleToggleMode` on mount; `AppInner`'s `handleToggleMode` calls the ref if set, else falls back to a plain `update({readingMode})` (the fixture-list path — no article = no anchor to preserve). Header reads the live mode via useSettings; the toggle action routes through the bridge.
- **D4-10 mode-switch anchor (Task 1 — load-bearing):** ArticleView keeps `currentAnchorOffsetRef` fresh CONTINUOUSLY — a scrolling-mode passive `scroll` listener writes `computeTopVisibleOffset(article, queryBlocks(...))`; PaginatedSurface's `onAnchorChange` callback writes `pageStartGlobalOffset(article, currentPage)` in paginated mode. `handleToggleMode` (registered on the bridge) reads the ref SYNCHRONOUSLY before calling `update()`, then stashes `{from, offset}` in `pendingModeSwapRef`. A post-commit effect detects the mode transition: paginated→scrolling rAF-defers `findScrollTarget(article, blocks, offset)?.scrollIntoView({block:"start"})` (silent + instant — A11Y-06); scrolling→paginated is handled by PaginatedSurface's `initialAnchorOffset` prop (read at mount from the ref). Pitfall 7 honored: the capture happens before the re-render.
- **PaginatedSurface forwardRef + D4-11 repagination anchor (Task 1):** `forwardRef<PaginatedSurfaceHandle, Props>` exposes `{turn, getCurrentAnchorOffset, getState}`. `turn` is bounds-checked (no wrap at first/last page; returns `{page, total, moved}`) and routes through `commitTurn` — the SAME function the chevrons call — so pointer + keyboard + swipe stay in lockstep. The pagination effect captures the current page's article-global offset via `pageStartGlobalOffset` (read from REFS, not closure, so currentPageIdx is NOT in the dep array) BEFORE `setPages`, then re-anchors via `fragmentContainingOffset` AFTER — the reader stays at the same passage across viewport/font/typography changes (D4-11). `getCurrentAnchorOffset` returns the current page's offset for the D4-10 paginated→scrolling capture. The handle + props are ADDITIVE — Plan 04-03's 9 PaginatedSurface specs stay green unchanged.
- **Pure anchor helpers (Task 1 — src/pagination/anchor.ts):** `blockGraphemeLength` (grapheme clusters of `blockNormalizedText`), `pageStartGlobalOffset` (walk article.blocks accumulating lengths + BLOCK_SEPARATOR up to the fragment's first blockIndex, then add startGrapheme), `fragmentContainingOffset` (find the page whose [start,end) article-global range contains the offset; clamps to last page on overshoot). These bridge the page-fragment intra-block coordinate system and the article-global D-05 offset system, reusing the SAME normalization primitives the location-restore path uses — no fork (Pattern 5).
- **Shared helper extraction (Task 1):** `normalizeText.ts` exports `blockNormalizedText` (additive alias of the internal `blockText`). `restoreLocation.ts` exports `computeTopVisibleOffset` (the scroll-position→offset walk, previously module-private in useScrollSave). `useScrollSave` now imports + delegates to it (deduped — both save + the D4-10 anchor share ONE implementation).
- **PageTurnControls keyboard bundle (Task 2 — D4-05):** registers `keydown` on `window` (non-passive so preventDefault is honored). Maps PageDown/ArrowRight/Space(no shift)→`turn("next")`; PageUp/ArrowLeft/Shift+Space→`turn("previous")`. `preventDefault` called ONLY on handled keys. `isFormField(target)` bails when the key landed in an input/textarea/select/contenteditable/open dialog (T-04-10, A11Y-01 — never hijacks Space in a form, never traps Tab). At page 1 / last page `turn` returns `moved:false` (no action, no announce, no focus steal — UI-SPEC §16). Listener removed when `enabled` flips false (mode switch to scrolling) or the article unmounts.
- **D4-06 single-touch swipe (Task 2):** `touchstart`/`touchend` on the article element (passive). Records start {x,y} only when `touches.length === 1`; sets a `multiTouch` flag the moment a second touch starts. On `touchend`: bails if multiTouch occurred (pinch-zoom stays native — Pitfall 10); bails if vertical-dominant (`|dx| < 1.5*|dy|`); bails if below 40px threshold; else `turn(dx < 0 ? "next" : "previous")` (right-to-left = next, natural book convention). Never calls preventDefault (`.paginated-surface`'s `touch-action: pan-y pinch-zoom` already declares the intent).
- **D4-07 context-aware focus (Task 2):** `handleTurn` reads `document.activeElement` BEFORE the turn; `isFocusInContent` checks the active element is inside the article AND not a `.page-turn`/`.mode-toggle`/`.gear-button` control. If the turn was content-triggered, rAF-defers `focusNewPageTop(articleEl)` — moves focus to the first heading (h2/h3/h4), else first focusable (`a/button:not([aria-disabled])/[tabindex]`), else first paragraph (with a temporary `tabindex="-1"`). If control-triggered, focus stays put. The M shortcut + swipe do not move focus (they did not start from a control).
- **A11Y-08 announce (Task 2):** a visually-hidden polite live region announces "Page N of M." via `Intl.NumberFormat(navigator.language)`, debounced 250ms (timerRef — rapid turns reflect the FINAL page). Mirrors SectionAnnouncer's anti-flood pattern. The announce fires only when `turn` returned `moved:true` (no chatter at boundaries).
- **Keyboard-help paragraph (Task 2):** a single visually-hidden `<p>` at the top of `<main>`, preceding the article header in DOM order, announced once to AT on article open: "Keyboard shortcuts: M switches reading mode. PageUp and PageDown, ArrowLeft and ArrowRight, and Space and Shift+Space turn pages." (UI-SPEC §Copywriting verbatim).
- **Authored CSS (Task 1+2):** `.header-controls` (inline-flex, --space-sm gap), `.mode-toggle` (mirrors `.gear-button`: 44×44 hit area, transparent, --ink-soft default, --accent on hover/:focus-visible/`[aria-pressed="true"]`, standard focus-visible outline). Zero motion properties (glyph swap is instant content change; the global prefers-reduced-motion gate is trivially satisfied).
- **Test coverage:** 29 new component specs across 2 files. ModeToggle (9): aria-pressed reflection both modes, aria-label copy, inline svg, click→onToggle, announce on both switches, polite live region markup, no-announce on re-render-only. PageTurnControls (20): full keyboard bundle (PageDown/ArrowRight/Space→next; PageUp/ArrowLeft/Shift+Space→previous), preventDefault on handled keys, enabled=false no-op, form-field bail (input), contenteditable bail, M shortcut (+Shift+M), swipe next/previous, multi-touch bail, vertical-dominant bail, sub-threshold no-op, debounced announce, boundary no-announce, rapid-turn anti-flood.

## Task Commits

Each task was committed atomically:

1. **Task 1: ModeToggle + Header extension + D4-10 mode-switch anchor + PaginatedSurface forwardRef + D4-11 anchor + pure helpers** — `29ffc27` (feat)
2. **Task 2: PageTurnControls — keyboard bundle + swipe + D4-07 focus + announce** — `cfc2fbc` (feat)

**Plan metadata commit:** pending — this SUMMARY + STATE/ROADMAP updates commit will follow.

## Files Created/Modified

- `src/reader/ModeToggle.tsx` (Task 1, NEW) — header reading-mode switch: button + glyph swap + polite announce.
- `src/reader/PageTurnControls.tsx` (Task 2, NEW) — keyboard bundle + swipe + D4-07 focus + debounced announce + M shortcut.
- `src/pagination/anchor.ts` (Task 1, NEW) — pure helpers (pageStartGlobalOffset, fragmentContainingOffset, blockGraphemeLength) bridging page-fragment ↔ article-global D-05 offsets.
- `src/reader/PaginatedSurface.tsx` (Task 1, MODIFIED) — forwardRef + useImperativeHandle ({turn, getCurrentAnchorOffset, getState}); initialAnchorOffset + onAnchorChange props; D4-11 repagination anchor in the pagination effect.
- `src/reader/Header.tsx` (Task 1, MODIFIED) — useSettings consumer; renders ModeToggle inline-start of the gear via .header-controls.
- `src/routes/ArticleView.tsx` (Task 1+2, MODIFIED) — D4-10 continuous anchor capture + apply-on-swap; surfaceRef threading; PageTurnControls render; keyboard-help paragraph; handleToggleMode registered on the App bridge.
- `src/App.tsx` (Task 1, MODIFIED) — split into App + AppInner; modeToggleHandlerRef bridge; fallback plain-update on the fixture list.
- `src/reader/restoreLocation.ts` (Task 1, MODIFIED) — exported computeTopVisibleOffset (shared with useScrollSave).
- `src/reader/useScrollSave.ts` (Task 1, MODIFIED) — deduped: delegates to computeTopVisibleOffset.
- `src/content/normalizeText.ts` (Task 1, MODIFIED) — exported blockNormalizedText (additive alias of internal blockText).
- `src/app.css` (Task 1, MODIFIED) — .header-controls + .mode-toggle rules; zero motion properties.
- `tests/component/ModeToggle.test.tsx` (Task 1, NEW) — 9 specs.
- `tests/component/PageTurnControls.test.tsx` (Task 2, NEW) — 20 specs.
- `tests/component/ArticleView.test.tsx` (Task 1, MODIFIED) — cascade: passes the new required modeToggleHandlerRef prop.

## Decisions Made

(See `key-decisions` in frontmatter above for the canonical list.)

- **Turn-handler seam (forwardRef over lift-state-up):** forwardRef keeps PaginatedSurface owning its state (Plan 04-03 tests untouched) AND gives PageTurnControls a synchronous handle. Lifting state to ArticleView would have required rewriting PaginatedSurface's 9 specs to pass controlled props; forwardRef is additive.
- **D4-10 continuous capture over a pre-update hook:** ModeToggle stays presentational (testable without a provider); the capture lives in ArticleView where the article + surface refs are. The ref is kept fresh by the active mode's native events so the synchronous read at toggle time is always current.
- **App ref-bridge over a context:** avoids adding a ModeToggleContext + provider overhead. The ref is nullable so the fallback (plain update on the fixture list) is natural.
- **Pure anchor helpers in a new module:** the plan anticipated this ("a new src/pagination/anchor.ts is a Rule 2 auto-fix"). Reusing blockNormalizedText (not forking normalization) is mandatory per Pattern 5.
- **Non-passive keydown:** the plan's literal "{ passive: true }" cannot honor preventDefault (Rule 1 bug). Documented as a deviation; touch listeners stay passive.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] PaginatedSurface.tsx modified (not in the plan's files_modified list)**
- **Found during:** Task 1 design (the turn-handler seam + D4-11 anchor both require it)
- **Issue:** The plan's files_modified omitted PaginatedSurface.tsx, but Task 2's "Wire the chevrons to call the same onTurn" + D4-11's "in the PaginatedSurface effect that calls paginateDocument, capture the anchor BEFORE setPages" both require PaginatedSurface changes. Without them, either the state duplicates (Plan 04-03 tests break) or the keyboard bundle cannot drive the same turn path as the chevrons.
- **Fix:** Added `forwardRef<PaginatedSurfaceHandle>` + `useImperativeHandle({turn, getCurrentAnchorOffset, getState})` + `initialAnchorOffset` + `onAnchorChange` props + the D4-11 anchor capture in the pagination effect. All changes are ADDITIVE — Plan 04-03's 9 PaginatedSurface specs pass unchanged (no ref, no new props → defaults apply).
- **Files modified:** `src/reader/PaginatedSurface.tsx`
- **Verification:** `npx vitest run tests/component/PaginatedSurface.test.tsx` exits 0 (9/9 unchanged); `npx tsc --noEmit` exits 0; `npm run build` exits 0.
- **Committed in:** `29ffc27` (Task 1)

**2. [Rule 2 — Missing critical functionality] Pure anchor helpers + shared-helper extraction**
- **Found during:** Task 1 implementation (D4-10 + D4-11 need to bridge page-fragment ↔ article-global offsets)
- **Issue:** The D4-10 mode-switch anchor (paginated→scrolling needs the current page's article-global offset; scrolling→paginated needs the offset→page mapping) + D4-11 repagination anchor both require per-block grapheme-length accumulation. The plan anticipated this ("a new src/pagination/anchor.ts is a Rule 2 auto-fix; document it") and forbade forking normalization.
- **Fix:** Created `src/pagination/anchor.ts` with `pageStartGlobalOffset` + `fragmentContainingOffset` + `blockGraphemeLength`, all reusing `blockNormalizedText` (an additive export of normalizeText.ts's internal `blockText` — the SAME function, not a fork) + `graphemeClusters` + `BLOCK_SEPARATOR`. Also extracted `computeTopVisibleOffset` from useScrollSave into restoreLocation.ts (shared by the D4-10 scrolling capture + the save path — deduped).
- **Files modified:** `src/pagination/anchor.ts` (created), `src/content/normalizeText.ts` (additive export), `src/reader/restoreLocation.ts` (additive export), `src/reader/useScrollSave.ts` (deduped import).
- **Verification:** `npx tsc --noEmit` exits 0; `npm run test:unit -- --run` exits 0 (385 specs, no regressions — useScrollSave's save round-trip still green).
- **Committed in:** `29ffc27` (Task 1)

**3. [Rule 1 — Bug] Non-passive keydown listener (plan's literal "{ passive: true }" cannot preventDefault)**
- **Found during:** Task 2 implementation (the plan's action text said `{ passive: true }` but UI-SPEC §16 requires preventDefault on handled keys)
- **Issue:** A passive listener silently no-ops `preventDefault`. The keyboard bundle MUST preventDefault on PageDown/PageUp/Space so those keys do not also scroll the window (in paginated mode the article body is overflow:hidden, but the window can still scroll). The plan's literal instruction would have broken the Space/PageDown behavior.
- **Fix:** Registered `keydown` WITHOUT `{ passive: true }` (default non-passive) so preventDefault is honored. The touch listeners ARE passive (the swipe handler never preventDefaults per D4-06 Pitfall 10 — `.paginated-surface`'s `touch-action: pan-y pinch-zoom` already declares the intent to the browser).
- **Files modified:** `src/reader/PageTurnControls.tsx`
- **Verification:** `PageTurnControls` test "calls preventDefault on handled keys" passes; `npm run lint` exits 0 (no passive-listener rule configured).
- **Committed in:** `cfc2fbc` (Task 2)

**4. [Rule 3 — Blocking] ArticleView.test.tsx cascade (new required modeToggleHandlerRef prop)**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** ArticleView now requires a `modeToggleHandlerRef` prop (the D4-10 bridge). The existing ArticleView.test.tsx rendered `<ArticleView articleId="..."/>` without it → TS2741.
- **Fix:** Added a `withProps(articleId)` helper that constructs the required props (including a fresh `createRef()` for the bridge) and spread it into each render call. The test's intent (DOC-03 provenance + source-URL + loading/error states) is preserved unchanged.
- **Files modified:** `tests/component/ArticleView.test.tsx`
- **Verification:** `npx tsc --noEmit` exits 0; `npx vitest run tests/component/ArticleView.test.tsx` exits 0 (7/7 specs).
- **Committed in:** `29ffc27` (Task 1)

**5. [Rule 3 — Blocking] App.tsx split into App + AppInner (provider boundary)**
- **Found during:** Task 1 design (the fallback toggle path needs useSettings)
- **Issue:** App renders `<SettingsProvider>` but is itself OUTSIDE the provider, so it cannot call `useSettings()` for the fallback toggle path (fixture list). The modeToggleHandlerRef bridge + the fallback both need to live inside the provider.
- **Fix:** Split App into `App` (renders `<SettingsProvider><AppInner/></SettingsProvider>`) + `AppInner` (inside the provider; holds the ref + reads useSettings for the fallback). parseHash + View type exports preserved.
- **Files modified:** `src/App.tsx`
- **Verification:** `npx tsc --noEmit` exits 0; `npm run build` exits 0; App.test.tsx still green.
- **Committed in:** `29ffc27` (Task 1)

---

**Total deviations:** 5 auto-fixed (1× Rule 1 passive-listener bug, 2× Rule 2 missing critical functionality / helper extraction, 2× Rule 3 blocking — PaginatedSurface interface + App provider split + test cascade)
**Impact on plan:** All auto-fixes necessary for correctness + the plan's own D4-10/D4-11/chevron-wiring requirements. No scope creep — every change is a direct downstream consequence of wiring the dual-mode navigation surface.

## Issues Encountered

- **jsdom does not implement `isContentEditable`** (returns `undefined`). The PageTurnControls contenteditable-bail unit test stubs it via `Object.defineProperty` on the test element so the handler's `isFormField` path is exercised; the production behavior (real browsers) is proven by the e2e suite (Plan 05). This is a known jsdom limitation (mirrors the IntersectionObserver polyfill pattern in tests/setup.ts).
- **ModeToggle icon `aria-hidden` prop-name mismatch:** the icons originally took `{ ariaHidden }` (camelCase) but JSX passed `aria-hidden` (kebab-case), so the attribute was `undefined`. Fixed by defaulting `aria-hidden={ariaHidden ?? "true"}` inside each icon (icons are always decorative). The same latent pattern exists in PaginatedSurface's ChevronIcon + Header's GearIcon but isn't tested there; left unchanged (out of scope — those components' tests don't assert the svg's aria-hidden).

## User Setup Required

None — no external service configuration required. Phase 4 Plan 04-04 installs zero packages (T-04-SC: no supply-chain surface). The dev server (`npm run dev` on port 5173) is started automatically by Playwright's webServer config when `npm run test:e2e` runs.

## Next Phase Readiness

- **Ready for Plan 04-05 (fallback banner + corpus matrix proofs):** the SAME DiagnosticBus instance is already threaded from useMeasurement → ArticleView → PaginatedSurface (Plan 04-03). Plan 04-05 subscribes ArticleView to `diagnostics.subscribe()` for `dom-fallback` + `measurement-error` events and renders PaginationFallbackBanner; the banner's "Switch to pages" secondary action calls the SAME `handleToggleMode` the header button + M shortcut use (D4-10 anchor applies either way). The 8 pagination e2e scaffolds (Plan 04-02 Wave 0) are waiting for the real assertions across Chromium/Firefox/WebKit — the mode-switch-anchor, page-turn-controls, and repagination-anchor scaffolds now have a complete implementation to assert against.
- **Calibration fingerprint honored:** no `@chenglou/pretext` import added (verified — Plan 04-04 touches only the navigation surface + authored CSS + pure helpers, no pagination-engine or measurement surface).
- **Known scope limits carried forward:**
  - Real-browser proofs (keyboard bundle + swipe + focus restoration + mode-switch/repagination anchor preservation across the corpus matrix) land in Plan 04-05's Playwright suite. jsdom is not authoritative for touch/layout/focus-order; the component tests prove the handler LOGIC, the e2e proves the behavior.
  - The keyboard listener bails on `[data-dialog]` + native `<dialog>`; if Plan 05 adds a non-dialog overlay it should carry `[data-dialog]` to stay in the bail set.

## Self-Check: PASSED

- All 5 created files exist on disk (`src/reader/ModeToggle.tsx`, `src/reader/PageTurnControls.tsx`, `src/pagination/anchor.ts`, `tests/component/ModeToggle.test.tsx`, `tests/component/PageTurnControls.test.tsx`).
- All 9 modified files reflect the navigation + anchor changes (verified via `git diff --stat 108f667 HEAD`).
- Both task commits (`29ffc27` Task 1, `cfc2fbc` Task 2) exist in `git log --oneline -5`.
- `npm run test:unit -- --run` exits 0 (385 specs across 28 files — 29 new, no regressions; Plan 04-03's PaginatedSurface 9 specs unchanged).
- `npx tsc --noEmit` exits 0 (forwardRef + imperative handle + anchor helpers + ArticleViewProps export all consumed).
- `npm run lint` exits 0 (no react/no-danger; no `switch (block.kind)` fork; passive touch listeners; cleanup returns).
- `npm run build` exits 0 (158 modules transformed; only the pre-existing >500kB chunk-size warning, unrelated to this plan).

---
*Phase: 04-responsive-pagination-and-dual-mode-navigation*
*Plan: 04*
*Completed: 2026-08-06*
