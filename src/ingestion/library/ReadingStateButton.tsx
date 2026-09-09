// Quick 260909-ahy — the stale-label regression: `pending` cleared when
// onChange resolved (DB write + refreshKey bump done) while the parent's
// list reload was still in flight, so the prop-only label briefly showed
// the OLD action ("Saving…" → stale label → correct label). The optimistic
// layer below covers the write→reload window (accessible name flips to the
// target action at click time) and clears on catch-up (isRead matches) or
// error (honest revert to the persisted prop truth + the retry copy).
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
        {pending ? "Saving…" : label}
      </button>
      {error && (
        <p className="meta" role="alert">
          Couldn’t save reading status. Try again.
        </p>
      )}
    </div>
  );
}
