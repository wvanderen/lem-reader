// src/content/render/InlineRenderer.tsx
// Inline mark renderer (D-04 locked set: link, code, strong, em). Mark-
// application order: iterate run.marks and wrap the text node in array order
// (strong, em, code, link). The link mark uses the schema-validated href
// directly — the scheme allow-list already ran at Zod parse time (Pitfall 5
// defense in depth at the boundary). Inline <code> is rendered as <code>
// (styling lives in app.css). NEVER use the React raw-HTML injection prop
// anywhere in this file (Pitfall 6 — react/no-danger enforces statically).
//
// Phase 5 Plan 05-02 (D5-15 — inline highlight rendering): InlineList accepts
// an optional `highlightSlices` prop (produced by sliceRunsForHighlights from
// Plan 05-01). When present, each slice whose highlightId !== null is wrapped
// in <mark class="highlight" tabindex=0 aria-…>. The existing `Inline` mark-
// wrapping loop is REUSED UNCHANGED inside each slice (a link inside a
// highlight stays active — D5-07). NO parallel renderer is forked (DOC-02
// reading order + D-05 offset integrity depend on reusing this same output).
import type { InlineRun } from "../types";
import type { HighlightSlice } from "../../annotations/highlightRanges";

function Inline({ run }: { run: InlineRun }) {
  let node: React.ReactNode = run.text;
  for (const mark of run.marks) {
    switch (mark.type) {
      case "strong":
        node = <strong>{node}</strong>;
        break;
      case "em":
        node = <em>{node}</em>;
        break;
      case "code":
        node = <code>{node}</code>;
        break;
      case "link":
        // href was scheme-validated at Zod parse time (Pitfall 5)
        node = (
          <a href={mark.href} title={mark.title}>
            {node}
          </a>
        );
        break;
    }
  }
  return <>{node}</>;
}

/**
 * Build the aria-label for a highlighted slice (UI-SPEC §Copywriting).
 * Confident: "Highlight: {excerpt}" / "Highlight with note: {excerpt}".
 * Ambiguous: "Highlight that couldn't be matched: {excerpt}" (D5-04 —
 *   the reader is told the anchor is uncertain so they understand the
 *   dashed-outline marker + the disabled drawer jump).
 * Orphan: "Highlight that couldn't be relocated: {excerpt}".
 */
function highlightAriaLabel(slice: HighlightSlice): string {
  return highlightAriaLabelForText(
    slice.runs.map((r) => r.text).join(""),
    slice.hasNote,
    slice.status,
  );
}

/**
 * The text-based form of the per-slice aria-label derivation, shared with
 * the code-segment mark path (Plan 19-03 — one copy site for the §Copywriting
 * contract; the excerpt is slice/segment-local text capped at 80 chars).
 */
export function highlightAriaLabelForText(
  text: string,
  hasNote: boolean,
  status: "confident" | "ambiguous" | "orphan",
): string {
  const excerpt = text.slice(0, 80);
  if (status === "ambiguous") {
    return `Highlight that couldn't be matched: ${excerpt}`;
  }
  if (status === "orphan") {
    return `Highlight that couldn't be relocated: ${excerpt}`;
  }
  const prefix = hasNote ? "Highlight with note:" : "Highlight:";
  return `${prefix} ${excerpt}`;
}

export function InlineList({
  runs,
  highlightSlices,
}: {
  runs: InlineRun[];
  /**
   * Optional: the run slices produced by sliceRunsForHighlights (Plan 05-01).
   * When present, each slice whose highlightId !== null is wrapped in
   * <mark class="highlight"> with tabindex=0 + aria-label + aria-haspopup.
   * When absent (no highlights in this block), InlineList renders exactly as
   * before — the existing `runs` prop maps to <Inline> components directly.
   */
  highlightSlices?: HighlightSlice[];
}): React.ReactElement {
  // When no highlight slices are provided, render the runs directly (the
  // pre-Phase-5 path — byte-unchanged so existing tests regress nothing).
  if (!highlightSlices || highlightSlices.length === 0) {
    return (
      <>
        {runs.map((r, i) => (
          <Inline key={i} run={r} />
        ))}
      </>
    );
  }

  // Highlight-aware path: render each slice. Highlighted slices (highlightId
  // !== null) wrap in <mark class="highlight"> with ARIA. The Inline mark-
  // wrapping loop is reused UNCHANGED inside each slice (D5-07 — a link inside
  // a highlight stays active). React escapes text children + attributes — no
  // injection surface (Pitfall 8 / T-05-06 mitigation).
  return (
    <>
      {highlightSlices.map((slice, i) => {
        if (slice.highlightId === null) {
          // Un-highlighted gap slice — render its runs directly.
          return (
            <span key={i}>
              {slice.runs.map((r, j) => (
                <Inline key={j} run={r} />
              ))}
            </span>
          );
        }
        // Highlighted slice — wrap in <mark class="highlight">. The modifier
        // reflects the D5-02 tri-state (Plan 05-04): confident → bare fill;
        // hasNote → dotted underline; ambiguous/orphan → dashed outline
        // (.unresolved — Pitfall 7 never silent re-attach). The three shapes
        // are distinguishable by SHAPE alone (A11Y-05 forced-colors safety).
        const unresolved = slice.status !== "confident";
        const className = `highlight${slice.hasNote ? " has-note" : ""}${unresolved ? " unresolved" : ""}`;
        return (
          <mark
            key={i}
            // Phase 19 (Pitfall 2 — first-slice-only DOM id): the id stamps
            // ONLY the highlight's document-order first slice (slice.isFirst,
            // set by the slicer when the highlight's global start lies within
            // this block). data-highlight-id below stays on EVERY slice, so
            // activation/popover targeting + the shared identity are
            // unaffected; the jump focus target (ArticleView's
            // getElementById) lands at the span's start by construction.
            id={slice.isFirst === true ? `hl-${slice.highlightId}` : undefined}
            className={className}
            data-highlight-id={slice.highlightId}
            tabIndex={0}
            aria-label={highlightAriaLabel(slice)}
            aria-haspopup="dialog"
          >
            {slice.runs.map((r, j) => (
              <Inline key={j} run={r} />
            ))}
          </mark>
        );
      })}
    </>
  );
}

export { Inline };
