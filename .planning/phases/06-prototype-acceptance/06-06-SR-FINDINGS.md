# Plan 06-06 — ACPT-02 Manual Screen-Reader Findings (VoiceOver+Safari)

**Run date:** 2026-08-09
**Pairing run:** VoiceOver + Safari (macOS). NVDA+Firefox (Windows): not yet reported.
**Tester:** user (eggfam)
**Protocol:** `docs/ACCEPTANCE-PROTOCOL.md` v1.0
**Verdict:** ❌ **NOT A PASS** — ≥3 major findings (D6-07 zero-blocker/zero-major policy not met).

## Raw findings (as reported by tester)

> Issues:
> 1. H doesn't work for highlighting text
> 2. VO selection passes text entry for notes so that field cannot be accessed
> 3. Highlighted notes can split across multiple VO selections. This leads to a pattern where the voice says "highlighted" several times within the highlighted selection itself
> 4. The visible Voiceover selection block on scroll mode sometimes does not keep up with where it really is on the document. Scrolling down with screen-reader on article in general seems a little clunky since the selection sometimes goes off screen and only advances a bit at a time

## Classification (D6-07 rubric)

| # | Finding | Root cause (code) | Severity | Rationale |
|---|---------|-------------------|----------|-----------|
| 1 | H doesn't highlight under VO | `src/routes/ArticleView.tsx:425-429` — H/N bail silently when `window.getSelection()` is collapsed. VO's text-selection model (VO+Enter / arrows) frequently does NOT surface to the browser Selection API, so the documented keyboard-highlight path (UI-SPEC §33) is non-functional under VO. | **MAJOR** | The documented keyboard highlight shortcut is broken under VO; the mouse-driven selection-toolbar path also depends on a browser Selection range that VO users cannot easily produce. Highlighting is a required function (ANNO-01). |
| 2 | Note textarea unreachable via VO browse | `src/reader/annotations/NotePopover.tsx:168-176` — `popover="manual"` on a `<div role="dialog">` does NOT establish the SR focus scope that `<dialog showModal>` / `showModal()` does. `textarea.focus()` (L100) runs but VoiceOver's browse cursor does not enter the popover. The UI-SPEC rationale at `NotePopover.tsx:5-8` explicitly rejected `<dialog>` as "too heavy" — that tradeoff produced this SR-scope defect. | **MAJOR→BLOCKER** | A required function (notes — ANNO-02/03) is unreachable via VO browse. Reachable via Tab only with significant difficulty (must know to leave VO browse mode). |
| 3 | Multi-unit highlight announces "highlighted" repeatedly | `<mark class="highlight">` spanning multiple VO browse units triggers redundant "highlighted" announcements. Cosmetic/noise — the highlight IS announced and reachable. | **MINOR** | Per D6-07 boundary rule: confusing-but-completable announcement = minor unless step fails or content/function is lost. Carry to deferred-items list. |
| 4 | VO cursor lags document position in scroll mode; scrolling clunky | Scroll-mode reading ergonomics under VO: visible VO focus block lags actual document position, selection goes off-screen, advances slowly. Content is readable (no loss, no blocked function) but orientation is intermittently harmed. | **MAJOR** | "Orientation/function lost intermittently, OR materially harms usability." Possibly a cluster of minors + one major; treat as major pending investigation. |

## Verdict

ACPT-02 **does not pass**. Findings #1, #2, #4 are major (or worse). D6-07 requires **zero blocker AND zero major** for a pass.

The most consequential defect is **#2** (the NotePopover focus-scope gap): it is traceable to an explicit UI-SPEC tradeoff and blocks a core annotation function under VoiceOver. **#1** is the same family of "selection/focus substrate doesn't interop with VO." **#3** is deferrable. **#4** is scroll-mode ergonomics needing investigation.

## Decision (recorded 2026-08-09)

User chose: **Fix the SR defects, then re-test.** Routing to `/gsd-debug` for the fix cycle. 06-06 is **paused** (not complete). ACPT-02 remains **Pending**. After fixes, the SR protocol is re-run; on zero-blocker/major, 06-06 Task 2 (full-suite gate + `06-VERIFICATION.md`) resumes.

## Fix scope (for the debug cycle)

- **#2 (primary):** Establish an SR-honored focus scope for the note editor. Options to investigate: (a) promote `NotePopover` container to `<dialog>` + `showModal()` (gains native focus trap + SR dialog semantics; re-validate the "typing doesn't light-dismiss" + "article stays visible" UX that motivated `popover="manual"`); (b) keep `popover="manual"` but add `aria-modal="true"` + a programmatic focus trap + explicit focus management; (c) hybrid. Must verify VO now announces "Highlight note, dialog" and enters the textarea. Re-check the reduced-motion + no-backdrop constraints still hold.
- **#1:** Make the highlight path VO-interop-safe. Investigate: detect when VO browse produces no Selection range and surface an SR-compatible path (e.g., focus-aware "highlight current passage" affordance, or accept the selection-toolbar as the primary SR path and make it VO-reachable). Confirm whether the selection-toolbar is itself VO-reachable.
- **#4:** Investigate scroll-mode VO reading sync. May be a longer-term UX item; classify after repro.
- **#3:** Defer (minor) — record in deferred-items list in `06-VERIFICATION.md`.

## NVDA coverage

NVDA+Firefox (Windows) status: **not yet reported.** Reduced-gate (A4) is available if NVDA is unavailable, but the VO findings alone block acceptance regardless. NVDA run should happen during the re-test after fixes.

## Artifacts touched by this checkpoint

- This file (`06-06-SR-FINDINGS.md`) — durable record.
- `.planning/STATE.md` — 06-06 marked blocked; phase status updated.
- No source changes yet (fixes land in the debug cycle).
