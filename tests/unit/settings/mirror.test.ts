// tests/unit/settings/mirror.test.ts
// Phase 13 (POLISH-01, D13-01/D13-02): unit tests for the localStorage
// settings mirror seam (src/settings/settingsMirror.ts). The mirror is a
// best-effort FIRST-PAINT HINT ONLY — Dexie via loadSettings stays the sole
// source of truth, and mirror failures NEVER route recovery UI (D13-03 /
// Pitfall 4: no classifyStorageError, no setStorageState, no StorageBanner
// from a mirror write). These tests pin the null-on-doubt read discipline
// (copied from settingsStore's never-silently-coerce read) and the
// no-op-on-failure write discipline.
//
// jsdom provides a real window.localStorage (localStorage is jsdom-native —
// no polyfill needed). Throwing-storage cases replace window.localStorage
// wholesale via Object.defineProperty with a stub whose accessors throw
// (quota-blocked / storage-blocked browsers), restored in afterEach.
import { afterEach, describe, expect, it } from "vitest";
import {
  clearSettingsMirror,
  readSettingsMirror,
  SETTINGS_MIRROR_KEY,
  writeSettingsMirror,
} from "../../../src/settings/settingsMirror";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { ReaderSettings } from "../../../src/content/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The fully non-default record the cold-load no-snap e2e also seeds
 * (theme dark, font sans, size 22, readingMode scrolling — the round-trip
 * precedent from round-trip.spec.ts L111-127). */
const NON_DEFAULT: ReaderSettings = {
  schemaVersion: 2,
  font: "sans",
  size: 22,
  measure: 72,
  spacing: "spacious",
  theme: "dark",
  readingMode: "scrolling",
};

type ThrowSpec = { getItem?: boolean; setItem?: boolean; removeItem?: boolean };

/** Replace window.localStorage with a stub whose marked methods throw
 * (SecurityError/QuotaExceededError class). Returns a restore fn. */
function installThrowingLocalStorage(throws: ThrowSpec): () => void {
  const real = window.localStorage;
  const stub: Storage = {
    length: 0,
    clear: () => {},
    key: () => null,
    getItem: throws.getItem
      ? () => {
          throw new Error("SecurityError: storage blocked");
        }
      : (k: string) => real.getItem(k),
    setItem: throws.setItem
      ? () => {
          throw new Error("QuotaExceededError: storage full");
        }
      : (k: string, v: string) => real.setItem(k, v),
    removeItem: throws.removeItem
      ? () => {
          throw new Error("SecurityError: storage blocked");
        }
      : (k: string) => real.removeItem(k),
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: stub,
  });
  return () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: real,
    });
  };
}

afterEach(() => {
  window.localStorage.clear();
});

// ── Behavior 1: absent key → null (first run paints defaults) ───────────────

describe("readSettingsMirror", () => {
  it("returns null when the mirror key is absent (first run)", () => {
    expect(window.localStorage.getItem(SETTINGS_MIRROR_KEY)).toBeNull();
    expect(readSettingsMirror()).toBeNull();
  });

  // ── Behavior 2: write → read round-trips the FULL record ──────────────────

  it("round-trips a full non-default ReaderSettings record", () => {
    writeSettingsMirror(NON_DEFAULT);
    expect(readSettingsMirror()).toEqual(NON_DEFAULT);
  });

  it("round-trips the DEFAULT_SETTINGS record too (all settings, one key)", () => {
    writeSettingsMirror(DEFAULT_SETTINGS);
    expect(readSettingsMirror()).toEqual(DEFAULT_SETTINGS);
  });

  // ── Behavior 3: invalid stored values → null (never coerce, never throw) ──

  it.each([
    [
      "corrupt JSON",
      "{not json at all",
    ],
    [
      "wrong value shapes (size as string)",
      JSON.stringify({ ...NON_DEFAULT, size: "twenty-two" }),
    ],
    [
      "unknown enum value (theme)",
      JSON.stringify({ ...NON_DEFAULT, theme: "neon" }),
    ],
    [
      "unknown schemaVersion (v3 forward-reject)",
      JSON.stringify({ ...NON_DEFAULT, schemaVersion: 3 }),
    ],
    [
      "non-object stored value",
      '"just a string"',
    ],
  ])(
    "returns null on a stored value that fails ReaderSettingsSchema (%s)",
    (_label, stored) => {
      window.localStorage.setItem(SETTINGS_MIRROR_KEY, stored);
      expect(readSettingsMirror()).toBeNull();
    },
  );

  // ── Behavior 4: throwing getItem → null, never a throw ────────────────────

  it("returns null (does not throw) when localStorage.getItem throws", () => {
    const restore = installThrowingLocalStorage({ getItem: true });
    try {
      expect(() => readSettingsMirror()).not.toThrow();
      expect(readSettingsMirror()).toBeNull();
    } finally {
      restore();
    }
  });
});

