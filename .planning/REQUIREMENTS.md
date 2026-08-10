# Requirements: Lem Reader

**Defined:** 2026-08-10
**Core Value:** Readers can move through long-form web content with calm, stable orientation and predictable navigation.

## v2.0 Requirements — Personal Library

Requirements for the v2.0 milestone. Each maps to a roadmap phase (traceability filled during roadmap creation).

### Ingestion

- [ ] **ING-01**: Reader can add an article by entering a URL; the reader fetches, extracts, and normalizes the page into the canonical document model.
- [ ] **ING-02**: Reader can add an article by pasting or uploading HTML, normalized through the same pipeline.
- [ ] **ING-03**: Reader can add an article by uploading a Markdown document, normalized into the canonical document model.
- [ ] **ING-04**: Reader can add a document by uploading a PDF; text is extracted and normalized, with honest failure when a PDF is scanned/image-only or unrecoverably multi-column.
- [ ] **ING-05**: Reader can add a book by uploading an EPUB, surfaced as per-chapter articles under a book grouping (EPUB-as-Book, Option A — one article per chapter + thin Book record, preserving every v1.0 substrate contract).
- [ ] **ING-06**: Reader is shown an honest "couldn't read this" state (reusing the DOC-06 disclosure spirit) when extraction cannot reliably produce content — no silent garbage; a derived multi-signal confidence replaces Readability's absent score.
- [ ] **ING-07**: Ingested content is sanitized and rendered through the canonical document model, so a malicious page cannot execute scripts or inject hostile markup (the doc model is the security boundary; sanitize once at ingest, never `dangerouslySetInnerHTML`).
- [ ] **ING-08**: The ingestion service refuses private, internal, and cloud-metadata endpoints and caps redirects, so the reader cannot be abused to probe internal networks (SSRF — OWASP Case 2).

### Library

- [ ] **LIB-01**: Reader can browse their ingested articles in a personal library that replaces the flat fixture list.
- [ ] **LIB-02**: Reader can open, read, and remove any article in their library.
- [ ] **LIB-03**: Reader can search their library by title and metadata.
- [ ] **LIB-04**: Reader can tag articles and filter the library by tag (flat tags as default organization; no folder hierarchy).
- [ ] **LIB-05**: Reader sees ingestion metadata (source URL, fetch date) and can reach the original source.
- [ ] **LIB-06**: Reader sees recently-read and reading-progress indicators across the library.

### Portability

- [ ] **PORT-01**: Reader can export their library + highlights + notes + reading positions + preferences as a versioned bundle.
- [ ] **PORT-02**: Reader can import a compatible bundle with validation and conflict reporting.
- [ ] **PORT-03**: Reader can export just their highlights (e.g., as Markdown) for use outside the reader.

### Annotation Recovery

- [ ] **RECV-01**: Reader can open a dedicated panel to review all highlights and notes across the library, with jump-to-location, filter/sort, and honest tri-state (confident/ambiguous/orphan) surfacing.

### Polish

- [ ] **POLISH-01**: Reader sees the persisted reading mode on first paint with no flash or snap to a different mode.
- [ ] **POLISH-02**: Reader sees progress-bar semantics that reflect actual position (a one-page article does not show 100% on open; a multi-page article progresses from the start).

### Acceptance

- [ ] **ACPT-05**: Reader can complete the documented screen-reader acceptance flows on NVDA+Firefox, closing the v1.0 ACPT-02 reduced-gate coverage boundary (A4).
- [ ] **ACPT-06**: Reader can complete the v2.0 core flow (ingest → read → highlight → export → re-import) across the supported browser matrix (Chromium/Firefox/WebKit) without content loss.

## v1.0 Validated Requirements

All 44 v1.0 requirements (DOC/READ/A11Y/PAGE/ANNO/STATE/ACPT-01..04) shipped and verified — see `.planning/milestones/v1.0-REQUIREMENTS.md` for the full validated traceability. These are the locked substrate v2.0 builds on and must not regress.

## Future Requirements

Deferred to v2.x or later — tracked but not in the v2.0 roadmap.

### Orientation

- **ORNT-01**: Reader can open a heading and section navigator and jump to a structural location.
- **ORNT-02**: Reader can enable an optional line-focus aid in either reading mode.

### Annotation Recovery (extended)

- **RECV-02**: Reader can repair an ambiguous or orphaned annotation anchor explicitly.

### Presentation

- **PRES-01**: Reader can choose evidence-informed calm presentation presets in addition to individual controls.

### Library (extended)

- Full-text search across article bodies (FlexSearch vs. hand-rolled IndexedDB index — implementation decision for that phase).
- Folders/collections hierarchy.
- Per-article export.

### Product (post-portability)

- Accounts, authentication, and encrypted cross-device cloud sync (deferred per export/import-first; re-opens once the library + portability loop is proven).
- Browser-extension packaging (deferred until ingestion + library loop is proven in the web app first).

## Out of Scope

Explicitly excluded from v2.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Authenticated, paywalled, or login-gated content ingestion | URL ingestion targets publicly fetchable pages; login/paywall content raises CORS, permissions, and ToS issues. |
| Accounts, cloud sync, and encrypted cross-device persistence | Deferred to a later milestone; v2.0 delivers cross-device highlights via versioned export/import instead. |
| Browser-extension packaging | Deferred until the ingestion + library loop is proven in the web app first. |
| Live webpage extraction claims of 100% reliability | Extraction quality varies across the web; v2.0 ships honest three-state failure (confident/low-confidence/unsupported) rather than silent garbage. |
| Full-web compatibility (tables, math, interactive embeds, application UI) | The reader targets rich long-form articles (carried from v1.0). |
| Required page-turn animation | Cannot compromise speed, interruption, or reduced-motion preferences (carried from v1.0). |
| AI summaries, chat, recommendations, read-aloud, RSS/newsletter ingestion | Each introduces separate concerns (privacy, accuracy, cost, distraction, format pipelines) outside the bring-your-own-library hypothesis. |
| Formal proof of improved preference/comprehension/completion | Comparative user-value validation follows after the product loop is trustworthy (carried from v1.0). |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| _(filled by roadmapper)_ | | |

**Coverage:**
- v2.0 requirements: 22 total
- Mapped to phases: 0 _(pending roadmap)_
- Unmapped: 22 ⚠️ _(resolved when roadmap is created)_

---
*Requirements defined: 2026-08-10*
*Last updated: 2026-08-10 after v2.0 milestone definition*
