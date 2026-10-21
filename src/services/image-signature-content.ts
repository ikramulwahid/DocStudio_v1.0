/**
 * DocStudio — Image and signature block content actions (P06-M4, §6.4/§6.5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Immutable, validated editing for the two schema-v1 blocks owned by
 * P06-M4 (project_details.md §10.7 image block, §10.8 signature block).
 * Same narrow-dispatcher pattern as `list-callout-content` (which also
 * groups two block families under one App-level callback) and
 * `structural-block-content`/`formula-content`:
 *
 * • Every field edit is validated at the service boundary before the
 *   document is touched; a rejected edit leaves the document unchanged
 *   with a field-specific message (the editor keeps the typed draft).
 * • A commit that does not actually change anything returns the SAME
 *   document reference (`changed: false`), so the Modified flag never
 *   lies; real changes stamp `modifiedAt` through `stamped`.
 * • Addressing is by STABLE ids (image slot id, signer id) so reorder
 *   and duplicate operations can never misdirect a commit.
 *
 * IMAGE side (§10.7):
 * • Layout is `single` (one slot) or `side-by-side` (two slots).  The
 *   service owns the slot invariant: switching to side-by-side appends
 *   an empty second slot; switching to single keeps only the first slot
 *   (the editor confirms first when that slot holds content).
 * • `attach-slot-asset` is the file-pick landing action: it validates
 *   the freshly imported `AssetRecord` (image MIME only — the honest
 *   PNG/JPEG subset is enforced by `image-import` before this point),
 *   embeds it into `doc.assets`, and points the slot at it in ONE
 *   atomic edit (mirrors `applyImportedCoverAsset`).  A new image
 *   always drops any previous crop — a crop belongs to one source.
 * • Crop rectangles are normalized source coordinates (ImageCrop):
 *   `x`/`y`/`width`/`height` in 0..1 with a minimum extent so a
 *   zero-area crop can never reach the renderer.  Setting a crop
 *   requires an attached asset.
 * • Width is the schema's `widthFraction` (0.1–1.0 of the available
 *   content width); captions are length-limited; caption placement is
 *   `top`/`bottom` (absent = renderer default `bottom`).
 *
 * SIGNATURE side (§10.8):
 * • 1–3 signers (schema contract); add/remove enforced here.
 * • Every signer must carry a `name` or a `designation` — an edit that
 *   would empty BOTH is rejected (`identifier-required`).
 * • `role`, `department` are free text (length-limited); `date` is
 *   either empty (clears) or `YYYY-MM-DD` with a real month/day.
 * • Overall `hAlign` (left/center/right) positions the signer row.
 *
 * Nothing here renders: layout math lives in the renderer's pure
 * `image-signature-layout`, and the honest "not a verified electronic
 * signature" presentation is a renderer concern (§10.8).
 *
 * NO schema change: `ImageBlockData`, `SignatureBlockData`, `ImageItem`,
 * `ImageCrop` and `Signer` are already schema v1 — this service is the
 * editing layer for fields that already exist.  `schemaVersion` stays 1.
 *
 * @module services/image-signature-content
 */

import type {
  AssetRecord,
  ContentBlock,
  DocStudioDocument,
  DocUUID,
  HAlignment,
} from '../types/document';
import type {
  CaptionPlacement,
  ImageBlockData,
  ImageCrop,
  ImageItem,
  ImageLayout,
  SignatureBlockData,
  Signer,
} from '../types/blocks';
import { newUUID, nowISO } from '../types/defaults';
import { indexOfBlock, stamped, type BlockOpOptions } from './block-actions';

// ─────────────────────────────────────────────────────────────────────────────
// Contract constants
// ─────────────────────────────────────────────────────────────────────────────

/** Alignment choices for an image slot or the signer row (`HAlignment`). */
export const IMAGE_ALIGNMENTS: readonly HAlignment[] = ['left', 'center', 'right'];

