# Phase 17: Reader-Owned Metadata - Research

**Researched:** 2026-08-29
**Domain:** Client-side metadata overrides on a Zod-validated local document model (Dexie persistence + versioned export/import bundle)
**Confidence:** HIGH

## Summary

Phase 17 layers reader-owned `readerTitle`/`readerAuthor` overrides on top of canonical
`provenance.title`/`provenance.author`. This is an **additive-extension phase of an
existing, heavily-contracted codebase**, not a new-technology phase: no new packages, no
new services, no new architectural tiers. Every mechanism the phase needs already ships
and is test-proven — the work is extending five load-bearing contracts in place:
`ArticleSchema` (Zod), the effective-value derivation surface (11 consumer sites
enumerated below), `resolveImportPlan`/`ImportPreviewDialog` (conflict machinery),
`ExportBundleSchema` (v1|2 → v1|2|3 union), and the `LibraryRow`/dialog UI grammar.

The decisive technical finding: **every Dexie read passes through
`ArticleSchema.safeParse` (Zod strip mode)**, so override fields MUST be declared in
`ArticleSchema` itself to survive the read boundary. The `bookId` "strip-mode precedent"
named in the agent's Discretion is a **trap for this use case** — `bookId` is stored
top-level on rows but is invisible to `CanonicalArticle` precisely because it is NOT in
`ArticleSchema`. Overrides need the opposite: the `tags`/`ingestionMeta` precedent
(schema-declared optional fields that hydrate and round-trip). Because overrides then
live ON the article row, D17-13's atomic cascade is free (`remove(id)` already deletes
the row) and D17-12's "ride inside ArticleSchema in the bundle" is automatic
(`ExportBundleSchema` composes `ArticleSchema`).

Second decisive finding: non-indexed Dexie row fields need **no version-block change**
(official Dexie docs: only indexed properties must be declared; [CITED:
dexie.org/docs/Tutorial/Design]). No query in this phase keys on overrides (search is
an in-memory haystack). The project's own `ingestionMeta` field landed with no bump —
v3 bumped only for the `source`/`addedAt` indexes. So "overrides migrate via Dexie
additive versioning" is satisfiable two ways; the tension is surfaced in Open Questions
with a recommendation (hydration proof without a bump, mirroring the 08-02 v3→v4
tags-hydration assertion, OR a no-op v6 anchor block per the v2 precedent if the
planner wants an explicit version boundary).

**Primary recommendation:** Add `readerTitle`/`readerAuthor` as `.optional()` fields on
`ArticleSchema` (min(1) — empty-string overrides unrepresentable, D17-04), ship one
pure `effectiveTitle`/`effectiveAuthor` module consumed by all 11 surface sites, extend
the conflict machinery with an `article-metadata-override` kind (keep-local default,
explicit merge when an incoming article wins on revision/content), bump the bundle to
the 1|2|3 union with writers emitting 3, and gate the edit affordance to
Dexie-persisted rows (bundled sample fixtures have nowhere to persist an override).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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
- **D17-05: Articles only — EPUB books do NOT get title/author editing
  this phase.** Books keep canonical `title`/`authors[]`; book editing
  is noted to the backlog. META requirements stay article-scoped.
- **D17-06: Chapter rows inside expanded books are NOT editable** —
  chapters keep ingested titles. One honest scope line: if it's not a
  top-level article row, it has no edit affordance.
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

### Deferred Ideas (OUT OF SCOPE)

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
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| META-01 | Reader can edit a saved article's display title and author as reader-owned metadata without changing canonical article identity, provenance, revision, reading position, or annotations. | Override fields are additive on `ArticleSchema` — `provenance`, `id`, `revision`, blocks untouched (§ Pattern 1). LibraryRow `onEdit` optional-prop precedent (onRemove, L50); edit dialog = structural clone of RemoveConfirm/AddDialog grammar (§ Pattern 3). Fixture-row gate documented (§ Open Question 1). |
| META-02 | Edited title and author appear consistently in the Library, Reader, Highlights, search, and exported presentation surfaces. | Complete consumer inventory enumerated by grep — 11 consumer sites across 8 files (§ Pattern 2 table). One pure derivation module (readingState.ts D14-20 precedent). Verified NON-consumers: SectionAnnouncer (announces in-article section headings only), ResumeBanner (static copy), Header (no title) — no changes needed there despite D17-09 naming them. |
| META-03 | Reader can clear an override to restore the canonical extracted value, including when the canonical author is absent. | Absent override field ⇔ canonical value (schema has no empty-string state: `min(1).optional()`). Clearing = deleting the field from the row (`delete readerTitle` / rebuild row without the key — Dexie put replaces the whole row). Absent canonical author renders nothing today (LibraryRow L92, ArticleView L1877 truthy guards) — restoring absent = override key absent + truthy guard already handles display. |
| META-04 | Metadata overrides migrate safely, cascade on article removal, and round-trip through versioned export/import with explicit conflict reporting. | Migration: optional-field hydration is the shipped Pitfall 9 mechanism (ingestionMeta/tags precedents); bump-or-not analyzed (§ Pattern 4, Open Question 3). Cascade: free — overrides live on the row `remove(id)` already deletes atomically. Round-trip: bundle v3 union (1|2|3), writers emit 3, peek threshold >3 (§ Pattern 5). Conflicts: new `article-metadata-override` kind + merge-on-win semantics in resolveImportPlan (§ Pattern 6). |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **GSD workflow enforcement** — no direct repo edits outside a GSD workflow; this research runs under `/gsd-plan-phase`.
- **Content scope / honesty** — "No silent garbage — unsupported content refuses calmly with reader-visible reasons; annotations never silently re-attach." Directly governs D17-11 (explicit conflict reporting, never silent override drop).
- **Persistence local-first** — reading position, highlights, notes, library, and preferences are local-first; cross-device via versioned export/import, not accounts. Overrides join this contract (D17-12).
- **Security** — the canonical document model is the security boundary; Zod-at-boundary on every read (STATE-04); never `dangerouslySetInnerHTML`.
- **Accessibility** — semantic HTML, keyboard navigation, visible focus, reduced motion are foundational; the edit dialog inherits the four-shipped-dialog focus/Esc/`data-initial-focus` discipline.
- **Performance** — repagination budget untouched this phase (no layout-path changes; override fields are O(1) reads).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Override editing UI (row affordance + dialog) | Browser / Client (React) | — | SPA, no server; native `<dialog>` pattern ships in 4 precedents |
| Override persistence | Browser / Client (Dexie/IndexedDB) | — | Local-first app; overrides are article-row fields |
| Effective-value derivation | Browser / Client (pure module) | — | D14-20 one-policy-module precedent; zero I/O |
| Search consistency (META-02) | Browser / Client (libraryFilter) | — | In-memory haystack over Zod-validated rows |
| Export/import versioning + conflicts | Browser / Client (portability) | — | Bundle is a client-produced zip; no backend |
| Removal cascade (D17-13) | Browser / Client (Dexie transaction) | — | Existing 4-store atomic transaction |
| Ingestion (untouched) | Node middleware (Vite dev / Vercel fn) | — | Ingest path never reads or writes override fields; `has(id)` dedupe-refuse already prevents re-ingest clobber |

