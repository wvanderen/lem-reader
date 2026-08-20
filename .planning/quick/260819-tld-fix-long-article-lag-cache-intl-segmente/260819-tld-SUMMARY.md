---
phase: quick-260819-tld
plan: 01
subsystem: reading-performance
tags: [performance, caching, grapheme-offsets, pagination, annotations, scroll-restore]
status: complete
requires: []
provides:
  - "articleGraphemeIndex — per-article clusters + blockStartOffsets prefix sums (WeakMap on article object)"
  - "Locale-keyed Intl.Segmenter cache behind graphemeClusters (single construction site)"
  - "O(1) pageStartGlobalOffset + O(pages) fragmentContainingOffset"
  - "Index-backed resolveQuoteSelector (one segmentation per article on open)"
  - "findAllOccurrences first-cluster fast path (no per-position slice+join)"
  - "elementGraphemeLength — per-(element, article) WeakMap length cache for scroll paths"
affects: []
tech-stack:
  added: []
  patterns:
    - "WeakMap identity keying for immutable domain objects (D-05 one-revision-one-string)"
    - "Article-identity guard on DOM-element caches (React node reuse across article swaps)"
    - "Old-loop replica oracles in tests prove cached paths byte-identical"
key-files:
  created:
    - tests/unit/grapheme-index-cache.test.ts
  modified:
    - src/content/normalizeText.ts
    - src/pagination/anchor.ts
    - src/annotations/resolution.ts
    - src/reader/restoreLocation.ts
decisions:
  - "Caching fix only — offsets byte-identical by construction (old loops replicated as test oracles), zero schema/persistence/signature changes"
  - "blockStartOffsets sentinel entry = old capped accumulation (out-of-range blockIndex reproduces the old loop exactly)"
  - "perBlockLengths from per-block segmentation, never from splitting joined text on BLOCK_SEPARATOR (code-block sources contain newlines)"
  - "Element cache guarded by article OBJECT identity, not element-only keying (React reconcile reuses DOM nodes across article swaps)"
metrics:
  duration: "10 min"
  completed: "2026-08-20T02:38:16Z"
  tasks: "3 of 4 (Task 4 = blocking human smoke check, PENDING)"
---

# Quick Task 260819-tld: Fix long-article lag (cache Intl.Segmenter work) Summary

Eliminated ~100k-grapheme-article reader lag by caching segmentation in the D-05 hot paths — segmenter instances per locale, a per-article grapheme index (clusters + prefix sums) making page turns O(1), index-backed highlight resolution, a first-cluster fast path in findAllOccurrences, and a per-element length cache for scroll listeners — with every offset proven byte-identical to the uncached loops by replica-oracle tests.

## What Was Built

**Task 1 — Segmenter cache + per-article grapheme index (`9d4a24b`)**
- `src/content/normalizeText.ts`: module-level `Map<string, Intl.Segmenter>` keyed on locale with a single `new Intl.Segmenter` construction site; `graphemeClusters` signature/output unchanged.
- New exported `ArticleGraphemeIndex` (`normalizedText`, `clusters`, `perBlockLengths`, `blockStartOffsets`, `totalGraphemes`) + `articleGraphemeIndex(article)` backed by a `WeakMap` keyed on the article object (D-05 immutability rationale documented in-code). `perBlockLengths` derived by per-block segmentation — never by splitting the joined text on `BLOCK_SEPARATOR` (code-block sources contain newlines).
- `graphemeLength` and `deriveQuoteSelector` now served by the index (were re-segmenting the whole article per call).

**Task 2 — O(1) page anchors + cluster reuse + fast path (`c1e230c`)**
- `src/pagination/anchor.ts`: `pageStartGlobalOffset` is a prefix-sum lookup (out-of-range blockIndex clamps to the sentinel entry — byte-identical to the old capped walk); `fragmentContainingOffset` carries each page start forward, dropping from O(pages×blocks) to O(pages); `blockGraphemeLength` unchanged with a hot-path pointer comment.
- `src/annotations/resolution.ts`: `resolveQuoteSelector` reads `articleGraphemeIndex(article).clusters` (one segmentation per article on open, regardless of highlight count); `findAllOccurrences` gains a first-cluster guard so only first-cluster-matching positions pay the slice+join.
- Forbidden files untouched: `progress.ts`, `useScrollSave.ts`, `PaginatedSurface.tsx`, `ArticleView.tsx` — they get the speedup transitively.

