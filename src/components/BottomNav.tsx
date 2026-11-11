import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent, ReactElement } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

// 'profile' is kept as a legacy route id only (old notification links may still point
// at it). It no longer has a nav icon: Calendar and Settings live in the Notifications
// screen's floating nav now.
export type NavTab = 'home' | 'quiz' | 'notecraft' | 'community' | 'review' | 'profile';

const TABS: { key: NavTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'notecraft', label: 'NoteCraft' },
  { key: 'review', label: 'Review' },
  { key: 'community', label: 'Study Materials' },
];

/** First-run pop-up copy, shown over the Quiz and NoteCraft icons until the student makes their first one. */
export const COACH_COPY = {
  quiz: { title: 'Make your first quiz', body: 'Turn your notes into practice questions.' },
  notecraft: { title: 'Make your first notes', body: 'Turn any topic into clean study notes.' },
} as const;

/**
 * Stand-out styling for the single first-run Quiz pop-up. It reads the theme's own accent
 * variable (--kh-accent, falling back to --color-focus-primary) so it follows whichever
 * theme the student picked instead of a fixed colour.
 */
export const COACH_CSS = `
.kh-coach-card.kh-coach-card--solo {
  border: 2px solid var(--kh-accent, var(--color-focus-primary));
  box-shadow: 0 10px 30px color-mix(in srgb, var(--kh-accent, var(--color-focus-primary)) 40%, transparent);
}
.kh-coach-card--solo .kh-coach-title {
  color: var(--kh-accent, var(--color-focus-primary));
  font-weight: 800;
}
.kh-nav-item.kh-coach-target,
.kh-mobile-icon.kh-coach-target {
  animation: kh-coach-ring 1.8s ease-out infinite;
}
@keyframes kh-coach-ring {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--kh-accent, var(--color-focus-primary)) 55%, transparent); }
  70%, 100% { box-shadow: 0 0 0 12px transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .kh-nav-item.kh-coach-target,
  .kh-mobile-icon.kh-coach-target { animation: none; }
}
`;

interface BottomNavProps {
  active: NavTab;
  blockedTabs?: NavTab[];
  onChange: (tab: NavTab) => void;
  /** Optional: pass these to control the desktop sidebar's collapsed state from a parent.
   *  If omitted, the sidebar keeps its own collapsed state. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** True while a page like Notifications is open: the sidebar stays visible on every screen
   *  size (even over Home) and no tab is highlighted. */
  overlayOpen?: boolean;
  /** Phone only: show the two first-run pop-ups pointing at Quiz and NoteCraft. */
  coachMarks?: boolean;
  onCoachDismiss?: () => void;
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

// Nav icons (all in this file). They use currentColor, so the colors come from the CSS
// (same accent / muted colors as the side bar, light and dark).
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
    case 'notecraft':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
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

// The logo replaces the old book icon inside the same .kh-brand-mark box, so the
// box keeps its size. The box background is cleared so the logo isn't framed twice.
const brandMarkStyle: CSSProperties = { background: 'transparent', boxShadow: 'none', padding: 0, overflow: 'hidden' };
const brandLogoStyle: CSSProperties = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };

// icon.png lives in /public, so Vite serves it from the site root (no import needed).
const appLogo: string = `${import.meta.env.BASE_URL}icon.png`;

