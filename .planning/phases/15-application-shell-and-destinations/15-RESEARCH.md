# Phase 15: Application Shell and Destinations - Research

**Researched:** 2026-08-25
**Domain:** SPA application shell — persistent destination navigation, hash-route rename + alias, session-scoped return-context restore, control context-gating, cross-surface geometry audit (React 19 + authored CSS, no new libraries)
**Confidence:** HIGH (codebase-grounded; external claims cited from MDN/WAI-ARIA via Context7 at MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Copied verbatim from `.planning/phases/15-application-shell-and-destinations/15-CONTEXT.md` §Implementation Decisions:

- **D15-01: Destination nav lives IN the existing 48px app-header** — links inline-start beside the wordmark. One quiet row; no second nav strip; no per-view nav placement. Several CSS constants reference the 48px geometry (banner top offsets, `restoreLocation.ts` header height) and stay valid.
- **D15-02: The nav is persistent in ALL three destinations** — Library, Highlights, AND Reader. The shell is always the same; reading position is saved anyway (`restoreLocation`), so leaving is non-destructive.
- **D15-03: POLISH-07 = token audit + drift fixes** — audit Library, Highlights, Add (as-is), and Reader against the existing tokens (`main#main` inset, `--space` scale, 48px header, measure) and fix drift where found. No new layout system, no shared shell layout component. Visual design details go to UI-SPEC.
- **D15-04: BackToLibrary STAYS** — at the head of Reader and Highlights content. With NAV-03 restore, its `history.back()` returns to the exact library spot; shell links are the always-visible direct route. The redundancy is calm and familiar (D13-15 preserved).
- **D15-05: Brand always points to `#/` (All view)** — same target as the cold fallback (D14-14) and BackToLibrary's fallback. One predictable home, no hidden state, no view-tracking href.
- **D15-06: The destination renames to "Highlights"** — route `#/highlights`, h1 "Highlights", nav link "Highlights", title "Highlights — Lem Reader" (replacing "Review highlights" / `#/review`).
- **D15-07: Old `#/review` URLs alias-redirect** — parseHash maps `#/review` to the Highlights destination, normalized to `#/highlights` (replaceState). Old bookmarks/exports keep working; the grammar keeps ONE canonical form.
- **D15-08: No Add destination in the shell** — exactly two destinations (Library + Highlights). Add remains today's in-page IngestControl until Phase 16's focused workflow exists.
- **D15-09: Brand link AND Library nav link coexist** — both target `#/` with different semantic roles (app-home vs destination). The Library nav link carries `aria-current="page"` when active; the brand does not.
- **D15-10: The brand link's accessible name is "Lem Reader" as-is** — the wordmark text IS the name; no "home" suffix.
- **D15-11: Full restore set = view + query + tag + scroll + row focus.** The view comes from the URL (D14-12/D14-17); query + activeTag + scroll position restore from session state; focus lands on the row you launched from.
- **D15-12: Restore state lives in a session-scoped module** (or App-level state) — LibraryView reads on mount, writes on change/unmount. NO Dexie writes; LibraryView stays unmountable; NO keep-alive hidden mount.
- **D15-13: ALL return paths restore — view-matched.** BackToLibrary (history.back), shell Library link, and brand all restore filters; scroll + row focus restore ONLY when the landing view matches the captured view.
- **D15-14: Per-field graceful degradation.** Row gone → h1 focus; scroll beyond the new list height → clamp to bottom; view mismatch → filters still apply, scroll/focus reset. Never restore something that isn't true.
- **D15-15: ModeToggle becomes reader-only** — joins tags/annotations behind the `articleMounted` gate. Header reads `[tags][annotations][mode][gear]` in Reader; shell nav + gear on Library and Highlights.
- **D15-16: Gear everywhere is THE global-prefs mechanism** — the SettingsPanel stays reachable on all surfaces. No quick-controls added to the header itself.
- **D15-17: At narrow widths in Reader, the wordmark collapses** — below a breakpoint the wordmark visually collapses (brand link stays keyboard/SR-reachable) so destination links + the 4 icon buttons fit the 48px row. Touch targets stay 44px; no two-row wrap; no icon-only destination links.
- **D15-18: Article-scoped triggers stay in the shell header** — tags, annotations, and mode keep the current D5-09/D13-10 anatomy (gated), NOT moved into Reader content headers.

### the agent's Discretion
- Nav landmark shape — `<nav aria-label>` naming, link styling, relation to the existing `view-switcher` nav's label so the two landmarks stay distinct in the a11y tree.
- Session module API shape — module-level singleton vs App-lifted state vs a small store file beside `LibraryView.tsx`; when scroll is captured (unmount vs navigation-moment) as long as D15-13 holds.
- View-match comparison mechanics — how "landing view matches captured view" is derived.
- Wordmark collapse breakpoint — which width; compact-mark vs visually-hidden treatment.
- Alias-redirect implementation — where `#/review` normalization happens (parseHash + replaceState ordering).
- Row-focus target mechanics — how the launched-from row is captured and re-found after remount.
- e2e spec structure — shell-nav specs, restore specs (3 return paths × view-match matrix), gating specs across the 3-engine matrix.
- Title copy details — exact Highlights title suffix ordering.
- Token audit ordering — which surfaces drift most; what counts as drift vs intentional difference.

### Deferred Ideas (OUT OF SCOPE)
- Add as a shell destination / focused add workflow — Phase 16 (ADD-01..04, LIB-09/LIB-10).
- Quick header controls (e.g. theme toggle outside the panel) — rejected (D15-16).
- Splitting SettingsPanel into global vs reading sections — rejected (D15-16 alternative).
- Persisting library context (filters/scroll) across reloads — rejected (D15-12).
- Second nav row / per-view nav placement — rejected (D15-01).
- Icon-only destination links at narrow widths — rejected (D15-17).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | Reader can navigate directly among first-class Library and Highlights destinations through a consistent application shell | `Header.tsx` anatomy (48px bar, `.header-controls` group, `articleMounted` gating); `view-switcher` aria-current precedent (D14-22) mirrors at shell level; nav-landmark labeling guidance (MDN) |
| NAV-02 | Reader can use the Lem Reader brand as a predictable link back to the Library | Wordmark span at `Header.tsx` L94 becomes `<a href="#/">`; parseHash `#/` → list/all (verified); accessible name = wordmark text (D15-10) |
| NAV-03 | Reader can return from an article or highlight review to the prior Library context without losing active filters or scroll position | Session-module seam design (readingState.ts/restoreLocation.ts precedents); `hasAppHistory`/BackToLibrary wiring; view-switch replaceState semantics (D14-13) that make Back land on the captured view; scroll-restore timing + `history.scrollRestoration` findings |
| NAV-05 | Reading-only controls appear in reader context while globally meaningful preferences remain intentionally accessible outside an article | `articleMounted` conditional-rendering pattern already gates tags/annotations triggers; ModeToggle joins it (D15-15); gear stays ungated (D15-16) |
| POLISH-07 | Library, Highlights, Add, and Reader surfaces share consistent gutters, headers, spacing, control hierarchy, responsive behavior, and visible focus treatment | Token inventory compiled from app.css (`main#main` inset, `--space` scale, 48px header, 1100px measure, global `:focus-visible`); drift candidates catalogued; 320px header-fit arithmetic |
</phase_requirements>

## Summary

Phase 15 is a pure client-side shell phase on a mature, convention-dense codebase: **zero new packages, zero Dexie changes, zero server surface**. Everything rides existing seams — the App.tsx hash router (parseHash/VIEW_HREFS/hasAppHistory), the Header.tsx 48px bar with its `articleMounted` gating, the Phase 14 h1-focus substrate (D14-01/03/05/10/15), and the pure-module store seam (`readingState.ts`, `restoreLocation.ts`). The five sub-problems are: (1) a destination nav in the app-header with aria-current discipline; (2) a brand link to `#/`; (3) the `#/review` → `#/highlights` rename with a replaceState alias; (4) a session-scoped library-context restore module (view-match-gated scroll + row focus, always-on filter restore); (5) a POLISH-07 token audit with drift fixes.

The three load-bearing technical facts the planner must internalize: **(a)** `hashchange` does NOT fire for `history.replaceState` (MDN-verified) — the alias redirect and all replaceState normalization must pair the write with a direct `setView`, exactly like the proven D14-13 `switchLibraryView`; **(b)** the browser's default `history.scrollRestoration = "auto"` can race a programmatic restore on Back navigation — the app currently sets nothing (grep-verified), and the restore plan should set `manual`; **(c)** the restore must be gated on the async library load completing (`status === "ready"` + rows painted) or `scrollTo` clamps to zero height — the classic silent-restore-failure mode. Additionally, the narrow-width Reader header (2 destination text links + 4 44px icon buttons in a 48px row at 320px) does NOT fit under current paddings — D15-17's wordmark collapse alone recovers ~85px but CSS-token arithmetic shows ~45–70px more must come from narrow-width padding/gap tuning, and the existing 320px reflow/touch-target/mobile-chrome specs will catch any miss.

**Primary recommendation:** Build in three commits-worth of slices — (1) shell nav + brand link + ModeToggle gating + Highlights rename/alias (grammar + copy, all parseHash/pageMeta/spec updates atomic), (2) the session restore module + LibraryView integration with view-match gating, (3) POLISH-07 token audit + 320px header-fit e2e. Mirror the `view-switcher` link pattern for the destination nav, mirror `switchLibraryView`'s replaceState+setView pairing for the alias, mirror `restoreLocation.ts`'s "capture on leave, restore on return, degrade calmly" for the session module.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Destination nav + brand link (shell chrome) | Browser / Client (React SPA shell) | — | Client-only app (STACK.md); the header is persistent React chrome above `<main>` on all views [VERIFIED: codebase, App.tsx L270-283] |
| Destination routing + `#/review` alias | Browser / Client (App.tsx hash router) | — | Locked: hash routing, no router library; parseHash grammar + replaceState normalization [VERIFIED: codebase, App.tsx L50-94] |
| Return-context restore (filters/scroll/row focus) | Browser / Client (session-scoped in-memory module) | — | D15-12: session-only, NO Dexie persistence; mirrors readingState.ts pure-module seam [VERIFIED: codebase + CONTEXT] |
| Control context-gating (NAV-05) | Browser / Client (conditional rendering on `articleMounted`) | — | Established D5-09/D13-10 pattern in Header.tsx [VERIFIED: codebase, Header.tsx L113-152] |
| Shared geometry (POLISH-07) | Browser / Client (authored CSS custom properties) | — | app.css tokens (`--space` scale, 48px header, `main#main` inset, global `:focus-visible`); no layout system (D15-03) [VERIFIED: codebase, app.css L22-41, L131-134, L199-234, L392-412] |
| Per-destination titles | Browser / Client (pageMeta.ts helper) | — | D14-02 convention: one helper owns suffix/separator/truncation [VERIFIED: codebase, pageMeta.ts] |

No server, CDN, or storage tier participates in this phase.

## Standard Stack

### Core
No new libraries. This phase extends the existing, verified stack:

| Technology | Version (installed) | Purpose in this phase | Why |
|------------|--------------------|-----------------------|-----|
| React + React DOM | 19.2.8 | Shell nav component, conditional gating, restore wiring | `createRoot` SPA; Header/App/LibraryView are existing consumers [VERIFIED: codebase, package.json] |
| TypeScript | 7.0.2 | View union extension, session-module types | Grammar + restore contracts are boundary-heavy [VERIFIED: codebase] |
| Authored CSS (app.css) | — | Nav styles, wordmark collapse, token drift fixes | No Tailwind/component suite (STACK.md "What NOT to Use") |
| Vitest + React Testing Library | 4.1.10 / 16.3.2 | parseHash unit tests, session-module logic tests | Existing App.test.tsx parseHash surface [VERIFIED: codebase, tests/component/App.test.tsx] |
| Playwright Test | 1.61.1 | 3-engine e2e (chromium/firefox/webkit) for nav/restore/gating/geometry | Layout/focus/scroll truth needs real browsers [VERIFIED: codebase, playwright.config.ts L20-24] |

**Installation:** NONE. `npm install` adds nothing this phase.

**Version verification:** Not applicable — no new packages. Existing versions confirmed from package.json + node_modules on disk [VERIFIED: codebase].

## Package Legitimacy Audit

**None required — this phase installs zero external packages.** All work composes existing dependencies (react, react-dom) and browser primitives (`history.replaceState`, `window.scrollTo`, `focus()`). Packages removed due to SLOP verdict: none. Packages flagged as suspicious: none.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────────────────┐
                    │  App shell (AppInner, mounted once per session)           │
                    │                                                          │
                    │  SkipLink → Header ──────────────→ SettingsPanel (dialog)│
                    │             │                                            │
                    │  ┌──────────┴───────────────────────────────┐            │
                    │  │ .app-header (48px, sticky, one row)      │            │
                    │  │ [brand→#/ ] [nav: Library|Highlights]    │            │
                    │  │        ...spacer...                      │            │
                    │  │ [tags][annotations][mode]  ← articleMounted-gated     │
                    │  │ [gear]  ← always (D15-16)                │            │
                    │  └──────────────────────────────────────────┘            │
                    │             │ hashchange / replaceState+setView          │
                    │  ┌──────────▼───────────────────────────────┐            │
                    │  │ parseHash grammar:                       │            │
                    │  │  #/article/<id>[/h/<hl>] → article       │            │
                    │  │  #/highlights            → review ───────┼── alias:   │
                    │  │  #/review (legacy) ──┬──→ review         │    replace-│
                    │  │                      └── replaceState(#/highlights)  │
                    │  │  #/unread|#/in-progress|#/finished|#/ → list(view)   │
                    │  └──────────┬───────────────────────────────┘            │
                    └─────────────┼────────────────────────────────────────────┘
                                  │ three-view swap (LibraryView | ReviewView | ArticleView)
          ┌───────────────────────┼──────────────────────────┐
          ▼                       ▼                          ▼
   LibraryView (main#main)  ReviewView → "Highlights"   ArticleView
   - query/activeTag state  - h1 "Highlights"           - BackToLibrary (stays, D15-04)
   - view-switcher nav      - BackToLibrary             - reading position saved via
   - .library-list rows     - title via pageMeta          restoreLocation (leaving is safe)
          │                                                            │
          │ mount: read session state; unmount/change: write            │
          ▼                                                            ▼
   librarySession (NEW, session-scoped in-memory module — NO Dexie)   saved location (Dexie, existing)
   { view, query, activeTag, scrollTop, lastArticleId }
          │
          │ restore rules (D15-13/D15-14):
          │  filters (query+tag) → ALWAYS restore on return
          │  scroll + row focus  → ONLY when landing view === captured view
          │  row gone            → h1 focus (D14-05 default)
          │  scroll > list height→ clamp to bottom
          │  view mismatch       → filters apply, scroll/focus reset
```

Trace the primary use case: reader on Library (Unread view, scrolled, query typed) → clicks a row's "Open article" → LibraryView unmount captures {view:"unread", query, activeTag, scrollTop, lastArticleId} → reads in Reader → BackToLibrary `history.back()` (hasAppHistory true) → hashchange → parseHash → list/unread (the replaceState-mutated entry) → LibraryView remounts → load completes → view matches → filters restored, scroll restored, focus lands on the launching row's "Open article" link.

### Recommended Project Structure

No new folders. Touched files:

```
src/
├── App.tsx                        # parseHash: #/highlights + #/review alias; shell nav props; restore wiring
├── reader/
│   ├── Header.tsx                 # brand link + destination nav + ModeToggle gating + collapse class
│   └── BackToLibrary.tsx          # UNCHANGED (D15-04)
├── ingestion/library/
│   ├── LibraryView.tsx            # restore read/write integration; view-match gate; row focus
│   ├── librarySession.ts          # NEW (recommended): session-scoped restore module (D15-12 discretion)
│   └── pageMeta.ts                # UNCHANGED helper; caller passes "Highlights"
├── routes/review/ReviewView.tsx   # rename pass: h1, title, copy
└── app.css                        # .shell-nav styles, wordmark collapse, token drift fixes
tests/
├── component/App.test.tsx         # parseHash: #/highlights + alias cases
├── unit/library/library-session.test.ts   # NEW: view-match/clamp/degradation logic
└── e2e/
    ├── chrome/shell-nav.spec.ts   # NEW: NAV-01/NAV-02/NAV-05 + geometry
    └── library/library-restore.spec.ts    # NEW: NAV-03 matrix
```

### Pattern 1: Links-in-a-nav with aria-current (mirror the shipped view-switcher)
**What:** The destination nav is real `<a>` links inside a labeled `<nav>`; exactly one link carries `aria-current="page"` when its destination is active.
**When to use:** Shell destination nav (NAV-01) — this is the D14-22 pattern promoted to shell level.
**Example (shipped code to mirror — LibraryView.tsx L431-464):**
```typescript
<nav className="view-switcher" aria-label="Library views">
  {VIEW_LINKS.map(({ view: linkView, href, label }) => (
    <a
      key={linkView}
      href={href}
      aria-current={view === linkView ? "page" : undefined}
      onClick={(e) => { /* unmodified-left-click interception optional */ }}
    >
      {label}
    </a>
  ))}
</nav>
```
[VERIFIED: codebase, LibraryView.tsx L431-464; aria-current="page" semantics per WAI-ARIA APG — CITED: w3c/wai-aria-practices via Context7]

Naming constraint: with a second `<nav>` in the document (the shell nav) alongside LibraryView's `aria-label="Library views"` switcher, **each landmark needs a distinct label** ("Main"/"Footer" example in MDN) [CITED: MDN navigation role docs via Context7]. Discretion: "Primary" vs "Destinations" — recommend `aria-label="Primary"` (conventional; screen-reader users meet it most often) — planner confirms.

### Pattern 2: replaceState normalization with direct setView (mirror switchLibraryView)
**What:** URL normalization that must not create history entries pairs `history.replaceState` (constant href — same-origin by construction, T-14-04) with a DIRECT router update, because **`hashchange` does not fire for pushState/replaceState** [CITED: MDN hashchange event via Context7].
**When to use:** The `#/review` → `#/highlights` alias (D15-07) and any view-tracking-free normalization.
**Example (shipped code to mirror — App.tsx L264-268):**
```typescript
const switchLibraryView = (next: LibraryViewName) => {
  if (view.name === "list" && view.view === next) return;
  history.replaceState(null, "", VIEW_HREFS[next]);  // fires NO hashchange
  setView(parseHash());                               // load-bearing direct update
};
```
Alias variant (recommended shape): parseHash keeps mapping `#/review` → `{ name: "review" }` (single grammar authority); the normalization (replaceState to `#/highlights`) runs in the same handler that consumed the alias — on cold load before first paint, and inside `onHash` alongside `setView(parseHash())`. Never pushState (would corrupt Back-count semantics D14-14). [VERIFIED: codebase, App.tsx L208-229, L254-268]

### Pattern 3: Capture-on-leave / restore-on-return / degrade-calmly (mirror restoreLocation)
**What:** Session state is captured when leaving a surface and restored on return, with explicit clamps — never restore something that isn't true.
**When to use:** The librarySession module (D15-11..14).
**Example (shipped precedent — restoreLocation.ts L123-146, findScrollTarget):** offset overshoot clamps to the LAST block ("corpus changed since save" — calm nearest-block fallback, never null). The library twin: scrollTop beyond the restored list height clamps to bottom; a vanished row falls back to the h1 focus (the D14-05 default); a view mismatch resets scroll/focus but keeps filters. [VERIFIED: codebase]

### Pattern 4: Pure-module store seam (mirror readingState.ts)
**What:** Session/derivation logic lives in a plain module with zero React and zero Dexie imports; components own the IO (reads on mount, writes on change/unmount).
**When to use:** librarySession.ts — recommended shape is a module-level singleton (simplest; App-level state is the alternative) exposing e.g. `captureLibraryContext(ctx)`, `takeLibraryContext()` / `peekLibraryContext()`, and a pure `shouldRestoreScroll(landing: LibraryViewName, captured: LibraryViewName)` comparator. jsdom-unit-testable. [VERIFIED: codebase, readingState.ts L1-33 header documents the discipline]

### Pattern 5: articleMounted conditional gating (extend to ModeToggle)
**What:** Article-scoped header controls render only when `view.name === "article"` (App passes `articleMounted`).
**When to use:** NAV-05 — wrap `<ModeToggle>` in the same `{articleMounted && …}` guard as tags/annotations triggers (Header.tsx L113/L132). The gear stays ungated (D15-16).
[VERIFIED: codebase, Header.tsx L113-152, App.tsx L277]

### Anti-Patterns to Avoid
- **Icon-only destination links / two-row header at narrow widths** — rejected by D15-17; the 48px single-row geometry is load-bearing (`main.paginated-main` height calc, banner `top: 48px` offsets, `restoreLocation.ts` `headerPx = 48`) [VERIFIED: codebase, app.css L870, L214-221; restoreLocation.ts L168-171].
- **`display: none` for the collapsed wordmark** — removes the brand link from the accessibility tree; D15-17 requires the link stay keyboard/SR-reachable. Use the shipped `.visually-hidden` pattern (app.css L153+) or a compact-mark treatment.
- **pushState for the alias redirect** — pushes a history entry; Back from Highlights would land on `#/review` (re-aliasing forever) instead of the library. replaceState only.
- **Restoring scroll before rows render** — `window.scrollTo` clamps to the current (near-zero) document height during the async `Promise.all` load; restore must be gated on `status === "ready"` + painted rows.
- **Persisting restore state to Dexie** — explicitly rejected (D15-12); Pitfall 9 discipline says Phase 15 needs NO store changes [VERIFIED: CONTEXT + grep — no `db.version(` additions expected].
- **A shared shell-layout component or new layout system** — rejected (D15-03); token fixes only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Routing | A router abstraction/history library | The existing App.tsx hash router (parseHash + hashchange + replaceState) | Locked by prior decision; REQUIREMENTS "Out of Scope" explicitly excludes a new router; the grammar is unit-tested [VERIFIED: codebase + REQUIREMENTS.md] |
| Scroll persistence across reloads | Dexie-backed scroll storage | Session-scoped module only (D15-12) | Persistence across reloads was explicitly rejected; view already restores from URL (D14-17) |
| Focus management on route swap | A focus-manager service | The D14 h1-focus substrate (tabindex={-1} + `warmMount`-gated focus + most-specific-target layering) | Shipped, 3-engine-proven in reading-views.spec.ts [VERIFIED: codebase] |
| Keep-alive (hidden mounted LibraryView) | Mount-persistence hack | Unmount/remount + session capture/restore | D15-12 explicitly forbids keep-alive; the strip's fail-quiet + refreshKey precedents cover reload flows |
| Nav styling | Component-suite nav / CSS framework | Authored `.shell-nav` tokens mirroring `.view-switcher` | STACK.md "What NOT to Use" [VERIFIED: codebase conventions] |

**Key insight:** This phase's risk is not missing tooling — it is breaking fourteen phases of locked contracts. Every new behavior composes an existing seam.

## Runtime State Inventory

> This phase includes a rename (`#/review` → `#/highlights`), so the inventory is required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — grep of `src/persistence`, `src/portability`, `server`, `functions` for `#/review`/`#/article` returns zero hits; no Dexie store persists route strings; export bundles/markdown emit no in-app route links | None (code-only rename) [VERIFIED: codebase grep 2026-08-25] |
| Live service config | **None** — no external services carry the route (static SPA; no analytics/dashboards) | None |
| OS-registered state | **None** — no OS tasks/launchd/pm2 reference app routes | None |
| Secrets/env vars | **None** — no env var references a route name | None |
| Build artifacts | `dist/` (if present from prior builds) embeds the old `#/review` grammar until rebuilt | None blocking — production deploy rebuilds via `npm run build`; no committed artifact greps required |

**Canonical question answered:** after every repo file is updated, no runtime system still holds the old string except stale `dist/` output, which a rebuild replaces. The alias (D15-07) additionally makes old URLs held in USER bookmarks/history safe.

## Common Pitfalls

### Pitfall 1: The 320px Reader header does not fit under current tokens
**What goes wrong:** In Reader at 320px the header must hold: destination links "Library" + "Highlights" (14px UI font, ≈50+70px with `--space-xs` padding), the wordmark (≈85px, or collapsed), and 4 gated 44px icon buttons (tags/annotations/mode/gear = 176px + 3×8px gaps = 200px). Available width: 320 − 2×24px (`--space-lg` inline padding) = 272px. 200px controls + ≈128px links + gaps ≈ 344px > 272px — **overflow of roughly 45–75px even with the wordmark fully collapsed**.
**Why it happens:** D15-17's wordmark collapse recovers ~85px but the arithmetic still doesn't close under current paddings.
**How to avoid:** Narrow-width media query (the established `<640px` family) tuning: header `padding-inline` down to `--space-sm`/`--space-md`, `.header-controls` gap 8→4px, nav-link inline padding 0–2px, header gap 16→8px — recoverable budget ≈ 32+12+16+8 = 68px. The plan MUST include an e2e assertion at 320×640 (Reader context) that the 48px row neither wraps nor overflows (mirror `mobile-first-page-chrome.spec.ts` assertion style). Existing `reflow.spec.ts`, `touch-targets.spec.ts`, and `high-zoom.spec.ts` all run at 320px and will catch regressions.
**Warning signs:** reflow/touch-target e2e failures; visible two-row header or horizontal scrollbar on small phones.
**Confidence:** MEDIUM (CSS-token arithmetic, not rendered measurement — verify in e2e) [VERIFIED token values: codebase, app.css L22-41, L392-412]

### Pitfall 2: hashchange does not fire for replaceState
**What goes wrong:** An alias redirect implemented as `location.hash = "#/highlights"` (assignment) DOES fire hashchange (double-processing risk), while `history.replaceState(null, "", "#/highlights")` fires NOTHING — URL and React state desync (the documented D14-13 failure mode).
**How to avoid:** Mirror `switchLibraryView` exactly: replaceState with a constant href + direct `setView(parseHash())` in the same handler. [CITED: MDN hashchange via Context7; VERIFIED in-repo precedent: App.tsx L254-268]

### Pitfall 3: Browser scroll restoration racing the programmatic restore
**What goes wrong:** On `history.back()`, browsers with default `history.scrollRestoration === "auto"` asynchronously attempt to restore the entry's scroll offset — which can land after (and fight) the app's own restore, or clamp against the not-yet-rendered height and then lock in 0.
**How to avoid:** Set `history.scrollRestoration = "manual"` (once, early in App mount — it persists for the session) and own scroll entirely. Grep confirms the app currently sets nothing. Note: with manual, reload loses browser scroll restore too — acceptable (D15-12 rejects cross-reload persistence; the D14-17 stance is URL-carried view only) but the plan should state it consciously. [CITED: MDN History.scrollRestoration via Context7; VERIFIED absence: codebase grep]

### Pitfall 4: Restore-before-render (scroll clamps to 0, focus finds no row)
**What goes wrong:** LibraryView's data arrives via an async `Promise.all` (listArticles + locations + tags + books). A mount-effect restore runs before rows exist → `scrollTo(0, 3000)` clamps to ~0; the row-link query finds nothing → silently falls to h1 (which itself may scroll to top).
**How to avoid:** Gate scroll + row-focus restore on `status === "ready"` AND the list painted (a `[status]`-keyed effect or the load `.then`); the h1-vs-row decision happens at that same moment. Filters (query/tag) are plain state initialization — safe at mount. [VERIFIED: codebase, LibraryView.tsx L222-272 load effect]

### Pitfall 5: focus() and scrollTo interact — order matters
**What goes wrong:** `rowLink.focus()` (default `preventScroll: false`) scrolls the row into view, overriding a just-set `scrollTo(0, saved)`. Conversely `scrollTo` after focus can move the focused row off-screen (focus retained but invisible).
**How to avoid:** Decide ordering explicitly: restore scroll FIRST, then focus the row with `preventScroll: true` if the row is already within the restored viewport — or focus without preventScroll and skip the scrollTo when the focus target exists (focus's scroll-into-view subsumes it). D14-15's h1 focus deliberately used default scroll behavior ("reset-to-list-top"); row restore deliberately differs. Reduced-motion is safe either way (global gate forces `scroll-behavior: auto`). [VERIFIED: codebase, LibraryView.tsx L193-197 comment]

### Pitfall 6: The rename breaks ~10 spec files that pin "Review highlights"
**What goes wrong:** `rg "Review highlights|#/review"` in tests/ hits: reading-views.spec.ts, route-entry.spec.ts, listing.spec.ts, empty-states.spec.ts, tri-state.spec.ts, curate.spec.ts, jump-bidirectional.spec.ts, forced-colors.spec.ts, panel-keyboard.spec.ts (+ App.test.tsx parseHash cases). Renaming the h1 without updating every assertion atomically turns the honest full-suite gate (`npm run test` exit 0) red.
**How to avoid:** One commit renames grammar + copy + ALL pinned assertions together (grep-clean before commit: `rg "Review highlights|#/review" src tests` → only intentional alias-test hits remain). Strengthen-only discipline permits deliberate anchor renames locked by decision (D14-25 precedent: text constant EXCEPT when a locked decision renames it); add NEW alias-compat specs rather than weakening old coverage. [VERIFIED: codebase grep — hit list above]

### Pitfall 7: Phase 14 specs assert h1-on-Back — row restore changes that behavior
**What goes wrong:** reading-views.spec.ts L824+ ("Back refocuses the library h1") asserts the exact behavior NAV-03 supersedes when a restorable row exists.
**How to avoid:** Update those assertions deliberately in the restore commit: Back with a captured+match row → row focused; Back with no capture (cold→article→Back edge) or mismatch → h1 (unchanged). This is the phase's purpose, not a regression — but every changed assertion needs its D15-11..14 citation in the spec comment.

### Pitfall 8: StrictMode double-mount clobbers capture/restore timing
**What goes wrong:** Dev StrictMode mount→cleanup→mount double-invoke can run the unmount-capture between the twin mounts, writing a stale/wrong context (the 14-04 `lastViewRef` lesson), or run restore twice (idempotent if pure).
**How to avoid:** Capture reads live values (scrollY, current state) so a twin-pass rewrite is byte-identical; make restore idempotent; use previous-value comparison (not first-run booleans) for one-shot effects — the shipped `lastViewRef` pattern. [VERIFIED: codebase, LibraryView.tsx L139-145 comment]

### Pitfall 9: Wordmark collapse that orphans the brand link
**What goes wrong:** Hiding the wordmark with `display: none` removes the D15-05 brand link from tab order and the a11y tree — NAV-02 silently lost at narrow widths.
**How to avoid:** `.visually-hidden` clip pattern (shipped helper) or a compact mark; keep the `<a>` focusable; assert keyboard reachability of "Lem Reader" link at 320px in the shell-nav e2e. [VERIFIED: codebase, app.css L153+ visually-hidden; CITED: WCAG-focused practice]

### Pitfall 10: In-page "Review highlights" button left in limbo
**What goes wrong:** LibraryView's D10-02 button (L388-396) navigates to `#/review` with the label "Review highlights". Post-rename it would either target a legacy alias or carry retired vocabulary — and D15-06's rename list (route/h1/nav-link/title) does NOT include it.
**How to avoid:** Resolve explicitly in the plan (see Open Questions Q1 — recommendation: remove it; the shell Highlights link replaces it, mirroring how BackToLibrary already covers the reverse direction). Whatever the choice, `route-entry.spec.ts (a)` (which drives this button) must be updated in the same commit. [VERIFIED: codebase, LibraryView.tsx L388-396; route-entry.spec.ts L34-48]

## Code Examples

### Destination nav in Header.tsx (recommended shape)
```typescript
// Mirrors the D14-22 view-switcher at shell level. Two landmarks in the
// document (this + "Library views") require DISTINCT aria-labels.
<nav className="shell-nav" aria-label="Primary">
  <a href="#/" aria-current={viewName === "list" ? "page" : undefined}>
    Library
  </a>
  <a href="#/highlights" aria-current={viewName === "review" ? "page" : undefined}>
    Highlights
  </a>
</nav>
```
Notes: hrefs are constants (same-origin by construction — the VIEW_HREFS discipline); plain links (no onClick interception needed — hash assignment pushes a history entry, which is the desired Back semantics for destination navigation, and modified clicks fall through natively). App must thread the current destination to Header (new prop, e.g. `destination: "library" | "highlights" | "reader"` derived from `view`). `aria-current` on the Library link only when the list view is active; NEVER on the brand link (D15-09). [VERIFIED: pattern mirrors LibraryView.tsx L431-464; CITED: WAI-ARIA APG aria-current via Context7]

### Brand link conversion (Header.tsx L94)
```typescript
// Before: <span className="app-wordmark">Lem Reader</span>
<a className="app-wordmark" href="#/">
  Lem Reader
</a>
```
Accessible name is the text (D15-10 — no aria-label, no "home" suffix). Fixed literal href `#/` (D15-05 — never view-tracking). Note the CSS comment at app.css L411 ("Wordmark is a <span>, NOT a link") must be updated with the decision citation. [VERIFIED: codebase, Header.tsx L94, app.css L405-412]

### parseHash extension (App.tsx)
```typescript
if (window.location.hash === "#/highlights") {
  return { name: "review" };  // internal View name — see Open Questions Q4
}
if (window.location.hash === "#/review") {
  return { name: "review", legacyAlias: true };  // D15-07 — caller replaceState-normalizes
}
```
Grammar order stays: article regex → `#/highlights` → `#/review` alias → view segments → All fallback (the 10-RESEARCH Pattern 1 ordering discipline; unknown `#/review/x` still falls through to All — existing unit case). [VERIFIED: codebase, App.tsx L50-83; tests/component/App.test.tsx L119-127]

### Session module sketch (librarySession.ts)
```typescript
// Pure module — the readingState.ts store-seam discipline. NO React, NO Dexie.
export interface LibraryContextSnapshot {
  view: LibraryViewName;
  query: string;
  activeTag: string | null;
  scrollTop: number;
  lastArticleId: string | null;  // the row you launched from
}
let snapshot: LibraryContextSnapshot | null = null;
export function captureLibraryContext(next: LibraryContextSnapshot): void { snapshot = next; }
export function peekLibraryContext(): LibraryContextSnapshot | null { return snapshot; }
// Pure comparators — unit-testable:
export function viewMatches(landing: LibraryViewName, captured: LibraryViewName): boolean { … }
export function clampScroll(saved: number, listHeight: number): number { … }
```
LibraryView: initialize `query`/`activeTag` from the snapshot at first render (lazy `useState` initializer); write the snapshot on every change + unmount cleanup (reading `window.scrollY` at cleanup — the library DOM is still mounted at that moment, so the value is valid); restore scroll + row focus only in the post-ready path when `viewMatches(landing, captured)`. Row lookup by article id: query `a[href="#/article/${id}"]` (constant-template; ids arrive from validated records — the T-10-02c discipline) or a React ref map. [VERIFIED: seam precedents readingState.ts / restoreLocation.ts / useScrollSave]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wordmark as `<span>` (UI-SPEC v1: "no global Home route") | Brand as link to `#/` | Phase 15 (D15-05) | app.css L411 comment + UI-SPEC superseded; a "home" now exists by decision |
| `#/review` + "Review highlights" vocabulary | `#/highlights` + "Highlights", legacy alias kept | Phase 15 (D15-06/07) | ~10 spec files + parseHash + ReviewView copy updated atomically |
| Mode toggle always visible in header | Reader-only (articleMounted gate) | Phase 15 (D15-15) | Library/Highlights header shows nav + gear only |
| Return-to-library: h1 focus always (D14-08) | Row focus when captured+matched, else h1 | Phase 15 (D15-11) | Extends D14-05/10 layering; reading-views specs updated |
| No scrollRestoration setting (browser default auto) | `history.scrollRestoration = "manual"` recommended | Phase 15 | App owns scroll on Back; reload loses browser restore (accepted per D15-12) |

**Deprecated/outdated within this phase's scope:** none beyond the above (no library-level deprecations apply — React 19.2/Vite 8 stack is current per STACK.md).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 320px header fit requires ~45-75px of narrow-width padding/gap tuning beyond the wordmark collapse (arithmetic from CSS tokens, not rendered measurement) | Pitfall 1 | If actual rendered link widths are smaller, tuning budget shrinks (harmless); if larger, links clip/wrap at 320px — e2e geometry assertion catches it before ship |
| A2 | `history.scrollRestoration = "manual"` is net-positive here (no in-repo precedent; MDN semantics verified, interaction with this app's unmount/remount cycle is reasoned, not browser-tested) | Pitfall 3 | If auto-restore proves harmless/beneficial, setting manual loses reload scroll restore unnecessarily — planner may A/B in an e2e before committing |
| A3 | Recommended `aria-label="Primary"` for the destination nav satisfies the distinct-landmark requirement | Pattern 1 / Open Questions | Pure naming taste; any label distinct from "Library views" meets the MDN guidance |

All other claims in this research were verified against the codebase (direct file reads/greps) or cited from MDN/WAI-ARIA via Context7.

## Open Questions (RESOLVED)

All four questions were closed during planning — resolutions are pinned in 15-UI-SPEC.md and the PLAN.md files. Per-question pointers:

1. **The in-page "Review highlights" button (LibraryView L388-396) — remove or keep-renamed?**
   - What we know: D15-06's rename list covers route/h1/nav-link/title but NOT this button; the shell Highlights link makes it redundant; D15-04 deliberately kept BackToLibrary as "calm redundancy" but no such decision keeps this button; its label carries retired vocabulary.
   - What's unclear: whether the user wants the library header to retain a second Highlights entry.
   - Recommendation: REMOVE it (shell link replaces it; reduces the library header to the calm h1 row POLISH-06 established); rewrite `route-entry.spec.ts (a)` to drive navigation via the shell link. If kept, rename to "Highlights" and accept the duplication.
   - **RESOLVED — removed:** UI-SPEC auto-resolution #5 + 15-02 Task 3 (the shell Highlights link replaces the in-page button).
2. **Wordmark collapse breakpoint + treatment** — discretion. Recommend a `max-width` rule in the existing sub-640px family with the compact-mark treatment (keeps a visible brand cue); visually-hidden is the fallback if 320px arithmetic stays tight. Verify via the 320px e2e.
   - **RESOLVED — `.visually-hidden` clip collapse at ≤639px:** UI-SPEC #3 + 15-02 Task 2 (applied on all destinations; the 320×640 collapse-safety test asserts keyboard/SR reachability).
3. **Internal `View` union name** — keep `{ name: "review" }` or rename to `"highlights"`? Renaming is cleaner grammar but touches every `view.name ===` site (App + specs). Recommend keeping the internal name with a comment, OR renaming within the same commit as the grammar change — planner's call on diff-size vs clarity.
   - **RESOLVED — internal view name `"review"` stays:** 15-01 Task 2 (user-facing vocabulary renames; the internal grammar name remains stable with a D15-06 citation; alias parses carry `legacyAlias: true`).
4. **Restore + `warmMount` composition detail** — the h1-focus mount effect (`if (warmMount) h1Ref.current?.focus()`) gains a row-focus branch that preempts it (most-specific wins). Exact mechanism (ref map vs querySelector, preventScroll choice) is discretion — see Pitfall 5 for the ordering constraint the plan must pin.
   - **RESOLVED — ready-gated scroll-then-focus ordering:** 15-03 Task 3 (restore runs at `status === "ready"`; clamped `window.scrollTo` first, then row focus via the constant-template querySelector with `preventScroll` iff the row intersects the restored viewport).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | dev/build/e2e | ✓ | v22.22.3 (LTS — meets Vite 8's 22.12+) | — |
| npm | package management | ✓ | 10.9.8 | — |
| Playwright (local install) | 3-engine e2e | ✓ | in node_modules/.bin | — |
| Vite dev server (localhost:5173) | e2e BASE URL | ✓ (script: `npm run dev`) | 8.x | — |
| Dexie/IndexedDB | library data for restore specs | ✓ | 4.4.4 (in-repo seeding helpers) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

Step 2.6 note: no NEW external dependencies — all required tooling already installed and exercised by the existing suite.

## Validation Architecture

### Signal/System Model (this phase)
- **System:** the app shell (Header + router + three destinations) and the library return path.
- **Signals (observable behaviors):** (1) destination nav present + correctly `aria-current`-marked in all 3 destinations; (2) brand activation lands on `#/` All view; (3) legacy `#/review` lands on Highlights with a normalized URL; (4) return restores query/tag always, scroll + row focus when view-matched, degrades calmly otherwise; (5) ModeToggle absent outside Reader, gear everywhere; (6) 48px header row holds at 320px; titles/h1/one-landmark-set invariants survive.
- **Observation points:** DOM (nav structure, aria-current, activeElement), URL (`location.hash` post-alias), scroll (`window.scrollY`), `document.title`, rendered geometry (boundingClientRect / scrollHeight).
- **Sampling strategy:** per-task = targeted unit + single-engine e2e of the touched behavior; per-wave = 3-engine run of the new specs + renamed-surface specs; phase gate = full `npm run test` exit 0 (the honest-suite discipline).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component, jsdom) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| Config file | `vitest.config.ts`, `playwright.config.ts` (both existing) |
| Quick run command | `npx vitest --run tests/component/App.test.tsx tests/unit/library/library-session.test.ts` |
| Full suite command | `npm run test` (unit `--run` + full e2e; exit-0 gate) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Shell nav renders in Library/Highlights/Reader; aria-current moves with destination; link navigates | e2e (3-engine) | `npx playwright test chrome/shell-nav.spec.ts` | ❌ Wave 0 |
| NAV-02 | Brand link → `#/` All view from Reader and Highlights; accessible name "Lem Reader" | e2e | `npx playwright test chrome/shell-nav.spec.ts -g brand` | ❌ Wave 0 |
| NAV-02 | Brand link keyboard/SR-reachable at 320px (collapse safety) | e2e | `npx playwright test chrome/shell-nav.spec.ts -g "brand.*320\|collapsed"` | ❌ Wave 0 |
| NAV-03 | parseHash alias: `#/review` → review view + URL normalized | unit | `npx vitest --run tests/component/App.test.tsx` | ✅ (extend) |
| NAV-03 | Restore: filters always; scroll+row focus on view-match; degradation matrix (3 return paths × match/mismatch × row-gone/scroll-clamp) | e2e | `npx playwright test library/library-restore.spec.ts` | ❌ Wave 0 |
| NAV-03 | Session module pure logic (view-match, clamp, snapshot round-trip) | unit | `npx vitest --run tests/unit/library/library-session.test.ts` | ❌ Wave 0 |
| NAV-05 | ModeToggle absent on Library/Highlights, present in Reader; gear everywhere | e2e | `npx playwright test chrome/shell-nav.spec.ts -g gating` | ❌ Wave 0 (extends route-entry (e) precedent) |
| POLISH-07 | 48px header single row at 320×640 in Reader (no wrap/overflow); touch targets ≥44px | e2e | `npx playwright test chrome/shell-nav.spec.ts -g "320"` | ❌ Wave 0 |
| POLISH-07 | Token audit (gutters/spacing/focus across 4 surfaces) | code review + e2e spot-assertions | manual + `npx playwright test reflow.spec.ts touch-targets.spec.ts` | ✅ (existing nets) |
| NAV-01 (titles) | "Highlights — Lem Reader" via pageMeta convention | unit + e2e | `npx vitest --run tests/unit/library/page-meta.test.ts` (extend caller test) | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `npm run lint` + the quick unit command for the touched module + single-engine (`--project=chromium`) run of the new spec.
- **Per wave merge:** 3-engine run of shell-nav + library-restore + the renamed review-panel specs.
- **Phase gate:** full suite green (`npm run test` exit 0, fail counts recorded) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/e2e/chrome/shell-nav.spec.ts` — NAV-01/NAV-02/NAV-05 + 320px geometry (covers REQ rows above)
- [ ] `tests/e2e/library/library-restore.spec.ts` — NAV-03 matrix (reuse the `search-tag-filter.spec.ts` seeding helpers + `wipeDatabase` beforeEach discipline)
- [ ] `tests/unit/library/library-session.test.ts` — pure comparators/snapshot logic
- [ ] Extend `tests/component/App.test.tsx` — `#/highlights` + `#/review` alias parseHash cases
- [ ] Update pass (same commit as rename): the ~10 spec files pinning "Review highlights"/`#/review`

Framework install: none needed.

## Security Domain

`security_enforcement: true`, ASVS Level 1, block_on high — checked against this phase's surface (client-only shell; no new inputs, no network, no storage).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Local-only app; no accounts (PROJECT.md Constraints) |
| V3 Session Management | no | No server sessions |
| V4 Access Control | no | No privileged surfaces; all data local |
| V5 Input Validation | yes (minimal) | The hash remains a foreign-influenced input: parseHash keeps the CLOSED literal allowlist discipline — `#/highlights` compared `===` against a constant; no regex capture reaches the DOM; the alias adds a constant rewrite target. Route values are never interpolated into URLs/DOM (T-10-02c discipline preserved) [VERIFIED: codebase, App.tsx L59-94] |
| V6 Cryptography | no | Nothing new hashed/encrypted |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hash-injected route tampering (crafted `#/...` values) | Tampering | Literal-allowlist parseHash; unknown segments → All fallback (D14-16); new destinations are constants only |
| Stored XSS via renamed copy/title | Tampering | All copy is static literals rendered as React text children; `setDocumentTitle` is text-only with a 64-char cap (T-14-01) [VERIFIED: codebase, pageMeta.ts] |
| Open-redirect via brand/nav hrefs | Tampering | Constant hrefs (`#/`, `#/highlights`) — same-origin by construction (T-14-04); no attacker-influenced URL reaches navigation |
| Session-restore state pollution | Tampering | Snapshot holds only app-generated values (view names, numbers, validated article ids); row lookup uses constant-template selectors, results used only as lookup keys |

No high/blocking threat patterns introduced; no new secrets, env vars, or network calls.

## Sources

### Primary (HIGH confidence — direct codebase verification, this session)
- `src/App.tsx` — router grammar, VIEW_HREFS, hasAppHistory, switchLibraryView, three-view swap (read in full)
- `src/reader/Header.tsx` — 48px bar anatomy, header-controls group, articleMounted gating, wordmark span (read in full)
- `src/ingestion/library/LibraryView.tsx` — query/activeTag state, mount/view-switch focus effects, view-switcher nav, load effect, D10-02 button (read in full)
- `src/routes/review/ReviewView.tsx` — review-header + BackToLibrary + h1 + title mount effect (read)
- `src/reader/BackToLibrary.tsx`, `src/reader/restoreLocation.ts`, `src/ingestion/library/readingState.ts`, `src/ingestion/library/pageMeta.ts`, `src/ingestion/library/LibraryRow.tsx` (read)
- `src/app.css` — tokens (L22-41), `:focus-visible` (L131), `main#main` inset (L199-234), `.app-header`/`.app-wordmark` (L388-412), `.view-switcher` (L2051-2078), `.library-header` (L2154+), `.review-header` (L2717+), `.back-to-library` (L3160-3192), `.ingest-control` (L750+), breakpoints inventory
- `tests/component/App.test.tsx` (parseHash unit surface), `tests/e2e/library/reading-views.spec.ts` (NAV-04 matrix structure), `tests/e2e/chrome/mobile-first-page-chrome.spec.ts` + `header-geometry.spec.ts` (320px geometry assertion precedents), `tests/e2e/review-panel/*`, grep hit list for the rename
- `package.json`, `playwright.config.ts`, `vitest.config.ts` — versions, 3-engine matrix, scripts
- Greps: `scrollRestoration` (zero hits), `#/review|#/article` in persistence/portability/server (zero hits)

### Secondary (MEDIUM confidence — Context7 documentation)
- WAI-ARIA Authoring Practices Guide (`/w3c/wai-aria-practices`) — aria-current="page" on the link matching the current page
- MDN (`/mdn/content`) — History.scrollRestoration ('auto' vs 'manual'); hashchange (does not fire for pushState/replaceState); navigation-role landmark labeling (unique aria-label per nav)

### Tertiary (LOW confidence)
- None used. No WebSearch-provider availability was configured (all search flags false); every external claim went through Context7 to primary documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing new installed; all versions read from package.json/lockfile on disk
- Architecture: HIGH — every pattern grounded in shipped, spec-covered code read this session
- Pitfalls: HIGH for codebase-grounded items (1 partially MEDIUM — 320px arithmetic is estimated, flagged A1); external-API pitfalls MEDIUM-HIGH (MDN-cited)
- Restore design: HIGH on constraints (locked by CONTEXT), MEDIUM on the two discretion mechanics flagged in Open Questions

**Research date:** 2026-08-25
**Valid until:** 2026-09-24 (stable domain — no external dependencies; codebase claims tied to commit 6571258)