**Task 3 — Per-element length cache + full gate (`9bd73ee`)**
- `src/reader/restoreLocation.ts`: `elementGraphemeLength(article, el)` behind `WeakMap<HTMLElement, {article, length}>` with an article-identity guard (React DOM-node reuse across article swaps forces recompute — invalidation rationale in-code); both `findScrollTarget` and `computeTopVisibleOffset` served by it. After the first pass, scroll listeners do only `getBoundingClientRect` reads + lookups.
- `tests/unit/grapheme-index-cache.test.ts` (538 lines): old-walk replica oracles for both scroll helpers, an `Intl.Segmenter.prototype.segment` call-count spy proving zero segmentation on cache hit and exactly N recomputes under a different article object, and code-block verbatim-length coverage through the cache.

## Task 4 — PENDING (blocking human checkpoint)

Task 4 (`checkpoint:human-verify`, gate=blocking) was **not** attempted per instructions: human smoke check on the longest saved article — smooth continuous scrolling, ~10 instant page turns, unchanged restore/highlight behavior (steps in `260819-tld-PLAN.md` Task 4). No dev server was started by the executor.

## Verification Results

| Gate | Result |
|------|--------|
| Task 1: `npx vitest run grapheme-index-cache + normalizeText + graphemeOffsets + selectors` | ✅ 35/35 passed |
| Task 1: `rg -c "new Intl.Segmenter" src/content/normalizeText.ts` | ✅ exactly `1` |
| Task 2: `npx vitest run grapheme-index-cache + pagination + resolve-quote-selector + selector-roundtrip` | ✅ 121/121 passed |
| Task 3: `npx vitest run` (full unit suite) | ✅ 1230 passed / 0 failed / 13 skipped (documented intentional skips) — 84 files |
| Task 3: `npx tsc --noEmit` | ✅ clean |
| Task 3: `npm run lint` | ⚠️ exits 1 — **pre-existing** failures in `src/portability/zipSlip.ts` only (proven on pre-change content via `git show HEAD~3 … | eslint --stdin`; landed in Phase 09-01 commit 9793d1f). All 5 files touched by this task are individually lint-clean (0 problems). Logged in `deferred-items.md`; not fixed per scope-boundary rule. |
| `git status --porcelain package.json` | ✅ empty (byte-unchanged, no new dependencies) |
| Zero edits to existing test files | ✅ (`git diff 1533d19..HEAD -- tests/` shows only the new file) |

## Deviations from Plan

1. **[Rule 1 - Test-harness fix, Task 3]** Two initial RED-run failures were test bugs, not implementation bugs: the inline old-loop oracles re-segmented inside the spy-measured window, polluting `Intl.Segmenter.prototype.segment` call counts (13 and 4 instead of 0 and 2). Fixed by computing oracle expectations outside the measured window; assertions then proved the implementation correct on first run.
2. **[Scope boundary, Task 3]** `npm run lint` cannot pass repo-wide due to pre-existing `zipSlip.ts` errors unrelated to this task (see Verification table). Documented in `deferred-items.md` rather than fixed.
3. **Minor interpretations** (within plan intent, noted for the record): the plan's "empty article … blockStartOffsets `[0]`" is asserted via a cast 0-block `CanonicalArticle` because `ArticleSchema` enforces `blocks.min(1)`; a schema-valid empty-text article (empty code-block source) is additionally covered with its formula-correct `[0, 1]` offsets. Unused imports (`BLOCK_SEPARATOR` in anchor.ts, `normalizeText` in resolution.ts) were dropped when the rewires removed their last uses — required for `tsc --noEmit` under `noUnusedLocals`.

## TDD Gate Compliance

All three tasks followed RED → GREEN: Task 1's tests failed first (`articleGraphemeIndex is not a function`, 9/9 RED) before implementation; Task 2's oracle tests were green-by-design against the old code (they encode pre-change semantics and lock the refactor — the plan's stated purpose) and stayed green through the O(1) rewires; Task 3's cache-requiring tests failed first (3/3 RED: spy detected re-segmentation on repeat calls and wrong recompute count) before the element cache landed. Plan frontmatter is `type: execute` (not `type: tdd`), so per-task gate commits apply; commits were made atomic per orchestrator instruction.

## Threat Flags

None — no new trust-boundary surface (all caches client-local, in-memory, keyed on immutable domain objects; T-tld-01 mitigations implemented exactly as planned: WeakMap article-identity keying + article-identity guard on the element cache; T-tld-02 first-cluster fast path + once-per-article index; T-tld-SC package.json byte-unchanged).

## Self-Check: PASSED

All 5 key files exist on disk; all 3 commits (`9d4a24b`, `c1e230c`, `9bd73ee`) present in git log; test file 538 lines (≥ 80 required); no unintended deletions in any commit; working tree clean of code changes (only orchestrator-owned planning docs remain untracked).
