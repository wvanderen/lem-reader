# Phase 17: Reader-Owned Metadata - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 17 is the **v2.1 reader-owned-metadata phase** — readers personalize a
saved article's display title and author while canonical identity,
provenance, revision, reading position, and annotations remain untouched:

1. **META-01 — override editing.** A Library-row edit affordance opens a
   focused dialog where the reader edits display title and author as
   reader-owned overrides layered ON TOP of canonical provenance
   (`provenance.title/author` bytes stay canonical; identity, revision,
   hashes, location, and annotations are untouched).
2. **META-02 — consistency.** The effective (overridden) value is the one
   name an article has everywhere: Library rows, Reader header/document.title,
   Highlights review, Continue Reading, search, and export presentation.
3. **META-03 — clear-to-canonical.** Per-field Reset restores the canonical
   value — including restoring an ABSENT canonical author (author override
   disappears entirely, not becomes empty string).
4. **META-04 — portability + lifecycle.** Overrides migrate via Dexie
   additive versioning, cascade on article removal, and round-trip through
   a versioned export bundle with explicit conflict reporting.

**Phase 17 does NOT ship** (later phases — do not fold in):
- **Book/chapter title or author editing** — books keep canonical
  `title`/`authors[]` and chapters keep ingested titles this phase
  (D17-05/D17-06; book editing noted to backlog).
- **Reader TOC / orientation (ORNT-*)** — Phase 18.
- **Cross-block highlights (ANNO-08..12)** — Phase 19.
- **Local image fidelity (IMG-*)** — Phase 20.
- **Tag-menu adjacency / POLISH-08..11 + acceptance matrix** — Phase 21.
- **Editing from the Reader header or Highlights** — rejected entry points
  (D17-01); the Library row is the single way in.
- **Inline row editing** — rejected (D17-02 alternative).

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- Native `<dialog>`/showModal precedent (SettingsPanel, AddDialog,
  RemoveConfirm, ImportPreviewDialog): free focus trap, Esc, inert
  backdrop, focus restore, `data-initial-focus` on the non-destructive
  control. Structural-clone dialogs over shared abstractions (Pitfall 8).
- D9-14 import semantics: id-kind resolution table; ImportPreviewDialog =
  explicit per-item choice with calm defaults; identical-hash duplicates
  are calm no-ops.
- Bundle versioning discipline: union read (v1|2 today → v1|2|3), writers
  emit current major; BUNDLE_FILENAME is not the version contract
  (12-07 precedent).
- Pitfall 9 Dexie discipline: additive-only version blocks; shipped blocks
  byte-unchanged; ArticleSchema strip-mode on read (bookId precedent for
  a field Dexie stores but the canonical type doesn't carry — the pattern
  an override column may follow OR break from, per planner research).
- Byte-stable anchors + strengthen-only test changes for untouched specs;
  honest full-suite gate (`npm run test` exit 0).
- D8-06 search haystack shape; D14-07 chapter document.title format;
  D14-25 constant library h1; 13-07 LibraryRow TrashIcon anatomy
  (transparent rest, `var(--touch)` box, quiet-button tokens).

</domain>

<decisions>
## Implementation Decisions

### Edit surface & entry point (META-01)

- **D17-01: The edit trigger lives on the Library row ONLY** — an edit
  affordance beside the remove TrashIcon (13-07 anatomy precedent). The
  Reader header stays minimal (260819-qbq deliberately quieted it); no
  Reader-header or Highlights entry points.
- **D17-02: The edit interaction is a native `<dialog>` modal**
  (showModal) — the AddDialog/RemoveConfirm/ImportPreviewDialog
  precedent. Two labeled inputs (Title, Author) + calm helper copy;
  `data-initial-focus` on Cancel.
- **D17-03: Clearing an override is a per-field Reset control** — each
  field shows its own quiet Reset; canonical values are visible in the
  form (placeholders/help text) so "clear" is never ambiguous; resetting
  an author whose canonical value is ABSENT returns the article to
  "no author shown" (META-03).
