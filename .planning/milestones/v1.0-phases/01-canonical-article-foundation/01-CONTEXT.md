# Phase 1: Canonical Article Foundation - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the **canonical article foundation**: a normalized document model with one stable logical text-coordinate system, a curated saved-article fixture corpus, and a semantic renderer that opens articles and renders their structure in canonical order with provenance and an unsupported-content disclosure path.

It delivers DOC-01 through DOC-06:
- Open every article in a curated fixture set and identify title, metadata, original source (DOC-01, DOC-03).
- Render headings, prose, links, quotations, lists, figures, captions, footnotes, and code in canonical semantic order (DOC-02).
- Disclose unsupported fixture content instead of silently omitting it (DOC-06).
- Expose one stable logical text-coordinate system + stable article identity/revision for all later locations and annotations (DOC-04, DOC-05).

**Phase 1 does NOT ship** (deferred):
- Typography/theme *controls* and settings UI — Phase 2 (READ-02, READ-03). Phase 1 ships ONE default theme only.
- Scrolling reader polish, location restore, local-preference persistence — Phase 2.
- Pagination, measurement/Pretext, dual-mode navigation — Phases 3, 4.
- Highlights and notes — Phase 5.

The output of Phase 1 is the data + rendering foundation every later phase reads, paginates, annotates, and restores against.

</domain>

<decisions>
## Implementation Decisions

### Fixture Corpus
- **D-01:** The corpus is **~5-7 diverse real curated articles** spanning distinct publishing genres so each stresses different supported elements: a long-form essay (prose + blockquotes), a technical post (code blocks + inline code), a figure/photo-heavy piece, a footnote/academic piece, and a list-heavy reference. The set must include **at least one clear unsupported-content case** (e.g. an embedded video, table, or interactive element) to exercise the DOC-06 disclosure path.
- **D-02:** Articles are **real published long-form** (not synthetic), normalized into the canonical model. The provenance block shows the **real source URL, author, and publish date** (DOC-03). Sourcing/licensing is decided per-article during research.
- **D-03:** **Selection criteria are locked now; the researcher proposes a concrete candidate list for user approval before normalization.** The user does not pre-name specific articles. Criteria = the genre coverage in D-01, long-form length, real-element coverage, and ≥1 unsupported case.

### Canonical Content Model
- **D-04:** Inline formatting carries the **standard prose set**: links + inline code + `strong` + `em` (beyond links and inline code which are required). Strikethrough/sub/sup are NOT carried in Phase 1 (rendered/normalized away). This keeps the inline node model small and the text coordinate system simpler; can be extended later without breaking the coordinate contract.
- **D-05:** DOC-05's "one stable logical text coordinate system" counts in **grapheme clusters via `Intl.Segmenter`** (user-perceived characters; é, emoji, and a+combining-mark each = one position). Canonical offsets are over the **normalized text in document reading order** (single coordinate space; footnote body text participates in the stream at its reading-order position in the footnotes region). **Offsets are NOT raw JS string indexes / UTF-16 code units.** This is the durable contract Phase 2 (location) and Phase 5 (annotations) store against — hard to change later.
- **D-06:** Article identity (DOC-04) is **stable ID + monotonic revision integer**. Revision bumps whenever normalized content changes. Saved locations/annotations (later phases) record the revision they were made against so a mismatch is detectable (feeds ANNO-07 orphan path and STATE-01). Content-hash and semver identity were rejected.

### Default Visual Direction
- **D-07:** **Confirm the UI-SPEC's warm-paper booklike defaults** — this clears all three `⚠ default — review before executor` flags in `01-UI-SPEC.md`:
  - Body font family → serif stack (`'Iawan Old Style', 'Source Serif Pro', 'Source Serif 4', Georgia, Charter, 'Times New Roman', serif`).
  - Default palette → warm paper (`--surface #FBF8F3`, `--surface-raised #F2EDE3`, `--ink #1F1B16`).
  - Accent → warm brown (`--accent #6B4423`).
  This is the booklike hypothesis the product is testing. Phase 2 makes these user-adjustable; Phase 1 ships this as the single default theme. All other visual surface (spacing scale, 4-size/2-weight type scale, copywriting, interaction patterns, breakpoints) is locked by `01-UI-SPEC.md`.

### Fixture Delivery & Authoring
- **D-08:** Fixtures are **bundled canonical JSON imported at build time** (static import / fetch from `/public`). The open-article flow reads from an in-memory article repository. This is the simplest foundation for Phase 1; the Dexie schema may still be defined now so Phase 2 extends it, but fixtures are static assets versioned/diffed as code. (Dexie-seeded-on-first-run was considered and deferred — Phase 1 keeps the persistence seam clean rather than exercising IndexedDB for fixture reads.)
- **D-09:** Canonical JSON fixtures are produced by a **dev-time throwaway normalization script** that reads saved source HTML and emits the canonical JSON fixture, followed by **human review/correction**. The emitted JSON becomes the source of truth. This is NOT the live-extraction feature (explicitly Out of Scope) — it is a dev/authoring-time aid only. This gives the researcher an early read on real normalization friction before later phases.

