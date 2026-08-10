# Feature Research: v2.0 Personal Library

**Domain:** Local-first accessible reader — adding URL/document ingestion, a personal library, versioned export/import, an annotation review panel, and polish fixes to a shipped v1.0 reading engine.
**Researched:** 2026-08-10
**Confidence:** HIGH for table-stakes and competitor patterns (verified against current official docs from Readwise Reader, Mozilla Readability, EPUB/Wikipedia, Wallabag, Hypothes.is); MEDIUM for the calm-library scoping recommendations (product judgment grounded in PROJECT.md positioning, not user studies).

> **Scope note.** This document covers ONLY the new v2.0 feature areas. The v1.0 reading surface (paginated + scrolling, typography/themes, location restoration, annotations, pagination engine) is already shipped and is treated as substrate. Where v2.0 features depend on or extend v1.0 substrate, the dependency is called out explicitly. The v1.0 FEATURES.md remains the canonical source for the reading engine.

---

## How to read this document

Each of the six feature areas is decomposed into **Table Stakes** (users penalize absence, do not reward presence), **Differentiators** (compete on calm/accessibility positioning, not feature parity), and **Anti-Features** (commonly requested features that would break Lem Reader's positioning, with the right alternative). **Complexity** is sized Small/Medium/Large assuming the v1.0 substrate (canonical document model, Dexie persistence, Zod validation, Playwright cross-engine harness, ANNO-07 tri-state resolution, STATE-04 versioned records, STATE-05 recoverable storage errors) is already in place.

The MVP Definition and Prioritization Matrix at the end consolidate a recommended v2.0 sequencing, which the requirements step can use directly.

---

## Feature Area 1 — Web Article Extraction / "Read It Later" Ingestion

**Standard reader experience (the contract readers bring from Pocket/Instapaper/Readwise Reader):** paste a URL (or use a browser extension / share sheet) → a clean, readable article appears in the library within a few seconds → title/byline/source domain are visible → the article is stored immutably so that highlights survive even if the original page changes or disappears.

**Honest failure is part of the contract, not an edge case.** Readwise explicitly states: *"we'll never be able to parse 100% of the internet 100% perfectly. HTML and CSS are just too flexible."* Their browser extension is positioned as *"an exception handler"* for when server-side URL fetch fails. Lem Reader v1.0 already established this disclosure spirit via **DOC-06** ("informed when a fixture contains unsupported content rather than having it silently omitted") — the URL-ingestion path inherits that contract.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes & Dependencies |
|---------|--------------|------------|----------------------|
| Paste-URL-to-save input | The defining gesture of the read-it-later category. | SMALL | Single text field + submit; one-tap entry on the library screen. |
| Server-side fetch + extract + normalize | Naked-URL save must work without an extension, because v2.0 explicitly defers browser-extension packaging. | LARGE | Reuses v1.0 canonical document model (DOC-05). Readability.js or Defuddle produce the candidate HTML; a new normalizer maps onto the existing 9 block kinds + 4 inline marks. Requires a stateless ingestion backend (new to the stack). |
| Honest null-result on unparseable page | Readability returns `null` below `charThreshold` (default 500 chars) or when no article candidate is found; readers must see "couldn't reliably read this page" rather than an empty or garbage article. | SMALL | Reuses **DOC-06** disclosure pattern. Surface a structured failure reason (network error, paywall, content too short, unsupported media type) with the source URL preserved so the reader can retry or visit the original. |
| Capture core metadata | Title, byline (author), site name, source URL, fetch date, excerpt are the minimum a reader needs to recognize an article in the library later. Readability exposes exactly these. | MEDIUM | Readability returns `title, byline, siteName, excerpt, lang, publishedTime, length, content, textContent, dir`. Note: Readability does **not** return a lead image URL in its type definition — cover thumbnails must come from explicit `<meta property="og:image">` / `<img>` extraction layered on top. |
| Preserve source URL + "open original" | Provenance is non-negotiable; readers need to verify, cite, or revisit the publisher's page. | SMALL | Already table stakes in v1.0 (**DOC-03** "follow preserved article links and access the original source URL and article metadata"). v2.0 extends it to dynamically-ingested articles. |
| Immutability of the saved version | Highlights anchor to canonical text; if the article silently re-extracted on every open, anchors would drift. Readwise is explicit: *"Reader will never try to re-parse previously saved content."* | MEDIUM | Reuses **DOC-04** "stable identity and revision" + **ANNO-05/06** anchor stability contract. Save-once, read-forever is the v1.0 fixture model; v2.0 just adds the ingestion event. Manual refresh = delete + re-save (with explicit warning that highlights will be lost). |
| Sanitization of ingested HTML | Ingested HTML is untrusted. Readability's maintainers explicitly recommend DOMPurify + CSP and refuse to ship sanitization themselves. | MEDIUM | Defense in depth: server-side sanitize before normalization, then re-validate the canonical JSON with the existing **Zod schema (STATE-04)**. CSP on the SPA. The normalized document model itself is the strongest defense — by the time content reaches React, it is plain JSON, not arbitrary HTML. |
| SSRF-safe URL fetching | A user-supplied URL must not let the backend reach RFC1918 space, link-local `169.254/16`, cloud-metadata `169.254.169.254`, CGNAT `100.64/10`, or follow redirects into private space (DNS rebinding). | MEDIUM | OWASP/CWE-918 patterns; redirect-following must re-validate each hop. This is new infrastructure risk that v1.0 (no backend) did not face. |
| Fetch timeout + size cap | A stuck or huge fetch would block the library surface and exhaust storage. Readwise caps uploads at 500 MB / Markdown at 10 MB. | SMALL | Reasonable timeout (~10–30s), max-content-length guard, abort-controller. |
| Content-type allow-list | Fetching a 200 MB binary or a JavaScript honeypot must be rejected before parsing. | SMALL | Allow `text/html`, `application/xhtml+xml`; reject everything else with a clear message. |

### Differentiators (Lem Reader's calm/accessibility positioning)

| Feature | Value Proposition | Complexity | Notes & Dependencies |
|---------|-------------------|------------|----------------------|
| Extraction-failure disclosure surfaced in the reader voice | v1.0's **DOC-06 + PAGE-09 fallback banner** already set the tone ("here's why we fell back"); v2.0 ingestion failures extend that vocabulary rather than introducing loud red error toasts that break the calm surface. | SMALL | Reuse the existing fallback-banner aria/live-region pattern. |
| Partial-extraction flag | When Readability returns content but is missing a detected section (e.g. images failed, footnote block detected but unparsed), surface a quiet "incomplete extraction" indicator + link to original — rather than presenting the partial article as complete. | MEDIUM | Most competitors silently ship partial content. Honest disclosure is a calm-reader differentiator. |
| Public-web-only honesty | Hard-refuse paywalled / login-gated / cookie-walled content with a clear "this page is not publicly fetchable" message + link to original. PROJECT.md Out-of-Scope already commits to this. | SMALL | Aligns with v1.0's *honest disclosure over silent success* value. |
| Stable article revision from ingestion moment | Because **DOC-04** already versions every article, ingested articles inherit the same revision contract: a re-extracted article would be a *new* revision, not a silent overwrite. | SMALL | Direct reuse of v1.0 substrate; only the ingestion event needs to mint the initial revision. |
| Anchor-preservation across re-extraction (deferred) | When the same URL is re-saved after content changes, attempt to migrate annotations forward using the existing **ANNO-07** tri-state resolver (confident/ambiguous/orphan) rather than silently dropping them. | LARGE | Natural v2.x extension of the v1.0 ANNO-07 contract. Defer from v2.0 initial scope; document the upgrade path. |

### Anti-Features (Avoid for Lem Reader)

| Feature | Why Requested | Why Problematic for Lem Reader | Alternative |
|---------|---------------|--------------------------------|-------------|
| Paywall / authenticated-content extraction | "I want to save my subscription articles." | v2.0 is explicitly public-web-only (PROJECT.md Out-of-Scope); introduces identity, cookies, ToS violations, and a server-side credential store — all of which break local-first and calm. | Surface honest "this page is not publicly fetchable" + link to original. Re-evaluate in v3 alongside accounts. |
| Server-side re-extraction on every open | "Always show the latest version of the article." | Silently breaks ANNO-05 anchor stability; turns a saved article into a live document; reintroduces extraction variability into a v1.0 contract that explicitly isolates the engine from extraction. | Save-once, read-forever (Readwise's model). Manual refresh = explicit delete + re-save with highlight-loss warning. |
| Browser-extension packaging in v2.0 | "Higher-fidelity extraction from the rendered DOM." | PROJECT.md defers extension packaging until the ingestion + library loop is proven in the web app first. Adds store policy, permissions, multi-browser build, and update distribution concerns. | Web-app URL ingestion first; extension as a v2.x or v3 path that *replaces* the server-side fetch with a higher-fidelity DOM handoff. |
| AI-assisted extraction fallback (LLM "read this page") | "Use ChatGPT to clean up bad extractions." | Adds cost, privacy, accuracy, and distraction risks (v1.0 Out-of-Scope); fundamentally conflicts with the calm/local-first positioning. | Honest disclosure of extraction limits. The reader always has the source URL. |
| Content-level de-duplication | "Don't let me save the same article twice with different utm parameters." | Readwise documents that they cannot do this either (URL-exact only). Building a content-hash de-duper is high-effort with marginal calm benefit. | URL-normalize before de-dup (strip known tracking params); surface "you saved this URL before" when an exact match exists. |

### Feature Dependencies

```
URL Ingestion ───requires───> v1.0 Canonical Document Model (DOC-05)
                  requires ──> v1.0 Article Revision Contract (DOC-04)
                  requires ──> v1.0 Zod Schema (STATE-04) for ingested-record validation
                  requires ──> NEW stateless ingestion backend (no v1.0 dependency)
                  enhances ──> v1.0 DOC-06 disclosure pattern (extends to ingestion failure)
                  enhances ──> v1.0 ANNO-07 tri-state (extends to extraction-vs-render drift)
```

---

## Feature Area 2 — Multi-format Document Intake (HTML / PDF / EPUB / Markdown)

**Reader expectations differ sharply by format.** The same library list must accommodate an HTML article, a 30-chapter EPUB book, a fixed-layout PDF, and a Markdown note — without pretending they are the same shape.

**The EPUB book-vs-article gap is the central design tension.** An EPUB is a multi-chapter *book* with its own spine order, hierarchical TOC, and per-chapter XHTML files — **it is NOT a single normalized article**. Treating an EPUB as "just another article in the library" would either flatten its structure (losing the TOC the reader expects) or force the canonical document model to grow a `Book` shape that v1.0 never had. PROJECT.md already flags this: *"EPUB's multi-chapter book shape and PDF extraction quality are the riskier pipelines and sequence after the URL+HTML path is proven."*

### Per-format reader expectations

| Format | What the reader expects | Complexity for Lem Reader | Sequencing |
|--------|-------------------------|---------------------------|------------|
| **HTML (file upload or already-saved page)** | Behaves like an extracted web article. Already in the v1.0 document model's sweet spot. | SMALL | Phase 1 (alongside URL ingestion — same normalization pipeline) |
| **Markdown** | Plain structured text (headings, paragraphs, lists, code, links, blockquotes). Filename becomes title; first web-hosted image becomes cover (Readwise's documented behavior, because Markdown carries no inherent metadata). | MEDIUM | Phase 1 or 2 (remark/unified pipeline; sanitize; map onto existing block kinds) |
| **EPUB** | A *book*: multi-chapter, hierarchical TOC, spine order, DRM-free only. Cover image, author/publisher/date from OPF metadata. Stable per-chapter reading position. | LARGE | Phase 2 or 3 (after URL+HTML+Markdown proven). Forces a decision: flatten-into-one-article vs. introduce a Book concept. |
| **PDF** | Either a fixed-layout page image (the source of truth, what the reader expects from a PDF) or a reflowed "text view" with the tradeoffs below. Title is unreliable. Underlying text is noisy. | LARGE | Phase 3 (latest, highest-risk). Honest disclosure required. |

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes & Dependencies |
|---------|--------------|------------|----------------------|
| Drag-drop + file-picker upload | Universal table-stakes gesture across every reader that accepts files. Readwise, Apple Books, Calibre all support it. | SMALL | Library screen drop target + Upload button. |
| Format detection from file | Readers expect the right pipeline to fire based on `.epub`, `.pdf`, `.md`, `.html` extension + MIME sniff. | SMALL | Map to the right intake pipeline by file type. |
| Per-format metadata extraction | EPUB has rich OPF metadata (title/creator/publisher/date/identifier); PDF metadata is *"often improperly set or not set at all by the PDF file creator"* (Readwise); Markdown has no inherent metadata. | MEDIUM | EPUB: parse OPF metadata block. PDF: extract PDF Info dictionary but expect noise. Markdown: filename → title, first image → cover. |
| Edit-metadata panel | Because PDF and Markdown metadata is unreliable, the reader must be able to fix title/author manually. Readwise ships Edit Metadata (Shift+M). | MEDIUM | New v2.0 surface; persists edits as a layer over the original metadata, never mutating the source file. Reuses STATE-04 versioned records. |
| DRM-free-only honesty | Readwise is explicit that DRM-locked Kindle/Apple/Kobo books cannot be imported. Lem Reader must surface a clear "DRM-protected EPUB cannot be added" message rather than silently failing. | SMALL | Detect Adobe ADEPT / Apple FairPlay / Readium LCP markers; refuse with explanation. Aligns with PROJECT.md public/DRM-free posture. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes & Dependencies |
|---------|-------------------|------------|----------------------|
| Two-mode EPUB reading (paginated + scrolling) at chapter granularity | v1.0's signature dual-mode parity extended to books. Most EPUB readers optimize one mode; equal-quality page and scroll is the calm-reader differentiator. | LARGE | Requires extending v1.0 mode switching (**PAGE-01**) from per-article to per-chapter. The reader's "logical passage" becomes chapter-relative. |
| EPUB chapter as the canonical navigation unit | Reuses **READ-05** ("quiet structural location") at chapter granularity. The library shows book progress by chapter, the TOC is the chapter list. | MEDIUM | Treats each EPUB as a small library-of-chapters sharing a Book record. Annotation anchors extend to (chapter, normalized offset). |
| Markdown front-matter support | Recognize YAML front-matter (`title:`, `author:`, `date:`) as a metadata source — cleaner than filename-derived metadata. | SMALL | Modest win for users with Markdown libraries (Obsidian/Standard Ebooks notes). |
| PDF "text view" reflow alongside original-page view | Readwise's "Enhanced text mode" pattern: default to the page image (what the reader expects from a PDF) with a one-tap toggle to a reflowed text version for typography/annotation flexibility. | LARGE | Two rendering paths for PDFs. Annotations made in one mode must remain visible in the Notebook panel even when they don't overlay the other mode (Readwise's documented behavior). |
| PDF snapshot highlight | Allow image-region highlight for figures/tables/equations that text selection cannot capture (Readwise's snapshot tool). | MEDIUM | Captures a cropped image + page rect as the annotation payload. Extends v1.0 annotation model with a non-text anchor kind. |

### Anti-Features (Avoid for Lem Reader)

| Feature | Why Requested | Why Problematic for Lem Reader | Alternative |
|---------|---------------|--------------------------------|-------------|
| Force-flatten EPUB into a single article | "So the library list stays uniform." | Destroys the TOC the reader expects from a book; breaks chapter-based reading progress; pretends EPUB is something it isn't. | Introduce a Book concept (or chapter-as-document collection). The library list already shows heterogeneous items in every competitor. |
| Mandatory PDF reflow | "So PDFs behave like articles." | Reflow quality is genuinely poor (random line breaks, lost figures, destroyed tables); readers expect PDFs to look like PDFs. Readwise keeps both modes for good reason. | Default to page-image view; offer reflow as a toggle. Disclose noise. |
| Scanned-PDF OCR | "So I can read anything." | OCR quality is its own research area; introduces a heavy new dependency (Tesseract/cloud OCR) and noisy text that breaks annotation anchors. Out of scope for v2.0. | Detect scanned PDFs (no text layer) and refuse with a "this PDF has no extractable text" message. Defer OCR to a later milestone. |
| EPUB CSS pass-through | "Render the book exactly as the publisher styled it." | Conflicts with **READ-02/03/04** typography controls and the calm-surface contract; publisher CSS frequently overrides reader preference. | Apply Lem Reader's typography layer; ignore publisher stylesheet. (Apple Books and Calibre both override by default.) |
| Multi-format export from intake | "Let me convert EPUB → Markdown on the way in." | Conflation of intake and export; doubles the pipeline surface. | Intake preserves the source format; export is a separate feature area. |

### Feature Dependencies

```
Multi-format Intake ───requires───> v1.0 Canonical Document Model (DOC-05)
                       requires ──> v1.0 Zod Schema (STATE-04) for per-format records
                       requires ──> Personal Library (Feature Area 3) — files need a home
                       enhances ──> v1.0 PAGE-01 mode switching (extended to per-chapter for EPUB)
                       conflicts─> v1.0 single-article-shape assumption (EPUB forces a Book concept)

EPUB intake ───requires───> EPUB parser (OPF + spine + nav.xhtml/NCX)
              requires ──> Decision: Book concept vs. flatten-to-article
              requires ──> Chapter-relative reading position (extends STATE-01)

PDF intake ───requires───> PDF text extraction (pdfjs-dist or unpdf)
              requires ──> Two rendering paths (page image + reflowed text)
              requires ──> Honest disclosure of extraction noise
```

---

## Feature Area 3 — Personal Library

**What "calm library" means for Lem Reader.** The library is *not* a Feedly/Instapaper-style high-throughput triage queue with feeds, recommendations, read/unread gamification, and dense dashboards. It is the **reading-room shelf**: a small, owned, locally-stored set of items the reader has chosen, organized by what they actually do (find, open, resume), not by what an algorithm pushes.

**The library replaces the v1.0 fixture list** — the six hardcoded articles become six rows in a real library, and the library is the surface where ingestion lands.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes & Dependencies |
|---------|--------------|------------|----------------------|
| List view of saved items | The defining library gesture. Every competitor has this. | SMALL | The v1.0 article picker becomes the library list. Sorted by saved-date-descending by default. |
| Open item into the reader | One tap/double-click from list to reading surface. | SMALL | Existing v1.0 reader mount path. |
| Delete item | Local ownership includes the right to remove. | SMALL | Cascade deletes highlights, notes, position (with confirmation). Reuses Dexie transactions. |
| Per-item metadata display | Title, source domain, byline (if known), saved date, content-type indicator (article / book / pdf / note). The minimum a reader needs to recognize an item. | MEDIUM | Reuses v1.0 DOC-03 metadata. Add an item-kind glyph. |
| Source link visible per item | Provenance on the list, not buried. | SMALL | Direct reuse of DOC-03 source URL display. |
| Recently-read shortcut | Resume what you were just reading. | SMALL | Sort/filter by last-opened-descending. |
| Reading-progress indicator per item | Quiet visual signal of how far through you are. | SMALL | A 0–100% bar or "page x of y" hint derived from STATE-01 location vs. article length. Must respect the v1.0 contract that **page number is not permanent identity** — show approximate progress, not a fixed page label. |
| Item count / empty state | Calm, honest empty state ("your library is empty — paste a URL or upload a file to begin"). | SMALL | Avoids the dense-dashboard feel. |
| Search | Find an item by title, author, or domain. | MEDIUM | See *search* sub-section below — title/metadata search is table stakes; full-text search is a differentiator. |

### Differentiators (Calm library, not power-reader triage)

| Feature | Value Proposition | Complexity | Notes & Dependencies |
|---------|-------------------|------------|----------------------|
| Tags as the default organization | Replaces folder/collection hierarchy with a flat tag set the reader actually maintains. Readwise, Hypothes.is, and Apple Books all converged here. PROJECT.md commits to this: *"Searchable list + tags as the default organization; folders/collections deferred."* | MEDIUM | Document tags apply to library items; highlight tags (Feature Area 5) are a separate namespace. Readwise is explicit that the two do **not** inherit — Lem Reader should follow the same rule to avoid surprise. |
| Title + metadata search (table stakes, restated) | Find any item by any visible metadata field. | MEDIUM | IndexedDB index over title/byline/siteName/tags/source-url. |
| Full-text search across article bodies | Find the article "where I read about X." Readwise markets this as a headline feature ("Blazingly fast full text search ... even offline"). | LARGE | Requires indexing the normalized text content of every ingested article. Dexie hooks + a search index (FlexSearch or hand-rolled). High value, but deferrable. |
| Reading-progress sort | "What am I in the middle of?" — surfaces half-read items at the top. | SMALL | Sort key = absolute distance from 50% progress, descending. |
| Quiet item count and library size | Calm alternative to dashboard analytics: "47 articles • ~12 MB" in a footer. | SMALL | One line in the library chrome. |
| Per-source-domain grouping (optional) | A reader who saves a lot from one site can filter "all aeon.co articles." | SMALL | A facet off the existing source-URL metadata. |
| Light-weight filtered views | Readwise's filtered-view query syntax is a power-user surface; Lem Reader's calm-library version is *saved quick-filters* (tag, format, progress) accessible via a single menu — not a query language. | MEDIUM | Save named filters; no AND/OR/paren syntax. Reduces cognitive load vs. the Readwise benchmark. |

### Anti-Features (Avoid for Lem Reader)

| Feature | Why Requested | Why Problematic for Lem Reader | Alternative |
|---------|---------------|--------------------------------|-------------|
| Folders / collections hierarchy | Familiar from file systems and Feedly. | Adds a navigation dimension the reader must maintain; breaks the flat, searchable shelf metaphor; competes with tags for the same cognitive job. PROJECT.md defers folders. | Flat tag set as the default; defer folders to v2.x if user demand emerges. |
| Read/unread triage gamification | "Make me feel productive." | Conflicts with calm positioning; turns reading into a queue-clearing chore; introduces FOMO surfacing that v1.0 explicitly rejected. | Quiet progress indicator. No streaks, no badges, no "you have N unread." |
| Recommendation / discovery feed | "Suggest articles I might like." | Out-of-scope per v1.0 (AI/recommendations explicitly excluded); introduces editorial-distraction and privacy concerns. | The library contains *only* what the reader chose. |
| RSS / auto-push Feed section | "Subscribe to my favorite sites." | Readwise splits Library vs. Feed because they have different dynamics (curated vs. pushed). v2.0 is about putting your own content in, not becoming a feed reader. PROJECT.md Out-of-Scope. | A library only. RSS/feed-ingestion deferred. |
| Dense dashboard (charts, analytics, "reading velocity") | Quantified-self appeal. | Adds cognitive load; conflicts with the calm value; competes for screen space with the article list. | Quiet per-item progress + library-size line. |
| Social sharing / public-link generation | "Share what I'm reading." | v2.0 is local-first; social features introduce identity, hosting, and privacy surface area. | Export (Feature Area 4) is the privacy-preserving alternative. |

### Search sub-section — table stakes vs. differentiator

| Search scope | Tier | Why |
|--------------|------|-----|
| Title search | **Table stakes** | Universal expectation; cheap to index. |
| Author / byline search | **Table stakes** | Same metadata is shown in the list. |
| Source-domain search | **Table stakes** | Same metadata is shown in the list. |
| Tag-based filtering | **Differentiator (weak)** | Cheap; tied to the tags-as-default-organization decision. |
| Full-text across article bodies | **Differentiator (strong)** | High value but high cost; deferred is fine. |

### Feature Dependencies

```
Personal Library ───requires───> v1.0 Article Picker (becomes list)
                   requires ──> v1.0 Dexie persistence (STATE-03/04)
                   requires ──> URL Ingestion (Feature Area 1) — fills the library
                   requires ──> Multi-format Intake (Feature Area 2) — fills the library
                   enhances ──> v1.0 DOC-03 source URL display (now per-item in list)
                   enhances ──> v1.0 STATE-01 location (now per-item progress indicator)
```

---

## Feature Area 4 — Versioned Export / Import (PORT-01 / PORT-02)

**Standard reader expectations.** A local-first reader without accounts needs a credible cross-device story. The widely-accepted pattern (Readwise, Wallabag, Obsidian, Calibre) is a *versioned whole-library bundle* that the reader can download, move to another machine, and import — with validation telling them what survived the trip.

**v2.0 PORT-01/02 contract (from PROJECT.md):** *"export library + highlights + notes + position + preferences as a versioned bundle; import with validation and conflict reporting."*

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes & Dependencies |
|---------|--------------|------------|----------------------|
| Whole-library export | The minimum portability promise: nothing is held hostage. | MEDIUM | Bundle articles + reading positions (**STATE-01**) + highlights/notes (**STATE-03/ANNO-06**) + preferences (**STATE-02**) into a single archive. |
| Versioned bundle schema | Future migrations must not silently corrupt imports. v1.0 **STATE-04** already versions records; the bundle wraps that with a top-level schema version. | SMALL | Top-level `{ schemaVersion, exportedAt, appVersion, records: { ... } }`. Reuse existing Zod schema. |
| Validation on import | A malformed or partial bundle must be rejected with a structured report, not partially imported. | MEDIUM | Zod-validate every record on import. Surface a pre-flight summary: "X articles, Y highlights, Z preferences — proceed?" |
| Conflict reporting on import into non-empty library | What happens when the imported article already exists (same stable identity)? Reader must choose: skip / overwrite / duplicate. | MEDIUM | Reuse **DOC-04 stable identity** as the join key. Default to skip with a clear "X items already present" report. |
| Round-trip integrity | Export then import on a fresh machine yields the same library, same highlights, same positions. | MEDIUM | Canonical-text offsets (**ANNO-06**) survive the trip; page numbers do not, and never appear in the bundle. |
| Per-article source URL in the bundle | Provenance travels with the article even when the original page is gone. | SMALL | Direct inclusion of DOC-03 source URL. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes & Dependencies |
|---------|-------------------|------------|----------------------|
| Per-article export (single item) | Send one article + its highlights to a friend or another device without dumping the whole library. | SMALL | Same format, scoped to one record. |
| Highlights-only export (Markdown/plain text) | The "take my notes to Obsidian/Notion/Anki" path. Readwise's headline differentiator. | MEDIUM | Markdown export with template variables (`title`, `author`, `source`, `highlights[]`, `notes[]`). Per-article AND per-tag (Feature Area 5) variants. |
| Preferences-only export | Move typography/theme/mode setup to a new machine without the library. | SMALL | Subset of the bundle schema. |
| Bundle signing (integrity check) | Detect tampered or truncated bundles. | SMALL | SHA-256 manifest of records; verify on import. |
| Conflict-resolution UI | Beyond the report, a per-record review screen for ambiguous conflicts. | MEDIUM | Defer the heavy merge UI; v2.0 ships the report + skip-by-default. |
| Merge semantics (rather than replace) | Two devices export, both import, library union rather than overwrite. | LARGE | Full merge is a sync surrogate and risks drift. Defer to v3 alongside accounts. |

### Anti-Features (Avoid for Lem Reader)

| Feature | Why Requested | Why Problematic for Lem Reader | Alternative |
|---------|---------------|--------------------------------|-------------|
| Cloud sync (real-time) | The "real" cross-device experience. | v2.0 explicitly defers accounts/cloud/sync (PROJECT.md Out-of-Scope). | Versioned export/import is the v2.0 cross-device story. |
| OPF / EPUB-fragment export | "Export my highlights back into the EPUB." | EPUB spec does not standardize annotation storage; round-tripping into a binary EPUB is fragile and outside the calm-reader job. | Markdown / plain-text highlights export. |
| Export to specific note-app formats (Anki, Roam, Logseq) | Direct integrations are convenient. | Each integration is its own template; scope-creeps into a template engine. | A general Markdown template with editable variables (Readwise's Jinja2 approach is the model). |
| Encrypted-bundle format | "Privacy for my highlights on disk." | Adds key-management burden; v2.0 is local-first (the storage is already private to the device). | Defer encryption to v3 alongside accounts/cloud. |

### Bundle format recommendation (informed by Readwise/Wallabag patterns)

```
lem-reader-bundle-v1.json   (or .zip with assets)
├── schemaVersion: 1
├── appVersion: "2.0.x"
├── exportedAt: ISO-8601
├── records:
│   ├── articles:       [ { id, revision, sourceUrl, title, byline, ... , normalizedDocument } ]
│   ├── positions:      [ { articleId, graphemeOffset } ]
│   ├── annotations:    [ { id, articleId, TextPositionSelector, TextQuoteSelector, note } ]
│   └── preferences:    { typography, theme, mode, ... }
└── manifest: { sha256 per record block }
```

**Why JSON, not OPF/CSV binary:** the v1.0 canonical document model is already JSON; the v1.0 Zod schema already validates it. Reusing the internal shape minimizes the schema-translation surface (and the migration risk) on both export and import.

### Feature Dependencies

```
Export/Import ───requires───> v1.0 STATE-04 versioned records
                requires ──> v1.0 ANNO-06 canonical-text selectors (NOT page numbers)
                requires ──> v1.0 DOC-04 stable identity (import-conflict join key)
                requires ──> v1.0 Zod schema (import validation)
                requires ──> Personal Library (Feature Area 3) — what's being exported
                enhances ──> Annotation Review Panel (Feature Area 5) — export-from-here
```

---

## Feature Area 5 — Annotation Review Panel (RECV-01)

**What RECV-01 asks for (from PROJECT.md):** *"a dedicated surface to review all highlights/notes (natural pair with the export/curation flow)."*

**The v1.0 annotation substrate is the dependency.** v1.0 already ships ANNO-01–07: highlight creation, notes, view/edit/delete, navigation back to passage, anchor stability, TextPositionSelector + TextQuoteSelector anchors, and the explicit tri-state (confident / ambiguous / orphan) resolution. The review panel is *the library view of the annotation substrate* — it sits above v1.0's per-article annotation drawer and offers a cross-article perspective.

**The two established review-panel patterns (from competitor research):**

1. **Per-document Notebook tab** (Readwise Reader's right-sidebar Notebook) — every highlight + note in the current document, with copy/export-from-here. This is the v1.0 annotation drawer elevated into a first-class surface.
2. **Cross-document highlights browse** (Readwise "Highlight Tags" page, Hypothes.is annotation list) — all highlights across the library, filterable by tag/article/date, with jump-to-location.

Lem Reader's RECV-01 should ship both, because the per-document surface is cheap (already 80% built) and the cross-document surface is the genuine curation win.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes & Dependencies |
|---------|--------------|------------|----------------------|
| List all highlights/notes (cross-article) | The defining gesture of an annotation review surface. Hypothes.is, Readwise, Apple Books all have it. | MEDIUM | Query all annotations from Dexie, group by article, render as a list. Reuses ANNO-06 anchor schema. |
| Jump to highlight location | One tap from review → reading surface at the highlighted passage. | SMALL | Reuses ANNO-04 "navigate from a saved annotation back to its logical passage." |
| Per-highlight metadata (parent article, date created, tag/note) | Recognize which article a highlight came from without leaving the panel. | SMALL | Direct from ANNO-06 record. |
| Edit highlight note in-place | Fix typo / expand a thought without leaving the review surface. | SMALL | Reuses ANNO-03 view/edit/delete. |
| Delete highlight from review | Remove a highlight that no longer serves. | SMALL | Reuses ANNO-03 + cascade rules. |
| Sort by date / by article / by position | Find what you're looking for. | SMALL | Three sort keys; default = date-descending. |
| Filter by article | "Just show me highlights from this book." | SMALL | Article facet. |
| Tri-state indicator for ambiguous/orphan annotations | v1.0's ANNO-07 contract must not be silently hidden in the review panel. Show a quiet badge and offer the existing repair path. | SMALL | Direct reuse of ANNO-07. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes & Dependencies |
|---------|-------------------|------------|----------------------|
| Filter by tag | The natural pair to tags-as-default-organization (Feature Area 3). Readwise's Highlight Tags page is the model. | SMALL | Filter query off annotation.tag. |
| Export-from-here | "Send me all highlights with this tag as Markdown." Pairs with Feature Area 4. | SMALL | Reuse the highlights-only export pipeline, scoped to the current filter. |
| Grouped-by-article table of contents | A two-level TOC: article → its highlights. Readwise ships this on their tag-filtered view. | SMALL | Improves scannability over a flat list. |
| Keyboard-first navigation between highlights | Up/down-arrow through highlights with the focused one's parent article shown in a sidebar. Readwise's signature keyboard-based reading extended to the review surface. | MEDIUM | Aligns with v1.0 A11Y-01/02 keyboard contract. |
| Re-anchor ambiguous annotation from the panel | Direct link from a tri-state badge into the v1.0 ANNO-07 repair flow (RECV-02, deferred). v2.0 ships the indicator + a "show in context" jump; the explicit re-anchor UI is RECV-02. | MEDIUM | RECV-02 is deferred per PROJECT.md, but the panel must surface the state honestly now. |

### Anti-Features (Avoid for Lem Reader)

| Feature | Why Requested | Why Problematic for Lem Reader | Alternative |
|---------|---------------|--------------------------------|-------------|
| Spaced-repetition resurfacing ("Daily Review") | Readwise's headline feature. | Gamifies reading; introduces notifications and daily-prompt surface; conflicts with calm positioning. | Reader chooses when to review. Export to a spaced-repetition app (Anki) is the user's choice, via Feature Area 4 highlights export. |
| Social annotation / public sharing of highlights | "Share my notes with my group." | v2.0 is local-first; social features introduce identity, hosting, moderation. | Export-to-Markdown is the share surrogate. |
| Multi-color highlights | "Color-code my system." | Readwise deliberately ships one color and recommends tags instead — colors are a visual affordance, tags are semantic and accessible to screen readers (A11Y). | Tags. (Also: forced-colors / high-contrast users cannot rely on color.) |
| AI summarization of highlights | "Generate a summary from my highlights." | v1.0 Out-of-Scope (AI summaries); cost/privacy/accuracy/distraction. | Export raw highlights; user chooses whether and how to summarize elsewhere. |

### Feature Dependencies

```
Annotation Review Panel ───requires───> v1.0 Annotation substrate (ANNO-01..07)
                        requires ──> Personal Library (Feature Area 3) — article facet
                        enhances ──> v1.0 ANNO-04 navigation (now bidirectional: panel ↔ passage)
                        enhances ──> Export/Import (Feature Area 4) — export-from-here
                        enables ──> RECV-02 deferred repair UI (surfaces the state now)
```

---

## Feature Area 6 — Polish Fixes (Context Only)

**Not a feature-research area per the brief.** Two polish items are in scope for v2.0; this section captures only the standard-reader-behavior context the implementation step will need.

### 6a. Initial-load reading-mode flash (FOUC)

**What goes wrong:** the SPA mounts, briefly renders in the default reading mode, then swaps to the persisted mode on hydration — producing a visible flash for readers who chose a non-default mode.

**How other readers handle it:**
- **Inline bootstrap script** reads `localStorage` *before* React mounts and sets the mode attribute on `<html>` or the reader container so the first paint is already correct.
- **Readwise / Apple Books / Kindle Cloud** all use a pre-paint preference read; the reader never sees a flash.
- **v1.0 substrate note:** STATE-02 already persists the preferred reading mode; the bug is that the mode is applied post-hydration rather than pre-paint. The fix is a small inline script in `index.html` that reads the same key STATE-02 will read later.

**Complexity:** SMALL. **Risk:** LOW. No external research dependency.

### 6b. Short-article progress-bar semantics

**What goes wrong:** a 1-page article shows 100% the moment it opens; a 2-page article starts at 50%. Both feel wrong because progress implies remaining work, and there is none (or almost none).

**How other readers handle it:**
- **Apple Books** shows position ("Location 1 of 1") rather than a percentage for very short works, switching to percentage only when the work has meaningful length.
- **Kindle** shows "Page 1 of 1" / time-remaining-in-chapter rather than a percentage for short pieces.
- **Readwise Reader** shows page count and reading-time estimates (minutes) rather than a flat percentage for short documents.
- The shared pattern: **progress display must adapt to document length** — short works use ordinal/positional language; long works use percentage or time.

**Recommended semantics for Lem Reader (calm positioning):**
- 1-page article → show position ("Page 1 of 1" or just the section context), not 100%.
- 2-page article → show "Page 1 of 2" / "Page 2 of 2", not 50% / 100%.
- Longer articles → percentage or page-x-of-y may coexist, but never display "100%" until the reader has actually advanced to the final page (i.e., progress is *positional*, not *proportional*, at short lengths).
- Honors v1.0 **READ-05** contract: progress display "does not treat responsive page number as permanent identity."

**Complexity:** SMALL. **Risk:** LOW. Pure UI logic; no external research dependency.

---

## Feature Dependencies (Cross-Area Map)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     v1.0 SHIPPED SUBSTRATE                          │
│  DOC-01..06 · READ-01..05 · A11Y-01..08 · PAGE-01..09              │
│  ANNO-01..07 · STATE-01..05 · ACPT-01..04                          │
└─────────────┬───────────────────────────────────────────────────────┘
              │
              │ depends on
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  v2.0 NEW FEATURE AREAS                                             │
│                                                                     │
│   [1] URL Ingestion ──────┐                                         │
│                            ├──> [3] Personal Library                │
│   [2] Multi-format Intake ─┘             │                          │
│                                           │                          │
│                                           ├──> [5] Annotation Review │
│                                           │      Panel               │
│                                           │                          │
│                                           └──> [4] Export / Import   │
│                                                                     │
│   [6] Polish Fixes (FOUC, progress-bar) — independent of 1–5        │
└─────────────────────────────────────────────────────────────────────┘
```

### Critical dependency notes

- **Library (3) requires both ingestion surfaces (1 + 2).** A library with no way to fill it is not a library. The fixture corpus is the v1.0 seed so the library is non-empty during development.
- **Export/Import (4) requires the Library (3).** It exports what the library holds.
- **Annotation Review Panel (5) requires the v1.0 Annotation substrate AND the Library (3).** It is the cross-article view; without articles it is just the v1.0 drawer.
- **EPUB intake forces a Book-concept decision** that may ripple into the Library (3) and Export/Import (4) schemas. Sequence EPUB *after* URL+HTML+Markdown so the document model decision is informed by working pipelines, not pre-emptive.
- **Polish (6) is independent** — both fixes are local UI changes that can land in any phase.

---

## MVP Definition

### v2.0 Launch With (Phase ordering recommendation)

Minimum viable personal-library milestone. Each item is essential to deliver the v2.0 promise ("put your own content in, take your highlights out"):

- [ ] **URL ingestion (1)** with honest failure disclosure — the defining v2.0 gesture.
- [ ] **HTML + Markdown intake (2)** — the cheap, high-confidence intake paths that share the URL normalization pipeline.
- [ ] **Personal library (3)** — list, open, delete, per-item metadata, source link, recently-read, title/metadata search. Tags included (default organization).
- [ ] **Annotation review panel (5)** — cross-article list, jump-to-location, edit/delete, filter by article/tag. (RECV-01.)
- [ ] **Versioned export/import (4)** — whole-library bundle + Markdown highlights export. (PORT-01/02.)
- [ ] **Polish (6a + 6b)** — initial-load mode flash; short-article progress semantics.
- [ ] **NVDA + Firefox acceptance run** — v1.0 ACPT-02 boundary A4 follow-up.

### Add After Validation (v2.x)

Sequence once v2.0 is in readers' hands:

- [ ] **EPUB intake (2)** — triggers the Book-concept decision; sequences after URL+HTML+Markdown proven.
- [ ] **PDF intake (2)** — riskiest pipeline; sequences after EPUB. Honest disclosure of PDF text noise required.
- [ ] **Full-text search (3)** — high-value but high-cost; deferred from v2.0 launch.
- [ ] **RECV-02 explicit anchor repair** — surfacing the tri-state in the panel (5) is v2.0; the repair UI is v2.x.
- [ ] **Per-article export (4)** — small win once the bundle pipeline exists.
- [ ] **Anchor preservation across re-extraction (1)** — natural ANNO-07 extension when articles change.

### Future Consideration (v3+)

- [ ] **Accounts, cloud sync, encrypted cross-device persistence** — explicitly deferred; v2.0 ships portability instead.
- [ ] **Browser-extension packaging** — higher-fidelity DOM extraction once the web-app loop is proven.
- [ ] **Paywalled / authenticated content** — requires identity.
- [ ] **RSS / Feed auto-push section** — different product dynamic.
- [ ] **Orientation aids (ORNT-01/02), presentation presets (PRES-01)** — deferred v2 candidates per PROJECT.md.
- [ ] **Read-aloud, AI, recommendations** — carried Out-of-Scope from v1.0.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| URL ingestion + honest failure | HIGH | HIGH | P1 | 7 |
| HTML intake | MEDIUM | LOW (shares URL pipeline) | P1 | 7 |
| Markdown intake | MEDIUM | MEDIUM | P1 | 7 |
| Personal library (list/open/delete/metadata/search) | HIGH | MEDIUM | P1 | 8 |
| Tags (default organization) | MEDIUM | MEDIUM | P1 | 8 |
| Annotation review panel (cross-article) | HIGH | MEDIUM | P1 | 9 |
| Versioned whole-library export | HIGH | MEDIUM | P1 | 10 |
| Import with validation + conflict report | HIGH | MEDIUM | P1 | 10 |
| Markdown highlights export | MEDIUM | MEDIUM | P1 | 10 |
| Reading-progress indicator per item | MEDIUM | LOW | P1 | 8 |
| Recently-read shortcut | LOW | LOW | P1 | 8 |
| Edit-metadata panel | MEDIUM | MEDIUM | P1 | 8 |
| Initial-load mode-flash fix | MEDIUM | LOW | P1 | 7 (early) |
| Short-article progress-bar fix | MEDIUM | LOW | P1 | 7 (early) |
| NVDA+Firefox acceptance run | MEDIUM | MEDIUM | P1 | 11 |
| EPUB intake + Book concept | HIGH | HIGH | P2 | v2.x |
| PDF intake (text + page views) | MEDIUM | HIGH | P2 | v2.x |
| Full-text search across articles | HIGH | HIGH | P2 | v2.x |
| Per-article export | LOW | LOW | P2 | v2.x |
| Tag-filtered highlights export-from-here | MEDIUM | LOW | P2 | v2.x |
| Anchor preservation across re-extraction | MEDIUM | HIGH | P3 | v3 |
| Filtered views (saved quick-filters) | LOW | MEDIUM | P3 | v3 |
| Bundle signing | LOW | LOW | P3 | v3 |

**Priority key:**
- **P1** — Must have for v2.0 launch.
- **P2** — Should have; add in v2.x once v2.0 is validated in readers' hands.
- **P3** — Nice to have; future consideration.

---

## Competitor Feature Analysis

| Feature | Readwise Reader | Pocket (sunset 2025) | Instapaper | Wallabag | Apple Books | Hypothes.is | **Lem Reader v2.0 approach** |
|---------|-----------------|----------------------|------------|----------|-------------|-------------|------------------------------|
| Paste-URL save | Yes | Yes | Yes | Yes | No | No | **Yes (stateless backend, public-web-only)** |
| Browser extension | Yes | Yes | Yes | Yes (wallabagger) | No | Yes | **Deferred to v2.x** |
| Honest extraction-failure disclosure | Quiet (Report parsing issue) | None | None | None | N/A | N/A | **First-class (DOC-06 spirit extended to ingestion)** |
| Multi-format intake | PDF/EPUB/MD/OPML/RSS/email/tweet/video/podcast | URLs only | URLs only | URLs only | EPUB/PDF | PDF + web | **HTML/MD/PDF/EPUB, sequenced by risk** |
| Library organization | Library + Feed, tags, filtered views (query language) | List + tags | List + folders | List + tags | Library + collections | By URL/group | **Flat library + tags; no Feed, no query language** |
| Full-text search | Yes (headline feature) | Yes | No | Yes | Yes | Yes | **Title/metadata at launch; full-text in v2.x** |
| Reading-progress per item | Yes | Yes | Yes | Yes | Yes | N/A | **Yes (positional for short works)** |
| Annotation review panel | Notebook tab + Highlight Tags page | Highlights list | Highlights list | Annotations export | Notes panel | Annotation list (signature) | **Cross-article panel with tri-state indicator** |
| Export formats | CSV/OPML/ZIP/Markdown/Jinja2 | CSV/HTML | CSV/HTML | JSON/CSV/EPUB/PDF/MHTML | PDF | JSON/HTML | **Versioned JSON bundle + Markdown highlights** |
| Sync | Cloud (account) | Cloud | Cloud | Self-host | iCloud | Cloud | **Local-first; versioned export/import** |
| AI features | Ghostreader (chat/summary/TTS) | No | No | No | Limited | No | **None (Out-of-Scope)** |
| Calm/accessibility posture | Power-reader, keyboard-first | Triage-queue | Triage-queue | Utility | Booklike | Annotation-first | **Calm + accessible + booklike (v1.0 positioning preserved)** |

---

## Sources

### Competitor / category documentation (HIGH confidence)

- **Mozilla Readability.js** — official README and `index.d.ts` type definitions (2026-08-10): `parse()` return shape, `isProbablyReaderable()` documented false-positive/false-negative behavior, `charThreshold` default, security recommendation to use DOMPurify + CSP, jsdom usage with URL option for relative-URL absolutization, scripts/remote-fetch disabled.
  - https://github.com/mozilla/readability
- **Readwise Reader — marketing page** (readwise.io/reader): multi-format intake (web/RSS/PDF/EPUB/Markdown/newsletter/YouTube/Twitter/podcast), library + feed split, full-text search, keyboard-based reading, export promise ("download every document as a CSV, your feeds as an OPML, your uploaded files as a zip, and every highlight and annotation as Markdown"), Pocket/Instapaper import, DRM-EPUB admission.
  - https://readwise.io/reader
- **Readwise Reader — Adding Content FAQ** (docs.readwise.io/reader/docs/faqs/adding-new-content): URL-save format (`https://wise.readwise.io/save?url=`), browser-extension vs. naked-URL fidelity gap, drag-drop upload of PDF/EPUB/Markdown/OPML, Markdown metadata derivation (filename → title, first image → cover, Edit Metadata panel), Kindle/Apple/Kobo DRM admission.
- **Readwise Reader — Highlights, Tags, Notes FAQ**: keyboard annotation, auto-highlighting, document tags vs. highlight tags with explicit "no inheritance," Notebook tab (per-document annotation panel), Manage Tags page (cross-document highlight browse), highlight-position-mismatch honest disclosure ("notify you that it failed to match ... still visible in the Notebook tab"), single highlight color (tags recommended instead).
- **Readwise Reader — Filtering Syntax Guide**: filtered-view query parameters (`tag`, `domain`, `category`, `location`, `has`, `progress`, `highlights`, `words`, `minutes`, `saved`, `published`, `last_opened`) with `__gt/__lt/__before/__after/__contains` operators — power-user surface Lem Reader explicitly does not replicate at v2.0.
- **Readwise Reader — Exporting FAQ**: per-document Notebook export (copy clipboard / Markdown download / Jinja2 template with `url/tags/title/author/summary/category/image_url/site_name/document_note/highlights`), per-tag highlight export, Library CSV, OPML feeds, Full-content ZIP, Print with annotations, Send to Kindle.
- **Readwise Reader — Parsing FAQ**: "we'll never be able to parse 100% of the internet 100% perfectly" honesty, browser-extension-as-exception-handler pattern, Report-document-parsing-issue feedback channel, immutability ("Reader will never try to re-parse previously saved content"), URL-exact de-dup only.
- **Readwise Reader — PDFs FAQ**: PDF metadata unreliability ("often improperly set or not set at all"), text-line-break glitch admission, cross-page highlight impossibility without reflow, PDF-view vs. Text-view mode split, dark-mode color-inversion distortion, snapshot tool for figure highlights, auto-highlighting unavailable in PDF view.
- **Wallabag** — README (github.com/wallabag/wallabag): self-hostable read-it-later, content extraction via Graby + php-readability + ftr-site-config, MIT license, doc.wallabag.org — establishes that the open-source read-it-later category is mature and that extraction libraries are interchangeable substrate.
- **Hypothes.is — Help** (web.hypothes.is/help): annotation-list-as-product pattern, group/private/public annotation split, PDF annotation emphasis, LMS integration — establishes the cross-document annotation-review surface category.

### Standards reference (HIGH confidence)

- **EPUB — Wikipedia** (en.wikipedia.org/wiki/EPUB): ZIP container structure, OPF four child elements (metadata/manifest/spine/guide), NCX vs. nav.xhtml navigation, required mimetype file, DRM-optional/DRM-unspecified status, EPUB 3.3 (May 2023) current spec, MathML/fixed-layout additions, security/privacy cautions — informs the Book-vs-Article design tension and the DRM-free-only intake posture.

### Project context (HIGH confidence — internal artifacts)

- `.planning/PROJECT.md` — v2.0 milestone scope, Out-of-Scope commitments (no accounts/cloud/sync/extension/paywall in v2.0), ORNT/RECV/PORT/PRES candidate definitions.
- `.planning/milestones/v1.0-REQUIREMENTS.md` — shipped v1.0 requirement definitions, used to identify substrate dependencies (DOC-03/04/05/06, ANNO-04/05/06/07, STATE-01/02/03/04/05, READ-02/03/04/05, PAGE-01/09, A11Y-01/02).
- `.planning/research/FEATURES.md` (v1.0) — existing table-stakes/differentiator/anti-feature analysis for the reading engine; not re-researched here.

### Reasoning basis for product judgment (MEDIUM confidence)

- Calm/library scoping recommendations (flat tags vs. folders, no triage gamification, no AI features, no RSS feed section, no spaced-repetition) are grounded in PROJECT.md's "calm, booklike, accessibility-first" positioning and the v1.0 anti-features list, not in user studies. Re-validate after v2.0 ships.

---
*Feature research for: Lem Reader v2.0 Personal Library (URL ingestion, multi-format intake, library, export/import, annotation review panel, polish).*
*Researched: 2026-08-10.*