No tier misassignment risk: this phase is single-tier (client). The one cross-boundary
interaction is the import path, where `resolveImportPlan`/`applyImport` (client) must
merge overrides per D17-10/D17-11.

## Standard Stack

### Core

No new libraries. Phase 17 composes the shipped stack:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.4.3 (pinned in package.json) | `ArticleSchema` optional override fields; bundle v3 union read | Zod-at-boundary is STATE-04; every Dexie read + bundle parse validates through it [VERIFIED: package.json + src/content/schema.ts] |
| dexie | 4.4.4 (pinned) | Override fields on article rows; atomic cascade via existing transaction | Only indexed properties require version-block declarations; non-indexed fields store freely [CITED: dexie.org/docs/Tutorial/Design] |
| react / react-dom | 19.2.8 | Edit dialog + row affordance (structural clones of shipped components) | Shipped SPA baseline |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | — |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Optional fields on ArticleSchema | Separate `overrides` Dexie table keyed by article id | Table model fights D17-12 ("no separate override block in the bundle" — export would need merge/split machinery), requires extending the remove transaction (D17-13), and adds a store + version bump for zero query benefit. REJECTED — see Pattern 1. |
| Optional fields on ArticleSchema | bookId-style denormalized-only row columns | **Trap**: `ArticleSchema.safeParse` strips unknown keys on read (Zod 4 strip mode [VERIFIED: ExportImportService.ts L183-187 comment + shipped tests]); a denormalized-only column is invisible to `CanonicalArticle` and could never display or export. The bookId precedent works only because the canonical FK lives in `ingestionMeta`. |
| Pure derivation helpers | Denormalized-at-write (write effective value into a third field) | Two sources of truth for one name; violates the one-derivation-point discipline (META-02's structural guarantee, D14-20 precedent). REJECTED. |

**Installation:** none — no packages are installed this phase.

**Version verification:** zod 4.4.3 and dexie 4.4.4 confirmed in package.json dependencies
(read this session). No registry lookups needed (no new packages).

## Package Legitimacy Audit

> This phase installs **zero** external packages. All mechanisms extend shipped,
> pinned dependencies (zod 4.4.3, dexie 4.4.4, react 19.2.8 — all previously
> legitimacy-vetted per STATE.md history and STACK.md).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | N/A — no installs |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │  LibraryView (#/)                            │
                        │  ┌────────────────────────────────────────┐  │
                        │  │ LibraryRow (top-level article rows)    │  │
                        │  │  [Edit ✎] ← NEW (beside Remove 🗑)     │  │
                        │  │   │ gated: Dexie-persisted rows only   │  │
                        │  └──────┬─────────────────────────────────┘  │
                        │         ▼ setEditTarget (removeTarget prec.) │
                        │  ┌────────────────────────────────────────┐  │
                        │  │ EditMetadataDialog (native <dialog>)   │  │
                        │  │  Title input (min 1) · Author input    │  │
                        │  │  per-field Reset → canonical baseline  │  │
                        │  └──────┬─────────────┬───────────────────┘  │
                        │    Save ▼             ▼ Cancel/Esc           │
                        │  db.articles.put(row w/ readerTitle?)  focus │
                        │  (+ readerAuthor?)     restore               │
                        │         │ refreshKey++                      │
                        │         ▼                                  │
                        │  effectiveTitle(article) / effectiveAuthor │
                        │  (ONE pure module — readingState precedent)│
                        │     │      │      │      │      │          │
                        │     ▼      ▼      ▼      ▼      ▼          │
                        │  Library  Reader  Review  Strip  Search     │
                        │  rows/h1  doc.title h2/filter title  haystack│
                        │  byline   byline   options  author (override│
                        │  aria-lbl export   sort            only)    │
                        │  filename .md                                │
                        └──────────────┬───────────────────────────────┘
                                       ▼
             ┌─────────────────────────────────────────────┐
             │ Export / Import (portability)               │
             │  export: dexieLibrarySource.list()          │
             │    → ArticleSchema rows carry overrides     │
             │    → bundle v3 (writers emit 3; 1|2|3 read) │
             │  import: validateBundle (peek > 3 refuses   │
             │    v4+; v1/v2/old-v3-without-fields parse)  │
             │    → detectImportPreview: NEW               │
             │      article-metadata-override conflict kind│
             │      (differs OR one-side-only ⇒ conflict   │
             │      row, keep-LOCAL default, per-item      │
             │      take-incoming choice)                  │
             │    → resolveImportPlan: article wins on     │
             │      revision/content ⇒ MERGE local         │
             │      override into winning row (unless      │
             │      take-incoming chosen) — D17-10         │
             │    → applyImport: puts-only tx (unchanged)  │
             └─────────────────────────────────────────────┘

  Untouched by design: provenance bytes, id/revision, hashes, locations,
  highlights/notes, BookSchema title/authors[], chapter rows, AddDialog
  ingestion path (has(id) dedupe-refuse already prevents clobber).
```

### Recommended Project Structure

```
src/
├── content/
│   └── schema.ts                    # + readerTitle/readerAuthor optional fields (ArticleSchema)
├── ingestion/
│   ├── library/
│   │   ├── effectiveMetadata.ts     # NEW — pure effectiveTitle/effectiveAuthor (ONE derivation)
│   │   ├── LibraryRow.tsx           # + onEdit prop, EditIcon glyph beside TrashIcon
│   │   ├── EditMetadataDialog.tsx   # NEW — structural clone dialog (RemoveConfirm grammar)
│   │   ├── LibraryView.tsx          # + editTarget state, dialog mount, refreshKey on save
│   │   └── libraryFilter.ts         # haystack swaps to effective values (D17-07)
│   └── (AddDialog, IngestionClient — untouched)
├── routes/
│   ├── ArticleView.tsx              # doc.title, h1, byline, export filename → effective
│   └── review/
│       ├── ReviewView.tsx           # option labels, section h2 → effective
│       └── reviewFilter.ts          # article sort key → effective
├── portability/
│   ├── bundle.ts                    # schemaVersion 1|2|3 union
│   ├── ExportImportService.ts       # peek > 3; writer emits 3
│   ├── conflicts.ts                 # + article-metadata-override kind, merge-on-win
│   └── markdown.ts                  # citations, headings, sort → effective
└── persistence/
    └── db.ts                        # v1..v5 byte-unchanged (bump decision = Open Question 3)

tests/
├── unit/library/effective-metadata.test.ts        # NEW
├── unit/library/library-search.test.ts            # extended (override haystack)
├── unit/ingestion-schema.test.ts                  # extended (optional fields, min(1))
├── unit/portability/{bundle-schema,conflicts,
│   validate-bundle,markdown,import-preview-dialog}.test.ts  # extended
└── e2e/library/metadata-edit.spec.ts              # NEW (dialog flow + consistency)
    e2e/portability/{round-trip,import-preview}.spec.ts      # extended (v3 + conflicts)
    e2e/ingestion/dexie-migration.spec.ts          # extended (override hydration proof)
```

### Pattern 1: Override storage — ArticleSchema optional fields, NOT the bookId strip-mode precedent

**What:** Declare `readerTitle`/`readerAuthor` directly on `ArticleSchema` as
`.optional()` fields; they store as ordinary row keys in `db.articles`.

**When to use:** Always for data that must (a) display after a Dexie read, (b) ride the
export bundle, (c) survive import puts.

**Why the bookId precedent does not apply:** every read path validates rows through
`ArticleSchema.safeParse` (DexieLibrarySource.list/open, LibrarySource.ts L57/L72), and
Zod 4 `z.object` strips unknown keys [VERIFIED: ExportImportService.ts L183-187 —
"z.object strips unknown keys by default… in Zod 4"; behavior test-proven across 9
phases]. `bookId` survives only as `ingestionMeta.bookId` because that is where the
schema declares it; the top-level row copy is stripped on read (12-03 decision). A
denormalized-only override column would be invisible.

**Example — the field declaration (schema.ts, after `tags` L266):**

```typescript
// src/content/schema.ts — ArticleSchema (verbatim shape of the shipped tags precedent)
export const ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  revision: z.number().int().min(1),
  lang: z.string().min(2),
  provenance: Provenance,
  blocks: z.array(BlockSchema).min(1),
  footnotes: z.array(FootnoteBody).default([]),
  ingestionMeta: IngestionMetaSchema.optional(),
  tags: z.array(z.string().min(1)).default([]).optional(),
  // Phase 17 (META-01..04) — reader-owned display overrides. Additive-optional;
  // existing rows parse unchanged (Pitfall 9 backward-compat, the ingestionMeta/
  // tags mechanism). min(1) makes the empty-string override UNREPRESENTABLE:
  // D17-04 calm validation enforced at the schema boundary — "Saving an EMPTY
  // AUTHOR field is the no-author-override state", and no override can produce
  // an untitled article (canonical provenance.title is min(1)).
  readerTitle: z.string().min(1).optional(),
  readerAuthor: z.string().min(1).optional(),
});
```

[VERIFIED: src/content/schema.ts L250-267 current shape + L257-266 optional-field
precedent comments; D17-04 in 17-CONTEXT.md]

**Why a separate overrides table loses:** (1) D17-12 locks "no separate override block
in the bundle" — a table would need export-merge/import-split machinery; (2) D17-13
atomic cascade would require extending the 4-store remove transaction; (3) no query
keys on overrides exist or are needed; (4) D17-10 merge-on-import becomes a
cross-table read-modify-write instead of a row spread.

### Pattern 2: One derivation point — `effectiveMetadata.ts` (D14-20 precedent)

**What:** A pure module exporting `effectiveTitle(article)` / `effectiveAuthor(article)`;
every display/search/sort/export consumer imports it. Never denormalize the effective
value at write.

**When to use:** every surface in the table below (the complete inventory — grep
`provenance\.(title|author)` over src/, run this session):

| File:Line | Current consumer | Change |
|-----------|------------------|--------|
| `src/ingestion/library/LibraryRow.tsx:90` | row heading text | → effectiveTitle |
| `src/ingestion/library/LibraryRow.tsx:92-93` | `.meta` author (truthy guard) | → effectiveAuthor |
| `src/ingestion/library/LibraryRow.tsx:128` | remove aria-label | → effectiveTitle |
| `src/ingestion/library/LibraryView.tsx:702` | removeTarget title | → effectiveTitle |
| `src/ingestion/library/ContinueReadingStrip.tsx:230-233` | strip link + author | → effective |
| `src/ingestion/library/libraryFilter.ts:89-90` | search haystack | → effective (override only — D17-07) |
| `src/routes/ArticleView.tsx:1289` | document.title (standalone) | → effectiveTitle |
| `src/routes/ArticleView.tsx:1877-1880` | byline author | → effectiveAuthor |
| `src/routes/ArticleView.tsx:2051` | h1 title | → effectiveTitle |
| `src/routes/ArticleView.tsx:1827` | per-article export filename | → effectiveTitle (planner confirm — § OQ5) |
| `src/routes/review/ReviewView.tsx:342,417,463` | options sort/label, section h2 | → effectiveTitle |
| `src/routes/review/reviewFilter.ts:228` | article sort key | → effectiveTitle |
| `src/portability/markdown.ts:140-145,178,204,253` | citation, headings, section sort | → effective |

**Verified NON-consumers (no changes):** `SectionAnnouncer.tsx` announces in-article
section headings (h2+) only; `ResumeBanner.tsx` renders static copy ("You left off
here"); `Header.tsx` renders no article title [VERIFIED: grep this session]. D17-09
names SectionAnnouncer/ResumeBanner in its "everywhere" list, but these components do
not read the article title/author — the consistency requirement is satisfied for them
by construction. The planner should note this in the plan to avoid a spurious task.

**Chapter/book surfaces stay canonical (D17-05/D17-06):**
`LibraryView.tsx:545` (chapterTitlesByBook), `ArticleView.tsx:1239` (chapter-nav
neighbor titles), `ArticleView.tsx:1284` (the `article.provenance.title —
chapterContext.book.title` document.title combination — the CHAPTER half stays
canonical; a chapter's own provenance.title is never overridable this phase),
`ContinueReadingStrip` book entries (`book.title`), `filterBooks` haystack, `BookRow`.

**Example — the module (readingState.ts shape):**

```typescript
// src/ingestion/library/effectiveMetadata.ts — pure, zero I/O, zero React
import type { CanonicalArticle } from "../../content/types";

