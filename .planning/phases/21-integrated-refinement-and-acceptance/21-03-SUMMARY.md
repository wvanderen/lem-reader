---
phase: 21-integrated-refinement-and-acceptance
plan: 03
subsystem: ui
tags: [inline-svg, css-tokens, playwright, e2e, a11y, review-panel, polish]

# Dependency graph
requires:
  - phase: 10-review-panel
    provides: ReviewView row anatomy (whole-row jump button, Go-to-highlight aria template, ambiguous/orphan disabled rules), review-panel e2e harness discipline
  - phase: 13-polish
    provides: inline-SVG icon anatomy contract (TrashIcon/EditIcon), citation-comment discipline (POLISH-07 / D15-03), quiet-chrome rest/hover grammar
provides:
  - "JumpToArticleIcon (D21-06) — module-local north-east open-in-context glyph rendered inside exactly the jump-capable row buttons; decorative (aria-hidden + focusable=false), never in the accessible name"
  - ".review-* token conformance (D21-07): row padding at the shared --space-lg primary register, section h2 at the global 22px/600/1.3 register (RESEARCH A5 resolved as conform), two citation comments for the intentional single-column anatomy + no-@media deviations"
  - "Glyph/conformance e2e cells — glyph presence on confident rows, glyph absence + byte-stable disabled shape on ambiguous/orphan rows, computed-style register proofs (22px heading, 24px padding) on 3 engines"
affects: [21-04 (POLISH-11 audit validates this conformed state + glyph), 21-05/21-06 (ACPT-07 spine + ACPT-08 matrix inherit the review-panel suite as regression net)]

# Tech tracking
tech-stack:
  added: [] # nothing installed — inline SVG + authored CSS tokens only
  patterns:
    - "Decorative inline-SVG affordance inside an existing native button (D21-06): the glyph is non-interactive content, legal inside the button; role/name/state stay byte-stable because the svg is aria-hidden and the aria-label template carries the whole name"
    - "Token conformance over literal grid sharing (D21-07): conform-or-cite per measurement — the enumerated conform candidates get token swaps + register inheritance; legitimate anatomy differences get POLISH-07-shaped citation comments"

key-files:
  created: [] # no new files — glyph is module-local in an existing component
  modified:
    - src/routes/review/ReviewView.tsx
    - src/app.css
    - tests/e2e/review-panel/jump-bidirectional.spec.ts
    - tests/e2e/review-panel/listing.spec.ts

key-decisions:
  - "Glyph placement mechanism (D21-06): a .review-row-foot flex line (date at inline-start, glyph at the inline end via space-between) rendered ONLY when jumpable — every other row keeps the bare date span so orphan-tail/disabled row shapes stay byte-stable; the foot carries color: var(--ink-soft) so the glyph INHERITS its rest state (currentColor), keeping the hover grammar to exactly ONE additive selector"
  - "Ambiguity corpus for the glyph cells: jump-bidirectional's article grows a sentence duplicated verbatim in paragraphs 3 and 9 (the tri-state trigger, resolver-verified at module load) + a ghost-article orphan row; explicit createdAts keep the confident row newest so the 10-06 /^Go to highlight:/.first() loop keeps its target with the corpus grown"
  - "Conformance calls landed exactly as the UI-SPEC §3 ledger prescribes: padding md→lg CONFORM, h2 override DELETED (22px register inherited — .continue-reading-strip precedent), single-column + no-@media CITED (2 comments), .review-select 16px D15-03 comment untouched"

patterns-established:
  - "Visible-affordance glyph anatomy: clone the 20×20 viewBox-24 currentColor-stroke icon anatomy, hook it with one class, rest via inherited token color, accent on container :hover — tokens only, zero motion (the .library-row-edit grammar applied to a non-button surface)"

requirements-completed: [POLISH-10]

# Metrics
duration: 14min
completed: 2026-09-01
status: complete
---

# Phase 21 Plan 03: Highlights Cohesion Summary

**Quiet north-east jump glyph on exactly the confident Highlights rows (decorative, LibraryRow anatomy clone) plus D21-07 token conformance — row padding at the shared lg register, section h2 at the global 22px register, conform-or-cite complete — proven by glyph/computed-style e2e cells green on chromium/firefox/webkit**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-01T13:44:09Z
- **Completed:** 2026-09-01T13:58:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Every jump-capable (confident) Highlights row now shows a visible open-in-reader glyph at the date line's inline end, so the whole-row jump's destination is understandable at a glance (D21-06) — while the row's accessible name (`Go to highlight: …` template), role, and disabled state are byte-stable (git-diff-verified: zero changes to the aria-label construction or disabled logic lines).
- The glyph never appears on orphan-tail rows or disabled/unresolved rows — the `foot` wrapper renders only when `jumpable`; all other rows keep the bare date span, so the orphan-tail shape is unchanged.
- `.review-*` measurements now derive from the shared tokens (D21-07): `.review-row` padding conforms to `var(--space-lg)` (the `.library-row`/`.book-row` primary row register) and `.review-section h2` drops its 20px override to inherit the global 22px/600/1.3 register (resolves RESEARCH A5 as conform, not cite).
- Every intentional deviation carries a citation comment in the POLISH-07 shape: single-column `.review-section-list` anatomy vs Library's responsive grid, and the absence of `@media` re-grid rules (1100px cap + `main#main` insets carry narrow widths). `.review-select`'s D15-03 comment stays untouched.
- The hover grammar is exactly one additive tokens-only selector (`.review-row:hover .review-jump-glyph { color: var(--accent) }`) — the glyph inherits `--ink-soft` at rest and takes the accent on row hover, matching the `.tags-trigger`/`.library-row-edit` quiet-chrome discipline; the review block still declares zero transition/animation properties (reduced-motion spec re-run green).

