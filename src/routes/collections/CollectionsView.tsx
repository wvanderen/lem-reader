// src/routes/collections/CollectionsView.tsx
// Issues #242 — the Collections destination route view (#/collections): the
// reader-named, ordered groupings of whole readings (ADR 0011 — a collection
// references rather than owns; nothing on this surface clones, moves, or
// re-reads a library item). The LibraryView/DiscoverView twin: same page
// shape (<main id="main"> + one h1 + .status live region), the h1 focus-
// on-in-app-navigation discipline, and the state-kind vocabulary through
// the ONE StatusRegion primitive.
//
// Locked shapes rendered here:
//   - The create form is ALWAYS visible (the Discover subscribe-form
//     discipline — the form IS the surface's first action); a refused
//     or failed create preserves the typed name for retry (the D16-11
//     input-preservation rule), and success clears + announces.
//   - The list sorts most-recently-updated first (the store seam's
//     updatedAt sort — a renamed or extended collection floats up).
//   - Each row: the name as the link into the detail view, an honest
//     count line, and Rename (the one destructive-adjacent action this
//     slice ships — a native button opening the rename dialog; reorder +
//     membership edits are issues #243's slices).
//   - No-content state (whole list empty): title + one sentence inviting
//     the first action — the create form above IS it (the sanctioned
//     static-anatomy exception; the .collections-empty collapse variant).
//   - Error state: the load FAILED, named honestly with a next step.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { setDocumentTitle } from "../../ingestion/library/pageMeta";
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { createCollection, listCollections } from "../../persistence/collectionsStore";
import type { Collection } from "../../content/schema";
import { RenameCollectionDialog } from "./RenameCollectionDialog";

type LoadStatus = "loading" | "ready" | "error";

export function CollectionsView({ hasAppHistory }: { hasAppHistory: boolean }) {
  // ── Load state ─────────────────────────────────────────────────────────
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [collections, setCollections] = useState<Collection[]>([]);

  /** Re-read the store and swap the list in (the DiscoverView reload
   * shape — the mount effect and the post-write reloads share it). */
  const reload = async (): Promise<void> => {
    const result = await listCollections();
    if (result.ok) {
      setCollections(result.collections);
      setLoadStatus("ready");
    } else {
      setLoadStatus("error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: `reload` closes over stable setters (the LibraryView
    // load-effect shape).
  }, []);

  // The h1 focus announces the view switch (the ReviewView/DiscoverView
  // twin — focus fires ONLY on an in-app navigation; the focused h1 IS
  // the communication, D14-09).
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setDocumentTitle("Collections");
    if (hasAppHistory) h1Ref.current?.focus();
  }, [hasAppHistory]);

  // ── Create form state ──────────────────────────────────────────────────
  const [nameValue, setNameValue] = useState("");
  const [creating, setCreating] = useState(false);
  // The shared announcement region: creations, renames, and failures.
  // Never unmounts (a live region must pre-exist).
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = nameValue.trim();
    if (creating || trimmed.length === 0) return;
    setCreating(true);
    try {
      const created = await createCollection(trimmed);
      // Success clears the input for the next name; a FAILURE preserves it
      // for retry (the D16-11 discipline — the refusal is not a wipe).
      setNameValue("");
      setMessage(`Created “${created.name}”.`);
      await reload();
    } catch {
      setMessage("Couldn't create the collection. Try again.");
    } finally {
      setCreating(false);
    }
  }

  // ── Rename state ───────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<Collection | null>(null);

  return (
    <main id="main">
      <header className="library-header collections-header">
        <h1 ref={h1Ref} tabIndex={-1}>
          Collections
        </h1>
      </header>
      {/* The ONE announcement region — creation/rename outcomes, progress,
          and the load failure. Collapsed via CSS when idle (:empty). */}
      <StatusRegion>
        {message !== null && <p>{message}</p>}
        {loadStatus === "loading" && <p>Opening your collections…</p>}
        {loadStatus === "error" && (
          <>
            <h2>Couldn't open your collections.</h2>
            <p>Reload the page to try again.</p>
          </>
        )}
      </StatusRegion>
      {/* The create form — always visible, the surface's first action.
          Native label + text input (the Discover subscribe-form anatomy). */}
      <form className="collections-create-form" onSubmit={handleCreate}>
        <label htmlFor="collections-new-name">New collection</label>
        <div className="collections-create-controls">
          <input
            id="collections-new-name"
            name="name"
            type="text"
            autoComplete="off"
            placeholder="Reading plan, essays, …"
            value={nameValue}
            disabled={creating}
            onChange={(e) => setNameValue(e.target.value)}
          />
          <BusyButton
            type="submit"
            busy={creating}
            className="btn btn-primary collections-create-button"
            disabled={nameValue.trim().length === 0}
          >
            Create
          </BusyButton>
        </div>
        <p className="meta">An ordered list of your readings — they stay in your library.</p>
      </form>
      {loadStatus === "ready" && collections.length === 0 ? (
        /* No-content state — title at the surface's outline level + one
           sentence; invites the first action (the form above IS it). */
        <StatusRegion className="collections-empty">
          <h2>No collections yet.</h2>
          <p>Name one above, then add articles and books to it.</p>
        </StatusRegion>
      ) : loadStatus === "ready" ? (
        /* The collection list — most-recently-updated first. */
        <section className="library-section" aria-labelledby="collections-list-heading">
          <h2 id="collections-list-heading">Your collections</h2>
          <ul className="collections-list">
            {collections.map((c) => {
              const count = c.entries.length;
              return (
                <li key={c.id} className="collection-card">
                  <div className="collection-card-main">
                    <h3 id={`collection-name-${c.id}`}>
                      <a className="collection-card-link" href={`#/collections/${c.id}`}>
                        {c.name}
                      </a>
                    </h3>
                    <p className="meta">
                      {count === 0
                        ? "No readings yet"
                        : `${count} ${count === 1 ? "reading" : "readings"}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-quiet collection-rename-button"
                    onClick={() => setRenameTarget(c)}
                    aria-haspopup="dialog"
                  >
                    Rename
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <RenameCollectionDialog
        open={renameTarget !== null}
        collection={renameTarget}
        onSaved={(updated) => {
          setRenameTarget(null);
          setMessage(`Renamed to “${updated.name}”.`);
          void reload();
        }}
        onCancel={() => setRenameTarget(null)}
      />
    </main>
  );
}
