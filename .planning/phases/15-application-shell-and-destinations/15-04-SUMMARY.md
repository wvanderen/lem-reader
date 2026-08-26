---
phase: 15-application-shell-and-destinations
plan: "04"
subsystem: ui
tags: [css, design-tokens, a11y, touch-targets, responsive, playwright, e2e, 3-engine-matrix, honest-gate]

# Dependency graph
requires:
  - phase: 15-application-shell-and-destinations (Plan 01)
    provides: canonical #/highlights route + alias (D15-06/D15-07)
  - phase: 15-application-shell-and-destinations (Plan 02)
    provides: shell nav + brand link + control gating + ≤639px collapse (D15-01..D15-18)
  - phase: 15-application-shell-and-destinations (Plan 03)
    provides: librarySession return-context restore (D15-11..14)
provides:
  - POLISH-07 closed: the four surfaces audited against the six existing invariants with the audit table recorded; the one drift fixed on-token; intentional differences citation-commented
  - Strengthened 320×640 shell-nav geometry assertions (header-controls fit + no group overlap) proven on chromium/firefox/webkit
  - Phase-exit proof: 3-engine matrix 195/195 + honest full-suite gate exit 0 (2529 passed / 0 failed / 23 documented skips)
  - 5 webkit de-flake budgets (the 09-07 precedent) + jump-bidirectional strengthen-only rewrite for the D15-15-gated ModeToggle
