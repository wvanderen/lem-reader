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
import { afterEach, describe, expect, it, vi } from "vitest";
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
