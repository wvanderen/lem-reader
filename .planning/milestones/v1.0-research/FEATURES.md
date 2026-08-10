# Feature Research

**Domain:** Accessible, booklike saved-web-article reader
**Researched:** 2026-07-26
**Confidence:** MEDIUM-HIGH — accessibility expectations are grounded in W3C standards and guidance; competitor capabilities are verified from current official documentation, while prioritization remains a product judgment to validate with users.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these makes the reader incomplete or inaccessible.

| Feature | Why Expected | Complexity | Prototype vs. extension notes |
|---------|--------------|------------|-------------------------------|
| Clean, distraction-free article view | The category promise is to remove navigation, ads, pop-ups, and unrelated page chrome so the article is the primary task. W3C cognitive guidance explicitly recommends limiting interruptions and unnecessary content. | MEDIUM | **Prototype P1.** Use already-normalized saved articles; extraction is a separate later concern. Preserve meaningful article media rather than indiscriminately stripping it. |
| Faithful semantic article structure | Headings, paragraphs, links, lists, quotations, images/captions, footnotes, and code must remain understandable and navigable by assistive technology. | HIGH | **Prototype P1.** One normalized document model should drive both reading modes. Unsupported structures must degrade without losing access to text. |
| Adaptable typography and presentation | Reader modes commonly expose font, size, width, spacing, and theme controls; WAI cognitive guidance specifically calls for personalization of font style/size, line height, margins, and contrast. | MEDIUM | **Prototype P1.** Include font family, text size, line height/spacing, measure or margins, and light/dark/sepia or similarly limited themes. Persist preferences locally. |
| Clean scrolling mode | Continuous scrolling is a familiar, robust baseline and an accessibility escape hatch when pagination is unreliable or not preferred. | MEDIUM | **Prototype P1.** It is not a secondary degraded UI: it needs the same semantics, controls, annotations, and location restoration. |
| Predictable paginated mode | A booklike reader needs responsive pages, obvious previous/next actions, stable page composition, and no content loss. | HIGH | **Prototype P1 and core hypothesis.** Page boundaries may change with viewport or typography; never treat page number as durable identity. |
| Explicit mode switching and graceful pagination fallback | Reader preference and access needs vary; no single flow should be forced. A layout failure must not block reading. | MEDIUM | **Prototype P1.** Keep the switch easy to find, preserve logical location across modes, and explain fallback without an interruptive modal. |
| Full keyboard, pointer, touch, and assistive-technology operation | WCAG 2.2 requires keyboard access/no traps and visible focus; controls must expose semantic names, roles, states, and predictable order. | HIGH | **Prototype P1.** Define a small documented key map, retain normal Tab behavior, avoid hijacking common browser/AT shortcuts, and provide visible focus. |
| Zoom, reflow, contrast, and reduced-motion compatibility | WCAG 2.2 covers resize/reflow and focus; user contrast and motion preferences must remain effective. | HIGH | **Prototype P1.** Test browser zoom to 200% and narrow reflow at minimum; no required page-turn animation. Honor `prefers-reduced-motion` and forced-colors/high-contrast behavior. |
| Clear orientation and progress | Long-form readers expect to know the article title, current location, and remaining extent, and to resume after interruption. | HIGH | **Prototype P1.** Use section context plus approximate progress; restore a stable text/content location, not only a volatile percentage or page number. Announce meaningful location changes without chatty live regions. |
| Local highlights and attached notes | Highlighting and notes are standard in established read-it-later products and complete the save-read-remember loop. | HIGH | **Prototype P1.** Anchor to normalized text selectors/positions independent of layout. Support create, view, edit, delete, and navigation back to the passage. |
| Preference, annotation, and position persistence | A saved reader should reopen in the user’s chosen presentation and near the passage where reading stopped. | MEDIUM | **Prototype P1.** Local-first per article. Show safe behavior when stored anchors no longer resolve. Accounts and sync are later. |
| Fast, stable response to viewport/font changes | Visible churn, jumps, blank pages, duplicated passages, or post-font-load repagination undermine calm spatial orientation. | HIGH | **Prototype P1.** Gate measurements on settled fonts where possible; preserve the same logical anchor through repagination; fall back to scroll if confidence fails. |
| Original-source access and basic article metadata | Readers need title, author/source when available, and a clear path to the original for provenance or unsupported content. | LOW | **Prototype P1.** Keep secondary metadata visually quiet and never make returning to the source the primary reading action. |

