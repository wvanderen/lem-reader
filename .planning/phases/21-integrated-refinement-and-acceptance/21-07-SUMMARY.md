---
phase: 21-integrated-refinement-and-acceptance
plan: 07
subsystem: a11y
tags: [webkit, safari, voiceover, focus-management, pagination, page-turn, e2e, playwright]

# Dependency graph
requires:
  - phase: 21-integrated-refinement-and-acceptance
    provides: UAT Test 2 finding + vo-safari-image-page-focus.md root-cause diagnosis (D4-07 handoff unreachable for button-originated WebKit turns)
provides:
  - Self-healing D4-07 focus contract (body counts as content-origin; chevron fallback boundary handoff via the ONE exported focusNewPageTop)
  - WebKit regression lock for button-originated page turns (never-body classification, cascade self-heal, figure-page boundary reset)
affects: [ACPT-08 sign-off, 21-08, verifier/UAT re-run]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies (T-21-07-SC: no installs)
  patterns:
    - "never-body focus contract: control where the engine holds focus, boundary heading where it does not"
    - "rAF-deferred post-turn focus guard colocated with the turn commit (handleChevronTurn)"
    - "figure-run geometry for deterministic figure-only pages in e2e (atomic figure cannot fit post-figure remainder)"

key-files:
  created:
    - tests/e2e/pagination/page-turn-focus-handoff.spec.ts
  modified:
    - src/reader/PageTurnControls.tsx
    - src/reader/PaginatedSurface.tsx

key-decisions:
  - "isFocusInContent treats activeElement===body/documentElement as content-origin so the WebKit focus-loss cascade self-heals"
  - "PaginatedSurface chevrons route through handleChevronTurn: rAF-deferred guard falls back to the exported focusNewPageTop only when focus did not stay on a control (engines that hold focus are byte-unchanged)"
  - "Two-figure run instead of paragraph-tuned single figure for deterministic figure-only pages (probe-verified geometry: the single-figure window is ~2 caption lines wide)"

patterns-established:
  - "Export-for-reuse precedent extended: focusNewPageTop joins isFormField as the second cross-component PageTurnControls export — never forked"
  - "Type-only import + reverse runtime import is the sanctioned non-cycle pattern (PageTurnControls ⇄ PaginatedSurface)"

requirements-completed: []  # ACPT-08 deliberately NOT marked — gated on the pending human VoiceOver+Safari checkpoint (06-04/13-05 instrument-ships-now precedent)

# Metrics
duration: 16min
completed: 2026-09-03
status: human-gate-pending
---

# Phase 21 Plan 07: WebKit Page-Turn Focus Handoff (UAT Test 2 Gap Closure) Summary

**Self-healing D4-07 focus handoff: WebKit button-originated page turns now route through the "Page N begins" boundary heading (never body), locked by a 15-cell three-engine regression spec with recorded RED/GREEN evidence — pending live VoiceOver+Safari sign-off.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-03T01:20:38Z
- **Completed:** 2026-09-03T01:37:06Z (Tasks 1-2; human checkpoint pending)
- **Tasks:** 2 auto tasks complete + 1 human-verify checkpoint pending
- **Files modified:** 3

## Accomplishments
- Closed the unreachable-handoff root cause: chevron clicks (the natural VoiceOver path off an image-only page) now fall back to the boundary-heading handoff whenever Safari's activation dropped DOM focus, and a body-origin keyboard turn self-heals instead of permanently skipping the reset (the cascade).
- Existing behavior byte-preserved where engines hold focus: `page-turn-controls.spec.ts` 15/15 green on chromium/firefox/webkit after the change (additive, not a rewrite).
- New regression lock `page-turn-focus-handoff.spec.ts`: 11 passed + 4 by-design webkit-strict skips across the three engines, including the figure-only-page boundary reset (the VO image-page path) and the post-button keyboard cascade heal.
- RED/GREEN evidence recorded: against the pre-fix tree, all five webkit cells fail with `Expected: "boundary" / Received: "body"` — the exact UAT Test-2 signature.

## Task Commits

Each task was committed atomically:

1. **Task 1: Amend D4-07 — self-healing focus handoff for control-originated turns** - `67d8a81` (fix)
2. **Task 2: WebKit regression lock — button turns never strand focus on body** - `e4a77c1` (test)

**Plan metadata:** (see final docs commit)

## Verification Results

