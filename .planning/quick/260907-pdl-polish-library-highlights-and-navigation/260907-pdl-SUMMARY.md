---
status: complete
---
# UI cohesion pass

Implemented in commit `01c9ea6`.

- Separated shell, library-view and contents navigation from prose links. Current destinations retain weight and a shape indicator, keyboard focus remains visible.
- Empty direct-child status regions retain live-region semantics without padding, border or margin. This removes the empty beige panels in Library and Highlights.
- Library actions now share a bottom-aligned flex footer; continue-reading links use a quieter editorial style.
- Highlights filters have paired labels and responsive full-width controls; quotes and curation actions share one container and consistent insets.
- Visual review found the native popover default left inset overriding intended right alignment. Explicit insets and border-box sizing fix desktop anchoring and mobile bounds. Added a three-engine regression for that defect.

## Verification

- TypeScript, production build, ESLint and git diff --check passed. Build retains its existing large-bundle advisory.
- 138 targeted Playwright checks passed across Chromium, Firefox and WebKit: shell navigation, library layout, highlights listing/curation, contents navigation and geometry.
- After the contents positioning adjustment, reran both contents suites: 75 passed, including the new desktop/right-edge and 320px bounds regression.
- CUA visual review: library, populated highlights and contents on desktop; highlights and library at 375px; full-width mobile contents. Created a sample highlight through selection + H in the isolated in-app browser. Mobile highlights measured 375px document width with 343px controls, all 44px high.

## Workflow

GSD quick executed inline. Existing tokens and typography preserved; user direction supersedes older underline-only navigation choices. No reading-engine or persistence changes. Automated browser tests initially hit sandbox network limits and passed after approved escalation.
