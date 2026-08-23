# Stack Research — v2.0 Personal Library

**Domain:** Local-first reading application — adding URL ingestion, multi-format intake (HTML/PDF/EPUB/Markdown), and a personal library to an existing accessible reader.
**Researched:** 2026-08-10
**Overall confidence:** HIGH for primary picks; MEDIUM for deployment-shape and PDF/EPUB fit (project-specific empirical questions).

> **Scope:** This document covers ONLY the new capabilities introduced in v2.0 — the ingestion backend, extraction, sanitization, PDF/EPUB/Markdown parsing, SSRF defense, and deployment shape. The React 19 + Vite 8 + TypeScript 7 + Dexie + Zod + Pretext + Vitest/Playwright/axe-core v1.0 substrate is **locked** (see PROJECT.md "Key Decisions" and `package.json`). It is intentionally NOT re-evaluated here.

## Locked v1.0 Baseline (do not change)

| Layer | Locked pick | Why it stays |
|-------|-------------|--------------|
| Framework / build | React 19.2.8 + React DOM 19.2.8 (client-only SPA, `createRoot`) + Vite 8.1.5 + `@vitejs/plugin-react` 6.x | v1.0 shipped green × 3 browser engines; client-only is the validated shape. |
| Language | TypeScript 7.0.2 (strict) | Foundational; not negotiable. |
| Persistence | Dexie 4.4.4 over IndexedDB | Library/highlights/notes/position stay local-first in v2.0. |
| Runtime validation | Zod 4.4.3 | Reused at every ingestion boundary in v2.0 (URL form, fetched-content schema, normalized doc schema, export/import bundle schema). |
| Text measurement | `@chenglou/pretext` 0.0.8 (calibrated, heading-only fast path) | Pagination substrate unaffected by ingestion changes. |
| Tests | Vitest 4.1.10 + Playwright 1.61.1 + `@axe-core/playwright` 4.12.1 | Same matrix; new library surfaces need their own axe + Playwright runs. |
| Styling | Authored CSS + semantic HTML | No Tailwind, no component suite — unchanged. |
| Node | 22 LTS | Backend must target the same major to share types where it pays. |

---

## Recommended Stack Additions (v2.0)

