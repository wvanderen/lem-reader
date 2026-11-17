#!/bin/bash
# Read-only post-reboot / desired-state verification for the unattended
# Lemcentre runner + factory driver plane (issue #283).
#
#   sudo bash ops/lemcentre-runner/verify-recovery.sh
#
# Answers ONE question: after a reboot (or right now), is the CI plane in
# its desired state WITHOUT anyone logging into the desktop? Checks units
# (enabled/active + restart policies), the trusted control plane (pin,
# harness checkout, Node), an empty spool, the runner's registration in
# the GitHub API (read-only gh), and the recovery-constants invariant from
# the INSTALLED artifacts. Read-only throughout: no start/stop/enable, no
# writes, gh api GET only. Exit 0 = desired state; nonzero = findings.
# Sources + rationale: ops/lemcentre-runner/README.md (#283 section),
# ops/lemcentre-runner/recovery-constants.json.
set -u

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="/var/lib/lem-ci"
JOBS="${STATE_DIR}/factory-jobs"
CI_DIR="/usr/local/libexec/factory-ci"
FLEET="/opt/factory/lemfleet"
RUNNER_UNIT="lemcentre-runner.service"
FACTORY_PATH_UNIT="lemcentre-factory.path"
FACTORY_UNIT="lemcentre-factory.service"
SWEEP_TIMER="lemcentre-factory-sweep.timer"
AWAKE_UNIT="lemcentre-awake.service"
LEM_USER="lem"

FAILURES=0
NOTES=0

fail() { FAILURES=$((FAILURES + 1)); printf 'FAIL  %s\n' "$1"; }
note() { NOTES=$((NOTES + 1)); printf 'note  %s\n' "$1"; }
ok() { printf 'PASS  %s\n' "$1"; }

check() { # check <description> <cmd...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$desc"; else fail "$desc"; fi
}

prop() { systemctl show -p "$1" --value "$2" 2>/dev/null; }

mode_of() { stat -c '%a' "$1" 2>/dev/null; }
owner_of() { stat -c '%U' "$1" 2>/dev/null; }

# systemd duration ("15min", "1min", "10s") -> seconds
# systemd may also emit "15min 10s" (two tokens); sum each token.
dur_sec() {
  local v n u total=0 t
  for t in ${1:-0}; do
    n="${t%%[a-z]*}"; u="${t##*[0-9]}"; n="${n:-0}"
    case "$u" in
      s) total=$((total + n)) ;;
      ms) total=$((total + n / 1000)) ;;
      min) total=$((total + n * 60)) ;;
      h) total=$((total + n * 3600)) ;;
      *) total=$((total)) ;;
    esac
  done
  echo "$total"
}

[ "$(id -u)" = 0 ] || { echo "verify-recovery: must run as root on lemcentre (spool read requires it)" >&2; exit 2; }

echo "Unattended-recovery desired-state verification — $(hostname) $(date -Is) (boot $(uptime -s))"
echo

echo "--- units (unattended start)"
check "${RUNNER_UNIT} is enabled (boots without desktop login)" systemctl is-enabled -q "$RUNNER_UNIT"
check "${RUNNER_UNIT} is active" systemctl is-active -q "$RUNNER_UNIT"
check "${RUNNER_UNIT} Restart=always" test "$(prop Restart "$RUNNER_UNIT")" = always
check "${RUNNER_UNIT} RestartSec=10s" test "$(prop RestartUSec "$RUNNER_UNIT")" = 10s
check "${RUNNER_UNIT} runs as lemci" test "$(prop User "$RUNNER_UNIT")" = lemci
if [ "$(prop NRestarts "$RUNNER_UNIT")" != 0 ]; then
  note "runner restarted $(prop NRestarts "$RUNNER_UNIT")x since boot (Restart=always self-healed it)"
fi
check "${FACTORY_PATH_UNIT} is enabled" systemctl is-enabled -q "$FACTORY_PATH_UNIT"
check "${FACTORY_PATH_UNIT} is active (waiting on the spool)" systemctl is-active -q "$FACTORY_PATH_UNIT"
check "${FACTORY_UNIT} is static (path/timer-started only)" systemctl is-enabled -q "$FACTORY_UNIT"
check "${FACTORY_UNIT} is a oneshot" test "$(prop Type "$FACTORY_UNIT")" = oneshot
if systemctl is-failed -q "$FACTORY_UNIT"; then
  fail "${FACTORY_UNIT} is in failed state"
  if grep -q 'overflow=\$(' "${CI_DIR}/driver-process" 2>/dev/null; then
    note "installed driver-process is the LEGACY copy (exit-2 empty-queue bug); re-run: sudo bash ops/lemcentre-runner/provision.sh launcher"
  else
    note "inspect: journalctl -u ${FACTORY_UNIT} -b --no-pager"
  fi
else
  ok "${FACTORY_UNIT} not in failed state"
