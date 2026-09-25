// src/ui/StatusRegion.tsx
// Issue #98 (decision #96) — the ONE polite status-region primitive. Owns
// the live-region contract every surface seam used to hand-roll:
//
//   role="status" + aria-live="polite" + aria-atomic="true" + the .status
//   quiet-card class.
//
// THE LAW — the state-kind table (CONTEXT.md terms). Every surface's
// zero/failure rendering conforms to exactly one of these kinds; the
// implementations stay hand-rolled, only the vocabulary is shared:
//
//   | Kind                | Pattern                                                      | In the app today |
//   |---------------------|--------------------------------------------------------------|------------------|
//   | no-content state    | title at the surface's outline level (h2 on pages, h3 in the | .library-empty,  |
//   |                     | drawer) + one sentence; no icons, no buttons, reading        | .drawer-empty,   |
//   |                     | measure. Invites the first action.                           | review zero      |
//   | filtered miss       | states the miss and offers the way back; never worded as if  | .library-no-     |
//   |                     | the library were empty.                                      | matches, review  |
//   |                     |                                                              | filter miss      |
//   | spare-chrome silence| renders NOTHING at zero for incidental chrome (rail, stats   | Continue-Reading |
//   |                     | line, tag filter, nav destinations). Silence IS the state.   | rail, stats line |
//   | refusal             | ingest declining content, calm reason + input preserved.     | Add-dialog       |
//   |                     | A no, not a failure.                                         | mapReasonToCopy  |
//   | error               | an operation that FAILED — loading, saving, importing —      | "Couldn't open   |
//   |                     | named honestly, with a next step; never blamed on the        | your library."   |
//   |                     | content or the reader.                                       | dialog error     |
//                                                                     lines        |
//
// Rules the primitive makes structural:
//   - No raw aria-live trio anywhere else in src/ — every polite region is
//     a StatusRegion. Screen readers hear ONE register app-wide. (Issue #98
//     review precision: the one disclosed exception is ArticleView's
//     first-paint paginated placeholder <p role="status" aria-live="polite">
//     — a single-line, non-atomic notice riding the PINNED pagination
//     geometry; moving it under this primitive would perturb the measured
//     surface the repagination budget protects.)
//   - The region NEVER unmounts conditionally: a live region must exist
//     before its content changes to announce reliably. Idle collapse is
//     CSS (the per-surface :empty variants — .add-dialog-inner .status:empty,
//     main#main > .status:empty), never `{error && <div role="status">}`.
//     (The static no-content states — drawer-empty, library-empty, review
//     zero — are the sanctioned shape exception: they mount as whole
//     replacement content in a surface ternary, the drawer-empty/#98
//     precedent.)
//   - children pass through unchanged; the per-surface classes compose via
//     className (storage-banner, drawer-empty, visually-hidden, …). The
//     four CSS collapse/layout variants stay per-surface — this component
//     adds no styling of its own beyond the shared .status card.
import type { ReactNode } from "react";

interface StatusRegionProps {
  /** Extra per-surface classes composed after the shared `.status` card
   * class (e.g. "visually-hidden", "storage-banner", "drawer-empty"). */
  className?: string;
  /** The state copy. Render unchanged; idle surfaces render no children
   * and collapse via their per-surface `:empty` CSS. */
  children?: ReactNode;
}

export function StatusRegion({ className, children }: StatusRegionProps) {
  return (
    <div
      className={className !== undefined ? `status ${className}` : "status"}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {children}
    </div>
  );
}
