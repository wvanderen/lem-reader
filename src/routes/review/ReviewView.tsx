// src/routes/review/ReviewView.tsx
// Plan 10-02 Task 1 — the #/review route view (RECV-01.a surface, D10-01).
// The LibraryView twin: same page shape (<main id="main"> + one h1 + .status
// live region + filter row + list), same cancelled-flag Promise.all load
// effect keyed on refreshKey, same pure-derivation-in-the-render-body
// discipline (D10-09). ALL data logic lives in ./review/reviewFilter
// (Plan 10-01) — this component owns no new derivation logic, only
// rendering + control state.
//
// Locked decisions rendered here:
//   - D10-01: dedicated route (not a modal) at #/review — one h1 per page
//     ("Review highlights"), skip-link parity via main#main.
//   - D10-04/D10-06: grouped-by-article sections (h2 = provenance.title +
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
//
// Plan 10-05 will add curation affordances (edit-note + delete buttons +
// dialog wiring + the setRefreshKey bump that re-triggers the load effect).
//
// Threat register (10-02-PLAN.md <threat_model>):
//   - T-10-02b (stored XSS): every quote/note/title/host string renders as
//     a React text child — never raw HTML, never dangerouslySetInnerHTML
//     (react/no-danger + lint:no-danger enforced repo-wide).
//   - T-10-02c (tampering): the jump hash is template-built from validated
//     record ids only; hashchange consumers re-parse through the same
//     App.tsx regex grammar.
import { useEffect, useState } from "react";
import { listArticles } from "../../content/repository";
import type { CanonicalArticle } from "../../content/types";
import type { HighlightRecord, NoteRecord } from "../../content/schema";
import { TagFilter } from "../../ingestion/library/TagFilter";
import { loadAllTags } from "../../ingestion/library/tagsStore";
import { loadAllHighlights } from "../../persistence/highlightsStore";
import { loadAllNotes } from "../../persistence/notesStore";
import {
  deriveReviewSections,
  type ConfidenceFilter,
  type ReviewEntry,
  type ReviewFilters,
  type ReviewSort,
} from "./reviewFilter";

/** Truncation limits for review rows (the AnnotationsDrawer discipline). */
const EXCERPT_MAX_CHARS = 120;
const NOTE_MAX_CHARS = 200;
const ARIA_MAX_CHARS = 60;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

/**
 * Short-date formatter — the ArticleView formatDate shape (L106-115) with
 * dateStyle "short" per the plan's row-vocabulary. Falls back to the raw
 * ISO string if the user agent's locale is unavailable.
 */
