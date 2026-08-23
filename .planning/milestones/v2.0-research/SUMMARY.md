# Project Research Summary

**Project:** Lem Reader — v2.0 Personal Library
**Domain:** Local-first accessible reader + stateless ingestion backend + multi-format document intake + versioned portability (built on a shipped v1.0 substrate)
**Researched:** 2026-08-10
**Confidence:** HIGH overall (substrate reuse + primary library picks) · MEDIUM on deployment shape and PDF/EPUB extraction fitness (project-specific empirical questions)

> **Scope.** This summary covers ONLY v2.0 Personal Library research. The v1.0 substrate (React 19 + TS 7 + Vite 8 SPA, Dexie, Zod, Pretext, canonical 9-kind/4-mark doc model, grapheme-offset coordinate, project-owned pagination, tri-state annotation anchors, full a11y suite, 1157-test green CI) is **locked and shipped** — it is treated as protected, not re-derived. v1.0 research is archived under `.planning/milestones/v1.0-research/`.

---

## Executive Summary

v2.0 turns Lem Reader from a fixture-only prototype into a product readers can put their own content into. The milestone adds one new runtime layer (a **stateless ingestion backend** that owns no identity and no library state) and one new data domain (user-ingested articles + library metadata) on top of the existing client-only SPA. Six feature areas ship: URL ingestion, multi-format document intake (HTML/Markdown/PDF/EPUB), a personal library surface, versioned export/import (PORT-01/02), an annotation review panel (RECV-01), and two polish fixes plus the NVDA+Firefox acceptance follow-up (ACPT-02 boundary A4).

The architectural thesis is **substrate preservation by construction**: every format-specific adapter (HTML, Markdown, PDF, EPUB) is a pure function that returns the same `{ blocks, footnotes, lang, provenance }` shape, validated by the existing `ArticleSchema.parse()` at the server boundary. Once content becomes a `CanonicalArticle`, the pagination engine, measurement substrate, annotation selectors, location store, highlights/notes stores, and a11y surface operate on it identically to a fixture — they literally cannot tell the difference. EPUB is handled as one-article-per-chapter plus a thin `Book` grouping record (Option A in ARCHITECTURE.md), avoiding any change to the grapheme-offset coordinate or selector semantics. Dexie evolves v2 → v3 as a strictly-additive append (the v1/v2 blocks stay byte-unchanged).

The load-bearing risks are **security and substrate regression**, in that order. The ingestion backend turns Lem Reader into a server-side fetcher of arbitrary user-supplied URLs — full OWASP SSRF defense (scheme allowlist, IP deny-list with redirect re-validation, DNS pinning against rebinding) is a release blocker, not a hardening pass. HTML sanitization must be **structural**, not procedural: sanitize once at the server boundary, then transform to the typed Block tree, then render as React elements — never `dangerouslySetInnerHTML`. The DOMPurify-then-re-modify foot-gun (sanitize → doc-model transform → re-serialize to HTML) silently reintroduces mXSS payloads and must be avoided by treating the doc model as the security boundary. On the substrate side, real-world extracted HTML carries block shapes the pagination engine was never calibrated against; a predict-fallback policy (block-kind histogram → paginate / paginate-with-tightened-guard / proactively-fallback) and a round-trip anchor test on every ingested article are required from the first ingestion phase.

### One open decision the roadmapper must settle

**Backend shape — STACK and ARCHITECTURE disagree.** STACK.md recommends a **separate long-lived Node service** (Hono 4.13.1 on `@hono/node-server` 2.1.0, deployed as a container on Fly.io/Render/Railway) — arguing that 5–30s fetches, CPU-heavy PDF parsing, and the need for network-layer SSRF egress control exceed what serverless functions offer. ARCHITECTURE.md recommends **Cloudflare Pages Functions co-deployed with the static SPA** (same-origin, no CORS, `/functions/api/ingest.ts`, Workers runtime) — arguing that a stateless fetch+transform workload is the textbook edge-function case, the SPA build stays untouched, CSP tightens rather than loosens, and free tier covers prototype load. The architectural code shape is identical either way (route pipeline: CORS → SSRF guard → Zod validator → fetcher → extractor → sanitizer → normalizer → response). **This is an operational decision, not an architectural one** — see Open Questions.

---

## Key Findings

### Recommended Stack (v2.0 additions — see STACK.md for full rationale)

The v1.0 stack (React 19.2.8, TypeScript 7.0.2, Vite 8.1.5, Dexie 4.4.4, Zod 4.4.3, Pretext 0.0.8, Vitest 4.1.10, Playwright 1.61.1, `@axe-core/playwright` 4.12.1) is locked. v2.0 adds only what the new capabilities require, and every server-only dependency is gated behind `/server` imports so it never enters the client bundle.

