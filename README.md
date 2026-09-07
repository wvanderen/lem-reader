# Lem Reader

**A calm, booklike reader for web articles and documents.**

[![MIT License](https://img.shields.io/badge/license-MIT-315c55.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-315c55.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-315c55.svg)](https://www.typescriptlang.org/)

Lem Reader turns articles, Markdown, PDFs, and EPUBs into a focused personal reading library. It is designed for readers who benefit from reduced distraction, stable spatial orientation, predictable navigation, and presentation controls that stay out of the prose.

The project began as an experiment in accessible browser pagination: can a responsive web reader feel like a book without giving up semantic HTML, keyboard access, text selection, or a scrolling alternative? It has since grown into a local-first library with highlights, notes, robust ingestion, and versioned export/import.

> Lem Reader is a portfolio project and active prototype, not a managed reading or backup service.

## Live demo

Explore the production build at **[lem-reader.vercel.app](https://lem-reader.vercel.app/)**. The library is stored locally in your browser, so you can read the included guide, add public content, change reading settings, highlight passages, and export your library without creating an account.

Export your library before clearing site data, and do not rely on the demo deployment as the only copy of important material.

## What it does

- Imports URLs, pasted HTML or Markdown, PDF files, and EPUB books through one normalized document model.
- Offers both responsive paginated reading and a clean scrolling view.
- Preserves reading position across sessions and layout changes using canonical text offsets rather than fragile page numbers.
- Supports highlights, notes, cross-block selections, tags, search, reading states, and a cross-library Highlights view.
- Keeps the library, settings, positions, annotations, and staged images in the browser with IndexedDB.
- Exports and imports a versioned portable library bundle—no account required.
- Respects keyboard navigation, visible focus, browser zoom and reflow, screen readers, reduced motion, and reader-selected typography.
- Refuses unsupported or unsafe input with a visible reason instead of silently producing broken content.

## Why the implementation is interesting

Lem Reader deliberately avoids canvas-rendered prose and CSS columns as its sole pagination mechanism. The article remains semantic DOM in document order. A project-owned layout engine measures normalized blocks, predicts safe breaks, renders source-offset fragments, and checks the result for overflow. When pagination cannot remain trustworthy, the reader falls back to scrolling without losing the reader's location or annotations.

The same normalized document model is also the security boundary. Remote ingestion blocks private, loopback, link-local, and cloud-metadata targets; caps redirects and payload sizes; sanitizes markup once; stages safe image assets locally; and never renders content with `dangerouslySetInnerHTML`.

```text
URL / HTML / Markdown / PDF / EPUB
                │
                ▼
     guarded ingestion + validation
                │
                ▼
      canonical document model
         ┌──────┴──────┐
         ▼             ▼
  scrolling DOM   pagination engine
         │             │
         └──────┬──────┘
                ▼
 IndexedDB library + source-offset annotations
```

## Run it locally

Requirements: Node.js 22 LTS (Node 20.19+ also satisfies Vite's runtime requirement) and npm.

```bash
git clone https://github.com/wvanderen/lem-reader.git
cd lem-reader
npm ci
npm run dev
```

Open `http://localhost:5173`. A Getting Started article is included, so the reading experience is available immediately. URL ingestion uses the Vite development server's same-origin Node middleware. The broader published-article corpus remains in the repository for layout and browser regression coverage but is not shown in a fresh library.

## Useful commands

| Command                      | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `npm run dev`                | Start the local Vite app and ingestion endpoint   |
| `npm run build`              | Type-check and create a production build          |
| `npm run preview`            | Preview the production build locally              |
| `npm run test:unit -- --run` | Run the Vitest suite once                         |
| `npm run test:e2e`           | Run real-browser Playwright tests                 |
| `npm run lint`               | Run ESLint                                        |
| `npm run lint:no-danger`     | Enforce the no-`dangerouslySetInnerHTML` boundary |
| `npm run perf`               | Run the browser performance budget harness        |
| `npm run deploy:vercel`      | Build and deploy the linked Vercel project        |

Playwright tests require its browser binaries. Install them once with `npx playwright install` if they are not already present.

## Production deployment

The public demo is hosted on Vercel. [`vercel.json`](vercel.json) runs `npm run build` and publishes `dist`. The build also creates a self-contained Node function at `/api/ingest`, allowing production to use the same validated ingestion pipeline as local development.

To deploy your own fork:

```bash
npm ci
npx vercel login
npm run deploy:vercel
```

The first deployment links the checkout to a Vercel project and writes machine-specific configuration to the gitignored `.vercel/` directory. Confirm the returned production URL, then test both the SPA and at least one URL ingestion.

Vercel applies a request-body ceiling before application code runs. Binary PDF or EPUB uploads above roughly 3.4 MB decoded may reach the platform's 4.5 MB request limit after base64/JSON encoding and return the app's calm server-error state. Supporting larger uploads requires a direct blob-upload path rather than raising Lem Reader's own ingestion limit.

## Project map

| Area                                           | Location                                      |
| ---------------------------------------------- | --------------------------------------------- |
| Application shell and routes                   | `src/App.tsx`, `src/routes/`                  |
| Canonical content model and semantic renderers | `src/content/`                                |
| Measurement and pagination                     | `src/measurement/`, `src/pagination/`         |
| Ingestion and SSRF/XSS defenses                | `server/`, `src/ingestion/`                   |
| IndexedDB persistence                          | `src/persistence/`                            |
| Highlights and notes                           | `src/annotations/`, `src/reader/annotations/` |
| Versioned export/import                        | `src/portability/`                            |
| Browser and accessibility tests                | `tests/e2e/`                                  |

The app is a React + TypeScript SPA built with Vite. Dexie owns the IndexedDB boundary, Zod validates persisted and ingested data, and Playwright provides authoritative layout and accessibility coverage across Chromium, Firefox, and WebKit.

## Scope and limitations

Lem Reader targets long-form publishing: prose, headings, links, quotations, lists, figures and captions, footnotes, and code blocks. It does not aim for full-web fidelity; tables, math, interactive embeds, and arbitrary page scripts are intentionally outside the current content model.

PDF extraction works best on text-based, single-column documents. Scanned or structurally ambiguous PDFs may be refused rather than imported incorrectly. Because data is local-first, clearing browser storage removes the library unless it has been exported first.

## Feedback and contributing

Found a rough edge or have an idea? [Share feedback](https://github.com/wvanderen/lem-reader/issues/new/choose). Please use [GitHub's security advisory flow](https://github.com/wvanderen/lem-reader/security/advisories/new) for vulnerabilities rather than opening a public issue.

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and quality expectations.

## License

Lem Reader is available under the [MIT License](LICENSE).
