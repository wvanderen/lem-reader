---
phase: 18-reader-orientation
plan: "02"
subsystem: ui
tags: [toc, popover-api, non-modal, aria-current, focus-management, hash-router-interception, responsive-header, accessibility]

# Dependency graph
requires:
  - phase: 18-reader-orientation
    provides: "18-01 — deriveToc/TocEntry (src/content/toc.ts) + useSectionSpy selector-parameterized shared detection (src/reader/sectionSpy.ts)"
  - phase: 04-reading-experience
    provides: "D5-11 jump tail (fragmentContainingOffset → turnToPage / findScrollTarget → scrollIntoView) + PaginatedSurfaceHandle + the D4-07 rAF/120ms firefox-settle focus guard"
  - phase: 13-text-tools
    provides: "the tag-popover controlled seam (ArticleView L333-375 / tag-popover.spec.ts harness) — Pattern 1 adapted for popover=manual"
provides:
  - TocPanel.tsx — the first non-modal overlay (popover=manual): labeled nav, nested semantic list, aria-current via shared sectionSpy, panel-owned internal scroll, hand-rolled Esc, honest headingless state
  - The toc-trigger header button (5th article-scoped control, D18-02 order [contents][tags][annotations][mode][gear]) + App→Header→ArticleView tocOpen threading with ONE toggle-event close seam
  - handleTocJump — the mode-aware D5-11 jump reused verbatim with [data-block-index] destination focus (visible-surface scoped, measurement clone excluded)
  - The ≤420px staged Reader shell-nav collapse + :focus-visible un-clip (closes the latent Phase 15 wordmark gap in passing)
  - tests/e2e/toc/toc-navigation.spec.ts — core open/jump/focus cells (a)-(f), both modes, 3 engines (extended by 18-04)
affects: [18-reader-orientation (Plans 18-03, 18-04), reader shell geometry at ≤420px]

