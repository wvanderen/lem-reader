# UI polish verification

Scope: [confirmed UI polish spec](../specs/ui-polish.md).

## Behavior and layout

- Component regressions cover visible library highlight counts, disabled zero-count actions (including chapter rows with no stored count), a single Discover saving spinner, filter clearing with sort preservation, and independent settings disclosures retained while mounted.
- Real-browser checks cover scoped Clear filters and expanded-book chapter actions at 320px in Chromium, Firefox, and WebKit.
- The book regression reproduced horizontal overflow (336px content in a 320px viewport) before the nested action-layout fix.
- Corrected navigation/reflow regressions: 24 passing cases across the three engines. These exercise shell Library navigation, saved library return context, 320px library/Add/Highlights reflow, zoomed Add controls, and disclosed settings controls.
- Collaborative preview inspected the library, Highlights, settings, and highlight editor. Computed editor geometry confirms equal 380px note/tag widths, a zero-height idle color status region, and separated Delete/Done controls.
- Preview resizing timed out; narrow-layout verification uses the real-browser regression suite rather than claiming a manual mobile screenshot pass.

## Standards

0 findings in the independent Standards review, including the final narrow-layout changes.

## Spec

0 actionable findings in the independent Spec review. Its expanded-book concern was reproduced and fixed, with a three-engine regression.

## Tooling

Typecheck, lint, production build, and the Impeccable mechanical scan pass.
The full `npm test` run completed:
- Unit/component: 3,022 passed, 16 skipped. The subsequently added missing-count chapter test passes in the focused 25-test library run.
- Browser: 2,132 passed, 20 skipped, 12 failures recorded before corrections. Four failures were worker collection mismatches after retired Back tests were replaced while the suite was running.
- Every failed behavior was corrected and rerun across all three engines. The full run itself remains nonzero; no claim is made that its captured report is wholly green.
- The throttled-mobile performance harness passed.

Final frozen-source targeted rerun: **33 passed** across Chromium, Firefox, and WebKit, covering every corrected failure plus scoped clearing and expanded-book reflow.
