# Phase 11: PDF Intake - Research

**Researched:** 2026-08-16
**Domain:** Server-side PDF text extraction (unpdf/pdfjs-dist), layout analysis (column/scanned detection), honest-failure intake pipeline extension, threshold calibration harness
**Confidence:** HIGH (API surface verified from the shipped unpdf 1.8.1 tarball `.d.ts` + source; algorithm recipe web-verified; heuristic starting values ASSUMED pending corpus calibration by design)

## Summary

Phase 11 is the fourth intake adapter: `server/pdfToBlocks.ts` sits beside `markdownToBlocks` as a sibling Stage-1 extractor, the orchestrator (`server/ingest.ts`) gains a fourth `{pdf, filename?}` branch, and every downstream stage (`ArticleSchema.parse` → `assertRoundTripAnchor` → `deriveConfidence` → stamp) runs unchanged on the produced Block tree. The load-bearing research question was **D11-08's API verification**: does unpdf expose outline→destination mapping without adding raw pdfjs-dist? **Yes — verified.** `getDocumentProxy()` returns a full `PDFDocumentProxy` whose `getOutline()` / `getDestination(id)` / `getPageIndex(ref)` are all present in unpdf's bundled type declarations (`dist/types/src/display/api.d.ts` L983, L908, L892). The escape hatch (degrade to font-size-only) is NOT needed. `extractTextItems` returns exactly the ARCHITECTURE Pattern-3 shape: per-page `{str, x, y, width, height, fontSize, fontFamily, dir, hasEOL}`, with x/y in PDF space (**origin bottom-left, y increases UP** — items must be sorted y-descending for reading order) and `fontSize = Math.hypot(transform[2], transform[3])`.

