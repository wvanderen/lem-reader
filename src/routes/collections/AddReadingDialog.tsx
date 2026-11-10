// src/routes/collections/AddReadingDialog.tsx
// Issue #242 — the add-to-collection dialog: ONE searchable list of the
// reader's readings, each addable to the open collection's order (appended
// at the end — array order IS the collection order).
//
// Issue #244 widens the picker to CHAPTER targets: under each standalone
// work, its validated chapter destinations (listWorkChapterTargets — the
// SAME resolution the store write seam and the reader apply); under each
// book, its EXISTING chapter articles in TOC order (orderedLiveChapters).
// Generated reading parts and arbitrary passage ranges are unrepresentable
// (the schema shape refuses pt-* ids; the picker never builds them). The
// picker keeps the whole-readings rows first-class — a plan can hold the
// whole work AND one of its chapters (different targets).
//
// Membership truth in ONE place: the "Added" mark and the store's
// duplicate refusal share the ONE sameCollectionTarget comparison — a row
// already in the collection keeps its action in place as an aria-disabled
// "Added" button, preserving focus and row geometry across writes,
// and the store still refuses authoritatively
// for any direct caller. A chapter row whose parent is already added is
// still addable — the whole reading and one of its chapters are different
// targets.
//
// The dialog stays OPEN across adds (a reader assembling a plan adds
// several readings in one sitting). ALL outcomes announce inside the
// modal: showModal makes the host's status region inert. The host receives
// membership changes via onOutcome; a storage failure keeps the dialog
// open with the honest error line (issue #98).
//
// Five-part dialog grammar cloned verbatim from EditMetadataDialog
// (showModal sync, [data-initial-focus], preventDefault cancel/scrim,
// in-flight dismissal gate, Pitfall 1 trigger-focus restore).
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { StatusRegion } from "../../ui/StatusRegion";
import { effectiveTitle } from "../../ingestion/library/effectiveMetadata";
import { orderedLiveChapters } from "../../ingestion/library/bookProgress";
import { listWorkChapterTargets } from "../../content/chapterTargets";
import { addCollectionEntry, sameCollectionTarget } from "../../persistence/collectionsStore";
import type { AddCollectionEntryOutcome } from "../../persistence/collectionsStore";
import type { CanonicalArticle } from "../../content/types";
import type { Book, Collection, CollectionEntryTarget } from "../../content/schema";

interface AddReadingDialogProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The collection gaining entries (null while closed). */
  collection: Collection | null;
  /** The library's standalone articles (chapters excluded by construction). */
  articles: readonly CanonicalArticle[];
  /** Every whole book row. */
  books: readonly Book[];
  /** Live chapter rows grouped by bookId (the snapshot's fold — the
   * book-chapter rows' source; missing rows are honestly absent). */
  chaptersByBook: ReadonlyMap<string, readonly CanonicalArticle[]>;
  /** One entry-outcome report per add press (the dialog owns outcome copy). */
  onOutcome: (outcome: AddCollectionEntryOutcome) => void;
  /** Invoked by the cancel button (or Esc). */
  onCancel: () => void;
}

interface PickerRow {
  key: string;
  /** "chapter" rows render indented under their parent with the parent
   * named in the meta line; parent rows keep their own Add button. */
  kind: "article" | "book" | "chapter";
  id: string;
  title: string;
  target: CollectionEntryTarget;
  meta: string;
  /** True for the indented chapter rows (the CSS hook + the sortable
   * grouping key). */
  chapterOfParentKey?: string;
}

function outcomeMessage(outcome: AddCollectionEntryOutcome, title: string): string {
  switch (outcome.outcome) {
    case "added":
      return `Added “${title}”.`;
    case "duplicate":
      return `“${title}” is already in this collection.`;
    case "missing-target":
      return `“${title}” is no longer in your library.`;
    case "invalid-target":
      return "Couldn't add that reading.";
    case "collection-missing":
      return "Couldn't open this collection. Try again.";
  }
}

