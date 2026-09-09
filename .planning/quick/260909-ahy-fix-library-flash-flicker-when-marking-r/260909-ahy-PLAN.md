---
phase: quick-260909-ahy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ingestion/library/LibraryView.tsx
  - src/ingestion/library/ContinueReadingStrip.tsx
  - src/ingestion/library/ReadingStateButton.tsx
  - tests/e2e/library/progress-recent.spec.ts
autonomous: true
requirements: [QUICK-260909-AHY]
must_haves:
  truths:
    - "Clicking Mark as read / Mark as unread on any library row or strip card never removes the Continue reading section from the DOM — no flash, no layout collapse, no scroll jump"
    - "Reading-state changes still re-derive the strip and the list from Dexie after the write (marked articles leave the strip, Finished marks appear, view-switch counts update)"
    - "The ReadingStateButton accessible name flips to the target action at click time and never regresses to the stale label while the parent reload is in flight"
    - "All existing library e2e specs (card-actions, progress-recent, reading-views, metadata-edit, library-tidy) pass unchanged"
  artifacts:
    - path: "src/ingestion/library/ContinueReadingStrip.tsx"
      provides: "refreshKey-prop-driven re-derivation, stale-while-revalidate (entries stay mounted during reload)"
      contains: "refreshKey"
    - path: "src/ingestion/library/LibraryView.tsx"
      provides: "strip mounted once per LibraryView lifetime; refreshKey threaded as a prop"
      contains: "refreshKey={refreshKey}"
    - path: "src/ingestion/library/ReadingStateButton.tsx"
      provides: "optimistic read-state bridging the write→reload gap"
      contains: "optimisticRead"
    - path: "tests/e2e/library/progress-recent.spec.ts"
      provides: "strip DOM-identity regression lock across a mark-as-read refresh"
  key_links:
    - from: "src/ingestion/library/LibraryView.tsx"
      to: "src/ingestion/library/ContinueReadingStrip.tsx"
      via: "refreshKey prop → strip load effect [refreshKey] deps (replaces the remount-by-key mechanism)"
      pattern: "refreshKey=\\{refreshKey\\}"
    - from: "src/ingestion/library/ReadingStateButton.tsx"
      to: "src/ingestion/library/ReadingStateButton.tsx"
      via: "optimisticRead set at click, cleared when the isRead prop catches up, cleared on error"
      pattern: "setOptimisticRead"
---

<objective>
Fix the library-page flash/flicker when marking articles read or unread.

Purpose: Clicking "Mark as read"/"Mark as unread" on `#/` currently causes a visible full-section flash. Root cause (verified, do not re-litigate): (1) PRIMARY — `LibraryView.tsx` renders `<ContinueReadingStrip key={refreshKey} … />`; every mark-read handler bumps `refreshKey`, the key change REMOUNTS the strip, the fresh instance starts at `entries = null` → `return null` → the entire Continue-reading DOM collapses synchronously (content below jumps up, scroll clamps) until the strip's async `Promise.all` re-derives and re-appends it. Introduced by commit 109fb3d as a blunt reload mechanism. (2) SECONDARY — `ReadingStateButton`'s `pending` flips false when `onChange` resolves (DB write done, refreshKey bumped) while the parent's list reload is still in flight, so the label briefly regresses: "Saving…" → OLD label → new label once the reload lands.

