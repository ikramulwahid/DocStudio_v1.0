import React, { useEffect, useState } from 'react';
import type { LabProfile } from '../../types/lab-profile';
import { createEmptyLabProfile } from '../../types/lab-profile';
import {
  normalizeLabProfile,
  validateLabProfileInput,
  type LabProfileValidation,
} from '../../services/lab-profile';
import './LabProfilePanel.css';

/**
 * Reusable Laboratory Profile editor (P03-M2).
 *
 * A small accessible form for the user's laboratory identity and contact
 * details.  It holds a LOCAL draft that is only committed through
 * `onSave` (Save) or reverted through the Cancel/Reset controls — editing here
 * never touches the active document or any template directly.  The parent App
 * owns the authoritative profile and its persistence.
 *
 * Field validation (email/website) is delegated to the pure
 * `validateLabProfileInput` service and rendered inline.
 */
interface LabProfilePanelProps {
  /** The authoritative saved profile (from the App). */
  profile: LabProfile;
  /** Commit the draft profile (persists across restarts via the App). */
  onSave: (profile: LabProfile) => void;
  /** Optional error/warning surfaced by the parent (e.g. a failed save). */
  error?: string | null;
}

const field = (label: string, id: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
  <div className="lab-profile-row">
    <label className="lab-profile-label" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      className="lab-profile-input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export const LabProfilePanel: React.FC<LabProfilePanelProps> = ({ profile, onSave, error }) => {
  const [draft, setDraft] = useState<LabProfile>(() => normalizeLabProfile(profile));
  const [validation, setValidation] = useState<LabProfileValidation>({});

  // Re-sync the draft when the authoritative profile changes externally
  // (e.g. after load/reset).  Guard against clobbering an in-progress edit by
  // only adopting an incoming profile that differs from the current draft's
  // source.
  useEffect(() => {
    setDraft(normalizeLabProfile(profile));
  }, [profile]);

  const update = (patch: Partial<LabProfile>) => {
    const next = normalizeLabProfile({ ...draft, ...patch });
    setDraft(next);
    setValidation(validateLabProfileInput(next));
  };

  const handleSave = () => {
    const errors = validateLabProfileInput(draft);
    setValidation(errors);
    if (Object.keys(errors).length > 0) return;
    onSave(normalizeLabProfile(draft));
  };

  const handleReset = () => {
    setDraft(createEmptyLabProfile());
    setValidation({});
  };

  return (
    <div className="lab-profile-form" role="group" aria-label="Laboratory profile">
      <p className="lab-profile-hint">
        Saved on this device. Used as the laboratory identity for new documents; it never changes
        documents you have already created.
      </p>

      {field('Laboratory / Organization Name', 'lab-profile-name', draft.name, (v) =>
        update({ name: v }),
      )}
      {field('Address', 'lab-profile-address', draft.address ?? '', (v) => update({ address: v }), 'text', 'Street address')}
      {field('City / State / Country', 'lab-profile-location', draft.location ?? '', (v) => update({ location: v }), 'text', 'City, State, Country')}
      {field('Phone', 'lab-profile-phone', draft.phone ?? '', (v) => update({ phone: v }), 'tel', 'Contact phone')}
      {field('Email', 'lab-profile-email', draft.email ?? '', (v) => update({ email: v }), 'email', 'name@example.com')}
      {validation.email && (
        <span className="lab-profile-error" role="alert">
          {validation.email}
        </span>
      )}
      {field('Website', 'lab-profile-website', draft.website ?? '', (v) => update({ website: v }), 'text', 'example.com')}
      {validation.website && (
        <span className="lab-profile-error" role="alert">
          {validation.website}
        </span>
      )}
      {field('Default Document ID Prefix', 'lab-profile-prefix', draft.documentIdPrefix ?? '', (v) => update({ documentIdPrefix: v }), 'text', 'e.g. LAB-SOP-')}

      {error && (
        <span className="lab-profile-error" role="alert">
          {error}
        </span>
      )}

      <div className="lab-profile-actions">
        <button type="button" className="lab-profile-btn lab-profile-btn--secondary" onClick={handleReset}>
          Reset
        </button>
        <button type="button" className="lab-profile-btn lab-profile-btn--secondary" onClick={() => setDraft(normalizeLabProfile(profile))}>
          Cancel
        </button>
        <button type="button" className="lab-profile-btn lab-profile-btn--primary" onClick={handleSave}>
          Save Profile
        </button>
      </div>
    </div>
  );
};

export default LabProfilePanel;
