# Contributing to Lem Reader

Thanks for taking the time to improve Lem Reader. Accessibility, predictable behavior, and honest failure handling are product requirements here—not cleanup work for later.

## Before you start

- Search [existing issues](https://github.com/wvanderen/lem-reader/issues) before opening a duplicate.
- For a bug, include the browser, viewport or zoom level, input format, and a minimal reproduction when possible.
- For a substantial feature or a change to the canonical document model, open an idea first so scope and accessibility tradeoffs can be discussed.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Local setup

Use Node.js 22 LTS and npm.

```bash
git clone https://github.com/wvanderen/lem-reader.git
cd lem-reader
npm ci
npm run dev
```

Create a focused branch, keep changes scoped, and add or update tests with behavioral changes.

## Quality checks

Run the checks relevant to your change before opening a pull request:

```bash
npm run lint
npm run lint:no-danger
npm run test:unit -- --run
npm run build
```

Pagination, selection, focus, zoom, reflow, or responsive UI changes should also run the relevant Playwright specs in all configured browser engines. The complete suite is available with `npm test`.

## Project guardrails

- Preserve semantic HTML and keep DOM reading order equal to document order.
- Keep paginated and scrolling modes available.
- Store durable locations and annotations as normalized source offsets—not page numbers, DOM nodes, or component paths.
- Sanitize at ingestion and render canonical blocks through React. Do not introduce `dangerouslySetInnerHTML`.
- Do not silently drop unsupported content or silently reattach an uncertain annotation.
- Honor visible focus, keyboard operation, browser zoom and reflow, and reduced-motion preferences.
- Keep user data local-first and maintain explicit migrations for persisted schema changes.

## Pull requests

A useful pull request explains the user-facing problem, the chosen approach, accessibility or security implications, and how the change was verified. Screenshots are helpful for visible changes; include narrow-width and high-zoom evidence when relevant.

By contributing, you agree that your contribution will be licensed under the project's [MIT License](LICENSE).
