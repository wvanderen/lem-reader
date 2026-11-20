"""Isolated Lemcentre validation transport. See the adjacent operator handoff."""
import argparse
from contextlib import contextmanager
import fcntl
import itertools
import json
from pathlib import Path
import os
import pwd
import re
import select
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import time

CI = Path('/usr/local/libexec/factory-ci')
SHA = re.compile(r'[0-9a-f]{40}')
IDENT = re.compile(r'[0-9a-f]{32}')
REQUEST_BYTES = 512
STALE_SECONDS = 4500
POLL_SECONDS = 10
DEADLINES = {'unit': 5580, 'browser-smoke': 3480, 'browser-suite': 5580,
             'browser-diagnostics': 3500}  # diagnostics: 600 s admission + 2900 s wait
MAX_JOBS = 6
MAX_SCAN = 512
REPLY_SECONDS = 86400
ARTIFACTS_KEPT = 12
LEASE_WAIT_SECONDS = 600
LEASE_RECORD_BYTES = 8192
BROWSER_MODES = {'browser-smoke': 'smoke', 'browser-suite': 'pr',
                 'browser-diagnostics': 'diagnostics'}
LANES = ('unit', *BROWSER_MODES)
ARTIFACT_FILES = {'artifacts.tar': 12_288_000, 'bundle-receipt.json': 8192}


class Refused(ValueError):
    """The installed boundary does not match the reviewed deployment."""


def trusted_harness(fleet: Path, pin: Path) -> str:
    pin_info = pin.lstat()
    if (not stat.S_ISREG(pin_info.st_mode) or pin_info.st_uid != 0
            or stat.S_IMODE(pin_info.st_mode) != 0o644 or pin_info.st_size != 41):
        raise Refused('pin must be a root-owned 0644 file containing one full SHA')
    expected = pin.read_text(encoding='ascii').removesuffix('\n')
    if not SHA.fullmatch(expected):
        raise Refused('pin must contain one full lowercase SHA')
    for folder in (pin.parent, fleet.parent, fleet, fleet / '.git'):
        info = folder.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise Refused(f'not a protected root-owned directory: {folder}')
    command = ['/usr/bin/git', '-c', f'safe.directory={fleet}', '-c', 'core.fsmonitor=false',
               '-C', str(fleet)]
    env = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'GIT_CONFIG_NOSYSTEM': '1',
           'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_OPTIONAL_LOCKS': '0'}

    def git(*args):
        return subprocess.run([*command, *args], env=env, capture_output=True,
                              text=True, check=True, timeout=30).stdout.strip()

    if git('rev-parse', 'HEAD') != expected:
        raise Refused('harness HEAD is not the reviewed revision')
    if git('rev-parse', '--symbolic-full-name', 'HEAD') != 'HEAD':
        raise Refused('reviewed harness HEAD must be detached')
    if git('status', '--porcelain', '--untracked-files=all'):
        raise Refused('harness contains tracked or untracked drift')
    # The approved Stage B image/receipts are ignored runtime assets, not
    # source. Do not tolerate ignored imports alongside the pinned F4a code.
    if git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'proof/f4a'):
        raise Refused('harness contains ignored files under proof/f4a')
    return expected


def bounded_json(path, owner):
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
    with os.fdopen(os.open(path, flags), 'rb') as source:
        info = os.fstat(source.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != owner
                or info.st_nlink != 1 or info.st_size > REQUEST_BYTES):
            raise Refused('request/reply not an owned, bounded regular file')
        payload = source.read(REQUEST_BYTES + 1)
    if len(payload) > REQUEST_BYTES:
        raise Refused('request/reply exceeds size limit')

    def unique_fields(entries):
        fields = dict(entries)
        if len(fields) != len(entries):
            raise Refused('duplicate request/reply field')
        return fields

    return json.loads(payload, object_pairs_hook=unique_fields)


