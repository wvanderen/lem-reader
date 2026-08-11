// Wave-0 stub — ING-06 (the three-state confidence model).
// Replaced by Plan 07-03. The `test.todo` placeholders mirror the threshold
// rows in RESEARCH.md §Confidence Thresholds L538-542; 07-03 swaps them for
// real bodies feeding articles with known signals through deriveConfidence.
//
// Contract (RESEARCH.md §Confidence Thresholds L529-546): the three-state
// contract (confident / low / unsupported) is locked; thresholds are empirical.
// isProbablyReaderable false → unsupported; blockCount >= 3 && textLength >=
// 500 → confident; otherwise → low (with optional unsupportedBlockRatio /
// textToContentRatio / linkDensity signals added only if corpus warrants).
import { describe, test } from "vitest";

describe("confidence thresholds (Wave-0 stub — replaced by 07-03)", () => {
  test.todo("isProbablyReaderable=false → unsupported");
  test.todo("blockCount>=3 && textLength>=500 → confident");
  test.todo("blockCount<3 || textLength<500 (readerable) → low");
  test.todo("unsupportedBlockRatio>0.4 → low");
});
