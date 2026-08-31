# Phase 20: Safe Local Image Fidelity - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 24 (9 new, 14 modified/regenerated, 1 no-mod — CSS route; revision R2 reclassification per checker note)
**Analogs found:** 24 / 24 (every file has an in-repo precedent — RESEARCH's "composition, not invention" verdict confirmed)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/fetchImageAsset.ts` (NEW) | service | request-response (bytes) | `server/safeFetch.ts` | exact |
| `server/assetStage.ts` (NEW) | service | batch/transform | `server/ingest.ts` staged orchestrator | exact |
| `server/safeFetch.ts` (MOD) | service | request-response | self — parameterization refactor | exact |
| `server/limits.ts` (MOD) | config | — | self — Phase 11/12 cap-append pattern | exact |
| `server/ingest.ts` (MOD) | controller/orchestrator | pipeline | self — Stage-1 branch pattern | exact |
| `server/htmlToBlocks.ts` (MOD) | service/transform | transform | self — `figureBlock` L199-232 | exact |
| `server/markdownToBlocks.ts` (MOD) | service/transform | transform | self — `figureFromImage` L288-302 | exact |
| `server/epubToBooks.ts` (MOD) | service | file-I/O (archive) | self — `unzipEpub` entries map + `downgradeFigures` | exact |
| `src/content/schema.ts` (MOD) | model | — | self — `ArticleSourceSchema`/`books` additive precedents | exact |
| `src/ingestion/types.ts` (MOD) | model/config | — | self — `PDF_MAX_BYTES` three-point pattern | exact |
| `src/content/render/BlockRenderer.tsx` (MOD) | component | — | self — figure case L229-248 | exact |
| `src/content/assets/AssetProvider.tsx` (NEW) | provider/hook | — | `src/reader/annotations/HighlightOverlay.tsx` | role-match |
| `src/persistence/db.ts` (MOD) | config (schema) | — | self — v5 append block L199-206 | exact |
| `src/persistence/assetsStore.ts` (NEW) | store | CRUD | `src/persistence/booksStore.ts` + `highlightsStore.ts` | exact |
| `src/ingestion/LibrarySource.ts` (MOD) | store/service | CRUD | self — `remove` cascade L108-151 | exact |
| `src/persistence/booksStore.ts` (MOD) | store | CRUD | self — `saveBook`/`removeBook` transactions | exact |
| `src/portability/bundle.ts` (MOD) | model | — | self — `books: optional()` v2 widening L62-64 | exact |
| `src/portability/manifest.ts` (MOD) | utility | transform | self — `computeManifest` L44-57 | exact |
| `src/portability/ExportImportService.ts` (MOD) | service | batch | self — `validateBundle`/`applyImport` | exact |
| `src/portability/conflicts.ts` (+ `ImportPreviewDialog.tsx`) (MOD) | service | — | self — D9-14 `ConflictKind` table | exact |
| `src/fixtures/figure-assets.ts` (NEW) | fixture/registry | — | `src/fixtures/index.ts` | exact |
| `src/fixtures/articles/figure-heavy.canonical.json` (REGEN) | fixture | — | self — current wikimedia-src shape | exact |
| `tests/unit/server/fetchImageAsset.spec.ts` + `assetStage.spec.ts` (NEW) | test | — | `tests/unit/server/safe-fetch.spec.ts` | role-match |
| `tests/unit/persistence/assets-cascade.spec.ts` (NEW) | test | — | `tests/unit/persistence/books-store.test.ts` | role-match |
| `tests/unit/portability/bundle-v4.spec.ts` (NEW) | test | — | `tests/unit/portability/bundle-schema.test.ts` + `validate-bundle.test.ts` | role-match |
| `tests/e2e/imagery/{offline-reopen,geometry,decode-matrix,refusal-matrix}.spec.ts` (NEW) | test (e2e) | — | `tests/e2e/font-failure.spec.ts` route-intercept pattern | role-match |
| `src/measurement/domMeasurer.ts` (+ `engine.ts`) (NO-MOD — no modification needed; CSS route) | utility | — | self — `kindForElement` figure case L70-71 | exact |

## Pattern Assignments

### `server/fetchImageAsset.ts` (NEW — service, request-response bytes)

**Analog:** `server/safeFetch.ts` (the module this seam wraps; per RESEARCH Pattern 1 the 9-measure core is parameterized, not forked)

**Imports pattern** (`server/safeFetch.ts` L23-33):
```typescript
import dns from "node:dns";
import { Address4, Address6 } from "ip-address";
import { IngestionError } from "./errors";
import {
  REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  MAX_REDIRECTS,
  ALLOWED_CONTENT_TYPES,
  PRIVATE_RANGES,
  METADATA_HOSTNAMES,
} from "./limits";
```
New module adds: `import { imageSize } from "image-size"; import isAnimated from "is-animated";` — **server-only imports; nothing in `src/` ever sniffs** (RESEARCH: browser never sniffing = engine-independent detection).

**Core pipeline to parameterize** (`server/safeFetch.ts` L110-166 — scheme → metadata → DNS → IP deny-list → pinning/timeout/manual-redirect):
```typescript
export async function safeFetch(rawUrl: string, hopDepth = 0): Promise<FetchedContent> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new IngestionError("fetch-failed", "invalid-url"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new IngestionError("ssrf-blocked-scheme");
  }
  if (METADATA_HOSTNAMES.includes(parsed.hostname as (typeof METADATA_HOSTNAMES)[number])) {
    throw new IngestionError("ssrf-blocked-metadata");
  }
  const [v4, v6] = await Promise.all([
    dns.promises.resolve4(parsed.hostname).catch(() => [] as string[]),
    dns.promises.resolve6(parsed.hostname).catch(() => [] as string[]),
  ]);
  const allIps = [...v4, ...v6];
  if (allIps.length === 0) { throw new IngestionError("fetch-failed", "dns-unresolved"); }
  for (const ip of allIps) {
    if (isPrivateIp(ip)) { throw new IngestionError("ssrf-blocked-private-ip"); }
  }
  const pinnedIp = v4[0] ?? v6[0];
  const fetchOptions: RequestInit & { cf?: { resolveOverride: string } } = {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "User-Agent": "LemReader/2.0 (+https://lem-reader.app)" },
  };
  if (pinnedIp) { fetchOptions.cf = { resolveOverride: pinnedIp }; }
```

**Per-hop redirect re-validation + size/content-type gates** (L171-196 — the profile seam point):
```typescript
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    if (hopDepth >= MAX_REDIRECTS) { throw new IngestionError("fetch-failed", "redirect-loop"); }
    const location = res.headers.get("location");
    if (!location) { throw new IngestionError("fetch-failed", "redirect-without-location"); }
    const absoluteLocation = new URL(location, res.url).toString();
    return safeFetch(absoluteLocation, hopDepth + 1);
  }
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) { throw new IngestionError("response-too-large"); }
  const contentType = res.headers.get("content-type") ?? "";
  if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    throw new IngestionError("unsupported-content-type");
  }
```
**Key rules:** `{allowedContentTypes, timeoutMs, maxBytes}` becomes the profile parameter; document profile must stay **byte-identical** (Pitfall 4 — refactor is its own commit, ssrf-matrix.spec.ts is the pin). Image profile reads `arrayBuffer()` instead of `text()`; **post-read `bytes.byteLength` re-check** (12-04 header-lie discipline — content-length can lie/absent/chunked). Refusals return **typed values, never throws** (per-figure calm refusal D20-05); the sniffed type is AUTHORITATIVE over the header (SVG-as-png smuggling closes only via sniff — D20-10). EXIF orientation ≥ 5 swaps stored w/h (Pitfall 2).

**SHA-256 id precedent** (`server/ingest.ts` L140-142 — the `img-<12hex>` assetId basis; also `server/safeFetch.ts` L92-99 Web Crypto variant):
```typescript
function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}
```

---

### `server/assetStage.ts` (NEW — service, per-article collect/budget/rewrite)

**Analog:** `server/ingest.ts` staged orchestrator + `server/epubToBooks.ts` block-rewrite recursion

**Staged-orchestration shape** (`server/ingest.ts` L438, L493-502 — the asset stage joins post-extract, pre-stamp):
```typescript
export async function ingest(input: IngestionRequest): Promise<IngestionResponse> {
  // ...
  try {
    if (hasEpub) {
      return await ingestEpubBook(request as { epub: string; filename?: string });
    }
    // Stage 1: SOURCE → EXTRACT → NORMALIZE ... Stage 6a BUILD, 6b VALIDATE
    // (ArticleSchema.parse), Stage 7 anchor gate, confidence, stamp
```
The stage sits in the locked sequence where a new branch/stage composes without disturbing existing stages (the `ingestEpubBook` "placed first so single-article stages stay byte-stable" precedent, L494-502).

**Per-item tolerance/honesty loop** (`server/ingest.ts` L306-379 — per-chapter try/catch skip accounting is the exact per-figure refusal shape):
```typescript
  for (const draft of chapters) {
    const i = admitted.length;
    const id = `${bookBase}-c${String(i).padStart(2, "0")}`;
    try {
      // ... stages ...
    } catch {
      // A chapter failing parse / the anchor gate / any stage is SKIPPED
      // and disclosed — never a whole-book failure (D12-11).
      skipped += 1;
    }
  }
```
One bad image never blocks the article (D20-05); disclosure rides `ingestionMeta.extractionWarnings` (additive array, `src/content/schema.ts` L237: `extractionWarnings: z.array(z.string()).default([])` — RESEARCH OQ4 recommendation, zero schema change).

**Recursive block rewrite** (`server/epubToBooks.ts` L692-713 — `downgradeFigures` recursion is the map/rewrite skeleton the src-rewrite stage reuses; this function is DELETED in the EPUB path but its recursion shape is the template):
```typescript
function downgradeFigures(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.kind === "figure") { /* rewrite here */ }
    if (b.kind === "blockquote") { return { ...b, children: downgradeFigures(b.children) }; }
    if (b.kind === "bulleted-list") { return { ...b, items: b.items.map((i) => ({ content: downgradeFigures(i.content) })) }; }
    if (b.kind === "numbered-list") { return { ...b, items: b.items.map((i) => ({ content: downgradeFigures(i.content) })) }; }
    return b;
  });
}
```
**Byte-identity mandate:** the rewrite touches ONLY `src`/`originalSrc`/`width`/`height` — `alt` + `caption` NEVER (see Shared Patterns §D-05 substrate).

---

### `server/htmlToBlocks.ts` (MOD — figureSrcResolver hook)

**Analog:** self — `figureBlock` (L199-232)

```typescript
function figureBlock(el: Element): Block[] {
  const tag = el.tagName.toLowerCase();
  const img = tag === "img" ? el : el.querySelector("img");
  const figcaption = tag === "figure" ? el.querySelector("figcaption") : null;
  if (!img) { return [{ kind: "unsupported", ... }]; }
  const alt = img.getAttribute("alt") ?? "";
  const rawSrc = img.getAttribute("src") ?? "";
  let src = rawSrc;
  try {
    const idl = (img as HTMLImageElement).src;
    if (idl) src = idl;
  } catch { /* keep rawSrc */ }
  if (/^https?:/i.test(src)) {
    const caption = figcaption ? tidyRuns(extractInline(figcaption, [])) : [];
    return [{ kind: "figure", alt: alt || "", src, caption }];
  }
  return [{ kind: "unsupported", originalKind: "figure",
    plainDescription: "An image whose source could not be normalized to a valid URL." }];
}
```
**Change shape (RESEARCH Pattern 5, option (a) — recommended):** add a small optional `figureSrcResolver` parameter through `htmlToBlocks`; EPUB path passes a container-marker resolver, url/paste path passes **nothing and stays byte-stable**. Non-http srcs that the resolver claims become refused FigureBlocks (D20-06) instead of UnsupportedBlocks — one placeholder surface everywhere.

### `server/markdownToBlocks.ts` (MOD — refused FigureBlocks)

**Analog:** self — `figureFromImage` (L288-302) + standalone-image promotion (L213-222)

```typescript
function figureFromImage(node: MdastNode): Block[] {
  const src = node.url ?? "";
  if (/^https?:/i.test(src)) {
    const alt = node.alt ?? "";
    return [{ kind: "figure", alt, src, caption: [] }];
  }
  return [{ kind: "unsupported", originalKind: "image",
    plainDescription: "An image whose source could not be normalized to a valid URL." }];
}
```
**Change:** RESEARCH OQ2 recommendation — non-http srcs become **refused FigureBlocks** (alt preserved, `src` absent) rather than UnsupportedBlocks, matching D20-06's "no new block kinds / stays a FigureBlock". Planner confirms.

### `server/epubToBooks.ts` (MOD — D12-16 retirement → container extraction)

**Analog:** self — archive entries map + path resolution

**Already-open fflate entries map** (`server/epubToBooks.ts` L313-347 — extraction reads these bytes, zero network):
```typescript
function unzipEpub(bytes: Uint8Array): Record<string, Uint8Array> {
  const overCap: string[] = [];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        if (f.originalSize > EPUB_MAX_ENTRY_BYTES) { overCap.push(f.name); return false; }
        return true;
      },
    });
  } catch { throw new IngestionError("epub-unreadable", "..."); }
  // ... isSafeEntryName on EVERY key before any byte is used ...
  return entries;
}
```
Chapter-relative → OPF-dir-relative resolution uses `dirOf` (L219; precedent usage at L472 `const opfDir = dirOf(opfPath)`, L614, L664 for nav/NCX). `walkChapterDocument` (L734-749) currently calls `downgradeFigures(walked.blocks)` at L745 — **that call site becomes container extraction**: resolve figure srcs against entries, run the SAME sniff caps minus fetch (byte/pixel/type/animation), emit assets alongside chapter drafts, carry them through `ingestEpubBook`'s envelope (L281-414).

### `src/content/schema.ts` (MOD — FigureBlock additive evolution)

**Analog:** self — the additive-widening precedents

**Current FigureBlock** (L100-105):
```typescript
export const FigureBlock = z.object({
  kind: z.literal("figure"),
  alt: z.string(), // required for accessibility
  src: httpUrl, // local /public or remote https — no data: URIs (Pitfall 5)
  caption: z.array(InlineRun).default([]),
});
```

**Union/optional widening precedents to copy** — `ArticleSourceSchema` enum widened per phase (L210-218, each member carrying its phase comment) and `bundle.ts` `books: z.array(BookSchema).optional()` (L62-64). New shape per RESEARCH Pattern 2:
```typescript
const assetRef = z.string().regex(/^asset:img-[a-z0-9]{12}$/);  // parse-time guarantee
// src: z.union([httpUrl, assetRef]).optional()  — legacy rows hydrate; refused omit src
// originalSrc: httpUrl.optional(); width/height: z.number().int().min(1).optional()
```
A regex-locked asset arm cannot smuggle `javascript:`/`data:` (Pitfall 5 discipline survives at parse time). NO Dexie bump for the block itself — non-indexed fields need no version block (the `readerTitle` bumpless precedent, `db.ts` L83-93).

### `src/ingestion/types.ts` (MOD — envelope + shared caps)

**Analog:** self — `PDF_MAX_BYTES` three-enforcement-point pattern (L52-76):
```typescript
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
// shared by THREE enforcement points: client file picker, middleware
// content-length guard, orchestrator re-check after base64 decode
```
Image cap constants live HERE (same `/src→/server` import-direction rule; `server/limits.ts` re-exports). Envelope widening copies `IngestionResponseSchema`'s discriminated-union shape (L129-155) — `assets: z.array(AssetEnvelopeSchema).default([])` joins the ok-variants; **client re-validates + re-hashes assetId before Dexie put** (Pitfall 10 — Zod-at-network-boundary, STATE-04 defense-in-depth).

### `src/persistence/db.ts` (MOD — v6 assets store)

**Analog:** self — the v5 append block (L199-206) + compound-PK precedent (v1 `location: "[articleId+revision]"`, L118)

```typescript
    this.version(5).stores({
      articles: "id, revision, source, addedAt, *tags, bookId",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
      books: "id, title, *tags",
    });
```
v6 appends the same way (v1..v5 byte-unchanged, NO `.upgrade()` — five-phase precedent, zero exceptions):
```typescript
    this.version(6).stores({
      /* all v5 stores verbatim */ 
      assets: "[articleId+assetId], articleId",  // compound PK + FK index for range deletes
    });
```
Add the typed table property mirroring the `books!` definite-assignment precedent (L103-108).

### `src/persistence/assetsStore.ts` (NEW — store seam)

**Analog:** `src/persistence/booksStore.ts` (save/cascade) + `src/persistence/highlightsStore.ts` (Zod-read + whole-store read)

**Zod-at-boundary read with calm corrupt-row drop** (`highlightsStore.ts` L66-84):
```typescript
    const rows = await db.highlights
      .where("[articleId+revision]")
      .between([articleId, 0], [articleId, Number.MAX_SAFE_INTEGER])
      .toArray();
    const valid: HighlightRecord[] = [];
    for (const row of rows) {
      const parsed = HighlightRecordSchema.safeParse(row);
      if (parsed.success) { valid.push(parsed.data); }
      // else: drop the corrupt row silently — STATE-04 says never coerce
```
**Never-throw discriminated result + classifyStorageError** (`booksStore.ts` L75-90) — copy for list/asset loads. Bulk export read copies `loadAllHighlights` (L124-135). `bulkGet` for the per-article open path (RESEARCH Pattern 4).

### `src/ingestion/LibrarySource.ts` + `src/persistence/booksStore.ts` (MOD — atomic save + cascade)

**Analog:** self — existing transactions

**Cascade with collect-before-delete** (`LibrarySource.ts` L108-151):
```typescript
  async remove(id: string): Promise<void> {
    await db.transaction("rw", db.articles, db.highlights, db.notes, db.location, async () => {
      const highlightIds = (await db.highlights
        .where("[articleId+revision]")
        .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
        .primaryKeys()).map((k) => (Array.isArray(k) ? k[0] : k));
      await db.articles.delete(id);
      // ... highlights/notes/location range deletes ...
    });
  }
```
Extension is ONE line inside the same transaction: `await db.assets.where("articleId").equals(id).delete();` — the single-index range delete is why the v6 `articleId` index exists. `removeBook` (booksStore L179-239) extends its chapter loop identically. **Save atomicity** copies `saveBook`'s puts-only one-transaction shape (L139-158: stamp BEFORE the transaction, closure = pure put sequence — no Zod, no crypto, no network inside, the 09-04 rule). `save(article, assets)` upsert range-deletes old asset rows + puts new ones in the SAME transaction (D20-07 re-ingest leaves no orphan blob).

### `src/portability/bundle.ts` + `manifest.ts` + `ExportImportService.ts` (MOD — v4)

**Analog:** self — the 12-07/17-04 widening discipline, third application

**Union + optional-field widening** (`bundle.ts` L48-65):
```typescript
export const ExportBundleSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),  // → add z.literal(4)
  // ...
  books: z.array(BookSchema).optional(),  // ← assets: z.array(AssetExportMeta).optional() copies THIS
});
```
Writers emit 4; `validateBundle` peek threshold `> 3` → `> 4` (ExportImportService L241-247); filename stays `lem-reader-bundle-v1.zip`.

**Manifest determinism contract** (`manifest.ts` L37-57):
```typescript
export async function computeManifest(bundle: ExportBundle): Promise<Manifest> {
  const entry = async (block: unknown): Promise<string> =>
    await sha256Hex(new TextEncoder().encode(JSON.stringify(block)));
  return { algorithm: "sha256", blocks: { articles: await entry(bundle.articles), /* ... */ } };
}
```
Add an `assets` block hashing `JSON.stringify(bundle.assets)` on BOTH sides (L37-46 determinism contract is load-bearing); per-asset `sha256` rides `AssetExportMeta`.

**Zip entries + bomb filter + validation order** (`ExportImportService.ts` L197-204, L130-133):
```typescript
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => f.originalSize <= MAX_ENTRY_ORIGINAL_SIZE,
    });
```
```typescript
  return zipSync({
    "bundle.json": strToU8(JSON.stringify(bundle, null, 2)),
    "manifest.json": strToU8(JSON.stringify(manifest)),
  });
```
Asset entries `assets/<articleId>/<assetId>` (raw `Uint8Array` values) ride the same `zipSync` call; entry names are SERVER-generated (never attacker-controlled) and `isSafeEntryName` stays on every read. Import side adds per-asset byte caps + no-broken-refs gate (dangling `asset:` src → **per-article skip with explicit reason** — D12-11 honesty; never silent placeholder-rewrite). `applyImport`'s puts-only closure (L335-372) gains one `db.assets.put` loop; **watch the Dexie tuple-overload limit — the six-table branch already uses the readonly-array overload (L374-383); adding `db.assets` makes SEVEN tables → both branches use array form.**

### `src/portability/conflicts.ts` (+ `ImportPreviewDialog.tsx`) (MOD)

**Analog:** self — the D9-14 taxonomy (L55-73)
```typescript
export type ConflictKind =
  | "book"
  | "article-revision"
  | "article-content-divergence"
  | "article-metadata-override"
  | "highlight-id" | "note-id" | "location";
```
**Asset conflicts ride the article record — NO new ConflictKind** (RESEARCH Pattern 6): incoming-wins = article + its assets upsert together; skip = nothing; identical article = calm no-op. `ResolvedImportPlan` (L147+) may need an `assetsToWrite` array consumed by `applyImport`. Dialog changes are minimal (at most a count line), preserving per-item choice UX.

### `src/content/render/BlockRenderer.tsx` (MOD — figure case)

**Analog:** self — current figure case (L229-248)
```tsx
    case "figure":
      return (
        <figure {...elementProps}>
          <img src={block.src} alt={block.alt} />
          {block.caption.length > 0 && (
            <figcaption>
              <InlineList runs={block.caption} highlightSlices={captionHighlightSlices} />
            </figcaption>
          )}
        </figure>
      );
```
New shape (RESEARCH Code Examples): `resolveAsset(block.src)` → objectUrl ? `<img src={objectUrl} width={block.width} height={block.height} loading="lazy" decoding="async" onError={handleBroken} />` + inline `aspectRatio` style from stored dims : `<span className="figure-placeholder">` with glyph + alt ("Image unavailable" when alt empty) — **a `<span>`, never an `<img>` without a real src** (no accidental network; legacy remote srcs NEVER render as `<img>`). The figcaption branch + `captionHighlightSlices` (computed at L631-664) stays **byte-identical in every state** — D19-01 caption marks untouched. Threading pattern: optional prop on `BlockViewProps` (L95-144) consumed only by the figure case, mirroring `captionHighlightSlices`.

### `src/content/assets/AssetProvider.tsx` (NEW — provider)

**Analog:** `src/reader/annotations/HighlightOverlay.tsx` context pattern (L155-165) + fixture-first resolution (composite precedent, `LibrarySource.ts` L173-196)

```typescript
const HighlightOverlayContext = createContext<HighlightOverlayValue | null>(null);
export function HighlightOverlayProvider({ article, children, /* ... */ }) {
```
Per RESEARCH Pattern 4: `useMemo` Map + `useEffect` resolve loop (fixture-asset registry FIRST — fixtures never touch Dexie, the inMemoryRepository discipline — then `db.assets.bulkGet`), revoke-all on articleId change/unmount (Pitfall 9 leak). Optional-context hook shape (`useOptionalHighlightOverlay`, L277-281: null outside provider — legacy callers byte-unchanged) is the exact seam for `useAssetUrl`.

### `src/fixtures/figure-assets.ts` + `figure-heavy.canonical.json` (NEW + REGEN)

**Analog:** `src/fixtures/index.ts` (L8-33) — build-time Zod-validated fixture loading:
```typescript
import { ArticleSchema } from "../content/schema";
import figureHeavy from "./articles/figure-heavy.canonical.json" with { type: "json" };
export const fixtures: readonly CanonicalArticle[] = [ /* ... */ ].map((raw) => ArticleSchema.parse(raw));
```
Current figure-heavy srcs are remote wikimedia URLs (verified: two `https://upload.wikimedia.org/...` srcs) — regeneration rewrites them to `asset:img-…` refs + dims, keyed into the bundled `figure-assets.ts` registry (tiny real bytes per format + animated samples). Generator self-verifying (11-01 precedent).

### `src/measurement/domMeasurer.ts` + `engine.ts` (NO-MOD — reserved geometry via the CSS route)

**Analog:** self — figure measurement already flows through `kindForElement` (L70-71 `case "figure": return "figure";`) and `measureAllBlocks`'s `getBoundingClientRect` read loop (L155-193). Reserved aspect boxes make these reads deterministic pre-decode with ZERO engine changes: reserved geometry is delivered purely through CSS (`aspect-ratio`, `max-width: 100%`, height-capped default box per Pitfall 3) applied by 20-04's renderer work — the DOM measurer reads the already-reserved boxes, so no plan modifies these files (revision R2 reclassification; the original "(MOD, light)" tag overestimated the integration surface). Figure stays ATOMIC (`splitBlock.ts` L145-159) — no splitting change.

### Tests

**`tests/unit/server/fetchImageAsset.spec.ts`** ← `tests/unit/server/safe-fetch.spec.ts` shape (L12-79): `vi.mock("node:dns")` + `vi.stubGlobal("fetch", fetchMock)` + table-driven typed-reason assertions + "body never read on refusal" guards. Sniff matrix: 5 formats × {valid, animated, svg, lying-header, pixel-bomb, EXIF-rotated} (Wave-0 gap list).

**`tests/unit/server/assetStage.spec.ts`** ← `tests/unit/server/ingest-epub.spec.ts` / `markdown-to-blocks.spec.ts` orchestration style; must assert byte-identity of alt+caption substrate across the rewrite.

**`tests/unit/persistence/assets-cascade.spec.ts`** ← `tests/unit/persistence/books-store.test.ts` (zero-rows cascade proof + saveBook atomicity): asset-put failure rolls back the article put; upsert replaces old asset rows.

**`tests/unit/portability/bundle-v4.spec.ts`** ← `tests/unit/portability/bundle-schema.test.ts` + `validate-bundle.test.ts`: v4 write / v1-3 read / bomb entries / sha256 mismatch / dangling-ref skip / conflict ride.

**`tests/e2e/imagery/*.spec.ts`** ← `tests/e2e/font-failure.spec.ts` non-vacuous route pattern (L16-26: register `page.route` BEFORE navigation so interception is real; verify via `page.on("request")` that the guard had something to catch). Offline-reopen: `page.route(/^(?!https?:\/\/localhost)/, route => route.abort())` + external-request array asserted `[]` (RESEARCH Code Examples gives the full sketch). Reuse `wipeDatabase`/`openArticle` from `tests/e2e/annotations/_fixtures.ts`.

## Shared Patterns

### D-05 substrate byte-identity (load-bearing — anchors/highlights)
**Source:** `src/pagination/splitBlock.ts` L113-116
**Apply to:** `server/assetStage.ts`, `server/htmlToBlocks.ts`, `server/markdownToBlocks.ts`, `server/epubToBooks.ts` — every rewrite path
```typescript
    case "figure": {
      const captionText = block.caption.map((r) => r.text).join("");
      return [block.alt, captionText].filter(Boolean).join(BLOCK_SEPARATOR);
    }
```
The src/dims rewrite must leave this output byte-identical — saved locations, highlights, and caption anchors (D19-01) are untouched by construction. Strengthen-only on any corpus pin that changes (19-05 precedent; Pitfall 7: realignment is planned work, not a surprise).

### Typed refusal / never-throw-to-reader
**Source:** `server/errors.ts` L20-31 (`IngestionError.reason` contract) + per-figure variant
**Apply to:** `fetchImageAsset.ts` (returns `ImageAsset | Refusal` — typed value, never throw), assetStage (per-figure skip + disclosure), conflicts (per-article skip reasons)
```typescript
export class IngestionError extends Error {
  readonly reason: IngestionFailureReason;
  constructor(reason: IngestionFailureReason, message?: string) { /* ... */ }
}
```

### Zod-at-boundary + calm corrupt-row drop
**Source:** `src/persistence/highlightsStore.ts` L70-80, `booksStore.ts` L75-90
**Apply to:** `assetsStore.ts` reads, `IngestionResponseSchema` asset envelope (client re-validates + re-hashes before Dexie put — server is not trusted), bundle v4 import validation.

### One-transaction atomicity (puts-only closures)
**Source:** `booksStore.ts` L139-158 (`saveBook`), `LibrarySource.ts` L108-151 (`remove`), `ExportImportService.ts` L326-395 (`applyImport`)
**Apply to:** `save(article, assets)`, `saveBook(book, articles, assets)`, `remove`/`removeBook` asset cascade, import apply. NO Zod/crypto/network inside the closure; collect-before-delete when cascading through FKs; array-overload form when tables exceed five.

### Content-hash ids + dedupe
**Source:** `server/ingest.ts` L140-142 (`shortHash`), `L301` (`epub-<hash>` book base)
**Apply to:** assetId `img-<12hex>` (D7-07 locality precedent); identical bytes self-identify (conflict-ride semantics depend on this).

### Limits three-enforcement-point + corpus-calibrated caps
**Source:** `src/ingestion/types.ts` L52-76 (`PDF_MAX_BYTES`), `server/limits.ts` L92-100 (`MAX_IMAGE_PIXELS` pdf.js precedent), L134-146 (`MAX_INGEST_BODY_BYTES` base64 math)
**Apply to:** all new image caps — live in `src/ingestion/types.ts`, re-exported from `server/limits.ts`; base64 transport math (+4/3 + slack) for any response-budget constant; exact numbers corpus-determined (D20-11).

### SSRF 9-measure reuse (no second egress path)
**Source:** `server/safeFetch.ts` L110-207
**Apply to:** the image profile ONLY — never fork the pipeline; `tests/e2e/ingestion/ssrf-matrix.spec.ts` is the pin (strengthen-only; document-profile refactor is its own commit per Pitfall 4).

## No Analog Found

| Surface | Role | Reason | Planner Guidance |
|---------|------|--------|------------------|
| `image-size`/`is-animated` sniff sequence | service (new libs) | No binary sniffing exists in-repo | Use RESEARCH Pattern 1 sketch verbatim; both libs stay behind the `fetchImageAsset` seam (one-file swap) |
| Object-URL lifecycle (`createObjectURL`/revoke) | provider | No blob-URL usage in-repo | RESEARCH Pattern 4 owns it; create/revoke symmetry unit test (Pitfall 9) |
| EXIF orientation handling | transform | New | RESEARCH Pitfall 2: swap when `orientation >= 5`; corpus includes one rotated JPEG |
| Bundle raw-byte zip entries (write side) | portability | `zipSync` has only ever carried `strToU8` values | 12-02 `unzipSync` byte-map proves the read side; verify `zipSync` Uint8Array values in a Wave 0 unit test (Assumption A5) |

## Metadata

**Analog search scope:** `server/`, `src/content/`, `src/persistence/`, `src/ingestion/`, `src/portability/`, `src/pagination/`, `src/measurement/`, `src/fixtures/`, `src/reader/annotations/`, `tests/unit/{server,persistence,portability}/`, `tests/e2e/`
**Files scanned:** 28 read in full or targeted ranges (all excerpts verified against current source)
**Pattern extraction date:** 2026-08-31
