# Requirements: Lem Reader

**Defined:** 2026-07-26
**Core Value:** Readers can move through long-form web content with calm, stable orientation and predictable navigation.

## v1 Requirements

### Document Foundation

- [x] **DOC-01**: Reader can open each curated saved article from the prototype's representative fixture set.
- [x] **DOC-02**: Reader receives the article's headings, paragraphs, links, quotations, lists, figures, captions, footnotes, and code blocks in their original semantic order.
- [x] **DOC-03**: Reader can follow preserved article links and access the original source URL and article metadata.
- [x] **DOC-04**: Each normalized article has a stable identity and revision so saved locations and annotations resolve against the intended content.
- [x] **DOC-05**: Supported article content maps to one canonical text-coordinate system shared by every reading mode.
- [x] **DOC-06**: Reader is informed when a fixture contains unsupported content rather than having that content silently omitted.

### Reading Surface

- [x] **READ-01**: Reader can read every supported article in a clean semantic scrolling view.
- [x] **READ-02**: Reader can change font family, font size, line height, text spacing, and reading measure.
- [x] **READ-03**: Reader can choose from a limited set of accessible light and dark themes.
- [x] **READ-04**: Reader sees a calm interface whose secondary controls do not permanently compete with article content.
- [ ] **READ-05**: Reader can see quiet structural location or progress information that does not treat responsive page number as permanent identity.

### Accessibility

- [x] **A11Y-01**: Reader can operate every reading, navigation, settings, highlighting, and note function using the keyboard alone without a keyboard trap.
- [x] **A11Y-02**: Reader encounters visible focus in a logical order, and focus remains predictable across navigation, mode changes, and repagination.
- [x] **A11Y-03**: Screen-reader users receive the article's correct semantic reading order in both scrolling and paginated modes without duplicate active content trees.
- [x] **A11Y-04**: Reader can zoom and reflow the interface at narrow viewport equivalents without losing article content or required functions.
- [x] **A11Y-05**: Reader can use the interface with forced-colors or high-contrast preferences without losing meaning, focus visibility, or controls.
- [x] **A11Y-06**: Reader with reduced-motion preferences receives immediate, motion-safe navigation and no required animation.
- [x] **A11Y-07**: Reader can perform primary reading and annotation interactions with pointer and touch input as well as keyboard input.
- [ ] **A11Y-08**: Reader receives concise programmatic status for consequential events such as restored position, saved annotation, or pagination fallback without repetitive page-turn announcements.

### Pagination

- [ ] **PAGE-01**: Reader can switch explicitly between paginated and scrolling modes for the same normalized article.
- [ ] **PAGE-02**: Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls.
- [ ] **PAGE-03**: Pagination preserves every supported content unit exactly once and in canonical order, without silent clipping, duplication, or omission.
- [ ] **PAGE-04**: Pagination terminates with a usable result or an explicit scrolling fallback for oversized or unsupported content.
- [ ] **PAGE-05**: Reader remains at the same logical passage when switching modes or when viewport, typography, font state, or supported asset dimensions trigger repagination.
- [ ] **PAGE-06**: Reader can continue using the last valid view while a newer pagination result is being computed.
- [ ] **PAGE-07**: Stale pagination work cannot replace a result produced for newer content, viewport, typography, font, or asset constraints.
- [ ] **PAGE-08**: The measurement layer is calibrated against browser-rendered fixtures across supported engines before any Pretext.js fast path is enabled.
- [ ] **PAGE-09**: Pagination records actionable diagnostics and presents an understandable reason when it falls back to scrolling.

### Annotations

- [ ] **ANNO-01**: Reader can select supported article text and create a highlight in either reading mode.
- [ ] **ANNO-02**: Reader can attach a text note to a highlight.
- [ ] **ANNO-03**: Reader can view, edit, and delete their locally stored notes and highlights.
- [ ] **ANNO-04**: Reader can navigate from a saved annotation back to its logical passage.
- [ ] **ANNO-05**: Highlights and notes remain attached to the same normalized text across repagination, mode changes, typography changes, and reopening.
- [ ] **ANNO-06**: Annotation anchors store canonical position plus quoted context rather than page numbers, pixels, DOM paths, or serialized live ranges.
- [ ] **ANNO-07**: Reader is shown an explicit ambiguous or orphaned state when an annotation cannot be resolved confidently rather than having it silently reattached.

### Local State

- [ ] **STATE-01**: Reader's current logical location is restored when the same article revision is reopened.
- [x] **STATE-02**: Reader's typography, theme, and preferred reading mode persist locally across sessions.
- [ ] **STATE-03**: Reader's highlights and notes persist locally across sessions.
- [x] **STATE-04**: Local records are versioned and validated so schema migrations do not silently corrupt documents, preferences, locations, or annotations.
- [x] **STATE-05**: Reader receives a recoverable error state when local storage is unavailable, full, corrupt, or cannot be upgraded.

