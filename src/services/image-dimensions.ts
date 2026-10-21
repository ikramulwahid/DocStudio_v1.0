/**
 * DocStudio — Embedded image header decoding (P06-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure intrinsic-size decoding for the two formats the importer accepts
 * (`image-import`: PNG and JPEG — the only raster formats the PDF
 * renderer can actually decode).  Needed by the image block's CROP
 * path: a normalized crop rectangle maps onto source pixels, so the
 * renderer must know the source dimensions without decoding pixels.
 *
 * Header-only, no dependencies, runs in both the WebView and the Node
 * verification harness.  `null` means "could not read the header" —
 * the crop renderer turns that into an explicit, non-silent failure
 * (same philosophy as a missing asset).
 *
 * @module services/image-dimensions
 */

/** Intrinsic pixel size of an embedded raster asset. */
export interface ImagePixelSize {
  widthPx: number;
  heightPx: number;
}

/** Platform-safe base64 → bytes (Node `Buffer`; `atob` chunks in the WebView). */
export function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as unknown as {
    Buffer?: { from(data: string, enc: string): Uint8Array };
    atob?(data: string): string;
  };
  if (g.Buffer) return g.Buffer.from(b64, 'base64');
  if (!g.atob) throw new Error('No base64 decoder available in this environment.');
  const binary = g.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** PNG: IHDR is always the first chunk — width/height are big-endian u32 at 16/20. */
function pngSize(bytes: Uint8Array): ImagePixelSize | null {
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    if (bytes[i] !== PNG_MAGIC[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const widthPx = view.getUint32(16);
  const heightPx = view.getUint32(20);
  if (widthPx <= 0 || heightPx <= 0) return null;
  return { widthPx, heightPx };
}

/** JPEG: scan segments for a start-of-frame (SOFn) marker — height u16@+5, width u16@+7. */
function jpegSize(bytes: Uint8Array): ImagePixelSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 3 < bytes.length) {
    if (bytes[pos] !== 0xff) return null; // framing error
    const marker = bytes[pos + 1];
    // Fill bytes and standalone markers carry no length payload.
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      pos += 2;
      continue;
    }
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (pos + 7 >= bytes.length) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const heightPx = view.getUint16(pos + 5);
      const widthPx = view.getUint16(pos + 7);
      if (widthPx <= 0 || heightPx <= 0) return null;
      return { widthPx, heightPx };
    }
    if (length < 2) return null;
    pos += 2 + length;
  }
  return null;
}

/** Intrinsic size from raw bytes; `null` when unreadable. */
export function decodeImageDimensions(bytes: Uint8Array): ImagePixelSize | null {
  if (!bytes || bytes.length === 0) return null;
  return pngSize(bytes) ?? jpegSize(bytes);
}

/**
 * Intrinsic size of an embedded asset (PNG/JPEG only — the honest
 * import subset); `null` when the header cannot be read.
 */
export function assetPixelSize(asset: { mimeType: string; base64Data: string }): ImagePixelSize | null {
  if (typeof asset.mimeType !== 'string' || typeof asset.base64Data !== 'string') return null;
  if (asset.mimeType !== 'image/png' && asset.mimeType !== 'image/jpeg') return null;
  try {
    return decodeImageDimensions(base64ToBytes(asset.base64Data));
  } catch {
    return null;
  }
}
