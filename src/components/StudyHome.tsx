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
.kh-shell .kh-header {
  padding-bottom: 14px;
  margin-bottom: 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.12);
}
.dark .kh-shell .kh-header {
  border-bottom-color: rgba(148, 163, 184, 0.22);
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

/* Phone (under 768px): show the Cards / Due today folder above Saved collections. */
@media (max-width: 767px) {
  /* Phone: drop the short header divider; the full-width line below it is solid
     black in light mode (white in dark mode, via the theme text color). */
  .kh-shell .kh-header {
    padding-bottom: 0;
    margin-bottom: 0;
    border-bottom: 0;
  }
  .kh-shell .kh-desk {
    border-top-color: var(--kh-text);
  }
  .kh-shell .kh-desk .kh-folder {
    order: 1;
  }
  .kh-shell .kh-desk .kh-saved-collections {
    order: 2;
  }
}

/* Tablet (768-1199px): header first, then the Study desk (due cards + saved
   collections), then Study tools and Recent. Same trick the phone layout uses:
   main and main-inner stop being boxes so their children can be reordered. */
@media (min-width: 768px) and (max-width: 1199px) {
  .kh-shell > .kh-nav {
    grid-row: 1 / span 4;
  }
  .kh-shell .kh-main,
  .kh-shell .kh-main-inner {
    display: contents;
  }
  .kh-shell .kh-main-inner > div,
  .kh-shell .kh-header,
  .kh-shell .kh-tools-section,
  .kh-shell .kh-recent-section {
    grid-column: 2;
    justify-self: center;
    width: calc(100% - 72px);
    max-width: 808px;
  }
  .kh-shell .kh-main-inner > div {
    order: 0;
    margin-top: 16px;
  }
  .kh-shell .kh-header {
    order: 0;
    margin: 32px 0 28px;
  }
  .kh-shell .kh-desk {
    order: 1;
    border-top: 0;
    align-items: stretch;
  }
  /* Saved collections: bordered box exactly as tall as the Due today folder,
     with the items scrolling top to bottom inside it. contain: size stops the
     list from making the row taller than the folder. */
  .kh-shell .kh-desk .kh-saved-collections {
    contain: size;
    margin-top: 30px; /* start where the folder body starts, under the tab */
    min-height: 230px;
    padding: 18px 16px 16px;
    overflow-y: auto;
    border: 0;
    border-radius: 20px;
    /* Same bluish folder tint as the Due today card. */
    background: linear-gradient(160deg, var(--kh-folder-from) 0%, var(--kh-folder-to) 100%);
    /* Same edge as the Due today folder body: soft outer shadow + light inner highlight. */
    box-shadow: var(--kh-shadow-rest), inset 0 1px 0 rgba(255, 255, 255, 0.6);
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--kh-accent) 35%, transparent) transparent;
  }
  .dark .kh-shell .kh-desk .kh-saved-collections {
    background: var(--kh-surface);
    border: 1px solid var(--kh-border);
    box-shadow: none;
  }
  .kh-shell .kh-tools-section {
    order: 2;
    margin-top: 36px;
    container-type: inline-size;
    container-name: kh-main;
  }
  .kh-shell .kh-recent-section {
    order: 3;
    margin-top: 36px;
    margin-bottom: 56px;
  }
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
  onStartReview: () => void;
  dueCards?: readonly RecallCard[];
  collections?: readonly Collection[];
  recallCards?: readonly RecallCard[];
  blockedNavItems?: readonly WorkspaceNavId[];
  notificationCount?: number;
  onOpenNotifications?: () => void;
  onOpenCollection?: (collection: Collection) => void;
  firstStudyGuideStep?: 'home' | 'source' | 'generate' | null;
  firstStudyGuideKind?: 'quiz' | 'notes' | null;
  onDismissFirstStudyGuide?: () => void;
  onAdvanceFirstStudyGuide?: (kind: 'quiz' | 'notes') => void;
  sidebarCollapse: SidebarCollapse;
  children?: ReactNode;
}

export default function StudyHome({
  history,
  activityDays,
  onNavigate,
  onStartReview,
  dueCards = [],
  collections = [],
  recallCards = [],
  blockedNavItems = [],
  notificationCount = 0,
  onOpenNotifications,
  onOpenCollection,
  firstStudyGuideStep = null,
  firstStudyGuideKind = null,
  onDismissFirstStudyGuide,
  onAdvanceFirstStudyGuide,
  sidebarCollapse,
  children,
}: StudyHomeProps): ReactElement {
  const { collapsed, toggle } = sidebarCollapse;
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
  const navigate = (tab: Parameters<NavigateHandler>[0]) => {
    if (firstStudyGuideStep === 'home' && (tab === 'quiz' || tab === 'summarizer')) {
      onAdvanceFirstStudyGuide?.(tab === 'summarizer' ? 'notes' : 'quiz');
    }
    onNavigate(tab);
  };

  return (
    <div className="kh-shell" data-collapsed={collapsed}>
      <style>{HEADER_CSS}</style>
      <Sidebar items={visibleNavItems} activeId="home" collapsed={collapsed} onToggle={toggle} onNavigate={navigate} />

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

          {firstStudyGuideStep && (
            <section className="kh-first-study-guide" aria-live="polite">
              <div>
                <p className="text-xs font-black uppercase tracking-wide">Your first study set · Step {firstStudyGuideStep === 'home' ? '1' : firstStudyGuideStep === 'source' ? '2' : '3'} of 3</p>
                <p className="mt-1 text-sm leading-relaxed">
                  {firstStudyGuideStep === 'home'
                    ? 'Choose Quiz Builder to make a practice quiz or Summarizer to make study notes. We’ll point out where to add your material and create it.'
                    : firstStudyGuideStep === 'source'
                    ? `Return to ${firstStudyGuideKind === 'notes' ? 'Summarizer' : 'Quiz Builder'} and add a topic or paste your notes in the highlighted Source area.`
                    : `Return to ${firstStudyGuideKind === 'notes' ? 'Summarizer' : 'Quiz Builder'} and use the highlighted button to create your first study set.`}
                </p>
              </div>
              <button type="button" onClick={onDismissFirstStudyGuide} className="kh-first-study-guide-dismiss">
                Skip guide
              </button>
            </section>
          )}

          <StudyToolsGrid
            tools={visibleTools}
            onNavigate={navigate}
            highlightedToolIds={firstStudyGuideStep === 'home' ? ['quiz', 'summarizer'] : firstStudyGuideStep ? [firstStudyGuideKind === 'notes' ? 'summarizer' : 'quiz'] : []}
          />
          <RecentActivity
            items={recent}
            onSelect={setSelected}
            onCreate={() => navigate('quiz')}
            guided={Boolean(firstStudyGuideStep)}
          />
        </div>
      </main>

      <StudyDesk
        dueCards={dueCards}
        collections={collections}
        recallCards={recallCards}
        onNavigate={onNavigate}
        onStartReview={onStartReview}
        onOpenCollection={onOpenCollection}
      />

      {selected && <HistoryDetailModal item={selected} onClose={() => setSelected(null)} />}
      {celebration !== null && <BadgePackReveal milestone={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}