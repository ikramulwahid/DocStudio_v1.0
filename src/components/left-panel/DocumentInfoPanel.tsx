import React from 'react';
import type { DocumentMetadata } from '../../types/document';
import { newUUID } from '../../types/defaults';
import {
  METADATA_FIELD_SPECS,
  METADATA_GROUPS,
  statusOptions,
  toDatePickerValue,
  normalizeFieldValue,
  formatTimestampForDisplay,
  type MetadataFieldSpec,
} from '../../services/metadata-fields';

/**
 * Document Information panel (P02-M5).
 *
 * Every control is a controlled input bound directly to the authoritative
 * `activeDocument.metadata` object; there is no local copy of any field.
 * Edits flow through `onMetadataChange` → `updateDocumentMetadata()`, which
 * preserves unrelated fields, keeps `createdAt` immutable and stamps
 * `modifiedAt` only on a real change. Values shown for
 * `createdAt`/`modifiedAt` are read-only displays of the stored ISO strings.
 */
interface DocumentInfoPanelProps {
  /** The authoritative document metadata (from `activeDocument.metadata`). */
  metadata: DocumentMetadata;
  /** Type-safe immutable metadata update handler. */
  onMetadataChange: (patch: Partial<DocumentMetadata>) => void;
}

const coreFieldId = (spec: MetadataFieldSpec): string => `meta-field-${spec.key}`;

export const DocumentInfoPanel: React.FC<DocumentInfoPanelProps> = ({
  metadata,
  onMetadataChange,
}) => {
  const handleTextChange =
    (spec: MetadataFieldSpec) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      onMetadataChange({
        [spec.key]: normalizeFieldValue(spec, event.target.value),
      } as Partial<DocumentMetadata>);
    };

  // ── Custom (user-defined) fields ────────────────────────────────────────
  const handleCustomChange = (index: number, part: 'label' | 'value', value: string): void => {
    onMetadataChange({
      customFields: metadata.customFields.map((field, i) =>
        i === index ? { ...field, [part]: value } : field,
      ),
    });
  };

  const handleCustomAdd = (): void => {
    onMetadataChange({
      customFields: [
        ...metadata.customFields,
        { id: newUUID(), label: `Field ${metadata.customFields.length + 1}`, value: '' },
      ],
    });
  };

  const handleCustomRemove = (index: number): void => {
    onMetadataChange({ customFields: metadata.customFields.filter((_, i) => i !== index) });
  };

  const renderField = (spec: MetadataFieldSpec): React.ReactNode => {
    const label = (
      <label className="meta-label" htmlFor={coreFieldId(spec)}>
        {spec.label}
      </label>
    );

    let control: React.ReactNode;
    if (spec.type === 'select') {
      control = (
        <select
          id={coreFieldId(spec)}
          className="meta-select"
          value={metadata.status}
          onChange={(event) => onMetadataChange({ status: event.target.value })}
        >
          {statusOptions(metadata.status).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    } else if (spec.type === 'date') {
      control = (
        <input
          id={coreFieldId(spec)}
          className="meta-input"
          type="date"
          value={toDatePickerValue(metadata[spec.key])}
          onChange={handleTextChange(spec)}
        />
      );
    } else if (spec.type === 'textarea') {
      control = (
        <textarea
          id={coreFieldId(spec)}
          className="meta-textarea"
          value={metadata[spec.key] ?? ''}
          placeholder={spec.placeholder ?? ''}
          rows={2}
          onChange={handleTextChange(spec)}
        />
      );
    } else {
      control = (
        <input
          id={coreFieldId(spec)}
          className="meta-input"
          type="text"
          value={metadata[spec.key] ?? ''}
          placeholder={spec.placeholder ?? ''}
          onChange={handleTextChange(spec)}
        />
      );
    }

    return (
      <div className="meta-row" key={spec.key}>
        {label}
        {control}
      </div>
    );
  };

  return (
    <div className="meta-form">
      {METADATA_GROUPS.map((group) => {
        const fields = METADATA_FIELD_SPECS.filter((spec) => spec.group === group.id);
        if (fields.length === 0) return null;
        return (
          <div
            className="meta-group"
            key={group.id}
            role="group"
            aria-label={group.title}
          >
            <div className="meta-group-title">{group.title}</div>
            {fields.map(renderField)}

            {group.id === 'core' && (
              <div className="meta-timestamps" aria-label="Document timestamps">
                <div className="meta-row">
                  <span className="meta-label" id="meta-created-label">
                    Date Created
                  </span>
                  <span
                    className="meta-readonly"
                    id="meta-created-value"
                    title={metadata.createdAt}
                  >
                    {formatTimestampForDisplay(metadata.createdAt)}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label" id="meta-modified-label">
                    Date Modified
                  </span>
                  <span
                    className="meta-readonly"
                    id="meta-modified-value"
                    title={metadata.modifiedAt}
                  >
                    {formatTimestampForDisplay(metadata.modifiedAt)}
                  </span>
                </div>
                <span className="meta-hint">
                  Maintained automatically — creation never changes; modification
                  updates on real changes and saves.
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* User-defined extension fields */}
      <div className="meta-group" role="group" aria-label="Additional metadata fields">
        <div className="meta-group-title">Additional Fields</div>
        {metadata.customFields.length === 0 && (
          <span className="meta-hint">No additional fields yet.</span>
        )}
        {metadata.customFields.map((field, index) => (
          <div className="meta-custom-row" key={field.id}>
            <input
              className="meta-input"
              type="text"
              aria-label={`Additional field ${index + 1} label`}
              placeholder="Label"
              value={field.label}
              onChange={(event) => handleCustomChange(index, 'label', event.target.value)}
            />
            <input
              className="meta-input"
              type="text"
              aria-label={`Additional field ${index + 1} value`}
              placeholder="Value"
              value={field.value}
              onChange={(event) => handleCustomChange(index, 'value', event.target.value)}
            />
            <button
              type="button"
              className="meta-remove-btn"
              aria-label={`Remove additional field ${field.label || index + 1}`}
              title="Remove this field"
              onClick={() => handleCustomRemove(index)}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="meta-add-btn" onClick={handleCustomAdd}>
          + Add field
        </button>
      </div>
    </div>
  );
};

export default DocumentInfoPanel;
