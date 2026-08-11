// server/safeFetch.ts
// Plan 07-03 Task 1 — the SSRF guard. Implements the 9 OWASP measures from
// 07-RESEARCH.md §SSRF Guard Implementation L396-465:
//   1. Scheme allowlist (http/https only)
//   2. Disable auto-redirect; re-validate every hop (recursive safeFetch)
//   3. DNS resolve via dns.promises.resolve4/6 + pin resolved IP via cf.resolveOverride
//   4. ip-address library checks every resolved IP (NOT exposed to encoding bypasses)
//   5. Cloud-metadata hostname blocklist (169.254.169.254 et al.)
//   6. (Egress allowlist owned by Cloudflare's network — application deny-list is the suspenders)
//   7. NO res.text() on validation refusal — IngestionError thrown, never upstream bytes
//   8. AbortSignal.timeout + content-length cap (5 MB)
//   9. (SSRF regression suite — tests/e2e/ingestion/ssrf-matrix.spec.ts, 07-07)
//
// DNS-PINNING DECISION (07-01 spike outcome, A1 PASS): Workers `fetch()`
// accepts the `cf: { resolveOverride }` option (verified against real workerd
// in the 07-01 jsdom-on-Workers spike). safeFetch pins the FIRST validated
// resolved IP via `cf.resolveOverride`, closing the DNS-rebinding TOCTOU
// window (T-7-10). In the Node unit-test runtime the standard fetch ignores
// the `cf` key, but the resolve+validate path still runs — the guard is
// faithful in both runtimes.
//
// This module is platform-agnostic /server code (D7-05 adapter boundary).
import dns from "node:dns";
import { Address4, Address6 } from "ip-address";
import { IngestionError } from "./errors";
import {
  REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  MAX_REDIRECTS,
  ALLOWED_CONTENT_TYPES,
  PRIVATE_RANGES,
  METADATA_HOSTNAMES,
} from "./limits";

/** The fetched-document shape returned by safeFetch. `hash` is the SHA-256 of
 * the response body (V6 cryptography — Web Crypto subtle.digest), used for
 * `IngestionMeta.originalHtmlHash` traceability (07-02 schema). */
export interface FetchedContent {
  html: string;
  finalUrl: string;
  contentType: string;
  hash: string;
}

// Pre-build the Address4/Address6 subnet matchers once (module-load time).
// PRIVATE_RANGES is readonly; map to mutable Address instances.
const PRIVATE_V4_RANGES: Address4[] = [];
const PRIVATE_V6_RANGES: Address6[] = [];
for (const cidr of PRIVATE_RANGES) {
  if (cidr.includes(":")) {
    PRIVATE_V6_RANGES.push(new Address6(cidr));
  } else {
    PRIVATE_V4_RANGES.push(new Address4(cidr));
  }
}

/**
 * Returns true if `ip` falls in any PRIVATE_RANGES CIDR. Handles:
 *   - plain IPv4 (10.0.0.1, 127.0.0.1, 100.64.0.1, ...)
 *   - plain IPv6 (::1, fd00::1, fe80::1, ...)
 *   - IPv4-mapped IPv6 (::ffff:a.b.c.d) — checks the embedded v4 form too
 * Uses the OWASP-recommended ip-address library (NOT exposed to hex/octal/
 * dword/URL encoding bypasses — those forms are normalized by the URL
 * constructor BEFORE reaching here).
 */