### Acceptance

- [ ] **ACPT-01**: Reader can complete the core reading flow on the representative corpus in current Chromium, Firefox, and WebKit without content loss or blocked navigation.
- [ ] **ACPT-02**: Reader can complete documented keyboard-only and manual screen-reader acceptance flows in the selected support matrix.
- [ ] **ACPT-03**: Reader retains content and required functions under high zoom, narrow reflow, forced colors, reduced motion, touch, and late or failed font loading scenarios.
- [ ] **ACPT-04**: Repagination meets explicit cold and warm performance budgets on the representative article and device profiles selected during implementation planning.

## v2 Requirements

### Orientation

- **ORNT-01**: Reader can open a heading and section navigator and jump to a structural location.
- **ORNT-02**: Reader can enable an optional line-focus aid in either reading mode.

### Annotation Recovery

- **RECV-01**: Reader can review all annotations in a dedicated panel.
- **RECV-02**: Reader can repair an ambiguous or orphaned annotation anchor explicitly.

### Portability

- **PORT-01**: Reader can export normalized articles, preferences, reading positions, highlights, and notes to a versioned local format.
- **PORT-02**: Reader can import a compatible local export with validation and conflict reporting.

### Presentation

- **PRES-01**: Reader can choose evidence-informed calm presentation presets in addition to individual controls.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Live webpage extraction and browser-extension packaging | The milestone isolates reading-engine reliability from parsing, permissions, sanitization, authentication, CORS, and store-policy risks. |
| Arbitrary saved HTML and full-web compatibility | The prototype supports an explicit rich long-form schema rather than tables, math, interactive embeds, applications, or scripts. |
| Accounts, cloud sync, and collaboration | Local ownership and mutation semantics must stabilize before identity, encryption, conflicts, and backend infrastructure. |
| Saved-article library, tags, search, and offline product shell | These expand product breadth without validating pagination and stable orientation. |
| EPUB, PDF, RSS, newsletter, and other ingestion formats | Each introduces separate document and ingestion concerns outside the article-layout hypothesis. |
| Read-aloud and synchronized speech highlighting | Voice selection, playback control, synchronization, and assistive-technology interaction require separate design and validation. |
| AI summaries, chat, recommendations, and discovery | These introduce privacy, accuracy, cost, and distraction risks unrelated to the core reading hypothesis. |
| Mandatory page-turn animation | Required motion can impede navigation and conflicts with the reduced-motion contract. |
| Formal proof of improved preference, comprehension, or completion | This milestone proves technical reliability; comparative user-value validation follows after the engine is trustworthy. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOC-01 | Phase 1 | Complete |
| DOC-02 | Phase 1 | Complete |
| DOC-03 | Phase 1 | Complete |
| DOC-04 | Phase 1 | Complete |
| DOC-05 | Phase 1 | Complete |
| DOC-06 | Phase 1 | Complete |
| READ-01 | Phase 2 | Complete |
| READ-02 | Phase 2 | Complete |
| READ-03 | Phase 2 | Complete |
| READ-04 | Phase 2 | Complete |
| READ-05 | Phase 2 | Pending |
| A11Y-01 | Phase 2 | Complete |
| A11Y-02 | Phase 2 | Complete |
| A11Y-03 | Phase 2 | Complete |
| A11Y-04 | Phase 2 | Complete |
| A11Y-05 | Phase 2 | Complete |
| A11Y-06 | Phase 2 | Complete |
| A11Y-07 | Phase 2 | Complete |
| A11Y-08 | Phase 2 | Pending |
| PAGE-01 | Phase 4 | Pending |
| PAGE-02 | Phase 4 | Pending |
| PAGE-03 | Phase 4 | Pending |
| PAGE-04 | Phase 4 | Pending |
| PAGE-05 | Phase 4 | Pending |
| PAGE-06 | Phase 3 | Pending |
| PAGE-07 | Phase 3 | Pending |
| PAGE-08 | Phase 3 | Pending |
| PAGE-09 | Phase 4 | Pending |
| ANNO-01 | Phase 5 | Pending |
| ANNO-02 | Phase 5 | Pending |
| ANNO-03 | Phase 5 | Pending |
| ANNO-04 | Phase 5 | Pending |
| ANNO-05 | Phase 5 | Pending |
| ANNO-06 | Phase 5 | Pending |
| ANNO-07 | Phase 5 | Pending |
| STATE-01 | Phase 2 | Pending |
| STATE-02 | Phase 2 | Complete |
| STATE-03 | Phase 5 | Pending |
| STATE-04 | Phase 2 | Complete |
| STATE-05 | Phase 2 | Complete |
| ACPT-01 | Phase 6 | Pending |
| ACPT-02 | Phase 6 | Pending |
| ACPT-03 | Phase 6 | Pending |
| ACPT-04 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-26*
*Last updated: 2026-07-27 after roadmap creation*
