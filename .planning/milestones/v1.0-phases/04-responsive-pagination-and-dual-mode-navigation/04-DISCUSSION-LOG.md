# Phase 4: Responsive Pagination and Dual-Mode Navigation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 4-responsive-pagination-and-dual-mode-navigation
**Areas discussed:** Block fragmentation policy, Page navigation controls, Mode switch + passage anchor
**Areas deferred by user:** Fallback policy + diagnostic UI (PAGE-04/PAGE-09) — constraints locked, empirical threshold left to agent discretion

---

## Gray-area selection

The user was offered 4 gray areas via multiSelect and selected 3:

| Gray area | Selected |
|---|---|
| Block fragmentation policy | ✓ |
| Page navigation controls | ✓ |
| Mode switch + passage anchor | ✓ |
| Fallback policy + diagnostic UI | (deferred — constraints already locked by D3-04/D3-05/STACK.md) |

---

## Block fragmentation policy

### Q1 — Overall fragmentation feel

| Option | Description | Selected |
|--------|-------------|----------|
| Booklike flow | Split paragraphs at line boundaries so each page fills (like a real book). Needs source-offset-preserving fragments + accessible reading order. Closest to PROJECT.md "calm, booklike"; matches STACK.md "when text must split, preserve source offsets". | ✓ |
| Whole blocks only | Move entire block to next page if it doesn't fit (widow/orphan control). Simpler engine, no sub-block fragments. Long paragraphs leave large whitespace. | |
| Hybrid threshold | Keep blocks whole unless moving them wastes more than N% of the page, then split. Tunable middle ground; adds a threshold knob. | |

**User's choice:** Booklike flow
**Notes:** Most demanding option; chosen to honor the "calm, booklike" product promise. Matches STACK.md's "when text must split, preserve source offsets and accessible reading order."

### Q2 — Atomic block kinds

| Option | Description | Selected |
|--------|-------------|----------|
| Fig/heading/code/etc | Atomic = figure + heading + code-block + footnote-ref + unsupported. Paragraphs, list items, blockquote children split. Code stays whole (split code risks semantic misreading). | ✓ |
| Fig/heading only | Atomic = figure + heading + footnote-ref + unsupported. Code-block ALSO splits between lines. Most booklike for technical content; higher disorientation risk. | |
| Only paragraphs split | Atomic = everything except paragraphs. Lists/blockquotes/code move whole. Most conservative; long bulleted-list/footnote-academic fixtures leave whitespace. | |

**User's choice:** Fig/heading/code/etc (recommended)
**Notes:** Booklike for prose, conservative for code. Footnote-reference (`<sup>`) is effectively inline and atomic.

### Q3 — Heading widow rule

| Option | Description | Selected |
|--------|-------------|----------|
| Heading + 2 lines | Heading must keep first 2 lines of following block on same page; else move heading to next page. Standard book typography. | ✓ |
| Heading + 1 line | Heading must keep just the first line of following block. Weaker guarantee. | |
| No widow rule | Heading can sit at page bottom alone. Disorienting for accessibility-first reader. | |

**User's choice:** Heading + 2 lines (recommended)

### Q4 — Line-level widow/orphan control

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, 2-line rule | Avoid 1-line orphans/widows: keep at least 2 lines of a paragraph on each side of a split. Consistent with the heading widow rule. | ✓ |
| No, pure fill | Split purely at whichever line fills the page; accept occasional single-line strands. | |
| You decide | Agent tunes thresholds against the corpus. | |

**User's choice:** Yes, 2-line rule (recommended)
**Notes:** Completes the fragmentation policy. Agent discretion flagged: Phase 3's MeasurementResult lacks line-break positions / per-line source offsets, so Phase 4 must extend measurement to carry split-point data (Pretext breaks for eligible kinds; DOM getClientRects mapping for DOM-measured kinds), all round-tripping through D-05 grapheme offsets.

---

## Page navigation controls

### Q1 — Keyboard scheme

| Option | Description | Selected |
|--------|-------------|----------|
| Full bundle | PageUp/PageDown + ArrowLeft/ArrowRight + Space/Shift+Space. Covers web, book, and reader conventions. Most accessible. | ✓ |
| PageUp/Down + Space | No arrows; reserves arrows for future line-focus aid (v2 ORNT-02). Slightly less discoverable. | |
| You decide | Agent picks the exact key set. | |

**User's choice:** Full bundle (recommended)
**Notes:** Arrows claimed now; v2 line-focus aid will disambiguate if needed.

### Q2 — Pointer + touch

| Option | Description | Selected |
|--------|-------------|----------|
| Quiet buttons + swipe | Small low-contrast page-turn buttons + left/right swipe. No invisible click zones (avoids Phase 5 annotation/link conflict). Discoverable + calm. | ✓ |
| Click zones + swipe | Invisible left/right-half click zones + swipe. Maximally calm but undiscoverable; conflicts with Phase 5 text selection + link clicks. | |
| Swipe + keyboard only | No pointer page turn. May fail pointer-parity (A11Y-07). | |

**User's choice:** Quiet buttons + swipe (recommended)
**Notes:** Agent discretion on exact button placement (page sides vs bottom bar) and swipe-vs-pinch-zoom conflict resolution (A11Y-04) — UI-SPEC / researcher.

### Q3 — Focus on turn + SR status

