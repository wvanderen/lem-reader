# Phase 14: Navigation and Library Contracts - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 14 is the **v2.1 contract layer** — it makes destinations tell the truth
and makes reading-state classification derivable from ONE policy, so that
Phases 15–16 can build the shell and organized library on solid ground:

1. **NAV-04 — destination truthfulness.** Each destination (Library,
   Reader/ArticleView, Review) exposes a coherent page title
   (`document.title` — never managed before today), heading hierarchy,
   landmarks, predictable browser-history behavior, and a route-change focus
   policy.
2. **LIB-07 — reading-state views.** The reader can switch among All,
   Unread, In Progress, and Finished library views whose membership follows
   ONE documented progress policy (articles AND EPUB books).
3. **LIB-08 — agreement.** Counts, progress indicators, and empty states
   agree with view membership for articles and EPUB book-level aggregation.

**Phase 14 does NOT ship** (later phases — do not fold in):
- **App shell / predictable destination nav / brand-home / NAV-01/02/03/05 /
  POLISH-07** — Phase 15.
- **Row-level focus/scroll/filter restore on return** (NAV-03) — Phase 15;
  Phase 14's uniform h1 rule deliberately does not attempt it.
- **Search + tag filters within the selected view (LIB-09)** and the
  **Continue Reading redesign (LIB-10)** — Phase 16. The strip's surface
  stays; only its membership derivation may be refactored onto the policy
  module.
- **Add-to-Library focused workflow, metadata editing, reader TOC,
  cross-block highlights, images** — Phases 16–20.

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- `FINISHED_THRESHOLD = 0.98` grapheme-offset, exported from
  `src/ingestion/library/ContinueReadingStrip.tsx` (D8-12) — the single
  source; never fork the constant.
- Book progress = chapters-finished ratio over admitted `chapterArticleIds`
  (D12-03, `bookProgress.ts`); resume = latest-savedAt chapter (D12-07);
  "recently-read = opened" latest-savedAt fold (D8-10).
- One h1 per page; `main#main` SkipLink target; `hasAppHistory` gates
  BackToLibrary's `history.back()` + `#/` fallback (D13-15).
- LibraryView byte-stable e2e anchors: `<h1>Saved articles</h1>`, the
  `.status` live region, `.library-list` class (happy-path.spec etc.).
- Chapters never render top-level; books partition out of the article list
  by `ingestionMeta.bookId` (D12-01).
- Hash router with NO router library; the fragment guard
  (`!hash.startsWith("#/")`) keeps `#fn-N` / `#fn-ref-N` / `#main` native
  scroll targets (Gap 3).
- Honest full-suite phase gate (`npm run test` exit 0); Pitfall 9 Dexie
  discipline (NO store changes expected this phase — the policy derives from
  existing rows); calm DOC-06 voice for all new copy.

</domain>

<decisions>
## Implementation Decisions

### Route-change focus + titles (NAV-04)

- **D14-01: Route swap → focus the incoming view's h1** (tabindex=-1
  pattern). One h1 per destination is already locked discipline; SR +
  keyboard users land at the new context's start.
- **D14-02: Per-destination document.title.** Library / article title /
  Review highlights each set a truthful title with a "Lem Reader" suffix;
  the exact suffix/ordering convention is planner-confirmed.
- **D14-03: h1 focus fires on IN-APP swaps only.** Cold deep-link loads and
  reloads keep natural browser focus — never yank someone who opened a link
  to read a specific spot.
- **D14-04: Landmark work = verify + new-UI only.** Audit existing
  coherence (header, `main#main`, one h1); the new view-switcher control
  gets its own landmark (`<nav>`). No restructuring of existing landmarks.
- **D14-05: Most-specific focus target wins.** The deep-link jump
  (`#/article/<id>/h/<hl>`) keeps focusing the highlight; h1 focus is the
  DEFAULT when no more-specific target exists.
- **D14-06: Error states get full title + focus parity.** "Couldn't open
  this article" is a truthful destination — it gets its own title and h1
  focus. Honesty principle applied to failures.
