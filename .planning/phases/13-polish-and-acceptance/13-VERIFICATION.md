---
phase: 13-polish-and-acceptance
verified: 2026-08-19T23:10:00Z
status: human_needed
score: 7/8 must-haves verified
behavior_unverified: 0 # every code-level behavior-dependent truth had behavioral evidence (verifier's own 45-cell targeted runs + recorded honest full-suite gate)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 7/8
  gaps_closed:
    - "G1: Add-a-Page section breaks library width measure (POLISH-06) — closed by 13-07 (7d87c34)"
    - "G2: No way to remove a queued upload file; state persists after upload until refresh — closed by 13-08 (237038a, 12db798)"
    - "G3: Emoji trash icon in LibraryRow.tsx — closed by 13-09 plan cycle's sibling 13-07 (9314152)"
    - "G4: First-load jump in paginated mode — closed by 13-09 (a2c6f19, 7a5d4f0)"
    - "G5: Tag affordance → top-bar popover + compact provenance spot + drawer export — closed by 13-10 (3977351, 4a2b85b)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run the ACPT-05 NVDA+Firefox acceptance protocol (Appendix §1 runbook) on Windows hardware: docs/ACCEPTANCE-PROTOCOL.md v1.0 as-documented — six scripted flows A–F + five exploratory charters 1–5, outcomes recorded as role + accessible name + state"
    expected: "Zero blocker and zero major findings (D6-07). Record results in Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only then (D13-07). Blocker/major findings follow fix-then-re-run (D13-06); minors are recorded and deferred."
    why_human: "Requires a real screen reader (NVDA) + Firefox on Windows hardware with a human tester; no automated harness can exercise SR announcement behavior — this is the deliberate D13-07 prepare-then-run-later design."
  - test: "Optionally run the VoiceOver+Safari supplementary checklist for the NEW v2.0 surfaces (Appendix §3: library/browse-search-tags, ingest incl. calm refusals, review panel, export/import dialogs, book groupings)"
    expected: "Findings recorded in Appendix §3.2 with the same severity rubric; NOT an ACPT-05 gate (D13-05) — supplementary evidence honoring the protocol's re-run rule for the five phases of new surfaces. NOTE: the G4/G5 surface changes (paginated placeholder, tag popover, drawer export) post-date the previous cycle — worth including in the walkthrough."
    why_human: "Requires VoiceOver + Safari on macOS with a human tester; explicitly supplementary, user's own schedule."
---

# Phase 13: Polish and Acceptance — Verification Report

