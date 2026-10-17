import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Collection, HistoryItem, RecallCard } from '../types';
import { BadgePackReveal, earnedMilestone } from './study-home/BadgeSystem';
import { HistoryDetailModal } from './study-home/HistoryDetailModal';
import RecentActivity from './study-home/RecentActivity';
import Sidebar from './study-home/Sidebar';
import StudyDesk from './study-home/StudyDesk';
import StudyToolsGrid from './study-home/StudyToolsGrid';
import { NAV_ITEMS, STUDY_TOOLS } from './study-home/data';
import { useSidebarCollapse } from './study-home/hooks';
import type { NavigateHandler, SidebarCollapse, WorkspaceNavId } from './study-home/types';
import './study-home/StudyHome.css';

const BADGE_STORAGE_KEY = 'kojlux_last_badge_milestone';

// Compact header styles live here so everything stays in this one file.
// Selectors are scoped under .kh-shell so they override StudyHome.css.
// The divider line under the header is left alone.
const HEADER_CSS = `
.kh-shell .kh-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.kh-shell .kh-header .kh-header-copy {
  display: flex;
  align-items: center;
  min-width: 0;
}
.kh-shell .kh-header .kh-brand-title {
  margin: 0;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: 0;
  text-transform: none;
  color: #18181c;
  white-space: nowrap;
}
.kh-shell .kh-header .kh-header-actions {
  display: flex;
  align-items: center;
}
.kh-shell .kh-header .kh-notification-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: auto;
  padding: 6px;
  background: none;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  color: #373a41;
  cursor: pointer;
}
.dark .kh-shell .kh-header .kh-brand-title {
  color: #f1f5f9;
}
.dark .kh-shell .kh-header .kh-notification-button {
  color: #94a3b8;
}
.kh-shell .kh-header .kh-bell-icon {
  display: block;
}
`;

// Slim outline bell: top nub, straight-sided body, flared rim, small clapper.
function BellIcon(): ReactElement {
  return (
    <svg
      className="kh-bell-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.75v1.5" />
      <path d="M6.4 17.5v-7.2a5.6 5.6 0 0 1 11.2 0v7.2" />
      <path d="M5 17.5h14" />
      <path d="M10.9 20.5a1.1 1.1 0 0 0 2.2 0" />
    </svg>
  );
}

export interface StudyHomeProps {
  username: string;
  streak: number;
  activityDays: string[];
  history: HistoryItem[];
  onNavigate: NavigateHandler;
  dueCards?: readonly RecallCard[];
  collections?: readonly Collection[];
  recallCards?: readonly RecallCard[];
  blockedNavItems?: readonly WorkspaceNavId[];
  notificationCount?: number;
  onOpenNotifications?: () => void;
  onOpenCollection?: (collection: Collection) => void;
  children?: ReactNode;
}

export default function StudyHome({
  history,
  activityDays,
  onNavigate,
  dueCards = [],
  collections = [],
  recallCards = [],
  blockedNavItems = [],
  notificationCount = 0,
  onOpenNotifications,
  onOpenCollection,
  children,
}: StudyHomeProps): ReactElement {
  const { collapsed, toggle }: SidebarCollapse = useSidebarCollapse();
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [celebration, setCelebration] = useState<number | null>(null);

  const daysActive: number = activityDays.length;

  // Celebrate a newly earned badge exactly once per milestone.
  useEffect(() => {
    const shown = Number(localStorage.getItem(BADGE_STORAGE_KEY) || 0);
    const earned: number = earnedMilestone(daysActive);
    if (earned > shown) {
      localStorage.setItem(BADGE_STORAGE_KEY, String(earned));
      setCelebration(earned);
    }
  }, [daysActive]);

  const recent: HistoryItem[] = history.slice(0, 4);
  const visibleNavItems = NAV_ITEMS.filter((item) => !blockedNavItems.includes(item.id));
  const visibleTools = STUDY_TOOLS.filter((tool) => !blockedNavItems.includes(tool.id));

  return (
    <div className="kh-shell" data-collapsed={collapsed}>
      <style>{HEADER_CSS}</style>
      <Sidebar items={visibleNavItems} activeId="home" collapsed={collapsed} onToggle={toggle} onNavigate={onNavigate} />

      <main className="kh-main">
        <div className="kh-main-inner">
          {children}
          <header className="kh-header">
            <div className="kh-header-copy">
              <p className="kh-brand-title">Kojlux Study Hub</p>
            </div>
            <div className="kh-header-actions">
              {onOpenNotifications && (
                <button
                  type="button"
                  className="kh-notification-button"
                  onClick={onOpenNotifications}
                  aria-label={notificationCount > 0 ? `${notificationCount} unread notifications` : 'Notifications'}
                  title="Notifications"
                >
                  <BellIcon />
                  {notificationCount > 0 && <span className="kh-notification-count">{notificationCount > 9 ? '9+' : notificationCount}</span>}
                </button>
              )}
            </div>
          </header>

          <StudyToolsGrid tools={visibleTools} onNavigate={onNavigate} />
          <RecentActivity items={recent} onSelect={setSelected} onCreate={() => onNavigate('quiz')} />
        </div>
      </main>

      <StudyDesk
        dueCards={dueCards}
        collections={collections}
        recallCards={recallCards}
        onNavigate={onNavigate}
        onOpenCollection={onOpenCollection}
      />

      {selected && <HistoryDetailModal item={selected} onClose={() => setSelected(null)} />}
      {celebration !== null && <BadgePackReveal milestone={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}