/** Block layouts owned by §10.7 ("one image or two images side by side"). */
export const IMAGE_LAYOUTS: readonly ImageLayout[] = ['single', 'side-by-side'];

/** Caption placements owned by §10.7 ("caption position: top or bottom"). */
export const CAPTION_PLACEMENTS: readonly CaptionPlacement[] = ['top', 'bottom'];

/** Schema range for `ImageItem.widthFraction` (documented on the type). */
export const IMAGE_WIDTH_FRACTION_MIN = 0.1;
export const IMAGE_WIDTH_FRACTION_MAX = 1;

/** Longest accepted caption text (characters, trimmed). */
export const MAX_IMAGE_CAPTION_LENGTH = 500;

/** The schema supports one or two image slots per block. */
export const MAX_IMAGE_SLOTS = 2;

/**
 * Smallest accepted crop extent, as a fraction of the source image.
 * A crop of a few pixels is meaningless in print and would make the
 * scaled-up inner image explode, so the service refuses it outright.
 */
export const IMAGE_CROP_MIN_FRACTION = 0.05;

/** Signer-count bounds (schema contract on `SignatureBlockData`). */
export const MIN_SIGNERS = 1;
export const MAX_SIGNERS = 3;

/** Longest accepted signer text field (role/name/designation/department). */
export const MAX_SIGNER_FIELD_LENGTH = 200;

/** Accepted signature-date shape (`Signer.date`, ISO 8601 date-only). */
export const SIGNER_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Placeholder seeded into a NEWLY added signer so the schema contract
 * ("at least a name or a designation") holds from the very first frame.
 * Same convention as the block-registry's default signature block.
 */
export const SIGNER_SEED_DESIGNATION = 'Name / designation';

// ─────────────────────────────────────────────────────────────────────────────
// Result and action contracts
// ─────────────────────────────────────────────────────────────────────────────

export type ImageSignatureErrorCode =
  | 'missing-block'
  | 'wrong-block-type'
  | 'invalid-action'
  // image
  | 'unknown-image'
  | 'invalid-layout'
  | 'invalid-halign'
  | 'invalid-width-fraction'
  | 'caption-too-long'
  | 'invalid-caption-placement'
  | 'invalid-crop'
  | 'asset-not-an-image'
  // signature
  | 'unknown-signer'
  | 'signer-limit'
  | 'signers-minimum'
  | 'invalid-signer-field'
  | 'field-too-long'
  | 'identifier-required'
  | 'invalid-date';

export interface ImageSignatureFailure {
  ok: false;
  code: ImageSignatureErrorCode;
  message: string;
}

export interface ImageSignatureSuccess {
  ok: true;
  changed: boolean;
  doc: DocStudioDocument;
  blockId: DocUUID;
}

export type ImageSignatureActionResult = ImageSignatureSuccess | ImageSignatureFailure;

/** Signer text fields addressable by `set-signer-field`. */
export type SignerField = 'role' | 'name' | 'designation' | 'department' | 'date';

/**
 * One dispatcher action per operation (the established narrow-prop
 * pattern): the App wires exactly one callback for both block families.
 */
export type ImageSignatureContentAction =
  | { action: 'set-image-layout'; layout: ImageLayout }
  | { action: 'attach-slot-asset'; imageId: DocUUID; asset: AssetRecord }
  | { action: 'clear-slot-asset'; imageId: DocUUID }
  | { action: 'set-slot-caption'; imageId: DocUUID; caption: string }
  | { action: 'set-slot-caption-placement'; imageId: DocUUID; placement: CaptionPlacement }
  | { action: 'set-slot-crop'; imageId: DocUUID; crop: ImageCrop | null }
  | { action: 'set-slot-width-fraction'; imageId: DocUUID; widthFraction: number }
  | { action: 'set-slot-align'; imageId: DocUUID; hAlign: HAlignment }
  | { action: 'set-signature-align'; hAlign: HAlignment }
  | { action: 'add-signer' }
  | { action: 'remove-signer'; signerId: DocUUID }
  | { action: 'set-signer-field'; signerId: DocUUID; field: SignerField; value: string };

