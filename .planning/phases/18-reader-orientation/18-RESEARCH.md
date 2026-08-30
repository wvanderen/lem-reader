# Phase 18: Reader Orientation - Research

**Researched:** 2026-08-30
**Domain:** Non-modal TOC navigation panel + passive restoration cue over the D-05 grapheme-offset substrate (React 19 + semantic HTML + authored CSS; no new packages)
**Confidence:** HIGH

## Summary

Phase 18 is a codebase-extension phase, not a greenfield stack phase. Every load-bearing seam the TOC and restoration marker need already ships: heading blocks carry levels 1-6 in the canonical schema; `articleGraphemeIndex(article).blockStartOffsets[i]` gives each heading's article-global D-05 start offset in O(1); the D5-11 `handleNavigateBack` tail (paginated: `fragmentContainingOffset` → `turnToPage`; scrolling: `findScrollTarget` → `scrollIntoView`; then rAF + 120 ms focus) is the exact mode-aware jump the TOC reuses; and the Plan 13-10 tag popover (controlled `showPopover()`/`hidePopover()` + `toggle`-event focus-restore to the trigger) is the exact controlled-panel seam D18-01 needs — with `popover="manual"` replacing `"auto"` so the TOC persists beside content, and NO `role="dialog"` (the NotePopover VoiceOver-blocker history forbids claiming dialog semantics on a non-modal surface).

Two **gaps in current behavior are load-bearing for ORNT-06**: (1) paginated-mode reopen restore is explicitly deferred ("option (b)" per `tests/e2e/persistence.spec.ts` L64) — the restore effect's `scrollIntoView` only works in scrolling mode, so a paginated reopen lands at page 1 even with a saved location; (2) `saveLocation` is called ONLY from `useScrollSave`'s scroll listener — page turns fire no window scroll, so pure-paginated readers never persist a location at all. D18-05's "restored page edge in paginated mode" presumes both gaps close; the machinery for both exists (`onAnchorChange` surfaces per-turn offsets; `initialAnchorOffset`/`fragmentContainingOffset`/`turnToPage` resolve offsets to pages; the deep-link readiness-gated rAF retry effect at ArticleView L1343-1455 is a proven template for waiting out the first pagination commit). The planner must decide whether closing these is in-phase (recommended — otherwise the paginated marker can never honestly fire) and the specs must cover it.

The one genuinely open UI decision is the **≤639px header geometry**: app.css documents a measured 320px budget with ~10px slack for the current 4 article-scoped buttons; a 5th 44px contents trigger creates a ~42px deficit that the sanctioned relief ladder (gap/padding trims only; 44px targets; one 48px row) cannot close. Candidate strategies with tradeoffs are catalogued below — this belongs to the UI-SPEC decision step, not silent implementation.

