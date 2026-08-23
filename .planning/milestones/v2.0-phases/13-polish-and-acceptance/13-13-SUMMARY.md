---
phase: 13-polish-and-acceptance
plan: 13
subsystem: annotations
tags: [accessibility, nvda, screen-reader, selection-toolbar, native-selection-mode, playwright-e2e, acceptance-protocol, gap-closure]

# Dependency graph
requires:
  - phase: 13-polish-and-acceptance
    provides: G6 fix (13-11 — mount path + Tab routing + announce-on-appear) + G7 closure (13-12 — focus-mode-only reachability, protocol v1.1, keydown-less boundary spec) + G8 diagnosis (.planning/debug/g8-toolbar-never-mounts-nvda.md) + the ACPT-05 v1.1 re-run failure (13-UAT.md G8, Test 5)
provides:
  ACCEPTANCE-PROTOCOL.md v1.2 Flow C executable as written by an NVDA+Firefox tester on default-adjacent hardware (C1 NVDA+shift+f10 native-selection precondition, false Firefox-native parenthetical removed, older-NVDA F7 caret-browsing fallback, documented platform boundary); the C1 "Highlight actions available." mount cue's FIRST automated substrate — the selection-gated mount/announce boundary spec pinning BOTH sides of the G8 platform boundary at the page-observable layer; decision G8-D1 recorded (zero production changes — final for this gap)
affects: [ACPT-05 re-run (D13-06/D13-07), 13-VERIFICATION, acceptance-testing, annotations e2e suite]

# Tech tracking
tech-stack:
  added: []  # zero new packages (T-13-13-SC — no package.json/lockfile changes, verified)
  patterns:
    - "Selection-gated boundary pin: when the platform never delivers the triggering event (NVDA buffer-only selection), pin BOTH sides at the page-observable layer — event-present ⇒ full mount contract incl. the announce cue + region separation; event-absent ⇒ structural silence identical on every engine (no engine-keyed split needed when nothing engine-specific is asserted)"
    - "Live-region ownership assertion: the cue region is located via the toolbar-INTERNAL [role='status'] (SelectionToolbar L222-224) and asserted NOT to appear in ArticleView's separate D5-12 CRUD announce region — two same-role regions discriminated by containment, not by helper reuse"
    - "Layer-honest spec header: states explicitly what Playwright CANNOT emulate (the NVDA virtual buffer) so a future silent NVDA re-run points at the NVDA layer/protocol adherence instead of another page-side diagnosis cascade (the G6→G7→G8 anti-pattern)"

key-files:
  created:
    - tests/e2e/annotations/toolbar-mount-selection-gated.spec.ts
  modified:
    - docs/ACCEPTANCE-PROTOCOL.md

key-decisions:
  - "G8-D1: protocol v1.2 (primary) + a page-observable boundary-pin spec; REJECTED protocol-only AND any production source change — the page-side mount path is exonerated and buffer-only selections are unobservable by construction (see Decision G8-D1 below)"
  - "The spec exists because protocol-only was insufficient: the C1 mount cue was asserted by ZERO automation — a future refactor breaking the announce would fail the next NVDA re-run at C1 and get re-diagnosed from scratch (the exact G6→G7→G8 cascade pattern)"
  - "ACPT-05 stays Pending — it flips only when the tester's NVDA+Firefox re-run of Flow C on the v1.2 protocol lands in 13-VERIFICATION.md §1.3/§1.4 with zero blocker/major (D13-06/D13-07; 13-11/13-12 precedent)"

requirements-completed: []  # ACPT-05 remains Pending until the human NVDA re-run lands in 13-VERIFICATION.md (D13-06/D13-07) — the plan's own contract, mirroring the 13-11/13-12 precedent

# Metrics
duration: 4 min
completed: 2026-08-22
status: complete
---

# Phase 13 Plan 13: G8 NVDA Native-Selection-Mode Gap Closure Summary