fi
check "${SWEEP_TIMER} is enabled (installed by provision.sh recovery)" systemctl is-enabled -q "$SWEEP_TIMER"
check "${SWEEP_TIMER} is active" systemctl is-active -q "$SWEEP_TIMER"
check "${SWEEP_TIMER} re-arms ${FACTORY_UNIT}" test "$(prop Unit "$SWEEP_TIMER")" = "$FACTORY_UNIT"
TIMER_FILE_TEXT="$(systemctl cat "$SWEEP_TIMER" 2>/dev/null || true)"
timer_value() { # timer_value <directive> — from the unit text, "15min"→seconds
  local raw
  raw="$(printf '%s\n' "$TIMER_FILE_TEXT" | sed -n "s/^${1}=//p" | tail -1 | tr -d ' ')"
  [ -n "$raw" ] && dur_sec "$raw" || echo 0
}
check "${SWEEP_TIMER} OnBootSec is bounded (<=5min)" test "$(timer_value OnBootSec)" -le 300

# Optional inhibitor: absence is fine (it is deliberately not enabled by
# default); presence requires consistency, never a shutdown blocker.
if [ -e "/etc/systemd/system/${AWAKE_UNIT}" ]; then
  if grep -q -- '--what=idle' "/etc/systemd/system/${AWAKE_UNIT}" &&
    ! grep -qE -- '--what=[^ ]*(shutdown|sleep)' "/etc/systemd/system/${AWAKE_UNIT}"; then
    ok "${AWAKE_UNIT} inhibits idle only (deliberate shutdown/suspend unaffected)"
  else
    fail "${AWAKE_UNIT} must inhibit --what=idle ONLY"
  fi
  if systemctl is-enabled -q "$AWAKE_UNIT" 2>/dev/null; then
    check "${AWAKE_UNIT} enabled + active" systemctl is-active -q "$AWAKE_UNIT"
  else
    note "${AWAKE_UNIT} installed but not enabled (optional; deliberate)"
  fi
else
  note "${AWAKE_UNIT} not installed (optional idle inhibitor; see ops/lemcentre-runner/README.md)"
fi

echo
echo "--- trusted control plane (would a validation run?)"
check "pin file exists, root-owned, 0644" bash -c "[ \"$(owner_of "${CI_DIR}/lemfleet-rev")\" = root ] && [ \"$(mode_of "${CI_DIR}/lemfleet-rev")\" = 644 ]"
PIN_REV="$(tr -d '[:space:]' < "${CI_DIR}/lemfleet-rev" 2>/dev/null)"
[ -n "$PIN_REV" ] && ok "pin recorded: ${PIN_REV}" || fail "pin file unreadable/empty"
check "harness checkout present at ${FLEET}" test -d "${FLEET}/.git"
ACTUAL_REV="$(git -c safe.directory="$FLEET" -C "$FLEET" rev-parse HEAD 2>/dev/null)"
check "harness checkout HEAD == pin" test "$ACTUAL_REV" = "$PIN_REV"
check "harness checkout tracked-clean" test -z "$(git -c safe.directory="$FLEET" -C "$FLEET" status --porcelain --untracked-files=no 2>/dev/null)"
check "pinned Node runtime responds" /opt/factory/node/bin/node --version
NODE_V="$(/opt/factory/node/bin/node --version 2>/dev/null)"
case "$NODE_V" in v22.*) ok "pinned Node major 22 (${NODE_V})" ;; *) fail "pinned Node left major 22: ${NODE_V:-none}" ;; esac
# Source-vs-installed drift (only when run from a checkout carrying the ops
# sources; post-reboot standalone runs skip the comparison gracefully).
for pair in "driver-process:${CI_DIR}/driver-process" "factory-validate:${CI_DIR}/factory-validate" "factory-driver-sweep.timer:/etc/systemd/system/${SWEEP_TIMER}"; do
  src="${SRC}/${pair%%:*}"; dst="${pair#*:}"
  if [ -f "$src" ] && [ -f "$dst" ]; then
    check "installed $(basename "$dst") matches reviewed source" cmp -s "$src" "$dst"
  fi
done

echo
echo "--- spool (no stranded work)"
check "state dir mode 0700 owned by lemci" bash -c "[ \"$(mode_of "$STATE_DIR")\" = 700 ] && [ \"$(owner_of "$STATE_DIR")\" = lemci ]"
check "spool dir mode 0700 owned by lemci" bash -c "[ \"$(mode_of "$JOBS")\" = 700 ] && [ \"$(owner_of "$JOBS")\" = lemci ]"
PENDING_JOBS="$(find "$JOBS" -maxdepth 1 -name '*.job' 2>/dev/null | wc -l)"
RUNNING_CLAIMS="$(find "$JOBS" -maxdepth 1 -name '*.running' 2>/dev/null | wc -l)"
ORPHAN_RESULTS="$(find "$JOBS" -maxdepth 1 -name '*.result' 2>/dev/null | wc -l)"
if [ "$PENDING_JOBS" -gt 0 ]; then
  fail "spool holds ${PENDING_JOBS} unconsumed envelope(s) (sweep timer should consume within ~15min; check ${FACTORY_UNIT})"
