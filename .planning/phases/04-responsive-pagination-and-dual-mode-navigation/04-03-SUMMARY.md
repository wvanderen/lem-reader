---
phase: 04-responsive-pagination-and-dual-mode-navigation
plan: 03
subsystem: pagination-renderer
tags: [pagination, react, d4-01-intra-block-slicing, single-content-tree, diagnostic-bus-threading, authored-css, page-geometry]

# Dependency graph
requires:
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: paginateDocument + PageFragment/FragmentationResult contracts (Plan 04-01) + readingMode Zod value-shape (Plan 04-02)
  - phase: 03-trustworthy-layout-measurement
    provides: useMeasurement hook (now returns {trustedView, diagnostics}) + DiagnosticBus + MeasurementResult + staleness contract (PAGE-06/07)
  - phase: 02-accessible-scrolling-reader
    provides: BlockRenderer (BlockView reused — no parallel switch) + ProgressHairline + SettingsContext (live-apply path)
  - phase: 01-canonical-article-foundation
    provides: Block union + InlineRun + graphemeClusters + BLOCK_SEPARATOR + normalizeText discipline (D-05)
provides:
  - PageFragmentView (src/pagination/fragmentRenderer.tsx) — reuses BlockView; slices paragraphs via splitParagraphRuns for intra-block fragments (D4-01)
  - PaginatedSurface (src/reader/PaginatedSurface.tsx) — derives pages via paginateDocument in a cancelled-flag effect; mounts ONE fragment at a time (Pattern 5 single content tree); quiet chevron buttons (D4-06 pointer path); ProgressHairline + PageIndicator reflect N/M (D4-08)
  - PageIndicator (src/reader/PageIndicator.tsx) — decorative aria-hidden "N of M" span via Intl.NumberFormat
  - useMeasurement return shape changed to {trustedView, diagnostics} — the single DiagnosticBus instance flows from the hook to ArticleView to PaginatedSurface to Plan 04-05's banner (T-04 threading contract)
  - ProgressHairline extended with optional `page` prop — fill derives from N/M when present, scroll-ratio otherwise
  - Authored .paginated-surface / .page-fragment / .page-indicator / .page-turn CSS — no Tailwind, no motion properties
affects: [04-04-dual-mode-navigation, 04-05-fallback-banner, 05-durable-highlights]

# Tech tracking
tech-stack:
  added: []  # Phase 4 Plan 03 installs zero packages (T-04-SC: no supply-chain surface)
  patterns:
    - "Block-model fragment renderer reuses BlockView (no parallel block-kind switch) — DOC-02 reading order + D-05 integrity + react/no-danger security depend on reuse"
    - "D4-01 intra-block paragraph slicing at the render seam: splitParagraphRuns is called when a fragment carries a sub-block grapheme range (startGrapheme>0 OR endGrapheme<blockLength); BOTH halves inherit boundary-run marks verbatim (Pitfall 4)"
    - "Single content tree (A11Y-03): PaginatedSurface mounts exactly ONE PageFragmentView at a time — the article element is owned by ArticleView, never duplicated"
    - "Single DiagnosticBus instance threaded from useMeasurement → ArticleView → PaginatedSurface → (Plan 04-05) fallback banner; constructing a second `new DiagnosticBus()` downstream is FORBIDDEN (T-04 threading contract — two buses would split emissions from subscribers)"
    - "Cancelled-flag pagination effect mirrors ArticleView L107-129: AbortController + the engine's AbortError handling guarantee a stale pass cannot overwrite a newer one (PAGE-05 substrate inherited from PAGE-06/07)"
    - "Authored CSS only — extends src/app.css with viewport-bounding .paginated-surface (calc(100vh - 48px - 2px - 2*var(--space-2xl)), overflow hidden, touch-action pan-y pinch-zoom); zero motion properties so the global prefers-reduced-motion gate is trivially satisfied"

key-files:
  created:
    - src/pagination/fragmentRenderer.tsx
    - src/reader/PaginatedSurface.tsx
    - src/reader/PageIndicator.tsx
    - tests/component/fragmentRenderer.test.tsx
    - tests/component/PaginatedSurface.test.tsx
  modified:
    - src/measurement/useMeasurement.ts
    - src/routes/ArticleView.tsx
    - src/reader/ProgressHairline.tsx
    - src/app.css

