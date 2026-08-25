# Requirements: Lem Reader

**Defined:** 2026-08-23
**Milestone:** v2.1 Reader Experience
**Core Value:** Readers can move through long-form web content with calm, stable orientation and predictable navigation.

## v2.1 Requirements

### Application Navigation

- [ ] **NAV-01**: Reader can navigate directly among first-class Library and Highlights destinations through a consistent application shell.
- [ ] **NAV-02**: Reader can use the Lem Reader brand as a predictable link back to the Library.
- [ ] **NAV-03**: Reader can return from an article or highlight review to the prior Library context without losing active filters or scroll position.
- [x] **NAV-04**: Each destination exposes a coherent page title, heading hierarchy, landmarks, browser-history behavior, and route-change focus policy.
- [ ] **NAV-05**: Reading-only controls appear in reader context while globally meaningful preferences remain intentionally accessible outside an article.

### Library Organization

- [x] **LIB-07**: Reader can switch among All, Unread, In Progress, and Finished library views derived from one documented progress policy.
- [x] **LIB-08**: Reader can see accurate counts, progress, and empty states for each derived library view, including EPUB book-level aggregation.
- [ ] **LIB-09**: Reader can search and filter by tag within the selected library view without contradictory results or reading states.
- [ ] **LIB-10**: Reader sees a calm Continue Reading treatment that complements rather than duplicates or displaces the main library organization.

### Add Workflow

- [ ] **ADD-01**: Reader can open Add to Library as a focused workflow instead of encountering all ingestion controls permanently on the Library page.
- [ ] **ADD-02**: Reader can choose among every existing ingestion source and sees only the inputs relevant to that source.
- [ ] **ADD-03**: Reader can cancel, retry, or recover from ingestion failures without losing useful input, receiving duplicate submissions, or losing the existing honest refusal reason.
- [ ] **ADD-04**: The focused Add workflow manages keyboard focus, dismissal, and post-success navigation predictably at narrow widths and high zoom.

### Editable Metadata

- [ ] **META-01**: Reader can edit a saved article's display title and author as reader-owned metadata without changing canonical article identity, provenance, revision, reading position, or annotations.
- [ ] **META-02**: Edited title and author appear consistently in the Library, Reader, Highlights, search, and exported presentation surfaces.
- [ ] **META-03**: Reader can clear an override to restore the canonical extracted value, including when the canonical author is absent.
- [ ] **META-04**: Metadata overrides migrate safely, cascade on article removal, and round-trip through versioned export/import with explicit conflict reporting.

### Reader Orientation

- [ ] **ORNT-01**: Reader can open a labeled table of contents derived from the canonical article heading hierarchy and jump to a structural location.
- [ ] **ORNT-03**: Table-of-contents destinations use stable canonical locations and work equivalently in scrolling and paginated reading modes without persisting page numbers or rendered DOM identity.
- [ ] **ORNT-04**: The table of contents preserves source heading levels, tolerates skipped levels and duplicate headings, and exposes semantic list/link navigation to keyboard and screen-reader users.
- [ ] **ORNT-05**: The table of contents adapts to narrow widths and high zoom without obscuring content, trapping focus, or changing the reader's logical location merely by opening or closing.
- [ ] **ORNT-06**: Reopening an article communicates the restored location through a non-intrusive cue that does not shift content, block page turns, or require dismissal.

### Cross-Block Annotations

- [ ] **ANNO-08**: Reader can create one highlight from a native selection spanning multiple supported semantic text blocks that are present in the mounted reading surface.
- [ ] **ANNO-09**: A cross-block highlight persists as one article-global half-open grapheme range with one identity and optional note, while rendering as the required block-local fragments.
- [ ] **ANNO-10**: Cross-block highlights remain attached to the same text across repagination, mode changes, typography changes, reopening, export/import, and review-to-reader navigation.
- [ ] **ANNO-11**: Reader can review, edit the note for, export, and delete a cross-block highlight atomically without leaving partial fragments or silently guessing at an unresolved anchor.
- [ ] **ANNO-12**: Unsupported selection boundaries are rejected or narrowed with an explicit explanation according to a tested eligibility matrix for paragraphs, headings, lists, quotations, code, captions, footnotes, and non-text gaps.

### Image and Caption Fidelity

- [ ] **IMG-01**: URL and supported document ingestion preserve meaningful source figures, alternative text, and captions in the canonical sanitized document model when they can be recovered reliably.
- [ ] **IMG-02**: Lem Reader fetches secondary image assets through controlled SSRF-safe handling with redirect, address, media-type, byte, pixel, count, animation, and decode limits determined from a representative corpus.
- [ ] **IMG-03**: Saved articles never need to contact third-party image hosts when reopened; supported images are stored as controlled local assets with explicit lifecycle and deletion behavior.
- [ ] **IMG-04**: Controlled image assets round-trip through versioned library export/import with validation, conflict handling, bundle limits, and no broken record references.
- [ ] **IMG-05**: Figures render semantically with stable intrinsic geometry and calm broken/unsupported fallbacks in both reading modes.
- [ ] **IMG-06**: Image loading, decoding, failure, and size changes cannot silently clip, duplicate, omit, reorder, or indefinitely destabilize paginated content; the reader preserves its canonical location during required repagination.

### Interface Refinement

