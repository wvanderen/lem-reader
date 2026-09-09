---
phase: quick-260908-tpb-library-ux-fixes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ingestion/library/LibraryView.tsx
  - src/app.css
  - tests/e2e/library/reading-views.spec.ts
  - tests/e2e/chrome/library-tidy.spec.ts
autonomous: true
requirements: [] # quick task — no roadmap requirement IDs

must_haves:
  truths:
    - "On a membership-empty view (e.g. Finished with zero finished articles) at a wide viewport, the empty-state heading ('Nothing finished yet') and body copy sit inside the shared 1100px centered measure — same cap and horizontal center as the header row — instead of spanning the window"
    - "The Continue reading strip section stays mounted and visible on ALL four library views — All, Unread, In progress, Finished; selecting any view-switcher option below it never makes the strip disappear"
    - "The strip component still returns null (spare chrome) when no unfinished reading locations exist — unchanged, on every view"
    - "Empty-state copy strings stay byte-stable (existing heading-name assertions keep passing untouched)"
  artifacts:
    - path: "src/ingestion/library/LibraryView.tsx"
      provides: "Empty state wrapped in a .library-empty measure container + the continue section mounted unconditionally (D16-14 gate removed)"
      contains: "library-empty"
    - path: "src/app.css"
      provides: ".library-empty rule joining the shared 1100px centered measure"
      contains: ".library-empty"
    - path: "tests/e2e/library/reading-views.spec.ts"
      provides: "Updated strip-stability test (all four views) + new empty-state measure test"
      contains: "library-section-continue"
  key_links:
    - from: "src/ingestion/library/LibraryView.tsx (D14-26 empty branch)"
      to: "src/app.css .library-empty"
      via: "wrapper div className around the EMPTY_COPY h2+p"
      pattern: "library-empty"
    - from: "tests/e2e/library/reading-views.spec.ts (strip test)"
      to: "src/ingestion/library/LibraryView.tsx library-section-continue"
      via: "per-view openView + .library-section-continue visibility assertions on all four views"
      pattern: "library-section-continue"
---

<objective>
Fix two related library-home UX issues reported together: (1) the per-view membership
empty-state copy ("Nothing finished yet" etc.) renders as bare h2/p with no class, so at
wide viewports it escapes the shared 1100px centered measure every sibling region joins
and spans nearly the full window; (2) the Continue reading strip section is gated
`view === "all"` (D16-14), so selecting any view-switcher option makes the pinned chrome
above the switcher vanish — bizarre, unstable-feeling UX.

Purpose: The library home's calm, stable orientation promise extends to its chrome and
empty states. Every region on the page — header, strip, switcher, search, tag filter,
list, no-matches line, status card — shares one centered 1100px measure; the empty state
is the sole exception. And the strip is spatially pinned above the view switcher, so its
mounting must not be coupled to which view is selected.

Output: (1) a `.library-empty` wrapper joining the shared measure, with a new e2e
geometry test mirroring the library-tidy G1 pattern; (2) the D16-14 gate removed so the
continue section mounts on every view — strip component byte-unchanged (D16-15), still
null when empty — with the reading-views test UPDATED (not deleted) to pin stability;
(3) comment supersessions recorded per the repo's Dxx-xx discipline; (4) affected-suite
honest verification gate.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md

Read-first sources (one pass each; line anchors verified 2026-09-08):
- src/ingestion/library/LibraryView.tsx L560-660 — the continue-section gate + comment
  (L573-585) and the D14-26 membership-empty branch rendering the bare h2/p fragment
  (L638-649)
- src/app.css L2191-2419 — the shared-measure discipline: .library-list (L2099),
  .continue-reading-strip (L2192), .view-switcher (L2231), .library-search (L2254),
  .tag-filter (L2273), .library-no-matches (L2326 — the closest empty-copy precedent),
  .library-header (L2367), main#main > .status (L2416); plus the h2/h1 margin-rhythm
  precedents .continue-reading-strip h2 (L2198) and .library-header h1 (L2378)
- tests/e2e/library/reading-views.spec.ts — EMPTY_HEADINGS map (L412-417), the per-view
  empty-states test (L703-733, un-seeded corpus: bundled fixtures all unread ⇒
  in-progress and finished are EMPTY), and the strip-gating test to update (L1125-1151)
- tests/e2e/chrome/library-tidy.spec.ts — the G1 measure-geometry pattern to mirror
  (L121-165) and the stale "lands on #/, the All view" comment (L49-52)
