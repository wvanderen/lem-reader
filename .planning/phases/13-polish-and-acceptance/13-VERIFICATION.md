---
phase: 13-polish-and-acceptance
verified: 2026-08-19T16:25:00Z
status: human_needed
score: 7/8 must-haves verified
behavior_unverified: 0 # every code-level behavior-dependent truth had behavioral evidence (independent full-suite run + named unit specs)
overrides_applied: 0
human_verification:
  - test: "Run the ACPT-05 NVDA+Firefox acceptance protocol (Appendix §1 runbook) on Windows hardware: docs/ACCEPTANCE-PROTOCOL.md v1.0 as-documented — six scripted flows A–F + five exploratory charters 1–5, outcomes recorded as role + accessible name + state"
    expected: "Zero blocker and zero major findings (D6-07). Record results in Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only then (D13-07). Blocker/major findings follow fix-then-re-run (D13-06); minors are recorded and deferred."
    why_human: "Requires a real screen reader (NVDA) + Firefox on Windows hardware with a human tester; no automated harness can exercise SR announcement behavior — this is the deliberate D13-07 prepare-then-run-later design."
  - test: "Optionally run the VoiceOver+Safari supplementary checklist for the NEW v2.0 surfaces (Appendix §3: library/browse-search-tags, ingest incl. calm refusals, review panel, export/import dialogs, book groupings)"
    expected: "Findings recorded in Appendix §3.2 with the same severity rubric; NOT an ACPT-05 gate (D13-05) — supplementary evidence honoring the protocol's re-run rule for the five phases of new surfaces."
    why_human: "Requires VoiceOver + Safari on macOS with a human tester; explicitly supplementary, user's own schedule."
---

# Phase 13: Polish and Acceptance — Verification Report