**Primary recommendation:** Build the TOC as a controlled `popover="manual"` non-modal panel (tag-popover seam mechanics, no dialog role), derive destinations from `blockStartOffsets` over the canonical article (never persisted), reuse the D5-11 jump tail per mode with focus-on-heading, share SectionAnnouncer's detection via a heading-selector parameter, and close the paginated save/restore gaps so ORNT-06's marker is honest in both modes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TOC structure derivation (headings → nested list + offsets) | Pure domain layer (derived from canonical article at render time) | — | One derivation point per truth; zero persistence (Pitfall 9 — no Dexie changes this phase) [VERIFIED: codebase, CONTEXT D-load-bearing invariants] |
| Destination resolution (offset → scroll target / page) | Existing domain services (`restoreLocation.ts`, `pagination/anchor.ts`) | — | D-05 substrate + D4-10/D4-11 anchor machinery already own this; import, never reimplement |
| TOC jump execution (scroll vs page turn) | Browser / Client (ArticleView handler) | PaginatedSurface imperative handle | Mode-aware dispatch is view logic; `turnToPage`/`getPages` are the solved paginated seam [VERIFIED: codebase] |
| Panel presentation, geometry, motion | Browser / Client (authored CSS) | — | POLISH-07 tokens, reduced-motion global gate, 44px targets all live in app.css |
| aria-current detection | Browser / Client (shared scroll-spy) | — | SectionAnnouncer's IntersectionObserver + rAF scroll fallback, extracted with a selector parameter |
| Restoration marker (cue + announce) | Browser / Client (reading-surface chrome) | Polite status region | Passive visual cue + `role="status"` announce; transient, no actions |
| Location persistence | Existing persistence layer (locationStore) | — | Only touched IF paginated save-on-turn is adopted (see Open Questions) |
| Paginated reopen restore | Browser / Client (ArticleView restore effect) | PaginatedSurface initial anchor | Deferred "option (b)" — machinery exists, wiring does not |

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D18-01: The TOC is a NON-MODAL panel** — slides beside the article content with no focus trap, no inert backdrop; the page stays visible and keyboard-reachable. Manual Esc handling + focus return to the trigger on close (new pattern — the native-dialog precedent is deliberately NOT reused here; ORNT-05's no-trapping wording is the deciding factor).
- **D18-02: The trigger is a shell-header icon button** joining the article-scoped group `[contents][tags][annotations][mode][gear]` behind the `articleMounted` gate (D15-18 anatomy: inline-SVG glyph + aria-label, quiet-button tokens). The ≤639px wordmark-collapse geometry was tuned for 4 buttons — the 5-button row needs a geometry re-check (POLISH-07 tokens).
- **D18-03: Activating an entry closes the panel and moves keyboard focus to the destination heading** with a visible focus cue. Navigation is mode-aware: scroll in scrolling mode, page turn in paginated mode (both resolve through the canonical offset substrate).
- **D18-04: At narrow widths / high zoom the panel becomes a full-width sheet — still non-inert.** The page behind remains keyboard-escapable (Tab leaves the panel into the page; Esc closes). No focus trap even when visually covering content.
- **D18-05: The restoration cue is a PASSIVE POSITION MARKER attached at the restored location** (calm hairline/edge marker on the restored block in scrolling mode / restored page edge in paginated mode) plus the polite "Returned to where you left off." announce. No buttons, no copy to read past — the cue IS the location.
- **D18-06: The ResumeBanner and its actions RETIRE.** No replacement action chrome.
- **D18-07: The marker is TRANSIENT** — shows at the restored spot on reopen, fades away after a few calm seconds. Reduced-motion honored (no fade animation; instant clear or a calm opacity step). Nothing lingers while reading past it; no dismissal interaction exists.
- **D18-08: The marker fires on REOPEN-RESTORE ONLY.** TOC jumps carry their own focus-on-heading cue (D18-03); Highlights deep-link jumps keep today's behavior. One cue per cause, no double-signaling.
- **D18-09: The list starts with a "Top of article" entry** (targets the article start / h1), then all body headings h2-h6.
- **D18-10: Hierarchy renders as a NESTED `<ul>`** reflecting true heading depth — skipped levels (h2→h5) nest deeper WITHOUT invented intermediate entries; screen-reader users get depth from list structure itself.
- **D18-11: Duplicate heading texts appear AS-IS** — identical headings are identical-text links; list position disambiguates. No invented "(2 of 2)" suffixes or parent prefixes.
- **D18-12: The current section's entry carries `aria-current` + a subtle visual highlight**, derived from the same scroll-spy substrate as SectionAnnouncer (reused detection, not a forked implementation).
- **D18-13: The TOC trigger is ALWAYS available on any article** — a headingless article opens the panel to the "Top of article" entry plus a calm note ("This article has no headings." style — exact copy = planner/UI-SPEC). The trigger never appears/disappears per article.
- **D18-14: EPUB chapters get the same TOC as articles** — chapters are articles (`bookId`); the trigger + panel work identically from each chapter's own heading hierarchy. Zero extra machinery.
- **D18-15: On open, a long TOC list scrolls internally to bring the CURRENT section's entry into view** (orientation-first; pairs with D18-12). The panel owns its scrolling; no page-level scroll side effects from opening.

### the agent's Discretion

- **Panel implementation mechanics** — how the non-modal panel is built (absolutely-positioned aside vs popover=manual vs other), the breakpoint value for the full-width sheet, slide/fade motion under the reduced-motion gate, and outside-click dismissal policy.
- **Focus-return mechanics** — how focus returns to the trigger on close (including Esc), and how the non-inert page interaction is kept calm (e.g., whether pointer events pass through to the page beside the panel).
- **Offset→destination mapping** — how a heading's canonical destination is derived (block-start grapheme offset via the D-05 substrate) and resolved per mode (scrollIntoView vs page-lookup through the D4-10 anchor + turnToPage machinery); reuse `restoreLocation.ts`/`data-block-index`, do not fork.
- **Scroll-spy reuse shape** — how SectionAnnouncer's detection is extracted/shared for TOC aria-current without breaking the existing announce contract.
- **Marker anatomy + copy** — exact hairline/edge marker styling per mode, fade duration, announce copy placement (reuse the polite status-region discipline), headingless-note copy.
- **Header geometry at ≤639px** — how 5 article-scoped buttons fit the 48px row (wordmark collapse timing, touch-target audit).
- **Heading depth cap** — whether extremely deep nesting (h5/h6) renders any differently (e.g., styling only — structure stays semantic per D18-10).
- **Test shape** — new TOC e2e specs + restoration-cue specs across the 3-engine matrix; ResumeBanner spec retirement is legitimately owned by this phase; strengthen-only for untouched specs; honest full-suite gate.

### Deferred Ideas (OUT OF SCOPE)

- **Book-level cross-chapter TOC** — a chapter-list navigation surface for EPUB books. New capability — backlog candidate for a future milestone.
- **Calm duplicate-heading disambiguation** — accessible "(2 of 2)" suffixes or parent-section prefixes; rejected (D18-11); revisit only on concrete SR-user friction.
- **Marker on every programmatic jump** — one consistent "you landed here" cue for Highlights deep-links too; rejected (D18-08) — reopen only.
- **Keyboard shortcut for the TOC trigger** — not committed (plain header icon only); revisit with the M-for-mode precedent if readers ask.
- **ORNT-02 line-focus aid** — Future Requirements, outside this milestone.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORNT-01 | Reader can open a labeled table of contents derived from the canonical article heading hierarchy and jump to a structural location. | `HeadingBlock` schema (levels 1-6, no ids) + `blockStartOffsets` O(1) destination derivation + tag-popover controlled-panel seam for the trigger/panel; D5-11 jump tail for activation [VERIFIED: codebase] |
| ORNT-03 | TOC destinations use stable canonical locations and work equivalently in scrolling and paginated reading modes without persisting page numbers or rendered DOM identity. | Destination = block-start D-05 grapheme offset, computed never stored; `findScrollTarget` (scrolling) + `fragmentContainingOffset`→`turnToPage` (paginated) resolve the SAME offset both ways [VERIFIED: codebase] |
| ORNT-04 | The TOC preserves source heading levels, tolerates skipped levels and duplicate headings, and exposes semantic list/link navigation to keyboard and screen-reader users. | Level-driven nesting algorithm (stack-based, no invented intermediates); duplicates render as-is; nested `<ul>` + links is the semantic floor (W3C host-language-first) [VERIFIED: schema + CITED: W3C/MDN]. NOTE: no fixture covers skips/duplicates/h4-h6 — new seeded corpus required (Wave 0) |
| ORNT-05 | The TOC adapts to narrow widths and high zoom without obscuring content, trapping focus, or changing the reader's logical location merely by opening or closing. | Popover API is non-modal by construction (no trap possible); closed = display:none; D18-04 full-width sheet via top layer. Header 5-button geometry deficit is the one open decision. Existing high-zoom/reflow/touch-target specs join via the D6-09 invariant [VERIFIED: MDN + codebase] |
| ORNT-06 | Reopening an article communicates the restored location through a non-intrusive cue that does not shift content, block page turns, or require dismissal. | Restore effect + polite-announce discipline exist; ResumeBanner lifecycle informs the marker. **Gaps: paginated reopen-restore deferred (option b) + no paginated location saves — must close for honest paginated markers** [VERIFIED: codebase] |

</phase_requirements>

## Project Constraints (from AGENTS.md)

- **GSD workflow enforcement:** all edits flow through GSD entry points (this research is spawned by `/gsd-plan-phase` — compliant).
- **Accessibility foundational:** semantic HTML, keyboard nav, SR compatibility, zoom, visible focus, reduced motion (matches D18-03/04/07, global `prefers-reduced-motion` gate at app.css L84-92).
- **Security:** canonical document model is the boundary; never `dangerouslySetInnerHTML`; TOC text renders as React text children (auto-escaped) — same content the body already renders.
- **Honesty:** no silent garbage — headingless articles get a calm note (D18-13); the marker must not claim a restore that didn't happen (drives the paginated-restore gap closure).
- **Performance:** no repagination triggers introduced by the panel (panel must not resize the reading surface — see Pitfall 7).
- **Stack:** React 19 + TS 7 + Vite 8 SPA, authored CSS (no Tailwind/component suite), hash router with NO new routes (panel state is transient).

## Standard Stack

### Core

No new packages. This phase is browser-platform + existing project modules.

| Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Popover API (`popover="manual"`, `showPopover()`/`hidePopover()`, `toggle` event, `:popover-open`) | Browser platform (Baseline 2024+; verified current in all 3 Playwright engines) | Non-modal TOC panel surface: top-layer promotion, `display:none` closed state, no focus trap by construction | Native, always non-modal; the tag popover (Plan 13-10) already ships the controlled + toggle-event + focus-restore seam on this API [CITED: developer.mozilla.org/en-US/docs/Web/API/Popover_API] |
| `articleGraphemeIndex(article).blockStartOffsets` | internal (`src/content/normalizeText.ts` L152-189) | O(1) article-global D-05 start offset per block — THE TOC destination derivation | Cached per-article prefix sums over the same substrate restore/pagination speak [VERIFIED: codebase] |
| `fragmentContainingOffset` / `pageStartGlobalOffset` | internal (`src/pagination/anchor.ts`) | offset → page index for paginated jumps/restore | D4-10/D4-11 machinery in reverse; already consumed by D5-11 navigate-back [VERIFIED: codebase] |
| `findScrollTarget` / `computeTopVisibleOffset` / `normalizeElText` | internal (`src/reader/restoreLocation.ts`) | offset ↔ DOM block resolution (scrolling mode) + scroll-spy offset semantics | Import, never reimplement (locked invariant) [VERIFIED: codebase] |
| `PaginatedSurfaceHandle` (`turnToPage`/`getPages`/`getState`/`getCurrentAnchorOffset`) | internal (`src/reader/PaginatedSurface.tsx` L147-178) | Paginated jumps + marker page-edge placement | Solved seam (D5-11) [VERIFIED: codebase] |
| Nested `<ul>` + `<a>` + `aria-current` | Browser platform | Semantic TOC list/navigation | Host-language-first WAI-ARIA principle; no ARIA widget roles needed for a list of in-page links [CITED: W3C WAI-ARIA 1.2 §1.4] |

### Supporting

| Module | Purpose | When to Use |
|---------|---------|-------------|
| SectionAnnouncer detection (IntersectionObserver + rAF-throttled scroll fallback + 250ms debounce, sentinel 48+8px) | Shared scroll-spy substrate for TOC `aria-current` (D18-12) | Extract with a heading-selector parameter; announcer keeps `h2,h3,h4`, TOC passes `h2,h3,h4,h5,h6` [VERIFIED: codebase] |
| Tag-popover seam (ArticleView L333-375) | Controlled popover open/close + `toggle`-event focus-restore template | Mirror with `popover="manual"` + Esc keydown; NO `role="dialog"` [VERIFIED: codebase] |
| Polite status region (`role="status"` + `aria-live="polite"` + `aria-atomic="true"`) | Marker announce ("Returned to where you left off.") + any TOC SR feedback | Same discipline as ResumeBanner/SectionAnnouncer/.status [VERIFIED: codebase] |
| `seedArticleRows` discipline (ArticleSchema.parse in Node → raw IndexedDB puts) | Seeding TOC test corpus (skipped levels, duplicates, h5/h6, chapters) | Copy the pattern from `tests/e2e/library/reading-views.spec.ts` L506+ [VERIFIED: codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `popover="manual"` panel | Absolutely-positioned `<aside>` in flow | Aside works but needs manual closed-state gating (display:none by hand), z-index management, and ancestor overflow care; popover gives all three free. Aside is the fallback if any engine shows top-layer quirks in the sheet geometry |
| `popover="manual"` | `popover="auto"` | Auto gives free Esc + outside-click light dismiss BUT closes on ANY outside click — hostile to a "keep it open while reading beside it" panel — and auto-dismisses other auto popovers. Manual + own Esc handler matches D18-01 exactly |
| `<a>` entries with intercepted activation | `<button>` entries | Buttons are honest "perform action" but ORNT-04/D18-CONTEXT lock "semantic list/LINK navigation"; links + `preventDefault` keep link semantics without router side-effects |
| `aria-current="true"` on current entry | `aria-current="location"` | Both valid tokens; "page" is WRONG here (it denotes a link to another page — the shell-nav destination usage). "true" is the simplest token SRs announce reliably [CITED: MDN aria-current] |

**Installation:**
```bash
# none — zero new packages this phase
```

**Version verification:** N/A (no new packages). Runtime verified: node v22.22.3, @playwright/test 1.61.1, vitest 4.1.10 [VERIFIED: local run].

## Package Legitimacy Audit

**None required — this phase installs zero external packages.** All functionality derives from the browser platform (Popover API, Baseline 2024+, verified in the shipped Playwright engine matrix) and existing internal modules.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │                  App shell                    │
                    │  Header: [brand][shell-nav] … [contents][tags]│
                    │  [annotations][mode][gear]  ← articleMounted  │
                    │        gate (D18-02: contents = 5th button)   │
                    └───────────────┬──────────────────────────────┘
                                    │ toggle (controlled open state)
                                    ▼
   ┌────────────────────────┐   showPopover()/hidePopover() + toggle event
   │ TOC panel               │──────────────────────────────────┐
   │ popover="manual"        │  on close: focus → contents trigger│
   │ (NO role=dialog)        │◄─────────────────────────────────┘
   │  nav[aria-label]        │
   │   nested <ul> of <a>    │   entry activation (preventDefault,
   │   + "Top of article"    │   panel closes, focus → destination)
   │   aria-current entry ◄──┼──────────┐
   └─────────┬──────────────┘          │
             │                         │
   [1] structure derivation           [2] shared scroll-spy
   canonical article ──► pure walk    SectionAnnouncer detection
   over article.blocks: heading?  ──► (extracted, selector param:
   blockStartOffsets[i] = D-05 dest    announcer h2-h4 / TOC h2-h6)
             │
             ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Destination resolution (mode-aware jump — D5-11 tail)    │
   │                                                          │
   │  offset = blockStartOffsets[heading.blockIndex]          │
   │                                                          │
   │  scrolling: findScrollTarget(article, blocks, offset)    │
   │             → scrollIntoView({block:"start"})            │
   │  paginated: fragmentContainingOffset(pages, offset)      │
   │             → surfaceRef.turnToPage(pageIdx)             │
   │                                                          │
   │  then: rAF + 120ms timeout → focus destination heading   │
   │        (tabIndex={-1}, D14-03 articleH1Ref precedent)    │
   └─────────────────────────────────────────────────────────┘
             ▲
             │ reopen (loadLocation)
   ┌─────────┴───────────────────────────────────────────────┐
   │ Restoration pipeline (ORNT-06)                           │
   │  restore effect → silent land → PASSIVE MARKER           │
   │   scrolling: hairline on restored block                  │
   │   paginated: edge marker on restored page  ⚠ needs       │
   │     option-(b) restore + paginated saves (see OQ1/OQ2)   │
   │   + polite announce "Returned to where you left off."    │
   │   transient fade (reduced-motion → instant/step)         │
   │   ResumeBanner + handlers + CSS retire (D18-06)          │
   └──────────────────────────────────────────────────────────┘

  External deps: IndexedDB (reads via existing stores only — NO schema
  changes, Pitfall 9); hash router UNCHANGED (panel state transient;
  TOC entry hrefs intercepted, never assigned).
```

### Recommended Project Structure

```
src/
├── reader/
│   ├── TocPanel.tsx        # NEW — non-modal popover="manual" panel: nested
│   │                       #   ul, Top entry, aria-current, internal scroll
│   │                       #   to current (D18-15), headingless note (D18-13)
│   ├── RestorationMarker.tsx # NEW — transient passive marker (both modes)
│   │                       #   + polite announce; fires reopen-restore only
│   └── sectionSpy.ts       # NEW (extraction) — shared detection from
│                           #   SectionAnnouncer (selector-parametrized)
├── content/
│   └── toc.ts              # NEW — pure structure derivation: headings →
│                           #   nested entries + blockStartOffsets dests
│                           #   (skips nest without invention; dups as-is)
├── routes/ArticleView.tsx  # MODIFY — trigger wiring (via Header props),
│                           #   TOC open state + jump handler (D5-11 tail),
│                           #   restore-effect swap banner→marker, optional
│                           #   paginated restore/save closure
├── reader/Header.tsx       # MODIFY — 5th article-scoped trigger button
├── reader/SectionAnnouncer.tsx # MODIFY — consume shared detection (contract byte-stable)
├── reader/ResumeBanner.tsx # DELETE (D18-06)
└── app.css                 # MODIFY — panel/sheet/marker/trigger styles;
                            #   .resume-banner rules retire; ≤639px geometry
tests/
├── unit/toc.test.ts        # NEW — derivation invariants (skips, dups, offsets)
├── e2e/toc/                # NEW — open/jump specs (both modes, 3 engines)
│   ├── toc-navigation.spec.ts
│   ├── toc-geometry.spec.ts      # narrow/high-zoom no-trap, no-shift (ORNT-05)
│   └── restoration-cue.spec.ts   # marker both modes (ORNT-06)
└── e2e/…existing specs     # 2 ResumeBanner assertion sites retire (owned)
```

### Pattern 1: Controlled popover panel with one close seam (the tag-popover template)

**What:** The panel's open state lives in a React prop; an effect syncs it to `showPopover()`/`hidePopover()`; a `toggle` listener is the SINGLE close seam that routes state back and restores focus — native paths (Esc for manual popovers must be hand-added; programmatic hides) and JS paths all funnel through the same event.

**When to use:** D18-01's non-modal panel. This is the shipped Plan 13-10 discipline, adjusted: `popover="manual"` (persistent, no light dismiss — outside-click policy is an explicit choice), NO `role="dialog"` (non-modal honesty; NotePopover history L14-20 records the VoiceOver blocker when a non-dialog popover claims dialog semantics).

```tsx
// Source: src/routes/ArticleView.tsx L338-375 (tag popover seam — adapt for TOC)
const tocPanelRef = useRef<HTMLDivElement>(null);
const tocTriggerRef = useRef<HTMLElement | null>(null);

// Sync prop → popover shown state; capture trigger BEFORE showPopover()
useEffect(() => {
  const el = tocPanelRef.current;
  if (!el) return;
  if (tocOpen && !el.matches(":popover-open")) {
    tocTriggerRef.current = document.activeElement as HTMLElement | null;
    el.showPopover();
  } else if (!tocOpen && el.matches(":popover-open")) {
    el.hidePopover(); // fires the same toggle event as native paths
  }
}, [tocOpen]);

// ONE close seam: state sync + focus restore on every close path
useEffect(() => {
  const el = tocPanelRef.current;
  if (!el) return;
  const handleToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === "closed") {
      onCloseToc();
      tocTriggerRef.current?.focus(); // D18-01 focus return
    }
  };
  el.addEventListener("toggle", handleToggle);
  return () => el.removeEventListener("toggle", handleToggle);
}, [onCloseToc]);
```

Manual Esc: `popover="manual"` gets NO native Esc [CITED: MDN popover attribute — "manual popovers cannot be light dismissed"]. Add a keydown handler on the panel (and only while open): `if (event.key === "Escape") close()` — it routes through `hidePopover()` so the toggle seam fires once.

### Pattern 2: TOC entry activation — intercepted link, mode-aware jump

**What:** Entries are real `<a>` elements (ORNT-04 link semantics) whose activation is intercepted (`preventDefault`) so the hash router NEVER re-parses, then the D5-11 jump tail runs.

```tsx
// Source: adapted from ArticleView handleNavigateBack L1732-1776 (D5-11 — verbatim tail)
const handleTocJump = (offset: number) => {
  closeTocPanel(); // D18-03: activating closes the panel
  if (!article || !articleRef.current) return;

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
    target?.scrollIntoView({ block: "start" });
  }

  // Focus the destination heading (D18-03) — rAF + 120ms firefox-settle
  // guard, the shipped D4-07 discipline:
  const focusHeading = () => {
    document.getElementById(`toc-dest-${blockIndex}`)?.focus();
  };
  requestAnimationFrame(focusHeading);
  window.setTimeout(focusHeading, 120);
};
```

Destination headings need `tabIndex={-1}` + a stable id. Two options: (a) always add `tabIndex={-1}` to rendered heading blocks (small DOM change, no tab-order impact); (b) focus via the block element from `data-block-index` (no ids needed — headings are queryable via `[data-block-index="${i}"]`). Option (b) avoids inventing DOM ids (schema has none — Pitfall-4 discipline) and reuses the existing attribute.

`href` for entries: a fragment-only href (e.g. `#toc-N`) intercepted via `preventDefault` keeps link semantics; the app's route/fragment guard (parseHash boundary) already treats fragment-only hashes as non-routes as defense-in-depth [VERIFIED: codebase, STATE D-01-05 note]. Middle/modified clicks open a harmless same-document fragment.

