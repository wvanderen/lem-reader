# Phase 10: Annotation Review Panel - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

> **Provenance note:** All decisions below were made by the agent under explicit
> user delegation (user dismissed the interactive gray-area selection and said
> "continue", consistent with the session's delegation pattern and `mode: yolo`).
> Every decision is grounded in a cited prior-phase precedent. The user may edit
> this file before `/gsd-plan-phase 10` — nothing here is user-confirmed verbatim.

<domain>
## Phase Boundary

A dedicated cross-article surface listing every highlight (with its attached
note) in the library — RECV-01. The reader can jump from any row to the
highlight's location in the reader and back (bidirectional), filter by
article/tag/confidence, sort by date/article/position, see honest
confident/ambiguous/orphan tri-state, and curate in place (edit note, delete
highlight). RECV-02 (explicit anchor repair) stays deferred — tri-state is
display + curation only.

</domain>

<decisions>
## Implementation Decisions

### Surface & navigation

- **D10-01: The review panel is a third hash route — `#/review` — not a modal.**
  SC#1 calls for a "dedicated panel"; SC#2's bidirectional jump needs working
  browser-back, which hash history gives for free. D2-01's "two-view router"
  decision kept *Settings* a panel; it was never a hard route cap — and Phase 8
  already made LibraryView the `#/` route. The router regex gains one
  alternative; the Gap 3 `#/`-prefix guard is unchanged.
- **D10-02: Entry point is a "Review highlights" button in the LibraryView
  header cluster** (alongside existing library controls; same button styling
  tokens). No second entry point in Phase 10 — ArticleView already has the
  per-article AnnotationsDrawer.
- **D10-03: Jump-to-location extends the article route grammar to
  `#/article/<id>/h/<highlightId>` (optional suffix).** ArticleView, on mount
  with an `h` param, resolves the highlight's position selector and scrolls to
  it using the EXISTING D5-11 machinery (fragmentContainingOffset/commitTurn in
  paginated mode; findScrollTarget/scrollIntoView + focus the `<mark>` in
  scrolling mode — exactly what AnnotationsDrawer.onNavigate does today), then
  `replaceState`-strips the suffix so refresh does not re-jump. Deep-linkable,
  e2e-testable, zero new state-handoff mechanisms. Browser Back returns to
  `#/review` (SC#2 bidirectional satisfied by history, not bespoke state).
  Orphan rows (no article) are not jumpable — their row shows the quote text
  itself (the only remaining copy) and no jump affordance.

### List layout & rows

- **D10-04: Grouped-by-article sections, not a flat chronological list.** Each
  group: article title (+ source host, subtle) with its highlights beneath,
  ordered by position. Mirrors the highlights Markdown export's per-article
  grouping (D9-07) and matches the "curate across the library" mental model.
- **D10-05: Orphaned highlights render in a trailing group titled "Highlights
  without an article"** — the D9-09 never-drop ghost-section precedent from the
  export, now in the UI. They are first-class rows (curatable, filterable via
  confidence=orphan) and never silently hidden.
- **D10-06: Row anatomy (calm, drawer-entry precedent):** whole-row button
  jumps (AnnotationsDrawer's `<button class="drawer-entry">` pattern);
  quote excerpt in blockquote styling; note preview line when a note exists
  (truncated, drawer truncation limits); date (short form); tri-state badge.
- **D10-07: Tri-state badge renders ONLY for ambiguous and orphan rows.**
  Confident is the default calm state — absence of badge = confident. The
  confidence filter's three explicit options carry the vocabulary; a legend
  line under the filter row states "no badge = anchored confidently" so the
  absence is honest, not silent.

### Filter & sort controls

- **D10-08: One filter row + one sort select, reusing Phase 8 vocabulary:**
  tag chips (the TagFilter component as-is), an article `<select>` (chips do
  not scale to library size), and a confidence `<select>`
  (All/Confident/Ambiguous/Orphan). Filters AND together. Sort `<select>`:
  Date (newest first — DEFAULT), Article (title alpha, position within), Position (article order, offset within).
- **D10-09: Filtering/sorting must reuse the `filterLibrary` derivation
  pattern** (derived `visibleItems` via pure function over `{allItems,
  filters, sort}`) — pure, unit-testable, no effect chains.
- **D10-10: Empty states are honest and specific (DOC-06):** no highlights at
  all → "No highlights yet. Highlights you make while reading appear here."
  Filters produce zero rows → "No highlights match these filters." Both via
  the `.status` live-region pattern for SR parity.

### Curation actions

- **D10-11: Edit note in place via the NotePopover inline pattern** (the
  popover opens anchored to the row; save/delete-note reuse `saveNote`/
  `deleteNote`). Editing an orphan's note is allowed (notes are keyed to
  highlightId; no article needed).
- **D10-12: Delete highlight uses a RemoveConfirm-style native `<dialog>`
  confirmation** stating that the attached note is removed with it (Phase 8
  remove-cascade precedent; `deleteHighlight` + `deleteNote` in one flow).
  The write fires ONLY in the Proceed handler (Pitfall 8 discipline).
  Result announced via `.status` live region in calm voice
  ("Highlight removed."). No bulk actions.
- **D10-13: The panel re-derives tri-state on load** by resolving each
  highlight against its article's normalized text via
  `resolveQuoteSelectorInText` (memoized per article — the Phase 9 conflicts
  memoization pattern). Resolution state is display-only; RECV-02 repair is
  out of scope.

### the agent's Discretion

- Exact copy strings (calm DOC-06 voice), CSS spacing/typography details,
  whether group headers are sticky, badge visual treatment (tokens only), and
  the short-date format.
- Long-list performance: no virtualization in Phase 10 unless the planner's
  research finds a corpus-scale risk; a plain list with grouped sections is
  the baseline (prototype scale: tens of articles).
- Whether the article `<select>` groups or flat-sorts by title.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Precedent components (the panel is their cross-article generalization)
- `src/reader/annotations/AnnotationsDrawer.tsx` — per-article list, whole-row
  jump buttons, truncation limits, empty state, navigate-back
- `src/reader/annotations/NotePopover.tsx` — note edit affordance pattern
- `src/ingestion/library/RemoveConfirm.tsx` — destructive-confirm dialog
  pattern (Pitfall 8: data-initial-focus on non-destructive action)
- `src/ingestion/library/LibraryView.tsx` + `src/ingestion/library/libraryFilter.ts`
  + `src/ingestion/library/tagsStore.ts` — filter-row derivation pattern,
  TagFilter chips, loadAll tags
- `src/portability/markdown.ts` — per-article grouping + "Highlights without
  an article" ghost section + tri-state footers (layout vocabulary to mirror)

### Router & jump machinery
- `src/App.tsx` — hash router regex, Gap 3 guard, two-view swap; the `#/review`
  route and `#/article/<id>(/h/<hid>)?` grammar extend it
- `src/routes/ArticleView.tsx` — D5-11 jump path
  (fragmentContainingOffset/commitTurn vs findScrollTarget/scrollIntoView →
  focus `<mark>`), location-restore effect shape the `h`-param jump reuses
- `src/pagination/anchor.ts` — fragmentContainingOffset

### Data & resolution
- `src/persistence/highlightsStore.ts` — `loadAllHighlights` (Phase 9 bulk
  loader), `deleteHighlight`
- `src/persistence/notesStore.ts` — `loadAllNotes`, `saveNote`, `deleteNote`
- `src/annotations/resolution.ts` — `resolveQuoteSelectorInText` tri-state
  contract (ANNO-07 never silently re-attach)
- `src/content/normalizeText.ts` — normalized text source for re-derivation
- `src/content/schema.ts` — HighlightRecord/NoteRecord/ArticleSchema shapes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `loadAllHighlights`/`loadAllNotes` (Phase 9) — the whole read side exists
- `resolveQuoteSelectorInText` + per-article memoization (Phase 9 conflicts
  pattern) — tri-state re-derivation is composition, not new logic
- `TagFilter` component — tag chips as-is
- D5-11 jump machinery + `<mark>` focus — already proven in e2e

### Established Patterns
- Pure filter derivation (`filterLibrary` shape) — D10-09
- Native `<dialog>` + showModal + focus discipline for confirms
- `.status` live region (role=status, aria-live=polite, aria-atomic) for all
  results; calm DOC-06 copy
- Authored CSS with tokens only (no hardcoded colors — the Phase 9 audit bar)

### Integration Points
- `App.tsx` router: add `#/review` view + extended article-route regex
- LibraryView header: "Review highlights" entry button
- ArticleView mount: consume `/h/<hid>` param → jump → strip suffix

</code_context>

<specifics>
## Specific Ideas

No specific references from the user this phase (delegated session). The
strongest implicit reference: the Phase 9 highlights Markdown export already
fixed the grouping/tri-state/ghost-section vocabulary — the panel should feel
like the interactive twin of that document.

</specifics>

<deferred>
## Deferred Ideas

- **RECV-02 anchor repair UI** — future requirement (REQUIREMENTS.md Future).
- **Bulk select/delete in the panel** — new capability; own future item.
- **Export-from-panel button** — redundant with Settings export (09-05);
  adding it here would duplicate surface.
- **Full-text search within highlight quotes** — search belongs to the
  library-level search story (Future: Library extended).

</deferred>

---

*Phase: 10-annotation-review-panel*
*Context gathered: 2026-08-15*
