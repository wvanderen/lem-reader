# Phase 14: Navigation and Library Contracts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-24
**Phase:** 14-navigation-and-library-contracts
**Areas discussed:** Route-change focus + titles, History + view-state contract, Progress policy edges, View switcher + counts + empty states

---

## Route-change focus + titles

| Option | Description | Selected |
|--------|-------------|----------|
| Focus new view's h1 | tabindex=-1 h1 focus on route swap; one h1 per view already locked | ✓ |
| Focus main container | One generic rule targeting main#main; coarser landing | |
| Announce only, no move | aria-live status without focus move; strands keyboard focus at body | |

**User's choice:** Focus new view's h1
**Notes:** Standard SPA route-change remedy; composes with existing one-h1 discipline.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-destination titles | Library / article title / Review highlights, each with suffix | ✓ |
| Article only | Manage title only in ArticleView; tab lies on 2 of 3 destinations | |
| Per-destination, shape planner's | Lock policy, delegate suffix/ordering convention | |

**User's choice:** Per-destination titles
**Notes:** Exact suffix convention planner-confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Swaps only | Cold deep-link loads keep natural focus; h1 focus on in-app swaps | ✓ |
| Same everywhere | Also focus h1 on initial load; yank + scroll-restore risk | |
| Planner decides | Research cross-engine focus/scroll interplay | |

**User's choice:** Swaps only
**Notes:** Avoids fighting deep-link intent and location-restore scroll.

| Option | Description | Selected |
|--------|-------------|----------|
| Audit + new-UI only | Verify landmark coherence; landmark the new view-switcher; no restructuring | ✓ |
| Restructure now | Re-landmark existing chrome; churn vs byte-stable anchors | |
| Researcher audits | Standing audit with proposals | |

**User's choice:** Audit + new-UI only
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| Specific target wins | Deep-link jump keeps highlight focus; h1 is the default | ✓ |
| h1 first, then jump | Two moves, two SR announcements, no value | |

**User's choice:** Specific target wins
**Notes:** Most-specific-intent-wins layering.

| Option | Description | Selected |
|--------|-------------|----------|
| Full parity | Error destinations get truthful title + h1 focus | ✓ |
| Focus only | Focus moves, title untouched | |
| No treatment | Errors keep current behavior | |

**User's choice:** Full parity
**Notes:** A failed open IS the destination — honesty principle.

| Option | Description | Selected |
|--------|-------------|----------|
| Chapter + book | "Chapter title — Book title — Lem Reader" | ✓ |
| Title only, uniform | Identical rule for chapters and standalone articles | |
| Planner decides | Truncation/ordering research | |

**User's choice:** Chapter + book
**Notes:** Mirrors the D12-08 reader context line.

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform h1 rule | Return-to-library behaves like any swap; row restore = Phase 15 | ✓ |
| Row restore now | Pull NAV-03 work forward | |

**User's choice:** Uniform h1 rule
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| Focus alone | The h1 focus move IS the announcement | ✓ |
| Focus + announce | Extra polite live-region copy per destination | |

**User's choice:** Focus alone
**Notes:** One signal per change; calm.

| Option | Description | Selected |
|--------|-------------|----------|
| Restored spot wins | Focus lands near restored position; h1 for fresh articles | ✓ |
| h1 always | Focus yanks to top, fights restore scroll | |
| Planner investigates | Cross-engine focus/scroll timing research | |

**User's choice:** Restored spot wins
**Notes:** Extends most-specific-wins layering (D14-05).

| Option | Description | Selected |
|--------|-------------|----------|
| Routes only | Overlays never mutate title/focus | ✓ |
| Overlays too | Expand scope with little value | |

**User's choice:** Routes only
**Notes:** Locks the contract boundary cleanly.

---

## History + view-state contract

