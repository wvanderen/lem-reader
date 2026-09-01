---
phase: 21-integrated-refinement-and-acceptance
plan: 04
subsystem: ui
tags: [impeccable-audit, wcag-contrast, css-tokens, a11y, placeholder, audit-findings, deferred-items]

# Dependency graph
requires:
  - phase: 21-integrated-refinement-and-acceptance (21-01)
    provides: the truthful [40–64] measure range + legacy clamp the audit validates
  - phase: 21-integrated-refinement-and-acceptance (21-02)
    provides: the CSS-anchored tag popover the audit validates
  - phase: 21-integrated-refinement-and-acceptance (21-03)
    provides: the Highlights jump glyph + .review-* token conformance the audit validates
provides:
  - "21-AUDIT-FINDINGS.md — the durable POLISH-11 report: Anti-Patterns verdict, 5 dimension scores (17/20), P0–P3 findings table with per-finding remediation status, remediation gate + record"
  - "Zero open blocker/major rows: the one P1 (placeholder AA contrast) fixed in-phase via a color-only ::placeholder token rule"
  - "deferred-items.md — the phase minors ledger (1×P2 hairline 1.4.11 + 3×P3 token/chunk nits) per D21-10"
  - "Programmatic WCAG contrast proof: 16 token pairs × 3 themes, plus the placeholder-rendering measurement method"
affects: [21-05/21-06 (ACPT-07 spine + ACPT-08 matrix run over the audited/remediated state; 21-VERIFICATION.md references 21-AUDIT-FINDINGS.md per UI-SPEC §4), future token passes (deferred F-2/F-3/F-4)]

# Tech tracking
tech-stack:
  added: [] # zero packages — agent-skill methodology + authored CSS + node scripts only
  patterns:
    - "Contrast audits compute WCAG ratios from token values per theme (node script over :root/[data-theme]) rather than eyeballing — deterministic, theme-complete, re-runnable"
    - "Audit remediation discipline (D21-10/Pitfall 6): severity ladder P0/P1→fix in-phase, P2/P3→ledger; remediation diffs must be style-only and prove it via the raw diff + gate suites"

key-files:
  created:
    - .planning/phases/21-integrated-refinement-and-acceptance/21-AUDIT-FINDINGS.md
    - .planning/phases/21-integrated-refinement-and-acceptance/deferred-items.md
  modified:
    - src/app.css

key-decisions:
  - "Audit executed as the impeccable skill directs for an established product (identity-preservation wins): the warm-paper surface was examined against the cream-band tell and cleared on D-07 committed-identity grounds (booklike reader, product register) — documented in the verdict, not silently skipped"
  - "F-1 (placeholder 3.66:1 sepia / 3.74:1 light vs 4.5:1 AA) classified P1: the LibrarySearch placeholder is the sole VISIBLE label; remediation is one additive color-only rule (::placeholder → --ink-soft at 7.02/7.26/8.06:1) — token-only, forced-colors GrayText mapping unaffected"
  - "F-2 (hairline 1.27–1.43:1 vs 3:1 WCAG 1.4.11) classified P2 not P1: load-bearing boundaries all pass ≥3:1 (focus ~8:1, accent/destructive 5.5–7.7:1), forced-colors restores CanvasText, and token VALUES are byte-stable this phase per UI-SPEC §6 — darkening --hairline is out of scope, so an honest minor with mitigations + recommendation"
  - "Dimension scores reflect audit-time state (Accessibility 3/4 pre-remediation; 17/20 Good) — the report records the state it found, not the state after its own fix"

patterns-established:
  - "The audit's contrast script is the durable instrument for any future token evolution (theme-complete, deterministic)"
  - "deferred-items.md entries carry severity + location + one-line recommendation + in-place mitigations (the Phase 20 ledger format)"

requirements-completed: [POLISH-11]

# Metrics
duration: 15min
completed: 2026-09-01
status: complete
---

# Phase 21 Plan 04: Impeccable Audit Summary

**Five-dimension impeccable audit over every corrected surface (17/20, zero AI tells, 16/16 token-contrast pairs × 3 themes proven) with its single P1 — placeholder text at 3.66:1 AA failure — fixed in-phase by a color-only ::placeholder token rule, and 4 minors ledgered with severity**

## Performance

- **Duration:** 15 min (plus suite runtime)
- **Started:** 2026-09-01T14:00:44Z
- **Completed:** 2026-09-01T14:16:30Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- The impeccable skill's audit methodology ran over every D21-08 surface — Library (views/filters/Add dialog), Highlights, Reader (scrolling + paginated, TOC, annotations chrome), Settings/dialogs, error/refusal states — on the corrected state including the three Phase 21 corrections themselves (D21-09 ordering honored: depends_on 21-01/02/03).
- The Anti-Patterns verdict leads the report: no AI tells (zero gradients, zero box-shadow, no eyebrows, semantic z-index ladder, radii 4/8px); the warm-paper surface was explicitly examined against the cream-band tell and cleared on committed-identity grounds (D-07, booklike reader, product register).
- Measurable a11y: programmatic WCAG contrast over 16 token pairs × 3 themes — all PASS (meta 6.4–8.1:1, links 6.2–8.3:1, destructive 5.5–6.8:1, marks 6.9–14.3:1) — which is exactly what surfaced the one genuine AA gap axe cannot see: UA-default placeholder rendering at 3.66:1 sepia / 3.74:1 light, acute on the search field whose placeholder is its only visible label.
- Remediation (D21-10): the P1 fixed in-phase with one additive color-only rule (`::placeholder { color: var(--ink-soft); opacity: 1 }`) — raw-diff-proven to touch no role/semantics/motion; 4 minors (P2 hairline 1.4.11 + P3 font-shorthand drift + P3 rgba backdrop literals + P3 782 kB single chunk) ledgered in deferred-items.md with severity, location, recommendation, and in-place mitigations.
- A11y floor proven intact post-remediation: unit 1605/0/13; a11y + forced-colors + reduced-motion specs 114/114 on chromium/firefox/webkit; check-no-danger clean; no assertion removed (strengthen-only).

