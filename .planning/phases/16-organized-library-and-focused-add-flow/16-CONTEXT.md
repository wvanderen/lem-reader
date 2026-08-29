# Phase 16: Organized Library and Focused Add Flow - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 16 is the **v2.1 organization + focused-add phase** — readers find
content inside their reading-state views and add material through a
focused, recoverable workflow:

1. **LIB-09 — narrowing feedback.** Search + tag filters already compose
   WITHIN the selected view (state filter runs before query/tag — shipped
   structurally in Phase 14). This phase adds the honest feedback layer:
   a filtered-to-zero view gets a calm no-matches treatment, never
   masquerading as the membership empty state.
2. **LIB-10 — Continue Reading treatment.** The strip complements the
   library organization: it renders on the All view only, its surface
   otherwise unchanged.
3. **ADD-01 — focused Add surface.** The three permanently-mounted
   ingestion forms leave the Library page; a native `<dialog>` modal
   (showModal) opened from a Library-page button becomes the focused
   Add-to-Library workflow.
4. **ADD-02 — source choice.** A 3-way source-first radio picker
   (Web address / Paste text / Upload file); only the selected source's
   input renders. Upload file keeps one combined picker with extension
   dispatch.
5. **ADD-03 — recovery.** Cancel/retry/recover without losing useful
   input, duplicates, or the honest `mapReasonToCopy` refusal reasons.
6. **ADD-04 — predictability.** Focus, dismissal, success, narrow-width,
   and high-zoom behavior ride the native-dialog precedent.

**Phase 16 does NOT ship** (later phases — do not fold in):
- **Reader-owned metadata editing (META-*)** — Phase 17.
- **Reader TOC / orientation (ORNT-*)** — Phase 18.
- **Cross-block highlights (ANNO-08..12)** — Phase 19.
- **Local image fidelity (IMG-*)** — Phase 20.
- **Tag-menu adjacency / reading-width / POLISH-08..11 + acceptance
  matrix** — Phase 21.
- **Shell changes** — the shell keeps exactly two destinations
  (D15-08 stands; Add is NOT a shell/header trigger — D16-02).

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- Views are hash routes (`#/unread`, `#/in-progress`, `#/finished`);
  replaceState switching; membership from the ONE `readingState.ts`
  policy module (D14-12/13/20); counts in switcher accessible names
  (D14-23); per-view empty states keyed on MEMBERSHIP, not filtered
  visibility (D14-26); constant h1 "Saved articles" (D14-25).
- `librarySession.ts` session restore (D15-11..14): filters + scroll +
  row focus restore view-matched. The Add dialog never unmounts the
  Library, so restore is structurally unaffected.
- Native `<dialog>`/showModal precedent (SettingsPanel, RemoveConfirm,
  BookRemoveConfirm, ImportPreviewDialog): free focus trap, Esc,
  inert backdrop, focus restore; `data-initial-focus` on the
  non-destructive control (WipeConfirm discipline).
- `mapReasonToCopy` calm DOC-06 refusal copy + D7-07 dedupe-refuse
  (`has()`/`hasBook()` BEFORE save) survive the redesign unchanged
  (ADD-03 locks this).
- G2 file-picker reset discipline (Plan 13-08): the picker resets at
  every terminal outcome so same-file re-pick always re-fires.
- Byte-stable anchors + strengthen-only test changes (legitimate
  surface changes this phase owns honestly); honest full-suite gate
  (`npm run test` exit 0); Pitfall 9 Dexie discipline (NO store
  changes expected this phase).

</domain>

<decisions>
## Implementation Decisions

### Add surface & entry point (ADD-01)

- **D16-01: The focused Add workflow is a native `<dialog>` modal**
  (showModal) — matches the SettingsPanel/RemoveConfirm/
  ImportPreviewDialog precedent. Free focus trap, Esc-dismissal,
  inert backdrop, and focus restore give most of ADD-04 structurally.
  No route grammar change; the Library never unmounts behind it.
- **D16-02: The trigger is a Library-page button only** — no
  shell-header trigger; the 48px shell stays exactly two destinations
  (D15-08 confirmed permanent). Add is library-scoped (D15-15
  context-gating philosophy); the shell avoids the ≤639px crowding
  problem entirely.
