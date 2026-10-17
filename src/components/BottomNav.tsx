import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent, ReactElement } from 'react';
import { BookOpen, X } from 'lucide-react';

export type NavTab = 'home' | 'quiz' | 'community' | 'review' | 'profile';

const TABS: { key: NavTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'quiz', label: 'Quiz Builder' },
  { key: 'review', label: 'Review' },
  { key: 'community', label: 'Study Materials' },
  { key: 'profile', label: 'Dashboard' },
];

interface BottomNavProps {
  active: NavTab;
  blockedTabs?: NavTab[];
  onChange: (tab: NavTab) => void;
}

// Phone bar shape (no colors changed). Only the inner bar and its buttons get inline
// styles; the wrapper keeps your class so your CSS still decides where it sits and
// when it is shown or hidden at each screen size.
const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-around',
  width: '100%',
  boxSizing: 'border-box',
};

const barButtonStyle = (isActive: boolean): CSSProperties => ({
  width: 48,
  height: 32,
  padding: 0,
  display: 'grid',
  placeItems: 'center',
  border: 0,
  borderRadius: 999,
  cursor: 'pointer',
  ...(isActive ? {} : { background: 'transparent' }),
});

// Nav icons (all in this file). They use currentColor unless a color is passed.
interface NavIconProps {
  tab: NavTab;
  active: boolean;
  size?: number;
  color?: string;
}

function NavIcon({ tab, active, size = 20, color }: NavIconProps): ReactElement {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2 : 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: color ? { color } : undefined,
    'aria-hidden': true as const,
    focusable: false as const,
  };

  switch (tab) {
    case 'home':
      return (
        <svg {...common} fill={active ? 'currentColor' : 'none'}>
          <path d="M12 3 3 10.5V20a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1v-9.5z" />
        </svg>
      );
    case 'quiz':
      return (
        <svg {...common}>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case 'review':
      return (
        <svg {...common}>
          <g transform="rotate(20 14 11)">
            <rect x="9" y="4" width="10" height="14" rx="2" />
            <path d="M14 8.5l1.7 2.5-1.7 2.5-1.7-2.5z" fill="currentColor" />
          </g>
          <path d="M3 14l2-.8M3.5 17l2.2-1.1M4.5 20l2-1.3" />
        </svg>
      );
    case 'community':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="13" height="15" rx="2" />
          <path d="M17 6h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-1" />
          <path d="M8.5 14l2-5.5 2 5.5M9.2 12.3h3.6" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <path d="M5 7h14M5 12h14M5 17h14" />
        </svg>
      );
  }
}

const MOBILE_ICON_ACTIVE = '#0f172a';
const MOBILE_ICON_IDLE = '#4b5563';

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
          {tabs.map(({ key, label }) => (
            <li key={key} data-nav-id={key}>
              <button
                type="button"
                className="kh-nav-item"
                aria-current={active === key ? 'page' : undefined}
                aria-label={label}
                title={label}
                onClick={() => handleNavigate(key)}
              >
                <NavIcon tab={key} active={active === key} size={20} />
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
        <div className="kh-mobile-icons" style={barStyle} role="navigation" aria-label="Primary navigation">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="kh-mobile-icon"
              style={barButtonStyle(active === key)}
              aria-label={label}
              aria-current={active === key ? 'page' : undefined}
              title={label}
              onClick={() => handleNavigate(key)}
            >
              <NavIcon tab={key} active={active === key} size={22} color={active === key ? MOBILE_ICON_ACTIVE : MOBILE_ICON_IDLE} />
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
                {tabs.map(({ key, label }) => (
                  <li key={key} data-nav-id={key}>
                    <button
                      type="button"
                      className="kh-nav-item"
                      aria-current={active === key ? 'page' : undefined}
                      onClick={() => handleNavigate(key)}
                    >
                      <NavIcon tab={key} active={active === key} />
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