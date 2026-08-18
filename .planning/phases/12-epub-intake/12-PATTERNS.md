# Phase 12: EPUB Intake - Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 25 (9 new, 16 modified)
**Analogs found:** 23 / 25 (2 novel-logic files lean on 12-RESEARCH.md §Code Examples)

> Reading note for the planner: this phase is overwhelmingly a **composition of proven in-tree primitives** (12-RESEARCH "Key insight": every "new" problem already has an in-tree answer). The two genuinely novel logics — the TOC→spine-range merge and the DRM allowlist — have NO in-tree analog and must be built from the verified XML shapes + detection table in 12-RESEARCH.md §Code Examples (L434-558). Everything else copies an existing file nearly line-for-line.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/epubToBooks.ts` (NEW) | service/adapter | transform (bytes → book + chapter drafts) | `server/pdfToBlocks.ts` | exact (adapter discipline; multi-chapter output is the only delta) |
| `server/ingest.ts` (MOD) | orchestrator | request-response | itself — pdf Stage-1 branch L264-296 | exact (fifth branch of existing chain) |
| `server/limits.ts` (MOD) | config | — | itself — Phase 11 block L69-109 | exact |
| `dev-server/ingest-middleware.ts` (MOD) | middleware | request-response | itself — refuseTooLarge L48-54 + guards L97-117 | exact (Pitfall 2 names the hardcoded `pdf-too-large` reason to fix) |
| `src/ingestion/types.ts` (MOD) | schema/config | request-response | itself — pdf variant L31-38 + `PDF_MAX_BYTES` L43-53 | exact |
| `src/content/schema.ts` (MOD) | model/schema | — | itself — `ArticleSourceSchema` L210-217 + `ReaderSettingsSchema` v1\|v2 union L273-302 | exact |
| `src/persistence/db.ts` (MOD) | model/store | CRUD | itself — v4 append block L139-164 | exact |
| `src/persistence/booksStore.ts` (NEW) | store/service | CRUD | `src/persistence/locationStore.ts` + `src/ingestion/library/tagsStore.ts` | role-match (store seam convention) |
| `src/ingestion/IngestionClient.ts` (MOD) | service | request-response | itself — `ingestPdf` L109-114 | exact |
| `src/ingestion/IngestControl.tsx` (MOD) | component | request-response | itself — `isPdf` branch L201-232 + `mapReasonToCopy` L51-83 | exact |
| `src/ingestion/LibrarySource.ts` (MOD) | service | CRUD | itself — `remove()` cascade transaction L108-151 | exact (book-level cascade clones it) |
| `src/ingestion/library/LibraryView.tsx` (MOD) | component | request-response | itself — list render L156-170 | exact |
| `src/ingestion/library/BookRow.tsx` (NEW) | component | request-response | `src/ingestion/library/LibraryRow.tsx` | exact (chapter sub-rows reuse this anatomy verbatim) |
| `src/ingestion/library/ContinueReadingStrip.tsx` (MOD) | component | request-response | itself — latestByArticle Map L72-78 | exact |
| `src/ingestion/library/libraryFilter.ts` (MOD) | utility | transform | itself — haystack L76-86 | exact |
| `src/ingestion/library/SourceBadge.tsx` (MOD) | component | — | itself — exhaustive switch L35-50 | exact |
| `src/routes/ArticleView.tsx` (MOD) | component | request-response | itself — header L1408-1439 ("Originally published at" link L1417-1422) | exact |
| `src/persistence/locationStore.ts` (MOD) | store/service | CRUD | itself — `loadAllLocations` L136-147 | exact (book resume/progress derive from these rows; D12-03/D12-07) |
| `src/portability/bundle.ts` (MOD) | schema | — | itself + `ReaderSettingsSchema` v1\|v2 union precedent (schema.ts L280) | exact |
| `src/portability/ExportImportService.ts` (MOD) | service | file-I/O + CRUD | itself — `buildBundleBytes` L72-118 + `applyImport` L292-342 | exact |
| `tests/unit/server/epub-fixtures.ts` (NEW) | test utility | transform | `tests/fixtures/pdf/generate-synthetic-pdfs.ts` | exact (self-verifying generator) |
| `tests/unit/server/epub-to-books.spec.ts` (NEW) | test | — | `tests/unit/server/pdf-to-blocks.spec.ts` | exact |
| `tests/unit/server/epub-calibration/` (NEW) | test | batch | `tests/unit/server/pdf-calibration/` | exact (derive/replay/manifest/evidence mirror) |
| `tests/e2e/epub-intake.spec.ts` (NEW) | e2e test | — | `tests/e2e/pdf-intake.spec.ts` | exact |
| `tests/unit/library/book-filter.test.ts` (NEW) | test | — | `tests/unit/library-search.test.ts` | exact |

Plus: `package.json` (fast-xml-parser exact-pin — D12-15 blocking human gate BEFORE install; the 11-01 unpdf precedent recorded in `.planning/phases/11-pdf-intake/11-01-unpdf-approval.md`).

## Pattern Assignments

### `server/epubToBooks.ts` (NEW — service/adapter, transform)

**Analog:** `server/pdfToBlocks.ts` — the fourth-intake adapter this file becomes the sibling of. Copy its file anatomy: header comment naming the plan/decision lineage + security-boundary notes, thresholds object, typed error mapping, resource-cap assertions, pure exported helpers for unit testability.

**File-header + server-only dependency discipline** (`pdfToBlocks.ts` L42-45):
```typescript
// Server-only (Pitfall 8-6 / 12): `unpdf` (and its bundled pdfjs) is a
// server-side dependency and is never imported by `/src/*` modules at runtime.
// Only the `Block` / `InlineRun` types cross from src (erased by tsc), so the
// client bundle does not grow.
```
→ EPUB version: fflate (already dual-side per Phase 9 allowlist) + **fast-xml-parser joins unpdf/jsdom behind `/server` imports**; only `Block`/`InlineRun` types cross.

**Calibratable thresholds object** (`pdfToBlocks.ts` L82-186 — copy the shape, not the values):
```typescript
export const PDF_THRESHOLDS = {
  bandYToleranceRatio: 0.3,
  // ...every detection/assembly number lives HERE so the calibration harness
  // (11-06) can import the exact values that produced a recorded verdict and
  // re-tune them in one place.
} as const;
```
→ `export const EPUB_THRESHOLDS = { minChapterBlocks: …, tocMergeMinEntries: 2, … } as const;` — replay.spec pins it against the evidence snapshot exactly as `replay.spec.ts` L47-51 pins `PDF_THRESHOLDS`.

**Typed error mapping + pre-extraction cap** (`pdfToBlocks.ts` L582-612):
```typescript
export function mapPdfjsError(err: unknown): IngestionError | null {
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    if (name === "PasswordException") {
      // Never decrypt (T-11-06) — refuse with the typed reason.
      return new IngestionError(
        "pdf-encrypted",
        "This PDF is password-protected, so its text cannot be read.",
      );
    }
  }
  return null;
}

