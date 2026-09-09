# Deferred Items — Quick 260909-ahy

## Pre-existing e2e failures (out of scope — verified pre-task)

Verified empirically 2026-09-09: the SAME 9 cells fail at the pre-task commit
`c631810` (old remount-by-key code) and at HEAD `888b600` (this task's
changes) — identical failure set, zero new failures introduced.

| Spec | Test | Engines | Root cause |
|------|------|---------|------------|
| tests/e2e/library/reading-views.spec.ts | L640 "corpus sanity: the imported policy derives the designed corpus" | chromium, firefox, webkit | Node-side constant assertion expects 7 bundled fixtures (`unread = 9 = 7 fixtures + standalone + book`); `src/fixtures/index.ts` carries ONE bundled article since quick task 260907-pw1 (derived value is 3) |
| tests/e2e/library/library-restore.spec.ts | L491 "(e) row-gone degrade" | chromium, firefox, webkit | Expects `All (18)` = "12 corpus − 1 + 7 fixtures"; with 1 bundled fixture the honest count is 12 |
| tests/e2e/library/library-restore.spec.ts | L533 "(f) clamp sanity" | chromium, firefox, webkit | Expects `All (7)`; 7-fixture math, same staleness |

All three bake in the pre-260907-pw1 seven-fixture library shape. Fix = realign
the expected constants to the single-article starter library (the 13-06
stale-expectation precedent) — a test-expectation change only, no product code.

## Pre-existing e2e failures in tests/e2e/epub-intake.spec.ts (out of scope — verified pre-task)

Also verified empirically at `c631810` vs HEAD `888b600`: identical 15 failed /
26 passed at both commits. 5 tests × 3 engines:

| Test (line) | Failure | Root cause |
|-------------|---------|------------|
| L241 "book grouping: one expandable row, four nested chapters" | `.library-list > li` expected 8, received 2 | 8 = 1 book + 7 fixtures; today's library has 1 bundled fixture (260907-pw1) |
| L356 "tag + search: book tags surface the BOOK row" | same count class | 7-fixture staleness |
| L542 "remove cascade" | same count class | 7-fixture staleness |
| L651 "dedupe-refuse: re-uploading identical EPUB bytes stays ONE book" | same count class | 7-fixture staleness |
| L1211 "refusal no-side-effect gates" | same count class | 7-fixture staleness |

All strip-related epub cells PASS at HEAD (Continue-Reading entry L409,
reopen-resume L1072, finished-book-leaves-strip L1151) — this task's refresh
mechanism is proven through the book flows the plan's verification pointed at.
