// src/persistence/errors.ts
// Named-error classifier for STATE-05 recovery (D2-13, 02-RESEARCH.md §Code
// Examples lines 592–600). Maps a thrown Dexie/IndexedDB error into the small
// recovery vocabulary consumed by settingsStore + SettingsContext:
//   - "unupgradeable" → the DB schema cannot be opened/upgraded (UpgradeError,
//     VersionError, UnknownError). Reader must explicitly consent to a wipe
//     via WipeConfirm (Pitfall 8 — never auto-delete in a catch block).
//   - "unavailable"   → storage is full / blocked / private-browsing-denied
//     (QuotaExceeded, SecurityError, etc.). Reading continues with in-memory
//     defaults; StorageBanner surfaces the failure.
//
// We match on the error `name` defensively via `(e as { name?: string })?.name`
// so the classifier is robust to Dexie name drift (02-RESEARCH A3) and to
// non-Error throws (IndexedDB can throw DOMException; some paths throw
// plain strings). A3: behavior (catch + classify + fall back) is robust to
// exact name drift; this classifier never throws — unknown names route to the
// conservative "unavailable" branch so the reader is never blocked.

/** Dexie error names that mean "the DB itself cannot be opened/upgraded." */
const UNUPGRADEABLE_NAMES = new Set([
  "UpgradeError",
  "VersionError",
  "UnknownError",
]);

/** Dexie/IndexedDB error names that mean "storage is full or blocked." */
const UNAVAILABLE_NAMES = new Set([
  "QuotaExceeded",
  "QuotaExceededError",
  "SecurityError",
  "AbortError",
  "ConstraintError",
  "DataError",
  "NetworkError",
  "UnknownError", // also surfaces here as a conservative fallback (see below)
]);

function nameOf(e: unknown): string {
  return (e as { name?: string } | null | undefined)?.name ?? "";
}

/** True if the error indicates the DB cannot be upgraded/opened (STATE-05). */
export function isUnupgradeable(e: unknown): boolean {
  const n = nameOf(e);
  // "UnknownError" appears in BOTH sets: Dexie sometimes throws it during a
  // blocked upgrade. We treat it as unupgradeable FIRST (the more conservative
  // classification — surfaces WipeConfirm, never auto-wipes). 02-RESEARCH A3.
  return UNUPGRADEABLE_NAMES.has(n);
}

/** True if the error indicates storage is full, blocked, or denied. */
export function isQuota(e: unknown): boolean {
  return nameOf(e) === "QuotaExceeded" || nameOf(e) === "QuotaExceededError";
}

/**
 * Classify a thrown storage error into the recovery vocabulary. Never throws.
 * Order matters: unupgradeable is checked FIRST (UnknownError is in both sets).
 */
export function classifyStorageError(
  e: unknown,
): "unavailable" | "corrupt" | "unupgradeable" {
  if (isUnupgradeable(e)) return "unupgradeable";
  if (isQuota(e)) return "unavailable";
  if (UNAVAILABLE_NAMES.has(nameOf(e))) return "unavailable";
  // Unknown throw (string, undefined, plain Error with no recognized name):
  // conservative "unavailable" so the reader keeps reading with the banner.
  // Never "corrupt" — corrupt is reserved for safeParse failure on a record
  // that DID load (settingsStore owns that classification directly).
  return "unavailable";
}
