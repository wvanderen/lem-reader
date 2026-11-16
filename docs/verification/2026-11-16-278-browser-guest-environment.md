# Browser-ready guest environment proof: integration record (issue #278)

Scope: the lem-reader integration/acceptance side of issue #278 — the
recorded environment pin, the receipt contract and verifier, the
three-engine smoke test, and the dispatch-only lane that will produce the
environment-proof verdict (migration sequence step 1,
[docs/specs/lemcentre-ci-migration.md](../specs/lemcentre-ci-migration.md)).
Contract: [docs/specs/lemcentre-browser-guest.md](../specs/lemcentre-browser-guest.md).
Guest provisioning itself is owned by
[wvanderen/lemfleet#21](https://github.com/wvanderen/lemfleet/issues/21).

**Status: integration implemented; guest evidence NOT yet collected.**
No required check changed; `e2e-reference` remains the Mac's; this lane is
non-authoritative by design.

## Acceptance criteria → evidence

| Criterion (issue #278)                                                                                                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pin and record Ubuntu image, Node 22, Playwright/browser versions, dependencies, fonts and trusted harness identity; native browser-ready VM, not a nested container | `ops/lemcentre-runner/browser-guest/environment-pin.json`: Ubuntu 24.04 (noble) native QEMU VM with `nestedContainerRuntime: false`; Node 22.23.4 (the trusted `/opt/factory/node` runtime); Playwright 1.61.1 with browser builds chromium 1228 / firefox 1532 / webkit 2311 (read from the installed `playwright-core` 1.61.1 `browsers.json`); OS-dependency identity = the ubuntu24.04 `playwright install --with-deps` set (identical to the official `mcr.microsoft.com/playwright:v1.61.1-noble` image); the nine-font package set extracted from the same installed package; harness identity = the enforced `ops/lemcentre-runner/lemfleet-rev`. Contract text: [docs/specs/lemcentre-browser-guest.md](../specs/lemcentre-browser-guest.md). |
| Start at 6 guest vCPUs and 12 GiB RAM; loopback-only app/browser traffic; no external guest NIC, host mounts or Docker socket                                        | Frozen in the pin (`vcpu: 6`, `ramGiB: 12`, `nic: "none"`, `hostFilesystemMounts: false`, `hostDockerSocket: false`, `measurementWorkers: 3`). The receipt verifier (`verify-environment-receipt.py`) refuses any receipt that diverges — exercised during development: a synthetic receipt with vcpu 2, webkit 9999, missing fonts/digest/provenance produced seven distinct refusal findings; the matching receipt verified clean. Guest-loopback wiring is the existing webServer + `BASE` contract, unchanged. **Host-side enforcement awaits lemfleet#21 provisioning.**                                                                                                                                                                          |
| All three engines launch and complete the smoke test; preserve existing unit validation and disposable guest execution                                               | `tests/e2e/browser-guest-smoke.spec.ts` — small, dependency-free (no seeding, no image stubbing, no engine conditionals), all three engines by default. Verified locally on Chromium (2/2 green) under contended load; the PR gate supplies the three-engine run on this PR. Existing validation preserved by construction: `factory-validation`, `ci.yml` and `e2e-reference` are untouched; the new lane is `workflow_dispatch`-only. **Guest-side launch evidence (the criterion's decisive half) is pending lemfleet#21 — the `browser-guest-smoke` lane exits 33 ("not provisioned") until then, visibly red, never silently green.**                                                                                                             |
| Coordinate provisioning with external lemfleet/factory infrastructure; development lane non-authoritative; boundary completion required before a full shadow gate    | The seam contract is defined here and implemented there: receipt at `/usr/local/libexec/factory-ci/browser-guest-env.json` (root-owned 0644), launcher `/usr/local/libexec/factory-ci/browser-smoke <head> <checkout>` (root-owned 0755, factory-validate's trust shape and exit-code semantics). Acceptance protocol (pin move → dispatch run → gate-preservation check → verification record) in the spec doc. The lane never attaches to PRs and never becomes a required check; shadow gating remains behind the boundary/lifecycle proof (#279/#283).                                                                                                                                                                                             |

## Verification performed on this integration

- `npm run lint`, `npm run format:check`, `npm run typecheck` — clean.
- `npm run test:unit -- --run` — 4489 passed / 18 skipped (contended:
  load avg ≈ 10–12 during the run; the nightly exhaustive suite held the
  heavy-test lease on the reference Mac).
- `npm run test:e2e:coverage` — 3227 PR cases / 3309 exhaustive cases,
  every Chromium case retained (the smoke spec joins both configs
  identically, all three engines).
- `npx playwright test tests/e2e/browser-guest-smoke.spec.ts
--project=chromium` — 2/2 green. Three-engine evidence comes from the
  PR gate per test discipline (contended box; the nightly held the lease;
  no layout/focus assertions in this spec justify a local firefox/webkit
  duplicate run).

## Post-merge / acceptance steps

1. Dispatch `browser-guest-smoke` on `main` once — expect the honest red
   (exit 33, "not provisioned") demonstrating the lane's failure mode
   until lemfleet#21 lands.
2. On lemfleet#21 provisioning: move `lemfleet-rev` to the provisioning
   revision through the reviewed procedure, re-dispatch, archive the
   green run + receipt, complete the acceptance protocol in
   [docs/specs/lemcentre-browser-guest.md](../specs/lemcentre-browser-guest.md),
   and record the guest evidence here.
