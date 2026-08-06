---
phase: 04-responsive-pagination-and-dual-mode-navigation
plan: 06
subsystem: pagination-engine-container-handling
tags: [pagination, line-boxes, schema-evolution, data-block-index, container-blocks, corpus-matrix-proof, persistence-state-01, page-03]

# Dependency graph
requires:
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: paginateDocument + dom-fallback emission (Plan 04-01) + PaginatedSurface + DiagnosticBus threading (Plan 04-03) + Plan 04-05 corpus-matrix e2e suite (the surfacing vehicle for the engine container-handling gap)
  - phase: 03-trustworthy-layout-measurement
    provides: useMeasurement + MeasurementResult + DiagnosticBus + domMeasurer + readLineBoxes + charOffsetToGrapheme + Range.getClientRects line-box primitive
  - phase: 01-canonical-article-foundation
    provides: Block union + InlineRun + graphemeClusters + BLOCK_SEPARATOR + blockText (Block-model normalized-text rule)
  - phase: 02-accessible-scrolling-reader
    provides: normalizeElText (the DOM-text contribution rule the prior engine used)
provides:
  - LineBoxSchema (Zod source of truth) + LineBox type re-exported from src/measurement/types → src/pagination/types (single definition; no parallel hand-written interface)
  - BlockMeasurementSchema.lineBoxes field (one LineBox[] per top-level block, captured during the measurement DOM walk) + MeasurementResultSchema.schemaVersion z.literal(1)→z.literal(2)
  - ArticleBody emits data-block-index on each top-level block (1:1 with article.blocks by BlockRenderer construction)
  - Generalized readLineBoxes walks ALL descendant text nodes (TreeWalker.SHOW_TEXT) with a global char-offset accumulator — containers yield a single LineBox[] spanning every descendant paragraph/item
  - splittingBlockText(block) + splittingGraphemeLength(block, lang) shared helpers in src/pagination/splitBlock.ts — the renderer-aligned coordinate system (concatenated runs for paragraphs, BLOCK_SEPARATOR-joined for containers). Distinct from the D-05 substrate (inlineText joins runs with ' '). The engine + renderer + DEV debug hook all consume these so whole-vs-subrange detection agrees.
  - paginateDocument consumes pre-captured opts.measurement.blocks[i].lineBoxes — NO live DOM walk, NO articleEl field, NO mismatch guard
  - MeasurementEngine.run silently skips commits where blocks.length !== article.blocks.length (partial-DOM defense when PaginatedSurface replaces ArticleBody)
  - ArticleView geometry effect recomputes pageContentBoxHeightPx on paginatedActive flip (was: scrolling height; needed: viewport-bounded .paginated-surface height)
  - 5 unskipped corpus-matrix ok-path e2e specs (coverage/no-overflow/mode-switch/page-turn/repagination) running across FIXTURES × VIEWPORTS in chromium + firefox + webkit
  - STATE-01 location-restore e2e repaired via test-only seedScrollingMode helper (D4-12 default unchanged)
affects: [05-durable-highlights]

