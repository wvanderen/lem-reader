# PDF navigation verification (#294, #296, #297)

## Confirmed versus unverified

The numeric-bookmark heading inference defect is confirmed by the synthetic
real-adapter regression. Oversized canonical headings previously triggered a
pagination fallback; the new heading continuation regression was red before
#296 and green afterward. Neither observation establishes the cause of the
reporter's involuntary jumping in the private Engels PDF.

The private PDF and its legacy saved canonical representation are not available
in this checkout. Therefore the exact reported symptom remains **unverified**.
No claim of a complete jump fix is warranted. Obtain the original bytes and a
versioned export of the affected saved work (with the reader's consent) before
closing that verification gap. Do not commit private annotations or the PDF
without lawful durable fixture permission.

## Attempted portable matrix

`tests/e2e/pagination/oversized-heading.spec.ts` seeds an existing canonical
work directly, without reimport or structural repair. Its 90-segment heading
has the same canonical shape whether genuine or misclassified prose.

- Chromium and Firefox on the Linux development host.
- WebKit in the pinned Playwright Ubuntu container via rootless Docker.
- 390 × 740 viewport, default typography: forward turns until closing prose,
  backward turns to the opening heading, exact concatenation of rendered
  heading slices, no duplicate or missing text, no viewport overflow.
- Saved position inside heading segment 45: restore, resize to 480 × 800,
  change text size to 24 px, preserve the current page-head passage.
- Contents: exactly one destination for the continued heading; jump to the
  following heading, jump back to the beginning; switch to scrolling mode
  and verify the intact full heading.

All six portable cases (two per engine) pass. The 48-case Chromium/Firefox
coverage-invariant, fallback-oversize, and oversized-heading slice also passes.
The targeted pagination unit suite passes 252 cases. These are functional
checks, not reference-platform performance evidence; CI runner routing and
budgets are unchanged.

## Remaining exact-work matrix

When the private artifacts become available, repeat those sequences against
both a freshly corrected import and the legacy saved representation. Record
browser/version, viewport, typography, mode, page/window source offsets,
restoration state, and the precise input sequence. A failure needs a red-capable
browser regression before a navigation fix can be claimed. If no failure
reproduces, retain this gap explicitly rather than attributing it to atomic
heading layout by assumption.
