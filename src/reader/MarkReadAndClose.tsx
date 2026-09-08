// src/reader/MarkReadAndClose.tsx
// 260908-oht — the explicit end-of-article completion affordance ("Mark
// read and close"): persists offset = total (the caller's onMarkRead does a
// synchronous FLUSH — unmount cancels pending debounces) and closes through
// the ONE shared leaveArticleToLibrary contract (identical to Back to
// library, Pitfall 7). Native button, visible text label (no aria-label
// indirection), Tab/Shift+Tab + Enter/Space only — no autoFocus, no
// shortcut registration. placement="flow" renders as in-article flow
// content (scrolling mode); placement="page" renders in the fixed bottom
// chrome band (paginated final page — out of the measured page content, so
// mounting it can never change .page-viewport geometry).

import { leaveArticleToLibrary } from "./BackToLibrary";

interface MarkReadAndCloseProps {
  /** Persists offset = total BEFORE navigation (flush, not debounce). */
  onMarkRead: () => void;
  /** App's in-app navigation flag — routes the shared close contract. */
  hasAppHistory: boolean;
  /** "flow" = in-article flow content; "page" = fixed bottom chrome band. */
  placement: "flow" | "page";
}

export function MarkReadAndClose({
  onMarkRead,
  hasAppHistory,
  placement,
}: MarkReadAndCloseProps) {
  const handleClick = () => {
    onMarkRead();
    leaveArticleToLibrary(hasAppHistory);
  };
  return (
    <button
      type="button"
      className={`mark-read-close mark-read-close-${placement}`}
      onClick={handleClick}
    >
      Mark read and close
    </button>
  );
}
