// server/limits.ts
// Plan 07-03 Task 1 — the locked resource-cap constants every Wave-2+ server
// module imports. Values come from 07-RESEARCH.md §Timeout / Size-Cap Exact
// Numbers L612-620 and 07-CONTEXT.md `<decisions>` L43-49 (the human-locked
// resource caps). The PRIVATE_RANGES deny-list is the OWASP SSRF Cheat Sheet
// Case 2 minimum (CITED: 07-RESEARCH.md L401-406); the ip-address library
// checks resolved IPs against these CIDRs.
//
// This module is platform-agnostic /server code (D7-05 adapter boundary) — no
// /functions dependency, portable to any runtime.

/** Fetch timeout (AbortSignal.timeout cap). CONTEXT.md "~30s"; Workers CPU
 * limit is 30s on most plans. Generous enough for slow publishers; tight
 * enough to prevent the fetcher being weaponized as a DoS amplifier. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum response body size. A real article HTML is 100KB–2MB; 5MB caps
 * pathological pages without rejecting legitimate long-form. Checked against
 * the Content-Length header BEFORE res.text() (Measure 7 — no body leak on
 * refusal). */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Redirect cap. OWASP recommends 3–5; 5 covers legitimate redirect chains
 * (e.g. medium.com → cdn) without enabling redirect-loops. Each hop is
 * re-validated through the full safeFetch pipeline (Measure 2). */
export const MAX_REDIRECTS = 5;

/** Content-type allowlist. CONTEXT.md lock. Only (text|application)/(xhtml+)html
 * is accepted; application/pdf, image/*, text/plain etc. are refused at the
 * boundary (Measure 12). */
export const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

/** Private / reserved IP ranges — the OWASP SSRF Cheat Sheet Case 2 deny-list
 * minimum. The ip-address library's Address4/Address6.isInSubnet checks every
 * resolved IP against these CIDRs (Measure 4). Covers:
 *   - 10/8, 172.16/12, 192.168/16 (RFC 1918 private)
 *   - 169.254/16 (link-local + cloud-metadata)
 *   - 127/8 (loopback)
 *   - 0/8 (this-network)
 *   - 100.64/10 (CGNAT — RFC 6598)
 *   - 224/4 (multicast)
 *   - ::1/128, fc00::/7, fe80::/10, ff00::/8 (IPv6 reserved scopes)
 * CITED: 07-RESEARCH.md §SSRF Guard Implementation L401-406. */
export const PRIVATE_RANGES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "127.0.0.0/8",
  "0.0.0.0/8",
  "100.64.0.0/10",
  "224.0.0.0/4",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
] as const;

/** Cloud-metadata hostnames — the explicit blocklist (Measure 5). AWS/GCP/Azure
 * metadata endpoints serve credentials to anyone who can reach them; blocking
 * the hostname BEFORE DNS resolution closes the cheapest SSRF exfil path.
 * CITED: 07-RESEARCH.md §SSRF Guard Implementation L407. */
export const METADATA_HOSTNAMES = [
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.amazonaws.com",
] as const;