- **D14-07: EPUB chapters title as "Chapter title — Book title — Lem
  Reader"** (mirrors the D12-08 reader context line — the tab says where in
  the book you are).
- **D14-08: Return-to-library uses the uniform h1 rule.** Row-level
  focus/scroll restore is Phase 15's NAV-03 problem, not a Phase 14
  contract.
- **D14-09: Focus alone announces the route change.** The h1 focus move IS
  the announcement (SR reads the focused heading); no extra live-region
  chatter.
- **D14-10: Saved-location restore beats the h1 default.** On in-app entry
  to a resumed article, focus lands at/near the restored position — h1
  focus applies to fresh articles with nothing to restore (extends the
  D14-05 layering; never fight the restore scroll).
- **D14-11: Routes only.** `document.title` + focus policy apply to ROUTE
  changes; overlays (SettingsPanel, drawers, dialogs, popovers) never touch
  title/focus and keep their existing trap/return discipline.

### History + view-state contract (NAV-04)

- **D14-12: Reading-state views are REAL hash routes** (dedicated segments,
  e.g. `#/unread`; exact segment names planner-confirmed). Truthful
  shareable URLs; Phase 15's restore inherits "which view" from the URL.
- **D14-13: View switch = replaceState.** Destinations are history; views
  are state-within-destination. Back from the library returns to the
  previous DESTINATION, never walks intermediate view switches.
- **D14-14: Back-from-article returns to the originating view; the cold `#/`
  fallback lands on All.** No last-used-view persistence.
- **D14-15: View switches get the same h1 focus treatment** — one uniform
  rule: any full-content swap announces via h1 focus.
- **D14-16: Unknown `#/` segments fall back to the All view** — the
  existing parseHash fallback discipline (bad deep links → list) extended;
  no new error surface.
- **D14-17: Reload is a cold load.** The URL restores the view
  (`#/finished` stays Finished); no focus move (D14-03 extended).

### Progress policy edges (LIB-07)

- **D14-18: Opened = In Progress; Unread = never opened.** Any
  LocationRecord (even 0%) means started — matching the strip's existing
  behavior and D8-10 "recently-read = opened". One policy across all
  surfaces.
