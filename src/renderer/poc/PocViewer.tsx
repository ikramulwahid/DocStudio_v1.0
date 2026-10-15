/**
 * DocStudio — P02-M4 Proof-of-Concept Preview Viewer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Isolated prototype viewer living inside the Preview Panel. It:
 * 1. Renders the deterministic PoC fixture to REAL PDF bytes with
 *    @react-pdf/renderer.
 * 2. Displays those exact bytes in-app with PDF.js (react-pdf), and
 * 3. Exports the SAME bytes to disk via the native save dialog.
 *
 * This makes preview == export identical by construction, which is the
 * fidelity strategy chosen by the P02-M4 architecture decision. The PDF.js
 * worker is bundled locally — no internet connection is required at any
 * point after dependencies are installed.
 *
 * This is a proof of concept, not the finished Phase 08 export feature.
 *
 * @module renderer/poc/PocViewer
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Document as PdfJsDocument, Page as PdfJsPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { renderPocFixturePdfBytes } from './poc-render';
import { savePdfViaDialog } from '../../services/pdf-export-io';
import './PocViewer.css';

// PDF.js worker bundled locally (offline; no CDN).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const EXPORT_FILE_NAME = 'p02-m4-renderer-poc.pdf';
/** Preview render width in CSS px (fixed for deterministic comparison). */
const PREVIEW_PAGE_WIDTH = 480;

export const PocViewer: React.FC = () => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportedTo, setExportedTo] = useState<string | null>(null);

  // Preview source strategy (P02-M4 manual-test findings):
  // 1. pdf.js TRANSFERS the ArrayBuffer of raw bytes it is given to its
  //    worker thread, DETACHING the original buffer.
  // 2. React StrictMode (dev) double-invokes mount effects, so a raw
  //    Uint8Array would be handed to getDocument twice — the second load
  //    fails with "An ArrayBuffer is detached and could not be cloned".
  // The preview therefore loads from a blob: object URL. The Blob
  // constructor COPIES the bytes (the state buffer stays intact for
  // export), and fetching a blob URL never consumes it, so repeated loads
  // are safe. The URL is created/revoked in an effect (StrictMode-safe:
  // only the committed URL is ever revoked, and only when superseded).
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pdfBytes) {
      setViewerUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(
      // The bytes always originate from a real ArrayBuffer (blob.arrayBuffer()
      // or a Node Buffer), never a SharedArrayBuffer.
      new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    );
    setViewerUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pdfBytes]);

  const handleRender = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    setExportedTo(null);
    try {
      const started = performance.now();
      const bytes = await renderPocFixturePdfBytes();
      const ms = Math.round(performance.now() - started);
      setPdfBytes(bytes);
      setStatus(`Rendered ${bytes.length.toLocaleString()} bytes in ${ms} ms — previewing the exact bytes that export writes.`);
    } catch (e) {
      console.error('[DocStudio] PoC render failed:', e);
      setError(e instanceof Error ? e.message : 'The proof-of-concept PDF could not be rendered.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!pdfBytes) return;
    // Defensive invariant: a detached buffer (see viewerData above) would
    // silently produce an empty file — fail loudly instead.
    if (pdfBytes.byteLength === 0) {
      setError('The rendered PDF bytes are no longer available. Re-render the sample, then export again.');
      return;
    }
    setError(null);
    try {
      const saved = await savePdfViaDialog(pdfBytes, EXPORT_FILE_NAME);
      if (saved === null) {
        setStatus('Export cancelled — nothing was written.');
        return;
      }
      setExportedTo(saved.path);
      setStatus(`Exported the previewed bytes to ${saved.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The PDF could not be exported.');
    }
  }, [pdfBytes]);

  return (
    <div className="poc-viewer">
      <div className="poc-controls">
        <button type="button" className="poc-btn" onClick={handleRender} disabled={busy} title="Render the deterministic P02-M4 sample document to a real PDF">
          {busy ? 'Rendering…' : pdfBytes ? 'Re-render Sample' : 'Render Sample PDF'}
        </button>
        <button type="button" className="poc-btn" onClick={handleExport} disabled={!pdfBytes || busy} title="Export the exact bytes shown in the preview (native save dialog)">
          Export PDF…
        </button>
        {numPages !== null && (
          <span className="poc-page-pill" title="Actual page count reported by PDF.js">
            {numPages} pages
          </span>
        )}
      </div>
      {status && <p className="poc-status" role="status">{status}</p>}
      {error && (
        <p className="poc-error" role="alert">
          {error}
        </p>
      )}
      <div className="poc-pages">
        {pdfBytes && viewerUrl ? (
          <PdfJsDocument
            file={viewerUrl}
            onLoadSuccess={(info) => setNumPages(info.numPages)}
            onLoadError={(e) => setError(`Preview failed to load: ${e.message}`)}
          >
            {Array.from({ length: numPages ?? 1 }, (_, i) => (
              <div className="poc-page-frame" key={`page-${i + 1}`}>
                <PdfJsPage
                  pageNumber={i + 1}
                  width={PREVIEW_PAGE_WIDTH}
                  renderAnnotationLayer={false}
                  renderTextLayer
                />
              </div>
            ))}
          </PdfJsDocument>
        ) : (
          <p className="poc-hint">
            Render the proof-of-concept sample to preview real paginated pages here.
            The same bytes are written when you export.
          </p>
        )}
        {exportedTo && (
          <p className="poc-hint poc-hint--exported" data-exported-to={exportedTo}>
            Exported artifact: {exportedTo}
          </p>
        )}
      </div>
    </div>
  );
};

export default PocViewer;
