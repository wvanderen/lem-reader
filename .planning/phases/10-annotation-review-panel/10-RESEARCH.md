# Phase 10: Annotation Review Panel - Research

**Researched:** 2026-08-15
**Domain:** Cross-article annotation review surface — React route extension, pure filter/sort derivation, tri-state re-resolution, destructive-curation UX (composition of shipped Phase 5/8/9 machinery)
**Confidence:** HIGH (codebase-composition phase; every claim verified against source files this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

> **Provenance note (from CONTEXT.md):** All decisions below were made by the agent under
> explicit user delegation (user dismissed the interactive gray-area selection and said
> "continue"). Every decision is grounded in a cited prior-phase precedent. The user may
> edit the file before `/gsd-plan-phase 10` — nothing is user-confirmed verbatim.

### Locked Decisions

**Phase Boundary:** A dedicated cross-article surface listing every highlight (with its
attached note) in the library — RECV-01. The reader can jump from any row to the
highlight's location in the reader and back (bidirectional), filter by
article/tag/confidence, sort by date/article/position, see honest
confident/ambiguous/orphan tri-state, and curate in place (edit note, delete
highlight). RECV-02 (explicit anchor repair) stays deferred — tri-state is
display + curation only.

#### Surface & navigation
- **D10-01:** The review panel is a third hash route — `#/review` — not a modal. The
  router regex gains one alternative; the Gap 3 `#/`-prefix guard is unchanged.
- **D10-02:** Entry point is a "Review highlights" button in the LibraryView header
  cluster (alongside existing library controls; same button styling tokens). No second
  entry point in Phase 10.
- **D10-03:** Jump-to-location extends the article route grammar to
  `#/article/<id>/h/<highlightId>` (optional suffix). ArticleView, on mount with an `h`
  param, resolves the highlight's position selector and scrolls to it using the EXISTING
  D5-11 machinery (fragmentContainingOffset/commitTurn in paginated mode;
  findScrollTarget/scrollIntoView + focus the `<mark>` in scrolling mode), then
  `replaceState`-strips the suffix so refresh does not re-jump. Browser Back returns to
  `#/review`. Orphan rows (no article) are not jumpable — their row shows the quote text
  itself and no jump affordance.

#### List layout & rows
- **D10-04:** Grouped-by-article sections, not a flat chronological list. Each group:
  article title (+ source host, subtle) with its highlights beneath, ordered by position.
- **D10-05:** Orphaned highlights render in a trailing group titled "Highlights without
  an article" — first-class rows (curatable, filterable via confidence=orphan), never
  silently hidden.
- **D10-06:** Row anatomy: whole-row button jumps (drawer-entry pattern); quote excerpt
  in blockquote styling; note preview line when a note exists (truncated, drawer
  truncation limits); date (short form); tri-state badge.
- **D10-07:** Tri-state badge renders ONLY for ambiguous and orphan rows. Confident is
  the default calm state — absence of badge = confident. A legend line under the filter
  row states "no badge = anchored confidently".

#### Filter & sort controls
- **D10-08:** One filter row + one sort select, reusing Phase 8 vocabulary: tag chips
  (the TagFilter component as-is), an article `<select>`, and a confidence `<select>`
  (All/Confident/Ambiguous/Orphan). Filters AND together. Sort `<select>`:
  Date (newest first — DEFAULT), Article (title alpha, position within), Position
  (article order, offset within).
- **D10-09:** Filtering/sorting must reuse the `filterLibrary` derivation pattern
  (derived `visibleItems` via pure function over `{allItems, filters, sort}`) — pure,
  unit-testable, no effect chains.
- **D10-10:** Empty states are honest and specific (DOC-06): no highlights at all →
  "No highlights yet. Highlights you make while reading appear here." Filters produce
  zero rows → "No highlights match these filters." Both via the `.status` live-region
  pattern.

#### Curation actions
- **D10-11:** Edit note in place via the NotePopover inline pattern (popover anchored to
  the row; save/delete-note reuse `saveNote`/`deleteNote`). Editing an orphan's note is
  allowed (notes are keyed to highlightId; no article needed).
- **D10-12:** Delete highlight uses a RemoveConfirm-style native `<dialog>` confirmation
  stating that the attached note is removed with it; write fires ONLY in the Proceed
  handler (Pitfall 8 discipline). Result announced via `.status` live region in calm
  voice ("Highlight removed."). No bulk actions.
- **D10-13:** The panel re-derives tri-state on load by resolving each highlight against
  its article's normalized text via `resolveQuoteSelectorInText` (memoized per article —
  the Phase 9 conflicts memoization pattern). Resolution state is display-only; RECV-02
  repair is out of scope.

### the agent's Discretion
- Exact copy strings (calm DOC-06 voice), CSS spacing/typography details, whether group
  headers are sticky, badge visual treatment (tokens only), and the short-date format.
- Long-list performance: no virtualization in Phase 10 unless research finds a
  corpus-scale risk; a plain list with grouped sections is the baseline (prototype
  scale: tens of articles).
- Whether the article `<select>` groups or flat-sorts by title.

### Deferred Ideas (OUT OF SCOPE)
- **RECV-02 anchor repair UI** — future requirement.
- **Bulk select/delete in the panel** — new capability; own future item.
- **Export-from-panel button** — redundant with Settings export (09-05).
- **Full-text search within highlight quotes** — belongs to library-level search (Future).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RECV-01 | Reader can open a dedicated panel to review all highlights and notes across the library, with jump-to-location, filter/sort, and honest tri-state (confident/ambiguous/orphan) surfacing. | Every capability is composition of verified shipped machinery: whole-library reads (`loadAllHighlights`/`loadAllNotes`/`listArticles`), tri-state resolution (`resolveQuoteSelectorInText` + Phase 9 memoization pattern), jump machinery (D5-11 `handleNavigateBack` in ArticleView, reusable on mount), filter derivation (`filterLibrary` pure-function pattern + TagFilter chips), destructive-confirm discipline (RemoveConfirm structural-clone precedent), honest empty-state/live-region patterns (LibraryView `.status`). Success Criterion #4's edit/delete-in-place maps to `saveNote`/`deleteNote` + `deleteHighlight` (which already cascade-deletes notes atomically). |
</phase_requirements>

## Summary