- **D16-03: The Add button sits BESIDE the h1 in the library header
  row** (the old Review-highlights button position). The near-empty
  "add content" section dissolves; the library-load `.status` live
  region survives (byte-stable anchor — it is the list's
  "Opening article…" / "Couldn't open this article" surface, not an
  ingest surface).
- **D16-04: The empty All view routes readers to Add via copy only** —
  the header-row button is the single way in; the empty-state words
  point to it (exact copy = planner/UI-SPEC). No second inline button.

### Source picker & inputs (ADD-02)

- **D16-05: Source choice is a visible 3-way source-first picker —
  Web address / Paste text / Upload file** — then ONLY the selected
  source's input renders. No detection magic; explicit choice.
  Native fieldset/radio semantics (the TagEntry discipline); NOT
  tabs (tablist machinery D14-22 deliberately avoided).
- **D16-06: Upload file keeps ONE combined picker**
  (`accept=".md,.html,.pdf,.epub"`) with today's extension dispatch +
  per-format size caps (PDF_MAX_BYTES / EPUB_MAX_BYTES / 5MB). No
  per-format sub-choices.
- **D16-07: Input survives source switches until the dialog closes** —
  typed URL/paste text and a picked file are kept across switches
  within one dialog session; no silent loss (the ADD-03 spirit
  applied to navigation inside the workflow).
- **D16-08: The dialog always opens on Web address** — no persistence,
  no last-used-source memory (mirrors D14-14's no-persistence stance;
  predictable every open).

### Recovery & success flow (ADD-03, ADD-04)

- **D16-09: Dedupe-refuse stays a calm refusal message only** —
  "Already in your library." via the existing copy; NO "Open it"
  action; no surprise navigation.
- **D16-10: No dismissal while a submission is in flight** — the
  dialog blocks (Esc + close controls inert) until the request
  settles; then retry/close are available. No zombie requests, no
  "did it save?" ambiguity, no duplicate re-submission risk.
- **D16-11: File retry keeps the G2 reset discipline** — on failure
  the pick clears, the refusal reason stays visible, and retry =
  re-pick the same file. URL/paste text is preserved across
  failures (never cleared by an error).
