---
phase: 18-reader-orientation
verified: 2026-08-30T19:12:13Z
status: verified
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Navigate the TOC panel with a real screen reader (VoiceOver+Safari and/or NVDA+Firefox): open the panel from the header trigger, traverse the nested list, confirm the current entry's state is conveyed, and activate an entry."
    expected: "The nav is announced as a labeled list ('Table of contents'), heading levels/nesting are conveyed, aria-current emphasis is exposed, and activation moves focus to the destination heading with a clear announcement."
    why_human: "SC3/ORNT-04 claims screen-reader usability; RTL + AxeBuilder prove the automatable subset (semantic markup, zero serious/critical violations) but actual SR announcement behavior cannot be verified programmatically."
  - test: "Reopen an article with a saved location while a screen reader is active and listen through the ~4s marker window."
    expected: "'Returned to where you left off.' is announced politely exactly once, without interrupting reading or blocking page turns; the bar fades without motion under reduced-motion settings."
    why_human: "SC5/ORNT-06 non-intrusiveness for SR users is a live-region reception quality; unit/e2e prove the region's attributes and timing, not the SR experience."
  - test: "On Firefox and WebKit with a physical keyboard, Tab from inside the open TOC panel and press Escape."
    expected: "Esc always closes the panel and restores focus to the trigger (the universal escape). Confirm the documented per-engine Tab shapes are acceptable in practice: Firefox keeps sequential focus on visible panel entries; WebKit's first Tab leaves the panel to body."
    why_human: "Top-layer popover sequential-focus semantics diverge per engine (deferred-items.md finding #1, probed on Playwright 1.61.1). The e2e cells assert the honest per-engine shapes, but whether the divergence creates real keyboard-user friction needs human judgment."
human_verification_completed: 2026-08-30T19:50:00Z
human_verification_result: "3/3 pass — UAT 18-UAT.md Tests 1-3 (SR TOC navigation, SR restoration announce, real-keyboard Tab/Esc Firefox+WebKit) all confirmed by the developer. No code changes were required."
---

# Phase 18: Reader Orientation Verification Report

**Phase Goal:** Readers navigate document structure without unstable page/DOM identities or intrusive restoration UI.
**Verified:** 2026-08-30T19:12:13Z
**Status:** verified (human verification completed 2026-08-30T19:50:00Z — 3/3 pass via 18-UAT.md)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap Success Criteria are the contract; plan-level truths (18-01..18-04 frontmatter, 23 truths) were checked as supporting detail and all corroborate — none reduced scope.

