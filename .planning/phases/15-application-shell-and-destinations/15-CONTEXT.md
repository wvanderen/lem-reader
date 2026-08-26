# Phase 15: Application Shell and Destinations - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 15 is the **v2.1 application shell** — the persistent frame that makes
Library and Highlights first-class destinations readers move among
predictably:

1. **NAV-01 — destination navigation.** A consistent shell (the app-header)
   carries direct Library ↔ Highlights navigation, visible in every
   destination including Reader.
2. **NAV-02 — brand as home.** The Lem Reader wordmark becomes a link that
   predictably returns to the Library (always the All view).
3. **NAV-03 — return-context restore.** Returning from Reader or Highlights
   (any return path) restores the prior Library filters, scroll position,
   and row focus.
4. **NAV-05 — context-appropriate controls.** Reading-only controls (mode
   toggle joins tags/annotations) appear only in reader context; globally
   meaningful preferences (SettingsPanel via the gear) stay available
   everywhere.
5. **POLISH-07 — shared geometry.** Library, Highlights, Add (as it exists
   today), and Reader share coherent gutters, headers, spacing, responsive
   behavior, and visible focus via a token audit + drift fixes.

**Phase 15 does NOT ship** (later phases — do not fold in):
- **Add as a shell destination / focused add workflow (ADD-01..04,
  LIB-09/LIB-10 search+tag filtering redesign, Continue Reading)** —
  Phase 16. The shell carries exactly two destinations: Library +
  Highlights. Add stays as today's in-page IngestControl.
- **Reader-owned metadata editing (META-*)** — Phase 17.
- **Reader TOC / orientation (ORNT-*)** — Phase 18.
- **Cross-block highlights (ANNO-08..12)** — Phase 19.
- **Local image fidelity (IMG-*)** — Phase 20.
- **Full Impeccable-informed audit matrix** — Phase 21 (POLISH-07's token
  audit here is scoped to drift fixes, not the final acceptance audit).

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- Destinations are history; views are state-within-destination (D14-13).
  Back returns to the previous destination at the originating view
  (D14-14); cold `#/` fallback lands on All; no last-used-view persistence.
- Reading-state views are real hash routes (`#/unread`, `#/in-progress`,
  `#/finished`) switched via `history.replaceState` + direct `setView`
  (D14-12/13); reload restores the view from the URL with no focus move
  (D14-17); unknown `#/` segments fall back to the All view (D14-16).
- h1-focus announcement substrate (D14-01/03/15): route swap → focus the
  incoming view's h1 (in-app swaps only); most-specific focus target beats
  the h1 default (D14-05); saved-location restore beats h1 (D14-10);
  error states get title + focus parity (D14-06).
- `hasAppHistory` gates `BackToLibrary`'s `history.back()` + `#/` fallback
  (D13-15).
- One h1 per page; `main#main` SkipLink target; per-destination
  `document.title` via `pageMeta.ts` with the "Lem Reader" suffix.
- Byte-stable e2e anchors (`<h1>Saved articles</h1>`, `.status`,
  `.library-list`); strengthen-only test discipline; honest full-suite gate
  (`npm run test` exit 0); calm DOC-06 voice for all copy.
- Hash router with NO router library; the Gap-3 fragment guard
  (`!hash.startsWith("#/")`) keeps `#fn-N` / `#fn-ref-N` / `#main` native
  scroll targets.
- Pitfall 9 Dexie discipline — Phase 15 needs NO store changes (restore
  state is session-scoped in-memory, not persisted).

</domain>

<decisions>
## Implementation Decisions

### Shell nav anatomy + geometry (NAV-01, POLISH-07)

- **D15-01: Destination nav lives IN the existing 48px app-header** —
  links inline-start beside the wordmark. One quiet row; no second nav
  strip; no per-view nav placement. Several CSS constants reference the
  48px geometry (banner top offsets, `restoreLocation.ts` header height)
  and stay valid.
- **D15-02: The nav is persistent in ALL three destinations** — Library,
  Highlights, AND Reader. The shell is always the same; reading position
  is saved anyway (`restoreLocation`), so leaving is non-destructive.
