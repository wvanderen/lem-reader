# Linux WebKit investigation — the spec-305 migration risk list (issue #281)

**Date:** 2026-11-18 · **Repo:** lem-reader, branch
`t3/issue-281-implementation` (from `origin/spec-305-integration`
`457cdc4c`) · **Parent:** [docs/specs/lemcentre-ci-migration.md](../specs/lemcentre-ci-migration.md)
§Browser contracts and performance ("Linux becomes authoritative without
implying Linux WebKit equals macOS WebKit. Investigate known focus-handoff
and footnote differences. Resolve them through reviewed platform-correct
assertions… No silent engine exclusions, blanket expected failures or
weakened assertions.")

**Status: local container-lane investigation complete with one reviewed
assertion fix; this is NOT guest-side evidence** — everything below ran on
the development checkout's container lane (`npm run test:e2e:container`,
official `mcr.microsoft.com/playwright:v1.61.1-noble` image, WebKit build
2311, the same pinned Playwright 1.61.1 the guest pin freezes). The
browser guest itself is not provisioned yet (lemfleet#21); shadow-lane
runs inside the guest must re-confirm these behaviors on guest WebKit
before cutover acceptance.

## Scope

Repo side only. The investigation targets the risk list from the
migration exploration notes (spec-305, lem-reader-seams.md §e):
`page-turn-focus-handoff.spec.ts` (macOS-calibrated WebKit focus
branches), `footnotes.spec.ts` (focus contracts without engine
conditionals), the four Playwright-WebKit IndexedDB-Blob skip sites, and
the remaining weaker webkit focus-restore variants. No product source
change was needed or made; exactly one spec's assertions changed (below).

## Evidence

All runs: lease-held (`heavy-lease.mjs run --owner
agent@lemcentre:issue-281-webkit-investigation`), host load 0.6–5.4 on
lemcentre's 12 CPUs (below the ~6 discipline threshold; checked before
every run), targeted `--project=webkit` only, through the container
three-engine lane. Logs under `.container-e2e/logs/2026-11-17T16-*.log`.

| Risk item (spec-305 §e)                                                                                                                                                                          | Command (targeted)                                                                    | Result before                                                                                                            | Result after the fix                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `pagination/page-turn-focus-handoff.spec.ts` (5 tests; THE spec the migration names)                                                                                                             | `test:e2e:container -- <spec> --project=webkit`                                       | **4 failed / 1 passed** (macOS-calibrated webkit branches expected `boundary`; Linux WebKit leaves focus on the control) | **5 passed**                                                    |
| `pagination/footnotes.spec.ts` (9+ tests incl. nested-kind walks; heavy focus contracts)                                                                                                         | `test:e2e:container -- <spec> --project=webkit`                                       | **11 passed**                                                                                                            | no change needed                                                |
| Playwright-WebKit IndexedDB-Blob skips: `imagery/offline-reopen.spec.ts:133`, `ingestion/happy-path.spec.ts:204`, `portability/import-preview.spec.ts:521`, `portability/round-trip.spec.ts:991` | `test:e2e:container -- <4 specs> --project=webkit --grep "<the four skipped titles>"` | **4 skipped** (guards fire)                                                                                              | no change needed — a Playwright-WebKit fact, not macOS-specific |
| Weaker webkit focus-restore variants: `annotations/drawer-view.spec.ts`, `chrome/tag-menu-geometry.spec.ts`, `chrome/tag-popover.spec.ts`                                                        | `test:e2e:container -- <3 specs> --project=webkit`                                    | **14 passed**                                                                                                            | no change needed                                                |

Discovery/coverage: `npm run test:e2e:coverage` → "3227 PR cases; 3309
exhaustive cases; every Chromium case retained" — the assertion fix
neither adds nor removes any case (platform-conditional assertions inside
existing tests).

## Observed Linux WebKit behavior vs the macOS-calibrated expectations

A one-off probe spec (temporary, removed after the run; the classification
helper is the spec file's own) ran the exact interactions on container
WebKit:

```
PROBE webkit: plainClick=button secondClick=button focusedBefore=button
focusedClick=button afterBlur=body
```

- **macOS WebKit** (the 2026-09-02 probe recorded in the spec's header):
  activating a page-turn button does NOT focus it —
  `document.activeElement === body` — so the 21-07 fallback boundary
  handoff (`focusNewPageTop`) must fire, and focus lands on the new
  page's "Page N begins" boundary heading.
- **Linux WebKit (WebKitGTK)** keeps DOM focus on the activated control —
  the same shape as Chromium/Firefox. `handleChevronTurn`'s
  guard (`active.closest(".page-turn,.mode-toggle,.gear-button")`)
  correctly recognizes the retained control, so no handoff fires and
  D4-07 ("focus stays on the control where the engine holds it") holds.

The product code is **platform-correct on both** — focus is never stranded
on body/null after a turn on either platform; which valid shape occurs
(boundary reset vs control retention) is engine+platform truth. The four
failures were assertion calibration, not product bugs. The forced-blur
cascade cell (platform-independent) passed before and after, confirming
the cascade self-heal works on Linux WebKit too.

## The reviewed change (assertions only, no product change)

`tests/e2e/pagination/page-turn-focus-handoff.spec.ts`:

- New constant `webkitLosesActivationFocus = process.platform === "darwin"`
  with the probe evidence recorded in its comment.
- The four webkit-specific `boundary` expectations now assert that shape
  **only on darwin** (byte-identical assertions to before — the Mac gate
  is unchanged by construction). On Linux WebKit they assert the
  control-retention shape equally strictly: focus is on the page-turn
  control (D4-07), and never body/null.
- The "click never strands focus on body" cell accepts `button|boundary`
  for Linux WebKit exactly as it already does for Chromium/Firefox; the
  invariant (never body, never null) remains asserted for every engine
  and platform.
- No test was skipped, excluded, marked expected-failure, or weakened to
  "anything goes": every branch keeps a strict, named expectation, and
  the webkit-strict cells still run on both platforms' WebKit.

Rationale: on Linux WebKit the old expectation demanded the product
REMOVE focus from a control the engine retained — i.e. asserting macOS
engine behavior as a product requirement would have forced a product
change (taking focus from the activated control), altering the D4-07
accessibility contract instead of preserving it. The platform-conditional
assertion preserves both platforms' contracts and keeps the Mac's
protection exactly as strong as before.

## Verification performed

- `mise exec -- npx vitest run tests/unit/guest-bundle-extract.test.ts` →
  9 passed (the extractor introduced by this ticket; unrelated to WebKit
  but part of the same branch).
- `npm run test:e2e:coverage` → 3227 PR / 3309 exhaustive (above).
- `npm run lint`, `npm run format:check`, `npm run typecheck` → clean.
- Full-suite/PR-suite e2e was NOT run locally (discipline: CI owns
  full-suite evidence; only targeted container specs above).

## Honesty and follow-ups

- This local container investigation does **not** substitute for
  guest-side evidence: the shadow lane (`e2e-linux-shadow`, once
  lemfleet#21 provisions the guest) and the acceptance runs must observe
  the same Linux WebKit behaviors on the guest's WebKit build (same
  pinned browser revision, but a different OS image and no display
  server differences assumed).
- The Mac (darwin) side of the changed spec could not be executed from
  this Linux session by design; its assertions are unchanged
  byte-for-byte, and the Mac's e2e-reference will exercise them on this
  branch's PR.
