# Phase 12: EPUB Intake - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 adds **EPUB as the fifth and final intake format** (ING-05). A reader
uploads a DRM-free EPUB; `epubToBooks` unzips it (fflate), reads the OPF
manifest/spine + nav (EPUB 3) or NCX (EPUB 2), and normalizes each logical
chapter's XHTML through the SAME jsdom + DOMPurify `htmlToBlocks` path as URL
extraction. Each chapter becomes an ordinary `CanonicalArticle`
(`source: "epub-chapter"`) under a thin `Book` record (Option A). Chapters
paginate, annotate, and restore location identically to every other article;
the library shows an expandable book grouping; cross-chapter navigation and
book-level progress work; reopening a book resumes the last-read chapter.

**Phase 12 does NOT ship** (deferred):
- **Reader-internal book TOC panel** — the library's expandable book grouping
  is the chapter-jump surface for v2.0 (D12-06); the in-reader navigator
  ships with ORNT-01 (future).
- **Cover image + in-chapter image assets** — text-first like PDF (D12-16);
  Phase 9's bundle format anticipated asset entries for a later phase.
- **Per-chapter tags** — tags live on the Book record only (D12-04).
- **EPUB → Markdown conversion / re-highlighting into EPUB** — FEATURES
  anti-features (L237-238); highlights export via the Phase 9 template.
- **Accounts/cloud sync** — PROJECT.md Out of Scope (carried).

**Load-bearing invariants (locked — do NOT re-ask):**
- **Option A book shape** — one article per chapter + thin `Book` record
  (ARCHITECTURE Pattern 4: Option A CHOOSE; B compound-coordinates and C
  flatten REJECTED). Locked in ING-05 + ROADMAP SC#1.
