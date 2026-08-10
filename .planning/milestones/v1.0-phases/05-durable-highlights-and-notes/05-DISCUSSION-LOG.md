# Phase 5: Durable Highlights and Notes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 5-durable-highlights-and-notes
**Areas discussed:** Anchor re-attachment confidence (ANNO-05/06/07), Highlight creation & selection scope (ANNO-01), Notes + view/edit/navigate surface (ANNO-02/03/04), Overlap policy & inline rendering (calm + A11Y-05)

---

## Anchor re-attachment confidence (ANNO-05/06/07)

### Q1 — Strict partition vs cross-revision re-attach?

| Option | Description | Selected |
|--------|-------------|----------|
| Strict partition — same-revision only | Highlight resolves only against its exact revision (byte-identical text → always re-attaches). ANNO-07's states become a defensive guard. | |
| Cross-revision re-attach | Lookup by articleId; re-resolve TextQuote against current revision. ANNO-07's ambiguous/orphan states are genuinely reachable. | ✓ |
| You decide | Defer scope to researcher. | |

**User's choice:** Cross-revision re-attach. ANNO-07's wording and the reserved compound key both pointed here; makes ambiguous/orphan a live contract.

### Q2 — confident vs ambiguous vs orphan rules?

| Option | Description | Selected |
|--------|-------------|----------|
| Exact-first, then prefix/suffix disambiguate | Unique exact → confident; N>1 → prefix/suffix narrows, else ambiguous; 0 exact → prefix/suffix-only fallback, else orphan. | ✓ |
| Exact-match only | Unique → confident; N>1 → ambiguous; 0 → orphan. Simplest, deterministic. | |
| Normalization-insensitive / fuzzy | Tolerate punctuation/case/whitespace + edit-distance. Most forgiving; risks silent wrong re-attach. | |
| You decide | Defer thresholds to researcher. | |

**User's choice:** Exact-first, then prefix/suffix disambiguate. Balances forgiveness with never silently picking a wrong spot.

### Q3 — Persisted selector fields?

| Option | Description | Selected |
|--------|-------------|----------|
| Position + Quote both | Position = O(1) same-revision primary; quote = cross-revision recovery. W3C/hypothes.is/Readwise standard. | ✓ |
| Quote only | Re-resolve on every load. Always fresh but O(n) + routine ambiguity. | |
| Position only | Cheapest; no recovery path — contradicts cross-revision decision. | |

**User's choice:** Position + Quote both.

### Q4 — Ambiguous/orphan reader UX?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline marker + list entry, no silent loss | Distinct inline "unresolved" marker + flagged drawer entry showing the quote; delete available; full repair = v2 RECV-02. | ✓ |
| Silent skip + status notice count | One-line `.status` count only; reader can't see WHICH highlight. Weaker than ANNO-07. | |
| Render at best-guess with a flag | Always render inline at hint/first candidate, flagged. Risks misleading location. | |
| You decide | Defer to UI-SPEC. | |

**User's choice:** Inline marker + list entry, no silent loss.

---

## Highlight creation & selection scope (ANNO-01)

### Q1 — Creation affordance?

| Option | Description | Selected |
|--------|-------------|----------|
| Native selection + floating toolbar | Select (mouse/touch/keyboard) → small "Highlight"/"Highlight + note" toolbar. Kindle/Readwise/Apple Books model. | ✓ |
| Native selection + keyboard shortcut only | Select → press H. Calmest but undiscoverable; no obvious note path. | |
| Selection then action in header/settings | Action lives in header/settings. Discoverable but breaks immediacy. | |
| You decide | Defer to UI-SPEC. | |

**User's choice:** Native selection + floating toolbar.

### Q2 — Valid selection range?

| Option | Description | Selected |
|--------|-------------|----------|
| Within a single contiguous text run only | One normalized-text block; clean single grapheme range; sidesteps page-boundary problem. | ✓ |
| Span multiple blocks, same page/viewport | Cross block boundaries as one range; multi-block only within a page in paginated mode. | |
| Any contiguous selection, including across pages | Span page boundaries; collides with page-fragment model. | |
| You decide | Defer to researcher. | |

**User's choice:** Within a single contiguous text run only.

### Q3 — Eligible block kinds?

| Option | Description | Selected |
|--------|-------------|----------|
| Prose + quote/list children; code & captions too | paragraph, heading, quote/list children, figure caption, code source, footnote marker. "If you can read it, you can highlight it." | ✓ |
| Prose only | Exclude code source (fragile), caption/alt, footnote markers. Limits technical-post genre. | |
| You decide | Defer to researcher. | |

**User's choice:** Prose + quote/list children; code & captions too.

### Q4 — Paginated-mode selection contract?

| Option | Description | Selected |
|--------|-------------|----------|
| Bind to visible page fragment only | Selection binds to PageFragmentView via data-block-index; hidden measurement ArticleBody is user-select:none. | ✓ |
| Allow selection in a dedicated annotation mode | Temp multi-page selection mode; collides with single-block rule. | |
| You decide | Defer mechanics to researcher/UI-SPEC. | |

**User's choice:** Bind to visible page fragment only.

---

## Notes + view/edit/navigate surface (ANNO-02/03/04)

### Q1 — Where do highlights & notes live?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline on highlight + a lightweight list drawer | (a) Inline popover on the highlight; (b) header-mounted slide-over drawer (reuses D2-01 native <dialog>). No new route; not a v2 panel. | ✓ |
| Inline only | Everything on the highlight; fails ANNO-04 navigate-from-annotation. | |
| List drawer only | All management in drawer; highlights render non-interactive inline. | |
| You decide | Defer to UI-SPEC. | |

