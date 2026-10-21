import React from 'react';
import type { ImageBlockData, ImageItem, SignatureBlockData } from '../../types/blocks';
import type { AssetRecord, DocUUID } from '../../types/document';
import {
  CAPTION_PLACEMENTS,
  IMAGE_ALIGNMENTS,
  IMAGE_LAYOUTS,
  MAX_IMAGE_CAPTION_LENGTH,
  MAX_SIGNERS,
  MAX_SIGNER_FIELD_LENGTH,
  MIN_SIGNERS,
  type ImageSignatureContentAction,
  type ImageSignatureActionResult,
} from '../../services/image-signature-content';

// ─────────────────────────────────────────────────────────────────────────────
// Image & signature editors (P06-M4, §6.4/§6.5 → spec §10.7/§10.8)
// ═══════════════════════════════════════════════════════════════════════════
//
// Edits the two block families through ONE narrow App-level dispatcher
// (`onAction` → `applyImageSignatureAction`).  Conventions are the
// structural/formula-editor ones: text fields commit onBlur, selects
// commit onChange, every failure surfaces the service's own message
// through `onError`, and no-op results never dirty the document.
//
// Image files are picked through the App's NATIVE dialog handler
// (`onPickImage`): cancel is a true no-op, and any failure (dialog,
// read, validation) leaves the document untouched while the panel shows
// the message.  The imported bytes are embedded into `doc.assets` — no
// external path is ever stored.

export type ImageSignatureDispatch = (
  blockId: DocUUID,
  action: ImageSignatureContentAction,
) => ImageSignatureActionResult;

export type ImagePickHandler = (
  blockId: DocUUID,
  imageId: DocUUID,
) => Promise<{ ok: boolean; message: string }>;

interface ImageSignatureEditorProps {
  blockId: DocUUID;
  onAction: ImageSignatureDispatch;
  onError: (message: string) => void;
}

interface ImageEditorProps extends ImageSignatureEditorProps {
  data: ImageBlockData;
  assets: readonly AssetRecord[];
  onPickImage: ImagePickHandler;
  onRequestConfirm: (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
  ) => void;
}

const ALIGN_LABELS: Readonly<Record<string, string>> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
};

const LAYOUT_LABELS: Readonly<Record<string, string>> = {
  single: 'One image',
  'side-by-side': 'Two images side by side',
};

const PLACEMENT_LABELS: Readonly<Record<string, string>> = {
  top: 'Above the image',
  bottom: 'Below the image',
};

/** Commit helper (same contract as `commitFormulaAction`). */
function commitAction(
  onAction: ImageSignatureDispatch,
  onError: (message: string) => void,
  blockId: DocUUID,
  action: ImageSignatureContentAction,
): ImageSignatureActionResult {
  const result = onAction(blockId, action);
  if (result.ok === false) onError(result.message);
  return result;
}

/** widthFraction → editable percent text ("60", "12.5"). */
const toPercent = (fraction: number): string => String(Math.round(fraction * 1000) / 10);
/** Editable percent text → widthFraction (validated by the service). */
const fromPercent = (text: string): number => parseFloat(text) / 100;

interface CropDraft {
  x: string;
  y: string;
  width: string;
  height: string;
}

const cropToDraft = (crop: ImageItem['crop']): CropDraft =>
  crop === undefined
    ? { x: '0', y: '0', width: '100', height: '100' }
    : {
        x: toPercent(crop.x),
        y: toPercent(crop.y),
        width: toPercent(crop.width),
        height: toPercent(crop.height),
      };

/**
 * One image slot's editor: file pick/remove, caption + position, size,
 * alignment and the normalized crop rectangle.  The crop fields are a
 * coordinated draft (all four commit together on blur); a rejected
 * commit keeps the typed values visible for fixing.
 */
