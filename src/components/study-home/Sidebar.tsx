import type { MouseEvent, ReactElement } from 'react';
import { BookOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { NavigateHandler, NavItem } from './types';

interface SidebarProps {
  items: readonly NavItem[];
  activeId: NavItem['id'];
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: NavigateHandler;
}

/** Left column. 240px expanded, 80px collapsed (icons only). */
export default function Sidebar({ items, activeId, collapsed, onToggle, onNavigate }: SidebarProps): ReactElement {
  const handleItemClick = (_event: MouseEvent<HTMLButtonElement>, id: NavItem['id']): void => {
    if (id === 'home') return; // already here
    onNavigate(id);
  };

  const handleToggle = (_event: MouseEvent<HTMLButtonElement>): void => onToggle();

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <nav className="kh-nav" aria-label="Primary">
      <div className="kh-brand">
        <span className="kh-brand-mark" aria-hidden="true">
          <BookOpen size={18} strokeWidth={2.25} />
        </span>
        <span className="kh-brand-name kh-nav-label">Kojlux Study Hub</span>
      </div>

      <ul className="kh-nav-list">
        {items.map((item) => {
          const Icon = item.icon;
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
                <Icon size={20} strokeWidth={2.25} aria-hidden="true" />
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
