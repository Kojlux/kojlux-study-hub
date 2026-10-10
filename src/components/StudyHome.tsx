import { useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Bell, BookOpen, ChartNoAxesCombined } from 'lucide-react';
import type { Collection, HistoryItem, RecallCard } from '../types';
import { BadgePackReveal, BadgeProgressModal, earnedMilestone } from './study-home/BadgeSystem';
import { HistoryDetailModal } from './study-home/HistoryDetailModal';
import RecentActivity from './study-home/RecentActivity';
import Sidebar from './study-home/Sidebar';
import StreakPill from './study-home/StreakPill';
import StudyDesk from './study-home/StudyDesk';
import StudyToolsGrid from './study-home/StudyToolsGrid';
import { NAV_ITEMS, STUDY_TOOLS } from './study-home/data';
import { useSidebarCollapse } from './study-home/hooks';
import type { NavigateHandler, SidebarCollapse, WorkspaceNavId } from './study-home/types';
import { getGreeting } from './study-home/utils';
import './study-home/StudyHome.css';

const BADGE_STORAGE_KEY = 'kojlux_last_badge_milestone';
const WEEK_MS: number = 7 * 24 * 60 * 60 * 1000;

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
  username,
  streak,
  activityDays,
  history,
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
  const [showProgress, setShowProgress] = useState<boolean>(false);
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

  const creationsThisWeek: number = useMemo(() => {
    const cutoff: number = Date.now() - WEEK_MS;
    return history.filter((h) => new Date(h.createdAt).getTime() >= cutoff).length;
  }, [history]);

  const greeting: string = useMemo(() => getGreeting(), []);
  const recent: HistoryItem[] = history.slice(0, 4);
  const visibleNavItems = NAV_ITEMS.filter((item) => !blockedNavItems.includes(item.id));
  const visibleTools = STUDY_TOOLS.filter((tool) => !blockedNavItems.includes(tool.id));

  const handleReplay = (day: number): void => {
    setShowProgress(false);
    setCelebration(day);
  };

  return (
    <div className="kh-shell" data-collapsed={collapsed}>
      <Sidebar items={visibleNavItems} activeId="home" collapsed={collapsed} onToggle={toggle} onNavigate={onNavigate} />

      <main className="kh-main">
        <div className="kh-main-inner">
          {children}
          <header className="kh-header">
            <div className="kh-header-copy">
              <div className="kh-header-brand">
                <span className="kh-brand-mark kh-home-brand-mark" aria-hidden="true">
                  <BookOpen size={14} strokeWidth={2.25} />
                </span>
                <p className="kh-brand-title">Kojlux Study Hub</p>
              </div>
              <h1 className="kh-greeting">
                {greeting}, <span className="kh-greeting-name">{username || 'Student'}</span>
              </h1>
              <p className="kh-header-meta">
                {creationsThisWeek} created this week &middot; {history.length} total
              </p>
            </div>
            <div className="kh-header-actions">
              <StreakPill streak={streak} daysActive={daysActive} onOpen={() => setShowProgress(true)} />
              <button
                type="button"
                className="kh-dashboard-mobile"
                onClick={() => onNavigate('profile')}
                aria-label="Dashboard"
                title="Dashboard"
              >
                <ChartNoAxesCombined size={18} aria-hidden="true" />
              </button>
              {onOpenNotifications && (
                <button
                  type="button"
                  className="kh-notification-button"
                  onClick={onOpenNotifications}
                  aria-label={notificationCount > 0 ? `${notificationCount} unread notifications` : 'Notifications'}
                  title="Notifications"
                >
                  <Bell size={18} aria-hidden="true" />
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
      {showProgress && (
        <BadgeProgressModal activityDays={activityDays} onClose={() => setShowProgress(false)} onReplay={handleReplay} />
      )}
      {celebration !== null && <BadgePackReveal milestone={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}