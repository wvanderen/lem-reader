# Phase 12: EPUB Intake - Research

**Researched:** 2026-08-17
**Domain:** EPUB (OCF/OPF/nav/NCX) parsing → per-chapter article pipeline; book-grouped library UX; DRM/Zip-Slip/bomb defenses; Dexie + export-bundle additive widening
**Confidence:** HIGH (spec facts verified against W3C/IDPF/Readium sources + every codebase contract read this session; only vendor-specific DRM markers and calibration thresholds remain MEDIUM/LOW)

## Summary

Phase 12 adds EPUB as the fifth intake format with the architecture already locked by four prior decisions: Option A book shape (ARCHITECTURE Pattern 4 — one article per chapter + thin `Book` record), fflate for the zip (D12-13, in-tree 0.8.3), fast-xml-parser for container.xml/OPF/nav/NCX XML (D12-14, subject to the D12-15 blocking-human approval gate), and chapter XHTML riding the EXISTING jsdom + DOMPurify `htmlToBlocks` sanitize-and-walk path (D12-14; NOT `extractAndNormalize` — Readability must not run on chapter documents, which are already content). The load-bearing technical work this phase is (a) the TOC-driven chapter assembly (D12-09 — nav/NCX entries map to spine RANGES so publisher chapter-splitting merges and "Chapter 4 of 12" matches the book's own TOC), (b) honest DRM refusal (verified detection: LCP via `META-INF/license.lcpl` or the LCP RetrievalMethod type; ADEPT via `META-INF/rights.xml` + `http://ns.adobe.com/adept`; the OCF font-obfuscation URI `http://www.idpf.org/2008/embedding` is the ONLY legitimate encryption entry a DRM-free EPUB carries — every other encryption entry refuses as `epub-protected`, which subsumes FairPlay and unknown vendors), and (c) the additive persistence/UI widening (Dexie v5 `books` store + `bookId` index; expandable book rows; continue-strip book entries; end-of-chapter link; books in the export bundle).

The verified EPUB 3.3 parse chain (W3C Recommendation, 2026-01-13): unzip → `mimetype` (optional conformance sniff; `application/epub+zip` first+uncompressed per §4.3.3) → `META-INF/container.xml` (namespace `urn:oasis:names:tc:opendocument:xmlns:container`; `rootfiles/rootfile[@full-path]` → OPF) → OPF (`http://www.idpf.org/2007/opf`; `metadata` with REQUIRED `dc:title`/`dc:language`/`dc:identifier` + optional `dc:creator`/`dc:publisher`/`dc:date`; `manifest/item[@id,@href,@media-type,@properties]`; `spine/itemref[@idref,@linear]`) → nav document (EPUB 3: manifest item with `properties="nav"`, exactly one `nav[epub:type="toc"]`, `ol>li>a` hierarchy, SHOULD follow spine order) with NCX fallback (EPUB 2: `spine[@toc]` IDREF → NCX manifest item `application/x-dtbncx+xml`, `navMap>navPoint>navLabel>text` + `content[@src]`). Every chapter that admits then runs the UNCHANGED stages 2+: `ArticleSchema.parse` → `assertRoundTripAnchor` (5-offset gate) → `deriveConfidence` → stamp — SC#2/SC#4 are reuse, not rebuild.

**Primary recommendation:** Build `server/epubToBooks.ts` as a pure adapter that composes existing primitives (fflate `unzipSync` with the Phase 9 bomb-cap filter + `isSafeEntryName` Zip Slip gate on EVERY entry, fast-xml-parser with `processEntities:false`, `sanitizeExtractedHtml` + `htmlToBlocks` per chapter), implement D12-09 TOC-merge as top-level-nav-entry → spine-range partition with one-article-per-spine-item fallback, refuse DRM by the encryption.xml allowlist rule (font-obfuscation URI is the only pass), and widen schemas/stores/UI strictly additively (`"epub-chapter"` source, `bookId`/`chapterIndex` optional IngestionMeta fields, Dexie v5 append, bundle schemaVersion 2 with union read).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (do NOT re-litigate — carrying forward from Phases 7/8/9/11 + 12-CONTEXT)

- **Option A book shape** — one article per chapter + thin `Book` record (ARCHITECTURE Pattern 4; B compound-coordinates and C flatten REJECTED). Locked in ING-05 + ROADMAP SC#1.
- **Substrate byte-stable** — the 9-kind Block model, grapheme-offset anchors, pagination engine, location/highlight/note schemas are untouched; a chapter IS an article to the reading engine (SC#2, Pitfall 6).
- **epub.js never enters the app** — renderer, not a parser (Pitfall 6); parser isolated behind the `epubToBooks` adapter so the dependency can be swapped (SC#4). `epub2` REJECTED (unmaintained).
- **Chapter XHTML sanitizes through the shared DOMPurify pipeline** (same mXSS discipline as URL extraction, ING-07).
- **Round-trip anchor test gates every admitted chapter** (SC#4) — the 5-offset `assertRoundTripAnchor` gate from Phase 7.
- **DRM-locked EPUBs refuse honestly** — detect ADEPT/FairPlay/LCP markers, refuse with a calm typed reason.
- **Zip Slip guard on every EPUB archive entry** — the Phase 9 guard discipline applied to the EPUB zip.
- **Publisher CSS ignored** — reader typography always wins (FEATURES anti-feature L115).
- **Server-side parsing** on the `/api/ingest` Vite-Node-middleware host (Phase 7 HYBRID CONTINGENCY; Phase 11 precedent); `source: "epub-chapter"` widening anticipated at `src/content/schema.ts:205`.
- **Save-once + dedupe-refuse** — book/chapter ids derive from content hash (`pdf-<shortHash>` / `md-<shortHash>` precedent); re-upload of identical bytes → "Already in your library."
- **Calm DOC-06 typed refusals** for DRM-protected, corrupt, non-EPUB, oversized files (D7-04 discipline).
- **Doc model is the security boundary** — chapter XHTML → DOMPurify → Block JSON; React renders Block JSON; `dangerouslySetInnerHTML` exists nowhere.
- **7-stage orchestrator** (`server/ingest.ts`) gains a fifth Stage-1 branch (`{epub, filename?}`); stages 2+ run per chapter unchanged.
- **Pitfall 9 Dexie version discipline** — `books` store is an ADDITIVE v5 block; shipped version blocks byte-unchanged; new stores start empty.
- **Books + chapter articles travel in the Phase 9 export bundle** (Pattern 7's table lists books YES when present; `src/portability/bundle.ts:14` documents the absence as the forward-compatible form).
- **D12-01**: Expandable + Resume book row (collapsed: title/author + book-level progress hairline + Resume action; expanded: chapter sub-rows reusing LibraryRow anatomy; no new route).
- **D12-02**: Continue-Reading strip shows ONE book-level entry per in-progress book ("BookTitle — Chapter 4 of 12" resuming last-read chapter); chapters never double-list.
- **D12-03**: Book progress = chapters-finished ratio (location at ≥98% of chapter text / total admitted chapters; Phase 8 finished-state convention).
- **D12-04**: Tags live on the Book record; search matches book title AND chapter titles (tag filter surfaces the book row, not 40 chapter rows).
- **D12-05**: Next-chapter is an end-of-chapter affordance, not persistent chrome; keyboard-reachable, in both modes; previous-chapter from chapter start.
- **D12-06**: The library's expandable book grouping IS the TOC for Phase 12; no reader-internal TOC panel (ships with ORNT-01).
- **D12-07**: Resume = last-read chapter by `savedAt` (latest LocationRecord within the book wins).
- **D12-08**: Chapter context line in reader header — "Book Title · Chapter 4 of 12" for epub-chapter articles only; no book-progress indicator inside the reader.
- **D12-09**: TOC-driven chapters — spine items mapping to the same TOC entry MERGE into one article; fallback one-article-per-spine-item when no TOC mapping derives; publisher intent preserved.
- **D12-10**: Skip non-content spine items (cover, nav doc, pure-image plates) — not reading units and not failures; front matter WITH real text stays; reuses the `isReaderable` admission algebra (11-07 relaxed form).
- **D12-11**: Skip + disclose per book — a failed chapter is skipped and DISCLOSED ("2 chapters could not be read"); whole EPUB refuses only when ZERO chapters admit; never silently missing.
- **D12-12**: Calibration mirrors D11-04/05/06 — real EPUBs local + gitignored; committed MANIFEST (filename + SHA-256 + expected shape) + committed derived evidence replay in CI; synthetic fixtures (self-verifying generator, 11-01 precedent) committed; CI absence fails honestly.
- **D12-13**: fflate reads the EPUB zip (in-tree 0.8.3; same archive-entry surface + Zip Slip guard as Phase 9; JSZip stays REJECTED per D9-02).
- **D12-14**: fast-xml-parser for XML manifests (container.xml / OPF / NCX / nav); chapter XHTML through the EXISTING jsdom + DOMPurify `htmlToBlocks` pipeline (slightly-malformed XHTML tolerated like URL extraction).
- **D12-15**: fast-xml-parser gets the unpdf treatment — exact-pinned, legitimacy evidence in a phase approval doc, USER sign-off as a blocking gate BEFORE it lands.
- **D12-16**: Text-first; images deferred — in-chapter images → `UnsupportedBlock` with alt/plainDescription (PDF precedent); no cover image; no asset extraction.

### the agent's Discretion (researcher recommends; planner confirms)

- **Chapter/article id scheme** — `epub-<shortHash>`-derived per-chapter ids; must dedupe-refuse identical re-uploads at book level (D7-07 precedent).
- **`BookSchema` exact Zod shape** — per ARCHITECTURE L405 sketch; researcher confirms optional fields.
- **TOC-merge algorithm** — href matching, nested-TOC flattening depth, EPUB 3 nav-over-EPUB 2 NCX precedence.
- **DRM marker detection specifics** — the detection list is researcher's.
- **EPUB size/time limits** — EPUB_MAX_BYTES, chapter-count cap, extraction timeout mirroring PDF_MAX_BYTES/PDF_EXTRACTION_TIMEOUT_MS (one shared constant, three enforcement points).
- **New failure-reason granularity** — `epub-protected` / `epub-corrupt` / `epub-empty` etc. typed members + calm `mapReasonToCopy` strings.
- **Expand/collapse interaction details** — chevron vs row-click, animation (reduced-motion), aria-expanded semantics.
- **End-of-chapter link anatomy** — placement per mode, copy, focus behavior.
- **Export bundle version bump** — schemaVersion 2 vs additive optional field; D9-04 higher-version-refusal must keep older bundles importable.
- **Review panel / highlights-export interaction with books** — chapters are articles so the panel works as-is; book-title prefix is planner's.
- **Book-level cascade semantics** — removing a book removes its chapters (highlights/notes/locations cascade per Phase 8 transaction precedent); confirmation copy is planner's.

### Deferred Ideas (OUT OF SCOPE — ignore completely)

- Reader-internal book TOC panel (ships with ORNT-01)
- Cover image + in-chapter image asset extraction (text-first per D12-16)
- Per-chapter tags / TagEntry on chapter rows
- Length-weighted book progress
- EPUB → Markdown intake conversion, OPF/EPUB-fragment export
- Polish (POLISH-01/02) + NVDA acceptance (ACPT-05/06) — Phase 13
- Book-internal search / full-text search
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-05 | Reader can add a book by uploading an EPUB, surfaced as per-chapter articles under a book grouping (EPUB-as-Book, Option A — one article per chapter + thin Book record, preserving every v1.0 substrate contract) | §Architecture Patterns (epubToBooks pipeline + TOC-merge algorithm), §Code Examples (container/OPF/nav parsing, DRM detection, Dexie v5, bundle widening), §Standard Stack (fflate in-tree + fast-xml-parser gated), §Validation Architecture (ING-05 test map), §Security Domain (zip bomb/Zip Slip/mXSS/entity-expansion mitigations) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **GSD workflow enforcement** — file-changing work goes through GSD entry points (`/gsd-execute-phase` for this phase); planning artifacts stay in sync.
- **Semantic HTML + modern CSS only** — no Tailwind, no component suite (STACK.md "What NOT to Use"); book-grouping UI uses native elements (`<button aria-expanded>`, nested `<ul>`) and authored CSS.
- **Browser primitives over dependencies** — the EPUB zip/XML work uses fflate + fast-xml-parser because no browser primitive unzips/parses XML manifests; everything else (rendering, focus, disclosure) uses platform features.
- **`dangerouslySetInnerHTML` forbidden repo-wide** (ING-07) — `lint:no-danger` script must stay green; chapter XHTML renders as Block JSON only.
- **Server-only parser deps never enter the client bundle** — fast-xml-parser joins unpdf/jsdom behind `/server` imports; the dist/ grep discipline (11-01) applies to it.
- **Exact-pin discipline for new parser deps** — D12-15 mirrors 11-01: `npm install --save-exact`, no caret, human sign-off gate before install.
- **React 19.2.8 / TypeScript 7.0.2 / Vite 8.1.5 / Node 22 LTS** — no stack changes this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| EPUB unzip + entry validation (bomb cap, Zip Slip) | API / Backend (`server/epubToBooks.ts`, Node middleware) | — | Archive parsing is CPU-heavy + security-sensitive; Pitfall 12 forbids main-thread work; fflate is already a /server-side (and client-portability) primitive from Phase 9 |
| container.xml / OPF / nav / NCX XML parsing | API / Backend (fast-xml-parser behind the adapter) | — | XML manifests never reach the client; the dependency is swappable behind `epubToBooks` (SC#4) |
| DRM detection + typed refusal | API / Backend (pre-extraction gate) | — | Must refuse BEFORE any chapter work; same layer as pdf-encrypted |
| Chapter XHTML → Block JSON (sanitize + walk) | API / Backend (`sanitizeExtractedHtml` + `htmlToBlocks`) | — | The shared ING-07 security boundary; identical code path as URL extraction minus Readability |
| Chapter admission (isReaderable, anchor gate, confidence) | API / Backend (stages 2+ of the orchestrator, unchanged) | — | D7-03 input-source-agnostic pipeline reuse |
| Book + chapter persistence (Dexie v5, transactions, cascade) | Database / Storage (`src/persistence/db.ts`, `LibrarySource`) | — | IndexedDB owns local-first state; additive version block only |
| Book grouping UI (expandable rows, resume, progress, search, tags) | Browser / Client (`LibraryView` + siblings) | — | Pure presentation over repository reads; native disclosure semantics |
| Chapter reading, two modes, annotations, restore | Browser / Client (unchanged v1.0 substrate) | — | A chapter IS an article; zero substrate change (SC#2) |
| Cross-chapter navigation affordance + context line | Browser / Client (`ArticleView`) | — | End-of-chapter link is reading-surface chrome (D12-05/D12-08) |
| Export/import of books + chapters | Browser / Client (`ExportImportService`, `bundle.ts`) | Database / Storage (single Dexie transaction on import) | Bundle assembly is client-side; atomicity via Dexie transaction (Pitfall 11 #3) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fflate | 0.8.3 (**in-tree**) | Unzip the EPUB OCF container; build synthetic EPUB fixtures in tests via `zipSync` | D12-13 locked: already unzips the Phase 9 import bundle — same archive-entry surface, same Zip Slip guard requirement, zero new zip deps [VERIFIED: codebase `src/portability/ExportImportService.ts:35,182-184`] |
| fast-xml-parser | **5.10.1 or 5.11.0 — D12-15 user gate decides** | Parse `META-INF/container.xml`, OPF manifest/spine/metadata, EPUB 3 nav landmarks, EPUB 2 NCX | D12-14 locked (STACK.md §7 deliberate pick; JSZip+fxp was the research recommendation and D12-13 swaps only the zip half to fflate). Pure JS, no native bindings, MIT, bundled types [VERIFIED: npm registry — 5.11.0 current, maintainer amitgupta/NaturalIntelligence, ~69.3M weekly downloads, no postinstall scripts; API verified against official v4,v5 docs] |
| jsdom + isomorphic-dompurify | 30.0.1 / 3.22.0 (**in-tree**) | Chapter XHTML sanitize + DOM walk (the EXISTING `htmlToBlocks` path) | D12-14: chapters ride the existing pipeline — same mXSS discipline as URL extraction (ING-07); no new dependency [VERIFIED: codebase `server/htmlToBlocks.ts`] |
| zod | 4.4.3 (**in-tree**) | `BookSchema`, `"epub-chapter"` source widening, request/response variant widening | Zod-at-boundary is the STATE-04 trust discipline [VERIFIED: codebase] |
| Dexie | 4.4.4 (**in-tree**) | `books` store (additive v5), `bookId` index, book cascade transaction | Local-first persistence; Pitfall 9 additive-only version blocks [VERIFIED: codebase `src/persistence/db.ts`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @playwright/test | 1.61.1 (**in-tree**) | Book-grouping e2e, chapter reading e2e, refusal no-side-effect e2e, calibration replay | All integration truth for the new surface (real browsers own IndexedDB + layout) |
| vitest | 4.1.10 (**in-tree**) | `epubToBooks` unit suite (TOC-merge, DRM detection, Zip Slip, bomb cap, caps) against synthetic EPUB fixtures | Pure adapter logic is Node-authoritative (no DOM emulator for parsing) |
| fflate `zipSync` (test-only) | 0.8.3 | Synthetic EPUB fixture generator builds container.xml/OPF/nav/chapter XHTML zips in-process | The 11-01 self-verifying-generator precedent, EPUB edition — no binary fixtures committed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fflate (unzip) | JSZip 3.10.1 | REJECTED by D9-02 (bundle size) — D12-13 applies the settled argument; do not reopen |
| fast-xml-parser | epub2 3.0.2 | REJECTED — unmaintained (STACK.md L131: "do not pick for new v2.0 work"); the adapter isolation exists precisely so this never needs revisiting |
| fast-xml-parser | @xmldom/xmldom (what epub.js pulls) | Wrong shape — a DOM builder with CVE history; fxp's JS-object output maps OPF/NCX to typed shapes directly |
| fast-xml-parser | epubjs 0.3.93 | REJECTED — client-side renderer (localforage, marks-pane, @xmldom/xmldom); Pitfall 6 |
| Project TOC-merge | epub.js `book.spine`/`book.navigation` parse-only APIs | Even parse-only pulls the renderer package's dependency graph; hand-rolled merge over OPF+nav is ~100 lines of pure, testable code |
| `extractAndNormalize` (Readability) on chapters | — | NOT an alternative: Readability strips headings/structure that chapters legitimately carry; call `sanitizeExtractedHtml` + `htmlToBlocks` directly (the adapter decides, the walk is shared) |

**Installation:**

```bash
# The ONLY new dependency this phase — gated by D12-15 (blocking human sign-off BEFORE install):
npm install --save-exact fast-xml-parser@5.10.1   # or 5.11.0 — the approval record decides (see Open Question 1)
```

**Version verification (this session, npm registry):**
- `fast-xml-parser`: **5.11.0** latest (published 2026-08-16); 5.10.1 published 2026-07-16 (STACK.md's pick). Weekly downloads ~69,329,257. Maintainer: amitgupta (NaturalIntelligence). No postinstall/preinstall scripts. MIT. [VERIFIED: npm registry]
- `fflate`: 0.8.3 in-tree (registry current also 0.8.x line; OK verdict from legitimacy gate). [VERIFIED: npm registry + package.json]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fast-xml-parser | npm | ~10 yrs (v5 line since 2024; latest 5.11.0 published 2026-08-16 — 1 day before research) | ~69.3M/wk | github.com/NaturalIntelligence/fast-xml-parser | **SUS** ("too-new": latest publish 1 day old) | **Flagged — planner must add `checkpoint:human-verify` before install.** This IS the D12-15 gate: exact-pin + legitimacy evidence record + user sign-off (11-01 unpdf precedent). Pin 5.10.1 (stable since 2026-07-16, STACK.md's verified version) or 5.11.0 with explicit user approval — the approval doc records which. |
| fflate | npm | ~5 yrs | ~60M/wk | github.com/101arrowz/fflate | OK | Approved — already in-tree at 0.8.3 (D9-02); no new install |

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious [SUS]:** fast-xml-parser — solely the "too-new" signal on the 5.11.0 publish date; every other signal (downloads, repo, maintainer tenure, no install scripts) is top-tier. The SUS disposition is satisfied by the already-locked D12-15 human gate; no separate checkpoint beyond it is needed.

*Note: the SUS "too-new" driver is an artifact of 5.11.0 being published the day before this research ran. Pinning 5.10.1 (STACK.md's version, in-registry since 2026-07-16) sidesteps the signal entirely; 5.11.0's diff vs 5.10.1 should be checked in the approval record either way (the 11-01 "verified API-neutral diff" discipline).*

## Architecture Patterns

### System Architecture Diagram

```
Reader (browser)                          Node (Vite dev middleware :5173)
┌──────────────────────────┐              ┌────────────────────────────────────────────┐
│ IngestControl            │  POST /api/  │ ingest-middleware (body caps, 413)         │
│  pick .epub ──cap check─▶│  ingest      │   └─▶ server/ingest.ts (7-stage)           │
│  bytesToBase64           │ ───────────▶ │        Stage 1 (fifth branch):             │
│                          │  {epub,      │          epubToBooks(bytes, filename?)      │
│ IngestionClient          │   filename}  │            1. unzipSync + bomb filter      │
│  ├ has(book.id)? ────────│              │            2. isSafeEntryName EVERY entry  │
│  │  yes → "already-in-   │              │            3. DRM check (encryption.xml / │
│  │        library"       │              │               rights.xml / license.lcpl)   │
│  └ saveBook(txn):        │              │            4. container.xml → OPF          │
│     book + chapters      │              │            5. nav(EPUB3) | NCX(EPUB2) →    │
│                          │              │               TOC entries                  │
│ Dexie v5                 │              │            6. TOC→spine-range partition    │
│  ├ books (NEW)           │◀─────────────│            7. per chapter:                │
│  ├ articles (+bookId     │ ok: {book,   │               skip-if-not-readerable      │
│  │  index)               │    articles, │ │               sanitize+htmlToBlocks     │
│  ├ location/highlights/  │    skipped}  │ │               (stages 2+ run per chapter)│
│  └ notes (UNCHANGED)     │              │ │        zero chapters admit → refuse     │
│                          │              │ ▼          epub-empty / epub-protected /   │
│ LibraryView              │              │            epub-unreadable / epub-too-large│
│  ├ book row (expand/     │              └────────────────────────────────────────────┘
│  │  resume, hairline,    │
│  │  skip disclosure)     │              Reader substrate (UNCHANGED — SC#2)
│  ├ chapter sub-rows      │              ┌────────────────────────────────────────────┐
│  └ ContinueReadingStrip  │              │ ArticleView: a chapter opens like ANY      │
│    (book-level entries)  │              │ article → paginate/annotate/restore both   │
│ ArticleView              │              │ modes; + context line (D12-08) + end-of-   │
│  + "Next chapter" link   │              │ chapter link (D12-05)                      │
└──────────────────────────┘              └────────────────────────────────────────────┘
```

Data flows: EPUB bytes → one typed response (`{book, articles[], skippedCount}` or typed refusal) → one Dexie transaction → library groups by `bookId` → each chapter reads/restores/annotates through the untouched v1.0 substrate → books+chapters ride the export bundle (schemaVersion 2).

### Recommended Project Structure

```
server/
├── epubToBooks.ts          # NEW — the adapter: unzip → DRM gate → OPF/nav/NCX → TOC-merge
│                           #        → per-chapter sanitizeExtractedHtml + htmlToBlocks
│                           #        → { book, chapters: ChapterDraft[], skipped } | refusal
├── ingest.ts               # fifth Stage-1 branch; book-level id + dedupe; per-chapter loop
├── limits.ts               # EPUB_MAX_* caps (EPUB_MAX_BYTES lives in src/ingestion/types.ts
│                           #   per the PDF_MAX_BYTES /src→/server import-direction rule)
└── htmlToBlocks.ts         # UNCHANGED (the chapter normalization path is a CALL)
src/
├── content/schema.ts       # "epub-chapter" source; BookSchema; bookId/chapterIndex on
│                           #   IngestionMeta (additive optional)
├── ingestion/types.ts      # {epub, filename?} request variant; EPUB failure reasons;
│                           #   EPUB_MAX_BYTES; multi-article ok-response variant
├── ingestion/library/
│   ├── LibraryView.tsx     # book grouping (expandable rows; grouping at list level)
│   ├── BookRow.tsx         # NEW — collapsed book row + expand/collapse + disclosure
│   ├── ContinueReadingStrip.tsx # book-level entries (D12-02)
│   ├── libraryFilter.ts    # search matches book + chapter titles; tags surface book row
│   └── SourceBadge.tsx     # "Book" badge variant for epub-chapter
├── persistence/db.ts       # additive version(5): books store + articles.bookId index
├── routes/ArticleView.tsx  # context line (D12-08) + end-of-chapter link (D12-05)
└── portability/bundle.ts   # schemaVersion 2 union + books array
tests/
├── unit/server/epub-to-books.spec.ts        # parse/TOC-merge/DRM/slip/bomb/caps
├── unit/server/epub-fixtures.ts             # self-verifying synthetic EPUB generator (zipSync)
├── unit/server/epub-calibration/            # manifest + committed evidence + replay (D12-12)
└── e2e/epub-intake.spec.ts                  # upload → grouping → chapter reading → resume
```

### Pattern 1: epubToBooks — the pure adapter (SC#4's swappable boundary)

**What:** `server/epubToBooks.ts` is a pure function `(bytes: Uint8Array, hints?) → EpubToBooksResult` — no I/O beyond the bytes, no Dexie, no React. It mirrors the `pdfToBlocks` adapter contract discipline (filename-agnostic; the orchestrator owns title fallbacks and ids). Output shape (recommended, planner confirms):

```typescript
interface ChapterDraft {
  // stages 2+ run on each of these in the orchestrator (ArticleSchema.parse →
  // assertRoundTripAnchor → deriveConfidence → stamp) — per-chapter, unchanged.
  blocks: Block[]; footnotes: FootnoteBody[]; lang: string;
  title: string;            // TOC label → chapter <title>/first heading → "Chapter N"
  spineIndex: number;       // first spine position (debug/traceability)
}
interface EpubToBooksResult {
  bookMeta: { title: string; authors: string[]; language: string;
              publisher?: string; publishedDate?: string; identifier?: string };
  chapters: ChapterDraft[];     // ordered, TOC-merged (D12-09), readerable (D12-10)
  skippedCount: number;         // D12-11 disclosure ("2 chapters could not be read")
  originalFileHash: string;     // sha256 of the EPUB bytes
}
```

**When to use:** exactly once, in the orchestrator's fifth Stage-1 branch. The whole EPUB-specific dependency surface (fflate filter config, fast-xml-parser options, DRM signatures) lives inside this one module — swapping the parser swaps this file and nothing else (SC#4).

### Pattern 2: The verified EPUB parse chain (namespaced, EPUB 3 → EPUB 2 fallback)

**What:** The exact, spec-verified sequence with the namespaces that trip naive implementations. See §Code Examples for the raw XML shapes.

1. **Unzip** (fflate `unzipSync` with `filter: f => f.originalSize <= MAX_ENTRY_ORIGINAL_SIZE` — the Phase 9 bomb cap; a filtered entry is never inflated).
2. **Zip Slip gate** — `isSafeEntryName` on EVERY entry key BEFORE any entry byte is used (the Phase 9 SC#2 discipline; fflate exposes names unsanitized).
3. **Container** — parse `META-INF/container.xml` (default namespace `urn:oasis:names:tc:opendocument:xmlns:container`); read `container.rootfiles.rootfile[0]["@_full-path"]` → OPF path (relative to zip root). Missing/unparseable → `epub-unreadable`.
4. **DRM gate** (order matters — refuse before spending cycles on chapters): see Pattern 3.
5. **OPF** — parse the OPF (namespace `http://www.idpf.org/2007/opf`; Dublin Core elements arrive namespaced `dc:title` etc.). Extract metadata (`dc:title` REQUIRED, `dc:creator` repeatable with `opf:role="aut"` marking authors, `dc:language` REQUIRED, `dc:publisher`/`dc:date`/`dc:identifier` optional) + manifest map `id → {href, media-type, properties}` + ordered spine `itemref[@idref]` (note `@linear="no"` = "purely supplemental" per spec — a skip HINT, not a hard rule; D12-10's readerability gate decides).
6. **Navigation** — EPUB 3: manifest item whose `properties` contains `"nav"` → parse that XHTML → the single `nav[epub:type="toc"]` → flatten `ol > li > a` to ordered `{label, href, depth}` (top-level `li` = depth 1). EPUB 2 fallback (also used when EPUB 3 book has no nav): `spine[@toc]` IDREF → manifest item (`application/x-dtbncx+xml`) → parse NCX (namespace `http://www.daisy.org/z3986/2005/ncx/`) → flatten `navMap > navPoint` (nested navPoints increase depth) to `{label = navLabel/text, href = content/@src, depth}`.
7. **Href normalization** — TOC hrefs are relative to the nav doc (EPUB 3) or NCX (EPUB 2); manifest hrefs are relative to the OPF. Normalize BOTH against the zip root (decode `%XX`, resolve `../`, strip fragments) before matching, or the TOC-merge silently fails and the fallback fires on books that have a perfectly good TOC.

### Pattern 3: DRM refusal by allowlist (the detection list D12-15's sibling discretion item)

**What:** Refuse anything that is not the one legitimate OCF encryption. Verified signatures:

| Marker | Detection | Source |
|--------|-----------|--------|
| Readium LCP | `META-INF/license.lcpl` entry present, OR `META-INF/encryption.xml` contains `ds:RetrievalMethod` with `Type="http://readium.org/2014/01/lcp#EncryptedContentKey"` | [VERIFIED: readium.org/lcp-specs §7.1 — "Reading Systems can detect that a Publication is protected using LCP by either of these means"] |
| Adobe ADEPT | `META-INF/rights.xml` present (with `encryption.xml`), carrying `{http://ns.adobe.com/adept}encryptedKey` | [CITED: DeDRM `ineptepub.py` `adeptBook()` — the de-facto reference implementation] |
| OCF font obfuscation (NOT DRM) | `encryption.xml` `EncryptionMethod[@Algorithm="http://www.idpf.org/2008/embedding"]` — spec-restricted to font core media types; irrelevant to a text-first pipeline | [VERIFIED: w3.org/TR/epub-33 §4.4.5] |
| FairPlay + every unknown vendor | **Allowlist rule:** any `encryption.xml` entry whose Algorithm is NOT the font-obfuscation URI, or a nonconforming combination (rights.xml without encryption.xml, license.lcpl without LCP-typed RetrievalMethod) → `epub-protected` | Derived: the OCF spec defines exactly one non-DRM use of encryption.xml; refusing-by-default makes vendor enumeration unnecessary and unknown DRM refuse honestly |

**When to use:** step 4 of Pattern 2, before any chapter parsing. The refusal is typed (`epub-protected`), calm (DOC-06 copy: "This book is protected by DRM and cannot be added."), and has zero library side effects (the 11-05 no-side-effect discipline).

### Pattern 4: TOC-merge — nav entries partition the spine (D12-09)

**What:** The chapter unit is the book's own TOC entry; spine items are an implementation detail. Algorithm (researcher's recommendation within the discretion area):

1. Flatten the TOC to ordered entries with `depth` (Pattern 2 step 6). Keep **top-level entries only** (depth 1) as chapter units — deeper entries are sections WITHIN chapters. Degenerate case: a single depth-1 entry (often "Contents" or the book title) → descend one level and use depth-2 entries instead (calibration corpus must include this shape).
2. For each chapter unit, resolve its href → manifest id → **first spine position** it appears at (an href absent from the spine is a TOC-only reference — ignore it; a fragment-only href resolves to its document's spine position).
3. Chapter k's **spine range** = `[pos(k), pos(k+1))` over the readerable-spine positions (after D12-10 skips). All readerable spine items in the range MERGE into one chapter article (publisher chapter-splitting handled; content concatenated in spine order through ONE sanitize+walk pass per spine item, blocks concatenated).
4. Spine items BEFORE the first TOC entry (front matter with real text — copyright, foreword) form their own leading unit titled from the first item's `<title>`/heading (or "Front matter"); planner confirms.
5. **Fallback:** if the TOC is absent OR fewer than 2 entries resolve to distinct spine positions → one article per readerable spine item (titles: chapter `<title>` → first heading → `Chapter N`). This is also the honest behavior for weird-but-valid books.
6. Chapter numbering for display ("Chapter 4 of 12") = position within the ADMITTED chapter list (`chapterArticleIds.length` is the denominator); skipped chapters are disclosed separately (D12-11) and never silently renumber the book.

**Chapter title chain (recommendation):** TOC label (publisher intent — primary) → chapter document `<title>` (htmlToBlocks' `buildProvenance` already extracts it) → first heading block → `Chapter N`. Note the D11-09 doubled-title consume has an EPUB analog: if the chapter's first block is a heading matching the chapter title, consume it (bodies start at h2 per the one-h1-per-page discipline — the provenance header renders the title).

### Pattern 5: Chapter admission — reuse the algebra, disclose the skips (D12-10/D12-11)

**What:** Per spine item, BEFORE normalization: skip (not fail) cover pages, the nav document itself, pure-image plates — items with no readerable text. The 11-07 relaxed `isReaderable` algebra (`blocks.length >= 3 && (textBearingPages >= 1 || nearEmptyPages === 0)` — pdf-adapted; for EPUB the unit is the chapter document, so the analog is a block-count/text-presence check on the walked blocks, planner pins the exact EPUB threshold) plus `linear="no"` as a pre-flag. AFTER normalization, per chapter: `ArticleSchema.parse` → `assertRoundTripAnchor` → `deriveConfidence`; a chapter failing extraction or the anchor gate is **skipped and disclosed** (`skippedCount` → "2 chapters could not be read" in the book grouping) — the rest of the book enters. The whole EPUB refuses only when ZERO chapters admit (`epub-empty`). [VERIFIED: codebase — 11-07 algebra + ingest.ts stage order]

### Pattern 6: Additive schema/store widening (Pitfall 9 discipline)

**What:** Every persisted-shape change is `.optional()`/`.default()`-carrying and every store change is an appended version block:

- `ArticleSourceSchema` += `"epub-chapter"` (anticipated at `schema.ts:205-217` — the enum comment already says so).
- `IngestionMetaSchema` += `bookId: z.string().optional()` + `chapterIndex: z.number().int().min(0).optional()` (ARCHITECTURE L401-402 sketch). Existing rows parse unchanged (absent fields).
- `BookSchema` lands in `schema.ts` (see §Code Examples for the recommended shape).
- Dexie `version(5)` appends `books: "id, title"` and adds `bookId` to the articles index string; NO `.upgrade()`; v1-v4 blocks byte-unchanged. New stores start empty.
- `ExportBundleSchema`: `schemaVersion: z.union([z.literal(1), z.literal(2)])` (the ReaderSettingsSchema v1|v2 read precedent from STATE decisions) + `books: z.array(BookSchema).optional()`; writers emit 2. Old (Phase 9-11) importers refuse v2 via the D9-04 higher-version gate — honest refusal, never silent book loss; new importers read both. See Open Question 4.

**When to use:** any time this phase touches a shipped schema — which is exactly: source enum, IngestionMeta, bundle, Dexie. Nothing else widens.

### Pattern 7: Book grouping UI — one library, native disclosure (D12-01..D12-06)

**What:** `LibraryView` partitions list items into standalone articles vs book groups (`article.ingestionMeta?.bookId` / the Dexie `bookId` index — chapters never render as top-level rows). A `BookRow` renders: collapsed (title/author + book progress hairline + Resume action → opens D12-07's last-read chapter) and expanded (chapter sub-rows reusing `LibraryRow` anatomy: SourceBadge "Book" variant, per-chapter hairline, open affordance — plus the skip-disclosure note when `skippedCount > 0`).

- **Interaction:** a real `<button aria-expanded>` chevron toggles a region containing the chapter `<ul>`; row-click does NOT toggle (the row's primary action is Resume/open — two gestures, two targets; planner confirms chevron placement).
- **Animation:** height/rotate transitions gated behind `prefers-reduced-motion: no-preference` (the global reduced-motion gate makes this trivial; the 08-05 `.library-list > li` direct-child lesson applies — chapter sub-rows live INSIDE the book `<li>` so existing row-count selectors keep working, and e2e row counts must use the direct-child selector).
- **Continue-Reading strip:** one entry per in-progress book ("BookTitle — Chapter 4 of 12") resuming the D12-07 chapter; chapters never appear individually; standalone articles unchanged (D12-02).
- **Search/tags (D12-04):** the haystack includes book title/author AND chapter titles; a tag on the book surfaces the book row only.

### Pattern 8: End-of-chapter affordance + context line (D12-05/D12-08)

**What:** For `source: "epub-chapter"` articles with a next chapter: a calm "Next chapter" link at the very end — scrolling mode: after the last block inside the article body flow; paginated mode: after the LAST page fragment's content (visible only when the reader turns to the final page — never permanent chrome). Previous-chapter reachable from chapter start (a symmetric link before the first block, or at the context line — planner picks placement; the constraint is start-of-chapter reachability in both modes). Both are real focusable elements (`<a href="#/article/<id>">` — the plain hash-assignment navigation precedent). Keyboard: Tab-reachable, Enter-activatable; no shortcut needed (page-turn keys untouched). Context line (D12-08): small "Book Title · Chapter 4 of 12" in the ArticleView `<header>` (below `<h1>`/`.meta`), epub-chapter only; requires the book record readable at article-open time (a `bookId` → `db.books.get` lookup or a denormalized `bookTitle` on IngestionMeta — planner picks; the lookup keeps one source of truth, the denormalization keeps ArticleView Dexie-free for fixture parity... note ArticleView already tolerates missing metadata gracefully; recommend the lookup via a tiny `booksStore.ts` following the locationStore seam conventions).

### Pattern 9: Books in the portability loop (PORT-01/02 extension)

**What:** Export: `books` array rides the bundle; chapters ride `articles` as ordinary articles (they ARE articles — `ingestionMeta.bookId` survives serialization). Import: single Dexie transaction writes books + chapters + annotations; book-id conflicts resolve skip-by-default (D9-14 table extends with the book row); a v1 bundle (no books) imports exactly as before; chapters whose book is missing import as standalone epub-chapter articles (orphan-tolerant, Pitfall 11 #8 — the library shows them ungrouped; planner may add a calm "book not in this library" note later). Highlights export (PORT-03): chapters are articles — the existing per-article export works as-is; a book-title prefix in the markdown is the planner's call.

### Anti-Patterns to Avoid

- **Mounting epub.js (`Rendition`/`renderTo`) anywhere** — it replaces the semantic React renderer, the a11y suite, the pagination engine, AND the annotation substrate (Pitfall 6). The parser is `epubToBooks`; there is no renderer.
- **Readability on chapter XHTML** — chapters are already content documents; `isProbablyReaderable`/Readability strip heading structure and footnote lists. The adapter calls `sanitizeExtractedHtml` + `htmlToBlocks` directly.
- **Regex-XML parsing** of container.xml/OPF/NCX — namespaced, attribute-heavy, entity-bearing XML; use fast-xml-parser with `ignoreAttributes: false` + `removeNSPrefix: true` + `isArray` for repeatable elements.
- **Trusting spine order as the TOC** — the spine is an implementation detail; publisher chapter boundaries live in nav/NCX (D12-09's whole point). Conversely, **trusting TOC hrefs without normalization** — relative-path mismatches silently degrade to the fallback.
- **Decrypting or "best-efforting" DRM** — refuse. Detection only. (Also: never ship the DRM markers' byte content anywhere in logs.)
- **One-Dexie-write-per-chapter on the client** — the save path is ONE transaction (book + chapters + addedAt stamps); a half-saved book violates the atomicity discipline (Pitfall 11 #3).
- **Editing shipped Dexie version blocks** — v5 is an APPEND (Pitfall 9; the v1-v4 blocks are load-bearing history).
- **`schemaVersion: z.literal(2)`-only on the bundle** — breaks every v1 import; the read side MUST be the `1|2` union (the ReaderSettingsSchema precedent) with forward-reject ≥3.
- **Fetching remote images inside EPUB chapters** — a malicious EPUB can embed `https://attacker/track.png`; for `epub-chapter`, downgrade ALL figure blocks to `UnsupportedBlock` (D12-16 text-first includes remote-src figures — see Security Domain T-12-05).
- **Per-chapter tags** — tags live on the Book only (D12-04); a chapter row with a TagEntry re-opens scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP decompression + bomb detection | Custom unzip / naive `fflate.unzip` without filter | fflate `unzipSync` + `filter` on `originalSize` (Phase 9 pattern, `MAX_ENTRY_ORIGINAL_SIZE`) | fflate skips over-cap entries BEFORE inflation; hand-rolled byte-walking re-implements 30 years of zip edge cases |
| Entry-name validation | Ad-hoc `name.includes("..")` | `src/portability/zipSlip.ts` `isSafeEntryName` (exists, tested, handles `%2e%2e%2f`, NUL, drive letters, ADS, reserved names) | The Phase 9 gate already encodes the full hostile-name corpus; re-derive it and one bypass ships |
| XML manifest parsing | String splitting / regex | fast-xml-parser (D12-14) | Namespaces, entities, CDATA, repeated elements; plus built-in hardening (`processEntities:false`, `onDangerousProperty`, `maxNestedTags`) |
| XHTML sanitization | Anything new | `sanitizeExtractedHtml` (DOMPurify SANITIZE_CONFIG) + `htmlToBlocks` | ING-07's boundary; the mXSS suite (07-04) already covers this exact surface |
| Chapter admission logic | New readerability heuristics | The 11-07 `isReaderable` algebra (EPUB-adapted threshold) | Calibrated, CI-replay-pinned, and the false-refuse lesson is already learned |
| Anchor gating | Per-format anchor checks | `assertRoundTripAnchor` per chapter, unchanged | SC#4 literally names it; forking orphans every chapter annotation |
| Book progress / finished semantics | New progress math | `FINISHED_THRESHOLD` (0.98) export + LocationRecord reads (D12-03) | Identical semantics to per-article finished state; zero new measurement |
| Filename/entry sanitization | New sanitizer | `sanitizeFilename` (portability) for any download-facing names | Exists, tested |
| Synthetic EPUB fixtures | Hand-built binary blobs committed to git | fflate `zipSync` generator module (self-verifying, 11-01 `serializePdf` precedent) | Fixtures exercise code paths deterministically; the generator's self-check catches rot |

**Key insight:** This phase's entire risk budget belongs to the EPUB-specific unknowns (TOC shapes, DRM markers, real-book weirdness). Everything else — unzip, slip, sanitize, walk, gate, persist, group — is a composition of proven, tested primitives. Every "new" problem this phase touches already has an in-tree answer; the research found no exception.

## Common Pitfalls

### Pitfall 1: TOC↔spine href mismatch silently degrades every book to the fallback

**What goes wrong:** Nav hrefs are relative to the nav document; NCX hrefs to the NCX; manifest hrefs to the OPF. A book with `OEBPS/` prefixes, percent-encoded names (`My%20Chapter.xhtml`), or `../text/ch1.xhtml` traversals produces zero TOC→spine matches → the one-article-per-spine-item fallback fires on a book with a perfect TOC → "Chapter 4 of 12" stops matching the printed book.
**Why it happens:** Path resolution is invisible until it isn't; EPUB producers place nav/NCX/OPf at different depths.
**How to avoid:** One normalization function used for BOTH sides (decode `%XX`, resolve against the zip root, strip fragments, case-sensitive compare — spec paths ARE case-sensitive); unit-test with nested/encoded/traversal hrefs; the calibration corpus (D12-12) MUST include a book whose OPF is at the zip root and one nested in `OEBPS/`.
**Warning signs:** Calibration replay shows `fallback: true` on books with navs; chapter counts equal spine counts on every corpus book.

### Pitfall 2: The middleware refuses large EPUBs with the wrong reason (and the wrong cap)

**What goes wrong:** `MAX_INGEST_BODY_BYTES` is derived from `PDF_MAX_BYTES` only (`ceil(10MB*4/3)+2048`), and `refuseTooLarge` hardcodes `reason: "pdf-too-large"` (`dev-server/ingest-middleware.ts:48-54`). An over-cap EPUB surfaces "This PDF is too large" (or, if EPUB_MAX_BYTES > PDF_MAX_BYTES, an in-cap EPUB gets 413'd as a PDF).
**Why it happens:** Phase 11 derived the transport cap from the only binary format; Phase 12 adds a second.
**How to avoid:** Derive the middleware cap from `max(PDF_MAX_BYTES, EPUB_MAX_BYTES)` (recommendation: keep `EPUB_MAX_BYTES = PDF_MAX_BYTES = 10MB` — XHTML text is tiny and images are deferred, so 10MB is generous) and branch the refusal reason on the parsed body shape (`pdf` vs `epub` key). Three enforcement points share the constants (client picker → middleware → orchestrator decode re-check — the 11-01 discipline).
**Warning signs:** mapReasonToCopy tests fail on enum widening; e2e over-cap test shows PDF copy for an EPUB upload.

### Pitfall 3: Multi-article response breaks the single-article contract

**What goes wrong:** `IngestionResponseSchema`'s ok-variant carries exactly one `article`; `IngestionClient` saves one article. Feeding an EPUB through it saves the last chapter (or crashes Zod) and loses the book.
**Why it happens:** The envelope has been single-format-shaped since Phase 7.
**How to avoid:** Widen the union with a second ok-variant `{ok: true, book: BookSchema, articles: ArticleSchema[], confidence, skippedCount}` — the existing variant stays byte-stable for url/paste/markdown/pdf. Client `saveBook` writes book + chapters in ONE Dexie transaction; dedupe-refuse checks `has(book.id)` (book-level, D7-07) BEFORE the save.
**Warning signs:** Any code path that loops `ingest()` per chapter (the adapter returns the whole book in ONE response); Zod union parse failures in the client on ok responses.

### Pitfall 4: Nested TOC depth flattening produces 300 "chapters"

**What goes wrong:** Flattening ALL nav entries (including depth-2/3 sections) makes every section a chapter article; "Chapter 4 of 12" becomes "Chapter 4 of 214" and every section boundary breaks reader flow.
**Why it happens:** The naive flatten is the obvious first implementation.
**How to avoid:** Pattern 4 step 1 — top-level entries only, with the single-entry degenerate descent. Calibration corpus includes a book with deep nested navs (D12-12's "TOC-vs-spine divergence" expected-shape field exists for exactly this).
**Warning signs:** Chapter counts wildly exceed the printed TOC's chapter count; per-chapter articles of one paragraph.

### Pitfall 5: Chapter images leak reader IPs (remote-src figures)

**What goes wrong:** A chapter embeds `<img src="https://attacker/track.png">`; the existing `figureBlock` admits http(s) srcs; the reader fetches it on render — a tracking beacon fired by opening a book.
**Why it happens:** The URL/paste path WANTS remote figures; the EPUB path must not (D12-16 text-first).
**How to avoid:** `epubToBooks` post-processes chapter blocks: every `figure` block from an EPUB chapter downgrades to `unsupported` carrying `alt`/plainDescription where available. (Relative EPUB image srcs already fail the http(s) gate in `figureBlock` and become `UnsupportedBlock` automatically — [VERIFIED: codebase `server/htmlToBlocks.ts:223-231`] — but remote srcs must be downgraded explicitly.)
**Warning signs:** Any `figure` block surviving in an admitted chapter; e2e network log showing image requests during chapter open.

### Pitfall 6: XML entity expansion / prototype pollution through manifests

**What goes wrong:** A hostile OPF/NCX with `<!ENTITY billion-laughs>` or `__proto__`-shaped property names attacks the parser (DoS) or the object tree (prototype pollution).
**Why it happens:** XML parsers that expand entities by default and build plain objects.
**How to avoid:** fast-xml-parser options: `processEntities: false` (the library's own docs recommend it precisely to "prevent Entity Expansion (DoS) attacks" — [VERIFIED: fast-xml-parser v4,v5 XMLparseOptions docs]), rely on the default `onDangerousProperty` behavior (throws on `__proto__`/`constructor`/`prototype` tag or attribute names), cap `maxNestedTags` below default. Every parse lives in the try→`epub-unreadable` envelope.
**Warning signs:** Unit corpus with entity-bomb and proto-pollution OPFs must be green from Wave 0.

### Pitfall 7: Book removal strands chapter annotations

**What goes wrong:** Removing a book row removes the `books` row only; chapter articles orphan in the flat list (invisible if grouping hides orphans) with dangling highlights/locations.
**Why it happens:** The existing `DexieLibrarySource.remove(id)` cascade is article-shaped.
**How to avoid:** Book-level remove = ONE transaction: delete book row + for each `chapterArticleIds` reuse the article cascade (article + highlights + notes + location). RemoveConfirm clone with book-scoped copy ("Remove <Book>? Its 12 chapters and their highlights will be removed.").
**Warning signs:** e2e remove-book test asserting ZERO rows across all five stores afterward.

### Pitfall 8: Breaking the review panel / bundle with shape assumptions

**What goes wrong:** Phase 10's `deriveReviewSections` and Phase 9's `resolveImportPlan`/manifest iterate articles; a flood of chapter articles (a 60-chapter book) changes panel section counts, import preview sizing, and export manifest blocks in ways prior tests pin numerically.
**Why it happens:** Existing specs assert concrete counts over a fixed corpus.
**How to avoid:** Add chapter-bearing fixtures to those suites rather than loosening assertions (strengthen-only); confirm `loadAllLocations`-style whole-library reads stay performant at book scale (60 chapters × ~30KB blocks ≈ 2MB — fine for Dexie `toArray()`, but measure in the perf harness).
**Warning signs:** Unrelated spec failures appearing only after an EPUB is seeded in a shared beforeEach.

### Pitfall 9: IngestControl extension sniff misses/misroutes EPUB

**What goes wrong:** The picker branches on `/\.(pdf|md|html)$/i`; an EPUB falls into the text branch, is read as a 5MB-capped text file, and sends garbage base64 that the server refuses as `epub-unreadable` — honest-ish but with a confusing size-cap copy.
**Why it happens:** Phase 11's extension-aware branch (11-04) predates `.epub`.
**How to avoid:** Add the `isEpub = /\.epub$/i.test(file.name)` branch with `EPUB_MAX_BYTES` cap BEFORE any `FileReader` read (the 11-04 earliest-enforcement pattern); widen `accept=".md,.html,.pdf,.epub"`.
**Warning signs:** Picker copy tests; e2e upload of an over-cap EPUB never materializes an ArrayBuffer.

### Pitfall 10: "Chapter N of N" vs skipped chapters ambiguity

**What goes wrong:** If skipped chapters count in the denominator, the reader sees "Chapter 12 of 14" on a book whose TOC says 12 chapters; if they renumber silently, the disclosure ("2 chapters could not be read") contradicts the numbers.
**Why it happens:** D12-11's skip-disclose and D12-09's publisher-intent-count interact.
**How to avoid:** Lock the rule: numbering runs over ADMITTED chapters only (`chapterArticleIds` positions); the disclosure is additive prose, not arithmetic. Unit-test the composed display string.
**Warning signs:** Any test deriving the denominator from spine length or TOC length.

## Code Examples

Verified shapes from official sources — the planner can lift these into plan actions and fixtures directly.

### EPUB container.xml (W3C EPUB 3.3 §4.2.6.3.1.6 Example 6)

```xml
<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile
          full-path="EPUB/My_Crazy_Life.opf"
          media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>
```
[VERIFIED: w3.org/TR/epub-33 §4.2.6.3.1.6]

### OPF package skeleton (EPUB 3.3 §5 + OPF 2.0.1 §2 — merged reference shape)

```xml
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId"
         xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:…</dc:identifier>   <!-- REQUIRED -->
    <dc:title>Moby-Dick</dc:title>                            <!-- REQUIRED -->
    <dc:language>en</dc:language>                             <!-- REQUIRED -->
    <dc:creator id="creator">Herman Melville</dc:creator>    <!-- optional, REPEATABLE -->
    <dc:publisher>…</dc:publisher> <dc:date>…</dc:date>       <!-- optional -->
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1"  href="ch1.xhtml"  media-type="application/xhtml+xml"/>
    <item id="c1a" href="ch1a.xhtml" media-type="application/xhtml+xml"/>  <!-- publisher split -->
    <item id="c2"  href="ch2.xhtml"  media-type="application/xhtml+xml"/>
    <item id="css" href="style.css"  media-type="text/css"/>  <!-- ignored: reader CSS wins -->
  </manifest>
  <spine toc="ncx">   <!-- toc attr = NCX manifest id (EPUB 2 legacy; harmless in EPUB 3) -->
    <itemref idref="nav" linear="no"/>   <!-- supplemental → skip candidate (D12-10) -->
    <itemref idref="c1"/>
    <itemref idref="c1a"/>               <!-- merges into chapter 1 (D12-09) -->
    <itemref idref="c2"/>
  </spine>
</package>
```
[VERIFIED: w3.org/TR/epub-33 §5.5-5.7 + idpf.org OPF 2.0.1 §2 — required elements, `properties="nav"`, `itemref/@idref` required, `@linear` optional]

### EPUB 3 nav toc (EPUB 3.3 §7.4.2 — exactly one `toc nav`, ol>li>a, SHOULD follow spine order)

```xml
<nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops">
  <h1>Contents</h1>
  <ol>
    <li><a href="ch1.xhtml">Chapter 1. Loomings</a></li>       <!-- depth 1 → chapter unit -->
    <li><a href="ch2.xhtml">Chapter 2. The Carpet-Bag</a>
      <ol>
        <li><a href="ch2.xhtml#s1">Section</a></li>            <!-- depth 2 → in-chapter -->
      </ol>
    </li>
  </ol>
</nav>
```
[VERIFIED: w3.org/TR/epub-33 §7.2-7.4.2]

### EPUB 2 NCX (OPF 2.0.1 §2.4.1 — navMap REQUIRED, nested navPoint = depth)

```xml
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en-US">
  <head><meta name="dtb:uid" content="urn:uuid:…"/></head>
  <docTitle><text>Moby-Dick</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1">
      <navLabel><text>Chapter 1. Loomings</text></navLabel>
      <content src="ch1.xhtml#ch1"/>
      <navPoint id="navpoint-1-1">…</navPoint>   <!-- nested → depth+1 -->
    </navPoint>
  </navMap>
</ncx>
```
[VERIFIED: idpf.org OPF 2.0.1 §2.4.1 + example]

### fast-xml-parser setup for OPF/NCX (v5 API, official docs)

```typescript
// Source: github.com/NaturalIntelligence/fast-xml-parser docs/v4,v5/2.XMLparseOptions.md [VERIFIED this session]
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,        // REQUIRED — full-path/href/idref/media-type are attributes
  attributeNamePrefix: "@_",      // default; docs convention
  removeNSPrefix: true,           // dc:title → title; opf:role → role (match on local names)
  processEntities: false,         // entity-expansion DoS guard (docs-recommended for untrusted XML)
  maxNestedTags: 40,              // below the 100 default — OPF/NCX are shallow
  isArray: (name) => ["item", "itemref", "creator", "navPoint", "rootfile"].includes(name),
  // repeatable elements forced to arrays — a single <creator> otherwise parses as a string
});

const doc = parser.parse(opfXml);              // throws on malformed XML → try/catch → epub-unreadable
const title = doc.package?.metadata?.["dc:title"] ?? doc.package?.metadata?.title; // removeNSPrefix:true keeps 'dc:title'?? — see note
// NOTE: with removeNSPrefix:true the key is just "title" (prefix stripped); without it, "dc:title".
// Pick ONE convention and pin it in unit fixtures.
const spineRefs: { "@_idref": string; "@_linear"?: string }[] = doc.package?.spine?.itemref ?? [];
```

### DRM detection gate (verified signatures, Pattern 3)

```typescript
// Order: presence checks are cheapest; parse encryption.xml only if present.
const HAS_LICENSE = entries["META-INF/license.lcpl"] !== undefined;           // LCP (spec §7.1)
const HAS_RIGHTS  = entries["META-INF/rights.xml"] !== undefined;             // ADEPT (rights.xml+encryption.xml)
if (HAS_LICENSE || HAS_RIGHTS) throw new IngestionError("epub-protected");

const encXml = entries["META-INF/encryption.xml"];
if (encXml !== undefined) {
  const text = decoder.decode(encXml);
  const enc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false })
    .parse(text);
  const dataList = toArray(enc.encryption?.EncryptedData);
  for (const ed of dataList) {
    const alg = ed.EncryptionMethod?.["@_Algorithm"] ?? "(missing)";
    if (alg !== "http://www.idpf.org/2008/embedding") {   // the ONLY non-DRM use (OCF §4.4.5)
      throw new IngestionError("epub-protected");          // LCP/ADEPT/FairPlay/unknown — refuse
    }
    // font-obfuscation entries: irrelevant (we extract no fonts) — ignore and continue
  }
  // LCP also detectable via RetrievalMethod Type="http://readium.org/2014/01/lcp#EncryptedContentKey"
  // — the license.lcpl presence check above already covers it [VERIFIED: readium LCP spec §2.2/§7.1]
}
```

### BookSchema (recommended shape — ARCHITECTURE L405 sketch + D12-11 disclosure + id scheme)

```typescript
// src/content/schema.ts — additive
export const BookSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),          // `epub-<12hex>` — sha256(base64 channel), the pdf- precedent
  title: z.string().min(1),                       // OPF dc:title (REQUIRED by spec — always present; fallback filename)
  authors: z.array(z.string()).default([]),       // dc:creator (repeatable; role="aut" preferred, all kept)
  language: z.string().min(2),                    // OPF dc:language (REQUIRED by spec)
  chapterArticleIds: z.array(z.string().regex(/^[a-z0-9-]+$/)),  // ordered — the TOC (D12-06)
  publisher: z.string().optional(),               // dc:publisher
  publishedDate: z.string().optional(),           // dc:date (raw OPF string; not datetime-refined — publisher formats vary)
  identifier: z.string().optional(),              // dc:identifier (ISBN/UUID — traceability only)
  skippedChapterCount: z.number().int().min(0).default(0),  // D12-11 disclosure derives from this
  source: z.literal("epub-upload"),
  originalFileHash: z.string(),                   // sha256 of EPUB bytes
});
export type Book = z.infer<typeof BookSchema>;

// Chapter article id scheme (discretion item — recommendation):
//   book:   `epub-${shortHash(base64)}`            — identical bytes → identical id → dedupe-refuse (D7-07)
//   chapter:`epub-${shortHash(base64)}-c${String(idx).padStart(2,"0")}`
//     — deterministic (re-upload stable), distinct per chapter, regex-safe, position-derived so the
//       TOC-merge result is reproducible byte-for-byte from the same upload.
// IngestionMeta (additive optional, ARCHITECTURE L401-402):
//   bookId: z.string().optional(), chapterIndex: z.number().int().min(0).optional()
```

### Dexie v5 append (Pitfall 9)

```typescript
// src/persistence/db.ts — APPEND ONLY; v1-v4 byte-unchanged
this.version(5).stores({
  articles: "id, revision, source, addedAt, *tags, bookId",   // + bookId index (grouping reads)
  settings: "key",
  location: "[articleId+revision]",
  highlights: "id, [articleId+revision]",
  notes: "id, highlightId",
  books: "id, title",                                          // NEW store — starts empty
});
// NO .upgrade() — additive indexes + new store only (the v3/v4 precedent)
```
[VERIFIED: codebase db.ts v1-v4 chain + ARCHITECTURE L449-461 sketch]

### Bundle widening (Pattern 6 — union read, write 2)

```typescript
export const ExportBundleSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),  // v1 imports unchanged; ≥3 forward-rejects (D9-04)
  // …existing fields byte-stable…
  books: z.array(BookSchema).optional(),                 // absent on v1 imports; always present on v2 writes
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| epub2 3.0.2 (ARCHITECTURE L346's original pick) | fflate + fast-xml-parser (D12-13/D12-14) | Phase 9 landed fflate; STACK.md L131 flagged epub2 unmaintained | The "unmaintained parser" risk that ARCHITECTURE called v2.0's highest dep risk is GONE — parsing is OPF/nav/NCX XML + the existing sanitize/walk |
| JSZip (STACK.md §7's EPUB row) | fflate (in-tree) | D9-02 size rejection supersedes | Zero new zip deps; same guard surface |
| EPUB 3.3 as IDPF spec | W3C Recommendation (2026-01-13) | W3C Publishing Maintenance WG | Spec citations below use the current REC sections |
| Single-article ingest envelope | Multi-article book envelope (this phase) | Phase 12 | First response shape change since Phase 7 — additive union variant |

**Deprecated/outdated:**
- NCX (`spine@toc`) — legacy EPUB 2; keep as FALLBACK only, never prefer over `properties="nav"` (EPUB 3.3 §5.9.5: "The EPUB navigation document replaces the NCX for EPUB 3 reading systems")
- `bindings`, `tours`, `guide` OPF elements — deprecated by EPUB 3.3 Appendix A; do not parse (manifest+spine+metadata are sufficient)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FairPlay-specific in-EPUB markers are not publicly specified; the encryption-allowlist rule (refuse every non-font-obfuscation algorithm + rights.xml + license.lcpl) covers FairPlay and unknown vendors without enumeration | Pattern 3, Security Domain | LOW — the allowlist refuses-by-default, so an undetected-specifically DRM still refuses generically; worst case the refusal copy is less specific than ideal |
| A2 | `EPUB_MAX_BYTES = 10MB` (mirroring PDF) and a ~1000-chapter cap are sane starting values | Pattern 2, Pitfall 2 | LOW — constants are one-line changes; a corpus book over 10MB (image-heavy) is text-extractable but refused — calibration (D12-12) validates the ceiling |
| A3 | Bundle bump to schemaVersion 2 (union read) is the honest reading of D9-04 | Pattern 6, Open Question 4 | MEDIUM — if the planner keeps `literal(1)` + optional books, older readers silently drop books on import of new exports (contradicts D12-11's never-silent ethos); decision explicitly planner's |
| A4 | Top-level-only TOC entries define chapters; single-entry degenerate TOC descends one level | Pattern 4 | MEDIUM — mis-detected depth yields 300 section-chapters; calibration corpus must include deep-nested and degenerate navs before promotion |
| A5 | Front matter before the first TOC entry forms its own leading unit | Pattern 4 step 4 | LOW — planner may merge into chapter 1 instead; either is defensible |
| A6 | fast-xml-parser 5.11.0's diff vs 5.10.1 is API-neutral | Standard Stack | LOW — the D12-15 approval record verifies the diff (11-01 discipline); pinning 5.10.1 avoids entirely |
| A7 | `removeNSPrefix: true` key convention (`dc:title` → `title`) — exact key names in the parse tree | Code Examples | LOW — pinned by unit fixtures either way; noted because silent convention drift between tests and adapter would mis-read metadata |

## Open Questions

1. **fast-xml-parser pin: 5.10.1 or 5.11.0?**
   - What we know: 5.11.0 published 2026-08-16 (1 day pre-research — the SUS "too-new" driver); 5.10.1 is STACK.md's verified version (2026-07-16); both MIT, zero scripts, same major.
   - What's unclear: whether 5.11.0's diff is API-neutral for our option surface.
   - Recommendation: present both in the D12-15 checkpoint with the legitimacy table from this research; default to **5.10.1** (older signal, STACK.md lineage) unless the diff check is clean and the user prefers latest.

2. **End-of-chapter link placement in paginated mode — inside the last page fragment, or after the surface?**
   - What we know: D12-05 requires last-page visibility, no permanent chrome; blocks are substrate (untouchable); the pagination surface is viewport-height.
   - What's unclear: whether "after the last fragment inside the surface" is geometrically stable across engines at fragment boundaries.
   - Recommendation: planner decides with a tiny UI probe; scrolling-mode placement (after last block in flow) is unambiguous.

3. **Do chapter sub-rows get Remove affordances, or is removal book-level only?**
   - What we know: LIB-02 gives per-article remove; chapters are articles; but removing one chapter breaks "Chapter N of 12" numbering semantics mid-book.
   - Recommendation: book-level remove only (the book is the unit); chapter rows are open-only. Planner confirms.

4. **Bundle schemaVersion 2 vs optional-field-on-1** — see A3. Recommendation: bump to 2 with union read; the D9-04 refusal of newer bundles by older readers is the honest behavior.

5. **Should `BookRow` read the book record from a new `booksStore.ts` seam or extend an existing store?**
   - What we know: locationStore/settingsStore/tagsStore establish the seam convention; LibraryView already parallel-loads via Promise.all.
   - Recommendation: new `src/persistence/booksStore.ts` (listBooks/getBook/saveBook/removeBook cascade) following the conventions; planner confirms file placement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | Vite 8 build/dev server | ✓ | v22.22.3 | — |
| fflate | EPUB unzip + fixture generator | ✓ | 0.8.3 (in-tree) | — |
| jsdom + isomorphic-dompurify | chapter sanitize/walk | ✓ | 30.0.1 / 3.22.0 (in-tree) | — |
| fast-xml-parser | container/OPF/nav/NCX parsing | ✗ (not installed) | 5.10.1/5.11.0 target | **None — blocking by design**: the D12-15 human gate precedes the install (11-01 pattern). Everything else in Wave 0 (schemas, fixtures generator skeleton, UI scaffolds) can land before the install. |
| Playwright browsers | e2e suite | ✓ | 1.61.1 configured (existing suite runs chromium/firefox/webkit) | — |
| npm | dependency mgmt | ✓ | 10.9.8 | — |
| Real EPUB corpus | D12-12 calibration | — | local + gitignored (user-supplied at calibration time, 11-06 pattern) | Synthetic fixtures cover code paths until the corpus lands; CI replay uses committed evidence |

**Missing dependencies with no fallback:** fast-xml-parser (by design — gated install; the blocking checkpoint is a task, not a blocker).
**Missing dependencies with fallback:** real-corpus calibration (synthetic fixtures + committed evidence replay keep CI honest in its absence).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| Config file | `playwright.config.ts` (existing; Vitest runs via package defaults) |
| Quick run command | `npm run test:unit -- --run tests/unit/server/epub-to-books.spec.ts` |
| Full suite command | `npm run test` (unit + e2e, honest full-suite gate — the 09-07/11 discipline) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-05/SC#1 | Upload → book grouping with expandable chapters | e2e | `npx playwright test epub-intake.spec.ts -g "book grouping"` | ❌ Wave 0 |
| ING-05/SC#2 | Chapter opens/paginates/annotates/restores identically; two modes | e2e (reuses persistence.spec tolerances — the 11-05 location-restore identity pattern) | `npx playwright test epub-intake.spec.ts -g "chapter reading"` | ❌ Wave 0 |
| ING-05/SC#3 | Cross-chapter nav + book progress + reopen-resume (D12-07) | e2e | `npx playwright test epub-intake.spec.ts -g "resume"` | ❌ Wave 0 |
| ING-05/SC#4 | Adapter isolation + no-epub.js (grep gate) + anchor gate per chapter | unit + grep | `npm run test:unit -- --run tests/unit/server/epub-to-books.spec.ts` + `grep -rn "epubjs\|epub.js" src/ server/` returns 0 | ❌ Wave 0 |
| ING-05 (parser) | container/OPF/nav/NCX parse + TOC-merge + fallback | unit | `npm run test:unit -- --run tests/unit/server/epub-to-books.spec.ts` | ❌ Wave 0 |
| ING-05 (DRM) | epub-protected refusal (LCP/ADEPT/unknown-alg) + font-obfuscation pass | unit | same spec, DRM describe block | ❌ Wave 0 |
| ING-05 (security) | Zip Slip corpus + bomb cap + entity/proto OPFs + remote-image downgrade | unit | same spec, security describe blocks (zip-slip corpus mirrors tests/unit/portability/zip-slip.test.ts vectors) | ❌ Wave 0 |
| ING-05 (honesty) | Zero-chapter refusal (`epub-empty`) + skip-disclosure + no library side effects | unit + e2e (11-05 no-side-effect assertion pattern: fixtures-baseline + zero epub-badged rows) | spec + e2e `-g "refuses"` | ❌ Wave 0 |
| ING-05 (portability) | Books/chapters in export→import round-trip; v1 bundle still imports; book conflict skip | unit + e2e (09-06 two-context A/B pattern) | portability suite extension | ❌ Wave 0 |
| ING-05 (calibration) | Real-corpus verdicts replay-pinned | unit (replay) | `npm run test:unit -- --run tests/unit/server/epub-calibration/replay.spec.ts` (mirror of pdf-calibration layout) | ❌ Wave 0 |
| ING-05 (a11y) | Book row disclosure semantics, context line, end-of-chapter link keyboard access | e2e (axe + keyboard) | a11y.spec.ts extension | partial (existing file) |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run tests/unit/server/epub-to-books.spec.ts` (+ the task's touched spec)
- **Per wave merge:** `npm run test:unit -- --run && npx playwright test epub-intake.spec.ts`
- **Phase gate:** Full `npm run test` green (exit 0, honest fail=0 record — the 04-11/09-07/11 precedent) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/server/epub-fixtures.ts` — self-verifying synthetic EPUB generator (fflate `zipSync`; mirrors 11-01's `serializePdf`: magic checks, corrupt variants, DRM-marker variants, deep-nested nav, degenerate TOC, publisher chapter-split, OEBPS-nested OPF, pre-TOC front matter; module-load self-check throws if fixtures lose discriminating power — the 10-04 seed-time self-verification precedent)
- [ ] `tests/unit/server/epub-to-books.spec.ts` — covers parser/TOC-merge/DRM/slip/bomb/caps/admission (REQ rows above)
- [ ] `tests/e2e/epub-intake.spec.ts` — upload → grouping → reading → resume → refusals (builds EPUBs in-test from the generator via `setInputFiles` buffer)
- [ ] `tests/unit/server/epub-calibration/` — MANIFEST.json + derive/replay harness (D12-12; mirror `pdf-calibration/`: `derive.spec.ts` gated by `EPUB_CALIBRATION_DERIVE=1`, committed `epub-evidence.json`, replay always-on, honest CI-absence failure)
- [ ] `tests/unit/library/book-filter.test.ts` — book/chapter search + tag-surface-book-row (D12-04)
- [ ] Shared fixtures: existing `tests/e2e/` helpers (openLibrary, wipeDatabase) reused — no new harness files

## Security Domain

> `security_enforcement: true`, ASVS Level 1 (config). The EPUB path extends the existing ingestion threat surface; no new auth/session/crypto scope.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local-first prototype; no accounts (Out of Scope) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No server-side resources beyond the stateless ingest endpoint |
| V5 Input Validation | **yes** | Zod-at-boundary on every request/response/persisted record (`IngestionRequestSchema` epub variant, `ArticleSchema` per chapter, `BookSchema`); fast-xml-parser hardening (`processEntities:false`, `onDangerousProperty` default-throw, `maxNestedTags`); extension + size caps at three enforcement points |
| V6 Cryptography | no (hashing only) | `node:crypto` sha256 for ids/traceability — never hand-roll; no decryption ANYWHERE (DRM refusal is detection-only) |

### Known Threat Patterns for EPUB ingestion (Node middleware + local-first client)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Zip bomb (decompression amplification) | DoS | fflate `filter: f.originalSize <= MAX_ENTRY_ORIGINAL_SIZE` — over-cap entries skipped BEFORE inflation (Phase 9 pattern; [VERIFIED: codebase ExportImportService.ts:182-184]) |
| Zip Slip (path traversal entries `../../evil`, `..%2F`, NUL, ADS) | Tampering | `isSafeEntryName` on EVERY entry before any use (Phase 9 SC#2 gate; extraction is in-memory but the gate protects the entry-consumption contract) [VERIFIED: codebase zipSlip.ts] |
| mXSS via chapter XHTML | Tampering/Elevation | `sanitizeExtractedHtml` (DOMPurify SANITIZE_CONFIG — the 07-04 mXSS-suite-covered surface); blocks are inert JSON before React ever sees them; `lint:no-danger` stays green |
| XML entity expansion (billion laughs) | DoS | fast-xml-parser `processEntities: false` ([VERIFIED: official docs — recommended "to prevent Entity Expansion (DoS) attacks"]) + whole-parse inside try→typed-refusal envelope |
| Prototype pollution via XML property names | Tampering | fast-xml-parser default `onDangerousProperty` throws on `__proto__`/`constructor`/`prototype` names [VERIFIED: official docs]; Zod `z.object` strips unknown keys on every downstream parse (the T-9-14 reasoning holds) |
| Hostile OPF/nav (10k nested tags, giant metadata) | DoS | `maxNestedTags: 40`; `EPUB_MAX_BYTES` 3-point enforcement; `EPUB_EXTRACTION_TIMEOUT_MS` race (pdfToBlocks pattern) |
| Tracking/SSRF-ish remote image fetch on chapter open | Info Disclosure | ALL figure blocks in epub-chapters downgrade to `UnsupportedBlock` (D12-16 text-first; relative srcs already fail the http(s) gate automatically) — the reader never fetches EPUB-embedded resources |
| DRM circumvention posture | Legal/Repudiation | Detection → typed refusal; no decryption code, no key handling, no marker bytes in logs |
| Oversized upload DoS | DoS | Client picker cap (pre-FileReader) → middleware content-length 413 → orchestrator decoded re-check (11-01 three-point pattern); middleware refusal reason branches pdf/epub (Pitfall 2) |

## Sources

### Primary (HIGH confidence)
- W3C EPUB 3.3 Recommendation (2026-01-13) — w3.org/TR/epub-33 — §4.2.6.3.1 container.xml shape, §4.3.3 mimetype rules, §4.4.5 font-obfuscation Algorithm URI, §5.5 metadata (required dc:* elements), §5.6 manifest/item, §5.7 spine/itemref (@linear), §7.4.2 toc nav, §5.9.5 NCX legacy (fetched in full this session)
- Readium LCP 1.0 spec — readium.org/lcp-specs — §2.2 encryption.xml LCP syntax, §7.1 "Detecting LCP Protected Publications" (fetched this session)
- IDPF OPF 2.0.1 — idpf.org/epub/20/spec/OPF_2.0.1_draft.htm — §2.2 metadata/creator, §2.3 manifest, §2.4 spine @toc, §2.4.1 NCX navMap structure + example (fetched this session)
- fast-xml-parser official docs — github.com/NaturalIntelligence/fast-xml-parser — README + docs/v4,v5/2.XMLparseOptions.md (XMLParser API, removeNSPrefix, isArray, processEntities, onDangerousProperty, maxNestedTags — fetched this session)
- npm registry + npm downloads API — fast-xml-parser 5.11.0/5.10.1 metadata, fflate OK (queried this session)
- Codebase (read this session): server/ingest.ts, server/htmlToBlocks.ts, server/pdfToBlocks.ts (header/contract), server/limits.ts, dev-server/ingest-middleware.ts, src/content/schema.ts, src/ingestion/types.ts, src/persistence/db.ts, src/persistence/locationStore.ts, src/ingestion/library/{LibraryView,libraryFilter,ContinueReadingStrip}.tsx, src/ingestion/IngestControl.tsx (grep), src/ingestion/LibrarySource.ts, src/portability/{bundle,zipSlip,ExportImportService}.ts, src/routes/ArticleView.tsx (header), package.json, .planning/phases/11-pdf-intake/11-01-unpdf-approval.md
- Project research (authoritative for this project): .planning/research/ARCHITECTURE.md Pattern 4/5/6 + L346/L783, PITFALLS.md Pitfalls 6/11/12, FEATURES.md §Area 2, STACK.md §7

### Secondary (MEDIUM confidence)
- DeDRM tools `ineptepub.py` (github.com/ApprenticeHarper/DeDRM_tools) — ADEPT detection reference implementation (`META-INF/rights.xml` + `http://ns.adobe.com/adept` encryptedKey); de-facto standard, not an official Adobe doc

### Tertiary (LOW confidence)
- None — every claim is either spec-verified, registry-verified, codebase-verified, or explicitly logged in the Assumptions table

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fflate/jsdom/DOMPurify/zod/Dexie all in-tree and read; fast-xml-parser verified against npm + official docs with the legitimacy table recorded; the only open choice (5.10.1 vs 5.11.0) is quarantined in Open Question 1 + the D12-15 gate
- Architecture: HIGH — every integration point read in source this session (orchestrator branch points, middleware cap coupling, response envelope, Dexie chain, bundle shape, UI mount points); the TOC-merge algorithm is a recommendation within a stated discretion area, with calibration as the safety net
- Pitfalls: HIGH — 9 of 10 derived from verified spec facts or codebase couplings found this session (Pitfall 2's middleware reason-hardcode and Pitfall 3's single-article envelope are code-verified, not hypothetical)
- DRM detection: HIGH for LCP + font-obfuscation (spec-verified), MEDIUM for ADEPT (reference implementation), covered-by-design for FairPlay (allowlist)

**Research date:** 2026-08-17
**Valid until:** 2026-09-16 (stable domain — EPUB 3.3 is a frozen W3C REC; re-verify only the fast-xml-parser pin at D12-15 time)
