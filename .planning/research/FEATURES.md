# Feature Research

**Domain:** Accessible, local-first read-it-later library and long-form reader refinement
**Researched:** 2026-08-23
**Confidence:** MEDIUM (official product and standards sources; product-fit recommendations remain project-specific inferences)

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| First-class Library, Highlights, and Reader destinations | A saved-reading app is understood as a small set of stable places. Highlights hidden behind a hash URL and inconsistent back controls create dead ends and force recall. | MEDIUM | Use one app shell with consistent primary navigation and one `main` landmark per route. Indicate the current destination programmatically and visually. Reader may use a quieter variant, but Library and Highlights must remain predictably reachable. |
| Library views for unread, in progress, and finished | Readers need to distinguish backlog, active reading, and completed material without manually tagging every item. Competitors expose inbox/later/archive, seen state, and progress-derived views. | MEDIUM | Make these saved views over existing progress/location data, not mutually exclusive folders. Define thresholds explicitly: unread should not become in-progress from an accidental open; finished should have an explicit/manual override because completion heuristics are imperfect. Preserve search and tags within a view. |
| Focused Add to Library workflow | Adding is an action, not permanent page content. Showing every ingestion mode at once competes with the reading list and increases cognitive load. | MEDIUM | A clearly labeled Add button opens a route or accessible modal/wizard. Start with a source choice, reveal only relevant fields, preserve entered data when moving back, announce validation/status, focus the heading on entry, and return focus to the trigger on close. Keep drag/drop as an enhancement, not the only path. |
| Editable title and author | Extraction and uploaded-file metadata are frequently incomplete or poor. Mature readers permit document-level metadata repair. | MEDIUM | Edit display metadata without mutating canonical document identity, normalized text, source provenance, or annotation coordinates. Show original source separately. Validate empty/whitespace values and include edits in export/import schema handling. |
| Consistent headers, gutters, and contextual controls | Stable placement reduces reorientation, especially at high zoom or for readers with cognitive disabilities. Controls should appear where their effects are visible. | MEDIUM | Establish shell-level layout primitives and a narrow set of header variants. Reader-only settings can remain persistent globally, but mode controls belong in Reader context. Ensure 400% reflow, visible focus, adequate target size, and no horizontal page scrolling. |
| Correctly anchored, dismissible popovers | A menu appearing far from its trigger breaks visual association and can produce illogical focus order. | LOW-MEDIUM | Position relative to the trigger with viewport collision handling; DOM/focus order must remain logical. Open with button semantics, close on Escape/outside action, restore focus, and expose expanded state. Do not use hover-only behavior. |
| Non-intrusive resume behavior | Location restoration is expected, but an inserted banner that moves content invalidates spatial orientation—the very thing Lem Reader promises. | MEDIUM | Restore directly when confidence is high and offer a compact, non-modal undo/jump-back control in reserved chrome or a transient status region. Never insert it into article flow, block page turning, steal focus, or require dismissal. If restoration is uncertain, say so honestly. |
| Navigable heading-derived table of contents | Long documents need an overview and direct section navigation. A TOC is an orientation aid, not merely decoration. | MEDIUM-HIGH | Derive from canonical heading blocks and stable block/source identifiers. Render as a labeled `nav` with real links; preserve source order and heading level rather than “fixing” content silently. Support keyboard activation, current-section indication without color alone, close/return-focus behavior on narrow layouts, and the same destination semantics in scrolling and paginated modes. Empty/one-heading documents should omit the control calmly. |
| Source images with semantic captions and alternatives | Images and captions often carry meaning that clean-text extraction loses; readers expect article fidelity within a distraction-free presentation. | HIGH | Extend the canonical ingest boundary, not the renderer alone. Preserve only safely normalized image sources, useful source `alt`, and structural image-caption association. Render `figure`/`figcaption` consistently in both modes. Define honest fallbacks for blocked, oversized, missing, decorative, unsupported, or layout-breaking images. Remote image privacy/offline behavior needs an explicit product decision. |
| Cross-block highlighting | Natural quotations cross paragraph, list-item, or heading boundaries; forcing separate highlights loses context and frustrates selection. | HIGH | Capture one logical normalized-text range spanning supported block boundaries, with quote prefix/suffix and deterministic serialization. Render it as multiple block-local fragments while presenting one annotation/note. Test forward/backward selection, keyboard selection, lists/quotes, page boundaries, mode switches, repagination, reopening, export/import, ambiguous/orphan resolution, editing, and deletion. Refuse selections across non-contiguous or unsupported semantic regions rather than silently truncating. |
| Highlights review as a genuine workspace | Readers expect to browse annotations, jump back into context, and edit or remove them without hunting for an undocumented route. | MEDIUM | Give Highlights a primary destination, consistent content width, useful empty state, filters/sort that do not dominate, and clear article grouping. Preserve the existing honest confidence badges and deep links. Heading and focus structure must remain understandable after filtering or in-place edits. |
| Control fidelity and regression-free settings | A slider whose thumb can travel beyond its real maximum looks broken and erodes trust. | LOW | Align DOM `min`/`max`/`step`, fill calculation, label, and persisted clamp for reading width. Test keyboard Home/End/arrows and announced value, not just pointer behavior. Audit all settings for relevance, range consistency, reset behavior, and first-paint persistence. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Stable, non-shifting spatial orientation across resume, navigation, and pagination | Directly serves readers who are disrupted by surprise movement; most reader products optimize workflow breadth rather than explicit layout stability. | HIGH | Treat “no unexpected content movement” as a testable product invariant. Reserve chrome space, retain canonical location through shell/panel changes, and avoid automatic focus/scroll changes unless user-requested. |
| One semantic TOC across paginated and scrolling twins | Readers get the same mental model and durable section destinations regardless of preferred reading mode. | HIGH | TOC destinations must resolve through canonical offsets, then derive the current page/scroll position; never persist page numbers. |
| Honest cross-block annotations | A quotation can span real semantic boundaries without trading away durable anchoring or silently attaching to the wrong text. | HIGH | Keep the existing confident/ambiguous/orphan contract. One annotation should own multiple render fragments, not multiple independently drifting annotations. |
| Safe, semantically faithful article imagery | Restores meaning and captions without abandoning the normalized model as the security boundary. | HIGH | Preserve provenance and accessible alternatives; image failure must not break pagination or hide caption/context. This is fidelity with constraints, not “full webpage” rendering. |
| Local-first metadata and reading-state organization | Useful library workflows without an account, behavioral tracking, or sync dependence. | MEDIUM | Derived state, metadata edits, annotations, and image policy must round-trip through versioned export/import. Avoid a parallel cloud-only model. |
| Calm progressive disclosure | Library and ingestion become easier to scan without removing power: one task and one hierarchy are visible at a time. | MEDIUM | Prefer stable routes, disclosures, and clearly labeled dialogs. Progressive disclosure must not make frequent actions hidden, pointer-only, or keyboard-expensive. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| A dashboard containing Continue Reading, all ingestion forms, and the entire library | Everything appears immediately available. | Competing headings and actions create a long, incidental page; users must scan past unrelated tasks and lose their place. | Stable Library views plus one prominent Add action; show a restrained “continue” cue within In Progress rather than a separate competing product surface. |
| Mandatory inbox-zero workflow or automatic archive on completion | Makes the library look productive and tidy. | Reading state and organizational intent are different. Accidental opens/completion estimates can move content unexpectedly, harming predictability. | Offer derived Unread/In Progress/Finished views and explicit archive/remove actions; allow manual finished override. |
| A persistent full-width “You left off here” article banner | Makes restoration conspicuous. | Shifts text and page boundaries, interrupts reading, can obstruct page turns, and requires unnecessary dismissal. | Restore in place with unobtrusive reserved-chrome feedback and an optional undo/jump control. |
| App-wide reader controls in every header | Makes every preference reachable everywhere. | Controls are detached from visible effect, compete with primary navigation, and make non-reader screens feel incoherent. | Keep preferences reachable from app settings; surface mode/TOC/typography controls contextually in Reader. |
| Custom ARIA menu/tree/grid for ordinary navigation | Feels application-like and supports dense keyboard interactions. | Adds non-native keyboard rules and focus complexity; it is unnecessary for a small set of destinations or TOC links. | Use native links in labeled `nav`, buttons for disclosures, and ordinary lists. Add composite widgets only when their interaction model is genuinely required. |
| TOC that flattens or invents heading hierarchy silently | Produces a visually neat outline. | Misrepresents author structure and can detach navigation labels from document semantics. | Preserve source hierarchy/order; flag malformed outlines internally and use a tolerant visual indent strategy without rewriting canonical content. |
| Eager loading or hotlinking every original image | Maximizes visual fidelity. | Causes privacy leakage, broken/offline layouts, bandwidth spikes, pagination churn, tracking requests, and unsafe/oversized payload risk. | Admit supported images through capped, sanitized ingest policy; lazy-load below the current reading region and reserve dimensions where known. Decide explicitly between proxied/local copies and remote URLs. |
| Caption synthesis or AI-generated alt text presented as source truth | Fills missing accessibility metadata automatically. | Can invent meaning and violates Lem Reader’s honesty principle. | Preserve trustworthy source alternatives/captions; otherwise use correct decorative/unknown handling and disclose missing descriptions without fabrication. |
| Splitting a cross-block selection into unrelated highlights | Reuses current block-local storage cheaply. | Notes, deletion, review, export, and re-anchoring become fragmented; partial resolution can silently change the quotation. | Store one logical range and derive block-local render fragments transactionally. |
| Bionic reading, Spritz, speed scoring, streaks, or gamified completion in v2.1 | Promises focus and faster reading. | Adds visual churn, unvalidated cognitive claims, timing pressure, and scope unrelated to fixing core organization and orientation. | Record as opt-in future experiments after the calm baseline is trustworthy and user-tested. |
| Full web fidelity (tables, embeds, scripts, arbitrary layouts) | Avoids any content loss. | Reopens XSS/layout instability and breaks the canonical semantic boundary and pagination guarantees. | Maintain the declared rich long-form subset; refuse unsupported content visibly. |