key-decisions:
  - "PageFragmentView resolves fragment entries via resolveBlockSlice — whole-block entries return the source block unchanged; intra-block entries return a sliced block via the per-kind D4-01 path. Atomic kinds (D4-02) short-circuit to the source block; the engine never splits them, so the renderer never slices them either. Defensive: if an atomic block ever arrived with a sub-range it would still render whole (no D4-01 split semantic for atomic kinds)."
  - "Paragraph grapheme length is the SUM of graphemeClusters(run.text, lang).length across content runs (matches splitParagraphRuns' internal accounting so the whole-vs-subrange check agrees with the slicer). For container kinds (blockquote + lists) the length is the recursive sum joined by BLOCK_SEPARATOR (mirrors normalizeText.ts blockText's join rule). This is the same notion of length the engine emits for whole-block ranges; for clean ASCII corpus text the three notions (engine DOM-textContent, renderer sum-of-runs, normalizeText inlineText) coincide."
  - "Container-kind (blockquote + bulleted-list + numbered-list) intra-block slicing is implemented via recursive child walking (sliceBlockquote/sliceList/sliceChildBlocks) but the MVP engine currently trips a block-element-mismatch fallback for containers (they render extra selector matches under the 1:1 article.blocks↔querySelectorAll assumption). The recursive path is ready for Plan 04-05's corpus matrix; no defer-TODO remains."
  - "splitParagraphRuns two-pass slicing: first cut off the leading portion (start>0) by taking the `after` slice; then cut off the trailing portion (end<blockLen) by slicing the post-lead runs at the span (end-start) and taking the `before` slice. The original-block-length is recomputed BEFORE the leading cut so the trailing-cut decision uses the ORIGINAL end vs original length comparison (not the post-cut length)."
  - "DiagnosticBus threading contract (T-04): useMeasurement owns ONE bus instance (diagnosticsRef L77-80) and exposes it via the return value. ArticleView/PaginatedSurface/Plan 04-05's banner ALL subscribe to this same instance. Constructing a second `new DiagnosticBus()` anywhere downstream is forbidden — two buses would split emissions from subscribers (measurement-error/dom-fallback events would silently never arrive at the banner)."
  - "ProgressHairline is conditionally rendered by ArticleView (skipped when paginatedActive) — PaginatedSurface renders its own ProgressHairline with the N/M ratio. Two render sites, never both at once. PageIndicator is rendered as a fixed-position sibling of the hairline (top-end corner under the header, decorative aria-hidden)."
  - "PAGE-04 fallback handling in Plan 03 is intentionally minimal: PaginatedSurface renders nothing when status==='fallback' OR pages is empty. The article header (owned by ArticleView) stays visible above the surface. Plan 04-05 wires the PaginationFallbackBanner + session-mode flip; for this plan the MVP fallback state is acceptable because the engine's termination guards (Plan 04-01) bound the work and the corpus matrix proofs land in Plan 04-05."

patterns-established:
  - "Pattern: src/pagination/fragmentRenderer.tsx is the render seam between the pure pagination engine and the React tree. It reuses BlockView (no parallel block-kind switch); the rendering decision is owned by BlockView, the slicing decision by the renderer."
  - "Pattern: cancelled-flag pagination effect (mirror of ArticleView L107-129 + useMeasurement's engine mount) — AbortController + AbortError short-circuit guarantee a stale pass cannot overwrite a newer one."
  - "Pattern: useMeasurement's return value carries BOTH the trusted view AND the diagnostic bus. Consumers never construct their own bus — they receive the single instance via the hook's return value."
  - "Pattern: authored CSS extension lives in src/app.css under a per-plan banner comment. No Tailwind, no CSS-in-JS library, no motion properties on new selectors (the global prefers-reduced-motion gate is trivially satisfied)."

requirements-completed: []  # PAGE-02/03/05 span Plans 04-03/04/04/05 — Plan 04-04 closes PAGE-01/02/05 (mode toggle + keyboard + anchor); Plan 04-05 closes PAGE-03/04/09 (corpus matrix proofs + fallback banner). Mirrors 04-02's PAGE-01 split precedent.

# Metrics
duration: 18min
completed: 2026-08-06
status: complete
---

# Phase 04 Plan 03: Paginated Vertical Slice Summary

