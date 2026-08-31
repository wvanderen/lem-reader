# Phase 20: Safe Local Image Fidelity - Research

**Researched:** 2026-08-31
**Domain:** SSRF-safe secondary asset fetching, server-side image sniffing, canonical schema evolution, Dexie blob persistence, reserved-geometry pagination, export/import bundle v4
**Confidence:** HIGH

## Summary

Phase 20 turns figures from remote `<img src>` references into article-owned local
assets through one inline ingest stage, and makes the reader structurally incapable
of contacting a third-party image host after save. The codebase is unusually well
prepared for this: `safeFetch`'s 9-measure SSRF pipeline [VERIFIED: codebase,
server/safeFetch.ts L110-207] already does scheme/metadata/DNS/IP/redirect/size
validation and only needs a parameterized content-type/byte profile for image
responses; `MAX_IMAGE_PIXELS` already exists as a decode-bomb cap precedent
[VERIFIED: codebase, server/limits.ts L100]; the Dexie additive-version
discipline (v1..v5) has a five-phase track record; and the D9-04 bundle
union-read discipline (v1|2|3 today) defines exactly how v4 asset entries join.
The D12-16 `downgradeFigures` retirement is a deletion, not a rewrite — EPUB
figures become container reads (zero network) through the same caps.

The two genuinely new capabilities are (1) **server-side image sniffing** —
intrinsic dimensions, true type, EXIF orientation, and animation detection — and
(2) **reserved-geometry rendering** — stored width/height reserving the exact
aspect-correct box so reader-side decode is paint, not layout. Both have
small, standard, pure-JS answers: `image-size` (zero-dep buffer sniffer,
35M weekly) and `is-animated` (GIF/APNG/WebP buffer predicate) for the server;
width/height attributes + CSS `aspect-ratio` + `createObjectURL` for the
browser. No native modules, no image-rendering framework — matching the
REQUIREMENTS.md "Out of Scope" row that explicitly rejects a new
image-rendering framework.

The load-bearing transport constraint: **Vercel Functions cap request AND
response payloads at 4.5MB** [VERIFIED: vercel.com/docs/functions/limitations,
updated 2026-08-24]. Base64-in-JSON asset bytes (~4/3 inflation) in the ingest
response exceed that ceiling on the minimal prod deploy long before generous
per-article budgets do. Dev middleware (all CI runs here) has no such limit.
The per-figure refusal path (D20-05) composes honestly with this: an asset set
that cannot complete transport refuses per-figure and the article still saves.

**Primary recommendation:** extend `safeFetch` into a parameterized two-profile
pipeline (document profile byte-stable, image profile with sniffing), evolve
`FigureBlock` additively (asset-ref union src + originalSrc + width/height),
add a Dexie v6 `assets` store keyed `[articleId+assetId]`, return asset bytes
base64-in-JSON with an explicit total-response budget, and render through a
per-article object-URL map with width/height-reserved boxes and one placeholder
surface.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Source scope (IMG-01)**

- **D20-01: ALL figure-producing sources EXCEPT PDF Gain local image
  fidelity.** URL + paste HTML and Markdown standalone images go through the
  new SSRF-safe asset fetch; EPUB figures extract from the already-local
  container (zero network — un-downgrades D12-16); PDF stays text-only. Every
  FigureBlock in the canonical model is local-asset-backed.
- **D20-02: `data:` URI images stay REFUSED** — Pitfall 5 holds; one
  no-exceptions media boundary. Refused figures get the calm per-figure
  fallback.
- **D20-03: EPUB scope is chapter-content figures ONLY** — no cover-image
  extraction, no cover thumbnails anywhere; cover display is a backlog
  capability.

**Fetch + refusal semantics (IMG-01, IMG-02)**

- **D20-04: Assets fetch INLINE at ingest** — per-asset timeout + overall
  image budget inside the existing ingest pipeline. A saved article is ALWAYS
  complete; no post-save background fetching (offline-clean by construction).
- **D20-05: Refusal is PER-FIGURE** — one bad image never blocks the article;
  each refused/failed figure becomes a calm fallback while the article saves
  normally (mirrors UnsupportedBlock tolerance). Exceed-cap figures refuse the
  same way.
- **D20-06: A refused/failed figure STAYS a FigureBlock** — alt text + caption
  render as-is; the image surface shows the calm placeholder. Captions stay
  highlightable (D19-01), figures stay semantic; no new block kinds.
- **D20-07: Retry = re-ingest only** — no in-reader retry UI; re-ingesting the
  source (D9-14 same-id upsert) refreshes content + assets. Zero post-save
  third-party contact.

**Format + animation policy (IMG-02)**

- **D20-08: Modern raster set ONLY** — jpeg, png, webp, gif, avif (everything
  all three CI engines decode natively); all other types refuse calmly
  per-figure.
- **D20-09: ANIMATED images refuse calmly** — animated GIF/WebP/APNG refuse
  per-figure (alt + caption preserved); static forms of the same types accept
  normally. Nothing in the calm reader moves on its own; no re-encode pipeline.
- **D20-10: SVG refuses** — raster-only media boundary this phase; sanitized
  static SVG is a backlog candidate.
- **D20-11: Caps are GENEROUS, bomb-stopping** — limits exist to stop decode
  bombs, huge originals, and image-spam pages, NOT to police reading. Exact
  numbers are corpus-determined per IMG-02; ordinary image-heavy longform
  (photo essays, wikimedia articles) saves whole.

**Canonical model + geometry (IMG-03, IMG-05, IMG-06)**

- **D20-12: `FigureBlock.src` is REWRITTEN to a local asset reference at
  ingest** — the original URL moves to a provenance/diagnostic field. The
  canonical model is self-contained and can only ever point at local assets
  (IMG-03 by construction); export/import carries assets directly.
- **D20-13: Intrinsic dimensions are DECODED AND STORED at ingest** —
  pagination reserves the exact aspect-correct box up front; reader-side decode
  is pure fill-in (zero reflow, zero repagination churn — IMG-06 by
  construction). Refused/unknown-dimension figures reserve a calm default box.
- **D20-14: The placeholder is a quiet framed box + image glyph + alt text**
  (short calm "image unavailable" note when alt is empty), caption rendering
  normally beneath. ONE surface for refused-at-ingest and broken-at-read-time.
- **D20-15: Assets are ARTICLE-OWNED blobs** — a new additive Dexie store keyed
  by article id + asset id. Article deletion cascades atomically in ONE
  transaction (D17-13 precedent; no refcounting/GC machinery). The same image
  in two articles stores twice — accepted, rare, bounded by per-article caps.

### the agent's Discretion

- **Asset-fetch pipeline mechanics** — how the image fetch extends/reuses
  `safeFetch` (per-asset content-type allowlist, redirect/address re-validation,
  DNS pinning), per-asset timeout value, overall budget arithmetic, and where
  the stage sits in the locked `server/ingest.ts` orchestration.
- **Exact cap numbers** — per-asset bytes/pixels, per-article count and
  total-byte budget, reserved-default box dimensions: measured from the IMG-02
  representative corpus (wikimedia/longform photo-essay sampling).
- **Animation detection mechanics** — frame-count probing at ingest
  (server-side sniff vs decode-count) and its cross-engine reliability.
- **Schema evolution shape** — FigureBlock field names (`src` semantics,
  original-URL provenance field, where intrinsic dims live: on the block vs the
  asset record), Zod additive evolution, fixture regeneration
  (figure-heavy.canonical.json srcs become local references).
- **Dexie v6 store shape** — asset id format, blob/ArrayBuffer storage details,
  index design (Pitfall 9 additive-only).
- **EPUB extraction mechanics** — container-relative path resolution off the
  already-open archive, EPUB-internal figure limits inheriting the same caps
  (skip network, keep decode/byte/pixel guards).
- **Runtime asset resolution** — object-URL (`createObjectURL`) lifecycle and
  revocation discipline in the renderer; placeholder glyph anatomy.
