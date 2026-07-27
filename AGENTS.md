<!-- GSD:project-start source:PROJECT.md -->

## Project

**Lem Reader**

Lem Reader is a calm, booklike reader for web articles. Its first artifact is a saved-article prototype for accessibility users—especially readers who benefit from reduced distraction, stable spatial orientation, and predictable navigation—that presents normalized long-form content in either responsive pages or a clean scrolling view.

The prototype will support rich article structure, local highlights and notes, and location restoration while testing whether web content can be repaginated quickly and reliably without sacrificing semantic HTML, keyboard access, reduced-motion behavior, or reader choice.

**Core Value:** Readers can move through long-form web content with calm, stable orientation and predictable navigation.

### Constraints

- **Prototype input**: Use a curated set of saved, representative articles — separates reading-engine validation from extraction variability.
- **Content scope**: Support text, headings, links, quotations, lists, images, captions, footnotes, and code blocks — enough to represent rich long-form publishing without claiming full-web compatibility.
- **Reading modes**: Paginated and scrolling modes must both remain available — accessibility and reader preference take precedence over enforcing pagination.
- **Accessibility**: Semantic HTML, keyboard navigation, screen-reader compatibility, zoom, visible focus, and reduced motion are foundational — the initial audience depends on predictable and adaptable interaction.
- **Persistence**: Reading position, highlights, and notes are local-first — avoids premature account and sync infrastructure.
- **Performance**: Repagination must feel responsive and remain stable after fonts settle — visible layout churn would undermine the product's core promise.
- **Validation**: Initial success is technical reliability on representative articles — formal preference, comprehension, and completion studies are later validation work.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React + React DOM | 19.2.8 | Reader shell, controls, semantic article renderer, mode switching | React is mature, accessible when native elements are used, and well suited to keeping a single normalized document model while rendering paginated and scrolling views. This is a client-only prototype, so mount with `createRoot`; do not add an SSR framework. |
| TypeScript | 7.0.2 | Document model, pagination contracts, selector/annotation types | Pagination failures tend to be boundary/data-shape failures. Strict TypeScript makes block kinds, measurement results, page fragments, and persistent schema migrations explicit. |
| Vite + `@vitejs/plugin-react` | 8.1.5 + 6.x | Development server and static production build | Vite 8 is the current stable line and uses Rolldown; the official React plugin v6 uses Oxc for React Refresh. It produces a simple static app without introducing a server runtime. Requires Node 20.19+ or 22.12+; use Node 22 LTS for development/CI. |
| Semantic HTML + modern CSS | Browser platform | Accessible reading surface and scrolling mode | Render headings, paragraphs, links, lists, figures/captions, blockquotes, code, and footnotes as their corresponding native elements. CSS custom properties are sufficient for theme and typography controls. Keep DOM reading order equal to document order. |
| Project-owned pagination engine | Internal module, versioned contract | Break normalized blocks into viewport-sized page fragments | No library in the reviewed stack supplies the required combination of rich semantic DOM, responsive repagination, annotation-safe source offsets, non-text measurement, and fallback behavior. Treat pagination as domain logic with deterministic inputs and observable failure/fallback results. |

### Browser Primitives (Prefer Over Dependencies)