### Pattern 3: Structure derivation (pure, skips nest without invention)

```typescript
// Source: new module src/content/toc.ts (pure — jsdom/unit-testable)
import { articleGraphemeIndex } from "./normalizeText";

export interface TocEntry {
  /** Heading text (runs joined) — duplicates appear AS-IS (D18-11). */
  text: string;
  /** Article-global D-05 grapheme offset of the heading block's start. */
  offset: number;
  /** Top-level block index (for [data-block-index] DOM resolution). */
  blockIndex: number;
  /** Source heading level 2-6 — preserved verbatim (ORNT-04). */
  level: 2 | 3 | 4 | 5 | 6;
  /** Nesting depth among TOC entries (0 = shallowest present). */
  depth: number;
}

export function deriveToc(article: CanonicalArticle): TocEntry[] {
  const { blockStartOffsets } = articleGraphemeIndex(article);
  const entries: TocEntry[] = [];
  const stack: number[] = []; // levels of currently-open ancestors
  article.blocks.forEach((block, blockIndex) => {
    if (block.kind !== "heading" || block.level === 1) return; // h1 is provenance-rendered
    entries.push({
      text: block.content.map((r) => r.text).join(""),
      offset: blockStartOffsets[blockIndex]!, // O(1) prefix-sum lookup
      blockIndex,
      level: block.level as 2 | 3 | 4 | 5 | 6,
      depth: computeDepth(stack, block.level), // pops shallower/equal, pushes self
    });
  });
  return entries;
}
```