- [ ] **POLISH-07**: Library, Highlights, Add, and Reader surfaces share consistent gutters, headers, spacing, control hierarchy, responsive behavior, and visible focus treatment.
- [ ] **POLISH-08**: The tag menu opens adjacent to its invoking control, remains within the viewport, follows the trigger as geometry changes, and restores focus predictably when closed.
- [ ] **POLISH-09**: The reading-width control can reach its displayed 64-character maximum at the slider's far-right endpoint and exposes the same truthful range programmatically.
- [ ] **POLISH-10**: The Highlights destination presents review content within the shared layout grid and provides direct, understandable navigation back to the Library and into article context.
- [ ] **POLISH-11**: An Impeccable-informed visual and interaction audit resolves milestone-scope anti-patterns without replacing native semantics or weakening reduced-motion, forced-colors, zoom, or screen-reader behavior.

### Acceptance

- [ ] **ACPT-07**: Reader can complete the v2.1 core flow—organize library, add content, edit metadata, navigate by table of contents, create a cross-block highlight, review it, and export/import controlled images—across Chromium, Firefox, and WebKit without data or content loss.
- [ ] **ACPT-08**: Library, Highlights, Add, and Reader flows pass the documented keyboard, NVDA+Firefox, VoiceOver+Safari, reduced-motion, forced-colors, 320 CSS-pixel reflow, and 400% zoom acceptance matrix with no blocker or major finding.

## Future Requirements

### Reading Methodologies

- **PRES-01**: Reader can choose evidence-informed calm presentation presets in addition to individual controls.
- **FOCUS-01**: Reader can opt into experimentally validated focus methodologies such as bionic emphasis or RSVP/Spritz-style presentation without changing canonical content.
- **ORNT-02**: Reader can enable an optional line-focus aid in either reading mode.

### Annotation Recovery and Extension

- **RECV-02**: Reader can repair an ambiguous or orphaned annotation anchor explicitly.
- **ANNO-13**: Reader can deliberately extend a highlight across unmounted paginated pages through a non-native selection interaction.
- **ANNO-14**: Reader can create a disjoint highlight composed of multiple non-contiguous passages.

### Library Expansion

- **LIB-11**: Reader can manually override derived reading state when the progress policy does not match their intent.
- **LIB-12**: Reader can create saved views, folders, or collections beyond flat tags and core reading states.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Live third-party image hotlinking on article reopen | Leaks reader activity, breaks offline and export portability, and allows remote geometry/content changes to destabilize pagination. |
| Tables, math, interactive embeds, and irregular application layouts | Lem Reader continues to target rich long-form publishing rather than full-web compatibility. |
| Authenticated or paywalled URL ingestion | Requires browser-session access, permissions, and policy work beyond this milestone's public-source pipeline. |
| Accounts and cloud sync | Versioned local export/import remains the cross-device model. |
| AI summaries, recommendations, RSS/newsletter ingestion, read-aloud, streaks, and gamification | Outside the reader-experience refinement goal. |
| New router, component suite, annotation framework, or image-rendering framework | Research found the existing stack and browser primitives sufficient; these additions would increase migration and accessibility risk without solving the domain work. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAV-01 | Phase 15 | Pending |
| NAV-02 | Phase 15 | Pending |
| NAV-03 | Phase 15 | Pending |
| NAV-04 | Phase 14 | Complete |
| NAV-05 | Phase 15 | Pending |
| LIB-07 | Phase 14 | Complete |
| LIB-08 | Phase 14 | Complete |
| LIB-09 | Phase 16 | Pending |
| LIB-10 | Phase 16 | Pending |
| ADD-01 | Phase 16 | Pending |
| ADD-02 | Phase 16 | Pending |
| ADD-03 | Phase 16 | Pending |
| ADD-04 | Phase 16 | Pending |
| META-01 | Phase 17 | Pending |
| META-02 | Phase 17 | Pending |
| META-03 | Phase 17 | Pending |
| META-04 | Phase 17 | Pending |
| ORNT-01 | Phase 18 | Pending |
| ORNT-03 | Phase 18 | Pending |
| ORNT-04 | Phase 18 | Pending |
| ORNT-05 | Phase 18 | Pending |
| ORNT-06 | Phase 18 | Pending |
| ANNO-08 | Phase 19 | Pending |
| ANNO-09 | Phase 19 | Pending |
| ANNO-10 | Phase 19 | Pending |
| ANNO-11 | Phase 19 | Pending |
| ANNO-12 | Phase 19 | Pending |
| IMG-01 | Phase 20 | Pending |
| IMG-02 | Phase 20 | Pending |
| IMG-03 | Phase 20 | Pending |
| IMG-04 | Phase 20 | Pending |
| IMG-05 | Phase 20 | Pending |
| IMG-06 | Phase 20 | Pending |
| POLISH-07 | Phase 15 | Pending |
| POLISH-08 | Phase 21 | Pending |
| POLISH-09 | Phase 21 | Pending |
| POLISH-10 | Phase 21 | Pending |
| POLISH-11 | Phase 21 | Pending |
| ACPT-07 | Phase 21 | Pending |
| ACPT-08 | Phase 21 | Pending |

**Coverage:**

- v2.1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-23*
*Last updated: 2026-08-24 after v2.1 roadmap creation*
