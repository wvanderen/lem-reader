# Roadmap: Lem Reader

## Overview

Lem Reader reaches its MVP through six vertical slices that keep a usable semantic reader available while progressively proving the riskier booklike experience. The roadmap establishes canonical article identity first, delivers an accessible scrolling reader with recoverable local state, validates browser-faithful measurement, adds correct responsive pagination and dual-mode navigation, projects durable annotations through the shared coordinate model, and finally proves the complete experience across the supported browser and accessibility matrix.

## Phases

- [x] **Phase 1: Canonical Article Foundation** - Readers can open a representative saved corpus whose rich structure and stable logical coordinates are explicit and verifiable. (completed 2026-07-28)
- [x] **Phase 2: Accessible Scrolling Reader** - Readers have a calm, adaptable scrolling experience with predictable interaction and recoverable local preferences and location. (completed 2026-08-04)
- [x] **Phase 3: Trustworthy Layout Measurement** - Readers retain a usable view while responsive layout work is calibrated, current, and safe against font and asset changes. (completed 2026-08-05)
- [ ] **Phase 4: Responsive Pagination and Dual-Mode Navigation** - Readers can navigate complete, stable pages or return to scrolling without losing their passage. *(VERIFIED 2026-08-06T22:24:05Z — Plan 04-11 ran the full `npm run test` suite end-to-end: 753 passed / 0 failed / 0 skipped, exit 0. The prior "269/0" misreport is overturned; all 6 verifier-found gaps closed by 04-07/08/09/10. 04-VERIFICATION.md upgraded gaps_found (3/7) → verified (7/7).)* (in progress 2026-08-06)
- [x] **Phase 5: Durable Highlights and Notes** - Readers can create and manage local annotations that remain attached to canonical passages across every view change. (completed 2026-08-07)
- [ ] **Phase 6: Prototype Acceptance** - Readers can complete the full reading and annotation flow across the supported browser and accessibility conditions within explicit performance budgets.

## Phase Details

### Phase 1: Canonical Article Foundation

**Goal:** As a reader, I want to open representative saved articles rendered with faithful semantic structure, provenance, and stable content identity, so that I can read normalized long-form content in canonical order with a coordinate system that supports later navigation and annotation.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06
**Success Criteria** (what must be TRUE):

  1. Reader can open every article in the curated fixture set and identify its title, metadata, and original source.
  2. Reader encounters headings, prose, links, quotations, lists, figures, captions, footnotes, and code in canonical semantic order.
  3. Reader can follow preserved links, while unsupported fixture content is disclosed instead of silently disappearing.
  4. The same article revision exposes one stable logical text coordinate system for all later reading locations and annotations.

**Plans:** 5/5 plans complete
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Wave 0: scaffold + frozen document model (Zod + D-04/D-06) + grapheme-offset substrate (D-05) + reserved Dexie + test infrastructure
- [x] 01-02-PLAN.md — Wave 1: in-memory repository + recursive semantic renderer + Walking Skeleton UI vertical (hash routing + D-07 warm-paper tokens + FixtureList + ArticleView)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Wave 2: D-03 fixture-approval checkpoint + throwaway normalization script (D-09) + curated 5–7 article corpus + e2e/axe-core validation across Chromium/Firefox/WebKit

**Gap Closure (Wave 1, parallel — UAT diagnosed gaps)**

- [x] 01-04-PLAN.md — Gap 1 (fixture-list inset) + Gap 2 (error-state two-line copy + `.status` styling): unify view inset on `main#main`, add `.status` card, render full UI-SPEC Copywriting contract in FixtureList + ArticleView
- [x] 01-05-PLAN.md — Gap 3 (footnote/router collision): router ignores non-`#/` fragment-only hashes so native in-page scroll works; renderer adds the footnote-body → reference back-link; jsdom component test + 3-engine e2e round-trip

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

