---
phase: 14-navigation-and-library-contracts
verified: 2026-08-25T14:15:00Z
status: passed
score: 25/25 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "SR announcement quality — a screen reader actually voices the focused h1 on route/view swap (D14-09)"
    addressed_in: "Phase 21"
    evidence: "ROADMAP Phase 21 (Integrated Refinement and Acceptance) requirements include ACPT-08; 14-VALIDATION.md manual-only table maps SR voice to the ACPT protocol; 14-04-SUMMARY documents the boundary. This phase proves the automatable substrate (toBeFocused h1 identity in 3 engines)."
---

# Phase 14: Navigation and Library Contracts Verification Report

**Phase Goal:** Readers encounter consistent destination behavior and truthful reading-state classification across articles and books.
**Verified:** 2026-08-25T14:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap Success Criteria are truths 1-3 (the contract); plan-level truths follow. All behavior-dependent
truths (focus layering, history semantics, count agreement) carry LIVE behavioral evidence re-run by this
verifier — not SUMMARY claims.

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | [SC1] Each destination exposes a coherent title, heading hierarchy, landmarks, history behavior, and route-change focus behavior | ✓ VERIFIED | `pageMeta.setDocumentTitle` (single helper, em-dash + suffix + 64-cap) consumed by LibraryView L181, ArticleView L1275-1291 (3 forms), ReviewView L295; labeled `nav[aria-label="Library views"]` landmark (LibraryView L431); `replaceState` switch + push destinations (App.tsx L264-267); h1 focus effects in all three destination views. E2e NAV-04 matrix green (chromium 25/25, firefox 19/19, webkit 19/19 — re-run by verifier) |
| 2 | [SC2] Reader can switch among All, Unread, In Progress, and Finished views whose membership follows one progress policy | ✓ VERIFIED | `parseHash` view-segment literal allowlist with correct match order (App.tsx L59-82: article regex → #/review → view literals → All fallback); `readingState.ts` is the single policy (FINISHED_THRESHOLD imported, zero forks); ViewSwitcher + per-view filtering in LibraryView L299-320. App.test.tsx 15/15; e2e agreement loop over all 4 view URLs green in 3 engines |
| 3 | [SC3] Counts, progress indicators, and empty states agree with view membership for articles and EPUB books | ✓ VERIFIED | `countByState` folds in the SAME render body as membership (LibraryView L293-339, arrow-bound `totalsById.get` — the 14-04 Rule 1 fix in place); book = ONE li; empty states keyed on membership (L468-479). E2e structural agreement: spec imports the policy module and computes expected counts in Node — counts/rows/empty/aria-current agree per view, incl. honesty rows |
| 4 | [14-01] articleReadingState derives unread (no location) / in-progress (any opened location below threshold) / finished (≥ threshold) | ✓ VERIFIED | readingState.ts L52-59, formula verbatim `Math.min(1, offset/total)` ≥ FINISHED_THRESHOLD; 12-row truth table green (re-run: 17/17 across both new unit files) |
| 5 | [14-01] bookReadingState reports 39-of-40-chapter and missing-chapter-row books as in-progress, never finished | ✓ VERIFIED | readingState.ts L79-88 wraps deriveBookProgress/resolveResumeChapterId (no re-implemented algebra); unit rows green + held-out e2e seeds (raw IndexedDB) assert both books visible under #/in-progress, absent from #/finished — green in 3 engines |
| 6 | [14-01] LibraryRow/BookRow/ContinueReadingStrip byte-identical after policy swap; FINISHED_RATIO deleted | ✓ VERIFIED | `rg FINISHED_RATIO src/` → zero; all three import from `./readingState` (LibraryRow L34, BookRow L42, Strip L58); `export const FINISHED_THRESHOLD = 0.98` byte-preserved (Strip L67); progress-recent.spec zero-diff vs phase start (git) and passing inside e2e re-runs |
| 7 | [14-01] setDocumentTitle writes '<content> — Lem Reader', content truncated at 64 | ✓ VERIFIED | pageMeta.ts L36-48; separator appears exactly once in file; 5-row unit suite green (incl. 64/65 boundaries) |
| 8 | [14-02] Views switchable via real shareable URLs (#/, #/unread, #/in-progress, #/finished) with policy membership | ✓ VERIFIED | parseHash literals + e2e `openView` per-URL agreement tests green in 3 engines |
| 9 | [14-02] View switch replaces history entry — Back returns to previous destination, never an intermediate view | ✓ VERIFIED | `switchLibraryView`: replaceState(null, "", VIEW_HREFS[next]) + direct setView(parseHash()) (App.tsx L264-267); never touches setHasAppHistory; e2e HISTORY case (two switches → article → Back → originating view) green in 3 engines; back-nav strengthen-only case (e) green |
| 10 | [14-02] Exactly one aria-current=page inside a labeled nav; h1 stays 'Saved articles' across views | ✓ VERIFIED | LibraryView L431-464 (aria-current only on active link); h1 text L379-381; e2e asserts exactly one `[aria-current='page']` per view |
| 11 | [14-02] Counts derive from the same policy functions as membership; a book counts as ONE item | ✓ VERIFIED | countByState call sites L327-339 in same render body as viewArticles/viewBooks filters; e2e row-count assertions (`.library-list > li`, book = one li) match Node-computed expectations |
| 12 | [14-02] Each view shows its own empty state exactly when membership is zero | ✓ VERIFIED | EMPTY_COPY table L112-132 with the four specified copy pairs; membership-keyed render L468-479; e2e empty-state tests (seeded + unseeded) green in 3 engines |
| 13 | [14-02] In-app arrival + view switches focus the h1; cold loads/reloads never | ✓ VERIFIED | Mount effect warm-gated (L180-184) + [view]-keyed effect with StrictMode-safe previous-view comparison (L198-204 — the 14-04 Rule 1 fix); e2e cold-load no-focus + view-switch focus + Back refocus green in 3 engines |
| 14 | [14-02] Library title 'Saved articles — Lem Reader', constant across views | ✓ VERIFIED | Mount effect L181; e2e view-switch case asserts title unchanged; cold-load case asserts toHaveTitle match |
| 15 | [14-03] Truthful per-destination titles: article / EPUB chapter '<chapter> — <book>' / review / error | ✓ VERIFIED | Title effect keyed exactly `[article, chapterContext, status]` (L1273-1291); loading writes nothing; component tests pin exact strings (28/28 re-run); e2e EPUB chapter + error + review title cases green in 3 engines |
| 16 | [14-03] Fresh-article in-app swap focuses h1; cold loads never | ✓ VERIFIED | h1-default at restore fall-through L1485 gated on hasAppHistory, AFTER byte-unchanged jumpPendingRef early return (L1458); component tests + e2e in-app swap/cold-load green |
| 17 | [14-03] Deep link to #/article/<id>/h/<hl> keeps focus on the highlight mark, never the h1 | ✓ VERIFIED | e2e deep-link case (jump-bidirectional seeding reused) green in 3 engines — mark focused, h1 not |
| 18 | [14-03] Resumed article never yanks focus to h1 — restore wins | ✓ VERIFIED | Successful restore branch keeps scroll/banner; e2e restore-beats-h1 case (resume banner visible, h1 not focused) green in 3 engines |
| 19 | [14-03] Error state gets title + h1 focus parity on in-app arrival | ✓ VERIFIED | Status-keyed effect L1537-1538 (errorH1Ref); e2e error-parity case green in 3 engines |
| 20 | [14-03] Overlays never touch the title | ✓ VERIFIED | Zero overlay title code (grep: setDocumentTitle callers are exactly the 3 destination views); e2e overlay-stability case green in 3 engines |
| 21 | [14-04] Counts/rows/empty agree with the imported policy across chromium, firefox, AND webkit | ✓ VERIFIED | Spec imports from `../../../src/ingestion/library/readingState` (L58-62); verifier re-ran the agreement matrix live: chromium 25/25, firefox 19/19, webkit 19/19; full-suite gate recorded exit 0 (2468/0/23) |
| 22 | [14-04] Views reachable by URL, survive reload, unknown #/ segments fall back to All | ✓ VERIFIED | e2e unknown-segment (#/bogus-view → All + aria-current) and reload-on-#/finished cases green in 3 engines |
| 23 | [14-04] Focus identity, replace-not-push history, URL↔DOM agreement hold in all three engines | ✓ VERIFIED | All 10 NAV-04 matrix cases green in chromium/firefox/webkit (verifier re-ran each engine) |
| 24 | [14-04] Honesty rows (39/40-chapter, missing-chapter-row books) render In progress, never Finished in real browsers | ✓ VERIFIED | Held-out seeded checks against raw IndexedDB rows — green in 3 engines |
| 25 | [14-04] Honest full suite exits 0; byte-stable anchors unmodified | ✓ VERIFIED | Recorded gate: `npm run test` one invocation, 2468 passed / 0 failed / 23 skipped, exit 0. Anchor audit re-done by verifier via `git diff --numstat e3a7f3e HEAD`: happy-path.spec 0/0, progress-recent.spec 0/0, back-nav.spec 30 added/0 deleted, a11y.spec 0/0 |

**Score:** 25/25 truths verified (0 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
| - | ---- | ------------ | -------- |
| 1 | SR announcement quality (screen reader voices the focused h1 on route/view swap, D14-09) | Phase 21 | ROADMAP Phase 21 requirements include ACPT-08; 14-VALIDATION.md manual-only table maps SR voice to the ACPT protocol; automatable substrate (h1 focus identity) proven in 3 engines this phase |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/ingestion/library/readingState.ts` | ONE policy module (ReadingState, articleReadingState, bookReadingState, countByState; FINISHED_THRESHOLD import) | ✓ VERIFIED | 130 substantive lines; all exports present; threshold imported not forked; wires bookProgress |
| `src/ingestion/library/pageMeta.ts` | TITLE_SUFFIX / truncateTitle / setDocumentTitle | ✓ VERIFIED | 48 lines; separator exactly once; consumed by all 3 destination views |
| `tests/unit/library/reading-state.test.ts` | 12-row LIB-07 truth table | ✓ VERIFIED | Green (re-run) |
| `tests/unit/library/page-meta.test.ts` | Title builder + truncation boundaries | ✓ VERIFIED | 5 rows green (re-run) |
| `src/App.tsx` | View grammar + replaceState switch + LibraryViewName export | ✓ VERIFIED | Match order correct; VIEW_HREFS constant table; switch handler never touches setHasAppHistory |
| `src/ingestion/library/LibraryView.tsx` | Switcher nav + filtering + counts + empty states + focus/title effects | ✓ VERIFIED | All elements present and live (see truths 8-14); Rule 1 fixes (bound Map.get, StrictMode-safe view effect) in place |
| `src/app.css` | .view-switcher styles (1100px measure, 44px links, weight+underline current state) | ✓ VERIFIED | L2058-2078; aria-current rule = weight 600 + 2px underline only (forced-colors safe); no color/motion additions |
| `src/routes/ArticleView.tsx` | Title effect + focus layering + error parity | ✓ VERIFIED | Effect deps exactly [article, chapterContext, status]; single decision point after jumpPendingRef guard |
| `src/routes/review/ReviewView.tsx` | Review title + warm-gated focus | ✓ VERIFIED | Mount effect L295-296; h1 tabIndex+ref L355 |
| `tests/e2e/library/reading-views.spec.ts` | 3-engine agreement + focus/title/history matrix, structural policy import | ✓ VERIFIED | 1058 lines; imports the policy + normalizeText; seeds via Zod-parsed raw IndexedDB rows; books store cleared |
| `tests/e2e/chrome/back-nav.spec.ts` | Strengthen-only view-route Back case | ✓ VERIFIED | +30/-0 lines vs phase start; case (e) present L194 |

### Key Link Verification

gsd-tools `verify.key-links` reported 8/14 via pattern matching; the 6 "unverified" results are all tool
limitations (escaped-brace/quote patterns and descriptive `from:` fields the tool cannot resolve), each
manually confirmed in source:

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| readingState.ts | ContinueReadingStrip.tsx | FINISHED_THRESHOLD import | ✓ WIRED | L32 `import { FINISHED_THRESHOLD } from "./ContinueReadingStrip"` |
| readingState.ts | bookProgress.ts | deriveBookProgress/resolveResumeChapterId wrap | ✓ WIRED | L33 import; L84-87 wrap |
| LibraryRow.tsx | readingState.ts | articleReadingState routes isFinished | ✓ WIRED | L34 import |
| ContinueReadingStrip.tsx | readingState.ts | membership gates !== in-progress | ✓ WIRED | L58 import (tool-verified) |
| LibraryView.tsx | readingState.ts | membership + counts, same render body | ✓ WIRED | L55-58 import (tool-verified) |
| LibraryView switcher onClick | App switchLibraryView | onSwitchView prop | ✓ WIRED | App L299 → prop → L452 call |
| App.tsx | LibraryView.tsx | view + onSwitchView + warmMount props | ✓ WIRED | L293-301 (tool-verified) |
| LibraryView.tsx | pageMeta.ts | setDocumentTitle('Saved articles') | ✓ WIRED | L60 import, L181 call (tool-verified) |
| ArticleView.tsx | pageMeta.ts | 3 title forms | ✓ WIRED | L91 import (tool-verified) |
| ReviewView.tsx | pageMeta.ts | setDocumentTitle('Review highlights') | ✓ WIRED | L61 import (tool-verified) |
| ArticleView restore fall-through | article h1 | articleH1Ref.focus after jump guard | ✓ WIRED | L1485 after L1458 early return |
| ArticleView status effect | error h1 | errorH1Ref.focus on warm error | ✓ WIRED | L1537-1538 |
| reading-views.spec.ts | readingState.ts | expected values from SAME functions | ✓ WIRED | Spec L58-62 import |
| reading-views.spec.ts | db.ts stores | raw puts into v5 articles/books/location | ✓ WIRED | Spec L492-497, L611 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| LibraryView.tsx | items/books/allLocations/locationsByArticle | Dexie load effect (listArticles, loadAllLocations, listBooks) over real IndexedDB | Yes — e2e seeds raw rows and asserts rendered counts/rows change accordingly | ✓ FLOWING |
| ViewSwitcher counts | stateCounts/allCount | countByState over the loaded rows + totalsById fold | Yes — agreement tests compute expectations from the same inputs in Node | ✓ FLOWING |
| ArticleView title | article/chapterContext/status | openArticle + tolerant Book lookup | Yes — e2e asserts real titles incl. seeded EPUB chapter/book | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Policy truth table + title builder | `npx vitest run tests/unit/library/reading-state.test.ts tests/unit/library/page-meta.test.ts` | 17/17 passed | ✓ PASS |
| Router grammar + ArticleView title/focus wiring | `npx vitest run tests/component/App.test.tsx tests/component/ArticleView.test.tsx` | 28/28 passed | ✓ PASS |
| Full phase e2e matrix (agreement + focus/title/history + back-nav) — chromium | `npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/chrome/back-nav.spec.ts --project=chromium` | 25/25 passed | ✓ PASS |
| Agreement + NAV-04 matrix — firefox | `npx playwright test tests/e2e/library/reading-views.spec.ts --project=firefox` | 19/19 passed | ✓ PASS |
| Agreement + NAV-04 matrix — webkit | `npx playwright test tests/e2e/library/reading-views.spec.ts --project=webkit` | 19/19 passed | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED — no probe-based verification declared in any 14-0x plan (grep: zero "probe" mentions);
this phase is validated via vitest + Playwright, all re-run live above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| NAV-04 | 14-02, 14-03, 14-04 | Coherent title, heading hierarchy, landmarks, history behavior, route-change focus per destination | ✓ SATISFIED | Truths 1, 8-20, 23; 3-engine matrix green (verifier re-run) |
| LIB-07 | 14-01, 14-02, 14-04 | Switch among All/Unread/In Progress/Finished views from one documented progress policy | ✓ SATISFIED | Truths 2, 4-5, 8, 22; policy module + routes + switcher proven |
| LIB-08 | 14-02, 14-04 | Accurate counts, progress, empty states per view incl. EPUB book-level aggregation | ✓ SATISFIED | Truths 3, 11-12, 21, 24; structural agreement lock green in 3 engines |

No orphaned requirements: ROADMAP maps exactly NAV-04/LIB-07/LIB-08 to Phase 14; all three are claimed
across plan frontmatters. REQUIREMENTS.md marks all three Complete / Phase 14 — consistent with evidence.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in any of the 17 phase-modified files; no stub returns; no orphaned artifacts | — | None |

ℹ️ Info (non-blocking process note): ROADMAP.md still shows the 14-04 checkbox unchecked
("3/4 plans executed") — the roadmap update lags the completed+committed plan (SUMMARY + commits
6785568/59ef8ac/6810ead/4ba1ff4/2d1eaea all present). Orchestrator bookkeeping, not a goal gap.

### Human Verification Required

None within phase scope. The single manual-scope item (SR announcement voice, D14-09) is a documented
deferral to Phase 21 (ACPT-08) recorded under Deferred Items — this phase's must-haves claim only the
automatable substrate, which is proven.

### Gaps Summary

No gaps. All 25 truths verified with live behavioral evidence: the reading-state policy is the single
derivation point (no threshold forks, FINISHED_RATIO deleted), views are real routes with replace-not-push
history, counts/rows/empty states agree structurally with the imported policy across chromium/firefox/webkit
(all three engines independently re-run by this verifier), per-destination titles are truthful in all four
forms, and the focus layering (deep-link > restore > h1 default, cold-load immunity, error parity, StrictMode
safety) holds in real browsers. Byte-stable anchors audited untouched; zero debt markers; all requirements
accounted for.

---

_Verified: 2026-08-25T14:15:00Z_
_Verifier: the agent (gsd-verifier)_
