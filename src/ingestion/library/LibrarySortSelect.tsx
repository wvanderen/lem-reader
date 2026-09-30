// src/ingestion/library/LibrarySortSelect.tsx
// Issue #115 — the library sort control. A controlled native <select> in the
// ONE toolbar band (the .library-toolbar group beside the view switcher,
// search, and tag filter), offering the three merged-list orders:
// Recently added (the shipped #114 default), Title, and Recently opened.
//
// The choice lives in ReaderSettings.librarySort (the schema owns the closed
// enum); LibraryView threads the persisted value in and lifts changes
// through SettingsContext.update — so the choice survives visits (Dexie +
// the localStorage mirror) and travels in the export/import bundle's
// always-present preferences block (D9-12). This component is STATELESS
// (the LibrarySearch controlled-input discipline): parent owns the value
// via `sort` + `onSortChange`.
//
// Accessibility: a visually-hidden <label> gives the select its accessible
// name (the LibrarySearch "Search your library" precedent); the native
// select owns keyboard operation, the closed option list, and the platform
// announcement of the current value — no custom listbox, no ARIA to get
// wrong. Changing the value reorders the list below; the reordering is
// visible in place (no focus move, no announcement — the control's own
// value change IS the feedback, the D14-09 focus-landing discipline).
import type { LibrarySortKind } from "./libraryOrder";

interface LibrarySortSelectProps {
  /** The persisted sort choice (ReaderSettings.librarySort). */
  sort: LibrarySortKind;
  /** Lifts the new choice to LibraryView (which writes the preference). */
  onSortChange: (next: LibrarySortKind) => void;
}

export function LibrarySortSelect({ sort, onSortChange }: LibrarySortSelectProps) {
  return (
    <div className="library-sort">
      <label htmlFor="library-sort" className="visually-hidden">
        Sort library by
      </label>
      <select
        id="library-sort"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as LibrarySortKind)}
      >
        <option value="recently-added">Recently added</option>
        <option value="title">Title</option>
        <option value="recently-opened">Recently opened</option>
      </select>
    </div>
  );
}
