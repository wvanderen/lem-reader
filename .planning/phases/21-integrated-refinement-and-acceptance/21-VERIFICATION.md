---
phase: 21-integrated-refinement-and-acceptance
verified: 2026-09-01T17:09:16Z
status: human_needed
score: 0/5 must-haves verified
behavior_unverified: 5 # All five roadmap SCs assert browser-runtime behavior (geometry, rendered width, computed style, cross-machine data preservation, matrix runs); every static level verified and unit-provable behaviors re-proved in-process — the runtime clauses are exercised only by e2e instruments that cannot run in the verifier's process (dev-server dependency)
overrides_applied: 0
behavior_unverified_items:
  - truth: "Tag menus stay adjacent to their trigger and visible as geometry changes, then restore focus when closed"
    test: "Run npx playwright test tests/e2e/chrome/tag-menu-geometry.spec.ts (fresh dev server), or browser spot-check: open the tag popover at 1280x800, resize to 360x640 with it open, open at 240x600, then Esc- and light-dismiss-close it"
    expected: "Popover hugs the trigger (adjacent below at its inline-end, 4px gap) at every geometry, stays fully in-viewport at 240px, and focus returns to the trigger on close (webkit: focus not trapped in the closed surface)"
    why_human: "Rendered geometry and the focus-restoration state transition are runtime browser behavior; presence checks see the CSS anchor declarations (verified) but not the resolved boxes or focus moves, and the e2e instrument needs a dev server"
  - truth: "Reading width reaches a truthful 64-character maximum at the visual and programmatic far-right endpoint"
    test: "Run npx playwright test tests/e2e/typography-live-apply.spec.ts (truthful-measure describe), or browser spot-check: drag the Reading width slider to far-right in scrolling and paginated mode"
    expected: "Surface content width equals a 64-zero-glyph ruler within 1px in BOTH modes; aria-valuemax=64, aria-valuenow=64, readout 'Reading width 64 ch' (far-left: aria-valuemin=40, --measure 40ch)"
    why_human: "The programmatic half is presence-verified (MEASURE_STEPS [40,46,52,58,64], schema union, aria derivation) and the clamp/seam behavior is unit-proven in-process (23/23), but rendered-pixel equality is browser-only truth the verifier cannot exercise"
  - truth: "Highlights respects the shared grid and offers clear Library and article-context navigation"
    test: "Run npx playwright test tests/e2e/review-panel, or browser spot-check the Highlights destination"
    expected: "Section h2 computes 22px/600/1.3, rows compute 24px lg padding, every confident row shows the jump glyph and activates the whole-row jump to article context; glyph absent on orphan/disabled rows; BackToLibrary returns to the prior Library context"
    why_human: "Computed-style conformance and jump activation are runtime DOM behavior; the glyph component, conditional render, CSS tokens, and citation discipline are presence-verified, the recorded runs are green, but the verifier cannot render the surface"
  - truth: "The complete v2.1 core flow succeeds without loss in Chromium, Firefox, and WebKit"
    test: "Run npx playwright test tests/e2e/portability/v21-core-flow-spine.spec.ts (fresh dev server; webkit reports the documented D21-11 skip)"
    expected: "One unbroken two-context journey passes on chromium + firefox: raw IndexedDB rows (articles, highlights, notes, locations, settings, books, asset rows) byte-equal after export → wipe → import; the cross-block highlight re-resolves confident and renders both slices"
    why_human: "The no-loss claim is a state-preservation invariant across an operation sequence on real browser storage; the spine instrument is verified present/substantive/wired (774 lines, one journey test, two contexts), but running it needs a dev server and real browser engines"
  - truth: "The Impeccable-informed audit and keyboard, NVDA, VoiceOver, reduced-colors [sic: forced-colors], reflow, and zoom matrix finish with no blocker or major finding"
    test: "(a) Re-run the automated arms: npx playwright test tests/e2e/forced-colors.spec.ts tests/e2e/reduced-motion.spec.ts tests/e2e/reflow.spec.ts tests/e2e/high-zoom.spec.ts tests/e2e/touch-targets.spec.ts tests/e2e/panel-keyboard.spec.ts; (b) complete BOTH human SR sessions per 21-USER-SETUP.md (items 1–2 below)"
    expected: "(a) All six specs green across chromium/firefox/webkit (recorded: 213/0 + full-suite 1722/0/16); (b) NVDA+Firefox and VoiceOver+Safari protocol v1.3 runs land zero blocker / zero major — ACPT-08 flips only then, via /gsd-verify-work 21"
    why_human: "The audit artifact half is fully verified (zero open P0/P1, remediation in place); the matrix-arm green runs are recorded but not re-runnable in-process, and the NVDA/VoiceOver arms are locked human-run sessions on real hardware that have NOT yet run (21-USER-SETUP.md status: Incomplete)"