def request_at(path, ident, owner):
    request = bounded_json(path, owner)
    if (not isinstance(request, dict) or set(request) != {'id', 'head', 'lane'}
            or request['id'] != ident or request['lane'] not in LANES
            or not isinstance(request['head'], str) or not SHA.fullmatch(request['head'])):
        raise Refused('invalid validation request')
    return request


def publish(directory, ident, result):
    data = json.dumps({'id': ident, **result}) + '\n'
    with tempfile.NamedTemporaryFile(mode='w', dir=directory, delete=False) as target:
        try:
            target.write(data)
            target.flush()
            os.fchmod(target.fileno(), 0o640)
            os.replace(target.name, directory / f'{ident}.result')
        finally:
            Path(target.name).unlink(missing_ok=True)


def records(directory, suffix):
    with os.scandir(directory) as entries:
        return [Path(entry.path) for entry in itertools.islice(entries, MAX_SCAN)
                if entry.name.endswith(suffix) and IDENT.fullmatch(entry.name.removesuffix(suffix))]


def verify_driver(args, runner_uid):
    uid = os.geteuid()
    if uid in (0, runner_uid) or (args.runner_uid is None and uid == pwd.getpwnam('lem').pw_uid):
        raise Refused('driver must use a distinct, non-root identity')
    queue = args.queue.lstat()
    if not stat.S_ISDIR(queue.st_mode) or queue.st_uid != 0 or queue.st_mode & 0o022:
        raise Refused('queue parent is not root-owned and non-writable by the runner')
    for path, mode in ((args.scratch, 0o700), (args.queue / 'inbox', 0o3770),
                       (args.queue / 'replies', 0o2750)):
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or stat.S_IMODE(info.st_mode) != mode:
            raise Refused(f'wrong directory owner, type, or mode: {path}')


def discard_request(path):
    try:
        path.unlink(missing_ok=True)
    except IsADirectoryError:
        # Never recurse through a runner-controlled directory.
        pass


class LeaseRefused(ValueError):
    """The bounded lease admission ended without a usable record."""


def driver_env(scratch):
    return {'HOME': str(scratch), 'PATH': '/opt/factory/node/bin:/usr/bin:/bin', 'LC_ALL': 'C',
            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}


