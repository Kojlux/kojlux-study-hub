import type { MouseEvent, ReactElement } from 'react';
import { Activity, AlignLeft, ChevronRight, FileText, HelpCircle } from 'lucide-react';
import type { HistoryItem } from '../../types';
import type { ActivityMeta } from './types';
import { formatRelativeTime } from './utils';

interface RecentActivityProps {
  items: readonly HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onCreate: () => void;
}

interface ActivityRowProps {
  item: HistoryItem;
  onSelect: (item: HistoryItem) => void;
}

/** Quiz -> question mark, summary -> page lines, anything else -> diagram. */
function activityMeta(type: HistoryItem['type']): ActivityMeta {
  if (type === 'quiz') return { label: 'Quiz', icon: HelpCircle, tone: 'indigo' };
  if (type === 'summary') return { label: 'Summary', icon: AlignLeft, tone: 'amber' };
  return { label: 'Diagram', icon: Activity, tone: 'sky' };
}

function ActivityRow({ item, onSelect }: ActivityRowProps): ReactElement {
  const meta: ActivityMeta = activityMeta(item.type);
  const Icon = meta.icon;
  const handleClick = (_event: MouseEvent<HTMLButtonElement>): void => onSelect(item);

  return (
    <article>
      <button type="button" className={`kh-activity kh-tone-${meta.tone}`} onClick={handleClick}>
        <span className="kh-activity-icon" aria-hidden="true">
          <Icon size={16} strokeWidth={2.1} />
        </span>
        <span className="kh-activity-copy">
          <span className="kh-activity-title">{item.title}</span>
          <span className="kh-activity-type">{meta.label}</span>
        </span>
        <time className="kh-activity-time" dateTime={item.createdAt}>
          {formatRelativeTime(item.createdAt)}
        </time>
        <ChevronRight className="kh-activity-chevron" size={16} aria-hidden="true" />
      </button>
    </article>
  );
}

export default function RecentActivity({ items, onSelect, onCreate }: RecentActivityProps): ReactElement {
  const handleCreate = (_event: MouseEvent<HTMLButtonElement>): void => onCreate();

  return (
    <section className="kh-recent-section" aria-labelledby="kh-recent-title">
      <h2 id="kh-recent-title" className="kh-section-title">
        Recent
      </h2>
      <div className="kh-recent-card">
        {items.length > 0 ? (
          <ul className="kh-recent">
            {items.map((item) => (
              <li key={item.id}>
                <ActivityRow item={item} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="kh-empty">
            <span className="kh-empty-icon" aria-hidden="true">
              <FileText size={18} />
            </span>
            <p>Nothing here yet. Build your first quiz or summary to start your streak.</p>
            <button type="button" className="kh-link" onClick={handleCreate}>
              Create your first quiz
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
