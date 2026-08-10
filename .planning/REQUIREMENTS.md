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
- [x] **READ-05**: Reader can see quiet structural location or progress information that does not treat responsive page number as permanent identity.

### Accessibility

- [x] **A11Y-01**: Reader can operate every reading, navigation, settings, highlighting, and note function using the keyboard alone without a keyboard trap.
- [x] **A11Y-02**: Reader encounters visible focus in a logical order, and focus remains predictable across navigation, mode changes, and repagination.
- [x] **A11Y-03**: Screen-reader users receive the article's correct semantic reading order in both scrolling and paginated modes without duplicate active content trees.
- [x] **A11Y-04**: Reader can zoom and reflow the interface at narrow viewport equivalents without losing article content or required functions.
- [x] **A11Y-05**: Reader can use the interface with forced-colors or high-contrast preferences without losing meaning, focus visibility, or controls.
- [x] **A11Y-06**: Reader with reduced-motion preferences receives immediate, motion-safe navigation and no required animation.
- [x] **A11Y-07**: Reader can perform primary reading and annotation interactions with pointer and touch input as well as keyboard input.
- [x] **A11Y-08**: Reader receives concise programmatic status for consequential events such as restored position, saved annotation, or pagination fallback without repetitive page-turn announcements.

### Pagination

