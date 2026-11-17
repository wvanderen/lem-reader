#!/usr/bin/env python3
"""Build reproducible fixtures for the guest EVIDENCE bundle class (issue
#282; contract: docs/specs/lemcentre-browser-diagnostics.md §Bundle classes).

The diagnostics fixtures under ../guest-diagnostics/ were produced by the
lemfleet packer itself (issue #279); the evidence class has no packer yet
(the lemfleet companion ticket lands later), so this committed builder is
the reproducible source of the wire format instead. It mirrors the same
deterministic archive shape the transport contract fixes: uncompressed GNU
tar, fixed metadata (mtime 0, uid/gid 0, empty uname/gname, mode 0644),
entries sorted, first entry bundle-manifest.json carrying per-file
path/bytes/sha256 plus the recorded caps block, and the staged pair
{artifacts.tar, bundle-receipt.json} beside it.

When the lemfleet evidence packer lands, cross-check its output against
these fixtures exactly the way #279 did (the adversarial suite then runs
against packer-produced bytes as well).

Usage:
    build.py <case> <outdir>

Cases: good, many-files, per-file-oversize, total-oversize, count-overflow,
       traversal-entry, symlink-entry, manifest-digest-lie,
       manifest-ghost-entry, receipt-digest-lie, receipt-size-lie,
       extra-staged-file, no-detail-manifest, diagnostics-caps.
"""
import argparse
import hashlib
import io
import json
import os
import sys
import tarfile
from pathlib import Path

MIB = 1024 * 1024
# The evidence-class bounds (must match verify-diagnostics-bundle.py and
# docs/specs/lemcentre-browser-diagnostics.md; the builder records them in
# the manifest caps block exactly like the #279 packer does).
EVIDENCE_CAPS = {
    "files": 64,
    "file_bytes": 8 * MIB,
    "total_bytes": 11 * MIB,
    "max_parts": 16000,
    "part_raw_bytes": 768,
    "tar_bytes": 12288000,
}
DIAGNOSTICS_CAPS = {
    "files": 48,
    "file_bytes": 4 * MIB,
    "total_bytes": 10 * MIB,
    "max_parts": 16000,
    "part_raw_bytes": 768,
    "tar_bytes": 12288000,
}