**Backend runtime & HTTP client:**
- **Hono 4.13.1** (+ `@hono/node-server` 2.1.0 + `@hono/zod-validator` 0.9.0) — TS-first, Web Standards Request/Response surface, composable route pipeline. Runs as a long-lived Node process (STACK) or can wrap into any serverless adapter (ARCHITECTURE's CF Pages Functions choice is operationally equivalent).
- **undici 8.10.0** — pinned explicitly (not Node's internal copy) for the SSRF control hooks: `maxRedirections: 0` (or manual hop-by-hop re-validation), `headersTimeout`/`bodyTimeout`, and a `connect.lookup` hook to pin resolved IPs against DNS rebinding.

**DOM substrate & extraction:**
- **jsdom 30.0.1** — full `window`/`Document` in Node; required by both Defuddle/Readability and DOMPurify. Promote from devDep to runtime dep; standardize on jsdom across the pipeline to avoid two DOM implementations drifting.
- **Defuddle 0.19.2** (STACK primary) — actively developed by Obsidian's creator; standardizes headings/paragraphs/blockquotes/lists/figures/code/footnotes inline-marks/schema.org metadata. Designed as a Readability successor with richer output.
- **@mozilla/readability 0.6.0** — documented fallback for sites Defuddle handles poorly; same library Firefox Reader View uses. *(ARCHITECTURE.md uses Readability as the primary extractor; STACK.md uses Defuddle primary + Readability fallback. Both are Mozilla-recommended; the roadmapper should treat "Defuddle primary with Readability fallback" as the recommended synthesis.)*

**Sanitization (load-bearing XSS defense):**
- **dompurify 3.4.13** (STACK) / **isomorphic-dompurify 3.22.0** (ARCHITECTURE) — Cure53 pedigree; Mozilla's own README recommends DOMPurify for untrusted Readability output. `isomorphic-dompurify` is the jsdom-backed wrapper with `clearWindow()` for long-running worker memory hygiene. **Allow-list MUST match the v1.0 block/inline model exactly** (`p, h1-h6, blockquote, ul, ol, li, figure, figcaption, pre, code, a[href], sup, sub, strong, em, br`); `USE_PROFILES: { html: true }` (no SVG/MathML); strip `<script>`, `<iframe>`, `<object>`, `<embed>`, inline event handlers, `javascript:` URLs, `style` attributes by default. Run **before** persisting AND **before** returning JSON (defense in depth).
- **rehype-sanitize 6.0.0** — the Markdown-pipeline equivalent; same allow-list as DOMPurify so both pipelines enforce identical policy.

**PDF text extraction:**
- **unpdf 1.8.0** — unjs team's thin Node adapter over `pdfjs-dist`; abstracts the worker setup. Returns per-page text items with position/transform metadata for reading-order recovery (sort Y then X). **Multi-column academic PDFs are the known-weak case** — honest-failure fallback required. Sequence PDF AFTER URL/HTML/Markdown.

**EPUB parsing — STACK and ARCHITECTURE differ:**
- **STACK:** **JSZip 3.10.1 + fast-xml-parser 5.10.1** — stable, battle-tested primitives; JSZip is what `epubjs` uses internally. Reads the ZIP; parses `META-INF/container.xml` + OPF manifest + NCX/spine.
- **ARCHITECTURE:** **epub2 3.0.2** — best Node parser available BUT unmaintained (last published 3+ years ago); 170K weekly downloads, 66 dependents. Isolate behind an adapter so the dep can be swapped.
- **Both agree:** epub.js (`epubjs` 0.3.93) is a **client-side renderer**, not just a parser — it pulls localforage, marks-pane, @xmldom/xmldom and owns its own iframe-sandboxed renderer with its own pagination/flow. **Do NOT use epub.js's `Rendition.renderTo` inside React** — it would replace the semantic React renderer, the v1.0 a11y suite, the pagination engine, AND the annotation substrate.
- **Synthesis for roadmapper:** pick one EPUB parser primitive (JSZip+fast-xml-parser or epub2) and isolate it behind an adapter; flag this as a Phase 12 (EPUB) research question.

**Markdown pipeline:**
- **unified 11.0.5 + remark-parse 11.0.0 + remark-rehype 11.1.2 + rehype-sanitize 6.0.0 + rehype-stringify 10.0.1** — the reference ecosystem; produces an AST the normalizer projects cleanly onto the v1.0 block model. mdast has no HTML by default (no sanitizer needed); route through `htmlToBlocks` only if raw-HTML-in-Markdown is permitted.

**SSRF defense (load-bearing — do not skip):**
- **private-ip 3.0.2** — boolean private/reserved IP check (RFC1918, loopback, link-local incl. 169.254.169.254 IMDS, CGNAT 100.64/10, multicast, IPv6 ULA fc00::/7, IPv6 loopback).
- **is-ip 5.0.1** — string-shape validation before netmask math.
- **ip-address 10.5.0** — OWASP-recommended canonical IPv4/IPv6 parsing; not exposed to hex/octal/dword/URL/mixed-encoding bypasses.
- **No single "SSRF library" exists** for Node covering the full OWASP pattern. Assemble the three primitives + undici's `connect.lookup` hook.

**Alternatives rejected (HIGH confidence):** `@postlight/node-readability` (does not exist — actual pkg is `@postlight/parser`, stale Oct 2022); `@gxl/epub2` (deleted from npm); `pdf-parse` (unmaintained, prior CVEs); `mupdf-js` (native bindings); `node-fetch` (maintenance-only); Nitro/Vite SSR/Next.js/Remix (entangles backend with SPA build — the very coupling v1.0 rejected); `marked` (no AST); `linkedom` as ingestion DOM substrate (fails DOMPurify's `window` requirement); `sanitize-html` as primary XSS sanitizer (weaker pedigree); single-purpose SSRF library (none exists for the full OWASP pattern).

### Expected Features (see FEATURES.md for full table stakes / differentiator / anti-feature breakdown)

**Table stakes (must-have for v2.0 launch):**
- **URL ingestion** with honest null-result on unparseable pages (Readability `charThreshold` + DOC-06 disclosure pattern extended to ingestion failure modes: network error, paywall, content too short, unsupported media type).
- **Server-side fetch + extract + normalize** with **SSRF-safe fetching** (OWASP Case 2 deny-list + redirect re-validation + DNS pinning) and **content-type allow-list** (`text/html`, `application/xhtml+xml`).
- **Immutability of the saved version** — save-once, read-forever (Readwise's model); manual refresh = explicit delete + re-save with highlight-loss warning. Server-side re-extraction on every open is an anti-feature (silently breaks ANNO-05 anchor stability).
- **Sanitization of ingested HTML** — DOMPurify + CSP + the canonical Block tree as the structural security boundary.
- **Multi-format intake:** drag-drop + file-picker upload; format detection from extension + MIME sniff; per-format metadata extraction (EPUB OPF rich; PDF Info dictionary noisy; Markdown filename→title); edit-metadata panel; DRM-free-only honesty (detect Adobe ADEPT / Apple FairPlay / Readium LCP markers, refuse with explanation).
- **Personal library:** list view of saved items; open into reader; delete (cascade); per-item metadata; source link; recently-read shortcut; reading-progress indicator (positional for short works, never "100%" on a 1-page article); empty state; **title + metadata search** (table stakes — full-text search is a differentiator, deferred to v2.x); **tags as the default organization** (PROJECT.md commits to this; folders/collections deferred).
- **Versioned export/import (PORT-01/02):** whole-library bundle; versioned schema (`schemaVersion: 1`); Zod validation on import; **conflict reporting** (skip-by-default with reader overrides); round-trip integrity (canonical-text offsets survive; page numbers never appear in the bundle); per-article source URL in bundle.
- **Annotation review panel (RECV-01):** list all highlights/notes cross-article; jump to location; per-highlight metadata; in-place edit/delete; sort (date/article/position); filter by article; **tri-state indicator** for ambiguous/orphan annotations (ANNO-07 surfaced honestly).
- **Polish:** first-paint mode mismatch fix (inline bootstrap reads `localStorage` before React mounts); short-article progress-bar semantics (offset-anchored, not page-ratio).
- **NVDA+Firefox acceptance run** (ACPT-02 boundary A4 follow-up) — the v1.0 post-v1 SR protocol gap.

**Differentiators (calm/accessibility positioning — compete on calm, not feature parity):**
- **Honest extraction-failure disclosure** in the reader voice (extends v1.0 PAGE-09 fallback banner vocabulary; quiet, not loud red toasts).
- **Partial-extraction flag** — surface "incomplete extraction" indicator + link to original; most competitors silently ship partial content.
- **Public-web-only honesty** — hard-refuse paywalled/login-gated/cookie-walled content with a clear message + link to original.
- **Two-mode EPUB reading at chapter granularity** — v1.0's dual-mode parity extended to books (most EPUB readers optimize one mode).
- **EPUB chapter as the canonical navigation unit** — reuses READ-05 at chapter granularity; book progress by chapter; TOC = chapter list.
- **Markdown front-matter support** — recognize YAML `title:`/`author:`/`date:` as metadata.
- **PDF text-view reflow alongside original-page view** (Readwise's "Enhanced text mode" pattern) — default to page image, one-tap toggle to reflowed text.
- **Tags-as-default-organization** (not folders); reading-progress sort; quiet item count + library-size line; per-source-domain grouping.
- **Highlights-only Markdown export** with template variables (the "take my notes to Obsidian/Notion/Anki" path — Readwise's headline differentiator, adapted to calm positioning).
- **Per-article export** and **bundle signing** (SHA-256 manifest) — small wins once the bundle pipeline exists.

**Anti-features (avoid — they break positioning):**
- Paywall/authenticated-content extraction (Out-of-Scope; introduces identity, cookies, ToS, server-side credential store).
- Server-side re-extraction on every open (silently breaks anchors).
- Browser-extension packaging in v2.0 (deferred until ingestion+library loop is proven in web app).
- AI-assisted extraction fallback / AI summarization (Out-of-Scope).
- Force-flatten EPUB into a single article (destroys TOC the reader expects).
- Mandatory PDF reflow (reflow quality is genuinely poor; readers expect PDFs to look like PDFs).
- Scanned-PDF OCR (heavy new dependency; noisy text breaks anchors).
- EPUB CSS pass-through (conflicts with READ-02/03/04 typography controls).
- Folders/collections hierarchy (competes with tags for the same cognitive job).
- Read/unread triage gamification, recommendation/discovery feed, RSS auto-push section, dense dashboard analytics, social sharing, multi-color highlights, spaced-repetition resurfacing, encrypted-bundle format, cloud sync, real-time merge.

### Architecture Approach (see ARCHITECTURE.md for full pattern catalogue)

v2.0 adds exactly **one new runtime layer** (stateless ingestion backend) and **one new data domain** (user-ingested articles + library metadata). The reader, pagination, annotation, and persistence substrates are reused **unchanged at the contract level**; only the ingestion entry point and the library/listing surfaces are new. The load-bearing invariant: **the substrate is source-agnostic — the pagination engine cannot tell a fixture from an ingested article.**

**Major components:**
1. **Stateless ingestion backend** (`/functions/api/ingest.ts` per ARCHITECTURE, or separate Hono service per STACK) — receives `{ url? | html? | file? }`, returns validated `CanonicalArticle[]`. Owns NO identity (client mints ids), NO library state. Pipeline: URL Guard → SSRF-safe fetch → Readability/Defuddle extract → DOMPurify sanitize → format-specific normalizer → `ArticleSchema.parse()` → response.
2. **Format-specific normalizers** (`htmlToBlocks`, `markdownToBlocks`, `pdfToBlocks`, `epubToBooks`) — server-side pure functions returning `{ blocks, footnotes, lang, provenance }`. Promoted + generalized from v1.0's throwaway build-time `linkedom` script. Each is independently testable against a representative per-format corpus. The shared failure substrate is the v1.0 DOC-06 `UnsupportedBlock` — anything an adapter cannot map becomes `UnsupportedBlock { originalKind, plainDescription }`.
3. **`src/ingestion/` (client mirror)** — `IngestionClient` (thin fetch wrapper with honest-failure mapping) + `DexieLibrarySource` (Dexie-backed ArticleRepository implementation for user articles).
4. **`src/library/`** — `LibraryView` (replaces `FixtureList` as default route), `LibraryCard`, `IngestArticleForm`, `AnnotationReviewPane` (RECV-01). Same hash-router pattern, same a11y contracts.
5. **`src/portability/`** — `ExportImportService` (serialize/parse/validate/conflict-detect/dry-run/transactional-apply) + `bundle.ts` (`ExportBundleSchema`) + `conflicts.ts`.
6. **Extended `ArticleRepository`** — additive interface extension: v1.0 `list/open` unchanged; v2.0 adds `listLibrary / listByBook / search / save / remove / tag / untag / listTags`. Production impl is `compositeLibraryRepository` that UNIONs in-memory fixtures (tagged `source: "fixture"`) with Dexie user articles.
7. **Extended `src/content/schema.ts`** — additive: `ArticleSource` enum discriminator (`fixture | url | html-upload | markdown | pdf | epub-chapter`), `IngestionMetaSchema` (source, sourceUrl, originalHtmlHash, fetchedAt, extractionConfidence, extractionWarnings, bookId, chapterIndex), `BookSchema` (for EPUB), `LibraryEntrySchema`. Existing `ArticleSchema` shape unchanged for v1.0 fixtures (backward-compatible via defaults).
8. **Extended `src/persistence/db.ts`** — Dexie v3 block appended (v1/v2 byte-unchanged per Pitfall 9): adds `source`, `addedAt`, `bookId` indexes on `articles`; new `books`, `tags`, `articleTags` stores.

**Key patterns:**
- **EPUB as Book Container (Option A):** one `CanonicalArticle` per chapter + a thin `Book` grouping record. Zero substrate churn — every v1.0 guarantee holds unchanged per-chapter. Book-level position = `(chapterId, chapterOffset)` composes naturally. EPUB ingestion reuses the HTML pipeline (each chapter is XHTML). **Option B (extend doc model with Book container) REJECTED** — breaks substrate for no gain. **Option C (flatten book into one article) REJECTED** — destroys publisher structure.
- **Dexie v2 → v3 additive migration:** no data migration required (v2 `articles` store was reserved but never written; fixtures stay bundled JSON). Adding indexes is purely additive — Dexie re-indexes on next open without touching existing rows. Forward-compat: v3 declares ALL stores (not just new ones) mirroring v2's pattern; v4 appends again.
- **Fixtures stay bundled (Pitfall 8):** v1.0 fixtures remain as build-time-validated JSON in `src/fixtures/`; `compositeLibraryRepository.list()` UNIONs in-memory fixtures with Dexie user articles at query time. **Do NOT touch v1.0's populate hook** (Pitfall 9 — `populate` runs only on initial creation, never on upgrade).
- **SSRF/XSS defense-in-depth boundary:** the server is the ONLY place URLs are fetched (client NEVER fetches reader-supplied URLs). Four XSS layers: (1) DOMPurify sanitize at server boundary; (2) `htmlToBlocks` DOM walker produces typed Block tree — no HTML survives; (3) `ArticleSchema.parse()` validates at Zod boundary (link/figure URLs scheme-allowlisted); (4) React semantic renderer with NO `dangerouslySetInnerHTML` anywhere (ESLint `react/no-danger`). **The doc model IS the security boundary.** CSP **tightens** (not loosens) vs v1.0: `connect-src 'self'` (only same-origin ingestion function).

### Critical Pitfalls (top load-bearing — see PITFALLS.md for all 12)

1. **SSRF (Pitfall 3) — release blocker.** User-supplied URLs must not let the backend reach RFC1918 space, link-local 169.254/16, cloud-metadata 169.254.169.254, CGNAT 100.64/10, or follow redirects into private space. **Defense in depth, all layers required:** scheme allowlist (http/https only); disable redirect-following OR re-validate every redirect hop; resolve-once-then-connect-to-resolved-IP with original Host header (defeats DNS rebinding); normalize IP forms via vetted `ip-address` library (defeats hex/octal/dword/IPv4-mapped-IPv6 bypasses); block metadata hostnames explicitly; egress allowlist at network layer; cap size/timeout/concurrency per reader; return NO upstream body on validation failure; CI regression matrix of malicious URLs.

2. **XSS via sanitizer misconfiguration (Pitfall 4) — sanitize-then-re-modify is the cardinal foot-gun.** Sanitize raw HTML ONCE at the server boundary; convert the sanitized tree directly to the 9-kind Block model; render the Block model with React elements (never `dangerouslySetInnerHTML`). The doc-model transformation voids sanitizer output if any downstream code re-serializes via `innerHTML`. Restrict DOMPurify to `USE_PROFILES: { html: true }` (no SVG/MathML); allow-list tags/attrs explicitly to the 9-kind model; forbid URI schemes outside `{http, https, mailto}`; force `rel="noopener noreferrer"` on every surviving `<a>`; pin current jsdom (never happy-dom — explicitly unsafe per DOMPurify README); apply strict CSP `script-src 'self'` (no `unsafe-inline`, no `unsafe-eval`); add an mXSS regression suite fed by DOMPurify's own Attack Classes wiki payloads.

3. **Substrate regression: block shapes the pagination engine can't handle (Pitfall 1).** The v1.0 PAGE-03b post-render overflow guard was calibrated on a 6-article 9-kind corpus; real-world extraction produces deeply nested lists, tables (out of scope but extraction surfaces them), image galleries, long `<pre>` lines, `<ruby>` annotations, unpredictable inline combinations. **Predict-fallback policy:** add an extraction-time `blockKindHistogram`; the engine paginates confidently (all known kinds), paginates with tightened guard (some unknown kinds), or proactively falls back to scroll (mostly unsupported kinds). Never silently coerce an unsupported `<table>` to a paragraph (loses semantics, breaks a11y); never silently drop (violates DOC-06) — always disclose. Widen the corpus deliberately (re-run PAGE-08 calibration when a new kind is promoted).

4. **Extraction normalization diverges from the grapheme-offset substrate (Pitfall 2).** One normalizer, one path. Reuse v1.0's exact normalization module for both fixture authoring and ingestion — no extraction-specific whitespace/Unicode handling. Pin the normalization version into the DOC-04 content revision. **Round-trip test every ingested article:** pick N grapheme offsets, serialize to `TextPositionSelector` + `TextQuoteSelector`, re-normalize, re-resolve — must reach `confident` for all N before entering the library.

5. **EPUB treated as one article (Pitfall 6).** An EPUB is a multi-chapter book; flattening loses TOC navigation, breaks reading position to book-global (reopening a 50-chapter book lands "at offset 48213"), spans annotation anchors across the whole book (re-extracting one chapter orphans everything), and collapses pagination perf. Using epub.js's renderer silently replaces Lem Reader's entire reading surface. **Treat a book as a collection of chapter articles** (Option A); parse with JSZip+fast-xml-parser or epub2 (NOT epub.js's `Rendition`); sanitize each chapter's XHTML through the DOMPurify pipeline; paginate per chapter.

6. **Dexie v2 schema migration loses v1.0 data (Pitfall 8).** Namespaced article identity (`[source, id]` or `source` discriminator + non-colliding generated ids for user articles). Do NOT touch v1.0's populate hook. Re-declare every v1.0 index in v3 (Dexie drops any index not re-specified). Upgrade function must be pure (no `setTimeout`, no network, no DOM — only Dexie transactions). Proactive quota management (`navigator.storage.estimate()` before each ingestion; surface `library-full` BEFORE the write fails; request persistent storage with consent). **CI migration test** that creates a v1.0 DB snapshot, runs v3 migration, asserts every v1.0 article/highlight/note/position/preference intact — phase exit criterion.

7. **Silent garbage into the library — breaking DOC-06 (Pitfall 5).** `isProbablyReaderable()` has documented false-positive/false-negative behavior; Readability exposes no confidence score. Derive a multi-signal score (length, textContent-to-content ratio, link density, title/byline presence, headings-to-paragraphs ratio, excerpt-title similarity). Three-state outcome: `confident` (enter library normally), `low-confidence` (enter library but flagged — warn on open, offer Refresh/View-original), `unsupported` (refuse to add — surface reason + link to original). Detect specific anti-extraction signals explicitly (CAPTCHA, 401/403, robots.txt disallow, paywall CSS heuristics, empty body).

**Other pitfalls (see PITFALLS.md):** Pitfall 7 (PDF wrong-order/empty text — multi-column detection, scanned-PDF refusal); Pitfall 9 (reading-mode FOUC — synchronous `localStorage` hint in inline bootstrap); Pitfall 10 (progress-bar off-by-one — offset-anchored formula); Pitfall 11 (export/import version skew, partial imports, Zip Slip — `schemaVersion` negotiation, single Dexie transaction, `path.resolve + startsWith` on every archive entry); Pitfall 12 (ingestion blocks repagination — Web Worker boundary, extend perf gate to representative ingested articles).

---

## Implications for Roadmap

The research converges on a 7-phase build (Phases 7–13, continuing from v1.0's Phase 6) that respects three constraints simultaneously: (1) the user's explicit **URL+HTML-before-PDF/EPUB** sequencing intent, (2) **substrate dependencies** (each phase's substrate must be stable before the next phase builds on it), and (3) **pitfall density** (the URL Ingestion phase carries Pitfalls 1/2/3/4/5/12 — it cannot be scoped as a thin slice). STACK, FEATURES, ARCHITECTURE, and PITFALLS all agree on this ordering; ARCHITECTURE.md's "Suggested Build Order" is the canonical reference.

### Phase 7 — Ingestion Substrate (backend shape + SSRF/XSS boundary + repo extension)

**Rationale:** Every other ingestion feature depends on this pipeline existing and the repo accepting user articles. Proving the substrate in isolation (no UI pressure) isolates the highest-novelty work (new backend runtime, SSRF defense, server-side sanitization, Dexie v3 migration). Carries the heaviest pitfall load (1/2/3/4/5/12).

**Delivers:** `/functions/api/ingest.ts` (or separate Hono service — **resolve backend-shape decision first**); `/server/{normalize,fetch}/`; `safeFetch` SSRF guard with the full OWASP matrix; `htmlToBlocks` adapter (production-grade promotion of v1.0 throwaway normalizer); `IngestionClient`; `DexieLibrarySource`; Dexie v3 schema migration; extended `ArticleRepository` interface.

**Addresses features:** URL ingestion substrate, HTML upload substrate.

**Avoids pitfalls:** SSRF guard matrix (Pitfall 3), DOMPurify profile + doc-model-as-security-boundary (Pitfall 4), shared normalizer + round-trip anchor test (Pitfall 2), block-kind histogram + predict-fallback policy (Pitfall 1), three-state outcome (Pitfall 5), Dexie v3 additive migration + CI migration test (Pitfall 8), Worker boundary (Pitfall 12).

**Phase exit criteria:** `/api/ingest` returns valid `CanonicalArticle` for a 5–10 real-publisher corpus across the v1.0 D-01 genre matrix; SSRF guard blocks private-IP / non-http(s) / redirect-to-internal URLs (CI matrix: metadata endpoints, localhost encodings, redirect chains, DNS rebinding simulation); DOMPurify strips `<script>`/`on*`/`javascript:` (mXSS regression suite from DOMPurify wiki); v2→v3 migration is zero-data-migration (CI test on v1.0 fixture snapshot); honest failure reasons (`extraction-too-low-confidence`, `fetch-failed`, `ssrf-blocked`, `unsupported-content-type`); anchor round-trip test gates every ingested article.

### Phase 8 — HTML + Markdown Pipeline + Library Surface

**Rationale:** Phase 7 proves the substrate; now the reader sees the value. Markdown bundles in here because `markdownToBlocks` shares the same Block-output contract and is the lowest-risk adapter. The library replaces the flat fixture list — without it, ingested articles have no home.

**Delivers:** `LibraryView` (replaces `FixtureList` as default route), `LibraryCard`, `IngestArticleForm` (URL paste + file upload), `markdownToBlocks` adapter (remark pipeline + rehype-sanitize), `LibraryContext` (React state + context — NO Redux/Zustand/XState), `compositeLibraryRepository`, library e2e corpus across chromium/firefox/webkit, tags CRUD.

**Addresses features:** URL ingestion UI, HTML/Markdown intake, personal library (list/open/delete/metadata/source link/recently-read/positional progress/title+metadata search/tags).

**Avoids pitfalls:** v1.0 regression (fixtures still appear with `source: "fixture"` badge; all v1.0 e2e tests pass); substrate-agnostic proof (ingested article paginates/annotates/restores identically to fixtures); a11y contracts carry over (semantic landmarks, keyboard nav, visible focus); quota check before each save.

### Phase 9 — Versioned Export/Import (PORT-01/02)

**Rationale:** Portability is the cross-device story in lieu of accounts (PROJECT.md). Naturally follows having a library to export. Unblocks the annotation review panel (Phase 10), which pairs naturally with the curation/export flow.

**Delivers:** `ExportBundleSchema` (`schemaVersion: 1`), `ExportImportService` (serialize/parse/validate/conflict-detect/dry-run-preview/transactional-apply), export/import UI (file picker, preview dialog, per-conflict override), `.json.gz` support, Markdown highlights export with template variables.

**Addresses features:** Whole-library export; versioned bundle schema; validation on import; conflict reporting (skip-by-default with reader overrides); round-trip integrity; per-article source URL in bundle; highlights-only Markdown export.

**Avoids pitfalls:** `schemaVersion` negotiation (refuse newer-bundle imports, migrate older); atomic single-Dexie-transaction import (no partial imports); Zip Slip `path.resolve + startsWith` on every archive entry (also applies to EPUB in Phase 12); filename sanitization; orphan-tolerant import (missing-article highlights enter as ANNO-07 `orphan`).

### Phase 10 — Annotation Review Panel (RECV-01)

**Rationale:** Pairs naturally with export/curation (Phase 9). Standalone value but bigger value after portability. The existing `[articleId+revision]` compound index already supports the cross-article query — this is mostly UI.

**Delivers:** `AnnotationReviewPane`, cross-article highlights/notes query, navigate-from-review-to-anchor (reuses v1.0 navigate-back pattern), filter (article/tag/confidence) + sort (date/article/position), tri-state indicator for ambiguous/orphan annotations.

**Addresses features:** List all highlights/notes cross-article; jump to location; per-highlight metadata; in-place edit/delete; sort; filter by article; ANNO-07 tri-state surfacing; filter by tag; export-from-here.

**Avoids pitfalls:** Honest ANNO-07 surfacing (never silently hide ambiguous/orphan); bidirectional navigation (panel ↔ passage); a11y parity with v1.0 AnnotationsDrawer.

### Phase 11 — PDF Intake

**Rationale:** User explicitly wants PDF after URL+HTML+Markdown. Markdown (Phase 8), library (Phase 8), portability (Phase 9), annotation review (Phase 10) all take precedence — higher reader value, lower risk. PDF is the highest-extraction-risk format and must carry the strongest DOC-06 discipline.

**Delivers:** `pdfToBlocks` adapter (`unpdf.extractTextItems()` → positional grouping by Y-then-X → paragraph detection by vertical gap → heading detection by font-size threshold → Block tree); resource-limit enforcement (`maxImageSize`, `numPages` cap, timeout race); PDF test corpus (text-heavy PDF happy path; scanned-PDF honest failure; multi-column PDF degradation).

**Addresses features:** PDF text extraction; honest failure for scanned/multi-column/tabular PDFs; PDF-sourced flag in disclosure surface.

**Avoids pitfalls:** Scanned-PDF detection + `unsupported: scanned-pdf` refusal; multi-column detection + `unsupported: multi-column-pdf` or `low-confidence: reconstructed-order`; tabular detection; round-trip anchor test (Pitfall 2); high `unsupported` rate expected and surfaced honestly (v1.0 Out-of-Scope already excluded tables/embeds/math/irregular layouts — PDFs frequently contain all four).

### Phase 12 — EPUB Intake (the multi-chapter book)

**Rationale:** User explicitly wants EPUB last. Riskiest intake format (unmaintained `epub2` parser OR JSZip+fast-xml-parser DIY; multi-chapter doc-model question; large file sizes). Sequencing it last means every other v2.0 feature is shipped and stable before taking on this risk.

**Delivers:** `epubToBooks` adapter (parser → per-chapter `htmlToBlocks` → multiple `CanonicalArticle` rows sharing a `bookId` + a `Book` record); `books` Dexie store integration; book-grouping UI in `LibraryView` (expandable book cards, "open book" = open first unfinished chapter); book-level progress derived across chapter locations; cross-chapter navigation (next/previous); EPUB test corpus (3–5 real EPUBs across genres).

**Addresses features:** EPUB multi-chapter book; chapter-as-canonical-navigation-unit; two-mode reading at chapter granularity; OPF metadata extraction; DRM-free-only honesty.

**Avoids pitfalls:** epub.js-is-a-renderer-not-a-parser (do NOT use `Rendition.renderTo` inside React); per-chapter model (Pitfall 6); chapter-scoped pagination; unmaintained-parser isolation behind adapter; Zip Slip on EPUB archive (Pitfall 11); per-chapter anchor round-trip.

### Phase 13 — Polish + Acceptance

**Rationale:** Polish is cheap once the feature surface is stable. Acceptance closes the v2.0 quality gate (the analogue of v1.0 Phase 6).

**Delivers:** First-paint mode mismatch fix (inline bootstrap reads `localStorage` before React mounts; render persisted mode on first paint; Playwright cold-load no-snap test); progress-bar offset-anchored fix (1-page = 0% on open; boundary tests); NVDA+Firefox acceptance protocol execution + `06-VERIFICATION.md`-style consolidation; full `npm run test` exit 0 (mirrors v1.0 honest-suite precedent).

**Addresses features:** Polish 6a (FOUC); Polish 6b (progress semantics); ACPT-02 boundary A4 NVDA+Firefox.

**Avoids pitfalls:** Pitfall 9 (mode flash), Pitfall 10 (progress-bar off-by-one), silent a11y regression across the milestone.

### Phase Ordering Rationale

- **Phase 7 is non-negotiable first:** establishes the substrate every other ingestion feature depends on. Skipping or compressing it risks the entire v2.0 milestone. It is the most pitfall-dense phase (1/2/3/4/5/12).
- **Phase 8 second:** substrate is proven; now the reader sees value. Markdown bundles in (lowest-risk adapter, shares Block-output contract).
- **Phases 9 + 10 form the portability/review pair:** export gives the reader their data; annotation review helps them curate it. Shared UI patterns; can be built by the same engineer in close succession.
- **Phases 11 + 12 are the higher-risk format work:** each independently shippable. Sequencing after portability means readers can always export their library before any risky format work lands. **URL+HTML-before-PDF/EPUB sequencing preserved.**
- **Phase 13 is the v2.0 quality gate.**
- **Critical path: 7 → 8 → 9 → 13.** Phases 10, 11, 12 can be sequenced in parallel tracks after Phase 8 if capacity allows.

### Research Flags

**Phases needing deeper research during planning (`gsd-spec-phase` / `gsd-discuss-phase` / `gsd-plan-phase --research-phase`):**
- **Phase 7 (Ingestion Substrate):** (a) **Resolve the backend-shape decision** — separate Hono Node service (STACK) vs Cloudflare Pages Functions co-deployed (ARCHITECTURE). 1-day spike in the first plan. (b) Resolve extractor choice — Defuddle primary + Readability fallback (STACK) vs Readability-only (ARCHITECTURE). (c) Resolve sanitizer packaging — dompurify + jsdom direct (STACK) vs isomorphic-dompurify wrapper (ARCHITECTURE). (d) Resolve exact CF compatibility flags for jsdom (`nodejs_compat_v2` likely) if CF Pages Functions is chosen. (e) Readability corpus quality — re-run v1.0 D-01 genre matrix through the production pipeline; some genres may extract poorly.
- **Phase 11 (PDF):** font-size → heading-level mapping + vertical-gap → paragraph-boundary detection thresholds need calibration on real PDFs (analogous to v1.0's Pretext calibration, Plan 03-02).
- **Phase 12 (EPUB):** (a) **Confirm EPUB Book concept** — Option A (one-article-per-chapter + thin Book record) is strongly recommended by ARCHITECTURE but is a product-shape decision worth explicit confirmation. (b) Validate the chosen EPUB parser (JSZip+fast-xml-parser per STACK, or epub2 per ARCHITECTURE) against 3–5 real EPUBs across publishers/versions before promotion; fallback is defer EPUB to v2.1 or write a minimal in-house parser.

**Phases with standard patterns (skip research-phase):**
- **Phase 8 (Library + HTML/MD):** library surface is straightforward CRUD over an extended repository interface; markdown adapter is a mechanical mdast→Block walk. Standard patterns.
- **Phase 9 (Export/Import):** reuses all existing Zod schemas; dry-run preview is standard for conflict-sensitive imports.
- **Phase 10 (Annotation Review):** the `[articleId+revision]` compound index already supports cross-article queries; this is mostly UI reusing v1.0 navigate-back.
- **Phase 13 (Polish + Acceptance):** inline-bootstrap pattern is the canonical FOUC fix; offset-anchored progress is trivial; NVDA+Firefox protocol mirrors VoiceOver+Safari.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (primary picks) | HIGH | Hono, undici, jsdom, DOMPurify, unpdf, unified/remark/rehype, SSRF primitives — all verified current via npm registry + official docs + Mozilla/Cure53/OWASP recommendations. |
| Stack (PDF/EPUB fitness) | MEDIUM | unpdf is HIGH for capability, MEDIUM for multi-column reading-order fitness; epub2 is unmaintained (MEDIUM long-term); JSZip+fast-xml-parser is stable but the doc-model extension for multi-chapter books is unresolved. |
| Backend shape | MEDIUM | STACK and ARCHITECTURE disagree (separate Hono service vs CF Pages Functions). Both are architecturally equivalent for the workload; the choice is operational. |
| Features | HIGH | Table stakes / differentiator / anti-feature analysis grounded in current official docs from Readwise Reader, Mozilla Readability, Wallabag, Hypothes.is; EPUB/Wikipedia standards reference. Calm-library scoping is product judgment (MEDIUM) grounded in PROJECT.md positioning, not user studies. |
| Architecture | HIGH | Substrate reuse by construction; the load-bearing invariant (substrate is source-agnostic) is verified against the v1.0 codebase. EPUB-as-Book Option A is conclusive (3-option analysis). Dexie v2→v3 additive migration is verified against Dexie's versioning docs. SSRF/XSS defense-in-depth follows OWASP Cheat Sheet. |
| Pitfalls | HIGH | 12 pitfalls verified against current DOMPurify v3.4.13, OWASP SSRF Cheat Sheet, Readability.js, epub.js, pdfjs-dist, Dexie docs, Snyk Zip Slip advisory. PDF/EPUB extraction quality is project-specific empirical risk (MEDIUM). |

**Overall confidence:** HIGH. The milestone rests on substrate reuse (HIGH), well-established primary libraries (HIGH), and authoritative security patterns (HIGH). The MEDIUM areas are project-specific empirical questions (PDF multi-column reading order, EPUB parser maintenance, hosting target) that the phase-specific research flags above address.

### Gaps to Address

- **Backend shape decision (STACK vs ARCHITECTURE):** must be resolved in Phase 7's first plan. Operational not architectural — code shape is identical either way.
- **EPUB parser primitive (STACK vs ARCHITECTURE):** JSZip+fast-xml-parser (STACK, DIY) vs epub2 (ARCHITECTURE, unmaintained). Validate against 3–5 real EPUBs in Phase 12 before promotion; isolate behind an adapter so the dep can be swapped.
- **EPUB Book concept confirmation:** Option A (one-article-per-chapter + thin Book record) is strongly recommended but is a product-shape decision — confirm explicitly in Phase 12 SPEC.md.
- **PDF multi-column scope:** reading-order reconstruction is research-grade; decide whether v2.0 ships honest-failure for multi-column or attempts reconstruction (calibration harness needed).
- **Hosting target:** Cloudflare Pages (ARCHITECTURE default) vs Fly.io/Render/Railway (STACK default) — bound to the backend-shape decision.
- **Search index choice:** title/metadata search is table stakes for v2.0; full-text search is a v2.x differentiator requiring FlexSearch/hand-rolled inverted index — defer.
- **Import conflict-resolution default:** skip-and-report is the safe default; per-entity reader overrides (keep-local / keep-imported / keep-both) surface in the preview UI. Confirm in Phase 9 SPEC.md.
- **`bookId` location semantics:** "resume in book X" requires deriving last-read chapter from per-chapter `LocationRecord`s (last `savedAt` across chapter articles sharing `bookId`) — specify in Phase 12 SPEC.md.
- **Readability corpus quality:** v1.0 D-01 genre matrix (Aeon, MDN, Wikipedia, SEP) should be re-run through the production pipeline in Phase 7 — some genres may extract poorly and require corpus expansion or honest-failure disclosure.

---

## Sources

### Primary (HIGH confidence)

- **npm registry metadata** (versions, last-publish dates, dependency lists, weekly downloads): `hono`, `@hono/node-server`, `@hono/zod-validator`, `undici`, `jsdom`, `defuddle`, `@mozilla/readability`, `isomorphic-dompurify`, `dompurify`, `unpdf`, `pdfjs-dist`, `epub2`, `epubjs`, `jszip`, `fast-xml-parser`, `linkedom`, `unified`, `remark-parse`, `remark-rehype`, `rehype-raw`, `rehype-sanitize`, `rehype-stringify`, `private-ip`, `is-ip`, `ip-address`, `marked`, `sanitize-html`, `fastify`, `express`, `nitropack`. Confirmed `@postlight/node-readability` does NOT exist (actual pkg is `@postlight/parser`, stale Oct 2022); `@gxl/epub2` NOT on npm (deleted).
- **GitHub READMEs:** `kepano/defuddle` (Node usage, bundle variants, footnote/code/heading/math/callout standardization, linkedom/jsdom integration); `mozilla/readability` (Node usage with jsdom, `parse()` return shape, explicit DOMPurify+CSP security recommendation); `cure53/DOMPurify` (server-side jsdom requirements, **explicit "do not re-modify sanitized output" warning**, Attack Classes & Bypass History wiki for mXSS regression payloads); `futurepress/epub.js` (confirms `book.renderTo` owns its own iframe-sandboxed renderer — structurally conflicts with Lem Reader's React renderer); `postlight/parser` (confirms active package name + stale publish).
- **OWASP Cheat Sheet Series — Server-Side Request Forgery Prevention** (authoritative): Case 1/Case 2 fetcher distinction, allow-list vs deny-list, IP-range minimum deny-list, redirect-following bypass, DNS pinning, `ip-address` library recommendation, IMDSv2.
- **Mozilla pdf.js `text_layer_builder.js`**: `pdfPage.streamTextContent({ includeMarkedContent, disableNormalization })` API; consumer reconstructs reading order from positioned text items.
- **Dexie Design docs — Database Versioning**: `version(N).stores({...})` upgrader rules, "data will under no circumstances be left half-upgraded" atomicity guarantee, **`populate` runs only on initial creation, never on upgrade**.
- **Snyk Zip Slip advisory** (2018, still canonical): directory-traversal filenames in archive entries — affects every archive format Lem Reader might import (EPUB + zip export).
- **Cloudflare Pages Functions: Get started**: `/functions` dir at project root, `onRequest(context)` handler, same-origin default, Workers runtime, Node.js compat flags, deploy via Git or Wrangler.
- **Competitor / category documentation:** Mozilla Readability.js README + type definitions; Readwise Reader (marketing page, Adding Content FAQ, Highlights/Tags/Notes FAQ, Filtering Syntax Guide, Exporting FAQ, Parsing FAQ, PDFs FAQ); Wallabag README; Hypothes.is Help; EPUB Wikipedia (ZIP container structure, OPF/manifest/spine/guide, NCX vs nav.xhtml, EPUB 3.3 current spec, DRM-optional status, security/privacy cautions).

### Project substrate (HIGH confidence — internal artifacts)

- `.planning/PROJECT.md` — v2.0 milestone scope, Out-of-Scope commitments, key decisions (#9 honest full-suite execution discipline), current milestone goals.
- `.planning/milestones/v1.0-REQUIREMENTS.md` — shipped v1.0 requirement definitions used to identify substrate dependencies (DOC-03/04/05/06, ANNO-04/05/06/07, STATE-01/02/03/04/05, READ-02/03/04/05, PAGE-01/04/08/09, A11Y-01/02, ACPT-02 boundary A4).
- v1.0 research archive under `.planning/milestones/v1.0-research/` — canonical source for the reading engine; not re-researched here.
- `src/content/schema.ts`, `src/persistence/db.ts`, `src/content/repository.ts`, `src/App.tsx`, `src/fixtures/index.ts`, `package.json` — canonical v1.0 substrate definitions.

### Secondary (MEDIUM confidence — product judgment)

- Calm-library scoping recommendations (flat tags vs. folders, no triage gamification, no AI features, no RSS feed section, no spaced-repetition, no multi-color highlights) are grounded in PROJECT.md's "calm, booklike, accessibility-first" positioning and the v1.0 anti-features list — not user studies. Re-validate after v2.0 ships.

---
*Research completed: 2026-08-10*
*Ready for roadmap: yes*
