# Pitfalls Research

**Domain:** Adding a URL-fetch+extract backend, multi-format ingestion (HTML/PDF/EPUB/Markdown), a personal library, versioned export/import, and an annotation review panel to an EXISTING accessible reader with a SHIPPED, validated pagination + annotation + a11y substrate.
**Researched:** 2026-08-10
**Confidence:** HIGH for security/library-capability claims (verified against current DOMPurify v3.4.13, OWASP SSRF Prevention Cheat Sheet, Readability.js, epub.js, pdfjs-dist, Dexie docs, Snyk Zip Slip advisory); MEDIUM for project-fit conclusions on PDF/EPUB extraction quality (empirical, corpus-dependent).

> **Scope note.** These pitfalls are specific to ADDING the v2.0 Personal Library capabilities to Lem Reader's existing substrate. The v1.0 substrate (canonical 9-kind/4-mark Zod doc model + grapheme-offset coordinate system, project-owned pagination engine, calibrated measurement, tri-state annotation anchors, full a11y suite, 1157-test green CI gate) is treated as **protected** — it is not re-researched here. Every pitfall below is written against the assumption that the substrate must not regress.

> **Phase-numbering convention.** v1.0 ended at Phase 6; v2.0 phases continue from Phase 7. Phases are not yet defined — the roadmapper owns final numbering and grouping. Below, pitfalls are tagged with a **topic-based phase label** (e.g., "URL Ingestion phase", "Multi-format Ingestion phase", "Library phase", "Export/Import phase", "Annotation Review phase", "Polish phase") plus the natural milestone ordering described in PROJECT.md (URL+HTML path proven first, EPUB/PDF sequenced after). The roadmapper should map these labels to concrete Phase 7+ numbers.

---

## Critical Pitfalls

### Pitfall 1: Ingested Block Shapes the Pagination Engine Cannot Handle

