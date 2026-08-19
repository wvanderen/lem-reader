// src/settings/SettingsContext.tsx
// First React context in the codebase (STACK.md sanctions React context — no
// Redux/Zustand). Holds the current ReaderSettings as the live source of
// truth. On mount and on every change, an effect calls applyTheme(settings)
// so the article behind the panel re-renders via ONE token swap (D2-03 live
// preview — no Save step). update(patch) merges; reset() restores the D-07
// warm-paper baseline (D2-04).
//
// Persistence (Plan 02-02): on mount, loadSettings() hydrates from Dexie or
// surfaces `storageState` for STATE-05 recovery routing. Every update/reset
// schedules a DEBOUNCED saveSettings (~400ms per 02-RESEARCH Open Question
// #2 — Pitfall 5: prevents a write storm while dragging a range control).
// A DUAL flush (visibilitychange-hidden + pagehide) guarantees the final
// pending value persists even if the reader tabs away mid-debounce (Pitfall 4
// — bfcache-safe; the deprecated bfcache-breaking session-end events are
// forbidden per 02-RESEARCH anti-pattern).
//
// STATE-05 routing:
//   storageState === "ok"             → normal operation
//   storageState === "unavailable"    → App renders <StorageBanner>; reading
//                                        continues with in-memory defaults
//   storageState === "corrupt" |
//   storageState === "unupgradeable"  → App renders <WipeConfirm>; the actual
//                                        db.delete() runs ONLY in WipeConfirm's
//                                        destructive handler (Pitfall 8).
// Save failures update storageState to the classified reason and NEVER throw
// to the reader.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ReaderSettings } from "../content/schema";
import { DEFAULT_SETTINGS } from "./defaults";
import { applyTheme } from "./applyTheme";
import {
  clearSettingsMirror,
  readSettingsMirror,
  writeSettingsMirror,
} from "./settingsMirror";
import { loadSettings, saveSettings } from "../persistence/settingsStore";
import { classifyStorageError } from "../persistence/errors";

export type StorageState =
  | "ok"
  | "unavailable"
  | "corrupt"
  | "unupgradeable";

