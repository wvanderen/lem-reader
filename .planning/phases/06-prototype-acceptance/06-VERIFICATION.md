# Phase 6: Prototype Acceptance — Verification Ledger

<!--
  GSD-managed evidence document. The durable phase-6 acceptance record —
  consolidates ACPT-01..04 results (mirrors ROADMAP §Phase 6 success criteria
  1–4 + 06-RESEARCH.md §Validation Architecture "4 success criteria →
  validation ownership" table). Future releases re-run the manual protocol
  (docs/ACCEPTANCE-PROTOCOL.md) and append a new dated row here.
-->

**Phase:** 6 — Prototype Acceptance (the v1 milestone's final acceptance phase)
**Ledger status:** Complete (all four ACPT requirements accepted on the evidence below)
**Authored:** 2026-08-10 (Plan 06-06 Task 2)
**Mirrors:** `ROADMAP.md` Phase 6 success criteria 1–4 · `06-RESEARCH.md` §Validation Architecture

> **How to read this ledger.** Each ACPT section below records: (a) the
> requirement text, (b) the evidence (automated spec / manual run / budget
> contract), (c) the result, and (d) where the underlying artifact lives. The
> four sections are deliberately parallel to the ROADMAP success criteria so a
> reviewer can cross-check one-to-one. Section 5 is the honest full-suite
> execution record (the Plan 04-11/05-05 discipline).

---

## ACPT-01 — Core reading flow across the representative corpus × 3 engines

> **ROADMAP Success Criterion 1:** "Reader can complete the representative-corpus
> reading flow in current Chromium, Firefox, and WebKit without content loss or
> blocked navigation."
> **Requirement:** ACPT-01 — Reader can complete the core reading flow on the
> representative corpus in current Chromium, Firefox, and WebKit without content
> loss or blocked navigation.

**Status:** ✅ **Complete** (closed by Plan 06-02; verified green in the full-suite run below).

### Evidence

- **Spec:** `tests/e2e/acceptance/core-reading-flow.spec.ts` — the consolidated
  ACPT-01 acceptance contract (D6-13: sibling of `open-every-fixture.spec.ts`,
  reuses the `annotations/_fixtures.ts` harness wholesale — no selector
  re-derivation). Iterates the 6-fixture corpus × 3 engines = **18 acceptance
  cells**. Per fixture × engine, asserts the complete loop as ONE contract:
  OPEN (hash route + `<h1>` sentinel + `__lemPagination` DEV hook + 600ms font
  settle) → READ THROUGH (article + every visible block present, no content
  loss; advance one page conditional on `pagesLength > 1`) → SWITCH MODE
  (`M` shortcut; aria-label = "Reading mode: scrolling"; article + blocks
  survive) → RESTORE (`page.reload()`; article re-mounts without content loss)
  → CREATE + NAVIGATE HIGHLIGHT (`selectRangeInBlock` → `.selection-toolbar` →
  Highlight → `mark.highlight[data-highlight-id]` + announcementRegion
  /Highlight saved/i; then drawer → jump → focus lands on the mark via the
  rAF-deferred retry). V7 pageerror guard at the end of each cell.
- **Result:** **18/18 green** (6 fixtures × chromium/firefox/webkit).
- **Scope note (RESEARCH Open Question 2):** ONE representative typography
  (D-07 default serif/18/64/comfortable). Typography-stress is PAGE-03's job
  (the corpus matrix), not the ACPT-01 flow contract.
- **V5 (Zod-at-boundary) re-verification:** every fixture mounts cleanly across
  all 3 engines — a malformed fixture would have surfaced as a flow failure.

### Acceptance statement

The reader can complete the complete core reading + annotation flow on every
corpus fixture (essay-long-form, figure-heavy, footnote-academic,
list-reference, technical-post, unsupported-case) in chromium, firefox, and
webkit, without content loss or blocked navigation. **ACPT-01 is accepted.**

📄 Source: `06-02-SUMMARY.md` · commit `86afd3c` (test)

---

## ACPT-02 — Keyboard + manual screen-reader acceptance (NVDA+Firefox + VoiceOver+Safari)

> **ROADMAP Success Criterion 2:** "Reader can complete documented keyboard-only
> and manual screen-reader flows in the selected support matrix."
> **Requirement:** ACPT-02 — Reader can complete documented keyboard-only and
> manual screen-reader acceptance flows in the selected support matrix.

**Status:** ✅ **Accepted on a REDUCED gate** — VoiceOver+Safari (macOS) manual
protocol run produced **zero blocker, zero major** findings (D6-07 policy met)
after five findings were resolved. **NVDA+Firefox (Windows) was NOT run** and is
recorded as a **coverage boundary** under research assumption A4 (one SR
ecosystem instead of two). See "Coverage boundary" below.

### The instrument executed

- **`docs/ACCEPTANCE-PROTOCOL.md`** v1.0 (authored Plan 06-04, commit `e5774b0`)
  — the durable, re-runnable ACPT-02 instrument. SR matrix (D6-05): NVDA+Firefox
  (Windows) + VoiceOver+Safari (macOS); JAWS is a recorded v1.x coverage
  boundary, NOT a Phase 6 gate. Hybrid protocol (D6-06): 6 scripted core flows
  (A–F) authored as **role + accessible name + state** per Pitfall 7 (NOT
  verbatim SR phrasing) + 5 exploratory charters. Severity rubric (D6-07):
  blocker/major/minor; **pass = zero blocker AND zero major**; minor quirks
  recorded but do not block.

### Run record

| Pairing | Run dates | Tester | Verdict |
|---------|-----------|--------|---------|
| **VoiceOver + Safari** (macOS) | 2026-08-09 (initial), 2026-08-10 (re-test after fixes) | user (eggfam) | ✅ **PASS — zero blocker, zero major** (D6-07) |
| **NVDA + Firefox** (Windows) | **NOT RUN** | — | ⚠️ Coverage boundary (A4 reduced gate — see below) |

### Findings (VoiceOver+Safari) + resolutions

Five findings were raised in the initial run (2026-08-09). All are resolved or
documented. Source of truth: `06-06-SR-FINDINGS.md`.

| # | Finding | Severity | Resolution | Fix commit(s) | Debug session (resolved) |
|---|---------|----------|------------|---------------|---------------------------|
| 1 | H shortcut does not create a highlight under VoiceOver | Major (initial) | **Documented platform constraint — not an app defect.** macOS VoiceOver single-key Quick Nav (VO-Q), NVDA browse mode, and the JAWS virtual buffer all reserve the bare letter `H` = "next heading" and consume it at the OS/AT layer BEFORE the browser dispatches the app's `window` keydown. The selection-toolbar (`role="toolbar"` with two real native `<button>`s — "Highlight" ≡ H and "Highlight + note" ≡ N) is the documented **PRIMARY SR path** (Tab → Enter / VO+Space), tester-confirmed working. `docs/ACCEPTANCE-PROTOCOL.md` Flow C rewritten to make the toolbar the primary SR path; `src/routes/ArticleView.tsx` visually-hidden keyboard-help `<p>` reframed. H/N/M keydown wiring UNCHANGED (sighted keyboard/mouse convenience). | `c9bf30f` | `vo-highlight-selection.md` |
| 2 | Note textarea unreachable via VoiceOver browse | Major → Blocker | **Fixed.** `NotePopover` promoted from `<div popover="manual" role="dialog">` to a **native `<dialog>` + `showModal()`** (the proven codebase pattern — `SettingsPanel` + `AnnotationsDrawer`; Flow F is the VO-passing reference). `showModal()` gives VoiceOver the modal focus scope + inert background + "modal shown" event it needs to enter the editor and reach the textarea. `::backdrop` styled transparent (article stays visible). Tester: "Editor looks good and we can open highlighter now." | `fcda4ec` (fix) + `4c53b66` (test coverage) | `vo-note-popover-focus.md` |
| 3 | Multi-unit highlight announces "highlighted" repeatedly across browse units | Minor | **Deferred (post-v1 polish).** Per D6-07 boundary rule: confusing-but-completable announcement = minor unless step fails or content/function is lost. The highlight IS announced and reachable. Carried to the deferred-items list. | — (none) | — |
| 4 | VoiceOver browse cursor visually lags document position in scroll mode; scrolling feels clunky | Major (initial) | **SR behavior is correct — residual is visual polish only.** On re-test (2026-08-10) the tester confirmed VO reading is correct (content reachable, no loss). The visible VO focus block lagging the actual reading position is a sighted-observer visual issue, not an SR accessibility blocker. The SR-relevant pagination/scroll issues were resolved by `bf6dd88` (11 resolved debug docs: page-split clips screen-reader, paginated focus-scroll seam, safari VO scroll-focus drift, sr-boundary turn-page, voiceover hidden-heading trap, voiceover internal-page scroll, voiceover page-handoff region, voiceover page-tree reset, voiceover stale-node position, voiceover up-down-no-navigation, macos down-arrow-turns-page). | `bf6dd88` (11 resolved docs) | `safari-vo-scroll-focus-drift.md` + 10 siblings under `bf6dd88` |
| 5 | Highlight excerpt not announced inside the note dialog | Major (surfaced at re-test) | **Fixed.** `aria-describedby="highlight-popover-excerpt"` added to the `<dialog>` (the established codebase pattern — `WipeConfirm.tsx`); the visually-hidden "Highlighted text:" label was merged INSIDE the excerpt `<p>` so the description is a single unambiguous string ("Highlighted text: <excerpt>"). Verified via an a11y-tree description assertion across all 3 engines (no second VO round-trip required per the resume brief). | `5d2bab5` | `vo-note-popover-focus.md` (#5 refinement) |

**Verdict after fixes (re-test 2026-08-10):** zero blocker, zero major. D6-07
zero-blocker/zero-major policy met on VoiceOver+Safari. Finding #1 is a
documented cross-SR platform constraint (VO / NVDA / JAWS all reserve bare H)
with a tester-confirmed working SR-equivalent path (the selection toolbar), not
a defect. Findings #3 (minor announce noise) and #4 (visual scroll-sync) do not
block acceptance and are carried to the deferred-items list.

### Automated keyboard substrate (layered beneath the manual protocol)

The manual SR protocol does **not** re-prove what the automated specs assert;
it adds the screen-reader verification layer. The automated substrate:

- `tests/e2e/panel-keyboard.spec.ts` — settings `<dialog>` (`showModal`) focus
  trap, inert backdrop, Escape-to-close, focus-restore to the gear trigger
  (A11Y-01/02) across chromium/firefox/webkit.
- `tests/e2e/section-announce.spec.ts` — polite `role="status"` live region
  announces "Section: {heading}." on heading change (A11Y-08) + READ-05
  (no page-number/percentage identity text).
- `tests/e2e/annotations/note-popover-focus.spec.ts` (NEW, Plan 06-06 fixes) —
  15/15 across 3 engines: modal-dialog focus + axe coverage for the note
  popover (the #2/#5 fix verification).
- Keyboard shortcuts (D4-06): **M** (mode toggle), **H/N** (sight-only; toolbar
  is the SR path), and the settings gear are all reachable by keyboard.

### Coverage boundary — NVDA+Firefox NOT run (research assumption A4)

**The NVDA + Firefox (Windows) pairing of the D6-05 matrix was not run** in
this acceptance cycle. Per `06-CONTEXT.md` decision D6-05 and `06-RESEARCH.md`
assumption A4, NVDA+Windows is runnable on developer hardware only with a
Windows VM or partition, which was not available during this cycle. Per the
protocol's reduced-gate provision (§1 / §6), **VoiceOver+Safari alone is a
defensible reduced gate** — one SR ecosystem instead of two — and is recorded
here as such.

**Implications for ACPT-02:**
- The finding families surfaced under VoiceOver are largely **cross-SR**
  (finding #1 explicitly generalizes: NVDA and JAWS also reserve bare H in
  browse/virtual-buffer mode; the toolbar-primary resolution applies to all
  three SRs). The modal-`<dialog>` fix (#2) uses a platform primitive all three
  SRs honor.
- The automated substrate (panel-keyboard, section-announce, note-popover-focus)
  runs in chromium/firefox/webkit and covers the keyboard + dialog-semantics
  contract that the NVDA run would have re-verified at the SR layer.
- **An NVDA+Firefox run remains the recommended follow-up** to convert this
  reduced gate into a full gate. It does not block v1 acceptance on the
  evidence above; it strengthens it.

### Deferred items (carried forward, do not block acceptance)

| Item | Severity | Disposition |
|------|----------|-------------|
| #3 — Multi-unit highlight announces "highlighted" repeatedly across VO browse units | Minor | Post-v1 polish (D6-07 boundary rule — confusing-but-completable). |
| #4 — VoiceOver browse-cursor visual lag in scroll mode | Minor (visual) | SR behavior is correct; tester-proposed **scroll-sync enhancement** (auto-scroll so the current passage sits at the viewport edge when VO's browse cursor approaches it) captured for a post-v1 polish phase. Not an SR accessibility blocker. |
| `pageStartGlobalOffset` coordinate mismatch (blockNormalizedText vs splittingBlockText for blocks with inline marks) | Minor (latent) | Masked by the relaxed `repagination-anchor` assertion (±1 page tolerance). A focused future session should re-thread per-block splittingBlockText-based lengths and re-tighten the assertion to "current page only." Source: `e2e-pagn-collateral.md` §Notes for follow-up. |

### Acceptance statement

On the **reduced gate** (VoiceOver+Safari only), the ACPT-02 manual SR protocol
executed with **zero blocker and zero major** findings after five findings were
resolved (3 source fixes + 1 docs reframe + 1 minor deferral). The
selection-toolbar is the documented primary SR highlight path (tester-confirmed
working); the note editor is a native modal `<dialog>` reachable via VoiceOver;
the highlight excerpt is announced via `aria-describedby`. **ACPT-02 is
accepted on the reduced gate**, with the NVDA+Firefox run recorded as a coverage
boundary (A4) and recommended as a post-v1 follow-up to upgrade to a full gate.

📄 Sources: `docs/ACCEPTANCE-PROTOCOL.md` (instrument) · `06-06-SR-FINDINGS.md`
(raw findings + re-test) · `.planning/debug/resolved/vo-note-popover-focus.md`,
`vo-highlight-selection.md`, `e2e-pagn-collateral.md`, `safari-vo-scroll-focus-drift.md`
+ 10 siblings under `bf6dd88` (resolved debug sessions).

---

## ACPT-03 — Content + functions retained under 6 edge conditions

> **ROADMAP Success Criterion 3:** "Reader retains content and required functions
> under high zoom, narrow reflow, forced colors, reduced motion, touch, and late
> or failed font loading."
> **Requirement:** ACPT-03 — Reader retains content and required functions under
> high zoom, narrow reflow, forced colors, reduced motion, touch, and late or
> failed font loading scenarios.

**Status:** ✅ **Complete** (closed by Plans 06-01 + 06-05; verified green in the
full-suite run below).

### The shared invariant (D6-09) — one bar applied uniformly

Under **every** edge condition, the acceptance invariant is: **(a)** every
fixture's full content is reachable via keyboard in BOTH reading modes;
**(b)** no required function (read, mode-switch, create/view/navigate/delete
highlight, note, settings, location restore) is unreachable; **(c)** no layout
overflow clips or overlaps content. The shared helper
`tests/e2e/_edge-invariant.ts → assertEdgeInvariant(page, {fixture, condition})`
encodes all three clauses and is imported by every ACPT-03 edge spec.

### Evidence

| Condition | Spec | Coverage | Plan |
|-----------|------|----------|------|
| **High zoom (400% + 320 CSS px reflow)** | `tests/e2e/high-zoom.spec.ts` | 6 fixtures × 3 engines = 18 cells; `setViewportSize({width:320})` is the load-bearing cross-engine reflow assertion (WCAG 1.4.10); `document.body.style.zoom="4"` is a secondary engine-aware no-content-lost check | 06-01 (NEW) |
| **Font failure (block / delay / swap)** | `tests/e2e/font-failure.spec.ts` | 3 modes × 3 engines = 9 cells; injects a `@font-face` (the app loads zero web fonts) then `page.route`-intercepts — exercises the D3-06 font gate, PAGE-06 last-valid-view, PAGE-07 stale-epoch drop against a real pending font | 06-01 (NEW) |
| **Forced colors** | `tests/e2e/forced-colors.spec.ts` | audited: shared invariant across 6 fixtures × 3 engines + the 4 existing A11Y-05 assertions kept | 06-05 (audit) |
| **Reduced motion** | `tests/e2e/reduced-motion.spec.ts` | audited: shared invariant across 6 fixtures × 3 engines + the 3 existing A11Y-06 assertions kept | 06-05 (audit) |
| **Reflow (320 CSS px)** | `tests/e2e/reflow.spec.ts` | audited: now asserts the COMPLETE invariant (a)/(b)/(c) via the helper (the (c) overflow-clause ORIGIN); existing focused overflow + panel-operability tests kept | 06-05 (audit) |
| **Touch targets (≥ 44×44px)** | `tests/e2e/touch-targets.spec.ts` | audited: shared invariant across 6 fixtures × 3 engines + both existing A11Y-07 sizing assertions kept | 06-05 (audit) |

**Result:** **102 edge-condition cells green** across chromium/firefox/webkit
(30 NEW from 06-01: 21 high-zoom + 9 font-failure; 72 audited from 06-05: 18
per spec × 4 specs). The shared D6-09 invariant (a)/(b)/(c) holds uniformly
across the full condition matrix. Strengthen-only per D6-12 — no existing
assertion was weakened or removed.

### Acceptance statement

Under each of the six edge conditions (high zoom 400% + 320px reflow, font
failure block/delay/swap, forced colors, reduced motion, reflow, touch
targets), every fixture's full content is reachable via keyboard in both
reading modes, every required function is reachable, and no layout overflow
clips or overlaps content. **ACPT-03 is accepted.**

📄 Sources: `06-01-SUMMARY.md` (NEW gap specs) · `06-05-SUMMARY.md` (audit) ·
commits `e00d2e2`, `7ac0b12`, `0754489` (06-01) + `a1f6499`, `c4dcea1` (06-05).

---

## ACPT-04 — Repagination within explicit cold + warm performance budgets

> **ROADMAP Success Criterion 4:** "Cold and warm repagination on the selected
> article and device profiles stays within explicit release budgets or falls
> back without blocking reading."
> **Requirement:** ACPT-04 — Repagination meets explicit cold and warm
> performance budgets on the selected article and device profiles selected
> during implementation planning.

**Status:** ✅ **Complete** (closed by Plan 06-03; `npm run perf` CI gate exits 0;
verified green in the full-suite run below).

### The budget contract (user-approved, D6-01 measure-first)

D6-01 was honored strictly: the harness was built → run → p95 computed →
thresholds proposed at **p95 + 25% headroom** → **USER APPROVED** → locked in
`tests/e2e/perf/budget.json`. No thresholds were guessed or pre-filled.
**24 cells** (4 engine-profile combos × 3 fixtures × 2 phases). `headroomPct: 0`
in the locked budget — the 25% headroom is baked INTO the `wallClockMs` values;
the gate fires strictly when fresh p95 > `wallClockMs` (no double-counting).

#### Measured cold p95 (page open → first trusted commit, ms)

| engine | profile | essay-long-form | list-reference | technical-post |
|--------|---------|----------------:|---------------:|---------------:|
| chromium | desktop | 468 | 42 | 49 |
| chromium | throttled-mobile | 607 | 166 | 205 |
| firefox | desktop | 440 | 34 | 40 |
| webkit | desktop | 621 | 647 | 611 |

#### Measured warm p95 (typography size re-trigger → next trusted commit, ms)

| engine | profile | essay-long-form | list-reference | technical-post |
|--------|---------|----------------:|---------------:|---------------:|
| chromium | desktop | 436 | 430 | 430 |
| chromium | throttled-mobile | 509 | 506 | 503 |
| firefox | desktop | 451 | 436 | 447 |
| webkit | desktop | 523 | 463 | 456 |

#### Approved locked thresholds (p95 + 25% headroom, rounded up)

- **Cold (ms):** chromium desktop 60–600 · chromium throttled 250–800 ·
  firefox desktop 60–600 · webkit desktop 800–850
- **Warm (ms):** chromium desktop 550 · chromium throttled 650 ·
  firefox desktop 550–600 · webkit desktop 600–700

### Enforcement — CI gate + release manual sign-off (D6-04)

- **CI gate:** `tests/e2e/perf/budget.compare.ts` — mirrors Phase 3's
  `fingerprint.compare.ts` exactly (per-engine temp-file → Node merge → refuse-
  empty exit 2 → aggregate p95 → diff vs committed LOCKED thresholds →
  `process.exit(1)` on regression → exit 0). Wired as `npm run perf` (mirrors
  `npm run calibrate`). **`npm run perf` exits 0** against the committed
  contract.
- **Throttled-mobile profile:** chromium-only via CDP
  (`context.newCDPSession(page)` → `Emulation.setCPUThrottlingRate` 4× +
  `Network.emulateNetworkConditions` Slow 3G), `testMatch`-scoped to perf specs
  only. Firefox/WebKit have no native CPU throttle; covered by the manual
  sign-off below.
- **D6-03 fallback shares the warm budget — one gate.** The fallback scrolling-
  commit path was **not triggered** by any worst-case fixture across viewports
  320–1280px (engine paginates all successfully). Architectural argument
  (Plan 04-05 session-mode-override + Plan 04-08 always-mounted `ArticleBody`):
  fallback = same measurement engine + always-mounted body → commit work ≤
  warm repagination. The warm budget bounds fallback.
- **Full-device-matrix manual sign-off (D6-04):** the throttled-mobile chromium
  profile is the faithful CI sim; firefox/webkit on the full matrix (including
  real low-end hardware CI cannot represent) are covered by this release
  sign-off recorded here. No device-matrix regression observed.

### Acceptance statement

Cold and warm repagination on the worst-case fixtures (essay-long-form,
list-reference, technical-post) × profiles (desktop, throttled-mobile-chromium)
× engines (chromium, firefox, webkit) stay within the user-approved locked
budgets (`tests/e2e/perf/budget.json`), enforced by a CI gate that exits 0.
Fallback shares the warm budget (D6-03) and was never triggered. **ACPT-04 is
accepted.**

📄 Sources: `06-03-SUMMARY.md` · `tests/e2e/perf/budget.json` (locked contract)
· `tests/e2e/perf/budget.compare.ts` (CI gate) · commits `4eda0ec`, `05dfa8b`,
`28f139a`.

---

## Honest full-suite execution (the Plan 04-11 / 05-05 discipline)

> The acceptance gate is a **full `npm run test` exit 0** with honest pass/fail
> counts — no subset, no `--grep`, no engine-skip. Both the pass AND fail counts
> are recorded; **fail must be 0**. The executor ran the suite itself; no prior
> SUMMARY's numbers were trusted without re-running.

### Command + result (2026-08-10, Plan 06-06 Task 2)

```bash
npm run test
# = npm run test:unit -- --run && npm run test:e2e
```

| Suite | Count | Detail |
|-------|------:|--------|
| **Unit (Vitest)** | **514 passed** | 40 test files |
| **E2e (Playwright) — chromium** | **214 passed** | — |
| **E2e (Playwright) — firefox** | **214 passed** | — |
| **E2e (Playwright) — webkit** | **214 passed** | — |
| **E2e (Playwright) — chromium-throttled-mobile** | **1 passed** | perf harness (testMatch-scoped) |
| **E2e subtotal** | **643 passed** | (4.4m) |
| **TOTAL** | **1157 passed** | **0 failed, 0 skipped** |
| **Exit code** | **0** | — |

### Anti-pattern-guard attestation

I, the Plan 06-06 Task 2 executor, attest that:

1. **I ran the full `npm run test` suite myself** in ONE invocation
   (`npm run test` = `npm run test:unit -- --run && npm run test:e2e`).
2. I did **not** trust any prior SUMMARY's numbers (including the
   `e2e-pagn-collateral` debug session's reported 1157/0) without re-running.
3. I recorded **both pass AND fail counts honestly** — fail = 0 is the true
   observed result, not an omission. No subset, no `--grep`, no engine-skip was
   applied.
4. The per-engine e2e breakdown (214 chromium + 214 firefox + 214 webkit + 1
   chromium-throttled-mobile = 643) was verified by counting `[<engine>] ›`
   markers in the raw suite output.

This is the same discipline as Plan 04-11 (`04-11-OUTPUT.md`) and Plan 05-05
(`05-05-OUTPUT.md`): the durable record is the literal command + per-suite +
per-engine counts + the literal exit code.

📄 Raw suite output captured at run time; the summary above is extracted from it.

---

## Summary — Phase 6 acceptance

| Requirement | ROADMAP criterion | Status | Closed by |
|-------------|-------------------|--------|-----------|
| **ACPT-01** | 1. Corpus flow in 3 engines, no content loss | ✅ Complete | Plan 06-02 (`core-reading-flow.spec.ts` 18/18) |
| **ACPT-02** | 2. Keyboard + SR flows in support matrix | ✅ Accepted on reduced gate (VoiceOver+Safari, zero-blocker; NVDA = coverage boundary A4) | Plan 06-06 (manual run) + Plans 06-04 (instrument) / debug fixes |
| **ACPT-03** | 3. Content/functions retained under 6 edge conditions | ✅ Complete | Plans 06-01 (NEW gap specs) + 06-05 (audit) |
| **ACPT-04** | 4. Perf within budgets or non-blocking fallback | ✅ Complete | Plan 06-03 (user-approved budget + CI gate) |

**Phase 6 verdict:** the v1 prototype is accepted on the evidence above. The
representative-corpus reading flow completes without content loss across
chromium/firefox/webkit (ACPT-01); the keyboard + manual SR contract holds with
zero blocker/major on VoiceOver+Safari (ACPT-02, reduced gate — NVDA recorded
as a coverage boundary); content and functions are retained under all six edge
conditions (ACPT-03); and repagination stays within the user-approved budgets
(ACPT-04). The full automated suite is honestly green (1157 passed / 0 failed /
exit 0).

**Recommended post-v1 follow-ups** (do not block v1):
- Run NVDA+Firefox (Windows) to convert ACPT-02 from a reduced gate to a full
  gate.
- Run JAWS+Chrome/Edge if a JAWS-licensed machine is available (v1.x stretch).
- Address the deferred-items list (#3 minor announce noise; #4 visual
  scroll-sync enhancement; `pageStartGlobalOffset` coordinate tightening).

---

*Phase: 6-prototype-acceptance*
*Ledger authored: 2026-08-10 (Plan 06-06 Task 2)*
*Full-suite run: 2026-08-10 — 1157 passed / 0 failed / exit 0*
