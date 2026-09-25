// src/ingestion/library/LibraryView.tsx
// Plan 08-03 Task 3 — LibraryView. The default route component at `#/`,
// replacing FixtureList per RESEARCH §Pattern 5. SUPERSET of FixtureList
// (Pitfall 8-5 + UI-SPEC §Regression Targets — byte-stable structure):
//
//   - `<main id="main">`                        (byte-stable — skip-link target)
//   - `<h1>Saved articles</h1>`                 (byte-stable — SC#1, happy-path.spec L93)
//   - `.status` live region                     (byte-stable copy — FixtureList L45-53)
//   - `<ContinueReadingStrip />`                (NEW — returns null when empty)
//   - `<LibrarySearch />` + `<TagFilter />`     (NEW — D8-06 + D8-07)
//   - `<ul className="library-list">` of `<LibraryRow />`  (renamed class; row
//     structure byte-stable via LibraryRow)
//   - Empty-state block (D8-04 — calm voice)
//
// Plan 13-03 (POLISH-06 / D13-16) bounded tidy — the same components,
// regrouped into a header row plus calm ordered regions: (1) the h1 row,
// (2) continue reading, (3) the library list (search, tag filter, rows).
// Structure-only reorg: no new features, no new data loading, every
// byte-stable anchor preserved.
//
// Plan 16-03 (D16-02/D16-03/D16-04/D16-12) — the focused Add workflow:
// the three permanently-mounted ingestion forms LEAVE this page (the
// retiring three-form control is deleted); an "Add to Library" button
// BESIDE the h1 opens the AddDialog modal (the shell header stays exactly
// two destinations). The `.status` load live region SURVIVES the add-
// section dissolution byte-stable (Pitfall 7 — it is the list's
// "Opening article…" / "Couldn't open this article" surface, not an
// ingest surface), re-homed as a direct child of main after the list
// region. Article success navigates from INSIDE the dialog (D16-12);
// book success invalidates the library snapshot via onBookAdded so the new
// book row appears (the RemoveConfirm onConfirm precedent).
//
// Issue #67 (locked IA, variant A — decision recorded 2026-09-21, verdict
// on the live prototype branch prototype/library-ia-issue-67) — the page
// IA: header row (h1 + Add) with the stats line merged into the header
// block → the ONE toolbar band (view switcher + search + tags) → the
// continue-reading rail (slim cards) → the single-column library list.
// Every row (article, chapter sub-row, book) shares ONE anatomy: a main
// column (title → metaline → tags → progress/Finished) plus a
// right-aligned icon action cluster. The prototype variants + switcher
// live ONLY on the throwaway branch — main keeps the validated decision.
//
// The hash router (App.tsx) is unchanged — only the list-view component
// import swaps (`FixtureList` → `LibraryView`). parseHash + hashchange + the
// Gap 3 fragment guard stay byte-stable.
//
// State (Issue #3 — the LibrarySnapshot migration): the per-field load
// state (items / allTags / locationsByArticle / allLocations / books), the
// totalsById memo, the [refreshKey] load effect, and the
// "loading | ready | error" machine are DELETED — this component renders
// from the ONE useLibrarySnapshot mount, and every write path (remove,
// edit, add, read-state) follows up with the ONE invalidateLibrarySnapshot()
// call instead of bumping a local refreshKey.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalArticle } from "../../content/types";
import { LibrarySearch } from "./LibrarySearch";
import { TagFilter } from "./TagFilter";
import { LibraryRow, rowTagsAnchorName } from "./LibraryRow";
import { BookRow } from "./BookRow";
import { RowTagsPopover, type RowTagsTarget } from "./RowTagsPopover";
import { ContinueReadingStrip } from "./ContinueReadingStrip";
// Issue #38 — the ambient reading-stats strip + its pure derivations.
import { ReadingStatsStrip } from "./ReadingStatsStrip";
import { deriveLibraryReadingStats, timeReadLabels } from "./readingStats";
import { filterLibrary, filterBooks } from "./libraryFilter";
import { effectiveTitle } from "./effectiveMetadata";
import { articleReadingState, bookReadingState, countByState } from "./readingState";
import type { LibraryViewName } from "../../App";
import { setDocumentTitle } from "./pageMeta";
import { setArticleReadState } from "../../persistence/locationStore";
// Issue #3 — the ONE whole-library read model + its invalidation call.
import { invalidateLibrarySnapshot } from "./librarySnapshot";
import { useLibrarySnapshot } from "./useLibrarySnapshot";
// Issue #75 (decision #71) — the count-returning tag fold feeding the ONE
// shared TagPicker's suggestions on this page (and the row-tags popover).
import { deriveTagStats } from "./tagsStore";
// Plan 15-03 (D15-11..14) — the session-scoped return-context seam. PURE
// module (zero React, zero storage imports); this component owns the IO:
// lazy-initializer reads at mount (filters always restore — D15-13), ONE
// unmount-cleanup write at departure (live ref values + live scrollY +
// the launched row id — StrictMode-idempotent, Pitfall 8), and the
// ready-gated restore below (scroll + focus only on view match).
import {
  captureLibraryContext,
  peekLibraryContext,
  viewMatches,
  clampScroll,
} from "./librarySession";
// Plan 08-04 (LIB-02 + D8-13/D8-14) — RemoveConfirm gates the cascade
// dexieLibrarySource.remove(id) behind a native <dialog>/alertdialog.
import { RemoveConfirm } from "./RemoveConfirm";
// Plan 12-05 — BookRemoveConfirm gates the book cascade booksStore.removeBook
// behind its own structural clone (Pitfall 8 isolation — two dialogs, two
// call sites, no shared ConfirmDialog).
import { BookRemoveConfirm } from "./BookRemoveConfirm";
// Plan 16-03 (D16-01/D16-02/D16-03) — the focused Add-to-library dialog
// (built in Plan 16-02) moved to the APP SHELL (issue #84, decision #70):
// the ONE session is now shared with the Highlights header Add icon, so
// LibraryView keeps only the h1-row trigger (D16-03) wired through the
// addOpen/onOpenAdd props. Book-success refresh rides the app-level
// invalidation; article success still navigates inside the dialog.
// Plan 17-02 (D17-01..D17-04) — the reader-owned metadata edit dialog: a
// structural RemoveConfirm/AddDialog clone (Pitfall 8 — no shared dialog
// abstraction) hosting the single override write (the Dexie articles-table
// put).
import { EditMetadataDialog } from "./EditMetadataDialog";

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

