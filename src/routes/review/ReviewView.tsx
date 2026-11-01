// src/routes/review/ReviewView.tsx
// The Annotations destination route view (RECV-01.a surface, D10-01;
// destination vocabulary renamed to "Annotations" in issue #210 — the
// canonical route #/annotations with the legacy #/highlights and #/review
// aliases handled in App.tsx; the INTERNAL grammar name stays "review").
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
//   - D10-05: the never-drop orphan tail, h2 titled
//     "Annotations without an article" (issue #210 — the tail holds BOTH
//     annotation kinds since article notes joined the review; the markdown
//     export's own UNMATCHED_SECTION_HEADING stays highlight-worded —
//     that payload IS highlight-specific).
//   - D10-03: confident rows jump to #/article/<id>/h/<highlightId> —
//     since the review-row redesign, via the jump link's stretched
//     overlay (a native anchor: a real history entry, so browser-back
//     returns here). Ambiguous rows are NOT jumpable — the jump renders
//     disabled at the same cluster position; orphan-tail rows carry no
//     jump affordance at all (no article to jump to). Issue #210 —
//     article-note rows invert the affordance: the ONLY navigation is an
//     explicit "Open article" action (a plain #/article/<id> anchor that
//     opens at the saved canonical reading position — never a fabricated
//     passage destination), and editing never navigates at all.
//   - D10-07: a tri-state badge renders ONLY on ambiguous/orphan rows
//     ("Uncertain anchor" / "Article missing" — calm, distinct copy); the
//     legend line under the filter row says "No badge means anchored
//     confidently."
//   - D10-08: filter row = TagFilter chips (reused as-is) + article select
//     + confidence select (All/Confident/Ambiguous/Orphan), AND-composed;
//     sort select defaults to Date.
//   - D10-10: honest, distinct empty states — "No annotations yet…" when
//     the library has zero highlights AND zero article notes vs "No
//     annotations match these filters." when filters matched zero of a
//     non-empty set (issue #210 — the states distinguish absence from
//     active filters across BOTH kinds).
//   - D10-11/D10-12 (Plan 10-05): every row — orphans included — is
//     curatable in place. "Edit note" opens ReviewNoteDialog (notes are
//     keyed to highlightId, so no article is needed); "Remove highlight"
//     opens DeleteHighlightConfirm (cascade-honest copy, destructive write
//     ONLY in its Proceed onClick). Issue #119: "Change color" opens
//     ReviewColorDialog (the reader's own slot-pills entry;
//     commit-per-pick, never gated on anchor status). All commits
//     invalidate the ONE LibrarySnapshot (Issue #8 — re-derive from Dexie,
//     never a stale row) and announce calmly in .status ("Highlight
//     removed." / "Note saved." / "Color saved.").
//
// Threat register (10-02-PLAN.md <threat_model>):
//   - T-10-02b (stored XSS): every quote/note/title/host string renders as
//     a React text child — never raw HTML, never dangerouslySetInnerHTML
//     (react/no-danger + lint:no-danger enforced repo-wide).
//   - T-10-02c (tampering): the jump hash is template-built from validated
//     record ids only; hashchange consumers re-parse through the same
//     App.tsx regex grammar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalArticle } from "../../content/types";
import { TagFilter } from "../../ingestion/library/TagFilter";
// Plan 14-03 Task 1 (D14-02) — the review destination's document.title via
// the ONE shared helper (never string-built here; the helper owns the
// suffix, separator, and 64-char truncation).
import { setDocumentTitle } from "../../ingestion/library/pageMeta"; // Plan 17-03 (META-02/D17-09) — the review surfaces (select option labels,
// options sort, section h2) carry the ONE effective title: the reader-owned
// override when present, canonical as fallback. One name, one order.
import { effectiveTitle, effectiveSourceUrl } from "../../ingestion/library/effectiveMetadata";
// Issue #8 — the ONE library read model + its invalidation call replace the
// view's own whole-library load and refreshKey state machine.
import { invalidateLibrarySnapshot } from "../../ingestion/library/librarySnapshot";
import { useLibrarySnapshot } from "../../ingestion/library/useLibrarySnapshot";
// Plan 19-02 (D19-10) — every stored-quote excerpt derivation routes through
// the ONE shared pure helper: aria-labels describe a cross-block span as its
// first fragment + a calm ellipsis, never a truncated multi-block blob. The
// row's center-stage quote renders through the twin full-span derivation.
import { firstFragmentExcerpt, fullQuoteDisplay } from "../../annotations/excerpt";
// Issue #174 — the ONE "does this note carry written content?" predicate
// (empty OR whitespace-only commentary counts as no note; never trims
// stored content). Gates both the immediate-remove routing and the row's
// note preview.
import { hasNoteContent } from "../../annotations/noteText";
import {
  deriveReviewSections,
  type ArticleNoteReviewEntry,
  type HighlightReviewEntry,
  type ConfidenceFilter,
  type ReviewEntry,
  type ReviewFilters,
  type ReviewSort,
  type ReviewTypeFilter,
} from "./reviewFilter";
import { formatIsoDate } from "../../ingestion/library/formatDate";
import { ReviewNoteDialog, NOTE_SAVE_FAILED_COPY } from "./ReviewNoteDialog";
// Issue #117 — the in-place highlight-tag editor + its shared failure copy.
import { ReviewTagsDialog, TAGS_SAVE_FAILED_COPY } from "./ReviewTagsDialog";
// Issue #174 — the confirm dialog (opened ONLY for highlights with a
// nonempty note now) + the ONE shared remove-failure copy.
import { DeleteHighlightConfirm, HIGHLIGHT_REMOVE_FAILED_COPY } from "./DeleteHighlightConfirm";
// Issue #119 — the in-place highlight-color editor: the SAME picker component
// the reader's NotePopover hosts, wrapped in this surface's dialog grammar.
import { ReviewColorDialog } from "./ReviewColorDialog";
// Issue #119 — the ONE color write seam (the same seam the reader's picker
// commits through) + the shared named-color labels (A11Y-05 — the review row
// and dialog carry the visible text label, never color alone).
import { setHighlightColor, deleteHighlight } from "../../persistence/highlightsStore";
// Issue #222 — the color dialog applies SLOTS through the review seams: the
// additive tag union (the ONE tag vocabulary) + the ONE color seam, gated on
// the slot's ACTIVE hex (the dormancy gate).
import { setHighlightTags } from "../../ingestion/library/tagsStore";
import { activeCustomColor, applySlotWrites } from "../../annotations/highlightSlots";
import type { HighlightColor } from "../../content/schema";
import { highlightStateLabel } from "../../annotations/highlightColors";
// Issue #196 — the active-theme tint derivation for the review stripe + the
// color dialog's Custom pill (the SAME bases resolver the reader uses).
import { customHighlightTint, highlightBases } from "../../settings/highlightTint";
import type { CSSProperties } from "react";
import type { HighlightTintBases } from "../../settings/highlightTint";
import { useSettings } from "../../settings/SettingsContext";
// Review-row redesign — the icon action cluster (the LibraryRow anatomy):
// TagIcon/TrashIcon/EditIcon are the shared glyphs; DropletIcon names the
// color editor; JumpToArticleIcon is the row's jump affordance, whose
// stretched overlay makes the whole card navigable.
import { DropletIcon, EditIcon, JumpToArticleIcon, TagIcon, TrashIcon } from "../../ui/icons";
// Issue #98 (decision #96) — the ONE polite status-region primitive; this
// page's load/error/empty/announcement region renders through it.
import { StatusRegion } from "../../ui/StatusRegion";
// Issue #107 (the dropped follow-up of decision #72) — the unscoped
// article slot's searchable combobox: browse = annotated-only with
// counts, search finds every article, and a pick navigates into the URL
// scope (the chip takes over — one slot, two states).
import { ArticlePicker } from "../../ui/ArticlePicker";
// Issue #210 — the ONE article-note editing session (the same component the
// reader's annotation drawer hosts): plain-text editor, save/recovery
// rules, always-visible tags, layered Escape. Hosted INLINE in the row so
// editing never navigates into the article and never moves reading
// position; status routes to this page's ONE status region.
import { ArticleNoteEditor } from "../../reader/annotations/ArticleNoteEditor";
// Issue #210 — the recovery-draft read for the inline editor's open (the
// ONE loadArticleNotes seam; the store owns draft safety).
import { loadArticleNotes } from "../../persistence/articleNotesStore";

