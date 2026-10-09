## Project

**Lem Reader**

Lem Reader is a calm, booklike reader for web articles and documents, designed for accessibility users—especially readers who benefit from reduced distraction, stable spatial orientation, and predictable navigation—that presents normalized long-form content in either responsive pages or a clean scrolling view.

**Shipped v1.0:** a saved-article prototype proving web content can be repaginated quickly and reliably without sacrificing semantic HTML, keyboard access, reduced-motion behavior, or reader choice. **Shipped v2.0:** a bring-your-own personal library — URL/HTML/Markdown/PDF/EPUB ingestion through one SSRF/XSS-guarded pipeline, a local-first library, versioned export/import, and a cross-library annotation review panel, with the v1.0 reading-engine guarantees holding unchanged for every ingested format.

**Core Value:** Readers can move through long-form web content with calm, stable orientation and predictable navigation.

### Constraints

- **Content scope**: Text, headings, links, quotations, lists, images, captions, footnotes, and code blocks — rich long-form publishing, not full-web compatibility (tables/math/embeds excluded).
- **Reading modes**: Paginated and scrolling modes must both remain available — accessibility and reader preference take precedence over enforcing pagination.
- **Accessibility**: Semantic HTML, keyboard navigation, screen-reader compatibility, zoom, visible focus, and reduced motion are foundational.
- **Persistence**: Reading position, highlights, notes, library, and preferences are local-first — cross-device via versioned export/import, not accounts.
- **Security**: The canonical document model is the security boundary — sanitize once at ingest, never `dangerouslySetInnerHTML`; ingestion refuses private/internal/cloud-metadata endpoints (SSRF) and caps sizes/redirects.
- **Honesty**: No silent garbage — content that can't be fully processed is admitted with visible limits and a link to the original, or refused calmly when there is nothing reliable to show; annotations never silently re-attach.
- **Performance**: Repagination must feel responsive and remain stable after fonts settle — enforced by a user-approved CI budget.

## Stack

Full stack rationale — recommended technologies, browser primitives, alternatives considered, what NOT to use, version compatibility — lives in **`docs/stack.md`**. Reach for it before adding a dependency, bumping a version, or choosing build/test tooling.

Always-live conventions (details in `docs/stack.md`):

- Client-only React 19 + Vite 8 SPA mounted with `createRoot`; no SSR framework, no server runtime.
- TypeScript strict; `tsc` is the authority for unused/undefined references (see `eslint.config.js` for the TS 7 parser note). Node 22 LTS.
- Semantic HTML + authored CSS custom properties; no Tailwind or component suite.
- Pin `@chenglou/pretext` exactly (pre-1.0); use it only behind the TextMeasurer adapter.
- Dexie for IndexedDB behind a repository interface; no Dexie Cloud.
- Playwright across Chromium/Firefox/WebKit owns layout truth; DOM emulators never do.

> **Note:** GSD was removed on 2026-09-12. The former `/gsd-*` workflow commands no longer exist; legacy planning artifacts are frozen in `.planning/` (see `.planning/DEPRECATED.md`).

## Test discipline

This machine is shared — it also runs this repo's CI runner (full Playwright suite per PR/push) and often concurrent agent sessions. Check `uptime` before long test commands; above load ~6 expect 2–3x e2e inflation and do not read slowness as a regression. Iterate with targeted specs, full suite once per task; with a PR open, CI's `e2e-reference` gate owns full-suite evidence. Details: `docs/agents/test-discipline.md`.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`wvanderen/lem-reader`), used via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles with default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
