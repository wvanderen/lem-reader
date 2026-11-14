#!/bin/bash
# Hostile boundary probe for the lemcentre runner account (issue #277).
#
# Simulates what repository-controlled workflow code could try if it wanted
# the desktop account, its credentials, or the trusted factory control
# plane. Every attempt is non-destructive: files are probed by opening them
# (never read into output, never modified), directories by listing, sockets
# by connecting. The probe asserts an expectation per check and fails the
# run if reality diverges:
#
#   deny     the attempt must be refused (desktop/infrastructure access)
#   allow    the attempt must succeed (runner's own by-design capabilities,
#            recorded so the residual surface is explicit, not silent)
#
# Runs inside the hardened runner unit (via the boundary-probe workflow) and
# standalone as the runner account:
#   runuser -u lemci -- bash ops/lemcentre-runner/boundary-probe.sh
#
# Evidence: markdown table on stdout (+ $GITHUB_STEP_SUMMARY when present)
# and a JSON receipt (LEM_PROBE_RECEIPT, default: /tmp — private under the
# unit's PrivateTmp). Threat model: docs/specs/lemcentre-runner-boundary.md.
set -u

LEM_HOME="/home/lem"
CI_DIR="/usr/local/libexec/factory-ci"
FLEET="/opt/factory/lemfleet"
SCRATCH="/var/lib/lem-ci/factory-ci"
RUNNER_HOME="/var/lib/lem-ci"
RECEIPT="${LEM_PROBE_RECEIPT:-$(mktemp /tmp/lem-boundary-probe.XXXXXX.json)}"
SUMMARY="${GITHUB_STEP_SUMMARY:-}"

FAILURES=0
declare -a ROWS=()
declare -a RECEIPT_JSON=()

pyopen() { # pyopen <mode rb|r+b> <path...> — succeeds if ANY path opens
  /usr/bin/python3 -B - "$@" <<'PYEOF'
import sys
mode, paths = sys.argv[1], sys.argv[2:]
for p in paths:
    try:
        with open(p, mode):
            sys.exit(0)
    except OSError:
        continue
sys.exit(1)
PYEOF
}

pyconnect() { # pyconnect <socket-path> — succeeds if connect works
  /usr/bin/python3 -B - "$1" <<'PYEOF'
import socket, sys
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect(sys.argv[1])
    sys.exit(0)
except OSError:
    sys.exit(1)
PYEOF
}

desktop_pids() { ps -eo uid=,pid= --no-headers 2>/dev/null | awk '$1==1000{print $2}'; }

record() { # record <id> <expectation> <allowed 0|1> <detail>
  local id="$1" expect="$2" allowed="$3" detail="$4" verdict note
  if [ "$expect" = "deny" ]; then
    if [ "$allowed" = "0" ]; then verdict=pass; note="denied"; else verdict=FAIL; note="ALLOWED"; FAILURES=$((FAILURES + 1)); fi
  else
    if [ "$allowed" = "0" ]; then verdict=pass; note="allowed (by design)"; else verdict=FAIL; note="DENIED"; FAILURES=$((FAILURES + 1)); fi
  fi
  detail="${detail//$'\n'/ }"
  detail="${detail//|/\\|}"
  ROWS+=("| \`$id\` | $expect | $note | $detail |")
  RECEIPT_JSON+=("  {\"id\": \"$id\", \"expectation\": \"$expect\", \"allowed\": $allowed, \"observed\": \"$note\", \"detail\": $(printf '%s' "$detail" | /usr/bin/python3 -B -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")
  printf '%-28s %-7s %-20s %s\n' "$id" "$expect" "$note" "$detail"
}

deny_cmd() { # command must FAIL
  local id="$1"; shift
  local out status
  out="$("$@" 2>&1 </dev/null)"; status=$?
  if [ "$status" -eq 0 ]; then
    record "$id" deny 1 "unexpected success: $(printf '%s' "$out" | head -c 120)"
  else
    record "$id" deny 0 "refused (exit ${status})"
  fi
}

deny_open_read() { # file must be unreadable
  local id="$1"; shift
  if pyopen rb "$@"; then record "$id" deny 1 "readable"; else record "$id" deny 0 "open refused"; fi
}

deny_open_write() { # file must not be openable for write (non-destructive r+b probe)
  local id="$1"; shift
  if pyopen r+b "$@"; then record "$id" deny 1 "writable"; else record "$id" deny 0 "write open refused"; fi
}

deny_create_in() { # creating a file in the dir must fail; cleans up if it (wrongly) succeeded
  local id="$1" dir="$2"
  local probe="${dir}/.boundary-probe-$$"
  if touch "$probe" 2>/dev/null; then
    rm -f "$probe"
    record "$id" deny 1 "file created (and removed)"
  else
    record "$id" deny 0 "creation refused"
  fi
}

deny_list() { # listing the dir must fail
  local id="$1" dir="$2"
  if ls "$dir" >/dev/null 2>&1; then record "$id" deny 1 "listable"; else record "$id" deny 0 "list refused"; fi
}

allow_probe() {
  local id="$1" note="$2"; shift 2
  local out status
  out="$("$@" 2>&1 </dev/null)"; status=$?
  if [ "$status" -eq 0 ]; then
    record "$id" allow 0 "$note"
  else
    record "$id" allow 1 "failed (exit ${status}): $(printf '%s' "$out" | head -c 120)"
  fi
}

echo "Hostile boundary probe — runner context: uid=$(id -u) user=$(id -un) home=${HOME:-unset}"
echo

