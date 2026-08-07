// src/reader/annotations/SelectionToolbar.tsx
// Phase 5 Plan 05-02 Task 2 — floating selection toolbar (D5-05, D5-06/D5-13
// invalid hints, UI-SPEC §Interaction 25/34).
//
// STUB (Task 1): this file is created in Task 1 so ArticleView can reference
// selectionRect without an unused-variable error. Task 2 fills in the full
// position:fixed geometry + buttons + invalid hints per UI-SPEC §Interaction
// 25. The toolbar renders null until Task 2 implements it.
interface SelectionToolbarStubProps {
  /** Live selection rect from ArticleView's selectionchange listener. */
  selectionRect?: DOMRect | null;
}

export function SelectionToolbar(_: SelectionToolbarStubProps): null {
  return null;
}
