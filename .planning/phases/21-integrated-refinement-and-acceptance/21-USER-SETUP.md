# Phase 21: User Setup Required

**Generated:** 2026-09-01
**Phase:** 21-integrated-refinement-and-acceptance
**Status:** Incomplete

These are the HUMAN-RUN acceptance sessions the agent cannot automate (locked
human arms per D13-06/D13-07 — real screen readers on real hardware). The
instrument is `docs/ACCEPTANCE-PROTOCOL.md` **v1.3** (authored by Plan 21-06);
the automated matrix arms are already green and recorded in
`21-06-SUMMARY.md`.

## Environment Variables

None — no secrets or external service configuration involved.

## Human Sessions

### 1. NVDA + Firefox on Windows hardware (off-machine)

- [ ] **Run protocol v1.3, NVDA + Firefox pairing** (flows A–L + the 5
  exploratory charters)
  - **Why:** ACPT-08 screen-reader arm — locked human-run on real hardware
    (D13-06/D13-07); this macOS machine has no NVDA (RESEARCH Environment
    Availability). User-scheduled.
  - **Instrument:** `docs/ACCEPTANCE-PROTOCOL.md` v1.3 — follow the §3 Setup,
    run every scripted flow + charter, record findings with §5 severity in the
    "v1.3 results sheet — NVDA + Firefox" (§6).
  - **Notes:** Flow C/K carry the NVDA preconditions (Native Selection Mode
    `NVDA+shift+f10` before Shift+arrows; focus mode `NVDA+Space` before Tab
    on the toolbar) — the protocol text explains each.

### 2. VoiceOver + Safari on macOS (incl. the D21-12 sighted image pass)

- [ ] **Run protocol v1.3, VoiceOver + Safari pairing** (flows A–L + the 5
  exploratory charters)
  - **Why:** ACPT-08 screen-reader arm + the one-time real-Safari image-flow
    verification (D21-12) folded into the same session.
- [ ] **D21-12 sighted pass (same session, after Flow L):** save an article
  with images (a real EPUB-with-images upload is the network-free path) →
  reopen offline → export → import → verify the figures still render + decode
  locally. Record the evidence in the VO+Safari results sheet's D21-12 row —
  `21-VERIFICATION.md` points at that record.

## Verification

After both sessions:

1. Both v1.3 results sheets (protocol §6) are filled in — environment, flow
   results, charter findings, verdicts.
2. Results land in `.planning/phases/21-integrated-refinement-and-acceptance/21-VERIFICATION.md`
   (the protocol's results-record location) via `/gsd-verify-work 21`.
3. **ACPT-08 flips ONLY if both runs land zero blocker / zero major**
   (D13-06/D13-07 fix-then-re-run loop otherwise) — the flip is verify-work's
   call, never in-plan.

---

**Once all items complete:** Mark status as "Complete" at top of file.
