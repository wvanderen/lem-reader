# Phase 5: Durable Highlights and Notes - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers the **local annotation layer**: readers can select supported text and create durable highlights with optional attached notes that remain anchored to their intended canonical passage across every view change — paginated/scrolling mode, repagination, typography changes, and reopening — and see an explicit ambiguous/orphaned state instead of silent reattachment when an anchor cannot be resolved confidently.

It delivers 8 requirements:
- **ANNO-01** — Reader can select supported article text and create a highlight in either reading mode.
- **ANNO-02** — Reader can attach a text note to a highlight.
- **ANNO-03** — Reader can view, edit, and delete their locally stored notes and highlights.
- **ANNO-04** — Reader can navigate from a saved annotation back to its logical passage.
- **ANNO-05** — Highlights and notes remain attached to the same normalized text across repagination, mode changes, typography changes, and reopening.
- **ANNO-06** — Annotation anchors store canonical position plus quoted context rather than page numbers, pixels, DOM paths, or serialized live ranges.
- **ANNO-07** — Reader is shown an explicit ambiguous or orphaned state when an annotation cannot be resolved confidently rather than having it silently reattached.
- **STATE-03** — Reader's highlights and notes persist locally across sessions.

**Phase 5 does NOT ship** (deferred):
- **A dedicated annotation review panel (RECV-01)** and **an explicit anchor-repair tool (RECV-02)** — **v2**. Phase 5 surfaces ambiguous/orphan states and offers delete, but the full review/repair surface is v2.
- **Heading navigator and line-focus aid (ORNT-01/02)** — **v2**.
- **Export/import of highlights and notes (PORT-01/02)** — **v2**.
- **Formal cold/warm repagination performance budgets (ACPT-04)** — **Phase 6**. Phase 5 annotation rendering must not visibly degrade repagination, but formal budget acceptance is Phase 6.

**Substrate already shipped by prior phases (pre-answered — do NOT re-ask):**
- **D-05 grapheme offsets** over `normalizeText(article)` — THE canonical passage coordinate. Every highlight anchor round-trips through this, never through page numbers/pixels/DOM paths.
- **D-06 stable id + monotonic revision** — annotation persistence keys against `[articleId+revision]`.
- **D-04 inline marks = link/code/strong/em** — defines the inline text a highlight can span.
- **`TextPositionSelector` + `TextQuoteSelector` + `deriveQuoteSelector()`** are **ALREADY IMPLEMENTED** in `src/content/normalizeText.ts:113-147` (default context radius = 32 grapheme clusters). **`resolveQuoteSelector(): TextPositionSelector | "ambiguous" | "orphan"` is STUBBED for Phase 5** (`normalizeText.ts:149-152`) — the ANNO-07 tri-state shape is pre-locked.
- **Dexie `highlights` ("id, [articleId+revision]") and `notes` ("id, highlightId") stores are ALREADY RESERVED in `db.ts:43-61`** (v1 declaration; compound key "for orphan detection"). Phase 5 populates them; the planner confirms whether a Dexie version bump is even needed (mirrors the Pitfall 9 precedent — likely NO store-shape change).
- **D2-01/D2-02** slim header + native `<dialog>` settings slide-over = the chrome the annotation drawer reuses.
- **D2-03** live-apply + debounced-save = the persistence cadence pattern notes reuse.
- **D2-09** Light/Dark/Sepia theme set the single highlight color must stay legible across.
- **D2-13 / D3-04** `.status` live region (`role="status"` + `aria-live="polite"`) reserved for consequential events — annotation save/delete announces here.
- **D4-01/D4-02** booklike fragmentation with source-offset page fragments + atomic set — the substrate highlights anchor against and render across.
- **D4-06** NO invisible click zones (Phase 4) — chosen partly so Phase 5 text selection stays unambiguous.
- **D4-10/D4-11** mode-switch/repagination anchor = top-of-view → grapheme offset → target. Phase 5 navigate-back runs this machinery in reverse.
- **STACK.md** locks: Selection/Range APIs capture ephemeral selections immediately into durable normalized-text selectors; W3C-inspired `TextPositionSelector` + `TextQuoteSelector`; **persisting DOM `Range`, XPath-only anchors, page numbers, pixels, or React component paths is FORBIDDEN**.