# Tech tracking
tech-stack:
  added: [] # zero installs (T-18-SC accept)
  patterns:
    - controlled popover=manual seam — prop sync via :popover-open checks + ONE toggle-event listener owning state-reset + focus-restore (no second restore path)
    - width-scoped dismissal policy — matchMedia at event time (≥640px persistent rail, ≤639px sheet outside-pointerdown)
    - document-level Esc scoped to panel+trigger targets only (UI-SPEC rule 3's "(and the trigger)" — covers Esc racing the open-focus rAF)
    - destination focus via [data-block-index] on the visible surface with .closest(".article-body-measurement") exclusion + imperative tabIndex=-1/.toc-destination class

key-files:
  created:
    - src/reader/TocPanel.tsx
    - tests/unit/TocPanel.test.tsx
    - tests/e2e/toc/toc-navigation.spec.ts
  modified:
    - src/app.css
    - src/reader/Header.tsx
    - src/App.tsx
    - src/routes/ArticleView.tsx
    - tests/component/ArticleView.test.tsx

key-decisions:
  - "Esc is a TWO-target contract (UI-SPEC rule 3 verbatim: 'on the open panel (and the trigger)'): TocPanel's React onKeyDown covers focus-in-panel; a document-level listener scoped to panel+trigger covers focus resting on the trigger when Esc arrives before the open-focus rAF lands — the webkit/firefox race the e2e (f) cell surfaced. Never a page-wide Esc hijack"
  - "Per-entry indent lives on li[data-depth], not a ul-level class: mixed-depth siblings under one parent (h2→h5 skip then h3) share ONE child ul, so a single ul-level indent cannot express exact depths — li-level calc(depth * --space-md) keeps D18-10's 'skips nest deeper' exact for every entry"
  - "Open-time behavior defers one rAF so the parent's showPopover commit (parent effects run after child effects) lands before focus/scroll — and jsdom 30 popover reality (closed = display:none, no showPopover) is bridged in the RTL mount helper with an inline display lift, test-only"

requirements-completed: [ORNT-01, ORNT-03, ORNT-04, ORNT-05]

# Metrics
duration: 24min
completed: 2026-08-30
status: complete
---

# Phase 18 Plan 02: Reader-Facing TOC Summary

**Non-modal popover=manual TocPanel with one-toggle-seam focus discipline, canonical-offset jumps in both reading modes, and the sanctioned ≤420px staged header collapse — 21/21 navigation e2e + 75/75 geometry cells across 3 engines**

## Performance

- **Duration:** 24 min (started 2026-08-30T15:59:47Z, completed 2026-08-30T16:23:34Z)
- **Tasks:** 3 (Task 1 TDD: RED → GREEN; Tasks 2-3 auto)
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments
- **TocPanel (ORNT-01/04/05)** — the codebase's first non-dialog overlay: `popover="manual"` container (NO dialog role/modal state/popup hint anywhere — Pitfall 3), h2 "Contents" + `nav aria-label="Table of contents"`, nested semantic ul from deriveToc depth transitions (skips nest deeper at li data-depth, duplicates identical-text AS-IS per D18-11, zero invented entries per D18-10), exactly one `aria-current="true"` entry mapped from the shared sectionSpy ("h2, h3, h4, h5, h6") via data-block-index with Top carrying it above the first heading (D18-12), the honest "This article has no headings." note (D18-13), and open-time focus-on-current-entry with panel-owned offsetTop/scrollTop internal scroll (D18-15 — never any ancestor-scrolling method)
- **Header + App wiring (D18-02)** — the 5th article-scoped trigger FIRST in the group ([contents][tags][annotations][mode][gear]), anatomy mirroring the tags trigger byte-for-byte minus the popup-hint attribute, gated by the same articleMounted condition (the trigger never plays peekaboo — headingless included); `.app-header` renders data-destination; App owns tocOpen with the [view] reset closing through the seam (rule 18)
- **The controlled seam (Pattern 1)** — prop↔`:popover-open` sync (StrictMode-safe), ONE toggle-event listener routing trigger toggle, Esc (panel + trigger targets), entry activation, and ≤639px outside-pointerdown through a single close path with focus-restore-to-trigger exactly once; ≥640px outside clicks never dismiss (persistent rail)
- **Mode-aware jump (ORNT-03, D18-03)** — handleTocJump reuses the D5-11 tail VERBATIM (fragmentContainingOffset → turnToPage / findScrollTarget → scrollIntoView block:start), then focuses the destination via [data-block-index] on the visible surface (measurement clone excluded — Pitfall 7) with tabIndex=-1 + the .toc-destination ring + the D4-07 rAF/120ms double-call; Top → scroll-top/page 1 + articleH1Ref focus (D14-03); hash never assigned, activations intercepted (Pitfall 4 — e2e cell (d) proves no remount)
- **≤420px staged collapse (sanctioned)** — Reader-scoped shell-nav clip (the wordmark mechanism verbatim, never display:none) + strengthen-only :focus-visible un-clip covering both collapsed surfaces (the latent Phase 15 gap closed in passing); single 48px row and five 44px targets preserved
- **Verification** — 10/10 RTL component cells; 21/21 toc-navigation e2e cells (a)-(f) across chromium/firefox/webkit with zero fixed sleeps; 75/75 touch-targets/reflow/high-zoom cells with the 5-button row present; full unit project 1042/1042 green (no regressions); zero package installs; zero Dexie/schema changes

## Task Commits

Each task was committed atomically:

1. **Task 1: TocPanel component + panel CSS + RTL suite (TDD)** — `c0a401a` (test — RED: suite fails on the missing module) → `075ba48` (feat — GREEN: 10/10)
2. **Task 2: Header trigger + App/ArticleView wiring + mode-aware jump + core e2e cells** — `fd49e17` (feat)
3. **Task 3: ≤420px staged shell-nav collapse + geometry audit** — `6ffed3d` (feat)

## Files Created/Modified
- `src/reader/TocPanel.tsx` (NEW) — the non-modal panel component (forwardRef'd container for the parent seam)
- `tests/unit/TocPanel.test.tsx` (NEW) — 10-case RTL suite covering all seven behavior bullets (structure, aria-current + spy mapping via scroll + fake timers, headingless, click/Enter interception, Esc→hidePopover)
- `tests/e2e/toc/toc-navigation.spec.ts` (NEW) — core cells (a)-(f): open+label (headingless included), Esc focus-restore (webkit exception), jump+focus both modes, Enter no-re-route probe, cross-mode destination equivalence, open/close location stability
- `src/app.css` (MODIFIED) — FILE-END blocks: .toc-panel/.toc-title/.toc-list/.toc-empty/.toc-trigger/.toc-destination (existing tokens only, zero motion) + the ≤420px collapse + un-clip rules
- `src/reader/Header.tsx` (MODIFIED) — tocOpen/onToggleToc props, ContentsIcon glyph, trigger first in group, data-destination hook
- `src/App.tsx` (MODIFIED) — tocOpen ownership + threading + [view] reset
- `src/routes/ArticleView.tsx` (MODIFIED) — the seam (sync effect, ONE toggle listener, width-scoped pointerdown, trigger-scoped Esc), resolveTocDestination, handleTocJump, TocPanel mount
- `tests/component/ArticleView.test.tsx` (MODIFIED) — withProps helper gains the two new required props (closed defaults)

## Verification Results
- `npx vitest run tests/unit/TocPanel.test.tsx` — **10/10 pass** (RED `c0a401a` → GREEN `075ba48`, committed atomically)
- `npx playwright test tests/e2e/toc/toc-navigation.spec.ts` — **21/21 pass** (7 cells × chromium/firefox/webkit); chromium-only gate 7/7
- `npx playwright test tests/e2e/touch-targets.spec.ts tests/e2e/reflow.spec.ts tests/e2e/high-zoom.spec.ts` — **75/75 pass** (3 engines, 5-button row + collapse present)
- `npx playwright test tests/e2e/chrome/shell-nav.spec.ts` (adjacent guard) — **21/21 pass** (the 320×640 one-row geometry test now exercises the collapse)
- `npx vitest run --project unit` — **74 files, 1042/1042 green, 0 failed** (1032 pre-existing + 10 new)
- `npx eslint` on all touched files — clean; `npx tsc --noEmit` — only the pre-existing unrelated dexie-migration error (deferred-items.md, unchanged)

## Decisions Made
- **Esc at the trigger is part of the contract, not an afterthought**: the webkit/firefox (f)-cell race (Esc arriving before the open-focus rAF lands, leaving focus on the trigger where the panel keydown never sees it) is exactly why UI-SPEC rule 3 names BOTH targets. The document-level listener is scoped to panel+trigger targets only — rule 3's mechanism, no page-wide hijack, still the ONLY hand-rolled key handling.
- **li-level depth indent over ul-level**: a single child ul can contain mixed-depth siblings (h2→h5 skip then h3), where one ul-level indent class cannot express both depths. `li[data-depth]` + calc(depth × --space-md) keeps every entry at its exact depth while the ul nesting stays purely structural.
- **Open-focus deferred one rAF**: child effects run before parent effects, so the panel's focus/scroll must wait a frame for the parent's showPopover commit — focus would silently fail on a display:none surface otherwise.
- **e2e mode-toggle settle**: toggleMode ends with a deterministic double-rAF (not a fixed sleep) so the D4-10 mode-swap re-anchor's deferred scroll lands BEFORE the spec positions/asserts scroll offsets — the +38px webkit drift was the app's own re-anchor racing the test's scrollTo, not the TOC.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] New required props broke the ArticleView component-test mount**
- **Found during:** Task 2 (tsc gate)
- **Issue:** `tests/component/ArticleView.test.tsx` mounts ArticleView with the full required-prop set; adding tocOpen/onCloseToc produced 10 TS2739 errors
- **Fix:** the withProps helper gained the two props with closed defaults (the established pattern for prior prop additions)
- **Files modified:** tests/component/ArticleView.test.tsx
- **Verification:** tsc clean (modulo the pre-existing dexie-migration error); suite 23/23 with TocPanel
- **Commit:** fd49e17

**2. [Rule 1 - Bug] e2e readiness/visibility selectors matched the hidden measurement clone**
- **Found during:** Task 2 (first e2e run)
- **Issue:** the tag-popover sentinel shape `.article-body:not(.article-body-measurement) [data-block-index]` still matches the clone — the clone is a DESCENDANT of article.article-body, so the :not on the ancestor never excludes the subtree; my destination-visibility assertion resolved to the hidden clone
- **Fix:** adopted the repo-canonical visible-block selector `[data-block-index]:not(.article-body-measurement [data-block-index])` (_edge-invariant.ts) for the sentinel AND the destination locator — strictly stronger than the tag-popover sentinel for this spec's assertions
- **Files modified:** tests/e2e/toc/toc-navigation.spec.ts
- **Verification:** cells (c)/(c-cont)/(e) green on all engines
- **Commit:** fd49e17

### Plan-text adaptations (no rule number — documented for the record)

**3. Manual Esc covers the trigger too** — Plan Task 2 action said "keydown on the open panel"; UI-SPEC rule 3 says "on the open panel (and the trigger)". The webkit race (deviation-adjacent finding above) proved the trigger half load-bearing. Implemented as one document-level listener scoped to the two targets; the TocPanel's own onKeyDown remains the primary path. Commit: fd49e17.
**4. li-level per-depth indent instead of "a ul-level indent class per depth"** — mixed-depth siblings under one parent make ul-level indent inexpressible (see Decisions). Same tokens, same file-end placement, same zero-invention structure. Commit: 075ba48.
**5. RTL mount lifts jsdom's closed-popover display:none with an inline style** — jsdom 30 applies the UA popover rule but implements no showPopover/hidePopover; the helper documents the bridge (real open/close lifecycle stays in Playwright). Commit: 075ba48.

**Total deviations:** 2 auto-fixed (1× Rule 3, 1× Rule 1) + 3 documented adaptations. **Impact:** none on contracts — every locked decision (D18-01..15) and all byte-stable surfaces (parseHash, fragment guard, announcer, 48px constants) are untouched.

## Issues Encountered
None. (The pre-existing dexie-migration TS error remains parked in deferred-items.md — unchanged by this plan.)

## Threat Model Compliance
- **T-18-01 (XSS via heading text): mitigated** — entry text renders as React text children only (auto-escaped); no dangerouslySetInnerHTML anywhere in the new surface
- **T-18-02 (DOM clobbering): mitigated** — no invented string ids; destination resolution is `[data-block-index="${blockIndex}"]` (numeric attribute) on the visible surface
- **T-18-03 (router confusion): mitigated** — click + Enter preventDefault, fragment-only hrefs (#toc-N never starts with #/), parseHash + fragment guard byte-stable, no hash assignment anywhere in the diff — e2e cell (d) proves hash + DOM identity unchanged
- **T-18-04 (focus hijacking): mitigated** — non-modal by construction (no trap possible); one seam restores focus on every close path; Tab flows through (panel is top-layer but un-trapped)
- **T-18-05 (repagination side channel): mitigated** — fixed-position top-layer overlay only; e2e cell (f) asserts scroll/page stability across open-close cycles in both modes
- **T-18-SC (package installs): accepted** — zero installs performed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 18-03 (RestorationMarker) proceeds on untouched seams: the restore effect, ResumeBanner wiring, and app.css blocks are byte-identical to pre-18-02 (this plan did not touch them)
- Plan 18-04 extends toc-navigation.spec (strengthen-only) with the skips/duplicates/h5-h6/chapter corpus + the full toc-geometry.spec cells (320px/400% no-trap, un-clip proof, aria-current scroll tracking) — the harness helpers (openToc/toggleMode/articleHeading, the visible-block selector) are exported shapes within the spec file to copy wholesale
- The ≤639px sheet outside-pointerdown path and the ≤420px collapse geometry get their dedicated e2e proof in 18-04 (this plan's cells prove the navigation contract; the geometry suites prove no regression)

## Self-Check: PASSED
- Files: src/reader/TocPanel.tsx, tests/unit/TocPanel.test.tsx, tests/e2e/toc/toc-navigation.spec.ts — all FOUND; modified files all tracked in the task commits
- Commits: c0a401a, 075ba48, fd49e17, 6ffed3d — all FOUND in git log

---
*Phase: 18-reader-orientation*
*Completed: 2026-08-30*
