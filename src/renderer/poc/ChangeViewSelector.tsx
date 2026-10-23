/**
 * DocStudio — PDF change-view selector (P07-M2, extracted P07-M2-R1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Markup/Clean radiogroup shown above the PDF preview whenever the
 * active document has pending tracked changes (project_details.md §12.1:
 * the rendered and exported PDF either shows the review markup or the
 * current content without it).  Extracted from `PocViewer` as a pure,
 * fully controlled presentational control so the real interaction can be
 * exercised under the verification harness (P07-M2-R1 test item 7C);
 * `PocViewer` keeps the `changeView` state and the render effect.
 *
 * @module renderer/poc/ChangeViewSelector
 */

import React from 'react';
import type { DocumentChangeView } from '../../services/track-changes';

export interface ChangeViewSelectorProps {
  /** Currently selected view (`markup` or `clean`). */
  value: DocumentChangeView;
  /** Fired when the user selects the other view. */
  onChange: (view: DocumentChangeView) => void;
}

/**
 * Accessible radiogroup (role + group label; each option is a native
 * radio inside a labelled target) choosing how the PDF is rendered and
 * exported while tracked changes are pending.
 */
export function ChangeViewSelector({
  value,
  onChange,
}: ChangeViewSelectorProps): React.ReactElement {
  return (
    <div
      className="poc-change-view"
      role="radiogroup"
      aria-label="Tracked-change markup in the rendered and exported PDF"
    >
      <span className="poc-change-view-label">PDF view:</span>
      <label className="poc-change-view-option" title="Show pending tracked-change markup in the PDF">
        <input
          type="radio"
          name="poc-change-view"
          value="markup"
          checked={value === 'markup'}
          onChange={() => onChange('markup')}
        />
        <span>Markup</span>
      </label>
      <label className="poc-change-view-option" title="Render the current content without review markup">
        <input
          type="radio"
          name="poc-change-view"
          value="clean"
          checked={value === 'clean'}
          onChange={() => onChange('clean')}
        />
        <span>Clean</span>
      </label>
    </div>
  );
}
