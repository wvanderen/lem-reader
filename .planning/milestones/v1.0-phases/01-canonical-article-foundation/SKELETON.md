# Walking Skeleton — Lem Reader

**Phase:** 1
**Generated:** 2026-07-28
**Plans that complete the skeleton:** 01-01 (scaffold + frozen contracts) + 01-02 (repository + renderer + UI vertical). Plan 01-03 expands the skeleton's seed fixture into the curated corpus and adds e2e/a11y validation — it is the first refinement slice, not part of the skeleton itself.

## Capability Proven End-to-End

A reader can open one seed article from an in-memory `ArticleRepository` and read its semantic content rendered as native HTML (`<article>`, `<h1>`–`<h6>`, `<p>`, `<a>`, `<ul>`/`<ol>`, `<blockquote>`, `<figure>`/`<figcaption>`, `<pre><code>`, `<details>` disclosure), exercising the frozen Zod document model, the deterministic grapheme-cluster coordinate substrate, and hash-based two-view routing — the thinnest stack every later phase builds on.

## A3 Deviation — In-Memory Repository Satisfies the "DB Read/Write" Skeleton Requirement

The generic Walking Skeleton template calls for "one real DB read/write." CONTEXT.md decision **D-08** explicitly defers IndexedDB persistence to Phase 2; Phase 1 ships fixtures as bundled canonical JSON imported at build time and read through an in-memory `ArticleRepository`. **The skeleton's DB read/write line is therefore satisfied by the in-memory repository round-trip** (`listArticles()` → `openArticle(id)` → `CanonicalArticle` → `ArticleBody` render → re-validation through `ArticleSchema.parse` at module load), NOT by a Dexie round-trip.

The Dexie `version(1)` schema IS declared in `src/persistence/db.ts` (reserved slots: articles, settings, location, highlights, notes) so Phase 2 can swap the in-memory implementation for a Dexie-backed one behind the same `ArticleRepository` interface — a one-line provider change that does not touch the renderer, routes, or frozen contracts.

