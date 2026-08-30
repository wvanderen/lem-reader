---
phase: 17-reader-owned-metadata
plan: 04
subsystem: portability
tags: [zod, export-bundle, import-conflicts, metadata-overrides, merge-on-win, react-dialog]

requires:
  - phase: 17-reader-owned-metadata
    provides: ArticleSchema readerTitle/readerAuthor fields + effectiveMetadata one-derivation module (17-01)
  - phase: 09-versioned-export-import
    provides: ExportBundleSchema envelope, validateBundle peek, detectImportPreview/resolveImportPlan dry-run core, applyImport puts-only transaction
  - phase: 12-epub-books
    provides: The 12-07 schemaVersion union-read versioning discipline this plan replayed for v3
provides:
  - Bundle schemaVersion 1|2|3 union; writers emit 3; peek refuses 4+ as newer-schema-version (D17-12)
  - ConflictKind seventh member article-metadata-override + exported metadataDiffers predicate + MetadataConflictDetail array on ImportPreviewData
  - resolveImportPlan optional itemChoices { metadataTakeIncoming } parameter — keep-local default, per-item take-incoming, merge-on-win on revision/divergence wins (D17-10/D17-11)
  - ImportPreviewDialog per-article Keep mine / Use imported disclosure UI + extended onProceed(overrides, applyPreferences, takeIncoming) signature; SettingsPanel itemChoices threading
affects: [17-05 migration + cross-surface e2e (closes META-04), any future bundle-version bump or import-conflict work]

tech-stack:
  added: []
  patterns:
    - "Version-bump replay discipline: widen the union, flip the prior refusal/writer-emit assertions explicitly (never strengthen-only) — the 12-07 precedent applied to v3"
    - "Merge shaping lives in resolveImportPlan articlesToWrite BEFORE the puts-only transaction — the article put IS the override put; applyImport stays byte-unchanged"
    - "Per-item choice UI: per-kind summary row carries the bulk default; a disclosure list renders EVERY conflicted article beyond the sampleIds cap-5"

key-files:
  created: []
  modified:
    - src/portability/bundle.ts
    - src/portability/ExportImportService.ts
    - src/portability/conflicts.ts
    - src/reader/ImportPreviewDialog.tsx
    - src/reader/SettingsPanel.tsx
    - tests/unit/portability/bundle-schema.test.ts
    - tests/unit/portability/validate-bundle.test.ts
    - tests/unit/portability/export-service.test.ts
    - tests/unit/portability/conflicts.test.ts
    - tests/unit/portability/import-preview-dialog.test.tsx
    - tests/unit/portability/atomic-import.test.ts

key-decisions:
  - "Per-kind overwrite on article-metadata-override is the honest bulk take-incoming (union with the per-item set) — a no-op select would violate the honesty constraint"
  - "MetadataConflictDetail carries localName/incomingName effective names computed via the ONE derivation (effectiveTitle) — the four pinned override-value fields alone cannot display the one-side-only cases"
  - "requirements-completed is [] — this plan ships META-04's portability half; migration/cascade/e2e close META-04 at 17-05 (17-01 split precedent)"

patterns-established:
  - "Additive ConflictKind widening forces Record-key type-completions in every Overrides literal; land registry entries with the kind (Task 2), build the UI on them (Task 3)"
  - "Explicit-undefined merge spread { ...incoming, readerTitle: local.readerTitle } is schema-safe (Zod optional accepts undefined; toEqual treats the key as absent)"

requirements-completed: []

duration: 18 min
completed: 2026-08-30
status: complete
---

# Phase 17 Plan 04: Portability — Bundle v3, Metadata Conflicts, Per-Item Choice Summary

**Bundle v3 union read (writers emit 3, v4+ calm-refuses) + the article-metadata-override conflict kind with keep-local default, per-item take-incoming dialog choice, and merge-on-win so a content refresh never renames the reader's library**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-30T00:58:38Z
- **Completed:** 2026-08-30T01:16:05Z
- **Tasks:** 3 (all TDD: RED → GREEN)
- **Files modified:** 11

## Accomplishments
- Bundle schemaVersion widened to the 1|2|3 union on the 12-07 discipline — overrides ride each article record via ArticleSchema composition (D17-12); v1/v2 fixtures import unchanged; writers emit 3; peek threshold > 3 so v4+ refuses calmly as newer-schema-version
- The seventh conflict kind article-metadata-override classifies honestly: both-sides-differ, one-side-only (D17-11 verbatim), identical-override no-op preserved (Pitfall 4 fix), and revision/divergence/metadata else-if exclusivity
- resolveImportPlan gains optional itemChoices { metadataTakeIncoming } (default empty — existing callers byte-compatible); merge-on-win keeps LOCAL overrides on every incoming-wins branch (D17-10) with per-item take-incoming writing the incoming row whole (a key-less incoming row removes the local override — explicit reader choice)
- ImportPreviewDialog renders a per-article disclosure list (every conflicted article beyond the cap-5 samples) with Keep mine / Use imported selects; the id set flows onProceed → SettingsPanel → resolveImportPlan as itemChoices; exactly one onProceed invocation remains (Pitfall 8)