### Differentiators (Competitive Advantage)

Features that reinforce calm orientation rather than competing on collection breadth.

| Feature | Value Proposition | Complexity | Prototype vs. extension notes |
|---------|-------------------|------------|-------------------------------|
| Stable spatial orientation across repagination | Preserve the reader’s exact logical passage while fonts, viewport, controls, or mode change—the most direct expression of “a book that does not lose your place.” | HIGH | **Prototype P1.** This is the main differentiator to validate technically, not a later embellishment. Track a semantic/text anchor and remap it to the new page. |
| Accessible dual-mode parity | Most reader products optimize one flow; equal-quality page and scroll modes give users control without sacrificing annotation, semantics, or progress. | HIGH | **Prototype P1.** A mode-parity test matrix should cover content structures, navigation, focus, position, and annotations. |
| Calm-by-default progressive controls | A minimal reading surface with optional controls hidden behind one familiar, consistent panel supports cognitive accessibility without removing user agency. | MEDIUM | **Prototype P1.** Keep the main screen to a few primary actions; avoid a permanent dense toolbar. |
| Structural navigation and reorientation | A lightweight outline/heading navigator lets a reader recover after distraction and jump among logical chunks while retaining context. | MEDIUM | **v1.x P2.** Include only if the core pagination engine is stable; long-article heading structure is the dependency. |
| Optional line focus / reading ruler | Showing one, three, or five lines can reduce competing visual information; Microsoft exposes this as an Immersive Reader aid. | MEDIUM | **v1.x P2 differentiator.** User-controlled and off by default. It must work in both modes and not interfere with selection, screen readers, or keyboard navigation. |
| Annotation resilience with recoverability | Quote plus surrounding context and normalized positions can survive repagination and allow repair when content revisions weaken an anchor. | HIGH | **Prototype P1 for same-document repagination; v1.x for explicit orphan/repair UI.** Follow W3C selector concepts rather than DOM paths or page IDs. |
| User-tunable calm presets | Named, comprehensible presets can combine font, measure, spacing, theme, and mode while retaining fine controls. | MEDIUM | **v1.x P2.** Add only after observing which combinations help; avoid implying medical efficacy. |
| Optional read-aloud with synchronized passage focus | Text-to-speech is common in current reader products and WAI notes its value for cognitive/language/learning disabilities. | HIGH | **v2+ P3.** Browser/OS voice behavior, synchronization, controls, and annotation interaction make this too broad for layout validation. |
| Offline-first saved library | Reliable reading without connectivity and durable local ownership are valued in read-it-later products. | HIGH | **v2+ P3.** The prototype’s bundled/saved fixtures already isolate the engine; service worker caching, storage management, import/export, and library UI are product work. |
| Privacy-respecting export/import | Portable articles, annotations, notes, and preferences reduce lock-in and prepare for future sync. | MEDIUM | **v2+ P3.** First stabilize internal schemas, then version a portable format. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Pagination-only experience | Makes the product feel decisively booklike. | Forces one interaction model, can obstruct zoom/reflow or unusual content, and turns a layout failure into loss of access. | Always retain first-class scrolling and automatic, explained fallback. |
| Page numbers as canonical progress or annotation anchors | Familiar from print and easy to display. | Responsive pages change with viewport, fonts, spacing, and zoom; saved locations and annotations drift. | Store normalized text/semantic anchors; derive page and percentage labels at render time. |
| Mandatory animated page turns | Adds visual polish and a physical-book metaphor. | Motion can distract or cause discomfort, delays navigation, and complicates focus/measurement. | Instant transitions by default; if explored later, make subtle motion optional and fully disabled for reduced motion. |
| Dense always-visible toolbar | Makes every capability discoverable at once. | Competes with the article, adds cognitive load, and contradicts WAI guidance to simplify and limit choices. | A few stable primary controls plus a clearly labeled presentation panel and optional annotation affordance. |
| Aggressive keyboard shortcut capture | Promises power-user speed. | Conflicts with browser, OS, and assistive-technology commands and can create traps or unexpected page turns while editing notes. | Preserve standard navigation; offer a small documented, context-aware shortcut set and never require shortcuts. |
| Automatic mode changes without preserving place | Lets the engine silently recover from difficult layouts. | Sudden spatial change is disorienting, especially for the target audience, and may appear as content loss. | Preserve the logical anchor, give a concise status, and keep an explicit way to retry or choose the mode. |
| Arbitrary-live-web extraction in the prototype | Makes the demo feel immediately useful on any URL. | Conflates extraction, CORS, authentication, paywalls, sanitization, and layout quality with the core reading-engine test. No parser is perfect. | Curated normalized fixtures now; extraction and extension packaging after layout/accessibility validation. |
| Accounts and real-time cloud sync | Delivers cross-device continuity. | Introduces identity, conflict resolution, privacy/security, backend, and offline synchronization before the local reading loop is proven. | Versioned local storage now; portable export/import, then opt-in sync later. |
| AI summaries, chat, recommendations, and discovery feed | Matches current product trends and appears to accelerate reading. | Adds cost, privacy, accuracy, editorial, and distraction risks; summary-first behavior conflicts with validating sustained calm reading. | Preserve authorial content and structural navigation; evaluate assistive transformations as separate, opt-in product hypotheses. |
| Speed-reading/RSVP as a core mode | Sounds like a measurable productivity benefit. | Removes spatial and structural context, conflicts with selection/annotation, and does not serve the stable-orientation wedge. | Prioritize page/scroll choice, adaptable measure, line focus, and later optional read-aloud. |
| Full-web rich content compatibility | Expands addressable content. | Tables, math, interactive embeds, applications, and arbitrary scripts create fundamentally different layout and accessibility problems. | Declare a rich long-form schema; retain source links and fall back cleanly for unsupported blocks. |
| Medicalized accessibility presets or efficacy claims | Gives settings an authoritative-sounding rationale. | Reader needs are individual; unsupported claims can mislead and stigmatize. | Describe observable presentation changes plainly and let users choose; validate presets with representative users. |

