// src/reader/annotations/highlightMarks.ts
// Issue #175 — the ONE DOM-resolution helper set for a highlight's rendered
// <mark> elements. Three readers share it:
//
//   - HighlightControls (the lightweight controls surface): resolves the
//     anchor mark for positioning + the focus handoffs (activation focuses
//     INTO the controls; the dialog-opening actions focus the MARK first so
//     the dialog's Pitfall-1 trigger capture restores focus to the highlight,
//     per the acceptance criteria "closing note editing returns to highlight
//     controls with focus on the highlight").
//   - NotePopover: the post-delete focus restore (issue #174 — the <mark>
//     unmounts, so the close path focuses the containing block instead).
//   - ArticleView / useSelectionToolbar: mark activation handlers.
//
// Measurement-clone discipline: a paginated article keeps a hidden
// .article-body-measurement ArticleBody mounted (D5-08) whose marks share the
// same data-highlight-id. Every helper here skips marks inside that clone —
// the resolveTocDestination rule that geometry/focus decisions read the
// VISIBLE reading surface, never the measurement body.

/**
 * The highlight's first VISIBLE mark on the live reading surface, or null.
 * Paginated fragments may not show every slice; the first non-measurement
 * mark in document order is the canonical anchor (it is the span-start slice
 * on the mounted surface by construction — the `hl-<id>` first-slice rule).
 */
export function visibleMarkForId(highlightId: string): HTMLElement | null {
  const marks = document.querySelectorAll<HTMLElement>(
    `mark.highlight[data-highlight-id="${highlightId}"]`,
  );
  for (const mark of marks) {
    if (mark.closest(".article-body-measurement")) continue;
    return mark;
  }
  return null;
}

/**
 * Focus the highlight's visible mark (marks carry tabindex="0" — the
 * InlineRenderer/BlockRenderer anatomy) and return it. Returns null when no
 * visible mark exists (e.g. a jsdom unit render without a surface) — callers
 * degrade gracefully (the dialog's trigger-capture restore still works).
 */
export function focusHighlightMark(highlightId: string): HTMLElement | null {
  const mark = visibleMarkForId(highlightId);
  mark?.focus();
  return mark;
}

/**
 * Issue #174 — the highlight's VISIBLE containing block ([data-block-index])
 * for the post-delete focus restore. The <mark> unmounts on deletion, so the
 * close path focuses THIS block — the reader stays at the passage, never
 * dropped to the article top. Returns null when no visible mark exists; the
 * close path then falls back to the plain trigger restore.
 */
export function captureDeleteFocusTarget(highlightId: string): HTMLElement | null {
  return visibleMarkForId(highlightId)?.closest<HTMLElement>("[data-block-index]") ?? null;
}

/**
 * Issue #175 — the ONE immediate-delete routine shared by the reader's two
 * Delete entry points (HighlightControls' no-note path and the drawer's
 * no-note path): run the write, then keep focus NEAR THE PASSAGE (the
 * captured containing block — never the article top; the programmatic-focus
 * tabindex="-1" discipline). Resolves true when the delete landed; false on
 * a rejected write (the hook rolled back in memory + routed the error to
 * StorageBanner — the caller decides the surface's own failure register).
 */
export async function deleteHighlightNearPassage(
  deleteHighlight: (id: string) => Promise<void>,
  highlightId: string,
): Promise<boolean> {
  // Capture the passage block BEFORE the optimistic removal unmounts the
  // <mark> (after the await, the mark is gone from the DOM).
  const focusTarget =
    captureListDeleteFocusTarget(document.activeElement as HTMLElement | null) ??
    captureDeleteFocusTarget(highlightId);
  try {
    await deleteHighlight(highlightId);
  } catch {
    return false;
  }
  if (focusTarget) {
    if (!focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1");
    focusTarget.focus();
  }
  return true;
}

/** Capture a surviving neighbor before deletion unmounts a list action. */
export function captureListDeleteFocusTarget(trigger: HTMLElement | null): HTMLElement | null {
  const item = trigger?.closest(".drawer-item, .review-item");
  if (!item) return null;
  const next = item.nextElementSibling?.querySelector<HTMLElement>(
    "button:not(:disabled), a[href]",
  );
  const previous = item.previousElementSibling?.querySelector<HTMLElement>(
    "button:not(:disabled), a[href]",
  );
  return (
    next ?? previous ?? item.closest("dialog, main")?.querySelector<HTMLElement>("h2, h1") ?? null
  );
}
