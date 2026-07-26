# Project Research Summary

**Project:** Lem Reader
**Domain:** Accessible, booklike saved-web-article reader with responsive pagination
**Researched:** 2026-07-26
**Confidence:** MEDIUM-HIGH

## Executive Summary

Lem Reader is a local-first prototype for turning normalized long-form articles into a calm, accessible reading experience with equal-quality paginated and scrolling modes. Experts build this as a client-side modular monolith around one immutable semantic document model—not as stored pages, CSS columns, canvas-rendered prose, or arbitrary saved HTML. Every durable concept (location, progress, selection, annotation) must use canonical source coordinates; pages are disposable outputs derived from content revision, viewport, typography, settled font metrics, assets, and algorithm version.

The recommended baseline is React 19, strict TypeScript 7, and Vite 8, with native semantic HTML/CSS, Dexie-backed IndexedDB, Zod boundary validation, and a project-owned pagination engine. Pretext 0.0.8 is promising only as an exactly pinned, replaceable text-measurement adapter after it passes real-DOM calibration across Chromium, Firefox, and WebKit. Build the semantic scrolling reader and stable locator contract before pagination; then add calibrated measurement, a pure terminating paginator, and the paginated projection. Keep scrolling continuously viable as both a user choice and an anchored failure path.

The chief risks are false layout certainty (fonts, canvas metrics, rich blocks, and cross-engine fragmentation), presentation coordinates leaking into persisted state, inaccessible duplicate/hidden page DOM, resize-driven thrash, and scope expansion into extraction or sync. Mitigate them with a representative fixture corpus, versioned normalization and layout keys, generation-stamped/cancellable layout jobs, explicit fragmentation and oversize policies, source-range invariants, one active semantic projection, and browser-plus-manual accessibility release gates. The milestone succeeds when reading remains complete, stable, operable, and recoverable—not merely when pages look plausible.

## Key Findings

### Recommended Stack

Use a static React/Vite application with strict domain boundaries. Browser primitives own font readiness, resize observation, text segmentation, selection capture, and layout truth; dependencies should reduce infrastructure work without owning the domain. Do not add SSR, a backend, global-state framework, component suite, or cloud service in this milestone.

**Core technologies:**

- **React + React DOM 19.2.8:** accessible reader shell and two projections over one model; keep versions identical.
- **TypeScript 7.0.2:** strict document, selector, measurement, page-map, and migration contracts.
- **Vite 8.1.5 + React plugin 6.x:** static client build; requires Node 20.19+ or 22.12+, with Node 22 LTS preferred.
- **Semantic HTML + authored CSS:** native structure, reading order, links, selection, zoom, focus, themes, and typography.
- **Project-owned paginator:** deterministic fragmentation, diagnostics, source ranges, forward progress, and fallback.
- **Dexie 4.4.4 + Zod 4.4.3:** versioned IndexedDB repositories and validation at fixture/persistence boundaries.
- **Pretext 0.0.8 (exact pin):** experimental plain-text fast path behind `TextMeasurer`; never the document, pagination, or annotation model.
- **Vitest 4.1.10 + Testing Library 16.3.2:** pure domain and semantic interaction tests.
- **Playwright 1.61.1 + axe-playwright 4.12.1:** authoritative cross-engine layout and automated accessibility checks, supplemented by manual AT testing.

### Expected Features

**Must have (prototype table stakes and core differentiators):**

- Curated normalized articles preserving headings, prose, links, lists, quotations, figures/captions, code, and footnotes.
- First-class semantic scrolling plus responsive pagination, explicit mode switching, and explained anchored fallback.
- Stable logical passage across resize, font settling/failure, typography changes, mode switches, and reopen.
- Typography controls for family, size, line height/spacing, measure/margins, and a limited theme set.
- Keyboard, pointer, touch, screen-reader, visible-focus, zoom/reflow, high-contrast, and reduced-motion operation.
- Quiet orientation/progress, metadata, and original-source access without treating page number as identity.
- Local highlights and notes with create/edit/delete/navigation, anchored by normalized position plus quote context.
- Versioned local persistence for preferences, progress, annotations, document identity, and migration behavior.
- Responsive, observable repagination with no omitted, duplicated, reordered, or silently clipped content.

**Should have after core validation (v1.x):**

