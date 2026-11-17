#!/bin/bash
# Lemcentre runner/control-plane provisioning (issue #277; lease phase in
# issue #280).
#
# Runs as root on lemcentre. Idempotent per phase; re-running a phase
# converges to the same state. The phases are independently reversible
# (rollback commands: ops/lemcentre-runner/README.md):
#
#   ./provision.sh launcher   Trusted launcher + pin + harness checkout +
#                             pinned Node runtime. No service is touched;
#                             the existing desktop-user runner keeps working
#                             through the old wrapper path.
#   ./provision.sh lease      Host-owned shared heavy-test lease (issue #280):
#                             shared group + /run dir + tmpfiles.d rule + the
#                             trusted lease CLI into the control plane. No
#                             service interruption; membership applies to
#                             new processes (the next factory job, new
#                             desktop sessions).
#   ./provision.sh account    Switch the runner to the confined lemci
#                             account + hardened system unit. Interrupts the
#                             runner briefly: run in a quiet window (no
#                             in-flight factory-validation job).
#   ./provision.sh recovery    Unattended-recovery hardening (issue #283):
#                             install + enable the driver-plane sweep timer
#                             and install (NOT enable) the optional idle
#                             inhibitor. No runner interruption.
#   ./provision.sh all        Launcher, lease, account, recovery — in order.
#
# Source of truth for every installed file is this directory (versioned in
# wvanderen/lem-reader); the enforced lemfleet revision is
# ./lemfleet-rev in the same checkout.
set -euo pipefail
umask 022

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SRC}/../.." && pwd)"
CI_DIR="/usr/local/libexec/factory-ci"
FLEET="/opt/factory/lemfleet"
NODE_VERSION="22.23.4"
NODE_DIST="https://nodejs.org/dist/v${NODE_VERSION}"
NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.xz"
RUNNER_USER="lemci"
STATE_DIR="/var/lib/lem-ci"
LEM_HOME="/home/lem"
OLD_RUNNER="${LEM_HOME}/.factory-ci/runner"
OLD_WRAPPER="${LEM_HOME}/.factory-ci/bin/factory-validate"
FLEET_ORIGIN="https://github.com/wvanderen/lemfleet"
# lemfleet is private; clone from the owner's reviewed local checkout when
# available. Provenance holds regardless of source dirt: the clone is
# content-addressed (exactly the pinned commit's tree) and HEAD==pin is
# verified right after.
FLEET_SOURCE="${FLEET_SOURCE:-/home/lem/.t3/projects/lemfleet}"
LEM_USER="lem"
# Host-owned shared heavy-test lease (issue #280). Contract:
# docs/specs/lemcentre-host-lease.md.
LEASE_GROUP="lem-heavy"
LEASE_DIR="/run/lem-heavy-lease"
LEASE_TMPFILES="/etc/tmpfiles.d/lem-heavy-lease.conf"

step() { printf '\n=== %s\n' "$*"; }
die() { echo "provision: $*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" = 0 ] || die "must run as root (sudo) on lemcentre"
}

pin_rev() { tr -d '[:space:]' < "${SRC}/lemfleet-rev"; }

# ---------------------------------------------------------------- launcher

node_needs_install() {
  [ -x /opt/factory/node/bin/node ] || return 0
  [ "$(/opt/factory/node/bin/node --version 2>/dev/null)" = "v${NODE_VERSION}" ] || return 0
  return 1
}