### 1. Ingestion Backend Runtime

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **hono** | 4.13.1 | Stateless HTTP server for the ingestion API (`POST /ingest/url`, `POST /ingest/upload`) | TypeScript-first, built on Web Standards (Request/Response/fetch), zero-dep core. The Web-standard surface matches what the React/Vite client already uses, so types and patterns travel. Routes compose into a single request pipeline (CORS → SSRF guard → Zod validator → fetcher → extractor → sanitizer → normalizer → response). |
| **@hono/node-server** | 2.1.0 | Node 22 adapter for Hono (latest published 2026-08-04) | Lets the same Hono app run as a long-lived Node process (recommended for v2.0) and, later, wrap into any serverless adapter without rewriting route code. |
| **@hono/zod-validator** | 0.9.0 | Route-level Zod validation reusing the v1.0 Zod 4.4.3 | Bridges the new backend to the existing schema-validation discipline; input shape failures return structured 400s before any fetch work. Verify peer range against Zod 4 in implementation (zod-validator's last publish was 2026-07-15). |

### 2. HTTP Client (with SSRF control hooks)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **undici** | 8.10.0 | HTTP/1.1 client for fetching user-supplied URLs | Node 22 ships undici and a global `fetch`, but pinning `undici` explicitly exposes the levers SSRF defense needs: `maxRedirections: 0` (or manual hop-by-hop re-validation), `headersTimeout`, `bodyTimeout`, and a custom `connect.lookup` hook to pin a resolved IP (counters DNS rebinding). Don't use `node-fetch` (maintenance-only). |

### 3. DOM Substrate (Node-side)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **jsdom** | 30.0.1 | Full `window`/`Document` implementation in Node, used by Defuddle and DOMPurify | DOMPurify's factory requires a real `window`; jsdom is the documented pairing for both. Promote jsdom from devDependency (currently `jsdom ^25.0.0` is used by the v1.0 throwaway build-time normalizer) to a runtime dependency of the backend. Keep `linkedom ^0.18.13` available for non-DOMPurify paths if profiling demands it, but standardize on jsdom for the ingestion pipeline to avoid two DOM implementations drifting. |

### 4. Web Article Extraction

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **defuddle** | 0.19.2 | Primary extractor — turns a fetched `Document` into a cleaned HTML article with rich semantic structure | Actively developed by Obsidian's creator (8.9k stars, 730 commits). `defuddle/node` accepts a Document from jsdom or linkedom and standardizes the exact structures v1.0's doc model needs: headings (with anchor links stripped), paragraphs, blockquotes, lists, `<figure>`/`<figcaption>`, `<pre><code data-lang>`, footnotes (`#footnotes` ol/li with `footnote-backref`), inline marks, schema.org metadata, language, byline, published date. Designed explicitly as a successor to Mozilla Readability with consistent output and richer metadata. Works on pre-fetched HTML (no auto network fetch needed). |
| **@mozilla/readability** | 0.6.0 | Documented fallback extractor for sites Defuddle handles poorly | The same library Firefox Reader View uses; battle-tested on the broadest corpus. Use as a secondary path when Defuddle returns low-quality output (the v1.0 disclosure-discipline pattern from DOC-06 generalizes to "honest failure when extraction is unreliable"). Returns `{title, content (HTML), textContent, byline, dir, siteName, lang, excerpt, publishedTime}`. Mozilla's README explicitly recommends DOMPurify + CSP for untrusted input — which is exactly the pipeline below. |

### 5. HTML Sanitization (XSS defense — load-bearing)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **dompurify** | 3.4.13 | Allow-list sanitizer for every byte of ingested HTML before it is persisted or returned to the SPA | Written by Cure53 (the security industry's reference). Mozilla's own Readability README recommends DOMPurify for untrusted input — the canonical Firefox Reader View pattern. Node usage: `createDOMPurify(new JSDOM('').window)` then `sanitize(html, config)`. Requires jsdom. **Configure the allow-list to match the v1.0 block/inline model exactly:** `p, h1-h6, blockquote, ul, ol, li, figure, figcaption, pre, code, a[href], sup, sub, strong, em, br`. Strip `<script>`, `<iframe>`, `<object>`, `<embed>`, inline event handlers, `javascript:` URLs, and `style` attributes by default. Run sanitization **before** persisting to Dexie AND **before** returning JSON to the SPA (defense in depth). |

### 6. PDF Text Extraction

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **unpdf** | 1.8.0 | Wraps `pdfjs-dist` and abstracts the Node worker setup so `extractText(buffer)` just works | pdf.js is the reference implementation (Mozilla, Apache-2.0); `unpdf` is the unjs team's thin Node adapter that removes the worker-configuration pain of using `pdfjs-dist` 6.2.108 directly. Returns per-page text items with position/transform metadata that can be sorted (Y then X) to recover reading order from single-column PDFs. **Multi-column academic PDFs are the known-weak case** — sequence PDF AFTER the URL/HTML/Markdown pipelines are green and plan for honest-failure fallback when column heuristics are unreliable. |

### 7. EPUB Parsing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **jszip** | 3.10.1 | Read the EPUB ZIP archive | EPUB is a ZIP of XHTML chapters plus OPF/NCX manifest/spine XML. JSZip is the stable, battle-tested ZIP reader (used internally by `epubjs` and many others). |
| **fast-xml-parser** | 5.10.1 | Parse `META-INF/container.xml`, the OPF manifest, and the NCX/spine | Fast, pure-JS, no native bindings. Latest publish 2026-07-16. |

> **EPUB multi-chapter doc-model implication (flag for roadmapper):** EPUB is a BOOK, not a single article. The v1.0 canonical document model assumes one normalized article per library entry. EPUB forces a library entry to contain an ordered sequence of chapter-documents with cross-chapter location restoration, search, tag inheritance, and annotation indexing. This is a **document-model extension**, not a parser swap. Plan a phase that designs the chapter-bearing library entry before building the EPUB parser. Sequencing EPUB after URL+HTML+Markdown is intentional in the PROJECT.md milestone context.

### 8. Markdown Parsing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **unified** | 11.0.5 | Pipeline orchestrator (text → mdast → hast → HTML) | The reference ecosystem; composable, typed, pluggable. Produces an AST the normalizer can project cleanly onto the v1.0 canonical block model. |
| **remark-parse** | 11.0.0 | Markdown → mdast | Current stable parser used across the unified ecosystem. |
| **remark-rehype** | 11.1.2 | mdast → hast | Default behavior collapses raw HTML; see `rehype-raw` below if raw-HTML-in-Markdown is permitted. |
| **rehype-raw** | 7.0.0 | (Conditional) re-parse raw HTML nodes when the input Markdown may embed raw HTML | Include only if the product decision is to honor raw HTML in uploaded Markdown; otherwise omit and let remark-rehype drop it. |
| **rehype-sanitize** | 6.0.0 | hast allow-list sanitizer (the Markdown-pipeline equivalent of DOMPurify) | Uses `hast-util-sanitize`'s schema; configure the same allow-list as DOMPurify so both pipelines enforce identical policy. |
| **rehype-stringify** | 10.0.1 | hast → HTML string | Final serialization step. |

### 9. SSRF Defense (load-bearing — do not skip)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **private-ip** | 3.0.2 | Boolean check: is a resolved IP in a private / reserved range | Covers RFC1918, loopback, link-local (169.254/16 — includes the cloud-metadata endpoint 169.254.169.254), CGNAT (100.64/10), multicast, IPv6 ULA `fc00::/7`, and IPv6 loopback. Maintained, MIT, CI-friendly. |
| **is-ip** | 5.0.1 | String-shape validation of an IPv4/IPv6 literal before netmask math | Same author ecosystem; cheap guard before `private-ip`. |
| **ip-address** | 10.5.0 | Canonical IPv4/IPv6 parsing for redirect-IP re-validation | OWASP-recommended: not exposed to hex/octal/dword/URL/mixed-encoding bypasses that defeat weaker parsers. Use for any string → IP conversion inside the SSRF guard. |

> **OWASP SSRF pattern (apply as code, not as prose):** Deny-list at minimum 169.254.169.254 (AWS/GCP/Azure IMDS), 127.0.0.0/8, ::1/128, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 0.0.0.0/8, 100.64.0.0/10, 169.254.0.0/16, 224.0.0.0/4, ff00::/8. Disable redirects in undici (`maxRedirections: 0`) OR re-validate every redirect hop's resolved IP against the same deny-list. To counter DNS rebinding: resolve hostname → pin returned IP → open the socket to that IP with the original `Host` header (use undici's `connect.lookup`). Allow only `http`/`https` schemes. Apply at the application layer AND, where possible, at the network layer (egress firewall on the backend host). See OWASP Server-Side Request Forgery Prevention Cheat Sheet.

