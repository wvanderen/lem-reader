# Debug Session — Fixture-list header has no left inset

**Gap (UAT test 2):** Fixture-list view content (including the "Saved articles" heading) should have a comfortable left/right inset from the viewport edge on small screens (UI-SPEC §Layout: `padding-inline: md` at <640px).
**Severity:** cosmetic
**Reported:** "visual issue with 'Saved Articles' header positioning (no space from left side of screen)"

## Symptoms
- The `<h1>Saved articles</h1>` sits flush against the left edge of the viewport.
- At narrow viewport widths the fixture-list rows also run edge-to-edge.

## Investigation
Compared the two views' CSS treatment:

- **ArticleView** wraps content in `<article class="article-body">`. In `src/app.css` the `.article-body` rule supplies horizontal inset:
  ```css
  .article-body {
    max-width: 64ch;
    margin-inline: auto;
    padding-inline: var(--space-md);   /* ← provides the inset */
    padding-block: var(--space-3xl);
  }
  ```
- **FixtureList** (`src/routes/FixtureList.tsx`) renders `<main id="main">` containing `<h1>Saved articles</h1>` + `<ul class="fixture-list">`. There is **no** `padding-inline` on `<main>`, no wrapper class, and no rule targeting the fixture-list `<h1>`.
- The `.fixture-list` ul only centers via `margin: var(--space-xl) auto; max-width: 1100px; padding: 0;`. At widths below 1100px the auto-margins collapse to 0 and `padding: 0` leaves the list flush with the edge; the `<h1>` is flush at **all** widths because nothing insets `<main>`.

## Root Cause
`FixtureList`'s `<main id="main">` has no horizontal padding. The `.article-body` rule provides `padding-inline: var(--space-md)` for `ArticleView`, but no equivalent rule exists for the fixture-list view, so the heading (and the list at narrow widths) render flush against the viewport edge. This is an asymmetry between the two views, not a token-scale error.

## Files Involved
- `src/app.css`: no rule insets the fixture-list `<main>`/`<h1>` (the `.fixture-list` rule sets `padding: 0`).
- `src/routes/FixtureList.tsx`: `<main id="main">` has no class hook that would receive inset styling.

## Suggested Fix Direction (for plan-phase --gaps)
Add a horizontal inset to the fixture-list view matching the article view's treatment — e.g. a shared layout rule (`main#main { padding-inline: var(--space-md); }`) or a `.fixture-list` wrapper with `padding-inline: var(--space-md)`. Ensure the responsive column behavior still works (the ul's `max-width` + auto-margin should remain). Verify at <640px that the heading and cards have the md (16px) inset per UI-SPEC §Layout.