function isPrivateIp(ip: string): boolean {
  // Try IPv4 first.
  try {
    const v4 = new Address4(ip);
    return PRIVATE_V4_RANGES.some((range) => v4.isInSubnet(range));
  } catch {
    // not a valid IPv4 — fall through to IPv6
  }
  try {
    const v6 = new Address6(ip);
    if (PRIVATE_V6_RANGES.some((range) => v6.isInSubnet(range))) return true;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — the embedded IPv4 may be private
    // even though the v6 wrapper is not in any v6 range. Check the v4 form.
    if (v6.isMapped4 && v6.isMapped4()) {
      const embedded = v6.to4(); // Address4 or null
      if (embedded) {
        return PRIVATE_V4_RANGES.some((range) => embedded.isInSubnet(range));
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** SHA-256 hex digest of `text`, prefixed with the algorithm (V6 — Web Crypto). */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `sha256:${hex}`;
}

/**
 * safeFetch — the SSRF-safe document fetcher. Runs the full 9-measure pipeline
 * (scheme → metadata-hostname → DNS-resolve → ip-address deny-list → manual-
 * redirect-per-hop → size-cap → content-type allowlist → body). Throws
 * IngestionError BEFORE res.text() on any validation failure (Measure 7 — no
 * upstream body leaks). Recurses through redirects, re-validating DNS + IP
 * on every hop (Measure 2). The `hopDepth` parameter is internal; callers
 * pass only the URL.
 */
export async function safeFetch(rawUrl: string, hopDepth = 0): Promise<FetchedContent> {
  // Measure 1 — SCHEME allowlist (http/https only; rejects file/gopher/data/
  // dict/ftp/smb). The URL constructor ALSO normalizes IPv4 encoding bypasses
  // (0x7f000001 / dword / octal → dotted-decimal), so hostname is canonical
  // before the metadata + DNS checks see it.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new IngestionError("fetch-failed", "invalid-url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new IngestionError("ssrf-blocked-scheme");
  }

  // Measure 5 — cloud-metadata hostname blocklist. Checked BEFORE DNS so the
  // cheapest metadata-exfil path (169.254.169.254 et al.) never reaches fetch.
  if (METADATA_HOSTNAMES.includes(parsed.hostname as (typeof METADATA_HOSTNAMES)[number])) {
    throw new IngestionError("ssrf-blocked-metadata");
  }

  // Measure 3 — DNS RESOLVE (resolve4/resolve6 work on Workers via DoH to
  // 1.1.1.1; see 07-RESEARCH.md L377-379). If both empty, the hostname is
  // unresolvable → fetch-failed (do not leak internal DNS state).
  const [v4, v6] = await Promise.all([
    dns.promises.resolve4(parsed.hostname).catch(() => [] as string[]),
    dns.promises.resolve6(parsed.hostname).catch(() => [] as string[]),
  ]);
  const allIps = [...v4, ...v6];
  if (allIps.length === 0) {
    throw new IngestionError("fetch-failed", "dns-unresolved");
  }

  // Measure 4 — validate EVERY resolved IP against PRIVATE_RANGES via the
  // ip-address library. ANY private IP refuses the fetch (do not fall back to
  // a public one — an attacker controlling DNS could rotate which IP we hit).
  for (const ip of allIps) {
    if (isPrivateIp(ip)) {
      throw new IngestionError("ssrf-blocked-private-ip");
    }
  }

  // Measure 3 (DNS pinning) + Measure 8 (timeout) + Measure 2 (manual redirect).
  // 07-01 spike A1 PASS: Workers fetch() honors cf.resolveOverride; we pin the
  // first validated IP so a DNS-rebinding attacker cannot TOCTOU us between
  // resolve and fetch. The Node unit-test fetch ignores the `cf` key.
  const pinnedIp = v4[0] ?? v6[0];
  const fetchOptions: RequestInit & { cf?: { resolveOverride: string } } = {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "User-Agent": "LemReader/2.0 (+https://lem-reader.app)" },
  };
  if (pinnedIp) {
    fetchOptions.cf = { resolveOverride: pinnedIp };
  }

  const res = await fetch(rawUrl, fetchOptions as RequestInit);

  // Measure 2 — per-hop redirect re-validation. fetch(redirect: "manual")
  // returns the 3xx; we resolve the Location header and recurse through the
  // FULL pipeline (scheme + metadata + DNS + IP). Capped at MAX_REDIRECTS.
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    if (hopDepth >= MAX_REDIRECTS) {
      throw new IngestionError("fetch-failed", "redirect-loop");
    }
    const location = res.headers.get("location");
    if (!location) {
      throw new IngestionError("fetch-failed", "redirect-without-location");
    }
    // Resolve relative redirects against the response URL (RFC 7231 §7.1.2).
    const absoluteLocation = new URL(location, res.url).toString();
    return safeFetch(absoluteLocation, hopDepth + 1);
  }

  // Measure 7+8 — size cap BEFORE res.text(). Refuses huge responses without
  // ever reading the upstream body (T-7-12 — no body leak on refusal).
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new IngestionError("response-too-large");
  }

  // Measure 12 — content-type allowlist. Only (text|application)/(xhtml+)html
  // is article-shaped; everything else (PDF, image, plain-text, JSON) refused.
  const contentType = res.headers.get("content-type") ?? "";
  if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    throw new IngestionError("unsupported-content-type");
  }

  // All validation passed — read the body (the ONLY call to res.text()).
  const html = await res.text();
  const hash = await sha256Hex(html);
  return {
    html,
    finalUrl: res.url,
    contentType,
    hash,
  };
}
