import type { ReactElement } from 'react';
import { Flame } from 'lucide-react';
import { badgeName, earnedMilestone, nextMilestoneFor, prevMilestoneFor, StreakRing } from './BadgeSystem';

interface StreakPillProps {
  /** Current streak shown inside the ring. */
  streak: number;
  /** Lifetime active days — drives tier + progress, same as the badge modal. */
  daysActive: number;
  onOpen: () => void;
}

/** Compact streak micro-widget: progress ring + tier name + days to go. */
export default function StreakPill({ streak, daysActive, onOpen }: StreakPillProps): ReactElement {
  const earned: number = earnedMilestone(daysActive);
  const next: number = nextMilestoneFor(daysActive);
  const prev: number = prevMilestoneFor(daysActive);
  const progress: number = Math.min(Math.max((daysActive - prev) / Math.max(next - prev, 1), 0), 1);
  const remaining: number = Math.max(next - daysActive, 0);

  const tier: string = earned > 0 ? badgeName(earned) : 'Start your streak';
  const sub: string =
    remaining > 0 ? `${remaining} day${remaining === 1 ? '' : 's'} to ${badgeName(next)}` : `${badgeName(next)} ready`;

  return (
    <button
      type="button"
      className="kh-streak"
      onClick={onOpen}
      aria-label={`View streak progress. ${streak} day streak, ${tier}. ${sub}.`}
    >
      <span className="kh-streak-ring" aria-hidden="true">
        <StreakRing progress={progress} size={36} stroke={3} color="currentColor" />
        <span className="kh-streak-count">{streak}</span>
      </span>
      <span className="kh-streak-copy">
        <span className="kh-streak-title">
          <Flame size={12} aria-hidden="true" /> {tier}
        </span>
        <span className="kh-streak-sub">{sub}</span>
      </span>
    </button>
  );
}
