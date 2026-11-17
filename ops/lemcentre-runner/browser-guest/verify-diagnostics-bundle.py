#!/usr/bin/env python3
"""Verify a staged guest diagnostics bundle against the transport contract
(issue #279; contract: docs/specs/lemcentre-browser-diagnostics.md).

The dispatch-only browser-guest-diagnostics lane runs this BEFORE
uploading anything to GitHub. The bundle was produced by untrusted guest
output and reassembled by the trusted transport; this checker is the last
boundary in the lem-reader checkout, so it trusts nothing it did not
recompute:

- the staged directory contains EXACTLY artifacts.tar and
  bundle-receipt.json, both regular files (a symlinked or otherwise
  non-regular staged file is refused);
- the receipt agrees with the archive's actual size and sha256, and every
  bound holds (files/count, per-file bytes, total bytes, archive bytes);
- inside the archive: every entry is a regular file with a safe relative
  name (no absolute paths, no `..`, no backslashes), the first entry is
  the detail manifest, and the manifest's file list matches the archive
  exactly — no extras, no ghosts — with every recorded size and sha256
  reproduced from the archive's bytes.

The bundle is NEVER extracted on the host: extraction happens on the
reviewer's machine after download. Refusing hostile archives here is what
makes that safe.

This is repository-controlled workflow code in the same trust shape as
verify-environment-receipt.py (issue #278): it only reads and prints; it
cannot influence the guest launch, which goes exclusively through the
root-owned launcher /usr/local/libexec/factory-ci/browser-diagnostics.

Exit codes: 0 bundle matches the contract · 1 findings (printed to
stderr, one per line).

Usage:
    verify-diagnostics-bundle.py --bundle-dir <staged .guest-diagnostics>
"""
import argparse
import hashlib
import json
import os
import stat
import sys
import tarfile
from pathlib import Path

# The single source of these bounds is lemfleet proof/f4a/artifacts.py
# (branch t3/lemfleet-22-implementation, lemfleet#22); they are repeated
# here deliberately so the uploader refuses drift in either direction.
MAX_FILES = 48
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 10 * 1024 * 1024
MAX_TAR_BYTES = 12_288_000
DETAIL_NAME = "bundle-manifest.json"
STAGED_NAMES = {"artifacts.tar", "bundle-receipt.json"}
RECEIPT_KEYS = {"v", "bytes", "sha256", "files", "label", "commit", "generation"}
HEX = set("0123456789abcdef")


