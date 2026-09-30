// tests/unit/discover/feed-url.test.ts
// Issue #121 — the ONE feed-URL normalization (the import merge key).
// Table-driven over the deterministic contract: trim → http(s) only →
// lowercase scheme/host → default port dropped → fragment dropped →
// path+query preserved; garbage in, null out (normalization never guesses).
import { describe, expect, it } from "vitest";
import { normalizeFeedUrl } from "../../../src/discover/feedUrl";

describe("normalizeFeedUrl (issue #121 — the import merge key)", () => {
  it.each([
    // Scheme normalization + canonical form.
    ["https://example.com/feed.xml", "https://example.com/feed.xml"],
    ["HTTP://Example.COM/feed.xml", "http://example.com/feed.xml"],
    ["  https://example.com/feed.xml  ", "https://example.com/feed.xml"],
    // Default ports drop; non-default ports stay.
    ["https://example.com:443/feed.xml", "https://example.com/feed.xml"],
    ["http://example.com:80/feed.xml", "http://example.com/feed.xml"],
    ["https://example.com:8443/feed.xml", "https://example.com:8443/feed.xml"],
    // Fragments drop (never identity-bearing); path+query stay byte-for-byte.
    ["https://example.com/feed.xml#frag", "https://example.com/feed.xml"],
    ["https://example.com/feed?format=xml", "https://example.com/feed?format=xml"],
    ["https://example.com/feed?format=xml#x", "https://example.com/feed?format=xml"],
    // Empty path gains its canonical trailing slash (URL.toString form).
    ["https://example.com", "https://example.com/"],
  ])("normalizes %s → %s", (input, expected) => {
    expect(normalizeFeedUrl(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "not a url",
    "ftp://example.com/feed.xml",
    "file:///etc/feeds.xml",
    "javascript:alert(1)",
    "data:text/xml,<rss/>",
  ])("refuses %s (null — never guesses)", (input) => {
    expect(normalizeFeedUrl(input)).toBeNull();
  });

  it("is idempotent — normalizing a normalized URL is the same URL", () => {
    const once = normalizeFeedUrl("HTTP://Example.com:80/a/../feed.xml?b=2#z");
    expect(once).not.toBeNull();
    expect(normalizeFeedUrl(once!)).toBe(once);
  });
});