- **D15-03: POLISH-07 = token audit + drift fixes** — audit Library,
  Highlights, Add (as-is), and Reader against the existing tokens
  (`main#main` inset, `--space` scale, 48px header, measure) and fix
  drift where found. No new layout system, no shared shell layout
  component. Visual design details go to UI-SPEC.
- **D15-04: BackToLibrary STAYS** — at the head of Reader and Highlights
  content. With NAV-03 restore, its `history.back()` returns to the exact
  library spot; shell links are the always-visible direct route. The
  redundancy is calm and familiar (D13-15 preserved).

### Brand-home & destination naming (NAV-02, NAV-01)

- **D15-05: Brand always points to `#/` (All view)** — same target as the
  cold fallback (D14-14) and BackToLibrary's fallback. One predictable
  home, no hidden state, no view-tracking href.
- **D15-06: The destination renames to "Highlights"** — route
  `#/highlights`, h1 "Highlights", nav link "Highlights", title
  "Highlights — Lem Reader" (replacing "Review highlights" / `#/review`).
  Matches the milestone's "first-class Highlights destination" language
  and the header's existing "Highlights and notes" vocabulary.
- **D15-07: Old `#/review` URLs alias-redirect** — parseHash maps
  `#/review` to the Highlights destination, normalized to `#/highlights`
  (replaceState). Old bookmarks/exports keep working; the grammar keeps
  ONE canonical form.
- **D15-08: No Add destination in the shell** — exactly two destinations
  (Library + Highlights). Add remains today's in-page IngestControl until
  Phase 16's focused workflow exists. POLISH-07's mention of Add covers
  the surface as it exists today, not a placeholder.
- **D15-09: Brand link AND Library nav link coexist** — both target `#/`
  with different semantic roles (app-home vs destination). The Library
  nav link carries `aria-current="page"` when active; the brand does not.
- **D15-10: The brand link's accessible name is "Lem Reader" as-is** —
  the wordmark text IS the name; no "home" suffix.

### Return-context restore (NAV-03)

- **D15-11: Full restore set = view + query + tag + scroll + row focus.**
  The view comes from the URL (D14-12/D14-17); query + activeTag + scroll
  position restore from session state; focus lands on the row you
  launched from (most-specific target beats h1 — extends the
  D14-05/D14-10 layering that D14-08 deferred to this phase).
- **D15-12: Restore state lives in a session-scoped module** (or App-level
  state) — LibraryView reads on mount, writes on change/unmount. Mirrors
  the `readingState.ts`/`bookProgress.ts` store-seam discipline. NO Dexie
  writes; LibraryView stays unmountable; NO keep-alive hidden mount.
- **D15-13: ALL return paths restore — view-matched.** BackToLibrary
  (history.back), shell Library link, and brand all restore filters;
  scroll + row focus restore ONLY when the landing view matches the
  captured view (a `#/` link after you were in Unread lands on All
  fresh — honest, no mismatched scroll).
- **D15-14: Per-field graceful degradation.** Row gone (removed or
  filtered out of the view) → h1 focus (the D14-05 default); scroll
  beyond the new list height → clamp to bottom; view mismatch → filters
  still apply, scroll/focus reset. Never restore something that isn't
  true.

### Control context-gating (NAV-05)

- **D15-15: ModeToggle becomes reader-only** — joins tags/annotations
  behind the `articleMounted` gate. Header reads
  `[tags][annotations][mode][gear]` in Reader; shell nav + gear on
  Library and Highlights. "Pages vs scrolling" only means something with
  an article mounted.
- **D15-16: Gear everywhere is THE global-prefs mechanism** — the
  SettingsPanel (theme, typography, reading prefs, storage, import/
  export) stays reachable on all surfaces. No quick-controls added to
  the header itself.
- **D15-17: At narrow widths in Reader, the wordmark collapses** — below
  a breakpoint the wordmark visually collapses (brand link stays
  keyboard/SR-reachable) so destination links + the 4 icon buttons fit
  the 48px row. Touch targets stay 44px; no two-row wrap; no icon-only
  destination links.
- **D15-18: Article-scoped triggers stay in the shell header** — tags,
  annotations, and mode keep the current D5-09/D13-10 anatomy (gated),
  NOT moved into Reader content headers. Content headers carry only
  Back to library + titles.

### the agent's Discretion

