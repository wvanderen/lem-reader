# Roadmap: Lem Reader

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-08-10) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v2.0 Personal Library** — Phases 7-13 (in progress — planning)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-08-10</summary>

Six vertical slices that keep a usable semantic reader available while progressively proving the riskier booklike experience: canonical article identity, an accessible scrolling reader with recoverable local state, browser-faithful measurement, correct responsive pagination and dual-mode navigation, durable annotations through the shared coordinate model, and full prototype acceptance across the supported browser and accessibility matrix.

- [x] **Phase 1: Canonical Article Foundation** (5/5 plans) — completed 2026-07-29
- [x] **Phase 2: Accessible Scrolling Reader** (4/4 plans) — completed 2026-08-04
- [x] **Phase 3: Trustworthy Layout Measurement** (2/2 plans) — completed 2026-08-05
- [x] **Phase 4: Responsive Pagination and Dual-Mode Navigation** (11/11 plans) — completed 2026-08-06
- [x] **Phase 5: Durable Highlights and Notes** (7/7 plans) — completed 2026-08-07
- [x] **Phase 6: Prototype Acceptance** (6/6 plans) — completed 2026-08-10

Full phase details, decisions, and plan history: [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v2.0 Personal Library (Phases 7-13)

**Milestone Goal:** Turn Lem Reader from a fixture-only prototype into a product readers can put their own content into — ingesting URLs and documents into a personal local-first library, with exportable highlights that travel across machines.

Seven phases that add one stateless ingestion backend and one new data domain (user-ingested articles + library metadata) on top of the shipped v1.0 substrate. The load-bearing invariant: the reading engine, pagination, annotation selectors, location store, and a11y surface cannot tell an ingested article from a fixture. URL+HTML(+Markdown) ingestion is proven before PDF and EPUB; SSRF and XSS are addressed in the first ingestion phase, not deferred.

- [ ] **Phase 7: Ingestion Substrate** - Stateless backend safely normalizes URL-fetched and pasted HTML into canonical articles with SSRF + XSS defense and honest failure
- [ ] **Phase 8: Markdown Pipeline and Personal Library** - Lowest-risk Markdown intake plus the personal library that replaces the fixture list
- [ ] **Phase 9: Versioned Export/Import** - Whole-library bundles and highlights-only export as the cross-device story in lieu of accounts
- [ ] **Phase 10: Annotation Review Panel** - Dedicated surface to review, filter, and curate all highlights and notes across the library
- [ ] **Phase 11: PDF Intake** - PDF text extraction with honest failure for scanned and multi-column documents
- [ ] **Phase 12: EPUB Intake** - Multi-chapter EPUB books surfaced as per-chapter articles under a book grouping
- [ ] **Phase 13: Polish and Acceptance** - FOUC and progress-bar fixes plus the NVDA+Firefox and v2.0 core-flow acceptance gate

## Phase Details

### Phase 7: Ingestion Substrate
**Goal**: A stateless ingestion backend safely turns URL-fetched and pasted-HTML pages into validated canonical articles that the v1.0 reader treats identically to fixtures — without exposing the reader to SSRF or XSS.
**Depends on**: v1.0 shipped substrate (Phases 1-6)
**Requirements**: ING-01, ING-02, ING-06, ING-07, ING-08
**Success Criteria** (what must be TRUE):
  1. Reader submits a real publisher URL and the resulting article opens in the existing reader, paginating, annotating, and restoring location identically to a v1.0 fixture — with a round-trip anchor test (TextPositionSelector + TextQuoteSelector re-resolves to `confident`) gating every successfully ingested article.
  2. Reader pastes or uploads an HTML document and it normalizes through the same pipeline as a URL, producing the same canonical Block shape.
  3. The SSRF guard regression matrix passes — private/loopback/link-local IPs (incl. cloud-metadata 169.254.169.254 and CGNAT 100.64/10), non-http(s) schemes, redirect-into-internal chains, and DNS-rebinding simulations are all refused with no upstream body returned on refusal.
  4. The mXSS regression suite (DOMPurify Attack Classes payloads) passes — no `<script>`, inline `on*` handlers, `javascript:` URLs, or SVG/MathML survives into the canonical Block tree, and no `dangerouslySetInnerHTML` exists anywhere in the codebase.
  5. Extraction yields honest three-state outcomes (confident / low-confidence / unsupported) with a derived multi-signal confidence and a reader-visible reason for every refusal (no silent garbage enters the library), and the v1→v3 Dexie migration passes its CI fixture-snapshot test (every v1.0 article/highlight/note/position/preference intact on upgrade).
**Plans**: 7 plans
Plans:
- [ ] 07-01-PLAN.md — Wave-0 scaffolding + jsdom-on-Workers spike (resolves A1/A2/A3; gates the extraction architecture)
- [ ] 07-02-PLAN.md — Schema additions (ArticleSource, IngestionMeta, Provenance.sourceUrl.optional) + Dexie v3 append
- [ ] 07-03-PLAN.md — /server pipeline primitives: safeFetch SSRF guard + confidence three-state + slugify
- [ ] 07-04-PLAN.md — /server extraction: htmlToBlocks (Readability → DOMPurify → 9-kind Block tree) + mXSS suite (SC#4)
- [ ] 07-05-PLAN.md — /server orchestrator (ingest.ts) + inline round-trip anchor gate (SC#1)
- [ ] 07-06-PLAN.md — Edge function adapter + IngestionClient + DexieLibrarySource + repository swap + minimal ingest UI
- [ ] 07-07-PLAN.md — Four phase-exit gates as real e2e tests: SSRF matrix (SC#3) + happy-path (SC#1) + Dexie migration (SC#5) + repo-wide dangerouslySetInnerHTML grep gate

### Phase 8: Markdown Pipeline and Personal Library
**Goal**: Readers see the value of ingestion — a personal library replaces the flat fixture list, Markdown joins as the lowest-risk intake format, and the reader can browse, open, search, tag, and track their articles.
**Depends on**: Phase 7
**Requirements**: ING-03, LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06
**Success Criteria** (what must be TRUE):
  1. The personal library is the default route (replacing the flat fixture list) and shows v1.0 fixtures (badged `source: "fixture"`) alongside newly ingested articles, with no v1.0 e2e test regressing.
  2. Reader can open, read, and remove any article in their library; removal cascades to the article's highlights, notes, and position records.
  3. Reader can search the library by title and metadata, tag articles, and filter the library by tag (flat tags as the default organization — no folder hierarchy).
  4. Reader can add an article by uploading a Markdown document (.md), with YAML front-matter (title/author/date) recognized as metadata, normalized through the same Block-output contract as HTML.
  5. Reader sees ingestion metadata (source URL, fetch date) with a link to the original source, plus recently-read shortcuts and positional reading-progress indicators across the library.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Versioned Export/Import
**Goal**: Readers can take their whole library with them — exporting articles, highlights, notes, position, and preferences as a versioned bundle, re-importing it on another machine with validation and conflict reporting, and exporting just their highlights for use outside the reader.
**Depends on**: Phase 8
**Requirements**: PORT-01, PORT-02, PORT-03
**Success Criteria** (what must be TRUE):
  1. Reader can export their entire library (articles + highlights + notes + positions + preferences) as a single versioned bundle carrying a `schemaVersion` field and per-article source URLs.
  2. Reader can import a compatible bundle on another machine with Zod validation, a dry-run conflict preview, and skip-by-default conflict resolution with per-entity reader overrides; the import applies atomically in a single Dexie transaction (no partial state on failure), and a Zip Slip guard (`path.resolve + startsWith` on every archive entry) plus filename sanitization refuses directory-traversal entries.
  3. Reader can export just their highlights as a Markdown document (with template variables) for use in external tools like Obsidian or Notion.
  4. Round-trip integrity holds: canonical-text offsets survive export and import (page numbers never appear in the bundle), and a bundle exported on one machine re-imports on another with every highlight re-resolving to `confident` or surfacing honestly as `ambiguous`/`orphan`.
**Plans**: TBD
**UI hint**: yes

### Phase 10: Annotation Review Panel
**Goal**: Readers have a dedicated surface to review, filter, and curate all their highlights and notes across the library — the natural pair to the export and curation flow.
**Depends on**: Phase 9
**Requirements**: RECV-01
**Success Criteria** (what must be TRUE):
  1. Reader can open a dedicated panel listing every highlight and note across the library (cross-article), with per-highlight metadata (article, date, position).
  2. Reader can jump from any highlight in the panel directly to its location in the reader and navigate back to the panel (bidirectional).
  3. Reader can filter the review list (by article, tag, or confidence) and sort it (by date, article, or position).
  4. Ambiguous and orphan annotations surface honestly with a tri-state indicator (never silently hidden), and the reader can edit or delete highlights in place from the panel.
**Plans**: TBD
**UI hint**: yes

### Phase 11: PDF Intake
**Goal**: Readers can add PDF documents to their library with text extracted and normalized — and honest failure when a PDF is scanned, image-only, or unrecoverably multi-column.
**Depends on**: Phase 10
**Requirements**: ING-04
**Success Criteria** (what must be TRUE):
  1. Reader can upload a text-heavy PDF and receive a normalized article that opens in the reader and paginates, annotates, and restores location identically to other articles.
  2. Scanned or image-only PDFs are detected and refused with an honest "couldn't read this" reason (reusing the DOC-06 disclosure pattern) — no silent garbage enters the library.
  3. Multi-column PDFs are either honestly flagged as low-confidence (reconstructed reading order) or refused via the same disclosure surface; the reader never sees silently reordered text.
  4. A round-trip anchor test gates every successfully extracted PDF article, and a calibration harness validates the font-size→heading and vertical-gap→paragraph thresholds on a real-PDF corpus before promotion.
**Plans**: TBD

### Phase 12: EPUB Intake
**Goal**: Readers can add an EPUB book to their library, surfaced as per-chapter articles under a book grouping (Option A) — preserving every v1.0 substrate contract at chapter granularity.
**Depends on**: Phase 11
**Requirements**: ING-05
**Success Criteria** (what must be TRUE):
  1. Reader can upload a DRM-free EPUB and the library shows it as a book grouping with expandable chapter articles (Option A: one article per chapter + a thin Book record).
  2. Each chapter opens in the reader and paginates, annotates, and restores location identically to other articles; two-mode reading works at chapter granularity.
  3. Cross-chapter navigation (next/previous chapter) and book-level progress (derived from per-chapter locations) work; reopening a book resumes at the last-read chapter.
  4. The EPUB parser is isolated behind an adapter (so the dependency can be swapped), the epub.js renderer is NOT used inside React, and a round-trip anchor test gates every successfully extracted chapter.
**Plans**: TBD
**UI hint**: yes

### Phase 13: Polish and Acceptance
**Goal**: The v2.0 quality gate — eliminate the two known polish regressions and close acceptance across the supported browser matrix, mirroring v1.0 Phase 6.
**Depends on**: Phase 12
**Requirements**: POLISH-01, POLISH-02, ACPT-05, ACPT-06
**Success Criteria** (what must be TRUE):
  1. Reader sees the persisted reading mode on first paint with no flash or snap to a different mode (a Playwright cold-load no-snap test passes).
  2. Reader sees a progress bar that reflects actual position — a one-page article does not show 100% on open and a multi-page article progresses from the start (offset-anchored formula with boundary tests).
  3. The documented screen-reader acceptance flows complete on NVDA+Firefox with zero blocker/major findings, closing the v1.0 ACPT-02 coverage boundary A4.
  4. The v2.0 core flow (ingest → read → highlight → export → re-import) completes across Chromium, Firefox, and WebKit without content loss, and the full `npm run test` suite exits 0 (mirroring the v1.0 honest-suite precedent).
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Canonical Article Foundation | v1.0 | 5/5 | Complete | 2026-07-29 |
| 2. Accessible Scrolling Reader | v1.0 | 4/4 | Complete | 2026-08-04 |
| 3. Trustworthy Layout Measurement | v1.0 | 2/2 | Complete | 2026-08-05 |
| 4. Responsive Pagination and Dual-Mode Navigation | v1.0 | 11/11 | Complete | 2026-08-06 |
| 5. Durable Highlights and Notes | v1.0 | 7/7 | Complete | 2026-08-07 |
| 6. Prototype Acceptance | v1.0 | 6/6 | Complete | 2026-08-10 |
| 7. Ingestion Substrate | v2.0 | 0/7 | Planned | - |
| 8. Markdown Pipeline and Personal Library | v2.0 | 0/TBD | Not started | - |
| 9. Versioned Export/Import | v2.0 | 0/TBD | Not started | - |
| 10. Annotation Review Panel | v2.0 | 0/TBD | Not started | - |
| 11. PDF Intake | v2.0 | 0/TBD | Not started | - |
| 12. EPUB Intake | v2.0 | 0/TBD | Not started | - |
| 13. Polish and Acceptance | v2.0 | 0/TBD | Not started | - |
