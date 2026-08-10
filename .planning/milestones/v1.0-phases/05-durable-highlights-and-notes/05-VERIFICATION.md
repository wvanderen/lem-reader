---
phase: 05-durable-highlights-and-notes
verified: 2026-08-07T23:25:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
phase_gate_full_suite: "1003 passed / 0 failed / 0 skipped (511 unit + 492 e2e × chromium/firefox/webkit) — last run by Plan 05-06 Task 3 after both gap closures landed (commit 4e11f6f); 05-07's earlier run was 1000 passed (pre-05-06 regression-spec addition)"
prior_uat: "05-UAT.md — 10/12 passed, 1 issue (Test 11 → 2 gaps), 1 skipped (Test 12 manual repro not naturally triggerable, covered by ambiguous-orphan-surface.spec.ts e2e)"
gaps_closed_this_cycle:
  - "BLOCKER (05-06): pagination uneven pages on initial load — gated ArticleView geometry-effect rAF read on the .paginated-surface class + added initial-pagination-even CI regression spec"
  - "MAJOR (05-07): blockquote highlight renders no inline mark — threaded per-child childHighlightSlices through BOTH render paths (BlockRenderer.ArticleBody scrolling + fragmentRenderer.PageFragmentView paginated)"
---

# Phase 5: Durable Highlights and Notes — Verification Report

**Phase Goal:** Readers can create, revisit, and manage local highlights and notes that remain attached to their intended normalized text.
**Verified:** 2026-08-07T23:25:00Z
**Status:** passed
**Re-verification:** Post-gap-closure. No prior VERIFICATION.md existed (initial verification for this artifact, but follows UAT 05-UAT.md which diagnosed 2 gaps in Test 11 — both now closed by Plans 05-06 and 05-07).

## Goal Achievement

The phase delivers the full local-first annotation layer: capture (DOM Range → grapheme offset → TextQuoteSelector + TextPositionSelector), persistence (Dexie `highlights` + `notes` tables with compound indexes + cascade-delete), resolution (tri-state `resolveQuoteSelector` re-anchoring on every relayout), rendering (`<mark class=highlight>` overlay threaded through `InlineList` in both `ArticleBody` scrolling and `PageFragmentView` paginated paths, including per-child blockquote threading and D5-16 cross-fragment slicing with shared `data-highlight-id`), management surface (`AnnotationsDrawer` + `NotePopover` + D5-11 navigate-back + two-step delete), and ambiguous/orphan surfacing (status-driven dashed marker + drawer flag + disabled jump + one-time open-announce). The two UAT Test 11 gaps (latent pagination-geometry mega-page regression + blockquote kind-gate exclusion) are closed at the root cause with dedicated regression specs.

### Observable Truths

Must-haves are the 8 requirement IDs from the ROADMAP phase contract (ANNO-01..07, STATE-03). Each is verified against codebase evidence; both executors' green full-suite runs (1003/1003 after both gap closures) and the verifier's live spot-check (16/16 annotation unit tests) provide behavioral proof.

