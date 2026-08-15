// tests/unit/portability/zip-slip.test.ts
// Plan 09-01 Task 2 (TDD RED → GREEN) — the mandated SC#2 evil-entry corpus
// as UNIT truth (Pitfall 11 #5/#6). This file is the phase-exit regression
// corpus: every entry-name form that could escape the virtual root is
// refused by isSafeEntryName BEFORE any entry byte is used (wired into the
// import pipeline in Plan 09-04; extended e2e-side with a crafted malicious
// zip in Plan 09-06). sanitizeFilename locks the reader-facing download-name
// sanitization (per-article .md export derives names from article titles).
import { describe, expect, it } from "vitest";
import { isSafeEntryName, sanitizeFilename } from "../../../src/portability/zipSlip";

describe("isSafeEntryName — mandated SC#2 evil corpus (every one refused)", () => {
  it.each([
    ["../../evil.sh"],
    ["..%2F..%2Fevil.sh"],
    ["/etc/passwd"],
    ["C:\\autoexec.bat"],
    ["dir/../../evil.sh"],
    ["con"],
    [".."],
    ["bundle\0.json"],
    ["."],
    ["./"],
    [""],
    ["file.txt:$DATA"],
    ["a/b:c.json"],
  ])("refuses %s", (rawName) => {
    expect(isSafeEntryName(rawName)).toBe(false);
  });
});

describe("isSafeEntryName — valid controls (all accepted)", () => {
  it.each([
    ["bundle.json"],
    ["manifest.json"],
    ["a/b/c.json"],
    ["dir/./file.txt"],
  ])("accepts %s", (rawName) => {
    expect(isSafeEntryName(rawName)).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  it("strips reserved punctuation from an arbitrary title", () => {
    expect(sanitizeFilename("What? A / Title \\ With <Junk>", "fallback")).toBe(
      "What A Title With Junk",
    );
  });

  it("returns the fallback for an OS-reserved name", () => {
    expect(sanitizeFilename("con", "fallback")).toBe("fallback");
  });

  it("returns the fallback for an empty title", () => {
    expect(sanitizeFilename("", "fallback")).toBe("fallback");
  });

  it("caps a 200-char title at 120 chars", () => {
    const out = sanitizeFilename("a".repeat(200), "fallback");
    expect(out).toBe("a".repeat(120));
    expect(out.length).toBe(120);
  });
});
