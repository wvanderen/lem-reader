---
phase: quick-260819-qbq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app.css
  - tests/e2e/chrome/paginated-quiet-header.spec.ts
autonomous: true
requirements: [QUICK-260819-QBQ]
must_haves:
  truths:
    - "In paginated mode the pinned header row is a single quiet line (~14px/1.45 register, ≤44px tall at 360×640) so nearly all pinned surface height goes to the reading page"
    - "Back to library remains a REAL ≥44×44px keyboard-reachable, Enter-activatable target (no pseudo-element — a real fixed box in the chrome layer, aligned on the page-indicator line)"
    - "Scrolling mode and ReviewView are visually unchanged (every new rule scoped under .article-body.paginated-surface)"
    - "The 09-07 locked rules stay byte-unchanged (grid-template-rows cap + header min-height/overflow-y)"
  artifacts:
    - path: "src/app.css"
      provides: "Scoped paginated quiet-header block (fixed chrome-layer back button + quiet h1 register) with contract comments"
      contains: "article-body.paginated-surface > header .back-to-library"
    - path: "tests/e2e/chrome/paginated-quiet-header.spec.ts"
      provides: "3-engine proof of the quiet-header contract + scrolling-mode non-impact"
      min_lines: 60
  key_links:
    - from: "src/app.css"
      to: "src/routes/ArticleView.tsx"
      via: "scoped selector must match the mounted header anatomy (header > BackToLibrary + h1, lines ~1716-1731)"
      pattern: "\\.article-body\\.paginated-surface > header \\.back-to-library"
    - from: "tests/e2e/chrome/paginated-quiet-header.spec.ts"
      to: "src/app.css"
      via: "asserts computed position fixed, bbox ≥44×44, h1 14px in paginated; static + 26px after mode toggle"
      pattern: "paginated-quiet-header"
---

<objective>
Reduce the pinned paginated article header (Back to library button + h1 title) to the quiet
chrome register of the page indicator ("N of M"), so nearly all pinned surface height goes to
the reading page. CSS-only; one new e2e spec proves the contract.

Purpose: at 360×640 the header row today is max(44px button, 26/32px title lines) = 44–96px of
the pinned surface. The user wants it at roughly the page-indicator register (~20px) with the
back affordance keeping a true 44px hit area (A11Y-07).

Output: (1) a scoped CSS block in src/app.css; (2) tests/e2e/chrome/paginated-quiet-header.spec.ts.

MECHANISM DECISION (planner refinement of the suggested direction — implement EXACTLY this;
do NOT "fix" it back to a pseudo-element):

The suggested `::after { inset: -10px }` hit-area expansion CANNOT work here. The paginated
header is a scroll container by the locked 09-07 rule (`.article-body.paginated-surface >
header { min-height: 0; overflow-y: auto; }` must stay byte-unchanged). A scroll container
clips its descendants — including the button's absolutely-positioned pseudo-element — at the
header's padding box, for BOTH painting and pointer hit-testing. Inside a ~20px quiet row the
pseudo would deliver at most a ~20px effective target (A11Y-07 silently violated), and its
end-ward extension would add scrollable overflow → a phantom header scrollbar.

The sound mechanism is the codebase's own quiet-chrome pattern: `position: fixed` escapes all
ancestor overflow clipping (containing block = viewport; no transformed ancestors on the
path), so the button keeps a REAL 44×44px border box in the fixed chrome layer beside the
page indicator and chevrons — no pseudo-element, no new `::after` precedent, no overflow risk.
The header row then contains only the quiet h1 (~20px). DOM order and focus order are
unchanged (`position: fixed` does not alter DOM/focus order — the back-nav.spec.ts (d)
Tab-order contract holds by construction). The box's transparent lower half overlaps the top
~2px of the pinned surface at mobile widths — the `.page-turn` chevron precedent (44px
transparent hit boxes over the reading surface) already establishes that trade.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md

# Load-bearing source (read once, extract patterns):
- src/app.css lines 968–1153 — Phase 4 paginated-surface section: locked grid cap + header
  rule (lines ~1016–1048), .page-viewport (1049), .page-indicator (1104–1112:
  `top: calc(48px + var(--space-sm)); right: var(--space-sm)`, 400 14px/1.45, --ink-soft,
  z-index 5), .page-turn chevrons (1120–1148)
