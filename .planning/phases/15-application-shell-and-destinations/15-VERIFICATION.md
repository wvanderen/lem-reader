---
phase: 15-application-shell-and-destinations
verified: 2026-08-27T03:37:22Z
status: passed
score: 18/18 must-haves verified
behavior_unverified: 0 # Every behavior-dependent truth has a passing behavioral test at the exact HEAD code state (HEAD differs from gate commit 8b44189 by docs only — verified)
overrides_applied: 0
human_verification:
  - test: "POLISH-07 visual token-coherence audit — visually compare Library, Highlights, Add (as-is), and Reader at 320px / 768px / 1280px; check focus-ring visibility on all interactive elements"
    expected: "Gutters, headers, spacing, and control hierarchy read as one coherent system; the global :focus-visible ring is visible on every interactive control; the three documented intentional differences (paginated block inset, 64ch Reader measure, 16px review-select) read as deliberate, not drift"
    why_human: "Visual judgment across surfaces — the phase's own 15-VALIDATION.md Manual-Only row. Programmatic probe evidence (computed insets, 0px centering skew, focus-ring color) is recorded in 15-04-SUMMARY.md; the look-and-feel judgment cannot be grepped"
    resolution: "PASSED via 15-UAT.md Test 1 (2026-08-29, user-confirmed pass)"
  - test: "Keyboard / screen-reader pass over the new shell surfaces — navigate the Primary nav, brand link, and a Library→Reader→Highlights round-trip by keyboard and with a screen reader"
    expected: "nav landmark 'Primary' is announced and distinguishable from 'Library views' and 'Book chapters'; aria-current='page' is conveyed; the collapsed wordmark at ≤639px stays reachable; restore focus (row link vs h1) lands where the e2e asserts it does"
    why_human: "Axe/e2e cover the automatable subset only (STACK.md documented limit); landmark announcement and SR perception of aria-current are human-perceptual"
    resolution: "PASSED via 15-UAT.md Test 2 (2026-08-29, user-confirmed pass)"
---

# Phase 15: Application Shell and Destinations Verification Report

**Phase Goal:** Readers move predictably among primary destinations without losing context or encountering irrelevant controls.
**Verified:** 2026-08-27T03:37:22Z
**Status:** passed (human items resolved via UAT 2026-08-29)
**Re-verification:** No — initial verification

## Goal Achievement

All 18 merged must-have truths (5 roadmap SCs + 13 plan-level detail truths) verified at presence, wiring, AND behavioral-test level. The only outstanding items are the phase's own contractually-required Manual-Only visual audit and a screen-reader pass — hence `human_needed`, not `passed`.

### Observable Truths

#### Roadmap Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Reader can navigate directly between first-class Library and Highlights destinations through a consistent shell | ✓ VERIFIED | `src/reader/Header.tsx` L144-157: `nav.shell-nav[aria-label="Primary"]` with exactly two text links (`#/`, `#/highlights`), rendered inside the persistent Header on all three destinations (App.tsx L330-341 single Header above the view swap). e2e `shell-nav.spec.ts` test (1) asserts presence + exactly-2-links on `#/`, `#/highlights`, `#/article/<id>`; passed in the 195/195 3-engine phase matrix at 8b44189 (HEAD code identical — diff verified docs-only) |
| SC2 | Activating the Lem Reader brand returns predictably to the Library | ✓ VERIFIED | Header.tsx L126-128: `<a className="app-wordmark" href="#/">Lem Reader</a>` (no aria-label — accessible name is the text, D15-10); parseHash maps `#/` → list/all (App.tsx L98). e2e test (3): brand click from Reader → `#/` + h1 "Saved articles" |
| SC3 | Returning from Reader or Highlights restores prior Library filters and scroll position | ✓ VERIFIED | `librarySession.ts` (98 lines, all 5 exports, zero React/storage imports — read in full); LibraryView.tsx L204-207 lazy filter initializers, L313-343 ready-gated view-matched restore (clampScroll → row/h1 focus). Unit `library-session.test.ts` 11/11 **re-run green by verifier**; e2e `library-restore.spec.ts` matrix (a)-(f) enumerated present (42 cells × 3 engines), green at gate commit |
| SC4 | Reading-only controls appear only in reader context; global prefs remain available elsewhere | ✓ VERIFIED | Header.tsx L227-229: ModeToggle wrapped in `{articleMounted && …}` (same gate as tags/annotations triggers); gear L230-243 ungated. e2e test (4): mode-toggle count-zero on `#/` + `#/highlights`, visible in Reader, gear on all three |
| SC5 | Library, Highlights, Add, and Reader share coherent gutters, headers, spacing, responsive behavior, and visible focus | ✓ VERIFIED | POLISH-07 audit table recorded in 15-04-SUMMARY.md L82-96 (the plan-required artifact); the one drift fixed on-token (`.app-wordmark` gained `min-height: var(--touch)` — app.css L414); 3 intentional differences citation-commented (app.css L243, L2811, paginated-main ~L209); no `outline: 0/none` anywhere (only the prohibition comment L135); 48px header byte-stable (L406); 320×640 geometry e2e test (5) green × 3 engines |

