---
phase: 8
slug: markdown-pipeline-and-personal-library
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit/component) + Playwright (e2e/layout, all 3 engines) + @axe-core/playwright (a11y) |
| **Config file** | vitest config + playwright.config (existing — v1.0 baseline) |
| **Quick run command** | `npm run test` (vitest unit/component subset) |
| **Full suite command** | `npm run test` + `npx playwright test` |
| **Estimated runtime** | ~{N} seconds (refine during Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run full suite (`npm run test` + `npx playwright test`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {8-01-01} | 01 | 1 | ING-03 | — | N/A | unit | `{command}` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> The planner/executor will populate concrete task IDs, requirement mappings (ING-03, LIB-01–LIB-06), and automated commands from RESEARCH.md's Validation Architecture section.

---

## Wave 0 Requirements

- [ ] Test stubs for Markdown pipeline (`markdownToBlocks` → Block-output contract round-trip)
- [ ] Test stubs for Dexie `version(4)` additive migration (v3→v4, fixtures badging)
- [ ] Test stubs for library search/tag/filter and cascade-delete
- [ ] E2e guard for v1.0 regression (LibraryView preserves `<h1>Saved articles</h1>` + `<ul><li><a href="#/article/<id>">` structure)

*Existing v1.0 vitest + Playwright infrastructure covers the baseline; Wave 0 adds phase-specific stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {behavior} | REQ-{XX} | {reason} | {steps} |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
