---
phase: 21-integrated-refinement-and-acceptance
verified: 2026-09-07T10:20:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 0/5
  gaps_closed:
    - "VoiceOver + Safari advances through a page-leading image without skipping the following first text line, and resets to the top of the new page after image-only pages (UAT Test 2 major) — closed by 21-07 fix 67d8a81 + regression lock e4a77c1 + live VO+Safari checkpoint APPROVED 2026-09-03"
    - "Six-spec edge matrix green with no weakened assertions (UAT Test 7 major) — closed by 21-08 openToc hardening (8b9f145/7040050/a1e569d) + fresh-server full honest gate GREEN (lint 0; unit 1605/0/13; e2e 1733/0/20)"
    - "All five previously PRESENT_BEHAVIOR_UNVERIFIED truths — behavioral evidence landed via the UAT flow (Tests 1-7) and the 21-08 gate ledger"
  gaps_remaining: []
  regressions: []
---

# Phase 21: Integrated Refinement and Acceptance — Re-Verification Report

**Phase Goal:** Readers experience a cohesive, corrected application proven across the full browser and accessibility matrix.
**Verified:** 2026-09-07T10:20:00Z
**Status:** passed
**Re-verification:** Yes — after UAT resolution + gap closure (initial verification 2026-09-01 left all five truths PRESENT_BEHAVIOR_UNVERIFIED pending the UAT/human arms; UAT 2026-09-02 found 2 majors; plans 21-07/21-08 closed them 2026-09-03/2026-09-07)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tag menus stay adjacent to their trigger and visible as geometry changes, then restore focus when closed | ✓ VERIFIED | Static levels verified at initial verification (CSS anchor pair + 282-line geometry spec, zero-JS prohibition held). Behavioral evidence landed: **UAT Test 3 pass** (adjacency, resize-follow, 240px viewport-keep, Esc/light-dismiss focus-restore confirmed in-browser). Full-matrix re-run green inside the 21-08 gate (e2e 1733/0/20 includes the chrome/tag-menu-geometry cells). |
| 2 | Reading width reaches a truthful 64-character maximum at the visual and programmatic far-right endpoint | ✓ VERIFIED | Programmatic half + seam behavior verified at initial verification (MEASURE_STEPS [40,46,52,58,64]; measure-clamp 23/23 in-process). Behavioral evidence landed: **UAT Test 4 pass** (visual ruler equality within 1px both modes; aria 64/64 + readout agreement; 40ch far-left). |
| 3 | Highlights respects the shared grid and offers clear Library and article-context navigation | ✓ VERIFIED | Glyph + CSS conformance verified at initial verification. Behavioral evidence landed: **UAT Test 5 pass** (computed 22px h2 / 24px row padding; glyph on exactly confident rows; jump + BackToLibrary behave). |
| 4 | The complete v2.1 core flow succeeds without loss in Chromium, Firefox, and WebKit | ✓ VERIFIED | Spine instrument verified at all levels at initial verification (774 lines, one journey, two contexts, documented webkit skip; zip-slip 21/21 + eslint 0 in-process). Behavioral evidence landed: **UAT Test 6 pass** (2 passed chromium/firefox + 1 documented webkit skip, exit 0; byte-equal restoration incl. asset rows); portability cells green again inside the 21-08 full gate. |
| 5 | The Impeccable-informed audit and keyboard, NVDA, VoiceOver, reduced-motion, forced-colors, reflow, and zoom matrix finish with no blocker or major finding | ✓ VERIFIED | Audit half verified at initial verification (zero open P0/P1; minors ledgered). Matrix evidence now COMPLETE: **NVDA+Firefox v1.3 run — pass, zero blocker/major (UAT Test 1)**; **VoiceOver+Safari v1.3 run — one major (image-page focus), closed via the documented D13-06/D13-07 fix-then-re-run loop: 21-07 fix + live VO+Safari re-confirmation APPROVED by the user 2026-09-03 (all three expectations held — recorded in 21-07-SUMMARY.md §Human Checkpoint, STATE.md, commit 9f24d50)**; **automated arms re-proven green on a fresh server (21-08 gate: e2e 1733/0/20 — a superset of the six-spec matrix, all seven previously-failing cells green, zero weakened assertions)**. ACPT-08 flipped to Complete in REQUIREMENTS.md by this verification per the protocol's flip policy (see Requirements Coverage). |

