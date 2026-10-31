import type { CSSProperties, MouseEvent, ReactElement } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import NavigationGlyph from './NavigationGlyph';
import type { NavigateHandler, NavItem } from './types';

interface SidebarProps {
  items: readonly NavItem[];
  activeId: NavItem['id'];
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: NavigateHandler;
}

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
export default function Sidebar({ items, activeId, collapsed, onToggle, onNavigate }: SidebarProps): ReactElement {
  const handleItemClick = (_event: MouseEvent<HTMLButtonElement>, id: NavItem['id']): void => {
    if (id === 'home') return; // already here
    onNavigate(id);
  };

  const handleToggle = (_event: MouseEvent<HTMLButtonElement>): void => onToggle();

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  // The extra Brain/summarizer entry is removed from the sidebar.
  const visibleItems = items.filter((item) => item.id !== 'summarizer');

  return (
    <nav className="kh-nav" aria-label="Primary">
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
                className="kh-nav-item"
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
  );
}