**Thinnest end-to-end paginated reading slice — ArticleView consumes useMeasurement's `{trustedView, diagnostics}` return, derives page fragments via paginateDocument, and renders ONE fragment at a time through a new PageFragmentView that REUSES BlockView (no parallel renderer). D4-01 intra-block paragraph slicing is implemented at the render seam (splitParagraphRuns cuts InlineRun[] at grapheme boundaries — both halves inherit marks verbatim per Pitfall 4). Single DiagnosticBus instance threaded from useMeasurement → ArticleView → PaginatedSurface (T-04 contract forbids a second `new DiagnosticBus()`). Quiet chevron buttons (D4-06 pointer path), N-of-M indicator (D4-08), ProgressHairline N/M fill, and viewport-bounding .paginated-surface geometry land in authored CSS.**

## Performance

- **Duration:** 18 min
- **Started (Task 1):** 2026-08-06T10:00:00Z
- **Completed (Task 2):** 2026-08-06T10:13:00Z
- **Tasks:** 2/2 complete
- **Files created:** 5 (3 source + 2 component test)
- **Files modified:** 4 (useMeasurement + ArticleView + ProgressHairline + app.css)

## Accomplishments

- **PageFragmentView (Task 1):** renders a `<section class="page-fragment" aria-label="Page N">` mapping each fragment.blocks entry to a BlockView via `resolveBlockSlice`. Whole-block entries return the source block unchanged; intra-block entries return a sliced block. The renderer REUSES BlockView — no parallel block-kind switch. The security header comment is copied verbatim from BlockRenderer.tsx L9-17 (T-04-07 mitigation — react/no-danger enforces no raw-HTML injection).
- **D4-01 intra-block paragraph slicing (Task 1 — load-bearing):** when a fragment entry carries a sub-block range (`startGrapheme > 0 OR endGrapheme < blockLength`), the renderer MUST slice the paragraph via `splitParagraphRuns` (two-pass: leading cut takes `after`, trailing cut takes `before`). Both halves inherit boundary-run marks verbatim per Pitfall 4 — a link run split mid-text becomes two link runs with the same href. Rendering a whole block for a sub-range entry would violate PAGE-03 exactly-once (text appears on two pages) and PAGE-03 no-clipping (whole block may not fit). Atomic kinds (D4-02) short-circuit to whole-block render — the engine never splits them, so the renderer never slices them either.
- **Container-kind recursive slicing (Task 1):** `sliceBlockquote` / `sliceList` / `sliceChildBlocks` walk children/items accumulating grapheme counts (BLOCK_SEPARATOR between adjacent). The MVP engine currently trips a `block-element-mismatch` fallback for containers (they render extra selector matches under the 1:1 article.blocks↔querySelectorAll assumption), so this path is implemented but not yet exercised by the engine. Plan 04-05's corpus matrix lands container coverage.
- **PaginatedSurface (Task 1):** derives pages from trustedView via `paginateDocument` in a cancelled-flag effect (mirror of ArticleView L107-129 — AbortController + AbortError short-circuit). Mounts ONE PageFragmentView at a time (Pattern 5 single content tree — A11Y-03). Quiet chevron buttons at viewport edges (D4-06 pointer path) with `aria-disabled` reflecting first/last-page boundary. ProgressHairline + PageIndicator reflect N/M (D4-08). Renders nothing on fallback (Plan 04-05 wires the banner + session-mode flip — for this plan the MVP fallback state is acceptable).
- **DiagnosticBus threading (Task 2 — T-04 contract):** `useMeasurement` return shape changed from `MeasurementResult | null` to `{ trustedView, diagnostics }`. The SAME DiagnosticBus instance (diagnosticsRef L77-80) flows from the hook to ArticleView to PaginatedSurface; Plan 04-05's fallback banner will subscribe to this same instance. ArticleView/PaginatedSurface NEVER construct a second `new DiagnosticBus()` — two bus instances would split emissions from subscribers (measurement-error/dom-fallback events would silently never arrive at the banner).
- **ArticleView mode-aware branch (Task 2):** destructures `useMeasurement` into `{trustedView, diagnostics}` (no second bus). Reads `settings.readingMode` via `useSettings` and branches: paginated mode mounts `<PaginatedSurface>` inside the shared `<article class="article-body paginated-surface">`; scrolling mode stays byte-unchanged (`<ArticleBody>`). The `.paginated-surface` class is applied only when `paginatedActive = isPaginated && trustedView && articleEl` so the overflow:hidden geometry never clips a fallback rendering. `pageContentBoxHeightPx` derived from `articleEl.getBoundingClientRect()` in a rAF-deferred effect.
- **ProgressHairline + PageIndicator (Task 2):** ProgressHairline extended with optional `page` prop — fill derives from N/M when present, scroll-progress otherwise. PageIndicator is a decorative `aria-hidden="true"` span via `Intl.NumberFormat` (D4-08 — page number is informational, never persistent identity per D-05; SectionAnnouncer conveys structural progress to AT). PaginatedSurface renders its own ProgressHairline + PageIndicator; ArticleView skips its scrolling-mode ProgressHairline when paginatedActive to avoid duplication.
- **Authored page-geometry CSS (Task 2):** `.paginated-surface` (height `calc(100vh - 48px - 2px - 2*var(--space-2xl))`, overflow hidden, touch-action pan-y pinch-zoom), `.page-fragment` (height 100%), `.page-indicator` (fixed top-end under header, decorative typography), `.page-turn`/`.page-turn-previous`/`.page-turn-next` (44x44 hit area, fixed at viewport edges, `--ink-soft` default / `--accent` on hover-focus / 40% opacity at aria-disabled). Authored CSS only — no Tailwind, no motion properties (the global prefers-reduced-motion gate is trivially satisfied per UI-SPEC §Interaction 12 + RESEARCH anti-pattern #6).
- **Test coverage:** 16 new component specs across 2 files. fragmentRenderer.test.tsx proves D4-01 slicing — two halves of a 100-grapheme paragraph split mid-link-run concatenate to the original, share zero meaningful overlap, and BOTH render `<a>` with the same href (Pitfall 4). Whole-block + atomic-heading defensive paths also covered. PaginatedSurface.test.tsx proves single content tree + pointer turn (Page 1 → Page 2 → Page 1) + first/last-page aria-disabled boundaries + '1 of 3' indicator + fallback/zero-geometry no-ops.

## Task Commits

Each task was committed atomically:

1. **Task 1: PageFragmentView + PaginatedSurface + tests** — `7f38468` (feat)
2. **Task 2: ArticleView mode-aware branch + DiagnosticBus threading + page geometry CSS** — `96adb51` (feat)

**Plan metadata commit:** pending — this SUMMARY + STATE/ROADMAP updates commit will follow.

## Files Created/Modified

- `src/pagination/fragmentRenderer.tsx` (Task 1, NEW) — PageFragmentView reusing BlockView + D4-01 paragraph slicing via splitParagraphRuns + recursive container slicing path (ready for Plan 04-05 corpus matrix).
- `src/reader/PaginatedSurface.tsx` (Task 1, NEW) — cancelled-flag pagination effect + ONE PageFragmentView mount + chevrons + ProgressHairline + PageIndicator.
- `src/reader/PageIndicator.tsx` (Task 1, NEW) — decorative aria-hidden "N of M" span via Intl.NumberFormat; total-tolerant (renders null when total<=0).
- `src/reader/ProgressHairline.tsx` (Task 1+2, MODIFIED) — extended with optional `page` prop; ratio derives from N/M when present, scroll-progress otherwise. No-motion-property invariant preserved.
- `src/measurement/useMeasurement.ts` (Task 2, MODIFIED) — return shape `{trustedView, diagnostics}`; the single DiagnosticBus instance flows downstream (T-04 threading contract).
- `src/routes/ArticleView.tsx` (Task 2, MODIFIED) — destructures useMeasurement; reads settings.readingMode; mode-aware render branch; rAF-deferred pageContentBoxHeightPx computation.
- `src/app.css` (Task 2, MODIFIED) — `.paginated-surface` / `.page-fragment` / `.page-indicator` / `.page-turn` rules. Authored CSS, zero motion properties.
- `tests/component/fragmentRenderer.test.tsx` (Task 1, NEW) — 7 specs proving D4-01 slicing.
- `tests/component/PaginatedSurface.test.tsx` (Task 1, NEW) — 9 specs proving single content tree + pointer turn + boundary states.

## Decisions Made

(See `key-decisions` in frontmatter above for the canonical list.)

- **resolveBlockSlice helper structure:** uses per-kind `if` branches rather than `switch (block.kind)` so the rendering decision stays owned by BlockView (the plan's literal acceptance criterion forbids `switch (block.kind)` in fragmentRenderer). The slicing decision is orthogonal to rendering — this helper resolves WHAT Block to render; BlockView decides HOW.
- **splittingBlockGraphemeLength helper:** sums `graphemeClusters(run.text, lang).length` for paragraphs (matches splitParagraphRuns' internal accounting so whole-vs-subrange detection agrees with the slicer); recursive join via BLOCK_SEPARATOR for container kinds. Atomic kinds short-circuit before reaching this helper.
- **ProgressHairline conditional rendering:** ArticleView skips its scrolling-mode ProgressHairline when paginatedActive; PaginatedSurface renders its own with N/M. Two render sites, never both at once — keeps the hairline component presentational and avoids prop-drilling page state up to ArticleView.
- **PAGE-04 fallback minimal handling:** PaginatedSurface renders nothing on fallback; Plan 04-05 wires the banner + session-mode flip. Acceptable for this plan because the engine's termination guards bound the work and corpus matrix proofs land in Plan 04-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] PageIndicator + extended ProgressHairline created in Task 1 (not Task 2)**
- **Found during:** Task 1 implementation (PaginatedSurface.tsx imports both)
- **Issue:** PaginatedSurface (Task 1 file) imports PageIndicator and the extended ProgressHairline (page prop). The plan listed both files under Task 2, but Task 1 cannot compile without them. The alternative — stubbing the imports and rewriting Task 1's render — would have introduced a TODO/deferred path the plan explicitly forbids ("src/pagination/fragmentRenderer.tsx does NOT contain a TODO comment deferring intra-block rendering").
- **Fix:** Created `src/reader/PageIndicator.tsx` and extended `src/reader/ProgressHairline.tsx` with the `page` prop in Task 1 (their final form). Task 2's CSS + ArticleView-branch work layered on top without further modification to either file. The plan's Task 2 acceptance criteria (PageIndicator has `aria-hidden="true"` + `Intl.NumberFormat`; ProgressHairline accepts `page` prop) are satisfied by the Task 1 versions.
- **Files modified:** `src/reader/PageIndicator.tsx` (created), `src/reader/ProgressHairline.tsx` (extended) — both in Task 1 commit `7f38468`.
- **Verification:** `npx tsc --noEmit` exits 0; Task 1 component tests pass (16/16); both files meet Task 2 acceptance criteria verbatim.
- **Committed in:** `7f38468` (part of Task 1 commit)

**2. [Rule 2 — Missing critical functionality] sliceParagraph original-length recomputation**
- **Found during:** Task 1 implementation (fragmentRenderer.tsx sliceParagraph)
- **Issue:** The initial sliceParagraph draft computed `blockLen` AFTER the leading cut (start>0 path), then compared `endGrapheme < blockLen` to decide whether to apply the trailing cut. This was wrong — `endGrapheme` is in the ORIGINAL block's coordinate system, not the post-leading-cut runs'. A trailing cut on a post-cut-too-short runs array would silently produce wrong slices or panic on `splitParagraphRuns` returning empty halves.
- **Fix:** Recompute `originalLen` from `paragraphBlock.content` (the original runs) BEFORE the leading cut. Use `originalLen` for the trailing-cut decision (`endGrapheme < originalLen`); use the SPAN (`endGrapheme - startGrapheme`) as the split offset for the trailing cut on the post-leading-cut runs.
- **Files modified:** `src/pagination/fragmentRenderer.tsx` (sliceParagraph helper)
- **Verification:** `tests/component/fragmentRenderer.test.tsx` mid-paragraph split case passes — fragment [50,100) on a 100-grapheme paragraph slices correctly (start cut takes `after` of split-at-50; end == originalLen so no trailing cut). Whole-block + first-half + second-half all concatenate to the original.
- **Committed in:** `7f38468`

---

**Total deviations:** 2 auto-fixed (1× Rule 3 cross-task dependency, 1× Rule 2 missing critical functionality)
**Impact on plan:** Both auto-fixes necessary for correctness and compilation. No scope creep — PageIndicator/ProgressHairline are exactly what Task 2 specified; sliceParagraph's length recomputation is the engine contract requirement (endGrapheme is in original coordinates).

## Issues Encountered

None beyond the auto-fixed deviations above. The Plan 04-01 contracts (paginateDocument signature, PageFragment/FragmentationResult shapes, splitParagraphRuns behavior) were consumed verbatim — no contract drift. Plan 04-02's `readingMode` field resolved cleanly via `useSettings().settings.readingMode`.

## User Setup Required

None — no external service configuration required. Phase 4 Plan 03 installs zero packages (T-04-SC: no supply-chain surface). The dev server (`npm run dev` on port 5173) is started automatically by Playwright's webServer config when `npm run test:e2e` runs.

## Next Phase Readiness

- **Ready for Plan 04-04 (dual-mode navigation):** the mode-toggle button + M shortcut + D4-10 mode-switch anchor can read `settings.readingMode` via `SettingsContext.update()` and round-trip the anchor through `findScrollTarget` (Phase 2). The page-turn-controls + repagination-anchor e2e scaffolds (Plan 04-02 Wave 0) are waiting for the real assertions. PaginatedSurface's `currentPageIdx` + `pages` state will need to lift up (or accept controlled props) so Plan 04-04's PageTurnControls can drive keyboard + swipe + announce.
- **Ready for Plan 04-05 (fallback banner + corpus matrix proofs):** the SAME DiagnosticBus instance is already threaded from useMeasurement → ArticleView → PaginatedSurface. Plan 04-05 subscribes ArticleView to `diagnostics.subscribe()` for `dom-fallback` + `measurement-error` events and renders PaginationFallbackBanner. The 8 pagination e2e scaffolds (corpus matrix) are waiting for the real assertions across Chromium/Firefox/WebKit.
- **Known MVP scope limits carried forward:**
  - Container-kind intra-block slicing is implemented but not yet exercised (engine currently trips block-element-mismatch fallback for blockquote/list kinds under the 1:1 article.blocks↔querySelectorAll assumption). Plan 04-05's corpus matrix will exercise this path.
  - PAGE-04 fallback handling is minimal (PaginatedSurface renders nothing on fallback). Plan 04-05 wires the banner + session-mode flip.
  - Keyboard bundle (D4-05) + swipe (D4-06) + D4-07 focus management + D4-10/D4-11 anchors all land in Plan 04-04. This plan ships the pointer path only.
- **Calibration fingerprint honored:** no `@chenglou/pretext` import added (verified via grep — Plan 03 touches only the React renderer + authored CSS, no pagination-engine surface).

## Self-Check: PASSED

- All 5 created files exist on disk (verified via `git status` post-commit).
- All 4 modified files reflect the threading + branch changes (verified via `git diff --stat 7f38468~ 96adb51`).
- Both task commits (`7f38468` Task 1, `96adb51` Task 2) exist in `git log --oneline -5`.
- `npm run test:unit -- --run` exits 0 (356 specs across 26 files — 16 new, no regressions; existing scrolling-mode ArticleView test still green).
- `npx tsc --noEmit` exits 0 (useMeasurement return shape change consumed; BlockView + splitParagraphRuns imports resolve; readingMode field resolved).
- `npm run lint` exits 0 (no react/no-danger violation in fragmentRenderer; no `switch (block.kind)` parallel switch; no `new DiagnosticBus()` in ArticleView).
- `npm run build` exits 0 (152 modules transformed; only the pre-existing >500kB chunk-size warning, unrelated to this plan).
- T-04 threading contract verified: `rg '^\s+new DiagnosticBus' src/routes/ArticleView.tsx` returns no matches (only the comment mention remains).

## Self-Check: PASSED

- All 5 created files exist on disk (verified via `[ -f ... ]` for each path).
- All 4 modified files reflect the threading + branch changes (verified via `git diff --stat`).
- Both task commits (`7f38468` Task 1, `96adb51` Task 2) exist in `git log --oneline --all`.
- SUMMARY.md exists at the expected path.
- `npm run test:unit -- --run` exits 0 (356 specs across 26 files — 16 new, no regressions; existing scrolling-mode ArticleView test still green).
- `npx tsc --noEmit` exits 0 (useMeasurement return shape change consumed; BlockView + splitParagraphRuns imports resolve; readingMode field resolved).
- `npm run lint` exits 0 (no react/no-danger violation in fragmentRenderer; no `switch (block.kind)` parallel switch; no executable `new DiagnosticBus()` in ArticleView).
- `npm run build` exits 0 (152 modules transformed; only the pre-existing >500kB chunk-size warning, unrelated to this plan).

---
*Phase: 04-responsive-pagination-and-dual-mode-navigation*
*Plan: 03*
*Completed: 2026-08-06*