install_node() {
  step "installing pinned Node ${NODE_VERSION} at /opt/factory/node (GPG-verified, acquire.py procedure)"
  local build="/opt/factory/.node-build"
  rm -rf "$build"
  mkdir -p "$build"
  curl -fsSL --max-filesize 200000 -o "$build/SHASUMS256.txt" "${NODE_DIST}/SHASUMS256.txt"
  curl -fsSL --max-filesize 250000 -o "$build/SHASUMS256.txt.asc" "${NODE_DIST}/SHASUMS256.txt.asc"
  # Verify against ONLY the official active-releaser keyring (same procedure
  # and bounds as lemfleet proof/f4a/acquire.py).
  curl -fsSL --max-filesize 10000000 -o "$build/pubring.kbx" \
    "https://raw.githubusercontent.com/nodejs/release-keys/main/gpg-only-active-keys/pubring.kbx"
  local gnh="$build/gnupg"
  mkdir -p "$gnh"
  chmod 700 "$gnh"
  cp "$build/pubring.kbx" "$gnh/pubring.kbx"
  gpg --no-options --homedir "$gnh" --batch --with-colons --list-keys |
    awk -F: '/^fpr:/{c++} END{exit (c>=8)?0:1}' ||
    die "unexpectedly small official keyring"
  gpg --no-options --homedir "$gnh" --batch --status-fd 1 \
    --output "$build/verified.txt" --verify "$build/SHASUMS256.txt.asc" \
    > "$build/status.log" 2>"$build/verify.err" ||
    die "SHASUMS256 signature did not verify against the official keyring"
  grep -q '^\[GNUPG:\] VALIDSIG' "$build/status.log" || die "no VALIDSIG in verification status"
  # The signing key fingerprint (third VALIDSIG token, acquire.py fields[2])
  # must resolve inside the keyring home, which by construction contains only
  # the official active-releaser keys.
  local signer
  signer="$(awk '/^\[GNUPG:\] VALIDSIG/{print $3; exit}' "$build/status.log")"
  [ -n "$signer" ] || die "no signing fingerprint in verification status"
  gpg --no-options --homedir "$gnh" --batch --with-colons --list-keys "$signer" >/dev/null ||
    die "signing key not in the pinned active-releaser keyring"
  cmp -s "$build/verified.txt" "$build/SHASUMS256.txt" ||
    die "verified clearsigned body differs from fetched SHASUMS256.txt"
  local want
  want="$(awk -v t="$NODE_TARBALL" '$2==t{print $1}' "$build/SHASUMS256.txt")"
  [ -n "$want" ] || die "tarball row missing from SHASUMS256.txt"
  curl -fsSL --max-filesize 60000000 -o "$build/$NODE_TARBALL" "${NODE_DIST}/${NODE_TARBALL}"
  echo "$(sha256sum "$build/$NODE_TARBALL")" | awk '{print $1}' | grep -qx "$want" ||
    die "tarball digest mismatch against signed SHASUMS"
  tar -xJf "$build/$NODE_TARBALL" -C "$build"
  rm -rf /opt/factory/node-"${NODE_VERSION}"
  mv "$build/node-v${NODE_VERSION}-linux-x64" "/opt/factory/node-${NODE_VERSION}"
  ln -sfn "/opt/factory/node-${NODE_VERSION}" /opt/factory/node
  rm -rf "$build"
  chown -R root:root "/opt/factory/node-${NODE_VERSION}" /opt/factory/node
  chmod -R go-w "/opt/factory/node-${NODE_VERSION}"
  "/opt/factory/node/bin/node" --version | grep -qx "v${NODE_VERSION}" ||
    die "installed node does not report v${NODE_VERSION}"
  echo "node $(/opt/factory/node/bin/node --version) installed; npm $(/opt/factory/node/bin/npm --version)"
}

install_launcher() {
  step "installing trusted launcher + pin + driver plane at ${CI_DIR}"
  for f in factory-validate factory-validate-inner driver-process lemfleet-rev; do
    [ -f "${SRC}/$f" ] || die "$f missing beside provision.sh"
  done
  install -d -o root -g root -m 0755 "$CI_DIR"
  install -o root -g root -m 0755 "${SRC}/factory-validate" "${CI_DIR}/factory-validate"
  install -o root -g root -m 0755 "${SRC}/factory-validate-inner" "${CI_DIR}/factory-validate-inner"
  install -o root -g root -m 0755 "${SRC}/driver-process" "${CI_DIR}/driver-process"
  install -o root -g root -m 0644 "${SRC}/lemfleet-rev" "${CI_DIR}/lemfleet-rev"
  # The hostile probe is executed as the runner account during verification;
  # it must therefore live in the root-owned, world-readable control plane
  # (a checkout under the desktop home is unreachable to lemci by design).
  # The workflow runs the repo copy in-runner; verify-boundary.sh asserts
  # installed == reviewed source.
  install -o root -g root -m 0755 "${SRC}/boundary-probe.sh" "${CI_DIR}/boundary-probe.sh"
}