- **D17-04: Calm validation — the title override must be non-empty.**
  The form refuses a blank title calmly (disabled Save or inline
  explanation); no override can ever produce an untitled article
  (canonical `provenance.title` is `min(1)`). Saving an EMPTY AUTHOR
  field is the no-author-override state, not an empty-string override.

### Scope boundary (META-01)

- **D17-05: Articles only — EPUB books do NOT get title/author editing
  this phase.** Books keep canonical `title`/`authors[]`; book editing
  is noted to the backlog. META requirements stay article-scoped.
- **D17-06: Chapter rows inside expanded books are NOT editable** —
  chapters keep ingested titles. One honest scope line: if it's not a
  top-level article row, it has no edit affordance.

### Search & canonical visibility (META-02)

- **D17-07: Search matches the OVERRIDE only.** The D8-06 haystack
  ([title, author, domain, tags]) swaps in the effective values — what
  you see is what matches. A renamed article cannot surface for its old
  name.
- **D17-08: Canonical values are visible ONLY inside the edit dialog**
  (as the Reset baseline / placeholder text). Once overridden, surfaces
  show one name — no "Originally: …" provenance lines, no subtitles.
- **D17-09: The effective value is used EVERYWHERE** — document.title,
  SectionAnnouncer, ResumeBanner, Highlights citations, Continue
  Reading, export markdown headers. One name follows the reader; no
  mixed canonical/effective surfaces.

### Conflict & survival semantics (META-04)

- **D17-10: Overrides SURVIVE same-id re-ingest.** Re-ingesting the same
  URL/HTML (D9-14 same-id upsert) updates canonical content; the
  reader's title/author override stays. Reader-owned means a refresh
  never renames the library back.