@contextmanager
def held_lease(args, owner):
    command = [args.node, args.lease_cli, 'acquire', '--hold', '--json', '--file', args.lease_file,
               '--owner', owner, '--wait-seconds', str(LEASE_WAIT_SECONDS), '--ttl-minutes', '120']
    with tempfile.TemporaryDirectory(prefix='lease-', dir=args.scratch) as temporary:
        try:
            holder = subprocess.Popen(command, env=driver_env(args.scratch),
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        except OSError as error:
            raise LeaseRefused('lease tool unavailable') from error
        with holder:
            try:
                deadline = time.monotonic() + LEASE_WAIT_SECONDS + 60
                data = b''
                while b'\n' not in data and len(data) < LEASE_RECORD_BYTES:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not select.select([holder.stdout], [], [], remaining)[0]:
                        raise LeaseRefused('lease wait exceeded')
                    block = os.read(holder.stdout.fileno(), LEASE_RECORD_BYTES - len(data))
                    if not block:
                        raise LeaseRefused('lease holder exited without admission')
                    data += block
                if not data.endswith(b'\n') or holder.poll() is not None:
                    raise LeaseRefused('lease record missing or too large')
                acquisition = Path(temporary) / 'record.json'
                acquisition.write_bytes(data)
                yield acquisition
            finally:
                holder.stdin.close()
                try:
                    holder.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    holder.kill()


def run_unit(args, job):
    head = job['head']
    with held_lease(args, f'factory-validation/{head}') as record:
        command = [sys.executable, '-B', args.fleet / 'proof/f4a/ci_validate.py',
                   '--isolated-driver', '--head', head, '--scratch', args.scratch,
                   '--lease-file', args.lease_file, '--lease-record', record]
        status = subprocess.run(command, env=driver_env(args.scratch), cwd=args.scratch).returncode
        return status if status in (0, 2, 3) else 3


def copy_bundle(sources, destination, *, shared=False):
    """Copy only the fixed, bounded pair; never extract a guest archive."""
    if os.path.lexists(destination):
        raise Refused('diagnostics destination already exists')
    with tempfile.TemporaryDirectory(prefix='.bundle-', dir=destination.parent) as temp:
        staged = Path(temp) / 'pair'
        staged.mkdir(mode=0o700)
        for name, limit in ARTIFACT_FILES.items():
            with sources[name].open('rb') as source:
                data = source.read(limit + 1)
            if not 0 < len(data) <= limit:
                raise Refused(f'diagnostics file outside its size bound: {name}')
            target = staged / name
            target.write_bytes(data)
            if shared:
                target.chmod(0o640)
        if shared:
            staged.chmod(0o2750)
        staged.rename(destination)


def browser_driver(args, job, cancel_file, artifact_dir):
    # Caller checked the exact installed pin before adding this import path.
    from driver_source import checkout_from_origin
    from envelope import validate_sidecar

    head, lane = job['head'], job['lane']
    diagnostics = lane != 'browser-smoke'
    receipt = args.pin.parent / 'browser-guest-env.json'
    image = args.browser_image
    for path in (receipt, image):
        try:
            info = path.lstat()
        except FileNotFoundError:
            return 33
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise Refused(f'browser asset is not a protected root-owned file: {path}')
    if stat.S_IMODE(image.stat().st_mode) & 0o222:
        raise Refused('browser image must be read-only')
    with held_lease(args, f'{lane}/{head[:12]}') as record:
        if os.path.lexists(cancel_file):
            return 5
        with checkout_from_origin(args.scratch, head) as checkout:
            browser_pin = checkout / 'ops/lemcentre-runner/browser-guest/environment-pin.json'
            if browser_pin.resolve() != browser_pin or not browser_pin.is_file():
                raise Refused('browser pin must be a regular file in the immutable checkout')
            command = [sys.executable, '-B', args.fleet / 'proof/f4a/browser_ci.py',
                       '--mode', BROWSER_MODES[lane], '--head', head, '--checkout', checkout,
                       '--scratch', args.scratch, '--pin', browser_pin, '--lemfleet-rev', args.pin,
                       '--receipt', receipt, '--image', image, '--lease-required',
                       '--lease-file', args.lease_file, '--lease-record', record,
                       '--cancel-file', cancel_file]
            pointer = args.scratch / 'last-artifacts.json'
            if diagnostics:
                pointer.unlink(missing_ok=True)
                command.append('--diagnostics')
            status = subprocess.run(command, env=driver_env(args.scratch), cwd=args.scratch).returncode
        if diagnostics and status in (0, 2) and not os.path.lexists(cancel_file):
            try:
                bundle = validate_sidecar(pointer, args.scratch / 'evidence')
                copy_bundle({'artifacts.tar': Path(bundle['bundle']),
                             'bundle-receipt.json': Path(bundle['receipt'])}, artifact_dir, shared=True)
            except (OSError, ValueError) as error:
                print(f'isolated validator: diagnostics unavailable: {error}', file=sys.stderr)
        return status if status in (0, 2, 3, 4, 5, 6, 33, 34) else 3


def run_job(args, job, cancel_file, artifact_dir):
    try:
        if os.path.lexists(cancel_file):
            return 5
        if job['lane'] == 'unit':
            return run_unit(args, job)
        return browser_driver(args, job, cancel_file, artifact_dir)
    except LeaseRefused as error:
        print(f'isolated validator: lease admission refused: {error}', file=sys.stderr)
        return 6
    except ImportError as error:
        print(f'isolated validator: browser transport not provisioned: {error}', file=sys.stderr)
        return 34
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'isolated validator: preparation refused: {error}', file=sys.stderr)
        return 3


