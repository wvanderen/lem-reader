#!/usr/bin/env python3
"""Verify a browser-guest environment receipt against the recorded pin (issue #278).

The dispatch-only browser-guest-smoke workflow runs this BEFORE the smoke
test: provisioning (lemfleet#21) emits a receipt describing the guest it
built, and this checker refuses to run the smoke test against any guest
whose identity diverges from ops/lemcentre-runner/browser-guest/
environment-pin.json — a drifted guest must produce a visible refusal,
never a green verdict on the wrong environment.

Trust shape: this script is repository-controlled workflow code (it runs as
`lemci` on the host). It only READS the receipt, the pin and the lemfleet
revision file and prints findings; it cannot influence the guest launch,
which goes exclusively through the root-owned, pin-enforcing browser-smoke
launcher (same trust shape as factory-validate in issue #277).

Exit codes: 0 receipt matches the pin · 1 receipt invalid or divergent.
Usage:
    verify-environment-receipt.py --pin <environment-pin.json> \
        --lemfleet-rev <lemfleet-rev file> --receipt <browser-guest-env.json>
"""
import argparse
import json
import re
import sys

BOOL_FALSE_FIELDS = ("hostFilesystemMounts", "hostDockerSocket", "nestedContainerRuntime")
BOOL_TRUE_FIELDS = ("disposableOverlayPerBoot",)
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def fail(findings, message):
    findings.append(message)


def require(findings, label, value, expected):
    if value != expected:
        fail(findings, f"{label}: expected {expected!r}, receipt records {value!r}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pin", required=True, help="environment-pin.json path")
    parser.add_argument("--lemfleet-rev", required=True, help="lemfleet-rev pin file path")
    parser.add_argument("--receipt", required=True, help="environment receipt path")
    args = parser.parse_args()

    findings: list[str] = []
    pin = json.load(open(args.pin))
    try:
        receipt = json.load(open(args.receipt))
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        print(f"environment receipt is not valid JSON: {err}", file=sys.stderr)
        return 1

    # ── Guest form and isolation invariants (never negotiable) ──────────────
    guest = receipt.get("guest")
    if not isinstance(guest, dict):
        fail(findings, "guest: receipt has no guest object")
    else:
        pin_guest = pin["guest"]
        require(findings, "guest.form", guest.get("form"), pin_guest["form"])
        require(findings, "guest.os", guest.get("os"), pin_guest["os"])
        require(findings, "guest.vcpu", guest.get("vcpu"), pin_guest["vcpu"])
        require(findings, "guest.ramGiB", guest.get("ramGiB"), pin_guest["ramGiB"])
        require(findings, "guest.nic", guest.get("nic"), pin_guest["nic"])
        for field in BOOL_FALSE_FIELDS:
            if guest.get(field) is not False:
                fail(findings, f"guest.{field}: must be false, receipt records {guest.get(field)!r}")
        for field in BOOL_TRUE_FIELDS:
            if guest.get(field) is not True:
                fail(findings, f"guest.{field}: must be true, receipt records {guest.get(field)!r}")

    # ── Version pins (exact) ────────────────────────────────────────────────
    require(findings, "node", receipt.get("node"), pin["node"])
    require(findings, "playwright", receipt.get("playwright"), pin["playwright"])
    browsers = receipt.get("browsers")
    if not isinstance(browsers, dict) or set(browsers) != set(pin["browsers"]):
        fail(findings, f"browsers: expected exactly {sorted(pin['browsers'])}, receipt records {browsers!r}")
    else:
        for engine, revision in pin["browsers"].items():
            require(findings, f"browsers.{engine}", browsers.get(engine), revision)

    deps = receipt.get("osDependencies")
    if not isinstance(deps, dict) or deps.get("source") != pin["osDependencies"]["source"]:
        fail(findings, "osDependencies.source: must identify the playwright-install-deps set, "
             f"receipt records {deps if not isinstance(deps, dict) else deps.get('source')!r}")
    fonts = receipt.get("fonts")
    if not isinstance(fonts, list) or sorted(fonts) != sorted(pin["fonts"]):
        fail(findings, f"fonts: expected {sorted(pin['fonts'])}, receipt records {fonts!r}")

    require(findings, "measurementWorkers", receipt.get("measurementWorkers"), pin["measurementWorkers"])

    # ── Provenance (present and shaped; values are provisioning facts) ──────
    image = receipt.get("image")
    if not isinstance(image, dict):
        fail(findings, "image: receipt has no image object")
    else:
        if not image.get("digest") or not SHA256.fullmatch(str(image.get("digest"))):
            fail(findings, "image.digest: must be the source image's sha256 digest (64 hex)")
        if not image.get("source"):
            fail(findings, "image.source: must name the base image (registry/repository@version)")
    provisioned = receipt.get("provisionedBy")
    if not isinstance(provisioned, dict):
        fail(findings, "provisionedBy: receipt has no provisionedBy object")
    else:
        if not provisioned.get("lemfleetRevision") or not re.fullmatch(r"[0-9a-f]{40}", str(provisioned.get("lemfleetRevision"))):
            fail(findings, "provisionedBy.lemfleetRevision: must be the full 40-hex lemfleet revision that provisioned the guest")
        if not provisioned.get("provisionedAt"):
            fail(findings, "provisionedBy.provisionedAt: must record the provisioning timestamp")

    # ── Trusted harness identity: receipt revision == enforced pin ──────────
    enforced = ""
    try:
        with open(args.lemfleet_rev) as rev:
            enforced = "".join(rev.read().split())
    except OSError as err:
        print(f"cannot read the lemfleet pin file {args.lemfleet_rev}: {err}", file=sys.stderr)
        return 1
    recorded = (receipt.get("provisionedBy") or {}).get("lemfleetRevision")
    if recorded != enforced:
        fail(findings, f"lemfleet revision: the enforced pin is {enforced!r}, the receipt records {recorded!r} — "
             "move the pin through the reviewed procedure (ops/lemcentre-runner/README.md) before accepting this guest")

    if findings:
        print("environment receipt does not match the recorded pin:", file=sys.stderr)
        for finding in findings:
            print(f"  - {finding}", file=sys.stderr)
        return 1
    print(f"environment receipt matches the pin (node {receipt['node']}, playwright {receipt['playwright']}, "
          f"browsers chromium/{receipt['browsers']['chromium']} firefox/{receipt['browsers']['firefox']} "
          f"webkit/{receipt['browsers']['webkit']}, lemfleet @{enforced[:12]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