// ── Behavior 5: throwing setItem → silent no-op ──────────────────────────────

describe("writeSettingsMirror", () => {
  it("is a silent no-op (does not throw) when localStorage.setItem throws", () => {
    const restore = installThrowingLocalStorage({ setItem: true });
    try {
      expect(() => writeSettingsMirror(NON_DEFAULT)).not.toThrow();
    } finally {
      restore();
    }
  });
});

// ── Behavior 6: clear removes the key; clearing absent is a no-op ────────────

describe("clearSettingsMirror", () => {
  it("removes a written mirror key", () => {
    writeSettingsMirror(NON_DEFAULT);
    expect(window.localStorage.getItem(SETTINGS_MIRROR_KEY)).not.toBeNull();
    clearSettingsMirror();
    expect(window.localStorage.getItem(SETTINGS_MIRROR_KEY)).toBeNull();
    expect(readSettingsMirror()).toBeNull();
  });

  it("is a no-op when the key is already absent", () => {
    expect(() => clearSettingsMirror()).not.toThrow();
    expect(window.localStorage.getItem(SETTINGS_MIRROR_KEY)).toBeNull();
  });

  it("does not throw when localStorage.removeItem throws", () => {
    const restore = installThrowingLocalStorage({ removeItem: true });
    try {
      expect(() => clearSettingsMirror()).not.toThrow();
    } finally {
      restore();
    }
  });
});

// ── index.html inline-script sync checks (A2 drift guard) ───────────────────
//
// The pre-React paint-hint script in index.html cannot import
// src/settings/tokens.ts, so it carries INLINE COPIES of FONT_STACKS and
// SPACING_PRESETS between marker comments. These checks pin the copies to
// the module maps so a tokens.ts change that forgets index.html fails here
// (13-RESEARCH A2), and pin the placement/security contracts of the script
// itself.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// jsdom-env specs get a non-file import.meta.url, so anchor to the vitest
// cwd (always the project root) instead.
const INDEX_HTML = readFileSync(resolve(process.cwd(), "index.html"), "utf-8");

/** Extract the source between two `// tokens:<name>:start|end` markers. */
function extractMarked(name: string): string {
  const re = new RegExp(
    `//\\s*tokens:${name}:start([\\s\\S]*?)//\\s*tokens:${name}:end`,
  );
  const match = re.exec(INDEX_HTML);
  if (!match) {
    throw new Error(`marker tokens:${name}:start/end not found in index.html`);
  }
  return match[1] ?? "";
}

/** Evaluate a marked `var NAME = { ... };` block into its object value. */
function evalMarkedMap(name: string): unknown {
  const src = extractMarked(name);
  const stripped = src
    .replace(new RegExp(`^\\s*var\\s+${name}\\s*=`), "")
    .replace(/;\s*$/, "")
    .trim();
  // Test-only evaluation of a repo-authored literal (not user input).
  return new Function(`return (${stripped});`)();
}

describe("index.html inline script sync checks", () => {
  it("appears before the /src/main.tsx module script", () => {
    // The first plain <script> tag in the document is the inline hint.
    const inlineIdx = INDEX_HTML.indexOf("<script>");
    const moduleIdx = INDEX_HTML.indexOf(
      '<script type="module" src="/src/main.tsx">',
    );
    expect(inlineIdx).toBeGreaterThan(-1);
    expect(moduleIdx).toBeGreaterThan(-1);
    expect(inlineIdx).toBeLessThan(moduleIdx);
  });

  it("contains no markup-string or HTML-injection APIs (T-13-03)", () => {
    expect(INDEX_HTML).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
  });

  it("reads the SETTINGS_MIRROR_KEY key", () => {
    expect(INDEX_HTML).toContain(`localStorage.getItem("${SETTINGS_MIRROR_KEY}")`);
  });

  it("inline FONT_STACKS copy equals tokens.ts FONT_STACKS for every key", async () => {
    const { FONT_STACKS } = await import("../../../src/settings/tokens");
    const inline = evalMarkedMap("FONT_STACKS") as Record<string, string>;
    const keys = Object.keys(FONT_STACKS) as Array<keyof typeof FONT_STACKS>;
    expect(Object.keys(inline).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(inline[key]).toEqual(FONT_STACKS[key]);
    }
  });

  it("inline SPACING_PRESETS copy equals tokens.ts SPACING_PRESETS for every key", async () => {
    const { SPACING_PRESETS } = await import("../../../src/settings/tokens");
    const inline = evalMarkedMap("SPACING_PRESETS") as Record<
      string,
      { lineHeight: number; letterSpacing: string; wordSpacing: string }
    >;
    const keys = Object.keys(SPACING_PRESETS) as Array<
      keyof typeof SPACING_PRESETS
    >;
    expect(Object.keys(inline).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(inline[key]).toEqual(SPACING_PRESETS[key]);
    }
  });
});
