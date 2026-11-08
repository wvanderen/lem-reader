// src/routes/collections/CollectionDetailView.tsx
// Issue #242 — one collection's detail view (#/collections/<id>): the
// ordered entries, each openable at the reading's normal SHARED saved
// location (ADR 0001 — opening an entry uses the same resume the library
// uses; no plan-specific passage position exists or may exist), plus the
// add-membership affordance.
//
// Locked shapes rendered here:
//   - The h1 IS the collection name (the h1 focus-on-in-app-navigation
//     discipline announces it; the detail view re-reads the store on
//     mount — the ReviewView derive-from-Dexie shape).
//   - The entries render as an ORDERED list — the list marker is the
//     collection order; no separate numbering control exists (reorder +
//     removal are issue #243's slices).
//   - Entry rows resolve through the ONE collectionEntryHref derivation
//     (the BookRow resume-chapter pointer for books); a row whose target
//     is absent from the library renders honestly UNLINKED ("No longer in
//     your library") — never a dead link, never a silent omission (the
//     issue #245 delete-confirmation flow supersedes the prevention side).
//   - Honest page states through StatusRegion: loading, a missing or failed
//     collection/library load, and the no-content collection. Add outcomes
//     belong to the active dialog, not the inert page behind it.
//
// Issue #243 — membership editing on the SAME page:
//   - Each entry row carries its own Move up / Move down / Remove controls
//     — buttons work identically by pointer AND keyboard (the AC's "both
//     interaction methods"; drag is deliberately NOT offered — the AC
//     allows it but it cannot be the only method, and buttons are the one
//     method both inputs share, with per-control position in the accessible
//     name as the orientation feedback).
//   - Boundary honesty: the first row's Move up and the last row's Move
//     down are DISABLED (the boundary is visible before it is pressed).
//   - The move/remove writes go through the store seam's ONE transaction
//     (moveCollectionEntry / removeCollectionEntry) — collection-row-only
//     writes (ADR 0011): editing the arrangement can never touch a
//     reading, position, highlight, note, or completion row.
//   - Outcomes announce through the page's ONE StatusRegion (the polite
//     register pre-exists). Focus after a MOVE stays on the same control
//     (the row keeps its React key — the reader can keep pressing);
//     focus after a REMOVE hands off to the neighbor row's TITLE LINK
//     (re-orientation on the reading — never a destructive control; an
//     accidental Enter must not remove the next entry), else the previous
//     row, else — the collection just emptied — the stable Add affordance
//     (the ReviewView focusNearRemovedRow shape, retargeted to links).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setDocumentTitle } from "../../ingestion/library/pageMeta";
import { StatusRegion } from "../../ui/StatusRegion";
import { captureRowNeighbors, connectedNeighbor, type RowNeighbors } from "../../ui/rowNeighbors";
import { useLibrarySnapshot } from "../../ingestion/library/useLibrarySnapshot";
import {
  CollectionCorruptError,
  getCollection,
  moveCollectionEntry,
  removeCollectionEntry,
} from "../../persistence/collectionsStore";
import type {
  MoveCollectionEntryOutcome,
  RemoveCollectionEntryOutcome,
} from "../../persistence/collectionsStore";
import { resolveCollectionEntry } from "./collectionEntries";
import type { CollectionEntryLookup } from "./collectionEntries";
import type { Collection, CollectionEntry } from "../../content/schema";
import { AddReadingDialog } from "./AddReadingDialog";

type LoadStatus = "loading" | "ready" | "missing" | "error";

