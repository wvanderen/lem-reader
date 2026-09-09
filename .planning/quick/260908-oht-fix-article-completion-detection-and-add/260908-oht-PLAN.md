---
phase: quick-260908-oht-finish-detection
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pagination/anchor.ts
  - src/pagination/progress.ts
  - src/reader/PaginatedSurface.tsx
  - src/reader/useScrollSave.ts
  - src/routes/ArticleView.tsx
  - src/reader/BackToLibrary.tsx
  - src/reader/MarkReadAndClose.tsx
  - src/app.css
  - tests/unit/pagination/pageAnchor.test.ts
  - tests/unit/pagination/progress-formula.test.ts
  - tests/unit/useScrollSave.test.ts
  - tests/unit/MarkReadAndClose.test.tsx
  - tests/component/PaginatedSurface.test.tsx
autonomous: true
requirements: [] # quick task — no roadmap requirement IDs

must_haves:
  truths:
    - "Turning to the final page of a multi-page paginated article fills the progress hairline to 100% and, after the 1200ms debounce, the library shows the article finished"
    - "Scrolling a scrolling-mode article to the very bottom persists graphemeOffset = total, so the article reads finished"
    - "A 'Mark read and close' button at the end of the article — flow content in scrolling mode, final-page chrome in paginated mode — immediately persists offset = total (flush, not debounce) and returns to the library via the same navigation contract as Back to library"
    - "Reopening a finished article in scrolling mode lands at the document bottom and the finished state survives the restore (the first scroll-save does not un-finish it); the same holds for a paginated→scrolling mode toggle from the final page"
    - "A one-page paginated article still reads 0% on open (POLISH-02 boundary preserved) and finishes via the explicit button"
    - "Book chapters finish through the same machinery with zero changes to FINISHED_THRESHOLD, readingState.ts, bookProgress.ts, or ContinueReadingStrip.tsx"
  artifacts:
    - path: "src/pagination/anchor.ts"
      provides: "pageAnchorOffset — the committed-page anchor with the last-page-of-multi-page pin to graphemeLength"
      contains: "pageAnchorOffset"
    - path: "src/pagination/progress.ts"
      provides: "committedPageProgressRatio — committed-page hairline ratio that reaches 1 on the final page of a multi-page set"
      contains: "committedPageProgressRatio"
    - path: "src/reader/PaginatedSurface.tsx"
      provides: "All anchor/progress consumers route through the pinned helpers"
      contains: "pageAnchorOffset"
    - path: "src/reader/useScrollSave.ts"
      provides: "atScrollBottom pure helper + scroll-bottom pin to total + saveLocationNow immediate flush"
      contains: "atScrollBottom"
    - path: "src/reader/MarkReadAndClose.tsx"
      provides: "The explicit mark-read affordance (both placements)"
      contains: "MarkReadAndClose"
    - path: "src/reader/BackToLibrary.tsx"
      provides: "leaveArticleToLibrary — the ONE shared close navigation contract"
      contains: "leaveArticleToLibrary"
    - path: "src/routes/ArticleView.tsx"
      provides: "End-landing for saved offset >= total; MarkReadAndClose mounts in both mode branches"
      contains: "MarkReadAndClose"
    - path: "src/app.css"
      provides: ".mark-read-close quiet-button register + flow/page placements + chapter-nav coexistence bump"
      contains: "mark-read-close"
    - path: "tests/unit/pagination/pageAnchor.test.ts"
      provides: "pageAnchorOffset boundary table"
    - path: "tests/unit/useScrollSave.test.ts"
      provides: "atScrollBottom boundary table"
    - path: "tests/unit/MarkReadAndClose.test.tsx"
      provides: "Accessible name, call order, both navigation paths"
    - path: "tests/component/PaginatedSurface.test.tsx"
      provides: "Final-page onAnchorChange emits graphemeLength(article)"
  key_links:
    - from: "src/reader/PaginatedSurface.tsx"
      to: "src/pagination/anchor.ts pageAnchorOffset"
      via: "progress memo (via committedPageProgressRatio), onAnchorChange effect, pagination-effect anchor capture, commitTurn/turnToPage lastAnchorOffsetRef, getCurrentAnchorOffset"
      pattern: "pageAnchorOffset"
    - from: "src/reader/useScrollSave.ts onScroll"
      to: "graphemeLength(article)"
      via: "atScrollBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight) → scheduleSaveAtOffset(total)"
      pattern: "atScrollBottom"
    - from: "src/routes/ArticleView.tsx handleMarkRead"
      to: "useScrollSave saveLocationNow"
      via: "saveLocationNow(graphemeLength(article)) synchronously before navigation (unmount cancels pending debounces — flush is mandatory)"
      pattern: "saveLocationNow"
    - from: "src/reader/MarkReadAndClose.tsx"
      to: "src/reader/BackToLibrary.tsx leaveArticleToLibrary"
      via: "click → onMarkRead() then leaveArticleToLibrary(hasAppHistory) — same contract as the Back to library button"
      pattern: "leaveArticleToLibrary"
    - from: "src/routes/ArticleView.tsx paginated branch"
      to: "MarkReadAndClose placement=\"page\""
      via: "mounted when pageState !== null && pageState.page === pageState.total (the chapter-nav-next gate) — fixed chrome band, never inside the measured page content"
      pattern: 'MarkReadAndClose'