const reject = (code: ImageSignatureErrorCode, message: string): ImageSignatureFailure => ({
  ok: false,
  code,
  message,
});

/** Locate the target block and confirm it belongs to this dispatcher. */
function locate(
  source: DocStudioDocument,
  blockId: DocUUID,
):
  | { ok: true; index: number; block: ContentBlock }
  | ImageSignatureFailure {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The block to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'image' && block.data.type !== 'signature') {
    return reject('wrong-block-type', 'This block is not an image or signature block.');
  }
  return { ok: true, index, block };
}

/** Replace one block's data and stamp `modifiedAt` (shared commit tail). */
function commit<T extends ImageBlockData | SignatureBlockData>(
  source: DocStudioDocument,
  index: number,
  block: ContentBlock,
  next: T,
  blockId: DocUUID,
  options: BlockOpOptions,
): ImageSignatureActionResult {
  const blocks = [...source.blocks];
  blocks[index] = { ...block, data: next };
  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}

const noOp = (source: DocStudioDocument, blockId: DocUUID): ImageSignatureActionResult => ({
  ok: true,
  changed: false,
  blockId,
  doc: source,
});

// ─────────────────────────────────────────────────────────────────────────────
// Image block actions (§10.7)
// ─────────────────────────────────────────────────────────────────────────────

function findImage(data: ImageBlockData, imageId: DocUUID): { slot: ImageItem; index: number } | null {
  const index = data.images.findIndex((image) => image.id === imageId);
  return index < 0 ? null : { slot: data.images[index], index };
}

/**
 * Switch the block layout.  `side-by-side` guarantees two slots (an
 * empty second slot is appended when missing); `single` keeps only the
 * first slot — the editor confirms first when that slot holds content.
 */
export function setImageLayout(
  source: DocStudioDocument,
  blockId: DocUUID,
  layout: ImageLayout,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  if (!IMAGE_LAYOUTS.includes(layout)) {
    return reject('invalid-layout', 'Layout must be a single image or two side by side.');
  }
  const data = located.block.data;
  let images = data.images;
  if (layout === 'side-by-side' && images.length < MAX_IMAGE_SLOTS) {
    images = [
      ...images,
      { id: newUUID(), assetId: null, widthFraction: IMAGE_WIDTH_FRACTION_MAX, hAlign: 'center' },
    ];
  } else if (layout === 'single' && images.length > 1) {
    images = images.slice(0, 1);
  }
  if (layout === data.layout && images === data.images) {
    return noOp(source, blockId);
  }
  const next: ImageBlockData = { ...data, layout, images };
  return commit(source, located.index, located.block, next, blockId, options);
}

/**
 * Embed a freshly imported `AssetRecord` into `doc.assets` and point
 * the slot at it in one atomic edit (image MIME only).  Any previous
 * crop on the slot is dropped — a crop belongs to one source image.
 */
export function attachImageAsset(
  source: DocStudioDocument,
  blockId: DocUUID,
  imageId: DocUUID,
  asset: AssetRecord,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  if (findImage(located.block.data, imageId) === null) {
    return reject('unknown-image', 'That image slot no longer exists in this block.');
  }
  if (
    asset === null ||
    typeof asset !== 'object' ||
    typeof asset.id !== 'string' ||
    asset.id === '' ||
    typeof asset.mimeType !== 'string'
  ) {
    return reject('asset-not-an-image', 'That file is not a usable image asset.');
  }
  if (!asset.mimeType.startsWith('image/')) {
    return reject('asset-not-an-image', 'Only image files can be attached to an image block.');
  }

  const data = located.block.data;
  const images = data.images.map((image) => {
    if (image.id !== imageId) return image;
    const next: ImageItem = { ...image, assetId: asset.id };
    if (next.crop !== undefined) delete next.crop;
    return next;
  });
  const next: ImageBlockData = { ...data, images };
  const doc: DocStudioDocument = {
    ...source,
    assets: { ...source.assets, [asset.id]: asset },
  };
  const blocks = [...doc.blocks];
  blocks[located.index] = { ...located.block, data: next };
  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(doc, blocks, options.now ?? nowISO()),
  };
}