human_verification:
  - test: "Run protocol v1.3 on NVDA + Firefox (Windows hardware, off-machine): flows A–L + the 5 exploratory charters; record in the §6 NVDA+Firefox results sheet"
    expected: "Zero blocker / zero major findings (D13-06/D13-07 fix-then-re-run policy otherwise); results land in this verification ledger via /gsd-verify-work 21"
    why_human: "Real screen reader on real hardware — explicitly locked to a human arm by the phase contract (ACPT-08 flip condition); no automation can substitute"
  - test: "Run protocol v1.3 on VoiceOver + Safari (macOS), then the D21-12 sighted image pass in the same session: save an article with images (EPUB upload), reopen offline, export, import, verify figures render + decode locally"
    expected: "Zero blocker / zero major findings; D21-12 evidence recorded in the VO+Safari results sheet's D21-12 row"
    why_human: "Real screen reader on real Safari (the e2e matrix uses Playwright WebKit, not Safari) plus a sighted image-flow pass — locked human arm"
  - test: "Behavior spot-check: tag-menu geometry across engines (behavior_unverified_items[0])"
    expected: "Adjacency, resize-follow, 240px viewport-keep, and focus-restore hold as specified"
    why_human: "Runtime geometry + focus state transition; verifier cannot run the playwright instrument without starting a dev server"
  - test: "Behavior spot-check: truthful-64 at the far-right endpoint in both reading modes (behavior_unverified_items[1])"
    expected: "Visual ruler equality within 1px; aria and readout agreement at 64 (and 40 at far-left)"
    why_human: "Rendered-width truth is browser-only; programmatic half and seam behavior already verified"
  - test: "Behavior spot-check: Highlights glyph/conformance/jump (behavior_unverified_items[2])"
    expected: "Computed 22px h2 / 24px row padding; glyph on exactly the confident rows; jump and BackToLibrary behave"
    why_human: "Computed-style and activation behavior are runtime DOM truth"
  - test: "Behavior spot-check: v2.1 core-flow spine on chromium/firefox (webkit documented skip) (behavior_unverified_items[3])"
    expected: "2 passed + 1 documented webkit skip, exit 0; byte-equal restoration incl. asset rows"
    why_human: "Cross-machine IndexedDB state-preservation invariant needs real browser engines and a dev server"
  - test: "Behavior spot-check: six-spec edge matrix across the four destinations (behavior_unverified_items[4])"
    expected: "213/0 exit 0 as recorded (or equivalent green); no weakened assertions"
    why_human: "Matrix green runs are recorded in the honest-gate ledger but not reproducible in the verifier's process"
---

# Phase 21: Integrated Refinement and Acceptance Verification Report

