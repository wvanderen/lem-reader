# Phase 7: Ingestion Substrate - Research

**Researched:** 2026-08-10
**Domain:** Stateless ingestion backend (Cloudflare Pages Functions) + SSRF/XSS defense + extraction (Readability) → canonical doc model + Dexie v3 + repository swap
**Confidence:** HIGH (substrate: OWASP, Readability, DOMPurify, Dexie all verified current) · MEDIUM (jsdom-on-Workers compat — empirically spike-gated) · MEDIUM (SSRF DNS-pinning on Workers — platform-specific)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (do NOT re-litigate)

**Carrying forward (locked by v1.0 milestone research):**
- Backend shape — **stateless edge function, same-origin `POST /api/ingest`.** Client never sees raw fetched HTML. REJECTED: client-side fetch; Vite-SSR-as-production.
- Pipeline — SSRF-safe fetch → `@mozilla/readability` extract → DOMPurify sanitize → DOM walk → 9-kind Block tree → `ArticleSchema.parse()`.
- One normalizer, one path (Pitfall 2). Reuse v1.0's exact normalization module. A round-trip anchor test gates every ingested article.
- **Dexie v3** (additive; v1/v2 byte-unchanged per Pitfall 9) + `ArticleSource` enum + `IngestionMeta` sub-schema.
- Immutability — save-once, read-forever. Refresh = delete + re-save.
- Images stay as remote `httpUrl` — CSP `img-src 'self' https: data:` preserved.
- Confidence model — derived multi-signal. `extractionConfidence = blockCount >= 3 && textLength >= 500 ? "high" : "low"`, gated by `isProbablyReaderable()`. Three states (confident / low-confidence / unsupported). Thresholds are researcher-discretion (the *contract* is locked).
- SSRF guard matrix (Pitfall 3 — 9 measures) is a phase-exit regression suite.
- mXSS regression suite (DOMPurify Attack Classes payloads; zero `dangerouslySetInnerHTML`) is a phase-exit gate.
- DOMPurify config — strict allowlist; FORBID SVG + MathML.
- Resource caps — fetch timeout ~30s, content-type allow-list (`text/html`, `application/xhtml+xml`), max-content-length guard, AbortSignal.
- `/server` adapter boundary — all server code in `/server` so it ports by changing only `/functions`.

**Surface scope:**
- **D7-01:** Minimal proof form — small "Add by URL / paste HTML" control; NO library cards/tags/search/badges (Phase 8). Phase 7 has NO `UI hint: yes`.
- **D7-02:** Merge into existing list — `ArticleRepository` swaps from `inMemoryRepository` to a Dexie-backed source that MERGES fixtures + ingested articles behind the SAME `list()`/`open(id)` interface. The D-08 hook lands here.
- **D7-03:** URL + paste-HTML inputs (both feed the same `/api/ingest` pipeline). File-upload (.html picker) defers to Phase 8.
- **D7-04:** Reuse existing failure-surfacing patterns (`.status` live region D2-13/D3-04; PAGE-09 fallback banner). Zero new disclosure vocabulary.

**Deployment platform:**
- **D7-05:** Cloudflare Pages Functions is the PRIMARY target (dev + acceptance tests). `/functions/api/ingest.ts` with `onRequest(context)`; accept the jsdom-on-Workers compat spike (`nodejs_compat_v2` flag); `linkedom` fallback if jsdom too heavy (see D7-10). All server code stays in `/server`.
- **D7-06:** Split CI — mXSS + extraction + normalization run as PURE Node/Playwright unit tests against `/server` directly (fast, deterministic); SSRF matrix runs as INTEGRATION tests against real `wrangler pages dev` in CI.

**Identity & duplicates:**
- **D7-07:** `id = slugify(final canonical URL after redirects)`. Re-ingest of the same URL is REFUSED with a calm "already in your library" message. Two different URLs with identical content = two entries.
- **D7-08:** `Provenance.sourceUrl` becomes `.optional()` (additive). Add `origin` discriminator on `IngestionMeta` (`"url" | "paste"`). `originalHtmlHash` still provides traceability.

**Extraction stack:**
- **D7-09:** `@mozilla/readability` 0.6.0 is the extractor. **Defuddle NOT evaluated** (the adapter boundary keeps it swappable later). `isProbablyReaderable()` is the cheap pre-check.
- **D7-10:** jsdom primary via `nodejs_compat_v2`, linkedom fallback (single-platform). The mXSS regression suite GATES whether linkedom-DOMPurify is safe to promote. If linkedom fails attack payloads, the hybrid contingency (extraction+sanitize on a Node-runtime function, Workers only for SSRF-safe fetch) is the fallback.

### the agent's Discretion (research delivers, planner confirms)

- **Confidence thresholds** — validate/tune `blockCount >= 3 && textLength >= 500` against a real-publisher corpus; may add signals (link density, semantic-block ratio). Three-state *contract* is locked; thresholds are empirical.
- **Slug algorithm details** — IDN/punycode handling, trailing-slash/query-string normalization, collision-resolution. The `id = slugify(canonical URL)` *contract* (D7-07) is locked; the normalization rules are the researcher's.
- **Local-dev mechanism** — `wrangler pages dev` via `vite.config.ts server.proxy` vs `@cloudflare/vite-plugin`. Operational; resolve which + exact config (research flags this as a first-plan spike).
- **SSRF guard implementation** — DNS pinning vs per-hop re-resolution, library vs hand-rolled, exact allowlist/blocklist sources (OWASP Cheat Sheet is the authority). The 9-measure *matrix* (Pitfall 3) is locked; the implementation is the researcher's.
- **`IngestionMeta`/`ArticleSource` schema field names + Dexie v3 store/index shape** — propose the shape following the Pitfall 9 (additive, byte-unchanged v1/v2) precedent.
- **Timeout/size-cap exact numbers** — suggest ~30s / content-length guard; lock the specifics.

### Deferred Ideas (OUT OF SCOPE)
- Library surface (cards, badges, tags, search, recently-read, reading-progress) — **Phase 8** (LIB-01..06).
- File-upload (.html via picker) — **Phase 8** (D7-03).
- Markdown intake — **Phase 8** (ING-03).
- PDF intake — **Phase 11** (ING-04).
- EPUB intake — **Phase 12** (ING-05).
- Export/import — **Phase 9** (PORT-01..03).
- Image proxying/rehosting — not in Phase 7.
- Re-extraction / content-freshness affordance — locked OUT by save-once-read-forever.
- Defuddle evaluation — not in Phase 7 (D7-09).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-01 | Reader can add an article by entering a URL; the reader fetches, extracts, and normalizes the page into the canonical document model. | §Architecture Patterns (Pipeline), §Standard Stack (Readability 0.6.0 + DOMPurify), §Code Examples (safeFetch + Readability + sanitize + htmlToBlocks). SC#1 round-trip anchor gate in §Validation Architecture. |
| ING-02 | Reader can add an article by pasting or uploading HTML, normalized through the same pipeline. | §Architecture Patterns (input-source-agnostic pipeline; D7-08 `origin: "paste"`); the paste path skips safeFetch and feeds HTML directly into the Readability→DOMPurify→htmlToBlocks stages. File-upload picker deferred to P8. |
| ING-06 | Reader is shown an honest "couldn't read this" state when extraction cannot reliably produce content — no silent garbage; a derived multi-signal confidence replaces Readability's absent score. | §Architecture Patterns (Confidence model + three-state outcome); §Standard Stack (isProbablyReaderable); researcher-discretion threshold table in §Confidence Thresholds. |
| ING-07 | Ingested content is sanitized and rendered through the canonical document model; the doc model is the security boundary; sanitize once at ingest, never `dangerouslySetInnerHTML`. | §Architecture Patterns (4-layer XSS defense); §Security Domain (V5 Input Validation); mXSS regression suite in §Validation Architecture. |
| ING-08 | The ingestion service refuses private, internal, and cloud-metadata endpoints and caps redirects (SSRF — OWASP Case 2). | §Standard Stack (ip-address, node:dns); §Code Examples (safeFetch); SSRF regression matrix in §Validation Architecture; OWASP Cheat Sheet deny-list in §SSRF Guard Implementation. |
</phase_requirements>

## Summary

Phase 7 adds exactly one new runtime layer — a stateless Cloudflare Pages Function at `POST /api/ingest` — that turns a URL or pasted-HTML page into a validated `CanonicalArticle` JSON the shipped v1.0 reader treats identically to a fixture. The pipeline is locked: SSRF-safe fetch → Readability extract → DOMPurify sanitize → DOM walk → 9-kind Block tree → `ArticleSchema.parse()` → client saves to Dexie v3 → the existing reader opens it unchanged. The client never sees raw fetched HTML; the doc model IS the XSS security boundary (Block JSON, never HTML, never `dangerouslySetInnerHTML`). The `ArticleRepository` interface swaps from `inMemoryRepository` to a Dexie-backed source that merges fixtures + ingested articles behind the same `list()`/`open(id)` contract.

**The phase has three load-bearing empirical risks that drive the wave structure.** (1) **jsdom-on-Workers compat** is the single highest-novelty item: jsdom is a heavy Node-oriented package, and whether it imports + runs cleanly on the Workers runtime with `nodejs_compat` is unproven. The D7-05 spike must front-load this; if jsdom fails, the linkedom fallback (D7-10) must survive the mXSS regression suite before promotion, and the hybrid contingency (Node-runtime function for extract+sanitize, Workers only for SSRF-safe fetch) is the last resort. (2) **SSRF DNS-pinning on Workers** is non-trivial: Workers `fetch()` performs its own DNS resolution, so true DNS pinning (resolve → connect to literal IP) is not achievable via standard `fetch()`. `dns.promises.resolve4/6` works via DoH for IP validation, and the `cf.resolveOverride` option is the Cloudflare-specific pinning mechanism — both need spike verification. (3) **Confidence thresholds** are empirical: the `blockCount >= 3 && textLength >= 500` formula ships from research but must be validated against a real-publisher corpus.

**Primary recommendation:** Front-load the jsdom-on-Workers spike as Wave 1 (it gates the entire extraction approach). Use `dns.promises.resolve4/6` + the `ip-address` library for SSRF IP validation (OWASP-recommended, not exposed to encoding bypasses), and spike `cf.resolveOverride` for DNS pinning. Pin `@mozilla/readability@0.6.0`, `isomorphic-dompurify@3.22.0`, `jsdom@30.0.1`, `ip-address@10.5.0`, and `wrangler@4.x` as new server-only dependencies (none enter the client bundle). The two phase-exit regression suites (SSRF matrix + mXSS suite) and the round-trip anchor gate and the v1→v3 Dexie migration snapshot are non-negotiable gates — they mirror v1.0's "honest full-suite execution discipline" (Key Decision #9) applied to the backend.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL fetch + SSRF guard | API / Backend (edge function) | — | Server-authoritative; client never fetches reader URLs. OWASP Case 2 deny-list lives here. |
| HTML extraction (Readability) | API / Backend (edge function) | — | CPU cost stays off the reader device; Mozilla-recommended server-side pattern. |
| HTML sanitization (DOMPurify) | API / Backend (edge function) | — | One audited place; `nodejs_compat` jsdom (or linkedom fallback). |
| Block-tree normalization (htmlToBlocks) | API / Backend (`/server`) | — | Reuses v1.0's exact `normalizeText` rules (Pitfall 2 — no fork). |
| Schema validation (`ArticleSchema.parse`) | API / Backend (boundary) | Client (re-validate on read) | Zod-at-boundary discipline (STATE-04); defense-in-depth. |
| Article identity (slug) | API / Backend (post-redirect) | Client (persistence) | Server sees the final canonical URL after redirects; client persists. |
| Persistence (Dexie v3) | Browser / Client | — | Local-first; `DexieLibrarySource` implements `ArticleRepository`. |
| Library list merge (fixtures + ingested) | Browser / Client | — | `compositeLibraryRepository` UNIONs bundled fixtures + Dexie rows. |
| Ingestion client glue (IngestionClient) | Browser / Client | — | Thin `fetch('/api/ingest')` wrapper; maps failure reasons to `.status`. |
| Reading engine / pagination / annotation | Browser / Client (v1.0 — UNCHANGED) | — | Source-agnostic; operates on `CanonicalArticle` shape regardless of origin. |