</domain>

<decisions>
## Implementation Decisions

### Anchor Encoding & Re-attachment Confidence (ANNO-05/06/07)

- **D5-01: Cross-revision re-attachment.** On open, highlights are looked up by `articleId` regardless of revision; the stored `TextQuoteSelector` is re-resolved against the CURRENT revision's normalized text. The `[articleId+revision]` compound key (already in `db.ts`) is the partition for orphan detection, not a strict same-revision-only lock. This is what makes ANNO-07's ambiguous/orphan states genuinely reachable (an edited passage → orphan; a duplicated passage → ambiguous). Within a single revision the text is byte-identical, so resolution is the fast confident path.
- **D5-02: Resolution rules — exact-first, then prefix/suffix disambiguation, then orphan.** `resolveQuoteSelector` resolves as: (1) find exact-substring matches of `exact` in `normalizeText(article)`; (2) unique exact → **confident** (return position); (3) N>1 exact → use prefix+suffix window to narrow to a unique surrounding match; still N>1 → **ambiguous**; (4) zero exact → fall back to prefix+suffix-only window match; unique → confident (low-certainty) / else → **orphan**. The stored `TextPositionSelector` is a **nearness hint** to prefer the closest candidate. Never silently re-attach to a wrong spot (ANNO-07).
- **D5-03: Persist BOTH position and quote.** Each highlight stores the `TextPositionSelector` (grapheme start/end, start-inclusive/end-exclusive) AND the `TextQuoteSelector` (prefix/exact/suffix). Position = O(1) primary anchor for the same-revision common case; quote = recovery substrate for the cross-revision path (D5-01). W3C Web Annotation + hypothes.is/Readwise standard. Default context radius stays at the shipped **32 grapheme clusters** (empirically tunable by researcher — see Discretion).
- **D5-04: Ambiguous/orphan = inline marker + list entry, no silent loss.** An unresolved highlight is NOT rendered as a normal inline highlight. It appears as a distinct inline "unresolved" marker (at the stored position hint for orphan / first candidate for ambiguous) AND shows as a flagged entry in the annotation drawer with its quote text so the reader sees WHAT couldn't be relocated. Delete is always available. Full re-attach/repair is the v2 RECV-02 path. Honors ANNO-07's "explicit state instead of silent reattachment."

### Highlight Creation & Selection Scope (ANNO-01)

- **D5-05: Native selection + floating toolbar.** The reader selects text with mouse/touch or keyboard (Shift+arrows); a small floating toolbar appears near the selection offering **"Highlight"** and **"Highlight + note"**. Click/Enter creates the highlight. Mirrors the Kindle/Readwise/Apple Books mental model — selection-to-action is immediate and discoverable. Must be reduced-motion-safe (A11Y-06) and keyboard-reachable (A11Y-01/07).
- **D5-06: Single contiguous run within ONE normalized-text block.** A valid selection must fit inside a single normalized-text block (one paragraph / heading / list-item / blockquote-child / caption / code-block / footnote-marker). Multi-block and cross-page selections are rejected with a small "select within one block" hint. This keeps each anchor a single clean grapheme range and sidesteps the paginated-mode "only current page mounted" problem entirely.
- **D5-07: Broad eligible set.** Highlightable: paragraph, heading, blockquote children, list-item children, figure CAPTION, code-block source, footnote-reference marker — everything with visible reading text ("if you can read it, you can highlight it"). Inline marks (link/code/strong/em per D-04) inside a prose selection ride along inside the grapheme range (a link remains active inside a highlight).
- **D5-08: Paginated-mode selection binds to the visible page fragment.** Selection + floating toolbar bind to the VISIBLE `PageFragmentView` blocks (via `data-block-index` → `article.blocks` → `normalizeText` offset). The always-mounted hidden measurement `ArticleBody` (Plan 04-08) is marked `user-select: none` so a reader never accidentally selects invisible text. The "single block" rule (D5-06) means highlights always fit on the current page. Turning away and back re-renders persisted highlights on whatever page they land on.

