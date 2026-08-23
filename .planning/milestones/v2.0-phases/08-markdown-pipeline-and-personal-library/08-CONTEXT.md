# Phase 8: Markdown Pipeline and Personal Library - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 is the **reader-facing surface** of v2.0 ingestion. It wraps a **personal library** around the already-working Phase 7 ingestion pipeline, and adds **Markdown** as the lowest-risk second intake format alongside HTML.

It delivers two parallel things:

1. **The personal library surface** (LIB-01..06) — replaces the flat fixture list with the default route of the app. Cards (calm minimal rows) show title + author + a per-row source indicator + a positional progress hairline; the reader can browse, open, read, remove, search, tag, filter by tag, see ingestion metadata (source URL + fetch date + open-original link), and see recently-read shortcuts.
2. **Markdown intake + HTML file-upload** (ING-03 + the ARCHITECTURE.md "HTML + Markdown Pipeline" framing) — `markdownToBlocks` is a new format adapter that returns the same Block-output contract as Phase 7's `htmlToBlocks`, validated by the same `ArticleSchema.parse` and gated by the same `assertRoundTripAnchor`. `.md` and `.html` file uploads extend the existing input-source-agnostic `IngestControl`.

**Phase 8 does NOT ship** (deferred to later phases):
- **PDF intake** (Phase 11) and **EPUB intake** (Phase 12) — the riskier multi-column / multi-chapter pipelines.
- **Export/import** (PORT-01..03) — Phase 9.
- **Annotation review panel** (RECV-01) — Phase 10.
- **POLISH-01/02 + NVDA+Firefox acceptance** — Phase 13.
- **Folders/collections hierarchy** — PROJECT.md defers; flat tags are the default organization.
- **Full-text search** across article bodies — FEATURES.md confirms table-stakes is title/metadata; full-text is a differentiator for a later phase.
- **Cover thumbnails / excerpt on cards** — deferred (kept the row calm-minimal; the schema does not preclude adding them later).
- **Multi-tag (AND/OR) filter query syntax** — single-tag chip filter only (matches "no query language" positioning).

