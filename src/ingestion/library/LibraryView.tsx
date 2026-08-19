// src/ingestion/library/LibraryView.tsx
// Plan 08-03 Task 3 — LibraryView. The default route component at `#/`,
// replacing FixtureList per RESEARCH §Pattern 5. SUPERSET of FixtureList
// (Pitfall 8-5 + UI-SPEC §Regression Targets — byte-stable structure):
//
//   - `<main id="main">`                        (byte-stable — skip-link target)
//   - `<h1>Saved articles</h1>`                 (byte-stable — SC#1, happy-path.spec L93)
//   - `<IngestControl />`                       (byte-stable)
//   - `.status` live region                     (byte-stable copy — FixtureList L45-53)
//   - `<ContinueReadingStrip />`                (NEW — returns null when empty)
//   - `<LibrarySearch />` + `<TagFilter />`     (NEW — D8-06 + D8-07)
//   - `<ul className="library-list">` of `<LibraryRow />`  (renamed class; row
//     structure byte-stable via LibraryRow)
//   - Empty-state block (D8-04 — calm voice)
//
// Plan 13-03 (POLISH-06 / D13-16) bounded tidy — the same components,
// regrouped into a header row plus three calm ordered sections: (1) the h1
// with the Review-highlights button beside it, (2) continue reading, (3) add
// content (IngestControl + the .status live region directly following it),
// (4) the library list (search, tag filter, rows). Structure-only reorg: no
// new features, no new data loading, every byte-stable anchor preserved.
//
// The hash router (App.tsx) is unchanged — only the list-view component
// import swaps (`FixtureList` → `LibraryView`). parseHash + hashchange + the
// Gap 3 fragment guard stay byte-stable.
//
// State (Plan 03 Task 3 action):
//   - items, status       — listArticles() load (FixtureList parity)
//   - query               — LibrarySearch lifted state (D8-06)
//   - activeTag           — TagFilter single-select state (D8-07)
//   - allTags             — derived from loadAllTags() on mount (D8-08 auto-prune)
//   - locationsByArticle  — Map<articleId, LocationRecord> from loadAllLocations()
//                           (per-row hairline + finished mark)
//
// Deviation note (Rule 3 — blocking): the plan action specifies a default
// sort by `addedAt`, but `CanonicalArticle` does not carry that field — it
// lives only on the Dexie row (`db.articles` Table type annotation). Rather
// than fork the schema or violate types, we keep the composite-library order
// (ingested-first, then fixtures — already the natural "recently-added first"
// order from `compositeLibraryRepository.list()`). The original FixtureList
// did not sort either; v1.0 e2e tests assert row COUNT, not order.
import { useEffect, useState } from "react";
import { listArticles } from "../../content/repository";
import type { CanonicalArticle } from "../../content/types";
import type { Book, LocationRecord } from "../../content/schema";
import { IngestControl } from "../IngestControl";
import { LibrarySearch } from "./LibrarySearch";
import { TagFilter } from "./TagFilter";
import { LibraryRow } from "./LibraryRow";
import { BookRow } from "./BookRow";
import { ContinueReadingStrip } from "./ContinueReadingStrip";
import { filterLibrary, filterBooks } from "./libraryFilter";
import { loadAllLocations } from "../../persistence/locationStore";
import { listBooks } from "../../persistence/booksStore";
import { loadAllTags } from "./tagsStore";
// Plan 08-04 (LIB-02 + D8-13/D8-14) — RemoveConfirm gates the cascade
// dexieLibrarySource.remove(id) behind a native <dialog>/alertdialog.
import { RemoveConfirm } from "./RemoveConfirm";
// Plan 12-05 — BookRemoveConfirm gates the book cascade booksStore.removeBook
// behind its own structural clone (Pitfall 8 isolation — two dialogs, two
// call sites, no shared ConfirmDialog).
import { BookRemoveConfirm } from "./BookRemoveConfirm";

/** A book pending destructive confirmation (Plan 12-05 — BookRow's Remove
 * book trigger is the only setter caller; BookRemoveConfirm consumes it). */
interface BookRemoveTarget {
  id: string;
  title: string;
  chapterCount: number;
  /** Chapter article ids — used to fall back to #/ if the reader is viewing
   * a chapter of the removed book at confirm time. */
  chapterIds: string[];
}

