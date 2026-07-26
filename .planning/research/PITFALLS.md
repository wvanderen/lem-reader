# Pitfalls Research

**Domain:** Accessible, booklike web-article reader with responsive pagination and local annotations
**Researched:** 2026-07-26
**Confidence:** MEDIUM-HIGH — platform and accessibility claims use current primary specifications/guidance; browser/AT behavior still requires empirical validation on the chosen support matrix.

## Critical Pitfalls

### Pitfall 1: Measuring With a Font That Is Not the Font Being Rendered

**What goes wrong:** Page boundaries shift after first paint, reopening an article lands on a different passage, or the last line clips because measurement used fallback metrics, an incomplete font shorthand, or canvas metrics that disagree with DOM line layout.

**Why it happens:** Font loading is asynchronous. Family, weight, style, variation axes, kerning, letter/word spacing, line height, language, and device rounding all affect layout. Canvas text width is useful but does not reproduce block fragmentation or non-text geometry. CSS Fonts also notes that fallback and target fonts can have different metrics and that normal font metrics can vary across user agents/platforms.

**How to avoid:** Define a versioned `LayoutKey` containing viewport/reader dimensions, device scale assumptions, all typography controls, resolved font identity/status, content version, and algorithm version. Treat `document.fonts.ready` as a required settling signal, not proof that every measurement is correct. Render a hidden calibration sample and compare measured versus actual DOM line/block geometry. Invalidate pagination on relevant font events and typography changes. Keep the reading location as a content anchor during repagination. Use font metric overrides only after testing; never use them to conceal a mismatch.

**Warning signs:** Different page counts on cold versus warm cache; layout changes a moment after opening; bold/italic passages overflow while body text fits; page count differs by browser; a font toggle preserves stale boundaries; tests assert only page count rather than no loss/duplication.

**Phase to address:** **Layout foundation**, before page navigation or annotations. Establish font-settling, layout-key invalidation, calibration, and a scroll fallback first.

---

### Pitfall 2: Treating CSS Columns as a Complete Pagination Engine

**What goes wrong:** Headings become stranded, figures/code blocks disappear or overflow, footnote links land off-screen, columns fill differently across engines, and a visually clipped region is mistaken for a finite set of reliable pages.

**Why it happens:** CSS Fragmentation defines opportunities and constraints, not a single author-controlled breaking algorithm. User agents retain discretion for unforced breaks. Replaced, atomic, and overflow containers may be monolithic; oversized content can overflow or be sliced. `break-inside: avoid`, widows, and orphans are preferences that can be relaxed to guarantee progress.

**How to avoid:** Build an explicit fragmentation policy over a semantic document model. Classify nodes as splittable, keep-with-next, or atomic; measure images, captions, code, lists, quotes, and footnotes separately; guarantee forward progress for content taller than a page; record deterministic content-boundary tokens rather than pixel offsets. Validate no loss, duplication, or reordering. When invariants fail, switch that article/session to scroll mode and explain the fallback without blocking reading.

**Warning signs:** The implementation equates `scrollWidth / clientWidth` with correctness; `overflow: hidden` masks defects; pages contain blank gaps followed by overflow; a single tall image creates an empty/infinite page; only plain paragraphs are fixtures; engine-specific CSS patches accumulate.

**Phase to address:** **Pagination engine**, immediately after the normalized semantic model and before visual polish.

---

### Pitfall 3: Anchoring Position and Annotations to Pages or Live DOM Ranges

**What goes wrong:** Highlights drift, split, or vanish when switching modes, changing font size, resizing, rerendering, or reopening. Restored location points to “page 12,” although page 12 now contains different content.

**Why it happens:** Pages and DOM text-node boundaries are presentation artifacts. The Selection API uses live ranges whose boundaries respond to DOM mutation. A text-position selector alone is also brittle when normalized content changes. UTF-16 offsets, Unicode code points, and grapheme clusters are easily conflated.

**How to avoid:** Specify one canonical normalized-text stream and version its normalization rules. Convert a selection immediately into redundant selectors: canonical start/end offsets plus exact quote and prefix/suffix context, scoped by article/content version and preferably semantic block identity. Define offset units explicitly (Unicode code points if following the Web Annotation model), prohibit endpoints inside grapheme clusters, and map selectors back to render nodes on demand. Reattach by exact position+quote first, then constrained quote/context search; surface ambiguous/orphaned annotations rather than silently moving them. Restore location to a content anchor and then derive the current page.

