# Debug Session — Error state missing guidance copy + styling

**Gap (UAT test 9):** Invalid-article error state should render the full UI-SPEC Copywriting Contract — the "Couldn't open this article." heading **plus** the guidance body "The article could not be loaded. Select it again from the list, or try a different article." — with proper spacing/styling in the status region.
**Severity:** minor
**Reported:** "Just says 'Couldn't open this article.' without spacing styling"

## Symptoms
- Navigating to a non-existent hash (`#/article/does-not-exist`) shows only the heading string.
- The guidance body sentence is absent.
- The status region has no visible styling/spacing (renders as flush bare text).

## Investigation
`src/routes/ArticleView.tsx` error branch (lines 50–58):
```tsx
if (status !== "ready" || !article) {
  return (
    <main id="main">
      <div role="status" aria-live="polite" aria-atomic="true">
        {status === "loading" ? "Opening article…" : "Couldn't open this article."}
      </div>
    </main>
  );
}
```
- The error branch emits a **single bare text string** ("Couldn't open this article.") as a text node inside the status `<div>`. The UI-SPEC §Copywriting Contract specifies **two lines** for "Error state — open failed":
  - Heading: **Couldn't open this article.**
  - Body: "The article could not be loaded. Select it again from the list, or try a different article."
  The body sentence was never implemented.
- The status `<div>` has **no CSS class** and `src/app.css` contains **no `.status` rule** (grep confirms: only `.skip-link`, `.visually-hidden`, `.meta`, `.article-body`, `.disclosure`, `.fixture-list` rules exist). So the region is entirely unstyled.
- The wrapping `<main id="main">` also has no `padding-inline` (same asymmetry as the fixture-list header gap), so the text renders flush against the viewport edge.

The same single-string pattern exists in `FixtureList.tsx` (line 38: `{status === "error" && "Couldn't open this article."}`), which would exhibit the same defect if the list failed to load. Note UI-SPEC §Copywriting also defines a distinct "Error state — schema invalid" copy; the component does not distinguish open-failed vs schema-invalid (the repository returns `null` for missing ids → maps to the single open-failed string).

## Root Cause
Two compounding causes:
1. **Missing copy:** the error branch renders only the heading string; the required guidance body sentence from the UI-SPEC Copywriting Contract was never added to the component.
2. **Missing styling:** the status region has no CSS class and `app.css` defines no `.status` presentation rules, so it renders as unstyled bare text (and the wrapping `<main>` has no horizontal inset).

## Files Involved
- `src/routes/ArticleView.tsx`: error/loading branch (lines 50–58) renders one string, omits the guidance body, status div has no class.
- `src/routes/FixtureList.tsx`: status region (lines 36–39) has the same single-string pattern.
- `src/app.css`: no `.status` styling rule exists.

## Suggested Fix Direction (for plan-phase --gaps)
In the error branch, render the two-line contract: a heading element (e.g. `<p>`/`<h1>` with the "Couldn't open this article." copy) plus a `<p>` with the guidance body sentence. Give the status region a `.status` class and add a `.status` rule to `app.css` (surface-raised background, hairline, padding using the spacing scale, inset matching the reading layout). Mirror the same treatment in `FixtureList.tsx`. Optionally wire the distinct "schema invalid" copy if a malformed-article path is distinguishable.
