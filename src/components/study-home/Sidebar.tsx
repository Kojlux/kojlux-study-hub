import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactElement } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import NavigationGlyph from './NavigationGlyph';
import { COACH_COPY, COACH_CSS } from '../BottomNav';
import type { NavigateHandler, NavItem } from './types';

interface SidebarProps {
  items: readonly NavItem[];
  activeId: NavItem['id'];
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: NavigateHandler;
  /** Show the two first-run pop-ups pointing at Quiz and NoteCraft (tablet / desktop). */
  coachMarks?: boolean;
  onCoachDismiss?: () => void;
}

const COACH_CARD_H = 56;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// icon.png lives in /public, so Vite serves it from the site root (no import needed).
const appLogo: string = `${import.meta.env.BASE_URL}icon.png`;

// Logo replaces the old book icon inside the same .kh-brand-mark box, so the size is unchanged.
const brandMarkStyle: CSSProperties = { background: 'transparent', boxShadow: 'none', padding: 0, overflow: 'hidden' };
const brandLogoStyle: CSSProperties = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };

/** Same icons as the horizontal (phone) nav. Returns null for ids it doesn't know. */
function BarIcon({ id, active, size = 22 }: { id: string; active: boolean; size?: number }): ReactElement | null {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2 : 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    focusable: false as const,
  };

  switch (id) {
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
    default:
      return null;
  }
}

/** Left column. 240px expanded, 80px collapsed (icons only). */
export default function Sidebar({
  items,
  activeId,
  collapsed,
  onToggle,
  onNavigate,
  coachMarks = false,
  onCoachDismiss,
}: SidebarProps): ReactElement {
  const handleItemClick = (_event: MouseEvent<HTMLButtonElement>, id: NavItem['id']): void => {
    if (id === 'home') return; // already here
    onNavigate(id as Parameters<NavigateHandler>[0]);
  };

  // ---- First-run pop-ups -------------------------------------------------
  // The nav clips its children (overflow hidden), so the pop-ups are fixed-position cards
  // placed from the real icon positions instead of living inside it.
  const navRef = useRef<HTMLElement | null>(null);
  const [wide, setWide] = useState<boolean>(() => window.matchMedia('(min-width: 768px)').matches);
  const [anchor, setAnchor] = useState<{ x: number; quizY: number } | null>(null);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const onChange = (): void => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const measure = useCallback((): void => {
    const nav = navRef.current;
    const quiz = nav?.querySelector('[data-nav-id="quiz"] button');
    if (!nav || !quiz) {
      setAnchor(null);
      return;
    }
    const q = quiz.getBoundingClientRect();
    setAnchor({ x: nav.getBoundingClientRect().right + 14, quizY: q.top + q.height / 2 });
  }, []);

  const coachActive = coachMarks && wide;
  useEffect(() => {
    if (!coachActive) return undefined;
    measure();
    // The sidebar animates its width when collapsed/expanded, so measure again once it settles.
    const settle = window.setTimeout(measure, 460);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', measure);
    };
  }, [coachActive, collapsed, measure]);

  const quizTop = anchor ? anchor.quizY - COACH_CARD_H / 2 : 0;

  const handleToggle = (_event: MouseEvent<HTMLButtonElement>): void => onToggle();

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  // The extra Brain/summarizer entry is removed from the sidebar.
  // Quiz always sits in the middle slot so it stands out.
  const visibleItems = (() => {
    const list = items.filter((item) => item.id !== 'summarizer');
    const quizAt = list.findIndex((item) => item.id === 'quiz');
    if (quizAt < 0) return list;
    const [quizItem] = list.splice(quizAt, 1);
    list.splice(Math.floor((list.length + 1) / 2), 0, quizItem);
    return list;
  })();

  return (
    <>
    <nav className="kh-nav" aria-label="Primary" ref={navRef}>
      <div className="kh-brand">
        <span className="kh-brand-mark" aria-hidden="true" style={brandMarkStyle}>
          <img src={appLogo} alt="" style={brandLogoStyle} draggable={false} />
        </span>
        <span className="kh-brand-name kh-nav-label">Kojlux Study Hub</span>
      </div>

      <ul className="kh-nav-list">
        {visibleItems.map((item) => {
          const isActive: boolean = item.id === activeId;
          return (
            <li key={item.id} data-nav-id={item.id}>
              <button
                type="button"
                className={`kh-nav-item${coachActive && item.id === 'quiz' ? ' kh-coach-target' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                onClick={(event: MouseEvent<HTMLButtonElement>) => handleItemClick(event, item.id)}
              >
                {BarIcon({ id: item.id, active: isActive }) ?? (
                  <NavigationGlyph tab={item.id} active={isActive} size={22} />
                )}
                <span className="kh-nav-label">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="kh-nav-item kh-collapse"
        onClick={handleToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : undefined}
      >
        <ToggleIcon size={20} strokeWidth={1.9} aria-hidden="true" />
        <span className="kh-nav-label">Collapse</span>
      </button>
    </nav>

    {coachActive && <style>{COACH_CSS}</style>}
    {coachActive && anchor && (
      <div className="kh-coach-side" style={{ left: anchor.x, top: quizTop }} role="note" aria-label="Getting started">
        <div
          className="kh-coach-card kh-coach-card--side kh-coach-card--solo"
          style={{ height: COACH_CARD_H, animationDelay: '0.1s' }}
        >
          <span
            className="kh-coach-pointer kh-coach-pointer--left"
            style={{ top: clamp(anchor.quizY - quizTop, 14, COACH_CARD_H - 14), animationDelay: '0.1s' }}
            aria-hidden="true"
          />
          <button type="button" className="kh-coach-card-main" onClick={() => onNavigate('quiz')}>
            <span className="kh-coach-title">{COACH_COPY.quiz.title}</span>
            <span className="kh-coach-body">{COACH_COPY.quiz.body}</span>
          </button>
          <button type="button" className="kh-coach-close" onClick={onCoachDismiss} aria-label="Dismiss tip">
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
    )}
    </>
  );
}