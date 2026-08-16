# Phase 11: PDF Intake - Pattern Map

**Mapped:** 2026-08-16
**Files analyzed:** 16 (1 new server adapter, 8 modified source, 4 new test artifacts, 3 config/support)
**Analogs found:** 16 / 16 (every file has an in-repo precedent; only 3 sub-components inside the new adapter are genuinely novel — routed to RESEARCH.md patterns)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/pdfToBlocks.ts` (NEW) | service (intake adapter) | transform (batch: bytes → Block tree) | `server/markdownToBlocks.ts` | exact |
| `server/ingest.ts` (MOD) | service (orchestrator) | request-response | itself — markdown branch L200-224 | exact (self-extension) |
| `server/limits.ts` (MOD) | config | n/a (constants) | itself — `MAX_RESPONSE_BYTES` L14-21 | exact (self-extension) |
| `src/ingestion/types.ts` (MOD) | config (Zod schema) | validation | itself — markdown variant L26-30 | exact (self-extension) |
| `src/content/schema.ts` (MOD) | config (Zod schema) | validation | itself — `ArticleSourceSchema` L210-216 | exact (self-extension) |
| `src/ingestion/IngestionClient.ts` (MOD) | utility (client wrapper) | request-response | itself — `ingestMarkdown` L87-92 | exact (self-extension) |
| `src/ingestion/IngestControl.tsx` (MOD) | component | request-response (event-driven form) | itself — `handleFileSubmit` L155-200 | exact (self-extension) |
| `src/ingestion/library/SourceBadge.tsx` (MOD) | component | n/a (render) | itself — `badgeLabel` L35-48 | exact (self-extension) |
| `dev-server/ingest-middleware.ts` (MOD) | middleware | request-response (streaming body read) | itself — `readBody` L29-39 | exact (self-extension) |
| `tests/unit/server/pdf-to-blocks.spec.ts` (NEW) | test (unit) | n/a | `tests/unit/server/markdown-to-blocks.spec.ts` | exact |
| `tests/unit/server/ingest-pdf.spec.ts` (NEW) | test (unit integration) | n/a | `markdown-to-blocks.spec.ts` round-trip describe L421-463 | role-match |
| `tests/e2e/pdf-intake.spec.ts` (NEW) | test (e2e) | n/a | `tests/e2e/library/markdown-upload.spec.ts` | exact |
| `tests/unit/server/pdf-calibration/harness.ts` (NEW) | test/dev tooling (Node script) | batch (corpus → evidence) | `tests/e2e/calibration/fingerprint.compare.ts` | role-match |
| `tests/unit/server/pdf-calibration/{manifest.json, ground-truth/, pdf-evidence.json}` (NEW) | config (committed evidence data) | file-I/O | `calibration/fingerprint.json` via `fingerprint.compare.ts` artifact I/O | role-match |
| `corpus/pdf/` + `.gitignore` entry (NEW) | config | file-I/O | `.gitignore` L26 `.calibration-tmp/` | role-match |
| `package.json` (MOD — unpdf dep) | config | n/a | unified/remark deps in `markdownToBlocks.ts` L39-42 | role-match |

## Pattern Assignments

### `server/pdfToBlocks.ts` (NEW — service, transform)

**Analog:** `server/markdownToBlocks.ts` (the newest adapter precedent, Plan 08-01 — RESEARCH Pattern 1 says "mirror exactly")

**Header comment + server-only boundary discipline** (markdownToBlocks.ts L1-38 — adapt the banner comment; unpdf replaces unified/remark as the server-only import):
```typescript
// server/markdownToBlocks.ts
// Plan 08-01 Task 1 — the strict-CommonMark → 9-kind Block tree adapter. This
// is the second intake format of the Phase 7 ingestion pipeline (sibling of
// `server/htmlToBlocks.ts`). The orchestrator (`server/ingest.ts`) treats
// `markdownToBlocks` and `extractAndNormalize` identically downstream — they
// return the EXACT same `{ blocks, footnotes, lang, provenancePartial,
// isReaderable }` shape, and the same `ArticleSchema.parse` +
// `assertRoundTripAnchor` + `deriveConfidence` stages run on both paths.
//
// ⚠️ Future maintainer: DO NOT enable raw-HTML pass-through on the parser,
// DO NOT pipe `html` node values through an HTML parser, DO NOT carry raw
// HTML as a structured payload. The doc model IS the security boundary
// (ING-07) — once content is Block JSON it is inert.
//
// Server-only (Pitfall 8-6): `unified` / `remark-parse` / `remark-frontmatter`
// / `yaml` are ESM-only and never imported by `/src/*` modules at runtime.
// Only the `Block` / `InlineRun` types are imported (erased by tsc), so the
// client bundle does not grow.
import { unified } from "unified";
...
import type { Block, InlineRun } from "../src/content/schema";
```
PDF mirror: same banner, same `import type { Block, InlineRun } from "../src/content/schema"` (types only — erased), but `import { getDocumentProxy, extractTextItems, getMeta } from "unpdf"` as the server-only dependency. **No DOMPurify on this path** (PDFs carry no HTML — D8-16 precedent stated at L11-24).

**Output contract — byte-identical result shape** (markdownToBlocks.ts L304-314):
```typescript
/** MarkdownToBlocksResult — byte-identical shape to
 *  `server/htmlToBlocks.ts` `ExtractAndNormalizeResult` (L462-464). The
 *  orchestrator destructures both with the same code. */
