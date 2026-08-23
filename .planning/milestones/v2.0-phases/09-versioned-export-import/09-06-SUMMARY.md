---
phase: 09-versioned-export-import
plan: 06
subsystem: testing
tags: [playwright, e2e, portability, zip-slip, export-import, axe, accessibility, fflate]

# Dependency graph
requires:
  - phase: 09-versioned-export-import (Plans 09-01..09-05)
    provides: the portability modules (bundle/manifest/zipSlip/conflicts/ExportImportService/markdown), the Settings Your-data cluster, ImportPreviewDialog, and the ArticleView export affordance these gates prove
provides:
  - SC#4 round-trip integrity gate (two-context machine A/B harness, offset byte-equality, no-page-key walk, SC#1 source-URL carriage)
  - SC#2 malicious-archive refusal gate (crafted traversal zips, zero state change, all five stores)
  - PORT-02 dialog flow gate (defaults-skip byte-unchanged, keep-both minted row, Esc no-change, data-initial-focus)
  - PORT-03 export content gate (locked template markers/citation/Note/footers + never-dropped orphans)
  - axe + keyboard gate for the settings cluster and the preview dialog (3 engines)
  - tests/e2e/portability/_portability.ts shared harness (remove-cascade clones + shipped-schema bundle builder + confident-anchor derivation)
affects: [09-versioned-export-import (09-07 gap closure), future portability/acceptance phases]

# Tech tracking
tech-stack:
  added: [] # no new dependencies — fflate/zod/@axe-core/playwright all shipped by 09-01..09-05
  patterns:
    - "Two browser contexts as two machines (isolated IndexedDB origins-in-profile) for cross-device round-trip proof"
    - "Test-side bundle construction via ExportBundleSchema.parse + computeManifest + zipSync (hand-built bundles byte-indistinguishable at the validation boundary)"
    - "Confident-anchor derivation in Node through the SHIPPED deriveQuoteSelector/resolveQuoteSelector (ASCII passages keep grapheme segmentation engine-identical)"
    - "Engine-variable keyboard assertions scoped per engine with universal safety properties (high-zoom spec precedent)"

key-files:
  created:
    - tests/e2e/portability/round-trip.spec.ts
    - tests/e2e/portability/zip-slip-regression.spec.ts
    - tests/e2e/portability/import-preview.spec.ts
    - tests/e2e/portability/highlights-export.spec.ts
    - tests/e2e/portability/a11y.spec.ts
    - tests/e2e/portability/_portability.ts
    - .planning/phases/09-versioned-export-import/deferred-items.md
  modified:
    - src/reader/ImportPreviewDialog.tsx
    - src/portability/markdown.ts
    - src/reader/SettingsPanel.tsx
    - tests/unit/portability/import-preview-dialog.test.tsx
    - tests/unit/portability/markdown.test.ts

key-decisions:
  - "Two browser contexts are the machine A/B surrogate — separate profiles give separate IndexedDB; the whole flow runs through the real UI (no DEV hooks)"
  - "SC#4 offset equality is asserted at the raw IndexedDB row level (readRow byte-equal position.start/end) AND at the rendering surface (visible mark for the fixture-backed highlight after a scrolling-mode swap)"
  - "Rule 1 fix: Esc-originated close now routes cleanup through onCancel via an open-prop mirror — every close path resets the import state machine + file input (the 09-05 same-file-retry guarantee had an Esc hole)"
  - "Rule 2 fix: library-wide export renders vanished-article highlights in a citation-less 'Highlights without an article' section instead of silently dropping them (D9-09 never-drop at the external-tool surface)"
  - "Stacked-modal sequential focus navigation diverges by engine (webkit parks focus on inert body, firefox retains the last control) — universal trap safety + operability asserted on all engines, the full wrap cycle on chromium; logged to deferred-items.md with candidate resolutions (Rule 4-adjacent, needs human choice)"

patterns-established:
  - "_portability.ts shared e2e harness: readRow/countRows/readAllRows clones, clear-rows prepareFreshPage, seedRows single-transaction seeding, buildBundleZip, collectPageKeys recursive SC#4 walk"
  - "setInputFiles exercises BOTH A5 payload variants across the suite: path form (round-trip) and { name, mimeType, buffer } form (zip-slip, preview, a11y)"