| Primitive | Purpose | Required usage |
|-----------|---------|----------------|
| `document.fonts` / `FontFaceSet.ready` | Font readiness and invalidation | Do not accept pagination as stable until the active fonts settle. Repaginate when the font set or typography settings change. |
| `ResizeObserver` | Reader viewport/content-box changes | Observe the page viewport, debounce/coalesce changes, and cancel stale pagination work. |
| `CanvasRenderingContext2D.measureText()` | Text width metrics | Used directly or through Pretext; never assume canvas height alone equals the browser's final rich-block height. |
| `Intl.Segmenter` | Locale-aware word/grapheme boundaries | Useful for robust source offsets and line-break preparation; keep canonical annotation offsets in normalized text, not Pretext cursors. |
| Selection/Range APIs | Capture user selections | Convert ephemeral DOM ranges immediately into durable normalized-text selectors. Do not persist DOM nodes, XPath-only anchors, or page numbers. |
| IndexedDB | Local articles, settings, position, highlights, notes | Access through Dexie for transactions, indexes, schema upgrades, and testable persistence boundaries. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Dexie | 4.4.4 | Typed IndexedDB access and schema migrations | Use for saved normalized articles, preferences, reading locations, highlights, and notes. Keep storage behind a repository interface so tests can substitute an in-memory implementation. Do not add Dexie Cloud in this milestone. |
| Zod | 4.4.3 | Runtime validation plus inferred TypeScript types | Validate every saved article fixture and persisted record at the boundary. This prevents malformed rich content from becoming a pagination bug. |
| `@chenglou/pretext` | 0.0.8, pin exact | Fast, DOM-free text preparation and repeated line/height calculation | Use only behind a `TextMeasurer` adapter for plain paragraph-like text after fonts are ready. Its `prepare`/`layout` APIs cache canvas-measured segments and can cheaply recompute at new widths. Validate predicted breaks/heights against rendered DOM across the representative corpus before making it the primary fast path. |
| React Testing Library | 16.3.2 | Semantic component/interaction tests | Query by role, label, and visible text to test controls and native structure. Install its required `@testing-library/dom` peer. |
| Vitest | 4.1.10 | Unit/property-style tests | Test normalization, selector round-trips, pagination invariants, fallback policy, and persistence migrations. Use a DOM emulator only for UI glue; it is not authoritative for layout. |
| Playwright Test | 1.61.1 | Real-browser integration and layout regression tests | Required for pagination because Chromium, Firefox, and WebKit own the actual layout, font, focus, selection, and zoom behavior. Run the representative article/viewport/typography matrix. |
| `@axe-core/playwright` | 4.12.1 | Automated accessibility checks in real browsers | Run on the library, scrolling reader, paginated reader, settings, annotations, and error/fallback states. Axe reports only automatable issues; retain manual keyboard and screen-reader checks. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint | Correctness and accessibility-adjacent static checks | Use current stable ESLint with TypeScript and React Hooks rules. Static linting supplements, not replaces, semantic/browser tests. |
| Prettier | Stable formatting | Keep formatting mechanical; avoid a CSS framework formatter dependency. |
| Playwright trace + screenshots | Diagnose cross-browser pagination drift | Capture page count, source-offset boundaries, overflow state, fonts, viewport, and screenshots when a corpus case fails. |
| Static hosting | Deploy prototype | Any HTTPS static host is enough. No API server, authentication service, or database server is needed. |

## Pretext.js Decision

## Installation

# Runtime (pin Pretext exactly while it remains pre-1.0)

# Build and types

# Tests and accessibility

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| React + Vite SPA | Vanilla TypeScript/Web Components | Choose only if minimizing framework code is a stronger goal than rapid accessible UI iteration and familiar test ergonomics. It does not remove the custom pagination work. |
| React + Vite SPA | Next.js / React Router framework mode | Use when the product gains server rendering, authenticated routes, remote ingestion, or backend APIs. Those concerns are explicitly outside this prototype. |
| Project-owned pagination | Paged.js / Vivliostyle | Use for print/PDF-oriented CSS Paged Media documents where generated content, named pages, print footnotes, and export fidelity dominate. Lem Reader needs interactive responsive repagination, local annotations, and an always-available scrolling twin. |
| Explicit page fragments rendered semantically | CSS multi-column (`columns`) | Use columns for magazine-like visual flow without strict page-boundary ownership or durable source-position navigation. It is not the primary engine here. |
| Dexie | Raw IndexedDB | Use raw IndexedDB only if dependency minimization outweighs migration, transaction, query, and error-handling ergonomics. |
| W3C-inspired internal selectors | `dom-anchor-text-quote` or a full annotation framework | Consider a selector helper after the internal normalized-text contract is proven. A framework does not remove normalization and re-anchoring policy. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Create React App | React officially deprecated it for new applications in 2025. | Vite 8 static SPA. |
| Canvas/SVG as the article renderer | It discards native semantic reading order, selection, links, zoom behavior, and straightforward screen-reader access. | Semantic DOM; use canvas metrics only for prediction. |
| CSS columns as the sole pagination engine | Browser fragmentation owns boundaries, complicating explicit page models, stable location mapping, overflow detection, and predictable focus/navigation. | Internal source-offset page fragments rendered as semantic DOM. |
| Page-number annotation/location anchors | Page numbers change with viewport, font, spacing, zoom, and content measurement. | Canonical normalized-text offsets plus TextQuote context; derive page number each layout. |
| Persisted DOM `Range`, XPath-only, or React component paths | DOM identity is ephemeral and structure changes between modes/repagination. | W3C-inspired `TextPositionSelector` + `TextQuoteSelector` over normalized text. |
| Redux/Zustand/XState at project start | Reader UI state is modest; another global state abstraction obscures the important document/layout/persistence boundaries. | React state/context plus explicit domain services; add a state machine only if measured interaction complexity warrants it. |
| Tailwind or a component suite as a foundation | The reading surface depends on carefully controlled semantic markup, typography variables, focus states, print-like geometry, and minimal CSS churn; a design system adds little to the core experiment. | Small authored CSS layers and native controls. |
| DOM emulators for pagination truth | jsdom/happy-dom do not implement authoritative browser layout and font metrics. | Playwright in Chromium, Firefox, and WebKit. |
| Automatic hyphenation assumed through Pretext | Pretext explicitly does not provide automatic hyphenation. Browser `hyphens:auto` behavior and dictionaries also vary. | Defer hyphenation for MVP or insert conservative locale-aware soft hyphens and validate browser parity. |

