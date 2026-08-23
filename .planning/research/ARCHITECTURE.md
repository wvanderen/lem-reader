# Architecture Research

**Domain:** Local-first accessible long-form reader — v2.1 integration architecture
**Researched:** 2026-08-23
**Confidence:** HIGH for codebase integration; MEDIUM for remote-image delivery policy

## Executive Recommendation

Treat v2.1 as an additive application-shell and domain-service milestone, not a reading-engine rewrite. The existing canonical `CanonicalArticle`/`Block` model, article-global grapheme coordinate system, pagination fragments, annotation records, and renderer already contain the load-bearing primitives for figures and cross-block ranges. Preserve those contracts and add four seams around them:

1. an explicit route/navigation shell for Library, Highlights, Add, and Reader;
2. pure projection services for library state and heading-derived navigation;
3. a separate user-metadata overlay keyed by stable article ID;
4. endpoint-aware DOM selection capture that still emits the existing one-range `TextPositionSelector`.

The largest uncertainty is not figure rendering—the renderer already emits semantic `<figure><img><figcaption>`—but the privacy/security policy for externally hosted image bytes. Preserve image metadata through the canonical pipeline now, but do not broaden `FigureBlock.src` or bypass URL validation. If v2.1 promises private/offline image copies, that must be a dedicated asset-ingestion slice with SSRF, type, size, export, and lifecycle contracts.

## Standard Architecture

### System Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│ Application shell                                                  │
│ AppRoute parser · AppHeader · primary nav · route-level layout     │
├────────────────────────────────────────────────────────────────────┤
│ Route surfaces                                                     │
│ LibraryRoute · HighlightsRoute · AddRoute · ReaderRoute            │
├────────────────────────────────────────────────────────────────────┤
│ Presentation/domain projections                                    │
│ LibraryState · ArticleDisplayMetadata · HeadingIndex · ResumeCue   │
│ SelectionCapture · AnnotationResolution · ReaderLocation           │
├────────────────────────────────────────────────────────────────────┤
│ Stable content and reading engine                                  │
│ CanonicalArticle/Block · normalizeText · pagination · renderer     │
├────────────────────────────────────────────────────────────────────┤
│ Boundaries                                                         │
│ Ingestion pipeline · repositories · Zod validation · export/import │
├────────────────────────────────────────────────────────────────────┤
│ Local persistence                                                  │
│ Dexie articles/books/settings/location/highlights/notes/metadata   │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility | Integration rule |
|-----------|--------|----------------|------------------|
| `AppRoute` parser + route helpers | **Modified/new extraction from `App.tsx`** | Parse and generate `#/`, `#/review`, `#/add`, and article deep links | Keep fragment-only hashes for footnotes/headings out of route parsing; invalid app routes fall back calmly |
| `AppShell` / `AppHeader` | **Modified** | Persistent brand/home link, primary Library/Highlights navigation, contextual reader actions | Navigation is always available; reader-only mode/TOC/annotation actions render only on article routes |
| `LibraryView` | **Modified** | Compose sections/tabs for unread, in-progress, finished, search, tags, and continue reading | Consume a projection; do not independently invent progress thresholds in rows, books, and filters |
| `AddRoute` / focused ingestion flow | **New route over modified `IngestControl`** | Stepwise source choice, input, validation/result, and return/open actions | Reuse `IngestionClient` and server pipeline; UI flow must not fork validation or format logic |
| `ArticleDisplayMetadataRepository` | **New** | Store optional reader-authored title/author overrides keyed by stable `articleId` | Never rewrite `blocks`, source provenance, article ID, revision, or annotation anchors |
| `ArticlePresentation` resolver | **New pure projection** | Combine canonical provenance with metadata overrides for Library, Reader, Review, Markdown export labels | One resolver prevents different titles across surfaces |
| `deriveLibraryState` | **New pure service** | Classify unread/in-progress/finished from canonical article length plus latest location | Reuse one finished threshold, including book aggregation; state is derived unless manual status becomes a future requirement |
| `HeadingIndex` | **New pure service** | Walk top-level heading blocks, produce stable target ID, level, label, block index, grapheme offset | Derived data only; never persist page numbers or DOM nodes |
| `TableOfContents` | **New reader component** | Render semantic labeled navigation and jump through canonical offsets | Use `<nav aria-label="Article contents">` and ordered links/buttons; keyboard and SR behavior stays native |
| `captureSelection` | **Modified** | Map DOM Range endpoints, including distinct blocks, into one article-global grapheme range | Preserve current `HighlightRecord` v1 shape and tri-state resolution; reject unsupported or discontinuous content honestly |
| Highlight renderer/index | **Modified** | Slice one global range across every intersecting eligible block/container | Intermediate blocks need full-block slices; figures/code/list descendants require explicit support or honest rejection |
| Resume orientation surface | **Modified/replaced** | Announce restored position and offer “start at top” without changing reader geometry | Overlay/toast or stable reserved shell layer; never insert a card into article flow after pagination |
| HTML/Markdown/EPUB image adapters | **Modified** | Preserve supported figures, resolved sources, alt, and inline captions | All paths must enter through `FigureBlock`; EPUB embedded assets need a separate safe asset contract rather than remote-beacon rendering |
| Export/import bundle | **Modified if metadata is persisted** | Carry metadata overrides and any future local assets across devices | Add a new accepted/emitted bundle version; validate and conflict-preview before one atomic transaction |