requirements-completed: [PORT-01, PORT-02, PORT-03]

# Metrics
duration: 27 min
completed: 2026-08-15
status: complete
---

# Phase 9 Plan 06: End-to-End Proof Summary

**Five real-browser phase-exit gates replacing the Wave-0 sentinels: SC#4 cross-machine round trip (two contexts, byte-equal offsets, no page data in the bundle), SC#2 crafted Zip Slip refusal with zero state change, the PORT-02 preview dialog flow, PORT-03 .md export content with never-dropped orphans, and axe + keyboard on every new surface — plus two Rule 1/2 correctness fixes the gates surfaced.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-15T18:58:42Z
- **Completed:** 2026-08-15T19:26:25Z
- **Tasks:** 3
- **Files modified:** 11 (7 created, 4 modified)

## Gate Evidence (per-engine counts, run by this executor)

| Gate | Spec | chromium | firefox | webkit | Total |
|---|---|---|---|---|---|
| SC#4 round trip | round-trip.spec.ts | 1 ✓ | 1 ✓ | 1 ✓ | 3/3 |
| SC#2 zip slip (2 variants) | zip-slip-regression.spec.ts | 2 ✓ | 2 ✓ | 2 ✓ | 6/6 |
| PORT-02 preview flow | import-preview.spec.ts | 2 ✓ | 2 ✓ | 2 ✓ | 6/6 |
| PORT-03 export content | highlights-export.spec.ts | 2 ✓ | 2 ✓ | 2 ✓ | 6/6 |
| a11y + keyboard | a11y.spec.ts | 2 ✓ | 2 ✓ | 2 ✓ | 6/6 |
| download smoke (09-01) | download-smoke.spec.ts | 1 ✓ | 1 ✓ | 1 ✓ | 3/3 |

- `npx playwright test tests/e2e/portability/` → **30/30 passed, exit 0** (all 6 spec files × 3 engines)
- Phase-scoped sampling `npm run test:unit -- --run tests/unit/portability && npx playwright test tests/e2e/portability/ --project=chromium` → 125 unit + 10 e2e passed, exit 0
- Full unit suite `npm run test:unit -- --run` → 851 passed / 7 skipped (pre-existing) / 0 failed
- `npm run build` exits 0; `tsc --noEmit` clean; ESLint + Prettier clean on every touched file
- Neighbor regression spot-check (panel-keyboard, a11y, remove-cascade on chromium) → 13/13 green

## Accomplishments

- **SC#4 proven end-to-end in real browsers:** a bundle exported on machine A (2 articles — paste-style + md-style with provenance.sourceUrl — 3 highlights incl. one keyed to a bundled fixture, 1 note, 1 location, reader prefs) imports on machine B with position.start/end byte-equal, the note FK intact, the compound location key present, prefs applied on the fresh device, and the fixture-backed highlight rendering a visible mark in the reader.
- **SC#1 + data minimization proven at the bytes:** Node-side unzip + parse of the captured download asserts schemaVersion 1, the source URL verbatim on its article, the fixture ABSENT from articles while present in fixtureIds, and a recursive key walk finding zero "page" keys anywhere in bundle.json.
- **SC#2 proven through the real UI:** both crafted traversal variants (raw `../../evil.sh` + URL-encoded `..%2F..%2Fevil.sh`) over otherwise-valid entries refuse with the verbatim unsafe-entry copy, never open the preview, and leave all five stores untouched.
- **PORT-02 dialog flow proven at row level:** Esc-close zero-mutation, data-initial-focus on Cancel import, defaults-skip leaving the conflicting highlight byte-unchanged with an honest "1 item was skipped" report, and keep-both producing the local row + a minted-id row carrying the bundle text.
- **PORT-03 content matches the locked template** in both files, including the D9-09 never-drop orphan (with its note) in the combined export's totals.
- **Every new surface is axe-clean** (WCAG 2.2 AA tags, zero violations on the settings cluster and the preview dialog) across all three engines.

## Task Commits

Each task was committed atomically:

