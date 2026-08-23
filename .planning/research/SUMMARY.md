# Project Research Summary

**Project:** Lem Reader v2.1 Reader Experience
**Domain:** Accessible, local-first read-it-later library and long-form reader refinement
**Researched:** 2026-08-23
**Confidence:** HIGH for integration direction; MEDIUM-HIGH overall because image transport and cross-page selection remain open

## Executive Summary

Lem Reader v2.1 is a cohesion and fidelity milestone, not a reading-engine rewrite. Experts would build these improvements by preserving the product's canonical semantic document model, article-global grapheme coordinates, local-first repositories, and paired paginated/scrolling renderers, then adding a deliberate application shell and small domain projections around them. The recommended implementation retains React, TypeScript, Dexie, the existing ingestion pipeline, and native browser semantics; no new runtime dependency is justified.

The roadmap should establish contracts before surfaces: centralize route/focus/history behavior and reading-state derivation, then build the shared shell, Library and Highlights destinations, focused Add workflow, and metadata overlay. Reader orientation and annotation improvements should derive from canonical headings and global offsets rather than rendered DOM or page numbers. The final polish is cross-cutting: shared gutters, overlays, controls, reflow, focus, and assistive-technology behavior must be validated as each feature lands and again at milestone acceptance.

The largest risk is source imagery. Live publisher URLs violate the local-first privacy and portability expectations and can destabilize pagination; controlled local assets require SSRF-safe secondary fetches, strict format/byte/pixel quotas, intrinsic geometry, Dexie asset lifecycle, and versioned bundle support. This decision needs a dedicated research/spike gate before implementation. Cross-block highlights are architecturally compatible with the existing selector record, but cross-engine endpoint mapping and selections across unmounted paginated pages require explicit scope and corpus proof. Never guess at annotation attachment, mutate canonical identity for metadata edits, or let visual polish weaken accessibility and stable orientation.

## Key Findings

### Recommended Stack

Retain the current stack and extend existing seams. The requested work is domain logic, semantic UI, and boundary hardening—not a reason to introduce a router, component suite, positioning framework, annotation framework, or extraction engine. Use native links and landmarks for destinations, native dialog behavior for focused modal workflows, native selection/range APIs as ephemeral input, and real-browser tests as layout truth.

**Core technologies:**

- **React + React DOM 19.2.8:** shared shell, route surfaces, reader controls, dialogs, and TOC—retain the static SPA architecture.
- **TypeScript 7.0.2:** typed route grammar, metadata overlays, figure/assets, heading indexes, selection capture, and migration contracts.
- **Canonical `Block` model + browser DOM APIs:** one semantic source for figures, headings, normalized locations, and annotation ranges.
- **Dexie 4.4.4 + Zod 4.4.3:** append-only persistence migrations and runtime validation for metadata and any future image assets.
- **Readability 0.6.0 + jsdom + DOMPurify:** preserve and normalize supported figures/captions at ingest; never raw-render source HTML.
- **Vitest + three-engine Playwright/axe:** unit/property/corpus coverage plus authoritative browser layout, focus, selection, zoom, and accessibility checks.

Critical compatibility requirements: keep React/React DOM versions identical; append rather than rewrite Dexie v1-v5; validate figures and persisted edits at boundaries; retain Chromium, Firefox, and WebKit coverage. Pretext remains an internal text-measurement adapter and does not solve figure layout.

### Expected Features

**Must have (v2.1 table stakes):**

- First-class Library, Highlights, and Reader destinations with coherent headers, titles, focus, history, and return context.
- Derived Unread, In Progress, Finished, and All library views using one documented progress policy.
- Focused Add to Library flow covering all existing formats with progressive disclosure and honest recovery.
- Editable display title and author without changing content identity, provenance, progress, or annotations.
- Highlights as a genuine review workspace with consistent gutters and reliable jumps to context.
- Correctly anchored tag controls, a truthful reading-width slider, and non-shifting resume feedback.
- Heading-derived semantic TOC with canonical destinations in both reading modes.
- Safely ingested source images with real figure/caption/alternative semantics and stable pagination.
- One durable cross-block highlight rendered as multiple fragments while retaining one note and identity.
- Continuous UI/accessibility audit across reflow, zoom, forced colors, reduced motion, keyboard, touch, and screen readers.

**Should have after baseline validation:**

- Manual reading-state overrides and bulk state changes if derived state proves confusing.
- Reliable active-section TOC tracking and remembered panel state.
- Image storage/cache controls if local assets materially consume storage.
- Saved/custom library views only after the three core views prove insufficient.