| Option | Description | Selected |
|--------|-------------|----------|
| Hash routes | Dedicated segments (#/unread etc.); truthful URLs; Phase 15 inherits view from URL | ✓ |
| Client state | No URL change; Phase 15 threads state separately | |
| Parameter form | #/?view=unread; muddies byte-stable grammar | |

**User's choice:** Hash routes
**Notes:** Exact segment names planner-confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Push per switch | Back walks view switches | |
| Replace on switch | Destinations are history; views are state-within-destination | ✓ |
| Planner decides | Weigh SPA conventions | |

**User's choice:** Replace on switch
**Notes:** Calmer back-button semantics.

| Option | Description | Selected |
|--------|-------------|----------|
| Origin view / All | Back returns to originating view; cold #/ fallback → All; no persistence | ✓ |
| Persist last-used view | Fallback lands on persisted view; adds storage + rule interactions | |

**User's choice:** Origin view / All
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| h1 focus on switch | View switch treated as full-content swap; one uniform rule | ✓ |
| Live region instead | Second announcement mechanism for views | |
| Nothing | aria-current alone; weakest for non-visual users | |

**User's choice:** h1 focus on switch
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback to All | Unknown #/ segments map to All; existing parseHash discipline | ✓ |
| Error destination | New "couldn't find that view" surface | |

**User's choice:** Fallback to All
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| View restores, no focus | Reload = cold load; URL restores view, focus natural | ✓ |
| View + focus h1 | Diverges from cold-load rule | |

**User's choice:** View restores, no focus
**Notes:** |

---

## Progress policy edges

| Option | Description | Selected |
|--------|-------------|----------|
| In Progress | Any LocationRecord = started; Unread = never opened; matches strip + D8-10 | ✓ |
| Unread until >0% | Intuitive label but contradicts the strip — cross-surface disagreement | |

**User's choice:** In Progress
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| All chapters (ratio = 1.0) | Book finished when every admitted chapter ≥98%; no second threshold | ✓ |
| Ratio ≥ 0.98 | 50-chapter book with 1 unread reads Finished; counts disagree with visible chapters | |
| Planner decides | Layering question only | |

**User's choice:** All chapters (ratio = 1.0)
**Notes:** Derives directly from D12-03.

| Option | Description | Selected |
|--------|-------------|----------|
| One policy module | New pure module beside bookProgress.ts; all surfaces consume; FINISHED_RATIO fork deleted | ✓ |
| Extend bookProgress.ts | Mixes article + book algebra in a book-named module | |
| Planner places it | Single-source locked, file/shape planner's | |

**User's choice:** One policy module
**Notes:** Known tech debt closed.

| Option | Description | Selected |
|--------|-------------|----------|
| Honest denominator | Missing chapter rows keep book honestly In Progress | ✓ |
| Resolvable-only | Partial imports can reach Finished; quieter but hides missing chapters | |

**User's choice:** Honest denominator
**Notes:** No-silent-garbage principle.

---

## View switcher + counts + empty states

| Option | Description | Selected |
|--------|-------------|----------|
| Links + aria-current | Views ARE routes; native semantics; composes with all prior decisions | ✓ |
| Tabs (tablist) | Tab semantics fight route reality; extra keyboard machinery | |
| Segmented buttons | Form-control semantics for navigation | |

**User's choice:** Links + aria-current
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| Counts in labels | "Unread (3)" in accessible names; derived from policy module | ✓ |
| Status line above list | Separate live region; counts not discoverable from switcher | |
| Both | Redundant surfaces to keep honest | |

**User's choice:** Counts in labels
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| One item per book | Book = 1 row/item per view; matches D12-01 | ✓ |
| Count chapters | Counts disagree with visible rows; contradicts LIB-08 | |

**User's choice:** One item per book
**Notes:** |

| Option | Description | Selected |
|--------|-------------|----------|
| Constant h1 | "Saved articles" on every view; byte-stable anchor preserved | ✓ |
| h1 mirrors view | More self-describing; breaks byte-stable anchors | |

**User's choice:** Constant h1
**Notes:** URL + aria-current carry the view.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-view copy | Each view's empty state states that view's truth (D8-04 voice) | ✓ |
| Generic shared | One "Nothing here" for all views | |
| Per-view, words planner's | Distinctness locked; exact words UI-SPEC/planner | |

**User's choice:** Per-view copy
**Notes:** |

---

## the agent's Discretion

- Exact view-segment names and grammar consistency with `/h/` suffix form
- Exact title suffix/ordering convention + truncation rules for long titles
- `readingState.ts` API shape (article/book unification, text-length lookup threading)
- Where title/focus effects live (App.tsx vs per-view mount)
- Count label formatting + recompute timing
- Sort order within views (recently-added desc expected)
- ContinueReadingStrip refactor scope (module consumption only; surface = Phase 16)
- e2e spec structure for view routes/counts/empty states/focus/title
- Scroll behavior on view switch (list-top reset expected)

## Deferred Ideas

- Row-level focus/scroll/filter restore (NAV-03) — Phase 15
- Search/tag within selected view (LIB-09) — Phase 16
- Continue Reading redesign (LIB-10) — Phase 16
- Persisting last-used view across sessions — rejected for now (D14-14)
- h1 mirroring active view — rejected (D14-25), revisit on SR feedback
- Push-per-view-switch history entries — rejected (D14-13)
