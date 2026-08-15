---
status: testing
phase: 09-versioned-export-import
source: [09-VERIFICATION.md]
started: 2026-08-15T20:15:00Z
updated: 2026-08-15T20:30:00Z
---

## Current Test

number: 2
name: Visual calm pass over the new portability surfaces at narrow width
expected: |
  Calm-booklike visual consistency with existing settings/dialog tokens; no layout disturbance from the new cluster; export button does not crowd the article header at 360px
awaiting: user response

## Tests

### 1. Stacked-modal focus decision (webkit Tab divergence)

**Context:** While the Settings panel is open underneath, opening the Import Preview `<dialog>` in webkit means Tab never reaches the inner controls of `dialog.import-preview` (webkit parks focus on the inert body). Chromium/firefox cycle the trap normally. The universal safety properties — focus trap, initial focus on the non-destructive action, Esc restore, full keyboard operability — are asserted green on ALL engines; only the wrap-cycle nuance differs. The phase's `deferred-items.md` records three candidate resolutions:

- **A. Accept engine reality** — document the divergence; webkit users reach controls via initial focus + arrow/Enter, operability already proven
- **B. Close Settings while preview is open** — guarantees single-modal stacking on every engine; changes the visual return state after dialog close
- **C. Nested dialog structure** — restructure so preview is a child of Settings; largest structural change, may complicate the RemoveConfirm pattern

expected: A product decision recorded and logged against deferred-items.md (any of A/B/C or your own alternative)
result: [passed] — RESOLVED 2026-08-15: Option A (accept engine reality) recorded in deferred-items.md with rationale; no code change required, e2e continues asserting universal safety on all engines + chromium wrap-cycle

### 2. Visual calm pass over the new portability surfaces at narrow width

**Context:** Axe + RTL + e2e prove structure, roles, content, and keyboard operability for the new Settings "Your data" cluster, the Import Preview dialog, and the ArticleView "Export highlights" button. Visual calm and typographic fit are perceptual qualities no automated check covers.

What to look at (dev server: `npm run dev`, narrow the window to ~360px):
- Settings "Your data" cluster — spacing/rhythm consistent with existing settings sections; export/import buttons don't crowd
- Import Preview dialog — counts/conflicts readable at 360px; bulk toggles wrap gracefully; matches existing dialog tokens
- ArticleView header — "Export highlights" affordance does not crowd the article header at 360px
- Highlights .md export — open a downloaded file in any text editor; blockquote + citation + note template reads calm; `[approx]`/`[orphan]` markers present where expected

expected: Calm-booklike visual consistency with existing settings/dialog tokens; no layout disturbance; export button does not crowd the article header at 360px
result: [pending]

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
