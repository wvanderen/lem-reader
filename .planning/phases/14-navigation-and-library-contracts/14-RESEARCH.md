# Phase 14: Navigation and Library Contracts - Research

**Researched:** 2026-08-24
**Domain:** SPA route-change focus/title contracts (React 19 + hash router), pure reading-state policy derivation, hash-history semantics (replaceState vs push), Playwright 3-engine validation
**Confidence:** HIGH

## Summary

Phase 14 is a **contract layer built entirely from existing browser primitives and existing codebase patterns** — zero new dependencies. Four mechanical facts anchor everything: (1) `history.replaceState(null, "", "#/unread")` changes the URL with **no history entry and no `hashchange`/`popstate`** [VERIFIED: codebase ArticleView L1302-1309 + MDN replaceState], so D14-13 view switches require click interception + a direct router state update; (2) `tabindex=-1` + `element.focus()` is the W3C-sanctioned route-change focus pattern, and focus() scrolls the element into view by default (preventScroll is the opt-out) [CITED: W3C APG, MDN focus]; (3) `aria-current="page"` on exactly one link of a `<nav>` is the correct "which view am I in" semantic — links, not tablist [CITED: MDN aria-current]; (4) the `bookProgress.ts` pure-module shape (no React, no Dexie, caller-supplied lookups) is the proven template for `readingState.ts`, and `deriveBookProgress(...) === 1` already encodes D14-19 + D14-21 exactly (missing chapter rows count unfinished) [VERIFIED: codebase].

The one genuinely novel design surface is the **replaceState view-switch wiring**: the current router only listens to `hashchange`, so a replaceState-driven switch must update view state through the same `setView(parseHash())` path via a direct call, not an event. The `<a href="#/unread">` stays real for shareability/middle-click; `onClick` with `preventDefault` gives replace semantics for the in-app gesture. Everything else — h1 focus, per-destination titles, counts — is additive wiring in files that already exist.

`document.title` is currently **never written anywhere in `src/`** [VERIFIED: repo grep — zero matches]; the static `<title>Lem Reader</title>` in `index.html` is the only title today. NAV-04's title work is 100% new code with no migration concerns.

**Primary recommendation:** Ship four coordinated pieces in this order — (1) `readingState.ts` pure policy module + unit tests (highest value, zero UI risk), (2) `parseHash` view-segment grammar + replaceState switch wiring + App.test.tsx extension, (3) LibraryView `<nav>` switcher + per-view filtering + counts + empty states, (4) per-destination title + h1-focus effects with the D14-05/D14-10 layering inside ArticleView. Keep focus ownership **per-view** (not App-level) so ordering questions between parent/child effects never arise.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Route-change focus + titles (NAV-04)**
- **D14-01: Route swap → focus the incoming view's h1** (tabindex=-1 pattern). One h1 per destination is already locked discipline; SR + keyboard users land at the new context's start.
- **D14-02: Per-destination document.title.** Library / article title / Review highlights each set a truthful title with a "Lem Reader" suffix; the exact suffix/ordering convention is planner-confirmed.
- **D14-03: h1 focus fires on IN-APP swaps only.** Cold deep-link loads and reloads keep natural browser focus — never yank someone who opened a link to read a specific spot.
- **D14-04: Landmark work = verify + new-UI only.** Audit existing coherence (header, `main#main`, one h1); the new view-switcher control gets its own landmark (`<nav>`). No restructuring of existing landmarks.
- **D14-05: Most-specific focus target wins.** The deep-link jump (`#/article/<id>/h/<hl>`) keeps focusing the highlight; h1 focus is the DEFAULT when no more-specific target exists.
- **D14-06: Error states get full title + focus parity.** "Couldn't open this article" is a truthful destination — it gets its own title and h1 focus. Honesty principle applied to failures.
- **D14-07: EPUB chapters title as "Chapter title — Book title — Lem Reader"** (mirrors the D12-08 reader context line — the tab says where in the book you are).
- **D14-08: Return-to-library uses the uniform h1 rule.** Row-level focus/scroll restore is Phase 15's NAV-03 problem, not a Phase 14 contract.
- **D14-09: Focus alone announces the route change.** The h1 focus move IS the announcement (SR reads the focused heading); no extra live-region chatter.
- **D14-10: Saved-location restore beats the h1 default.** On in-app entry to a resumed article, focus lands at/near the restored position — h1 focus applies to fresh articles with nothing to restore (extends the D14-05 layering; never fight the restore scroll).
- **D14-11: Routes only.** `document.title` + focus policy apply to ROUTE changes; overlays (SettingsPanel, drawers, dialogs, popovers) never touch title/focus and keep their existing trap/return discipline.

**History + view-state contract (NAV-04)**
- **D14-12: Reading-state views are REAL hash routes** (dedicated segments, e.g. `#/unread`; exact segment names planner-confirmed). Truthful shareable URLs; Phase 15's restore inherits "which view" from the URL.
- **D14-13: View switch = replaceState.** Destinations are history; views are state-within-destination. Back from the library returns to the previous DESTINATION, never walks intermediate view switches.
- **D14-14: Back-from-article returns to the originating view; the cold `#/` fallback lands on All.** No last-used-view persistence.
- **D14-15: View switches get the same h1 focus treatment** — one uniform rule: any full-content swap announces via h1 focus.
- **D14-16: Unknown `#/` segments fall back to the All view** — the existing parseHash fallback discipline (bad deep links → list) extended; no new error surface.
- **D14-17: Reload is a cold load.** The URL restores the view (`#/finished` stays Finished); no focus move (D14-03 extended).