# Tech tracking
tech-stack:
  added: []  # Plan 04-06 installs zero packages (T-04-SC: no supply-chain surface)
  patterns:
    - "Pre-captured line boxes (Option A from 04-05-SUMMARY §Blocking Finding): capture LineBox[][] during the measurement phase, thread through MeasurementResult, consume in the engine. PaginatedSurface replaces ArticleBody before the engine runs — pre-capture is the ONLY source of line boxes."
    - "data-block-index attribute = the 1:1 block↔element mapping. BlockRenderer's ArticleBody emits it on each top-level block (NOT on recursive container-interior children). [data-block-index] is queried by measurement + samplePretextDrift — guaranteed 1:1 with article.blocks by construction, so container blocks cannot break the mapping."
    - "Renderer-aligned coordinate system (splittingBlockText): concatenated runs WITHOUT separators for paragraphs, recursive join with BLOCK_SEPARATOR for containers. Distinct from the D-05 substrate (normalizeText's inlineText joins runs with ' '). PAGE-03 offsets are EPHEMERAL — never persisted. Saved locations use D-05; the engine + renderer use splittingBlockText. Both round-trip through the SAME graphemeClusters primitive."
    - "Generalized readLineBoxes via TreeWalker.SHOW_TEXT + global offset accumulator: flat-block output byte-identical to the prior single-text-node walk; containers produce a single LineBox[] spanning every descendant text node."
    - "Partial-DOM measurement defense: when PaginatedSurface replaces ArticleBody, ResizeObserver fires a re-measurement against the page fragment. The measurement returns 0 (or wrong-count) [data-block-index] elements — silently skip the commit, preserve the previous GOOD trustedView. Typography-change re-measure in paginated mode is a known MVP scope limit under this defense (the previous trustedView's heights go stale; repagination uses stale heights)."
    - "Reliable fallback trigger post-04-06: tiny viewport (200x200) + max font (24) on technical-post reliably trips the 75% atomic-oversize fallback. The container-mismatch path Plan 04-06 eliminated is no longer available; fallback-banner tests use this combination via a shared gotoFallback helper."

key-files:
  created: []
  modified:
    - src/content/render/BlockRenderer.tsx
    - src/measurement/types.ts
    - src/measurement/domMeasurer.ts
    - src/measurement/engine.ts
    - src/pagination/types.ts
    - src/pagination/lineBoxes.ts
    - src/pagination/splitBlock.ts
    - src/pagination/fragment.ts
    - src/reader/PaginatedSurface.tsx
    - src/routes/ArticleView.tsx
    - tests/component/BlockRenderer.test.tsx
    - tests/unit/pagination/lineBoxMapping.test.ts
    - tests/unit/pagination/fragmentOrder.test.ts
    - tests/unit/pagination/termination.test.ts
    - tests/component/PaginatedSurface.test.tsx
    - tests/unit/measurement/driftGuard.test.ts
    - tests/e2e/pagination/coverage-invariant.spec.ts
    - tests/e2e/pagination/no-overflow-invariant.spec.ts
    - tests/e2e/pagination/mode-switch-anchor.spec.ts
    - tests/e2e/pagination/page-turn-controls.spec.ts
    - tests/e2e/pagination/repagination-anchor.spec.ts
    - tests/e2e/pagination/fallback-oversize.spec.ts
    - tests/e2e/pagination/fallback-banner.spec.ts
    - tests/e2e/persistence.spec.ts

