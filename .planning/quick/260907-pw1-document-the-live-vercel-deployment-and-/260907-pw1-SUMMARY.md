---
status: complete
---
# Live deployment and Getting Started library

Implemented in commit `b13eba5`.

- Linked the verified production demo at `https://lem-reader.vercel.app/` from the README and package homepage.
- Documented Vercel's static build + generated Node ingestion function, fork deployment commands, post-deploy checks, local `.vercel/` state, and the binary-upload request ceiling.
- Added a canonical Getting Started article that introduces reading modes, typography, accessibility behavior, ingestion, organization, highlights, notes, local-first storage, export/import, limitations, and feedback.
- Separated the one-article public starter library from the seven-article technical regression corpus. The public `fixtures` contract now means visible starter content; `regressionFixtures` retains the stable corpus; `bundledFixtures` keeps all cases directly addressable for test and portability records.
- Kept existing deep links and fixture-backed annotation/import resolution working even though technical corpus rows are no longer visible on a fresh Library screen.

## Verification

- Live Vercel URL loaded successfully and exposed the production Lem Reader UI and ingestion controls.
- Full unit suite passed: 104 files and 1,605 tests, with 2 files / 13 tests intentionally skipped.
- ESLint, `lint:no-danger`, TypeScript, generated API self-containment, and the Vite production build passed.
- Focused three-browser Playwright run passed: 27/27 across Chromium, Firefox, and WebKit.
- Browser inspection confirmed a fresh Library has exactly one row, “Getting started with Lem Reader,” and that the guide paginates into semantic headings and prose with its source link available.
- `git diff --check` passed. The existing production bundle-size advisory remains unchanged.

## Workflow

GSD quick executed inline because automatic sub-agent delegation was not authorized. The live site was inspected read-only; no Vercel deployment was triggered.
