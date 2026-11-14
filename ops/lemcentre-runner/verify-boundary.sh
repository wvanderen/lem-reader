#!/bin/bash
# Reproducible boundary verification for the lemcentre runner (issue #277).
#
# Run as root on lemcentre after provisioning:
#   bash ops/lemcentre-runner/verify-boundary.sh [--receipt <path>]
#
# Checks every static invariant of the boundary, then runs the hostile
# probe (boundary-probe.sh) as the runner account and includes its verdict.
# Exit 0 iff the boundary holds. The JSON receipt is the evidence artifact
# referenced by docs/verification/ and docs/specs/lemcentre-runner-boundary.md.
set -u

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECEIPT=""
if [ "${1:-}" = "--receipt" ]; then
  RECEIPT="${2:?--receipt needs a path}"
fi

RUNNER_USER="lemci"
LEM_HOME="/home/lem"
STATE_DIR="/var/lib/lem-ci"
CI_DIR="/usr/local/libexec/factory-ci"
FLEET="/opt/factory/lemfleet"
UNIT="lemcentre-runner.service"

FAILURES=0
declare -a CHECKS=()

check() { # check <description> <cmd...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    CHECKS+=("PASS|$desc|")
    printf 'PASS  %s\n' "$desc"
  else
    CHECKS+=("FAIL|$desc|")
    FAILURES=$((FAILURES + 1))
    printf 'FAIL  %s\n' "$desc"
  fi
}

require_root() { [ "$(id -u)" = 0 ]; }
require_root || { echo "verify-boundary: must run as root on lemcentre" >&2; exit 2; }
mode_of() { stat -c '%a' "$1" 2>/dev/null; }
owner_of() { stat -c '%U' "$1" 2>/dev/null; }

pin_rev() { tr -d '[:space:]' < "$CI_DIR/lemfleet-rev" 2>/dev/null; }

echo "Boundary verification — $(hostname) $(date -Is)"
echo

echo "--- account"
check "runner account $RUNNER_USER exists" getent passwd "$RUNNER_USER"
check "runner shell is nologin" bash -c "[ \"$(getent passwd "$RUNNER_USER" | cut -d: -f7)\" = /usr/bin/nologin ]"
check "runner password locked" bash -c "[ \"$(passwd -S "$RUNNER_USER" 2>/dev/null | awk '{print $2}')\" = L ]"
check "runner not in wheel/sudo groups" bash -c "! id -Gn $RUNNER_USER 2>/dev/null | grep -qwE 'wheel|sudo'"

echo
echo "--- filesystem boundary"
check "desktop home mode 0700 owned by lem" bash -c "[ \"$(mode_of "$LEM_HOME")\" = 700 ] && [ \"$(owner_of "$LEM_HOME")\" = lem ]"
check "runner cannot read the desktop home" runuser -u "$RUNNER_USER" -- env HOME="$STATE_DIR" bash -c '! ls /home/lem >/dev/null 2>&1'
check "runner cannot read the old wrapper" runuser -u "$RUNNER_USER" -- env HOME="$STATE_DIR" bash -c '! head -c1 /home/lem/.factory-ci/bin/factory-validate >/dev/null 2>&1'
check "runner state dir mode 0700" bash -c "[ \"$(mode_of "$STATE_DIR")\" = 700 ]"
check "runner state dir owned by $RUNNER_USER" bash -c "[ \"$(owner_of "$STATE_DIR")\" = $RUNNER_USER ]"
check "no foreign-owned files under $STATE_DIR" \
  bash -c "! find $STATE_DIR \\( -not -user $RUNNER_USER -o -not -group $RUNNER_USER \\) -print -quit | grep -q ."
check "runner credentials mode 0600" bash -c "[ \"$(mode_of "$STATE_DIR/runner/.credentials")\" = 600 ]"
check "runner rsaparams mode 0600 (if present)" bash -c "[ ! -e \"$STATE_DIR/runner/.credentials_rsaparams\" ] || [ \"$(mode_of "$STATE_DIR/runner/.credentials_rsaparams")\" = 600 ]"
check "work folder registered under $STATE_DIR" \
  grep -q '"/var/lib/lem-ci/runner-work"' "$STATE_DIR/runner/.runner"

