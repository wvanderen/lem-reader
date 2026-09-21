// src/ingestion/library/RowAnatomy.tsx
// Issue #67 review — the shared pieces of the ONE row anatomy (locked IA,
// variant A). LibraryRow (standalone article + chapter sub-rows) and BookRow
// COMPOSE these instead of hand-mirroring each other's markup: the tag-chip
// list (D8-05/D12-04 display-only chips) and the progress block (the quiet
// Finished chip at finished; "% read" + hairline while in progress; NOTHING
// while unread — silence is the unread state). DOM output is identical to
// the pre-extraction markup (the e2e class pins — .library-row-tags,
// .tag-chip-readonly, .finished-mark, .library-row-progress,
// .library-progress-label — are the contract).
import { ProgressHairline } from "../../reader/ProgressHairline";
import { percentRead } from "./readingState";

/** The display-only tag-chip list shared by every row kind. Renders nothing
 * while the record carries no tags (silence is the untagged state). */
export function RowTags({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="library-row-tags">
      {tags.map((tag) => (
        <li key={tag}>
          <span className="tag-chip tag-chip-readonly">{tag}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The progress block shared by every row kind: the ONE "Finished" chip
 * treatment when finished, otherwise "% read" + hairline while any progress
 * exists, otherwise nothing.
 *
 * @param finished The record's reading-state decision (the caller reads it
 *                 from the ONE policy module — readingState.ts — so the
 *                 block cannot disagree with counts or membership).
 * @param progress The 0..1 progress ratio feeding the label + hairline.
 */
export function RowProgress({
  finished,
  progress,
}: {
  finished: boolean;
  progress: number;
}) {
  if (finished) {
    return <p className="meta finished-mark">Finished</p>;
  }
  if (progress <= 0) return null;
  return (
    <div className="library-row-progress">
      <p className="meta library-progress-label">{percentRead(progress)}% read</p>
      <ProgressHairline progress={progress} />
    </div>
  );
}