/** Detach the slot's asset reference (the asset record itself stays). */
export function clearImageAsset(
  source: DocStudioDocument,
  blockId: DocUUID,
  imageId: DocUUID,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  const found = findImage(located.block.data, imageId);
  if (found === null) {
    return reject('unknown-image', 'That image slot no longer exists in this block.');
  }
  if (found.slot.assetId === null && found.slot.crop === undefined) {
    return noOp(source, blockId);
  }
  const images = located.block.data.images.map((image) => {
    if (image.id !== imageId) return image;
    const next: ImageItem = { ...image, assetId: null };
    if (next.crop !== undefined) delete next.crop;
    return next;
  });
  const next: ImageBlockData = { ...located.block.data, images };
  return commit(source, located.index, located.block, next, blockId, options);
}

/** Set (or clear, with `''`) the slot's caption text. */
export function setImageCaption(
  source: DocStudioDocument,
  blockId: DocUUID,
  imageId: DocUUID,
  caption: string,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  const found = findImage(located.block.data, imageId);
  if (found === null) {
    return reject('unknown-image', 'That image slot no longer exists in this block.');
  }
  if (typeof caption !== 'string') {
    return reject('caption-too-long', 'The caption must be text.');
  }
  const trimmed = caption.trim();
  if (trimmed.length > MAX_IMAGE_CAPTION_LENGTH) {
    return reject(
      'caption-too-long',
      `The caption is limited to ${MAX_IMAGE_CAPTION_LENGTH} characters.`,
    );
  }
  if (trimmed === (found.slot.caption ?? '')) {
    return noOp(source, blockId);
  }
  const images = located.block.data.images.map((image) => {
    if (image.id !== imageId) return image;
    const next: ImageItem = { ...image };
    if (trimmed === '') delete next.caption;
    else next.caption = trimmed;
    return next;
  });
  const next: ImageBlockData = { ...located.block.data, images };
  return commit(source, located.index, located.block, next, blockId, options);
}

/** Set the caption position: above (`top`) or below (`bottom`) the image. */
export function setImageCaptionPlacement(
  source: DocStudioDocument,
  blockId: DocUUID,
  imageId: DocUUID,
  placement: CaptionPlacement,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  const found = findImage(located.block.data, imageId);
  if (found === null) {
    return reject('unknown-image', 'That image slot no longer exists in this block.');
  }
  if (!CAPTION_PLACEMENTS.includes(placement)) {
    return reject('invalid-caption-placement', 'The caption must sit above or below the image.');
  }
  const effective = found.slot.captionPlacement ?? 'bottom';
  if (placement === effective) {
    return noOp(source, blockId);
  }
  const images = located.block.data.images.map((image) => {
    if (image.id !== imageId) return image;
    const next: ImageItem = { ...image, captionPlacement: placement };
    if (placement === 'bottom') delete next.captionPlacement; // renderer default
    return next;
  });
  const next: ImageBlockData = { ...located.block.data, images };
  return commit(source, located.index, located.block, next, blockId, options);
}

/**
 * Set the slot's normalized crop rectangle, or clear it with `null`.
 * A crop requires an attached asset; every coordinate must be a finite
 * 0..1 fraction and the rectangle must keep `IMAGE_CROP_MIN_FRACTION`
 * extent inside the source image.
 */
