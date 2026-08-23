# Pitfalls Research

**Domain:** Accessible local-first long-form reader refinement
**Researched:** 2026-08-23
**Confidence:** MEDIUM — conclusions are grounded in current W3C/WAI, OWASP, MDN, Dexie, and Playwright guidance, then specialized to Lem Reader. The project-specific interaction among pagination, images, and cross-block anchors remains an empirical browser/corpus question.

## Critical Pitfalls

### Pitfall 1: Remote images quietly bypass the ingestion security boundary

**What goes wrong:**
Preserving an article's `<img src>` as a live third-party URL makes every reading session contact the publisher or tracker, exposing the reader's IP address and potentially a referrer. Proxying or downloading images without the same SSRF controls as document ingestion lets redirects, DNS rebinding, IPv6/private ranges, cloud metadata, oversized files, decompression bombs, or misleading MIME types reach the server. A URL that was public when accepted can later resolve elsewhere.

**Why it happens:**
Images look like passive presentation and are often added after the HTML pipeline is already considered secure. Browser image loading also appears to avoid server-side SSRF, but creates a separate privacy, availability, CSP, mixed-content, and offline-consistency problem.

**How to avoid:**
Treat each image as an ingest-stage resource, never as trusted sanitized markup. Resolve relative URLs against the final document URL, allow only `https:` (with an explicit policy for `http:` sources), validate every redirect hop and every resolved A/AAAA address with the existing `safeFetch` policy, cap redirect count, response bytes, pixel dimensions, decoded memory, and image count per article, sniff/parse an allowlisted raster format rather than trusting `Content-Type`, and reject SVG unless it receives a deliberately separate sanitizer and threat model. Prefer controlled local blob/cache assets referenced by opaque IDs so reopening an article makes no third-party request. Strip metadata where practical, set `referrerpolicy="no-referrer"` as defense in depth, and ensure export/import either carries assets with manifest hashes and bomb guards or explicitly reports missing assets. Record intrinsic width/height or aspect ratio before the article is admitted.

**Warning signs:**
- Canonical blocks contain arbitrary `http(s)` URLs rather than controlled asset IDs.
- DevTools shows publisher/ad-tech requests when an already-saved article opens.
- Image retrieval follows redirects automatically before revalidation.
- An image works online but disappears after export/import or while offline.
- `image/svg+xml`, huge dimensions, animated formats, or mismatched magic bytes are accepted without policy.
- Loading an image changes page count or moves the reader after pagination was marked stable.

**Phase to address:**
**Image ingestion substrate**, before reader rendering or UI polish. Make the asset security/storage/export contract explicit first.

---

### Pitfall 2: Images and captions destabilize the reading engine

**What goes wrong:**
Late image decode changes block height after page boundaries are committed, causing overflow, duplicate/omitted content, a changed page count, or a lost location. A figure can be split from its caption; oversize images can make pagination fail; failed images can leave unexplained blank space. Scrolling and paginated modes can render different semantics or dimensions.

**Why it happens:**
Text-centric layout assumes fonts are the only asynchronous measurement dependency. `loading="lazy"`, unknown intrinsic dimensions, responsive `srcset`, EXIF orientation, broken resources, and decode timing make images another invalidation source. Generic paragraph treatment also discards the figure-caption relationship.

**How to avoid:**
Extend the canonical model with a validated figure/image/caption contract rather than storing caption-like prose. Reserve aspect-ratio space from ingest metadata, use responsive CSS that never exceeds the content box, define deterministic policies for an image taller than a page, and make `figure` atomic with its `figcaption` where feasible. Pagination stability must wait for required image metadata/decode or use stable reserved geometry; stale layout jobs must be cancelled. Render the same semantic `<figure><img><figcaption>` in both modes, preserve meaningful alt text, distinguish decorative images with empty alt, and expose a calm failure placeholder that does not alter canonical text offsets.