install_harness() {
  step "installing lemfleet harness checkout at ${FLEET} @ $(pin_rev)"
  if [ -d "$FLEET/.git" ]; then
    git -C "$FLEET" fetch --all --prune
  else
    rm -rf "${FLEET}.stale"
    [ ! -e "$FLEET" ] || mv "$FLEET" "${FLEET}.stale.$(date +%s)"
    if [ -d "$FLEET_SOURCE/.git" ]; then
      git clone "$FLEET_SOURCE" "$FLEET"
    else
      git clone "$FLEET_ORIGIN" "$FLEET"
    fi
  fi
  git -C "$FLEET" checkout --detach "$(pin_rev)"
  local actual
  actual="$(git -C "$FLEET" rev-parse HEAD)"
  [ "$actual" = "$(pin_rev)" ] || die "harness checkout is ${actual}, pin is $(pin_rev)"
  [ -z "$(git -C "$FLEET" status --porcelain --untracked-files=no)" ] ||
    die "harness checkout has tracked changes after checkout"
  # Runtime state the harness reads from its checkout: the Stage B base
  # image and its verification receipt are gitignored by design (the pin
  # covers tracked content only; acquire's payload sets are env-redirected
  # to the scratch). Copy them from the reviewed local checkout; run.py
  # re-verifies the image digest against the receipt on every launch and
  # asserts the image stays read-only.
  if [ -d "$FLEET_SOURCE/proof/pi-stage-b/downloads" ]; then
    mkdir -p "$FLEET/proof/pi-stage-b"
    cp -a "$FLEET_SOURCE/proof/pi-stage-b/downloads" "$FLEET/proof/pi-stage-b/downloads"
    find "$FLEET/proof/pi-stage-b/downloads" -name '*.img' -exec chmod a-w {} +
  else
    die "harness runtime state missing in $FLEET_SOURCE/proof/pi-stage-b/downloads"
  fi
  chown -R root:root "$FLEET"
  chmod -R go-w "$FLEET"
}

phase_launcher() {
  require_root
  step "phase launcher: trusted control plane (no service changes)"
  if ! getent passwd "$RUNNER_USER" >/dev/null; then
    useradd --system --home-dir "$STATE_DIR" --shell /usr/bin/nologin "$RUNNER_USER"
    passwd -l "$RUNNER_USER"
  fi
  # State dir must exist before any wrapper run: /var/lib itself is not
  # writable by unprivileged users, so the wrapper's mkdir -p cannot create
  # the first path component. Owned by the runner account; the scratch is
  # written by whoever executes the wrapper (lemci after the account
  # switch, lem only during the pre-switch window where writes fail
  # visibly instead of silently relocating the scratch).
  mkdir -p "$STATE_DIR/factory-ci" "$STATE_DIR/factory-jobs"
  chmod 700 "$STATE_DIR/factory-jobs"; chown "$RUNNER_USER:$RUNNER_USER" "$STATE_DIR" "$STATE_DIR/factory-ci" "$STATE_DIR/factory-jobs"
  chmod 700 "$STATE_DIR"
  [ -f "${SRC}/lemfleet-rev" ] || die "lemfleet-rev missing"
  install_launcher
  if node_needs_install; then install_node; else
    step "node ${NODE_VERSION} already installed at /opt/factory/node"
  fi
  install_harness
  # End-to-end sanity of the boundary checks inside the wrapper itself:
  # the wrapper must refuse when the checkout does not match the pin, and
  # the lemci account must not be able to write any trusted artifact.
  runuser -u "$RUNNER_USER" -- test ! -w "${CI_DIR}/factory-validate" ||
    die "runner can write the trusted wrapper"
  runuser -u "$RUNNER_USER" -- test ! -w "${CI_DIR}/lemfleet-rev" ||
    die "runner can write the pin"
  runuser -u "$RUNNER_USER" -- test ! -w "${FLEET}" ||
    die "runner can write the harness checkout"
  runuser -u "$RUNNER_USER" -- test ! -w "/opt/factory/node/bin" ||
    die "runner can write the pinned Node runtime"
  echo "launcher phase complete:"
  echo "  wrapper  ${CI_DIR}/factory-validate"
  echo "  pin      ${CI_DIR}/lemfleet-rev ($(pin_rev))"
  echo "  harness  ${FLEET} @ $(git -C "$FLEET" rev-parse HEAD)"
  echo "  node     /opt/factory/node -> $(readlink /opt/factory/node)"
  echo
  echo "The existing desktop-user runner is untouched and still serves"
  echo "factory-validation via ${OLD_WRAPPER}. Switch the account only in a"
  echo "quiet window: ./provision.sh account"
}

# ------------------------------------------------------------------- lease

