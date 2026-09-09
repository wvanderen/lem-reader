---
status: complete
---
# Compact library cards

Kept the established booklike identity and compact card grid. Native title links cover card backgrounds while source/edit/remove/read-state controls remain independent. Author and source share a metadata row. Continue reading uses responsive columns and visible progress. Read marks the saved location complete; unread clears saved locations for all revisions and restarts reading. Storage failures remain visible beside the initiating control.

Validation: desktop 1280px and mobile 390px inspected; no horizontal overflow. New card-background navigation and persisted read/unread test passes Chromium, Firefox, WebKit. Five persistence tests and twelve reading-state tests pass. Changed-source ESLint and Impeccable detector pass.

Broader Chromium library run: 32/35 pass. Three pre-existing fixture-count expectations assume seven bundled samples instead of one (library-restore two tests, reading-views corpus sanity). Typecheck blocked by existing focused-add.spec.ts:377 reference to fixtureArticle.title instead of provenance.title, verified in HEAD. No unrelated test changes made.