**Warning signs:**
- Page count changes after `img.onload`, after returning to a tab, or after cache state changes.
- Captions are paragraphs with no programmatic figure relationship.
- Broken images leave controls or captions with no context.
- The same article restores to a different sentence depending on whether images were cached.
- E2E passes only with mocked instant-loading images.

**Phase to address:**
**Image rendering and pagination integration**, immediately after the image asset substrate and before TOC/highlight work is accepted.

---

### Pitfall 3: Cross-block highlighting corrupts the canonical coordinate system

**What goes wrong:**
A browser `Range` spanning paragraphs, quotations, lists, links, or page fragments is serialized as DOM endpoints or as several unrelated block highlights. Reopening, repagination, mode switching, or a renderer change then clips, duplicates, reverses, or silently reattaches it. Whitespace and Unicode normalization can introduce off-by-one errors, especially at element boundaries.

**Why it happens:**
The Selection API exposes DOM boundary points, while Lem Reader's durable truth is a normalized grapheme stream. Existing single-block code likely assumes one block ID plus local offsets; merely removing that guard does not define separator semantics, excluded nodes, reverse selections, or rendering across page fragments.

**How to avoid:**
Define one half-open `[start,end)` range in the existing article-wide normalized grapheme coordinate system, plus exact/prefix/suffix quote context and schema version. Specify exactly what text/separators every supported block contributes and keep controls, captions (if policy excludes them), footnote UI, and hidden/paginated duplicates out of the mapping. Convert an ephemeral DOM Range immediately through a single tested DOM↔canonical mapping service. Render one annotation as multiple visual fragments while keeping one persistent identity/note. Preserve honest confident/ambiguous/orphan resolution; never fall back to the nearest plausible range. Decide and test policy for partially selectable links, list boundaries, code, footnotes, figures, and selections crossing unsupported blocks.

**Warning signs:**
- Persistence adds arrays of block-local highlights without a single canonical start/end.
- Tests assert colored spans but not recovered exact quote and canonical offsets.
- Reverse drag, double-click-plus-extend, or boundary-ending selections produce different text.
- Page DOM structure appears in stored annotation data.
- Editing display metadata or switching mode changes annotation status.
- Importing an old highlight changes its selector instead of preserving it byte-for-byte.

**Phase to address:**
**Cross-block annotation substrate**, before any cross-block selection UI. Require property/corpus tests before wiring actions and notes.

---

### Pitfall 4: Schema migration conflates mutable metadata with canonical identity

**What goes wrong:**
Editing title or author mutates the canonical article payload, content hash, deduplication key, book/chapter linkage, or selector source identity. Existing highlights become orphaned; re-ingestion creates duplicates; exports disagree with local records. A Dexie upgrade fills defaults inconsistently or partially updates related stores, leaving mixed v5/v6-shaped records.

**Why it happens:**
Imported source metadata and reader-owned corrections are convenient to store in the same fields. UI code then treats title as both display value and identity. Migration is tested only on a new empty database, not on real v1/v2 export shapes and every prior IndexedDB schema.

**How to avoid:**
Keep immutable article/content identity and normalized content separate from reader-editable display overrides (for example, `titleOverride`/`authorOverride` with source values retained). Add an append-only Dexie version and a versioned runtime schema. Perform transforms through the upgrade transaction, with no unrelated async/network work; update all affected stores atomically. Define precedence for source metadata, user override, re-ingestion, import conflicts, EPUB book/chapter metadata, and clearing an override. Extend export manifests/schema unions and keep old bundles importable. Fixture-test upgrades from every supported prior database/export version, including interruption/abort and malformed records.

**Warning signs:**
- `article.id`, content digest, or annotation `source` changes after renaming.
- The edit form writes directly into normalized canonical blocks.
- Migration tests begin with `deleteDatabase()` or only exercise latest schema.
- Export/import loses overrides or overwrites newer local edits without preview.
- Search, grouping, and review panel show different titles for the same article.

**Phase to address:**
**Persistence and metadata contract**, before the metadata editor and before library IA depends on the new fields.

---