export function assertPageCap(numPages: number): void {
  if (numPages > PDF_MAX_PAGES) {
    throw new IngestionError("pdf-too-large", `…`);
  }
}
```
→ `epub-protected` (DRM allowlist refusal — detection only, never decrypt), `epub-unreadable` (unparseable container/OPF), `assertChapterCap(chapterCount)` mirroring `assertPageCap`.

**Timeout race + cleanup** (`pdfToBlocks.ts` L620-656, `withPdfDocument`): `Promise.race([op, timeoutPromise])` with `clearTimeout` in `finally`. → `EPUB_EXTRACTION_TIMEOUT_MS` races the whole unzip+parse+per-chapter loop (limits.ts L86-90 precedent: mirrors `REQUEST_TIMEOUT_MS`).

**Output contract** — the one DELIBERATE divergence. `pdfToBlocks.ts` L1086-1092 returns `{blocks, footnotes, lang, provenancePartial, isReaderable}`; `epubToBooks` returns the multi-chapter shape from 12-RESEARCH.md L239-253 (`{bookMeta, chapters: ChapterDraft[], skippedCount, originalFileHash}`). The per-chapter `ChapterDraft` carries the SAME five fields so stages 2+ run unchanged per chapter.

**Chapter normalization is a CALL, not a build** — `server/htmlToBlocks.ts`:
```typescript
// htmlToBlocks.ts L113-117
export function sanitizeExtractedHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  clearWindow();
  return clean;
}
```
Call `sanitizeExtractedHtml(xhtml)` → `new JSDOM(sanitized)` → `htmlToBlocks(dom.window.document, undefined)` per spine item (the `extractAndNormalize` steps 6 at L507-509 — but SKIP Readability/isProbablyReaderable; chapters are already content, 12-RESEARCH anti-pattern L332). Then post-process: **every `figure` block in an epub-chapter downgrades to `unsupported`** — the http(s) gate at `htmlToBlocks.ts` L223-231` (`if (/^https?:/i.test(src)) … return [{kind:"figure"…}]`) means relative EPUB images already auto-downgrade; remote srcs need the explicit `epubToBooks` pass (Pitfall 5 / T-12-05 IP-leak).