## Recommended Project Structure

```text
src/
├── app/
│   ├── routes.ts                 # parse/format route grammar
│   ├── AppShell.tsx              # global header/nav and contextual slots
│   └── navigation.ts             # push/replace/back-to-library helpers
├── routes/
│   ├── library/LibraryView.tsx   # relocate current ingestion/library view
│   ├── add/AddView.tsx           # focused ingestion workflow
│   ├── review/ReviewView.tsx
│   └── ArticleView.tsx
├── library/
│   ├── deriveLibraryState.ts     # one unread/progress/finished policy
│   └── articlePresentation.ts    # canonical + user metadata projection
├── reader/
│   ├── toc/headingIndex.ts       # heading → stable targets/offsets
│   ├── toc/TableOfContents.tsx
│   ├── ResumeCue.tsx
│   └── annotations/...
├── annotations/
│   ├── capture.ts                # endpoint-aware global capture
│   └── highlightRanges.ts        # multi-block slicing
├── persistence/
│   ├── articleMetadataStore.ts
│   └── db.ts                     # append Dexie v6 only if store is chosen
└── content/
    ├── schema.ts                 # canonical model remains authoritative
    └── render/BlockRenderer.tsx  # semantic figure + heading targets
```

Do not mechanically move every file at once. The folder layout shows target boundaries; extract route/domain modules while implementing each slice so tests and imports remain reviewable.

## Architectural Patterns

### Pattern 1: Canonical Content Plus User Presentation Overlay

**What:** Keep extracted provenance immutable and store reader edits separately.

```typescript
interface ArticleMetadataRecord {
  schemaVersion: 1;
  articleId: string;
  titleOverride?: string;
  authorOverride?: string; // empty author is represented explicitly by policy
  updatedAt: string;
}

function presentArticle(
  article: CanonicalArticle,
  edit?: ArticleMetadataRecord,
): ArticlePresentation {
  return {
    article,
    title: edit?.titleOverride ?? article.provenance.title,
    author: edit?.authorOverride ?? article.provenance.author,
  };
}
```

**Why:** Editing a label must not manufacture a new document revision, shift grapheme offsets, alter `originalHtmlHash`, or weaken source traceability. A single projection is used by Library, Reader, Review, export labels, and search.

**Trade-off:** Adds a repository join and export/import payload. This is preferable to conflating user organization with sanitized source content.

### Pattern 2: Derived Library State, Not Duplicated Status

**What:** Classify articles from the latest valid `LocationRecord` and canonical grapheme length.

```typescript
type ReadingState = "unread" | "in-progress" | "finished";

function deriveReadingState(
  total: number,
  location?: LocationRecord,
): ReadingState {
  if (!location || location.graphemeOffset <= 0) return "unread";
  return location.graphemeOffset / Math.max(total, 1) >= FINISHED_RATIO
    ? "finished"
    : "in-progress";
}
```