### Notes + View/Edit/Navigate Surface (ANNO-02/03/04)

- **D5-09: Inline popover on the highlight + a header-mounted list drawer.** Two complementary surfaces (NOT a v2 RECV-01 panel): (a) INLINE — each highlight is tappable/focusable; activating it opens a small popover with the note text + edit/delete. (b) LIST — a quiet button in the existing slim header (D2-02) opens a slide-over drawer listing all highlights+notes for THIS article in reading order, each tappable to jump back to its passage. The drawer reuses the native `<dialog>` slide-over pattern from D2-01 (focus-trap, Esc dismiss, trigger-restore). No new route.
- **D5-10: Inline editable note field in the popover.** "Highlight + note" (toolbar) creates the highlight AND opens the popover with a focused empty textarea; "Highlight" creates it without. Anytime after, activating the highlight reopens the popover with the note field editable (empty placeholder = no note; typing persists debounced, mirroring D2-03). One unified surface for create/edit. Note-bearing vs bare highlights are distinguished visually (D5-14).
- **D5-11: Navigate-back closes the drawer, jumps to the block, and focuses the highlight.** From the drawer, tapping an entry: (a) closes the drawer; (b) resolves the highlight's grapheme offset to its block via `data-block-index` (the D4-10/D4-11 anchor machinery in reverse); (c) in PAGINATED mode turns to the page containing that block; in SCROLLING mode `scrollIntoView`s the block; (d) moves focus to the highlight. Ambiguous/orphan entries (D5-04) are flagged and non-navigating. One consistent "jump to passage" behavior across both modes.
- **D5-12: Confirm-to-delete + concise status announce.** Delete is a two-step action in the popover/drawer (a "Delete" control then a confirm), with non-destructive default focus — mirrors the WipeConfirm pattern from Plan 02-02 (Pitfall 8). On create/save/delete, the existing `.status` live region announces concisely ("Highlight saved" / "Note saved" / "Highlight deleted") per A11Y-08 + the D2-13/D3-04 consequential-event pattern (debounced, not chatty). A highlight and its note are removed together (`notes.highlightId`).

### Overlap Policy & Inline Rendering (calm aesthetic + A11Y-05)

- **D5-13: Disjoint ranges only — reject overlapping new selections.** A new selection that overlaps ANY existing highlight's grapheme range is rejected with a small "overlaps an existing highlight" hint. No nesting, no partial overlaps — every highlight is a clean disjoint range. Simplest storage (no overlap/intersection math), simplest rendering (no stacked/blended marks), and the single-block rule (D5-06) keeps rejections rare. Matches the calm, predictable ethos and is far easier to keep legible under forced-colors.
- **D5-14: Single calm color + note glyph.** One quiet highlight color (a low-saturation warm marker derived from the D-07 warm-paper tokens; legible variants for Light/Dark/Sepia per D2-09) is used for EVERY highlight. Note-bearing highlights are distinguished by a small glyph/marker (an underline variant or margin dot), NOT a second color. Exposes a single semantic `--highlight` CSS token with one forced-colors override — trivially A11Y-05-safe. A multi-color palette is explicitly deferred to v2.
- **D5-15: Inline highlight = `<mark>` + `tabindex=0` + ARIA + forced-colors restyle.** Each highlight renders as a `<mark>` wrapped focusable element (`tabindex=0`, `aria-label` like "Highlight: …excerpt…" + note presence, `aria-haspopup` for the popover). The global `forced-colors` gate restyles it to a legible Windows high-contrast underline/outline via the `--highlight` token override. Focus ring uses the existing `:focus-visible` baseline. Screen readers announce "Highlight" + note presence in reading order (no duplicate active content tree — A11Y-03).
- **D5-16: Render on every page fragment containing part of the range.** In paginated mode, a single-block highlight whose block is split across a page boundary (D4-01) renders on EACH page fragment containing part of its grapheme range (each fragment gets its own `<mark>` for the visible slice, all sharing the same highlight id). If the split falls inside the highlight, both pages show the partial mark; the popover/note is reachable from either. The D4-01/D4-02 source-offset fragment model already carries per-fragment grapheme ranges, so slicing the highlight is deterministic. No silent gaps at a page turn.