phase_lease() {
  require_root
  step "phase lease: host-owned shared heavy-test lease (issue #280)"
  # The shared group grants exactly one thing: write access to the lease
  # directory (it owns nothing else). Both identities — the factory plane
  # (lemci) and the desktop user running local heavy commands (lem) — become
  # members, so ONE lease file coordinates them. Membership applies to NEW
  # processes: the next factory job (oneshot unit) and new desktop sessions;
  # nothing running is disturbed.
  if ! getent group "$LEASE_GROUP" >/dev/null; then
    groupadd --system "$LEASE_GROUP"
  fi
  usermod -aG "$LEASE_GROUP" "$RUNNER_USER"
  usermod -aG "$LEASE_GROUP" "$LEM_USER"
  # /run is tmpfs — exactly right for leases: no process survives a reboot,
  # so no lease should either (a /var/lib location would persist stale state
  # for no benefit). tmpfiles.d recreates the dir at every boot; 2775 =
  # setgid + group-writable: every record lands group-owned (setgid)
  # regardless of which identity created it, and either identity can
  # read/mutate/sweep per the lib protocol (explicit chmod 0664/0775 in the
  # lib survives the factory plane's UMask=0077).
  printf 'd %s 2775 root %s -\n' "$LEASE_DIR" "$LEASE_GROUP" > "$LEASE_TMPFILES"
  chmod 0644 "$LEASE_TMPFILES"
  systemd-tmpfiles --create "$LEASE_TMPFILES"
  chown root:"$LEASE_GROUP" "$LEASE_DIR"
  chmod 2775 "$LEASE_DIR"
  # Trusted lease tooling: the control-plane copy of the repo's heavy-lease
  # CLI + lib. Source of truth stays this repository (reviewed here, like
  # every installed artifact); PR-controlled checkout content NEVER supplies
  # lease code to the factory path — factory-validate-inner runs this
  # root-owned copy. Re-running the phase refreshes it.
  [ -f "${REPO}/scripts/heavy-lease.mjs" ] || die "scripts/heavy-lease.mjs missing in ${REPO}"
  [ -f "${REPO}/scripts/lib/heavy-lease.mjs" ] || die "scripts/lib/heavy-lease.mjs missing in ${REPO}"
  install -d -o root -g root -m 0755 "${CI_DIR}/lib"
  install -o root -g root -m 0755 "${REPO}/scripts/heavy-lease.mjs" "${CI_DIR}/heavy-lease.mjs"
  install -o root -g root -m 0644 "${REPO}/scripts/lib/heavy-lease.mjs" "${CI_DIR}/lib/heavy-lease.mjs"
  # End-to-end sanity: BOTH identities can write the dir, and the runner
  # account cannot write the trusted lease tool.
  runuser -u "$RUNNER_USER" -- test -w "$LEASE_DIR" ||
    die "factory identity cannot write $LEASE_DIR"
  runuser -u "$LEM_USER" -- test -w "$LEASE_DIR" ||
    die "desktop identity cannot write $LEASE_DIR"
  runuser -u "$RUNNER_USER" -- test ! -w "${CI_DIR}/heavy-lease.mjs" ||
    die "runner can write the trusted lease tool"
  /opt/factory/node/bin/node "${CI_DIR}/heavy-lease.mjs" status --file "${LEASE_DIR}/heavy-test.lease.json" ||
    die "trusted lease tool does not run"
  echo "lease phase complete:"
  echo "  group    $LEASE_GROUP (members: $RUNNER_USER, $LEM_USER)"
  echo "  dir      $LEASE_DIR (2775 root:$LEASE_GROUP, tmpfiles.d-backed)"
  echo "  tool     ${CI_DIR}/heavy-lease.mjs (root-owned copy of scripts/heavy-lease.mjs)"
  echo
  echo "Local heavy commands now default to the shared lease (the dir's"
  echo "presence is the opt-in). Existing desktop sessions should re-login"
  echo "to gain the group. See docs/specs/lemcentre-host-lease.md."
  echo
}

# -------------------------------------------------------------- recovery

