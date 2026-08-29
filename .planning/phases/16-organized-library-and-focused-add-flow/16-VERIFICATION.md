---
phase: 16-organized-library-and-focused-add-flow
verified: 2026-08-29T20:34:16Z
status: passed
score: 24/24 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Screen-reader pass on the open Add dialog (NVDA/VoiceOver announcement of submitting/error copy)"
    addressed_in: "Phase 21"
    evidence: "REQUIREMENTS.md ACPT-08: 'Library, Highlights, Add, and Reader flows pass the documented keyboard, NVDA+Firefox, VoiceOver+Safari… acceptance matrix' — traceability row maps ACPT-08 to Phase 21 (Pending). The automatable portion (axe scan, keyboard walkthrough, focus-visible) is DONE in Phase 16 (a11y.spec.ts dialog-open case); only the human SR reading is Phase 21 scope."
---

# Phase 16: Organized Library and Focused Add Flow — Verification Report

**Phase Goal:** Readers find content by reading state and add material through a focused, recoverable workflow.
**Verified:** 2026-08-29T20:34:16Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths are the 5 ROADMAP success criteria (the contract) with the 24 plan-level must-have truths verified beneath them.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| **SC-1** | Search and tag filters narrow the selected reading-state view without contradictory results (LIB-09) | ✓ VERIFIED | See truths 1.1–1.5 below |
| 1.1 | Filtered-to-zero shows calm no-matches line + Clear search and filters — never the membership empty state (D16-13) | ✓ VERIFIED | `LibraryView.tsx:740-756`: exact condition `status === "ready" && (viewArticles.length > 0 \|\| viewBooks.length > 0) && visibleItems.length === 0 && visibleBooks.length === 0` renders `Nothing in this view matches your filters.` + clear button — a distinct branch after the list, never replacing the EMPTY_COPY ternary arm |
| 1.2 | Clear search and filters resets BOTH query and active tag, restoring rows | ✓ VERIFIED | `LibraryView.tsx:747-748`: onClick `setQuery("")` + `setActiveTag(null)`; e2e `search-tag-filter.spec.ts:522+` asserts rows restored, input empty, chip unselected |
| 1.3 | Membership-empty view keeps its EMPTY_COPY heading/body unchanged (D14-26) | ✓ VERIFIED | `LibraryView.tsx:139-161`: all four view entries present verbatim; regression-guard e2e at `search-tag-filter.spec.ts:581+` (membership-empty under query → EMPTY_COPY owns the region, no no-matches line) |
| 1.4 | Continue Reading strip visible on All, absent on Unread/In Progress/Finished (D16-14) | ✓ VERIFIED | `LibraryView.tsx:596`: `{view === "all" && (<section className="library-section library-section-continue">…` — conditional mount; `reading-views.spec.ts:1117-1138` asserts visible on `#/` and `toHaveCount(0)` on all three state routes |
| 1.5 | View-switcher counts remain membership totals while a search is active (D16-16) | ✓ VERIFIED | `reading-views.spec.ts:1141-1160`: captures the Unread link's accessible name BEFORE a zero-match query, asserts no-matches + zero rows, then asserts the name IDENTICAL after — genuine before/after comparison; counts derivation untouched in code |
| **SC-2** | Continue Reading complements rather than duplicates or displaces the main library organization (LIB-10) | ✓ VERIFIED | Strip gated to All only (1.4); `ContinueReadingStrip.tsx` byte-unchanged — `git diff b57172f HEAD --stat` on the file is EMPTY (255-line substantive component, D16-15 holds) |
| **SC-3** | Add to Library opens a focused workflow where every existing source is available and only relevant inputs appear (ADD-01/ADD-02) | ✓ VERIFIED | See truths 3.1–3.6 below |
| 3.1 | 'Add to Library' button beside the h1 opens AddDialog; shell header stays two destinations | ✓ VERIFIED | `LibraryView.tsx:580-583` (library-add-button, `setAddOpen(true)`, `aria-haspopup="dialog"`, `aria-expanded={addOpen}`) + `<AddDialog` mount at :834; `git diff b57172f HEAD -- src/reader/Header.tsx src/App.tsx` EMPTY (T-16-08) |
| 3.2 | The three permanently-mounted forms are gone; IngestControl retired from the codebase | ✓ VERIFIED | `rg 'IngestControl\|ingest-control' src tests` → ZERO matches; `src/ingestion/IngestControl.tsx` + `tests/component/IngestControl.test.tsx` do not exist; `.ingest-control` CSS block absent from app.css |
| 3.3 | The .status load live region survives byte-stable | ✓ VERIFIED | `LibraryView.tsx:763`: `<div className="status" role="status" aria-live="polite" aria-atomic="true">` with both copy branches ("Opening article…" :764 / "Couldn't open this article." :767) — re-homed as direct child of main after the list; library-tidy pins `main#main > .status` order + contract |
| 3.4 | AddDialog renders fieldset/legend 3-way picker; only the selected source's input visible (D16-05) | ✓ VERIFIED | `AddDialog.tsx:405-438` fieldset.add-source-picker + legend "Add from" + 3 controlled radios (`checked={source === …}` :412/423/433); file input always-mounted with `hidden={source !== "file"}` (:496/506, Pattern 3a); component tests 7-9 + focused-add radio-arrows case prove visibility per source |
| 3.5 | Dialog always opens on Web address — no last-used-source memory (D16-08) | ✓ VERIFIED | `AddDialog.tsx` open effect: false→true transition resets source/url/html/status/message + `resetFilePick()`; component test 13 (cancel→reopen fresh) + focused-add chromium case 3 PASSED in my own run |
| 3.6 | Typed URL/paste text and picked file survive source switches within one session (D16-07) | ✓ VERIFIED | Lifted `urlValue`/`htmlValue` state + always-mounted hidden file input (input.files survives); component tests 10-11 + focused-add chromium case 4 PASSED in my own run |
| **SC-4** | Reader can cancel, retry, or recover from failure without losing useful input, creating duplicates, or hiding refusal reasons (ADD-03) | ✓ VERIFIED | See truths 4.1–4.3 below |
| 4.1 | Dedupe-refuse is a calm message only, no save; refusals route through mapReasonToCopy | ✓ VERIFIED | `AddDialog.tsx:217-224` (has BEFORE save, article) + :314-321 (hasBook BEFORE saveBook, book); component test 3 asserts `saveMock` NOT called; e2e dedupe refusals through the dialog: pdf-intake:365, epub-intake:666, markdown-upload:181 — "Already in your library." asserted visible |
| 4.2 | Cancel and submit controls disabled while in flight (D16-10) | ✓ VERIFIED | Component test 15; `submittingRef` live mirror (:115-116) gates the cancel listener (:187 return-before-onCancel) with proper listener cleanup (:192-195) |
| 4.3 | Esc while submitting leaves dialog open and still submitting; recovery + retry after settle | ✓ VERIFIED (behavioral) | focused-add.spec.ts:255-337 — per-request gates hold /api/ingest, asserts dialog open + submitting copy AFTER Escape, settles to typed refusal with URL RETAINED and retry re-firing. **My own run: chromium 7/7 PASSED.** Full gate: 3-engine green (2578/0/23) |
| **SC-5** | Add manages focus, dismissal, success, narrow-width, and high-zoom behavior predictably (ADD-04) | ✓ VERIFIED | See truths 5.1–5.4 below |
| 5.1 | Focus moves into dialog on open (WebKit included); Tab cycles within (native trap); idle Esc restores trigger focus | ✓ VERIFIED (behavioral) | `AddDialog.tsx:144-166`: showModal + explicit `[data-initial-focus]` focus (the 02-01 WebKit lesson) + close-listener trigger restore; focused-add chromium cases 1-2 PASSED in my own run; 3-engine cells enumerated (21) and green in the honest gate |
| 5.2 | Article success closes dialog then opens #/article/<id>; book success closes then refreshKey row appears (D16-12) | ✓ VERIFIED (behavioral) | Component tests 17-18 (navEvents ordering: onCancel FIRST, then hash write / onBookAdded); focused-add chromium case 6 (transition-moment teardown proof) PASSED in my own run; `onBookAdded={() => setRefreshKey((k) => k + 1)}` wired (LibraryView.tsx:837) with e2e re-anchored to `li.book-row` |
| 5.3 | Open dialog operable at 320px and 400% zoom, no horizontal overflow | ✓ VERIFIED | `app.css:818-828`: dialog.add-dialog `margin:auto`, `width: calc(100vw - var(--space-xl))` (320px-safe), `max-width:560px`, `overflow:auto`; reflow.spec.ts:110+ (320px dialog-open case) + high-zoom.spec.ts:160+ (400% dialog-open case) — both green in the honest gate |
| 5.4 | Axe scan of open dialog reports no violations; radio arrows + visible focus work | ✓ VERIFIED | a11y.spec.ts: dedicated dialog-open AxeBuilder case with `.include("dialog.add-dialog")` (:792-801) + picker keyboard walkthrough + :focus-visible ring check; radio arrows proven in focused-add case 7 (my chromium run PASSED) |
| 5.5 | Full suite passes: npm run test exits 0 in one invocation on a fresh server | ✓ VERIFIED | Honest gate recorded: unit 1303 passed/13 skipped + e2e 1275 passed/10 skipped = 2578/0/23, exit 0, reproduced twice on a fresh server; post-merge TS18048 fix (b4cc418, `fixtures[0]!` type-level only) followed by green build + unit gate re-runs — confirmed in commissioning context and consistent with my own independent runs (component 18/18, focused-add chromium 7/7) |