## Task Commits

Each task was committed atomically:

1. **Task 1: Visible row affordance glyph + .review-* token conformance** — `642cf1e` (feat)
2. **Task 2: Review-panel e2e extension — glyph visibility + conformance cells** — `59cdbca` (test)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `src/routes/review/ReviewView.tsx` — `JumpToArticleIcon` module-local glyph component (20×20, viewBox 0 0 24 24, `fill="none"`, `stroke="currentColor"`, strokeWidth 1.75, round caps/joins, `aria-hidden` + `focusable="false"`, LibraryRow-precedent doc comment); `foot` conditional render inside the confident row button
- `src/app.css` — `.review-row` padding `--space-lg`; `.review-section h2` override deleted; 2 D21-07 citation comments; `.review-row-foot` layout rule (ink-soft rest inheritance); `.review-row:hover .review-jump-glyph` accent hover selector
- `tests/e2e/review-panel/jump-bidirectional.spec.ts` — corpus grows an ambiguous row (duplicated-sentence trigger, SHIPPED-resolver-verified at module load) + ghost orphan row with explicit createdAts; new D21-06 glyph visibility cell (presence/template-name on confident; absence + disabled shape on ambiguous/orphan)
- `tests/e2e/review-panel/listing.spec.ts` — new D21-07 conformance describe: computed-style proofs of the 22px/600/1.3 section-heading register and the 24px lg row padding (sub-pixel tolerance)

## Decisions Made
- **Glyph placement via a foot line, not inline-after-date-text:** the plan places the glyph "at the row foot, inline-end of the date line" — a `space-between` flex foot (date inline-start, glyph inline-end) is the mechanism that puts it at the line's inline END rather than mid-row next to the date text, giving every confident row the same scannable corner. The foot renders only when `jumpable`, so no other row shape changes. The foot rule carries `color: var(--ink-soft)` so the glyph *inherits* its rest color through `currentColor` (the row itself sets `--ink`), keeping the plan's "one additive hover selector" budget intact.
- **Glyph corpus via paragraph-appended duplicated sentence:** the glyph-absence cells need ambiguous + orphan rows in jump-bidirectional (the acceptance criteria name that file); the sentence is appended to paragraphs 3 and 9 — both far from the ~60% confident-anchor zone — with a module-load resolver guard plus a distinctness guard (`ANCHOR.quote.exact !== AMBIG_SENTENCE`), mirroring the tri-state corpus discipline without touching tri-state.spec.ts.
- **Computed-style conformance assertions** use `toBeCloseTo(x, 1)` (±0.05px — sub-pixel only) and read logical padding via `getPropertyValue("padding-inline-start")` for cross-engine safety.

## Deviations from Plan

None - plan executed exactly as written.

(Implementation-shape notes — the foot-line mechanism and the corpus growth — are documented under Decisions Made; both are direct realizations of the plan's specified placement and assertions, not fixes to broken/missing/blocking work.)

## Issues Encountered
None — unit gate (20/20), the full review-panel suite (99/99 × chromium/firefox/webkit), and the collateral edge specs (reduced-motion + forced-colors, 69/69) were all green on the first invocation; `tsc --noEmit` and `eslint` clean on every changed file.

## Verification Evidence

- Task 1 gate: `tests/unit/review-filter.test.ts` 20 passed; `listing.spec.ts` + `tri-state.spec.ts` 27/27 green (3 engines).
- Task 2 gate: full `tests/e2e/review-panel` directory **99 passed / 0 failed** on chromium, firefox, and webkit — includes the 2 new cells (glyph visibility, token conformance), all existing jump/tri-state/listing/curate/empty-states/route-entry assertions, and the untouched tri-state/curate regression net.
- Collateral: `reduced-motion.spec.ts` + `forced-colors.spec.ts` (both carry review-block cells) **69/69 green** × 3 engines.
- Acceptance greps: `padding: var(--space-lg)` present; `grep -A3 '\.review-section h2'` shows no font-size; `grep -c 'D21-07' src/app.css` = 4 (≥2); hover selector references `var(--accent)`; review block transition/animation count = 0; aria-label/disabled-logic lines byte-stable in the git diff; `git status` shows only the two planned spec files changed (tri-state/curate untouched).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POLISH-10 closed with cross-engine proof: token-conformant Highlights with a visible, decorative, anatomy-consistent jump affordance on exactly the jump-capable rows.
- Ready for 21-04 (POLISH-11 impeccable audit) — the audit validates this corrected state (glyph + conformance included, per D21-09 ordering).
- The honest full-suite gate for the phase (npm run test + lint) remains 21-06's concern; this plan's contribution is green as recorded above.

## Self-Check: PASSED

- Key files exist on disk: src/routes/review/ReviewView.tsx, src/app.css, tests/e2e/review-panel/jump-bidirectional.spec.ts, tests/e2e/review-panel/listing.spec.ts (all 4 verified via git diff --name-only against the two task commits).
- Commits exist in git log: 642cf1e (feat), 59cdbca (test).
- Plan-level verification re-run: review-panel 99/99 + collateral 69/69 on 3 engines, unit 20/20, tsc/eslint clean.

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-01*
