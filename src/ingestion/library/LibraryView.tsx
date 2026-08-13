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
import type { LocationRecord } from "../../content/schema";
import { IngestControl } from "../IngestControl";
import { LibrarySearch } from "./LibrarySearch";
import { TagFilter } from "./TagFilter";
import { LibraryRow } from "./LibraryRow";
import { ContinueReadingStrip } from "./ContinueReadingStrip";
import { filterLibrary } from "./libraryFilter";
import { loadAllLocations } from "../../persistence/locationStore";
import { loadAllTags } from "./tagsStore";
// Plan 08-04 (LIB-02 + D8-13/D8-14) — RemoveConfirm gates the cascade
// dexieLibrarySource.remove(id) behind a native <dialog>/alertdialog.
import { RemoveConfirm } from "./RemoveConfirm";

export function LibraryView() {
  const [items, setItems] = useState<CanonicalArticle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [locationsByArticle, setLocationsByArticle] = useState<
    Map<string, LocationRecord>
  >(new Map());
  // Plan 08-04 — row-level trash trigger state. When non-null, RemoveConfirm
  // is open; the reader confirms or cancels. refreshKey re-triggers the load
  // effect after a successful remove so the list re-derives from Dexie.
  const [removeTarget, setRemoveTarget] = useState<
    { id: string; title: string } | null
  >(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Parallel load — listArticles (compositeLibraryRepository) +
    // loadAllLocations (per-row hairline + finished mark) + loadAllTags
    // (auto-pruned chip list). Each is independent; Promise.all mirrors the
    // composite-library read discipline.
    Promise.all([listArticles(), loadAllLocations(), loadAllTags()])
      .then(([articles, locations, tags]) => {
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
        setLocationsByArticle(latest);
        setAllTags(tags);
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

  // Re-derive allTags when items change (tags may have been edited in
  // ArticleView). For Plan 03 this runs only on mount because items is set
  // once; Plan 04's tag-edit wiring will trigger re-derivation naturally.
  const visibleItems = filterLibrary(items, { query, activeTag });

  return (
    <main id="main">
      {/* byte-stable page heading (SC#1 regression target — Pitfall 8-5) */}
      <h1>Saved articles</h1>
      {/* 07-06 (D7-01 + D7-02) — minimal ingest control mounted above the
          article list. Extended in Plan 04 (file upload form). */}
      <IngestControl />
      {/* byte-stable .status live region (FixtureList L45-53 copy verbatim) */}
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
      {/* ContinueReadingStrip returns null while loading OR when the
          unfinished set is empty (spare chrome per UI-SPEC). */}
      <ContinueReadingStrip />
      {/* D8-06 search + D8-07 tag filter — always mounted so the reader can
          type/click even before items finish loading (the filter runs over
          whatever items are available). */}
      <LibrarySearch query={query} onQueryChange={setQuery} />
      <TagFilter tags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
      {visibleItems.length === 0 && status === "ready" ? (
        // D8-04 empty state — calm voice pointing at Add (IngestControl above).
        // Replaces FixtureList's "No articles yet" copy.
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
        </ul>
      )}
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
    </main>
  );
}
