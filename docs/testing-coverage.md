# Functional browser coverage audit (#185)

Chromium runs every functional case. The table maps every current spec; new
specs inherit the three-engine contract until reviewed. This conservative
classification keeps all browser-dependent coverage while duration evidence
identifies worthwhile candidates for deeper review.

## Matrix decision

Retain the fixture × viewport pagination invariants on all engines: wrapping,
DOM geometry, font metrics, overflow and fallback are precisely the behavior
that differs between engines. The corpus already samples three typography
stress cells; coverage-invariant uses default typography and leaves typography
changes to repagination-anchor. Annotation matrices exercise native selection
and range rendering, so retain their browser permutations too. No matrix
assertions or business-rule permutations are removed in this pass. The only
API-only matrix, ingestion/ssrf-matrix, runs once in Chromium.

## Duration comparison

CI saves `.test-reports/functional.json`. Download the reference artifacts and
run `node scripts/summarize-e2e.mjs <pr-report.json> <exhaustive-report.json>`.
The ranking separates first-attempt time (ordinary-case cost) from retry time
(flake cost) so a contended run's timeout retries are not misread as suite
size. Compare wall time on the same reference hardware; record `uptime`,
commit, retries, failures and contention. Worker seconds rank expensive specs
but cannot be interpreted as wall-time savings. The under-ten-minute target
remains a rollout goal until a successful PR run supplies evidence.

The 2026-10-13 PR (38480319853) and manual exhaustive (38480324742) runs
started the same second on the shared reference Mac and inflated each other
~3.4x (e.g. WebKit no-overflow-invariant: 243.5s vs 66.6s first-attempt for
identical tests). Both reference jobs now share a job-level concurrency group
(`reference-mac-functional`) and queue serially — treat any timing from
overlapping runs as void.

## Observable readiness (settle waits)

The pagination spec family no longer sleeps a guessed 600–1500ms after
pagination commits, turns, or repagination triggers. `PaginatedSurface`
publishes DEV-only readiness in `window.__lemPagination` (`status` plus
`overflowSettled`, reset synchronously on every new pass, including font-set
re-fires and correction rounds); `tests/e2e/pagination/_harness.ts` turns that
into `openPaginated`, `waitForPaginationSettled`, `waitForPageSettled`, and
`markPaginationEpoch` + `waitForRepagination` (the mark distinguishes a fresh
publication from the stale one after a mode swap). Deliberate time-based
coverage keeps its fixed waits: the 400ms settings-save debounce, the
read-aloud follow-suspension windows, and the measurement harnesses' long-task
sampling — timing is the subject there.

## Spec map

Three-engine entries retain browser integration by default. Their shared
rationale is preservation of real-browser rendering, events and persistence;
no claim of a completed per-assertion audit is implied. Chromium-only entries
have specific reviewed rationales, enforced by `test:e2e:coverage`.