#### Plan 15-01 truths (NAV-01 grammar)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `#/highlights` shows h1 'Highlights' and title 'Highlights — Lem Reader' | ✓ VERIFIED | App.tsx L76-78 canonical arm ordered before alias; ReviewView.tsx L364 h1 `Highlights`, L302 `setDocumentTitle("Highlights")` (suffix/separator live only in pageMeta — D14-02). `App.test.tsx` 17/17 **re-run green by verifier**; e2e route-entry heading assertions present |
| 2 | Legacy `#/review` lands Highlights with URL normalized to `#/highlights`, no extra history entry | ✓ VERIFIED | App.tsx L79-83 `legacyAlias: true` marker; L259-261 `history.replaceState(null, "", "#/highlights")` + load-bearing direct `setView(parseHash())` (L262); cold-load normalization L270-272. Unit case asserts the marker (App.test.tsx L140-142); e2e route-entry (f) asserts normalized URL + single-Back entry-count (spec L136-159 read in full) |
| 3 | Unknown `#/` segments (incl. `#/highlights/x`) fall back to All list view | ✓ VERIFIED | parseHash terminal fallback (App.tsx L98); unit cases `#/highlights/x` (L145-148) and `#/review/x` (L120-121) — both in the 17/17 green run |
| 4 | No repo file pins the retired two-word review vocabulary | ✓ VERIFIED | **Verifier re-ran the gate**: `rg -l "Review highlights" src tests` → 0 files. Residual `#/review` hits confined to exactly the 4 sanctioned zones (App.tsx alias arm ×7, App.test.tsx alias cases ×7, route-entry.spec.ts alias-compat ×6, ReviewView prose ×2) — matches the SUMMARY disposition table |

#### Plan 15-02 truths (NAV-01/02/05 shell)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | Nav landmark 'Primary' with text links Library + Highlights inside the 48px app-header on all three destinations | ✓ VERIFIED | Header.tsx L144-157; app.css `.app-header` min-height 48px (L406); e2e test (1) loops all three destination URLs |
| 6 | Exactly one shell-nav link carries aria-current='page' matching the active destination; brand never carries it | ✓ VERIFIED | Header.tsx L147/L153 ternary-to-undefined; brand link (L126-128) has no aria-current attribute; `destination` derived in App.tsx L320-325 (any list view → library). e2e test (2) covers `#/`, `#/unread`, `#/highlights`, reader (neither), never-brand |
| 7 | Brand activation navigates to #/ and shows All view with h1 'Saved articles' | ✓ VERIFIED | href `#/` fixed literal (never view-tracking); e2e test (3) |
| 8 | Reading-mode toggle renders only when an article is mounted; gear on every destination | ✓ VERIFIED | `{articleMounted && <ModeToggle …/>}` (L227-229); ungated gear (L230-243); e2e test (4) count-zero + contrast-leg pattern |
| 9 | At 320×640 in Reader the 48px header row neither wraps nor overflows; brand keyboard reachable while collapsed | ✓ VERIFIED | app.css ≤639px block (L3448-3474): clip treatment (position:absolute + clip — stays in a11y tree/tab order, Pitfall 9), flex-shrink:0 honesty fix, measured 10px slack; e2e tests (5)+(6) green × 3 engines per gate record |
| 10 | Library header no longer contains an in-page Highlights button — shell link is the sole entry | ✓ VERIFIED | `rg article-export-highlights src/ingestion/library/LibraryView.tsx` → 0 hits; header is h1-only (L538-548); back-nav.spec L127 + route-entry.spec L54/L97 drive the shell link |

