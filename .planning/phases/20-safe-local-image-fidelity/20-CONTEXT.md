# Phase 20: Safe Local Image Fidelity - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 20 is the **v2.1 safe-local-image-fidelity phase** — readers retain
meaningful figures and captions as safe, offline, portable local assets
stable in both reading modes:

1. **IMG-01 — canonical preservation.** URL/paste-HTML, Markdown, and EPUB
   ingestion preserve reliably recoverable figures, alternative text, and
   captions in the canonical sanitized document model (PDF stays text-only).
2. **IMG-02 — guarded asset fetching.** Secondary image assets fetch
   through SSRF-safe handling with redirect, address, media-type, byte,
   pixel, count, animation, and decode limits determined from a
   representative corpus.
3. **IMG-03 — offline by construction.** Saved articles never contact
   third-party image hosts on reopen; supported images are local assets
   with explicit lifecycle and deletion behavior.
4. **IMG-04 — portability.** Assets round-trip through the versioned
   export/import bundle with validation, limits, conflict handling, and no
   broken references.
5. **IMG-05/06 — stable rendering.** Figures render semantically with
   stable intrinsic geometry and calm failures in both modes; image
   loading/decoding never silently clips, duplicates, omits, reorders, or
   destabilizes paginated content, and the canonical location survives any
   required repagination.

**Phase 20 does NOT ship** (later/backlog — do not fold in):
- **Book cover images / library cover thumbnails** — new UI capability;
  backlog (D20-03).
- **Sanitized static SVG** — refused this phase (D20-10); backlog
  candidate.
- **PDF embedded-image extraction** — PDF stays text-only with honest
  unsupported figure regions (D20-01).
- **In-reader per-figure retry** — re-ingest is the only refresh path
  (D20-07).
- **POLISH-08..11 + acceptance matrix (ACPT-07/08)** — Phase 21.

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- Sanitize once at ingest; the canonical document model IS the security
  boundary; no `dangerouslySetInnerHTML`; no `data:` URIs (Pitfall 5 —
  D20-02 keeps this).
- `safeFetch`'s 9-measure SSRF pipeline (scheme → metadata-hostname → DNS →
  IP deny-list → per-hop redirects → size-cap → content-type → body)
  exists at server/safeFetch.ts; its allowlist currently REFUSES images —
  the asset path extends this machinery, never bypasses it.
- EPUB currently downgrades ALL figures (D12-16 `downgradeFigures` in
  server/epubToBooks.ts) to avoid third-party beacons — this phase
  RETIRES that downgrade for chapter figures.
- Figures are ATOMIC in pagination; `splittingBlockText` = alt + caption
  joined by BLOCK_SEPARATOR (D-05 substrate participation).
- D19-01: figure CAPTIONS are highlightable; D19-02: interior non-text
  gaps are crossed calmly; the `<img>`/alt surface renders no marks.
- Pitfall 9: Dexie additive-only version blocks (v5 today → v6 expected).
- Bundle union-read discipline: v1|2|3 today → v1|2|3|4; writers emit
  current major; 09-04 bomb-cap/fflate entry discipline; D9-14 import
  semantics; explicit per-item conflicts.
- D17-13 atomic cascade precedent (delete in ONE Dexie transaction);
  D7-07/D8-18 content-hash id precedents.
- Byte-stable e2e anchors + strengthen-only; honest full-suite gate
  (`npm run test` exit 0); calm DOC-06 copy; reduced-motion gates; 44px
  targets.

</domain>

<decisions>
## Implementation Decisions

### Source scope (IMG-01)

- **D20-01: ALL figure-producing sources EXCEPT PDF gain local image
  fidelity.** URL + paste HTML and Markdown standalone images go through
  the new SSRF-safe asset fetch; EPUB figures extract from the
  already-local container (zero network — un-downgrades D12-16); PDF
  stays text-only. Every FigureBlock in the canonical model is
  local-asset-backed.
- **D20-02: `data:` URI images stay REFUSED** — Pitfall 5 holds; one
  no-exceptions media boundary. Refused figures get the calm per-figure
  fallback.
- **D20-03: EPUB scope is chapter-content figures ONLY** — no cover-image
  extraction, no cover thumbnails anywhere; cover display is a backlog
  capability.

### Fetch + refusal semantics (IMG-01, IMG-02)

- **D20-04: Assets fetch INLINE at ingest** — per-asset timeout + overall
  image budget inside the existing ingest pipeline. A saved article is
  ALWAYS complete; no post-save background fetching (offline-clean by
  construction).
