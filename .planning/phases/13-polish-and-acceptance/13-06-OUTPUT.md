# 13-06-OUTPUT.md — the honest full-suite phase-gate record (Phase 13)

The 04-11 / 09-07 / 11-06 / 12-08 discipline: the executor runs the full suite
itself, records every run honestly (counts + exit code), never subsets or
skips to force green. Permanent record for `/gsd-verify-work`.

**Command:** `npm run test` (vitest unit+server projects, then Playwright e2e
across chromium / firefox / webkit + the chromium-throttled-mobile perf
project) — every invocation below is the plain unfiltered command.

**Date:** 2026-08-19 (UTC) · executor: GSD 13-06 sequential run

## Verdict up front

**The gate is RED — exit 1 — and the failure set is NOT caused by 13-06.**
A git bisect (fresh dev server per checkpoint) pins the break to **commit
`12cf39d` — feat(13-04): slim header + article-top metadata spot with
single-owner page-1 mounting (POLISH-03/D13-13, Option A)**: the Option A
page-1 budget reserve intentionally moved the metadata spot INTO page 1 and
shrank its content budget, and 55 pre-existing e2e cells (annotations,
epub-intake, pdf-intake, font-failure, a11y chapter reading, firefox
high-zoom/reflow) encode the OLD page-1 geometry assumptions (e.g. "page 1
has ≥2 selectable text blocks", old content distribution, old settle
timing). 13-04's own verification ran its specs + the pagination corpus —
not the full suite — so the fallout shipped unnoticed. 13-06's spine and
markdown-upload cells are green across the matrix.

Per the executor's scope boundary, pre-existing out-of-scope failures are
recorded and surfaced, not fixed inside this plan (see "Surfaced follow-up").

## Run log (every invocation, in order)