#### Plan 15-03 truths (NAV-03 restore)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 11 | All return paths (BackToLibrary, shell Library link, brand) restore query + tag filters | ✓ VERIFIED | Lazy `useState` initializers (L204-207) read `peekLibraryContext()` on every mount — view-match gates only scroll/focus. Matrix (a)-(d) pin each path |
| 12 | View-match: clamped scroll + launched-row focus (or h1 with preventScroll when no article launched) | ✓ VERIFIED | Ready-gated restore L313-343: `viewMatches` gate → `clampScroll` scrollTo → row-link focus with `preventScroll` iff intersecting / null-row h1 `preventScroll:true`. Unit comparators green (11/11 re-run); matrix (a)(b)(d)(f) |
| 13 | Row-gone / scroll-overshoot / view-mismatch degrade calmly — no error, no false restore | ✓ VERIFIED | Row-gone → h1 default focus (L338-340); overshoot → clampScroll (L324); mismatch → fresh h1 reset (L317-320). Matrix (c)(e)(f) |
| 14 | Restore state is session-scoped in-memory only — nothing persists to Dexie, nothing survives reload, no keep-alive | ✓ VERIFIED | librarySession.ts: module-level `let snapshot`, zero storage imports; `git diff 72adcfa~1..8b44189 -- src/` contains no `db.version(` (verifier re-ran); App.tsx three-view conditional swap unchanged (no hidden mount) |

#### Plan 15-04 truths (POLISH-07 + gate)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 15 | Four surfaces align to shared tokens; deviations fixed or documented with citation | ✓ VERIFIED | Audit table in 15-04-SUMMARY (surface × invariant → keep/fix/intentional); citation comments confirmed on disk (app.css L243, L2811; paginated-main comment ~L209-213 pre-existing) |
| 16 | Every interactive control keeps ≥44px touch target; global :focus-visible ring nowhere suppressed | ✓ VERIFIED | `.shell-nav a` min-height var(--touch) (L460); `.app-wordmark` min-height var(--touch) (L414 — the one drift, fixed); no `outline: 0/none` declarations (verifier re-grepped; only the L135 prohibition comment) |
| 17 | At 320×640 in Reader the 48px header row holds on chromium, firefox, and webkit | ✓ VERIFIED | shell-nav test (5) + strengthened no-overlap assertions present in spec; 6/6 × 3 engines per Task 2 record; 195/195 phase matrix |
| 18 | Full suite passes in one invocation — npm run test exit 0 — fail counts recorded honestly | ✓ VERIFIED | Gate record 15-04-SUMMARY L117-133: run 3 exit 0, 2529 passed / 0 failed / 23 documented skips (unit 1302/0/13 + e2e 1227/0/10), incl. an honestly-recorded intermediate exit-1 run and its root cause (stale dev server). **HEAD = gate code**: `git diff 8b44189..HEAD` touches only .planning/ docs (verifier re-ran); orchestrator re-verified build + unit gates at HEAD; verifier re-ran the two key unit files green |