## Task Commits

Each task followed the full TDD cycle:

1. **Task 1: Bundle v3 — union read, writer emits 3, peek refuses 4+** - `5073383` (test: RED — 6 failing) + `f63016c` (feat: GREEN)
2. **Task 2: conflicts.ts — kind, classification, merge-on-win** - `716a787` (test: RED — 8 failing) + `cf98c4e` (feat: GREEN)
3. **Task 3: ImportPreviewDialog per-item choice + SettingsPanel threading** - `ab2ba3e` (test: RED — 4 failing) + `98ac60b` (feat: GREEN)

**Plan metadata:** (final docs commit below)

## TDD Gate Compliance

All three tasks committed RED (failing) then GREEN (passing) in order:
- Task 1 RED: 6 failures (v3 rejected by union, writer emitting 2, peek refusing 3) → GREEN 38/38
- Task 2 RED: 8 of 10 new cases failing (kind unclassified, metadataConflicts undefined, take-incoming ignored, no merge); the 2 passing cases were behavior-pinning (keep-local default via the legacy no-op path; take-incoming whole-row via the legacy no-merge path) and are carried by the new explicit branches in GREEN → GREEN 56/56
- Task 3 RED: 4 of 6 new cases failing (the new UI shape); 2 registry-driven cases (summary-row copy, keep-both absence) passed via the registry entries Task 2 was forced to land for typecheck → GREEN 13/13

## Files Created/Modified
- `src/portability/bundle.ts` — schemaVersion union gains z.literal(3); version-history comment names Phase 17; BUNDLE_FILENAME untouched
- `src/portability/ExportImportService.ts` — writer emits `3 as const` (Phase 17 comment); peek `> 3`; applyImport + puts closure byte-unchanged; manifest.ts untouched (Pitfall 7)
- `src/portability/conflicts.ts` — seventh ConflictKind; exported metadataDiffers (strict inequality — Pitfall 4 fix); MetadataConflictDetail + ImportPreviewData.metadataConflicts; ImportItemChoices + mergeOnWin in resolveImportPlan; module still zero-writes
- `src/reader/ImportPreviewDialog.tsx` — DEFAULT_OVERRIDES/KIND_LABELS entries; disclosure UI with per-article Keep mine / Use imported selects; metadataTakeIncoming Set state reset on every open; onProceed third argument
- `src/reader/SettingsPanel.tsx` — Proceed handler threads the set into resolveImportPlan as itemChoices
- Tests: bundle-schema (+4 cases + forward-compat flip 3→4), validate-bundle (+1 v4-refusal/v3-pass case + peek-priority flip + round-trip 2→3), export-service (writer-emit flips 2→3 ×3 + case re-words), conflicts (+10 cases: classification 4 + resolution 6), import-preview-dialog (+6 cases), atomic-import (ALL_SKIP key only)

## Decisions Made
- **Per-kind `overwrite` on article-metadata-override = honest bulk take-incoming** — the plan requires the dialog's per-kind select to offer skip/overwrite, but the plan's resolution spec drove the metadata-only branch solely off the take-incoming set, leaving `overwrite` a silent no-op. A control that does nothing violates the project's honesty constraint; the bulk overwrite now takes every metadata-conflicted article incoming (union with the per-item set). Covered by a dedicated test case.
- **MetadataConflictDetail carries `localName`/`incomingName`** — the dialog must show "the local effective name and the incoming name" (Task 3 behavior); the four pinned override-value fields cannot render the one-side-only cases (no local override value exists to display). The effective names are computed inside detectImportPreview via effectiveTitle — the ONE derivation (META-02), never forked in the dialog.
- **`requirements-completed: []`** — META-04's migration, cascade, and end-to-end round-trip proofs close at 17-05 (which carries `requirements: [META-02, META-04]`); this plan ships the portability half (the 04-02/09-01/17-01 split precedent).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Bulk semantics for the per-kind metadata select**
- **Found during:** Task 2 (resolveImportPlan semantics)
- **Issue:** Task 3's behavior block offers skip/overwrite on the per-kind select for the new kind, but the plan's Task 2 action 3(a) consults only the take-incoming set in the metadata-only branch — `overwrite` would be a lying no-op control
- **Fix:** `takeIncomingMetadata(id) = overrides["article-metadata-override"] === "overwrite" || metadataTakeIncoming.has(id)`; applied in the metadata-only branch AND mergeOnWin (bulk composes with per-item)
- **Files modified:** src/portability/conflicts.ts
- **Verification:** dedicated test case "per-kind overwrite … honest bulk take-incoming" (both conflicted articles taken, skipped 0)
- **Committed in:** cf98c4e (Task 2 GREEN)

