---
phase: 19-cross-block-highlights
plan: 02
subsystem: annotations
tags: [excerpts, markdown-export, escaping, structure-injection-guard, pure-helpers, vitest, react]

# Dependency graph
requires:
  - phase: 19-cross-block-highlights
    provides: 19-01 endpoint-composed span capture — quote.exact now legitimately contains BLOCK_SEPARATOR newlines this plan's derivations handle
  - phase: 05-annotations
    provides: the four quote.exact excerpt surfaces (review row + aria-labels, drawer, popover, delete-confirm) and their per-surface caps
  - phase: 09-export-import
    provides: markdown.ts blockLines/escapeMarkdownLine/markerFor export contract (PORT-03)
provides:
  - firstFragmentExcerpt(exact, maxChars) — the ONE shared pure first-fragment + calm-ellipsis derivation (D19-10), exported from src/annotations/excerpt.ts
  - Adoption at every quote.exact surface: ReviewView visible/aria/confirm-prop, AnnotationsDrawer visible/aria, NotePopover both context blocks (per-surface caps unchanged)
  - Multi-line Markdown export (D19-12): blockLines splits exact on BLOCK_SEPARATOR, escapeMarkdownLine PER LINE (V5 structure-injection guard / T-19-04), marker on first line only, empty fragments preserved, never truncated
  - tests/unit/annotations/excerpt.test.ts (7 honesty cells) + 5 new markdown multi-line cells
affects: [19-03 rendering, 19-04 paginated twin, 19-05 eligibility matrix + phase gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Truncate-then-conditional-ellipsis: the length cap and the continuation each append the SAME single U+2026, collapsing to exactly one in the over-cap continuation case — ellipsis decisions are structural (booleans), never content-sniffing"
    - "Single-derivation-site prop feeding: destructive-confirm dialogs consume an excerpt derived ONCE upstream (ReviewView CONFIRM_EXCERPT_MAX_CHARS) — the inner defensive cap is provably idempotent on helper output"
    - "Per-line escaping at format boundaries: any stored text crossing into a line-oriented format (Markdown) is escaped per emitted line, not per entry"

key-files:
  created:
    - src/annotations/excerpt.ts
    - tests/unit/annotations/excerpt.test.ts
  modified:
    - src/routes/review/ReviewView.tsx
    - src/reader/annotations/AnnotationsDrawer.tsx
    - src/reader/annotations/NotePopover.tsx
    - src/portability/markdown.ts
    - tests/unit/portability/markdown.test.ts

key-decisions:
  - "NotePopover keeps ONE cap (200) for BOTH context blocks: the dialog's accessible description IS the excerpt block (aria-describedby → the same <p id>), and the shipped file has no 60-cap derivation — the plan task text's 'accessible-description (60)' contradicted the plan's own 'caps stay EXACTLY as shipped' rule and the UI-SPEC caps table (popover 200); the locked rule won"
  - "DeleteHighlightConfirm left byte-unchanged (plan: 'verify only'): its inner truncate(excerpt, 200) is idempotent on helper output in every case (over-cap fragments yield the identical 200-visible + single-ellipsis composition)"
  - "ANNO-10/ANNO-11 stay open (requirements-completed: []) — this plan ships the export leg of durability and the surface layer of atomic management; the end-to-end proving plans are 19-04 (mode/repagination durability) and 19-05 (matrix + phase gate), which also claim these ids (04-02 PAGE-01 split precedent)"
  - "Ellipsis decisions in firstFragmentExcerpt are structural booleans (truncated / continues), never endsWith-content sniffing — a fragment naturally ending in U+2026 cannot suppress or double the honest continuation ellipsis"

patterns-established:
  - "Every surface that renders stored quote text derives through ONE shared pure helper with per-surface cap parameters — excerpt derivations never fork per surface again"
  - "Export consumes the FULL raw exact (never the excerpt helper) — truncation is a review-surface behavior only; the two derivations are intentionally different functions of the same input"

requirements-completed: []  # ANNO-10/ANNO-11 legs ship here; requirements close at 19-04/19-05 (split precedent, see key-decisions)

# Metrics
duration: 10 min
completed: 2026-08-30
status: complete
---

# Phase 19 Plan 02: Excerpt + Export Derivation Layer Summary

**First-fragment excerpt helper (D19-10) adopted at all four quote.exact surfaces with unchanged caps, plus multi-line Markdown export (D19-12) that keeps block breaks inside ONE blockquote entry with per-line structure-injection escaping**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-30T23:23:35Z
- **Completed:** 2026-08-30T23:33:52Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified; DeleteHighlightConfirm verified-only per plan)