install_recovery_units() {
  step "installing the driver-plane sweep timer (issue #283)"
  [ -f "${SRC}/factory-driver-sweep.timer" ] || die "factory-driver-sweep.timer missing beside provision.sh"
  install -o root -g root -m 0644 "${SRC}/factory-driver-sweep.timer" \
    /etc/systemd/system/lemcentre-factory-sweep.timer
  step "installing the OPTIONAL idle inhibitor unit (not enabled)"
  [ -f "${SRC}/lemcentre-awake.service" ] || die "lemcentre-awake.service missing beside provision.sh"
  install -o root -g root -m 0644 "${SRC}/lemcentre-awake.service" \
    /etc/systemd/system/lemcentre-awake.service
  systemctl daemon-reload
  # The sweep timer targets the same static oneshot the path unit starts,
  # so enabling it cannot double-run anything (single-flight coalescing).
  # The inhibitor stays DISABLED: enabling it is a deliberate owner choice
  # (sudo systemctl enable --now lemcentre-awake.service) because it changes
  # machine idle behavior, and idle-only inhibition must remain optional.
  systemctl enable --now lemcentre-factory-sweep.timer
}

phase_recovery() {
  require_root
  step "phase recovery: unattended-operation hardening (no runner interruption)"
  [ -x "${CI_DIR}/driver-process" ] || die "launcher phase incomplete (driver-process missing); run provision.sh launcher first"
  install_recovery_units
  echo
  echo "recovery phase complete:"
  echo "  sweep timer  /etc/systemd/system/lemcentre-factory-sweep.timer (enabled)"
  echo "  inhibitor    /etc/systemd/system/lemcentre-awake.service (installed, NOT enabled)"
  echo
  echo "The sweep timer re-arms the driver plane within 15min of any failed"
  echo "start and after every reboot (OnBootSec=5min), so stranded envelopes"
  echo "and stale claims no longer wait for a new spool write. Constants"
  echo "pairing: ops/lemcentre-runner/recovery-constants.json."
  echo
  echo "Optional idle inhibitor (deliberate enable only; NEVER blocks"
  echo "shutdown/suspend — it holds --what=idle only):"
  echo "  sudo systemctl enable --now lemcentre-awake.service"
  echo
  echo "Verify the desired state read-only:"
  echo "  sudo bash ${SRC}/verify-recovery.sh"
}

# ----------------------------------------------------------------- account

assert_quiet_window() {
  if pgrep -f 'Runner.Worker' >/dev/null; then
    die "a runner job is in flight (Runner.Worker present); wait for it to finish or rerun with --force"
  fi
}

stop_desktop_runner() {
  step "stopping the desktop-user runner service"
  runuser -u "$LEM_USER" -- env XDG_RUNTIME_DIR="/run/user/$(id -u "$LEM_USER")" \
    systemctl --user disable --now lemcentre-runner.service || true
  # Every check is scoped to the OLD runner path: once the confined unit is
  # active, its own (lemci) listener must not be mistaken for the old one.
  local i
  for i in $(seq 1 30); do
    pgrep -f "${OLD_RUNNER}/bin/Runner.Listener" >/dev/null || break
    sleep 2
  done
  if pgrep -f "${OLD_RUNNER}/bin/Runner.Listener" >/dev/null; then
    echo "listener still up; sending TERM to the old service processes"
    pkill -f "${OLD_RUNNER}/runsvc.sh" || true
    pkill -f "${OLD_RUNNER}/bin/Runner.Listener" || true
    sleep 5
  fi
  pgrep -f "${OLD_RUNNER}/bin/Runner.Listener" >/dev/null &&
    die "old runner listener did not stop; investigate before switching accounts"
  return 0
}

migrate_runner() {
  if [ ! -d "$OLD_RUNNER" ]; then
    if [ -d "$STATE_DIR/runner" ]; then
      echo "runner already migrated; refreshing ownership/modes only"
      chown -R "$RUNNER_USER:$RUNNER_USER" "$STATE_DIR"
      chmod 700 "$STATE_DIR"
      chmod 600 "$STATE_DIR/runner/.credentials" "$STATE_DIR/runner/.credentials_rsaparams" 2>/dev/null
      return 0
    fi
    die "old runner dir ${OLD_RUNNER} missing and no migrated runner found"
  fi
  step "migrating runner registration to ${STATE_DIR}/runner (account ${RUNNER_USER})"
  mkdir -p "$STATE_DIR/runner-work" "$STATE_DIR/factory-ci" "$STATE_DIR/factory-jobs"
  chmod 700 "$STATE_DIR/factory-jobs"
  if [ ! -d "$STATE_DIR/runner" ]; then
    cp -a "$OLD_RUNNER" "$STATE_DIR/runner"
    # Registration survives the move: .runner/.credentials are file-based.
    # Byte-level replacement preserves the file shape the runner expects.
    python3 - "$STATE_DIR/runner/.runner" <<'PYEOF'
import sys
path = sys.argv[1]
raw = open(path, 'rb').read()
new = raw.replace(b'/home/lem/.factory-ci/runner-work', b'/var/lib/lem-ci/runner-work')
assert new != raw, 'workFolder path not found in .runner'
open(path, 'wb').write(new)
PYEOF
    chmod 600 "$STATE_DIR/runner/.credentials" "$STATE_DIR/runner/.credentials_rsaparams"
  fi
  mv "$OLD_RUNNER" "${OLD_RUNNER}.migrated-277"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  echo "runner registration migrated; work folder: ${STATE_DIR}/runner-work"
}