### 10. Deployment Shape (concrete recommendation)

**Recommended:** Ship the ingestion backend as a **separate long-lived Node service** in a container (Fly.io, Render, Railway, or self-hosted). Keep the static Vite 8 SPA on any HTTPS static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages, S3+CloudFront — whatever v1.0 already uses).

| Concern | Separate Node service | Serverless function on SPA host |
|---------|----------------------|--------------------------------|
| Timeout ceiling | None worth worrying about (5-30s fetches fine) | Vercel Hobby 10s, Pro 60s; Cloudflare Workers 30s CPU; Netlify 10-26s. PDF/EPUB paths will hit these. |
| Cold start | None | Adds 200-1500ms+ to first request |
| SSRF egress control | Strong — pin egress through firewall/proxy; control DNS | Weak — shared infra; harder to enforce network-layer deny-lists |
| CPU for pdfjs-dist work | Tunable | Capped |
| Cost at low volume | ~$5-15/mo flat | Free tier often covers it |
| Operational complexity | One more thing to deploy/monitor | Zero extra ops |

**Rationale:** URL fetch + extraction routinely takes 5-30 seconds; PDF parsing is CPU-heavy and unpredictable. Serverless timeouts and CPU caps will eventually break those paths. A long-lived container also gives tight control over egress (the network-layer half of OWASP's defense-in-depth SSRF pattern), which is non-negotiable for a service that accepts arbitrary URLs from users.

**CORS:** Backend emits `Access-Control-Allow-Origin: <exact SPA origin>` (never `*`) and handles `OPTIONS` preflight for `POST /ingest/url` and `POST /ingest/upload` (these are non-simple due to `Content-Type: application/json` and the file upload).

**CSP:** The SPA's `Content-Security-Policy` must enumerate the backend origin in `connect-src` (e.g. `connect-src 'self' https://ingest.lem-reader.example.com;`). Keep `default-src 'self'`, `script-src 'self'`, no `unsafe-inline`. Ingested article HTML rendered by the reader must NOT execute as page origin — render into a `separate origin` (sandboxed iframe with `sandbox="allow-same-origin"` minimum) or rely on DOMPurify + CSP together (defense in depth; DOMPurify is the primary guard, CSP is the backstop).

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| Backend framework | Hono 4.13.1 | Fastify 5.11.3 | Choose Fastify if raw throughput matters more than portability across runtimes; pulls pino, find-my-way, ajv. |
| Backend framework | Hono 4.13.1 | Express 5.2.1 | Express 5 just reached stable; choose only if team familiarity outweighs TS-ergonomics and runtime portability. |
| Backend shape | Separate Node service | Serverless function on SPA host | Choose serverless only if low volume is guaranteed AND PDF/EPUB parsing is deferred indefinitely. |
| Backend bundler | (none — Hono runs natively on Node 22) | Nitro 2.13.4 / Vite SSR middleware | Nitro adds an opaque deployment adapter layer that buys little for one ingestion service. Vite SSR would entangle the backend with the SPA's build — the v1.0 stack deliberately keeps the SPA static; don't reintroduce coupling. |
| Extractor | Defuddle 0.19.2 | @postlight/parser 2.2.3 (formerly Mercury Parser) | **Do not use.** Last npm publish October 2022 — unmaintained. The repo is publicly readable but receives no releases. |
| Extractor | Defuddle 0.19.2 | Mozilla Readability 0.6.0 alone | Use as the documented fallback when Defuddle's output quality is poor, not as the primary. |
| Sanitizer (URL/HTML) | DOMPurify 3.4.13 | sanitize-html 2.17.6 | Choose sanitize-html only if a string-in/string-out pipeline (no jsdom) is a hard constraint. sanitize-html uses htmlparser2 and does not share the DOMPurify/Cure53 pedigree. |
| Sanitizer (Markdown) | rehype-sanitize 6.0.0 | DOMPurify 3.4.13 on the serialized HTML | Re-serializing then DOMPurifying is wasteful; rehype-sanitize operates directly on hast. Keep DOMPurify for the URL/HTML pipeline, rehype-sanitize for Markdown. |
| PDF | unpdf 1.8.0 | pdfjs-dist 6.2.108 raw | Choose raw pdfjs-dist only if you need APIs unpdf doesn't expose; you'll re-implement the worker setup. |
| PDF | unpdf 1.8.0 | pdf-parse | Do not use — unmaintained, prior security advisories. |
| PDF | unpdf 1.8.0 | mupdf-js | Avoid — native bindings complicate deployment. |
| EPUB | JSZip + fast-xml-parser | epub2 3.0.2 | Maintenance unclear; do not pick for new v2.0 work. |
| EPUB | JSZip + fast-xml-parser | @gxl/epub2 | **Not on npm (deleted).** Remove from consideration. |
| EPUB | JSZip + fast-xml-parser | epubjs 0.3.93 | epub.js is a client-side RENDERER (pulls localforage, marks-pane, @xmldom/xmldom). Wrong fit for a Node ingestion pipeline. |
| Markdown | unified + remark + rehype | marked 18.0.9 | marked is fast and synchronous, returns an HTML string with no AST. Wrong for a pipeline that must sanitize + project to a typed doc model. Use marked only for one-off quick renders. |
| SSRF | private-ip + is-ip + ip-address + manual IP pinning | A single "SSRF library" | No single Node library covers the full OWASP pattern (deny-list + redirect re-validation + DNS rebinding defense). Assemble from the three primitives plus undici's `connect.lookup` hook. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@postlight/node-readability`** | Does not exist on npm. The actual package is `@postlight/parser` (v2.2.3, last published October 2022 — stale). | Defuddle 0.19.2 (primary) + Mozilla Readability 0.6.0 (fallback). |
| **`@gxl/epub2`** | Not on npm (deleted). | JSZip + fast-xml-parser. |
| **`epubjs` (epub.js) for server-side EPUB parsing** | It's a client-side renderer; pulls `localforage`, `@xmldom/xmldom`, `marks-pane`. Wrong shape for an ingestion backend. | JSZip + fast-xml-parser. |
| **`pdf-parse`** | Unmaintained; past security advisories. | unpdf 1.8.0. |
| **`mupdf-js`** | Native bindings — deployment burden; conflicts with the lightweight-container deployment shape. | unpdf 1.8.0. |
| **`node-fetch`** | Maintenance-only; Node 22 ships undici + global fetch. | undici 8.10.0. |
| **Nitro / Nuxt server / Vite SSR for the backend** | Entangles the backend with the SPA build. The v1.0 stack deliberately ships a static SPA; reintroducing SSR/middleware coupling is the very thing v1.0 rejected. | A separate Hono service. |
| **Next.js / Remix / React Router framework mode** | Same reason v1.0 rejected them — adds SSR framework machinery for a client-only reader. (Carried forward from v1.0 STACK.md.) | Static Vite 8 SPA + separate Hono backend. |
| **`marked` for ingestion** | No AST, synchronous, weaker extension semantics. | unified + remark + rehype. |
| **Tailwind / component suite** | Carried forward from v1.0 — the reader surface depends on carefully controlled semantic markup and authored CSS. | Authored CSS. |
| **`linkedom` as the DOM substrate for ingestion** | Works with Defuddle but does NOT satisfy DOMPurify's `window` requirement; running two DOM implementations in one pipeline invites drift. | jsdom 30.0.1 (one DOM substrate across extraction + sanitization). |
| **Single-purpose "SSRF library"** | None exists for Node that covers the full OWASP pattern. | private-ip + is-ip + ip-address + undici `connect.lookup`. |
| **`sanitize-html` as the primary XSS sanitizer** | String-in/string-out; weaker pedigree than Cure53's DOMPurify. | DOMPurify 3.4.13 for URL/HTML; rehype-sanitize 6.0.0 for Markdown. |

## Stack Patterns by Variant

**URL ingestion path:**
1. SPA `POST /ingest/url { url }` → backend.
2. Backend validates URL with Zod (`https?` scheme, no credentials in userinfo, length cap).
3. Backend resolves hostname → IP via `node:dns/promises`; deny-list check with `private-ip`/`is-ip`/`ip-address`.
4. Backend fetches with undici (`maxRedirections: 0`, content-type allow-list `text/html`/`application/xhtml+xml`, response-size cap, headersTimeout/bodyTimeout); pin the resolved IP via `connect.lookup` to defeat DNS rebinding.
5. Parse the HTML with jsdom → `Document`.
6. Run `Defuddle(document, { url, markdown: false })`; if quality is low, fall back to `new Readability(document).parse()`; if both fail, return an honest 422 ("couldn't reliably extract").
7. Sanitize the extracted HTML with DOMPurify (allow-list = v1.0 block/inline model).
8. Run the v1.0 normalizer over the sanitized HTML → canonical doc model (Zod-validated at the boundary).
9. Return JSON to the SPA; SPA persists into Dexie under the existing schema (extended for library metadata).

**HTML upload path:** Skip steps 2-4; start at step 5 with the uploaded file contents.

**Markdown upload path:**
1. SPA uploads `.md` (or pastes text).
2. Backend runs `unified().use(remarkParse).use(remarkRehype, { allowDangerousHtml: false }).use(rehypeSanitize, lemReaderSchema).use(rehypeStringify)`.
3. Take the resulting HTML → DOMPurify pass (defense in depth) → v1.0 normalizer → canonical doc model.

**PDF upload path:** (sequence AFTER URL/HTML/Markdown are green)
1. SPA uploads `.pdf`.
2. Backend runs `unpdf.extractText(buffer)` → per-page text items with transform metadata.
3. Heuristic reading-order recovery (sort by Y then X within page); detect multi-column and either recover or honest-fail.
4. Project recovered text into the canonical doc model (paragraphs only — PDFs rarely carry clean semantic structure). Flag the document as PDF-sourced for the reader's disclosure surface.

**EPUB upload path:** (sequence AFTER PDF; needs doc-model extension first)
1. SPA uploads `.epub`.
2. Backend unzips with JSZip; reads `META-INF/container.xml` → OPF path; parses OPF spine (reading order).
3. For each chapter in the spine: parse XHTML, sanitize with DOMPurify, normalize to canonical doc model.
4. Persist as a **multi-chapter library entry** (requires extending the library-entry schema — design phase needed before this pipeline is built).

## Installation

```bash
# --- Backend (separate package, separate package.json from the SPA) ---
# Runtime
npm install hono@4.13.1 @hono/node-server@2.1.0 @hono/zod-validator@0.9.0 \
  undici@8.10.0 jsdom@30.0.1 \
  defuddle@0.19.2 @mozilla/readability@0.6.0 dompurify@3.4.13 \
  unpdf@1.8.0 \
  jszip@3.10.1 fast-xml-parser@5.10.1 \
  unified@11.0.5 remark-parse@11.0.0 remark-rehype@11.1.2 \
  rehype-raw@7.0.0 rehype-sanitize@6.0.0 rehype-stringify@10.0.1 \
  private-ip@3.0.2 is-ip@5.0.1 ip-address@10.5.0 \
  zod@4.4.3

# Dev (backend) — match v1.0 test stack
npm install -D typescript@7.0.2 vitest@4.1.10 @types/dompurify
```

> **Repo shape:** Keep the SPA and backend in the same repo but as separate workspaces (pnpm workspace, npm workspace, or two `package.json` files at `app/` and `ingest/`). They share Zod schemas via a small `shared/` package. The SPA does not import `defuddle`, `jsdom`, `undici`, etc. — those are backend-only dependencies and must not enter the Vite client bundle.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|------------------|-------|
| hono 4.13.1 | @hono/node-server 2.1.0; @hono/zod-validator 0.9.0; Node 22 | Verify `@hono/zod-validator` peer range against Zod 4.4.3 in implementation (zod-validator latest published 2026-07-15; covers Zod 4 in modern releases). |
| undici 8.10.0 | Node 22 LTS | Node 22 ships an older undici internally; installing 8.10.0 explicitly gives the SSRF-control API surface. |
| jsdom 30.0.1 | Node 22; DOMPurify 3.4.13; Defuddle 0.19.2 (via `defuddle/node`) | DOMPurify requires a real `window` — jsdom, not linkedom. |
| defuddle 0.19.2 | jsdom 30.0.1 OR linkedom 0.18.13; Node ESM (`"type": "module"`) | `defuddle/node` requires ESM. The v1.0 project already sets `"type": "module"` — preserved. |
| @mozilla/readability 0.6.0 | jsdom 30.0.1 | Use the `Readability` named export; pass `jsdom`'s `window.document`. |
| dompurify 3.4.13 | jsdom 30.0.1 | Use `createDOMPurify(window)` factory pattern. |
| unpdf 1.8.0 | Node 22 (uses pdfjs-dist under the hood) | No worker config needed (unpdf handles it). |
| jszip 3.10.1 + fast-xml-parser 5.10.1 | Node 22 | Pure JS, no native deps. |
| unified 11 + remark-parse 11 + remark-rehype 11 + rehype-sanitize 6 + rehype-stringify 10 | Node 22 | ESM-only; matches the existing `"type": "module"`. |
| private-ip 3.0.2 | Node 22 | ESM; recent publish; CI-friendly. |

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Hono + @hono/node-server as the ingestion backend | HIGH | npm registry + GitHub README + Web-standard API alignment with v1.0 fetch patterns; current stable release line. |
| Defuddle as primary extractor | HIGH | npm registry + GitHub README (8.9k stars, 730 commits, active releases, documented Node.js usage with jsdom and linkedom). |
| Mozilla Readability as fallback | HIGH | npm registry + Mozilla README explicitly recommending DOMPurify + CSP for untrusted input. |
| DOMPurify for URL/HTML sanitization | HIGH | npm registry + Mozilla's explicit recommendation; Cure53 pedigree. |
| unified/remark/rehype for Markdown | HIGH | npm registry + the unified-ecosystem packages are the reference Markdown pipeline. |
| unpdf for PDF text extraction (Node ergonomics) | HIGH | npm registry + unjs pedigree. |
| unpdf fitness for multi-column PDFs | MEDIUM | Reading-order recovery is a project-specific empirical question; honest-failure fallback required. |
| JSZip + fast-xml-parser for EPUB | HIGH (for parsing primitives) / MEDIUM (for product fit) | The primitives are stable; the doc-model extension for multi-chapter entries is unresolved. |
| SSRF defense pattern | HIGH | OWASP Cheat Sheet (authoritative). |
| SSRF defense implementation correctness | MEDIUM | Pattern is clear; correctness is in the implementation. Needs a red-team review and explicit tests for each bypass class (hex/octal/dword/URL/mixed-encoding, DNS rebinding, redirect-following). |
| Separate-Node-service deployment shape | MEDIUM | Recommendation aligns with the constraints (long fetches, CPU for PDF, egress control); concrete host choice is a downstream decision. |
| Rejection of Postlight, epubjs, @gxl/epub2, pdf-parse, mupdf-js, node-fetch, Nitro | HIGH | npm registry metadata (missing packages, stale publish dates, wrong shape). |

## Sources

- npm registry metadata — versions, descriptions, last-publish dates, dependency lists (HIGH).
  - Verified packages: `hono`, `@hono/node-server`, `@hono/zod-validator`, `fastify`, `express`, `defuddle`, `@mozilla/readability`, `@postlight/parser` (NOT `@postlight/node-readability` — does not exist), `dompurify`, `sanitize-html`, `unpdf`, `pdfjs-dist`, `epub2`, `epubjs`, `jszip`, `fast-xml-parser`, `linkedom`, `jsdom`, `unified`, `remark-parse`, `remark-rehype`, `rehype-raw`, `rehype-sanitize`, `rehype-stringify`, `marked`, `undici`, `private-ip`, `is-ip`, `ip-address`, `cheerio`, `turndown`, `nitropack`, `@gxl/epub2` (NOT on npm).
- GitHub: `kepano/defuddle` README — Node usage, bundle variants, standardization behavior for footnotes/code/ headings/math/callouts, linkedom/jsdom integration (HIGH).
- GitHub: `mozilla/readability` README — Node usage with jsdom, `parse()` return shape, and the explicit security recommendation to use DOMPurify + CSP (HIGH).
- GitHub: `postlight/parser` — confirms `@postlight/parser` is the active package name (not `@postlight/node-readability`); repo public but npm publish stale since October 2022 (HIGH).
- OWASP Cheat Sheet Series — Server-Side Request Forgery Prevention (authoritative; HIGH). Documents Case 1/Case 2, allow-list vs deny-list, IP-range minimum deny-list, redirect-following bypass, DNS pinning, JavaScript library recommendation (`ip-address`), IMDSv2.
- Node.js docs — undici/fetch APIs, `node:dns/promises`, `node:net` (HIGH).

---
*Stack research for: Lem Reader v2.0 Personal Library — ingestion backend, multi-format intake, sanitization, SSRF defense, deployment shape.*
*Re recherched: 2026-08-10*
