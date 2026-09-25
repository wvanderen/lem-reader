// src/routes/review/ReviewView.tsx
// Plan 10-02 Task 1 — the Highlights destination route view (RECV-01.a
// surface, D10-01; destination vocabulary renamed to "Highlights" in
// Plan 15-01 — D15-06, canonical route #/highlights with the legacy
// #/review alias handled in App.tsx).
// The LibraryView twin: same page shape (<main id="main"> + one h1 + .status
// live region + filter row + list), same pure-derivation-in-the-render-body
// discipline (D10-09). ALL data logic lives in ./review/reviewFilter
// (Plan 10-01) — this component owns no new derivation logic, only
// rendering + control state.
//
// Issue #8 — the view consumes the ONE LibrarySnapshot (useLibrarySnapshot):
// its own articles/highlights/notes/tags Promise.all load, its own
// "loading | ready | error" machine, and its refreshKey re-derive bump are
// all gone — the snapshot module owns the load, the hook owns the status
// machine, and every curation commit (note save, highlight delete) follows
// up with the ONE invalidateLibrarySnapshot() call.
//
// Locked decisions rendered here:
//   - D10-01: dedicated route (not a modal) — one h1 per page
//     ("Highlights" since the Plan 15-01 / D15-06 rename), skip-link
//     parity via main#main.
//   - D10-04/D10-06: grouped-by-article sections (h2 = effective title +
//     a subtle source-host suffix when sourceUrl metadata exists — the
//     ArticleView "Originally published at {domain}" vocabulary; fixture
//     articles carry no sourceUrl so they show no host).
//   - D10-05: the never-drop orphan tail, h2 titled exactly
//     "Highlights without an article" (the markdown.ts
//     UNMATCHED_SECTION_HEADING vocabulary — the interactive twin of the
//     Phase 9 highlights export).
//   - D10-03: confident rows jump via a whole-row button to
//     #/article/<id>/h/<highlightId> (plain hash assignment pushes a
//     history entry so browser-back returns here). Ambiguous/orphan rows
//     are NOT jumpable — disabled with aria-disabled, mirroring the
//     AnnotationsDrawer L184-189 precedent. Orphan-tail rows carry no jump
//     affordance at all (no article to jump to).
//   - D10-07: a tri-state badge renders ONLY on ambiguous/orphan rows
//     ("Uncertain anchor" / "Article missing" — calm, distinct copy); the
//     legend line under the filter row says "No badge means anchored
//     confidently."
//   - D10-08: filter row = TagFilter chips (reused as-is) + article select
//     + confidence select (All/Confident/Ambiguous/Orphan), AND-composed;
//     sort select defaults to Date.
//   - D10-10: honest, distinct empty states — "No highlights yet…" when
//     the library has zero highlights vs "No highlights match these
//     filters." when filters matched zero of a non-empty set.
//   - D10-11/D10-12 (Plan 10-05): every row — orphans included — is
//     curatable in place. "Edit note" opens ReviewNoteDialog (notes are
//     keyed to highlightId, so no article is needed); "Remove highlight"
//     opens DeleteHighlightConfirm (cascade-honest copy, destructive write
//     ONLY in its Proceed onClick). Both commits invalidate the ONE
//     LibrarySnapshot (Issue #8 — re-derive from Dexie, never a stale row)
//     and announce calmly in .status ("Highlight removed." / "Note
//     saved.").
//
// Threat register (10-02-PLAN.md <threat_model>):
//   - T-10-02b (stored XSS): every quote/note/title/host string renders as
//     a React text child — never raw HTML, never dangerouslySetInnerHTML
//     (react/no-danger + lint:no-danger enforced repo-wide).
//   - T-10-02c (tampering): the jump hash is template-built from validated
//     record ids only; hashchange consumers re-parse through the same
//     App.tsx regex grammar.
import { useEffect, useRef, useState } from "react";
import type { CanonicalArticle } from "../../content/types";
import { TagFilter } from "../../ingestion/library/TagFilter";
// Plan 14-03 Task 1 (D14-02) — the review destination's document.title via
// the ONE shared helper (never string-built here; the helper owns the
// suffix, separator, and 64-char truncation).
import { setDocumentTitle } from "../../ingestion/library/pageMeta";// Plan 17-03 (META-02/D17-09) — the review surfaces (select option labels,
// options sort, section h2) carry the ONE effective title: the reader-owned
// override when present, canonical as fallback. One name, one order.
import {
  effectiveTitle,
  effectiveSourceUrl,
} from "../../ingestion/library/effectiveMetadata";
// Issue #8 — the ONE library read model + its invalidation call replace the
// view's own whole-library load and refreshKey state machine.
import { invalidateLibrarySnapshot } from "../../ingestion/library/librarySnapshot";
import { useLibrarySnapshot } from "../../ingestion/library/useLibrarySnapshot";
// Plan 19-02 (D19-10) — every stored-quote excerpt derivation routes through
// the ONE shared pure helper: a cross-block span describes itself as its
// first fragment + a calm ellipsis, never a truncated multi-block blob.
import { firstFragmentExcerpt } from "../../annotations/excerpt";
import {
  deriveReviewSections,
  type ConfidenceFilter,
  type ReviewEntry,
  type ReviewFilters,
  type ReviewSort,
} from "./reviewFilter";
import { formatIsoDate } from "../../ingestion/library/formatDate";
import { ReviewNoteDialog } from "./ReviewNoteDialog";
import { DeleteHighlightConfirm } from "./DeleteHighlightConfirm";
import { BackToLibrary } from "../../reader/BackToLibrary";
import { JumpToArticleIcon } from "../../ui/icons";
// Issue #98 (decision #96) — the ONE polite status-region primitive; this
// page's load/error/empty/announcement region renders through it.
import { StatusRegion } from "../../ui/StatusRegion";