- **D14-19: Book Finished = ALL admitted chapters individually ≥98%**
  (D12-03's ratio === 1.0). No second threshold; a 40-chapter book with 39
  finished is honestly In Progress.
- **D14-20: ONE pure policy module owns the derivation.** A new pure module
  beside `bookProgress.ts` (e.g. `readingState.ts`) computes
  `unread | in-progress | finished` for articles AND books from existing
  rows (zero new measurement). Views, counts, hairlines, the strip, and
  BookRow all consume it; the `LibraryRow` FINISHED_RATIO fork is DELETED
  (known tech debt closed).
- **D14-21: Honest admitted-chapter denominator.** A book whose chapter
  row is missing (partial import) can never read Finished — it stays
  honestly In Progress with 11/12 done. No-silent-garbage principle.

### View switcher + counts + empty states (LIB-07/08)

- **D14-22: Switcher anatomy = links in a `<nav>` with
  `aria-current="page"`.** Views ARE routes; native link semantics, no
  tablist machinery.
- **D14-23: Counts live in the switcher labels' accessible names** —
  "Unread (3)" — derived from the same D14-20 policy module so counts
  CANNOT disagree with membership.
- **D14-24: One item per book per view.** A book counts as ONE row/item in
  whichever view its state assigns (matching D12-01 — chapters never
  top-level). Counts and visible rows can never disagree.
- **D14-25: LibraryView's h1 stays constant "Saved articles"** across all
  views — byte-stable e2e anchor preserved; the URL, the nav's
  aria-current, and the switcher state carry WHICH view.
- **D14-26: Per-view empty-state copy.** Each view gets its own calm,
  honest copy in the D8-04 voice (All keeps the existing copy; e.g.
  Unread: "Nothing unread — everything here has been started."). Exact
  words are planner/UI-SPEC.

### the agent's Discretion

- **Exact view-segment names** (`#/unread` vs alternatives; consistent
  grammar with the existing `/h/` suffix form).
- **Exact title convention** — suffix shape, ordering, truncation rules for
  very long article/chapter/book titles.
- **`readingState.ts` API shape** — how article and book derivations
  unify; how text-length lookups thread through (mirror `bookProgress.ts`'s
  caller-supplied lookup pattern).
- **Where title/focus effects live** — App.tsx view-swap effect vs per-view
  mount effects (the layering rules D14-05/D14-10 are the contract; the
  wiring is planner's).
- **Count label formatting** — parenthetical text, AT phrasing, whether
  counts update on the existing refreshKey load cycle.
- **Sort order within views** — recently-added descending (D8-03) is the
  default expectation; confirm it applies uniformly.
- **ContinueReadingStrip refactor scope** — may consume the policy module
  (behavior unchanged); surface changes are Phase 16's.
- **e2e spec structure** — view routes, counts, empty states, focus/title
  assertions across the 3-engine matrix; byte-stable anchors stay
  (strengthen-only discipline).
- **Scroll behavior on view switch** — reset to list top is the expected
  shape (content replaced); confirm during planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 14 goal + 3 success criteria (coherent
  destination behavior; All/Unread/In Progress/Finished under one progress
  policy; counts/progress/empty states agreeing incl. EPUB book-level
  aggregation). `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — NAV-04 (§Navigation L14), LIB-07 + LIB-08
  (§Library Organization L19-20); traceability table (Phase 14 rows).
- `.planning/PROJECT.md` — v2.1 milestone framing ("post-v2.0 feedback:
  organization feels incidental"); Key Decisions; Constraints (a11y
  foundational, honesty, local-first).

### Prior-phase contracts this phase extends
- `.planning/milestones/v2.0-phases/13-polish-and-acceptance/13-CONTEXT.md`
  — D13-15 (Back-to-library affordance + `hasAppHistory` guard the focus
  rules compose with); D13-16 (the bounded library tidy Phase 14's views
  build on).
- `.planning/milestones/v2.0-phases/12-epub-intake/12-CONTEXT.md` —
  D12-01 (book grouping; chapters never top-level), D12-03 (chapters-
  finished ratio — D14-19's basis), D12-07 (resume = latest-savedAt),
  D12-08 (chapter context line D14-07 mirrors).
- `.planning/milestones/v2.0-phases/08-markdown-pipeline-and-personal-library/08-CONTEXT.md`
  — D8-04 (calm empty-state voice D14-26 reuses), D8-10 (recently-read =
  opened — D14-18's basis), D8-12 (finished threshold ≈98%).

### Source code contracts (READ before implementing)
- `src/App.tsx` — the hash router: `parseHash` grammar (D14-12 extends),
  the fragment guard, `hasAppHistory` (L173-196), the view-swap effect
  (L202-206) — the mount point for D14-01/D14-02 wiring.
- `src/ingestion/library/LibraryView.tsx` — the library surface: byte-stable
  anchors (L6-14), the parallel load effect + latest-savedAt fold
  (L104-154), the book/article partition — the view-switcher nav, per-view
  filtering, counts, and empty states land here.
- `src/ingestion/library/libraryFilter.ts` — the pure-filter discipline
  (query + activeTag compose; chapter members excluded) the reading-state
  filter extends.
- `src/ingestion/library/bookProgress.ts` — D12-03/D12-07 derivations the
  policy module composes; the pure-module pattern (no React, no Dexie,
  caller-supplied lookups) D14-20 mirrors.
- `src/ingestion/library/ContinueReadingStrip.tsx` — `FINISHED_THRESHOLD`
  export (the single source D14-20 must NOT fork); strip membership filter
  (L128) that must agree with D14-18.
- `src/ingestion/library/LibraryRow.tsx` — the FINISHED_RATIO fork D14-20
  deletes.
- `src/routes/ArticleView.tsx` — error-state h1 (L1687), deep-link jump
  focus (L1381), location-restore effect — the D14-05/D14-10 layering
  sites; article h1 (L1959).
- `src/routes/review/ReviewView.tsx` — the third destination (D10-01
  one-h1 shape) needing title parity.
- `src/reader/BackToLibrary.tsx` — `history.back()` + `#/` fallback the
  view routes must not break.
- `index.html` — the static title D14-02 replaces per-destination.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`bookProgress.ts` pure-derivation pattern** — no React, no Dexie, no
  new measurement; components own reads, the module owns algebra. The
  D14-20 policy module copies this shape exactly.
- **The latest-savedAt fold** — already implemented identically in
  `LibraryView` (L122-128), `ContinueReadingStrip`, and `bookProgress.ts`;
  the policy module becomes its fourth (and final) consumer.
- **`FINISHED_THRESHOLD` export** — the 0.98 constant already has a single
  owner; the policy imports it, never redefines it.
- **`parseHash` unit-tested grammar** — extending it with view segments
  rides an existing test surface.
- **`.status` live-region + calm DOC-06 voice** — the copy pattern for
  per-view empty states.

### Established Patterns
- Pure modules beside components (store-seam discipline); Zod-at-boundary
  unchanged (no schema changes expected).
- Byte-stable e2e anchors; strengthen-only test changes; honest full-suite
  gate (`npm run test` exit 0, fail counts recorded).
- One h1 per page; SkipLink first focusable; reduced-motion gates any
  motion (none expected here).
- Hash routing with no router library — view routes extend the existing
  grammar rather than adding navigation dependencies.
- Pitfall 9 additive-only Dexie discipline — Phase 14 needs NO store
  changes (policy derives from existing rows at render time).

### Integration Points
- `App.tsx` — parseHash gains view segments; the view-swap effect gains
  title + h1-focus wiring (with the D14-03/D14-05/D14-10/D14-15 layering).
- `LibraryView` — the `<nav>` view switcher (D14-22), per-view row
  filtering via the policy module, counts in labels (D14-23), per-view
  empty states (D14-26).
- `readingState.ts` (NEW) — the one policy module; consumed by views,
  counts, the strip, `LibraryRow`, `BookRow`.
- `ArticleView` / `ReviewView` — per-destination titles (incl. error + EPUB
  chapter forms) and focus layering.
- `tests/e2e/` — view-route specs, count/empty-state agreement assertions,
  focus/title assertions across chromium/firefox/webkit.

</code_context>

<specifics>
## Specific Ideas

- **"One uniform rule: any full-content swap announces via h1 focus"** —
  the deliberate theme of D14-01/D14-15: route change and view switch are
  the SAME announcement mechanism; no second system to learn.
- **"Destinations are history, views are state within a destination"** —
  the mental model behind D14-13/D14-14; Back means "previous place," not
  "previous filter I tried."
- **"Counts CANNOT disagree with membership"** — D14-20 + D14-23 + D14-24
  exist so agreement is structural (single derivation + single counting
  unit), not a matter of keeping copies in sync.
- **Honesty extends to classification** — a partially-imported book that
  can never finish (D14-21) and a 39/40-chapter book that isn't Finished
  (D14-19) are the LIB-07 equivalents of tri-state annotation resolution:
  never silently round up.

</specifics>

<deferred>
## Deferred Ideas

- **Row-level focus/scroll/filter restore on return (NAV-03)** — Phase 15;
  Phase 14's uniform h1 rule deliberately does not attempt it (D14-08).
- **Search + tag filters within the selected view (LIB-09)** — Phase 16;
  Phase 14's views stay pre-filter surfaces.
- **Continue Reading treatment redesign (LIB-10)** — Phase 16; the strip's
  membership may be refactored onto the policy module now, but its surface
  is untouched.
- **Persisting last-used view across sessions** — explicitly rejected for
  now (D14-14); revisit only if readers report wanting it.
- **h1 mirroring the active view** — rejected (D14-25) to preserve
  byte-stable anchors; revisit only on concrete SR feedback.
- **Push-per-view-switch history entries** — rejected (D14-13); replaceState
  is the settled semantics.

</deferred>

---

*Phase: 14-navigation-and-library-contracts*
*Context gathered: 2026-08-24*
