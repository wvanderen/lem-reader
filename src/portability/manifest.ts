// src/portability/manifest.ts
// Plan 09-01 Task 3 — the D9-03 deterministic SHA-256 integrity manifest.
// manifest.json carries one SHA-256 hex digest per record block; the
// importer recomputes and refuses the bundle on any mismatch (the atomic
// transaction never starts). The manifest is a corruption/tampering
// DETECTION surface, not a security boundary (no encryption/signing —
// deferred to v3 alongside accounts).
//
// Hashing uses the Web Crypto platform primitive ONLY (V6 — never
// hand-roll); the crypto.subtle call + hex encoding copy the
// server/safeFetch.ts L91-99 precedent exactly. NOTE: no "sha256:" prefix
// here — that prefix is the Provenance/originalHtmlHash convention, not
// the manifest's.
import type { ExportBundle } from "./bundle";

/** SHA-256 hex digest of `bytes` via Web Crypto (server/safeFetch.ts
 * precedent; no algorithm prefix — see module header). The ArrayBuffer
 * backing is part of the signature: BufferSource requires an
 * ArrayBuffer-backed view, and TextEncoder.encode() (the sole producer of
 * hashed bytes on both export and import sides) yields exactly that. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const b of view) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export type Manifest = {
  algorithm: "sha256";
  blocks: Record<
    "articles" | "highlights" | "notes" | "locations" | "preferences",
    string
  >;
};

// ── DETERMINISM CONTRACT (load-bearing — RESEARCH Pitfall 2 / A4) ────────────
// BOTH export and import hash JSON.stringify of the Zod-parsed block —
// never raw file bytes, never the pre-parse object. Zod constructs output
// keys in schema order on both sides, and JSON round-trips preserve
// string-key insertion order, so the hashed byte stream is a function of
// the schema alone. Hashing anything else (exporter-object order vs
// parse-order) would false-positive a valid bundle as "corrupted".
export async function computeManifest(bundle: ExportBundle): Promise<Manifest> {
  const entry = async (block: unknown): Promise<string> =>
    await sha256Hex(new TextEncoder().encode(JSON.stringify(block)));
  return {
    algorithm: "sha256",
    blocks: {
      articles: await entry(bundle.articles),
      highlights: await entry(bundle.highlights),
      notes: await entry(bundle.notes),
      locations: await entry(bundle.locations),
      preferences: await entry(bundle.preferences),
    },
  };
}