### Pitfall 5: SPA navigation looks coherent visually but is disorienting non-visually

**What goes wrong:**
Library, Highlights, and Reader swap content without a meaningful document title, focus destination, route announcement, or history behavior. Keyboard/screen-reader users remain focused on a removed control or start reading in the old landmark context. Conversely, aggressive focus resets steal focus during filters, page turns, TOC jumps, and state-only hash changes. “Back to Library” may discard the prior library filter/scroll state or create a history loop.

**Why it happens:**
Hash routing changes pixels without browser-native document navigation. Teams apply one global “focus the h1 after every route change” rule, even though full destination changes, in-reader location changes, and UI state changes require different policies.

**How to avoid:**
Create explicit route semantics for Library, Highlights, and Reader: unique `document.title`, one named/main landmark and clear page heading, stable active-navigation indication, and predictable browser Back/Forward behavior. On full destination changes, move focus to a suitable main heading/container only after render and announce sparingly if needed; on TOC jumps, focus or scroll the target heading without trapping it in every Tab sequence; on page turns, preserve the validated reader behavior; on filters/popovers, retain or return focus. Preserve library tab/filter/scroll context when returning from Reader. Test direct deep links, reloads, missing article IDs, Back/Forward, and focus after deletion.

**Warning signs:**
- The URL changes but `document.title` and screen-reader context do not.
- Focus falls to `<body>` after navigation or jumps on every hash mutation.
- Back closes the app or cycles between equivalent states.
- Duplicate `main` landmarks or duplicate page-level headings appear when overlays open.
- Automated route tests never inspect `activeElement`, history, or accessible landmarks.

**Phase to address:**
**Application shell and routing**, before reorganizing Library and Highlights surfaces.

---

### Pitfall 6: The TOC mirrors visual headings, not the canonical document structure

**What goes wrong:**
The TOC omits headings split across pages, includes decorative UI headings, creates duplicate/unstable IDs, flattens skipped levels misleadingly, or navigates to a stale page after repagination. The sidebar obscures content at zoom, traps focus like a dialog when it is only a disclosure, or loses the reader's place when opened.

**Why it happens:**
Scraping the currently rendered DOM is easy but pagination renders fragments and controls alongside article content. A desktop sidebar is then forced into a mobile overlay without choosing the correct disclosure/dialog behavior.

**How to avoid:**
Derive the outline once from canonical heading blocks and stable block/source IDs, not rendered pages. Preserve authored rank honestly; represent hierarchy with a named `<nav>` and nested lists, and use ordinary links/buttons rather than a tree widget unless full tree keyboard behavior is genuinely needed. Map a heading target through the same canonical location-to-current-layout service used by restoration. Use `aria-current="location"` for the active section only when reliable. Choose explicit responsive behavior: inline/sticky complementary navigation on wide layouts; a dismissible disclosure or correctly implemented modal dialog on narrow layouts, with `aria-expanded`, Escape, focus return, and no content obstruction. Opening the TOC must not change canonical reading location.

**Warning signs:**
- TOC items are queried from `h1,h2...` in the live paginated DOM.
- IDs depend on slugified text and collide when headings repeat.
- Heading links work in scrolling mode but land on the wrong page in paginated mode.
- Mobile TOC uses `aria-modal` but background remains interactive, or traps focus without dialog semantics.
- Active-section updates trigger repagination or persistence writes on every scroll tick.

**Phase to address:**
**Reader orientation/TOC**, after canonical routing/location APIs are stable and alongside responsive accessibility validation.

---

### Pitfall 7: Anchored overlays are positioned in the wrong coordinate space

**What goes wrong:**
The tag menu opens at the page edge instead of below its trigger, is clipped by an `overflow` ancestor, appears offscreen at narrow widths, or drifts after scrolling/zoom. Keyboard users cannot enter it, Escape does nothing, focus is lost on close, and a persistent popup obscures another focused control.

