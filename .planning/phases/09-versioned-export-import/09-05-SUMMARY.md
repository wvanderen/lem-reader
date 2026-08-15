---
phase: 09-versioned-export-import
plan: "05"
subsystem: ui
tags: [react, dialog, accessibility, portability, export, import, markdown, indexeddb]

# Dependency graph
requires:
  - phase: 09-versioned-export-import (Plans 09-01..09-04)
    provides: buildBundleBytes/validateBundle/applyImport service core, conflicts.ts preview+plan, markdown.ts template, download/zipSlip helpers
provides:
  - ImportPreviewDialog component (structural RemoveConfirm clone with bulk per-kind overrides + preferences choice)
  - SettingsPanel "Your data" cluster (export bundle / import bundle / export all highlights) with the full import state machine + status live region
  - ArticleView per-article "Export highlights" affordance with sanitized filename + live-region announcement
  - import-preview + settings-data + article-export-highlights CSS families
affects: [09-06 e2e verification, library-view, future portability surfaces]

# Tech tracking
tech-stack:
  added: [] # no new dependencies — authored CSS + native platform only
  patterns:
    - "Structural dialog clone discipline (3rd instance: WipeConfirm → RemoveConfirm → ImportPreviewDialog — Pitfall 8 forbids a shared ConfirmDialog)"
    - "applyImport single-call-site rule: the destructive bulk write fires ONLY in the dialog Proceed button's onClick handler (T-9-16)"
    - "Import refusal → verbatim calm status copy mapping (refusalCopy switch, six kinds)"
    - "Insecure-context (crypto.subtle) graceful disable of data actions (T-9-18)"
    - "Second dedicated visually-hidden live region so export announces never clobber annotation announces"

key-files:
  created:
    - src/reader/ImportPreviewDialog.tsx
    - tests/unit/portability/import-preview-dialog.test.tsx
  modified:
    - src/reader/SettingsPanel.tsx
    - src/routes/ArticleView.tsx
    - src/portability/ExportImportService.ts
    - src/app.css

key-decisions:
  - "ImportPreviewDialog is a structural RemoveConfirm clone, not a shared dialog (D9-11/Pitfall 8); [data-initial-focus] on Cancel import; onProceed invoked ONLY from the Import button onClick"
  - "keep-both offered only for highlight-id/note-id (D9-14 semantics); every override select defaults to Skip"
  - "SettingsPanel owns the import state machine; applyImport has exactly one invocation site in the component (the Proceed handler)"
  - "File-input value resets after refusals AND after Proceed/Cancel so re-picking the same file always re-fires onChange"
  - "Export all highlights unions Dexie articles with bundled fixtures (first-seen wins) so fixture-backed highlights resolve — same Pattern 8 precedence as detectImportPreview"
  - "buildBundleBytes return tightened to Uint8Array<ArrayBuffer> (BufferSource under TS 7 — the 09-01 sha256Hex precedent) instead of a UI-side cast"
  - "ArticleView uses a SECOND visually-hidden role=status region for export results; collectHighlightEntries re-resolves tri-state via the shipped resolver (no forked logic)"

patterns-established:
  - "Nested-modal flow: ImportPreviewDialog mounts as a fragment sibling OUTSIDE the SettingsPanel dialog — native top layer stacks cleanly"
  - "Per-outcome calm copy: success messages honestly pluralize counts (counted(n, one, other)) in DOC-06 voice"
  - "Tab-invisible visually-hidden file input (tabIndex -1, button is the keyboard path) for click-triggered pickers"

requirements-completed: [PORT-01, PORT-02, PORT-03]

# Metrics
duration: 14 min
completed: 2026-08-15
status: complete
---

# Phase 9 Plan 05: Portability UI — Import Preview Dialog, Your-Data Cluster, Per-Article Export Summary

**Settings "Your data" cluster + ImportPreviewDialog (structural RemoveConfirm clone with bulk per-kind overrides) + ArticleView per-article highlights export — every result and refusal announcing through role=status live regions with applyImport isolated to the single Proceed handler**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-15T18:40:58Z
- **Completed:** 2026-08-15T18:55:54Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- ImportPreviewDialog: honest counts sentence with "(N new)" added counts, grouped conflict lines with per-kind selects (Skip default; Overwrite; Keep both only for id kinds), ambiguous/orphan/fixture warnings, D9-12 preferences checkbox — with the full showModal/focus-capture/restore/[data-initial-focus] discipline and onProceed confined to the Import button onClick (T-9-16)
- SettingsPanel "Your data" fieldset: Export library bundle (BUNDLE_FILENAME zip), Import bundle (validateBundle → verbatim six-kind refusal copy → detectImportPreview → dialog → resolveImportPlan+applyImport atomic apply with skipped-count summary), Export all highlights (articles ∪ fixtures → orderSectionsByRecency → renderLibraryHighlights → lem-reader-highlights.md); insecure-context guard disables all three with a calm status (T-9-18)
- ArticleView "Export highlights": header button inert at mount (TagEntry discipline), fresh per-article load + collectHighlightEntries tri-state, `highlights-{sanitizeFilename(title, id)}.md` (T-9-06), second visually-hidden live region for calm announcements

## Task Commits

Each task was committed atomically:

1. **Task 1: ImportPreviewDialog component (structural RemoveConfirm clone)** - `c78e1cf` (feat)
2. **Task 2: SettingsPanel "Your data" cluster + import state machine** - `f6e4eea` (feat)
3. **Task 3: ArticleView per-article "Export highlights" affordance** - `b145ae7` (feat)

**Additional commits:**
- `2deefc6` (style): prettier-format ImportPreviewDialog + RTL spec (mechanical reflows missed by Task 2's file list)

## Files Created/Modified
- `src/reader/ImportPreviewDialog.tsx` - alertdialog preview+confirm with overrides/preferences collection; isolated Proceed path
- `tests/unit/portability/import-preview-dialog.test.tsx` - RTL spec (6 tests): counts, initial-focus marker, override plumbing, keep-both gating, preferences default
- `src/reader/SettingsPanel.tsx` - "Your data" cluster, import state machine, refusal copy map, insecure-context guard, ImportPreviewDialog mount
- `src/routes/ArticleView.tsx` - per-article Export highlights button + handler + export announcement region
- `src/portability/ExportImportService.ts` - buildBundleBytes return type tightened to `Uint8Array<ArrayBuffer>`
- `src/app.css` - .import-preview family (library-remove-confirm clone), .settings-data cluster, .article-export-highlights

## Decisions Made
- Dialog renders one plain-string summary sentence (single text node) so live-region/aria-describedby semantics stay simple and the RTL spec can assert the exact copy
- Conflict line copy "{n} conflicting {kind-label}" with singular/plural agreement via one/other label forms
- Import preview dialog mounts as a fragment sibling OUTSIDE the settings dialog (native top-layer stacking, un-nested DOM reading order); the existing SettingsPanel dialog focus discipline is untouched
- File-input reset applied to refusal paths too (not only Proceed) so retrying the same refused file never silently no-ops
- Per-article export re-loads via loadAllHighlights/loadAllNotes filtered by articleId (plan-sanctioned option) rather than snapshotting provider state — fresh at click time, and collectHighlightEntries stays the single entry-building path (D9-06 same-template)
- ArticleView prose uses "auto-focus" (08-04 convention); the one remaining `autoFocus` match in the file is the pre-existing Phase 08-04 TagEntry comment (out of scope)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] buildBundleBytes return type failed BlobPart assignment under TS 7**
- **Found during:** Task 2 (npm run build)
- **Issue:** `Uint8Array<ArrayBufferLike>` (the old return annotation) is not assignable to `BlobPart` in downloadBlob calls — BufferSource requires ArrayBuffer backing under TS 7
- **Fix:** Tightened `buildBundleBytes(): Promise<Uint8Array<ArrayBuffer>>` in ExportImportService.ts (fflate's zipSync already declares exactly that return); no UI-side cast
- **Files modified:** src/portability/ExportImportService.ts
- **Verification:** npm run build exits 0; full unit portability suite green (122 passed)
- **Committed in:** f6e4eea (Task 2 commit)

**2. [Rule 2 - Missing critical] File-input reset also needed on refusal paths**
- **Found during:** Task 2 (import state machine implementation)
- **Issue:** Plan specified resetting the file input only in the Proceed path; after a REFUSAL, re-picking the same file would silently no-op (onChange not re-fired) — the retry path was broken
- **Fix:** `e.target.value = ""` also runs on refusal and on the validate/preview catch path
- **Files modified:** src/reader/SettingsPanel.tsx
- **Verification:** source inspection; covered by the 09-06 e2e surface
- **Committed in:** f6e4eea (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical UX correctness)
**Impact on plan:** Both fixes necessary for a compiling, correctly-retryable import flow. No scope creep.

## Issues Encountered
None — all three tasks compiled and passed on first post-fix verification; no unexpected failures beyond the typed-array build error above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three PORT capabilities are reader-operable: whole-library bundle export/import, combined highlights export (Settings), per-article highlights export (ArticleView)
- The 09-06 e2e plan has stable hooks: `dialog.import-preview` + `[data-initial-focus]` cancel marker, the verbatim refusal copy map in SettingsPanel, `lem-reader-bundle-v1.zip` / `lem-reader-highlights.md` / `highlights-{slug}.md` filenames, and the three button accessible names
- The full `npm run test` suite still carries the 24 documented pre-existing e2e failures in unrelated specs (Plan 09-07 scope) — this plan's suites (unit portability 122, SettingsPanel/ArticleView component, chromium portability e2e 6) are fully green

---
*Phase: 09-versioned-export-import*
*Completed: 2026-08-15*

## Self-Check: PASSED

- All 6 key files exist on disk (FOUND via `[ -f ]`)
- All 4 task/style commits exist in git log (c78e1cf, f6e4eea, b145ae7, 2deefc6)
- Plan-level verification re-run green: `npx vitest run tests/unit/portability` 122 passed; SettingsPanel + ArticleView component suites 17 passed; `npm run build` exit 0; `npx playwright test tests/e2e/portability/ --project=chromium` 6 passed
- Acceptance criteria per task verified by grep + test: onProceed single call site, data-initial-focus on cancel, verbatim refusal copy, role=status/aria-live/aria-atomic regions, insecure-context disable, sanitizeFilename in handler, type="button" + inert-at-mount buttons