### Agent's Discretion
- **Block taxonomy granularity / nesting, footnote internal model, Zod schema strictness, fixture file/repo layout:** left to the researcher and planner. The rendered block surface (h1–h6, p, a, ul/ol, figure/figcaption, blockquote, pre/code, footnotes region) is already locked by `01-UI-SPEC.md`; the internal data model that produces it is an implementation choice as long as it honors D-05's single coordinate space and D-06's identity model.
- **How unsupported runs are recorded in the fixture for the DOC-06 disclosure:** implementation detail — the disclosure MUST render inline at the canonical position per `01-UI-SPEC.md` §Interaction 3, but the fixture schema representation is the planner's call.
- **Repository interface shape:** whether to define the in-memory repository behind an interface now for a clean Phase 2 Dexie swap is a planner/architecture decision.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision, Core Value, Constraints, Key Decisions table, and Out-of-Scope list (defines "saved-article prototype" boundary and accessibility-first audience).
- `.planning/REQUIREMENTS.md` — full v1 requirement set; **DOC-01…DOC-06 are this phase's requirements** (§Document Foundation). §Traceability maps every requirement to its phase.
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, dependencies; roadmap-level decisions (one canonical coordinate system before durable location/pagination/annotation; semantic scrolling stays viable; calibrated measurement required before Pretext fast path).

### Stack & architecture authority
- `.planning/research/STACK.md` — locked stack decisions: React 19 + React DOM 19.2.8, TypeScript 7.0.2, Vite 8.1.5 + `@vitejs/plugin-react` 6.x (Node 22 LTS), Dexie 4.4.4, Zod 4.4.3, `@chenglou/pretext` 0.0.8 (Pretext is **Phase 3**, not Phase 1). Browser primitives including `Intl.Segmenter` (underpins D-05), `document.fonts.ready`, Selection/Range APIs, IndexedDB. **What NOT to use:** Tailwind/component suites/shadcn, CSS-columns-as-engine, page-number anchors, Redux/Zustand, DOM-emulators for layout truth.
- `AGENTS.md` — project instructions embedding the STACK.md content, conventions, architecture, and GSD workflow enforcement.

### UI design contract (Phase 1)
- `.planning/phases/01-canonical-article-foundation/01-UI-SPEC.md` — **UI design contract; MUST read before executor.** Locks: two screens (fixture list + article view) + unsupported-content disclosure; default typography (serif body, 4 sizes/2 weights); warm-paper color tokens + spacing scale (multiples of 4); copywriting contract (all microcopy); 7 interaction patterns (opening, links, disclosure, focus, reduced-motion, status, forced-colors); semantic component inventory; breakpoints; registry safety (zero third-party UI blocks). The three `⚠ default` flags are resolved by D-07 above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None.** Greenfield project — no `src/`, no `package.json`, no installed dependencies. Phase 1 sets up the project from scratch (Vite 8 + React 19 + TS 7 scaffold) per `.planning/research/STACK.md`.

### Established Patterns
- **None yet.** Patterns will be established here. STACK.md constraints that shape Phase 1 from day one: authored CSS layers + CSS custom properties (no Tailwind/shadcn); semantic HTML as the renderer with DOM reading order == document order; React state/context only (no external state library); Zod validation at every persisted/loaded boundary.

### Integration Points
- The **canonical document model + text-coordinate system** (D-04, D-05) and **identity/revision model** (D-06) are the integration seams every later phase depends on. Phase 2's location restore reads the coordinate system; Phase 5's annotations store offsets against it. Getting the model right here unblocks the roadmap.
- The **article repository** (D-08) is the seam Phase 2 will extend (in-memory now → Dexie-backed).

</code_context>

<specifics>
## Specific Ideas

- "Calm, booklike, low-distraction, print-like" is the guiding aesthetic — the warm-paper defaults (D-07) are the material expression of the booklike hypothesis the whole prototype exists to test. Do not regress toward neutral/generic chrome.
- Real provenance matters: the source-URL link in the article header must point at the article's real origin (DOC-03), reinforcing the "open this as a book" framing where the saved article carries its history.
- The dev-time normalization script (D-09) is intentionally throwaway — its purpose is to produce durable canonical JSON fixtures and to surface normalization friction early, not to become product code.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Items explicitly noted as belonging to later phases:
- Typography/theme *controls* + settings UI → Phase 2.
- Location restore + preference persistence → Phase 2.
- Pagination, measurement, Pretext fast path, dual-mode navigation → Phases 3, 4.
- Highlights and notes (which consume the D-05 coordinate system) → Phase 5.

</deferred>

---

*Phase: 1-canonical-article-foundation*
*Context gathered: 2026-07-28*