/** Truncation limits for review rows (the AnnotationsDrawer discipline). */
const NOTE_MAX_CHARS = 200;
const ARIA_MAX_CHARS = 60;
/** Issue #210 — the combined-count line's number voice (the drawer's
 * Intl.NumberFormat discipline). */
const countFormatter = new Intl.NumberFormat(navigator.language);
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
 * Issue #196 — the review card's stripe props: a custom color snapshot paints
 * the derived readable tint as the inline-start border color (the SAME
 * derivation the reader's marks + the settings preview use — preview =
 * render by construction); a named color keeps the shared per-id class
 * byte-unchanged. The stripe stays decorative in both branches — the
 * accessible name carries the color state (highlightStateLabel, A11Y-05).
 */
function reviewStripeProps(
  customColor: string | undefined,
  bases: HighlightTintBases | undefined,
  color: HighlightColor,
): { className: string; style?: CSSProperties } {
  const tint = customHighlightTint(customColor, bases);
  if (tint !== undefined) {
    return { className: "review-item", style: { borderInlineStartColor: tint } };
  }
  return { className: `review-item review-item-color-${color}` };
}

/**
 * One review row — the review-row redesign. The card (li.review-item, styled
 * in app.css) carries the highlight's color as an inline-start stripe; the
 * row body is the content column: the FULL stored quote center stage (the
 * entire quote.exact, block fragments joined by the spaced ellipsis marker
 * — no length cap; the highlight IS this surface's content), then a quiet
 * meta line (date · tri-state badge), then the optional note preview. The
 * four curation affordances render as 44px icon buttons in a right-aligned
 * cluster (the LibraryRow anatomy), preceded by the jump affordance:
 *
 *   - Confident (article-backed) rows: the jump is a real <a> whose
 *     stretched ::after overlay covers the whole card — the entire surface
 *     navigates to #/article/<id>/h/<highlightId> (native anchor semantics:
 *     a history push, so browser-back returns here; the D10-03 destination
 *     vocabulary is unchanged).
 *   - Ambiguous rows (article exists, quote unresolvable): the jump renders
 *     DISABLED at the same cluster position (the LibraryRow disabled-action
 *     placeholder discipline — geometry stays stable) with the honest
 *     "can't be located" copy in its accessible name. NOT jumpable (D10-03).
 *   - Orphan-tail rows (no article): no jump affordance at all.
 *
 * Plan 21-03 (POLISH-10 / D21-06) superseded in shape, kept in spirit: the
 * open-in-reader glyph still marks exactly the jump-capable rows — it now
 * RIDES the jump link (decorative, aria-hidden, tinted on card hover) and
 * never renders on orphan-tail rows; ambiguous rows carry it disabled.
 *
 * Plan 10-05 (D10-11): EVERY row — orphans included — is curatable in
 * place. The buttons' aria-labels prefix the visible action with the quote
 * excerpt so screen-reader rows are distinguishable (WCAG 2.5.3 Label in
 * Name); the color button additionally names the row's CURRENT color (the
 * stripe is decorative, so the named color lives in the accessible name —
 * A11Y-05: color is never the sole identifier).
 *
 * Issue #119 — the named color also drives the stripe class (the shared
 * per-theme --highlight* tokens; exactly the reader's state). Color never
 * depends on re-anchoring (the #118 discipline), so the stripe renders on
 * EVERY row — confident, ambiguous, orphan-tail alike.
 *
 * All text renders as React text children (T-10-02b/T-10-05a — escaping by
 * default; stored/imported text never becomes markup).
 */