/** Truncation limits for review rows (the AnnotationsDrawer discipline). */
const EXCERPT_MAX_CHARS = 120;
const NOTE_MAX_CHARS = 200;
const ARIA_MAX_CHARS = 60;
/** Plan 19-02 (D19-10) — the DeleteHighlightConfirm excerpt prop derives
 * ONCE here (single derivation site) at the confirm surface's shipped cap
 * (the DeleteHighlightConfirm EXCERPT_MAX_CHARS=200 precedent — unchanged). */
const CONFIRM_EXCERPT_MAX_CHARS = 200;

/** Plan 19-02 — serves NOTE previews only (every stored-quote excerpt site
 * derives through the shared firstFragmentExcerpt helper instead). */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

/**
 * Short-date formatter — the ONE date voice (formatIsoDate) with dateStyle
 * "short" per the plan's row-vocabulary.
 */
function formatDate(iso: string): string {
  return formatIsoDate(iso, "short");
}

/**
 * The subtle source-host suffix for a section heading — the ArticleView
 * `new URL(sourceUrl).hostname` vocabulary over the EFFECTIVE source
 * (effectiveSourceUrl — the readerSourceUrl override ?? canonical, the
 * one-derivation-point discipline). Returns null when the article carries
 * no sourceUrl (fixtures, markdown, pasted HTML) so no host renders. The
 * try/catch is defensive only: the schema httpUrl-refines both the
 * canonical and the override, so an unparseable URL cannot reach here
 * through a validated record.
 */