**Why:** The current code already derives row/book progress from locations and has a known `FINISHED_RATIO` fork. Consolidate that fork before adding state views. Persist a manual state only if the product later adds “mark unread/finished,” because that introduces override precedence and portability rules.

### Pattern 3: TOC as a Projection Over Canonical Headings

**What:** Generate entries from heading blocks, not rendered page structure.

```typescript
interface HeadingEntry {
  id: string;             // e.g. article-heading-<blockIndex>
  level: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  blockIndex: number;
  graphemeOffset: number;
}
```

The renderer assigns the same deterministic ID to the visible heading. TOC activation navigates through the reader’s existing offset-to-page/scroll machinery, then moves programmatic focus only under a tested focus policy. In paginated mode, the target page is derived from the heading’s global offset after pagination; in scrolling mode, the target block is resolved directly.

**Accessibility:** Render a labeled native `<nav>` containing an ordered list. W3C DPUB-ARIA defines `doc-toc` as navigation to major sectional headings, but native `nav` plus a clear label is the compatibility baseline. If current-section tracking is added, use `aria-current="location"`; do not turn the TOC into an ARIA tree unless it gains true tree interaction.

### Pattern 4: Cross-Block Capture Produces the Existing Global Selector

**What:** Remove the equality check that rejects different endpoint blocks; independently map each endpoint into the canonical stream, then return `{start, end}` in logical document order.

```typescript
const start = captureEndpoint(range.startContainer, range.startOffset, article, root);
const end = captureEndpoint(range.endContainer, range.endOffset, article, root);
if (!start.ok || !end.ok) return reject(start.reason ?? end.reason);
return { ok: true, position: orderedRange(start.globalOffset, end.globalOffset) };
```

The persisted `HighlightRecordSchema` does **not** need a version bump: it already stores a single article-global inclusive-start/exclusive-end range plus quote context. This aligns with W3C Text Position/Quote selector semantics. The hard work is rendering and eligibility: every intervening readable block must be sliced, and unsupported/figure-only discontinuities need a documented rule. Start/end endpoints may be paragraph or heading descendants; include lists, blockquotes, code, and captions only after their DOM-to-normalized mapping is covered by corpus tests.

**Paginated constraint:** A browser selection cannot normally cross unmounted pages. Cross-block highlighting can span multiple blocks visible on one page/scrolling surface immediately; spanning page turns requires a separate explicit “extend selection” interaction and is not implied by changing the data model.

### Pattern 5: Geometry-Free Resume Feedback

**What:** Restore silently via canonical offset as today, but place confirmation in an overlay/status layer outside measured article flow. Keep one polite announcement and a “Start from top” escape hatch. Do not ask readers to “Resume” after the restore has already occurred.

**Why:** Injecting `ResumeBanner` into the document/shell flow changes available height after layout and contradicts the stable-orientation goal. Overlay positioning must respect zoom, safe areas, keyboard focus, and reduced motion; it should auto-dismiss without requiring dismissal before page turns.

### Pattern 6: Images Stay Canonical; Asset Transport Is a Separate Boundary

**What:** Continue rendering only validated `FigureBlock` values via native `<figure>`, `<img alt>`, and `<figcaption>`. Improve adapters and post-render failure behavior without adding an alternate HTML path.

For URL/HTML sources, `htmlToBlocks` already resolves `<img>` URLs and captions; v2.1 should add corpus coverage for `src`, lazy-source attributes, `<picture>` fallback selection, missing/empty alt policy, captions, and load failure. Every candidate URL must be normalized before Zod validation. The renderer should use `loading="lazy"`, `decoding="async"`, a conservative referrer policy, stable dimensions/aspect-ratio when known, and a calm failure substitute.

For EPUB embedded images or a true offline/private copy, create an `AssetRecord`/asset-reference design and ingest bytes through the same SSRF/size/type philosophy. Do not convert EPUB resources into remote beacons, embed arbitrary data URLs, or let the renderer fetch unvalidated internal URLs. Because the current stateless server response, canonical `httpUrl`, Dexie schema, and export bundle do not carry assets, this should be a separately researched phase if included in the release promise.

## Data Flow Changes

### Route and Shell Flow

```text
hashchange / link activation
        ↓
parseAppRoute() → AppShell context → route surface
        ↓                ↓
global nav         contextual reader actions
```