**Phase Goal:** The v2.0 quality gate — eliminate the two known polish regressions, land the user-widened chrome polish (D13-12), and close acceptance across the supported browser matrix, mirroring v1.0 Phase 6.
**Verified:** 2026-08-19T23:10:00Z
**Status:** human_needed — all five review gaps (G1–G5) closed with independently reproduced behavioral evidence; 7/8 success criteria verified; SC#3 (ACPT-05) remains the designed user-run gate (D13-07)
**Re-verification:** Yes — after gap closure (previous cycle: gaps_found with G1–G5, 2026-08-19T16:25:00Z)

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | SC#1 (POLISH-01): persisted reading mode/theme/typography paint first — no flash or snap (cold-load no-snap test passes) | ✓ VERIFIED (regression) | Artifacts intact post-gap-closure: `settingsMirror.ts` (80 lines, 4 exports), `index.html` inline pre-React script, SettingsContext lazy-init + mirror writes. G4 extended this SC's mode-surface aspect (see Truth 9 / G4) without disturbing the settings-token contract — byte-freeze confirms `settingsStore.ts`/`applyTheme.ts` byte-unchanged; cold-load-no-snap green in the recorded honest gate |
| 2 | SC#2 (POLISH-02): progress bar reflects actual position — 1-page ≠ 100% on open, multi-page progresses from start | ✓ VERIFIED (regression) | `progress.ts` unchanged (last touched 13-02, Aug 18); G4 tightened the hairline gate to `!isPaginated` (ArticleView L1605) so the scrolling hairline never paints in paginated mode — first-paint-mode-surface scrolling twin green in verifier's run |
| 3 | SC#3 (ACPT-05): documented SR acceptance flows complete on NVDA+Firefox with zero blocker/major, closing v1.0 A4 boundary | ⏳ PENDING USER RUN — see Human Verification | Unchanged disposition, carried forward honestly: the run has NOT happened (by design, D13-07). Instrument intact below (Appendix §1 runbook + blank record sheets §1.3/§1.4). REQUIREMENTS.md shows ACPT-05 `- [ ]` Pending. Cannot be automated |
| 4 | SC#4 (ACPT-06): v2.0 core flow (ingest→read→highlight→export→re-import) across Chromium/Firefox/WebKit without content loss, AND full `npm run test` exits 0 | ✓ VERIFIED | `core-flow-spine.spec.ts` (444 lines) — **verifier re-ran it post-gap-closure: 3/3 engines green (2026-08-19)**, exercising the G4 placeholder + G5 restructured chrome end-to-end. Recorded honest gate (13-10 run 4, after last code commit e56b900): exit 0 — unit 1200/0/13 + e2e 1084/0/6 (10.2m). Verifier's own 45 targeted cells green across the four gap-closure contracts |
| 5 | SC#5 (POLISH-03, **amended 2026-08-19 per G5 user review**): slim article header; tag affordance from a top-bar icon popover beside highlights/mode controls; article-top spot is a compact provenance block; no internal header scrolling at 360×640 | ✓ VERIFIED | Amendment implemented by 13-10: `tags-trigger` icon button in Header (aria-label "Article tags", aria-expanded, before annotations trigger) + `popover="auto"` role=dialog panel wrapping byte-unchanged TagEntry (ArticleView L1978-1987) with toggle-event close seam + focus restore; `articleTopMeta` compacted to byline·date + `p.book-context` + source link with ZERO buttons (L1557-1592); `.article-top-actions` deleted from component AND css (0 matches both). No-scroll clause: header-geometry "slim header has no internal scrolling at 360×640" — **verifier's own run: 9/9 cells green**, incl. zero-buttons-in-spot + render-once + unmount-after-turn |
| 6 | SC#6 (POLISH-04): four centered modal dialogs open centered, not top-left | ✓ VERIFIED (regression) | `margin: auto` present in all four blocks (dialog.wipe-confirm L669, dialog.highlight-popover L1479, dialog.library-remove-confirm L2145, dialog.import-preview L2357); recorded green in honest gate |
| 7 | SC#7 (POLISH-05): keyboard-reachable "Back to library" on article + review views; never exits app on deep link | ✓ VERIFIED (regression) | `BackToLibrary.tsx` intact (hasAppHistory gate + `#/` fallback); ArticleView/ReviewView mounts unchanged by gap closure; recorded green in honest gate |
| 8 | SC#8 (POLISH-06): organized library home — continue reading / add content / library list within existing components | ✓ VERIFIED (strengthened by G1) | LibraryView three ordered sections + byte-stable anchors intact (main#main L199, h1 L209, `.library-section-add` L236, `ul.library-list` L268). G1 closed the user-review measure gap: `.library-section-add { max-width: 1100px; margin-inline: auto }` (app.css L2033-2036). **Verifier's own run: library-tidy 9/9 cells green** incl. the new measure-parity test (≤1100 wide + 1px center parity vs `.library-list` at 1400×900; equal width at 360×640) |

**Score:** 7/8 truths verified (1 pending the designed user run — ACPT-05)

## Gap Closure Verification (re-verification focus — G1–G5)

Full three-level verification (exists / substantive / wired) plus behavioral evidence for each gap:

