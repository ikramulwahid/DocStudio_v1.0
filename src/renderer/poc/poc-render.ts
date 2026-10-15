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
import { buildPocFixture } from './poc-fixture';
import { PocDocument } from './poc-document';

/**
 * Render any supported document to PDF bytes.
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

export async function renderDocPdfBytes(doc: DocStudioDocument): Promise<Uint8Array> {
  const instance = pdf(PocDocument({ doc }) as React.ReactElement);
  return instanceToBytes(instance);
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
