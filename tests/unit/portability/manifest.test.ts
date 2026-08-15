// tests/unit/portability/manifest.test.ts
// Plan 09-01 Task 3 (TDD RED → GREEN) — the D9-03 deterministic SHA-256
// manifest truth. Known-answer test first (never trust a hash helper
// without one — T-9-03), then the RESEARCH Pitfall 2 / A4 determinism
// proof: export and import both hash JSON.stringify of the Zod-parsed
// block, so a JSON.stringify/parse round-trip (exactly what a real
// export→file→import cycle does) recomputes byte-identical digests —
// a benign key-order difference must NEVER false-positive as corruption.
import { describe, expect, it } from "vitest";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest, sha256Hex } from "../../../src/portability/manifest";
import { sampleBundle } from "./bundle-schema.test";

describe("sha256Hex (known-answer test)", () => {
  it("digests the UTF-8 bytes of \"abc\" to the known SHA-256 value", async () => {
    const bytes = new TextEncoder().encode("abc");
    await expect(sha256Hex(bytes)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("computeManifest (determinism contract — Pitfall 2 / A4)", () => {
  it("recomputes identical block hashes after a JSON stringify/parse round-trip", async () => {
    const bundle = ExportBundleSchema.parse(sampleBundle());
    const first = await computeManifest(bundle);
    const roundTripped = JSON.parse(
      JSON.stringify(bundle),
    ) as Parameters<typeof computeManifest>[0];
    const second = await computeManifest(roundTripped);
    expect(second.blocks).toEqual(first.blocks);
  });

  it("returns algorithm sha256 and exactly the five block keys", async () => {
    const bundle = ExportBundleSchema.parse(sampleBundle());
    const manifest = await computeManifest(bundle);
    expect(manifest.algorithm).toBe("sha256");
    expect(Object.keys(manifest.blocks).sort()).toEqual([
      "articles",
      "highlights",
      "locations",
      "notes",
      "preferences",
    ]);
  });
});
