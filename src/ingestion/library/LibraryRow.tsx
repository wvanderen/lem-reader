// src/ingestion/library/LibraryRow.tsx
// Plan 08-03 Task 2 — LibraryRow. One article row in the personal library
// list. EXTENDS the v1.0 FixtureList `<li>` markup byte-stably per Pitfall 8-5
// + UI-SPEC §Regression Targets:
//
//   - `<h2 id="title-{id}">{title}</h2>`              (byte-stable)
//   - `<p class="meta">{author}</p>`                  (byte-stable; when present)
//   - `<a href="#/article/{id}" aria-labelledby="title-{id}">Open article</a>`
//                                                     (byte-stable href + text)
//
// Added as SIBLINGS inside the `<li>` (NOT structural changes — Pitfall 8-5):
//   - `<SourceBadge />`         (D8-02)
//   - `<ProgressHairline />`    (D8-11 — only when 0 < ratio < 0.98)
//   - `<p class="meta finished-mark">● Finished</p>` (D8-12 — only when ratio >= 0.98)
//   - `<ul class="library-row-tags">` of display-only `<span>` chips (D8-05)
//   - `<button class="library-row-remove">` (only when onRemove is provided —
//     Plan 04 wires it; default is no remove button in Plan 03)
//
// `ratio` is `Math.min(1, location.graphemeOffset / total)` where
// `total = graphemeClusters(normalizeText(article), article.lang).length`
// (D-05 substrate — reused UNCHANGED per Pitfall 2; do NOT fork). When no
// location is present, ratio = 0 → no hairline, no finished mark.
//
// Forced-colors safety (UI-SPEC §Interaction 10): the "Finished" mark uses a
// filled-circle glyph (●) + text so state is conveyed by shape + text, not
// color alone (mirrors Phase 5 mark.unresolved discipline).
import { useMemo } from "react";
import type { CanonicalArticle } from "../../content/types";
import type { LocationRecord } from "../../content/schema";
import { normalizeText, graphemeClusters } from "../../content/normalizeText";
import { ProgressHairline } from "../../reader/ProgressHairline";
import { SourceBadge } from "./SourceBadge";

/** D8-12 — articles at >= 98% grapheme-offset progress are "Finished". */
const FINISHED_RATIO = 0.98;

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
   * Optional remove-trigger handler. When present, the row renders a quiet
   * trash-glyph button (D8-13). Plan 04 (RemoveConfirm) wires this; Plan 03
   * leaves it undefined (no remove affordance on the row by default).
   */
  onRemove?: () => void;
}

export function LibraryRow({ article, location, onRemove }: LibraryRowProps) {
  const id = article.id;
  // Compute the grapheme-total once per article (D-05 substrate). useMemo so
  // the Intl.Segmenter pass doesn't re-run on every parent re-render (e.g.
  // when the user types in the search box).
  const total = useMemo(
    () => graphemeClusters(normalizeText(article), article.lang).length,
    [article],
  );
  const ratio = location ? Math.min(1, location.graphemeOffset / total) : 0;
  const isFinished = ratio >= FINISHED_RATIO;
  const showHairline = ratio > 0 && !isFinished;
  const tags = article.tags ?? [];
  return (
    <li className="library-row" key={id}>
      <article>
        {/* byte-stable h2 (Pitfall 8-5) */}
        <h2 id={`title-${id}`}>{article.provenance.title}</h2>
        {/* byte-stable author meta (omitted when absent) */}
        {article.provenance.author && (
          <p className="meta">{article.provenance.author}</p>
        )}
        {/* D8-02 source indicator + LIB-05 source link */}
        <SourceBadge article={article} />
        {/* D8-11 per-row progress hairline (only when 0 < ratio < 0.98) */}
        {showHairline && <ProgressHairline progress={ratio} />}
        {/* D8-12 finished mark (filled-circle glyph + text for forced-colors) */}
        {isFinished && (
          <p className="meta finished-mark">
            <span aria-hidden="true">●</span> Finished
          </p>
        )}
        {/* D8-05 display-only tag chips on the row (no edit affordance) */}
        {tags.length > 0 && (
          <ul className="library-row-tags">
            {tags.map((tag) => (
              <li key={tag}>
                <span className="tag-chip tag-chip-readonly">{tag}</span>
              </li>
            ))}
          </ul>
        )}
        {/* byte-stable Open-article link (Pitfall 8-5) */}
        <a href={`#/article/${id}`} aria-labelledby={`title-${id}`}>
          Open article
        </a>
        {/* Remove affordance — only when onRemove is wired (Plan 04) */}
        {onRemove && (
          <button
            type="button"
            className="library-row-remove"
            aria-label={`Remove ${article.provenance.title} from library`}
            onClick={onRemove}
          >
            <span aria-hidden="true">🗑</span>
          </button>
        )}
      </article>
    </li>
  );
}
