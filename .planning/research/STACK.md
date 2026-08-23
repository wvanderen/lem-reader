# Stack Research

**Domain:** v2.1 reader-experience additions to an existing local-first accessible reader
**Researched:** 2026-08-23
**Confidence:** HIGH for the no-new-dependency recommendation; MEDIUM for remote-image delivery policy pending a product/privacy decision

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Existing React + React DOM | 19.2.8 (retain) | SPA shell, modal workflows, TOC, and reader controls | These features are ordinary state, navigation, and semantic rendering over existing routes. Add a small route/navigation model and shared shell; do not introduce a second application framework. |
| Existing TypeScript | 7.0.2 (retain) | Model metadata overrides, image provenance/dimensions, TOC entries, and multi-block capture results | The main risks are contract changes across ingestion, persistence, pagination, annotations, and export—not missing UI abstractions. Strict discriminated types keep those changes explicit. |
| Existing canonical Block model + browser DOM APIs | Project-owned contract | Images/captions, heading TOC, and article-global selections | Lem Reader already has `FigureBlock`, semantic `<figure>/<figcaption>` rendering, article-global grapheme offsets, `Selection`/`Range`, and block range slicing. Extend those proven seams instead of adding parallel models. |
| Existing Dexie | 4.4.4 (retain) | Persist editable metadata and any new image metadata/asset references | Use an append-only schema migration and repository methods. Keep canonical content identity separate from reader-editable display metadata so annotations and imports remain stable. |
| Existing Readability + jsdom + DOMPurify pipeline | `@mozilla/readability` 0.6.0, jsdom 30.0.1, isomorphic-dompurify 3.22.0 (retain) | Preserve source figures/captions through extraction and normalization | Readability already returns processed HTML, resolves relative image URLs when jsdom receives the source URL, and has official figure/caption fixtures. The current sanitizer and `htmlToBlocks` already allow and map `img`, `figure`, and `figcaption`; improve coverage and provenance at this boundary rather than adding another extractor. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **No new runtime library** | — | v2.1 stack delta | Default recommendation. The new work is application/domain logic and semantic HTML. |
| Existing Zod | 4.4.3 (retain) | Validate new persisted metadata and figure fields | Extend the current schemas and versioned import/export union; do not allow UI edits or image attributes to bypass runtime validation. |
| Existing Playwright + axe integration | 1.61.1 + 4.12.1 (retain) | Cross-engine layout, selection, focus, image-settle, and TOC accessibility tests | Browser layout and DOM selection remain authoritative. Add corpus cases for captions, broken/slow images, nested headings, cross-block selection, zoom, forced colors, and both reading modes. |

### Browser Primitives and Project-Owned Adapters

| Primitive / adapter | Purpose | Required usage |
|---------------------|---------|----------------|
| `HTMLDialogElement.showModal()` | Focused Add to Library and metadata-edit workflows | Reuse the app's established native-dialog lifecycle, initial focus, Escape, close-commit, and trigger-focus restoration discipline. `showModal()` supplies top-layer modality and makes the rest of the document inert. |
| `Selection` + `Range` | Capture cross-block selections | Remove the current same-block rejection. Map both endpoints independently through their `[data-block-index]` ancestors and slice offsets, then produce one article-global `[start,end)` selector. Reject measurement/off-surface or unsupported endpoints honestly. |
| Native `<nav>`, `<ol>/<ul>`, `<a href="#…">` | Heading-derived table of contents | Derive a nested list from canonical heading blocks. Give visible headings deterministic render-time IDs and preserve normal link behavior; label the document-navigation landmark distinctly from app navigation. Do not implement a tree widget. |
| Native `<figure>`, `<img>`, `<figcaption>` | Source images and captions | Keep figure/caption semantics in both modes. Extend the canonical figure with optional intrinsic `width`/`height` and provenance/delivery state if needed; reserve aspect ratio before load to prevent repagination/layout shift. |
| `ResizeObserver`, image `load`/`error`, and `HTMLImageElement.decode()` | Pagination invalidation after image settlement | Register images with the existing measurement invalidation pipeline. A figure is atomic; pagination must settle or invalidate when dimensions become known, and broken images need a stable accessible fallback. |
| `getBoundingClientRect()` + viewport clamping | Fix the tag menu anchor | Position the existing menu from its trigger's rect, update on resize/scroll, and clamp/flip within the viewport. This is one known overlay, not enough justification for a positioning dependency. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing Vitest corpus/property tests | Contract and invariant coverage | Prove TOC derivation, metadata migration/round-trip, selection across adjacent and nested blocks, quote resolution, figure extraction, and import compatibility. |
| Existing three-engine Playwright matrix | Browser truth | Test Chromium, Firefox, and WebKit for cross-block `Range` endpoints, focus return, anchor navigation, slow/broken images, page overflow, and popover placement at viewport edges. |
| Existing accessibility protocols | Manual verification | Extend NVDA+Firefox and VoiceOver+Safari scripts for app navigation, dialog flows, TOC landmark/link announcements, and multi-block highlight review. |

