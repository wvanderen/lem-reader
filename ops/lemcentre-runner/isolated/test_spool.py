"""Local acceptance at the client/driver seam. Run in a throwaway user namespace.

unshare --user --map-auto --map-root-user -- python3 -B -m unittest discover \
  -s ops/lemcentre-runner/isolated -p 'test_*.py'
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPT = Path(__file__).with_name('spool.py').resolve()
RUNNER = 10
DRIVER = 11
HEAD = 'a' * 40
ID = 'b' * 32


class SpoolAcceptance(unittest.TestCase):
    def setUp(self):
        if os.getuid() != 0 or Path('/proc/self/uid_map').read_text().split()[1] == '0':
            self.skipTest('requires a throwaway mapped user namespace, not host root')
        world = tempfile.TemporaryDirectory(prefix='lem-spool-')
        self.addCleanup(world.cleanup)
        self.root = Path(world.name)
        self.root.chmod(0o755)
        self.queue = self.root / 'queue'
        self.queue.mkdir(mode=0o755)
        self.inbox = self.directory(self.queue / 'inbox', DRIVER, RUNNER, 0o3770)
        self.replies = self.directory(self.queue / 'replies', DRIVER, RUNNER, 0o2750)
        self.scratch = self.directory(self.root / 'scratch', DRIVER, DRIVER, 0o700)
        self.fleet = self.root / 'fleet'
        self.fleet.mkdir(mode=0o755)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Staging')
        self.git('config', 'user.email', 'staging@example.invalid')
        self.git('commit', '--allow-empty', '-qm', 'reviewed harness')
        self.git('checkout', '-q', '--detach')
        self.pin = self.root / 'lemfleet-rev'
        self.pin.write_text(self.git('rev-parse', 'HEAD') + '\n')
        self.pin.chmod(0o644)
        # Execute a copy outside the desktop checkout so both staging users
        # can read it even when the user's home has mode 0700.
        self.script = self.root / 'spool.py'
        self.script.write_bytes(SCRIPT.read_bytes())
        self.script.chmod(0o644)

    def directory(self, path, uid, gid, mode):
        path.mkdir()
        os.chown(path, uid, gid)
        path.chmod(mode)
        return path

    def git(self, *args):
        return subprocess.check_output(['/usr/bin/git', '-C', self.fleet, *args], text=True).strip()

    def command(self, *args):
        return [sys.executable, '-IB', self.script, '--queue', self.queue,
                '--scratch', self.scratch, '--fleet', self.fleet, '--pin', self.pin,
                '--runner-uid', str(RUNNER), *args]

    def as_user(self, uid, *args, groups=()):
        return subprocess.run(args, user=uid, group=uid, extra_groups=groups,
                              capture_output=True, text=True, timeout=15)

    def serve(self):
        return self.as_user(DRIVER, *self.command('serve'), groups=(RUNNER,))

    def test_clean_checkout_at_unreviewed_revision_does_not_start_driver(self):
        self.git('commit', '--allow-empty', '-qm', 'different, clean revision')
        observed = self.serve()
        self.assertEqual(observed.returncode, 4, observed.stderr)
        self.assertIn('not the reviewed revision', observed.stderr)

    def test_untracked_harness_file_stops_driver_at_the_right_pin(self):
        (self.fleet / 'unreviewed.py').write_text('# not in the pinned tree\n')
        observed = self.serve()
        self.assertEqual(observed.returncode, 4, observed.stderr)
        self.assertIn('tracked or untracked drift', observed.stderr)

    def test_malformed_request_gets_driver_owned_failed_reply(self):
        request = self.inbox / f'{ID}.job'
        submitted = self.as_user(RUNNER, '/bin/sh', '-c',
                                 'umask 027; printf "%s" "$1" > "$2"', 'sh',
                                 json.dumps({'id': ID, 'head': HEAD, 'lane': 'unit',
                                             'checkout': '/tmp/not-a-driver-source'}), request)
        self.assertEqual(submitted.returncode, 0, submitted.stderr)
        accepted = self.serve()
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        reply = self.replies / f'{ID}.result'
        self.assertEqual(json.loads(reply.read_text()), {'id': ID, 'exit': 3})
        denied = self.as_user(RUNNER, '/bin/sh', '-c', 'echo bad > "$1"', 'sh', reply)
        unlinked = self.as_user(RUNNER, '/usr/bin/rm', '-f', reply)
        private = self.as_user(RUNNER, '/usr/bin/ls', self.scratch)
        self.assertNotEqual(denied.returncode, 0)
        self.assertNotEqual(unlinked.returncode, 0)
        self.assertNotEqual(private.returncode, 0)
        self.assertEqual(json.loads(reply.read_text())['exit'], 3)

    def test_symlink_request_refused_without_reading_target(self):
        fixture = self.root / 'canary.json'
        fixture.write_text(json.dumps({'id': ID, 'head': HEAD, 'lane': 'unit'}))
        link = self.as_user(RUNNER, '/usr/bin/ln', '-s', fixture, self.inbox / f'{ID}.job')
        self.assertEqual(link.returncode, 0, link.stderr)
        observed = self.serve()
        self.assertEqual(observed.returncode, 0, observed.stderr)
        self.assertEqual(json.loads((self.replies / f'{ID}.result').read_text()),
                         {'id': ID, 'exit': 3})
        self.assertTrue(fixture.is_file())

    def test_stale_private_claim_is_failed_not_replayed(self):
        claims = self.directory(self.scratch / 'claims', DRIVER, DRIVER, 0o700)
        claimed = claims / f'{ID}.claim'
        claimed.touch()
        os.chown(claimed, DRIVER, DRIVER)
        past = time.time() - 4900
        os.utime(claimed, (past, past))
        observed = self.serve()
        self.assertEqual(observed.returncode, 0, observed.stderr)
        self.assertEqual(json.loads((self.replies / f'{ID}.result').read_text()),
                         {'id': ID, 'exit': 3})
        self.assertFalse(claimed.exists())

    def test_browser_smoke_without_reviewed_assets_is_non_green(self):
        modules = self.fleet / 'proof/f4a'
        modules.mkdir(parents=True)
        (modules / 'driver_source.py').write_text('checkout_from_origin = None\n')
        (modules / 'envelope.py').write_text('validate_sidecar = None\n')
        self.git('add', 'proof')
        self.git('commit', '-qm', 'fixture browser transport')
        self.pin.write_text(self.git('rev-parse', 'HEAD') + '\n')
        job = self.inbox / f'{ID}.job'
        staged = self.as_user(RUNNER, '/bin/sh', '-c',
                              'umask 027; printf "%s" "$1" > "$2"', 'sh',
                              json.dumps({'id': ID, 'head': HEAD, 'lane': 'browser-smoke'}), job)
        self.assertEqual(staged.returncode, 0, staged.stderr)
        observed = self.serve()
        self.assertEqual(observed.returncode, 0, observed.stderr)
        self.assertEqual(json.loads((self.replies / f'{ID}.result').read_text()),
                         {'id': ID, 'head': HEAD, 'lane': 'browser-smoke', 'exit': 33})

    def test_unported_nightly_lane_cannot_reach_legacy_driver(self):
        observed = self.as_user(RUNNER, *self.command('submit', 'browser-nightly', HEAD))
        self.assertEqual(observed.returncode, 34, observed.stderr)
        self.assertEqual(list(self.inbox.iterdir()), [])

    def test_client_receives_trusted_unit_verdict_without_passing_workspace(self):
        harness = self.fleet / 'proof' / 'f4a' / 'ci_validate.py'
        harness.parent.mkdir(parents=True)
        harness.write_text('''import argparse, json
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--head', required=True)
p.add_argument('--scratch', required=True)
p.add_argument('--isolated-driver', action='store_true', required=True)
p.add_argument('--lease-file', type=Path, required=True)
p.add_argument('--lease-record', type=Path, required=True)
a = p.parse_args()
assert a.head == 'a' * 40 and json.loads(a.lease_file.read_text()) == json.loads(a.lease_record.read_text())
raise SystemExit(2)
''')
        self.git('add', 'proof')
        self.git('commit', '-qm', 'fixture unit driver')
        self.pin.write_text(self.git('rev-parse', 'HEAD') + '\n')
        lease_cli = self.root / 'lease.py'
        lease_cli.write_text('''import json, os, sys
from pathlib import Path
path = Path(sys.argv[sys.argv.index('--file') + 1])
record = json.dumps({'pid': os.getpid(), 'token': 'test-only'})
path.write_text(record)
print(record, flush=True)
sys.stdin.read()
path.unlink()
''')
        with subprocess.Popen(self.command('submit', 'unit', '--', HEAD, '/does-not-exist'),
                              user=RUNNER, group=RUNNER,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as client:
            try:
                deadline = time.monotonic() + 5
                while not list(self.inbox.glob('*.job')) and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertEqual(len(list(self.inbox.glob('*.job'))), 1)
                observed = self.as_user(DRIVER, *self.command(
                    '--node', sys.executable, '--lease-cli', lease_cli,
                    '--lease-file', self.scratch / 'lease.json', 'serve'), groups=(RUNNER,))
                self.assertEqual(observed.returncode, 0, observed.stderr)
                _, stderr = client.communicate(timeout=12)
                self.assertEqual(client.returncode, 2, stderr)
            finally:
                if client.poll() is None:
                    client.kill()