export interface MarkdownToBlocksResult {
  blocks: Block[];
  footnotes: { id: string; content: InlineRun[] }[];
  lang: string;
  provenancePartial: ProvenancePartial;
  isReaderable: boolean;
}
```
PDF mirror: `PdfToBlocksResult` with the same five fields (RESEARCH Pattern 1: `footnotes: []`, `lang: "en"`, `isReaderable` = own text-bearing heuristic e.g. ≥3 blocks AND ≥1 text-bearing page).

**ProvenancePartial** (markdownToBlocks.ts L45-53):
```typescript
type ProvenancePartial = {
  sourceUrl?: string;
  title?: string;
  author?: string;
  publishedAt?: string;
};
```
Note (D11-07): the adapter stays **filename-agnostic** — `filename` never enters `pdfToBlocks`; the orchestrator owns the title chain (mirrors D8-17 comment at L328-329).

**Core function shape — pure, concurrent-safe** (markdownToBlocks.ts L316-353):
```typescript
export async function markdownToBlocks(md: string): Promise<MarkdownToBlocksResult> {
  const tree = processor.parse(md);
  const blocks: Block[] = [];
  const provenancePartial: ProvenancePartial = {};
  for (const node of tree.children as unknown as MdastNode[]) {
    if (node.type === "yaml") {
      mergeYamlFrontMatter(node.value ?? "", provenancePartial);
      continue;
    }
    blocks.push(...visit(node));
  }
  return {
    blocks,
    footnotes: [], // strict CommonMark has no footnote syntax
    lang: "en",    // markdown carries no lang attribute
    provenancePartial,
    isReaderable: blocks.length >= 3, // mirrors deriveConfidence heuristic
  };
}
```
PDF mirror: `pdfToBlocks(pdfBytes: Uint8Array)` → one `getDocumentProxy` → detect scanned + multi-column BEFORE assembly (typed `IngestionError` refusals) → assemble paragraphs/headings (RESEARCH Patterns 3-6 supply the algorithms — no in-repo analog, see "No Analog Found").

**UnsupportedBlock emission for figures/tables** (markdownToBlocks.ts L278-302 — DOC-06 Pattern 3 destination):
```typescript
// Catch-all (Pattern F — no `default:` clause; the unsupported branch IS
// the catch-all). Any mdast node type not enumerated above becomes an
// honest DOC-06 disclosure.
return [{
  kind: "unsupported",
  originalKind: node.type,
  plainDescription: `A ${node.type} element from the original document that the reader could not render.`,
}];
```
PDF mirror: figures/tables → `UnsupportedBlock` with `originalKind: "figure" | "table"` + `plainDescription` (locked invariant). Note RESEARCH Pitfall 8: figure-heavy PDFs may honestly derive `low` confidence (`unsupportedRatio > 0.4` in `server/confidence.ts` L43, L79-80) — that is ING-06 working.

**Named-helper export for the title chain** (markdownToBlocks.ts L387-404 — the D11-07 filename channel mirror lives in the adapter as a pure helper the orchestrator imports):
```typescript
export function stripMarkdownExtension(filename: string): string {
  return filename.replace(/\.(md|markdown)$/i, "");
}
```
PDF mirror: a `stripPdfExtension`-style helper (`.pdf` case-insensitive) OR keep the chain entirely in `ingest.ts` — planner's call; the discipline is "pure string helper, unit-tested, no path-basename logic".

---

### `server/ingest.ts` (MOD — fourth Stage-1 branch)

**Analog:** itself — the markdown branch is the exact structural template for the pdf branch

**Stage-0 exactly-one-variant guard** (L125-134 — widen the count):
```typescript
const hasUrl = "url" in input && input.url !== undefined;
const hasHtml = "html" in input && input.html !== undefined;
const hasMarkdown = "markdown" in input && input.markdown !== undefined;
if ((hasUrl ? 1 : 0) + (hasHtml ? 1 : 0) + (hasMarkdown ? 1 : 0) !== 1) {
  throw new IngestionError("server-error");
}
```

**Stage-1 branch precedent — the markdown branch** (L200-224; pdf branch mirrors this shape per RESEARCH Example 1):
```typescript
} else {
  // MARKDOWN path — Phase 8 Plan 08-01 (D8-16 + D8-17 + D8-18).
  const mdInput = (input as { markdown: string; filename?: string }).markdown;
  const filename = (input as { markdown: string; filename?: string }).filename;
  finalUrl = undefined;
  const extracted = await markdownToBlocks(mdInput);
  ({
    blocks, footnotes, lang, provenancePartial, isReaderable,
  } = extracted);
  // D8-18: id = "md-<shortHash(canonical content)>" — content-hash, NOT
  // filename. Two uploads of identical .md content produce the same id
  // → dedupe-refuse on re-upload mirrors D7-07. Filename is metadata-only.
  id = `md-${shortHash(mdInput)}`;
  source = "markdown";
  origin = "upload";
  fetchedAt = undefined;
  sourceBytes = mdInput;
  markdownFilenameHint = filename;
}
```
PDF mirror: `id = pdf-${shortHash(b64)}`, `source = "pdf"`, `origin = "upload"`, `sourceBytes = b64`, `pdfFilenameHint = filename`. The closure-variable `markdownFilenameHint` (declared L160-163) gains a sibling (or generalizes) for the D11-07 chain.

**shortHash** (L92-94 — reuse unchanged):
```typescript
function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}
```

**Title fallback chain** (L244-258 — D11-07 mirrors this shape: checked-Info → filename → neutral):
```typescript
const title =
  provenancePartial.title ??
  (hasMarkdown
    ? (markdownFilenameHint
        ? stripMarkdownExtension(markdownFilenameHint)
        : "Markdown document")
    : finalUrl
      ? safeHostname(finalUrl)
      : "Pasted article");