---

<objective>
Fix article completion detection — paginated and scrolling modes never mark articles
finished because only page/block START offsets are ever persisted — and add an explicit
"Mark read and close" affordance at the end of the article in both modes.

Purpose: Completion is derived (`Math.min(1, offset/total) >= FINISHED_THRESHOLD 0.98`)
from the saved reading-position offset. The last page's start offset reads ~0.90 and the
scroll-bottom top-block start offset reads < 0.98 whenever the final block exceeds 2% of
the article, so no article ever crosses the threshold passively. No explicit mark-read
gesture exists either.

Output: (1) a pinned END anchor — the final committed page of a multi-page paginated
article reports progress 1 and persists offset = total; (2) a scroll-bottom pin in the
scroll-save path; (3) end-landing so restores/mode-toggles at the end never un-finish a
finished article; (4) a "Mark read and close" button that flush-persists offset = total
and closes through the shared Back-to-library navigation contract. Zero changes to the
reading-state derivation itself.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md

Read-first sources (one pass each; line anchors verified 2026-09-08):
- src/pagination/anchor.ts — pageStartGlobalOffset + fragmentContainingOffset (the last
  page's end is already +∞/MAX_SAFE_INTEGER, so a saved offset of `total` restores to the
  last page — no restore work needed in paginated mode)
- src/pagination/progress.ts — paginatedProgressRatio (fragment-level helper; its
  boundary semantics and tests stay BYTE-UNCHANGED — the pin lives one level up, at the
  committed-page level)
- src/reader/PaginatedSurface.tsx — the five anchor consumers (L299-303 pagination-effect
  capture, L536-542 onAnchorChange effect, L586 commitTurn, L636 turnToPage,
  L652 getCurrentAnchorOffset) + the progress memo (L670-674)
- src/reader/useScrollSave.ts — onScroll → computeOffset (L185-197), flush/scheduleSave
  (L128-152), the unmount cleanup that CANCELS pending debounces and clears pendingRef
  (L224-232) — why the explicit button MUST flush, not schedule
- src/routes/ArticleView.tsx — handleAnchorChange (L653-689), the scrolling restore
  effect (L1619-1756, scrolling branch L1714-1736), the D4-10 paginated→scrolling apply
  effect (L1156-1178), the render branches (paginated L2360-2485, scrolling L2519-2572),
  the chapter-nav-next final-page gate (L2445-2447)