export default function BottomNav({
  active,
  blockedTabs = [],
  onChange,
  collapsed: collapsedProp,
  onToggleCollapse,
  overlayOpen = false,
  coachMarks = false,
  onCoachDismiss,
}: BottomNavProps): ReactElement {
  const current: NavTab | null = overlayOpen ? null : active;
  const dataActive: string = overlayOpen ? 'overlay' : active;
  const [expanded, setExpanded] = useState<boolean>(false);
  const [collapsedInternal, setCollapsedInternal] = useState<boolean>(true); // collapsed by default
  const collapsed: boolean = collapsedProp ?? collapsedInternal;
  const handleCollapseToggle = (): void => {
    if (onToggleCollapse) onToggleCollapse();
    else setCollapsedInternal((isCollapsed) => !isCollapsed);
  };
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const labelStyle: CSSProperties | undefined = collapsed ? { display: 'none' } : undefined;
  const pointerStartY = useRef<number | null>(null);
  const draggedHandle = useRef<boolean>(false);
  // Quiz always sits in the middle slot so it stands out (slot 3 of 5, or slot 3 of 4 if a tab is blocked).
  const tabs = (() => {
    const list = TABS.filter(({ key }) => !blockedTabs.includes(key));
    const quizAt = list.findIndex(({ key }) => key === 'quiz');
    if (quizAt < 0) return list;
    const [quizTab] = list.splice(quizAt, 1);
    list.splice(Math.floor((list.length + 1) / 2), 0, quizTab);
    return list;
  })();
  // Where the Quiz icon's centre sits across the bar, as a percentage. The icons share the
  // bar in equal slots, so slot index maps straight to a percentage.
  const quizIndex = tabs.findIndex(({ key }) => key === 'quiz');
  const showCoach = coachMarks && !expanded && quizIndex >= 0;
  const quizCenter = ((quizIndex + 0.5) / tabs.length) * 100;
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
      <nav
        className="kh-nav kh-global-sidebar"
        data-active={dataActive}
        data-collapsed={collapsed}
        style={collapsed ? { width: 80 } : undefined}
        aria-label="Primary"
      >
        <div className="kh-brand">
          <span className="kh-brand-mark" aria-hidden="true" style={brandMarkStyle}>
            <img src={appLogo} alt="" style={brandLogoStyle} draggable={false} />
          </span>
          <span className="kh-brand-name kh-global-label" style={labelStyle}>Kojlux Study Hub</span>
        </div>
        <ul className="kh-nav-list">
          {tabs.map(({ key, label }) => (
            <li key={key} data-nav-id={key}>
              <button
                type="button"
                className="kh-nav-item"
                aria-current={current === key ? 'page' : undefined}
                aria-label={label}
                title={label}
                onClick={() => handleNavigate(key)}
              >
                <NavIcon tab={key} active={current === key} size={22} />
                <span className="kh-global-label" style={labelStyle}>{label}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="kh-nav-item kh-collapse"
          onClick={handleCollapseToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : undefined}
        >
          <ToggleIcon size={20} strokeWidth={1.9} aria-hidden="true" />
          <span className="kh-global-label" style={labelStyle}>Collapse</span>
        </button>
      </nav>

      <div className="kh-global-mobile" data-active={dataActive}>
        {showCoach && (
          <div className="kh-coach-layer" role="note" aria-label="Getting started">
            <style>{COACH_CSS}</style>
            {/* One pop-up only, centred over the middle of the bar. Its pointer still aims at the Quiz icon. */}
            <div className="kh-coach-row" style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                className="kh-coach-card kh-coach-card--solo"
                style={{ width: 'min(280px, 88%)', animationDelay: '0.15s' }}
              >
                <button
                  type="button"
                  className="kh-coach-card-main"
                  onClick={() => handleNavigate('quiz')}
                >
                  <span className="kh-coach-title">{COACH_COPY.quiz.title}</span>
                  <span className="kh-coach-body">{COACH_COPY.quiz.body}</span>
                </button>
                <button type="button" className="kh-coach-close" onClick={onCoachDismiss} aria-label="Dismiss tip">
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
            <span className="kh-coach-pointer" style={{ left: `${quizCenter}%`, animationDelay: '0.15s' }} aria-hidden="true" />
          </div>
        )}
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
              className={`kh-mobile-icon${showCoach && key === 'quiz' ? ' kh-coach-target' : ''}`}
              style={barButtonStyle(current === key)}
              aria-label={label}
              aria-current={current === key ? 'page' : undefined}
              title={label}
              onClick={() => handleNavigate(key)}
            >
              <NavIcon tab={key} active={current === key} size={22} />
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
                <span className="kh-brand-mark" aria-hidden="true" style={brandMarkStyle}>
                  <img src={appLogo} alt="" style={brandLogoStyle} draggable={false} />
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
                      aria-current={current === key ? 'page' : undefined}
                      onClick={() => handleNavigate(key)}
                    >
                      <NavIcon tab={key} active={current === key} />
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