function ReviewRow({
  entry,
  onEditNote,
  onEditTags,
  onRemove,
  onChangeColor,
}: {
  entry: HighlightReviewEntry;
  onEditNote: (entry: HighlightReviewEntry) => void;
  onEditTags: (entry: HighlightReviewEntry) => void;
  /** Issue #174 — carries the clicked button so the panel can resolve the
   * row's neighbors for the post-removal focus handoff. */
  onRemove: (entry: HighlightReviewEntry, trigger: HTMLElement) => void;
  onChangeColor: (entry: HighlightReviewEntry) => void;
}) {
  // D19-10 (display half): the row shows the ENTIRE stored span — block
  // boundaries verified against the current article, no cap. The capped
  // first-fragment derivation (60 chars) remains the ONE voice for every
  // accessible name below.
  const quoteText = fullQuoteDisplay(
    entry.highlight.quote.exact,
    entry.article,
    entry.resolvedPosition,
  );
  const ariaExcerpt = firstFragmentExcerpt(entry.highlight.quote.exact, ARIA_MAX_CHARS);
  const noteText = entry.note?.text ?? "";
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
    <div className="review-row">
      <blockquote className="review-quote">{quoteText}</blockquote>
      {/* Issue #174 — the preview gate rides the ONE hasNoteContent
          predicate: whitespace-only commentary is treated as absent here
          exactly as it is in the delete routing (the stored text itself is
          never trimmed). */}
      {hasNoteContent(noteText) && (
        <span className="review-note-preview">{truncate(noteText, NOTE_MAX_CHARS)}</span>
      )}
    </div>
  );

  // The jump affordance — first position in the action cluster. Confident
  // rows render the real link (its CSS ::after stretches over the whole
  // card); ambiguous rows render the disabled placeholder with the honest
  // copy; orphan-tail rows render nothing (D10-03/D10-05).
  const jump = jumpable ? (
    <a
      className="btn btn-icon review-jump"
      href={`#/article/${entry.highlight.articleId}/h/${entry.highlight.id}`}
      aria-label={`Go to highlight: ${ariaExcerpt}`}
    >
      {/* D21-06 — the layout hook rides the shared module's className prop
          (the card-hover tint selector in app.css). T-10-02c: the href is
          template-built from validated record ids only — the hashchange
          consumer re-parses through the same App.tsx grammar. */}
      <JumpToArticleIcon className="review-jump-glyph" />
    </a>
  ) : entry.article !== undefined ? (
    <button
      type="button"
      className="btn btn-icon review-jump"
      disabled
      aria-label={`Go to highlight: ${ariaExcerpt}. This highlight can't be located, so jumping is disabled.`}
    >
      <JumpToArticleIcon className="review-jump-glyph" />
    </button>
  ) : null;

  // The curation cluster — right-aligned icon buttons (the LibraryRow
  // anatomy), the jump first and the destructive control last. Accessible
  // names carry the quote excerpt prefix so rows are distinguishable in a
  // screen-reader list; the prefix includes the visible action (2.5.3).
  // Issue #117 — tags are keyed to highlightId, so EVERY row — ambiguous/
  // orphaned included — carries the editor. Issue #119 — the color button
  // names the row's current color (the stripe is decorative; A11Y-05).
  const actions = (
    <div className="review-row-actions">
      {jump}
      <button
        type="button"
        className="btn btn-icon review-row-action review-row-action-note"
        aria-label={`Edit note: ${ariaExcerpt}`}
        onClick={() => onEditNote(entry)}
      >
        <EditIcon />
      </button>
      <button
        type="button"
        className="btn btn-icon review-row-action review-row-action-color"
        aria-label={`Change color, currently ${highlightStateLabel(
          entry.highlight.color,
          entry.highlight.customColor,
        )}: ${ariaExcerpt}`}
        onClick={() => onChangeColor(entry)}
      >
        <DropletIcon />
      </button>
      <button
        type="button"
        className="btn btn-icon review-row-action review-row-action-tags"
        aria-label={`Edit tags: ${ariaExcerpt}`}
        onClick={() => onEditTags(entry)}
      >
        <TagIcon />
      </button>
      <button
        type="button"
        className="btn btn-icon review-row-action review-row-action-remove"
        aria-label={`Remove highlight: ${ariaExcerpt}`}
        onClick={(e) => onRemove(entry, e.currentTarget)}
      >
        <TrashIcon />
      </button>
    </div>
  );

  return (
    <>
      {content}
      {/* One foot line: date · badge at the inline start, the icon cluster
          at the inline end — no dead band between meta and actions. Both
          halves are non-interactive text + the shared cluster (the date and
          badge sit under the jump overlay like the library row's meta). */}
      <div className="review-row-foot">
        <div className="review-row-meta">
          <span className="review-date">{formatDate(entry.highlight.createdAt)}</span>
          {badgeText !== null && (
            <span className={`review-badge review-badge-${entry.status}`}>{badgeText}</span>
          )}
        </div>
        {actions}
      </div>
    </>
  );
}

/**
 * Issue #210 — one ARTICLE-NOTE review row. The quiet counterpart of
 * ReviewRow: the note text IS the row's content (there is no stored quote —
 * an article note has no passage, and the parent spec forbids fabricating
 * one), a visible "Article note" badge sits in the meta line so the type
 * filter's vocabulary is traceable to the row, and the action cluster is
 * exactly two affordances:
 *
 *   - "Open article" — an explicit native anchor to the plain
 *     #/article/<id> destination, which restores the saved canonical
 *     reading position (ADR-0001). NEVER a passage jump: there is no
 *     passage to jump to. Deliberately NOT a stretched whole-card overlay —
 *     activating the card must never navigate as a side effect (editing in
 *     place is the row's primary action).
 *   - "Edit note" — opens the shared ArticleNoteEditor INLINE in this row
 *     (the host wires it; see ReviewView's editorTarget state). Editing
 *     never navigates and never moves reading position.
 *
 * An emptied saved note (the store preserves it) renders its tag names as
 * the identification line — the ArticleNotes entry vocabulary — or the calm
 * no-text line when it carries neither text nor tags.
 *
 * All text renders as React text children (T-10-02b — escaping by default).
 */