Output: Stale-while-revalidate strip reload (refreshKey as an effect-dep prop, entries stay mounted during reload), an optimistic local read-state in ReadingStateButton that clears on catch-up/error, and an e2e regression test proving the strip DOM node survives a mark-read refresh.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/ingestion/library/LibraryView.tsx
@src/ingestion/library/ContinueReadingStrip.tsx
@src/ingestion/library/ReadingStateButton.tsx
@src/persistence/locationStore.ts
@tests/e2e/library/progress-recent.spec.ts
@tests/e2e/library/card-actions.spec.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Replace the strip key-remount with a refreshKey prop (stale-while-revalidate)</name>
  <files>src/ingestion/library/ContinueReadingStrip.tsx, src/ingestion/library/LibraryView.tsx</files>
  <behavior>
    - Test 1 (e2e, Task 3 implements): the `.continue-reading-strip` DOM node tagged with a probe attribute BEFORE a mark-as-read click still carries that attribute AFTER the refresh lands (identity preserved — no remount, no null gap).
    - Test 2 (existing specs must stay green): after a mark-read write, the re-derived strip drops the marked entry (epub-intake L1200-style count assertions) and metadata edits re-title strip links (metadata-edit L648/L728) — final states unchanged, only the intermediate collapse is eliminated.
  </behavior>
  <action>
    In `src/ingestion/library/ContinueReadingStrip.tsx`:
    1. Add an optional `refreshKey?: number` prop (default `0`) alongside the existing `onReadingStateChange` prop.
    2. Change the load effect's dependency array from `[]` to `[refreshKey]` — the effect body, its `cancelled` cleanup flag, and the Promise.all derivation stay byte-unchanged otherwise. The cleanup discipline already mirrors LibraryView's `[refreshKey]` load effect: a refreshKey change cancels the in-flight run before starting the next.
    3. Do NOT reset `entries` when the effect re-runs. `entries` is only ever written by the promise's `.then`/`.catch` — this IS the stale-while-revalidate behavior: previously-derived entries keep rendering (section stays in the DOM, layout stable) until fresh data replaces them. A strip that legitimately becomes empty (e.g. its last in-progress article marked read) still renders null once the FRESH data lands — a single data-driven change, not a flash cycle.
    4. Extend the file's header comment with a short note citing Quick 260909-ahy: the strip re-derives via the refreshKey PROP as an effect dep; the previous parent-side key-remount (commit 109fb3d) flashed because the remounted instance began at entries null and unmounted the whole section until the async reload re-derivated it. Follow the file's existing comment style (plan/decision-ID citations).
    Note: `onReadingStateChange` is render-only usage (never referenced inside the effect), so the `[refreshKey]` deps satisfy react-hooks/exhaustive-deps exactly like today's `[]` deps did.

    In `src/ingestion/library/LibraryView.tsx`:
    5. At the strip mount (~line 586), remove the React `key` carrying refreshKey and instead pass `refreshKey={refreshKey}` as a prop; the `onReadingStateChange` inline handler and the surrounding `<section className="library-section library-section-continue">` wrapper stay byte-unchanged.
    6. Add a brief inline comment at the mount citing Quick 260909-ahy: the strip is mounted once per LibraryView lifetime and re-derives through the refreshKey prop; the old remount-by-key mechanism was the library flash (section removed synchronously → layout collapse → rebuild on reload).
    7. Do NOT touch: the `[refreshKey]` LibraryView load effect, the librarySession capture/restore seam (D15-11..14 — the AddDialog comment's "do NOT touch it" discipline applies here too), the `.status` live region, the 260908-nk2 feedback-aside gate (status never returns to "loading" on refreshKey reloads — unchanged), or the view-switcher counts derivation.
  </action>
  <verify>
    <automated>npx tsc && npm run lint && npx playwright test tests/e2e/library/progress-recent.spec.ts tests/e2e/library/metadata-edit.spec.ts</automated>
  </verify>
  <done>ContinueReadingStrip accepts a refreshKey prop and reloads via [refreshKey] effect deps while keeping stale entries mounted; LibraryView mounts the strip without a refreshKey-carrying React key and threads refreshKey as a prop; typecheck, lint, and the existing strip/edit e2e specs pass unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Optimistic read-state in ReadingStateButton (no stale-label regression)</name>
  <files>src/ingestion/library/ReadingStateButton.tsx</files>
  <behavior>
    - Test 1 (e2e, Task 3 implements): immediately after clicking "Mark as read:" on a row, the button's accessible name matches "Mark as unread:" — satisfied by BOTH the optimistic transient and the settled state, so the assertion cannot flake on reload timing, yet locks in that the name never idles on the stale label.
    - Test 2 (existing card-actions.spec.ts stays green): final settled labels are unchanged — "Mark as read:" ⇄ "Mark as unread:" per isRead, with "Finished" mark and "Unread (1)" count assertions intact.
    - Error path: on onChange rejection the optimistic value clears (label reverts to the prop truth) and the existing role="alert" retry copy shows.
  </behavior>
  <action>
    In `src/ingestion/library/ReadingStateButton.tsx` (also import `useEffect` from react alongside the existing `useState` import):
    1. Add local state `optimisticRead: boolean | null` (initially null) and derive `effectiveRead = optimisticRead ?? isRead`; derive `label` from `effectiveRead` instead of `isRead` (both the visible label and the aria-label template — keep the `${label}: ${title}` shape and the "Saving…" pending text byte-stable).
    2. In the click handler: alongside `setPending(true)`/`setError(false)`, immediately `setOptimisticRead(!effectiveRead)` and call `onChange(!effectiveRead)`. This flips the accessible name at click time, bridging the gap where `pending` is already false (DB write + refreshKey bump done) but the parent's reload hasn't landed yet — the exact window where the old prop-only label regressed to the stale action.
    3. In the catch path: `setError(true)` AND `setOptimisticRead(null)` — an honest revert to the persisted truth plus the existing retry copy.
    4. Add a catch-up effect: when `optimisticRead` is non-null and `isRead === optimisticRead`, clear it (`setOptimisticRead(null)`) — the parent reload has landed with the matching state, so label authority hands back to the prop. Deps `[isRead, optimisticRead]`.
    5. Add a short comment citing Quick 260909-ahy explaining the regression: pending cleared after the write while the parent's list reload was still in flight, so the label briefly showed the OLD action; the optimistic layer covers the write→reload window and clears on catch-up or error. Follow the file's terse comment style.
    Do not change the component's props signature, class names, or error copy. Both call sites (LibraryRow `isRead={isFinished}` and ContinueReadingStrip `isRead={false}`) keep working unmodified: the strip case unmounts its entry when fresh data lands (state dies with the row); the row case gets the catch-up clear.
  </action>
  <verify>
    <automated>npx tsc && npm run lint && npx playwright test tests/e2e/library/card-actions.spec.ts</automated>
  </verify>
  <done>Clicking the button flips its accessible name to the target action synchronously; the name never regresses to the stale label between write completion and reload landing; failures revert to the prop-derived label with the retry alert; card-actions.spec.ts passes unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: e2e regression lock — strip DOM identity survives a mark-read refresh</name>
  <files>tests/e2e/library/progress-recent.spec.ts</files>
  <action>
    Add ONE new test inside the existing describe block in `tests/e2e/library/progress-recent.spec.ts`, reusing the file's existing helpers and constants (`seedArticleRows`, `seedLocation`, `openLibrary`, `STRIP_FIXTURE_A`, `STRIP_FIXTURE_B`, `STRIP_TOTAL_A`, `STRIP_TOTAL_B`, `HAIRLINE_FIXTURE`) and following the file's comment style. Name it e.g. "marking a row read does not remount the continue-reading strip (Quick 260909-ahy)". Steps:
    1. Seed both strip standalones as article rows, seed one UNFINISHED location for each (mid-article offsets, distinct savedAt timestamps — the existing two-card test at ~L360 is the pattern).
    2. `openLibrary(page)`; assert `.continue-reading-strip` is visible with 2 `.continue-reading-row` cards.
    3. Tag the strip element with a probe: evaluate over the `.continue-reading-strip` locator setting `data-flash-probe="alive"` via setAttribute.
    4. Click the bundled fixture row's mark-as-read button — the row filtered by `HAIRLINE_FIXTURE.provenance.title` within `.library-list > li`, located by `getByRole("button", { name: /^Mark as read:/ })`. The bundled fixture is NOT a strip member (no seeded location until this click), so both seeded strip entries must survive the re-derivation.
    5. Immediately assert the clicked row's button accessible name matches `/^Mark as unread:/` — comment that this holds in both the optimistic transient and the settled state (Task 2's bridge), so it cannot flake on reload timing yet locks the no-stale-label behavior.
    6. Assert the row's `.finished-mark` becomes visible — proves the refreshKey reload has landed (ordering gate for step 7).
    7. Assert `.continue-reading-strip[data-flash-probe="alive"]` is still visible (the probe attribute can only survive if React did NOT recreate the section — the remount detector) and `.continue-reading-row` count is still 2 (the marked fixture never joins the strip; seeded entries persist).
    Add a one-line citation in the test's comment block referencing Quick 260909-ahy and why the probe is the regression signal (a remount would render a fresh section without the attribute — exactly the flash the quick task fixes).
  </action>
  <verify>
    <automated>npx playwright test tests/e2e/library/progress-recent.spec.ts</automated>
  </verify>
  <done>The new test passes: strip tagged before the click keeps its probe attribute after the reload lands, still shows 2 entries, the marked row shows Finished, and the button accessible name never idles on the stale label. To prove the test actually detects the bug, temporarily restoring the remount-by-key mount in LibraryView must turn step 7 red (run once manually during development, revert, re-run green).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | All changes are client-side React state/polling discipline over already-Zod-validated records (locations, articles). No new inputs, network calls, or persistence writes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260909ahy-01 | Tampering | ReadingStateButton optimistic state | accept | Optimistic value is display-only; the persisted truth (setArticleReadState → Dexie) is unchanged and re-derives the UI; error path reverts to prop truth — no silent divergence survives a reload |