**What goes wrong:**
The pagination engine was calibrated against a curated 6-article corpus covering 9 block kinds. Real-world extraction (Readability output, EPUB chapter XHTML, PDF reconstructed text) produces block kinds the engine has never measured: deeply nested lists, definition lists, `<aside>`/`<figure>` chains, tables (explicitly out of scope per v1.0 but extraction will surface them), image-heavy galleries, embedded `<pre>` with very long lines, `<ruby>` annotations, and unpredictable inline mark combinations. Result: post-render overflow guard trips repeatedly → readers get bounced to scroll fallback on most ingested articles → the pagination hypothesis (the product's whole point) appears to fail on real content.

**Why it happens:**
The v1.0 PAGE-03b post-render overflow guard is correctly conservative — when it detects overflow it falls back rather than clipping. That guard was tuned on the corpus, but its *tolerance* for unknown shapes defaults to "fall back." Extracted HTML carries the full diversity of the open web, and Readability preserves more structure than the curated fixtures ever did.

**How to avoid:**
- **Classify before paginating.** Add an extraction-time `blockKindHistogram` to each normalized article. The pagination engine reads this and either paginates confidently (all known kinds), paginates with tightened overflow guard (some unknown kinds), or proactively falls back to scroll (mostly unsupported kinds). This turns the current PAGE-04 "fallback after failure" into a "predict fallback before painting."
- **Add block-kind invariants to the doc model.** Reuse DOC-06's disclosure contract: if more than X% of extracted blocks are unsupported kinds, mark the article `unsupported` and surface that to the reader **before** they enter the reader — not after pagination churns.
- **Never silently coerce.** An unsupported `<table>` must NOT be flattened into a paragraph (loses semantics, breaks a11y) or silently dropped (violates DOC-06). It must be disclosed.
- **Widen the corpus deliberately.** When the engine meets a new shape, add a calibrated fixture for it (re-run the PAGE-08 calibration discipline) before declaring the shape "supported."

**Warning signs:**
- The fallback banner (`PAGE-09`) appears on most ingested articles in dogfooding.
- New block kinds are added to the doc model without a corresponding pagination test fixture.
- Perf budget tests pass on v1.0 fixtures but you have no perf tests on extracted articles.
- "We'll just fall back to scroll" becomes the default answer for ingested content.

**Phase to address:** **URL Ingestion phase** (first path that produces extracted content) — define the block-kind histogram + predict-fallback policy here. Reinforce in **Multi-format Ingestion phase** (PDF/EPUB produce even stranger shapes). Re-run the v1.0 PAGE-08 calibration discipline whenever a new block kind is promoted to "supported."

---

### Pitfall 2: Extraction Normalization Diverges From the Grapheme-Offset Substrate

**What goes wrong:**
The v1.0 annotation + location system is anchored to a single canonical normalized-text stream with `Intl.Segmenter` grapheme offsets. ANNO-07's tri-state resolution depends on this. Extracted content arrives as raw HTML with arbitrary whitespace, NFKD/NFKC normalization ambiguity, mixed Unicode (smart quotes, em-dashes, zero-width joiners in emoji, BOMs, ligatures), and entity encoding variations. If the ingestion pipeline normalizes text differently than v1.0's normalization rules — even subtly (e.g. collapsing `\n\n` to `\n`, or preserving vs. stripping U+200B zero-width spaces) — then:
- Highlights created on an ingested article won't round-trip through reopen.
- TextQuote context-match (the fallback anchor) will fail because the stored quote doesn't byte-for-byte match the re-extracted text on a refresh.
- Reading position restoration lands one paragraph off.

**Why it happens:**
v1.0's normalization was defined once and applied to fixtures at authoring time. v2.0 introduces a second normalization path (extraction) that must produce **byte-identical** normalized text to the same content version. The most common slip is treating "extract once, store" as the contract — but a refresh/re-extract runs normalization again, and any drift between extract-time and refresh-time normalization (or between Readability's output and EPUB's output for the same logical content) silently orphans every annotation.

**How to avoid:**
- **One normalizer, one path.** Reuse v1.0's exact normalization module for both fixture authoring and ingestion. No extraction-specific whitespace/Unicode handling. If a new rule is needed (e.g. PDF text from `pdfjs-dist` arrives with hyphenated line breaks that need joining), add it to the **shared normalizer** and re-version the doc model (DOC-04 content revision bump).
- **Pin the normalization version into the content revision.** Two articles with the same source URL extracted under normalization v1 vs v2 are different DOC-04 revisions. Annotation anchors scope to a revision; a refresh that changes normalization MUST scope-migrate or invalidate, never silently re-attach.
- **Round-trip test every extracted article.** Before an ingested article enters the library, run an automated anchor round-trip: pick N grapheme offsets, serialize to `TextPositionSelector` + `TextQuoteSelector`, re-normalize, re-resolve. Must reach `confident` for all N. This is the ANNO-05/07 invariant applied at ingestion time.
- **Re-extract determinism.** A refresh of the same URL must produce byte-identical normalized text (modulo genuinely changed source). If Readability's output is non-deterministic across runs (it can be — DOM mutation order, lazy-loaded content), the refresh must detect a content-revision change and surface it, not silently re-anchor.

**Warning signs:**
- Highlights work on fixtures but drift on ingested articles after a refresh.
- Two extracts of the same URL produce different `length` values.
- `TextQuoteSelector` resolution returns `ambiguous` more often on ingested content than on fixtures.
- Ingestion has its own whitespace-cleanup code separate from v1.0's normalizer.

**Phase to address:** **URL Ingestion phase** (first pipeline that produces normalized text from arbitrary input). The shared-normalizer discipline must land here; the round-trip test must be an ingestion gate. Every Multi-format Ingestion sub-pipeline (HTML/PDF/EPUB/Markdown) inherits the contract.

---

### Pitfall 3: SSRF — The Fetch Backend Probes Internal Networks

**What goes wrong:**
The URL fetcher now accepts ARBITRARY user-supplied URLs and the backend makes the request server-side. Classic SSRF vectors:
- **Cloud metadata exfiltration.** A reader submits `http://169.254.169.254/latest/meta-data/iam/security-credentials/ROLE_NAME` (AWS IMDSv1 returns IAM credentials in the response body; the reader's "article" would contain the keys). GCP (`http://metadata.google.internal/computeMetadata/v1/` with `Metadata-Flavor: Google` header) and Azure (`http://169.254.169.254/metadata/instance?api-version=2021-02-01` with `Metadata: true`) are equivalent.
- **Internal service discovery.** `http://10.0.0.5:6379/` (Redis), `http://localhost:3000/admin`, internal-only REST APIs that return data without auth because "the network is the perimeter."
- **`file://` scheme reads.** `file:///etc/passwd` or `file:///proc/self/environ` if scheme validation is missing.
- **Redirect-following bypass.** Initial URL is `https://example.com/legit` (passes validation); server responds 302 → `http://169.254.169.254/`. If the HTTP client auto-follows redirects, validation is circumvented.
- **DNS rebinding (TOCTOU).** `attacker.com` resolves to a public IP at validation time, then to `127.0.0.1` a few milliseconds later when the HTTP client connects. Validation and connection must use the SAME resolved IP.
- **IPv4-mapped IPv6 bypass.** `::ffff:169.254.169.254` or `::ffff:7f00:1` evades a string-equality check for `127.0.0.1`.
- **Encoding bypasses.** `0x7f.0.0.1`, `0177.0.0.1`, `2130706433` (dword), `http://[::1]/`, URL-encoded octets — all reach localhost but defeat naive IP parsers.

**Why it happens:**
A "just `fetch(url)`" implementation looks correct in dev (against public sites) and is catastrophically wrong in production. The backend is now a proxy that gives any reader the ability to make the server issue HTTP requests, and the server can reach places the reader cannot reach directly.

**How to avoid (defense in depth — all layers required):**
1. **Scheme allowlist.** Accept only `http:` and `https:`. Reject `file:`, `gopher:`, `data:`, `dict:`, `ftp:`, `smb:`, all others at the URL parser. SSRF is not limited to HTTP.
2. **Disable redirect-following** in the HTTP client (OWASP's explicit guidance for Case 2 fetchers). Re-validate each redirect target through the full pipeline; cap redirect count at a small number (3–5) and re-run IP validation at every hop.
3. **Resolve once, connect to the resolved IP.** Resolve the hostname to A + AAAA records yourself; verify EVERY resolved address is a public IP (reject RFC1918 `10/8`, `172.16/12`, `192.168/16`, loopback `127.0.0.0/8`, `0.0.0.0/8`, link-local `169.254/16`, multicast `224/4`, IPv6 `::1/128`, `fc00::/7`, `fe80::/10`); then connect to the literal resolved IP with a `Host` header carrying the original hostname. This defeats DNS rebinding.
4. **Normalize IP forms before checking.** Use a vetted library (`ip-address` npm, OWASP-recommended for JS — NOT exposed to hex/octal/dword/URL-encoding bypasses) to parse. Normalize IPv4-mapped IPv6 to its IPv4 form before the private-range check.
5. **Block metadata hostnames explicitly.** Reject `169.254.169.254`, `metadata.google.internal`, `metadata.amazonaws.com` at the hostname layer in addition to the IP layer.
6. **Egress allowlist at the network layer** if the deploy environment supports it (firewall / security group / egress proxy). This is the belt to the application-layer suspenders.
7. **No response body returned on validation failure.** A blocked request returns a structured `fetchBlocked` error, never the upstream body (even an error body can leak — e.g. a redirect target).
8. **Cap request size, timeout, and concurrency per reader.** Prevent the fetcher from being weaponized as a DoS amplifier or port scanner (timing side-channels on connection refusal).
9. **Test the SSRF guard matrix.** A regression suite of malicious URLs (metadata endpoints, localhost encodings, redirect chains, rebinding simulation) must be a CI gate. This is the v1.0 "honest full-suite execution discipline" (Key Decision #9) applied to security.

**Warning signs:**
- The fetcher uses `fetch(url)` with `redirect: 'follow'` (default).
- IP validation uses `String.prototype.includes` or regex instead of a parser.
- No test for `0x7f000001`, `2130706433`, `::ffff:127.0.0.1`, `http://[::1]`.
- "We'll just block `169.254.169.254`" — a single string check, no normalization.
- The fetcher runs in the same network segment as a metadata service or internal database.

**Phase to address:** **URL Ingestion phase** — landing the fetcher without the full SSRF guard matrix is a release blocker. The SSRF test matrix is a phase exit criterion.

---

### Pitfall 4: XSS via Ingested HTML Sanitizer Misconfiguration

**What goes wrong:**
Extracted HTML rendered into the semantic renderer can carry scripts, event handlers, malicious links, and namespace-confusion payloads. DOMPurify is necessary but not sufficient. Concrete failure modes:
- **Default profile too wide.** DOMPurify v3.4.13 defaults allow HTML **+ SVG + MathML**. The Lem Reader renderer never needs SVG or MathML for article text; allowing them opens the mXSS (mutation XSS) attack surface for no benefit.
- **Sanitize-then-re-introduce.** The cardinal foot-gun, called out explicitly in DOMPurify's README: *"if you first sanitize HTML and then modify it afterwards, you might easily void the effects of sanitization."* If Lem Reader sanitizes raw HTML → then re-parses it into the 9-kind doc model → then re-serializes to DOM, the doc-model transformation can re-introduce an mXSS payload that survives in the re-serialized form even though the intermediate sanitized string was clean. (The same risk applies if any downstream code touches `innerHTML`.)
- **`javascript:` and `data:` URIs in `href`/`src`.** DOMPurify's default `ALLOWED_URI_REGEXP` blocks `javascript:` but is permissive about other schemes; `data:text/html,...` in an `<iframe>` (if `<iframe>` is allowed — it must not be) executes script.
- **Allowing `target="_blank"` without `rel="noopener noreferrer"`.** Reverse-tabnabbing: the opened original-source link can rewrite `window.opener.location`.
- **DOM clobbering.** `<img id="location" src="x">` clobbers `document.location` in some parsers; affects any code that walks the DOM by `id`.
- **Wrong server-side DOM.** DOMPurify on Node requires jsdom, and jsdom versions have shipped XSS bugs (jsdom v19 → fixed in v20). happy-dom is explicitly **not safe** for sanitization per DOMPurify's README. Using a stale jsdom or happy-dom silently defeats the sanitizer.
- **`ALLOW_UNKNOWN_PROTOCOLS: true`** or wide `ADD_TAGS`/`ADD_ATTR` widenings. Each one re-opens an attack class.

**Why it happens:**
"Run it through DOMPurify" feels sufficient and isn't. The DOMPurify README, OWASP, and Mozilla all insist that sanitization is one layer of a defense-in-depth strategy that also includes CSP and a correct downstream rendering pipeline. Readability.js explicitly does NOT sanitize and tells you to do it yourself.

**How to avoid:**
1. **Sanitize at the boundary, never re-parse to HTML after.** Sanitize raw extracted HTML once; convert the sanitized tree directly into the 9-kind doc model; render the doc model with React elements (never `dangerouslySetInnerHTML`). The doc model is the security boundary — anything that isn't expressible as one of the 9 kinds + 4 marks simply does not exist in the output. This structurally eliminates the sanitize-then-re-introduce class.
2. **Restrict the profile.** `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` — no SVG, no MathML.
3. **Allowlist tags and attributes explicitly** to the subset the 9-kind model can produce: `p, h1-h6, ul, ol, li, blockquote, pre, code, a, em, strong, img, figure, figcaption, br, hr, sub, sup` (and only the marks the model supports). Do NOT include `script, iframe, object, embed, form, input, style, link, meta, base, svg, math`.
4. **Forbid URI schemes outside the explicit allowlist** `http, https, mailto` (and only on `href`/`src`). Keep DOMPurify's default `ALLOWED_URI_REGEXP` or tighten it. Never set `ALLOW_UNKNOWN_PROTOCOLS: true`.
5. **Force `rel="noopener noreferrer"` on every `<a>`** that survives sanitization, and rewrite `target` to either `_self` or controlled values only.
6. **Use the current jsdom** server-side; pin it and track its CVEs. Never sanitize with happy-dom.
7. **Apply a strict CSP** on the app shell: `script-src 'self'`, no `unsafe-inline`, no `unsafe-eval`. CSP is the defense that survives a sanitizer bypass.
8. **Add a sanitizer regression suite.** Feed the mXSS, clobbering, and namespace-confusion payloads from DOMPurify's own `Attack Classes & Bypass History` wiki into the ingestion pipeline and assert the resulting doc model contains zero executable content.

**Warning signs:**
- The renderer uses `dangerouslySetInnerHTML` anywhere.
- DOMPurify is called without `USE_PROFILES: { html: true }`.
- jsdom is pinned to an old version, or happy-dom is used in the ingestion path.
- A `target="_blank"` link has no `rel="noopener"`.
- The doc model accepts a "raw HTML" block kind as an escape hatch.
- No test feeds `<img src=x onerror=alert(1)>` or `<svg><g/onload=alert(2)//<p>` into ingestion.

**Phase to address:** **URL Ingestion phase** — the sanitizer + doc-model-as-security-boundary design must be in place before the first extracted article enters the library. The mXSS regression suite is a phase exit criterion. Reinforce in **Multi-format Ingestion phase** for EPUB (chapter XHTML) and HTML upload.

---

### Pitfall 5: Silent Garbage Into the Library — Breaking the DOC-06 Honest-Failure Contract

**What goes wrong:**
Real extraction fails in many ways the curated fixtures never exercise:
- **Paywalled / login-gated content** extracts the paywall UI ("Subscribe to read…") as the article body.
- **JS-only SPAs** extract an empty `<div id="root"></div>` because the fetcher didn't run scripts (and must not, per Readability's own guidance).
- **Boilerplate/navigational pages** extract the site chrome as the "article."
- **Short non-article pages** (a tweet, a 404, a redirect stub) pass Readability's default 500-char threshold but are not articles.
- **Aggressive anti-scraping** returns a CAPTCHA page, an empty body, or a 403.

If the pipeline silently stores whatever Readability returns, the library fills with garbage that paginates weirdly, anchors annotations to paywall text, and undermines the core promise. Worse, the DOC-06 contract ("reader is informed when content is unsupported rather than having it silently omitted") — which v1.0 honored for fixtures — is silently violated for every ingested article.

**Why it happens:**
`isProbablyReaderable()` is explicitly documented to produce **both false positives and false negatives**. Readability exposes no confidence score in its result object — only `length`, `title`, `excerpt`. Without a deliberate confidence heuristic + honest failure surface, the path of least resistance is "store whatever came back."

**How to avoid:**
1. **Derive a confidence score** from multiple signals, not just `length`:
   - Article character length (must exceed a meaningful threshold, not just Readability's 500).
   - `textContent`-to-`content` ratio (real articles are mostly text; chrome-heavy extracts are mostly markup).
   - Link density (real articles have sparse inline links; nav/list pages are mostly links).
   - Presence of a non-empty `title` and `byline`/`publishedTime`.
   - Headings-to-paragraphs ratio (long-form has structure; paywall stubs don't).
   - Similarity of `excerpt` to `title` (low-quality SEO pages repeat the title).
2. **Three-state outcome** at ingestion, mirroring ANNO-07's tri-state discipline:
   - `confident` → enter library, paginate normally.
   - `low-confidence` → enter library but flagged; reader is warned "this extract may be incomplete" on open, with a `Refresh` / `View original` action.
   - `unsupported` → refuse to add; surface the reason (paywall suspected, JS-only, blocked, too short) and link to the original. This honors DOC-06.
3. **Detect specific anti-extraction signals explicitly.** CAPTCHA markers, HTTP 401/403, `robots.txt` disallow, paywall CSS class heuristics, empty body — each maps to a specific disclosure message.
4. **Retry/refresh path.** Some failures are transient (rate limit, slow SPA hydration). Offer a manual refresh that re-runs extraction; treat re-extracted content as a DOC-04 content revision bump and scope-migrate annotations (see Pitfall 2).
5. **Never let a `low-confidence` or `unsupported` outcome become `confident` by default.** Confidence only upgrades through explicit user action ("Mark as good") or a successful re-extract.

**Warning signs:**
- Every URL the dogfooders try "successfully" enters the library.
- No `low-confidence` or `unsupported` state exists in the library UI.
- A paywalled article shows up in the library with the paywall text as the body.
- `isProbablyReaderable()` is the only gate, with no score or threshold.
- No way for the reader to refresh or re-extract.

**Phase to address:** **URL Ingestion phase** — confidence scoring and the three-state outcome ship with the first ingestion path. Honest-failure UX is part of the phase, not deferred.

---

### Pitfall 6: EPUB Treated as One Article — Losing Chapter Structure, TOC, and Per-Chapter Anchors

**What goes wrong:**
An EPUB is a zip of XHTML chapters described by an OPF manifest + spine (ordered chapter list) + a navigation document (`nav.xhtml` for EPUB 3, `.ncx` for EPUB 2). Treating the book as a single flat article means:
- **TOC navigation is lost.** Readers cannot jump to a chapter; the ORNT-01 heading-and-section navigator (a deferred v2 candidate) becomes essential for books and is missing.
- **Reading position is book-global** instead of per-chapter; reopening a 50-chapter book lands "at offset 48213" which must be re-resolved against the whole book's normalized text.
- **Annotation anchors span the whole book**, so re-extracting/re-normalizing one chapter (e.g. on a refresh) can orphan every annotation in the book.
- **Pagination performance collapses** on large books — the engine was calibrated on 6 articles, not 800-page novels.
- **Using epub.js's renderer** silently replaces Lem Reader's whole reading surface. epub.js v0.3's `book.renderTo(element, opts)` owns its own iframe-sandboxed renderer with its own pagination/flow manager. Embedding it inside the React app discards the semantic React renderer, the v1.0 a11y suite, the pagination engine, AND the annotation substrate.

**Why it happens:**
"An EPUB is just a long article" is the obvious first model. epub.js *looks* like the standard solution (6.9k stars, Moby Dick demo), but it is a *renderer*, not a parser — it does the very thing Lem Reader already does, differently and incompatibly.

**How to avoid:**
1. **Treat a book as a collection of chapter articles**, not one article. Each spine item becomes its own normalized doc with its own identity (DOC-04), its own reading position (STATE-01), and its own annotation scope (ANNO-01..07).
2. **Add a `Book` entity to the library** that owns an ordered list of chapter doc ids; the TOC is the chapter list, giving ORNT-01 navigator for free.
3. **Use epub.js for parsing only** (its `Book` spine/navigation APIs) or parse OPF + nav.xhtml/NCX directly with JSZip/fflate for unzipping. Do NOT use `Rendition` / `renderTo`. Sanitize each chapter's XHTML through the same DOMPurify pipeline as URL extraction (Pitfall 4) before normalizing into the doc model.
4. **Each chapter gets the round-trip anchor test** (Pitfall 2) before it enters the library.
5. **Scoped pagination.** Paginate per chapter, not per book. The chapter boundary is also the natural pagination boundary; cross-chapter pagination is not required for v2.0.
6. **Book-level position = (chapterId, chapterOffset).** This composes better than book-global offset and survives per-chapter re-normalization.

**Warning signs:**
- The data model has a single `Article` entity and EPUBs are stuffed into it.
- epub.js's `rendition` is mounted inside the React tree.
- A 300-chapter book is loaded as one doc and the perf budget explodes.
- No TOC / chapter navigation surface for EPUBs.
- Re-extracting a chapter orphans annotations in other chapters.

**Phase to address:** **Multi-format Ingestion phase** (EPUB sub-stream). PROJECT.md already sequences EPUB after the URL+HTML path is proven — that sequencing is correct, because EPUB needs the per-chapter `Book`/chapter model that the URL path does not.

---

### Pitfall 7: PDF Extraction Silently Produces Wrong-Order or Empty Text

**What goes wrong:**
`pdfjs-dist` exposes text items with x/y coordinates via `pdfPage.streamTextContent({ includeMarkedContent: true, disableNormalization: true })`. It does **not** reconstruct reading order for you. Concrete failure modes:
- **Multi-column layouts read across, not down.** A two-column academic paper extracts as "Column1Line1 Column2Line1 Column1Line2 Column2Line2…" — gibberish. Annotations anchor to gibberish. Pagination of gibberish is meaningless.
- **Scanned/image PDFs** have an empty text content stream. The pipeline emits an empty article or, worse, emits a single block with `""` text. The reader opens a "100-page book" with zero readable content.
- **Tables** extract as flattened cell text with no row/column structure — wrong reading order, lost semantics.
- **Footnotes interleaved** with body text at the same y-coordinate extract out of order.
- **Right-to-left languages, vertical text (CJK), and rotated text** all need explicit handling or extract as visual-position garbage.

**Why it happens:**
PDF is a print-description format, not a semantic document format. There is no `<paragraph>` or `<heading>` in a PDF — only positioned glyphs. The Lem Reader doc model is semantic. Bridging the two is a research-grade problem; treating it as "just call pdfjs" guarantees the failure modes above.

**How to avoid:**
1. **Detect unsupported PDFs and disclose them (DOC-06), not silently emit garbage.**
   - Scanned/image PDF: zero or near-zero text items per page → `unsupported: scanned-pdf`, suggest the reader use an OCR tool first (out of scope for v2.0).
   - Multi-column: detect via x-coordinate clustering per page; if columns are detected and reading-order reconstruction is not implemented, mark `unsupported: multi-column-pdf` or `low-confidence: reconstructed-order`.
   - Tables/heavy layout: detect via text-item density and bounding-box overlap; mark `unsupported: tabular-pdf`.
2. **Reading-order reconstruction is a separable sub-project.** If pursued, it needs its own test corpus of representative PDFs and a measured quality bar before promotion. Treat it like PAGE-08 calibration — do not enable by default until cross-PDF quality is proven.
3. **Per-page text items → doc model** with conservative coercion: one block per detected paragraph (paragraph = vertical gap heuristic), heading detection by font size (if font info is exposed), list detection by bullet glyphs. Mark every block `low-confidence: pdf-extracted`.
4. **Round-trip anchor test** (Pitfall 2) on PDF-extracted text — if the test fails, the article is `unsupported`.
5. **Honest scope.** v1.0's Out of Scope explicitly excluded "tables, interactive embeds, math, and irregular application layouts." PDFs frequently contain all four. Plan for a high `unsupported` rate on PDF ingestion and surface it honestly.

**Warning signs:**
- Every PDF "successfully" extracts to a library entry.
- No `unsupported` outcome exists for scanned/tabular/multi-column PDFs.
- Extracted text from a two-column PDF reads as interleaved gibberish when opened.
- No PDF corpus in the test suite; only one sample PDF.
- "We'll add OCR later" with no flagging of scanned PDFs in the meantime.

**Phase to address:** **Multi-format Ingestion phase** (PDF sub-stream, sequenced after EPUB). PDF is the highest-extraction-risk format and must carry the strongest DOC-06 discipline.

---

### Pitfall 8: Dexie v2 Schema Migration Loses v1.0 Fixtures, Highlights, or Position

**What goes wrong:**
v1.0 ships a Dexie schema with fixtures, preferences, reading positions, highlights, and notes — all validated, all migration-tested (STATE-04, STATE-05). v2.0 must add user-ingested articles next to curated fixtures, plus tags, search index entries, and library metadata. Concrete migration failures:
- **Compound-key collision between fixture and user article ids.** If fixtures and user articles share an `id` namespace (or a `[source+id]` compound key is mis-designed), a user-uploaded article with the same id as a fixture overwrites the fixture, or vice versa.
- **`db.on('populate')` re-fires or mis-fires.** Populate runs ONLY on initial DB creation, never on upgrade. If fixture-seeding logic is moved or duplicated into a v2 populate hook, existing v1.0 users never receive the new fixtures; if v1.0's populate is altered, new users get different seed data than existing users.
- **Index silently dropped.** Dexie drops any index not re-specified in the new version's `.stores({...})`. A v1.0 annotation-query index forgotten in the v2 declaration silently breaks annotation resolution performance.
- **Non-atomic upgrade with side effects.** Dexie guarantees upgrade atomicity ("data will under no circumstances be left half-upgraded"), but only if the upgrade function does not perform side effects (DOM writes, network calls, `setTimeout` breaks the transaction).
- **Unbounded IndexedDB growth.** Ingested articles carry full normalized text + extracted HTML + extracted images. A few hundred articles can blow past browser IDB quotas; `QuotaExceededError` surfaces as STATE-05's "storage unavailable" recoverable state, but only if the code path actually checks `navigator.storage.estimate()` proactively.
- **A failed v1.0-to-v2.0 upgrade bricks the entire library** because `db.open()` fails and the app cannot start.

**Why it happens:**
Schema migration looks like "add a new table" and is actually a coordinated change across identity, indexing, seeding, and quota strategy. v1.0 had it easy (one source of articles: fixtures). v2.0 has two (fixtures + user content) with different lifecycle rules.

**How to avoid:**
1. **Namespaced article identity.** `[kind, id]` compound key where `kind ∈ {fixture, url, html, pdf, epub, markdown}`. Fixtures keep their stable ids; user articles get generated ids that cannot collide. Or use a single `articleId` with a `source` discriminator and never reuse fixture ids.
2. **Do not touch v1.0's populate hook.** Keep v1.0's populate verbatim. Add new fixture-seeding (if any) through a v2 upgrade function that runs once and is idempotent (check-before-insert).
3. **Re-declare every v1.0 index** in the v2 `.stores({...})` declaration, even unchanged ones. Audit the v1.0 schema declaration against the v2 declaration line by line.
4. **Upgrade function is pure.** No `setTimeout`, no network, no DOM. Only Dexie transactions. Keep it small; test it against a fixture-loaded v1.0 DB snapshot in CI.
5. **Proactive quota management.** Check `navigator.storage.estimate()` before each ingestion; surface `library-full` to the reader BEFORE the write fails. Offer library-size UI + remove-from-library. Request persistent storage (`navigator.storage.persist()`) on first ingestion with reader consent.
6. **Migration test as phase exit criterion.** A CI test that (a) creates a v1.0 DB populated with the v1.0 fixture snapshot, (b) runs the v2 migration, (c) asserts every v1.0 article, highlight, note, position, and preference is intact and addressable. This mirrors v1.0's "honest full-suite execution" discipline (Key Decision #9).
7. **STATE-05 recoverable-error path covers migration failure.** If `db.open()` fails on upgrade, the reader sees the recoverable state, not a white screen.

**Warning signs:**
- A single `id` primary key with no `source` discriminator.
- The v2 schema declaration omits tables that v1.0 had.
- No CI test exercises the v1→v2 migration with real v1.0 data.
- Ingested articles carry raw extracted HTML alongside the normalized doc model (storage bloat).
- No `navigator.storage.estimate()` check anywhere in the codebase.

**Phase to address:** **Library phase** (first phase that adds user-content tables). The migration test must be a phase exit criterion before ANY user ingests a real article. Reinforced in **Export/Import phase** (Pitfall 10).

---

### Pitfall 9: Reading-Mode Flash on First Paint (Polish)

**What goes wrong:**
The reader's preferred reading mode (paginated vs. scrolling) is persisted in Dexie. Dexie reads are async. On cold load, the React tree mounts and paints with a default mode (say, paginated), then Dexie resolves with the persisted preference (say, scrolling), and the surface snaps to scrolling a frame later. The reader sees pagination paint and then jump to scroll — visible churn that violates the calm-experience promise (READ-04) and can flash the pagination fallback banner transiently.

**Why it happens:**
"Read the preference async, then render" is the natural React pattern, and it is wrong for a paint-critical value. The same anti-pattern causes FOUC (flash of unstyled content) in CSS theming.

**How to avoid:**
1. **Synchronous hint.** Persist the last-used reading mode to `localStorage` (synchronous) as well as Dexie (durable). Read `localStorage` synchronously in the inline bootstrap script (in `index.html` `<head>`, before React mounts) and set the initial mode from it. Dexie remains the source of truth; `localStorage` is only a render hint.
2. **Render the persisted mode on first paint.** React's initial state must match the hint, not a hardcoded default.
3. **Reconcile after Dexie resolves.** If Dexie disagrees with the hint (rare — different browser, cleared cache), switch silently without a banner. If Dexie agrees, no visible change.
4. **No-flash default for first-time visitors.** Choose the default mode deliberately; it should be the one most first-time readers will keep (pagination is the distinctive Lem Reader default).
5. **Apply the same discipline to theme (light/dark).** Dark-mode flash is the canonical FOUC variant; the same synchronous-hint pattern fixes it.

**Warning signs:**
- Reading mode is read only via `useLiveQuery` / async Dexie read.
- The reader surface visibly snaps from paginated to scrolling (or vice versa) on cold load.
- No inline bootstrap script in `index.html`.
- The same flash happens with theme.

**Phase to address:** **Polish phase** (the milestone explicitly calls this out as a polish item). Low-complexity once the pattern is identified, but it must be a deliberate fix with a Playwright cold-load visual regression test.

---

### Pitfall 10: Progress-Bar Off-by-One on Short Articles (Polish)

**What goes wrong:**
A 1-page article shows "100%" on open (already at the last page). A 2-page article shows "50%" the instant it opens (page 1 of 2). Both feel wrong: the reader has barely started and the bar says they are done or half-done. This contradicts READ-05's "quiet structural location or progress information that does not treat responsive page number as permanent identity."

**Why it happens:**
`progress = (currentPage + 1) / totalPages` or `currentPage / totalPages` — both have a boundary problem. The first formula caps a 1-page article at 100% on open; the second floors a 1-page article at 0% and only reaches 100% on a non-existent "next" page.

**How to avoid:**
1. **Reframe progress as "reading progress," not "page index ratio."** A reader opening a 1-page article has made *no* progress; a reader who has finished it has made full progress. The bar should reflect how much of the article's text is *above* the current viewport, not the page pointer.
2. **Anchor the bar to grapheme offsets, not page numbers.** `progress = currentOffset / totalNormalizedLength`. A 1-page article opened at offset 0 shows 0%; scrolled/paged to the bottom shows ~100%. This is consistent with v1.0's "content anchor, not page number" discipline (READ-05, ANNO-06).
3. **For paginated mode specifically,** map the current page's starting offset to the progress bar. Opening page 1 of 1 → 0%; the bar advances as the reader pages forward; reaching the last page's end → ~100%.
4. **Test the boundary cases explicitly:** 1-page, 2-page, N-page articles; first page, last page, single page. Add a Playwright assertion.
5. **Keep the bar quiet (READ-04/READ-05).** The bar must not be precise enough to imply "page X of Y is your identity" — round or smooth it so it reads as orientation, not measurement.

**Warning signs:**
- The progress formula uses page indices.
- A 1-page article shows 100% on open in any Playwright screenshot.
- No test covers the 1-page and 2-page boundary cases.
- The bar reads as a step function that jumps per page rather than a smooth reading-progress indicator.

**Phase to address:** **Polish phase** (explicitly called out in the milestone). Trivial fix once the offset-anchored reframing is chosen; add the boundary-case tests in the same plan.

---

### Pitfall 11: Export/Import — Version Skew, Partial Imports, and Zip Slip

**What goes wrong:**
Versioned export/import (PORT-01/02) carries its own failure modes:
- **Version skew.** A v2.1 export imported into v2.0 (or v3.0) silently drops fields, misinterprets shapes, or corrupts annotations. Without an explicit `schemaVersion` field + version negotiation, "import succeeded" is meaningless.
- **Partial-import inconsistency.** Importing 50 articles + 200 highlights fails at article 47 with a validation error. If the import isn't transactional, the library now has 47 articles and 0 highlights — every annotation is orphaned, STATE-04 is violated, and the reader has no clear path forward.
- **Conflict-resolution UX vacuum.** Importing an article that already exists in the library: overwrite (loses local highlights), skip (loses incoming data), merge (how? by content revision?). Without an explicit policy + UI, the reader's choice is unclear or the code silently picks one.
- **Path traversal (Zip Slip) in any archive-based format.** If export produces a zip and import unzips it, a malicious export (or a hand-crafted attack file) can include entries like `../../config.json` that write outside the import directory. EPUB import (Pitfall 6) is the same class of risk — EPUB is a zip.
- **Filename issues.** Reader-supplied or server-generated filenames with `../`, NUL bytes, or OS-reserved names (`CON`, `AUX`, `NUL` on Windows) can break file-based export.
- **Large-export performance.** A library of 500 articles with full text + highlights serialized to JSON in one string blows the call stack, freezes the UI, or hits a string-size limit. Streaming or chunked export is required.
- **Annotation orphaning on import.** Exporting highlights whose article wasn't exported (or was deleted before export) produces orphans with no recovery path.

**Why it happens:**
Export/import looks like "serialize the library to JSON and back." It is actually a schema-stable cross-version data interchange protocol with conflict semantics, security boundaries, and performance constraints. v1.0 didn't have to solve this because there were no user accounts and no cross-device story.

**How to avoid:**
1. **Versioned envelope.** Every export is `{ schemaVersion: N, exportedAt, appVersion, articles: [...], highlights: [...], notes: [...], positions: [...], preferences: {...} }`. Importer negotiates: if `schemaVersion > current`, refuse with a clear "exported by a newer Lem Reader" message; if `< current`, run a migration chain (mirror STATE-04 discipline).
2. **Validate the entire bundle before any write.** Run the Zod schema over the whole import first; surface all validation errors as a list, not just the first. Only write if the whole bundle is valid. (Or use a Dexie transaction — see #3.)
3. **Atomic import via a single Dexie transaction.** All writes (articles + highlights + notes + positions + preferences) go in one Dexie transaction. If anything fails, the entire import rolls back. Dexie's atomicity guarantee applies. Do NOT break the transaction with `setTimeout` or async side effects.
4. **Explicit conflict policy per entity.** Default per-entity to `skip-and-report` (safest); offer `overwrite` and `merge-by-content-revision` as reader choices. Present a conflict report after import: "Imported X new, skipped Y existing, Z conflicts." Never silently overwrite.
5. **Zip Slip prevention (mandatory).** For every archive entry (EPUB, zip-based export, any archive import): `const target = path.resolve(outDir, entry.name); if (!target.startsWith(path.resolve(outDir) + path.sep)) reject(entry)`. Run this on EVERY entry, no exceptions. fflate and JSZip both expose entry names unsanitized — the application must validate. Add a regression test with `../../evil.sh` and `..%2F..%2Fevil.sh` entries.
6. **Sanitize filenames.** Reader-supplied filenames: strip path separators, NUL, OS-reserved names; generate safe names server-side for the on-disk filename; keep the reader's name only as a display metadata field.
7. **Streaming/chunked export for large libraries.** Stream the JSON to a `Blob` incrementally (File System Access API `showSaveFilePicker` + `createWritable`, or chunked Blob construction) instead of building one giant string. Show progress.
8. **Orphan-tolerant import.** Imported highlights whose article is missing enter the library in the ANNO-07 `orphan` state with a visible "article not in this library" disclosure, rather than being dropped silently.

**Warning signs:**
- No `schemaVersion` field in the export format.
- Import writes article-by-article outside a transaction.
- Conflict policy is hardcoded with no UI.
- Archive extraction has no `path.resolve + startsWith` check.
- Export builds a single `JSON.stringify(library)` string.
- No test imports a bundle exported by an older or newer schema version.

**Phase to address:** **Export/Import phase** (PORT-01/02). Zip Slip prevention also applies to **Multi-format Ingestion phase** for EPUB/HTML-zip uploads. The atomic-transaction discipline is shared with Pitfall 8's migration discipline.

---

### Pitfall 12: Heavy Ingestion Blocks Repagination and Breaks the Performance Budget

**What goes wrong:**
ACPT-04 enforces a `npm run perf` CI gate on repagination. v2.0 introduces ingestion work (extraction, sanitization, normalization, image fetching, PDF parsing) that runs in the same browser tab as the reader. If ingestion runs on the main thread, or if ingested articles carry heavy assets (large images, base64-encoded blobs, dozens of footnotes), repagination of the currently-open article can blow the budget. The reader is mid-sentence on Article A; they ingest Article B; Article A's repagination stutters because the main thread is parsing PDF.

**Why it happens:**
The v1.0 perf budget assumed a quiet single-article environment. v2.0 makes the reader tab a concurrent ingestion + reading environment, and ingestion is CPU-heavy.

**How to avoid:**
1. **Off-main-thread ingestion.** PDF parsing, EPUB unzip, Readability extraction, and sanitization belong in a Web Worker (or the backend for URL ingestion). The main thread stays free for repagination.
2. **Pause ingestion when repaginating.** If a Worker isn't feasible for a sub-task, at least yield to the event loop between blocks and check whether repagination is pending.
3. **Asset budget per article.** Cap total image bytes, count of assets, and normalized-text length per ingested article. Surface `unsupported: too-large` (DOC-06) above the cap.
4. **Lazy-load assets in the reader.** Ingested images load on-demand when their page is opened, not at article-open. Keep the v1.0 font-settling discipline (Pitfall 1, v1.0) — extend it to image-settling for the post-render overflow guard.
5. **Extend the perf gate to ingested content.** Add representative ingested articles (one per ingestion source: URL/HTML/PDF/EPUB/Markdown) to the `npm run perf` matrix. Do not let the gate cover only v1.0 fixtures.
6. **Measure ingestion impact on open-article repagination.** A Playwright scenario: open Article A, start ingesting Article B in the background, assert Article A's repagination stays within budget.

**Warning signs:**
- Ingestion runs on the main thread.
- A large PDF import freezes the open article's repagination.
- The perf gate covers only v1.0 fixtures.
- Ingested articles embed images as base64 in the doc model.
- No budget cap on ingested article size.

**Phase to address:** **URL Ingestion phase** (introduce the Worker boundary with the first ingestion path). Extended in **Multi-format Ingestion phase** (PDF/EPUB are the heaviest). The perf-gate extension is a phase exit criterion for the **Library phase** once representative ingested content exists.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing raw extracted HTML alongside the normalized doc model | Faster to debug extraction; "just in case" | Doubles storage; tempts `dangerouslySetInnerHTML` rendering later; blows IDB quota on large libraries | Never in production. Debug-only, stripped before write. |
| `isProbablyReaderable()` as the only ingestion gate | Ships fast | Garbage into the library; DOC-06 violation at scale | Never for v2.0 — pair with confidence scoring (Pitfall 5) from day one. |
| Single flat `Article` table with EPUBs stuffed in | No schema work | Lose chapter structure, TOC, per-chapter anchors; brick EPUB UX (Pitfall 6) | Never — model `Book` / `Chapter` from the start. |
| `dangerouslySetInnerHTML` for one weird extracted element | Unblocks a corner case | Reintroduces the entire XSS class (Pitfall 4); bypasses the doc-model security boundary | Never. Extend the doc model or mark unsupported. |
| `fetch(url)` with default redirect-follow | 3-line implementation | Full SSRF surface (Pitfall 3) | Never in production; prototype-only with a TODO + test stub. |
| Treating PDF as "just call pdfjs and emit text" | Quick demo | Silent wrong-order text and empty extracts (Pitfall 7) | Demo-only; production needs DOC-06 detection. |
| Reading mode via async Dexie only | Natural React pattern | Reading-mode flash on every cold load (Pitfall 9) | Never — synchronous hint from day one. |
| `currentPage / totalPages` progress formula | Trivial | 1-page = 100% on open (Pitfall 10) | Never — anchor to offsets. |
| Archive extraction with no Zip Slip check | Save 5 lines | Path traversal → RCE on any archive import (Pitfall 11) | Never. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Readability.js (URL extraction) | Passing the live DOM (parse mutates it); forgetting `url` in JSDOM so relative URLs break | Pass `document.cloneNode(true)`; pass the source URL to JSDOM; never use its output unsanitized |
| DOMPurify (server-side) | Using happy-dom or stale jsdom | Pin current jsdom; never happy-dom (explicitly unsafe per DOMPurify README) |
| DOMPurify (client renderer) | Sanitizing then re-serializing via doc model then `dangerouslySetInnerHTML` | Sanitize once at ingestion boundary; render the doc model as React elements; never `dangerouslySetInnerHTML` |
| epub.js | Using `Rendition.renderTo` inside React | Use only `Book` spine/navigation parsing; render chapters through Lem Reader's own pipeline |
| pdfjs-dist | Treating `getTextContent` output as ordered prose | Reconstruct reading order from x/y; detect scanned/multi-column explicitly; mark low-confidence |
| Dexie migrations | Editing a v1.0 version declaration that has an upgrader | Add a new `version(N+1)` with `.stores()`/`.upgrade()`; never mutate an existing version with an upgrader |
| Dexie transactions | `setTimeout` or async side effects inside an upgrade/transaction | Keep transactions pure; auto-commit breaks on idle |
| IndexedDB quota | Writing unbounded user content with no `navigator.storage.estimate()` check | Proactive estimate before write; surface `library-full`; request persistent storage with consent |
| `fetch` in URL backend | Default `redirect: 'follow'` | Disable redirects or re-validate every hop; cap redirect count |
| Archive libraries (fflate/JSZip) | Trusting `entry.name` as a safe path | `path.resolve + startsWith` validation on every entry |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Main-thread ingestion | Repagination stutters during background PDF/EPUB import | Web Worker for parse/sanitize/normalize; main thread only for render | Any article > ~5K words or any PDF > 10 pages |
| Storing extracted HTML in IDB | Quota errors after a few hundred articles | Store only the normalized doc model + selected asset URLs; lazy-load assets | ~50–500 articles depending on length |
| Repaginating the whole book (EPUB) | Cold-open latency seconds-to-minutes | Per-chapter pagination; chapter boundary = pagination boundary | Any EPUB > ~20 chapters |
| One-shot `JSON.stringify(library)` export | UI freeze; string-size limit at ~500MB–1GB | Streaming/chunked export via File System Access API | Library > ~100 articles |
| Eager image loading in paginated mode | First-page paint blows the perf budget on image-heavy articles | Lazy-load images per page; extend font-settling discipline to image-settling | Articles with > 5 images |
| Perf gate covers only v1.0 fixtures | v1.0 budget green; ingested articles regress undetected | Add one representative ingested article per source to the perf matrix | The moment real content exists |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Allowlist-based SSRF (impossible for arbitrary URLs) | Reader cannot submit arbitrary URLs | Use OWASP Case 2 deny-list + IP-validation pipeline (Pitfall 3) |
| Default DOMPurify profile (HTML+SVG+MathML) | mXSS surface for zero benefit | `USE_PROFILES: { html: true }` |
| Sanitize → doc model → `dangerouslySetInnerHTML` | Sanitizer output is voided by re-serialization | Render the doc model as React elements; doc model is the security boundary |
| `fetch(url)` with `redirect: 'follow'` | Validation bypass via 302 to metadata endpoint | Disable redirects; re-validate every hop |
| String-equality check for SSRF IP blocking | Encoding/IPv6-mapped bypasses | Use vetted `ip-address` library; normalize IPv4-mapped IPv6 |
| Stale jsdom or happy-dom server-side | Known XSS bugs in old jsdom; happy-dom explicitly unsafe | Pin current jsdom; track CVEs |
| `target="_blank"` without `rel="noopener"` | Reverse tabnabbing | Force `rel="noopener noreferrer"` on every surviving `<a>` |
| Accepting arbitrary URI schemes | `file:`, `gopher:`, `data:`, `dict:` are SSRF vectors | Scheme allowlist `http`/`https` (+ `mailto` for display only) |
| No Zip Slip check on EPUB/archive import | Arbitrary file overwrite → RCE | `path.resolve + startsWith` on every archive entry |
| Returning upstream error body on blocked fetch | Error body leaks internal topology | Return only a structured `fetchBlocked` reason; never upstream bytes |
| Reader-supplied filename used directly on disk | Path traversal, NUL injection, OS-reserved names | Generate safe on-disk name; keep user name only as metadata |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Every URL "successfully" enters the library | Library fills with garbage; trust erodes | Three-state ingestion (confident / low-confidence / unsupported) with honest messaging |
| Paywalled article body = paywall text | Reader "saved" nothing readable | Paywall detection + `unsupported` outcome; link to original |
| Reading-mode flash on cold load | Feels broken; violates calm-experience promise | Synchronous `localStorage` hint in inline bootstrap; render persisted mode on first paint |
| 1-page article shows 100% on open | Reader feels the bar is meaningless | Offset-anchored progress (`currentOffset / totalLength`); 0% on open, ~100% at end |
| EPUB with no chapter navigation | 300-page book with no way to jump chapters | Per-chapter model; TOC surface (also unlocks ORNT-01 navigator) |
| Import silently overwrites or skips | Reader cannot tell what changed | Conflict report: "Imported X, skipped Y, Z conflicts" with per-entity policy |
| Annotation disappears after URL refresh | Reader thinks the product lost their work | Content-revision scope migration; surface `ambiguous`/`orphan` per ANNO-07; never silent re-attach |

## "Looks Done But Isn't" Checklist

- [ ] **URL ingestion:** Often missing SSRF guard matrix — verify a test exists for `169.254.169.254`, `0x7f000001`, `::ffff:127.0.0.1`, redirect-to-metadata, DNS rebinding simulation.
- [ ] **URL ingestion:** Often missing confidence scoring — verify three-state outcome (confident / low-confidence / unsupported) with paywall detection.
- [ ] **HTML sanitization:** Often missing the doc-model-as-security-boundary invariant — verify no `dangerouslySetInnerHTML` exists in the renderer, and the mXSS regression suite (DOMPurify wiki payloads) runs in CI.
- [ ] **EPUB ingestion:** Often missing per-chapter model — verify a `Book` entity owns chapter doc ids and TOC navigation exists.
- [ ] **PDF ingestion:** Often missing scanned/multi-column detection — verify `unsupported: scanned-pdf` and `unsupported: multi-column-pdf` outcomes exist and are tested.
- [ ] **Schema migration:** Often missing v1→v2 migration test — verify a CI test creates a v1.0 fixture snapshot, migrates, and asserts every v1.0 record intact.
- [ ] **Schema design:** Often missing namespaced article identity — verify fixtures and user articles cannot collide on id.
- [ ] **Quota management:** Often missing proactive `navigator.storage.estimate()` — verify `library-full` is surfaced before the write fails.
- [ ] **Export/import:** Often missing `schemaVersion` field — verify import refuses bundles from newer schemas and migrates older ones.
- [ ] **Export/import:** Often missing Zip Slip check — verify `../../evil.sh` entry is rejected by every archive code path (EPUB + zip export).
- [ ] **Reading-mode flash:** Often missing synchronous hint — verify an inline bootstrap script reads `localStorage` before React mounts and a Playwright cold-load test asserts no mode snap.
- [ ] **Progress bar:** Often missing boundary tests — verify 1-page and 2-page articles do not show 100% / 50% on open.
- [ ] **Perf gate:** Often covers only v1.0 fixtures — verify ingested representative articles (one per source) are in the `npm run perf` matrix.
- [ ] **Anchor round-trip:** Often skipped for ingested content — verify every ingested article passes the N-offset `TextPositionSelector + TextQuoteSelector` round-trip before entering the library.
- [ ] **a11y (whole milestone):** Often regresses silently — verify the v1.0 axe-core suite still runs green on the library, ingestion UI, export/import UI, and annotation review panel; re-run VoiceOver+Safari manual protocol (ACPT-02) and add NVDA+Firefox follow-up.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SSRF found post-ship | LOW (code-only) | Add the full guard matrix; ship a hotfix; audit access logs for metadata-endpoint hits; rotate any leaked credentials |
| XSS sanitizer bypass found | MEDIUM | Bump DOMPurify + jsdom; tighten profile; add the bypass to the regression suite; ship CSP as defense-in-depth; audit reader-visible content for delivered payloads |
| Garbage library entries accumulated | LOW | Add the confidence scorer retroactively; surface a "low-confidence" filter in the library; offer bulk cleanup |
| EPUB shipped as flat article | HIGH (data migration) | Re-model as Book/Chapter; write a v2.x migration that splits existing flat-EPUB articles by detected chapter boundaries; re-anchor annotations per chapter; expect some orphaning |
| PDF extraction shipped without scanned detection | MEDIUM | Add detection; mark existing scanned-PDF entries `unsupported`; offer removal from library |
| Failed v1→v2 migration bricks the app | HIGH (per-user) | Trigger STATE-05 recoverable-error path; offer "export diagnostics," "reset library," or "downgrade" path; ship fixed migration as v2.0.1 |
| Schema migration drops v1.0 highlights | HIGH (data loss) | Dexie atomicity should prevent this; if it happened, restore from the pre-migration IDB backup (if taken) or from a recent export bundle |
| Annotation orphaning on re-extract | MEDIUM | ANNO-07 already surfaces `orphan`; offer RECV-02 explicit repair once that v2 candidate is built; never silently re-attach |
| Reading-mode flash | LOW | Inline bootstrap + `localStorage` hint; one-plan fix |
| Progress bar off-by-one | LOW | Offset-anchored formula; one-plan fix |
| Zip Slip exploited | CRITICAL | Block archive imports; add the `path.resolve + startsWith` check; audit filesystem for writes outside the import dir; treat as a security release |

## Pitfall-to-Phase Mapping

The roadmapper owns final phase numbering. Phase labels below are **topic-based**; PROJECT.md's milestone ordering suggests the natural grouping.

| Pitfall | Topic Phase | Verification |
|---------|-------------|--------------|
| 1. Block shapes the engine can't handle | URL Ingestion → reinforced Multi-format Ingestion | Predict-fallback policy; per-block-kind perf tests on extracted articles |
| 2. Normalization diverges from grapheme-offset substrate | URL Ingestion | Round-trip anchor test gate on every ingested article; shared normalizer audit |
| 3. SSRF on URL fetcher | URL Ingestion | Malicious-URL regression matrix (metadata, encodings, redirects, rebinding) in CI |
| 4. XSS via ingested HTML | URL Ingestion → reinforced Multi-format Ingestion (EPUB/HTML) | mXSS regression suite; renderer audit (no `dangerouslySetInnerHTML`); strict CSP |
| 5. Silent garbage into library (DOC-06) | URL Ingestion | Three-state outcome UI; paywall/empty/short-page detection tests |
| 6. EPUB treated as one article | Multi-format Ingestion | Per-chapter model; TOC navigation; book = (chapterId, offset) position |
| 7. PDF silent wrong-order / empty text | Multi-format Ingestion | Scanned/multi-column/tabular detection; DOC-06 `unsupported` outcomes |
| 8. Dexie v2 schema migration | Library | v1→v2 migration CI test on fixture snapshot; namespaced identity; quota check |
| 9. Reading-mode flash (polish) | Polish | Inline bootstrap reads `localStorage`; Playwright cold-load no-snap test |
| 10. Progress-bar off-by-one (polish) | Polish | Offset-anchored formula; 1-page and 2-page boundary tests |
| 11. Export/import skew + Zip Slip | Export/Import | `schemaVersion` negotiation; atomic transaction import; Zip Slip test on every archive path |
| 12. Ingestion blocks repagination | URL Ingestion → reinforced Multi-format Ingestion | Web Worker boundary; perf gate extended to ingested representative articles |

**Cross-cutting phase notes for the roadmapper:**

- The **URL Ingestion phase** carries the most pitfall-prevention load (Pitfalls 1, 2, 3, 4, 5, 12 all start here). It must not be scoped as a thin slice — it establishes the security, normalization, confidence, and Worker boundaries that every later ingestion source reuses.
- The **Multi-format Ingestion phase** is the second pitfall-dense phase (Pitfalls 1, 4, 6, 7, 12 reinforced). PROJECT.md's sequencing ("EPUB's multi-chapter shape and PDF extraction quality are the riskier pipelines and sequence after the URL+HTML path is proven") is correct and should be preserved by the roadmapper.
- The **Library phase** owns the schema migration (Pitfall 8) and must complete before any reader can ingest real content into a durable library.
- The **Export/Import phase** owns Pitfall 11 and shares the atomic-transaction discipline with Pitfall 8.
- The **Polish phase** owns Pitfalls 9 and 10 (explicitly named in the milestone) and is low-risk once the patterns are identified.
- **NVDA+Firefox acceptance (ACPT-02 boundary A4)** is a v1.0 follow-up that the milestone re-opens; the a11y checklist item in "Looks Done But Isn't" should be its own plan in the acceptance phase, not bundled into another phase silently.
- Every phase that introduces a new block kind, normalization rule, or renderer change must re-run the v1.0 PAGE-08 calibration discipline (calibrate before promoting a fast path). Treat this as a standing acceptance gate.

## Sources

- [DOMPurify README (current v3.4.13)](https://github.com/cure53/DOMPurify/blob/main/README.md) — sanitizer capability, configuration options, server-side jsdom requirements, explicit "do not re-modify sanitized output" warning (HIGH).
- [DOMPurify wiki: Attack Classes & Bypass History](https://github.com/cure53/DOMPurify/wiki/Attack-Classes-&-Bypass-History) — taxonomy of mXSS, namespace confusion, DOM clobbering, rawtext breakouts the regression suite must cover (HIGH).
- [DOMPurify wiki: Security Goals & Threat Model](https://github.com/cure53/DOMPurify/wiki/Security-Goals-&-Threat-Model) — tags/attributes worth thinking twice about (HIGH).
- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — Case 2 (arbitrary external URLs) deny-list minimum ranges, IP validation, redirect disabling, DNS rebinding mitigation (HIGH).
- [OWASP SSRF community page](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery) — cloud metadata (`169.254.169.254`), `file://` reads, internal-service enumeration vectors (HIGH).
- [Mozilla Readability.js README](https://github.com/mozilla/readability/blob/main/README.md) — API surface (`length`, `textContent`, no confidence score), `isProbablyReaderable` false-positive/false-negative warning, parse mutates input, Mozilla's DOMPurify+CSP recommendation, jsdom script-execution disabled-by-default (HIGH).
- [epub.js README (v0.3)](https://github.com/futurepress/epub.js/blob/master/README.md) — confirmation that epub.js owns its own renderer (`book.renderTo`), iframe-sandboxed, with its own pagination/flow managers — conflicts structurally with Lem Reader's React renderer (HIGH).
- [pdf.js `text_layer_builder.js`](https://github.com/mozilla/pdf.js/blob/master/web/text_layer_builder.js) — `pdfPage.streamTextContent({ includeMarkedContent, disableNormalization })` API; consumer reconstructs reading order from positioned text items (HIGH).
- [Dexie Design docs: Database Versioning](https://dexie.org/docs/Tutorial/Design#database-versioning) — `version(N).stores({...})`, upgrader rules, "data will under no circumstances be left half-upgraded" atomicity guarantee, `populate` runs only on initial creation (HIGH).
- [Dexie `version()` API](https://dexie.org/docs/Dexie/Dexie.version()) — backend IDB version = N×10; upgrader-attached version must never be altered (HIGH).
- [Snyk Zip Slip advisory (2018, still canonical)](https://snyk.io/blog/zip-slip-vulnerability/) — directory-traversal filenames in archive entries; affects zip/tar/jar/war/cpio/apk/rar/7z — every archive format Lem Reader might import (HIGH).
- Lem Reader `.planning/PROJECT.md` — v1.0 substrate description, v2.0 milestone scope, key decisions (#9 honest full-suite execution discipline), out-of-scope list (HIGH — project context).
- Lem Reader `.planning/milestones/v1.0-REQUIREMENTS.md` — DOC-04/DOC-06, ANNO-07, STATE-04/05, PAGE-04/08/09, ACPT-02 boundary A4 contract hooks (HIGH — project context).

---
*Pitfalls research for: adding v2.0 Personal Library capabilities (URL fetch + extract backend, multi-format ingestion, library, versioned export/import, annotation review panel, polish) to Lem Reader's existing accessible-reader substrate.*
*Researched: 2026-08-10*