## Feature Dependencies

```text
[Normalized semantic document model]
    ├──requires──> [Representative saved-article fixtures]
    ├──enables───> [Semantic scroll renderer]
    ├──enables───> [Measured pagination]
    ├──enables───> [Structural navigation]
    └──enables───> [Stable text-based annotation anchors]

[Typography + settled font state] ──requires──> [Measurement invalidation/reflow]
[Measured pagination] ──requires──> [Non-text block measurement]
[Paginated mode] ──requires──> [Scroll fallback]

[Stable logical location]
    ├──enables───> [Resume reading]
    ├──enables───> [Mode-switch continuity]
    └──enables───> [Repagination continuity]

[Text selection model] ──enables──> [Highlights] ──enables──> [Attached notes]
[Versioned local persistence] ──requires──> [Stable article identity + schemas]

[Accounts/cloud sync] ──conflicts-with-prototype-focus──> [Local engine validation]
[Forced animation] ──conflicts-with──> [Reduced motion + immediate navigation]
[Page-number anchoring] ──conflicts-with──> [Responsive typography and repagination]
```

### Dependency Notes

- **Both renderers require one semantic model:** separate content trees invite mode-specific loss, divergent reading order, and annotation drift.
- **Pagination requires scroll fallback:** unsupported blocks, font uncertainty, zoom, or measurement failure must never make the article unreadable.
- **All persistence requires stable article identity and schema versioning:** otherwise fixtures, locations, settings, and annotations cannot evolve safely.
- **Highlights require layout-independent text selection:** page fragments and transient DOM nodes are presentation artifacts; combine normalized position with exact quote and context.
- **Mode switching and repagination require a shared logical location:** capture a nearby semantic/text anchor before relayout, then reveal and focus appropriately afterward.
- **Structural navigation precedes line focus:** line focus needs reliable block/line mapping and a way to reorient within the larger article.
- **Cloud sync follows local conflict semantics:** only add accounts after local annotation mutations, deletion, migration, and orphan handling are defined.

## MVP Definition

### Launch With (Prototype v1)