def sweep_browser(args):
    # Maintenance uses only the pinned code and its own private runtime;
    # never follow the legacy driver or touch the runner's old scratch.
    browser = args.fleet / 'proof/f4a/browser_guest.py'
    status = subprocess.run([sys.executable, '-B', browser, 'sweep-abandoned',
                             '--scratch', args.scratch], env=driver_env(args.scratch),
                            cwd=args.scratch, timeout=60).returncode
    if status:
        print('isolated validator: browser sweep failed', file=sys.stderr)


def serve(args, runner_uid, revision):
    verify_driver(args, runner_uid)
    inbox, replies = args.queue / 'inbox', args.queue / 'replies'
    claims = args.scratch / 'claims'
    claims.mkdir(mode=0o700, exist_ok=True)
    with (claims / 'driver.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        now = time.time()
        for artifact in records(replies, '.artifacts'):
            if now - artifact.stat().st_mtime >= REPLY_SECONDS:
                shutil.rmtree(artifact)
        for reply in records(replies, '.result'):
            if now - reply.stat().st_mtime >= REPLY_SECONDS:
                reply.unlink()
        if (args.scratch / 'runtime').is_dir():
            try:
                sweep_browser(args)
            except subprocess.TimeoutExpired:
                print('isolated validator: browser sweep timed out', file=sys.stderr)
        for claim in records(claims, '.claim'):
            if now - claim.stat().st_mtime >= STALE_SECONDS:
                reply = replies / f'{claim.stem}.result'
                if not reply.exists():
                    artifact = replies / f'{claim.stem}.artifacts'
                    if artifact.exists():
                        shutil.rmtree(artifact)
                    publish(replies, claim.stem, {'exit': 3})
                    print(f'isolated validator: stale claim {claim.stem} failed closed', flush=True)
                discard_request(inbox / f'{claim.stem}.job')
                discard_request(inbox / f'{claim.stem}.cancel')
                claim.unlink()
        for request in sorted(records(inbox, '.job'))[:MAX_JOBS]:
            ident = request.stem
            if (replies / f'{ident}.result').exists():
                discard_request(request)
                continue
            claim = claims / f'{ident}.claim'
            try:
                claim.touch(exist_ok=False)
            except FileExistsError:
                continue  # prior interrupted admission, reclaimed by the sweep
            try:
                job = request_at(request, ident, runner_uid)
            except (OSError, ValueError, RecursionError) as error:
                print(f'isolated validator: refused request {ident}: {error}', file=sys.stderr)
                publish(replies, ident, {'exit': 3})
            else:
                discard_request(request)
                print(f'isolated validator: {ident} {job["lane"]} {job["head"]} @ {revision}',
                      flush=True)
                status = run_job(args, job, inbox / f'{ident}.cancel',
                                 replies / f'{ident}.artifacts')
                artifacts = sorted(records(replies, '.artifacts'), key=lambda path: path.stat().st_mtime)
                for expired in artifacts[:-ARTIFACTS_KEPT]:
                    shutil.rmtree(expired)
                publish(replies, ident, {'head': job['head'], 'lane': job['lane'], 'exit': status})
            discard_request(request)
            discard_request(inbox / f'{ident}.cancel')
            claim.unlink()
    return 0


def submit(args, runner_uid):
    if os.geteuid() != runner_uid or not SHA.fullmatch(args.head):
        raise Refused('submission requires the runner identity and a full lowercase SHA')
    if args.lane == 'browser-nightly':
        print('isolated validator: nightly phases are not provisioned (exit 34)', file=sys.stderr)
        return 34
    if args.lane in ('browser-suite', 'browser-diagnostics') and not args.checkout:
        raise Refused('diagnostics need a client-side staging directory')
    inbox, replies = args.queue / 'inbox', args.queue / 'replies'
    queue = args.queue.lstat()
    receiver = replies.lstat()
    if (not stat.S_ISDIR(queue.st_mode) or queue.st_uid != 0 or queue.st_mode & 0o022
            or not stat.S_ISDIR(receiver.st_mode) or receiver.st_uid in (0, runner_uid)
            or stat.S_IMODE(receiver.st_mode) != 0o2750):
        raise Refused('reply directory is not isolated from the runner')
    ident = os.urandom(16).hex()
    result = replies / f'{ident}.result'
    identity = {'id': ident, 'head': args.head, 'lane': args.lane}
    with tempfile.NamedTemporaryFile(mode='w', dir=inbox, delete=False) as target:
        try:
            target.write(json.dumps(identity))
            target.flush()
            os.fchmod(target.fileno(), 0o640)
            os.replace(target.name, inbox / f'{ident}.job')
        finally:
            Path(target.name).unlink(missing_ok=True)
    deadline = time.monotonic() + DEADLINES[args.lane]
    poll = 1 if args.lane == 'browser-diagnostics' else POLL_SECONDS

    def interrupted(_signum, _frame):
        raise InterruptedError

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        while time.monotonic() < deadline:
            try:
                verdict = bounded_json(result, receiver.st_uid)
            except FileNotFoundError:
                time.sleep(min(poll, max(0, deadline - time.monotonic())))
                continue
            if verdict == {'id': ident, 'exit': 3}:
                return 3
            if (not isinstance(verdict, dict) or set(verdict) != identity.keys() | {'exit'}
                    or any(verdict[key] != value for key, value in identity.items())
                    or type(verdict['exit']) is not int
                    or verdict['exit'] not in (0, 2, 3, 4, 5, 6, 33, 34)):
                raise Refused('reply does not match the submitted validation')
            artifact = replies / f'{ident}.artifacts'
            if args.lane in ('browser-suite', 'browser-diagnostics') and artifact.is_dir():
                try:
                    copy_bundle({name: artifact / name for name in ARTIFACT_FILES},
                                args.checkout / '.guest-diagnostics')
                except (OSError, ValueError) as error:
                    print(f'isolated validator: diagnostics staging refused: {error}', file=sys.stderr)
            return verdict['exit']
    except InterruptedError:
        pass
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    try:
        (inbox / f'{ident}.cancel').touch(exist_ok=False)
    except FileExistsError:
        pass
    print(f'isolated validator: validation {ident} interrupted or timed out', file=sys.stderr)
    return 5


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--queue', type=Path, default=Path('/var/lib/lem-vq'))
    parser.add_argument('--scratch', type=Path, default=Path('/var/lib/lem-v'))
    parser.add_argument('--fleet', type=Path, default=Path('/opt/factory/lemfleet'))
    parser.add_argument('--pin', type=Path, default=CI / 'lemfleet-rev')
    parser.add_argument('--runner-uid', type=int)
    parser.add_argument('--node', type=Path, default=Path('/opt/factory/node/bin/node'))
    parser.add_argument('--lease-cli', type=Path, default=CI / 'heavy-lease.mjs')
    parser.add_argument('--lease-file', type=Path,
                        default=Path('/run/lem-heavy-lease/heavy-test.lease.json'))
    parser.add_argument('--browser-image', type=Path,
                        default=Path('/opt/factory/browser-base.qcow2'))
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('serve')
    client = commands.add_parser('submit')
    client.add_argument('lane', choices=(*LANES, 'browser-nightly'))
    client.add_argument('head')
    client.add_argument('checkout', type=Path, nargs='?')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        runner_uid = args.runner_uid if args.runner_uid is not None else pwd.getpwnam('lemci').pw_uid
        if args.command == 'submit':
            return submit(args, runner_uid)
        revision = trusted_harness(args.fleet, args.pin)
        sys.path.insert(0, str(args.fleet / 'proof/f4a'))
        return serve(args, runner_uid, revision)
    except (KeyError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'isolated validator refused: {error}', file=sys.stderr)
        return 4


if __name__ == '__main__':
    raise SystemExit(main())