The `<ul>` nesting renders from `depth` transitions (a deeper entry opens a child `<ul>` inside the parent `<li>`; a shallower one closes lists until the stack matches). Skipped levels (h2→h5) produce depth 2 with NO intermediate entries — the list structure itself carries the jump. "Top of article" is a synthetic first entry (offset 0, depth 0) targeting the h1.

### Pattern 4: Shared scroll-spy (extract, don't fork)

**What:** SectionAnnouncer's effect (L48-113) — IntersectionObserver with `rootMargin: -48px 0px -60% 0px` + rAF-throttled passive scroll fallback + 250ms debounce over a "most-recently-passed heading past the 48+8px sentinel" rule — is the substrate. Extract the detection into `sectionSpy.ts` taking a heading selector + articleEl, returning the current heading element/text via callback. SectionAnnouncer consumes it with `"h2, h3, h4"` (announce contract byte-stable); TocPanel consumes it with `"h2, h3, h4, h5, h6"` and maps the current heading's `data-block-index` to the aria-current entry. One implementation, two parameterizations — not a fork (D18-12).

### Anti-Patterns to Avoid

- **`role="dialog"` on the TOC panel** — claims modal semantics a non-modal surface doesn't provide; produced a real VoiceOver blocker on NotePopover (ACPT-02 finding #2). No dialog role, no `aria-modal`, no showModal anywhere in the TOC [VERIFIED: codebase history].
- **Hash hrefs that actually assign `location.hash`** — re-runs the router, re-parses mid-view, knocks focus (the deep-link Pitfall 1). Intercept all TOC activations; `history.replaceState` only, never hash assignment.
- **Persisting derived TOC data** — structure derives from the canonical article at render time; no Dexie writes, no schema bump (Pitfall 9: no Dexie changes this phase).
- **A second focus-restore path** — every close path (button toggle, Esc, entry activation, view swap) must funnel through the ONE toggle-event seam.
- **Borrowing the `<dialog>`/showModal precedent** — D18-01 explicitly rejects it; modal machinery (inert backdrop, focus trap) is precisely what ORNT-05 forbids.
- **Inventing heading ids or disambiguation text** — schema carries no ids; duplicates are identical by decision (D18-11).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Overlay layering/closed-state hiding | Custom fixed-position + z-index + display management | Popover API (`popover="manual"`) | Top layer, `:popover-open`, UA `display:none` closed state for free; cross-engine consistent [CITED: MDN] |
| Offset→page math | Custom block-walk accumulation | `articleGraphemeIndex().blockStartOffsets` + `fragmentContainingOffset` | Cached prefix sums; ANY divergence shifts destinations and silently breaks ORNT-03 equivalence [VERIFIED: codebase] |
| Offset→DOM block resolution | New selector logic | `findScrollTarget` + `[data-block-index]` | D-05 contract module; byte-identical normalization [VERIFIED: codebase] |
| Scroll-spy detection | New IntersectionObserver wiring | Extracted SectionAnnouncer detection | IO alone is flaky (batched callbacks — Pitfall 6); the dual-trigger + debounce solution is proven across engines |
| Focus management on open/close | Per-path focus juggling | toggle-event seam + `tabIndex={-1}` focus targets | One seam, every path; D14-03/D4-07 precedents |
| Motion gating | JS animation checks | CSS transitions (auto-killed by the global `prefers-reduced-motion` gate app.css L84-92) | Marker fade as a transition is gated for free; JS-driven animation would bypass the gate |

