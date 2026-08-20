---
phase: quick-260819-qbq
plan: 01
subsystem: reader-chrome
tags: [paginated, header, quiet-chrome, css, e2e, a11y]
requires:
  - "13-04 slim header anatomy (BackToLibrary + h1 as the only header children)"
  - "09-07 paginated grid cap + header scroll-container rules (locked)"
provides:
  - "Paginated quiet-header register: fixed real-44px back box + 14px/1.45 h1, pinned row follows content (row = min(content, 25%))"
  - "3-engine e2e contract spec tests/e2e/chrome/paginated-quiet-header.spec.ts"
affects:
  - "Paginated mode pinned-surface geometry (page capacity increases ~53px at 360×640; engine re-measures live geometry)"
tech-stack:
  added: []
  patterns:
    - "Later same-specificity source-order override keeps a locked rule's bytes intact while re-expressing its algebra (grid-template-rows override + definite max-height calc cap)"
key-files:
  created:
    - tests/e2e/chrome/paginated-quiet-header.spec.ts
  modified:
    - src/app.css
decisions:
  - "Real position:fixed 44×44 chrome-layer box for the paginated back button (planner's mechanism decision — NO ::after shim: the header scroll-container clips pseudo expansion for painting AND hit-testing and would add scrollable overflow)"
  - "Rule 3 deviation: 09-07 minmax(auto, 25%) reserves the full 25% row regardless of content (grid maximize-tracks) — override to auto + max-height calc cap preserves the 09-07 algebra both directions"
metrics:
  duration: 10 min
  completed: "2026-08-20T00:18:34Z"
  tasks: 2
  files: 2
status: complete
---

# Quick Task 260819-qbq: Reduce header + Back-to-library prominence Summary

Paginated pinned header reduced to the page-indicator quiet register — a real `position:fixed` ≥44×44 back box in the chrome layer plus a 14px/1.45 h1 — with the pinned row now following header content (96% of the surface goes to the reading page at 360×640) while the 09-07 locked rules stay byte-unchanged.

## What Was Built

### Task 1 — Scoped paginated quiet-header CSS (src/app.css) — commit 04766e2

One scoped block inserted after the locked 09-07 header rule, before `.page-viewport` (exactly three rules + contract comments, per plan):

1. **`.article-body.paginated-surface > header .back-to-library`** — `position: fixed; top: calc(48px + var(--space-sm)); left: var(--space-sm); z-index: 5; min-width/min-height: var(--touch)` (REAL 44×44 box, no pseudo-element), `padding: 0`, `border: 0` (unboxed text register), `font: var(--font-ui) 14px/1.45`, `color: var(--ink-soft)`, `align-items: flex-start` (label rides the indicator line; transparent lower half is the hit zone — `.page-turn` chevron precedent).
2. **`:hover, :focus-visible` → `color: var(--accent)`** — the `.resume-banner-dismiss` text-button discipline; global focus ring still wraps the real 44px box.
3. **`h1` → `font: 400 14px/1.45 var(--font-ui), color var(--ink-soft)`** — exact `.page-indicator` register; scoped specificity (0,2,2) beats base 26px/32px + its ≥640px media override (no media query needed); element remains an h1 (D-01-02).

Plus the one-line cross-reference comment at the 13-04 `.back-to-library:hover` home citing both homes. Zero content lines removed from app.css across ALL commits (verified: `git diff | grep -c '^-[^-]'` = 0); no TSX touched; tokens only; zero motion properties.

### Task 2 — E2E contract spec (tests/e2e/chrome/paginated-quiet-header.spec.ts) — commit 4f3c85d

164 lines mirroring the header-geometry.spec.ts harness (pixel-svg image route + `indexedDB.deleteDatabase("lem-reader")` beforeEach; `openPaginatedAtSmallPhone` = 360×640 → `#/article/essay-long-form` → h1 visible → `__lemPagination` waitForFunction (8s) → 600ms corpus settle; plain `test()` calls inheriting the 3-engine matrix). Test 1 proves the quiet contract (fixed ≥44×44 box, h1 14px, row ≤44px, `scrollHeight ≤ clientHeight`); Test 2 proves paginated-only scoping (scrolling mode: static, 26px, ≥44px pill).

## Mechanism Decision (implemented exactly as planned)

The suggested `::after { inset: -10px }` hit-area expansion CANNOT work: the paginated header is a scroll container by the locked 09-07 rule, which clips descendant pseudo-elements at its padding box for BOTH painting and hit-testing — at most a ~20px effective target inside a quiet row plus end-ward scrollable overflow (phantom scrollbar). The implemented mechanism is a REAL `position: fixed` 44×44 border box in the chrome layer beside the page indicator (fixed escapes ancestor overflow clipping; no transformed ancestors on the path — the `.page-indicator`/`.page-turn`/`.chapter-nav-page` precedents). DOM/focus order invariant by construction (back-nav (d) Tab contract holds). No `::after` precedent introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pinned row did not shrink: 09-07 `minmax(auto, 25%)` reserves the full 25% regardless of content — commit 39236ad**