Use anchors for navigable destinations so browser semantics (open in new tab, status URL, history) remain intact. Centralize route generation and the existing `hasAppHistory` fallback; do not scatter `window.location.hash = ...` strings across components.

### Library Projection Flow

```text
articles + books + latest locations + metadata overrides
        ↓
validated repositories (parallel read)
        ↓
ArticlePresentation[] + ReadingState[] + BookState[]
        ↓
search/tag/state filter → Library sections/tabs
```

Search must use displayed title/author, not stale canonical provenance, while source traceability continues to show original provenance where appropriate.

### Metadata Edit Flow

```text
Edit dialog → trim/validate plain strings → metadata repository upsert
        ↓                                      ↓
optimistic/local refresh                 Dexie metadata store
        ↓                                      ↓
all presentation resolvers          export bundle next version
```

Never rewrite the article record as part of metadata editing. Deleting an article must cascade its override record; importing an override for a missing article must fail or be skipped explicitly.

### TOC Navigation Flow

```text
CanonicalArticle → deriveHeadingIndex(article)
                         ↓
TOC entry activation → canonical heading offset
                         ↓
scroll locator OR pagination page lookup
                         ↓
visible heading/current-location announcement
```

The same index supplies deterministic heading IDs in both modes. It is cheap and derived, so it belongs in memoized runtime state rather than Dexie.

### Cross-Block Highlight Flow

```text
DOM Range endpoints
  ↓ (endpoint-specific raw→normalized mapping)
global grapheme start/end
  ↓
existing quote derivation + overlap policy
  ↓
HighlightRecord v1 → Dexie/export unchanged
  ↓
per-block intersection slices → semantic <mark> fragments
```

A single logical highlight may render as several `<mark>` elements. All fragments must carry the same highlight ID; only one predictable fragment should be the primary programmatic target for review deep links and note activation.

### Image Flow

```text
source DOM/Markdown/EPUB resource
  ↓
format adapter → URL/asset safety policy → FigureBlock
  ↓                  ↓                       ↓
warnings/refusal  size/type/SSRF gates   Zod validation
  ↓
semantic renderer → success or calm load-failure state
```

## Persistence and Migration

| Change | Dexie impact | Record schema impact | Portability impact |
|--------|--------------|----------------------|--------------------|
| Navigation/library grouping | None | None | None |
| Derived unread/in-progress/finished | None | None | None |
| TOC | None | None | None |
| Non-shifting resume cue | None | None | None |
| Cross-block highlight | None expected | Existing `HighlightRecord` v1 remains sufficient | Existing bundles remain valid |
| Title/author overrides | Append Dexie **v6** with `articleMetadata: "articleId, updatedAt"` | New `ArticleMetadataRecord` v1 | Emit/accept a new bundle version and include conflict preview; older bundles import with empty overrides |
| Remote figure preservation only | None if URL stays in `FigureBlock.src` | Existing schema sufficient | Existing article payload already carries figures |
| Locally copied/EPUB image assets | New asset store plus cascade/index policy | New asset reference contract or safe internal source union | New bundle version, manifest hashing, bomb limits, orphan cleanup |

Never edit Dexie versions 1–5. If `articleMetadata` is added, append version 6 with the full store declaration. If asset storage follows later, append another version rather than combining it speculatively. Validate every metadata row on read with Zod, and include it in remove/import atomic transactions.

## Internal Integration Boundaries

| Boundary | Contract | Important invariant |
|----------|----------|---------------------|
| Shell ↔ route | `AppRoute` discriminated union | Routed hashes and native in-document fragments remain distinct |
| Route ↔ repository | Async typed repository results | Components do not read Dexie directly or duplicate corruption handling |
| Canonical article ↔ presentation | Pure `presentArticle` projection | User edits never mutate source identity/content |
| TOC ↔ reader navigation | `graphemeOffset`/`blockIndex`, never page number | Repagination and mode changes cannot stale the TOC |
| Selection capture ↔ persistence | Existing `TextPositionSelector` + `TextQuoteSelector` | One logical normalized stream; grapheme boundaries; honest rejection |
| Ingestion ↔ renderer | `ArticleSchema` / `FigureBlock` only | Sanitize/normalize once; never `dangerouslySetInnerHTML` |
| Images ↔ network/storage | Explicit URL or asset policy | No secondary SSRF, tracking beacon surprise, unbounded bytes, or unsafe schemes |
| Metadata/assets ↔ portability | Versioned bundle schema + atomic import | Local-first edits survive cross-device travel without silent overwrite |