**Why it happens:**
Absolute coordinates are calculated relative to the header or document while the overlay is rendered in another containing block. CSS transforms create new containing blocks; nested scrolling and browser visual viewport changes invalidate cached rectangles. Teams also use ARIA `menu` for a simple list of actions without implementing menu keyboard behavior.

**How to avoid:**
Adopt one overlay primitive and controlled portal root. Anchor to the actual triggering element via `getBoundingClientRect()`, then flip/shift/clamp to the current viewport and recalculate on relevant scroll, resize, zoom, and layout changes; do not solve clipping with arbitrary z-index escalation. Pick semantics by behavior: a disclosure/list of normal controls for simple filtering, or a true menu only with the APG keyboard model. Ensure accessible name/state, logical focus entry, Escape/outside dismissal, dismissal when focus leaves where appropriate, and focus return to the trigger. Test every viewport edge, transformed/scrolling ancestor, 400% zoom, forced colors, pointer and keyboard.

**Warning signs:**
- Position uses hard-coded `left`, header width, or document offsets.
- Increasing `z-index` is the repeated fix.
- Popup remains open after trigger unmount/navigation.
- Role is `menu` but Tab is the only supported navigation, or arrow handling breaks screen-reader reading mode.
- Screenshot tests cover only a centered desktop trigger.

**Phase to address:**
**Shared application shell/overlay foundation**, before fixing tag controls or building TOC/Add workflows.

---

### Pitfall 8: Responsive polish creates new reflow and focus-obscuring failures

**What goes wrong:**
Shared headers, tabs, reader controls, gutters, sidebars, or restoration markers look aligned at the design viewport but force two-dimensional scrolling at 320 CSS px, cover focused controls at 400% zoom, or reduce the reading surface to an unusable strip. Desktop sticky behavior persists on mobile. The “You left off here” replacement becomes a fixed toast that still obscures content or focus.

**Why it happens:**
Visual cleanup is tested with device-width resizing, not browser zoom, text-only zoom, dynamic toolbars, long localized labels, or large user typography. Each view defines its own max-width/gutter math, so alignment fixes diverge again.

**How to avoid:**
Create shared shell/container/gutter tokens with no negative-margin exceptions. Validate one-dimensional reflow at 320 CSS px and 400% zoom; collapse, move into normal flow, or make sidebars user-dismissible at narrow effective widths. Use logical properties and content-driven breakpoints. Keep focused targets visible and provide scroll padding for sticky headers. Replace the restoration banner with a non-layout-shifting marker/control whose state is dismissible and whose announcement is not repetitive; it must not block page turning or become the new persisted location. Exercise long metadata, long tags, empty/error/loading states, on-screen keyboards, safe areas, and both reading modes.

**Warning signs:**
- Horizontal scrolling appears outside inherently two-dimensional content.
- Fixed/sticky regions consume most of the viewport at 400% zoom.
- A focus ring is partially hidden beneath header/sidebar/toast.
- Review and Library use different gutter constants or full-bleed exceptions.
- Visual snapshots exist only at 1440px and one phone width.

**Phase to address:**
**Design-system and responsive shell pass**, early; re-verify in every later feature phase.

---

### Pitfall 9: Reading states become contradictory derived data

**What goes wrong:**
An article appears in both unread and finished, progress changes state at different thresholds across views, EPUB book state disagrees with its chapters, or editing metadata updates the wrong row. A hard-coded finished ratio fork—the existing known debt—becomes embedded in filters and navigation.

**Why it happens:**
Unread/in-progress/finished are separately persisted labels even though they derive from canonical reading progress, completion policy, and possibly an explicit reader override. Different components duplicate the derivation.

**How to avoid:**
Define one domain function and one policy for state derivation, including zero-length/unsupported content, reopened finished content, explicit “mark unread/finished” if offered, and book aggregation. Persist source facts (canonical location/progress and explicit override), not multiple calculated buckets. Use the same selector in Library, Continue Reading, search, review, export/import, and book grouping. Resolve the `LibraryRow FINISHED_RATIO` fork before building tabs around it.