- Heading/section navigator for reorientation.
- Optional line focus in both modes, off by default.
- Annotation review plus explicit orphan detection/repair.
- Evidence-based calm presets and richer themes.
- Portable local export/import and tester-facing layout diagnostics.

**Defer (v2+ or separate hypotheses):**

- Live extraction, extension packaging, remote/authenticated content, arbitrary HTML, and full-web rich content.
- Library/tag/search/offline product shell; EPUB/PDF/RSS/newsletter inputs.
- Read-aloud, translation, picture dictionary, and other learning aids.
- Accounts, cloud sync, collaboration, and conflict resolution.
- AI summaries/chat/recommendations, speed-reading modes, required animation, and medicalized accessibility claims.

### Architecture Approach

Adopt one-way data flow: validate saved fixtures into an immutable `NormalizedDocument` and canonical text index; derive constraints from viewport/settings/fonts/assets; measure; compute and validate a `PageMap`; then render either semantic scrolling content or semantic source slices. Renderers never define domain identity. Layout caches are generation-keyed and disposable; repositories persist only documents, preferences, stable locators, and selectors. A source locator such as `{documentId, revision, blockId, textOffset, affinity, quoteContext}` maps by adapters into either view.

**Major components:**

1. **Fixture/schema and normalization domain** — allowlisted semantic blocks, stable IDs/revisions, documented Unicode/whitespace/offset rules, canonical text index.
2. **Font/asset and constraint coordinators** — settled metric/dimension fingerprints, complete layout keys, invalidation, timeouts, and fallback state.
3. **Measurement adapters** — calibrated text measurement (optionally Pretext) plus DOM-authoritative non-text/rich-block measurement.
4. **Pure paginator and PageMap cache** — legal breaks, atomic/splittable/keep rules, termination, diagnostics, canonical ranges, invariant validation.
5. **Semantic scrolling and paginated renderers** — native markup over the same model, with only one active accessible projection.
6. **Reader shell and view/location adapters** — mode, settings, commands, navigation, focus, status, and source-locator preservation.
7. **Annotation service** — transient DOM selection conversion, position-plus-quote selectors, overlap projection, ambiguity/orphan handling.
8. **Repository boundary** — Dexie transactions, versioned migrations, coalesced writes, and explicit quota/corruption/upgrade states.

**Key patterns:** canonical source coordinates with disposable page coordinates; generation-stamped cancellable pagination; font state and asset dimensions in the full layout key; semantic projection first; atomic page-map swaps; previous valid view remains usable while reflowing; failure terminates into scrolling at the same locator.

### Critical Pitfalls

1. **Measuring a different font/layout than the browser renders** — await relevant font settlement, fingerprint actual metrics, calibrate against DOM, invalidate on late events, and preserve a source anchor during reflow.
2. **Assuming CSS columns or canvas widths are a complete paginator** — own semantic break rules, measure rich/atomic blocks, guarantee progress for oversize content, and verify canonical-text equality and overflow.
3. **Persisting page numbers, pixels, DOM paths, or live ranges** — version one canonical normalization space and store redundant position/quote/context selectors with explicit ambiguity/orphan states.
4. **Making visual pages the accessibility tree** — use native semantics and one active projection; keep measurement clones inert, IDs unique, focus predictable, and announcements restrained.
5. **Breaking reflow, zoom, spacing, or motion preferences** — preserve a full scroll mode, collapse chrome before prose, test narrow/high-zoom/forced-color cases, and default to instant motion-safe transitions.
6. **Layout thrash, observer loops, and stale commits** — batch reads/writes, observe a stable box, coalesce invalidations, cancel by generation, cache only with complete keys, and instrument worst-case articles.
7. **Testing appearance rather than correctness and interaction** — assert no loss/duplication/reordering, termination, selector round trips, focus, and location preservation in real browsers plus manual screen-reader testing.
8. **Expanding into the whole web too early** — enforce the curated normalized schema and defer extraction, sync, tables, math, embeds, and product-shell breadth until the engine gates pass.

## Implications for Roadmap

Research supports six phases. Preserve this dependency order even if phases are renamed: source identity precedes durable state; scroll accessibility precedes pagination; measurement precedes breaking; breaking precedes paginated interaction; annotations come after selector/location contracts but before final acceptance.

### Phase 1: Canonical Document and Verification Foundation