**Key insight:** Every hard problem in this phase (stable destinations, mode equivalence, calm overlay behavior, focus discipline) was already solved once in prior phases — the phase's risk concentrates in *wiring*, not invention.

## Runtime State Inventory

> This phase modifies reading-surface behavior and retires a shipped UI surface — inventory of live state beyond git:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | LocationRecord rows (existing, unchanged shape); settings rows (`readingMode`); article/book rows — TOC is derived, never persisted | None for TOC itself. IF paginated save-on-turn is adopted: existing `saveLocation` reused, same schema, NO version bump (code edit only) |
| Live service config | None — static SPA, no external services touched by this phase | None — verified by grep (no fetch/network in scope) |
| OS-registered state | None — no Task Scheduler/launchd/pm2 registrations in this project | None |
| Secrets/env vars | None — no secrets, no env vars consumed by reader surfaces | None |
| Build artifacts | None — no compiled artifacts or installed packages change (zero new deps); Vite dev-server cache irrelevant | None — verified: zero package.json changes required |

**Canonical question answered:** after all repo edits, no runtime system holds stale state — IndexedDB rows keep their existing shape; the only behavioral carryover is that readers who previously saw the ResumeBanner will see the marker instead (intended, D18-05/06).

## Common Pitfalls

### Pitfall 1: The paginated restore gap makes the marker dishonest (ORNT-06)
**What goes wrong:** D18-05 places the marker "on the restored page edge in paginated mode" — but paginated reopen-restore is explicitly deferred ("option (b)", `tests/e2e/persistence.spec.ts` L60-64): the restore effect's `scrollIntoView` cannot move the `overflow:hidden` paginated surface, so a paginated reopen lands at page 1 even with a saved location. A marker at page-1's edge while the saved location is deep in the article is a *lying cue* — worse than the retired banner.
**Why it happens:** Phase 2's restore predates pagination (D4-12 made paginated the default later); the deferral was recorded and never revisited.
**How to avoid:** Close the loop in-phase: after the first pagination commit (the deep-link effect's readiness-gated rAF retry, ArticleView L1343-1455, is the proven template), resolve `loc.graphemeOffset` via `fragmentContainingOffset` → `turnToPage(pageIdx)` — or feed the offset through `currentAnchorOffsetRef` → `initialAnchorOffset` before the surface's first commit. Then the marker attaches to the genuinely restored page.
**Warning signs:** Marker e2e green in scrolling mode only; any paginated reopen spec starting at page≠1 without new restore wiring.

### Pitfall 2: Paginated readers never save a location at all
**What goes wrong:** `saveLocation` is called ONLY inside `useScrollSave`, which schedules saves from window `scroll` events (`src/reader/useScrollSave.ts`; `rg saveLocation src/` confirms the single call site family). Page turns fire no window scroll → a pure-paginated reader's location is never persisted → reopen has nothing to restore → the paginated marker can never fire, even after Pitfall 1 is fixed.
**Why it happens:** `handleAnchorChange` (per-turn precise offsets) updates refs for mode-switch anchoring but never persists.
**How to avoid:** Persist the anchor offset on turn/anchor-change (debounced + the existing visibilitychange/pagehide dual flush, mirroring useScrollSave's discipline) — same `LocationRecord` shape, no schema change. Decide explicitly in planning (see Open Questions OQ2).
**Warning signs:** Library "In Progress" never advances for paginated-only readers (pre-existing symptom of the same gap).

### Pitfall 3: `popover="manual"` + `role="dialog"` = VoiceOver blocker
**What goes wrong:** A non-dialog popover element with `role="dialog"` does not establish the modal accessibility context VoiceOver expects — the surface becomes unreachable by VO browse (ACPT-02 finding #2, recorded in `NotePopover.tsx` HISTORY L13-20).
**How to avoid:** The TOC panel carries NO dialog role, NO `aria-modal`; it is a labeled `nav`/container + list. Verify with the manual SR protocol (ACPT-08 matrix) since this is a NEW surface pattern (D18-01 deliberately breaks from 5 shipped dialogs).
**Warning signs:** Any spec/impl copying AnnotationsDrawer markup verbatim.

### Pitfall 4: Hash-router side effects from TOC links
**What goes wrong:** Assigning any `#/...`-shaped href (or un-intercepted activation) fires `hashchange` → the router re-parses, the view remounts/knocks focus — precisely what in-article navigation must not do (deep-link Pitfall 1: even `location.hash` assignment re-runs the router).
**How to avoid:** `preventDefault` on entry click/Enter; fragment-only hrefs (defense-in-depth: the shipped route/fragment guard already keeps fragment hashes from `setView`); `history.replaceState` only if URL hygiene is ever needed. `parseHash` and the fragment guard stay byte-stable.
**Warning signs:** e2e focusing a heading after jump and failing because the article remounted.

### Pitfall 5: Scroll-spy selector mismatch (h2-h4 vs h2-h6)
**What goes wrong:** SectionAnnouncer queries `h2, h3, h4` (L51); the TOC covers h2-h6. A naive "reuse" leaves h5/h6 sections without `aria-current`; a naive "fix" changes what the announcer reads out (byte-stable contract violation).
**How to avoid:** Extract detection with a selector parameter (Pattern 4); announcer keeps its exact contract; TOC passes its own selector. Map current-heading → entry via the heading's `data-block-index`.
**Warning signs:** section-announce.spec.ts diffs after the extraction (must be zero).

### Pitfall 6: The 320px header deficit — 5th button does not fit the sanctioned ladder
**What goes wrong:** app.css L3705-3723 documents the measured 320×640 budget: `[shell-nav 118px] + 4×46px controls + gaps + padding` leaves ~10px slack. A 5th 44px trigger + gap needs ~50px → ~40px deficit. The sanctioned relief ladder (padding/gap trims ONLY; 44px touch targets; one 48px row) is exhausted — `--space-xs` (4px) gaps and zeroed link padding are already in effect.
**Why it happens:** D15-17's collapse was tuned for exactly 4 article-scoped buttons.
**How to avoid:** Treat as a UI-SPEC decision (Phase 18 has `UI hint: yes`), with candidates:
  (a) at ≤639px allow the header to wrap to two 48px rows (honest overflow; breaks the one-row rule — needs explicit sanction);
  (b) collapse shell-nav links at extreme narrow the way the wordmark collapses (kept SR/tab-reachable) — weakens D15-17's "no icon-only/vanishing destinations" intent;
  (c) narrower shell-nav text (shorter labels) — copy churn, weakest a11y impact;
  (d) revisit button min-width (44px is the floor — NOT an option).
The measured numbers above give the UI-SPEC step concrete geometry to decide on. Whatever lands must pass the existing touch-target + reflow specs at 320px (D6-09 invariant).
**Warning signs:** geometry e2e red at 320px; silent overlap (`.header-start` shrink) rather than visible overflow.

### Pitfall 7: DOM queries hit the hidden measurement clone
**What goes wrong:** In paginated mode the always-mounted `.article-body-measurement` ArticleBody (visibility:hidden, aria-hidden, Plan 04-08) ALSO carries `[data-block-index]` — `queryBlocks` returns fragments AND clone blocks; jump/marker/scroll-spy code that assumes one element per block double-counts (the 06-01 lesson: assert VISIBLE blocks via `:not(.article-body-measurement …)`).
**How to avoid:** Scope DOM resolution to the visible surface; prefer the block-index → element lookup on the live reading container. Also: opening the panel must NOT resize the reading surface (no ResizeObserver-triggered repagination from panel geometry — the panel overlays/besides, never reflows, the content column; sheet mode covers).
**Warning signs:** Repagination diagnostics firing on TOC open; jumps landing one block off in paginated mode.

### Pitfall 8: Reduced-motion bypass via JS-driven fade
**What goes wrong:** The global gate (app.css L84-92) kills CSS `transition`/`animation` — a JS-computed fade (requestAnimationFrame opacity writes) ignores it, violating the reduced-motion discipline every prior surface honors.
**How to avoid:** Marker fade = CSS opacity transition (auto-gated → under reduced motion it appears/disappears instantly or as a calm step per D18-07). No JS animation code.
**Warning signs:** reduced-motion.spec.ts needs a marker cell; any rAF-driven style writes in the marker.

### Pitfall 9: Retirement half-done (ResumeBanner)
**What goes wrong:** The banner retires across 4 surfaces, not 1: `ResumeBanner.tsx` (delete), ArticleView wiring (`showResumeBanner` state, auto-dismiss listeners L1594-1611, `handleResume`/`handleStartFromTop` L1697-1715, render mount), app.css `.resume-banner` blocks (L1009-1101, L3650-3692), and e2e assertions (`chrome/mobile-first-page-chrome.spec.ts` L79, `library/reading-views.spec.ts` L1019). Leaving any behind ships dead code / failing specs.
**How to avoid:** Inventory them as one task; the polite announce copy "Returned to where you left off." is RETAINED (D18-05 reuses it verbatim in the marker).
**Warning signs:** grep "resume-banner|Resume reading|Start from top" returning hits after the phase.

### Pitfall 10: Strengthen-only discipline on untouched specs
**What goes wrong:** New panel/marker work perturbs shared surfaces (Header, ArticleView render tree); tempting "small fixes" to unrelated specs violate the strengthen-only + byte-stable-anchor rules.
**How to avoid:** The 2 banner assertion sites are the ONLY legitimate retirements (phase-owned); everything else strengthens only; full `npm run test` exit 0 as the honest gate (the 09-07 misreport lesson: run the suite, record fail=0 honestly).
**Warning signs:** Diff touching spec anchors of pagination/annotations/library specs beyond additive assertions.

## Code Examples

### Marker announce (reuse the shipped discipline verbatim)

```tsx
// Source: src/reader/ResumeBanner.tsx L45-47 (announce-on-mount pattern the marker keeps)
// The polite region announces initial content when freshly inserted into the DOM.
<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
  Returned to where you left off.
</div>
```

### Current-entry highlight semantics

```tsx
// aria-current="true" — NOT "page" (page denotes a link to another page;
// the shell-nav destination links use "page", the TOC points WITHIN the article).
<li>
  <a
    href="#toc-3"
    aria-current={isCurrent ? "true" : undefined}
    onClick={(e) => { e.preventDefault(); onActivate(entry); }}
  >
    {entry.text /* duplicates render AS-IS — D18-11 */}
  </a>
</li>
```

### Manual Esc for a manual popover (the only hand-rolled key handling)

```tsx
// popover="manual" gets NO native Esc (MDN: manual popovers cannot be light
// dismissed) — register it while open, route through hidePopover() so the
// single toggle-event seam fires focus-restore.
const onKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    tocPanelRef.current?.hidePopover(); // toggle event → onClose + focus return
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal `<dialog>`/showModal for every overlay (5 shipped surfaces) | Non-modal `popover="manual"` panel for orientation surfaces (D18-01) | Phase 18 decision | First non-dialog overlay in the codebase; document the new focus/Esc contract explicitly in plans |
| ResumeBanner with actions (v1/2) | Passive transient marker + polite announce (D18-05/06/07) | Phase 18 decision | "Start from top" capability moves to the TOC's Top entry (D18-09) |
| Restore = scrolling-only scrollIntoView | (needed) offset→page restore in paginated mode | option (b) deferral dated Phase 4 era | ORNT-06 depends on closing it |
| Scroll saves = window-scroll-driven | (needed) anchor-change saves for paginated mode | same gap | Pure-paginated readers currently persist nothing |

**Deprecated/outdated:**
- `popover="manual"` + `role="dialog"` combination — deprecated by the ACPT-02 finding; never ship it again.
- ResumeBanner copy/actions — retired this phase (announce text survives in the marker).

## Assumptions Log

> All claims tagged [ASSUMED] in this research. Everything else was verified against the codebase (read/grep this session) or cited from official docs (MDN/W3C fetched this session).

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Popover API behaves identically in the current Playwright Firefox/WebKit builds for `popover="manual"` top-layer sheet geometry (Baseline 2024+ claimed; engine versions in CI presumed current) | Standard Stack / Pattern 1 | Sheet rendering quirks in one engine → e2e catches; fallback = positioned aside (documented alternative) |
| A2 | `aria-current="true"` is the best token for in-article TOC current entries (vs "location") — "page" is semantically wrong here | Code Examples | Cosmetic SR phrasing difference; both valid tokens |
| A3 | Fragment-only hrefs (`#toc-N`) on entries are safe defense-in-depth because the shipped route/fragment guard blocks them from `setView` | Pattern 2 | If guard doesn't cover all shapes, un-intercepted activations could re-route — e2e must cover Enter activation |
| A4 | Focus-on-open (moving focus into the panel when opened) is desirable for SR users of a non-modal panel | Open Questions | If undesired, SR users must Tab to the panel; either way must be consistent + spec'd |

**Codebase claims carry [VERIFIED: codebase] and were confirmed by direct file reads this session** (schema.ts, restoreLocation.ts, anchor.ts, normalizeText.ts, ArticleView.tsx, SectionAnnouncer.tsx, ResumeBanner.tsx, Header.tsx, BlockRenderer.tsx, InlineRenderer.tsx, PaginatedSurface.tsx, useScrollSave.ts, app.css, persistence.spec.ts, panel-keyboard.spec.ts, fixtures corpus).

## Open Questions (RESOLVED)

> All five OQs are resolved downstream — see the RESOLVED line on each. The inline "Recommendation" text is the research-time record; where a RESOLVED line differs from it, the RESOLVED line carries the sanctioned outcome (notably OQ3, whose inline default proposal was rejected).

1. **Paginated reopen-restore (option b) — in phase 18 or descope the paginated marker?**
   - What we know: restore is scrolling-only today (verified); D18-05's paginated marker presumes it works; machinery (fragmentContainingOffset, turnToPage, initialAnchorOffset, deep-link readiness template) all ships.
   - What's unclear: whether the planner should wire restore-through-initialAnchorOffset (before first commit) vs post-commit turnToPage (deep-link template) — a timing/ownership choice.
   - Recommendation: implement in-phase (ORNT-06 says "reopening an article", unqualified by mode; paginated is the DEFAULT mode). Use the deep-link readiness-gate pattern; it is the newest, most defensive template.
   - **RESOLVED (UI-SPEC §Auto-Resolved #8 → Plan 18-03 Task 1):** closed in-phase exactly per this recommendation — readiness-gated paginated restore via the deep-link template (bounded rAF retry → `fragmentContainingOffset` → `turnToPage`), deep-link precedence preserved via the jumpPendingRef guard.

2. **Paginated location saves — adopt anchor-change persistence?**
   - What we know: no saves on page turns today (verified single call-site family); without saves the paginated marker never fires; `onAnchorChange` already surfaces precise per-turn offsets; LocationRecord shape suffices.
   - What's unclear: debounce window (mirror 1200ms?), flush wiring (reuse useScrollSave's dual-flush or a sibling), and whether this is Phase-18 scope or a flagged pre-existing gap.
   - Recommendation: treat as in-phase enablement for ORNT-06 (small, reuses existing store); if descoped, the marker must fire ONLY on real restores (scrolling-mode readers) and the phase must say so honestly.
   - **RESOLVED (UI-SPEC §Auto-Resolved #8 → Plan 18-03 Task 1):** adopted in-phase per this recommendation — save-on-turn via handleAnchorChange feeding the debounced saveLocation scheduler (SAVE_DEBOUNCE_MS 1200) + the existing visibilitychange/pagehide dual flush, same LocationRecord shape, singular call-site family in useScrollSave, no schema change.

3. **≤639px five-button geometry — which relief?**
   - What we know: measured ~40px deficit at 320px; ladder exhausted; candidate strategies (a)-(d) in Pitfall 6.
   - What's unclear: which strategy the UI-SPEC sanctions.
   - Recommendation: route to the UI-SPEC step with the measured numbers; default proposal = two-row wrap at the deficit breakpoint with 48px rows retained per-row (honest, keeps 44px targets, keeps text links visible).
   - **RESOLVED (UI-SPEC §Layout "The ≤639px five-button geometry decision" SANCTIONED block / §Auto-Resolved #9 → Plan 18-02 Task 3):** the sanctioned relief is the STAGED SHELL-NAV COLLAPSE at `max-width: 420px` scoped to Reader (`data-destination`) with a `:focus-visible` un-clip companion rule — single 48px row and all load-bearing constants preserved. The inline default proposal above (two-row wrap) was explicitly REJECTED: a 96px wrap breakpoint breaks the load-bearing 48px constants (paginated-main calc, `headerPx = 48`, SectionAnnouncer 48+8px sentinel) and the Phase 15 "48px height NEVER changes" rule.

4. **Outside-click dismissal policy for the panel (agent discretion)** — recommended: pointer-down outside the panel (and outside the trigger) closes it, EXCEPT it should NOT close when clicking into the article to *read while the panel is open beside it*? D18-01's "slides beside the article content" suggests persistence; D18-04's sheet covers at narrow. Recommendation: do NOT dismiss on outside click at wide widths (panel is a persistent companion); in narrow sheet mode, outside-click close is the calm escape (page is covered). Planner picks; both route through the one toggle seam.
   - **RESOLVED (UI-SPEC §Auto-Resolved #5 → Plan 18-02 Task 2):** per this recommendation — at ≥640px NO outside dismissal (persistent companion); at ≤639px (full-width sheet) pointerdown outside panel+trigger closes; both paths route through the single `hidePopover()` toggle seam.

5. **Marker duration** — "a few calm seconds" (D18-07). Recommendation: ~4s fade start + ~600ms opacity transition (reduced-motion: instant clear), e2e asserts presence-then-absence with generous timeouts; exact value = UI-SPEC.
   - **RESOLVED (UI-SPEC §Auto-Resolved #10 → Plan 18-03 Task 2):** 4000ms total — `is-fading` class at 3400ms + 600ms CSS opacity transition; reduced-motion → instant clear; CSS-transition only (Pitfall 8), unit-tested with fake timers at the 3400/4000ms boundaries.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20.19+/22 LTS | Vite 8 toolchain | ✓ | v22.22.3 | — |
| @playwright/test (chromium/firefox/webkit) | 3-engine e2e matrix | ✓ | 1.61.1 | — |
| Vitest | unit tests | ✓ | 4.1.10 | — |
| Popover API (browser) | TOC panel | ✓ (Baseline 2024+; engines current) | platform | Positioned `<aside>` (documented alternative) |
| IntersectionObserver / scroll events | shared scroll-spy | ✓ (already shipping in SectionAnnouncer) | platform | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — popover fallback only materializes if engine quirks appear (unlikely; e2e will catch).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| Config file | `vitest.config.ts` / `playwright.config.ts` (existing, byte-stable) |
| Quick run command | `npm run test:unit -- --run` (unit) / `npx playwright test tests/e2e/toc` (phase specs) |
| Full suite command | `npm run test` (unit + e2e, exit 0 = honest gate) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORNT-01 | Trigger opens labeled panel; entry activation jumps | e2e | `npx playwright test tests/e2e/toc/toc-navigation.spec.ts` | ❌ Wave 0 |
| ORNT-03 | Same destination lands in both modes (offset equivalence) | e2e | `npx playwright test tests/e2e/toc/toc-navigation.spec.ts -g "both modes"` | ❌ Wave 0 |
| ORNT-04 | Skipped levels nest w/o invention; duplicates as-is; keyboard/SR list semantics | unit + e2e | `npx vitest run tests/unit/toc.test.ts` + toc-navigation `-g "skips\|duplicates"` | ❌ Wave 0 |
| ORNT-05 | Narrow/high-zoom: no obscure-inertly, no trap, no location change on open/close | e2e | `npx playwright test tests/e2e/toc/toc-geometry.spec.ts` (+ existing reflow/high-zoom/touch-targets run) | ❌ Wave 0 |
| ORNT-06 | Marker on reopen: present, transient, non-blocking, no dismissal; announce fires | e2e | `npx playwright test tests/e2e/toc/restoration-cue.spec.ts` | ❌ Wave 0 |
| ORNT-01 (aria-current) | Current-section entry carries aria-current while scrolling/turning | e2e | `npx playwright test tests/e2e/toc/toc-navigation.spec.ts -g "aria-current"` | ❌ Wave 0 |
| derivation invariants | blockStartOffsets destinations; headingless → Top only | unit | `npx vitest run tests/unit/toc.test.ts` | ❌ Wave 0 |
| paginated restore (if adopted) | reopen lands on saved page; marker at that page | e2e | `npx playwright test tests/e2e/toc/restoration-cue.spec.ts -g paginated` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run` + the phase's toc spec subset
- **Per wave merge:** `npm run test:e2e` full e2e
- **Phase gate:** full `npm run test` exit 0 (honest gate — record real fail counts; the 04-11/09-07 lessons)

### Wave 0 Gaps
- [ ] `tests/unit/toc.test.ts` — derivation invariants (REQ ORNT-04): skipped-level nesting, duplicate as-is, blockStartOffsets destinations, headingless → Top-only
- [ ] `tests/e2e/toc/toc-navigation.spec.ts` — open/jump/aria-current both modes, 3 engines
- [ ] `tests/e2e/toc/toc-geometry.spec.ts` — 320px/400% no-trap/no-shift; joins D6-09 `assertEdgeInvariant` + touch-target audit with the 5th header button
- [ ] `tests/e2e/toc/restoration-cue.spec.ts` — marker lifecycle both modes (scrolling today; paginated after OQ1)
- [ ] Seeded TOC corpus via `seedArticleRows` discipline: article with h2→h4 skip, duplicate heading texts, h5/h6 present, headingless article (essay-long-form covers headingless among fixtures), one EPUB chapter (D18-14) — NO fixture today contains h4/h5/h6, skips, or duplicates [VERIFIED: corpus scan]
- [ ] ResumeBanner retirement specs: replace the 2 assertion sites (`chrome/mobile-first-page-chrome.spec.ts` L79, `library/reading-views.spec.ts` L1019) with marker assertions (phase-owned retirements)
- [ ] Framework install: none needed — infrastructure complete

## Security Domain

`security_enforcement: true`, ASVS Level 1 (config). This phase adds NO new input surface, NO network calls, NO persistence schema changes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surfaces (local-first app) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No privilege boundaries touched |
| V5 Input Validation | yes (inherited) | TOC text derives EXCLUSIVELY from Zod-validated canonical blocks (`ArticleSchema.parse` at ingest); rendered as React text children — auto-escaped; `react/no-danger` ESLint rule statically forbids raw HTML (existing, verified firing in Phase 1) |
| V6 Cryptography | no | Nothing hashed/encrypted |
| V12 File Upload | no | No uploads this phase |
| V14 Config | no | Static SPA, no new config |

### Known Threat Patterns for {React SPA + derived UI}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via heading text (TOC as new render path) | Tampering | TOC renders the SAME InlineRun text the article body renders, through the same React text-child auto-escaping; no `dangerouslySetInnerHTML` anywhere (ESLint-enforced); heading content already sanitized at ingest (DOMPurify pipeline, ING-07) |
| DOM clobbering via invented ids | Tampering | No source ids carried through (schema strips them); destination resolution uses `data-block-index` (numeric) rather than string ids — follows the footnote-id/Pitfall-4 discipline |
| Router confusion via entry hrefs | Tampering | All activations intercepted; fragment-only hrefs; `parseHash` + fragment guard byte-stable; `history.replaceState` with template-built URLs only (T-10-03b precedent) |
| Focus hijacking (a11y attack surface) | Repudiation/Elevation adjacent | Non-modal panel never traps focus (D18-04); one focus-restore seam; e2e asserts Tab-escapability in all engines |

## Sources

### Primary (HIGH confidence)
- Codebase (read/grep this session): `src/content/schema.ts`, `src/content/normalizeText.ts` (articleGraphemeIndex/blockStartOffsets), `src/pagination/anchor.ts`, `src/reader/restoreLocation.ts`, `src/routes/ArticleView.tsx` (restore effect L1462-1542, deep-link jump L1326-1455, handleNavigateBack L1717-1776, tag-popover seam L333-375, paginated render L2080-2144), `src/reader/SectionAnnouncer.tsx`, `src/reader/ResumeBanner.tsx`, `src/reader/Header.tsx`, `src/reader/PaginatedSurface.tsx` (handle L140-178), `src/reader/useScrollSave.ts`, `src/content/render/BlockRenderer.tsx` + `InlineRenderer.tsx`, `src/app.css` (reduced-motion L84-92, resume-banner L1009-1101/L3650-3692, ≤639px geometry L3694-3751), `tests/e2e/persistence.spec.ts` (option-b deferral L55-70), `tests/e2e/panel-keyboard.spec.ts`, fixture corpus scan (heading levels/duplicates per fixture)
- MDN Popover API + `popover` attribute (fetched 2026-08-30): non-modality, manual-state no-light-dismiss, display:none closed, top layer, Baseline 2024/2025 — developer.mozilla.org/en-US/docs/Web/API/Popover_API and /Web/HTML/Reference/Global_attributes/popover

### Secondary (MEDIUM confidence)
- W3C WAI-ARIA 1.2 (fetched): host-language-first authoring principle (§1.4) — nav/ul/a over ARIA widget roles for link TOCs; aria-current semantics
- MDN aria-current token semantics ("page" vs "true"/"location") — applied to A2/A2 recommendation

### Tertiary (LOW confidence)
- None — no WebSearch-only claims were used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every seam verified by direct code reads
- Architecture: HIGH — patterns are shipped codebase seams (tag popover, D5-11 jump, scroll-spy) adapted, not invented
- Pitfalls: HIGH — both critical gaps (paginated restore deferral, paginated save absence) verified in source with line references
- UI specifics (marker styling, header relief, exact copy): MEDIUM — deliberately left to UI-SPEC with measured constraints documented

**Research date:** 2026-08-30
**Valid until:** 2026-09-29 (stable codebase-anchored domain; re-verify only if Phase 17+ commits touch ArticleView restore/Header before planning lands)