**Defer beyond v2.1:**

- Bionic reading, Spritz/RSVP, speed scoring, streaks, or gamification.
- Disjoint/concatenated highlights and explicit orphan-anchor repair workflows.
- Accounts, cloud sync, RSS, recommendations, AI summaries, read-aloud, and full-web fidelity.

### Architecture Approach

Add an explicit shell and small pure projections around the stable reading engine. Routes own navigation/focus policy; repositories own validated persistence; presentation resolvers combine immutable canonical content with user metadata; heading and reading-state indexes remain derived; annotation capture converts DOM endpoints immediately into the existing global normalized stream. The normalized article remains the only rendering and security boundary.

**Major components:**

1. **Typed route grammar and `AppShell`:** Library, Highlights, Add, and Reader destinations; global versus contextual controls; history, title, and focus policy.
2. **Library projections:** one `deriveLibraryState` policy plus search/tag filtering and preserved return context.
3. **Focused ingestion surface:** progressive UI over the existing client and guarded pipeline, without duplicating format validation.
4. **Metadata repository and presentation resolver:** optional title/author overrides keyed by stable article ID, included in versioned export/import.
5. **Heading index and reader-location adapter:** canonical heading entries and mode-independent TOC navigation; no persisted pages or DOM targets.
6. **Selection capture and highlight interval rendering:** one global selector with multiple block-local fragments and honest eligibility/resolution.
7. **Image ingestion/asset boundary:** typed figures, controlled transport, intrinsic geometry, failure state, persistence, and portability.
8. **Shared UI primitives:** containers/gutters, header variants, anchored overlays, contextual settings, responsive panels, and geometry-free resume cue.

### Critical Pitfalls

1. **Images bypass privacy/security:** never reopen saved articles against live third-party image URLs; fetch through SSRF-equivalent controls, sniff allowlisted raster formats, enforce byte/pixel/count budgets, and reference controlled assets.
2. **Images destabilize pagination:** reserve verified geometry, treat figure/caption atomically, integrate decode with layout readiness and stale-job cancellation, and preserve canonical location through controlled repagination.
3. **Cross-block selection corrupts anchors:** persist one half-open article-global grapheme range with quote context; define separator and eligibility rules and render derived fragments without nearest-match guessing.
4. **Metadata edits corrupt identity:** store plain-string presentation overrides separately, append Dexie migrations, migrate/import atomically, and prove IDs, hashes, provenance, and selectors remain unchanged.
5. **SPA polish disorients non-visually:** distinguish destination changes from reader-location and UI-state changes; set titles/landmarks/focus/history intentionally and preserve Library filters/scroll on return.
6. **Derived views contradict each other:** consolidate the existing finished-ratio fork before tabs, reuse one projection for rows/books/counts/search/export, and persist source facts rather than duplicate buckets.
7. **Overlay/reflow fixes regress accessibility:** anchor to trigger viewport geometry, clamp/flip on invalidation, restore focus, and validate every route at 320 CSS px and 400% zoom.

## Implications for Roadmap

Based on the combined research, use eight dependency-aware phases. The roadmapper may combine adjacent low-risk phases, but must not fold the image contract into generic UI polish or build state/metadata UI before their domain contracts.

### Phase 1: Contract Consolidation and Regression Harness

**Rationale:** New navigation and library views would otherwise amplify existing forks and untested assumptions.
**Delivers:** Typed hash-route grammar; explicit transition categories; one reading-state/progress policy including book aggregation; baseline corpus for figures, heading targets, selection endpoints, and existing accessibility invariants.
**Addresses:** Library state foundations and route correctness.
**Avoids:** Contradictory reading states, indiscriminate focus resets, and regressions hidden by selective tests.

### Phase 2: Application Shell and Information Architecture

**Rationale:** Shared shell, containers, and overlay behavior must precede page-by-page redesign.
**Delivers:** First-class Library/Highlights/Reader navigation; clickable brand/home behavior; contextual reader controls; consistent page headers/gutters; preserved return context; anchored tag popup; corrected reading-width slider.
**Addresses:** SPA coherence, Highlights discoverability, header/back alignment, contextual controls, and immediate UI defects.
**Avoids:** Disorienting hash navigation, duplicated landmarks, per-page gutter drift, offscreen overlays, and zoom/reflow failures.

### Phase 3: Library Organization and Focused Add Workflow