| T-260909ahy-02 | DoS | ContinueReadingStrip [refreshKey] reload | accept | Effect cleanup cancels in-flight runs (existing `cancelled` flag discipline); reload frequency is bounded by discrete user clicks, same as the pre-existing LibraryView load effect |
</threat_model>

<verification>
- `npx tsc` (the repo's typecheck — matches the `build` script's plain `tsc` under tsconfig `noEmit: true`)
- `npm run lint`
- `npx vitest run tests/unit/persistence/article-read-state.test.ts` (setArticleReadState untouched — sanity that the persistence seam still behaves)
- `npx playwright test tests/e2e/library/` (card-actions, progress-recent incl. the new regression test, reading-views, metadata-edit, library-tidy, v1-regression)
- Optional but recommended before closing: full `npm run test` (the epub-intake strip-count assertions at L1136/L1200 exercise the same refresh mechanism through book flows)
</verification>

<success_criteria>
- Clicking Mark as read/unread on any row or strip card keeps the Continue-reading section continuously mounted — the flash (collapse → scroll jump → rebuild) is gone; the e2e probe test proves DOM identity across the refresh
- Strip and list data still re-derive from Dexie after every write: entries leave/enter the strip, Finished marks render, view-switch counts update, empty-strip spare-chrome behavior unchanged
- The ReadingStateButton accessible name flips at click time and never regresses to the stale label; error path reverts honestly with the existing retry copy
- All existing library e2e specs pass unchanged; typecheck + lint clean
</success_criteria>

<output>
Create `.planning/quick/260909-ahy-fix-library-flash-flicker-when-marking-r/260909-ahy-SUMMARY.md` when done
</output>