## Stack Patterns by Variant

- Render the complete normalized document once as semantic DOM.
- Use a canonical normalized-text offset for restoration; map it to DOM only at render time.
- Apply typography/theme via CSS custom properties shared with paginated mode.
- Compute page fragments as source ranges over the same normalized document.
- Render only complete semantic blocks where possible; when text must split, preserve source offsets and accessible reading order.
- Use Pretext only to predict eligible text blocks, DOM measurement for non-text/rich blocks, and a post-render overflow guard.
- Report a structured pagination failure reason.
- Preserve the reader's canonical location and switch to the scrolling renderer without losing annotations.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Vite 8.1.5 | Node 20.19+ or 22.12+; `@vitejs/plugin-react` 6.x | Prefer Node 22 LTS. Plugin v5 also works, but v6 is the current Vite 8 companion. |
| React/React DOM 19.2.8 | `@testing-library/react` 16.3.2 | Keep React and React DOM on identical versions. RTL 16 requires `@testing-library/dom`. |
| Vitest 4.1.10 | Vite 8.x | Current stable Vitest supports the Vite 8 line; do not adopt Vitest 5 beta for the prototype baseline. |
| Playwright 1.61.1 | `@axe-core/playwright` 4.12.1 | Pin browsers through the Playwright lockfile/package version and run all three engines in CI. |
| `@chenglou/pretext` 0.0.8 | Modern browsers with Canvas and `Intl.Segmenter` | Pre-1.0: pin exact, wrap the API, and verify against real DOM/browser corpus tests before promotion. |
| Dexie 4.4.4 | Browser IndexedDB | Version and migrate the local schema from the first release; do not store derived page boundaries. |

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| React/Vite/TypeScript baseline | HIGH | Current official release pages, npm metadata, and official Vite compatibility documentation. |
| Local persistence and validation | HIGH | Current official package metadata/docs and stable browser IndexedDB platform. |
| Real-browser/accessibility testing | HIGH | Official Playwright/Deque/Testing Library packages and documented limitations of automated checks. |
| Pretext capability | HIGH | Official repository README/API and package metadata. |
| Pretext suitability for production pagination | MEDIUM | Capability is verified, but correctness for this content/style/cross-browser corpus is a project-specific empirical question. |
| Rejection of an off-the-shelf full pagination library | MEDIUM | Based on the project's interaction/semantic constraints and current tool scopes; re-check if later phases add print/PDF export. |

## Sources

- [React versions](https://react.dev/versions) and [React 19.2 release](https://react.dev/blog/2025/10/01/react-19-2) — current stable family and official release status (HIGH).
- [React: Sunsetting Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app) — CRA deprecation and Vite as a supported build-tool path (HIGH).
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) and [Vite 8.1 announcement](https://vite.dev/blog/announcing-vite8-1) — stable architecture, Node requirements, and React plugin v6 (HIGH).
- [Vite npm package](https://www.npmjs.com/package/vite) — 8.1.5 current package version on research date (HIGH).
- [TypeScript npm package](https://www.npmjs.com/package/typescript) — 7.0.2 current stable version (HIGH).
- [Dexie npm package](https://www.npmjs.com/package/dexie) and [Dexie docs](https://dexie.org/docs/) — 4.4.4, IndexedDB wrapper scope, schema/persistence APIs (HIGH).
- [Zod npm package](https://www.npmjs.com/package/zod) — 4.4.3 and runtime schema validation/type inference (HIGH).
- [Pretext official repository](https://github.com/chenglou/pretext), [package metadata](https://raw.githubusercontent.com/chenglou/pretext/main/package.json), and [official demo/API site](https://pretextjs.dev/) — 0.0.8 API, canvas measurement model, rich-inline and hyphenation limitations (HIGH for capability; MEDIUM for project fit).
- [W3C Web Annotation Data Model: selectors](https://www.w3.org/TR/annotation-model/#selectors) — standard Text Quote and Text Position selector concepts (HIGH).
- [MDN: CSS multicol layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_multicol_layout) and [MDN: CSS fragmentation](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fragmentation) — browser-controlled column fragmentation model (HIGH for platform behavior; project-fit conclusion is MEDIUM inference).
- [Vitest npm package](https://www.npmjs.com/package/vitest) — 4.1.10 stable (HIGH).
- [Playwright Test npm package](https://www.npmjs.com/package/@playwright/test) and [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) — 1.61.1 and real-browser axe integration pattern (HIGH).
- [React Testing Library npm package](https://www.npmjs.com/package/@testing-library/react) — 16.3.2, React peer range, semantic testing approach (HIGH).
- [`@axe-core/playwright` npm package](https://www.npmjs.com/package/@axe-core/playwright) and [axe-core npm package](https://www.npmjs.com/package/axe-core) — 4.12.1 and documented automated-coverage limits (HIGH).

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