**Phase Goal:** The v2.0 quality gate — eliminate the two known polish regressions, land the user-widened chrome polish (D13-12), and close acceptance across the supported browser matrix, mirroring v1.0 Phase 6.
**Verified:** 2026-08-19T16:25:00Z
**Status:** human_needed — 7/8 success criteria verified with independent behavioral evidence; SC#3 (ACPT-05) is deliberately pending the user-run acceptance protocol (D13-07 instrument-ships-now / requirement-closes-at-proof)
**Re-verification:** No — initial verification (the prior file content was the Plan 13-05 ACPT-05 instrument, not a verification; it is preserved verbatim as the Appendix)

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | SC#1 (POLISH-01): persisted reading mode/theme/typography paint first — no flash or snap (cold-load no-snap test passes) | ✓ VERIFIED | `src/settings/settingsMirror.ts` (single localStorage seam, Zod-at-read null-on-doubt, silent no-op writes); `index.html` inline pre-React script (before `/src/main.tsx`, setProperty/dataset only, 0 markup-string APIs); `SettingsContext.tsx` lazy-init (L73) + mirror writes in scheduleSave/flushSave (L152/172) + hydrate self-correct (L109-112) + `clearSettingsMirror` in resetLocalData (L241). Behavioral: 18 unit tests + cold-load-no-snap e2e 6/6 cells green in the verifier's own full-suite run. Wipe no-zombie + corrupt-fails-silent covered by tests |
| 2 | SC#2 (POLISH-02): progress bar reflects actual position — 1-page ≠ 100% on open, multi-page progresses from start (offset-anchored formula + boundary tests) | ✓ VERIFIED | `src/pagination/progress.ts` (`paginatedProgressRatio` = pageStartGlobalOffset/graphemeLength clamped [0,1]; composes ONLY the two shipped helpers — no forked walk); `ProgressHairline` ratio-only (page prop deleted; `rg 'page\?\?:'` → 0); `PaginatedSurface` wired (L611) with memoized ratio; PageIndicator byte-unchanged (last touched 04-03). Behavioral: 5 boundary unit tests + first-paint-progress e2e 6/6 cells green in verifier's run |
| 3 | SC#3 (ACPT-05): documented SR acceptance flows complete on NVDA+Firefox with zero blocker/major, closing v1.0 A4 boundary | ⏳ PENDING USER RUN — see Human Verification | The run has NOT happened (by design, D13-07). Instrument fully shipped and verified: Appendix §1 runbook + empty findings sheets + in-file flip condition; `docs/ACCEPTANCE-PROTOCOL.md` byte-unchanged since v1.0 (last commit c9bf30f). REQUIREMENTS.md honestly shows ACPT-05 `- [ ]` Pending. Cannot be automated — routes to human verification |
| 4 | SC#4 (ACPT-06): v2.0 core flow (ingest→read→highlight→export→re-import) across Chromium/Firefox/WebKit without content loss, AND full `npm run test` exits 0 | ✓ VERIFIED | `tests/e2e/portability/core-flow-spine.spec.ts` (444 lines, 3 cells, UI-driven end-to-end; D13-09 bar wired: 19 raw-IndexedDB/resolver references, five-row-kind byte-equality, confident re-resolution assertion, open/paginate/annotate/restore identity). **Verifier independently ran `npm run test` (2026-08-19): exit 0 — e2e 1057 passed / 0 failed / 6 skipped; unit leg green (chain reached e2e) — exactly reproducing recorded run 6 (2257/0/19).** Mid-flight 55-cell 13-04 fallout and repair honestly recorded in 13-06-OUTPUT.md (bisect → 27 spec realignments + 2 human-sanctioned production fixes `d89300b`/`8d7b558`+`f7b5734` + 360×640 realignment `14b99f4`) |
| 5 | SC#5 (POLISH-03): slim article header (title + essential controls), tags/metadata in render-once article-top spot, no internal header scrolling at 360×640 | ✓ VERIFIED | `ArticleView.tsx` slim pinned header = BackToLibrary + h1 (L1663-1675); metadata spot parent-owned/surface-mounted (`articleStartChrome` L1733-1734, reserve `metaSpotReservePx` threaded as `firstPageReservedPx`); engine additive param in `fragment.ts` (L145/L220, default 0) + sanctioned whole-fitting escape (L414); `header-geometry.spec.ts` asserts `scrollHeight ≤ clientHeight` at 360×640. Behavioral: 9/9 cells green in verifier's run; 11 firstPageReserved unit tests + 76 pagination suite green |
| 6 | SC#6 (POLISH-04): four centered modal dialogs open centered, not top-left | ✓ VERIFIED | `margin: auto` confirmed in all four blocks (`dialog.wipe-confirm` L676, `dialog.highlight-popover` L1484, `dialog.library-remove-confirm` L2069, `dialog.import-preview` L2281) with WHATWG §15.3.3 rationale comments; side sheets keep `margin: 0` (settings-panel L444, annotations-drawer L1708). Behavioral: dialog-centering e2e 12/12 cells (boundingBox ±24px both axes, 3 engines) green in verifier's run |
| 7 | SC#7 (POLISH-05): keyboard-reachable "Back to library" on article + review views; never exits app on deep link | ✓ VERIFIED | `BackToLibrary.tsx` (native button, history.back gated on `hasAppHistory`, else `location.hash = "#/"`); `App.tsx` flag flips only on routed post-mount hashchange (L167+); mounted at both header starts (ArticleView L1675, ReviewView L326). Behavioral: back-nav e2e 15/15 cells green (in-app return, fresh deep-link no-exit, review panel, keyboard) in verifier's run |
| 8 | SC#8 (POLISH-06): organized library home — continue reading / add content / library list within existing components | ✓ VERIFIED | `LibraryView.tsx`: header row (L207) + three ordered sections (continue L229 → add L236 → list L255); byte-stable anchors preserved (`main#main` L199, h1 "Saved articles" L209, `.status` live region L238, `ul.library-list` L268). Behavioral: library-tidy 6/6 cells + 81 library regression cells green in verifier's run |

**Score:** 7/8 truths verified (1 pending user run — ACPT-05)

### Required Artifacts

All 16 plan-declared artifacts verified via `verify.artifacts`: **16/16 passed** (exist + substantive). Key spot evidence: `settingsMirror.ts` 80 lines w/ 4 exports; `progress.ts` 46 lines pure; `BackToLibrary.tsx` 52 lines; `core-flow-spine.spec.ts` 444 lines; `header-geometry.spec.ts` 259 lines; `pdfTimeout.spec.ts` 114 lines; `firstPageReserved.test.ts` 430 lines; `mirror.test.ts` 18 tests; `13-VERIFICATION.md` instrument (Appendix).

### Key Link Verification

