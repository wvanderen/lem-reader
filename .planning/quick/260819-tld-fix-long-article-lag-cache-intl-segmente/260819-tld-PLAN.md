---
phase: quick-260819-tld
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/content/normalizeText.ts
  - src/pagination/anchor.ts
  - src/annotations/resolution.ts
  - src/reader/restoreLocation.ts
  - tests/unit/grapheme-index-cache.test.ts
autonomous: false
requirements: [QUICK-260819-TLD]
must_haves:
  truths:
    - "Scrolling a ~100k-grapheme article no longer re-segments the article per scroll event — both scroll listeners (useScrollSave + ArticleView anchor capture) do only getBoundingClientRect reads and cache lookups after first pass"
    - "Page turns compute pageStartGlobalOffset in O(1) via precomputed prefix sums (no per-block re-segmentation walk), fragmentContainingOffset is O(pages) not O(pages×blocks), and paginatedProgressRatio never re-segments the whole article"
    - "Opening an article with highlights segments the article once total (not once per highlight), and findAllOccurrences no longer allocates a slice+join per candidate position"
    - "Every D-05 grapheme offset is byte-identical to the uncached implementation — the full unit suite passes with zero edits to existing tests"
    - "No new dependencies (package.json byte-unchanged) and zero changes to persisted data or schemas"
  artifacts:
    - path: "src/content/normalizeText.ts"
      provides: "Locale-keyed Intl.Segmenter instance cache + per-article ArticleGraphemeIndex (WeakMap keyed on the article object: clusters, perBlockLengths, blockStartOffsets prefix sums, totalGraphemes)"
      contains: "articleGraphemeIndex"
    - path: "src/pagination/anchor.ts"
      provides: "O(1) pageStartGlobalOffset via blockStartOffsets lookup; O(pages) fragmentContainingOffset with carried-forward page starts"
      contains: "articleGraphemeIndex"
    - path: "src/annotations/resolution.ts"
      provides: "resolveQuoteSelector reusing the per-article cluster array; findAllOccurrences first-cluster fast path"
      contains: "articleGraphemeIndex"
    - path: "src/reader/restoreLocation.ts"
      provides: "Per-DOM-element normalized-grapheme-length cache (WeakMap guarded by article object identity) shared by findScrollTarget + computeTopVisibleOffset"
      contains: "elementGraphemeLength"
    - path: "tests/unit/grapheme-index-cache.test.ts"
      provides: "Equivalence proofs: cached paths vs uncached old-loop replicas, cache invalidation on article-identity change, prefix-sum math"
      min_lines: 80
  key_links:
    - from: "src/pagination/anchor.ts"
      to: "src/content/normalizeText.ts"
      via: "pageStartGlobalOffset reads articleGraphemeIndex(article).blockStartOffsets — the SAME substrate module every other offset consumer uses (no fork)"
      pattern: "articleGraphemeIndex"
    - from: "src/annotations/resolution.ts"
      to: "src/content/normalizeText.ts"
      via: "resolveQuoteSelector reads articleGraphemeIndex(article).clusters instead of re-running normalizeText + graphemeClusters per highlight"
      pattern: "articleGraphemeIndex"
    - from: "src/reader/restoreLocation.ts"
      to: "src/content/normalizeText.ts"
      via: "elementGraphemeLength composes normalizeElText + graphemeClusters (imported, never reimplemented) behind a WeakMap"
      pattern: "graphemeClusters"
    - from: "tests/unit/grapheme-index-cache.test.ts"
      to: "src/pagination/anchor.ts"
      via: "replicates the OLD accumulation loop (per-block length + separator walk) and asserts the new O(1) path returns identical offsets for every synthetic fragment"
      pattern: "blockStartOffsets"
---

<objective>
Eliminate long-article reader lag (~100k+ grapheme marxist.com articles) by caching
Intl.Segmenter work in the D-05 hot paths: scrolling (computeTopVisibleOffset runs twice per
scroll event over the whole article), paginated page turns (pageStartGlobalOffset walks +
whole-article graphemeLength per turn; fragmentContainingOffset is quadratic), and highlight
resolution on open (full normalizeText + segmentation per highlight + slice/join churn in
findAllOccurrences).

