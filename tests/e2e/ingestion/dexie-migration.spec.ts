// Wave-0 stub — SC#5 (v1 → v3 Dexie migration snapshot).
// Replaced by Plan 07-07. The `test.skip` below is a Wave-0 test.todo
// placeholder (Playwright 1.61.1 has no `test.todo`, so the executable form is
// `test.skip`; the literal `test.todo` token is retained in this header so the
// ING-07 repo-wide grep gate counts this file). 07-07 swaps it for the real
// seed → upgrade → assert flow.
//
// Contract (RESEARCH.md §Gate 4 L975-979 + 07-PATTERNS.md §dexie-migration):
// seed a Dexie v1/v2 database with the v1.0 fixture snapshot (settings +
// location + highlights + notes — representative rows), trigger the v3 upgrade
// by opening the app, and assert EVERY v1.0 row is intact and addressable.
// Mirrors v1.0's "honest full-suite execution discipline" applied to the data
// layer. The IndexedDB seed/wipe mechanism reuses
// tests/e2e/persistence.spec.ts seedScrollingMode verbatim (Pitfall 9
// additive-append discipline).
import { test } from "@playwright/test";

test.describe("v1 → v3 Dexie migration (Wave-0 stub — replaced by 07-07)", () => {
  test.skip("v1 fixture snapshot intact after v3 upgrade", async () => {});
});