## Expected User Behaviors and Product Rules

| Area | Expected behavior | Recommended Lem Reader rule | Cognitive/accessibility implication |
|------|-------------------|-----------------------------|------------------------------------|
| Entering Library | User lands in a stable default list and can tell which reading-state view is active. | Default to In Progress when non-empty, otherwise Unread/All; remember the last chosen view only if restoration is obvious. | Avoid an empty or surprising landing screen. Keep navigation labels and order consistent across routes. |
| Opening an article | User can return to the same filtered/search context. | Preserve library view, query, tags, and scroll position in navigation state; Back to Library returns there, not blindly to the root. | Prevents repeated work and disorientation. |
| Resuming | User continues at the saved semantic location without negotiating a banner. | Restore after layout stabilizes; announce completion politely only when useful; provide undo without focus theft. | Avoid content movement and interruptions. |
| Adding content | User chooses URL, paste, or file, then sees only relevant inputs and honest progress/errors. | One source-choice step, one source-specific step, then confirmation/open action. Do not clear recoverable input on validation failure. | Reduces simultaneous choices; focus and error summary make recovery predictable. |
| Editing metadata | User changes catalog labels without changing the underlying document. | Save title/author atomically; distinguish user-edited values from extracted provenance for future re-ingestion/import decisions. | Clear labels improve findability; explicit save/cancel avoids accidental changes. |
| Opening TOC | User sees document structure, activates a heading, and remains oriented. | Desktop: non-modal complementary/disclosure panel if room permits. Narrow/reflow: modal dialog or overlay with correct focus containment/return. | Do not shrink the reading measure unpredictably or cover content without a clear close control. |
| Highlighting across blocks | User perceives one continuous quotation and one annotation action. | Normalize selection once, validate allowed boundaries, persist one range, render many fragments, and expose one review item. | Avoid duplicate announcements and inconsistent partial operations. |
| Viewing images | User gets meaningful figures without unexpected page instability. | Reserve dimensions, preserve alt/caption, keep figure together when feasible, and use overflow/fallback policy when not. | Screen-reader meaning and visual spatial stability are equally important. |

