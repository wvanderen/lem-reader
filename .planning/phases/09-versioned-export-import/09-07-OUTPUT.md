# 09-07 OUTPUT — Full `npm run test` End-to-End Run Record (Phase 9 Honest-Suite Gate)

**Purpose:** Permanent record that the full automated suite was run end-to-end in a single
`npm run test` invocation, with honest pass + fail + skip counts — mirroring
`04-11-OUTPUT.md` (the Phase 4 precedent) per PROJECT.md Key Decision #9. The executor ran
the suite itself; no prior SUMMARY's claim was trusted. This run closes the 24-cell
pre-existing-failure debt Phase 08 logged forward in
`.planning/phases/08-markdown-pipeline-and-personal-library/deferred-items.md`.

---

## 1. Command Run

```
npm run test
```

`package.json` defines `test` as: `npm run test:unit -- --run && npm run test:e2e`

- `test:unit` → `vitest` (jsdom; `tests/unit/**` + `tests/component/**`)
- `test:e2e`  → `playwright test` (chromium + firefox + webkit + chromium-throttled-mobile
  confined to `perf.harness`; `tests/e2e/**`)

No `--grep`, no filter, no subset aggregation, no engine skip, no watch flags. Single
invocation, full output captured.

**Preconditions verified before the final run:**
- Working tree clean (`git status` → nothing to commit); gap-closure commits `de0b800`
  (pagination geometry fix) + `9459da1` (two webkit de-flakes) in `git log`.
