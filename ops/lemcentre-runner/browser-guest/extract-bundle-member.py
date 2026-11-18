#!/usr/bin/env python3
"""Extract exactly ONE manifest-listed member from a staged guest bundle
(issue #281; contract: docs/specs/lemcentre-linux-shadow.md and
docs/specs/lemcentre-browser-diagnostics.md).

The e2e-linux-shadow lane renders its per-engine step summary host-side
from the PR-suite JSON report, which reaches the host through the reviewed
bounded bundle transport (issue #279) as a member of the staged pair
.guest-diagnostics/{artifacts.tar, bundle-receipt.json}. This script is
the only reviewed way a workflow step reads bundle bytes on the host:

- the archive is re-verified against the receipt's size and sha256 FIRST
  (verify-diagnostics-bundle.py already checked the full contract before
  upload; this is defense in depth, not the primary boundary);
- the requested member must be a safe relative path, must be listed in the
  archive's first entry (bundle-manifest.json), and must be a regular file
  inside the archive — a missing member is a calm refusal, never a
  partial read;
- ONLY that member's bytes are written to the requested output path
  (nothing is unpacked, nothing is executed, no other name is read).

This is repository-controlled workflow code in the same trust shape as
verify-environment-receipt.py / verify-diagnostics-bundle.py (issue #278 /
#279): it only reads the staged bundle and writes the one output file; it
cannot influence the guest launch, which goes exclusively through the
root-owned, pin-enforcing launcher.

Exit codes: 0 member extracted · 1 refusal (printed to stderr).

Usage:
    extract-bundle-member.py --bundle-dir <staged .guest-diagnostics> \
        --member <safe/relative/path> --out <output path>
"""
import argparse
import hashlib
import json
import os
import stat
import sys
import tarfile
from pathlib import Path

DETAIL_NAME = "bundle-manifest.json"


def die(messages):
    for message in messages:
        print(message, file=sys.stderr)
    return 1


def member_findings(name):
    """The same safe-relative-path rule the bundle verifier enforces."""
    if (
        not isinstance(name, str)
        or not name
        or len(name) > 512
        or "\\" in name
        or "\x00" in name
    ):
        return [f"unsafe member path (shape): {name!r}"]
    if any(part in ("", ".", "..") for part in name.split("/")):
        return [f"unsafe member path (traversal/absolute): {name!r}"]
    return []


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bundle-dir", required=True, help="staged .guest-diagnostics directory")
    parser.add_argument("--member", required=True, help="the one member to extract")
    parser.add_argument("--out", required=True, help="output path for the member bytes")
    args = parser.parse_args()

    root = Path(args.bundle_dir)
    archive_path = root / "artifacts.tar"
    receipt_path = root / "bundle-receipt.json"
    if not root.is_dir():
        return die([f"bundle directory cannot be read: {root} is not a directory"])
    for path in (archive_path, receipt_path):
        metadata = os.lstat(path)
        if not stat.S_ISREG(metadata.st_mode):
            return die(
                [f"staged {path.name} is not a regular file (mode {stat.S_IMODE(metadata.st_mode):o})"]
            )

    try:
        receipt = json.loads(receipt_path.read_text())
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        return die([f"bundle-receipt.json is not readable JSON: {error}"])

    payload = archive_path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if not isinstance(receipt, dict) or receipt.get("sha256") != digest or receipt.get("bytes") != len(payload):
        return die(
            [
                "receipt/archive digest mismatch (sha256 or bytes) — refusing to read "
                "a bundle that no longer matches its verified receipt"
            ]
        )

    findings = member_findings(args.member)
    if findings:
        return die(findings)

    try:
        bundle = tarfile.open(archive_path, mode="r:")
    except tarfile.TarError as error:
        return die([f"archive is not a readable tar: {error}"])
    with bundle:
        members = bundle.getmembers()
        if not members or members[0].name != DETAIL_NAME:
            return die([f"first entry is not {DETAIL_NAME} (the detail manifest)"])
        try:
            detail = json.loads(bundle.extractfile(members[0]).read())
        except (json.JSONDecodeError, UnicodeDecodeError, tarfile.TarError) as error:
            return die([f"detail manifest is not readable JSON: {error}"])
        if not isinstance(detail, dict) or not isinstance(detail.get("files"), list):
            return die(["detail manifest shape: files list missing"])
        listed = {
            entry.get("path")
            for entry in detail["files"]
            if isinstance(entry, dict) and member_findings(entry.get("path")) == []
        }
        if args.member not in listed:
            return die(
                [
                    f"{args.member} is not a listed member of this bundle "
                    f"(listed: {sorted(listed) if listed else 'none'})"
                ]
            )
        member = next((m for m in members[1:] if m.name == args.member), None)
        if member is None:
            return die([f"{args.member} is listed in the manifest but absent from the archive"])
        if not member.isfile():
            return die([f"{args.member} is not a regular archive entry (type {member.type})"])
        data = bundle.extractfile(member).read()

    out = Path(args.out)
    if out.parent != Path(""):
        out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    print(
        f"extracted {args.member} ({len(data)} bytes, sha256 "
        f"{hashlib.sha256(data).hexdigest()[:16]}…) to {out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