**Rationale:** With route and state contracts stable, the landing experience can become task-focused without forking ingestion logic.
**Delivers:** Unread/In Progress/Finished/All views with counts and empty states; coherent Continue Reading treatment; focused source-choice/input/result Add flow for all existing formats; predictable success and cancel behavior.
**Addresses:** Haphazard dashboard organization and permanent ingestion-form clutter.
**Avoids:** Content appearing lost between views, accidental state movement, swallowed refusal reasons, lost input, duplicate submissions, and broken dialog focus.

### Phase 4: Editable Metadata and Portability

**Rationale:** Persistence, projection, deletion, and conflict semantics must exist before readers can create edits.
**Delivers:** `ArticleMetadataRecord`, append-only Dexie migration, repository and presentation resolver, title/author editor, search/display integration, cascade deletion, versioned export/import and conflict preview.
**Addresses:** Repair of poor extracted title/author metadata.
**Avoids:** Mutated content identity, diverging labels across views, lost overrides, and unsafe migration of existing local libraries.

### Phase 5: Reader Orientation and Table of Contents

**Rationale:** Stable route and reader-location contracts make canonical heading navigation implementable without DOM scraping.
**Delivers:** Deterministic heading index and IDs; semantic labeled TOC; scrolling and paginated navigation parity; responsive disclosure/dialog behavior; reliable focus and optional current-location state.
**Addresses:** Navigable heading-derived table of contents and calm orientation.
**Avoids:** Duplicate/stale targets, invented heading hierarchy, page-number persistence, focus trapping, and panel-induced location shifts.

### Phase 6: Cross-Block Annotation Substrate

**Rationale:** Capture, separator semantics, eligibility, rendering, review, and deletion must ship as one logical annotation contract.
**Delivers:** Endpoint-aware DOM-to-canonical mapping; supported-boundary matrix; forward/reverse multi-block capture; one stored selector with multiple render fragments; atomic note/review/edit/delete behavior; export/import and re-anchor regression proof.
**Addresses:** Continuous highlights across supported adjacent semantic blocks.
**Avoids:** DOM/per-block persistence, fragmented notes, partial deletion, Unicode/whitespace drift, and silent nearest-match attachment.

### Phase 7: Safe Image Fidelity and Pagination

**Rationale:** This phase depends on an explicit image-transport decision and touches ingestion, security, storage, export, rendering, and layout readiness.
**Delivers:** Representative extraction corpus; local controlled asset contract if privacy/offline portability is promised; redirect/DNS/type/quota enforcement; semantic figure/caption/alt rendering; intrinsic geometry; stable broken/oversize fallbacks; image-aware pagination and portability.
**Addresses:** Meaningful original images and captions across supported formats.
**Avoids:** Tracking requests on reopen, SSRF, unsafe decoders, missing exported media, blank/broken figures, and image-driven page drift.

### Phase 8: Resume Treatment and Integrated Acceptance

**Rationale:** The resume treatment depends on final shell geometry, and the complete system needs an explicit cross-feature quality gate.
**Delivers:** Geometry-free saved-location cue with unobtrusive undo/start-over action; Impeccable-informed visual consistency pass; full unit/migration/property/corpus suite; three-engine layout and axe tests; keyboard, reduced-motion, forced-colors, 400% zoom/reflow, NVDA+Firefox, and VoiceOver+Safari protocols.
**Addresses:** Intrusive “You left off here” behavior and milestone-wide polish.
**Avoids:** Replacing one obstruction with another, cosmetic-only acceptance, obscured focus, and regressions between reading modes.

### Phase Ordering Rationale

- Consolidate route, progress, and test contracts before UI surfaces depend on them.
- Establish shell/layout/overlay primitives once, then reuse them in Library, Highlights, Add, TOC, and metadata workflows.
- Keep storage migrations ahead of editable surfaces and keep canonical projections ahead of navigation or annotation UI.
- Separate cross-block annotations and images because both are high-risk canonical-boundary changes with distinct corpora.
- Put image work after a policy spike but before final acceptance; it must not be treated as renderer-only polish.
- Treat accessibility and visual quality as phase-local acceptance throughout, with Phase 8 as integration verification rather than the first audit.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 6 — Cross-Block Annotation Substrate:** research/experiment on cross-engine endpoint mapping and decide whether v2.1 includes a deliberate extend-across-unmounted-pages interaction. Multi-block selection within the mounted surface is settled; cross-page extension is not.
- **Phase 7 — Safe Image Fidelity:** mandatory research/spike before planning implementation if offline/private images are promised. Decide controlled asset transport, raster allowlist, quotas, Blob/object-URL lifecycle, EPUB handling, and bundle limits.
- **Phase 4 — Metadata and Portability:** a short planning decision is needed for import conflict precedence and whether clearing author means an explicit empty override or removal of the override.
- **Phase 5 — TOC:** decide tolerant visual treatment of skipped heading levels; the canonical-source and native-navigation approach is settled.