/** META-02: the ONE display-name derivation. Override wins; canonical is
 * the fallback. Absent override ⇔ canonical value (no empty-string state —
 * schema min(1).optional()). */
export function effectiveTitle(article: CanonicalArticle): string {
  return article.readerTitle ?? article.provenance.title;
}

/** META-03: absent override restores the canonical author INCLUDING the
 * absent case — `undefined ?? undefined === undefined`, and every consumer's
 * existing truthy guard renders nothing. */
export function effectiveAuthor(
  article: CanonicalArticle,
): string | undefined {
  return article.readerAuthor ?? article.provenance.author;
}
```

[VERIFIED: readingState.ts D14-20 module shape; LibraryRow.tsx L92 truthy-guard
rendering; D17-03 absent-author restoration]

### Pattern 3: The edit dialog — structural clone of the shipped native-dialog grammar

**What:** `EditMetadataDialog.tsx` clones the RemoveConfirm/AddDialog discipline
verbatim (Pitfall 8 isolation — structural clones over shared abstractions):
`useEffect` open↔showModal sync; capture `document.activeElement` on open, restore in
the `close` listener; Esc-originated close routed through `onCancel` via the
`openRef` mirror (the 09-05 fix — without it the [open] effect wedges the dialog);
explicit `.focus()` on `[data-initial-focus]` after showModal (WebKit quirk);
`data-initial-focus` on **Cancel** (non-destructive default).

**Form shape (D17-02/D17-03/D17-04):**
- Two labeled inputs (`<label htmlFor>` + `<input>` — the AddDialog L447-457 pattern,
  NOT `method="dialog"` forms — the 02-01 Chromium focus-trap lesson).
- Title input: prefilled with `readerTitle ?? ""`; Save disabled (or inline calm
  explanation) while the trimmed value is empty AND no override exists yet — careful:
  an article with an existing override whose title field is cleared means "Reset", not
  "Save blank" (D17-03/D17-04 interplay — planner pins exact rule).
- Author input: prefilled with `readerAuthor ?? ""`; empty = no author override.
- Canonical values visible as `placeholder={article.provenance.title}` /
  `placeholder={article.provenance.author ?? "No author"}` (D17-03 "never ambiguous")
  — placeholders are display-only and never persist.
- Per-field quiet Reset control per field (`.library-clear-filters`-class quiet-button
  tokens), restoring the input to the canonical value AND removing the override on Save.
- Save handler is the ONLY write site (Pitfall 8): `db.articles.put({ ...article,
  readerTitle: titleValue || undefined, readerAuthor: authorValue || undefined })` —
  note the `|| undefined` idiom DROPS cleared keys from the serialized row (META-03:
  clearing deletes the field; an empty string would fail `min(1)` at the next read —
  dropping the key is the only valid representation).

**Example — the save seam (illustrative):**

```typescript
// EditMetadataDialog — the single write (Pitfall 8: only in Save's onClick)
const row = {
  ...article,                          // provenance/id/revision/blocks UNTOUCHED (META-01)
  ...(titleValue.trim() ? { readerTitle: titleValue.trim() } : {}),
  ...(authorValue.trim() ? { readerAuthor: authorValue.trim() } : {}),
};
await db.articles.put(row);            // whole-row upsert: absent keys are DELETED (META-03)
```

[VERIFIED: RemoveConfirm.tsx L50-107 (open sync, focus restore, destructive-onClick
isolation); AddDialog.tsx L387/446-476 (prevented-submit forms, labeled inputs);
ImportPreviewDialog.tsx L131-185 (openRef Esc routing); 16-02 cancel-listener
submittingRef mirror precedent]

**LibraryView wiring:** `editTarget` state beside `removeTarget`; dialog mounted beside
`RemoveConfirm`; on save → `setEditTarget(null); setRefreshKey((k) => k + 1)` (the
RemoveConfirm onConfirm precedent, LibraryView.tsx L786-799).

### Pattern 4: Migration — hydration without touching shipped version blocks

**What:** Existing libraries (v5 rows without override keys) parse unchanged; absent
`.optional()` fields hydrate to `undefined` (the exact Pitfall 9 mechanism documented
for `ingestionMeta` (schema.ts L257-259) and `tags` (L260-266)).

**Dexie facts:** only indexed properties must be declared in a version block; object
stores accept any row properties [CITED: dexie.org/docs/Tutorial/Design — "The object
store will allow any properties on your stored objects but you can only query them by
indexed properties"]. No Phase 17 query keys on overrides (search is the in-memory
haystack). Therefore **no index change is required**, and the project's own precedent
is split:
- `ingestionMeta` landed with NO bump (v3 was for `source`/`addedAt` indexes) —
  schema-field-only additive changes historically ship bumpless.
- v2 (Phase 2) is the no-op re-declaration precedent — a version block that changes
  nothing, anchoring a migration hook.

**Options for the planner (Open Question 3):**
- **A (recommended):** no version bump. The migration proof = the 08-02 v3→v4 style
  hydration assertion transplanted: seed a v5-shaped row WITHOUT override keys → open
  app → row parses, `readerTitle === undefined`, on-disk row byte-unchanged (no
  write-back). Honest note in db.ts comments documenting why no bump (the
  ingestionMeta precedent).
- **B:** no-op `version(6)` anchor block re-declaring v5 stores verbatim (the v2
  precedent). Gives the migration spec an explicit version boundary; costs one
  harmless upgrade step for existing clients.

Either way: v1..v5 blocks stay byte-unchanged (Pitfall 9), NO `.upgrade()` callback.

### Pattern 5: Bundle v3 — the 12-07 union-read discipline, replayed

**What:** `ExportBundleSchema.schemaVersion: z.union([z.literal(1), z.literal(2),
z.literal(3)])`; writers emit `3`; `validateBundle` peek threshold moves `> 2` → `> 3`.

**Exact edit sites:**
- `src/portability/bundle.ts` L43 (union) — articles carry overrides automatically
  (`z.array(ArticleSchema)` composition; no separate block, per D17-12).
- `src/portability/ExportImportService.ts` L112-125 (`schemaVersion: 3 as const` in
  `buildBundleBytes`) and L239 (`peeked > 3`).
- `BUNDLE_FILENAME` unchanged ("lem-reader-bundle-v1.zip") — the filename is not the
  version contract (12-07).
- `manifest.ts` untouched — the `articles` block hashes the Zod-parsed array
  deterministically; new fields hash identically on both sides (determinism contract,
  manifest.ts L29-35). Books stay optional-on-read (v1/v2 hygiene preserved).

**Compatibility matrix:**

| Bundle | Reads as | Overrides | Behavior |
|--------|----------|-----------|----------|
| v1 | `1` | absent | unchanged |
| v2 | `2` | absent | unchanged |
| v3 (new) | `3` | optional per article | writers always emit 3 |
| v4+ | refused | — | `newer-schema-version` calm refusal (D9-04) |

[VERIFIED: bundle.ts L40-56 current 1|2 union + 12-07 comments; ExportImportService.ts
L238-244 peek; STATE.md 12-07 decision L342]

### Pattern 6: Import conflicts — a new kind + merge-on-win (D17-10/D17-11)

**What:** Extend `ConflictKind` with `"article-metadata-override"`. Classification
(detectImportPreview): a same-id incoming article where `readerTitle`/`readerAuthor`
differ from local, **including one-side-only** (D17-11 verbatim). CRITICAL fix: today a
same-id+revision+hash article is a "calm no-op" (conflicts.ts L553-555) — with
overrides, that branch must still count as a no-op ONLY when override state also
matches; differing overrides must surface as the new conflict kind (explicit
reporting; never silently drop the incoming override, never silently clobber local).

**Resolution semantics (resolveImportPlan):**
- Default (keep-local) on a metadata-only conflict: write nothing — the local row
  (with its override) stays. Counted as skipped.
- Take-incoming: write the incoming article row as-is (its overrides win).
- **Merge-on-win (the D17-10 load-bearing case):** when the incoming article ALSO wins
  on `article-revision` (higher revision under overwrite) or
  `article-content-divergence` (overwrite), and the metadata choice is keep-local,
  the written row must be `{ ...incoming, readerTitle: local.readerTitle,
  readerAuthor: local.readerAuthor }` — canonical content refreshes, the reader's name
  survives ("a refresh never renames the library back"). When the metadata choice is
  take-incoming, the incoming row wins whole.
- New-id incoming articles (no local row): ride as-is — their overrides import.

**Per-item vs per-kind:** the shipped `Overrides = Record<ConflictKind,
PerKindOverride>` is bulk-per-kind with one dialog row per kind. D17-11 explicitly
requires "a per-item choice to take the incoming one" — a per-item mechanism is
REQUIRED by the locked decision (not optional). The existing summary row (count +
sampleIds capped at 5, conflicts.ts L70-77) can carry the bulk default; the per-item
choice is a new UI shape inside ImportPreviewDialog (a disclosure list of conflicted
articles with per-article keep-mine/use-imported toggles). Planner owns exact shape;
KIND_LABELS gains the new kind; `keep-both` is meaningless for this kind (not offered
— the KEEP_BOTH_KINDS narrowing precedent).

**Non-clobber guarantee outside import:** the AddDialog path refuses same-id re-ingest
before save via `has(id)` ("Already in your library.", AddDialog.tsx L214-217 —
[VERIFIED: grep this session]); URL/paste/file ingestion therefore cannot clobber
overrides today. `applyImport` article puts (ExportImportService.ts L336-348) are the
ONLY same-id article write path — hence the merge lives in resolveImportPlan.

### Pattern 7: Row affordance + fixture gate

**What:** `LibraryRow` gains an optional `onEdit` prop (the `onRemove` optional-prop
precedent, L50) rendering a quiet edit button beside remove: inline-SVG pencil glyph
in the TrashIcon anatomy (20×20, viewBox 0 0 24 24, currentColor stroke 1.75, round
caps/joins, aria-hidden + focusable=false), `aria-label` template naming the action +
effective title, `.library-row-edit` CSS mirroring `.library-row-remove` (transparent
rest, `var(--touch)` 44px box, hover accent — app.css L2093-2106 pattern).

**Fixture gate (research finding — see Open Question 1):** bundled sample fixtures
(SourceBadge "Sample", `article.ingestionMeta === undefined`) are NOT in Dexie — an
override-on-row edit has nowhere to persist (the put would create a shadow row).
Recommended gate: render `onEdit` only for Dexie-persisted rows. Detection predicate:
`article.ingestionMeta !== undefined` (every ingested article supplies it — the
ingester "always supplies it", schema.ts L258-259; every imported article rode a
bundle whose rows carried it; fixtures never do — SourceBadge.tsx L57 uses the same
`?? "fixture"` inference). Book rows and chapter sub-rows get no affordance (D17-05/
D17-06). Note the symmetry: remove-on-fixture is already a silent Dexie no-op today
(`db.articles.delete` of an absent id; the union re-renders the row) — gating edit is
consistent with how samples already behave.

### Anti-Patterns to Avoid

- **Denormalized-only override columns (bookId-literal reading):** stripped on read;
  invisible everywhere. Use Pattern 1.
- **Empty-string override as "cleared" state:** unrepresentable by schema (`min(1)`);
  clearing must DELETE the key (whole-row put without it). An empty-string write would
  make the next `safeParse` DROP THE ENTIRE ROW as corrupt (silent library
  disappearance — the exact "silent garbage" the project forbids).
- **Forking title derivation per surface:** 11 sites × ad-hoc `article.readerTitle ??
  article.provenance.title` will drift; META-02 is structurally guaranteed only by one
  module.
- **Searching canonical + override both:** explicitly rejected (D17-07) — a renamed
  article must NOT surface for its old name.
- **A shared "metadata write" service or shared dialog component:** Pitfall 8 —
  structural clones; the override write lives ONLY in the edit dialog's Save onClick.
- **Editing `provenance` in place:** violates META-01 (canonical bytes are the
  provenance/security/anchor contract); overrides are separate fields layered on top.
- **Touching shipped Dexie version blocks:** Pitfall 9 — append-only; v1..v5
  byte-unchanged regardless of the Pattern 4 A/B choice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal focus trap / Esc / inert backdrop | Custom overlay logic | Native `<dialog>`/showModal structural clone | Free focus trap, Esc, inert backdrop; 4 shipped precedents; cross-engine focus discipline already solved (02-01 WebKit lesson) |
| Conflict detection/classification | New parallel conflict engine | Extend `resolveImportPlan`/`detectImportPreview` | D9-14 id-kind table + preview machinery already exist; adding a kind is additive |
| Bundle versioning | New envelope or sidecar | 1|2|3 union + peek threshold | The 12-07 ReaderSettingsSchema-precedent mechanism; forward-refusal already calm |
| Migration machinery | `.upgrade()` callbacks / data rewrite | `.optional()` hydration | Rows are schemaless for non-indexed fields; absent keys hydrate undefined; zero migration code (Pitfall 9 mechanism) |
| Effective-value memoization | Caches/derived stores | Plain function calls | `??` on two optional strings is O(1); no memoization needed (contrast: readingState needs totals) |

**Key insight:** every deceptively complex sub-problem here (atomic cascade, bundle
integrity, conflict reporting, focus management) is already solved by shipped
machinery this phase EXTENDS. The genuinely novel code is small: two schema fields,
one pure module, one dialog, one conflict kind + merge rule.

## Runtime State Inventory

> Included because the phase migrates persisted data shapes (additive fields + bundle
> version) even though it is not a rename/refactor phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (Dexie, readers' browsers + dev) | v5 `articles` rows WITHOUT override keys (all existing installs) | None — `.optional()` hydration on read; no write-back (Pattern 4). Prove via migration spec extension |
| Stored data (export bundles on readers' disks) | Previously exported `lem-reader-bundle-v1.zip` files (schemaVersion 1 or 2) | None — union read keeps v1/v2 importing; overrides absent → no conflicts raised (Pattern 5) |
| Live service config | None — no external services own this string; the Vercel deployment ships static + one ingest function that never reads metadata | None — verified by grep (ingestion path untouched) |
| OS-registered state | None — browser SPA; no OS registrations | None |
| Secrets/env vars | None — no new env or secret keys | None |
| Build artifacts | None — no schema-codegen or derived artifacts keyed to ArticleSchema shape (Zod types are build-time inferred; tsc reruns on build) | None |

**The canonical question:** after this phase ships, what still carries the old state?
Answer: only on-disk v1/v2 bundle zips (handled by the union read) and existing Dexie
rows (handled by optional hydration). Nothing else caches article metadata across
sessions (document.title/session state are ephemeral).

## Common Pitfalls

### Pitfall 1: The strip-mode trap (bookId precedent misapplied)
**What goes wrong:** Override fields stored as row keys but not declared in
`ArticleSchema` → stripped on every `safeParse` → overrides never display, never
export; the feature silently does nothing.
**Why it happens:** CONTEXT's discretion item names "bookId strip-mode precedent" as a
candidate model; it is the inverse of what overrides need.
**How to avoid:** Pattern 1 — declare in ArticleSchema; unit-test that a row WITH
`readerTitle` round-trips through `ArticleSchema.parse` with the field intact.
**Warning signs:** e2e saves an override, refresh shows canonical title.

### Pitfall 2: Empty-string override corrupts the row
**What goes wrong:** Writing `readerAuthor: ""` (e.g. mapping a cleared input
naively) fails `min(1)` at the next read → `safeParse` drops the WHOLE article row
from the library (silent data loss).
**Why it happens:** Form state naturally produces `""`; `db.articles.put` does no
validation.
**How to avoid:** Pattern 3's `|| undefined` spread idiom — cleared fields are OMITTED
from the row object, and Dexie's whole-row put deletes the previous key.
**Warning signs:** article disappears after clearing an author override.

### Pitfall 3: Import overwrite silently renames the library (D17-10 violation)
**What goes wrong:** An incoming same-id article with higher revision wins under the
existing `article-revision` overwrite rule → `articlesToWrite.push(a)` writes the
incoming row wholesale → local `readerTitle`/`readerAuthor` gone; machine B's older
name replaces the reader's chosen name.
**Why it happens:** The existing merge logic keys only on revision/hash; overrides are
new invisible fields to it.
**How to avoid:** Pattern 6 merge-on-win in `resolveImportPlan` BEFORE applyImport
(the puts-only transaction stays untouched).
**Warning signs:** unit test — incoming revision+1 without overrides over an
overridden local article.

### Pitfall 4: The identical-duplicate no-op swallows an incoming override
**What goes wrong:** same id+revision+hash, incoming has an override, local doesn't →
current code classifies "calm no-op" (conflicts.ts L553-555) → the other device's
carefully chosen title never arrives, unreported.
**Why it happens:** The no-op branch predates override fields.
**How to avoid:** Pattern 6 — override-state comparison joins the classification; a
one-side-only difference is a conflict (D17-11 verbatim).
**Warning signs:** import-preview test — bundle article identical except
`readerTitle` must surface `article-metadata-override`, not zero conflicts.

### Pitfall 5: Editing a fixture row silently materializes or no-ops
**What goes wrong:** Reader edits a "Sample" row → `db.articles.put(fixtureRow +
override)` creates a Dexie shadow row → the fixture starts riding exports, becomes
removable-for-real, and the composite union's ingested-wins rule hides the bundled
copy — surprising behavior change for "sample" content. (Or, if the save is gated
wrong, the edit silently vanishes on refresh.)
**Why it happens:** Fixtures are bundled JSON, not Dexie rows; overrides live on rows.
**How to avoid:** Pattern 7 gate (`ingestionMeta !== undefined`) OR a deliberate,
human-confirmed materialize-on-edit decision (Open Question 1).
**Warning signs:** e2e editing the first library row (a fixture) on a fresh install.

### Pitfall 6: Bean-threading the dialog state (the 09-05/16-02 close-path lessons)
**What goes wrong:** Esc-close bypasses onCancel → dialog wedges shut (stale [open]
effect) or the parent state machine leaks an open editTarget; double-submit races
write twice.
**How to avoid:** Clone the FULL grammar: openRef mirror + close-listener routing
(ImportPreviewDialog L131-185), submittingRef-equivalent guard while the put is in
flight (16-02 precedent), focus restore to the row's edit button.
**Warning signs:** e2e Esc path leaves `editTarget` non-null (row buttons dead).

### Pitfall 7: Bundle determinism break via manifest
**What goes wrong:** Any code path that hashes raw bundle.json bytes (instead of the
Zod-parsed block) false-positives "corrupted" once override keys exist.
**Why it happens:** The manifest determinism contract is subtle (hash the parsed
block, schema-ordered keys — manifest.ts L29-35).
**How to avoid:** manifest.ts stays UNTOUCHED; the v3 bump is schemaVersion-only.
**Warning signs:** round-trip spec fails with `corrupted: articles`.

### Pitfall 8: Stale specs pinning canonical titles on overridden rows
**What goes wrong:** Existing specs assert fixture/row title text; if fixtures are
gated (Pattern 7) fixture text never changes — but NEW specs must assert effective
values on EDITED rows, and any spec that seeds an override must not collide with
specs pinning canonical text on the same ids.
**How to avoid:** New e2e seeds overrides on INGESTED articles only (paste/upload
through the real middleware — the remove-cascade spec seeding pattern); fixture
anchors stay byte-stable by construction.
**Warning signs:** v1-regression/browse-open counts shift (they should not — no rows
added or removed).

## Code Examples

### Effective-value swap in the haystack (D17-07)

```typescript
// src/ingestion/library/libraryFilter.ts — filterLibrary (L86-97 today)
// BEFORE: a.provenance.title, a.provenance.author ?? ""
// AFTER:
const haystack = [
  effectiveTitle(a),                       // override only — what you see matches
  effectiveAuthor(a) ?? "",
  domainOf(a.provenance.sourceUrl),        // domain + tags unchanged
  ...(a.tags ?? []),
].join(" ").toLowerCase();
```
[VERIFIED: libraryFilter.ts L86-97 current shape]

### The metadata conflict classification sketch (D17-11)

```typescript
// src/portability/conflicts.ts — inside the bundle.articles loop (L318-331 today)
const local = localArticleById.get(a.id);
if (!local) { added.articles++; }
else if (a.revision !== local.revision) { revisionConflicts.push(a.id); }
else if (a.provenance.originalHtmlHash !== local.provenance.originalHtmlHash) {
  divergenceConflicts.push(a.id);
} else if (metadataDiffers(a, local)) {   // NEW: one-side-only OR differing values
  metadataConflicts.push(a.id);           //   (readerTitle, readerAuthor — either field)
}
// else: identical duplicate INCLUDING override state — calm no-op (unchanged)