**Plans:** 4/4 plans complete
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Wave 1: live typography/theme settings panel + quiet persistent header (native `<dialog>`/showModal, focus-restore) on the Zod settings/location schemas + Dexie version(2) substrate + SettingsContext live-apply

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Wave 2: settings persistence (Dexie, debounced + dual-event flush) + STATE-05 graceful recovery (storage banner + focus-trapped wipe confirmation)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Wave 3: location restore (grapheme offset → DOM) + quiet progress hairline + debounced section-change announce + resume banner

**Gap Closure (UAT-diagnosed gaps)**

- [x] 02-04-PLAN.md — Gap 1 (progress hairline transform-origin: invalid `inline-start` keyword → physical `left` in ProgressHairline.tsx + app.css) + Gap 2 (text-size + spacing dead writes: route `font-size`/`line-height` through `--font-size`/`--line-height` custom properties consumed by the body rule; `--font-body`/`--measure` untouched)

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

**Plans:** 2/2 plans complete
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Wave 1: staleness-safe measurement core (epoch + AbortController + font gate + diagnostics + DOM measurer + trigger coalescer + engine + useMeasurement hook) wired into ArticleView, proving PAGE-06 (last-valid-view retention) + PAGE-07 (stale-epoch drop) end-to-end with DOM measurement as the strategy

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Wave 2: calibrated Pretext fast path (TextMeasurer adapter as sole `@chenglou/pretext` import + per-kind dispatch + runtime drift guard) + Playwright calibration harness across 6 fixtures × typography matrix × 3 engines + committed `calibration/fingerprint.json` + CI compare gate, proving PAGE-08

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