- **Found during:** Task 2, Gate 1 (new spec failed on all 3 engines: header row 123.5px, expected ≤44px)
- **Issue:** The plan's factual premise ("header row today is 44–96px, will become ~20px") was wrong. An isolated-grid probe + live-app measurement proved the grid maximize-tracks step grows the `minmax(auto, 25%)` track to its 25% growth limit BEFORE the `1fr` sibling absorbs free space — the pinned row has reserved exactly 123.5px (= 25% × 494px pinned height) at 360×640 ever since 09-07, whenever header content is under the cap (measured identical before/after the quiet register: 123.5px both). The quiet register alone (button fixed + h1 14px) could not give the surface back to the page; the plan's own Test 1 assertion was unpassable under the locked template.
- **Fix:** Two scoped rules keep both 09-07 locked rules byte-unchanged but re-express the cap's algebra so its stated intent ("guaranteeing the reading page ≥ 75%") holds in BOTH directions — row = min(content, 25%):
  - `.article-body.paginated-surface { grid-template-rows: auto minmax(0, 1fr); }` — later same-specificity source-order override; the locked header rule's `min-height: 0; overflow-y: auto` keep the auto row shrinkable;
  - `.article-body.paginated-surface > header { max-height: calc((100vh - 48px - 2px - 2 * var(--space-2xl)) * 0.25); }` — the 25% cap as a definite length against the same pinned-height formula (a percentage `max-height` on a grid item resolves against the TRACK, not the container — probed, useless; the definite form clamps the auto track's intrinsic sizing).
- **Evidence (chromium probes):** small content → 20.3px row / 473.7px page (96% of the 494px surface); ~400px content → clamps at exactly 123.5px with the locked `overflow-y: auto` scroll net engaging (09-07 semantics preserved); 320×420 regime → 20.3px row / 253.7px page (no collapse, more capacity).
- **Risk coverage:** T-260819-02's accepted disposition (engine measures live geometry; smaller header only increases page capacity) — validated by the full gate list below, all green.
- **Files modified:** src/app.css
- **Commit:** 39236ad

### Out-of-scope findings (NOT fixed, per scope-boundary rule)

- `npm run lint` fails with 3 PRE-EXISTING errors in `src/portability/zipSlip.ts` (2× `no-control-regex` at 34:7, 76:14; 1× `no-useless-escape` at 77:16). File last touched 2026-08-15 (`9793d1f`, Phase 09-01); this task's diff touches only `src/app.css` (not ESLint-linted) and the new spec (lint-clean). Logged to `deferred-items.md`.

## Verification Gates (honest results, run in plan order)

| # | Gate | Result |
|---|------|--------|
| 1 | `npx playwright test tests/e2e/chrome/paginated-quiet-header.spec.ts` | **6/6 passed** (2 tests × chromium/firefox/webkit). First run before the Rule 3 fix: 3 failed / 3 passed — the 3 failures were the row-height assertion (123.5px), identical on all engines, which triggered the investigation. |
| 2 | `npx playwright test` back-nav + header-geometry + no-overflow-invariant | **78/78 passed** (3 engines; includes back-nav click/Tab/Enter contract, D13-13 no-internal-scroll, Option A spot/reserve geometry, PAGE-03b corpus no-overflow matrix) |
| 3 | `npx vitest run tests/unit/pagination` | **76/76 passed** (7 files) |
| 4 | `npm run lint` (re-run after spec added) | New spec + CSS lint-clean; **3 pre-existing errors** in `src/portability/zipSlip.ts` remain (out of scope, logged above) |
| 5 | `npx playwright test tests/e2e/open-every-fixture.spec.ts` (optional — ran, runtime allowed) | **24/24 passed** (3 engines) |

All e2e gates ran the default 3-engine matrix (no `--project` flags). No engine was skipped.

## Commits

- `04766e2` feat(260819-qbq): quiet paginated header — fixed 44px back box + 14px h1 register
- `39236ad` fix(260819-qbq): pinned row follows header content — 09-07 cap re-anchored via max-height calc
- `4f3c85d` test(260819-qbq): paginated quiet-header e2e contract spec

## Self-Check: PASSED

- tests/e2e/chrome/paginated-quiet-header.spec.ts — FOUND (164 lines ≥ 60 min_lines)
- src/app.css scoped block — FOUND (selector `article-body.paginated-surface > header .back-to-library` ×3; scoped h1 rule present)
- Commits 04766e2, 39236ad, 4f3c85d — FOUND on main
- Locked 09-07 rules byte-unchanged — VERIFIED (0 removed content lines across all three commits; `overflow-y: auto` + `grid-template-rows` appear only as unchanged context)
