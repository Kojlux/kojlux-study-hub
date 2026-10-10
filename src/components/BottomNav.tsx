import React, { useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent, ReactElement } from 'react';
import { BookOpen, ChartNoAxesCombined, FileText, Home, Layers, Link2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavTab = 'home' | 'quiz' | 'community' | 'review' | 'profile';

const TABS: { key: NavTab; label: string; icon: LucideIcon }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'quiz', label: 'Quiz Builder', icon: FileText },
  { key: 'review', label: 'Review', icon: Layers },
  { key: 'community', label: 'Study materials', icon: Link2 },
  { key: 'profile', label: 'Dashboard', icon: ChartNoAxesCombined },
];

interface BottomNavProps {
  active: NavTab;
  blockedTabs?: NavTab[];
  onChange: (tab: NavTab) => void;
}

export default function BottomNav({ active, blockedTabs = [], onChange }: BottomNavProps): ReactElement {
  const [expanded, setExpanded] = useState<boolean>(false);
  const pointerStartY = useRef<number | null>(null);
  const draggedHandle = useRef<boolean>(false);
  const tabs = TABS.filter(({ key }) => !blockedTabs.includes(key));
  useEffect(() => {
    if (!expanded) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  const handleNavigate = (tab: NavTab): void => {
    onChange(tab);
    setExpanded(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    pointerStartY.current = event.clientY;
    draggedHandle.current = false;
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    if (pointerStartY.current !== null && pointerStartY.current - event.clientY > 10) {
      draggedHandle.current = true;
      setExpanded(true);
    }
    pointerStartY.current = null;
  };

  const handleToggle = (_event: MouseEvent<HTMLButtonElement>): void => {
    if (draggedHandle.current) {
      draggedHandle.current = false;
      return;
    }
    setExpanded((isExpanded) => !isExpanded);
  };

  return (
    <>
      <nav className="kh-nav kh-global-sidebar" data-active={active} aria-label="Primary">
        <div className="kh-brand">
          <span className="kh-brand-mark" aria-hidden="true">
            <BookOpen size={18} strokeWidth={2.25} />
          </span>
          <span className="kh-brand-name kh-global-label">Kojlux Study Hub</span>
        </div>
        <ul className="kh-nav-list">
          {tabs.map(({ key, label, icon: Icon }) => (
            <li key={key} data-nav-id={key}>
              <button
                type="button"
                className="kh-nav-item"
                aria-current={active === key ? 'page' : undefined}
                aria-label={label}
                title={label}
                onClick={() => handleNavigate(key)}
              >
                <Icon size={20} strokeWidth={2.25} aria-hidden="true" />
                <span className="kh-global-label">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="kh-global-mobile" data-active={active}>
        <button
          type="button"
          className="kh-mobile-handle"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { pointerStartY.current = null; }}
          onClick={handleToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          title={expanded ? 'Collapse navigation' : 'Expand navigation'}
        >
          <span className="kh-mobile-handle-grip" aria-hidden="true" />
        </button>
        <div className="kh-mobile-icons" role="navigation" aria-label="Primary navigation">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className="kh-mobile-icon"
              aria-label={label}
              aria-current={active === key ? 'page' : undefined}
              title={label}
              onClick={() => handleNavigate(key)}
            >
              <Icon size={21} strokeWidth={2.35} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="kh-mobile-overlay">
          <button
            type="button"
            className="kh-mobile-backdrop"
            onClick={() => setExpanded(false)}
            aria-label="Close navigation"
          />
          <section className="kh-mobile-sheet" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <header className="kh-mobile-sheet-header">
              <div className="kh-brand">
                <span className="kh-brand-mark" aria-hidden="true">
                  <BookOpen size={18} strokeWidth={2.25} />
                </span>
                <span className="kh-brand-name">Kojlux Study Hub</span>
              </div>
              <button type="button" className="kh-mobile-close" onClick={() => setExpanded(false)} aria-label="Close navigation">
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <nav aria-label="Primary expanded navigation">
              <ul className="kh-nav-list">
                {tabs.map(({ key, label, icon: Icon }) => (
                  <li key={key} data-nav-id={key}>
                    <button
                      type="button"
                      className="kh-nav-item"
                      aria-current={active === key ? 'page' : undefined}
                      onClick={() => handleNavigate(key)}
                    >
                      <Icon size={21} strokeWidth={2.25} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </section>
        </div>
      )}
    </>
  );
}