## Accomplishments
- `src/annotations/excerpt.ts`: ONE pure `firstFragmentExcerpt(exact, maxChars)` (the overlap.ts module discipline — no React/DOM) implementing the truncate-then-conditional-ellipsis composition with all three honesty cases distinguishable: complete single fragment never gets an ellipsis; the cap appends exactly one U+2026; genuine continuation appends the ellipsis after the cap, collapsing to ONE in the over-cap continuation case
- Helper adopted at every `quote.exact` surface (19-UI-SPEC Component Inventory): ReviewView `.review-quote` (120) + Edit-note/Remove/jump aria-labels (60) + the DeleteHighlightConfirm excerpt prop derived once at 200; AnnotationsDrawer `.drawer-entry-excerpt` (120) + jump aria (60); NotePopover's confirm-path and edit-path context blocks (200). Local `truncate` helpers survive only for note previews; ReviewRow anatomy byte-stable — no new elements, classes, or badges (D19-11)
- `markdown.ts` blockLines (D19-12): quote.exact splits on BLOCK_SEPARATOR into `> `-prefixed continuation lines with `escapeMarkdownLine` applied PER LINE (T-19-04 / V5 guard — a continuation beginning `#`, `-`, or `1974.` cannot forge structure outside the blockquote); markerFor prefixes only line 1; empty fragments keep their own continuation line (block-break count round-trips verbatim); export never truncates; citation + Note lines keep their single-line shapes and positions
- 7 excerpt honesty unit cells + 5 markdown multi-line cells (two-block one-entry marker placement, hostile continuation escaping, code-block verbatim full round-trip, empty-fragment preservation, citation/note ordering); all 23 existing markdown byte-for-byte cells unchanged — single-line exports are byte-identical (backward compatibility proven, not assumed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure firstFragmentExcerpt helper + unit cells** - `6de6ad7` (feat)
2. **Task 2: Adopt the helper at every quote.exact surface** - `19ac91a` (feat)
3. **Task 3: Multi-line Markdown export (D19-12)** - `f38990e` (feat)

## Files Created/Modified
- `src/annotations/excerpt.ts` - NEW pure derivation (D19-10 + honesty rule); imports BLOCK_SEPARATOR from the canonical normalizeText source
- `tests/unit/annotations/excerpt.test.ts` - NEW: 7 honesty cells incl. inclusive cap boundary, empty-first-fragment continuation, schema-impossible empty exact
- `src/routes/review/ReviewView.tsx` - excerpt/ariaExcerpt/confirm-prop derivations via the helper; CONFIRM_EXCERPT_MAX_CHARS=200 added; truncate scoped to note previews
- `src/reader/annotations/AnnotationsDrawer.tsx` - visible + aria derivations via the helper (caps unchanged); truncate scoped to note previews
- `src/reader/annotations/NotePopover.tsx` - both context blocks derive via the helper at the shipped 200 cap; unused local truncate removed
- `src/portability/markdown.ts` - blockLines multi-line contract (split + per-line escape + first-line marker); BLOCK_SEPARATOR import
- `tests/unit/portability/markdown.test.ts` - 5 new D19-12 cells; header contract updated

## Decisions Made
- **NotePopover single cap (200) for both blocks** — the plan task text said "accessible-description (60)", but the shipped dialog's accessible description IS the excerpt block (`aria-describedby` → the same `<p id="highlight-popover-excerpt">`) and no 60-cap derivation exists in the file; the plan's controlling rules ("Per-surface caps stay EXACTLY as shipped"; UI-SPEC table "popover 200") won over the parenthetical. Touching nothing was the honest reading.
- **DeleteHighlightConfirm byte-unchanged** — plan said "verify only"; verified via consumer analysis (ReviewView is the sole consumer) and an idempotency proof of its inner cap over helper output (all three helper output shapes pass through or compose to the identical 200-visible + single-ellipsis text).
- **Ellipsis logic is structural, not content-sniffing** — `truncated`/`continues` booleans instead of `endsWith("…")`, so reader text naturally ending in U+2026 can neither suppress nor duplicate the honest continuation ellipsis.
- **requirements-completed is []** — ANNO-10's export leg and ANNO-11's surface layer ship here, but the requirements' end-to-end proofs live in 19-04/19-05 (which also claim the ids); mirrors the project's repeated 04-02 PAGE-01 split precedent (most recently 19-01's ANNO-12 deferral to 19-05).

## Deviations from Plan

None - plan executed exactly as written.

(The NotePopover cap clarification and DeleteHighlightConfirm verification are documented under Decisions Made; both followed the plan's own locked rules rather than deviating from them.)

## Issues Encountered
None - no stale dev servers this run (checked :5173 before Playwright per the Phase 18 webkit-starvation lesson); all gates green on first invocation.

## User Setup Required
None - no external service configuration required.

## Threat Surface

| Threat | Disposition |
|--------|-------------|
| T-19-04 (Tampering: multi-line exact forging export structure) | MITIGATED — escapeMarkdownLine PER LINE, locked by unit cell (b): no unescaped `#`/list-marker-initial exported line can exist |
| T-19-05 (Tampering: excerpt rendering) | ACCEPTED as planned — React text children only at every touched surface; no new HTML parsing; react/no-danger discipline untouched |
| T-19-06 (Info disclosure: excerpts in export) | ACCEPTED as planned — export remains reader-initiated over their own library; no new fields |

No security-relevant surface beyond the plan's threat model was introduced.

## Next Phase Readiness
- 19-03 (rendering + first-slice id) can consume the shipped excerpt surfaces unchanged; its InlineRenderer per-slice aria-labels correctly keep slice-local text (untouched here per UI-SPEC)
- 19-05's eligibility matrix will exercise cross-block excerpts + export end-to-end in real browsers (the ANNO-10/11 closing evidence)
- No blockers; zero packages, zero schema changes, zero route changes

## Self-Check: PASSED

All 7 key-files exist on disk; all 3 task commits (6de6ad7, 19ac91a, f38990e) found in git log. Plan-level verification re-confirmed on the final state: unit 35/35 (excerpt + markdown), full unit suite 1393 passed / 0 failed / 13 documented skips, gated e2e 36/36 and the full annotations directory 186/186 on chromium/firefox/webkit, grep gates pass (helper adopted at all sites; only code-path `quote.exact` consumer outside the helper is markdown.ts's full-span export split, by design).

---
*Phase: 19-cross-block-highlights*
*Completed: 2026-08-30*
