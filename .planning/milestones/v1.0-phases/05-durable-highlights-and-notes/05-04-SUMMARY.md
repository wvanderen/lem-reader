---
phase: 05-durable-highlights-and-notes
plan: 04
subsystem: annotations
tags: [cross-fragment-slicing, d5-16, ambiguous-orphan, unresolved-marker, forced-colors, shape-distinction, page-fragment, status-driven-rendering]

# Dependency graph
requires:
  - phase: 05-durable-highlights-and-notes
    provides: Plan 05-01 resolveQuoteSelector tri-state (TextPositionSelector | "ambiguous" | "orphan"), HighlightRecordSchema, sliceRunsForHighlights; Plan 05-02 HighlightOverlayProvider/useHighlightOverlay/useOptionalHighlightOverlay seam, InlineList highlightSlices prop, mark.highlight/.has-note/.unresolved CSS; Plan 05-03 AnnotationsDrawer ambiguous/orphan flag slots + disabled jump button + enabled delete
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: PageFragmentSchema (blockIndex + startGrapheme + endGrapheme intra-block ranges), fragmentRenderer resolveBlockSlice range math, anchor.ts pageStartGlobalOffset + blockGraphemeLength + BLOCK_SEPARATOR accumulation, splitParagraphRuns
provides:
  - D5-16 cross-fragment highlight slicing — PageFragmentView intersects each highlight range with each PageFragment entry's article-global visible range and renders a <mark> slice per intersection (all sharing data-highlight-id); a split-block highlight now appears on BOTH pages with no silent gap
  - Status-driven inline rendering — ResolvedHighlight.status threads through HighlightSliceEntry → HighlightSlice → InlineList so ambiguous/orphan highlights render mark.highlight.unresolved (dashed outline) at the stored position hint (orphan) or first candidate (ambiguous) instead of a silent fill
  - AnnotationsDrawer data wiring — ambiguous/orphan entries render the flag copy + a body explanation + disabled jump button + disabled Edit + enabled Delete (D5-04 "delete is always available")
  - ArticleView one-time open-announce — when ≥1 highlight resolves to ambiguous/orphan, "{N} highlight(s) couldn't be relocated." fires ONCE per article-open via the existing .status live region (ref-guarded against CRUD re-renders, reset on article swap)
  - forced-colors shape distinction finalized — mark.highlight.unresolved override inside @media (forced-colors: active) preserves the dashed-outline SHAPE under the UA forced palette; the three inline states (Highlight fill / dotted underline / dashed outline) remain distinguishable by shape alone (A11Y-05)
  - _test_sliceHighlightsForEntry test-only export — the D5-16 intersection math is pure (no DOM, no React), so it is unit-testable in isolation with synthetic article + PageFragment fixtures