interface LibraryViewProps {
  /** The active reading-state view (Plan 14-02 D14-12 — real hash routes). */
  view: LibraryViewName;
  /** App-owned view switch (D14-13 — replaceState + direct router update). */
  onSwitchView: (next: LibraryViewName) => void;
  /** True only when this mount followed an in-app navigation (D14-03 —
   * cold loads and reloads keep natural browser focus; threaded from
   * App's hasAppHistory). */
  warmMount: boolean;
  /** Issue #84 (decision #70) — the app-level AddDialog's open state;
   * drives the h1-row trigger's aria-expanded. */
  addOpen: boolean;
  /** Issue #84 (decision #70) — opens the ONE app-level AddDialog (the
   * same session the Highlights header icon opens). */
  onOpenAdd: () => void;
}

// Plan 14-02 (D14-22) — the four switcher links, in order. hrefs stay the
// template constants (same grammar parseHash allows); labels are sentence
// case per the UI-SPEC voice rule ("In progress", lowercase p).
const VIEW_LINKS: ReadonlyArray<{
  view: LibraryViewName;
  href: string;
  label: string;
}> = [
  { view: "all", href: "#/", label: "All" },
  { view: "unread", href: "#/unread", label: "Unread" },
  { view: "in-progress", href: "#/in-progress", label: "In progress" },
  { view: "finished", href: "#/finished", label: "Finished" },
];

// Plan 14-02 (D14-26) — per-view empty-state copy (calm D8-04 voice). All
// keeps the byte-stable D8-04 pair; the previous filtered-empty copy render
// is intentionally superseded (nothing pins that copy — verified by repo
// grep): an empty view is membership-driven, a filtered-out view is not.
const EMPTY_COPY: Record<LibraryViewName, { heading: string; body: string }> = {
  all: {
    heading: "Your library is empty",
    // Plan 16-03 (D16-04) — the empty All view routes readers to Add via
    // COPY ONLY: the words point at the header-row button; no second
    // inline button is added (one trigger, one behavior).
    body: "Nothing saved yet. Use the Add to Library button to begin.",
  },
  unread: {
    heading: "Nothing unread",
    body: "Everything in your library has been started.",
  },
  "in-progress": {
    heading: "Nothing in progress",
    body: "Open something unread — it will show up here.",
  },
  finished: {
    heading: "Nothing finished yet",
    body: "Read to the end and finished items will collect here.",
  },
};