**No in-tree analog for:** TOC→spine-range partition (D12-09), DRM allowlist (Pattern 3), href normalization (Pitfall 1). Build from 12-RESEARCH.md L434-558 verified XML shapes + the fast-xml-parser options block (L514-533) + DRM gate pseudocode (L538-558) — those are spec-verified and liftable.

---

### `server/ingest.ts` (MOD — fifth Stage-1 branch + multi-article response)

**Analog:** itself — the pdf branch is the template the epub branch clones.

**Stage-1 branch shape** (`ingest.ts` L264-296):
```typescript
} else if (hasPdf) {
  const { pdf: b64, filename } = input as { pdf: string; filename?: string };
  const bytes = Buffer.from(b64, "base64");
  // Decoded re-check — the third enforcement layer (after the client
  // picker cap and the middleware content-length guard).
  if (bytes.byteLength > PDF_MAX_BYTES) {
    throw new IngestionError("pdf-too-large");
  }
  finalUrl = undefined;
  const extracted = await pdfToBlocks(new Uint8Array(bytes));
  // …destructure…
  id = `pdf-${shortHash(b64)}`;      // content-hash id — dedupe-refuse (D7-07)
  source = "pdf";
  origin = "upload";
  sourceBytes = b64;
  pdfFilenameHint = filename;        // closure stash for the title chain
}
```
→ EPUB branch: `{epub: b64, filename?}` → decoded re-check vs `EPUB_MAX_BYTES` → `epubToBooks(bytes)` → **book id `epub-${shortHash(b64)}` + per-chapter `epub-${shortHash(b64)}-c${NN}`** (12-RESEARCH L580-584), then loop stages 2+ per chapter.

