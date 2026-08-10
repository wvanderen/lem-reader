# Architecture Research: v2.0 Personal Library Integration

**Domain:** Local-first accessible reader + stateless ingestion backend + multi-format document intake + versioned portability
**Researched:** 2026-08-10
**Confidence:** HIGH (substrate) · MEDIUM–HIGH (integration points where the EPUB parser dep and PDF structure-detection are project-specific empirical risks)
**Scope:** This document covers ONLY how the v2.0 Personal Library features integrate with the v1.0 substrate. The v1.0 substrate (canonical 9-kind doc model, grapheme-offset coordinate, Dexie v2, project-owned pagination, measurement engine, W3C-inspired annotation selectors) is treated as fixed and is NOT re-derived here. See `PROJECT.md` §Current State and `src/content/schema.ts` / `src/persistence/db.ts` for the canonical substrate definitions.

---

## How to Read This Document

The eight integration questions in the brief are each answered in a dedicated section, in dependency order:

| § | Question | Section |
|---|----------|---------|
| 1 | Backend shape | [Pattern 1 — Stateless Ingestion Backend](#pattern-1--stateless-ingestion-backend-alongside-the-vite-spa) |
| 2 | HTML → doc-model pipeline | [Pattern 2 — Extraction → Canonical Doc Model](#pattern-2--extraction--canonical-doc-model-pipeline-production-grade) |
| 3 | PDF / EPUB / Markdown mapping | [Pattern 3 — Per-Format Intake Adapters](#pattern-3--per-format-intake-adapters) + [Pattern 4 — EPUB as Book Container](#pattern-4--epub-multi-chapter-as-book-container) |
| 4 | Dexie schema evolution | [Pattern 5 — Dexie Schema v2 → v3](#pattern-5--dexie-schema-evolution-v2--v3) |
| 5 | Library data flow | [Pattern 6 — Personal Library Data Flow](#pattern-6--personal-library-data-flow) |
| 6 | Export/import serialization | [Pattern 7 — Versioned Export/Import Bundle](#pattern-7--versioned-exportimport-bundle-port-0102) |
| 7 | SSRF/XSS boundary | [Pattern 8 — SSRF/XSS Defense-in-Depth Boundary](#pattern-8--ssrfxss-defense-in-depth-boundary) |
| 8 | Build order | [Suggested Build Order](#suggested-build-order) |

The executive summary of new-vs-modified components is in [Component Responsibilities](#component-responsibilities--existing-vs-new).

---

## System Overview

v2.0 adds exactly one new runtime layer (a stateless ingestion backend) and one new data domain (user-ingested articles + library metadata) to the existing v1.0 client-only SPA. The reader, pagination, annotation, and persistence substrates are reused unchanged at the contract level; only the ingestion entry point and the library/listing surfaces are new.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        BROWSER (client-only SPA)                          │
│                                                                          │
│   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐    │
│   │ LibraryView  │   │ ArticleView      │   │ AnnotationReviewPane │    │
│   │ (NEW)        │   │ (v1.0 — reused)  │   │ (NEW — RECV-01)      │    │
│   └──────┬───────┘   └──────┬───────────┘   └──────────┬───────────┘    │
│          │                  │                          │                 │
│   ┌──────┴──────────────────┴──────────────────────────┴───────────┐    │
│   │  ArticleRepository (interface EXTENDED — list/open + save/     │    │
│   │  remove/search/listBySource/listByBook)                        │    │
│   │  ┌─────────────────────┐    ┌──────────────────────────────┐   │    │
│   │  │ FixtureSource       │    │ DexieLibrarySource (NEW)      │   │    │
│   │  │ (v1.0 — bundled     │    │ — user articles + books +     │   │    │
│   │  │ JSON, source=       │    │ tags + ingestion metadata     │   │    │
│   │  │ "fixture")          │    │                               │   │    │
│   │  └─────────────────────┘    └──────────────────────────────┘   │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  v1.0 substrate — UNCHANGED contracts:                          │  │
│   │  • BlockView + InlineRenderer (semantic renderer)               │  │
│   │  • PaginationEngine + LineBoxes + overflowGuard                 │  │
│   │  • Measurement substrate (epoch + fontGate + DOM + Pretext)     │  │
│   │  • Annotation subsystem (capture / resolve / highlightRanges)   │  │
│   │  • SettingsContext + locationStore + highlightsStore + notesStore│ │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│   ┌──────────────────┐         ┌────────────────────────────────┐      │
│   │ IngestionClient  │  fetch  │ ExportImportService (NEW)       │      │
│   │ (NEW — thin)     │────────▶│ (bundle serialize / validate /  │      │
│   │                  │         │ conflict-detect / dry-run)      │      │
│   └────────┬─────────┘         └────────────────────────────────┘      │
└────────────┼─────────────────────────────────────────────────────────┘
             │ HTTPS, same-origin (POST /api/ingest)
             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│           STATELESS INGESTION BACKEND (co-deployed edge function)          │
│                                                                          │
│   onRequest(context) ── /functions/api/ingest.ts                         │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│   │ URL Guard   │─▶│ Fetch (SSRF- │─▶│ Readability  │─▶│ DOMPurify  │  │
│   │ (SSRF block)│  │ safe)        │  │ extract      │  │ sanitize  │  │
│   └─────────────┘  └──────────────┘  └──────────────┘  └─────┬──────┘  │
│                                                            ▼           │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │  Format-specific normalizers (NEW — promoted from v1.0         │    │
│   │  throwaway script, generalized):                               │    │
│   │   htmlToBlocks   markdownToBlocks   pdfToBlocks   epubToBlocks │    │
│   │  Each returns { blocks, footnotes, lang, provenance }          │    │
│   └────────────────────────┬───────────────────────────────────────┘    │
│                            ▼                                            │
│                   ArticleSchema.parse(...)  (Zod-at-boundary)            │
│                            │                                            │
│                            ▼                                            │
│                   Response<CanonicalArticle JSON>                       │
│                            │ (server owns NO identity, NO library state) │
└────────────────────────────┼────────────────────────────────────────────┘
                             ▼
              Client receives Article, persists to Dexie via
              DexieLibrarySource.save(article, ingestionMeta)
```

### Component Responsibilities — Existing vs New

| Component | Status | Responsibility | Integration Notes |
|-----------|--------|----------------|-------------------|
| **Vite 8 static SPA build** | UNCHANGED | `vite build` produces the static client | The `/functions` dir at project root is the only addition; it does NOT enter the client bundle |
| **`src/content/schema.ts`** (Zod doc model) | EXTENDED (additive) | 9 block kinds + 4 inline marks + Provenance + Article; XSS-safe by construction | Add `ArticleSource` enum discriminator + `IngestionMeta` sub-schema + `BookSchema` (EPUB). Existing `ArticleSchema` shape is unchanged for v1.0 fixtures (backward-compatible via defaults) |
| **`src/content/repository.ts`** | EXTENDED | Was `list/open`; becomes `list/open/save/remove/search/listBySource/listByBook` | `inMemoryRepository` (fixtures) becomes one of two sources; a new `compositeLibraryRepository` unions fixture + Dexie |
| **`src/persistence/db.ts`** | EXTENDED (Dexie v3 block) | Was v1/v2 reserved schema | Append `this.version(3).stores({...})` adding `source`, `addedAt`, `bookId` indexes on `articles`; new `books`, `tags`, `articleTags` stores. v1/v2 blocks byte-unchanged (Pitfall 9) |
| **`src/pagination/`** | UNCHANGED | Project-owned pagination engine | Ingested articles paginate identically because they ARE the same `CanonicalArticle` shape — the engine doesn't know or care where blocks came from |
| **`src/measurement/`** | UNCHANGED | Staleness-safe measurement substrate | Same — operates on the rendered Block tree, not on provenance |
| **`src/annotations/`** | UNCHANGED | W3C selectors over grapheme substrate | Same — highlights/notes anchor to normalized-text offsets; ingested articles support identical annotation semantics |
| **`src/reader/BlockView` + `InlineRenderer`** | UNCHANGED | Semantic renderer | Same — renders Block tree regardless of source |
| **`src/routes/FixtureList.tsx`** | REPLACED by `LibraryView` | Was the corpus entry; becomes the personal library list | Hash route `#/library` (was implicit `#/`); article route unchanged. LibraryView consumes `compositeLibraryRepository.list()` |
| **`src/routes/ArticleView.tsx`** | UNCHANGED | Reader surface | Identical for fixture and ingested articles (both are `CanonicalArticle`) |
| **`/functions/api/ingest.ts`** | NEW | Stateless ingestion endpoint | Receives `{ url? \| html? \| file? }`, returns validated `CanonicalArticle[]` (one per article; multi-article for EPUB books) |
| **`src/ingestion/IngestionClient.ts`** | NEW (client) | Thin fetch wrapper for `/api/ingest` | Calls backend, surfaces honest-failure reasons (extraction-too-low-confidence, unsupported-format, fetch-failed, SSRF-blocked) |
| **`src/ingestion/LibrarySource.ts`** (Dexie-backed) | NEW (client persistence) | Saves/removes ingested articles + books + tags | Reuses Dexie v3 schema; same Zod validation at boundary as settings/location/highlights |
| **`src/library/LibraryView.tsx`** | NEW | List / search / tag / remove UI | Replaces FixtureList; same hash-router pattern, same a11y contracts |
| **`src/library/IngestArticleForm.tsx`** | NEW | URL paste + file-upload UI | Honesty-first copy: surfaces extraction confidence + unsupported-content disclosure |
| **`src/library/AnnotationReviewPane.tsx`** | NEW (RECV-01) | Cross-article highlights/notes review | Queries `highlightsStore` + `notesStore` across all articles (compound index already supports `[articleId+revision]` range) |
| **`src/portability/ExportImportService.ts`** | NEW (PORT-01/02) | Bundle serialize / parse / validate / conflict-detect | Pure functions over the existing Zod schemas; produces `lem-reader-export-v1.json[.gz]` |
| **Server-side `htmlToBlocks` / `markdownToBlocks` / `pdfToBlocks` / `epubToBlocks` normalizers** | NEW (server) | Format → Block tree | Promoted + generalized from the v1.0 throwaway `linkedom` script. Each is a pure function returning `{ blocks, footnotes, lang, provenance }` validated by `ArticleSchema.parse()` |

---

## Recommended Project Structure

```
lem-reader/
├── src/                              # CLIENT (Vite SPA — unchanged build)
│   ├── content/                      # v1.0 substrate — doc model
│   │   ├── schema.ts                 # EXTENDED additively (ArticleSource, IngestionMeta, BookSchema)
│   │   ├── types.ts
│   │   ├── normalizeText.ts          # UNCHANGED — grapheme substrate
│   │   └── repository.ts             # EXTENDED interface (save/remove/search)
│   ├── persistence/                  # v1.0 substrate — Dexie
│   │   ├── db.ts                     # EXTENDED with version(3) block (Pitfall 9 — additive)
│   │   ├── settingsStore.ts          # UNCHANGED
│   │   ├── locationStore.ts          # UNCHANGED
│   │   ├── highlightsStore.ts        # UNCHANGED
│   │   ├── notesStore.ts             # UNCHANGED
│   │   └── libraryStore.ts           # NEW — articles-source/books/tags/articles-tags stores
│   ├── ingestion/                    # NEW — client ingestion glue
│   │   ├── IngestionClient.ts        # fetch('/api/ingest', ...) + honest-failure mapping
│   │   ├── LibrarySource.ts          # Dexie-backed ArticleRepository impl for user articles
│   │   └── types.ts                  # IngestionRequest, IngestionResponse, IngestionFailureReason
│   ├── library/                      # NEW — library surface (replaces FixtureList as default route)
│   │   ├── LibraryView.tsx           # list + search + tag + remove
│   │   ├── IngestArticleForm.tsx     # URL paste + file upload
│   │   ├── LibraryCard.tsx           # one article row (title, source badge, addedAt, tags)
│   │   ├── AnnotationReviewPane.tsx  # RECV-01 — cross-article annotations surface
│   │   └── library.css               # themed by the same tokens as reader/
│   ├── portability/                  # NEW — PORT-01/02
│   │   ├── ExportImportService.ts    # bundle serialize/parse/validate/conflict-detect
│   │   ├── bundle.ts                 # ExportBundleSchema (Zod)
│   │   └── conflicts.ts              # dry-run preview + import resolution
│   ├── reader/                       # v1.0 substrate — UNCHANGED
│   ├── pagination/                   # v1.0 substrate — UNCHANGED
│   ├── measurement/                  # v1.0 substrate — UNCHANGED
│   ├── annotations/                  # v1.0 substrate — UNCHANGED
│   ├── settings/                     # v1.0 substrate — UNCHANGED
│   ├── routes/                       # hash router (route table EXTENDED, ArticleView unchanged)
│   │   ├── LibraryView.tsx           # REPLACES FixtureList as default route
│   │   └── ArticleView.tsx           # UNCHANGED
│   ├── a11y/                         # UNCHANGED
│   └── fixtures/                     # UNCHANGED — still bundled JSON, source: "fixture"
├── functions/                        # NEW — Cloudflare Pages Functions (server root, NOT in /dist)
│   ├── api/
│   │   └── ingest.ts                 # onRequest — orchestrates the pipeline
│   └── _middleware.ts                # CORS + content-length guard + rate-limit hint
├── server/                           # NEW — server-only library code (imported by functions/)
│   ├── normalize/
│   │   ├── htmlToBlocks.ts           # Readability + DOMPurify + DOM walk → Block tree
│   │   ├── markdownToBlocks.ts       # remark/mdast walk → Block tree
│   │   ├── pdfToBlocks.ts            # unpdf extractTextItems → Block tree
│   │   ├── epubToBooks.ts            # epub2 chapters → multiple Articles + a Book record
│   │   ├── shared.ts                 # text/inline-run helpers + unsupported-disclosure factory
│   │   └── __fixtures__/             # representative corpus for each format (CI regression)
│   ├── fetch/
│   │   ├── safeFetch.ts              # SSRF guard: scheme allowlist + private-IP blocklist + DNS pin
│   │   └── limits.ts                 # maxBytes, maxPages, timeoutMs, content-type allowlist
│   └── index.ts                      # pipeline entry: format-dispatch → normalize → ArticleSchema.parse
├── tests/
│   ├── e2e/
│   │   ├── library/                  # NEW — library flows across chromium/firefox/webkit
│   │   ├── ingestion/                # NEW — URL+HTML+PDF+EPUB+MD happy/failure paths
│   │   └── portability/              # NEW — export/import round-trip + conflict detection
│   └── unit/
│       ├── server/                   # NEW — normalizer unit tests (per-format)
│       └── ...                       # v1.0 unit tests UNCHANGED
├── wrangler.toml                     # NEW — Cloudflare Pages config (compatibility flags, bindings)
├── vite.config.ts                    # EXTENDED — server.proxy for local /api/ingest → wrangler dev
└── package.json                      # deps add: @mozilla/readability, isomorphic-dompurify,
                                      #   unpdf, epub2, zipfile, remark, remark-parse (server-only)
                                      #   [all gated behind server-only entry — NOT in client bundle]
```

### Structure Rationale

- **`/functions` at project root (Cloudflare Pages convention):** Cloudflare's file-based router treats `functions/api/ingest.ts` as the `POST /api/ingest` route. It is co-deployed with the SPA static build and is same-origin by default (no CORS configuration). It MUST sit outside `/dist` and outside the Vite client graph so it never enters the client bundle.
- **`/server` is server-only library code:** The format normalizers and SSRF guard are imported only by `functions/`. Vite's client build never sees them. This is the single seam that keeps the client bundle small and the static-build contract unchanged.
- **`src/ingestion` is the client mirror:** The thin client glue (IngestionClient fetch wrapper + DexieLibrarySource persistence) lives in the client tree because it reads/writes Dexie.
- **v1.0 substrate folders are untouched:** `reader/`, `pagination/`, `measurement/`, `annotations/`, `settings/`, `fixtures/`, `a11y/` are byte-stable. This is the load-bearing constraint: ingestion work MUST NOT break the substrate.

---

## Architectural Patterns

### Pattern 1 — Stateless Ingestion Backend alongside the Vite SPA

**What:** The v2.0 backend is a stateless edge function (one `onRequest` handler) that receives an ingestion request, performs fetch + extract + normalize, and returns one or more validated `CanonicalArticle` JSON objects. It owns **no identity** (the client generates article ids) and **no library state** (the client persists to Dexie).

**When to use:** Whenever ingesting content from a URL or parsing an uploaded file requires HTML parsing, sanitization, or PDF/EPUB decoding that must not run in the client (security, bundle size, or runtime reasons).

**Recommendation: Cloudflare Pages Functions** co-deployed with the static SPA.

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **(a) Separate Node service (Express/Fastify on a VM/container)** | REJECT | Operationally heavier than the workload warrants; an always-on server for a stateless transform is overkill; introduces CORS, auth-boundary, and uptime concerns v1.0 deliberately avoided |
| **(b) Serverless/edge functions co-deployed (Cloudflare Pages Functions / Vercel Edge / Netlify Functions)** | **CHOOSE — Cloudflare Pages Functions** | Stateless fetch+extract+normalize is the textbook edge-function workload. Same-origin by default — no CORS configuration needed. The SPA's `connect-src` CSP stays `'self'`-only. Free tier comfortably covers prototype load. No always-on cost. Vite static build is untouched |
| **(c) Vite SSR / middleware / dev-server proxy as production** | REJECT | Turns the SPA into an SSR app, which v1.0 deliberately is not (STACK.md: "do not add an SSR framework"). Forces a server runtime on every environment. The dev-server proxy is fine for *local development only* (see below) |

**Why Cloudflare over Vercel/Netlify:** all three are architecturally equivalent for this workload. Cloudflare Pages Functions has the most generous free tier for stateless fetch-heavy workloads, the cleanest co-deployment story with a Vite static build (`/functions` dir at project root), and Workers' native `fetch` is well-tuned for the SSRF-safe fetching pattern in [Pattern 8](#pattern-8--ssrfxss-defense-in-depth-boundary). Vercel Edge Functions are equally viable; the choice is operational, not architectural. **The architecture does not depend on which platform is chosen** — only on the workload being a stateless, same-origin, fetch+transform endpoint.

**How the SPA calls it:**

```typescript
// src/ingestion/IngestionClient.ts
export async function ingestUrl(url: string): Promise<CanonicalArticle> {
  const res = await fetch("/api/ingest", {                  // SAME-ORIGIN
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "url", url }),
  });
  if (res.status === 400) {
    const { reason } = await res.json() as { reason: IngestionFailureReason };
    throw new IngestionError(reason);                       // honest failure surface
  }
  if (!res.ok) throw new IngestionError("server-error");
  const article = await res.json();
  return ArticleSchema.parse(article);                      // Zod-at-boundary re-validate
}
```

**CORS:** none. The function is same-origin (served from the same Pages deployment).

**CSP changes (client `index.html`):**

```http
# v1.0 (approximate)
Content-Security-Policy: default-src 'self'; img-src 'self' https: data:; ...

# v2.0 — connect-src explicitly 'self' (NO new external domains)
Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' https: data:; ...
```

The CSP **tightens**, not loosens. The only external `img-src https:` is preserved because remote article figures are referenced by URL (already true in v1.0 fixtures).

**Local development:** `vite.config.ts` adds a `server.proxy` entry mapping `/api` to a local `wrangler pages dev` process (or `vite-plugin-cloudflare`). The SPA dev server talks to the same path in dev as in production; no environment branching in application code.

**Trade-offs:**
- **Pro:** SPA build unchanged; no CORS; CSP tightens; no always-on cost; SSRF defense is server-authoritative; security updates land once on the server.
- **Con:** Vendor platform coupling (mitigated by keeping all server code in `/server` so it can be ported to Vercel/Netlify/Node-with-Express by changing only `/functions`).
- **Con:** Cold starts on serverless (negligible for Cloudflare Workers — typically <5ms; materially worse on Lambda-based Netlify Functions, which is a secondary reason to prefer Cloudflare).

---

### Pattern 2 — Extraction → Canonical Doc Model Pipeline (production-grade)

**What:** The v1.0 normalizer was a throwaway `linkedom` script run at **build time** over a curated corpus. For v2.0 it must become a **production-grade, server-side, runtime pipeline** that turns arbitrary HTML (from a fetched URL or an uploaded file) into the exact 9-kind Block tree `ArticleSchema` requires.

**When to use:** Every URL and HTML-file ingestion. (PDF / EPUB / Markdown have their own format-specific adapters in [Pattern 3](#pattern-3--per-format-intake-adapters) but converge on the same pipeline output.)

**Where normalization runs: SERVER, at ingest time.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Server-side normalization at ingest time** | **CHOOSE** | (1) SSRF/XSS boundary is server-authoritative — the client never sees raw fetched HTML. (2) Canonical-Article JSON is small (text + structural metadata) and cheap to ship — much smaller than the original page. (3) Sanitization is one place, audited once. (4) CPU cost of Readability + DOMPurify + DOM walk is not felt by the reader's device. (5) The persisted object is XSS-safe by construction — see [Pattern 8](#pattern-8--ssrfxss-defense-in-depth-boundary) |
| Client-side normalization (post-fetch in the SPA) | REJECT | Reader fetches arbitrary cross-origin HTML → CORS-impossible without a proxy anyway; CSP must allow the third-party origin; XSS attack surface moves into the persistence layer; bundle must ship Readability + jsdom-equivalent (~hundreds of KB) |
| Build-time pre-normalization | REJECT (already rejected in v1.0 for production use) | Works only for a closed corpus; the entire v2.0 premise is reader-supplied URLs |

**Pipeline (4 stages, all server-side):**

```
1. FETCH            safeFetch(url) → { html, finalUrl, contentType, hash }
                     (SSRF guard, scheme allowlist, size cap, content-type allowlist;
                      see Pattern 8)

2. EXTRACT          const jsdomDoc = new JSDOM(html, { url: finalUrl });
                     if (!isProbablyReaderable(jsdomDoc.window.document))
                       return ingestionFailure("extraction-too-low-confidence");
                     const article = new Readability(jsdomDoc.window.document, {
                       serializer: (el) => el,             // keep DOM, not string
                     }).parse();
                     // article.content is a DOM element; article.title/byline/lang/
                     // publishedTime/except populate Provenance

3. SANITIZE         const clean = DOMPurify.sanitize(article.content, {
                       USE_PROFILES: { html: true },
                       ALLOWED_TAGS: SANITIZATION_ALLOWLIST,    // only what maps to a Block kind
                       ALLOWED_ATTR: ["href", "title", "alt", "src", "cite"],
                       FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
                     });
                     clearWindow();                           // release jsdom state (long-running worker)

4. WALK → BLOCKS    const { blocks, footnotes } = htmlToBlocks(clean, finalUrl);
                     // recursive DOM walker mapping:
                     //   h1..h6         → HeadingBlock (level)
                     //   p              → ParagraphBlock
                     //   blockquote     → BlockquoteBlock (children recursive)
                     //   ul             → BulletedListBlock (items → content recursive)
                     //   ol             → NumberedListBlock (items → content recursive, start)
                     //   img/figure     → FigureBlock (alt required; src httpUrl only)
                     //   pre/code       → CodeBlock (language from class)
                     //   a/code/strong/em → InlineRun marks
                     //   anything else  → UnsupportedBlock { originalKind, plainDescription }
                     //                     (DOC-06 disclosure — REUSED for ingested content)
```

**How v1.0 block kinds are preserved from arbitrary web HTML:** the DOM walker in stage 4 is a strict 1:1 mapping table. There are exactly 9 outputs. Anything that doesn't match becomes an `UnsupportedBlock` carrying the original tag name and a human-written `plainDescription` ("a table with 4 columns was omitted", "an embedded video was omitted"). This is exactly the v1.0 DOC-06 disclosure, **reused not reinvented**. The walker produces a deterministic Block tree regardless of how chaotic the source HTML is — by construction.

**How the `unsupported` disclosure is reused:** identically. The v1.0 `unsupported-case` fixture already exercises this for tables and embeds; the ingested-HTML path emits the same `kind: "unsupported"` blocks. The reader sees "This section contained [a table] that the reader omitted" — same copy, same component, same a11y semantics. **The disclosure is the failure mode**, not a silent drop.

**Confidence surfacing (honest failure):** Readability doesn't return a confidence number, but `isProbablyReaderable` is a cheap pre-check, and we add a derived signal: `extractionConfidence = blockCount >= 3 && textLength >= 500 ? "high" : "low"`. The client surfaces this in the library card and on first open. If `extractionConfidence === "low"` OR unsupported-block ratio > some threshold, the UI shows a "this extraction may be incomplete" banner — same pattern as the pagination fallback banner (D4-XX). Honest failure is reused, not reinvented.

**Output:** `{ blocks, footnotes, lang, provenance }` → `ArticleSchema.parse(...)` → returns validated `CanonicalArticle`. The client then assigns identity (slug from URL or reader-edited), persists via `libraryStore.save()`.

**Trade-offs:**
- **Pro:** Substrate unchanged — the Block tree IS the substrate. Pagination, measurement, annotation, location, highlights, notes ALL work on ingested articles identically to fixtures because they're the same `CanonicalArticle` shape.
- **Pro:** XSS defense is structural — no HTML is persisted; only typed Block trees with scheme-allowlisted URLs.
- **Pro:** jsdom runs only on the server; client bundle stays small.
- **Con:** Server CPU per ingest (mitigated by edge function cold-start characteristics).
- **Con:** Some sites will extract poorly (paywalled, JS-rendered, or anti-scraping). Honest failure surface is the mitigation — never silently degrade.

---

### Pattern 3 — Per-Format Intake Adapters

**What:** HTML, Markdown, PDF, and EPUB each have a format-specific adapter that converts the source into the canonical Block tree. All adapters share the same output contract `{ blocks, footnotes, lang, provenance }` and all are validated by `ArticleSchema.parse()`.

**When to use:** Each intake format has its own adapter, dispatched by content-type or file extension at `/api/ingest`.

| Format | Library (verified) | Adapter | Risk | Sequencing |
|--------|--------------------|---------|------|------------|
| **HTML (URL or upload)** | `@mozilla/readability` 0.6.0 + `isomorphic-dompurify` 3.22.0 (server-side, jsdom) | `htmlToBlocks` — Pattern 2 | LOW — both libraries are SOTA, current, and Mozilla-recommended-pair | Phase 7–8 (PROVEN FIRST) |
| **Markdown (upload)** | `remark`/`remark-parse` 15.x (unified collective, ESM-only) — parse to mdast, walk directly | `markdownToBlocks` — mdast node → Block kind is mechanical: `heading`→Heading, `paragraph`→Paragraph, `list`→BulletedList/NumberedList, `blockquote`→Blockquote (recursive), `code`→CodeBlock, `image`→Figure, inline `link`/`strong`/`emphasis`/`inlineCode`→marks | LOWEST — well-typed AST, no sanitizer needed (mdast has no HTML by default; if raw HTML embeds are allowed by a markdown extension, route through htmlToBlocks) | Phase 8 (with HTML) OR Phase 11 |
| **PDF (upload)** | `unpdf` 1.8.0 (serverless PDF.js v5.6.205 wrapper; runs in CF Workers; explicit "Processing Untrusted PDFs" guidance — `maxImageSize`, `numPages` cap, timeout race) | `pdfToBlocks` — `extractTextItems()` returns positioned items with `fontSize`/`y`/`hasEOL`; group items into paragraphs by vertical gap; promote to Heading when fontSize > body by a threshold; figures/tables → `UnsupportedBlock` | MEDIUM — pure-text PDFs work well; multi-column, scanned, or heavy-design PDFs will degrade. **One article per PDF for MVP** (chapter detection via font-size hierarchy is unreliable and deferred) | Phase 11 (after URL+HTML proven) |
| **EPUB (upload)** | `epub2` 3.0.2 — **UNMAINTAINED** (last published 3+ years ago) but 170K weekly downloads and 66 dependents; the best Node parser available. Isolate behind an adapter so the dep can be swapped. (`epubjs` 0.3.93 is a browser RENDERER, not just a parser — heavier than needed and also unmaintained) | `epubToBooks` — `EPub.createAsync(file)` → `epub.flow` is the chapter list → for each chapter `getChapter(id)` returns HTML → route through `htmlToBlocks` → produce one Article per chapter sharing a `bookId`. See Pattern 4 for the multi-chapter doc-model decision | HIGHEST — unmaintained parser; UTF-8 only; needs validation against real EPUBs before promotion. **Sequenced LAST** per the user's URL+HTML-first intent | Phase 12 (last) |

**Anti-fragility pattern (shared across all adapters):** every adapter is a pure function `formatSpecificInput → { blocks, footnotes, lang, provenance }`. The pipeline dispatcher (`server/index.ts`) validates the output with `ArticleSchema.parse()` before returning. A malformed adapter output fails loudly at the server boundary, never reaches the client.

**The unsupported-content disclosure (DOC-06) is the shared failure substrate** for every adapter. Anything a format-specific adapter cannot map — a PDF figure, an EPUB sidebar, a Markdown raw-HTML block — becomes an `UnsupportedBlock` with a `plainDescription`. The reader always knows what was omitted.

**Trade-offs:**
- **Pro:** One shared output contract → one substrate. No per-format branches in the renderer, pagination, annotation, or location code.
- **Pro:** Adapters are independently testable against representative corpora (per-format `__fixtures__/`).
- **Con:** Format-specific quality is bounded by the underlying library (PDF structure detection, EPUB chapter fidelity).

---

### Pattern 4 — EPUB Multi-Chapter as Book Container

**The load-bearing design question.** EPUB is a multi-CHAPTER book; the v1.0 doc model is article-oriented with a single linear Block sequence and a single normalized-text coordinate substrate.

**Three options considered:**

| Option | Description | Substrate impact | Verdict |
|--------|-------------|------------------|---------|
| **A. One article per chapter + lightweight `Book` grouping record** | Each chapter becomes its own `CanonicalArticle` row sharing a `bookId`. A new `books` Dexie store holds `{ id, title, authors, chapterArticleIds[], coverImage? }`. Library groups chapters under their book. Reading location is per-chapter. Highlights/notes are per-chapter. | **NONE.** The 9-kind Block model, the grapheme-offset substrate, the pagination engine, the annotation selectors, the location record, and the highlights/notes schemas are all byte-stable. The book concept is a *thin grouping record* in a new Dexie store that does not touch any existing store. | **CHOOSE** |
| **B. Extend doc model with a `Book` container** | Add a top-level `BookSchema` holding `chapters: Article[]`. Renderer learns to walk chapters. Location becomes `(bookId, chapterId, graphemeOffset)`. Highlights become `(bookId, chapterId, position, quote)`. | **MAJOR.** New top-level schema; renderer changes; compound coordinate breaks the single-offset substrate; annotation selector semantics change; location store schema migrates | REJECT — breaks the substrate contract for a feature that can be expressed more simply |
| **C. Flatten the whole book into one big article** | Concatenate chapters with H1 dividers into one Block sequence. | **NONE at the schema level, but functional damage:** chapter boundaries (publisher intent) lost; normalized text becomes massive (memory + pagination cost on long books); reading location fine-grained in a 100k-grapheme document is awkward; "next chapter" affordance impossible | REJECT — destroys publisher structure and harms UX |

**Recommendation: Option A.** EPUB becomes a thin orchestration over the article pipeline.

**Why Option A wins:**

1. **Zero substrate churn.** Every v1.0 guarantee (grapheme-offset stability across repagination/mode/typography/reopen, tri-state annotation resolution, pagination exactly-once/canonical-order, fallback banner) holds unchanged for every chapter because every chapter IS a `CanonicalArticle`. The pagination engine does not know it's paginating chapter 7 of a book.

2. **Highlight scope matches reader behavior.** Real readers annotate within a chapter; cross-chapter highlights are vanishingly rare and semantically awkward (which chapter owns the anchor?). Chapter-scoped annotations are the right granularity.

3. **Reading location granularity is right.** "Resume in chapter 7 at offset 1,243" is exactly what a reader expects. Per-chapter location is already what the v1.0 `LocationRecord` (`[articleId+revision]` compound key) supports — `articleId` simply becomes the chapter article id.

4. **The library surface composes naturally.** A book is "a tagged collection with a title and an ordered chapter list" — `LibraryView` groups chapters under their book card the same way it groups tagged articles.

5. **EPUB ingestion reuses the HTML pipeline.** Each EPUB chapter is XHTML — `epubToBooks` calls `htmlToBlocks` per chapter. The format-specific risk is isolated to `epub2` parsing + chapter extraction, not to the doc model.

**What's new for Option A:**

```typescript
// src/content/schema.ts — additive
export const ArticleSourceSchema = z.enum([
  "fixture", "url", "html-upload", "markdown", "pdf", "epub-chapter",
]);
export type ArticleSource = z.infer<typeof ArticleSourceSchema>;

export const IngestionMetaSchema = z.object({
  source: ArticleSourceSchema,
  sourceUrl: z.string().url().optional(),      // present for source: "url"
  originalHtmlHash: z.string(),                // SHA-256 of fetched HTML or file content
  fetchedAt: z.string().datetime().optional(),
  extractionConfidence: z.enum(["high", "low"]),
  extractionWarnings: z.array(z.string()).default([]),  // e.g. "3 unsupported blocks omitted"
  bookId: z.string().optional(),               // present for source: "epub-chapter"
  chapterIndex: z.number().int().min(0).optional(),     // order within the book
});

export const BookSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  authors: z.array(z.string()).default([]),
  language: z.string().min(2),
  chapterArticleIds: z.array(z.string().regex(/^[a-z0-9-]+$/)),  // ordered
  coverSrc: httpUrl.optional(),
  source: z.literal("epub-upload"),
  originalFileHash: z.string(),
});
```

**Article gains an optional `ingestionMeta` field** (defaults to `{ source: "fixture", ... }` for backward compatibility with v1.0 fixtures — the union-with-defaults pattern already used for `readingMode` in `ReaderSettingsSchema`).

**Library UX:** books and standalone articles live in one unified list; books expand to show their chapter articles. "Open book" opens the first unfinished chapter (or the last-read chapter, via the location store).

**Trade-offs:**
- **Pro:** Zero substrate churn; chapter granularity matches reader behavior; EPUB ingestion reuses the HTML pipeline.
- **Con:** Library surface must learn the book-grouping concept (small new component, not a substrate change).
- **Con:** A reader who wants a "whole-book progress" indicator needs a derived computation across chapter locations — a Phase 12+ refinement, not a v2.0 blocker.

---

### Pattern 5 — Dexie Schema Evolution (v2 → v3)

**What:** The Dexie schema is extended additively to hold user-ingested articles, books, and tags alongside v1.0 fixtures and existing stores. The v1 and v2 version blocks are byte-unchanged (Pitfall 9 — never edit a shipped version block).

**When to use:** v2.0 introduces user-ingested articles as first-class persisted rows (v1.0 reserved the `articles` store but never wrote to it — fixtures are bundled JSON).

**New store vs reuse `articles` with a discriminator?**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| New `userArticles` store separate from `articles` | REJECT | Bifurcates the library surface; every query must UNION two stores; fixtures vs user articles have identical shape — there is no schema reason to split |
| **Reuse `articles` store with a `source` discriminator field + new indexes** | **CHOOSE** | One store, one shape, one repository. Fixtures become `source: "fixture"` rows (or stay bundled and the repository unions in-memory fixtures + Dexie user articles at query time — see below) |

**Recommended fixture-handling strategy: BUNDLED + UNION (no fixture migration).**

v1.0 fixtures stay as bundled JSON (`src/fixtures/*.canonical.json`) validated at module load (Pitfall 8 — never load fixtures via a runtime fetch). The `compositeLibraryRepository.list()` UNIONs in-memory fixtures (tagged `source: "fixture"`) with Dexie user articles. This avoids a one-time fixture-seeding migration entirely. The reader sees a unified library; fixtures appear with a "Sample" badge.

**Dexie v3 schema (additive append — v1/v2 blocks byte-unchanged per Pitfall 9):**

```typescript
// src/persistence/db.ts — EXTENDED
this.version(3).stores({
  // articles: existing primary + indexes unchanged; ADD source, addedAt, bookId indexes
  // (Dexie indexes are cheap; only the primaryKey change would require a migration)
  articles: "id, revision, source, addedAt, bookId",
  settings: "key",                                  // unchanged
  location: "[articleId+revision]",                 // unchanged
  highlights: "id, [articleId+revision]",           // unchanged
  notes: "id, highlightId",                         // unchanged
  // NEW stores for v2.0
  books: "id, title",                               // EPUB book groupings
  tags: "++id, &slug",                              // tag definitions (auto-increment id, unique slug)
  articleTags: "[articleId+tagId], articleId, tagId", // many-to-many join (compound key)
});
```

**Migration story (v2 → v3):**

- **No data migration is required.** The `articles` store in v2 was reserved but never written (fixtures are bundled JSON). Adding indexes (`source`, `addedAt`, `bookId`) is purely additive — Dexie re-indexes on next open without touching existing rows.
- **`preferences` (`settings` store) is unaffected.** The composite `reader-prefs` record keeps its `schemaVersion: 1|2` union (no settings shape change in v2.0). The existing `.default("paginated")` mechanism for `readingMode` is the model for any future additive settings field.
- **`location`, `highlights`, `notes` stores are byte-unchanged** — they already use the `[articleId+revision]` compound key pattern that works identically for fixture and ingested articles.
- **New stores (`books`, `tags`, `articleTags`) start empty.** No migration needed.
- **Pitfall 9 (forward-compat):** v3 declares ALL stores (not just the new ones), mirroring the v2 declaration pattern. The first three blocks (v1, v2, v3) form a strictly-append chain. A v4 block in a future milestone will append again without touching v3.

**Why this works without data migration:** every v1.0 guarantee is preserved by the additive-only discipline. Existing readers' settings, locations, highlights, and notes survive the v2 → v3 transition with zero row-level migration. New v2.0 reads/writes go through the same Zod-at-boundary discipline (every row validated on read).

**Recovery semantics (STATE-04/05):** the existing `storageState` recovery surface ("unavailable" / "corrupt" / "unupgradeable") covers the v3 migration automatically — if Dexie can't open v3 (e.g., partial browser data corruption), the same `<StorageBanner>` / `<WipeConfirm>` UI surfaces. **No new recovery code needed.**

**Trade-offs:**
- **Pro:** Zero data migration risk.
- **Pro:** Existing `storageState` recovery path is reused.
- **Pro:** Fixtures stay build-time-validated (Pitfall 8 preserved).
- **Con:** The `compositeLibraryRepository.list()` UNION has a small per-query cost (negligible at fixture scale; the heavy lifting is Dexie indexing on user articles).

---

### Pattern 6 — Personal Library Data Flow

**What:** The library list/browse/search/tag/remove surface consumes the Dexie `articles` store (plus bundled fixtures via UNION) through an extended `ArticleRepository` interface. New `LibraryView` replaces `FixtureList` as the default route.

**When to use:** All library interactions in v2.0.

**Repository interface extension (existing contract preserved, new methods added):**

```typescript
// src/content/repository.ts — EXTENDED
export interface ArticleRepository {
  // v1.0 — UNCHANGED signatures
  list(): Promise<CanonicalArticle[]>;
  open(id: string): Promise<CanonicalArticle | null>;

  // v2.0 — NEW (additive; v1.0 callers don't see these)
  listLibrary(): Promise<LibraryEntry[]>;                    // headers only (no blocks); fixtures + user
  listByBook(bookId: string): Promise<CanonicalArticle[]>;   // ordered chapters
  search(query: string): Promise<LibraryEntry[]>;            // title + author + sourceUrl substring
  save(article: CanonicalArticle, meta: IngestionMeta): Promise<void>;
  remove(id: string): Promise<void>;                         // cascade: also removes location, highlights,
                                                             // notes, articleTags rows for this articleId
  tag(id: string, tagSlug: string): Promise<void>;
  untag(id: string, tagSlug: string): Promise<void>;
  listTags(): Promise<Tag[]>;
}
```

**`LibraryEntry`** is a lightweight header (no Block tree, no body text) for list rendering:

```typescript
export const LibraryEntrySchema = z.object({
  id: z.string(),
  title: z.string(),                         // from provenance.title
  author: z.string().optional(),
  source: ArticleSourceSchema,
  sourceUrl: z.string().url().optional(),
  addedAt: z.string().datetime(),            // first-ingested timestamp
  extractionConfidence: z.enum(["high", "low"]),
  bookId: z.string().optional(),
  chapterIndex: z.number().int().min(0).optional(),
  coverSrc: httpUrl.optional(),
  tags: z.array(z.string()).default([]),     // tag slugs
  excerpt: z.string(),                       // first ~200 chars of normalized text
  blockCount: z.number().int().min(0),
});
```

**`compositeLibraryRepository`** is the production implementation: it composes `inMemoryRepository` (v1.0, fixtures — unchanged) with a new `DexieLibrarySource` (v2.0, user articles + books + tags). At query time it UNIONs fixture entries (tagged `source: "fixture"`) with Dexie entries, sorts by `addedAt` (fixtures get a fixed early timestamp so they appear first by default), and returns `LibraryEntry[]`.

**Where ingestion metadata lives:** on the `articles` row itself, in an `ingestionMeta` sub-object (per [Pattern 4](#pattern-4--epub-multi-chapter-as-book-container)). Indexed via the `source` Dexie index for fast filtering. The `extractionConfidence` and `extractionWarnings` fields drive the library card UI and the first-open "this extraction may be incomplete" banner.

**New components vs extending v1.0 FixtureList:**

| Surface | Status | Notes |
|---------|--------|-------|
| `FixtureList.tsx` | REPLACED by `LibraryView.tsx` | The fixture list was a 6-row static list with no search/tags/remove; the library surface needs search, tags, removal, ingestion entry, and book grouping. Replacement is cleaner than retrofitting. The a11y contracts (semantic landmark, focus order, keyboard navigation) carry over. |
| `LibraryView.tsx` | NEW | Default hash route `#/library` (was implicit `#/`). Consumes `compositeLibraryRepository.listLibrary()`. Reuses the v1.0 `.status` announce pattern for "added 1 article", "removed 1 article". |
| `LibraryCard.tsx` | NEW | One row: title, source badge, extraction-confidence indicator, addedAt, tags, cover thumbnail. Click → `#/article/<id>`. |
| `IngestArticleForm.tsx` | NEW | URL paste input + file picker. Honesty-first copy: surfaces extraction confidence + unsupported-content counts BEFORE adding to library. |
| `ArticleView.tsx` | UNCHANGED | Reader surface is identical for fixture and ingested articles. |
| `AnnotationReviewPane.tsx` | NEW (RECV-01) | Cross-article highlights/notes review. Queries `highlightsStore.list()` (the existing `[articleId+revision]` compound-index range query already supports listing across all articles). Pairs naturally with the export flow. |

**Library data flow:**

```
Reader opens app
    ↓
LibraryView mounts → compositeLibraryRepository.listLibrary()
    ↓                                    ↓
    ├── inMemoryRepository (fixtures)    ├── DexieLibrarySource.listLibrary()
    │   → 6 LibraryEntry rows            │   → IndexedDB query (articles table, headers only)
    │     (source: "fixture")            │     (source: "url" | "html-upload" | ...)
    └──────────────┬─────────────────────┘
                   ↓ UNION + sort by addedAt
              LibraryEntry[] (deduplicated by id)
                   ↓
              LibraryView renders cards
                   ↓
    Reader clicks a card → hash → #/article/<id> → ArticleView
                                                  ↓
                                  compositeLibraryRepository.open(id)
                                                  ↓
                                          returns CanonicalArticle (full blocks)
                                                  ↓
                                  v1.0 substrate: paginate / scroll / annotate / restore
```

**Search:** title + author + sourceUrl substring (no full-text index needed for MVP — Dexie's `where('title').startsWithIgnoreCase(query)` is sufficient). A future milestone could add a Dexie full-text index or a small client-side inverted index.

**Tag flow:** tags are reader-created slugs; `tag(id, slug)` inserts into the `tags` store (idempotent on slug) and the `articleTags` join; `listTags()` returns slugs for the tag-filter UI. Removing an article cascades to remove its `articleTags` rows (Dexie hook or explicit transaction).

**Trade-offs:**
- **Pro:** Repository contract extends additively — v1.0 callers (ArticleView) still call `open(id)` and get the same shape.
- **Pro:** Library entry is a lightweight header — list rendering doesn't hydrate Block trees for every article.
- **Pro:** Fixtures stay bundled (Pitfall 8); no migration risk.
- **Con:** Two repository implementations to maintain (mitigated by the composite pattern — the composite is the only one routes consume).

---

### Pattern 7 — Versioned Export/Import Bundle (PORT-01/02)

**What:** Export the entire local library — articles, highlights, notes, locations, preferences, books, tags — as a single versioned JSON bundle. Import with validation, conflict detection, and a dry-run preview before any destructive write.

**When to use:** Cross-device portability in lieu of accounts (PROJECT.md: "Cross-device happens via versioned export/import, not accounts").

**Bundle format — single versioned JSON file (`lem-reader-export-v1.json` or `.json.gz` for size):**

```typescript
// src/portability/bundle.ts — NEW
export const ExportBundleSchema = z.object({
  schemaVersion: z.literal(1),                          // PORT-01/02 versioning hook
  exportedAt: z.string().datetime(),
  appVersion: z.string(),                               // e.g., "2.0.0" — for diagnostic on import
  articles: z.array(ArticleSchema),                     // full articles (blocks included)
  locations: z.array(LocationRecordSchema),             // reading positions
  highlights: z.array(HighlightRecordSchema),           // all highlights
  notes: z.array(NoteRecordSchema),                     // all notes
  preferences: ReaderSettingsSchema.optional(),          // optional (reader may choose not to export)
  books: z.array(BookSchema).optional(),                // EPUB book groupings
  tags: z.array(TagSchema).optional(),                  // tag definitions
  articleTags: z.array(ArticleTagSchema).optional(),    // tag assignments
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;
```

**What serializes:**

| Record | Serializes | Why |
|--------|------------|-----|
| Articles (user) | YES (full) | The reader's library content — without this, highlights have nothing to anchor to |
| Articles (fixtures) | **NO** | Fixtures are bundled JSON already present in every Lem Reader build; including them bloats the bundle 5–10×. The bundle carries fixture `id`s only (a `fixtureIds: string[]` field could be added) so the importer can verify fixture presence. |
| Locations | YES | Reading position is the reader's progress |
| Highlights | YES | The reader's intellectual work |
| Notes | YES | The reader's intellectual work |
| Preferences | OPTIONAL | Some readers want a "fresh" install on a new device; others want their typography carried over. Reader chooses at export time. |
| Books / Tags / ArticleTags | YES (when present) | Library organization travels with the content |

**Conflict detection on import (PORT-02):**

The importer runs a **dry-run preview pass** before any write. For each incoming record it compares against existing local state by primary key:

| Conflict type | Detection | Default resolution | Reader override |
|---------------|-----------|--------------------|-----------------|
| **Article id-collision, different `revision`** | `existing.id === incoming.id && existing.revision !== incoming.revision` | Keep the higher `revision` (monotonic — D-06); discard the lower | Prompt: "Replace local revision N with imported revision M?" |
| **Article id-collision, same revision, different `originalHtmlHash`** | Same id+revision but different content hash | Flag as conflict (data divergence) | Prompt: "Keep local / Keep imported / Keep both (rename imported)" |
| **Highlight id-collision** | `existing.id === incoming.id` (rare — crypto.randomUUID) | Keep both (assign new id to incoming) | Rare; auto-resolve is safe |
| **Note id-collision** | same | same | same |
| **Tag slug-collision** | `existing.slug === incoming.slug` | Idempotent merge (tags are reader-defined; same slug = same tag) | None needed |
| **Location collision** | `[articleId+revision]` compound key matches | Last-write-wins by `savedAt` timestamp | None needed (matches v1.0 location semantics) |

**`ImportPreview` result returned to the UI before any write:**

```typescript
export interface ImportPreview {
  added: { articles: number; highlights: number; notes: number; locations: number; tags: number; books: number };
  conflicts: Array<{
    kind: "article-revision" | "article-content-divergence" | "highlight-id" | "note-id" | "tag-slug";
    localSummary: string;
    incomingSummary: string;
    defaultResolution: string;
    options: string[];                  // ["Keep local", "Keep imported", "Keep both"]
  }>;
  skipped: Array<{ reason: string; summary: string }>;   // e.g., "Fixture article already present"
  warnings: string[];                   // e.g., "Bundle was exported by newer app version 3.0; some fields may be ignored"
}
```

The UI shows this preview, the reader approves (or selects per-conflict overrides), then the importer runs the actual write inside a single Dexie transaction (atomic — all-or-nothing).

**Schema versioning on import:**

- `schemaVersion: 1` → current v2.0 bundle. Parse with `ExportBundleSchema`.
- Future `schemaVersion: 2` → forward-compatibility check. If the importer sees a higher `schemaVersion` than it understands, it refuses with a clear error ("This bundle was exported by a newer Lem Reader version. Please update."). **No silent partial import.**
- The `appVersion` field is for diagnostic only (e.g., "this 2.0.3 bundle uses a feature added in 2.0.1").

**Bundle integrity:**
- Every record inside the bundle is validated by its existing Zod schema (`ArticleSchema`, `HighlightRecordSchema`, etc.) at parse time. A malformed bundle fails loudly.
- Optional: a SHA-256 checksum field over the bundle contents to detect file corruption in transit (USB stick, file-share).
- The bundle is plain JSON (optionally gzipped) — no proprietary format, no encryption (encryption is deferred to a future milestone per PROJECT.md Out of Scope).

**Trade-offs:**
- **Pro:** Single file portability; all existing Zod schemas reused for validation.
- **Pro:** Dry-run preview means the reader never loses data to a surprise import.
- **Pro:** Forward-compatibility check prevents silent partial imports.
- **Con:** Bundle size scales with library size (mitigated by `.json.gz`; a 100-article library is roughly 1–5 MB compressed).
- **Con:** No incremental sync (this is a snapshot, not a merge protocol) — acceptable for the cross-device-via-file story.

---

### Pattern 8 — SSRF/XSS Defense-in-Depth Boundary

**What:** URL-validation and HTML-sanitization live SERVER-SIDE at the ingestion endpoint. The rendered ingested HTML stays XSS-safe because it is never rendered as HTML — it is transformed into the typed Block tree before persistence, and the renderer renders Blocks, not HTML.

**When to use:** Every URL ingestion. File-upload ingestion (HTML/PDF/EPUB/MD) shares the same post-extract sanitization stage.

**SSRF defense (server, at fetch time):**

The server is the ONLY place URLs are fetched. The client NEVER fetches reader-supplied URLs directly. The server's `safeFetch(url)` implements OWASP SSRF Prevention Cheat Sheet essentials:

```typescript
// server/fetch/safeFetch.ts
const PRIVATE_IP_RANGES = [
  // IPv4
  "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
  "169.254.0.0/16",   // link-local — includes AWS/GCP/Azure metadata endpoints
  "127.0.0.0/8",      // loopback
  "0.0.0.0/8",        // "this network"
  "100.64.0.0/10",    // CGNAT
  // IPv6
  "::1/128",          // loopback
  "fc00::/7",         // ULA
  "fe80::/10",        // link-local
];

export async function safeFetch(rawUrl: string): Promise<FetchedContent> {
  // 1. SCHEME ALLOWLIST — reject anything not http/https
  const parsed = new URL(rawUrl);                  // throws on malformed
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new IngestionError("ssrf-blocked-scheme");
  }

  // 2. DNS RESOLVE — check resolved IPs against blocklist BEFORE fetch
  const resolved = await dnsLookup(parsed.hostname);
  if (resolved.every(ip => isPrivateIp(ip, PRIVATE_IP_RANGES))) {
    throw new IngestionError("ssrf-blocked-private-ip");
  }

  // 3. DNS PINNING — fetch using the resolved IP, set Host header
  //    (prevents DNS rebinding / TOCTOU between resolve and connect)
  const pinnedUrl = rewriteUrlHost(parsed, resolved[0]);
  const res = await fetch(pinnedUrl, {
    headers: { Host: parsed.host, "User-Agent": "LemReader/2.0 (+https://lem-reader.app)" },
    redirect: "manual",                            // validate each redirect manually
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  // 4. REDIRECT CAP — follow up to N redirects, re-validating each hop
  //    (prevents redirect-based SSRF to internal IPs)

  // 5. RESPONSE LIMITS — cap size, content-type allowlist
  if (res.headers.get("content-length") > MAX_RESPONSE_BYTES) {
    throw new IngestionError("response-too-large");
  }
  if (!ALLOWED_CONTENT_TYPES.includes(res.headers.get("content-type"))) {
    throw new IngestionError("unsupported-content-type");
  }

  return { html, finalUrl: res.url, contentType, hash: sha256(html) };
}
```

**XSS defense (defense-in-depth, 4 layers):**

```
Layer 1 (server, post-extract):   DOMPurify.sanitize with strict allowlist
                                   → strips <script>, <iframe>, on* attributes,
                                     javascript: hrefs, etc.

Layer 2 (server, post-sanitize):  htmlToBlocks DOM walker
                                   → produces typed Block tree (no HTML survives)
                                   → unmapped tags → UnsupportedBlock (disclosed)
                                   → link hrefs pass through ArticleSchema's
                                     linkableUrl refinement (http/https/mailto only —
                                     Pitfall 5, already enforced in v1.0)

Layer 3 (persist):                ArticleSchema.parse() validates the Block tree
                                   → link/figure URLs are scheme-allowlisted at the
                                     Zod boundary; note text is plain string (Pitfall 8)

Layer 4 (render):                 React semantic renderer
                                   → text is React-escaped by default
                                   → there is NO dangerouslySetInnerHTML anywhere
                                     (ESLint react/no-danger rule, already in v1.0)
                                   → CSP on the SPA forbids inline scripts
```

**The key architectural insight:** by transforming arbitrary HTML into the canonical Block tree AT THE SERVER during ingestion, **no arbitrary HTML is ever persisted or rendered**. The doc model IS the security boundary. The 9 block kinds + 4 inline marks are an allowlist-by-construction; anything outside becomes `UnsupportedBlock`. This is the same property that made v1.0 XSS-safe for fixtures — v2.0 simply applies it to ingested content at the server boundary instead of at the build-time normalizer.

**Client-side CSP (tightens, not loosens):**

```http
Content-Security-Policy:
  default-src 'self';
  connect-src 'self';                          # only same-origin (the co-deployed ingestion function)
  img-src 'self' https: data:;                 # remote article figures (already true in v1.0)
  style-src 'self' 'unsafe-inline';            # CSS custom properties (already true in v1.0)
  script-src 'self';                           # NO 'unsafe-inline', NO 'unsafe-eval'
  object-src 'none';                           # no Flash/Java/PDFium embeds
  base-uri 'self';
  form-action 'self';
```

**What about client-side XSS from ingested note text?** Already defended in v1.0 — `NoteRecordSchema.text` is `z.string()` (Pitfall 8: React escapes text children by default; ESLint forbids `dangerouslySetInnerHTML`). Ingested content doesn't change this — notes are reader-authored plain text, rendered as React text children.

**Resource-exhaustion defense (server):**

For PDF/EPUB (file uploads), the server enforces resource limits per the library guidance:
- **unpdf:** pass `maxImageSize` (e.g., 16 MB), check `pdf.numPages` against a cap (e.g., 500) before extracting, race extraction against a timeout (no worker thread in the serverless build).
- **epub2:** check chapter count against a cap (e.g., 1000); race against a timeout.
- **General:** file upload size cap (e.g., 50 MB); request timeout (e.g., 30 s); rate-limit per IP at the edge function layer (Cloudflare's built-in).

**Trade-offs:**
- **Pro:** XSS defense is structural, not procedural — the doc model rejects unrepresentable content by construction.
- **Pro:** SSRF defense is server-authoritative — the client cannot be tricked into fetching internal URLs because the client never fetches.
- **Pro:** CSP tightens vs v1.0 (cleaner client posture).
- **Con:** The server is a single point of failure for ingestion (mitigated by honest failure surface — the client tells the reader "the server couldn't fetch this URL").

---

## Data Flow

### Ingestion Request Flow (URL path — the canonical happy path)

```
Reader pastes URL in IngestArticleForm
    ↓
IngestionClient.ingestUrl(url) — POST /api/ingest { kind: "url", url }
    ↓
[/api/ingest onRequest]
    ↓
safeFetch(url) ─▶ (SSRF guard, scheme allowlist, IP blocklist, DNS pin, size cap, timeout)
    ↓                   ↓ (failure → 400 { reason: "ssrf-blocked-..." | "fetch-failed" | ... })
    ↓                   ↓
    ↓             Readability.extract(jsdomDoc) ─▶ (failure → 400 { reason: "extraction-too-low-confidence" })
    ↓                   ↓
    ↓             DOMPurify.sanitize(extractedHtml, { ALLOWED_TAGS: ..., FORBID_TAGS: ... })
    ↓                   ↓
    ↓             clearWindow()  # release jsdom state
    ↓                   ↓
    ↓             htmlToBlocks(sanitizedDom, finalUrl)
    ↓                   ↓
    ↓                   ↓ blocks: Block[], footnotes: FootnoteBody[]
    ↓                   ↓
    ↓             ArticleSchema.parse({ id: clientSuppliedSlug, revision: 1, lang, provenance, blocks, footnotes })
    ↓                   ↓ (failure → 500 — adapter produced invalid Block tree; server bug)
    ↓                   ↓
    ↓             200 OK { article: CanonicalArticle, extractionConfidence, warnings }
    ↓
IngestionClient receives article
    ↓
ArticleSchema.parse(article) — RE-VALIDATE at client boundary (Zod-at-boundary discipline)
    ↓
DexieLibrarySource.save(article, ingestionMeta) — IndexedDB write
    ↓
LibraryView re-queries compositeLibraryRepository.listLibrary() — card appears
    ↓
.status announce: "Added '<title>' to library"
    ↓
Reader clicks card → #/article/<id> → ArticleView → v1.0 substrate takes over
```

### Library State Management

The library surface uses **React state + context** (consistent with v1.0's "no Redux/Zustand/XState" decision). A new `LibraryContext` provides:

```
LibraryContext
    ↓ (provides)
LibraryView, IngestArticleForm, AnnotationReviewPane
    ↓ (subscribe)
    │
    ├── entries: LibraryEntry[]          (cache; invalidated on save/remove/tag)
    ├── tags: Tag[]                      (cache; invalidated on tag/untag)
    ├── ingestState: "idle" | "ingesting" | "success" | { error: IngestionFailureReason }
    └── lastUpdated: number              (debounce + flush mirror of SettingsContext pattern)
         │
         ↓ (actions)
    ingestUrl(url)   → IngestionClient → save → invalidate entries cache
    ingestFile(file) → IngestionClient (multipart) → save → invalidate
    remove(id)       → DexieLibrarySource.remove → invalidate
    tag(id, slug)    → DexieLibrarySource.tag → invalidate tags + entries
```

**No new state machine.** v1.0 chose React state/context over Redux/Zustand/XState; v2.0 honors that. The library has modest state complexity (a list, a few CRUD actions, an ingest status).

### Export/Import Data Flow

```
EXPORT
    ↓
ExportImportService.exportLibrary({ includePreferences })
    ↓
    ├── DexieLibrarySource.listLibrary()      → LibraryEntry[]
    ├── DexieLibrarySource.listFullArticles() → CanonicalArticle[] (full blocks)
    ├── locationStore.list()                  → LocationRecord[]
    ├── highlightsStore.list()                → HighlightRecord[]
    ├── notesStore.list()                     → NoteRecord[]
    ├── (optional) settingsStore.get()        → ReaderSettings
    ├── libraryStore.listBooks()              → Book[]
    ├── libraryStore.listTags()               → Tag[]
    └── libraryStore.listArticleTags()        → ArticleTag[]
    ↓
ExportBundleSchema.parse({ schemaVersion: 1, exportedAt, appVersion, articles, ... })
    ↓
JSON.stringify (optionally gzip)
    ↓
FileSaver → lem-reader-export-2026-08-10.json[.gz]


IMPORT
    ↓
Reader selects file → ExportImportService.previewImport(file)
    ↓
file.text() → ExportBundleSchema.parse (Zod-at-boundary)
    ↓
ExportImportService.detectConflicts(bundle, localState)
    ↓
ImportPreview { added, conflicts, skipped, warnings }
    ↓ (reader reviews + approves per-conflict overrides)
ExportImportService.applyImport(bundle, overrides) — single Dexie transaction
    ↓
.status announce: "Imported N articles, M highlights, ...; K conflicts resolved"
```

---

## Scaling Considerations

This is a **local-first prototype**, not a multi-tenant service. Most traditional scaling concerns don't apply. The relevant scaling axes are:

| Concern | At 10 articles | At 1,000 articles | At 10,000+ articles |
|---------|----------------|-------------------|---------------------|
| **Library list render** | Trivial | Virtualize the list (windowing) — reuses v1.0's calm-rendering discipline | Virtualization mandatory; consider lazy-loading `LibraryEntry` from Dexie with pagination |
| **Dexie `articles` row size** | Trivial | One row per article (~10–50 KB JSON) — well within IndexedDB's practical limits | Consider splitting `articles` (headers) from `articleBodies` (Block trees) at v4 if row size becomes a hot path |
| **Search performance** | Substring scan fine | Dexie index on `title` + `author` — `startsWithIgnoreCase` is O(log n) | Consider a client-side inverted index or a Dexie full-text hook |
| **Ingestion backend load** | Trivial | Cloudflare Workers free tier (100K req/day) easily handles prototype load | Move to paid tier; rate-limit per IP; consider a queue for batch imports |
| **Export bundle size** | <100 KB | 1–5 MB compressed (`.json.gz`) | Stream the bundle (NDJSON or gzip-as-you-go) rather than building in memory |
| **Browser storage quota** | Trivial | IndexedDB quotas are typically several GB; fine | Add a "library is using X% of available storage" indicator; offer export-then-remove workflow |

### Scaling Priorities

1. **First bottleneck (likely at ~500 articles):** library list render cost. Mitigation: virtualize the list (one new component, no substrate change).
2. **Second bottleneck (likely at ~2,000 articles):** export bundle memory. Mitigation: stream the bundle.
3. **Unlikely to matter for v2.0:** ingestion backend load (Cloudflare Workers absorbs it); search performance (Dexie indexes scale well into the tens of thousands).

**Anti-premature-optimization note:** the v1.0 discipline was "measure first, then optimize" (PAGE-08 calibration pattern, perf gate at measured p95+25% headroom). The library surface should adopt the same discipline — don't virtualize until a Playwright perf measurement on a 1,000-article synthetic library shows a regression.

---

## Anti-Patterns

### Anti-Pattern 1 — Persisting arbitrary ingested HTML

**What people do:** Save the raw fetched HTML (or Readability's output HTML) to Dexie and render it via `dangerouslySetInnerHTML`.
**Why it's wrong:** (1) Massive XSS attack surface — DOMPurify-on-render is procedural defense, not structural. (2) Breaks the v1.0 substrate (the renderer renders Block trees, not HTML). (3) Bypasses the 9-kind contract that makes pagination/annotation/location stable. (4) React + CSP posture is weakened.
**Do this instead:** Transform HTML to the typed Block tree AT THE SERVER during ingestion ([Pattern 2](#pattern-2--extraction--canonical-doc-model-pipeline-production-grade)). Persist only the Block tree. The doc model IS the security and substrate boundary.

### Anti-Pattern 2 — Client-side URL fetching

**What people do:** Let the SPA `fetch()` the reader-supplied URL directly.
**Why it's wrong:** (1) CORS — most publishers don't allow cross-origin fetches. (2) The client CSP must open `connect-src` to `https://*` — a major posture regression. (3) SSRF defense moves to the client where it can be bypassed. (4) Reader device pays the CPU/memory cost of parsing.
**Do this instead:** All URL fetching happens server-side at `/api/ingest` ([Pattern 8](#pattern-8--ssrfxss-defense-in-depth-boundary)). The client only talks same-origin to the ingestion endpoint.

### Anti-Pattern 3 — Extending the doc model to accommodate EPUB chapters natively

**What people do:** Add a `Book` container to the doc model; teach the renderer, pagination engine, annotation selectors, and location store about (bookId, chapterId, offset) compound coordinates.
**Why it's wrong:** Breaks every v1.0 contract for a feature expressible more simply. Annotation selector semantics, grapheme-offset stability, and pagination invariants all become chapter-aware — multiplying the test surface for zero reader-visible benefit.
**Do this instead:** One article per chapter + a thin `Book` grouping record ([Pattern 4](#pattern-4--epub-multi-chapter-as-book-container)). The substrate stays chapter-unaware.

### Anti-Pattern 4 — Splitting fixtures and user articles into separate stores "for cleanliness"

**What people do:** Create a `userArticles` Dexie store distinct from `articles`.
**Why it's wrong:** Every library query must UNION two stores; every repository method doubles; every export/import must traverse two stores; every cascade-delete must fan out. The shapes are identical — there's no schema reason to split.
**Do this instead:** One `articles` store with a `source` discriminator ([Pattern 5](#pattern-5--dexie-schema-evolution-v2--v3)). Fixtures stay bundled JSON (not in Dexie at all) and the repository UNIONs at query time.

### Anti-Pattern 5 — Adding a global state library (Redux/Zustand/XState) for the library

**What people do:** "The library has more state than the reader; let's add Redux."
**Why it's wrong:** v1.0 explicitly rejected global state libraries (STACK.md). The library has modest state: a list cache, a few CRUD actions, an ingest status. React state + context handles it cleanly. Adding a state library fragments the codebase pattern and obscures the document/layout/persistence boundaries.
**Do this instead:** `LibraryContext` with React state, mirroring the `SettingsContext` debounced-flush pattern ([Library State Management](#library-state-management)).

### Anti-Pattern 6 — Silent partial extraction

**What people do:** Readability returns thin content; the article is added to the library without surfacing the low-confidence signal.
**Why it's wrong:** Violates the v1.0 honesty discipline (DOC-06 unsupported disclosure; PAGE-09 pagination fallback banner). The reader trusts the library; a silently-degraded extraction undermines that trust.
**Do this instead:** Surface `extractionConfidence` and `extractionWarnings` on the library card and on first open ([Pattern 2](#pattern-2--extraction--canonical-doc-model-pipeline-production-grade)). The disclosure IS the failure mode.

### Anti-Pattern 7 — Editing the v1 or v2 Dexie version block to add indexes

**What people do:** Modify the existing `this.version(1).stores({...})` or `this.version(2).stores({...})` to add the new indexes.
**Why it's wrong:** Pitfall 9 — never edit a shipped version block. Any client that already opened v1 or v2 has an internal upgrade chain indexed by those version numbers; editing them breaks the chain and can cause data loss.
**Do this instead:** Append a `this.version(3).stores({...})` block re-declaring ALL stores (changed and unchanged) with the new indexes ([Pattern 5](#pattern-5--dexie-schema-evolution-v2--v3)).

### Anti-Pattern 8 — Importing a bundle without a dry-run preview

**What people do:** Parse the bundle and write directly to Dexie in one pass.
**Why it's wrong:** Conflicts (article id-collision, content divergence) silently overwrite local data or get silently dropped. PORT-02 explicitly requires conflict reporting.
**Do this instead:** Two-pass import: `previewImport()` returns an `ImportPreview` (added/conflicts/skipped/warnings); the reader approves with optional per-conflict overrides; `applyImport()` runs in a single Dexie transaction ([Pattern 7](#pattern-7--versioned-exportimport-bundle-port-0102)).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Cloudflare Pages Functions** (or Vercel/Netlify equivalent) | `/functions/api/ingest.ts` co-deployed with the Vite static build | Same-origin by default → no CORS. Free tier sufficient for prototype. The only external runtime dependency introduced in v2.0. |
| **Publisher websites** (fetched server-side only) | `safeFetch()` with SSRF guard | Server-side only; reader's client never fetches publisher URLs directly. `User-Agent: LemReader/2.0` identifies the bot. |
| **npm registry** (build time) | New server-only deps: `@mozilla/readability`, `isomorphic-dompurify`, `unpdf`, `epub2`, `zipfile`, `remark`, `remark-parse` | All gated behind `/server` imports — never enter the client bundle. Pin exact versions; audit bundle size with each add. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **SPA ↔ ingestion function** | Same-origin `fetch("/api/ingest")` | The single client↔server seam. All ingestion requests funnel here. CSP `connect-src 'self'` enforces. |
| **`/server` (server-only) ↔ `/functions` (runtime)** | Direct TypeScript import | `/functions/api/ingest.ts` imports pipeline entry from `/server/index.ts`. Server code never enters the client bundle. |
| **`src/ingestion` (client) ↔ `src/persistence` (substrate)** | `DexieLibrarySource` calls Dexie through the existing db.ts tables | Reuses the existing Dexie instance; same Zod-at-boundary discipline as settings/location/highlights stores. |
| **`src/library` (new surface) ↔ `src/content/repository.ts` (extended)** | `compositeLibraryRepository` implements `ArticleRepository` | The repository interface is the seam. v1.0 routes (ArticleView) call the same `open(id)` method unchanged. |
| **`src/portability` (new) ↔ every store** | Read-only `list()` for export; transactional `bulkPut()` for import | Export/import touch every store but go through their existing repository interfaces — no store internals leak. |
| **Ingested articles ↔ v1.0 substrate** | NONE — the substrate is source-agnostic | The pagination engine, measurement substrate, annotation selectors, location store, highlights/notes stores operate on `CanonicalArticle` and grapheme offsets. They literally cannot tell a fixture from an ingested article. **This is the load-bearing invariant of the entire integration design.** |

---

## Suggested Build Order

The user wants the URL+HTML path PROVEN before PDF/EPUB. The build order below respects that constraint AND respects substrate dependencies (each phase's substrate must be stable before the next phase builds on it). Phase numbering continues from v1.0 (which ended at Phase 6).

### Phase 7 — Ingestion Substrate (backend shape + SSRF/XSS boundary + repo extension)

**Goal:** Prove that the server can fetch + sanitize + extract + normalize one URL into a valid `CanonicalArticle`, and that the repository interface can hold it — with NO UI changes.

**Builds:** `/functions/api/ingest.ts`, `/server/{normalize,fetch}/`, `safeFetch` SSRF guard, `htmlToBlocks` adapter (the production-grade promotion of v1.0's throwaway normalizer), `IngestionClient`, `DexieLibrarySource`, Dexie v3 schema migration, extended `ArticleRepository` interface.

**Validates:**
- `/api/ingest` returns a valid `CanonicalArticle` for a representative URL set (5–10 real publishers across the v1.0 D-01 genre matrix).
- SSRF guard blocks private-IP, non-http(s), and redirect-to-internal URLs (unit tests + an adversarial test corpus).
- DOMPurify strips `<script>`, `on*`, `javascript:` from extracted HTML before walker (security regression tests).
- Dexie v2 → v3 migration is zero-data-migration (existing v1.0 fixtures, settings, locations, highlights, notes survive).
- Honest failure: extraction-too-low-confidence, fetch-failed, ssrf-blocked, unsupported-content-type all return structured `IngestionFailureReason` the client can surface.

**Substrate risk:** LOW. No v1.0 substrate code is modified. The Dexie v3 block is additive. The repository interface is extended (additive); v1.0 callers are unaffected.

**Why first:** Every other ingestion feature depends on this pipeline existing and the repo accepting user articles. Proving the substrate in isolation (no UI pressure) isolates the highest-novelty work.

### Phase 8 — HTML + Markdown Pipeline + Library Surface

**Goal:** A reader can paste a URL or upload an HTML/Markdown file and read it in the library, with browse/search/tag/remove.

**Builds:** `LibraryView` (replaces `FixtureList`), `LibraryCard`, `IngestArticleForm`, `markdownToBlocks` adapter, `LibraryContext`, `compositeLibraryRepository`, library e2e test corpus (chromium/firefox/webkit).

**Validates:**
- URL paste → extract → persist → appear in library → open in ArticleView → read with all v1.0 affordances (paginate/scroll/annotate/restore).
- File upload (HTML/MD) → same flow.
- Search (title + author + sourceUrl substring), tag (create + assign + filter), remove (with cascade to location/highlights/notes/articleTags).
- Extraction-confidence surfacing on library card + first-open banner.
- v1.0 regression: fixtures still appear in the library with `source: "fixture"` badge; all v1.0 e2e tests still pass.
- Accessibility: library surface meets the same a11y contracts as v1.0 (semantic landmarks, keyboard navigation, visible focus, screen-reader order).

**Substrate risk:** LOW–MEDIUM. `FixtureList` is replaced (not modified). `ArticleView` is unchanged. The composite repository is new; the in-memory fixture path is preserved verbatim.

**Why second:** Substrate is proven (Phase 7). Now the reader sees the value. Markdown is bundled in here because `markdownToBlocks` shares the same Block-output contract and is the lowest-risk adapter — there's no reason to defer it.

### Phase 9 — Versioned Export/Import (PORT-01/02)

**Goal:** A reader can export their library + highlights + notes + positions + preferences as a versioned JSON bundle, and import it on another device with validation and conflict reporting.

**Builds:** `ExportBundleSchema`, `ExportImportService` (serialize, parse, validate, conflict-detect, dry-run preview, transactional apply), export/import UI (file picker, preview dialog, conflict-resolution UI), `.json.gz` support.

**Validates:**
- Export → import round-trip on the same device = no data loss (every article, highlight, note, location, tag, book survives).
- Cross-device portability: export on device A, import on device B = same library state.
- Conflict detection: same article id with different revisions flagged; reader chooses resolution.
- Forward-compatibility: a bundle with `schemaVersion: 2` (synthetic) is refused with a clear error.
- v1.0 regression: all existing tests pass; export does not include fixtures (they're bundled).

**Substrate risk:** LOW. Export/import is read-only over existing stores (export) and goes through existing repository methods (import). No v1.0 code modified.

**Why third:** Portability is the cross-device story in lieu of accounts (PROJECT.md). It naturally follows having a library to export. It also unblocks the annotation review panel (Phase 10), which pairs naturally with the curation/export flow.

### Phase 10 — Annotation Review Panel (RECV-01)

**Goal:** A dedicated surface to review all highlights/notes across the library — the natural pair to the export/curation flow.

**Builds:** `AnnotationReviewPane`, cross-article highlights/notes query (the existing `[articleId+revision]` compound index already supports this), navigate-from-review-to-anchor (reuses v1.0 D5-11 navigate-back pattern), filter/sort UI.

**Validates:**
- Review pane lists every highlight + note across every library article.
- Filter by article, tag, confidence; sort by date, article order, highlight position.
- Click a review entry → navigate to the highlight in the article (paginated or scrolling mode).
- Edits in the review pane reflect in the article; deletes cascade correctly.
- Accessibility: review pane meets the same a11y contracts as the v1.0 AnnotationsDrawer.

**Substrate risk:** LOW. New UI; reuses existing annotation store + navigate-back pattern. No v1.0 code modified.

**Why fourth:** Pairs naturally with export/curation (Phase 9). Standalone value but bigger value after portability.

### Phase 11 — PDF Intake

**Goal:** A reader can upload a PDF and read it in the library.

**Builds:** `pdfToBlocks` adapter (`unpdf` extractTextItems → positional grouping → Block tree), `pdfToBlocks` test corpus (text-heavy PDF, scanned PDF honest-failure, multi-column PDF degradation), file-upload extension in `IngestArticleForm`, resource-limit enforcement (maxImageSize, numPages cap, timeout).

**Validates:**
- Text-heavy PDF → readable article (paragraphs grouped, headings detected via font-size hierarchy).
- Scanned PDF → honest failure ("this PDF has no extractable text").
- Multi-column PDF → readable but possibly degraded (unsupported blocks for figures/tables).
- Resource limits: oversized PDFs fail honestly without OOMing the worker.
- v1.0 + Phase 8/9/10 regression.

**Substrate risk:** MEDIUM. PDF extraction quality is the project-specific empirical risk. The adapter is isolated; if it produces low-quality output, the doc model still validates (UnsupportedBlock for anything unmapped) and the reader sees honest disclosure.

**Why fifth:** User explicitly wants PDF after URL+HTML. Markdown (Phase 8) and the library surface (Phase 8) and portability (Phase 9) and annotation review (Phase 10) all take precedence because they have higher reader value and lower risk.

### Phase 12 — EPUB Intake (the multi-chapter book)

**Goal:** A reader can upload an EPUB and read it in the library as a book (multiple chapters grouped under a book card).

**Builds:** `epubToBooks` adapter (`epub2` parse → per-chapter `htmlToBlocks` → multiple `CanonicalArticle` rows sharing a `bookId` + a `Book` record), `books` Dexie store integration, book-grouping UI in `LibraryView` (expandable book cards, "open book" = open first unfinished chapter), book-level progress derived across chapter locations, EPUB test corpus (3–5 real EPUBs across genres).

**Validates:**
- Real EPUB → multiple chapter articles + a book record in the library.
- Chapter articles read identically to other articles (paginate/scroll/annotate/restore all work — proving the substrate is source-agnostic).
- Book card groups chapters; "open book" opens the right chapter.
- Cross-chapter navigation (next/previous chapter) works.
- Unmaintained-parser risk: `epub2` is isolated behind an adapter; failures degrade gracefully.
- v1.0 + all prior phase regression.

**Substrate risk:** MEDIUM. The Book container is additive ([Pattern 4](#pattern-4--epub-multi-chapter-as-book-container)). The unmaintained `epub2` dependency is the highest-risk external dep in v2.0 — isolating it behind an adapter (so it can be swapped for a maintained alternative or an in-house parser) is mandatory.

**Why last:** User explicitly wants EPUB last. It's also the riskiest intake format (unmaintained parser, multi-chapter doc-model question, large file sizes). Sequencing it last means every other v2.0 feature is shipped and stable before taking on this risk.

### Phase 13 — Polish + Acceptance

**Goal:** Eliminate the initial-load reading-mode flash, fix short-article progress-bar semantics, run NVDA+Firefox acceptance (ACPT-02 follow-up).

**Builds:** first-paint mode mismatch fix (likely a CSS/server-rendered-prefers hint), progress-bar semantics fix (1-page article no longer reads 100% on open; 2-page article no longer starts at 50%), NVDA+Firefox acceptance protocol execution + `06-VERIFICATION.md`-style consolidation.

**Validates:**
- No mode flash on initial load across chromium/firefox/webkit.
- Progress bar reads 0% on open for 1- and 2-page articles.
- NVDA+Firefox manual SR protocol: zero-blocker.
- Full `npm run test` suite exit 0 (mirrors Plan 04-11 / 06-06 honest-suite precedent).

**Substrate risk:** LOW. Polish work touches existing v1.0 surfaces with surgical fixes; acceptance is verification, not new code.

**Why last:** Polish is cheap once the feature surface is stable. Acceptance closes the v2.0 quality gate.

### Build Order Rationale (Dependencies)

```
Phase 7 (ingestion substrate) ─────┐
                                   ↓
Phase 8 (HTML/MD + library) ───────┐
                                   ↓
                      ┌─ Phase 9 (export/import) ──────┐
                      │                                ↓
                      │                  Phase 10 (annotation review)
                      │                                │
                      ↓                                │
Phase 11 (PDF) ───────────────────────────────────────┤
                                                       │
Phase 12 (EPUB) ──────────────────────────────────────┤
                                                       ↓
                                       Phase 13 (polish + acceptance)
```

**Critical path:** 7 → 8 → 9 → 13. The remaining phases (10, 11, 12) can be sequenced in parallel tracks after Phase 8 if the team has capacity, but each respects the user's URL+HTML-first intent (Phase 8 proves the pipeline before PDF/EPUB adapter work).

**Phase 7 is non-negotiable first:** it establishes the substrate every other ingestion feature depends on. Skipping or compressing it risks the entire v2.0 milestone.

**Phases 9 + 10 form the portability/review pair:** export gives the reader their data; annotation review helps them curate it. They share UI patterns and can be built by the same engineer in close succession.

**Phases 11 + 12 are the higher-risk format work:** each is independently shippable. Sequencing them after portability means readers can always export their library before any risky format work lands.

**Phase 13 is the v2.0 quality gate** — the analogue of v1.0 Phase 6 (Prototype Acceptance).

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Backend shape recommendation (Cloudflare Pages Functions) | HIGH | Verified CF Pages Functions docs (file-based routing, same-origin default, Workers runtime, /functions at project root); vendor platform choice is operational not architectural; the pattern is widely established for stateless fetch+transform workloads |
| HTML extraction pipeline (Readability + DOMPurify) | HIGH | Both packages verified current (0.6.0 + 3.22.0); Mozilla explicitly recommends the pairing; isomorphic-dompurify's `clearWindow()` addresses long-running-worker memory growth; jsdom-in-Node is the documented pattern |
| Markdown intake (remark) | HIGH | remark 15.x is SOTA (5.2M weekly); mdast maps cleanly to the 9-kind Block model; no sanitizer needed for plain CommonMark |
| PDF intake (unpdf) | HIGH for capability, MEDIUM for project fit | unpdf 1.8.0 verified (serverless PDF.js v5.6.205, CF Workers compatible, explicit untrusted-PDF guidance); PDF structure-detection quality is project-specific and empirical |
| EPUB intake (epub2) | MEDIUM | epub2 3.0.2 is verified as the best available Node parser BUT unmaintained (3+ years); isolated behind adapter to allow swapping; chapter extraction fidelity is project-specific and must be validated on real EPUBs before promotion |
| EPUB-as-Book-Container decision | HIGH | The 3-option analysis is conclusive: Option A (chapter-as-article) preserves every v1.0 substrate contract; Option B (extend doc model) breaks the substrate for no gain; Option C (flatten) destroys publisher structure |
| Dexie v2 → v3 migration | HIGH | Additive-only schema extension (Pitfall 9 honored); no data migration; existing recovery surfaces cover the migration automatically; the union-with-defaults pattern for new optional fields mirrors v1.0's readingMode migration |
| SSRF/XSS defense | HIGH | OWASP SSRF Prevention Cheat Sheet essentials are well-established; the structural insight (doc model as security boundary) reuses the v1.0 property that made fixtures XSS-safe |
| Export/import bundle | HIGH | Reuses all existing Zod schemas; the dry-run preview pattern is standard for conflict-sensitive imports; forward-compatibility check prevents silent partial imports |
| Build order | HIGH | Respects the user's URL+HTML-first sequencing intent AND substrate dependencies; each phase has a clear non-negotiable rationale |

---

## Gaps to Address in Phase-Specific Research

These are open questions that the roadmapper should flag for phase-specific research (e.g., via `gsd-spec-phase` or `gsd-discuss-phase`):

1. **Cloudflare Pages Functions specifics** (Phase 7): exact compatibility flags needed for `jsdom` (likely `nodejs_compat_v2`); Wrangler local dev configuration; the precise `vite.config.ts` `server.proxy` setup. A 1-day spike in Phase 7's first plan should resolve this.

2. **Readability corpus quality** (Phase 7): the v1.0 D-01 genre matrix (Aeon, MDN, Wikipedia, SEP) should be re-run through the production pipeline to characterize extraction quality. Some genres may extract poorly; the corpus may need expansion. The Phase 7 plan should include a calibration step analogous to v1.0's Pretext calibration (Plan 03-02).

3. **EPUB chapter-extraction fidelity** (Phase 12): the unmaintained `epub2` parser must be validated against 3–5 real EPUBs (different publishers, different EPUB versions) before promotion. The Phase 12 plan should include a corpus-validation checkpoint that can block the phase if quality is insufficient (fallback: defer EPUB to v2.1 or write a minimal in-house parser).

4. **PDF structure-detection thresholds** (Phase 11): the font-size → heading-level mapping and the vertical-gap → paragraph-boundary detection need calibration on real PDFs. The Phase 11 plan should include a calibration harness analogous to v1.0's Pretext calibration.

5. **Export bundle size at scale** (Phase 9): the streaming-bundle question is unlikely to matter for v2.0 (libraries of <1000 articles are 1–5 MB compressed) but should be revisited if the bundle format is expected to survive into v2.x with much larger libraries.

6. **`bookId` location semantics** (Phase 12): "resume in book X" requires deriving the last-read chapter from per-chapter `LocationRecord`s. The derivation logic (last `savedAt` across chapter articles sharing a `bookId`) is straightforward but should be specified in the Phase 12 SPEC.md.

---

## Sources

- [@mozilla/readability npm package](https://www.npmjs.com/package/@mozilla/readability) — 0.6.0, 2.8M weekly, Apache-2.0; Firefox Reader View engine; Mozilla explicitly recommends DOMPurify + CSP for untrusted input; `serializer: (el) => el` for DOM output; `isProbablyReaderable` cheap pre-check (HIGH).
- [isomorphic-dompurify npm package](https://www.npmjs.com/package/isomorphic-dompurify) — 3.22.0, 5.4M weekly, MIT; jsdom-backed server-side DOMPurify wrapper; `clearWindow()` releases jsdom state in long-running Node processes; v3.0+ requires Node ^20.19 || ^22.12 || >=24 (HIGH).
- [unpdf npm package](https://www.npmjs.com/package/unpdf) — 1.8.0, 2.5M weekly, MIT; unjs collective; serverless PDF.js v5.6.205 wrapper; CF Workers compatible; explicit "Processing Untrusted PDFs" section (`maxImageSize`, `numPages` cap, timeout race); extractText + extractTextItems (positional) (HIGH).
- [epub2 npm package](https://www.npmjs.com/package/epub2) — 3.0.2, 170K weekly, ISC; **last published 3+ years ago (unmaintained)**; 66 dependents; fork of older `epub`; `EPub.createAsync(file)` → `epub.flow` chapter list → `getChapter(id, cb)` returns HTML; UTF-8 only; zipfile dep (HIGH for capability; MEDIUM for long-term maintenance).
- [epubjs npm package](https://www.npmjs.com/package/epubjs) — 0.3.93, 106K weekly, BSD-2-Clause; **last published 4+ years ago (unmaintained)**; browser RENDERER (iframe-based), not just a parser; heavier than needed for ingest-only use (HIGH for capability; rejected for v2.0 ingest path).
- [remark npm package](https://www.npmjs.com/package/remark) — 15.0.1, 5.2M weekly, MIT; unified collective; ESM-only; parses CommonMark to mdast; mdast node types map cleanly to Lem Reader's 9-kind Block model (HIGH).
- [Cloudflare Pages Functions: Get started](https://developers.cloudflare.com/pages/functions/get-started/) — `/functions` dir at project root (not in `/dist`); `onRequest(context)` handler; same-origin by default; Workers runtime; Node.js compat flags + bindings (D1/R2/KV); deploy via Git or Wrangler (HIGH).
- [OWASP Server-Side Request Forgery](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery) and the SSRF Prevention Cheat Sheet — SSRF attack vectors (cloud metadata at `169.254.169.254`, internal DB interfaces, `file://` URIs, DNS rebinding); prevention via URL scheme allowlist, private-IP blocklist, DNS pinning (HIGH).
- **Project substrate (treated as canonical, not re-researched):** `.planning/PROJECT.md` (v1.0 Current State, Key Decisions, v2.0 milestone goals), `.planning/milestones/v1.0-ROADMAP.md` (phase history), `src/content/schema.ts` (9-kind Zod doc model + Provenance + ReaderSettings + Location + Highlight + Note schemas), `src/persistence/db.ts` (Dexie v1/v2 reserved schema + Pitfall 9 invariants), `src/content/repository.ts` (ArticleRepository interface + inMemoryRepository), `src/App.tsx` (hash router + SettingsProvider + mode-toggle bridge), `src/fixtures/index.ts` (bundled-JSON fixture loader, Pitfall 8), `package.json` (v1.0 dependency set) — all HIGH confidence as the canonical substrate definition.

---
*Architecture research for: v2.0 Personal Library integration into Lem Reader's v1.0 substrate*
*Researched: 2026-08-10*
