---
phase: 21-integrated-refinement-and-acceptance
plan: 06
subsystem: testing
tags: [playwright, e2e, edge-invariant, acceptance-protocol, acpt-08, wcag, touch-targets, honest-gate, lint]

# Dependency graph
requires:
  - phase: 06-prototype-acceptance
    provides: the D6-09 edge-invariant machinery (assertEdgeInvariant + the five edge specs) this plan extends, and ACCEPTANCE-PROTOCOL v1.2
  - phase: 21-integrated-refinement-and-acceptance (21-04)
    provides: the audited/remediated UI state the matrix runs over
  - phase: 21-integrated-refinement-and-acceptance (21-05)
    provides: the lint-green tree (D21-15) the honest gate runs on
provides:
  - "assertDestinationInvariant + openEdgeDestination + DESTINATIONS (tests/e2e/_edge-invariant.ts) — the destination-agnostic (b)+(c) wrapper + real-UI destination navigation/seeding; (a) stays reader-scoped in the untouched assertEdgeInvariant"
  - "Four-destination matrix cells: 5 edge specs × 3 non-reader destinations × 3 engines green (213-cell six-spec run, exit 0) + the panel-keyboard destination arm (Add-dialog Esc/focus-restore, Highlights Esc no-op + Enter jump)"
  - "ACCEPTANCE-PROTOCOL.md v1.3 — capability flows G–L (Add-dialog flow retires the Phase 16 manual-SR deferral), D21-12 Safari image slot, results location → 21-VERIFICATION.md, blank v1.3 results sheets ×2"
  - "The phase honest-gate ledger (this SUMMARY §Gate Invocation Ledger): lint exit 0; full suite exit 0 in one invocation (unit 1605/0/13 + e2e 1722/0/16 across 3 engines + throttled) after two starvation-classified red runs"
  - "21-USER-SETUP.md — the two human SR sessions (NVDA+Firefox off-machine; VoiceOver+Safari incl. the D21-12 sighted image pass)"
affects: [21-VERIFICATION.md (verify-work records the v1.3 runs + points at the D21-12 evidence), ACPT-08 flip (verify-work, zero-blocker/major on both human runs), future edge specs (destination cells extend via the one shared module)]

# Tech tracking
tech-stack:
  added: [] # zero packages installed (T-21-SC accepted, honored)
  patterns:
    - "Destination-agnostic invariant wrapper (OQ2 adopted): (b) required-functions + (c) no-overflow are destination-neutral and share ONE helper module; the article clause (a) stays reader-scoped — extend, never fork (D6-09)"
    - "Destination-cell harness discipline: reload-before-seed (10-03) + post-seed remount (08-05 load-effect-runs-once) + library readiness sentinel (first fixture title) before any seeded-row assertion"
    - "WebKit native <select> ignores min-height (and padding-block) — height is honored; probed, not assumed. The 44px --touch hit area needs height: var(--touch) + the UA form-control border-box default"
    - "Sub-pixel tolerance on boundingBox assertions (firefox reports 43.99999px on an exact 44px min-height row): ±0.5px, the 21-02 readBoxes discipline — existing exact-bar cells stay byte-stable"
    - "Starvation classification protocol under load: plain runs exit 1 with rotating webkit goto-timeout sets → isolation re-runs green → the bounded-workers control (--workers=2, the 20-07 recorded command) is the green gate; every invocation recorded"

key-files:
  created:
    - .planning/phases/21-integrated-refinement-and-acceptance/21-USER-SETUP.md
  modified:
    - tests/e2e/_edge-invariant.ts
    - tests/e2e/forced-colors.spec.ts
    - tests/e2e/reduced-motion.spec.ts
    - tests/e2e/reflow.spec.ts
    - tests/e2e/high-zoom.spec.ts
    - tests/e2e/touch-targets.spec.ts
    - tests/e2e/panel-keyboard.spec.ts
    - src/app.css
    - docs/ACCEPTANCE-PROTOCOL.md

