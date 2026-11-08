// src/routes/collections/CollectionEndNav.tsx
// Issue #247 — the ONE end-of-entry card: the collection/entry orientation
// line ("From “<name>” · reading k of n") plus the EXPLICIT Next reading
// action at the entry's true end. Never chrome that acts on its own: page
// turns and read-aloud stop here (the #244/#239 stop machinery is
// untouched) — the card's button is the only way the collection advances.
//
// Placement mirrors MarkReadAndClose (the issue-260908-oht end affordance):
// placement="flow" renders as in-article flow content (scrolling mode);
// placement="page" renders in the fixed bottom chrome band (paginated final
// page — outside the measured page content, so mounting it can never change
// .page-viewport geometry). Chapter-assignment ends render it adjacent to
// the AssignmentEndNav card (the continue-the-underlying-work option stays
// intact — issue #247 AC).
//
// Orientation without scheduling or media-player chrome: one calm line, one
// quiet button. The button's visible label names the action; its accessible
// name carries the destination title (the ONE name the screen reader
// speaks — the chapter-nav naming discipline).
import { useState } from "react";
import type { CollectionReadingContext } from "./continueCollection";

interface CollectionEndNavProps {
  context: CollectionReadingContext;
  placement: "flow" | "page";
  /** The Next-reading press: persists the new active entry (navigation
   * context — never a passage position) and navigates to the next entry's
   * resolved route carrying the new /col/ context. */
  onNext: (context: CollectionReadingContext) => void;
}

export function CollectionEndNav({ context, placement, onNext }: CollectionEndNavProps) {
  // One-press guard: a double-press must not double-advance (the second
  // press lands on the SAME route — the hash assignment is idempotent — but
  // the active-entry write is worth guarding anyway).
  const [advancing, setAdvancing] = useState(false);
  const next = context.next;
  return (
    <nav
      className={`collection-end-nav${placement === "page" ? " chapter-nav-page" : ""}`}
      aria-label="Collection position"
    >
      <p className="collection-end-line">
        From “{context.collectionName}” · reading {context.position} of {context.count}
      </p>
      {next !== null ? (
        <button
          type="button"
          className="btn btn-quiet chapter-next collection-next"
          disabled={advancing}
          onClick={() => {
            if (advancing) return;
            setAdvancing(true);
            onNext(context);
          }}
        >
          Next reading
          {next.title && <span className="chapter-nav-title"> {next.title}</span>}
        </button>
      ) : context.allFinished ? (
        // Final-entry completion: the plan is done — show completion instead
        // of offering a next step (never a silent restart).
        <p className="collection-end-complete">You’ve finished this collection.</p>
      ) : null}
    </nav>
  );
}