1. **Task 1: round-trip.spec.ts — SC#4 cross-machine integrity** - `aa54668` (test) + `_portability.ts` shared harness
2. **Task 2: zip-slip-regression.spec.ts + import-preview.spec.ts** - `57ee6f8` (fix: Esc-close cleanup) + `aa2b2fe` (test)
3. **Task 3: highlights-export.spec.ts + a11y.spec.ts** - `03b366c` (fix: orphan never-drop) + `be3a387` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `tests/e2e/portability/round-trip.spec.ts` - SC#4 gate: two-context A/B machines, download capture, Node bundle inspection, raw IndexedDB truth
- `tests/e2e/portability/zip-slip-regression.spec.ts` - SC#2 gate: crafted traversal zips via the A5 buffer payload, zero state change
- `tests/e2e/portability/import-preview.spec.ts` - PORT-02 gate: Esc no-change, defaults-skip, keep-both mint
- `tests/e2e/portability/highlights-export.spec.ts` - PORT-03 gate: per-article + library-wide .md content vs the locked template
- `tests/e2e/portability/a11y.spec.ts` - axe + keyboard gate for the settings cluster + preview dialog
- `tests/e2e/portability/_portability.ts` - shared harness (remove-cascade clones, shipped-schema bundle builder, confident anchors, SC#4 key walk)
- `src/reader/ImportPreviewDialog.tsx` - Rule 1 fix: Esc-originated close routes cleanup through onCancel (open-prop mirror)
- `src/portability/markdown.ts` + `src/reader/SettingsPanel.tsx` - Rule 2 fix: never-drop vanished-article highlights in the combined export
- `tests/unit/portability/import-preview-dialog.test.tsx`, `tests/unit/portability/markdown.test.ts` - regression locks for both fixes
- `.planning/phases/09-versioned-export-import/deferred-items.md` - stacked-modal engine divergence + candidate resolutions

## Decisions Made

- Two browser contexts = two machines (isolated IndexedDB per profile); everything runs through the real UI — no DEV hooks anywhere in the specs.
- The fixture-backed highlight's rendering proof switches to scrolling mode first (paginated mode mounts only the current fragment — the anchored passage may not be on page 1); deterministic across engines.
- Per-article export's orphan assertion reads the footer's honest orphan-count field ("· 0 orphan" for the article's own two highlights) while the *[orphan]* marker + never-drop proof lands in the library-wide file where the ghost highlight actually renders — matches what each surface can honestly show given the articleId filter.
- Engine-scoped keyboard assertion: universal trap safety (no interactive escape) + Esc restore + click operability on all three engines; the full wrap cycle only on chromium (see Deviations #3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Esc-originated close left the import state machine stuck open**
- **Found during:** Task 2 (import-preview.spec.ts — the plan's "press Escape → re-run the import flow" sequence)
- **Issue:** Native Esc closed the ImportPreviewDialog without the parent knowing: React state stayed `open=true` against a closed dialog and the file input never reset — a hole in the 09-05 guarantee that every close path resets so same-file retry never no-ops (a real user re-picking the same file after Esc would silently no-op in engines that skip duplicate change events)
- **Fix:** `openRef` mirrors the open prop at event time; the `close` listener calls `onCancel()` only when the close was Esc-originated (open still true) — the controlled Proceed/Cancel path already cleaned up and must not re-invoke it (it would wipe the "Imported…" status message)
- **Files modified:** src/reader/ImportPreviewDialog.tsx, tests/unit/portability/import-preview-dialog.test.tsx
- **Verification:** new unit regression (Esc close → onCancel exactly once; controlled close → not re-invoked), 7/7 dialog unit tests green; the e2e Esc → re-run → Import flow passes on all three engines
- **Committed in:** 57ee6f8

**2. [Rule 2 - Missing critical] Library-wide export silently dropped vanished-article highlights (D9-09)**
- **Found during:** Task 3 (highlights-export.spec.ts — the plan's mandated "highlight keyed to a nonexistent article id (orphan at export)" seed)
- **Issue:** SettingsPanel's grouping step skipped entries whose articleId resolved to no article — the highlight AND its note vanished from lem-reader-highlights.md, violating D9-09 "never silently dropped" at the external-tool surface
- **Fix:** renderLibraryHighlights gained an optional `unmatchedEntries` tail rendering a citation-less "## Highlights without an article" section (blockquote with *[orphan]* marker + Note line + honest footer); SettingsPanel partitions matched/unmatched; totals count them
- **Files modified:** src/portability/markdown.ts, src/reader/SettingsPanel.tsx, tests/unit/portability/markdown.test.ts
- **Verification:** 2 new unit locks (orphan section renders + totals; empty unmatched keeps the byte-stable legacy shape), 20/20 markdown unit tests green; the e2e library-wide orphan assertions pass on all three engines
- **Committed in:** 03b366c

**3. [Rule 4-adjacent - NOT auto-fixed, surfaced] Stacked-modal sequential focus navigation diverges by engine**
- **Found during:** Task 3 (a11y.spec.ts keyboard checks)
- **Issue:** With the settings panel and the preview dialog both open via showModal (the 09-05 locked sibling mount), Tab behaves differently per engine: chromium cycles fully (transient inert body touch), firefox retains focus on the last control at the wrap, webkit parks focus on inert body/the dialog element — the inner controls are unreachable via sequential nav on webkit
- **What holds everywhere (asserted):** initial focus on the non-destructive Cancel, no escape to any interactive control outside the dialog, Esc closes + restores focus into the settings panel, and every control is operable (real clicks pass in the PORT-02 specs on all engines)
- **Action:** the structural fixes (nested dialogs / closing the settings panel under the preview) reverse deliberate 09-05 decisions — Rule 4 territory. Logged with candidate resolutions in `.planning/phases/09-versioned-export-import/deferred-items.md` for 09-07 or a human decision; the spec asserts universal safety everywhere + the chromium wrap cycle (the high-zoom spec's engine-variable precedent)
- **Committed in:** be3a387 (spec + deferred-items.md)

---

**Total deviations:** 3 (1 Rule 1 auto-fixed, 1 Rule 2 auto-fixed, 1 Rule 4-adjacent surfaced-not-fixed)
**Impact on plan:** Both auto-fixes were correctness requirements the gates were built to expose; no scope creep. The surfaced item needs a product decision but does not block any Phase 9 success criterion (all four SCs have real-browser evidence).

## Issues Encountered

- Minor test-shape iterations during authoring (missing fflate unzipSync import; the preview summary's honest "(1 new)" qualifier; the always-mounted closed dialog requiring not.toBeVisible instead of toHaveCount(0); axe's iframe instrumentation disturbing focus, resolved by running keyboard checks before the axe pass; inverted boolean semantics in the first focus-escape helper) — all fixed within the task budgets; the final specs are deterministic across engines.
- The 24 pre-existing e2e failures in unrelated specs (18 pagination, 3 capture-highlight, 3 dexie-migration) were neither encountered nor touched — the portability gates all ran scoped; Plan 09-07 closes them next wave.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four Phase 9 ROADMAP success criteria now have real-browser evidence: versioned bundle export with per-article source URLs (SC#1), validated atomic import with Zip Slip refusal (SC#2), highlights Markdown export (SC#3), and round-trip integrity (SC#4).
- PORT-01/PORT-02/PORT-03 are proven end-to-end and marked complete; `tests/e2e/portability/` (6 spec files, 30 cells) is the standing regression gate.
- Open for 09-07: the stacked-modal focus-nav engine divergence (deferred-items.md) and the 24 pre-existing unrelated e2e failures.

## Self-Check: PASSED

- Files exist: round-trip.spec.ts, zip-slip-regression.spec.ts, import-preview.spec.ts, highlights-export.spec.ts, a11y.spec.ts, _portability.ts (verified on disk)
- Commits exist: aa54668, 57ee6f8, aa2b2fe, 03b366c, be3a387 (verified via git log)
- `npx playwright test tests/e2e/portability/` → 30/30 passed, exit 0 (all engines)
- Phase-scoped sampling command → exit 0; full unit suite → 0 failed; npm run build → exit 0

---
*Phase: 09-versioned-export-import*
*Completed: 2026-08-15*