**Warning signs:** Persistence stores page number, CSS selector/XPath, or `{node, offset}`; adding highlight `<mark>` elements changes later offsets; emoji or combining marks break selection; mode switch loses the selected passage; edits normalize whitespace differently; anchoring has no ambiguity/orphan state.

**Phase to address:** **Document model and anchor contract** before annotation UI; add durable local persistence only after round-trip anchor tests pass.

---

### Pitfall 4: Making the Visual Page the Accessibility Tree

**What goes wrong:** Screen readers encounter duplicated/off-screen pages, keyboard focus jumps in a different order than the text, links on hidden pages remain tabbable, focus disappears after a page turn, or every page change is noisily announced. A reader optimized for orientation instead creates disorientation.

**Why it happens:** Implementers duplicate content for measurement or adjacent-page transitions, reorder it with CSS, hide it visually without removing it from interaction, or replace semantic elements with generic wrappers/ARIA. Visual page boundaries are mistaken for document structure.

**How to avoid:** Preserve one logical semantic reading order with native headings, paragraphs, lists, links, figures/captions, quotes, code, and footnote relationships. Keep measurement clones inert and excluded from accessibility and focus. Ensure only the active presentation is exposed and operable. Define a focus contract for page turn, mode switch, settings close, footnote activation/return, and restored location; never reset focus to the document root gratuitously. Keep visible focus unobscured. Use restrained status announcements only when they add orientation. Test with keyboard and target screen-reader/browser pairs.

**Warning signs:** Positive `tabindex`; `aria-hidden` ancestors containing focus; duplicate link names in the accessibility tree; tab reaches invisible pages; headings are styled `div`s; DOM order differs from reading order; page turns recreate the whole subtree and drop focus.

**Phase to address:** **Semantic renderer and navigation**, before styling completion; repeat as an acceptance gate for every interaction phase.

---

### Pitfall 5: Pagination That Breaks Reflow, Zoom, Text Spacing, or Motion Preferences

**What goes wrong:** At 200% zoom or narrow widths, users must pan in two dimensions, controls cover text, content clips, page count churns, or forced animation causes distraction/nausea. Custom typography settings work only within a “safe” range chosen by the app.

**Why it happens:** Fixed page dimensions and clipped overflow encode print assumptions. Teams test browser resize but not zoom, user styles, minimum viewports, enlarged spacing, system colors, or reduced motion. Animation is treated as identity rather than optional decoration.

**How to avoid:** Make scroll mode a first-class persistent choice and an automatic safe fallback. Test the WCAG reflow condition at a 320 CSS-pixel-equivalent width, 200% text resize/zoom scenarios, and WCAG text-spacing overrides without content loss. Let page chrome collapse before prose becomes unusable. Recompute from a content anchor after settings changes. Disable nonessential page motion under `prefers-reduced-motion` and provide instantaneous navigation. Do not cap user settings merely to preserve page aesthetics.

**Warning signs:** Fixed pixel height plus clipping; horizontal scrolling for prose; focus sits behind sticky controls; text-spacing bookmarklet causes overlap; page-turn animation cannot be disabled; scroll mode is less semantic or loses annotations.

**Phase to address:** **Responsive/accessibility hardening**, with constraints designed into layout foundation rather than retrofitted.

---

### Pitfall 6: Repaginating Through Layout Thrash and Observer Loops

**What goes wrong:** Font/settings changes freeze the UI, dragging the window causes constant repagination, long articles produce seconds of jank, or `ResizeObserver loop completed with undelivered notifications` appears.

**Why it happens:** Code alternates geometry reads and DOM writes per block, observes a container whose own callback changes its size, recomputes on every event, or renders the entire document plus measurement clones. Layout cost grows with DOM size and forced synchronous layout multiplies it.

**How to avoid:** Separate pipeline stages: normalize → intrinsic measurement → break computation → render. Coalesce resize/font/settings invalidations; cancel obsolete jobs; batch all reads before writes; use generation IDs so stale computations cannot commit. Cache text measurements by complete layout key, but never cache DOM/non-text geometry without invalidation. Chunk long work and preserve an immediately usable scrolling presentation while pagination settles. Instrument cold/warm pagination duration, long tasks, forced layout, DOM node count, and cumulative repagination count.

**Warning signs:** Geometry getters inside mutation loops; observer callback writes observed dimensions; one keystroke triggers multiple full runs; performance is tested only on a short article; stale results flash after rapid setting changes; no cancellation or instrumentation.

**Phase to address:** **Performance and stability**, after correctness instrumentation exists but before annotation polish and broad content expansion.

---

