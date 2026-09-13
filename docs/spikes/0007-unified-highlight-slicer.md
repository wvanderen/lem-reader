# Spike 0007: One highlight slicer for scrolling and paginated renderers

**Issue:** [wvanderen/lem-reader#7](https://github.com/wvanderen/lem-reader/issues/7)
**Status:** Complete — **GO, with one explicit parameter (child measure) and one reconciliation decision**
**Scope guard honored:** zero production changes. Everything lives under `tests/unit/spike/` (`git status` shows only that directory).

---

## 1. The question

The scrolling renderer and the paginated fragment renderer each carry a structurally parallel block-tree highlight walk ("the paginated twin"), and the `[start, end)` intersection clamp is hand-rolled seven times (the issue said five; the audit found seven). Can **one recursive slicer with an explicit coordinate origin** serve both renderers **byte-identically**?

### The twins today

| | Scrolling twin | Paginated twin |
|---|---|---|
| Walk | `ArticleBody` block map, `src/content/render/BlockRenderer.tsx:662-850` | `PageFragmentView` entry map, `src/pagination/fragmentRenderer.tsx:126-369` |
| List recursion | `computeListItemSlices`, BlockRenderer.tsx:530-587 | `computeEntryListItemSlices`, fragmentRenderer.tsx:489-555 |
| Root translation | `highlightsForBlock` (BlockRenderer.tsx:459-478, positions stay article-global) | `sliceHighlightsForEntry` (fragmentRenderer.tsx:395-434, positions rewritten entry-local) |
| Child measure | **D-05**: `blockGraphemeLen` = graphemes of `blockNormalizedText` (BlockRenderer.tsx:485-487) | **Splitting**: `splittingBlockGraphemeLength` = raw run-concatenation (fragmentRenderer.tsx:843-876) |

### The seven hand-rolled clamps

1. `src/annotations/highlightRanges.ts:121-123` — inside `sliceRunsForHighlights`
2. `src/annotations/highlightRanges.ts:258-260` — inside `sliceCodeForHighlights`
3. `src/content/render/BlockRenderer.tsx:466-468` — `highlightsForBlock`
4. `src/pagination/fragmentRenderer.tsx:415-417` — `sliceHighlightsForEntry`
5. `src/pagination/fragmentRenderer.tsx:221-229` — blockquote child filter
6. `src/pagination/fragmentRenderer.tsx:286-294` — figure caption filter
7. `src/pagination/fragmentRenderer.tsx:508-513` — list leaf filter

(Sibling: `rangesOverlap` in `src/annotations/overlap.ts:23-28` is the same arithmetic, different purpose. All seven collapse to one named primitive — see §2.)

---

## 2. Proposed design

### 2.1 The key realization: the origin is a single integer

Both renderers can express their input identically: *"render these highlights (in my coordinate system) intersecting this block's visible window, which starts at `origin` and is `visibleLen` long."*

- **Scrolling origin (article-global):** `origin = blockGlobalStart` (D-05 prefix sum), `visibleLen` = the block's D-05 length, highlights in article-global coordinates.
- **Paginated origin (entry-local):** `origin = 0`, `visibleLen = endGrapheme - startGrapheme`, highlights already translated entry-local (the caller keeps `sliceHighlightsForEntry`, or re-derives it with the same primitive).

The recursion itself is **origin-free**: after one root clip against `[origin, origin + visibleLen)`, every node walks node-local offsets only. "Article-global vs entry-local" is not two code paths — it is the value of one parameter at the root.

### 2.2 Interface (as implemented in the spike)

```ts
// tests/unit/spike/unifiedHighlightSlicer.ts
export function sliceBlockHighlights(input: {
  block: Block;                       // whole block (scrolling) or resolved entry slice (paginated)
  origin: number;                     // THE explicit coordinate origin (§2.1)
  visibleLen: number;
  highlights: readonly HighlightSliceEntry[];  // in the coordinate implied by origin
  measureChild: MeasureChild;         // explicit child-length policy (§4, Finding F2)
  lang: string;
}): UnifiedBlockSlices | null;

// The one intersection primitive — replaces all seven hand-rolled clamps
export function clipRange(range, windowStart, windowEnd): Range | null;  // null when empty (end-exclusive)

export type UnifiedBlockSlices =
  | { kind: "inline";   slices: HighlightSlice[] }                       // paragraph / heading
  | { kind: "children"; perChild: (HighlightSlice[] | undefined)[] }     // blockquote
  | { kind: "items";    slices: ListItemSlices }                         // bulleted / numbered list (nested recursion inside)
  | { kind: "caption";  slices: HighlightSlice[] }                       // figure caption (symmetric alt+separator offset)
  | { kind: "code";     segments: CodeSegment[] };                       // code-block verbatim source
// null → thread nothing (byte-unchanged rendering, the legacy anyChildSlices discipline)
```

`blockViewSlices(result)` maps the union onto the five existing `BlockView` props 1:1, so the shared `BlockView`/`InlineList` rendering path is reused untouched. Leaf slicing reuses the **production** `sliceRunsForHighlights` / `sliceCodeForHighlights` unchanged — the spike unifies the *walk*, not the leaf slicers (which are already shared).

### 2.3 What collapses

| Before | After |
|---|---|
| Two ~250-line parallel walks (clamp sites 3-7) | One ~170-line recursive walk (spike, no comments) |
| 7 hand-rolled clamp expressions | 1 primitive (`clipRange`), used at the root filter and per-child filter |
| 5 loosely-typed optional `BlockView` props threaded by hand per kind | 1 discriminated result union → props via one mapper |
| Per-kind branch order duplicated in both renderers | Per-kind branch order exists once, inside the recursion |

---

## 3. Evidence

`tests/unit/spike/differentialRender.test.tsx` renders **production components** and **spike components driven by the unified slicer** with `react-dom/server` and asserts `renderToStaticMarkup` strings are **byte-identical**:

- **169 differential tests, all passing — 167 of them byte-identity comparisons** (the other two: one sanity probe that marks are actually rendered, one deliberate assertion that the two *production* twins disagree with each other, §3 F2):
  - Scrolling: `ArticleBody` vs `SpikeArticleBody` across 15 highlight scenarios (cross-block spans, link-run middles, quote-child boundaries, nested-list spans, code interiors, caption with/without alt, block-boundary-exact ends, all-highlights union, none).
  - Paginated: `PageFragmentView` vs `SpikePageFragmentView` across **10 fragment geometries × 15 highlight scenarios** — whole-block multi-entry pages, paragraph splits, splits inside blockquote children, a split landing on an *atomic* blockquote child, list splits inside nested lists, atomic code+figure pages.
  - Divergent content: the unified slicer with the D-05 measure reproduces `ArticleBody` byte-for-byte, and with the splitting measure reproduces `PageFragmentView` byte-for-byte — on an article where the two production renderers **disagree with each other** (see below).
  - Scope note: the spike shells reimplement only slice *computation* and render through the shared production `BlockView` — the differentials prove slice-prop equivalence (which is what the slicer refactor would change), not full-component equivalence (memo/context plumbing is untouched by the proposal).
- **Hard kinds, specifically proven (§ acceptance criteria):**
  - *Nested lists*: split and whole entries; unified items-shape deep-equals production `_test_computeEntryListItemSlices`, including the empty-item separator rule.
  - *Code blocks*: segments concatenate to the exact verbatim source; multi-highlight segmentation byte-identical; `isFirst` on segments.
  - *Figure captions*: symmetric alt+`BLOCK_SEPARATOR` offset proven with alt present **and** empty; cross-block caption highlights.
  - *Blockquote walks*: per-child windows, splits inside children, atomic-child entries.
  - *First-occurrence id claims*: every rendered paginated page (all fragments × all 13 highlights) carries **exactly one `id="hl-…"` attribute per highlight id**; article-global `isFirst` semantics (claiming block true, continuation blocks false) preserved for scrolling.

15 additional data-level probes in `tests/unit/spike/unifiedHighlightSlicer.test.ts` pin the interface, `clipRange` end-exclusivity, `isFirst` flag arithmetic, caption/code slice contents, and D19-02 non-readable kinds (footnote-reference, unsupported → `null`).

### The one case where the twins disagree today (Finding F2, demonstrated)

Article: paragraph `"Intro"`, blockquote `[p("See","docs"), p("Tail")]` (multi-run first child), highlight at the D-05 range covering `"Ta"`:

- Scrolling (D-05 child measure) marks **`Ta`** — correct per the stored D-05 selector.
- Paginated (splitting child measure) marks **`ai`** — off by the one-grapheme D-05/splitting drift accumulated across the first child.

Both render a `<mark data-highlight-id="hl-div">`; the text inside differs. This is a **live coordinate-consistency bug in the shipped twins**, not a spike artifact: `blockNormalizedText` joins runs with `" "` (and collapses whitespace) while the pagination/splitting coordinate concatenates run texts raw. Any multi-run leaf whose run join isn't whitespace-neutral (e.g. `"See"` + `"docs"` → D-05 `"See docs"` = 8 graphemes vs splitting `"Seedocs"` = 7) drifts the two coordinate systems.

---

## 4. Findings

- **F1 — Structural unification: proven.** One recursive walk with a root `origin` + `visibleLen` serves both renderers byte-identically across 167 markup comparisons including every hard kind. The recursion is origin-free; the origin is one root parameter.
- **F2 — Coordinate unification: blocked on a decision, not on structure.** The twins measure children in different coordinate systems (D-05 vs splitting). One slicer can serve both only with `measureChild` as an explicit parameter — which the spike does — but a follow-up ticket must either (a) keep the parameter and accept both coordinate systems, or (b) **reconcile the coordinates first** (recommended: make the splitting coordinate whitespace-neutral to match D-05, or fix the D-05 run-join; see Risks).
- **F3 — First-occurrence stays renderer-owned.** Document-firstness (`hlStart >= blockGlobalStart`) is derivable in article-global origin; per-mounted-page firstness is *not derivable inside any single-entry slicer* — the per-page claim pass (`fragmentRenderer.tsx:571-627`) must remain a renderer-level pass. The spike reuses it unchanged and proves exactly-once ids on unified output.
- **F4 — Root prefilter nuance.** The unified root filter clips against the D-05 window; the legacy scrolling figure branch filtered directly against the caption's run-sum window. Identical on all clean fixtures; a pathological caption whose run-sum exceeds its normalized length could theoretically differ. The follow-up should keep the caption branch's own window (as the spike does) and note the prefilter is an optimization, not a semantic.
- **F5 — The result union is an API improvement.** `UnifiedBlockSlices` + `blockViewSlices()` replaces five independently-optional, structurally-uncoupled `BlockView` props with one typed value — removing the "which walk forgot to thread which prop" failure mode.

---

## 5. Go/no-go

**GO** for a follow-up implementation ticket, conditioned on:

1. Resolve F2 explicitly **before** the refactor: pick one child-measure policy (recommend reconciling the splitting coordinate to be D-05-consistent, then deleting the measure parameter) or ship with `measureChild` explicit and file the reconciliation separately.
2. Port the slicer into `src/annotations/` (it belongs beside `highlightRanges.ts`), keep `sliceRunsForHighlights`/`sliceCodeForHighlights` untouched as leaf slicers, and re-run this spike's differential suite against the refactored renderers as the acceptance gate (the spike files are written to be promoted into regression tests nearly verbatim).
3. Keep the per-page first-occurrence claim pass renderer-owned (F3).

### Risk list

| Risk | Severity | Mitigation |
|---|---|---|
| D-05 vs splitting drift (F2) silently misaligns marks for multi-run leaves **today** | High — pre-existing bug on both sides | Fix coordinates first (single join rule); add the spike's divergent fixture as a regression test |
| Perf: scrolling path currently re-derives block starts via `buildBlockHighlightIndex` (O(n) once); slicer must not reintroduce per-block O(n) accumulation | Medium | Slicer takes `origin` as input; index construction stays with the caller (`articleGraphemeIndex` prefix sums) |
| Scroll-burst re-render cost: unified walk must not segment more than the twins did | Medium | Leaf segmentation is unchanged (same production leaf slicers); child windows reuse the callers' measure functions |
| Legacy callers depend on exact `BlockView` prop threading (memo comparator, context subscription) | Low | Renderer shells stay untouched; only slice *computation* moves behind `blockViewSlices()` |
| Engine emits entries for atomic kinds with sub-ranges (defensive whole-render path) | Low | Slicer's figure/code branches don't depend on whole-ness; differential included atomic pages |

---

## 6. Artifacts & reproduction

| File | Role |
|---|---|
| `tests/unit/spike/unifiedHighlightSlicer.ts` | The proposed slicer (promotable) |
| `tests/unit/spike/legacyFreeze.tsx` | Spike harness: frozen copies of the paginated renderer's private `resolveBlockSlice` chain + the two spike renderer shells |
| `tests/unit/spike/fixtures.ts` | Hard-kinds fixture article, 13 disjoint highlight scenarios, fragment builders |
| `tests/unit/spike/differentialRender.test.tsx` | Byte-identity differentials (169) + twins-divergence demonstration |
| `tests/unit/spike/unifiedHighlightSlicer.test.ts` | Interface/semantics probes (15) |

```sh
npx vitest run tests/unit/spike --project unit   # 184 passed
npx tsc --noEmit && npx eslint tests/unit/spike  # clean
git status --short                               # only tests/unit/spike/ + this report
```