**Phase Goal:** Readers experience a cohesive, corrected application proven across the full browser and accessibility matrix.
**Verified:** 2026-09-01T17:09:16Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tag menus stay adjacent to their trigger and visible as geometry changes, then restore focus when closed | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | CSS anchor positioning present and correct: `.tags-trigger { anchor-name: --tags-trigger }` (app.css L1940) + `.tag-popover` with `position-anchor`/`position-area: block-end span-inline-end`/`position-try-fallbacks: flip-block, flip-inline`/`inset: auto`/`margin: var(--space-xs)`/`box-sizing: border-box` width cap; old header-fixed insets deleted (grep `top: calc`/`inset-inline-end` in block = 0). Instrument: `tests/e2e/chrome/tag-menu-geometry.spec.ts` (282 lines; adjacency boundingBox, setViewportSize 1280→360 resize-follow, 240×600 viewport-keep, Esc + light-dismiss focus-restore with webkit-divergent branch L98-104). Prohibitions verified: zero JS listeners (diff empty on Header/ArticleView), TocPanel/TagEntry untouched, zero motion properties. Runtime geometry/focus not exercisable in verifier process — see Human Verification #3 |
| 2 | Reading width reaches a truthful 64-character maximum at the visual and programmatic far-right endpoint | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Programmatic half VERIFIED: `MEASURE_STEPS = [40, 46, 52, 58, 64]` (tokens.ts L37); schema union 40/46/52/58/64, `literal(72)` count 0 (schema.ts L368-374); SettingsPanel untouched (empty diff — aria derives from array ends); e2e asserts aria-valuemax/now 64 + readout + 40ch floor. Seam safety behaviorally proven IN-PROCESS: `tests/unit/settings/measure-clamp.test.ts` **23/23 passed** (legacy 72→64 calm at Dexie/mirror/import seams + paint-hint sync-check; garbage 71/string/null → corrupt/null). All 4 seams wired: settingsStore L68, settingsMirror L50, ExportImportService L320(+L374 manifest tolerance), index.html L50/L93-96. Visual ruler clause (`.repeat(64)` probe, ≤1px, both surfaces — typography-live-apply L135/L145/L219) is browser-only — see Human Verification #4 |
| 3 | Highlights respects the shared grid and offers clear Library and article-context navigation | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `JumpToArticleIcon` present in ReviewView.tsx (viewBox 0 0 24 24, aria-hidden, focusable="false", L145-157), rendered only when `jumpable` (`entry.status === "confident" && entry.article !== undefined`, L209/L224-227); aria-label/disabled logic lines unchanged (diff touches comments only). CSS conformance present: `.review-row { padding: var(--space-lg) }`, `.review-section h2` no font-size override (22px register inherited), 4× D21-07 citations, single-column `.review-section-list` kept + cited, one hover selector `var(--accent)`, 0 transition/animation in review region; Library nav = App.tsx BackToLibrary affordance + shell-nav. Computed-style/jump activation cells recorded green (99/99 ×3 engines) but not re-runnable in-process — see Human Verification #5 |
| 4 | The complete v2.1 core flow succeeds without loss in Chromium, Firefox, and WebKit | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Instrument verified at all levels: `tests/e2e/portability/v21-core-flow-spine.spec.ts` (774 lines ≥150; exactly one journey test L230; `test.setTimeout(120_000)` L250; two `browser.newContext()` L252-253; `selectRangeBetweenBlocks` imported from `../annotations/_fixtures` L89; webkit `test.skip` citing Phase 20 deferred-items L246-248; `waitForTimeout` count 0). zipSlip lint closure behaviorally proven IN-PROCESS: `npx eslint src/portability/zipSlip.ts` **exit 0** (exactly 2 justified `no-control-regex` directives L34/L77; no escaped forward-slash) + `tests/unit/portability/zip-slip.test.ts` **21/21 passed**. Byte-stability prohibitions verified (ACPT-06 template + 5 webkit skip sites + both zip-slip nets: empty diff). The no-loss journey itself needs real engines — see Human Verification #6 |
| 5 | The Impeccable-informed audit and keyboard, NVDA, VoiceOver, reduced-motion, forced-colors, reflow, and zoom matrix finish with no blocker or major finding | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Audit half VERIFIED: `21-AUDIT-FINDINGS.md` (85 lines ≥60) — Anti-Patterns verdict, all 5 dimension sections + scores, D21-10 severity legend, findings F-1..F-5 each with location/severity/standard/recommendation/status; **zero open P0/P1** (F-1 P1 fixed in-phase: `::placeholder { color: var(--ink-soft); opacity: 1 }` present app.css L163-166, color-only diff); minors ledgered in `deferred-items.md` (P2 + 3×P3). Automated matrix instruments VERIFIED: `_edge-invariant.ts` exports both `assertEdgeInvariant` (L100) and `assertDestinationInvariant` (L344) + `DESTINATIONS`/`openEdgeDestination`; all 5 edge specs carry destination cells (7 refs each) as **pure additions** (numstat: 0 deletions ×5); panel-keyboard "Destination keyboard arm" describe (L266); `.review-select` WebKit hit-area fix present (height: var(--touch), citation-commented). `check-no-danger` exit 0 in-process. Matrix green runs recorded (213/0; full suite 1722/0/16) but not re-runnable in-process; **NVDA + VoiceOver human sessions have NOT run** (21-USER-SETUP.md status: Incomplete) — see Human Verification #1, #2, #7 |