## Installation

```bash
# No new production or development packages are recommended for v2.1.
# Retain the existing lockfile and pinned stack.
npm install
```

## Integration Decisions by Feature

### Cohesive SPA information architecture

- Keep the current hash-route substrate and define typed route helpers for Library, Highlights, Reader, and deep-link locations.
- Build one shared application shell/header and view-level secondary actions.
- Do **not** add React Router solely for three established destinations. Reconsider only if nested routing, route loaders/actions, or history-blocking requirements materially grow.
- Use a modal or dedicated focused route for Add to Library; either can reuse the existing ingestion service. Native `<dialog>` is the smallest fit if the workflow remains short and returns to the same library context.

### Editable title and author

- Add reader-owned display metadata (or explicit overrides) rather than rewriting provenance or deriving a new article ID.
- Persist through the existing Dexie repository with an append-only schema migration.
- Bump the versioned export/import schema and preserve backward compatibility. An edit must never alter normalized text, annotation offsets, source hash, or book/chapter identity.

### Images and captions

- Start by fixing extraction coverage: Readability already preserves figures in known cases, and `htmlToBlocks` already recognizes figures/captions. Add source-corpus tests for bare images, `<figure>`, lazy-source attributes, `<picture>`, relative URLs, duplicate captions, tracking pixels, and broken images.
- Preserve only validated `http(s)` candidates through the sanitizer/canonical boundary. Add optional intrinsic dimensions when trustworthy; never carry arbitrary source HTML, CSS, event handlers, or `srcset` without a separately validated model.
- Render `referrerPolicy="no-referrer"`, useful `alt`, constrained responsive dimensions, and a visible failure fallback. Remote images still disclose the reader's IP to the image host; `no-referrer` only suppresses the referring URL.
- Make delivery policy explicit before implementation: direct remote loading is the smallest change but has privacy, availability, and export-portability limits. If v2.1 requires offline/portable images, store fetched and size-capped bytes as Dexie `Blob` assets and include them in a new bundle schema; this is an architecture/schema expansion, but still does not require a new library. Reuse the SSRF-safe fetch and byte/redirect limits.
- Avoid blanket `loading="lazy"` inside the paginated reader: hidden/not-yet-rendered page fragments can prevent loading and destabilize measurement. Prefer eager loading for the current/measurement window or a reader-owned near-page preload policy; scrolling mode can use native lazy loading when dimensions are reserved.

### Heading-derived table of contents

- Derive entries directly from canonical `HeadingBlock`s and render an ordinary labeled `<nav>` with nested lists and links.
- Use deterministic IDs based on article identity plus block index (with a readable slug only as decoration), avoiding collisions from duplicate headings.
- Resolve a TOC destination to the canonical block start. In scrolling mode focus/scroll to the heading; in paginated mode map the offset to its current page, then focus the rendered heading without persisting a page number.

### Cross-block highlighting