- src/app.css lines 2965–3113 — 13-04 header rules: .back-to-library base + hover
  (3028–3045), .article-body > header flex (3057–3062), h1 sizing 26px/32px + ≥640px 32px
  (3073–3082), .article-top-meta (3097+), .resume-banner-dismiss hover→--accent (968–970)
- src/routes/ArticleView.tsx lines 1712–1731 — article element + header anatomy
  (BackToLibrary + h1; the only header children)
- src/reader/BackToLibrary.tsx — component contract (native button, class hook)
- src/reader/PageIndicator.tsx — the prominence reference
- tests/e2e/chrome/header-geometry.spec.ts — MIRROR this harness (beforeEach image route +
  indexedDB.deleteDatabase("lem-reader"); openPaginatedAtSmallPhone helper; 360×640;
  __lemPagination wait + 600ms settle). Its three tests MUST stay green.
- tests/e2e/chrome/back-nav.spec.ts — keyboard/click contract that must keep passing

# Tokens: --space-xs:4px --space-sm:8px --space-md:16px --space-2xl:48px --touch:44px
# --ink --ink-soft --hairline --accent --font-ui. Geometry: app header 48px + hairline 2px +
# main#main padding-block --space-2xl → pinned surface top ≈ y98; chrome band y50–98 holds
# the page-indicator line (text ≈ y56–76, right side). The fixed button text top-aligns on
# the SAME line (y56–76, left side).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scoped paginated quiet-header CSS (fixed chrome-layer back button + quiet h1)</name>
  <files>src/app.css</files>
  <action>
    Insert ONE new scoped block into src/app.css immediately AFTER the locked rule
    `.article-body.paginated-surface > header { min-height: 0; overflow-y: auto; }`
    (lines ~1045–1048) and BEFORE the `.page-viewport` rule (line ~1049) — the Phase 4
    paginated-surface section is the coherent home (sibling of .page-indicator/.page-turn
    chrome). Do NOT modify any existing rule's bytes: the 09-07 grid-template-rows cap and
    header rule stay byte-unchanged (locked regression fix), and the base `.back-to-library`,
    `.article-body > header`, and `.article-body > header h1` rules (scrolling mode +
    ReviewView mounts) stay as-is. The block contains exactly three rules plus comments:

    1. Quiet fixed back button — selector `.article-body.paginated-surface > header
       .back-to-library`. Declarations: position: fixed; top: calc(48px + var(--space-sm));
       left: var(--space-sm); z-index: 5 (same chrome layer as the page indicator — same
       layer contract, below the app header's 10); min-width: var(--touch); min-height:
       var(--touch) (A11Y-07 REAL 44×44 box — no pseudo-element, per the objective's
       mechanism decision); padding: 0 (overrides the base padding-inline --space-md so the
       text sits flush at left: var(--space-sm) exactly like the indicator at right);
       border: 0 (quiet TEXT register — no hairline: the register references
       .page-indicator/.resume-banner-dismiss, which are unboxed; a bordered pill would
       still read as a control, defeating the prominence goal; the base hover's
       border-color is inert once border-width is 0 — do not re-declare it); font-family:
       var(--font-ui); font-size: 14px; line-height: 1.45; color: var(--ink-soft);
       align-items: flex-start (text rides the indicator line at the top of the 44px box;
       the box's transparent lower half is the hit zone — .page-turn chevron precedent).
       The base rule continues to supply display: inline-flex, background: transparent,
       cursor: pointer, border-radius.

    2. Scoped interaction states — selector `.article-body.paginated-surface > header
       .back-to-library:hover, .article-body.paginated-surface > header
       .back-to-library:focus-visible` with a single declaration: color: var(--accent).
       This mirrors the .resume-banner-dismiss text-button discipline (app.css ~968–970);
       visible focus keeps the global :focus-visible 2px outline around the real 44px box.

    3. Quiet title register — selector `.article-body.paginated-surface > header h1`.
       Declarations: font-family: var(--font-ui); font-size: 14px; line-height: 1.45;
       font-weight: 400 (exact .page-indicator/.chapter-nav register — 500 unjustified);
       color: var(--ink-soft) (passes AA at ~6.4:1 per the .chapter-nav comment). The
       scoped specificity (0,2,2) beats both the base `.article-body > header h1`
       (26px/32px, (0,1,2)) and its ≥640px 32px media override, so no media query is
       needed — flat 14px like the indicator. margin-block stays 0 from the base rule.
       The element remains an h1 (heading semantics + one-h1-per-page untouched — D-01-02
       decision); only the visual register changes in paginated mode.

    4. Comments (this codebase documents locked decisions in CSS comments — match it):
       above the block, a contract comment recording (a) the quiet-header goal (header row
       ≈ the page-indicator register so nearly all pinned height goes to the reading page);
       (b) WHY fixed instead of a hit-area pseudo-element — the header is a scroll container
       per the locked 09-07 overflow-y rule, which clips descendant pseudo-elements for
       painting AND hit-testing, so pseudo expansion cannot deliver a 44px target inside a
       ~20px row and would add end-ward scrollable overflow; a real 44px box in the fixed
       chrome layer delivers it with zero new ::after precedent; (c) DOM/focus order
       invariance (fixed positioning never alters DOM order — Tab reaches the button before
       the title by construction); (d) the chevron-precedent transparent hit zone over the
       surface's top-left; (e) tokens-only + zero motion/transition properties (A11Y-06
       discipline, per the 13-01 comment discipline keep property names out of prose);
       (f) scrolling mode + ReviewView untouched by scoping. Additionally add a one-line
       cross-reference comment directly after the 13-04 `.back-to-library:hover` rule
       (~line 3045) noting that paginated mode overrides this register in the Phase 4
       paginated-surface section — cite both homes.

    Do NOT touch: .article-top-meta / articleStartChrome / firstPageReservedPx machinery,
    .page-indicator, .page-turn, PaginatedSurface.tsx, any TSX file. Do not add any
    transition/animation property anywhere (A11Y-06).
  </action>
  <verify>
    <automated>npm run lint && grep -c "article-body.paginated-surface > header .back-to-library" src/app.css && git diff src/app.css | grep -v '^+' | grep -c "overflow-y: auto" </automated>
  </verify>
  <done>
    Scoped block present after the locked header rule (selector appears ≥2× — base + hover
    override); h1 quiet rule present; the locked rule and grid-template-rows line absent
    from removed diff lines (the final grep prints the unchanged-context count, not 0);
    lint clean; no TSX file modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: E2E contract spec + targeted gates</name>
  <files>tests/e2e/chrome/paginated-quiet-header.spec.ts</files>
  <behavior>
    - Paginated @ 360×640: back button computed position is "fixed" and boundingBox ≥ 44×44 (A11Y-07 real box)
    - Paginated: h1 computed font-size is "14px"; header row (article.article-body > header) boundingBox height ≤ 44px; header scrollHeight ≤ clientHeight (13-04 D13-13 no-internal-scroll still holds)
    - After toggling to scrolling via the Reading mode button: button computed position is "static", h1 font-size is "26px" (base register proves paginated-only scoping)
  </behavior>
  <action>
    Create tests/e2e/chrome/paginated-quiet-header.spec.ts mirroring the
    header-geometry.spec.ts harness exactly: beforeEach = image route pixel-svg fulfillment
    + goto BASE + indexedDB.deleteDatabase("lem-reader") resolve-on-all-outcomes; a local
    openPaginatedAtSmallPhone helper = setViewportSize 360×640, goto
    BASE/#/article/essay-long-form, expect h1 visible, waitForFunction
    window.__lemPagination defined (8s timeout), then the established 600ms corpus settle
    window. Plain test() calls (inherit the 3-engine chromium/firefox/webkit matrix). Two
    tests:

    Test 1 "paginated: header is the quiet indicator register and the back button keeps a
    real 44×44 fixed box": via page.evaluate read computed styles (getComputedStyle) and
    getBoundingClientRect for `article.article-body > header .back-to-library` (assert
    position "fixed"; rect width ≥ 44 and height ≥ 44) and for the header's h1 (assert
    fontSize "14px"); read the header element's bounding rect height and assert ≤ 44 with a
    message documenting the register (previously the row floored at the 44px pill and grew
    to ~96px on wrapped 26/32px titles); assert header.scrollHeight ≤ header.clientHeight
    (mirrors header-geometry test 1 — the quiet row must not trip the 09-07 scroll net).

    Test 2 "scrolling mode keeps the base header register": open paginated as above, click
    page.getByRole("button", { name: /reading mode/i }) (the shared handleToggleMode path),
    expect .page-viewport count 0, then assert computed position of .back-to-library is
    "static" and the article h1 fontSize is "26px", and the button rect height ≥ 44 (base
    min-height pill). This proves every new rule is paginated-scoped.

    Header comment cites the quick task, the mechanism decision (fixed real-44px box
    because the header scroll-container clips pseudo expansion — one sentence), and the
    contract clauses. No fixed sleeps for load-bearing readiness (waitForFunction only;
    the 600ms settle mirrors the corpus specs).

    Then run the gates IN ORDER and record honest results in the summary (this project's
    honest-gate discipline): (1) npx playwright test
    tests/e2e/chrome/paginated-quiet-header.spec.ts; (2) npx playwright test
    tests/e2e/chrome/back-nav.spec.ts tests/e2e/chrome/header-geometry.spec.ts
    tests/e2e/pagination/no-overflow-invariant.spec.ts; (3) npx vitest run
    tests/unit/pagination (targeted unit smoke — CSS-only change cannot affect units, this
    is belt-and-suspenders); (4) npm run lint already green from Task 1 — re-run if any
    file changed. If runtime allows, also npx playwright test
    tests/e2e/open-every-fixture.spec.ts (broad smoke; a smaller header only increases page
    capacity). All specs run the 3-engine matrix by default — do not pass --project.
  </action>
  <verify>
    <automated>npx playwright test tests/e2e/chrome/paginated-quiet-header.spec.ts tests/e2e/chrome/back-nav.spec.ts tests/e2e/chrome/header-geometry.spec.ts tests/e2e/pagination/no-overflow-invariant.spec.ts</automated>
  </verify>
  <done>
    New spec green on chromium/firefox/webkit; back-nav (click + Tab order + Enter),
    header-geometry (no internal scrolling, spot/reserve geometry), and
    no-overflow-invariant all green; targeted unit smoke green; lint green. Summary records
    which gates ran and their honest pass/fail counts, plus whether open-every-fixture ran.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Presentation-only CSS change; no new input, storage, network, or dependency surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260819-01 | Tampering | src/app.css scoped selectors | accept | No user-influenced data reaches CSS; scoped selectors cannot match injected markup (no dangerouslySetInnerHTML in src per lint:no-danger) |
