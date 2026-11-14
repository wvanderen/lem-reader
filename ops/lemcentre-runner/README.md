# Lemcentre runner boundary: provisioning and operation (issue #277)

Operational runbook for the runner/control-plane boundary that keeps
repository-controlled workflow code away from the desktop account on
lemcentre. The design, threat model and residual risks live in
[docs/specs/lemcentre-runner-boundary.md](../../docs/specs/lemcentre-runner-boundary.md);
companion infrastructure ticket: wvanderen/lemfleet#20.

Files in this directory are the **source of truth** for every installed
host artifact. Nothing on the host is hand-edited; provisioning installs
these files verbatim and `verify-boundary.sh` re-compares them.

| File                                             | Installed to                                           | Owner:mode     | Role                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `factory-validate`                               | `/usr/local/libexec/factory-ci/factory-validate`       | root:root 0755 | Trusted launcher (runner-side): the only host step a workflow executes; checks the pin, enqueues a validation job, waits for the verdict |
| `factory-validate-inner`                         | `/usr/local/libexec/factory-ci/factory-validate-inner` | root:root 0755 | Driver-side half: re-checks the pin, runs the pinned harness with a scrubbed environment                                                 |
| `driver-process`                                 | `/usr/local/libexec/factory-ci/driver-process`         | root:root 0755 | Spool consumer: fail-closed envelope validation, serial execution, stale-claim recovery                                                  |
| `factory-driver.service` / `factory-driver.path` | `/etc/systemd/system/lemcentre-factory.{service,path}` | root:root 0644 | The driver plane: minimal verified-safe hardening, triggered by the spool watch                                                          |
| `lemfleet-rev`                                   | `/usr/local/libexec/factory-ci/lemfleet-rev`           | root:root 0644 | The enforced, reviewed lemfleet revision                                                                                                 |
| `lemcentre-runner.service`                       | `/etc/systemd/system/lemcentre-runner.service`         | root:root 0644 | Hardened system unit for the runner                                                                                                      |
| `provision.sh`                                   | (not installed)                                        | —              | Phased root provisioning (`launcher`, `account`)                                                                                         |
| `boundary-probe.sh`                              | `/usr/local/libexec/factory-ci/boundary-probe.sh`     | root:root 0755 | Hostile probe; the workflow runs the reviewed checkout copy, verification runs the installed copy                                   |
| `verify-boundary.sh`                             | (executed as root)                                     | —              | Full boundary invariant check + JSON receipt                                                                                             |

## Layout after provisioning

- Runner account: `lemci` (system user, `nologin`, locked password, not in
  `wheel`), state under `/var/lib/lem-ci/` (runner, work folder, factory
  scratch). `/home` is unreachable to it at the kernel layer
  (`ProtectHome=true`), not merely by permissions.
