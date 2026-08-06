# Deferred Items — Phase 04

## Pre-existing (out of Plan 04-05 scope)

### persistence.spec.ts STATE-01 location-restore failures (pre-existing since 04-02/04-03)

**Discovered during:** Plan 04-05 full-suite verification (Task 3 prep).

**Failing tests (3 engines):**
- `tests/e2e/persistence.spec.ts:206` — "scrolling an article persists the location; reload restores the scroll position"
- `tests/e2e/persistence.spec.ts:251` — "a pending debounced location write flushes on visibilitychange-hidden (Pitfall 4)" (chromium + firefox)

**Root cause (NOT caused by Plan 04-05):** The persistence tests assume the
article opens in SCROLLING mode (they were written in Phase 2, before
`readingMode` existed). Since Plan 04-02 changed the default to `"paginated"`
(D4-12), the article opens in paginated mode. PaginatedSurface (04-03) mounts
with the `.paginated-surface` geometry (`overflow: hidden`, viewport-bounding
height), so `window.scrollTo(0, 500)` cannot scroll the window — `scrollY`
stays ~31px and the `> 200` assertion fails. Verified pre-existing: the test
fails identically on commit `7af81f6` (Plan 04-04 complete, before any 04-05
work) via a temp worktree.

**Scope decision:** Out of Plan 04-05's scope (Rule: only auto-fix issues
directly caused by the current task). The fix belongs with whichever plan
resolves the pagination-engine container-handling gap (see 04-05-SUMMARY.md
§Blocking Finding) — once articles paginate cleanly in paginated mode, the
persistence tests need updating to either (a) set `readingMode: "scrolling"`
explicitly in their setup, or (b) assert location restore in paginated mode
via page-index instead of window.scrollY. Tracked here so it isn't lost.

**Related:** the same root cause (paginated default + every-fixture fallback)
blocks the PAGE-03 corpus matrix proof — see 04-05-SUMMARY.md §Blocking
Finding for the engine gap analysis.