**Score:** 5/5 truths verified (0 present, behavior-unverified — every behavioral clause now has recorded evidence: UAT results, the approved human checkpoint, or the 21-08 gate ledger)

### Gap-Closure Verification (re-verification focus)

**UAT Test 2 — VO+Safari image-page focus (major):**

| Check | Status | Evidence |
|-------|--------|----------|
| `focusNewPageTop` exported (ONE implementation, never forked) | ✓ VERIFIED | `export function focusNewPageTop` at PageTurnControls.tsx:309 with 04-09-precedent JSDoc; runtime import at PaginatedSurface.tsx:68 |
| `isFocusInContent` body/documentElement content-origin (self-heal) | ✓ VERIFIED | PageTurnControls.tsx:286 `if (active === document.body \|\| active === document.documentElement) return true;` with probe-citation WHY comment (L280-285) |
| Chevron fallback boundary handoff | ✓ VERIFIED | `handleChevronTurn` PaginatedSurface.tsx:581-591 — commitTurn → moved check → rAF guard `.page-turn,.mode-toggle,.gear-button` → `focusNewPageTop(articleEl)`; both chevrons route through it (L712/L721) |
| No runtime import cycle | ✓ VERIFIED | Reverse import is `import type { PaginatedSurfaceHandle }` (PageTurnControls.tsx:59) — erased at compile |
| WebKit regression spec ≥80 lines | ✓ VERIFIED | page-turn-focus-handoff.spec.ts = 389 lines; 5 tests matching the plan's behavior table incl. webkit-strict figure-only-page cell (Test 4) and cascade-stays-healed (Test 5); skip accounting consistent (11 pass + 4 by-design non-webkit skips across 3 engines) |
| Byte-stability prohibitions | ✓ VERIFIED | Only removed src lines: old D4-07 comment text, `function`→`export function` signature, and the two direct chevron `onClick={() => commitTurn(...)}` lines — commitTurn/turnToPage/imperative handle/.page-start-heading untouched; page-turn-controls.spec.ts and toc-geometry.spec.ts show ZERO diff since before 21-07 |
| Commits present | ✓ VERIFIED | 67d8a81 (fix), e4a77c1 (test), 9f24d50 (human approval record) in git log |
| Human sign-off | ✓ VERIFIED | Live VoiceOver+Safari checkpoint **APPROVED 2026-09-03** — image-only page resets to top; image-leading page reads the first text line; post-button keyboard turn still resets (21-07-SUMMARY.md §Human Checkpoint; STATE.md L508) |

**UAT Test 7 — matrix green / openToc race (major):**

| Check | Status | Evidence |
|-------|--------|----------|
| openToc hardening (strengthen-only) | ✓ VERIFIED | Focusin witness armed before the trigger click + `expect.poll` on `__lemTocOpenFocusSettled` (3000ms) — toc-navigation.spec.ts:157-188; cumulative diff vs pre-task spec: **0 removed lines** (verified `git diff 2983afb..HEAD`) |
| toc-geometry.spec.ts untouched | ✓ VERIFIED | Zero diff (audited: drives no entry.focus()+Enter activation — no race) |
| vite.config.ts byte-unchanged (evidence-gated path) | ✓ VERIFIED | Not in the diff; Vite 8.1.5 source-level finding recorded (chokidar defaults already ignore `**/test-results/**`); CPU investigation findings + sampling data in 21-08-SUMMARY.md §Dev-server CPU findings |
| Commits present | ✓ VERIFIED | 8b9f145 (witness), 7040050 (FIRING-not-rest fix), a1e569d (Event typing) in git log |
| Fresh-server honest gate | ✓ VERIFIED (recorded + partially reproduced) | Ledger: lint exit 0; unit **1605/0/13**; e2e **1733/0/20** across chromium/firefox/webkit + chromium-throttled at --workers=2 on a Playwright-booted fresh server (24.9m); skip accounting 1733+20=1753 = UAT's 1738 + 21-07's 15 — no cells lost, no assertions weakened. Reproduced in the verifier's own process: eslint on all four modified files exit 0; `tsc --noEmit` clean; full unit suite **1605 passed / 0 failed / 13 skipped** (matches the ledger exactly). The e2e count is recorded evidence (dev-server constraint prevents in-process re-run) — UAT Test 7's browser pass was itself the human-run confirmation of this matrix class |

