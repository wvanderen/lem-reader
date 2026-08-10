---
phase: 05-durable-highlights-and-notes
plan: 02
subsystem: annotations
tags: [react-context, w3c-web-annotation, selection-capture, mark-overlay, position-fixed-toolbar, css-custom-properties, forced-colors, user-select-none]

# Dependency graph
requires:
  - phase: 05-durable-highlights-and-notes
    provides: Plan 05-01 anchor engine (captureSelection, resolveQuoteSelector, rangesOverlap, sliceRunsForHighlights, highlightsStore/notesStore, HighlightRecordSchema/NoteRecordSchema)
  - phase: 02-accessible-scrolling-reader
    provides: SettingsContext.tsx React context pattern (createContext + throw-outside-provider + useMemo value), cancelled-flag load pattern, debounced-save pattern, .status live region
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: data-block-index 1:1 mapping, splitParagraphRuns (marks preserved), hidden .article-body-measurement wrapper, M-shortcut global keydown pattern, session-scoped effectiveMode override
provides:
  - useAnnotationState(article) hook — eager batch-resolve highlights on open, createHighlight (deriveQuoteSelector + saveHighlight), deleteHighlight (cascade-delete), updateNote (stub), STATE-05 error routing
  - HighlightOverlayProvider + useHighlightOverlay() — React context distributing resolved highlights + CRUD + openPopoverFor coordination state + captureCurrentSelection (capture + D5-13 overlap, no persist) + createHighlightFromSelection (capture + create)
  - SelectionToolbar — floating position:fixed toolbar with edge-clamp + flip-below geometry + invalid-selection hints (multi-block/overlap/empty/ineligible)
  - InlineList highlightSlices prop — wraps highlighted run slices in <mark class="highlight" tabindex=0 aria-label aria-haspopup> (D5-15 inline highlight rendering INTO existing renderer)
  - ArticleBody highlights prop + context-aware reading — threads per-block highlight slices via sliceRunsForHighlights; measurement body suppressed
  - --highlight CSS token (Sepia #f5e6c8 / Light #f7eaa6 / Dark #5c4a23) + mark.highlight/.has-note/.unresolved styles + forced-colors override + .selection-toolbar styles + .article-body-measurement user-select:none
  - H/N keyboard shortcuts wired into ArticleView's existing M-shortcut keydown effect
affects: [05-03-PLAN, 05-04-PLAN, 05-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parent-child imperative bridge via apiRef: a parent that mounts a React context provider can call into the provider's API without splitting the component — the provider writes apiRef.current = value synchronously during render; the parent reads the mutable ref in event handlers. Avoids the 'parent cannot useContext its own child's provider' problem without a risky large-file split."
    - "captureCurrentSelection (capture + D5-13 overlap WITHOUT persist) separated from createHighlightFromSelection (capture + persist) — toolbar display computes validity cheaply on every selectionchange without creating phantom highlights; the create path runs only on explicit activation (button/H/N)."
    - "ArticleBody reads from HighlightOverlay context when no explicit highlights prop is provided, and passes highlights={[]} to suppress the measurement body — one component, two rendering modes (context-aware vs explicit-suppress)."
    - "rAF-throttled selectionchange listener with containment check (article element + measurement body exclusion) so the toolbar only tracks selections in the visible reading surface."

key-files:
  created:
    - src/reader/annotations/useAnnotationState.ts
    - src/reader/annotations/HighlightOverlay.tsx
    - src/reader/annotations/SelectionToolbar.tsx
    - tests/unit/annotations/highlight-overlay-render.test.tsx
  modified:
    - src/content/render/InlineRenderer.tsx
    - src/content/render/BlockRenderer.tsx
    - src/routes/ArticleView.tsx
    - src/app.css
    - vitest.config.ts

key-decisions:
  - "apiRef bridge over ArticleView split: the plan implies ArticleView consumes useHighlightOverlay() for H/N, but ArticleView is the PARENT of the provider (a parent cannot useContext its own child's provider). Instead of splitting the 833-line ArticleView into outer+inner components (high-risk refactor), the provider accepts an optional apiRef prop and populates apiRef.current = value synchronously during render. The parent reads apiRef.current in its keydown handler. This is the sanctioned 'latest-value ref' escape hatch React docs describe."
  - "captureCurrentSelection separated from createHighlightFromSelection: the toolbar needs to check selection validity on every selectionchange (to show buttons vs. hints) WITHOUT creating a highlight. createHighlightFromSelection (capture + create + return result with highlightId) delegates to captureCurrentSelection (capture + D5-13 overlap, no persist) so the display path is side-effect-free."
  - "ArticleBody reads from HighlightOverlay context: when no explicit highlights prop is provided, ArticleBody calls useOptionalHighlightOverlay() (null-safe variant) and maps ResolvedHighlight[] → ArticleBodyHighlight[] (confident-only for this MVP slice). The measurement body passes highlights={[]} to suppress. This lets the component test render ArticleBody inside the provider without mocking Dexie."
  - "onStorageError is a calm no-op for now: annotation storage failure degrades gracefully (highlights don't render/save but reading continues — D2-13). The existing StorageBanner handles settings-level STATE-05; annotation persistence is local-first and non-critical. Full STATE-05 routing for annotations is a later concern."

patterns-established:
  - "Annotation UI state seam: useAnnotationState hook owns eager batch-resolve + CRUD; HighlightOverlayProvider distributes via React context (mirrors SettingsContext.tsx); parent access via apiRef bridge."
  - "Selection toolbar lifecycle: position:fixed + z-index:8 (above content, below header/dialogs); edge-clamped + flip-below; invalid hints replace buttons; no transition/animation (A11Y-06)."
  - "<mark> overlay INTO existing renderer: InlineList accepts optional highlightSlices prop (from sliceRunsForHighlights); highlighted slices wrap in <mark class='highlight'> with tabindex=0 + aria-label + aria-haspopup; existing Inline mark-wrapping loop reused unchanged inside each slice (D5-07 link-inside-highlight)."

requirements-completed: [ANNO-01, ANNO-05, ANNO-06]

# Metrics
duration: 22min
completed: 2026-08-07
status: complete
---

# Phase 5 Plan 02: Capture Toolbar + `<mark>` Overlay Rendering Summary

**End-to-end vertical slice: select text → floating toolbar → capture to durable anchor → persist → render `<mark>` INTO the existing renderer → re-render from anchors on every relayout — ANNO-01/05/06 proven by 495 unit tests + 5 new component tests.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-07T16:24:10Z
- **Completed:** 2026-08-07T16:46:50Z
- **Tasks:** 2
- **Files modified:** 9 (4 created source/test, 5 modified existing)

## Accomplishments
- Built the annotation state seam: `useAnnotationState` eager-loads + batch-resolves highlights on article open (Plan 05-01's `resolveQuoteSelector` tri-state), provides `createHighlight` (deriveQuoteSelector + saveHighlight + optimistic prepend), `deleteHighlight` (cascade-delete), and a `updateNote` stub for Plan 05-03.
- Built `HighlightOverlayProvider` (React context mirroring SettingsContext.tsx): distributes resolved highlights + CRUD + `openPopoverFor` coordination + `captureCurrentSelection` (capture + D5-13 overlap, no persist) + `createHighlightFromSelection` (capture + persist). The apiRef bridge lets ArticleView's H/N handler call into the provider without splitting the 833-line route component.
- Wired `ArticleView`: mounted the provider wrapping the article body, added H/N shortcuts to the existing M-shortcut keydown effect (bail on form fields + collapsed selections), added rAF-throttled `selectionchange` listener tracking the live selection rect + capture result, extended keyboard-help paragraph, added visually-hidden annotation announce live region.
- Built `SelectionToolbar`: position:fixed floating toolbar with edge-clamp + flip-below geometry (UI-SPEC §Interaction 25). Shows Highlight/Highlight+note buttons on valid selections; calm hints on invalid (multi-block/overlap/empty/ineligible). z-index:8, no shadow, no transition/animation (A11Y-06).
- Rendered highlights as `<mark class="highlight" tabindex=0 aria-label aria-haspopup>` INTO the existing `InlineRenderer`/`BlockRenderer` (NO parallel renderer — DOC-02 reading order + D-05 offset integrity preserved). `sliceRunsForHighlights` (Plan 05-01) slices runs at highlight boundaries; the existing Inline mark-wrapping loop is reused unchanged inside each slice (D5-07 — a link stays active inside a highlight).
- Added the `--highlight` CSS token (Sepia `#f5e6c8` / Light `#f7eaa6` / Dark `#5c4a23`) + `mark.highlight`/`.has-note` (dotted underline)/`.unresolved` (dashed outline) styles + forced-colors override (Highlight/HighlightText + fallback underline — A11Y-05 shape distinction) + `.selection-toolbar` styles + `.article-body-measurement user-select:none` (D5-08/Pitfall 3).
- 5 component tests prove the `<mark>` renders with correct ARIA/tabindex, link-inside-highlight preserved (D5-07), `.has-note` modifier, and no-mark-when-empty. Full unit suite 495/495 green; `npm run build` succeeds; ESLint clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Annotation state seam — useAnnotationState + HighlightOverlay provider + ArticleView wiring** — `e572436` (feat)
2. **Task 2: Floating SelectionToolbar + `<mark>` overlay rendering INTO InlineRenderer/BlockRenderer + --highlight CSS + user-select:none** — `393df23` (feat)

## Files Created/Modified

- `src/reader/annotations/useAnnotationState.ts` — hook: eager batch-resolve highlights on open (loadHighlights → resolveQuoteSelector tri-state), createHighlight (deriveQuoteSelector + saveHighlight), deleteHighlight (cascade-delete), updateNote (stub). STATE-05 error routing via callbacks.
- `src/reader/annotations/HighlightOverlay.tsx` — React context provider (mirrors SettingsContext.tsx): createContext + throw-outside-provider guard + useMemo value. createHighlightFromSelection + captureCurrentSelection + openPopoverFor coordination. apiRef bridge for parent access.
- `src/reader/annotations/SelectionToolbar.tsx` — floating position:fixed toolbar (edge-clamp + flip-below + invalid hints). Shows Highlight/Highlight+note buttons or calm hints.
- `src/content/render/InlineRenderer.tsx` — InlineList accepts optional highlightSlices prop; highlighted slices wrap in `<mark class="highlight" tabindex=0 aria-label aria-haspopup>`. Existing Inline mark-wrapping loop reused unchanged inside each slice (D5-07).
- `src/content/render/BlockRenderer.tsx` — ArticleBody accepts optional highlights prop + reads from HighlightOverlay context; threads per-block slices via sliceRunsForHighlights to InlineList. Measurement body passes highlights=[] to suppress. BlockView threads highlightSlices to InlineList.
- `src/routes/ArticleView.tsx` — mounted HighlightOverlayProvider wrapping the article body; added H/N shortcuts + selectionchange listener (rAF-throttled); extended keyboard-help paragraph; added annotation announce live region.
- `src/app.css` — `--highlight` token (3 themes), `mark.highlight` + `.has-note` + `.unresolved` styles, forced-colors override, `.selection-toolbar` + `.selection-toolbar-button` + `.selection-toolbar-hint`, `.article-body-measurement` `user-select:none`.
- `vitest.config.ts` — added `tests/unit/**/*.test.tsx` to the include pattern so the JSX component test in `tests/unit/annotations/` is picked up.
- `tests/unit/annotations/highlight-overlay-render.test.tsx` — 5 RTL component tests: mark renders with correct ARIA/tabindex; link-inside-highlight preserved (D5-07); .has-note modifier; no-mark-when-empty/absent.

## Decisions Made
- **apiRef bridge over ArticleView split:** ArticleView is the PARENT of HighlightOverlayProvider and needs to call `createHighlightFromSelection` from its H/N keydown handler. A parent cannot `useContext` its own child's provider. Instead of splitting the 833-line ArticleView into outer+inner components (high-risk), the provider accepts an optional `apiRef` prop and populates `apiRef.current = value` synchronously during render. The parent reads the mutable ref in its event handlers.
- **captureCurrentSelection separated from createHighlightFromSelection:** The toolbar needs to check selection validity on every `selectionchange` (to show buttons vs. hints) WITHOUT creating a highlight. Separated the capture+overlap check (no persist) from the capture+persist path so the display is side-effect-free.
- **ArticleBody reads from context:** When no explicit `highlights` prop is provided, ArticleBody calls `useOptionalHighlightOverlay()` (null-safe) and maps ResolvedHighlight → ArticleBodyHighlight (confident-only). The measurement body passes `highlights={[]}` to suppress marks. This lets the component test render ArticleBody inside the provider without mocking Dexie.
- **onStorageError is a calm no-op for now:** Annotation storage failure degrades gracefully — highlights don't render/save but reading continues (D2-13). The existing StorageBanner handles settings-level STATE-05; annotation persistence is non-critical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended vitest include pattern for .test.tsx in unit tests**
- **Found during:** Task 2 (writing the component test)
- **Issue:** The plan specifies the test at `tests/unit/annotations/highlight-overlay-render.test.ts` but the test uses JSX (rendering React components via RTL). The vitest config only included `.test.ts` in `tests/unit/` and `.test.tsx` in `tests/component/`.
- **Fix:** Added `"tests/unit/**/*.test.tsx"` to the vitest `include` array so JSX component tests in the unit directory are picked up. Named the file `.test.tsx` to match the JSX content.
- **Files modified:** vitest.config.ts
- **Verification:** `npm run test:unit -- --run tests/unit/annotations/highlight-overlay-render.test.tsx` — 5/5 pass.
- **Committed in:** 393df23 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed react-hooks/rules-of-hooks violation in BlockRenderer**
- **Found during:** Task 2 (ArticleBody context-aware reading)
- **Issue:** Initial implementation called `useOptionalHighlightOverlay()` inside a conditional branch (when `explicitHighlights` was undefined). React hooks must be called unconditionally.
- **Fix:** Moved the hook call to the top of `ArticleBody` (unconditionally) and used the return value only in the `else` branch.
- **Files modified:** src/content/render/BlockRenderer.tsx
- **Verification:** `npm run lint` — clean.
- **Committed in:** 393df23 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for test infrastructure + hook compliance. No scope creep.

## Issues Encountered
- The `captureCurrentSelection` / `createHighlightFromSelection` separation was not explicitly described in the plan's action text but was required to avoid creating phantom highlights on every `selectionchange` (the toolbar needs to check validity for display without persisting). Documented as a key decision.
- The `useRef` import in HighlightOverlay.tsx was initially placed at the bottom of the file (after the component). Moved to the top-level import block for lint compliance.

## User Setup Required
None — no external service configuration required. The plan adds zero new packages and zero environment variables.

## Next Phase Readiness
- **Plan 05-03 (note popover + drawer)** consumes `useHighlightOverlay()` for CRUD + `openPopoverFor` coordination state + `deleteHighlight` (two-step confirm mirrors WipeConfirm). The `updateNote` stub signature is ready for the debounced save.
- **Plan 05-04 (ambiguous/orphan surfacing)** consumes the D5-02 tri-state directly. The `status` field on `ResolvedHighlight` and the `mark.highlight.unresolved` CSS class are ready for the ambiguous/orphan marker.
- **Plan 05-05 (e2e corpus matrix)** validates real-browser selection capture, cross-fragment `<mark>` rendering (D5-16), forced-colors shape distinction, and the full ANNO-05 survives-relayout loop across Chromium/Firefox/WebKit × 6-fixture corpus × theme × mode.
- The `captureCurrentSelection` ↔ `createHighlightFromSelection` split is the seam the toolbar + H/N + future NotePopover all share — one capture path, one persist path.

---
*Phase: 05-durable-highlights-and-notes*
*Completed: 2026-08-07*

## Self-Check: PASSED

- All 4 created files exist on disk (useAnnotationState.ts, HighlightOverlay.tsx, SelectionToolbar.tsx, highlight-overlay-render.test.tsx).
- Both task commits exist in git history: `e572436` (Task 1), `393df23` (Task 2).
- 495/495 full unit suite pass; `npm run build` succeeds; ESLint clean.