function ImageSlotEditor({
  blockId,
  image,
  slotNumber,
  assets,
  onAction,
  onPickImage,
  onError,
}: {
  blockId: DocUUID;
  image: ImageItem;
  slotNumber: number;
  assets: readonly AssetRecord[];
  onAction: ImageSignatureDispatch;
  onPickImage: ImagePickHandler;
  onError: (message: string) => void;
}) {
  const commit = (action: ImageSignatureContentAction): ImageSignatureActionResult =>
    commitAction(onAction, onError, blockId, action);
  const asset = image.assetId !== null ? assets.find((entry) => entry.id === image.assetId) : undefined;
  const missingReference = image.assetId !== null && asset === undefined;

  const [cropDraft, setCropDraft] = React.useState<CropDraft>(() => cropToDraft(image.crop));
  React.useEffect(() => {
    setCropDraft(cropToDraft(image.crop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.crop?.x, image.crop?.y, image.crop?.width, image.crop?.height]);

  const commitCrop = (): ImageSignatureActionResult =>
    commit({
      action: 'set-slot-crop',
      imageId: image.id,
      crop: {
        x: fromPercent(cropDraft.x),
        y: fromPercent(cropDraft.y),
        width: fromPercent(cropDraft.width),
        height: fromPercent(cropDraft.height),
      },
    });

  const pickImage = (): void => {
    void onPickImage(blockId, image.id);
  };

  return (
    <li className="structural-entry-card">
      <div className="content-row">
        <span className="content-field-label">Image slot {slotNumber}</span>
        <span className="content-derived-hint">
          {image.assetId === null
            ? '(no image attached)'
            : missingReference
              ? '⚠ referenced asset is missing'
              : asset?.filename ?? '(attached)'}
        </span>
      </div>
      <div className="content-row">
        <button type="button" className="block-action-btn" onClick={pickImage}>
          Choose image…
        </button>
        {image.assetId !== null ? (
          <button
            type="button"
            className="block-action-btn block-action-btn--danger"
            onClick={() => commit({ action: 'clear-slot-asset', imageId: image.id })}
          >
            Remove image
          </button>
        ) : null}
      </div>
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`img-caption-${image.id}`}>
          Caption (optional)
        </label>
        <input
          id={`img-caption-${image.id}`}
          className="content-text-input"
          type="text"
          maxLength={MAX_IMAGE_CAPTION_LENGTH}
          defaultValue={image.caption ?? ''}
          onBlur={(event) =>
            commit({ action: 'set-slot-caption', imageId: image.id, caption: event.target.value })
          }
          placeholder="e.g. Figure 1 — Calibration curve"
        />
      </div>
      <div className="content-row">
        <label className="content-field" htmlFor={`img-placement-${image.id}`}>
          <span className="content-field-label">Caption position</span>
          <select
            id={`img-placement-${image.id}`}
            className="content-select"
            value={image.captionPlacement ?? 'bottom'}
            onChange={(event) =>
              commit({
                action: 'set-slot-caption-placement',
                imageId: image.id,
                placement: event.target.value as 'top' | 'bottom',
              })
            }
          >
            {CAPTION_PLACEMENTS.map((placement) => (
              <option key={placement} value={placement}>
                {PLACEMENT_LABELS[placement] ?? placement}
              </option>
            ))}
          </select>
        </label>
        <label className="content-field" htmlFor={`img-size-${image.id}`}>
          <span className="content-field-label">Size (% of page width)</span>
          <input
            id={`img-size-${image.id}`}
            className="content-text-input"
            type="number"
            min={10}
            max={100}
            step={1}
            inputMode="decimal"
            defaultValue={toPercent(image.widthFraction)}
            onBlur={(event) =>
              commit({
                action: 'set-slot-width-fraction',
                imageId: image.id,
                widthFraction: fromPercent(event.target.value),
              })
            }
          />
        </label>
        <label className="content-field" htmlFor={`img-align-${image.id}`}>
          <span className="content-field-label">Alignment</span>
          <select
            id={`img-align-${image.id}`}
            className="content-select"
            value={image.hAlign}
            onChange={(event) =>
              commit({
                action: 'set-slot-align',
                imageId: image.id,
                hAlign: event.target.value as ImageItem['hAlign'],
              })
            }
          >
            {IMAGE_ALIGNMENTS.map((align) => (
              <option key={align} value={align}>
                {ALIGN_LABELS[align] ?? align}
              </option>
            ))}
          </select>
        </label>
      </div>
      {image.assetId !== null ? (
        <div className="content-field content-field--stack">
          <span className="content-field-label">Crop (% of the original image)</span>
          <div className="content-row">
            <label className="content-field" htmlFor={`img-crop-x-${image.id}`}>
              <span className="content-field-label">From left</span>
              <input
                id={`img-crop-x-${image.id}`}
                className="content-text-input"
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="decimal"
                value={cropDraft.x}
                onChange={(event) => setCropDraft((draft) => ({ ...draft, x: event.target.value }))}
                onBlur={commitCrop}
              />
            </label>
            <label className="content-field" htmlFor={`img-crop-y-${image.id}`}>
              <span className="content-field-label">From top</span>
              <input
                id={`img-crop-y-${image.id}`}
                className="content-text-input"
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="decimal"
                value={cropDraft.y}
                onChange={(event) => setCropDraft((draft) => ({ ...draft, y: event.target.value }))}
                onBlur={commitCrop}
              />
            </label>
          </div>
          <div className="content-row">
            <label className="content-field" htmlFor={`img-crop-w-${image.id}`}>
              <span className="content-field-label">Width</span>
              <input
                id={`img-crop-w-${image.id}`}
                className="content-text-input"
                type="number"
                min={5}
                max={100}
                step={1}
                inputMode="decimal"
                value={cropDraft.width}
                onChange={(event) =>
                  setCropDraft((draft) => ({ ...draft, width: event.target.value }))
                }
                onBlur={commitCrop}
              />
            </label>
            <label className="content-field" htmlFor={`img-crop-h-${image.id}`}>
              <span className="content-field-label">Height</span>
              <input
                id={`img-crop-h-${image.id}`}
                className="content-text-input"
                type="number"
                min={5}
                max={100}
                step={1}
                inputMode="decimal"
                value={cropDraft.height}
                onChange={(event) =>
                  setCropDraft((draft) => ({ ...draft, height: event.target.value }))
                }
                onBlur={commitCrop}
              />
            </label>
          </div>
          <p className="content-derived-hint">
            The crop keeps the picture undistorted; at least 5% width and height must remain.
          </p>
          {image.crop !== undefined ? (
            <button
              type="button"
              className="block-action-btn"
              onClick={() => {
                setCropDraft(cropToDraft(undefined));
                commit({ action: 'set-slot-crop', imageId: image.id, crop: null });
              }}
            >
              Reset crop
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** The `image` block editor (§10.7): layout + one card per image slot. */
export function ImageContentEditor({
  blockId,
  data,
  assets,
  onAction,
  onPickImage,
  onError,
  onRequestConfirm,
}: ImageEditorProps) {
  const commit = (action: ImageSignatureContentAction): ImageSignatureActionResult =>
    commitAction(onAction, onError, blockId, action);

  const changeLayout = (layout: ImageLayoutValue): void => {
    if (layout === 'single' && data.images.length > 1) {
      const second = data.images[1];
      const holdsContent =
        second.assetId !== null ||
        second.crop !== undefined ||
        (second.caption ?? '') !== '';
      if (holdsContent) {
        onRequestConfirm(
          'Use a single image?',
          'Switching to one image drops the second slot, including its attached image, caption and crop.',
          'Switch to single',
          () => commit({ action: 'set-image-layout', layout: 'single' }),
        );
        return;
      }
    }
    commit({ action: 'set-image-layout', layout });
  };

  return (
    <div className="structural-editor">
      <label className="content-field" htmlFor={`img-layout-${blockId}`}>
        <span className="content-field-label">Layout</span>
        <select
          id={`img-layout-${blockId}`}
          className="content-select"
          value={data.layout}
          onChange={(event) => changeLayout(event.target.value as ImageLayoutValue)}
        >
          {IMAGE_LAYOUTS.map((layout) => (
            <option key={layout} value={layout}>
              {LAYOUT_LABELS[layout] ?? layout}
            </option>
          ))}
        </select>
      </label>
      <p className="content-derived-hint">
        Two side-by-side images fit the page width together, keeping their relative sizes.  A
        cropped image is shown undistorted at the selected size.
      </p>
      <ul className="structural-entry-list" role="list">
        {data.images.map((image, index) => (
          <ImageSlotEditor
            key={image.id}
            blockId={blockId}
            image={image}
            slotNumber={index + 1}
            assets={assets}
            onAction={onAction}
            onPickImage={onPickImage}
            onError={onError}
          />
        ))}
      </ul>
    </div>
  );
}

type ImageLayoutValue = (typeof IMAGE_LAYOUTS)[number];

/**
 * The `signature` block editor (§10.8): overall alignment plus one
 * card per signer (1–3) with the required name-or-designation rule,
 * optional department/date, and add/remove controls.
 */
export function SignatureContentEditor({
  blockId,
  data,
  onAction,
  onError,
  onRequestConfirm,
}: ImageSignatureEditorProps & {
  data: SignatureBlockData;
  onRequestConfirm: (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
  ) => void;
}) {
  const commit = (action: ImageSignatureContentAction): ImageSignatureActionResult =>
    commitAction(onAction, onError, blockId, action);
  const patchField = (
    signerId: DocUUID,
    field: 'role' | 'name' | 'designation' | 'department' | 'date',
    value: string,
  ): ImageSignatureActionResult =>
    commit({ action: 'set-signer-field', signerId, field, value });

  const removeSigner = (signerId: DocUUID): void => {
    onRequestConfirm(
      'Remove this signer?',
      'The signer’s role, name, designation, department and date are removed from this block.',
      'Remove signer',
      () => commit({ action: 'remove-signer', signerId }),
    );
  };

  return (
    <div className="structural-editor">
      <label className="content-field" htmlFor={`sig-align-${blockId}`}>
        <span className="content-field-label">Signer row alignment</span>
        <select
          id={`sig-align-${blockId}`}
          className="content-select"
          value={data.hAlign}
          onChange={(event) =>
            commit({
              action: 'set-signature-align',
              hAlign: event.target.value as SignatureBlockData['hAlign'],
            })
          }
        >
          {IMAGE_ALIGNMENTS.map((align) => (
            <option key={align} value={align}>
              {ALIGN_LABELS[align] ?? align}
            </option>
          ))}
        </select>
      </label>
      <p className="content-derived-hint">
        Each signer needs at least a name or a designation; department and date are optional.
        Printed names are identification only — never a verified electronic signature.
      </p>
      <ul className="structural-entry-list" role="list">
        {data.signers.map((signer, index) => (
          <li key={signer.id} className="structural-entry-card">
            <div className="content-row">
              <span className="content-field-label">Signer {index + 1}</span>
              {data.signers.length > MIN_SIGNERS ? (
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() => removeSigner(signer.id)}
                >
                  Remove signer
                </button>
              ) : null}
            </div>
            <div className="content-row">
              <div className="content-field content-field--stack">
                <label className="content-field-label" htmlFor={`sig-role-${signer.id}`}>
                  Role label (optional)
                </label>
                <input
                  id={`sig-role-${signer.id}`}
                  className="content-text-input"
                  type="text"
                  maxLength={MAX_SIGNER_FIELD_LENGTH}
                  defaultValue={signer.role}
                  onBlur={(event) => patchField(signer.id, 'role', event.target.value)}
                  placeholder="Prepared by"
                />
              </div>
              <div className="content-field content-field--stack">
                <label className="content-field-label" htmlFor={`sig-name-${signer.id}`}>
                  Name (optional if designation given)
                </label>
                <input
                  id={`sig-name-${signer.id}`}
                  className="content-text-input"
                  type="text"
                  maxLength={MAX_SIGNER_FIELD_LENGTH}
                  defaultValue={signer.name ?? ''}
                  onBlur={(event) => patchField(signer.id, 'name', event.target.value)}
                />
              </div>
            </div>
            <div className="content-row">
              <div className="content-field content-field--stack">
                <label className="content-field-label" htmlFor={`sig-designation-${signer.id}`}>
                  Designation (optional if name given)
                </label>
                <input
                  id={`sig-designation-${signer.id}`}
                  className="content-text-input"
                  type="text"
                  maxLength={MAX_SIGNER_FIELD_LENGTH}
                  defaultValue={signer.designation ?? ''}
                  onBlur={(event) => patchField(signer.id, 'designation', event.target.value)}
                  placeholder="Quality Manager"
                />
              </div>
              <div className="content-field content-field--stack">
                <label className="content-field-label" htmlFor={`sig-department-${signer.id}`}>
                  Department (optional)
                </label>
                <input
                  id={`sig-department-${signer.id}`}
                  className="content-text-input"
                  type="text"
                  maxLength={MAX_SIGNER_FIELD_LENGTH}
                  defaultValue={signer.department ?? ''}
                  onBlur={(event) => patchField(signer.id, 'department', event.target.value)}
                />
              </div>
            </div>
            <div className="content-field content-field--stack">
              <label className="content-field-label" htmlFor={`sig-date-${signer.id}`}>
                Date (optional, YYYY-MM-DD)
              </label>
              <input
                id={`sig-date-${signer.id}`}
                className="content-text-input"
                type="text"
                maxLength={10}
                defaultValue={signer.date ?? ''}
                onBlur={(event) => patchField(signer.id, 'date', event.target.value)}
                placeholder="2026-10-21"
              />
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="block-action-btn block-action-btn--wide"
        disabled={data.signers.length >= MAX_SIGNERS}
        onClick={() => commit({ action: 'add-signer' })}
      >
        Add signer ({data.signers.length} of {MAX_SIGNERS})
      </button>
    </div>
  );
}