echo "--- desktop account and credentials (all must be denied)"
deny_list "desktop_home_list" "$LEM_HOME"
deny_list "desktop_ssh_dir" "$LEM_HOME/.ssh"
deny_open_read "desktop_ssh_private_key" \
  "$LEM_HOME/.ssh/id_ed25519" "$LEM_HOME/.ssh/id_rsa" "$LEM_HOME/.ssh/id_ecdsa"
deny_open_read "desktop_backup_passphrase" "$LEM_HOME/.factory-ci/backup-dev-passphrase"
deny_open_read "desktop_old_wrapper" "$LEM_HOME/.factory-ci/bin/factory-validate"
deny_list "desktop_config_dir" "$LEM_HOME/.config"
deny_list "desktop_t3_dir" "$LEM_HOME/.t3"
deny_list "desktop_mise_store" "$LEM_HOME/.local/share/mise/installs"
deny_list "desktop_dev_checkouts" "$LEM_HOME/dev"
deny_list "desktop_session_dir" "/run/user/1000"

DPIDS="$(desktop_pids | head -1)"
if [ -n "$DPIDS" ]; then
  if kill -0 "$DPIDS" 2>/dev/null; then
    record "desktop_process_signal" deny 1 "signal delivered to desktop pid $DPIDS"
  else
    record "desktop_process_signal" deny 0 "kill -0 refused (errno includes invisible under ProtectProc)"
  fi
  if pyopen rb "/proc/$DPIDS/environ"; then
    record "desktop_process_environ" deny 1 "environ readable"
  else
    record "desktop_process_environ" deny 0 "environ open refused"
  fi
else
  record "desktop_process_signal" deny 0 "no desktop-uid process observable from this context"
  record "desktop_process_environ" deny 0 "no desktop-uid process observable from this context"
fi
if pyconnect "/run/user/1000/bus"; then
  record "desktop_session_bus" deny 1 "connected"
else
  record "desktop_session_bus" deny 0 "connect refused"
fi

echo
echo "--- privilege escalation (all must be denied)"
deny_cmd "sudo_passwordless" sudo -n true
deny_cmd "su_to_desktop" timeout 5 su lem -c true
deny_create_in "trusted_launcher_dir_write" "$CI_DIR"
deny_open_write "trusted_wrapper_write" "$CI_DIR/factory-validate"
deny_open_write "trusted_pin_write" "$CI_DIR/lemfleet-rev"
deny_create_in "harness_checkout_write" "$FLEET"
deny_cmd "harness_git_write" git -c safe.directory="$FLEET" -C "$FLEET" update-ref "refs/heads/.boundary-probe-$$" HEAD
deny_open_write "pinned_node_write" /opt/factory/node/bin/node
deny_create_in "pinned_node_dir_write" /opt/factory/node/bin

echo
echo "--- state and IPC isolation"
if pyconnect "/run/docker.sock"; then
  record "docker_socket" deny 1 "connected to system docker"
else
  record "docker_socket" deny 0 "connect refused (not in docker group)"
fi

echo
echo "--- by-design capabilities (must be allowed; residual surface made explicit)"
allow_probe "egress_internet" "runner egress to github.com (documented residual)" \
  curl -fsI --max-time 15 https://github.com
allow_probe "runner_registration_credentials" \
  "runner's own .credentials readable by its account (documented residual)" \
  pyopen rb "$RUNNER_HOME/runner/.credentials"

if [ -d "$SCRATCH/payloads" ]; then
  if mkdir "$SCRATCH/payloads/.boundary-probe-$$" 2>/dev/null; then
    rmdir "$SCRATCH/payloads/.boundary-probe-$$"
    record "scratch_poisoning_vector" allow 0 "payload-set dir creatable by runner uid (documented residual: cross-PR set injection; see threat model)"
  else
    record "scratch_poisoning_vector" allow 1 "could not create scratch payload dir"
  fi
else
  record "scratch_poisoning_vector" allow 0 "scratch payloads dir absent (launcher-only state); vector not exercised"
fi

echo
echo "--- unit-layer protections (informational)"
if systemctl show lemcentre-runner.service -p ProtectHome -p ProtectSystem -p NoNewPrivileges -p User 2>/dev/null |
  grep -v '^$'; then
  ROWS+=("| \`unit_hardening_properties\` | info | see journal | systemd properties queried |")
fi

# ------------------------------------------------------------------ report

TABLE=$(
  printf '| check | expectation | observed | detail |\n|---|---|---|---|\n'
  printf '%s\n' "${ROWS[@]}"
)
echo
echo "$TABLE"

if [ -n "$SUMMARY" ]; then
  {
    echo "## Hostile boundary probe (issue #277)"
    echo
    echo "uid $(id -u) ($(id -un)) · failures: $FAILURES · $(date -Is)"
    echo
    echo "$TABLE"
  } >> "$SUMMARY" || true
fi

{
  printf '{\n  "generated": "%s",\n  "uid": %s,\n  "failures": %s,\n  "checks": [\n' "$(date -Is)" "$(id -u)" "$FAILURES"
  printf '%s' "${RECEIPT_JSON[0]}"
  printf ',\n%s' "${RECEIPT_JSON[@]:1}"
  printf '\n  ]\n}\n'
} > "$RECEIPT" 2>/dev/null || true
echo "receipt: $RECEIPT"

if [ "$FAILURES" -gt 0 ]; then
  echo "BOUNDARY PROBE FAILED: $FAILURES divergent check(s)" >&2
  exit 1
fi
echo "BOUNDARY PROBE PASSED: every expectation held"
