import React, { useEffect, useRef } from 'react';
import './ConfirmDialog.css';

export interface DialogAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
}

export interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Buttons rendered right-aligned. Escape/backdrop triggers the LAST action (expected to be Cancel). */
  actions: DialogAction[];
  /** Called when the user dismisses via backdrop click or Escape key. */
  onDismiss: () => void;
}

/**
 * App-consistent confirmation modal (P02-M3).
 * Accessible: role=dialog, aria-modal, labelled by title, initial focus on
 * the first action, Escape dismisses. No external dependency.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, actions, onDismiss }) => {
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    firstActionRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 className="confirm-dialog-title" id="confirm-dialog-title">
          {title}
        </h3>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          {actions.map((action, i) => (
            <button
              key={action.label}
              type="button"
              ref={i === 0 ? firstActionRef : undefined}
              className={`confirm-dialog-btn confirm-dialog-btn--${action.variant ?? 'secondary'}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