**Score:** 18/18 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/App.tsx` | #/highlights grammar arm + #/review alias with replaceState normalization + destination derivation + scrollRestoration | ✓ VERIFIED | All present (L76-83, L233, L259-262, L270-272, L320-325); 388 lines read in full |
| `src/routes/review/ReviewView.tsx` | Renamed destination surface | ✓ VERIFIED | h1 "Highlights" (L364), setDocumentTitle("Highlights") (L302) |
| `src/reader/Header.tsx` | Brand link + shell destination nav + ModeToggle gating | ✓ VERIFIED | destination prop (L90), .header-start (L116), brand a (L126), shell-nav (L144-157), gating (L227-229) |
| `src/app.css` | .shell-nav / .header-start + ≤639px collapse + narrow tuning + wordmark touch fix | ✓ VERIFIED | L436-470, L411-429, L3448-3474; 48px byte-stable (L406) |
| `src/ingestion/library/librarySession.ts` | Session snapshot + pure comparators (5 exports) | ✓ VERIFIED | All 5 exports; zero React/storage imports; 98 lines read in full |
| `src/ingestion/library/LibraryView.tsx` | capture-on-leave / restore-on-return with view-match gating | ✓ VERIFIED | Imports (L71-75), refs (L185, L198, L171), initializers (L204-207), unmount capture (L265-279), ready-gated restore (L313-343), delegated ul onClick (L648-655); D10-02 button absent |
| `tests/component/App.test.tsx` | parseHash grammar + alias unit coverage | ✓ VERIFIED | Cases at L135-148, L120-121, L140-142; 17/17 re-run green |
| `tests/e2e/chrome/shell-nav.spec.ts` | NAV-01/02/05 + 320px geometry e2e | ✓ VERIFIED | 330 lines; sentinel + all six numbered groups; enumerated 42 cells (with library-restore) across the 3-engine matrix |
| `tests/unit/library/library-session.test.ts` | Pure logic coverage | ✓ VERIFIED | 137 lines, 11 cases; 11/11 re-run green |
| `tests/e2e/library/library-restore.spec.ts` | NAV-03 return-path × degradation matrix | ✓ VERIFIED | 588 lines; sentinel + matrix (a)-(f) all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| App.tsx onHash | replaceState + setView(parseHash()) | alias normalization, no hashchange | ✓ WIRED | L258-262; pattern `replaceState(null, "", "#/highlights")` matches |
| ReviewView.tsx | pageMeta.ts | setDocumentTitle("Highlights") | ✓ WIRED | L302; import L65 |
| App.tsx AppInner | Header.tsx | `destination=` prop drives aria-current | ✓ WIRED | L320-325 derivation, L340 pass; Header consumes (L103, L147, L153) |
| Header shell-nav | hash router | plain href links, no onClick interception | ✓ WIRED | L145-156 — plain `<a href>`; push semantics re-proven by back-nav (c) |
| shell-nav.spec.ts | Header gating | count-zero + contrast-leg pattern | ✓ WIRED | "Reading mode:" present in spec; test (4) |
| LibraryView unmount cleanup | librarySession | single capture write, StrictMode-safe | ✓ WIRED | L265-279 (reachedReadyRef gate + scrollTopRef); delegated launch capture L648-655 |
| LibraryView ready effect | scrollTo + row focus | viewMatches gate → clamp → focus | ✓ WIRED | L313-343 |
| App.tsx mount effect | history.scrollRestoration | set 'manual' once early | ✓ WIRED | L233; exactly 1 hit in src (verifier re-grepped) |
| audited surfaces | app.css token invariants | 1100px measure family | ✓ WIRED | `max-width: 1100px` family intact; audit table records dispositions |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| ReviewView | highlights/articles/notes | `loadAllHighlights()` + Dexie stores (L314-318) | Yes (Dexie queries) | ✓ FLOWING |
| LibraryView | items/books/locations | async Dexie load → status 'ready' gate | Yes (pre-existing Phase 8-12 pipeline) | ✓ FLOWING |
| Header shell-nav | destination prop | App view state | Yes (live view derivation) | ✓ FLOWING |

Static chrome (shell links) renders constants by design — no dynamic-data hollow-risk.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| librarySession pure contract | `npx vitest --run tests/unit/library/library-session.test.ts` | 11 passed / 0 failed (466ms) | ✓ PASS |
| parseHash grammar + alias + fallback | `npx vitest --run tests/component/App.test.tsx` | 17 passed / 0 failed (1.26s) | ✓ PASS |
| shell-nav + library-restore e2e existence (3-engine enumeration) | `npx playwright test … --list` | Total: 42 tests in 2 files (chromium/firefox/webkit) | ✓ PASS |
| e2e behavioral execution | (not re-run by verifier — would start dev server) | Ran green at gate commit 8b44189: full suite 2529/0/23, phase matrix 195/195; `git diff 8b44189..HEAD` = docs-only, so gate evidence applies to HEAD code; orchestrator re-verified build + unit at HEAD | ✓ PASS (delegated evidence, code-state-identical) |
| Retired-vocabulary rg gate | `rg -l "Review highlights" src tests` | 0 files | ✓ PASS |
| Prohibition: no pushState | `rg -n "pushState" src/` | Only a documentation comment (App.tsx L256) | ✓ PASS |
| Prohibition: no Dexie schema change | `git diff 72adcfa~1..8b44189 -- src/ \| rg "db\.version\("` | No matches | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` probes declared by PLAN/SUMMARY for this phase (the 15-03/15-04 "probe" references are temporary Playwright diagnostics, deleted before commit per the SUMMARYs; not standing probes).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|---------------------|----------|
| NAV-01 | 15-01, 15-02 | Direct Library ↔ Highlights navigation through a consistent shell | ✓ SATISFIED | REQUIREMENTS.md L11 `[x]` + L110 Phase 15 Complete; shell + grammar verified above |
| NAV-02 | 15-02 | Brand as predictable link back to Library | ✓ SATISFIED | L12 `[x]` + L111; brand link + e2e test (3) |
| NAV-03 | 15-03 | Return restores prior Library context (filters + scroll) | ✓ SATISFIED | L13 `[x]` + L112; librarySession + matrix |
| NAV-05 | 15-02 | Reader-only controls gated; global prefs accessible elsewhere | ✓ SATISFIED | L15 `[x]` + L114; articleMounted gate + ungated gear + e2e test (4) |
| POLISH-07 | 15-04 | Four surfaces share consistent gutters/headers/spacing/responsive/focus | ✓ SATISFIED | L65 `[x]` + L143; audit table + on-token fix + citations |

