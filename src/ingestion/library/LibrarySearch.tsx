// src/ingestion/library/LibrarySearch.tsx
// Plan 08-03 Task 1 — LibrarySearch (D8-06). A controlled `<input type="search">`
// inside a `<form role="search">` landmark. The query is lifted to LibraryView
// on every keystroke (D8-06 — filter-on-keystroke, no submit button); the
// native `<input type="search">` UA affordance (Escape clears the field) is
// the only "clear" gesture — no extra × button (spare chrome per UI-SPEC).
//
// Visual-hidden `<label>` ("Search your library") provides SR context beyond
// the visible `placeholder` (UI-SPEC §Copywriting L251-252). The 44px
// `--touch` minimum is enforced via CSS (min-height on `.library-search
// input`); `:focus-visible` inherits the global 2px ring (app.css L73-77).
//
// Mirrors the IngestControl controlled-input discipline (L143-159): parent
// owns the value via `query` + `onQueryChange`; this component is stateless.
// No Dexie, no React state of its own.
interface LibrarySearchProps {
  /** The current query string (lifted to LibraryView). */
  query: string;
  /** Lifts the new query value to LibraryView on every keystroke. */
  onQueryChange: (next: string) => void;
}

export function LibrarySearch({ query, onQueryChange }: LibrarySearchProps) {
  return (
    <form role="search" className="library-search" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="library-search" className="visually-hidden">
        Search your library
      </label>
      <input
        id="library-search"
        name="q"
        type="search"
        placeholder="Search by title, author, or tag"
        autoComplete="off"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
    </form>
  );
}