```
PDF mirror: `sane(infoTitle) ? infoTitle : pdfFilenameHint ? strip(pdfFilenameHint) : "PDF document"` — where `sane()` is the D11-07 garbage-pattern check (RESEARCH Example 2 supplies the pattern list). Key difference from markdown: the Info-title must be **sanity-checked before use** (checked-Info is PRIMARY, not `??` fallback order alone).

**Downstream stages run unchanged** (L233-235, L287-322 — do NOT fork; the locked invariant):
```typescript
if (!isReaderable || blocks.length === 0) {
  return { ok: false, reason: "extraction-unsupported" };
}
...
const article: CanonicalArticle = ArticleSchema.parse(assembled);
assertRoundTripAnchor(article);   // Stage 7 — SC#1/SC#4a gate
const confidence: ConfidenceResult = deriveConfidence(article, { isReaderable });
if (confidence.state === "unsupported") {
  return { ok: false, reason: "extraction-unsupported" };
}
```

**Typed-reason catch** (L323-333 — PDF `IngestionError`s surface through this unchanged):
```typescript
} catch (e) {
  if (e instanceof IngestionError) {
    return { ok: false, reason: e.reason };
  }
  return { ok: false, reason: "server-error" };
}
```

---

### `server/limits.ts` (MOD — PDF cap constants)

**Analog:** itself — constant + provenance-comment pattern (L14-26):
```typescript
/** Maximum response body size. A real article HTML is 100KB–2MB; 5MB caps
 * pathological pages without rejecting legitimate long-form. Checked against
 * the Content-Length header BEFORE res.text() (Measure 7 — no body leak on
 * refusal). */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
