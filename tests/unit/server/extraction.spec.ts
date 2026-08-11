// Wave-0 stub — ING-01 / ING-02 (Readability output → 9-kind Block tree).
// Replaced by Plan 07-04. The `test.todo` placeholders prove the harness wires
// up now; 07-04 swaps them for real bodies feeding a representative publisher
// corpus through htmlToBlocks.
//
// Contract (RESEARCH.md §Validation Architecture L945 + §Pattern 2): the URL
// path and the paste-HTML path produce the SAME Block shape (input-source-
// agnostic pipeline, D7-03); Readability output maps onto the 9 block kinds
// via the exhaustive switch (Pattern F); anything unmappable → UnsupportedBlock.
import { describe, test } from "vitest";

describe("extraction (Wave-0 stub — replaced by 07-04)", () => {
  test.todo("Readability output maps to 9 block kinds");
  test.todo("paste-HTML path produces same Block shape as URL path");
});
