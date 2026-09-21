// Quick 260909-ahy — the stale-label regression: `pending` cleared when
// onChange resolved (DB write + snapshot invalidation done) while the parent's
// list reload was still in flight, so the prop-only label briefly showed
// the OLD action ("Saving…" → stale label → correct label). The optimistic
// layer below covers the write→reload window (accessible name flips to the
// target action at click time) and clears on catch-up (isRead matches) or
// error (honest revert to the persisted prop truth + the retry copy).
//
// Issue #67 (locked IA, variant A) — the control is now an ICON button (the
// check-circle glyph) in the row's right-aligned action cluster; the
// aria-label template `${label}: ${title}` is UNCHANGED (every e2e contract
// matches `/^Mark as read:/` etc. against the accessible name, never the
// visible text — the name flips to the TARGET action at click time and
// stays there through the pending window), and `disabled` carries the
// pending state.
import { useEffect, useState } from "react";

/** Keep storage failures local and keep curation separate from card navigation. */
export function ReadingStateButton({
  title,
  isRead,
  onChange,
}: {
  title: string;
  isRead: boolean;
  onChange: (read: boolean) => Promise<void>;
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
  const label = effectiveRead ? "Mark as unread" : "Mark as read";
  return (
    <div className="reading-state-control">
      <button
        type="button"
        className="reading-state-button"
        disabled={pending}
        aria-label={`${label}: ${title}`}
        onClick={async () => {
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
        }}
      >
        <CheckIcon aria-hidden="true" />
      </button>
      {error && (
        <p className="meta" role="alert">
          Couldn’t save reading status. Try again.
        </p>
      )}
    </div>
  );
}

/**
 * Issue #67 — check-circle glyph for the mark-read affordance. Clones the
 * TrashIcon/EditIcon anatomy (20×20, 24-unit viewBox, currentColor stroke,
 * round caps/joins, aria-hidden + focusable=false): decorative, so the
 * button's aria-label carries the full accessible name.
 */
function CheckIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      {/* circle with a check — one glyph, two states via the aria-label */}
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  );
}