- **Export/import shape** — bundle v4 asset entries (fflate zip entries, 09-04
  bomb-cap discipline, per-asset validation), conflict semantics (asset bytes
  differing rides the article-record conflict), no-broken-references
  guarantees, import-side limit enforcement.
- **Pagination integration** — how the stored dims feed `domMeasurer`/engine
  geometry for reserved boxes in both modes; figure stays atomic; how the D-05
  substrate (alt+caption) stays byte-identical so anchors and highlights are
  untouched.
- **Markdown relative-src figures** — already fail the httpUrl gate (no base
  directory); confirm they arrive as calm per-figure refusals.
- **Test shape** — fixture evolution, corpus-driven limit assertions, 3-engine
  matrix (decode/failure/offline cells), network-isolation proof (no
  third-party requests on reopen), honest full-suite gate; which existing
  specs legitimately update (EPUB downgrade specs change honestly).

### Deferred Ideas (OUT OF SCOPE)

- **Book cover images / library cover thumbnails** — rejected this phase
  (D20-03); backlog capability (EPUB manifest cover-image extraction + library
  UI).
- **Sanitized static SVG** — refused this phase (D20-10); revisit with a proven
  static-SVG sanitizer subset.
- **First-frame freeze for animated images** — rejected (D20-09 alternative);
  a canvas re-encode pipeline is its own effort.
- **In-reader per-figure retry** — rejected (D20-07); re-ingest is the refresh
  path; revisit on concrete reader friction.
- **PDF embedded-image extraction** — out of scope (D20-01); PDF figure
  regions stay honestly unsupported.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMG-01 | URL and supported document ingestion preserve meaningful source figures, alt text, and captions in the canonical sanitized model when reliably recoverable | Existing `figureBlock` (htmlToBlocks L199-231) + `figureFromImage` (markdownToBlocks L291-302) already extract alt/caption into FigureBlocks; asset stage rewrites src, preserves alt/caption byte-identically (D-05 substrate untouched); EPUB `downgradeFigures` retired into container extraction |
| IMG-02 | SSRF-safe secondary asset fetch with redirect/address/media-type/byte/pixel/count/animation/decode limits from a representative corpus | `safeFetch` 9-measure pipeline reused via parameterized profile (§Pattern 1); `image-size` sniff (type + dims + EXIF) + `is-animated` predicate; caps join the `limits.ts` three-enforcement-point pattern; cap reference ranges §Stack + corpus mandate |
| IMG-03 | Saved articles never contact third-party image hosts on reopen; local assets with explicit lifecycle and deletion | D20-12 src-rewrite makes remote references unreachable after save; renderer resolves only local blobs; legacy remote-src rows render the same placeholder; Dexie v6 `assets` store + atomic cascade (D17-13 shape); offline e2e proof pattern exists (06 font-failure route-intercept precedent) |
| IMG-04 | Assets round-trip through versioned export/import with validation, conflicts, bundle limits, no broken references | Bundle v4 union-read discipline (12-07/17-04 precedent); fflate zip entries + 09-04 bomb caps; manifest assets block (deterministic JSON hash); D9-14 ride-the-article-record conflict semantics; no-broken-refs import gate (§Pattern 6) |
| IMG-05 | Figures render semantically with stable intrinsic geometry and calm broken/unsupported fallbacks in both modes | Stored width/height → `aspect-ratio` reserved box pre-decode; one placeholder surface (D20-14) shared by refused/legacy/broken states; `<figure>`/`<figcaption>` semantics unchanged; D19-01 caption marks untouched |
| IMG-06 | Image loading/decoding/failure cannot clip/duplicate/omit/reorder/destabilize paginated content; canonical location survives repagination | Reserved geometry = decode is paint not layout (D20-13 by construction); figures stay ATOMIC (splitBlock L12); `splittingBlockText` figure case byte-identical (alt+caption); `onerror` → placeholder swap inside the same reserved box |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Figure/alt/caption extraction | Ingest pipeline (server/ Node) | — | Sanitize-once-at-ingest boundary; jsdom + Readability already live here [VERIFIED: codebase] |
| SSRF-safe asset fetch | Ingest pipeline (server/safeFetch extension) | — | Network egress exists only in the ingest request; renderer never fetches |
| Byte/type/pixel/animation sniffing | Ingest pipeline (Node, pure-JS libs) | — | Engine-independent by construction — browsers never sniff, so no cross-engine variance in detection |
| src rewrite + dims storage | Canonical document model (Zod schema) | — | The doc model is the security boundary; only it can make remote refs structurally impossible (D20-12) |
| Asset blob persistence + lifecycle | Persistence tier (Dexie v6 `assets`) | — | IndexedDB is the local-first store; article-owned rows key cascade deletes (D20-15) |
| Object-URL resolution + placeholder | Browser render tier (React) | — | `createObjectURL`/decode/revoke are browser-only; geometry comes from the model, not the network |
| Reserved geometry | Measurement/pagination tier (CSS + stored dims) | Renderer | The hidden measurement body reads stable heights because aspect boxes are deterministic |
| Bundle round-trip v4 | Portability tier (fflate + Zod + manifest) | — | Existing envelope/manifest/bomb-cap machinery owns all serialization |
| Conflict semantics | Portability domain (conflicts.ts) | ImportPreviewDialog | D9-14 per-item choices; assets ride article records |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `image-size` | 2.0.2 | Buffer sniff: `{width, height, type, orientation?}` for jpeg/png/webp/gif/avif (+svg detection → refuse) | Zero deps, header-only reads, TS types, ESM+CJS, 35M weekly [VERIFIED: npm registry + official README]. The Node-ecosystem default for this exact job |
| `is-animated` | 2.0.2 | Buffer predicate `isAnimated(bytes)` for animated GIF / APNG / animated WebP | Tiny, zero deps, stable since 2022, exactly the D20-09 format list [VERIFIED: npm registry + official README] |

Both are **server-side only** (`server/` imports; nothing in `src/` — the
browser never sniffs). No existing dependency changes.

### Supporting (already installed — no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.4.4 | FigureBlock additive evolution + `AssetRecord`/bundle-v4 schemas; asset-ref regex refinement keeps Pitfall-5-style parse-time guarantees | Schema evolution, envelope widening, import validation |
| `dexie` | 4.4.4 | v6 `assets` store (compound PK `[articleId+assetId]`), Blob storage, transactional cascade | All persistence/lifecycle work |
| `fflate` | 0.8.3 | Bundle v4 asset zip entries (`zipSync`/`unzipSync` accept Uint8Array values); `originalSize` filter = bomb cap | Export/import byte entries |
| Browser platform | — | `URL.createObjectURL`/`revokeObjectURL`, `<img width height>` + CSS `aspect-ratio`, `loading="lazy" decoding="async"`, `onerror` | Runtime resolution + reserved geometry + calm failure |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `image-size` + `is-animated` | `sharp` | sharp gives full decode + `metadata.pages` (animation count) + re-encode, but is a native binary — breaks the project's zero-native-dep discipline, bloats the Vercel bundle, and is overkill for header sniffing. Seam verdict SUS("too-new" heuristic; actually mature) — unnecessary either way |
| `image-size` | `probe-image-size` | Older, stream-oriented; image-size v2's buffer API is the modern fit; seam flagged SUS — skip |
| Hand-rolled binary header parsing | `image-size` | GIF/PNG/WebP/AVIF container parsing is exactly the "deceptively complex problem" the Don't-Hand-Roll rule exists for (EXIF orientation alone is a bug farm) |
| Server-side sniffing | Client-side `createImageBitmap` dimension probe | Would put trust-boundary decisions (pixel bombs, animation) in the renderer and split the security boundary; ingest-time model requires server-side [VERIFIED: codebase — pipeline lives in server/ingest.ts] |

**Installation:**
```bash
npm install image-size@2.0.2 is-animated@2.0.2
```