- [ ] Curated normalized article set covering every supported semantic block — validates the engine against representative long-form content.
- [ ] One accessible document model and semantic renderer — prevents page/scroll divergence.
- [ ] Equal-quality paginated and scrolling modes with explicit switch and scroll fallback — tests the core hypothesis without forcing it.
- [ ] Stable logical-location preservation across resize, settled fonts, typography changes, and mode switches — the main technical differentiator.
- [ ] Calm typography controls: font, size, line height/spacing, measure/margins, and limited themes — baseline personalization without a settings maze.
- [ ] Keyboard/pointer/touch navigation, semantic controls, visible focus, screen-reader reading order, zoom/reflow, contrast, and reduced-motion behavior — accessibility is a release gate.
- [ ] Local highlights and attached notes anchored to normalized text; create/edit/delete and return-to-passage — completes the local reading loop.
- [ ] Local persistence for preferences, logical position, annotations, and article identity — supports interruption and reopening.
- [ ] Original-source link, quiet metadata, explicit unsupported-content behavior, and observable pagination fallback — maintains provenance and trust.

### Add After Validation (v1.x)

- [ ] Heading/section navigator — add after semantic rendering and location mapping are stable.
- [ ] Optional line focus / reading ruler — add after both modes expose reliable line/block movement and test with keyboard/AT users.
- [ ] Annotation review panel plus orphan detection/repair — add once real anchoring failures reveal the right recovery UI.
- [ ] Named calm presets and richer theme controls — derive from user preference evidence, not assumptions.
- [ ] Portable local export/import — add when internal document and annotation schemas stabilize.
- [ ] Performance diagnostics available to testers — expose measurement/fallback reasons without cluttering the reader surface.

### Future Consideration (v2+ Product/Extension)

- [ ] Browser extension and live extraction — requires separate parsing, sanitization, permission, authentication, and failure-design research.
- [ ] Saved-article library, tagging, search, and offline cache management — product shell after the reading engine proves reliable.
- [ ] Optional read-aloud with synchronized highlighting — requires a dedicated accessibility and voice-control design phase.
- [ ] Accounts, encrypted cross-device sync, and conflict resolution — only after local ownership and schema semantics are mature.
- [ ] EPUB/PDF/newsletter/RSS inputs — different document models and ingestion paths should not dilute article-layout validation.
- [ ] Opt-in language/learning aids such as translation or picture dictionary — separate audience and evidence requirements.
- [ ] AI-derived aids — only as explicit, reversible, source-grounded features with privacy and accuracy evaluation.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Semantic article fidelity | HIGH | HIGH | P1 |
| Accessible dual-mode reading | HIGH | HIGH | P1 |
| Stable repagination/location mapping | HIGH | HIGH | P1 |
| Typography/theme controls | HIGH | MEDIUM | P1 |
| Keyboard/AT/zoom/reduced-motion support | HIGH | HIGH | P1 |
| Local highlights and notes | HIGH | HIGH | P1 |
| Local resume/preferences | HIGH | MEDIUM | P1 |
| Graceful scroll fallback | HIGH | MEDIUM | P1 |
| Structural navigator | HIGH | MEDIUM | P2 |
| Line focus | MEDIUM-HIGH | MEDIUM | P2 |
| Annotation repair UI | MEDIUM | HIGH | P2 |
| Export/import | MEDIUM | MEDIUM | P2 |
| Read aloud | MEDIUM-HIGH | HIGH | P3 |
| Extension/live extraction | HIGH for product | HIGH | P3 |
| Cloud sync | MEDIUM-HIGH | HIGH | P3 |
| AI summaries/chat | LOW for core wedge | HIGH | P3 / anti-feature for prototype |

**Priority key:** P1 validates this milestone; P2 extends the validated local reader; P3 belongs to a later product or a separate hypothesis.

## Competitor Feature Analysis

| Feature | Firefox Reader View | Safari Reader | Microsoft Immersive Reader | Instapaper / Readwise Reader | Lem Reader approach |
|---------|---------------------|---------------|-----------------------------|------------------------------|---------------------|
| Distraction-free article | Yes | Yes | Yes | Yes | Table stake; operate on curated normalized input in prototype. |
| Typography/theme | Extensive font, weight, width, line/character/word spacing, theme controls | Font, size, background | Size, spacing, column width, themes | Custom reading presentation | Focused set in v1 with locally persisted, accessible controls. |
| Read aloud | Yes when system TTS supports language | Not established as core Reader control in cited guide | Yes / reading aids | Yes | Defer to v2; protect layout/accessibility scope. |
| Line focus/learning aids | Not documented in cited Reader View guide | Not documented in cited Reader guide | One/three/five-line focus, picture dictionary, translation | Power-reading and annotation features vary | Line focus is the best v1.x cognitive-accessibility differentiator; other learning aids later. |
| Highlights/notes | Not a core feature in cited Reader View docs | Not a core feature in cited Reader guide | Not central to cited Edge guide | Core capability | Local, layout-independent highlights/notes are P1. |
| Offline/sync/library | Browser page feature | Browser page feature | Browser page feature | Established saved-reading products support offline/library/sync to varying degrees | Intentionally out of prototype; local fixture and persistence layer only. |
| Pagination plus scroll parity | No responsive-book pagination documented in cited guides | Presents article as one page | No pagination documented in cited guide | Primarily continuous reader experiences | Core differentiator: both modes, same semantics and state, stable place across changes. |