echo
echo "--- trusted launcher provenance"
check "wrapper exists, root-owned, 0755" bash -c "[ \"$(owner_of "$CI_DIR/factory-validate")\" = root ] && [ \"$(mode_of "$CI_DIR/factory-validate")\" = 755 ]"
check "pin file exists, root-owned, 0644" bash -c "[ \"$(owner_of "$CI_DIR/lemfleet-rev")\" = root ] && [ \"$(mode_of "$CI_DIR/lemfleet-rev")\" = 644 ]"
check "wrapper not writable by runner" runuser -u "$RUNNER_USER" -- bash -c '! test -w /usr/local/libexec/factory-ci/factory-validate'
check "pin not writable by runner" runuser -u "$RUNNER_USER" -- bash -c '! test -w /usr/local/libexec/factory-ci/lemfleet-rev'
check "installed probe matches reviewed source (launcher phase)" cmp -s "$SRC/boundary-probe.sh" "$CI_DIR/boundary-probe.sh"
check "installed wrapper matches reviewed source" cmp -s "$SRC/factory-validate" "$CI_DIR/factory-validate"
check "installed pin matches reviewed source" cmp -s "$SRC/lemfleet-rev" "$CI_DIR/lemfleet-rev"
check "harness checkout root-owned" bash -c "[ \"$(owner_of "$FLEET")\" = root ]"
check "harness checkout clean (tracked files)" bash -c "[ -z \"\$(git -c safe.directory=$FLEET -C $FLEET status --porcelain --untracked-files=no)\" ]"
check "harness HEAD equals enforced pin" bash -c "[ \"\$(git -c safe.directory=$FLEET -C $FLEET rev-parse HEAD)\" = \"\$(cat $CI_DIR/lemfleet-rev | tr -d '[:space:]')\" ]"
check "pinned node root-owned" bash -c "[ \"$(owner_of /opt/factory/node/bin/node)\" = root ]"
check "pinned node reports v22.23.4" bash -c "[ \"\$(/opt/factory/node/bin/node --version)\" = v22.23.4 ]"

echo
echo "--- service boundary"
check "system unit active" systemctl is-active --quiet "$UNIT"
check "system unit enabled at boot" systemctl is-enabled --quiet "$UNIT"
check "unit runs as $RUNNER_USER" bash -c "[ \"\$(systemctl show $UNIT -p User --value)\" = $RUNNER_USER ]"
check "unit ProtectHome=true" bash -c "[ \"\$(systemctl show $UNIT -p ProtectHome --value)\" = yes ]"
check "unit ProtectSystem=strict" bash -c "[ \"\$(systemctl show $UNIT -p ProtectSystem --value)\" = strict ]"
check "unit NoNewPrivileges=true" bash -c "[ \"\$(systemctl show $UNIT -p NoNewPrivileges --value)\" = yes ]"
check "unit has empty capability bounding set" bash -c "[ -z \"\$(systemctl show $UNIT -p CapabilityBoundingSet --value)\" ]"
check "old desktop-user unit disabled or gone" \
  runuser -u lem -- env XDG_RUNTIME_DIR=/run/user/1000 bash -c \
  's=$(systemctl --user is-enabled lemcentre-runner.service 2>&1); [ "$s" = disabled ] || [ "$s" = not-found ]'
check "no Runner.Listener under the desktop user" \
  bash -c "! ps -eo user=,cmd= | grep -F 'Runner.Listener' | awk '{print \$1}' | grep -qx lem"
check "all unit processes run as $RUNNER_USER" \
  bash -c "! ps -eo user=,cmd= | grep -F '/var/lib/lem-ci/runner' | grep -v \"^ *$RUNNER_USER \" | grep -v grep | grep -q ."