**Warning signs:**
- Multiple components compare progress against literal thresholds.
- Moving a slider/page can make an item disappear without focus recovery.
- Counts disagree with visible rows.
- Imported records change bucket without a documented migration reason.
- Book progress is averaged without considering chapter lengths or completion policy.

**Phase to address:**
**Library domain model**, before the new tab/filter IA.

---

### Pitfall 10: A polished Add workflow hides ingestion honesty or breaks focus

**What goes wrong:**
Turning the always-visible form into a modal/wizard masks format-specific refusal details, loses entered content on an error, permits duplicate submissions, or traps keyboard/screen-reader users. Closing the workflow returns focus nowhere; successful ingestion silently relocates the user or leaves them uncertain which article was added.

**Why it happens:**
Workflow polish prioritizes fewer visible fields and transition animation while treating the established seven-stage pipeline as a black-box success/failure call. Each intake format has different input, validation, latency, retry, and privacy implications.

**How to avoid:**
Use a real dialog only if interaction is modal and implement the complete dialog contract: labelled container, initial focus chosen for structured content, contained Tab sequence, Escape/visible Cancel, inert background, and logical focus return. Preserve entered values after recoverable errors, prevent duplicate submission, expose stage-independent progress without fake certainty, and surface the pipeline's exact calm refusal/confidence result. On success, give an explicit choice or predictable destination and focus. Respect reduced motion. Test all five formats, keyboard-only operation, slow/failing network, oversized/corrupt inputs, cancellation, retry, and Back/Forward.

**Warning signs:**
- The dialog is visually modal but background remains tabbable.
- Error text appears but focus/announcement does not reach it.
- Closing after an error discards a large pasted document without warning.
- UI maps all refusals to “Something went wrong.”
- Double activation creates duplicate records.