## Accessibility Acceptance Expectations

Treat these as feature acceptance criteria, not post-build polish:

- Every function is operable with keyboard alone, focus is visible, focus order follows the interface, and focus can always leave a component.
- Article semantics and reading order remain correct in both modes; visual page fragments do not become misleading landmarks or repeated headings for assistive technology.
- Text can resize and content can reflow without loss of information or function; at narrow widths or high zoom the reader may switch or offer scrolling while preserving place.
- System contrast/forced-color preferences remain usable; custom themes meet contrast needs and do not encode meaning by color alone.
- Motion is never required, autoplayed, or the only cue. Reduced-motion users receive immediate stable transitions.
- Controls are familiar, consistently placed, clearly named, and few in number; optional settings remain discoverable without competing with the article.
- User choices persist but remain reversible. Do not claim that one font, color, or pagination style is universally “accessible.”
- Selection, highlights, and notes work at zoom and across repagination; highlight styling does not obscure text, selection, focus, or forced-color behavior.
- Status messages (saved note, fallback, position restored) are concise and programmatically available where useful, without repeated announcements during ordinary page turns.
- Test with screen readers, keyboard-only navigation, browser zoom/reflow, forced colors/high contrast, reduced motion, touch, long articles, and representative cognitive-accessibility users before making preference or comprehension claims.

## Sources

Primary and official sources, checked 2026-07-26:

- [W3C — Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) — keyboard, focus, resize/reflow, motion, and related normative expectations.
- [W3C WAI — Limit Interruptions](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o5p01-minimal-interruptions/) — cognitive-accessibility rationale for removing distractions and user control over interruptions.
- [W3C WAI — Avoid Too Much Content](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o5p03-manageable-quantity/) and [Support Simplification](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o8p03-complexity/) — simple interfaces, fewer primary choices, optional features separated from critical paths.
- [W3C WAI — Support a Personalized and Familiar Interface](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o8p04-interface/) and [Use White Spacing](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p10-whitespace/) — presentation controls and calm visual organization.
- [W3C WAI — Help Users Focus](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o5-user-focus/) and [Break Media into Chunks](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p05-chunked-media/) — reorientation, headings, and logical navigation after distraction.
- [W3C — Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — authoritative `TextQuoteSelector` and `TextPositionSelector` concepts for layout-independent annotation targets.
- [Mozilla Support — Firefox Reader View](https://support.mozilla.org/en-US/kb/firefox-reader-view-clutter-free-web-pages) — current layout, font, spacing, theme, and read-aloud feature baseline.
- [Apple Support — Hide distractions when reading articles in Safari on Mac](https://support.apple.com/guide/safari/hide-distractions-when-reading-sfri32632/mac) — official Reader behavior, presentation controls, and long-article table of contents.
- [Microsoft Support — Use Immersive Reader in Microsoft Edge](https://support.microsoft.com/en-US/edge/use-immersive-reader-in-microsoft-edge) — text size/spacing/column/theme controls and line-focus/reading-preference aids.
- [Instapaper Docs — Read](https://www.instapaper.com/docs/read) and [Getting Started](https://www.instapaper.com/docs/getting-started/welcome) — current read-it-later baseline including themes, highlights/notes, offline access, listening, and optional speed reading.
- [Readwise Reader Docs — What is Reader?](https://docs.readwise.io/reader/docs) and [Highlights, Tags, and Notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes) — current saved-reader annotation, import breadth, and keyboard-based reading workflow.

---
*Feature research for: Lem Reader*
*Researched: 2026-07-26*