| # | Requirement | Truth | Status | Evidence |
|---|-------------|-------|--------|----------|
| 1 | ANNO-01 | Reader can select supported article text and create a highlight in either reading mode (including blockquote passages). | ✓ VERIFIED | `src/annotations/capture.ts:311` `captureSelection()` (DOM Range → grapheme offset); `src/reader/annotations/SelectionToolbar.tsx` + H/N shortcuts in `ArticleView.tsx`; `<mark class=highlight>` overlay via `sliceRunsForHighlights` in both `BlockRenderer.ArticleBody` and `fragmentRenderer.PageFragmentView`; Plan 05-07 closed the blockquote kind-gate gap by threading `childHighlightSlices` (verified live: `blockquote-highlight-render.test.tsx` 4/4 green). e2e `capture-highlight.spec.ts` + `keyboard-shortcuts.spec.ts` ran green in all 3 engines. |
| 2 | ANNO-02 | Reader can attach a text note to a highlight. | ✓ VERIFIED | `src/reader/annotations/NotePopover.tsx` (Popover API manual + focused textarea); `src/persistence/notesStore.ts` `saveNote()` + `loadNote()`; debounced save mirroring `SettingsContext`; dotted-underline note indicator. e2e `note-create-edit.spec.ts` green × 3 engines. |
| 3 | ANNO-03 | Reader can view, edit, and delete their locally stored notes and highlights. | ✓ VERIFIED | `src/reader/annotations/AnnotationsDrawer.tsx` (native `<dialog>`, reading-order list, empty-state); two-step `WipeConfirm` delete; cascade-delete transaction in `highlightsStore.deleteHighlight` + `notesStore.deleteNote`. e2e `drawer-view.spec.ts` + `delete-confirm.spec.ts` green × 3 engines. |
| 4 | ANNO-04 | Reader can navigate from a saved annotation back to its logical passage. | ✓ VERIFIED | D5-11 navigate-back: `fragmentContainingOffset` + `commitTurn` (paginated) OR `findScrollTarget` + `scrollIntoView` (scrolling), then focus the `<mark>`. Wired via `AnnotationsDrawer` `onNavigate` → `ArticleView.tsx` (lines ~1025, 1249). e2e `navigate-back.spec.ts` green × 3 engines in BOTH modes. |
| 5 | ANNO-05 | Highlights and notes remain attached to the same normalized text across repagination, mode changes, typography changes, and reopening. | ✓ VERIFIED | `resolveQuoteSelector` tri-state re-anchor on every relayout; canonical D-05 grapheme offsets; `survive-relayout.spec.ts` + `persist-reload.spec.ts` green × 3 engines. **Gap 05-06 unblocked this proof**: the latent initial-load pagination mega-page regression (pageContentBoxHeightPx captured the scrolling-body height on first rAF) is closed by the `.paginated-surface` class gate at `ArticleView.tsx:693`; `initial-pagination-even.spec.ts` regression guard captures the FIRST pagination publication deterministically (RED pagesLength=1 → GREEN pagesLength=2, stable). |
| 6 | ANNO-06 | Annotation anchors store canonical position plus quoted context rather than page numbers, pixels, DOM paths, or serialized live ranges. | ✓ VERIFIED | `HighlightRecord` schema in `src/persistence/db.ts` carries W3C-inspired `TextPositionSelector` + `TextQuoteSelector` (verified in `resolve-quote-selector.test.ts` + `selector-roundtrip.test.ts` round-trip unit tests, both green); no DOM `Range` / XPath / page-number persistence. |
| 7 | ANNO-07 | Reader is shown an explicit ambiguous or orphaned state when an annotation cannot be resolved confidently rather than having it silently reattached. | ✓ VERIFIED | `ResolvedHighlight.status` ("confident" \| "ambiguous" \| "orphan") threaded through `fragmentRenderer.tsx:277`; status-driven `mark.highlight.unresolved` dashed marker at position hint/first candidate; drawer flag + disabled jump + one-time "{N} couldn't be relocated" open-announce; forced-colors three-shape distinction. e2e `ambiguous-orphan-surface.spec.ts` + `forced-colors-shapes.spec.ts` green × 3 engines. (UAT Test 12 manual repro skipped — requires seeded ambiguous records; covered deterministically by this e2e spec.) |
| 8 | STATE-03 | Reader's highlights and notes persist locally across sessions. | ✓ VERIFIED | Dexie `highlights` + `notes` tables in `src/persistence/db.ts` with compound-index `[articleId+revision]` (orphan detection) + `highlightId` (note lookup); `loadHighlights` / `saveHighlight` / `saveNote` repository interface. e2e `persist-reload.spec.ts` proves reload reapplies highlights at the same passages × 3 engines. STATE-04/05 (versioned schema + recoverable error) provided by `errors.ts` `classifyStorageError` + Zod validation at the persistence boundary. |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified; 0 failed)

### Gap Closure Verification (this cycle)

Both UAT Test 11 gaps are genuinely closed at the root cause. Verified by code inspection + the executors' RED→GREEN evidence + the verifier's live unit test re-run.