function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, {
      dateStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * The subtle source-host suffix for a section heading — the ArticleView
 * L1085 `new URL(sourceUrl).hostname` vocabulary. Returns null when the
 * article carries no sourceUrl (fixtures, markdown, pasted HTML) so no
 * host renders. The try/catch is defensive only: ArticleSchema httpUrl-
 * refines sourceUrl at parse time, so an unparseable URL cannot reach
 * here through a validated record.
 */
function sourceHost(article: CanonicalArticle): string | null {
  const sourceUrl = article.provenance.sourceUrl;
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * One review row. Section rows (entry.article defined) render the
 * whole-row jump button — enabled ONLY when status is "confident"
 * (D10-03; ambiguous/orphan render it disabled with aria-disabled, the
 * AnnotationsDrawer L184-189 rule). Orphan-tail rows (no article) render
 * a static div — no jump affordance at all, but the same first-class row
 * anatomy (curatable in Plan 10-05, filterable via confidence=orphan).
 *
 * All text renders as React text children (T-10-02b — escaping by
 * default; stored/imported text never becomes markup).
 */
function ReviewRow({ entry }: { entry: ReviewEntry }) {
  const excerpt = entry.highlight.quote.exact;
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

  const content = (
    <>
      <span className="review-quote">{truncate(excerpt, EXCERPT_MAX_CHARS)}</span>
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
      <span className="review-date">{formatDate(entry.highlight.createdAt)}</span>
    </>
  );

  // Orphan-tail rows (D10-05): no article → NO jump affordance at all.
  if (entry.article === undefined) {
    return <div className="review-row">{content}</div>;
  }

  // The jump button's aria-label mirrors the drawer-entry pattern.
  const ariaLabel = isUnresolved
    ? `Go to highlight: ${truncate(excerpt, ARIA_MAX_CHARS)}. This highlight can't be located, so jumping is disabled.`
    : `Go to highlight: ${truncate(excerpt, ARIA_MAX_CHARS)}${
        noteText ? `; ${truncate(noteText, ARIA_MAX_CHARS)}` : ""
      }`;

  return (
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
  );
}

/**
 * ReviewView — the cross-article annotation review panel at #/review.
 * Loads the whole library (articles + highlights + notes + tags) in one
 * parallel Promise.all, derives sections purely in the render body
 * (D10-09 — no effect chains), and renders grouped-by-article sections
 * plus the never-drop orphan tail.
 */
export function ReviewView() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [articles, setArticles] = useState<CanonicalArticle[]>([]);
  const [highlights, setHighlights] = useState<HighlightRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  // D10-08: filters AND-compose; confidence "all" includes ambiguous and
  // orphan rows (tri-state is never silently filtered away).
  const [filters, setFilters] = useState<ReviewFilters>({
    tag: null,
    articleId: null,
    confidence: "all",
  });
  // D10-08: Date is the default sort.
  const [sort, setSort] = useState<ReviewSort>("date");
  // refreshKey re-triggers the load effect after a curation commit
  // (Plan 10-05 bumps it via setRefreshKey; the setter lands with that
  // plan — no curation writes exist yet).
  const [refreshKey] = useState(0);

  // Load effect — the LibraryView L66-97 twin: cancelled-flag +
  // Promise.all over the whole-library Zod-validated readers. NO new store
  // code; on rejection the calm DOC-06 error copy surfaces through .status.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listArticles(),
      loadAllHighlights(),
      loadAllNotes(),
      loadAllTags(),
    ])
      .then(([loadedArticles, loadedHighlights, loadedNotes, loadedTags]) => {
        if (cancelled) return;
        setArticles(loadedArticles);
        setHighlights(loadedHighlights);
        setNotes(loadedNotes);
        setAllTags(loadedTags);
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

  // D10-09 — pure derivation in the render body (the filterLibrary
  // pattern): join → classify → filter → group → sort, no effect chains.
  const derivation = deriveReviewSections(articles, highlights, notes, filters, sort);

  // Article-filter options ordered by provenance.title (markdown.ts L253
  // localeCompare precedent). Fresh array — inputs are never mutated.
  const articlesByTitle = [...articles].sort((a, b) =>
    a.provenance.title.localeCompare(b.provenance.title),
  );

  // D10-10: the filters-matched-zero case is "both derived lists empty
  // while the stored highlight set is non-empty" (computed after the
  // derivation so the .status branch below stays honest).
  const derivedEmpty =
    derivation.sections.length === 0 && derivation.orphanEntries.length === 0;

  return (
    <main id="main">
      <header className="review-header">
        {/* One h1 per page (D10-01) — skip-link parity via main#main. */}
        <h1>Review highlights</h1>
      </header>
      {/* The .status live region (LibraryView L112-123 twin) carries the
          loading + error states AND both D10-10 empty states — distinct,
          honest copies announced politely. */}
      <div className="status" role="status" aria-live="polite" aria-atomic="true">
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
          <p>No highlights yet. Highlights you make while reading appear here.</p>
        )}
        {status === "ready" && highlights.length > 0 && derivedEmpty && (
          <p>No highlights match these filters.</p>
        )}
      </div>
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
              {a.provenance.title}
            </option>
          ))}
        </select>
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
        <label className="review-filter-label" htmlFor="review-sort">
          Sort
        </label>
        <select
          id="review-sort"
          className="review-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as ReviewSort)}
        >
          <option value="date">Date</option>
          <option value="article">Article</option>
          <option value="position">Position</option>
        </select>
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
              {section.article.provenance.title}
              {host !== null && (
                <span className="review-section-host"> · {host}</span>
              )}
            </h2>
            <ul className="review-section-list">
              {section.entries.map((entry) => (
                <li key={entry.highlight.id}>
                  <ReviewRow entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {/* D10-05 — the never-drop orphan tail. Heading text is exactly the
          markdown.ts UNMATCHED_SECTION_HEADING vocabulary ("Highlights
          without an article"). Rows here have no jump affordance at all. */}
      {derivation.orphanEntries.length > 0 && (
        <section className="review-section review-section-orphan">
          <h2>Highlights without an article</h2>
          <ul className="review-section-list">
            {derivation.orphanEntries.map((entry) => (
              <li key={entry.highlight.id}>
                <ReviewRow entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
