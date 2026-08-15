// src/portability/zipSlip.ts
// Plan 09-01 Task 2 — the pure Zip Slip guard + download-filename
// sanitization. SC#2 HARD PHASE-EXIT GATE (Pitfall 11 #5/#6): every archive
// entry name returned by fflate's unzipSync is validated by isSafeEntryName
// BEFORE any entry byte is used — fflate exposes entry names unsanitized
// (D9-02), so the guard is app-level. Phase 9 extracts to memory only, but
// the gate protects the import contract and the future asset-writing phases
// (11/12).
//
// Pure functions; NO I/O. Browser-context virtual path.resolve semantics —
// deliberately NOT node:path (09-RESEARCH Pitfall 3: SC#2's `path.resolve +
// startsWith` wording names a Node API that does not exist browser-side;
// this module implements identical semantics as string normalization).
// Wired into the import pipeline in Plan 09-04; regression corpus locked by
// tests/unit/portability/zip-slip.test.ts.

/** Windows-reserved device names (con/prn/aux/nul/com1-9/lpt1-9), anchored
 * to segment end or a dot so "con" and "con.txt" refuse but "console"
 * passes. Case-insensitive (Pitfall 11 #6). */
const OS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * isSafeEntryName — true iff the raw archive entry name cannot escape the
 * virtual extraction root. Refuses, in order: control characters (incl.
 * NUL), any backslash (Windows separator smuggled into a POSIX-style name),
 * drive-letter prefixes, leading slash or tilde, URL-encoded separators
 * (decoded and re-judged — decode failure itself refuses), traversal
 * escapes (`..` popping an empty virtual stack), OS-reserved segments,
 * colon-bearing segments (NTFS alternate data streams), and names that
 * resolve to nothing.
 */
export function isSafeEntryName(rawName: string): boolean {
  // NUL bytes and control chars — refuse outright (Pitfall 11 #6)
  if (/[\0-\x1f]/.test(rawName)) return false;
  // Backslash = Windows separator smuggled into a POSIX-style name
  if (rawName.includes("\\")) return false;
  // Drive letters + absolute paths + home-relative
  if (/^[a-zA-Z]:/.test(rawName)) return false;
  if (rawName.startsWith("/") || rawName.startsWith("~")) return false;
  // URL-encoded separators (..%2F..%2Fevil.sh) — decode before judging
  let name: string;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    return false;
  }
  if (name.includes("\\")) return false;
  // Virtual path.resolve: walk segments; ".." popping past root = traversal escape
  const stack: string[] = [];
  for (const seg of name.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length === 0) return false; // escapes the virtual root — REJECT
      stack.pop();
    } else {
      if (OS_RESERVED.test(seg)) return false; // Windows-reserved device names
      if (seg.includes(":")) return false; // NTFS alternate data streams ("file.txt:$DATA")
      stack.push(seg);
    }
  }
  return stack.length > 0; // "" or "." alone is not a file entry
}

/**
 * sanitizeFilename — sanitize a reader-facing download filename (the
 * per-article .md export derives it from article titles, which are
 * arbitrary web text). Strips control characters and the reserved
 * punctuation set (slash, backslash, angle brackets, colon, quote, pipe,
 * question mark, asterisk), collapses whitespace, trims, and caps at 120
 * chars. Returns `fallback` when the cleaned result is empty or an
 * OS-reserved name (sanitize-then-fallback — the server/slugify.ts
 * discipline). Pure function; no I/O.
 */
export function sanitizeFilename(title: string, fallback: string): string {
  const cleaned = title
    .replace(/[\0-\x1f]/g, "")
    .replace(/[\/\\<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!cleaned || OS_RESERVED.test(cleaned)) return fallback;
  return cleaned;
}