**Version verification (run this session):**
- `image-size` 2.0.2, published 2025-04-02, unpacked 378KB, no dependencies, no postinstall [VERIFIED: npm registry]
- `is-animated` 2.0.2, last publish 2022-06-19, no dependencies, no postinstall [VERIFIED: npm registry]
- `sharp` 0.35.4 exists — NOT recommended (native)

## Package Legitimacy Audit

> Package Legitimacy Gate run via `gsd-tools query package-legitimacy check --ecosystem npm image-size is-animated sharp probe-image-size`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| image-size | npm | ~4 yr (v2 line; project since 2011) | 35.1M/wk | github.com/image-size/image-size | OK | Approved |
| is-animated | npm | ~10 yr (2.0.2 since 2022) | 52.7k/wk | github.com/qzb/is-animated | OK | Approved |
| sharp | npm | mature | 93.9M/wk | github.com/lovell/sharp | SUS ("too-new" heuristic) | Not used — rejected on native-dep grounds |
| probe-image-size | npm | mature | moderate | github.com/nodeca/probe-image-size | SUS | Not used |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious [SUS]:** none retained (sharp/probe-image-size considered and rejected on fit)

**Maintenance honesty note (image-size):** the GitHub repo was archived 2026-06
(maintainer relocating to Codeberg; npm package current and stable) [VERIFIED:
official repo README banner]. The library is a finished header-parsing utility
with zero deps; risk is low and confined to the server. If this concerns the
user, the Codeberg continuation is the follow-source. Both installs stay
behind a `fetchImageAsset` module seam (see Pattern 1), so either lib is
swappable in one file.

*Both packages were verified against their official READMEs on the registry
and the legitimacy seam in this session — no [ASSUMED] package names.*

## Architecture Patterns

### System Architecture Diagram

```
                        INGEST (server/ Node — one request, inline)
┌───────────────────────────────────────────────────────────────────────────┐
│ url ──► safeFetch(document profile) ──► extractAndNormalize               │
│           (byte-stable)                    │  FigureBlocks w/ remote src  │
│ paste/html-upload ────────────────────────┤                                │
│ markdown ──► markdownToBlocks ────────────┤                                │
│                                            ▼                                │
│                            [NEW] ASSET STAGE (per article)                 │
│                            ├─ collect unique figure srcs                   │
│                            ├─ count/byte-budget guard (D20-05/D20-11)      │
│                            ├─ fetchImageAsset × N (bounded concurrency)    │
│                            │    safeFetch(image profile): scheme→meta→     │
│                            │    DNS→IP→per-hop redirects→byte cap→         │
│                            │    image content-type → arrayBuffer           │
│                            ├─ SNIFF: imageSize(bytes) + isAnimated(bytes)  │
│                            │    ├─ type ∉ {jpeg,png,webp,gif,avif} → refuse│
│                            │    ├─ animated → refuse (D20-09)              │
│                            │    ├─ w×h > pixel cap → refuse (bomb)         │
│                            │    └─ pass → asset img-<12hex> + dims         │
│                            └─ REWRITE FigureBlocks (D20-12/D20-13)         │
│                                 src=asset:… / originalSrc=<url> / w,h      │
│                                 refused → src stripped, alt+caption kept   │
│ epub ─► epubToBooks ─► [container extraction — same caps, NO network]      │
│         (downgradeFigures DELETED — D12-16 retired)                        │
│                                            ▼                                │
│              ArticleSchema.parse → anchor gate → confidence → stamp        │
│              response envelope += assets[] (base64 bytes + metadata)       │
└───────────────────────────────────────────────────────────────────────────┘
                                            │
┌──────────────── CLIENT SAVE (atomic) ─────▼────────────────────────────────┐
│ ONE Dexie rw transaction: article(s) put + assets put ("always complete")  │
└────────────────────────────────────────────────────────────────────────────┘
                                            │
┌──────────────── READ (browser) ───────────▼────────────────────────────────┐
│ ArticleView open ──► AssetProvider: db.assets.bulkGet([assetId,…])         │
│   fixture articles? fixture-asset registry first, then Dexie               │
│   ──► Map<assetId, objectURL>   (revoke on article switch/unmount)         │
│ BlockRenderer figure case:                                                  │
│   asset present → <img src=objURL width height> + CSS aspect-ratio         │
│   absent (refused | legacy remote | broken) → ONE placeholder box          │
│   figcaption + D19-01 caption marks byte-identical in every state          │
│ Measurement: hidden body reads stable heights (reserved boxes) ──►         │
│ pagination engine: figure ATOMIC; decode is paint, not layout              │
└────────────────────────────────────────────────────────────────────────────┘
                                            │
┌──────────────── EXPORT/IMPORT (v4) ───────▼────────────────────────────────┐
│ buildBundleBytes: bundle.json += assets[] meta; zip entries                 │
│   assets/<articleId>/<assetId> (raw bytes); manifest += assets block hash   │
│ import: bomb filter → v1|2|3|4 union read → per-asset sha256 + caps →      │
│   no-broken-refs gate → conflicts ride article records (D9-14) →           │
│   ONE puts-only transaction per applyImport rule                           │
└────────────────────────────────────────────────────────────────────────────┘
```

A reader tracing the primary use case: URL enters top-left → figure survives
every refusal path as alt+caption+placeholder or becomes a local blob → reopen
reads only IndexedDB → export carries the blob in the zip → import restores it.

### Recommended Project Structure (additions only)

```
server/
├── fetchImageAsset.ts      # NEW — image-profile fetch + sniff + caps (one seam)
├── assetStage.ts           # NEW — per-article collect/budget/rewrite stage
├── safeFetch.ts            # MODIFIED — extract parameterized core, doc profile byte-stable
├── limits.ts               # MODIFIED — image caps join the shared constants
├── ingest.ts               # MODIFIED — asset stage joins orchestration; envelope += assets
└── epubToBooks.ts          # MODIFIED — downgradeFigures deleted → container extraction
src/
├── content/schema.ts       # MODIFIED — FigureBlock additive evolution + AssetMetaSchema
├── ingestion/types.ts      # MODIFIED — IngestionResponseSchema += assets; shared cap constants
├── content/render/BlockRenderer.tsx  # MODIFIED — figure case: objURL | placeholder + reserved box
├── content/assets/AssetProvider.tsx  # NEW — per-article object-URL map + fixture registry consult
├── persistence/db.ts       # MODIFIED — v6 assets store (additive; v1..v5 byte-unchanged)
├── persistence/assetsStore.ts        # NEW — bulkGet/put/cascade helpers
├── ingestion/LibrarySource.ts        # MODIFIED — save(article, assets) + remove cascade += assets
├── persistence/booksStore.ts         # MODIFIED — saveBook/removeBook += assets in same transactions
├── portability/bundle.ts             # MODIFIED — v4 union read + AssetExportMeta
├── portability/ExportImportService.ts# MODIFIED — asset entries, no-broken-refs gate, import caps
├── portability/manifest.ts           # MODIFIED — assets block
├── fixtures/figure-assets.ts         # NEW — tiny bundled per-format fixture bytes (registry)
└── fixtures/articles/figure-heavy.canonical.json  # REGENERATED — local refs + dims
tests/e2e/imagery/                    # NEW — decode/refusal/offline/geometry specs
tests/unit/server/fetchImageAsset.spec.ts, assetStage.spec.ts, bundle-v4.spec.ts, …
```

### Pattern 1: One safeFetch pipeline, two profiles

**What:** Extract the 9-measure pre-body pipeline (scheme → metadata-hostname →
DNS resolve → IP deny-list → manual-redirect-per-hop → DNS pinning → timeout →
content-length cap → content-type gate) into a shared core parameterized by
`{allowedContentTypes, timeoutMs, maxBytes}`. The document profile keeps
today's exact constants and returns text; the image profile takes the
image allowlist and returns bytes.

