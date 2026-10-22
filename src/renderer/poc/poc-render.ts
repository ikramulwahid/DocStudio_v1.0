/**
 * DocStudio — P02-M4 PoC PDF render service
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Produces the actual PDF bytes for a PoC document.  Works in both
 * environments from one code path:
 * • Browser (Tauri WebView) — `pdf().toBlob()` → Uint8Array.
 * • Node (verification)     — `pdf().toBuffer()` → Uint8Array.
 *
 * The bytes returned here are the SINGLE artifact used for BOTH the
 * in-app preview (rendered by PDF.js) and the exported .pdf file, so
 * preview/export fidelity is identical by construction — the key
 * fidelity strategy selected in the P02-M4 architecture decision.
 *
 * @module renderer/poc/poc-render
 */

import React from 'react';
import { pdf, Document, Page, Text } from '@react-pdf/renderer';
import type { DocStudioDocument } from '../../types/document';
import type { DocumentChangeView } from '../../services/track-changes';
import { buildPocFixture } from './poc-fixture';
import { PocDocument } from './poc-document';

/**
 * Render any supported document to PDF bytes.
 * `options.changeView` selects clean vs tracked-change markup output
 * (P07-M2, §12.1 — the user's export choice); it defaults to `clean`,
 * which is byte-identical to the pre-Track-Changes output.
 * Throws on layout/render errors (e.g. a missing image asset), leaving the
 * caller's state untouched.
 */
async function instanceToBytes(instance: ReturnType<typeof pdf>): Promise<Uint8Array> {
  if (typeof window === 'undefined') {
    // Node (verification harness): `toBuffer()` resolves to pdfkit's
    // PDFDocument — a readable stream of PDF bytes — so collect it.
    const stream = await (
      instance as unknown as { toBuffer(): Promise<AsyncIterable<Uint8Array>> }
    ).toBuffer();
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
  // Browser / Tauri WebView
  const blob = await instance.toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Which visual variant of the document a render produces (§12.1: users
 * control whether tracked-change markup appears in the exported PDF).
 * `clean` (default) renders the current content with NO review markup —
 * byte-identical to the pre-Track-Changes output; `markup` additionally
 * marks pending tracked changes, and is a no-op decoration when the
 * document has none.  (`DocumentChangeView` is re-exported from the
 * track-changes service so every surface shares one definition.)
 */
export type { DocumentChangeView };

export async function renderDocPdfBytes(
  doc: DocStudioDocument,
  options: { changeView?: DocumentChangeView } = {},
): Promise<Uint8Array> {
  const instance = pdf(PocDocument({ doc, changeView: options.changeView ?? 'clean' }) as React.ReactElement);
  return instanceToBytes(instance);
}

/**
 * Render an arbitrary react-pdf element tree to PDF bytes (P04-M3).
 * The theme gallery shares this exact byte-collection path with
 * `renderDocPdfBytes`, so gallery artifacts and document renders cannot
 * diverge in how PDFs are produced (Node `toBuffer` / browser `toBlob`).
 */
export async function renderElementPdfBytes(
  element: React.ReactElement,
): Promise<Uint8Array> {
  return instanceToBytes(pdf(element));
}

/** Render the deterministic PoC fixture. */
export async function renderPocFixturePdfBytes(): Promise<Uint8Array> {
  return renderDocPdfBytes(buildPocFixture());
}

/**
 * Font-fallback probe (verification): a one-page document whose text
 * requests an UNREGISTERED family ("Segoe UI").  The outcome of this
 * render documents what happens when a schema font is not available to
 * the engine (see verify_p02_m4.mjs and the roadmap decision record).
 */
export async function renderFontFallbackProbe(): Promise<Uint8Array> {
  const element = React.createElement(
    Document,
    { title: 'font-fallback-probe' },
    React.createElement(
      Page,
      { size: 'A4' },
      React.createElement(Text, { style: { fontFamily: 'Segoe UI', fontSize: 12 } }, 'Fallback probe text'),
    ),
  );
  const instance = pdf(element);
  return instanceToBytes(instance);
}
