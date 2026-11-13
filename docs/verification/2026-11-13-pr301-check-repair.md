# PR #301 check repair — 2026-11-13

## Scope and environment

- Branch: `fix/reading-experience-recovery`, initially `25d1fc57`.
- Worked only in the existing checkout `/home/lem/.t3/worktrees/lem-reader/fix-reading-experience--a2bbc10e0946ff8c`; no branch switches, other checkouts, delegates, CI routing changes, or budget changes.
- Preserved the pre-existing edits to `docs/specs/reading-experience-recovery.md` and `docs/verification/2026-11-12-reading-experience-investigation.md` byte-for-byte and left them uncommitted.
- Input: `/tmp/pr301-fail.log`, reference-Mac run `43502270292` (32 failures, plus first-attempt failures that passed on retry).
- Ran `mise exec -- npm ci`. Host doctor: Node 22.23.4, Chromium/Firefox ready; host WebKit launch-blocked as documented. The already-running rootless Docker endpoint was available at `unix:///run/user/1000/docker.sock`; container doctor passed for all three engines. No machine provisioning or system-library changes.
- All browser evidence below is Linux, not reference-Mac/Safari acceptance. Load was checked before long commands. The final affected matrix began at load 3.99/3.17/2.80; the isolated baseline performance comparison began at 2.85/4.47/3.78.

## Demonstrated causes and repairs

### Bounded-layout fixtures below the new admission bound

The existing giant-list open test failed locally: it expected percentage-only windowed orientation but got `1 of 287`. The source was admitted as a whole reading; its 2,000 items no longer exceeded the approved 256,000-grapheme whole-layout budget. The chapter-crossing and mixed-container fixtures had the same mismatch.

Raised the seam fixtures to 7,000 list items / mixed-container repetitions and 650 chapter paragraphs. Added explicit windowed-admission guards to the container tests. Retained percentage, bounded DOM, seam coverage, exact canonical coordinates, highlighting, restoration, numbering, overflow, and reflow assertions. This does not lower the product's admission bound or change its page ceiling.

### Redundant ResizeObserver measurement erased live page corrections

The oversized-note traversal reproduced intermittently in Firefox (4 failures out of 5 instrumented repetitions). The diagnostic trail showed replacement measurement publications amid live overflow corrections; a page's short continuation could be advanced past. ResizeObserver probes reported changing projection heights at an unchanged width of 328px. Its unconditional initial delivery also scheduled a second pass after immediate scope measurement.

The coalescer now schedules resize-driven line measurement only when the measured width changes. PaginatedSurface still owns viewport-height pagination, and explicit font-loading, image-load, and settings triggers are untouched. A new unit regression failed with two calls instead of one for the initial observer delivery, then passed with the repair. The instrumented Firefox traversal passed 5/5 after the change, and the unchanged no-omissions assertion passed in the final three-engine matrix. The footnote spec now attaches the content-free pagination trail on failure; temporary logging and content snapshots were removed.

### Route event lost between render and passive subscription

WebKit assignment tests failed before finding their article heading after reload plus same-document navigation. Instrumentation demonstrated initial render reading `#/`, followed by subscription at the chapter URL with no intervening handler invocation (5/5 failures in the repeated probe).

App now reconciles a changed hash immediately after installing its listener. Cold deep links retain their no-in-app-history behavior; legacy normalization is accounted for during StrictMode reconnection. A deterministic browser regression changes the URL at the render/subscription seam without a queued rescue event. It failed with reconciliation removed, then passed on all engines with it restored.

### Completion correction controls and focus return

The YouTube finished-state test reproduced its timeout waiting for the removed direct row toggle. Chaptered readings now intentionally use Reading status. Updated that test and the library strip-remount regression to use the approved dialog, retaining the completion/optimistic-action and same-DOM-node assertions; added reload persistence to the YouTube case.

ReadingStatusDialog had inferred its return target from `activeElement`, which need not be the pointer-activated button on Safari. The row now passes its actual opener through the library to the dialog. A cross-engine regression starts with focus on search, activates the unfocused opener, then requires Escape to return to that opener. It failed with the old activeElement inference and passed with the explicit target. Existing narrow-screen, modal inertness, keyboard, storage-failure recovery, and saved-position assertions remain intact.

### Long navigation glides and wheel-test overshoot