| # | Truth (Roadmap SC) | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reader can open a labeled canonical-heading table of contents and jump to a structural location. (ORNT-01) | ✓ VERIFIED | `TocPanel.tsx` (popover="manual", h2 "Contents", `nav aria-label="Table of contents"`) + `Header.tsx` toc-trigger (aria-label/aria-expanded, articleMounted-gated, first in group) + `App.tsx` tocOpen threading + `handleTocJump`. Behavioral: toc-navigation cells (a),(c),(c-cont),(k) — **15/15 passed on chromium in this verification run**; recorded 3-engine gate (45/45). |
| 2 | The same destination lands correctly in scrolling and paginated modes. (ORNT-03) | ✓ VERIFIED | Destinations are D-05 grapheme offsets only: `deriveToc` reads `articleGraphemeIndex().blockStartOffsets` (toc.ts L84, L119 — no forked math); `handleTocJump` uses `fragmentContainingOffset`→`turnToPage` / `findScrollTarget`→`scrollIntoView` (ArticleView L2015-2028). Zero persisted page numbers/DOM ids. Behavioral: cells (e),(n) cross-mode equivalence passed this run. |
| 3 | Skipped and duplicate heading levels remain semantic and usable by keyboard and screen reader. (ORNT-04) | ✓ VERIFIED | `deriveToc` depth stack: skip = parent.depth+2, zero invented entries (toc.ts L101-124); duplicates pass through AS-IS (L116). TocPanel renders nested semantic `ul` with real `<a>` links, `li[data-depth]`, `aria-current="true"` token. Behavioral: cells (g) skip-nests-no-intermediate, (h) duplicates-each-land, (i) h5/h6 levels-verbatim, chapter (j) — all passed this run; unit suite 14 invariants + 10 RTL cells green; AxeBuilder zero serious/critical. SR usability routed to Human Verification. |
| 4 | At narrow widths or high zoom, opening or closing the TOC neither obscures content, changes logical location, nor traps focus. (ORNT-05) | ✓ VERIFIED | Fixed-position overlay only (`.toc-panel` never resizes the article column); open-scroll is panel-owned `offsetTop/scrollTop` arithmetic (TocPanel L178-181 — no ancestor-scrolling method); ONE toggle seam restores focus on every close path (ArticleView L444-500). Behavioral: **toc-geometry 9/9 passed on chromium this run** (D6-09 invariant open+closed at 320×640/320×800, no-trap at rail+sheet, location byte-stability with zero diagnostics, 5-button ≥44px no-wrap, staged collapse reachable + un-clip, axe clean). Recorded 3-engine gate green. Per-engine top-layer Tab divergence is a documented platform constraint (see Warnings) — Esc-close+focus-restore asserted universal. |
| 5 | Reopening communicates restored location without shifting content, blocking page turns, or requiring dismissal. (ORNT-06) | ✓ VERIFIED | `RestorationMarker.tsx`: absolutely-positioned 4px bar, `pointerEvents:"none"`, CSS-transition-only fade (3400ms/4000ms, reduced-motion gate), polite announce verbatim carry-forward; mount gated on genuine restore-landing via one-shot `restorationMarkerArticleRef` (both branches, ArticleView L1690/L1720 — first-open-null, TOC jumps, and jumpPendingRef deep-links can never mount it). Banner fully retired: `ResumeBanner.tsx` deleted, grep `resume-banner\|Resume reading\|Start from top` over src/+tests/ → **zero hits**, announce string exactly once in src/. Behavioral: **restoration-cue 9/9 passed on chromium this run** (marker-at-block/page-edge, transient, first-open silence, no-shift, no-dismissal, page-turns-unblocked, reduced-motion instant clear); paginated save/restore cells in persistence.spec (recorded 27/27). |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified — every behavior-dependent truth has a passing behavioral test executed in this verification: 33 e2e cells on chromium + 29 unit tests, corroborated by the recorded full 3-engine gate)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/content/toc.ts` | Pure TOC derivation (`deriveToc`, `TocEntry`) | ✓ VERIFIED | 128 lines, substantive (depth-stack, Top sentinel, blockStartOffsets O(1) lookup), imports `articleGraphemeIndex` — no forked offset math, no DOM/React/persistence |
| `src/reader/sectionSpy.ts` | Selector-parameterized shared scroll-spy | ✓ VERIFIED | 223 lines; selector is a parameter (no hardcoded set); optional `mode:"paginated"` branch (fragment-first-heading + MutationObserver); scrolling branch byte-identical shape; full cleanup both branches |
| `src/reader/TocPanel.tsx` | Non-modal popover=manual panel | ✓ VERIFIED | 257 lines; `popover="manual"`, NO role="dialog"/aria-modal/aria-haspopup anywhere; `aria-current="true"` token; headingless note; Esc→hidePopover |
| `src/reader/RestorationMarker.tsx` | Transient passive marker + announce | ✓ VERIFIED | 170 lines; role=status/polite/atomic + verbatim copy; timers cleaned; zero rAF style writes; honest null-geometry degradation |
| `src/reader/ResumeBanner.tsx` | DELETED | ✓ VERIFIED | Absent from disk; retirement grep clean |
| `src/reader/useScrollSave.ts` | Paginated save scheduler | ✓ VERIFIED | Returns stable `scheduleLocationSave`; same 1200ms debounce + dual flush + LocationRecord shape; `saveLocation` call family singular (grep: only useScrollSave.ts) |
| `src/reader/SectionAnnouncer.tsx` | Consumes shared spy byte-stably | ✓ VERIFIED | Consumes `useSectionSpy` with "h2, h3, h4"; `Section: {text}.` string intact; no inline IO wiring |
| `tests/unit/toc.test.ts` | Derivation invariants | ✓ VERIFIED | 216 lines, 14 tests — passed this run |
| `tests/unit/TocPanel.test.tsx` | RTL component suite | ✓ VERIFIED | 305 lines, 10 tests — passed this run |
| `tests/unit/RestorationMarker.test.tsx` | Lifecycle/passivity suite | ✓ VERIFIED | 180 lines, 5 tests — passed this run |
| `tests/e2e/toc/_corpus.ts` | Seeded corpus (skip/dupes/h5-h6/chapter) | ✓ VERIFIED | 205 lines; all four shapes via `ArticleSchema.parse` in Node; chapter carries denormalized bookId post-parse; never deleteDatabase |
| `tests/e2e/toc/toc-navigation.spec.ts` | Core + corpus cells | ✓ VERIFIED | 812 lines; cells (a)-(f) + (g)-(n) — 15/15 chromium this run |
| `tests/e2e/toc/toc-geometry.spec.ts` | ORNT-05 edge matrix | ✓ VERIFIED | 494 lines; `assertEdgeInvariant` on OPEN panel (6 uses), AxeBuilder cell — 9/9 chromium this run |
| `tests/e2e/toc/restoration-cue.spec.ts` | Marker lifecycle both modes | ✓ VERIFIED | 470 lines; scrolling + paginated describes — 9/9 chromium this run |
| `src/app.css` additions | Panel/trigger/marker/collapse styles | ✓ VERIFIED | `.toc-panel/.toc-title/.toc-list/.toc-empty/.toc-trigger/.toc-destination`, ≤420px clip-based collapse + `:focus-visible` un-clip, `.restoration-marker` + `.is-fading` + forced-colors — existing tokens only, zero motion on toc-* |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/content/toc.ts` | `src/content/normalizeText.ts` | `articleGraphemeIndex` substrate | ✓ WIRED | toc.ts L35 import, L84/L119 lookup — identical prefix-sum read as anchor.ts |
| `src/reader/TocPanel.tsx` | `src/content/toc.ts` | `deriveToc(article)` entries | ✓ WIRED | L44-45 import, L117 `useMemo(() => deriveToc(article))` |
| `src/reader/TocPanel.tsx` | `src/reader/sectionSpy.ts` | shared detection, selector "h2, h3, h4, h5, h6" | ✓ WIRED | L46 import, L128-136 — data-block-index → aria-current mapping |
| `src/routes/ArticleView.tsx` | `src/pagination/anchor.ts` | `fragmentContainingOffset` → `turnToPage` | ✓ WIRED | L64 import; jump L2019-2020; paginated restore L1682-1687 (bounded RETRY_CAP_MS 5000 retry) |
| `src/routes/ArticleView.tsx` | `src/reader/restoreLocation.ts` | `findScrollTarget` → `scrollIntoView` | ✓ WIRED | L31 import; jump L2025-2026; scrolling restore L1710-1716 (branch byte-stable) |
| `src/routes/ArticleView.tsx` | `src/reader/useScrollSave.ts` | `scheduleLocationSave` per-turn saves | ✓ WIRED | L578 capture; `handleAnchorChange` feeds it (L656); call family singular |
| `src/reader/Header.tsx` | `src/reader/TocPanel.tsx` | controlled open state, one toggle seam | ✓ WIRED | Header toc-trigger L196-206 (first, no aria-haspopup); ArticleView seam L427-500 (ONE toggle listener, width-scoped pointerdown, trigger-scoped Esc); `onActivate={handleTocJump}` mount L2622-2629 with live `mode` |
| `tests/e2e/toc/toc-geometry.spec.ts` | `tests/e2e/_edge-invariant.ts` | `assertEdgeInvariant` on open state | ✓ WIRED | 6 uses incl. OPEN panel at both edge viewports |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| TocPanel | `entries`/`tree` | `deriveToc(article)` ← CanonicalArticle prop ← ArticleView's Dexie-loaded article | Yes — live heading blocks, zero hardcoding | ✓ FLOWING |
| aria-current mapping | `currentBlockIndex` | shared spy's live heading element `data-block-index` | Yes — driven by real scroll/page turns (e2e cell (l)) | ✓ FLOWING |
| RestorationMarker | `offset` | saved `LocationRecord.graphemeOffset` via `loadLocation` (IndexedDB) | Yes — seeded-record e2e cells prove both modes | ✓ FLOWING |
| Header trigger | `tocOpen` | App state, articleMounted gate | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase unit suites (toc + TocPanel + RestorationMarker) | `npx vitest run tests/unit/toc.test.ts tests/unit/TocPanel.test.tsx tests/unit/RestorationMarker.test.tsx` | 29/29 passed (1.32s) | ✓ PASS |
| TOC navigation matrix (open/jump/focus, both modes, skips/dupes/h5-h6/chapter/headingless, aria-current, no-re-route, cross-mode equivalence) | `npx playwright test tests/e2e/toc/toc-navigation.spec.ts --project=chromium` | 15/15 passed (11.0s) | ✓ PASS |
| Geometry edge matrix (320px/400%, no-trap, location stability, collapse, axe) + restoration cue (both modes, reduced motion) | `npx playwright test tests/e2e/toc/toc-geometry.spec.ts tests/e2e/toc/restoration-cue.spec.ts --project=chromium` | 18/18 passed (19.1s) | ✓ PASS |
| TypeScript gate after orchestrator fix 4a3969f | `npx tsc --noEmit` | exit 0 — fully clean (Phase 17 parked item resolved) | ✓ PASS |
| Banner retirement grep gate | `grep -rn "resume-banner\|Resume reading\|Start from top" src tests` | zero hits | ✓ PASS |
| Announcer byte-stability (Pitfall 5) | `git diff dbb7897^..HEAD --stat -- tests/e2e/section-announce.spec.ts` | empty diff — spec untouched across the entire phase | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist or were declared for this phase; the phase's runnable gate is the test suite, spot-checked above (full-matrix `npm run test` exit 0 is recorded in 18-04-SUMMARY with literal counts — unit 1373/0/13, e2e 1431/0/10 — and corroborated by this verification's direct runs).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| ORNT-01 | 18-02, 18-04 | Labeled TOC opens + jump | ✓ SATISFIED | Cells (a),(c),(k); trigger never peekaboo |
| ORNT-03 | 18-02, 18-04 | Canonical destinations, both modes, no page/DOM identity | ✓ SATISFIED | blockStartOffsets currency; cells (e),(n); no persisted page numbers |
| ORNT-04 | 18-01, 18-02, 18-04 | Levels preserved, skips/duplicates semantic, keyboard + SR | ✓ SATISFIED (SR → human item) | 14 unit invariants + cells (g)-(j) + axe; SR check in Human Verification |
| ORNT-05 | 18-02, 18-04 | Narrow/zoom: no obscure, no location change, no trap | ✓ SATISFIED | 9 geometry cells; Esc universal escape |
| ORNT-06 | 18-03, 18-04 | Passive reopen cue, no shift/block/dismiss | ✓ SATISFIED | 9 restoration cells + gating verified in code |

