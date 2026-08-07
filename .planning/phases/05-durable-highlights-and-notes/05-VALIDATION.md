---
phase: 5
slug: durable-highlights-and-notes
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| 05-05-T1 | 05 | 5 | ANNO-01, A11Y-01 | T-05-19 | DOM-Range selection (never Selection.toString) | e2e | `npm run test:e2e -- tests/e2e/annotations/capture-highlight.spec.ts capture-rejects.spec.ts keyboard-shortcuts.spec.ts` | ✅ | ✅ green |
| 05-05-T2 | 05 | 5 | ANNO-02, ANNO-03, ANNO-04 | — | note text React-escaped + Zod-validated | e2e | `npm run test:e2e -- tests/e2e/annotations/note-create-edit.spec.ts drawer-view.spec.ts delete-confirm.spec.ts navigate-back.spec.ts` | ✅ | ✅ green |
| 05-05-T3 | 05 | 5 | ANNO-05, ANNO-07, STATE-03, A11Y-05, D5-16 | T-05-17, T-05-18 | honest gate counts; no DEV-hook leak; cross-engine parity | e2e + phase gate | `npm run test` (full suite) | ✅ | ✅ green (996/0) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Phase-gate result (Plan 05-05):** `npm run test` exits 0 — 507 unit + 489 e2e = 996 passed / 0 failed / 0 skipped across chromium/firefox/webkit. See `05-05-OUTPUT.md` for the permanent record.

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** granted — Phase 5 phase gate green (Plan 05-05, 2026-08-07). Manual-only items (screen-reader announce quality, full keyboard traversal) remain for `/gsd-verify-work`.