- Trusted artifacts, all root-owned outside the runner's write path:
  wrapper + pin + inner wrapper + driver consumer
  (`/usr/local/libexec/factory-ci/`), lemfleet harness checkout
  (`/opt/factory/lemfleet`, detached at the pin), Node 22.23.4
  runtime (`/opt/factory/node`, GPG-verified download, same procedure as
  lemfleet's `acquire.py`).
- **Driver plane**: the guest/harness never runs inside the hardened
  runner unit — this systemd build's sandbox properties break the
  harness's reviewed bwrap sandbox (deterministically reproduced during
  #277; see the boundary spec). The wrapper enqueues a validated envelope
  into `/var/lib/lem-ci/factory-jobs` and waits; `lemcentre-factory.path`
  triggers `lemcentre-factory.service` (as `lemci`, with the largest
  verified-safe property set {NoNewPrivileges, ProtectHome, PrivateTmp}),
  which runs only the pinned harness with fail-closed envelope validation
  and returns the verdict through the spool. Serial by construction;
  overflow fails closed immediately (red verdict, exit 3), never silently
  drops.
- The factory scratch (payload sets, evidence, `last-run.log`) moved from
  `/home/lem/.factory-ci` to `/var/lib/lem-ci/factory-ci`; retention rules
  are unchanged (lemfleet `ci_validate.py` prunes it).

## Provisioning (owner, sudo required)

Run in a quiet window — no in-flight `factory-validation` job
(`pgrep -f Runner.Worker` must be empty; `provision.sh` refuses otherwise).

```bash
cd <lem-reader checkout at the reviewed revision>
sudo bash ops/lemcentre-runner/provision.sh launcher   # no service touched
# ... push/merge the boundary PR; its gate still runs on the old runner ...
sudo bash ops/lemcentre-runner/provision.sh account    # brief interruption
sudo bash ops/lemcentre-runner/verify-boundary.sh --receipt /tmp/boundary-receipt.json
```

`launcher` installs the trusted control plane without touching the running
desktop-user runner, so in-flight PRs keep working (old wrapper path still
present). `account` stops the desktop-user unit, moves the runner
registration (`.runner`/`.credentials` are file-based; the runner keeps its
identity and labels — `lemcentre`, `[self-hosted, lemcentre]` — so workflow
routing is unchanged), installs the hardened system unit and waits for the
runner to report online. The old runner directory is preserved at
`/home/lem/.factory-ci/runner.migrated-277` for rollback.

## Enforced trusted revision and update procedure

The pin (`lemfleet-rev`) currently records lemfleet
`3c8682b732002b85ba126a2408ee9acb374df2a0` (lemfleet#12, F5 — the revision
that took over `factory-validation`, lemfleet ADR-0012). **A clean checkout is not a
pin**: the wrapper compares the harness checkout's HEAD against the pin
file on every run and refuses mismatches (exit 4), so an outdated, advanced
or locally modified checkout cannot silently produce check runs.

To move the pin (owner; explicit review of the lemfleet diff required):

1. Review the lemfleet change (the harness code executes inside the guest
   launch path). Coordinate with the companion ticket (lemfleet#20).
2. Record the new SHA in `ops/lemcentre-runner/lemfleet-rev` in a lem-reader
   PR — the same reviewed PR is the provenance record.
3. Merge, then on lemcentre re-run `provision.sh launcher` from the merged
   checkout (it fetches `/opt/factory/lemfleet`, checks out the new pin,
   reinstalls wrapper + pin and re-verifies).
4. Re-run `verify-boundary.sh` and dispatch the `boundary-probe` workflow.

The runner software itself (`/var/lib/lem-ci/runner`) auto-updates from
actions/runner releases; ownership of that update is upstream (GitHub),
accepted in the threat model. The wrapper/pin/checkout/node set is exactly
what this repo reviews — nothing else feeds the guest-launch path.

## Verification and evidence

- Host-side: `sudo bash ops/lemcentre-runner/verify-boundary.sh
--receipt <path>` — every static invariant plus the hostile probe run as
  `lemci`; nonzero exit on any divergence; JSON receipt for the evidence
  record.
- Workflow-side: dispatch the **`boundary-probe`** workflow (owner-only,
  `workflow_dispatch` on `main`). It is evidence, not a required check;
  its summary table is the PR-controlled-code demonstration.
- Re-run both after: any pin update, any runner auto-update major bump,
  any unit change, and before each migration acceptance step
  (docs/specs/lemcentre-ci-migration.md sequence).

## Rollback (explicit decision required — no automatic fallback)

Rolling back restores the lemfleet ADR-0012 arrangement (desktop-user runner,
accepted exposure); it is a deliberate owner decision, never automatic:

```bash
# 1. stop the confined system unit and the driver plane
sudo systemctl disable --now lemcentre-runner.service lemcentre-factory.path
sudo systemctl stop lemcentre-factory.service
# 2. restore the desktop-user runner (registration was preserved)
sudo mv /home/lem/.factory-ci/runner.migrated-277 /home/lem/.factory-ci/runner
sudo chown -R lem:lem /home/lem/.factory-ci/runner
runuser -u lem -- env XDG_RUNTIME_DIR=/run/user/1000 \
  systemctl --user enable --now lemcentre-runner.service
# 3. revert the workflow wrapper path (factory-validation.yml) to
#    /home/lem/.factory-ci/bin/factory-validate, or leave the boundary PR
#    reverted; in-flight PRs need a factory-validation re-run.
```

The trusted launcher (`/usr/local/libexec/factory-ci`, `/opt/factory`) is
inert once no workflow references it; remove with
`rm -rf /usr/local/libexec/factory-ci /opt/factory` if a full uninstall is
wanted. Runner unavailability of either shape leaves required checks
pending or failed — never bypassed (no laptop fallback; migration plan
failure policy).

## Historical note

`/home/lem/.factory-ci/bin/factory-validate` (lemfleet#12, F5) remains on
disk but is inert after cutover: the workflow calls the root-owned wrapper,
which now lives outside the desktop home. It is a decommission candidate
once the migration's acceptance evidence is approved.