export function AddReadingDialog({
  open,
  collection,
  articles,
  books,
  chaptersByBook,
  onOutcome,
  onCancel,
}: AddReadingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Live mirror rewritten EVERY render: the long-lived cancel/scrim
  // listeners must read the CURRENT pending state, not a stale capture.
  const pendingRef = useRef(false);
  pendingRef.current = pendingKey !== null;

  // Reset on every false→true open (the D16-08 fresh-open discipline): a
  // prior session's query and error never leak into the next open.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal();
      setQuery("");
      setPendingKey(null);
      setMessage(null);
      const initial =
        dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
        dlg.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ) ??
        dlg;
      initial.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
    };
    const handleDialogCancel = (e: Event) => {
      e.preventDefault(); // the open-prop mirror owns every close path
      if (pendingRef.current) return; // no dismissal while an add is in flight
      onCancel();
    };
    const handleScrimClick = (e: MouseEvent) => {
      if (e.target !== dlg) return;
      if (pendingRef.current) return;
      onCancel();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("cancel", handleDialogCancel);
    dlg.addEventListener("click", handleScrimClick);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("cancel", handleDialogCancel);
      dlg.removeEventListener("click", handleScrimClick);
    };
  }, [onCancel]);

  // The rows: standalone articles + books — each followed by its validated
  // chapter rows in structure/TOC order (issue #244) — grouped under their
  // alphabetized parent (calm, stable: a plan is assembled by name, not by
  // recency). One pass; membership via the ONE comparison.
  const rows = useMemo<PickerRow[]>(() => {
    if (!collection) return [];
    // Parents alphabetized together (the issue #242 order), so chapter
    // rows slot directly beneath their own parent.
    const parents = [
      ...articles.map((a) => ({
        key: `article-${a.id}`,
        title: effectiveTitle(a),
        target: { kind: "article", articleId: a.id } satisfies CollectionEntryTarget,
        article: a,
        book: null as Book | null,
      })),
      ...books.map((b) => ({
        key: `book-${b.id}`,
        title: b.title,
        target: { kind: "book", bookId: b.id } satisfies CollectionEntryTarget,
        article: null as CanonicalArticle | null,
        book: b,
      })),
    ];
    parents.sort((a, b) => a.title.localeCompare(b.title));
    const rows: PickerRow[] = [];
    for (const parent of parents) {
      rows.push({
        key: parent.key,
        kind: parent.book === null ? "article" : "book",
        id: parent.book === null ? parent.article!.id : parent.book.id,
        title: parent.title,
        target: parent.target,
        meta: parent.book === null ? "Article" : "Book",
      });
      if (parent.book === null) {
        // Work chapters: the validated chapter destinations of the
        // article's structure (the ONE resolution — a chapter offered here
        // is a chapter the reader and the store both resolve).
        for (const destination of listWorkChapterTargets(parent.article!)) {
          rows.push({
            key: `work-chapter-${parent.key}-${destination.id}`,
            kind: "chapter",
            id: destination.id,
            title: destination.title,
            target: {
              kind: "work-chapter",
              articleId: parent.article!.id,
              destinationId: destination.id,
            },
            meta: `Chapter · ${parent.title}`,
            chapterOfParentKey: parent.key,
          });
        }
      } else {
        // Book chapters: the EXISTING chapter articles in the book's TOC
        // order (partial imports skip silently — the orderedLiveChapters
        // fold).
        const live = chaptersByBook.get(parent.book.id) ?? [];
        for (const chapter of orderedLiveChapters(parent.book, live)) {
          rows.push({
            key: `book-chapter-${parent.key}-${chapter.id}`,
            kind: "chapter",
            id: chapter.id,
            title: effectiveTitle(chapter),
            target: {
              kind: "book-chapter",
              bookId: parent.book.id,
              articleId: chapter.id,
            },
            meta: `Chapter · ${parent.title}`,
            chapterOfParentKey: parent.key,
          });
        }
      }
    }
    return rows;
  }, [articles, books, chaptersByBook, collection]);

  // The membership marks read the LIVE collection (the host replaces it
  // after each added outcome), so a row flips to "Added" immediately.
  const addedKeys = useMemo(() => {
    if (!collection) return new Set<string>();
    const keys = new Set<string>();
    for (const row of rows) {
      if (collection.entries.some((entry) => sameCollectionTarget(entry.target, row.target))) {
        keys.add(row.key);
      }
    }
    return keys;
  }, [collection, rows]);

  const lower = query.trim().toLowerCase();
  const visible = useMemo(
    () => (lower.length === 0 ? rows : rows.filter((r) => r.title.toLowerCase().includes(lower))),
    [rows, lower],
  );
  // The honest no-match line: a non-empty query that matched nothing.
  const showNoMatch = lower.length > 0 && visible.length === 0;

  // The ONLY add write site — fires ONLY from a row button's onClick,
  // never in a catch block or effect. Storage failures keep the dialog
  // open with the error line; every outcome stays inside the active modal.
  async function handleAdd(row: PickerRow) {
    if (!collection || pendingRef.current) return;
    pendingRef.current = true;
    setPendingKey(row.key);
    setMessage(null);
    try {
      const outcome = await addCollectionEntry(collection.id, row.target);
      setMessage(outcomeMessage(outcome, row.title));
      onOutcome(outcome);
    } catch {
      setMessage("Couldn't add the reading. Try again.");
    } finally {
      pendingRef.current = false;
      setPendingKey(null);
    }
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    // ONE prevented-submit form — the search input must never submit.
    e.preventDefault();
  }

  return (
    <dialog ref={ref} className="add-reading" aria-labelledby="add-reading-heading">
      <div className="add-reading-inner">
        <h2 id="add-reading-heading">Add readings</h2>
        <p className="add-reading-lede">
          Whole readings or single chapters from your library, added to the end of the order.
        </p>
        <form onSubmit={handleFormSubmit}>
          <div className="add-reading-field">
            <label htmlFor="add-reading-search">Search your readings</label>
            <input
              ref={searchRef}
              id="add-reading-search"
              name="search"
              type="search"
              autoComplete="off"
              data-initial-focus
              placeholder="Search by title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {/* The honest no-match line: a query that matched nothing is
              stated, never rendered as silence. */}
          {showNoMatch ? (
            <p className="add-reading-no-match">
              Nothing in your library matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="add-reading-list">
              {visible.map((row) => {
                const added = addedKeys.has(row.key);
                const pending = pendingKey === row.key;
                return (
                  <li
                    key={row.key}
                    className={
                      row.kind === "chapter"
                        ? "add-reading-row add-reading-row-chapter"
                        : "add-reading-row"
                    }
                  >
                    <div className="add-reading-row-main">
                      <span className="add-reading-row-title">{row.title}</span>
                      <span className="meta">{row.meta}</span>
                    </div>
                    <button
                      type="button"
                      className={`btn btn-quiet add-reading-add-button${added ? " add-reading-added" : ""}`}
                      aria-disabled={added || pendingKey !== null}
                      aria-busy={pending || undefined}
                      onClick={() => {
                        if (!added) void handleAdd(row);
                      }}
                      aria-label={`${added ? "Added" : "Add"} ${row.title}${row.kind === "chapter" ? ` (${row.meta})` : ""}`}
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Pre-existing inside showModal's accessible subtree. */}
          <StatusRegion>{message !== null && <p>{message}</p>}</StatusRegion>
          <div className="dialog-actions add-reading-actions">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={pendingKey !== null}
              onClick={() => {
                if (!pendingRef.current) onCancel();
              }}
            >
              Done
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
