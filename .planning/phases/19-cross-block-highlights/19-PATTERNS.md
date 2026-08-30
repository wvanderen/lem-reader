# Phase 19: Cross-Block Highlights - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 17 (13 modified, 4 new)
**Analogs found:** 15 / 17 (2 partial — code-block mark rendering, nested-list fixture)

This is a **codebase-archaeology phase** — every surface extends a shipped pattern. The storage layer (`HighlightRecordSchema`, Dexie) needs ZERO change (verified `schema.ts` L378-405: unbounded int range, `exact` `.min(1)` no max). All work is capture composition, renderer threading, and excerpt/export derivation.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/annotations/capture.ts` | service (capture domain logic) | transform (DOM Selection → global grapheme range) | itself — shipped single-block endpoint path L332-399 | exact (in-place extension) |
| `src/content/render/BlockRenderer.tsx` | component (scrolling renderer) | transform (global range → block-local slices) | same file — blockquote per-child threading L392-438 | exact (pattern to mirror for lists) |
| `src/pagination/fragmentRenderer.tsx` | component (paginated renderer twin) | transform (entry-local slicing) | same file — blockquote entry-local threading L154-205 + `sliceList` L423-463 | exact |
| `src/content/render/InlineRenderer.tsx` | component (mark renderer) | render | same file — mark discipline L116-132 | exact (surgical id change) |
| `src/reader/annotations/HighlightOverlay.tsx` | provider (capture+overlap seam) | request-response | same file — `captureCurrentSelection` L182-201 | exact (already global-range) |
| `src/reader/annotations/SelectionToolbar.tsx` | component (refusal hint surface) | event-driven (reason → copy) | same file — hint ternary L242-252 | exact (one branch retires, one added) |
| `src/routes/review/ReviewView.tsx` | component (review route) | CRUD-read | same file — ReviewRow `truncate(excerpt, …)` L153/L169 | exact |
| `src/reader/annotations/AnnotationsDrawer.tsx` | component (drawer) | CRUD-read | same file — excerpt sites L181, L219-221 | exact |
| `src/reader/annotations/NotePopover.tsx` | component (note dialog) | CRUD | same file — excerpt sites L92, L225-228, L262-264 | exact |
| `src/routes/review/DeleteHighlightConfirm.tsx` | component (confirm dialog) | CRUD-delete | itself — receives `excerpt` prop from ReviewView L527 | exact (excerpt consumer; switch to helper) |
| `src/portability/markdown.ts` | utility (Markdown export) | transform | same file — `blockLines` L158-167 + `escapeMarkdownLine` L71-86 | exact |
| NEW `src/annotations/excerpt.ts` (name = planner) | utility (pure excerpt derivation) | transform | `src/annotations/overlap.ts` (small pure module w/ header contract) | role-match |
| `tests/unit/annotations/capture-offset-mapping.test.ts` | test (unit, jsdom) | — | same file — D5-06 rejection case L217-245 (flips to span-success, sanctioned churn) | exact |
| `tests/unit/portability/markdown.test.ts` | test (unit) | — | itself (extend with multi-line cells) | exact |
| NEW `tests/e2e/annotations/span-capture.spec.ts` | test (e2e) | — | `capture-rejects.spec.ts` test 1 page-walk + two-block Range L46-113 | role-match |
| NEW `tests/e2e/annotations/eligibility-matrix.spec.ts` | test (e2e) | — | `capture-rejects.spec.ts` + `_fixtures.ts` harness (`selectRangeInBlock` L157-215) | role-match |
| NEW `src/fixtures/articles/<nested-list>.canonical.json` (contingent — A3) | fixture | — | existing 6 `.canonical.json` + `src/fixtures/index.ts` + FIXTURES array | role-match |
| `src/routes/ArticleView.tsx` | component (route owner) | event-driven | itself — selectionchange wiring L1029-1119, `focusMark` L1589-1593 | exact (VERIFY-ONLY unless id mechanism changes) |

## Pattern Assignments

### `src/annotations/capture.ts` (service, transform)

**Analog:** itself — the shipped single-block path IS the degenerate case of the span (`blockIndex_a === blockIndex_b`).

**The gate this phase retires** (L332-352 — endpoint resolution to keep, gate to remove):
```typescript
// 1. Find the [data-block-index] ancestor of BOTH endpoints.
const startBlock = findBlockAncestor(range.startContainer, readingRoot);
const endBlock = findBlockAncestor(range.endContainer, readingRoot);
if (!startBlock || !endBlock) {
  return { ok: false, reason: "ineligible" };
}
if (startBlock !== endBlock) {                    // ← L338-340: DELETE (D19 span)
  return { ok: false, reason: "multi-block" };
}
const blockIndexAttr = startBlock.getAttribute("data-block-index");
```

**The slice-offset math to apply PER ENDPOINT** (L366-391 — the D5-08 precedent; RESEARCH Pitfall 1 says reuse this exact shape for the figure alt-offset fix):
```typescript
const sliceStartAttr = startBlock.getAttribute("data-block-grapheme-start");
const sliceStart =
  sliceStartAttr !== null && Number.isInteger(Number(sliceStartAttr))
    ? Number(sliceStartAttr)
    : 0;