function metadataDiffers(a: CanonicalArticle, local: CanonicalArticle): boolean {
  return a.readerTitle !== local.readerTitle ||
         a.readerAuthor !== local.readerAuthor;
}
```
[VERIFIED: conflicts.ts L318-331 current classification; D17-11 one-side-only wording]

### Merge-on-win in resolveImportPlan (D17-10)

```typescript
// The incoming article wins on revision/content — protect the local name unless
// the reader explicitly chose take-incoming:
const winner =
  metadataChoice === "take-incoming"
    ? a
    : { ...a,
        readerTitle:   local.readerTitle,    // keep-local (default): reader's
        readerAuthor:  local.readerAuthor }; //   name survives the content refresh
plan.articlesToWrite.push(winner);
```
[VERIFIED: conflicts.ts L529-556 current article decision tree; D17-10]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bundle `1|2` union, writers emit 2 | `1|2|3` union, writers emit 3 | Phase 17 (this phase), replaying 12-07 | v1/v2 bundles keep importing; v4+ still calm-refuses |
| Article conflict kinds: 5 (D9-14) → 6 (book, 12-07) | 7 (+ article-metadata-override) | Phase 17 | Explicit conflict reporting for reader-owned names |
| `provenance.title/author` only display name | effective values (override ?? canonical) via one module | Phase 17 | 11 consumer sites; chapter/book surfaces stay canonical |

**Deprecated/outdated:** none this phase. (Historical: `FixtureList` superseded by
`LibraryView` in 08-03; `article-tags`/`books` bundle blocks rejected in 09-01 in
favor of in-record fields — the same reasoning D17-12 applies to overrides.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `readerTitle`/`readerAuthor` are acceptable field names (CONTEXT says "e.g." — planner discretion over exact names) | Pattern 1, 5 | Low — rename is mechanical before first merge |
| A2 | `ingestionMeta === undefined` reliably identifies bundled fixture rows (ingester always supplies it; imports carry it; fixtures never do) | Pattern 7, OQ1 | Medium — a v3-bundle article row crafted WITHOUT ingestionMeta would be misgated as uneditable; acceptable (hand-crafted bundles) but planner should note the predicate's basis |
| A3 | No query will ever key on override fields this phase (search stays in-memory) — hence no index/version bump strictly required | Pattern 4 | Low — if a bump is chosen anyway (Option B), zero conflict with the analysis |
| A4 | The per-article markdown EXPORT FILENAME (ArticleView L1827) should use the effective title as part of "export presentation surfaces" (META-02) | Pattern 2 table, OQ5 | Low — canonical filename would be a consistency wart, not a failure |
| A5 | Review/article SORT keys should use effective title (one-name principle extends to ordering) | Pattern 2 table | Low — planner may keep canonical sort for stability; must decide explicitly |

## Open Questions (RESOLVED)

> All five questions resolved during planning and pinned in 17-01..17-05 PLAN.md.
> Per-question resolutions follow each heading.

1. **Fixture-row editability (Pattern 7 gate vs materialize-on-edit) — (RESOLVED: gate, 17-02 Task 2)**
   - What we know: bundled fixtures are not Dexie rows; an override has nowhere to
     persist on them; remove-on-fixture is already a silent no-op; the composite
     union's ingested-wins rule WOULD make a materialized shadow row display correctly.
   - What's unclear: does the user want Sample articles editable (materialize-on-edit
     changes export content — the materialized row starts riding bundles)?
   - Recommendation: gate edit on `ingestionMeta !== undefined` (samples not
     reader-owned; consistent with the remove no-op; keeps every fixture-pinned spec
     byte-stable). Planner surfaces as a checkpoint or notes the boundary in the plan.
   - Resolution: the gate is pinned — 17-02 Task 2 passes `onEdit` only on top-level
     article rows with `a.ingestionMeta !== undefined`; the fixture-gate e2e cell in
     17-02 Task 3 proves Sample rows render no edit affordance.

2. **Per-item conflict choice UI shape (D17-11 requires per-item) — (RESOLVED: disclosure list, 17-04 Task 3)**
   - What we know: shipped dialog is bulk-per-kind with one select per kind;
     D17-11 verbatim requires "a per-item choice to take the incoming one".
   - What's unclear: exact UI (disclosure list of conflicted articles? per-article
     toggle row?). Copy + geometry are planner discretion.
   - Recommendation: keep the per-kind summary row (count + samples) carrying the
     keep-local default, plus an expandable per-article list with keep-mine/use-
     imported toggles; `sampleIds` cap (5) suggests the existing preview shape.
   - Resolution: the recommended shape is pinned — 17-04 Task 2 adds the
     `metadataConflicts` detail array (uncapped) and 17-04 Task 3 renders it behind a
     disclosure control with per-article Keep mine / Use imported choices; copy pinned
     in the 17-04 artifacts list.

3. **Dexie version bump: none (A) vs no-op v6 anchor (B) — (RESOLVED: Option A, 17-01 Task 1)**
   - What we know: non-indexed fields need no declaration [CITED: dexie.org];
     ingestionMeta precedent landed bumpless; v2 precedent shows the no-op anchor;
     CONTEXT frames META-04 as "migrate via Dexie additive versioning".
   - What's unclear: whether the user expects a literal version block.
   - Recommendation: Option A (no bump + explicit hydration proof + db.ts comment
     documenting why), because it is the safest and matches the strongest precedent;
     fall back to B if plan-review reads META-04 as requiring a block.
   - Resolution: Option A pinned — 17-01 Task 1 widens the row type with a no-bump
     rationale comment (v1..v5 blocks byte-unchanged); 17-05 Task 1 proves the
     hydration-without-write-back migration end-to-end.

4. **Dialog title-input edge: cleared title on an already-overridden article — (RESOLVED: disabled Save, 17-02 Task 2)**
   - What we know: D17-04 refuses blank title overrides; D17-03 gives per-field Reset.
   - What's unclear: is a cleared title input + Save = Reset-to-canonical, or
     disabled-Save until non-empty? (Both are calm; they differ in keystroke cost.)
   - Recommendation: treat empty title + Save as invalid (disabled Save with inline
     explanation) — Reset is the explicit clear affordance; two mechanisms for one
     meaning violates one-way-to-do-it.
   - Resolution: the recommendation is pinned — 17-02 Task 2 disables Save on a
     blank non-reset title with the inline explanation line; Reset title is the only
     clear-to-canonical path; the blank-refusal cell in 17-02 Task 3 proves it.

5. **Export filename + sort keys on effective values (A4/A5) — (RESOLVED: effective, 17-03)**
   - Recommendation: effective for both (one-name principle); planner pins.
   - Resolution: pinned — 17-03 Task 1 swaps the per-article export filename to
     `effectiveTitle` and Task 2 swaps every article sort key (reviewFilter,
     ReviewView options, markdown sections) to effective values; the cross-surface
     cells in 17-05 Task 3 prove filename + content carry the one name.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/dev/e2e (Vite 8 needs 20.19+/22.12+) | ✓ | 22.22.3 | — |
| npm | scripts | ✓ | 10.9.8 | — |
| Vite dev server (port 5173) | e2e BASE_URL (fresh-server lesson 15-04) | ✓ via `npm run dev` / Playwright webServer | 8.1.5 | — |
| IndexedDB (Chromium/Firefox/WebKit) | Dexie migration + edit e2e | ✓ | browser-native | — |
| Vite Node middleware `/api/ingest` | e2e seeding via real ingestion (paste path) | ✓ | shipped | direct Dexie seeding (dexie-migration.spec pattern) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

No external tools/services are introduced by this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (unit) + Playwright Test 1.61.1 (e2e, 3 engines) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npx vitest run tests/unit/library/effective-metadata.test.ts` |
| Full suite command | `npm run test` (unit `--run` then e2e; honest exit-0 gate) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-01 | Override save leaves provenance/id/revision/locations/highlights untouched | unit | `npx vitest run tests/unit/ingestion-schema.test.ts tests/unit/library/effective-metadata.test.ts` | ❌ Wave 0 (schema ext) / partial ✅ (schema tests exist) |
| META-01 | Edit dialog flow: open/save/cancel/Esc/focus restore/blank-title refusal | e2e | `npx playwright test tests/e2e/library/metadata-edit.spec.ts` | ❌ Wave 0 |
| META-02 | 11-surface consistency (library row, doc.title, h1, byline, review, strip, markdown, search) | e2e | `npx playwright test tests/e2e/library/metadata-edit.spec.ts` | ❌ Wave 0 |
| META-02 | Search matches override only (renamed article NOT found by old name) | unit + e2e | `npx vitest run tests/unit/library/library-search.test.ts` / search e2e cell | ✅ (extend) |
| META-03 | Clear restores canonical incl. absent author; cleared key deleted from row | unit + e2e | effective-metadata tests + metadata-edit reset cell | ❌ Wave 0 |
| META-04 | v5-row-without-overrides hydrates; row byte-unchanged (or v6 anchor assertion per OQ3) | e2e | `npx playwright test tests/e2e/ingestion/dexie-migration.spec.ts` | ✅ (extend) |
| META-04 | Bundle v3 union: v1/v2 parse, writers emit 3, peek refuses 4+ | unit | `npx vitest run tests/unit/portability/bundle-schema.test.ts tests/unit/portability/validate-bundle.test.ts` | ✅ (extend) |
| META-04 | Metadata conflict classification (differ/one-side-only/no-op-when-identical) | unit | `npx vitest run tests/unit/portability/conflicts.test.ts` | ✅ (extend) |
| META-04 | Merge-on-win: incoming revision+1 preserves local override; take-incoming replaces | unit | `npx vitest run tests/unit/portability/conflicts.test.ts` | ✅ (extend) |
| META-04 | Round-trip with overrides across two contexts; conflict preview row | e2e | `npx playwright test tests/e2e/portability/round-trip.spec.ts tests/e2e/portability/import-preview.spec.ts` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** targeted vitest file(s) + the touched e2e spec via `npx playwright test <spec>`
- **Per wave merge:** `npm run test:unit -- --run && npm run test:e2e`
- **Phase gate:** full `npm run test` exit 0 in one invocation (honest-gate precedent: 09-07/13-06/15-04)