## Feature Dependencies

```text
[Shared app shell + route semantics]
    ├──requires──> [View-level layout/header primitives]
    ├──enables───> [Library / Highlights / Reader navigation]
    └──enables───> [Focused Add workflow]

[Reading-state views]
    └──requires──> [Single documented progress/completion policy]

[Metadata editing]
    └──requires──> [Display metadata separated from canonical identity]
                       └──requires──> [Export/import schema migration policy]

[Heading TOC]
    ├──requires──> [Stable heading IDs/source offsets]
    └──requires──> [Mode-independent location navigation]

[Source images + captions]
    ├──requires──> [Canonical figure/image/caption model]
    ├──requires──> [Safe fetch/sanitize/size/privacy policy]
    └──requires──> [Pagination measurement + failure fallback]

[Cross-block highlights]
    ├──requires──> [Document-wide normalized text/range mapping]
    ├──requires──> [Multi-fragment renderer]
    ├──requires──> [Atomic edit/delete/review semantics]
    └──requires──> [Export/import + resolver migration tests]

[UI audit]
    └──verifies──> [All features at keyboard, screen reader, zoom/reflow,
                    forced-colors, reduced-motion, touch, and three engines]
```

### Dependency Notes

- **App shell precedes individual page polish:** Otherwise each page will re-invent spacing, header, navigation, and focus behavior and the milestone will preserve inconsistency under new styling.
- **Reading-state policy precedes tabs:** “Unread,” “in progress,” and “finished” are product semantics, not just filters. Use one shared derivation in cards, counts, search, continue behavior, and EPUB aggregation.
- **Metadata identity separation precedes editing:** Titles are mutable catalog data; article/book IDs and canonical source coordinates must not be derived from them.
- **Heading offsets precede TOC UI:** Both reading modes need the same durable target. The panel is the easy part; stable location mapping and malformed hierarchy behavior are the contract.
- **Image ingestion precedes reader rendering:** Rendering remote DOM or raw HTML would bypass the established security boundary. Figure/caption semantics, source policy, and size limits belong in the normalized model and pipeline.
- **Document-wide selection mapping precedes cross-block UI:** Browser `Range` is only transient input. The durable model must represent one logical span before pagination and annotation UI are expanded.
- **Cross-block storage and review change together:** Review/export/delete/note operations must remain atomic for the logical annotation; shipping only rendering would create corruptible partial behavior.
- **Audit is continuous, not a final cosmetic phase:** Each feature should add semantic/browser tests when built; the concluding pass checks cross-view consistency and the manual assistive-technology matrix.