This deviation is flagged MEDIUM risk in RESEARCH.md Assumptions Log (A3) and resolved here. The orchestrator and all downstream phases treat the in-memory repository as the Phase 1 persistence seam.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | React 19.2.8 + React DOM 19.2.8, mounted via `createRoot` (client-only SPA) | STACK.md-locked; React is accessible when using native elements; client-only because the prototype has no server runtime |
| Build tooling | Vite 8.1.5 + `@vitejs/plugin-react` 6.x + TypeScript 7.0.2 (strict) | STACK.md-locked; Vite 8 is the React-recommended path (CRA sunset); Node 22 LTS required |
| Data layer | In-memory `ArticleRepository` (interface + `inMemoryRepository`); Dexie 4.4.4 `version(1)` schema RESERVED, not exercised in Phase 1 (D-08, A3 deviation above) | Keeps the persistence seam clean; Phase 2 swaps in Dexie behind the same interface |
| Validation | Zod 4.4.3 at every fixture boundary (`ArticleSchema.parse` at module load — fail-fast) | STACK.md-locked; runtime validation + inferred TS types in one source of truth; prevents malformed fixtures from becoming pagination/annotation bugs |
| Routing | Hash-based (`#/article/<id>`); no router library | A2 (LOW risk, planner's discretion); keeps dependency surface minimal; matches STACK.md "no premature abstractions" |
| Coordinate substrate | `Intl.Segmenter(lang, { granularity: "grapheme" })` over a deterministic `normalizeText(article)`; canonical offset = segment ordinal, NOT UTF-16 code-unit index | D-05 (locked); the durable contract Phase 2 (location) and Phase 5 (annotations) persist against |
| Identity model | Stable slug id (`/^[a-z0-9-]+$/`) + monotonic integer `revision` (D-06) | D-06 (locked); revision mismatch is detectable so saved locations/annotations can flag orphans (ANNO-07, STATE-01) |
| Styling | Authored CSS layers + CSS custom properties (D-07 warm-paper tokens); NO Tailwind, NO component suite, NO shadcn | STACK.md "What NOT to Use"; the reading surface depends on carefully controlled semantic markup and typography variables |
| Document model | Closed discriminated union of 9 block kinds (`z.discriminatedUnion("kind", [...])`); inline marks = {link, code, strong, em} (D-04) | O(1) parse dispatch + clean TS narrowing in the renderer; closed set keeps the coordinate substrate simple |
| Renderer | Recursive React component (`BlockView`/`ArticleBody`) emitting native semantic elements only; DOM reading order == `article.blocks` array order | DOC-02; native elements carry a11y semantics for free; no ARIA layer needed in Phase 1 |
| Testing | Vitest 4.1.10 (unit/component, jsdom for non-layout glue) + Playwright 1.61.1 (3-engine e2e) + @axe-core/playwright 4.12.1 (a11y) | STACK.md-locked; jsdom is NOT authoritative for layout — layout/reading-order/focus assertions run in Playwright |
| Deployment | Static SPA (any HTTPS host); Phase 1 local run via `npm run dev` on http://localhost:5173 | No server, no auth, no DB server; the prototype is a saved-article reader |

## Stack Touched in Phase 1

- [x] Project scaffold (Vite 8 + React 19 + TS 7, build, lint, test runner) — Plan 01-01 Task 1
- [x] Routing — hash-based two-view router (`#/article/<id>`) — Plan 01-02 Task 3
- [x] Database — at least one real read AND one real write — **satisfied by the in-memory `ArticleRepository` round-trip** (A3 deviation); Dexie `version(1)` reserved for Phase 2 — Plan 01-01 Task 2 + Plan 01-02 Task 1
- [x] UI — at least one interactive element wired to the repository — FixtureList "Open article" link → `openArticle(id)` → ArticleView render — Plan 01-02 Tasks 1+3
- [x] Deployment — documented local full-stack run command: `npm install && npx playwright install && npm run dev` serves http://localhost:5173 — Plan 01-01 Task 1

## Out of Scope (Deferred to Later Slices)

Anything NOT listed above is deferred. Be explicit — this prevents future phases from re-litigating Phase 1's minimalism:

- **Typography/theme controls + settings UI** → Phase 2 (READ-02, READ-03). Phase 1 ships ONE default theme (D-07 warm-paper) via CSS custom properties only.
- **Location restore + preference persistence** → Phase 2 (STATE-01, STATE-02, STATE-05). Phase 1 does not read or write through Dexie (D-08).
- **Real Dexie-backed repository** → Phase 2 swaps `inMemoryRepository` for a Dexie implementation behind the same `ArticleRepository` interface.
- **Pagination, measurement, Pretext fast path, dual-mode navigation** → Phases 3, 4. `@chenglou/pretext` is NOT installed in Phase 1.
- **Highlights and notes** → Phase 5 (ANNO-01…07). Phase 1 ships the `TextPositionSelector`/`TextQuoteSelector` types and the `deriveQuoteSelector` helper as substrate; `resolveQuoteSelector` (re-anchoring) is Phase 5.
- **Scrolling reader polish, progress indicators, calm status** → Phase 2 (READ-01, READ-04, READ-05).
- **Formal acceptance matrix (browser/OS/screen-reader combinations, performance budgets)** → Phase 6 (ACPT-01…04).
- **Live webpage extraction, browser-extension packaging, accounts/sync, EPUB/PDF/RSS** → Out of Scope per PROJECT.md.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2 — Accessible Scrolling Reader:** swaps `inMemoryRepository` for a Dexie-backed implementation (extends the reserved `version(1)` schema via `version(2)`); adds typography/theme controls, location restore, preference persistence, and the calm scrolling UX. Consumes the D-05 coordinate substrate for location anchoring.
- **Phase 3 — Trustworthy Layout Measurement:** adds the calibrated DOM measurer and (gated) Pretext fast path behind a `TextMeasurer` adapter. Consumes the frozen block model and the grapheme substrate.
- **Phase 4 — Responsive Pagination and Dual-Mode Navigation:** adds the project-owned pagination engine producing source-range page fragments over the same normalized document; preserves the canonical location through repagination.
- **Phase 5 — Durable Highlights and Notes:** consumes the `TextPositionSelector` + `TextQuoteSelector` substrate; implements `resolveQuoteSelector` for re-anchoring; persists highlights/notes through the reserved Dexie slots with revision-mismatch detection (ANNO-07).
- **Phase 6 — Prototype Acceptance:** proves the complete flow across the supported browser/OS/screen-reader matrix within explicit performance budgets.

## Frozen Contracts Phase 1 Owns (DO NOT mutate after Phase 1)

These are the irreversible seams. Changing them after Phase 1 ships corrupts every saved location and highlight:

1. **`ArticleSchema`** (src/content/schema.ts): the 9 block kinds, the 4 inline marks (D-04), the id/revision model (D-06), the URL scheme allow-list (Pitfall 5), the footnote id regex (Pitfall 4).
2. **`normalizeText` + `graphemeClusters`** (src/content/normalizeText.ts): the deterministic normalized-text algorithm (single `\n` block separator, ASCII-only whitespace collapse, footnote bodies after body blocks — Pitfall 3) and the grapheme-offset rule (canonical offset = segment ordinal, NOT `segment.index` — Pitfall 1).
3. **`TextPositionSelector` + `TextQuoteSelector` + `deriveQuoteSelector`**: the Phase 5 annotation anchoring substrate.
4. **Dexie `version(1)` schema** (src/persistence/db.ts): reserved slots; Phase 2 adds `version(2)`, never edits `version(1)` (Pitfall 9).
5. **Hash route contract**: `#/article/<id>` — consumed by deep links and Phase 2+ navigation.

---

*This SKELETON.md is the architectural backbone for every later vertical slice. Treat it as a contract, not a scratchpad. The A3 in-memory-repository deviation is the only intentional departure from the generic Walking Skeleton template and is documented above so Phase 2 knows exactly what to swap.*