```
Add (RESEARCH §Pitfall 7 + ARCHITECTURE L781-782, values planner-confirm): `PDF_MAX_BYTES` (~10MB decoded), `PDF_MAX_PAGES` (~500), `PDF_EXTRACTION_TIMEOUT_MS`, `MAX_IMAGE_PIXELS` (16_777_216 — **total pixels w×h, NOT bytes**; carry the corrected semantics per RESEARCH "State of the Art").

---

### `src/ingestion/types.ts` (MOD — request variant + failure reasons)

**Analog:** itself — the Phase 8 markdown widening is the exact precedent (L23-31):
```typescript
export const IngestionRequestSchema = z.union([
  z.object({ url: httpUrl }),
  z.object({ html: z.string().min(1) }),
  // Phase 8 ING-03 + D8-17 — markdown upload with optional filename channel.
  z.object({
    markdown: z.string().min(1),
    filename: z.string().optional(),
  }),
]);
```
PDF mirror (RESEARCH Example 3): `z.object({ pdf: z.string().base64().min(1), filename: z.string().optional() })` — base64-in-JSON keeps the middleware body path byte-identical (locked "POST body variant like markdown's" shape).

**Failure-reason enum additive widening** (L40-52 — five PDF members slot in; RESEARCH Pattern 7 recommends `pdf-unreadable`, `pdf-encrypted`, `pdf-scanned`, `pdf-multi-column`, `pdf-too-large`):
```typescript
export const IngestionFailureReasonEnum = z.enum([
  "ssrf-blocked-scheme",
  ...
  "server-error", // catch-all for unexpected exceptions (5xx)
]);
```

---

### `src/content/schema.ts` (MOD — `"pdf"` source enum member)

**Analog:** itself — `ArticleSourceSchema` L204-217 (the comment already anticipates this exact widening):
```typescript
/** ArticleSourceSchema — D7-08 + D8-15 + D8-16 origin discriminator. The enum
 * is CLOSED; future phases widen it additively ("pdf" Phase 11, "epub-chapter"
 * Phase 12). Phase 8 adds "markdown" (D8-16 ...) and "html-upload" (D8-15 ...).
 * Both widenings are anticipated by ARCHITECTURE.md L390 and are
 * forward-compatible. */
export const ArticleSourceSchema = z.enum([
  "fixture",
  "url",
  "paste",
  "markdown",   // Phase 8 — D8-16 (.md upload via markdownToBlocks)
  "html-upload",// Phase 8 — D8-15 (.html file-upload; paste textarea stays as "paste")
]);
```
Add `"pdf", // Phase 11 — ING-04 (.pdf upload via pdfToBlocks)`. `origin: "upload"` reuses the existing enum (L230) — no origin change. **No Dexie/Pitfall 9 work**: PDF articles are ordinary `articles` rows.

---

### `src/ingestion/IngestionClient.ts` (MOD — `ingestPdf()`)

**Analog:** itself — `ingestMarkdown` L79-92 plus the shared `ingest()` L106-113:
```typescript
export async function ingestMarkdown(
  markdown: string,
  filename?: string,
): Promise<IngestionSuccess> {
  return ingest({ markdown, filename });
}

async function ingest(
  body: { url: string } | { html: string } | { markdown: string; filename?: string },
): Promise<IngestionSuccess> {
  const res = await fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
```
PDF mirror: `export async function ingestPdf(pdfBase64: string, filename?: string)` → `ingest({ pdf: pdfBase64, filename })`; widen the private `body` union type. Everything below L113 (JSON parse → typed refusal throw → `res.ok` guard → `ArticleSchema.parse` re-validation at L140) is reused unchanged — STATE-04 defense-in-depth.

---

### `src/ingestion/IngestControl.tsx` (MOD — accept `.pdf`, binary dispatch, new copy entries)

**Analog:** itself — `handleFileSubmit` L155-200