Phase 10 is a **composition phase, not an invention phase**. Every load-bearing mechanism the panel needs already ships and is e2e-proven across Chromium/Firefox/WebKit: whole-library Zod-validated reads (Phase 9 `loadAllHighlights`/`loadAllNotes`), the D5-02 tri-state resolver (`resolveQuoteSelectorInText` in `src/annotations/resolution.ts`), the Phase 9 per-article memoization pattern (`MemoizedArticleText` in `src/portability/conflicts.ts`), the D5-11 jump pipeline (ArticleView `handleNavigateBack` → `fragmentContainingOffset`/`turnToPage` or `findScrollTarget`/`scrollIntoView` → focus `#hl-<id>`), the pure filter-derivation pattern (`filterLibrary` + TagFilter), the native-`<dialog>` confirm discipline (WipeConfirm → RemoveConfirm → ImportPreviewDialog clone lineage), and the never-drop orphan vocabulary (Phase 9 markdown export's "Highlights without an article" ghost section). The research found **zero new dependencies** and **zero schema changes** — no Dexie version bump (Pitfall 9 trivially holds).

The three genuinely new pieces of engineering are: (1) extending the two-view hash router in `App.tsx` to a three-view router plus the `#/article/<id>/h/<highlightId>` deep-link grammar — with the critical detail that the suffix strip MUST use `history.replaceState` (which updates the URL **without** firing `hashchange`), because assigning `location.hash` would re-trigger the router and re-mount views; (2) an on-mount jump in ArticleView that must sequence around THREE async settles (highlights load+resolve, pagination's first commit in paginated mode, and Firefox's async `scrollIntoView` settle — the rAF + `setTimeout(120)` belt-and-suspenders precedent exists at ArticleView L1045–1056); and (3) the curation dialogs, which per the codebase's explicit Pitfall-8 structural-clone precedent (Phase 08-04: "Two ~150-line components is the right cost for Pitfall 8 isolation") must be **structural clones** — `NotePopover` is bound to the per-article `useHighlightOverlay` context and `RemoveConfirm` hardcodes `dexieLibrarySource.remove`, so neither can be imported as-is by the panel.

**Primary recommendation:** Build a `ReviewView` route component + a pure `reviewFilter`-style derivation module + two structural-clone dialogs (`ReviewNoteDialog`, `DeleteHighlightConfirm`), wire the third route and `h`-param jump into `App.tsx`/`ArticleView.tsx`, and prove RECV-01 with unit tests on the pure derivation + Playwright specs across all three engines using the existing `tests/e2e/portability/_portability.ts` seeding helpers (`makeArticle`/`confidentHighlightOn`/`highlightRow`/`seedRows`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route parsing (`#/review`, `#/article/<id>/h/<hid>`) | App shell (App.tsx hash router) | — | Router owns view swapping; Gap 3 fragment guard must stay byte-stable; `parseHash` is already unit-tested in `tests/component/App.test.tsx` |
| Whole-library data load (articles+highlights+notes+tags) | Client data layer (Dexie via existing loaders) | — | `listArticles`/`loadAllHighlights`/`loadAllNotes`/`loadAllTags` are the Zod-validated STATE-04 read path; the panel adds NO new store code |
| Tri-state re-derivation | Pure domain layer (annotations/resolution.ts) | Panel-side memoization wrapper | `resolveQuoteSelectorInText` is the canonical core (REUSE-DO-NOT-FORK); memoization-per-article is the caller's job (Phase 9 pattern) |
| Filter + sort + grouping derivation | Pure domain module (new, mirrors libraryFilter.ts) | — | Pure function over `{articles, highlights, notes, filters, sort}` → grouped sections; unit-testable without Dexie/DOM |
| Review surface rendering | React view component (new ReviewView) | Authored CSS (app.css tokens) | Same tier as LibraryView; semantic list markup + `.status` live region |
| Jump-to-location | ArticleView (existing D5-11 machinery) | Router (`h`-param grammar) | The jump pipeline already exists for the drawer; on-mount form reuses it with location-restore effect shape |
| Note edit / highlight delete curation | Panel-local structural-clone dialogs | Persistence stores (`saveNote`/`deleteNote`/`deleteHighlight`) | Pitfall 8: destructive/ambiguous-ownership dialogs are structural clones, never shared abstractions |
| Browser-back bidirectionality | Browser history (hash navigation) | — | SC#2 satisfied by history itself — pushing `#/article/...` via link navigation makes Back return to `#/review` for free |

## Standard Stack

**No new packages.** This phase installs nothing — every capability composes shipped
project code and the browser platform. [VERIFIED: package.json read this session —
dependencies unchanged since Phase 9 (`react` 19.2.8, `dexie` 4.4.4, `zod` 4.4.3, etc.)]

### Reused Core (verified in codebase this session)

| Module | Location | Role in Phase 10 |
|--------|----------|------------------|
| `loadAllHighlights` / `loadAllNotes` | `src/persistence/highlightsStore.ts` L124–135 / `notesStore.ts` L71–82 | Whole-library Zod-validated reads (Phase 9) — the panel's read side exists wholesale |
| `listArticles` (composite repo) | `src/content/repository.ts` → `compositeLibraryRepository` (`src/ingestion/LibrarySource.ts` L173+) | Fixtures ∪ ingested articles — grouping source + orphan detection + tag source |
| `resolveQuoteSelectorInText` | `src/annotations/resolution.ts` L179–228 | The D5-02 tri-state core — import directly, never fork |
| `MemoizedArticleText` pattern | `src/portability/conflicts.ts` L193–204 | Per-article cluster memoization (D10-13 locked pattern — class is module-private; mirror or lift-and-export) |
| `deleteHighlight` | `src/persistence/highlightsStore.ts` L105–110 | Cascade-deletes highlight **and its notes** in ONE Dexie transaction (Pitfall 10) — the panel needs ONE call, not two |
| `saveNote` / `deleteNote` | `src/persistence/notesStore.ts` L46–58 | Note upsert/delete for the edit dialog (D5-10 empty-text policy owned by caller) |
| `findScrollTarget` / `queryBlocks` | `src/reader/restoreLocation.ts` L81 / ArticleView | Scrolling-mode jump (reuse EXACTLY — Phase 2 discipline) |
| `fragmentContainingOffset` / `turnToPage` | `src/pagination/anchor.ts` L94–111 / PaginatedSurfaceHandle | Paginated-mode jump (offset → page index → turn) |
| `TagFilter` | `src/ingestion/library/TagFilter.tsx` | Tag chips reused as-is (D10-08) |
| `filterLibrary` pattern | `src/ingestion/library/libraryFilter.ts` | Pure derivation template for the new review filter module (D10-09) |
| `loadAllTags` | `src/ingestion/library/tagsStore.ts` L50–59 | Distinct tag set (Dexie articles only — fixtures carry no tags, verified) |
| `history.replaceState` | Browser platform | Suffix strip without re-triggering the hashchange router [CITED: developer.mozilla.org/en-US/docs/Web/API/History/replaceState] |
| `Intl.DateTimeFormat` dateStyle | Browser platform | Short-date discretion; ArticleView L108 already uses `dateStyle: "medium"` + `navigator.language` — mirror with `"short"` [CITED: developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat] |

### Platform facts verified this session

| Fact | Source | Implication |
|------|--------|-------------|
| `history.replaceState(state, unused, url)` replaces the current history entry and does NOT fire `hashchange`/`popstate`; same-origin URL required | MDN (fetched) | The `/h/<hid>` strip must use `replaceState(null, "", "#/article/<id>")`; assigning `location.hash` WOULD fire hashchange and re-run the router |
| `Intl.DateTimeFormat` `dateStyle: "short"` is Baseline (since 2017), locale-dependent (en-US → `7/7/20`) | MDN (fetched) | Short date is one constructor call; reuse ArticleView's `navigator.language` locale discipline |
| `crypto.randomUUID()` emits lowercase hex + hyphens | Codebase usage (Phase 5 OQ#2) | Matches a `[a-z0-9-]+` route char class — but see Pitfall 8 for the imported-bundle id caveat |

## Package Legitimacy Audit

**This phase installs zero external packages.** No registry checks required — the audit
is vacuous by construction (composition of existing dependencies only).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — (none) | — | — | — | — | — | N/A — no installs |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────────────────────────────────────┐
                     │  App.tsx hash router (three views after Phase 10)      │
                     │  Gap 3 guard: hash must start with "#/" (unchanged)    │
                     └────────────────────────────────────────────────────────┘
   Reader lands on   │  parseHash():
   #/ (LibraryView)  │    #/article/<id>          → ArticleView
                      │    #/article/<id>/h/<hid>  → ArticleView + jump param   (NEW)
        D10-02        │    #/review                → ReviewView                (NEW)
   [Review highlights]│    anything else #/…       → list (byte-stable behavior)
   button ────────────┼──────────────┐
                      │              ▼
                      │        ┌──────────────┐   loadAllHighlights() ──► Dexie (Zod/row)
   Library header     │        │  ReviewView  │   loadAllNotes()      ──► Dexie (Zod/row)
   (IngestControl     │        │  #/review    │   listArticles()      ──► fixtures ∪ Dexie
   cluster)           │        └──────┬───────┘   loadAllTags()       ──► Dexie articles
                               │              │
                               ▼              ▼
                    pure derivation module   tri-state re-derivation (D10-13)
                    {articles, highlights,   resolveQuoteSelectorInText(clusters…)
                     notes, filters, sort}   + MemoizedArticleText per-article cache
                               │              │ (mirror of Phase 9 conflicts.ts)
                               ▼              ▼
                    grouped sections:         confident | ambiguous | orphan
                      ## Article A rows …     (display-only; RECV-02 repair deferred)
                      ## Article B rows …
                      ## "Highlights without an article" (orphan tail, D10-05)
                               │
              ┌────────────────┼───────────────────┐
              ▼                ▼                   ▼
        row jump button   Edit note (D10-11)   Delete (D10-12)
        confident-only    ReviewNoteDialog     DeleteHighlightConfirm
              │            (structural clone   (structural clone of
              │             of NotePopover —     RemoveConfirm — Pitfall 8;
              │             calls saveNote/      deleteHighlight fires ONLY
              │             deleteNote direct)   in Proceed onClick; cascade
              │                                   removes the note atomically)
              ▼
   location.hash = "#/article/<id>/h/<hid>"   (history push → Back returns to #/review)
              │
              ▼
   ArticleView mount with h param ─► wait: article ready + highlights resolved
        (+ pagination committed in paginated mode)
              │
              ├─ PAGINATED: fragmentContainingOffset(pages, offset) → turnToPage
              ├─ SCROLLING: findScrollTarget(article, blocks, offset) → scrollIntoView
              ├─ focus #hl-<highlightId>  (rAF + setTimeout(120) Firefox settle guard)
              └─ history.replaceState(null,"","#/article/<id>")  — strip suffix,
                  NO hashchange fired → refresh does not re-jump (SC#2: Back → #/review)
```

### Recommended Project Structure

```
src/
├── App.tsx                        # EXTEND: third View alternative + extended article
│                                  #   regex; view swap gains review branch; Gap 3
│                                  #   guard byte-unchanged
├── routes/
│   ├── ArticleView.tsx            # EXTEND: optional jumpToHighlightId prop → on-mount
│   │                              #   jump effect + replaceState strip
│   └── review/
│       ├── ReviewView.tsx         # NEW: the #/review page (main#main + h1 + .status +
│       │                          #   filter row + sort select + grouped list)
│       ├── reviewFilter.ts        # NEW: pure derivation module (filterLibrary twin) —
│       │                          #   {articles, highlights, notes, filters, sort} →
│       │                          #   grouped sections + orphan tail; memoized
│       │                          #   tri-state re-derivation lives here or beside it
│       ├── ReviewNoteDialog.tsx   # NEW: structural clone of NotePopover calling
│       │                          #   saveNote/deleteNote directly (no overlay context)
│       └── DeleteHighlightConfirm.tsx  # NEW: structural clone of RemoveConfirm;
│                                      #   deleteHighlight ONLY in Proceed onClick
├── ingestion/library/
│   └── LibraryView.tsx            # EXTEND: "Review highlights" header-cluster button
tests/
├── component/App.test.tsx         # EXTEND: parseHash three-route + /h/ grammar cases
├── unit/review-filter.test.ts     # NEW: pure derivation coverage (no Dexie needed)
└── e2e/review-panel/              # NEW specs (list, jump, back, filter/sort, tri-state,
                                   #   curate, empty states) — reuses _portability.ts seeds
```

### Pattern 1: Third-route extension of the two-view hash router
**What:** `View` union gains `{name:"review"}`; `parseHash` regex gains the `#/review`
alternative and the optional `/h/<highlightId>` suffix on the article route.
**When to use:** exactly here (D10-01/D10-03).
**Example:**
```typescript
// Source: src/App.tsx L32–37 (current shape — extend, don't rewrite)
type View =
  | { name: "list" }
  | { name: "article"; id: string; jumpHighlightId?: string }  // NEW optional field
  | { name: "review" };                                        // NEW alternative

function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)(?:\/h\/([^/]+))?$/.exec(window.location.hash);
  if (m) {
    return { name: "article", id: m[1]!, jumpHighlightId: m[2] };  // m[2] undefined = plain
  }
  if (window.location.hash === "#/review") return { name: "review" };
  return { name: "list" };  // byte-stable fallback for unknown #/ deep links (Gap 3)
}
```
The Gap 3 guard (`hash !== "" && !hash.startsWith("#/")`) at App.tsx L148 is untouched —
`#/review` starts with `#/` so it flows into `parseHash`. [VERIFIED: App.tsx L146–150]

### Pattern 2: Pure filter/sort derivation (the filterLibrary twin)
**What:** A new module whose single exported function derives visible grouped sections
from `{allItems, filters, sort}` with no Dexie, no React state, no I/O — unit-testable
in Node like `library-search.test.ts`.
**When to use:** always for list views (D10-09 locked).
**Example:**
```typescript
// Source: src/ingestion/library/libraryFilter.ts L65–89 (the shape to mirror)
export function filterLibrary(
  articles: CanonicalArticle[],
  filter: LibraryFilter,
): CanonicalArticle[] {
  const q = filter.query.trim().toLowerCase();
  return articles.filter((a) => {
    if (filter.activeTag !== null) {
      if (!(a.tags ?? []).includes(filter.activeTag)) return false;  // tag branch (AND)
    }
    /* query branch … */ return true;
  });
}
// Phase 10 twin: deriveReviewSections(articles, highlights, notes, { tag, articleId,
//   confidence }, sort) → { sections: ReviewSection[]; orphanEntries: ReviewEntry[] }
//   where each ReviewEntry = { highlight, note?, status, article? } — the HighlightEntry
//   shape from src/portability/markdown.ts L31–35 is the ready-made row type.
```

### Pattern 3: Structural-clone dialogs (Pitfall 8 lineage)
**What:** `ReviewNoteDialog` and `DeleteHighlightConfirm` are ~150-line structural
clones of `NotePopover` / `RemoveConfirm` — NOT shared abstractions, NOT context-bound
imports. Phase 08-04 explicitly priced this: "Two ~150-line components is the right cost
for Pitfall 8 isolation." Phase 09-05 repeated it for ImportPreviewDialog.
**When to use:** whenever a destructive or ownership-ambiguous action needs a confirm.
**Why clones here specifically:** `NotePopover` reads `useHighlightOverlay()` (the
per-article provider mounted inside ArticleView) — the review panel lives OUTSIDE that
provider, so importing NotePopover is impossible without forking its data source;
`RemoveConfirm` hardcodes `dexieLibrarySource.remove(articleId)` in its destructive
handler. Both clones keep the single-grep-verifiable call-site discipline:
`deleteHighlight(id)` lives ONLY in the confirm dialog's Proceed onClick.
[VERIFIED: NotePopover.tsx L67–75; RemoveConfirm.tsx L92–102; STATE.md 08-04/09-05]

### Pattern 4: Memoized tri-state re-derivation (D10-13, Phase 9 pattern)
**What:** Compute `normalizeText` + `graphemeClusters` ONCE per article id, then run
every highlight of that article through `resolveQuoteSelectorInText` against the cached
cluster array. Article absent → orphan without dropping.
**When to use:** any whole-library tri-state pass (Phase 9 conflicts.ts precedent).
**Example:**
```typescript
// Source: src/portability/conflicts.ts L193–227 (verbatim pattern to mirror)
class MemoizedArticleText {
  private readonly clustersById = new Map<string, readonly string[]>();
  clustersFor(article: CanonicalArticle): readonly string[] {
    let clusters = this.clustersById.get(article.id);
    if (clusters === undefined) {
      clusters = graphemeClusters(normalizeText(article), article.lang);
      this.clustersById.set(article.id, clusters);
    }
    return clusters;
  }
}
// status: resolveQuoteSelectorInText(clusters, h.quote, article.lang, h.position)
//   → TextPositionSelector | "ambiguous" | "orphan"  (map non-string → "confident")
```
**Note:** `MemoizedArticleText` is module-private in conflicts.ts. Either lift-and-export
it (preferred — avoids a forked twin) or mirror it verbatim with a citation comment;
never fork the resolution core itself (`resolveQuoteSelectorInText` is exported).

### Pattern 5: Deep-link jump + replaceState strip (D10-03)
**What:** Review rows navigate to `#/article/<id>/h/<highlightId>` (an `<a href>` or
`location.hash` assignment — either fires hashchange and PUSHES a history entry, so
Browser Back lands on `#/review`). ArticleView consumes the param on mount, jumps, then
strips the suffix with `history.replaceState` so refresh does not re-jump.
**When to use:** SC#2 bidirectional jump.
**Example:**
```typescript
// Strip AFTER the jump commits — replaceState never fires hashchange (MDN-verified),
// so the router does not re-parse and no view re-mounts:
history.replaceState(null, "", `#/article/${articleId}`);
// Setting location.hash instead WOULD fire hashchange → setView(parseHash()) →
// view object identity change → ArticleView prop churn (and the [view] reset effect
// fires). replaceState is the only calm path.
```

### Pattern 6: Grouped rendering with honest orphan tail (D10-04/D10-05)
**What:** Sections ordered per the active sort; within a section, rows ordered by
position (`resolvedPosition?.start ?? position.start ?? Number.MAX_SAFE_INTEGER` — the
AnnotationsDrawer L75–79 sort key). Orphans render in a trailing
"Highlights without an article" group — the `UNMATCHED_SECTION_HEADING` vocabulary from
`src/portability/markdown.ts` L129. ISO-8601 `createdAt` strings compare
lexicographically == chronologically (the `orderSectionsByRecency` L238–239 precedent).

### Anti-Patterns to Avoid
- **Shared confirm/note dialog abstraction:** violates the explicit Pitfall 8
  structural-clone decision lineage (08-04, 09-05). Each destructive call site stays
  grep-verifiable in its own component.
- **Reusing NotePopover by mounting the review panel inside `useHighlightOverlay`:** the
  overlay provider is per-article and owns live `<mark>` state, debounced saves, and
  capture plumbing — dragging the panel inside it couples unrelated lifecycles.
- **Forking the resolver or scroll helpers:** REUSE-DO-NOT-FORK is load-bearing
  (resolution.ts header; ArticleView L1007–1008). Any divergence shifts anchors.
- **New Dexie store/version for panel needs:** no schema change is needed; a version
  bump would violate Pitfall 9 for zero benefit.
- **Virtualization at prototype scale:** tens of articles × a handful of highlights =
  low hundreds of plain React rows — trivially cheap next to the pagination engine's
  measurement work. Add complexity only when a measured corpus-scale risk exists
  (CONTEXT discretion: baseline is a plain list).
- **Silent tri-state filtering:** confidence=All must INCLUDE ambiguous/orphan rows;
  they are first-class (D10-05) — hiding them by default would break the "never
  silently hidden" SC#4.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tri-state anchor status | Re-implement quote matching | `resolveQuoteSelectorInText` (src/annotations/resolution.ts L179) | Any divergence shifts every anchor; the shipped core is e2e-proven cross-engine (Phase 5, Plan 05-05) |
| Whole-library reads | N+1 per-article `loadHighlights` loops or raw `db.highlights.toArray()` bypassing Zod | `loadAllHighlights`/`loadAllNotes` (Phase 9) | STATE-04 per-row validation + the documented N+1 pitfall (Phase 9 RESEARCH Pitfall 5) |
| Highlight+note cascade delete | Two separate store calls | `deleteHighlight` (highlightsStore L105–110) | The Dexie transaction already removes highlight AND its notes atomically (Pitfall 10) — one call, one rollback unit |
| Scrolling-mode scroll target | Custom offset→element math | `findScrollTarget` (src/reader/restoreLocation.ts L81) | Phase 2 machinery reused EXACTLY since 05-03 (handleNavigateBack L1041) |
| Paginated-mode page lookup | Custom page-search | `fragmentContainingOffset` (src/pagination/anchor.ts L94) | Owns the exactly-once page-range contract incl. overshoot clamp |
| Modal focus trap / Esc / inert backdrop | Any manual trap code | Native `<dialog>` + `showModal()` | Free trap + Esc + inert; the WipeConfirm→RemoveConfirm→ImportPreviewDialog lineage is the canonical mechanism |
| Focus restore on dialog close | Manual bookkeeping | The triggerRef-capture + `close`-listener-restore pattern (verbatim in all four dialogs) | showModal does NOT auto-restore; Pitfall 1 discipline is settled code |
| Date formatting | Manual string building | `Intl.DateTimeFormat(navigator.language, { dateStyle: "short" })` | Locale-correct, Baseline-wide; ArticleView L108 precedent with `"medium"` |
| Tag chip UI | New chip component | `TagFilter` as-is (D10-08) | aria-pressed + forced-colors discipline already shipped and a11y-tested |

**Key insight:** Phase 10's risk profile is *wiring and sequencing*, not algorithms.
Every algorithm is shipped. The plan's tasks should spend their verification budget on
route grammar regressions, on-mount jump races, and curation flows — not on new math.

## Common Pitfalls

### Pitfall 1: `location.hash` assignment re-triggers the router during suffix strip
**What goes wrong:** Stripping `/h/<hid>` via `window.location.hash = "#/article/<id>"`
fires `hashchange` → `setView(parseHash())` → a NEW view object identity → the `[view]`
reset effect (App.tsx L157–160, drawer/count reset) re-runs and ArticleView takes a
prop churn right after the jump — focus can be knocked off the `<mark>`.
**Why it happens:** Any hash mutation through navigation APIs fires the event; only
History-API writes are silent.
**How to avoid:** `history.replaceState(null, "", "#/article/<id>")` — replaces the
current entry, updates the URL bar, fires NOTHING. [CITED: MDN History/replaceState]
**Warning signs:** e2e flakiness where focus lands on body after a jump; Back behaving
as if an extra entry existed.

### Pitfall 2: On-mount jump races three async settles
**What goes wrong:** The `h`-param jump needs (a) the article loaded, (b) highlights
loaded AND resolved (`resolvedPosition` non-null requires the annotation state's async
Dexie read + resolution), and (c) in paginated mode, the FIRST pagination commit
(`surfaceRef.getPages()` non-empty). Firing on `[article]` alone jumps against zero
pages or an unresolved highlight → silent no-op or wrong page.
**Why it happens:** The drawer's proven `handleNavigateBack` (ArticleView L1015–1059)
runs mid-session when all three are settled; mount-time is the one moment none are.
**How to avoid:** A dedicated effect mirroring the location-restore effect's shape
(cancelled flag + rAF, ArticleView L811–857) that waits for readiness — e.g. re-check
on each render of `[article, highlightsResolved, pagesReady]` state, or a bounded rAF
retry loop until `getPages().length > 0`. Reuse `handleNavigateBack`'s tail verbatim
(`fragmentContainingOffset`→`turnToPage` | `findScrollTarget`→`scrollIntoView`, then
`focusMark` with BOTH `requestAnimationFrame` AND `setTimeout(120)` — the Firefox
scroll-settle guard at L1046–1056).
**Warning signs:** Jump works in scrolling mode but intermittently lands on page 1 in
paginated mode, especially on WebKit/Firefox.

### Pitfall 3: Location-restore and h-jump double-restore conflict
**What goes wrong:** ArticleView's location-restore effect (L811–857) scrolls to the
saved reading position on EVERY article mount. With an `h` param, two restores race;
the loser wins depending on rAF ordering — the reader can land at their saved position
instead of the highlight.
**Why it happens:** Both effects key on `[article]` with rAF deferral.
**How to avoid:** When a jump param is present and consumed, suppress or sequence the
location-restore (e.g. the h-jump effect sets a ref/state the restore effect checks, or
the restore effect skips once when `jumpHighlightId` was provided). Deep-link jump
should win — the reader explicitly asked for the highlight.
**Warning signs:** e2e asserting the `<mark>` is in the viewport after deep-link
flakes between engines.

### Pitfall 4: Deep-link to an unresolvable or foreign-id highlight
**What goes wrong:** The `/h/<hid>` suffix survives in a URL after the highlight was
deleted in another tab, or arrives hand-typed/hand-edited; or an IMPORTED bundle
contains a highlight whose id has characters outside `[a-z0-9-]+` (HighlightRecord.id
is plain `z.string()` — bundle ids are foreign-controlled strings; only locally minted
ids are guaranteed lowercase UUIDs).
**Why it happens:** Route grammar is a public input surface.
**How to avoid:** (1) Use `[^/]+` for the highlightId capture group (path-segment-safe;
the value is only ever used for `Array.find` lookups and `getElementById("hl-"+id)` —
never innerHTML — so a permissive class carries no injection risk). (2) Treat a
nonexistent/unresolvable highlight as a CALM no-op: article opens normally, suffix
stripped, no error surface (honest failure = nothing happens beyond normal open — the
DOC-06 spirit; the drawer precedent disables jump for unresolved rows).
**Warning signs:** An e2e that deep-links a deleted highlight id and expects a crash —
it should expect the plain article view.

### Pitfall 5: parseHash regression breaks Gap 3 / unknown-route fallbacks
**What goes wrong:** The extended regex accidentally captures `#/review` as an article
id (`review` matches `[a-z0-9-]+`), or unknown `#/deep-links` stop mapping to the list.
**Why it happens:** Route-order and alternation mistakes.
**How to avoid:** Order matters — test the article-with-suffix form, then
article-plain, then `#/review`, then unknown `#/foo` → list, then Gap 3 fragment-only
hashes (`#fn-1` must NOT swap views). `tests/component/App.test.tsx` L51–71 already
covers the current cases — EXTEND it (strengthen-only).
**Warning signs:** `App.test.tsx` failures; footnote back-links dumping the reader to
a list.

### Pitfall 6: Panel delete leaves stale UI (missing re-derivation)
**What goes wrong:** `deleteHighlight` succeeds in Dexie but the grouped list still
shows the row (or its note preview) until reload.
**Why it happens:** The derivation ran once on mount (LibraryView's load effect runs
ONCE per mount — the 08-05 `page.reload()` lesson).
**How to avoid:** The `refreshKey` bump pattern (LibraryView L66, L170) — after
delete/edit commits, bump a state key that re-triggers the load+derive effect.
**Warning signs:** e2e deleting then counting rows without a reload.

### Pitfall 7: Note edit loses the debounced save on close
**What goes wrong:** A dialog cloned from NotePopover inherits its debounced-save
discipline but misses the `close`-listener flush (`flushNoteSave` at NotePopover
L143–144) — Esc-closing drops the last keystrokes.
**Why it happens:** Structural cloning copies structure; the flush lives in an effect
dependency array that's easy to trim.
**How to avoid:** For the panel clone, prefer IMMEDIATE save on Done + flush-on-close
(the panel is not selection-adjacent; simplicity wins at prototype scale) — or clone
the debounce + flush pair faithfully. Either way: every close path (Done/Esc/delete)
routes through one cleanup. The 09-06 lesson: Esc-originated closes MUST route through
the same cleanup as button closes.
**Warning signs:** Note text differs between pre-close and post-reopen in e2e.

### Pitfall 8: h1 discipline and live-region parity on the new page
**What goes wrong:** The review page ships without its own `<h1>` (breaking
one-h1-per-page — 01-04 precedent) or announces results visually only (no `.status`
role=status aria-live=polite aria-atomic — LibraryView L112–123 pattern).
**Why it happens:** Copying drawer markup (which uses h2 inside the article page)
instead of page markup.
**How to avoid:** ReviewView renders `<main id="main">` + `<h1>` (skip-link target
parity with LibraryView/ArticleView); empty states (D10-10) AND curation results
(D10-12 "Highlight removed.") announce through the `.status` live region.
**Warning signs:** a11y.spec / axe findings; SR flows losing page context.

### Pitfall 9: Scroll-position loss on Back to #/review
**What goes wrong:** After jumping to an article and pressing Back, the review panel
remounts scrolled to top — the reader loses their place in a long review list.
**Why it happens:** Hash routing unmounts/remounts views; no scroll restoration.
**How to avoid:** Accept it for Phase 10 (LibraryView has identical behavior; the
GROUPED layout plus filters mitigate re-orientation). Document as a known limitation —
do not add scroll-restoration machinery in this phase.
**Warning signs:** Scope creep toward sessionStorage scroll caches.

### Pitfall 10: Header chrome assumptions on the third view
**What goes wrong:** Assumptions baked into a two-view world break: e.g. wiring the
Review entry into `Header` (wrong — D10-02 places it in the LibraryView cluster), or
expecting the annotations-trigger to appear on #/review (it shows only when
`articleMounted` — Header L98 — which is false on review; correct behavior).
**How to avoid:** No Header changes in Phase 10. The mode-toggle already falls back to
a preference flip when no article is mounted (App.tsx L165–173) — on #/review the
button either works as preference-flip or hides per its existing articleMounted gating;
verify whichever the current Header implements and keep it byte-stable.
**Warning signs:** e2e diffs on header button visibility across the three views.

## Code Examples

Verified patterns from the codebase (read this session) — task actions should
reference these rather than inventing shapes.

### Jump pipeline (the exact tail to reuse on mount)
```typescript
// Source: src/routes/ArticleView.tsx L1015–1059 (handleNavigateBack — D5-11)
const resolved = api.highlights.find((h) => h.record.id === highlightId);
if (!resolved || !resolved.resolvedPosition) return;   // unresolved → calm no-op
const offset = resolved.resolvedPosition.start;

if (isPaginated) {
  const surface = surfaceRef.current;
  const pages = surface?.getPages();
  if (surface && pages && pages.length > 0) {
    const pageIdx = fragmentContainingOffset(pages, offset, article);
    surface.turnToPage(pageIdx);
  }
} else {
  const blocks = queryBlocks(articleRef.current);
  const target = findScrollTarget(article, blocks, offset);
  target?.scrollIntoView({ block: "center" });
}
// Firefox settle guard — BOTH calls, verbatim:
const focusMark = () => {
  document.getElementById(`hl-${highlightId}`)?.focus();
};
requestAnimationFrame(focusMark);
window.setTimeout(focusMark, 120);
```

### Whole-library tri-state join (ready-made row shape + orphan rule)
```typescript
// Source: src/portability/markdown.ts L98–119 (collectHighlightEntries)
const articleById = new Map(articles.map((a) => [a.id, a] as const));
const noteByHighlightId = new Map(notes.map((n) => [n.highlightId, n] as const));
for (const highlight of highlights) {
  const note = noteByHighlightId.get(highlight.id);
  const article = articleById.get(highlight.articleId);
  let status;
  if (!article) status = "orphan";                 // absent article → orphan, KEEP the row
  else {
    const resolved = resolveQuoteSelector(article, highlight.quote, highlight.position);
    status = resolved === "ambiguous" || resolved === "orphan" ? resolved : "confident";
  }
  entries.push(note ? { highlight, note, status } : { highlight, status });
}
// Phase 10 difference (D10-13): swap the per-highlight resolveQuoteSelector call for
// the MEMOIZED form — resolveQuoteSelectorInText(memo.clustersFor(article), …) —
// mirroring conflicts.ts L213–227. Shape identical; cost per article not per highlight.
```

### Sort keys (three verified precedents)
```typescript
// Position-within-section (Source: AnnotationsDrawer.tsx L75–79):
const start = h.resolvedPosition?.start ?? h.record.position.start ?? Number.MAX_SAFE_INTEGER;

// Date (Source: markdown.ts L238–239 — ISO-8601 lexicographic == chronological):
l.savedAt > prev.savedAt   // same holds for HighlightRecord.createdAt

// Article title (Source: markdown.ts L253):
a.provenance.title.localeCompare(b.provenance.title)
```

### Native dialog open/close sync (clone for both new dialogs)
```typescript
// Source: src/ingestion/library/RemoveConfirm.tsx L50–85 (the shortest canonical form)
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  if (open && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null;  // Pitfall 1 capture
    dlg.showModal();
    dlg.querySelector<HTMLElement>("[data-initial-focus]")?.focus();    // WebKit quirk
  } else if (!open && dlg.open) {
    dlg.close();
  }
}, [open]);
// close listener restores triggerRef.current?.focus(); [data-initial-focus] sits on the
// NON-destructive button (Pitfall 8 — accidental Enter cannot delete).
```

### Review row jump navigation (history push — Back returns to #/review)
```typescript
// Row click: plain navigation — hash assignment PUSHES a history entry, which is
// exactly what SC#2 needs (Back → #/review). No bespoke state handoff.
window.location.hash = `#/article/${articleId}/h/${highlightId}`;
// Confident rows only — ambiguous/orphan rows render no jump affordance
// (AnnotationsDrawer L184 `disabled={isUnresolved}` precedent + D10-03 orphan rule).
```

### Existing e2e seeding helpers (do not fork)
```typescript
// Source: tests/e2e/portability/_portability.ts L191–305 — seedRows(page, SeedRows),
// makeArticle({...}), confidentHighlightOn(article, ...), highlightRow({...})
// Seed a multi-article corpus incl. an ORPHAN (highlightRow.articleId = "ghost-article")
// and an AMBIGUOUS highlight (exact text duplicated inside one article body) —
// the tri-state e2e matrix falls out of these two knobs.
// Deterministic state: reuse wipeDatabase (annotations/_fixtures.ts L44) or the
// clear-rows beforeEach discipline (07-07 cross-engine lesson).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two-view hash router | Three-view (`#/`, `#/article/<id>`, `#/review`) | Phase 10 (this phase) | parseHash alternation + View union extension; Gap 3 guard untouched |
| Per-article annotations surface only (drawer) | Cross-article review route | Phase 10 | The drawer stays (D10-02: no second entry point inside ArticleView) |
| URL hash mutation for URL updates | `history.replaceState` for silent strips | Platform-stable (Baseline 2015) | Only silent way to change the hash without re-triggering hashchange routing |

**Deprecated/outdated:** nothing in this phase's surface is deprecated. All platform
APIs used (`<dialog>`/showModal, hashchange, replaceState, Intl.DateTimeFormat,
localeCompare) are Baseline-wide and already shipped in earlier phases.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Review rows navigate via `location.hash` assignment (pushes history) — inferred from the hash-routing architecture; no code yet assigns hashes outside LibraryView's remove fallback (L177). | Pattern 5 / Code Examples | Low — if hash assignment somehow bypassed history, Back would not return to #/review; e2e SC#2 test catches it immediately |
| A2 | The `[view]` reset effect (App.tsx L157–160) firing on review↔article swaps is desirable (drawer/count reset) and needs no change. | Pitfall 1 / Architecture | Low — if it caused panel state loss it matters not: panel state is re-derived from Dexie on mount by design |
| A3 | Sticky group headers, badge tokens, exact h1/copy strings, and the short-date variant are agent-discretion items resolvable during implementation (CONTEXT explicitly delegates them). | Discretion | None — delegated by CONTEXT.md |
| A4 | Notes do not need a `createdAt`; row date uses `highlight.createdAt` (NoteRecord only carries `updatedAt` — schema verified). | Row anatomy | Low — planner may surface note-edit recency instead; cosmetic |

**All other claims were verified against source files this session** (tagged
[VERIFIED: codebase] or cited from MDN). The seam classified webfetch provider as LOW
confidence despite MDN being official documentation; the two MDN-derived claims
(replaceState semantics, dateStyle) are tagged `[CITED: …]` (MEDIUM) accordingly and
are additionally corroborated by in-codebase usage (ArticleView L108 Intl usage;
LibraryView remove fallback hash behavior).

## Open Questions

1. **Where does `MemoizedArticleText` live?**
   - What we know: the class is module-private in `conflicts.ts`; D10-13 mandates the
     pattern; REUSE-DO-NOT-FORK applies to the resolution core, not the wrapper.
   - What's unclear: lift-and-export from conflicts.ts (shared) vs mirror in the review
     module with a citation comment.
   - Recommendation: lift-and-export from conflicts.ts (a 2-line export change, zero
     behavior change, one less twin). Fallback: mirror verbatim — both acceptable.

2. **Paginated-mode on-mount readiness signal.**
   - What we know: mid-session, `surfaceRef.getPages()` non-empty is the drawer's
     readiness gate; mount-time needs to wait for the first commit.
   - What's unclear: cleanest signal on mount (state already exposed by
     PaginatedSurface vs a bounded rAF retry loop in the effect).
   - Recommendation: bounded retry loop with the cancelled-flag discipline (no new
     API surface on PaginatedSurface; aborts cleanly on unmount/swap). Planner picks.

3. **Mode-toggle button visibility on #/review.**
   - What we know: `handleToggleMode` falls back to preference-flip when no article
     (App.tsx L165–173); Header's annotations-trigger hides when !articleMounted.
   - What's unclear: whether the mode-toggle is also article-gated in current Header
     markup (not re-verified line-by-line this session).
   - Recommendation: keep Header byte-stable; verify its existing gating in the e2e
     three-view smoke rather than changing it.

## Environment Availability

The phase is code-only on the existing toolchain (no new services, CLIs, or runtimes).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Vite 8 dev/build | ✓ | v22.22.3 (≥22.12 requirement met) | — |
| Vite dev server (:5173) | e2e webServer (auto-started by Playwright config) | ✓ | 8.1.5 | — |
| Playwright | e2e suite (chromium/firefox/webkit) | ✓ | 1.61.1 | — |
| Vitest | unit/component suite (jsdom projects) | ✓ | 4.1.10 | — |
| IndexedDB (`lem-reader`) | panel reads via Dexie | ✓ (browser-provided) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit + component, jsdom via `test.projects`) + Playwright Test 1.61.1 (e2e) |
| Config file | `vitest.config.ts` (projects: `unit` incl. tests/component/**, `server`), `playwright.config.ts` (chromium/firefox/webkit + chromium-throttled-mobile; webServer auto-starts Vite on :5173) |
| Quick run command | `npm run test:unit -- --run` |
| Full suite command | `npm run test` (unit + e2e, all engines — the honest-suite gate every phase since 04-11 uses) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RECV-01.a | `#/review` route swaps views; LibraryView entry button navigates | e2e | `npx playwright test tests/e2e/review-panel/route-entry.spec.ts` | ❌ Wave 0 |
| RECV-01.b | Panel lists every highlight+note across articles, grouped, with article/date/position metadata | e2e | `npx playwright test tests/e2e/review-panel/listing.spec.ts` | ❌ Wave 0 |
| RECV-01.c | Row jump lands on the highlight; Back returns to #/review (both reading modes) | e2e | `npx playwright test tests/e2e/review-panel/jump-bidirectional.spec.ts` | ❌ Wave 0 |
| RECV-01.d | Filter (tag/article/confidence AND-composed) + sort (date/article/position) behave per D10-08 | unit (pure derivation) + e2e smoke | `npm run test:unit -- --run tests/unit/review-filter.test.ts` | ❌ Wave 0 |
| RECV-01.e | Tri-state honest: ambiguous/orphan badges + orphan tail group; never silently hidden under All | unit (derivation) + e2e | `npx playwright test tests/e2e/review-panel/tri-state.spec.ts` | ❌ Wave 0 |
| RECV-01.f | Edit note in place (incl. orphan's note); delete highlight w/ confirm; note cascade stated; `.status` announcement; list re-derives | e2e | `npx playwright test tests/e2e/review-panel/curate.spec.ts` | ❌ Wave 0 |
| RECV-01.g | Empty states (no highlights at all vs filters-zero) via `.status` | e2e (or component) | `npx playwright test tests/e2e/review-panel/empty-states.spec.ts` | ❌ Wave 0 |
| RECV-01.h | parseHash: article+`/h/` grammar, `#/review`, unknown→list, Gap 3 fragments | unit (component) | `npm run test:unit -- --run tests/component/App.test.tsx` | ✅ exists — EXTEND (strengthen-only) |
| RECV-01.i | Deep-link refresh does not re-jump (replaceState strip) | e2e | (inside jump-bidirectional.spec.ts) | ❌ Wave 0 |
| Regress | Forced-colors / reduced-motion / keyboard reachability of the new page | e2e | existing `forced-colors.spec.ts`, `reduced-motion.spec.ts`, `panel-keyboard.spec.ts` + a11y.spec | ✅ exists — extend if selectors scoped |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run` (+ targeted `npx playwright test tests/e2e/review-panel/<spec>`)
- **Per wave merge:** `npm run test` (full suite, all engines — no subsets, no `--grep`, no engine skip; record fail counts honestly per the 04-11/09-07 anti-pattern guard)
- **Phase gate:** Full suite green before `/gsd-verify-work`; RECV-01 flips to Complete only at the plan proving end-to-end behavior (the 04-02/09-01 split precedent applies if foundations and behavior land in different plans)

### Wave 0 Gaps
- [ ] `tests/unit/review-filter.test.ts` — pure derivation coverage (filters AND, three sorts, orphan tail, tri-state join, ISO-date ordering) — RECV-01.d/e
- [ ] `tests/e2e/review-panel/` spec files — RECV-01.a/b/c/e/f/g/i (reuse `tests/e2e/portability/_portability.ts` seeders + `wipeDatabase` from `tests/e2e/annotations/_fixtures.ts`)
- [ ] `tests/component/App.test.tsx` — EXTEND parseHash cases (strengthen-only; keep existing 5 route cases + Gap 3 cases green)
- [ ] a11y pass: run existing `@axe-core/playwright`-backed a11y specs against `#/review` (add page to whichever spec enumerates routes)

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local-first single-user prototype; no auth surface (unchanged) |
| V3 Session Management | no | No sessions; browser-local state only |
| V4 Access Control | no | No server, no multi-user boundaries; IndexedDB is same-origin by default |
| V5 Input Validation | yes | Route params regex-constrained at parse (`[a-z0-9-]+` article id; recommend `[^/]+` for highlightId — lookup-only usage, never innerHTML); store rows Zod-validated on read (STATE-04 via loadAll*); note/quote text rendered as React text children only |
| V6 Cryptography | no | No new crypto; ids remain crypto.randomUUID() |
| V12 File Upload | no | No upload in this phase |
| V14 Configuration | no | No new config surface |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via note/highlight text (incl. imported-bundle rows) | Tampering | React text children (escaping by default); `react/no-danger` ESLint rule firing since Phase 1; NEVER raw HTML (Pitfall 8 lineage — NotePopover L48–51 precedent) |
| Route-param injection (`/h/<crafted>`) | Tampering | Param used ONLY for `Array.find` + `getElementById` prefix concat; regex-anchored grammar; no DOM-writing APIs in the path; unresolvable id = calm no-op (Pitfall 4) |
| href-based markup injection via `location.hash` assignment | Tampering | Hash values are template-built from validated ids; hashchange consumers re-parse through the same regex — unknown forms fall to list |
| Destructive-action accidental fire (Enter on focused delete) | Tampering (integrity) | `[data-initial-focus]` on the NON-destructive button in every confirm dialog; write fires ONLY in Proceed onClick (Pitfall 8) |
| Data loss on delete (note disappears with highlight) | Repudiation-ish (user trust) | Dialog copy states the cascade; `deleteHighlight` transaction makes it atomic — no orphaned half-state |
| Scope/prototype-pollution via foreign bundle ids in lookups | Tampering | Map/Set lookups only (`articleById.get`, `noteByHighlightId.get`); no dynamic property access from ids |

## Project Constraints (from AGENTS.md)

Directives extracted from the project root AGENTS.md (authoritative for planning):

- **GSD workflow enforcement:** All file-changing work goes through GSD entry points; no
  direct repo edits outside a GSD workflow. (This research itself runs under `/gsd-plan-phase`.)
- **Stack constraints (STACK.md embedded in AGENTS.md):** React 19 + Vite 8 SPA,
  TypeScript strict, **no router library** (hash routing, window.location.hash +
  hashchange — Phase 10 must extend `App.tsx`, not adopt a router), **no Redux/Zustand/
  XState** (React state/context + explicit domain services), **no Tailwind or component
  suite** (authored CSS layers + tokens; no hardcoded colors — the Phase 9 audit bar),
  **no `dangerouslySetInnerHTML`** (lint:no-danger + react/no-danger), **no page-number
  anchors** (normalized-text offsets + TextQuote selectors only — D10-13 re-derivation
  complies), **DOM emulators are not layout truth** (pagination/jump assertions belong
  to Playwright across chromium/firefox/webkit).
- **Accessibility constraints:** Semantic HTML, keyboard navigation, screen-reader
  compatibility, zoom, visible focus, reduced motion are foundational — the new route
  keeps one-h1-per-page, `.status` live regions, focus-restore discipline, and the
  global reduced-motion gate (no transition/animation properties on new selectors).
- **Persistence constraints:** Local-first via Dexie; version/migrate from first
  release; **never store derived page boundaries** (Phase 10 adds zero schema — no Dexie
  version bump, Pitfall 9 trivially held).
- **Performance constraint:** Repagination stability is the product's core promise — the
  review route adds NO measurement/pagination surface; keep it off the pagination
  hot path entirely (plain static list rendering).
- **Conventions:** None established yet in CONVENTIONS.md — follow existing codebase
  patterns documented in this research (they ARE the conventions).

## Sources

### Primary (HIGH confidence — codebase, read this session)
- `src/App.tsx` — router, Gap 3 guard, view swap, [view] reset effect, mode-toggle fallback
- `src/routes/ArticleView.tsx` — handleNavigateBack jump pipeline (L1015–1059), location-restore effect shape (L811–857), Intl date use (L108)
- `src/annotations/resolution.ts` — resolveQuoteSelectorInText tri-state core
- `src/portability/conflicts.ts` — MemoizedArticleText + resolveHighlightStatus pattern (L193–227)
- `src/portability/markdown.ts` — collectHighlightEntries join/orphan rule, HighlightEntry type, ghost-section heading, ISO/lexicographic + localeCompare sorts
- `src/persistence/highlightsStore.ts` / `notesStore.ts` — loadAll* contracts, deleteHighlight cascade transaction
- `src/ingestion/library/libraryFilter.ts`, `LibraryView.tsx`, `RemoveConfirm.tsx`, `TagFilter.tsx`, `tagsStore.ts` — derivation pattern, refreshKey, status live region, dialog clone lineage, chips
- `src/reader/annotations/AnnotationsDrawer.tsx`, `NotePopover.tsx` — row anatomy, sort key, truncation limits, dialog/focus discipline
- `src/pagination/anchor.ts`, `src/reader/restoreLocation.ts` — jump math helpers
- `src/content/schema.ts` — HighlightRecord/NoteRecord/Article shapes (id constraints)
- `tests/component/App.test.tsx`, `tests/e2e/annotations/_fixtures.ts`, `tests/e2e/portability/_portability.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json`

### Secondary (MEDIUM confidence)
- [CITED: developer.mozilla.org/en-US/docs/Web/API/History/replaceState] — replaces current entry, no hashchange/popstate, same-origin constraint
- [CITED: developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat] — dateStyle shortcuts incl. "short"; Baseline since 2017

### Tertiary (LOW confidence)
- None — no WebSearch-only claims were kept. (The seam rated provider `webfetch` LOW
  even for MDN; both MDN claims above are corroborated by in-codebase usage.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every reused module read in source this session
- Architecture: HIGH — all decisions (D10-01..13) map 1:1 onto read, cited precedent code; the only novel wiring (router extension, on-mount jump) is analyzed with concrete pitfalls
- Pitfalls: HIGH — 10 pitfalls each grounded in a specific verified file/line behavior or MDN-verified platform semantics
- Validation: HIGH — frameworks, configs, commands, and seeding helpers verified; Wave 0 gaps enumerated

**Research date:** 2026-08-15
**Valid until:** 2026-09-14 (stable — composition phase; revisit only if Phase 11/12 land schema or router changes first)




