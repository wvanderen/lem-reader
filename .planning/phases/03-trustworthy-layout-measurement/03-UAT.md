---
status: complete
phase: 03-trustworthy-layout-measurement
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-08-05T14:39:55Z
updated: 2026-08-05T14:44:25Z
---

## Current Test

[testing complete]

## Tests

### 1. App boots and renders an article (cold start)
expected: Run the app from a clean state (`npm run dev` then open the local URL, or load the production build). Pick any fixture article (e.g. an essay). The article body renders with headings, paragraphs, and any figures/quotes/lists intact. No console errors about useMeasurement, SettingsProvider, ResizeObserver, or document.fonts. ArticleView mounts the new measurement pipeline without crashing — the page is stable and readable within a normal load time. (This is the baseline that ArticleView now wires in `useMeasurement(article, articleRef)` per Plan 01 Task 3; if the hook throws, the article won't render.)
result: pass

### 2. Article body stays visible during a resize-triggered re-measure (PAGE-06)
expected: Load a fixture article. Slowly drag the browser window edge to resize it (forcing the ResizeObserver-driven TriggerCoalescer to fire and the MeasurementEngine to re-run). Watch the article body the entire time: the h1 and first paragraph (and ideally the whole visible region) STAY PAINTED continuously. There is no blank frame, no empty `<article>` flash, no moment where the content disappears while measurement runs. The engine retains the last trusted view (PAGE-06) and only swaps in the new one when it commits.
result: pass

### 3. Article settles to final layout after rapid viewport changes — no stale intermediate (PAGE-07)
expected: Load a fixture article with substantial paragraph text (so wrapping is visible). Rapidly resize the window back and forth several times in quick succession (well inside the 400 ms debounce window — e.g. 3-4 drags within ~1 second), then stop at a final size. The article's final wrapping matches the final viewport exactly. At no point does it momentarily paint an intermediate stale wrapping that then jumps to the correct one — the epoch commit guard drops stale results (PAGE-07), so only the newest measurement wins.
result: pass

### 4. Article settles to final layout after rapid typography changes — no stale intermediate (PAGE-07)
expected: Load a fixture article. Open the settings panel and rapidly change typography (font size and/or spacing preset) several times in quick succession, then stop. The article's final typography (font, size, line-height, wrapping) matches your last selection exactly. No stale intermediate typography lingers or flashes before the correct one commits — the settings-change bridge + epoch guard means only the newest typography's measurement takes effect.
result: pass

### 5. Late-loading web font does not cause a jarring relayout (D3-06 / PAGE-06)
expected: Load a fixture article with a real web font, and force the font to arrive late (DevTools network throttling, or inject a delayed `@font-face`). Across the moment the font swaps in, the article body stays painted continuously (no blank frame), the previously-rendered fallback-font text remains visible until the post-swap re-measure commits, and typography reflows calmly. The engine's font gate (`awaitFontsReady`) waits for the swap to settle before committing, so you should never see a layout commit on the fallback font that then gets visibly overwritten.
result: pass

### 6. Measurement is invisible — no UI flicker or status banner during re-measure (D3-04)
expected: Load a fixture article and trigger several re-measures (resize the window, change typography). Watch the whole reading surface, not just the article body: NO status banner or loading message appears, NO spinner or progress indicator shows, NO chrome element flickers or shifts. The `role="status"` live region stays empty/unchanged. Only the article body's wrapping/typography changes; measurement writes nothing reader-visible (D3-04 — invisible by default). The status region is reserved for consequential fallback, which Phase 3 does not trigger.
result: pass

### 7. Heading layout unaffected by Pretext fast path (PAGE-08)
expected: Load a fixture article that contains headings (h1, h2/h3 — e.g. an essay or technical article). Resize the window and change typography. Headings render and reflow correctly: no truncated text, no wrong wrapping, no missing or duplicated heading, no height glitch. The Pretext fast path (calibrated for eligible heading kinds per PAGE-08) should be VISUALLY INDISTINGUISHABLE from DOM-only measurement — if you didn't know Pretext was involved, you couldn't tell. (Calibration found headings eligible in chromium/firefox and partial in webkit; the runtime drift guard will silently downgrade if drift appears, which is also invisible when working correctly.)
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