affects: [Phase 16+ surfaces (token contract now cited in app.css), POLISH-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Token-audit disposition table (surface × invariant → keep/fix/intentional) as the POLISH-07 artifact — decided drift-vs-intentional BEFORE editing; every fix is a var() alignment"
    - "Programmatic token-coherence probe (computed main#main padding, family centering skew, computed focus ring) as e2e evidence for the visual-audit sampling contract"
    - "Full-suite webkit starvation triage: identical-cell failure across engines = regression; webkit-only + isolation-green = harness/environment; check the reused dev server's age before touching specs (reuseExistingServer)"

key-files:
  created: []
  modified:
    - src/app.css
    - tests/e2e/chrome/shell-nav.spec.ts
    - tests/e2e/review-panel/jump-bidirectional.spec.ts
    - tests/e2e/library/browse-open.spec.ts
    - tests/e2e/library/reading-views.spec.ts
    - tests/e2e/progress.spec.ts
    - tests/e2e/review-panel/curate.spec.ts
    - tests/e2e/review-panel/listing.spec.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "POLISH-07's one touch-target drift: .app-wordmark lacked min-height var(--touch) (UI-SPEC §Spacing names the brand link explicitly) — fixed by mirroring the .shell-nav a anatomy; at ≤639px the clip treatment keeps the row untouched (position:absolute)"
  - "The relief ladder was NOT applied in this plan: the 15-02 commit had already stepped .app-header padding-inline to --space-xs after measuring the 14.2px overlap; 15-04 measured zero overflow on all three engines, so nothing further moved"
  - "jump-bidirectional hydration proof moved from a chrome label copy (ModeToggle aria-label on #/highlights — impossible since D15-15 reader gating) to the LIVE renderer during the loop (main#main without paginated-main) — strictly stronger coverage, D15-15-cited"
  - "WebKit full-suite starvations root-caused to a 4-hour-old reused Vite dev server (environment), not specs; 5 precedent-backed setTimeout(60_000) budgets land as belt-and-suspenders, and the permanent gate record ran against a fresh server"

patterns-established:
  - "Strengthen-only geometry pins for flex rows: scrollWidth cannot see a deficit that manifests as sibling-group overlap — assert the cluster fits the row's content box AND the groups never overlap (the 15-02 silent-overlap lesson, now e2e-locked)"

requirements-completed: [POLISH-07]

# Metrics
duration: 61 min
completed: 2026-08-26
status: complete
---

# Phase 15 Plan 04: POLISH-07 Token Audit + Phase Gate Summary

**The four-surface token audit found exactly one drift (the brand link's missing 44px touch target), citation-commented the three intentional differences, strengthened the 320×640 geometry pins across all three engines, and closed the phase with an honest full-suite gate of 2529 passed / 0 failed / exit 0 — after triaging a stale dev server masquerading as six webkit regressions.**

## Performance

- **Duration:** 61 min (17:18–18:19 UTC)
- **Tasks:** 3
- **Files:** 9 (1 CSS + 7 specs + REQUIREMENTS.md)

## Task Commits

1. **Task 1: POLISH-07 token audit + drift fixes** — `479f695` (fix)
2. **Task 2: 320×640 geometry hardening (no overflow measured — ladder not applied)** — `2fae80a` (fix)
3. **Task 3: 3-engine phase matrix + honest full-suite gate green** — `8b44189` (test)

**Plan metadata:** committed after this SUMMARY (docs)

## POLISH-07 Audit Table (D15-03 — the plan's required artifact)

Disposition decided per candidate BEFORE editing; every fix is a token alignment (var() reference). Surfaces: **Library** (#/ views), **Highlights** (#/highlights), **Add (as-is)** (the in-page IngestControl inside `.library-section-add`), **Reader** (#/article).

| Invariant | Library | Highlights | Add (as-is) | Reader |
|---|---|---|---|---|
| **1. Content inset** — `main#main` owns `padding-inline: var(--space-md); padding-block: var(--space-3xl)`; no per-view wrapper insets | KEEP — LibraryView renders main#main; children inset-free (01-04 unification holds) | KEEP — ReviewView renders main#main; `.review-*` blocks carry no inline padding | KEEP — `.ingest-control` is a card (`padding: var(--space-lg)`), not an inset wrapper; sits inside `.library-section-add` | INTENTIONAL — `main#main.paginated-main` block padding `--space-2xl` (page-height budget; citation already present at app.css L209-213, byte-unchanged) |
| **2. Centered measure family** — `max-width: 1100px; margin-inline: auto` | KEEP — `.library-header`/`.view-switcher`/`.library-search`/`.tag-filter`/`.continue-reading-strip`/`.library-section-add`/`.library-list` all aligned | KEEP — `.review-header`/`.review-filter-row`/`.review-legend`/`.review-section` all aligned | KEEP — inherits `.library-section-add` (1100px, the 13-07 G1 fix) | INTENTIONAL — `.article-body` `max-width: var(--measure)` 64ch (reading surface ≠ chrome measure; **citation added**) |
| **3. Header height** — 48px single row, byte-stable | KEEP | KEEP | KEEP | KEEP — `min-height: 48px` byte-stable; the offset family (hairline `top: 48px`, `calc(100dvh − 48px)`, `headerPx = 48`) intact |
| **4. Touch targets** — every interactive control ≥ `var(--touch)` | KEEP — switcher links/search input/chips/row links/remove/ingest inputs+submit all ≥44px | KEEP — `.review-row`/`.review-row-action`/`.review-select`/chips/BackToLibrary all ≥44px | KEEP (same controls) | **FIX (the one drift)** — `.app-wordmark` lacked the 44px minimum (UI-SPEC §Spacing names the brand link); gained the `.shell-nav a` anatomy. At ≤639px the clipped brand is pointer-invisible by design (Pitfall 9 = keyboard/SR reachability, e2e-proven shell-nav (6)) |
| **5. Focus** — global `:focus-visible` 2px ring inherited, never suppressed | KEEP — zero `outline: 0/none` in app.css (only the L135 prohibition comment); positive re-declarations are regression alarms | KEEP | KEEP | KEEP |
| **6. Spacing** — `--space` scale only, no orphan literals | KEEP — grep proof: **zero** off-token literal paddings/margins/gaps/insets file-wide (only cited load-bearing 48px offsets, −9999px skip-link technique, 2px ring/offset, border widths, 4/8px radii, 2px badge nudge, `calc(50% + 25px)` page-turn centering) | KEEP | KEEP | KEEP |

**Intentional differences (documented, NOT fixed):**
1. `main.paginated-main` block padding `--space-2xl` — citation already present (L209-213); rule byte-unchanged.
2. Reader article measure `--measure: 64ch` — **citation comment added** on `.article-body` (POLISH-07/D15-03).
3. `.review-select` `font-size: 16px` — **citation comment added** (form-control register; POLISH-07/D15-03).

**Out-of-scope observations (documented, no action):** `.status` cards intentionally fill the available measure rather than join the 1100px family (transient status surface with inline variants inside fieldsets/drawers where a cap would be wrong); `.storage-banner`'s own `margin-inline: var(--space-md)` is correct because it mounts OUTSIDE `main#main` (verified in App.tsx render tree) — it aligns with, not doubles, the main inset.

### Token-coherence evidence (the 15-VALIDATION Manual-Only row)

A temporary Playwright probe (deleted before commit — the 15-03 probe-then-delete precedent) measured the four surfaces at 320/768/1280:
- `main#main` computed padding `16px/64px` (md/3xl) on every scrolling surface; Reader paginated shows the cited intentional values (8px block-start ≤639px; 48px ≥640px).
- **Centering skew 0px** for every 1100px-family block on every surface at every width.
- Header `min-height` 48px everywhere; wordmark computed box 44px everywhere post-fix.
- Focus ring on a shell-nav link: `solid 2px rgb(107, 68, 35)` = the `--focus-ring` token.
Visual/feel confirmation remains inherent to the phase-exit human verification; the programmatic geometry above is the recorded evidence.

## Task 2: 320×640 Measurements (recorded — ladder NOT applied)

The sanctioned relief ladder was already at its final step — 15-02 applied `.app-header { padding-inline: var(--space-xs) }` after measuring a 14.2px silent overlap (documented in the ≤639px block comment). 15-04 measured **no wrap, no overflow on any engine**, so nothing further moved (CSS delta: none). Measured at 320×640 in Reader, identical on chromium/firefox/webkit:

- `scrollWidth 320 = clientWidth 320` (no horizontal overflow), `scrollHeight 48 = clientHeight 48` (no wrap); row 49px border-box (48 + 1px hairline).
- `.header-start` right edge 118px; `.header-controls` spans 128→316px inside the 320px row — fits the row's content box with **10px between groups**.
- Brand link keyboard-reachable on all three engines (collapse-safety test (6) green; webkit on the documented focus+Enter degradation).

Strengthened test (5) — strengthen-only, no existing assertion touched: `.header-controls` must fit within the row's content box AND `.header-start` must never overlap `.header-controls` (a flex deficit can no longer hide where scrollWidth cannot see it — the 15-02 silent-overlap lesson locked as e2e).

## Honest Full-Suite Gate (T-15-11 — the permanent record)

| Run | Invocation | Result |
|---|---|---|
| 1 | `npm run test` (piped to tail) | e2e tail green (1227/0/10) but the pipe discarded the exit code + unit summary — not a valid record; re-run required |
| 2 | `npm run test > log; echo $?` | **exit 1** — unit 1302/0/13 green; e2e 1221 passed / 6 failed, ALL webkit, ALL `beforeEach page.goto` "waiting until load" timeouts; the 6 cells pass 41/41 in isolation |
| 3 | same, after de-flake budgets + a FRESH dev server | **exit 0** — see verbatim counts below |

**Run 3 (the permanent record), one invocation, exit 0:**

```
Test Files  92 passed | 2 skipped (94)
     Tests  1302 passed | 13 skipped (1315)      ← unit (vitest --run)
  1227 passed (10.8m)                            ← e2e, 10 skipped, 0 failed
```

Combined: **2529 passed / 0 failed / 23 skipped.** Skip-set accounting: the 13 unit skips are the documented intentional set, byte-stable with 15-03's record; the 10 e2e skips are the documented set (2 SSRF residuals T-7-04/Measure-9, longtask-smoke, 2 non-default harness files). No subset runs, no `--project` filters, no grep cherry-picks at the gate.

## Task 3: Phase Matrix (195/195, 3 engines)

`shell-nav.spec.ts + library-restore.spec.ts + reading-views.spec.ts + the full review-panel suite` across chromium/firefox/webkit → **195 passed / 0 failed** (1.1m). One uniform 3-engine failure surfaced (jump-bidirectional scrolling loop) and was fixed as a deviation below — it was NOT engine drift, which is exactly what the matrix is for.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jump-bidirectional pinned the reader-gated ModeToggle on #/highlights**
- **Found during:** Task 3 (matrix run 1 — uniform failure on chromium AND firefox AND webkit)
- **Issue:** the scrolling-loop test's final assertion read `Reading mode:` button's aria-label on the Highlights surface, but 15-02's D15-15 gated the ModeToggle behind `articleMounted` — the control no longer renders there (a11y snapshot shows shell nav + gear only). The spec was outside 15-02's blast radius, the same missed-pin class as 15-02's two Rule 3 deviations.
- **Fix:** strengthen-only rewrite — `exerciseRowClickLoop(page, expectScrollingRenderer)` now proves preference hydration on the LIVE article surface during the loop (`main#main` never carries `paginated-main`), strictly stronger than the post-hoc label copy; D15-15 citation in the spec comment.
- **Files modified:** tests/e2e/review-panel/jump-bidirectional.spec.ts
- **Verification:** 21/21 across the 3 engines; full matrix 195/195.
- **Committed in:** 8b44189

**2. [Rule 3 - Blocking] webkit beforeEach starvations under full-suite load**
- **Found during:** Task 3 (honest-gate run 2: exit 1, six webkit-only `page.goto` 30s timeouts across browse-open/reading-views/progress/curate/listing)
- **Issue:** under full-suite parallel load, webkit contexts' first module fetch from the single Vite dev server starved — the exact 09-07 section-announce class. Triage: all cells pass 41/41 in isolation → harness/environment, not product. Deeper root cause: `reuseExistingServer: !CI` had every run reusing ONE Vite dev server **3h52m old** (293MB RSS, started mid-15-02/15-03); killing it and re-running against a fresh server produced the green exit-0 gate.
- **Fix:** (a) `test.setTimeout(60_000)` on the five affected describes (the 09-07 precedent shape, citations included) as belt-and-suspenders; (b) environment fix — stale server killed, gate re-run fresh. No assertions changed.
- **Files modified:** tests/e2e/library/browse-open.spec.ts, tests/e2e/library/reading-views.spec.ts, tests/e2e/progress.spec.ts, tests/e2e/review-panel/curate.spec.ts, tests/e2e/review-panel/listing.spec.ts
- **Verification:** gate run 3 exit 0 (see the permanent record above).
- **Committed in:** 8b44189

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocker)
**Impact on plan:** No scope creep — both were direct consequences of this plan's gate doing its job (the matrix caught a spec pinning removed anatomy; the honest gate refused to record a flaky green). The de-flake budgets follow an existing repo precedent; zero production behavior changed beyond the planned token alignment.

## Verification Results

- Task 1: `npx playwright test tests/e2e/reflow.spec.ts tests/e2e/touch-targets.spec.ts --project=chromium` → **16/16 passed**; `rg "min-height: 48px" src/app.css` still matches `.app-header`; phase diff adds no `outline: 0/none`; the three intentional rules byte-unchanged (git diff inspected — only the wordmark alignment + two citation comments).
- Task 2: `npx playwright test tests/e2e/chrome/shell-nav.spec.ts -g "320"` → **6/6 passed** across chromium/firefox/webkit (before AND after the strengthen-only additions); measurements recorded above.
- Task 3: phase matrix **195/195** × 3 engines; `npm run test` **exit 0** (run 3, counts verbatim above); REQUIREMENTS.md POLISH-07 checked + traceability row Complete.
- `npx eslint` on all changed spec files → clean; `npx tsc --noEmit` not applicable (no TS source changed — CSS + specs only; specs type-check via Playwright's loader).

## Issues Encountered

None beyond the two deviations above. The dev-server staleness discovery is recorded as a workflow lesson (check the reused server's age before diagnosing webkit starvation as spec drift).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 15 complete:** all five requirements (NAV-01/02/03/05 + POLISH-07) proven in real browsers across the 3-engine matrix; the honest gate record is the permanent proof.
- Next: `/gsd-verify-work` for Phase 15 UAT, then Phase 16 planning (Add as a destination — ADD-01..04, LIB-09/LIB-10; the token contract now carries explicit intentional-difference citations for future surfaces).
- The strengthened 320×640 pins + the flex-overlap lesson travel forward: Phase 16's Add destination work inherits e2e-locked protection against silent header overlap.

## Self-Check: PASSED

- Commit `479f695` (Task 1, fix — app.css) found in git log ✓
- Commit `2fae80a` (Task 2, fix — shell-nav.spec.ts) found in git log ✓
- Commit `8b44189` (Task 3, test — 7 files) found in git log ✓
- src/app.css contains the wordmark touch fix + both citation comments ✓
- REQUIREMENTS.md shows POLISH-07 checked with Phase 15 Complete ✓
- No file deletions in any task commit; no untracked files left ✓
- STATE/ROADMAP updates follow this file's commit

---
*Phase: 15-application-shell-and-destinations*
*Completed: 2026-08-26*