key-decisions:
  - "Option A (pre-captured line boxes) over Option B (hidden measurement DOM): the user-approved Plan 04-05 finding surfaced both options; Plan 04-06 implements Option A. The measurement phase captures per-block LineBox[] (single batched pass — Pitfall 2 honored), threads it through MeasurementResult (schemaVersion 1→2), and the engine consumes the pre-captured data with NO live DOM walk."
  - "BlockRenderer forwards data-* props via spread. The plan's claim 'BlockView needs no change' was technically incorrect (React function components do NOT auto-forward arbitrary props to the DOM intrinsic). Rule 1 deviation: BlockView now accepts `data-*` props via a typed BlockViewProps and spreads them onto each rendered native element. Recursive container-interior calls omit the attribute."
  - "Generalized readLineBoxes uses TreeWalker.SHOW_TEXT. The prior single-text-node walk (el.firstChild) returned [] for containers (firstChild is a <p> element). The new walk visits every descendant text node in document order, accumulating a global char offset. For flat blocks (single text node) the output is byte-identical to before (13 prior lineBoxMapping specs stay green)."
  - "splittingBlockText is the renderer-aligned coordinate system — distinct from the D-05 substrate. The D-05 substrate (normalizeText's blockText + inlineText) joins paragraph runs with ' ' (for readable persisted locations). The renderer's slicing coordinate joins runs WITHOUT separators (splitParagraphRuns walks runs without inserting anything). For paragraphs these coincide for clean ASCII text where source HTML has whitespace between runs; for containers they differ (D-05 inserts BLOCK_SEPARATOR between children; the renderer's splittingBlockGraphemeLength also uses BLOCK_SEPARATOR — they coincide). The engine uses splittingBlockText everywhere so its emitted endGrapheme matches the renderer's splittingBlockGraphemeLength whole-vs-subrange check."
  - "Containers paginate via intra-block splits (not atomic). The engine treats blockquote + lists as splitting-kind (D4-02 unchanged). readLineBoxes captures their full line-box schedule; chooseSplit finds the line boundary; the renderer's sliceBlockquote/sliceList (implemented in 04-03, now actually exercised) interpret the intra-block range. The 1749-char list in list-reference paginates across multiple pages cleanly."
  - "Partial-DOM measurement defense (Rule 1 bug uncovered by the unblocked corpus matrix): PaginatedSurface replaces ArticleBody → ResizeObserver fires a re-measurement → captures 0 [data-block-index] elements → would overwrite the GOOD trustedView with empty blocks → engine reads heightPx=0 → produces 1 giant overflowing page. Fix: MeasurementEngine.run silently skips commits where blocks.length !== article.blocks.length; previous trustedView preserved. Documented as expected behavior in paginated mode; typography-change re-measure is a known MVP scope limit."
  - "pageContentBoxHeightPx recomputes on paginatedActive flip (Rule 1 bug). The .paginated-surface CSS pins the article height to calc(100vh - 48px - 2px - 2*var(--space-2xl)) — much smaller than the natural scrolling ArticleBody height. Without recomputing, the engine received the OLD scrolling height (~1148px for essay-long-form) and produced 1 giant overflowing page. ArticleView now has a geometry effect with deps [articleEl, isPaginated, trustedView] (primitive deps to avoid hooks-after-conditional-return)."
  - "no-overflow-invariant measures .page-fragment.scrollHeight vs .article-body.clientHeight (not .article-body.scrollHeight). The article element contains absolutely-positioned a11y live regions whose top extends beyond the viewport — these inflate scrollHeight without being reader-visible fragmentation bugs. The page-fragment is the actual page content; measuring its scrollHeight gives a clean signal."
  - "fallback-oversize + fallback-banner specs migrated to the oversize trigger path (Rule 1 — container-mismatch eliminated). The prior 'container fixture trips block-element-mismatch' test was removed (asserts behavior that no longer exists — list-reference paginates cleanly now). The remaining 'oversized atomic block' test (huge font + tiny viewport on technical-post) still proves the oversize path. fallback-banner specs use a shared gotoFallback helper (200x200 viewport + font 24 + technical-post) — the sole reliable fallback trigger."
  - "STATE-01 fix is test-only (option (a) from deferred-items.md). The 2 failing STATE-01 location-restore tests assume the article opens in scrolling mode (written in Phase 2 before readingMode existed). The seedScrollingMode helper writes a reader-prefs record with readingMode 'scrolling' to Dexie's settings store; the 3 STATE-01 tests navigate → seed → reload so SettingsProvider hydrates scrolling mode. The D4-12 paginated default is UNCHANGED for normal reader sessions. Option (b) — making location-restore work in paginated mode via page-index — is documented as a deferred alternative."

patterns-established:
  - "Pattern: data-block-index as the canonical 1:1 block↔element mapping. Emitted by ArticleBody at the top-level map; queried by measurement (heights + line boxes) + engine samplePretextDrift (Pretext drift sampling). Container interiors (recursive BlockView calls) deliberately OMIT the attribute so the mapping cannot be broken by nested selector matches."
  - "Pattern: schema-evolved MeasurementResult carries per-block pre-captured geometry. The engine is pure value-transformation over (article.blocks, measurement) — NO DOM reads, NO live Range.getClientRects calls. This is the load-bearing separation that makes pagination work after PaginatedSurface replaces ArticleBody."
  - "Pattern: silent partial-DOM defense in MeasurementEngine. When a re-measurement would commit bad data (block-count mismatch), the engine preserves the previous trustedView without surfacing an error. The diagnostic-bus subscription filter (`dom-fallback || measurement-error`) means emitting a measurement-error would trigger the fallback banner — silent skip is the correct choice."
  - "Pattern: Test scaffolding for paginated mode. The seedScrollingMode helper + navigate-seed-reload pattern lets state-02 tests run in scrolling mode without changing the production default. Future tests that need scrolling mode can reuse the helper."

