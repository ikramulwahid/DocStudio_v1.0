import React from 'react';
import { Icon, IconName } from '../common/Icon';
import './LeftPanel.css';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon: IconName;
  isOpen: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  id,
  title,
  icon,
  isOpen,
  onToggle,
  badge,
  children,
}) => {
  return (
    <section className={`panel-section ${isOpen ? 'open' : 'collapsed'}`} id={`section-${id}`}>
      <button
        type="button"
        className="section-header"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`content-${id}`}
      >
        <div className="section-header-left">
          <Icon name={icon} size={15} className="section-icon" />
          <span className="section-title">{title}</span>
        </div>
        <div className="section-header-right">
          {badge && <span className="section-badge">{badge}</span>}
          <Icon
            name="chevron-down"
            size={14}
            className={`section-chevron ${isOpen ? 'rotate-open' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="section-content" id={`content-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
};