| Gap | Plan | Root cause | Fix evidence | Regression guard | Status |
|-----|------|-----------|--------------|------------------|--------|
| Pagination uneven pages on initial load (BLOCKER; latent since Phase 4) | 05-06 | `ArticleView` geometry-effect rAF fired while scrolling branch was still mounted (trustedView null on first render), capturing scrolling-body natural height (~1419px) → first pagination pass packed entire article onto P1 | `src/routes/ArticleView.tsx:693` — one-line gate `if (!articleEl.classList.contains("paginated-surface")) return;` inside the rAF callback before `getBoundingClientRect().height` | `tests/e2e/pagination/initial-pagination-even.spec.ts` — captures FIRST `window.__lemPagination` publication deterministically via single rAF-polling `page.evaluate` (no evaluate round-trip gap a racy correction could slip through); asserts first>1 + settled stable + status "ok". RED pagesLength=1 → GREEN pagesLength=2 (commit `2e11b1d` RED, `4e11f6f` GREEN) | ✓ CLOSED |
| Blockquote highlight renders no inline mark (MAJOR) | 05-07 | Kind-gate in both render paths limited inline `<mark>` overlay computation to `paragraph` + `heading`; blockquote (container with text in `block.children`) was excluded; recursive BlockView blockquote case did not forward slices to children | `src/content/render/BlockRenderer.tsx:319-384` computes `childHighlightSlices` for blockquote in `ArticleBody` via `blockGraphemeLen` + `highlightsForBlock` + `sliceRunsForHighlights` per child; `src/pagination/fragmentRenderer.tsx:113-196` does the same in `PageFragmentView` via `splittingBlockGraphemeLength` + entry-local intersection filter; BlockView blockquote case (`BlockRenderer.tsx:120`) forwards `childHighlightSlices?.[i]` per child | `tests/unit/annotations/blockquote-highlight-render.test.tsx` — 4 cases (scrolling whole + zero-marks regression, paginated whole, paginated sliced). RED 3 fail/1 pass → GREEN 4/4 (commit `24d0235` RED, `4250b31` GREEN). **Verifier live re-run: 16/16 green** (blockquote + highlight-overlay + cross-fragment-slicing) | ✓ CLOSED |

### Required Artifacts

