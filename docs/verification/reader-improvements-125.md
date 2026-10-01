# Reader improvements release verification (#125)

The automated release sweep is recorded in PR #140 and issue #125. Manual
accessibility acceptance is **pending**; automated keyboard tests, axe scans,
and the live accepted-flow pass do not establish screen-reader acceptance.
Do not declare the release verification complete until the results below are
recorded and any blocker or major finding is fixed and rerun.

Use [the manual acceptance protocol](../ACCEPTANCE-PROTOCOL.md) for the required
NVDA + Firefox on Windows and VoiceOver + Safari on macOS pairings, including
its scripted and exploratory checks. Record the tested commit, date, tester,
OS/browser/screen-reader versions, result, and any defect/retest for each row.
The rows below extend that protocol to the issue #125 surfaces; no pass is
claimed by this checklist.

| Surface            | Keyboard and screen-reader task                                                                                                   | NVDA / Firefox | VoiceOver / Safari |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| Discover           | Subscribe; read previews and feed controls; save inline; confirm announced status and Open affordance.                            | Pending        | Pending            |
| Add results        | Save a Discover item through Add; read the result and extraction limits; confirm Unread and predictable focus on close.           | Pending        | Pending            |
| Compact navigation | At 320px, traverse Library, Discover, and Highlights; check labels, order, visibility, focus, and return navigation.              | Pending        | Pending            |
| Library sorting    | With articles and a book present, choose Title and Recently opened; verify labels, order, and retained focus.                     | Pending        | Pending            |
| Annotation editing | Open Highlights; edit tags, color, and note; verify dialog announcements, keyboard operation, filter results, and restored focus. | Pending        | Pending            |
| Theme controls     | Edit Custom light and Custom dark independently; switch between them; verify labels, focus visibility, and readable content.      | Pending        | Pending            |

## Run record

- Commit: pending
- Date and tester: pending
- Platform and assistive-technology versions: pending
- Scripted and exploratory results: pending
- Defects and retest evidence: pending
