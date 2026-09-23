import type { CanonicalArticle } from "../../content/types";
import type { LocationRecord } from "../../content/schema";
import { ReadingStateButton } from "./ReadingStateButton";
import { SourceBadge } from "./SourceBadge";
import { articleReadingState } from "./readingState";
import { RowProgress, RowTags } from "./RowAnatomy";
import { EditIcon, HighlighterIcon, TrashIcon } from "../../ui/icons";
import {
  effectiveTitle,
  effectiveAuthor,
  videoDuration,
} from "./effectiveMetadata";

interface LibraryRowProps {
  /** The article this row represents. */
  article: CanonicalArticle;
  /**
   * Optional reading-location record for this article (used to compute the
   * per-row progress hairline + the Finished mark). Absent on first open or
   * when no location has been persisted for this article.
   */
  location?: LocationRecord;
  /**
   * The article's normalized-text grapheme total (Issue #3 — the ONE fold
   * lives in the LibrarySnapshot module; callers read it from
   * `snapshot.totalsByArticleId`, so this row never re-runs the
   * Intl.Segmenter pass itself).
   */
  total: number;
  /**
   * Optional remove-trigger handler. When present, the row renders a quiet
   * trash-glyph button (D8-13). Plan 04 (RemoveConfirm) wires this; Plan 03
   * leaves it undefined (no remove affordance on the row by default).
   */
  onRemove?: () => void;
  /**
   * Optional edit-metadata trigger handler (Plan 17-02 — D17-01). When
   * present, the row renders a quiet pencil-glyph button in the actions
   * cluster; LibraryView passes it ONLY on top-level article rows that are
   * Dexie-persisted (`ingestionMeta !== undefined` — bundled Sample fixtures
   * and book/chapter rows never do; D17-05/D17-06).
   */
  onEdit?: () => void;
  onReadingStateChange?: (read: boolean) => Promise<void>;
  /**
   * Heading level for the row title (Plan 12-05 — BookRow chapter sub-rows).
   * Default 2 keeps the standalone-row markup byte-stable (Pitfall 8-5);
   * 3 nests chapter sub-rows inside an expanded book group (h2 book title →
   * h3 chapter titles) so heading order is preserved within the group.
   */
  headingLevel?: 2 | 3;
  /**
   * Issue #38 — the quiet "{duration} read here" meta line (the ambient
   * stats card enrichment). Undefined when the article has no accrued
   * reading time at or above one minute — the suppression IS the empty
   * state. Plain text (readingStats.timeReadLabel); no interactive
   * elements, no new keyboard stops.
   */
  timeReadLabel?: string;
  /**
   * Issue #76 (decision #72) — this article's stored highlight count (read
   * from the ONE snapshot fold `highlightCountByArticleId`). When ≥ 1 the
   * row's action cluster gains the per-article review entry: an anchor to
   * the URL-scoped review (#/highlights?article=<id>) with the count in the
   * aria-label. 0 / undefined renders nothing — the gate IS the zero state.
   * Book rows never receive it (chapters yes / books no — the locked entry
   * set); chapter sub-rows do.
   */
  highlightCount?: number;
}

/**
 * Issue #67 (locked IA, variant A) — the ONE row anatomy for every library
 * row (standalone article, chapter sub-row): a MAIN column (title → metaline
 * → tags → progress/Finished) plus a right-aligned ICON action cluster
 * (mark-read check, edit pencil, trash). The title's stretched link keeps
 * the whole surface native-navigable (the "Title-led cards" CSS layer);
 * the cluster buttons ride above it via the shared z-index rule.
 */
