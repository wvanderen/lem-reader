# Debug Session — Footnote anchor collides with hash router

**Gap (UAT test 10):** Clicking a footnote reference marker should jump to the matching footnote body in the footnotes region (and the body links back) — in-page anchor navigation that does NOT exit the article or change the route.
**Severity:** major
**Reported:** "fail - goes to home 'http://localhost:5173/#fn-1'"

## Symptoms
- Clicking an in-text footnote reference marker navigates the browser to `http://localhost:5173/#fn-1`.
- The hash router interprets `#fn-1` as a route, finds no match, and renders the fixture list (home). The reader is dumped out of the article.
- No in-page scroll to the footnote body occurs.

## Investigation
**Router** (`src/App.tsx` lines 13–24):
```tsx
function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)$/.exec(window.location.hash);
  return m ? { name: "article", id: m[1] as string } : { name: "list" };
}
// ...
window.addEventListener("hashchange", onHash);  // any hashchange → re-parse → setView
```
The router subscribes to **every** `hashchange`. `parseHash` matches only `#/article/<id>`; any other hash falls through to `{ name: "list" }`.

**Footnote reference** (`src/content/render/BlockRenderer.tsx` lines 87–99):
```tsx
case "footnote-reference": {
  const n = block.footnoteId.replace(/^fn-/, "");
  return (
    <sup>
      <a id={`fn-ref-${n}`} href={`#fn-${n}`}>
        {block.marker}
      </a>
    </sup>
  );
}
```
The reference is a native in-page anchor `<a href="#fn-N">`. Clicking it sets `window.location.hash = "#fn-N"`.

**Collision:** clicking the anchor → `hashchange` fires → `parseHash("#fn-1")` returns `{ name: "list" }` → React unmounts `ArticleView` (destroying the `fn-1` element) and renders `FixtureList`. The browser's native in-page scroll target no longer exists, so the reader lands on the fixture list. The `#/...` route namespace and the `#fn-...`/`#fn-ref-...` fragment namespace are indistinguishable to the router.

**Back-link also missing:** the footnotes region (lines 121–131) renders each `<li id={fn.id}>` with only its content via `<InlineList>` — there is **no** `<a href="#fn-ref-N">` return link. So the "and links back" half of the round-trip was never implemented; only the forward reference exists (and it is the half that is broken by the router collision).

## Root Cause
The hash router treats every `hashchange` as a route change and does not distinguish app routes (`#/article/<id>`) from in-page fragment anchors (`#fn-N`, `#fn-ref-N`). Footnote references are native `<a href="#fn-N">` anchors; activating one changes the hash, the router falls through to the list view, and the article (with its footnote target) is unmounted. (Separately, the footnote-body → reference back-link is not implemented in the renderer at all.)

## Files Involved
- `src/App.tsx`: `parseHash` + `hashchange` listener — no guard ignoring non-`#/` fragments.
- `src/content/render/BlockRenderer.tsx`: footnote-reference block emits `<a href="#fn-N">` (lines 87–99); footnotes region omits the back-link (lines 121–131).

## Suggested Fix Direction (for plan-phase --gaps)
Two complementary fixes:
1. **Router:** make `parseHash` / the `hashchange` handler ignore fragment-only hashes that are not app routes — e.g. only treat hashes starting with `#/` as routes; for bare `#<id>` fragments, let the browser perform native in-page scrolling and do NOT call `setView` (guard: `if (!hash.startsWith('#/')) return;`). This re-enables native anchor scrolling without a route swap.
2. **Back-link:** in the footnotes region, add a return `<a href="#fn-ref-N">` inside each footnote `<li>` so the body links back to its reference (and it will also rely on the router fix to avoid the same collision).

Verify the round-trip works in Chromium/Firefox/WebKit and that the existing `open-every-fixture.spec.ts` / `a11y.spec.ts` e2e still pass (note: the e2e suite may not have exercised footnote clicks, which is why this slipped through).