- Persist one existing article-global `TextPositionSelector` plus one `TextQuoteSelector`; W3C's position selector is a single range in a normalized text stream and does not require selectors per DOM block.
- Change capture, not storage: independently map the DOM Range start and end to article-global grapheme offsets, normalize direction, and validate eligible content between them.
- Rendering already slices a global range against blocks. Extend coverage to all allowed intermediate block kinds and explicitly define the separator-selection policy so stored quote text and displayed marks agree.
- No annotation framework is warranted. The difficult, product-specific work is mapping Lem Reader's normalized block separators and paginated fragments, which a generic library cannot infer.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Existing hash routing + typed helpers | React Router | Adopt only when nested route ownership, data APIs, guarded navigation, or URL-state complexity outgrows the small route set. |
| Native dialog + established focus discipline | Radix Dialog / React Aria Components | Consider if multiple new complex composite widgets require one audited abstraction and the team accepts its styling/behavior footprint. One add/edit workflow does not justify it. |
| Project-owned trigger positioning | Floating UI | Adopt if menus/tooltips/selects proliferate or collision handling becomes reusable across many anchors. For the single tag-menu defect, trigger rect + clamping is simpler and testable. |
| Existing global selectors | DOM Range serialization / annotation framework | Use only for annotation-anywhere over arbitrary mutable web DOM. Lem Reader has a stronger canonical normalized-text substrate already. |
| Canonical heading list | EPUB navigation library / TOC package | Use when preserving publisher-supplied multi-document EPUB navigation becomes a product requirement. v2.1's reader TOC follows normalized heading hierarchy across all formats. |
| Existing extraction pipeline | New readability/extraction engine | Re-evaluate only if a representative image corpus proves Readability systematically removes meaningful figures before normalization. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| A full component suite for the polish pass | It changes semantics, focus behavior, and visual language across already-validated surfaces while adding little domain value. | Native controls, existing dialog discipline, and authored CSS tokens/components. |
| `role="application"` on the SPA or reader | It can suppress normal screen-reader document navigation—the exact heading/link behavior Lem Reader depends on. | Semantic `header`, `nav`, `main`, `article`, headings, and labeled regions. |
| ARIA `tree` for the TOC | A tree requires specialized keyboard interaction and hides the useful default behavior of links and lists. | Labeled `<nav>` containing nested lists of anchors. |
| CSS Anchor Positioning as the sole tag-menu fix | It is unnecessary for one menu and must not bypass the existing three-engine support contract without explicit compatibility verification. | Project-owned rect positioning and viewport collision tests; progressive-enhance later if desired. |
| Persisted page numbers, element IDs, DOM paths, or serialized `Range`s | They change across pagination, mode, typography, and rendering. | Existing article-global grapheme offsets plus quote context. |
| Base64 image data inside article JSON | It bloats validation, Dexie records, memory, and export manifests and couples binary assets to canonical text. | Validated remote references, or separate size-capped Blob assets if offline portability is required. |
| Unconditional remote image loading | It permits tracking requests, broken layouts, and non-portable exports. | Explicit delivery policy, `no-referrer`, reserved dimensions, failure states, and optional SSRF-safe local asset capture. |
| Unconditional lazy loading in paginated measurement DOM | Hidden fragments may never intersect and therefore never establish dimensions, causing unstable page boundaries. | Known dimensions plus controlled eager/near-page loading and pagination invalidation. |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| React/React DOM 19.2.8 | Existing Vite 8.1.5 + TypeScript 7.0.2 | No router or component-library peer dependency is introduced. |
| Dexie 4.4.4 | Existing schema v5 and versioned export/import | Add an append-only database version; never rewrite old schema declarations. Asset blobs, if chosen, should live in a separate table rather than article JSON. |
| `@mozilla/readability` 0.6.0 | jsdom 30.0.1 + existing DOMPurify boundary | Pass the original page URL to jsdom for absolute image URLs. Readability does not sanitize its result; retain DOMPurify and canonical mapping. |
| Selection/Range | Chromium + Firefox + WebKit Playwright matrix | The APIs are standard, but whitespace, direction, nested nodes, and fragment boundaries require corpus verification against Lem Reader's grapheme mapping. |

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| No new runtime dependency | HIGH | All requested capabilities map to existing project seams and standard HTML/DOM APIs; code inspection confirms figures, dialogs, selectors, routing, and per-block range slicing already exist. |
| Readability figure/caption preservation | HIGH for capability, MEDIUM for real-world coverage | Official Readability docs/fixtures preserve figures and resolve relative image URLs; site-specific extraction and lazy-image markup need corpus calibration. |
| Semantic TOC stack | HIGH | Current W3C WAI guidance supports labeled navigation landmarks, logical headings, and native link/list navigation. |
| Cross-block selector model | HIGH for persistence model, MEDIUM for implementation effort | W3C position/quote selectors match the existing article-global substrate; cross-engine DOM endpoint mapping is project-specific and must be tested. |
| Remote image privacy/offline policy | MEDIUM | Platform behavior is clear, but the correct delivery choice depends on whether v2.1 promises offline/export-portable assets or only preserved source references. |

## Sources

- [Mozilla Readability README](https://github.com/mozilla/readability/blob/main/README.md) — parse output, jsdom base URL resolution, DOM mutation, serializer option, and explicit requirement for external sanitization (official, HIGH).
- [Mozilla Readability official figure fixture](https://github.com/mozilla/readability/blob/main/test/test-pages/dev418/expected.html) — retained `<figure>` and caption structures (official test corpus, HIGH).
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — `TextPositionSelector`, `TextQuoteSelector`, `[start,end)` ranges, normalization, and selector composition (W3C Recommendation, HIGH).
- [W3C WAI Navigation Landmark example](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html) — native `<nav>`, distinct labels, and link-list structure (official guidance, HIGH).
- [W3C WAI Page Structure tutorial](https://www.w3.org/WAI/tutorials/page-structure/) — logical headings and semantic regions for navigation/orientation (official guidance, HIGH).
- [MDN `HTMLDialogElement.showModal()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal) — top-layer modal behavior and inert background (platform documentation, HIGH).
- [MDN `<figcaption>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/figcaption) and [MDN `<img>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img) — semantic caption relationship, intrinsic dimensions, lazy loading, decoding, and image errors (platform documentation, HIGH).
- [MDN Referrer Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy) — per-image `referrerpolicy` and privacy limits (platform documentation, HIGH).

---
*Stack research for: Lem Reader v2.1 Reader Experience*
*Researched: 2026-08-23*
