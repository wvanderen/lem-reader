# Lemcentre runner/control-plane boundary

Status: implemented (issue #277); acceptance evidence in
[docs/verification](../verification/). Companion infrastructure ticket:
[wvanderen/lemfleet#20](https://github.com/wvanderen/lemfleet/issues/20);
parent plan: [lemcentre-ci-migration.md](lemcentre-ci-migration.md). Browser
authority is unchanged: the Mac (`lem-reference`) stays the `e2e-reference`
producer, and no required check changed.

## Threat model

**Protected assets.** The desktop account on lemcentre (`lem`, uid 1000):
SSH keys, browser profiles, T3/app tokens under `~/.t3` and `~/.config`,
mise installs and dev checkouts under `~/dev`, the factory backup
passphrase (`~/.factory-ci/backup-dev-passphrase`), the desktop session
(` /run/user/1000`), and the desktop user's processes.

**Adversary.** Repository-controlled workflow code: any lem-reader PR
defines the YAML the runner executes (steps, env, action refs), plus the
supply chain of the actions those workflows pin. Lem-reader PRs are
normally owner- or factory-authored; the boundary assumes a fully hostile
PR regardless (compromised dependency, injected CI edit), because review
gates are process, not mechanism.

**Before the boundary (lemfleet ADR-0012, accepted 2026-11-05).** The runner was a
systemd _user_ service running as the desktop user with
`$HOME`/`$PATH`-level access to everything above. A hostile PR could read
or exfiltrate any desktop credential, tamper with the desktop lemfleet
checkout that the old wrapper trusted (clean-checkout "pin"), or pivot
through the desktop session. That exposure is what issue #277 closes.

**After the boundary.** Workflow code executes as the dedicated system
account `lemci` (nologin, locked, no wheel/sudo, home `/var/lib/lem-ci`)
inside a hardened systemd unit. Confinement is layered so no single
mechanism is the whole boundary:

1. **Kernel-layer home denial** — `ProtectHome=true` makes `/home` and
   `/run/user` unreachable to the unit regardless of file permissions;
   the desktop home itself stays mode 0700 (DAC layer).
2. **Filesystem write confinement** — `ProtectSystem=strict` +
   `ReadWritePaths=/var/lib/lem-ci` + `PrivateTmp=true`: the unit can
   write only its own state and a private `/tmp`.
3. **No escalation path** — `NoNewPrivileges=true`, empty
   `CapabilityBoundingSet`, no sudoers entry, nologin shell: setuid, sudo
   and su are denied or inert. (`RestrictSUIDSGID` is deliberately absent
   as redundant under `NoNewPrivileges` — and verified during #277
   debugging to break the driver plane's bwrap; see the unit comments.)
4. **Trusted control plane, root-owned and runner-unwritable** — the
   launcher (`/usr/local/libexec/factory-ci/factory-validate`), the pin
   (`lemfleet-rev`), the harness checkout (`/opt/factory/lemfleet`,
   detached HEAD) and the Node runtime (`/opt/factory/node`) live outside
   the unit's write path; the wrapper re-verifies ownership and pin
   compliance at every run and exits 4 on divergence.
5. **Provenance enforcement, not clean-checkout trust** — the wrapper
   refuses any harness HEAD that is not exactly the reviewed revision
   recorded in `ops/lemcentre-runner/lemfleet-rev` (this repository's PR
   history is the provenance record), and refuses tracked-file changes.
   It also scrubs the job environment (`env -i`) so workflow-set variables
   — including `F4A_*` payload redirects — cannot influence payload
   preparation.
6. **Observability** — every run logs the enforced pin
   (`/var/lib/lem-ci/factory-ci/last-run.log`); the hostile probe
   (`boundary-probe` workflow + `verify-boundary.sh`) re-demonstrates the
   denials on demand with a machine-readable receipt.

**What a hostile PR can still do** (the boundary's honest scope): run
arbitrary commands as `lemci` within the unit's walls; read the runner
account's own files; spend host CPU/RAM/disk; make network egress; use
`/dev/kvm` to run its own VMs. It cannot reach desktop credentials,
desktop processes, the session bus, the docker socket, or the trusted
factory control plane, and it cannot silently repoint the unit-validation
harness. Residual-risk table below.

## Trusted infrastructure provenance

| Artifact                         | Path                                                                    | Owner:mode      | Update authority                                                                               | Enforced how                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Trusted launcher                 | `/usr/local/libexec/factory-ci/factory-validate`                        | root 0755       | lem-reader PR editing `ops/lemcentre-runner/factory-validate` + `provision.sh launcher` re-run | wrapper unwritable by runner; `verify-boundary.sh` compares installed file to the reviewed source |
| Pin (reviewed lemfleet revision) | `/usr/local/libexec/factory-ci/lemfleet-rev`                            | root 0644       | lem-reader PR editing `ops/lemcentre-runner/lemfleet-rev` + relaunch                           | wrapper exits 4 unless harness HEAD == pin; pin owner/mode re-checked each run                    |
| Harness checkout                 | `/opt/factory/lemfleet` @ pin                                           | root 0755 dirs  | pin update procedure (ops README)                                                              | root-owned, go-w; wrapper refuses dirty tracked state                                             |
| Node runtime                     | `/opt/factory/node` → `node-22.23.4`                                    | root            | provisioning only (GPG-verified download, bounds and procedure mirror lemfleet `acquire.py`)   | root-owned; runner write probes fail                                                              |
| Runner software                  | `/var/lib/lem-ci/runner`                                                | lemci 0600/0700 | GitHub actions/runner auto-update (upstream)                                                   | accepted upstream trust; account-local blast radius                                               |
| System unit                      | `/etc/systemd/system/lemcentre-runner.service`                          | root 0644       | lem-reader PR editing `ops/lemcentre-runner/lemcentre-runner.service` + reprovision            | installed verbatim from this repo; properties asserted by `verify-boundary.sh`                    |
| Driver consumer + inner wrapper  | `/usr/local/libexec/factory-ci/{driver-process,factory-validate-inner}` | root 0755       | lem-reader PR editing `ops/lemcentre-runner/` + relaunch                                       | root-owned; envelope validation fail-closed; pin re-checked at execution time                     |
| Driver plane units               | `/etc/systemd/system/lemcentre-factory.{service,path}`                  | root 0644       | lem-reader PR editing `ops/lemcentre-runner/` + reprovision                                    | installed verbatim from this repo; properties asserted by `verify-boundary.sh`                    |

Current pin: lemfleet `3c8682b732002b85ba126a2408ee9acb374df2a0`
(lemfleet#12, F5 — the revision whose lemfleet ADR-0012 arrangement this ticket
replaces, unchanged in its guest-launch behavior). Guest confinement
itself (offline NIC-less QEMU, seccomp-sandboxed QEMU process, payload
manifest rehashing) is lemfleet's reviewed F4a shape and is unchanged by
this ticket.

## Residual risks (accepted, documented, probe-recorded)

| Residual                                                                                                                          | Consequence                                                                                                                                                                                         | Mitigation / follow-up                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner account reads its own files (registration `.credentials`, `_diag` logs, factory scratch/evidence)                          | A hostile PR can copy the runner registration credentials (impersonate/remove the runner registration; not repo write) and read other PRs' unit-test evidence                                       | No secrets exist in this surface by design; registration damage is reversible (re-register). Recorded as expected-allow in the probe.                                                                                                                                                                                                                                             |
| Scratch payload-set injection (verdict integrity for _other_ PRs)                                                                 | The scratch is runner-writable, so a hostile PR could pre-plant a poisoned payload set keyed to a future lockfile digest; `ci_validate` would reuse it and the guest could be fed attacker packages | Bounded to guest-internal execution (fake green/red, no host access). Wrapper `env -i` removes the trusted-path vector. Structural fix — move scratch to a dedicated factory identity — belongs to the lemfleet#20 companion and is recorded there.                                                                                                                               |
| Runner egress is unrestricted                                                                                                     | Exfiltration of anything the unit can read; outbound attacks from the host                                                                                                                          | By design: the runner must poll GitHub. Egress-restricted exfil surface is the lemci-local non-secret set above; probe records egress as expected-allow.                                                                                                                                                                                                                          |
| `/dev/kvm` accessible (0666 device)                                                                                               | Hostile PR can run its own nested VMs (resource burn, not escape)                                                                                                                                   | DevicePolicy left at default; guest-side confinement is unchanged and OS-level; noted for lemfleet#20.                                                                                                                                                                                                                                                                            |
| Third-party action supply chain                                                                                                   | `actions/checkout` runs as `lemci`; a compromised action could misuse the account locally                                                                                                           | Pinned to the full commit SHA of v5.0.0 in the lemcentre workflows. Broader pinning is a repo-wide hardening follow-up, not this ticket.                                                                                                                                                                                                                                          |
| No `MemoryDenyWriteExecute` / `SystemCallFilter`                                                                                  | Broader in-memory exploit surface for the runner process                                                                                                                                            | Deliberate: W^X breaks QEMU guest RAM and an unproven seccomp filter risks breaking node/qemu at runtime; revisit only with tested filters.                                                                                                                                                                                                                                       |
| `ProtectProc=invisible` weakens cross-user debugging                                                                              | Operator tooling inside the unit cannot see desktop processes                                                                                                                                       | Intentional hardening; host-side operator runs outside the unit keep full visibility.                                                                                                                                                                                                                                                                                             |
| Driver plane deliberately minimally hardened (verified necessity: the runner unit's sandbox properties break the harness's bwrap) | A compromised pinned-harness revision would run with fewer unit-level walls                                                                                                                         | The driver executes only the pin-enforced, root-owned harness with fail-closed envelope validation; workflow code cannot execute there. Structural follow-ups (dedicated driver identity, scratch relocation) belong to lemfleet#20.                                                                                                                                              |
| Desktop process cmdlines visible via `/proc` (environ stays denied)                                                               | A hostile PR could read desktop processes' command lines (potential argument leakage)                                                                                                               | `/proc/<pid>/environ` and signal delivery remain denied (uid DAC); recorded in the probe. System-wide `hidepid=` on a dedicated group is the follow-up if the owner wants cmdline hiding too.                                                                                                                                                                                     |
| Factory unit guests do not yet acquire the host heavy-test lease                                                                  | A factory guest can overlap other controlled heavy work on lemcentre (load interference; contention-invalidated measurements)                                                                       | Deferred and recorded: [lemcentre-ci-migration.md](lemcentre-ci-migration.md) §Host workload coordination requires a shared host-owned lease before guest launch (bounded admission wait, fail visibly on expiry); its concrete mechanism is to be specified and tested during migration implementation. Seam marked in `factory-validate-inner` immediately before guest launch. |

## Verification

1. **Host-side (reproducible, root):**
   `sudo bash ops/lemcentre-runner/provision.sh launcher` (once) and
   `account` (quiet window), then
   `sudo bash ops/lemcentre-runner/verify-boundary.sh --receipt <path>`.
   Asserts every invariant above, then runs the hostile probe as `lemci`.
2. **Workflow-side (PR-controlled-code demonstration):** dispatch the
   `boundary-probe` workflow on `main`. It is owner-dispatched evidence,
   never a required check; the job summary table lists every hostile
   attempt and its observed outcome.
3. **Unit-validation regression evidence:** the PR carrying this change
   re-runs `factory-validation` after the account switch, so the gate's
   green verdict is produced by the confined runner through the new
   wrapper — proving the disposable offline guest path is preserved
   unchanged (same check name, same guest harness revision, now
   pin-enforced).

Evidence record: `docs/verification/` (candidate SHA, receipts, run
links). The boundary must be re-verified after any pin update, runner
major auto-update, or unit change, and before each acceptance step of the
[lemcentre-ci-migration.md](lemcentre-ci-migration.md) sequence. Reboot
recovery of the new system unit is issue #283's scope (`WantedBy=
multi-user.target` is in place; not reboot-tested here).

## Coordination with lemfleet (companion ticket lemfleet#20)

This ticket owns the lem-reader integration: workflow wiring, the trusted
launcher, the pin record, the boundary itself, and acceptance evidence.
The companion owns lemfleet-side follow-ups: the replacement-architecture
ADR superseding lemfleet ADR-0012's accepted exposure, scratch identity hardening,
and rerunning whichever historical confinement evidence the new layout
invalidates (guest launch shape is unchanged, so F4a verdict-parity and
confinement proofs carry over; only the runner-context evidence — host
wrapper path, desktop-home access — is superseded and rerun here).