### Wave 0 Gaps
- [ ] `tests/unit/library/effective-metadata.test.ts` — covers META-01/02/03 derivation edges (override present/absent, absent-author restore)
- [ ] `tests/e2e/library/metadata-edit.spec.ts` — dialog flow + cross-surface consistency + fixture-gate assertion (edit button absent on Sample rows)
- [ ] Schema round-trip test row (row WITH readerTitle parses; `""` rejected — Pitfall 2 guard)

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | local-first app; no accounts |
| V3 Session Management | no | no sessions |
| V4 Access Control | no | single-reader local data |
| V5 Input Validation | yes | `readerTitle`/`readerAuthor: z.string().min(1).optional()` at the Zod boundary (ArticleSchema) — every Dexie read AND every bundle parse validates; empty strings rejected; React text-children rendering (escaped by default); `document.title` is text-only assignment (T-14-01 precedent) |
| V6 Cryptography | no (unchanged) | manifest SHA-256 machinery untouched; hashes cover the new fields automatically |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile bundle injects oversized/structural override strings | Tampering | ArticleSchema `min(1)` + string type at bundle parse; rendered as React text children (no HTML parsing anywhere); `document.title` text-only; bundle bomb cap (200MB) upstream. Note: NO length cap — parity with canonical `provenance.title` (also uncapped); optional hardening, not required for parity |
| Hostile bundle forges override fields to impersonate/squat | Spoofing | Metadata is display-only; identity remains id/revision/hashes; conflict reporting surfaces every differing override explicitly (D17-11 — no silent adoption) |
| Import overwrite clobbers reader data (extension of T-9-11/T-7-28) | Tampering | Merge-on-win keeps local overrides by default (Pattern 6); puts-only atomic transaction unchanged; skip-by-default |
| Empty-string override poisons row (Pitfall 2) | Denial of Service | `min(1)` schema + `|| undefined` write idiom; row-drop-on-corrupt is the existing containment (a malformed row can never crash the library) |
| Prototype-pollution-style keys in bundle JSON | Tampering | Zod 4 strip mode removes unknown keys incl. `__proto__` [VERIFIED: ExportImportService.ts L183-187]; overrides are plain declared string fields |

