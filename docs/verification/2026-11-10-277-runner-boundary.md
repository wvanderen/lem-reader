# Runner/control-plane boundary: verification record (issue #277)

Scope: PR-controlled workflow code on lemcentre no longer executes as the
desktop account. The runner moved to the confined `lemci` system account
under a hardened unit; the factory launcher became a root-owned,
pin-enforcing launcher plus a separate driver plane; a hostile boundary
probe and a host-side verifier make the boundary reproducibly demonstrable.
Companion: wvanderen/lemfleet#20 (lemfleet side). Design and threat model:
[docs/specs/lemcentre-runner-boundary.md](../specs/lemcentre-runner-boundary.md);
runbook and rollback: [ops/lemcentre-runner/README.md](../../ops/lemcentre-runner/README.md).

**Status: boundary active and verified on lemcentre (2026-11-10). Candidate
revision `882708f` (PR #290 head at verification time). Browser authority
unchanged: `e2e-reference` still produced by the Mac runner; required
checks unchanged.**

## Acceptance criteria → evidence

| Criterion (issue #277)                                                                                                                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hostile workflow probe demonstrates repository-controlled workflow code cannot access desktop credentials or desktop-account resources; threat model and residual risks documented | **Before** (desktop-user runner, uid 1000): probe recorded **12 unexpected ALLOWEDs** — desktop home/SSH dir/config/T3/mise/dev checkouts listable, backup passphrase + old wrapper readable, desktop process signalled, session bus connectable. **After** (confined `lemci` inside the hardened unit): probe **PASSED, every expectation held** (48 denied checks incl. `/home/lem` reads, SSH keys, backup passphrase, session bus, docker socket, sudo/su, trusted-control-plane writes, pinned-node writes; by-design residuals recorded as explicit expected-allows). Host-side `verify-boundary.sh --receipt`: **0 failing checks**, exit 0. Threat model + residual table: boundary spec (incl. scratch-poisoning, egress, `/dev/kvm`, runner-registration credentials, minimized-hardening driver plane). |
| Trusted launcher and infrastructure provenance reviewed; intended trusted revision recorded **and enforced** (not a clean-checkout pin)                                            | Pin file `ops/lemcentre-runner/lemfleet-rev` = lemfleet `3c8682b732002b85ba126a2408ee9acb374df2a0` (lemfleet#12/F5), versioned in this PR — the provenance record. Enforced twice per run: the runner-side wrapper refuses any harness HEAD ≠ pin (exit 4), refuses tracked-dirty checkout, verifies pin owner/mode and harness root-ownership; `factory-validate-inner` re-checks at execution time inside the driver plane. Installed artifacts verified byte-identical to the reviewed sources (`cmp`) by `verify-boundary.sh`. Harness checkout `/opt/factory/lemfleet` root-owned, detached at the pin. Node 22.23.4 installed from GPG-verified signed SHASUMS (procedure mirrors lemfleet `acquire.py`; GOODSIG/VALIDSIG against the official active-releaser keyring).                                     |
| Disposable offline unit-test execution preserved; existing required checks unchanged; no authoritative browser cutover                                                             | `factory-validation` (same check name, same required-check set) ran **green on the confined runner** through the full new chain: run [42900514076](https://github.com/wvanderen/lem-reader/actions/runs/42900514076) — wrapper → spool envelope → `lemcentre-factory` driver plane → pinned harness (lemfleet `3c8682b`) → disposable offline guest: `verdict_green: true`, guest unit suite **4446/4462+skip16**, node v22.23.4, `-nic none`, guest runtime removed, wall 476 s. `e2e-reference` and all other checks untouched (still on the Mac/hosted runners); branch protection untouched.                                                                                                                                                                                                                   |
| Coordination with lemfleet/factory infrastructure; reproducible boundary verification (a dedicated account alone is not proof)                                                     | Companion ticket lemfleet#20 owns lemfleet-side follow-ups (replacement ADR superseding lemfleet ADR-0012's accepted exposure, scratch identity hardening, harness rerun inventory); harness code itself unchanged — pin remains the F5-reviewed revision. Reproducible verification: `ops/lemcentre-runner/verify-boundary.sh` (root; asserts account, filesystem, launcher provenance, service properties, driver plane, then runs the hostile probe as `lemci`; JSON receipt) — **0 failures**; `boundary-probe` workflow (dispatch-only evidence, never a gate) for the PR-controlled-code demonstration post-merge; receipts referenced below.                                                                                                                                                                |

## Deployed state (host: lemcentre)

- Runner: `lemcentre-runner.service` (system unit, `User=lemci`), registration
  migrated (same agent, same `[self-hosted, lemcentre]` labels), state under
  `/var/lib/lem-ci/`. Old desktop-user unit disabled; old runner dir preserved
  at `/home/lem/.factory-ci/runner.migrated-277`.
- Runner-unit hardening (exposure level 4.8 OK per `systemd-analyze security`):
  `NoNewPrivileges`, empty capability set, `ProtectSystem=strict` +
  `ReadWritePaths=/var/lib/lem-ci`, `ProtectHome=true`, `PrivateTmp`,
  `ProtectProc=invisible`, `ProtectClock/ControlGroups/Hostname/KernelModules`,
  `RestrictRealtime`, `LockPersonality`, `RemoveIPC`, `SystemCallArchitectures=
native`, `UMask=0077`. Deliberately absent (comments in the unit file +
  threat model): `RestrictAddressFamilies`, `ProtectKernelLogs`,
  `ProtectKernelTunables`, `RestrictSUIDSGID`, `StateDirectory` — each verified
  to break the driver plane's bwrap sandbox or fight the boundary (delta-
  debugged during this work; determinism 3/3 per finding).
- Driver plane: `lemcentre-factory.service` (bare+trio {NoNewPrivileges,
  ProtectHome, PrivateTmp, UMask=0077} — 5/5 deterministic with the harness's
  bwrap) + `lemcentre-factory.path` watching the spool; executables root-owned,
  envelope validation fail-closed (40-hex head, checkout confined to the
  runner's work folder), stale-claim recovery, queue overflow fails closed.
- Trusted control plane: `/usr/local/libexec/factory-ci/` (wrapper, inner
  wrapper, driver consumer, pin, probe) and `/opt/factory/` (harness checkout
  @ pin, Node 22.23.4) all root-owned, verified against the reviewed sources.

## Receipts and run artifacts

- Pre-boundary probe log (the honest "before": 12 desktop-access successes as
  uid 1000): session log, reproduced by running `boundary-probe.sh` as uid 1000
  before provisioning.
- Post-boundary: `verify-boundary.sh` receipt (0 failures) + standalone probe
  receipt (exit 0), regenerated at verification time from
  `/usr/local/libexec/factory-ci/boundary-probe.sh`; PR gate run
  [42900514076](https://github.com/wvanderen/lem-reader/actions/runs/42900514076)
  (job log shows `factory-validate: lemfleet @3c8682b… validating lem-reader
@882708f…`); driver journal shows the envelope consumed by
  `lemcentre-factory.service`; guest receipt in
  `/var/lib/lem-ci/factory-ci/last-run.log` (`verdict_green: true`).
- Debugging trail (for the record): the bwrap-in-hardened-unit failure was
  delta-debugged to specific properties (`RestrictAddressFamilies`,
  `ProtectKernelLogs`, `ProtectKernelTunables`, `RestrictSUIDSGID`, and
  mount/proc interactions) — reproduced 3/3 deterministic before each removal,
  which is why the final property set is exactly the verified-safe one, and
  why the guest launch was decoupled into the driver plane rather than
  weakening the runner unit.

**Receipt availability (honest limit): receipts are host-side, root-owned
artifacts** written to ephemeral `/tmp` paths during the 2026-11-10 run; they
are not committed to this repository. Regenerate and archive them at any
time from a merged checkout on lemcentre with
`sudo bash ops/lemcentre-runner/verify-boundary.sh --receipt <path>`
(and the standalone probe receipt via `LEM_PROBE_RECEIPT=<path>` under the
`runuser` invocation shown in that script). The committed record above is
the durable summary; the receipts are reproducible on demand, which is the
verifiability this ticket promises.

## Post-merge steps and rerun policy

- **Re-provision after this PR's review fixes.** The trusted-control-plane
  sources changed after the 2026-11-10 verification (driver overflow now
  fails closed immediately; the verifier additionally asserts
  `.credentials_rsaparams` mode; doc consistency fixes). Per the rerun
  policy, re-run `provision.sh launcher` + `verify-boundary.sh --receipt`
  from the merged revision before the next migration acceptance step.

- Dispatch `boundary-probe` on `main` once this PR merges (workflow files
  must exist on the default branch for `workflow_dispatch`) — that run is the
  ongoing PR-controlled-code demonstration.
- Re-run `verify-boundary.sh` + probe after: any pin update (see runbook
  procedure), any runner major auto-update, any unit change, and before each
  migration acceptance step (docs/specs/lemcentre-ci-migration.md sequence).
- Reboot/unattended-recovery verification of the new system unit is issue
  #283's scope (`WantedBy=multi-user.target` + `Restart=always` are in place;
  deliberately not reboot-tested here).
