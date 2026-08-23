# Phase 10: Annotation Review Panel — Discussion Log

**Date:** 2026-08-15
**Mode:** Delegated (user dismissed interactive gray-area selection, said "continue"; `mode: yolo`)

## How decisions were made

The user was presented the four gray areas (surface & navigation, list layout
& rows, filter & sort, curation actions) via the standard multi-select
question and dismissed it, responding "continue" — consistent with the
session's standing delegation pattern (Phase 9 UAT items were similarly
delegated). Per that delegation, the agent selected ALL areas and decided
each, citing a prior-phase precedent for every choice. The user can edit
`10-CONTEXT.md` directly before planning.

## Areas and outcomes

| Area | Question | Options considered | Decision (precedent) |
|---|---|---|---|
| Surface & navigation | Route vs modal; entry point; back-to-panel | (a) third hash route `#/review` (b) modal over library | **D10-01 route** — browser-back gives SC#2 bidirectionality free; D2-01's two-view rule was about Settings-as-panel, not a route cap. **D10-02** LibraryView header entry button. **D10-03** jump via `#/article/<id>/h/<hid>` suffix + existing D5-11 machinery + replaceState strip |
| List layout & rows | Flat vs grouped; row anatomy; orphans | (a) grouped by article (b) flat chronological | **D10-04 grouped** (D9-07 export grouping twin); **D10-05** orphan ghost group (D9-09 never-drop); **D10-06** drawer-entry whole-row buttons; **D10-07** badges only on ambiguous/orphan with honesty legend |
| Filter & sort | Control vocabulary; defaults; empty states | chips vs selects per dimension | **D10-08** TagFilter chips + article select + confidence select; sort select, Date default; **D10-09** pure filterLibrary-style derivation; **D10-10** two honest empty states via `.status` |
| Curation | Edit/delete affordances; confirm; orphan handling | inline edit vs sub-page; confirm vs swipe | **D10-11** NotePopover inline pattern; **D10-12** RemoveConfirm dialog (cascade note, Pitfall 8 proceed-only write); **D10-13** tri-state re-derived on load, memoized (Phase 9 conflicts pattern); RECV-02 repair stays deferred |

## Scope guardrail notes

Deferred as out-of-scope when they arose during analysis: bulk actions,
export-from-panel (duplicate of Settings export), quote full-text search,
RECV-02 anchor repair. All recorded in CONTEXT.md `<deferred>`.

## Key scout discovery

`AnnotationsDrawer` (Phase 5, 05-03) already implements the per-article
version of nearly everything SC#1–SC#4 asks for cross-article: list with
whole-row jump buttons using the D5-11 machinery, note edit via popover,
delete, empty state. The panel is its cross-article generalization — this
materially de-risks the phase and drove the row/jump/curation decisions.