export function LibraryView() {
  const [items, setItems] = useState<CanonicalArticle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [locationsByArticle, setLocationsByArticle] = useState<
    Map<string, LocationRecord>
  >(new Map());
  // Plan 12-05 — the RAW locations array feeds BookRow's derivations
  // (deriveBookProgress/resolveResumeChapterId fold internally); the folded
  // per-article map above keeps serving standalone LibraryRow hairlines.
  const [allLocations, setAllLocations] = useState<LocationRecord[]>([]);
  // Plan 12-05 — book groups (listBooks, Zod-validated per row at the store
  // seam) + their chapter rows, partitioned from the article list by
  // ingestionMeta.bookId (D12-01 — chapters never render top-level).
  const [books, setBooks] = useState<Book[]>([]);
  // Plan 08-04 — row-level trash trigger state. When non-null, RemoveConfirm
  // is open; the reader confirms or cancels. refreshKey re-triggers the load
  // effect after a successful remove so the list re-derives from Dexie.
  const [removeTarget, setRemoveTarget] = useState<
    { id: string; title: string } | null
  >(null);
  // Plan 12-05 — book-level Remove trigger state. BookRemoveConfirm consumes
  // it (the BookRow onRemove callback below is its sole setter caller).
  const [bookRemoveTarget, setBookRemoveTarget] =
    useState<BookRemoveTarget | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Parallel load — listArticles (compositeLibraryRepository) +
    // loadAllLocations (per-row hairline + finished mark) + loadAllTags
    // (auto-pruned chip list) + listBooks (Plan 12-05 — the book groups).
    // Each is independent; Promise.all mirrors the composite-library read
    // discipline. A books-load failure routes calmly to zero book rows —
    // the standalone library stays usable (the strip's fail-quiet
    // discipline; recovery happens on the next refreshKey cycle).
    Promise.all([
      listArticles(),
      loadAllLocations(),
      loadAllTags(),
      listBooks(),
    ])
      .then(([articles, locations, tags, booksResult]) => {
        if (cancelled) return;
        // Index the latest location per articleId (max savedAt — D8-10).
        const latest = new Map<string, LocationRecord>();
        for (const loc of locations) {
          const prev = latest.get(loc.articleId);
          if (!prev || loc.savedAt > prev.savedAt) {
            latest.set(loc.articleId, loc);
          }
        }
        setItems(articles);
        setAllLocations(locations);
        setLocationsByArticle(latest);
        // Chip list = article tags ∪ book tags (Plan 12-05 — D12-04: a tag
        // on a book must surface as a filterable chip). loadAllTags returns
        // article tags only; union the books' tags and re-sort (the
        // loadAllTags localeCompare discipline).
        const loadedBooks = booksResult.ok ? booksResult.books : [];
        const tagSet = new Set<string>(tags);
        for (const book of loadedBooks) {
          for (const tag of book.tags ?? []) {
            tagSet.add(tag);
          }
        }
        setAllTags([...tagSet].sort((a, b) => a.localeCompare(b)));
        setBooks(loadedBooks);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Plan 12-05 — the book/article partition (D12-01): articles carrying
  // ingestionMeta.bookId are CHAPTER members (grouped under their Book;
  // never top-level rows); everything else is standalone and renders as
  // today. Chapter rows whose Book record is absent (orphaned by a partial
  // import) do not render — the live-truth cascade in booksStore.removeBook
  // makes orphans unreachable through normal flows.
  const standaloneArticles: CanonicalArticle[] = [];
  const chaptersByBook = new Map<string, CanonicalArticle[]>();
  for (const article of items) {
    const bookId = article.ingestionMeta?.bookId;
    if (bookId) {
      const list = chaptersByBook.get(bookId) ?? [];
      list.push(article);
      chaptersByBook.set(bookId, list);
    } else {
      standaloneArticles.push(article);
    }
  }

  // Filter the standalone half exactly as before (D8-06 + D8-07 — chapter
  // members are partitioned out above, and filterLibrary excludes any
  // stragglers defensively).
  const visibleItems = filterLibrary(standaloneArticles, { query, activeTag });

  // Books render addedAt-descending (the plan's addedAt default-sort
  // extended to books; the article half keeps the composite-library order
  // locked by the 08-03 deviation — CanonicalArticle carries no addedAt),
  // then the SAME filter composes over the book half (D12-04 — book/author/
  // chapter-title haystack + book.tags).
  const sortedBooks = [...books].sort((a, b) =>
    a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0,
  );
  const chapterTitlesByBook = new Map<string, string[]>();
  for (const [bookId, chapters] of chaptersByBook) {
    chapterTitlesByBook.set(bookId, chapters.map((c) => c.provenance.title));
  }
  const visibleBooks = filterBooks(
    sortedBooks,
    { query, activeTag },
    chapterTitlesByBook,
  );

  return (
    <main id="main">
      {/* Plan 13-03 (POLISH-06 / D13-16) bounded tidy — the library home
          reads as a header row plus three calm ordered regions: continue
          reading first, then add content, then the library list. Section
          wrappers are structure-only (app.css token spacing; no new
          features, no new data loading). Byte-stable anchors are preserved
          exactly: main#main, the h1 text, the .status live region, the
          LibraryRow markup, and the hash-assignment fallbacks below. */}
      <header className="library-header">
        {/* byte-stable page heading (SC#1 regression target — Pitfall 8-5) */}
        <h1>Saved articles</h1>
        {/* Plan 10-02 (D10-02) — the sole Phase-10 entry point into the
            cross-article review panel, now a quiet control BESIDE the h1
            (the same .article-export-highlights tokens: transparent bg,
            hairline border, 44px touch, accent on hover). Navigation is
            a plain hash assignment (the #/ fallback precedent below), which
            pushes a history entry so browser-back returns to the library. */}
        <button
          type="button"
          className="article-export-highlights"
          onClick={() => {
            window.location.hash = "#/review";
          }}
        >
          Review highlights
        </button>
      </header>
      {/* (1) Continue reading — the strip returns null while loading OR when
          the unfinished set is empty (spare chrome per UI-SPEC); the section
          wrapper keeps the region's place in the order regardless. */}
      <section className="library-section library-section-continue">
        <ContinueReadingStrip />
      </section>
      {/* (2) Add content — 07-06 (D7-01 + D7-02) minimal ingest control
          (extended in Plan 04 with the file upload form), with the
          byte-stable .status live region directly following it (FixtureList
          L45-53 copy verbatim). */}
      <section className="library-section library-section-add">
        <IngestControl />
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          {status === "loading" && <p>Opening article…</p>}
          {status === "error" && (
            <>
              <h2>Couldn't open this article.</h2>
              <p>
                The article could not be loaded. Select it again from the list, or
                try a different article.
              </p>
            </>
          )}
        </div>
      </section>
      {/* (3) The library list — D8-06 search + D8-07 tag filter always
          mounted (the reader can type/click even before items finish
          loading; the filter runs over whatever items are available),
          then the rows. */}
      <section className="library-section library-section-list">
        <LibrarySearch query={query} onQueryChange={setQuery} />
        <TagFilter tags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
        {visibleItems.length === 0 && visibleBooks.length === 0 && status === "ready" ? (
          // D8-04 empty state — calm voice pointing at Add (IngestControl above).
          // Replaces FixtureList's "No articles yet" copy. Plan 12-05: a library
          // holding ONLY book groups is not empty (and a filtered-out view is
          // not empty either — the chips/query above explain the absence).
          <>
            <h2>Your library is empty</h2>
            <p>Paste a URL or upload a file to begin.</p>
          </>
        ) : (
          <ul className="library-list">
            {visibleItems.map((a) => (
              <LibraryRow
                key={a.id}
                article={a}
                location={locationsByArticle.get(a.id)}
                onRemove={() =>
                  setRemoveTarget({
                    id: a.id,
                    title: a.provenance.title,
                  })
                }
              />
            ))}
            {/* Plan 12-05 — one expandable BookRow per VISIBLE Book (chapters
                nested INSIDE the li, never top-level siblings — the 08-05
                direct-child lesson). */}
            {visibleBooks.map((book) => (
              <BookRow
                key={book.id}
                book={book}
                chapters={chaptersByBook.get(book.id) ?? []}
                locations={allLocations}
                onRemove={() =>
                  setBookRemoveTarget({
                    id: book.id,
                    title: book.title,
                    chapterCount: book.chapterArticleIds.length,
                    chapterIds: book.chapterArticleIds,
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>
      {/* Plan 08-04 — row-level trash → cascade-remove confirmation (LIB-02).
          D8-13: the destructive onClick calls dexieLibrarySource.remove(id)
          which atomically removes the article + highlights + notes + location
          in one Dexie transaction (Phase 7 Plan 07-06). On confirm, bump
          refreshKey to re-trigger the load effect and navigate to #/ if the
          reader was viewing the removed article (the hash router handles the
          unknown-article-id case gracefully by falling back to the list). */}
      <RemoveConfirm
        open={removeTarget !== null}
        articleId={removeTarget?.id ?? ""}
        articleTitle={removeTarget?.title ?? ""}
        onConfirm={() => {
          const removedId = removeTarget?.id;
          setRemoveTarget(null);
          setRefreshKey((k) => k + 1);
          // If the reader was viewing the removed article, fall back to the
          // library list. The hash router's parseHash handles #/ gracefully.
          if (
            removedId !== undefined &&
            window.location.hash === `#/article/${removedId}`
          ) {
            window.location.hash = "#/";
          }
        }}
        onCancel={() => setRemoveTarget(null)}
      />
      {/* Plan 12-05 — book-level cascade-remove confirmation. The Proceed
          onClick inside BookRemoveConfirm is the SOLE executable
          booksStore.removeBook call site (Pitfall 8 isolation); on confirm,
          bump refreshKey so the list re-derives from Dexie, and fall back to
          #/ if the reader was viewing one of the removed book's chapters
          (the hash router handles the unknown-article-id fallback). */}
      <BookRemoveConfirm
        open={bookRemoveTarget !== null}
        bookId={bookRemoveTarget?.id ?? ""}
        bookTitle={bookRemoveTarget?.title ?? ""}
        chapterCount={bookRemoveTarget?.chapterCount ?? 0}
        onConfirm={() => {
          const removedChapterIds = bookRemoveTarget?.chapterIds ?? [];
          setBookRemoveTarget(null);
          setRefreshKey((k) => k + 1);
          if (
            removedChapterIds.some(
              (id) => window.location.hash === `#/article/${id}`,
            )
          ) {
            window.location.hash = "#/";
          }
        }}
        onCancel={() => setBookRemoveTarget(null)}
      />
    </main>
  );
}