## v2.1 Scope Definition

### Launch With (v2.1)

- [ ] **Shared application shell and first-class Library/Highlights/Reader navigation** — prerequisite for the milestone’s cohesive SPA experience.
- [ ] **Structured library state views** — unread, in progress, finished, with documented thresholds and preserved search/tag context.
- [ ] **Focused Add to Library flow** — source-specific progressive disclosure, recoverable validation, and accessible focus/status behavior.
- [ ] **Editable title/author metadata** — safely separated from identity and portable through versioned data.
- [ ] **Redesigned Highlights workspace** — correct gutters/hierarchy, first-class route, and preserved jump-to-context/curation behavior.
- [ ] **Non-shifting resume treatment, anchored popovers, and corrected width slider** — concrete trust and orientation defects from direct user feedback.
- [ ] **Heading-derived TOC** — one semantic outline and durable destinations across both reading modes.
- [ ] **Safe images and captions** — canonical ingest through semantic rendering with explicit failure/privacy/size policy.
- [ ] **One logical cross-block highlight** — durable selection, rendering, review, editing, and portability across supported text blocks.
- [ ] **Impeccable-informed UI and accessibility audit** — shared visual primitives plus existing manual/automated validation matrix.

### Add After v2.1 Validation

- [ ] **Manual reading-state override and bulk state changes** — add if automatic thresholds prove confusing or readers manage large backlogs; a manual Finished override is useful sooner than broad bulk editing.
- [ ] **TOC refinements such as current-section tracking and remembered panel state** — add only if baseline navigation is stable and does not introduce scroll/pagination churn.
- [ ] **Image cache/offline management controls** — add if the chosen ingestion policy stores substantial local media or readers need explicit storage visibility.
- [ ] **Saved/custom library views** — consider after the three simple state views prove insufficient; avoid Readwise-level filtering complexity in this local personal reader.

### Future Consideration

