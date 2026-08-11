// Wave-0 stub — D7-07 (slugify canonical URL → id; dedupe-refuse).
// Replaced by Plan 07-03. The `test.todo` placeholders cover the IDN/punycode,
// default-port strip, tracking-param strip, hash-fallback, and collision cases
// from RESEARCH.md §Slug Algorithm L494-527.
//
// Contract (CONTEXT.md D7-07): id = slugify(final canonical URL after
// redirects); two distinct URLs that slugify identically → re-ingest refused
// ("already in your library"). The slug is ASCII-clean by construction,
// satisfying ArticleSchema.id `/^[a-z0-9-]+$/`.
import { describe, test } from "vitest";

describe("slugify (Wave-0 stub — replaced by 07-03)", () => {
  test.todo("IDN/punycode normalized to ASCII");
  test.todo("default port stripped (:80 http, :443 https)");
  test.todo("tracking params (utm_*, fbclid, gclid, ref) stripped");
  test.todo("hash fallback when slug exceeds id regex / length");
  test.todo("collision: two distinct URLs slugify distinctly");
});