### Pitfall 7: Testing Screenshots Instead of Invariants and Real Interaction

**What goes wrong:** Golden screenshots pass while text is duplicated, inaccessible, unreachable by keyboard, anchored incorrectly, or broken in another browser/font state. Automated accessibility scans report green despite confusing focus or reading order.

**Why it happens:** Pagination outputs look plausible and screenshot tests are easy. Layout behavior is stateful and combinatorial; automated accessibility tools cannot judge all accessibility aspects, and jsdom-like environments do not implement real browser layout.

**How to avoid:** Use layered tests. Pure tests verify normalization, offset units, breakpoint progress, and anchor round trips. Browser tests verify concatenated page text equals canonical text exactly, every boundary advances, no prohibited overflow, position restoration, and selection across inline elements. Matrix tests cover cold/warm fonts, representative content, widths/heights, zoom, typography/spacing, modes, themes, and target engines. Manual scripts cover keyboard, screen reader, visible/unobscured focus, high zoom, reduced motion, and touch selection. Keep fixtures for tall images, long unbreakable tokens, nested lists, bidi/combining text, code, links, captions, and footnotes.

**Warning signs:** Assertions only count pages or compare pixels; tests mock every measurement; no cross-engine run; axe is treated as proof; no test concatenates rendered text; no manual AT checklist; fixtures are all Latin prose.

**Phase to address:** **Test harness in the foundation phase**, expanded in every phase; require a cross-browser/AT release gate during hardening.

---

### Pitfall 8: Expanding Into “Read the Whole Web” Before the Reading Engine Is Proven

**What goes wrong:** The roadmap gets consumed by extraction, sanitization, extensions, authenticated pages, sync/conflicts, tables, embeds, and format edge cases while the core hypothesis—stable, calm reading—remains unvalidated.

**Why it happens:** Loading arbitrary URLs demos well and annotations suggest accounts/sync. Each adjacent feature multiplies document variants, security surface, persistence migrations, and layout cases.

**How to avoid:** Enforce the saved, normalized fixture boundary. Define a supported semantic schema and reject or downgrade unsupported nodes predictably. Ship local single-device anchors and notes, explicit scroll fallback, and a small representative corpus. Gate extraction, extension packaging, cloud sync, collaboration, tables, math, and embeds on measured engine reliability and evidence they are needed.

**Warning signs:** A phase contains parser + reader + extension + sync; arbitrary HTML enters the renderer; sanitization becomes a hidden prerequisite; unsupported embeds receive one-off patches; roadmap success is URL coverage rather than stable navigation.

**Phase to address:** **Scope contract / Phase 1**, then re-check at every roadmap gate.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store page index or pixel scroll offset | Fast restoration demo | Wrong passage after any layout change | Never as the canonical location; okay only as an ephemeral hint paired with a content anchor |
| Persist DOM Range/XPath | Quick highlight prototype | Breaks on rerender, wrapper insertion, normalization, mode switch | Only in-memory during the current selection gesture |
| Use canvas width as the sole paginator | Fast text estimates | Misses line-height, shaping/DOM differences, block and non-text fragmentation | As a candidate-break accelerator validated against real layout |
| Hide overflow to make pages look clean | Visually tidy demo | Silent content loss and WCAG failures | Never for article content |
| Duplicate full DOM for adjacent pages/measurement | Simple transitions | Duplicate accessibility nodes, memory/layout cost, ID collisions | Measurement copy only if inert, unfocusable, hidden from AT, and short-lived |
| Debounce everything by a large fixed delay | Reduces recomputation | Sluggish settings and resize feedback | Brief coalescing only, with cancellation and immediate scroll fallback |
| One browser + automated a11y scan | Cheap CI | Misses fragmentation, selection, focus, AT differences | Early smoke test only |
| Add extraction/sync before engine gates | More impressive product surface | Multiplies failure sources and delays hypothesis validation | Not in this milestone |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| CSS Font Loading API | Paginate once on mount or assume a font request means usable metrics | Await the relevant settled font state, calibrate actual DOM geometry, and invalidate by complete typography key |
| `ResizeObserver` | Mutate observed geometry synchronously and trigger a feedback loop | Observe the smallest stable container; coalesce, compare sizes, schedule commits, and ignore unchanged generations |
| Selection API | Persist live node/offset boundaries | Convert immediately to versioned canonical-text selectors; preserve selection direction only for UI behavior |
| IndexedDB/local storage | Save ad-hoc objects without schema/version/error handling | Version records and normalization algorithm; use stable article IDs, atomic updates, quota/error UX, export/delete path |
| History/deep links | Encode page number as location | Encode article + semantic/content anchor; resolve to page or scroll position at runtime |
| Footnotes | Move focus to a visual overlay with no return path | Preserve semantic references, predictable activation, and explicit return-focus behavior |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Read/write geometry loop | Long purple layout blocks, sluggish settings | Batch reads, compute off-DOM where valid, batch writes | Often visible on medium articles and low-power/mobile devices |
| Full repagination per resize event | Continuous churn, stale commits | Coalesce events, generation cancellation, stable breakpoint before commit | Window drag, orientation change, virtual keyboard |
| Cache missing part of the layout key | Fast but wrong page boundaries | Include content/font/typography/container/algorithm versions; verify cache hits | First user setting or font-state change |
| Whole-article DOM plus clones | Memory growth and expensive style/layout | Limit clones, reuse measurement surfaces, consider page-window rendering without breaking semantic access | Image-heavy or very long fixtures |
| Loading/decoding images after pagination | Late boundary shifts | Reserve intrinsic aspect ratio, await/observe required dimensions, repaginate anchored | Cold cache and responsive images |
| Synchronous persistence per selection movement | Sticky text selection | Save only completed annotations; batch durable writes | Touch drag or keyboard selection updates |