def payload(name, size):
    """Deterministic member bytes (no zero-fill accidents: repeating name
    keeps oversize fixtures obviously non-empty under compression)."""
    body = (f"evidence fixture {name}\n").encode()
    return (body * (size // len(body) + 1))[:size]


def fixed_info(name, size):
    info = tarfile.TarInfo(name)
    info.size = size
    info.mtime = 0
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    info.mode = 0o644
    info.type = tarfile.REGTYPE
    return info


def pack(outdir, members, *, caps=EVIDENCE_CAPS, label="evidence-fixture",
         manifest_overrides=None, receipt_overrides=None, extra_staged=(),
         omit_manifest=False, symlink=None):
    """Stage one bundle pair into outdir from {name: bytes} members."""
    root = Path(outdir)
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 1,
        "caps": dict(caps),
        "dropped": [],
        "files": [
            {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            for name, data in sorted(members.items())
        ],
    }
    if manifest_overrides:
        manifest.update(manifest_overrides)
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.GNU_FORMAT) as tar:
        if not omit_manifest:
            first = json.dumps(manifest, indent=1, sort_keys=True).encode()
            tar.addfile(fixed_info("bundle-manifest.json", len(first)), io.BytesIO(first))
        if symlink is not None:
            info = tarfile.TarInfo(symlink)
            info.type = tarfile.SYMTYPE
            info.linkname = "/etc/passwd"
            info.mtime = 0
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mode = 0o777
            tar.addfile(info)
        for name in sorted(members):
            data = members[name]
            tar.addfile(fixed_info(name, len(data)), io.BytesIO(data))
    archive = buf.getvalue()
    receipt = {
        "v": 1,
        "bytes": len(archive),
        "sha256": hashlib.sha256(archive).hexdigest(),
        "files": len(members),
        "label": label,
        "commit": "c" * 40,
        "generation": "gen1",
    }
    if receipt_overrides:
        receipt.update(receipt_overrides)
    (root / "artifacts.tar").write_bytes(archive)
    (root / "bundle-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    for name in extra_staged:
        (root / name).write_bytes(b"unexpected\n")
    return 0


def evidence_members():
    """The representative evidence-class member set (small stand-ins; the
    fixed names are the contract, the bytes are fixtures)."""
    host_load = {
        "schemaVersion": 1,
        "host": "lemcentre",
        "phases": [
            {
                "phase": "functional",
                "at": "2026-11-20T08:05:00Z",
                "loadavg": {"1m": 2.1, "5m": 1.9, "15m": 1.7},
                "lease": {"owner": "browser-nightly/abc1234/functional"},
            }
        ],
    }
    phases = {
        "schemaVersion": 1,
        "phases": [
            {"phase": "functional", "exit": 0, "engines": {"chromium": 0, "firefox": 0, "webkit": 0}},
        ],
    }
    members = {
        "identity/browser-guest-env.json": b'{"node": "22.23.4", "playwright": "1.61.1"}\n',
        "identity/host-load.json": json.dumps(host_load, indent=2).encode() + b"\n",
        "status/harness-status.json": b'{"status": "done", "exit": 0}\n',
        "verdicts/phases.json": json.dumps(phases, indent=2).encode() + b"\n",
        "reports/e2e-exhaustive-chromium.json": payload("chromium-report", 900),
        "reports/e2e-exhaustive-firefox.json": payload("firefox-report", 900),
        "reports/e2e-exhaustive-webkit.json": payload("webkit-report", 900),
        "comparisons/fingerprint-compare.txt": b"[calibration] D3-10 gate PASSED\n",
        "calibration/merged.json": b'{"schemaVersion": 1, "engines": {}}\n',
        "comparisons/budget-compare.txt": b"[perf] D6-04 gate PASSED\n",
        "perf/measured.json": b'{"schemaVersion": 1, "engines": {}}\n',
    }
    return members


CASES = {
    "good": lambda out: pack(out, evidence_members()),
    # 60 files: inside the evidence cap (64), over the diagnostics cap (48)
    "many-files": lambda out: pack(
        out, {f"reports/chunk-{i:03d}.json": payload(f"chunk-{i}", 64) for i in range(60)}
    ),
    "per-file-oversize": lambda out: pack(
        out, {**evidence_members(), "reports/huge.json": payload("huge", 8 * MIB + 1)}
    ),
    # 12 x 1 MiB = 12 MiB payload: each file inside the 8 MiB per-file cap,
    # the total over the 11 MiB evidence cap
    "total-oversize": lambda out: pack(
        out, {f"perf/measure-{i:02d}.json": payload(f"measure-{i}", MIB) for i in range(12)}
    ),
    "count-overflow": lambda out: pack(
        out, {f"reports/tiny-{i:03d}.json": b"x" for i in range(65)}
    ),
    "traversal-entry": lambda out: pack(out, {**evidence_members(), "../escape.json": b"no\n"}),
    "symlink-entry": lambda out: pack(out, evidence_members(), symlink="reports/link.json"),
    "manifest-digest-lie": lambda out: pack(
        out,
        evidence_members(),
        manifest_overrides={
            "files": [
                {"path": "reports/e2e-exhaustive-chromium.json", "bytes": 900,
                 "sha256": "0" * 64},
                *[f for f in [
                    {"path": name, "bytes": len(data),
                     "sha256": hashlib.sha256(data).hexdigest()}
                    for name, data in sorted(evidence_members().items())
                    if name != "reports/e2e-exhaustive-chromium.json"
                ]],
            ]
        },
    ),
    "manifest-ghost-entry": lambda out: pack(
        out,
        evidence_members(),
        manifest_overrides={
            "files": [
                {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                for name, data in sorted(evidence_members().items())
            ] + [{"path": "reports/ghost.json", "bytes": 4, "sha256": "1" * 64}],
        },
    ),
    "receipt-digest-lie": lambda out: pack(
        out, evidence_members(), receipt_overrides={"sha256": "f" * 64}
    ),
    "receipt-size-lie": lambda out: pack(
        out, evidence_members(), receipt_overrides={"bytes": 1}
    ),
    "extra-staged-file": lambda out: pack(
        out, evidence_members(), extra_staged=("sneaky.json",)
    ),
    "no-detail-manifest": lambda out: pack(out, evidence_members(), omit_manifest=True),
    # A bundle whose manifest records the DIAGNOSTICS caps block: honest
    # under --class diagnostics, a class disagreement under --class evidence.
    "diagnostics-caps": lambda out: pack(
        out, evidence_members(), caps=DIAGNOSTICS_CAPS, label="diag-fixture"
    ),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("case", choices=sorted(CASES))
    parser.add_argument("outdir")
    args = parser.parse_args()
    return CASES[args.case](args.outdir)


if __name__ == "__main__":
    sys.exit(main())