Phases with standard patterns (skip research-phase):

- **Phase 1:** pure route/progress consolidation and test harness over inspected code.
- **Phase 2:** semantic shell/navigation, shared containers, native links, and trigger-rect overlay positioning are well documented.
- **Phase 3:** progressive disclosure over an existing ingestion pipeline and native dialog/route focus contracts are established.
- **Phase 8:** implementation audit against explicit acceptance matrices; no new architecture research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct code inspection plus official React, browser, Readability, Dexie, W3C, and testing sources support retaining the stack with no new runtime dependency. |
| Features | MEDIUM-HIGH | Milestone scope comes directly from confirmed user feedback and standards/competitor patterns; exact reading-state defaults need product validation. |
| Architecture | HIGH | Existing global offsets, figure model, renderer, repositories, and hash routes provide the necessary seams; integration boundaries are well evidenced. |
| Pitfalls | MEDIUM-HIGH | Primary standards/security guidance is strong; pagination × image decode and cross-engine multi-block selection remain empirical. |

**Overall confidence:** MEDIUM-HIGH

### Settled Recommendations

- Preserve the existing stack and reading-engine contracts; add no router, component suite, annotation framework, or extraction engine.
- Use one typed application shell and distinguish route, reader-location, and UI-state transitions.
- Derive library state, heading indexes, and page locations rather than persisting them.
- Store metadata as separate reader-owned overrides.
- Keep one article-global selector for cross-block highlights.
- Build TOC from canonical headings and render native labeled navigation.
- Never bypass the canonical ingest boundary or render arbitrary source HTML.

### Gaps to Address

- **Image delivery promise:** choose controlled local assets versus explicitly limited remote references. Recommendation: controlled local assets for saved content so reopen is private, offline-stable, and portable; if schedule cannot support that contract, reduce v2.1 image scope honestly rather than hotlinking.
- **Image policy numbers:** determine supported raster formats and byte, pixel, count, animation, decode, and bundle limits through a representative corpus spike.
- **Cross-page selection:** native selection cannot cross unmounted paginated pages; decide whether v2.1 guarantees only continuous ranges present in one mounted surface or adds an explicit extend interaction.
- **Selection boundary matrix:** define captions, code, lists, blockquotes, footnotes, and non-text gaps before implementation.
- **Reading-state edge cases:** specify accidental opens, reopened finished articles, zero-length/unsupported content, and EPUB book/chapter aggregation; defer manual overrides unless required.
- **Metadata conflicts:** decide import/re-ingestion precedence, timestamps, and explicit-clear semantics.
- **TOC malformed hierarchy:** preserve source levels but define tolerant indentation for skipped levels and duplicate headings.

## Sources

### Primary (HIGH confidence)

- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — global text position/quote selectors and normalized range semantics.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [WAI navigation landmarks](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html) — focus, reflow, landmarks, and native navigation.
- [W3C Digital Publishing ARIA `doc-toc`](https://www.w3.org/TR/dpub-aria-1.0/#doc-toc) — TOC structure and purpose.
- [Mozilla Readability](https://github.com/mozilla/readability/blob/main/README.md) and its [official figure fixture](https://github.com/mozilla/readability/blob/main/test/test-pages/dev418/expected.html) — extraction behavior, URL resolution, figure preservation, and external sanitization requirement.
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — redirect, DNS, special-address, and metadata-service defenses.
- [Dexie upgrade documentation](https://dexie.org/docs/Version/Version.upgrade%28%29) — append-only transactional migration behavior.
- Lem Reader source and `.planning/PROJECT.md` — canonical blocks, grapheme offsets, annotation resolution, pagination, ingestion, persistence, and confirmed v2.1 needs.

### Secondary (MEDIUM confidence)

- [MDN HTML images](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/HTML_images), [`HTMLImageElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement), and [Referrer Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy) — dimensions, decode/loading, failure, and privacy behavior.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) — focus containment/return and responsive disclosure behavior.
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) — automated coverage and need for manual/browser supplementation.
- Readwise Reader and Instapaper official documentation — contemporary library, Add, metadata, Highlights, and TOC product patterns.

### Tertiary / Validation Required

- No low-confidence external recommendation is adopted. Product-specific thresholds, image quotas, and cross-page annotation interaction require implementation-phase validation.

---
*Research completed: 2026-08-23*
*Ready for roadmap: yes, subject to explicit image-delivery and cross-page-selection scope decisions*