**When to use:** `fetchImageAsset(url)` wraps the image profile and adds the
sniff sequence on the returned bytes. All Phase-7 SSRF tests keep passing
byte-identically for the document path (`tests/e2e/ingestion/ssrf-matrix.spec.ts`
is the pin — do not weaken; strengthen-only).

```typescript
// server/fetchImageAsset.ts (sketch — Source: codebase pattern server/safeFetch.ts
// + image-size README + is-animated README)
import { imageSize } from "image-size";
import isAnimated from "is-animated";
import { IMAGE_CONTENT_TYPES, MAX_ASSET_BYTES, MAX_ASSET_PIXELS,
         ASSET_FETCH_TIMEOUT_MS } from "./limits";

export interface ImageAsset {           // the sniff result the stage persists
  assetId: string;                      // `img-${sha256(bytes).slice(0,12)}` — D7-07 locality
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";
  width: number; height: number;        // orientation-corrected intrinsic px
  bytes: Uint8Array;
}

type Refusal = "fetch" | "type" | "bytes" | "pixels" | "animated";

export async function fetchImageAsset(url: string): Promise<ImageAsset | Refusal> {
  const res = await safeFetchCore(url, {           // reused 9-measure core
    allowedContentTypes: IMAGE_CONTENT_TYPES,       // header advisory only…
    timeoutMs: ASSET_FETCH_TIMEOUT_MS,
    maxBytes: MAX_ASSET_BYTES,
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_ASSET_BYTES) return "bytes";
  const dim = imageSize(bytes);                     // …sniff is AUTHORITATIVE
  const sniffed: string = dim.type;                 // 'jpeg'|'png'|'webp'|'gif'|'avif'|'svg'|…
  if (!["jpeg","png","webp","gif","avif"].includes(sniffed)) return "type";  // svg lands here (D20-10)
  if ((dim.width ?? 0) * (dim.height ?? 0) > MAX_ASSET_PIXELS) return "pixels";
  if (isAnimated(bytes)) return "animated";         // GIF/WebP/APNG (D20-09)
  const swap = (dim.orientation ?? 1) >= 5;         // EXIF 5-8: swap for reserved aspect
  return {
    assetId: `img-${await sha256HexBytes(bytes).slice(7, 19)}`,
    contentType: `image/${sniffed}` as ImageAsset["contentType"],
    width: swap ? dim.height : dim.width,
    height: swap ? dim.width : dim.height,
    bytes,
  };
}
```

**Key rules:** every refusal returns a typed value — never a throw — so the
stage can apply per-figure calm fallback (D20-05) without try/catch noise; the
sniffed type overrules the declared content-type header (headers lie; the
09-04 never-trust-input discipline applied to media).

### Pattern 2: FigureBlock additive evolution (Pitfall 9 shape)

**What:** Widen `src` to a refined union, add three optional fields. Old rows
and fixtures parse unchanged; no data migration; no Dexie bump for the block
itself (non-indexed fields need no version block — the readerTitle precedent
[VERIFIED: codebase, db.ts L83-92]).

```typescript
// src/content/schema.ts (sketch)
const assetRef = z.string().regex(/^asset:img-[a-z0-9]{12}$/);  // parse-time guarantee
export const FigureBlock = z.object({
  kind: z.literal("figure"),
  alt: z.string(),
  // D20-12: new writes carry the local ref. Legacy rows carry the remote URL —
  // the renderer NEVER fetches it (union member exists for hydration only).
  src: z.union([httpUrl, assetRef]).optional(),   // refused figures omit src entirely
  originalSrc: httpUrl.optional(),                 // provenance/diagnostic (D20-12)
  width: z.number().int().min(1).optional(),       // D20-13 intrinsic px (orientation-corrected)
  height: z.number().int().min(1).optional(),
  caption: z.array(InlineRun).default([]),
});
```

**The three figure states (ONE render surface maps them):**

| State | src | width/height | Renders |
|-------|-----|--------------|---------|
| Accepted | `asset:img-…` | present | local `<img>` in reserved box |
| Refused at ingest | absent | absent | placeholder + alt + caption |
| Legacy row (pre-v2.1) | `https://…` | absent | placeholder + alt + caption — **never fetched** (IMG-03 for existing articles) |
| Broken at read (row missing / decode error) | `asset:…` | present | placeholder inside the SAME reserved box |

**Why the union beats replacing `src` outright:** parse-time scheme guarantees
survive (Pitfall 5 discipline — a regex-locked asset arm cannot smuggle a
javascript:/data: URI), existing rows hydrate without migration, and the
renderer discriminates states by field shape, not by string sniffing at render
time. D20-06's "no new block kinds" holds.

**Byte-stability mandate:** `alt` + `caption` are NEVER touched by the rewrite.
`splittingBlockText`'s figure case (`[alt, captionText].filter(Boolean).join(BLOCK_SEPARATOR)`
[VERIFIED: codebase, splitBlock.ts L113-116]) and the D-05 substrate stay
byte-identical — saved locations, highlights, and caption anchors (D19-01) are
untouched by construction.

### Pattern 3: Dexie v6 assets store + atomic lifecycle

**What:** One additive version block; compound primary key mirrors the
location-store precedent [VERIFIED: codebase, db.ts L118].

```typescript
// v6 append (v1..v5 byte-unchanged — Pitfall 9)
this.version(6).stores({
  articles: "id, revision, source, addedAt, *tags, bookId",
  settings: "key",
  location: "[articleId+revision]",
  highlights: "id, [articleId+revision]",
  notes: "id, highlightId",
  books: "id, title, *tags",
  assets: "[articleId+assetId], articleId",   // compound PK + FK index for range deletes
});

export interface AssetRecordRow {
  articleId: string;         // FK → articles.id (article-owned — D20-15)
  assetId: string;           // `img-<12hex>` content-hash
  contentType: string;       // sniffed canonical image/*
  byteLength: number;
  data: Blob;                // IndexedDB-native blob storage → createObjectURL-direct
  createdAt: string;         // ISO-8601
}
```

- **Dims live on the Block, not the row** (recommended): geometry is a
  presentation contract of the document; the row is dumb byte storage. One
  source of truth; import cross-checks consistency.
- **Save atomicity ("always complete"):** `LibrarySource.save(article, assets)`
  and `booksStore.saveBook(book, articles, assets)` open ONE rw transaction
  (adds `db.assets` to the existing table sets — the six-table readonly-array
  overload note in STATE applies when tables exceed five).
- **Re-ingest upsert (D20-07/D9-14):** same-id upsert = range-delete the
  article's old asset rows + put new ones inside the SAME transaction — a
  previously-accepted figure that now refuses leaves no orphan blob.
- **Deletion cascade:** `remove(id)` adds one `assets.where("articleId").equals(id).delete()`
  to the existing four-table transaction; `removeBook` extends its chapter loop
  the same way. Both stay ONE transaction (D17-13).

### Pattern 4: Runtime resolution — per-article object-URL map

**What:** An `AssetProvider` at ArticleView scope resolves all figure asset
refs once per article open; page fragments render from the stable map.

```typescript
// src/content/assets/AssetProvider.tsx (sketch)
// fixture articles resolve through the bundled registry FIRST (fixtures never
// touch Dexie — the inMemoryRepository discipline); Dexie rows second.
const ctx = useMemo(() => new Map<string, string>(), [articleId]);
useEffect(() => {
  let revoked = false; const urls: string[] = [];
  (async () => {
    const ids = figureAssetIds(article);                 // walk blocks for src="asset:…"
    const rows = fixtureAssetRegistry.has(article.id)
      ? fixtureAssetRegistry.get(article.id)             // bundled bytes → Blob
      : await db.assets.bulkGet(ids.map(a => [article.id, a]));
    for (const r of rows) if (r) {                       // missing row → placeholder (broken state)
      const url = URL.createObjectURL(r.data);
      if (revoked) { URL.revokeObjectURL(url); return; }
      urls.push(url); ctx.set(r.assetId, url);
    }
  })();
  return () => { revoked = true; urls.forEach(u => URL.revokeObjectURL(u)); };
}, [articleId]);
```