- **D17-11: Import conflicts are reported with a keep-LOCAL default.**
  A same-id article where override values differ (or exist on only one
  side) surfaces an explicit conflict row in ImportPreviewDialog;
  default resolution keeps the LOCAL override with a per-item choice to
  take the incoming one. (Mirrors the D9-14 explicit-choice shape;
  satisfies META-04's explicit conflict reporting.)
- **D17-12: Overrides travel INSIDE ArticleSchema** — optional
  reader-owned fields (e.g., `readerTitle`/`readerAuthor`) on the
  article record; export bundle bumps to v3 with the union read (v1/v2
  bundles import unchanged; writers emit 3; 12-07 discipline). No
  separate override block in the bundle.
- **D17-13: Removal cascade is atomic** — override data is deleted in
  the SAME Dexie transaction as the article + highlights + notes
  (Pitfall 10; deleteHighlight precedent). No lazy sweeps, no orphan
  window.

### the agent's Discretion

- **Storage model** — override columns on the article row (bookId
  strip-mode precedent) vs. a separate `overrides` table keyed by
  article id; either must satisfy D17-10 (survive upsert), D17-13
  (atomic cascade), and Pitfall 9 (additive-only). Researcher/planner
  decide with the D9-14/D12-03 upsert paths in view.
- **Effective-value derivation** — a pure `effectiveTitle(article)` /
  `effectiveAuthor(article)` helper module (readingState.ts precedent)
  consumed by every surface, vs. denormalized-at-write; planner's call,
  but one derivation point is strongly implied by META-02.
- **Edit affordance glyph/anatomy** — pencil-style inline-SVG icon
  (TrashIcon/GearIcon anatomy), aria-label wording, exact placement
  beside remove.
- **Dialog geometry + copy** — width, margins at 320px, 400% zoom,
  helper copy, Reset control shape (UI-SPEC; POLISH-07 token
  discipline).
- **Bundle v3 field names + conflict-row copy** — exact schema field
  names and ImportPreviewDialog conflict copy.
- **Migration test shape** — the v→v+1 migration proof and e2e
  v-old→v-new assertion style (12-03 precedent).
- **Which specs legitimately update** — LibraryRow/library/search spec
  anchors change honestly; strengthen-only for untouched specs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 17 goal + 4 success criteria (edit
  without identity change; consistency across Library/Reader/Highlights/
  search/exports; clear-to-canonical incl. absent author; migrate +
  cascade + export/import with explicit conflicts). `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — META-01..04 (§Editable Metadata);
  traceability table (Phase 17 rows).
- `.planning/PROJECT.md` — v2.1 milestone framing; Constraints
  (honesty: "no silent garbage"; annotations never silently re-attach;
  local-first portability).

### Prior-phase contracts this phase extends
- `.planning/phases/16-organized-library-and-focused-add-flow/16-CONTEXT.md`
  — D16-01..04 (native-dialog Add precedent the edit dialog mirrors;
  header-row button placement philosophy), Pitfall 9/Pitfall 8
  restatements.
- `.planning/phases/15-application-shell-and-destinations/15-CONTEXT.md`
  — D15-15/16 (context-gating: article-scoped triggers), D14-02/D14-07
  document.title contracts the effective value must feed.
- `.planning/phases/14-navigation-and-library-contracts/14-CONTEXT.md`
  — D14-20 (ONE pure policy module precedent — the effective-value
  derivation pattern), D14-25 (constant h1), D14-07 (chapter title
  format).
- v2.0 phase contexts (via STATE.md decision index) — D9-14 import
  table, D12-07 bundle union-read + book-skip semantics, D12-03
  saveBook/dexie v5 precedent, D8-06 search haystack.

### Source code contracts (READ before implementing)
- `src/content/schema.ts` — `Provenance` (L177-186: `title min(1)`,
  `author optional`), `CanonicalArticle` (L254), `BookSchema`
  (L289-290: title + authors[]) — where canonical values live and what
  must NOT change.
- `src/persistence/db.ts` — Dexie version blocks v1..v5 (Pitfall 9
  append-only discipline; the L86-97 strip-mode commentary is the
  override-storage precedent).
- `src/ingestion/library/LibraryRow.tsx` — byte-stable `title-{id}`
  heading + `.meta` author (L89-93) — the surfaces D17-07/08/09 swap to
  effective values; TrashIcon anatomy for the edit affordance.
- `src/ingestion/library/libraryFilter.ts` — D8-06 haystack (L86-90)
  where effective values enter search.
- `src/ingestion/library/LibraryView.tsx` — row action wiring,
  RemoveConfirm mounting, refreshKey pattern the edit dialog joins.
- `src/ingestion/LibrarySource.ts` — `save`/`has`/`remove` (D7-07
  dedupe + the remove transaction D17-13 extends).
- `src/portability/bundle.ts` — `ExportBundleSchema` (L40-56: version
  1|2 union, articles array, optional books) — where v3 +
  reader-owned fields land (D17-12).
- `src/portability/conflicts.ts` + `src/reader/ImportPreviewDialog.tsx`
  — resolveImportPlan + the per-item override-choice UI D17-11 extends.
- `src/portability/ExportImportService.ts`, `manifest.ts`,
  `markdown.ts` — export writers (markdown headers use effective
  values, D17-09) + manifest block discipline.
- `src/routes/ArticleView.tsx` + `src/reader/Header.tsx`,
  `SectionAnnouncer.tsx`, `ResumeBanner.tsx`, `ProgressHairline.tsx`
  — document.title/announcement consumers of the effective title.
- `src/routes/review/ReviewView.tsx` + `reviewFilter.ts` — Highlights
  citations the effective value feeds.
- `src/ingestion/library/ContinueReadingStrip.tsx` — strip title/author
  display.
- `src/ingestion/AddDialog.tsx`, `src/ingestion/library/RemoveConfirm.tsx`,
  `src/reader/SettingsPanel.tsx` — native-dialog structural-clone
  precedents (focus, Esc, `data-initial-focus`).
- `src/app.css` — POLISH-07 tokens, `.library-row-remove` /
  quiet-button styles the edit affordance mirrors.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Native-dialog machinery** — showModal + close-listener focus
  restore + `data-initial-focus` is a solved pattern in four shipped
  dialogs; the edit dialog is a structural clone (Pitfall 8).
- **`LibraryRow` action anatomy** — the 13-07 TrashIcon (inline-SVG,
  aria-label template, quiet-button tokens) is the template for the
  edit affordance beside it.
- **Pure policy-module precedent** — `readingState.ts` (D14-20) is the
  model for a single `effectiveTitle/effectiveAuthor` derivation
  consumed by every surface (structural consistency, like counts).
- **Dexie append-only migration path** — v1..v5 blocks + the 12-03
  v3→v4 hydration proof style; an override field/table follows the same
  discipline.
- **Import conflict machinery** — `resolveImportPlan` id-kind table +
  ImportPreviewDialog per-item overrides already exist; D17-11 adds a
  conflict kind, not a new paradigm.

### Established Patterns
- Reader-owned data beats re-ingested canonical data at the POLICY
  level (D17-10 mirrors how annotations survive upserts).
- One derivation point per truth (counts, reading states, filters) —
  metadata display should follow (META-02 structurally).
- Byte-stable anchors + strengthen-only tests; honest full-suite gate.
- Calm validation over silent fallback (D17-04 echoes the
  never-silently-guess honesty constraint).

### Integration Points
- `LibraryRow`/`BookRow` — edit affordance on article rows only
  (D17-01/D17-06); chapter sub-rows and book rows untouched.
- `LibraryView` — mounts the edit dialog beside RemoveConfirm; refresh
  after save re-renders rows (existing refreshKey).
- `libraryFilter` — haystack swap to effective values (D17-07).
- `ArticleView`/reader chrome + `ReviewView` + `ContinueReadingStrip` +
  `markdown.ts` — consume the effective-value derivation (D17-09).
- `bundle.ts`/`conflicts.ts`/`ImportPreviewDialog` — v3 schema,
  override conflict kind, local-default choice (D17-11/D17-12).
- `db.ts`/`LibrarySource.remove` — additive migration + atomic cascade
  (D17-13).

</code_context>

<specifics>
## Specific Ideas

- **"Reader-owned means owned"** — a refresh or re-ingest never renames
  the reader's library back (D17-10); local wins by default on import
  conflicts (D17-11).
- **"One article, one name"** — the effective value is the only name
  anywhere outside the edit dialog; canonical lives on as the Reset
  baseline, not as a second visible identity (D17-08/D17-09).
- **"What you see is what matches"** — search reads the same effective
  values the reader sees (D17-07).
- **"If it's not a top-level article row, it has no edit button"** —
  the scope line for books/chapters (D17-06).

</specifics>

<deferred>
## Deferred Ideas

- **Book title/author editing** — rejected for this phase (D17-05);
  backlog candidate (would extend the override model to `BookSchema`
  title + authors[] and per-chapter display).
- **Per-chapter title overrides** — rejected (D17-06); revisit with
  book editing.
- **Editing from the Reader header / Highlights** — rejected entry
  points (D17-01); revisit on concrete reader friction.
- **Inline row editing** — rejected (D17-02 alternative); byte-stable
  row anchors and calm focus behavior favor the dialog.
- **"Originally: …" provenance line in the Reader** — rejected
  (D17-08 alternative); canonical visibility stays dialog-only.
- **Override + canonical dual search matching** — rejected (D17-07
  alternative); find-by-old-name loses to result predictability.
- **Separate bundle override block** — rejected (D17-12 alternative);
  overrides travel inside the article record.
- **Lazy orphan sweep for removed articles' overrides** — rejected
  (D17-13 alternative); atomic cascade only.

</deferred>

---

*Phase: 17-reader-owned-metadata*
*Context gathered: 2026-08-29*