affects: [05-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D5-16 cross-fragment slicing = range math ON TOP of the existing resolveBlockSlice path. PageFragmentView does NOT fork a parallel renderer — for each fragment entry it computes the entry's article-global visible range (pageStartGlobalOffset-style accumulation via blockGraphemeLength + BLOCK_SEPARATOR), intersects each highlight range with it, translates non-empty intersections back to entry-local coordinates, and passes per-entry slices to BlockView via sliceRunsForHighlights. A split-block highlight produces a <mark> on EACH containing fragment; both share data-highlight-id."
    - "Status-driven inline modifier: HighlightSliceEntry.status (default 'confident') threads through sliceRunsForHighlights → HighlightSlice.status → InlineList so the renderer emits mark.highlight.unresolved for ambiguous/orphan slices. The renderer is status-aware but layout-agnostic — the SAME InlineList serves scrolling + paginated modes."
    - "PaginatedSurface consumes useOptionalHighlightOverlay() (null-safe — returns null outside the provider so legacy component tests regress nothing) and threads confident + ambiguous/orphan highlights down to PageFragmentView as an optional prop. PageFragmentView itself stays context-free (pure pagination layer) — the React-context dependency lives one layer up in the reader tree."
    - "One-time open-announce via a ref-guarded effect: unresolvedAnnouncedRef.current flips true after the first announce and is reset only on article swap (the load effect clears highlightApiRef.current + the ref together). CRUD operations + debounced note saves re-render the provider but do NOT re-announce — UI-SPEC §Interaction 30 / §Copywriting."
    - "Test-only export of pure helpers: the D5-16 intersection math (_test_sliceHighlightsForEntry) is exported under a _test_ prefix so the pure range arithmetic is jsdom-testable without mounting the full PageFragmentView renderer. The full paginated render proof (real cross-browser layout + real <mark> inspection) stays in Plan 05-05's Playwright suite."

key-files:
  created:
    - tests/unit/annotations/cross-fragment-slicing.test.ts
  modified:
    - src/pagination/fragmentRenderer.tsx
    - src/content/render/BlockRenderer.tsx
    - src/content/render/InlineRenderer.tsx
    - src/annotations/highlightRanges.ts
    - src/reader/PaginatedSurface.tsx
    - src/reader/annotations/AnnotationsDrawer.tsx
    - src/routes/ArticleView.tsx
    - src/app.css

key-decisions:
  - "Threading `status` through the slice types (not a boolean `unresolved: true`): the plan's action text says 'passes the slice with unresolved: true' but UI-SPEC §Copywriting distinguishes the ambiguous aria-label ('Highlight that couldn't be matched') from the orphan aria-label ('Highlight that couldn't be relocated'). A boolean would lose that distinction in InlineRenderer's aria-label branch. Threading the full D5-02 tri-state satisfies both the modifier logic (status !== 'confident' → .unresolved class) AND the per-kind aria-label."
  - "PaginatedSurface consumes the context (not PageFragmentView): the alternative — having PageFragmentView call useOptionalHighlightOverlay() directly — would create a pagination → reader/annotations React-context dependency and break the existing fragmentRenderer.test.tsx tests (which render PageFragmentView without a provider). PaginatedSurface is in src/reader/ where the context dependency is idiomatic (mirrors BlockRenderer.ArticleBody's pattern). PageFragmentView stays a pure props-driven component; the highlights prop is the seam."
  - "Reset unresolvedAnnouncedRef on article swap (not on highlight CRUD): the announce fires ONCE per article-open. The load effect that runs on articleId change resets the ref together with highlightApiRef.current so the new article's eager batch-resolve can fire its own announce if it has unresolved highlights. CRUD operations do NOT reset the ref — the reader is not re-announced every time they save a note."
  - "_test_sliceHighlightsForEntry export prefix: the helper is internal to PageFragmentView's render path but the D5-16 math is pure (no DOM, no React). Exporting under the conventional _test_ prefix keeps the public API clean while making the intersection arithmetic unit-testable. The alternative — testing through PageFragmentView via RTL — would require article fixtures + provider wrapping and would couple the range-math proof to React rendering."

patterns-established:
  - "Ambiguous/orphan highlights are NEVER hidden — they render at their best-effort vicinity (resolvedPosition = first candidate / stored position hint) with the dashed-outline modifier. ANNO-07's 'explicit state instead of silent reattachment' is enforced at the rendering layer (the filter is `h.resolvedPosition !== null`, not `h.status === 'confident'`)."
  - "Cross-fragment marks share data-highlight-id across pages — D5-16's continuity invariant. The same highlight reaching across a page boundary produces N <mark> elements (one per containing fragment) all carrying the same id; the popover/note is reachable from any of them."

requirements-completed: [ANNO-07]

# Metrics
duration: 12min
completed: 2026-08-07
status: complete
---

# Phase 5 Plan 04: Ambiguous/Orphan Surfacing + D5-16 Cross-Fragment Slicing Summary

**Wired the ResolvedHighlight.status field through to inline rendering (mark.highlight.unresolved for ambiguous/orphan), the drawer (flag + body + disabled jump + enabled delete), and ArticleView's one-time "{N} couldn't be relocated" open-announce; landed D5-16 cross-fragment slicing so a split-block highlight renders a `<mark>` slice on EACH page fragment (sharing data-highlight-id — no silent gaps at a page turn) — proven by 7 new pure-math unit tests + 507/507 full suite green.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-07T17:17:52Z
- **Completed:** 2026-08-07T17:25:00Z
- **Tasks:** 2
- **Files modified:** 9 (1 created test, 8 modified existing source/CSS)

## Accomplishments
- Implemented **D5-16 cross-fragment highlight slicing** in `src/pagination/fragmentRenderer.tsx`. `PageFragmentView` now accepts an optional `highlights` prop; for each fragment entry it computes the entry's article-global visible range (mirroring `pageStartGlobalOffset`'s accumulation via `blockGraphemeLength` + `BLOCK_SEPARATOR`), intersects each highlight range with it (`intersectStart = Math.max(h.position.start, entryStart)`, `intersectEnd = Math.min(h.position.end, entryEnd)`), and for any non-empty intersection translates the result back to entry-local coordinates + passes a per-entry `HighlightSliceEntry[]` to `BlockView` via `sliceRunsForHighlights`. A single-block highlight whose block is split across a page boundary therefore produces a `<mark>` slice on EACH containing fragment — both sharing the same `data-highlight-id` (D5-16: no silent gaps at a page turn; the popover/note is reachable from either page).
- Wired **status-driven inline rendering** across three files. `HighlightSliceEntry` + `HighlightSlice` carry the D5-02 tri-state (`status?: "confident" | "ambiguous" | "orphan"`, default `"confident"` for back-compat); `sliceRunsForHighlights` propagates the field through every emitted slice. `InlineRenderer.InlineList` derives both the modifier class (`unresolved` when status !== `"confident"`) AND the aria-label ("Highlight that couldn't be matched: …" for ambiguous / "Highlight that couldn't be relocated: …" for orphan — UI-SPEC §Copywriting) from the slice's status. `BlockRenderer.ArticleBody` dropped the confident-only filter so ambiguous/orphan highlights render at their best-effort vicinity (resolvedPosition = first candidate / stored position hint) — ANNO-07's "explicit state instead of silent reattachment" is enforced at the rendering layer.
- Wired **PaginatedSurface** to consume `useOptionalHighlightOverlay()` and pass confident + ambiguous/orphan highlights down to `PageFragmentView` as the new optional prop. Returns null outside the provider so legacy component tests that render PaginatedSurface without a provider regress nothing.
- Wired **AnnotationsDrawer data** (Plan 05-03 built the slots; this plan fills them). Ambiguous/orphan entries render the existing flag text ("Couldn't find a unique match" / "Couldn't relocate this highlight") PLUS the new explanatory body copy ("The passage may have changed. You can still read the highlighted text below or delete this highlight.") + disabled jump button + disabled Edit + enabled Delete (D5-04 — "delete is always available"). The aria-label appends the visually-hidden note ("This highlight can't be located, so jumping is disabled.") so the disabled-state reason is conveyed to AT.
- Wired **ArticleView one-time open-announce** (D5-04). After the eager batch-resolve completes, the new effect counts unresolved highlights (`highlights.filter(h => h.status !== "confident").length`); if N ≥ 1, it fires ONCE via the existing `.status` live region: `"{N} highlight(s) couldn't be relocated."` (Intl.NumberFormat + pluralized noun). A ref guard (`unresolvedAnnouncedRef`) prevents re-announcing on every provider re-render (CRUD, debounced note save); the load effect resets the ref on article swap so the new article's batch-resolve can fire its own announce. The reader is NOT interrupted — the drawer does not auto-open; the announce directs them to it.
- Finalized **forced-colors shape distinction** in `src/app.css`. Added an explicit `mark.highlight.unresolved` rule inside the existing `@media (forced-colors: active)` block: `background-color: transparent` (so the system Highlight fill does NOT mask the outline) + `outline: 1px dashed CanvasText` + `outline-offset: 1px` + `text-decoration: none` (so the inherited mark.highlight underline doesn't double up). The three inline states (Highlight fill / dotted underline / dashed outline) remain distinguishable by SHAPE alone even if the UA collapses the Highlight/HighlightText pair — this is the A11Y-05 / T-05-16 contract.
- Shipped **7 new pure-math unit tests** in `tests/unit/annotations/cross-fragment-slicing.test.ts`: (1) split-block highlight produces a slice on EACH containing fragment with shared id; (2) within-fragment highlight produces a slice only on that fragment; (3) outside-fragment highlight produces no slice; (4) zero-length intersection at the boundary (end-exclusive) produces no slice; (5) D5-02 status threads through; (6) 3-fragment multi-page split reconstructs the article-global range with no gaps/overlaps; (7) multi-block article offset accumulation includes BLOCK_SEPARATOR. Full unit + component suite 507/507 green; `npm run build` succeeds; ESLint clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: D5-16 cross-fragment highlight slicing + status-driven inline rendering + drawer data + open-announce** — `b511c5d` (feat)
2. **Task 2: Cross-fragment slicing pure-math unit test + forced-colors shape-distinction finalization** — `e198d5d` (test)

## Files Created/Modified

- `src/annotations/highlightRanges.ts` — `HighlightSliceEntry.status` (optional, default `"confident"`); `HighlightSlice.status` (required); `sliceRunsForHighlights` propagates the field through every emitted slice (gap + intersection + trailing slices).
- `src/content/render/InlineRenderer.tsx` — `highlightAriaLabel` branches per status ("Highlight that couldn't be matched: …" / "Highlight that couldn't be relocated: …" / "Highlight: …" / "Highlight with note: …"); InlineList's `<mark>` className appends `unresolved` when status !== `"confident"`.
- `src/content/render/BlockRenderer.tsx` — `ArticleBody`'s effective-highlights filter changed from `status === "confident"` to `resolvedPosition !== null` so ambiguous/orphan highlights render at their best-effort vicinity; `highlightsForBlock` threads `status` into the HighlightSliceEntry.
- `src/pagination/fragmentRenderer.tsx` — `PageFragmentView` accepts optional `highlights` prop; new `sliceHighlightsForEntry` helper computes the per-entry intersection math (exported as `_test_sliceHighlightsForEntry` for pure-math unit testing); BlockView receives the per-entry highlightSlices.
- `src/reader/PaginatedSurface.tsx` — consumes `useOptionalHighlightOverlay()` (null-safe); maps ResolvedHighlight[] → ArticleBodyHighlight[] (resolves-position-non-null filter); passes the result down to PageFragmentView as the `highlights` prop.
- `src/reader/annotations/AnnotationsDrawer.tsx` — adds `drawer-entry-body` span with the explanatory copy ("The passage may have changed. You can still read the highlighted text below or delete this highlight.") for ambiguous/orphan entries; existing flag + disabled jump + disabled Edit + enabled Delete slots are now data-wired.
- `src/routes/ArticleView.tsx` — new `unresolvedAnnouncedRef` + effect that announces "{N} highlight(s) couldn't be relocated." once per article-open when ≥1 unresolved; ref is reset on article swap together with `highlightApiRef.current`.
- `src/app.css` — explicit `mark.highlight.unresolved` rule inside `@media (forced-colors: active)` (transparent bg + 1px dashed CanvasText outline + text-decoration: none) preserves the dashed-outline shape under the UA forced palette.
- `tests/unit/annotations/cross-fragment-slicing.test.ts` — 7 pure-math unit tests against `_test_sliceHighlightsForEntry` with synthetic article + PageFragment fixtures.

## Decisions Made
- **Status field over a boolean:** the plan's action text literally says "passes the slice with `unresolved: true`," but UI-SPEC §Copywriting distinguishes the ambiguous aria-label from the orphan aria-label. A boolean would lose that distinction in InlineRenderer. Threading the full D5-02 tri-state satisfies both the modifier logic (status !== "confident" → .unresolved class) AND the per-kind aria-label.
- **PaginatedSurface consumes the context (not PageFragmentView):** having PageFragmentView call `useOptionalHighlightOverlay()` directly would (a) create a pagination → reader/annotations React-context dependency and (b) break the existing `tests/component/fragmentRenderer.test.tsx` tests that render PageFragmentView without a provider. PaginatedSurface is in `src/reader/` where the context dependency is idiomatic (mirrors `BlockRenderer.ArticleBody`'s pattern). PageFragmentView stays a pure props-driven component; `highlights` is the seam.
- **Reset unresolvedAnnouncedRef on article swap (not on CRUD):** the announce fires ONCE per article-open. The articleId load effect resets the ref together with `highlightApiRef.current` so the new article's eager batch-resolve can fire its own announce. CRUD operations do NOT reset the ref — the reader is not re-announced every time they save a note.
- **`_test_sliceHighlightsForEntry` export prefix:** the helper is internal to PageFragmentView's render path but the D5-16 math is pure (no DOM, no React). Exporting under the conventional `_test_` prefix keeps the public API clean while making the intersection arithmetic unit-testable. The alternative — testing through PageFragmentView via RTL — would require article fixtures + provider wrapping and would couple the range-math proof to React rendering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported sliceHighlightsForEntry as _test_sliceHighlightsForEntry so the D5-16 intersection math is pure-math testable**
- **Found during:** Task 2 (writing the cross-fragment-slicing unit test)
- **Issue:** The plan's Task 2 acceptance criterion requires `tests/unit/annotations/cross-fragment-slicing.test.ts` to be "pure range math — jsdom-safe, NO layout." The D5-16 intersection math lived in `sliceHighlightsForEntry`, an internal (non-exported) function inside `fragmentRenderer.tsx`. Without an export, the test would have to mount `PageFragmentView` via RTL (article fixture + provider wrapping + DOM inspection) — which couples the range-math proof to React rendering and violates the "pure math" requirement.
- **Fix:** Exported `sliceHighlightsForEntry` under the conventional `_test_sliceHighlightsForEntry` alias. The function is pure (no DOM, no React, no side effects); the test calls it directly with synthetic article + PageFragment fixtures. The alias prefix keeps the public API clean.
- **Files modified:** src/pagination/fragmentRenderer.tsx
- **Verification:** `npm run test:unit -- --run tests/unit/annotations/cross-fragment-slicing.test.ts` — 7/7 pass.
- **Committed in:** e198d5d (Task 2 commit)

**2. [Rule 2 - Missing Critical] Threading status (not a boolean) through HighlightSlice to preserve UI-SPEC's per-kind aria-label distinction**
- **Found during:** Task 1 (InlineRenderer status-driven modifier)
- **Issue:** The plan's action text says ambiguous highlights "pass the slice with `unresolved: true`." But UI-SPEC §Copywriting distinguishes the ambiguous aria-label ("Highlight that couldn't be matched: …") from the orphan aria-label ("Highlight that couldn't be relocated: …"). A boolean `unresolved` flag would lose the kind distinction in InlineRenderer's aria-label branch, conflating the two uncertainty kinds for screen-reader users.
- **Fix:** Threaded the full D5-02 tri-state (`status: "confident" | "ambiguous" | "orphan"`) through `HighlightSliceEntry` + `HighlightSlice` + `sliceRunsForHighlights`. InlineRenderer derives both the modifier class (status !== "confident" → .unresolved) AND the per-kind aria-label from the same field. Default `"confident"` on `HighlightSliceEntry.status` keeps existing callers that omit the field byte-unchanged.
- **Files modified:** src/annotations/highlightRanges.ts, src/content/render/InlineRenderer.tsx
- **Verification:** Unit suite 507/507 green; `npm run build` succeeds.
- **Committed in:** b511c5d (Task 1 commit)

**3. [Rule 3 - Blocking] PaginatedSurface consumes useOptionalHighlightOverlay (not PageFragmentView)**
- **Found during:** Task 1 (wiring highlights into the paginated path)
- **Issue:** The plan's key_links spec says `fragmentRenderer.tsx → src/annotations/highlightRanges.ts via intersect each highlight range with the fragment's article-global range`. The simplest reading would have PageFragmentView call `useOptionalHighlightOverlay()` directly — but that breaks `tests/component/fragmentRenderer.test.tsx` (renders PageFragmentView without a provider) and creates a pagination-layer → reader/annotations-layer React-context dependency that the existing layering discipline avoids.
- **Fix:** PaginatedSurface (in `src/reader/`) consumes `useOptionalHighlightOverlay()` and threads the highlights down to PageFragmentView as an optional prop. PageFragmentView stays a pure props-driven component; the React-context dependency lives one layer up where it's idiomatic. The existing fragmentRenderer component tests regress nothing.
- **Files modified:** src/reader/PaginatedSurface.tsx, src/pagination/fragmentRenderer.tsx
- **Verification:** `tests/component/fragmentRenderer.test.tsx` — 7/7 still pass without a provider; full suite 507/507 green.
- **Committed in:** b511c5d (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for pure-math testability, UI-SPEC aria-label compliance, and existing test regression. No scope creep.

## Issues Encountered
- The `useOptionalHighlightOverlay` hook is already exported (Plan 05-02 added it for ArticleBody's context-aware reading). Reusing it for PaginatedSurface followed the same null-safe pattern — no new hook needed.
- The plan's `_test_sliceHighlightsForEntry` export uses the conventional underscore prefix. ESLint did not flag it (the project's config does not enforce a no-underscore-prefix rule). The function is genuinely pure (jsdom-safe), so the test runs in the standard vitest environment without jsdom layout workarounds.

## User Setup Required
None — no external service configuration required. The plan adds zero new packages and zero environment variables.

## Next Phase Readiness
- **Plan 05-05 (e2e corpus matrix)** can now validate the full ambiguous/orphan + cross-fragment + forced-colors behavior in real browsers across chromium/firefox/webkit × 6-fixture corpus × theme × mode. The unit-level proof (intersection math, status threading, shape distinction in CSS) is in place; Plan 05-05 owns the real-browser layout + selection + forced-colors-emulation proof.
- The `_test_sliceHighlightsForEntry` export gives Plan 05-05 a documented pure-math invariant to assert against the real paginated render: every cross-fragment mark pair should share `data-highlight-id`; every ambiguous/orphan highlight should render with the dashed-outline modifier; the open-announce should fire once when the article has unresolved highlights.
- The status field is now load-bearing through the entire rendering pipeline (highlightRanges → InlineList → BlockView/ArticleBody → fragmentRenderer/PaginatedSurface → AnnotationsDrawer). Future annotation features (e.g. re-anchoring on revision change, manual re-attachment) can build on this contract directly.

## Threat Flags

None — no new security-relevant surface introduced beyond what the plan's threat_model anticipated. The T-05-14 (silent re-attach), T-05-15 (cross-fragment gap), and T-05-16 (forced-colors collapse) mitigations are all implemented as specified.

---
*Phase: 05-durable-highlights-and-notes*
*Completed: 2026-08-07*

## Self-Check: PASSED

- The 1 created file exists on disk: `tests/unit/annotations/cross-fragment-slicing.test.ts`.
- All 8 modified files exist on disk: `src/pagination/fragmentRenderer.tsx`, `src/content/render/BlockRenderer.tsx`, `src/content/render/InlineRenderer.tsx`, `src/annotations/highlightRanges.ts`, `src/reader/PaginatedSurface.tsx`, `src/reader/annotations/AnnotationsDrawer.tsx`, `src/routes/ArticleView.tsx`, `src/app.css`.
- Both task commits exist in git history: `b511c5d` (Task 1), `e198d5d` (Task 2).
- 507/507 unit + component tests pass; `npm run build` succeeds; ESLint clean.
