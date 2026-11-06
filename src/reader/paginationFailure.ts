// src/reader/paginationFailure.ts
// Issue #240 — the ONE validated classifier from pagination diagnostics to
// reader-facing failure explanations. The engine (fragment.ts), the
// post-render overflow guard (overflowGuard.ts), the windowed adapter
// (WindowedPaginatedSurface.tsx), and the measurement layer (engine.ts)
// each emit typed diagnostic events; ArticleView's banner subscription is
// the only consumer, and this module is the only place an event becomes
// reader copy — a generic banner can never infer a cause again
// (long-work plan §5: "Replace the generic pagination banner's inference
// with typed reasons").
//
// The TWO reader-facing classes (issue #240 — never conflated):
//   unpageable-content — a genuine content limit: an element too large for
//     one page, an element that cannot be divided at a legal boundary, or a
//     one-pass length limit. The calm way forward is the disclosed,
//     reversible session flip to scrolling at the same passage
//     (flipsToScrolling: true — the flip is DISCLOSED by the banner copy and
//     reversed by the reader's Switch-to-pages action; the persisted
//     preference is never written, T-04-15).
//   processing-error — the reader's own pipeline failed. A zero-progress
//     stall is HERE, not with unpageable content: a stall is a property of
//     the processing pass (the same content paginates fine at another
//     viewport), so retry may resolve it. Modes are NOT flipped for this
//     class — the selected mode is never silently abandoned for a failure
//     retry may resolve; the banner offers retry + explicit scrolling
//     escape routes.
//
// Honesty rules enforced here (GLOSSARY + UI-SPEC):
//   - Diagnostic fields are NEVER rendered raw (T-04-14): the measurement
//     error message and unknown reason strings never reach reader copy.
//     An unknown/absent reason classifies as a processing error — the one
//     honest answer when the cause is not validated, never an inferred
//     content limit.
//   - Copy is static per reason (the ONE table below — the single seam
//     between machine reasons and reader words); the echoed `reason` is
//     always from the validated vocabulary or the "unrecognized" sentinel,
//     for diagnostics only.
//   - Length/capacity continuation is NOT a failure: the engine returns it
//     as status "ok" + continuation and this module is never consulted
//     (asserted in the e2e capacity-continuation coverage).
//
// V5 (Input Validation): the output is a Zod schema (PaginationFailureSchema)
// and the input is re-validated by the DiagnosticBus contract — consumers
// treat the returned failure as trusted static copy.
import { z } from "zod";
import type { DiagnosticEvent } from "../measurement/types";

/** The validated vocabulary of pagination failure reasons (issue #240). */
export const PAGINATION_FAILURE_REASONS = [
  // Engine guards (fragment.ts PAGE-04).
  "oversized-block",
  "page-ceiling",
  "zero-progress",
  "unsplittable-block-overflow",
  "measurement-scope-mismatch",
  // Post-render overflow guard (overflowGuard.ts).
  "overflow-page-ceiling",
  "overflow-atomic-too-tall",
  "overflow-no-progress",
  "overflow-no-legal-split",
  // Windowed adapter (WindowedPaginatedSurface.tsx).
  "unsupported-capacity-continuation",
  // PaginatedSurface's unexpected-exception catch (issue #240 — no silent
  // garbage: an unexpected crash emits a diagnostic instead of a blank page).
  "unexpected-pagination-error",
  // The measurement layer's failure kind (engine.ts — the message field is
  // diagnostic-only, never rendered).
  "measurement-error",
  // The sentinel for events whose reason is absent or outside the
  // vocabulary — the honest "cause not validated" echo.
  "unrecognized",
] as const;
export type PaginationFailureReason = (typeof PAGINATION_FAILURE_REASONS)[number];

export const PaginationFailureClassSchema = z.enum(["unpageable-content", "processing-error"]);
export type PaginationFailureClass = z.infer<typeof PaginationFailureClassSchema>;

export const PaginationFailureSchema = z.object({
  /** The two reader-facing failure classes — never conflated (issue #240). */
  failureClass: PaginationFailureClassSchema,
  /** The validated reason behind the classification (diagnostics only — never rendered raw). */
  reason: z.enum(PAGINATION_FAILURE_REASONS),
  /** Static calm heading naming the specific limit or failure. */
  heading: z.string(),
  /** Static body copy with the honest state and the way forward. */
  body: z.string(),
  /** Static sentence the one polite status region announces on appearance. */
  announce: z.string(),
  /**
   * True when the calm way forward includes the disclosed, reversible
   * session flip to scrolling (unpageable content). Processing errors keep
   * the reader in their selected mode — retry may resolve them.
   */
  flipsToScrolling: z.boolean(),
});
export type PaginationFailure = z.infer<typeof PaginationFailureSchema>;