| Run | Result | Detail |
| --- | --- | --- |
| 1 | **exit 1** (exit code not directly captured — piped through `tail`; the run printed a 55-name failed list + "6 skipped / 1002 passed", identical to run 2's failed set) | e2e 1002 passed / 55 failed / 6 skipped. Unit leg green (83 files / 1197 tests passed, 13 skipped). Reused a stale dev server started 2026-08-18 9:01 PM from the main repo (`reuseExistingServer`) — see Hygiene note. |
| 2 | **exit 1** | Identical 55-cell failed set across chromium/firefox/webkit. Unit leg green (Test Files 83 passed + 2 skipped; Tests 1197 passed / 13 skipped). Same stale dev server. |
| 3 | **exit 1** | **Fresh dev server** (stale one killed first): 56 failed = the same 55-cell set **plus 1 firefox flake** (`library/search-tag-filter.spec.ts:189` auto-prune — passed in runs 1-2, not in their failure lists → environmental flake, not the regression set). Unit leg green (Test Files 83 passed + 2 skipped; Tests 1197 passed / 13 skipped). |

### Hygiene note (run 1-2 staleness, ruled out as cause)

Runs 1-2 unknowingly reused a dev server left running since 2026-08-18
9:01 PM. To exclude server-state staleness as the cause, the server was
killed and run 3 executed against a server Playwright booted itself — the
55-cell set reproduced identically. An initial worktree-based bisect that
"showed" the failure at every commit back to phase-13 planning was
invalidated by the same stale server (it served main-repo code regardless
of the worktree checkout) and was discarded; the bisect below used fresh
servers per checkpoint.

## Root cause — bisect evidence (fresh dev server per checkpoint)

Single-spec probe: `npx playwright test tests/e2e/annotations/capture-highlight.spec.ts`
(27 cells; 6 fail at HEAD on every engine — `essay-long-form: eligible-set
breadth` + `figure-heavy: figure caption is capturable` × 3 engines).

| Checkpoint | Result |
| --- | --- |
| `9d8c591` (12-08 complete — the last green full-suite gate) | **27 passed / 0 failed** ✅ |
| `c63a26b` (13-02 first-paint hairline complete) | 27 passed ✅ |
| `0aaf8b7` (13-03 dialog centering + library tidy complete) | 27 passed ✅ |
| `5d8790e` (13-04 BackToLibrary + App history flag) | 27 passed ✅ |
| `8f2ebb3` (13-04 additive firstPageReservedPx parameter) | 27 passed ✅ |
| `4c7c16b` (13-04 honest page-1 budget floor) | 27 passed ✅ |
| **`12cf39d` (13-04 slim header + metadata spot, single-owner page-1 mounting)** | **6 failed / 21 passed** ❌ — first red commit |

**Mechanism** (from the failing cell's page snapshot): on `essay-long-form`
page 1 in paginated mode, the visible page fragment after `12cf39d`
contains the metadata spot + heading + a single long paragraph — the
Option A reserve legitimately consumes page-1 capacity. The failing specs'
helpers (`findSecondBlockWithText`, caption/code searches scoped to the
visible fragment, mode-switch settle timing, content-visibility waits)
assume the pre-13-04 distribution. Production behavior is intentional
(human-decided Option A); the ~55 cells are stale expectations. The
technical-post cell in the same file shows the sanctioned resilient
pattern already in-repo: walk pages until the wanted block kind is visible.

## Final invocation counts — Run 3 (the honest current state)

| Leg | Counts |
| --- | --- |
| **Unit (vitest, `unit` + `server` projects)** | Test files: **83 passed / 2 skipped** (85) — the 2 skips are the env-gated local-only derive drivers. Tests: **1197 passed / 13 skipped / 0 failed** (1210) — the 13 are the documented intentional derive/skip set. |
| **E2E (Playwright: chromium / firefox / webkit + chromium-throttled-mobile perf)** | **1001 passed / 55 failed / 6 skipped** (7.4 min). The 6 skips are the documented intentional set. The 55-cell regression set: a11y 12-06 chapter reading (×3 engines), annotations capture-highlight eligible-set breadth + figure-heavy caption (×3), capture-rejects (×3), drawer-view (×3), forced-colors-shapes (×3), persist-reload (×3), epub-intake SC#1/SC#2/SC#3×2 (×3), font-failure BLOCK+DELAY (×3), pdf-intake outline admission (×3), firefox high-zoom ×6, firefox reflow ×7. All 55 reproduce on every engine where they run. |
| **Total** | **2198 passed / 55 failed / 19 skipped · `npm run test` exit 1** |

**13-06's own cells in the same invocations:** the core-flow spine (3 cells)
and markdown-upload (12 cells) — all green on chromium/firefox/webkit.

## Surfaced follow-up (out of 13-06 scope)

- **13-04 test-fallout repair** — a dedicated plan (or `/gsd-debug`) should
  update the 55 stale page-1-geometry expectations to the Option A budget
  (walk-pages pattern per the technical-post precedent / in-viewport-block
  selection per the 13-06 spine), then re-run this honest gate to exit 0.
  The bisect table above localizes the cause; no production change appears
  necessary — the layout change was intentional and its own specs are green.
- **firefox `search-tag-filter` auto-prune flake** — 1-in-3-runs class;
  revisit under the 12-08 expect.poll-strengthening protocol if it recurs.

## No-subsetting attestation

Every recorded invocation above is the plain `npm run test`. No engine
subset, no spec skip, no grep filter, no `--project`/`--grep` workaround was
used for any gate invocation. (Single-spec/single-project runs during Task 1
verification and the root-cause bisect are labeled as such and are not gate
invocations.)

---

## Repair (post-merge follow-up)

**Date:** 2026-08-19 (UTC) · executor: GSD 13-06 post-merge repair run
(sequential, main tree) · scope: update the 55 stale page-1-geometry
expectations to the Option A reality (spec-side only, strengthen-only
D6-12), re-run this honest gate, record honestly.

### Outcome up front

**27 of the 55 cells were stale expectations and are now green (spec-side
only, zero production changes). The remaining 28 cells are TWO evidence-
backed PRODUCTION regressions introduced by `12cf39d`, not stale
expectations — they are checkpointed for a human decision, not silently
relaxed. The gate is still RED: exit 1.**

### What changed per family (7 atomic commits, spec-side only)

| Commit | Family | Realignment (all strengthen-only; every assertion kept) |
| --- | --- | --- |
| `38c7b6a` | annotations capture-highlight (eligible-set breadth + figure-heavy caption, ×3) | `_fixtures.ts` gains shared walk-pages helpers (`totalPages`/`currentPageIdx`/`turnToPage`/`findDisjointBlockWalkingPages` — the D13-09 technical-post precedent promoted to the shared harness). Eligible-set: walk to the second disjoint block's page, walk back, prove BOTH captures via physical Dexie rows + per-page inline marks (persistence count assertion ADDED). Figure caption: walk pages until the fragment carries the FIGURE+figcaption. |
| `e4b34b1` | annotations capture-rejects (D5-06 multi-block, ×3) | Walk to a page whose fragment carries two consecutive text blocks (essay page 1 now carries a single long paragraph), then span the selection. Hint / no-action-buttons / H-no-op assertions unchanged. |
| `53441d0` | annotations drawer-view (populated, ×3) | Highlights 2/3 walk pages to disjoint candidates; drawer reading-order + badge assertions unchanged (the drawer lists Dexie rows regardless of current page). Unused local helper removed. |
| `c43b947` | annotations forced-colors-shapes (shape distinction, ×3) | Read the orphan's dashed-outline shape while page 1 is current (it renders in block 0's vicinity), then walk pages for the bare + note-bearing targets; all three shape assertions unchanged, each read on the page where its mark renders. |
| `8bf8601` | annotations persist-reload (2 highlights + note, ×3) | Highlight 2 walks to its disjoint block's page; after reload, walk the pages to prove BOTH marks re-render from Dexie at their own passages (the epub-intake SC#2 forward-walk pattern) + has-note modifier + drawer count unchanged. |
| `d7fb30a` | font-failure BLOCK + DELAY (×3) | The 13-04 slim header moved the byline out of `<header>` into the metadata spot, so the first bare `article p` now resolves to the aria-hidden `.article-body-measurement` clone (visibility:hidden — `toBeVisible` could never pass). Assert the VISIBLE surface's paragraph via the corpus-authoritative descendant-exclusion union. PAGE-06 intent unchanged. |
| `ef5d1c4` | pdf-intake outline admission (×3) | The fixture's 5-block body no longer fits page 1 whole — assert the first section heading on page 1, then walk pages until the Second Section heading renders. Bookmark-structure intent unchanged. |

`git diff --stat 12cf39d..HEAD -- src/ server/ index.html` is **empty** —
zero production changes from this repair (and none from 13-06 either).

### Gate invocations (plain `npm run test`, no subset/filter)

| Run | Result | Detail |
| --- | --- | --- |
| 4 (repair) | **exit 1** | Unit leg green (83 files / 1197 tests passed, 2/13 skipped). E2e **1029 passed / 28 failed / 6 skipped** (6.9 min). The 27 repaired cells green across chromium/firefox/webkit. No firefox `search-tag-filter` flake this run. (The executor's exit-code capture was clobbered by a display pipe; run 5 re-ran the identical plain command for the record.) |
| 5 (repair, record run) | **exit 1** | Identical: unit 83+2 files / 1197+13 tests; e2e **1029 passed / 28 failed / 6 skipped** · `npm run test` exit 1. The 28-cell set is exactly the two production regressions below (reproduces on every engine where the cells run). |

Interim verification (labeled non-gate probes): the 7 repaired spec files
ran as one group across all 3 engines — **93/93 green** — before the gate.

### The remaining 28 cells — TWO production regressions (checkpointed, NOT spec-relaxed)

**Regression A — the engine's Option A soft-budget escape cannot place a
whole-fitting block; the reserve manufactures a fallback the unreserved
engine would not produce (15 cells: a11y 12-06 chapter reading ×3, epub-intake
SC#1 Continue-Reading + SC#2 + SC#3×2 ×3 engines).**

- **Observed:** at 360×480 every synthetic chapter opens with the PAGE-04
  fallback banner ("This part of the article is too large to fit on one
  page." → "Switched to scrolling reading.") — `window.__lemPagination`
  reports `status: "fallback", pagesLength: 0`. The specs then fail at
  `switchMode`/`.page-fragment` waits that presuppose paginated chapters
  (SC#2's `pagesLength > 1` pagination-identity assertion cannot pass at
  this viewport without pagination existing).
- **Measured engine inputs (probe, chapter 2, chromium, 360×480):**
  `.page-viewport` = **251px** (the pinned surface is 334px; the header
  grid row takes its 25% cap = 83px), metadata-spot margin-box = **209px**
  → page-1 budget = floor = **62.75px**; chapter paragraphs measure
  **144px + 18px+18px margins = 180px** (5 lines × 25px) — **fits WHOLE at
  the full 251px page height**, does not fit the 62.75px budget, and no
  widow-legal split fits either (the 2-line before-slice + margins exceeds
  the floor budget).
- **Mechanism:** `src/pagination/fragment.ts` L390-409 (the Option A
  soft-budget escape) retries only `chooseSplit` at the FULL page height —
  but `chooseSplit` returns `null` when the whole block fits (L520
  "Whole block fits after all") — so the walk emits
  `unsplittable-block-overflow` and the session flips to scrolling instead
  of placing the block whole with the documented transient overshoot. This
  **violates the module's own invariant** (L396-401: "the reserve must
  never manufacture a fallback the unreserved engine would not produce.
  The transient overshoot is the post-render overflow guard's documented
  net") and the 13-04 decision record ("Splitting-kind full-height split
  retry KEPT (guard-healed)").
- **Not stale expectations:** the epub/a11y cells encode the SC#2 contract
  ("a chapter IS an article to the reading engine" — including pagination)
  and were green at `4c7c16b`. Re-wording them to accept "chapters fall
  back to scrolling at short viewports" would delete the contract
  (forbidden by the strengthen-only discipline). Note the same gap fires
  on real-device geometry (e.g. 640×360 landscape), not just the test's
  360×480.

**Regression B — firefox-only ~10px horizontal overflow of `.article-body`
at 320px from the 13-04 compact metadata spot (13 cells: firefox reflow ×7,
firefox high-zoom ×6).**

- **Observed:** `article-body scrollWidth 298 > clientWidth 288 + 1` at
  320×800 on firefox only (chromium/webkit pass) — a WCAG 1.4.10 reflow
  violation; the no-horizontal-overflow assertion is a foundational
  accessibility contract that cannot be re-worded.
- **Mechanism (probe, firefox, 320px):** the widest element is the spot's
  `fieldset.tag-entry` at **294px** inside a 288px content box.
  `.article-top-meta .tag-entry { flex: 1 1 16em; }` (app.css L3046) sets a
  16em flex-basis and **no `min-width: 0`** on the fieldset; firefox
  fieldsets refuse to shrink below their intrinsic min-content (the
  never-wrapping add-row: default-size text input + Add-tag button +
  padding). The whole paginated tree (header, page-viewport, fragment)
  inherits the 298px overflow width.
- **Pre-13-04** the tag-entry lived in the scroll-capped header grid row —
  reflow was green at `4c7c16b`.

**Disposition per the repair's rules:** both findings are production
changes (an engine-walk fix in `src/pagination/fragment.ts`; a CSS fix on
the spot's fieldset, e.g. `min-width: 0`) — outside this repair's
zero-production-change mandate. Surfaced as a structured checkpoint with
this evidence; the 28 cells stay red until the human decision lands.

### No-subsetting attestation (repair runs)

Runs 4 and 5 above are the plain `npm run test` — no engine subset, no
spec skip, no grep filter, no `--project`/`--grep` workaround. The interim
93/93 verification and the diagnostic probes (temporary spec files, deleted
before the gate) are labeled as such and are not gate invocations.
