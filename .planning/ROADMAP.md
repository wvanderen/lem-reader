# Roadmap: Lem Reader

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-08-10) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v2.0 Personal Library** — Phases 7-13 (shipped 2026-08-23) — [archive](milestones/v2.0-ROADMAP.md)
- 🚧 **v2.1 Reader Experience** — Phases 14-21

## Phases

- [x] **Phase 14: Navigation and Library Contracts** - Establish truthful destination behavior and reading-state policy. (completed 2026-08-25)
- [x] **Phase 15: Application Shell and Destinations** - Make Library, Highlights, and Reader predictable first-class destinations. (completed 2026-08-26)
- [x] **Phase 16: Organized Library and Focused Add Flow** - Browse by reading state and add content without permanent form clutter. (completed 2026-08-29)
- [x] **Phase 17: Reader-Owned Metadata** - Edit display title and author without disturbing canonical identity. (completed 2026-08-30)
- [x] **Phase 18: Reader Orientation** - Navigate canonical headings and receive non-intrusive restoration feedback. (completed 2026-08-30)
- [x] **Phase 19: Cross-Block Highlights** - Manage one durable highlight across multiple semantic blocks. (completed 2026-08-31)
- [ ] **Phase 20: Safe Local Image Fidelity** - Preserve figures and captions as safe, portable local assets.
- [ ] **Phase 21: Integrated Refinement and Acceptance** - Correct remaining UI issues and prove the complete milestone.

## Phase Details

### Phase 14: Navigation and Library Contracts

**Goal**: Readers encounter consistent destination behavior and truthful reading-state classification across articles and books.
**Depends on**: Phase 13
**Requirements**: NAV-04, LIB-07, LIB-08
**Success Criteria** (what must be TRUE):

  1. Each destination exposes a coherent title, heading hierarchy, landmarks, history behavior, and route-change focus behavior.
  2. Reader can switch among All, Unread, In Progress, and Finished views whose membership follows one progress policy.
  3. Counts, progress indicators, and empty states agree with view membership for articles and EPUB books.

**Plans**: 3/4 plans executed

Plans:
**Wave 1**

- [x] 14-01-PLAN.md — readingState policy module + pageMeta title helper + consumer unification (LIB-07 foundation)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-02-PLAN.md — router view grammar + replaceState switch + ViewSwitcher + per-view counts/empty states + library title/focus
- [x] 14-03-PLAN.md — per-destination titles + route-change focus layering (ArticleView, ReviewView)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-04-PLAN.md — 3-engine e2e views/counts/focus/title/history matrix + honest full-suite gate

**UI hint**: yes

### Phase 15: Application Shell and Destinations

**Goal**: Readers move predictably among primary destinations without losing context or encountering irrelevant controls.
**Depends on**: Phase 14
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-05, POLISH-07
**Success Criteria** (what must be TRUE):

  1. Reader can navigate directly between first-class Library and Highlights destinations through a consistent shell.
  2. Activating the Lem Reader brand returns predictably to the Library.
  3. Returning from Reader or Highlights restores prior Library filters and scroll position.
  4. Reading-only controls appear only in reader context while globally meaningful preferences remain intentionally available elsewhere.
  5. Library, Highlights, Add, and Reader share coherent gutters, headers, spacing, responsive behavior, and visible focus.

**Plans**: 4/4 plans complete

Plans:
**Wave 1**

- [x] 15-01-PLAN.md — Highlights rename + #/review legacy alias, commit-atomic with all pinned-spec updates (NAV-01 grammar)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 15-02-PLAN.md — shell destination nav + brand link + ModeToggle gating + ≤639px collapse + D10-02 button removal (NAV-01/02/05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 15-03-PLAN.md — librarySession restore module + view-matched Library integration + restore matrix (NAV-03)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 15-04-PLAN.md — POLISH-07 token audit + 320px geometry hardening + 3-engine honest full-suite gate (POLISH-07)

**UI hint**: yes

### Phase 16: Organized Library and Focused Add Flow

