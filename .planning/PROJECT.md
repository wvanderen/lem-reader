# Lem Reader

## What This Is

Lem Reader is a calm, booklike reader for web articles. Its first artifact is a saved-article prototype for accessibility users—especially readers who benefit from reduced distraction, stable spatial orientation, and predictable navigation—that presents normalized long-form content in either responsive pages or a clean scrolling view.

The prototype will support rich article structure, local highlights and notes, and location restoration while testing whether web content can be repaginated quickly and reliably without sacrificing semantic HTML, keyboard access, reduced-motion behavior, or reader choice.

## Core Value

Readers can move through long-form web content with calm, stable orientation and predictable navigation.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Load a representative set of saved, normalized long-form articles into a dedicated reader prototype.
- [ ] Present every supported article in both responsive paginated and clean scrolling modes, with the reader always able to switch modes.
- [ ] Preserve semantic structure for text, headings, links, quotations, lists, images, captions, footnotes, and code blocks.
- [ ] Provide predictable keyboard, click/tap, and accessible navigation with reduced-motion support.
- [ ] Keep pagination stable and responsive as viewport and typography settings change, while handling font loading safely.
- [ ] Provide typography, spacing, theme, and reading-mode controls that support a calm, low-distraction experience.
- [ ] Store highlights and attached notes locally and keep their anchors stable across repagination.
- [ ] Restore the reader's location when reopening the same article.
- [ ] Fall back gracefully to the clean scrolling view whenever reliable pagination is not possible.

### Out of Scope

- Live arbitrary-webpage extraction — the first artifact uses saved representative articles so layout and reading behavior can be validated independently.
- Browser-extension packaging — deferred until the core reading engine is technically reliable.
- Remote URL fetching, authenticated content, and paywall handling — unnecessary for the saved-article prototype and complicated by CORS and permissions.
- Cloud sync, accounts, and encrypted cross-device persistence — local persistence is sufficient to validate the reading and annotation loop.
- Tables, interactive embeds, math, and irregular application layouts — the prototype targets rich long-form articles rather than the full web.
- A required page-turn animation — transitions may be explored later, but cannot compromise speed, interruption, or reduced-motion preferences.
- Proving preference through a formal user study — initial success is stable, responsive behavior on representative content; comparative user validation follows later.

## Context

The product promise is to turn “read this webpage” into “open this as a book” without requiring publishers to change their sites. The long-term product may be an extension, standalone reader, or hybrid, but this milestone deliberately isolates the reading engine from extraction and packaging.

The prototype should compare the same normalized documents in paginated and scrolling presentations. Its audience focus is cognitive accessibility: reducing distraction, maintaining a sense of place, and making navigation predictable. Pagination is the distinctive default experience, but it is not mandatory; readers retain explicit control and the system can fall back when content cannot be laid out reliably.

Pretext.js is a promising measurement primitive because it prepares text using canvas font metrics and supports repeated layout at different widths without DOM reads. It is not a parser, renderer, pagination engine, annotation system, or complete layout solution. The project must supply an internal document model, pagination algorithm, semantic renderer, non-text measurement, annotation anchoring, and persistence.

Annotations must attach to stable normalized-text positions or selectors rather than page numbers, because page boundaries change across viewports and typography settings. Font loading and fallback changes must not silently invalidate measurement. Accessibility requires semantic reading order, full keyboard operation, screen-reader compatibility, zoom support, visible focus, and a reduced-motion path.

## Constraints

- **Prototype input**: Use a curated set of saved, representative articles — separates reading-engine validation from extraction variability.
- **Content scope**: Support text, headings, links, quotations, lists, images, captions, footnotes, and code blocks — enough to represent rich long-form publishing without claiming full-web compatibility.
- **Reading modes**: Paginated and scrolling modes must both remain available — accessibility and reader preference take precedence over enforcing pagination.
- **Accessibility**: Semantic HTML, keyboard navigation, screen-reader compatibility, zoom, visible focus, and reduced motion are foundational — the initial audience depends on predictable and adaptable interaction.
- **Persistence**: Reading position, highlights, and notes are local-first — avoids premature account and sync infrastructure.
- **Performance**: Repagination must feel responsive and remain stable after fonts settle — visible layout churn would undermine the product's core promise.
- **Validation**: Initial success is technical reliability on representative articles — formal preference, comprehension, and completion studies are later validation work.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lead with booklike reading rather than annotation-anywhere | Stable pagination and spatial orientation are the distinctive hypothesis to prove first | — Pending |
| Build a saved-article prototype before an extension | Isolates layout, accessibility, and annotation behavior from extraction and browser packaging risks | — Pending |
| Design first for cognitive accessibility | Calm presentation, stable location, and predictable navigation define the primary reader need | — Pending |
| Always offer paginated and scrolling modes | Reader control and robust access matter more than enforcing a single presentation | — Pending |
| Include highlights and notes in the prototype | Durable annotations are part of the complete local reading loop even though reading remains the core wedge | — Pending |
| Target rich long-form articles, not arbitrary web layouts | Captures realistic publishing structures while keeping tables, embeds, math, and application UI out of the first validation boundary | — Pending |
| Define prototype success technically | Stable, responsive pagination and accessible navigation must work before comparative user-preference studies | — Pending |
| Build a staleness-safe, calibrated measurement substrate before pagination | Pagination correctness depends on a measurement pipeline that retains the last valid reader view (PAGE-06), drops stale-epoch results at a commit guard (PAGE-07), and only enables any fast text-measurement path after per-kind calibration against rendered DOM (PAGE-08). Last-valid-view retention + epoch-guarded commits + runtime drift downgrade + committed calibration fingerprint are the substrate Phase 4 pagination builds on. | ✓ Validated — Phase 3 (2/2 plans; 8/8 truths verified; 7/7 UAT passed) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-05 after Phase 3*