**Rationale:** Every renderer, locator, annotation, and layout invariant depends on a deterministic source model and representative corpus.
**Delivers:** React/Vite/TypeScript baseline; supported-content scope; Zod fixture schema; normalization/text index; stable IDs/revisions and selector types; representative fixtures; unit and Playwright harness.
**Addresses:** faithful structure, curated saved articles, provenance, stable identity.
**Avoids:** whole-web scope creep, unsafe HTML rendering, Unicode/offset drift, screenshot-only testing.

### Phase 2: Accessible Scrolling Reader and Local State

**Rationale:** Establish the always-usable semantic baseline and view-neutral coordinates before pagination can leak transient identity into the product.
**Delivers:** semantic scrolling renderer; calm shell and typography/theme/mode controls; keyboard/focus/reflow/reduced-motion contracts; location capture/restore; Dexie repositories and migrations.
**Addresses:** distraction-free view, scrolling mode, presentation adaptability, orientation, local preferences and resume.
**Avoids:** duplicate accessibility trees, page-number persistence, inaccessible fallback, ad-hoc storage.

### Phase 3: Measurement and Layout Foundation

**Rationale:** Font and rich-block geometry must be empirically trustworthy before a paginator or page UI can be judged.
**Delivers:** complete `LayoutKey`; font/asset coordinators; constraint builder; DOM reference measurer; Pretext adapter adoption gate; calibration corpus; generation cancellation, diagnostics, and performance instrumentation.
**Addresses:** responsive stability under viewport/font/typography changes.
**Avoids:** fallback-font boundaries, incomplete cache keys, observer loops, visible-DOM thrashing, premature Pretext dependence.

### Phase 4: Correct Pagination and Dual-Mode Navigation

**Rationale:** A pure, verified PageMap can be developed independently and then consumed by a semantic paginated projection without redefining content identity.
**Delivers:** fragmentation classes and oversize policy; pure terminating paginator; invariant-validated PageMaps; semantic page renderer; previous/next controls; explicit mode switching; source-anchor preservation and explained scroll fallback.
**Addresses:** predictable pagination, dual-mode parity, stable spatial orientation, progress.
**Avoids:** CSS-column reliance, hidden overflow, content loss/duplication, stale commits, focus loss, dead-end failure.

### Phase 5: Durable Highlights and Notes

**Rationale:** Annotation UI should consume the already-proven normalized selector and view-adapter contracts, not invent page- or DOM-specific persistence.
**Delivers:** selection-to-source mapping; position-plus-quote selectors; local create/view/edit/delete; highlights across inline/page fragments; return-to-passage; explicit ambiguous/orphan states.
**Addresses:** local highlights and attached notes, layout-independent resilience.
**Avoids:** serialized ranges/XPaths, grapheme corruption, silent reattachment, per-selection synchronous writes.

### Phase 6: Cross-Browser Accessibility and Performance Acceptance

**Rationale:** The product hypothesis is only proven across realistic content, engines, font states, viewports, accessibility settings, and interaction methods.
**Delivers:** Chromium/Firefox/WebKit matrix; cold/warm/failure font cases; rich-block and long-article stress; 320 CSS-pixel-equivalent reflow and high zoom; spacing/forced-color/reduced-motion checks; keyboard/touch/manual screen-reader scripts; explicit cold/warm budgets and release gates.
**Addresses:** technical prototype acceptance and trustworthy graceful degradation.
**Avoids:** one-browser confidence, axe-as-proof, latent content loss, inaccessible page/window rendering, unbounded repagination jank.

### Phase Ordering Rationale

- One canonical model and test corpus make source ranges, renderer parity, and no-loss assertions possible.
- Scrolling first guarantees a viable product and fallback while risky pagination work remains incomplete.
- Stable locators and repository contracts prevent page/DOM coordinates from entering durable state.
- Measurement calibration separates browser/font uncertainty from pagination-algorithm errors.
- Pure pagination before page UI makes termination and source-range invariants independently testable.
- Annotation behavior then projects through proven adapters, and final hardening validates all boundaries together.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3:** empirical Pretext suitability, font metric fingerprints, acceptable prediction tolerances, image readiness, and concrete performance budgets require project-specific experiments.
- **Phase 4:** exact fragmentation rules for lists, figures/captions, code, footnotes, widows/orphans, and oversize blocks require corpus-driven design and cross-engine evidence.
- **Phase 5:** normalization offset unit, grapheme-safe selection mapping, overlap semantics, and confidence thresholds for reattachment need explicit design decisions and tests.
- **Phase 6:** target browser/screen-reader combinations and manual acceptance protocol need definition with representative users or accessibility specialists.

