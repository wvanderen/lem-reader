# Phase 18: Reader Orientation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 18-reader-orientation
**Areas discussed:** TOC surface pattern, Restoration cue reshape, TOC list presentation, Edge scope: no headings, books

---

## TOC surface pattern

### What is the table-of-contents surface?

| Option | Description | Selected |
|--------|-------------|----------|
| Non-modal panel | Panel beside the article (sheet at narrow width). No focus trap, page stays visible+inert-free — cleanest fit for ORNT-05's "no trapping/obscuring" wording. Manual Esc/focus-return needed (new pattern). | ✓ |
| Modal `<dialog>` | The 5-dialog shipped precedent. Free focus trap, Esc, inert backdrop, focus restore — but traps focus and covers content, in tension with ORNT-05's literal wording at narrow widths. | |
| Inline contents block | A `<details>`-style contents block above the article body. Zero overlay machinery, but pushes content down (layout shift) and lives far from deep reading positions. | |

**User's choice:** Non-modal panel
**Notes:** Recommended option accepted; ORNT-05's no-trapping wording was the deciding factor over the shipped native-dialog precedent.

### Where does the TOC trigger live?

| Option | Description | Selected |
|--------|-------------|----------|
| Shell header icon | 5th icon button in [tags][annotations][mode][gear] behind the articleMounted gate (D15-18). ≤639px wordmark-collapse geometry needs re-checking. | ✓ |
| In-content button | Quiet "Contents" control near the article title/back-link area. Deviates from D15-18 (content headers carry only Back to library + titles). | |
| Header icon + shortcut | Header icon plus keyboard shortcut (M-for-mode pattern). Shortcut details left to planner/UI-SPEC. | |

**User's choice:** Shell header icon
**Notes:** No keyboard-shortcut commitment — plain header icon only.

### What happens when a TOC entry is activated?

| Option | Description | Selected |
|--------|-------------|----------|
| Close + focus heading | Panel closes and focus moves to the destination heading with a visible cue; mode-aware (scroll / page-turn). | ✓ |
| Close + scroll only | Panel closes and scrolls/turns without moving focus. | |
| Keep panel open | Panel stays open for multi-section browsing; reader closes explicitly. | |

**User's choice:** Close + focus heading

### How does the panel behave at narrow widths and high zoom?

| Option | Description | Selected |
|--------|-------------|----------|
| Full-width sheet, non-inert | Below a breakpoint (and at high zoom) the panel spans viewport width but the page behind stays non-inert (Tab can leave, Esc closes). | ✓ |
| Bottom sheet | Panel docks to bottom half; content above stays visible; less vertical room for long TOCs. | |
| Side panel always | Thin overlay column at all widths; risky at 320px/400% zoom. | |

**User's choice:** Full-width sheet, non-inert

---

## Restoration cue reshape

### What form does the restoration cue take?

| Option | Description | Selected |
|--------|-------------|----------|
| Passive position marker | Calm hairline/edge marker attached AT the restored position + polite "Returned to where you left off." announce. No buttons; the cue IS the location. | ✓ |
| Announcement-only | Polite SR announcement; nothing visual beyond the restored scroll/page itself. | |
| Passive banner | Keep the banner card shape, no buttons, auto-fades. Still content-adjacent chrome that can overlap text at narrow widths. | |

**User's choice:** Passive position marker

### What happens to the "Resume reading" / "Start from top" banner actions?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop both actions | Restore always lands at the saved spot; start-from-top = TOC top entry or natural scroll back; ResumeBanner retires. | ✓ |
| Marker carries restart | Marker carries a small quiet "Start from top" control; no longer purely passive. | |
| Actions move to TOC | Keep both actions somewhere (e.g., TOC panel footer); adds chrome to the new panel. | |

**User's choice:** Drop both actions

### How long does the position marker stay visible?