| Option | Description | Selected |
|--------|-------------|----------|
| Context-aware | Stay on control if turn via button/key; move to top of new page (first heading/focusable) if focus was in content. Concise "Page N of M" SR status. No duplicate content tree (A11Y-03). | ✓ |
| Always top of page | Focus always moves to top of new page. Consistent but disorients button users. | |
| Focus never moves | Reader manages focus. Fails A11Y-02 predictability. | |

**User's choice:** Context-aware (recommended)

### Q4 — Page indicator

| Option | Description | Selected |
|--------|-------------|----------|
| N of M as signal | Quiet "N of M" text IS the paginated progress signal; hairline derives from N/M in paginated mode, stays scroll-ratio in scrolling mode. Informational, not identity. | ✓ |
| Hairline only | Keep Phase 2 hairline + section announcer; no explicit page numbers. Maximally calm; loses "where am I in the book" signal. | |
| Both | Hairline + explicit N of M text. Most info; risks competing with content (READ-04). | |

**User's choice:** N of M as signal (recommended)
**Notes:** Consistent with READ-05 (page number is NOT permanent identity — it changes with viewport/typography).

---

## Mode switch + passage anchor

### Q1 — Toggle location

| Option | Description | Selected |
|--------|-------------|----------|
| Header + M shortcut | Quiet toggle in the slim header (next to gear) + M key. Discoverable, immediate, explicit (PAGE-01). | ✓ |
| Settings panel only | Mode toggle in the settings slide-over. Calm + grouped; less immediate. | |
| Header only | Quiet header toggle, no shortcut. Slower for keyboard-heavy readers. | |

**User's choice:** Header + M shortcut (recommended)
**Notes:** Mode is a primary reading control, not a typography preference.

### Q2 — Mode-switch anchor (PAGE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Top of current view | First visible block (scrolling) / first block on current page (paginated) → D-05 grapheme offset → target in new mode. Predictable. | ✓ |
| Last focused block | Block the reader was last focused on. Harder to track; may jump unexpectedly. | |
| Selection/cursor | Maps from active selection/cursor. Only works with a selection; adds a special case. | |

**User's choice:** Top of current view (recommended)

### Q3 — Repagination anchor (PAGE-05/SC4)

| Option | Description | Selected |
|--------|-------------|----------|
| Same top-of-view rule | Same anchor as mode-switch: top-of-viewport grapheme offset stays at top after repagination. One consistent rule across both triggers. Pairs with PAGE-06. | ✓ |
| Keep page stable | Try to keep same page index for minor changes. Fragile — page index isn't stable under resize. | |
| You decide | Agent picks the repagination anchor. | |

**User's choice:** Same top-of-view rule (recommended)
**Notes:** One consistent passage-preservation principle across mode-switch AND repagination.

### Q4 — readingMode field default

| Option | Description | Selected |
|--------|-------------|----------|
| Paginated | Default = "paginated". Matches PROJECT.md ("Pagination is the distinctive default experience"). schemaVersion 1→2 with default-on-read. | ✓ |
| Scrolling | Default = "scrolling". Matches Phase 2 shipped behavior; safer. Undercuts "pagination is the distinctive default." | |
| Per-article | Store readingMode per-article. More granular but more complex; STATE-02 implies a global preference. | |

**User's choice:** Paginated (recommended)
**Notes:** Surfaced gap — STATE-02 is marked Complete but `ReaderSettingsSchema` (src/content/schema.ts:209) has NO readingMode field. Phase 4 must add it. Dexie settings store is key-value, so likely a Zod value-shape evolution with default-on-read, not a Dexie store change (planner confirms against Pitfall 9).

---

## the agent's Discretion

Areas explicitly deferred to the agent during discussion:

- **Measurement extension for split points** — Phase 3's MeasurementResult carries per-block heights + line counts but NOT line-break positions or per-line source offsets. Phase 4 extends measurement to carry split-point data (Pretext breaks for eligible kinds; DOM getClientRects mapping for DOM-measured splitting kinds). Contract locked (D-05 grapheme round-trip); mechanics are architecture.
- **Page geometry specifics** — width follows existing --measure content-box; height viewport-bounding (forced by Phase 3 ResizeObserver triggers); internal padding/margins are UI-SPEC.
- **Page-turn button placement + swipe-vs-zoom conflict** — UI-SPEC / researcher against viewport/device matrix.
- **Fallback policy + diagnostic surfacing (PAGE-04/PAGE-09)** — user deferred this area. LOCKED: surface (D3-04), shape (D3-05), behavior (STACK.md). OPEN/empirical: threshold, per-block vs whole-article fallback, banner copy/lifecycle, which DiagnosticEvent kinds go reader-visible.
- **`TextMeasurer` adapter / pagination-engine module boundary** — architecture.
- **Diagnostic substrate consumption mechanics** — how paginated view subscribes to DiagnosticBus.
- **Exact toggle copy/labeling, hairline region layout, "N of M" typography** — UI-SPEC.

## Deferred Ideas

None raised that were out of scope. Confirmed-later-phase items:
- Highlights and notes → Phase 5 (ANNO-01…07, STATE-03). D4-06 (no invisible click zones) was chosen partly to avoid Phase 5 selection conflict.
- Formal cold/warm repagination performance budgets (ACPT-04) → Phase 6.
- Heading navigator and line-focus aid (ORNT-01/02) → v2.
- PAGE-04/PAGE-09 fallback-area empirical detail → agent discretion (constraints locked); can be revisited if planner/researcher finds locked constraints insufficient.