## Security and Privacy Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering saved article HTML directly | Script/event-handler execution, malicious URLs/styles, DOM clobbering | Parse into an allowlisted internal document model; render owned components/semantic elements; sanitize URLs and attributes |
| Treating “local-only” notes as non-sensitive | Other users/scripts on the origin may access reading history and notes; shared-device exposure | Minimize stored data, clearly disclose locality, provide delete/export, avoid logging annotation bodies, maintain CSP and dependency hygiene |
| Using raw quote text in telemetry/errors | Private highlighted passages leak | Record only aggregate success/failure metrics or redacted hashes; keep content local |
| Reusing source IDs in duplicated DOM | Broken label/reference associations and selector confusion | Generate renderer-owned unique IDs; avoid exposed duplicates in measurement trees |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Page count changes without preserving passage | Loss of spatial orientation | Anchor the visible passage, repaginate, then reveal the page containing that anchor |
| Swipe/click zones override text selection or links | Accidental turns and inaccessible annotations | Use explicit controls and conservative gestures; prioritize native selection/link activation |
| Page progress implies permanence | “Page 8 of 20” becomes misleading after settings | Pair transient page progress with stable section/proportion context |
| Forced pagination | Users who need reflow or continuous context are blocked | Always expose equivalent scroll mode and remember preference |
| Settings panel causes every slider tick to flash pages | Cognitive load and jank | Preview carefully or coalesce changes; maintain place; offer reset |
| Announcing every page mutation | Screen-reader verbosity and lost context | Announce only concise, useful orientation changes; keep reading flow semantic |
| Silent fallback to scroll | User thinks the reader is broken | Preserve location and briefly state why pagination is unavailable, with retry/settings route |

## “Looks Done But Isn’t” Checklist

