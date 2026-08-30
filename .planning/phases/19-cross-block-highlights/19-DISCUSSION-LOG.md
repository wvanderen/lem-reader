# Phase 19: Cross-Block Highlights - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 19-cross-block-highlights
**Areas discussed:** Eligibility matrix, Reject vs narrow, Capture + review UX, List interiors

---

## Eligibility matrix

| Option | Description | Selected |
|--------|-------------|----------|
| All readable kinds | Paragraph, heading, quote, list, caption, code, footnote — "if you can read it, a highlight can span it" | ✓ |
| Prose only | Paragraph, heading, quote, list; code/captions/footnotes stay single-block | |
| You decide | Planner/researcher picks per matrix-test evidence | |

**User's choice:** All readable kinds
**Notes:** One mental model extending D5-07 to spans.

| Option | Description | Selected |
|--------|-------------|----------|
| Cross gaps calmly | Highlight continues on both sides; gap renders unhighlighted; one identity survives | ✓ |
| Reject at gap | Any non-text gap between endpoints refuses the span | |
| You decide | Researcher/planner decide from matrix evidence | |

**User's choice:** Cross gaps calmly
**Notes:** "We skipped what you can't read" honesty; a gap is not a boundary.

| Option | Description | Selected |
|--------|-------------|----------|
| Children count | Span may run paragraph → list item → paragraph as one highlight; children carry data-block-index | ✓ |
| Top-level only | Spans only between top-level blocks; child endpoints narrow to their block | |

**User's choice:** Children count
**Notes:** Nested readable children are real blocks for crossing purposes.

| Option | Description | Selected |
|--------|-------------|----------|
| No cap | Trust the reader; overlap policy is the natural limiter | ✓ |
| Calm cap | Max N blocks / % of article, refused calmly | |

**User's choice:** No cap
**Notes:** Whole-article highlight is honest, if unusual.

---

## Reject vs narrow

| Option | Description | Selected |
|--------|-------------|----------|
| Narrow first | Shrink to largest eligible sub-span and explain | |
| Reject whole | Refuse the selection calmly with the reason; reader re-selects | ✓ |
| You decide | Picked from matrix-test evidence | |

**User's choice:** Reject whole
**Notes:** Simpler, fully honest, zero guessing — mirrors today's refusal with better explanation.

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar hint | Existing selection toolbar inline calm reason (D5-06 hint channel) | ✓ |
| Detailed note | Non-modal note naming the failed block kind | |

**User's choice:** Toolbar hint
**Notes:** One place, consistent; only new copy is the refusal string.

| Option | Description | Selected |
|--------|-------------|----------|
| Global no-overlap | One rangesOverlap check on article-global ranges; no special cases | ✓ |
| Per-block check | Overlap tolerated in blocks the span merely crosses | |

**User's choice:** Global no-overlap
**Notes:** D5-13 generalizes; touching endpoints stay allowed.

| Option | Description | Selected |
|--------|-------------|----------|
| Strict per-span | Every crossed block must be eligible (gaps aside) | ✓ |
| Pair-specific rules | Finer per-pair control; more matrix cells | |

**User's choice:** Strict per-span
**Notes:** All-or-nothing per selection.

---

## Capture + review UX

| Option | Description | Selected |
|--------|-------------|----------|
| First fragment + … | Opening text then calm ellipsis; compact scannable rows | ✓ |
| Joined, middle-cut | Block texts joined, middle truncated; shows start+end context | |
| You decide | Picked from review-panel geometry evidence | |

**User's choice:** First fragment + …
**Notes:** Kindle-familiar; full text lives in the reader.

| Option | Description | Selected |
|--------|-------------|----------|
| No indicator | One highlight is one highlight; marks make the span self-evident | ✓ |
| Quiet badge | "×4 blocks" hint on review rows | |

**User's choice:** No indicator
**Notes:** No span-announcing chrome anywhere.

| Option | Description | Selected |
|--------|-------------|----------|
| Unchanged | Highlight button just works on spans; refusal hint is the only new copy | ✓ |
| Span feedback | Live "3 blocks selected" affordance | |

**User's choice:** Unchanged
**Notes:** No new capture affordance.

| Option | Description | Selected |
|--------|-------------|----------|
| One block, breaks kept | Single highlight section preserving block-boundary line breaks | ✓ |
| One line | Block texts joined to one flowing line | |
| You decide | Picked from markdown-writer evidence | |

**User's choice:** One block, breaks kept
**Notes:** Mirrors how the span reads in the reader.

---

## List interiors

| Option | Description | Selected |
|--------|-------------|----------|
| Per-item support | Items become highlightable + spannable children (05-07 debt closed) | ✓ |
| Whole-list only | Spans cross lists as units; item interiors stay unhighlightable | |

**User's choice:** Per-item support
**Notes:** Consistent with the children-count rule; blockquote precedent since 05-07.

| Option | Description | Selected |
|--------|-------------|----------|
| Never | Markers are generated chrome outside the D-05 substrate | ✓ |
| Whole-item marker | Marker visually included when span covers a whole item | |

**User's choice:** Never
**Notes:** Markers are chrome, not text.

| Option | Description | Selected |
|--------|-------------|----------|
| Recurse | Sub-list items are readable children; same rule, no special case | ✓ |
| Flatten | Only top-level items highlightable | |

**User's choice:** Recurse
**Notes:** Nested lists follow the same per-item rule.

---

## the agent's Discretion

- Multi-block capture internals (span walk, gap classification, CaptureResult taxonomy)
- Renderer path for spanning ranges (per-block intersection reuse, list-item threading, interior-gap rendering)
- Quote-selector composition + re-anchoring semantics for spans
- Review deep-link jump target (expected: span start)
- Paginated multi-page mark presentation (D5-16 extension)
- Eligibility-matrix test shape + which annotations specs change honestly
- Refusal copy wording (DOC-06 calm)
- Schema surface check (expected zero changes; surface any finding per Pitfall 9)

## Deferred Ideas

- Smart narrowing of ineligible selections — backlog candidate
- Span feedback during selection — revisit on reader confusion
- Quiet span badge on review rows — revisit if long spans make rows ambiguous
- New annotation kinds (colors, underline styles) — out of scope