export function setImageCrop(
  source: DocStudioDocument,
  blockId: DocUUID,
  imageId: DocUUID,
  crop: ImageCrop | null,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  const found = findImage(located.block.data, imageId);
  if (found === null) {
    return reject('unknown-image', 'That image slot no longer exists in this block.');
  }
  if (crop === null) {
    if (found.slot.crop === undefined) return noOp(source, blockId);
    const images = located.block.data.images.map((image) => {
      if (image.id !== imageId) return image;
      const next: ImageItem = { ...image };
      if (next.crop !== undefined) delete next.crop;
      return next;
    });
    const next: ImageBlockData = { ...located.block.data, images };
    return commit(source, located.index, located.block, next, blockId, options);
  }
  if (found.slot.assetId === null) {
    return reject('invalid-crop', 'Attach an image before cropping it.');
  }
  const EPS = 1e-9;
  const valid =
    crop !== null &&
    typeof crop === 'object' &&
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width >= IMAGE_CROP_MIN_FRACTION &&
    crop.height >= IMAGE_CROP_MIN_FRACTION &&
    crop.x + crop.width <= 1 + EPS &&
    crop.y + crop.height <= 1 + EPS;
  if (!valid) {
    return reject(
      'invalid-crop',
      `The crop must sit inside the image (0–100%) and keep at least ${Math.round(
        IMAGE_CROP_MIN_FRACTION * 100,
      )}% width and height.`,
    );
  }
  const normalized: ImageCrop = {
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
  };
  const current = found.slot.crop;
  const same =
    current !== undefined &&
    Math.abs(current.x - normalized.x) < 1e-12 &&
    Math.abs(current.y - normalized.y) < 1e-12 &&
    Math.abs(current.width - normalized.width) < 1e-12 &&
    Math.abs(current.height - normalized.height) < 1e-12;
  if (same) return noOp(source, blockId);
  const images = located.block.data.images.map((image) => {
    if (image.id !== imageId) return image;
    return { ...image, crop: normalized };
  });
  const next: ImageBlockData = { ...located.block.data, images };
  return commit(source, located.index, located.block, next, blockId, options);
}

/** Set the slot's display width as a fraction of the content width. */
export function setImageWidthFraction(
  source: DocStudioDocument,
  blockId: DocUUID,
  imageId: DocUUID,
  widthFraction: number,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  const found = findImage(located.block.data, imageId);
  if (found === null) {
    return reject('unknown-image', 'That image slot no longer exists in this block.');
  }
  if (
    typeof widthFraction !== 'number' ||
    !Number.isFinite(widthFraction) ||
    widthFraction < IMAGE_WIDTH_FRACTION_MIN ||
    widthFraction > IMAGE_WIDTH_FRACTION_MAX
  ) {
    return reject(
      'invalid-width-fraction',
      `Size must be between ${Math.round(IMAGE_WIDTH_FRACTION_MIN * 100)}% and ${Math.round(
        IMAGE_WIDTH_FRACTION_MAX * 100,
      )}% of the page width.`,
    );
  }
  if (widthFraction === found.slot.widthFraction) {
    return noOp(source, blockId);
  }
  const images = located.block.data.images.map((image) =>
    image.id === imageId ? { ...image, widthFraction } : image,
  );
  const next: ImageBlockData = { ...located.block.data, images };
  return commit(source, located.index, located.block, next, blockId, options);
}