- Dev server NOT already running (port 5173 free — Playwright's `webServer` starts its own).
- All three browser engines installed.

---

## 2. Honest Counts (the recorded exit-0 run)

**Run window:** 2026-08-15T19:57:42Z → 2026-08-15T20:02:58Z (~5m16s)

### By suite

| Suite | Tool | Passed | Failed | Skipped | Flaky |
|-------|------|--------|--------|---------|-------|
| Unit + component | vitest (jsdom) | **851** | 0 | 7 | 0 |
| E2E (3 engines + throttled perf profile) | playwright | **823** | 0 | 6 | 0 |
| **TOTAL** | | **1674** | **0** | **13** | **0** |

vitest summary line (verbatim): `Test Files  64 passed (64)` / `Tests  851 passed | 7 skipped (858)`
playwright summary line (verbatim): `823 passed (5.1m)` + `6 skipped`

### E2E by engine

| Engine | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| chromium | 274 | 0 | 2 |
| firefox  | 274 | 0 | 2 |
| webkit   | 274 | 0 | 2 |
| chromium-throttled-mobile (perf.harness only) | 1 | 0 | 0 |
| **Total**| **823** | **0** | **6** |

The 6 e2e skips are 2 per engine, both in `tests/e2e/ingestion/ssrf-matrix.spec.ts` and both
documented residuals: "redirect-into-internal 302" (covered by `safe-fetch.spec.ts` unit —
Measure 9) and "DNS-rebinding refuses" (T-7-04 residual TOCTOU on Node, closed by a future
Workers deploy per D7-10). The 7 unit skips are the deliberate skips Phase 08 recorded
(7 unit + 6 e2e intentional skips). Exit 0 with skips ≠ zero-skips — the gate is fail=0.

### The 24 pre-existing cells (now closed)

| Deficit recorded at 08-05 | Cells | Status in this run |
|---------------------------|-------|--------------------|
| `pagination/coverage-invariant.spec.ts` @360x640 (2 fixtures × 3 engines) | 6 | green (had regrown to 4 fixtures × 3 engines = 12 cells at 09-07 start; all fixed) |
| `pagination/no-overflow-invariant.spec.ts` @360x640 (2 fixtures × 3 engines) | 6 | green (had regrown to 5 fixtures × 3 engines = 15 cells; all fixed) |
| `pagination/fallback-oversize.spec.ts` pathological timeout | 3 | green |
| `pagination/termination.spec.ts` pathological timeout | 3 | green |
| `annotations/capture-highlight.spec.ts` figure-caption (D5-07) | 3 | green |
| `ingestion/dexie-migration.spec.ts` v3→v4 row survival | 3 | green |

Note: by the time 09-07 executed, the pagination deficit had GROWN from the recorded 18
cells to 33 (the Phase 9-05 "Export highlights" button added 44px more header height at
narrow widths, pulling additional fixtures under the broken geometry). All 33 + 3 + 3 = 39
affected cells are green; the deficit is closed at the larger scope, honestly recorded.

---

## 3. Exit Status

```
EXIT_CODE=0
```

`npm run test` exited **0**. The `&&` chain in the `test` script means both `test:unit`
(exit 0, 851 passed / 7 skipped) AND `test:e2e` (exit 0, 823 passed / 6 skipped) succeeded.

---

## 4. First-Run Failure Triage (recorded honestly, then fixed)

The FIRST full invocation this plan ran was **exit 1**: unit green (851/0/7) but 2
webkit-only e2e failures under full-suite parallel load — both pass in isolation:

1. `library/browse-open.spec.ts` "Pasted badge" — a one-shot
   `locator('.library-list > li').count()` raced LibraryView's async load effect and
   observed 0 of 6 rows under load. Fixed by adopting the sibling LIB-01 test's
   auto-retrying `toHaveCount` (semantics unchanged).
2. `section-announce.spec.ts` READ-05 — the beforeEach `page.goto` exceeded the default
   30s test budget when the webkit context's first module fetch was starved by sibling
   workers. Fixed with `test.setTimeout(60_000)` (the calibration/perf harness precedent);
   assertions unchanged.

Both fixes committed as `9459da1` (`test(09-07): de-flake two webkit cells that raced under
full-suite parallel load`). The exit-0 counts in §2 are from the re-run AFTER those fixes —
a clean single invocation, not an aggregate across runs.

---

## 5. Root-Cause Record for the 24-Cell Deficit (mechanism, evidence)

**The recorded suspicion (Vite 8 / Rolldown microtask timing in `measureAllBlocks`) was
DISPROVEN.** In-page module replay (importing the real `measureAllBlocks` + `paginateDocument`
through the Vite dev server in a live browser and sweeping page heights 380–560px against the
live article body) returned `status: "ok"` at every height — the measurement and pagination
modules were never broken.

**Actual mechanism (geometric):** `.article-body.paginated-surface` pins the article to
`calc(100vh - 48px - 2px - 2*var(--space-2xl))` and splits it with
`grid-template-rows: auto minmax(0, 1fr)` — an UNcapped `auto` row for the provenance
header. That was sound when the header was h1 + byline + source link (~150px). Phase 8-04
added the TagEntry fieldset (~155px at 360px width) and Phase 9-05 added the
"Export highlights" button (44px), growing the header to ~405–427px at 320–360px widths:

- At 360x640 the pinned height is 494px → `.page-viewport` collapsed to **67.2px** → every
  measured atomic block exceeded the 75%/90% oversize threshold → genuine
  `oversized-block` fallback → `Expected "ok", Received "fallback"` on every fixture whose
  atomic blocks crossed the (fixture-dependent) line — 33 cells by 09-07.
- At ≤320x420 the header exceeded the whole pinned height → `.page-viewport` collapsed to
  **0px** → `pageContentBoxHeightPx` stayed 0 → the pagination effect's `<= 0` guard never
  released → `__lemPagination` never published → the fallback-oversize + termination
  pathological specs' `waitForFunction` timed out at 15s (6 cells).
- The capture-highlight figure-caption cells shared the same geometry: the shrunken page
  viewport changed page-1 block distribution so the first page carried no figure+caption
  (`captionIdx === -1`) and shifted the eligible-set block distribution. Verified by
  reverting the CSS fix in-place: the capture cells fail with the old geometry and pass
  with the fix — the capture path itself (capture.ts / BlockRenderer) was never broken.
- The dexie-migration v3→v4 cells were **not** stale against LibraryView's row shape: the
  `aria-labelledby="title-{id}"` accessible name resolves to "V3 Seeded Article" (the row
  structure is byte-stable from FixtureList by Pitfall 8-5 design). The recorded failure
  did not reproduce at 09-07 (green × 3 engines, ×2 repeats on firefox/webkit). Zero spec
  changes; zero production changes.

**Fix:** `de0b800` caps the header row at `minmax(auto, 25%)` of the pinned height (the
reading page always keeps ≥ 75%) and makes the header a scroll container
(`min-height: 0; overflow-y: auto`) so tags/export stay reachable. One production file
changed (`src/app.css`); **zero spec assertions were weakened** — the four pagination spec
files are byte-unchanged, per the strengthen-only acceptance gate (T-9-22).

---

## 6. Anti-Pattern Guard (attestation)

- The executor ran `npm run test` itself (single invocation per recorded run). ✓
- The executor did NOT trust any prior SUMMARY's "green" claim — including the Phase 08
  counts and its own mid-plan targeted runs. ✓
- The executor did NOT run a subset + aggregate. ✓
- The executor did NOT pass `--grep` or any filter. ✓
- The executor did NOT skip any engine. ✓
- Both pass AND fail counts are recorded for EVERY invocation (run 1: 2 failed, exit 1 —
  recorded in §4 with the fixes; run 2: fail = 0, recorded honestly, not omitted). ✓
- The literal exit codes (1, then 0) are recorded. ✓

No euphemisms. No selective reporting. The suite is green; this file is the proof.