- src/reader/BackToLibrary.tsx — the navigation contract to extract
- src/app.css — .chapter-nav-page fixed chrome band (L3570-3578, the blessed
  geometrically-stable final-page placement), .back-to-library quiet button (L3593-3610)
- tests/component/PaginatedSurface.test.tsx — the paginateDocument-mock harness to extend
- tests/unit/pagination/progress-formula.test.ts — fixture builders to mirror
- tests/unit/library/reading-state.test.ts — "offset = total → finished" is ALREADY
  pinned here (L72-76); do not duplicate it

Verified diagnosis (do NOT re-derive): FINISHED_THRESHOLD = 0.98 lives in
src/ingestion/library/ContinueReadingStrip.tsx:68 and is applied by
readingState.ts:52-59 / bookProgress.ts:86. The only writers of LocationRecord are
useScrollSave's scheduleSave/flush family. graphemeLength(article)
(src/content/normalizeText.ts:198) is the cached canonical total.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Passive completion — pinned end anchor, scroll-bottom pin, end-landing</name>
  <files>src/pagination/anchor.ts, src/pagination/progress.ts, src/reader/PaginatedSurface.tsx, src/reader/useScrollSave.ts, src/routes/ArticleView.tsx, tests/unit/pagination/pageAnchor.test.ts, tests/unit/pagination/progress-formula.test.ts, tests/unit/useScrollSave.test.ts, tests/component/PaginatedSurface.test.tsx</files>
  <behavior>
    - pageAnchorOffset(article, pages, idx): pages.length === 0 or out-of-range idx → 0; idx is the last page of a MULTI-page set (pages.length > 1) → graphemeLength(article); otherwise → pageStartGlobalOffset(article, pages[idx]) (byte-identical to today)
    - A one-page article's only page keeps anchor 0 and progress 0 (POLISH-02 open-reads-0 boundary preserved)
    - committedPageProgressRatio(article, pages, idx): total === 0 → 0; else min(1, pageAnchorOffset(...)/total) — reaches exactly 1 on the final page of a multi-page set, stays strictly below 1 on earlier pages
    - atScrollBottom(scrollY, viewportHeight, scrollHeight, epsilonPx = 4): scrollMax = scrollHeight − viewportHeight; false when scrollMax <= 0 (non-scrollable article never passively finishes); true when scrollY >= scrollMax − epsilonPx; false above
    - In paginated mode, turning to the final page makes onAnchorChange emit graphemeLength(article); first/middle pages emit page-start offsets as today
    - In scrolling mode, a scroll event at (or within 4px of) the document bottom schedules a save of graphemeLength(article); all other scroll positions keep computeTopVisibleOffset
    - ArticleView scrolling restore and paginated→scrolling mode-swap with a captured offset >= graphemeLength(article) scroll to the absolute document bottom instead of findScrollTarget block:"start", so the subsequent scroll-save re-pins total instead of un-finishing
  </behavior>
  <action>
    1. src/pagination/anchor.ts — add exported `pageAnchorOffset(article: CanonicalArticle, pages: PageFragment[], pageIndex: number): number`. Import graphemeLength from ../content/normalizeText (no cycle — normalizeText imports nothing from pagination). Compose ONLY graphemeLength + the file's own pageStartGlobalOffset (reuse-do-not-fork). Guard: empty pages or idx outside [0, pages.length) → 0. Pin: idx === pages.length − 1 && pages.length > 1 → graphemeLength(article). Else pageStartGlobalOffset(article, pages[pageIndex]!). Update ONLY the existing header/JsDoc lines that would otherwise become false (the file's docs describe anchor math, not last-page semantics — a one-line note on the new export suffices; no other comment changes).

    2. src/pagination/progress.ts — add exported `committedPageProgressRatio(article: CanonicalArticle, pages: PageFragment[], currentPageIdx: number): number`: total = graphemeLength(article); total === 0 → 0; else Math.min(1, Math.max(0, pageAnchorOffset(article, pages, currentPageIdx) / total)). Import pageAnchorOffset from ./anchor (progress.ts already imports pageStartGlobalOffset from there). paginatedProgressRatio and its documented boundary semantics stay byte-unchanged.

    3. src/reader/PaginatedSurface.tsx — route every committed-page anchor/progress consumer through the helpers:
       - progress memo (~L670-674): replace the paginatedProgressRatio call with committedPageProgressRatio(article, p, currentPageIdx); drop the now-unused paginatedProgressRatio import
       - onAnchorChange effect (~L541): onAnchorChange?.(pageAnchorOffset(articleRef.current, p, currentPageIdx))
       - pagination-effect anchor capture (~L300): anchorOffset = pageAnchorOffset(currentArticle, currentPages, currentIdx) (repagination from the last page re-anchors to the NEW last page via fragmentContainingOffset's +∞ clamp)
       - commitTurn (~L586) and turnToPage (~L636): lastAnchorOffsetRef.current = pageAnchorOffset(articleRef.current, p[next]!)
       - getCurrentAnchorOffset (~L652): return pageAnchorOffset(articleRef.current, p[idx]!)
       Update only comment lines that state the old behavior (the POLISH-02 memo comment's "last page stays below 1" clause and the onAnchorChange doc's "first block" phrasing) so they describe the committed-page pin.

    4. src/reader/useScrollSave.ts — add module constant BOTTOM_EPSILON_PX = 4 (beside HEADER_PX) and exported pure `atScrollBottom(scrollY: number, viewportHeight: number, scrollHeight: number, epsilonPx = BOTTOM_EPSILON_PX): boolean` per the behavior table. In the scroll-listener effect's onScroll (~L185-187): when articleRef.current exists AND atScrollBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight) → scheduleSaveAtOffset(graphemeLength(articleRef.current)); else the existing scheduleSaveAtOffset(computeOffset()). Import graphemeLength from ../content/normalizeText. Do not touch computeTopVisibleOffset, the debounce/flush machinery, or the dual-event flush.

    5. src/routes/ArticleView.tsx — end-landing (two sites, one shared local helper):
       - In the scrolling restore effect's rAF branch (~L1714-1736): if loc.graphemeOffset >= graphemeLength(article), window.scrollTo(0, document.documentElement.scrollHeight) and skip findScrollTarget; otherwise the existing target.scrollIntoView({ block: "start" }). The restoration-marker set runs in BOTH branches (genuine restore-landing either way).
       - In the D4-10 paginated→scrolling apply effect (~L1165-1176): same guard — when swap.offset >= graphemeLength(article), scroll to the absolute document bottom inside the same rAF instead of findScrollTarget block:"start".
       Import graphemeLength from ../content/normalizeText (ArticleView already imports BLOCK_SEPARATOR from there). Do not touch the paginated reopen-restore branch (fragmentContainingOffset already lands offset === total on the last page, and the pinned onAnchorChange re-saves total).

    6. Tests (write before/with the source changes; pure helpers are trivially RED first):
       - NEW tests/unit/pagination/pageAnchor.test.ts — mirror the fixture builders of progress-formula.test.ts (baseArticle + ArticleSchema.parse + paragraph() + fragment()). Cases: empty pages → 0; out-of-range idx → 0; first/middle page of 3 → pageStartGlobalOffset value; last page of 3 → graphemeLength(article); ONLY page of a 1-page set → 0 (not total).
       - EXTEND tests/unit/pagination/progress-formula.test.ts — new describe for committedPageProgressRatio: last page of a 3-page set → exactly 1; page 1 of 3 → 0; monotonic non-decreasing across pages; one-page set → 0; empty pages → 0. Do not modify the existing paginatedProgressRatio cases (the fragment-level helper is unchanged).
       - NEW tests/unit/useScrollSave.test.ts — atScrollBottom boundary table: exact bottom → true; within 4px above bottom → true; 5px above → false; top of a scrollable page → false; non-scrollable (scrollHeight <= viewportHeight) → false; rubber-band overshoot (scrollY > scrollMax) → true.
       - EXTEND tests/component/PaginatedSurface.test.tsx — reuse the paginateDocument-mock harness verbatim (makePages(3), renderSurface extended to pass an onAnchorChange: vi.fn()). Cases: after two Next clicks the LAST onAnchorChange call equals graphemeLength(article) (import graphemeLength and compute against the file's existing `article` fixture — note its runs carry `marks: []`, so use graphemeLength, never hand-counted lengths); the initial commit's call (page 1 of 3) is 0; page 2's call equals pageStartGlobalOffset(article, pages[1]) and is < graphemeLength(article).

    Comment discipline: NO new explanatory comment blocks; update only existing comment lines that would otherwise become false. All state/refs/effects keep their existing identity/deps discipline (the onScroll branch reads refs only — no new effect deps).
  </action>
  <verify>
    <automated>npm run test:unit -- --run tests/unit/pagination/pageAnchor.test.ts tests/unit/pagination/progress-formula.test.ts tests/unit/useScrollSave.test.ts tests/component/PaginatedSurface.test.tsx && npx tsc && npm run lint</automated>
  </verify>
  <done>All new/extended tests green; typecheck + lint clean; the pure helpers paginatedProgressRatio, readingState.ts, bookProgress.ts, and ContinueReadingStrip.tsx are byte-unchanged (verify: `git diff --stat` shows no rows for those three derivation files).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: MarkReadAndClose component + shared close navigation + CSS</name>
  <files>src/reader/BackToLibrary.tsx, src/reader/MarkReadAndClose.tsx, src/app.css, tests/unit/MarkReadAndClose.test.tsx</files>
  <behavior>
    - MarkReadAndClose renders a native button with accessible name "Mark read and close" (visible text label — no aria-label indirection)
    - Click fires onMarkRead() FIRST, then navigates (save-before-navigate order — the save must be in flight before unmount)
    - hasAppHistory === true → history.back(); false → window.location.hash = "#/" (identical to Back to library)
    - placement="flow" renders in-article flow content; placement="page" renders in the fixed bottom chrome band; both are the same quiet-button register with min-height var(--touch) (A11Y-07) and inherit the global :focus-visible ring
    - BackToLibrary behavior is byte-identical after extracting the shared navigation helper
  </behavior>
  <action>
    1. src/reader/BackToLibrary.tsx — extract the goBack body into an exported `leaveArticleToLibrary(hasAppHistory: boolean): void` (history.back() when the flag is set, else window.location.hash = "#/" — the Pitfall 7 deep-link contract). BackToLibrary's onClick calls it. One navigation contract, two consumers.

    2. NEW src/reader/MarkReadAndClose.tsx — interface MarkReadAndCloseProps { onMarkRead: () => void; hasAppHistory: boolean; placement: "flow" | "page"; } (mirror BackToLibrary's minimal-component discipline and ProgressHairline's placement-prop precedent). Render `<button type="button" className={`mark-read-close mark-read-close-${placement}`} onClick={handleClick}>Mark read and close</button>` where handleClick calls onMarkRead() then leaveArticleToLibrary(hasAppHistory). No autoFocus, no shortcut registration — Tab/Shift+Tab + Enter/Space only. No comments beyond a one-line module header note.

    3. src/app.css — add a `.mark-read-close` section near the .back-to-library rules (quiet-button register: transparent background, 1px var(--hairline) border, 4px radius, min-height var(--touch), padding-inline var(--space-md), font var(--font-ui) 16px, color var(--ink), accent on hover — token-for-token the .back-to-library shape). Two placements:
       - `.mark-read-close-flow` — flow margins mirroring .chapter-nav (margin: var(--space-lg) 0 0 0) so it sits calmly after the final block
       - `.mark-read-close-page` — the .chapter-nav-page precedent: position: fixed; bottom: var(--space-xs); left: 0; right: 0; text-align: center; margin: 0; z-index: 5 — fixed positioning takes it out of the article grid's flow, so mounting it on the final page can never change .page-viewport geometry and re-trigger pagination
       - Coexistence: `.article-body:has(.mark-read-close-page) .chapter-nav-page { bottom: calc(var(--space-xs) + 48px); }` so a mid-book chapter's final page (Next chapter link + button both present) stacks the link above the button instead of overlapping. Tokens only; zero motion properties (A11Y-06 discipline).

    4. NEW tests/unit/MarkReadAndClose.test.tsx — render + fireEvent.click (the RestorationMarker.test.tsx house style):
       - role button with accessible name "Mark read and close" exists for both placements
       - click with hasAppHistory=true: onMarkRead spy called once, then vi.spyOn(window.history, "back") called (assert call ORDER: onMarkRead invocation index < back invocation index via a shared ordered spy array)
       - click with hasAppHistory=false: onMarkRead called, then window.location.hash becomes "#/" (jsdom supports same-document hash navigation; reset the hash in afterEach)
       - placement prop maps to the mark-read-close-flow / mark-read-close-page class
       - BackToLibrary regression: it still calls history.back() when hasAppHistory, sets "#/" when not (add to this file or an adjacent describe — BackToLibrary has no existing test)
  </action>
  <verify>
    <automated>npm run test:unit -- --run tests/unit/MarkReadAndClose.test.tsx && npx tsc && npm run lint</automated>
  </verify>
  <done>Component + regression tests green; the button is keyboard-operable with a visible label and 44px target; both navigation paths route through leaveArticleToLibrary; CSS uses tokens only with no motion properties.</done>
</task>

<task type="auto">
  <name>Task 3: Wire the button into both modes + flush-now save + full gate</name>
  <files>src/reader/useScrollSave.ts, src/routes/ArticleView.tsx</files>
  <action>
    1. src/reader/useScrollSave.ts — flush-now seam. Change the hook's return from the bare scheduler to a stable object `{ scheduleLocationSave, saveLocationNow }` (both ScheduleLocationSave signature; useScrollSave's only caller is ArticleView L587). saveLocationNow builds the same LocationRecord shape (schemaVersion 1, articleId, revision, graphemeOffset, savedAt) then: stash it in pendingRef, clear any pending saveTimer (latest-wins, no redundant second write), and call flush() SYNCHRONOUSLY. This is mandatory, not an optimization: the unmount cleanup cancels pending debounces and nulls pendingRef, so a merely-scheduled save is LOST when the button navigates away. The saveLocation call-site family stays singular in this file; failure routing through onStorageError is unchanged (flush already owns it).

    2. src/routes/ArticleView.tsx —
       - Destructure the new return: `const { scheduleLocationSave, saveLocationNow } = useScrollSave(article, articleRef);` (handleAnchorChange and its deps array are otherwise untouched).
       - Add `handleMarkRead` (useCallback, deps [article, saveLocationNow, hasAppHistory]): guard `if (!article) return;` then saveLocationNow(graphemeLength(article)) followed by leaveArticleToLibrary(hasAppHistory). Import leaveArticleToLibrary from ../reader/BackToLibrary and MarkReadAndClose from ../reader/MarkReadAndClose.
       - Scrolling branch: mount `<MarkReadAndClose placement="flow" onMarkRead={handleMarkRead} hasAppHistory={hasAppHistory} />` immediately after `<ArticleBody article={article} />` (~L2549), BEFORE the chapter-nav-next nav — the end-of-article gesture sits at the end of the content; book navigation follows it.
       - Paginated branch: mount `<MarkReadAndClose placement="page" ... />` gated on `pageState !== null && pageState.page === pageState.total` — the SAME final-page gate the chapter-nav-next nav uses (~L2445-2447) — placed after the chapter-nav-next nav inside the paginated fragment. A one-page article satisfies the gate (1 === 1), which is exactly how one-page articles finish given Task 1's POLISH-02 guard. The fixed-position band keeps it outside the measured page content (no pagination disturbance; DOM order after the page fragment keeps Tab order after page content).
       - No comment changes beyond updating any existing line that would become false.

    3. Full gate — run the ENTIRE suite (fix direction #5): `npm test` (unit + e2e across chromium/firefox/webkit), `npx tsc`, `npm run lint`. If any e2e spec pinned the old never-finishes behavior (candidates: tests/e2e/library/progress-recent.spec.ts, reading-views, library-restore, progress.spec.ts), update ONLY the stale assertion to the new honest expectation (e.g. a bottom-scrolled or final-page article now reads finished / ratio 1) — strengthen-only, never delete coverage. If an unrelated pre-existing failure appears, log it honestly in the SUMMARY per the 08-05 scope-boundary rule; do not fix unrelated specs.
  </action>
  <verify>
    <automated>npx tsc && npm run lint && npm test</automated>
  </verify>
  <done>Full unit + e2e suite green in one invocation (exit 0); the button is reachable and functional in both modes; clicking it persists offset = total before navigation (the article shows Finished in the library); `git diff --stat` touches only the files_modified list.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| reader gesture → LocationRecord write | The button and the passive pins route through the EXISTING useScrollSave saveLocation family (Zod-validated store seam). No new input parsing, no network, no new persisted fields. |
| click → navigation | MarkReadAndClose reuses the BackToLibrary Pitfall 7 contract (history.back only when hasAppHistory; else the literal "#/" route). No attacker-influenced URL reaches navigation. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-Q01 | Tampering | saveLocationNow flush path | mitigate | Reuses the hook's single LocationRecord construction + flush(); no second saveLocation call site; failure routing through onStorageError unchanged |
| T-Q02 | Tampering (state desync) | MarkReadAndClose navigation | mitigate | Navigation goes through the ONE extracted leaveArticleToLibrary contract — no forked back()/#/ logic that could diverge from the deep-link-safety rule |
| T-Q03 | Information Disclosure / Elevation | — | accept | No new data surface, no PII, no privileges; purely local UI + existing persistence |

No package installs in this plan — the package legitimacy gate does not apply.
</threat_model>

<verification>
1. npx tsc — typecheck (the same step npm run build uses; tsconfig carries noEmit)
2. npm run lint
3. npm run test:unit -- --run — full unit suite (proves no regression in restore, pagination, progress, and library specs)
4. npm run test:e2e (via npm test) — real-browser gate across chromium/firefox/webkit
5. git diff --stat — only the 13 files_modified are touched; readingState.ts, bookProgress.ts, ContinueReadingStrip.tsx, and paginatedProgressRatio are byte-unchanged
</verification>

<success_criteria>
- Turning to the final page of a multi-page paginated article fills the hairline to 100% and the article reads Finished in the library after the debounce (component + pure tests green; ratio exactly 1)
- Scrolling to the absolute bottom in scrolling mode persists offset = total → Finished (pure boundary table + full-suite gate)
- "Mark read and close" works in BOTH modes: flush-persists offset = total (never lost to unmount debounce cancellation), then closes through the shared Back-to-library navigation; keyboard-operable, visible focus, 44px target, calm authored-CSS register
- Finished state is STABLE: reopening (scrolling) or toggling from the final page (paginated→scrolling) lands at the document bottom and re-pins total instead of un-finishing
- One-page articles still read 0% on open (POLISH-02 preserved) and finish via the button
- Book chapters finish with zero changes to the threshold/derivation modules
- npx tsc, npm run lint, and the FULL npm test suite green in one invocation
</success_criteria>

<output>
Create `.planning/quick/260908-oht-fix-article-completion-detection-and-add/260908-oht-SUMMARY.md` when done
</output>