| Option | Description | Selected |
|--------|-------------|----------|
| Transient fade | Fades after a few calm seconds (reduced-motion honored); nothing lingers while reading past it. | ✓ |
| Until first activity | Stays until first scroll/page-turn (today's auto-dismiss trigger); still zero required action. | |
| All session | Persistent "you were here" landmark; risks stale visual noise. | |

**User's choice:** Transient fade

### When does the marker appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Reopen-restore only | Fires only when a saved location is restored on reopen (ORNT-06 scope). TOC jumps get the focus-on-heading cue; deep-links keep today's behavior. | ✓ |
| All location jumps | Same marker on Highlights deep-link jumps — one consistent landing cue. | |

**User's choice:** Reopen-restore only

---

## TOC list presentation

### How does the TOC render heading hierarchy?

| Option | Description | Selected |
|--------|-------------|----------|
| Nested list | Nested `<ul>` reflecting true depth; skipped levels nest deeper without invented intermediates; SR depth from list structure. | ✓ |
| Flat + indent | One flat `<ul>`; level conveyed visually only. | |
| Flat, no levels | Every heading equal; leans against ORNT-04's "preserves source heading levels". | |

**User's choice:** Nested list

### How do duplicate heading texts appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Show as-is | Identical headings are identical-text links; list position disambiguates; no invented text. | ✓ |
| Calm disambiguation | Accessible suffix ("Notes (2 of 2)") or parent prefix; adds text the author never wrote. | |

**User's choice:** Show as-is

### Does the TOC mark your current section?

| Option | Description | Selected |
|--------|-------------|----------|
| aria-current + highlight | Current section's entry carries aria-current + subtle highlight, derived from the SectionAnnouncer scroll-spy substrate (reused, not forked). | ✓ |
| aria-current only | SR state only; no visual styling. | |
| No indication | Plain jump list this phase. | |

**User's choice:** aria-current + highlight

### Does the TOC include a "Top of article" entry?

| Option | Description | Selected |
|--------|-------------|----------|
| Top entry + headings | List starts with "Top of article" (article start / h1) then all h2-h6; cheaply restores the retired start-from-top affordance. | ✓ |
| Headings only | Only h2-h6 body headings; start-from-top stays scroll/flip-back only. | |

**User's choice:** Top entry + headings

---

## Edge scope: no headings, books

### What happens when an article has no headings?

| Option | Description | Selected |
|--------|-------------|----------|
| Always available + note | Trigger never disappears; headingless article opens the panel to the Top entry + calm "no headings" note. Consistent chrome, honest. | ✓ |
| Top entry only | Just the "Top of article" entry, no note; may read as broken. | |
| Hide when empty | Trigger hides/disables; chrome that appears/disappears per article is unpredictable. | |

**User's choice:** Always available + note

### Do EPUB chapters get the same TOC?

| Option | Description | Selected |
|--------|-------------|----------|
| Chapters = articles | Chapters are articles (bookId); TOC works identically from each chapter's own heading hierarchy. Zero extra machinery. | ✓ |
| Articles only | Gate TOC to non-book articles (D17-05 precedent); chapter readers lose orientation. | |

**User's choice:** Chapters = articles

### Book-level cross-chapter TOC — in or out?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer book TOC | Cross-chapter TOC is a new capability (navigating a book's chapter list) — its own future phase; noted to backlog. | ✓ |
| Include book TOC | Fold a chapter-list surface into Phase 18; expands beyond ORNT-01's "canonical article heading hierarchy". | |

**User's choice:** Defer book TOC

### Where does a long TOC list open?

| Option | Description | Selected |
|--------|-------------|----------|
| Open at current | List scrolls internally so the current section's entry is visible on open; internal scroll only, no page-level side effects. | ✓ |
| Open at top | Always shows the list from "Top of article" first; deep readers must scroll to find themselves. | |

**User's choice:** Open at current

---

## the agent's Discretion

- Panel implementation mechanics (aside vs popover=manual, sheet breakpoint, motion under reduced-motion gate, outside-click policy)
- Focus-return mechanics (Esc + trigger restore; non-inert page interaction)
- Offset→destination mapping per mode (reuse restoreLocation.ts/D4-10 anchor/turnToPage; no fork)
- Scroll-spy extraction shape for TOC aria-current without breaking SectionAnnouncer
- Marker anatomy + copy per mode; fade duration; headingless-note copy
- Header geometry at ≤639px with 5 article-scoped buttons
- Heading depth styling cap (structure stays semantic)
- Test shape: TOC + restoration-cue specs across 3 engines; ResumeBanner spec retirement; strengthen-only discipline

## Deferred Ideas

- Book-level cross-chapter TOC — backlog candidate (new capability)
- Calm duplicate-heading disambiguation — revisit on concrete SR friction
- Marker on every programmatic jump — revisit if deep-link landings confuse
- Keyboard shortcut for the TOC trigger — revisit on reader demand
- ORNT-02 line-focus aid — Future Requirements