**Client size cap (T-8-14 precedent → PDF_MAX_BYTES with base64 awareness)** (L160-168):
```typescript
const file = fileInputRef.current?.files?.[0];
if (!file) return;

// Client-side size cap (UI-SPEC §EXTENDED IngestControl + T-8-14). The
// mapReasonToCopy("response-too-large") surface ("This page is too
// large.") is reused verbatim — zero new chrome.
if (file.size > 5 * 1024 * 1024) {
  setStatus("error");
  setMessage(mapReasonToCopy("response-too-large"));
  return;
}
```

**Dispatch by extension + text read** (L170-177 — PDF adds a third dispatch arm; `file.text()` L173 becomes binary read → base64 for `.pdf` — see "No Analog Found"):
```typescript
setStatus("submitting");
setMessage("Reading file…");
try {
  const text = await file.text();
  const isMarkdown = /\.md$/i.test(file.name);
  const result = isMarkdown
    ? await ingestMarkdown(text, file.name)
    : await ingestHtml(text);
```

**Dedupe-refuse before save (D7-07)** (L179-189 — identical for PDF; `pdf-<hash>` id makes identical bytes collide):
```typescript
const alreadyInLibrary = await dexieLibrarySource.has(result.article.id);
if (alreadyInLibrary) {
  setStatus("error");
  setMessage(mapReasonToCopy("already-in-library"));
  return;
}
await dexieLibrarySource.save(result.article);
```

**mapReasonToCopy exhaustive switch** (L45-67 — new PDF reasons get calm DOC-06 entries; RESEARCH Pattern 7 supplies the copy):
```typescript
function mapReasonToCopy(reason: IngestionFailureReason): string {
  switch (reason) {
    ...
    case "server-error":
    default:
      return "Something went wrong. Try again.";
  }
}
```

**File-picker accept attribute** (L255): `accept=".md,.html"` → `accept=".md,.html,.pdf"` (+ the `<p className="meta">Accepts .md and .html</p>` copy at L249).

---

### `src/ingestion/library/SourceBadge.tsx` (MOD — `"pdf"` badge case)

**Analog:** itself — `badgeLabel` L35-48 (exhaustive switch, **no default — TypeScript will flag the unhandled `"pdf"` case once the enum widens**, exactly as the comment promises):
```typescript
function badgeLabel(source: NonNullable<CanonicalArticle["ingestionMeta"]>["source"]): string {
  switch (source) {
    case "fixture":    return "Sample";
    case "url":        return "Web";
    case "paste":      return "Pasted";
    case "markdown":   return "Markdown";
    case "html-upload":return "HTML file";
  }
}
```
Add `case "pdf": return "PDF";` (renders plain text — no sourceUrl, same as markdown/html-upload branches at L59-67).

---

### `dev-server/ingest-middleware.ts` (MOD — content-length guard)

**Analog:** itself — `readBody` L29-39 is where the unbounded accumulation lives (RESEARCH Pitfall 7: `readBody` accumulates without cap; check `content-length` against `ceil(PDF_MAX_BYTES × 4/3) + overhead` BEFORE reading):
```typescript
function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk: string) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
```
The route-match + typed-response pattern (L60-87) needs no change — base64-in-JSON keeps `readBody` + `handleIngestBody` byte-identical (locked decision).

---

### `tests/unit/server/pdf-to-blocks.spec.ts` (NEW — adapter unit suite)

**Analog:** `tests/unit/server/markdown-to-blocks.spec.ts` (sibling adapter suite — clone the structure)

**Imports + 9-kind contract** (L14-39):
```typescript
import { describe, expect, it } from "vitest";
import {
  markdownToBlocks,
  stripMarkdownExtension,
  SCHEMA_KINDS,
} from "../../../server/markdownToBlocks";
import { ArticleSchema, type CanonicalArticle, type Block } from "../../../src/content/schema";
import { assertRoundTripAnchor } from "../../../server/ingest";
```