function sourceHost(article: CanonicalArticle): string | null {
  const sourceUrl = effectiveSourceUrl(article);
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Plan 21-03 (POLISH-10 / D21-06) — north-east "open in article context"
 * glyph for jump-capable rows, so the whole-row jump's destination is
 * understandable at a glance. Clones the LibraryRow TrashIcon/EditIcon
 * anatomy exactly (20×20, 24-unit viewBox, currentColor stroke, round
 * caps/joins, aria-hidden + focusable=false): decorative — the row
 * button's "Go to highlight: …" aria-label stays the whole accessible
 * name (the SVG adds nothing to it).
 */

/**
 * One review row. Section rows (entry.article defined) render the
 * whole-row jump button — enabled ONLY when status is "confident"
 * (D10-03; ambiguous/orphan render it disabled with aria-disabled, the
 * AnnotationsDrawer L184-189 rule). Orphan-tail rows (no article) render
 * a static div — no jump affordance at all, but the same first-class row
 * anatomy.
 *
 * Plan 21-03 (POLISH-10 / D21-06): confident (jump-capable) rows carry a
 * quiet open-in-reader glyph at the foot line's inline end — decorative
 * (aria-hidden), never rendered on orphan-tail or disabled/unresolved
 * rows, and never part of the accessible name.
 *
 * Plan 10-05 (D10-11): EVERY row — section or orphan, any tri-state —
 * carries the two curation affordances as siblings of the row body (never
 * nested inside the jump button: interactive content cannot nest). The
 * buttons' aria-labels prefix the visible text with the quote excerpt so
 * screen-reader rows are distinguishable (the accessible name contains the
 * visible label — WCAG 2.5.3 Label in Name).
 *
 * All text renders as React text children (T-10-02b/T-10-05a — escaping by
 * default; stored/imported text never becomes markup).
 */
function ReviewRow({
  entry,
  onEditNote,
  onRemove,
}: {
  entry: ReviewEntry;
  onEditNote: (entry: ReviewEntry) => void;
  onRemove: (entry: ReviewEntry) => void;
}) {
  // Plan 19-02 (D19-10): excerpts derive from the FIRST FRAGMENT of the
  // stored quote via the shared pure helper — per-surface caps unchanged
  // (visible 120 / aria 60). A complete single-fragment highlight gets NO
  // ellipsis; the ellipsis appears only on genuine continuation or length
  // truncation (excerpt honesty rule).
  const excerpt = firstFragmentExcerpt(entry.highlight.quote.exact, EXCERPT_MAX_CHARS);
  const ariaExcerpt = firstFragmentExcerpt(entry.highlight.quote.exact, ARIA_MAX_CHARS);
  const noteText = entry.note?.text ?? "";
  const isUnresolved = entry.status !== "confident";
  const jumpable = entry.status === "confident" && entry.article !== undefined;
  // D10-07 badge vocabulary — calm, distinct copy announced as row content.
  // Section rows whose article exists but whose quote no longer resolves
  // share the orphan vocabulary (status-driven, never silent).
  const badgeText =
    entry.status === "ambiguous"
      ? "Uncertain anchor"
      : entry.status === "orphan"
        ? "Article missing"
        : null;

  // Plan 21-03 (POLISH-10 / D21-06) — the row-foot line. ONLY jump-capable
  // (confident + article-backed) rows carry the quiet open-in-reader glyph
  // at the date line's inline end; every other row — orphan-tail, ambiguous,
  // orphan — keeps the bare date span so those row shapes stay byte-stable.
  const foot = jumpable ? (
    <span className="review-row-foot">
      <span className="review-date">{formatDate(entry.highlight.createdAt)}</span>
      {/* D21-06 — the layout hook rides the shared module's className prop
          (the hover-tint selector in app.css); restored — issue #77's tree
          dropped it and the D21-06 e2e pins it. */}
      <JumpToArticleIcon className="review-jump-glyph" />
    </span>
  ) : (
    <span className="review-date">{formatDate(entry.highlight.createdAt)}</span>
  );

  const content = (
    <>
      <span className="review-quote">{excerpt}</span>
      {noteText.length > 0 && (
        <span className="review-note-preview">
          {truncate(noteText, NOTE_MAX_CHARS)}
        </span>
      )}
      {badgeText !== null && (
        <span className={`review-badge review-badge-${entry.status}`}>
          {badgeText}
        </span>
      )}
      {foot}
    </>
  );

  // The curation cluster — siblings of the row body (D10-11). Accessible
  // names carry the quote excerpt prefix so rows are distinguishable in a
  // screen-reader list; the prefix includes the visible label (2.5.3).
  const actions = (
    <div className="review-row-actions">
      <button
        type="button"
        className="btn btn-quiet review-row-action review-row-action-note"
        aria-label={`Edit note: ${ariaExcerpt}`}
        onClick={() => onEditNote(entry)}
      >
        Edit note
      </button>
      <button
        type="button"
        className="btn btn-quiet review-row-action review-row-action-remove"
        aria-label={`Remove highlight: ${ariaExcerpt}`}
        onClick={() => onRemove(entry)}
      >
        Remove highlight
      </button>
    </div>
  );

  // Orphan-tail rows (D10-05): no article → NO jump affordance at all
  // (the curation affordances above still render — D10-11).
  if (entry.article === undefined) {
    return (
      <>
        <div className="review-row">{content}</div>
        {actions}
      </>
    );
  }

  // The jump button's aria-label mirrors the drawer-entry pattern.
  const ariaLabel = isUnresolved
    ? `Go to highlight: ${ariaExcerpt}. This highlight can't be located, so jumping is disabled.`
    : `Go to highlight: ${ariaExcerpt}${
        noteText ? `; ${truncate(noteText, ARIA_MAX_CHARS)}` : ""
      }`;

  return (
    <>
      <button
        type="button"
        className="review-row"
        aria-label={ariaLabel}
        disabled={isUnresolved}
        aria-disabled={isUnresolved ? "true" : undefined}
        onClick={() => {
          // T-10-02c: template-built from validated record ids only — the
          // hashchange consumer re-parses through the same App.tsx grammar.
          if (jumpable) {
            window.location.hash = `#/article/${entry.highlight.articleId}/h/${entry.highlight.id}`;
          }
        }}
      >
        {content}
      </button>
      {actions}
    </>
  );
}

/**
 * ReviewView — the cross-article annotation review panel, the Highlights
 * destination at #/highlights (D15-06 rename; the legacy #/review URL
 * aliases here via App.tsx normalization).
 * Reads the whole library (articles + highlights + notes + tags) from the
 * ONE LibrarySnapshot (Issue #8 — no own load, no own status machine),
 * derives sections purely in the render body (D10-09 — no effect chains),
 * and renders grouped-by-article sections plus the never-drop orphan tail.
 *
 * Issue #76 (decision #72) — URL-borne per-article scope. `scopedArticleId`
 * (parsed by App's parseHash from `#/highlights?article=<id>`) is the ONE
 * URL state: while set, the filter row's article combobox is REPLACED by a
 * removable scope chip (one slot, two states), the "article" sort option
 * hides, and the derivation filters to that article (its orphan rows kept —
 * a vanished article's remaining highlights still render, badged "Article
 * missing"). Tag/confidence/sort stay component state; clearing the scope
 * navigates to #/highlights (a real history push, so Back returns to the
 * scoped URL) and the unscoped combobox filter resets — a chip clear must
 * never leave a hidden article filter behind.
 */
export function ReviewView({
  hasAppHistory,
  scopedArticleId,
}: {
  hasAppHistory: boolean;
  scopedArticleId?: string;
}) {
  // Plan 14-03 Task 1 (renamed by Plan 15-01 / D15-06) — the h1 focus
  // target (the tabindex=-1 pattern; text is the D15-06 "Highlights"
  // anchor, level byte-stable).
  const h1Ref = useRef<HTMLHeadingElement>(null);
  // Issue #8 — the ONE loading/status machine (useLibrarySnapshot). Invali-
  // dation-triggered reloads never rewind to "loading" and never clear the
  // settled snapshot — stale-while-revalidate, so a curation commit never
  // flashes the panel through an empty state.
  const { status, snapshot } = useLibrarySnapshot();
  // Render-body aliases over the snapshot (the LibraryView discipline):
  // the old per-field article/highlight/note/tag states are deleted.
  const articles = snapshot.articles;
  const highlights = snapshot.highlights;
  const notes = snapshot.notes;
  const allTags = snapshot.tags;
  // D10-08: filters AND-compose; confidence "all" includes ambiguous and
  // orphan rows (tri-state is never silently filtered away).
  const [filters, setFilters] = useState<ReviewFilters>({
    tag: null,
    articleId: null,
    confidence: "all",
  });
  // D10-08: Date is the default sort.
  const [sort, setSort] = useState<ReviewSort>("date");
  // Plan 10-05 curation targets: the ReviewEntry under action (null when
  // the corresponding dialog is closed). Notes are keyed to highlightId, so
  // the note dialog opens for ANY row — orphan rows included (D10-11).
  const [noteTarget, setNoteTarget] = useState<ReviewEntry | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ReviewEntry | null>(null);
  // D10-12: the calm curation result announced through the .status live
  // region ("Highlight removed." / "Note saved."). Null = nothing to
  // announce (loading/error/empty states own the region then).
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // Issue #76 — scope-transition normalization (review→review hashchange
  // does NOT remount this component, so Back/Forward between scoped and
  // unscoped URLs lands here with state intact): scope CLEARED resets the
  // unscoped combobox filter — a chip clear must never leave a hidden
  // article filter behind (honesty). The "article"-sort case is handled
  // synchronously below via effectiveSort (no effect-frame flash).
  const prevScopedRef = useRef(scopedArticleId);
  useEffect(() => {
    if (prevScopedRef.current !== undefined && scopedArticleId === undefined) {
      setFilters((f) => ({ ...f, articleId: null }));
    }
    prevScopedRef.current = scopedArticleId;
  }, [scopedArticleId]);

  // Plan 14-03 Task 1 (D14-02/D14-01/D14-03; content renamed by Plan 15-01
  // / D15-06) — the Highlights destination's title + warm-gated mount
  // focus (the LibraryView 14-02 Task 3 twin). setDocumentTitle appends
  // the suffix inside the ONE helper; the h1
  // focus fires ONLY when this mount followed an in-app navigation —
  // hasAppHistory is App's already-threaded flag doubling as the
  // per-mount warm signal (false on cold loads and reloads by
  // construction, so cold arrivals never move focus). No cleanup —
  // focusing twice is idempotent and StrictMode-safe (Pitfall 9). No
  // live region, no announcement code (D14-09 — the focused h1 IS the
  // announcement). Overlays in this view (none today; dialogs are
  // ArticleView/global) touch neither the title nor this focus.
  useEffect(() => {
    setDocumentTitle("Highlights");
    if (hasAppHistory) h1Ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // D10-09 — pure derivation in the render body (the filterLibrary
  // pattern): join → classify → filter → group → sort, no effect chains.
  //
  // Issue #76 — while scoped, the URL scope OWNS the article filter (the
  // combobox is hidden; any stale component-state articleId is overridden,
  // never silently composed), and the "article" sort coerces to the Date
  // default (its option is hidden while scoped — the coercion keeps the
  // hidden select's value honest across a Back/Forward re-entry).
  const scoped = scopedArticleId !== undefined;
  const effectiveFilters: ReviewFilters = scoped
    ? { ...filters, articleId: scopedArticleId }
    : filters;
  const effectiveSort: ReviewSort =
    scoped && sort === "article" ? "date" : sort;
  const derivation = deriveReviewSections(
    articles,
    highlights,
    notes,
    effectiveFilters,
    effectiveSort,
  );

  // Issue #76 — scope resolution: the scoped article's record (its
  // EFFECTIVE title names the chip) and whether it vanished (deleted, or
  // the URL id never existed — one mechanism, the chip says so either way).
  const scopedArticle = scoped
    ? articles.find((a) => a.id === scopedArticleId)
    : undefined;
  const scopeVanished = scoped && scopedArticle === undefined;

  // Article-filter options ordered by the EFFECTIVE title (Plan 17-03
  // OQ5 — sort keys use effective values; markdown.ts L253 localeCompare
  // precedent). Fresh array — inputs are never mutated.
  const articlesByTitle = [...articles].sort((a, b) =>
    effectiveTitle(a).localeCompare(effectiveTitle(b)),
  );

  // Issue #76 — per-article highlight counts for the combobox suggestions
  // (the ONE fold lives on the snapshot; this is a render-body alias).
  const highlightCountByArticleId = snapshot.highlightCountByArticleId;

  // D10-10: the filters-matched-zero case is "both derived lists empty
  // while the stored highlight set is non-empty" (computed after the
  // derivation so the .status branch below stays honest).
  const derivedEmpty =
    derivation.sections.length === 0 && derivation.orphanEntries.length === 0;

  return (
    <main id="main">
      <header className="review-header">
        {/* Plan 13-04 (POLISH-05 / D13-15) — the shared back affordance at
            the review header start, identical anatomy to ArticleView's
            mount (the same component). App's in-app flag drives
            history.back() vs the "#/" fallback (Pitfall 7). Issue #76
            (decision #72): the review mount relabels to the honest "Back" —
            entries arrive from article pages as often as from the library,
            so the copy must not promise a destination it did not come
            from. */}
        <BackToLibrary hasAppHistory={hasAppHistory} label="Back" />
        {/* One h1 per page (D10-01) — skip-link parity via main#main.
            Plan 14-03 Task 1: gains ONLY tabIndex={-1} + the focus ref;
            Plan 15-01 (D15-06): text renamed to "Highlights", level
            byte-stable. */}
        <h1 ref={h1Ref} tabIndex={-1}>
          Highlights
        </h1>
      </header>
      {/* The status region (LibraryView's twin) carries the loading + error
          states, both D10-10 empty states, AND the D10-12 curation
          announcements — distinct, honest copies announced politely. The
          zero-highlights branch adopts the ONE no-content anatomy (issue
          #98: outline-level title + one sentence — h2 on this page), the
          library/drawer empties' anatomy. */}
      <StatusRegion>
        {announcement !== null && <p>{announcement}</p>}
        {status === "loading" && <p>Opening your highlights…</p>}
        {status === "error" && (
          <>
            <h2>Couldn't open your highlights.</h2>
            <p>
              Your highlights could not be loaded. Go back to the library and
              open this page again.
            </p>
          </>
        )}
        {status === "ready" && highlights.length === 0 && (
          <>
            <h2>No highlights yet</h2>
            <p>Highlights you make while reading appear here.</p>
          </>
        )}
        {status === "ready" && highlights.length > 0 && derivedEmpty && (
          // Issue #76 (decision #72) — the two zero-matches states share one
          // gate (rows exist, none survive the derivation): the vanished-
          // scope calm empty state with its back-to-all affordance, or the
          // plain filter miss.
          scopeVanished ? (
            <div className="review-scope-empty">
              <p>
                This article is no longer in your library, and no highlights
                remain for it.
              </p>
              {/* the calm back-to-all affordance for a vanished scope: a
                  real link to the unscoped review (a history push, so Back
                  returns to the scoped URL). */}
              <a className="btn btn-quiet review-scope-back" href="#/highlights">
                Show all highlights
              </a>
            </div>
          ) : (
            <p>No highlights match these filters.</p>
          )
        )}
      </StatusRegion>
      {/* D10-08 filter row — TagFilter chips reused as-is + article select +
          confidence select + sort select. Always mounted so the reader can
          adjust filters even before the load settles (the derivation runs
          over whatever is loaded). */}
      <div className="review-filter-row">
        <TagFilter
          tags={allTags}
          activeTag={filters.tag}
          onSelect={(tag) => setFilters((f) => ({ ...f, tag }))}
        />
        {/* Issue #76 (decision #72) — the article slot, two states: the
            combobox while unscoped (every article findable, zero-highlight
            ones included, each suggestion carrying its count from the ONE
            snapshot fold); the removable scope chip while URL-scoped. */}
        {scoped ? (
          <div className="review-filter-group review-scope-group">
            {/* The scoped slot keeps the combobox's visible "Article" label
                (same rhythm, same announcement); the chip carries the
                scope's name — the EFFECTIVE title, or the calm
                "(deleted article)" stand-in when the URL scope outlived
                its article. */}
            <span className="review-filter-label" id="review-scope-label">
              Article
            </span>
            <span
              className="review-scope-chip"
              aria-labelledby="review-scope-label review-scope-chip-text"
            >
              <span
                className="review-scope-chip-text"
                id="review-scope-chip-text"
              >
                {scopedArticle !== undefined
                  ? effectiveTitle(scopedArticle)
                  : "(deleted article)"}
              </span>
              {/* The chip's inside-× clear (the TagEntry chip-remove
                  anatomy): keyboard-complete, navigates to the unscoped
                  review (a history push — Back returns to the scoped
                  URL). */}
              <button
                type="button"
                className="tag-chip-remove review-scope-chip-remove"
                aria-label="Show highlights from all articles"
                onClick={() => {
                  window.location.hash = "#/highlights";
                }}
              >
                ×
              </button>
            </span>
          </div>
        ) : (
          <div className="review-filter-group">
            <label className="review-filter-label" htmlFor="review-article-filter">
              Article
            </label>
            <select
              id="review-article-filter"
              className="review-select"
              value={filters.articleId ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  articleId: e.target.value === "" ? null : e.target.value,
                }))
              }
            >
              <option value="">All articles</option>
              {articlesByTitle.map((a) => (
                <option key={a.id} value={a.id}>
                  {effectiveTitle(a)} ({highlightCountByArticleId.get(a.id) ?? 0})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="review-filter-group">
          <label className="review-filter-label" htmlFor="review-confidence-filter">
            Anchor confidence
          </label>
          <select
            id="review-confidence-filter"
            className="review-select"
            value={filters.confidence}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                confidence: e.target.value as ConfidenceFilter,
              }))
            }
          >
            <option value="all">All</option>
            <option value="confident">Confident</option>
            <option value="ambiguous">Ambiguous</option>
            <option value="orphan">Orphan</option>
          </select>
        </div>
        <div className="review-filter-group">
          <label className="review-filter-label" htmlFor="review-sort">
            Sort
          </label>
          {/* Issue #76 — the "article" sort is meaningless while one article
              is scoped: its option (and only that option) is absent, and
              effectiveSort keeps the select's value honest. */}
          <select
            id="review-sort"
            className="review-select"
            value={effectiveSort}
            onChange={(e) => setSort(e.target.value as ReviewSort)}
          >
            <option value="date">Date</option>
            {!scoped && <option value="article">Article</option>}
            <option value="position">Position</option>
          </select>
        </div>
      </div>
      {/* D10-07 legend — explains the badge vocabulary quietly. */}
      <p className="review-legend">No badge means anchored confidently.</p>
      {/* D10-04/D10-06 — grouped-by-article sections. Section key is the
          article id (the 10-01 derivation contract). */}
      {derivation.sections.map((section) => {
        const host = sourceHost(section.article);
        return (
          <section className="review-section" key={section.key}>
            <h2>
              {effectiveTitle(section.article)}
              {host !== null && (
                <span className="review-section-host"> · {host}</span>
              )}
            </h2>
            <ul className="review-section-list">
              {section.entries.map((entry) => (
                <li key={entry.highlight.id} className="review-item">
                  <ReviewRow
                    entry={entry}
                    onEditNote={setNoteTarget}
                    onRemove={setRemoveTarget}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {/* D10-05 — the never-drop orphan tail. Heading text is exactly the
          markdown.ts UNMATCHED_SECTION_HEADING vocabulary ("Highlights
          without an article"). Rows here have no jump affordance at all —
          but ARE curatable in place (D10-11: notes are keyed to
          highlightId, and a delete needs only the highlight row). */}
      {derivation.orphanEntries.length > 0 && (
        <section className="review-section review-section-orphan">
          <h2>Highlights without an article</h2>
          <ul className="review-section-list">
            {derivation.orphanEntries.map((entry) => (
              <li key={entry.highlight.id} className="review-item">
                <ReviewRow
                  entry={entry}
                  onEditNote={setNoteTarget}
                  onRemove={setRemoveTarget}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Plan 10-05 curation wiring. Both dialogs are always mounted
          (showModal requires DOM presence). The commit handlers share ONE
          shape (the LibraryView write-path twin): clear the target,
          invalidate the ONE LibrarySnapshot (Issue #8 — re-derive from
          Dexie, no stale rows), and announce calmly through the status
          region. Issue #98 — the announcement is HONEST: the note dialog
          reports whether the commit succeeded, so "Note saved." can only
          ever announce a write that landed; a failed commit announces the
          failure copy instead (never a success lie). Cancel closes only. */}
      <ReviewNoteDialog
        open={noteTarget !== null}
        highlightId={noteTarget?.highlight.id ?? ""}
        articleId={noteTarget?.highlight.articleId ?? ""}
        existing={noteTarget?.note ?? null}
        onDone={(saved) => {
          setNoteTarget(null);
          invalidateLibrarySnapshot();
          setAnnouncement(saved ? "Note saved." : "Couldn't save the note. Try again.");
        }}
      />
      <DeleteHighlightConfirm
        open={removeTarget !== null}
        highlightId={removeTarget?.highlight.id ?? ""}
        excerpt={
          removeTarget
            ? firstFragmentExcerpt(removeTarget.highlight.quote.exact, CONFIRM_EXCERPT_MAX_CHARS)
            : ""
        }
        onConfirm={() => {
          setRemoveTarget(null);
          invalidateLibrarySnapshot();
          // D10-12 exact copy — only reachable after the delete resolved.
          setAnnouncement("Highlight removed.");
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </main>
  );
}
