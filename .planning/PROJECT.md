# Lem Reader

## What This Is

Lem Reader is a calm, booklike reader for web articles. Its first artifact — **shipped as v1.0** — is a saved-article prototype for accessibility users, especially readers who benefit from reduced distraction, stable spatial orientation, and predictable navigation, that presents normalized long-form content in either responsive pages or a clean scrolling view.

The prototype supports rich article structure, local highlights and notes, and location restoration, and has proven that web content can be repaginated quickly and reliably without sacrificing semantic HTML, keyboard access, reduced-motion behavior, or reader choice — across Chromium, Firefox, and WebKit.

## Current State

**v1.0 MVP — SHIPPED 2026-08-10.** Six phases, 35 plans, 79 tasks across 16 days.

- Loads a curated corpus of six real published articles (Aeon, MDN ×2, Wikipedia ×2, Stanford Encyclopedia of Philosophy) normalized into a canonical JSON document model covering nine block kinds and four inline marks.
- Renders every supported article in a calm scrolling surface or in responsive paginated pages, with explicit mode switching that preserves the reader's logical passage.
- Provides typography (family, size, line-height, spacing, measure), accessible light/dark themes, and reading-mode controls that persist locally via Dexie/IndexedDB with versioned, Zod-validated records and recoverable storage-failure states.
- Restores the reader's grapheme-offset location on reopen.
- Supports local highlights with attached notes that anchor to canonical normalized-text positions plus quoted context, remaining stable across repagination, mode changes, typography changes, and reopen — with explicit ambiguous/orphan surfacing.
- Project-owned pagination engine (line-box splitting, widow rules, post-render overflow guard, diagnostics) with staleness-safe, calibrated measurement substrate (last-valid-view retention, stale-epoch drop, calibrated Pretext fast path with per-kind drift guard).
- Validated for accessibility: full keyboard operation with visible logical focus, screen-reader semantic order (VoiceOver+Safari manual protocol zero-blocker), high-zoom/reflow, forced-colors, reduced-motion, touch targets, and late/failed font loading. Performance within user-approved budgets enforced by a CI gate.

**Codebase:** ~13,910 LOC source + ~17,750 LOC tests. Tech stack: React 19 + TypeScript 7 + Vite 8 SPA, Dexie, Zod, Pretext (calibrated heading path), Vitest + Playwright + axe-core.

**Final suite:** `npm run test` = 1157 passed / 0 failed / exit 0 (514 unit + 643 e2e across chromium/firefox/webkit).

## Core Value

Readers can move through long-form web content with calm, stable orientation and predictable navigation.

## Requirements

### Validated

- ✓ Load a representative set of saved, normalized long-form articles into a dedicated reader prototype. — v1.0
- ✓ Present every supported article in both responsive paginated and clean scrolling modes, with the reader always able to switch modes. — v1.0
- ✓ Preserve semantic structure for text, headings, links, quotations, lists, images, captions, footnotes, and code blocks. — v1.0
- ✓ Provide predictable keyboard, click/tap, and accessible navigation with reduced-motion support. — v1.0
- ✓ Keep pagination stable and responsive as viewport and typography settings change, while handling font loading safely. — v1.0
- ✓ Provide typography, spacing, theme, and reading-mode controls that support a calm, low-distraction experience. — v1.0
- ✓ Restore the reader's location when reopening the same article. — v1.0
- ✓ Fall back gracefully to the clean scrolling view whenever reliable pagination is not possible. — v1.0
- ✓ Store highlights and attached notes locally and keep their anchors stable across repagination. — v1.0

### Active

Next-milestone candidates (from the v2 requirements defined at roadmap creation):

- [ ] Orientation aids — heading/section navigator and an optional line-focus aid (ORNT-01, ORNT-02).
- [ ] Annotation recovery — a dedicated review panel and explicit anchor repair (RECV-01, RECV-02).
- [ ] Portability — versioned local export and validated import with conflict reporting (PORT-01, PORT-02).
- [ ] Presentation presets — evidence-informed calm presentation presets (PRES-01).
- [ ] NVDA+Firefox screen-reader acceptance run (ACPT-02 coverage boundary A4 — post-v1 follow-up).

### Out of Scope