| T-260819-02 | Denial of Service | header row shrink vs pagination engine | mitigate (behavioral) | Engine measures live geometry (pageContentBoxHeightPx); a smaller header only increases page capacity — no-overflow-invariant + header-geometry specs gate it |
| T-260819-SC | Tampering | package installs | accept | Zero package installs in this task |
</threat_model>

<verification>
- npm run lint — clean.
- New spec green on all 3 engines (fixed ≥44×44 real box; header ≤44px quiet register; h1
  14px paginated-only).
- back-nav.spec.ts green (keyboard reachability + activation unchanged — DOM order intact).
- header-geometry.spec.ts green (13-04 D13-13 no-internal-scroll + Option A spot/reserve
  geometry compose with the quieter row).
- no-overflow-invariant.spec.ts green (page viewport still excludes the header; fragments
  fit — more capacity, not less).
- Optional if runtime allows: open-every-fixture.spec.ts broad smoke.
- Targeted unit smoke: npx vitest run tests/unit/pagination.
</verification>

<success_criteria>
- In paginated mode at 360×640 the pinned header row is one quiet line (≤44px, typically
  ~20px) at the page-indicator register; nearly all pinned height goes to the reading page.
- Back to library is a real, fixed, ≥44×44 keyboard-reachable target aligned on the
  indicator line — A11Y-07 honored WITHOUT introducing a ::after precedent (which the
  header's locked scroll-container rule would clip into non-function anyway).
- Scrolling mode + ReviewView pixel-unchanged; 09-07 locked rules byte-unchanged; tokens
  only; zero motion properties; h1 remains an h1.
</success_criteria>

<output>
Create `.planning/quick/260819-qbq-reduce-header-and-back-to-library-promin/260819-qbq-SUMMARY.md`
when done (record which gates ran + honest counts, and the mechanism decision note).
</output>