## Standard Stack

### Core (NEW server-only dependencies — none enter the client bundle)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mozilla/readability` | 0.6.0 | Firefox Reader View extraction engine; `isProbablyReaderable()` pre-check | `[VERIFIED: npm registry]` 2.8M weekly, Apache-2.0, Mozilla-maintained, the safe default (D7-09). `serializer: (el) => el` returns DOM not string. `parse()` mutates input — pass `document.cloneNode(true)`. |
| `isomorphic-dompurify` | 3.22.0 | Server-side DOMPurify wrapper (jsdom-backed); `clearWindow()` for long-running Workers | `[VERIFIED: npm registry]` 5.4M weekly, MIT. Pulls jsdom@28+. `DOMPurify(window)` factory form allows linkedom binding. Node `^20.19 \|\| ^22.12 \|\| >=24`. DOMPurify itself "not yet Web-Worker-compatible" per README — spike-gated on Workers. |
| `jsdom` | 30.0.1 (pin; or override to 25.0.1 if ESM issue surfaces) | DOM substrate for Readability + DOMPurify (primary path, D7-10) | `[VERIFIED: npm registry]` 91M weekly, MIT. isomorphic-dompurify already depends on it; pinning it explicitly lets us track CVEs (Pitfall 4). jsdom@28+ is ESM-only (documented `ERR_REQUIRE_ESM` issue #394 in CommonJS envs — Lem Reader is ESM `"type":"module"` so likely unaffected; spike must confirm). **happy-dom is explicitly unsafe per DOMPurify README — never use it.** |
| `ip-address` | 10.5.0 | IP parsing + private-range validation (OWASP-recommended for JS) | `[VERIFIED: npm registry + OWASP]` 85M weekly, MIT. OWASP Cheat Sheet: "Library ip-address… NOT exposed to bypass using Hex, Octal, Dword, URL and Mixed encoding." Handles IPv4-mapped-IPv6 normalization. |
| `wrangler` | 4.120.1 (devDep) | Cloudflare Pages Functions local dev (`wrangler pages dev`) + deploy | `[VERIFIED: npm registry]` 18M weekly, Apache-2.0, Cloudflare-official. Provides the real workerd runtime for the D7-06 SSRF integration tests. |
| `@cloudflare/vite-plugin` | 1.51.2 (devDep — SPIKE candidate) | Vite↔workerd integration; runs Worker code in the real Workers runtime during dev | `[VERIFIED: npm registry]` 5.2M weekly, Cloudflare-official. Higher fidelity than `wrangler pages dev` + proxy (runs in workerd, not a Node shim). Spike first; fall back to proxy if too invasive. |

### Supporting (already in the repo — REUSED, not re-added)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `linkedom` | 0.18.13 (existing devDep `^0.18.13`) | DOM fallback if jsdom proves too heavy on Workers (D7-10) | Only if the D7-05 spike rejects jsdom. Has `linkedom/worker` export. **DOMPurify-on-linkedom is UNVALIDATED** — the mXSS regression suite gates promotion. linkedom explicitly lacks DOM spec compliance (no live collections). |
| `zod` | 4.4.3 (existing dep) | `ArticleSchema.parse()` boundary validation | Reused verbatim — the trust boundary. New `ArticleSource` + `IngestionMeta` sub-schemas added here. |
| `dexie` | 4.4.4 (existing dep) | v3 schema append (additive; v1/v2 byte-unchanged) | `DexieLibrarySource` writes/reads; `compositeLibraryRepository` merges with fixtures. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@mozilla/readability` 0.6.0 | Defuddle 0.19.2 | `[REJECTED by D7-09]` Defuddle NOT evaluated in Phase 7. Readability is the safe default; the `htmlToBlocks` adapter boundary keeps Defuddle swappable in a later phase. Note: `.planning/research/STACK.md` recommended Defuddle-primary, but CONTEXT.md D7-09 overrides it for this phase. |
| Cloudflare Pages Functions | Hono on a separate Node service | `[REJECTED by D7-05]` STACK.md recommended Hono, but CONTEXT.md locks Cloudflare Pages Functions. Hono adds an always-on server runtime v1.0 deliberately avoided. `/server` adapter keeps Hono port-open. |
| `ip-address` | `private-ip` + `is-ip` | `[ASSUMED]` STACK.md suggested the combo. `ip-address` is OWASP-recommended and handles IPv4-mapped-IPv6 in one library; simpler. Planner may add `private-ip` as a convenience wrapper if desired. |
| `@cloudflare/vite-plugin` | `wrangler pages dev` + `server.proxy` | Spike resolves (D7-05). Plugin = higher fidelity (real workerd); proxy = lighter touch (keeps existing Vite SPA dev server). Recommend plugin-first, proxy-fallback. |

**Installation:**
```bash
# Server-only deps (gated behind /server imports — NEVER in client bundle)
npm install @mozilla/readability@0.6.0 isomorphic-dompurify@3.22.0 jsdom@30.0.1 ip-address@10.5.0

# Dev deps (local Cloudflare runtime + deploy)
npm install -D wrangler@4.120.1 @cloudflare/vite-plugin@1.51.2
```

**Version verification (run 2026-08-10):** all versions confirmed via `npm view <pkg> version` (see Verification Protocol). No `postinstall` scripts on any package (verified). isomorphic-dompurify published 5 days ago (3.22.0); jsdom@30.0.1 published 2026-07-29; all are current.

## Package Legitimacy Audit

> Package Legitimacy Gate run via `gsd-tools query package-legitimacy check` (2026-08-10).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@mozilla/readability` | npm | mature (0.6.0, Mar 2025) | 2.8M/wk | github.com/mozilla/readability | OK | Approved |
| `isomorphic-dompurify` | npm | active (3.22.0, 5 days ago) | 5.4M/wk | github.com/kkomelin/isomorphic-dompurify | SUS (`too-new` flag — false positive) | Approved — flag is a false positive from recent publish; 5.4M weekly + 519 dependents confirms legitimacy |
| `jsdom` | npm | active (30.0.1, Jul 2026) | 91M/wk | github.com/jsdom/jsdom | SUS (`too-new` flag — false positive) | Approved — flag is a false positive; 91M weekly is among the highest on npm; the canonical Node DOM |
| `linkedom` | npm | active (0.18.13) | 4.2M/wk | github.com/WebReflection/linkedom | OK | Approved (already a devDep) |
| `wrangler` | npm | active (4.120.1, today) | 18M/wk | github.com/cloudflare/workers-sdk | SUS (`too-new` flag — false positive) | Approved — Cloudflare-official; `too-new` reflects rapid release cadence, not illegitimacy |
| `@cloudflare/vite-plugin` | npm | active (1.51.2, today) | 5.2M/wk | github.com/cloudflare/workers-sdk | SUS (`too-new` flag — false positive) | Approved — Cloudflare-official; same repo as wrangler |
| `ip-address` | npm | mature (10.5.0) | 85M/wk | github.com/beaugunderson/ip-address | SUS (`too-new` flag — false positive) | Approved — OWASP-recommended; 85M weekly; flag is a false positive |

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious [SUS]:** none requiring checkpoint — all `SUS` verdicts are `too-new` false positives on actively-maintained, high-download, official-source packages. The legitimacy gate's recency heuristic fires because these packages publish frequently (Wrangler/Cloudflare plugin publish near-daily); the download counts (5M–91M weekly) and source repos (mozilla, cloudflare, jsdom org) conclusively establish legitimacy.

*All packages above were verified via `npm view <pkg> version` AND confirmed against official documentation (OWASP Cheat Sheet for `ip-address`; Mozilla Readability README; isomorphic-dompurify npm README; Cloudflare Workers docs for wrangler/vite-plugin).*

## Architecture Patterns

### System Architecture Diagram

```
READER DEVICE (browser)                    CLOUDFLARE PAGES (co-deployed)
─────────────────────                      ──────────────────────────────
┌──────────────────────┐                   ┌─────────────────────────────────────┐
│ FixtureList (+minimal│                   │ POST /api/ingest  (onRequest)        │
│  ingest control, D7-01)│  fetch same-    │ /functions/api/ingest.ts             │
│  ┌────────────────┐  │  origin          │  │                                  │
│  │ IngestionClient│─────────────────────┼─▶ 1. SCHEME allowlist (http/https)  │
│  │  (thin wrapper)│  │  POST /api/ingest│  2. safeFetch(url):                │
│  └───────┬────────┘  │   {url} | {html} │     dns.promises.resolve4/6        │
│          │article JSON│                  │     → ip-address deny-list check   │
│          ▼           │                  │     → fetch(redirect:"manual")     │
│  ArticleSchema.parse │                  │     → size cap + content-type gate  │
│  (re-validate)       │                  │  3. Readability.extract(jsdomDoc)   │
│          │           │                  │     isProbablyReaderable() pre-check│
│          ▼           │                  │  4. DOMPurify.sanitize(strict)      │
│  DexieLibrarySource  │                  │     USE_PROFILES:{html:true}        │
│  .save(article, meta)│                  │     FORBID svg/math/script/iframe   │
│          │           │                  │     clearWindow()                  │
│          ▼           │                  │  5. htmlToBlocks(sanitizedDom):     │
│  Dexie v3 (articles  │                  │     DOM walk → 9-kind Block tree    │
│   + source/addedAt   │                  │     unmapped → UnsupportedBlock     │
│   indexes)           │                  │  6. ArticleSchema.parse()           │
│          │           │                  │     (Zod-at-boundary)               │
│          ▼           │                  │  7. round-trip anchor GATE:          │
│  compositeLibrary    │◀────article JSON─┼─│  deriveQuoteSelector → resolve →   │
│  Repository.list()   │                  │  │  must reach "confident" (SC#1)   │
│  (MERGE fixtures +   │                  │  └──────────────────────────────────│
│   Dexie rows)        │                  │     /server/* (platform-agnostic)   │
│          │           │                  └─────────────────────────────────────┘
│          ▼           │
│  ArticleView (v1.0,  │
│   UNCHANGED) reads   │  ◀── reader paginates/annotates/restores identically
│   via open(id)       │       to a fixture (load-bearing invariant)
└──────────────────────┘
```

A reader submits a URL → `IngestionClient` POSTs same-origin → the edge function runs the 7-stage pipeline → returns validated `CanonicalArticle` JSON → the client re-validates with `ArticleSchema.parse()` → saves to Dexie v3 → the existing `FixtureList` (transitional, D7-02) merges it with fixtures → the reader opens it in the UNCHANGED `ArticleView`. The pipeline is input-source-agnostic: a paste-HTML request (`{html}`) skips `safeFetch` (stage 1–2) and enters at stage 3 (Readability) with a synthetic JSDOM; a URL request (`{url}`) runs the full pipeline.

### Recommended Project Structure

```
lem-reader/
├── src/                              # CLIENT (Vite SPA — build unchanged)
│   ├── content/
│   │   ├── schema.ts                 # EXTENDED: ArticleSource enum + IngestionMeta + Provenance.sourceUrl.optional()
│   │   ├── normalizeText.ts          # UNCHANGED (Pitfall 2 — THE shared normalizer)
│   │   └── repository.ts             # EXTENDED: compositeLibraryRepository + DexieLibrarySource swap (D7-02)
│   ├── persistence/
│   │   └── db.ts                     # EXTENDED: version(3) append (additive indexes; v1/v2 byte-unchanged)
│   ├── ingestion/                    # NEW — client glue
│   │   ├── IngestionClient.ts        # fetch('/api/ingest') + honest-failure reason mapping
│   │   ├── DexieLibrarySource.ts     # ArticleRepository impl over Dexie v3
│   │   └── types.ts                  # IngestionRequest, IngestionResponse, IngestionFailureReason
│   └── routes/FixtureList.tsx        # TRANSITIONAL (D7-02): minimal ingest control mounts here; P8 replaces with LibraryView
├── functions/                        # NEW — Cloudflare Pages Functions (NOT in /dist)
│   └── api/ingest.ts                 # onRequest(context) — thin adapter, delegates to /server
├── server/                           # NEW — platform-agnostic server library (imported only by functions/)
│   ├── ingest.ts                     # pipeline orchestrator: dispatch → normalize → ArticleSchema.parse
│   ├── safeFetch.ts                  # SSRF guard: scheme + DNS resolve + ip-address deny-list + redirect cap
│   ├── htmlToBlocks.ts               # Readability + DOMPurify + DOM walk → 9-kind Block tree
│   ├── confidence.ts                 # three-state confidence model (confident/low/unsupported)
│   ├── slugify.ts                    # canonical-URL → slug (D7-07)
│   └── limits.ts                     # timeoutMs, maxBytes, content-type allowlist
├── wrangler.toml                     # NEW — compatibility_flags:["nodejs_compat"], compat_date, bindings
├── vite.config.ts                    # EXTENDED — @cloudflare/vite-plugin OR server.proxy → wrangler (spike-resolved)
└── tests/
    ├── unit/server/                  # NEW — mXSS + extraction + normalization + confidence (pure Node)
    └── e2e/ingestion/                # NEW — SSRF matrix against real wrangler pages dev (D7-06)
```

### Pattern 1: The 7-Stage Stateless Pipeline (input-source-agnostic)

**What:** Every ingestion request funnels through one stateless `onRequest` handler that runs a fixed 7-stage transform from raw input to validated `CanonicalArticle` JSON.

**When to use:** Every URL and paste-HTML ingestion (ING-01, ING-02).

**Example:**
```typescript
// server/ingest.ts — the pipeline orchestrator (platform-agnostic)
import { safeFetch } from "./safeFetch";
import { extractAndNormalize } from "./htmlToBlocks";
import { deriveConfidence } from "./confidence";
import { ArticleSchema, type CanonicalArticle } from "../src/content/schema";

export async function ingest(input: { url?: string; html?: string }) {
  // Stages 1-2: FETCH (URL path only; paste path synthesizes a JSDOM directly)
  let html: string; let finalUrl: string | undefined;
  if (input.url) {
    const fetched = await safeFetch(input.url);   // SSRF guard, redirect cap, size cap
    html = fetched.html; finalUrl = fetched.finalUrl;
  } else {
    html = input.html!;                            // paste path — no fetch, no SSRF surface
  }

  // Stages 3-5: EXTRACT → SANITIZE → htmlToBlocks (all in /server/htmlToBlocks)
  const { blocks, footnotes, lang, provenancePartial } =
    await extractAndNormalize(html, finalUrl);     // Readability + DOMPurify + DOM walk

  // Stage 6: VALIDATE — ArticleSchema.parse() (Zod-at-boundary)
  const article = ArticleSchema.parse({
    id: slugifyUrl(finalUrl ?? `paste-${sha256(html).slice(0,12)}`),  // D7-07
    revision: 1, lang, provenance: { ...provenancePartial, retrievedAt: new Date().toISOString(), originalHtmlHash: sha256(html) },
    blocks, footnotes,
  });

  // Stage 7: ROUND-TRIP ANCHOR GATE (SC#1) — refuse entry if it can't round-trip
  assertRoundTripAnchor(article);                  // deriveQuoteSelector → resolve → must be "confident"

  // Honest three-state confidence (ING-06)
  const confidence = deriveConfidence(article);    // { state: "confident"|"low"|"unsupported", reason? }
  if (confidence.state === "unsupported") {
    return { ok: false, reason: confidence.reason } satisfies IngestionFailure;
  }
  return { ok: true, article, confidence };
}
```
*Source: ARCHITECTURE.md Pattern 2 + CONTEXT.md pipeline lock; adapted for the input-source-agnostic D7-03 contract.*

### Pattern 2: The 4-Layer XSS Defense (doc model IS the security boundary)

```
Layer 1 (server, post-extract):   DOMPurify.sanitize(html, {
                                     USE_PROFILES: { html: true },          // NO svg/mathml
                                     ALLOWED_TAGS: SANITIZE_ALLOWLIST,       // only what maps to a Block kind
                                     ALLOWED_ATTR: ["href","title","alt","src","cite"],
                                     FORBID_TAGS: ["script","style","iframe","object","embed","form","input","link","meta","base"],
                                     ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,  // no javascript:/data:
                                   })
Layer 2 (server, post-sanitize):  htmlToBlocks DOM walker
                                   → typed Block tree (no HTML survives)
                                   → link hrefs pass ArticleSchema's linkableUrl refinement
Layer 3 (persist):                ArticleSchema.parse() — Zod boundary
                                   → URL scheme allow-lists (http/https/mailto for links; http/https for figures)
Layer 4 (render):                 React semantic renderer — text React-escaped by default
                                   → ZERO dangerouslySetInnerHTML (ESLint react/no-danger, already enforced)
                                   → CSP connect-src 'self' (tightens, not loosens)
```

**The key architectural insight:** by transforming arbitrary HTML into the canonical Block tree AT THE SERVER during ingestion, **no arbitrary HTML is ever persisted or rendered**. The 9 block kinds + 4 inline marks are an allowlist-by-construction; anything outside becomes `UnsupportedBlock`. `[CITED: ARCHITECTURE.md Pattern 8]`

### Pattern 3: Dexie v3 Additive Append (Pitfall 9)

```typescript
// src/persistence/db.ts — APPEND version(3); v1/v2 byte-unchanged
this.version(3).stores({
  // articles: existing "id, revision" UNCHANGED; ADD source + addedAt indexes
  // (Dexie indexes are additive — re-indexes on next open, no row migration)
  articles: "id, revision, source, addedAt",   // source for filter-by-origin; addedAt for sort
  settings: "key",
  location: "[articleId+revision]",
  highlights: "id, [articleId+revision]",
  notes: "id, highlightId",
});
// NO .upgrade() callback — additive indexes only; v1/v2 rows untouched.
// The compositeLibraryRepository (D7-02) UNIONs bundled fixtures (in-memory) with Dexie rows.
```
*Source: ARCHITECTURE.md Pattern 5 + db.ts current v1/v2 declaration. The `articles` store was reserved in v1 (Phase 1) but never written to (fixtures are bundled JSON); v3 is the first version that writes user rows. `[CITED: db.ts L81-106]`*

### Pattern 4: Round-Trip Anchor Gate (SC#1 — the integration truth)

```typescript
// server/ingest.ts — runs AFTER ArticleSchema.parse, BEFORE returning the article
import { normalizeText, graphemeClusters, deriveQuoteSelector, resolveQuoteSelector }
  from "../src/content/normalizeText";   // THE shared normalizer (Pitfall 2 — no fork)

function assertRoundTripAnchor(article: CanonicalArticle): void {
  const total = graphemeClusters(normalizeText(article), article.lang).length;
  // Pick N deterministic sample offsets (start, 25%, 50%, 75%, near-end)
  const samples = [0, Math.floor(total*0.25), Math.floor(total*0.5), Math.floor(total*0.75), Math.max(0, total-32)];
  for (const start of samples) {
    const end = Math.min(total, start + 20);
    if (end <= start) continue;
    const selector = deriveQuoteSelector(article, { start, end });
    const resolved = resolveQuoteSelector(article, selector, { start, end });
    if (resolved !== "confident" && typeof resolved !== "object") {
      // "ambiguous" or "orphan" — refuse entry (Pitfall 2: round-trip is the gate)
      throw new IngestionError("round-trip-anchor-failed");
    }
  }
}
```
*Source: PITFALLS.md Pitfall 2 ("Round-trip test every extracted article") + normalizeText.ts (`deriveQuoteSelector`/`resolveQuoteSelector` tri-state). Reuses the EXACT shipped machinery — no fork. `[CITED: normalizeText.ts L133-179]`*

### Anti-Patterns to Avoid

- **Persisting raw extracted HTML** — doubles storage, tempts `dangerouslySetInnerHTML` later, blows IDB quota. Persist only the Block tree.
- **`isProbablyReaderable()` as the ONLY ingestion gate** — false positives let garbage into the library (Pitfall 5). Pair with the derived confidence model from day one.
- **Client-side URL fetching** — CORS-impossible; CSP must open `connect-src`; SSRF defense moves to the bypassable client. All fetch is server-side.
- **`fetch(url)` with `redirect: 'follow'`** — validation bypass via 302 to a metadata endpoint (Pitfall 3). Use `redirect: "manual"` and re-validate every hop.
- **Editing v1/v2 Dexie version blocks** — breaks the upgrade chain (Pitfall 9). Append `version(3)` only.
- **A "raw HTML" block kind as an escape hatch** — reintroduces the entire XSS class. Extend the doc model or mark `UnsupportedBlock`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IP parsing + private-range check | Regex / `String.includes` on IP strings | `ip-address@10.5.0` (OWASP-recommended) | Naive parsers are exposed to hex/octal/dword/URL-encoding bypasses (Pitfall 3); `ip-address` is OWASP-verified NOT exposed. Handles IPv4-mapped-IPv6 normalization. |
| HTML extraction | Custom DOM heuristics | `@mozilla/readability@0.6.0` | Battle-tested Firefox engine; extraction quality is a research-grade problem — never hand-roll. |
| HTML sanitization | Regex-based tag stripping | `isomorphic-dompurify@3.22.0` (jsdom-backed) | Cure53-audited; mXSS/mutation attacks defeat every regex approach. String-in/string-out sanitizers (`sanitize-html`) have weaker pedigree. |
| Text normalization | Extraction-specific whitespace/Unicode handling | Reuse `src/content/normalizeText.ts` verbatim | Forking it silently orphans every annotation anchor (Pitfall 2 — the load-bearing failure). |
| Slug generation | Ad-hoc `url.toLowerCase().replace(...)` | A real URL parser (`new URL`) + IDN-aware rules | IDN/punycode, trailing-slash, query-string, fragment edge cases; see §Slug Algorithm. |
| Quote-selector round-trip | Custom text-search | `deriveQuoteSelector` + `resolveQuoteSelector` (shipped) | Already handles the `Intl.Segmenter` grapheme substrate + tri-state resolution. |
| SSRF redirect validation | Trust the initial URL | Per-hop re-validation through `safeFetch` | A 302 to `169.254.169.254` bypasses initial validation (Pitfall 3 measure 2). |

**Key insight:** every one of these has a shipped or library-owned solution. The phase's novelty is the PIPELINE ORCHESTRATION and the Workers-compat spike — not reinventing any of these primitives.

## SSRF Guard Implementation (researcher-discretion deliverable)

> The 9-measure *matrix* (Pitfall 3) is locked; this section delivers the implementation recommendation.

### DNS resolution on Workers — the central constraint

**`node:dns` on Workers is partially supported** `[CITED: developers.cloudflare.com/workers/runtime-apis/nodejs/dns]`:
- ✅ `dns.promises.resolve4(hostname)` and `dns.promises.resolve6(hostname)` WORK — they resolve via DNS-over-HTTPS to Cloudflare's 1.1.1.1.
- ❌ `dns.lookup`, `dns.lookupService`, and `dns.resolve` (callback form) throw `"Not implemented"`.
- ⚠️ Each DNS query counts as a **subrequest** against the Worker's limit (50 free tier / 1000 paid).

**Implication:** the STACK.md recommendation of "undici `connect.lookup` for DNS pinning" is **NOT viable on Workers** — undici isn't available, and `connect.lookup` relies on `dns.lookup` which throws. The implementation must use `dns.promises.resolve4/6`.

### DNS pinning on Workers — the TOCTOU question

Workers' native `fetch(url)` performs its OWN internal DNS resolution. There is no standard-API way to say "connect to this literal IP with this Host header" on Workers. This creates a TOCTOU window: you resolve + validate via `dns.promises.resolve4/6`, then call `fetch(url)`, and Workers re-resolves internally — a DNS-rebinding attacker could in principle return a public IP at validation time and a private IP at fetch time.

**Three mitigation options (researcher recommendation in priority order):**

1. **`cf.resolveOverride` (Cloudflare-specific, PREFERRED — needs spike confirmation) `[ASSUMED]`:** Workers `fetch()` accepts a `cf` option. `cf.resolveOverride` is documented to override the DNS resolution for a hostname. If the spike confirms it works, this gives true DNS pinning: resolve via `dns.promises.resolve4`, validate, then `fetch(url, { cf: { resolveOverride: validatedIp } })`. **This is the cleanest answer but MUST be verified in the Wave-1 spike.**
2. **Validate-then-fetch with acknowledged TOCTOU (FALLBACK):** Resolve via `dns.promises.resolve4/6`, validate ALL resolved IPs are public, then call `fetch(url)` and accept the small window. For a prototype on Cloudflare's network, rebinding risk is LOW because Cloudflare's resolvers cache aggressively and the attacker would need to win a race against Workers' sub-millisecond fetch. **Document the residual risk honestly.**
3. **Hybrid (the D7-10 fallback extreme):** Workers handles ONLY the SSRF-safe fetch; extraction + sanitization run on a Node-runtime function (Cloudflare Pages can deploy Node functions too). Heavier; defer to only if both options above fail.

### Recommended implementation shape

```typescript
// server/safeFetch.ts — the SSRF guard (platform-agnostic; uses node:dns + ip-address)
import dns from "node:dns";
import { Address4, Address6 } from "ip-address";

const PRIVATE_RANGES = [   // OWASP deny-list minimum (Case 2) — CITED: OWASP SSRF Cheat Sheet
  "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", // link-local + cloud-metadata
  "127.0.0.0/8", "0.0.0.0/8", "100.64.0.0/10",                       // CGNAT
  "224.0.0.0/4",                                                        // multicast
  "::1/128", "fc00::/7", "fe80::/10", "ff00::/8",                      // IPv6
];
const METADATA_HOSTNAMES = ["169.254.169.254", "metadata.google.internal", "metadata.amazonaws.com"];

export async function safeFetch(rawUrl: string): Promise<FetchedContent> {
  // Measure 1: SCHEME allowlist
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new IngestionError("ssrf-blocked-scheme");
  // Measure 5: block metadata hostnames explicitly
  if (METADATA_HOSTNAMES.includes(parsed.hostname)) throw new IngestionError("ssrf-blocked-metadata");

  // Measure 3 + 4: DNS RESOLVE then validate EVERY resolved IP
  const [v4, v6] = await Promise.all([
    dns.promises.resolve4(parsed.hostname).catch(() => []),
    dns.promises.resolve6(parsed.hostname).catch(() => []),
  ]);
  const allIps = [...v4, ...v6];
  if (allIps.length === 0) throw new IngestionError("dns-unresolved");
  for (const ip of allIps) {
    if (isPrivateIp(ip, PRIVATE_RANGES)) throw new IngestionError("ssrf-blocked-private-ip");
  }

  // Measure 3 (DNS pinning): fetch with the validated IP pinned (spike-gated)
  const res = await fetch(rawUrl, {
    redirect: "manual",                              // Measure 2: disable auto-follow
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // Measure 8: timeout
    // cf: { resolveOverride: allIps[0] },           // ← spike must confirm this works
    headers: { "User-Agent": "LemReader/2.0 (+https://lem-reader.app)" },
  });

  // Measure 2: redirect cap — re-validate each hop (loop up to MAX_REDIRECTS)
  if ([301,302,303,307,308].includes(res.status)) {
    return followRedirect(res, 0);   // re-runs safeFetch on the Location header
  }

  // Measure 7: NO upstream body on validation failure (check before reading body)
  // Measure 8: size cap + content-type allowlist
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new IngestionError("response-too-large");
  const contentType = res.headers.get("content-type") ?? "";
  if (!ALLOWED_CONTENT_TYPES.some(t => contentType.includes(t))) throw new IngestionError("unsupported-content-type");

  const html = await res.text();
  return { html, finalUrl: res.url, contentType, hash: await sha256(html) };
}
```
*Sources: OWASP SSRF Cheat Sheet (Case 2) `[CITED]`; ARCHITECTURE.md Pattern 8 `[CITED]`; Cloudflare Workers node:dns docs `[CITED]`.*

### The 9 measures (locked matrix → implementation mapping)

| # | Measure (Pitfall 3) | Implementation |
|---|---------------------|----------------|
| 1 | Scheme allowlist http(s)-only | `new URL()` + protocol check; reject `file:`, `gopher:`, `data:`, `dict:`, `ftp:`, `smb:` |
| 2 | Disable redirect-follow; re-validate per hop | `fetch(url, { redirect: "manual" })` + recursive `safeFetch(Location)` capped at 3–5 hops |
| 3 | Resolve once, connect to the resolved IP (DNS pinning) | `dns.promises.resolve4/6` + `cf.resolveOverride` (spike-gated) — see §DNS pinning |
| 4 | Normalize IP forms before checking | `ip-address` library (OWASP-verified not exposed to encoding bypasses); normalize IPv4-mapped-IPv6 |
| 5 | Block metadata hostnames explicitly | `METADATA_HOSTNAMES` array: `169.254.169.254`, `metadata.google.internal`, `metadata.amazonaws.com` |
| 6 | Egress allowlist at network layer | Cloudflare's network is the belt; application-layer deny-list is the suspenders. Document the residual. |
| 7 | No response body on validation failure | Throw `IngestionError` BEFORE `res.text()`; return only structured `{ reason }` |
| 8 | Cap size, timeout, concurrency | `AbortSignal.timeout(30_000)`; content-length guard; `MAX_RESPONSE_BYTES` (suggest 5 MB) |
| 9 | SSRF regression suite (CI gate) | `tests/e2e/ingestion/ssrf-matrix.spec.ts` against real `wrangler pages dev` (see §Validation Architecture) |

## The jsdom-on-Workers Spike (D7-05/D7-10) — Wave-1 front-load

> **This is the single highest-novelty, highest-risk item in the phase.** The planner MUST front-load it as Wave 1; its outcome gates the entire extraction approach.

### What the spike must determine

1. **Does `jsdom` import + construct on Workers with `nodejs_compat`?** jsdom is a heavy Node-oriented package. Workers provides `node:fs`, `node:http`, `node:net` (🟢 supported) and `node:dns` (🟡 partial) under `nodejs_compat`. jsdom's canvas dependency and some native-ish bits may not survive. The spike must `import { JSDOM } from "jsdom"; new JSDOM(html, { url })` and confirm a working `window.document`.
2. **Does `isomorphic-dompurify` 3.22.0 work end-to-end?** It pulls jsdom@28+ (ESM-only). The documented `ERR_REQUIRE_ESM` issue (#394) affects CommonJS envs; Lem Reader is ESM (`"type":"module"`) so likely unaffected — but the spike must confirm `sanitize(dirty)` returns clean output. Note: isomorphic-dompurify README says DOMPurify itself is "not yet Web-Worker-compatible" — Workers is Worker-like, so this is a real risk.
3. **Does `@mozilla/readability` parse a jsdom document on Workers?** Readability needs a DOM `document`. Confirm `new Readability(jsdomDoc.window.document).parse()` returns a valid `{ title, content, textContent, length, ... }`.
4. **Memory + cold-start:** does `clearWindow()` (isomorphic-dompurify) release jsdom state acceptably in a long-running Worker? Cold start under 5 ms (Cloudflare's claim) is unlikely with jsdom in the bundle — measure realistically.

### Spike acceptance criteria (gate the primary path)

- ✅ **jsdom path PASSES** if: JSDOM constructs + Readability parses + DOMPurify sanitizes + the mXSS regression suite passes on a representative payload set. → Ship jsdom primary; no fallback needed.
- ⚠️ **jsdom path FAILS, linkedom fallback evaluated** if: jsdom constructs but is too heavy/slow OR fails on Workers. Switch to `linkedom/worker` for the DOM substrate, bind DOMPurify via `DOMPurify(linkedomWindow)`. **The mXSS regression suite (D7-06) is the GATE** — if linkedom-DOMPurify fails ANY attack payload, linkedom is REJECTED and the hybrid contingency (next) is the fallback. linkedom explicitly lacks DOM spec compliance (no live collections like `getElementsByTagName`), which DOMPurify may rely on `[CITED: linkedom README FAQ]`.
- 🚨 **Hybrid contingency (last resort):** if both jsdom and linkedom fail the mXSS gate on Workers, move extraction+sanitize to a Node-runtime function (Cloudflare Pages supports Node functions). Workers handles ONLY the SSRF-safe fetch. Heavier; defer to only if the spike conclusively rejects both Worker-local options.

### Why this must be Wave 1

The entire pipeline architecture (Pattern 1) assumes extraction+sanitize run on the edge function. If the spike rejects that, the architecture shifts to the hybrid contingency (different `/functions` + `/server` split, different test harness). Discovering this late forces a replan. Front-loading it in Wave 1 with a 1-day timebox is the cheapest insurance.

## Slug Algorithm (researcher-discretion deliverable)

> The `id = slugify(canonical URL)` *contract* (D7-07) is locked; these are the normalization rules.

### Recommended normalization rules

```typescript
// server/slugify.ts
import { format as formatUrl } from "node:url";

export function slugifyUrl(canonicalUrl: string): string {
  const parsed = new URL(canonicalUrl);
  // 1. IDN/punycode: normalize the hostname to ASCII punycode (URL.hostname already does this for IDN;
  //    e.g. "münchen.de" → "xn--mnchen-3ya.de"). node:url format ensures consistency.
  // 2. Lowercase the hostname.
  // 3. Strip default ports (:80 http, :443 https).
  // 4. Strip fragment (#...).
  // 5. Normalize path: remove trailing slash (except root "/"), decode+re-encode percent-encoding,
  //    collapse // runs, lowercase the scheme+host (path is case-sensitive — preserve).
  // 6. Strip known tracking query params (utm_*, fbclid, gclid, ref, ...) — keeps the slug stable
  //    across marketing variants (FEATURES.md Anti-Feature: "URL-normalize before de-dup").
  // 7. Sort remaining query params alphabetically (so ?b=2&a=1 and ?a=1&b=2 slugify identically).
  // 8. Hash the normalized URL to a fixed-length slug if it exceeds the ArticleSchema.id regex
  //    (/^[a-z0-9-]+$/) or is longer than ~80 chars.
  const cleaned = formatUrl(parsed, { fragment: false });
  const normalized = stripTrackingParams(cleaned);
  const slug = humanishSlug(normalized);   // e.g. "example-com-article-title" if short + clean
  return /^[a-z0-9-]+$/.test(slug) && slug.length <= 80
    ? slug
    : `u-${shortHash(normalized)}`;        // fallback: hash-based, no collision risk
}
```

### Collision resolution (D7-07: "two different URLs that extract identical content = two entries")

The slug is derived from the **canonical URL after redirects**, NOT from content. Two distinct URLs slugify identically ONLY if they normalize to the same canonical URL — which D7-07 treats as a re-ingest (REFUSE with "already in your library"). If two genuinely distinct URLs produce the same slug via the `humanishSlug` path (rare — e.g. two articles with the same title on the same domain), the hash fallback (`u-<shortHash>`) disambiguates because the normalized URLs differ. **No content-hash dedupe** (D7-07 explicitly rejected content-hash + allow-duplicates).

### IDN/punycode

`new URL("https://münchen.de/artikel").hostname` returns `"xn--mnchen-3ya.de"` (punycode) in modern Node/Workers — the `URL` constructor handles IDN automatically. The slug is ASCII-clean by construction, satisfying `/^[a-z0-9-]+$/`.

## Confidence Thresholds (researcher-discretion deliverable)

> The three-state *contract* (confident / low-confidence / unsupported) is locked; thresholds are empirical.

### Recommended starting thresholds (ship from research; tune against corpus)

| Signal | Threshold | Rationale |
|--------|-----------|-----------|
| `isProbablyReaderable(doc)` returns `false` | → **unsupported** ("couldn't reliably read this page") | Readability's own cheap pre-check; documented false-pos/neg but a strong negative signal. `[CITED: Readability README]` |
| `blockCount >= 3 AND textLength >= 500` | → **confident** (enter library, normal surfacing) | Matches Readability's own `charThreshold: 500` default; 3 blocks is the minimum for a real article (title + 2 paragraphs). |
| `blockCount < 3 OR textLength < 500` (but readerable) | → **low-confidence** (enter library, flagged; quiet "may be incomplete" banner on first open) | Honest: something extracted, but it's thin. Reuses PAGE-09 fallback banner (D7-04). |
| `unsupportedBlockRatio > 0.4` (40%+ of blocks are `UnsupportedBlock`) | → **low-confidence** (even if blockCount/textLength pass) | Pitfall 1: a high unsupported ratio means extraction grabbed chrome, not article body. |
| `textToContentRatio < 0.5` (textContent much shorter than content HTML) | → **low-confidence** | FEATURES.md Pitfall 5 signal: nav/list pages are markup-heavy, text-light. `[ASSUMED — add only if corpus warrants]` |
| `linkDensity > 0.4` (40%+ of inline runs are links) | → **low-confidence** | FEATURES.md Pitfall 5: real articles have sparse inline links. `[ASSUMED — add only if corpus warrants]` |

### Corpus validation (a Wave-1 calibration step, analogous to v1.0's PAGE-08)

Ship the `blockCount >= 3 && textLength >= 500` formula as the default. Add a calibration harness that runs ~10 real publisher URLs (the v1.0 D-01 genre matrix: Aeon long-form essay, MDN technical post, Wikipedia figure-heavy, SEP footnoted, list-reference, plus 4–5 NEW real articles) through the pipeline and records the confidence signals. **Tune the thresholds only if the default misclassifies** (e.g. a known-good article lands in `low-confidence`, or a known-paywalled page lands in `confident`). The three-state *contract* never changes; only the numbers.

## `IngestionMeta` / `ArticleSource` Schema + Dexie v3 Shape (researcher-discretion deliverable)

> Proposing the shape following the Pitfall 9 (additive, byte-unchanged v1/v2) precedent. The planner confirms exact field names.

### Proposed schema additions (`src/content/schema.ts`)

```typescript
// Additive to existing ArticleSchema — v1.0 fixtures hydrate via .default() (Pitfall 9 pattern,
// mirroring readingMode's .default("paginated") in ReaderSettingsSchema).

export const ArticleSourceSchema = z.enum([
  "fixture",      // v1.0 bundled JSON (default for backward-compat)
  "url",          // ING-01 — fetched from a URL
  "paste",        // ING-02 — pasted HTML (D7-08 origin discriminator)
  // "markdown", "pdf", "epub-chapter" reserved for Phases 8/11/12
]);
export type ArticleSource = z.infer<typeof ArticleSourceSchema>;

export const IngestionMetaSchema = z.object({
  source: ArticleSourceSchema,
  origin: z.enum(["url", "paste"]).optional(),         // D7-08: hides "open original" for paste articles
  sourceUrl: httpUrl.optional(),                        // D7-08: Provenance.sourceUrl mirror (optional for paste)
  originalHtmlHash: z.string(),                         // SHA-256 of fetched/pasted HTML (traceability)
  fetchedAt: z.string().datetime().optional(),          // ISO-8601 (present for url; absent for paste)
  extractionConfidence: z.enum(["high", "low"]),        // the derived signal
  extractionWarnings: z.array(z.string()).default([]),  // e.g. "3 unsupported blocks omitted"
});
export type IngestionMeta = z.infer<typeof IngestionMetaSchema>;

// Article gains an optional ingestionMeta (defaults to {source:"fixture",...} for v1.0 fixtures).
// Provenance.sourceUrl becomes .optional() (D7-08) — fixtures still supply it, so backward-compatible.
export const ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  revision: z.number().int().min(1),
  lang: z.string().min(2),
  provenance: Provenance,                  // sourceUrl now optional
  blocks: z.array(BlockSchema).min(1),
  footnotes: z.array(FootnoteBody).default([]),
  ingestionMeta: IngestionMetaSchema.optional(),   // NEW — fixtures omit it (default on read)
});
```

### Proposed Dexie v3 block (`src/persistence/db.ts`)

```typescript
this.version(3).stores({
  // articles: ADD source + addedAt indexes (additive — re-indexes on open, no row migration)
  articles: "id, revision, source, addedAt",
  settings: "key",                         // unchanged
  location: "[articleId+revision]",        // unchanged
  highlights: "id, [articleId+revision]",  // unchanged
  notes: "id, highlightId",               // unchanged
});
// NO .upgrade() — additive indexes only.
// `source` indexes into the article row's ingestionMeta.source field for filter-by-origin.
// `addedAt` indexes into ingestionMeta.fetchedAt (or a derived timestamp) for sort-by-recency.
```

### Backward-compatibility proof

- **v1.0 fixtures** are bundled JSON that does NOT include `ingestionMeta`. On read via `ArticleSchema.parse()`, the `.optional()` field hydrates to `undefined`; the `compositeLibraryRepository` synthesizes `{ source: "fixture" }` for display. No fixture file changes.
- **v1/v2 Dexie blocks** are byte-unchanged (Pitfall 9). v3 only ADDS indexes; existing rows (of which there are ZERO in the `articles` store — fixtures are bundled JSON, not Dexie rows) are untouched.
- **`Provenance.sourceUrl` → `.optional()`** is additive: existing fixtures supply it, so they parse identically; paste articles (D7-08) omit it.

## Timeout / Size-Cap Exact Numbers (researcher-discretion deliverable)

| Limit | Recommended value | Rationale |
|-------|-------------------|-----------|
| Fetch timeout | **30 seconds** (`AbortSignal.timeout(30_000)`) | CONTEXT.md "~30s"; Cloudflare Workers CPU limit is 30s on most plans. Generous enough for slow publishers; tight enough to prevent the fetcher being weaponized as a DoS amplifier. |
| Max response bytes | **5 MB** (`MAX_RESPONSE_BYTES`) | A real article HTML is 100KB–2MB; 5 MB caps pathological pages without rejecting legitimate long-form. Readwise caps uploads at 500 MB; 5 MB for a single fetched HTML is conservative. |
| Redirect cap | **5 hops** | OWASP recommends 3–5. 5 covers legitimate redirect chains (e.g. medium.com → cdn) without enabling redirect-loops. |
| Content-type allowlist | `text/html`, `application/xhtml+xml` | CONTEXT.md lock. Reject `application/pdf`, `image/*`, `text/plain` (not articles), etc. |
| Worker subrequest budget | **~10** (DNS resolve + fetch + redirect hops) | Workers free tier = 50 subrequests/paid = 1000. Each `dns.promises.resolve4/6` is 1 subrequest; each `fetch` is 1; redirect re-validation adds more. Stay well under 50. |

## Local-Dev Mechanism (D7-05 — researcher/spike resolves; flagged as Wave-1 spike)

> Two options; the spike picks one. Recommendation: **plugin-first, proxy-fallback.**

### Option A: `@cloudflare/vite-plugin` (PREFERRED — higher fidelity)

`[CITED: developers.cloudflare.com/workers/vite-plugin]` The official Cloudflare Vite plugin runs Worker code inside the **real workerd runtime** during `vite dev`, matching production behavior as closely as possible. It supports SPAs with an integrated backend API, leverages Vite's HMR, and supports `vite preview` against the Workers runtime.

```typescript
// vite.config.ts (Option A — spike target)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],   // runs /functions in workerd alongside the SPA
});
```

**Pro:** highest fidelity — the D7-06 SSRF integration tests run against the SAME runtime as production. The jsdom-on-Workers spike (above) gets its answer in dev, not just CI. HMR preserved.
**Con:** fuller integration; may change the Vite SPA dev experience (e.g. dev-server port, asset serving). The spike must confirm the existing v1.0 SPA dev flow (Playwright `webServer` on `:5173`) still works.

### Option B: `wrangler pages dev` + `vite.config.ts server.proxy` (FALLBACK — lighter touch)

Run two processes: `vite dev` (the SPA, existing) + `wrangler pages dev` (the function). The SPA proxies `/api` to the Wrangler process.

```typescript
// vite.config.ts (Option B — fallback)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8788",   // wrangler pages dev default port
    },
  },
});
```

**Pro:** keeps the existing Vite SPA dev server byte-unchanged (zero risk to v1.0 dev flow); the proxy is a 4-line addition.
**Con:** `wrangler pages dev` runs workerd but the SPA runs on the Node Vite server — two runtimes in dev. The jsdom-on-Workers spike answer is less authoritative (workerd-from-wrangler may differ subtly from production).

### Recommendation

**Spike Option A first** (`@cloudflare/vite-plugin`) in Wave 1 alongside the jsdom compat spike — they share the same workerd-runtime verification. If the plugin breaks the v1.0 Playwright `webServer` setup or the SPA dev experience, fall back to Option B. Either way, the D7-06 SSRF integration tests run against a real workerd process, not a Node shim.

## DOMPurify Strict Config (the sanitize-then-render boundary)

> The doc model IS the security boundary (ING-07). DOMPurify runs ONCE at ingest; the Block tree is what persists and renders.

```typescript
// server/htmlToBlocks.ts — the sanitize stage
import DOMPurify from "isomorphic-dompurify";

// STRICT allowlist — ONLY what maps to a v1.0 Block kind (schema.ts). Anything else is dropped
// or becomes UnsupportedBlock. This is the structural XSS defense (Pattern 2, Layer 1).
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },                    // NO svg, NO mathml (Pitfall 4)
  ALLOWED_TAGS: [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",       // HeadingBlock
    "ul", "ol", "li",                               // BulletedListBlock / NumberedListBlock
    "blockquote",                                   // BlockquoteBlock
    "pre", "code",                                  // CodeBlock
    "a",                                            // LinkMark
    "strong", "em",                                 // StrongMark / EmMark
    "img", "figure", "figcaption",                  // FigureBlock (src httpUrl only)
    "br", "hr",                                     // structural
    "sup",                                          // FootnoteReferenceBlock (marker)
  ],
  ALLOWED_ATTR: ["href", "title", "alt", "src", "cite"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "link", "meta", "base", "svg", "math"],
  // Keep DOMPurify's default URI regex (blocks javascript:) — do NOT set ALLOW_UNKNOWN_PROTOCOLS
  ALLOW_DATA_ATTR: false,
};

// After sanitize, walk the DOM → Block tree. Any tag NOT in the 9 kinds → UnsupportedBlock
// (DOC-06 disclosure — "a table was omitted", "an embedded video was omitted").
export function sanitizeExtractedHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  return clean;
}
// Then: htmlToBlocks walks `clean` (a sanitized HTML string → re-parse to DOM → map to Block kinds).
// clearWindow() releases jsdom state — CRITICAL for long-running Workers (isomorphic-dompurify README).
```

**Pitfall 4 defenses baked in:**
- `USE_PROFILES: { html: true }` — no SVG/MathML (the mXSS attack surface).
- Explicit `ALLOWED_TAGS` — no `ADD_TAGS` widening.
- `ALLOW_DATA_ATTR: false` — no `data-*` clobbering surface.
- Default `ALLOWED_URI_REGEXP` kept (blocks `javascript:`).
- **NEVER** re-parse sanitized HTML to a string then back to DOM then render — the sanitize-then-re-introduce risk. Sanitize once → DOM walk → Block tree → React renders Block JSON.

`[CITED: isomorphic-dompurify README + DOMPurify README + PITFALLS.md Pitfall 4]`

## The Split CI (D7-06) — harness layout recommendation

> Two security matrices, two test shapes — mirrors v1.0's "real-browser for layout truth" discipline applied to the backend.

```
tests/
├── unit/
│   └── server/                       # PURE Node — fast, deterministic, no platform runtime
│       ├── mxss.spec.ts              # DOMPurify Attack Classes payloads → assert clean Block tree
│       ├── extraction.spec.ts        # representative publisher corpus → Readability output
│       ├── normalization.spec.ts     # htmlToBlocks → normalizeText → round-trip anchor gate
│       ├── confidence.spec.ts        # three-state model thresholds
│       └── slugify.spec.ts           # IDN/trailing-slash/tracking-param normalization
└── e2e/
    └── ingestion/
        ├── ssrf-matrix.spec.ts       # REAL wrangler pages dev — the only honest way to test fetch+DNS+redirect
        ├── happy-path.spec.ts        # real publisher URL → article opens in reader (SC#1)
        └── dexie-migration.spec.ts   # v1 fixture snapshot → v3 upgrade → every record intact (SC#5)
```

### Why the split

| Matrix | Shape | Why |
|--------|-------|-----|
| **mXSS regression** (`mxss.spec.ts`) | Pure Node unit test | DOMPurify output is deterministic regardless of platform. Fast feedback; no workerd cold-start. Run on every commit. |
| **Extraction + normalization** (`extraction/normalization/confidence/slugify.spec.ts`) | Pure Node unit tests | Readability + htmlToBlocks + normalizeText are pure functions over a DOM. No platform dependency. |
| **SSRF matrix** (`ssrf-matrix.spec.ts`) | Integration test against real `wrangler pages dev` | DNS resolution (`dns.promises.resolve4`), redirect following (`fetch({redirect:"manual"})`), and `cf.resolveOverride` are platform-specific. The ONLY honest way to test them is in the real workerd runtime. `[CITED: CONTEXT.md D7-06]` |
| **v1→v3 Dexie migration** (`dexie-migration.spec.ts`) | Playwright e2e (or pure-Node with fake-indexeddb) | IndexedDB migration must run against a real Dexie instance. Playwright (chromium) is the v1.0 precedent. |

## Common Pitfalls

### Pitfall A: jsdom-on-Workers fails (the Wave-1 spike risk)
**What goes wrong:** jsdom imports but throws at construction time (canvas dep, missing Node API, ESM/CJS resolution), OR isomorphic-dompurify returns malformed output because DOMPurify "is not yet Web-Worker-compatible."
**Why it happens:** Workers is Worker-like, not Node. jsdom assumes Node. DOMPurify was designed for browser/jsdom windows.
**How to avoid:** Front-load the spike (Wave 1). Have the linkedom fallback + hybrid contingency ready. The mXSS regression suite is the gate.
**Warning signs:** `import { JSDOM } from "jsdom"` throws in `wrangler dev`; `DOMPurify.sanitize(payload)` returns the payload unmodified (sanitizer no-op'd).

### Pitfall B: DNS-rebinding via the Workers TOCTOU window
**What goes wrong:** You validate `dns.promises.resolve4("evil.com")` → public IP, then `fetch(url)` re-resolves to `127.0.0.1`.
**Why it happens:** Workers `fetch()` does its own DNS resolution; there's no standard-API way to pin the IP.
**How to avoid:** Spike `cf.resolveOverride` for true pinning. If unavailable, document the residual TOCTOU risk honestly — for a prototype on Cloudflare's network (aggressive resolver caching), rebinding risk is low but nonzero.
**Warning signs:** The SSRF matrix's "DNS-rebinding simulation" test passes in pure-Node (where you control the resolver) but fails against real `wrangler pages dev`.

### Pitfall C: Normalization drift (Pitfall 2 — the load-bearing failure)
**What goes wrong:** Highlights created on an ingested article don't round-trip; `TextQuoteSelector` resolution returns `ambiguous` more often on ingested content.
**Why it happens:** Extraction-specific whitespace/Unicode handling forks from v1.0's `normalizeText`.
**How to avoid:** ONE normalizer — reuse `src/content/normalizeText.ts` verbatim. The round-trip anchor gate (Pattern 4) refuses entry to any article that can't round-trip.
**Warning signs:** `htmlToBlocks` has its own `collapseWhitespace` helper; two extracts of the same URL produce different normalized-text lengths.

### Pitfall D: Sanitize-then-re-introduce (Pitfall 4 — the cardinal foot-gun)
**What goes wrong:** Sanitized HTML is re-parsed to a string, modified, and rendered via `dangerouslySetInnerHTML` — re-introducing an mXSS payload that survived in the re-serialized form.
**Why it happens:** "Run it through DOMPurify" feels sufficient and isn't.
**How to avoid:** Sanitize ONCE at ingest → DOM walk → Block tree → React renders Block JSON. ZERO `dangerouslySetInnerHTML` (ESLint `react/no-danger` already enforces this in v1.0). The doc model IS the boundary.
**Warning signs:** Any `dangerouslySetInnerHTML` in the codebase; a "raw HTML" block kind; sanitizing then calling `.innerHTML` downstream.

### Pitfall E: Silent garbage into the library (Pitfall 5 — DOC-06 violation)
**What goes wrong:** A paywalled article's "Subscribe to read…" text extracts as the article body; a JS-only SPA extracts an empty `<div id="root">`; both enter the library as "successful."
**Why it happens:** `isProbablyReaderable` has documented false positives; Readability exposes no confidence score.
**How to avoid:** The derived multi-signal confidence model (§Confidence Thresholds) + three-state outcome. Never let a `low-confidence`/`unsupported` become `confident` by default.
**Warning signs:** Every dogfooded URL "successfully" enters the library; no `low-confidence` or `unsupported` state exists.

### Pitfall F: Dexie v3 migration drops v1/v2 data (Pitfall 8/9)
**What goes wrong:** Editing the v1 or v2 version block to add indexes breaks the upgrade chain; a v1.0 reader's settings/location/highlights/notes are lost.
**Why it happens:** Dexie's upgrade chain is indexed by version number; mutating a shipped block corrupts it.
**How to avoid:** APPEND `version(3)` only; v1/v2 byte-unchanged (db.ts L81-106). The v1→v3 migration snapshot test (SC#5) is a phase-exit gate.
**Warning signs:** A PR edits `this.version(1).stores({...})` or `this.version(2).stores({...})`; no migration test exists.

## Code Examples

### Example 1: The IngestionClient (client-side glue)
```typescript
// src/ingestion/IngestionClient.ts — thin fetch wrapper; maps honest-failure reasons
import { ArticleSchema, type CanonicalArticle } from "../content/schema";

export type IngestionFailureReason =
  | "ssrf-blocked-scheme" | "ssrf-blocked-private-ip" | "ssrf-blocked-metadata"
  | "fetch-failed" | "response-too-large" | "unsupported-content-type"
  | "extraction-too-low-confidence" | "round-trip-anchor-failed" | "server-error";

export class IngestionError extends Error {
  constructor(public reason: IngestionFailureReason) { super(reason); }
}

export async function ingestUrl(url: string): Promise<CanonicalArticle> {
  return ingest({ url });
}
export async function ingestHtml(html: string): Promise<CanonicalArticle> {
  return ingest({ html });
}

async function ingest(body: { url?: string; html?: string }): Promise<CanonicalArticle> {
  const res = await fetch("/api/ingest", {   // SAME-ORIGIN (CSP connect-src 'self')
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 400) {
    const { reason } = await res.json() as { reason: IngestionFailureReason };
    throw new IngestionError(reason);        // → .status live region (D7-04)
  }
  if (!res.ok) throw new IngestionError("server-error");
  const article = (await res.json()).article;
  return ArticleSchema.parse(article);       // Zod-at-boundary re-validate (STATE-04)
}
```
*Source: ARCHITECTURE.md Pattern 1 `[CITED]`; INGESTION RESEARCH §Component Responsibilities.*

### Example 2: The `htmlToBlocks` DOM walker (the production-grade promotion of v1.0's throwaway script)
```typescript
// server/htmlToBlocks.ts — DOM walk → 9-kind Block tree (exhaustive switch, no default — Pattern F)
import type { Block, InlineRun } from "../src/content/types";

export function htmlToBlocks(
  sanitizedDom: Document,                    // already DOMPurify-clean
  sourceUrl: string,
): { blocks: Block[]; footnotes: FootnoteBody[]; lang: string; provenancePartial: Partial<Provenance> } {
  const blocks: Block[] = [];
  const walker = documentWalker(sanitizedDom.body);   // TreeWalker or recursive descent
  for (const node of walker) {
    const block = mapNodeToBlock(node);                // exhaustive tag → Block kind switch
    if (block) blocks.push(block);
    // unmapped tags → UnsupportedBlock { originalKind: node.tagName, plainDescription: "..." }
  }
  return { blocks, footnotes: [], lang: detectLang(sanitizedDom), provenancePartial: extractProvenance(sanitizedDom) };

  function mapNodeToBlock(node: Element): Block | null {
    switch (node.tagName.toLowerCase()) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        return { kind: "heading", level: Number(node.tagName[1]), content: inlineRuns(node) };
      case "p": return { kind: "paragraph", content: inlineRuns(node) };
      case "blockquote": return { kind: "blockquote", children: Array.from(node.children).flatMap(mapNodeToBlock) };
      case "ul": return { kind: "bulleted-list", items: listItems(node) };
      case "ol": return { kind: "numbered-list", items: listItems(node), start: Number(node.getAttribute("start") ?? 1) };
      case "pre": return { kind: "code-block", language: codeLanguage(node), source: node.textContent ?? "" };
      case "figure": return figureBlock(node);
      case "img": return figureBlock(node.parentElement?.tagName === "figure" ? node.parentElement : node);
      // anything else → UnsupportedBlock (DOC-06 disclosure — REUSED not reinvented)
      default: return { kind: "unsupported", originalKind: node.tagName.toLowerCase(), plainDescription: describeUnsupported(node) };
    }
  }
}
```
*Source: ARCHITECTURE.md Pattern 2 stage 4 `[CITED]`; v1.0 throwaway linkedom script (D-09 ancestor).*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `nodejs_compat_v2` flag (separate) | Merged into `nodejs_compat` (compat date ≥ 2024-09-23) | 2024-09-23 | Use `nodejs_compat` + a current compat date; `nodejs_compat_v2` is implied. `[CITED: CF Workers nodejs docs]` |
| `dns.lookup` for resolution | `dns.promises.resolve4/6` (DoH to 1.1.1.1) on Workers | Workers runtime | `lookup`/`lookupService`/`resolve` throw "Not implemented"; use the promises API. `[CITED: CF Workers dns docs]` |
| `wrangler pages dev` + proxy (only option) | `@cloudflare/vite-plugin` (runs workerd in Vite dev) | 2025+ | Plugin gives higher-fidelity dev (real workerd); proxy is the lighter fallback. `[CITED: CF Vite plugin docs]` |
| isomorphic-dompurify with jsdom@25 | isomorphic-dompurify 3.22.0 with jsdom@28+ (ESM-only) | 2026 | jsdom@28+ is ESM-only; documented `ERR_REQUIRE_ESM` issue in CJS envs (Lem Reader is ESM, likely unaffected). |

**Deprecated/outdated:**
- **happy-dom for sanitization** — explicitly unsafe per DOMPurify README; never use it in the ingestion path (Pitfall 4).
- **`@postlight/node-readability`** — does not exist on npm; the real package is `@postlight/parser` (stale). Use `@mozilla/readability` (D7-09).
- **`fetch(url)` with `redirect: 'follow'`** — validation bypass via 302 to metadata; use `redirect: "manual"` + per-hop re-validation.

## Assumptions Log

> Claims tagged `[ASSUMED]` that need user/planner confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cf.resolveOverride` on Workers `fetch()` provides true DNS pinning (resolve → connect to validated IP) | SSRF Guard Implementation | If unsupported, fall back to validate-then-fetch with acknowledged TOCTOU; residual rebinding risk on Cloudflare's network is low. **Spike must confirm.** |
| A2 | jsdom@30.0.1 imports + constructs cleanly on Workers with `nodejs_compat` + current compat date | Standard Stack; jsdom Spike | If it fails, the linkedom fallback (D7-10) or hybrid contingency activates. The Wave-1 spike gates this. |
| A3 | `@cloudflare/vite-plugin` preserves the existing v1.0 Playwright `webServer` dev flow (port 5173, HMR) | Local-Dev Mechanism | If it breaks the SPA dev experience, fall back to `wrangler pages dev` + `server.proxy` (Option B). Spike resolves. |
| A4 | `textToContentRatio` and `linkDensity` confidence signals are worth adding beyond the base formula | Confidence Thresholds | If the corpus shows they don't improve classification, drop them; the base `blockCount >= 3 && textLength >= 500` stands. Low risk. |
| A5 | linkedom's `linkedom/worker` export + `DOMPurify(linkedomWindow)` produce sanitizer-safe output | jsdom Spike (fallback path) | The mXSS regression suite GATES this — if linkedom fails ANY payload, the hybrid contingency activates. Medium risk. |
| A6 | The existing `eslint.config.js` `react/no-danger` rule fires on `/server` + `/functions` code too | Security Domain (V5) | If the rule only covers `src/`, add an explicit grep gate for `dangerouslySetInnerHTML` repo-wide in the mXSS CI step. Low risk — easy to verify. |

**Note on STACK.md vs CONTEXT.md tension:** `.planning/research/STACK.md` (v2.0 milestone research) recommends **Defuddle-primary + Hono backend + undici connect.lookup + linkedom-as-DOM-substrate-rejected**. CONTEXT.md (the locked Phase-7 decision) overrides ALL of these for this phase: **Readability 0.6.0 (Defuddle NOT evaluated), Cloudflare Pages Functions, `dns.promises.resolve4/6`, jsdom-primary-with-linkedom-fallback**. This research follows CONTEXT.md as the authority. The planner should flag this tension if any task drifts toward the STACK.md recommendations — they are superseded for Phase 7 by D7-05/D7-09/D7-10.

## Open Questions

1. **Does `cf.resolveOverride` actually pin DNS on Workers `fetch()`?**
   - What we know: `dns.promises.resolve4/6` works for IP validation; Workers `fetch()` does its own internal resolution (TOCTOU window).
   - What's unclear: whether `fetch(url, { cf: { resolveOverride: ip } })` overrides that internal resolution.
   - Recommendation: the Wave-1 spike verifies this. If yes → true pinning. If no → validate-then-fetch with documented residual risk (acceptable for a prototype on CF's network).

2. **Does the existing `eslint.config.js` `react/no-danger` rule cover `/server` and `/functions` directories?**
   - What we know: v1.0 enforces it on `src/`.
   - What's unclear: whether the ESLint config's `ignores` or `files` patterns exclude the new server directories.
   - Recommendation: planner adds an explicit repo-wide grep gate for `dangerouslySetInnerHTML` as part of the mXSS CI step (defense-in-depth regardless of ESLint scope).

3. **Exact Wave structure for the jsdom spike + fallback chain**
   - What we know: jsdom is Wave 1; linkedom + hybrid are fallbacks.
   - What's unclear: whether to serialize (spike → decide → plan rest) or parallelize (plan the jsdom path while spiking, accept replan risk).
   - Recommendation: the planner sequences the spike as Wave 1 with a hard timebox; subsequent waves are planned after the spike outcome.

## Environment Availability

> Phase 7 introduces external runtime/tool dependencies beyond the v1.0 stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 20.19 (or 22 LTS) | Build, CI, Vitest | ✓ | 22.x (STACK.md baseline) | — |
| Cloudflare account (free tier) | `wrangler pages dev`, deploy | `[ASSUMED]` — not verified in environment | — | Local-only dev via `wrangler pages dev` works without deploy; SSRF integration tests need only the local workerd. |
| `wrangler` CLI | Local workerd runtime for SSRF integration tests | ✓ (devDep, installs via npm) | 4.120.1 | — |
| `nodejs_compat` flag + compat date ≥ 2024-09-23 | jsdom + `node:dns` on Workers | ✓ (wrangler.toml config) | — | — |
| Internet access (for corpus validation) | Real-publisher confidence-threshold calibration | `[ASSUMED]` — CI environment-dependent | — | Use cached HTML fixtures if CI is offline; the corpus-validation step can be local-only. |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** Cloudflare account/deploy is not required for Phase 7 development or the phase-exit gates — `wrangler pages dev` provides the real workerd runtime locally. Deploy verification is a Phase 8+ concern.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`. This section is REQUIRED.
> Phase 7 has **four phase-exit gates** that the Validation Architecture must structure: the SSRF regression matrix (SC#3), the mXSS regression suite (SC#4), the round-trip anchor gate (SC#1), and the v1→v3 Dexie migration snapshot (SC#5).

### Test Framework

| Property | Value |
|----------|-------|
| Framework (unit) | Vitest 4.1.10 (existing) + jsdom env for `/server` unit tests |
| Framework (e2e) | Playwright 1.61.1 (existing) — chromium/firefox/webkit for reader-flow; real `wrangler pages dev` for SSRF |
| Config file (unit) | `vitest.config.ts` (existing; extend with a `server` project for `/server` imports) |
| Config file (e2e) | `playwright.config.ts` (existing; extend `webServer` to boot `wrangler pages dev` alongside `vite dev`) |
| Quick run command | `npm run test:unit -- --run` (existing) |
| Full suite command | `npm run test` (existing — `test:unit --run && test:e2e`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-01 | URL → fetch+extract+normalize → valid CanonicalArticle; opens in reader; round-trip anchor gates entry | e2e (happy-path) + unit (pipeline) | `npx playwright test tests/e2e/ingestion/happy-path.spec.ts` | ❌ Wave 0 |
| ING-01 (round-trip gate) | Every ingested article passes N-offset TextPositionSelector+TextQuoteSelector → `confident` | unit (server) | `npx vitest run tests/unit/server/normalization.spec.ts` | ❌ Wave 0 |
| ING-02 | Paste HTML → same pipeline → same Block shape (`origin: "paste"`, no sourceUrl) | unit (server) | `npx vitest run tests/unit/server/extraction.spec.ts` | ❌ Wave 0 |
| ING-06 | Three-state confidence: confident/low/unsupported with reader-visible reason; no silent garbage | unit (server) | `npx vitest run tests/unit/server/confidence.spec.ts` | ❌ Wave 0 |
| ING-07 | mXSS regression: DOMPurify Attack Classes payloads → no script/on\*/javascript:/svg/math in Block tree; zero `dangerouslySetInnerHTML` repo-wide | unit (server) + repo grep gate | `npx vitest run tests/unit/server/mxss.spec.ts && npm run lint` | ❌ Wave 0 |
| ING-08 | SSRF matrix: private/loopback/link-local/CGNAT/cloud-metadata/dns-rebinding/redirect-into-internal all refused; no upstream body on refusal | e2e (integration, real wrangler) | `npx playwright test tests/e2e/ingestion/ssrf-matrix.spec.ts` | ❌ Wave 0 |
| SC#5 (Dexie v1→v3) | v1 fixture snapshot → v3 upgrade → every article/highlight/note/position/preference intact | e2e (or unit w/ fake-indexeddb) | `npx playwright test tests/e2e/ingestion/dexie-migration.spec.ts` | ❌ Wave 0 |

### The Four Phase-Exit Gates (detailed structure)

#### Gate 1: SSRF Regression Matrix (`tests/e2e/ingestion/ssrf-matrix.spec.ts`) — SC#3
Runs against REAL `wrangler pages dev` (the only honest way to exercise fetch+DNS+redirect). Must cover all 9 measures (Pitfall 3):
- **Scheme allowlist:** `file:///etc/passwd`, `gopher://`, `data:text/html,...`, `dict://`, `ftp://` → all refused.
- **Private/loopback/link-local IPs:** `http://10.0.0.1/`, `http://172.16.0.1/`, `http://192.168.0.1/`, `http://127.0.0.1/`, `http://0.0.0.0/`, `http://[::1]/`, `http://[fe80::1]/`, `http://[fc00::1]/` → all refused.
- **Cloud-metadata:** `http://169.254.169.254/latest/meta-data/`, `http://metadata.google.internal/`, `http://metadata.amazonaws.com/` → refused.
- **CGNAT:** `http://100.64.0.1/` → refused.
- **Encoding bypasses:** `0x7f000001`, `2130706433` (dword), `0177.0.0.1` (octal), `http://[::ffff:127.0.0.1]/` (IPv4-mapped IPv6) → all refused.
- **Redirect-into-internal:** a 302 from a public URL to `http://169.254.169.254/` → refused (per-hop re-validation).
- **DNS-rebinding simulation:** (hardest) a hostname that returns a public IP at resolve time, private at fetch time → refused OR documented residual risk.
- **No upstream body on refusal:** every refused request returns ONLY `{ reason }`, never the upstream bytes.

#### Gate 2: mXSS Regression Suite (`tests/unit/server/mxss.spec.ts`) — SC#4
Pure Node unit test (deterministic; fast). Feed DOMPurify's documented Attack Classes & Bypass History payloads `[CITED: DOMPurify wiki]` through the full pipeline (Readability mock → DOMPurify → htmlToBlocks) and assert the resulting Block tree contains:
- ZERO `<script>` (no script block kind exists anyway — but assert the source HTML doesn't leak).
- ZERO inline `on*` handlers (no Block kind carries event handlers).
- ZERO `javascript:` URLs (ArticleSchema's `linkableUrl` refinement rejects at parse — assert it fires).
- ZERO SVG/MathML (no Block kind maps to them; `USE_PROFILES: { html: true }` strips them).
- **Repo-wide grep gate:** `grep -r "dangerouslySetInnerHTML" src/ server/ functions/` returns ZERO matches (the structural XSS defense). Add as a CI step independent of ESLint.

#### Gate 3: Round-Trip Anchor Gate (`tests/unit/server/normalization.spec.ts` + inline in `server/ingest.ts`) — SC#1
The gate runs INLINE in the pipeline (Pattern 4) — every successfully ingested article MUST pass N-offset `deriveQuoteSelector` → `resolveQuoteSelector` → `confident` before it's returned to the client. The unit test asserts the gate fires correctly on representative fixtures + a sample of real extracted content. An ingested article that can't round-trip is REFUSED (`round-trip-anchor-failed`), not admitted to the library.

#### Gate 4: v1→v3 Dexie Migration Snapshot (`tests/e2e/ingestion/dexie-migration.spec.ts`) — SC#5
- Seed a Dexie v1/v2 database with the v1.0 fixture snapshot (settings, location, highlights, notes — representative rows).
- Trigger the v3 upgrade (open the DB with the new `version(3)` declaration).
- Assert EVERY v1.0 row is intact and addressable: settings readable, locations resolve, highlights re-anchor, notes attach.
- Mirrors v1.0's "honest full-suite execution discipline" (Key Decision #9) applied to the data layer.

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run` (fast; covers mXSS + extraction + normalization + confidence + slugify + migration-logic).
- **Per wave merge:** `npm run test` (full suite — adds the SSRF integration matrix + happy-path e2e + Dexie migration e2e across chromium/firefox/webkit).
- **Phase gate:** Full `npm run test` green before `/gsd-verify-work`. All four gates above MUST pass.

### Wave 0 Gaps
- [ ] `tests/unit/server/mxss.spec.ts` — covers ING-07 (mXSS gate, SC#4); DOMPurify Attack Classes payload corpus.
- [ ] `tests/unit/server/extraction.spec.ts` — covers ING-01/ING-02 (Readability output → Block tree).
- [ ] `tests/unit/server/normalization.spec.ts` — covers ING-01 (round-trip anchor gate, SC#1).
- [ ] `tests/unit/server/confidence.spec.ts` — covers ING-06 (three-state thresholds).
- [ ] `tests/unit/server/slugify.spec.ts` — covers D7-07 (IDN/tracking-param normalization).
- [ ] `tests/e2e/ingestion/ssrf-matrix.spec.ts` — covers ING-08 (SSRF gate, SC#3); requires `wrangler pages dev` in CI.
- [ ] `tests/e2e/ingestion/happy-path.spec.ts` — covers ING-01 (real URL → reader).
- [ ] `tests/e2e/ingestion/dexie-migration.spec.ts` — covers SC#5 (v1→v3 snapshot).
- [ ] Framework install: `wrangler@4.120.1` + `@cloudflare/vite-plugin@1.51.2` (devDeps) — Wave 0.
- [ ] `vitest.config.ts` extension: a `server` project that imports `/server` code with the jsdom env.
- [ ] `playwright.config.ts` extension: `webServer` boots `wrangler pages dev` alongside `vite dev` for the ingestion e2e project.
- [ ] Repo-wide `dangerouslySetInnerHTML` grep gate as a CI step (ING-07 structural defense).

*(The v1.0 test infrastructure — Vitest, Playwright across chromium/firefox/webkit, the honest-suite precedent — is reused, not reinvented.)*

## Security Domain

> `security_enforcement: true` in `.planning/config.json`; `security_asvs_level: 1`. This phase introduces a server-side fetch+sanitize backend — the security surface is material.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Stateless backend owns no identity; no auth in Phase 7. |
| V3 Session Management | no | No sessions; ingestion is a single request-response. |
| V4 Access Control | yes (SSRF) | The SSRF guard IS access control — it controls which network endpoints the server may reach. OWASP Case 2 deny-list + per-hop redirect validation. |
| V5 Input Validation | yes | URL validation (`new URL` + scheme allowlist); content-type allowlist; size cap; `ArticleSchema.parse()` Zod boundary on every ingested article (client + server). |
| V6 Cryptography | yes (minor) | `originalHtmlHash` = SHA-256 of fetched/pasted HTML (traceability). Use `crypto.subtle.digest` (Web Crypto, available on Workers). |
| V7 Error Handling | yes | Structured `IngestionFailureReason` for every refusal; NO upstream body on SSRF refusal (measure 7); `.status` live region surfaces reasons calmly (D7-04). |
| V8 Data Protection | yes | Local-first (Dexie); no server-side storage; the server returns validated Block JSON and retains nothing. |
| V12 Files & Resources | yes | Content-type allowlist (`text/html`, `application/xhtml+xml`); size cap (5 MB); timeout (30s). |
| V13 API & Web Service | yes | `POST /api/ingest` same-origin; CSP `connect-src 'self'` tightens. |

### Known Threat Patterns for the ingestion stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF — cloud-metadata exfiltration (`169.254.169.254`) | Tampering / Information Disclosure | OWASP Case 2 deny-list + explicit metadata-hostname block + per-hop redirect re-validation. `[CITED: OWASP SSRF Cheat Sheet]` |
| SSRF — internal service enumeration | Information Disclosure | Private/loopback/link-local/CGNAT IP deny-list via `ip-address` library. |
| SSRF — DNS rebinding (TOCTOU) | Tampering | `dns.promises.resolve4/6` validation + `cf.resolveOverride` pinning (spike-gated); documented residual. |
| SSRF — redirect-into-internal | Tampering | `fetch({ redirect: "manual" })` + recursive `safeFetch(Location)` capped at 5 hops. |
| XSS — mXSS via sanitizer bypass | Tampering / XSS | DOMPurify strict allowlist + `USE_PROFILES:{html:true}` (no svg/math) + doc-model-as-boundary (Block JSON, never HTML, never `dangerouslySetInnerHTML`). `[CITED: DOMPurify README]` |
| XSS — sanitize-then-re-introduce | Tampering / XSS | Sanitize ONCE at ingest → DOM walk → Block tree → React renders Block JSON. Structural defense. |
| XSS — `javascript:`/`data:` URIs | XSS | DOMPurify default `ALLOWED_URI_REGEXP` + ArticleSchema `linkableUrl`/`httpUrl` Zod refinements (http/https/mailto only). |
| Reverse tabnabbing (`target="_blank"`) | Tampering | `rel="noopener noreferrer"` on every surviving `<a>` (DOMPurify `afterSanitizeAttributes` hook); ArticleView already does this for provenance links. |
| DOM clobbering (`<img id="location">`) | Tampering | htmlToBlocks DOM walker maps by tag name, not by `id`; the Block tree carries no `id` attributes on inline elements (footnote ids are `fn-N` regex-controlled). |
| DoS — huge response / slow fetch | Denial of Service | 30s timeout + 5 MB size cap + AbortSignal; Cloudflare rate-limiting at the edge. |
| DoS — Worker subrequest exhaustion | Denial of Service | DNS resolve (1) + fetch (1) + redirect hops (≤5) ≤ ~10 subrequests; well under the 50 free / 1000 paid limit. |

## Sources

### Primary (HIGH confidence)
- `[CITED]` [Cloudflare Workers Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) — `nodejs_compat` flag, supported API table (node:dns 🟡 partial, node:net/http/fs 🟢), `nodejs_compat_v2` merged into the main flag (compat date ≥ 2024-09-23).
- `[CITED]` [Cloudflare Workers node:dns](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/) — `dns.promises.resolve4/6` work via DoH to 1.1.1.1; `lookup`/`lookupService`/`resolve` throw "Not implemented"; DNS counts as a subrequest.
- `[CITED]` [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — Case 2 (arbitrary external URLs), deny-list minimum ranges, `ip-address` library recommendation, disable redirect-following, DNS pinning.
- `[CITED]` [Mozilla Readability.js README](https://github.com/mozilla/readability/blob/main/README.md) — `serializer: (el) => el` for DOM output; `parse()` mutates input (use `cloneNode`); `isProbablyReaderable` false-pos/neg; `charThreshold` default 500; Mozilla DOMPurify+CSP recommendation; jsdom script-exec disabled by default.
- `[CITED]` [isomorphic-dompurify npm README](https://www.npmjs.com/package/isomorphic-dompurify) — 3.22.0, Node `^20.19 || ^22.12 || >=24`; `clearWindow()` for long-running processes; `DOMPurify(window)` factory for foreign DOMs; documented `ERR_REQUIRE_ESM` issue with jsdom@28+ in CJS envs; DOMPurify "not yet Web-Worker-compatible."
- `[CITED]` [linkedom README](https://github.com/WebReflection/linkedom/blob/main/README.md) — `linkedom/worker` export; explicitly NOT 100% DOM-spec-compliant; no live collections; DOMPurify-on-linkedom is unvalidated.
- `[CITED]` [Cloudflare Vite plugin docs](https://developers.cloudflare.com/workers/vite-plugin/) — runs Worker code in real workerd during Vite dev; SPA + backend API support; `vite preview` against Workers runtime.
- `[VERIFIED: npm registry]` `npm view` for all 7 packages (2026-08-10): `@mozilla/readability@0.6.0`, `isomorphic-dompurify@3.22.0`, `jsdom@30.0.1`, `linkedom@0.18.13`, `wrangler@4.120.1`, `@cloudflare/vite-plugin@1.51.2`, `ip-address@10.5.0`.
- `[CITED]` `.planning/research/ARCHITECTURE.md` — Patterns 1, 2, 5, 8 (stateless backend, extraction pipeline, Dexie v3, SSRF/XSS defense-in-depth).
- `[CITED]` `.planning/research/PITFALLS.md` — Pitfalls 1, 2, 3, 4, 5, 8, 9 (block histogram, normalization drift, SSRF 9-measure matrix, XSS sanitizer, silent garbage, Dexie migration, Pitfall 9 additive discipline).
- `[CITED]` `.planning/research/FEATURES.md` — Feature Area 1 (web article extraction; honest null-result; immutability; sanitization; SSRF-safe fetching).
- `[CITED]` `src/content/schema.ts` — ArticleSchema, Provenance, BlockSchema (9 kinds), Mark (4), URL scheme allow-lists (Pitfall 5).
- `[CITED]` `src/content/normalizeText.ts` — THE shared normalizer + deriveQuoteSelector/resolveQuoteSelector tri-state.
- `[CITED]` `src/content/repository.ts` — ArticleRepository interface + inMemoryRepository (the D7-02 swap point).
- `[CITED]` `src/persistence/db.ts` — Dexie v1/v2 reserved schema; v3 append target (Pitfall 9).

### Secondary (MEDIUM confidence)
- `[ASSUMED]` `cf.resolveOverride` on Workers `fetch()` provides DNS pinning — needs Wave-1 spike confirmation.
- `[ASSUMED]` `@cloudflare/vite-plugin` preserves the v1.0 Playwright webServer dev flow — needs spike.

### Tertiary (LOW confidence)
- `[ASSUMED]` linkedom-DOMPurify produces sanitizer-safe output on Workers — GATED by the mXSS regression suite.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via `npm view` + official docs + OWASP recommendation.
- Architecture (pipeline, Dexie v3, repository swap): HIGH — anchored on shipped v1.0 contracts + CONTEXT.md locked decisions.
- SSRF guard implementation: MEDIUM — OWASP guidance is HIGH confidence; the Workers-specific DNS-pinning mechanism (`cf.resolveOverride`) is ASSUMED pending spike.
- jsdom-on-Workers compat: MEDIUM — the single highest-risk empirical question; the Wave-1 spike resolves it.
- Confidence thresholds: MEDIUM — the formula is shipped-from-research; empirical corpus validation may tune the numbers.
- DOMPurify config: HIGH — Cure53-audited + Mozilla-recommended + isomorphic-dompurify README.
- Local-dev mechanism: MEDIUM — two viable options; spike picks one.

**Research date:** 2026-08-10
**Valid until:** 2026-09-09 (30 days — stable stack; the jsdom-on-Workers compat surface is fast-moving, re-verify at execution)