- Live arbitrary-webpage extraction — the first artifact uses saved representative articles so layout and reading behavior can be validated independently.
- Browser-extension packaging — deferred until the core reading engine is technically reliable.
- Remote URL fetching, authenticated content, and paywall handling — unnecessary for the saved-article prototype and complicated by CORS and permissions.
- Cloud sync, accounts, and encrypted cross-device persistence — local persistence is sufficient to validate the reading and annotation loop.
- Tables, interactive embeds, math, and irregular application layouts — the prototype targets rich long-form articles rather than the full web.
- A required page-turn animation — transitions may be explored later, but cannot compromise speed, interruption, or reduced-motion preferences.
- Proving preference through a formal user study — initial success is stable, responsive behavior on representative content; comparative user validation follows later.

## Context

The product promise is to turn "read this webpage" into "open this as a book" without requiring publishers to change their sites. The long-term product may be an extension, standalone reader, or hybrid, but v1.0 deliberately isolates the reading engine from extraction and packaging.

The prototype compares the same normalized documents in paginated and scrolling presentations. Its audience focus is cognitive accessibility: reducing distraction, maintaining a sense of place, and making navigation predictable. Pagination is the distinctive default experience, but it is not mandatory; readers retain explicit control and the system falls back when content cannot be laid out reliably.

Pretext.js is a promising measurement primitive because it prepares text using canvas font metrics and supports repeated layout at different widths without DOM reads. It is not a parser, renderer, pagination engine, annotation system, or complete layout solution. v1.0 uses it only as a calibrated fast path for heading blocks (after a 2592-sample cross-engine calibration), with DOM measurement as the authoritative strategy for everything else.

Annotations attach to stable normalized-text positions plus quoted context rather than page numbers, because page boundaries change across viewports and typography settings. Font loading and fallback changes do not silently invalidate measurement. Accessibility requires semantic reading order, full keyboard operation, screen-reader compatibility, zoom support, visible focus, and a reduced-motion path — all validated in v1.0 across the supported browser matrix.

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
| Lead with booklike reading rather than annotation-anywhere | Stable pagination and spatial orientation are the distinctive hypothesis to prove first | ✓ Validated — v1.0 |
| Build a saved-article prototype before an extension | Isolates layout, accessibility, and annotation behavior from extraction and browser packaging risks | ✓ Validated — v1.0 |
| Design first for cognitive accessibility | Calm presentation, stable location, and predictable navigation define the primary reader need | ✓ Validated — v1.0 |
| Always offer paginated and scrolling modes | Reader control and robust access matter more than enforcing a single presentation | ✓ Validated — v1.0 |
| Include highlights and notes in the prototype | Durable annotations are part of the complete local reading loop even though reading remains the core wedge | ✓ Validated — v1.0 |
| Target rich long-form articles, not arbitrary web layouts | Captures realistic publishing structures while keeping tables, embeds, math, and application UI out of the first validation boundary | ✓ Validated — v1.0 |
| Define prototype success technically | Stable, responsive pagination and accessible navigation must work before comparative user-preference studies | ✓ Validated — v1.0 |
| Build a staleness-safe, calibrated measurement substrate before pagination | Pagination correctness depends on last-valid-view retention (PAGE-06), stale-epoch drops (PAGE-07), and calibrated fast paths (PAGE-08) | ✓ Validated — Phase 3 / v1.0 |
| Grapheme-offset canonical coordinate system (Intl.Segmenter) | Single stable coordinate shared by reading location, pagination source ranges, and annotation anchors | ✓ Good — anchors survived every repagination/mode/reopen test |
| Project-owned pagination engine (no off-the-shelf lib) | Required combination of semantic DOM, responsive repagination, annotation-safe offsets, and scrolling twin that no reviewed library supplied | ✓ Good — corpus paginates green × 3 engines with overflow guard + diagnostics |
| W3C-inspired TextPositionSelector + TextQuoteSelector for annotations | Page numbers, pixels, DOM paths, and serialized ranges are all ephemeral; canonical normalized-text offsets + quoted context survive relayout | ✓ Good — tri-state resolution (confident/ambiguous/orphan) never silently re-attaches |
| Honest full-suite execution discipline (run `npm run test` end-to-end, record fail counts) | A "269 passed / 0 failed" misreport hid 76 real e2e failures; only re-running the suite overturned it | ✓ Good — caught by gsd-verifier; closed by gap-closure plans 04-07..04-11 |

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
*Last updated: 2026-08-10 after v1.0 milestone*