- [ ] **Pagination:** Concatenated accessible text across pages exactly equals canonical article text—no omission, duplication, or reorder.
- [ ] **Font stability:** Cold cache, warm cache, failed font, weight/style variants, and post-load state produce valid layout or an anchored fallback.
- [ ] **Fragmentation:** Tall images, captions, long tokens, code, nested lists, blockquotes, links, footnotes, and headings all guarantee forward progress.
- [ ] **Annotations:** Selections crossing inline elements and grapheme-rich text survive reload, repagination, and mode/typography changes; ambiguous/orphan states are visible.
- [ ] **Location:** Restore by content anchor after viewport/font/setting changes, not merely in the original layout.
- [ ] **Semantics:** Measurement/transition copies are absent from the accessibility tree and tab order; IDs remain unique.
- [ ] **Keyboard/focus:** Page turn, mode switch, settings, note editing, and footnotes have predictable visible/unobscured focus and escape/return paths.
- [ ] **Adaptability:** 320 CSS-pixel-equivalent reflow, zoom/text resize, WCAG spacing overrides, and reduced motion lose no content or function.
- [ ] **Performance:** Representative worst-case fixtures meet explicit cold/warm pagination budgets with no resize loops or stale commits.
- [ ] **Testing:** Real layout runs in target engines; automated checks are supplemented by manual keyboard and screen-reader testing.
- [ ] **Fallback:** Any pagination invariant failure leaves a fully readable, annotated scrolling view at the same passage.
- [ ] **Scope:** Extraction, extensions, sync, arbitrary embeds/tables/math, and formal preference research remain outside this prototype.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Font/layout key was incomplete | MEDIUM | Disable suspect cache, add versioned key dimensions, recalibrate, rebuild boundaries while preserving content anchors |
| CSS-only fragmentation fails rich fixtures | HIGH | Retain scroll mode, introduce semantic break model and atomic-node policy, add invariant tests before re-enabling pagination |
| Page/DOM-based anchors shipped | HIGH | Migrate when quote text is available; reconstruct canonical positions, mark ambiguous records, version storage, never silently guess |
| Focus/accessibility tree is coupled to pages | HIGH | Consolidate semantic source/order, make clones inert, define focus transitions, retest target AT/browser matrix |
| Repagination janks | MEDIUM | Instrument, cancel stale work, batch reads/writes, reduce DOM/clones, chunk compute, keep scroll presentation live |
| Scope has expanded | MEDIUM | Freeze new adapters/services, return to curated schema and technical engine gates, move extras to later milestones |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Unstable font metrics | Phase 1: layout foundation | Cold/warm/failure font matrix; calibration and anchored repagination tests |
| Unreliable fragmentation | Phase 2: pagination engine | Canonical-text equality, progress, overflow, rich-fixture and cross-engine tests |
| Fragile selection anchors | Phase 1: document/anchor contract; Phase 4: annotations | Selector round trips over graphemes/inline nodes; reload/mode/typography tests |
| Broken semantics/focus | Phase 3: semantic renderer/navigation | Accessibility-tree inspection, keyboard script, screen-reader/browser runs |
| Failed reflow/zoom/spacing/motion | Phase 3 and Phase 5 hardening | 320px-equivalent, 200% resize/zoom, spacing override, reduced-motion checks |
| Layout thrashing/observer loops | Phase 2 instrumentation; Phase 5 performance | Performance traces, job-count assertions, cancellation and long-article budgets |
| Shallow testing | Phase 1 harness, continuous | Unit + real-browser invariant matrix + manual AT checklist required by CI/release |
| Over-scoping | Phase 1 scope contract, every gate | Roadmap requirements remain tied to saved normalized corpus and engine reliability |

## Sources

- [CSS Fragmentation Module Level 3 (W3C)](https://www.w3.org/TR/css-break-3/) — fragmentation opportunities, monolithic content, relaxation of break constraints, UA discretion. **Confidence: HIGH (primary specification).**
- [CSS Fonts Module Level 5 (W3C)](https://www.w3.org/TR/css-fonts-5/) — fallback metric differences, `size-adjust`, ascent/descent/line-gap overrides, platform variability. **Confidence: HIGH (primary specification; some Level 5 features require support checks).**
- [FontFaceSet `ready` (MDN, linked to CSS Font Loading spec)](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready) — resolves after required font loading and layout operations. **Confidence: HIGH for API semantics; verify target engines.**
- [Web Annotation Data Model (W3C Recommendation)](https://www.w3.org/TR/annotation-model/) — Text Quote and Text Position selectors, normalization, Unicode code points, position-selector brittleness. **Confidence: HIGH.**
- [Selection API (W3C Working Draft)](https://www.w3.org/TR/selection-api/) — live range association and mutation response. **Confidence: MEDIUM-HIGH; current primary draft, behavior needs cross-engine tests.**
- [WCAG 2.2: Understanding Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) and [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) — meaningful operability and visible focus. **Confidence: HIGH (W3C WAI guidance).**
- [WCAG: Understanding Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow) and [Text Spacing](https://www.w3.org/WAI/WCAG22/UNDERSTANDING/text-spacing.html) — narrow-width reflow and no loss under spacing overrides. **Confidence: HIGH.**
- [WCAG 2.2: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions) — disable nonessential interaction motion and respect user preference. **Confidence: HIGH.**
- [ResizeObserver (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) — pre-paint delivery and cyclic resize notification behavior. **Confidence: HIGH for documented platform behavior; verify target engines.**
- [Avoid large, complex layouts and layout thrashing (web.dev, updated 2025-05-07)](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) — DOM-size/layout cost and read-write forced layout. **Confidence: MEDIUM-HIGH (browser-vendor engineering guidance).**
- [WAI: Selecting Web Accessibility Evaluation Tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/) and [Evaluating Web Accessibility](https://www.w3.org/WAI/test-evaluate/) — automated tools cannot determine accessibility; evaluate early and include human judgment. **Confidence: HIGH.**

---
*Pitfalls research for: Lem Reader*
*Researched: 2026-07-26*