/** Set the slot's horizontal alignment (image AND its caption follow it). */
export function setImageAlign(
  source: DocStudioDocument,
  blockId: DocUUID,
  imageId: DocUUID,
  hAlign: HAlignment,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'image') {
    return reject('wrong-block-type', 'This block is not an image block.');
  }
  const found = findImage(located.block.data, imageId);
  if (found === null) {
    return reject('unknown-image', 'That image slot no longer exists in this block.');
  }
  if (!IMAGE_ALIGNMENTS.includes(hAlign)) {
    return reject('invalid-halign', 'Alignment must be left, center or right.');
  }
  if (hAlign === found.slot.hAlign) return noOp(source, blockId);
  const images = located.block.data.images.map((image) =>
    image.id === imageId ? { ...image, hAlign } : image,
  );
  const next: ImageBlockData = { ...located.block.data, images };
  return commit(source, located.index, located.block, next, blockId, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature block actions (§10.8)
// ─────────────────────────────────────────────────────────────────────────────

function findSigner(data: SignatureBlockData, signerId: DocUUID): Signer | null {
  return data.signers.find((signer) => signer.id === signerId) ?? null;
}

/** Set the overall alignment of the signer row. */
export function setSignatureAlign(
  source: DocStudioDocument,
  blockId: DocUUID,
  hAlign: HAlignment,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'signature') {
    return reject('wrong-block-type', 'This block is not a signature block.');
  }
  if (!IMAGE_ALIGNMENTS.includes(hAlign)) {
    return reject('invalid-halign', 'Alignment must be left, center or right.');
  }
  if (hAlign === located.block.data.hAlign) return noOp(source, blockId);
  const next: SignatureBlockData = { ...located.block.data, hAlign };
  return commit(source, located.index, located.block, next, blockId, options);
}

/**
 * Append a signer (capped at `MAX_SIGNERS`).  The new signer seeds the
 * documented designation placeholder so the "name or designation"
 * contract holds from the first frame (same convention as the registry
 * default signature block).
 */
export function addSigner(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'signature') {
    return reject('wrong-block-type', 'This block is not a signature block.');
  }
  if (located.block.data.signers.length >= MAX_SIGNERS) {
    return reject('signer-limit', `A signature block supports at most ${MAX_SIGNERS} signers.`);
  }
  const signer: Signer = {
    id: newUUID(),
    role: '',
    designation: SIGNER_SEED_DESIGNATION,
  };
  const next: SignatureBlockData = {
    ...located.block.data,
    signers: [...located.block.data.signers, signer],
  };
  return commit(source, located.index, located.block, next, blockId, options);
}

/** Remove one signer by stable id (never below `MIN_SIGNERS`). */
export function removeSigner(
  source: DocStudioDocument,
  blockId: DocUUID,
  signerId: DocUUID,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'signature') {
    return reject('wrong-block-type', 'This block is not a signature block.');
  }
  if (located.block.data.signers.length <= MIN_SIGNERS) {
    return reject(
      'signers-minimum',
      `A signature block needs at least ${MIN_SIGNERS} signer.`,
    );
  }
  if (findSigner(located.block.data, signerId) === null) {
    return reject('unknown-signer', 'That signer no longer exists in this block.');
  }
  const next: SignatureBlockData = {
    ...located.block.data,
    signers: located.block.data.signers.filter((signer) => signer.id !== signerId),
  };
  return commit(source, located.index, located.block, next, blockId, options);
}

/**
 * Edit one signer text field.  `role` may be emptied (it is an
 * optional label); `name`/`designation` may never BOTH end up empty
 * (`identifier-required`, §10.8); `department` may be cleared; `date`
 * must be empty (clears) or a real `YYYY-MM-DD` date.
 */
