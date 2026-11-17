# Lemcentre runner rollback runbook (issues #277 / #283)

Status: **procedure reviewed, not yet exercised end-to-end in this exact
shape** — the runner-availability phase below was proved during #277
provisioning (see `docs/verification/2026-11-10-277-runner-boundary.md`);
the enforcement-layer commands and post-cutover variants are documented
from the recorded state (`ops/lemcentre-runner/verify-enforcement.mjs`
re-reads it read-only). The first live rehearsal should follow this runbook
verbatim and record deltas.

Rolling back is a **deliberate owner decision, never automatic**. There is
no standing laptop fallback and no automatic check relaxation anywhere in
the automation: if the Lemcentre plane is unavailable, required checks
**pend or fail** until it is repaired or this runbook is executed by a
human (migration plan failure policy). Nothing here weakens required
checks; the enforcement phase only _repairs_ them to the canonical sets.

Companion sources: [ops/lemcentre-runner/README.md](../../ops/lemcentre-runner/README.md)
(rollforward + provisioning), `ops/lemcentre-runner/verify-enforcement.mjs`
(read-only enforcement verifier used in phase E), the migration plan
([lemcentre-ci-migration.md](lemcentre-ci-migration.md)).

## 0. Preflight — what must be true before rollback is safe

Every item must hold before phase A. If any fails, STOP: the rollback
would trade a degraded-but-honest state for a broken one.

- [ ] **An owner decided to roll back.** Name, date, and reason recorded
      (incident, maintenance window, or acceptance failure). "Returning to
      the Mac" is a separate, additional decision (phase D) — rolling back
      the secured runner does not by itself move reference authority.
- [ ] **No factory-validation job is in flight**: `pgrep -f Runner.Worker`
      is empty on lemcentre, and no `factory-validation` workflow run on
      GitHub is in progress for open PRs. In-flight work dies with the
      runner switch; its check must be re-run afterwards either way.
- [ ] **The rollback target still exists**: `/home/lem/.factory-ci/`
      `runner.migrated-277` is present (the preserved desktop-user runner
      registration). If it is gone, this runbook cannot restore runner
      availability — a fresh runner registration (owner, on GitHub) is
      needed first.
- [ ] **Exactly one runner identity will serve `runs-on:
[self-hosted, lemcentre]`** — the confined unit must be fully
      stopped (phase A) before the desktop-user unit starts; both share
      one registration and must never listen simultaneously.