**Load-bearing invariants (from ROADMAP.md + prior phases — do NOT re-ask):**
- The reading engine, pagination, annotation selectors, location store, and a11y surface **cannot tell a Markdown/HTML-uploaded article from a URL-ingested article or a v1.0 fixture**. Every Markdown upload that succeeds must round-trip `TextPositionSelector` + `TextQuoteSelector` → `confident`.
- **Save-once-read-forever + D7-07 dedupe-refuse** apply unchanged to Markdown/HTML-upload. Immutability preserved; re-ingest of identical content is refused with "Already in your library."
- **v1.0 fixture experience is the regression target.** Fixtures reappear in the library badged `source: "fixture"` (SC#1); no v1.0 e2e test regresses (SC#1).
- **The doc model IS the security boundary** (ING-07). `markdownToBlocks` output is plain Block JSON; React renders Block JSON, never HTML. Strict CommonMark is used for the Markdown path (raw HTML is escaped by the parser — no sanitizer needed for plain CommonMark, per ARCHITECTURE.md L344).

**Substrate already shipped by Phase 7 (pre-answered — do NOT re-ask):**
- **`/server/ingest.ts`** orchestrates the locked 7-stage pipeline (safeFetch → extractAndNormalize → slugifyUrl → ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence → stamp). Input is input-source-agnostic — `{url} | {html}`. Markdown adds a NEW adapter (`markdownToBlocks`) feeding the same orchestrator; `.html` upload feeds the existing `htmlToBlocks` via `input.html`.
- **`ArticleRepository` + `compositeLibraryRepository` + `DexieLibrarySource`** (`src/content/repository.ts`, `src/ingestion/LibrarySource.ts`) already implement `list/open` plus write-side `save/has/remove` with cascade-delete across articles + highlights + notes + location in one Dexie transaction. The library view consumes these unchanged.
- **`ArticleSchema` + `IngestionMetaSchema`** (`src/content/schema.ts`) — `source` enum currently `"fixture" | "url" | "paste"`. Phase 8 WIDENS the enum to add `"markdown"` (and the `"html-upload"` variant per ARCHITECTURE.md L390). The schema comments at schema.ts L205-207 explicitly anticipate this. `Provenance.sourceUrl` is already `.optional()` for paste and will be `.optional()` / absent for markdown (no canonical URL).
- **Dexie v3** (`src/persistence/db.ts`) already declares `source` + `addedAt` indexes on `articles` — sufficient for source-badge display + recently-added sort. A new per-article tag store (or tags denormalized onto the article row — researcher/planner decision) appends cleanly; no `version(N+1)` edit of shipped blocks (Pitfall 9).
- **`IngestControl`** (`src/ingestion/IngestControl.tsx`) — the minimal URL + paste-HTML form with `.status` live region + dedupe-refuse + four-state machine. Markdown/HTML-upload is a new input form on (or sibling to) this control.
- **`FixtureList`** (`src/routes/FixtureList.tsx`) — the transitional surface that Phase 8 REPLACES with `LibraryView` (or whatever the planner names it). Same hash route (`#/` default).
- **Phase 7 honest-failure catalog** (`src/ingestion/types.ts` `IngestionFailureReasonEnum` — 11 reasons). Markdown/upload refusals reuse this surface (e.g. `extraction-unsupported`, `already-in-library`, `unsupported-content-type`, `response-too-large`); the calm DOC-06 voice is locked (D7-04).
- **D-05 grapheme substrate + locationStore** (`src/persistence/locationStore.ts`) — already persists per-article `graphemeOffset`. The library's positional progress indicator + recently-read signal derive from this directly.
- **`ProgressHairline`** (Phase 02-03) — the inline `scaleX` hairline component used in ArticleView; the library row's per-article progress hairline reuses the same visual language.
- **Hash-based router** (`src/App.tsx`) — library stays the default route (list view at `#/`); article at `#/article/<id>`. No router library.

</domain>

<decisions>
## Implementation Decisions

### Carrying forward (locked by v1.0 + Phase 7 — do NOT re-litigate)

- **Doc model is the security boundary** — `markdownToBlocks` returns Block JSON; React renders Block JSON; `dangerouslySetInnerHTML` exists nowhere; DOMPurify runs only where raw HTML is actually parsed (the HTML paths).
- **One normalizer, one path** (Pitfall 2) — `markdownToBlocks` output feeds the SAME `normalizeText` + `deriveQuoteSelector` / `resolveQuoteSelector` modules the round-trip anchor gate calls. No Markdown-specific normalization fork.
- **Round-trip anchor gate applies to every Markdown/HTML-upload article** — `assertRoundTripAnchor` refuses entry on any sample that doesn't resolve to `confident`.
- **D7-07 save-once-read-forever + dedupe-refuse** — same id → "Already in your library" (no overwrite, no orphaned highlights).
- **Pitfall 9 (Dexie version discipline)** — append `version(N+1)` for any new stores/indexes (e.g. a tags store); never edit shipped v1/v2/v3 blocks.
- **Calm DOC-06/PAGE-09 voice** for all disclosure (D7-04) — refusals, low-confidence banners, empty states, "already in library." Zero new disclosure vocabulary.

### Library surface — card design & layout (LIB-01, LIB-05)

- **D8-01: Calm minimal row.** Each library row shows **title + author (when present) + a small per-row source indicator + a thin positional progress hairline when partially read**. NO excerpt, NO cover thumbnail, NO tag chips on the row itself (tags display on the card ONLY when present — see D8-06 below — but the row stays spare by default). Matches PROJECT.md's "calm reading-room shelf, not high-throughput triage queue" positioning and the current FixtureList's spare look.
- **D8-02: Inline per-row source indicator.** A small text/glyph next to the title: fixture / URL / paste / Markdown / HTML-upload. This is how SC#1 ("fixtures badged `source: \"fixture\"` alongside ingested articles") is satisfied — every row carries its origin visibly. (Filtering by source is NOT in Phase 8 scope; the inline indicator alone covers SC#1.)
- **D8-03: Default sort = recently-added descending.** Newest-added first (matches FEATURES.md "Sorted by saved-date-descending by default" + read-it-later convention). Fixtures, which predate any ingested article, sit at the bottom of the default sort. Recently-READ is a SEPARATE surface (D8-09), not the default sort.
- **D8-04: Calm empty state pointing at Add.** When there are no ingested articles AND no fixtures (rare — fixtures ship by default), show: *"Your library is empty. Paste a URL or upload a file to begin."* Mirrors the existing FixtureList "No articles yet" copy and the DOC-06 voice. (Once any article is present — fixture or ingested — the list simply shows it; no separate "starter samples" surface.)

### Library surface — tagging & search (LIB-03, LIB-04)

- **D8-05: Tag entry is on the article, not on the card.** Tags are edited in `ArticleView` (a small tag affordance in the reader chrome — exact mount point is planner). The library card only DISPLAYS existing tags as chips (when present). Keeps the calm minimal row uncluttered and matches Readwise/Hypothes.is "tag while reading" pattern. (Document-tags and highlight-tags remain separate namespaces per FEATURES.md L162 — Phase 8 ships document-tags only.)
- **D8-06: Search includes title + author + source domain/URL + tag names.** Tags are first-class searchable metadata — typing a tag name surfaces articles carrying that tag. SC#3 says "search by title and metadata"; tags ARE metadata. (Full-text search across article bodies is explicitly deferred — FEATURES.md L164.)
- **D8-07: Single-tag chip filter.** Tag chips appear above/beside the library list; clicking a chip filters the list to articles carrying that tag (one tag at a time, AND-style within a single tag). Matches "flat tags as default organization, no folder hierarchy, no query language" (PROJECT.md, FEATURES.md L168).
- **D8-08: Auto-prune empty tags.** A tag removed from (or no longer carried by) any article disappears from the filter chips automatically. No orphan-tag management surface. Tags exist only as long as they're applied — simplest model, matches "reader actually maintains" framing.

### Library surface — recently-read & progress (LIB-06)

- **D8-09: "Continue reading" strip above the list.** A distinct strip above the library list shows the 1–3 most-recently-OPENED articles that aren't finished. This cleanly separates SC#5's two signals: "recently-read shortcuts" = the strip; "default sort = recently-added" = the list. (Strip size cap — 3 vs 5 — is planner discretion; default toward the calm lower end.)
- **D8-10: "Recently read" = opened.** Opening the article (`ArticleView` mount) counts as recently-read; no scroll/turn required. Matches `locationStore` semantics (location is captured on mount and on turn/scroll). Fixtures and ingested articles both qualify for the strip.
- **D8-11: Per-article progress = hairline only.** A thin hairline along the row whose fill width = `graphemeOffset / total` (D-05 substrate). Reuses the v1.0 `ProgressHairline` visual language. NO percent text, NO three-state-only indicator (SC#5 asks for *positional* progress; the hairline carries the positional signal). Zero for unread; full for finished.
- **D8-12: Finished articles leave the strip, marked in the list.** Finished articles drop OFF the Continue-reading strip (the strip stays focused on unfinished work) but remain in the library list with a small "finished" indicator (filled hairline + a subtle mark — exact glyph is planner). The "finished" threshold (last page reached vs ~98% offset vs both modes paginated+scrolling) is researcher/planner.

### Library surface — remove (LIB-02)

- **D8-13: Cascade-remove is the existing `DexieLibrarySource.remove(id)`.** Already shipped (Phase 7 Plan 07-06). Removes the article + its highlights + notes + location in one Dexie transaction. SC#2 ("removal cascades to the article's highlights, notes, and position records") is satisfied by the existing implementation — the planner only needs to expose the affordance.
- **D8-14: Remove affordance placement + confirmation is planner.** Where the remove action lives (card-level affordance, ArticleView menu, or both) and whether a confirmation dialog gates it (cascade is destructive — every highlight/note/location is gone) are UI/planner decisions. The contract is: removal always cascades atomically (D8-13) and never silently. (Recommended: a confirmation for the destructive action, mirroring the WipeConfirm pattern from Phase 02-02 — Pitfall 8 spirit.)

### Markdown + HTML-upload pipeline (ING-03 + ARCHITECTURE.md "HTML + Markdown")

- **D8-15: Ship BOTH `.md` and `.html` file-upload in Phase 8.** ARCHITECTURE.md L344 + L1020 explicitly scope Phase 8 as "HTML + Markdown Pipeline." The Phase 7 server pipeline is already input-source-agnostic; `.html` upload feeds `input.html` straight through the existing `htmlToBlocks` + DOMPurify path (the same path paste-HTML uses today). `.md` upload adds the new `markdownToBlocks` adapter. Cost of `.html` upload is one extra file-picker `accept` extension. (The existing paste-HTML textarea stays — Phase 8 ADDS file-upload, does not remove paste.)
- **D8-16: Strict CommonMark for `markdownToBlocks`.** Use `remark`/`remark-parse` (unified collective — ARCHITECTURE.md L344, L1160 confirms remark 15.x is SOTA and well-typed) with **raw HTML blocks/inlines escaped by the parser** (CommonMark default behavior — no `allowDangerousHtml`). Zero XSS surface from the Markdown path; no sanitizer needed (mdast has no HTML by default). GFM raw-HTML-via-DOMPurify is explicitly REJECTED for Phase 8 (defers a power-user affordance to keep the security boundary clean). The adapter output is the same `{ blocks, footnotes, lang, provenancePartial }` shape as `htmlToBlocks`, validated by the same `ArticleSchema.parse`.
- **D8-17: Markdown provenance = front-matter then filename.** YAML front-matter (`title:` / `author:` / `date:`) → `Provenance.{title,author,publishedAt}` when present. When front-matter is absent, `Provenance.title` falls back to the filename (without the `.md` extension); other Provenance fields are omitted. `originalHtmlHash` becomes a SHA-256 of the `.md` source bytes (traceability preserved). NO "first image as cover" — figures stay in the document body (cover thumbnails are deferred per D8-01). `Provenance.sourceUrl` is absent (markdown uploads have no canonical URL, mirroring paste's `origin: "paste"` precedent).
- **D8-18: Markdown id = content-hash slug; dedupe-refuse on re-upload.** `id = "md-<shortHash(canonical content)>"` where the hash is over the normalized markdown source (mirrors the paste-`<hash>` pattern at `server/ingest.ts` L177 + `shortHash` L91-93). Two uploads of the same `.md` produce the same id → D7-07 dedupe-refuse ("Already in your library"). A renamed copy with identical content also dedupes (probably what the reader wants). Filename-slug and randomUUID are rejected (filename collides on common names; randomUUID breaks save-once).

### The Agent's Discretion

- **`markdownToBlocks` adapter internals** — the exact remark plugin set (CommonMark only vs CommonMark + GFM tables/task-lists/footnotes that DON'T introduce raw HTML), mdast-walk structure, and how `FootnoteReferenceBlock` ids are allocated (the `/^fn-\d+$/` regex is locked at schema.ts L115). The Block-output contract + strict-no-raw-HTML policy are locked (D8-16); the parser config is the researcher's.
- **Tag persistence shape** — denormalize tags onto the article row (additive field + Pitfall 9 .default([])) vs a separate `tags` Dexie store with `[articleId]` index vs a join table. The contract ("flat tags, document-tag namespace, auto-prune empties") is locked (D8-05..D8-08); the storage shape is researcher/planner.
- **"Finished" threshold** — last page reached (paginated mode) vs ~98% offset vs both. The "drop off strip, mark in list" behavior is locked (D8-12); the threshold mechanics across paginated + scrolling modes are researcher/planner.
- **Remove UX placement + confirmation design** — card-level trash, ArticleView menu, or both; confirmation dialog copy/shape. The cascade atomicity is locked (D8-13); the affordance is planner.
- **Continue-reading strip size cap** — 3 vs 5 articles; default toward the calm lower end.
- **Exact copy** for empty state, "finished" indicator label, remove confirmation — voice is locked (calm DOC-06); words are UI-SPEC/planner.
- **Upload control placement** — combined single "Add" affordance (URL/paste/upload in one control) vs three sibling forms vs a tabbed surface. The contract (all three input paths feed the same pipeline + dedupe-refuse) is locked; the layout is planner.
- **`ArticleSource` enum widening exact values** — research/planner proposes `"markdown"` + `"html-upload"` (or whatever naming the researcher validates against ARCHITECTURE.md L390); the contract (closed enum, additive widening) is locked at schema.ts L205-207.
- **File-size cap, multi-file upload, drag-drop** — researcher/planner. (Phase 7's content-length cap applies on the server side; the client upload path needs its own reasonable cap.)

### Folded Todos
*None — `todo.match-phase 8` returned no matches.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision; **Current Milestone: v2.0 Personal Library** section (target features, "Searchable list + tags as the default organization; folders/collections deferred," "v2.0 delivers cross-device highlights via versioned export/import instead" of accounts). Out of Scope (paywalled/auth content; accounts/cloud sync; browser-extension packaging; tables/interactive embeds/math). Key Decisions (#9 honest full-suite execution discipline governs the SSRF/mXSS CI matrices — continues to apply if any new server surface is added).
- `.planning/REQUIREMENTS.md` — **ING-03, LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06 are this phase's requirements** (§Ingestion + §Library). ING-03 = Markdown upload with YAML front-matter recognized as metadata. LIB-01 = library replaces fixture list; LIB-02 = open/read/remove with cascade; LIB-03 = search by title/metadata; LIB-04 = tag + filter by tag (flat tags, no folders); LIB-05 = ingestion metadata + link to original source; LIB-06 = recently-read + reading-progress. The Phase 7-validated requirements (ING-01/02/06/07/08) are the locked substrate that must not regress.
- `.planning/ROADMAP.md` — Phase 8 goal + 5 success criteria (library as default route with fixtures badged; open/read/remove cascade; search + tag + filter; Markdown upload with YAML front-matter; ingestion metadata + recently-read + positional progress). `**UI hint**: yes` (first UI-heavy v2.0 phase). Depends on Phase 7.

### v2.0 milestone research (THE architecture authority for this phase — READ ALL FOUR)
- `.planning/research/ARCHITECTURE.md` — **§Phase 8 — HTML + Markdown Pipeline + Library Surface** (L1020-1036: builds `LibraryView`, `LibraryCard`, `IngestArticleForm`, `markdownToBlocks`, `LibraryContext`, `compositeLibraryRepository`). **Pattern 3 — Per-Format Intake Adapters** (L337-350: Markdown uses `remark`/`remark-parse` 15.x, mdast node → Block kind is mechanical, NO sanitizer needed for plain CommonMark, route raw HTML through `htmlToBlocks` if allowed). The unsupported-content disclosure (DOC-06) is the shared failure substrate for every adapter. The `source` enum evolution L390 explicitly lists `"fixture", "url", "html-upload", "markdown", "pdf", "epub-chapter"` — Phase 8 widens with `"markdown"` + `"html-upload"`.
- `.planning/research/FEATURES.md` — **Feature Area 2 — Multi-format Document Intake** (§Markdown L84: filename-as-title, first-image-as-cover is deferred to figures-in-body for Phase 8). **Feature Area 3 — Personal Library** (L138-176: "calm library, not power-reader triage"; list view of saved items; calm empty state; title + metadata search is table stakes, full-text is a deferrable differentiator; tags as default organization; light-weight filtered views = NOT a query language; folders/collections explicitly rejected). **§Markdown front-matter support** (L104: small win for Obsidian/Standard Ebooks users). **§Edit-metadata panel** (L95) — deferred (Phase 8 does NOT ship manual metadata editing; markdown derives from front-matter/filename).
- `.planning/research/PITFALLS.md` — Pitfall 2 (normalization drift — `markdownToBlocks` MUST feed the same `normalizeText`; round-trip test every extracted article), Pitfall 4 (XSS via sanitizer misconfiguration — the Markdown path side-steps this by escaping raw HTML, but the HTML-upload path still goes through DOMPurify), Pitfall 9 (Dexie version discipline — Phase 8 may append `version(4)` for a tags store; never edit shipped v1/v2/v3 blocks).
- `.planning/research/STACK.md` — locked stack. **What NOT to use:** CRA, Tailwind/component suites, page-number anchors, Redux/Zustand, DOM emulators for layout truth. The Phase 8 library UI uses authored CSS + custom properties (no Tailwind); the tag/upload state uses React state/context (no Zustand).

### Prior-phase contracts this phase extends
- `.planning/phases/07-ingestion-substrate/07-CONTEXT.md` — **the Phase 7 decisions this phase builds on.** D7-01 (minimal proof form — Phase 8 wraps the library surface around the working ingest); D7-02 (composite library repository — already shipped, Phase 8 consumes); D7-03 (input-source-agnostic — Markdown/HTML-upload extend this); D7-04 (calm DOC-06 voice — locked); D7-07 (URL-slug + dedupe-refuse — D8-18 mirrors for markdown content-hash); D7-08 (optional sourceUrl + origin discriminator — markdown follows the paste precedent). The "load-bearing invariant" (ingested = fixture to the reading engine) applies identically to markdown uploads.
- `.planning/milestones/v1.0-phases/01-canonical-article-foundation/01-CONTEXT.md` — **D-05** (grapheme-offset coordinate — drives D8-11 progress hairline + D8-09 continue-reading); **D-06** (stable id + monotonic revision — markdown id derivation in D8-18 honors the `/^[a-z0-9-]+$/` regex); **D-08** (ArticleRepository — already swapped in Phase 7; Phase 8 consumes the composite).
- `.planning/milestones/v1.0-phases/02-accessible-scrolling-reader/02-CONTEXT.md` — D2-13 (StorageBanner / `.status` live region — library empty/error state reuses this voice); the ProgressHairline component precedent for the per-row progress hairline (D8-11).

### Source code contracts (READ before implementing)
- `src/content/schema.ts` — **the trust boundary.** `ArticleSchema`, `Provenance` (`sourceUrl` already `.optional()`), `BlockSchema` (9 kinds), `Mark` (4), `FootnoteBody` (`/^fn-\d+$/` regex). `ArticleSourceSchema` (L207: `"fixture" | "url" | "paste"`) — Phase 8 WIDENS this enum. `IngestionMetaSchema` (L215-223: `source` + `origin` discriminator + `originalHtmlHash` + `extractionConfidence`). Every markdown/uploaded article is `ArticleSchema.parse()`-validated.
- `src/content/repository.ts` — `ArticleRepository` interface + `compositeLibraryRepository` re-export + module-level `listArticles` / `openArticle` wrappers. Library view consumes these.
- `src/ingestion/LibrarySource.ts` — **`DexieLibrarySource`** (`list/open` + write-side `save/has/remove` with cascade) + **`compositeLibraryRepository`** (UNION of fixtures + ingested; ingested wins on id collision). Library view + tag store + remove affordance all build on this. `remove(id)` already cascades across articles + highlights + notes + location in one Dexie transaction (T-7-29).
- `src/ingestion/IngestControl.tsx` — the existing URL + paste-HTML form with `.status` live region + four-state machine + dedupe-refuse. Markdown/HTML-upload adds a new input form (or sibling control) reusing the same state machine + `mapReasonToCopy`.
- `src/ingestion/IngestionClient.ts` — the client wrapper that calls `POST /api/ingest`. Phase 8 adds `ingestMarkdown` / `ingestHtmlUpload` (or widens the existing envelope — researcher's call). The upload path needs a content-hash client-side OR the server computes the id (mirroring paste-`<hash>` at `server/ingest.ts` L177).
- `src/ingestion/types.ts` — `IngestionRequestSchema` (`{url} | {html}`) WIDENS to accept `{markdown}` / `{html}` from upload. `IngestionFailureReasonEnum` (11 reasons) — markdown/upload refusals reuse this catalog.
- `src/persistence/db.ts` — **Dexie v1/v2/v3 declaration blocks (Pitfall 9 — byte-unchanged).** Phase 8 may append `version(4)` to add a `tags` store (or tags denormalized onto `articles` via a `.default([])` field — researcher/planner). `articles` already has `source` + `addedAt` indexes (sufficient for D8-02 source indicator + D8-03 recently-added sort).
- `src/persistence/locationStore.ts` — persists per-article `graphemeOffset` (D-05). The progress hairline (D8-11) + recently-read signal (D8-09, D8-10) derive from this directly.
- `src/routes/FixtureList.tsx` — **the transitional surface Phase 8 REPLACES** with the library view (whatever the planner names it — `LibraryView`, `Library`, etc.). The hash route (`#/` default) stays; only the rendered component changes.
- `src/routes/ArticleView.tsx` — the existing reader route (unchanged for opening/reading). The tag-entry affordance (D8-05) mounts here.
- `src/App.tsx` — hash-based two-view router. Phase 8 keeps `View = { name: "list" } | { name: "article"; id }`; only the list-view component swaps.
- `server/ingest.ts` — the 7-stage pipeline orchestrator + `assertRoundTripAnchor` (the round-trip gate that applies to every markdown/uploaded article) + `shortHash` (the paste-`<hash>` pattern D8-18 mirrors for markdown ids).
- `server/htmlToBlocks.ts` — the HTML extraction + sanitize adapter. The `.html` upload path feeds `input.html` straight through this. The Markdown adapter `markdownToBlocks` is the NEW sibling returning the same `{ blocks, footnotes, lang, provenancePartial, isReaderable }` shape.
- `server/safeFetch.ts` — SSRF-safe fetch (used only by the URL path). Markdown/HTML-upload paths bypass `safeFetch` entirely (no fetch — the content is local); they reuse `extractAndNormalize`/`markdownToBlocks` + `ArticleSchema.parse` + `assertRoundTripAnchor` only.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`compositeLibraryRepository` + `DexieLibrarySource`** (`src/ingestion/LibrarySource.ts`) — the library view's data source. `list()` already UNIONs fixtures + ingested; `remove(id)` already cascades atomically. Library view + tag store + remove affordance consume these unchanged. A `tags` read/write surface is the one addition.
- **`IngestControl`** (`src/ingestion/IngestControl.tsx`) — the four-state form pattern (idle / submitting / success / error) + `.status` live region + `mapReasonToCopy` calm-voice mapping. The Markdown/HTML-upload control reuses this exact state machine; only the input widget changes.
- **`ProgressHairline`** (Phase 02-03, `src/reader/`) — the inline `scaleX` hairline used in ArticleView. The library row's per-article progress hairline (D8-11) reuses the same visual language; the planner extracts or generalizes it for the row context.
- **`locationStore`** (`src/persistence/locationStore.ts`) — per-article `graphemeOffset`. The progress hairline fill width + continue-reading strip membership derive from this directly. No new persistence needed for the progress signal.
- **`Provenance.sourceUrl` `.optional()` + `IngestionMeta.origin` discriminator** — the paste path's "no canonical URL" precedent (D7-08). Markdown uploads follow the same pattern (`sourceUrl` absent, `origin: "upload"` or similar — researcher confirms naming).
- **`shortHash` + paste-`<hash>` id pattern** (`server/ingest.ts` L91-93, L177) — D8-18's `md-<shortHash(canonical content)>` mirrors this directly.
- **DOMPurify + `htmlToBlocks` + `extractAndNormalize`** (`server/htmlToBlocks.ts`) — the `.html` upload path feeds `input.html` straight through this unchanged (the paste-HTML path already proves it works).
- **Zod-at-boundary** (everywhere) — `ArticleSchema.parse` is the gate; every markdown/uploaded article is validated before it enters the library. The `source` enum widening is a single schema edit.

### Established Patterns
- **Zod-at-boundary validation** — every markdown/uploaded article is `ArticleSchema.parse()`-validated on the server AND on Dexie read (STATE-04).
- **Round-trip anchor test** — `assertRoundTripAnchor` gates every markdown/uploaded article before it enters the library (SC#1 / Pitfall 2).
- **Pitfall 9 (Dexie version discipline)** — append `version(N+1)` for any new stores/indexes; never edit shipped v1/v2/v3 blocks.
- **React state/context, no Redux/Zustand** — library view state + tag state flow through React context/local state; Dexie is the persistence seam.
- **Authored CSS + custom properties, no Tailwind** — the library chrome + cards inherit existing tokens.
- **`.status` live region for consequential events** (A11Y-08) — upload refusals + "Fetching article…" announce here.
- **Exhaustive block-kind switch, no default** (Pattern F) — `markdownToBlocks` mdast walker maps onto the 9 kinds via the same exhaustive discipline; anything unmappable → `UnsupportedBlock` with a `plainDescription` (DOC-06).
- **Calm DOC-06/PAGE-09 voice** for all disclosure (D7-04) — zero new vocabulary.
- **Playwright across Chromium/Firefox/WebKit for truth** — library e2e tests + Markdown round-trip corpus tests extend this discipline.

### Integration Points
- **`LibraryView`** (`src/routes/`, NEW — replaces `FixtureList`) — default route at `#/`. Renders Continue-reading strip (D8-09) + tag chips (D8-07) + search box (D8-06) + library list (D8-01..D8-04) + Add control. Consumes `compositeLibraryRepository`.
- **`markdownToBlocks`** (`server/markdownToBlocks.ts`, NEW) — sibling of `htmlToBlocks`. Returns `{ blocks, footnotes, lang, provenancePartial, isReaderable }` (the same shape `server/ingest.ts` consumes). Uses `remark`/`remark-parse` with strict CommonMark (raw HTML escaped).
- **Upload input form** (extension of `IngestControl` or sibling, NEW) — file-picker `accept=".md,.html"`; reads file text client-side; POSTs to `/api/ingest` with `{markdown}` or `{html}` (envelope widened in `src/ingestion/types.ts`).
- **Tag entry affordance** (in `ArticleView`, NEW) — small tag edit UI in the reader chrome; writes to a tag store (TBD shape — researcher/planner).
- **`src/content/schema.ts`** — `ArticleSourceSchema` enum widened (`"markdown"`, `"html-upload"`); `IngestionMetaSchema.origin` widened (`"upload"`).
- **`src/persistence/db.ts`** — possible `version(4)` append for a `tags` store (or tags denormalized — researcher's call).
- **`server/ingest.ts`** — pipeline orchestrator extended to dispatch `{markdown}` → `markdownToBlocks` (vs `{html}` → `extractAndNormalize`, vs `{url}` → `safeFetch` + `extractAndNormalize`). `id` derivation branches: url→slugifyUrl, paste/html-upload→`paste-<shortHash>`, markdown→`md-<shortHash>`.
- **`src/App.tsx`** — list-view component swaps from `FixtureList` to `LibraryView`; everything else (hash router, View type, mode-toggle bridge) unchanged.

</code_context>

<specifics>
## Specific Ideas

- **"Calm reading-room shelf" is the load-bearing metaphor.** The library is NOT a Pocket/Feedly-style high-throughput triage queue. Every visual decision (minimal row, single-tag chip filter, no full-text search, no folders, no query language, no cover thumbnails, no excerpt, hairline-only progress) follows from this. If a future phase proposes adding dashboard-style chrome, that decision should re-litigate this positioning, not silently accrete.
- **Tags are the reader's own organizing gesture, not a system-imposed taxonomy.** Auto-prune (D8-08) means tags only exist as long as they're useful. No "managed tag set" surface; no tag colors; no batch operations in Phase 8. The reader applies tags while reading (D8-05), not while browsing.
- **The Continue-reading strip + per-row hairline together carry the SC#5 signal.** The strip = "what was I just reading"; the hairline = "how far through each one did I get." Both derive from the D-05 grapheme substrate via `locationStore` — no new persistence.
- **Markdown is the lowest-risk intake format** (ARCHITECTURE.md L344): well-typed AST, no sanitizer needed for strict CommonMark, mechanical mdast→Block mapping. Phase 8 ships it alongside HTML-upload specifically because the risk profile is LOW — not because Markdown is a reader-facing differentiator. The reader-facing differentiator in Phase 8 is the LIBRARY; Markdown just makes the intake story two-format instead of one.
- **The doc model is the security boundary — even for Markdown.** Strict CommonMark means raw HTML is escaped by the parser; React renders Block JSON, never HTML. There is no path from a `.md` upload to script execution in Phase 8. (If a later phase enables GFM raw-HTML, it MUST route through DOMPurify + `htmlToBlocks` — that decision re-opens the sanitization surface deliberately, not silently.)
- **SC#1 ("no v1.0 e2e test regressing") is the regression bar.** The fixture experience — read, paginate, annotate, restore location — must feel identical before and after Phase 8. The library view swapping in at `#/` is the only reader-visible change for v1.0-only users, and even that should feel like the same surface, calmer.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases (confirmed, not new):
- **PDF intake** — **Phase 11** (ING-04).
- **EPUB intake** (book grouping) — **Phase 12** (ING-05).
- **Export/import bundles** — **Phase 9** (PORT-01..03).
- **Annotation review panel** — **Phase 10** (RECV-01).
- **POLISH-01/02 + NVDA+Firefox acceptance** — **Phase 13** (POLISH + ACPT-05/06).
- **Cover thumbnails / excerpt on cards** — deferred per D8-01 (kept the row calm-minimal; the schema does not preclude adding them in a later phase).
- **Full-text search across article bodies** — FEATURES.md L164 confirms this is a differentiator for a later phase; Phase 8 ships title/metadata/tag search only (D8-06).
- **Multi-tag (AND/OR) filter query syntax** — Phase 8 ships single-tag chip filter only (D8-07); saved quick-filters / query syntax are a later-phase differentiator (FEATURES.md L168).
- **Folders/collections hierarchy** — PROJECT.md defers; flat tags are the default.
- **GFM raw-HTML in Markdown** — Phase 8 ships strict CommonMark (D8-16). If a later phase enables GFM raw-HTML, it MUST route through DOMPurify + `htmlToBlocks` deliberately.
- **Edit-metadata panel** — FEATURES.md L95; not in Phase 8 (markdown derives metadata from front-matter/filename; manual editing is a later-phase surface).
- **Manual tag management / batch operations / tag colors** — Phase 8 ships auto-prune flat tags only.
- **Image proxying/rehosting / first-image-as-cover for Markdown** — deferred (figures stay in body).
- **Drag-drop + multi-file upload** — Phase 8 ships single-file picker (`accept=".md,.html"`); drag-drop is a later-phase gesture.
- **Library-footer stats ("47 articles • ~12 MB")** — FEATURES.md L166 differentiator; not in Phase 8.

</deferred>

---

*Phase: 8-markdown-pipeline-and-personal-library*
*Context gathered: 2026-08-12*