function ArticleNoteReviewRow({
  entry,
  editing,
  onEdit,
}: {
  entry: ArticleNoteReviewEntry;
  /** Whether this row's editor session is open (the row body is replaced
   * by the editor; the meta/foot stay so the row keeps its identity). */
  editing: boolean;
  onEdit: (entry: ArticleNoteReviewEntry, trigger: HTMLElement) => void;
}) {
  const text = entry.note.text;
  const tags = entry.note.tags ?? [];
  const ariaExcerpt = hasNoteContent(text)
    ? truncate(text, ARIA_MAX_CHARS)
    : tags.length > 0
      ? truncate(`Tags: ${tags.join(", ")}`, ARIA_MAX_CHARS)
      : "article note";
  const title = entry.article !== undefined ? effectiveTitle(entry.article) : null;
  return (
    <>
      {!editing && (
        <div className="review-row">
          <p className="review-quote review-quote-note">
            {hasNoteContent(text)
              ? text
              : tags.length > 0
                ? `Tags: ${tags.join(", ")}`
                : "No note text yet."}
          </p>
        </div>
      )}
      <div className="review-row-foot">
        <div className="review-row-meta">
          <span className="review-date">{formatDate(entry.note.createdAt)}</span>
          {/* The type badge — visible vocabulary for the type filter; the
              orphan case adds the shared "Article missing" badge. */}
          <span className="review-badge review-badge-note">Article note</span>
          {entry.status === "orphan" && (
            <span className="review-badge review-badge-orphan">Article missing</span>
          )}
        </div>
        {/* The action cluster rests while the row's editor session is open:
            the editor IS the row's active surface, and an Open-article click
            mid-session would abandon it without the guarded close. */}
        {!editing && (
          <div className="review-row-actions">
            {/* The explicit navigation: a plain article anchor (the library
              row's own destination vocabulary — the canonical reading
              position restore). Deliberately .review-open, NOT .review-jump:
              no stretched overlay — the card never navigates as a side
              effect. Rendered as a real <a> only when the article exists;
              orphan rows have nothing to open. T-10-02c: the href is
              template-built from the validated record id. */}
            {entry.article !== undefined && (
              <a
                className="btn btn-icon review-open"
                href={`#/article/${entry.note.articleId}`}
                aria-label={`Open article: ${ariaExcerpt}${title !== null ? ` (${title})` : ""}`}
              >
                <JumpToArticleIcon className="review-jump-glyph" />
              </a>
            )}
            <button
              type="button"
              className="btn btn-icon review-row-action review-row-action-note"
              aria-label={`Edit article note: ${ariaExcerpt}`}
              onClick={(e) => onEdit(entry, e.currentTarget)}
            >
              <EditIcon />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * ReviewView — the cross-article annotation review panel, the Annotations
 * destination at #/annotations (issue #210 rename; the legacy
 * #/highlights and #/review URLs alias here via App.tsx normalization).
 * Reads the whole library (articles + highlights + notes + tags + article
 * notes) from the ONE LibrarySnapshot (Issue #8 — no own load, no own
 * status machine), derives sections purely in the render body (D10-09 — no
 * effect chains), and renders grouped-by-article sections plus the
 * never-drop orphan tail.
 *
 * Issue #76 (decision #72) — URL-borne per-article scope. `scopedArticleId`
 * (parsed by App's parseHash from `#/annotations?article=<id>`) is the ONE
 * article-filter state: while set, the filter row's article slot is the
 * removable scope chip, the "article" sort option hides, and the
 * derivation filters to that article (its orphan rows kept — a vanished
 * article's remaining highlights still render, badged "Article
 * missing"). Tag/confidence stay component state; clearing the scope
 * navigates to #/annotations (a real history push, so Back returns to the
 * scoped URL). Issue #107 — while unscoped, the slot is the searchable
 * ArticlePicker whose pick navigates INTO the scope: the URL owns the
 * article filter in both states (no hidden component-state filter a chip
 * clear could ever leave behind).
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
  // Issue #196 — the active theme's surface + ink pair for every custom
  // tint on this surface (stripe + color dialog): the ONE highlightBases
  // resolver, memoized on the settings record like the reader route does.
  const { settings } = useSettings();
  const reviewBases = useMemo(() => highlightBases(settings), [settings]);
  // Render-body aliases over the snapshot (the LibraryView discipline):
  // the old per-field article/highlight/note/tag states are deleted.
  const articles = snapshot.articles;
  const highlights = snapshot.highlights;
  const notes = snapshot.notes;
  // Issue #210 — the review's second row kind (saved article notes).
  const articleNotes = snapshot.articleNotes;
  const allTags = snapshot.tags;
  // D10-08: filters AND-compose; confidence "all" includes ambiguous and
  // orphan rows (tri-state is never silently filtered away). Issue #107 —
  // the article filter is NOT component state: the URL scope
  // (#/annotations?article=<id>) is the ONE article-filter state, so this
  // state carries the two tag dimensions + confidence + the issue #210
  // type dimension + free-text search. Issue #117 — the ONE tag dimension
  // split into two clearly named singles: articleTag (the pre-#117
  // meaning, byte-identical matches) + annotationTag (the entry's OWN
  // tags — a highlight's or an article note's; an orphan can still match
  // its own annotation tag). Issue #210 — type defaults to "all": article
  // notes are never hidden by default; query is the search box's value.
  const [filters, setFilters] = useState<Omit<ReviewFilters, "articleId">>({
    articleTag: null,
    annotationTag: null,
    confidence: "all",
    type: "all",
    query: "",
  });
  // D10-08: Date is the default sort.
  const [searchReset, setSearchReset] = useState(0);
  const [sort, setSort] = useState<ReviewSort>("date");
  // Plan 10-05 curation targets: the ReviewEntry under action (null when
  // the corresponding dialog is closed). Notes are keyed to highlightId, so
  // the note dialog opens for ANY row — orphan rows included (D10-11).
  // Issue #117 — tags are keyed to highlightId too: the tags dialog opens
  // for ANY row, ambiguous/orphaned included, and its copy never implies
  // the anchor was repaired.
  const [noteTarget, setNoteTarget] = useState<HighlightReviewEntry | null>(null);
  const [tagsTarget, setTagsTarget] = useState<HighlightReviewEntry | null>(null);
  const [removeTarget, setRemoveTarget] = useState<HighlightReviewEntry | null>(null);
  // Issue #174 — the neighboring rows of the row about to be removed,
  // captured from the clicked Remove button BEFORE the row unmounts (both
  // the immediate and confirm paths). After a successful removal, focus
  // moves to the FOLLOWING row's Remove button (else the preceding row's) —
  // the removed row's own button unmounts, so a trigger restore would
  // silently drop focus.
  const removedRowNeighborsRef = useRef<{ after: HTMLElement | null; before: HTMLElement | null }>({
    after: null,
    before: null,
  });
  // Issue #119 — the row whose color is being edited (null = dialog closed).
  // Like notes, color is keyed to highlightId alone, so the dialog opens for
  // ANY row — ambiguous and orphan-tail rows included.
  const [colorTarget, setColorTarget] = useState<HighlightReviewEntry | null>(null);
  // Issue #210 — the article-note row whose editor session is open, plus
  // the clicked Edit trigger (focus returns to it on a safe close). The
  // session is INLINE in the row: no navigation, no reading-position
  // change, no modal — the row body becomes the shared ArticleNoteEditor.
  const [noteEditorTarget, setNoteEditorTarget] = useState<{
    entry: ArticleNoteReviewEntry;
    /** Whether the session opened on a RECOVERY draft (the guarded close
     *  re-persists recovered writing — the drawer path's rule, one
     *  discipline everywhere the note is edited from). */
    recovered: boolean;
  } | null>(null);
  // D10-12: the calm curation result announced through the .status live
  // region ("Highlight removed." / "Note saved."). Null = nothing to
  // announce (loading/error/empty states own the region then).
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // Plan 14-03 Task 1 (D14-02/D14-01/D14-03; content renamed by Plan 15-01
  // / D15-06, then issue #210) — the Annotations destination's title +
  // warm-gated mount focus (the LibraryView 14-02 Task 3 twin).
  // setDocumentTitle appends the suffix inside the ONE helper; the h1
  // focus fires ONLY when this mount followed an in-app navigation —
  // hasAppHistory is App's already-threaded flag doubling as the
  // per-mount warm signal (false on cold loads and reloads by
  // construction, so cold arrivals never move focus). No cleanup —
  // focusing twice is idempotent and StrictMode-safe (Pitfall 9). No
  // live region, no announcement code (D14-09 — the focused h1 IS the
  // announcement). Overlays in this view (none today; dialogs are
  // ArticleView/global) touch neither the title nor this focus.
  useEffect(() => {
    setDocumentTitle("Annotations");
    if (hasAppHistory) h1Ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // ── Issue #174 — deletion proportional to the written content removed ──

  /** Resolve a row's nearest neighbors from a clicked control (still
   *  mounted — capture BEFORE any write unmounts it). The neighbors are
   *  document-order siblings across ALL sections, not just the same section
   *  list, so a section's last row hands focus into the next section's
   *  first row. ONE capture shape for both handoffs (the removed-highlight
   *  and the deleted-article-note focus paths). */
  const captureRowNeighbors = useCallback((trigger: HTMLElement) => {
    const row = trigger.closest("li.review-item");
    if (!row) {
      return { after: null, before: null };
    }
    const rows = Array.from(document.querySelectorAll("li.review-item"));
    const index = rows.indexOf(row);
    const after = rows[index + 1] as HTMLElement | undefined;
    const before = rows[index - 1] as HTMLElement | undefined;
    return { after: after ?? null, before: before ?? null };
  }, []);

  /** The post-removal focus handoff: the FOLLOWING row's Remove button (the
   *  same cluster position the reader just used), else the PRECEDING row's,
   *  else — the library just emptied — the page h1 (the mount-focus target).
   *  Runs from the confirm dialog's close event (modal already released) or
   *  straight after an immediate removal; the keyed row elements survive
   *  the snapshot re-derivation, so a neighbor captured before the write is
   *  still connected after the reload lands. */
  const focusNearRemovedRow = useCallback(() => {
    const { after, before } = removedRowNeighborsRef.current;
    removedRowNeighborsRef.current = { after: null, before: null };
    const neighbor = [after, before].find((el) => el?.isConnected) ?? null;
    const button = neighbor?.querySelector<HTMLElement>(".review-row-action-remove");
    if (button) {
      button.focus();
      return;
    }
    h1Ref.current?.focus();
  }, []);

  /** The immediate removal path — a highlight with NO note (empty or
   *  whitespace-only, the ONE hasNoteContent predicate) has no written
   *  content to lose, so the Remove click deletes directly through the
   *  same one-call Dexie cascade the confirm dialog uses. Failure
   *  announces the ONE shared copy through the page status region and
   *  leaves the row (and its note — nothing was written) untouched: never
   *  a success lie (the issue #98 register). */
  const removeHighlightNow = useCallback(
    async (entry: HighlightReviewEntry) => {
      try {
        await deleteHighlight(entry.highlight.id);
      } catch {
        setAnnouncement(HIGHLIGHT_REMOVE_FAILED_COPY);
        return;
      }
      invalidateLibrarySnapshot();
      setAnnouncement("Highlight removed.");
      focusNearRemovedRow();
    },
    [focusNearRemovedRow],
  );

  /** The Remove click router (issue #174): a highlight with a nonempty note
   *  opens the cascade-honest confirm dialog (Keep highlight keeps initial
   *  focus — Pitfall 8); a note-less highlight removes immediately — the
   *  same proportionality the reader's NotePopover applies. Either way the
   *  write is the direct result of this deliberate reader click. */
  const handleRemoveRequest = useCallback(
    (entry: HighlightReviewEntry, trigger: HTMLElement) => {
      removedRowNeighborsRef.current = captureRowNeighbors(trigger);
      if (hasNoteContent(entry.note?.text ?? "")) {
        setRemoveTarget(entry);
        return;
      }
      void removeHighlightNow(entry);
    },
    [captureRowNeighbors, removeHighlightNow],
  );

  // D10-09 — pure derivation in the render body (the filterLibrary
  // pattern): join → classify → filter → group → sort, no effect chains.
  //
  // Issue #107 — the URL scope is the ONE article filter: it composes into
  // the derivation here (null while unscoped), while the "article" sort
  // coerces to the Date default while scoped (its option is hidden — the
  // coercion keeps the hidden select's value honest across a Back/Forward
  // re-entry).
  const scoped = scopedArticleId !== undefined;
  const effectiveFilters: ReviewFilters = {
    articleTag: filters.articleTag,
    annotationTag: filters.annotationTag,
    articleId: scopedArticleId ?? null,
    confidence: filters.confidence,
    type: filters.type,
    query: filters.query,
  };
  const effectiveSort: ReviewSort = scoped && sort === "article" ? "date" : sort;
  const derivation = deriveReviewSections(
    articles,
    highlights,
    notes,
    articleNotes,
    effectiveFilters,
    effectiveSort,
  );

  // Issue #76 — scope resolution: the scoped article's record (its
  // EFFECTIVE title names the chip) and whether it vanished (deleted, or
  // the URL id never existed — one mechanism, the chip says so either way).
  const scopedArticle = scoped ? articles.find((a) => a.id === scopedArticleId) : undefined;
  const scopeVanished = scoped && scopedArticle === undefined;

  // Issue #76/#107 — per-article ANNOTATION counts for the picker's
  // suggestions (issue #210 — the combined fold; the picker's counts are
  // labeled "annotations" and its browse list includes articles carrying
  // only article notes). The library rows keep the highlight-only fold.
  const annotationCountByArticleId = snapshot.annotationCountByArticleId;

  // D10-10: the filters-matched-zero case is "both derived lists empty
  // while the stored annotation set is non-empty" (computed after the
  // derivation so the .status branch below stays honest). Issue #210 — the
  // stored set spans BOTH kinds: a library holding only article notes is
  // NOT a no-content library.
  const derivedEmpty = derivation.sections.length === 0 && derivation.orphanEntries.length === 0;

  // Issue #119 — the color dialog's target record is found by the immutable
  // highlight id from the FRESH snapshot (never the captured entry), so an
  // applied slot's tag write lands on the CURRENT row (issue #222 — the
  // dialog applies slots: the additive tag union needs the record's tags).
  const colorTargetRecord =
    colorTarget !== null ? highlights.find((h) => h.id === colorTarget.highlight.id) : undefined;
  // Issue #210 — the combined count line's total (both annotation kinds;
  // computed once — the render-body alias discipline).
  const totalAnnotations = snapshot.highlights.length + snapshot.articleNotes.length;

  // ── Issue #210 — the article-note editor session (inline in the row) ──

  // The neighboring rows of the row about to LOSE its editor to a delete,
  // captured while the row is still mounted. After the delete lands and
  // the row unmounts, focus moves to the FOLLOWING row's first action,
  // else the PRECEDING row's, else the page h1 — the removed-highlight
  // handoff vocabulary, generalized to any row action (a note row has no
  // Remove button; the neighbor's first control is the honest target).
  const noteRowNeighborsRef = useRef<{ after: HTMLElement | null; before: HTMLElement | null }>({
    after: null,
    before: null,
  });

  /** Open the inline editing session for an article-note row. The
   *  established recovery rule rides along: a NEWER recovery draft (the
   *  reader's interrupted writing, possibly from the reader surface)
   *  opens instead of the stale saved row, flagged recovered so the
   *  guarded close re-persists it — the ONE draft store, one recovery
   *  discipline, wherever the note is edited from. The deleted-row focus
   *  handoff captures the row's neighbors now, while it is mounted. */
  const noteEditorOpeningRef = useRef(false);
  const openNoteEditor = useCallback(
    async (entry: ArticleNoteReviewEntry, trigger: HTMLElement) => {
      if (noteEditorTarget !== null || noteEditorOpeningRef.current) return;
      noteEditorOpeningRef.current = true;
      noteRowNeighborsRef.current = captureRowNeighbors(trigger);
      let initial = entry.note;
      let recovered = false;
      try {
        const loaded = await loadArticleNotes(entry.note.articleId);
        initial = loaded.notes.find((note) => note.id === entry.note.id) ?? initial;
        const draft = loaded.drafts.find(
          (d) => d.id === entry.note.id && d.updatedAt >= initial.updatedAt,
        );
        if (draft) {
          initial = draft;
          recovered = true;
        }
      } catch {
        // Draft load failed: open on the saved row (the editor's own
        // failure copy still guards the writes).
      }
      if (recovered) setAnnouncement("Recovered draft");
      setNoteEditorTarget({ entry: { ...entry, note: initial }, recovered });
      noteEditorOpeningRef.current = false;
    },
    [captureRowNeighbors, noteEditorTarget],
  );

  // The safe-close focus handoff: the action cluster RESTS (unmounts) while
  // the session is open, so the Edit control must be focused AFTER React
  // commits the post-close render — an effect keyed on the session's end,
  // resolving the control fresh by the row's data-article-note-id.
  // T-10-01a — note ids may arrive from imported bundles; CSS.escape keeps
  // the attribute lookup a literal match, never a selector injection
  // surface.
  const pendingNoteEditorFocusRef = useRef<string | null>(null);
  // The confirmed-delete handoff rides the SAME post-commit discipline, for
  // one more reason than unmount timing: while a session is open the OTHER
  // rows carry inert, and a focus() into an inert subtree is a silent no-op
  // — the synchronous handoff lost focus to <body> on every engine (the
  // confirm button unmounted before anything focusable accepted it). The
  // captured neighbors are stashed here and resolved AFTER the commit that
  // clears both inert and the unmounting editor.
  const pendingDeletedNoteFocusRef = useRef<{
    after: HTMLElement | null;
    before: HTMLElement | null;
  } | null>(null);
  useEffect(() => {
    if (noteEditorTarget !== null) return;
    const deletedNeighbors = pendingDeletedNoteFocusRef.current;
    if (deletedNeighbors !== null) {
      pendingDeletedNoteFocusRef.current = null;
      const neighbor =
        [deletedNeighbors.after, deletedNeighbors.before].find((el) => el?.isConnected) ?? null;
      const control = neighbor?.querySelector<HTMLElement>("button, a");
      if (control) {
        control.focus();
        return;
      }
      h1Ref.current?.focus();
      return;
    }
    const noteId = pendingNoteEditorFocusRef.current;
    pendingNoteEditorFocusRef.current = null;
    if (noteId === null) return;
    const row = document.querySelector(`li[data-article-note-id="${CSS.escape(noteId)}"]`);
    const button = row?.querySelector<HTMLElement>(".review-row-action-note");
    if (button) button.focus();
    else h1Ref.current?.focus();
  }, [noteEditorTarget]);

  /** The session's safe close (queue drained) or confirmed delete. A close
   *  schedules the post-commit focus handoff (above); a delete re-derives
   *  the snapshot (the row vanishes) and hands focus along the captured
   *  neighbors — the removed-highlight vocabulary, generalized. */
  const closeNoteEditor = useCallback(
    ({ deleted }: { deleted: boolean }) => {
      const noteId = noteEditorTarget?.entry.note.id ?? null;
      setNoteEditorTarget(null);
      // ONE invalidation per session end: every accepted write already
      // persisted through the store; the re-derivation retires stale rows
      // (and the deleted row) without per-keystroke reloads.
      invalidateLibrarySnapshot();
      if (deleted) {
        setAnnouncement("Article note deleted.");
        // Hand focus along the captured neighbors — but AFTER the commit:
        // stashed for the session-end effect above, which resolves once
        // inert has cleared and the editor has unmounted (the synchronous
        // focus here was a silent no-op — see pendingDeletedNoteFocusRef).
        pendingDeletedNoteFocusRef.current = noteRowNeighborsRef.current;
        noteRowNeighborsRef.current = { after: null, before: null };
        return;
      }
      pendingNoteEditorFocusRef.current = noteId;
    },
    [noteEditorTarget],
  );

  /** The kind-aware row renderer shared by the sections and the orphan
   *  tail: highlight entries keep the jump-overlay + curation-cluster row;
   *  article-note entries render the explicit-action row and, while its
   *  session is open, host the shared ArticleNoteEditor above the foot (the
   *  writing area replaces the row body — no stale preview, no navigation,
   *  no reading-position change). */
  const renderEntry = (entry: ReviewEntry) => {
    if (entry.kind === "article-note") {
      const editing = noteEditorTarget?.entry.note.id === entry.note.id;
      return (
        <li
          key={entry.note.id}
          className="review-item review-item-note"
          data-article-note-id={entry.note.id}
          inert={noteEditorTarget !== null && !editing}
        >
          {editing && noteEditorTarget !== null && (
            <ArticleNoteEditor
              key={noteEditorTarget.entry.note.id}
              initial={noteEditorTarget.entry.note}
              recovered={noteEditorTarget.recovered}
              saved
              onStatusChange={setAnnouncement}
              onClosed={closeNoteEditor}
            />
          )}
          <ArticleNoteReviewRow
            entry={entry}
            editing={editing}
            onEdit={(e, trigger) => void openNoteEditor(e, trigger)}
          />
        </li>
      );
    }
    return (
      <li
        key={entry.highlight.id}
        inert={noteEditorTarget !== null}
        {...reviewStripeProps(entry.highlight.customColor, reviewBases, entry.highlight.color)}
      >
        <ReviewRow
          entry={entry}
          onEditNote={setNoteTarget}
          onEditTags={setTagsTarget}
          onRemove={handleRemoveRequest}
          onChangeColor={setColorTarget}
        />
      </li>
    );
  };

  return (
    <main id="main">
      <header className="review-header">
        {/* One h1 per page (D10-01) — skip-link parity via main#main.
            Plan 14-03 Task 1: gains ONLY tabIndex={-1} + the focus ref;
            issue #210: text renamed to "Annotations" (the surface reviews
            both annotation kinds), level byte-stable. */}
        <h1 ref={h1Ref} tabIndex={-1}>
          Annotations
        </h1>
        {/* Issue #210 — the combined review count, labeled annotations (the
            reader header's count stays highlight-only; THIS is the combined
            surface). Spare-chrome silence at zero: the no-content state owns
            the empty story. */}
        {status === "ready" && totalAnnotations > 0 && (
          <p className="review-count">
            {countFormatter.format(totalAnnotations)}{" "}
            {totalAnnotations === 1 ? "annotation" : "annotations"}
          </p>
        )}
      </header>
      {/* The status region (LibraryView's twin) carries the loading + error
          states, both D10-10 empty states, AND the D10-12 curation
          announcements — distinct, honest copies announced politely. The
          zero-highlights branch adopts the ONE no-content anatomy (issue
          #98: outline-level title + one sentence — h2 on this page), the
          library/drawer empties' anatomy. */}
      <StatusRegion>
        {announcement !== null && <p>{announcement}</p>}
        {status === "loading" && <p>Opening your annotations…</p>}
        {status === "error" && (
          <>
            <h2>Couldn't open your annotations.</h2>
            <p>
              Your annotations could not be loaded. Go back to the library and open this page again.
            </p>
          </>
        )}
        {status === "ready" && highlights.length === 0 && articleNotes.length === 0 && (
          <>
            <h2>No annotations yet</h2>
            <p>Highlights and article notes you make while reading appear here.</p>
          </>
        )}
        {status === "ready" &&
          (highlights.length > 0 || articleNotes.length > 0) &&
          derivedEmpty &&
          // Issue #76 (decision #72) — the two zero-matches states share one
          // gate (rows exist, none survive the derivation): the vanished-
          // scope calm empty state with its back-to-all affordance, or the
          // plain filter miss.
          (scopeVanished ? (
            <div className="review-scope-empty">
              <p>This article is no longer in your library, and no annotations remain for it.</p>
              {/* the calm back-to-all affordance for a vanished scope: a
                  real link to the unscoped review (a history push, so Back
                  returns to the scoped URL). */}
              <a className="btn btn-quiet review-scope-back" href="#/annotations">
                Show all annotations
              </a>
            </div>
          ) : (
            <p>No annotations match these filters.</p>
          ))}
      </StatusRegion>
      {/* D10-08 filter row — the issue #210 search box + type select, the
          two clearly named single-select tag dimensions (issue #117) +
          article select + confidence select + sort select, AND-composed.
          Always mounted so the reader can adjust filters even before the
          load settles (the derivation runs over whatever is loaded).
          Article-tag chips read the library vocabulary (snapshot.tags —
          article ∪ book tags, the pre-#117 chip list); Annotation-tag chips
          read the ONE annotation-tag vocabulary fold (snapshot.annotationTags
          — highlights ∪ article notes). Either renders nothing at zero tags
          (spare-chrome silence — no backfill copy). */}
      {/* Keep the session mounted until Done/Escape drains its save queue.
          Filters and other rows resume after that guarded close. */}
      <div className="review-filter-row" inert={noteEditorTarget !== null}>
        {/* Issue #210 — the search box (the LibrarySearch twin: a controlled
            <input type="search"> in a <form role="search"> landmark,
            filter-on-keystroke, no submit button). Matches highlight quote
            + passage-note text + annotation tags + article-note text — the
            derivation's haystack; AND-composes with every other dimension. */}
        <form role="search" className="review-search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="review-search" className="visually-hidden">
            Search annotations
          </label>
          <input
            id="review-search"
            name="q"
            type="search"
            placeholder="Search quotes, notes, and tags"
            autoComplete="off"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          />
        </form>
        {/* Issue #210 — the annotation-type dimension. "All" is the default
            (article notes are never hidden by default); the specific values
            name the row kind verbatim. */}
        <div className="review-filter-group">
          <label className="review-filter-label" htmlFor="review-type-filter">
            Type
          </label>
          <select
            id="review-type-filter"
            className="review-select"
            value={filters.type}
            onChange={(e) =>
              setFilters((f) => ({ ...f, type: e.target.value as ReviewTypeFilter }))
            }
          >
            <option value="all">All</option>
            <option value="highlights">Highlights</option>
            <option value="article-notes">Article notes</option>
          </select>
        </div>
        <TagFilter
          name="Article tag"
          tags={allTags}
          activeTag={filters.articleTag}
          onSelect={(articleTag) => setFilters((f) => ({ ...f, articleTag }))}
        />
        <TagFilter
          name="Annotation tag"
          tags={snapshot.annotationTags}
          activeTag={filters.annotationTag}
          onSelect={(annotationTag) => setFilters((f) => ({ ...f, annotationTag }))}
        />
        {/* Issue #76 + #107 — the article slot, two states: while
            unscoped, the searchable ArticlePicker (browse = highlighted
            articles with counts; search finds every article; a pick
            navigates into the URL scope); while scoped, the removable
            scope chip. One slot, two states — never both. */}
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
              <span className="review-scope-chip-text" id="review-scope-chip-text">
                {scopedArticle !== undefined ? effectiveTitle(scopedArticle) : "(deleted article)"}
              </span>
              {/* The chip's inside-× clear (the TagEntry chip-remove
                  anatomy): keyboard-complete, navigates to the unscoped
                  review (a history push — Back returns to the scoped
                  URL). */}
              <button
                type="button"
                className="tag-chip-remove review-scope-chip-remove"
                aria-label="Show annotations from all articles"
                onClick={() => {
                  window.location.hash = "#/annotations";
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
            {/* Issue #107 — picking IS scoping: the hash push lands on
                #/annotations?article=<id> (a real history entry, so Back
                returns to the unscoped picker) and the chip takes over
                the slot on the remount-free hashchange. */}
            <ArticlePicker
              key={searchReset}
              articles={articles}
              counts={annotationCountByArticleId}
              inputId="review-article-filter"
              onPick={(articleId) => {
                window.location.hash = `#/annotations?article=${articleId}`;
              }}
            />
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
        <button
          type="button"
          className="btn btn-quiet review-clear-filters"
          onClick={() => {
            setFilters({
              articleTag: null,
              annotationTag: null,
              confidence: "all",
              type: "all",
              query: "",
            });
            setSearchReset((n) => n + 1);
            window.location.hash = "#/annotations";
          }}
        >
          Clear filters
        </button>
      </div>
      {/* D10-07 legend — explains the badge vocabulary quietly. */}
      <p className="review-legend">No badge means anchored confidently.</p>
      {/* D10-04/D10-06 — grouped-by-article sections. Section key is the
          article id (the 10-01 derivation contract). Issue #210 — entries
          render through ONE kind-aware row renderer: highlights keep the
          jump-overlay + curation-cluster row; article notes carry the
          explicit Open article action + the inline editor session. */}
      {derivation.sections.map((section) => {
        const host = sourceHost(section.article);
        return (
          <section className="review-section" key={section.key}>
            <h2>
              {effectiveTitle(section.article)}
              {host !== null && <span className="review-section-host"> · {host}</span>}
            </h2>
            <ul className="review-section-list">{section.entries.map(renderEntry)}</ul>
          </section>
        );
      })}
      {/* D10-05 — the never-drop orphan tail. Issue #210 — the tail holds
          BOTH annotation kinds (a vanished article's notes keep rendering,
          badged "Article missing"), so the heading names the surface's own
          vocabulary ("Annotations without an article") instead of the
          markdown export's highlight-specific heading. Rows here have no
          jump/open affordance at all — but ARE curatable in place (D10-11:
          notes are keyed to highlightId, and a delete needs only the
          highlight row; an orphaned article note still edits in place and
          still opens nowhere — there is no article to open). */}
      {derivation.orphanEntries.length > 0 && (
        <section className="review-section review-section-orphan">
          <h2>Annotations without an article</h2>
          <ul className="review-section-list">{derivation.orphanEntries.map(renderEntry)}</ul>
        </section>
      )}
      {/* Plan 10-05 curation wiring (+ issue #117's tags editor). All three
          dialogs are always mounted
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
          setAnnouncement(saved ? "Note saved." : NOTE_SAVE_FAILED_COPY);
        }}
      />
      {/* Issue #117 — the highlight-tag editor twin. Always mounted
          (showModal requires DOM presence). The commit discipline is the
          RowTagsPopover one: writes land per picker change; the panel's
          invalidation + honest announcement happen ONCE on close ("Tags
          saved." only after a write that landed; an untouched session
          closes silently — nothing was written, nothing is announced). */}
      <ReviewTagsDialog
        open={tagsTarget !== null}
        highlightId={tagsTarget?.highlight.id ?? ""}
        tags={tagsTarget?.highlight.tags ?? []}
        onDone={(outcome) => {
          setTagsTarget(null);
          if (outcome === "untouched") return;
          invalidateLibrarySnapshot();
          setAnnouncement(outcome === "saved" ? "Tags saved." : TAGS_SAVE_FAILED_COPY);
        }}
      />
      {/* Issue #174 — the remove confirm is routed ONLY for highlights with
          a nonempty note (handleRemoveRequest above); note-less rows remove
          immediately from the Remove click. The dialog's close after a
          successful delete hands focus to the neighboring row (the captured
          trigger — the removed row's button — unmounts); cancel/Esc keep the
          plain trigger restore. */}
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
        onRemovedClose={focusNearRemovedRow}
        onCancel={() => setRemoveTarget(null)}
      />
      {/* Issue #119 — the color editor; issue #222 — it hosts the SAME
          slot-pills entry the annotation panel hosts (one vocabulary). The
          apply routes through the TWO review seams in the reader seam's
          write order: the additive tag union first, then the color+hex — and
          ONLY a resolved pair invalidates the snapshot; the entry surfaces
          the inline "Couldn't apply slot." status and never a success card
          (the visible change is the register). Every close path (Done, Esc,
          scrim) merely dismisses: applies have already committed. The slots
          ride the settings record (the ONE vocabulary — the same five the
          reader's panel and toolbar render). */}
      <ReviewColorDialog
        open={colorTarget !== null}
        highlightId={colorTarget?.highlight.id ?? ""}
        slots={settings.highlightSlots}
        bases={reviewBases}
        applySlot={async (slot) => {
          if (colorTarget === null) return;
          const id = colorTarget.highlight.id;
          // The ONE applySlotWrites shape (the reader seam's write order +
          // best-effort compensation, shared — issue #222): the additive tag
          // union first, then the color+hex. The slot's ACTIVE hex rides; a
          // named slot passes no hex (the ONE seam clears any earlier
          // snapshot — the dormancy gate).
          await applySlotWrites({
            existingTags: colorTargetRecord?.tags ?? [],
            slot,
            writeTags: (tags) => setHighlightTags(id, tags),
            writeColor: () => setHighlightColor(id, slot.color, activeCustomColor(slot)),
          });
          invalidateLibrarySnapshot();
        }}
        excerpt={
          colorTarget
            ? firstFragmentExcerpt(colorTarget.highlight.quote.exact, CONFIRM_EXCERPT_MAX_CHARS)
            : ""
        }
        onClose={() => setColorTarget(null)}
      />
    </main>
  );
}
