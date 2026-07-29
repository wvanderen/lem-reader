---
status: complete
phase: 01-canonical-article-foundation
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md
started: 2026-07-29T02:10:51Z
updated: 2026-07-29T02:29:30Z
---

## Current Test

[testing complete]

## Tests

### Section 1 — User-Flow Walk-through (runs first; halt on first failure)

### 1. Cold Start & Open App
expected: Kill any running dev server. Run `npm run dev` and open the printed localhost URL. The app boots with no errors in the browser console. You land on the "Saved articles" list showing 6 article rows (essay, technical post, figure-heavy, footnote-academic, list-reference, unsupported-case).
result: pass

### 2. Browse Saved Articles List
expected: The page is headed "Saved articles". Each of the 6 rows shows the article title, author/source metadata, and an "Open article" link. Rows are keyboard-focusable with a visible focus outline.
result: pass
note: "functional pass; user flagged a separate cosmetic defect — see Gaps"

### 3. Open the Essay Article
expected: Click "Open article" on the essay-long-form row. The view swaps to the article. The article title is the single `<h1>` at the top. Author and publish date metadata appear beneath it. A source link reads "Originally published at aeon.co" and announces (visually-hidden) that it opens in a new tab.
result: pass

### 4. Read Article Body in Canonical Order
expected: The essay body reads top-to-bottom in a logical order: subheadings, prose paragraphs, a blockquote, and inline links. Links are underlined and open in the same tab. The text sits in a warm cream column at a comfortable booklike reading width.
result: pass

### 5. Open the Original Source (Provenance)
expected: Click the "Originally published at aeon.co" link. A new browser tab opens to the real Aeon essay, confirming the article's provenance is faithful to a real source.
result: pass

### 6. See Unsupported Content Disclosed Inline
expected: Open the unsupported-case article. Where the original article had content Lem Reader cannot render (e.g., a data table), a collapsed disclosure appears in that position reading "Some content from the original article isn't supported yet." — not dumped at the top of the article.
result: pass

### 7. Open a Different Article (Figures / Footnotes)
expected: Open the figure-heavy (or footnote-academic) article. Figures render with captions; footnote reference markers link to a footnotes region at the end and link back. The different block kinds all render as native HTML in canonical reading order.
result: pass

### Section 2 — Technical Checks (only run after Section 1 passes)

### 8. Keyboard-only Navigation & Visible Focus
expected: Using only Tab / Shift+Tab / Enter: a "Skip to article" link appears first; every fixture row and the source link are reachable; Enter opens an article; focus moves to the `<h1>`; a 2px focus ring is visible on every focusable element throughout.
result: pass

### 9. Invalid Article Route (Error State)
expected: Navigate to a non-existent article hash such as `#/article/does-not-exist`. The error copy "Couldn't open this article." appears with guidance to select again from the list. No stack trace or jargon is shown.
result: issue
reported: "Just says 'Couldn't open this article.' without spacing styling"
severity: minor

### 10. Footnote Round-trip
expected: In an article with footnotes, click a footnote reference marker. It jumps to the matching footnote body in the footnotes region, and the footnote body links back to its reference.
result: issue
reported: "fail - goes to home 'http://localhost:5173/#fn-1'"
severity: major

### 11. Reduced-motion & Forced-colors Resilience
expected: With OS "reduce motion" enabled, no transitions/animations play. With forced-colors / high-contrast mode enabled, links stay underlined, the focus outline stays visible, and the unsupported-content disclosure marker stays operable — meaning is not carried by color alone.
result: pass

### Section 3 — Coverage Check (goal-backward, runs last)

### 12. Coverage — User Story Outcome Met
expected: The phase's user-story outcome is observably true: every saved article in the curated corpus opens with faithful semantic structure (all 9 block kinds as native HTML), real provenance (source URL + author + date), and a stable identity (re-opening the same article shows the same content revision). The reading experience is calm, normalized, and in canonical order.
result: pass

## Summary

total: 12
passed: 10
issues: 2
pending: 0
skipped: 0

<!-- Note: 3 gaps recorded (test 2 cosmetic observation on a passing test, plus
     tests 9 and 10 which have result: issue). Diagnosis processes all 3 gaps. -->

## Gaps

[none yet]

- truth: "Fixture-list view content (including the 'Saved articles' heading) has comfortable left/right inset from the viewport edge on small screens (UI-SPEC Layout: padding-inline: md at <640px)."
  status: failed
  reason: "User reported: visual issue with 'Saved Articles' header positioning (no space from left side of screen)"
  severity: cosmetic
  test: 2
  artifacts: []
  missing: []

- truth: "Invalid-article error state renders the full UI-SPEC Copywriting Contract — the 'Couldn't open this article.' heading plus the guidance body 'The article could not be loaded. Select it again from the list, or try a different article.' — with proper spacing/styling in the status region."
  status: failed
  reason: "User reported: Just says 'Couldn't open this article.' without spacing styling"
  severity: minor
  test: 9
  artifacts: []
  missing: []

- truth: "Clicking a footnote reference marker jumps to the matching footnote body in the footnotes region (and the footnote body links back to its reference) — in-page anchor navigation that does NOT exit the article or change the route."
  status: failed
  reason: "User reported: fail - goes to home 'http://localhost:5173/#fn-1' (the in-page anchor href='#fn-1' collides with the hash-based router, which treats it as a route and falls back to the fixture list)"
  severity: major
  test: 10
  artifacts: []
  missing: []