export function LibraryRow({
  article,
  location,
  total,
  onRemove,
  onEdit,
  onReadingStateChange,
  headingLevel = 2,
  timeReadLabel,
  highlightCount,
}: LibraryRowProps) {
  const id = article.id;
  const ratio = location ? Math.min(1, location.graphemeOffset / total) : 0;
  // D14-20 — the finished decision routes through the ONE policy module
  // (readingState.ts); the ratio math above stays verbatim because the
  // progress block still needs it.
  const isFinished = articleReadingState(location, total) === "finished";
  const tags = article.tags ?? [];
  // Dynamic heading element (Plan 12-05): h2 (default — byte-stable for
  // standalone rows) or h3 (chapter sub-rows inside a book group). The id
  // contract (`title-{id}`) is identical at either level, so the
  // aria-labelledby open-link pairing is unchanged.
  const Title = headingLevel === 2 ? "h2" : "h3";
  const title = effectiveTitle(article);
  // Issue #76 — the review entry gates on ≥ 1 stored highlights; its
  // presence alone (chapter sub-rows) still earns the cluster. ONE gate
  // derivation, read by both the cluster below and the anchor in it.
  const hasHighlights = (highlightCount ?? 0) > 0;
  const hasCluster = Boolean(
    onReadingStateChange || onEdit || onRemove || hasHighlights,
  );
  return (
    <li className="library-row" key={id}>
      <article>
        <div className="library-row-main">
          {/* byte-stable title heading (Pitfall 8-5; h3 inside book groups).
              Plan 17-02 (D17-09): the VALUE SOURCE is the effectiveTitle
              derivation — markup shape + heading id stay byte-stable. */}
          <Title id={`title-${id}`}>
            <a className="library-card-link" href={`#/article/${id}`}>
              {title}
            </a>
          </Title>
          {/* Issue #67 — ONE metaline: author · source · duration · time
              read, all quiet p.meta items in the shared flex line (the
              .library-card-meta container; margins zeroed there). */}
          <div className="library-card-meta">
            {effectiveAuthor(article) && <p className="meta">{effectiveAuthor(article)}</p>}
            {/* D8-02 source indicator + LIB-05 source link */}
            <SourceBadge article={article} />
            {/* Issue #41 (flow N3) — the video duration as text (absent for
                every non-transcript source) via the ONE duration derivation. */}
            {videoDuration(article) && <p className="meta library-row-duration">{videoDuration(article)}</p>}
            {/* Issue #38 — the quiet "{duration} read here" line joins the
                metaline (was its own row). Absent under one minute of
                accrued time (silence is the empty state). */}
            {timeReadLabel && <p className="meta library-row-time-read">{timeReadLabel}</p>}
          </div>
          {/* D8-05 display-only tag chips on the row (no edit affordance) —
              the shared RowAnatomy piece. */}
          <RowTags tags={tags} />
          {/* Issue #67 — the progress block: "% read" + hairline while
              in progress; a quiet "Finished" chip once finished; NOTHING
              while unread (silence is the unread state) — the shared
              RowAnatomy piece. */}
          <RowProgress finished={isFinished} progress={ratio} />
        </div>
        {/* Issue #67 — the icon action cluster: mark-read · edit · trash,
            one arrangement for every row kind. Rendered only when at least
            one action is wired (chapter sub-rows carry none). */}
        {hasCluster && (
          <div className="library-row-actions">
            {onReadingStateChange && (
              <ReadingStateButton
                title={title}
                isRead={isFinished}
                onChange={onReadingStateChange}
              />
            )}
            {/* Edit-metadata affordance — Plan 17-02 (D17-01). Only when
              onEdit is wired (Dexie-persisted top-level rows only). Sits
              between mark-read and remove in the cluster; the aria-label
              template names the action + the EFFECTIVE title (the one name
              the reader sees). */}
            {onEdit && (
              <button
                type="button"
                className="btn btn-icon library-row-edit"
                aria-label={`Edit metadata for ${title}`}
                onClick={onEdit}
              >
                <EditIcon />
              </button>
            )}
            {/* Issue #76 (decision #72) — the per-article review entry: an
              anchor (native middle/new-tab semantics, the row-link
              precedent) to the URL-scoped review. Rendered ONLY at ≥ 1
              highlight; the count lives in the aria-label (the one
              accessible name), the glyph is aria-hidden. Sits between edit
              and remove so the destructive control stays last. */}
            {hasHighlights && (
              <a
                className="btn btn-icon library-row-highlights"
                href={`#/highlights?article=${id}`}
                aria-label={`Review ${highlightCount} ${
                  highlightCount === 1 ? "highlight" : "highlights"
                } for ${title}`}
              >
                <HighlighterIcon />
              </a>
            )}
            {/* Remove affordance — only when onRemove is wired (Plan 04). The
              glyph is the inline-SVG waste-bin below (Phase 13 G3 — real icon,
              not an emoji character); aria-label carries the accessible name
              and locates this button for the remove-cascade + dialog-centering
              specs, so its template stays byte-stable. */}
            {onRemove && (
              <button
                type="button"
                className="btn btn-icon library-row-remove"
                aria-label={`Remove ${title} from library`}
                onClick={onRemove}
              >
                <TrashIcon />
              </button>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
