# Phase 7: Ingestion Substrate - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 28 (12 new source + 8 modified source + 1 new config + 7 new test)
**Analogs found:** 18 / 28 (10 have no in-repo analog — new runtime layer; planner uses RESEARCH.md §Pattern 1 / §SSRF Guard / §Confidence / §Slug / §Timeout instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `functions/api/ingest.ts` (NEW) | server-edge-function | request-response | *(none in v1.0 — first server runtime)* | **no-analog** (use RESEARCH.md §Pattern 1) |
| `server/ingest.ts` (NEW) | server-pipeline-orchestrator | transform | `scripts/normalize-source.ts` (`main()` L316-373) | role+flow-match |
| `server/htmlToBlocks.ts` (NEW) | server-pipeline-stage | transform | `scripts/normalize-source.ts` (D-09 ancestor) | **exact** (named ancestor) |
| `server/safeFetch.ts` (NEW) | server-adapter-guard | request-response | *(none)* | **no-analog** (use RESEARCH.md §SSRF Guard Implementation) |
| `server/confidence.ts` (NEW) | server-utility | transform | *(none)* | **no-analog** (use RESEARCH.md §Confidence Thresholds) |
| `server/slugify.ts` (NEW) | server-utility | transform | `scripts/normalize-source.ts` (URL normalization L294-297, 344-346) | partial (URL-handling only) |
| `server/limits.ts` (NEW) | server-config | n/a (constants) | `src/content/normalizeText.ts` `BLOCK_SEPARATOR` constant (L13) | role-match (constant-export convention) |
| `src/ingestion/IngestionClient.ts` (NEW) | client-service | request-response | `src/persistence/settingsStore.ts` (discriminated-result union) | role-match (failure-shape) |
| `src/ingestion/LibrarySource.ts` (NEW, Dexie-backed) | client-source-repository | CRUD | `src/content/repository.ts` `inMemoryRepository` (L14-21) + `src/persistence/highlightsStore.ts` (Dexie read/write) | **exact** (interface) + role-match (Dexie ops) |
| `src/ingestion/types.ts` (NEW) | schema | n/a | `src/content/schema.ts` (Zod + z.infer pattern) + `src/content/types.ts` (re-export) | **exact** |
| `src/ingestion/IngestControl.tsx` (NEW, mount-point per planner) | component | request-response | `src/routes/FixtureList.tsx` (loading/ready/error + `.status` live region) | **exact** |
| `wrangler.toml` (NEW) | config | n/a | *(none)* | **no-analog** |
| `src/content/schema.ts` (MODIFIED — additive) | schema | n/a | `src/content/schema.ts` itself: `ReaderSettingsSchema` `.default()` migration (L209-238) | **exact** (Pitfall 9 precedent) |
| `src/content/repository.ts` (MODIFIED — swap) | client-source-repository | CRUD | `src/content/repository.ts` itself (the `ArticleRepository` interface + module-level wrappers) | **exact** |
| `src/persistence/db.ts` (MODIFIED — append v3) | persistence | n/a | `src/persistence/db.ts` itself: `this.version(2).stores({...})` append (L102-106) | **exact** (Pitfall 9 precedent) |
| `src/routes/FixtureList.tsx` (MODIFIED — mount control) | route | request-response | `src/routes/FixtureList.tsx` itself | **exact** |
| `vite.config.ts` (MODIFIED — plugin or proxy) | config | n/a | `vite.config.ts` itself (currently minimal) | role-match (use RESEARCH.md §Local-Dev Mechanism) |
| `vitest.config.ts` (MODIFIED — add `server` project) | config-test | n/a | `vitest.config.ts` itself (L1-15) | **exact** |
| `playwright.config.ts` (MODIFIED — boot wrangler) | config-test | n/a | `playwright.config.ts` itself (`webServer` block L26-31) | **exact** |
| `package.json` (MODIFIED — new deps) | config | n/a | `package.json` itself (exact-pin convention) | **exact** |
| `tests/unit/server/mxss.spec.ts` (NEW) | test-unit | transform | `tests/unit/schema.test.ts` (boundary + `it.each` payload-driven) | **exact** |
| `tests/unit/server/extraction.spec.ts` (NEW) | test-unit | transform | `tests/unit/normalizeText.test.ts` (`parseArticle` helper + per-case) | role-match |
| `tests/unit/server/normalization.spec.ts` (NEW) | test-unit | transform | `tests/unit/selectors.test.ts` (deriveQuoteSelector usage) | **exact** (round-trip gate substrate) |
| `tests/unit/server/confidence.spec.ts` (NEW) | test-unit | transform | `tests/unit/schema.test.ts` (`it.each` classification) | role-match |
| `tests/unit/server/slugify.spec.ts` (NEW) | test-unit | transform | `tests/unit/schema.test.ts` (`it.each` normalization) | role-match |
| `tests/e2e/ingestion/ssrf-matrix.spec.ts` (NEW) | test-e2e | request-response | `tests/e2e/persistence.spec.ts` (e2e harness layout) | role-match (harness only) |
| `tests/e2e/ingestion/happy-path.spec.ts` (NEW) | test-e2e | request-response | `tests/e2e/persistence.spec.ts` (page.goto + getByRole + reload) | role-match |
| `tests/e2e/ingestion/dexie-migration.spec.ts` (NEW) | test-e2e | CRUD | `tests/e2e/persistence.spec.ts` (IndexedDB seed/wipe via `page.evaluate`) | **exact** (seed mechanism) |

## Pattern Assignments

### `functions/api/ingest.ts` (server-edge-function, request-response)

**Analog:** none in v1.0 — this is the first server runtime layer. Use RESEARCH.md §Pattern 1 (the 7-stage pipeline) + the locked adapter-boundary contract (all platform-agnostic code lives in `/server`; the function is a thin `onRequest(context)` delegator).

**Required shape (from RESEARCH.md L242-281):**
```typescript
// functions/api/ingest.ts — thin Cloudflare Pages Function adapter
// Delegates ALL logic to /server/ingest.ts (the platform-agnostic library).
// This file is the ONLY file that knows about Cloudflare — porting to Vercel/
// Netlify means changing ONLY this file (CONTEXT.md D7-05 adapter boundary).
export const onRequest: PagesFunction = async (context) => {
  const body = await context.request.json();
  const result = await ingest(body);           // imported from ../../server/ingest
  return result.ok
    ? Response.json({ article: result.article, confidence: result.confidence })
    : Response.json({ reason: result.reason }, { status: 400 });
};
```

**Notes for planner:**
- The `PagesFunction` type comes from `@cloudflare/workers-types` (add as a devDep alongside `wrangler`).
- `compatibility_flags: ["nodejs_compat"]` + a current `compat_date` live in `wrangler.toml` (RESEARCH.md State of the Art — `nodejs_compat_v2` is implied by compat date ≥ 2024-09-23).

---

### `server/ingest.ts` (server-pipeline-orchestrator, transform)

**Analog:** `scripts/normalize-source.ts` `main()` (L316-373) — the D-09 throwaway that reads source HTML, walks blocks, builds provenance, and emits an Article-shaped object. The production orchestrator promotes this to a stateless pure function.

**Imports pattern** (from `scripts/normalize-source.ts` L18-20):
```typescript
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
```
→ Production version drops `fs`/`writeFile` (no disk on Workers), keeps `createHash` from `node:crypto` for `originalHtmlHash`, and imports the stage modules from sibling files.

**Core orchestrator pattern** (mirrors `scripts/normalize-source.ts` L336-356 sequence: read HTML → walkBlocks → extractFootnotes → buildProvenance → assemble fixture object → `ArticleSchema.parse`):
```typescript
// scripts/normalize-source.ts L336-356 — the SEQUENCE the orchestrator copies
const sourceHtml = await readFile(sourcePath, "utf-8");
const { document } = parseHTML(sourceHtml);
const content = findContent(document);
const blocks = walkBlocks(content, maxBlocks);          // → server/htmlToBlocks
const footnotes = extractFootnoteBodies(document);      // → server/htmlToBlocks
let provenance = buildProvenance(document, sourceHtml, sourceUrlHint);  // → server/htmlToBlocks
const fixture = { id: slug, revision: 1, lang, provenance, blocks, footnotes };
```
→ Production orchestrator (RESEARCH.md L249-279): dispatch on `{url} | {html}` → `safeFetch` (URL path only) → `extractAndNormalize` → `slugifyUrl(finalUrl)` → `ArticleSchema.parse({...})` → `assertRoundTripAnchor(article)` (SC#1) → `deriveConfidence(article)` (ING-06).

**ArticleSchema boundary pattern** (the trust gate — used identically in `src/fixtures/index.ts` L23 and `scripts/normalize-source.ts` implicit):
```typescript
// src/fixtures/index.ts L21-28 — Zod-at-boundary applied to every external doc
export const fixtures: readonly CanonicalArticle[] = [
  essayLongForm, /* ... */
].map((raw) => ArticleSchema.parse(raw));   // ← throws at boundary if malformed
```
→ The orchestrator calls `ArticleSchema.parse(...)` on the assembled object; a parse failure = the article is refused entry.

---

### `server/htmlToBlocks.ts` (server-pipeline-stage, transform)

**Analog:** `scripts/normalize-source.ts` — the **named D-09 ancestor** (CONTEXT.md `<canonical_refs>` line 100; `<code_context>` "Reusable Assets" line 124). The production version replaces `linkedom`'s `parseHTML` with `jsdom` (primary, D7-10) and inserts the DOMPurify sanitize stage before the DOM walk.

**Imports to keep** (from `scripts/normalize-source.ts` L18-20):
```typescript
import { parseHTML } from "linkedom";   // → becomes JSDOM (or linkedom/worker fallback)
import { createHash } from "node:crypto"; // for originalHtmlHash
```
**Imports to add** (RESEARCH.md §Standard Stack):
```typescript
import DOMPurify from "isomorphic-dompurify";
import { Readability, isProbablyReaderable } from "@mozilla/readability";
```

**Block-extraction walker** (the production-grade promotion of `scripts/normalize-source.ts` `walkBlocks` L136-253 — copy this exact exhaustive-switch discipline; RESEARCH.md Example 2 confirms it):
```typescript
// scripts/normalize-source.ts L138-249 — the DOM → Block-kind mapping
function visit(el: Element) {
  const tag = el.tagName.toLowerCase();
  // ... skip chrome ...
  const level = headingLevel(tag);            // h1-h6 → HeadingBlock
  if (level !== null) { /* { kind: "heading", level, content: ... } */ return; }
  if (tag === "p") { /* ParagraphBlock */ return; }
  if (tag === "blockquote") { /* BlockquoteBlock (recursive children) */ return; }
  if (tag === "ul" || tag === "ol") { /* Bulleted/NumberedListBlock */ return; }
  if (tag === "figure") { /* FigureBlock (httpUrl src only) */ return; }
  if (tag === "pre") { /* CodeBlock */ return; }
  if (UNSUPPORTED_TAGS.has(tag)) {
    // → UnsupportedBlock { kind: "unsupported", originalKind: tag, plainDescription: ... }
    return;
  }
  // container elements (div, section, aside, main, article): recurse
}
```
→ **Pattern F (CONTEXT.md "Established Patterns" line 134):** exhaustive block-kind switch, no `default` — anything unmappable → `UnsupportedBlock` with a `plainDescription` (DOC-06 disclosure). The production version adds the 4 D-04 inline marks via `extractInline` (L39-73) verbatim.

**Inline-run + mark extraction** (copy `scripts/normalize-source.ts` `extractInline` L39-73 + `tidyRuns` L76-95 verbatim — they already implement the locked D-04 mark set: `link`/`code`/`strong`/`em` only, with the http/mailto scheme guard at L56).

**Provenance builder** (copy `scripts/normalize-source.ts` `buildProvenance` L280-306 — og:title / meta author / article:published_time / link rel=canonical / SHA-256 hash; this is the partial-Provenance shape the orchestrator merges).

**Footnote body extraction** (copy `extractFootnoteBodies` L256-271 — the `ol.references` selector strategy; emit `{ id: "fn-N", content: [...] }`).

**DOMPurify sanitize stage** (NEW — insert before the DOM walk; use RESEARCH.md §DOMPurify Strict Config L674-707 verbatim):
```typescript
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },                // NO svg, NO mathml (Pitfall 4)
  ALLOWED_TAGS: [/* p, h1-h6, ul, ol, li, blockquote, pre, code, a, strong, em,
                     img, figure, figcaption, br, hr, sup — exactly the 9 block kinds */],
  ALLOWED_ATTR: ["href", "title", "alt", "src", "cite"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input",
                "link", "meta", "base", "svg", "math"],
  ALLOW_DATA_ATTR: false,
};
// Then walk sanitized DOM → Block tree. clearWindow() after (isomorphic-dompurify README).
```

---

### `server/safeFetch.ts` (server-adapter-guard, request-response)

**Analog:** none in v1.0 (the SPA has no server fetcher). Use RESEARCH.md §SSRF Guard Implementation L396-451 verbatim — it is the locked 9-measure matrix mapped to code.

**Required imports** (RESEARCH.md L397-399):
```typescript
import dns from "node:dns";
import { Address4, Address6 } from "ip-address";
```

**Core pattern** (RESEARCH.md `safeFetch` L409-449 — scheme allowlist → metadata-hostname block → `dns.promises.resolve4/6` → `ip-address` deny-list → `fetch(url, { redirect: "manual", signal: AbortSignal.timeout(...) })` → per-hop redirect re-validation → content-length + content-type gate). The 9 measures are cataloged at L455-465.

**No-analog caveat:** the `cf.resolveOverride` DNS-pinning mechanism (measure 3) is **spike-gated** (RESEARCH.md Assumption A1). The Wave-1 spike determines whether true pinning is achievable or whether the validate-then-fetch fallback with documented TOCTOU residual is the shipped answer.

---

### `server/confidence.ts` (server-utility, transform)

**Analog:** none. Use RESEARCH.md §Confidence Thresholds L529-546 (the locked three-state contract + ship-from-research thresholds).

**Function signature** (from RESEARCH.md L274 + L529):
```typescript
export function deriveConfidence(article: CanonicalArticle): {
  state: "confident" | "low" | "unsupported";
  reason?: string;
};
```
**Locked formula** (RESEARCH.md L538-542): `isProbablyReaderable` false → `unsupported`; `blockCount >= 3 && textLength >= 500` → `confident`; else → `low`. The corpus-calibration step (analogous to v1.0's PAGE-08) may add `unsupportedBlockRatio` / `textToContentRatio` / `linkDensity` signals.

---

### `server/slugify.ts` (server-utility, transform)

**Analog:** partial — `scripts/normalize-source.ts` L294-297, 344-346 already extracts the canonical URL from `link[rel='canonical']` / `og:url`, and L331-333 enforces the `/^[a-z0-9-]+$/` slug regex (the same regex as `ArticleSchema.id`). Use RESEARCH.md §Slug Algorithm L494-519 verbatim for the production rules (IDN/punycode, default-port strip, tracking-param strip, hash fallback).

**Locked contract** (CONTEXT.md D7-07): `id = slugify(final canonical URL after redirects)`. Two distinct URLs that slugify identically → re-ingest refused ("already in your library").

---

### `server/limits.ts` (server-config, constants)

**Analog:** `src/content/normalizeText.ts` `BLOCK_SEPARATOR` (L13) — the constant-export convention.

```typescript
// src/content/normalizeText.ts L13 — constant-export precedent
export const BLOCK_SEPARATOR = "\n";
```
→ `server/limits.ts` exports `REQUEST_TIMEOUT_MS` (30_000), `MAX_RESPONSE_BYTES` (5 MB), `MAX_REDIRECTS` (5), `ALLOWED_CONTENT_TYPES` (`["text/html", "application/xhtml+xml"]`) — RESEARCH.md §Timeout / Size-Cap Exact Numbers L612-620.

---

### `src/ingestion/IngestionClient.ts` (client-service, request-response)

**Analog (failure-shape):** `src/persistence/settingsStore.ts` `SettingsLoadResult` (L41-43) — the discriminated-result-union pattern that never throws and routes a `reason` to a recovery surface. The IngestionClient applies the same discipline to fetch results.

**Discriminated-result precedent** (`src/persistence/settingsStore.ts` L41-43):
```typescript
export type SettingsLoadResult =
  | { ok: true; settings: ReaderSettings }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };
```
→ IngestionClient mirrors this: `{ ok: true; article } | { ok: false; reason: IngestionFailureReason }` (RESEARCH.md Example 1 L792-799 lists the 9 reasons: `ssrf-blocked-scheme` / `ssrf-blocked-private-ip` / `ssrf-blocked-metadata` / `fetch-failed` / `response-too-large` / `unsupported-content-type` / `extraction-too-low-confidence` / `round-trip-anchor-failed` / `server-error`).

**Re-validate on receipt** (`src/persistence/settingsStore.ts` L63 `safeParse` discipline — STATE-04 Zod-at-boundary on the READ path):
```typescript
// The client RE-PARSES the server's JSON through ArticleSchema (defense-in-depth;
// STATE-04 applies on Dexie read AND on network read).
const article = ArticleSchema.parse((await res.json()).article);
```

**Fetch shape** (RESEARCH.md Example 1 L808-821 — same-origin POST, CSP `connect-src 'self'`):
```typescript
const res = await fetch("/api/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
```

---

### `src/ingestion/LibrarySource.ts` (client-source-repository, CRUD)

**Analog (interface — EXACT):** `src/content/repository.ts` `inMemoryRepository` (L14-21) — the seam D7-02 swaps.

**The ArticleRepository interface to implement** (`src/content/repository.ts` L9-12):
```typescript
export interface ArticleRepository {
  list(): Promise<CanonicalArticle[]>;
  open(id: string): Promise<CanonicalArticle | null>;
}
```

**The current in-memory impl to mirror in shape** (`src/content/repository.ts` L14-21):
```typescript
export const inMemoryRepository: ArticleRepository = {
  async list() { return [...fixtures]; },
  async open(id) { return fixtures.find((a) => a.id === id) ?? null; },
};
```
→ `DexieLibrarySource` implements the SAME interface; `compositeLibraryRepository` (D7-02) UNIONs `inMemoryRepository.list()` (fixtures) with `DexieLibrarySource.list()` (ingested rows). The interface is unchanged; callers (`FixtureList`, `ArticleView`) are unchanged.

**Dexie read/write analog (for the new `save`/`remove`/`has` methods not on the read-only interface):** `src/persistence/highlightsStore.ts` L62-110 — the pattern for Zod `safeParse` on read, `db.<store>.put(...)` on write, and `db.transaction("rw", ...)` for cascading deletes.

```typescript
// src/persistence/highlightsStore.ts L62-85 — the read pattern to copy
export async function loadHighlights(articleId: string): Promise<HighlightsLoadResult> {
  try {
    const rows = await db.highlights.where("[articleId+revision]")
      .between([articleId, 0], [articleId, Number.MAX_SAFE_INTEGER]).toArray();
    const valid: HighlightRecord[] = [];
    for (const row of rows) {
      const parsed = HighlightRecordSchema.safeParse(row);    // ← Zod-at-boundary on read
      if (parsed.success) valid.push(parsed.data);
    }
    return { ok: true, highlights: valid };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };    // ← STATE-05 routing
  }
}

// src/persistence/highlightsStore.ts L94-96 — the write pattern (validated by construction)
export async function saveHighlight(h: HighlightRecord): Promise<void> {
  await db.highlights.put(h);
}

// src/persistence/highlightsStore.ts L105-109 — the cascade-delete pattern (D5-12)
export async function deleteHighlight(highlightId: string): Promise<void> {
  await db.transaction("rw", db.highlights, db.notes, async () => {
    await db.highlights.delete(highlightId);
    await db.notes.where("highlightId").equals(highlightId).delete();
  });
}
```
→ `DexieLibrarySource.save(article)` calls `db.articles.put(article)`; `.remove(id)` calls `db.articles.delete(id)` inside a transaction that cascade-deletes the article's highlights/notes/locations (save-once-read-forever refresh = delete + re-save; D-07). `.has(id)` is the dedupe-refuse check (D7-07).

---

### `src/ingestion/types.ts` (schema)

**Analog:** `src/content/schema.ts` (Zod + `z.infer` pattern) + `src/content/types.ts` (re-export).

**Zod + z.infer precedent** (`src/content/schema.ts` L199-200):
```typescript
export type CanonicalArticle = z.infer<typeof ArticleSchema>;
export type InlineRun = z.infer<typeof InlineRun>;
```
→ `src/ingestion/types.ts` exports `IngestionRequestSchema` / `IngestionResponseSchema` + inferred types. Alternatively these live in `src/content/schema.ts` if the planner prefers one schema module (CONTEXT.md `<code_context>` Integration Points names `src/content/schema.ts` as the home for `ArticleSource` + `IngestionMeta`).

---

### `src/ingestion/IngestControl.tsx` (component, request-response)

**Analog (EXACT):** `src/routes/FixtureList.tsx` (L1-70) — the loading/ready/error status pattern + `.status` live region + cancelled-flag `useEffect`. The minimal ingest control is the same shape, with a form + the IngestionClient call instead of the `listArticles()` call.

**Status + .status live region pattern** (`src/routes/FixtureList.tsx` L13-44):
```tsx
const [items, setItems] = useState<CanonicalArticle[]>([]);
const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

useEffect(() => {
  let cancelled = false;
  listArticles()
    .then((articles) => { if (cancelled) return; setItems(articles); setStatus("ready"); })
    .catch(() => { if (cancelled) return; setStatus("error"); });
  return () => { cancelled = true; };
}, []);

// JSX:
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  {status === "loading" && <p>Opening article…</p>}
  {status === "error" && (<>...</>)}
</div>
```
→ IngestControl replaces the `loading | ready | error` triple with the four-state `idle | submitting | success | error` and routes `IngestionFailureReason` → calm DOC-06 copy in the same `.status` region (D7-04 — zero new chrome). The "calm, booklike" voice (CONTEXT.md `<specifics>`) means: no red toasts, no modal wizard.

**Repo cross-reference:** the `.status` live region + PAGE-09 fallback banner are the existing honesty surfaces (D2-13/D3-04). The control announces refusal reasons (`ssrf-blocked-*`, `fetch-failed`, `unsupported-content-type`, `extraction-too-low-confidence`, `round-trip-anchor-failed`) AND the quiet low-confidence "may be incomplete" banner via these — never new vocabulary.

---

### `src/content/schema.ts` (MODIFIED — additive)

**Analog (Pitfall 9 additive precedent):** `src/content/schema.ts` itself — `ReaderSettingsSchema` `schemaVersion` union + `readingMode: z.enum([...]).default("paginated")` (L209-238). This is the documented pattern for an additive field that hydrates via `.default()` on read so existing rows parse unchanged.

**The exact precedent** (`src/content/schema.ts` L233-237, with the comment explaining the mechanism):
```typescript
// D4-12 — readingMode preference. .default("paginated") is the value-shape
// migration mechanism: a v1 row lacking this field parses with the default on
// read (Pitfall 9 — no data wipe, no migration script).
readingMode: z.enum(["paginated", "scrolling"]).default("paginated"),
```
→ Apply the SAME mechanism to:
1. `Provenance.sourceUrl` → `.optional()` (D7-08 — fixtures still supply it; paste-HTML articles omit it). The current `Provenance` (L174-182) has `sourceUrl: httpUrl` (required) — change to `sourceUrl: httpUrl.optional()`.
2. New `ArticleSourceSchema` + `IngestionMetaSchema` (RESEARCH.md L555-575 — proposed shape).
3. `ArticleSchema` gains `ingestionMeta: IngestionMetaSchema.optional()` (RESEARCH.md L586) — fixtures omit it; backward-compatible.

**URL scheme allow-list to reuse** (`src/content/schema.ts` L21-34 — `linkableUrl` / `httpUrl`):
```typescript
const httpUrl = z.string().url().refine((u) => /^https?:$/i.test(new URL(u).protocol), {...});
```
→ The `IngestionMeta.sourceUrl` field uses `httpUrl.optional()` directly (already defined; just reference it).

---

### `src/content/repository.ts` (MODIFIED — swap)

**Analog (EXACT — the file itself is the swap point):** `src/content/repository.ts` L1-25.

**The seam to preserve** (L9-12 interface + L24-25 module-level wrappers):
```typescript
export interface ArticleRepository {
  list(): Promise<CanonicalArticle[]>;
  open(id: string): Promise<CanonicalArticle | null>;
}

// Module-level convenience wrappers — single-import surface for routes.
export const listArticles = inMemoryRepository.list;
export const openArticle = inMemoryRepository.open;
```
→ D7-02 swap: replace `inMemoryRepository` with `compositeLibraryRepository` (which UNIONs fixtures + Dexie rows). The `listArticles` / `openArticle` wrappers stay — callers (`FixtureList` L9, `ArticleView` L23) are unchanged. This is the D-08 forward-compat hook landing in Phase 7.

---

### `src/persistence/db.ts` (MODIFIED — append v3)

**Analog (EXACT Pitfall 9 precedent):** `src/persistence/db.ts` `this.version(2).stores({...})` (L102-106) — the documented second-version-append pattern with the explanatory comment (L93-101).

**The exact precedent** (`src/persistence/db.ts` L93-106):
```typescript
// ── Phase 2 (STATE-04 anchor + Pitfall 9): the second version block is an APPEND ──
// The first version declaration above is byte-unchanged (Pitfall 9 — never
// edit a shipped version block; that breaks the upgrade chain for any
// client that already opened it). ...
this.version(2).stores({
  articles: "id, revision",
  settings: "key",
  location: "[articleId+revision]",
});
```
→ The v3 append (RESEARCH.md L592-604) follows the SAME shape: APPEND `this.version(3).stores({...})` with the articles store gaining `source, addedAt` indexes (`articles: "id, revision, source, addedAt"`). v1 (L81-92) and v2 (L102-106) blocks stay byte-unchanged. NO `.upgrade()` callback (additive indexes only).

**Table-property declaration precedent** (L66-77 — the `articles!: Table<...>` definite-assignment pattern):
```typescript
articles!: Table<{ id: string; revision: number }, string>;
```
→ The v3 change widens this type to include the ingested-article row shape (`source`, `addedAt`, plus the full `CanonicalArticle` body + `IngestionMeta`). The widening mirrors the documented Phase 5 transition at L69-77 (definite-assignment annotation, runtime-unaffected, NO version bump beyond v3).

---

### `src/routes/FixtureList.tsx` (MODIFIED — mount control)

**Analog:** the file itself. Mount `<IngestControl />` (or inline the form) at the top of the `<main>` (L34), above the `<ul className="fixture-list">` (L54). The control reuses the existing `.status` region (L36-44) for refusal messages. **Transitional** — Phase 8 replaces this route with the library view.

---

### `vite.config.ts` (MODIFIED)

**Analog:** the file itself (currently 7 lines, minimal). Two options from RESEARCH.md §Local-Dev Mechanism L622-668 (spike-resolved):
- **Option A (preferred):** add `cloudflare()` from `@cloudflare/vite-plugin` to `plugins` (RESEARCH.md L630-639).
- **Option B (fallback):** add `server.proxy: { "/api": "http://localhost:8788" }` (RESEARCH.md L648-661) — keeps the SPA dev server byte-unchanged.

The Wave-1 spike (alongside the jsdom-on-Workers spike) picks one.

---

### `vitest.config.ts` (MODIFIED — add `server` project)

**Analog (EXACT):** the file itself (L1-15). The current config is single-project; RESEARCH.md L996 calls for "a `server` project that imports `/server` code with the jsdom env."

**Current config** (`vitest.config.ts` L1-15):
```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/component/**/*.test.tsx"],
    exclude: ["tests/e2e", "node_modules"],
  },
});
```
→ Planner adds a `projects: [...]` array (Vitest 4 workspaces) with one entry for the existing `tests/unit` + `tests/component` and a new entry for `tests/unit/server` (same jsdom env, same `setup.ts`). The `/server` code imports `node:dns` / `node:crypto` — Vitest's Node runtime handles these natively (no platform shim needed for the pure-Node unit tests; only the SSRF integration test needs `wrangler pages dev`).

---

### `playwright.config.ts` (MODIFIED — boot wrangler)

**Analog (EXACT):** the file itself — the `webServer` block (L26-31).

**Current webServer** (`playwright.config.ts` L26-31):
```typescript
webServer: {
  command: "npm run dev",
  url: "http://localhost:5173",
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
},
```
→ For the ingestion e2e project, the planner adds a second `webServer` entry (Playwright supports an array) OR a project-scoped `webServer` that boots `wrangler pages dev` alongside `vite dev` (RESEARCH.md L997). The SSRF integration test (`tests/e2e/ingestion/ssrf-matrix.spec.ts`) targets the wrangler port; the reader-flow tests target 5173 as before.

---

### `package.json` (MODIFIED — new deps)

**Analog:** the file itself. Lock-step exact-pin convention (every existing dep is pinned to an exact version, no `^`).

**New server deps** (RESEARCH.md §Standard Stack L131-133 + installation block):
```bash
npm install @mozilla/readability@0.6.0 isomorphic-dompurify@3.22.0 jsdom@30.0.1 ip-address@10.5.0
```
**New devDeps** (RESEARCH.md L136):
```bash
npm install -D wrangler@4.120.1 @cloudflare/vite-plugin@1.51.2
```
Plus `@cloudflare/workers-types` for the `PagesFunction` type in `functions/api/ingest.ts`. None of these enter the client bundle — the planner MUST verify the Vite build keeps them out of `/dist` (server-only imports gated behind `/server` + `/functions`).

---

### `tests/unit/server/mxss.spec.ts` (test-unit, transform)

**Analog (EXACT):** `tests/unit/schema.test.ts` — boundary validation with table-driven `it.each` over payloads.

**Pattern to copy** (`tests/unit/schema.test.ts` L97-114 — Pitfall 5 scheme-rejection table):
```typescript
import { describe, expect, it } from "vitest";
import { ArticleSchema, LinkMark, Mark } from "../../src/content/schema";

describe("LinkMark href scheme allow-list (Pitfall 5)", () => {
  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
    ["vbscript:", "vbscript:msgbox(1)"],
  ])("rejects %s scheme href", (_label, href) => {
    expect(() => LinkMark.parse({ type: "link", href })).toThrow();
  });
});
```
→ The mxss spec feeds DOMPurify Attack Classes payloads (CITED: DOMPurify wiki) through the full pipeline (`htmlToBlocks` on sanitized DOM) and asserts the resulting Block tree contains zero `<script>` / inline `on*` / `javascript:` / SVG / MathML (RESEARCH.md §Gate 2 L964-970). Plus a repo-wide `dangerouslySetInnerHTML` grep gate (confirmed: the eslint `react/no-danger: "error"` rule already covers `/server` and `/functions` because the flat-config `files: ["**/*.{ts,tsx,js,jsx}"]` has no ignore for those dirs — see `eslint.config.js` L29-32, L57).

---

### `tests/unit/server/extraction.spec.ts` (test-unit, transform)

**Analog:** `tests/unit/normalizeText.test.ts` — the `parseArticle` helper + per-case article fixtures.

**Helper to copy** (`tests/unit/normalizeText.test.ts` L16-30):
```typescript
function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}
const baseArticle = {
  id: "norm-test", revision: 1, lang: "en",
  provenance: { sourceUrl: "https://example.com/norm", title: "Norm Test",
                retrievedAt: "2026-01-01T00:00:00Z", originalHtmlHash: "sha256:deadbeef" },
};
```
→ The extraction spec feeds real-publisher HTML (the D-01 corpus + new articles) through `htmlToBlocks` and asserts the output Block tree matches expectations (block kinds present, unsupported ratio bounded).

---

### `tests/unit/server/normalization.spec.ts` (test-unit, transform)

**Analog (EXACT — round-trip substrate):** `tests/unit/selectors.test.ts` — the `deriveQuoteSelector` usage that the SC#1 gate reuses.

**The exact gate machinery to exercise** (`tests/unit/selectors.test.ts` L49-63):
```typescript
describe("deriveQuoteSelector exact round-trips through grapheme array", () => {
  it("exact equals graphemeClusters(normalizeText).slice(start,end).join('')", () => {
    const article = caféArticle();
    const position = { start: 2, end: 9 };
    const clusters = graphemeClusters(normalizeText(article), article.lang);
    const expected = clusters.slice(2, 9).join("");
    expect(deriveQuoteSelector(article, position).exact).toBe(expected);
  });
});
```
→ The normalization spec asserts `assertRoundTripAnchor(article)` (RESEARCH.md §Pattern 4 L326-344) passes N-offset `deriveQuoteSelector` → `resolveQuoteSelector` → `"confident"` on representative fixtures + extracted samples. An ingested article that returns `"ambiguous"` or `"orphan"` is REFUSED (`round-trip-anchor-failed`).

**Signatures to reuse (from `src/content/normalizeText.ts`):**
- `normalizeText(article): string` (L85)
- `graphemeClusters(text, locale): string[]` (L103)
- `graphemeLength(article): number` (L109)
- `deriveQuoteSelector(article, position, contextRadius=32): TextQuoteSelector` (L133)
- `resolveQuoteSelector(article, selector, positionHint?): TextPositionSelector | "ambiguous" | "orphan"` (L174)

---

### `tests/unit/server/confidence.spec.ts` (test-unit, transform)

**Analog:** `tests/unit/schema.test.ts` `it.each` classification pattern. Table-driven: feed articles with known `blockCount` / `textLength` / `unsupportedBlockRatio` → assert the three-state classification.

---

### `tests/unit/server/slugify.spec.ts` (test-unit, transform)

**Analog:** `tests/unit/schema.test.ts` L46-58 — the `it.each` rejection table pattern, applied to URL-normalization cases (IDN/punycode, trailing slash, tracking params, hash fallback per RESEARCH.md §Slug Algorithm L520-527).

---

### `tests/e2e/ingestion/ssrf-matrix.spec.ts` (test-e2e, request-response)

**Analog (harness layout):** `tests/e2e/persistence.spec.ts` — the e2e harness structure (imports, `test.describe`, `beforeEach`, helper functions). The SSRF matrix is new content but the Playwright scaffold is reused.

**Imports + structure to copy** (`tests/e2e/persistence.spec.ts` L18-26):
```typescript
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

test.beforeEach(async ({ page }) => {
  // ... stub routes, wipe state ...
});

test.describe("STATE-02 + Pitfall 4 persistence", () => {
  test("..."), async ({ page }) => { /* ... */ };
});
```
→ The SSRF spec targets the wrangler port (per `playwright.config.ts` modification) and asserts every Pitfall 3 measure refuses the request with NO upstream body (RESEARCH.md §Gate 1 L953-962). This is the **only honest way** to test fetch+DNS+redirect behavior (D7-06).

---

### `tests/e2e/ingestion/happy-path.spec.ts` (test-e2e, request-response)

**Analog:** `tests/e2e/persistence.spec.ts` L113-144 — `page.goto` + `getByRole` + reload + assertion flow. The happy-path spec (SC#1) submits a real publisher URL via IngestControl, waits for the article to land in Dexie, opens it via the existing `#/article/:id` route, and asserts it paginates/annotates identically to a fixture.

---

### `tests/e2e/ingestion/dexie-migration.spec.ts` (test-e2e, CRUD)

**Analog (EXACT — the IndexedDB seed/wipe mechanism):** `tests/e2e/persistence.spec.ts` `seedScrollingMode` (L71-110) + `beforeEach` wipe (L35-42). This is the documented pattern for directly manipulating the IndexedDB behind Dexie from a Playwright test.

**The exact seed mechanism to copy** (`tests/e2e/persistence.spec.ts` L71-110):
```typescript
async function seedScrollingMode(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains("settings")) { resolve(); return; }
          const tx = db.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          store.put({ key: "reader-prefs", value: { /* ... */ } });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch { resolve(); }
      };
      req.onerror = () => resolve();
    });
  });
}
```
→ The migration spec (SC#5) seeds a v1/v2 Dexie snapshot (settings + location + highlights + notes — representative rows), triggers the v3 upgrade by opening the app (which constructs the new `version(3)` declaration), and asserts EVERY v1.0 row is intact and addressable. The `beforeEach` wipe pattern (`indexedDB.deleteDatabase("lem-reader")` at L36-42) ensures deterministic first-run state.

---

## Shared Patterns

### Zod-at-boundary validation (STATE-04)
**Source:** `src/content/schema.ts` (the trust boundary) + `src/persistence/settingsStore.ts` L63 (`safeParse` on read) + `src/fixtures/index.ts` L23 (`ArticleSchema.parse` at module load)
**Apply to:** `server/ingest.ts` (post-extract), `src/ingestion/IngestionClient.ts` (post-fetch re-validate), `src/ingestion/LibrarySource.ts` (on Dexie read)
```typescript
// Every external doc — fixture JSON, ingested HTML, network response, Dexie row —
// passes through ArticleSchema.parse() / .safeParse() at the boundary.
const parsed = ArticleSchema.safeParse(raw);
if (!parsed.success) return { ok: false, reason: "corrupt" };  // never silently coerce
```

### Discriminated-result union (never throw across the seam)
**Source:** `src/persistence/settingsStore.ts` `SettingsLoadResult` (L41-43) + `src/persistence/highlightsStore.ts` `HighlightsLoadResult` (L48-50)
**Apply to:** `src/ingestion/IngestionClient.ts` (`IngestionResult`), `src/ingestion/LibrarySource.ts` (write/remove results)
```typescript
export type FooResult =
  | { ok: true; /* payload */ }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" | /* ingestion reasons */ };
```

### The `.status` live region (calm honesty — DOC-06 / D7-04)
**Source:** `src/routes/FixtureList.tsx` L36-44 (`role="status"` + `aria-live="polite"` + `aria-atomic="true"`)
**Apply to:** `src/ingestion/IngestControl.tsx` — refusal reasons + low-confidence "may be incomplete" banner announce here. Zero new disclosure vocabulary (D7-04).
```tsx
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  {status === "loading" && <p>Opening article…</p>}
  {status === "error" && (<>...</>)}
</div>
```

### Dexie version discipline (Pitfall 9 — append only)
**Source:** `src/persistence/db.ts` L93-106 (the v2-append comment + block) + L66-77 (table-property definite-assignment)
**Apply to:** the v3 append in `src/persistence/db.ts` (additive `source, addedAt` indexes on `articles`; v1/v2 byte-unchanged; NO `.upgrade()`)

### Round-trip anchor gate (SC#1 — the integration truth)
**Source:** `src/content/normalizeText.ts` `deriveQuoteSelector` (L133) + `resolveQuoteSelector` (L174) tri-state
**Apply to:** `server/ingest.ts` `assertRoundTripAnchor(article)` — runs AFTER `ArticleSchema.parse`, BEFORE returning the article. Refuses entry on `"ambiguous"` / `"orphan"`.
```typescript
const selector = deriveQuoteSelector(article, { start, end });
const resolved = resolveQuoteSelector(article, selector, { start, end });
if (resolved !== "confident" && typeof resolved !== "object") {
  throw new IngestionError("round-trip-anchor-failed");
}
```

### Exhaustive block-kind switch, no default (Pattern F)
**Source:** `scripts/normalize-source.ts` `walkBlocks` (L136-253) + `src/content/normalizeText.ts` `blockText` (L41-63)
**Apply to:** `server/htmlToBlocks.ts` `mapNodeToBlock` — map DOM tags onto the 9 block kinds; anything unmappable → `UnsupportedBlock { kind: "unsupported", originalKind, plainDescription }` (DOC-06 disclosure)

### Reverse tabnabbing guard
**Source:** `src/routes/ArticleView.tsx` (header comment L4-7 — `rel="noopener noreferrer"` on provenance links) + `eslint.config.js` L59 (`react/jsx-no-target-blank: "error"`)
**Apply to:** `server/htmlToBlocks.ts` — DOMPurify `afterSanifyAttributes` hook adds `rel="noopener noreferrer"` to every surviving `<a target="_blank">` (RESEARCH.md §Security Domain threat table L1031)

### Exact-pin dependency versioning
**Source:** `package.json` (every existing dep is exact-pinned, no `^`)
**Apply to:** the 5 new server deps + 2 new devDeps — pin `@mozilla/readability@0.6.0`, `isomorphic-dompurify@3.22.0`, `jsdom@30.0.1`, `ip-address@10.5.0`, `wrangler@4.120.1`, `@cloudflare/vite-plugin@1.51.2`, `@cloudflare/workers-types@<latest>`

### Test setup: jsdom polyfills + table-driven `it.each`
**Source:** `tests/setup.ts` (jsdom polyfill convention) + `tests/unit/schema.test.ts` (`it.each` payload-driven boundary tests)
**Apply to:** all 5 `tests/unit/server/*.spec.ts` files — same `vitest` runner, same jsdom env, same `it.each` discipline

### E2E: real IndexedDB via direct `page.evaluate` manipulation
**Source:** `tests/e2e/persistence.spec.ts` `seedScrollingMode` (L71-110) + `beforeEach` wipe (L35-42)
**Apply to:** `tests/e2e/ingestion/dexie-migration.spec.ts` (SC#5) — seed v1/v2 rows, trigger v3 upgrade via app open, assert every row intact. No Dexie mocking.

## No Analog Found

Files with no close match in the v1.0 codebase (the planner uses RESEARCH.md patterns instead — these are the **first server-runtime code** in the repo, by design):

| File | Role | Data Flow | Reason | Fallback Authority |
|------|------|-----------|--------|--------------------|
| `functions/api/ingest.ts` | server-edge-function | request-response | v1.0 is a client-only SPA — no server runtime exists | RESEARCH.md §Pattern 1 (L242-281) + Cloudflare Pages Functions docs |
| `server/safeFetch.ts` | server-adapter-guard | request-response | No fetch-with-SSRF-guard code in v1.0 | RESEARCH.md §SSRF Guard Implementation (L396-465) |
| `server/confidence.ts` | server-utility | transform | No confidence-scoring code in v1.0 | RESEARCH.md §Confidence Thresholds (L529-546) |
| `wrangler.toml` | config | n/a | No Cloudflare config in v1.0 | RESEARCH.md §State of the Art (L862-873) + Cloudflare Workers docs |

**Note:** `server/slugify.ts`, `server/limits.ts`, and `src/ingestion/IngestionClient.ts` have no exact analog but have clear partial-match precedents (the slug regex + URL extraction in `scripts/normalize-source.ts`; the constant-export convention in `normalizeText.ts`; the discriminated-result union in `settingsStore.ts`). These are listed in the File Classification table as role-matches, not in this No-Analog section.

## Metadata

**Analog search scope:**
- `src/content/` (schema.ts, repository.ts, normalizeText.ts, types.ts)
- `src/persistence/` (db.ts, settingsStore.ts, highlightsStore.ts, notesStore.ts, locationStore.ts, errors.ts)
- `src/fixtures/` (index.ts)
- `src/routes/` (FixtureList.tsx, ArticleView.tsx)
- `scripts/normalize-source.ts` (the D-09 throwaway — the named ancestor of `server/htmlToBlocks.ts`)
- `tests/unit/` (schema.test.ts, normalizeText.test.ts, selectors.test.ts, storageFallback.test.ts)
- `tests/e2e/` (persistence.spec.ts)
- Config: `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `package.json`

**Files scanned:** 18 source/config/test files + 3 directory listings
**Key finding answering RESEARCH.md Open Question #2:** the `eslint.config.js` flat-config `files: ["**/*.{ts,tsx,js,jsx}"]` (L35) with `ignores: ["dist", "node_modules", "playwright-report"]` (L31) already covers `/server` and `/functions`. The `react/no-danger: "error"` rule (L57) fires repo-wide — the structural XSS defense (ING-07) is already enforced on the new server directories without any config change. The repo-wide `dangerouslySetInnerHTML` grep gate (RESEARCH.md §Gate 2 L970) is belt-and-suspenders; it will return zero matches today and the CI step guards against future regressions.
**Pattern extraction date:** 2026-08-10
