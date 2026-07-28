# Roadmap: Lem Reader

## Overview

Lem Reader reaches its MVP through six vertical slices that keep a usable semantic reader available while progressively proving the riskier booklike experience. The roadmap establishes canonical article identity first, delivers an accessible scrolling reader with recoverable local state, validates browser-faithful measurement, adds correct responsive pagination and dual-mode navigation, projects durable annotations through the shared coordinate model, and finally proves the complete experience across the supported browser and accessibility matrix.

## Phases

- [x] **Phase 1: Canonical Article Foundation** - Readers can open a representative saved corpus whose rich structure and stable logical coordinates are explicit and verifiable. (completed 2026-07-28)
- [ ] **Phase 2: Accessible Scrolling Reader** - Readers have a calm, adaptable scrolling experience with predictable interaction and recoverable local preferences and location.
- [ ] **Phase 3: Trustworthy Layout Measurement** - Readers retain a usable view while responsive layout work is calibrated, current, and safe against font and asset changes.
- [ ] **Phase 4: Responsive Pagination and Dual-Mode Navigation** - Readers can navigate complete, stable pages or return to scrolling without losing their passage.
- [ ] **Phase 5: Durable Highlights and Notes** - Readers can create and manage local annotations that remain attached to canonical passages across every view change.
- [ ] **Phase 6: Prototype Acceptance** - Readers can complete the full reading and annotation flow across the supported browser and accessibility conditions within explicit performance budgets.

## Phase Details

### Phase 1: Canonical Article Foundation

**Goal:** Readers can open representative saved articles with faithful semantic structure, provenance, and stable content identity.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06
**Success Criteria** (what must be TRUE):

  1. Reader can open every article in the curated fixture set and identify its title, metadata, and original source.
  2. Reader encounters headings, prose, links, quotations, lists, figures, captions, footnotes, and code in canonical semantic order.
  3. Reader can follow preserved links, while unsupported fixture content is disclosed instead of silently disappearing.
  4. The same article revision exposes one stable logical text coordinate system for all later reading locations and annotations.

**Plans:** 3/3 plans complete
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Wave 0: scaffold + frozen document model (Zod + D-04/D-06) + grapheme-offset substrate (D-05) + reserved Dexie + test infrastructure
- [x] 01-02-PLAN.md — Wave 1: in-memory repository + recursive semantic renderer + Walking Skeleton UI vertical (hash routing + D-07 warm-paper tokens + FixtureList + ArticleView)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Wave 2: D-03 fixture-approval checkpoint + throwaway normalization script (D-09) + curated 5–7 article corpus + e2e/axe-core validation across Chromium/Firefox/WebKit

**UI hint:** yes

### Phase 2: Accessible Scrolling Reader

**Goal:** Readers can comfortably read and resume an article in a calm scrolling interface adapted to their access and presentation preferences.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** READ-01, READ-02, READ-03, READ-04, READ-05, A11Y-01, A11Y-02, A11Y-03, A11Y-04, A11Y-05, A11Y-06, A11Y-07, A11Y-08, STATE-01, STATE-02, STATE-04, STATE-05
**Success Criteria** (what must be TRUE):

  1. Reader can read the complete semantic article in a quiet scrolling view and see unobtrusive structural progress without relying on permanent page numbers.
  2. Reader can adjust typography, spacing, measure, and accessible light or dark theme, and those preferences persist across sessions.
  3. Reader can operate reading and settings functions by keyboard, pointer, or touch with visible logical focus, concise status, no traps, and motion-safe behavior.
  4. Screen-reader, zoom/reflow, and forced-color users retain the article's semantic order, visible controls, and required functions without a duplicate active content tree.
  5. Reader returns to the same logical location on reopening and receives a recoverable error when versioned local data cannot be read, migrated, or saved.

**Plans:** TBD
**UI hint:** yes

### Phase 3: Trustworthy Layout Measurement

**Goal:** Readers keep a valid, usable article view while responsive layout measurement settles and only the newest trustworthy result can take effect.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** PAGE-06, PAGE-07, PAGE-08
**Success Criteria** (what must be TRUE):

  1. Reader can continue using the last valid article view while a changed viewport, typography setting, font state, or asset dimension is being measured.
  2. A late result computed for older constraints never replaces the newer valid layout the reader is using.
  3. Across the supported engines, any enabled fast text-measurement path stays within documented tolerances of browser-rendered calibration fixtures.

**Plans:** TBD
**UI hint:** yes

### Phase 4: Responsive Pagination and Dual-Mode Navigation

**Goal:** Readers can move predictably through complete responsive pages and switch or fall back to scrolling without losing their logical passage.
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-09
**Success Criteria** (what must be TRUE):

  1. Reader can explicitly switch the same article between semantic paginated and scrolling modes while remaining at the same logical passage.
  2. Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls with predictable focus.
  3. Every supported content unit appears exactly once and in canonical order, without clipping, duplication, omission, or nonterminating pagination.
  4. Reader remains anchored through viewport, typography, font, and supported asset changes while a previous valid view remains available during repagination.
  5. Oversized or unsupported content produces an understandable diagnostic and a usable scrolling fallback at the same passage.

**Plans:** TBD
**UI hint:** yes

### Phase 5: Durable Highlights and Notes

**Goal:** Readers can create, revisit, and manage local highlights and notes that remain attached to their intended normalized text.
**Mode:** mvp
**Depends on:** Phase 4
**Requirements:** ANNO-01, ANNO-02, ANNO-03, ANNO-04, ANNO-05, ANNO-06, ANNO-07, STATE-03
**Success Criteria** (what must be TRUE):

  1. Reader can select supported text and create a highlight in either reading mode, with an optional attached text note.
  2. Reader can view, edit, delete, and navigate from locally stored annotations back to their logical passages.
  3. Highlights and notes remain on the same normalized text after repagination, mode or typography changes, and reopening the article.
  4. When quoted-context and canonical-position selectors cannot resolve confidently, reader sees an explicit ambiguous or orphaned state instead of a silent reattachment.

**Plans:** TBD
**UI hint:** yes

### Phase 6: Prototype Acceptance

**Goal:** Readers can rely on the complete prototype across the selected browser, assistive-technology, input, reflow, font, and performance conditions.
**Mode:** mvp
**Depends on:** Phase 5
**Requirements:** ACPT-01, ACPT-02, ACPT-03, ACPT-04
**Success Criteria** (what must be TRUE):

  1. Reader can complete the representative-corpus reading flow in current Chromium, Firefox, and WebKit without content loss or blocked navigation.
  2. Reader can complete documented keyboard-only and manual screen-reader flows in the selected support matrix.
  3. Reader retains content and required functions under high zoom, narrow reflow, forced colors, reduced motion, touch, and late or failed font loading.
  4. Cold and warm repagination on the selected article and device profiles stays within explicit release budgets or falls back without blocking reading.

**Plans:** TBD
**UI hint:** yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Canonical Article Foundation | 3/3 | Complete   | 2026-07-28 |
| 2. Accessible Scrolling Reader | 0/TBD | Not started | - |
| 3. Trustworthy Layout Measurement | 0/TBD | Not started | - |
| 4. Responsive Pagination and Dual-Mode Navigation | 0/TBD | Not started | - |
| 5. Durable Highlights and Notes | 0/TBD | Not started | - |
| 6. Prototype Acceptance | 0/TBD | Not started | - |
