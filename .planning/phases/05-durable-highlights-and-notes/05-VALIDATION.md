---
phase: 5
slug: durable-highlights-and-notes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit/logic) + Playwright (real-browser layout/selection/forced-colors) |
| **Config file** | `vitest.config.*`, `playwright.config.*` (existing from prior phases) |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~60–120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _TBD — filled during execution_ | — | — | ANNO-01..07, STATE-03 | — | note text React-escaped + Zod-validated at boundary | unit + e2e | `npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Vitest + Playwright configs already present from prior phases — confirm before Wave 1.

*Existing infrastructure (Vitest + Playwright) covers all phase requirements; no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader announcement of highlight creation/ambiguous state | ANNO-01, ANNO-04 | Automated axe covers structure, not live-region UX quality | NVDA/VoiceOver: create highlight, confirm announcement; trigger orphan state, confirm explicit announcement |
| Keyboard-only highlight create/edit/delete flow | ANNO-01, ANNO-02 | Full keyboard path traversal not fully automatable | Tab/select/create/edit/delete via keyboard only |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
