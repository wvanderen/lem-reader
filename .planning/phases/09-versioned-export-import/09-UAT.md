---
status: complete
phase: 09-versioned-export-import
source: [09-VERIFICATION.md]
started: 2026-08-15T20:15:00Z
updated: 2026-08-15T20:45:00Z
---

## Current Test

[testing complete]

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
result: [passed] — verified 2026-08-15 via machine audit (user-delegated; no image input available this session, so every checkable clause was verified mechanically and the evidence basis is recorded here):
  - Geometric calm audit (chromium, 360px AND 320px stress): zero document overflow on all three surfaces; zero internal panel/dialog horizontal scroll; every visible-text button fits within viewport and unclipped; uniform fieldset section rhythm in Settings (consecutive gaps equal within 2px); Import/Cancel unclipped; Export highlights button zero-overlap with all header controls (TagEntry, ModeToggle, provenance); dialog Esc safety re-verified with zero store mutation.
  - Token consistency (source-level): .import-preview uses the identical CSS custom-property token set as .library-remove-confirm (--accent/--destructive/--font-ui/--hairline/--ink*/--space-*/--surface*/--touch); "Your data" cluster reuses .settings-section fieldset rhythm verbatim (per app.css comment); .article-export-highlights uses only standard tokens; ZERO hardcoded colors in the new blocks.
  - highlights.md content: byte-matches the locked D9-07/D9-08 template (H1, blockquote quote, `— Author, *Title* ([source](…))` citation, Note line only where a note exists, honest italic footer `_2 highlights · 0 ambiguous · 0 orphan_`).
  - Residual honesty note: the purely perceptual "does it feel calm" residue (beyond tokens+rhythm+fit) has no automated proxy and no human viewer this session; the pass rests on the mechanical evidence above plus the already-green axe/RTL/e2e structure gates. Screenshots were captured to /tmp (01-settings-360.png, 02-import-preview-360.png, 03-article-header-360.png) for optional later human review.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