**Score:** 24/24 truths verified (0 present-but-behavior-unverified — every cancellation/ordering invariant was exercised first-hand or by the recorded 3-engine honest gate)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Screen-reader pass on the open Add dialog (NVDA/VoiceOver announcements of submitting/error copy) | Phase 21 | ACPT-08: "Library, Highlights, **Add**, and Reader flows pass the documented keyboard, NVDA+Firefox, VoiceOver+Safari… acceptance matrix" — traceability maps ACPT-08 → Phase 21. Automatable portion (axe, keyboard, focus ring) already done in Phase 16 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ingestion/library/LibraryView.tsx` | No-matches branch + strip gate + Add button + AddDialog mount + .status re-home + EMPTY_COPY swap | ✓ VERIFIED | All six elements verified at cited lines; 845-line substantive component |
| `src/app.css` | .library-no-matches/.library-clear-filters/dialog.add-dialog/.library-add-button; .ingest-control retired | ✓ VERIFIED | Rules at :818/:8267/:2275/:2328; retired selectors return zero matches |
| `src/ingestion/ingestCopy.ts` | mapReasonToCopy + bytesToBase64 exports | ✓ VERIFIED | Exports at :30/:83; copy tests import from the new path, EXPECTED_* tables intact |
| `src/ingestion/AddDialog.tsx` | Focused Add dialog component | ✓ VERIFIED | Exports AddDialog/AddDialogProps/AddDialogSource (:69/:78/:89); showModal, data-initial-focus, close+cancel listeners with cleanup, submittingRef, no method="dialog" |
| `tests/component/AddDialog.test.tsx` | 18-case component suite | ✓ VERIFIED | Enumerated 18 cases covering every claimed behavior; 18/18 PASSED in my own run |
| `tests/e2e/library/add-dialog.ts` | Shared openAddDialog/pickSource helper | ✓ VERIFIED | Idempotent (isVisible guard); imported by 14 spec files |
| `tests/e2e/library/search-tag-filter.spec.ts` | No-matches + clear-filters + D14-26 guard cases | ✓ VERIFIED | Cases at :416/:522/:581; strengthen-only |
| `tests/e2e/library/reading-views.spec.ts` | Strip gating + counts-pure cases | ✓ VERIFIED | Cases at :1117/:1141 |
| `tests/e2e/library/focused-add.spec.ts` | 7-case 3-engine ADD-04 proof | ✓ VERIFIED | 21 cells enumerated (7 × 3 engines); chromium 7/7 PASSED in my own run |
| `tests/e2e/a11y.spec.ts` | Dialog-open axe scan + keyboard walkthrough | ✓ VERIFIED | :29/:73/:792-801 |
| `tests/e2e/reflow.spec.ts` | Dialog-open 320px case | ✓ VERIFIED | :110-111 |
| `tests/e2e/high-zoom.spec.ts` | Dialog-open 400% case | ✓ VERIFIED | :160-161 |
| `tests/e2e/chrome/library-tidy.spec.ts` | Post-dissolution structural anchors | ✓ VERIFIED | .library-add-button ordering + main#main > .status scoping + geometry; zero retired selector names |
| `src/ingestion/IngestControl.tsx` | DELETED (retirement) | ✓ VERIFIED | File absent; repo-wide grep zero |
| `tests/component/IngestControl.test.tsx` | DELETED (retirement) | ✓ VERIFIED | File absent |

### Key Link Verification

gsd-tools `verify.key-links` requires literal file paths in `from:` (descriptive names unsupported), so all 9 links were verified manually by grep — the Step 5 fallback.

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Clear-filters button | query/activeTag state | onClick resets both | ✓ WIRED | LibraryView.tsx:747-748 — `setQuery("")` + `setActiveTag(null)` |
| LibraryView strip section | ContinueReadingStrip | `view === "all"` gate | ✓ WIRED | :596 conditional mount; strip byte-unchanged (git diff empty) |
| AddDialog.tsx | ingestCopy.ts | import both functions | ✓ WIRED | :64 `import { mapReasonToCopy, bytesToBase64 } from "./ingestCopy"` |
| AddDialog.tsx | IngestionClient/LibrarySource/booksStore | dedupe seams reused | ✓ WIRED | :217/:224 `dexieLibrarySource.has`→`save`; :314/:321 `hasBook`→`saveBook` |
| AddDialog cancel listener | submittingRef mirror | live ref gates cancel | ✓ WIRED | :115-116 mirror; :187 `if (submittingRef.current) return` |
| LibraryView Add button | AddDialog open prop | setAddOpen + aria mirror | ✓ WIRED | :580-583 trigger + :834 mount |
| AddDialog onBookAdded | LibraryView refreshKey | setRefreshKey bump | ✓ WIRED | :837 `setRefreshKey((k) => k + 1)` |
| 11 ingestion-driving e2e specs | add-dialog.ts helper | openAddDialog import | ✓ WIRED | 14 spec files import the helper (superset: the 11 + focused-add/reflow/high-zoom) |
| focused-add Esc case | /api/ingest | page.route delayed-fulfill | ✓ WIRED | :276/:346 `page.route("**/api/ingest", …)` per-request gates |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| LibraryView no-matches branch | visibleItems/visibleBooks | libraryFilter composition over viewArticles/viewBooks (Phase 14 pipeline) | Yes — derives from the live filtered corpus | ✓ FLOWING |
| AddDialog status region | status/message | real ingest submission spine (IngestionClient + Dexie seams) | Yes — e2e drives real refusals/successes through it | ✓ FLOWING |
| Continue Reading strip | strip cards | persisted reading locations (unchanged component) | Yes — pre-existing, byte-unchanged | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AddDialog component suite (picker, preservation, defaults, in-flight gating, dedupe no-save, ordering) | `npx vitest run tests/component/AddDialog.test.tsx` | 18/18 passed (1.91s) | ✓ PASS |
| focused-add e2e — focus in, trap+Esc idle, reopen default, pick survival, Esc-blocked+recovery+retry, close-then-navigate, radio arrows | `npx playwright test tests/e2e/library/focused-add.spec.ts --project=chromium` | 7/7 passed (3.6s) | ✓ PASS |

Browser-matrix breadth (firefox/webkit cells) rests on the recorded honest gate (`npm run test` exit 0, 2578/0/23, fresh server, reproduced twice) — consistent with my independent chromium run and 21 enumerated 3-engine cells. Per Step 7b constraints the full matrix was not re-run.

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared in PLAN/SUMMARY; `scripts/` contains no `tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LIB-09 | 16-01 | Search + tag filters within selected view without contradictory results | ✓ SATISFIED | No-matches feedback layer + D14-26 guard + counts-purity (truths 1.1-1.5); filter composition itself pre-existing Phase 14 |
| LIB-10 | 16-01 | Continue Reading complements, never duplicates/displaces | ✓ SATISFIED | All-only gate + byte-unchanged strip (SC-2) |
| ADD-01 | 16-03, 16-04 | Focused Add workflow instead of permanent controls | ✓ SATISFIED | Header trigger + dissolution + retirement (truths 3.1-3.3) |
| ADD-02 | 16-02, 16-04 | Every source available, only relevant inputs visible | ✓ SATISFIED | 3-way picker + only-selected visibility (truths 3.4-3.6) |
| ADD-03 | 16-02, 16-03 | Cancel/retry/recover without losing input, duplicates, or refusal reasons | ✓ SATISFIED | Dedupe refusal-only + retained input + blocked dismissal + retry (truths 4.1-4.3) |
| ADD-04 | 16-04 | Predictable focus/dismissal/success at narrow widths and high zoom | ✓ SATISFIED | 7-case 3-engine proof + axe/reflow/high-zoom (truths 5.1-5.5) |