export function setSignerField(
  source: DocStudioDocument,
  blockId: DocUUID,
  signerId: DocUUID,
  field: SignerField,
  value: string,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  const located = locate(source, blockId);
  if (located.ok === false) return located;
  if (located.block.data.type !== 'signature') {
    return reject('wrong-block-type', 'This block is not a signature block.');
  }
  const signer = findSigner(located.block.data, signerId);
  if (signer === null) {
    return reject('unknown-signer', 'That signer no longer exists in this block.');
  }
  if (typeof value !== 'string') {
    return reject('invalid-signer-field', 'That signer field must be text.');
  }

  if (field === 'role' || field === 'name' || field === 'designation' || field === 'department') {
    const trimmed = value.trim();
    if (trimmed.length > MAX_SIGNER_FIELD_LENGTH) {
      return reject(
        'field-too-long',
        `This field is limited to ${MAX_SIGNER_FIELD_LENGTH} characters.`,
      );
    }
    if (field === 'name' || field === 'designation') {
      const other = field === 'name' ? signer.designation ?? '' : signer.name ?? '';
      if (trimmed === '' && other === '') {
        return reject(
          'identifier-required',
          'Each signer needs at least a name or a designation.',
        );
      }
    }
    if (field === 'role') {
      if (trimmed === signer.role) return noOp(source, blockId);
      const signers = located.block.data.signers.map((entry) =>
        entry.id === signerId ? { ...entry, role: trimmed } : entry,
      );
      const next: SignatureBlockData = { ...located.block.data, signers };
      return commit(source, located.index, located.block, next, blockId, options);
    }
    const current =
      field === 'name'
        ? signer.name ?? ''
        : field === 'designation'
          ? signer.designation ?? ''
          : signer.department ?? '';
    if (trimmed === current) return noOp(source, blockId);
    const signers = located.block.data.signers.map((entry) => {
      if (entry.id !== signerId) return entry;
      const copy: Signer = { ...entry };
      if (trimmed === '') delete copy[field];
      else copy[field] = trimmed;
      return copy;
    });
    const next: SignatureBlockData = { ...located.block.data, signers };
    return commit(source, located.index, located.block, next, blockId, options);
  }

  if (field === 'date') {
    const trimmed = value.trim();
    if (trimmed !== '') {
      const match = SIGNER_DATE_PATTERN.exec(trimmed);
      if (match === null) {
        return reject('invalid-date', 'The date must be in YYYY-MM-DD format.');
      }
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        return reject('invalid-date', 'That date does not exist — use YYYY-MM-DD.');
      }
    }
    const current = signer.date ?? '';
    if (trimmed === current) return noOp(source, blockId);
    const signers = located.block.data.signers.map((entry) => {
      if (entry.id !== signerId) return entry;
      const copy: Signer = { ...entry };
      if (trimmed === '') delete copy.date;
      else copy.date = trimmed;
      return copy;
    });
    const next: SignatureBlockData = { ...located.block.data, signers };
    return commit(source, located.index, located.block, next, blockId, options);
  }

  return reject('invalid-signer-field', 'That signer field is not supported.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One dispatcher for the image/signature editors (same narrow-prop
 * pattern as the P05-M3/P05-M4/P06-M2/P06-M3 dispatchers): every action
 * keeps its own validation above and the App wires exactly one
 * callback.
 */
export function applyImageSignatureAction(
  source: DocStudioDocument,
  blockId: DocUUID,
  action: ImageSignatureContentAction,
  options: BlockOpOptions = {},
): ImageSignatureActionResult {
  switch (action.action) {
    case 'set-image-layout':
      return setImageLayout(source, blockId, action.layout, options);
    case 'attach-slot-asset':
      return attachImageAsset(source, blockId, action.imageId, action.asset, options);
    case 'clear-slot-asset':
      return clearImageAsset(source, blockId, action.imageId, options);
    case 'set-slot-caption':
      return setImageCaption(source, blockId, action.imageId, action.caption, options);
    case 'set-slot-caption-placement':
      return setImageCaptionPlacement(source, blockId, action.imageId, action.placement, options);
    case 'set-slot-crop':
      return setImageCrop(source, blockId, action.imageId, action.crop, options);
    case 'set-slot-width-fraction':
      return setImageWidthFraction(source, blockId, action.imageId, action.widthFraction, options);
    case 'set-slot-align':
      return setImageAlign(source, blockId, action.imageId, action.hAlign, options);
    case 'set-signature-align':
      return setSignatureAlign(source, blockId, action.hAlign, options);
    case 'add-signer':
      return addSigner(source, blockId, options);
    case 'remove-signer':
      return removeSigner(source, blockId, action.signerId, options);
    case 'set-signer-field':
      return setSignerField(source, blockId, action.signerId, action.field, action.value, options);
    default:
      return reject('invalid-action', 'That image/signature block action is not supported.');
  }
}
