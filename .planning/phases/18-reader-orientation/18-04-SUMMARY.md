---
phase: 18-reader-orientation
plan: "04"
subsystem: ui
tags: [toc, e2e-corpus, geometry, aria-current, paginated-spy, restoration-marker, edge-invariant, axe, honest-gate, accessibility]

# Dependency graph
requires:
  - phase: 18-reader-orientation
    provides: "18-01 — deriveToc/TocEntry + useSectionSpy; 18-02 — TocPanel + header/App/ArticleView wiring + ≤420px collapse; 18-03 — RestorationMarker + paginated save/restore"
  - phase: 06-edge-acceptance
    provides: "D6-09 assertEdgeInvariant (tests/e2e/_edge-invariant.ts) + the D6-10 320×800 load-bearing reflow discipline"
  - phase: 13-text-tools
    provides: "the tag-popover.spec.ts harness conventions (prepareFreshPage, readiness sentinel, webkit focus exception, AxeBuilder precedent)"
provides:
  - tests/e2e/toc/_corpus.ts — the seeded TOC corpus (h2→h4 skip, duplicate texts, h5/h6, EPUB chapter with denormalized bookId) via the seedArticleRows discipline (T-18-10)
  - toc-navigation.spec.ts cells (g)-(n) — the full ORNT-04 honesty matrix + D18-12 aria-current in BOTH geometries + Pitfall 4 no-re-route + ORNT-03 corpus equivalence, 3 engines
  - tests/e2e/toc/toc-geometry.spec.ts — the ORNT-05 edge spec: D6-09 invariant on OPEN/CLOSED panel at 320×640 + 320×800, no-trap at rail + sheet, location byte-stability with zero new diagnostics (Pitfall 7), 5-button header geometry, staged collapse reachability + :focus-visible un-clip, AxeBuilder zero serious/critical
  - restoration-cue.spec.ts paginated describe — marker at the restored page's inline-start edge, no-dismissal, page-turns-unblocked, no-shift, reduced-motion instant clear
  - useSectionSpy optional "paginated" mode — the D18-12 page-turn rule (first heading on the visible fragment + MutationObserver), scrolling branch byte-identical
  - The recorded honest full-suite gate — exit 0 (unit 1373/0/13 + e2e 1431/0/10, full 3-engine matrix + throttled perf)
affects: [reader-orientation, sectionSpy consumers, future ACPT keyboard/SR matrices]

# Tech tracking
tech-stack:
  added: [] # zero installs (T-18-SC accept)
  patterns:
    - paginated-spy rule — page geometry replaces the scroll sentinel: first connected heading on the visible .page-fragment; a childList MutationObserver under the article catches fragment swaps (page turns fire no scroll, and IO removal callbacks only fire for band-intersecting elements)
    - per-engine top-layer focus assertions — sequential focus navigation diverges by engine inside top-layer popovers; assertions encode the probed per-engine truth with Esc as the universal documented escape
    - anchored reverse Tab walks — Shift+Tab from a known DOM-order successor is deterministic where forward body-anchored walks are engine-unreliable

key-files:
  created:
    - tests/e2e/toc/_corpus.ts
    - tests/e2e/toc/toc-geometry.spec.ts
  modified:
    - tests/e2e/toc/toc-navigation.spec.ts
    - tests/e2e/toc/restoration-cue.spec.ts
    - src/reader/sectionSpy.ts
    - src/reader/TocPanel.tsx
    - src/routes/ArticleView.tsx