else
  ok "no pending envelopes in the spool"
fi
if [ "$RUNNING_CLAIMS" -gt 0 ]; then
  fail "spool holds ${RUNNING_CLAIMS} .running claim(s) (driver plane died mid-job; sweep converts them to exit-3 after STALE_SECONDS)"
else
  ok "no interrupted claims in the spool"
fi
if [ "$ORPHAN_RESULTS" -gt 0 ]; then
  fail "spool holds ${ORPHAN_RESULTS} unread .result verdict(s) (their wrapper died with a runner restart; clean up only when no Runner.Worker is in flight)"
else
  ok "no orphaned verdicts in the spool"
fi

echo
echo "--- GitHub registration (read-only gh api)"
RUNNER_JSON="$(runuser -u "$LEM_USER" -- env \
  XDG_RUNTIME_DIR="/run/user/$(id -u "$LEM_USER")" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u "$LEM_USER")/bus" \
  gh api repos/wvanderen/lem-reader/actions/runners \
  --jq '.runners[] | select(.name=="lemcentre") | .status + " " + (.busy|tostring)' 2>/dev/null || true)"
if [ -z "$RUNNER_JSON" ]; then
  fail "runner 'lemcentre' not found via gh api (not registered, or gh unavailable as ${LEM_USER})"
else
  RUNNER_STATUS="${RUNNER_JSON%% *}"; RUNNER_BUSY="${RUNNER_JSON##* }"
  if [ "$RUNNER_STATUS" = online ]; then ok "runner 'lemcentre' online in the GitHub API"; else fail "runner 'lemcentre' status: ${RUNNER_STATUS}"; fi
  if [ "$RUNNER_BUSY" = true ]; then
    note "runner is busy (a job is in flight — healthy, but not idle right now)"
  else
    ok "runner 'lemcentre' idle"
  fi
fi

echo
echo "--- recovery-constants invariant (installed artifacts)"
STALE_SECONDS="$(sed -n 's/^STALE_SECONDS=\([0-9]*\).*/\1/p' "${CI_DIR}/driver-process" 2>/dev/null)"
DEADLINE_SECONDS="$(sed -n 's/^DEADLINE_SECONDS=\([0-9]*\).*/\1/p' "${CI_DIR}/factory-validate" 2>/dev/null)"
POLL_SECONDS="$(sed -n 's/^POLL_SECONDS=\([0-9]*\).*/\1/p' "${CI_DIR}/factory-validate" 2>/dev/null)"
TIMER_SEC="$(timer_value OnUnitInactiveSec)"
ACCURACY_SEC="$(timer_value AccuracySec)"
if [ -n "$STALE_SECONDS" ] && [ -n "$DEADLINE_SECONDS" ] && [ -n "$POLL_SECONDS" ] &&
  [ "$TIMER_SEC" -gt 0 ] && [ "$ACCURACY_SEC" -gt 0 ]; then
  ok "STALE_SECONDS=${STALE_SECONDS}s + sweep ${TIMER_SEC}s + accuracy ${ACCURACY_SEC}s vs DEADLINE=${DEADLINE_SECONDS}s - POLL=${POLL_SECONDS}s"
  if [ $((STALE_SECONDS + TIMER_SEC + ACCURACY_SEC)) -le $((DEADLINE_SECONDS - POLL_SECONDS)) ]; then
    ok "swept fail-closed verdict lands before the wrapper deadline (exit 3 beats exit 5)"
  else
    fail "recovery-constants invariant VIOLATED: stale+timer+accuracy > deadline-poll (update ops/lemcentre-runner/recovery-constants.json pairing)"
  fi
else
  fail "could not read recovery constants from installed artifacts (STALE=${STALE_SECONDS:-?} DEADLINE=${DEADLINE_SECONDS:-?} POLL=${POLL_SECONDS:-?} timer=${TIMER_SEC:-?}s accuracy=${ACCURACY_SEC:-?}s)"
fi

echo
FAILED_STARTS="$(journalctl -u "$FACTORY_UNIT" -b --no-pager 2>/dev/null | grep -c 'Failed with result' || true)"
if [ "${FAILED_STARTS:-0}" -gt 0 ]; then
  note "${FACTORY_UNIT} has ${FAILED_STARTS} failed start(s) since boot (legacy exit-2 copy leaves one per validation; the fixed copy exits 0 on an empty queue)"
else
  ok "no failed driver-plane starts since boot"
fi

echo
echo "verify-recovery: ${FAILURES} finding(s), ${NOTES} note(s)"
if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
exit 0