| Spec                                                | PR engines | Rationale                                                                                                               |
| --------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `a11y.spec.ts`                                      | All three  | Preserve browser integration; conservative default.                                                                     |
| `acceptance/core-reading-flow.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/ambiguous-orphan-surface.spec.ts`      | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/capture-highlight.spec.ts`             | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/capture-rejects.spec.ts`               | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/cross-fragment-render.spec.ts`         | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/delete-confirm.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/drawer-view.spec.ts`                   | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/eligibility-matrix.spec.ts`            | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/forced-colors-shapes.spec.ts`          | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/highlight-colors.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/highlight-tags.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/keyboard-shortcuts.spec.ts`            | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/navigate-back.spec.ts`                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/note-create-edit.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/note-draft-recovery.spec.ts`           | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/note-placement.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/note-popover-focus.spec.ts`            | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/note-save-reliability.spec.ts`         | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/persist-reload.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/pointer-save.spec.ts`                  | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/span-capture.spec.ts`                  | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/survive-relayout.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/toolbar-keydownless-focus.spec.ts`     | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/toolbar-mount-selection-gated.spec.ts` | All three  | Preserve browser integration; conservative default.                                                                     |
| `annotations/toolbar-tab-path.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/back-nav.spec.ts`                           | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/custom-theme.spec.ts`                       | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/dialog-centering.spec.ts`                   | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/header-geometry.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/library-tidy.spec.ts`                       | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/mobile-first-page-chrome.spec.ts`           | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/paginated-quiet-header.spec.ts`             | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/pride-themes.spec.ts`                       | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/read-nav.spec.ts`                           | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/shell-nav.spec.ts`                          | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/tag-menu-geometry.spec.ts`                  | All three  | Preserve browser integration; conservative default.                                                                     |
| `chrome/tag-popover.spec.ts`                        | All three  | Preserve browser integration; conservative default.                                                                     |
| `discover/discover.spec.ts`                         | All three  | Preserve browser integration; conservative default.                                                                     |
| `epub-intake.spec.ts`                               | All three  | Preserve browser integration; conservative default.                                                                     |
| `font-failure.spec.ts`                              | All three  | Preserve browser integration; conservative default.                                                                     |
| `forced-colors.spec.ts`                             | All three  | Preserve browser integration; conservative default.                                                                     |
| `high-zoom.spec.ts`                                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `imagery/decode-matrix.spec.ts`                     | All three  | Preserve browser integration; conservative default.                                                                     |
| `imagery/geometry.spec.ts`                          | All three  | Preserve browser integration; conservative default.                                                                     |
| `imagery/offline-reopen.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `imagery/refusal-matrix.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `ingestion/dexie-migration.spec.ts`                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `ingestion/happy-path.spec.ts`                      | All three  | Preserve browser integration; conservative default.                                                                     |
| `ingestion/ssrf-matrix.spec.ts`                     | Chromium   | APIRequestContext checks the Node endpoint; no browser page is used.                                                    |
| `ingestion/youtube-transcript.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/add-entry-highlights.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/add-result.spec.ts`                        | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/book-add-result.spec.ts`                   | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/browse-open.spec.ts`                       | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/card-actions.spec.ts`                      | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/focused-add.spec.ts`                       | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/library-restore.spec.ts`                   | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/mark-read-and-close.spec.ts`               | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/markdown-upload.spec.ts`                   | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/metadata-edit.spec.ts`                     | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/progress-recent.spec.ts`                   | Chromium   | Seeded progress ratios, membership, ordering, and React node identity; geometry and restoration are covered separately. |
| `library/reading-views.spec.ts`                     | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/remove-cascade.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/row-tags.spec.ts`                          | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/search-tag-filter.spec.ts`                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/sort-control.spec.ts`                      | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/starter-removal.spec.ts`                   | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/stats-strip.spec.ts`                       | Chromium   | Seeded reading-time totals, conditional copy, DOM order, and deletion totals; no layout or focus assertions.            |
| `library/upload-queue.spec.ts`                      | All three  | Preserve browser integration; conservative default.                                                                     |
| `library/v1-regression.spec.ts`                     | All three  | Preserve browser integration; conservative default.                                                                     |
| `measurement/last-valid-view.spec.ts`               | All three  | Preserve browser integration; conservative default.                                                                     |
| `measurement/longtask-smoke.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `measurement/stale-drop.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `open-every-fixture.spec.ts`                        | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/coverage-invariant.spec.ts`             | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/fallback-banner.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/fallback-oversize.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/initial-pagination-even.spec.ts`        | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/mode-switch-anchor.spec.ts`             | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/no-overflow-invariant.spec.ts`          | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/page-motion.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/page-turn-controls.spec.ts`             | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/page-turn-focus-handoff.spec.ts`        | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/page-turn-stability.spec.ts`            | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/repagination-anchor.spec.ts`            | All three  | Preserve browser integration; conservative default.                                                                     |
| `pagination/termination.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `panel-keyboard.spec.ts`                            | All three  | Preserve browser integration; conservative default.                                                                     |
| `pdf-intake.spec.ts`                                | All three  | Preserve browser integration; conservative default.                                                                     |
| `persistence.spec.ts`                               | All three  | Preserve browser integration; conservative default.                                                                     |
| `polish/cold-load-no-snap.spec.ts`                  | All three  | Preserve browser integration; conservative default.                                                                     |
| `polish/first-paint-mode-surface.spec.ts`           | All three  | Preserve browser integration; conservative default.                                                                     |
| `polish/first-paint-progress.spec.ts`               | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/a11y.spec.ts`                          | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/core-flow-spine.spec.ts`               | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/download-smoke.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/highlights-export.spec.ts`             | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/import-preview.spec.ts`                | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/reader-improvements-roundtrip.spec.ts` | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/round-trip.spec.ts`                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/v21-core-flow-spine.spec.ts`           | All three  | Preserve browser integration; conservative default.                                                                     |
| `portability/zip-slip-regression.spec.ts`           | All three  | Preserve browser integration; conservative default.                                                                     |
| `progress.spec.ts`                                  | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/browser-refusal.spec.ts`                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/read-aloud-band.spec.ts`                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/read-aloud-completion.spec.ts`           | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/read-aloud-failure.spec.ts`              | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/read-aloud-seek.spec.ts`                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/read-aloud-tuning.spec.ts`               | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/read-aloud.spec.ts`                      | All three  | Preserve browser integration; conservative default.                                                                     |
| `readaloud/spoken-follow.spec.ts`                   | All three  | Preserve browser integration; conservative default.                                                                     |
| `reduced-motion.spec.ts`                            | All three  | Preserve browser integration; conservative default.                                                                     |
| `reflow.spec.ts`                                    | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/color.spec.ts`                        | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/curate.spec.ts`                       | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/empty-states.spec.ts`                 | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/highlight-tags.spec.ts`               | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/jump-bidirectional.spec.ts`           | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/listing.spec.ts`                      | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/route-entry.spec.ts`                  | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/scope.spec.ts`                        | All three  | Preserve browser integration; conservative default.                                                                     |
| `review-panel/tri-state.spec.ts`                    | Chromium   | Seeded anchor-status badges, filtering, and disabled controls; selection, focus, and navigation are covered separately. |
| `scrim-dismiss.spec.ts`                             | All three  | Preserve browser integration; conservative default.                                                                     |
| `section-announce.spec.ts`                          | All three  | Preserve browser integration; conservative default.                                                                     |
| `toc/restoration-cue.spec.ts`                       | All three  | Preserve browser integration; conservative default.                                                                     |
| `toc/toc-geometry.spec.ts`                          | All three  | Preserve browser integration; conservative default.                                                                     |
| `toc/toc-navigation.spec.ts`                        | All three  | Preserve browser integration; conservative default.                                                                     |
| `touch-targets.spec.ts`                             | All three  | Preserve browser integration; conservative default.                                                                     |
| `typography-live-apply.spec.ts`                     | All three  | Preserve browser integration; conservative default.                                                                     |