- [ ] **The desktop user is present or will be** (rollback re-couples CI
      to an interactive login session for the runner's user service — the
      #277 accepted-exposure state returns by design).
- [ ] **Post-cutover only**: decide the `e2e-reference` producer BEFORE
      phase A (phase D). If the Mac is NOT being brought back, the
      reference check will pend until the Linux cutover is re-accepted or
      the Mac returns — that block is the intended failure policy, not a
      fault to fix by editing enforcement.
- [ ] **A canary PR is ready** (phase E) and the owner can watch it.

## A. Runner availability — restore the desktop-user runner

```bash
# 1. stop + disable the confined system plane (all of it: runner, spool
#    watch, safety sweep timer, and the static driver service)
sudo systemctl disable --now lemcentre-runner.service lemcentre-factory.path lemcentre-factory-sweep.timer
sudo systemctl stop lemcentre-factory.service

# 2. optional inhibitor, if it was enabled
sudo systemctl disable --now lemcentre-awake.service 2>/dev/null || true

# 3. restore the preserved desktop-user runner (registration survived the
#    move: .runner/.credentials are file-based)
sudo mv /home/lem/.factory-ci/runner.migrated-277 /home/lem/.factory-ci/runner
sudo chown -R lem:lem /home/lem/.factory-ci/runner
runuser -u lem -- env XDG_RUNTIME_DIR=/run/user/1000 \
  systemctl --user enable --now lemcentre-runner.service
```

Notes:

- The trusted control plane (`/usr/local/libexec/factory-ci`, `/opt/factory`)
  becomes inert once no workflow references it. Keep it for a fast
  re-roll-forward; remove only with a full-uninstall decision
  (`rm -rf /usr/local/libexec/factory-ci /opt/factory`).
- `ops/lemcentre-runner/verify-recovery.sh` is expected to FAIL after this
  phase — it verifies the secured plane's desired state, which rollback
  deliberately removed. Its failure here is confirmation, not an alarm.
- Driver-plane state left behind: any spool stragglers under
  `/var/lib/lem-ci/factory-jobs` (`*.job`, `*.running`, `*.result`) are
  unreachable from the F5-era wrapper path (which has no spool). Record
  their list before disabling, and clear them only when the canary PR
  (phase E) shows the gate green: `sudo ls -la /var/lib/lem-ci/factory-jobs`.

## B. Workflow routing — point the checks at the old producers

1. **factory-validation** (always, this runbook's scope): make
   `.github/workflows/factory-validation.yml` execute the F5-era wrapper
   again — replace the step
   `/usr/local/libexec/factory-ci/factory-validate "$HEAD_SHA" "$GITHUB_WORKSPACE"`
   with `/home/lem/.factory-ci/bin/factory-validate "$HEAD_SHA" "$GITHUB_WORKSPACE"`
   (or simply revert the boundary PR that changed it, if the tree is
   otherwise current). In-flight PRs need a factory-validation re-run.
2. **e2e-reference** (post-cutover rollback only — see phase D): revert
   the `runs-on:` of the `e2e-reference` job in `.github/workflows/ci.yml`
   to `[self-hosted, macOS, reference]`.
3. Any shadow-lane or dispatch-only workflows added during migration
   (e.g. `browser-guest-smoke.yml`) can stay — they are never required
   checks; remove them only as cleanup.

## C. Enforcement layers — repair to the canonical sets

Normally rollback does **not** touch enforcement: the required checks stay
`checks` + `e2e-reference` + `factory-validation` (classic) and
`checks` + `e2e-reference` (ruleset "main guardrails") in both the secured
and the rolled-back arrangement. Use this phase only if an incident (or a
botched cutover attempt) actually changed them. Both layers must be
repaired together — a change to one layer silently redefines the gate.

Read the current state (read-only, also the phase E verifier):

```bash
node ops/lemcentre-runner/verify-enforcement.mjs            # pre-cutover producer set
node ops/lemcentre-runner/verify-enforcement.mjs --expect-linux   # only post-cutover
gh api repos/wvanderen/lem-reader/branches/main/protection
gh api repos/wvanderen/lem-reader/rulesets
gh api repos/wvanderen/lem-reader/rulesets/24549266
```

Repair the classic layer (PUT replaces the whole protection object — send
the complete desired state, not a delta):

```bash
gh api -X PUT repos/wvanderen/lem-reader/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["checks", "e2e-reference", "factory-validation"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Repair the ruleset layer (PATCH `rules` replaces the rules array — send
every rule the ruleset must keep):

```bash
gh api -X PATCH repos/wvanderen/lem-reader/rulesets/24549266 --input - <<'JSON'
{
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "strict": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "checks" },
          { "context": "e2e-reference" }
        ]
      }
    }
  ]
}
JSON
```

Recorded deliberate state (verify-enforcement asserts both):

- classic `enforce_admins: false` → **admin bypass ON** (the owner merges
  own PRs through it — lemfleet ADR-0012). `true` is a surprise, not a
  hardening.
- ruleset "main guardrails" has **no bypass actors**.
- `factory-validation` lives in the classic layer only — do NOT add it to
  the ruleset.

## D. Returning to the Mac — explicit owner decision

Reference authority (`e2e-reference`) returns to the Mac only by decision,
recorded like any other rollback reason. It is never triggered by
Lemcentre unavailability, and nothing automatic points work at the laptop.

- **Before Mac retirement** (the runner is still registered as
  `lem-reference`): phase B.2 is sufficient — revert the job's `runs-on`
  and let a canary PR prove it.
- **After Mac retirement** (registration removed): an owner must
  re-register a self-hosted runner with labels
  `[self-hosted, macOS, reference]` on the Mac (GitHub → Settings →
  Actions → Runners → New self-hosted runner; the heavy-lease contract of
  `docs/agents/test-discipline.md` applies on that box as before). Until
  it is online, `e2e-reference` pends and merges stay blocked — do not
  "unblock" by editing enforcement.
- After the flip, verify with `verify-enforcement.mjs` **without**
  `--expect-linux` (the Mac producer is the expected state again).

## E. Verification after rollback

1. **Enforcement holds** (read-only): `node ops/lemcentre-runner/
verify-enforcement.mjs` exits 0 — canonical sets in both layers,
   `e2e-reference` mapped to the producer phase B/D chose, no bypass
   surprises.
2. **Boundary probe** (the residual-exposure demonstration for the
   rolled-back shape): run the hostile probe as the desktop user from a
   checkout — `bash ops/lemcentre-runner/boundary-probe.sh` — and record
   that the expected-allows match the F5-era accepted exposure (desktop
   account reachable by PR-controlled workflow code: that exposure is the
   reason the secured plane exists; rollback re-accepts it).
3. **Canary PR**: open a PR from a throwaway branch with a trivial,
   non-product change (e.g. a comment). Confirm on GitHub:
   - `checks` green (hosted ubuntu),
   - `factory-validation` green through the OLD wrapper path (log shows
     `~/.factory-ci/bin/factory-validate`, not
     `/usr/local/libexec/factory-ci/factory-validate`),
   - `e2e-reference` green from the producer chosen in phase B/D.
     Close the canary without merging (admin bypass permits closing; do not
     merge throwaway content into main).
4. **Runner hygiene**: `gh api repos/wvanderen/lem-reader/actions/runners`
   shows exactly one `lemcentre` runner online (the desktop-user one), not
   two. If both appear, the confined unit was not fully disabled — redo
   phase A step 1 before anything else.
5. Record the rollback in the issue (#277/#283 or the incident ticket):
   date, reason, phases executed, canary run links, deviations from this
   runbook.

## What is explicitly NOT part of rollback

- Removing or renaming required checks to make a merge pass.
- Any automatic or standing fallback to the laptop.
- Relaxing the sweep timer/constants or boundary verifiers while the
  secured plane is down (they are inert once disabled; re-roll-forward
  reinstalls them via `provision.sh recovery`).