Phases with standard patterns (research-phase can usually be skipped):

- **Phase 1:** React/Vite setup, discriminated schemas, validation, normalization golden tests, and fixture harness are well documented.
- **Phase 2:** native semantic rendering, CSS custom-property preferences, IndexedDB repositories, and basic accessible controls follow mature platform patterns; planning must still encode the accessibility contract.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core versions and platform/tool capabilities come from official docs/package metadata. Pretext's capability is known, but project fit remains MEDIUM pending calibration. |
| Features | MEDIUM-HIGH | Accessibility expectations are standards-backed and competitor baselines are current; prioritization and preference claims still need user validation. |
| Architecture | HIGH | Canonical-data direction, repository boundaries, semantic projection, and browser lifecycle patterns are grounded in primary specifications; exact pagination algorithm is MEDIUM. |
| Pitfalls | MEDIUM-HIGH | Failure modes follow specifications and established browser behavior; severity and browser/AT incidence require empirical testing on the selected matrix. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Pretext adoption threshold:** define eligible block/style/language combinations and tolerated line/boundary error against real DOM before enabling it as the fast path.
- **Browser and AT support matrix:** choose concrete OS/browser/screen-reader pairs; Chromium/Firefox/WebKit automation does not substitute for manual AT checks.
- **Normalization contract:** decide Unicode normalization, whitespace and non-text representation, offset unit, and grapheme policy before any persisted fixture or annotation ships.
- **Fragmentation policy:** specify breakability and fallback for nested lists, code, figures/captions, footnotes, long tokens, bidi/combining text, and blocks taller than a page.
- **Performance budgets:** set representative article lengths/devices and measurable cold/warm reflow limits; current research identifies risks but not product targets.
- **Pagination UX details:** validate progress language, automatic fallback messaging, focus behavior, and acceptable reflow feedback with target readers.
- **User-value validation:** technical reliability is the milestone gate; whether pagination, presets, or line focus improve calm/orientation remains a later user-research question.

## Sources

### Primary (HIGH confidence)

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and official WAI understanding/technique pages — keyboard, focus, reflow, spacing, motion, and evaluation expectations.
- [CSS Fragmentation Level 3](https://www.w3.org/TR/css-break-3/) — break opportunities, monolithic content, constraint relaxation, and UA discretion.
- [CSS Font Loading Level 3](https://www.w3.org/TR/css-font-loading/) and [CSS Fonts Level 5](https://www.w3.org/TR/css-fonts-5/) — readiness/events, fallback metrics, and invalidation concerns.
- [Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) and [Selection API](https://www.w3.org/TR/selection-api/) — persistent text selectors versus ephemeral live ranges.
- [Resize Observer specification](https://www.w3.org/TR/resize-observer/) — delivery lifecycle and observer-loop behavior.
- [IndexedDB 3.0](https://www.w3.org/TR/IndexedDB/) — structured local records, transactions, indexes, and upgrades.
- Official [React](https://react.dev/versions), [Vite](https://vite.dev/blog/announcing-vite8), [Dexie](https://dexie.org/docs/), [Pretext](https://github.com/chenglou/pretext), and [Playwright](https://playwright.dev/docs/browsers) documentation — selected stack capabilities and constraints.
- Official Firefox Reader View, Safari Reader, Microsoft Immersive Reader, Instapaper, and Readwise Reader documentation — current category baseline and competitor features.

### Secondary (MEDIUM confidence)

- [MDN FontFaceSet.ready](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready), [MDN CSS multicol](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_multicol_layout), and [MDN CSS fragmentation](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fragmentation) — browser-facing explanations requiring target-engine verification.
- [web.dev layout-thrashing guidance](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) — browser-vendor engineering advice on forced layout and DOM cost.
- Current npm package metadata for exact researched package versions — reliable as of the research date but subject to later updates.

### Tertiary (LOW confidence)

- None used as a basis for roadmap decisions. Product preference and comprehension effects remain unvalidated hypotheses rather than sourced claims.

---
*Research completed: 2026-07-26*
*Ready for roadmap: yes*