def entry_name_findings(name):
    if not isinstance(name, str) or not name or len(name) > 512 or "\\" in name or "\x00" in name:
        return ["unsafe entry path (shape): %r" % (name[:80] if isinstance(name, str) else name)]
    if any(part in ("", ".", "..") for part in name.split("/")):
        return ["unsafe entry path (traversal/absolute): %r" % name[:80]]
    return []


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bundle-dir", required=True, help="staged .guest-diagnostics directory")
    args = parser.parse_args()

    findings: list[str] = []
    root = Path(args.bundle_dir)
    if not root.is_dir():
        print("bundle directory cannot be read: %s is not a directory" % root, file=sys.stderr)
        return 1
    staged = {entry.name: entry for entry in root.iterdir()}
    for unexpected in sorted(set(staged) - STAGED_NAMES):
        findings.append("unexpected staged file: %s (staged set must be exactly %s)"
                        % (unexpected, sorted(STAGED_NAMES)))
    for required in sorted(STAGED_NAMES - set(staged)):
        findings.append("missing staged file: %s" % required)
    if findings:
        for finding in findings:
            print(finding, file=sys.stderr)
        return 1
    for name in sorted(STAGED_NAMES):
        metadata = os.lstat(root / name)
        if not stat.S_ISREG(metadata.st_mode):
            findings.append("staged %s is not a regular file (mode %o); "
                            "the wrapper stages plain files only" % (name, stat.S_IMODE(metadata.st_mode)))

    try:
        receipt = json.loads((root / "bundle-receipt.json").read_text())
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        print("bundle-receipt.json is not readable JSON: %s" % error, file=sys.stderr)
        return 1
    if not isinstance(receipt, dict) or set(receipt) != RECEIPT_KEYS:
        findings.append("receipt keys must be exactly %s" % sorted(RECEIPT_KEYS))
    else:
        if receipt["v"] != 1:
            findings.append("receipt version must be 1")
        for key in ("bytes", "files"):
            value = receipt[key]
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                findings.append("receipt %s must be a non-negative integer" % key)
        if not 0 < receipt.get("bytes", 0) <= MAX_TAR_BYTES:
            findings.append("receipt bytes outside bundle cap (1..%d)" % MAX_TAR_BYTES)
        if not 0 <= receipt.get("files", 99) <= MAX_FILES:
            findings.append("receipt files over cap (%d > %d)" % (receipt.get("files", -1), MAX_FILES))
        digest = receipt.get("sha256")
        if not isinstance(digest, str) or len(digest) != 64 or set(digest) - HEX:
            findings.append("receipt sha256 shape")
        for key in ("label", "commit", "generation"):
            value = receipt.get(key)
            if not isinstance(value, str) or not 1 <= len(value) <= 128:
                findings.append("receipt %s shape" % key)

    archive = root / "artifacts.tar"
    size = archive.stat().st_size
    payload = archive.read_bytes()
    if size > MAX_TAR_BYTES:
        findings.append("archive over cap: %d > %d" % (size, MAX_TAR_BYTES))
    if isinstance(receipt, dict):
        if size != receipt.get("bytes"):
            findings.append("receipt/archive bytes mismatch: %d vs %r" % (size, receipt.get("bytes")))
        if hashlib.sha256(payload).hexdigest() != receipt.get("sha256"):
            findings.append("receipt/archive sha256 mismatch")

    try:
        bundle = tarfile.open(archive, mode="r:")
    except tarfile.TarError as error:
        print("archive is not a readable tar: %s" % error, file=sys.stderr)
        return 1
    with bundle:
        members = bundle.getmembers()
        for member in members:
            if not member.isfile():
                findings.append("non-regular archive entry: %s (type %s)" % (member.name, member.type))
            findings.extend(entry_name_findings(member.name))
        if not members or members[0].name != DETAIL_NAME:
            findings.append("first entry is not %s (the detail manifest)" % DETAIL_NAME)
            for finding in findings:
                print(finding, file=sys.stderr)
            return 1
        payloads = members[1:]
        if len(payloads) > MAX_FILES:
            findings.append("entry count over cap: %d > %d" % (len(payloads), MAX_FILES))
        if isinstance(receipt, dict) and receipt.get("files") != len(payloads):
            findings.append("receipt files %r != archive entries %d"
                            % (receipt.get("files"), len(payloads)))
        total = 0
        for member in payloads:
            if member.size > MAX_FILE_BYTES:
                findings.append("entry over per-file cap: %s (%d > %d)"
                                % (member.name, member.size, MAX_FILE_BYTES))
            total += member.size
        if total > MAX_TOTAL_BYTES:
            findings.append("total payload over cap: %d > %d" % (total, MAX_TOTAL_BYTES))
        try:
            detail = json.loads(bundle.extractfile(members[0]).read())
        except (json.JSONDecodeError, UnicodeDecodeError, tarfile.TarError, AttributeError) as error:
            detail = None
            findings.append("detail manifest is not readable JSON: %s" % error)
        if not isinstance(detail, dict) or not isinstance(detail.get("files"), list):
            if detail is not None:
                findings.append("detail manifest shape: files list missing")
            detail = {"files": []}
        listed = {entry.get("path"): entry for entry in detail["files"]
                  if isinstance(entry, dict)}
        if len(listed) != len(detail["files"]):
            findings.append("detail manifest lists duplicate or shapeless entries")
        for name, entry in listed.items():
            findings.extend(entry_name_findings(name))
            member = next((m for m in payloads if m.name == name), None)
            if member is None:
                findings.append("manifest lists missing entry: %r" % name)
                continue
            if entry.get("bytes") != member.size:
                findings.append("manifest/archive bytes mismatch: %s (%r vs %d)"
                                % (name, entry.get("bytes"), member.size))
            extracted = bundle.extractfile(member).read()
            if hashlib.sha256(extracted).hexdigest() != entry.get("sha256"):
                findings.append("manifest/archive sha256 mismatch: %s" % name)
        for member in payloads:
            if member.name not in listed:
                findings.append("archive entry missing from manifest: %r" % member.name)

    if findings:
        for finding in findings:
            print(finding, file=sys.stderr)
        return 1
    print("diagnostics bundle verified: %d files, %d bytes, sha256 %s"
          % (len(payloads), size, hashlib.sha256(payload).hexdigest()[:16] + "…"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