All artifacts exist, are substantive (no stubs), and are wired into the running app.

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/annotations/capture.ts` | DOM Range → grapheme offset capture | ✓ VERIFIED | `captureSelection()` at line 311; 16 KB file |
| `src/annotations/resolution.ts` | Tri-state quote-selector resolution | ✓ VERIFIED | `resolveQuoteSelector` + `findAllOccurrences` + `matchesContext` (ANNO-06/07) |
| `src/annotations/highlightRanges.ts` | `sliceRunsForHighlights` run slicer | ✓ VERIFIED | Reused unchanged by 05-07 per-child threading (no fork) |
| `src/annotations/overlap.ts` | Range overlap detection | ✓ VERIFIED | `rangesOverlap()` |
| `src/persistence/db.ts` | Dexie schema with highlights + notes tables | ✓ VERIFIED | Lines 76-91: `highlights` + `notes` Table declarations + compound indexes; no version bump (Phase 5 tables added within existing schema) |
| `src/persistence/highlightsStore.ts` | load/save/delete + cascade | ✓ VERIFIED | `loadHighlights` (compound-index query), `saveHighlight`, `deleteHighlight` (cascade transaction) |
| `src/persistence/notesStore.ts` | load/save/delete notes | ✓ VERIFIED | `loadNote`, `saveNote`, `deleteNote` |
| `src/reader/annotations/useAnnotationState.ts` | React annotation state hook | ✓ VERIFIED | `useAnnotationState` + `ResolvedHighlight` + status types; 15 KB |
| `src/reader/annotations/HighlightOverlay.tsx` | Eager load+resolve provider | ✓ VERIFIED | `HighlightOverlayProvider` + `useHighlightOverlay` + `useOptionalHighlightOverlay` |
| `src/reader/annotations/SelectionToolbar.tsx` | Floating toolbar | ✓ VERIFIED | Edge-clamp, invalid-hint, position:fixed |
| `src/reader/annotations/NotePopover.tsx` | Note editor | ✓ VERIFIED | Popover API manual + debounced save |
| `src/reader/annotations/AnnotationsDrawer.tsx` | Reading-order list + navigate + delete | ✓ VERIFIED | Native `<dialog>`, empty-state, D5-11 navigate-back |
| `src/content/render/BlockRenderer.tsx` | Inline `<mark>` overlay + per-child blockquote threading | ✓ VERIFIED | 05-07 threading at lines 319-384 + 120; comment updated to reflect blockquote coverage |
| `src/pagination/fragmentRenderer.tsx` | Cross-fragment D5-16 slicing + per-child blockquote threading | ✓ VERIFIED | 05-07 threading at lines 113-196 + 214; status threading at 277 |
| `src/routes/ArticleView.tsx` | Wire layer + geometry gate | ✓ VERIFIED | Consumes `HighlightOverlayProvider` + `AnnotationsDrawer`; geometry gate at line 693 (05-06); navigate-back at ~1025 |
| `tests/e2e/pagination/initial-pagination-even.spec.ts` | 05-06 regression guard | ✓ VERIFIED | 150 lines; enumerates 3 cells (chromium/firefox/webkit); captures FIRST publication |
| `tests/unit/annotations/blockquote-highlight-render.test.tsx` | 05-07 gap proof | ✓ VERIFIED | 164 lines (≥60 min_lines); 4 cases; **verifier live re-run 4/4 green** |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ArticleView.tsx` | `HighlightOverlayProvider` | JSX wrap + `highlightApiRef` bridge | ✓ WIRED | Lines 1130-1258; provider wraps article body + drawer + popover |
| `ArticleView.tsx` | `AnnotationsDrawer` | `onNavigate` handler | ✓ WIRED | Lines 1249-1257; D5-11 navigate-back handler |
| `ArticleView.tsx` (geometry effect) | `PaginatedSurface.tsx` (pagination effect) | `pageContentBoxHeightPx` prop | ✓ WIRED | 05-06 gate ensures pagination effect never consumes scrolling-body height; effect guards on `>0` so it waits |
| `BlockRenderer.ArticleBody` | `BlockView` blockquote case | `childHighlightSlices` prop | ✓ WIRED | 05-07: array indexed by child position; `BlockRenderer.tsx:120` forwards per child |
| `fragmentRenderer.PageFragmentView` | `BlockView` blockquote entry | `childHighlightSlices` prop | ✓ WIRED | 05-07: entry-local intersection filter per child; `fragmentRenderer.tsx:214` |
| `annotations/capture.ts` | `persistence/highlightsStore.ts` | `saveHighlight` after capture | ✓ WIRED | Via `useAnnotationState` callbacks |
| `persistence/highlightsStore.ts` | `persistence/db.ts` Dexie | `db.highlights` table CRUD | ✓ WIRED | Compound-index query + cascade-delete transaction |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `AnnotationsDrawer` list | `highlights` (ResolvedHighlight[]) | `loadHighlights` → `resolveQuoteSelector` per highlight | ✓ DB query (Dexie `findMany` on compound index) + live resolution | ✓ FLOWING |
| `<mark class=highlight>` overlays | `effectiveHighlights` | `useAnnotationState` → `HighlightOverlayProvider` context | ✓ Real HighlightRecords from Dexie, resolved against current normalized text | ✓ FLOWING |
| `childHighlightSlices` (blockquote) | per-child sliced runs | `highlightsForBlock` + `sliceRunsForHighlights` per child | ✓ Real intersection of article-global highlight range with each child's range | ✓ FLOWING |
| `pageContentBoxHeightPx` | geometry state | `articleEl.getBoundingClientRect().height` (gated on `.paginated-surface`) | ✓ Real pinned-height read (≈654px desktop); scrolling-body height rejected by gate | ✓ FLOWING |

No hardcoded empty arrays, no static-only fallbacks, no disconnected props at call sites.

### Behavioral Spot-Checks