const UNPAGEABLE_BODY =
  "Switched to scrolling so you can keep reading. You can switch back to pages anytime.";
const UNPAGEABLE_ANNOUNCE = "Switched to scrolling reading.";

const PROCESSING_HEADING = "Preparing this article as pages didn't finish.";
const PROCESSING_BODY =
  "Something went wrong while preparing pages. Your reading position is safe.";
const PROCESSING_ANNOUNCE = "Preparing pages failed. You can try again or read in scrolling.";

// The ONE reason→(class, specific heading) table. Unpageable-content
// headings name the SPECIFIC content limit; processing reasons share the
// one honest pipeline-failure heading (the class distinction is the
// reader-facing distinction — the machine reason stays on the failure
// object and in the diagnostic trail).
const REASON_TABLE: Record<
  Exclude<PaginationFailureReason, "unrecognized">,
  { failureClass: PaginationFailureClass; heading: string }
> = {
  "oversized-block": {
    failureClass: "unpageable-content",
    heading: "An element in this article is too large to fit on one page.",
  },
  "overflow-atomic-too-tall": {
    failureClass: "unpageable-content",
    heading: "An element in this article is too large to fit on one page.",
  },
  "unsplittable-block-overflow": {
    failureClass: "unpageable-content",
    heading: "An element in this article can't be divided across pages.",
  },
  "overflow-no-legal-split": {
    failureClass: "unpageable-content",
    heading: "An element in this article can't be divided across pages.",
  },
  "page-ceiling": {
    failureClass: "unpageable-content",
    heading: "This article is too long to prepare as pages in one pass.",
  },
  "overflow-page-ceiling": {
    failureClass: "unpageable-content",
    heading: "This article is too long to prepare as pages in one pass.",
  },
  "zero-progress": { failureClass: "processing-error", heading: PROCESSING_HEADING },
  "overflow-no-progress": { failureClass: "processing-error", heading: PROCESSING_HEADING },
  "unsupported-capacity-continuation": {
    failureClass: "processing-error",
    heading: PROCESSING_HEADING,
  },
  "measurement-scope-mismatch": {
    failureClass: "processing-error",
    heading: PROCESSING_HEADING,
  },
  "unexpected-pagination-error": {
    failureClass: "processing-error",
    heading: PROCESSING_HEADING,
  },
  "measurement-error": { failureClass: "processing-error", heading: PROCESSING_HEADING },
};

/**
 * Classify one diagnostic event into the reader-facing failure explanation.
 *
 * Returns null for events that are not reader-visible pagination failures
 * (measurement chatter stays invisible — D3-04). Known reasons get their
 * table entry; everything else — a future unknown guard, an absent reason —
 * classifies honestly as a processing error. Never throws on unknown input:
 * an unrecognized event kind yields null (the bus already validated the
 * shape).
 */
export function classifyPaginationFailure(event: DiagnosticEvent): PaginationFailure | null {
  if (event.kind === "measurement-error") {
    // The message is diagnostic-only (never rendered — T-04-14); the class
    // copy is static.
    return fromTable("measurement-error");
  }
  if (event.kind !== "dom-fallback") return null;
  const reason = event.reason ?? "";
  const known = Object.hasOwn(REASON_TABLE, reason);
  return fromTable(known ? (reason as keyof typeof REASON_TABLE) : "unrecognized");
}

function fromTable(reason: PaginationFailureReason): PaginationFailure {
  if (reason === "unrecognized") {
    return {
      failureClass: "processing-error",
      reason,
      heading: PROCESSING_HEADING,
      body: PROCESSING_BODY,
      announce: PROCESSING_ANNOUNCE,
      flipsToScrolling: false,
    };
  }
  const entry = REASON_TABLE[reason]!;
  const unpageable = entry.failureClass === "unpageable-content";
  return {
    failureClass: entry.failureClass,
    reason,
    heading: entry.heading,
    body: unpageable ? UNPAGEABLE_BODY : PROCESSING_BODY,
    announce: unpageable ? UNPAGEABLE_ANNOUNCE : PROCESSING_ANNOUNCE,
    flipsToScrolling: unpageable,
  };
}
