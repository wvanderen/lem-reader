# unpdf Package Approval Record — Plan 11-01 Task 1 (T-11-SC)

**Status:** APPROVED — install gate closed
**Approved pin:** `unpdf@1.8.1` (exact, `--save-exact`, no caret)
**Approver:** user (human-verify checkpoint, `gate="blocking-human"` — package-legitimacy verification)
**Date:** 2026-08-16
**Threat closed:** T-11-SC (Tampering — npm registry → node_modules; SUS legitimacy rating from 11-RESEARCH.md)

## Approval Signal

User reply to the Task 1 checkpoint: `"approved 1.8.1"`.

## Legitimacy Evidence (gathered pre-checkpoint, re-affirmed by the human)

| Signal | Value |
|--------|-------|
| Publisher | unjs (active org — github.com/unjs/unpdf) |
| License | MIT |
| Weekly downloads | ~1.85M |
| Runtime dependencies | zero |
| Install scripts | none (no postinstall/preinstall) |
| Types | bundled (shipped in-package) |
| SUS rating driver | "too-new": latest publish 2026-08-13 was three days before research — mitigated by the signals above |

## Pin Resolution (Open Question 1)

- STACK.md L63 locked `unpdf` at 1.8.0 at research time.
- Current patch 1.8.1 was verified API-neutral upstream (a `Math.sumPrecise` polyfill refactor).
- **User chose 1.8.1.** This supersedes the STACK.md 1.8.0 lock; the exact-pin discipline (no caret, no range) is preserved per the plan's `must_haves` truth ("unpdf is installed at the human-approved exact pin and no module under src/ imports it").

## Gate Closure

- No file changes occurred before this approval (the checkpoint ran before any install).
- Task 2 executes `npm install --save-exact unpdf@1.8.1` under this record.
- The server-only boundary stays enforced: `grep -rn 'from "unpdf"' src/` must return no matches (client bundle stays clean — Pitfall 12).
