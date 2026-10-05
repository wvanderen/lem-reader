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
npm run lint           # ESLint + the no-dangerouslySetInnerHTML gate
npm run format:check
npm run typecheck
npm run test:unit -- --run
npm run build
```

CI runs these same checks plus the Playwright suite on every pull request; the performance budget harness runs non-blocking until its thresholds are re-baselined for CI hardware. Pagination, selection, focus, zoom, reflow, or responsive UI changes should still run the relevant Playwright specs in all configured browser engines locally. The complete suite is available with `npm test`.

## CI runners

The blocking e2e gate (`e2e-reference`) runs on a self-hosted runner on the reference machine — the 10-core macOS arm64 box the suite's timeouts, longtask budgets, and geometry assertions are calibrated against. GitHub-hosted runners cannot run it (shared-CPU noise fails ~50 calibrated spec sites per engine, independent of OS; those jobs run as non-blocking evidence with warning annotations).

To set up the runner on a new reference machine (one-time, repo Settings → Actions → Runners also works via UI):

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -L -o runner.tar.gz <latest actions-runner-osx-arm64 release tarball>
tar xzf runner.tar.gz
./config.sh --url https://github.com/wvanderen/lem-reader --token <registration token> --name lem-reference --labels macOS --unattended
./svc.sh install && ./svc.sh start
```

While the runner is offline the e2e-reference job queues and runs when the machine next connects; with a single runner, e2e-reference jobs serialize across PRs.

## Project guardrails

- Preserve semantic HTML and keep DOM reading order equal to document order.
- Keep paginated and scrolling modes available.
- Store durable locations and annotations as normalized source offsets—not page numbers, DOM nodes, or component paths.
- Sanitize at ingestion and render canonical blocks through React. Do not introduce `dangerouslySetInnerHTML`.
- Do not silently drop unsupported content or silently reattach an uncertain annotation.
- Honor visible focus, keyboard operation, browser zoom and reflow, and reduced-motion preferences.
- Keep user data local-first and maintain explicit migrations for persisted schema changes.
- When two surfaces intentionally compose the same reader copy (today the article view and the Add dialog's saved-result card), keep the small render clones beside their own dialog grammar; promote to a shared component only when a third surface appears.

## Pull requests

A useful pull request explains the user-facing problem, the chosen approach, accessibility or security implications, and how the change was verified. Screenshots are helpful for visible changes; include narrow-width and high-zoom evidence when relevant.

By contributing, you agree that your contribution will be licensed under the project's [MIT License](LICENSE).