**Score:** 0/5 truths verified (5 present, behavior-unverified — every static level passed; the runtime clauses await the recorded human/browser spot-checks this acceptance phase was designed around)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/settings/legacyMeasure.ts` | LEGACY_MEASURE single-entry map + clampLegacyMeasure | ✓ VERIFIED | Frozen `{72: 64}` (exactly one key), STATE-04 header, spread-copy clamp; imported at all 3 seams |
| `src/settings/tokens.ts` | MEASURE_STEPS five-step range | ✓ VERIFIED | `[40, 46, 52, 58, 64]` L37, default index 4 |
| `tests/unit/settings/measure-clamp.test.ts` | Three-seam clamp proof + paint-hint sync | ✓ VERIFIED (behavioral) | 402 lines; **23/23 passed in verifier process** |
| `src/app.css` `.tags-trigger`/`.tag-popover` | Anchor-positioned tag menu (D21-05) | ✓ VERIFIED | All anchor declarations present; old insets deleted; border-box width cap; zero motion |
| `tests/e2e/chrome/tag-menu-geometry.spec.ts` | Cross-engine geometry proof ≥80 lines | ✓ VERIFIED | 282 lines; adjacency/resize/240px-keep/focus-restore cells; webkit-divergent branch |
| `src/routes/review/ReviewView.tsx` | JumpToArticleIcon glyph component | ✓ VERIFIED | Correct anatomy; conditional on `jumpable` only; decorative (aria-hidden/focusable=false) |
| `src/app.css` `.review-*` | Token conformance + D21-07 citations | ✓ VERIFIED | lg padding, no h2 font-size, 4 citations, accent hover, 0 motion in region |
| `21-AUDIT-FINDINGS.md` | Audit report ≥60 lines | ✓ VERIFIED | 85 lines; verdict, 5 dimensions, legend, statuses, remediation gate; zero open P0/P1 |
| `deferred-items.md` | Minors ledger with severity | ✓ VERIFIED | P2 (hairline 1.4.11) + 3×P3, each with location/recommendation/mitigations |
| `tests/e2e/portability/v21-core-flow-spine.spec.ts` | ACPT-07 spine ≥150 lines | ✓ VERIFIED | 774 lines; one journey; two contexts; documented webkit skip; zero fixed sleeps |
| `src/portability/zipSlip.ts` | D21-15 lint closure, behavior-identical | ✓ VERIFIED (behavioral) | eslint exit 0 (2 justified directives); zip-slip unit net 21/21 in-process |
| `tests/e2e/_edge-invariant.ts` | assertDestinationInvariant export | ✓ VERIFIED | Exports both wrappers + DESTINATIONS + openEdgeDestination; assertEdgeInvariant assertions untouched |
| `docs/ACCEPTANCE-PROTOCOL.md` | Protocol v1.3 | ✓ VERIFIED | Version 1.3 (L36); flows A–L (6 new capability flows G–L incl. Add-dialog Phase 16 deferral retirement L339-345); 5 charters intact; results location → 21-VERIFICATION.md (L39) — this ledger |
| `21-USER-SETUP.md` | Two human SR sessions declared | ✓ VERIFIED | NVDA+Firefox + VoiceOver+Safari (+D21-12 sighted image pass); status honestly Incomplete |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| settingsStore.ts | legacyMeasure.ts | `safeParse(clampLegacyMeasure(` | ✓ WIRED | L68 exact pattern match |
| settingsMirror.ts | legacyMeasure.ts | clampLegacyMeasure | ✓ WIRED | L50 |
| ExportImportService.ts | legacyMeasure.ts | clampLegacyMeasure at import seam | ✓ WIRED | L320 + back-mapped hash tolerance L374 |
| index.html | tokens/legacyMeasure | paint-hint `--measure` write through inline map | ✓ WIRED | Marker-comment copy L49-51; write L93-96; sync-check unit-green |
| `.tags-trigger` | `.tag-popover` | anchor-name/position-anchor pair | ✓ WIRED | Document-scoped pair present; DOM-split non-issue per design |
| ReviewView row button | article context | whole-row hash jump + visible glyph | ✓ WIRED | Glyph inside confident row button; `#/article/` jump machinery pre-existing (Phase 19) |
| 5 edge specs | _edge-invariant.ts | assertDestinationInvariant destination cells | ✓ WIRED | 7 references per spec; pure-addition diffs |
| v21 spine | _portability/_fixtures | shared harness imports | ✓ WIRED | L89 selectRangeBetweenBlocks from _fixtures; _portability primitives |
| ACCEPTANCE-PROTOCOL.md | 21-VERIFICATION.md | results-record location | ✓ WIRED | L39 + §6; this file is the referenced ledger — reference now landed (POLISH-11 key_link satisfied) |
| 21-AUDIT-FINDINGS.md | 21-VERIFICATION.md | referenced from phase verification ledger | ✓ WIRED | Referenced throughout this report (UI-SPEC §4) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| ReviewView rows | `jumpable` / row entries | shipped review-filter derive/resolve over seeded articles (entry.status === "confident") | ✓ real derived state gates the glyph | ✓ FLOWING |
| Slider aria/readout | MEASURE_STEPS array ends | tokens.ts (single source; schema mirrors) | ✓ tokens → slider → e2e assertions | ✓ FLOWING |
| Settings load path | raw row → clamp → safeParse | Dexie/mirror/import seams all route through clampLegacyMeasure | ✓ verified by 23 passing unit behaviors | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Legacy measure clamp at all seams (72→64 calm; garbage → corrupt) | `npm run test:unit -- --run tests/unit/settings/measure-clamp.test.ts` | 23/23 passed (1.09s) | ✓ PASS |
| zipSlip guards behavior-identical post-lint-fix | `npm run test:unit -- --run tests/unit/portability/zip-slip.test.ts` | 21/21 passed (0.76s) | ✓ PASS |
| zipSlip lint clean (D21-15) | `npx eslint src/portability/zipSlip.ts` | exit 0, no output | ✓ PASS |
| No dangerous HTML anywhere in src/ | `node scripts/check-no-danger.js` | exit 0, 0 usages | ✓ PASS |
| Geometry/ruler/spine/matrix runtime behavior | playwright specs (need dev server) | not run — server start prohibited | ? SKIP → human |

### Probe Execution

No probes declared for this phase (not a migration/tooling phase; `scripts/*/tests/probe-*.sh` absent) — step not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|---------------------|----------|
| POLISH-08 | 21-02 | Tag menu adjacent, viewport-kept, geometry-following, focus-restoring | ✓ SATISFIED (runtime clause → human #3) | CSS + geometry spec verified; recorded 24/24 ×3 engines |
| POLISH-09 | 21-01 | Truthful 64ch far-right, visual + programmatic | ✓ SATISFIED (visual clause → human #4) | Tokens/schema/aria presence + 23/23 unit behavioral; recorded 21/21 + 237/237 |
| POLISH-10 | 21-03 | Highlights shared-grid conformance + visible navigation | ✓ SATISFIED (runtime clause → human #5) | Glyph + CSS verified; recorded 99/99 ×3 engines |
| POLISH-11 | 21-04 | Impeccable-informed audit resolves blocker/major without a11y regression | ✓ SATISFIED | Audit artifact complete; F-1 fixed in-phase; zero open P0/P1; a11y floor nets green (recorded 114/114) + check-no-danger in-process |
| ACPT-07 | 21-05 | v2.1 core flow without loss across 3 engines | ✓ SATISFIED (instrument verified; runtime → human #6) | Spine spec verified all levels; recorded 2 passed + 1 documented webkit skip; REQUIREMENTS.md marks Complete |
| ACPT-08 | 21-06 | Keyboard/NVDA/VoiceOver/reduced-motion/forced-colors/reflow/zoom matrix, zero blocker/major | ⏳ PENDING — by design | Automated arms + protocol v1.3 instrument verified; recorded 213/0 + full suite 1722/0/16; **NVDA + VoiceOver human runs outstanding** → human #1/#2; REQUIREMENTS.md honestly shows Pending; flip belongs to /gsd-verify-work 21 (D13-06/D13-07) |

Orphaned requirements: none — all 6 phase IDs (POLISH-08/09/10/11, ACPT-07/08) claimed by plans 21-01…21-06.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app.css | — | `--hairline` 1.27–1.43:1 vs 3:1 non-text bar (audit F-2) | ℹ️ Info | P2 minor, ledgered in deferred-items.md with mitigations (load-bearing boundaries all pass; forced-colors restores CanvasText); token values byte-stable this phase per UI-SPEC §6 |
| src/app.css | L1324 | `.page-indicator` font shorthand bypasses `var(--font-ui)` (F-3) | ℹ️ Info | P3, ledgered; rendering identical |
| src/app.css | — | 8× hardcoded rgba backdrops (F-4) | ℹ️ Info | P3, ledgered; deliberate theme-independent scrims |
| dist (build) | — | Single 782 kB JS chunk (F-5) | ℹ️ Info | P3, ledgered; no WCAG violation |

Debt-marker scan (TBD/FIXME/XXX), placeholder-copy scan, console.log-stub scan, and empty-return scan across all phase-modified source and test files: **zero findings**. All prohibitions across the six plans verified with direct diff/grep evidence (see Key Links + truth table); none flagged.

### Human Verification Required

### 1. NVDA + Firefox protocol v1.3 session (Windows hardware)

**Test:** Run ACCEPTANCE-PROTOCOL.md v1.3 flows A–L + 5 charters on NVDA + Firefox; record in the §6 NVDA+Firefox results sheet
**Expected:** Zero blocker / zero major; results land in this ledger via /gsd-verify-work 21
**Why human:** Real screen reader on real hardware — locked human arm (D13-06/D13-07); 21-USER-SETUP.md status: Incomplete

### 2. VoiceOver + Safari protocol v1.3 session + D21-12 sighted image pass (macOS)

**Test:** Run flows A–L + charters on VoiceOver + Safari; then save an article with images (EPUB upload), reopen offline, export, import, verify figures render/decode locally
**Expected:** Zero blocker / zero major; D21-12 evidence in the VO+Safari results sheet's D21-12 row
**Why human:** Real SR on real Safari (e2e WebKit ≠ Safari) + sighted image-flow pass — locked human arm

### 3. Tag-menu geometry behavior spot-check

**Test:** `npx playwright test tests/e2e/chrome/tag-menu-geometry.spec.ts` (fresh dev server) or manual browser check at 1280/360/240 widths + Esc/light-dismiss
**Expected:** Adjacency to trigger, resize-follow, 240px viewport-keep, focus restore (webkit: not-trapped shape)
**Why human:** Runtime geometry + focus state transition; verifier cannot start a dev server

### 4. Truthful-64 ruler spot-check

**Test:** `npx playwright test tests/e2e/typography-live-apply.spec.ts` or drag the slider to far-right in both modes
**Expected:** Surface width = 64-zero ruler within 1px (both modes); aria 64/64; readout "Reading width 64 ch"; far-left 40ch
**Why human:** Rendered-pixel equality is browser-only (programmatic half + seam behavior already verified/unit-proven)

### 5. Highlights glyph/conformance/jump spot-check

**Test:** `npx playwright test tests/e2e/review-panel` or open #/highlights
**Expected:** 22px section h2, 24px row padding, glyph on exactly confident rows, jump + BackToLibrary behave
**Why human:** Computed-style and activation behavior are runtime DOM truth

### 6. v2.1 core-flow spine spot-check

**Test:** `npx playwright test tests/e2e/portability/v21-core-flow-spine.spec.ts`
**Expected:** 2 passed (chromium/firefox) + 1 documented webkit skip; byte-equal restoration incl. asset rows
**Why human:** Cross-machine IndexedDB preservation invariant needs real engines + server

### 7. Six-spec edge-matrix spot-check

**Test:** `npx playwright test` the six extended specs (forced-colors, reduced-motion, reflow, high-zoom, touch-targets, panel-keyboard)
**Expected:** Green across chromium/firefox/webkit over all four destinations (recorded: 213/0; full suite 1722/0/16 in 21-06-SUMMARY ledger #8)
**Why human:** Recorded green runs not reproducible in the verifier's process

### Gaps Summary

**No gaps.** Every artifact exists, is substantive, and is wired; every prohibition held (verified by direct diff/grep evidence); every unit-provable behavior was re-proved in the verifier's own process (measure-clamp 23/23, zip-slip 21/21, eslint 0, check-no-danger 0); no debt markers, no stubs, no orphaned code, no missing links.

All six plans' claims cross-checked against the codebase held up — the summaries' file lists, line numbers, commit hashes (all 13 task commits present in git log), and acceptance-criteria greps reproduced faithfully. This is notably clean execution.

The phase goal is not yet fully PROVEN, for exactly the reason the phase itself declared: this is an acceptance phase whose final truths are (a) browser-runtime behavior exercised by e2e instruments the verifier cannot run in-process (dev-server constraint), and (b) two human screen-reader sessions (NVDA+Firefox, VoiceOver+Safari) that are locked human arms and have not yet run. Per the phase's own contract, ACPT-08 remains honestly Pending in REQUIREMENTS.md and flips only via /gsd-verify-work 21 at zero blocker/major on both runs. The recommended path: run the seven items above (the two SR sessions are mandatory; items 3–7 can be satisfied by re-running the recorded suites or the /gsd-verify-work 21 browser pass), then record results in this ledger — the protocol v1.3 results sheets and the D21-12 evidence row are ready and waiting.

---

_Verified: 2026-09-01T17:09:16Z_
_Verifier: the agent (gsd-verifier)_