This is a CACHING fix only. Offsets must be byte-identical — same segmentation, computed once
and reused. NOT a batching/chunking redesign. Zero changes to the D-05 offset contract,
persisted data, schemas, or dependencies.

Purpose: restore the core product promise (calm, stable reading) on long articles — the lag
undermins predictable navigation for exactly the accessibility-first audience this prototype
serves.

Output: Four source files with caches added in place (public signatures unchanged), one new
unit test file proving cached-path equivalence, and a human smoke check on the longest saved
article.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md

# Hot-path sources (read-first — every change is in-place in these files)
@src/content/normalizeText.ts
@src/pagination/anchor.ts
@src/annotations/resolution.ts
@src/reader/restoreLocation.ts

# Consumers that must NOT be modified (they compose the fixed helpers — REUSE, DO NOT FORK)
@src/pagination/progress.ts
@src/reader/useScrollSave.ts
@src/reader/PaginatedSurface.tsx
@src/routes/ArticleView.tsx

# Test conventions to mirror (ArticleSchema.parse fixtures, HTMLElement stubs)
@tests/unit/restoreLocation.test.ts
@tests/unit/normalizeText.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Segmenter instance cache + per-article grapheme index in normalizeText.ts</name>
  <files>src/content/normalizeText.ts, tests/unit/grapheme-index-cache.test.ts</files>
  <behavior>
    - Test: articleGraphemeIndex(article).clusters deep-equals graphemeClusters(normalizeText(article), article.lang) for a multi-block fixture (paragraphs + code block + footnotes).
    - Test: blockStartOffsets[i] + intra-block offset equals a manual replica of the OLD pageStartGlobalOffset accumulation (sum of per-block length + BLOCK_SEPARATOR.length for j < i) for every i, including the sentinel entry at i = blocks.length.
    - Test: graphemeLength(article) equals clusters.length and is stable across repeated calls; empty article (no blocks, no footnotes) yields totalGraphemes 0 and blockStartOffsets [0].
    - Test: deriveQuoteSelector output is identical when computed twice (first call builds index, second hits cache) and identical to direct cluster-array slicing.
    - Test: two ArticleSchema.parse calls of the same raw article produce two distinct article objects — each gets its own index entry (WeakMap identity keying; no cross-article reuse).
  </behavior>
  <action>
    In src/content/normalizeText.ts:

    1. LOCALE-KEYED SEGMENTER CACHE: add a module-level Map(string → Intl.Segmenter) and a
       private getter that constructs a segmenter with granularity "grapheme" only on a locale
       miss. Rewire graphemeClusters (currently constructs a new Intl.Segmenter on EVERY call,
       line ~104) to use the cached instance. The exported signature
       graphemeClusters(text: string, locale: string): string[] and its output are UNCHANGED —
       every caller (resolution.ts prefix/suffix/exact, restoreLocation.ts element text,
       measurement/textMeasurer, capture-offset-mapping) keeps working and stops paying the
       per-call constructor cost. Exactly one construction site must remain in the file.

    2. PER-ARTICLE GRAPHEME INDEX: add an exported interface ArticleGraphemeIndex with fields
       normalizedText: string; clusters: readonly string[] (full-article grapheme clusters of
       normalizeText(article)); perBlockLengths: readonly number[] (body-block grapheme
       lengths); blockStartOffsets: readonly number[] (prefix sums of length
       article.blocks.length + 1, where entry i = sum over j < i of perBlockLengths[j] +
       BLOCK_SEPARATOR.length; the final entry is the sentinel equal to the full body span);
       totalGraphemes: number (= clusters.length, including the footnotes region).

       Add an exported function articleGraphemeIndex(article: CanonicalArticle):
       ArticleGraphemeIndex backed by a module-level WeakMap keyed on the article OBJECT.
       Contract note to write in a comment: D-05 guarantees ONE deterministic normalized-text
       string per article revision and articles are immutable once parsed; each parsed article
       object gets exactly one index, garbage-collected with the object. A different revision
       parses to a different object → fresh index.

       CRITICAL PITFALL: derive perBlockLengths by segmenting blockText(article.blocks[i])
       per block (once per article). Do NOT try to split the joined normalizedText on
       BLOCK_SEPARATOR — code-block sources are verbatim and can themselves contain newline
       characters, so separator positions in the joined string are not reliable block
       boundaries. perBlockLengths[i] must equal graphemeClusters(blockText(block), lang).length
       — the exact quantity blockGraphemeLength (src/pagination/anchor.ts) computes today.

    3. REWIRE INTERNAL ARTICLE-LEVEL CONSUMERS (same values, one computation per article):
       graphemeLength(article) returns articleGraphemeIndex(article).totalGraphemes;
       deriveQuoteSelector reads clusters from the index instead of calling
       graphemeClusters(normalizeText(article), lang). Both were re-segmenting the whole
       article on every call (progress ratio per page turn; every highlight capture).

    4. NEW TEST FILE tests/unit/grapheme-index-cache.test.ts following
       tests/unit/restoreLocation.test.ts conventions (ArticleSchema.parse fixture builder,
       baseArticle shape with id/revision/lang/provenance). Write the equivalence tests in
       the behavior block FIRST (they encode the old semantics as the oracle), then implement.

    Do not touch BLOCK_SEPARATOR, normalizeRunText, blockText, blockNormalizedText,
    normalizeText, or the selector types. Do not modify any existing test file.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/grapheme-index-cache.test.ts tests/unit/normalizeText.test.ts tests/unit/graphemeOffsets.test.ts tests/unit/selectors.test.ts && rg -c "new Intl.Segmenter" src/content/normalizeText.ts</automated>
  </verify>
  <done>Index equivalence tests green; pre-existing substrate suites (normalizeText, graphemeOffsets, selectors) green unchanged; exactly ONE Intl.Segmenter construction site in normalizeText.ts; graphemeLength and deriveQuoteSelector served by the index.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: O(1) page anchors + cluster reuse + findAllOccurrences fast path</name>
  <files>src/pagination/anchor.ts, src/annotations/resolution.ts, tests/unit/grapheme-index-cache.test.ts</files>
  <behavior>
    - Test: pageStartGlobalOffset(article, fragment) returns byte-identical offsets to a test-local replica of the OLD loop (walk blocks j < first.blockIndex accumulating blockGraphemeLength + BLOCK_SEPARATOR.length, then + first.startGrapheme) for synthetic fragments covering: block 0, a middle block, the last block, an out-of-range blockIndex (sentinel path), and an empty fragment (0).
    - Test: fragmentContainingOffset(pages, offset, article) returns the same page index as before for: offset 0, offsets at each page start, a mid-page offset, and an offset overshooting the last page (clamps to last index).
    - Test: findAllOccurrences(haystack, needle) matches a naive reference implementation on cases with repeated first clusters (e.g. haystack a,b,a,b with needle a,b), needle at the last valid position, empty needle, and needle longer than haystack.
  </behavior>
  <action>
    In src/pagination/anchor.ts:

    1. pageStartGlobalOffset (line ~59): replace the per-block walk with a single lookup —
       blockStartOffsets entry for first.blockIndex from articleGraphemeIndex(article)
       (out-of-range index falls to the sentinel entry, reproducing the old loop's capped
       accumulation exactly), plus first.startGrapheme. Keep the empty-fragment defensive
       return 0 and the early null guards. Import articleGraphemeIndex from
       ../content/normalizeText (same substrate module — REUSE, DO NOT FORK).

    2. fragmentContainingOffset (line ~94): keep the same [start_i, start_{i+1}) scan and
       clamping semantics, but compute each page's start offset ONCE and carry it to the next
       iteration as the end bound instead of calling pageStartGlobalOffset twice per page.
       With O(1) starts the function drops from O(pages × blocks) to O(pages).

    3. blockGraphemeLength: leave the exported signature and behavior unchanged (ArticleView's
       sameBlock mode-toggle helper still calls it; with the Task 1 segmenter cache it no
       longer pays the constructor cost). Add a one-line comment that article-offset hot paths
       must use articleGraphemeIndex instead.

    In src/annotations/resolution.ts:

    4. resolveQuoteSelector (line ~242): replace the per-call normalizeText(article) +
       graphemeClusters(text, lang) pair with articleGraphemeIndex(article).clusters — one
       segmentation per article regardless of highlight count on article open (the eager batch
       in ArticleView resolves every stored highlight). resolveQuoteSelectorInText, the
       tri-state contract, and all imports of the exported contract stay untouched.

    5. findAllOccurrences (line ~40): add a first-cluster guard inside the candidate loop —
       when the haystack cluster at position i does not equal the needle's first cluster, skip
       to the next position WITHOUT the slice+join comparison. This removes the ~100k
       array-slice + string-join allocations per highlight; only positions whose first cluster
       matches pay the join. Semantics are identical (unequal first clusters can never produce
       equal joined strings). Do not change the empty-needle / length guards or the return
       type.

    Extend tests/unit/grapheme-index-cache.test.ts with the behavior-block tests (old-loop
    replicas as oracles). Build synthetic PageFragment fixtures by hand (blocks arrays with
    blockIndex/startGrapheme/endGrapheme entries) mirroring tests/unit/pagination conventions.
    Do not modify existing test files. Do NOT touch src/pagination/progress.ts,
    src/reader/PaginatedSurface.tsx, or src/routes/ArticleView.tsx — they compose these
    helpers and get the speedup transitively (paginatedProgressRatio already delegates to
    graphemeLength + pageStartGlobalOffset).
  </action>
  <verify>
    <automated>npx vitest run tests/unit/grapheme-index-cache.test.ts tests/unit/pagination tests/unit/annotations/resolve-quote-selector.test.ts tests/unit/annotations/selector-roundtrip.test.ts</automated>
  </verify>
  <done>Anchor + resolution equivalence tests green; pagination and annotations suites green unchanged; pageStartGlobalOffset contains no per-block accumulation loop; resolveQuoteSelector contains no per-call normalizeText+graphemeClusters pair; findAllOccurrences keeps identical outputs.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Per-element length cache for scroll/restore + full-suite verification</name>
  <files>src/reader/restoreLocation.ts, tests/unit/grapheme-index-cache.test.ts</files>
  <behavior>
    - Test: computeTopVisibleOffset and findScrollTarget return the same offsets as the existing tests assert (tests/unit/restoreLocation.test.ts passes UNCHANGED — it is the oracle), and a second call over the same elements returns identical values (cache-hit path).
    - Test: measuring the SAME element under a DIFFERENT article object (stub whose lang/segments differ) returns the new article's length, not the stale cached one — the identity guard forces recompute (React can reconcile-reuse a DOM node across an article swap, so identity keying alone is insufficient).
    - Test: a code-block element (pre tag / data-kind code-block) still contributes verbatim text length through the cache.
  </behavior>
  <action>
    In src/reader/restoreLocation.ts:

    1. Add a module-level WeakMap(HTMLElement → { article: CanonicalArticle; length: number })
       and a private helper elementGraphemeLength(article, el) that returns the cached length
       when an entry exists AND entry.article is the SAME object as the passed article;
       otherwise computes graphemeClusters(normalizeElText(el), article.lang).length, stores
       it, and returns it.

    2. Use the helper for the per-element length in BOTH findScrollTarget (line ~92) and
       computeTopVisibleOffset (line ~136) — they keep calling normalizeElText's rules and
       graphemeClusters via the helper (still imported from normalizeText — no forked
       normalization), just never twice for the same element+article. After the first pass,
       scroll events (useScrollSave listener + ArticleView anchor-capture listener) do only
       getBoundingClientRect reads and WeakMap lookups.

       INVALIDATION RATIONALE (write as a comment): element textContent is stable for a
       mounted article body, but React reconciliation can REUSE a DOM node across an article
       swap (same tag at the same position) with different textContent — hence the article
       identity guard rather than element-only keying. Re-rendered/replaced elements are new
       objects → fresh entries; stale entries are garbage-collected with their elements. This
       is deliberately minimal — no versioning, no explicit eviction.

    Do not modify normalizeElText, the public signatures, or the walking/clamping logic of
    either function. Do NOT touch src/reader/useScrollSave.ts or src/routes/ArticleView.tsx —
    the duplicated-listener cost is now two cheap walks, which is acceptable; de-duplicating
    listeners is out of scope (not a caching fix).

    3. Extend tests/unit/grapheme-index-cache.test.ts with the behavior-block tests using the
       makeBlock HTMLElement-stub convention from tests/unit/restoreLocation.test.ts.

    4. FULL VERIFICATION GATE: run the complete unit suite, typecheck, and lint; confirm
       package.json is byte-unchanged.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit && npm run lint && git status --porcelain package.json</automated>
  </verify>
  <done>Full unit suite green with zero edits to existing tests; tsc and eslint clean; package.json untouched (empty porcelain output); scroll-path helpers cache per element with article-identity invalidation.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human smoke — lag gone, offsets unchanged</name>
  <files></files>
  <action>Human verifies the performance fix end-to-end in the dev server: continuous scrolling and ~10 page turns on the longest saved article are smooth, and reading positions/highlights behave identically to before (offsets byte-identical by construction — this checkpoint confirms feel and unchanged behavior).</action>
  <what-built>Segmenter instance cache, per-article grapheme index (O(1) page anchors, free graphemeLength, once-per-article highlight resolution), per-element scroll-path length cache, and the findAllOccurrences fast path. All unit/type/lint gates green; offsets proven byte-identical by equivalence tests.</what-built>
  <how-to-verify>
    1. npm run dev
    2. Open the longest saved article in the library (the ~100k+ grapheme marxist.com piece).
    3. SCROLLING MODE: scroll continuously top→bottom. Expected: no perceptible lag or jank; progress hairline tracks smoothly.
    4. Switch to PAGINATED mode (M key or mode toggle). Page forward/back ~10 turns with chevrons/keys. Expected: turns feel instant; progress ratio updates without stutter; the reading position round-trips correctly when toggling back to scrolling (same passage).
    5. If the article has highlights: confirm they render at the same passages as before (dashed-outline ambiguous/orphan states unchanged) and article open is not slow.
    6. Reload the page mid-article — restore lands on the same passage as before this change.
  </how-to-verify>
  <resume-signal>Type "approved" if scrolling and page turns are smooth and positions/highlights are unchanged, or describe the residual lag/offset issue</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | All caches are client-local, in-memory, keyed on immutable domain objects. No new input crosses a trust boundary; no persisted-data or schema surface changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tld-01 | Tampering | articleGraphemeIndex / elementGraphemeLength caches | mitigate | Stale-cache-after-mutation risk is closed by keying: WeakMap on article object identity (D-05 immutability — a mutated/re-parsed article is a new object → fresh index) and an article-identity guard on the element cache (React DOM-node reuse across article swaps recomputes instead of serving stale lengths). |