- **Nav landmark shape** — `<nav aria-label>` naming (e.g. "Primary" vs
  "Destinations"), exact link styling, and how the nav relates to the
  existing `view-switcher` nav's label so the two landmarks stay
  distinct in the a11y tree.
- **Session module API shape** — module-level singleton vs App-lifted
  state vs a small store file beside `LibraryView.tsx`; when scroll is
  captured (unmount vs navigation-moment) as long as D15-13 holds.
- **View-match comparison mechanics** — how "landing view matches
  captured view" is derived (route segment compare at library mount).
- **Wordmark collapse breakpoint** — which width triggers the collapse;
  compact-mark vs visually-hidden treatment (brand link stays
  keyboard-reachable either way).
- **Alias-redirect implementation** — where `#/review` normalization
  happens (parseHash + replaceState ordering) as long as D15-07's
  single-canonical-form contract holds.
- **Row-focus target mechanics** — how the launched-from row is captured
  (article id in session state) and re-found after remount (row exists +
  visible in the restored view).
- **e2e spec structure** — shell-nav specs, restore specs (all three
  return paths × view-match matrix), gating specs across the 3-engine
  matrix; byte-stable anchors stay (strengthen-only discipline).
- **Title copy details** — exact Highlights title suffix ordering
  (mirrors the D14-02 convention already shipped).
- **Token audit ordering** — which surfaces drift most; what counts as
  drift vs intentional difference (e.g. Reader's paginated measure
  inset).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 15 goal + 5 success criteria
  (predictable destination movement; brand→Library; return restores
  filters + scroll; context-gated controls; shared surface geometry).
  `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — NAV-01/02/03/05 (§Navigation L11-15),
  POLISH-07 (§Polish L65); traceability table (Phase 15 rows).
- `.planning/PROJECT.md` — v2.1 milestone framing ("post-v2.0 feedback:
  organization feels incidental"); Key Decisions; Constraints (a11y
  foundational, honesty, local-first, calm).

### Prior-phase contracts this phase extends
- `.planning/phases/14-navigation-and-library-contracts/14-CONTEXT.md` —
  the full Phase 14 contract layer: D14-12/13/14/16/17 (view routes +
  history semantics the restore builds on), D14-01/03/05/10/15 (h1-focus
  substrate row-focus restore extends), D14-25 (constant library h1),
  D14-08 (the deferral this phase closes).
- `.planning/phases/14-navigation-and-library-contracts/14-04-SUMMARY.md`
  — L23/L165: "Phase 15 (NAV-03) inherits proven URL-restored views
  (D14-17) and the h1-focus substrate for row-level restore work."

### Source code contracts (READ before implementing)
- `src/App.tsx` — the hash router: `parseHash` grammar (D15-06/07 rename
  + alias land here), `VIEW_HREFS` constant table, `hasAppHistory`
  (L206-229), `switchLibraryView` replaceState path (L264-268), the
  three-view swap (L296-316) — the shell nav + restore wiring mounts
  here.
- `src/reader/Header.tsx` — the shell surface itself: wordmark span
  (BECOMES the D15-05 link), `.header-controls` group, `articleMounted`
  gating (D15-15 extends it to ModeToggle).
- `src/reader/BackToLibrary.tsx` — the kept D15-04 affordance;
  `hasAppHistory` contract unchanged.
- `src/ingestion/library/LibraryView.tsx` — restore integration point:
  query/activeTag state (L148-150), the mount + view-switch focus
  effects (L180-200), byte-stable anchors; the session module (D15-12)
  connects here.
- `src/routes/review/ReviewView.tsx` — the Highlights destination:
  `review-header` + BackToLibrary + h1 (L346-355) get the D15-06 rename
  pass.
- `src/ingestion/library/pageMeta.ts` — `setDocumentTitle` helper for
  the Highlights title.
- `src/app.css` — `.app-header`/`.app-wordmark` (L392-405), `main#main`
  shared inset (L199-214), `.view-switcher` (L2058-2075),
  `.back-to-library` (L3162+) — the D15-03 token audit + D15-17 collapse
  land here.
- `tests/e2e/` — existing view-route/focus/title specs (Phase 14) the
  shell specs extend; happy-path.spec anchors that must survive the
  `#/review` rename.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`Header.tsx` anatomy** — the 48px bar with `.header-controls`
  inline-flex grouping and `articleMounted` conditional rendering;
  destination links slot inline-start with zero structural change.
