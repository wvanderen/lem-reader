# Lemcentre browser-ready guest: environment proof

Status: lem-reader integration implemented (issue #278); guest provisioning
pending [wvanderen/lemfleet#21](https://github.com/wvanderen/lemfleet/issues/21).
Parent plan: [lemcentre-ci-migration.md](lemcentre-ci-migration.md); boundary
prerequisite: [lemcentre-runner-boundary.md](lemcentre-runner-boundary.md)
(implemented, #277). This is migration sequence **step 1 (environment
proof)**. Non-authoritative by design: no required check changes, the Mac
(`lem-reference`) stays the `e2e-reference` producer, and nothing here cuts
over browser authority.

## Purpose and division of ownership

Demonstrate that all three browser engines launch inside the disposable,
offline, browser-ready Ubuntu guest on lemcentre and complete a small
application/browser smoke test. lem-reader owns the integration and
acceptance side: the recorded environment pin, the receipt contract and its
verifier, the smoke test, and the dispatch-only lane whose green verdict is
the citable evidence. lemfleet#21 owns the infrastructure side: building and
provisioning the guest to this recorded profile and installing the trusted
launcher seam this spec defines. Planning approval is not deployment
approval — host/service mutations on lemcentre remain owner-gated on the
lemfleet side.

## Recorded environment pin

`ops/lemcentre-runner/browser-guest/environment-pin.json` is the frozen
identity every guest must present. Recorded values (issue #278 acceptance
criteria 1–2):

| Aspect                   | Pinned value                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest form               | Native browser-ready QEMU VM (no nested container runtime), disposable overlay per boot                                                                                       |
| Base OS                  | Ubuntu 24.04 (noble)                                                                                                                                                          |
| Resources                | 6 guest vCPUs / 12 GiB RAM, three measurement workers retained                                                                                                                |
| Node                     | 22.23.4 (the already-trusted `/opt/factory/node` runtime)                                                                                                                     |
| Playwright               | 1.61.1 (repo `@playwright/test` exact pin) — browsers chromium 1228, firefox 1532, webkit 2311                                                                                |
| OS dependencies          | The ubuntu24.04 set `playwright install --with-deps` installs — identical to the official `mcr.microsoft.com/playwright:v1.61.1-noble` image; installed natively in the guest |
| Fonts                    | fonts-liberation, fonts-freefont-ttf, fonts-ipafont-gothic, fonts-noto-color-emoji, fonts-scalable, fonts-tlwg-loma-otf, fonts-unifont, fonts-wqy-zenhei, fonts-cyrillic      |
| Isolation                | Guest NIC `none` (app/browsers over guest loopback only), no host filesystem mounts, no host Docker socket                                                                    |
| Trusted harness identity | lemfleet revision enforced via `ops/lemcentre-runner/lemfleet-rev` (see below)                                                                                                |

Any change to these values is a profile change: review it in this repository
and restart the migration acceptance sequence — never combine evidence from
different profiles (parent plan, §Browser contracts and performance).

## Environment receipt contract

Provisioning (lemfleet#21) emits the observed identity to
`/usr/local/libexec/factory-ci/browser-guest-env.json` (root-owned 0644,
outside every runner-writable path, same trust shelf as `lemfleet-rev`).
The receipt records: guest form/OS/resources/isolation booleans, node,
playwright, per-engine browser revisions, dependency source, the font
package set, base-image source + sha256 digest, the provisioning lemfleet
revision, and the provisioning timestamp. Before any smoke run, the
workflow verifies the receipt with
`ops/lemcentre-runner/browser-guest/verify-environment-receipt.py`, which
requires exact agreement with the pin **and** with the enforced
`lemfleet-rev` — a drifted or stale-identity guest produces a visible
refusal, never a green verdict on the wrong environment.

## Smoke-test contract

`tests/e2e/browser-guest-smoke.spec.ts` is deliberately small and
dependency-free (no seeding, no image stubbing, no engine conditionals):
the fresh library renders, the bundled sample article opens, its body
renders, with no page errors — in Chromium, Firefox and WebKit. It runs
unchanged on the dev machine, the reference Mac PR gate (all three engines,
exhaustive and PR configs), and inside the guest, where the standard
webServer + `BASE` wiring already confines app/browser traffic to guest
loopback.

The guest-side producer is the trusted launcher seam
`/usr/local/libexec/factory-ci/browser-smoke <head-sha> <lem-reader-checkout>`
(root-owned 0755, installed by lemfleet#21 provisioning): it re-checks the
pin and checkout exactly like `factory-validate`, launches the pinned
browser-ready guest offline, runs the smoke spec inside it, and returns
factory-validate's exit-code semantics (0 green · 2 harness red · 3
preparation failure · 4 boundary refusal · 5 timeout/failure). The guest
lifetime bound and in-guest cgroup budget for the 6/12 profile are
lemfleet#21 decisions to record in its own evidence; this ticket freezes
only the identity above.

## Workflow lane

`.github/workflows/browser-guest-smoke.yml` — `workflow_dispatch` only,
runs on `[self-hosted, lemcentre]`, never attached to a PR, never a
required check. Until the receipt exists it exits 33 ("not provisioned")
so the lane is visibly red rather than silently green. When it runs, its
green verdict (receipt validated + three-engine smoke green through the
pinned launcher) is exactly the evidence step 1 needs.

## Acceptance protocol (closes issue #278)

1. lemfleet#21 provisions the guest and installs the launcher; the pin
   moves to the provisioning revision through the reviewed procedure in
   [ops/lemcentre-runner/README.md](../../ops/lemcentre-runner/README.md).
2. Dispatch `browser-guest-smoke` on the candidate revision; archive the
   run link, the receipt contents, and the guest-side smoke verdict.
3. Confirm `factory-validation` still produces its gate unchanged
   (disposable unit validation preserved) and no required check changed.
4. Record the evidence in `docs/verification/` and mark issue #278's
   criteria complete. Only then does sequence step 2 (boundary and
   lifecycle proof, issues #279/#283) begin.

Honest interim state: guest evidence does not exist yet; the smoke spec is
exercised in all three engines by the PR gate on the reference Mac, which
proves the spec, not the guest.