## Task Commits

Each task was committed atomically:

1. **Task 1: Execute the five-dimension audit and author the findings report** — `d5c9803` (docs)
2. **Task 2: Remediate blocker/major findings; log minors; prove suites hold** — `a4f2bf9` (fix: app.css remediation + findings status update + deferred-items ledger)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `.planning/phases/21-integrated-refinement-and-acceptance/21-AUDIT-FINDINGS.md` (NEW) — the POLISH-11 report: verdict opening, 5 dimension sections + scores, P0–P3 severity legend citing D21-10, findings table (location/severity/standard/recommendation/status), remediation gate + record, recommended future actions
- `.planning/phases/21-integrated-refinement-and-acceptance/deferred-items.md` (NEW) — the minors ledger: F-2 (P2), F-3/F-4/F-5 (P3)
- `src/app.css` — the F-1 remediation: citation-commented `::placeholder` rule (color + opacity only) after the global :focus-visible baseline

## Decisions Made
- Audit mechanics per plan discretion: the impeccable skill's audit reference is code-level, so the audit combined full-CSS reading + component-semantics greps + programmatic contrast computation + a production-build measurement, citing the phase's fresh green 3-engine e2e runs (21-01/02/03) as the live-browser evidence for the corrected geometries — no duplicate live probing of already-proven surfaces.
- Severity honesty over fix-impulse: F-2 (hairline 1.4.11) could not be remediated in-phase without changing frozen token values (UI-SPEC §6), and its load-bearing boundaries all pass — classified P2 with the full reasoning trail in the findings doc rather than performing an out-of-contract token change or silently dropping the finding.
- The Accessibility dimension was scored 3/4 at audit time (the placeholder AA gap was then present) — the report records the found state; the remediation record documents the in-phase closure.
- Known-debt context inherited, not re-opened: the Phase 15 zipSlip lint debt (D21-15 fixes it later this phase) and the Phase 20 WebKit Blob boundary (D21-11) are referenced as inherited ledger context.

## Deviations from Plan

None - plan executed exactly as written.

(One process note, not a deviation: the impeccable skill's setup reported a newer skill version available (installed v3.8.0, latest v4.1.2); per the skill's own rule this never blocks the current task. The plan mandates the installed skill's methodology, which is what ran.)

## Issues Encountered
None — both task gates (unit + the three a11y/edge specs + check-no-danger) were green on the first invocation; the remediation diff compiled clean and changed no computed geometry.

## Verification Evidence

- Task 1 gate: findings doc non-empty (83 lines ≥ 60 min), `Anti-Patterns` ×2, `D21-10` ×2, five dimension headings, severity legend, remediation-gate text; all D21-08 surfaces named; `npm run test:unit -- --run` exit 0 (1605 passed / 0 failed / 13 documented skips).
- Task 2 gate: `npm run test:unit -- --run` exit 0 (1605/0/13); `npx playwright test a11y.spec.ts forced-colors.spec.ts reduced-motion.spec.ts` — **114 passed / 0 failed** across chromium/firefox/webkit; `node scripts/check-no-danger.js` exit 0; remediation raw diff = exactly `color: var(--ink-soft); opacity: 1` under `::placeholder` (no roles/semantics/motion).
- Findings doc shows zero open P0/P1 rows (F-1 fixed in-phase; counts line records it).
- Contrast scripts (token pairs + placeholder measurement) preserved in the session record; method documented in the findings doc for re-runs.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POLISH-11 closed: the audit validated the corrected state across all surfaces, its one blocker/major finding is fixed in-phase under the hard a11y constraint, and the milestone's minors are honestly ledgered.
- **Pending verification pointer:** `21-VERIFICATION.md` — authored at verify-work time — will reference `21-AUDIT-FINDINGS.md` (UI-SPEC §4); that reference lands with the phase verification ledger, not in this plan.
- Ready for 21-05/21-06 (ACPT-07 spine + ACPT-08 matrix + D21-15 lint closure + the honest full-suite gate) over this audited/remediated state.

## Self-Check: PASSED

- Key files exist on disk: 21-AUDIT-FINDINGS.md (85 lines), deferred-items.md (47 lines), src/app.css modified.
- Commits exist in git log: d5c9803 (docs), a4f2bf9 (fix).
- Plan-level verification re-run: unit 1605/0/13 + a11y/forced-colors/reduced-motion 114/114 × 3 engines + check-no-danger exit 0 (all post-remediation, this session).

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-01*