const fullNormClusters = graphemeClusters(blockNormalizedText(block), article.lang);
const sliceEnd = Math.min(fullNormClusters.length, sliceStart + fullNormClusters.length);
const normClusters =
  sliceStart > 0 ? fullNormClusters.slice(sliceStart, sliceEnd) : fullNormClusters;
const intraRange = domRangeToIntraBlockGraphemeRange(startBlock, range, article.lang, normClusters);
const intraOffsetRange = { start: intraRange.start + sliceStart, end: intraRange.end + sliceStart };
```

**Global composition** (L393-399 — becomes the shared tail for both endpoints):
```typescript
const blockGlobalStart = computeBlockGlobalStart(article, blockIndex);
const position: TextPositionSelector = {
  start: blockGlobalStart + intraOffsetRange.start,
  end: blockGlobalStart + intraOffsetRange.end,
};
return { ok: true, blockIndex, position };
```

**Reason union to extend** (L49-54): keep `"empty" | "ineligible" | "measurement-body"`; retire `"multi-block"`; add `"boundary-ineligible"` (endpoint resolves to ineligible content — unsupported, footnote body) + defensive `"empty-span"` (composed start === end). Grep `blockIndex` consumers first (RESEARCH A2: only `.ok`/`.position` verified consumed).

**Eligibility switch — UNCHANGED, exhaustive, no default** (L254-268, Pattern F):
```typescript
function isEligibleBlock(block: Block): boolean {
  switch (block.kind) {
    case "paragraph":
    case "heading":
    case "blockquote":
    case "bulleted-list":
    case "numbered-list":
    case "figure":
    case "code-block":
    case "footnote-reference":
      return true;
    case "unsupported":
      return false;
  }
}
```

**Anti-patterns (RESEARCH):** do NOT walk intermediate blocks' DOM — endpoint math suffices; interior gaps cross calmly (D19-02) because their text is interior to the global range by construction.

---

### `src/content/render/BlockRenderer.tsx` (component, transform)

**Analog:** same file — blockquote per-child threading L392-438 (the 05-07 precedent the list items-shape mirrors).

**The threading walk to mirror for lists** (L402-437):
```typescript
let childIntraStart = 0;
const perChild: (ReturnType<typeof sliceRunsForHighlights> | undefined)[] = [];
let anyChildSlices = false;
for (const child of block.children) {
  const childLen = blockGraphemeLen(child, article.lang);
  const childGlobalStart = blockGlobalStart + childIntraStart;
  let childSlices: ReturnType<typeof sliceRunsForHighlights> | undefined;
  if (child.kind === "paragraph" || child.kind === "heading") {
    const entries = highlightsForBlock(effectiveHighlights, childGlobalStart, childLen);
    if (entries.length > 0) {
      childSlices = sliceRunsForHighlights(child.content, childGlobalStart, entries, article.lang);
      anyChildSlices = true;
    }
  }
  perChild.push(childSlices);
  childIntraStart += childLen + BLOCK_SEPARATOR.length;
}
if (anyChildSlices) { childHighlightSlices = perChild; }
```

**List-specific coordinate rule** (from `normalizeText.ts` L48-52 — child global starts MUST derive from this join order): items joined by `BLOCK_SEPARATOR`, each item = its content blocks joined by `BLOCK_SEPARATOR`. Sub-lists recurse (D19-15) — a nested `bulleted-list`/`numbered-list` child hits the same walk.

**Prop forwarding shape** (L114-129 — blockquote case; the list case at L131-154 currently renders `<BlockView key={j} block={c} />` with NO slices — add `highlightSlices={childHighlightSlices?.[i]?.[j]}`-shaped threading for the items-shape):
```typescript
case "blockquote":
  return (
    <blockquote {...elementProps}>
      {block.children.map((child, i) => (
        <BlockView key={i} block={child} highlightSlices={childHighlightSlices?.[i]} />
      ))}
    </blockquote>
  );