## Anti-Patterns

### Mutating Canonical Provenance for Cosmetic Edits

**Why wrong:** Blurs source traceability and document revision semantics, and risks accidental anchor migration.
**Instead:** Store display overrides separately and resolve them consistently.

### Persisting Page Numbers, TOC Trees, or Reading-State Labels

**Why wrong:** These are projections of content, viewport, typography, and locations and will drift.
**Instead:** Persist canonical offsets; derive pages, headings, and state.

### Treating Cross-Block Highlight as a New Multi-Record Annotation

**Why wrong:** Notes, overlap checks, review links, deletion, and export assume one logical highlight. Multiple records create partial deletion and ordering ambiguity.
**Instead:** Keep one global selector and render multiple visual fragments with one ID.

### Making the Entire SPA `role="application"`

**Why wrong:** It can suppress normal screen-reader document navigation, which is essential to a semantic reading surface.
**Instead:** Use native landmarks, headings, links, dialogs, and controls.

### Solving Images in the Renderer

**Why wrong:** Allowing arbitrary URLs/data or raw source markup at render time bypasses the canonical security boundary and cannot enforce SSRF/size/privacy rules.
**Instead:** Decide admissibility during ingestion and render only canonical figures.

### Reusing One Giant `App.tsx` State Hub

**Why wrong:** Additional route, TOC, edit, ingestion, tags, settings, and annotation state will increase contextual leakage (such as reader-only controls on Library).
**Instead:** Keep global shell state global and colocate route-specific surface state; communicate through small typed callbacks/services.

### Visual Tabs Without Route or Focus Semantics

**Why wrong:** A tab-looking SPA header implemented with buttons and ad hoc hashes produces confusing browser history and SR state.
**Instead:** Use navigation links for destinations; reserve ARIA tabs for one page with true tabpanel keyboard behavior.

## Dependency-Aware Build Order

1. **Contract consolidation and regression harness**
   - Extract route grammar/helpers and consolidate `FINISHED_RATIO`/progress derivation.
   - Add representative tests for hash fragments, books, figures, selection endpoints, and current accessibility invariants.
   - This removes known forks before new UI depends on them.

2. **Application shell and information architecture**
   - Build global Library/Highlights navigation, contextual reader actions, coherent page containers/gutters, and `#/add`.
   - Recompose Library and Review without changing storage contracts.
   - Fix tag overlay anchoring and reading-width slider here because both are shell/control geometry issues.

3. **Focused ingestion workflow**
   - Refactor `IngestControl` into a workflow state machine/component set behind AddRoute while reusing the current client/pipeline.
   - Keep result announcements and keyboard/focus recovery explicit.

4. **Metadata overlay and portability**
   - Land Zod record, repository, Dexie v6, presentation resolver, delete cascade, bundle version, atomic import/conflicts, then edit UI.
   - Storage/export contracts must precede surfaces that let readers create edits.

5. **Heading index and reader TOC**
   - Add deterministic heading targets and pure heading projection, then wire offset navigation in scrolling and paginated modes.
   - Validate keyboard, SR, zoom, focus, and repagination behavior.

6. **Cross-block highlight substrate**
   - Refactor endpoint capture, eligibility, overlap, per-block rendering, deep-link focus, and note interaction.
   - Prove scrolling first, then paginated same-page multi-block selection; explicitly scope cross-page extension if desired.
   - Run existing re-anchor/export/import corpus unchanged because the persisted shape should not change.

7. **Image fidelity and safety**
   - First close extraction/render gaps for existing remote `FigureBlock` support and add a failure/privacy policy.
   - Treat EPUB embedded images or offline copies as a gated asset sub-phase after an architecture spike; it touches ingestion, schema, Dexie, export/import, deletion, and resource limits.