Orphaned requirements: NONE — union of plan-declared IDs {LIB-09, LIB-10, ADD-01..04} equals the REQUIREMENTS.md Phase 16 mapping exactly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Zero TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers across all phase-modified files; zero dangerouslySetInnerHTML/innerHTML usage (one comment *describes* the no-innerHTML guard) | — | None |

### Human Verification Required

None — the one inherently-human item (screen-reader announcements on the open dialog) is explicitly owned by Phase 21's ACPT-08 acceptance matrix (see Deferred Items); every automatable accessibility check (axe, keyboard, focus ring, geometry) is machine-asserted and green.

### Gaps Summary

No gaps. All 15 artifacts exist, are substantive, and are wired; all 9 key links verified; all 6 requirements satisfied with no orphans; zero debt markers or stub patterns. The phase's cancellation/ordering invariants (Esc-blocked-while-submitting, close-then-navigate, focus management) carry first-hand behavioral evidence from my own test executions, and the 3-engine breadth is backed by the honestly-recorded full-suite gate. Retirement of IngestControl is complete with a repo-wide zero-reference grep. One follow-up (SR pass) is roadmap-deferred to Phase 21/ACPT-08, not a gap.

---

_Verified: 2026-08-29T20:34:16Z_
_Verifier: the agent (gsd-verifier)_
