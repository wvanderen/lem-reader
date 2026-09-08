---
status: resolved
trigger: "Looks like there's a complete progress bar underline present on the library page incorrectly"
created: 2026-09-08
updated: 2026-09-08
---

# Debug Session: Library progress hairline

## Symptoms

- expected: The Library route has no reading-progress indicator beneath the application header.
- actual: A full-width, fully filled progress hairline appears beneath the header on the Library route.
- errors: No visible error message in the supplied screenshot.
- timeline: Reported after the recent smooth-progress and optional page-turn-motion change; exact first occurrence is unknown.
- reproduction: Open the application at the `#/` Library route with saved articles present.

## Current Focus

- hypothesis: ProgressHairline conflates two layouts: its unqualified root class always applies reader-chrome fixed positioning, so Library cards that reuse the component are taken out of their cards and painted viewport-wide beneath the header.
- test: Introduce an explicit viewport placement modifier for the two reader call sites, make inline/card placement the component default, and keep the existing root/fill hooks stable.
- expecting: Reader tracks retain fixed 48px viewport geometry, while every Library-side use computes to static positioning inside its card.
- next_action: complete
- reasoning_checkpoint:
    hypothesis: ProgressHairline's unqualified `.progress-hairline` CSS causes the Library underline because every Library call site reuses that class and therefore receives `position: fixed; top: 48px; left: 0; right: 0`.
    confirming_evidence:
      - App.tsx proves ArticleView itself is unmounted on Library routes, ruling out a leaked reader subtree.
      - LibraryRow, BookRow, and ContinueReadingStrip directly render ProgressHairline, whose root element always carries `.progress-hairline`.
      - app.css has one unscoped positioning rule for that class and no Library-specific override; its fill is full width and scaled only visually.
    falsification_test: A seeded in-progress Library row computing `.progress-hairline` to anything other than fixed viewport geometry in the current stylesheet would disprove the hypothesis.
    fix_rationale: Separating viewport placement from the reusable progress track makes fixed positioning opt-in only at reader call sites, so card callers remain in normal flow and cannot underline the app header.
    blind_spots: The Playwright pre-fix geometry assertion could not execute because the sandbox forbids binding Vite to port 5173; verification must combine non-browser checks here with the retained real-browser regression test for an unrestricted environment.
- tdd_checkpoint:

## Evidence

- timestamp: 2026-09-08T17:36:32Z
  checked: Debug knowledge base at .planning/debug/knowledge-base.md.
  found: No knowledge-base file exists.
  implication: There is no prior resolved-session candidate; test the code-derived fault tree directly.
- timestamp: 2026-09-08T17:37:32Z
  checked: App route composition and ProgressHairline component ownership.
  found: App.tsx renders LibraryView, ReviewView, and ArticleView as mutually exclusive branches; ProgressHairline is documented and implemented as an ArticleView child, not an app-shell child.
  implication: The reader-global ProgressHairline cannot remain mounted on the Library route through the normal router composition.
- timestamp: 2026-09-08T17:38:58Z
  checked: LibraryRow, BookRow, ContinueReadingStrip, ProgressHairline, and progress CSS.
  found: All three Library surfaces render the same ProgressHairline component/class used by ArticleView. The unscoped `.progress-hairline` rule sets `position: fixed; top: 48px; left: 0; right: 0`, while its fill is always 100% wide and visually scaled to the supplied ratio.
  implication: Any in-progress Library entry paints its progress at the viewport-wide header edge. Multiple Library instances overlap there, and a high-ratio entry can appear as a complete underline even though ArticleView is unmounted.
- timestamp: 2026-09-08T17:44:48Z
  checked: Focused Chromium execution of the new Library progress geometry regression assertion.
  found: Playwright could not start its configured Vite server because the sandbox rejected binding `[::1]:5173` with `listen EPERM`; no application assertion ran.
  implication: Browser execution is an environment limitation rather than contradicting code evidence; preserve the assertion for post-fix verification and use build/unit/static checks available in this sandbox.
- timestamp: 2026-09-08T18:02:00Z
  checked: Lint, production build, and the focused reader progress suite after the placement split.
  found: `npm run lint -- --quiet` exited 0; `npm run build` exited 0; Chromium `tests/e2e/progress.spec.ts` passed 5/5.
  implication: The implementation compiles and the reader-global hairline retains its existing behavior.
- timestamp: 2026-09-08T18:03:00Z
  checked: Focused Chromium execution of `tests/e2e/library/progress-recent.spec.ts` outside the sandbox.
  found: Test collection stops before browser assertions because the pre-existing public fixture corpus is empty and the module evaluates `normalizeText(fixtures[0])`.
  implication: The new Library geometry assertion is retained but presently blocked by an independent fixture-harness defect.

## Eliminated

- hypothesis: The shared reader ProgressHairline remains mounted on non-reader routes and resolves to 100% on Library geometry.
  evidence: App.tsx conditionally mounts ArticleView only when view.name is `article`; LibraryView replaces that subtree when view.name is `list`.
  timestamp: 2026-09-08T17:37:32Z

## Resolution

- root_cause: ProgressHairline is reused for reader-global and Library-card progress, but its single unqualified CSS class always applies fixed viewport geometry. Library-side instances therefore escape their cards and overlap as a full-width track directly below the 48px header.
- fix: Make inline/card placement the ProgressHairline default, scope fixed header geometry to `.progress-hairline-viewport`, and opt ArticleView and PaginatedSurface into that viewport modifier.
- verification: Lint PASS; production build PASS; focused Chromium reader progress suite 5/5 PASS. The focused Library suite is blocked before collection by its unrelated empty-fixture assumption.
- files_changed: src/reader/ProgressHairline.tsx, src/routes/ArticleView.tsx, src/reader/PaginatedSurface.tsx, src/app.css, tests/e2e/library/progress-recent.spec.ts
