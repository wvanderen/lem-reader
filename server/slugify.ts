// server/slugify.ts
// Plan 07-03 Task 2 — D7-07 canonical-URL → slug identity. Implements the
// normalization rules from 07-RESEARCH.md §Slug Algorithm L488-527:
//   - IDN/punycode (URL.hostname yields xn--... for non-ASCII automatically)
//   - lowercase hostname
//   - strip default ports (:80 http, :443 https)
//   - strip fragment (#...)
//   - strip known tracking query params (utm_*/fbclid/gclid/ref/mc_cid/mc_eid)
//   - sort remaining query params alphabetically (?b=2&a=1 == ?a=1&b=2)
//   - hash fallback (`u-<shorthash>`) when the humanish slug exceeds 80 chars
//     or violates the ArticleSchema.id `/^[a-z0-9-]+$/` regex
//
// Collision handling (D7-07): two distinct URLs slugify identically ONLY if
// they normalize to the same canonical URL (= re-ingest, refused with
// "already in your library"). If two genuinely distinct URLs produce the same
// humanish slug, the hash fallback disambiguates because the normalized URLs
// differ. The slug is ASCII-clean by construction, satisfying ArticleSchema.id.
//
// This module is platform-agnostic /server code (D7-05 adapter boundary).
import { createHash } from "node:crypto";

/** Known tracking / marketing params stripped before slugification so the slug
 * stays stable across marketing variants (FEATURES.md Anti-Feature: "URL-
 * normalize before de-dup"). 07-RESEARCH.md §Slug Algorithm L507-508. */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "mc_cid",
  "mc_eid",
];

/** Maximum humanish-slug length. URLs whose humanish slug exceeds this fall
 * back to the hash form (RESEARCH.md L511). */
const MAX_SLUG_LENGTH = 80;

/** The ArticleSchema.id regex — every slug MUST satisfy this (single source
 * of truth mirrors src/content/schema.ts L227). */
const SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * slugifyUrl — canonical-URL → stable ASCII slug. The slug is the article's
 * durable identity (D7-07 save-once-read-forever dedupe key). Pure function;
 * no I/O except the deterministic node:crypto SHA-256 fallback.
 */
export function slugifyUrl(canonicalUrl: string): string {
  const parsed = new URL(canonicalUrl);

  // 1. Lowercase hostname (URL already lowercases the scheme; hostname may
  //    carry uppercase in some legacy URLs). IDN punycode is automatic —
  //    URL.hostname yields "xn--..." for non-ASCII hosts.
  parsed.hostname = parsed.hostname.toLowerCase();

  // 2. Strip default ports. URL treats :80/:443 as default for http/https but
  //    may retain them in toString(); explicitly clear.
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  // 3. Strip fragment.
  parsed.hash = "";

  // 4. Strip tracking query params.
  for (const key of TRACKING_PARAMS) {
    parsed.searchParams.delete(key);
  }

  // 5. Sort remaining query params alphabetically (URLSearchParams preserves
  //    insertion order; rebuild sorted so ?b=2&a=1 and ?a=1&b=2 slugify identically).
  const sortedParams = Array.from(parsed.searchParams.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  parsed.search = "";
  for (const [k, v] of sortedParams) {
    parsed.searchParams.append(k, v);
  }

  // 6. Build the canonical cleaned URL string.
  const cleanedUrl = parsed.toString();

  // 7. Build a humanish slug: hostname (dots → hyphens) + path (slashes/dots/
  //    underscores → hyphens), lowercased, collapsed hyphens.
  const hostPart = parsed.hostname.replace(/\./g, "-");
  const pathPart = parsed.pathname
    .replace(/^\/+|\/+$/g, "") // strip leading/trailing slashes
    .replace(/[./_]+/g, "-") // slashes/dots/underscores → hyphen
    .replace(/-+/g, "-"); // collapse runs
  const humanish = (pathPart ? `${hostPart}-${pathPart}` : hostPart).toLowerCase();

  // 8. If the humanish slug satisfies the id regex AND fits the length cap, ship it.
  if (SLUG_REGEX.test(humanish) && humanish.length <= MAX_SLUG_LENGTH) {
    return humanish;
  }

  // 9. Hash fallback — `u-<12-char sha256 prefix>`. Disambiguates distinct
  //    URLs that produce the same humanish slug or violate the regex/length.
  const shorthash = createHash("sha256").update(cleanedUrl).digest("hex").slice(0, 12);
  return `u-${shorthash}`;
}
