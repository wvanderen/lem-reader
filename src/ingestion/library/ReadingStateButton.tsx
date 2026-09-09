import { useState } from "react";

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
  const label = isRead ? "Mark as unread" : "Mark as read";
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
          try {
            await onChange(!isRead);
          } catch {
            setError(true);
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