### the agent's Discretion

- **Exact numeric confidence thresholds (D5-02)** — how many candidates before a state flips to "ambiguous"; whether the prefix/suffix-only fallback (zero exact) returns "confident (low-certainty)" vs a distinct 4th state. The resolution *contract* is locked; the thresholds are empirical — researcher validates against the 6-fixture corpus under simulated edits.
- **Context radius tuning (D5-03)** — the 32-grapheme default ships from Phase 1; researcher can tune against the corpus (longer = more disambiguation + more storage; within-revision exact-match always wins anyway, so this mostly affects cross-revision recovery).
- **Floating-toolbar positioning + lifecycle** — where the toolbar appears relative to the selection (above/below, edge-avoidance), how it dismisses, how it coexists with swipe-vs-zoom (A11Y-04) and the page-turn controls (D4-06). UI-SPEC.
- **Exact `--highlight` token value + note-glyph design + drawer copy/lifecycle/empty-state** — UI-SPEC refines; the single-token + glyph model is locked (D5-14).
- **Annotation Zod schema field names + Dexie version strategy** — `db.ts` already reserves the `highlights`/`notes` stores in v1; the planner confirms whether a version bump is needed at all (likely NO store-shape change — value-shape only — per the Pitfall 9 precedent). Field names/ids are architecture.
- **`resolveQuoteSelector` implementation internals** — the contract (D5-02) and return shape are locked; the matching algorithm internals (e.g. building a normalized-text index, segmenter usage) are the planner's.
- **When resolution runs** — eager batch-resolve of all article highlights on open vs. lazy resolve on render/navigate. Planner's call against perceived latency.
- **Performance under many highlights** — per-article highlight count expectations + any virtualization of the drawer list. Researcher validates against realistic counts; not an MVP budget gate (ACPT-04 is Phase 6).
- **Annotation drawer ordering/filtering** — reading-order default is locked (D5-09); any sort/filter affordances are UI-SPEC.

### Folded Todos
*None — `todo.match-phase` returned no matches for Phase 5.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision, Core Value ("calm, booklike"), Constraints (Accessibility: semantic order, reduced-motion, forced-colors; Persistence: local-first), Key Decisions table ("Include highlights and notes in the prototype … durable annotations are part of the complete local reading loop").
- `.planning/REQUIREMENTS.md` — **ANNO-01, ANNO-02, ANNO-03, ANNO-04, ANNO-05, ANNO-06, ANNO-07, STATE-03 are this phase's requirements** (§Annotations + §Local State). §Traceability maps each to Phase 5. STATE-04 (versioned/validated records) and STATE-05 (recoverable storage error) were delivered in Phase 2 and govern annotation persistence/migration.
- `.planning/ROADMAP.md` — Phase 5 goal, 4 success criteria, dependency on Phase 4.

### Stack & architecture authority
- `.planning/research/STACK.md` — locked stack. Directly governing Phase 5: **Selection/Range APIs** ("Capture user selections; Convert ephemeral DOM ranges immediately into durable normalized-text selectors. Do not persist DOM nodes, XPath-only anchors, or page numbers"); **IndexedDB via Dexie**; **W3C-inspired `TextPositionSelector` + `TextQuoteSelector`**; **`Intl.Segmenter`** (underpins the D-05 grapheme offsets); **What NOT to use:** persisted DOM `Range`/XPath/page-number/pixel anchors, Redux/Zustand, Tailwind/component suites, DOM emulators for layout truth (→ Playwright in Chromium/Firefox/WebKit).
- `AGENTS.md` — project instructions embedding STACK.md, conventions, architecture notes, GSD workflow enforcement.