**Orphaned requirements:** none — the phase's 5 requirement IDs all appear in plan `requirements:` frontmatter (15-01: [NAV-01]; 15-02: [NAV-01, NAV-02, NAV-05]; 15-03: [NAV-03]; 15-04: [POLISH-07]) and all are marked Complete in REQUIREMENTS.md. (NAV-04 belongs to Phase 14 and is independently checked — not this phase's scope.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | Zero TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/placeholder-copy hits across all 10 phase source/test files (verifier re-grepped) | — | — |

ℹ️ Info: `src/portability/zipSlip.ts` carries 3 pre-existing eslint errors from Phase 9 (commit 9793d1f) — discovered by 15-03, logged to `deferred-items.md`, outside this phase's file scope. The phase gate is `npm run test` (green); all Phase 15 files lint clean. Not a Phase 15 gap.

### Prohibition Verdicts (judgment-tier, autonomous LLM-judge — all honored)

All 15 `must_haves.prohibitions` across the four plans were checked against direct code evidence: no pushState / no location.hash normalization (15-01); text links only / single 48px row / clip-not-removal collapse / never-brand aria-current / exactly 2 destinations / gear sole global mechanism (15-02); no persistence / no keep-alive / no false restore (15-03); token-fixes-only / 48px byte-stable / intentional-differences-untouched / no outline suppression (15-04). **No violations found; every prohibition had concrete, greppable code evidence rather than requiring judgment alone.** No `unverified-prohibition` flags raised.

### Human Verification Required

### 1. POLISH-07 visual token-coherence audit (the phase's own 15-VALIDATION Manual-Only row)

**Test:** Visually compare Library, Highlights, Add (as-is), and Reader at 320px / 768px / 1280px; check focus-ring visibility on all interactive elements.
**Expected:** Gutters, headers, spacing, and control hierarchy read as one coherent system; the global :focus-visible ring is visible everywhere; the three documented intentional differences read as deliberate.
**Why human:** Visual judgment across surfaces. Programmatic probe evidence (computed insets, 0px centering skew, focus-ring token color) is recorded in 15-04-SUMMARY.md §Token-coherence evidence — but the look-and-feel judgment is the Manual-Only row the phase contract itself reserves for human verification.

### 2. Keyboard / screen-reader pass over the new shell surfaces

**Test:** Navigate the Primary nav, brand link, and a Library→Reader→Highlights round-trip by keyboard and with a screen reader.
**Expected:** "Primary" landmark announced and distinguishable from "Library views" / "Book chapters"; aria-current conveyed; collapsed wordmark reachable at ≤639px; restore focus lands where the e2e asserts.
**Why human:** Axe and e2e cover the automatable subset only (STACK.md documented limit); landmark announcement and SR perception of aria-current are human-perceptual. This phase introduced a new nav landmark and focus choreography.

### Gaps Summary

No gaps. All 18 truths verified; all artifacts exist, are substantive, wired, and data-flowing; all key links wired; all 5 requirements satisfied with traceability rows Complete; all prohibitions honored; honest full-suite gate record at the exact HEAD code state (2529 passed / 0 failed / 23 documented skips). The `human_needed` status comes solely from the two human-perceptual items above — the phase's own validation contract reserves the visual token-coherence judgment for this checkpoint.

---

_Verified: 2026-08-27T03:37:22Z_
_Verifier: the agent (gsd-verifier)_