- [ ] **Bionic-reading presentation** — evaluate as an opt-in experiment with accessibility/user testing; do not assert comprehension benefit.
- [ ] **Spritz/RSVP speed-reading mode** — conflicts with stable spatial orientation and requires separate timing, pause, reduced-motion, and comprehension work.
- [ ] **Explicit orphan-anchor repair** — valuable once honest cross-block resolution has real failure data; do not mix repair UX into the initial range-model migration.
- [ ] **Accounts/cloud sync, RSS, recommendations, AI summaries, read-aloud** — remain outside this milestone’s organization and fidelity objective.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared shell + primary navigation | HIGH | MEDIUM | P1 |
| Library reading-state views | HIGH | MEDIUM | P1 |
| Focused Add workflow | HIGH | MEDIUM | P1 |
| Highlights workspace redesign | HIGH | MEDIUM | P1 |
| Resume/popover/slider fixes | HIGH | LOW-MEDIUM | P1 |
| Metadata editing | MEDIUM-HIGH | MEDIUM | P1 |
| Heading TOC | HIGH | MEDIUM-HIGH | P1 |
| Source images + captions | HIGH | HIGH | P1, but phase-gated by ingestion spike/policy |
| Cross-block highlighting | HIGH | HIGH | P1, but phase-gated by selector-model tests |
| General visual refinement | MEDIUM-HIGH | MEDIUM | P1 after shell primitives; verify continuously |
| Custom saved views/bulk organization | MEDIUM | MEDIUM-HIGH | P2 |
| TOC/current-section refinements | MEDIUM | MEDIUM | P2 |
| Alternative focus methodologies | UNCERTAIN | HIGH | P3 |

**Priority key:**
- P1: Required for the confirmed v2.1 milestone
- P2: Add after baseline behavior is validated
- P3: Future experiment, not current scope

## Competitor and Standards Analysis

| Capability | Readwise Reader | Instapaper | Accessibility/standards signal | Recommended Lem Reader approach |
|------------|-----------------|------------|--------------------------------|---------------------------------|
| Library organization | Offers configurable Inbox/Later/Archive or shortlist workflows plus filtered views and seen/progress parameters. | Uses Home, Archive, Liked, Notes, folders, and tags. | Consistent navigation and identification reduce relearning. | Keep the simpler user-requested Unread/In Progress/Finished views; do not import configurable workflow complexity yet. |
| Adding content | Central add/upload actions, drag/drop, shortcuts, and source-specific methods. | Save/import flows are actions outside the article list. | Modal/dialog focus must enter the dialog and return appropriately; errors need labels/instructions. | One Add action with source-specific progressive disclosure; keep all existing formats without rendering all forms simultaneously. |
| Metadata | Document-level metadata can be edited from an Info panel; extracted/file metadata can be poor. | Organizing docs expose article actions, folders, and tags. | Labels must describe purpose and controls must be keyboard operable. | Edit title/author from library row/card and Reader info, sharing one atomic domain command. |
| Highlights | Highlights are first-class, keyboard navigable, grouped by document, and can jump to source context. | Has built-in Notes/highlight functions. | Logical focus order and semantic grouping are important after dynamic filters. | Promote existing review panel to Highlights primary nav; retain honest anchor states and context jumps. |
| TOC | Uses detected headings in document/notebook side panels. | TOC is less clearly established in official organization docs. | A labeled navigation landmark with real links makes document structure efficiently navigable. | Derive from canonical headings; use a disclosure/complementary panel on wide screens and accessible overlay on narrow screens. |
| Annotation span | Supports highlight workflows and concatenation features for selected/disjoint material. | User reports indicate cross-page highlighting can be a pain point in paginated contexts. | W3C selectors describe normalized start/end streams and quote context independent of DOM layout. | Implement continuous cross-block spans only, as one durable range; defer disjoint concatenation. |
| Images/captions | Retains rich document content and can use images as covers; exact source fidelity varies by input. | Reader products generally preserve meaningful article media selectively. | WAI recommends appropriate text alternatives and semantic figure/caption grouping. | Preserve supported source figures through the canonical sanitizer/model with honest missing-image behavior; never raw-render source HTML. |

## Requirements-Scoping Recommendations