**User's choice:** Inline on highlight + a lightweight list drawer.

### Q2 — Note attach/edit UX?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline editable note field in the popover | "Highlight + note" opens popover with focused empty textarea; reactivating reopens editable; debounced save (mirrors D2-03). | ✓ |
| Separate note editor route/panel | Dedicated editor; breaks calm on-the-spot model. | |
| Notes only via the list drawer | Authoring only in drawer; inline popover read-only. | |
| You decide | Defer to UI-SPEC. | |

**User's choice:** Inline editable note field in the popover.

### Q3 — Navigate-back behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Close drawer → jump to block + focus highlight | Close drawer; resolve offset to block (D4-10/11 reversed); page-turn or scrollIntoView; focus the highlight. | ✓ |
| Reveal passage, keep focus in drawer | Turn/scroll only; reader must close drawer and find highlight. Less predictable. | |
| You decide | Defer focus/scroll contract to UI-SPEC. | |

**User's choice:** Close drawer → jump to block + focus highlight.

### Q4 — Delete + status feedback?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm-to-delete + concise status announce | Two-step delete (non-destructive default focus, mirrors WipeConfirm); `.status` announces save/edit/delete (A11Y-08). | ✓ |
| Immediate delete + Undo in status | One-tap delete + Undo; misfires on touch; needs undo storage. | |
| You decide | Defer to UI-SPEC. | |

**User's choice:** Confirm-to-delete + concise status announce.

---

## Overlap policy & inline rendering (calm + A11Y-05)

### Q1 — Overlap policy?

| Option | Description | Selected |
|--------|-------------|----------|
| No overlaps — reject overlapping new selection | Disjoint ranges only; reject with hint. Simplest storage/rendering; calmest. | ✓ |
| Allow overlaps / nesting | Permit overlapping/nested; stacked/blended rendering + range-intersection storage. Heaviest; hard under forced-colors. | |
| Allow nesting only (full containment) | Permit full containment, reject partial. Middle path; still needs nested rendering. | |
| You decide | Defer to researcher. | |

**User's choice:** No overlaps — reject overlapping new selection.

### Q2 — Color / visual treatment?

| Option | Description | Selected |
|--------|-------------|----------|
| Single calm color + note glyph | One warm marker for all; note-bearing distinguished by glyph. Single `--highlight` token; trivially forced-colors-safe. | ✓ |
| Fixed multi-color palette, reader-chosen | 3-color picker per highlight. More expressive; adds control + forced-colors complexity. | |
| You decide | Defer exact color to UI-SPEC. | |

**User's choice:** Single calm color + note glyph.

### Q3 — Inline highlight a11y contract?

| Option | Description | Selected |
|--------|-------------|----------|
| `<mark>` + tabindex 0 + aria, forced-colors restyle | `<mark>` wrapped focusable; aria-label + note presence + haspopup; forced-colors gate restyles via --highlight token. | ✓ |
| Non-focusable visual marks; access only via drawer | Pure CSS background span; inline marks not focusable. Weaker A11Y-01/02. | |
| You decide | Defer element/ARIA to UI-SPEC + researcher. | |

**User's choice:** `<mark>` + tabindex 0 + aria, forced-colors restyle.

### Q4 — Cross-fragment rendering (split block)?

| Option | Description | Selected |
|--------|-------------|----------|
| Render on each fragment containing part of the range | Each fragment gets its own `<mark>` slice; partial marks on both pages; popover reachable from either. No silent gaps. | ✓ |
| Render only on the start-offset page | Trailing portion unmarked on next page; highlight "disappears" at page turn. Confusing. | |
| You decide | Defer slicing mechanics to researcher. | |

**User's choice:** Render on each fragment containing part of the range.

---

## the agent's Discretion

- Exact numeric confidence thresholds (D5-02) — empirical; researcher validates against the 6-fixture corpus under simulated edits.
- Context radius tuning (D5-03) — 32-grapheme default ships from Phase 1; tunable.
- Floating-toolbar positioning + lifecycle + swipe-vs-zoom coexistence (D5-05) — UI-SPEC.
- Exact `--highlight` token value + note-glyph design + drawer copy/lifecycle/empty-state (D5-09/D5-14) — UI-SPEC.
- Annotation Zod schema field names + Dexie version strategy (D5-03) — planner confirms vs Pitfall 9.
- `resolveQuoteSelector` implementation internals (D5-02) — contract locked; algorithm is architecture.
- When resolution runs (eager batch on open vs lazy) — planner.
- Performance under many highlights + drawer virtualization — researcher validates; not an MVP budget gate.
- Drawer ordering/filtering beyond reading-order default — UI-SPEC.

## Deferred Ideas

- Dedicated annotation review panel (RECV-01) + explicit anchor-repair tool (RECV-02) → v2.
- Multi-color highlight palette → v2 (rejected for MVP; single calm color).
- Multi-block / cross-page selections → v2 (out of MVP; single-block rule).
- Highlight overlap / nesting → v2 (out of MVP; disjoint ranges only).
- Export/import of highlights & notes (PORT-01/02) → v2.
- Heading navigator and line-focus aid (ORNT-01/02) → v2.
- Formal cold/warm repagination performance budgets (ACPT-04) → Phase 6.