**Progress policy edges (LIB-07)**
- **D14-18: Opened = In Progress; Unread = never opened.** Any LocationRecord (even 0%) means started — matching the strip's existing behavior and D8-10 "recently-read = opened". One policy across all surfaces.
- **D14-19: Book Finished = ALL admitted chapters individually ≥98%** (D12-03's ratio === 1.0). No second threshold; a 40-chapter book with 39 finished is honestly In Progress.
- **D14-20: ONE pure policy module owns the derivation.** A new pure module beside `bookProgress.ts` (e.g. `readingState.ts`) computes `unread | in-progress | finished` for articles AND books from existing rows (zero new measurement). Views, counts, hairlines, the strip, and BookRow all consume it; the `LibraryRow` FINISHED_RATIO fork is DELETED (known tech debt closed).
- **D14-21: Honest admitted-chapter denominator.** A book whose chapter row is missing (partial import) can never read Finished — it stays honestly In Progress with 11/12 done. No-silent-garbage principle.

**View switcher + counts + empty states (LIB-07/08)**
- **D14-22: Switcher anatomy = links in a `<nav>` with `aria-current="page"`.** Views ARE routes; native link semantics, no tablist machinery.
- **D14-23: Counts live in the switcher labels' accessible names** — "Unread (3)" — derived from the same D14-20 policy module so counts CANNOT disagree with membership.
- **D14-24: One item per book per view.** A book counts as ONE row/item in whichever view its state assigns (matching D12-01 — chapters never top-level). Counts and visible rows can never disagree.
- **D14-25: LibraryView's h1 stays constant "Saved articles"** across all views — byte-stable e2e anchor preserved; the URL, the nav's aria-current, and the switcher state carry WHICH view.
- **D14-26: Per-view empty-state copy.** Each view gets its own calm, honest copy in the D8-04 voice (All keeps the existing copy; e.g. Unread: "Nothing unread — everything here has been started."). Exact words are planner/UI-SPEC.

### the agent's Discretion
- **Exact view-segment names** (`#/unread` vs alternatives; consistent grammar with the existing `/h/` suffix form).
- **Exact title convention** — suffix shape, ordering, truncation rules for very long article/chapter/book titles.
- **`readingState.ts` API shape** — how article and book derivations unify; how text-length lookups thread through (mirror `bookProgress.ts`'s caller-supplied lookup pattern).
- **Where title/focus effects live** — App.tsx view-swap effect vs per-view mount effects (the layering rules D14-05/D14-10 are the contract; the wiring is planner's).
- **Count label formatting** — parenthetical text, AT phrasing, whether counts update on the existing refreshKey load cycle.
- **Sort order within views** — recently-added descending (D8-03) is the default expectation; confirm it applies uniformly.
- **ContinueReadingStrip refactor scope** — may consume the policy module (behavior unchanged); surface changes are Phase 16's.
- **e2e spec structure** — view routes, counts, empty states, focus/title assertions across the 3-engine matrix; byte-stable anchors stay (strengthen-only discipline).
- **Scroll behavior on view switch** — reset to list top is the expected shape (content replaced); confirm during planning.

### Deferred Ideas (OUT OF SCOPE)
- **Row-level focus/scroll/filter restore on return (NAV-03)** — Phase 15; Phase 14's uniform h1 rule deliberately does not attempt it (D14-08).
- **Search + tag filters within the selected view (LIB-09)** — Phase 16; Phase 14's views stay pre-filter surfaces.
- **Continue Reading treatment redesign (LIB-10)** — Phase 16; the strip's membership may be refactored onto the policy module now, but its surface is untouched.
- **Persisting last-used view across sessions** — explicitly rejected for now (D14-14); revisit only if readers report wanting it.
- **h1 mirroring the active view** — rejected (D14-25) to preserve byte-stable anchors; revisit only on concrete SR feedback.
- **Push-per-view-switch history entries** — rejected (D14-13); replaceState is the settled semantics.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-04 | Each destination exposes a coherent page title, heading hierarchy, landmarks, browser-history behavior, and route-change focus policy. | W3C APG focus-persistence guidance + tabindex=-1 pattern (§Pattern 1); replaceState/push history semantics (§Pattern 2); document.title effect pattern (§Pattern 3); per-destination title forms incl. error + EPUB chapter (§Pattern 3); Playwright `toHaveTitle`/`toBeFocused`/`toHaveURL` (§Validation). |
| LIB-07 | Reader can switch among All, Unread, In Progress, and Finished library views derived from one documented progress policy. | Hash-grammar extension of `parseHash` without breaking the fragment guard (§Pattern 2); `readingState.ts` pure module unifying article (FINISHED_THRESHOLD import, never forked) + book (deriveBookProgress === 1) derivations (§Pattern 4); `<nav>` + `aria-current="page"` switcher (§Pattern 5). |
| LIB-08 | Reader can see accurate counts, progress, and empty states for each derived library view, including EPUB book-level aggregation. | Single-derivation counts from the policy module (D14-20/23/24 make agreement structural); e2e seeding harness via raw IndexedDB rows (articles/books/location stores, §Validation); agreement assertions comparing rendered rows/counts/empty states against the same imported policy module. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **GSD workflow enforcement** — enter through GSD commands; no direct repo edits outside a workflow.
- **Stack discipline** — React 19 + Vite 8 SPA (`createRoot`, no SSR framework), TypeScript strict, semantic HTML + authored CSS (no Tailwind/component suite), no Redux/Zustand (React state + domain services), no router library (hash routing is a locked decision).
- **Never** `dangerouslySetInnerHTML` (lint:no-danger enforced); the canonical document model is the security boundary.
- **Browser primitives over dependencies** — Selection/Range, `document.fonts`, ResizeObserver, IndexedDB via Dexie behind repository seams.
- **Local-first persistence** — Dexie additive-only discipline (Pitfall 9: NO store changes this phase; policy derives from existing rows at render time).
- **Testing discipline** — DOM emulators are not authoritative for layout/focus-truth; Playwright 3-engine (chromium/firefox/webkit) owns real-browser behavior; honest full-suite gate (`npm run test` exit 0).
- **A11y foundational** — semantic HTML, one h1 per page, keyboard access, reduced motion, visible focus.
- **Honesty** — no silent garbage; calm DOC-06 voice for new copy; annotations never silently re-attach (and classification never silently rounds up — D14-19/D14-21).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hash route grammar (view segments) | App.tsx `parseHash` + `onHash` (SPA client) | — | The router owns parsing/fallback; the fragment guard (`!hash.startsWith("#/")`) is router-owned discipline (Gap 3). |
| View-switch history semantics (replaceState) | App.tsx router + switcher `onClick` | LibraryView (callback threading) | replaceState fires no hashchange, so the router must be called directly; the switcher link stays real for share/middle-click. |
| Route-change h1 focus | Each view (LibraryView / ArticleView / ReviewView) | — | ArticleView must layer against deep-link jump + saved-location restore (D14-05/D14-10); per-view ownership makes parent/child effect-ordering questions vanish. |
| `document.title` per destination | Each view (mount/update effects) | shared `pageMeta.ts` helper (the write) | Titles depend on asynchronously loaded truth (article, `chapterContext`); the view that owns the truth sets the title. |
| Reading-state derivation | `readingState.ts` pure module | — | No React, no Dexie, caller-supplied lookups — the `bookProgress.ts` store-seam discipline (components own reads, module owns algebra). |
| Counts / membership / empty states | LibraryView render body (pure derivation) | `readingState.ts` | Counts derive from the SAME functions as membership — agreement is structural (D14-20/23/24). |
| Progress hairline / Finished mark | LibraryRow / BookRow (existing) | `readingState.ts` | Row visuals consume the policy; the LibraryRow FINISHED_RATIO fork is deleted. |
| Persistence | Existing Dexie stores (read-only this phase) | — | Pitfall 9: zero schema changes; policy derives from existing rows at render time. |
| Landmarks | Existing header/`main#main` + NEW `<nav>` switcher | — | D14-04: verify-only for existing landmarks; one new nav landmark with an `aria-label`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) | — | — | Phase 14 installs ZERO external packages. Everything is browser primitives + existing deps. [VERIFIED: package.json] |

**Installation:**
```bash
# no installs — this phase adds no dependencies
```

**Version verification:** All required tooling already pinned in package.json: react/react-dom 19.2.8, typescript 7.0.2, vite 8.1.5, vitest 4.1.10, @playwright/test 1.61.1, @axe-core/playwright 4.12.1, dexie 4.4.4 (untouched). [VERIFIED: package.json read this session]

## Package Legitimacy Audit

> Required whenever this phase installs external packages.

**This phase installs no external packages.** Audit table:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | none installed |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────────────────────────────────────────┐
                     │  Browser URL bar (hash)                                    │
                     │  #/  #/unread  #/in-progress  #/finished   ← view routes   │
                     │  #/article/<id>[/h/<hl>]  #/review        ← destinations   │
                     │  #fn-N  #fn-ref-N  #main                  ← native targets │
                     └───────┬────────────────────────────▲─────────────────────┘
                             │ hashchange                 │ replaceState (no event!)
                             ▼ (cold load + destinations) │ view switch (D14-13)
                     ┌──────────────────┐    click     ┌──┴──────────────┐
                     │ App.tsx onHash   │◀─ preventDef │ View switcher   │
                     │ fragment guard   │              │ <nav> links     │
                     │ !hash.startsWith │              │ aria-current    │
                     │ ("#/") → return  │              │ "page" (D14-22) │
                     │ setHasAppHistory │              └──┬──────────────┘
                     │ setView(parseHash│                 │ onSwitchView(view)
                     │         ())      │◀────────────────┘ direct call
                     └───────┬──────────┘   (replaceState + setView — no event)
                             │ view: {name, view?}
             ┌───────────────┼───────────────────┐
             ▼               ▼                   ▼
      ┌─────────────┐  ┌─────────────┐   ┌─────────────┐
      │ LibraryView │  │ ArticleView │   │ ReviewView  │
      │ (any view)  │  │             │   │             │
      └──────┬──────┘  └──────┬──────┘   └──────┬──────┘
             │                │                  │
             │  per-view effects (mount + [view] / [article] / [status]):
             │   document.title = truthful title    (D14-02/06/07)
             │   h1.focus() when warm (in-app swap) (D14-01/03/15)
             │
             │  ArticleView layering (most-specific wins):
             │   deep-link jump focus > saved-location restore > h1 default
             │   (D14-05 / D14-10 — one decision point, no races)
             │
             ▼
      ┌─────────────────────────────────────────────────────────┐
      │ readingState.ts (NEW pure module — no React, no Dexie)  │
      │  articleReadingState(loc?, total) → unread|in-progress|  │
      │                                     finished             │
      │  bookReadingState(book, locations, textLengthOf)         │
      │    finished ⇔ deriveBookProgress(...) === 1 (D14-19/21)  │
      │  imports FINISHED_THRESHOLD from ContinueReadingStrip    │
      │  (single source — never forked)                          │
      └──────┬──────────────┬──────────────┬───────────────┬────┘
             ▼              ▼              ▼               ▼
        view membership  switcher      strip member-    LibraryRow/
        + counts (D14-23 counts (N)    ship refactor    BookRow marks
        agreement struct-  + empty     (behavior       (FINISHED_RATIO
        ural, D14-24)      states      unchanged)      fork DELETED)
```

Trace the primary use case: reader on `#/finished` clicks "Unread (3)" → `onClick` preventDefault → `history.replaceState(null,"","#/unread")` + router state update → LibraryView re-derives rows via `readingState.ts` → h1 (still "Saved articles", D14-25) focused (D14-15) → aria-current moves to the Unread link → counts/membership/empty state agree because all three render from one derivation.

### Recommended Project Structure
```
src/
├── App.tsx                          # parseHash gains view segments; onHash unchanged
│                                    # + switch routing (replaceState path)
├── routes/
│   ├── ArticleView.tsx              # title effect (article/EPUB/error forms) + focus layering
│   └── review/ReviewView.tsx        # title effect + mount h1 focus (warm)
├── ingestion/library/
│   ├── readingState.ts              # NEW — the one pure policy module (D14-20)
│   ├── pageMeta.ts                  # NEW (suggested) — setDocumentTitle helper + convention
│   ├── LibraryView.tsx              # <nav> switcher, per-view filter, counts, empty states
│   │                                # + [view] h1-focus effect + title
│   ├── LibraryRow.tsx               # FINISHED_RATIO fork deleted → consumes policy
│   ├── BookRow.tsx                  # consumes policy (deriveBookProgress === 1 wrapped)
│   ├── ContinueReadingStrip.tsx     # membership refactored onto policy (surface unchanged)
│   └── bookProgress.ts              # UNCHANGED (the pattern readingState.ts mirrors)
└── reader/BackToLibrary.tsx         # UNCHANGED semantics (see Pitfall 4)
tests/
├── component/App.test.tsx           # parseHash view-segment cases (strengthen-only)
├── unit/library/reading-state.test.ts   # NEW — policy unit suite
└── e2e/library/reading-views.spec.ts    # NEW — routes/counts/empty/focus/title 3-engine
```

### Pattern 1: Route-swap focus — per-view ownership + tabindex=-1 h1
**What:** On an in-app view swap, focus the incoming view's single h1 via `tabIndex={-1}` + `focus()`. Cold loads/reloads never move focus.
**When to use:** Every destination mount (list/article/review, incl. error state D14-06) and every view switch within LibraryView (D14-15).
**Why per-view (not an App-level `[view]` effect):** ArticleView must layer h1-focus against the deep-link jump and the saved-location restore — both live inside ArticleView with async readiness machinery (jump readiness gate L1282-1394; restore effect L1401-1456). Moving the h1 decision into ArticleView puts all three focus policies in ONE place; an App-level effect would need a ref-bridge and cross-component effect-ordering guarantees React doesn't document. (Intra-component declaration-order IS the codebase-proven mechanism — ArticleView L1268-1271.)

```tsx
// Source: W3C APG "Developing a Keyboard Interface" (tabindex=-1 definition) +
// lem-reader BackToLibrary/modeToggleHandlerRef threading precedents
// LibraryView (sketch) — one uniform rule at two trigger points:
function LibraryView({ warmMount }: { warmMount: boolean }) {  // warm = in-app swap (D14-03)
  const h1Ref = useRef<HTMLHeadingElement>(null);
  // Mount: focus only when the mount followed an in-app navigation
  useEffect(() => {
    if (warmMount) h1Ref.current?.focus();   // default preventScroll:false scrolls to top
  }, []);                                     // mount only — view switches hit the effect below
  ...
  return (
    <main id="main">
      <header className="library-header">
        {/* D14-25: byte-stable h1 gains only tabIndex={-1} — text/level unchanged */}
        <h1 ref={h1Ref} tabIndex={-1}>Saved articles</h1>
        ...
```

**Key mechanical facts** [CITED: W3C APG keyboard-interface practice; MDN focus]:
- `tabindex="-1}`: "not included in the tab sequence but focusable with element.focus()" — exactly the heading pattern.
- APG "persistence of focus": unmanaged DOM swaps drop focus to `<body>` = lost orientation; managed focus is the remedy.
- APG: "Do not set initial focus when the page loads" except narrow cases — canonical support for D14-03.
- `focus()` scrolls the element into view by default (`preventScroll: true` opts out; Baseline since 2015). For the view switch this default IS the "reset to list top" behavior (h1 sits at top) — no separate scrollTo needed unless exact-top semantics are wanted; then `window.scrollTo(0, 0)` before `focus()`.
- React may run interaction-caused effects BEFORE paint [CITED: react.dev useEffect caveats], so click-driven focus lands pre-paint — no visible flicker.
- `expect(locator).toBeFocused()` auto-retries (v1.20+) — tolerant of engine focus-settle timing; the known firefox rAF-settle quirk (ArticleView L1378-1384 double-call) applies to focus-after-`scrollIntoView`, not to a synchronous commit-time focus.

### Pattern 2: Hash grammar extension + replaceState view switch
**What:** `parseHash` gains view segments; the switcher intercepts clicks to give replace semantics.
**When to use:** `#/unread`, `#/in-progress`, `#/finished` (exact names planner-confirmed) as siblings of `#/review` in the grammar.

```tsx
// Source: App.tsx L43-61 grammar (extend in place, match order preserved) +
// MDN History.replaceState + codebase ArticleView finish() precedent
export type LibraryViewName = "all" | "unread" | "in-progress" | "finished";

type View =
  | { name: "list"; view: LibraryViewName }   // view IN the parse result (D14-17:
  | { name: "article"; id: string; jumpHighlightId?: string }  //   reload restores from URL)
  | { name: "review" };

function parseHash(): View {
  // 1. article /h/ form FIRST (existing grammar — byte-stable, unit-tested)
  const m = /^#\/article\/([a-z0-9-]+)(?:\/h\/([^/]+))?$/.exec(window.location.hash);
  if (m) return { name: "article", id: m[1] as string, jumpHighlightId: m[2] };
  if (window.location.hash === "#/review") return { name: "review" };
  // 2. NEW view segments — literal allowlist; unknown → All (D14-16 fallback
  //    discipline; no new error surface, mirrors unknown #/ → list)
  if (window.location.hash === "#/unread") return { name: "list", view: "unread" };
  if (window.location.hash === "#/in-progress") return { name: "list", view: "in-progress" };
  if (window.location.hash === "#/finished") return { name: "list", view: "finished" };
  return { name: "list", view: "all" };
}
```

**The replaceState switch (D14-13) — the load-bearing mechanics:**

`history.replaceState(null, "", "#/unread")` fires **no hashchange and no popstate** [VERIFIED: codebase ArticleView L1302-1309 comment + MDN]. The router's only listener is `hashchange` (App.tsx L194). Therefore:

```tsx
// Switcher link — real href for share/middle-click; click gets replace semantics
<a
  href="#/unread"
  aria-current={active === "unread" ? "page" : undefined}  // D14-22; exactly one (MDN)
  onClick={(e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onSwitchView("unread");   // App-owned: history.replaceState(null, "", "#/unread");
  }}                          //                   setView(parseHash());  ← direct, no event
>
  Unread (3)                  {/* D14-23 — count in the accessible name */}
</a>
```

- Middle-click / cmd-click falls through to default fragment navigation: pushes an entry + fires hashchange → the existing `onHash` path handles it identically (just push semantics for that gesture — acceptable; D14-13 governs the in-app gesture).
- **Destinations stay push:** `window.location.hash = "#/article/<id>"` (rows, Review button, BackToLibrary `#/` fallback) unchanged — each pushes an entry and fires hashchange.
- **Back from article (D14-14) composes for free:** the library's current entry already carries the replaceState'd view URL, so `history.back()` from an article returns to `#/unread` etc.; the cold `#/` fallback lands on All.
- **`hasAppHistory` is NOT flipped by view switches** (no hashchange fires) — correct by design: a view switch is not destination navigation, and BackToLibrary only guards destinations. Document this invariant in App.tsx.
- **Same-view hashchange nuance:** an unrecognized `#/` hash while on the list re-parses to `{name:"list"}` — LibraryView does NOT remount (same component type at the same tree position); the load effect (`[refreshKey]`) does not re-run [VERIFIED: progress-recent.spec.ts L126-131 openLibrary comment]. View switches via the direct `setView` path likewise never remount LibraryView — the D14-15 focus must therefore live in an effect keyed on the *view value*, not a mount effect.
- **Fragment guard untouched:** `#fn-N` / `#fn-ref-N` / `#main` never start with `#/` → `onHash` returns early (Gap 3). View segments start with `#/` by construction; no collision with `/h/` (article grammar matches first).

### Pattern 3: Per-destination `document.title` — effect-based, one shared helper
**What:** Each destination sets a truthful title on mount/truth-change; overlays never touch it; `index.html`'s static `<title>Lem Reader</title>` remains the cold-load default.
**Why effects (no library):** Titles depend on async truth (article load, `chapterContext` book lookup) that components own; `document.title` is a single string write — a 5-line helper beats a dependency.

```tsx
// src/ingestion/library/pageMeta.ts (suggested shape — planner confirms location)
export const TITLE_SUFFIX = "Lem Reader";
export function setDocumentTitle(content: string): void {
  document.title = `${truncateTitle(content)} — ${TITLE_SUFFIX}`;
}
// Convention (planner-confirmed, recommended):
//   Library (all views): "Saved articles — Lem Reader"      (D14-25 mirror; URL carries the view)
//   Article:             "<provenance.title> — Lem Reader"
//   EPUB chapter (D14-07): "<chapter title> — <book.title> — Lem Reader"
//   Review:              "Review highlights — Lem Reader"
//   Error (D14-06):      "Couldn't open this article — Lem Reader"
```

- **EPUB form:** key the effect on `[article, chapterContext]` — the title upgrades when the Book record resolves (chapterContext is null until the tolerant lookup completes, ArticleView L235-242/ L1807-1811). Standalone articles: `chapterContext` null → simple form.
- **Truncation:** browsers never truncate the stored title (visual-only tab trimming); a project-side `truncateTitle` (mirroring ReviewView's `truncate`/ARIA_MAX_CHARS precedent) keeps long web-extracted titles sane. Recommended cap ~60-80 chars on the content portion, then append the suffix. Planner confirms the number.
- **No restore-on-unmount:** every destination (including error states) sets its own title on mount, so there is no "unknown destination" gap and nothing to restore.
- **Overlays (D14-11):** zero code — assert stability in tests (open SettingsPanel/drawer → title unchanged).
- **Security note:** `document.title = string` is a text assignment, not markup — no injection surface; foreign titles from imported bundles cannot execute [CITED: MDN document.title semantics; WHATWG HTML title element text-only model].

### Pattern 4: `readingState.ts` — the one pure policy module
**What:** A pure module beside `bookProgress.ts` deriving `unread | in-progress | finished` for articles AND books. No React, no Dexie, no new measurement; caller-supplied lookups (the store-seam discipline). `FINISHED_THRESHOLD` is IMPORTED from `ContinueReadingStrip` — never forked (D8-12 single source, D14-20).

```typescript
// Source: mirrors src/ingestion/library/bookProgress.ts shape exactly
import { FINISHED_THRESHOLD } from "./ContinueReadingStrip";  // the single source
import { deriveBookProgress, resolveResumeChapterId } from "./bookProgress";
import type { Book, LocationRecord } from "../../content/schema";

export type ReadingState = "unread" | "in-progress" | "finished";

/** D14-18 — any LocationRecord (even 0%) means started. */
export function articleReadingState(
  location: LocationRecord | undefined,
  total: number,                       // graphemeClusters(normalizeText(article), lang).length
): ReadingState {
  if (!location) return "unread";
  // total 0 on an opened article → ratio min(1, x/0) = 1 → finished:
  // PRESERVES current LibraryRow/strip behavior (opened zero-length = done) —
  // keep byte-stable, document the edge.
  const ratio = Math.min(1, location.graphemeOffset / total);
  return ratio >= FINISHED_THRESHOLD ? "finished" : "in-progress";
}

/** D14-19 + D14-21 — finished ⇔ deriveBookProgress === 1 (ALL admitted chapters
 *  individually ≥98%; a chapter whose row is missing counts unfinished by
 *  deriveBookProgress's own denominator discipline — 11/12 stays in-progress). */
export function bookReadingState(
  book: Book,
  locations: LocationRecord[],
  textLengthOf: (articleId: string) => number | undefined,
): ReadingState {
  if (resolveResumeChapterId(book, locations) === null) return "unread";
  return deriveBookProgress(book, locations, textLengthOf) === 1
    ? "finished"
    : "in-progress";
}

/** D14-23/24 — counts derived from the SAME functions membership uses.
 *  One item per book (chapters never top-level — D12-01). */
export function countByState(
  standalone: { id: string; location?: LocationRecord; total: number }[],
  books: Book[],
  locations: LocationRecord[],
  textLengthOf: (id: string) => number | undefined,
): Record<ReadingState, number> { /* fold the two functions above */ }
```

- **Consumers:** LibraryView (view filter + counts + empty states), ContinueReadingStrip (membership filter L128/L151 refactored onto `articleReadingState === "in-progress"` / `bookReadingState === "in-progress"` — behavior identical: current strip admits `location && progress < FINISHED_THRESHOLD` which IS in-progress), LibraryRow (`FINISHED_RATIO` const DELETED — row uses `articleReadingState`), BookRow (`progress >= 1` wrapped by policy).
- **Text-length threading:** LibraryView already loads `items` + `allLocations`; build ONE `totalsById` Map (`useMemo` on items identity — BookRow L66-75 / strip L111-117 precedent) and pass `totalsById.get` as the lookup. Avoids the per-row Intl.Segmenter recompute on every render (the 260819-tld caching lesson).
- **Latest-savedAt fold:** `bookProgress.latestLocationByArticle` already exists but is private; either export it for reuse or keep LibraryView's existing fold (L122-128) — do NOT fork a fourth copy silently; pick one owner (planner decision, noted in Open Questions).

### Pattern 5: The switcher — `<nav>` + `aria-current="page"` links with counts
**What:** D14-22/D14-23/D14-25: a `<nav aria-label="…">` of four real links; exactly one carries `aria-current="page"`; counts live in the accessible names; h1 stays "Saved articles".

- `aria-current="page"` is the correct token for "current item within a set of related links" [CITED: MDN aria-current — page value, one-element rule]. NOT `location` (flow-chart context), NOT tab machinery (aria-current must not substitute aria-selected in tab/option/gridcell/row — confirms links-not-tablist).
- The `<nav>` needs an `aria-label` (a second nav exists in reading contexts — `chapter-nav`, ArticleView L2048 — and Phase 15 adds an app-shell nav; unlabeled navs collide in the landmark list).
- Counts in accessible names: `Unread (3)` — the parenthetical is read by AT as part of the name; parenthetical form is the established convention (planner confirms exact phrasing, D14-23 discretion).
- Counts update on the existing `refreshKey` load cycle (reading a chapter and returning remounts LibraryView → fresh load → fresh counts; no new invalidation machinery).

### Anti-Patterns to Avoid
- **An App-level `[view]` focus effect fighting ArticleView's layering** — the deep-link jump and restore are async and ArticleView-internal; an App effect would race them (D14-05/D14-10). Keep h1-default decisions inside ArticleView at one decision point (see Pitfall 1).
- **Believing replaceState fires hashchange** — it does not [VERIFIED]. A switcher that only calls `replaceState` silently renders nothing new. Always pair with the direct router state update.
- **A second `0.98` constant** — any literal in the new code is a fork (D8-12/D14-20). Import `FINISHED_THRESHOLD`.
- **`aria-selected` or tablist semantics on the switcher** — views are routes/links (D14-22); tab machinery would misrepresent them [CITED: MDN aria-current "don't substitute for aria-selected"].
- **Changing the h1 text per view** — byte-stable anchor `<h1>Saved articles</h1>` is load-bearing (D14-25); the URL + aria-current carry the view.
- **A fourth fork of the latest-savedAt fold** — it already exists in three places; the policy module either imports or owns it (pick one).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Route-change announcements | Live-region chatter on every swap (D14-09 rejects) | h1 focus (SR reads the focused heading) | W3C-sanctioned; one uniform rule; no announcement duplication |
| SPA title management | A `react-helmet`-style dependency | `document.title = …` in a 5-line helper + per-view effects | Single string write; dependency adds bundle + SSR machinery the SPA doesn't have |
| View history semantics | Custom history stack tracking | `history.replaceState` + destination `hash` assignment | The platform already owns the stack; replaceState no-event semantics is exactly "state-within-destination" |
| Focus-into-view on view switch | Manual `scrollIntoView` + `focus` choreography | `focus()` default scroll behavior (h1 at content top) | MDN-documented default; free list-top reset; one API |
| Reading-state derivation #4 | Re-implementing ratio math in views/counts | `readingState.ts` (which itself wraps `deriveBookProgress`) | Agreement must be structural, not copy-synchronized (D14-20/23/24) |

**Key insight:** every mechanism this phase needs is either a browser primitive with Baseline-wide support (replaceState 2015, focus preventScroll 2015, aria-current, document.title) or an existing codebase pattern (pure-module seam, threaded-flags, byte-stable anchors, e2e seeding). The risk is coordination, not capability.

## Common Pitfalls

### Pitfall 1: Focus fights — h1 vs deep-link jump vs saved-location restore
**What goes wrong:** An unconditional h1 focus on article mount yanks focus off the deep-linked `<mark>` (D14-05 violation) or scrolls away from a restored position (D14-10 violation).
**Why it happens:** Three async pipelines converge on mount: the jump effect (readiness gate, up to 5s), the restore effect (`loadLocation` + rAF), and any new h1-default effect.
**How to avoid:** Make the restore/jump pipeline own the decision at ONE point: inside the existing effects, focus h1 only in the terminal fall-through branches (no jump param + no saved location + warm mount). Never add a third competing effect. The `jumpPendingRef` suppression precedent (ArticleView L1403-1411) is the exact template.
**Warning signs:** e2e deep-link test fails on webkit/firefox with activeElement = h1 instead of `hl-<id>`; restore banner appears but viewport is at article top.

### Pitfall 2: replaceState without a router notification
**What goes wrong:** URL says `#/unread`, the page still shows All (or vice versa after Back).
**Why:** `replaceState` fires no events — the `hashchange` listener never runs.
**How to avoid:** The switch handler does BOTH: `history.replaceState(...)` AND the direct state update. Cold load + Back + middle-click all arrive via hashchange/parseHash — four entry paths, one parse function, two wiring routes (event vs direct call). Unit-test all four.
**Warning signs:** URL/DOM desync after switch; Back skips to the wrong destination.

### Pitfall 3: LibraryView doesn't remount — mount effects can't carry view switches
**What goes wrong:** D14-15 focus/title keyed on mount never fires when switching Unread→Finished.
**Why:** View switches keep the same component instance at the same tree position (and the direct `setView` path never remounts); only destination swaps remount views [VERIFIED: progress-recent.spec.ts L126-131].
**How to avoid:** Two effects in LibraryView: mount-effect (warm-gated h1 focus, D14-03) + `[activeView]`-keyed effect (h1 focus on every switch, D14-15 — the uniform rule at its second trigger point). Titles likewise: the library title is static across views, but if planner chooses per-view titles key on `[activeView]`.
**Warning signs:** Focus stays on the clicked switcher link after a view switch (acceptable? No — D14-15 requires the h1 announcement).

### Pitfall 4: Breaking BackToLibrary's `hasAppHistory` guard
**What goes wrong:** `history.back()` from an article exits the app, or Back walks intermediate views.
**Why it happens:** If view switches ever pushed entries (plain `href` without interception) Back would land on a previous VIEW, not the previous destination — the exact D14-13 rejection. Conversely, wiring replaceState into `onHash`'s `setHasAppHistory(true)` would be harmless-but-wrong (no event fires anyway).
**How to avoid:** Destinations push (unchanged `hash` assignment); views replace (intercepted). Never call `location.hash = "#/unread"` from the switcher. Existing `chrome/back-nav.spec.ts` is the regression harness — extend, don't weaken.
**Warning signs:** back-nav spec failures; manual Back from article lands on `#/unread` when the reader came from `#/finished`.

### Pitfall 5: Count/membership drift via derived copies
**What goes wrong:** Counts computed from `items.length`-style shortcuts (e.g., counting locations) disagree with rendered rows — exactly the LIB-08 failure mode.
**Why:** Two derivations of the same truth always drift (the LibraryRow FINISHED_RATIO fork is the standing example this phase deletes).
**How to avoid:** Render rows AND compute counts from the SAME `readingState.ts` functions in the same render body (D10-09 pure-derivation-in-render discipline). The e2e agreement test imports the policy module and compares against the DOM — a structural lock, not a copy check.
**Warning signs:** Any `filter(...).length` in the switcher that doesn't call the policy module; a book counted as 12 items anywhere (D14-24).

### Pitfall 6: The 0.98 integer-truncation trap in seeds/tests
**What goes wrong:** A test seeds `Math.floor(total * 0.98)` and expects Finished — the floored offset yields ratio ≈ 0.9798 < 0.98 [VERIFIED: progress-recent.spec.ts L238-241 documents this exact trap].
**How to avoid:** Seed `graphemeOffset = total` for deterministic Finished state; floor-ratios only for in-progress states. Also: a chapter at ≥98% of ITS OWN length is finished — book membership is per-chapter, not per-book-average (D14-19).
**Warning signs:** Flaky Finished assertions; a 39/40 book appearing in the Finished view.

### Pitfall 7: jsdom over-claim — focus/history truth belongs to Playwright
**What goes wrong:** Component tests pass while real engines misbehave (focus settle timing, history realism, scroll).
**Why:** jsdom maintains `document.activeElement` for programmatic focus and supports `document.title` + `replaceState` — fine for grammar/strings/logic — but has no layout, no scroll, a shallow history (back() without real navigation), and no SR.
**How to avoid:** Unit/component: parseHash cases, policy derivations, title strings, mount-focus wiring. Playwright 3-engine: toBeFocused timing, history semantics (goBack), replaceState URL/DOM agreement, scroll-on-switch, aria-current. STACK.md's "DOM emulators are not authoritative" rule applies verbatim.

### Pitfall 8: Title overwrite by overlay or async gap
**What goes wrong:** A slow `chapterContext` lookup leaves the standalone-article title on an EPUB chapter (D14-07 violated), or an overlay writes the title (D14-11 violated).
**How to avoid:** Key the title effect on `[article, chapterContext, status]` so every truth change rewrites; overlays simply have no title code (assert stability in one e2e). The error branch (status → "error") sets its own title + focuses its own h1 (D14-06 — the error h1 exists at ArticleView L1687).

### Pitfall 9: StrictMode double-mount in dev focus effects
**What goes wrong:** Focus effects fire twice in dev (setup→cleanup→setup) [CITED: react.dev StrictMode]; a cleanup that "restores" focus would fight the second run.
**How to avoid:** Focus effects need NO cleanup (focusing twice is idempotent); don't add focus-restore cleanup. Tests use production-mode dev server behavior; e2e asserts settle state, not transition count.

## Code Examples

### Existing e2e seeding harness to clone (books + chapters + locations)
```typescript
// Source: tests/e2e/library/progress-recent.spec.ts L61-94 (seedLocation) —
// extend with books + chapter-article rows for view-membership tests.
// Dexie v5 store names [VERIFIED: src/persistence/db.ts L192-198]:
//   articles: "id, revision, source, addedAt, *tags, bookId"
//   books:    "id, title, *tags"
//   location: "[articleId+revision]"
// Chapter rows carry BOTH ingestionMeta.bookId (canonical FK) AND the
// top-level bookId (the 12-03 v5 index contract — 12-07 Rule 2 uniformity).
await seedBook(page, { id: "bk-1", title: "Forty Chapters", chapterArticleIds: [...ids] });
await seedArticleRows(page, chapterRows);        // articles store
for (const [id, ratio] of finishedChapters) {
  await seedLocation(page, id, Math.floor(total(id) * (ratio >= 1 ? 1 : ratio)), savedAt);
}
// Agreement assertion shape (LIB-08) — the test imports the SAME module:
import { articleReadingState, bookReadingState } from "../../../src/ingestion/library/readingState";
const expected = computeExpectedMembership(corpus); // pure Node computation
await expect(page.locator(".library-list > li")).toHaveCount(expected.unreadCount + ...);
await expect(page.getByRole("link", { name: /^Unread \(\d+\)/ })).toBeVisible();
```

### Focus + title e2e assertions (verified API)
```typescript
// Source: Playwright docs (verified this session, v1.20+ all; project on 1.61.1)
await page.goto(`${BASE}/#/finished`);
await page.reload();                                       // D14-17 — cold load
await expect(page.getByRole("heading", { level: 1 })).toContainText("Saved articles");
await expect(page.locator("nav a[aria-current='page']")).toHaveText(/Finished/);
// no focus move on cold load (D14-03):
await expect(page.locator("main#main h1")).not.toBeFocused();
await expect(page).toHaveTitle(/Saved articles — Lem Reader/);   // D14-02

// in-app swap → h1 focused (D14-01/D14-15):
await page.getByRole("link", { name: "Unread (3)" }).click();
await expect(page.locator("main#main h1")).toBeFocused();        // auto-retries
await expect(page).toHaveURL(/#\/unread$/);                      // D14-13 replace

// history: view switches are not entries (D14-13) — Back returns to the
// previous DESTINATION:
await page.goto(`${BASE}/#/`);                // entry A (All)
await page.getByRole("link", { name: /Unread/ }).click();   // replaced → still entry A'
await page.getByRole("link", { name: /Finished/ }).click(); // replaced → entry A''
await page.goBack();                          // → previous destination (or app exit boundary
await expect(page.locator("main#main h1")).toBeVisible();   //   — assert in-app stay per spec)

// deep-link keeps mark focus, not h1 (D14-05):
await page.goto(`${BASE}/#/article/${id}/h/${hl}`);
await expect(page.locator(`#hl-${hl}`)).toBeFocused();
await expect(page.locator("main#main h1")).not.toBeFocused();
```

### Warm-mount flag threading (the hasAppHistory precedent)
```typescript
// Source: App.tsx L173-196 hasAppHistory pattern (Pitfall 7 of 13-04) —
// D14-03 needs "was THIS mount caused by an in-app navigation?", a per-mount
// value, not the monotonic hasAppHistory flag. Shape (planner refines):
const inAppNavRef = useRef(false);          // false at cold mount
const onHash = () => { /* guard */; inAppNavRef.current = true; setView(parseHash()); };
// pass a derived prop at render time: warmMount={inAppNavRef.current && viewChangedSinceMount}
// Simplest correct form: a navSeq counter — view mounts with seq > 0 are warm.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Silent view swaps (focus falls to `<body>`) | Managed h1 focus on SPA route change (tabindex=-1) | Long-standing W3C APG guidance; still current | The D14-01/D14-15 mechanism is the canonical modern pattern, not a novel risk |
| `react-helmet` for SPA titles | Framework head management / plain effects | helmet-style libs unnecessary for title-only SPA needs | A 5-line helper suffices; no dependency warranted [ASSUMED — based on capability comparison, verified against react.dev absence of a title API] |
| Tablist for in-page views | Links + `aria-current="page"` for route-like views | Established ARIA practice | D14-22 aligns with current guidance [CITED: MDN aria-current] |

**Deprecated/outdated:** none applicable — all platform APIs used (replaceState, focus options, aria-current) are Baseline widely available [CITED: MDN].

## Assumptions Log

> All claims tagged [ASSUMED] in this research. Planner/discuss should confirm before locking.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact view-segment names `#/unread`, `#/in-progress`, `#/finished` are suitable (final names are planner-confirmed discretion) | Pattern 2 | Low — mechanical rename; grammar shape unaffected |
| A2 | Suggested title convention (`<Content> — Lem Reader`, ~60-80 char content truncation, library title constant across views) | Pattern 3 | Low — copy-level; e2e uses regex/prefix assertions that survive tweaks |
| A3 | App-level title effects are unnecessary; per-view effects + shared helper is the right ownership | Pattern 3 | Low — either wiring satisfies D14-02; per-view avoids ref-bridging |
| A4 | Cross-component child-before-parent effect ordering holds but is undocumented — design avoids depending on it | Pattern 1 | None if per-view ownership is followed (the recommendation); Medium if planner chooses App-level focus effect |
| A5 | `#/in-progress` (hyphenated) preferred over `#/reading`/`#/progress` for URL clarity | Pattern 2 | Low — naming only |
| A6 | Existing `a11y.spec.ts` axe runs + one-h1 discipline already cover the D14-04 landmark audit for existing surfaces; Phase 14 adds the nav landmark and relies on axe + manual review rather than a new audit spec | Pattern 5, Validation | Low-Medium — if audit gaps exist, a small verification task closes them |
| A7 | ContinueReadingStrip membership refactor onto `articleReadingState`/`bookReadingState` is behavior-identical (opened + not finished ⇔ in-progress), including the opened-zero-length → finished edge | Pattern 4 | Medium — if edge semantics differ, strip e2e (progress-recent.spec) catches it; keep behavior byte-stable |
| A8 | `window.scrollTo(0,0)` before h1 `focus()` may be needed for exact top-of-list semantics (focus scroll is minimal-reveal, which for a top h1 is equivalent in practice) | Pattern 1 | Low — e2e scroll assertion decides; both forms calm |

**If this table is empty:** not the case — A1/A2 (naming/copy discretions) explicitly await planner confirmation; the rest are low-risk engineering choices with stated fallbacks.

## Open Questions (RESOLVED)

> All four questions resolved during Phase 14 planning (finalized in the
> 2026-08-25 revision pass). Each cites its adopting artifact.

1. **Exact view-segment names + title convention + truncation cap + empty-state copy** — RESOLVED (adopted: 14-01/14-02/14-03 PLAN.md must_haves + approved 14-UI-SPEC.md)
   - What we know: grammar shape, helper design, and the calm-voice pattern (D8-04).
   - What was unclear: the literal strings (A1/A2, planner-confirmed discretion; empty copy is UI-SPEC territory).
   - Resolution: segments locked as `#/unread` / `#/in-progress` / `#/finished` (14-02-PLAN must_haves truths + Task 1 parseHash test cases); title convention locked as `<content> — Lem Reader` with a 64-char content-portion truncation (14-01-PLAN Task 2 pageMeta behavior rows + 14-UI-SPEC.md §Copywriting Contract); per-view empty-state copy locked verbatim in 14-02-PLAN Task 2 and 14-UI-SPEC.md §Copywriting empty-state table. All now serve as byte-stable test anchors per the recommendation.
2. **Who owns the latest-savedAt fold — export `bookProgress.latestLocationByArticle` or keep LibraryView's fold?** — RESOLVED (adopted: 14-01-PLAN Task 1)
   - What we know: it exists in 3 places; the policy module is the natural 4th consumer; D14-20 says ONE module owns derivation.
   - Resolution: the recommendation was taken — 14-01 Task 1 adds the `export` keyword to `latestLocationByArticle` in `bookProgress.ts` (single-line, no behavior change), making `bookProgress.ts` the one owner; `readingState.ts` consumes it via the bookProgress import (key_link pinned in 14-01 must_haves). No fourth fork.
3. **Where the switcher mounts in the 13-03 library tidy structure** — RESOLVED (adopted: 14-02-PLAN Task 2)
   - What we know: three ordered sections (continue → add+status → list); switcher is list-scoped chrome.
   - Resolution: the recommendation was taken — the switcher mounts as the FIRST child of `section.library-section-list`, above LibrarySearch, with `aria-label="Library views"` (14-02 Task 2 action + `.view-switcher` CSS entry); the UI-SPEC pass (Q4) confirmed the placement and POLISH-06 rhythm.
4. **Does Phase 14 run `/gsd-ui-phase`?** — RESOLVED (satisfied by approved 14-UI-SPEC.md)
   - ROADMAP marks `**UI hint**: yes`. The pass ran at planning time (per workflow config `ui_phase: true`): the phase directory contains the approved `14-UI-SPEC.md` (Copywriting Contract, Component Inventory incl. ViewSwitcher + pageMeta.ts, Layout Contract, Interaction rules), referenced by the context sections of plans 14-01/14-02/14-03/14-04.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | Vite 8 dev server | ✓ | (project baseline — verify at plan time) | — |
| Vite dev server :5173 | All e2e (webServer config, `reuseExistingServer`) | ✓ | 8.1.5 | — |
| Playwright browsers (chromium/firefox/webkit) | 3-engine e2e | ✓ | 1.61.1 installed project-wide | — |
| Vitest + jsdom | unit/component | ✓ | 4.1.10 / 30.0.1 | — |
| @axe-core/playwright | a11y checks | ✓ | 4.12.1 | — |
| IndexedDB (Dexie 4.4.4) | seeding + stores | ✓ | pinned | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

*(Step 2.6 audit result: all external dependencies already installed and exercised by the existing suite; no new tooling.)*

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit+component, jsdom env, `vitest.config.ts` projects) + Playwright Test 1.61.1 (chromium/firefox/webkit + chromium-throttled perf-only) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npx vitest run tests/unit/library/reading-state.test.ts tests/component/App.test.tsx` |
| Full suite command | `npm run test` (honest gate: exit 0, fail counts recorded) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-04 | parseHash maps view segments; unknown `#/` → All; fragment guard intact | unit | `npx vitest run tests/component/App.test.tsx` | ✅ (extend, strengthen-only) |
| NAV-04 | Route swap (in-app) focuses incoming h1; cold load does not; deep-link mark wins; restore beats h1 | e2e | `npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/chrome/back-nav.spec.ts` | ❌ Wave 0 (new spec) / ✅ back-nav |
| NAV-04 | Per-destination titles incl. EPUB chapter + error; overlays leave title untouched | e2e (+ unit for string builder) | `npx playwright test reading-views.spec.ts` | ❌ Wave 0 |
| NAV-04 | View switch = replaceState; Back returns to previous destination; reload keeps view | e2e | `npx playwright test reading-views.spec.ts back-nav.spec.ts` | partially ✅ (back-nav) |
| LIB-07 | `articleReadingState`/`bookReadingState` truth table (unread/in-progress/finished; 0% opened; ≥98%; 39/40; missing chapter row 11/12; zero-length edge) | unit | `npx vitest run tests/unit/library/reading-state.test.ts` | ❌ Wave 0 |
| LIB-07 | Views switchable via real routes; aria-current on exactly one link | e2e | `npx playwright test reading-views.spec.ts` | ❌ Wave 0 |
| LIB-08 | Counts in accessible names + row counts + empty states agree with policy across articles + books | e2e (imports policy module for expected values) | `npx playwright test reading-views.spec.ts` | ❌ Wave 0 |
| LIB-08 | Strip membership unchanged after refactor onto policy | e2e | `npx playwright test tests/e2e/library/progress-recent.spec.ts` | ✅ (existing = strengthen-only guard) |
| a11y | New nav landmark + switcher pass axe on all 3 engines | e2e | `npx playwright test tests/e2e/a11y.spec.ts` | ✅ (extend if needed) |

### Sampling Rate
- **Per task commit:** quick unit set above + targeted new e2e spec (`npx playwright test reading-views.spec.ts --project=chromium` for fast inner loop).
- **Per wave merge:** `npm run test:e2e` (3 engines) + `npm run test:unit`.
- **Phase gate:** full `npm run test` exit 0 (the honest-suite discipline; record pass/fail counts) — byte-stable anchors proven unchanged (happy-path.spec, progress-recent.spec, back-nav.spec green without modification except strengthen-only additions).

### Wave 0 Gaps
- [ ] `tests/unit/library/reading-state.test.ts` — LIB-07 policy truth table (covers REQ-LIB-07 derivation core)
- [ ] `tests/e2e/library/reading-views.spec.ts` — views/counts/empty/focus/title/history matrix × 3 engines (covers NAV-04 + LIB-08 browser truth); clone the progress-recent.spec beforeEach (image stub + clear-rows) + seedLocation/seedBook helpers
- [ ] `tests/component/App.test.tsx` — extend parseHash describe with view-segment cases (strengthen-only: existing cases byte-stable)
- [ ] No framework installs needed — existing infra covers all requirements

**Nyquist note:** the observable behaviors that MUST be sampled at real-browser boundaries are (a) focus identity + timing (`toBeFocused`), (b) history stack semantics (`goBack` + URL), (c) URL↔DOM agreement after replaceState, (d) count/row/empty agreement vs the imported policy. Grammar and derivations sample at unit boundaries. Announcement quality (SR reading the focused h1, D14-09) is a documented manual boundary — the ACPT protocol (docs/ACCEPTANCE-PROTOCOL.md v1.2) is the eventual instrument; Phase 14 asserts the automatable substrate (focus landed on the h1) and notes the SR-voice check as manual/deferred to the milestone acceptance matrix (ACPT-08, Phase 21).

## Security Domain

> `security_enforcement: true`, ASVS Level 1, block_on high. This phase adds no new inputs, no auth, no crypto, no network. Surface analysis:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | local-first app, no accounts |
| V3 Session Management | no | no sessions |
| V4 Access Control | no | no privileged surfaces added |
| V5 Input Validation | yes (minimal) | View segments parsed against a literal allowlist in `parseHash` (regex/`===` grammar — same discipline as article-id `[a-z0-9-]+` capture); unknown → fallback, never interpreted. Counts/titles render as React text children or `document.title` text assignment. |
| V6 Cryptography | no | — |
| V12 File Upload | no | untouched |

### Known Threat Patterns for React 19 SPA + hash router

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via document.title from foreign/imported titles | Tampering | `document.title` is a text-only assignment (no markup parsing); no `innerHTML` surface; titles additionally truncated helper-side. Existing react/no-danger + lint:no-danger gates unaffected. |
| URL injection via crafted hash | Tampering | Grammar is a closed allowlist; segment values are compared literals, never interpolated into DOM/URLs beyond template-built `#/unread` constants (the T-10-02c discipline). |
| History hijacking via replaceState cross-origin | Spoofing | replaceState throws on cross-origin URLs (MDN); all URLs are same-origin template literals. |
| Focus-based phishing (title/tab spoofing) | Spoofing | Titles truthfully mirror on-page h1/content (NAV-04's whole point); error titles say error. |

No new high-risk surface; no ASVS blockers expected.

## Sources

### Primary (HIGH confidence)
- Codebase (read in full this session): `src/App.tsx` (router, guard, hasAppHistory, view-swap effect), `src/ingestion/library/LibraryView.tsx`, `libraryFilter.ts`, `bookProgress.ts`, `ContinueReadingStrip.tsx` (FINISHED_THRESHOLD export), `LibraryRow.tsx` (FINISHED_RATIO fork), `BookRow.tsx`, `src/routes/ArticleView.tsx` (jump effect L1255-1394, restore effect L1396-1456, error h1 L1687, article h1 L1959, chapterContext L235/L1807), `src/routes/review/ReviewView.tsx`, `src/reader/BackToLibrary.tsx`, `index.html`, `src/persistence/db.ts` (v5 stores), `playwright.config.ts`, `vitest.config.ts`, `package.json`, `tests/component/App.test.tsx`, `tests/e2e/library/progress-recent.spec.ts`, `.planning/phases/14-navigation-and-library-contracts/14-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`.
- [MDN History.replaceState](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState) — entry-replacement semantics, same-origin, Baseline 2015.
- [MDN HTMLElement.focus()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus) — preventScroll default-false scroll-into-view; focusVisible variance.
- [MDN aria-current](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current) — page value, one-element rule, aria-selected separation.
- [W3C WAI APG: Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) — persistence of focus, tabindex=-1 definition, no-initial-focus guidance.
- [Playwright PageAssertions](https://playwright.dev/docs/api/class-pageassertions) (toHaveTitle/toHaveURL) and [LocatorAssertions](https://playwright.dev/docs/api/class-locatorassertions) (toBeFocused) — verified against 1.61.1.
- [react.dev useEffect reference](https://react.dev/reference/react/useEffect) — post-commit timing, interaction-caused pre-paint runs, StrictMode double-cycle.

### Secondary (MEDIUM confidence)
- Same-document fragment navigation pushing a history entry (basis for D14-13 interception) — MDN/WHATWG HTML standard navigation semantics + long-standing browser behavior; cross-checked against the codebase's own replaceState usage (ArticleView finish()).

### Tertiary (LOW confidence)
- None — no claim in this document rests on a single unverified source. [ASSUMED] items are engineering choices listed in the Assumptions Log, not factual claims.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all existing pinned deps verified in package.json this session.
- Architecture (router/focus/title/policy patterns): HIGH — every mechanism verified against the live codebase and official docs; the one undocumented ordering concern (A4) is explicitly designed around.
- Pitfalls: HIGH — all nine grounded in codebase evidence (line-cited) or documented platform behavior; three carry in-repo precedent (truncation trap, remount nuance, hasAppHistory).
- Testing strategy: HIGH — assertion APIs verified against Playwright docs; seeding harness cloned from existing green specs; jsdom boundary respected per STACK.md.

**Research date:** 2026-08-24
**Valid until:** 2026-09-23 (stable domain — browser primitives + internal contracts; revisit only if React/Vite majors shift)