- **D20-05: Refusal is PER-FIGURE** — one bad image never blocks the
  article; each refused/failed figure becomes a calm fallback while the
  article saves normally (mirrors UnsupportedBlock tolerance). Exceed-cap
  figures refuse the same way.
- **D20-06: A refused/failed figure STAYS a FigureBlock** — alt text +
  caption render as-is; the image surface shows the calm placeholder.
  Captions stay highlightable (D19-01), figures stay semantic; no new
  block kinds.
- **D20-07: Retry = re-ingest only** — no in-reader retry UI; re-ingesting
  the source (D9-14 same-id upsert) refreshes content + assets. Zero
  post-save third-party contact.

### Format + animation policy (IMG-02)

- **D20-08: Modern raster set ONLY** — jpeg, png, webp, gif, avif
  (everything all three CI engines decode natively); all other types
  refuse calmly per-figure.
- **D20-09: ANIMATED images refuse calmly** — animated GIF/WebP/APNG
  refuse per-figure (alt + caption preserved); static forms of the same
  types accept normally. Nothing in the calm reader moves on its own; no
  re-encode pipeline.
- **D20-10: SVG refuses** — raster-only media boundary this phase;
  sanitized static SVG is a backlog candidate.
- **D20-11: Caps are GENEROUS, bomb-stopping** — limits exist to stop
  decode bombs, huge originals, and image-spam pages, NOT to police
  reading. Exact numbers are corpus-determined per IMG-02; ordinary
  image-heavy longform (photo essays, wikimedia articles) saves whole.

### Canonical model + geometry (IMG-03, IMG-05, IMG-06)

- **D20-12: `FigureBlock.src` is REWRITTEN to a local asset reference at
  ingest** — the original URL moves to a provenance/diagnostic field. The
  canonical model is self-contained and can only ever point at local
  assets (IMG-03 by construction); export/import carries assets directly.
- **D20-13: Intrinsic dimensions are DECODED AND STORED at ingest** —
  pagination reserves the exact aspect-correct box up front; reader-side
  decode is pure fill-in (zero reflow, zero repagination churn — IMG-06
  by construction). Refused/unknown-dimension figures reserve a calm
  default box.
- **D20-14: The placeholder is a quiet framed box + image glyph + alt
  text** (short calm "image unavailable" note when alt is empty), caption
  rendering normally beneath. ONE surface for refused-at-ingest and
  broken-at-read-time.
- **D20-15: Assets are ARTICLE-OWNED blobs** — a new additive Dexie store
  keyed by article id + asset id. Article deletion cascades atomically in
  ONE transaction (D17-13 precedent; no refcounting/GC machinery). The
  same image in two articles stores twice — accepted, rare, bounded by
  per-article caps.

### the agent's Discretion

- **Asset-fetch pipeline mechanics** — how the image fetch extends/reuses
  `safeFetch` (per-asset content-type allowlist, redirect/address
  re-validation, DNS pinning), per-asset timeout value, overall budget
  arithmetic, and where the stage sits in the locked `server/ingest.ts`
  orchestration.
- **Exact cap numbers** — per-asset bytes/pixels, per-article count and
  total-byte budget, reserved-default box dimensions: measured from the
  IMG-02 representative corpus (wikimedia/longform photo-essay sampling).
- **Animation detection mechanics** — frame-count probing at ingest
  (server-side sniff vs decode-count) and its cross-engine reliability.
- **Schema evolution shape** — FigureBlock field names (`src` semantics,
  original-URL provenance field, where intrinsic dims live: on the block
  vs the asset record), Zod additive evolution, fixture regeneration
  (figure-heavy.canonical.json srcs become local references).
- **Dexie v6 store shape** — asset id format, blob/ArrayBuffer storage
  details, index design (Pitfall 9 additive-only).
- **EPUB extraction mechanics** — container-relative path resolution off
  the already-open archive, EPUB-internal figure limits inheriting the
  same caps (skip network, keep decode/byte/pixel guards).
- **Runtime asset resolution** — object-URL (`createObjectURL`) lifecycle
  and revocation discipline in the renderer; placeholder glyph anatomy.
- **Export/import shape** — bundle v4 asset entries (fflate zip entries,
  09-04 bomb-cap discipline, per-asset validation), conflict semantics
  (asset bytes differing rides the article-record conflict), no-broken-
  references guarantees, import-side limit enforcement.