Orphan check: ORNT-02 (line-focus aid) is listed under **Future Requirements** in REQUIREMENTS.md — intentionally out of this milestone, not phase-mapped. No phase-18 orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None: zero TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers across all 13 phase-touched source/test files; no stub returns; no hardcoded empty props; headingless note is honest empty-state UI, not a stub (data-backed by `entries.length === 1`) | ℹ️ Info | None |

### Warnings (documented platform constraints — not gaps)

1. **Top-layer popover sequential-focus divergence** (deferred-items.md #1): Tab semantics from inside the `popover="manual"` panel differ per engine (chromium flows to page; webkit leaves to body; firefox scopes within the popover). Probed on the exact Playwright 1.61.1 matrix; `toc-geometry.spec.ts` asserts the honest per-engine shapes and **Esc-close + focus-restore is asserted universal on all three engines**, so SC4's "nor traps focus" holds (focus is always escapable). Not fixable in app code without abandoning the locked popover=manual decision. Surfaced as human-verification item 3 for real-keyboard judgment.
2. **WebKit skips clipped targets in sequential navigation** (deferred-items.md #2): at ≤420px the collapsed shell-nav links are not Tab-reachable on webkit (chromium/firefox reach and un-clip them). The staged-collapse cell carries webkit reachability via programmatic focusability per the repo's back-nav.spec precedent. Acceptable documented constraint; revisit if webkit keyboard users report it.
3. **Honest-gate environment note** (deferred-items.md #3): four red full-suite runs under external CPU load (rotating webkit-only failures, all isolation-green) before the green `--workers=4` full-matrix run. Process note only — the green gate ran every spec on every engine.
4. **Header box is 49px (48px + 1px hairline)** — the no-wrap assertion allows ≤49.5px; the 48px design constant (sentinel math, offsets) is preserved. Calibrated honesty, not drift.

### Human Verification Required

### 1. Screen-reader navigation of the TOC panel

**Test:** Navigate the TOC panel with a real screen reader (VoiceOver+Safari and/or NVDA+Firefox): open the panel from the header trigger, traverse the nested list, confirm the current entry's state is conveyed, and activate an entry.
**Expected:** The nav is announced as a labeled list ("Table of contents"), heading levels/nesting are conveyed, aria-current emphasis is exposed, and activation moves focus to the destination heading with a clear announcement.
**Why human:** SC3/ORNT-04 claims screen-reader usability; RTL + AxeBuilder prove the automatable subset, but actual SR announcement behavior cannot be verified programmatically.

### 2. Screen-reader reception of the restoration announce

**Test:** Reopen an article with a saved location while a screen reader is active and listen through the ~4s marker window.
**Expected:** "Returned to where you left off." is announced politely exactly once, without interrupting reading or blocking page turns; the bar fades without motion under reduced-motion settings.
**Why human:** SC5/ORNT-06 non-intrusiveness for SR users is live-region reception quality; tests prove the region's attributes and timing, not the SR experience.

### 3. Real-keyboard top-layer Tab behavior on Firefox/WebKit

**Test:** On Firefox and WebKit with a physical keyboard, Tab from inside the open TOC panel and press Escape.
**Expected:** Esc always closes and restores focus to the trigger. Confirm the documented per-engine Tab shapes are acceptable in practice.
**Why human:** Top-layer focus semantics diverge per engine (probed); whether the divergence creates real keyboard-user friction needs human judgment (candidate ACPT matrix item per deferred-items.md).

### Gaps Summary

No gaps. All 5 roadmap success criteria are verified with codebase evidence at every level (existence, substance, wiring, data flow) and direct behavioral test executions in this verification (33 e2e cells + 29 unit tests on chromium, all green; tsc clean; all grep gates clean; announcer spec byte-stable across the phase). The three 18-04 deferred findings are documented browser-platform/process constraints with honest in-spec assertions — none contradicts a success criterion given the universal Esc escape — and the pre-existing Phase 17 TS error was resolved by orchestrator commit 4a3969f (verified: `npx tsc --noEmit` exit 0).

Status was `human_needed` solely for the three screen-reader/real-keyboard items above (SC3 names screen readers explicitly; SC4's engine-divergent Tab flavor benefits from human judgment). **Resolved 2026-08-30T19:50:00Z:** the developer completed all three human checks via UAT (18-UAT.md Tests 1-3, 3/3 pass, zero issues) — SR TOC navigation, SR restoration announce, and real-keyboard Tab/Esc on Firefox+WebKit all confirmed as specified. No code changes were required.

---

_Verified: 2026-08-30T19:12:13Z_
_Verifier: the agent (gsd-verifier)_
_Human verification: developer UAT — 18-UAT.md, 2026-08-30T19:50:00Z_