1. Write **behavioral requirements**, not “redesign page” requirements. Specify destination reachability, state preservation, focus movement, reflow, and failure/empty states.
2. Separate **visual shell work** from **domain migrations**. Navigation/layout can land early; image and annotation changes each need their own data-contract phase and corpus.
3. Make “unread/in progress/finished” a **single shared state policy** with examples (accidental open, reopened finished item, EPUB chapter/book aggregation, manual override).
4. Require the Add flow to cover **all existing formats** without regression and specify recovery from server refusal, network failure, duplicate content, and dialog cancellation.
5. Require metadata edits to preserve **IDs, source provenance, normalized text, annotations, progress, and export/import round trips**.
6. For TOC, specify malformed/missing headings, keyboard navigation, `aria-current` policy, panel behavior at narrow widths, destination focus/announcement, and paginated/scroll parity.
7. For images, require a policy decision before implementation: **local/proxied bytes vs remote URLs**, allowed schemes/MIME types, byte/pixel limits, redirects, alt/caption handling, lazy loading, reserved dimensions, offline/export behavior, and honest failure UI.
8. For cross-block highlights, define the supported boundary matrix. Recommend paragraphs, headings, list items, blockquotes, and captions when their canonical text is contiguous; refuse crossing non-text gaps, footnote boundaries, or separate EPUB chapters until explicitly modeled.
9. Treat the UI audit as a **cross-cutting acceptance gate** with screenshots/manual protocols, not a vague final phase. Include consistent gutters/header hierarchy, focus order, landmarks, 400% zoom/reflow, forced colors, reduced motion, touch targets, and three browser engines.

## Sources

- [Readwise Reader: Library configurations](https://docs.readwise.io/reader/guides/workflows/library-configuration) — Inbox/Later/Archive and alternative organizational workflows (MEDIUM via websearch; official product documentation).
- [Readwise Reader: Filtered views](https://docs.readwise.io/reader/docs/faqs/filtered-views) and [filtering syntax](https://docs.readwise.io/reader/guides/filtering/syntax-guide) — status/location/seen/progress-style filtering and tags (MEDIUM; official product documentation).
- [Readwise Reader: Adding content](https://docs.readwise.io/reader/docs/faqs/adding-new-content) — upload dialog, drag/drop, source metadata, and manual metadata editing (MEDIUM; official product documentation).
- [Readwise Reader: Highlights, tags, and notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes) — keyboard-first review, document grouping, TOC navigation, and jump to original context (MEDIUM; official product documentation).
- [Readwise Reader: Navigation](https://docs.readwise.io/reader/docs/faqs/navigation) — keyboard-driven reader and configurable side panels (MEDIUM; official product documentation).
- [Instapaper organization overview](https://www.instapaper.com/docs/organize/overview) — Home, Archive, Notes, folders, and tags (MEDIUM; official product documentation).
- [Mozilla Readability README](https://github.com/mozilla/readability/blob/main/README.md) — extracted title/byline/content and explicit statement that sanitization is outside Readability (MEDIUM; official repository).
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — normalized TextPositionSelector, TextQuoteSelector, grapheme/logical-order guidance, and ambiguity behavior (MEDIUM via search, primary standard).
- [WAI ARIA landmarks pattern](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/) and [navigation landmark example](https://www.w3.org/WAI/content-assets/wai-aria-practices/patterns/landmarks/examples/navigation.html) — semantic regions and labeled navigation (MEDIUM; primary accessibility guidance).
- [WAI disclosure navigation example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/) and [modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — keyboard, Escape, expanded state, initial focus, and return-focus behavior (MEDIUM; primary accessibility guidance).
- [WCAG 2.2 Understanding: Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — logical focus order, reflow, content on hover/focus, and consistent navigation (MEDIUM; primary standard/guidance).
- [WAI Complex Images tutorial](https://www.w3.org/WAI/tutorials/images/complex/) — alt/long-description guidance and semantic `figure`/`figcaption` association (MEDIUM; primary accessibility guidance).
- Direct v2.1 user feedback captured in `.planning/PROJECT.md` — product-specific evidence for navigation, layout, Add flow, resume, images, TOC, cross-block highlights, and control defects (HIGH for stated user needs).

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| User-requested v2.1 scope | HIGH | Direct milestone feedback and confirmed project scope. |
| Accessibility interaction requirements | HIGH | Recommendations align with primary W3C/WAI standards and existing Lem Reader acceptance constraints. |
| Competitor feature characterization | MEDIUM | Based mainly on current official documentation; products change and not every interaction was directly exercised. |
| Library-state product recommendation | MEDIUM-HIGH | Supported by competitor patterns and direct feedback, but exact thresholds require product testing. |
| Image policy recommendation | MEDIUM | Semantic/security constraints are strong; storage/privacy/offline choice needs a phase-specific feasibility decision. |
| Cross-block annotation recommendation | MEDIUM-HIGH | Selector basis is standardized and existing architecture is compatible in principle; browser selection and migration behavior require corpus testing. |

---
*Feature research for: Lem Reader v2.1 Reader Experience*
*Researched: 2026-08-23*