### Required Artifacts (gap-closure additions; all initial-verification artifacts re-checked present and unchanged)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/reader/PageTurnControls.tsx` | exported focusNewPageTop + body-as-content-origin gate | ✓ VERIFIED | L286 + L309; WHY comments cite the probe-verified diagnosis |
| `src/reader/PaginatedSurface.tsx` | handleChevronTurn fallback handoff | ✓ VERIFIED | L581-591; both chevrons wired; no forked handoff |
| `tests/e2e/pagination/page-turn-focus-handoff.spec.ts` | WebKit regression lock ≥80 lines | ✓ VERIFIED | 389 lines; 5 cells; two-figure deterministic figure-only geometry documented in-file |
| `tests/e2e/toc/toc-navigation.spec.ts` | hardened openToc, additions only | ✓ VERIFIED | focusin witness L157-188; 0 removed lines |
| `vite.config.ts` | byte-stable unless evidence | ✓ VERIFIED | Byte-unchanged — investigation refuted the watcher hypothesis (correct conditional path) |

### Key Link Verification (gap-closure links)

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| PaginatedSurface.tsx | PageTurnControls.tsx | runtime `focusNewPageTop` import (reverse is type-only) | ✓ WIRED | L68 import; L589 call; `import type` at PageTurnControls:59 |
| page-turn-focus-handoff.spec.ts | PaginatedSurface.tsx | `.page-turn-next` clicks + activeElement classification | ✓ WIRED | Test cells assert boundary/button/body classification against the committed page |
| toc-navigation.spec.ts | TocPanel.tsx | openToc focusin witness synchronizes with the open-focus rAF | ✓ WIRED | Witness polls the panel's own focusin on anchors — closing the race by construction |

### Behavioral Spot-Checks (run in the verifier's process, 2026-09-07)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Modified-file lint cleanliness | `npx eslint` on the 4 gap-closure files | exit 0, no output | ✓ PASS |
| Type safety after both fixes | `npx tsc --noEmit` | clean | ✓ PASS |
| Full unit gate reproduction | `npm run test:unit -- --run` | **1605 passed / 0 failed / 13 skipped** (14.72s) — exactly the 21-08 ledger | ✓ PASS |
| Debt-marker scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) on all 4 files | grep | zero matches | ✓ PASS |
| e2e regression specs (page-turn-focus-handoff, full matrix) | playwright | not run — dev-server start prohibited in verifier process | ? SKIP — evidence: 21-08 gate ledger (recorded green, fresh server) + UAT Tests 2/7 human confirmation |

### Probe Execution

No probes declared for this phase (not a migration/tooling phase; `scripts/*/tests/probe-*.sh` absent) — step not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|----------|---------|
| POLISH-08 | 21-02 | Tag menu adjacent, viewport-kept, geometry-following, focus-restoring | ✓ SATISFIED | Static verification (initial) + UAT Test 3 pass + 21-08 gate green |
| POLISH-09 | 21-01 | Truthful 64ch far-right, visual + programmatic | ✓ SATISFIED | Tokens/schema/aria + 23/23 unit + UAT Test 4 pass |
| POLISH-10 | 21-03 | Highlights shared-grid conformance + visible navigation | ✓ SATISFIED | Glyph + CSS verification + UAT Test 5 pass |
| POLISH-11 | 21-04 | Audit resolves blocker/major without a11y regression | ✓ SATISFIED | Zero open P0/P1; minors ledgered; a11y floor nets green |
| ACPT-07 | 21-05 | v2.1 core flow without loss across 3 engines | ✓ SATISFIED | Spine verified all levels + UAT Test 6 pass; REQUIREMENTS.md Complete |
| ACPT-08 | 21-06 (+21-07, 21-08 gap closure) | Full acceptance matrix, zero blocker/major | ✓ SATISFIED — **flipped by this verification** | Flip per docs/ACCEPTANCE-PROTOCOL.md §6 flip policy (v1.3, D13-06/D21-14): BOTH human v1.3 runs hold zero blocker/major — NVDA+Firefox pass (UAT Test 1); VoiceOver+Safari via the documented fix-then-re-run loop (major → 21-07 fix → live re-confirmation APPROVED 2026-09-03, the D13-06/G7 targeted-re-run precedent). Automated arms necessary-but-not-sufficient: re-proven green in the 21-08 fresh-server gate. REQUIREMENTS.md updated [ ]→[x], Pending→Complete by this verification. |