export function LibraryView({
  view,
  onSwitchView,
  warmMount,
  addOpen,
  onOpenAdd,
}: LibraryViewProps) {
  // Plan 14-02 Task 3 — the h1 focus target (tabindex=-1 pattern; text and
  // level byte-stable per D14-25) + the previous-view ref for the
  // view-switch effect below.
  const h1Ref = useRef<HTMLHeadingElement>(null);
  // Rule 1 fix (14-04): a boolean first-run flag is NOT StrictMode-safe —
  // the double-invoked [view] effect's second pass saw firstRun already
  // flipped and focused the h1 on every COLD load (D14-03 violation, real
  // browsers only: jsdom tests never wrap in StrictMode). Compare the
  // PREVIOUS view instead: null = the mount run, view-unchanged = the
  // StrictMode twin — neither announces; only a genuine view change does.
  const lastViewRef = useRef<LibraryViewName | null>(null);
  // Plan 15-03 (D15-11) — the library-list ul. Doubles as the restore
  // row-lookup container (constant-template selector, ready-gated below)
  // and the delegated launch-capture surface (onClick below).
  const listRef = useRef<HTMLUListElement>(null);
  // Plan 15-03 (Pitfall 8) — live-values refs so the unmount capture is
  // byte-identical under a StrictMode twin pass. liveContextRef is
  // rewritten EVERY render with the current { view, query, activeTag };
  // lastLaunchedRef holds the article id whose Open-article link launched
  // this visit's departure (null until a launch click — a Highlights
  // round-trip captures null, the §Interaction 8 branch).
  const liveContextRef = useRef<{ view: LibraryViewName; query: string; activeTag: string | null }>(
    { view, query: "", activeTag: null },
  );
  const lastLaunchedRef = useRef<string | null>(null);
  // Plan 15-03 (Pitfall 8) — StrictMode separation for the capture below.
  // dev StrictMode simulates an unmount/remount on EVERY mount: effect →
  // cleanup → effect, synchronously in the commit phase. A capture at that
  // simulated cleanup would (a) poison a COLD load (peek turns non-null →
  // the ready gate would restore/focus on a load that never had a prior
  // library — D14-03 violation) and (b) clobber a REAL departure snapshot
  // with fresh-mount values (a new lastLaunchedRef is null — the launched
  // row id would be lost). The simulated cleanup can NEVER see this flag
  // true: it runs before the async Promise.all resolves, and only the
  // load's completion sets it. Real departures (post-ready hashchange
  // swaps) always pass the gate. A pre-ready REAL departure (reader leaves
  // before rows paint) also skips — the previous snapshot stays, which is
  // the last fully-known context (truthful, D15-14).
  const reachedReadyRef = useRef(false);
  // Plan 15-03 (Rule 1 fix — the live-scroll truth) — the departure scroll
  // CANNOT be read from window.scrollY at unmount: every in-page link
  // departure (row open, shell link, brand) navigates to an unmatched
  // fragment, and the browser's synchronous scroll-to-fragment resets
  // scrollY to 0 BEFORE the hashchange handler runs (probed on chromium:
  // ["hashchange:0","scroll:0"]). So this ref tracks the reader's real
  // scroll via a PASSIVE listener (mounted below) and the capture reads
  // the REF. The reset scroll EVENT fires only after the hashchange —
  // after this component unmounted and removed its listener — so the
  // poisoned 0 can never reach the ref. Non-click departures (browser
  // Back from the library) do not fragment-scroll at all; their events
  // keep the ref live too.
  const scrollTopRef = useRef(0);
  // Issue #3 — the ONE library read model. status + snapshot come from the
  // hook (the ONE loading/status machine); the old per-field useState set,
  // the totalsById memo, the [refreshKey] load effect, and the render-body
  // partition loop are deleted — the snapshot module owns the load, the
  // partition (standaloneArticles/chaptersByBook, D12-01), and both folds
  // (latest-location, grapheme totals).
  const { status, snapshot } = useLibrarySnapshot();
  // Plan 15-03 (D15-13) — filters restore on ALL return paths (view match
  // gates ONLY scroll + row focus). Lazy initializers read the session
  // snapshot ONCE at mount; cold loads (null peek) keep today's defaults.
  const [query, setQuery] = useState(() => peekLibraryContext()?.query ?? "");
  const [activeTag, setActiveTag] = useState<string | null>(
    () => peekLibraryContext()?.activeTag ?? null,
  );
  // Plan 08-04 — row-level trash trigger state. When non-null, RemoveConfirm
  // is open; the reader confirms or cancels. invalidateLibrarySnapshot()
  // re-derives the list from Dexie after a successful remove.
  const [removeTarget, setRemoveTarget] = useState<{ id: string; title: string } | null>(null);
  // Plan 17-02 — the captured article row whose metadata the reader is
  // editing (D17-01). Non-null ⇒ EditMetadataDialog is open; onSaved closes
  // it and invalidates the library snapshot (the removeTarget onConfirm
  // precedent) so the list re-derives the row with the effective values.
  const [editTarget, setEditTarget] = useState<CanonicalArticle | null>(null);
  // Plan 12-05 — book-level Remove trigger state. BookRemoveConfirm consumes
  // it (the BookRow onRemove callback below is its sole setter caller).
  const [bookRemoveTarget, setBookRemoveTarget] = useState<BookRemoveTarget | null>(null);
  // Plan 16-03 (D16-03) — the Add dialog's open state moved to the APP
  // shell (issue #84, decision #70 — the dialog is ONE session shared with
  // the Highlights header icon); this view keeps only the h1-row trigger,
  // wired through the addOpen/onOpenAdd props (the settingsOpen pattern).
  // Issue #75 (decision #71) — the row-tags popover target. Non-null ⇒
  // the popover shows anchored to that row's trigger. onClose clears the
  // target and invalidates the snapshot (ONE reload per editing session —
  // the toggles inside the popover wrote through setArticleTags directly).
  const [tagsTarget, setTagsTarget] = useState<RowTagsTarget | null>(null);

  // Plan 15-03 (Pitfall 8) — rewrite EVERY render so the unmount cleanup
  // below always reads the CURRENT context. A StrictMode double render
  // rewrites byte-identical values; the initial value above only exists
  // for the very first render (before any assignment).
  liveContextRef.current = { view, query, activeTag };

  // Plan 14-02 Task 3 (D14-02/D14-25/D14-03) — the library title, set once
  // on mount and CONSTANT across views (the URL carries the view); h1 focus
  // fires only when this mount followed an in-app navigation (warmMount —
  // cold deep-links and reloads keep natural browser focus; D14-08:
  // return-to-library uses this same uniform h1 rule). No cleanup function
  // — focusing twice is idempotent and StrictMode-safe (Pitfall 9).
  //
  // Plan 15-03 (D15-11; UI-SPEC §Interaction 7) — when a session snapshot
  // EXISTS (an in-session return), skip the early warmMount h1 focus and
  // defer the h1-vs-row decision to the ONE ready gate below (rows must
  // paint before the row lookup — Pitfall 4). No snapshot (cold load, or
  // the cold→article→Back edge where the library never mounted this
  // session) → today's warmMount h1 behavior, byte-unchanged.
  useEffect(() => {
    setDocumentTitle("Saved articles");
    if (warmMount && peekLibraryContext() === null) h1Ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Plan 15-03 (D15-12) — the ONE capture write point, unmount-only ([]),
  // plus the passive scroll tracker that feeds it (see scrollTopRef — the
  // live-ref discipline mirrors useScrollSave's articleRef pattern). Refs
  // hold live values, so re-running against the same mounted instance
  // captures a byte-identical snapshot (Pitfall 8). Gated on reachedReadyRef
  // — see that ref's declaration comment for the StrictMode
  // simulated-unmount discipline. Nothing is persisted; the snapshot is
  // session-scoped in module state only.
  useEffect(() => {
    const onScroll = () => {
      scrollTopRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (!reachedReadyRef.current) return; // simulated/pre-ready unmount
      captureLibraryContext({
        ...liveContextRef.current,
        scrollTop: scrollTopRef.current,
        lastArticleId: lastLaunchedRef.current,
      });
    };
  }, []);

  // Plan 15-03 (D15-11..14; UI-SPEC §Interaction 6-9) — the ONE restore
  // decision point, gated on status === "ready" (rows painted — Pitfall 4:
  // an earlier scrollTo would clamp against zero height and the row
  // lookup would run against an unpainted list; T-15-09). [status]-keyed
  // so it fires on the loading→ready transition only — an in-session
  // snapshot invalidation never re-enters "ready" from another value, so a
  // mid-session remove cannot replay a stale restore. Idempotent: a
  // StrictMode double-run re-restores identical values.
  //
  // reachedReadyRef (Issue #3): the load callback that used to set it is
  // gone with the load effect — the ref now flips in this same
  // ready-gated effect, BEFORE the session-snapshot reads, so the capture
  // cleanup stays gated on "this mount painted a settled list" and the
  // StrictMode simulated unmount (which runs before any async load
  // settles) still skips.
  //
  // Ordering (Pitfall 5): scroll FIRST (clamped to the CURRENT list
  // height), THEN focus — never focus an off-screen row.
  //   - view match + launched row found: row-link focus with
  //     preventScroll IFF the row intersects the restored viewport (the
  //     captured scroll stays authoritative); else default focus (the
  //     row scrolls into view).
  //   - view match + null launched row (departure was not an article
  //     open — e.g. a Highlights round-trip): h1 focus with
  //     preventScroll:true so the focus does not reset the just-restored
  //     scroll (§Interaction 8).
  //   - view match + row GONE (removed or filtered out): h1 focus with
  //     DEFAULT scroll (reset-to-top) — the D14-05 fallback and the
  //     truthful D15-14 degrade (the launched row is gone; holding the
  //     old offset over unfamiliar rows would restore something untrue).
  //   - view MISMATCH (D15-14): filters already applied via the lazy
  //     initializers; the fresh warm-arrival default — plain h1 focus,
  //     scroll stays at top. Never restore mismatched scroll.
  //   - null peek (cold load): nothing — natural focus (D14-03).
  //
  // NO live-region announcement (D14-09 — focus landing IS the
  // communication). Row lookup uses the constant-template selector over
  // ids from validated records only (T-15-08) — used as a lookup key,
  // never interpolated into URLs or DOM.
  useEffect(() => {
    if (status !== "ready") return;
    reachedReadyRef.current = true;
    // `session` (not `snapshot`) — the hook's LibrarySnapshot owns the
    // component-level `snapshot` name now; this local is the librarySession
    // departure context.
    const session = peekLibraryContext();
    if (session === null) return; // cold load — natural focus (D14-03)
    if (!viewMatches(view, session.view)) {
      // D15-14 mismatch degrade: fresh reset (h1 default, scroll at top).
      h1Ref.current?.focus();
      return;
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, clampScroll(session.scrollTop, maxScroll));
    if (session.lastArticleId === null) {
      // §Interaction 8 — the restored scroll stays authoritative.
      h1Ref.current?.focus({ preventScroll: true });
      return;
    }
    const rowLink = listRef.current?.querySelector<HTMLAnchorElement>(
      `a[href="#/article/${session.lastArticleId}"]`,
    );
    if (rowLink) {
      const rect = rowLink.getBoundingClientRect();
      const intersectsViewport = rect.bottom > 0 && rect.top < window.innerHeight;
      rowLink.focus({ preventScroll: intersectsViewport });
    } else {
      // Row gone — the truthful degrade (D14-05/D15-14).
      h1Ref.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore-on-ready arrival only; a mid-session view switch must not replay it (the [view] effect owns switches)
  }, [status]);

  // Plan 14-02 Task 3 (D14-15) — the uniform h1 rule at its second trigger
  // point: every view switch announces via h1 focus. LibraryView does NOT
  // remount on view switches (Pitfall 3 — the direct setView path keeps the
  // same component instance), so this MUST be a [view]-keyed effect that
  // skips the mount run (the mount effect above owns it). StrictMode-safe
  // (Pitfall 9): the previous-view comparison treats the double-invoke's
  // second pass as "no change" — no focus, cold loads stay calm (D14-03).
  // focus() is called WITHOUT preventScroll — its default scroll-into-view
  // delivers the reset-to-list-top behavior because the h1 sits at content
  // top (UI-SPEC Interaction 10; no scrollTo choreography). No live-region
  // announcement is added — the focused h1 IS the announcement (D14-09).
  // No cleanup function (idempotent, StrictMode-safe — Pitfall 9).
  useEffect(() => {
    const prev = lastViewRef.current;
    lastViewRef.current = view;
    if (prev === null) return; // the mount run
    if (prev === view) return; // StrictMode twin — same view, not a switch
    h1Ref.current?.focus();
  }, [view]);

  // Issue #3 — render-body aliases over the snapshot (the old per-field
  // state set + totalsById memo + [refreshKey] load effect are deleted;
  // the snapshot module owns the load, the partition, and both folds).
  //   - totalsById — THE grapheme-total fold (one Intl.Segmenter pass per
  //     load, keyed on article id — the 260819-tld lesson, now behind the
  //     module).
  //   - locationsByArticle — THE latest-location fold (max savedAt — D8-10;
  //     readingPosition's latestLocationByArticle applied at load). Issue
  //     #8: the book-state derivations read THIS map too — no consumer
  //     re-folds the raw rows.
  //   - books — Book rows (listBooks fail-quiet routes to [] behind the
  //     module — a books-load failure leaves the standalone library usable).
  //   - allTags — article tags ∪ book tags, localeCompare-sorted (D12-04
  //     chip list; loadAllTags keeps its persisted-rows-only derivation).
  const totalsById = snapshot.totalsByArticleId;
  const locationsByArticle = snapshot.latestLocationByArticleId;
  const books = snapshot.books;
  const allTags = snapshot.tags;
  // Plan 12-05 — the book/article partition (D12-01): articles carrying
  // ingestionMeta.bookId are CHAPTER members (grouped under their Book;
  // never top-level rows); everything else is standalone and renders as
  // today. Chapter rows whose Book record is absent (orphaned by a partial
  // import) do not render — the live-truth cascade in booksStore.removeBook
  // makes orphans unreachable through normal flows.
  const standaloneArticles = snapshot.standaloneArticles;
  const chaptersByBook = snapshot.chaptersByBook;

  // Issue #38 — the per-article "time read here" labels (the card meta
  // line). The whole fold lives in readingStats.ts (deriveLibraryReadingStats
  // + timeReadLabels) — the SAME fold the strip runs, with the
  // under-one-minute suppression and orphan discipline behind the module, so
  // this map carries labels ONLY for articles whose quiet line may render.
  // Recomputes on snapshot identity change only — an invalidation reload
  // keeps the settled map mounted until the fresh snapshot lands
  // (stale-while-revalidate).
  const timeReadByArticleId = useMemo(
    () => timeReadLabels(deriveLibraryReadingStats(snapshot)),
    [snapshot],
  );

  // Issue #75 (decision #71) — the picker-suggestion stats, folded from the
  // SAME settled snapshot every other fold reads (most-used first, ties
  // alphabetical; counts never render). Recomputes on snapshot identity
  // change only — an editing session's toggles refresh at the close
  // invalidation, the stale-while-revalidate discipline.
  const tagStats = useMemo(
    () => deriveTagStats(snapshot.articles, snapshot.books),
    [snapshot],
  );

  // Plan 14-02 (D14-20/23/24) — per-view membership from the ONE policy
  // module, derived in the SAME render body as the switcher counts below
  // (agreement is structural, never copy-synchronized). Standalone articles
  // via articleReadingState; books via bookReadingState (ONE item per book —
  // chapters never top-level, D12-01/D14-24). The state filter runs BEFORE
  // the query/tag composition (filters narrow WITHIN the selected view).
  const viewArticles =
    view === "all"
      ? standaloneArticles
      : standaloneArticles.filter(
          (a) =>
            articleReadingState(locationsByArticle.get(a.id), totalsById.get(a.id) ?? 0) === view,
        );
  const viewBooks =
    view === "all"
      ? books
      : books.filter(
          // Rule 1 fix (14-04): NEVER pass totalsById.get detached —
          // Map.prototype.get requires its receiver; a bare .get reference
          // throws "called on incompatible receiver undefined" the moment a
          // book row exists (the render crashed with any located book).
          (book) => bookReadingState(book, locationsByArticle, (id) => totalsById.get(id)) === view,
        );

  // Plan 14-02 (D14-23/D14-24) — switcher counts fold through countByState
  // (the same policy functions membership uses, in this same render body);
  // All = standalone + book count (one item per book). Computed inline —
  // the fold is cheap against the memoized totalsById map, and the
  // in-render partition arrays are fresh each render anyway.
  const stateCounts = countByState(
    standaloneArticles.map((a) => ({
      id: a.id,
      location: locationsByArticle.get(a.id),
      total: totalsById.get(a.id) ?? 0,
    })),
    books,
    locationsByArticle,
    // Rule 1 fix (14-04): arrow wrapper — same detached-Map.get hazard as
    // viewBooks above (the count fold crashed identically).
    (id) => totalsById.get(id),
  );
  const allCount = standaloneArticles.length + books.length;

  // Filter the standalone half exactly as before (D8-06 + D8-07 — chapter
  // members are partitioned out above, and filterLibrary excludes any
  // stragglers defensively). The query/tag composition narrows WITHIN the
  // selected view (the state filter already ran above — LIB-09 interplay
  // keeps existing behavior).
  const visibleItems = filterLibrary(viewArticles, { query, activeTag });

  // Books render addedAt-descending (the plan's addedAt default-sort
  // extended to books; the article half keeps the composite-library order
  // locked by the 08-03 deviation — CanonicalArticle carries no addedAt),
  // then the SAME filter composes over the book half (D12-04 — book/author/
  // chapter-title haystack + book.tags).
  const sortedBooks = [...viewBooks].sort((a, b) =>
    a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0,
  );
  const chapterTitlesByBook = new Map<string, string[]>();
  for (const [bookId, chapters] of chaptersByBook) {
    chapterTitlesByBook.set(
      bookId,
      chapters.map((c) => c.provenance.title),
    );
  }
  const visibleBooks = filterBooks(sortedBooks, { query, activeTag }, chapterTitlesByBook);

  return (
    <main id="main">
      {/* Issue #67 (locked IA, variant A) — the library home reads as: the
          header row (h1 + Add) with the stats line merged into the header
          block → the ONE toolbar band (switcher + search + tags) → the
          continue-reading rail → the single-column list. Byte-stable
          anchors preserved: main#main, the h1 text, the .status live
          region, the row title headings + `#/article/` launch links, and
          the hash-assignment fallbacks below. */}
      <header className="library-header">
        {/* byte-stable page heading (SC#1 regression target — Pitfall 8-5).
            Plan 14-02 Task 3: gains ONLY tabIndex={-1} + the focus ref —
            text and level stay byte-stable across ALL views (D14-25).
            Plan 15-02 (OQ1 / UI-SPEC auto-resolution #5): the in-page
            Highlights button (D10-02) is REMOVED — the shell's Highlights
            link (Header nav Primary) is the sole library→highlights entry.
            Plan 16-03 (D16-02/D16-03): the header row gains the Add to
            Library trigger BESIDE the h1 (the old Review-highlights button
            position) — the ONLY way into the focused Add dialog. The
            shell header keeps its fixed links plus the data-driven Read
            destination (three text links when a target exists — D15-08,
            revised by decision #68). The
            trigger mirrors the Header gear-button shape: aria-haspopup
            dialog + an aria-expanded reflection of the open state. */}
        <h1 ref={h1Ref} tabIndex={-1}>
          Saved articles
        </h1>
        <button
          type="button"
          className="btn btn-primary library-add-button"
          onClick={onOpenAdd}
          aria-haspopup="dialog"
          aria-expanded={addOpen}
        >
          Add to Library
        </button>
      </header>
      {/* (1) Issue #67 (locked IA, variant A) — the reading-stats line is
          merged INTO the header block: a quiet right-aligned line directly
          under the h1+Add row (no longer a standalone strip between
          sections). Plain text in document order — no heading, no
          destination, no interactive elements (zero new keyboard stops);
          silent at zero visits (no backfill — silence IS the empty state).
          The finished count rides from the SAME countByState fold the view
          switcher uses (D14-23/D14-24 — the "{N} finished." sentence cannot
          disagree with the Finished view's count). Renders null while
          loading/failed — spare chrome, the strip discipline. */}
      <ReadingStatsStrip
        snapshot={snapshot}
        ready={status === "ready"}
        finishedCount={stateCounts.finished}
      />
      {/* (2) Issue #67 — the ONE toolbar band: the view switcher, search,
          and tag filter grouped in a single bordered container directly
          under the header. The switcher still governs the list (D14-22:
          real links — views ARE routes — inside a labeled nav landmark;
          exactly one aria-current="page"); D8-06 search + D8-07 tag filter
          are always mounted (the reader can type/click even before items
          finish loading; the filter runs over whatever items are
          available). */}
      <div className="library-toolbar">
        <nav className="view-switcher" aria-label="Library views">
          {VIEW_LINKS.map(({ view: linkView, href, label }) => (
            <a
              key={linkView}
              href={href}
              aria-current={view === linkView ? "page" : undefined}
              onClick={(e) => {
                // Unmodified left clicks only (D14-13): middle/cmd/ctrl/
                // shift/alt fall through to native fragment navigation
                // (push + hashchange handled by the existing onHash path).
                if (
                  e.defaultPrevented ||
                  e.button !== 0 ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey
                ) {
                  return;
                }
                e.preventDefault();
                onSwitchView(linkView);
              }}
            >
              {/* D14-23 — counts live in the accessible names, rendered ONLY
                  at status ready (loading shows bare labels — never a
                  parenthetical zero lie). */}
              {status === "ready"
                ? `${label} (${linkView === "all" ? allCount : stateCounts[linkView]})`
                : label}
            </a>
          ))}
        </nav>
        <LibrarySearch query={query} onQueryChange={setQuery} />
        <TagFilter tags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
      </div>
      {/* (3) Continue reading — the compact rail (issue #67, variant A):
          slim cards — the stretched title link, the "Chapter N of M" line
          for books, "% read" + hairline. Curation lives in the row action
          clusters; the rail itself adds no keyboard stops beyond its resume
          links. The rail returns null while loading OR when the unfinished
          set is empty (spare chrome per UI-SPEC); the section wrapper keeps
          the region's place in the order regardless. The rail is pinned
          chrome ABOVE the list on EVERY view — its mounting must not be
          coupled to which view is selected (the 2026-09-08 chrome-stability
          rule; the strip component still owns the spare-chrome null). */}
      <section className="library-section library-section-continue">
        {/* Quick 260909-ahy — the strip is mounted ONCE per LibraryView
            lifetime and re-derives through the LibrarySnapshot (Issue #3):
            an invalidation reload keeps status "ready" and the settled
            snapshot mounted, so the strip's entries memo keeps rendering
            the stale derivation until the fresh snapshot lands. The old
            remount-by-key mechanism (key={refreshKey}, commit 109fb3d) was
            the library flash: the key change synchronously removed the
            section (layout collapse, scroll clamp) until the remounted
            instance's async reload re-derived and re-appended it. */}
        <ContinueReadingStrip snapshot={snapshot} ready={status === "ready"} />
      </section>
      {/* (4) The library list — single-column rows (issue #67, variant A):
          the main list starts right under the rail; every row shares the
          ONE anatomy (main column + icon action cluster). */}
      <section className="library-section library-section-list">
        {viewArticles.length === 0 && viewBooks.length === 0 && status === "ready" ? (
          // Plan 14-02 (D14-26) — per-view empty states keyed on VIEW
          // MEMBERSHIP, not filtered visibility: a view whose membership is
          // zero shows its own calm copy INSTEAD of the ul (All keeps the
          // byte-stable D8-04 pair). A non-empty view whose query/tag
          // filters hide every row still renders the ul with zero children —
          // a filtered-out view is not an empty view. Plan 12-05: a library
          // holding ONLY book groups is not empty either.
          // 2026-09-08 user feedback: the copy now sits inside a
          // .library-empty wrapper joining the shared 1100px centered
          // measure (the library gutter discipline) — the bare h2/p
          // previously escaped every sibling's cap and spanned the window
          // at wide viewports. Element kinds and copy strings stay
          // byte-stable.
          <div className="library-empty">
            <h2>{EMPTY_COPY[view].heading}</h2>
            <p>{EMPTY_COPY[view].body}</p>
          </div>
        ) : (
          <>
            {/* Plan 15-03 (D15-11) — the delegated launch capture. ONE onClick
              on the list ul records the launched article id into
              lastLaunchedRef (consumed by the unmount capture above); the
              plain anchor still navigates NATIVELY — this handler only
              records, never preventDefaults (middle/cmd/ctrl-clicks and
              every other row control fall through untouched). The id parses
              from the constant-template href via the parseHash article
              charset — ids arrive from validated records (T-10-02c/T-15-08)
              and are used only as the restore lookup key. BookRow chapter
              links match the same template (a chapter open is a launch too;
              on return an unexpanded book row degrades to h1 — D15-14). */}
            <ul
              className="library-list"
              ref={listRef}
              onClick={(event) => {
                const anchor = (event.target as HTMLElement).closest('a[href^="#/article/"]');
                if (!anchor) return;
                const m = /^#\/article\/([a-z0-9-]+)$/.exec(anchor.getAttribute("href") ?? "");
                if (m) lastLaunchedRef.current = m[1]!;
              }}
            >
              {visibleItems.map((a) => (
                <LibraryRow
                  key={a.id}
                  article={a}
                  location={locationsByArticle.get(a.id)}
                  total={totalsById.get(a.id) ?? 0}
                  timeReadLabel={timeReadByArticleId.get(a.id)}
                  highlightCount={snapshot.highlightCountByArticleId.get(a.id)}
                  onReadingStateChange={async (read) => {
                    await setArticleReadState(a, read);
                    invalidateLibrarySnapshot();
                  }}
                  onRemove={() =>
                    setRemoveTarget({
                      id: a.id,
                      // Plan 17-02 (D17-09) — the remove-dialog copy shows the
                      // ONE effective name (effectiveTitle), never a second
                      // canonical identity the reader no longer sees.
                      title: effectiveTitle(a),
                    })
                  }
                  // Plan 17-02 (D17-01) — the edit affordance is gated to
                  // Dexie-persisted rows ONLY (the SourceBadge fixture
                  // inference: bundled Sample rows have nowhere to persist an
                  // override — OQ1 resolved via gate). Book rows, chapter
                  // sub-rows, and fixture rows get NO onEdit (D17-05/D17-06).
                  onEdit={a.ingestionMeta !== undefined ? () => setEditTarget(a) : undefined}
                  // Issue #75 (decision #71) — the row-tags trigger rides the
                  // SAME persistence gate as onEdit (a tag needs a Dexie row
                  // to land on) and the same effective-title naming rule.
                  onTags={
                    a.ingestionMeta !== undefined
                      ? () =>
                          setTagsTarget({
                            id: a.id,
                            title: effectiveTitle(a),
                            tags: a.tags ?? [],
                            anchor: rowTagsAnchorName(a.id),
                          })
                      : undefined
                  }
                  tagsOpen={tagsTarget?.id === a.id}
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
                  snapshot={snapshot}
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
            {/* Plan 16-01 (D16-13) — the filtered-to-zero feedback branch.
              Rendered ONLY when the view's MEMBERSHIP is non-empty (the
              membership-empty ternary arm above owns the EMPTY_COPY render
              — D14-26: filtered-out is not an empty view), the load has
              settled (status ready), and the query/tag composition has
              hidden every row of the view. The calm line + clear-filters
              affordance stay copy/visually distinct from EMPTY_COPY; the
              button resets BOTH filters (query + tag — simpler and honest).
              All strings are static React text children (T-16-01 — escaped
              by construction, no HTML injection to render the line). */}
            {status === "ready" &&
              (viewArticles.length > 0 || viewBooks.length > 0) &&
              visibleItems.length === 0 &&
              visibleBooks.length === 0 && (
                <p className="library-no-matches">
                  Nothing in this view matches your filters.{" "}
                  <button
                    type="button"
                    className="btn btn-quiet library-clear-filters"
                    onClick={() => {
                      setQuery("");
                      setActiveTag(null);
                    }}
                  >
                    Clear search and filters
                  </button>
                </p>
              )}
          </>
        )}
      </section>
      {/* Plan 16-03 (D16-03, Pitfall 7) — the re-homed library-load .status
          live region: byte-stable classes, role, aria attributes, and copy
          ("Opening article…" / the couldn't-open error copy — FixtureList
          L45-53 verbatim), now a DIRECT child of main following the list
          region after the add-section dissolution. */}
      <div className="status" role="status" aria-live="polite" aria-atomic="true">
        {status === "loading" && <p>Opening article…</p>}
        {status === "error" && (
          <>
            <h2>Couldn't open this article.</h2>
            <p>
              The article could not be loaded. Select it again from the list, or try a different
              article.
            </p>
          </>
        )}
      </div>
      {/* Quick 260908-nk2 — during the initial load the page is short enough
          (header row, switcher, search, tag filter, empty list) that this
          aside sat INSIDE the viewport and the feedback link flashed on
          screen until the rows loaded and pushed it below the fold — a
          flash of wrong content. The gate mounts the aside only after the
          load settles (ready OR error — a failed load may be exactly when a
          reader wants to file an issue); an invalidation re-load
          (remove/add/edit) never returns status to "loading", so the aside
          never unmounts/remounts on refreshes. Markup is byte-stable — only
          mount timing changes. */}
      {status !== "loading" && (
        <aside className="project-feedback" aria-label="Project feedback">
          <p>
            Help shape Lem Reader.{" "}
            <a
              href="https://github.com/wvanderen/lem-reader/issues/new?template=feature-request.yml&title=%5BFeedback%5D%3A%20"
              target="_blank"
              rel="noreferrer"
              aria-label="Share feedback on GitHub (opens in a new tab)"
            >
              Share feedback<span className="visually-hidden"> on GitHub (opens in a new tab)</span>
            </a>
          </p>
        </aside>
      )}
      {/* Plan 08-04 — row-level trash → cascade-remove confirmation (LIB-02).
          D8-13: the destructive onClick calls dexieLibrarySource.remove(id)
          which atomically removes the article + highlights + notes + location
          in one Dexie transaction (Phase 7 Plan 07-06). On confirm, invalidate
          the library snapshot (Issue #3) to re-trigger the load and navigate
          to #/ if the reader was viewing the removed article (the hash router
          handles the unknown-article-id case gracefully by falling back to
          the list). */}
      <RemoveConfirm
        open={removeTarget !== null}
        articleId={removeTarget?.id ?? ""}
        articleTitle={removeTarget?.title ?? ""}
        onConfirm={() => {
          const removedId = removeTarget?.id;
          setRemoveTarget(null);
          invalidateLibrarySnapshot();
          // If the reader was viewing the removed article, fall back to the
          // library list. The hash router's parseHash handles #/ gracefully.
          if (removedId !== undefined && window.location.hash === `#/article/${removedId}`) {
            window.location.hash = "#/";
          }
        }}
        onCancel={() => setRemoveTarget(null)}
      />
      {/* Plan 17-02 — the reader-owned metadata edit dialog (D17-01..D17-04).
          open mirrors editTarget; the dialog's Save handler owns the ONE
          override write on the articles table (Pitfall 8). onSaved closes the
          dialog and invalidates the library snapshot so the row re-derives
          with the effective values (the removeTarget onConfirm precedent);
          every calm close path (Cancel, Esc) routes through onCancel. */}
      <EditMetadataDialog
        open={editTarget !== null}
        article={editTarget}
        onSaved={() => {
          setEditTarget(null);
          invalidateLibrarySnapshot();
        }}
        onCancel={() => setEditTarget(null)}
      />
      {/* Plan 12-05 — book-level cascade-remove confirmation. The Proceed
          onClick inside BookRemoveConfirm is the SOLE executable
          booksStore.removeBook call site (Pitfall 8 isolation); on confirm,
          invalidate the library snapshot so the list re-derives from Dexie,
          and fall back to #/ if the reader was viewing one of the removed
          book's chapters (the hash router handles the unknown-article-id
          fallback). */}
      <BookRemoveConfirm
        open={bookRemoveTarget !== null}
        bookId={bookRemoveTarget?.id ?? ""}
        bookTitle={bookRemoveTarget?.title ?? ""}
        chapterCount={bookRemoveTarget?.chapterCount ?? 0}
        onConfirm={() => {
          const removedChapterIds = bookRemoveTarget?.chapterIds ?? [];
          setBookRemoveTarget(null);
          invalidateLibrarySnapshot();
          if (removedChapterIds.some((id) => window.location.hash === `#/article/${id}`)) {
            window.location.hash = "#/";
          }
        }}
        onCancel={() => setBookRemoveTarget(null)}
      />
      {/* Issue #84 (decision #70) — the AddDialog moved to the app shell
          (ONE session shared with the Highlights header icon); the h1-row
          Add trigger above opens it through the addOpen/onOpenAdd props.
          The librarySession capture/restore seam above is structurally
          unaffected (D15-11..14) — do NOT touch it. */}
      {/* Issue #75 (decision #71) — the ONE row-tags popover. Always mounted
          (a popover="auto" element must exist to show); renders nothing but
          an empty hidden panel while tagsTarget is null. onClose clears the
          target and invalidates the snapshot so the rows re-derive with the
          popover's written tags (the RemoveConfirm onConfirm precedent). */}
      <RowTagsPopover
        target={tagsTarget}
        stats={tagStats}
        onClose={() => {
          setTagsTarget(null);
          invalidateLibrarySnapshot();
        }}
      />
    </main>
  );
}
