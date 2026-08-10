# Architecture Research

**Domain:** Accessible, booklike web-article reading engine
**Researched:** 2026-07-26
**Confidence:** HIGH for platform boundaries and data-flow direction; MEDIUM for the exact pagination algorithm until benchmarked against the representative corpus

## Standard Architecture

### System Overview

The engine should be a client-side modular monolith with one canonical, immutable document model and two replaceable projections: semantic scrolling and computed pagination. Pages are not content records. They are cache entries derived from the document, settled font metrics, viewport geometry, and reader settings.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Input + canonical domain                                            │
│ saved fixture → validate/migrate → NormalizedDocument + text index  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ immutable document revision
              ┌─────────────────┴──────────────────┐
              ▼                                    ▼
┌───────────────────────────────┐     ┌───────────────────────────────┐
│ Semantic projection           │     │ Layout pipeline               │
│ document → semantic HTML      │     │ constraints + fonts + assets │
│ scrolling mode; a11y baseline │     │ → measure → paginate → map   │
└───────────────┬───────────────┘     └───────────────┬───────────────┘
                │                                     │ derived only
                │                   ┌─────────────────▼───────────────┐
                │                   │ Paginated semantic projection  │
                │                   │ page map → semantic HTML slices│
                │                   └─────────────────┬───────────────┘
                └──────────────────────┬──────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Reader shell: mode/settings/navigation/focus/status/commands        │
└──────────────┬───────────────────────────────────┬──────────────────┘
               │                                   │
               ▼                                   ▼
┌─────────────────────────────┐       ┌───────────────────────────────┐
│ Stable-location service     │       │ Annotation service            │
│ text/block locator ↔ view   │       │ selection ↔ selectors ↔ marks│
└──────────────┬──────────────┘       └──────────────┬────────────────┘
               └──────────────────┬──────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Repository boundary: IndexedDB documents, preferences, progress,   │