- Page turns mount/unmount fragments constantly — a per-article map means no
  per-turn create/revoke churn and deterministic geometry (no async gap where a
  figure renders before its URL exists).
- Memory-bounded alternative if corpus budgets prove heavy: lazy refcounted
  cache keyed by assetId (geometry is already stable without the blob, so lazy
  loading cannot perturb pagination — D20-13 makes this safe). Start with the
  simple map; the seam is one component.
- **Reserved box:** `<img src={url} width={w} height={h} loading="lazy" decoding="async">`
  + CSS `aspect-ratio: w/h; max-width: 100%; height: auto` (inline style from
  stored dims — deterministic even where UA width/height-attribute aspect
  behavior varies). Refused/unknown: default reserved box (calm 3:2-class
  default; exact ratio corpus-determined) capped in height so a placeholder
  never exceeds a page.

### Pattern 5: EPUB container extraction (D12-16 retirement)

**What:** Delete `downgradeFigures`. In `walkChapterDocument`, chapter figures
resolve against the already-open `fflate` entries map [VERIFIED: codebase,
epubToBooks.ts L317-331, L420-431, L552-557]:

1. `htmlToBlocks` needs relative EPUB srcs preserved as figures — options:
   (a) pass a `figureSrcResolver` hook / relative-passthrough option through
   `htmlToBlocks` (clean; small signature addition), or (b) pre-rewrite `img[src]`
   attributes in the JSDOM document to sentinel absolute URLs before walking
   (zero htmlToBlocks change; hackier). **Recommend (a)** — the hook returns a
   marker the EPUB path recognizes; the url/paste path passes nothing and stays
   byte-stable.
2. Resolve chapter-relative → OPF-dir-relative (`dirOf(item.href)` precedent
   exists for nav/NCX [VERIFIED: codebase, epubToBooks.ts L664]).
3. Read entry bytes from the archive (zero network), run the SAME sniff caps
   minus fetch (byte/pixel/type/animation), rewrite blocks, emit assets
   alongside chapter drafts; `ingestEpubBook` carries them into the book
   envelope.
4. EPUB-internal caps: per-chapter-figure byte/pixel guards identical to the
   network path; per-book asset total budget bounded by the 10MB container
   itself (bytes come from within it — inflation only via re-serialization;
   total asset bytes ≈ container size is the natural ceiling).

### Pattern 6: Bundle v4 + conflicts + no-broken-refs

**What:** The 12-07/17-04 widening discipline, third application:

```typescript
schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
// writers emit 4; validateBundle peek threshold moves to > 4; filename stays
// lem-reader-bundle-v1.zip (the zip filename is not the version contract).
assets: z.array(AssetExportMeta).optional(),   // absent on v1-3 (hydrates undefined)
// AssetExportMeta = { articleId, assetId, contentType, byteLength, sha256, entry }
```

- **Zip:** `assets/<articleId>/<assetId>` raw-byte entries ride the same
  `zipSync` call (fflate accepts mixed `Uint8Array` + `strToU8` values — the
  12-02 `unzipSync` entries map already proves the byte-entry discipline).
- **Manifest:** add an `assets` block hashing `JSON.stringify(bundle.assets)`
  on BOTH sides (the L37-46 determinism contract [VERIFIED: codebase,
  manifest.ts]); per-asset `sha256` rides the metadata array.
- **Import limits:** existing `MAX_ENTRY_ORIGINAL_SIZE` 200MB filter-first
  discipline + per-asset byte cap + total-assets byte cap (import-side
  enforcement of IMG-04 "bundle limits") — mirror the ingest constants from the
  shared `src/ingestion/types.ts` home.
- **No-broken-refs gate:** after parse, every `asset:` src on every incoming
  article must resolve to an included asset entry. **Dangling → per-article
  skip with an explicit refusal reason in the preview** (mirrors D12-11 chapter
  skip honesty — do NOT silently import placeholder-rewritten articles: silent
  image loss violates the honesty constraint). Orphan asset entries (no
  referencing article) are inert — drop.
- **Conflicts (D9-14 ride semantics):** asset rows ride their article's
  resolution — identical article (same id+revision+hash) = calm no-op; incoming
  wins = article + assets upsert (old asset rows replaced in-transaction); skip
  = nothing. Asset bytes never conflict independently of their article (the
  assetId content-hash makes identical bytes self-identifying anyway).
- **applyImport:** assets join the puts-only closure (the 09-04 rule — no Zod,
  no crypto, no network inside the transaction).

### Anti-Patterns to Avoid

- **Fetching in the renderer** (even "just to re-check"): IMG-03 is structural.
  The renderer's only inputs are the model + local blobs. A single
  `<img src={remote}>` left anywhere is a tracking beacon (the exact T-12-05
  threat downgradeFigures was built to stop).
- **Trusting Content-Type headers for images:** sniff bytes; the header is
  advisory. A `image/png` header on SVG bytes is the classic stored-XSS
  smuggling vector (D20-10 closes it only if the SNIFF decides).
- **Storing dims only on the asset row** (or both places): two sources of truth
  drift; the block is what the renderer and measurement see.
- **Editing the v1..v5 Dexie blocks or adding `.upgrade()`:** additive-only,
  no upgrade callbacks — five phases of precedent, zero exceptions.
- **Skipping bytes on content-length alone:** the response header can lie
  (chunked, absent); re-check `bytes.byteLength` after read — the 12-04
  decoded re-check discipline.
- **A second `data:` URI escape hatch** "for tiny images": D20-02 is
  no-exceptions; one media boundary.
- **Renumbering/altering `splittingBlockText` figure output:** every saved
  anchor/highlight on captions depends on byte-identity; the rewrite touches
  only `src`/`originalSrc`/`width`/`height`.
- **Background post-save fetching** "to improve fidelity later": violates
  D20-04 directly; re-ingest is the only refresh path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image dimensions/type from bytes | GIF/PNG/WebP/AVIF/JPEG header parser | `image-size` | EXIF orientation edge cases, WebP VP8/VP8L/VP8X canvas rules, AVIF ispe — months of format trivia, all tested already |
| Animation detection | NETSCAPE-ext/acTL/ANIM-chunk parsers | `is-animated` | Exactly the three animated formats in D20-09, done |
| SSRF-safe fetching | New fetch path for images | The `safeFetch` core, parameterized | The 9 measures exist and are matrix-tested (19-vector corpus); forking splits the security boundary |
| Blob URL lifecycle | Ad-hoc per-render createObjectURL | Per-article provider map + revoke-on-switch | Orphaned URLs leak blobs; per-turn churn destabilizes fragments |
| Integrity on export | Custom per-asset checksum format | `manifest.ts` sha256Hex + JSON-determinism contract | Exists, tested both sides |
| Zip bomb defense | New entry filtering | fflate `filter: (f) => f.originalSize <= cap` | 09-04 + 12-02 proven discipline |

**Key insight:** every hard part of this phase (SSRF, bombs, integrity,
schema evolution, conflicts, cascades) already has a proven in-repo mechanism —
the phase is composition, not invention. The only new pure logic is the sniff
sequence, and libraries own that.

## Runtime State Inventory

> Phase 20 changes persisted-row semantics (existing saved articles render
> differently after upgrade), so the inventory is answered even though this is
> not a rename phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (IndexedDB articles) | Saved v1.0-v2.0 articles with FigureBlocks carrying remote `httpUrl` srcs (URL/paste sources; markdown figures) | **No data migration** — additive Zod union hydrates them; behavior change: they render placeholders (never fetched). This IS the IMG-03 compliance for existing data. Re-ingest refreshes with assets (D20-07) |
| Stored data (IndexedDB epub chapters) | Chapters saved with downgraded-figure UnsupportedBlocks (plainDescription = alt text) | Stay as-is until re-ingest — honest; the un-downgrade applies to new ingests only |
| Stored data (Dexie schema) | v5 current; assets store absent | v6 additive block; no `.upgrade()`; store starts empty |
| Live service config | None — no external services beyond the ingest function | — |
| OS-registered state | None | — |
| Secrets/env vars | None new | — |
| Build artifacts | None — no installed packages carry the old model; fixture JSON is source (regenerates in-repo) | Regenerate `figure-heavy.canonical.json` + add fixture-asset registry |
| Bundles in the wild | v1/v2/v3 export zips on reader devices | Union read keeps them importing unchanged; v4 writers go forward |