Per user instruction, the full `npm run test` suite was NOT re-run (executors already ran it green: 1003/0/0 after both gap closures). The verifier ran ONE targeted unit test invocation to confirm the gap-closure proof holds live, plus enumerated (did not execute) the Playwright regression spec.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Blockquote highlight renders mark in BOTH render paths (05-07 gap closure + paragraph/heading regression + cross-fragment D5-16) | `npx vitest run tests/unit/annotations/blockquote-highlight-render.test.tsx tests/unit/annotations/highlight-overlay-render.test.tsx tests/unit/annotations/cross-fragment-slicing.test.ts` | 3 files, **16/16 passed**, 627 ms, exit 0 | ✓ PASS |
| 05-06 regression spec enumerates across all 3 engines | `npx playwright test tests/e2e/pagination/initial-pagination-even.spec.ts --list` | 3 tests (chromium + firefox + webkit), 1 file | ✓ PASS (enumeration; executors ran the suite green) |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` probes. Verification is via the Playwright e2e suite (the project's real-browser truth per STACK.md).

### Requirements Coverage

All 8 phase requirement IDs are accounted for. No orphaned requirements (REQUIREMENTS.md traceability table maps exactly ANNO-01..07 + STATE-03 to Phase 5, all marked Complete).

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ANNO-01 | 05-02, 05-05, 05-07 | Select text + create highlight in either mode | ✓ SATISFIED | capture.ts + SelectionToolbar + 05-07 blockquote closure |
| ANNO-02 | 05-03, 05-05 | Attach text note to highlight | ✓ SATISFIED | NotePopover + notesStore |
| ANNO-03 | 05-03, 05-05 | View/edit/delete local annotations | ✓ SATISFIED | AnnotationsDrawer + WipeConfirm + cascade delete |
| ANNO-04 | 05-03, 05-05 | Navigate from annotation to logical passage | ✓ SATISFIED | D5-11 navigate-back in both modes |
| ANNO-05 | 05-01, 05-02, 05-04, 05-05, **05-06**, 05-07 | Remain attached across repagination/mode/typography/reopen | ✓ SATISFIED | Tri-state resolution + survive-relayout/persist-reload e2e; 05-06 closed the latent pagination-geometry blocker that was masking the proof |
| ANNO-06 | 05-01, 05-02 | Canonical position + quoted context (not page/pixel/DOM) | ✓ SATISFIED | TextPositionSelector + TextQuoteSelector on HighlightRecord |
| ANNO-07 | 05-04, 05-05 | Explicit ambiguous/orphan state | ✓ SATISFIED | status-driven dashed marker + drawer flag + open-announce |
| STATE-03 | 05-01, 05-05 | Persist locally across sessions | ✓ SATISFIED | Dexie highlights + notes tables + persist-reload e2e |

### Anti-Patterns Found

None. Scanned all phase-5-modified source files (`ArticleView.tsx`, `BlockRenderer.tsx`, `fragmentRenderer.tsx`) and the gap-closure test files for debt markers (`TBD|FIXME|XXX`), warning markers (`TODO|HACK|PLACEHOLDER`), placeholder strings, empty implementations, and hardcoded empty data — zero matches.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| _(none)_ | — | — | — | — |

### Human Verification Required

None. All must-haves are verified with automated evidence (unit + e2e across 3 engines). The prior UAT (05-UAT.md) already covered the manual user-flow surface: 10/12 tests passed manually; Test 11's two diagnosed gaps are closed by Plans 05-06 and 05-07 with dedicated regression specs; Test 12 (ambiguous/orphan manual surfacing) was skipped because it requires seeded HighlightRecords not naturally triggerable in a normal manual flow, but is deterministically covered by `ambiguous-orphan-surface.spec.ts` e2e across all 3 engines.

### Gaps Summary

No outstanding gaps. Both UAT Test 11 gaps closed at the root cause:

1. **BLOCKER — pagination uneven pages on initial load (05-06):** Root cause was `pageContentBoxHeightPx` capturing the scrolling-body natural height on the first rAF (latent since Phase 4; reproduces identically at pre-Phase-5 commit `eac0845`). Closed by a one-line `classList.contains("paginated-surface")` gate at `ArticleView.tsx:693`. The masked regression is now caught in CI by `initial-pagination-even.spec.ts` (RED pagesLength=1 → GREEN pagesLength=2).
2. **MAJOR — blockquote highlight renders no inline mark (05-07):** Root cause was a kind-gate excluding blockquote from inline overlay computation in BOTH render paths. Closed by threading per-child `childHighlightSlices` through the shared `BlockView` in `BlockRenderer.ArticleBody` (scrolling, via `blockGraphemeLen`) and `fragmentRenderer.PageFragmentView` (paginated, via `splittingBlockGraphemeLength`), reusing `sliceRunsForHighlights` + `highlightsForBlock` unchanged. Verified live by the verifier: 16/16 unit tests green.

**Phase gate:** Full `npm run test` (unit + e2e × chromium/firefox/webkit) exits 0 — **1003 passed / 0 failed / 0 skipped** (511 unit + 492 e2e) after both gap closures landed (Plan 05-06 Task 3, commit `4e11f6f`).

---

_Verified: 2026-08-07T23:25:00Z_
_Verifier: the agent (gsd-verifier)_
_Methodology: goal-backward; codebase inspection + SUMMARY cross-reference + live unit-test spot-check (16/16 green). Full suite evidence trusted from executor runs per instruction._
