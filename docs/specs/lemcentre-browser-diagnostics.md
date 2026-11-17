# Lemcentre browser diagnostics: bounded artifact transport (issue #279)

Status: lem-reader integration implemented (issue #279) and lemfleet
transport implemented ([lemfleet#22](https://github.com/wvanderen/lemfleet/issues/22),
branch `t3/lemfleet-22-implementation`); **host provisioning and the trusted
launcher do not exist yet** — they land through the owner-gated pin/provision
procedure with the browser guest ([lemfleet#21](https://github.com/wvanderen/lemfleet/issues/21)).
Until then the `browser-guest-diagnostics` lane stays visibly red (exit 34,
"diagnostics transport not provisioned"), exactly like the smoke lane's
exit 33. Parent plan: [lemcentre-ci-migration.md](lemcentre-ci-migration.md)
(sequence step 2, boundary and lifecycle proof); environment prerequisite:
[lemcentre-browser-guest.md](lemcentre-browser-guest.md) (issue #278).

## Purpose

Make guest browser failures diagnosable **without weakening confinement**.
The only guest→host data path remains the Stage B virtio-serial frame
protocol with its reviewed bounds unchanged (16384-byte requests, 8192-byte
replies, 1024-byte returned text, 3-second operations, one in-flight
request, patched 20000-request bound). Diagnostics are therefore transported
as _channel-shaped data_: a bounded archive the guest packs, the driver
pages by fixed name, and the host validates before anyone looks at it.

Nothing is extracted on the lemcentre host at any point. The bundle is
verified as bytes and uploaded as bytes; extraction happens on the
reviewer's machine after download. This is the "reviewed safe mechanism"
the parent plan requires for artifact export.

## Selected artifact set and fixed names

The guest packs **explicitly selected** diagnostics under the repository
root inside the guest (selected roots and caps are the single-sourced
constants in lemfleet `proof/f4a/artifacts.py`):

| Selection          | Fixed roots (relative to the repo in the guest)                    |
| ------------------ | ------------------------------------------------------------------ |
| Traces             | `test-results/**` (per-test `trace.zip`, error contexts)           |
| Screenshots        | `test-results/**` (failure screenshots, `only-on-failure` default) |
| Per-engine reports | `playwright-report/**` (the HTML report)                           |

The lane runs `playwright.diagnostics.config.ts` (the repo's ordinary
config with a `testMatch` for the fixture), so the default output roots
apply unchanged and the existing retry/trace discipline
(`retries: CI ? 1 : 0`, `trace: "on-first-retry"`) produces the artifacts.
**The launcher contract requires `CI=true` in the guest** so that
discipline is active there.

## Bounds (the contract numbers)

Single source: lemfleet `proof/f4a/artifacts.py` (lemfleet#22). Repeated
verbatim in `ops/lemcentre-runner/browser-guest/verify-diagnostics-bundle.py`
so the uploader refuses drift in either direction; the vitest suite
(`tests/unit/guest-diagnostics-bundle.test.ts`) exercises both against
committed fixtures.

| Bound            | Value            | Why                                                                                                    |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Max files        | 48               | bounds manifest work and entry-count validation                                                        |
| Per-file bytes   | 4 MiB            | bounds any single trace/report asset                                                                   |
| Total file bytes | 10 MiB           | covers per-engine traces + screenshots + report for a failing suite                                    |
| Part size        | 768 raw bytes    | base64 → exactly 1024 chars = the channel's reply-text cap, single line                                |
| Max parts        | 16 000           | keeps ready + ≤580 polls + ≤80 tails + 1 manifest + parts inside the 20000-request bound (margin 3338) |
| Archive bound    | 12 288 000 bytes | `MAX_PARTS × PART_RAW_BYTES`; hard stop host-side too                                                  |
| Receipt          | ≤ 1024 bytes     | crosses in ONE read op (`artifacts/manifest.json`)                                                     |

Archive format: deterministic uncompressed tar (fixed metadata, sorted
entries, GNU format), first entry `bundle-manifest.json` (per-file
path/bytes/sha256 plus the recorded cap-dropped files). The guest splits
its base64 into `artifacts/part-000001…` (no trailing newline; every part
≤ 1024 chars).

## Transport path and fail-closed rules

1. **Guest pack** (lemfleet `proof/f4a/artifacts.py`, seeded as
   `/opt/artifacts.py`, enabled only when the launch passed
   `--diagnostics`): walks the fixed roots, refuses the entire export if
   any symlink or non-regular entry appears under them (the fixed-names
   assumption broke — say so, ship nothing), records cap-dropped files in
   the manifest, writes the receipt **before** the harness status flips to
   `done`.
2. **Driver stream** (`artifacts.stream_bundle`, called by the bwrap'd
   `driver.py`): requests only `artifacts/manifest.json` and
   `artifacts/part-NNNNNN` — the driver never evaluates guest text to
   choose host paths. Every frame is validated against the receipt: strict
   base64, exact part sizes (1024 except the last), running size and
   sha256; the archive is named in the control directory only after the
   final digest matches. Any violation refuses, deletes the partial, and
   records the reason.
3. **Evidence promotion** (`artifacts.promote_bundle` in `run.py`):
   re-validates the archive against the full contract (safe relative
   names, regular entries only, count/size caps, manifest↔archive
   agreement, per-file digests) before the pair
   `evidence/<label>-<stamp>/{artifacts.tar, bundle-receipt.json}` lands
   atomically — receipt written last, so a crash leaves an orphan the
   sweep removes, never a receipt without its archive.
4. **Pointer and sidecar** (`ci_validate.py --diagnostics` →
   `scratch/last-artifacts.json` → lemfleet `proof/f4a/envelope.py`): the
   verdict envelope stays exactly `{"exit": N}`. Diagnostics travel as the
   OPTIONAL spool sidecar `<id>.artifacts`
   (`{v, bundle, receipt, bytes, sha256}`), validated fail-closed by
   `driver-process` (and again by the wrapper): strict schema, both paths
   regular files inside `/var/lib/lem-ci/factory-ci/evidence`, bytes
   within the archive cap, sha256/bytes proven against the actual files.
   A malformed sidecar is dropped loudly and **never changes the verdict**
   — the artifact channel cannot mask or forge a test result.
5. **Staging** (wrapper, mirrored by the `browser-diagnostics` launcher):
   a validated sidecar stages the pair into the checkout under the fixed
   name `.guest-diagnostics/` (`artifacts.tar` + `bundle-receipt.json`) —
   the only names written, and the only place the workflow looks. The
   workflow never learns host paths.
6. **Upload gate** (`ops/lemcentre-runner/browser-guest/verify-diagnostics-bundle.py`):
   the same adversarial contract, re-checked from committed constants
   before upload (see threat model). Exit 0 clean / 1 findings.

## Host-side storage, retention, and disposal

Local storage is the factory scratch evidence tree
(`/var/lib/lem-ci/factory-ci/evidence/<label>-<stamp>/`), pruned by
lemfleet `ci_validate.py`:

| Object                 | Retention                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence directories   | 30 days by mtime (unchanged, #277-era rule)                                                                                                          |
| Artifact bundles       | newest **12** kept regardless of age (`artifacts.prune_bundles`); older runs keep the rest of their evidence. Worst case 12 × 12 288 000 B ≈ 141 MiB |
| Partial/orphan exports | swept every pass and in `run.py` teardown: `*.tmp` partials, orphan archives without receipts, and pairs whose digest no longer match are removed    |
| Payload sets / runtime | newest 6 / 7 days (unchanged)                                                                                                                        |

Interrupted jobs (cancellation, independent timeout, abnormal exit) are
disposed by the existing teardown — SIGKILL of QEMU and the driver,
RUNTIME deletion — plus the partial-export sweep above; the stale-claim
sweep in `driver-process` now runs at **STALE_SECONDS = 5580**, equal to
the wrapper's whole-wait deadline, so an interrupted job can no longer be
"concluded" after its runner already surfaced failure (previously 7200 s
vs 5580 s; reasoning recorded in the wrapper and lemfleet ADR-0013).

GitHub retention: `actions/upload-artifact` v4 with `retention-days: 7`
(matching every existing lane), `if-no-files-found: error`,
`include-hidden-files: true` (the staged directory is dot-prefixed).

## Threat model: adversarial guest output

Repository-controlled code produces the guest's test output, so the
bundle's bytes are hostile until proven otherwise. Every hop re-validates;
each attack class is refused with a specific finding:

| Attack                                 | Refusal                                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path traversal / absolute / `..`       | entry names must be safe relative paths (no absolute, no empty/`.`/`..` components, no backslashes) — packer refuses, driver receipt bounds, promotion and the upload verifier both refuse    |
| Symlink / hardlink / directory entries | packer refuses the whole export on ANY non-regular entry under the roots; promotion + verifier require every archive entry a regular file; staged files must be regular (`lstat`)             |
| Oversized output                       | per-file 4 MiB, total 10 MiB, archive 12 288 000 B — enforced at pack time (drop + record), stream time (running bound), promotion, sidecar validation, and upload verification               |
| Count overflow                         | 48-file cap at pack time and in both validators; part count capped at 16 000 with per-part exact sizes                                                                                        |
| Digest / receipt lies                  | streaming verifies the archive sha256 against the receipt before naming it; promotion and the sidecar re-hash the files; the verifier recomputes every per-file digest from the archive bytes |
| Manifest/archive disagreement          | extras, ghosts, and duplicate manifest entries are findings, not warnings                                                                                                                     |
| Unexpected staged files                | the staged set must be exactly `{artifacts.tar, bundle-receipt.json}`                                                                                                                         |

No host mounts or sockets are exposed to the guest by this change; the
guest remains NIC-less with the seed ISO as its only inbound channel.

## The lane and the launcher contract

`.github/workflows/browser-guest-diagnostics.yml` mirrors
`browser-guest-smoke.yml`'s discipline: `workflow_dispatch` only, runs on
`[self-hosted, lemcentre]`, job-level `if: github.ref_name != 'main'`
(#226), receipt-vs-pin pre-step, never attached to a PR, never a required
check. Until provisioning lands, its pre-step exits **34** ("diagnostics
transport not provisioned") — honest red, never silently green.

The trusted launcher `/usr/local/libexec/factory-ci/browser-diagnostics
<head-sha> <lem-reader-checkout>` (root-owned 0755, to be installed by the
lemfleet browser-guest provisioning with this contract):

- re-checks the enforced pin and the checkout exactly like
  `factory-validate` (exit 4 on divergence);
- enqueues a spool envelope with `"diagnostics": true`
  (`factory-validation.yml`'s envelope plus that optional boolean — the
  unit lane's envelope is unchanged);
- invokes, inside the guest, `npx playwright test
--config=playwright.diagnostics.config.ts` with `CI=true` so the
  existing retry/trace discipline produces traces and failure screenshots;
- returns browser-smoke's exit semantics (0 green · 2 harness red ·
  3 preparation failure · 4 boundary refusal · 5 timeout);
- on a validated sidecar, stages the bundle into
  `<checkout>/.guest-diagnostics/` exactly as `factory-validate` does.

The lane's conclude step is green only for the complete drill: receipt
validated, launcher exit **exactly 2** (the fixture must fail; 0 means the
fixture rotted or the wrong suite ran), bundle verified and uploaded. The
fixture spec (`tests/e2e/guest-diagnostics-fixture.spec.ts`) is excluded
from the functional and PR configs (the calibration/perf precedent), so a
deliberately red spec never attaches to a gate.

## Rollback (how to disable the extension)

Each layer is independently removable, and none is required by a gate:

1. **Stop dispatching** (or delete) `browser-guest-diagnostics.yml` — the
   lane is dispatch-only and never required.
2. **Launcher**: stop passing `--diagnostics` (or remove the launcher).
   Without the flag the guest never writes a receipt, the driver never
   probes, and no sidecar is ever written — the unit-validation path is
   byte-identical to pre-#279 behavior.
3. **Wrappers**: revert `ops/lemcentre-runner/{driver-process,
factory-validate, factory-validate-inner}` to the previous revision
   through the normal provisioning procedure; they are backward compatible
   with envelopes and results without the diagnostics flag/sidecar.
4. Local bundles age out via the existing retention rules once no new ones
   land.

Deployment order matters and is owner-gated: the updated wrappers call the
pinned harness's `proof/f4a/envelope.py` and `--diagnostics` support, so
the lemfleet pin must move to ≥ the lemfleet#22 revision **before** the
new wrappers are provisioned (see
[ops/lemcentre-runner/README.md](../../ops/lemcentre-runner/README.md)).
No deployment has happened as of this writing; nothing here claims
otherwise.
