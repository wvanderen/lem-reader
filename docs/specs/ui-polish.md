# UI polish — October 2026

Confirmed with the reader on October 1, 2026.

- Highlight editor: unboxed semantic Tags and Color groups; contained tag input; no idle color feedback card; Delete left and Done right with a gap.
- Discover: while saving, replace the plus with one spinner.
- Highlights: heading first, no Back control; Clear filters resets article scope, article search, article tag, highlight tag, and confidence, preserving sorting.
- Library: pill tags; stable highlights action position, disabled at zero, visible count above zero; compact checkmark and Finished badge.
- Settings: independent native disclosures for Reading (initially open), Appearance, Read-aloud, and Your data (initially closed). Preserve disclosure state while mounted. Space contrast correction and base-color reset buttons.
- Test seams: existing component interfaces for filter clearing, library actions/counts, Discover loading, and settings disclosures. Check geometry in the browser.
- Review against 280281d8e9dd63b6dcf2a29566aac96bafdc5e99; commit to the current branch.

These presentation choices supersede the older source comments that hide the library highlights action at zero and put Back above the Highlights heading. No storage or annotation anchoring policy changes.