Orphaned requirements: none — all 6 phase IDs (POLISH-08/09/10/11, ACPT-07/08) accounted for. **All v2.1 milestone requirements now Complete.**

### ACPT-08 Results Record (protocol v1.3, §6 — this file is the referenced ledger)

**NVDA + Firefox (Windows, off-machine) — run 2026-09-01/02, recorded via UAT Test 1:**
Flows A–L + 5 exploratory charters: **PASS — zero blocker / zero major.** (Environment version details were not captured in the UAT record; the run result and scope are user-attested.)

**VoiceOver + Safari (macOS) — run 2026-09-01/02 + fix-then-re-run confirmation 2026-09-03:**
Full v1.3 run + D21-12 sighted image pass completed; ONE major finding (image-page focus handoff — page-leading image skipped the first text line; image-only page left focus stuck below the image). **Fix-then-re-run loop (D13-06/D13-07):** 21-07 amended the D4-07 contract (self-healing handoff; commits 67d8a81/e4a77c1; cross-engine regression lock with recorded RED/GREEN evidence), then the live VoiceOver+Safari checkpoint was **APPROVED by the user 2026-09-03** — (1) image-only page: VO+Space on "Next page" announced the new boundary and resumed at the TOP of the new page; (2) image-leading page: image read, then the FIRST text line under it; (3) post-button PageDown: boundary announced, reading resumed at top (cascade healed). D21-12 evidence: images render in EPUBs in the exercised flow ("Images are loading in now for epubs" — user report); the export/import image round trip is additionally cross-engine-proven byte-equal by the ACPT-07 spine (UAT Test 6). **Verdict: PASS — zero blocker / zero major after the documented loop.**

**Automated arms:** fresh-server full honest gate GREEN (21-08 ledger): lint 0; unit 1605/0/13; e2e 1733/0/20 (3 engines + chromium-throttled; 20 skips = 16 documented + 4 by-design webkit-strict).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app.css | — | `--hairline` 1.27–1.43:1 vs 3:1 non-text bar (audit F-2) | ℹ️ Info | P2 minor, ledgered in deferred-items.md with mitigations; token values byte-stable per UI-SPEC §6 |
| src/app.css | L1324 | `.page-indicator` font shorthand bypasses `var(--font-ui)` (F-3) | ℹ️ Info | P3, ledgered; rendering identical |
| src/app.css | — | 8× hardcoded rgba backdrops (F-4) | ℹ️ Info | P3, ledgered; deliberate theme-independent scrims |
| dist (build) | — | Single 782 kB JS chunk (F-5) | ℹ️ Info | P3, ledgered; no WCAG violation |

Debt-marker, placeholder-copy, console.log-stub, and empty-return scans across the gap-closure files (21-07/21-08) and the initial-verification file set: **zero findings.** All prohibitions across the eight plans verified with direct diff/grep evidence.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | 4 audit minors (P2 hairline contrast + 3×P3) | Post-milestone polish (deferred-items.md ledger) | D21-10 severity legend; mitigations documented; milestone closes honestly with logged minors |

### Human Verification Required

None remaining. All seven initial-verification human items resolved with recorded evidence: Tests 1–7 of 21-UAT.md (now all pass — Tests 2 and 7 via gap closure with the VO+Safari checkpoint user-APPROVED 2026-09-03 and the fresh-server gate re-run 2026-09-07). The UAT ledger has been updated to `status: resolved` with per-test resolution annotations preserving the original reports.

### Gaps Summary

**No gaps.** Both UAT majors are closed at every level — exists, substantive, wired, behaviorally re-proven (regression lock + approved live sign-off; fresh-server green gate with the unit half reproduced in this verifier's own process). All five roadmap success criteria now carry recorded behavioral evidence. ACPT-08 — the last Pending milestone requirement — is flipped to Complete in REQUIREMENTS.md per the protocol's own flip policy, executed by verify-work as the documented owner. The v2.1 milestone requirements table reads 100% Complete.

---

_Verified: 2026-09-07T10:20:00Z_
_Verifier: the agent (gsd-verifier)_