**Per-chapter stages 2+ run through the EXISTING code** — the loop body reuses `ArticleSchema.parse` (L396) + `assertRoundTripAnchor` (L62-87, imported unchanged — SC#4) + `deriveConfidence` (L409) + stamp (L420-423). A chapter failing extraction/anchor gate is caught per-chapter → `skippedCount++` (D12-11), NOT a whole-book refusal; only `chapters.length === 0` refuses (`epub-empty`).

**Title chain + doubled-title consume** (`ingest.ts` L349-367): the EPUB arm gets `bookMeta.title` (OPF `dc:title` — spec-REQUIRED, always present) → `stripEpubExtension(filename)` → `"Book"`. `consumeDuplicatedTitle` (L148-162) applies per chapter when its first heading matches the chapter title (the D11-09 EPUB analog, 12-RESEARCH Pattern 4).

**Catch envelope** (L432-442) is reuse — `IngestionError.reason` passes through verbatim; new epub reasons need zero orchestrator catch changes.

---

### `src/ingestion/types.ts` + `src/content/schema.ts` (MOD — additive widening)

**Analog:** themselves — every prior widening is in-file.

**Request variant** (`types.ts` L31-38 — the epub variant is a line-for-line clone):
```typescript
z.object({
  pdf: z.string().base64().min(1),
  filename: z.string().optional(),
}),
```
→ `z.object({ epub: z.string().base64().min(1), filename: z.string().optional() })`.

**Shared cap constant placement** (`types.ts` L43-53): `PDF_MAX_BYTES` lives in `/src` because `/src→/server` imports are forbidden; `server/limits.ts` L78-79 re-exports it. `EPUB_MAX_BYTES` follows identically (recommendation: `= PDF_MAX_BYTES = 10MB`, 12-RESEARCH A2).

**Failure enum widening** (`types.ts` L67-84): new members slot in AFTER the pdf block, BEFORE `already-in-library`/`server-error` (the established ordering rule, L65-66): `epub-protected`, `epub-unreadable`, `epub-empty`, `epub-too-large` (+ any granularity split the researcher's enumeration lands on).

**Source enum widening** (`schema.ts` L210-217 — the comment at L205 already anticipates this):
```typescript
export const ArticleSourceSchema = z.enum([
  "fixture", "url", "paste",
  "markdown",   // Phase 8 — D8-16
  "html-upload",// Phase 8 — D8-15
  "pdf",        // Phase 11 — ING-04
]);             // ← append "epub-chapter", // Phase 12 — ING-05
```
`IngestionMetaSchema` (L225-238) gains `bookId: z.string().regex(/^[a-z0-9-]+$/).optional()` + `chapterIndex: z.number().int().min(0).optional()` — additive-optional, existing rows parse unchanged (the L247-249 `ingestionMeta` pattern).

**BookSchema** lands in `schema.ts` beside `ArticleSchema` — recommended Zod shape is fully specified in 12-RESEARCH.md L564-577 (lift verbatim; id regex reuses ArticleSchema's `/^[a-z0-9-]+$/` L241).

**Bundle versioning precedent** (`schema.ts` L273-302): `ReaderSettingsSchema` accepts `z.union([z.literal(1), z.literal(2)])` so a v1 row hydrates via `.default()`. The bundle's `schemaVersion: z.union([z.literal(1), z.literal(2)])` + `books: z.array(BookSchema).optional()` copies exactly this mechanism (12-RESEARCH L608-613).

---

### `src/persistence/db.ts` (MOD — Dexie v5 append) + `src/persistence/booksStore.ts` (NEW)

**v5 append** — clone the v4 block verbatim (`db.ts` L139-164):
```typescript
this.version(4).stores({
  articles: "id, revision, source, addedAt, *tags",
  settings: "key",
  location: "[articleId+revision]",
  highlights: "id, [articleId+revision]",
  notes: "id, highlightId",
});
```
→ v5: `articles: "id, revision, source, addedAt, *tags, bookId"` + `books: "id, title"` (12-RESEARCH L592-601). Rules encoded in the v4 comment: NO `.upgrade()`, v1-v4 byte-unchanged, full stores object re-declared at each version. Add the `books!: Table<Book, string>` property annotation (the L68-79 definite-assignment precedent).

**booksStore seam** — copy `locationStore.ts` conventions: header citing locked decisions, `import type` for types, discriminated load result, Zod safeParse on read, `classifyStorageError` routing (L40-88). Surface: `listBooks()` / `getBook(id)` / `saveBook(book, chapters)` (ONE transaction — Pitfall 11 #3 anti-pattern L336) / `removeBook(id)` cascade. The cascade reuses `DexieLibrarySource.remove` per chapter inside one outer transaction — clone the collect-before-delete discipline (`LibrarySource.ts` L116-125: highlight ids are collected BEFORE deletion because in-transaction reads would otherwise see zero rows).

---

### `src/ingestion/library/BookRow.tsx` (NEW — component)

**Analog:** `LibraryRow.tsx` — chapter sub-rows reuse its anatomy byte-stably (D12-01).

**Structure to replicate** (`LibraryRow.tsx` L67-99): `<li className="library-row">` → `<article>` → byte-stable `<h2 id={`title-${id}`}>` + `.meta` author + `<SourceBadge />` + `<ProgressHairline />` + Open-article link `<a href={`#/article/${id}`} aria-labelledby={`title-${id}`}>`. The book row wraps this: a real `<button aria-expanded>` chevron toggling a region containing the chapter `<ul>` (12-RESEARCH Pattern 7 L314-317 — row-click does NOT toggle; two gestures, two targets).

**Finished-state + hairline algebra** (`LibraryRow.tsx` L59-65 + `ContinueReadingStrip.tsx` L46):
```typescript
const FINISHED_RATIO = 0.98;   // LibraryRow L35
// ContinueReadingStrip L46 — the EXPORTED single source of truth
export const FINISHED_THRESHOLD = 0.98;
```
Book progress (D12-03) = count(chapters with location ratio ≥ `FINISHED_THRESHOLD`) / `chapterArticleIds.length` — import `FINISHED_THRESHOLD`, never fork the constant. Resume chapter (D12-07) = the chapter whose LocationRecord has max `savedAt` — the exact `latestByArticle` Map fold at `ContinueReadingStrip.tsx` L72-78 / `LibraryView.tsx` L78-84, applied over the book's chapter ids.

**08-05 CSS lesson** (12-RESEARCH Pattern 7 L317): chapter sub-rows live INSIDE the book `<li>` so `.library-list > li` direct-child selectors and e2e row counts keep working.

---

### `src/routes/ArticleView.tsx` (MOD — context line + end-of-chapter link)

**Analog:** itself — the header block.

**Context line mount point** (`ArticleView.tsx` L1408-1422): insert the D12-08 `<p className="meta">Book Title · Chapter 4 of 12</p>` as a sibling of the existing `.meta` provenance paragraph, epub-chapter only:
```typescript
<header>
  <h1>{article.provenance.title}</h1>
  {(article.provenance.author || article.provenance.publishedAt) && (
    <p className="meta">…</p>
  )}
  {sourceUrl !== undefined && domain !== undefined && (
    <a href={sourceUrl} rel="noopener noreferrer" target="_blank">
      Originally published at {domain}…
```
The book record lookup follows the `booksStore` seam (12-RESEARCH Pattern 8 L323 recommends `db.books.get` via a tiny store; ArticleView already tolerates missing metadata gracefully).

**End-of-chapter link** (D12-05): a real focusable `<a href={`#/article/${nextChapterId}`}>` — the plain hash-assignment navigation precedent at `LibraryView.tsx` L118 (`window.location.hash = "#/review"`). Scrolling mode: after `<ArticleBody article={article} />` (L1499) inside the article flow; paginated mode: after the last page fragment's content inside `.page-viewport` (L1474-1496 — planner probe per 12-RESEARCH Open Question 2). Previous-chapter link symmetric at chapter start. Keyboard: Tab/Enter only — page-turn keys untouched.

---

### `src/ingestion/IngestControl.tsx` + `IngestionClient.ts` (MOD — .epub picker arm + book save)

**Extension sniff + earliest cap** (`IngestControl.tsx` L201-232 — clone for `.epub`):
```typescript
const isPdf = /\.pdf$/i.test(file.name);
if (isPdf) {
  if (file.size > PDF_MAX_BYTES) { … mapReasonToCopy("pdf-too-large") … return; }
}
// …
const bytes = new Uint8Array(await file.arrayBuffer());
const b64 = bytesToBase64(bytes);          // L94-102 — chunked, reuse as-is
result = await ingestPdf(b64, file.name);
```
→ `const isEpub = /\.epub$/i.test(file.name)` + `EPUB_MAX_BYTES` cap BEFORE any `FileReader`/`arrayBuffer` read (Pitfall 9, 12-RESEARCH L418-420). Widen `accept=".md,.html,.pdf,.epub"` (L316) + the `.meta` copy (L310). The book save path replaces the single-article `has`/`save` (L238-245) with **book-level** `has(book.id)` dedupe-refuse + `saveBook` one-transaction write (Pitfall 3, 12-RESEARCH L378).

**Client wrapper** (`IngestionClient.ts` L109-114): `ingestEpub(b64, filename?)` clones `ingestPdf`; the multi-article ok-variant needs a NEW return type (`{book, articles[], confidence, skippedCount}`) and per-article `ArticleSchema.parse` re-validation in a loop (STATE-04 defense-in-depth, L162-168 precedent). `IngestionResponseSchema` (types.ts L94-106) widens with the second ok-variant — existing variant byte-stable.

**mapReasonToCopy** (`IngestControl.tsx` L51-83): add the epub cases with calm DOC-06 strings — copy the research's locked phrasings, e.g. `"This book is protected by DRM and cannot be added."` (12-RESEARCH L281). Exported for `tests/unit/…-copy.test.ts` assertions (the L48-49 pdf-copy precedent).

---

### `dev-server/ingest-middleware.ts` + `server/limits.ts` (MOD — cap coupling fix)

**The Pitfall 2 target** (`ingest-middleware.ts` L48-54 — currently hardcoded):
```typescript
function refuseTooLarge(res: ServerResponse): void {
  res.statusCode = 413;
  res.end(JSON.stringify({ ok: false, reason: "pdf-too-large" } satisfies IngestionResponse));
}
```
→ Branch the reason on the parsed body shape (`pdf` vs `epub` key) and derive `MAX_INGEST_BODY_BYTES` from `max(PDF_MAX_BYTES, EPUB_MAX_BYTES)` in `limits.ts` L109 (same `Math.ceil((BYTES * 4) / 3) + 2048` formula). The two-guard structure (content-length pre-read L99-106 + post-read byte re-check L110-117) stays byte-identical.

**limits.ts Phase-11 block** (L69-109) is the template for the Phase-12 block: EPUB caps comment-cite their research source, `EPUB_MAX_BYTES` re-exported from `/src` per the L74-79 import-direction rule.

---

### `src/portability/bundle.ts` + `ExportImportService.ts` (MOD — books ride the bundle)

**Schema widening** (`bundle.ts` L30-41): `schemaVersion: z.union([z.literal(1), z.literal(2)])` + `books: z.array(BookSchema).optional()`; update the L13-16 comment that documents books-absence as the forward-compatible form (Phase 12 fills it). Writers emit 2; the D9-04 newer-version peek at `ExportImportService.ts` L221-227 (`peeked > 1`) bumps to `> 2` — v1 bundles keep importing exactly as before (union read, never literal-only; anti-pattern L338).

**Export assembly** (`ExportImportService.ts` L72-118): add `loadAllBooks()` to the `Promise.all` + `books` into `ExportBundleSchema.parse` self-check.

**Import apply** (`ExportImportService.ts` L292-342): `db.books` joins the transaction table set; puts-only closure rule (L276-289 — no Zod/crypto/network inside the Dexie transaction) is load-bearing. Book-id conflicts resolve skip-by-default in `conflicts.ts` (D9-14 table extension); orphan chapters import as standalone epub-chapter articles (12-RESEARCH Pattern 9 L327).

---

### Test files (NEW — 5 files)

**`tests/unit/server/epub-fixtures.ts`** — analog `tests/fixtures/pdf/generate-synthetic-pdfs.ts`: build EPUBs in-process via fflate `zipSync` (the import discipline at `ExportImportService.ts` L35: only `zipSync/unzipSync/strToU8/strFromU8`), with the module-load self-check (magic prefix / size floor / corrupt marker / byte-identical regeneration — L432-456). Fixture matrix from 12-RESEARCH Wave-0 L708: DRM-marker variants, deep-nested nav, degenerate single-entry TOC, publisher chapter-split, OEBPS-nested OPF, pre-TOC front matter, corrupt, entity-bomb, proto-pollution OPF.

**`tests/unit/server/epub-to-books.spec.ts`** — analog `pdf-to-blocks.spec.ts` (stub-injectable surfaces + synthetic fixtures; DRM/slip/bomb/caps describe blocks per 12-RESEARCH L694-696). Zip Slip vectors mirror `tests/unit/portability/zip-slip.test.ts`.

**`tests/unit/server/epub-calibration/`** — mirror `pdf-calibration/` file-for-file: `manifest.json` (filename + SHA-256 + expected shape), env-gated `derive.spec.ts` (`describe.skipIf(process.env.EPUB_CALIBRATION_DERIVE !== "1")` — derive.spec.ts L36-38), always-on `replay.spec.ts` with the loud missing-record message (replay.spec.ts L25-34: `"calibration requires the local corpus — see docs/…"`) + the thresholds pin (L47-51), `harness.ts`, committed evidence JSON, gitignored corpus at `corpus/epub/` (derive.spec.ts L28 layout precedent).

**`tests/e2e/epub-intake.spec.ts`** — analog `tests/e2e/pdf-intake.spec.ts`; builds EPUBs from the generator via `setInputFiles` buffer; no-side-effect refusal assertions (fixtures-baseline + zero epub-badged rows, the 11-05 pattern).

**`tests/unit/library/book-filter.test.ts`** — analog `tests/unit/library-search.test.ts`; pure-function coverage of book+chapter haystack and tag-surfaces-book-row (D12-04).

## Shared Patterns

### Typed refusal catalog + calm copy (applies to: types.ts, epubToBooks, IngestControl, middleware)
Every refusal is an `IngestionError` carrying a `.reason` from `IngestionFailureReasonEnum` (`server/errors.ts` L20-31 — `.reason` is the CONTRACT); the client maps reason → DOC-06 phrase ONLY in `mapReasonToCopy` (`IngestControl.tsx` L51-83). New epub members: enum first, calm string second, copy-test third (`tests/unit/pdf-copy.test.ts` precedent).

### Content-hash ids + dedupe-refuse (applies to: ingest.ts epub branch, IngestControl save path)
`id = \`pdf-${shortHash(b64)}\`` (`ingest.ts` L288, shortHash L94-96) → `epub-<shortHash>`-book + `-cNN` chapters; `has(id)` BEFORE save (`IngestControl.tsx` L145-150) — book-level for EPUB.

### Zip discipline: bomb cap + Slip gate on EVERY entry (applies to: epubToBooks)
```typescript
// ExportImportService.ts L182-184 — the Phase 9 bomb cap (skip before inflation)
entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
  filter: (f) => f.originalSize <= MAX_ENTRY_ORIGINAL_SIZE,
});
// L189-194 — SC#2 hard gate, every entry, before any byte use
for (const name of Object.keys(entries)) {
  if (!isSafeEntryName(name)) { …refuse… }
}
```
Reuse `src/portability/zipSlip.ts` `isSafeEntryName` as-is — never re-derive (Don't Hand-Roll table). EPUB entry cap reuses `MAX_ENTRY_ORIGINAL_SIZE` discipline with an EPUB-appropriate constant.

### Additive schema/store widening — Pitfall 9 (applies to: schema.ts, types.ts, db.ts, bundle.ts)
Every persisted-shape change is `.optional()`/`.default()`-carrying (`schema.ts` L247-256 pattern); every Dexie change is an APPENDED version block with v1-vN byte-unchanged and NO `.upgrade()` (`db.ts` L139-164); enum widenings append members with a Phase comment (`schema.ts` L210-217); versioned envelopes read as unions and write the new literal (`schema.ts` L280 + bundle).

### One Dexie transaction per user action (applies to: booksStore.saveBook/removeBook, applyImport)
Clone `DexieLibrarySource.remove` (`LibrarySource.ts` L108-151): explicit table set, collect FK ids BEFORE deleting, puts/deletes only inside the closure. The applyImport comment rule (`ExportImportService.ts` L276-289): NO async-non-Dexie work inside the transaction.

### Store seam conventions (applies to: booksStore)
`settingsStore.ts`/`locationStore.ts`: header citing decisions, `import type`, discriminated `{ok:true|false, reason}` load result, `safeParse` per row with corrupt-row drop, `classifyStorageError` routing, module-level exported functions as the single-import surface.

### Zod-at-boundary, twice (applies to: orchestrator + IngestionClient)
Server parses (`ArticleSchema.parse`, ingest.ts L396); client re-parses on the network read (`IngestionClient.ts` L166). EPUB: per chapter server-side, per chapter client-side.

### Three-point cap enforcement (applies to: EPUB_MAX_BYTES + EPUB_MAX_* caps)
Client picker (pre-read) → middleware content-length → orchestrator decoded re-check (ingest.ts L271-277 comment names all three). One shared constant in `src/ingestion/types.ts`, re-exported from `server/limits.ts` (L74-79).

### Calibration discipline (applies to: epub-calibration/)
Real corpus local + gitignored; committed MANIFEST + committed derived evidence; derive env-gated (`describe.skipIf`), replay always-on with loud CI-absence failure; thresholds pinned to the evidence snapshot (all four files under `tests/unit/server/pdf-calibration/`).

## No Analog Found

Files/sub-problems with no in-tree match — planner builds from 12-RESEARCH.md verified examples instead:

| Item | Why no analog | Build from |
|------|---------------|------------|
| TOC→spine-range merge (D12-09) | No XML/multi-document partitioning exists in tree | 12-RESEARCH Pattern 4 L285-295 + verified nav/NCX shapes L478-509; href normalization Pitfall 1 L360-364 |
| DRM allowlist detection (Pattern 3) | No DRM surface exists (pdf-encrypted is a pdfjs error-name map) | 12-RESEARCH L272-281 table + L538-558 gate code (spec-verified LCP/ADEPT/font-obfuscation signatures) |
| fast-xml-parser integration | First XML-manifest parser in tree | 12-RESEARCH L514-533 options block (`processEntities:false`, `removeNSPrefix:true`, `isArray`, `maxNestedTags:40`); D12-15 human gate precedes install |

## Metadata

**Analog search scope:** `server/`, `src/ingestion/**`, `src/persistence/`, `src/portability/`, `src/routes/`, `dev-server/`, `tests/unit/server/`, `tests/unit/portability/`, `tests/fixtures/pdf/`, `tests/e2e/`
**Files read in full this session:** 22 (all excerpts above cite exact line numbers from this session's reads)
**Pattern extraction date:** 2026-08-17
**Cross-references:** 12-CONTEXT.md `<canonical_refs>` (ARCHITECTURE Pattern 4 L359-419, PITFALLS 6/11/12), 12-RESEARCH.md §Code Examples L434-613