- **Substrate byte-stable** — the 9-kind Block model, grapheme-offset
  anchors, pagination engine, location/highlight/note schemas are untouched;
  a chapter IS an article to the reading engine (SC#2, Pitfall 6).
- **epub.js never enters the app** — it is a renderer, not a parser (Pitfall
  6); the parser is isolated behind the `epubToBooks` adapter so the
  dependency can be swapped (SC#4). `epub2` REJECTED (unmaintained — STACK.md
  L131 "do not pick for new v2.0 work").
- **Chapter XHTML sanitizes through the shared DOMPurify pipeline** (Pitfall
  6 mitigation 3) — same mXSS discipline as URL extraction (ING-07).
- **Round-trip anchor test gates every admitted chapter** (SC#4) — the
  5-offset `assertRoundTripAnchor` gate from Phase 7.
- **DRM-locked EPUBs refuse honestly** — detect ADEPT/FairPlay/LCP markers,
  refuse with a calm typed reason (FEATURES L96).
- **Zip Slip guard on every EPUB archive entry** (Pitfalls L339/L352/L365) —
  the Phase 9 guard discipline applied to the EPUB zip.
- **Publisher CSS ignored** — reader typography always wins (FEATURES
  anti-feature L115; Apple Books/Calibre both override).
- **Server-side parsing** on the `/api/ingest` Vite-Node-middleware host
  (Phase 7 HYBRID CONTINGENCY; Phase 11 precedent); `source: "epub-chapter"`
  widening anticipated at `src/content/schema.ts:205`.
- **Save-once + dedupe-refuse** — book/chapter ids derive from content hash
  (the `pdf-<shortHash>` / `md-<shortHash>` precedent); re-upload of
  identical bytes → "Already in your library."
- **Calm DOC-06 typed refusals** for DRM-protected, corrupt, non-EPUB,
  oversized files (D7-04 discipline).

</domain>

<decisions>
## Implementation Decisions

### Carrying forward (locked by Phases 7/8/9/11 — do NOT re-litigate)

- Doc model is the security boundary — chapter XHTML → DOMPurify → Block
  JSON; React renders Block JSON; `dangerouslySetInnerHTML` exists nowhere.
- The 7-stage orchestrator (`server/ingest.ts`) gains a fifth Stage-1 branch
  (`{epub, filename?}`); stages 2+ (ArticleSchema.parse →
  assertRoundTripAnchor → deriveConfidence → stamp) run per chapter
  unchanged.
- Pitfall 9 (Dexie version discipline) — the `books` store is an ADDITIVE
  v5 block; shipped version blocks byte-unchanged; new stores start empty.
- Books + chapter articles travel in the Phase 9 export bundle (Pattern 7's
  table lists books YES when present; `src/portability/bundle.ts:14` already
  documents the absence as the forward-compatible form).

### Book UX in library

- **D12-01: Expandable + Resume book row.** Collapsed row: book
  title/author + book-level progress hairline + a Resume action that opens
  the last-read chapter. Expanding reveals chapter sub-rows reusing the
  LibraryRow anatomy (SourceBadge, per-chapter progress hairline, open
  affordance). No new route — SC#1's "book grouping with expandable chapter
  articles" read literally; one calmer library, not a book-detail surface.
- **D12-02: Continue-Reading strip shows ONE book-level entry per
  in-progress book** — "BookTitle — Chapter 4 of 12" resuming the last-read
  chapter. Chapters never double-list individually; standalone articles
  unchanged.
- **D12-03: Book progress = chapters-finished ratio.** Chapters with a
  location ÷ total admitted chapters; "finished chapter" = location at ≥98%
  of chapter text (the Phase 8 finished-state convention). Chosen over
  length-weighted: derivable from existing LocationRecords with zero new
  measurement, no flicker as locations settle.
- **D12-04: Tags live on the Book record; search matches both.** Tagging a
  book tags the whole book (tag filter surfaces the book row, not 40 chapter
  rows); library search matches book title AND chapter titles (LIB-03/04
  reuse — "search the essay I read in that essay collection" works).

### Chapter flow & TOC

- **D12-05: Next-chapter is an end-of-chapter affordance, not persistent
  chrome.** A calm "Next chapter" link/button appears at the very end of a
  chapter (last paginated page / scroll end), keyboard-reachable, in both
  modes; previous-chapter reachable from chapter start. No permanent
  prev/next chapter controls — the page-turn spatial model and the calm
  chrome stay undisturbed.
- **D12-06: The library's expandable book grouping IS the TOC for Phase
  12** — jump-to-chapter happens there (current chapter marked via its
  hairline). No reader-internal TOC panel; that ships with ORNT-01. Pitfall
  6's "300-page book with no way to jump chapters" warning is satisfied by
  the library surface.
- **D12-07: Resume = last-read chapter by savedAt.** The chapter whose
  LocationRecord has the latest `savedAt` within the book wins — exactly
  where the reader last was, even mid-chapter or re-skimming earlier.
  Identical semantics to per-article restore (chosen over
  ARCHITECTURE's first-unfinished sketch: predictability beats
  read-in-order assumptions). Satisfies SC#3's reopen-resume criterion.
- **D12-08: A chapter context line in the reader header** — small, calm
  "Book Title · Chapter 4 of 12" for epub-chapter articles only (ordinary
  articles unchanged). No book-progress indicator inside the reader
  (progress lives on the library row).

### Chapter admission

- **D12-09: TOC-driven chapters.** The book's own navigation document
  (nav.xhtml, NCX fallback) declares the logical chapter unit; spine items
  mapping to the same TOC entry MERGE into one article (handles publisher
  chapter-splitting); fallback to one-article-per-spine-item when no TOC
  mapping derives. "Chapter 4 of 12" matches the book's own chapter count —
  publisher intent preserved (Pitfall 6's core concern).
- **D12-10: Skip non-content spine items.** Spine items with no readerable
  text (cover page, nav document, pure-image plates) are excluded from the
  chapter list — they are not reading units and not failures. Front matter
  WITH real text (foreword, copyright) stays. Reuses the `isReaderable`
  admission algebra (the 11-07 relaxed form).
- **D12-11: Skip + disclose per book.** A chapter that fails extraction or
  the round-trip anchor gate is skipped and DISCLOSED — a calm note in the
  book grouping ("2 chapters could not be read"); the rest of the book
  enters. The whole EPUB refuses only when ZERO chapters admit (ING-06
  whole-document refusal). Never silently missing, never silently broken.
- **D12-12: Calibration mirrors the D11-04/05/06 discipline, scoped to
  EPUB.** Real EPUBs stay local + gitignored; a committed MANIFEST
  (filename + SHA-256 + expected shape: DRM-free class, chapter structure,
  TOC-vs-spine divergence) + committed derived evidence replay in CI;
  synthetic EPUB fixtures (self-verifying generator, 11-01 precedent)
  committed for code paths. CI absence fails honestly ("calibration
  requires the local corpus — see docs").

### Parser dependency

- **D12-13: fflate reads the EPUB zip.** Reuse the in-tree fflate 0.8.3
  (already unzips the Phase 9 import bundle — same archive-entry surface,
  same Zip Slip guard). Zero new zip deps; JSZip stays REJECTED (D9-02 size
  rationale supersedes STACK.md's pre-fflate JSZip pick).
- **D12-14: fast-xml-parser for XML manifests; chapters ride the existing
  path.** container.xml / OPF / NCX / nav parse via fast-xml-parser
  (STACK.md's deliberate pick); chapter XHTML goes through the EXISTING
  jsdom + DOMPurify `htmlToBlocks` pipeline (slightly-malformed XHTML
  tolerated exactly like URL extraction). epub2 REJECTED (unmaintained).
- **D12-15: fast-xml-parser gets the unpdf treatment** — exact-pinned
  version, legitimacy evidence recorded in a phase approval doc
  (maintainer, weekly downloads, dependency count, advisory check), and
  USER sign-off as a blocking gate before it lands (the 11-01 precedent).
- **D12-16: Text-first; images deferred.** In-chapter images →
  `UnsupportedBlock` with alt/plainDescription where available (the PDF
  precedent); no cover image in the library; no asset extraction. The
  annotation/location/pagination contracts stay trivially intact; Phase 9's
  bundle format anticipated asset entries for a later phase.

### the agent's Discretion

- **Chapter/article id scheme** — `epub-<shortHash>`-derived per-chapter ids
  (planner confirms exact shape; must dedupe-refuse identical re-uploads at
  the book level per the D7-07 precedent).
- **`BookSchema` exact Zod shape** — `{id, title, authors, chapterArticleIds
  [], …}` per ARCHITECTURE L405 sketch; researcher confirms fields
  (publisher/date/identifier optional).
- **TOC-merge algorithm** — how nav labels map to spine ranges (href
  matching, nested TOC flattening depth); EPUB 3 nav-over-EPUB 2 NCX
  precedence rules.
- **DRM marker detection specifics** — which files/signatures constitute
  ADEPT (META-INF/encryption.xml), FairPlay, Readium LCP evidence
  (FEATURES L96 names the classes; the detection list is researcher's).
- **EPUB size/time limits** — EPUB_MAX_BYTES, chapter-count cap, extraction
  timeout mirroring PDF_MAX_BYTES/PDF_EXTRACTION_TIMEOUT_MS (11-01
  precedent: one shared constant, three enforcement points).
- **New failure-reason granularity** — `epub-protected` / `epub-corrupt` /
  `epub-empty` etc. typed members + calm `mapReasonToCopy` strings (the
  discipline is locked; the enumeration split is researcher's).
- **Expand/collapse interaction details** — chevron vs row-click, animation
  (must satisfy reduced-motion), aria-expanded semantics.
- **End-of-chapter link anatomy** — exact placement per mode (after last
  page content / scroll end), copy, focus behavior.
- **Export bundle version bump** — how books ride the bundle
  (schemaVersion 2 vs additive optional field); the D9-04
  higher-version-refusal gate must keep older bundles importable
  (researcher confirms; Pattern 7's `books` optional field anticipated this).
- **Review panel / highlights-export interaction with books** — chapters are
  articles so the panel works as-is; whether rows carry a book-title prefix
  is planner's.
- **Book-level cascade semantics** — removing a book removes its chapters
  (highlights/notes/locations cascade per the Phase 8 transaction
  precedent); confirmation copy is planner's.

### Folded Todos
*None — `todo.match-phase 12` returned no matches.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 12 goal + 4 success criteria (book
  grouping Option A with expandable chapters; chapters identical to other
  articles incl. two-mode reading; cross-chapter nav + book-level progress +
  reopen-resume; adapter isolation, no epub.js renderer, anchor gate per
  chapter). `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — ING-05 (this phase's requirement, §Ingestion
  L16 — Option A wording is normative); ING-06/07/08 locked substrate.
- `.planning/PROJECT.md` — v2.0 milestone framing ("EPUB's multi-chapter
  book shape … riskier pipelines"); Out of Scope (accounts/sync; full-web
  compatibility).

### v2.0 milestone research (THE architecture authority)
- `.planning/research/ARCHITECTURE.md` — **Pattern 4 — EPUB Multi-Chapter as
  Book Container (L359-419)**: Option A CHOOSE (B/C rejected), `BookSchema`
  sketch L405, library-UX guidance L419, "EPUB ingestion reuses the HTML
  pipeline" L383. Pattern 3 (L337-355) adapter table. L346 epub2 row
  (unmaintained; isolate behind adapter). Dexie sketch L430-469 (`books`
  store, `bookId` index, additive v-block). File tree L174
  (`server/epubToBooks.ts`). `listByBook` repository method L501.
- `.planning/research/PITFALLS.md` — **Pitfall 6 (L182-210): EPUB treated as
  one article** — epub.js is a renderer not a parser; parse OPF+spine+nav
  directly; sanitize chapter XHTML through the shared pipeline; warning
  signs include "no TOC/chapter navigation." Pitfall 11 (L332-365): **Zip
  Slip applies to EPUB** (L339, L352, L365). Pitfall 1 (L18-35): new block
  shapes from real content → overflow-guard trip discipline. Pitfall 2
  (L43-62): one shared normalizer. Pitfall 12 (L372-392): off-main-thread /
  server-side heavy parsing; per-chapter pagination boundary (L431).
  Decision table L402/L417/L429/L431/L448/L460.
- `.planning/research/FEATURES.md` — §Feature Area 2 (L73-134): EPUB
  expectations row (L85), format detection (L93), OPF metadata (L94),
  **DRM-free-only honesty (L96 — ADEPT/FairPlay/LCP detection)**, two-mode
  chapter-granularity differentiator (L102), chapter-as-navigation-unit
  (L103), anti-features: force-flatten (L112), **EPUB CSS pass-through
  (L115)**, EPUB→Markdown conversion (L116), OPF/EPUB-fragment export
  (L237).
- `.planning/research/STACK.md` — §7 EPUB Parsing (L65-72): JSZip +
  fast-xml-parser pick + the multi-chapter doc-model flag; rejected list
  L131-133 (epub2 unmaintained, @gxl/epub2 deleted, epubjs wrong shape);
  L181-182 upload-path sequence.

### Prior-phase contracts this phase extends
- `.planning/phases/07-ingestion-substrate/07-CONTEXT.md` — D7-03
  (input-source-agnostic pipeline), D7-04 (calm DOC-06 voice), D7-07 (id
  derivation + dedupe-refuse), D7-08 (origin discriminator); ingested =
  fixture invariant; assertRoundTripAnchor gate.
- `.planning/phases/08-markdown-pipeline-and-personal-library/08-CONTEXT.md`
  — D8-16/17/18 (adapter purity, title chain, content-hash ids); library
  surface contracts (LIB-01..06) Phase 12's book grouping extends.
- `.planning/phases/09-versioned-export-import/09-CONTEXT.md` — D9-01 (ZIP
  bundle forward-compat with book/asset entries), D9-02 (fflate REJECTED
  JSZip — D12-13 cites), D9-14 (skip-by-default conflict semantics for
  imported books).
- `.planning/phases/11-pdf-intake/11-CONTEXT.md` — D11-04/05/06 (corpus
  discipline D12-12 mirrors), D11-07 title-chain shape (EPUB has rich OPF
  metadata — the chain is shorter), resource-limit precedent, adapter
  precedent (`pdfToBlocks`).

### Source code contracts (READ before implementing)
- `server/ingest.ts` — the 7-stage orchestrator; fifth Stage-1 branch;
  per-chapter id/title derivation; IngestionError → typed reason.
- `server/htmlToBlocks.ts` — **the chapter normalization path** (jsdom +
  DOMPurify, Option A per 07-04); `epubToBooks` calls it per chapter.
- `server/pdfToBlocks.ts` + `server/markdownToBlocks.ts` — the adapter
  precedents (pure, filename-agnostic, `{blocks, footnotes, lang,
  provenancePartial, isReaderable}` output contract).
- `server/limits.ts` — cap constants the EPUB path extends.
- `src/ingestion/types.ts` — `IngestionRequestSchema` widens with an
  `{epub, filename?}` variant; `IngestionFailureReasonEnum` gains EPUB
  members.
- `src/content/schema.ts` — L204-216 `ArticleSourceSchema` anticipated
  `"epub-chapter"` widening; `BookSchema` lands here; `UnsupportedBlock`
  destination for images.
- `src/persistence/db.ts` — additive version block with `books` store +
  `bookId` index (ARCHITECTURE L458 sketch; Pitfall 9).
- `src/ingestion/library/LibraryView.tsx`, `LibraryRow.tsx`,
  `ContinueReadingStrip.tsx`, `libraryFilter.ts`, `SourceBadge.tsx` — the
  grouping UI D12-01..04 extend.
- `src/routes/ArticleView.tsx` — chapter context line (D12-08) +
  end-of-chapter link (D12-05) mount points.
- `src/persistence/locationStore.ts` — book resume derivation (D12-07) +
  book progress derivation (D12-03).
- `src/portability/bundle.ts` — L14 documents the books-absence contract
  Phase 12 fills; ExportBundleSchema widening.
- `tests/e2e/calibration/` + Phase 11's PDF calibration harness — the
  evidence-replay shape D12-12 mirrors.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`server/htmlToBlocks.ts`** — chapter XHTML normalization is a CALL, not
  a build: same DOMPurify/mXSS surface, same block coercion as URL
  extraction (ARCHITECTURE L383: "EPUB ingestion reuses the HTML pipeline").
- **`fflate` 0.8.3 in-tree** — already unzips import bundles; the EPUB
  container is the same primitive + the same Zip Slip guard requirement.
- **7-stage orchestrator** — EPUB supplies Stage 1 + book/chapter assembly;
  validation, anchor gate, confidence, stamping are reuse.
- **`isReaderable` admission algebra** (11-07 relaxed form) — D12-10's
  non-content skip reuses it.
- **Phase 11 calibration harness** — manifest + gitignored corpus +
  committed evidence + honest CI-absence failure: D12-12's template.
- **LibraryRow / SourceBadge / hairline / ContinueReadingStrip** — chapter
  sub-rows and the book resume entry compose these.
- **`locationStore` + Phase 8 finished-state (≥98%) convention** — book
  progress and resume derive from existing rows.
- **Dexie transaction cascade** (`DexieLibrarySource.remove`) — book-removal
  cascade precedent.

### Established Patterns
- Additive enum/schema widening (`"epub-chapter"` anticipated at
  `schema.ts:205`); Pitfall 9 version-block discipline for the `books`
  store.
- Typed failure catalog + calm DOC-06 copy + `.status` live region.
- Content-hash ids + dedupe-refuse (`pdf-`/`md-`/`paste-` precedents).
- Exact-pin dependency with legitimacy evidence + user sign-off (11-01
  unpdf gate → D12-15 fast-xml-parser).
- Zod-at-boundary; server-only parser deps never enter the client bundle
  (dist/ grep discipline).
- Playwright honest full-suite gates; calibration-before-promotion.

### Integration Points
- `server/epubToBooks.ts` (NEW) — the adapter: unzip (fflate) → parse
  container/OPF/nav|NCX (fast-xml-parser) → DRM check → TOC-driven chapter
  assembly (D12-09) → per-chapter htmlToBlocks → Book + chapter articles.
- `server/ingest.ts` — fifth Stage-1 branch; book-level dedupe.
- `src/ingestion/types.ts` + `src/content/schema.ts` — request variant,
  `"epub-chapter"` source, `BookSchema`.
- `src/persistence/db.ts` — additive `books` store (+ `bookId` index).
- `LibraryView` — expandable book grouping + continue-strip book entries +
  book hairline; `ArticleView` — context line + end-of-chapter link.
- `src/portability/bundle.ts` — books/chapters in export + import conflict
  surface.
- EPUB calibration harness (NEW) + synthetic fixture generator (NEW).

</code_context>

<specifics>
## Specific Ideas

- **"Chapter 4 of 12" must match the book's own chapter count.** The
  TOC-driven merge (D12-09) exists so the number the reader sees corresponds
  to the printed TOC of the book they hold — publisher intent is the unit
  of truth, the spine is an implementation detail.
- **The calmest possible chapter navigation.** One affordance, exactly
  where it's needed (end of chapter), keyboard-reachable, no permanent
  chrome (D12-05) — the page-turn spatial model that defines the product is
  never competed with.
- **Honesty at chapter granularity, not book granularity.** A book with 2
  broken chapters is still a readable book (D12-11) — disclosure lives in
  the book grouping; only an entirely unreadable EPUB refuses. This extends
  the tri-state ethos to the book container.
- **fflate-over-JSZip is a settled size argument.** D9-02 already rejected
  JSZip on bundle size; STACK.md's EPUB row predates fflate's arrival in
  the tree. D12-13 is the application of an existing decision, not a new
  library war.

</specifics>

<deferred>
## Deferred Ideas

- **Reader-internal book TOC panel** — ships with ORNT-01 (heading/section
  navigator, future requirement); the library grouping covers v2.0
  (D12-06).
- **Cover image + in-chapter image asset extraction** — text-first this
  phase (D12-16); Phase 9's ZIP bundle format anticipated asset entries for
  a later milestone.
- **Per-chapter tags / TagEntry on chapter rows** — tags are book-level
  (D12-04); per-chapter organization is a future library-extension item.
- **Length-weighted book progress** — revisit only if the chapters-finished
  ratio proves misleading in practice (D12-03).
- **EPUB → Markdown intake conversion, OPF/EPUB-fragment export** — FEATURES
  anti-features (L116, L237).
- **Polish (POLISH-01/02) + NVDA acceptance (ACPT-05/06)** — Phase 13.
- **Book-internal search / full-text search** — library-level search story
  (Future: Library extended).

</deferred>

---

*Phase: 12-epub-intake*
*Context gathered: 2026-08-17*
