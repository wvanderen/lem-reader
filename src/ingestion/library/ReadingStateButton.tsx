// Quick 260909-ahy — the stale-label regression: `pending` cleared when
// onChange resolved (DB write + snapshot invalidation done) while the parent's
// list reload was still in flight, so the prop-only label briefly showed
// the OLD action ("Saving…" → stale label → correct label). The optimistic
// layer below covers the write→reload window (accessible name flips to the
// target action at click time) and clears on catch-up (isRead matches) or
// error (honest revert to the persisted prop truth + the retry copy).
//
// Issue #67 (locked IA, variant A) — the control is now an ICON button (the
// check-circle glyph) in the row's right-aligned action cluster; the aria-label
// template `${label}: ${title}` is UNCHANGED (every e2e contract
// matches `/^Mark as read:/` etc. against the accessible name, never the
// visible text — the name flips to the TARGET action at click time and
// stays there through the pending window), and `disabled` carries the
// pending state.
//
// Issue #67 review — pending is VISIBLE, not just disabled+opacity: the glyph
// swaps to a spinner arc and the button carries aria-busy while the write is
// in flight. The accessible name deliberately does NOT change (Quick
// 260909-ahy — it stays the target action through the pending window);
// sighted readers get the spinner, screen readers get a stable name + busy
// state + the disabled semantics.
//
// Issue #246 — the ONE correction control generalized to the collection
// detail rows: `labels` renames the action pair (the collections rows read
// "Mark finished" / "Mark unfinished" — the shared completion vocabulary,
// not the library row's read/unread) and `variant="text"` renders the row's
// quiet-text action shape (the membership controls' register) instead of the
// icon glyph. Defaults keep every existing mount byte-identical; the
// optimistic/pending/error discipline is THE SAME machinery (REUSE, DO NOT
// FORK — one correction control, every surface).
import { useEffect, useState } from "react";
import { CheckIcon, SpinnerIcon, UndoIcon } from "../../ui/icons";
// Issue #98 — the ONE polite status-region primitive.
import { StatusRegion } from "../../ui/StatusRegion";

/** The action-pair vocabulary (issue #246 — default stays the library row's
 * read/unread pair; the collection rows pass the finished/unfinished pair). */
export interface ReadingStateLabels {
  readonly mark: string;
  readonly unmark: string;
}

const LIBRARY_LABELS: ReadingStateLabels = { mark: "Mark as read", unmark: "Mark as unread" };

/** Keep storage failures local and keep curation separate from card navigation. */
export function ReadingStateButton({
  title,
  isRead,
  onChange,
  labels = LIBRARY_LABELS,
  variant = "icon",
}: {
  title: string;
  isRead: boolean;
  onChange: (read: boolean) => Promise<void>;
  /** Issue #246 — the visible + spoken action pair (defaults unchanged). */
  labels?: ReadingStateLabels;
  /** "icon" (default) — the library row's glyph button; "text" — the
   * collections row's quiet-text button. */
  variant?: "icon" | "text";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  // Quick 260909-ahy — null = no optimistic write in flight (label
  // authority is the isRead prop); non-null = the clicked target state,
  // bridging the gap between write completion and the parent reload.
  const [optimisticRead, setOptimisticRead] = useState<boolean | null>(null);
  const effectiveRead = optimisticRead ?? isRead;
  // Catch-up clear: the parent reload has landed with the matching state —
  // hand label authority back to the prop.
  useEffect(() => {
    if (optimisticRead !== null && isRead === optimisticRead) {
      setOptimisticRead(null);
    }
  }, [isRead, optimisticRead]);
  const label = effectiveRead ? labels.unmark : labels.mark;
  // THE one write path (both variants): optimistic flip, honest failure
  // revert, pending release — the Quick 260909-ahy discipline.
  const handleClick = async () => {
    setPending(true);
    setError(false);
    setOptimisticRead(!effectiveRead);
    try {
      await onChange(!effectiveRead);
    } catch {
      setError(true);
      setOptimisticRead(null);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="reading-state-control">
      {variant === "icon" ? (
        <button
          type="button"
          className="btn btn-icon reading-state-button"
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label={`${label}: ${title}`}
          title={label}
          onClick={handleClick}
        >
          {pending ? <SpinnerIcon /> : effectiveRead ? <UndoIcon /> : <CheckIcon />}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-quiet collection-entry-completion"
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label={`${label}: ${title}`}
          onClick={handleClick}
        >
          {label}
        </button>
      )}
      {error && (
        // Issue #98 (decision #96) — the polite register app-wide: the ONE
        // StatusRegion primitive (never role="alert" — a save failure is
        // not an urgent assertion). The .meta class composes the inline
        // line register; the shared .reading-state-control .status rules
        // strip the card chrome (an inline error, not a card), and the
        // apostrophe follows the repo's ASCII copy convention. Adjacent to
        // its control (the failure's context).
        <StatusRegion className="meta">Couldn&apos;t save reading status. Try again.</StatusRegion>
      )}
    </div>
  );
}