- Sweep evidence (planner-verified, executor may re-grep cheaply): `library-section-continue`
  appears in src (1×: the gate itself), reading-views.spec.ts (the L1129-1151 test),
  library-tidy.spec.ts (L54, on #/ only). progress-recent.spec.ts L432 asserts
  `.continue-reading-strip` (the COMPONENT) count 0 on #/ with zero locations — the
  spare-chrome null, unaffected by the gate. search-tag-filter.spec.ts and
  v1-regression.spec.ts contain NO strip assertions. metadata-edit.spec.ts (L638) and
  epub-intake/portability strip assertions all run on the #/ default view — unaffected.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Join the per-view empty state to the shared 1100px measure</name>
  <files>src/ingestion/library/LibraryView.tsx, src/app.css, tests/e2e/library/reading-views.spec.ts</files>
  <action>
    Markup — LibraryView.tsx: the D14-26 membership-empty branch (~L638-649) renders a
    bare fragment with the EMPTY_COPY h2 + p as direct children of
    section.library-section-list, so they inherit only main#main's padding-inline and
    span the window at wide viewports. Replace the fragment with a single wrapper
    `<div className="library-empty">` holding the SAME h2 and p — element kinds, text
    interpolation, and copy strings byte-stable (search-tag-filter.spec.ts L595/L604 and
    reading-views.spec.ts heading-name assertions query by role/name and must keep
    passing untouched). Extend the existing D14-26 comment to record that the wrapper
    joins the shared 1100px centered measure (2026-09-08 user feedback: empty-view copy
    violated the library gutter).

    CSS — app.css: immediately after the .library-clear-filters:hover rule (~L2353, the
    no-matches cluster — the closest empty-copy precedent), add a `.library-empty` rule
    that joins the shared measure exactly like its siblings: max-width 1100px, auto
    inline margins, `margin-block-start: var(--space-lg)` (the .library-no-matches /
    .library-search rhythm). Add `.library-empty h2 { margin-block-start: 0; }`-style
    rhythm zeroing per the .library-header h1 (L2378) and .continue-reading-strip h2
    (L2198) precedents. Authored comment citing the gutter fix + D14-26. Token-only
    values; zero motion properties (A11Y-06 discipline). The class name `library-empty`
    is verified unused across src/ and tests/.

    Test — reading-views.spec.ts: add a NEW test directly after "per-view empty states
    appear exactly when the view's expected count is zero (D14-26)" (~L733) —
    strengthen-only: no existing assertion modified or removed. Include the word
    "measure" in the test name for a stable --grep hook. Mirror the
    chrome/library-tidy.spec.ts G1 geometry pattern (L121-165): setViewportSize
    1400x900; NO seedCorpus (the bundled fixtures are all unread, so Finished is
    membership-empty — the same corpus state the D14-26 test relies on); openView
    #/finished; gate on the "Nothing finished yet" heading being visible; then
    boundingBox assertions on .library-empty vs .library-header (always present): empty
    box width <= 1100, header box width <= 1100, |emptyCenter - headerCenter| <= 1.
    Narrow regression check at 360x640: .library-empty width equals .library-header
    width (both fill the main content box — the measure introduces no narrow-viewport
    change).
  </action>
  <verify>
    <automated>npx playwright test tests/e2e/library/reading-views.spec.ts --grep "measure"</automated>
  </verify>
  <done>
    Empty-view heading + body sit inside the capped, centered 1100px measure at wide
    viewports; narrow viewport unchanged; copy strings byte-stable; the new geometry
    test green on the project's default e2e engine set.
  </done>
</task>

<task type="auto">
  <name>Task 2: Keep the Continue reading strip mounted on every view</name>
  <files>src/ingestion/library/LibraryView.tsx, tests/e2e/library/reading-views.spec.ts, tests/e2e/chrome/library-tidy.spec.ts</files>
  <action>
    Gate removal — LibraryView.tsx (~L573-585): remove the `{view === "all" && (…)}`
    conditional so `<section className="library-section library-section-continue">`
    mounts unconditionally, with ContinueReadingStrip as its child exactly as today.
    Rewrite the comment block (L573-580) to record the supersession per repo
    convention: D16-14 is SUPERSEDED by 2026-09-08 user feedback — the strip is pinned
    chrome above the view switcher and must stay stable across all four views; its
    disappearance on any switch read as bizarre/unstable UX; the original D16-14
    rationale (In-progress duplicated the first rows; Unread/Finished showed items
    absent from the view) is consciously traded for chrome stability. The strip
    component itself stays byte-unchanged (D16-15) and still returns null while loading
    or when the unfinished set is empty (spare chrome) — that behavior is pinned by
    progress-recent.spec.ts L424-438 and must NOT change.

    Test update — reading-views.spec.ts (~L1125-1151): UPDATE the test that pinned the
    old behavior (do not delete it). Retitle from "Continue Reading strip: visible on
    #/ only — absent from unread, in-progress, and finished (D16-14/D16-15)" to
    stability semantics, e.g. "Continue Reading strip: mounted and visible on every
    view — all, unread, in-progress, and finished (D16-14 superseded; D16-15
    byte-unchanged)". Body: seedCorpus first (STANDALONE_PROGRESS has a mid-article
    location ⇒ strip cards exist on every view), then for EACH of the four views
    (#/, #/unread, #/in-progress, #/finished): openView; expect
    .library-section-continue toBeVisible; expect .continue-reading-strip toBeVisible
    and toContainText "Continue reading". Update the describe-block comment (L1125-1127)
    to record the supersession; its strengthen-only sentence ("no existing test above
    was modified") remains true for every test above the updated one.

    Comment refresh — chrome/library-tidy.spec.ts (~L49-52): the note "(prepareFreshPage
    lands on #/, the All view, so the continue section is present)" now over-justifies —
    the section mounts on every view. Refresh the comment (comment-only; the
    ordering assertion itself stays byte-unchanged).
  </action>
  <verify>
    <automated>npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/library/progress-recent.spec.ts tests/e2e/chrome/library-tidy.spec.ts</automated>
  </verify>
  <done>
    Strip section visible on all four views with seeded in-progress content; the
    empty-strip spare-chrome case (component count 0 on #/) still green; library-tidy
    DOM-order assertions still green; D16-14 supersession recorded in both the JSX
    comment and the spec comments.
  </done>
</task>

<task type="auto">
  <name>Task 3: Honest verification gate — affected suites, lint, typecheck</name>
  <files>(none modified — verification only)</files>
  <action>
    Run the affected e2e set — every spec touched or swept in planning:
    tests/e2e/library/reading-views.spec.ts, tests/e2e/library/search-tag-filter.spec.ts,
    tests/e2e/library/progress-recent.spec.ts, tests/e2e/library/v1-regression.spec.ts,
    tests/e2e/chrome/library-tidy.spec.ts, tests/e2e/library/metadata-edit.spec.ts (its
    strip-consistency test runs on #/). Then the unit suite (vitest run), lint, and
    typecheck. Pre-existing-failure honesty: STATE.md logs ~191 pre-existing e2e
    failures from the 09-07 non-GSD commits in this directory's deferred-items.md — if
    any targeted spec reports failures, diff them against that known set; only failures
    introduced by THIS change block completion (record the diff honestly in the
    summary; never silently re-run to green).
  </action>
  <verify>
    <automated>npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/library/search-tag-filter.spec.ts tests/e2e/library/progress-recent.spec.ts tests/e2e/library/v1-regression.spec.ts tests/e2e/chrome/library-tidy.spec.ts tests/e2e/library/metadata-edit.spec.ts && npm run test:unit -- --run && npm run lint && npx tsc --noEmit</automated>
  </verify>
  <done>
    All six affected e2e specs green (or failures ⊆ the deferred-items.md known
    pre-existing set, with the diff recorded); unit suite, ESLint, and tsc clean.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none) | Pure presentational change — CSS, JSX wrapper, conditional mounting, e2e tests. No ingestion, persistence, network, or dependency surface touched. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tpb-01 | Tampering | LibraryView empty-state markup | accept | EMPTY_COPY strings are static module constants rendered as React text children — no untrusted input crosses into the new wrapper; copy stays byte-stable and role-queryable |
| T-tpb-02 | Denial of Service | unconditional strip mount | accept | ContinueReadingStrip derives from already-loaded library state and already returns null when empty; mounting its wrapper section on 3 more views adds no data path |
</threat_model>

<verification>
- New measure test: .library-empty capped at 1100px and center-aligned with .library-header at 1400x900 on #/finished; narrow 360x640 width parity.
- Updated strip test: .library-section-continue + .continue-reading-strip visible on #/, #/unread, #/in-progress, #/finished with seeded in-progress content.
- Spare-chrome regression: progress-recent "empty strip" test still green (component count 0 with zero locations on #/).
- Byte-stability: no existing heading-name or copy-string assertion modified; strengthen-only additions.
- Comment discipline: D16-14 supersession recorded in LibraryView JSX, reading-views describe/test comments; library-tidy stale rationale refreshed.
</verification>

<success_criteria>
- Both reported UX issues reproducibly fixed: empty-view copy obeys the 1100px gutter at wide viewports; the Continue reading strip stays visible when switching among all four views.
- ContinueReadingStrip.tsx, EMPTY_COPY strings, and all spare-chrome behavior byte-unchanged.
- Affected e2e specs + unit + lint + typecheck green (pre-existing failures only from the documented deferred set).
</success_criteria>

<output>
Create `.planning/quick/260908-tpb-fix-two-related-library-ux-issues-empty-/260908-tpb-SUMMARY.md` when done
</output>
