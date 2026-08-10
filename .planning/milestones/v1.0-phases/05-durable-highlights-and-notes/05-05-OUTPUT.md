# 05-05-OUTPUT.md — Phase Gate Record (Plan 05-05)

> The permanent record of the literal phase-gate command, per-suite +
> per-engine counts, and the literal exit code. Mirrors the Plan 04-11
> precedent (anti-pattern guard: the executor ran the FULL `npm run test`
> itself in ONE invocation, recorded BOTH pass AND fail counts honestly,
> no subset / `--grep` / engine skip).

## Literal command

```
npm run test
```

(`package.json` `test` script: `npm run test:unit -- --run && npm run test:e2e` —
unit/component via Vitest, then e2e via Playwright × chromium/firefox/webkit.)

## Result

**Exit code: 0**

- Unit + component tests (Vitest): **507 passed / 0 failed / 0 skipped** (39 test files)
- E2e tests (Playwright × 3 engines): **489 passed / 0 failed / 0 skipped**
- **Total: 507 + 489 = 996 passed / 0 failed / 0 skipped**

## Annotation e2e suite (Plan 05-05 deliverable)

`tests/e2e/annotations/` — **12 spec files + 1 fixture helper = 48 specs × 3
engines = 144 e2e runs, all green.**

| Spec | Coverage | Requirement |
|------|----------|-------------|
| `_fixtures.ts` | shared helpers (openArticle, selectRangeInBlock, seedHighlight/Note, driveMatrix) reusing the 6-fixture corpus from tests/e2e/pagination/fixtures-matrix | — |
| `capture-highlight.spec.ts` | select → Highlight → mark.highlight renders + announces; both modes; eligible-set breadth | ANNO-01 |
| `capture-rejects.spec.ts` | D5-06 multi-block + D5-13 overlap + D5-08 cross-page rejection | ANNO-01 |
| `keyboard-shortcuts.spec.ts` | H/N capture, N-opens-popover, collapsed no-op, form-field guard, M independence, toolbar focusable | A11Y-01 |
| `note-create-edit.spec.ts` | N-opens-popover, debounced save, has-note modifier, reopen-with-text, clear-removes-modifier, no-HTML-injection | ANNO-02 |
| `drawer-view.spec.ts` | trigger aria-expanded, dialog title, empty-state, populated reading-order list, count badge, close + focus-restore | ANNO-03 |
| `delete-confirm.spec.ts` | two-step confirm, Keep non-destructive default focus, cascade-delete highlight+note, announce | ANNO-03 |
| `navigate-back.spec.ts` | paginated page-turn + focus, scrolling scrollIntoView + focus, ambiguous/orphan disabled jump | ANNO-04 |
| `survive-relayout.spec.ts` | typography repagination, mode switch both directions, article reopen reload | ANNO-05, STATE-03 |
| `cross-fragment-render.spec.ts` | scrolling→paginated re-renders <mark> slices sharing data-highlight-id; no silent gap | D5-16 |
| `ambiguous-orphan-surface.spec.ts` | orphan inline dashed marker, drawer flag + disabled jump + enabled delete, one-time open-announce, ambiguous case | ANNO-07 |
| `persist-reload.spec.ts` | 2 highlights + 1 note reload from Dexie + render at same passages; engine-stable read | STATE-03 |
| `forced-colors-shapes.spec.ts` | bare vs note-bearing vs unresolved distinguishable by SHAPE under emulated forced-colors | A11Y-05 |

## Implementation gaps surfaced + fixed by this plan (Rule 1 deviations)

The e2e suite surfaced 4 real implementation gaps in the Plans 05-01..04
implementation, all fixed inline (each fix committed atomically):

1. **Paginated-mode capture was broken.** `.page-fragment` blocks did not
   carry `data-block-index` (D5-08 contract unmet), so `captureSelection`
   always returned `{ ok: false, reason: "ineligible" }` in paginated mode
   — capture NEVER worked outside scrolling mode. Fix: `fragmentRenderer`
   emits `data-block-index` + `data-block-grapheme-start` on each fragment
   entry; `capture.ts` honors the slice offset so a highlight captured on a
   split-block slice lands at the correct passage.

2. **Inline `<mark>` had no activation handler.** D5-10 / UI-SPEC §29 says
   "activating a `<mark>` opens the popover" but no onClick/onKeyDown was
   wired. Fix: delegated click listener on the article + Enter/Space
   keydown handling in ArticleView so activating a highlight opens the
   note popover via `setOpenPopoverFor`.

3. **Measurement double-counted blocks after the fragment `data-block-index`
   addition.** `measureAllBlocks` queried ALL `[data-block-index]`; after
   fix #1, paginated mode returned measurement-body blocks + fragment
   blocks, tripping the engine's length defense → `stale-drop` regression
   (PAGE-07). Fix: scope the measurement query to exclude `.page-fragment`
   descendants (`[data-block-index]:not(.page-fragment ...)`).

4. **`handleNavigateBack` focus didn't settle in firefox.** The rAF-deferred
   `<mark>` focus fired before firefox's async `scrollIntoView` completed.
   Fix: a `setTimeout(120ms)` belt-and-suspenders re-focus after the rAF.

## Honest attestation

- The executor ran the FULL `npm run test` itself in ONE invocation (no
  `--grep`, no `--project` engine skip, no subset).
- Both pass AND fail counts are recorded above. The final run is
  **0 failed**; prior intermediate runs during this plan's development
  surfaced the 4 gaps above (recorded as Rule 1 deviations) + were fixed
  before this record was written.
- No `test.skip` / `test.fixme` was used to make a red suite green. The
  eligible-set breadth tests for code-block + figure-caption assert
  capture+persistence (D5-07's "highlightable" = capturable) rather than
  an inline `<mark>` — this is Plan 05-04's DOCUMENTED rendering scope
  ("paragraph + heading only carry inline overlays"), not a silent skip;
  the deferred inline-render for those kinds is logged in the SUMMARY.

## Command reproducibility

```
$ npm run test
# unit: 507 passed / 0 failed
# e2e (chromium + firefox + webkit): 489 passed / 0 failed
# exit 0
```

---
*Phase: 05-durable-highlights-and-notes — Plan 05-05 phase gate*
*Date: 2026-08-07*