- **Pagination integration** — how the stored dims feed `domMeasurer`/
  engine geometry for reserved boxes in both modes; figure stays atomic;
  how the D-05 substrate (alt+caption) stays byte-identical so anchors
  and highlights are untouched.
- **Markdown relative-src figures** — already fail the httpUrl gate
  (no base directory); confirm they arrive as calm per-figure refusals.
- **Test shape** — fixture evolution, corpus-driven limit assertions,
  3-engine matrix (decode/failure/offline cells), network-isolation proof
  (no third-party requests on reopen), honest full-suite gate; which
  existing specs legitimately update (EPUB downgrade specs change
  honestly).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 20 goal + 5 success criteria (canonical
  preservation; guarded fetches; offline local assets; portable with
  validation/conflicts/lifecycle; stable semantic rendering both modes).
  `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — IMG-01..06 (§Images); traceability table
  (Phase 20 rows); Future Requirements.
- `.planning/PROJECT.md` — Constraints (honesty: no silent garbage;
  canonical document model is the security boundary; SSRF refusal;
  accessibility foundational; performance budget).

### Prior-phase contracts this phase extends
- `.planning/phases/19-cross-block-highlights/19-CONTEXT.md` — D19-01
  (captions highlightable), D19-02 (interior non-text gaps crossed
  calmly), the img/alt no-marks rule this phase's placeholder inherits.
- `.planning/phases/17-reader-owned-metadata/17-CONTEXT.md` — D17-13
  atomic cascade precedent; bundle union-read/versioning discipline.
- v2.0 contracts via `.planning/STATE.md` decision index — D12-16
  (downgradeFigures being retired), D9-14 (same-id upsert = the retry
  path), D7-07/D8-18 (content-hash ids), 09-04 (bundle bomb-caps),
  Pitfall 5 (no data: URIs), Pitfall 9 (Dexie additive-only).

### Source code contracts (READ before implementing)
- `src/content/schema.ts` — `FigureBlock` (L100-105: kind/alt/src
  httpUrl/caption), `httpUrl` (L28) — the schema this phase evolves.
- `server/htmlToBlocks.ts` — `figureBlock` (L199-231: base-URL
  resolution, alt/figcaption extraction, unsupported fallbacks) — where
  asset referencing begins; the mXSS-covered sanitize surface.
- `server/safeFetch.ts` — `safeFetch` (L110) 9-measure pipeline;
  content-type allowlist (L191-196) that refuses images today; the
  machinery the asset fetch extends.
- `server/limits.ts` — `MAX_RESPONSE_BYTES`, `REQUEST_TIMEOUT_MS`,
  `MAX_REDIRECTS`, `MAX_IMAGE_PIXELS` (pdf.js precedent) — where asset
  caps join the shared client/server constants pattern.
- `server/ingest.ts` — the locked staged orchestrator (safeFetch →
  extract → slugify → parse → anchor → confidence → stamp) the asset
  stage joins.
- `server/epubToBooks.ts` — `downgradeFigures` (L692, D12-16) retiring
  into container extraction; text-proportion gate interplay.
- `server/markdownToBlocks.ts` — standalone-image → FigureBlock
  promotion (L214-221, `figureFromImage`).
- `server/pdfToBlocks.ts` — figure-region unsupported policy (stays
  as-is; L121-122, L798+).
- `src/ingestion/types.ts` — shared client/server limit constants
  (three-enforcement-point pattern).
- `src/content/render/BlockRenderer.tsx` — figure case (L229-247:
  `<img src={block.src}>` + caption marks) — becomes local-asset
  resolution + placeholder surface.
- `src/persistence/db.ts` — Dexie v1..v5 blocks; the v6 additive store
  lands here (Pitfall 9).
- `src/portability/bundle.ts` — `ExportBundleSchema` v1|2|3 (L49-64) —
  v4 + asset entries evolve here; `manifest.ts`, `ExportImportService.ts`
  writer/reader discipline.
- `src/portability/conflicts.ts` + `src/reader/ImportPreviewDialog.tsx`
  — D9-14 conflict table the asset-conflict semantics join.
- `src/pagination/splitBlock.ts` — figure ATOMIC (L12);
  `splittingBlockText` figure case (L79, L113) must stay byte-identical.
- `src/measurement/domMeasurer.ts` + `src/measurement/engine.ts` —
  figure DOM measurement (L70) where reserved geometry integrates.
- `src/ingestion/LibrarySource.ts` — `remove` transaction the asset
  cascade extends (D17-13 shape).
- `src/fixtures/index.ts` + `src/fixtures/articles/figure-heavy.canonical.json`
  — the figure corpus (wikimedia remote srcs today) fixtures regenerate
  from.
- `tests/e2e/` — pagination/ingestion/EPUB specs the image matrix joins;
  network-isolation cells; honest full-suite gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`safeFetch` SSRF pipeline** — the asset fetch reuses scheme/DNS/IP/
  redirect/size measures wholesale; only the content-type gate and
  response handling (bytes not text) differ per asset.
- **`MAX_IMAGE_PIXELS` + `limits.ts` constants pattern** — decode-bomb
  capping already proven (pdf.js); asset caps join the same three-point
  enforcement (client picker, middleware, orchestrator).
- **EPUB archive access** — `epubToBooks` already opens the container;
  chapter-figure extraction is reading already-local bytes, no fetch.
- **Bundle fflate machinery + 09-04 bomb-caps** — zip entry filtering,
  declared-size caps, and never-throw validation exist; assets are new
  entries in the same envelope.
- **D9-14 conflict machinery** — `resolveImportPlan` + per-item
  ImportPreviewDialog choices; asset conflicts ride article-record
  conflicts.
- **Atomic delete transaction** — the D17-13/Pitfall 10 cascade shape
  extends with one asset-table range delete.
- **Measurement engine + hidden DOM body** — where stored dims provide
  authoritative reserved geometry so decode never re-triggers layout.

### Established Patterns
- Sanitize/localize ONCE at ingest; the doc model is the boundary —
  D20-12 makes remote references structurally impossible after save.
- Honest calm refusal over guessed repair — per-figure fallbacks echo
  DOC-06 across the project.
- Content-hash ids (D7-07/D8-18) — article id discipline; asset ids
  within an article follow the locality precedent.
- Corpus-calibrated limits (IMG-02's own mandate) — measure, then lock.
- Byte-stable anchors + strengthen-only; honest full-suite gate across
  chromium/firefox/webkit.

### Integration Points
- `server/ingest.ts` — new inline asset-fetch stage (post-extract, pre-
  stamp) + `htmlToBlocks`/`markdownToBlocks`/`epubToBooks` src rewrite.
- `src/content/schema.ts` — FigureBlock evolution (local src + dims +
  provenance URL).
- `src/content/render/BlockRenderer.tsx` — local-asset `<img>` +
  placeholder surface; object-URL lifecycle.
- `src/persistence/db.ts` — v6 `assets` store; `LibrarySource.remove`
  cascade extension.
- `src/portability/bundle.ts`/`conflicts.ts` — v4 envelope + asset
  entries/conflicts.
- `src/measurement/` + `src/pagination/` — reserved-geometry
  integration; D-05 substrate byte-identity.
- `src/fixtures/` + `tests/e2e/` — fixture regeneration; corpus,
  offline-isolation, and failure-matrix specs.

</code_context>

<specifics>
## Specific Ideas

- **"A saved article is always complete"** — inline fetch, no background
  fill-in, offline-clean by construction (D20-04).
- **"One bad image never blocks the article"** — per-figure refusal;
  the essay survives its tracking pixel (D20-05).
- **"The frame is the figure"** — stored intrinsic dims reserve the
  exact aspect-correct box; decode is paint, not layout (D20-13).
- **"Caps stop bombs, not reading"** — generous limits; photo essays
  save whole (D20-11).
- **"Nothing moves on its own"** — animated images refuse; the calm
  surface stays calm (D20-09).

</specifics>

<deferred>
## Deferred Ideas

- **Book cover images / library cover thumbnails** — rejected this phase
  (D20-03); backlog capability (EPUB manifest cover-image extraction +
  library UI).
- **Sanitized static SVG** — refused this phase (D20-10); revisit with a
  proven static-SVG sanitizer subset.
- **First-frame freeze for animated images** — rejected (D20-09
  alternative); a canvas re-encode pipeline is its own effort.
- **In-reader per-figure retry** — rejected (D20-07); re-ingest is the
  refresh path; revisit on concrete reader friction.
- **PDF embedded-image extraction** — out of scope (D20-01); PDF figure
  regions stay honestly unsupported.

</deferred>

---

*Phase: 20-safe-local-image-fidelity*
*Context gathered: 2026-08-31*