export function CollectionDetailView({
  collectionId,
  hasAppHistory,
}: {
  collectionId: string;
  hasAppHistory: boolean;
}) {
  // The ONE library read model — titles, book resume pointers, and the
  // add-picker's rows all read the same settled snapshot.
  const { status: libraryStatus, snapshot } = useLibrarySnapshot();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [collection, setCollection] = useState<Collection | null>(null);

  const reload = async (isCurrent: () => boolean = () => true): Promise<void> => {
    // The view owns the load-state routing: a Dexie-level failure lands in
    // the honest error state ("Couldn't open this collection.") — never an
    // unhandled rejection stuck on the loading line (getCollection follows
    // the getBook contract and propagates; the caller catches). `isCurrent`
    // gates every state write — an unmounted generation never setState.
    try {
      const loaded = await getCollection(collectionId);
      if (!isCurrent()) return;
      if (loaded === null) {
        setLoadStatus("missing");
        return;
      }
      setCollection(loaded);
      setLoadStatus("ready");
    } catch {
      if (!isCurrent()) return;
      setLoadStatus("error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void reload(() => !cancelled);
    return () => {
      cancelled = true;
    };
    // Mount-only per collectionId: `reload` closes over stable setters
    // (the LibraryView load-effect shape; the id change remounts the load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  const h1Ref = useRef<HTMLHeadingElement>(null);
  // Focus ONCE per mount, once the collection is ready (the focused h1 IS
  // the view-switch announcement, D14-09). The `collection` state keeps
  // changing after adds — a re-focus on every add would steal focus mid-
  // task, so the once-guard is load-bearing.
  const focusedRef = useRef(false);
  useEffect(() => {
    setDocumentTitle(collection !== null ? collection.name : "Collections");
    if (hasAppHistory && !focusedRef.current && loadStatus === "ready") {
      focusedRef.current = true;
      h1Ref.current?.focus();
    }
  }, [hasAppHistory, loadStatus, collection]);

  // The lookup the ONE entry derivation consumes (pure maps over the ONE
  // snapshot — no re-fold, the BookRow input discipline).
  const lookup = useMemo<CollectionEntryLookup>(
    () => ({
      articlesById: new Map(snapshot.articles.map((a) => [a.id, a])),
      booksById: new Map(snapshot.books.map((b) => [b.id, b])),
      chaptersByBookId: snapshot.chaptersByBook,
      latestLocationByArticleId: snapshot.latestLocationByArticleId,
    }),
    [snapshot],
  );

  // ── Add-dialog state ───────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);

  // ── Membership-editing state (issue #243) ─────────────────────────────
  // The ONE polite register for membership outcomes (moves, removals,
  // failures) — the same region the load states use (it pre-exists, so
  // the announcement is heard; idle it collapses via :empty).
  const [announcement, setAnnouncement] = useState<string | null>(null);
  // The in-flight register: while ONE membership write runs, every row's
  // edit controls are disabled (a calm, serial editing session — a
  // collection put is a few milliseconds; no reader-visible queueing).
  const [editPending, setEditPending] = useState(false);
  // The post-commit focus handoff. Chromium BLURS a focused button the
  // moment it becomes disabled — so a move that lands its entry at a
  // boundary (disabling the pressed control) must re-focus deliberately:
  // the same entry's control in the direction of travel, or — when that
  // one disabled itself — its opposite control. Removal hands to the
  // captured neighbor's title link. Set after the write lands; consumed
  // by the effect BELOW once React commits the reorder (effects run after
  // the DOM update — never a race against the keyed row swap).
  type FocusHandoff =
    | { kind: "move"; entryId: string; direction: "up" | "down" }
    | { kind: "removed" }
    | { kind: "retry"; trigger: HTMLButtonElement };
  const [focusHandoff, setFocusHandoff] = useState<FocusHandoff | null>(null);
  // The removal focus handoff (the ReviewView removedRowNeighborsRef
  // shape, via the SHARED captureRowNeighbors helper): the neighbor rows
  // captured BEFORE the write — the keyed <li>s survive the state swap,
  // so a neighbor is still connected after the removal re-render lands.
  const removedNeighborsRef = useRef<RowNeighbors>({ after: null, before: null });
  // The stable add affordance — the focus fallback when the removal
  // empties the collection (the honest empty state's invitation).
  const addButtonRef = useRef<HTMLButtonElement>(null);

  /** The removal handoff target: the neighbor's TITLE — the reading the
   * reader is now oriented on — never a destructive control (an accidental
   * Enter must not remove the next entry). Unlinked neighbors carry
   * tabIndex=-1 on their honesty line so the handoff lands uniformly.
   * Refs-only body → stable across renders (the effect consumes it). */
  const focusNearRemovedEntry = useCallback((): void => {
    const neighbor = connectedNeighbor(removedNeighborsRef.current);
    removedNeighborsRef.current = { after: null, before: null };
    const target = neighbor?.querySelector<HTMLElement>(
      "a.collection-entry-link, .collection-entry-unavailable",
    );
    if (target) {
      target.focus();
      return;
    }
    addButtonRef.current?.focus();
  }, []);

  // Consume the handoff AFTER the commit. The move branch prefers the
  // control in the direction of travel while it is enabled; at the landed
  // boundary it disabled itself, so the OPPOSITE control (always enabled
  // there) takes focus — the reader stays on their entry either way.
  useEffect(() => {
    if (focusHandoff === null) return;
    if (focusHandoff.kind === "move") {
      const row = document.querySelector<HTMLElement>(
        `li.collection-entry[data-entry-id="${focusHandoff.entryId}"]`,
      );
      const other = focusHandoff.direction === "up" ? "down" : "up";
      const preferred = row?.querySelector<HTMLButtonElement>(
        `[data-direction="${focusHandoff.direction}"]`,
      );
      const fallback = row?.querySelector<HTMLButtonElement>(`[data-direction="${other}"]`);
      const target =
        preferred !== null && preferred?.disabled === false
          ? preferred
          : fallback !== null && fallback?.disabled === false
            ? fallback
            : null;
      target?.focus();
    } else if (focusHandoff.kind === "removed") {
      focusNearRemovedEntry();
    } else {
      const { trigger } = focusHandoff;
      // Disabling the pressed control can blur it to body. Restore only
      // that lost focus, never a reader's deliberate move elsewhere.
      if (document.activeElement === document.body && trigger.isConnected && !trigger.disabled) {
        trigger.focus();
      }
    }
    setFocusHandoff(null);
  }, [focusHandoff, focusNearRemovedEntry]);

  /** One membership write, shared by both controls: runs the seam call,
   * swaps the collection in ONLY on a landed write (issue #98 — never a
   * success lie), announces the outcome, and re-syncs the view when the
   * store says the view's copy is stale (another tab edited the same
   * collection). Storage failures announce the honest error and leave
   * the persisted row — and this view's copy of it — untouched (AC:
   * "save failures leave valid persisted state intact"). Returns the
   * outcome (null on a storage failure) so the caller can act on a
   * LANDED removal only — the focus handoff must not fire for a failed
   * or stale-path write. The store's discriminated unions pass through
   * INTACT — callers compare typed outcomes, never strings. */
  async function runMembershipEdit(
    write: () => Promise<MoveCollectionEntryOutcome | RemoveCollectionEntryOutcome>,
    announceMoved: (collection: Collection) => string,
    failureCopy: string,
  ): Promise<MoveCollectionEntryOutcome | RemoveCollectionEntryOutcome | null> {
    if (!collection || editPending) return null;
    const trigger = document.activeElement;
    let landed = false;
    setEditPending(true);
    try {
      const result = await write();
      if (result.outcome === "moved" || result.outcome === "removed") {
        landed = true;
        setCollection(result.collection);
        setAnnouncement(announceMoved(result.collection));
      } else if (result.outcome === "no-move") {
        // The boundary controls are disabled at the edges, so this path
        // is defensive — honesty still: a calm already-there line, and
        // NO write (the seam never bumped updatedAt for it).
        setAnnouncement("That reading is already at that position.");
      } else {
        // The view's copy is stale (another tab removed the collection or
        // the entry). Re-read the store — the reload routes an absent
        // collection to the honest missing state.
        setAnnouncement("This collection changed in another tab. Refreshing.");
        await reload();
      }
      return result;
    } catch (e) {
      // Two honest failures with different next steps (the AC's "calm next
      // step"): a T-242a corrupt row can NEVER succeed on retry — the calm
      // step is reloading (the reload routes the unparseable row to the
      // honest missing state) — while a storage failure keeps the retry
      // loop honest. Neither claims a write that did not land.
      if (e instanceof CollectionCorruptError) {
        setAnnouncement("This collection's data couldn't be read. Reload the page.");
      } else {
        setAnnouncement(failureCopy);
      }
      return null;
    } finally {
      setEditPending(false);
      if (!landed && trigger instanceof HTMLButtonElement) {
        setFocusHandoff({ kind: "retry", trigger });
      }
    }
  }

  function handleMove(entry: CollectionEntry, toIndex: number): void {
    const before = collection;
    if (!before || editPending) return;
    const title = resolveCollectionEntry(entry, lookup).title ?? "this reading";
    const direction = toIndex < before.entries.findIndex((e) => e.id === entry.id) ? "up" : "down";
    void runMembershipEdit(
      () => moveCollectionEntry(before.id, entry.id, toIndex),
      (updated) => {
        const index = Math.max(
          0,
          updated.entries.findIndex((e) => e.id === entry.id),
        );
        return `Moved ${direction} — “${title}” is now position ${index + 1} of ${updated.entries.length}.`;
      },
      `Couldn't move “${title}”. Try again.`,
    ).then((result) => {
      // Only a LANDED move hands focus (see the FocusHandoff effect): the
      // pressed control may have disabled itself at the landed boundary.
      if (result?.outcome === "moved") {
        setFocusHandoff({ kind: "move", entryId: entry.id, direction });
      }
    });
  }

  function handleRemove(entry: CollectionEntry, trigger: HTMLButtonElement): void {
    const before = collection;
    if (!before || editPending) return;
    const title = resolveCollectionEntry(entry, lookup).title ?? "this reading";
    // Capture the neighbor rows BEFORE the write (the shared helper — the
    // ReviewView shape): the keyed <li> elements survive the state swap,
    // so a neighbor stays connected for the focus handoff after the
    // removal re-render.
    removedNeighborsRef.current = captureRowNeighbors(trigger, "li.collection-entry");
    void runMembershipEdit(
      () => removeCollectionEntry(before.id, entry.id),
      () => `Removed “${title}” from this collection. It stays in your library.`,
      `Couldn't remove “${title}”. Try again.`,
    ).then((result) => {
      // The focus handoff fires for a LANDED removal only — a failed or
      // stale-path write keeps the pressed control (retry stays put).
      if (result?.outcome === "removed") setFocusHandoff({ kind: "removed" });
    });
  }

  const entries = collection?.entries ?? [];

  return (
    <main id="main">
      <header className="library-header collections-header">
        <h1 ref={h1Ref} tabIndex={-1}>
          {loadStatus === "ready" && collection !== null ? collection.name : "Collections"}
        </h1>
      </header>
      {/* The page owns load states; add outcomes announce inside the modal. */}
      <StatusRegion>
        {/* Membership outcomes announce FIRST (moves, removals, failures —
            the load states below render nothing once ready). */}
        {announcement !== null && <p>{announcement}</p>}
        {loadStatus === "loading" && <p>Opening this collection…</p>}
        {loadStatus === "ready" && libraryStatus === "loading" && <p>Checking your readings…</p>}
        {loadStatus === "missing" && (
          <>
            <h2>This collection doesn't exist.</h2>
            <p>
              It may have been removed. All your collections are listed under{" "}
              <a href="#/collections">Collections</a>.
            </p>
          </>
        )}
        {loadStatus === "error" && (
          <>
            <h2>Couldn't open this collection.</h2>
            <p>Reload the page to try again.</p>
          </>
        )}
        {libraryStatus === "error" && loadStatus === "ready" && (
          <>
            <p>Couldn't check your library. Reload the page to try again.</p>
          </>
        )}
      </StatusRegion>
      {loadStatus === "ready" && libraryStatus === "ready" && collection !== null ? (
        <>
          {/* Keep ONE opener mounted as the first add changes the list
              from empty to populated, so dialog close can restore focus. */}
          <div className="collection-entries-head">
            <h2 id="collection-entries-heading">Readings in order</h2>
            <button
              type="button"
              ref={addButtonRef}
              className="btn btn-primary collection-add-button"
              onClick={() => setAddOpen(true)}
              aria-haspopup="dialog"
            >
              Add readings
            </button>
          </div>
          {entries.length === 0 ? (
            /* No-content state — the stable Add affordance above invites
               the collection's first reading. */
            <StatusRegion className="collections-empty">
              <h2>No readings in this collection yet.</h2>
              <p>Add an article or a book to start the order.</p>
            </StatusRegion>
          ) : (
            <section className="library-section" aria-labelledby="collection-entries-heading">
              <ol className="collection-entries">
                {entries.map((entry, i) => {
                  // The ONE resolution — title, kind line, and link derive
                  // together (issue #244; chapter entries carry their parent
                  // work/book in the kind line, stale destinations their own
                  // honesty line).
                  const { href, title, kindLine } = resolveCollectionEntry(entry, lookup);
                  // The accessible-name title: entries whose target left
                  // the library still deserve a named control.
                  const rowTitle = title ?? "this reading";
                  return (
                    <li key={entry.id} className="collection-entry" data-entry-id={entry.id}>
                      <div className="collection-entry-main">
                        {href !== null ? (
                          <a className="collection-entry-link" href={href}>
                            {title ?? "Untitled"}
                          </a>
                        ) : (
                          // tabIndex=-1 — the removal focus handoff's
                          // honest neighbor target (focusable when handed
                          // focus, out of the Tab order otherwise).
                          <span className="collection-entry-unavailable" tabIndex={-1}>
                            {title ?? "No longer in your library"}
                          </span>
                        )}
                        <span className="meta">{kindLine}</span>
                      </div>
                      {/* The per-row membership controls (issue #243): the
                          visible labels name the honest action; the
                          accessible names carry the entry title AND the
                          position (the AC's orientation feedback, in the
                          ONE name the screen reader speaks). The first /
                          last boundaries disable their control visibly
                          BEFORE it is pressed. */}
                      <div className="collection-entry-actions">
                        <button
                          type="button"
                          data-direction="up"
                          className="btn btn-quiet collection-entry-move"
                          disabled={editPending || i === 0}
                          aria-label={`Move ${rowTitle} up — position ${i + 1} of ${entries.length}`}
                          onClick={() => handleMove(entry, i - 1)}
                        >
                          <span aria-hidden="true">↑</span> Move up
                        </button>
                        <button
                          type="button"
                          data-direction="down"
                          className="btn btn-quiet collection-entry-move"
                          disabled={editPending || i === entries.length - 1}
                          aria-label={`Move ${rowTitle} down — position ${i + 1} of ${entries.length}`}
                          onClick={() => handleMove(entry, i + 1)}
                        >
                          <span aria-hidden="true">↓</span> Move down
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet collection-entry-remove"
                          disabled={editPending}
                          aria-label={`Remove ${rowTitle} from this collection`}
                          onClick={(e) => handleRemove(entry, e.currentTarget)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <AddReadingDialog
            open={addOpen}
            collection={collection}
            articles={snapshot.standaloneArticles}
            books={snapshot.books}
            chaptersByBook={snapshot.chaptersByBook}
            onOutcome={(outcome) => {
              if (outcome.outcome === "added") setCollection(outcome.collection);
            }}
            onCancel={() => setAddOpen(false)}
          />
        </>
      ) : null}
    </main>
  );
}