key-decisions:
  - "OQ2 adopted as shipped: assertDestinationInvariant asserts (b)+(c) at Library/Highlights/Add-dialog with per-destination canonical control sets + body/main#main overflow; (a) stays inside assertEdgeInvariant (reader-only) — the five edge specs' diffs are pure additions (0 removed lines), the existing helper's only touched line is the import (Locator added)"
  - "[Rule 1] .review-select height: var(--touch): WebKit renders native selects at the option line-height (~23px) regardless of min-height/padding (probed on the pinned engines: min-height 23px, height 44px) — the new touch-target destination cells surfaced a real WCAG 2.5.5 gap on the shipped Highlights surface; the fix is tokens-only, chromium/firefox boxes unchanged (they already honored min-height at 44)"
  - "Panel-keyboard destination arm: Add-dialog keyboard-open→focus-in→Esc→focus-restore re-asserted in the keyboard-arm spec's own idiom (focused-add.spec.ts stays byte-stable — it already owns trap/Esc/restore comprehensively); Highlights asserts the honest NON-modal Esc contract (calm no-op: no focus loss, no route change, no hijack — the D18-04 two-target lesson inverted) + row Enter jump"
  - "Protocol v1.3 ships 12 scripted flows (A–F + G–L): D21-14's per-capability mandate names six capabilities, so the soft ~8-10 guidance yields to it; every new outcome is role + accessible name + state (zero SR-utterance gates in added content — the one 'NVDA says' match is §2's pre-existing anti-pattern example)"
  - "ACPT-08 does NOT flip here: requirements-completed is [] (the 04-02/06-04/13-05 instrument-ships-now precedent); the flip belongs to verify-work at zero-blocker/major on BOTH human v1.3 runs (D13-06/D13-07); .planning/REQUIREMENTS.md is untouched by this plan (git-diff-verified)"

patterns-established:
  - "Edge-spec destination cells: for (const destination of DESTINATIONS) → openEdgeDestination + assertDestinationInvariant — one loop per spec, condition label per spec's own emulation idiom"
  - "Honest-gate ledger format: every npm invocation with true exit code + pass/fail counts + classification (starvation sets named, isolation re-runs recorded with their counts)"

requirements-completed: [] # ACPT-08 flips only at the human NVDA+Firefox AND VoiceOver+Safari v1.3 runs (D13-06/D13-07) — via verify-work, never in-plan

# Metrics
duration: 118min
completed: 2026-09-01
status: complete
---

# Phase 21 Plan 06: ACPT-08 Acceptance Matrix Summary

**Four-destination edge-invariant matrix green on all three engines (assertDestinationInvariant extends the D6-09 machinery — never forked), a Rule 1 WebKit select-hit-area fix the new cells surfaced, ACCEPTANCE-PROTOCOL v1.3 with all six capability flows + the D21-12 Safari image slot, and the phase honest gate green in one recorded invocation (lint 0 + full suite 0) after two starvation-classified reds**

## Performance