8. **Resume cue and integrated polish/acceptance**
   - Replace the flow banner once final shell geometry exists.
   - Run Impeccable-informed visual review plus the full cross-browser, axe, keyboard, reduced-motion, high-zoom, and manual SR acceptance matrix.

## Scaling Considerations

This is a single-reader local-first app; server-user scaling is not the main concern.

| Concern | Current library | Large personal library | Mitigation |
|---------|-----------------|------------------------|------------|
| Library projections | In-memory joins are fine | Recomputing grapheme length for all articles may become expensive | Cache validated article indexes per object; project once per load; consider indexed metadata only after profiling |
| Review + metadata joins | Parallel full-store loads are acceptable | Thousands of highlights increase render cost | Repository-level indexed queries and list virtualization that preserves semantics |
| TOC | Linear heading scan is trivial | Very long technical books have large TOCs | Memoize by article identity/revision; progressively disclose visual nesting without changing semantic list |
| Cross-block marks | Linear intersections per article currently exist | Many large overlapping highlights increase slice work | Pre-index sorted highlight ranges and query by block interval |
| Images | Remote URL has low local storage cost | Many images increase network/layout instability | Lazy loading, stable aspect geometry, bounded cache/asset policy if local copies are added |

## Research Flags

- **Image asset transport (HIGH priority if EPUB/offline images are promised):** Decide remote references versus ingestion-time copied assets. Research SSRF-safe secondary fetches, MIME sniffing, decompression/pixel limits, IndexedDB Blob behavior, object-URL lifecycle, bundle limits, and privacy/CSP.
- **Cross-page highlight extension (MEDIUM):** Native DOM selection cannot span unmounted paginated pages. Decide whether v2.1 means multi-block within the current DOM or a deliberate extend-across-pages interaction.
- **Metadata conflict semantics (MEDIUM):** Define import conflict precedence for local overrides and whether “clear author” differs from “no override.”
- **Heading hierarchy repair (LOW/MEDIUM):** TOC should reflect source levels honestly; decide how skipped heading levels are visually nested without rewriting semantic levels.

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Shell, route, projection boundaries | HIGH | Direct inspection of `App.tsx`, `LibraryView`, `ReviewView`, and existing hash/fragment contracts |
| Metadata overlay and migration | HIGH | Existing immutable article identity, append-only Dexie v1–v5 discipline, and versioned portability architecture |
| TOC model | HIGH | Existing heading blocks/global offsets plus W3C navigation and DPUB TOC semantics |
| Cross-block persisted selector | HIGH | Existing article-global grapheme stream and W3C Text Position/Quote selector model |
| Cross-block DOM capture/render effort | MEDIUM | Current code explicitly rejects different block ancestors and only renders slices for selected block/container kinds; browser corpus work remains |
| Remote HTML figures | HIGH | Existing `FigureBlock`, URL gate, `htmlToBlocks`, and semantic renderer inspected directly |
| EPUB/offline image assets | MEDIUM | Current EPUB path deliberately downgrades figures; required storage/transport policy is not yet chosen |

## Sources

- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — Text Quote, Text Position, and Range selector semantics; normalized logical text and grapheme-boundary guidance (MEDIUM through research confidence seam; primary Recommendation).
- [W3C Digital Publishing WAI-ARIA Module: `doc-toc`](https://www.w3.org/TR/dpub-aria-1.0/#doc-toc) — TOC as navigation with an ordered list of heading links (MEDIUM through research confidence seam; primary Recommendation).
- [W3C ARIA Authoring Practices: Navigation Landmark](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html) — native `nav` landmarks and distinct labels for multiple navigation regions (MEDIUM through research confidence seam).
- [MDN: CSP `img-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/img-src) — deployment-level control of permitted image sources (MEDIUM through research confidence seam; current reference).
- Local primary evidence: `src/content/schema.ts`, `src/content/normalizeText.ts`, `src/annotations/capture.ts`, `src/content/render/BlockRenderer.tsx`, `src/App.tsx`, `src/persistence/db.ts`, `server/htmlToBlocks.ts`, and `server/epubToBooks.ts` (HIGH).

---
*Architecture research for: Lem Reader v2.1 Reader Experience*
*Researched: 2026-08-23*