│ annotations; schema versions and migrations                         │
└─────────────────────────────────────────────────────────────────────┘
```

Direction is intentionally one-way: canonical content and settings produce layout constraints; constraints produce measurements; measurements produce a page map; renderers consume the canonical content plus the page map. Neither renderer writes back page boundaries, DOM paths, or page numbers as domain truth.

### Canonical Document Schema

Use a discriminated block tree with stable IDs, inline marks, and a separately generated normalized-text index. Preserve semantics in the model rather than importing saved HTML into the reader DOM.

```typescript
type Inline =
  | { type: "text"; text: string; marks?: InlineMark[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "footnoteRef"; targetId: string; label: string };

type Block =
  | { id: string; type: "heading"; level: 1|2|3|4|5|6; children: Inline[] }
  | { id: string; type: "paragraph"|"blockquote"; children: Inline[] }
  | { id: string; type: "list"; ordered: boolean; items: ListItem[] }
  | { id: string; type: "figure"; assetId: string; alt: string; caption?: Inline[] }
  | { id: string; type: "code"; language?: string; text: string }
  | { id: string; type: "footnotes"; items: Footnote[] };

interface NormalizedDocument {
  schemaVersion: number;
  id: string;
  revision: string;       // content hash or fixture revision
  title: string;
  metadata: ArticleMetadata;
  blocks: Block[];
  assets: Record<string, AssetMetadata>;
}

interface TextIndexEntry {
  blockId: string;
  blockStart: number;     // offsets in one documented normalization space
  blockEnd: number;
}
```

Define normalization once and fixture-test it: Unicode normalization choice, line-break representation, whitespace collapsing, replacement text for non-text nodes, and whether offsets count UTF-16 code units or Unicode scalar values. JavaScript DOM ranges use node offsets, while persistent selectors need a stable document-wide convention; conversion belongs in the text-index adapter.

### Component Responsibilities

| Component | Owns | Must not own |
|---|---|---|
| Fixture loader/validator | JSON parsing, schema validation, migrations, immutable document revisions | DOM creation or pagination |
| Text index | Canonical flattened text, block spans, offset/node conversions | Page numbers |
| Asset registry | Image intrinsic dimensions, load/error state, reserved aspect ratios | Article semantics |
| Font coordinator | Explicit font requests, `document.fonts.ready`, load/error events, metric fingerprint, timeout/fallback policy | Page breaking |
| Constraint builder | Viewport content box, page chrome, typography and spacing settings, mode | DOM mutation |
| Text measurer | Deterministic line opportunities and line metrics for text runs; optional Pretext adapter | Parsing, rendering, annotations |
| Non-text measurer | Images, captions, lists, code blocks, keep rules, oversize classification | Persistence |
| Paginator | Pure page-break calculation from blocks/measurements/constraints | Reading position, focus, DOM |
| Page-map cache | Generation-keyed derived layouts and diagnostics | Canonical content |
| Semantic renderer | Model-to-native-HTML mapping and safe links/assets | Measuring its own visible output as the primary algorithm |
| View adapter | Scroll locator and page locator translation; mode switching | Persistent selector definition |
| Location service | Stable source locator, restore/capture policy, nearest valid fallback | Storing viewport pixels or page index as truth |
| Annotation service | Selection capture, selector resolution, overlap model, note attachment | DOM-path persistence |
| Reader shell | Commands, settings, live status, focus and mode orchestration | Content normalization or page calculation |
| Repository | IndexedDB transactions, object stores, migrations, write coalescing | UI state or layout logic |

## Recommended Project Structure

```text
src/
├── domain/
│   ├── document.ts            # block/inline schema and invariants
│   ├── selectors.ts           # source locators and annotation selectors
│   └── normalization.ts       # canonical text rules and index
├── fixtures/
│   ├── loader.ts
│   └── schema.ts
├── layout/
│   ├── constraints.ts
│   ├── fonts.ts
│   ├── assets.ts
│   ├── measure/
│   │   ├── text.ts            # interface; Pretext adapter behind it
│   │   └── blocks.ts
│   ├── paginate.ts            # pure page-break core
│   ├── page-map.ts
│   └── coordinator.ts         # invalidation, cancellation, generations
├── rendering/
│   ├── semantic-blocks.ts
│   ├── scrolling-view.ts
│   ├── paginated-view.ts
│   └── annotation-overlay.ts
├── reader/
│   ├── commands.ts
│   ├── location.ts
│   ├── mode.ts
│   └── accessibility.ts
├── annotations/
│   ├── capture.ts
│   ├── resolve.ts
│   └── model.ts
├── persistence/
│   ├── database.ts
│   ├── repositories.ts
│   └── migrations.ts
└── tests/
    ├── fixtures/
    ├── layout/
    ├── integration/
    └── e2e/
```

This organization keeps the risky, replaceable pagination implementation behind stable domain contracts. It also makes the scrolling renderer a functional baseline rather than an emergency branch buried inside pagination.

## Architectural Patterns

### Pattern 1: Canonical Source Coordinates, Disposable Layout Coordinates

Every durable location uses source coordinates. A useful locator is `{documentId, revision, blockId, textOffset, affinity, quoteContext}`. Page maps expose ranges in the same coordinate space, so a binary search maps a locator to a page after every repagination. Persist page index only as a non-authoritative hint.

For annotations, store both a position selector and a quote selector (`exact`, `prefix`, `suffix`). The W3C Web Annotation model explicitly describes text-position selectors as brittle under edits and recommends extra state; quote context supplies recovery and ambiguity detection. Resolution order should be: exact offsets on matching revision → exact quote near prior offsets → context-scored quote match → orphaned state requiring user repair. Never silently attach to a low-confidence match.

### Pattern 2: Generation-Stamped Layout Jobs

Treat pagination like compilation. The input key includes document revision, content-box width/height, typography token set, spacing, writing direction, font metric fingerprint, and relevant asset dimensions.

```typescript
async function repaginate(input: LayoutInput) {
  const generation = ++currentGeneration;
  const settled = await fonts.prepare(input.fontRequest, input.sampleText);
  const measurements = await measure(input, settled.metricFingerprint);
  const next = paginate(measurements, input.constraints);
  if (generation !== currentGeneration) return; // stale result
  pageMapStore.replace(next);                   // one atomic visible swap
}
```

Use `ResizeObserver` only to capture the reader content-box size. Debounce/coalesce into a later layout job and do not synchronously mutate the observed geometry in the callback: the specification describes repeated layout/notification loops and a loop error when notifications remain undelivered. Keep the prior valid page map visible with a calm “reflowing” status; if the job fails or exceeds its budget, switch to semantic scrolling at the same source locator.

### Pattern 3: Font State Is Part of the Layout Key

Request the actual family/style/weight and representative text, await font readiness before authoritative measurement, and listen for subsequent `loadingdone`/`loadingerror` invalidation. The CSS Font Loading specification says `ready` resolves after relevant font loading and layout settle, but a fulfilled ready promise does not prevent later font loads. Therefore:

1. Initial scrolling HTML may render immediately with reserved geometry.
2. Paginated output becomes authoritative only after the required font request settles.
3. Record a metric fingerprint, not just a font-family string.
4. On late load, error, setting change, or fallback change, issue a new layout generation.
5. On timeout/error, use a declared fallback stack, remeasure, expose diagnostics, and retain scrolling access.

Canvas metrics and visible DOM must share the same resolved font properties, letter spacing, word spacing, direction, and text normalization. Add calibration fixtures comparing predicted line breaks with browser-rendered reference blocks; Pretext remains behind the measurer interface until it passes them.

### Pattern 4: Semantic Projection First

Render native elements (`article`, headings, paragraphs, anchors, lists, `blockquote`, `figure`/`figcaption`, `pre`/`code`, footnote links) from the model. Pagination changes containment and visibility, not semantic content order. Do not render each line as a positioned span or canvas glyph. That would couple accessibility, selection, links, zoom, and annotations to the layout engine.

Prefer one active article projection in the accessibility tree. When paginated mode mounts only the current page (plus controlled neighbors), provide ordinary buttons for previous/next, an explicit location label, and heading/footnote navigation derived from the document outline. On mode changes, preserve the source locator and move focus only when needed for an invoked navigation action; do not repeatedly focus static page content on automatic repagination.

## Data Flow

### Article Load

```text
saved JSON
  → schema validation/migration
  → immutable NormalizedDocument(revision)
  → normalized text + outline + asset registry
  ├→ semantic scrolling projection (always viable)
  ├→ restore source locator + annotations from repositories
  └→ schedule layout(fonts, assets, viewport, settings)
       → measurements → pure paginator → PageMap
       → validate invariants → atomic paginated projection
```

### Resize, Typography Change, or Late Font Load

```text
ResizeObserver / setting action / FontFaceSet event
  → create new LayoutInput key
  → cancel or obsolete older generation
  → capture current source locator from old view
  → await required font/asset state
  → measure → paginate → invariant checks
  → swap PageMap atomically
  → reveal page containing captured locator
  → announce only user-relevant status, without stealing focus
```

Page-map invariants should include monotonic source ranges, no duplicated or omitted text, forward progress on every page, valid block fragmentation, and an explicit disposition for each oversize block. A non-progressing break algorithm must terminate and fall back rather than loop.

### Selection to Persistent Annotation

```text
DOM Selection/Range
  → renderer node map
  → canonical start/end offsets
  → exact quote + prefix/suffix + document revision
  → annotation repository transaction
  → resolve selectors against canonical text
  → project highlight into whichever view is active
```

A DOM `Range` is an ephemeral capture mechanism, not the persistence format. Rerendering changes nodes even when text is identical. Highlight projection may split visual fragments across pages, but the annotation remains one source range. Overlapping highlights should be rendered from a sweep of source intervals rather than by destructively wrapping already-rendered highlight markup.

### Reading Position

Capture progress at semantic boundaries: the first meaningfully visible source position in scroll mode, or the current page's source start plus an optional intra-page anchor in page mode. Coalesce writes after navigation settles and flush on visibility change. Restore by document revision and locator, then map into the selected view. If content revisions differ, apply the same quote/context recovery used for annotations and surface approximate restoration when confidence is reduced.

## Persistence Boundary

Use IndexedDB behind repository interfaces because it stores structured values and supports transactional object-store updates. Keep layout caches disposable and rebuildable.

| Object store | Key | Value / indexes | Policy |
|---|---|---|---|
| `documents` | document ID | normalized document, revision, importedAt | immutable by revision or explicit replacement |
| `preferences` | profile ID | mode, typography, spacing, theme, motion choice | small, last-write-wins locally |
| `progress` | document ID | stable locator, revision, updatedAt | coalesced writes |
| `annotations` | annotation ID | document ID, selectors, color, note, timestamps | index by document ID |
| `layoutCache` (optional) | full layout key | page map, diagnostics | safe to delete; never required for recovery |

Open/version/migrate the database in one infrastructure module. Do not hold long-lived read-write transactions across UI awaits. Repository methods return domain objects and map quota, corruption, and blocked-upgrade errors into explicit application states. For a prototype, export/import of local annotation JSON is a more valuable recovery feature than cloud-shaped abstractions.

## Accessibility Boundary

Accessibility is a cross-cutting contract with an owner, not a renderer polish pass.

| Contract | Architectural consequence | Verification |
|---|---|---|
| Meaningful sequence and semantics | Canonical order drives both renderers; native elements first | DOM and accessibility-tree snapshots |
| Keyboard operation | Commands are input-agnostic; buttons remain normal tab stops; shortcuts avoid conflicts | keyboard-only E2E in both modes |
| Focus order/visibility | DOM order follows logical order; repagination never strands or obscures focus | focus traversal at viewport/zoom matrix |
| Reflow/zoom | Scrolling mode is always available and usable at 320 CSS px-equivalent width; pagination may yield | 400% zoom/reflow scenarios |
| Reduced motion | Static transitions by default; motion only under `no-preference`, plus reader control if added | emulated media preference |
| Status changes | restrained live region for loading/fallback/error, not every page turn | screen-reader/manual review |
| Reader choice | explicit mode control; automatic pagination failure preserves locator in scroll mode | failure-injection tests |

WCAG 2.2 requires keyboard operation, meaningful focus order, visible/non-obscured focus, and reflow without lost information or functionality. The paginated presentation does not excuse a two-dimensional or clipped reading experience under zoom; scrolling is the robust conformance and preference path.

## Testing Architecture

### Test Pyramid by Boundary

1. **Pure domain tests:** schema migrations, normalization golden cases, text index, selector recovery and ambiguity, locator comparisons.
2. **Pure layout tests:** deterministic synthetic measurements, break rules, widow/orphan policy if implemented, oversize blocks, no-loss/no-duplication properties, termination.
3. **Browser calibration tests:** actual fonts and DOM reference blocks versus measurer predictions; images and code; late-font and resize invalidation.
4. **Renderer contract tests:** each block maps to expected native semantics; link/footnote behavior; annotations across element/page boundaries.
5. **Cross-browser E2E:** Chromium, Firefox, WebKit over representative articles, viewport/zoom/typography/font-failure matrix, page ↔ scroll location preservation, persistence reopen.
6. **Accessibility checks:** automated rule scan plus Playwright accessibility-tree snapshots, keyboard sequences, visible focus screenshots, reduced-motion emulation, and manual screen-reader/zoom checks. Automated checks are necessary but not sufficient.

Golden page counts are useful only under pinned browser/font/viewport inputs. Prefer stronger invariants over universal exact counts. Visual snapshots should target a small stable matrix; PageMap structural snapshots and semantic snapshots provide less brittle coverage. Playwright officially supports Chromium, Firefox, WebKit, device emulation, visual comparisons, and order-sensitive ARIA snapshots, making it a suitable browser-level harness.

## Build Order and Dependencies

```text
1. Corpus + schema + normalization
   ↓ establishes source identity and supported semantics
2. Semantic scrolling renderer + accessibility shell
   ↓ proves every article remains readable without pagination
3. Stable locators + persistence + annotations on scroll projection
   ↓ prevents page coordinates from leaking into durable state
4. Layout contracts + font/asset lifecycle + measurement calibration
   ↓ proves inputs before page-breaking complexity
5. Pure paginator + PageMap diagnostics on text-first corpus
   ↓ establishes correctness/termination independently of UI
6. Paginated semantic renderer + keyboard navigation + mode switching
   ↓ consumes stable map and preserves source locator
7. Rich-block fragmentation/fallback + resize/font stress hardening
   ↓ expands reliability without risking the baseline
8. Cross-browser, zoom, screen-reader, and performance acceptance matrix
```

This order minimizes rewrite risk. Building pagination before canonical coordinates would encourage persisting page numbers. Building annotations directly on DOM nodes would make mode switching destructive. Building pagination UI before font/measurement calibration would hide algorithm errors behind rendering noise. Most importantly, completing scrolling first means every subsequent pagination phase can fail closed to a usable article rather than blocking access.

### Phase Gates

| Gate | Evidence required before proceeding |
|---|---|
| Canonical model | all fixtures validate; normalization and stable IDs are deterministic |
| Semantic baseline | supported structures readable, keyboard-accessible, and restorable in scroll mode |
| Durable coordinates | highlights/notes survive rerender and mode-neutral reopen |
| Measurement | calibrated line/block results across target browsers/fonts; font failure path tested |
| Pagination core | no loss/duplication, monotonic pages, termination, oversize disposition |
| Paginated view | location preserved across resize/settings/mode; focus and semantics pass |
| Prototype acceptance | representative corpus passes browser × viewport × typography × accessibility matrix within performance budget |

## Scaling Considerations

This milestone is local-first; user-count scaling is irrelevant. Scale along article length and relayout frequency.

| Concern | Prototype | Larger corpus / longer documents |
|---|---|---|
| Layout CPU | main-thread jobs with generation cancellation and instrumentation | worker-capable pure measurement/page breaking if profiling shows jank; DOM-only measurements remain on main thread |
| Rendering | current page plus small neighbor window; full scroll DOM acceptable for corpus | block virtualization only after proving it preserves search, selection, focus, and assistive technology behavior |
| Cache | in-memory current/previous PageMap | bounded IndexedDB layout cache keyed by exact inputs |
| Persistence | local repositories | add export/import before sync; sync later requires conflict and privacy design |

The first likely bottleneck is repeated full-document measurement during typography/resize changes. Address it with prepared text, block-level measurement caches, invalidation keys, and generation cancellation before introducing distributed state or services.

## Anti-Patterns

### Pages as Canonical Content

**Mistake:** Split and store the document as pages, then attach progress and annotations to page numbers.  
**Consequence:** Every viewport, zoom, font, or spacing change invalidates identity.  
**Instead:** Store source ranges; derive page membership.

### Visible DOM as the Only Measurement Engine

**Mistake:** Render the whole article offscreen and repeatedly read/write layout during every resize.  
**Consequence:** layout thrash, feedback loops, brittle hidden-DOM semantics, and poor cancellation.  
**Instead:** isolate measurement, batch unavoidable DOM reads, cache results, and keep page breaking pure.

### Trusting One Font-Ready Event Forever

**Mistake:** paginate once after initial readiness.  
**Consequence:** later glyph fallback or newly used font faces silently change line metrics.  
**Instead:** include font state in the key and invalidate on later load/error events.

### Persisting DOM Paths or Range Objects

**Mistake:** serialize child-node indexes from the rendered tree.  
**Consequence:** harmless rerenders, annotation wrappers, or mode changes detach anchors.  
**Instead:** convert selections immediately to canonical text selectors with quote context.

### Accessibility Tree Duplication

**Mistake:** retain full scrolling and paginated DOM projections simultaneously without removing one from interaction and accessibility.  
**Consequence:** duplicated headings/links, confusing focus, and repeated content.  
**Instead:** mount one active projection, or rigorously make the inactive projection non-rendered/non-interactive.

### Pagination Failure as a Dead End

**Mistake:** show a broken page or spinner indefinitely when an irregular block cannot fit.  
**Consequence:** the distinctive feature prevents reading.  
**Instead:** terminate, preserve the locator, explain briefly, and switch to scrolling.

## Integration Points

### Internal Boundaries

| Boundary | Contract | Notes |
|---|---|---|
| Domain → renderer | immutable block tree + renderer node map | renderer owns DOM, not meaning |
| Domain → layout | block tree + text index + asset metadata | no DOM nodes cross boundary |
| Fonts/assets → layout coordinator | settled state + metric/dimension fingerprint | emits invalidation, not direct repagination |
| Measurer → paginator | measured block fragments and legal break opportunities | keeps algorithm testable without browser |
| Paginator → view | validated PageMap with canonical ranges | replace atomically |
| View ↔ location | source locators | adapters hide pages/pixels |
| Selection → annotation | transient DOM range converted through node map | persistent form is selector set |
| Services → persistence | repository methods and versioned records | IndexedDB API stays infrastructure-local |

No external service is required in this milestone. Pretext, if adopted, integrates only as the text-measurement adapter and must not leak its data structures across the `measure/` boundary.

## Sources

- [CSS Font Loading Module Level 3 — W3C](https://www.w3.org/TR/css-font-loading/) — font-set readiness, load/error events, and later-load caveat. **HIGH confidence** (primary specification).
- [Resize Observer — W3C](https://www.w3.org/TR/resize-observer/) — rendering-loop placement and undelivered-notification loop errors. **HIGH confidence** (primary specification).
- [Web Annotation Data Model — W3C](https://www.w3.org/TR/annotation-model/) — text position and text quote selector semantics and brittleness guidance. **HIGH confidence** (W3C Recommendation).
- [Indexed Database API 3.0 — W3C](https://www.w3.org/TR/IndexedDB/) — structured records, object stores, indexes, transactions, and version changes. **HIGH confidence** for the architectural capabilities used here (primary specification; current document is a Working Draft).
- [Web Content Accessibility Guidelines 2.2 — W3C](https://www.w3.org/TR/WCAG22/) — keyboard, sequence, reflow, focus, and interaction requirements. **HIGH confidence** (W3C Recommendation).
- [Understanding Focus Order — WAI](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) — logical focus and reading-order implications. **HIGH confidence** (official normative-support guidance).
- [Technique C39: `prefers-reduced-motion` — WAI](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) — suppression of non-essential interaction motion. **HIGH confidence** (official technique).
- [Playwright browsers](https://playwright.dev/docs/browsers) and [ARIA snapshots](https://playwright.dev/docs/aria-snapshots) — cross-browser projects/device emulation and accessibility-tree assertions. **HIGH confidence** for tool capability (official current documentation).

---
*Architecture research for: Lem Reader*
*Researched: 2026-07-26*