**Phase to address:**
**Focused ingestion workflow**, after the shared shell/dialog primitive and before final UI acceptance.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store live remote image URLs | Fastest route to visible images | Tracking/privacy leakage, broken offline/export behavior, CSP/mixed-content failures, layout instability | Never for saved canonical content |
| Add cross-block ranges as arrays of old single-block annotations | Reuses renderer | Split identity/notes, overlap bugs, impossible honest resolution | Only as a temporary in-memory rendering representation, never persistence |
| Mutate imported title/author in place | Simple form binding | Identity/dedup/export/annotation drift; original metadata lost | Never; use explicit overrides |
| Query the rendered DOM to build TOC | Little modeling work | Duplicate/missing headings under pagination and unstable targets | Never when canonical heading blocks already exist |
| One generic route-change focus effect | Consistent code | Steals focus on page turns/filters and misses meaningful destination changes | Never; route transitions need typed policies |
| Per-page gutter and overlay CSS | Local speed | Recurring misalignment/clipping and inaccessible zoom behavior | Only in disposable prototypes, not v2.1 |
| Treat axe/jsdom as acceptance | Fast CI | Misses layout, focus, selection, browser, and AT failures | Unit feedback only; never milestone acceptance |
| Rewrite or compact old Dexie versions | Cleaner schema file | Existing installations can no longer upgrade safely | Never while old user data is supported |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Existing `safeFetch` + image retrieval | Validate only the initial image URL or inherit automatic redirects | Reuse resolution/range/redirect validation at every hop; add image-specific byte/dimension/type quotas |
| Canonical Block model + images | Preserve sanitized `<img>` markup or arbitrary `srcset` | Normalize into typed figure/image/caption blocks referencing controlled assets |
| Pagination + image decode | Paginate on placeholder size, then let images resize | Reserve verified aspect ratio; make decode/metadata part of layout readiness and stale-job cancellation |
| Selection API + annotations | Persist DOM `Range` endpoints/block IDs | Map immediately to article-wide grapheme offsets plus quote context |
| Dexie + metadata overrides | Update article, search index, book record, and export state independently | Version schema and transact related changes; derive display/search values through one repository contract |
| Hash router + deep links | Treat all hash changes as full navigation | Distinguish destination routes, reader locations, and UI state; assign focus/history policy per transition |
| TOC + pagination | Scroll to DOM heading that may not be mounted | Resolve canonical heading location to current page/fragment through the reader location service |
| Overlay portal + header/sidebar | Use coordinates from the portal parent | Use trigger viewport rect plus collision handling and invalidation observers |
| Import/export + image assets | Add blobs without manifest accounting | Hash, size-cap, validate, preview conflicts, and atomically import assets with referenced records |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Decode all source images eagerly | Slow ingest/open, high memory, mobile crashes | Cap count/bytes/pixels; generate/store bounded variants if needed; reserve dimensions; decode near need without changing geometry | Image-heavy articles or high-resolution photography |
| Re-run full pagination on every image event | Thrashing, page flicker, lost position | Batch readiness, reserve geometry, coalesce invalidations, cancel stale jobs | Several images load out of order or slow network/cache misses |
| Re-resolve every annotation on every fragment render | Page turns slow with highlight count | Resolve once per content/version and index intervals for current fragments | Long books or hundreds of annotations |
| Compute active TOC entry from every scroll event | Jank and excessive writes | Use throttled/observer-based view state; never persist on every update | Long heading-rich documents |
| Materialize every article in each reading-state tab | Library filtering stalls | Indexed/derived queries and windowed rendering only if measured; retain semantic list behavior | Large imported libraries, especially EPUB chapters |
| Rebuild derived search/state fields during render | Inconsistent frames and CPU churn | Repository-level derived selectors and migration/backfill | Every route/filter change at medium library size |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Live third-party image loading | IP/referrer leakage, tracking pixels, mutable content, offline failure | Ingest/cache controlled assets; `no-referrer` defense in depth; no remote fetch on reopen |
| Image proxy without SSRF parity | Internal/metadata access through redirects, DNS, IPv6, parser tricks | Revalidate each hop/address, restrict schemes, cap redirects/time/bytes, block special ranges |
| Trusting image MIME/extension | Polyglot or active-content exposure; decoder abuse | Magic-byte validation and strict raster allowlist; separately threat-model SVG/animation |
| Unlimited pixels/count/decoded memory | Resource exhaustion despite small compressed response | Enforce compressed bytes, dimensions, pixel budget, count, and decode timeout |
| Blob URL lifecycle mistakes | Memory leaks or accidental cross-record reuse | Central asset repository; revoke transient object URLs; never persist blob URLs |
| Exporting assets without validation | Zip bomb growth, hash mismatch, orphan assets | Manifest hashes/sizes, aggregate limits, atomic reference validation, existing Zip Slip/bomb guards |
| Rendering editable metadata as HTML | Stored XSS through title/author | Store plain strings; render as text; validate length/control characters at boundaries |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Organize Library as mutually exclusive tabs without useful counts/empty states | Content seems lost after state changes | Clear named filters with counts, stable focus, explanatory empty states, and an “All” escape hatch |
| Replace layout-shifting restoration banner with an auto-announced toast | Still interrupts reading, especially with AT | Quiet in-flow/overlay marker or explicit resume affordance; no repeated live announcement; never block navigation |
| Make app brand clickable without communicating destination | Ambiguous link purpose | Label/position it consistently as Home/Library, with explicit Back to Library where context requires |
| Put global and contextual settings together without scope cues | Readers cannot predict what changes now vs later | Group and label persisted global reading preferences; show contextual effects in Reader or provide clear preview text |
| Modalize every workflow/sidebar | Excess focus management and loss of spatial continuity | Use page/disclosure patterns for navigation; reserve modal dialog for focused interrupting tasks |
| Auto-open article immediately after ingest | Reader loses library/task context | Confirm success and make the next action explicit/predictable |
| Show active TOC section inaccurately | False orientation is worse than none | Use `aria-current` only from reliable current canonical location and update without noisy announcements |
| Hide unsupported image/caption extraction | Silent content loss violates product honesty | Report omitted/unsupported media in ingest outcome without overwhelming the reading surface |