- `npx tsc --noEmit`: clean (run after Task 1 and again after Task 2).
- `npx eslint src/reader/PageTurnControls.tsx src/reader/PaginatedSurface.tsx`: clean.
- `tests/e2e/pagination/page-turn-controls.spec.ts` × 3 engines: **15/15 green** (keyboard bundle, chevron click, content-triggered handoff, form-field bail — proof the change is additive).
- `tests/e2e/pagination/page-turn-focus-handoff.spec.ts` × 3 engines: **11 passed / 4 by-design skips** (webkit-strict cells skip on chromium/firefox).
- **RED run (pre-fix tree)**: webkit project, 5/5 failed with the UAT signature — classification polls received `"body"`, boundary-heading `toBeFocused` assertions received `inactive`. Recorded in this session's transcript; reproducible via `git checkout <pre-67d8a81> -- src/reader/ && npx playwright test tests/e2e/pagination/page-turn-focus-handoff.spec.ts --project=webkit`.
- Must-have artifacts verified: `focusNewPageTop` exported (PageTurnControls) + imported (PaginatedSurface, 3 references); spec ≥ 80 lines (389); `.page-turn-next` click + activeElement-classification assertions present; reverse import is type-only (no runtime cycle).

## Files Created/Modified
- `src/reader/PageTurnControls.tsx` - `focusNewPageTop` exported (04-09 isFormField precedent); `isFocusInContent` treats body/documentElement as content-origin (self-heal); D4-07 header contract updated to the engine-conditional never-body form.
- `src/reader/PaginatedSurface.tsx` - runtime import of the ONE `focusNewPageTop` (no fork, no cycle — reverse import is type-only); `handleChevronTurn` used by both chevrons: commit, then rAF-deferred control-guard fallback to the boundary handoff. `commitTurn`/`turnToPage`/imperative handle/`.page-start-heading` render byte-unchanged.
- `tests/e2e/pagination/page-turn-focus-handoff.spec.ts` - NEW: five-cell regression lock (never-body click classification, body-origin keyboard cascade self-heal, focused-chevron D4-07 hold, webkit-strict figure-page boundary reset, webkit-strict cascade-stays-healed) with registry-backed figure-heavy seeding and runtime page-map discovery via `__lemPagination`.

## Decisions Made
- Body-as-content-origin in `isFocusInContent` (plan-specified): the one-time WebKit focus loss must not become a permanent handoff skip.
- Chevron fallback lives in PaginatedSurface (not PageTurnControls) because the click path originates there; both paths converge on the same exported `focusNewPageTop`.
- See key-decisions for the geometry + contract decisions; recorded in STATE.md as D21-07 decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spec-local article builder instead of `makeFigureArticle`**
- **Found during:** Task 2
- **Issue:** `makeFigureArticle` places ALL figures after ALL paragraphs — it cannot express the plan-mandated "intro → figure → long paragraphs" order (Test 4 requires text pages AFTER the figure page so Next still turns).
- **Fix:** Built the article in-spec via `ArticleSchema.parse` mirroring `makeFigureArticle`'s provenance + block shapes exactly; only the block order differs. Every other harness piece (`seedImageryArticle`, `registrySample`, `openArticle`, `turnToPage`, `waitForDecoded`, `visibleFigureImgs`) reused, never forked.
- **Files modified:** tests/e2e/pagination/page-turn-focus-handoff.spec.ts
- **Verification:** Schema-valid parse; seeded row renders + paginates on all three engines.
- **Committed in:** e4a77c1

**2. [Rule 1 - Bug] Two-figure run instead of paragraph-tuned single figure (figure-only determinism)**
- **Found during:** Task 2 (probe run — first caption attempt tripped the atomic-oversize fallback)
- **Issue:** Probe-verified at 420x470: P≈320px, oversize ceiling 0.75P≈240px, figure img capped at 163px. A text-followed figure is figure-only only inside (P−48−24−57.6, 240] ≈ (190, 240] — a ~2-caption-line window. One caption line of engine drift breaks an end (4 lines → oversize fallback failing the ALL-ENGINE cells; 2 lines → a widow slice joins the page). The plan's "tune paragraph lengths" lever cannot open this window (paragraph widow slices are the mechanism, not the tuning).
- **Fix:** Two registry jpegs back-to-back (figure A = block 1 is the page under test): the second atomic figure (~200px) can never fit the ~82px remainder after the first, so figure A's page is deterministically figure-only on every engine — the same figure-run geometry the debug session actually observed. Safety margins are large both ways (~30px to oversize, ~120px to widow-slice).
- **Files modified:** tests/e2e/pagination/page-turn-focus-handoff.spec.ts
- **Verification:** Figure-only shape asserted and green on webkit (Test 4); pagination status "ok" on all three engines (Tests 1-3 readiness gate).
- **Committed in:** e4a77c1

**3. [Rule 1 - Bug] Test 3 made engine-aware (WebKit drops even pre-focused button focus on activation)**
- **Found during:** Task 2 (first webkit run)
- **Issue:** The plan's Test 3 asserted focus STAYS on the button after `focus()` + `click()` on all engines. Empirically, Playwright WebKit drops even a pre-focused button's focus on activation — the engine never holds button focus through a click, so the literal assertion is unfalsifiable on webkit (it fails against BOTH the pre-fix and post-fix trees for the wrong reason).
- **Fix:** Engine-aware cell: chromium/firefox assert the button stays focused (classification "button", no handoff); webkit asserts the 21-07 fallback catches the drop (classification "boundary", never body). This is the plan's own parenthetical — "D4-07 holds where the engine holds focus".
- **Files modified:** tests/e2e/pagination/page-turn-focus-handoff.spec.ts
- **Verification:** Test 3 green on all three engines; RED run still fails it on webkit pre-fix (received "body").
- **Committed in:** e4a77c1