**Nothing found in category:** Live service config, OS-registered state,
secrets — verified by the codebase being a static SPA + one stateless ingest
function [VERIFIED: codebase].

## Common Pitfalls

### Pitfall 1: Transport ceiling on the asset return path
**What goes wrong:** base64 assets (~×4/3) inflate the ingest JSON response;
the Vercel prod function hard-fails over 4.5MB (413 FUNCTION_PAYLOAD_TOO_LARGE)
[VERIFIED: vercel.com/docs/functions/limitations].
**Why it happens:** generous per-article budgets (D20-11) exceed the buffered
payload ceiling long before they exceed any corpus need.
**How to avoid:** make the **total-response asset byte budget** an explicit
constant enforced at the stage (assets that would exceed it refuse per-figure —
D20-05 composes perfectly); dev middleware + CI (where the matrix runs) have no
ceiling. A streamed/chunked asset transport is a backlog follow-up if prod
parity matters.
**Warning signs:** e2e green locally, prod add-dialog failures on photo essays.

### Pitfall 2: EXIF orientation corrupting reserved geometry
**What goes wrong:** JPEGs with EXIF orientation 5-8 report swapped
width/height from the header; browsers render the rotated aspect. Storing raw
header dims reserves a landscape box for a portrait photo → post-decode reflow
(the exact IMG-06 destabilization the phase forbids).
**How to avoid:** `image-size` returns `orientation` [VERIFIED: official
README]; swap width/height when orientation ≥ 5 at ingest (Pattern 1). Stale
assumption if future engines change default `image-orientation` — storing the
corrected dims makes the model authoritative either way.
**Warning signs:** reserved-vs-rendered aspect mismatch cells in the geometry
spec (corpus should include one rotated JPEG).

### Pitfall 3: Atomic-figure geometry exceeding a page
**What goes wrong:** a legitimately huge image (panorama, tall infographic) at
narrow measure reserves a box taller than a page → the atomic-oversize guard
(>0.75 page, Phase 04) fires honest dom-fallback for the whole article, every
open.
**Why it happens:** generous pixel caps admit images whose DISPLAYED height at
52-72ch width exceeds a viewport.
**How to avoid:** CSS max-height clamp on the figure media box (e.g.
`max-height: <page-relative cap>` with `object-fit: contain` letterboxing, or a
capped aspect policy) so no figure box can exceed a page — corpus + UI-spec
decide the number. This keeps pagination stable WITHOUT refusing the image.
**Warning signs:** paginated fallback banners on tall-figure corpus articles.

### Pitfall 4: Refactor drift in safeFetch
**What goes wrong:** extracting the parameterized core subtly changes document
path behavior (timeout constant, redirect cap, error mapping) — 19-vector SSRF
matrix + happy-path specs regress.
**How to avoid:** the document profile must reproduce today's observable
behavior byte-identically; run the full ingestion spec set after extraction as
its own commit (isolate the refactor from feature work).
**Warning signs:** any ssrf-matrix cell flip during the refactor commit.

### Pitfall 5: Broken-asset edge at read time
**What goes wrong:** asset row missing (DB tamper, partial import bug,
future schema drift) or blob bytes fail browser decode AFTER passing header
sniff (image-size reads headers only — corrupt bodies can still report dims
[VERIFIED: official README Limitations §1]).
**How to avoid:** `<img onerror>` → swap to the placeholder INSIDE the same
reserved box (geometry from the model never changes); the resolver treats a
missing row as the broken state. One surface (D20-14) covers refused + legacy
+ broken.
**Warning signs:** any layout shift correlated with image load events.

### Pitfall 6: EPUB response inflation
**What goes wrong:** a 10MB image-heavy EPUB returns chapters + all extracted
figure assets in one JSON response (~13MB+ base64) — slow, and prod-illegal
(Pitfall 1).
**How to avoid:** per-book total asset budget as part of budget arithmetic
(discretion: "overall image budget"); over-budget chapter figures refuse
per-figure (D12-11-style disclosure candidate — skipped figures stay counted).
**Warning signs:** book add latency spikes on image-heavy corpus books.

### Pitfall 7: Stale corpus pins (the 19-05 lesson)
**What goes wrong:** library/pagination corpus specs pin current figure-heavy
rendering (remote srcs); regeneration + placeholder semantics legitimately
change them — honest gate goes red mid-phase.
**How to avoid:** spec realignment is expected work (strengthen-only; 13-06/19-05
precedent) — plan it as a task, not a surprise; every changed expectation gets a
justification note.
**Warning signs:** engine-identical failures in library/epub specs after the
schema commit.