```

**Figure-caption mark path (if planner lands it):** `figcaption` already renders `<InlineList runs={block.caption} />` at L159-163 — add a slices prop. BUT figure-local coordinates start at `alt.length + BLOCK_SEPARATOR.length` (blockText L53-54 joins `alt + "\n" + caption`); the symmetric offset to Pitfall 1's capture-side slice. The L357-363 comment documents the divergence reason — update it when paid down.

**Performance guard (keep):** `buildBlockHighlightIndex` L224-237 (one linear pass, null when no highlights) and the `highlightsForBlock` intersection filter L248-267 — both consumed unchanged by new threading sites.

---

### `src/pagination/fragmentRenderer.tsx` (component, transform — paginated twin)

**Analog:** same file — entry-local blockquote threading L154-205.

```typescript
} else if (resolved.kind === "blockquote") {
  let childIntraStart = 0;
  const perChild: (ReturnType<typeof sliceRunsForHighlights> | undefined)[] = [];
  let anyChildSlices = false;
  for (const child of resolved.children) {
    const childLen = splittingBlockGraphemeLength(child, lang);
    ...
    const filtered = entrySlices.filter((e) => {
      const intersectStart = Math.max(e.position.start, childIntraStart);
      const intersectEnd = Math.min(e.position.end, childIntraStart + childLen);
      return intersectStart < intersectEnd;
    });
    if (filtered.length > 0) {
      childSlices = sliceRunsForHighlights(child.content, childIntraStart, filtered, lang);
      ...
    }
    perChild.push(childSlices);
    childIntraStart += childLen + BLOCK_SEPARATOR.length;
  }
```

**Key difference from the scrolling twin:** coordinates are ENTRY-LOCAL (intra-entry offset 0 = entry start) via `sliceHighlightsForEntry` L252-291, and child lengths come from `splittingBlockGraphemeLength` (L514-547 — the pagination splitting coordinate system, NOT the D-05 run text). RESEARCH Pitfall 4: pick per call site exactly as this shipped code does.

**List entries:** `sliceList` L423-463 already recursively slices `item.content` via `sliceChildBlocks` — the threading extension consumes its output shape (`resolved.items[i].content[j]`). Note header L32-37: the container slicing path is implemented but engine coverage lands with corpus matrix work.

**Entry attribute emission (keep verbatim)** L220-221:
```typescript
data-block-index={entry.blockIndex}
data-block-grapheme-start={entry.startGrapheme}
```

---

### `src/content/render/InlineRenderer.tsx` (component, render)

**Analog:** itself — the `<mark>` discipline L116-132. The ONLY change: `id` stamps the first slice of a highlight, `data-highlight-id` stays on every slice (RESEARCH Pitfall 2).

**Current per-slice id (L118-131) — the line to change:**
```typescript
return (
  <mark
    key={i}
    id={`hl-${slice.highlightId}`}          // ← L121: first-slice-only (Pitfall 2)
    className={className}
    data-highlight-id={slice.highlightId}   // ← stays on EVERY slice
    tabIndex={0}
    aria-label={highlightAriaLabel(slice)}
    aria-haspopup="dialog"
  >
```

**Consumers of `hl-<id>` (grep-verified this session):** `ArticleView.tsx` L1590 + L1937 (`document.getElementById(`hl-${…}`)?.focus()` — the review-jump + drawer-jump focus targets). Mechanism choice (first-occurrence pass vs slice-start-equals-highlight-start) is planner discretion; the count-===1 spec assertion is mandatory (axe filters to serious/critical and will NOT catch `duplicate-id`).

---

### `src/reader/annotations/HighlightOverlay.tsx` (provider, request-response)

**Analog:** itself — the overlap seam L182-201 is ALREADY global-range (D19-07 = caller discipline only, zero math change):

```typescript
const captureCurrentSelection = useCallback(
  (readingRoot: HTMLElement): ToolbarCaptureResult => {
    const capture = captureSelection(article, readingRoot);
    if (!capture.ok) return capture;
    // D5-13 disjoint-range check: reject overlap with ANY existing highlight.
    const overlapsExisting = highlightsRef.current.some((h) => {
      const pos = h.resolvedPosition;
      if (!pos) return false; // ambiguous/orphan — no confident range
      return rangesOverlap(capture.position, pos);
    });
    if (overlapsExisting) { return { ok: false, reason: "overlap" }; }
    return capture;
  },
  [article],
);
```

**Reason unions to keep in sync** (L64-87): `ToolbarCaptureResult` keeps `"overlap"`; `CreateFromSelectionResult.reason` (L81-87) currently lists `"multi-block"` — retire it and add the new capture reasons so the unions stay aligned with `CaptureResult`.

---

### `src/reader/annotations/SelectionToolbar.tsx` (component, event-driven)

**Analog:** itself — the hint chain L242-252. D19-06: new boundary reason slots into this exact ternary; D19-09: buttons side unchanged.

```typescript
<p className="selection-toolbar-hint">
  {captureResult.reason === "multi-block"        // ← RETIRE this branch + copy
    ? "Select within a single block to highlight it."
    : captureResult.reason === "overlap"
      ? "This overlaps an existing highlight."
      : captureResult.reason === "empty"
        ? "Select text to highlight it."
        : "Select readable text to highlight it."}
</p>
```

New `"boundary-ineligible"` branch copy (planner wordsmiths; research placeholder: "This selection includes content that can't be highlighted.").

---

### `src/routes/review/ReviewView.tsx` (component, CRUD-read)

**Analog:** itself — ReviewRow excerpt L153 + L169:
```typescript
const excerpt = entry.highlight.quote.exact;                 // L153 — becomes firstFragmentExcerpt(excerpt, …)
<span className="review-quote">{truncate(excerpt, EXCERPT_MAX_CHARS)}</span>  // L169
```

Constants discipline (L84-91) — the shared helper should match this shape:
```typescript
const EXCERPT_MAX_CHARS = 120;
const NOTE_MAX_CHARS = 200;
const ARIA_MAX_CHARS = 60;
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}
```

Jump hash (L238, keep — lands at span start via `position.start`, verified ArticleView L1571):
```typescript
window.location.hash = `#/article/${entry.highlight.articleId}/h/${entry.highlight.id}`;
```

`DeleteHighlightConfirm` excerpt prop (L527): `excerpt={removeTarget?.highlight.quote.exact ?? ""}` — switch to helper.

---

### `src/reader/annotations/AnnotationsDrawer.tsx` + `NotePopover.tsx` (components, CRUD-read)

**Analog sites to switch to the shared helper** (identical `truncate` pattern in all three files):

- Drawer: `const excerpt = h.record.quote.exact;` (L181) → visible L219-221, aria L202-204 (60-cap)
- Popover: `const excerpt = resolved?.record.quote.exact ?? "";` (L92) → visible L225-228 + accessible-description L262-264

Per RESEARCH OQ2 recommendation: one shared helper adopted everywhere an excerpt renders; aria truncations stay length-capped as today.

---

### `src/portability/markdown.ts` (utility, transform)

**Analog:** itself — `blockLines` L158-167 (the D19-12 multi-line change site) + `escapeMarkdownLine` L71-86.

```typescript
function blockLines(article: CanonicalArticle | null, e: HighlightEntry): string[] {
  const lines = [`> ${markerFor(e.status)}${escapeMarkdownLine(e.highlight.quote.exact)}`];  // ← L159: single-line today
  if (article !== null) { lines.push(citationLine(article)); }
  if (e.note) { lines.push(`> Note: ${escapeMarkdownLine(e.note.text)}`); }
  return lines;
}
```

**Multi-line shape (RESEARCH Code Examples — escape PER LINE, security-relevant per V5):**
```typescript
const quoteLines = e.highlight.quote.exact.split("\n");
const lines = quoteLines.map((ln, i) =>
  `> ${i === 0 ? markerFor(e.status) : ""}${escapeMarkdownLine(ln)}`,
);
```
`escapeMarkdownLine` (L71-86) is applied per line so a block beginning `#` / `-` / `1974.` cannot forge structure — this phase's one genuine security-adjacent change.

---

### NEW `src/annotations/excerpt.ts` (utility, transform)

**Analog:** `src/annotations/overlap.ts` — the project's small-pure-module pattern: header comment citing the decision, pure function, jsdom-safe, no DOM/React/side effects.

```typescript
// src/annotations/overlap.ts — the shape to copy (28 lines total)
export function rangesOverlap(
  a: TextPositionSelector,
  b: TextPositionSelector,
): boolean {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}
```

Function shape (RESEARCH Code Examples):
```typescript
function firstFragmentExcerpt(exact: string, maxChars: number): string {
  const firstLine = exact.split("\n")[0] ?? "";
  return firstLine.length < exact.length
    ? truncate(firstLine, maxChars) + "…"
    : truncate(firstLine, maxChars);
}
```

---

### `tests/unit/annotations/capture-offset-mapping.test.ts` (test, unit — honest churn)

**Analog:** itself — the D5-06 case L217-245 flips to span-success (sanctioned churn #2):

```typescript
// Select from b0's text node into b1's text node.
const range = document.createRange();
range.setStart(b0.firstChild!, 2);
range.setEnd(b1.firstChild!, 5);
...
expect(result.reason).toBe("multi-block");   // ← becomes ok:true + offset assertions
```

Keep the file conventions: `parseArticle` helper, `baseArticle` fixture object, `makeParagraphBlock`, `selectFirstTextNode`, `beforeEach` selection/body reset (L25-74). Add cells: backwards Range, slice-start endpoints (`data-block-grapheme-start` on both endpoint blocks), figure caption alt-offset alignment (Pitfall 1), nested list recursion.

---

### NEW `tests/e2e/annotations/span-capture.spec.ts` + `eligibility-matrix.spec.ts` (test, e2e)

**Analog:** `capture-rejects.spec.ts` test 1's page-walk + two-block Range (L46-113) — reuse this setup as the SUCCESS cell (moves here from the refusal file, sanctioned churn #1):

```typescript
const range = document.createRange();
range.setStart(aNode, 0);
range.setEnd(bNode, Math.min(4, bNode.nodeValue!.length));
const sel = window.getSelection();
sel.removeAllRanges();
sel.addRange(range);
```

**Harness to import (NOT fork)** from `tests/e2e/annotations/_fixtures.ts`: `FIXTURES`, `wipeDatabase` (L44-57), `openArticle` (L70-105), `selectRangeInBlock` (L157-215 — text-node-walking cross-node Range), `findFirstBlockWithText` (L255-260), `findDisjointBlockWalkingPages` (L558-591), `turnToPage`/`totalPages`/`currentPageIdx` (L500-547), `assertHighlightMark` (L326-350), `seedHighlightRecord` (L387-421), `countHighlightsInDexie` (L462-483).

**Header discipline (copy from capture-rejects.spec.ts L14-15):** "No test.skip / test.fixme — a red suite must stay red." Plus the 3-engine expectation (chromium/firefox/webkit run every spec via playwright.config.ts projects).

**Mandatory new assertion (Pitfall 2 — axe will not catch it):**
```typescript
await expect(page.locator(`[id="hl-${id}"]`)).toHaveCount(1);  // one id per span
await expect(page.locator(`mark.highlight[data-highlight-id="${id}"]`).first()).toBeVisible();  // N marks
```

**Keep green (Pitfall 7 — unchanged):** capture-rejects.spec.ts test 3 (cross-page into measurement body still refuses — ANNO-13 is Future) + the overlap test.

---

### NEW nested-list fixture (contingent — RESEARCH A3)

**Analog:** the 6 existing `.canonical.json` files + registration chain. Adding a fixture (strengthen-only) touches THREE places (verified):
1. New `src/fixtures/articles/<id>.canonical.json` (schema-validated at load)
2. `src/fixtures/index.ts` — static import + `fixtures` array
3. `tests/e2e/pagination/fixtures-matrix.ts` L37-44 — `FIXTURES` array ("Adding a fixture requires updating this array AND the e2e open-every-fixture spec")

Alternative per RESEARCH Wave 0: a unit-only nested-list cell (no fixture churn). Planner picks.

---

### `src/routes/ArticleView.tsx` (component, event-driven — VERIFY-ONLY unless id mechanism changes)

**Analog sites (no modification expected):**
- selectionchange wiring L1029-1119 (rAF-coalesced; measurement-body defense at L1083-1097; `setCaptureResult(api.captureCurrentSelection(articleNode))` at L1108 — reason union flows through untouched)
- H/N saved-range restore L778-838 (re-validates via ONE creation path — spans re-validate identically)
- Deep-link jump L1571-1593 (`const offset = position.start` → page turn / scroll → `focusMark` via `getElementById(`hl-${…}`)`) — lands at span start by construction; only the duplicate-id fix (InlineRenderer) affects it

---

## Shared Patterns

### Global range intersection (end-exclusive, touching OK)

Four byte-identical implementations — the span consumes ALL unchanged:
```typescript
const interStart = Math.max(0, h.position.start - blockGlobalStart);
const interEnd = Math.min(blockLen, h.position.end - blockGlobalStart);
if (interStart < interEnd) { /* intersects */ }
```
**Sources:** `highlightRanges.ts` L97-109 (`sliceRunsForHighlights`), `BlockRenderer.tsx` L253-266 (`highlightsForBlock`), `fragmentRenderer.tsx` L270-290 (`sliceHighlightsForEntry`), `overlap.ts` L23-28 (`rangesOverlap`).
**Apply to:** every new threading site (list items, captions). A spanning range "just works" wherever each block queries it.

### Per-child threading walk (BLOCK_SEPARATOR accumulation)

`childIntraStart += childLen + BLOCK_SEPARATOR.length` loop — shipped twice (BlockRenderer L402-432 scrolling-global coords; fragmentRenderer L166-201 entry-local coords). New list threading mirrors the one its consumer's coordinate system lives in (Pitfall 4: D-05 substrate vs renderer run-sum vs splitting text — never mix within one call).

### Reason union → calm toolbar copy

`CaptureResult.reason` (capture.ts L49-54) → `CreateFromSelectionResult.reason` (HighlightOverlay L81-87) → `ToolbarCaptureResult` (L64-66, adds `"overlap"`) → SelectionToolbar ternary (L242-252). Retire `"multi-block"` in ALL THREE unions + the copy in one coordinated change; add `"boundary-ineligible"` the same way.

### Exhaustive switch, no default (Pattern F)

`isEligibleBlock` (capture.ts L254-268), `blockText` (normalizeText.ts L41-63), `BlockView` (BlockRenderer.tsx L99-198). Any new per-kind branch (e.g. caption eligibility nuance) extends the switch — TS flags missing cases at compile time.

### Honest test discipline

- jsdom unit tests for offset logic ONLY ("jsdom is NOT authoritative for layout" — capture-offset-mapping.test.ts L16-18); Playwright for real selection/layout truth.
- `test.beforeEach` → `wipeDatabase` (deterministic Dexie state); image-stub route to prevent figure races.
- Strengthen-only edits EXCEPT the three sanctioned churn surfaces (RESEARCH Pitfall 7): capture-rejects.spec.ts test 1, capture-offset-mapping.test.ts D5-06 case, SelectionToolbar L244-245 copy.
- Full-suite gate: `npm run test` exit 0, all 3 engines, no skips.

### React-text-children-only (security)

Every excerpt/note/title renders as a React text child (ReviewView L141-142 comment, BlockRenderer L9-12, markdown escaping on export). No `dangerouslySetInnerHTML` anywhere (ESLint `react/no-danger`).

## No Analog Found

| File/Shape | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Code-block mark rendering (`<pre><code>` slicer) | component | transform | NO existing mark path for verbatim source — InlineList serves run arrays only. RESEARCH OQ1 flags as the one judgment call: either a source→run-segment adaptation or honest D19-02 gap fallback. Planner decides; document per-kind render coverage in the matrix either way. |
| Nested-list fixture | fixture | — | No fixture carries a nested list (verified census); only the registration-chain pattern exists (see assignment above). Unit-only cell is the zero-churn alternative. |

Everything else has an exact in-file or same-package analog — this phase is composition of shipped primitives, and the risk is coordinate divergence + surface regressions (duplicate ids, multi-line export), not missing machinery.

## Metadata

**Analog search scope:** `src/annotations/`, `src/content/render/`, `src/pagination/`, `src/reader/annotations/`, `src/routes/review/`, `src/routes/ArticleView.tsx`, `src/portability/markdown.ts`, `src/content/normalizeText.ts`, `src/content/schema.ts`, `src/persistence/highlightsStore.ts`, `src/fixtures/`, `tests/unit/annotations/`, `tests/unit/portability/`, `tests/e2e/annotations/`, `tests/e2e/pagination/fixtures-matrix.ts`
**Files scanned:** 26 source + 17 test files (14 read in full; ArticleView.tsx via 3 targeted ranges)
**Pattern extraction date:** 2026-08-30
**Line-number validity:** verified against working tree this session; re-verify if Phase 18 gap-closure commits land first (per RESEARCH metadata)