**Adapter-shape describe** (L72-102 — adapt for the five-field PdfToBlocksResult):
```typescript
describe("markdownToBlocks — adapter shape", () => {
  it("returns a result with blocks, footnotes, lang, provenancePartial, isReaderable", async () => {
    const result = await markdownToBlocks(FIXTURE_MD);
    expect(Array.isArray(result.blocks)).toBe(true);
    ...
  });
  it("emits no footnotes ...", ...);
});
```
PDF additions per RESEARCH test map: line binning, gutters, scanned floors, title chain, outline mapping, hyphen joins, D11-09 consume, dedupe id stability — driven by tiny **synthetic committed fixtures** (generated, <10KB, clearly labeled — D11-04 restricts the calibration corpus, NOT unit fixtures).

**Security/inertness discipline** (L356-418 — the "zero structured payload survives" pattern; PDF analog: extracted text is plain JSON text, no PDF operators survive as structure).

---

### `tests/unit/server/ingest-pdf.spec.ts` (NEW — fourth-branch integration + round-trip gate)

**Analog:** `markdown-to-blocks.spec.ts` round-trip describe L421-463 — build a CanonicalArticle from adapter output and run the gate:
```typescript
const article: CanonicalArticle = ArticleSchema.parse({
  id: "md-roundtrip-fixture",
  revision: 1,
  lang: result.lang,
  provenance: {
    title: result.provenancePartial.title ?? "Markdown document",
    ...
  },
  blocks: result.blocks,
  footnotes: result.footnotes,
  ingestionMeta: {
    source: "paste",   // Task-1-safe enum values (pre-widening) — PDF version uses "pdf" AFTER widening
    ...
  },
});
// MUST not throw — the 5-offset selector sample resolves to "confident".
expect(() => assertRoundTripAnchor(article)).not.toThrow();
```
Also call `ingest({pdf, filename})` directly (SC#4a) and assert typed refusals (`pdf-scanned`, `pdf-multi-column`, `pdf-encrypted`, `pdf-too-large`) return `{ok:false, reason}` envelopes — the `ingest()` catch at `server/ingest.ts` L323-333 guarantees serialization.

---

### `tests/e2e/pdf-intake.spec.ts` (NEW — SC#1-3 flows)

**Analog:** `tests/e2e/library/markdown-upload.spec.ts` (cloned from happy-path.spec.ts — clone again)

**Harness: image stub + IndexedDB wipe** (L128-145):
```typescript
test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/ (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      ...
    });
  });
});
```

**Upload via setInputFiles + submitting copy + id-prefix URL wait** (L158-174):
```typescript
const fileInput = page.locator("input#ingest-file");
await fileInput.setInputFiles({
  name: "calm-reading.md",
  mimeType: "text/markdown",
  buffer: Buffer.from(MARKDOWN_WITH_FRONTMATTER, "utf-8"),
});
await page.getByRole("button", { name: /add file/i }).click();
await expect(
  page.locator(".ingest-control .status").filter({ hasText: "Reading file…" }),
).toBeVisible();
await page.waitForURL(/#\/article\/md-/, { timeout: 15_000 });
```
PDF mirror: `name: "report.pdf"`, `mimeType: "application/pdf"`, `waitForURL(/#\/article\/pdf-/)`, synthetic fixture buffer.

**Refusal assertions (SC#2/SC#3)** — mirror the dedupe-refuse assertion shape (L256-267): assert BOTH the `.status` calm copy AND that no library row appeared / no navigation happened:
```typescript
await expect(
  page.locator(".ingest-control .status").filter({ hasText: "Already in your library." }),
).toBeVisible({ timeout: 15_000 });
await expect(page).toHaveURL(/\/#\/$/);
await expect(page.locator(".library-list > li")).toHaveCount(expectedRowsAfterFirst);
```

**Badge assertion** (L205-208): `.locator(".source-badge").filter({ hasText: "Markdown" })` → `hasText: "PDF"`.

---

### `tests/unit/server/pdf-calibration/` harness + committed artifacts (NEW)

**Analog:** `tests/e2e/calibration/fingerprint.compare.ts` — the Phase 3 committed-`fingerprint.json` discipline D11-04 mirrors

**Refuse-empty-input guard, exit 2** (L199-211 — the exact precedent CONTEXT cites):
```typescript
const freshResults = loadTempResults();
if (freshResults.length === 0) {
  // No fresh calibration data — the harness did not run (or wrote no
  // samples). Do NOT overwrite the committed fingerprint; surface the
  // error so CI catches a misconfigured calibrate step.
  console.error("[calibration] refusing to overwrite calibration/fingerprint.json with empty data");
  console.error("[calibration] D3-10 gate SKIPPED (no fresh data)");
  process.exit(2);
}
```
PDF mirror (D11-04 two modes): LOCAL `--derive` verifies corpus presence + SHA-256 vs manifest (exit 2 on missing/empty — never silent skip); CI default replays the committed `pdf-evidence.json` against the D11-06 bar + manifest; missing record → non-zero "calibration requires the local corpus — see docs".

**Committed-artifact write shape** (L216-230 — thresholds/evidence recorded WITH their numbers):
```typescript
const freshFingerprint: Fingerprint = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  toleranceBound: { heightDriftPx: TOLERANCE_PX, breaksExact: true },
  rationale: buildRationale(freshResults, enginesPresent),
  engines: freshByEngine,
};
mkdirSync(resolve(FINGERPRINT_PATH, ".."), { recursive: true });
writeFileSync(FINGERPRINT_PATH, JSON.stringify(freshFingerprint, null, 2) + "\n", "utf8");
```
PDF mirror: `pdf-evidence.json` = `{schemaVersion, generatedAt, thresholds: {...}, results: [{file, sha256, expectedClass, verdict, agreement?}]}` (RESEARCH Pattern 8).

**Exit-code contract documented in header** (L16-18): `0` pass / `1` regression(fail) / `2` no-data — harness.ts documents its own codes the same way. Wire into `package.json` beside `"calibrate"` (L14):
```json
"calibrate": "playwright test calibration.harness && node tests/e2e/calibration/fingerprint.compare.ts",
```

**Node-script style** (L29-34, L197): plain `import { readFileSync, ... } from "node:fs"` + `function main(): void` + top-level `main()` — Node 22 strips TS types natively, no transpile step. Manifest `sha256` integrity via `node:crypto` mirrors `shortHash` in `server/ingest.ts` L92-94.

---

## Shared Patterns

### Adapter output contract (the load-bearing invariant)
**Source:** `server/markdownToBlocks.ts` L304-314 (and `server/htmlToBlocks.ts` `ExtractAndNormalizeResult`)
**Apply to:** `server/pdfToBlocks.ts` — result must be destructurable by the same code in `server/ingest.ts` L144-148
```typescript
export interface MarkdownToBlocksResult {
  blocks: Block[];
  footnotes: { id: string; content: InlineRun[] }[];
  lang: string;
  provenancePartial: ProvenancePartial;
  isReaderable: boolean;
}
```

### Typed refusal → calm DOC-06 copy
**Source:** `server/errors.ts` L20-31 + `src/ingestion/types.ts` L40-52 + `src/ingestion/IngestControl.tsx` L45-67
**Apply to:** every PDF refusal path (scanned / multi-column / encrypted / corrupt / oversized)
```typescript
export class IngestionError extends Error {
  readonly reason: IngestionFailureReason;
  constructor(reason: IngestionFailureReason, message?: string) {
    super(message ?? reason);
    this.reason = reason;
    this.name = "IngestionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```
Discipline: throw `IngestionError("pdf-scanned")` etc. inside the adapter; the orchestrator catch (ingest.ts L323-333) serializes; `mapReasonToCopy` maps to calm copy; the T-7-26 "no jargon leak" test pattern extends to the new reasons.

### Content-hash id + dedupe-refuse (D7-07 / D8-18 → D11)
**Source:** `server/ingest.ts` L92-94 + L216; `src/ingestion/IngestControl.tsx` L110-115, L179-189
**Apply to:** `id = pdf-${shortHash(b64)}` — identical bytes → same id → "Already in your library."
```typescript
id = `md-${shortHash(mdInput)}`;
...
const alreadyInLibrary = await dexieLibrarySource.has(result.article.id);
if (alreadyInLibrary) { setStatus("error"); setMessage(mapReasonToCopy("already-in-library")); return; }
```

### Additive enum widening + exhaustive switches
**Source:** `src/content/schema.ts` L210-216 (enum widened with provenance comments); `src/ingestion/library/SourceBadge.tsx` L35-48 (no-default switch — TS flags new members)
**Apply to:** `ArticleSourceSchema` + `"pdf"`; `IngestionFailureReasonEnum` + PDF members; `badgeLabel` + `case "pdf"`. Never edit shipped members — widen only.

### Zod-at-boundary double validation (STATE-04)
**Source:** `server/ingest.ts` L287 (server parse) + `src/ingestion/IngestionClient.ts` L140 (client re-parse)
**Apply to:** PDF articles — no exception; the envelope is unchanged
```typescript
const article = ArticleSchema.parse(json.article); // client read-path re-validation
```

### Server-only dependency boundary
**Source:** `server/markdownToBlocks.ts` L35-38 (unified/remark never imported by `/src/*`; only `Block`/`InlineRun` types cross, erased by tsc)
**Apply to:** unpdf — import only from `/server/*`; verify `npm run build` client-bundle size unchanged in the gate (RESEARCH Pitfall 12; the Phase 7-8 eslint/tsconfig boundary already enforces).

### Round-trip anchor gate (SC#1/SC#4a)
**Source:** `server/ingest.ts` L60-85 (`assertRoundTripAnchor` — 5-offset TextQuoteSelector samples via the SHARED `src/content/normalizeText.ts`, Pitfall 2 no-fork)
**Apply to:** every admitted PDF — runs automatically on the fourth branch; unit test via the markdown spec's CanonicalArticle-build pattern (markdown-to-blocks.spec.ts L421-463).

### Committed-evidence replay discipline (D3-01 → D11-04/06)
**Source:** `tests/e2e/calibration/fingerprint.compare.ts` L199-211 (refuse-empty exit 2), L224-230 (write committed artifact), L245-270 (regression gate exit 1)
**Apply to:** `tests/unit/server/pdf-calibration/harness.ts` + `manifest.json` + `pdf-evidence.json` — derived evidence commits; CI replays; corpus stays local + gitignored; never silently skip.

## No Analog Found

Sub-components with no in-repo precedent (planner: use RESEARCH.md patterns, not codebase search):

| Item | Location | Reason | RESEARCH Source |
|------|----------|--------|-----------------|
| unpdf proxy lifecycle + caps + timeout race (`withPdfDocument`) | `server/pdfToBlocks.ts` | No PDF code exists in repo | §Pattern 2 (verified from unpdf source; `getOutline`/`getDestination`/`getPageIndex` confirmed) |
| Column detection (band-coverage gutters, page-weighted majority) | `server/pdfToBlocks.ts` | No layout-analysis code in repo | §Pattern 3 + §Pitfalls 3-4 |
| Scanned detection (per-page text floors) | `server/pdfToBlocks.ts` | No detection code in repo | §Pattern 4 |
| Outline-first heading + font-size fallback + D11-09 title consume | `server/pdfToBlocks.ts` | No analog (markdown headings come from mdast depth) | §Pattern 5 + §Pitfalls 10-11 |
| Binary file read → base64 in the browser | `src/ingestion/IngestControl.tsx` | Closest is `file.text()` (L173) — text only; FileReader/arrayBuffer→base64 is new client code | §Architectural Responsibility Map row 1 (File API) |
| Synthetic tiny-PDF fixture generation | unit/e2e specs | No PDF fixtures exist; must be generated programmatically (committable — NOT the calibration corpus) | §Validation Architecture "Synthetic unit fixtures" |

## Metadata

**Analog search scope:** `server/`, `src/ingestion/` (incl. `library/`), `src/content/`, `dev-server/`, `tests/unit/server/`, `tests/e2e/{calibration,library,ingestion}/`, `.gitignore`, `package.json`
**Files read for excerpts:** 12 (`markdownToBlocks.ts`, `ingest.ts`, `limits.ts`, `errors.ts`, `confidence.ts`, `ingestAdapter.ts`, `ingest-middleware.ts`, `types.ts` ×2, `schema.ts`, `IngestionClient.ts`, `IngestControl.tsx`, `SourceBadge.tsx`, `markdown-to-blocks.spec.ts`, `fingerprint.compare.ts`, `markdown-upload.spec.ts`)
**Pattern extraction date:** 2026-08-16
