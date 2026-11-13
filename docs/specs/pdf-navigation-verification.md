# PDF navigation verification (#294, #296, #297)

## Confirmed versus unverified

The numeric-bookmark heading inference defect is confirmed by the synthetic
real-adapter regression. Oversized canonical headings previously triggered a
pagination fallback; the new heading continuation regression was red before
#296 and green afterward. Neither observation establishes the cause of the
reporter's involuntary jumping in the private Engels PDF.

On 2026-11-13 the reader supplied the normalized Anti-Dühring work in the
attached localhost browser, with active flickering. That specific idle ToC
oscillation is now reproduced and locally corrected (see below). This does not
establish that every reported navigation symptom has the same cause.

The original PDF bytes and legacy saved export are still not available in this
checkout for the full before/after matrix. Obtain those with the reader's
consent before closing that remaining gap. Do not commit private annotations
or the PDF without lawful durable fixture permission.

## Attempted portable matrix

`tests/e2e/pagination/oversized-heading.spec.ts` seeds an existing canonical
work directly, without reimport or structural repair. Its 90-segment heading
has the same canonical shape whether genuine or misclassified prose.

- Chromium and Firefox on the Linux development host.
- WebKit in the pinned Playwright Ubuntu container via rootless Docker.
- 390 × 740 viewport, default typography: forward turns until closing prose,
  backward turns to the opening heading, exact concatenation of rendered
  heading slices, no duplicate or missing text, no viewport overflow.
- Saved malformed h3 larger than the measurement-window capacity: restore
  inside entry 500 of an 800-entry heading; turn forward and back to the same
  visible source slice without fallback.
- Saved position inside heading segment 45: restore, resize to 480 × 800,
  change text size to 24 px, preserve the current page-head passage.
- Contents: exactly one destination for the continued heading; jump to the
  following heading, jump back to the beginning; switch to scrolling mode
  and verify the intact full heading.

All nine portable cases (three per engine) pass. The 48-case Chromium/Firefox
coverage-invariant, fallback-oversize, and oversized-heading slice also passes.
The targeted pagination unit suite passes 252 cases. These are functional
checks, not reference-platform performance evidence; CI runner routing and
budgets are unchanged.

## Actual-work idle ToC oscillation (2026-11-13)

At a fixed 794 × 950 viewport, default 18 px Literata, Page 3 alternated between
ToC tail entries and preface prose without any input or scroll movement. A
100 ms interval sample over four seconds captured repeated transitions between
825.3125 px and 668.15625 px fragment widths. The article surface itself stayed
668.15625 px wide; its implicit grid column grew to the long dotted leaders'
min-content width. This made visible-fragment geometry disagree with the
measurement article and fed the resize/repagination loop.

A temporary single-property probe (`grid-template-columns: minmax(0, 1fr)`)
constrained the track. The permanent authored-CSS fix uses the same rule; the
probe was removed. After hot reload and font settling, a ten-second idle sample
(50 observations at 200 ms intervals) of the original active page had one
text/geometry state and a fragment width of 668.15625 px, matching the article
surface. No reimport, repair, navigation,
annotation mutation, or work export was needed to verify this observation.

`tests/e2e/pagination/toc-width-stability.spec.ts` uses synthetic dotted leaders,
not private book text. Before the fix, the bounded idle sample failed with the
fragment 16 px wider than its surface (allowed tolerance 1 px). After the fix it
passes Chromium, Firefox and container WebKit, checking both bounded width and
stable idle page text. Twelve adjacent Chromium/Firefox oversized-heading and
repagination-anchor cases also pass. No runner, reference budget, restore
policy, or overflow-correction limit changed.

## Remaining exact-work matrix

When the private artifacts become available, repeat those sequences against
both a freshly corrected import and the legacy saved representation. Record
browser/version, viewport, typography, mode, page/window source offsets,
restoration state, and the precise input sequence. A failure needs a red-capable
browser regression before a navigation fix can be claimed. If no failure
reproduces, retain this gap explicitly rather than attributing it to atomic
heading layout by assumption.