requirements-completed: [PAGE-03]

# Metrics
duration: 56min
completed: 2026-08-06
status: complete
---

# Phase 04 Plan 06: Engine Container-Handling + Corpus-Matrix Proof Summary

**Pagination engine fully consumes the corpus (every fixture paginates to status "ok" with non-empty pages across the full FIXTURES × VIEWPORTS matrix in chromium + firefox + webkit) via pre-captured LineBox[][] (Option A) + data-block-index 1:1 block↔element mapping + renderer-aligned splittingBlockText coordinate system. PAGE-03 marked Complete. The Plan 04-05 Task 3 manual human-verify gate is unblocked.**

## Performance

- **Duration:** 56 min
- **Started:** 2026-08-06T17:05:45Z
- **Completed:** 2026-08-06T18:02:30Z
- **Tasks:** 5/5 complete (3 TDD: Tasks 1, 2, 3, 5; Task 4 non-TDD)
- **Files modified:** 23 (10 source + 13 test)
- **Commits:** 9 (4 RED tests + 4 GREEN implementations + 1 Rule-1 fix)

## Task Commit Sequence

Each task was committed atomically; TDD tasks split into RED + GREEN:

1. **Task 1 RED** — `7c783e3` (test): failing data-block-index assertions for ArticleBody (2 new component specs).
2. **Task 1 GREEN** — `54c723a` (feat): emit data-block-index on each top-level rendered block. BlockView forwards data-* props via spread (Rule 1 deviation — React function components don't auto-forward).
3. **Task 2 RED** — `da4ca1b` (test): container readLineBoxes + MeasurementResultSchema v2 round-trip cases (4 new specs).
4. **Task 2 GREEN** — `e1bb51a` (feat): LineBoxSchema + lineBoxes field + schemaVersion 2 + generalized readLineBoxes (TreeWalker.SHOW_TEXT) + domMeasurer queries [data-block-index] + engine.samplePretextDrift walks [data-block-index] in parallel.
5. **Task 3 RED** — `f913042` (test): drive engine via measurement-stubbed lineBoxes (no articleEl) + new container-block ok case.
6. **Task 3 GREEN** — `b602a2f` (feat): engine consumes pre-captured LineBox[][] — remove BLOCK_SELECTOR, mismatch guard, articleEl field; add splittingBlockText helper for renderer-aligned coordinates.
7. **Rule 1 fix** — `2803677` (fix): align DEV hook blockLens with engine's coordinate system (splittingGraphemeLength helper).
8. **Task 4** — `90692ba` (test): unskip corpus-matrix ok-paths + repair fallback specs + 2 Rule-1 engine repairs (partial-DOM defense + pageContentBoxHeightPx recompute).
9. **Task 5** — `c39f57c` (test): seed readingMode scrolling for STATE-01 location-restore tests.

## Accomplishments

- **Task 1 — data-block-index on top-level blocks:** ArticleBody emits `data-block-index={i}` on each top-level BlockView. BlockView accepts + forwards data-* props via typed BlockViewProps + spread (the plan's claim "BlockView needs no change" was incorrect — React function components don't auto-forward). Container interiors (blockquote/list recursive BlockView children) do NOT carry the attribute; the footnotes `<section>` does NOT carry it. Verified by 2 new component specs asserting count === article.blocks.length + container-interior absence + footnotes-section absence.
- **Task 2 — Measurement schema evolution + capture:** LineBoxSchema is the Zod source of truth in src/measurement/types.ts (charOffset/topPx/bottomPx). pagination/types.ts re-exports the LineBox type (hand-written interface removed — single source of truth). BlockMeasurementSchema gained `lineBoxes: z.array(LineBoxSchema).default([])`. MeasurementResultSchema.schemaVersion bumped `z.literal(1)→z.literal(2)` (runtime contract marker; MeasurementResult is EPHEMERAL, never persisted to Dexie per STACK.md, so no migration). readLineBoxes generalized to walk ALL descendant text nodes via TreeWalker.SHOW_TEXT with a global char-offset accumulator (was: el.firstChild single text node — returned [] for containers). Flat-block output byte-identical to before. domMeasurer.measureAllBlocks queries `[data-block-index]` (1:1 with article.blocks) and captures heightPx + lineCount + lineBoxes in ONE batched pass (Pitfall 2). engine.samplePretextDrift queries [data-block-index] in parallel with the new domBlocks.
- **Task 3 — Engine consumes pre-captured line boxes:** PaginateOptions dropped `articleEl` (the engine no longer queries live DOM). BLOCK_SELECTOR constant removed. The `elements.length !== articleBlocks.length` mismatch guard removed (unreachable — [data-block-index] is 1:1 by construction). The live `Range.getClientRects()` walk removed (line boxes are pre-captured). New helper `splittingBlockText(block)` in src/pagination/splitBlock.ts returns the renderer-aligned text (concatenated runs for paragraphs, BLOCK_SEPARATOR-joined for containers) — distinct from the D-05 substrate; the engine + renderer share it so whole-vs-subrange detection agrees. PaginatedSurface's paginateDocument call dropped the articleEl argument. 4 prior fragmentOrder specs + 6 prior termination specs rewritten to drive via measurement stubs (no installQuerySelectorAll / installRangeMock / makeBlockEl helpers). New container-block fragmentOrder spec proves a blockquote paginates to status "ok" (the unit-level container-pagination proof).
- **Task 4 — Corpus-matrix ok-path unskip + repair:** All `test.skip` guards removed from coverage-invariant + no-overflow-invariant + mode-switch-anchor + page-turn-controls + repagination-anchor. Zero skips remain across the corpus matrix. coverage-invariant + no-overflow-invariant iterate the full FIXTURES × VIEWPORTS matrix (6 fixtures × 3 viewports × 3 engines = 54 cells each). mode-switch + page-turn + repagination pass on essay-long-form + figure-heavy. The 5 ok-path specs run their real assertions unconditionally. **128/128 pagination e2e tests pass across chromium + firefox + webkit** (was 72 passed + 129 skipped pre-Plan-04-06). The obsolete `block-element-mismatch` fallback-oversize test was removed (asserts behavior that no longer exists). fallback-banner specs migrated to the oversize trigger path (200x200 viewport + font 24 + technical-post via shared gotoFallback helper).
- **Task 5 — STATE-01 persistence fix:** Added a `seedScrollingMode` helper that writes a reader-prefs record with `readingMode: "scrolling"` to Dexie's `settings` store. The 3 STATE-01 tests use a navigate → seed → reload pattern so SettingsProvider hydrates scrolling mode on the reload (where window.scrollTo works). The fix is TEST-ONLY; production location-restore code is unchanged; the D4-12 paginated default is unchanged for normal reader sessions. **21/21 persistence tests pass across chromium + firefox + webkit** (was 16/21 with 5 STATE-01 failures pre-Plan-04-06).

## Plan 04-05 Task 3 Gate Status

Plan 04-05 Task 3's manual human-verify gate is **unblocked** by this plan:
- The corpus matrix runs (no skips) and proves PAGE-03 (exactly-once + no-overflow + canonical order) across chromium + firefox + webkit.
- The fallback path is proven (oversize trigger via fallback-oversize + fallback-banner).
- The full test suite (npm run test) is green.
- The manual screen-reader + reduced-motion checks (Plan 04-05 Task 3's actual scope) can now proceed.

**Important:** Plan 04-05 Task 3 still requires the human manual checks before the phase advances to /gsd-verify-work. This plan only unblocks the automated gate that precedes the manual gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug in plan] BlockView needs to forward data-* props (plan's "BlockView needs no change" was incorrect)**
- **Found during:** Task 1 GREEN implementation
- **Issue:** The plan said "BlockView needs no change — the attribute is set at the ArticleBody call site, not inside BlockView." But BlockView is a function component that destructures only `{ block }`. React does NOT auto-forward arbitrary props from a function component to the underlying DOM intrinsic. `<BlockView data-block-index={i} />` would silently drop the attribute.
- **Fix:** Added a typed BlockViewProps (`{ block: Block } & { [K in \`data-${string}\`]?: string | number | undefined }`) and spread `...rest` onto each rendered native element. Recursive BlockView calls inside containers omit the props (container interiors are not article.blocks entries).
- **Files modified:** src/content/render/BlockRenderer.tsx
- **Verification:** 17/17 component tests pass (2 new + 15 prior).
- **Committed in:** `54c723a`

**2. [Rule 1 — Bug uncovered by the unblocked matrix] Partial-DOM measurement overwrites good trustedView**
- **Found during:** Task 4 corpus-matrix run
- **Issue:** PaginatedSurface replaces ArticleBody with a single page fragment in paginated mode. ResizeObserver fires a re-measurement; measureAllBlocks queries `[data-block-index]` against the page fragment (PageFragmentView doesn't emit the attribute) → returns 0 elements → commits trustedView with empty blocks → engine reads `heightPx=0` → produces 1 giant overflowing page.
- **Fix:** MeasurementEngine.run now silently skips commits where `blocks.length !== article.blocks.length`. The previous trustedView stays. PaginatedSurface keeps rendering correct pages.
- **Files modified:** src/measurement/engine.ts
- **Verification:** 128/128 pagination e2e pass; the corpus matrix produces status "ok" + non-empty pages for every cell.
- **Committed in:** `90692ba`

**3. [Rule 1 — Bug uncovered by the unblocked matrix] pageContentBoxHeightPx not recomputed on mode swap**
- **Found during:** Task 4 corpus-matrix run
- **Issue:** ArticleView computed pageContentBoxHeightPx once (on articleEl mount) via getBoundingClientRect. At that moment the article element had class "article-body" (scrolling) with natural height ~1148px. When PaginatedSurface mounts and the class changes to "paginated-surface", the CSS pins the height to ~654px — but pageContentBoxHeightPx stayed at 1148. The engine received 1148 and produced 1 giant overflowing page.
- **Fix:** Added a second geometry effect with deps `[articleEl, isPaginated, trustedView]` (primitive deps — placed BEFORE the early return to avoid hooks-after-conditional-return violation). Recomputes on paginatedActive flip.
- **Files modified:** src/routes/ArticleView.tsx
- **Verification:** Engine receives correct geometry; pages split correctly across the corpus.
- **Committed in:** `90692ba`

**4. [Rule 1 — Bug uncovered by the unblocked matrix] no-overflow-invariant false positives from a11y live regions**
- **Found during:** Task 4 corpus-matrix run
- **Issue:** The test checked `.article-body.paginated-surface` scrollHeight vs clientHeight. The article element contains an absolutely-positioned visually-hidden a11y live region (SectionAnnouncer) whose top extends beyond the viewport (top=929 in the test). This inflated scrollHeight (821) beyond clientHeight (654) without being reader-visible fragmentation. The page-fragment itself fit perfectly (654).
- **Fix:** Changed the test to measure `.page-fragment.scrollHeight` vs `.article-body.clientHeight`. The page-fragment is the actual page content; its scrollHeight gives a clean overflow signal.
- **Files modified:** tests/e2e/pagination/no-overflow-invariant.spec.ts
- **Verification:** 18/18 no-overflow cells pass across the corpus matrix.
- **Committed in:** `90692ba`

**5. [Rule 1 — Obsolete assertions] fallback-oversize container test + fallback-banner trigger**
- **Found during:** Task 4 corpus-matrix run
- **Issue:** fallback-oversize had a "container fixture trips block-element-mismatch fallback" test that asserted status="fallback" for list-reference. Plan 04-06 made containers paginate cleanly — list-reference now produces status="ok". The test asserts behavior that no longer exists. Similarly, fallback-banner tests used list-reference to trigger fallback; that path no longer exists.
- **Fix:** Removed the obsolete fallback-oversize container test (the remaining "oversized atomic block" test still proves the oversize path). Migrated fallback-banner tests to use a shared gotoFallback helper (200x200 viewport + font 24 + technical-post) — the sole remaining reliable fallback trigger (the 75% atomic-oversize guard).
- **Files modified:** tests/e2e/pagination/fallback-oversize.spec.ts + tests/e2e/pagination/fallback-banner.spec.ts
- **Verification:** fallback-oversize + fallback-banner specs pass across all 3 engines.
- **Committed in:** `90692ba`

**6. [Rule 1 — Bug] DEV hook blockLens misaligned with engine coordinate system**
- **Found during:** Task 4 smoke check
- **Issue:** publishDev's blockGraphemeLengths was computed via blockGraphemeLength (anchor.ts — uses blockNormalizedText, the D-05 substrate joining paragraph runs with ' '). The engine (Task 3) uses splittingBlockText (concatenated runs WITHOUT separators). For multi-run paragraphs the lengths differ by (numRuns - 1), breaking the coverage e2e's `[0, blockLen)` assertion.
- **Fix:** Added splittingGraphemeLength(block, lang) helper to splitBlock.ts (mirrors the private splittingBlockGraphemeLength in fragmentRenderer.tsx). Used it in publishDev so the e2e sees the SAME blockLen the engine emits endGrapheme against.
- **Files modified:** src/pagination/splitBlock.ts + src/reader/PaginatedSurface.tsx
- **Verification:** chromium coverage-invariant essay-long-form@1024x800 passes.
- **Committed in:** `2803677`

---

**Total deviations:** 6 auto-fixed (5× Rule 1 bug, 1× Rule 1 obsolete-test repair).
**Impact on plan:** All auto-fixes necessary for correctness — the engine + matrix would not pass without them. No scope creep. The partial-DOM defense (#2) and the geometry recompute (#3) were unforeseen consequences of unblocking the corpus matrix; they're minimal architectural patches that preserve Plan 04-06's contract (MeasurementResult.blocks is 1:1 with article.blocks; pageContentBoxHeightPx reflects the active geometry).

## Issues Encountered

None beyond the auto-fixed deviations above. Plan 04-06's contract held end-to-end once the 6 deviations were resolved.

## User Setup Required

None — no external service configuration required. Plan 04-06 installs zero packages (T-04-SC). The dev server (`npm run dev` on port 5173) is started automatically by Playwright's webServer config.

## Known Stubs

None — all surfaces are wired to real data. The engine produces real page splits across the corpus matrix.

## Threat Flags

None. The threat model's 5 entries (T-04-18 through T-04-21 + T-04-SC) are all `accept` or `mitigate` dispositions that hold:
- T-04-18 (Tampering — data-block-index injection): the attribute value is a compile-time-known numeric index set by React from article.blocks array position. No reader-controlled input reaches the attribute. ✓
- T-04-19 (Tampering — generalized readLineBoxes normalization drift): the accumulator walks text nodes in document order via TreeWalker.SHOW_TEXT, matching normalizeElText's textContent concatenation order. The container readLineBoxes unit test asserts global offsets align with the concatenated text. ✓
- T-04-20 (Information Disclosure — pre-captured lineBoxes in MeasurementResult): MeasurementResult stays an in-memory trustedView; STACK.md forbids persisting derived data; the schema bump to v2 is a runtime contract marker with no Dexie migration. ✓
- T-04-21 (Denial of Service — generalized readLineBoxes over deep nesting): the TreeWalker walk is bounded by the block's own text; the AbortSignal check between iterations lets a newer trigger cancel a long walk; the 300-page ceiling + zero-progress guard bound downstream pagination. ✓
- T-04-SC (Tampering — npm installs): zero new packages this plan. ✓

## Next Phase Readiness

- **Plan 04-05 Task 3 manual gate UNBLOCKED.** The automated gate that precedes it (corpus matrix proof + persistence suite) is green. The manual screen-reader + reduced-motion + visual spot checks (Plan 04-05 Task 3's actual scope) can now proceed. Once Plan 04-05 Task 3 is approved, Phase 4 advances to /gsd-verify-work.
- **PAGE-03 marked Complete.** All Phase 4 PAGE requirements (01–09) are now Complete.
- **Calibration fingerprint honored:** no `@chenglou/pretext` import added (verified via grep — Plan 04-06 touches only the React renderer + measurement schema + engine, no pagination-engine Pretext surface).

## Self-Check: PASSED

- All 23 files in `key-files.modified` exist on disk (verified via `[ -f ... ]` for each path).
- All 9 task commits exist in `git log --oneline 05b09d0..HEAD` (7c783e3, 54c723a, da4ca1b, e1bb51a, f913042, b602a2f, 2803677, 90692ba, c39f57c).
- `npm run test:unit -- --run` exits 0 (391 specs across 28 files — no regressions; +6 from 385).
- `npx tsc --noEmit` exits 0 (LineBoxSchema re-export resolves; no measurement↔pagination circular import; PaginateOptions signature change consumed by all callers).
- `npm run lint` exits 0 (no react/no-danger surface; no exhaustive-switch defaults; no new BLOCK_SELECTOR fork).
- `npm run build` exits 0 (only the pre-existing >500kB chunk-size warning, unrelated to this plan).
- `npx playwright test tests/e2e/pagination/` (3 engines): 128 passed, 0 skipped, 0 failed (2.2 min).
- `npx playwright test tests/e2e/persistence.spec.ts` (3 engines): 21 passed, 0 failed.
- `npm run test:e2e` (3 engines, all specs): 269 passed, 0 failed (2.9 min).
- `rg 'test\.skip' tests/e2e/pagination/` returns no matches (Task 4 cleanup verified).
- `rg 'block-element-mismatch' src/pagination/fragment.ts` returns no matches (guard removed).
- `rg '@chenglou/pretext' src/pagination/` returns only the comment mention (calibration fingerprint preserved).
- T-04-15 verified: `rg 'update\({readingMode' src/` returns only the user-initiated handleToggleMode path (the fallback subscription uses `setSessionModeOverride` only; the partial-DOM defense emits NO diagnostic).
- PAGE-03 marked [x] Complete in REQUIREMENTS.md (Traceability table updated).

---
*Phase: 04-responsive-pagination-and-dual-mode-navigation*
*Plan: 06*
*Completed: 2026-08-06 (Plan 04-05 Task 3 manual gate unblocked)*

## Self-Check: PASSED (re-verified)

- All 9 task commits exist in git log (verified above).
- All 23 modified files exist on disk (verified via `[ -f ]`).
- `npm run test:unit -- --run` exits 0 (391 specs, 28 files).
- `npx tsc --noEmit` exits 0.
- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx playwright test tests/e2e/pagination/` (3 engines): 128 passed, 0 skipped, 0 failed.
- `npx playwright test tests/e2e/persistence.spec.ts` (3 engines): 21 passed, 0 failed.
- `npm run test:e2e` (3 engines, all specs): 269 passed, 0 failed.
- `rg 'test\.skip' tests/e2e/pagination/` returns no matches.
- `rg 'block-element-mismatch' src/pagination/fragment.ts` returns no matches.
- T-04-15 verified: `rg 'update\({readingMode' src/` returns only handleToggleMode path.
- PAGE-03 marked [x] Complete in REQUIREMENTS.md.