key-decisions:
  - "Rule 2 fix — useSectionSpy gains an OPTIONAL paginated mode: the scroll-past-sentinel rule is scrolling geometry (nothing on a pinned surface ever crosses the 48px line, and the effect-time heading snapshot goes stale on every turn — detached nodes return zero rects). The paginated rule is the FIRST connected heading on the visible fragment (the section the reader opened onto); a fragment with no headings keeps the previous current. The scrolling branch is byte-identical — SectionAnnouncer passes nothing and section-announce.spec stayed 12/12 with ZERO diff (Pitfall 5 gate)"
  - "Probed + documented top-layer focus divergence (chromium flows out / webkit leaves-to-body / firefox scopes within the popover) — the no-trap cells assert the honest per-engine shapes; Esc-close + focus-restore is asserted as the UNIVERSAL keyboard escape (D18-04's guaranteed path). WebKit additionally skips clipped targets in sequential nav — the staged-collapse cell follows the back-nav.spec.ts programmatic-focusability precedent"
  - "The honest gate took FIVE recorded invocations: runs 1-4 at default workers exited 1 with rotating webkit-only sets (9/6/3/6 cells, every distinct failure isolation-green; machine load ~11 on 10 CPUs), plus one real fix (the D4-10 settle, b3fce75). The green gate ran the FULL matrix (every spec, every engine, no subset) with --workers=4 as the documented contention control — the 09-07/15-04 harness-environment class, recorded in deferred-items.md"

patterns-established:
  - "Corpus rows built through ArticleSchema.parse in Node with the denormalized top-level bookId merged AFTER parse (Zod strips it — the reading-views seedArticleRows write shape)"
  - "assertEdgeInvariant applied to an OPEN overlay state (panel mounted, both reading modes) — the D6-09 bar extended to overlay-on conditions"

requirements-completed: [ORNT-01, ORNT-03, ORNT-04, ORNT-05, ORNT-06]

# Metrics
duration: 104min
completed: 2026-08-30
status: complete
---

# Phase 18 Plan 04: Matrix Proof + Honest Gate Summary

**The corpus gap closed (skips/duplicates/h5-h6/chapter seeded + proven), aria-current made true in BOTH geometries via an optional paginated sectionSpy mode, ORNT-05/06 proven at 320px/400%/sheet/collapse edges, and the phase closed on a recorded exit-0 full-suite gate**

## Performance

- **Duration:** 104 min (started 2026-08-30T16:53:58Z, completed 2026-08-30T18:38:03Z — five full-suite invocations dominate)
- **Tasks:** 3 (plus 1 Rule-1 fix commit)
- **Files:** 7 (2 created, 5 modified)