- [x] **PAGE-01**: Reader can switch explicitly between paginated and scrolling modes for the same normalized article. *(✅ RE-VERIFIED 2026-08-06T22:24:05Z — Plan 04-09 closed the M-toggle round-trip: global M listener in both modes + synchronous commitTurn ref + [data-block-index] queryBlocks. mode-switch-anchor.spec.ts 6/6 green × 3 engines. Full npm run test exit 0.)*
- [x] **PAGE-02**: Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls. *(✅ RE-VERIFIED 2026-08-06T22:24:05Z — Plan 04-09 closed the keyboard/chevron race: synchronous currentPageIdxRef update eliminates the Space-after-ArrowRight race; force:true + correct aria-disabled reflection at boundaries. page-turn-controls.spec.ts 9/9 green × 3 engines.)*
- [x] **PAGE-03**: Pagination preserves every supported content unit exactly once and in canonical order, without silent clipping, duplication, or omission. *(✅ Plan 04-07 closed PAGE-03b silent-clipping BLOCKER — post-render overflow guard corrects overflowing pages against live DOM truth. 54/54 no-overflow cells × 3 engines GREEN. PAGE-03a coverage + PAGE-03c termination also green. PageFragment.blocks never empty — defensive empty-slice guard. RE-VERIFIED 2026-08-06T22:24:05Z in the full npm run test suite, exit 0.)*
- [x] **PAGE-04**: Pagination terminates with a usable result or an explicit scrolling fallback for oversized or unsupported content. *(Proven by fallback-oversize + fallback-banner e2e across chromium/firefox/webkit — Plan 04-05. RE-VERIFIED 2026-08-06T22:24:05Z in the full npm run test suite, exit 0.)*
- [x] **PAGE-05**: Reader remains at the same logical passage when switching modes or when viewport, typography, font state, or supported asset dimensions trigger repagination. *(RE-VERIFIED 2026-08-06T22:24:05Z in the full npm run test suite, exit 0 — repagination-anchor.spec.ts 6/6 green × 3 engines.)*
- [x] **PAGE-06**: Reader can continue using the last valid view while a newer pagination result is being computed. *(✅ RESTORED 2026-08-06T22:24:05Z — Plan 04-08 closed the Phase 4 regression: always-mounted hidden ArticleBody alongside PaginatedSurface + scrolling-mode seed. last-valid-view.spec.ts 3/3 green × 3 engines. Full npm run test exit 0.)*
- [x] **PAGE-07**: Stale pagination work cannot replace a result produced for newer content, viewport, typography, font, or asset constraints. *(✅ RESTORED 2026-08-06T22:24:05Z — Plan 04-08 closed the Phase 4 regression: always-mounted ArticleBody makes the partial-DOM defense unreachable; the final viewport's constraints commit (size 24). stale-drop.spec.ts 3/3 green × 3 engines.)*
- [x] **PAGE-08**: The measurement layer is calibrated against browser-rendered fixtures across supported engines before any Pretext.js fast path is enabled.
- [x] **PAGE-09**: Pagination records actionable diagnostics and presents an understandable reason when it falls back to scrolling. *(✅ RE-VERIFIED 2026-08-06T22:24:05Z — Plan 04-10 closed the banner auto-dismiss race: pointerdown inside-banner guard + 300ms scroll-dismiss debounce + DEV-only __lemDiagnosticBus injection hook. fallback-banner.spec.ts 9/9 green × 3 engines. Full npm run test exit 0.)*

### Annotations

- [x] **ANNO-01**: Reader can select supported article text and create a highlight in either reading mode.
- [x] **ANNO-02**: Reader can attach a text note to a highlight.
- [x] **ANNO-03**: Reader can view, edit, and delete their locally stored notes and highlights.
- [x] **ANNO-04**: Reader can navigate from a saved annotation back to its logical passage.
- [x] **ANNO-05**: Highlights and notes remain attached to the same normalized text across repagination, mode changes, typography changes, and reopening.
- [x] **ANNO-06**: Annotation anchors store canonical position plus quoted context rather than page numbers, pixels, DOM paths, or serialized live ranges.
- [x] **ANNO-07**: Reader is shown an explicit ambiguous or orphaned state when an annotation cannot be resolved confidently rather than having it silently reattached.

### Local State

- [x] **STATE-01**: Reader's current logical location is restored when the same article revision is reopened.
- [x] **STATE-02**: Reader's typography, theme, and preferred reading mode persist locally across sessions.
- [x] **STATE-03**: Reader's highlights and notes persist locally across sessions.
- [x] **STATE-04**: Local records are versioned and validated so schema migrations do not silently corrupt documents, preferences, locations, or annotations.
- [x] **STATE-05**: Reader receives a recoverable error state when local storage is unavailable, full, corrupt, or cannot be upgraded.

### Acceptance

- [x] **ACPT-01**: Reader can complete the core reading flow on the representative corpus in current Chromium, Firefox, and WebKit without content loss or blocked navigation.
- [x] **ACPT-02**: Reader can complete documented keyboard-only and manual screen-reader acceptance flows in the selected support matrix. *(VERIFIED 2026-08-10 — Plan 06-06: VoiceOver+Safari manual protocol zero-blocker/zero-major after 5 findings resolved — #2/#5 source fixes [modal `<dialog>` + aria-describedby], #1 documented platform constraint [selection-toolbar = primary SR path], #3 minor-deferred, #4 SR-resolved; honest full-suite `npm run test` 1157/0 exit 0. REDUCED GATE per research assumption A4: NVDA+Firefox/Windows not run, recorded as a documented post-v1 follow-up; cross-SR finding generalization covers the main risk surface [the #1 bare-H reservation applies to NVDA/JAWS; the modal-`<dialog>` fix uses a primitive all SRs honor].)*
- [x] **ACPT-03**: Reader retains content and required functions under high zoom, narrow reflow, forced colors, reduced motion, touch, and late or failed font loading scenarios.
- [x] **ACPT-04**: Repagination meets explicit cold and warm performance budgets on the representative article and device profiles selected during implementation planning. *(VERIFIED 2026-08-08 — Plan 06-03: user-approved locked budget at measured p95+25% headroom across 24 cells [4 engine-profile combos × 3 fixtures × 2 phases]; `npm run perf` CI gate exits 0; D6-01 measure-first honored, D6-03 fallback shares warm budget)*

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
| READ-05 | Phase 2 | Complete |
| A11Y-01 | Phase 2 | Complete |
| A11Y-02 | Phase 2 | Complete |
| A11Y-03 | Phase 2 | Complete |
| A11Y-04 | Phase 2 | Complete |
| A11Y-05 | Phase 2 | Complete |
| A11Y-06 | Phase 2 | Complete |
| A11Y-07 | Phase 2 | Complete |
| A11Y-08 | Phase 2 | Complete |
| PAGE-01 | Phase 4 | ✅ Complete (Plan 04-09 closed; re-verified 04-11) |
| PAGE-02 | Phase 4 | ✅ Complete (Plan 04-09 closed; re-verified 04-11) |
| PAGE-03 | Phase 4 | ✅ Complete (Plan 04-07 closed PAGE-03b; re-verified 04-11) |
| PAGE-04 | Phase 4 | Complete (re-verified 04-11) |
| PAGE-05 | Phase 4 | Complete (re-verified 04-11) |
| PAGE-06 | Phase 3 | ✅ Restored (Plan 04-08 closed Phase 4 regression; re-verified 04-11) |
| PAGE-07 | Phase 3 | ✅ Restored (Plan 04-08 closed Phase 4 regression; re-verified 04-11) |
| PAGE-08 | Phase 3 | Complete |
| PAGE-09 | Phase 4 | ✅ Complete (Plan 04-10 closed; re-verified 04-11) |
| ANNO-01 | Phase 5 | Complete |
| ANNO-02 | Phase 5 | Complete |
| ANNO-03 | Phase 5 | Complete |
| ANNO-04 | Phase 5 | Complete |
| ANNO-05 | Phase 5 | Complete |
| ANNO-06 | Phase 5 | Complete |
| ANNO-07 | Phase 5 | Complete |
| STATE-01 | Phase 2 | Complete |
| STATE-02 | Phase 2 | Complete |
| STATE-03 | Phase 5 | Complete |
| STATE-04 | Phase 2 | Complete |
| STATE-05 | Phase 2 | Complete |
| ACPT-01 | Phase 6 | Complete |
| ACPT-02 | Phase 6 | Complete (reduced gate A4) |
| ACPT-03 | Phase 6 | Complete |
| ACPT-04 | Phase 6 | Complete |

**Coverage:**

- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-26*
*Last updated: 2026-07-27 after roadmap creation*