**2. [Rule 2 - Missing critical] Effective-name fields on MetadataConflictDetail**
- **Found during:** Task 2 (detail array design)
- **Issue:** the four pinned override-value fields cannot display "the local effective name" for one-side-only conflicts (local override absent → nothing to render); the dialog has no canonical-title access
- **Fix:** detail entries additionally carry localName/incomingName computed in detectImportPreview via effectiveTitle (the ONE derivation; conflicts.ts imports effectiveMetadata)
- **Files modified:** src/portability/conflicts.ts
- **Verification:** classification tests assert localName/incomingName incl. the canonical fallback ("Sample Article"); dialog tests render names from them
- **Committed in:** 716a787 (tests) + cf98c4e (implementation)

**3. [Rule 3 - Blocking] Type-completions forced by the widened ConflictKind**
- **Found during:** Task 2 GREEN (typecheck gate)
- **Issue:** `Overrides = Record<ConflictKind, PerKindOverride>` and `KIND_LABELS = Record<ConflictKind, …>` require every key once the kind lands — dialog registries + three test literals would not compile at the Task 2 commit
- **Fix:** Task 2 landed the minimal registry/type-completions (dialog DEFAULT_OVERRIDES + KIND_LABELS entries; ALL_SKIP keys in conflicts/atomic-import tests; DEFAULTS key + samplePreview `metadataConflicts: []` in the dialog test); Task 3 built the full UI on them
- **Files modified:** src/reader/ImportPreviewDialog.tsx, tests/unit/portability/{conflicts,atomic-import,import-preview-dialog}.test.tsx
- **Verification:** `npx tsc` clean at every commit; dialog test green pre-Task-3 for the registry behaviors
- **Committed in:** cf98c4e

**4. [Rule 1 - Test bug] Reopen-reset assertion ordering**
- **Found during:** Task 3 GREEN
- **Issue:** the reopen-reset test asserted the per-item select without re-expanding the disclosure — but the disclosure resets to collapsed on reopen too (correct behavior)
- **Fix:** test re-expands "Show articles" after reopen before asserting keep-mine + empty payload
- **Files modified:** tests/unit/portability/import-preview-dialog.test.tsx
- **Verification:** 13/13 green
- **Committed in:** 98ac60b

---

**Total deviations:** 4 auto-fixed (2 missing critical, 1 blocking, 1 test bug)
**Impact on plan:** All fixes serve the plan's own pinned behaviors (honest UI, effective names, commit-green typecheck). No scope creep — applyImport, manifest.ts, and every existing test case are byte-unchanged.

## Issues Encountered
None beyond the deviations above. The pre-existing whole-repo lint failures in `src/portability/zipSlip.ts` (documented in 17-01-SUMMARY and `deferred-items.md`) remain out of scope; every file this plan touched lints clean.

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 1 verify | `npx vitest run bundle-schema validate-bundle export-service` | 38/38 passed, exit 0 |
| Task 2 verify | `npx vitest run conflicts atomic-import` | 56/56 passed, exit 0 |
| Task 3 verify | `npx vitest run import-preview-dialog` | 13/13 passed, exit 0 |
| Plan verification | `npx vitest run tests/unit/portability/` | 10 files, 176/176 passed, exit 0 |
| Full unit suite (honest gate) | `npm run test:unit -- --run` | 1344 passed / 0 failed / 13 intentional skips (92 files), exit 0 |
| Typecheck | `npx tsc` | exit 0 |
| Lint (changed files) | `npx eslint <11 changed files>` | exit 0 |
| Byte-stability | `git diff 6500ee2 -- src/portability/manifest.ts` | empty (Pitfall 7) |
| Byte-stability | applyImport diff vs 6500ee2 | untouched (merge lives in resolveImportPlan) |
| Union members | `rg 'z.literal(' bundle.ts` | 1, 2, and 3 present |
| Writer + peek | `rg '3 as const' / '> 3'` ExportImportService.ts | both present with Phase 17 comments |

## Threat Surface

No new surface beyond the plan's threat model. T-17-08 mitigated as planned: the v3 empty-string readerTitle bundle refuses at ArticleSchema min(1) inside the bundle parse (test-proven); React text-child rendering carries the display; the 200MB zip cap is upstream and unchanged. T-17-09 mitigated: merge-on-win + skip-by-default are unit-proven on every incoming-wins branch; the puts-only atomic transaction is byte-unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 17-05 (final plan of Phase 17) can close META-02/META-04: the conflict row, Keep mine / Use imported labels, keep-local default, take-incoming, merge-on-win, and the D17-13 cascade all have shippable UI + logic to drive end-to-end across the A/B two-context harness
- Blockers: none. The v3 writer means 17-05's round-trip specs export from a v3-emitting build (expected; fixtures stay v1/v2-compatible via the union read)

---
*Phase: 17-reader-owned-metadata*
*Completed: 2026-08-30*

## Self-Check: PASSED

All key-files exist on disk; all seven task/metadata commits (5073383, f63016c, 716a787, cf98c4e, ab2ba3e, 98ac60b, 77c98a9) verified in git log; every task acceptance criterion and plan-level verification gate recorded above with honest results.