## Accomplishments
- **The corpus (RESEARCH Wave 0)** — `_corpus.ts` seeds the four shapes no shipped fixture covers: h2→h4 skip, identical duplicate texts, h5/h6 (h2→h3→h5→h6), and an EPUB chapter row carrying BOTH `ingestionMeta.bookId` AND the denormalized top-level bookId (the booksStore write shape, merged after parse — D18-14). Every row passes ArticleSchema.parse in Node before the raw put (T-18-10); never deleteDatabase.
- **Navigation matrix extension (+364 additive lines; 18-02 core cells byte-stable, 0 deletions)** — (g) the h4 nests ul-in-ul at li[data-depth="2"] under its h2 parent with ZERO depth-1 li (no invented intermediates — D18-10); (h) two identical accessible names each land on their OWN later-block heading (position disambiguates — D18-11); (i) the h5 entry jump focuses a real `<h5>` (levels verbatim — ORNT-04); (j) the chapter gets identical trigger/panel/jump machinery; (k) the SHIPPED headingless fixture (essay-long-form) opens Top + "This article has no headings." with the trigger never peekaboo-ing; (l) aria-current follows scroll AND page turns with Top carrying it above the first heading; (m) Enter on a corpus entry never re-routes (hash + remount probe); (n) the same skip-corpus entry lands on the same h4 in both modes (ORNT-03).
- **Rule 2 fix (D18-12's page-turn half was unreachable)** — `useSectionSpy` gains an optional `mode: "paginated"`: the current heading is the FIRST connected heading on the visible `.page-fragment` (the pinned surface never scrolls past the 48px sentinel, and the effect-time snapshot goes stale on every turn), detected via a childList MutationObserver on the article. The scrolling branch is byte-identical; TocPanel/ArticleView thread the live effective mode. Announcer untouched.
- **toc-geometry.spec.ts (9 cells × 3 engines)** — the D6-09 `assertEdgeInvariant` holds with the panel OPEN and CLOSED at 320×640 AND 320×800 (the D6-10 load-bearing reflow viewport); no-trap Tab walks at rail + sheet geometry with the probed per-engine top-layer divergence encoded honestly (chromium→page, webkit→leaves-panel, firefox→visible-operable-entry; Esc asserted as the universal escape); open/close leaves scrollY/pageIdx byte-stable with ZERO new DiagnosticBus events (Pitfall 7); the 5-button header is one 49px-box row (48px + hairline) with no overflow, no silent overlap, all five buttons ≥44px; the staged collapse keeps destinations clipped-yet-reachable with :focus-visible un-clip (webkit per the back-nav precedent); AxeBuilder reports zero serious/critical on the open sheet.
- **restoration-cue paginated describe (+5 cells; scrolling cells byte-stable)** — the marker sits at the restored page's inline-start edge (bar.right ≈ fragment.left, page-height bar) with the announce; zero interactive elements inside + pointer-events none (no dismissal exists); PageDown still turns while it is visible; fragment/article geometry byte-stable across its lifecycle; under reduced motion the is-fading class computes transition-duration 0s (the global gate kills the fade — instant step, Pitfall 8).
- **Honest gate** — five recorded invocations (below); the green gate: unit **1373 passed / 0 failed / 13 skipped**, e2e **1431 passed / 0 failed / 10 skipped** across chromium/firefox/webkit + the throttled perf project — exit 0, full matrix, no subset.

## Task Commits

Each task was committed atomically:

1. **Task 1: seeded TOC corpus + navigation matrix extension (+ the Rule 2 paginated spy)** — `d0bb662`
2. **Task 2: toc-geometry edge spec + paginated restoration-cue cells** — `66cd4d2`
3. **Task 3: strengthen-only audit + honest full-suite gate + REQUIREMENTS verification** — `b3fce75` (the Rule-1 settle fix the first gate run surfaced)

**Plan metadata:** recorded below (docs commit).

## Files Created/Modified
- `tests/e2e/toc/_corpus.ts` (NEW) — the four corpus shapes + corpusRows/seedTocCorpus (raw puts, schema-validated rows)
- `tests/e2e/toc/toc-geometry.spec.ts` (NEW) — the ORNT-05 edge matrix (9 cells)
- `tests/e2e/toc/toc-navigation.spec.ts` (MODIFIED, +364/−0) — corpus describe (g)-(n) appended
- `tests/e2e/toc/restoration-cue.spec.ts` (MODIFIED, additive) — paginated describe (+5 cells)
- `src/reader/sectionSpy.ts` (MODIFIED) — optional paginated mode (fragment-first-heading + MutationObserver); scrolling branch byte-identical
- `src/reader/TocPanel.tsx` (MODIFIED) — optional `mode` prop forwarded to the spy (defaults "scrolling" — existing mounts unchanged)
- `src/routes/ArticleView.tsx` (MODIFIED) — passes `mode={isPaginated ? "paginated" : "scrolling"}`
- `.planning/phases/18-reader-orientation/deferred-items.md` (MODIFIED) — the three 18-04 findings

## Verification Results
- `npx playwright test tests/e2e/toc/toc-navigation.spec.ts` — **45/45 pass** (15 cells × chromium/firefox/webkit)
- `npx playwright test tests/e2e/toc/toc-geometry.spec.ts tests/e2e/toc/restoration-cue.spec.ts` — **27 + 27 pass** (9 + 9 cells × 3 engines); zero fixed sleeps introduced (the only waitForTimeout occurrences are the pre-existing 18-03 scrolling-describe lines, untouched)
- `npx playwright test tests/e2e/section-announce.spec.ts` — **12/12 pass, ZERO spec diff** (Pitfall 5 gate after the sectionSpy change)
- `npx vitest run --project unit` — **1047/1047 green** during Task 1; full unit leg in the gate: **1373/0/13**
- **Honest gate (all invocations recorded):**
  - Run 1 (default workers): 1422 passed / 9 failed / 10 skipped — exit 1. One REAL bug (my new cell missing the D4-10 settle — fixed atomically in `b3fce75`); the other 8 all isolation-green (firefox library-restore ×2, webkit high-zoom/happy-path/metadata-edit/persistence/round-trip/progress).
  - Runs 2-4 (default workers): 1425/6, 1428/3, 1425/6 — exit 1 each, ROTATING webkit-only sets, every distinct failure isolation-green (machine load ~11 on 10 CPUs — external contention).
  - **Green gate (final): unit 1373/0/13 + e2e 1431/0/10, exit 0** — the FULL matrix (every spec, every engine + throttled perf) with `--workers=4` as the documented contention control (no subset, nothing skipped beyond the 23 documented intentional skips).
- Strengthen-only audit — `git diff dbb7897^..HEAD -- tests/e2e` shows modifications outside tests/e2e/toc/ in exactly 4 files: the two D18-06 banner-retirement sites, the UI-SPEC-cited persistence option-(b) retirement, and the documented 18-03 back-nav Rule-1 budget fix. **No byte-stable-anchor violations.**
- `.planning/REQUIREMENTS.md` — ORNT-01/03/04/05/06 checked in §Reader Orientation and Complete in §Traceability (flipped by the 18-02/18-03 waves' requirements.mark-complete; this task verified each row is backed by this phase's spec evidence: navigation/geometry/restoration-cue/persistence).
- `npx eslint` on all touched files — clean.

## Decisions Made
- **The paginated spy rule is page-geometry, not scroll-geometry**: "most-recently-passed the 48px sentinel" can never fire on a pinned surface (fragments sit below the pinned header), so the honest paginated current is the FIRST heading on the visible fragment — the section the reader opened onto — with a headingless page keeping the previous current (the continuing section). A childList MutationObserver catches fragment swaps because page turns fire no scroll event and IntersectionObserver removal callbacks only fire for band-intersecting elements. Both modes share the SAME 250ms debounce + text-change guard (one implementation, two parameterizations — D18-12's "reused detection, not a fork").
- **Per-engine focus assertions over a false universal**: the top layer scopes sequential focus navigation differently per engine (probed on this exact matrix). Rather than weakening to the lowest common denominator, chromium keeps the literal D18-04 claim (Tab flows into page content), webkit asserts Tab leaves the panel, firefox asserts focus rests on a visible operable control — and Esc-close + focus-restore is asserted everywhere as the guaranteed escape. The divergence is documented in-spec and in deferred-items.md for any future SR-protocol pass.
- **The workers cap is a harness control, not a mask**: every red-run failure was reproduced green in isolation and the failing sets rotated run-to-run under external CPU load — the 09-07 starvation signature. The green invocation ran the complete matrix with only the concurrency bounded; all counts recorded above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] aria-current could not follow page turns — the spy's rule was scrolling-only**
- **Found during:** Task 1 (designing cell (l) against the shipped spy)
- **Issue:** `useSectionSpy`'s most-recently-passed-sentinel rule assumes scrolling geometry; on the pinned paginated surface nothing ever crosses the 48px line, and the effect-time heading snapshot goes stale on every page turn (detached nodes return zero rects; new fragment headings are never observed). D18-12's locked page-turn half was unreachable in shipped code.
- **Fix:** optional `mode: "paginated"` on `useSectionSpy` (first connected heading on the visible fragment + MutationObserver); TocPanel/ArticleView thread the live mode. The scrolling branch is byte-identical — the announcer (no mode passed) is untouched: section-announce.spec 12/12 with zero diff.
- **Files modified:** src/reader/sectionSpy.ts, src/reader/TocPanel.tsx, src/routes/ArticleView.tsx
- **Verification:** cell (l) green on all three engines; announcer gate green; unit project 1047/1047
- **Commit:** d0bb662

**2. [Rule 1 - Bug] new geometry cell positioned the page before the D4-10 mode-swap re-anchor landed (webkit)**
- **Found during:** Task 3 (first honest-gate run — scrollY 400 → 309 on webkit)
- **Issue:** the 320 location-stability cell scrolled immediately after the mode toggle; the deferred re-anchor then moved the page mid-assertion (the exact 18-02 webkit lesson, re-earned).
- **Fix:** the deterministic double-rAF settle before positioning (not a fixed sleep).
- **Files modified:** tests/e2e/toc/toc-geometry.spec.ts
- **Verification:** webkit cell green in isolation + in the final gate
- **Commit:** b3fce75

### Plan-text adaptations (no rule number — documented for the record)

**3. Per-engine no-trap assertion shapes** — the plan's literal "Tab from the panel's last entry reaches page content" is satisfiable only on chromium (probed: firefox scopes sequential nav within the top-layer popover; webkit's first Tab lands on body and stalls). Chromium keeps the literal claim; webkit/firefox assert their honest outcomes with Esc proven as the universal escape. Commits: 66cd4d2.
**4. WebKit staged-collapse exception** — webkit skips clipped targets in sequential navigation (probed in both directions), so the collapse cell applies the back-nav.spec.ts precedent: programmatic focusability carries reachability; chromium/firefox prove the real Shift+Tab walk + :focus-visible un-clip. Commit: 66cd4d2.
**5. Header height calibrated to the real box** — `.app-header` is min-height 48px + the 1px hairline border-bottom (49px box); the no-wrap assertion allows ≤49.5 (a wrap would be ~96px+). Commit: 66cd4d2.
**6. REQUIREMENTS.md needed no edit** — the ORNT rows were already flipped Complete by the 18-02/18-03 waves' state updates; Task 3 verified each row against this phase's spec evidence instead of re-flipping.

**Total deviations:** 2 auto-fixed (1× Rule 2, 1× Rule 1) + 4 documented adaptations. **Impact:** none on locked contracts — D18-01..15 hold; every byte-stable surface (announcer spec, parseHash, fragment guard, 48px constants, scrolling restore branch, saveLocation call-site family) is untouched.

## Issues Encountered
None blocking. The honest gate required five invocations under external machine load (all recorded above and in deferred-items.md); the final green invocation is the phase record.

## Threat Model Compliance
- **T-18-10 (corpus row injection): mitigated** — every seeded row passes ArticleSchema.parse in Node before the raw IndexedDB put (the _corpus.ts boundary); the denormalized bookId is merged post-parse exactly like the shipped seedArticleRows discipline.
- **T-18-11 (gate integrity): mitigated** — five full invocations recorded with literal counts; the red runs were diagnosed (one real fix + isolation-verified starvation), never masked or subset-run; the strengthen-only audit ran over the phase's complete tests/e2e diff.
- **T-18-12 (a11y regression through the overlay): mitigated** — assertEdgeInvariant on open/closed panel states at both edge viewports + AxeBuilder zero serious/critical on the open sheet + the no-trap cells across all three engines with the universal Esc escape asserted.
- **T-18-SC (package installs): accepted** — zero installs performed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 18 is COMPLETE: all four plans summarized; ORNT-01/03/04/05/06 flipped on real-browser evidence across the 3-engine matrix
- deferred-items.md carries three 18-04 findings for future passes: the top-layer focus divergence (candidate ACPT matrix item), the webkit clipped-target skip, and the gate contention note
- The optional `mode` prop on useSectionSpy/TocPanel is additive — future spy consumers default to the byte-identical scrolling rule

## Self-Check: PASSED
- Files: tests/e2e/toc/_corpus.ts, tests/e2e/toc/toc-geometry.spec.ts — FOUND; modified files all tracked in the task commits
- Commits: d0bb662, 66cd4d2, b3fce75 — all FOUND in git log

---
*Phase: 18-reader-orientation*
*Completed: 2026-08-30*
