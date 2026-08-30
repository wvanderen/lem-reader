# Phase 18 Deferred Items

Out-of-scope discoveries logged during execution (not fixed per executor
scope boundary — only issues directly caused by the current task's changes
are auto-fixable).

## 18-01

- **Pre-existing TS error in `tests/e2e/ingestion/dexie-migration.spec.ts:715`**
  (TS2339: Property 'provenance' does not exist on the narrowed
  `articleRow` type `{ id, readerTitle?, readerAuthor? }`). Introduced by
  Phase 17 commit 83d8f99 ("v5-row override hydration migration proof") —
  `articleRow` is narrowed by an earlier indexed-access and the later
  `articleRow?.provenance` access trips TS 7 narrowing. Discovered during
  18-01 Task 1's `npx tsc --noEmit` verification; unrelated to `toc.ts`
  (nothing in the ingestion spec imports it). Unit + e2e suites unaffected
  (Vite transform does not type-check); needs a fix in the spec's own type
  annotation (e.g. typing the row as the raw IndexedDB shape).

## 18-04

- **Top-layer popover sequential-focus divergence (browser platform
  finding, probed on the 1.61.1 matrix)**: Tab behavior from inside the
  `popover="manual"` TOC panel differs per engine — chromium flows focus
  out into the page; webkit's first Tab leaves the panel (to body, where
  webkit's Tab then stalls); firefox scopes sequential navigation WITHIN
  the top-layer popover (focus rests on the visible operable entry).
  D18-04's "Tab leaves the panel into the page" is literally satisfiable
  only on chromium; Esc (proven closing + focus-restore on all three
  engines) is the universal keyboard escape. `toc-geometry.spec.ts`
  asserts the honest per-engine shapes with the divergence documented
  in-spec. Worth a product look if SR-user friction reports emerge
  (possible ACPT matrix item); not fixable in app code without
  abandoning the locked popover=manual implementation.

- **WebKit skips clipped targets in sequential navigation**: at ≤420px the
  staged-collapse destinations (`position:absolute; width:1px;
  clip:rect(0 0 0 0)`) are NOT reached by Tab/Shift+Tab walks on webkit
  (probed: both directions from real elements land on body), while
  chromium/firefox step onto them and un-clip via :focus-visible. The
  staged-collapse cell follows the back-nav.spec.ts webkit precedent
  (programmatic focusability carries the reachability claim). If webkit
  keyboard users report the collapsed destinations unreachable, the
  collapse mechanism needs a webkit-specific accommodation.

- **Honest-gate environment note (the 09-07/15-04 class)**: five full
  `npm run test` invocations were recorded on a machine under external
  load (load average ~11 on 10 CPUs). Runs 1-4 at default workers each
  exited 1 with a ROTATING webkit-only failure set (9/6/3/6 cells), every
  distinct failing spec green in isolation. The green gate ran the full
  matrix (every spec, every engine, no subset) with `--workers=4` as the
  documented contention control. If CI shows the same starvation, consider
  a workers cap in CI only (playwright.config.ts is byte-stable locally).