**4. [Rule 1 - Bug] `handleChevronTurn` uses the `articleEl` prop, not the plan's `articleRef.current`**
- **Found during:** Task 1
- **Issue:** Plan pseudocode said `focusNewPageTop(articleRef.current)`, but PaginatedSurface's `articleRef` holds the `CanonicalArticle` OBJECT (not a DOM node); the DOM node is the `articleEl` prop.
- **Fix:** `focusNewPageTop(articleEl)` — the same `<article>` node the keyboard path uses via PageTurnControls' `articleEl` prop.
- **Files modified:** src/reader/PaginatedSurface.tsx
- **Verification:** tsc clean; boundary handoff fires on webkit (Test 1/4/5 green).
- **Committed in:** 67d8a81

---

**Total deviations:** 4 auto-fixed (2 blocking/Rule 3, 2 bug/Rule 1)
**Impact on plan:** All four were required to make the plan's mandated behavior expressible and deterministic. No scope creep — no files beyond the plan's three touched; TocPanel/ArticleView/app.css untouched (the diagnosis exonerated them).

## TDD Gate Note (Task 2, tdd="true")

The plan itself prescribes the inverted gate for this task: Task 1 commits the fix first (atomic task order), then Task 2's action explicitly requires the RED evidence via reverting the Task 1 sources ("run the new spec once with the Task 1 source changes stashed — the webkit button-click and cascade cells MUST fail against the pre-fix tree"). Executed exactly so: fix commit `67d8a81` → spec written → RED run against the pre-fix tree (5/5 webkit failures, `Received: "body"`) → fix restored → GREEN (11 passed / 4 by-design skips, 3 engines). A classic `test()` before `feat()` sequence would have falsified the plan's own evidence procedure.

## Issues Encountered
- First caption attempt (~155 chars / 4 caption lines) pushed the atomic figure to 260.5px > the 240px oversize ceiling → dom-fallback → all five cells timed out at the readiness gate. Diagnosed via a throwaway geometry probe (webkit: P=319.98, img=163, caption line≈22.4, margins 24/24), resolved by deviation #2 (the figure run). Probe deleted before commit.
- `test.skip(callback)` cannot be called inside a test body — switched to the boolean form with the already-destructured `browserName`.
- Playwright WebKit drops even pre-focused button focus on activation (empirical, this session) — folded into Test 3's engine-aware assertion (deviation #3).

## Known Stubs
None — no placeholder logic shipped; all assertions run against real committed DOM.

## User Setup Required
None — no external service configuration. The pending human checkpoint needs only a running dev server (see below).

## Pending Human Checkpoint (Task 3 — blocking, NOT executed)

`checkpoint:human-verify` — live VoiceOver + Safari confirmation, the UAT Test-2 sign-off the diagnosis requires. **ACPT-08 is deliberately not marked complete** until this passes (mirrors the 06-04/13-05 instrument-ships-now / requirement-closes-at-proof precedent). Steps: kill stale server (`lsof -ti :5173 | xargs kill`), `npm run dev`, open http://localhost:5173 in Safari with VoiceOver (Cmd+F5), open the image-bearing EPUB article in paginated mode, then verify (1) from an image-only page, VO+Space on "Next page" announces the new boundary and resumes at the TOP of the new page; (2) an image-leading page reads the image then the FIRST text line under it; (3) a subsequent PageDown still resets to the top (cascade healed). Resume signal: "approved" or a description of what VoiceOver did instead.

## Next Phase Readiness
- Tasks 1-2 complete and committed; the automated half of ACPT-08's UAT Test-2 truth is locked cross-engine.
- Blocker: the live VoiceOver+Safari checkpoint above (recorded in STATE.md) — 21-08 (the remaining gap plan) is unaffected and can proceed; ACPT-08 closes only on human approval.
- If the human veto occurs, the debug + spec harness here (classification helper, figure-run seeding, RED reproduction procedure) is the direct re-entry point for a follow-up fix.

## Self-Check: PASSED

- Files exist: src/reader/PageTurnControls.tsx ✓, src/reader/PaginatedSurface.tsx ✓, tests/e2e/pagination/page-turn-focus-handoff.spec.ts ✓ (389 lines ≥ 80)
- Commits exist: 67d8a81 ✓ (fix(21-07)), e4a77c1 ✓ (test(21-07)) — verified via git log
- Specs green post-fix: 26 passed / 4 by-design skips (both specs, 3 engines); RED evidence recorded
- STATE.md updated (position, decisions ×2, blocker, session); ROADMAP.md plan-progress row updated; REQUIREMENTS.md deliberately untouched (ACPT-08 gated on human sign-off)

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-03 (human gate pending)*