- **D16-12: Success behavior splits by kind (today's contract):**
  an article success closes the dialog and opens the article in the
  reader (`#/article/<id>`); a book success closes the dialog and
  lands on the Library where the new book row now is (with the
  D12-11 skip disclosure preserved when skippedCount > 0).

### Library organization polish (LIB-09, LIB-10)

- **D16-13: Filtered-to-zero shows a calm no-matches line + a
  clear-filters affordance** — visually/copy distinct from the
  per-view membership empty states (D14-26: filtered-out ≠ empty
  view); clearing resets query and/or active tag. Exact copy =
  planner/UI-SPEC.
- **D16-14: The Continue Reading strip renders on the All view
  ONLY.** On In-progress it duplicated the first rows; on
  Unread/Finished it showed items absent from the view. All is the
  "everything" overview where recency belongs.
- **D16-15: The strip's own surface is unchanged** — cap 3, single
  column, title/author/hairline rows, policy-driven membership
  (D14-20). LIB-10 is satisfied by placement, not a redesign.
- **D16-16: View-switcher counts ALWAYS show membership totals**
  (D14-23 unchanged) — never filtered counts. A search narrowing the
  visible rows never rewrites what "Unread (3)" means.

### the agent's Discretion

- **Dialog component architecture** — new `AddDialog` component vs
  in-place refactor of `IngestControl`; either way the three-form
  `IngestControl` retires from `LibraryView`. The ingest seams
  (`IngestionClient`, `mapReasonToCopy`, `dexieLibrarySource.has/save`,
  `hasBook`/`saveBook`, `bytesToBase64`) are reused, not forked.
- **Dialog open-state location** — LibraryView-local state (the
  trigger is in-page; settingsOpen is App-level only because the
  header triggers it) or App-lifted; planner's call.
- **Picker + dialog geometry** — dialog width/max-width, margins at
  320px, 400% zoom behavior (UI-SPEC; POLISH-07 token discipline
  extends to the new surface).
- **Radio group markup details** — fieldset/legend/radio exact shape,
  labels, helper copy per source ("Accepts .md, .html, PDF, and EPUB
  books" style hints).
- **In-flight blocking mechanics** — how close listeners are gated
  during `submitting` (cancel-event prevention vs disabled close
  controls).
- **Book-success landing mechanics** — refreshKey re-trigger, whether
  focus lands on the new row or the h1 (D14-05 layering applies).
- **No-matches + clear-filters control shape** — link vs button vs
  chip-dismiss; aria wiring.
- **Status live-region placement inside the dialog** — mirrors the
  IngestControl `.status` discipline; exact DOM position is free.
- **Test migration** — `IngestControl.test.tsx` + `happy-path.spec.ts`
  anchor updates are legitimately owned by this phase; strengthen-only
  applies to untouched specs; honest full-suite gate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 16 goal + 5 success criteria
  (narrowing without contradiction; Continue Reading complements;
  focused Add with every source + relevant-only inputs;
  cancel/retry/recover; predictable focus/dismissal/success/narrow/
  zoom). `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — LIB-09/LIB-10 (§Library Organization),
  ADD-01..04 (§Add Workflow); traceability table (Phase 16 rows).
- `.planning/PROJECT.md` — v2.1 milestone framing; Key Decisions;
  Constraints (a11y foundational, honesty, local-first, calm).

### Prior-phase contracts this phase extends
- `.planning/phases/14-navigation-and-library-contracts/14-CONTEXT.md`
  — D14-12..26 (view routes, counts, membership empty states, the
  policy module) that LIB-09's feedback layer and D16-16 build on.
- `.planning/phases/15-application-shell-and-destinations/15-CONTEXT.md`
  — D15-08 (two-destination shell — confirmed permanent by D16-02),
  D15-11..14 (librarySession restore the dialog must not disturb),
  D15-15/D15-16 (context-gating), POLISH-07 token discipline.

### Source code contracts (READ before implementing)
- `src/ingestion/IngestControl.tsx` — the retiring 460-line three-form
  control: the four-state machine, `mapReasonToCopy` (EXPORTED,
  byte-pinned by pdf-copy/epub-copy tests), `bytesToBase64`,
  extension-aware caps, G2 `resetFilePick` seam, dedupe-refuse paths.
- `src/ingestion/IngestionClient.ts` — the five ingest functions
  (`ingestUrl/Html/Markdown/Pdf/Epub`) + `IngestionError`; reused
  verbatim by the new dialog.
- `src/ingestion/LibrarySource.ts` + `src/persistence/booksStore.ts` —
  `has`/`save` + `hasBook`/`saveBook` (the D7-07 dedupe seams).
- `src/ingestion/library/LibraryView.tsx` — the trigger's landing zone
  (header row L538-549), the retiring add section (L560-574), the
  `.status` byte-stable anchor, filter composition (L462-527), the
  empty-state branch the no-matches line extends (L620-631), and the
  `view` prop that gates the strip (D16-14).
- `src/ingestion/library/ContinueReadingStrip.tsx` — the unchanged
  strip surface; needs the All-only gate threaded from `view`.
- `src/ingestion/library/libraryFilter.ts` — `filterLibrary`/
  `filterBooks` (already compose within view — unchanged).
- `src/ingestion/library/LibrarySearch.tsx`, `TagFilter.tsx` — the
  filter controls the clear-filters affordance resets.
- `src/ingestion/library/librarySession.ts` — restore seam the dialog
  must not disturb (library never unmounts).
- `src/reader/SettingsPanel.tsx` — the native-dialog precedent:
  showModal + explicit focus on first control + close-listener focus
  restore (02-01) + the ImportPreviewDialog data-initial-focus
  discipline.
- `src/ingestion/library/RemoveConfirm.tsx` — the compact
  structural-clone dialog pattern (Pitfall 8 isolation).
- `src/app.css` — library section styles, `.ingest-control`, dialog
  styles, POLISH-07 tokens the new surface must consume.
- `tests/component/IngestControl.test.tsx`,
  `tests/e2e/ingestion/happy-path.spec.ts` — the anchor surfaces this
  phase legitimately updates; `tests/unit/pdf-copy.test.ts` +
  `tests/unit/epub-copy.test.ts` pin `mapReasonToCopy` byte-for-byte.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`IngestionClient.ts` + `mapReasonToCopy`** — the entire ingest
  service boundary + honest-refusal copy map move into the dialog
  unchanged; the copy tests keep pinning the same export.
- **Native dialog precedents** — SettingsPanel (showModal, first-
  control focus, close-restore), RemoveConfirm/BookRemoveConfirm
  (structural clones, `data-initial-focus` on cancel), the 02-01
  WebKit no-auto-focus lesson.
- **`.status` live-region pattern** (`role="status"` + `aria-live` +
  `aria-atomic`) — reused inside the dialog for submitting/error copy.
- **`libraryFilter.ts`** — the pure compose-within-view filter already
  satisfies LIB-09's no-contradiction contract; zero changes needed.
- **`readingState.ts` + `countByState`** — membership + counts stay
  the single derivation (D16-16).
- **`librarySession.ts`** — untouched; the dialog keeps the Library
  mounted so capture/restore semantics hold.

### Established Patterns
- Controlled inputs with lifted state; `hasFile` React-state mirror
  for the file picker (refs are not reactive).
- G2 reset discipline at every terminal outcome (13-08).
- Four-state machine (idle/submitting/success/error) — carries over
  as the dialog's submission spine.
- Byte-stable anchors + strengthen-only tests; honest full-suite gate.
- Pitfall 8 destructive-call isolation; Pitfall 9 additive-only Dexie
  (no schema changes this phase).

### Integration Points
- `LibraryView.tsx` — header row gains the Add button; add section
  dissolves (`.status` survives); empty-state copy swap; no-matches
  line branch beside the membership-empty branch; `view` prop gates
  `ContinueReadingStrip` (All only).
- `App.tsx` — likely unchanged (no route grammar change); dialog open
  state can stay LibraryView-local.
- `src/app.css` — dialog + radio-picker + no-matches styles on
  POLISH-07 tokens.
- `tests/` — component tests migrate from IngestControl to the Add
  dialog; library specs gain no-matches + strip-gating assertions.

</code_context>

<specifics>
## Specific Ideas

- **"No detection magic"** — the source choice is always visible and
  explicit (D16-05); predictability over cleverness.
- **"One trigger, one behavior"** — the header-row Add button is the
  only way in (D16-02/D16-04); the empty state points at it rather
  than duplicating it.
- **"Counts never lie about membership"** — D16-16 keeps switcher
  counts derivation-pure even mid-search.
- **"The dialog owns its busy state"** — while submitting, dismissal
  is impossible (D16-10); the reader is never left wondering whether
  a save landed.

</specifics>

<deferred>
## Deferred Ideas

- **Shell-header Add trigger** — rejected (D16-02); revisit only if
  readers report friction adding from Reader/Highlights context.
- **Smart single input with URL detection** — rejected (D16-05
  alternative).
- **Per-format file pickers after choosing Upload** — rejected
  (D16-06 alternative).
- **Remembering last-used source** — rejected (D16-08), including the
  session-scoped middle ground; revisit on concrete reader demand.
- **Dedupe-refuse "Open it" action** — rejected (D16-09); revisit if
  re-adding existing items becomes a frequent flow.
- **Dismissible-during-flight dialog** — rejected (D16-10).
- **Filtered counts in the view switcher ("1 of 3")** — rejected
  (D16-16).
- **Continue Reading on non-All views / hide-when-duplicating** —
  rejected (D16-14); strip redesign beyond placement — rejected
  (D16-15).
- **Metadata editing, TOC, cross-block highlights, images, POLISH-08+
  audits** — Phases 17-21 (not this phase).

</deferred>

---

*Phase: 16-organized-library-and-focused-add-flow*
*Context gathered: 2026-08-29*