**ACCEPTANCE-PROTOCOL Flow C corrected to v1.2 (C1 NVDA+shift+f10 native-selection precondition, disproven Firefox-native parenthetical removed, F7 fallback + platform-boundary note) plus the selection-gated mount/announce boundary e2e giving the C1 cue its first automated substrate — zero production source changes per decision G8-D1**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-22T21:06:07Z
- **Completed:** 2026-08-22T21:10:44Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Decision G8-D1 (recorded verbatim from the plan — do not re-litigate)

**Chosen: protocol v1.2 (primary) + a page-observable boundary-pin spec. Rejected: protocol-only, and any production source change.** The page-side mount path is exonerated (3-engine e2e green; programmatic selections mount the toolbar in firefox; 13-12 shipped zero source changes; ArticleView's selectionchange listener is the only mount driver and is correctly built). ZERO production changes are FINAL for this gap.

Justification:

1. **No page-side fix exists — by construction.** With Native Selection Mode OFF, browse-mode Shift+arrows selects only within NVDA's virtual buffer ("not within the application itself... not visible on screen" — NVDA User Guide §Native Selection Mode; NVDA source gecko_ia2.py `_setSelectionOffsets` pushes the selection to the document only under `_nativeAppSelectionMode`). The DOM never changes, so no DOM API, event, observer, or heuristic in the page can detect it. This is a platform boundary like G7's browse-mode Tab consumption — the only honest fix is the protocol instructing the correct gesture.
2. **Protocol-only was considered and rejected as insufficient.** The G7 precedent (13-12) pinned its zero-source boundary with a spec, and the G8 diagnosis exposes a worse automation hole: the "Highlight actions available." mount cue — the confirmation signal v1.1 made load-bearing at C1 and v1.2 keeps — was asserted by ZERO automation (repo-wide, the string existed only in SelectionToolbar.tsx and the protocol). If a future refactor breaks the announce, the next NVDA re-run fails at C1 again and gets re-diagnosed from scratch — the exact G6→G7→G8 cascade pattern. The spec closes that hole.
3. **The spec stays honest about its layer.** Playwright cannot emulate NVDA's virtual buffer (the G8 debug session states local Playwright/firefox runs add nothing for the NVDA-layer delta). What it CAN pin is the page-observable contract on both sides: document selection follows ⇒ toolbar + cue (the native-selection-ON condition); no document selection ⇒ structural silence regardless of focus moves (the native-selection-OFF condition). That pins "silence under native-selection-OFF is CORRECT page behavior, not a bug" — pointing any future silent re-run at the NVDA layer/protocol adherence instead of the page.
4. **Zero product risk.** Pointer, sighted-keyboard, Chromium, and VoiceOver paths remain byte-unchanged; no dependency changes.

## Boundary-Spec Semantics (toolbar-mount-selection-gated.spec.ts)

- **Test 1 (selection ⇒ mount + cue — the native-selection-ON condition):** a programmatic in-block selection (the page-visible condition NVDA's native selection mode produces — ArticleView's selectionchange listener has no selection-origin gate, so any non-collapsed in-article range is the same page-observable event) mounts the toolbar (`role="toolbar"`, name "Highlight actions"), AND the toolbar-INTERNAL polite status region (`[role='status']` inside the toolbar root — SelectionToolbar.tsx L222-224, NOT the `announcementRegion` helper, which targets ArticleView's separate D5-12 CRUD region) announces "Highlight actions available." — with region separation asserted: the CRUD announce region does NOT contain the cue (it speaks only on actions; none occurred).
- **Test 2 (no selection ⇒ structural silence — the native-selection-OFF condition):** with NO selection ever created, a keydown-less programmatic focus to the Previous page chevron (`button.page-turn-previous` — the G7-proven browse-mode Tab consequence, still possible with native selection off; zero `page.keyboard` calls anywhere in the test, counter installed in one capture-phase evaluate, focus in a second) plus a 300ms settle window leaves the page structurally silent, asserted IDENTICALLY on every engine: `keydowns` 0, `isCollapsed` true, `toolbarCount` 0, and the cue text exists nowhere in the DOM (the live region renders only inside a mounted toolbar). No engine-keyed split — nothing engine-specific is asserted (no selection ever existed to collapse or keep). This pins WHY the v1.2 protocol fix is a gesture instruction and not a product change: focus moves and settle time can never manufacture a selection-driven mount.
- **Pinning, not TDD:** both tests were green on the current build immediately (6/6 cells, 3 engines) — confirming rather than contradicting the G8 diagnosis, exactly per decision G8-D1.

## Accomplishments

- **UAT G8's three missing items addressed:** (1) protocol v1.2 C1 native-selection instruction + false premise removed → Task 2; (2) older-NVDA F7 fallback + platform-boundary documentation → Task 2 (the new note); (3) re-run prerequisites recorded (below) — ACPT-05 deliberately NOT flipped (13-11/13-12 precedent). The "also consider" guard (analogous doc/test guard) → Task 1, per decision G8-D1.
- **The C1 mount cue now has an automated substrate:** the announce-on-appear contract is pinned both ways (fires on selection-driven mount with region separation; structurally silent without a page-visible selection) — the protocol expectation no longer rests on zero automation.
- **The G8 platform boundary is documented in the protocol with its authoritative sources** (NVDA User Guide §Native Selection Mode + the G8 debug session), so a future silent re-run points at the NVDA layer/protocol adherence instead of triggering another page-side diagnosis cascade.
- **Zero production source changes** (G8-D1 compliance): git diff across the plan's commits touches ONLY the two files_modified paths; src/ and package.json/lockfiles byte-unchanged (T-13-13-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: selection-gated mount/announce boundary e2e spec (both sides of the G8 platform boundary)** - `e38fb43` (test)
2. **Task 2: ACCEPTANCE-PROTOCOL.md Flow C NVDA native-selection-mode correction (v1.1 → v1.2)** - `ba73a7b` (docs)

**Plan metadata:** see final docs commit (this file + STATE.md + ROADMAP.md).

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 1 spec gate | `npx playwright test toolbar-mount-selection-gated.spec.ts` | **6 passed** (chromium/firefox/webkit; green on current build immediately — G8 diagnosis confirmed, not contradicted) |
| Task 1 grep gate | cue-text count ≥ 2 + self-reference + min_lines 120 | **6** cue-text lines, **1** self-reference, **203** lines (all pass) |
| Task 2 NVDA+shift+f10 grep (pre-commit gate) | `rg -c "NVDA\+shift\+f10" docs/ACCEPTANCE-PROTOCOL.md` | **3** lines (callout + C1 + note; ≥ 2 required) |
| Task 2 version grep | `rg -n "\*\*Version\*\* \| 1\.2"` | **L32** |
| Task 2 F7 grep | `rg -c "F7"` | **1** (the fallback note) |
| Task 2 G8 debug-doc grep | `rg -c "g8-toolbar-never-mounts-nvda"` | **2** (callout + note) |
| Task 2 negative grep | `! rg -q "Firefox-native selection"` | **PASS** (false parenthetical gone from the document entirely) |
| Task 2 diff gate (pre-commit timing per plan) | `git diff --stat && git diff docs/ACCEPTANCE-PROTOCOL.md \| grep -c "^[+-]"` | **PASS** (37 +/- lines, observed uncommitted per the 13-11/13-12 gate-timing precedent) |
| Protocol diff discipline | `git diff -U0 docs/ACCEPTANCE-PROTOCOL.md` hunks | confined to **L32 (Version)** + **Flow C** (callout L192, C1 row L196, new note after L207); every other flow/section byte-unchanged; C2/C3 rows untouched |
| Regression net | `npx playwright test tests/e2e/annotations/` | **180 passed** (174 prior + 6 new cells, 3 engines, 0 failed) — toolbar-keydownless-focus.spec.ts and toolbar-tab-path.spec.ts stay green (untouched) |
| Unit sanity | `npm run test:unit -- --run` | **1262 passed / 0 failed / 13 skipped** (documented intentional skips) |
| Zero-product-change proof | `git diff --name-only e38fb43^..ba73a7b` + `git diff … -- src/ package.json package-lock.json` | **exactly the 2 files_modified paths; src/ + lockfiles: 0 diff lines** (G8-D1 + T-13-13-SC compliance) |

## ACPT-05 Re-run Prerequisites (D13-06/D13-07 — read before the re-run)

ACPT-05 stays **Pending**; this plan does NOT flip it. It flips only when the tester's **NVDA+Firefox re-run of Flow C on the v1.2 protocol** lands in **13-VERIFICATION.md §1.3/§1.4** with **zero blocker / zero major** across the full protocol (D13-06/D13-07). The re-run must:

- **(a)** enable Native Selection Mode (**NVDA+shift+f10**, NVDA >= 2024.1 — per-document; NVDA 2026.3+ can make it persistent in Browse Mode settings, still off by default) BEFORE the C1 Shift+arrows selection, or use the documented **F7** caret-browsing fallback on older NVDA;
- **(b)** confirm the residual — NVDA verbalizes the "Highlight actions available." mount announce in browse mode with native selection ON (page-side firing is now pinned by Task 1's spec; only the verbalization needs the human), and keep C1 selections within a single block (a cross-block selection mounts the silent hint variant — no buttons, no announce);
- **(c)** complete C2/C3 as documented in v1.1 (unchanged): NVDA+Space to focus mode, then Tab → Highlight button → Enter.

Boundary note for the tester: with Native Selection Mode OFF (any default NVDA), browse-mode selections exist only in NVDA's virtual buffer — the page's document selection never changes, so no toolbar can mount and no page-side code can observe the selection. That is the documented platform boundary, not a product defect.

## Files Created/Modified

- `tests/e2e/annotations/toolbar-mount-selection-gated.spec.ts` - NEW (203 lines): the selection-gated mount/announce boundary pin — Test 1 (selection ⇒ toolbar + toolbar-internal cue announce + CRUD-region separation) and Test 2 (no selection ⇒ zero keydowns + collapsed selection + toolbar count 0 + cue absent from the DOM, identical on every engine); reuses `_fixtures.ts` helpers wholesale (wipeDatabase/openArticle/FIXTURES/findFirstBlockWithText/selectRangeInBlock/announcementRegion — no forked harness); FIXTURE = FIXTURES[0] (essay-long-form), paginated default mode, no switchMode; header states the G8 provenance, the layer honesty (the NVDA virtual buffer is not Playwright-emulatable), and the boundary-pinning-not-TDD gate
- `docs/ACCEPTANCE-PROTOCOL.md` - v1.1 → v1.2; header Version, Flow C callout G8 precondition append, C1 keyboard-sequence NVDA sub-clause replaced (native-selection-first instruction; false Firefox-native parenthetical removed), C1 expected-outcome page-visible clause, new four-part note (WHY / WHAT TO DO / FALLBACK / RE-RUN READING AID) after the sighted-keyboard convenience note; C2/C3 and every other flow byte-unchanged

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** none — zero files outside files_modified, zero dependency changes, zero production source changes.

## Authentication Gates

None.

## Known Stubs

None — no stubs, placeholders, or unwired data paths (test + docs only).

## Threat Flags

None — docs + test-only change; zero runtime code, zero dependencies, zero data paths touched (matches the plan's threat model: all dispositions accept, nothing new introduced).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G8's three missing items are all addressed; the annotations e2e directory (180 cells) and unit suite are green; no file outside files_modified changed; zero production source changes.
- ACPT-05 remains Pending on the human NVDA+Firefox re-run of Flow C on protocol v1.2 (prerequisites above). Phase 13 gap closure G8 is complete at the documentation + automation level; with 13-13 complete, all 13 plans of Phase 13 have summaries.
- No open blockers from this plan.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-22*

## Self-Check: PASSED

Created file exists on disk (tests/e2e/annotations/toolbar-mount-selection-gated.spec.ts, 203 lines); both task commits (e38fb43, ba73a7b) present in git log; all verification gates re-run and green at close-out (spec 6/6 cells, annotations directory 180/180, unit 1262/0/13, zero-src-diff proof).
