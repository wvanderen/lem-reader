// src/discover/feedUrl.ts
// Issue #121 — the ONE feed-URL normalization. The subscription's `feedUrl`
// is the MERGE key at import ("merges a duplicate by normalized validated
// feed URL"), so normalization must live in exactly one module that both the
// client (save + import merge) and the server (response URL canonicalization)
// import — never a forked twin (the httpUrl single-source-of-truth
// discipline).
//
// Normalization contract (deliberately conservative — deterministic, not
// clever):
//   - trim surrounding whitespace;
//   - http/https schemes ONLY (the same refinement as the shared `httpUrl`);
//   - scheme + host lowercased (URL construction lowercases both already);
//   - the port is dropped when it is the scheme's default (80/443);
//   - the fragment is dropped (never identity-bearing for a feed);
//   - path + query are preserved byte-for-byte (a query string CAN select a
//     feed — ?format=xml — so it never normalizes away).
//
// Returns null for anything that is not a valid http(s) URL — the caller
// refuses calmly; normalization never guesses.
export function normalizeFeedUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
  parsed.hash = "";
  return parsed.toString();
}