interface SettingsContextValue {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
  reset: () => void;
  storageState: StorageState;
  /**
   * Wipe local reader-prefs data and reset to in-memory defaults. Invoked
   * ONLY from WipeConfirm's destructive button onClick (Pitfall 8). Never
   * called from a catch block or automatically on a storage failure.
   */
  resetLocalData: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Debounce window for settings writes (02-RESEARCH Open Question #2). */
const SAVE_DEBOUNCE_MS = 400;

export function SettingsProvider({ children }: { children: ReactNode }) {
  // POLISH-01 (D13-01, Pitfall 2): lazy-init from the localStorage mirror so
  // the FIRST React render already carries the persisted settings — the
  // mount-time applyTheme effect below then writes byte-identical values to
  // the inline pre-React script in index.html instead of snapping defaults
  // back over the mirror's tokens for the frames before Dexie hydrates.
  // readSettingsMirror is null-on-doubt (absent/corrupt/throwing → defaults).
  const [settings, setSettings] = useState<ReaderSettings>(
    () => readSettingsMirror() ?? DEFAULT_SETTINGS,
  );
  const [storageState, setStorageState] = useState<StorageState>("ok");

  // Pending debounced write + the latest settings snapshot for flush-on-hide.
  // The flush listeners (visibilitychange-hidden + pagehide) close over these
  // refs so they always see the most recent pending value without re-registering.
  const saveTimer = useRef<number | null>(null);
  const pendingRef = useRef<ReaderSettings | null>(null);

  // Live-apply (D2-03): every settings change writes the :root tokens so the
  // article behind the panel re-renders immediately. Runs once on mount (so the
  // D-07 default is mirrored to the DOM even before the first user action) and
  // again on every update/reset. The empty-deps variant would miss updates.
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  // Load on mount: hydrate from Dexie or surface storageState (STATE-05).
  // The cancelled-flag guard mirrors src/routes/ArticleView.tsx lines 31–48
  // so a slow load cannot overwrite a fast in-flight update after unmount.
  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSettings(result.settings);
          setStorageState("ok");
          // Stale-mirror self-correct (POLISH-01, 13-RESEARCH OQ2): Dexie is
          // the truth — when the hydrated settings differ from what the
          // mirror carries (including no mirror at all), rewrite the mirror
          // NOW so the next cold load in this same session paints the
          // corrected values. Failure handling lives inside the seam
          // (silent no-op — Pitfall 4).
          if (
            JSON.stringify(readSettingsMirror()) !==
            JSON.stringify(result.settings)
          ) {
            writeSettingsMirror(result.settings);
          }
        } else {
          // Keep in-memory DEFAULT_SETTINGS active so the reader is never
          // blocked (D2-13). App routes the reason to the right surface.
          setStorageState(result.reason);
        }
      })
      .catch(() => {
        // loadSettings is supposed to never throw (it classifies internally),
        // but defend against any unexpected path — reading continues with
        // in-memory defaults and the unavailable banner.
        if (cancelled) return;
        setStorageState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Schedule a debounced save. Token application (applyTheme, synchronous) is
   * decoupled from persistence (debounced 400ms) per Pitfall 5 — dragging the
   * size range does NOT hammer IndexedDB. The latest value is stashed in
   * pendingRef so the dual-event flush can persist it immediately on tab-hide.
   */
  const scheduleSave = useCallback((next: ReaderSettings) => {
    pendingRef.current = next;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const s = pendingRef.current;
      if (!s) return;
      pendingRef.current = null;
      // Mirror write rides the same pending value, before the Dexie call
      // (POLISH-01/D13-01). All failure handling lives inside the seam —
      // a quota-blocked mirror write is a silent no-op and NEVER classifies
      // as a storage failure (Pitfall 4).
      writeSettingsMirror(s);
      saveSettings(s).catch((e) => {
        // STATE-05: classify the failure and surface the right banner. Never
        // throw to the reader. db.delete() is NOT called here (Pitfall 8).
        setStorageState(classifyStorageError(e));
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  /** Flush the pending write immediately (used by visibilitychange/pagehide). */
  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const s = pendingRef.current;
    if (!s) return;
    pendingRef.current = null;
    // Mirror write rides the flush too (POLISH-01/D13-01) — same value, same
    // silent-failure seam as scheduleSave (Pitfall 4).
    writeSettingsMirror(s);
    // Fire-and-forget — pagehide may not await, but the write is queued into
    // the IndexedDB transaction pipeline before the page tears down in all
    // three target engines (verified pattern, 02-RESEARCH Pattern 4).
    saveSettings(s).catch((e) => {
      setStorageState(classifyStorageError(e));
    });
  }, []);

  // Dual-event flush (Pitfall 4 — bfcache-safe). Register BOTH:
  //   - visibilitychange (primary; treat document.hidden === true as flush)
  //   - pagehide        (navigation/closure safety net)
  // The deprecated bfcache-breaking session-end events are FORBIDDEN here
  // (unreliable on mobile — 02-RESEARCH anti-pattern). Cleanup removes both
  // listeners (mirrors src/App.tsx listener+cleanup pattern lines 32–49).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    const onPageHide = () => flushSave();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flushSave]);

  // Cleanup the pending debounce timer on unmount so it cannot fire after the
  // provider is gone (no setState-after-unmount warning, no leaked write).
  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingRef.current = null;
    };
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) =>
        setSettings((prev) => {
          const next = { ...prev, ...patch };
          scheduleSave(next);
          return next;
        }),
      reset: () => {
        const next = DEFAULT_SETTINGS;
        scheduleSave(next);
        setSettings(next);
      },
      storageState,
      resetLocalData: async () => {
        // Pitfall 8: this is the SEAM WipeConfirm calls from its destructive
        // button handler. The actual db.delete() runs there (src/reader/
        // WipeConfirm.tsx) — we only cancel the pending save here and reset
        // to in-memory defaults. (WipeConfirm re-initializes the DB instance
        // after delete before this provider re-mounts.)
        if (saveTimer.current !== null) {
          window.clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        pendingRef.current = null;
        // Pitfall 1 (POLISH-01): localStorage survives db.delete(). Clear the
        // mirror here — the single post-wipe seam — or a wiped reader
        // cold-loads to the dead preferences forever (zombie settings).
        clearSettingsMirror();
        setSettings(DEFAULT_SETTINGS);
        setStorageState("ok");
      },
    }),
    [settings, storageState, scheduleSave],
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