### Prior-phase contracts this phase extends (READ ALL FOUR)
- `.planning/phases/01-canonical-article-foundation/01-CONTEXT.md` — **D-04** (inline marks: link/code/strong/em — what text a highlight spans), **D-05** (grapheme-offset coordinate — THE anchor substrate), **D-06** (stable id + monotonic revision — annotation persistence key).
- `.planning/phases/02-accessible-scrolling-reader/02-CONTEXT.md` — **D2-01/D2-02** (native `<dialog>` slide-over + slim header — the drawer home + focus-trap pattern), **D2-03** (live-apply + debounced save — note persistence cadence), **D2-09** (Light/Dark/Sepia — highlight color must stay legible across), **D2-13** (`.status` pattern + graceful storage failure — announce surface + STATE-05 behavior).
- `.planning/phases/03-trustworthy-layout-measurement/03-CONTEXT.md` — **D3-04** (`.status` reserved for consequential events — annotation save/delete announce), **D3-05** (DiagnosticEvent shape — potentially extended for anchor-resolution diagnostics).
- `.planning/phases/04-responsive-pagination-and-dual-mode-navigation/04-CONTEXT.md` — **D4-01/D4-02** (booklike split + atomic set + source-offset page fragments — the substrate highlights anchor against and render across), **D4-05/D4-06** (keyboard bundle + NO invisible click zones — selection stays clean), **D4-07/D4-08** (context-aware focus + N/M progress — focus precedent), **D4-10/D4-11** (anchor = top-of-view → grapheme offset → target — navigate-back runs this in reverse).

### UI design contracts (Phase 5 has UI hint: yes)
- `.planning/phases/01-canonical-article-foundation/01-UI-SPEC.md` — §Interaction patterns: reduced-motion gate, forced-colors gate, focus, status region, skip-link. Phase 5's floating toolbar, highlight popover, drawer, and ambiguous/orphan markers MUST stay consistent.
- `.planning/phases/02-accessible-scrolling-reader/02-UI-SPEC.md` — header + settings slide-over + hairline conventions Phase 5 extends (D5-09 adds the drawer to the header; the slide-over pattern is reused).
- `.planning/phases/04-responsive-pagination-and-dual-mode-navigation/04-UI-SPEC.md` — page-turn control + PaginationFallbackBanner copy/lifecycle conventions; the floating toolbar (D5-05) must coexist with the page-turn controls and respect the same calm/copy rules.

