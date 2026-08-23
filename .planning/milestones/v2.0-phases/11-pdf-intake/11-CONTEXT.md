# Phase 11: PDF Intake - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 adds **PDF as the fourth intake format** (ING-04). A reader uploads a
text-heavy PDF; `pdfToBlocks` extracts positioned text items and normalizes
them into the canonical Block tree; the article enters the library and
paginates, annotates, and restores location identically to every other
article. The defining discipline is **honest failure**: scanned/image-only
PDFs refuse with a typed "couldn't read this" reason (DOC-06), multi-column
PDFs refuse rather than silently reorder text (SC#3), and a real-PDF
calibration harness validates the font-size→heading and vertical-gap→paragraph
thresholds **before promotion** (SC#4).

**Phase 11 does NOT ship** (deferred):
- **Multi-column reading-order reconstruction** — detection refuses;
  reconstruction is a separable sub-project with its own corpus + quality bar
  (Pitfall 7 mitigation 2), revisit only after Phase 11 evidence exists.
- **OCR for scanned PDFs** — anti-feature per FEATURES.md L114; detection +
  honest refusal is the v2.0 scope.
- **PDF "text view" vs page-image dual rendering** — FEATURES.md L105
  differentiator; Phase 11 ships the normalized text view only (the reader
  treats a PDF article like any other article).
- **PDF snapshot/image-region highlights** — FEATURES.md L106; requires a
  non-text anchor kind, out of scope.
- **EPUB intake** — Phase 12. **Polish + NVDA acceptance** — Phase 13.
- **Edit-metadata panel** (fixing a bad PDF title manually) — FEATURES.md L95;
  the sanity-checked title chain (D11-05) reduces the need; the panel is a
  later surface.

**Load-bearing invariants (locked — do NOT re-ask):**
- **Ingested = fixture to the reading engine.** Every admitted PDF article
  passes `ArticleSchema.parse` + `assertRoundTripAnchor` (5-offset
  TextQuoteSelector round-trip → `confident`) — the same 7-stage pipeline
  stages 2+ the URL/paste/markdown paths run (SC#1, SC#4a).
- **`unpdf` 1.8.0 is the PDF library** (STACK.md L63, L128-130). Rejected:
  raw pdfjs-dist (re-implements worker setup), pdf-parse (unmaintained, prior
  advisories), mupdf-js (native bindings). Pin exact.
- **Resource limits** (ARCHITECTURE L781-782): `maxImageSize` (~16MB),
  numPages cap (~500) checked before extraction, timeout race on extraction.
  Oversized PDFs fail honestly without OOMing the worker (SC-aligned with
  ARCHITECTURE Phase 11 exit criteria).
- **Figures/tables → `UnsupportedBlock` with `plainDescription`** (DOC-06,
  Pattern 3). One article per PDF; chapter detection deferred
  (ARCHITECTURE L345 MEDIUM-risk note).
- **Server-only dependency** — unpdf lives in `/server`, never enters the
  client bundle (ARCHITECTURE L984). Phase 7's Vite-Node-middleware runtime
  (`/api/ingest`) is the host; PDF upload is a POST body variant like
  markdown's.
- **D7-07 save-once + dedupe-refuse** — PDF id derives from content hash
  (mirroring D8-18's `md-<shortHash>` precedent → `pdf-<shortHash>`); re-upload
  of identical bytes → "Already in your library."
- **Pitfall 2 one-normalizer discipline** — `pdfToBlocks` text joins any
  PDF-specific hyphenation/whitespace rules through the SHARED normalizer if
  needed (PITFALLS L51), never a fork.

</domain>

<decisions>
## Implementation Decisions

### Carrying forward (locked by Phases 7/8 — do NOT re-litigate)

- Doc model is the security boundary — PDF extraction produces Block JSON;
  React renders Block JSON; PDFs carry no HTML so DOMPurify is not on this
  path (mirrors the markdown precedent D8-16).
- Calm DOC-06/PAGE-09 voice for every refusal (D7-04) — new typed reasons map
  to calm copy via the existing `mapReasonToCopy` surface.
- Pitfall 9 (Dexie version discipline) — no new stores expected; PDF articles
  are ordinary `articles` rows (`source: "pdf"` widening is additive enum).
- `IngestionRequestSchema` widens additively (a `{pdf, filename?}` variant);
  `ArticleSourceSchema` gains `"pdf"` (schema.ts L205-207 anticipated this
  evolution; ARCHITECTURE L390 lists it).

### Multi-column policy (SC#3)

- **D11-01: Detect + refuse — NO reconstruction in Phase 11.** Column
  detection (x-coordinate clustering per page) runs, but Phase 11 ships no
  reading-order reconstruction. Multi-column PDFs refuse with a typed reason
  through the same DOC-06 disclosure surface as scanned PDFs. Grounded in
  Pitfall 7 mitigation 2 ("reading-order reconstruction is a separable
  sub-project… treat it like PAGE-08 calibration — do not enable by default
  until cross-PDF quality is proven"). Zero risk of admitting silently
  reordered text — SC#3's hard line.
- **D11-02: Balanced detection tuning.** Thresholds tune both directions —
  refuse multi-column, admit single-column — and the calibration corpus MUST
  include borderline cases (pull quotes, sidebars, indented blockquotes) to
  calibrate the boundary. (Chosen over "bias to refuse": the corpus exists
  precisely to make a balanced boundary trustworthy; a detection
  over-refusal of ordinary prose would gut the feature's reader value.)
- **D11-03: Page-weighted majority verdict.** Multi-column is a
  whole-document verdict computed page-weighted: refuse only when columnar
  pages dominate (>~50% of text-bearing pages; exact ratio is
  corpus-calibrated). A stray figure/table page with columnar caption text
  does not refuse an otherwise single-column document. Per-page columnar
  text inside an ADMITTED document is not reconstructed — those regions
  extract in naive order like any other tolerated noise (the balanced
  posture accepts this is bounded by the majority rule + corpus evidence).

### Calibration corpus & bar (SC#4)

- **D11-04: Real PDFs, LOCAL-ONLY, evidence replay in CI (user-accepted CI
  limitation).** The corpus is real PDFs living in a gitignored local
  directory. Only DERIVED calibration evidence commits (recorded threshold
  metrics/classification results/snapshots) — the Phase 3 committed
  `fingerprint.json` discipline: a recorded artifact is the durable truth;
  the local corpus is the re-derivation path. CI validates the recorded
  numbers replay-style; it cannot re-derive them, and the user explicitly
  accepted that limitation. (Licensing/repo-size concerns drove this over
  committing PDF binaries.)
- **D11-05: Corpus shape — committed manifest + ~6-10 real PDFs across 4
  classes.** A committed MANIFEST (gitignored dir convention) records
  filename + SHA-256 + expected classification (single-column / scanned /
  multi-column / borderline) per PDF. Locally, the harness verifies corpus
  presence + integrity against the manifest; in CI, absence fails honestly
  ("calibration requires the local corpus — see docs") rather than silently
  skipping. Composition spans producers (Word, LaTeX, InDesign/print) and
  all four classes including borderline (pull quotes, sidebars). Mirrors the
  v1.0 6-fixture curated-corpus philosophy.
- **D11-06: Promotion bar = classification correctness + structural
  agreement.** Every corpus PDF must get its CLASS right (scanned → refused,
  multi-column → refused, single-column → admitted) AND every admitted PDF's
  extracted structure must match human-labeled ground truth at ≥90%
  block-level agreement (heading-where-heading, paragraph-where-paragraph;
  the exact ratio is tunable by research against corpus results).
  Ground-truth labels live beside the manifest. This is the explicit,
  auditable SC#4 "before promotion" gate — the D3-01 per-kind-gate spirit
  applied to PDF thresholds.

### Title & heading sources

- **D11-07: Provenance.title chain = sanity-checked Info-title → filename →
  neutral.** PDF Info-dictionary title is used FIRST only if it passes
  garbage checks (reject empty, "untitled"-likes, "Microsoft Word - …"
  producer prefixes, implausible lengths); then filename minus `.pdf`
  (D8-17 markdown chain shape); then a neutral "PDF document". Extracts real
  titles when metadata is good (the polished-report common case) without ever
  surfacing garbage in the library. Exact garbage-pattern list is
  researcher's.
- **D11-08: Heading detection = PDF outline-first, font-size fallback.** When
  the PDF carries an outline (bookmarks), outline destinations are the
  PRIMARY heading signal (author-declared structure beats font ratios);
  calibrated font-size heuristics (fontSize > body-by-threshold) fill gaps
  for outline-less PDFs and uncovered blocks. RESEARCH MUST VERIFY unpdf
  1.8.0 exposes outline→destination mapping (STACK.md notes unpdf wraps
  pdfjs-dist; if the API surface is missing, this decision degrades to
  font-size-only for Phase 11 rather than adding raw pdfjs-dist).
- **D11-09: Page-1 title match → consume, not duplicate.** If the largest
  page-1 text matches the chosen Provenance.title (fuzzy —
  case/whitespace-insensitive containment), consume it as the title and emit
  NO heading block for it (ArticleView renders the title from provenance;
  bodies start at h2 — the one-h1-per-page v1.0 discipline). Otherwise the
  large text is just the first heading. Prevents the doubled-title look.

### the agent's Discretion

- **Column-detection algorithm specifics** — x-clustering method, gap
  thresholds, minimum text-bearing-page definition, the exact majority
  ratio (D11-03 locks page-weighted majority; numbers are corpus-calibrated).
- **Scanned-detection threshold** — "zero or near-zero text items per page"
  quantification (bytes-per-page / items-per-page floor).
- **Garbage-title pattern list** (D11-07 locks the chain; the patterns are
  researcher's).
- **Ground-truth label format** — how block-level labels are authored/stored
  beside the manifest; the ≥90% agreement metric definition (exact match vs
  boundary tolerance) is researcher/planner, with D11-06 locking that a bar
  exists and is explicit.
- **Resource-limit exact values** — maxImageSize / numPages cap / timeout
  numbers (ARCHITECTURE suggests 16MB / 500; confirm against unpdf API).
- **New failure-reason granularity** — how many typed reasons the PDF path
  adds to `IngestionFailureReasonEnum` (e.g. one `pdf-unreadable` vs
  separate scanned/multi-column/encrypted reasons) and their calm copy;
  the DISCIPLINE (typed reasons, DOC-06 voice, no silent garbage) is locked.
- **PDF upload UI details** — the existing `accept=".md,.html"` picker gains
  `.pdf`; binary body handling + client size cap are researcher/planner.

### Folded Todos
*None — `todo.match-phase 11` returned no matches.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 11 goal + 4 success criteria (upload →
  normalized article identical to others; scanned refusal; multi-column
  flag-or-refuse via disclosure; round-trip anchor gate + calibration harness
  before promotion).
- `.planning/REQUIREMENTS.md` — ING-04 (this phase's requirement, §Ingestion
  L15); ING-06/07/08 (locked Phase 7 substrate that must not regress — honest
  failure, doc-model security boundary, resource refusal). Requirement
  coverage table L106.
- `.planning/PROJECT.md` — "PDF extraction quality are the riskier pipelines"
  positioning; v2.0 milestone framing; honest full-suite execution Key
  Decision.

### v2.0 milestone research (THE architecture authority)
- `.planning/research/PITFALLS.md` — **Pitfall 7 (L214-244): PDF extraction
  silently producing wrong-order or empty text** — the five mitigations
  (detect + disclose scanned/multi-column/tabular; reconstruction is
  separable; conservative per-page coercion; round-trip anchor test on PDF
  text; honest high-unsupported-rate scope). Pitfall 2 (L43-62: shared
  normalizer — PDF hyphenation/whitespace joins go through the shared
  module). Pitfall 4 cross-ref (perf: off-main-thread ingestion, L372-387 —
  PDF parsing stays server-side per Phase 7 architecture).
- `.planning/research/ARCHITECTURE.md` — **Pattern 3 — Per-Format Intake
  Adapters (L337-355)**: the PDF row (unpdf extractTextItems → positioned
  items with fontSize/y/hasEOL → group by vertical gap → Heading when
  fontSize > body threshold; figures/tables → UnsupportedBlock; one article
  per PDF). **L781-782 resource limits** (maxImageSize 16MB, numPages 500,
  timeout race). **L1072-1087 §Phase 11** (builds, exits, substrate risk
  MEDIUM). File tree L173 (`server/pdfToBlocks.ts`). `source` enum L390.
- `.planning/research/FEATURES.md` — **§Feature Area 2 (L73-134)**: PDF row
  in per-format expectations (L86 — "Title is unreliable. Underlying text is
  noisy. Honest disclosure required"); anti-features L113-114 (mandatory
  reflow, scanned-PDF OCR); differentiators L105-106 (dual-mode text/page
  view, snapshot highlights — both deferred); PDF dependency chain L131-133.
- `.planning/research/STACK.md` — L63 (unpdf 1.8.0 rationale + known-weak
  multi-column case + sequence-after guidance), L128-130 (rejected:
  pdfjs-dist raw / pdf-parse / mupdf-js), L144 (pdf-parse advisory).

### Prior-phase contracts this phase extends
- `.planning/phases/07-ingestion-substrate/07-CONTEXT.md` — D7-03
  (input-source-agnostic pipeline), D7-04 (calm DOC-04/06 voice), D7-07
  (id derivation + dedupe-refuse), D7-08 (optional sourceUrl + origin
  discriminator); the load-bearing invariant (ingested = fixture).
- `.planning/phases/08-markdown-pipeline-and-personal-library/08-CONTEXT.md`
  — D8-16 (adapter-no-sanitizer precedent — PDF mirrors: no HTML, no
  DOMPurify), D8-17 (title fallback chain shape D11-07 mirrors), D8-18
  (content-hash id + dedupe — D11's `pdf-<shortHash>` mirrors).
- `.planning/phases/09-versioned-export-import/09-CONTEXT.md` — D9-01 (ZIP
  bundle chosen partly for forward-compat with PDF/EPUB assets; Phase 11
  carries no image assets — PDFs normalize to text blocks).

### Source code contracts (READ before implementing)
- `server/ingest.ts` — the 7-stage orchestrator PDF plugs into: the
  three-branch Stage 1 becomes four (`{url} | {html} | {markdown} | {pdf}`);
  `assertRoundTripAnchor` (SC#1/SC#4a gate), `shortHash` (id derivation),
  title-fallback-chain shape, IngestionError → typed reason catch.
- `server/markdownToBlocks.ts` — the newest adapter precedent (Plan 08-01):
  pure function, same output contract `{blocks, footnotes, lang,
  provenancePartial, isReaderable}`, filename-agnostic (orchestrator owns
  title chain). `pdfToBlocks` mirrors this shape.
- `server/ingestAdapter.ts` + `dev-server/ingest-middleware.ts` — the
  Vite-Node-middleware runtime hosting `/api/ingest` (Phase 7 HYBRID
  CONTINGENCY; the production-future `functions/api/ingest.ts` shape).
- `server/limits.ts` — existing response/content caps the PDF path extends
  (maxImageSize/numPages/timeout land here or sibling).
- `src/ingestion/types.ts` — `IngestionRequestSchema` (widens additively),
  `IngestionFailureReasonEnum` (11 reasons; PDF adds typed members),
  `IngestionResponseSchema` (unchanged envelope).
- `src/content/schema.ts` — `ArticleSourceSchema` (L205-207 anticipated
  widening; add `"pdf"`), `IngestionMetaSchema`, `BlockSchema` 9 kinds +
  `UnsupportedBlock` (figure/table destination).
- `src/ingestion/IngestionClient.ts` + `src/ingestion/IngestControl.tsx` —
  client wrapper (adds PDF upload method; L255 `accept=".md,.html"` gains
  `.pdf`) + the four-state form with `.status` live region + calm
  `mapReasonToCopy` where new PDF refusals surface.
- `tests/e2e/calibration/` — the Phase 3 calibration harness + committed
  `fingerprint.json` discipline D11-04 mirrors (evidence-replay shape).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`server/ingest.ts` pipeline** — stages 2+ (`ArticleSchema.parse` →
  `assertRoundTripAnchor` → `deriveConfidence` → stamp) run identically on a
  fourth input branch; PDF only supplies Stage 1 (extract) + id/title
  derivation.
- **`markdownToBlocks` adapter shape** — the exact structural template:
  pure, filename-agnostic, same output contract, orchestrator owns title
  chain. `pdfToBlocks` is its sibling.
- **`IngestControl` four-state machine + `mapReasonToCopy`** — new PDF
  refusal reasons surface through the existing calm-voice mapping; upload UI
  extends the existing file picker.
- **Phase 3 calibration-harness discipline** — per-engine harness + committed
  evidence artifact (`fingerprint.json`) + refuse-empty-input guard: the
  shape D11-04's PDF calibration harness + committed evidence record mirror.
- **`shortHash` + paste/md id patterns** — `pdf-<shortHash(source bytes)>`
  mirrors two proven call sites.

### Established Patterns
- Zod-at-boundary (`ArticleSchema.parse` + client re-validation through
  `IngestionResponseSchema`).
- One normalizer, one path (Pitfall 2) — any PDF text-joining rule lands in
  the shared normalizer, re-versioned per DOC-04 if needed.
- Additive enum/schema widening (no shipped-block edits; Pitfall 9 for any
  Dexie change).
- Typed failure catalog + calm DOC-06 copy + `.status` live region.
- Playwright/real-suite honesty for e2e gates; calibration before promotion
  (D3-01 per-kind-gate spirit → D11-06).

### Integration Points
- `server/pdfToBlocks.ts` (NEW) — the unpdf adapter (extraction, column
  detection, scanned detection, heading/paragraph coercion → Block tree).
- `server/ingest.ts` — fourth Stage-1 branch + `pdf-<shortHash>` id +
  checked-Info→filename→neutral title chain (D11-07).
- `src/ingestion/types.ts` — request variant + failure-reason members.
- `src/content/schema.ts` — `"pdf"` in `ArticleSourceSchema`; `origin:
  "upload"` reuse.
- `IngestControl` file picker — `accept` adds `.pdf`; binary POST handling.
- PDF calibration harness (NEW, `tests/` location planner's) + gitignored
  local corpus dir + committed manifest + committed evidence record.

</code_context>

<specifics>
## Specific Ideas

- **The user's local-only corpus call is a deliberate CI trade-off, not an
  oversight.** Real-PDF binaries stay out of git (licensing/size); the
  committed manifest + derived evidence record carry the durable truth. CI
  replay-validates; re-derivation is explicitly a local-only act. Downstream
  agents must NOT "fix" this by committing PDFs or synthesizing fixtures to
  make CI re-derive — that re-litigates a user decision.
- **"Never silently reordered" outranks reader coverage.** When balanced
  detection (D11-02) is uncertain at the margin, the refusal path is the
  safe side: an honest "couldn't read this" is calm; interleaved gibberish
  is the worst outcome. But the corpus exists so the boundary is tuned, not
  lazy.
- **Outline-first heading detection is conditional on API verification.**
  D11-08 carries its own escape hatch — if unpdf 1.8.0 lacks outline
  destination mapping, degrade to font-size-only for Phase 11 rather than
  adding raw pdfjs-dist (the STACK.md rejection stands).
- **The doubled-title guard is a v1.0 discipline echo.** D11-09 keeps the
  one-h1-per-page rule intact for PDFs — provenance header renders the
  title; the body never repeats it as a heading when they match.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later
phases (confirmed, not new):
- **Multi-column reading-order reconstruction** — separable sub-project
  (Pitfall 7); own corpus + measured quality bar before enabling. Not
  scheduled; revisit with Phase 11 calibration evidence.
- **OCR for scanned PDFs** — anti-feature for v2.0 (FEATURES.md L114);
  detect + refuse + suggest an external OCR tool.
- **PDF dual-mode rendering (page-image + reflowed text)** — FEATURES.md
  L105 differentiator, LARGE; later milestone.
- **PDF snapshot/image-region highlights** — FEATURES.md L106; needs a
  non-text anchor kind.
- **Edit-metadata panel** (manual title/author fix) — FEATURES.md L95;
  later surface (D11-07's checked chain reduces the pressure).
- **EPUB intake** — Phase 12 (ING-05). **Polish + NVDA/v2.0 acceptance** —
  Phase 13.
- **Cover images / image assets in bundles for PDFs** — Phase 9's ZIP format
  anticipated them; Phase 11 normalizes to text blocks only.

</deferred>

---

*Phase: 11-pdf-intake*
*Context gathered: 2026-08-16*