`verify.key-links`: 14/16 verified by tool; 2 reported NOT-WIRED are **tool parse limitations** (non-file-path `from` values: "index.html inline script", "src/app.css dialog.highlight-popover (and 3 sibling modal blocks)") — both manually verified WIRED: the inline script reads `lem-settings-mirror-v1` from localStorage and writes via `setProperty` before `/src/main.tsx` (index.html L50-85); the four dialog blocks carry `margin: auto` (see Truth 6). The third (token sync) is enforced by `mirror.test.ts`'s marker-extraction sync-check (green).

### Data-Flow Trace (Level 4)

Phase artifacts are UI/e2e surface changes whose data flow is proven end-to-end by the behavioral gate: the spine drives ingest→read→highlight→export→re-import through the real UI with raw IndexedDB row byte-equality; the mirror flows localStorage→inline-script→CSS and localStorage→lazy-init→React state with MutationObserver-timeline proof. No STATIC/HOLLOW/DISCONNECTED findings.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Honest full-suite gate (SC#4) | `npm run test` (verifier's own run, 2026-08-19) | exit 0 · e2e 1057 passed / 0 failed / 6 skipped · unit leg green | ✓ PASS |
| Mirror + progress + reserve + timeout unit specs | `npx vitest run tests/unit/server/pdfTimeout.spec.ts tests/unit/settings/mirror.test.ts tests/unit/pagination/progress-formula.test.ts tests/unit/pagination/firstPageReserved.test.ts` | 4 files, 37/37 passed | ✓ PASS |
| Phase spec enumeration | `npx playwright test <spine+chrome+polish> --list` | 57 cells in 7 files (spine 3) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional — the phase gate is the `npm run test` honest-suite record (13-06-OUTPUT.md), independently reproduced above (exit 0, counts matching recorded run 6).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POLISH-01 | 13-01 | First-paint settings, no flash/snap | ✓ SATISFIED | Truth 1 |
| POLISH-02 | 13-02 | Position-accurate progress bar | ✓ SATISFIED | Truth 2 |
| POLISH-03 | 13-04 | Slim header + render-once metadata spot | ✓ SATISFIED | Truth 5 |
| POLISH-04 | 13-03 | Centered modal dialogs | ✓ SATISFIED | Truth 6 |
| POLISH-05 | 13-04 | Back-to-library affordance | ✓ SATISFIED | Truth 7 |
| POLISH-06 | 13-03 | Organized library home | ✓ SATISFIED | Truth 8 |
| ACPT-05 | 13-05 | NVDA+Firefox SR acceptance flows | ⏳ NEEDS HUMAN | Instrument shipped + verified (Appendix); user run pending per D13-07; REQUIREMENTS.md honestly Pending |
| ACPT-06 | 13-06 | Core flow across browser matrix, no content loss | ✓ SATISFIED (current state) | Truth 4 — spine 3 cells + independent full-suite exit 0 |

No orphaned requirements: all 8 phase-mapped IDs appear in plan frontmatter; REQUIREMENTS.md maps no additional IDs to Phase 13.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tests/e2e/chrome/back-nav.spec.ts | 69 | 60ms `waitForTimeout` inside bounded Tab-walk retry | ℹ️ Info | Settle allowance between key presses with condition re-check — not a load-bearing sleep; plan 13-04 did not prohibit it; suite stable |
| tests/e2e/chrome/header-geometry.spec.ts | 64,165,181 | 600ms `waitForTimeout` settle (corpus-spec budget, commented) | ℹ️ Info | Post-guard settle before deterministic count/geometry assertions; corpus precedent; stable across engines |

No TBD/FIXME/XXX debt markers in any phase-modified file. No new packages (package.json untouched since 12-01). `return null` occurrences in `settingsMirror.ts` are the by-contract null-on-doubt seam, not stubs. Prohibition spot-checks all green: `innerHTML|insertAdjacentHTML|outerHTML` in index.html → 0; `PageIndicator.tsx`/`TagEntry.tsx`/`settingsStore.ts`/`applyTheme.ts` byte-unchanged since pre-phase-13 commits; side-sheet CSS byte-unchanged; `waitForTimeout` → 0 in the three specs whose plans prohibited it; no engine subsetting in gate invocations (attested + command history in OUTPUT).

### Human Verification Required

### 1. ACPT-05 — NVDA+Firefox acceptance run (the phase's remaining gate)

**Test:** Run the Appendix §1 runbook on Windows hardware (NVDA current stable + Firefox current stable): execute `docs/ACCEPTANCE-PROTOCOL.md` v1.0 exactly as documented — six scripted flows A–F, then five exploratory charters 1–5, recording outcomes as role + accessible name + state (never verbatim SR phrasing).
**Expected:** Zero blocker and zero major findings (D6-07). Fill Appendix §1.3 findings table, §1.4 per-flow checklist, and the run verdict. ACPT-05 flips from Pending only when results land here with zero blocker/major (D13-07); blocker/major findings follow fix-then-re-run (D13-06); minors are recorded and deferred.
**Why human:** Requires real NVDA+Firefox on Windows with a human tester — no automated harness can exercise screen-reader behavior; this is the deliberate prepare-then-run-later design (D13-07).

### 2. VoiceOver+Safari supplementary re-run (NOT an ACPT-05 gate)

**Test:** When convenient on macOS, run the Appendix §3 checklist over the five NEW v2.0 surface groups (library browse/search/tag filter; ingest incl. calm refusals; review panel jump/curate; export/import dialogs; book groupings + chapter nav).
**Expected:** Findings recorded in Appendix §3.2 with the §5 severity rubric; supplementary evidence only (D13-05) — honors the protocol's re-run rule for the material surface change of Phases 7–12.
**Why human:** Requires VoiceOver + Safari with a human tester; explicitly not gating.

### Gaps Summary

**No code gaps.** All seven automatable success criteria are verified with independently reproduced behavioral evidence (the verifier re-ran the full honest gate: exit 0). The single open item is the designed-in ACPT-05 user run.

### Notes & Process Observations (non-blocking)

1. **Premature ACPT-06 checkbox flip (sequence, now substantively true):** REQUIREMENTS.md ACPT-06 was flipped to `[x]` in commit `f1a306f` — AFTER the exit-1 gate record (`df88aeb`) but BEFORE the post-merge repair (`38c7b6a..dfc8828`) that made the gate green. At flip time the recorded honest gate was RED, violating the closes-at-proof discipline. The CURRENT state genuinely satisfies ACPT-06 (spine green + verifier's own `npm run test` exit 0, counts matching recorded run 6: 2257/0/19), so the requirement stands — but the sequence is recorded here for process integrity. The 13-06-OUTPUT.md §Repair record is honest and complete (bisect evidence, 7 spec-realignment commits, 2 sanctioned production fixes, no-subsetting attestations).
2. **ROADMAP Phase 13 pre-marking:** the `[x] … completed 2026-08-19` checkbox was written in the same `f1a306f` commit. Substantively accurate now for 7/8 SCs; SC#3 remains open by design. The v2.0 milestone must NOT close until ACPT-05 flips per D13-07 (the REQUIREMENTS.md Pending row is the honest tracker).
3. **Minimum paginated viewport (future product decision):** the repair realigned 15 epub/a11y cells from 360×480 to 360×640 because the Option A metadata-spot physics (~209px spot in a 251px page-1 box) make paginated page 1 impossible at 480-height — the guard's calm scrolling fallback is the honest outcome there. 13-06-OUTPUT documents this as a possible future product decision (minimum supported paginated viewport); surfaced for human awareness, not a gap.
4. **firefox `search-tag-filter` auto-prune flake** (1-in-3 class): did not fire in runs 4-6 nor in the verifier's run; tracked under the 12-08 expect.poll-strengthening protocol if it recurs.
5. **Human decisions this phase are recorded:** Option A `firstPageReservedPx` (13-04) and the sanctioned repairs A+B in STATE.md decisions; Option A payload-helper extraction (13-06) in the 13-06 SUMMARY §Rule 4 and docs commits (`f1a306f`).

---

# Appendix — ACPT-05 Acceptance Record (instrument, preserved verbatim from Plan 13-05)

> The verification report above is the authoritative phase verification. Everything from this line down is the
> Plan 13-05 Task 1 instrument (commit `2f5a139`), preserved byte-intentionally with its original section
> numbering (§1/§2/§3 — referenced externally, e.g. by 13-05-SUMMARY). Fill §1.3/§1.4 and the verdict when
> the NVDA+Firefox run happens; ACPT-05 flips only then (D13-07).

**Phase:** 13 — Polish and Acceptance
**Instrument:** `docs/ACCEPTANCE-PROTOCOL.md` v1.0 (unmodified — D13-04)
**Prepared:** 2026-08-19 (Plan 13-05 Task 1)
**Ledger status:** Pending user run (see §2 — the flip condition)

---

## 1. ACPT-05 — NVDA+Firefox acceptance run

> **Requirement:** ACPT-05 — Reader can complete the documented screen-reader
> acceptance flows on NVDA+Firefox, closing the v1.0 ACPT-02 reduced-gate
> coverage boundary (A4).

### 1.1 Environment prerequisites

| Item | Requirement |
|------|-------------|
| Screen reader | **NVDA** — current stable release |
| Browser | **Firefox** — current stable release |
| Hardware/OS | **Windows** (native hardware or a setup the tester considers representative of their reading environment) |
| App | Lem Reader dev server: `npm run dev` → http://localhost:5173 |
| Clean state | Follow the protocol's Setup (§3): wipe local data before the run (settings → "Clear local data", or clear the `lem-reader` IndexedDB), then reload |

Record the actual environment when the run happens:

| Field | Value |
|-------|-------|
| Run date(s) | _____________ |
| Tester | _____________ |
| NVDA version | _____________ |
| Firefox version | _____________ |
| Windows version | _____________ |

### 1.2 Run instructions — the protocol AS-DOCUMENTED (D13-04)

Run `docs/ACCEPTANCE-PROTOCOL.md` **v1.0 exactly as documented** — no v2.0
addendum (a v2.0-surface extension is a recorded deferred idea, not part of
this run):

1. Execute the **six v1.0 scripted flows (§3)** in order, A through F:
   Flow A — Open article and read end-to-end · Flow B — Switch reading mode
   (M) · Flow C — Create a highlight · Flow D — View, edit, and delete a
   highlight + note (drawer) · Flow E — Navigate from a saved annotation back
   to its passage · Flow F — Adjust settings.
2. Execute the **five exploratory charters (§4)** in order, 1 through 5:
   Charter 1 — Full reading + annotation loop, SR-only · Charter 2 — Every
   fixture, end-to-end, both modes · Charter 3 — Fallback orientation ·
   Charter 4 — Edge conditions under SR · Charter 5 — Discoverability without
   prior knowledge.
3. Record each step's outcome using the protocol's **Pitfall 7 discipline
   (§2)**: verify and record **role + accessible name + state** — the
   programmatically stable properties — and **never verbatim screen-reader
   phrasing**. Phrasing observations (what the synthesizer happened to say)
   are informational only: record them as **minor** findings in the findings
   table, never as pass/fail criteria.
4. Classify every finding with the **severity rubric (§5, D6-07)**: blocker /
   major / minor. **Pass = zero blocker AND zero major.** An announcement that
   is confusing but where the step still completes correctly is **minor**
   unless content or a required function is lost or unreachable (then major
   or blocker).

### 1.3 Findings record sheet (empty — fill as the run proceeds)

Same shape as the Phase 6 ledger. One row per finding; append rows as needed.

| Finding id | Flow / charter | Severity (blocker\|major\|minor) | Observed outcome (role + accessible name + state) | Expected outcome (role + accessible name + state) | Status (open\|fixed\|deferred) |
|------------|----------------|----------------------------------|---------------------------------------------------|---------------------------------------------------|--------------------------------|
| — | — | — | — | — | — |

_(no findings recorded yet — the run has not happened)_

### 1.4 Per-flow / per-charter pass checklist (six flows + five charters)

Record PASS or the highest finding severity observed in that flow/charter
(§5 rubric), plus a note if useful.

| # | Flow / charter | Result (☐ PASS / severity) | Notes |
|---|----------------|----------------------------|-------|
| A | Open article and read end-to-end | ☐ | |
| B | Switch reading mode (M) | ☐ | |
| C | Create a highlight | ☐ | |
| D | View, edit, delete a highlight + note (drawer) | ☐ | |
| E | Navigate from a saved annotation back to its passage | ☐ | |
| F | Adjust settings (typography / theme / measure) | ☐ | |
| 1 | Charter — Full reading + annotation loop, SR-only | ☐ | |
| 2 | Charter — Every fixture, end-to-end, both modes | ☐ | |
| 3 | Charter — Fallback orientation | ☐ | |
| 4 | Charter — Edge conditions under SR | ☐ | |
| 5 | Charter — Discoverability without prior knowledge | ☐ | |

**Run verdict (fill at completion):** _____________
_(PASS = zero blocker and zero major across all eleven rows)_

---

## 2. D13-07 status note — when ACPT-05 flips

**ACPT-05 remains Pending.** This plan (13-05) ships the instrument only —
the runbook and empty record sheets above. Per D13-07
(instrument-ships-now / requirement-closes-at-proof, the 04-02 and 06-04
precedent):

- ACPT-05 flips from Pending to complete **only when the user-run results
  land in this file** (§1.3 findings + §1.4 checklist + verdict filled in)
  with **zero blocker and zero major findings** (D6-07 pass policy).
- **Blocker/major findings do not fail the requirement outright** — they
  follow the **fix-then-re-run policy (D13-06, the 06-06 precedent)**: the
  finding is fixed in-phase, and the affected flow(s) are re-run until zero
  blocker/major remains. The flip happens at that point.
- **Minor findings are recorded and deferred** — they never block the flip.
- Until then, the `ACPT-05` checkbox in `.planning/REQUIREMENTS.md` stays
  **unchecked**.

---

## 3. Supplementary — VoiceOver+Safari re-run (v2.0 surfaces)

> **This is supplementary evidence, explicitly NOT an ACPT-05 gate (D13-05).**
> It honors the protocol's own re-run rule (§7: re-run on any material change
> to the reader surface — Phases 7–12 added five phases' worth of new
> surfaces) without extending the v1.0 protocol document itself. It runs on
> the user's macOS hardware when ready, on the user's own schedule, and its
> findings follow the same severity rubric (§5) and fix-then-re-run policy
> (D13-06). A blocker/major here is recorded and fixed like any other
> finding, but it does not gate ACPT-05.

### 3.1 Scope — the NEW v2.0 surfaces only

The v1.0 flows (§3 of the protocol) were already executed under
VoiceOver+Safari in Phase 6 (see the 06-VERIFICATION ledger). This re-run
covers only surfaces that did not exist then. Same outcome discipline applies
(Pitfall 7: role + accessible name + state, never verbatim SR phrasing).

| # | v2.0 surface group | What to exercise (goal-oriented) | Result (☐ PASS / severity) | Notes |
|---|--------------------|----------------------------------|----------------------------|-------|
| V1 | **Library browse / search / tag filter** | Browse the saved-articles list; use the library search; filter by tag; open an article from a row; confirm row information (title, source, progress) is announced and reachable | ☐ | |
| V2 | **Ingest form — including calm refusal outcomes** | Add content through the ingest form (e.g. a `.md` file); then trigger at least one calm refusal (e.g. a corrupt or over-cap PDF) and confirm the refusal lands as calm, jargon-free copy in the status region — never an error dump | ☐ | |
| V3 | **Review panel — jump / curate** | Open the review panel; jump from a review row back to its highlighted passage; curate (edit a review note, delete a highlight via its confirm dialog) | ☐ | |
| V4 | **Export / import dialogs** | Build and download an export bundle from settings; import a bundle through the preview dialog (proceed, and one skip/conflict path); confirm dialog focus behavior and announced outcomes | ☐ | |
| V5 | **Book groupings — expand/collapse + chapter navigation** | Expand a book grouping in the library; open its chapter list; open a chapter; navigate between chapter chrome and back to the library | ☐ | |

### 3.2 VO findings record sheet (empty — fill as the run proceeds)

Same shape as §1.3.

| Finding id | Surface group | Severity (blocker\|major\|minor) | Observed outcome (role + accessible name + state) | Expected outcome (role + accessible name + state) | Status (open\|fixed\|deferred) |
|------------|---------------|----------------------------------|---------------------------------------------------|---------------------------------------------------|--------------------------------|
| — | — | — | — | — | — |

_(no findings recorded yet — the run has not happened)_

---

*Phase: 13-polish-and-acceptance*
*Instrument prepared: 2026-08-19 (Plan 13-05 Task 1) — awaiting user runs*
*Phase verification: 2026-08-19T16:25:00Z — status human_needed (7/8 SCs verified; ACPT-05 user run pending)*

---

_Verified: 2026-08-19T16:25:00Z_
_Verifier: the agent (gsd-verifier)_
