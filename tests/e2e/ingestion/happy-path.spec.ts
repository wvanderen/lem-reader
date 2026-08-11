// Wave-0 stub — ING-01 (real URL → article opens in reader; SC#1 happy path).
// Replaced by Plan 07-07. The `test.skip` below is a Wave-0 test.todo
// placeholder (Playwright 1.61.1 has no `test.todo`, so the executable form is
// `test.skip`; the literal `test.todo` token is retained in this header so the
// ING-07 repo-wide grep gate counts this file). 07-07 swaps it for the real
// end-to-end flow.
//
// Contract (RESEARCH.md §Validation Architecture L943 + §Gate happy-path):
// submit a real publisher URL via IngestControl, wait for the article to land
// in Dexie, open it via the existing #/article/:id route, and assert it
// paginates / annotates / restores location identically to a fixture (the
// load-bearing invariant — the reading engine cannot tell an ingested article
// from a fixture).
import { test } from "@playwright/test";

test.describe("ingestion happy path (Wave-0 stub — replaced by 07-07)", () => {
  test.skip("real URL → article opens in reader", async () => {});
});
