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

The blocking e2e gate (`e2e-reference`) runs on a self-hosted runner on the reference machine — the 10-core macOS arm64 box the suite's timeouts, longtask budgets, and geometry assertions are calibrated against. The job's `runs-on` pins the runner-specific `reference` label, so only that machine can supply reference evidence: a different macOS machine carrying only the default `self-hosted`/`macOS` labels cannot accidentally pick the job up. GitHub-hosted runners cannot run it either (shared-CPU noise fails ~50 calibrated spec sites per engine, independent of OS; those jobs run as non-blocking evidence with warning annotations).

To set up the runner on a new reference machine (one-time, repo Settings → Actions → Runners also works via UI):

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -L -o runner.tar.gz <latest actions-runner-osx-arm64 release tarball>
tar xzf runner.tar.gz
./config.sh --url https://github.com/wvanderen/lem-reader --token <registration token> --name lem-reference --labels macOS,reference --unattended
./svc.sh install && ./svc.sh start
```

The `reference` label in `--labels` is required — the `e2e-reference` job queues forever without a runner carrying it. Adding the label to an already-registered runner does not require re-registration:

```bash
gh api -X POST repos/wvanderen/lem-reader/actions/runners/<runner-id>/labels -f 'labels[]=reference'
```

### Runner health check

```bash
gh api repos/wvanderen/lem-reader/actions/runners --jq '.runners[] | {id, name, status, labels: [.labels[].name]}'
```

Healthy means: `lem-reference` listed with `status: "online"` and the `reference` label among its labels (repo Settings → Actions → Runners shows the same). If the label is missing, add it with the API call above; if the runner is `offline`, restart the service.

### Restarting the runner service

The runner runs as a launchd service; restart it when the machine reboots into a state where the runner did not reconnect, or after network changes:

```bash
cd ~/actions-runner
./svc.sh stop
./svc.sh start
```

### Recognizing an offline-queued job

If `e2e-reference` sits in **Queued** and `lem-reference` is absent from (or offline in) the runners list, the machine is disconnected and the job is held by design — it starts automatically when the runner reconnects. Do not widen `runs-on` to shared runners to unblock it; reference evidence only counts from the reference machine. With a single runner, `e2e-reference` jobs also serialize across PRs — expected for a personal repo.

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