- **Duration:** 118 min (≈33 min tasks 1–2; ≈85 min the honest gate's four full-suite invocations)
- **Started:** 2026-09-01T15:01:10Z
- **Completed:** 2026-09-01T17:00:00Z
- **Tasks:** 3
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- The ACPT-08 automated arms pass across ALL FOUR destinations on chromium/firefox/webkit through the ONE shared invariant module: `tests/e2e/_edge-invariant.ts` gains `assertDestinationInvariant` ((b) canonical required functions + (c) body/main#main no-overflow) alongside `openEdgeDestination` (real-UI shell-nav navigation + the reload-before-seed/post-seed-remount harness discipline); the five edge specs each add a `DESTINATIONS` loop (3 destinations × 3 engines each) as pure-addition diffs — the existing reader cells are byte-stable (0 removed lines in all five files).
- The keyboard arm extends `panel-keyboard.spec.ts`: the Add dialog's keyboard open → focus-in → Esc → focus-restore, and the Highlights surface's honest non-modal Esc contract (calm no-op — focus stays, route unchanged) + row Enter jump; `focused-add.spec.ts` stays byte-stable (its ADD-04 cells already own the trap/idle-Esc/restore surface).
- The new touch-target destination cells surfaced a REAL WCAG 2.5.5 bug: WebKit ignores `min-height` on native `<select>` — `.review-select` rendered a 23px hit area on the shipped Highlights surface (probed: min-height→23px, padding-block→23px, height→44px). Fixed tokens-only (`height: var(--touch)`; UA form-control border-box makes it the outer box); chromium/firefox unchanged at 44px.
- ACCEPTANCE-PROTOCOL.md grows v1.2 → v1.3 exactly as D21-14 locks it: capability flows G–L (library views/search/tags; Add dialog — citing and retiring the Phase 16 manual-SR deferral; metadata edit; TOC navigation; cross-block highlight + review; images save→offline reopen→view), the D21-12 fold-in note + evidence row in the VO+Safari results sheet, results-record location → 21-VERIFICATION.md, blank v1.3 results sheets for both pairings, the ACPT-08 flip-policy note — with the 6 existing flows, 5 charters, and severity policy byte-stable.
- The phase honest gate closes: `npm run lint` exit 0; the full suite green in ONE recorded invocation (unit 1605/0/13 + e2e 1722/0/16 across chromium/firefox/webkit + chromium-throttled, exit 0) after two environment-classified red runs (below); every invocation is in the ledger.
- ACPT-08's flip is correctly left to the human arms: 21-USER-SETUP.md declares the NVDA+Firefox (Windows, off-machine) and VoiceOver+Safari (macOS, incl. the D21-12 sighted image pass) sessions on protocol v1.3 — zero-blocker/major on BOTH runs via verify-work flips it; REQUIREMENTS.md untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Destination-agnostic edge-invariant wrapper + four-destination matrix cells** — `ca8990e` (test; includes the Rule 1 `.review-select` fix)
2. **Task 2: ACCEPTANCE-PROTOCOL v1.3 — capability flows + Safari image slot** — `573abe1` (docs)
3. **Task 3: Phase honest gate — lint + full suite, every invocation recorded** — no production files (files: []); the gate ledger IS this SUMMARY + 21-USER-SETUP.md (final metadata commit)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `tests/e2e/_edge-invariant.ts` — +`EdgeDestination`/`DESTINATIONS`/`openEdgeDestination`/`assertDestinationInvariant`; existing `assertEdgeInvariant` assertions untouched (only its import line gains `Locator`)
- `tests/e2e/forced-colors.spec.ts`, `reduced-motion.spec.ts`, `reflow.spec.ts`, `high-zoom.spec.ts`, `touch-targets.spec.ts` — additive destination-cell loops (touch-targets additionally measures the 44px contract per destination with ±0.5px sub-pixel tolerance)
- `tests/e2e/panel-keyboard.spec.ts` — additive "Destination keyboard arm" describe (2 tests × 3 engines)
- `src/app.css` — `.review-select` gains `height: var(--touch)` (Rule 1 WebKit hit-area fix, citation-commented)
- `docs/ACCEPTANCE-PROTOCOL.md` — v1.3 (§1 scope note, §3 flows G–L, completion-record rows, §6 location + flip policy + blank results sheets)
- `.planning/phases/21-integrated-refinement-and-acceptance/21-USER-SETUP.md` (NEW) — the two human SR sessions

## Decisions Made
- Wrapper shape per research OQ2 (adopted): one destination-agnostic wrapper for the destination-neutral clauses; per-destination canonical control lists live INSIDE the wrapper so all five specs assert the same bar (D6-09 uniform acceptance), and navigation/seeding lives in `openEdgeDestination` so the discipline cannot fork per spec.
- The library destination seeds one TAGGED article (the tag-filter chips render only when tags exist — TagFilter returns null otherwise) so "Library (list + views/filters)" is covered whole; highlights seeds one confident highlight via the shipped `_portability` primitives; the Add-dialog destination needs no seed.
- Touch-target destination measurements assert height as the load-bearing bar (the CSS-backed `min-height: var(--touch)` contract, the spec's own ranges precedent) with width only where structurally guaranteed (full-width rows, inline-flex buttons with padding-inline).
- High-zoom destination cells assert the LOAD-BEARING 320px reflow condition only; the secondary 400% CSS-zoom survival pass stays owned by the existing reader-corpus + Add-dialog cells (the spec's own documented hierarchy).
- Protocol v1.3 flow count: 12 scripted flows (6 existing + 6 capability) — D21-14's "each capability once" enumeration wins over the soft "~8-10" guidance; documented here rather than silently merging capabilities.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WebKit renders `.review-select` at a 23px hit area (min-height ignored on native selects)**
- **Found during:** Task 1 (first destination-cell run — the highlights touch-target cell failed on webkit only: three comboboxes at 23px)
- **Issue:** `.review-select { min-height: var(--touch) }` delivers 44px on chromium/firefox but WebKit ignores min-height (and padding-block) on `appearance: auto` selects — the control renders at the option line-height (~23px at the 16px register). Probed on the live surface: inline `min-height:44px` → 23px; `height:44px` → 44px.
- **Fix:** `height: var(--touch)` added to `.review-select` (citation-commented) — the UA form-control border-box default makes it the exact outer box; chromium/firefox already rendered 44 via min-height so their boxes are unchanged.
- **Files modified:** src/app.css
- **Verification:** touch-targets destination cells green × 3 engines; review-panel collateral 99/99 on a fresh server; full-suite green (run 4)
- **Committed in:** ca8990e

**2. [Rule 1 - Bug] Seeded library row never appeared (load effect runs once per mount)**
- **Found during:** Task 1 (first run — the library destination cell timed out on the seeded row across all engines; engine-identical = real bug in the new cell)
- **Issue:** `openEdgeDestination("library")` seeded while LibraryView was already mounted; the 08-05 lesson — the load effect runs ONCE per mount, so the seeded row never joins the list without a remount.
- **Fix:** post-seed `page.reload()` + h1/seeded-row assertions (the openLibrary discipline), plus the fixture-title readiness sentinel before seeding.
- **Files modified:** tests/e2e/_edge-invariant.ts
- **Verification:** library destination cells green × 5 specs × 3 engines
- **Committed in:** ca8990e

**3. [Rule 1 - Bug] Sub-pixel boundingBox on firefox (43.99999px vs an exact 44px row)**
- **Found during:** Task 1 (first run — the add-dialog touch-target cell failed on firefox by 7.6e-6 px)
- **Issue:** firefox's getBoundingClientRect reports the token minus a rendering fraction on the `.add-source-row` label; an exact ≥44 bar fails on a rounding artifact, not a contract miss.
- **Fix:** ±0.5px sub-pixel tolerance on the DESTINATION measurements only (the 21-02 readBoxes discipline); the existing cells keep their exact bar byte-stable.
- **Files modified:** tests/e2e/touch-targets.spec.ts
- **Verification:** add-dialog destination cell green on firefox; all existing cells untouched
- **Committed in:** ca8990e

---

**Total deviations:** 3 auto-fixed (3 bugs — one real production a11y fix, two honest-cell fixes)
**Impact on plan:** All three required for the plan's own acceptance bar ("arms pass across all four destinations on chromium, firefox, and webkit"). No scope creep — every strengthen-only prohibition verified held (0 removed lines in the five edge specs; the 6 flows + 5 charters byte-stable; REQUIREMENTS.md untouched).

## Issues Encountered
- **Honest-gate starvation (environment, not code):** full-suite runs 1 and 2 (plain `npm run test`, workers:3 from config, fresh servers) each exited 1 with 8 webkit-only 30s goto-timeouts in DIFFERENT, unrelated tail specs (the moving-tail signature) under machine loadavg up to ~20 on the 10-core reference machine. Both sets proven isolation-green on fresh servers (the 8-spec webkit set: 66/0 exit 0; run 3's single firefox scroll-timing miss 78px-vs-60px tolerance: 21/0 exit 0). Classified environment starvation per the documented 18-04/15-04/20-07 lesson; the green gate used the 20-07 bounded-workers control (`--workers=2` on the e2e half) and is recorded as the command. Every invocation is in the ledger below.

## Gate Invocation Ledger (Task 3 — the honest record)

| # | Invocation | Exit | Result |
|---|-------------|------|--------|
| 1 | `npm run lint` (fresh server armed first) | **0** | clean |
| 2 | `npm run test` (run 1, workers:3, fresh server) | 1 | unit green; e2e 1714/8-failed/16-skipped — 8 webkit goto-timeouts (tag-popover, epub-intake, dexie-migration, open-every-fixture, coverage-invariant, zip-slip-regression, review-panel ×2) |
| 3 | isolation: the 8 failed specs, `--project=webkit`, fresh server | **0** | 66 passed / 1 skip → run-2 set classified starvation |
| 4 | `npm run test` (run 2, workers:3, fresh server) | 1 | 1714/8-failed/16-skipped — 8 DIFFERENT webkit tail timeouts (moving-tail signature; loadavg 20.25 15-min avg) |
| 5 | `npm run test:unit -- --run` (run 3 unit half) | **0** | 1605 passed / 0 failed / 13 documented skips |
| 6 | `npm run test:e2e -- --workers=2` (run 3 e2e half, fresh server) | 1 | 1721/1-failed/16-skipped — webkit starvation GONE; 1 firefox library-restore scroll-timing miss (78 vs ≤60) |
| 7 | isolation: `tests/e2e/library/library-restore.spec.ts`, fresh server | **0** | 21 passed → run-6 miss classified environment |
| 8 | **THE GREEN GATE:** `npm run test:unit -- --run && npm run test:e2e -- --workers=2` (one invocation, fresh server) | **0** | unit 1605/0/13 + e2e **1722 passed / 0 failed / 16 skipped** across chromium/firefox/webkit + chromium-throttled (24.0m e2e) |

Also recorded (Task 1/2 verification invocations, all exit 0 unless noted):
- Task 1 matrix (six specs, 3 engines): first invocation 17 failed (all new-cell bugs → deviations 1–3), final **213 passed / 0 failed / TRUE exit 0**; review-panel collateral first run 8 webkit non-loads (starvation on the long-lived probe server — 91/8), fresh-server re-run **99/0 exit 0**.
- Task 1 static gates: tsc --noEmit 0; eslint (7 touched files) 0; strengthen-only verified (0 removals in the five edge specs).
- Task 2 verify greps: `1\.3`=22, `Add dialog`=9, `21-VERIFICATION`=5, `TOC`=8; 6 flows + 5 charters headings intact; 0 flow-table rows removed; zero SR-utterance gates in added lines.

## Human Sessions Remaining (ACPT-08 flip condition — 21-USER-SETUP.md)

1. **NVDA + Firefox on Windows hardware** (off-machine, user-scheduled): protocol v1.3 flows A–L + 5 charters.
2. **VoiceOver + Safari on macOS** (incl. the D21-12 sighted pass: save → offline reopen → export → import with images; evidence in the VO+Safari results sheet, pointed at by 21-VERIFICATION.md).

**ACPT-08 flips ONLY when BOTH runs land zero blocker / zero major on protocol v1.3 (D13-06/D13-07, fix-then-re-run) — via verify-work, not in-plan.** The 16 e2e skips are the documented intentional set (webkit Blob→IDB image boundary + others per the Phase 20 ledger); lint exit 0 closes D21-15's milestone condition over this plan's additions too.

## User Setup Required

**Two human acceptance sessions remain.** See [21-USER-SETUP.md](./21-USER-SETUP.md) for:
- The NVDA+Firefox (Windows) protocol v1.3 session
- The VoiceOver+Safari (macOS) session + the D21-12 image-flow sighted pass

## Next Phase Readiness
- Phase 21 execution is complete (6/6 plans). The milestone's automated bars are green and honestly recorded; the only open item before ACPT-08 flips is the two human SR sessions.
- Next: `/gsd-verify-work 21` (records the human runs + the D21-12 evidence in 21-VERIFICATION.md, owns the ACPT-08 flip), then `/gsd-complete-milestone`.
- Future edge work extends `assertDestinationInvariant`'s canonical control lists when a destination grows a new required function — never a forked helper.

## Self-Check: PASSED

- Key files exist on disk: tests/e2e/_edge-invariant.ts (both exports verified at L100/L344), the 6 touched spec files, src/app.css, docs/ACCEPTANCE-PROTOCOL.md (v1.3 header), 21-USER-SETUP.md.
- Commits exist in git log: ca8990e (test), 573abe1 (docs).
- Plan-level verification re-run post-commit: the six-spec matrix 213/0 exit 0 (recorded run); lint exit 0; full suite exit 0 (ledger #8).
- Prohibition checks: REQUIREMENTS.md diff vs pre-plan commit EMPTY; five edge specs 0 removed lines; 6 protocol flows + 5 charters unmodified.

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-01*