| T-tld-02 | DoS (self-inflicted) | findAllOccurrences / resolveQuoteSelector on open | mitigate | First-cluster fast path removes ~100k slice+join allocations per highlight; index reuse caps segmentation at once per article. |
| T-tld-SC | Tampering | package installs | accept | No package-manager installs in this task; package.json must remain byte-unchanged (verified in Task 3 gate). |
</threat_model>

<verification>
- npx vitest run — full unit suite green, zero edits to existing test files (D-05 byte-identical offsets proven by the unchanged normalizeText/graphemeOffsets/selectors/restoreLocation/pagination/annotations suites plus the new equivalence tests).
- npx tsc --noEmit && npm run lint — clean.
- rg -c "new Intl.Segmenter" src/content/normalizeText.ts returns exactly 1 (single construction site behind the locale cache).
- git status --porcelain package.json — empty (no dependency changes).
- Human smoke on the longest article: smooth scrolling, instant page turns, unchanged restore/highlight behavior.
</verification>

<success_criteria>
- Scrolling and page-turn hot paths perform ZERO Intl.Segmenter segmentation after the first pass per article/element (code-read: pageStartGlobalOffset has no accumulation loop; computeTopVisibleOffset/findScrollTarget go through elementGraphemeLength; resolveQuoteSelector reads the index).
- Every observable offset (saved locations, highlight positions, progress ratio, mode-switch anchors) is identical to pre-change behavior.
- No new dependencies; no changes to persisted data, schemas, or public function signatures.
</success_criteria>

<output>
Create `.planning/quick/260819-tld-fix-long-article-lag-cache-intl-segmente/260819-tld-SUMMARY.md` when done
</output>
