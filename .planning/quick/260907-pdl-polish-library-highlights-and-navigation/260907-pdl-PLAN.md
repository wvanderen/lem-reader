---
status: planned
---
# UI cohesion pass

1. Separate navigation styling from prose hyperlinks; retain link semantics, active indicators, focus rings and 44px targets. Refine continue-reading and library action hierarchy with existing tokens.
2. Remove empty status-region chrome without unmounting live regions. Align highlights heading, filter groups and card actions; retain all editing and jump behavior.
3. Verify build, lint, relevant browser regression suites and desktop/mobile screenshots. Record evidence and commit the scoped change.

Scope: app CSS, library row actions, review filter markup. No reading-engine or persistence changes. User screenshots and request authorize updating previous underline/card design choices. Execute inline through GSD quick.