The second research pillar is **detection**. For multi-column (D11-01/02/03), the naive "zero-coverage x-histogram" approach is a documented failure mode — full-width spanning elements (headers, pull quotes, callouts) fill the gutter. The verified working recipe (ginexys engineering journal, 2026-05-30, corroborated by pymupdf4llm's production `column_boxes`): bin items into Y-bands, **exclude bands spanning >~55% of text width**, give each remaining narrow band **one binary vote per x-pixel** (immune to dense/sparse disparity), and call a gutter any contiguous x-run where band coverage falls below **~20% of narrow-band count** with width ≥ ~1em. For scanned detection: per-page non-whitespace item counts with a page-weighted majority verdict. All numeric thresholds are corpus-calibrated starting values per D11-02/06 — the calibration harness (manifest + gitignored local corpus + committed evidence record + CI replay) mirrors the Phase 3 `fingerprint.json` discipline with a refuse-empty-input guard.

Third: **transport and limits**. PDF is binary; the additive request variant is base64-in-JSON (`{pdf: base64, filename?}`) through the existing JSON middleware unchanged — a ~33% inflation the caps must account for. Resource limits verified against the unpdf "Processing Untrusted PDFs" guidance: `maxImageSize` is **total PIXELS (w×h), not bytes** (16_777_216 ≈ 16MP; ARCHITECTURE.md's "16 MB" label is a misnomer to correct in the plan), `numPages` must be checked **before** calling `extractTextItems` (it processes ALL pages in one call), and extraction must be raced against a timeout because the serverless pdfjs build runs on the event loop. One legitimacy note: the seam rates unpdf `SUS (too-new)` — triggered solely by the 1.8.1 publish date (2026-08-13, three days ago); signals are otherwise clean (1.85M weekly downloads, unjs org, MIT, no postinstall). Keep the install behind a `checkpoint:human-verify`, which conveniently also covers the 1.8.0-vs-1.8.1 pin confirmation (diff verified trivial: a `Math.sumPrecise` polyfill refactor, zero API changes).

**Primary recommendation:** Build `pdfToBlocks` as the markdown-adapter sibling using ONE `getDocumentProxy` (with `maxImageSize` passed) reused across `extractTextItems` + `getMeta` + `getOutline` + destination resolution; detect scanned + multi-column page-weighted BEFORE block assembly; refuse via new typed enum members through the existing DOC-06 calm-copy surface; gate promotion on the calibration harness's committed evidence record per D11-06.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (do NOT re-litigate)

**Carrying forward from Phases 7/8:** Doc model is the security boundary (PDFs carry no HTML → no DOMPurify on this path, mirrors D8-16); calm DOC-06 voice for every refusal (new typed reasons map via existing `mapReasonToCopy`); Pitfall 9 Dexie discipline (PDF articles are ordinary `articles` rows; `source: "pdf"` widening is additive enum); `IngestionRequestSchema` widens additively with a `{pdf, filename?}` variant; `ArticleSourceSchema` gains `"pdf"`.

**Multi-column policy:** D11-01 detect + refuse, NO reconstruction in Phase 11. D11-02 balanced detection tuning — thresholds tune both directions and the calibration corpus MUST include borderline cases (pull quotes, sidebars, indented blockquotes). D11-03 page-weighted majority verdict — refuse only when columnar pages dominate (>~50% of text-bearing pages, exact ratio corpus-calibrated); stray columnar regions inside an admitted document extract in naive order as tolerated noise.

**Calibration corpus:** D11-04 real PDFs, LOCAL-ONLY, evidence replay in CI (user-accepted CI limitation; committed derived evidence only — never commit PDFs, never synthesize fixtures to make CI re-derive). D11-05 committed manifest + ~6–10 real PDFs across 4 classes (single-column / scanned / multi-column / borderline) spanning producers (Word, LaTeX, InDesign/print); CI absence fails honestly. D11-06 promotion bar = classification correctness for every corpus PDF AND ≥90% block-level structural agreement vs human-labeled ground truth for admitted PDFs (exact ratio tunable by research against corpus results).

**Title & headings:** D11-07 title chain = sanity-checked Info-title → filename minus `.pdf` → neutral "PDF document" (garbage-pattern list is researcher's). D11-08 outline-first heading detection with font-size fallback — RESEARCH MUST VERIFY unpdf exposes outline→destination mapping (✅ verified — see Patterns). D11-09 page-1 largest-text title match → consume as title, emit NO heading block (one-h1-per-page discipline).

**Load-bearing invariants:** every admitted PDF passes `ArticleSchema.parse` + `assertRoundTripAnchor` (same 7-stage stages 2+); unpdf is THE PDF library (rejected: raw pdfjs-dist, pdf-parse, mupdf-js) — pin exact; resource limits (maxImageSize ~16M, numPages cap ~500, timeout race) checked before extraction; figures/tables → `UnsupportedBlock` with `plainDescription`; one article per PDF, chapter detection deferred; unpdf lives in `/server`, never the client bundle; D7-07 save-once + dedupe-refuse with `pdf-<shortHash>` id; Pitfall 2 one-normalizer discipline — PDF-specific joins go through the shared normalizer if needed, never a fork.

### the agent's Discretion
- Column-detection algorithm specifics (x-clustering method, gap thresholds, minimum text-bearing-page definition, exact majority ratio)
- Scanned-detection threshold quantification (bytes-per-page / items-per-page floor)
- Garbage-title pattern list (chain shape locked by D11-07)
- Ground-truth label format + ≥90% agreement metric definition (exact match vs boundary tolerance)
- Resource-limit exact values (maxImageSize / numPages cap / timeout numbers)
- New failure-reason granularity (one `pdf-unreadable` vs separate scanned/multi-column/encrypted reasons) + calm copy
- PDF upload UI details (`accept` gains `.pdf`; binary body handling + client size cap)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-04 | Reader can add a document by uploading a PDF; text is extracted and normalized, with honest failure when a PDF is scanned/image-only or unrecoverably multi-column. | `extractTextItems` verified (positioned items with fontSize — unpdf src + tarball types); scanned/multi-column detection recipes (§Patterns 3–4); typed refusal reasons through existing DOC-06 surface (§Pattern 7); outline-first heading detection verified implementable via `PDFDocumentProxy.getOutline` (§Pattern 5); calibration harness + evidence-replay bar (§Pattern 8) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PDF file pick + base64 encode + client size cap | Browser / Client | — | File API + `accept=".pdf"`; refuses oversized files before any network cost (T-8-14 precedent) |
| PDF binary transport | API / Backend (Vite Node middleware) | — | Existing `/api/ingest` JSON POST; base64-in-JSON keeps middleware byte-unchanged |
| PDF parsing / text extraction / layout analysis | API / Backend (`/server`) | — | unpdf is server-only (ARCHITECTURE L984); pdfjs serverless build runs on Node event loop |
| Scanned / multi-column detection + refusal | API / Backend | — | Refuse BEFORE block assembly; typed reasons; no garbage crosses the boundary |
| Block normalization + round-trip anchor gate | API / Backend (shared pipeline) | — | Stages 2+ run identically on the fourth branch (locked invariant) |
| Persistence (articles row, dedupe) | Database / Storage (Dexie) | — | Ordinary `articles` row; `pdf-<shortHash>` id; dedupe-refuse client-side |
| Refusal copy surfacing | Browser / Client (`.status` live region) | — | `mapReasonToCopy` extension; zero new chrome |
| Calibration harness + evidence replay | Dev tooling (Node, tests/) | CI | Local corpus re-derivation; CI replays committed evidence per D11-04 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| unpdf | **1.8.0 (STACK.md lock — pin exact)**; 1.8.1 is current | `getDocumentProxy` + `extractTextItems` + `getMeta` + proxy-level `getOutline`/`getDestination`/`getPageIndex` | unjs collective's serverless PDF.js v5.6.205 wrapper; zero runtime deps; the locked project decision (STACK.md L63, L128–130). 1.8.0→1.8.1 diff verified trivial (Math.sumPrecise polyfill refactor, no API changes) — bump only with user confirmation |

No other new packages. Do NOT add `pdfjs-dist` as a direct dependency — the outline path is reachable through the proxy unpdf returns (verified). An optional dev-only consideration for CJK cmaps is documented in Pitfalls (§Pitfall 5).

### Supporting (already in repo — reused unchanged)
| Module | Purpose in this phase |
|--------|----------------------|
| `server/ingest.ts` | Fourth Stage-1 branch; `shortHash` → `pdf-<12hex>` id; D11-07 title chain |
| `server/markdownToBlocks.ts` | Structural template for the adapter shape + `stripMarkdownExtension` naming precedent |
| `server/limits.ts` | New PDF cap constants land here (or sibling) |
| `server/errors.ts` + `src/ingestion/types.ts` | `IngestionFailureReasonEnum` additive widening |
| `src/content/normalizeText.ts` | SHARED selector machinery — `assertRoundTripAnchor` already imports it (no fork) |
| `zod` 4.4.3 | Request-variant + evidence-record schema validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| unpdf | raw pdfjs-dist | Rejected (STACK L128) — re-implements worker setup; unnecessary now that outline access is verified through the proxy |
| base64-in-JSON body | multipart/form-data or raw `application/pdf` body | Multipart/raw avoids 33% inflation but forks the middleware body path; base64 keeps `readBody` + `handleIngestBody` + `IngestionRequestSchema` (a Zod string) byte-identical — the "POST body variant like markdown's" locked shape |
| Gutter band-coverage detection | XY-cut / Docstrum / ML layout models | Classic algorithms are reconstruction-oriented (more than Phase 11 needs — we only detect+refuse); ML models are a dependency + trust-boundary non-starter |

**Installation:**
```bash
npm install unpdf@1.8.0   # pin exact per STACK.md; gate behind checkpoint:human-verify (see audit)
```

**Version verification (run this session):** `npm view unpdf version` → **1.8.1** (published 2026-08-13; repo git+https://github.com/unjs/unpdf.git; MIT; no postinstall; deps: none runtime — only optional `@napi-rs/canvas` peer for `renderPageAsImage`, unused here).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| unpdf | npm | ~3 yrs (1.8.1 published 2026-08-13) | 1,852,713/wk | github.com/unjs/unpdf | **SUS** ("too-new" — triggered by the 3-day-old latest publish only) | Flagged — planner must add `checkpoint:human-verify` before install |

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious [SUS]:** `unpdf` [WARNING: flagged as suspicious — verify before using.] Mitigating signals verified this session: 1.85M weekly downloads, active unjs org repo, MIT, `scripts.postinstall` absent, zero runtime dependencies, types shipped, and the package was already registry-verified during the v2.0 STACK.md research (2.5M weekly at that time). The "too-new" reason is an artifact of the fresh 1.8.1 patch release. Fold the human-verify checkpoint into the pin confirmation (1.8.0 per STACK vs 1.8.1 current — diff verified API-neutral).

## Architecture Patterns

### System Architecture Diagram

```
 Reader (browser)                          Server (Node, Vite middleware)                    Storage
 ─────────────────                          ──────────────────────────────                    ───────
 IngestControl                              POST /api/ingest  {pdf: base64, filename?}
   file picker accept=".md,.html,.pdf"       │
   ├─ size cap check (client, pre-POST) ───► ├─ content-length/body-size guard (NEW limit)
   └─ FileReader → base64                    ├─ IngestionRequestSchema.parse (widened union)
                                             │
                                             server/ingest.ts — Stage 1 pdf branch
                                             ├─ getDocumentProxy(bytes, {maxImageSize})
                                             │    ├─ numPages > 500? ──► refuse pdf-too-large
                                             │    └─ PasswordException? ──► refuse pdf-encrypted
                                             ├─ race(timeout): extractTextItems + getMeta
                                             │    + getOutline/getDestination/getPageIndex
                                             │
                                             server/pdfToBlocks.ts (NEW)
                                             ├─ per page: bin lines (y-desc) ── scanned verdict
                                             ├─ per page: band-coverage gutters ── column verdict
                                             ├─ page-weighted majorities (D11-03)
                                             │    ├─ scanned dominates ──► IngestionError(pdf-scanned)
                                             │    └─ columnar dominates ──► IngestionError(pdf-multi-column)
                                             ├─ assemble: paragraphs (vertical gap)
                                             │    headings (outline-first, font-size fallback)
                                             │    figures/tables → UnsupportedBlock
                                             │    hyphen joins (shared-normalizer discipline)
                                             └─ D11-09 page-1 title consume
                                             │
                                             stages 2+ UNCHANGED:
                                             ArticleSchema.parse → assertRoundTripAnchor
                                             → deriveConfidence → stamp {source:"pdf", origin:"upload"}
                                             │
 IngestionClient re-validates ◄──────────── ├─ ok:true → article
 mapReasonToCopy + .status ◄────────────────└─ ok:false → typed reason + calm copy
 dedupe: dexieLibrarySource.has("pdf-…") ─────────────────────────────────────► articles row (Dexie v4)
```

### Recommended Project Structure
```
server/
├── pdfToBlocks.ts            # NEW — unpdf adapter (pure-ish: bytes+filename in, adapter result out)
└── limits.ts                 # + PDF_MAX_BYTES, PDF_MAX_PAGES, PDF_EXTRACTION_TIMEOUT_MS, MAX_IMAGE_PIXELS
src/
├── ingestion/types.ts        # + {pdf: base64 string, filename?} variant; + PDF failure-reason members
├── content/schema.ts         # ArticleSourceSchema + "pdf"
└── ingestion/{IngestionClient,IngestControl}.tsx   # ingestPdf(); accept += .pdf; copy entries
tests/
├── unit/server/pdf-to-blocks.spec.ts               # adapter suite (markdown-to-blocks precedent)
├── unit/server/pdf-calibration/                    # harness + manifest + ground-truth loaders
│   ├── manifest.json                                # COMMITTED (filename, sha256, expectedClass)
│   ├── ground-truth/<file>.json                     # COMMITTED block-level labels
│   └── pdf-evidence.json                            # COMMITTED derived evidence record (CI replays)
corpus/pdf/                                            # GITIGNORED local real PDFs (D11-04/05)
```

### Pattern 1: The adapter contract — mirror `markdownToBlocks` exactly
**What:** `pdfToBlocks(pdfBytes: Uint8Array): Promise<PdfToBlocksResult>` where the result is byte-identical in shape to `MarkdownToBlocksResult` — `{blocks, footnotes, lang, provenancePartial, isReaderable}`.
**When to use:** always; the orchestrator destructures all four branches with the same code (locked invariant).
**Notes:** filename-agnostic — the orchestrator owns the D11-07 title chain (`filename` never enters the adapter, mirroring D8-17). `footnotes: []` (PDF footnotes are body text in Phase 11 — interleave tolerance is bounded by D11-03's majority rule); `lang: "en"` unless corpus proves otherwise; `isReaderable` = the adapter's own text-bearing heuristic (e.g. ≥3 blocks and ≥1 text-bearing page). `deriveConfidence` then runs unchanged — note its `unsupportedRatio > 0.4 → low` rule means figure-heavy PDFs honestly flag low (ING-06 three-state working as designed).

### Pattern 2: One proxy, caps first, race the timeout
```typescript
// Source: unpdf README "Processing Untrusted PDFs" + src/utils.ts (verified from shipped source)
import { getDocumentProxy, extractTextItems, getMeta } from "unpdf";
import { PDF_MAX_PAGES, MAX_IMAGE_PIXELS, PDF_EXTRACTION_TIMEOUT_MS } from "./limits";

export async function withPdfDocument<T>(bytes: Uint8Array, op: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
  // maxImageSize is TOTAL PIXELS (w*h), default -1 unlimited — pass it (verified: api.d.ts L652-655)
  const pdf = await getDocumentProxy(bytes, { maxImageSize: MAX_IMAGE_PIXELS });
  try {
    if (pdf.numPages > PDF_MAX_PAGES) throw new IngestionError("pdf-too-large");
    return await Promise.race([
      op(pdf),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new IngestionError("pdf-timeout")), PDF_EXTRACTION_TIMEOUT_MS)),
    ]);
  } finally {
    await pdf.loadingTask.destroy();  // caller owns the proxy lifecycle (withDocument only destroys its own)
  }
}
```
**Why:** extractText/extractTextItems/extractLinks "process all pages in one call — check pdf.numPages against a limit first" and "parsing runs on your event loop (no worker) — race extraction calls against a timeout" [VERIFIED: unpdf README]. Reuse ONE proxy across `extractTextItems` + `getMeta` + `getOutline` — `withDocument` keeps caller-supplied proxies alive (verified `src/utils.ts`).

### Pattern 3: Multi-column detection — band-coverage gutters (D11-01/02/03)
**What:** Per page: (1) bin items into Y-bands (rows) with y-tolerance ≈ 30% of modal line height; (2) compute each band's horizontal span; (3) **exclude wide bands (span > ~55% of the page's text-column extent)** — this is what makes spanning headers/pull quotes not veto the gutter; (4) each narrow band casts **one binary vote per x-bin it covers** (a 10-item row votes the same as a 1-item row); (5) gutter = contiguous x-run where votes < **~20% of narrow-band count**, width ≥ min gutter (~1 body em ≈ modal fontSize). ≥2 text columns (separated regions each holding ≥ ~15% of page text) ⇒ page is columnar.
**When to use:** every text-bearing page; verdicts aggregate page-weighted (D11-03): refuse only when columnar pages are >~50% of text-bearing pages.
**Why not naive:** zero-coverage histograms fail on real documents because full-width elements fill the gutter; item-count coverage fails on dense/sparse column disparity [CITED: ginexys.com/blog/posts/column-detection-blog (2026-05-30, fetched this session)]. Production corroboration: pymupdf4llm `column_boxes` also excludes header/footer margins (~50pt) so page furniture can't fill gutters [CITED: deepwiki.com/pymupdf/pymupdf4llm §5.2, indexed from repo src/helpers/multi_column.py] — adopt a small top/bottom margin exclusion too (page numbers/running heads).
**Borderline calibration (D11-02):** pull quotes → wide bands, filtered (admit-side); sidebars/indented blockquotes → may look like a narrow column (refuse-side pressure); the corpus's borderline class exists precisely to tune the 55%/20%/15% numbers.

### Pattern 4: Scanned detection — per-page text floors + page-weighted majority
**What:** A page is **text-bearing** if it has ≥ ~8 items with non-whitespace `str` AND ≥ ~40 non-whitespace chars; **near-empty** if < ~3 such items or < ~15 chars. Document verdict: scanned when near-empty pages are >~50% of ALL pages (a scanned doc has no text-bearing pages, so the majority is trivially near-empty; a text doc with a decorative image-only cover admits). Optional corroborating signal: bytes-per-page > ~200KB with near-zero text implies image-only pages. Numbers are starting values — corpus-calibrated per D11-02/06. [ASSUMED]
**Refusal:** `IngestionError("pdf-scanned")` → calm copy suggests an external OCR tool (anti-feature per FEATURES L114).

### Pattern 5: Heading detection — outline-first, font-size fallback (D11-08 verified)
```typescript
// VERIFIED: unpdf 1.8.1 bundled types dist/types/src/display/api.d.ts L983/L908/L892
// getOutline(): Promise<Array<{title, bold, italic, color,
//   dest: string | Array<any> | null, url, unsafeUrl, newWindow, count, items}|null>
const outline = await pdf.getOutline();            // nested children live in .items — flatten with depth
for (const entry of flatten(outline ?? [])) {
  if (!entry.dest || entry.url) continue;          // url links aren't headings
  const dest = typeof entry.dest === "string"
    ? await pdf.getDestination(entry.dest)          // named destination → array
    : entry.dest;                                   // already [ref, {name:'XYZ', args:[x,y,zoom]}]
  if (!dest?.length) continue;
  const pageIndex = await pdf.getPageIndex(dest[0] as RefProxy);   // 0-based
  const targetY = (dest[1] as {args?: number[]})?.args?.[1] ?? null; // XYZ top y (PDF space, y-up)
  // → coerce the extracted block on pageIndex whose top y is within ~1.5 line-heights
  //   of targetY to heading level = clamp(depth + 2, 2, 6)   (bodies start at h2 — D11-09/one-h1 rule)
}
```
**Fallback (outline-less PDFs / uncovered blocks):** bodyFontSize = char-count-weighted modal `fontSize`; a grouped block is a heading when its dominant fontSize ≥ body × ~1.15 AND its text is short (< ~10 words) [ASSUMED starting values — the exact font-size→heading thresholds are what SC#4/D11-06 calibrates].
**D11-09 title consume:** if the largest-font text on page 1 fuzzy-matches the chosen provenance title (case/whitespace-insensitive containment, either direction), emit NO heading block for it.

### Pattern 6: Paragraph assembly + hyphenation joins (Pitfall 2 discipline)
**What:** Within a page, sort lines y-descending; new paragraph when the baseline delta exceeds modal line delta × ~1.35, or on fontSize/fontFamily regime change; join lines: if a line ends `-` and the next starts with a lowercase letter → dehyphenate (drop hyphen, no space), else join with a space; insert a space between items when the x-gap (next.x − (item.x + item.width)) exceeds ~0.2 × fontSize. [ASSUMED starting values — corpus-tuned.]
**Boundary rule:** these joins are adapter-internal assembly (like htmlToBlocks' DOM walk), producing clean Block text. Per PITFALLS L51, only if a rule must ALSO apply to already-normalized text does it go into the shared normalizer with a DOC-04 revision bump — do not fork, do not preemptively touch normalizeText.

### Pattern 7: Typed refusals + calm copy (researcher-discretion recommendation)
Widen `IngestionFailureReasonEnum` additively with **five** members (one per user-meaningful cause — SC#2/3 want honest specificity; the enum is additive and `mapReasonToCopy` is exhaustive-checked):

| Reason | Calm copy (DOC-06 voice) |
|--------|--------------------------|
| `pdf-unreadable` | "This PDF couldn't be opened — it may be corrupt or not a PDF." |
| `pdf-encrypted` | "This PDF is password-protected, so its text can't be read." |
| `pdf-scanned` | "This PDF looks like scanned images rather than text. An OCR tool could convert it first." |
| `pdf-multi-column` | "This PDF has multiple text columns, and its reading order can't be reconstructed reliably yet." |
| `pdf-too-large` | "This PDF is too long or too large to read here." |

Catching pdfjs errors without importing pdfjs classes: `err?.name === "PasswordException"` (encrypted; `.code` 1=NEED/2=INCORRECT), `err?.name === "InvalidPDFException"` (corrupt) [VERIFIED: classes exist in unpdf's bundled `dist/types/src/shared/util.d.ts`; not re-exported from the unpdf index — name-match is the stable pattern]. A `pdf-timeout` internal reason can fold into `pdf-too-large` copy or map to server-error — planner's call.

### Pattern 8: Calibration harness — Phase 3 fingerprint discipline, PDF edition (D11-04/05/06)
- **Manifest (committed)** `tests/unit/server/pdf-calibration/manifest.json`: `{schemaVersion, entries: [{file, sha256, expectedClass: "single-column"|"scanned"|"multi-column"|"borderline", producer?}]}`.
- **Ground truth (committed)** `ground-truth/<file>.json` for admitted-class PDFs: ordered block labels `[{kind: "heading"|"paragraph", level?, textPrefix: "<first ~40 normalized chars>"}]`.
- **Agreement metric:** align extracted block sequence to labels by `textPrefix` fuzzy match (boundary-tolerant — allows ±1 block drift at boundaries); agreement = matched-kind / max(labels, blocks). **Promotion bar D11-06:** every PDF classification correct AND every admitted PDF ≥ 0.90 agreement.
- **Two modes:** LOCAL (`--derive`): verify corpus presence + SHA-256 vs manifest (refuse-empty-input guard, exit 2 — the fingerprint.compare.ts L205-211 precedent), re-run detection + extraction, REWRITE `pdf-evidence.json`. CI (default): corpus absent → validate the **committed** `pdf-evidence.json` against the D11-06 bar and the manifest (replay); missing evidence record → exit non-zero with "calibration requires the local corpus — see docs" (never silent skip).
- **Evidence record (committed)** `pdf-evidence.json`: `{schemaVersion, generatedAt, thresholds: {wideBandRatio, gutterVoteRatio, minGutterEm, colTextShare, scannedItemFloor, headingFontRatio, ...}, results: [{file, sha256, expectedClass, verdict, agreement?}]}` — thresholds live WITH their evidence so a recorded pass is auditable against the numbers that produced it.

### Anti-Patterns to Avoid
- **Sorting items by array order and calling it reading order** — pdfjs emits content-stream order; multi-column PDFs interleave (Pitfall 7). Sort y-desc/x-asc per page and refuse when columnar.
- **Treating `hasEOL` as authoritative paragraph structure** — producer-variable; use it only as a hint within line binning. [ASSUMED]
- **Zero-coverage gutter histograms** — spanning elements fill the gap (Pattern 3).
- **Detecting columns on image/table-only pages** — no text bands ⇒ not columnar by this detector; a stray figure page must not refuse a prose document (D11-03 majority).
- **Committing PDF binaries or synthesizing fixtures for CI** — re-litigates D11-04.
- **A second normalizer** for PDF text — Pitfall 2.
- **Importing unpdf anywhere under `src/`** — server-only (ARCHITECTURE L984); the client only sees the typed envelope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF parsing / object model | Custom PDF byte parser | unpdf (bundled pdfjs) | PDF is a container+cryptography-laden format; pdfjs is the reference implementation [VERIFIED: unpdf README] |
| PDF.js worker setup in Node | Manual worker config | unpdf's serverless bundle | The exact pain unpdf exists to remove (STACK L63) |
| Outline/destination resolution | XPath-like own scheme | `getOutline`/`getDestination`/`getPageIndex` | Author-declared structure is in the file; verified exposed |
| Reading-order reconstruction for columns | XY-cut/Docstrum reimplementation | REFUSE (D11-01) | Separable sub-project with its own corpus + bar (Pitfall 7 mitigation 2) |
| OCR | Tesseract-in-worker, etc. | Detect + refuse + suggest external OCR | Anti-feature for v2.0 (FEATURES L114) |
| Image decode DoS guard | Manual byte scanning | `maxImageSize` DocumentInitParameters option | pdfjs-owned guard; pass 16_777_216 (pixels) [VERIFIED: api.d.ts] |
| Threshold provenance | "Looks right" numbers | Calibration harness + committed evidence | D11-06 is the explicit gate; SC#4 |

**Key insight:** Phase 11's only genuinely novel code is *detection policy* and *block coercion* — everything else (parsing, outlines, security posture, pipeline stages) is reuse. That is why the calibration harness outranks cleverness in the algorithm.

## Runtime State Inventory

> Greenfield feature phase (new intake path) — not a rename/refactor/migration phase. Step 2.5: SKIPPED.
> Persistence note: PDF articles are ordinary Dexie v4 `articles` rows; no store/index changes expected (Pitfall 9 — additive enum only, mirroring the Phase 7→8 widenings that shipped without a version bump beyond what exists).

## Common Pitfalls

### Pitfall 1: Y-axis inversion
**What goes wrong:** PDF user space origin is bottom-left, y increases UP; sorting ascending puts the footer first. **Why:** verified coordinate semantics in unpdf's `StructuredTextItem` docs ("origin: bottom-left"). **Avoid:** sort lines by DESCENDING baseline y. **Warning signs:** extracted articles end with the title; round-trip anchors still pass (offsets don't care) — only e2e reading checks catch it.

### Pitfall 2: Content-stream order is not reading order
The core Pitfall 7 failure — interleaved two-column gibberish that still round-trips (anchors resolve because the text is stable, just wrong for humans). **Avoid:** column detection + refusal BEFORE assembly (D11-01); e2e spec asserts a multi-column fixture refuses rather than extracts.

### Pitfall 3: Naive gutter detection fails (spanning elements)
See Pattern 3. **Warning signs:** calibration borderline class (pull quotes/sidebars) misclassifies in either direction.

### Pitfall 4: Page furniture fills gutters
Running heads/page numbers span or sit in the gutter zone. **Avoid:** exclude top/bottom margin bands (~5% or ~36–50pt of page height) from band construction (pymupdf4llm precedent) [CITED]. **Warning signs:** prose PDFs with headers falsely refuse as multi-column.

### Pitfall 5: Missing CJK cmaps (unpdf has no pdfjs-dist dependency)
**What goes wrong:** `getDocumentProxy` resolves `cMapUrl` from a locally installed `pdfjs-dist` via `import.meta.resolve` inside try/catch — with no pdfjs-dist present, the catch silently drops ALL Node font defaults (`disableFontFace`, `standardFontDataUrl`, `cMapUrl`), and cid-keyed CJK fonts can extract as garbage/no text [VERIFIED: unpdf src/utils.ts]. **Avoid:** declare CJK out of corpus scope for Phase 11 (English-language corpus per project context) and note the upgrade path (add `pdfjs-dist` as an explicit server dep to restore cmap resolution — NOT the rejected "raw pdfjs-dist for APIs" usage). **Warning signs:** CJK corpus additions extract empty while rendering tools show text.

### Pitfall 6: Encrypted/corrupt PDFs crash the proxy promise
`getDocument().promise` rejects `PasswordException`/`InvalidPDFException`; these must map to typed refusals, not `server-error` copy (Pattern 7). **Warning signs:** e2e password-protected fixture returns the generic copy.

### Pitfall 7: Base64 inflation + unbounded middleware body
~33% inflation: a 10MB PDF ⇒ ~13.7MB JSON. `readBody` accumulates without cap and nothing in connect enforces a limit. **Avoid:** client refuses `file.size > MAX_PDF_BYTES` pre-POST; middleware checks `content-length` against `ceil(MAX_PDF_BYTES × 4/3) + overhead` BEFORE reading; server re-checks decoded length. Recommend `PDF_MAX_BYTES = 10MB` (covers 500 text-heavy pages comfortably; scanned bloat is refused by class anyway) [researcher recommendation — confirm in plan].

### Pitfall 8: `unsupportedRatio > 0.4 → low` on figure-heavy PDFs
Figures/tables → `UnsupportedBlock` per locked decision; a chart-dense report may honestly flag "low". This is ING-06 working, not a bug — but the e2e corpus should include one such PDF so the flag is asserted, not discovered.

### Pitfall 9: `extractTextItems` processes ALL pages in one call
No lazy paging — the numPages cap MUST be checked on the proxy BEFORE calling it [VERIFIED: unpdf README]. Timeout race per Pattern 2 (event-loop parsing, no worker).

### Pitfall 10: Outline destinations are two-shaped
`dest` is a named-destination STRING or an explicit array `[ref, {name, args}]` — handle both, plus `url`-bearing entries (external links, not headings) and nulls [VERIFIED: bundled types]. **Warning signs:** headings never coerce on PDFs whose producers use named destinations (many LaTeX/Word exporters do).

### Pitfall 11: Doubled title
D11-09 exists because the provenance title AND a page-1 heading block both render otherwise. **Warning signs:** library shows "Report on X" with an immediate identical h2.

### Pitfall 12: Client bundle contamination
unpdf + its bundled pdfjs are large server-only code. **Avoid:** import only from `/server/*`; the eslint/`tsconfig` boundary discipline from Phases 7–8 already enforces this (verify `npm run build` output size unchanged in the gate).

## Code Examples

### Example 1: Orchestrator fourth branch (server/ingest.ts shape)
```typescript
// Source: server/ingest.ts three-branch precedent (read this session) + D8-18/D11 id pattern
} else if (hasPdf) {
  const { pdf: b64, filename } = input as { pdf: string; filename?: string };
  const bytes = Buffer.from(b64, "base64");            // validated length vs PDF_MAX_BYTES first
  finalUrl = undefined;
  const extracted = await pdfToBlocks(bytes);           // Pattern 1 contract
  ({ blocks, footnotes, lang, provenancePartial, isReaderable } = extracted);
  id = `pdf-${shortHash(b64)}`;                         // content-hash, mirrors md-<hash> (D8-18)
  source = "pdf"; origin = "upload"; fetchedAt = undefined; sourceBytes = b64;
  pdfFilenameHint = filename;                           // consumed by the D11-07 chain below
}
```

### Example 2: Sanity-checked title chain (D11-07)
```typescript
const PDF_TITLE_GARBAGE = [
  /^\s*$/, /^(untitled|unknown|title|document|new document|presentation|slide 1|layout)\s*$/i,
  /^microsoft (word|powerpoint|excel|office)\b/i, /^adobe (acrobat| illustrator)\b/i,
  /\.(docx?|pptx?|pdf|indd|qxd|pub|pages)$/i,           // filename leaked into Title
  /^[0-9a-f]{16,}$/i, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // hex/UUID
];
const sane = (t?: string) => t && t.trim().length >= 2 && t.length <= 200 && !PDF_TITLE_GARBAGE.some(r => r.test(t));
// getMeta(pdf).info.Title is PascalCase "Title" [VERIFIED: unpdf src/meta.ts — pdfjs getMetadata info dict]
const title = sane(infoTitle) ? infoTitle!
  : pdfFilenameHint ? pdfFilenameHint.replace(/\.pdf$/i, "")
  : "PDF document";
```
[Pattern list ASSUMED — grounded in widely-known producer behavior (older Word writes "Microsoft Word - file.doc"; LaTeX often leaves empty/untitled); verify each pattern against the corpus's single-column class during calibration.]

### Example 3: IngestionRequestSchema widening
```typescript
// Source: src/ingestion/types.ts union (read this session)
export const IngestionRequestSchema = z.union([
  z.object({ url: httpUrl }),
  z.object({ html: z.string().min(1) }),
  z.object({ markdown: z.string().min(1), filename: z.string().optional() }),
  z.object({ pdf: z.string().base64().min(1), filename: z.string().optional() }),  // NEW (Phase 11)
]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pdf-parse for Node PDF text | unpdf (serverless pdfjs v5.6.205) | pdf-parse unmaintained w/ advisories; unpdf current line 1.7→1.8 (2026-07/08) | Locked already; verified no postinstall, zero deps |
| `extractText` plain string | `extractTextItems` positional items | unpdf ≥1.4 era | Position/font metadata enables this phase's entire detection layer |
| OCR-first intake thinking | detect + honest refusal | FEATURES L113-114 (v2.0) | D11 scope: refusal + external-OCR suggestion |

**Deprecated/outdated:** ARCHITECTURE.md L781-782 labels `maxImageSize` "16 MB" — the parameter is **total pixels (w×h)**; 16_777_216 = 16 megapixels [VERIFIED: bundled api.d.ts L652-655]. The plan should carry the corrected semantics, not the label.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Garbage-title pattern list (Word prefixes, "untitled", extension leaks, UUIDs) reflects real-world Info dictionaries | Pattern 2 / Example 2 | Bad titles surface in library; D11-07 chain still falls back to filename — corpus verification during calibration is the designed safety net |
| A2 | Starting heuristic values: wide-band 55%, gutter-vote 20%, min gutter ~1em, col text share 15%, scanned floors 8/40/3/15, heading font ratio 1.15, paragraph-gap 1.35×, item space-gap 0.2× | Patterns 3/4/5/6 | Over/under-refusal; every number is corpus-calibrated before promotion per D11-06 (the harness exists to retune) |
| A3 | `hasEOL` is a hint, not authoritative | Pitfalls | Paragraph assembly leans on vertical-gap primary signal — low risk |
| A4 | pdfjs item `str` generally includes inter-word spaces; x-gap space insertion is a fallback | Pattern 6 | Occasional missing/doubled spaces; round-trip gate + corpus agreement metric catch systematic cases |
| A5 | English-only corpus ⇒ cmap absence (Pitfall 5) is a documented non-blocker | Pitfalls, Environment | CJK PDFs extract poorly until pdfjs-dist is added as server dep for cmaps |
| A6 | `err.name` string-matching for PasswordException/InvalidPDFException is stable across the pinned version | Pattern 7 | Pinned exact version; classes verified in shipped types |

## Open Questions

1. **Pin 1.8.0 (STACK lock) or 1.8.1 (current)?**
   - What we know: 1.8.0→1.8.1 diff is a Math.sumPrecise polyfill refactor (verified via GitHub compare) — API-neutral; both work on Node 22.
   - What's unclear: whether the user wants the STACK number honored literally or the patch bump.
   - Recommendation: fold into the install `checkpoint:human-verify` (also required by the SUS audit); default 1.8.0.
2. **`PDF_MAX_BYTES` exact value** — recommended 10MB decoded (client + content-length + decoded triple-check). Confirm in plan.
3. **Failure-reason granularity** — five members recommended (Pattern 7); `pdf-timeout` fold target is planner's call.
4. **Corpus acquisition** — the calibration plan needs the user's 6–10 real PDFs locally before the derive run; manifest authoring is part of that task. Confirm the user will supply them (licensing/size already decided local-only).
5. **Ground-truth label authoring effort** — block-level labels for ~4–6 admitted-class PDFs are hand-authored JSON; estimate ~30–60 min. Confirm format acceptance in plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (≥22.12; pdfjs v5 needs Promise.withResolvers) | unpdf serverless bundle | ✓ | v22.22.3 | — |
| unpdf | pdfToBlocks | ✗ (not yet installed) | 1.8.1 on registry | Install pinned (checkpoint-gated) |
| pdfjs-dist (NOT installed) | cmaps for CJK extraction | ✗ | 6.2.108 on registry | Out of Phase 11 scope (English corpus); add later if CJK needed |
| Vite Node middleware runtime | `/api/ingest` host | ✓ | Existing dev-server/ingest-middleware.ts | — |
| Vitest / Playwright suites | unit + e2e gates | ✓ | 4.1.10 / 1.61.1 | — |

**Missing dependencies with no fallback:** none blocking.
**Missing dependencies with fallback:** pdfjs-dist (CJK) — documented deferral.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright 1.61.1 (e2e) |
| Config file | Existing vitest + playwright.config.ts |
| Quick run command | `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts` |
| Full suite command | `npm run test` (the honest full-suite gate — one invocation, exit code recorded; 04-11/09-07 precedent) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-04 (SC#1) | text-heavy PDF → normalized article, opens/paginates/annotates/restores like any article | e2e | `npx playwright test pdf-intake` | ❌ Wave 0 |
| ING-04 (SC#2) | scanned PDF refuses with typed reason + calm copy, nothing enters library | e2e + unit | `npx playwright test pdf-intake` | ❌ Wave 0 |
| ING-04 (SC#3) | multi-column PDF refuses (never silently reorders) | e2e + unit | `npx playwright test pdf-intake` | ❌ Wave 0 |
| ING-04 (SC#4a) | every admitted PDF passes round-trip anchor gate | unit (integration) | `npx vitest run tests/unit/server/ingest-pdf.spec.ts` | ❌ Wave 0 |
| ING-04 (SC#4b) | calibration harness validates thresholds before promotion; CI replays committed evidence | node script (CI) | `node tests/unit/server/pdf-calibration/harness.ts` (+ `--derive` locally) | ❌ Wave 0 |
| adapter units | line binning, gutters, scanned floors, title chain, outline mapping, hyphen joins, D11-09 consume, dedupe id stability | unit | `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts` | ❌ Wave 0 |

**Synthetic unit fixtures:** tiny hand-crafted PDFs ARE committable (generated, not the real-PDF corpus — they exercise code paths, not calibration thresholds; D11-04 restricts the *calibration corpus*, not unit fixtures). Generate minimal single/two-column/scanned/encrypted PDFs programmatically (e.g. via a one-off script using pdf-lib-free means — simplest: commit 3–4 tiny generated fixtures <10KB each, clearly labeled synthetic).

### Sampling Rate
- **Per task commit:** targeted vitest file(s) for the touched module
- **Per wave merge:** `npm run test:unit -- --run` + relevant playwright project
- **Phase gate:** full `npm run test` single invocation, exit 0, counts recorded in OUTPUT.md (the Phase 9/10 honest-gate discipline)

### Wave 0 Gaps
- [ ] `tests/unit/server/pdf-to-blocks.spec.ts` — adapter units (REQ ING-04)
- [ ] `tests/unit/server/ingest-pdf.spec.ts` — fourth-branch pipeline integration incl. round-trip gate
- [ ] `tests/e2e/pdf-intake.spec.ts` — upload→read + refusal flows (SC#1–3)
- [ ] `tests/unit/server/pdf-calibration/{manifest.json, harness, ground-truth/, pdf-evidence.json}` — SC#4b
- [ ] Corpus dir + `.gitignore` entry (`corpus/pdf/`) + docs note for the local derive workflow

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in scope |
| V3 Session Management | no | — |
| V4 Access Control | no | Local-first; same-origin POST only (existing CSP `connect-src 'self'`) |
| V5 Input Validation | **yes** | `IngestionRequestSchema` base64+size validation; content-length guard BEFORE body read; decoded-length re-check; `numPages`/`maxImageSize`/timeout caps (DoS); manifest SHA-256 integrity |
| V6 Cryptography | no (indirect) | Encrypted PDFs are REFUSED (PasswordException → typed reason); no decryption attempted |
| V12 File Upload | **yes** | Client extension+size gate; server never executes PDF scripts (pdfjs does not execute embedded scripts — CITED: unpdf README "PDF.js does not execute scripts embedded in PDFs"); resource limits per its "Processing Untrusted PDFs" section |

### Known Threat Patterns for PDF intake (Node + pdfjs)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Decompression/memory bomb (nested streams, huge images) | DoS | `maxImageSize` pixels cap + `PDF_MAX_BYTES` + `numPages` cap + timeout race + destroy [VERIFIED: unpdf guidance] |
| Unbounded request body (base64 bombs) | DoS | content-length pre-check + client cap (Pitfall 7) |
| Encrypted/DRM payloads | Tampering/Info disclosure | Typed refusal; never decrypt |
| Malicious markup via extracted text | Tampering (XSS) | Doc model is the security boundary — Block JSON renders as inert React children (D8-16 precedent; no HTML path, no DOMPurify needed) |
| Jargon/payload leakage in refusal copy | Info disclosure | `mapReasonToCopy` exhaustive calm mapping; "no jargon leak" test extends to new reasons (T-7-26 pattern) |
| Corpus supply chain (calibration) | Tampering | Manifest SHA-256 verification before derive; evidence record carries hashes |

## Sources

### Primary (HIGH confidence)
- unpdf npm registry (view: version 1.8.1, time, deps, readme) — API surface, "Processing Untrusted PDFs" guidance
- unpdf shipped source + tarball (registry tarball 1.8.1, unpacked this session): `src/text.ts`, `src/meta.ts`, `src/utils.ts`, `dist/types/src/display/api.d.ts` (getOutline L983, getDestination L908, getPageIndex L892, maxImageSize L652), `dist/types/src/shared/util.d.ts` (PasswordException), package.json exports
- Project code read this session: `server/{ingest,markdownToBlocks,limits,errors,ingestAdapter,confidence}.ts`, `src/ingestion/{types,IngestionClient,IngestControl}.tsx`, `src/content/schema.ts`, `dev-server/ingest-middleware.ts`, `tests/e2e/calibration/fingerprint.compare.ts`
- Project planning refs: 11-CONTEXT.md (all D11-xx), PITFALLS.md Pitfall 7 + L51, ARCHITECTURE.md Pattern 3/L781/L984/L1072, STACK.md L63/L128-130, REQUIREMENTS.md ING-04
- gsd-tools `package-legitimacy check --ecosystem npm unpdf` → SUS(too-new) + signals

### Secondary (MEDIUM confidence)
- ginexys.com/blog/posts/column-detection-blog (2026-05-30, fetched) — band-coverage gutter algorithm, 55%/20% thresholds
- deepwiki.com/pymupdf/pymupdf4llm §5.2 (indexed from repo src/helpers/multi_column.py) — production column_boxes corroboration, header/footer margins
- GitHub compare v1.8.0...v1.8.1 (unjs/unpdf) — patch diff verified trivial

### Tertiary (LOW confidence)
- Garbage-title pattern folklore, heuristic starting values, hasEOL reliability, classic algorithm names (XY-cut, Docstrum) — [ASSUMED], corpus-calibrated by design

## Metadata

**Confidence breakdown:**
- Standard stack (unpdf API): HIGH — verified from shipped source/types, not docs alone
- Architecture (pipeline extension): HIGH — all integration points read in-repo this session
- Detection algorithms: MEDIUM — recipe web-verified + production-corroborated; starting values ASSUMED pending the calibration corpus (by design, D11-06)
- Pitfalls: HIGH for API/coordinate/limit facts; MEDIUM for heuristic pitfalls

**Research date:** 2026-08-16
**Valid until:** 2026-09-13 (unpdf is actively published; re-check registry before install if delayed)
