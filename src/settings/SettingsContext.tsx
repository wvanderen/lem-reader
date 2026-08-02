// src/settings/SettingsContext.tsx
// First React context in the codebase (STACK.md sanctions React context — no
// Redux/Zustand). Holds the current ReaderSettings as the live source of
// truth. On mount and on every change, an effect calls applyTheme(settings)
// so the article behind the panel re-renders via ONE token swap (D2-03 live
// preview — no Save step). update(patch) merges; reset() restores the D-07
// warm-paper baseline (D2-04).
//
// Persistence is intentionally NOT wired here — Plan 02 edits this file to
// add Dexie load/save/debounce + STATE-05 graceful recovery. storageState is
// the constant "ok" for now (Plan 02 replaces it with the load-result reason).
//
// Pitfall 5 (write storm): token application is decoupled from persistence
// here already — applyTheme runs every change (synchronous, in-memory); the
// debounced Dexie write is Plan 02's responsibility.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ReaderSettings } from "../content/schema";
import { DEFAULT_SETTINGS } from "./defaults";
import { applyTheme } from "./applyTheme";

type StorageState = "ok"; // Plan 02 widens this to "ok" | "unavailable" | "corrupt" | "unupgradeable"

interface SettingsContextValue {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
  reset: () => void;
  storageState: StorageState;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(() => DEFAULT_SETTINGS);

  // Live-apply (D2-03): every settings change writes the :root tokens so the
  // article behind the panel re-renders immediately. Runs once on mount (so the
  // D-07 default is mirrored to the DOM even before the first user action) and
  // again on every update/reset. The empty-deps variant would miss updates.
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  // Plan 02: persistence + STATE-05 recovery replaces this stub.
  // - loadSettings() on mount → setSettings or surface storage-error state
  // - schedule a debounced saveSettings(settings) on every change
  // - register visibilitychange + pagehide flush listeners (Pitfall 4)
  // Until then, settings live in-memory only and storageState stays "ok".

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
      reset: () => setSettings(DEFAULT_SETTINGS),
      storageState: "ok" as const,
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used inside <SettingsProvider>");
  }
  return ctx;
}