## Sources

### Primary (HIGH confidence)
- Codebase (read this session, line-cited throughout): `src/content/schema.ts`, `src/persistence/db.ts`, `src/ingestion/LibrarySource.ts`, `src/ingestion/library/{LibraryRow,LibraryView,libraryFilter,readingState,pageMeta,SourceBadge,RemoveConfirm,ContinueReadingStrip}.tsx/.ts`, `src/ingestion/AddDialog.tsx`, `src/portability/{bundle,conflicts,ExportImportService,manifest,markdown}.ts`, `src/reader/ImportPreviewDialog.tsx`, `src/routes/ArticleView.tsx`, `src/routes/review/{ReviewView,reviewFilter}.tsx(.ts)`, `package.json`, `vitest.config.ts`, `tests/e2e/ingestion/dexie-migration.spec.ts`, `tests/e2e/library/remove-cascade.spec.ts`, `tests/unit/portability/*`
- `.planning/phases/17-reader-owned-metadata/17-CONTEXT.md` — locked decisions D17-01..13
- Dexie official docs — Tutorial/Design (database versioning, non-indexed properties) [CITED: dexie.org/docs/Tutorial/Design]

### Secondary (MEDIUM confidence)
- Zod 4 strip-mode/optional behavior: documented in-repo (ExportImportService.ts) and proven by shipped tests; zod.dev fetch attempts 404'd this session (docs site reorganized) — claims tagged [VERIFIED: codebase] rather than [CITED]

### Tertiary (LOW confidence)
- None — no training-data-only claims load-bearing in this research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all claims read from the repo this session
- Architecture: HIGH — every pattern extends a shipped, test-proven contract with line citations; the two novel mechanisms (conflict kind + merge rule) have exact insertion points identified
- Pitfalls: HIGH — each derived from a verified code behavior (strip mode, no-op branch, whole-row put) or a documented prior-phase lesson (09-05 close-path, 12-03 strip-mode, 08-02 hydration)

**Research date:** 2026-08-29
**Valid until:** 2026-09-28 (stable — codebase-internal contracts; re-verify only if Phases 18+ land first and touch the enumerated consumer sites)
