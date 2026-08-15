// src/portability/download.ts
// Plan 09-01 Task 3 — the shared cross-browser download helper (D9-05).
// Blob + URL.createObjectURL + a synthesized <a download> element:
// Baseline Widely Available (MDN) across chromium/firefox/webkit — no File
// System Access API dependency (streaming for very large libraries is the
// documented deferred limit, Pitfall 11 #7). Shared by the .zip
// whole-library export (Plan 09-03) and the .md highlights export
// (Plan 09-05/09-06).
//
// A2 (deferred revoke): URL.revokeObjectURL runs via setTimeout(…, 0) so
// the click dispatch completes in every engine first — an immediate
// revoke can race the click in some WebKit versions.

/** Download `parts` as a Blob named `filename` with content type `mime`. */
export function downloadBlob(parts: BlobPart[], filename: string, mime: string): void {
  const blob = new Blob(parts, { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the click dispatch completes (A2 — WebKit race).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