| Gap | Against | Level 1-3 (exists/substantive/wired) | Behavioral evidence | Status |
|-----|---------|--------------------------------------|---------------------|--------|
| G1 — add-section shared measure | POLISH-06 | CSS rule present (app.css L2033); spec test "add section shares the library measure (G1)" with wide+narrow viewport cells; `.library-section-add` wrapper in LibraryView L236 carries the class under test | library-tidy.spec.ts 3/3 engines green in verifier's own run (13s) | ✓ CLOSED |
| G2 — upload-queue reset | Upload control (ING-03) | `resetFilePick()` helper (IngestControl L148-151: clears input value + setHasFile(false)); 11 references wired — Remove file button (type="button", `article-export-highlights ingest-remove-file`, disabled={submitting}, L418-428) + every terminal exit of handleFileSubmit; upload-queue.spec.ts 184 lines, 3 tests reusing epub fixtures | upload-queue.spec.ts 9/9 cells green in verifier's own run (remove-before-upload, EPUB-success reset w/o refresh, refusal reset + same-file re-pick) | ✓ CLOSED |
| G3 — SVG trash icon | Icon policy (D13-12) | `TrashIcon` local component (LibraryRow L145-170): 20×20, viewBox 0 0 24 24, fill none, stroke currentColor, strokeWidth 1.75, round caps/joins, aria-hidden, focusable=false — GearIcon anatomy; `.library-row-remove` quiet icon-button rule (app.css L1864-1880, var(--touch), hover → var(--destructive) on color AND border-color); aria-label template byte-identical | Emoji sweep over src/: **zero matches** (verifier's own grep); remove-cascade/dialog-centering recorded green (accessible name unchanged) | ✓ CLOSED |
| G4 — paginated first-paint placeholder | POLISH-01/02 mode-surface aspect | `paginatedPending = isPaginated && !paginatedActive` (ArticleView L1536) + pending branch (L1857+) rendering the hidden `.article-body-measurement` clone + `.page-viewport` > `p.meta[role=status]` "Preparing pages…" (L1887); article/main/hairline classes gate on `isPaginated` (L1714/L1616/L1605); geometry gate `if (!isPaginated \|\| trustedView === null) return;` before the height read (L894) preserves the 05-06/13-04 measure-once contract; first-paint-mode-surface.spec.ts 341 lines, 2 tests, plain-JS navigation-start recorder | first-paint-mode-surface.spec.ts 6/6 cells green in verifier's own run — zero pre-fragment visible blocks (the G4 must-not), placeholder observed, no class drop, scrolling twin unregressed | ✓ CLOSED |
| G5 — tag popover + compact spot + drawer export | POLISH-03 (amended SC) | Header `tags-trigger` + TagIcon SVG; App tagsOpen lifted state + view-swap reset + prop threads; ArticleView popover surface (`popover="auto"`, role="dialog", aria-label "Article tags", toggle-event close seam, activeElement capture L300 + focus restore on closed L317-321) wrapping byte-unchanged TagEntry; compact `articleTopMeta` (zero buttons); AnnotationsDrawer Export button via onExportHighlights/exportingHighlights props; `.article-top-actions` fully deleted; header-geometry strengthened (`.article-top-meta button` count 0, `.tag-entry` total 1, drawer export count 1); portability highlights-export realigned with drawer-open step | tag-popover.spec.ts 9/9 cells green in verifier's own run (open/edit/persist via library re-derivation/light-dismiss/Esc/focus-restore + drawer export announce + axe zero serious/critical); header-geometry 9/9 green | ✓ CLOSED |

### Prohibition Spot-Checks (gap-closure plans)

| Prohibition | Result |
|-------------|--------|
| No emoji-as-icon anywhere in src/ (13-07) | ✓ VERIFIED — verifier's own sweep: 0 matches |
| No motion properties in added CSS lines (13-07) | ✓ VERIFIED — diff over 7d25da1..HEAD app.css added lines: 0 matches for transition/animation |
| No fixed sleeps in new specs (13-08/09/10) | ✓ VERIFIED — waitForTimeout grep over the three new specs: 0 matches |
| 13-08 touched no .css file | ✓ VERIFIED — diff 237038a^..12db798: 0 .css files |
| PaginatedSurface.tsx / fragment.ts / firstPageReserved.test.ts byte-unchanged (13-09) | ✓ VERIFIED — diff 7d25da1..HEAD: empty |
| TagEntry.tsx / PageIndicator.tsx / settingsStore.ts / applyTheme.ts byte-unchanged (13-10) | ✓ VERIFIED — diff 7d25da1..HEAD: empty |
| 09-07 header-row cap rule byte-unchanged (13-10) | ✓ VERIFIED — `grid-template-rows: minmax(auto, 25%) minmax(0, 1fr)` present (app.css); 0 diff lines touch minmax |
| No emoji glyphs introduced (13-10) | ✓ VERIFIED — TagIcon is inline-SVG; sweep still zero |
| Zero package installs (all four plans) | ✓ VERIFIED — package.json/package-lock.json untouched over 7d25da1..HEAD |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app.css` (G1/G3/G5 rules) | `.library-section-add` measure + `.library-row-remove` icon-button + `.tags-trigger`/`.tag-popover` + minimal `.article-top-meta` | ✓ VERIFIED | All present at cited lines; `.article-top-actions` deleted (0 matches) |
| `src/ingestion/library/LibraryRow.tsx` | TrashIcon inline-SVG glyph | ✓ VERIFIED | L145-170, GearIcon anatomy; aria-label template byte-identical |
| `src/ingestion/IngestControl.tsx` | resetFilePick + Remove file + terminal resets | ✓ VERIFIED | 11 wired references; button contract exact |
| `src/routes/ArticleView.tsx` | paginatedPending branch + popover surface + compacted articleTopMeta | ✓ VERIFIED | L1536, L1857-1888, L1978-1987, L1557-1592 |
| `src/reader/Header.tsx` | tags-trigger + TagIcon | ✓ VERIFIED | L116-122 trigger, L225+ glyph |
| `src/App.tsx` | tagsOpen state + reset + threads | ✓ VERIFIED | L157, L232-233, L258-259 |
| `src/reader/annotations/AnnotationsDrawer.tsx` | Export highlights via props | ✓ VERIFIED | L148-158, props L61-75 |
| `tests/e2e/library/upload-queue.spec.ts` | 3-test G2 contract, ≥60 lines | ✓ VERIFIED | 184 lines, 3 tests |
| `tests/e2e/polish/first-paint-mode-surface.spec.ts` | no-scroll-then-swap contract, ≥80 lines | ✓ VERIFIED | 341 lines, 2 tests + recorder |
| `tests/e2e/chrome/tag-popover.spec.ts` | popover contract incl. axe, ≥70 lines | ✓ VERIFIED | 251 lines, 3 tests |
| Regression artifacts (mirror, progress, BackToLibrary, spine) | intact | ✓ VERIFIED | Existence + wiring sanity-checked |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| tests/e2e/chrome/library-tidy.spec.ts | src/app.css | boundingBox parity on `.library-section-add` | ✓ WIRED (test green 3 engines) |
| LibraryRow.tsx | src/app.css | `.library-row-remove` styled rule | ✓ WIRED |
| tests/e2e/library/upload-queue.spec.ts | IngestControl.tsx | setInputFiles → Remove file → input value + disabled state | ✓ WIRED (test green) |
| ArticleView.tsx | app.css | `paginated-surface` class on isPaginated | ✓ WIRED (recorder assertion green) |
| Header.tsx | App.tsx | tagsOpen/onToggleTags lifted state | ✓ WIRED |
| ArticleView.tsx | TagEntry.tsx | TagEntry inside popover surface | ✓ WIRED (byte-unchanged component) |
| AnnotationsDrawer.tsx | ArticleView.tsx | onExportHighlights → handleExportHighlights + live region | ✓ WIRED (drawer-export announce test green) |
| portability/highlights-export.spec.ts | AnnotationsDrawer.tsx | drawer-open step before Export role query | ✓ WIRED (recorded green in honest gate) |

### Data-Flow Trace (Level 4)

No STATIC/HOLLOW/DISCONNECTED findings. The popover writes real tags through the byte-frozen TagEntry → tagsStore path (tag-popover spec proves persistence via library re-derivation); the upload-queue reset drives real input state (same-file re-pick re-fires onChange — proven non-vacuously by the "Reading file…" transient-copy assertion); the placeholder branch feeds the real measurement engine (initial-pagination-even green in the recorded gate).

### Behavioral Spot-Checks (verifier's own runs, 2026-08-19)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| G1+G2+G4+G5 contracts (11 tests × 3 engines) | `npx playwright test tests/e2e/chrome/library-tidy.spec.ts tests/e2e/library/upload-queue.spec.ts tests/e2e/polish/first-paint-mode-surface.spec.ts tests/e2e/chrome/tag-popover.spec.ts` | 33 passed (13.0s) | ✓ PASS |
| Amended SC5 geometry contract | `npx playwright test tests/e2e/chrome/header-geometry.spec.ts` | 9 passed (10.3s) — incl. "slim header has no internal scrolling at 360×640" | ✓ PASS |
| SC4 spine post-gap-closure | `npx playwright test tests/e2e/portability/core-flow-spine.spec.ts` | 3 passed (10.2s) — full UI-driven ingest→read→highlight→export→re-import through the G4/G5 surfaces | ✓ PASS |
| Icon sweep | `grep -rn 🗑 src/` | 0 matches | ✓ PASS |
| Honest full-suite gate | (recorded by 13-10 as gate owner, run 4 after last code commit e56b900) | exit 0 — unit 1200/0/13 + e2e 1084/0/6 | ✓ RECORDED (not re-run this cycle; targeted 45-cell reproduction above) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional. The phase gate is the honest full-suite record (13-10 run 4: exit 0, counts above), corroborated by the verifier's 45 independent cells.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POLISH-01 | 13-01, 13-09 | First-paint settings, no flash/snap (+ mode-surface aspect) | ✓ SATISFIED | Truth 1 + G4 |
| POLISH-02 | 13-02, 13-09 | Position-accurate progress bar | ✓ SATISFIED | Truth 2 + G4 |
| POLISH-03 | 13-04, 13-10 | Slim header + top-bar tag popover + compact provenance spot (amended) | ✓ SATISFIED | Truth 5 + G5 |
| POLISH-04 | 13-03 | Centered modal dialogs | ✓ SATISFIED | Truth 6 |
| POLISH-05 | 13-04 | Back-to-library affordance | ✓ SATISFIED | Truth 7 |
| POLISH-06 | 13-03, 13-07 | Organized library home incl. shared measure | ✓ SATISFIED | Truth 8 + G1 |
| ACPT-05 | 13-05 | NVDA+Firefox SR acceptance flows | ⏳ NEEDS HUMAN | Instrument intact (Appendix); user run pending per D13-07; REQUIREMENTS.md honestly Pending |
| ACPT-06 | 13-06 | Core flow across browser matrix, no content loss | ✓ SATISFIED | Truth 4 — spine 3/3 green in verifier's own post-gap-closure run + recorded honest gate exit 0 |

No orphaned requirements: all 8 phase-mapped IDs appear in plan frontmatter; REQUIREMENTS.md maps no additional IDs to Phase 13. (13-08 also claims ING-03 — an intake-hygiene touch-up on a Phase 8 requirement, consistent with its scope; no conflict.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | Zero TBD/FIXME/XXX in all gap-closure-modified files; zero fixed sleeps in the three new specs; zero markup-string APIs in touched components; zero package installs | — | — |

### Human Verification Required

### 1. ACPT-05 — NVDA+Firefox acceptance run (the phase's remaining gate)

**Test:** Run the Appendix §1 runbook on Windows hardware (NVDA current stable + Firefox current stable): execute `docs/ACCEPTANCE-PROTOCOL.md` v1.0 exactly as documented — six scripted flows A–F, then five exploratory charters 1–5, recording outcomes as role + accessible name + state (never verbatim SR phrasing).
**Expected:** Zero blocker and zero major findings (D6-07). Fill Appendix §1.3 findings table, §1.4 per-flow checklist, and the run verdict. ACPT-05 flips from Pending only when results land here with zero blocker/major (D13-07); blocker/major findings follow fix-then-re-run (D13-06); minors are recorded and deferred.
**Why human:** Requires real NVDA+Firefox on Windows with a human tester — no automated harness can exercise screen-reader behavior; this is the deliberate prepare-then-run-later design (D13-07).

### 2. VoiceOver+Safari supplementary re-run (NOT an ACPT-05 gate)

**Test:** When convenient on macOS, run the Appendix §3 checklist over the five v2.0 surface groups — now including the gap-closure surfaces (paginated "Preparing pages…" placeholder, top-bar tag popover, drawer-housed Export highlights, Remove-file control, SVG remove icon).
**Expected:** Findings recorded in Appendix §3.2 with the §5 severity rubric; supplementary evidence only (D13-05).
**Why human:** Requires VoiceOver + Safari with a human tester; explicitly not gating.

### 3. Visual acceptance of the G5 redesign (recommended, lightweight)

**Test:** Open an article in paginated mode; confirm the article-top area reads as quiet provenance lines only; add/remove a tag via the top-bar tag icon; export highlights from the highlights drawer.
**Expected:** Matches the user's G5 direction (top-bar icon beside highlights/mode controls; compact provenance spot; no export button in the article flow). The e2e contracts prove the mechanics; only a human can confirm the design reads as intended.
**Why human:** Visual design acceptance — the G5 gap was originally a design rejection, so a final eyeball pass closes the loop the specs cannot.

### Gaps Summary

**All five gaps closed.** G1–G5 each verified at all three levels plus behavioral evidence (verifier's own 45-cell runs across the four new/strengthened specs + the spine). No regressions in the previously-verified truths (quick checks + recorded honest gate exit 0 after the last code commit). The single open item remains the designed-in ACPT-05 user run — the phase cannot report `passed` until it lands (or per policy routing, it stays `human_needed`).

### Notes & Process Observations (non-blocking)

1. **Honest gate ownership held:** the 13-10 gate history records three red runs before the exit-0 run 4 (latent races repaired in 25db7b5, proven pre-plan by b033e57 bisection; workers capped at 3 in e56b900 for webkit goto-starvation convergence) — the 09-07 gate-owning-plan precedent followed, with pass/fail/skip counts recorded in 13-10-SUMMARY.md as required.
2. **Workers cap trade-off:** e2e workers capped at 3 trades ~3 minutes of suite wall-clock for starvation immunity on shared machines — a standing environment note, not a gap.
3. **Full-suite scope note:** this re-verification did not re-run the 10.2m full suite; it reproduced the 45 cells covering every new/changed contract plus the spine, and the recorded exit-0 gate postdates the last code commit. The previous verification cycle independently reproduced the full suite (exit 0) at its stage.
4. **G4 deviation discipline:** 13-09's three deviations (pre-existing tsc break in 13-08's spec, footnote + component tests pinned to scrolling after the pending-window scrolling paint was removed) are recorded with rationale in 13-09-SUMMARY — test realignments to a user-directed behavior change, not weakened contracts.
5. **ACPT-06 checkbox sequence** (flagged in the previous report) remains a matter of record; the current state genuinely satisfies it.

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

---

_Verified: 2026-08-19T23:10:00Z (re-verification after G1–G5 gap closure)_
_Verifier: the agent (gsd-verifier)_
