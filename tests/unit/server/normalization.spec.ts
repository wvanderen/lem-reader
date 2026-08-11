// Wave-0 stub — ING-01 / SC#1 (the round-trip anchor gate).
// Replaced by Plan 07-05. The `test.todo` placeholders prove the harness wires
// up now; 07-05 swaps them for the real assertRoundTripAnchor gate.
//
// Gate contract (RESEARCH.md §Pattern 4 L326-344 + §Gate 3 L972-973): every
// successfully ingested article MUST pass N-offset deriveQuoteSelector →
// resolveQuoteSelector → "confident" (reusing src/content/normalizeText.ts
// verbatim — Pitfall 2, no fork). An article that resolves to "ambiguous" or
// "orphan" is REFUSED (round-trip-anchor-failed), not admitted to the library.
import { describe, test } from "vitest";

describe("normalization / round-trip anchor gate (Wave-0 stub — replaced by 07-05)", () => {
  test.todo("representative fixture round-trips to confident");
  test.todo("extracted sample round-trips to confident");
  test.todo("article that cannot round-trip is refused");
});
