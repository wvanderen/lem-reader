// src/routes/collections/CollectionsView.tsx
// Issues #242/#243 — the Collections destination route view (#/collections):
// the reader-named, ordered groupings of whole readings (ADR 0011 — a
// collection references rather than owns; nothing on this surface clones,
// moves, or re-reads a library item). The LibraryView/DiscoverView twin:
// same page shape (<main id="main"> + one h1 + .status live region), the
// h1 focus-on-in-app-navigation discipline, and the state-kind vocabulary
// through the ONE StatusRegion primitive.
//
// Locked shapes rendered here:
//   - The create form is ALWAYS visible (the Discover subscribe-form
//     discipline — the form IS the surface's first action); a refused
//     or failed create preserves the typed name for retry (the D16-11
//     input-preservation rule), and success clears + announces.
//   - The list sorts most-recently-updated first (the store seam's
//     updatedAt sort — a renamed or extended collection floats up).
//   - Each row: the name as the link into the detail view, an honest
//     count line, Rename, and — issue #243 — Delete (the destructive
//     action opens the DeleteCollectionConfirm dialog; the seam write is
//     grep-isolated inside the dialog file). After a LANDED delete the
//     focus hands off to the NEIGHBOR CARD'S TITLE LINK (re-orientation —
//     never a destructive control; an accidental Enter must not delete
//     the next collection), else the previous card, else — the list just
//     emptied — the always-visible New collection input (the honest
//     no-content state's invitation).
//   - No-content state (whole list empty): title + one sentence inviting
//     the first action — the create form above IS it (the sanctioned
//     static-anatomy exception; the .collections-empty collapse variant).
//   - Error state: the load FAILED, named honestly with a next step.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { setDocumentTitle } from "../../ingestion/library/pageMeta";
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { captureRowNeighbors, connectedNeighbor, type RowNeighbors } from "../../ui/rowNeighbors";
import { createCollection, listCollections } from "../../persistence/collectionsStore";
import type { Collection } from "../../content/schema";
import { RenameCollectionDialog } from "./RenameCollectionDialog";
import { DeleteCollectionConfirm } from "./DeleteCollectionConfirm";

type LoadStatus = "loading" | "ready" | "error";

export function CollectionsView({ hasAppHistory }: { hasAppHistory: boolean }) {
  // ── Load state ─────────────────────────────────────────────────────────
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [collections, setCollections] = useState<Collection[]>([]);

  /** Re-read the store and swap the list in. `isCurrent` gates the state
   * writes — the mount effect passes a cancellation check so an unmounted
   * generation never setState (the guarded-guard discipline: the flag is
   * checked WHERE the writes happen, not only around the await); the
   * post-write reloads use the always-current default. */
  const reload = async (isCurrent: () => boolean = () => true): Promise<void> => {
    const result = await listCollections();
    if (!isCurrent()) return;
    if (result.ok) {
      setCollections(result.collections);
      setLoadStatus("ready");
    } else {
      setLoadStatus("error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void reload(() => !cancelled);
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

  // ── Delete state (issue #243) ───────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  // The deletion focus handoff: neighbor cards captured BEFORE the dialog
  // opens (the shared captureRowNeighbors helper; the keyed <li> cards
  // survive the post-delete reload, so a neighbor is still connected).
  const deletedNeighborsRef = useRef<RowNeighbors>({ after: null, before: null });
  // The create input — the focus fallback when the deletion empties the
  // list (the no-content state's first action; never a destructive
  // control — see the focus-handoff note in the header).
  const createInputRef = useRef<HTMLInputElement>(null);

  /** The Delete button's request path: capture this card's neighbors, then
   * open the confirm dialog. NO write here (Pitfall 8 — the seam call
   * lives in the dialog's destructive handler). */
  function requestDelete(c: Collection, trigger: HTMLButtonElement): void {
    deletedNeighborsRef.current = captureRowNeighbors(trigger, "li.collection-card");
    setDeleteTarget(c);
  }

  // The delete focus handoff rides a STATE-DRIVEN effect, deliberately:
  // handleDeleted's setDeleteTarget(null) closes the modal in the SAME
  // commit, and React runs child effects before parent effects — so by
  // the time this effect fires, the dialog's open-prop mirror has already
  // dlg.close()d. A direct focus() inside handleDeleted races the close:
  // while the modal is open the rest of the document is INERT, and
  // Firefox silently refuses focus() on inert content (Chromium's
  // different scheduler merely masked it).
  const [deleteFocusHandoff, setDeleteFocusHandoff] = useState(false);
  useEffect(() => {
    if (!deleteFocusHandoff) return;
    setDeleteFocusHandoff(false);
    const neighbor = connectedNeighbor(deletedNeighborsRef.current);
    deletedNeighborsRef.current = { after: null, before: null };
    // The neighbor card's TITLE LINK — re-orientation on the collection
    // the reader is now oriented on, never a destructive control (an
    // accidental Enter must not delete the next collection). The list
    // just emptied → the always-visible New collection input (the honest
    // no-content state's first action).
    const link = neighbor?.querySelector<HTMLElement>("a.collection-card-link");
    if (link) {
      link.focus();
      return;
    }
    createInputRef.current?.focus();
  }, [deleteFocusHandoff]);

  /** The dialog's onConfirm — the deleteCollection write has ALREADY
   * resolved (the dialog fires onConfirm only after a landed write). The
   * focus handoff arms here but lands in the effect above; the
   * canceled/failed paths never arm it (Pitfall 1 restores the trigger). */
  async function handleDeleted(): Promise<void> {
    const name = deleteTarget?.name ?? "collection";
    // Close FIRST (this commit's child effects run the dialog's open-prop
    // mirror → dlg.close(); the document is never inert afterwards), then
    // settle the list, THEN arm the handoff — focus lands once, on the
    // final DOM, and no later render (the doomed card unmounting) can
    // interleave between the focus call and its result.
    setDeleteTarget(null);
    setMessage(`Deleted “${name}”. Its readings stay in your library.`);
    await reload();
    setDeleteFocusHandoff(true);
  }

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
            ref={createInputRef}
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
                  <div className="collection-card-actions">
                    <button
                      type="button"
                      className="btn btn-quiet collection-rename-button"
                      onClick={() => setRenameTarget(c)}
                      aria-haspopup="dialog"
                    >
                      Rename
                    </button>
                    {/* Issue #243 — the destructive action opens the confirm
                        dialog; the deleteCollection write is grep-isolated
                        inside DeleteCollectionConfirm (Pitfall 8). */}
                    <button
                      type="button"
                      className="btn btn-quiet collection-delete-button"
                      onClick={(e) => requestDelete(c, e.currentTarget)}
                      aria-haspopup="dialog"
                    >
                      Delete
                    </button>
                  </div>
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
      <DeleteCollectionConfirm
        open={deleteTarget !== null}
        collection={deleteTarget}
        onConfirm={handleDeleted}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