### Pitfall 8: Animated AVIF residual
**What goes wrong:** `is-animated` covers GIF/APNG/WebP only [VERIFIED:
official README]; an animated AVIF sequence passes the gate and moves in the
calm reader (violates D20-09's spirit; D20-09's letter lists GIF/WebP/APNG).
**How to avoid:** accept as a documented residual this phase (rare in
longform publishing), or sniff AVIF sequence structure by hand (not
recommended — Don't-Hand-Roll). Record in deferred-items honestly.
**Warning signs:** corpus containing animated AVIF.

### Pitfall 9: object-URL leaks across article switches
**What goes wrong:** URLs created per mount without revocation accumulate
blob references (memory growth over a long reading session).
**How to avoid:** the provider owns the full lifecycle — revoke-all on
articleId change/unmount (Pattern 4's cleanup); a unit test asserts
create/revoke symmetry.

### Pitfall 10: Middleware/ingest envelope growth without client re-validation
**What goes wrong:** assets ride `IngestionResponseSchema` — widening it
without keeping the Zod-at-network-boundary re-validation (STATE-04
defense-in-depth) leaves unvalidated base64 reaching the save path.
**How to avoid:** the envelope schema gains `assets: z.array(AssetEnvelopeSchema).default([])`
— client validates + decodes + re-checks byteLength + re-hashes assetId before
Dexie put (the server is not trusted by the client, per the existing
discipline).

## Code Examples

### The placeholder surface (D20-14 — one surface, calm anatomy)

```tsx
// src/content/render/BlockRenderer.tsx — figure case (sketch)
case "figure": {
  const objectUrl = resolveAsset(block.src);          // undefined for every non-asset state
  return (
    <figure {...elementProps}>
      {objectUrl ? (
        <img src={objectUrl} alt={block.alt}
             width={block.width} height={block.height}
             loading="lazy" decoding="async"
             onError={handleBroken} />                // → broken state, same box
      ) : (
        <span className="figure-placeholder"          // quiet framed box + glyph + alt
              style={{ aspectRatio: placeholderRatio }}>
          <ImageGlyph aria-hidden="true" />
          <span>{block.alt || "Image unavailable"}</span>
        </span>
      )}
      {block.caption.length > 0 && (                  // caption + D19-01 marks —
        <figcaption>                                  // byte-identical in every state
          <InlineList runs={block.caption} highlightSlices={captionHighlightSlices} />
        </figcaption>
      )}
    </figure>
  );
}
```

Notes: the placeholder is a `<span>` surface (no `<img>` without a real src —
no accidental network); alt text is VISIBLE in placeholder states (it is the
content); the img/alt attribute surface still renders no marks ever (D19-02);
forced-colors uses CanvasText tokens (RestorationMarker precedent).

### Offline-by-construction e2e proof (IMG-03)

```typescript
// tests/e2e/imagery/offline-reopen.spec.ts (sketch — 06 font-failure route pattern)
test.beforeEach(async ({ page }) => {
  await page.route(/^(?!https?:\/\/localhost)/, route => route.abort()); // nothing leaves origin
  await seedSavedFigureArticle();               // Dexie row + asset rows
});
test("reopen renders local images and fires zero third-party requests", async ({ page }) => {
  const external: string[] = [];
  page.on("request", r => { if (!r.url().includes("localhost")) external.push(r.url()); });
  await openArticle(page, "figure-article");
  await expect(page.locator("figure img").first()).toBeVisible();
  expect(await page.locator("figure img").first().evaluate(
    (el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(external).toEqual([]);                  // IMG-03, literally
});
```

The route-abort guard makes ANY accidental remote fetch a test failure rather
than a silent pass — non-vacuous by construction (the 06-04 Pitfall-1 guard).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Figures = remote `<img src>` (v1.0-v2.0) | Local article-owned assets, remote refs structurally unreachable | This phase | Offline/privacy/portability guarantees become structural, not behavioral |
| EPUB `downgradeFigures` (D12-16, v2.0) | Container extraction with same caps | This phase | Chapter figures render; anti-beacon guarantee preserved via local-only rendering |
| `safeFetch` single content-type profile | Parameterized two-profile core | This phase | One SSRF boundary serves documents + assets |
| Bundle v1|2|3 | v1|2|3|4 union read, writers emit 4 | This phase | Third application of the widening discipline; pattern is now routine |
| Pixel caps only in pdf.js path (`MAX_IMAGE_PIXELS`) | Same cap governs ingested raster assets | This phase | One auditable bomb-cap constant family |

**Deprecated/outdated:**
- `ALLOWED_CONTENT_TYPES` as a single module constant: becomes the document
  profile's parameter; the constant stays for the document path (no behavior
  change).
- Remote-src figure rendering in `BlockRenderer`: permanently replaced by
  local-resolution + placeholder.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | IndexedDB/Dexie stores `Blob` rows efficiently and `createObjectURL` consumes them directly (no ArrayBuffer copy needed) | Pattern 3/4 | Low — would switch `data` to `ArrayBuffer` + `new Blob()` at resolve time; one-line change |
| A2 | UAs reserve aspect boxes from width/height attributes consistently | Pattern 4 | None — explicit inline `aspect-ratio` from stored dims is the primary mechanism; attribute behavior is belt-and-suspenders |
| A3 | Cap reference ranges (per-asset bytes ≈ 8-16MB; per-article count ≈ 100-150; per-article total ≈ 100-150MB dev / response-budget-bound prod; pixel cap = 16,777,216 existing) | Stack/Pitfalls | Low — CONTEXT locks exact numbers to corpus measurement; ranges are starting points only, NOT decisions |
| A4 | Animated AVIF is acceptably out of `is-animated` scope this phase | Pitfall 8 | Low-medium — documented residual; rare in longform; revisit on corpus evidence |
| A5 | `fflate zipSync` accepts Uint8Array values alongside strToU8 entries in one call (byte entries) | Pattern 6 | Low — 12-02's `unzipSync` entries map proves the read side; write side is the same API family; verify in Wave 0 unit test |
| A6 | Bounded-concurrency parallel asset fetching (≈4) keeps inline ingest latency acceptable | Pattern 1 | Low — stage is sequential-safe fallback; number is tunable constant |
| A7 | Placeholder default box ratio/height cap (≈3:2, page-relative cap) suits the corpus | Pattern 4 | Low — D20-13 defers exact dimensions to corpus/planner |

## Open Questions

1. **Transport budget arithmetic (dev generosity vs prod 4.5MB)**
   - What we know: Vercel response payload cap 4.5MB [VERIFIED]; dev
     middleware uncapped; D20-11 demands generous caps.
   - What's unclear: whether prod parity matters enough this phase for a
     chunked/streamed asset transport.
   - Recommendation: enforce a total-response asset budget constant (per-figure
     refusal beyond it) + document prod ceiling honestly; streamed transport =
     backlog. Planner should surface the number choice to the user with the
     corpus data (human gate, per D20-11's "corpus-determined" lock).
2. **Markdown relative-src figures: UnsupportedBlock (today) or refused FigureBlock?**
   - What we know: `figureFromImage` maps non-http srcs to UnsupportedBlock
     [VERIFIED: codebase]; D20-06 says failed figures stay FigureBlocks; the
     discretion note expects "calm per-figure refusals".
   - Recommendation: promote to refused FigureBlocks (alt preserved, no src) —
     one placeholder surface everywhere; small markdownToBlocks change. Planner
     confirms.
3. **Very tall/wide figures vs page height**
   - What we know: atomic-oversize guard fires honest fallback when a block
     exceeds 0.75 page [VERIFIED: codebase, Phase 04 decisions].
   - What's unclear: clamp policy (max-height + object-fit letterbox vs no
     clamp) and the number.
   - Recommendation: clamp with `object-fit: contain` so no figure box exceeds
     a page; corpus + UI-spec own the constant. Includes a11y note:
     letterboxed high-detail images lose inspectability at narrow widths —
     acceptable for a reader (no zoom-image lightbox this phase).
4. **Per-book asset disclosure surface**
   - What we know: EPUB path may refuse over-budget chapter figures; D12-11
     disclosed chapter skips via `skippedChapterCount`.
   - What's unclear: whether figure refusals ride
     `ingestionMeta.extractionWarnings` (existing additive array — recommended)
     or a new field.
   - Recommendation: `extractionWarnings` entries (e.g. "2 figures could not be
     included") — zero schema change, existing surfaced channel.
5. **image-size maintenance continuity (repo archived to Codeberg)**
   - What we know: npm package current/stable; repo archived 2026-06
     [VERIFIED: official README banner].
   - Recommendation: accept (finished utility, zero deps, single-seam module);
     note Codeberg as follow-source in the audit comment.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (dev/CI runtime) | server/ pipeline, sniffing | ✓ | 22 LTS line per stack | — |
| Vite dev middleware | /api/ingest (all e2e runs) | ✓ | 8.1.5 | — |
| Vercel Node function | minimal prod deploy | ✓ | deployed (quick task 260821-k6z) | 4.5MB response cap → per-figure refusal (Pitfall 1) |
| image-size | server sniffing | ✗ (to install) | 2.0.2 | none needed — registry-verified |
| is-animated | server animation gate | ✗ (to install) | 2.0.2 | none needed — registry-verified |
| Browser IndexedDB blob storage | asset persistence | ✓ | all 3 CI engines | — |
| Chromium/Firefox/WebKit decode: jpeg/png/webp/gif/avif | render matrix | ✓ | Playwright 1.61.1 engines | — (D20-08 locks to what all three decode natively) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none (the two installs are the phase's
only new environment surface).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| Config file | vitest.config + playwright.config.ts (existing) |
| Quick run command | `npx vitest run tests/unit/server/fetchImageAsset.spec.ts` |
| Full suite command | `npm run test` (honest gate: exit 0, one invocation — 19-05 discipline) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMG-01 | Figures/alt/captions preserved + src rewritten; EPUB un-downgrade | unit + e2e | `npx vitest run tests/unit/server/assetStage.spec.ts` / `npx playwright test tests/e2e/epub-intake.spec.ts tests/e2e/imagery` | ❌ Wave 0 (assetStage) / ✅ exists (epub — updates honestly) |
| IMG-02 | Every limit refuses per-figure calmly (type/svg/animated/bytes/pixels/count/total) | unit | `npx vitest run tests/unit/server/fetchImageAsset.spec.ts` | ❌ Wave 0 |
| IMG-02 | SSRF measures apply to asset fetch (private IP, metadata host, redirect-into-internal, scheme) | unit + e2e | `npx vitest run tests/unit/server/safe-fetch.spec.ts` / ssrf-matrix extension | ✅ exists (extend) |
| IMG-03 | Zero third-party requests on reopen; local render | e2e | `npx playwright test tests/e2e/imagery/offline-reopen.spec.ts` | ❌ Wave 0 |
| IMG-03 | Deletion cascade removes assets (article + book) | unit + e2e | `npx vitest run tests/unit/persistence/assets-cascade.spec.ts` | ❌ Wave 0 |
| IMG-04 | v4 round-trip: build→validate→import with byte-equality; bomb caps; no-broken-refs; conflicts | unit + e2e | `npx vitest run tests/unit/portability/bundle-v4.spec.ts` / portability spec extension | ❌ Wave 0 (unit) / ✅ exists (e2e — extend) |
| IMG-05 | Reserved geometry stable pre/post decode; placeholder both modes; axe on placeholder | e2e | `npx playwright test tests/e2e/imagery/geometry.spec.ts tests/e2e/a11y.spec.ts` | ❌ Wave 0 (geometry) / ✅ (a11y — extend) |
| IMG-06 | Paginated page-count identity across image load; location survives repagination; no clip/duplicate | e2e | `npx playwright test tests/e2e/imagery/geometry.spec.ts tests/e2e/pagination` | ❌ Wave 0 (imagery cells) / ✅ (pagination — extend) |
| IMG-06 | Repagination perf on figure-heavy corpus within budget | e2e (perf harness) | `npm run perf` | ✅ exists (figure-heavy joins corpus) |

### Sampling Rate

- **Per task commit:** the task's targeted spec files (`vitest run <files>` / `playwright test <spec> --project=chromium`)
- **Per wave merge:** `npm run test:unit -- --run` + `npm run test:e2e` (3 engines, fresh dev server — the 15-04 aged-server lesson)
- **Phase gate:** full `npm run test` exit 0 in one invocation, honest counts recorded in the closing plan's OUTPUT (the 04-11/09-07/19-05 permanent-record discipline)

### Wave 0 Gaps

- [ ] `tests/unit/server/fetchImageAsset.spec.ts` — sniff matrix (5 formats × valid/animated/svg/lieing-header/pixel-bomb/EXIF-rotated), every refusal typed (REQ IMG-02)
- [ ] `tests/unit/server/assetStage.spec.ts` — collect/budget/rewrite; per-figure refusal; byte-identity of alt+caption substrate (IMG-01/02)
- [ ] `tests/unit/persistence/assets-cascade.spec.ts` — save atomicity (asset-put failure rolls back article), remove/removeBook cascade, upsert asset replacement (IMG-03)
- [ ] `tests/unit/portability/bundle-v4.spec.ts` — v4 write, v1-3 read, bomb entries, sha256 mismatch, dangling-ref skip, conflict ride (IMG-04)
- [ ] `tests/e2e/imagery/{offline-reopen,geometry,decode-matrix,refusal-matrix}.spec.ts` — the 3-engine matrix cells (IMG-03/05/06)
- [ ] `src/fixtures/figure-assets.ts` + regenerated `figure-heavy.canonical.json` — tiny real bytes per format (jpeg/png/webp/gif/avif + animated samples); generator self-verifying (11-01 precedent)
- [ ] Corpus pins realignment task: library/epub/pagination specs (strengthen-only, 19-05 precedent)

*(Shared fixtures: existing `annotations/_fixtures.ts` harness + `wipeDatabase` beforeEach baseline continue unchanged.)*

## Security Domain

> `security_enforcement: true`, ASVS Level 1, block_on: high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts; local-only data (unchanged) |
| V3 Session Management | no | No sessions (unchanged) |
| V4 Access Control | no | No multi-user surfaces; ingest is a public single-purpose function (unchanged) |
| V5 Input Validation | yes | Zod at every boundary: refined asset-ref union (parse-time scheme guarantee), sniffed-type gate over declared headers, envelope re-validation on the network read, bundle v4 union + per-asset sha256 |
| V6 Cryptography | yes | SHA-256 via Web Crypto/`node:crypto` for assetIds + manifest (existing `sha256Hex` precedents — never hand-rolled) |
| V12 File & Resources | yes | SSRF 9-measure reuse (the asset profile), byte/pixel/count bomb caps, fflate filter-first entry caps, 4.5MB-aware response budget |

### Known Threat Patterns for this phase (STRIDE)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via image URL (second fetch surface) | Tampering/Spoofing | The SAME 9-measure pipeline — scheme/metadata/DNS/IP/per-hop redirect/DNS-pinning reused; no new egress path |
| Tracking beacon on reopen (info disclosure to third parties) | Information Disclosure | Structural: src rewrite + renderer resolves only local blobs; offline e2e abort-guard |
| Decompression/decode bomb (tiny file, huge canvas) | DoS | Pixel cap on SNIFFED headers (65,000×65,000 PNG refuses before store); byte caps pre-store; per-entry zip filter on import |
| Media-type smuggling (SVG as image/png; polyglot) | Tampering → stored XSS | Magic-byte sniff is authoritative; svg + non-raster refuse; no `dangerouslySetInnerHTML` anywhere (lint gate); raster set only |
| MIME/content-length header lies | Tampering | Post-read byteLength re-check (12-04 discipline); sniff over declaration |
| Ingest-response bloat / base64 amplification | DoS | Total-response asset budget; per-asset caps; count caps |
| Bundle asset tampering in transit/at rest | Tampering | Per-asset sha256 in manifest-verified metadata block; mismatch → corrupted refusal (never-throw typing) |
| Zip Slip via crafted asset entry names | Tampering | Entry names are server-generated (`assets/<articleId>/<assetId>`), never attacker-controlled; the existing `isSafeEntryName` guard remains on every read |
| Silent data loss on delete/import (orphan blobs / dangling refs) | Repudiation | One-transaction cascades; no-broken-refs import gate with explicit per-article skip reasons; "annotations never silently re-attach" honesty rule extended to assets |

## Sources

### Primary (HIGH confidence)

- Codebase (read this session): `server/safeFetch.ts`, `server/ingest.ts`, `server/limits.ts`, `server/htmlToBlocks.ts`, `server/epubToBooks.ts`, `server/markdownToBlocks.ts`, `src/content/schema.ts`, `src/ingestion/types.ts`, `src/persistence/db.ts`, `src/persistence/booksStore.ts`, `src/ingestion/LibrarySource.ts`, `src/portability/{bundle,manifest,ExportImportService}.ts`, `src/pagination/splitBlock.ts`, `src/measurement/domMeasurer.ts`, `src/content/render/BlockRenderer.tsx`, `src/fixtures/articles/figure-heavy.canonical.json`, `package.json` — every [VERIFIED: codebase] claim
- `image-size` official README (github.com/image-size/image-size) + npm registry metadata — API, formats, EXIF orientation, limitations, archive notice [VERIFIED]
- `is-animated` official README (npm registry, qzb/is-animated) — GIF/APNG/WebP coverage, API [VERIFIED]
- Vercel Functions Limits (vercel.com/docs/functions/limitations, updated 2026-08-24) — 4.5MB request/response payload cap, 413 behavior [VERIFIED]
- `.planning/phases/20-safe-local-image-fidelity/20-CONTEXT.md` — all D20-01..D20-15 locks
- `.planning/STATE.md` — D7-07/D8-18/D9-14/12-07/17-04/Pitfall 5/Pitfall 9/D17-13/D12-16 precedent contracts

### Secondary (MEDIUM confidence)

- gsd-tools research-plan seam (routed to context7; context7 MCP unavailable this session — served via built-in webfetch fallback per tool-strategy table); digests cached in research-store

### Tertiary (LOW confidence)

- None — every load-bearing claim traces to code, registry+official-README, or official platform docs; residual unknowns are confined to the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — two small pure-JS libs verified against official READMEs + registry + legitimacy seam; everything else already installed and read
- Architecture: HIGH — every integration point read in source; all six requirements map to a named existing mechanism
- Pitfalls: HIGH for codebase-sourced and platform-doc-sourced items; corpus-number items are explicitly deferred to measurement per CONTEXT lock

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (stable domain; package versions pinned exact)