install_unit() {
  step "installing hardened system unit /etc/systemd/system/lemcentre-runner.service"
  [ -f "${SRC}/lemcentre-runner.service" ] || die "unit file missing beside provision.sh"
  install -o root -g root -m 0644 "${SRC}/lemcentre-runner.service" \
    /etc/systemd/system/lemcentre-runner.service
  step "installing + enabling the factory driver plane units"
  [ -f "${SRC}/factory-driver.service" ] || die "factory-driver.service missing beside provision.sh"
  [ -f "${SRC}/factory-driver.path" ] || die "factory-driver.path missing beside provision.sh"
  install -o root -g root -m 0644 "${SRC}/factory-driver.service" /etc/systemd/system/lemcentre-factory.service
  install -o root -g root -m 0644 "${SRC}/factory-driver.path" /etc/systemd/system/lemcentre-factory.path
  systemctl daemon-reload
  systemctl enable lemcentre-runner.service
  systemctl restart lemcentre-runner.service
  systemctl enable --now lemcentre-factory.path
  # Enforce the boundary mode after start (systemd no longer manages the
  # dir — StateDirectory deliberately absent, see the unit file comment).
  chown "$RUNNER_USER:$RUNNER_USER" "$STATE_DIR"
  chmod 700 "$STATE_DIR"
}

wait_online() {
  step "waiting for the lemcentre runner to come back online"
  systemctl is-active lemcentre-runner.service >/dev/null ||
    die "system unit not active after start (journalctl -u lemcentre-runner.service)"
  local i online=""
  for i in $(seq 1 60); do
    online="$(runuser -u "$LEM_USER" -- env XDG_RUNTIME_DIR="/run/user/$(id -u "$LEM_USER")" \
      DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u "$LEM_USER")/bus" \
      gh api repos/wvanderen/lem-reader/actions/runners \
      --jq '.runners[] | select(.name=="lemcentre") | .status' 2>/dev/null || true)"
    [ "$online" = "online" ] && break
    sleep 5
  done
  if [ "$online" = "online" ]; then
    echo "runner lemcentre is online (confined account)"
  else
    echo "WARNING: could not confirm online status via gh; check manually:"
    echo "  gh api repos/wvanderen/lem-reader/actions/runners --jq '.runners[] | .name + \" \" + .status'"
    echo "  journalctl -u lemcentre-runner.service -n 50"
  fi
}

phase_account() {
  require_root
  step "phase account: confined runner account (brief runner interruption)"
  [ -x "${CI_DIR}/factory-validate" ] || die "launcher phase incomplete (wrapper missing)"
  [ -r "${CI_DIR}/lemfleet-rev" ] || die "launcher phase incomplete (pin missing)"
  [ -x /opt/factory/node/bin/node ] || die "launcher phase incomplete (node missing)"
  [ "${1:-}" = "--force" ] || assert_quiet_window
  stop_desktop_runner
  migrate_runner
  install_unit
  wait_online
  echo
  echo "account phase complete. Now run, as root:"
  echo "  ./verify-boundary.sh"
  echo "and re-run the PR factory-validation job so its evidence lands on"
  echo "the confined runner. Rollback: ops/lemcentre-runner/README.md."
}

case "${1:-}" in
  launcher) phase_launcher ;;
  lease) phase_lease ;;
  account)
    shift
    phase_account "$@"
    ;;
  recovery) phase_recovery ;;
  all)
    phase_launcher
    phase_lease
    phase_account
    phase_recovery
    ;;
  *)
    echo "usage: provision.sh launcher|lease|account|recovery|all  (account accepts --force)" >&2
    exit 2
    ;;
esac
