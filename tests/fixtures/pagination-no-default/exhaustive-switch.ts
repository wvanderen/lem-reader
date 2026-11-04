// tests/fixtures/pagination-no-default/exhaustive-switch.ts
// Issue #255 — the accepted fixture for the pagination no-default lint gate:
// a Pattern F exhaustive switch with NO default branch (a missing case fails
// to compile; the classifier stays total by construction). The gate's
// --self-test pass asserts this file produces zero violations.
type Watchface = "analogue" | "digital" | "sundial";

export function tickLength(face: Watchface): number {
  switch (face) {
    case "analogue":
      return 4;
    case "digital":
      return 2;
    case "sundial":
      return 8;
  }
}