**Plans:** 11/11 plans executed
Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Wave 1: project-owned pagination engine (src/pagination/* — types, lineBoxes, splitBlock, widowRules, fragment) + unit tests proving PAGE-03 exactly-once/canonical-order/termination + PAGE-04 oversize/threshold guards
- [x] 04-02-PLAN.md — Wave 1: readingMode Zod value-shape evolution (schemaVersion 1→2, default paginated, NO Dexie change per Pitfall 9) + Wave 0 test infrastructure (corpus × viewport × typography matrix + 8 pagination e2e scaffolds)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-03-PLAN.md — Wave 2: thin end-to-end paginated vertical slice (PageFragmentView reusing BlockView + PaginatedSurface deriving pages from trustedView + ArticleView mode-aware branch + page geometry CSS + quiet chevrons + PageIndicator + ProgressHairline N/M)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-04-PLAN.md — Wave 3: full dual-mode navigation (ModeToggle + Header + M shortcut + PageTurnControls keyboard/swipe/chevrons + D4-07 focus + announce + D4-10 mode-switch anchor + D4-11 repagination anchor)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-05-PLAN.md — Wave 4: PaginationFallbackBanner + DiagnosticBus subscription + session-mode flip + 8 pagination e2e specs (PAGE-04/09 fallback path PROVEN across chromium/firefox/webkit) + phase-gate human verify (manual UI checks APPROVED 2026-08-06 BUT automated prerequisite was misreported — see 04-VERIFICATION.md)

**Wave 5** *(blocked on Wave 4 — gap closure for the engine container-handling blocker)*

- [x] 04-06-PLAN.md — Wave 5: engine gap fix — capture LineBox[][] during measurement (Option A) + data-block-index 1:1 block↔element mapping + engine consumes pre-captured line boxes + remove corpus-matrix ok-path e2e skips + fix pre-existing persistence.spec.ts STATE-01 failures. PAGE-03 closed; 04-05 Task 3 gate unblocked.

**Gap Closure Waves 6–9** *(gsd-verifier caught 76 hidden e2e failures misreported as "269/0"; routing to /gsd-plan-phase --gaps)*

- [x] 04-07-PLAN.md — Wave 6: PAGE-03 silent-clipping BLOCKER fix — STACK.md-mandated post-render overflow guard (new src/pagination/overflowGuard.ts) wired into PaginatedSurface; re-fragments overflowing pages against live DOM truth. **54 no-overflow cells × 3 engines GREEN** (2026-08-06). PAGE-03a/c preserved. Defensive empty-slice guard added (Rule 1).
- [x] 04-08-PLAN.md — Wave 6 (parallel): Phase 3 PAGE-06 + PAGE-07 cross-phase regression fix — partial-DOM defense + epoch guard interaction in src/measurement/engine.ts corrected so re-measurement preserves article DOM content AND commits the final valid constraints. 6 cells green.
- [x] 04-09-PLAN.md — Wave 7: PAGE-01 M-toggle round-trip + PAGE-02 keyboard bundle + chevron boundary — M shortcut registered globally in both modes; synchronous ref update in commitTurn; aria-disabled reflection at boundaries. 9 cells green.
- [x] 04-10-PLAN.md — Wave 8: PAGE-09 banner auto-dismiss race — banner stays mounted through reader's click; UI-SPEC verbatim copy + T-04-15 + re-trigger semantics preserved. 9 cells green.
- [x] 04-11-PLAN.md — Wave 9: PROCESS BLOCKER closed — full `npm run test` run end-to-end by the executor (no subset, no --grep, no engine skip): **753 passed (408 unit + 345 e2e × chromium/firefox/webkit) / 0 failed / 0 skipped, exit 0**. Overturns the "269/0" misreporting pattern. 04-VERIFICATION.md upgraded gaps_found (3/7) → verified (7/7); all 6 prior gaps marked closed (04-11-OUTPUT.md is the permanent record).

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

**Plans:** 7/7 plans complete
Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Wave 1: annotation anchor engine — resolveQuoteSelector (D5-02 tri-state) + captureSelection (DOM Range→grapheme offset) + overlap + highlightRanges (splitParagraphRuns reuse) + HighlightRecord/NoteRecord Zod schemas + db.ts Table type fix (NO version bump) + highlightsStore/notesStore (compound-index query + cascade-delete transaction) + 6 Wave 0 unit tests proving the ANNO-05/06 round-trip + ANNO-07 tri-state + STATE-04/05

**Wave 2** *(blocked on Wave 1)*

- [x] 05-02-PLAN.md — Wave 2: "create + see a highlight" vertical slice — useAnnotationState hook + HighlightOverlay provider (eager load+resolve on open) + floating SelectionToolbar (position:fixed, edge-clamp, invalid hints) + `<mark class=highlight>` overlay INTO InlineRenderer/BlockRenderer (no fork) + ArticleView selection listener + H/N shortcuts + user-select:none on .article-body-measurement + --highlight token (3 themes) + forced-colors CSS. Closes ANNO-01/05/06.

**Wave 3** *(blocked on Wave 2)*

- [x] 05-03-PLAN.md — Wave 3: notes + drawer + navigate-back + delete slice — NotePopover (Popover API manual + debounced save mirroring SettingsContext + WipeConfirm two-step delete) + AnnotationsDrawer (native `<dialog>` reusing .settings-panel geometry, reading-order list, empty-state) + Header annotations-trigger + D5-11 navigate-back (fragmentContainingOffset/commitTurn paginated OR findScrollTarget/scrollIntoView scrolling + focus the `<mark>`) + .status announces. Closes ANNO-02/03/04.

**Wave 4** *(blocked on Wave 3)*

- [x] 05-04-PLAN.md — Wave 4: ANNO-07 ambiguous/orphan surfacing (D5-02/D5-04) — status-driven mark.highlight.unresolved dashed marker at position hint/first candidate + drawer flag + disabled jump + one-time "{N} couldn't be relocated" open-announce + D5-16 cross-fragment slicing in fragmentRenderer (highlight range ∩ fragment range, shared data-highlight-id, no silent gap at page turn) + forced-colors three-shape distinction. Closes ANNO-07.

**Wave 5** *(blocked on Wave 4 — phase gate)*

- [x] 05-05-PLAN.md — Wave 5: full Playwright e2e corpus matrix (tests/e2e/annotations/*) across the 6-fixture corpus × theme × mode × chromium/firefox/webkit — capture/reject/keyboard, notes/drawer/delete/navigate-back, survive-repagination/mode-switch/reopen, cross-fragment-render, ambiguous-orphan-surface, persist-reload, forced-colors-shapes. Phase gate = full `npm run test` exit 0 (mirrors Plan 04-11 precedent: honest counts, no subset/grep/engine-skip). Closes ANNO-01..05/07 + STATE-03.

**Gap Closure (Wave 6 — UAT Test 11 diagnosed gaps; two independent gaps, zero file overlap → parallel)**

- [x] 05-06-PLAN.md — Wave 6: BLOCKER — pagination uneven pages. Gate ArticleView's geometry-effect rAF read on the `.paginated-surface` class (debug Option A) so the scrolling-body natural height is never captured on initial load in paginated-default mode (latent since Phase 4; Plan 04-09 sync reset only covered mode swaps). PLUS the CI regression guard the debug flagged as missing: a new initial-pagination-even e2e that captures the FIRST `__lemPagination` publication and asserts >1 page + stable (the existing no-overflow e2e was fooled by `.page-fragment{height:100%}` + a 600ms wait past the racy correction). Unblocks ANNO-05; re-verifies PAGE-03.
- [x] 05-07-PLAN.md — Wave 6: MAJOR — blockquote highlight renders no inline mark. Add recursive per-child highlightSlices for blockquote in BOTH render paths (BlockRenderer.ArticleBody scrolling + fragmentRenderer.PageFragmentView paginated), reusing sliceRunsForHighlights/highlightsForBlock unchanged, accounting for BLOCK_SEPARATOR between children (mirrors sliceChildBlocks). BlockView blockquote case forwards childHighlightSlices per child. Closes ANNO-01/05 for blockquote (D5-07 eligible; capture/persistence/resolution already worked).

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

**Plans:** 2/6 plans executed
Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Wave 1: ACPT-03 edge gaps — shared D6-09 invariant helper (`_edge-invariant.ts`) + high-zoom spec (400% + 320 CSS px reflow, D6-10) + font-failure spec (block/delay/swap via injected `@font-face` + `page.route`, D6-11)
- [x] 06-02-PLAN.md — Wave 1: ACPT-01 consolidated core-reading-flow spec across the 6-fixture corpus × 3 engines (open→read→switch→restore→highlight+navigate, D6-13) — a sibling of `open-every-fixture.spec.ts`
- [ ] 06-03-PLAN.md — Wave 1 (autonomous: false): ACPT-04 perf harness + Node CI gate mirroring `fingerprint.compare.ts` exactly + `npm run perf` + chromium-only throttled-mobile project + D6-01 measure-first budget checkpoint (placeholder budget.json → measure → propose p95+headroom → user approves → lock)
- [ ] 06-04-PLAN.md — Wave 1: ACPT-02 versioned `docs/ACCEPTANCE-PROTOCOL.md` (NVDA+Firefox + VoiceOver+Safari matrix D6-05, hybrid scripted+exploratory D6-06, zero-blocker policy D6-07, re-run flag D6-08)

**Wave 2** *(blocked on Wave 1 — needs `_edge-invariant.ts` from 06-01)*

- [ ] 06-05-PLAN.md — Wave 2: ACPT-03 audit of 4 existing edge specs (forced-colors/reduced-motion/reflow/touch-targets) against the shared D6-09 invariant (D6-12) — strengthen in place, no new files

**Wave 3** *(blocked on Waves 1–2 — final acceptance gate)*

- [ ] 06-06-PLAN.md — Wave 3 (autonomous: false): execute the ACPT-02 manual SR protocol on NVDA+Firefox + VoiceOver+Safari (zero-blocker, D6-07) + honest full-suite `npm run test` exit 0 + author `06-VERIFICATION.md` consolidating ACPT-01..04 evidence

**UI hint:** yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Canonical Article Foundation | 5/5 | Complete   | 2026-07-29 |
| 2. Accessible Scrolling Reader | 4/4 | Complete    | 2026-08-04 |
| 3. Trustworthy Layout Measurement | 2/2 | Complete    | 2026-08-05 |
| 4. Responsive Pagination and Dual-Mode Navigation | 10/11 | In Progress|  |
| 5. Durable Highlights and Notes | 7/7 | Complete    | 2026-08-07 |
| 6. Prototype Acceptance | 2/6 | In Progress|  |