Once startup routing worked, WebKit exposed the scrolling completion case's next layer: Home/End suppression expired after a one-shot 250ms interval, although native navigation glides can last longer. Suppressed events now renew the quiet interval; fresh wheel/touch/pointer/step-key input releases it. A controlled 400ms navigation-stream regression failed with the renewal removed and passed after restoration, across all engines.

The original wheel test also sent another 600px input after a 120ms sleep while WebKit's preceding wheel animation was still in flight. That could legitimately traverse both the first chapter and its tiny successor before the asynchronous completion read. It now waits for actual scroll quiet and bounds the last wheel input at the first chapter's end. The exact one-chapter completion and collection-count assertions remain, with added empty-store assertions after Home.

## Verification

Commands run from the checkout with `mise exec --`; container commands additionally set `DOCKER_HOST=unix:///run/user/1000/docker.sock`.

- `npm run build` — passed (existing chunk-size/ineffective-dynamic-import warnings).
- `npm run lint` — passed, including security and pagination structural gates.
- `npm run test:unit -- --run tests/unit/measurement tests/unit/pagination tests/unit/collections tests/unit/library` — **675 passed**, 59 files.
- `npm run test:e2e:coverage` — passed: 3,203 PR cases / 3,285 exhaustive cases; every Chromium case retained. No engine opt-outs added.
- Final three-engine container affected run: startup routing; chapter assignments; completion; Reading status; book crossing; continuous reading; footnotes; giant containers; scope scheduling; measurement retention, staleness, and long-task smoke. **223 passed, 4 skipped, 1 failed** in 5.8 minutes. All 216 non-measurement functional cases passed. Four existing skips are the non-Chromium long-task API cells. The failure is the baseline Linux performance issue described below.
- Separate YouTube finished-state / library strip-remount / growing-note placement checks, three engines, three repetitions, three workers: **27/27 passed**.
- `npm run test:e2e:container -- --config=playwright.measurements.config.ts --reporter=line` — **7/7 passed**: calibration sampling in all engines and perf sampling in all engines plus throttled Chromium. These are sampling results only; did not run reference comparators or rewrite committed fingerprints/budgets.
- `git diff --check` passed; no temporary debug/probe markers remain.

Selected reproducible loops:

```sh
mise exec -- npx playwright test tests/e2e/pagination/giant-containers.spec.ts --project=chromium -g 'a giant numbered list opens' --reporter=line
mise exec -- npx playwright test tests/e2e/pagination/footnotes.spec.ts --project=firefox -g 'oversized note' --repeat-each=5 --workers=1 --reporter=line
mise exec -- npx playwright test tests/e2e/chrome/startup-routing.spec.ts tests/e2e/collections/reading-status.spec.ts --project=chromium -g 'between initial|activation did not focus' --reporter=line
mise exec -- npx playwright test tests/e2e/collections/completion.spec.ts --project=chromium -g 'longer than the suppression' --reporter=line
```

Full local logs remain under `/tmp/pr301-*.log`; container logs are also in ignored `.container-e2e/logs/`. Principal logs: `/tmp/pr301-affected-final.log`, `/tmp/pr301-state-final.log`, `/tmp/pr301-units.log`, `/tmp/pr301-calibration-perf.log`.

## Outstanding concerns and limits

- The local Chromium giant-article long-task assertion remains red: 431ms in the shared affected run and 413ms with one worker, against its unchanged 250ms limit. Temporarily reversed only this session's source patch, verified `git diff --quiet -- src`, and ran the same one-worker container test at the original PR head: **411ms, same assertion**. Reapplied the source patch immediately. This demonstrates that this local failure predates these repairs; it is not proof of reference-platform budget acceptance. Logs: `/tmp/pr301-longtask-isolated.log` and `/tmp/pr301-longtask-head-baseline.log`. Do not weaken the assertion or move reference budgets on this evidence.
- An earlier host Firefox repetition crashed before the library test reached the application. A separate WebKit quotation restoration run once timed out despite a rendered page; its targeted three repetitions and final affected matrix passed. Neither has a demonstrated independent cause; no assertions or timeouts were relaxed for them.
- The original reference Firefox growing-note placement failure did not reproduce in the repeated final checks. It is covered by the 27-pass repetition, but a specific cause for that original occurrence is not claimed.
- Full PR/reference-Mac functional and performance conclusions belong to CI after push. Parent is responsible for watching the PR; this session does not start a watch or claim the pending gate is green.