echo
echo "--- factory driver plane"
check "driver unit installed" test -f /etc/systemd/system/lemcentre-factory.service
check "spool watch unit installed" test -f /etc/systemd/system/lemcentre-factory.path
check "spool watch active" systemctl is-active --quiet lemcentre-factory.path
check "spool watch enabled at boot" systemctl is-enabled --quiet lemcentre-factory.path
check "driver unit NoNewPrivileges=true" bash -c "[ \"\$(systemctl show lemcentre-factory.service -p NoNewPrivileges --value)\" = yes ]"
check "driver unit ProtectHome=true" bash -c "[ \"\$(systemctl show lemcentre-factory.service -p ProtectHome --value)\" = yes ]"
check "driver plane runs as $RUNNER_USER" bash -c "[ \"\$(systemctl show lemcentre-factory.service -p User --value)\" = $RUNNER_USER ]"
check "spool dir mode 0700" bash -c "[ \"$(mode_of $STATE_DIR/factory-jobs)\" = 700 ]"
check "driver consumer root-owned 0755" bash -c "[ \"$(owner_of $CI_DIR/driver-process)\" = root ] && [ \"$(mode_of $CI_DIR/driver-process)\" = 755 ]"
check "inner wrapper root-owned 0755" bash -c "[ \"$(owner_of $CI_DIR/factory-validate-inner)\" = root ] && [ \"$(mode_of $CI_DIR/factory-validate-inner)\" = 755 ]"
check "installed driver consumer matches reviewed source" cmp -s "$SRC/driver-process" "$CI_DIR/driver-process"
check "installed inner wrapper matches reviewed source" cmp -s "$SRC/factory-validate-inner" "$CI_DIR/factory-validate-inner"

echo
echo "--- hostile probe (as $RUNNER_USER)"
PROBE_LOG="$(mktemp /tmp/lem-boundary-verify.XXXXXX.log)"
if runuser -u "$RUNNER_USER" -- env HOME="$STATE_DIR" \
  LEM_PROBE_RECEIPT="$(mktemp /tmp/lem-boundary-verify.XXXXXX.json)" \
  bash "$CI_DIR/boundary-probe.sh" > "$PROBE_LOG" 2>&1; then
  printf 'PASS  boundary-probe.sh (installed copy; full log: %s)\n' "$PROBE_LOG"
  CHECKS+=("PASS|hostile probe (boundary-probe.sh as $RUNNER_USER)|$PROBE_LOG")
else
  printf 'FAIL  boundary-probe.sh (log: %s)\n' "$PROBE_LOG"
  tail -20 "$PROBE_LOG"
  CHECKS+=("FAIL|hostile probe (boundary-probe.sh as $RUNNER_USER)|$PROBE_LOG")
  FAILURES=$((FAILURES + 1))
fi

echo
echo "--- systemd exposure analysis (informational)"
EXPOSURE="$(systemd-analyze security "$UNIT" 2>/dev/null | tail -1 || true)"
echo "$EXPOSURE"

echo
echo "Result: $FAILURES failing check(s)"
if [ -n "$RECEIPT" ]; then
  {
    printf '{\n  "host": "%s",\n  "generated": "%s",\n  "unit": "%s",\n  "pin": "%s",\n  "harness_head": "%s",\n  "exposure": "%s",\n  "failures": %s,\n  "checks": [\n' \
      "$(hostname)" "$(date -Is)" "$UNIT" "$(pin_rev)" \
      "$(git -c safe.directory="$FLEET" -C "$FLEET" rev-parse HEAD 2>/dev/null)" \
      "$(printf '%s' "$EXPOSURE" | sed 's/"/\\"/g')" "$FAILURES"
    first=1
    for line in "${CHECKS[@]}"; do
      status="${line%%|*}"; rest="${line#*|}"
      desc="${rest%%|*}"; rest="${rest#*|}"; note="$rest"
      [ "$first" = 1 ] || printf ',\n'
      first=0
      /usr/bin/python3 -B - "$status" "$desc" "$note" <<'PYEOF'
import json, sys
print('    {"status": %s, "check": %s, "note": %s}' % tuple(json.dumps(a) for a in sys.argv[1:]), end='')
PYEOF
    done
    printf '\n  ]\n}\n'
  } > "$RECEIPT"
  echo "receipt: $RECEIPT"
fi

if [ "$FAILURES" -gt 0 ]; then
  echo "BOUNDARY VERIFICATION FAILED" >&2
  exit 1
fi
echo "BOUNDARY VERIFICATION PASSED"
