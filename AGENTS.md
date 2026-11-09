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

Before changing CI runner routing, isolation, or reference budgets, read the [approved Lemcentre migration plan](docs/specs/lemcentre-ci-migration.md). Implementation and cutover are pending; the Mac remains authoritative until its acceptance gates pass.

Two hosts, never conflated: development checkouts run on the shared Linux box (concurrent agent sessions common); the CI reference runner is a separate Mac (`lem-reference`) that runs the PR Playwright gate, nightly exhaustive coverage — and sometimes local heavy sessions. Check `uptime` before long test commands (above load ~6 expect 2–3x e2e inflation; do not read slowness as a regression), and on the Mac `npm run lease:status` for lease ownership + load. Heavy commands on the Mac hold the heavy-test lease. Use targeted local specs; CI's `e2e-reference` gate owns comprehensive PR verification. CI-repair/debug sessions: red-capable loop and evidence-trail pointers in `docs/agents/test-discipline.md` (plus the `diagnosing-bugs` skill when installed). Details: `docs/agents/test-discipline.md`.

Machine setup — the repo-local Node 22 pin, the runtime preflight, the environment doctor, per-worktree e2e server isolation, and the container three-engine lane (WebKit on Linux) — is documented in `docs/setup.md`. A fresh session starts there: `npm ci`, then `npm run doctor`; expensive scripts are gated by the Node 22 preflight, and three-engine runs go through `npm run test:e2e:container`.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`wvanderen/lem-reader`), used via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles with default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Agent-tooling installs

Installing third-party skills/hooks/agents into this repo: explicit scope, reviewed working-tree changes, vendored tooling kept out of product source. See `docs/agents/agent-tooling-installs.md`.