- **`aria-current="page"` link pattern** — the Phase 14 `view-switcher`
  (D14-22) already ships links-in-a-nav with aria-current; the
  destination nav mirrors it at the shell level.
- **`pageMeta.ts` / `setDocumentTitle`** — per-destination titles
  (D14-02) already flow through one helper; Highlights retitles through
  it.
- **`parseHash` unit-tested grammar** — the rename + alias ride an
  existing test surface with the D14-16 fallback discipline as the
  safety net.
- **`readingState.ts`/`bookProgress.ts` store-seam pattern** — the
  session restore module (D15-12) copies the pure-module +
  caller-owned-IO shape.
- **`restoreLocation.ts`** — the saved-position precedent for "capture
  on leave, restore on return, degrade calmly" that D15-11..14 mirror
  at the library level.

### Established Patterns
- Hash routing, no router library; constant-table hrefs (VIEW_HREFS)
  never interpolated — the D15-05/09 fixed `#/` targets preserve the
  T-14-04 same-origin-by-construction discipline.
- Byte-stable e2e anchors + strengthen-only test changes; honest
  full-suite gate (`npm run test` exit 0, fail counts recorded).
- One h1 per page; SkipLink first focusable; 44px touch targets;
  reduced-motion gates any motion; quiet-chrome rule (no accent fill,
  accent only for open/pressed states).
- Lifted shell state in App (`settingsOpen`/`drawerOpen`/`tagsOpen`) —
  the pattern the session-restore module composes with.
- Pitfall 9 additive-only Dexie discipline — no store changes expected
  this phase.

### Integration Points
- `App.tsx` — parseHash gains `#/highlights` + the `#/review` alias;
  the shell nav renders inside Header with destination props; restore
  state threads between Header/BackToLibrary and LibraryView.
- `Header.tsx` — wordmark becomes a link; destination nav added;
  ModeToggle joins the `articleMounted` gate; narrow-width collapse
  rule.
- `LibraryView.tsx` — reads session restore state on mount (view-match
  check, filters, scroll, row focus); writes it on change/unmount.
- `ReviewView.tsx` — rename pass (route-adjacent copy, h1, title).
- `src/app.css` — nav styles, wordmark collapse, token drift fixes.
- `tests/e2e/` — shell nav specs, three-path restore matrix, control
  gating, rename compat across chromium/firefox/webkit.

</code_context>

<specifics>
## Specific Ideas

- **"The shell is always the same"** — the deliberate theme of
  D15-02/D15-18: no context-dependent nav placement, no collapsed
  menus, no per-view shells. Predictability over minimal chrome.
- **"One predictable home"** — brand, cold fallback, and BackToLibrary
  fallback all converge on `#/` All (D15-05); the Library nav link is
  the destination-flavored twin, not a second behavior.
- **"Never restore something that isn't true"** — D15-13/D15-14's
  honesty principle: a view mismatch lands fresh rather than
  restoring mismatched scroll; a vanished row falls back to h1 rather
  than guessing.
- **Two same-target links is a feature** — brand (app-home) and Library
  (destination) deliberately coexist (D15-09); semantic roles differ
  even though the href matches.

</specifics>

<deferred>
## Deferred Ideas

- **Add as a shell destination / focused add workflow** — Phase 16
  (ADD-01..04, LIB-09/LIB-10); this phase's shell carries exactly two
  destinations (D15-08).
- **Quick header controls (e.g. theme toggle outside the panel)** —
  rejected for this phase (D15-16); revisit only if settings access
  friction is reported.
- **Splitting SettingsPanel into global vs reading sections** — rejected
  (D15-16 alternative); one calm panel stays.
- **Persisting library context (filters/scroll) across reloads** —
  rejected (D15-12); session-only mirrors D14-14's no-persistence
  stance. Revisit only on concrete reader demand.
- **Second nav row / per-view nav placement** — rejected (D15-01); the
  48px single-row shell is settled.
- **Icon-only destination links at narrow widths** — rejected (D15-17);
  text links + collapsed wordmark is the settled narrow-width answer.

</deferred>

---

*Phase: 15-application-shell-and-destinations*
*Context gathered: 2026-08-25*