## "Looks Done But Isn't" Checklist

- [ ] **Remote images:** No network request occurs when reopening a saved article; redirect/DNS/private-range/type/size/pixel tests are green; offline and export/import preserve or honestly omit assets.
- [ ] **Image semantics:** Every meaningful image has appropriate alt treatment and every caption is a real `figcaption`; broken/decorative cases are distinguishable.
- [ ] **Pagination stability:** Page boundaries/location are identical before and after image decode/cache changes, or a controlled repagination preserves the exact canonical location.
- [ ] **Cross-block highlights:** Forward/reverse selection across paragraphs, lists, quotes, links, code, and page boundaries round-trips exact grapheme offsets in both modes and all three engines.
- [ ] **Annotation honesty:** Content changes yield confident/ambiguous/orphan outcomes without nearest-match attachment; old single-block highlights remain byte-stable through migration.
- [ ] **Metadata edits:** Renaming/changing author does not alter article ID, content digest, source selectors, book linkage, or annotation status; clearing an override restores source metadata.
- [ ] **Database migration:** Upgrade tests start from every supported Dexie/export version with realistic records and assert atomic failure behavior.
- [ ] **SPA routes:** Direct URL, reload, browser Back/Forward, and return from Reader preserve title, landmarks, focus, library filter, and scroll context.
- [ ] **TOC:** Repeated/skipped headings, no-heading articles, paginated splits, narrow layouts, keyboard, NVDA+Firefox, and VoiceOver+Safari all behave predictably.
- [ ] **Overlays:** Tag, TOC, and Add controls are anchored and operable at all viewport edges, nested scroll, browser zoom, forced colors, Escape, outside click, and focus return.
- [ ] **Reflow:** Library, Highlights, Reader, dialogs, and sidebars work at 320 CSS px/400% zoom without unintended two-dimensional scrolling or obscured focus.
- [ ] **Ingestion workflow:** All five input formats preserve user input on recoverable failure and show the canonical pipeline's honest reason/confidence.
- [ ] **Full regression gate:** Unit, migration, property/corpus, and three-engine Playwright suites run to completion; axe is supplemented by keyboard and AT protocols.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Live remote images shipped | HIGH | Stop remote loads with CSP, migrate URLs through the guarded asset pipeline, add missing-asset state, bump export schema, notify users of unavailable assets |
| Cross-block schema stores DOM/per-block truth | HIGH | Freeze writes, define canonical article-wide selector, build conservative migration only where exact equivalence is provable, mark others ambiguous/orphan rather than guessing |
| Metadata changed canonical identity | HIGH | Restore immutable IDs/source fields from backups/export manifests, separate overrides, rebuild derived indexes, re-run annotation round-trip audit |
| Bad Dexie upgrade | HIGH | Abort/disable rollout, add a later append-only corrective version, reconstruct only deterministic fields, preserve/export unrecognized records; never delete user DB as a fix |
| SPA focus/history regression | MEDIUM | Introduce typed transition policy centrally, remove component-level focus effects, add route matrix E2E and manual AT rerun |
| Mispositioned overlays | MEDIUM | Replace ad hoc positioning with one portal/anchor primitive, remove conflicting containing blocks, add edge/zoom screenshot and keyboard cases |
| TOC built from DOM | MEDIUM | Move outline generation to canonical model, introduce stable heading IDs, map targets through location service, preserve existing routes where possible |
| Image-driven pagination drift | HIGH | Persist dimensions/ratio, block stability until geometry known, invalidate/cancel deterministically, rerun entire corpus × browser × cache-state matrix |

## Pitfall-to-Phase Mapping

