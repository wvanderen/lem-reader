import { useEffect, useId, useState } from "react";
import type { CanonicalArticle } from "../../content/schema";
import { ingestPdf } from "../IngestionClient";
import { bytesToBase64 } from "../ingestCopy";
import { PDF_MAX_BYTES } from "../types";
import {
  applyPdfRepair,
  hasPdfRepairRecovery,
  previewPdfRepair,
  recoverPdfRepair,
  type PdfRepairPreview,
} from "../../persistence/pdfRepairStore";
import { StatusRegion } from "../../ui/StatusRegion";
import "./pdfRepair.css";

/** Explicit maintenance inside the existing library metadata dialog. The
 * original PDF is processed only on request; the intake result is evidence,
 * never a new reading saved over the reader's work. */
export function PdfRepairPanel({
  article,
  onSaved,
  onBusy,
}: {
  article: CanonicalArticle;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PdfRepairPreview | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void hasPdfRepairRecovery(article.id)
      .then((value) => {
        if (live) setRecovery(value);
      })
      .catch(() => {
        if (live) setError("Could not check recovery storage. Close and try again.");
      });
    return () => {
      live = false;
    };
  }, [article.id]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Repair could not be saved. Nothing was changed; try again.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <details className="pdf-repair-panel">
      <summary>Repair PDF structure</summary>
      <p>Recheck headings using the original PDF. Previewing does not change this reading.</p>
      {recovery ? (
        <>
          <p>
            A pre-repair version is kept on this device until you recover it. Recovery restores its
            structure and the reader-data changes disclosed at repair. It does not reimport the
            work.
          </p>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await recoverPdfRepair(article.id);
                onSaved();
              })
            }
          >
            Recover pre-repair version
          </button>
        </>
      ) : (
        <>
          <label htmlFor={inputId}>Original PDF</label>
          <input
            id={inputId}
            type="file"
            accept=".pdf,application/pdf"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setError("");
            }}
          />
          <button
            type="button"
            className="btn btn-quiet"
            disabled={!file || busy}
            onClick={() =>
              void run(async () => {
                if (!file || file.size > PDF_MAX_BYTES)
                  throw new Error("Choose an original PDF within the PDF upload size limit.");
                const result = await ingestPdf(
                  bytesToBase64(new Uint8Array(await file.arrayBuffer())),
                  file.name,
                );
                setPreview(await previewPdfRepair(article.id, result.article));
              })
            }
          >
            {busy ? "Checking PDF…" : "Preview repair"}
          </button>
          {preview && (
            <section aria-label="Repair preview">
              <h3>Proposed structural changes</h3>
              {preview.changes.length === 0 ? (
                <p>No heading changes were found.</p>
              ) : (
                <ul>
                  {preview.changes.map((change) => (
                    <li key={change.blockIndex}>
                      Block {change.blockIndex + 1}: {change.before} → {change.after}
                    </li>
                  ))}
                </ul>
              )}
              <p>Saved position, highlights, and notes keep their exact text attachments.</p>
              <p>
                Only classification changes. The reading identity and extracted text stay unchanged.
                A recoverable pre-repair version is kept on this device, not included in library
                exports.
              </p>
              {preview.consequences.length > 0 && (
                <>
                  <h3>Reader data that cannot keep its chapter meaning</h3>
                  <ul>
                    {preview.consequences.map((item, index) => (
                      <li key={index}>{item.label}</li>
                    ))}
                  </ul>
                  <p>
                    This repair cannot be applied without explicit acceptance of these consequences.
                  </p>
                </>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || preview.changes.length === 0 || preview.consequences.length > 0}
                onClick={() =>
                  void run(async () => {
                    await applyPdfRepair(preview);
                    onSaved();
                  })
                }
              >
                Apply repair
              </button>
            </section>
          )}
        </>
      )}
      <StatusRegion>{error}</StatusRegion>
    </details>
  );
}
