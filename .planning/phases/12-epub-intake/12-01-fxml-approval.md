# fast-xml-parser Package Approval Record — Plan 12-01 Task 1 (D12-15, T-12-SC)

**Status:** APPROVED — install gate closed
**Approved pin:** `fast-xml-parser@5.10.1` (exact, `--save-exact`, no caret)
**Approver:** user (human-verify checkpoint, `gate="blocking"` — package-legitimacy verification; blocking-human per legitimacy-checkpoint policy, auto_advance ignored)
**Date:** 2026-08-18
**Threat closed:** T-12-SC (Tampering — npm registry → node_modules; SUS legitimacy rating from 12-RESEARCH.md §Package Legitimacy Audit)

## Approval Signal

User reply to the Task 1 checkpoint ( relayed via the orchestrator): `"approved 5.10.1"`.

## Legitimacy Evidence (registry re-verified 2026-08-18 pre-checkpoint; re-affirmed by the human)

| Signal | Value |
|--------|-------|
| Maintainer | amitgupta (NaturalIntelligence org — github.com/NaturalIntelligence/fast-xml-parser, ~10 yrs tenure) |
| License | MIT (5.10.1 and 5.11.0 both) |
| Weekly downloads | ~69.3M |
| Runtime dependencies | pure JS only — strnum, is-unsafe, xml-naming, fast-xml-builder, @nodable/entities, path-expression-matcher (identical set in 5.10.1 + 5.11.0) |
| Install scripts | none (no postinstall/preinstall/prepare — the `scripts` field carries dev tooling only: lint/test/bundle) |
| Types | bundled (`./src/fxp.d.ts`) |
| Native bindings | zero |
| SUS rating driver | "too-new": 5.11.0 published 2026-08-16, one day before research — mitigated by the signals above |

## Pin Resolution (12-RESEARCH Open Question 1)

- The checkpoint offered 5.10.1 (default — STACK.md-verified lineage, in-registry since 2026-07-16, sidesteps the "too-new" SUS driver entirely) vs 5.11.0 (current latest — would have required a verified API-neutral 5.10.1→5.11.0 diff per assumption A6).
- **User chose 5.10.1.** The exact-pin discipline (no caret, no range) is preserved per the plan's `must_haves` truth ("fast-xml-parser is installed at the human-approved exact pin and no module under src/ imports it (D12-15)").

## Parser Hardening Contract (T-12-04 / T-12-06 — pinned now, enforced in 12-02)

The adapter (Plan 12-02) configures fast-xml-parser with the 12-RESEARCH L514-533 options block: `processEntities: false` (entity-expansion DoS guard — library-docs-recommended for untrusted XML), `maxNestedTags: 40` (hostile nesting cap, below the 100 default), default `onDangerousProperty` throw behavior (prototype pollution), `ignoreAttributes: false` + `removeNSPrefix: true` + `isArray` for repeatable manifest elements. The `entityBombOpf` / `protoPollutionOpf` fixtures (12-01 Task 3) force these tests in 12-02.

## Gate Closure

- No file changes occurred before this approval (the checkpoint ran before any install).
- Task 2 executes `npm install --save-exact fast-xml-parser@5.10.1` under this record.
- The server-only boundary stays enforced: `grep -rn 'from "fast-xml-parser"' src/` must return no matches (client bundle stays clean — fast-xml-parser joins unpdf/jsdom behind `/server` imports; only Block/InlineRun types cross — Pitfall 12). The dist/ grep proof lands at 12-08.
