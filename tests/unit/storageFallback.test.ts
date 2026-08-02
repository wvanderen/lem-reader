// tests/unit/storageFallback.test.ts
// STATE-05 unit coverage for the persistence seam (02-02 Task 1). Asserts
// that loadSettings() classifies every failure mode into the recovery
// vocabulary WITHOUT throwing, and that the named-error classifier routes
// Dexie error names correctly. Mocks the Dexie `db` import boundary so the
// test exercises the REAL settingsStore logic against a controllable store.
//
// Mirrors tests/component/ArticleView.test.tsx vi.mock + mockReset conventions.
// Pure logic — jsdom-safe (no <dialog>, no layout, no IntersectionObserver).
import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the Dexie db module; the settingsStore module under test
// imports `db` from it, so we control db.settings.get/put from the test.
vi.mock("../../src/persistence/db", () => {
  const settings = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db: {
      settings,
      // Wipe path (called by WipeConfirm in Task 2; not exercised here, but
      // the mock surface must exist so imports resolve).
      delete: vi.fn(),
      open: vi.fn(),
    },
  };
});

import { loadSettings, saveSettings } from "../../src/persistence/settingsStore";
import {
  isUnupgradeable,
  isQuota,
  classifyStorageError,
} from "../../src/persistence/errors";
import { db } from "../../src/persistence/db";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import type { ReaderSettings } from "../../src/content/schema";

const settingsGet = vi.mocked(db.settings.get);
const settingsPut = vi.mocked(db.settings.put);

const validSettings: ReaderSettings = {
  schemaVersion: 1,
  font: "sans",
  size: 20,
  measure: 72,
  spacing: "spacious",
  theme: "dark",
};

/** A record that will fail ReaderSettingsSchema.safeParse (bad enum). */
const corruptSettings = {
  schemaVersion: 1,
  font: "comic-sans", // not in the enum → safeParse fails
  size: 999,
  measure: 999,
  spacing: "ultra", // not in the enum
  theme: "neon", // not in the enum
};

beforeEach(() => {
  settingsGet.mockReset();
  settingsPut.mockReset();
});

describe("settingsStore.loadSettings (STATE-05)", () => {
  it("returns DEFAULT_SETTINGS on a first-run (empty) DB", async () => {
    settingsGet.mockResolvedValue(undefined);
    const result = await loadSettings();
    expect(result).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  it("returns the parsed record when the persisted value is valid", async () => {
    settingsGet.mockResolvedValue({ key: "reader-prefs", value: validSettings });
    const result = await loadSettings();
    expect(result).toEqual({ ok: true, settings: validSettings });
  });

  it("returns { ok: false, reason: 'corrupt' } when safeParse rejects the record (T-02-01)", async () => {
    settingsGet.mockResolvedValue({
      key: "reader-prefs",
      value: corruptSettings,
    });
    const result = await loadSettings();
    // STATE-04 contract: never silently coerce a corrupt record. Route to
    // WipeConfirm — never return the raw record.
    expect(result).toEqual({ ok: false, reason: "corrupt" });
  });

  it("returns { ok: false, reason: 'unupgradeable' } when db throws UpgradeError", async () => {
    settingsGet.mockRejectedValue({ name: "UpgradeError" });
    const result = await loadSettings();
    expect(result).toEqual({ ok: false, reason: "unupgradeable" });
  });

  it("returns { ok: false, reason: 'unavailable' } when db throws QuotaExceeded", async () => {
    settingsGet.mockRejectedValue({ name: "QuotaExceeded" });
    const result = await loadSettings();
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never throws — unknown errors route to 'unavailable' (STATE-05 non-blocking)", async () => {
    settingsGet.mockRejectedValue("a plain string throw");
    const result = await loadSettings();
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("treats an empty `value` field as a first run (defensive — missing payload)", async () => {
    settingsGet.mockResolvedValue({ key: "reader-prefs" }); // no value
    const result = await loadSettings();
    expect(result).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });
});

describe("settingsStore.saveSettings (STATE-02)", () => {
  it("writes the composite record under key 'reader-prefs'", async () => {
    await saveSettings(validSettings);
    expect(settingsPut).toHaveBeenCalledWith({
      key: "reader-prefs",
      value: validSettings,
    });
  });
});

describe("errors.isUnupgradeable / isQuota / classifyStorageError", () => {
  it("isUnupgradeable matches UpgradeError / VersionError / UnknownError by name", () => {
    expect(isUnupgradeable({ name: "UpgradeError" })).toBe(true);
    expect(isUnupgradeable({ name: "VersionError" })).toBe(true);
    expect(isUnupgradeable({ name: "UnknownError" })).toBe(true);
    expect(isUnupgradeable({ name: "QuotaExceeded" })).toBe(false);
    expect(isUnupgradeable({})).toBe(false);
    expect(isUnupgradeable(null)).toBe(false);
    expect(isUnupgradeable(undefined)).toBe(false);
    expect(isUnupgradeable("string throw")).toBe(false);
  });

  it("isQuota matches QuotaExceeded / QuotaExceededError by name", () => {
    expect(isQuota({ name: "QuotaExceeded" })).toBe(true);
    expect(isQuota({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuota({ name: "UpgradeError" })).toBe(false);
    expect(isQuota({})).toBe(false);
  });

  it("classifyStorageError: UpgradeError → unupgradeable (checked before unavailable)", () => {
    expect(classifyStorageError({ name: "UpgradeError" })).toBe("unupgradeable");
    expect(classifyStorageError({ name: "VersionError" })).toBe("unupgradeable");
  });

  it("classifyStorageError: QuotaExceeded → unavailable", () => {
    expect(classifyStorageError({ name: "QuotaExceeded" })).toBe("unavailable");
  });

  it("classifyStorageError: SecurityError → unavailable (private browsing)", () => {
    expect(classifyStorageError({ name: "SecurityError" })).toBe("unavailable");
  });

  it("classifyStorageError: unknown throw → unavailable (conservative, never throws)", () => {
    expect(classifyStorageError({})).toBe("unavailable");
    expect(classifyStorageError(null)).toBe("unavailable");
    expect(classifyStorageError(undefined)).toBe("unavailable");
    expect(classifyStorageError("string")).toBe("unavailable");
    expect(classifyStorageError(new Error("boom"))).toBe("unavailable");
  });
});