### Source code contracts (READ before implementing)
- `src/content/normalizeText.ts` — **THE anchor substrate.** `TextPositionSelector` (L117), `TextQuoteSelector` (L123), `deriveQuoteSelector(article, position, contextRadius=32)` (L133), the stubbed `resolveQuoteSelector(): TextPositionSelector | "ambiguous" | "orphan"` (L149-152 — Phase 5 implements this per D5-02), `normalizeText`/`graphemeClusters`/`blockNormalizedText`. Phase 5 MUST NOT fork normalization (Pattern 5 / Pitfall — any divergence shifts every anchor).
- `src/persistence/db.ts` (L43-61) — **Reserved Dexie stores.** `highlights: "id, [articleId+revision]"` (compound key "for orphan detection") and `notes: "id, highlightId"`. Phase 5 populates them; planner confirms version strategy (Pitfall 9 — do NOT edit shipped version blocks unless a genuine store-shape change is required).
- `src/content/schema.ts` — Block union, `CanonicalArticle`, `ReaderSettingsSchema`. The new `HighlightRecord`/`NoteRecord` Zod schemas are added here (single source of truth). Annotations are validated at the boundary (STATE-04).
- `src/content/types.ts` — `Block`, `InlineRun`, `CanonicalArticle` types the annotation DOM-overlay walks.
- `src/content/render/BlockRenderer.tsx` — `BlockView` exhaustive switch + `ArticleBody`. **The inline `<mark>` highlight overlay renders INTO these same blocks** (D5-15) — Phase 5 must not fork a parallel renderer (DOC-02 reading order + D-05 offset integrity depend on reusing the same semantic output).
- `src/content/render/InlineRenderer.tsx` — inline-mark rendering (link/code/strong/em) that a highlight overlay must coexist with (a link stays active inside a highlight — D5-07).
- `src/routes/ArticleView.tsx` — the reader route + mode-aware branching point. Selection capture (D5-05/D5-08), popover mount (D5-09/D5-10), navigate-back landing (D5-11), and drawer integration all coordinate here.
- `src/pagination/fragmentRenderer.tsx` — `PageFragmentView` where cross-fragment highlight rendering lands in paginated mode (D5-16).
- `src/pagination/anchor.ts` — D4-10/D4-11 anchor helpers (top-of-view → grapheme offset → target). Navigate-back (D5-11) reuses these in reverse.
- `src/pagination/types.ts` — `PageFragment` / source-offset fragment model the cross-fragment slicing reads.
- `src/reader/Header.tsx` — slim persistent header (D2-02) where the annotations-drawer button mounts (D5-09).
- `src/settings/SettingsContext.tsx` — debounced-save (D2-03) + `applyTheme` token-write patterns the note persistence + `--highlight` token reuse.
- `src/app.css` — `:root` custom properties (where the `--highlight` token lives), global `prefers-reduced-motion` + `forced-colors` gates, `.status` / `.visually-hidden` / `:focus-visible` baseline. All annotation affordances inherit these gates.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/content/normalizeText.ts` — **the anchor substrate is already built.** `deriveQuoteSelector()` + the `resolveQuoteSelector` tri-state contract ship from Phase 1; Phase 5 implements `resolveQuoteSelector` and the persistence/rendering around it. No normalization to invent.
- `src/persistence/db.ts` — **the Dexie stores are already reserved + typed.** `highlights` (compound `[articleId+revision]` key) and `notes` (`highlightId`) are declared with definite-assignment `!` annotations; Phase 5 writes records, not schema reservations.
- `src/content/render/BlockRenderer.tsx` + `InlineRenderer.tsx` — the semantic renderer the `<mark>` overlay extends. Highlight rendering layers onto the existing block/inline output rather than forking it.
- `src/pagination/anchor.ts` + `src/pagination/types.ts` — the source-offset → grapheme-offset → block-target machinery. Navigate-back (D5-11) and the visible-page selection binding (D5-08) reuse `data-block-index` ↔ `article.blocks` ↔ `normalizeText` offset.
- `src/reader/Header.tsx` — the slim header (D2-02) already hosts the gear + mode-toggle; the annotations-drawer button is a natural sibling (D5-09).
- `src/settings/SettingsContext.tsx` — the debounced-save + dual-event-flush pattern (Plan 02-02) is the template for note persistence (D5-10). `applyTheme`'s `:root` token write is the template for the `--highlight` token (D5-14).
- `src/app.css` — the `forced-colors` + `prefers-reduced-motion` gates and `:focus-visible` baseline are already global; the `<mark>` highlight + popover + drawer inherit them (D5-15).

### Established Patterns
- **Zod-at-boundary validation** (`schema.ts` is single source of truth) — every persisted `HighlightRecord` / `NoteRecord` is validated on read AND write (STATE-04).
- **W3C Web Annotation selectors over normalized text** (STACK.md) — `TextPositionSelector` + `TextQuoteSelector`; persisting DOM `Range`/XPath/page-number/pixel anchors is FORBIDDEN.
- **Native `<dialog>` for slide-over panels** (D2-01, Plan 02-01) — the annotations drawer reuses this for free focus-trap / Esc / trigger-restore / inert-backdrop.
- **React context, no Redux/Zustand** — annotation state flows through React context/local state; Dexie is the persistence seam.
- **Authored CSS + custom properties, no Tailwind** — highlights, popover, drawer, toolbar are authored CSS bound to custom properties (e.g. `--highlight`).
- **Confirm-the-destructive-action with non-destructive default focus** (WipeConfirm, Plan 02-02, Pitfall 8) — the delete confirm (D5-12) mirrors this exactly.
- **`.status` live region for consequential events** (D2-13/D3-04) — annotation save/delete announces here (A11Y-08).
- **Exhaustive block-kind switch, no default** (BlockRenderer, chooseStrategy) — any per-kind annotation eligibility/overlay logic uses the same Pattern F so TS flags missing cases.
- **Playwright across Chromium/Firefox/WebKit for layout/accessibility truth** — annotation rendering (esp. cross-fragment slicing D5-16, forced-colors D5-15, selection capture D5-08) MUST be validated in real browsers across the 6-fixture corpus × theme × mode matrix, NOT in a DOM emulator.

### Integration Points
- **`ArticleView`** (`src/routes/ArticleView.tsx`) — selection-capture listener (D5-05), mode-aware popover/drawer coordination (D5-09/D5-10), navigate-back landing + focus (D5-11). The hidden measurement `ArticleBody` (Plan 04-08) gets `user-select: none` (D5-08).
- **`PageFragmentView` / `fragmentRenderer.tsx`** — cross-fragment highlight slicing (D5-16) reads each fragment's source-offset range.
- **`BlockRenderer` / `InlineRenderer`** — the `<mark>` overlay (D5-15) is applied as the blocks/inlines render.
- **Dexie `highlights` / `notes`** (`src/persistence/db.ts`) — the persistence seam (populated by Phase 5).
- **`schema.ts`** — new `HighlightRecord` / `NoteRecord` Zod schemas (D5-03) + STATE-04 boundary validation.
- **`Header`** (`src/reader/Header.tsx`) — the drawer-trigger button (D5-09).
- **`.status` live region** (D2-13/D3-04) — save/delete announce (D5-12) + orphan/ambiguous surfacing coordination (D5-04).
- **`:root` + `app.css`** — the `--highlight` token (D5-14) and its forced-colors override (D5-15).
- **The Playwright e2e harness** (Phases 1/3/4) — annotation correctness (anchor round-trip, cross-fragment render, selection scope, ambiguous/orphan surfacing, forced-colors) extends this pattern.

</code_context>

<specifics>
## Specific Ideas

- **"Calm, booklike" extends to highlights.** A single quiet warm marker (D5-14), never loud multi-color; a highlight is a gentle margin note in the reader's book, not a neon sticker. This is the aesthetic wedge carrying from Phases 1-4.
- **Selection-to-action mental model = Kindle / Readwise / Apple Books** (D5-05): select text → a small floating toolbar appears → one tap to highlight or highlight+note. Familiar to the target reader.
- **Position+quote persistence = W3C Web Annotation / hypothes.is standard** (D5-03): position is the fast everyday anchor; quote is the recovery substrate. The two-selector pair is the reason highlights survive article revisions.
- **Navigate-back reuses the Phase 4 anchor machinery in reverse** (D5-11): the same top-of-view → grapheme-offset → block-target transform that preserves the reader's place across mode-switch/repagination now carries them from a list entry back to the passage — one consistent passage-location principle across the whole product.
- **Delete mirrors WipeConfirm** (D5-12): two-step confirm with non-destructive default focus — an accidental Enter never destroys a highlight/note.
- **"If you can read it, you can highlight it"** (D5-07): the broad eligible set reflects the accessibility-first reader who is actually marking the technical-post code, the figure caption, and the footnote — not just paragraphs.
- **No silent gaps at a page turn** (D5-16): a split-block highlight shows on both pages, matching the reader's mental model that the passage is one continuous thing the pagination merely sliced for display.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases (confirmed, not new):
- **Dedicated annotation review panel (RECV-01)** and **explicit anchor-repair tool (RECV-02)** → **v2**. Phase 5 surfaces ambiguous/orphan + offers delete (D5-04); the full review/repair surface is v2.
- **Multi-color highlight palette** → **v2** (explicitly rejected for MVP in favor of the single calm color — D5-14).
- **Multi-block / cross-page selections** → **v2** (explicitly out of MVP per the single-block rule — D5-06).
- **Highlight overlap / nesting** → **v2** (explicitly out of MVP — disjoint ranges only, D5-13).
- **Export/import of highlights & notes (PORT-01/02)** → **v2**.
- **Heading navigator and line-focus aid (ORNT-01/02)** → **v2**.
- **Formal cold/warm repagination performance budgets (ACPT-04)** → **Phase 6**. Phase 5 annotation rendering must not visibly degrade repagination, but formal budget acceptance is Phase 6.

</deferred>

---

*Phase: 5-durable-highlights-and-notes*
*Context gathered: 2026-08-07*