Roadmap phase numbers are intentionally not assumed; the roadmapper should preserve this dependency order.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Contradictory reading states | **Library domain model** | One derivation policy; existing FINISHED_RATIO fork removed; unit/import/book aggregation matrix green |
| Mutable metadata corrupts identity | **Persistence and metadata contract** | Real prior-schema migrations; ID/digest/selector invariance; atomic abort tests |
| SPA navigation disorientation | **Application shell and routing** | Title/landmark/focus/history E2E plus keyboard and AT checkpoints |
| Overlay coordinate/focus failures | **Shared shell/overlay foundation** | Trigger-edge × scroll × zoom × input modality matrix |
| Reflow and gutter regressions | **Design-system/responsive shell** | 320 CSS px/400% zoom across all routes; focus never obscured |
| Remote-image security/privacy bypass | **Image ingestion substrate** | SSRF redirect/DNS/type/quota suite; zero third-party reopen requests; offline/export checks |
| Image/caption pagination instability | **Image rendering integration** | Figure semantics; slow/broken/cache-state corpus × both modes × three engines |
| TOC derived from unstable DOM | **Reader orientation/TOC** | Canonical outline/ID tests; paginated and scrolling deep links; disclosure/dialog AT protocol |
| Cross-block coordinate corruption | **Annotation substrate** | Property tests and representative block-boundary corpus before UI acceptance |
| Add workflow hides ingestion honesty | **Focused ingestion workflow** | All-format slow/fail/retry/cancel tests; dialog focus and exact refusal messaging |
| Test suite gives false confidence | **Every phase + final acceptance** | Phase-local regression additions and complete recorded full-suite/AT run, not selective pass counts |

## Sources

- [OWASP Server Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — redirect, DNS, private/special-address, and metadata-service risks (MEDIUM, websearch verified by research seam).
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) — `img-src` control and mixed-content context (MEDIUM).
- [MDN: Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy) — per-image referrer policy and `no-referrer` (MEDIUM).
- [MDN: HTML images](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/HTML_images) — intrinsic dimensions reserve space and prevent disruptive layout shift (MEDIUM).
- [MDN: HTMLImageElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement) — decode, loading, intrinsic dimensions, failures, and referrer policy (MEDIUM).
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — TextPosition/TextQuote selectors, multiple selectors, range boundaries, and robustness rationale (MEDIUM).
- [Dexie: Version.upgrade()](https://dexie.org/docs/Version/Version.upgrade%28%29) — upgrade transaction and data transformation model (MEDIUM).
- [Dexie: `populate` limitations](https://dexie.org/docs/Dexie/Dexie.on.populate-%28old-version%29) — upgrade/populate distinction and transaction auto-commit constraints around unrelated async work (MEDIUM).
- [WAI ARIA APG: Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) and [Disclosure Navigation example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/) — semantics, keyboard operation, Escape, focus, hierarchy, and `aria-current` (MEDIUM).
- [WAI ARIA APG: Dialog (Modal) pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — focus containment, Escape, inert background, labelling, and focus return (MEDIUM).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Understanding Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow), and [Understanding Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) — 320 CSS px/400% zoom, sticky content, sidebars, popups, and focus visibility (MEDIUM).
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) — automated accessibility testing scope; used with Lem Reader's existing evidence that layout and AT behavior require real-browser/manual coverage (MEDIUM).
- Lem Reader `.planning/PROJECT.md` — shipped architecture, accessibility matrix, canonical grapheme offsets, honest annotation states, current technical debt, and v2.1 scope (HIGH, primary project evidence).

### Research limitations

- The research-plan seam selected Brave for web questions, but `BRAVE_API_KEY` was unavailable; the documented built-in web-search fallback was used and restricted primarily to official standards/documentation.
- Context7 was unavailable and the `ctx7` CLI fetch failed; current official Dexie documentation was retrieved through web search instead.
- Cache persistence through `research-store put` was attempted for all eight digests but the sandbox denied writes to `/Users/eggfam/.gsd/research-cache`. This does not affect the canonical project research file.
- Exact safe image format/decoder choices and the performance threshold for image-heavy articles require a phase-specific corpus spike; no unverified numeric limit is prescribed here.

---
*Pitfalls research for: Lem Reader v2.1 Reader Experience*
*Researched: 2026-08-23*