**Goal**: Readers find content by reading state and add material through a focused, recoverable workflow.
**Depends on**: Phase 15
**Requirements**: LIB-09, LIB-10, ADD-01, ADD-02, ADD-03, ADD-04
**Success Criteria** (what must be TRUE):

  1. Search and tag filters narrow the selected reading-state view without contradictory results.
  2. Continue Reading complements rather than duplicates or displaces the main library organization.
  3. Add to Library opens a focused workflow where every existing source is available and only relevant inputs appear.
  4. Reader can cancel, retry, or recover from failure without losing useful input, creating duplicates, or hiding refusal reasons.
  5. Add manages focus, dismissal, success, narrow-width, and high-zoom behavior predictably.

**Plans**: 4/4 plans complete

Plans:
**Wave 1**

- [x] 16-01-PLAN.md — LIB-09/LIB-10 no-matches feedback + clear-filters + All-only Continue Reading gate (LIB-09, LIB-10)
- [x] 16-02-PLAN.md — ingestCopy extraction + AddDialog component: 3-way picker, submission spine, component tests (ADD-02, ADD-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 16-03-PLAN.md — LibraryView integration: header Add button, add-section dissolution, IngestControl retirement + atomic 12-spec migration (ADD-01, ADD-03, ADD-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 16-04-PLAN.md — focused-add 3-engine e2e + a11y/reflow/high-zoom strengthens + honest full-suite gate (ADD-04, ADD-01, ADD-02)

**UI hint**: yes

### Phase 17: Reader-Owned Metadata

**Goal**: Readers personalize saved titles and authors while canonical identity, anchors, and portability remain intact.
**Depends on**: Phase 16
**Requirements**: META-01, META-02, META-03, META-04
**Success Criteria** (what must be TRUE):

  1. Reader can edit display title and author without changing identity, provenance, revision, position, or annotations.
  2. Edited metadata appears consistently in Library, Reader, Highlights, search, and exports.
  3. Clearing an override restores the canonical value, including an absent author.
  4. Overrides migrate and export/import with explicit conflicts, and cascade when their article is removed.

**Plans**: 5/5 plans complete

Plans:
**Wave 1**

- [x] 17-01-PLAN.md — ArticleSchema readerTitle/readerAuthor + effectiveMetadata derivation module + unit truth table (META-01, META-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 17-02-PLAN.md — Library edit surface: EditMetadataDialog + row affordance + reset/blank-refusal + library/search/strip consistency e2e (META-01, META-02, META-03)
- [x] 17-03-PLAN.md — Reader/Highlights/export presentation surfaces on effective values (META-02)
- [x] 17-04-PLAN.md — Bundle v3 + article-metadata-override conflict kind + merge-on-win + per-item import choice (META-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 17-05-PLAN.md — migration/round-trip/conflict/cascade e2e + cross-surface consistency + honest full-suite gate (META-02, META-04)

**UI hint**: yes

### Phase 18: Reader Orientation

**Goal**: Readers navigate document structure without unstable page/DOM identities or intrusive restoration UI.
**Depends on**: Phase 17
**Requirements**: ORNT-01, ORNT-03, ORNT-04, ORNT-05, ORNT-06
**Success Criteria** (what must be TRUE):

  1. Reader can open a labeled canonical-heading table of contents and jump to a structural location.
  2. The same destination lands correctly in scrolling and paginated modes.
  3. Skipped and duplicate heading levels remain semantic and usable by keyboard and screen reader.
  4. At narrow widths or high zoom, opening or closing the TOC neither obscures content, changes logical location, nor traps focus.
  5. Reopening communicates restored location without shifting content, blocking page turns, or requiring dismissal.

**Plans**: 4/4 plans complete

Plans:
**Wave 1**

- [x] 18-01-PLAN.md — deriveToc pure module + blockStartOffsets destinations + sectionSpy extraction (ORNT-04 foundation, byte-stable announcer)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-02-PLAN.md — TocPanel popover=manual + header trigger + mode-aware D5-11 jumps + ≤420px staged collapse (ORNT-01, ORNT-03, ORNT-04, ORNT-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 18-03-PLAN.md — paginated save/restore closure + RestorationMarker + banner retirement sweep (ORNT-06)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 18-04-PLAN.md — seeded TOC corpus + 3-engine e2e matrix + honest full-suite gate + requirements completion (ORNT-01, ORNT-03, ORNT-04, ORNT-05, ORNT-06)

**UI hint**: yes

### Phase 19: Cross-Block Highlights

**Goal**: Readers capture and manage a single honest annotation across multiple supported semantic blocks.
**Depends on**: Phase 18
**Requirements**: ANNO-08, ANNO-09, ANNO-10, ANNO-11, ANNO-12
**Success Criteria** (what must be TRUE):

  1. Reader can create one highlight from a native selection spanning eligible mounted blocks.
  2. It renders across blocks but behaves as one identity, one global grapheme range, and one optional note.
  3. It stays attached through repagination, mode/typography changes, reopening, review navigation, and export/import.
  4. Reader can review, edit, export, and delete it atomically without leftover fragments or guessed attachment.
  5. Unsupported boundaries are rejected or narrowed with an explicit explanation from the supported-content matrix.

**Plans**: 5/5 plans complete
**UI hint**: yes

Plans:
**Wave 1**

- [x] 19-01-PLAN.md — span capture core: endpoint-composed global ranges, reason taxonomy retirement/addition, Pitfall 1 figure-caption fix, moved e2e success cell (ANNO-08, ANNO-12)
- [x] 19-02-PLAN.md — first-fragment excerpt helper adopted at all quote.exact surfaces + multi-line Markdown export with per-line escaping (ANNO-10, ANNO-11)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-03-PLAN.md — scrolling render coverage: list per-item threading (D19-13/15), caption + code marks, first-slice-only DOM id, nested-list fixture (ANNO-09, ANNO-12)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-04-PLAN.md — paginated twin: entry-local list threading + per-page first-occurrence id pass + multi-page span cells (ANNO-09, ANNO-10)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 19-05-PLAN.md — eligibility-matrix e2e (kind × crossing × gap + refusals), durability/atomicity span cells, honest full-suite gate (ANNO-08, ANNO-10, ANNO-11, ANNO-12)

### Phase 20: Safe Local Image Fidelity

**Goal**: Readers retain meaningful figures and captions as safe, offline, portable content stable in both reading modes.
**Depends on**: Phase 19
**Requirements**: IMG-01, IMG-02, IMG-03, IMG-04, IMG-05, IMG-06
**Success Criteria** (what must be TRUE):

  1. Supported ingestion preserves reliably recoverable figures, alternative text, and captions canonically.
  2. Assets outside approved network, type, byte, pixel, count, animation, or decode limits are calmly refused without unsafe fetches.
  3. Reopening renders supported images from local assets and never contacts third-party image hosts.
  4. Figures render semantically with stable geometry and calm failures in both modes without content or location loss.
  5. Assets export/import with validation, limits, conflicts, and no broken references, and follow documented deletion lifecycle.

**Plans**: TBD
**UI hint**: yes

### Phase 21: Integrated Refinement and Acceptance

**Goal**: Readers experience a cohesive, corrected application proven across the full browser and accessibility matrix.
**Depends on**: Phase 20
**Requirements**: POLISH-08, POLISH-09, POLISH-10, POLISH-11, ACPT-07, ACPT-08
**Success Criteria** (what must be TRUE):

  1. Tag menus stay adjacent to their trigger and visible as geometry changes, then restore focus when closed.
  2. Reading width reaches a truthful 64-character maximum at the visual and programmatic far-right endpoint.
  3. Highlights respects the shared grid and offers clear Library and article-context navigation.
  4. The complete v2.1 core flow succeeds without loss in Chromium, Firefox, and WebKit.
  5. The Impeccable-informed audit and keyboard, NVDA, VoiceOver, reduced-motion, forced-colors, reflow, and zoom matrix finish with no blocker or major finding.

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 35/35 | Complete | 2026-08-10 |
| 7-13 | v2.0 | 53/53 | Complete | 2026-08-23 |
| 14. Navigation and Library Contracts | v2.1 | 4/4 | Complete    | 2026-08-25 |
| 15. Application Shell and Destinations | v2.1 | 4/4 | Complete    | 2026-08-26 |
| 16. Organized Library and Focused Add Flow | v2.1 | 4/4 | Complete    | 2026-08-29 |
| 17. Reader-Owned Metadata | v2.1 | 5/5 | Complete    | 2026-08-30 |
| 18. Reader Orientation | v2.1 | 4/4 | Complete    | 2026-08-30 |
| 19. Cross-Block Highlights | v2.1 | 5/5 | Complete    | 2026-08-31 |
| 20. Safe Local Image Fidelity | v2.1 | 0/TBD | Not started | - |
| 21. Integrated Refinement and Acceptance | v2.1 | 0/TBD | Not started | - |
