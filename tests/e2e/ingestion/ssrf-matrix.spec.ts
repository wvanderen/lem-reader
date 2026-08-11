// Wave-0 stub — ING-08 / SC#3 (the SSRF regression matrix).
// Replaced by Plan 07-07. Each `test.skip` below is a Wave-0 test.todo
// placeholder (Playwright 1.61.1 has no `test.todo`, so the executable form is
// `test.skip`; the literal `test.todo` token is retained in this header so the
// ING-07 repo-wide grep gate counts this file). 07-07 swaps them for real
// bodies that run against a REAL `wrangler pages dev` instance — the only
// honest way to exercise fetch + DNS + redirect behavior (D7-06).
//
// Matrix (RESEARCH.md §Gate 1 L953-962): scheme allowlist (file/gopher/data/
// dict/ftp refused); private/loopback/link-local IPs refused; cloud-metadata
// (169.254.169.254, metadata.google.internal, metadata.amazonaws.com) refused;
// CGNAT 100.64/10 refused; encoding bypasses (0x7f000001, dword, octal,
// IPv4-mapped IPv6) refused; redirect-into-internal refused (per-hop
// re-validation); DNS-rebinding refused OR documented residual; NO upstream
// body on any refusal (only { reason } returned).
import { test } from "@playwright/test";

test.describe("SSRF matrix (Wave-0 stub — replaced by 07-07)", () => {
  // 07-07 wires the wrangler :8788 target + IndexedDB wipe in a beforeEach.

  test.skip("measure 1: scheme allowlist (file/gopher/data/dict/ftp refused)", async () => {});
  test.skip("measure 2: private/loopback/link-local/CGNAT IPs refused", async () => {});
  test.skip("measure 3: DNS pinning (cf.resolveOverride) — spike outcome dependent", async () => {});
  test.skip("measure 4: IP normalization (encoding bypasses) via ip-address", async () => {});
  test.skip("measure 5: cloud-metadata hostnames refused", async () => {});
  test.skip("measure 6: egress network-layer allowlist documented", async () => {});
  test.skip("measure 7: no upstream body on refusal (only { reason })", async () => {});
  test.skip("measure 8: size cap + timeout + content-type allowlist", async () => {});
  test.skip("measure 9: redirect-into-internal refused (per-hop re-validation)", async () => {});
});
