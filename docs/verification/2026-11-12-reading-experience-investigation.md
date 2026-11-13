# Reading-experience regression investigation — 2026-11-12

Investigation authorized by the reader after the design interview in [reading-experience recovery](../specs/reading-experience-recovery.md). The investigation sections below record the pre-fix evidence. The reader subsequently approved implementation, including the proposed Reading status dialog placement; see [Implementation and local verification](#implementation-and-local-verification).

## Conclusions

1. **A demonstrated cause of periodic slow turns is the 400 ms measurement debounce being paid at internal layout-window crossings.** Reducing only that debounce in a browser-served module changes the delay proportionally. Disabling page-turn animation does not remove it.
2. **The supplied article is being windowed despite having supported whole-article pagination previously.** On the tested desktop settings it lays out at approximately 75–79 pages through the earlier/full-layout paths, below the unchanged 300-page ceiling. This supports reevaluating admission policy, not raising the ceiling or forcing every work through full layout.
3. **Percentage-only orientation is reproduced on the locally available `origin/main`.** The starting branch is older in this area and still displays scoped numeric page counts. The distinction matters: an initial failure to reproduce the percentage on the starting branch was not evidence against the reader's report.
4. ToC completion actions remain present on both revisions. Their removal and relocation are still proposed product work.

## Environment and privacy

- Linux development host, Node v22.23.4 via `mise exec`, project dependencies installed with `npm ci`; doctor verified host Chromium and Firefox launches.
- Single test worker, targeted probes, no retries or comprehensive suites. Representative load averages during the investigation ranged roughly 1.7–5.2 (one-minute); no reference-Mac budgets were sampled or changed.
- **Not macOS, Zen, or Helium validation.** Playwright's bundled Linux Chromium/Firefox establish a shared code-path reproduction, not physical-display smoothness or recovery on the reported Mac.
- Affected article: `[Classics] Ludwig Feuerbach and the End of Classical German Philosophy`, ID `u-71e6da1d66f8`, revision 1; 125 blocks, 111,125 canonical graphemes, no footnotes.
- Isolated article, relevant reading preferences, and its location only; no other library articles, annotations, notes, collection memberships, or highlight-slot configuration copied into the fixture. The full user export and extracted content are not committed.
- Reading settings: serif, size 22, measure 70, spacious, light, paginated, animation enabled unless explicitly testing otherwise. Primary viewport 1280×800; additional 390×844 probes.

## Revisions and historical comparison

- Starting branch: `feature/compact-selection-toolbar`, `1180f5842cbb557b6bd056c762e725896be80827`.
- Locally available `origin/main`: `c1a1f014` (not a claim about the deployed site's exact build).
- Verified historical comparison: `fdaec23d`, the parent of long-work introduction `1bb0e6ff`.
- Comparisons used ignored archive snapshots, not a branch switch or worktree change. Historical product source remained at that revision; current managed-server identity/runner plumbing and diagnostic harness were supplied to isolate the server. Installed dependencies were shared; the historical/current lockfile difference is four added metadata/parser entries, not a separate historical dependency installation. Treat this as a controlled source comparison, not a recreated historical production environment.
- The historical build predates canonical turn receipts. Its probe requires input-scoped DOM text replacement and a settled overflow check, rather than pretending it exposes the current receipt interface.

## Feedback loop and measurements

The probe seeds the isolated reading, waits for current pagination/overflow readiness, dispatches ArrowRight, and waits for a new directed turn receipt plus canonical advance. It records changed page-fragment text at a requestAnimationFrame callback and samples frame intervals. Text itself is not logged. Two additional animation frames separate turns.

**Timing is an input-to-changed-DOM-at-rAF proxy, not a compositor-presented-frame measurement.** It is sufficiently sharp to catch the ~400 ms frozen-page delay. The exploratory `<150 ms` assertion is a stall detector used for diagnosis, **not an approved CI performance budget**.

### Main-revision results (1280×800)

Each cell is one controlled 12-turn run per engine: 10 ordinary turns and 2 internal window crossings. Small samples establish the large deterministic stall; they are not p95 or release benchmarks.

| Source/experiment                                           | Chromium ordinary median | Chromium crossing median | Firefox ordinary median | Firefox crossing median |
| ----------------------------------------------------------- | -----------------------: | -----------------------: | ----------------------: | ----------------------: |
| `c1a1f014`, unchanged                                       |                  15.8 ms |                 440.5 ms |                 13.0 ms |                432.0 ms |
| Same source, only debounce changed to 0 in browser response |                  14.1 ms |                  36.6 ms |                 12.5 ms |                 33.0 ms |
| Same source, forced whole-article path                      |                  12.6 ms |    No internal crossings |                 18.5 ms |   No internal crossings |
| Historical `fdaec23d`, whole-article path                   |                  12.6 ms |    No internal crossings |                 23.5 ms |   No internal crossings |

- On unchanged main, crossing ranges were 439.6–441.5 ms in Chromium and 428–436 ms in Firefox. Maximum sampled frame gaps were 16.8/17.2 ms respectively: the page was mostly **waiting**, not continuously blocking the main thread for 400 ms.
- Main's indicator changed from `0%` to `14%` during the sampled walk.
- With only the debounce removed, the latency assertion passes but the numeric-indicator assertion still fails on `14%`. These are separate recovery requirements.
- Forced whole-article layout on main restored numeric counts and passed the sampled turn detector in both engines. Counts were initially 75/77 and became 77/79 after early live corrections. Whole-article layout is not a proof of stable numbering across every page, viewport, or typography setting.

### Replication, controls, and reduction

- Starting branch: unchanged crossing medians 435.5 ms Chromium / 445 ms Firefox, versus ordinary medians 16.3/15 ms. A 60-turn exploratory Chromium walk also showed recurring delays at scope changes.
- Animation disabled on the starting branch: crossing delay still reached 443.2 ms. Motion is not required for this stall; this does not certify every animation detail.
- Only debounce changed to 200 ms: crossings 242.1/240.3 ms (Chromium). Only changed to 0: crossings 30.6–39.5 ms Chromium / 28–35 ms Firefox. Restoring the original response reproduced 429.5/440.5 ms crossings.
- Reduced content: first 16 blocks of the actual article, no persisted structure, no tags, no saved location, no collections or annotations; animation off. Six turns reach the first crossing: 431.3 ms unchanged versus 33.4 ms with only debounce removed. The remaining reproduction is a two-window reading; a full book or a chapter handoff is unnecessary.
- Short control `essay-long-form`: 12 next/previous turns across its three pages, no internal scope changes; ordinary maximum 15.7 ms Chromium / 17 ms Firefox, detector passes.
- At 390×844 after explicitly awaiting saved-location restoration, the affected reading still reproduces the stall in both engines (maxima 464/445 ms). An earlier probe incorrectly sent its first input while restoration was pending; its missing receipt was a harness race and is not attributed to the product.
- Forced full layout at 390×844 on the starting branch: 12 sampled turns pass, whole counts approximately 112–117 pages. This is evidence for this content/settings only, not a traversal of 200+ pages or every layout.

## Demonstrated mechanism

- `src/reader/WindowedPaginatedSurface.tsx`: `requestOffset` selects the neighboring measurement range when an ordinary turn crosses a window; the last trusted page remains mounted meanwhile.
- `src/measurement/useMeasurement.ts:167,196`: changing `blockWindow` tears down and reconstructs the measurement engine/coalescer.
- `src/measurement/triggers.ts:35,67,73–76,105–117`: the new coalescer's ResizeObserver schedules measurement behind its default 400 ms debounce. That debounce was appropriate for bursts of geometry/settings invalidations, but the reused lifecycle applies it to navigation too.
- Browser response substitutions changed only `DEBOUNCE_MS` in this module; no product files were edited. The proportional 400→200→0 latency change and restored-original failure distinguish this mechanism from font-load latency, heavy layout alone, or a completion/persistence requirement.
- This establishes a cause of the recurring stalls; it does not exclude additional Mac-specific, animation, annotation, or real-display issues.

## Why this article loses whole-work page numbers on main

`readingWindows` in main's `src/pagination/blockWindow.ts` admits whole measurement only within independent source limits: 2,048 canonical rows and a text bound currently computed as `8,000 * floor(300 / 32) = 72,000` graphemes. The supplied article has 111,125 graphemes, so it receives small continuation windows even though its tested whole-layout page count is well below 300.

Main's `PaginatedSurface` shows numeric whole-work counts only when `hasWholeArticlePagination` verifies complete canonical coverage; otherwise it shows a percentage. The honesty check is useful. The observed loss comes from the admission/scope policy, not from a need to fake a whole-work denominator. **Do not remove the coverage check to recover numbers.**

Relevant intervening work: `b5586a25` and `38a6f641` (#250). These explain version differences, not the sole origin of the latency bug.

## Proposed implementation (subsequently approved)

1. **Fix scheduling at the measurement seam.** Distinguish an urgent new navigation scope from coalescible resize/typography events. Measure the newly mounted scope without the 400 ms idle wait; retain font readiness, epoch cancellation, stale-result guards, last-valid-page retention, and live overflow verification. Do not globally set all debounce values to zero. Add a synthetic two-window regression through the real turn path, plus focused scheduler tests.
2. **Separate layout admission from continuation tile size.** Revisit the independent whole-work source limits using representative workloads; require this article to retain honest whole-reading numbering at the tested settings when complete layout succeeds. Keep the unchanged page ceiling, bounded refinement, note coverage, chapter-assignment limits, and canonical coordinates. No universal 200-page threshold and no blanket whole-work layout. Whole-page totals correcting during early turns also require explicit stability checks.
3. **Remove completion mutations from the ToC.** Keep navigation/current-location and only restrained useful status. Preserve shared completion records. Recommended secondary home: a Reading status dialog reached from a library reading-state action for chaptered works, with whole-reading and chapter correction controls; available without collection membership and without a new always-visible reader toolbar control. Exact interaction needs approval before implementation, since existing library reading-state controls currently toggle directly.
4. **Lock down both symptoms independently.** Test latency and honest numeric orientation separately; no passing reflow budget substitutes for smooth turns. Exercise forward/backward scope crossings, restore, rapid/superseded input, font/viewport changes, reduced motion, footnotes, true chapter handoffs, and assignment limits at the correct seams. Preserve existing approved CI budgets/routing.
5. **Validate on the reported platform.** Linux Firefox/Chromium first; Mac Zen/Helium check remains required. Larger corpus and reference-Mac performance/functional acceptance remain pending, not implied by these small probes.

## Local reproduction artifacts

Ignored directory `.local/reading-recovery/` contains private fixtures, JSON observations, logs, archive snapshots, and a standalone diagnostic config. The scratch spec was removed from the normal e2e test directory. No user content or failing diagnostic is added to the shipped suite.

Re-run from repository root (already executed after moving the probe into the ignored directory):

```sh
LEM_RECOVERY_TURNS=6 \
LEM_RECOVERY_FIXTURE=.local/reading-recovery/minimal.json \
LEM_RECOVERY_MOTION=0 \
LEM_RECOVERY_LABEL=final-red \
mise exec -- npx playwright test \
  --config=.local/reading-recovery/playwright.config.ts \
  --project=chromium --workers=1
```

Observed: **1 failed**, `Expected: <150`, `Received: 431.2 ms`; ordinary-turn maximum 16.1 ms, max sampled frame gap 16.7 ms. This is an intentional diagnostic failure, not a product test-suite failure introduced by this investigation. Repeating with `LEM_RECOVERY_DEBOUNCE=0` substitutes the one module in the browser, not on disk.

No temporary product instrumentation, dependency changes, runner changes, or reference-budget changes remain. The pre-existing modifications to `docs/specs/collections-and-long-works.md` and untracked `docs/specs/pdf-structure-repair.md` were left untouched.

## Implementation and local verification

Implementation was approved after the investigation, including changing the existing library reading-state action to open Reading status for chaptered standalone works. Work is isolated on `fix/reading-experience-recovery`, based on `origin/main` at `c1a1f014`; the original checkout remains untouched. Verification below spans November 12–13, 2026, on Linux, using Node 22.23.4 through `mise exec`.

### Product changes

- `src/measurement/triggers.ts` exposes `measureScopeNow()`: cancel a queued debounce and measure fresh constraints immediately, unless disconnected. `useMeasurement.ts` invokes it for a newly mounted scoped projection. Resize/settings/image/font invalidations retain their existing coalescing. Font readiness, epoch cancellation, stale-result rejection, trusted-view retention and overflow correction remain unchanged.
- `src/pagination/blockWindow.ts` uses an independent **256,000-grapheme aggregate source admission budget**, including footnotes, alongside the existing 2,048-row guard. Small continuation tiles remain 8,000 graphemes/32 blocks. This admits the supplied 111,125-grapheme reading and representative synthetic readings around 120k/240k without deriving whole-layout admission from tile size. This is a conservative source guard, not an estimate or promise of page count. The 300-page ceiling and capacity refinement remain unchanged; extreme small-viewport CJK capacity continuation is still tested. Numeric denominators still require complete canonical coverage.
- `TocPanel.tsx` no longer exposes completion mutation controls or their callback; it retains finished status with an explicit accessible link name. `ReadingStatusDialog.tsx` uses a native modal and existing `ReadingStateButton` pending/optimistic/error behavior. The existing library reading-state action opens it for chaptered standalone works; ordinary readings keep their direct toggle. Whole/chapter corrections write the same shared completion records, including for uncollected works, without touching location records. Initial Close focus, Escape/backdrop closing, focus return, narrow layout and honest storage-error retry are covered.

### Red/green regression evidence

- Scheduler unit tests cover immediate fresh constraints, cancellation of pending work, unchanged 400 ms settings coalescing and disconnected no-op behavior. They failed before `measureScopeNow()` was implemented and passed afterward.
- `tests/e2e/pagination/scope-scheduling.spec.ts` exercises a real synthetic two-window turn. It freezes the browser clock and permits less logical time than the 400 ms debounce. Removing the urgent hook reproduced failure; restoring it passed Chromium/Firefox, and container WebKit also passes. This is a scheduling regression, not a new wall-clock CI budget.
- Admission unit tests failed for a representative moderate reading under the previous 72k bound, then passed after independent admission. `continuous-reading.spec.ts` checks full scope, numeric orientation and stable totals through twelve Next turns and a Previous turn for both synthetic sizes at 1280px and 390px widths, across all three engines.
- The windowed footnote fixture was enlarged beyond the new admission guard so it continues testing actual body/note scope crossings. Its final-body setup now derives the final source row rather than assuming row 78 still belongs to the last window.
- WebKit exposed a sampled-phrase assertion that could fail when a phrase legitimately straddled pages. The replacement checks coverage of the **entire canonical note**, strict forward slice starts and absence of skipped/fabricated text. It permits an overlapping page after the retained live geometry correction; simple concatenation wrongly treats such reflow as duplicated canonical content. The stronger check passes all three engines.
- The cold-reload identity test now waits for the actual saved offset instead of sleeping 1,400 ms: the post-mount observer remeasurement can refresh the shared 1,200 ms latest-wins save timer after an urgent turn. The saved-offset and exact restored-scope/anchor assertions are unchanged and pass.

### Supplied-article replay after implementation

No browser-response overrides were used for these final runs. Content remains in ignored private fixtures; only observations are recorded here.

| Viewport and run                                    | Chromium                                                    | Firefox                                    |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| 1280×800, twelve turns from the start               | `1 of 76` → `13 of 76`; maximum input-to-DOM-at-rAF 42.2 ms | `1 of 78` → `13 of 78`; maximum 30 ms      |
| 390×844, six turns after saved-location restoration | `114 of 135` → `120 of 135`; maximum 42.1 ms                | `112 of 132` → `118 of 132`; maximum 36 ms |

All runs publish complete article coverage and have no internal continuation crossings. Totals remained stable during these sampled walks. Engine/viewport counts differ normally and are not promises of an immutable denominator under later geometry or font changes. The earlier forced-layout experiments used different revisions/readiness paths and do not establish identical totals.

After the scheduling change alone, before admission was adjusted, the private desktop crossing observations fell to approximately 46 ms Chromium / 35–36 ms Firefox; numeric orientation was still absent. This independently verifies that scheduling and orientation are separate fixes.

The final desktop traces still have maximum sampled frame gaps of **83.3 ms Chromium / 50.3 ms Firefox**; narrow traces have approximately **33.3 / 49.3 ms**. Therefore the measured deterministic 400 ms scope wait is removed, but these samples do **not** prove universally hitch-free rendering. Timing remains a changed-DOM-at-rAF proxy, not compositor presentation. Mac Zen/Helium and broader repeated-turn acceptance remain required.

### Verification runs

All functional runs used one worker; calibration/performance retained their configured three-worker sampling. Host load was checked before the longer runs and was low. No budgets, runner routing, test isolation or reference platform were changed.

- **360 unit tests / 34 files passed**: measurement, pagination, library-row and ToC suites.
- **86 targeted Chromium/Firefox functional tests passed**: completion/assignments, Reading status, card actions, continuous numbering, scope scheduling, long-work restore/annotations/speech/reflow, orientation and footnotes. Follow-up runs passed **10 continuous-numbering/motion cases**, including the newly added narrow cases and live reduced motion, plus the strengthened oversized-note test in both engines.
- **3 additional Chromium giant-prose cases passed**: bounded opening, typography re-anchor and small-viewport continuation past the unchanged page ceiling.
- **19 container WebKit functional cases passed**: Reading status/error retry/focus, card actions, both numbering sizes at both widths, the full footnote suite, live reduced motion and urgent scope scheduling.
- **4 host measurement harness cases passed**: calibration and cold/warm performance in Chromium/Firefox. Calibration sampled 36 typography variants on the current shipped fixture. These are local harness observations, **not** successful authoritative reference-Mac budget comparisons.
- Typecheck, lint of changed TypeScript files, whitespace checks, and the production build passed. The build still reports chunk-size and ineffective dynamic-import warnings; no bundling thresholds were changed. The narrow WebKit Reading status screenshot was inspected: heading/Close focus are clear, chapter rows wrap within the dialog, and the dialog has no horizontal overflow; keyboard/modal inertness and focus restoration are separately asserted.

Representative commands (run from the recovery worktree):

```sh
mise exec -- npm run test:unit -- --run \
  tests/unit/measurement tests/unit/pagination \
  tests/unit/library/library-row.test.tsx tests/unit/TocPanel.test.tsx

mise exec -- npx playwright test \
  tests/e2e/collections/completion.spec.ts \
  tests/e2e/collections/reading-status.spec.ts \
  tests/e2e/library/card-actions.spec.ts \
  tests/e2e/pagination/continuous-reading.spec.ts \
  tests/e2e/pagination/scope-scheduling.spec.ts \
  tests/e2e/pagination/long-work.spec.ts \
  tests/e2e/pagination/orientation.spec.ts \
  tests/e2e/pagination/footnotes.spec.ts \
  --project=chromium --project=firefox --workers=1

DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock \
  mise exec -- npm run test:e2e:container -- \
  tests/e2e/collections/reading-status.spec.ts \
  tests/e2e/pagination/scope-scheduling.spec.ts \
  tests/e2e/pagination/continuous-reading.spec.ts \
  tests/e2e/pagination/footnotes.spec.ts \
  tests/e2e/library/card-actions.spec.ts \
  tests/e2e/pagination/page-motion.spec.ts --project=webkit --workers=1

mise exec -- npx playwright test --config=playwright.measurements.config.ts \
  perf.harness calibration.harness --project=chromium --project=firefox
```

The initial container doctor was blocked against the default rootful socket. Selecting the **already-running** rootless socket made doctor and WebKit verification ready; no daemon setup, group/permission changes or system installation was performed.

Local logs and screenshots remain ignored under `.local/reading-recovery/`, `.container-e2e/` and Playwright artifact directories. No private fixture or export is tracked. No commit or PR was requested or created. **Remaining acceptance:** authoritative reference-Mac CI/performance checks, broader corpus testing, and direct macOS Zen/Helium smoothness verification.
