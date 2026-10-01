import { useState } from "react";
import { restoreStarterArticle } from "../persistence/starterArticleStore";
import { invalidateLibrarySnapshot } from "../ingestion/library/librarySnapshotBus";
import { BusyButton } from "../ui/BusyButton";
import { StatusRegion } from "../ui/StatusRegion";

export function RestoreStarterButton({ onRestored }: { onRestored?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <BusyButton
        className="btn btn-quiet"
        busy={busy}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            await restoreStarterArticle();
            invalidateLibrarySnapshot();
            setMessage("Getting Started restored to your library.");
            onRestored?.();
          } catch {
            setMessage("Couldn't restore Getting Started. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Restore Getting Started
      </BusyButton>
      <StatusRegion>{message && <p>{message}</p>}</StatusRegion>
    </div>
  );
}
